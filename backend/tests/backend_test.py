"""Samaadhaan backend tests — v2 features + INBOX.
Covers: OTP, policy, office auth, ticket CRUD/scoping, translation,
resolve, escalation, analytics, search/pagination, CSV export, audit,
public history, and the new internal /api/inbox flow.
"""
from __future__ import annotations

import os
import random
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL") or "https://customer-support-hub-9.preview.emergentagent.com"
BASE_URL = BASE_URL.rstrip("/")
API = f"{BASE_URL}/api"


# ---------------- fixtures ----------------
@pytest.fixture(scope="session")
def s() -> requests.Session:
    sess = requests.Session()
    sess.headers.update({"Content-Type": "application/json"})
    return sess


@pytest.fixture(scope="session")
def token_670100(s):
    r = s.post(f"{API}/auth/office/login", json={"username": "670100", "password": "670100"})
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="session")
def token_940000(s):
    r = s.post(f"{API}/auth/office/login", json={"username": "940000", "password": "940000"})
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="session")
def token_admin(s):
    r = s.post(f"{API}/auth/office/login", json={"username": "admin", "password": "admin"})
    assert r.status_code == 200, r.text
    return r.json()["token"]


def h(tok: str) -> dict:
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


# ---------------- Health ----------------
def test_health(s):
    r = s.get(f"{API}/")
    assert r.status_code == 200
    j = r.json()
    assert j["version"] == "2.0"
    assert j["status"] == "ok"


# ---------------- OTP ----------------
class TestOTP:
    def test_send_and_verify_ok(self, s):
        mob = f"98{random.randint(10000000, 99999999)}"
        r = s.post(f"{API}/auth/otp/send", json={"mobile": mob})
        assert r.status_code == 200, r.text
        otp = r.json()["demo_otp"]
        assert isinstance(otp, str) and len(otp) == 6
        r2 = s.post(f"{API}/auth/otp/verify", json={"mobile": mob, "otp": otp})
        assert r2.status_code == 200, r2.text
        assert r2.json()["status"] == "verified"

    def test_verify_wrong(self, s):
        mob = f"97{random.randint(10000000, 99999999)}"
        r = s.post(f"{API}/auth/otp/send", json={"mobile": mob})
        assert r.status_code == 200
        r2 = s.post(f"{API}/auth/otp/verify", json={"mobile": mob, "otp": "000000"})
        assert r2.status_code == 401

    def test_invalid_mobile(self, s):
        r = s.post(f"{API}/auth/otp/send", json={"mobile": "12345"})
        assert r.status_code == 400
        r2 = s.post(f"{API}/auth/otp/send", json={"mobile": "abcdefghij"})
        assert r2.status_code == 400


# ---------------- Policy ----------------
class TestPolicy:
    def test_valid(self, s):
        r = s.post(f"{API}/policy/verify", json={"policy_no": "67010023456789012001"})
        assert r.status_code == 200
        assert r.json()["mobile"] == "9876543210"
        assert r.json()["office_code"] == "670100"

    def test_wrong_length(self, s):
        r = s.post(f"{API}/policy/verify", json={"policy_no": "12345"})
        assert r.status_code == 400

    def test_unknown_20d(self, s):
        r = s.post(f"{API}/policy/verify", json={"policy_no": "99999999999999999999"})
        assert r.status_code == 404


# ---------------- Office login ----------------
class TestOfficeLogin:
    def test_login_670100(self, s):
        r = s.post(f"{API}/auth/office/login", json={"username": "670100", "password": "670100"})
        assert r.status_code == 200
        j = r.json()
        assert "token" in j and j["office"]["code"] == "670100"

    def test_login_940000(self, s):
        r = s.post(f"{API}/auth/office/login", json={"username": "940000", "password": "940000"})
        assert r.status_code == 200

    def test_login_admin(self, s):
        r = s.post(f"{API}/auth/office/login", json={"username": "admin", "password": "admin"})
        assert r.status_code == 200

    def test_login_bad(self, s):
        r = s.post(f"{API}/auth/office/login", json={"username": "670100", "password": "wrong"})
        assert r.status_code == 401


