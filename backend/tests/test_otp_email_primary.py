"""Iteration 4 — Email-PRIMARY OTP delivery tests.

Verifies the SECOND update to /api/auth/otp/send:
  * email is now a REQUIRED field (missing → 422 pydantic)
  * empty / no-"@" / no-TLD email → 400 "A valid email is required"
  * SMS is OPT-IN via new bool `send_sms` (default False)
  * Happy path with email only returns email:{delivered,id,attempts>=1}, sms:null
  * Happy path with send_sms=true returns both email + sms blocks
  * Persisted notification: type='email' with channel='otp', subject contains 'OTP',
    message contains the 6-digit code, provider_id present, attempts==1 (no retry)
  * No SMS notification row for email-only sends
  * /api/auth/otp/verify still works end-to-end
  * Regression: office login, ticket create (target_email), escalate-auth
"""
from __future__ import annotations

import os
import random
import re
import string
import time

import pytest
import requests


def _read_backend_url() -> str:
    v = os.environ.get("REACT_APP_BACKEND_URL")
    if v:
        return v
    path = "/app/frontend/.env"
    try:
        with open(path) as f:
            for line in f:
                line = line.strip()
                if line.startswith("REACT_APP_BACKEND_URL="):
                    return line.split("=", 1)[1].strip().strip('"').strip("'")
    except FileNotFoundError:
        pass
    raise RuntimeError("REACT_APP_BACKEND_URL not set")


BASE_URL = _read_backend_url().rstrip("/")
API = f"{BASE_URL}/api"


# ---------- shared session ----------
@pytest.fixture(scope="module")
def s() -> requests.Session:
    sess = requests.Session()
    sess.headers.update({"Content-Type": "application/json"})
    return sess


@pytest.fixture(scope="module")
def admin_token(s):
    r = s.post(f"{API}/auth/office/login", json={"username": "admin", "password": "admin"})
    assert r.status_code == 200, r.text
    return r.json()["token"]


def _h(tok: str) -> dict:
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


def _rand_mobile() -> str:
    return "9" + "".join(random.choices(string.digits, k=9))


def _rand_email(tag: str = "otp") -> str:
    return f"TEST_{tag}_{int(time.time()*1000)}_{random.randint(1000,9999)}@example.com"


# ---------- 1. Health ----------
def test_health_ok(s):
    r = s.get(f"{API}/")
    assert r.status_code == 200
    j = r.json()
    assert j.get("status") == "ok"
    assert j.get("version") == "2.0"


# ---------- 2. Pydantic schema validation (422 on missing required fields) ----------
class TestOtpSchema422:
    def test_missing_email_field_returns_422(self, s):
        r = s.post(f"{API}/auth/otp/send", json={"mobile": _rand_mobile()})
        assert r.status_code == 422, f"expected 422, got {r.status_code}: {r.text}"
        body = r.json()
        # Pydantic v2 shape: detail is a list of {type, loc, msg, ...}
        assert isinstance(body.get("detail"), list)
        # Confirm the missing field is 'email'
        locs = [tuple(item.get("loc", [])) for item in body["detail"]]
        assert any("email" in loc for loc in locs), f"detail did not mention email: {body}"

    def test_missing_mobile_field_returns_422(self, s):
        r = s.post(f"{API}/auth/otp/send", json={"email": "someone@example.com"})
        assert r.status_code == 422, r.text
        body = r.json()
        locs = [tuple(item.get("loc", [])) for item in body["detail"]]
        assert any("mobile" in loc for loc in locs)


