"""Email delivery. Uses Gmail SMTP (universal delivery) as the primary channel;
falls back to Resend for provider tracking / analytics parity.

If neither is configured or both fail, the notification is stored with
delivered=False so the ops team can see it.
"""
from __future__ import annotations
import logging
import os
import ssl
import smtplib
from email.message import EmailMessage
from email.utils import make_msgid
from typing import Optional

logger = logging.getLogger(__name__)


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
    user, pw = _gmail_creds()
    if not (user and pw):
        return {"sent": False, "error": "smtp_not_configured"}

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

    last_err = None
    # One-shot retry on transient SMTP failures (connection reset, 421, 4xx)
    for attempt in (1, 2):
        try:
            ctx = ssl.create_default_context()
            with smtplib.SMTP("smtp.gmail.com", 587, timeout=15) as s:
                s.starttls(context=ctx)
                s.login(user, pw)
                refused = s.send_message(msg)
            if refused:
                # Some recipients bounced at the SMTP handshake — non-retryable
                return {"sent": False, "error": f"smtp_refused:{refused}",
                        "attempts": attempt}
            return {"sent": True, "id": msg["Message-ID"],
                    "channel": "gmail_smtp", "attempts": attempt}
        except smtplib.SMTPAuthenticationError as e:
            # Wrong / rotated app password — retrying won't help
            return {"sent": False, "error": f"smtp_auth:{e.smtp_code}:{e.smtp_error!s}",
                    "attempts": attempt}
        except (smtplib.SMTPServerDisconnected, smtplib.SMTPConnectError,
                TimeoutError, OSError) as e:
            last_err = f"smtp_transient:{type(e).__name__}:{e}"
            logger.warning(f"Gmail SMTP attempt {attempt}/2 failed: {last_err}")
            if attempt == 2:
                return {"sent": False, "error": last_err, "attempts": attempt}
        except Exception as e:
            # Unknown non-transient error — don't retry
            logger.warning(f"Gmail SMTP failure: {e}")
            return {"sent": False, "error": f"smtp:{e}", "attempts": attempt}
    return {"sent": False, "error": last_err or "smtp_unknown", "attempts": 2}


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
    """
    if not to:
        return {"sent": False, "error": "no_recipient"}

    smtp_available = all(_gmail_creds())
    last_error = None

    if smtp_available:
        for attempt in range(retries + 1):
            r = _send_smtp(to, subject, body, html, cc)
            if r["sent"]:
                r["attempts"] = attempt + 1
                return r
            last_error = r.get("error")

    # Fall back to Resend
    r = _send_resend(to, subject, body, html, cc)
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
