"""Dual-channel OTP delivery tests.

Covers the new /api/auth/otp/send behaviour that fires BOTH SMS and email
in parallel when the customer supplies an email as a redundancy channel.

Related change: OTPSendReq now has optional `email` field, send_otp returns
{status, demo_otp, sms:{delivered, id, error}, email:{delivered, id, error}|null}
and inserts a `type='email'` notification (channel='otp') for admins to audit.
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
    # Fall back to /app/frontend/.env (public preview URL lives there)
    path = "/app/frontend/.env"
    try:
        with open(path) as f:
            for line in f:
                line = line.strip()
                if line.startswith("REACT_APP_BACKEND_URL="):
                    return line.split("=", 1)[1].strip().strip('"').strip("'")
    except FileNotFoundError:
        pass
    raise RuntimeError("REACT_APP_BACKEND_URL not set and /app/frontend/.env missing")


BASE_URL = _read_backend_url().rstrip("/")
API = f"{BASE_URL}/api"


# ---------- shared session + admin token ----------
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
    # non-collision-ish 10-digit mobile starting with 9
    return "9" + "".join(random.choices(string.digits, k=9))


def _rand_email() -> str:
    return f"TEST_otp_{int(time.time()*1000)}_{random.randint(1000,9999)}@example.com"


# ---------- 1. health regression ----------
def test_health_still_ok(s):
    r = s.get(f"{API}/")
    assert r.status_code == 200
    j = r.json()
    assert j.get("status") == "ok"
    assert j.get("version") == "2.0"


# ---------- 2. SMS-only when no email supplied ----------
class TestOtpSmsOnly:
    def test_no_email_field(self, s):
        mob = _rand_mobile()
        r = s.post(f"{API}/auth/otp/send", json={"mobile": mob})
        assert r.status_code == 200, r.text
        j = r.json()
        assert j["status"] == "sent"

        # demo_otp is 6-digit numeric string
        otp = j["demo_otp"]
        assert isinstance(otp, str)
        assert len(otp) == 6
        assert otp.isdigit()

        # sms block present and delivered
        assert isinstance(j["sms"], dict)
        assert j["sms"]["delivered"] is True
        assert j["sms"]["id"] is not None

        # email must be null (channel not fired)
        assert j.get("email") is None

    def test_blank_email_string(self, s):
        """Empty string email should still be treated as no-email (SMS only)."""
        mob = _rand_mobile()
        r = s.post(f"{API}/auth/otp/send", json={"mobile": mob, "email": ""})
        assert r.status_code == 200, r.text
        j = r.json()
        assert j["sms"]["delivered"] is True
        assert j.get("email") is None, f"expected email None, got {j.get('email')}"

    def test_email_without_at_sign_is_skipped(self, s):
        """Email lacking '@' is invalid → email channel skipped, SMS still fired."""
        mob = _rand_mobile()
        r = s.post(f"{API}/auth/otp/send", json={"mobile": mob, "email": "not-an-email"})
        assert r.status_code == 200, r.text
        j = r.json()
        assert j["sms"]["delivered"] is True
        assert j.get("email") is None


# ---------- 3. Dual-channel happy path ----------
class TestOtpDualChannel:
    def test_both_channels_delivered(self, s):
        mob = _rand_mobile()
        email = _rand_email()
        r = s.post(f"{API}/auth/otp/send", json={"mobile": mob, "email": email})
        assert r.status_code == 200, r.text
        j = r.json()

        # SMS block delivered
        assert isinstance(j["sms"], dict)
        assert j["sms"]["delivered"] is True
        assert j["sms"]["id"] is not None

        # Email block present and delivered (redirected via TEST_EMAIL_OVERRIDE)
        assert isinstance(j["email"], dict), f"expected email dict, got {j['email']}"
        assert j["email"]["delivered"] is True
        assert isinstance(j["email"]["id"], str)
        assert j["email"]["id"], "email id should be non-empty string"

        # demo_otp shape
        assert re.fullmatch(r"\d{6}", j["demo_otp"])

    def test_notifications_row_for_both_channels(self, s, admin_token):
        """After a dual-channel OTP send, admin's /api/notifications should
        contain BOTH a type='sms' row to the mobile AND a type='email' row
        to the supplied email, with the 6-digit OTP inside the email body."""
        mob = _rand_mobile()
        email = _rand_email()
        r = s.post(f"{API}/auth/otp/send", json={"mobile": mob, "email": email})
        assert r.status_code == 200, r.text
        otp = r.json()["demo_otp"]

        # Allow a moment for inserts to flush.
        time.sleep(0.5)

        n = s.get(f"{API}/notifications", headers=_h(admin_token))
        assert n.status_code == 200
        all_notifs = n.json()

        # SMS to this mobile
        sms_rows = [
            x for x in all_notifs
            if x.get("type") == "sms" and x.get("to") == mob and otp in (x.get("message") or "")
        ]
        assert sms_rows, f"no sms notif found for mobile {mob}"

        # Email to this address
        email_rows = [
            x for x in all_notifs
            if x.get("type") == "email" and x.get("to") == email
        ]
        assert email_rows, f"no email notif found for {email}"
        er = email_rows[0]
        assert "OTP" in (er.get("subject") or "").upper() or "otp" in (er.get("subject") or "").lower()
        assert otp in (er.get("message") or ""), "expected 6-digit OTP inside email body"
        # channel tag set for OTP emails
        assert er.get("channel") == "otp", f"expected channel='otp' on OTP email, got {er.get('channel')}"


# ---------- 4. Validation ----------
class TestOtpMobileValidation:
    @pytest.mark.parametrize("bad_mobile", ["123", "abc123def0", "", "12345678901", "98765a3210"])
    def test_invalid_mobile_returns_400(self, s, bad_mobile):
        r = s.post(f"{API}/auth/otp/send", json={"mobile": bad_mobile})
        assert r.status_code == 400, f"expected 400 for mobile={bad_mobile!r}, got {r.status_code}"


# ---------- 5. Verify with returned demo_otp ----------
class TestOtpVerify:
    def test_verify_success_after_dual_send(self, s):
        mob = _rand_mobile()
        email = _rand_email()
        r = s.post(f"{API}/auth/otp/send", json={"mobile": mob, "email": email})
        assert r.status_code == 200
        otp = r.json()["demo_otp"]

        v = s.post(f"{API}/auth/otp/verify", json={"mobile": mob, "otp": otp})
        assert v.status_code == 200, v.text
        assert v.json()["status"] == "verified"

    def test_verify_wrong_otp_401(self, s):
        mob = _rand_mobile()
        r = s.post(f"{API}/auth/otp/send", json={"mobile": mob})
        assert r.status_code == 200

        v = s.post(f"{API}/auth/otp/verify", json={"mobile": mob, "otp": "000000"})
        assert v.status_code == 401


# ---------- 6. Regression: offices / target_email mapping ----------
class TestOfficesMapping:
    """Verify rebrand mailbox change: 670100 -> julieanderson..., 940000 -> vishalmed..., admin -> admin@oursamadhaan.com"""

    def test_office_mailbox_addresses(self, s):
        r = s.get(f"{API}/offices")
        assert r.status_code == 200
        by_code = {o["code"]: o for o in r.json()}
        assert by_code["670100"]["email"] == "julieanderson123j@gmail.com"
        assert by_code["940000"]["email"] == "vishalmed92@gmail.com"
        assert by_code["admin"]["email"] == "admin@oursamadhaan.com"

    def test_ticket_target_email_uses_new_mailbox(self, s):
        r = s.post(f"{API}/tickets", json={
            "mobile": "9876543210",
            "customer_type": "existing",
            "policy_no": "67010023456789012001",
            "service_type": "claims",
            "parsed_text": "Regression check for target_email rebrand.",
            "language": "en",
        })
        assert r.status_code == 200, r.text
        t = r.json()
        assert t["office_code"] == "670100"
        assert t["target_email"] == "julieanderson123j@gmail.com"


# ---------- 7. Regression: office login ----------
class TestOfficeLoginRegression:
    def test_admin_login(self, s):
        r = s.post(f"{API}/auth/office/login", json={"username": "admin", "password": "admin"})
        assert r.status_code == 200
        assert "token" in r.json()

    def test_670100_login(self, s):
        r = s.post(f"{API}/auth/office/login", json={"username": "670100", "password": "670100"})
        assert r.status_code == 200
        assert r.json()["office"]["code"] == "670100"


# ---------- 8. Regression: escalate-auth still works ----------
class TestEscalateAuthRegression:
    def test_escalate_auth_returns_delivery_block(self, s):
        # Login as 670100
        lo = s.post(f"{API}/auth/office/login", json={"username": "670100", "password": "670100"})
        assert lo.status_code == 200
        tok = lo.json()["token"]

        # Create a fresh ticket for policy 670100
        c = s.post(f"{API}/tickets", json={
            "mobile": "9876543210",
            "customer_type": "existing",
            "policy_no": "67010023456789012001",
            "service_type": "policy",
            "parsed_text": "Need renewal help — regression.",
            "language": "en",
        })
        assert c.status_code == 200
        pk = c.json()["id"]

        r = s.post(f"{API}/tickets/{pk}/escalate-auth", headers=_h(tok))
        assert r.status_code == 200, r.text
        j = r.json()
        assert j["status"] == "escalated"
        # delivered may be True (direct or via fallback) — request contract expects delivered==True in this env
        assert "delivered" in j
        assert "email_id" in j
        assert "fallback_used" in j
        assert isinstance(j["fallback_used"], bool)