# ---------- 3. Email format validation (400) ----------
class TestOtpEmailValidation:
    def test_blank_email_400(self, s):
        r = s.post(
            f"{API}/auth/otp/send",
            json={"mobile": _rand_mobile(), "email": ""},
        )
        assert r.status_code == 400, r.text
        assert "email" in r.json()["detail"].lower()

    def test_email_without_at_400(self, s):
        r = s.post(
            f"{API}/auth/otp/send",
            json={"mobile": _rand_mobile(), "email": "notanemail"},
        )
        assert r.status_code == 400, r.text
        assert "email" in r.json()["detail"].lower()

    def test_email_without_tld_400(self, s):
        """`a@b` — has @ but no dot in the domain part."""
        r = s.post(
            f"{API}/auth/otp/send",
            json={"mobile": _rand_mobile(), "email": "a@b"},
        )
        assert r.status_code == 400, r.text

    def test_email_with_space_400(self, s):
        """`a b@c.com` — space in local part should be rejected."""
        r = s.post(
            f"{API}/auth/otp/send",
            json={"mobile": _rand_mobile(), "email": "a b@c.com"},
        )
        assert r.status_code == 400, (
            f"expected 400 for space-in-email, got {r.status_code}: {r.text}"
        )


# ---------- 4. Mobile validation stays 400 ----------
class TestOtpMobile400:
    @pytest.mark.parametrize("bad", ["123", "abc123def0", "12345678901", "98765a3210"])
    def test_invalid_mobile_returns_400(self, s, bad):
        # Supply a valid email so we get past 422 and hit the mobile branch
        r = s.post(
            f"{API}/auth/otp/send",
            json={"mobile": bad, "email": "ok@example.com"},
        )
        assert r.status_code == 400, f"mobile={bad!r} expected 400, got {r.status_code}"


# ---------- 5. Happy path — email-only ----------
class TestOtpEmailOnly:
    def test_email_only_response_shape(self, s):
        mob = _rand_mobile()
        email = _rand_email()
        r = s.post(f"{API}/auth/otp/send", json={"mobile": mob, "email": email})
        assert r.status_code == 200, r.text
        j = r.json()

        assert j["status"] == "sent"
        assert re.fullmatch(r"\d{6}", j["demo_otp"])

        # SMS MUST be null (opt-in default False)
        assert j["sms"] is None, f"expected sms=null when send_sms omitted, got {j['sms']}"

        # Email block delivered, has provider id, attempts>=1
        em = j["email"]
        assert isinstance(em, dict)
        assert em["delivered"] is True
        assert isinstance(em["id"], str) and em["id"]
        assert em["error"] is None
        assert isinstance(em["attempts"], int) and em["attempts"] >= 1
        # Happy-path Resend acceptance → no retry needed
        assert em["attempts"] == 1

    def test_email_only_send_sms_false_explicit(self, s):
        """Explicit send_sms=False should behave identically (sms=null)."""
        mob = _rand_mobile()
        email = _rand_email()
        r = s.post(
            f"{API}/auth/otp/send",
            json={"mobile": mob, "email": email, "send_sms": False},
        )
        assert r.status_code == 200
        j = r.json()
        assert j["sms"] is None
        assert j["email"]["delivered"] is True


# ---------- 6. Happy path — with SMS opt-in ----------
class TestOtpDualOptIn:
    def test_send_sms_true_populates_both_channels(self, s):
        mob = _rand_mobile()
        email = _rand_email("dual")
        r = s.post(
            f"{API}/auth/otp/send",
            json={"mobile": mob, "email": email, "send_sms": True},
        )
        assert r.status_code == 200, r.text
        j = r.json()

        em = j["email"]
        assert em["delivered"] is True and isinstance(em["id"], str)

        sm = j["sms"]
        assert isinstance(sm, dict), f"expected sms dict when send_sms=true, got {sm}"
        # sms dispatch happened. delivered may be False when Twilio trial daily
        # cap is exceeded — dispatch attempt still constitutes correct behaviour.
        assert "delivered" in sm and "id" in sm and "error" in sm
        if not sm["delivered"]:
            # Only tolerate provider-side rate limits (429) — any other cause is a bug
            err = (sm.get("error") or "").lower()
            assert "429" in err or "limit" in err or "trial" in err, (
                f"unexpected SMS failure reason: {sm.get('error')!r}"
            )