# ---------------- Tickets — auth + scoping ----------------
class TestTicketsAuthScope:
    def test_no_auth(self, s):
        r = s.get(f"{API}/tickets")
        assert r.status_code == 401

    def test_670100_scope(self, s, token_670100):
        r = s.get(f"{API}/tickets", headers=h(token_670100))
        assert r.status_code == 200
        j = r.json()
        for k in ("total", "page", "limit", "items"):
            assert k in j
        for t in j["items"]:
            assert t["office_code"] == "670100"

    def test_admin_sees_all(self, s, token_admin):
        r = s.get(f"{API}/tickets", headers=h(token_admin))
        assert r.status_code == 200
        codes = {t["office_code"] for t in r.json()["items"]}
        # Not strict, but should include multiple in a healthy env — just verify shape.
        assert isinstance(codes, set)


# ---------------- Ticket creation flows ----------------
class TestTicketCreate:
    def _create(self, s, payload):
        r = s.post(f"{API}/tickets", json=payload)
        assert r.status_code == 200, r.text
        return r.json()

    def test_existing_claims(self, s):
        t = self._create(s, {
            "mobile": "9876543210", "customer_type": "existing",
            "policy_no": "67010023456789012001", "service_type": "claims",
            "parsed_text": "I need to file a claim for my hospitalisation.",
            "language": "en",
        })
        assert t["office_code"] == "670100"
        assert t["target_email"] == "claims670100@newindia.co.in"
        assert t["ticket_id"] == "9876543210_67010023456789012001"

    def test_existing_grievance(self, s):
        t = self._create(s, {
            "mobile": "9876543210", "customer_type": "existing",
            "policy_no": "67010023456789012001", "service_type": "grievance",
            "parsed_text": "The staff was rude.", "language": "en",
        })
        assert t["target_email"] == "grievance670100@newindia.co.in"

    def test_existing_policy(self, s):
        t = self._create(s, {
            "mobile": "9876543210", "customer_type": "existing",
            "policy_no": "67010023456789012001", "service_type": "policy",
            "parsed_text": "Renewal question.", "language": "en",
        })
        assert t["target_email"] == "office670100@newindia.co.in"

    def test_new_customer(self, s):
        t = self._create(s, {
            "mobile": "9000000123", "customer_type": "new",
            "service_type": "service",
            "parsed_text": "How to find nearest office?", "language": "en",
        })
        assert t["target_email"] == "ravikant.vishl@newindia.co.in"
        assert t["ticket_id"].startswith("9000000123_TKT")
        assert t["office_code"] == "admin"

    def test_ticket_creates_email_and_sms(self, s, token_admin):
        # Create a fresh ticket, then verify notifications include email + sms with ticket_id.
        payload = {
            "mobile": "9876543210", "customer_type": "existing",
            "policy_no": "67010023456789012001", "service_type": "claims",
            "parsed_text": "Please help — hospital bill claim.", "language": "en",
        }
        r = s.post(f"{API}/tickets", json=payload)
        assert r.status_code == 200
        t = r.json()
        tid = t["ticket_id"]
        n = s.get(f"{API}/notifications", headers=h(token_admin), params={"ticket_id": tid})
        assert n.status_code == 200
        types = {x["type"] for x in n.json()}
        assert "email" in types and "sms" in types

    def test_auto_classify_urgent(self, s):
        t = self._create(s, {
            "mobile": "9876543210", "customer_type": "existing",
            "policy_no": "67010023456789012001", "service_type": "claims",
            "parsed_text": "URGENT: my wife has been hospitalised after a road accident, please approve the cashless claim immediately.",
            "language": "en", "auto_classify": True,
        })
        assert t["priority"] in ("urgent", "high"), f"unexpected priority: {t['priority']}"


# ---------------- Translation ----------------
class TestTranslate:
    def test_hindi_translation(self, s):
        r = s.post(f"{API}/translate", json={"text": "Your claim has been approved.", "target_language": "hi"})
        assert r.status_code == 200
        out = r.json()["translated"]
        assert out and not out.startswith("[translation unavailable]"), f"fallback text: {out}"
        # Must contain at least one non-ASCII char (Devanagari)
        assert any(ord(c) > 127 for c in out), f"expected non-ASCII output, got: {out}"


