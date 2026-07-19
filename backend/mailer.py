"""Email delivery. Uses Gmail SMTP when available; falls back to Resend HTTP
API when SMTP is blocked (Render/Railway/Fly free tiers commonly block
outbound port 587). A process-wide circuit breaker means we detect a blocked
SMTP path once and skip it thereafter — no more 30-second timeouts on
every request.
"""
from __future__ import annotations
import logging
import os
import ssl
import smtplib
import time
from email.message import EmailMessage
from email.utils import make_msgid
from typing import Optional

logger = logging.getLogger(__name__)

# Circuit breaker state — process-local. If SMTP fails with a network-level
# error (host unreachable / connection refused / DNS), stop attempting it for
# `_SMTP_CIRCUIT_COOLDOWN_SEC` seconds. Prevents 30s+ blocks on every call.
_SMTP_CIRCUIT_COOLDOWN_SEC = 300  # 5 minutes
_smtp_blocked_until: float = 0.0
# Short socket timeout — if SMTP is blocked at the network layer, fail fast
# rather than waiting for TCP handshake to give up.
_SMTP_TIMEOUT_SEC = 5


def _resend_key() -> str:
    return os.environ.get("RESEND_API_KEY", "")


def _resend_sender() -> str:
    return os.environ.get("RESEND_FROM", "Samaadhaan <onboarding@resend.dev>")


def _gmail_creds() -> tuple[str, str]:
    """Defensive: strip whitespace + stray newlines from env vars so a
    trailing '\\n' pasted into Render/Railway/Heroku UI can't break auth."""
    user = os.environ.get("GMAIL_USER", "").strip().replace("\n", "").replace("\r", "")
    pw = os.environ.get("GMAIL_APP_PASSWORD", "").strip().replace(" ", "").replace("\n", "").replace("\r", "")
    return user, pw


def _override() -> str:
    # Only respected when Gmail SMTP is NOT configured (belt-and-braces demo mode).
    return os.environ.get("TEST_EMAIL_OVERRIDE", "").strip()


def _send_smtp(to: str, subject: str, text_body: str, html_body: Optional[str],
               cc: Optional[list]) -> dict:
    """SMTP send with fast-fail and circuit breaker.

    On the first network-level failure (e.g. Render blocks outbound 587),
    trip a process-wide circuit that skips SMTP for 5 minutes — otherwise
    every OTP request would eat a 30-second timeout.
    """
    global _smtp_blocked_until
    user, pw = _gmail_creds()
    if not (user and pw):
        return {"sent": False, "error": "smtp_not_configured"}
    now = time.time()
    if now < _smtp_blocked_until:
        return {"sent": False,
                "error": f"smtp_circuit_open:blocked_for_{int(_smtp_blocked_until - now)}s"}

    msg = EmailMessage()
    msg["From"] = f"Samaadhaan <{user}>"
    msg["To"] = to
    if cc:
        msg["Cc"] = ", ".join(cc)
    msg["Subject"] = subject
    msg["Message-ID"] = make_msgid(domain="oursamadhaan.com")
    msg.set_content(text_body)
    if html_body:
        msg.add_alternative(html_body, subtype="html")

    try:
        ctx = ssl.create_default_context()
        with smtplib.SMTP("smtp.gmail.com", 587, timeout=_SMTP_TIMEOUT_SEC) as s:
            s.starttls(context=ctx)
            s.login(user, pw)
            refused = s.send_message(msg)
        if refused:
            return {"sent": False, "error": f"smtp_refused:{refused}", "attempts": 1}
        return {"sent": True, "id": msg["Message-ID"],
                "channel": "gmail_smtp", "attempts": 1}
    except smtplib.SMTPAuthenticationError as e:
        return {"sent": False,
                "error": f"smtp_auth:{e.smtp_code}:{e.smtp_error!s}",
                "attempts": 1}
    except (OSError, smtplib.SMTPServerDisconnected, smtplib.SMTPConnectError,
            TimeoutError) as e:
        # Network-level failure — trip the circuit so future calls skip SMTP.
        _smtp_blocked_until = time.time() + _SMTP_CIRCUIT_COOLDOWN_SEC
        logger.warning(
            f"Gmail SMTP unreachable ({type(e).__name__}: {e}) · "
            f"circuit tripped for {_SMTP_CIRCUIT_COOLDOWN_SEC}s — falling through to Resend"
        )
        return {"sent": False,
                "error": f"smtp_network:{type(e).__name__}:{e}",
                "attempts": 1}
    except Exception as e:
        logger.warning(f"Gmail SMTP failure: {e}")
        return {"sent": False, "error": f"smtp:{e}", "attempts": 1}