# ---------- 7. Notifications persistence ----------
class TestOtpNotificationsPersistence:
    def test_email_only_persists_email_row_no_sms_row(self, s, admin_token):
        mob = _rand_mobile()
        email = _rand_email("persist")
        r = s.post(f"{API}/auth/otp/send", json={"mobile": mob, "email": email})
        assert r.status_code == 200
        otp = r.json()["demo_otp"]
        provider_id_resp = r.json()["email"]["id"]

        # Give the async insert a moment
        time.sleep(0.6)

        n = s.get(f"{API}/notifications", headers=_h(admin_token))
        assert n.status_code == 200
        rows = n.json()

        # Email row present with channel=otp, subject contains OTP, code in body
        email_rows = [
            x for x in rows
            if x.get("type") == "email" and x.get("to") == email
        ]
        assert email_rows, f"no email notif for {email}"
        er = email_rows[0]
        assert er.get("channel") == "otp", f"channel expected 'otp', got {er.get('channel')}"
        subj = (er.get("subject") or "")
        assert "OTP" in subj.upper(), f"subject missing OTP tag: {subj!r}"
        assert otp in (er.get("message") or ""), "expected 6-digit OTP inside email body"
        # provider_id present (Resend accepted the message)
        assert er.get("provider_id"), "expected provider_id from Resend on notification row"
        # attempts persisted, happy path = 1
        assert er.get("attempts") == 1, f"attempts expected 1, got {er.get('attempts')}"
        # provider_id in response and DB should match
        assert er.get("provider_id") == provider_id_resp

        # No SMS row for this mobile from THIS request
        sms_rows = [
            x for x in rows
            if x.get("type") == "sms" and x.get("to") == mob and otp in (x.get("message") or "")
        ]
        assert not sms_rows, (
            f"expected NO sms notif for mobile {mob} in email-only send, "
            f"found: {sms_rows}"
        )

    def test_send_sms_true_persists_both_rows(self, s, admin_token):
        mob = _rand_mobile()
        email = _rand_email("both")
        r = s.post(
            f"{API}/auth/otp/send",
            json={"mobile": mob, "email": email, "send_sms": True},
        )
        assert r.status_code == 200
        otp = r.json()["demo_otp"]

        time.sleep(0.6)
        rows = s.get(f"{API}/notifications", headers=_h(admin_token)).json()

        email_rows = [x for x in rows if x.get("type") == "email" and x.get("to") == email]
        assert email_rows, "email row missing for dual send"
        assert email_rows[0].get("channel") == "otp"

        sms_rows = [
            x for x in rows
            if x.get("type") == "sms" and x.get("to") == mob and otp in (x.get("message") or "")
        ]
        assert sms_rows, "sms row missing for send_sms=true"
        # SMS notification persistence expected regardless of Twilio delivery
        # (delivered may be False due to daily trial cap)


# ---------- 8. Verify still works ----------
class TestOtpVerify:
    def test_verify_success(self, s):
        mob = _rand_mobile()
        email = _rand_email("verify")
        r = s.post(f"{API}/auth/otp/send", json={"mobile": mob, "email": email})
        assert r.status_code == 200
        otp = r.json()["demo_otp"]

        v = s.post(f"{API}/auth/otp/verify", json={"mobile": mob, "otp": otp})
        assert v.status_code == 200, v.text
        assert v.json()["status"] == "verified"

    def test_verify_wrong_otp_401(self, s):
        mob = _rand_mobile()
        email = _rand_email("wrong")
        r = s.post(f"{API}/auth/otp/send", json={"mobile": mob, "email": email})
        assert r.status_code == 200

        v = s.post(f"{API}/auth/otp/verify", json={"mobile": mob, "otp": "000000"})
        assert v.status_code == 401


# ---------- 9. Regression: offices mailbox mapping ----------
class TestOfficesMappingRegression:
    def test_office_mailbox_addresses(self, s):
        r = s.get(f"{API}/offices")
        assert r.status_code == 200
        by_code = {o["code"]: o for o in r.json()}
        assert by_code["670100"]["email"] == "julieanderson123j@gmail.com"
        assert by_code["940000"]["email"] == "vishalmed92@gmail.com"
        assert by_code["admin"]["email"] == "admin@oursamadhaan.com"