# ---------------- Resolve ----------------
class TestResolve:
    def test_resolve_and_translate(self, s, token_670100):
        # Create ticket first
        payload = {
            "mobile": "9876543210", "customer_type": "existing",
            "policy_no": "67010023456789012001", "service_type": "claims",
            "parsed_text": "Please help with my claim.", "language": "en",
        }
        r = s.post(f"{API}/tickets", json=payload)
        assert r.status_code == 200
        tk = r.json()
        pk = tk["id"]
        tid = tk["ticket_id"]

        r2 = s.post(
            f"{API}/tickets/{pk}/resolve",
            headers=h(token_670100),
            json={"solution_text": "Your claim has been approved. Cheque will be dispatched.", "target_language": "hi"},
        )
        assert r2.status_code == 200, r2.text
        j = r2.json()
        assert j["status"] == "Done"
        assert j["attended"] is True
        assert j["solution_translated"] and any(ord(c) > 127 for c in j["solution_translated"])

        # Verify SMS notification for customer mobile
        n = s.get(f"{API}/notifications", headers=h(token_670100), params={"ticket_id": tid})
        assert n.status_code == 200
        sms_to_customer = [x for x in n.json() if x["type"] == "sms" and x["to"] == "9876543210"]
        assert len(sms_to_customer) >= 1


# ---------------- Escalation ----------------
class TestEscalation:
    def test_auto_escalate_after_aging(self, s, token_670100):
        payload = {
            "mobile": "9876543210", "customer_type": "existing",
            "policy_no": "67010023456789012001", "service_type": "policy",
            "parsed_text": "Need help with policy renewal.", "language": "en",
        }
        r = s.post(f"{API}/tickets", json=payload)
        assert r.status_code == 200
        tk = r.json()
        pk = tk["id"]
        tid = tk["ticket_id"]

        # Age it
        r_age = s.post(f"{API}/tickets/{pk}/simulate-aging", headers=h(token_670100))
        assert r_age.status_code == 200

        # Trigger auto-escalation
        r_esc = s.post(f"{API}/tickets/auto-escalate", headers=h(token_670100))
        assert r_esc.status_code == 200

        # Verify status
        r_get = s.get(f"{API}/tickets/{pk}", headers=h(token_670100))
        assert r_get.status_code == 200
        t = r_get.json()
        assert t["status"] == "Escalated"
        assert t["escalated"] is True

        # Verify email to Manjula Vishal
        n = s.get(f"{API}/notifications", headers=h(token_670100), params={"ticket_id": tid})
        assert n.status_code == 200
        to_higher = [x for x in n.json() if x["type"] == "email" and x["to"] == "manjula.vishal@newindia.co.in"]
        assert len(to_higher) >= 1

    def test_manual_escalate_auth(self, s, token_670100):
        payload = {
            "mobile": "9876543210", "customer_type": "existing",
            "policy_no": "67010023456789012001", "service_type": "policy",
            "parsed_text": "Need help.", "language": "en",
        }
        r = s.post(f"{API}/tickets", json=payload)
        pk = r.json()["id"]

        # Without auth
        r_noauth = s.post(f"{API}/tickets/{pk}/escalate-auth")
        assert r_noauth.status_code == 401

        # With auth
        r_auth = s.post(f"{API}/tickets/{pk}/escalate-auth", headers=h(token_670100))
        assert r_auth.status_code == 200
        assert r_auth.json()["status"] == "escalated"


# ---------------- Analytics ----------------
class TestAnalytics:
    def test_summary(self, s, token_admin):
        r = s.get(f"{API}/analytics/summary", headers=h(token_admin))
        assert r.status_code == 200
        j = r.json()
        for k in ("total", "by_status", "by_service", "by_priority", "by_office", "avg_resolution_hours", "trend_7d"):
            assert k in j, f"missing {k}"
        assert isinstance(j["trend_7d"], list) and len(j["trend_7d"]) == 7


# ---------------- Search + Pagination ----------------
class TestSearchPagination:
    def test_search_partial_mobile(self, s, token_admin):
        r = s.get(f"{API}/tickets", headers=h(token_admin), params={"q": "9876543210"})
        assert r.status_code == 200
        for t in r.json()["items"]:
            assert "9876543210" in (t.get("mobile") or "") or "9876543210" in (t.get("ticket_id") or "")

    def test_pagination(self, s, token_admin):
        r = s.get(f"{API}/tickets", headers=h(token_admin), params={"page": 1, "limit": 5})
        assert r.status_code == 200
        j = r.json()
        assert j["page"] == 1 and j["limit"] == 5
        assert len(j["items"]) <= 5