def _send_resend(to: str, subject: str, text_body: str, html_body: Optional[str],
                 cc: Optional[list]) -> dict:
    key = _resend_key()
    if not key:
        return {"sent": False, "error": "no_resend_key"}
    try:
        import resend
        resend.api_key = key
        params = {
            "from": _resend_sender(),
            "to": [to] if isinstance(to, str) else to,
            "subject": subject,
            "text": text_body,
        }
        if html_body:
            params["html"] = html_body
        if cc:
            params["cc"] = cc
        r = resend.Emails.send(params)
        return {"sent": True, "id": r.get("id") if isinstance(r, dict) else str(r), "channel": "resend"}
    except Exception as e:
        return {"sent": False, "error": f"resend:{e}"}


async def send_email(to: str, subject: str, body: str, cc: Optional[list] = None,
                     bypass_override: bool = False, html: Optional[str] = None,
                     retries: int = 1) -> dict:
    """Send an email. Order of precedence:
      1. Gmail SMTP if configured (universal delivery — reaches any recipient).
      2. Resend as a secondary / audit-trail send.
      3. Legacy TEST_EMAIL_OVERRIDE redirect ONLY when SMTP is not configured
         and Resend rejects (sandbox).

    Both SMTP and Resend are synchronous blocking libraries — we dispatch
    them via `asyncio.to_thread` so they never freeze the event loop.
    """
    import asyncio as _asyncio
    if not to:
        return {"sent": False, "error": "no_recipient"}

    smtp_available = all(_gmail_creds())
    last_error = None

    if smtp_available:
        for attempt in range(retries + 1):
            r = await _asyncio.to_thread(_send_smtp, to, subject, body, html, cc)
            if r["sent"]:
                r["attempts"] = attempt + 1
                return r
            last_error = r.get("error")
            # If the circuit is open now, no point retrying SMTP this call
            if r.get("error", "").startswith("smtp_circuit_open") or \
               r.get("error", "").startswith("smtp_network"):
                break

    # Fall back to Resend
    r = await _asyncio.to_thread(_send_resend, to, subject, body, html, cc)
    if r["sent"]:
        r["attempts"] = 1
        return r
    last_error = r.get("error") or last_error

    # Absolute last resort — legacy override to a fixed inbox
    override = "" if bypass_override else _override()
    if override:
        rr = _send_resend(override, f"[FOR: {to}] {subject}",
                          f"### Original recipient: {to}\n### Redirected via TEST_EMAIL_OVERRIDE\n\n{body}",
                          html, None)
        if rr["sent"]:
            rr["attempts"] = 1
            rr["redirected_to"] = override
            return rr
        last_error = rr.get("error") or last_error

    return {"sent": False, "error": last_error}


# Fixed official email template used by the AI generator
OFFICIAL_TEMPLATE = """Dear {team},

Please find below the customer email/request received for your review and necessary action.

Customer Details:
Customer Name: {customer_name}
Policy/Account Number: {policy_no}
Contact Number: {mobile}
Email ID: {customer_email}
Subject: {subject}

Customer Concern:
{concern}

Requested Action:
Kindly review the customer's request and take the necessary action at the earliest. Please keep the customer informed regarding the status of the request or let us know if any additional information is required from our end.

Thank you.

Regards,
{signer_name}
{signer_designation}
{department}
{company}"""


def team_for(service_type: str) -> str:
    return {
        "claims": "Claims Team",
        "grievance": "Grievance Redressal Team",
        "policy": "Policy Servicing Team",
        "service": "Customer Care Team",
    }.get(service_type, "Customer Service Team")


def chief_designation(service_type: str) -> str:
    return {
        "claims": "Chief Claims Officer",
        "grievance": "Chief Grievance Officer",
        "policy": "Chief Policy Officer",
        "service": "Chief Customer Care Officer",
    }.get(service_type, "Chief Customer Service Officer")


def department_for(service_type: str) -> str:
    return {
        "claims": "Claims Department",
        "grievance": "Grievance Cell",
        "policy": "Policy Servicing Department",
        "service": "Customer Care",
    }.get(service_type, "Customer Service")
