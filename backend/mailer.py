"""Email delivery service. Uses Resend when RESEND_API_KEY is present; otherwise
falls back to logging-only mode (still persisted as a mock notification)."""
from __future__ import annotations
import logging
import os
from typing import Optional

logger = logging.getLogger(__name__)


def _resend_key() -> str:
    return os.environ.get("RESEND_API_KEY", "")


def _sender() -> str:
    return os.environ.get("RESEND_FROM", "Samaadhaan <onboarding@resend.dev>")


async def send_email(to: str, subject: str, body: str, cc: Optional[list] = None,
                     bypass_override: bool = False) -> dict:
    """Send email via Resend. Returns {sent: bool, id?: str, error?: str}.

    If TEST_EMAIL_OVERRIDE is set, ALL emails are redirected there so the
    Resend sandbox (which restricts sending to the account owner only) still
    delivers something the user can actually see in their inbox. The original
    recipient is captured in the subject line and message header.

    bypass_override=True skips the redirect entirely — used by escalation so
    the mail goes straight to Manjula Vishal's real address.
    """
    key = _resend_key()
    if not key or not to:
        return {"sent": False, "error": "no_key_or_recipient"}

    override = "" if bypass_override else os.environ.get("TEST_EMAIL_OVERRIDE", "").strip()
    actual_to = override or to
    if override and override != to:
        subject = f"[FOR: {to}] {subject}"
        body = f"### Original recipient: {to}\n### Redirected via TEST_EMAIL_OVERRIDE\n\n{body}"

    try:
        import resend
        resend.api_key = key
        params = {
            "from": _sender(),
            "to": [actual_to] if isinstance(actual_to, str) else actual_to,
            "subject": subject,
            "text": body,
        }
        # Only include CC when we're not overriding (Resend sandbox rejects
        # every unverified address, including CC recipients).
        if cc and not override:
            params["cc"] = cc
        r = resend.Emails.send(params)
        return {"sent": True, "id": r.get("id") if isinstance(r, dict) else str(r), "redirected_to": override or None}
    except Exception as e:
        logger.warning(f"Resend failure: {e}")
        return {"sent": False, "error": str(e)}


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
