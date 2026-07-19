"""Iteration 5 — Gmail SMTP-first email delivery + new Twilio creds.

Verifies:
  * Email validation regex change: whitespace REJECTED (400); `a@b.c` ACCEPTED (200).
  * SMTP-primary delivery: provider_id starts with '<' and contains '@oursamadhaan.com'
    for ANY recipient (vishalmed92@gmail.com, julieanderson123j@gmail.com).
  * SMS opt-in returns Twilio SID starting with 'SM' when send_sms=true.
  * Notifications persist: email row with channel='otp' and provider_id;
    sms row when send_sms=true.
  * OTP verify success/fail regression.
  * Full regression: office login, tickets scope isolation, ticket create for
    670100 → target_email=julieanderson123j@gmail.com (delivered via SMTP),
    /escalate-auth returns delivered=true + email_id, /inbox, /analytics/summary,
    /tickets/export.csv (text/csv).
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
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.strip().startswith("REACT_APP_BACKEND_URL="):
                return line.split("=", 1)[1].strip().strip('"').strip("'")
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


@pytest.fixture(scope="module")
def office_670100_token(s):
    r = s.post(f"{API}/auth/office/login", json={"username": "670100", "password": "670100"})
    assert r.status_code == 200, r.text
    return r.json()["token"]


def _h(tok: str) -> dict:
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


def _rand_mobile() -> str:
    return "9" + "".join(random.choices(string.digits, k=9))


def _rand_email(tag: str = "iter5") -> str:
    return f"TEST_{tag}_{int(time.time()*1000)}_{random.randint(1000,9999)}@example.com"


# ---------- 1. Health ----------
def test_health(s):
    r = s.get(f"{API}/")
    assert r.status_code == 200
    j = r.json()
    assert j["status"] == "ok"


# ---------- 2. Email validation regex (post whitespace-fix) ----------
class TestEmailValidationRegex:
    def test_missing_email_422(self, s):
        r = s.post(f"{API}/auth/otp/send", json={"mobile": _rand_mobile()})
        assert r.status_code == 422, r.text

    def test_blank_email_400(self, s):
        r = s.post(f"{API}/auth/otp/send", json={"mobile": _rand_mobile(), "email": ""})
        assert r.status_code == 400, r.text

    def test_whitespace_in_local_part_400(self, s):
        """Iteration_4 bug — must be fixed by the stricter regex."""
        r = s.post(f"{API}/auth/otp/send", json={"mobile": _rand_mobile(), "email": "a b@c.com"})
        assert r.status_code == 400, (
            f"whitespace-in-email regression: expected 400, got {r.status_code}: {r.text}"
        )

    def test_email_without_tld_dot_400(self, s):
        r = s.post(f"{API}/auth/otp/send", json={"mobile": _rand_mobile(), "email": "a@b"})
        assert r.status_code == 400, r.text

    def test_minimal_valid_email_200(self, s):
        """`a@b.c` — regex `^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$` accepts it."""
        r = s.post(f"{API}/auth/otp/send", json={"mobile": _rand_mobile(), "email": "a@b.c"})
        assert r.status_code == 200, r.text


# ---------- 3. SMTP-primary email delivery ----------
class TestSmtpPrimaryDelivery:
    def _assert_smtp_shape(self, email_block: dict):
        """SMTP message-id looks like <...@oursamadhaan.com>."""
        assert email_block["delivered"] is True, email_block
        pid = email_block["id"]
        assert isinstance(pid, str) and pid, f"provider_id missing: {email_block}"
        assert pid.startswith("<"), f"expected Message-ID starting with '<', got {pid!r}"
        assert "@oursamadhaan.com" in pid, (
            f"expected SMTP message-id domain @oursamadhaan.com, got {pid!r}"
        )
        assert email_block["error"] is None
        assert isinstance(email_block["attempts"], int) and email_block["attempts"] >= 1

    def test_email_only_no_sms_block(self, s):
        r = s.post(f"{API}/auth/otp/send", json={
            "mobile": _rand_mobile(), "email": _rand_email("email_only"),
        })
        assert r.status_code == 200, r.text
        j = r.json()
        assert j["status"] == "sent"
        assert re.fullmatch(r"\d{6}", j["demo_otp"])
        assert j["sms"] is None, f"sms MUST be null when send_sms omitted: {j['sms']}"
        self._assert_smtp_shape(j["email"])

    def test_delivery_to_vishalmed92_gmail(self, s):
        r = s.post(f"{API}/auth/otp/send", json={
            "mobile": _rand_mobile(), "email": "vishalmed92@gmail.com",
        })
        assert r.status_code == 200, r.text
        self._assert_smtp_shape(r.json()["email"])

    def test_delivery_to_julieanderson123j_gmail(self, s):
        r = s.post(f"{API}/auth/otp/send", json={
            "mobile": _rand_mobile(), "email": "julieanderson123j@gmail.com",
        })
        assert r.status_code == 200, r.text
        self._assert_smtp_shape(r.json()["email"])


# ---------- 4. SMS opt-in with new Twilio creds ----------
class TestSmsOptIn:
    def test_send_sms_true_returns_SM_sid(self, s):
        mob = _rand_mobile()
        r = s.post(f"{API}/auth/otp/send", json={
            "mobile": mob, "email": _rand_email("sms_optin"), "send_sms": True,
        })
        assert r.status_code == 200, r.text
        j = r.json()

        em = j["email"]
        assert em["delivered"] is True

        sm = j["sms"]
        assert isinstance(sm, dict), f"expected sms dict when send_sms=true: {sm}"
        assert sm["delivered"] is True, f"expected SMS delivered=true with new Twilio creds: {sm}"
        assert isinstance(sm["id"], str) and sm["id"].startswith("SM"), (
            f"expected Twilio SID prefix 'SM', got {sm['id']!r}"
        )
        assert sm["error"] is None


# ---------- 5. Notifications persistence ----------
class TestNotificationsPersistence:
    def test_email_notif_has_channel_otp_and_provider_id(self, s, admin_token):
        mob = _rand_mobile()
        email = _rand_email("persist_smtp")
        r = s.post(f"{API}/auth/otp/send", json={"mobile": mob, "email": email})
        assert r.status_code == 200
        provider_id_resp = r.json()["email"]["id"]

        time.sleep(0.6)
        n = s.get(f"{API}/notifications", headers=_h(admin_token))
        assert n.status_code == 200
        rows = n.json()

        email_rows = [x for x in rows if x.get("type") == "email" and x.get("to") == email]
        assert email_rows, f"no email notif row for {email}"
        er = email_rows[0]
        assert er.get("channel") == "otp"
        assert er.get("provider_id") == provider_id_resp
        assert er.get("delivered") is True
        # Confirm SMTP message-id shape persisted
        assert er["provider_id"].startswith("<") and "@oursamadhaan.com" in er["provider_id"]

    def test_send_sms_true_persists_sms_row(self, s, admin_token):
        mob = _rand_mobile()
        r = s.post(f"{API}/auth/otp/send", json={
            "mobile": mob, "email": _rand_email("both_smtp"), "send_sms": True,
        })
        assert r.status_code == 200
        otp = r.json()["demo_otp"]

        time.sleep(0.6)
        rows = s.get(f"{API}/notifications", headers=_h(admin_token)).json()

        sms_rows = [
            x for x in rows
            if x.get("type") == "sms" and x.get("to") == mob and otp in (x.get("message") or "")
        ]
        assert sms_rows, f"expected sms notif row for {mob}"
        sr = sms_rows[0]
        assert sr.get("delivered") is True
        assert isinstance(sr.get("provider_id"), str) and sr["provider_id"].startswith("SM")


# ---------- 6. OTP verify ----------
class TestOtpVerify:
    def test_verify_success(self, s):
        mob = _rand_mobile()
        r = s.post(f"{API}/auth/otp/send", json={"mobile": mob, "email": _rand_email("v_ok")})
        assert r.status_code == 200
        otp = r.json()["demo_otp"]
        v = s.post(f"{API}/auth/otp/verify", json={"mobile": mob, "otp": otp})
        assert v.status_code == 200
        assert v.json()["status"] == "verified"

    def test_verify_wrong_otp_401(self, s):
        mob = _rand_mobile()
        r = s.post(f"{API}/auth/otp/send", json={"mobile": mob, "email": _rand_email("v_bad")})
        assert r.status_code == 200
        v = s.post(f"{API}/auth/otp/verify", json={"mobile": mob, "otp": "000000"})
        assert v.status_code == 401


# ---------- 7. Office login regression + tickets scope isolation ----------
class TestOfficeLoginAndScope:
    def test_admin_login_returns_jwt(self, s):
        r = s.post(f"{API}/auth/office/login", json={"username": "admin", "password": "admin"})
        assert r.status_code == 200
        j = r.json()
        assert isinstance(j.get("token"), str) and j["token"]
        assert j["office"]["code"] == "admin"

    def test_office_670100_login_returns_jwt(self, s):
        r = s.post(f"{API}/auth/office/login", json={"username": "670100", "password": "670100"})
        assert r.status_code == 200
        j = r.json()
        assert isinstance(j.get("token"), str) and j["token"]
        assert j["office"]["code"] == "670100"

    def test_tickets_scope_isolation(self, s, admin_token, office_670100_token):
        # Seed a ticket under 940000 policy
        c = s.post(f"{API}/tickets", json={
            "mobile": "9988776655",
            "customer_type": "existing",
            "policy_no": "94000012345678901001",
            "service_type": "policy",
            "parsed_text": "iter5 scope isolation seed 940000",
            "language": "en",
        })
        assert c.status_code == 200
        assert c.json()["office_code"] == "940000"

        # 670100 must NOT see 940000 tickets
        r = s.get(f"{API}/tickets?limit=200", headers=_h(office_670100_token))
        assert r.status_code == 200
        items = r.json()["items"]
        assert all(t["office_code"] == "670100" for t in items), (
            "670100 leaked non-scoped tickets: " +
            ", ".join(sorted({t["office_code"] for t in items if t["office_code"] != "670100"}))
        )

        # Admin sees both
        r = s.get(f"{API}/tickets?limit=200", headers=_h(admin_token))
        assert r.status_code == 200
        codes = {t["office_code"] for t in r.json()["items"]}
        assert "670100" in codes and "940000" in codes


# ---------- 8. Ticket create for 670100 → SMTP-delivered notif ----------
class TestTicketCreateRoutingAndDelivery:
    def test_670100_ticket_target_email_and_smtp_delivery(self, s, admin_token):
        c = s.post(f"{API}/tickets", json={
            "mobile": "9876543210",
            "customer_type": "existing",
            "policy_no": "67010023456789012001",
            "service_type": "policy",
            "parsed_text": "iter5 ticket target_email regression",
            "language": "en",
        })
        assert c.status_code == 200, c.text
        t = c.json()
        assert t["office_code"] == "670100"
        assert t["target_email"] == "julieanderson123j@gmail.com"
        tid = t["ticket_id"]

        time.sleep(0.6)
        rows = s.get(f"{API}/notifications", headers=_h(admin_token),
                     params={"ticket_id": tid}).json()
        email_rows = [x for x in rows if x.get("type") == "email"]
        assert email_rows, f"no email notif for ticket {tid}"
        er = email_rows[0]
        assert er.get("to") == "julieanderson123j@gmail.com"
        assert er.get("delivered") is True, f"expected SMTP-delivered mock email: {er}"
        pid = er.get("provider_id") or ""
        assert pid.startswith("<") and "@oursamadhaan.com" in pid, (
            f"expected SMTP message-id, got {pid!r}"
        )


# ---------- 9. /escalate-auth regression ----------
class TestEscalateAuthRegression:
    def test_escalate_auth_delivered_true(self, s, office_670100_token):
        c = s.post(f"{API}/tickets", json={
            "mobile": "9876543210",
            "customer_type": "existing",
            "policy_no": "67010023456789012001",
            "service_type": "grievance",
            "parsed_text": "iter5 escalate-auth regression",
            "language": "en",
        })
        assert c.status_code == 200
        pk = c.json()["id"]

        r = s.post(f"{API}/tickets/{pk}/escalate-auth", headers=_h(office_670100_token))
        assert r.status_code == 200, r.text
        j = r.json()
        assert j["status"] == "escalated"
        assert j["delivered"] is True, f"expected delivered=true via SMTP: {j}"
        assert isinstance(j.get("email_id"), str) and j["email_id"]
        assert j["to"] == "manjula.vishal@oursamadhaan.com"
        # fallback_used may be False now (SMTP directly delivers) — either bool is OK
        assert isinstance(j["fallback_used"], bool)


# ---------- 10. /inbox scoped to office ----------
class TestInboxScope:
    def test_inbox_670100_scoped_to_office_mailbox(self, s, office_670100_token):
        # Ensure at least one email exists in scope
        s.post(f"{API}/tickets", json={
            "mobile": "9876543210",
            "customer_type": "existing",
            "policy_no": "67010023456789012001",
            "service_type": "policy",
            "parsed_text": "iter5 inbox seed",
            "language": "en",
        })
        time.sleep(0.4)

        r = s.get(f"{API}/inbox", headers=_h(office_670100_token))
        assert r.status_code == 200
        rows = r.json()
        assert isinstance(rows, list) and rows
        allowed = {"julieanderson123j@gmail.com"}
        for row in rows:
            assert row.get("type") == "email"
            assert row.get("to") in allowed, (
                f"inbox row leaked outside office mailbox scope: to={row.get('to')}"
            )


# ---------- 11. /analytics/summary shape ----------
class TestAnalyticsShape:
    def test_analytics_summary_shape(self, s, admin_token):
        r = s.get(f"{API}/analytics/summary", headers=_h(admin_token))
        assert r.status_code == 200, r.text
        j = r.json()
        # Required top-level keys
        for k in ["total", "by_status", "by_service", "by_priority", "by_office",
                  "avg_resolution_hours", "trend_7d"]:
            assert k in j, f"missing analytics key: {k}"
        # Types
        assert isinstance(j["total"], int)
        assert isinstance(j["by_status"], dict)
        assert isinstance(j["by_service"], dict)
        assert isinstance(j["by_priority"], dict)
        assert isinstance(j["by_office"], dict)
        assert isinstance(j["avg_resolution_hours"], (int, float))
        assert isinstance(j["trend_7d"], list) and len(j["trend_7d"]) == 7
        # trend items have day + count
        for d in j["trend_7d"]:
            assert "day" in d and "count" in d
            assert isinstance(d["count"], int)


# ---------- 12. /tickets/export.csv ----------
class TestCsvExport:
    def test_export_csv_content_type(self, s, admin_token):
        r = s.get(f"{API}/tickets/export.csv", headers=_h(admin_token))
        assert r.status_code == 200, r.text
        ct = r.headers.get("content-type", "")
        assert "text/csv" in ct.lower(), f"expected text/csv content-type, got {ct}"
        # First line should be the header row
        body = r.text
        assert body.splitlines()[0].startswith("created_at,ticket_id,mobile")
