"""SMS delivery via Twilio. Falls back to log-only when creds are absent.

Trial-account safety net: TWILIO_TEST_OVERRIDE redirects every SMS to a single
verified number (Twilio trials block un-verified destinations). The original
recipient is prefixed onto the message body so nothing is lost.
"""
from __future__ import annotations
import logging
import os
from typing import Optional

logger = logging.getLogger(__name__)


def _creds() -> tuple[str, str, str]:
    return (
        os.environ.get("TWILIO_ACCOUNT_SID", ""),
        os.environ.get("TWILIO_AUTH_TOKEN", ""),
        os.environ.get("TWILIO_FROM", ""),
    )


def _override() -> str:
    return os.environ.get("TWILIO_TEST_OVERRIDE", "").strip()


def _normalize_indian(number: str) -> str:
    """Convert a bare 10-digit Indian mobile to E.164 (+91...)."""
    n = number.strip().replace(" ", "").replace("-", "")
    if n.startswith("+"):
        return n
    if len(n) == 10 and n.isdigit():
        return f"+91{n}"
    return n


async def send_sms(to: str, message: str) -> dict:
    sid, tok, frm = _creds()
    if not (sid and tok and frm and to):
        return {"sent": False, "error": "no_creds_or_recipient"}

    original_to = _normalize_indian(to)
    override = _override()
    actual_to = override or original_to
    if override and override != original_to:
        message = f"[FOR {original_to}] {message}"

    try:
        from twilio.rest import Client
        client = Client(sid, tok)
        msg = client.messages.create(from_=frm, to=actual_to, body=message[:1500])
        return {"sent": True, "id": msg.sid, "redirected_to": override or None}
    except Exception as e:
        logger.warning(f"Twilio failure: {e}")
        return {"sent": False, "error": str(e)}