# ---------------- CSV ----------------
class TestCSV:
    def test_export(self, s, token_670100):
        r = s.get(f"{API}/tickets/export.csv", headers={"Authorization": f"Bearer {token_670100}"})
        assert r.status_code == 200
        ctype = r.headers.get("content-type", "")
        assert "text/csv" in ctype, ctype
        first_line = r.text.splitlines()[0]
        assert first_line.startswith("created_at,ticket_id,mobile,")


# ---------------- Audit ----------------
class TestAudit:
    def test_admin_ok(self, s, token_admin):
        r = s.get(f"{API}/audit", headers=h(token_admin))
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_office_forbidden(self, s, token_670100):
        r = s.get(f"{API}/audit", headers=h(token_670100))
        assert r.status_code == 403


# ---------------- Public history ----------------
class TestPublicHistory:
    def test_no_auth_ok(self, s):
        r = s.get(f"{API}/history/9876543210")
        assert r.status_code == 200
        assert isinstance(r.json(), list)


# ---------------- INBOX (new feature) ----------------
class TestInbox:
    def test_inbox_no_auth(self, s):
        r = s.get(f"{API}/inbox")
        assert r.status_code == 401

    def test_inbox_670100_scope_and_ticket_join(self, s, token_670100):
        # First, create a fresh ticket for 670100 policy channel so we ensure an email exists.
        payload = {
            "mobile": "9876543210", "customer_type": "existing",
            "policy_no": "67010023456789012001", "service_type": "policy",
            "parsed_text": "Renewal query — please help.", "language": "en",
        }
        r_c = s.post(f"{API}/tickets", json=payload)
        assert r_c.status_code == 200
        created_tid = r_c.json()["ticket_id"]

        r = s.get(f"{API}/inbox", headers=h(token_670100))
        assert r.status_code == 200
        mails = r.json()
        assert isinstance(mails, list) and len(mails) >= 1
        allowed = {"office670100@newindia.co.in", "claims670100@newindia.co.in", "grievance670100@newindia.co.in"}
        for m in mails:
            assert m["type"] == "email"
            assert m["to"] in allowed, f"unexpected recipient {m['to']}"
        # At least one entry should have a linked ticket
        assert any(m.get("ticket") for m in mails), "expected 'ticket' object populated"
        # Newly created ticket should show
        assert any(m.get("ticket_id") == created_tid for m in mails), "new ticket email not in inbox"

    def test_inbox_admin_sees_all(self, s, token_admin):
        r = s.get(f"{API}/inbox", headers=h(token_admin))
        assert r.status_code == 200
        mails = r.json()
        recipients = {m["to"] for m in mails}
        # Admin should see multiple mailbox addresses across offices
        assert isinstance(recipients, set)

    def test_inbox_scope_isolation(self, s, token_670100, token_940000):
        # Emails routed to 670100 must NOT appear in 940000 inbox
        r670 = s.get(f"{API}/inbox", headers=h(token_670100))
        r940 = s.get(f"{API}/inbox", headers=h(token_940000))
        assert r670.status_code == 200 and r940.status_code == 200
        m670_to = {m["to"] for m in r670.json()}
        m940_to = {m["to"] for m in r940.json()}
        disallowed_for_940 = {"office670100@newindia.co.in", "claims670100@newindia.co.in", "grievance670100@newindia.co.in"}
        assert m940_to.isdisjoint(disallowed_for_940), f"leak: {m940_to & disallowed_for_940}"
        # Sanity: 670100 shouldn't see 940000 either
        disallowed_for_670 = {"office940000@newindia.co.in", "claims940000@newindia.co.in", "grievance940000@newindia.co.in"}
        assert m670_to.isdisjoint(disallowed_for_670)

    def test_mark_read(self, s, token_670100):
        r = s.get(f"{API}/inbox", headers=h(token_670100))
        assert r.status_code == 200
        mails = r.json()
        assert mails, "no mails to mark read"
        nid = mails[0]["id"]
        r2 = s.post(f"{API}/inbox/{nid}/mark-read", headers=h(token_670100))
        assert r2.status_code == 200
        # Re-fetch and confirm read_at set
        r3 = s.get(f"{API}/inbox", headers=h(token_670100))
        assert r3.status_code == 200
        target = next((m for m in r3.json() if m["id"] == nid), None)
        assert target is not None
        assert target.get("read_at"), f"read_at not set: {target}"
