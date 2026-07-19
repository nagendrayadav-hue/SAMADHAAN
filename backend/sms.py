"""SMS delivery via Twilio with one-shot retry on transient failures.

Behavioural notes:
- TWILIO_TEST_OVERRIDE (optional) forces every SMS to a single verified
  number — used only for demo mode; leave empty in production.
- On transient errors (network / 5xx) we retry once before giving up.
- On terminal Twilio errors (auth, quota, geo, bad number) we surface the
  exact Twilio error code so the operator can act.
"""
from __future__ import annotations
import asyncio
import logging
import os
from typing import Optional

logger = logging.getLogger(__name__)

# Twilio errors that are worth retrying (transient / infra) — anything else is
# a terminal user/config problem where a retry would just burn credit.
_RETRYABLE_ERROR_CODES = {20500, 20503, 20504, 30001, 30002}


def _creds() -> tuple[str, str, str]:
    """Read Twilio credentials with aggressive whitespace stripping.

    Render / Railway / Heroku env-var editors are notorious for silently
    appending a trailing '\\n' when a value is pasted. That turns
    `Accounts/AC...` into `Accounts/AC...\\n` in the URL path, which Twilio
    reports as a 20404 "resource not found" — indistinguishable from a
    wrong-SID error at first glance. Strip aggressively so paste artifacts
    can never break the pipeline.
    """
    def clean(k: str) -> str:
        return os.environ.get(k, "").strip().replace("\n", "").replace("\r", "").replace(" ", "")
    return clean("TWILIO_ACCOUNT_SID"), clean("TWILIO_AUTH_TOKEN"), clean("TWILIO_FROM")


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


def _try_once(sid: str, tok: str, frm: str, to: str, body: str) -> dict:
    try:
        from twilio.rest import Client
        from twilio.base.exceptions import TwilioRestException
        client = Client(sid, tok)
        try:
            msg = client.messages.create(from_=frm, to=to, body=body[:1500])
            return {"sent": True, "id": msg.sid, "code": None, "status": msg.status}
        except TwilioRestException as e:
            # Twilio surfaces a distinct numeric error code — keep it.
            return {
                "sent": False,
                "error": f"twilio:{e.code}:{e.msg}",
                "code": e.code,
                "http_status": e.status,
            }
    except Exception as e:
        # Networking / SDK failures without a Twilio code
        return {"sent": False, "error": f"transport:{e}", "code": None}


async def send_sms(to: str, message: str) -> dict:
    sid, tok, frm = _creds()
    if not (sid and tok and frm and to):
        return {"sent": False, "error": "no_creds_or_recipient"}

    original_to = _normalize_indian(to)
    override = _override()
    actual_to = override or original_to
    if override and override != original_to:
        message = f"[FOR {original_to}] {message}"

    for attempt in (1, 2):
        # Twilio SDK is sync-blocking — run in a thread so we don't freeze
        # the event loop.
        r = await asyncio.to_thread(_try_once, sid, tok, frm, actual_to, message)
        if r["sent"]:
            r["attempts"] = attempt
            r["redirected_to"] = override or None
            return r
        # Only retry on transient categories: no code (network) or explicit retryable set
        transient = r.get("code") is None or r.get("code") in _RETRYABLE_ERROR_CODES
        logger.warning(
            f"Twilio SMS attempt {attempt}/2 failed to {actual_to} · "
            f"code={r.get('code')} err={r.get('error')} · "
            f"{'retrying' if transient and attempt == 1 else 'giving up'}"
        )
        if not transient or attempt == 2:
            return {**r, "attempts": attempt, "redirected_to": override or None}
        await asyncio.sleep(0.6)

    # unreachable but keeps type checkers happy
    return {"sent": False, "error": "unknown"}