# ---------- 10. Regression: office login ----------
class TestOfficeLoginRegression:
    def test_admin_login(self, s):
        r = s.post(f"{API}/auth/office/login", json={"username": "admin", "password": "admin"})
        assert r.status_code == 200
        j = r.json()
        assert "token" in j
        assert j["office"]["code"] == "admin"

    def test_office_login_670100(self, s):
        r = s.post(f"{API}/auth/office/login", json={"username": "670100", "password": "670100"})
        assert r.status_code == 200
        assert r.json()["office"]["code"] == "670100"

    def test_office_login_bad_password_401(self, s):
        r = s.post(f"{API}/auth/office/login", json={"username": "admin", "password": "wrong"})
        assert r.status_code == 401


# ---------- 11. Regression: ticket create + target_email ----------
class TestTicketCreateRegression:
    def test_ticket_create_670100_policy_target_email(self, s):
        r = s.post(f"{API}/tickets", json={
            "mobile": "9876543210",
            "customer_type": "existing",
            "policy_no": "67010023456789012001",
            "service_type": "policy",
            "parsed_text": "Regression check: policy service_type routes to office mailbox.",
            "language": "en",
        })
        assert r.status_code == 200, r.text
        t = r.json()
        assert t["office_code"] == "670100"
        # Policy service_type -> office.email
        assert t["target_email"] == "julieanderson123j@gmail.com"
        assert t["ticket_id"].startswith("9876543210_")
        assert t["status"] == "Open"
        assert t["escalated"] is False

    def test_ticket_create_claims_uses_claims_email(self, s):
        r = s.post(f"{API}/tickets", json={
            "mobile": "9876543210",
            "customer_type": "existing",
            "policy_no": "67010023456789012001",
            "service_type": "claims",
            "parsed_text": "Regression check: claims routing.",
            "language": "en",
        })
        assert r.status_code == 200
        t = r.json()
        # Rebranded — claims_email now same gmail mailbox as office.email
        assert t["target_email"] == "julieanderson123j@gmail.com"


# ---------- 12. Regression: escalate-auth ----------
class TestEscalateAuthRegression:
    def test_escalate_auth_end_to_end(self, s):
        lo = s.post(f"{API}/auth/office/login", json={"username": "670100", "password": "670100"})
        assert lo.status_code == 200
        tok = lo.json()["token"]

        c = s.post(f"{API}/tickets", json={
            "mobile": "9876543210",
            "customer_type": "existing",
            "policy_no": "67010023456789012001",
            "service_type": "grievance",
            "parsed_text": "Iteration4 escalate-auth regression.",
            "language": "en",
        })
        assert c.status_code == 200
        pk = c.json()["id"]

        r = s.post(f"{API}/tickets/{pk}/escalate-auth", headers=_h(tok))
        assert r.status_code == 200, r.text
        j = r.json()
        assert j["status"] == "escalated"
        assert j["delivered"] is True, f"expected delivered=True, got {j}"
        assert isinstance(j.get("email_id"), str) and j["email_id"]
        assert j["to"] == "manjula.vishal@oursamadhaan.com"
        assert isinstance(j["fallback_used"], bool)


# ---------- 13. Regression: /api/inbox admin ----------
class TestInboxRegression:
    def test_inbox_admin_returns_email_rows(self, s, admin_token):
        # Seed one ticket to guarantee at least one inbox row exists
        c = s.post(f"{API}/tickets", json={
            "mobile": "9876543210",
            "customer_type": "existing",
            "policy_no": "67010023456789012001",
            "service_type": "policy",
            "parsed_text": "Inbox regression seed.",
            "language": "en",
        })
        assert c.status_code == 200
        time.sleep(0.4)

        r = s.get(f"{API}/inbox", headers=_h(admin_token))
        assert r.status_code == 200
        rows = r.json()
        assert isinstance(rows, list)
        assert len(rows) > 0
        assert all(row.get("type") == "email" for row in rows)
