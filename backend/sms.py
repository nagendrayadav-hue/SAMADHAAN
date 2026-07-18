"""SMS delivery via Fast2SMS Quick SMS route — works for any Indian number, no DLT needed."""
from __future__ import annotations
import logging
import os
import requests

logger = logging.getLogger(__name__)

FAST2SMS_URL = "https://www.fast2sms.com/dev/bulkV2"


def _api_key() -> str:
    return os.environ.get("FAST2SMS_API_KEY", "")


def _normalize_indian(number: str) -> str:
    n = number.strip().replace(" ", "").replace("-", "")
    if n.startswith("+91"):
        n = n[3:]
    if n.startswith("91") and len(n) == 12:
        n = n[2:]
    return n


async def send_sms(to: str, message: str) -> dict:
    api_key = _api_key()
    number = _normalize_indian(to)
    if not (api_key and number):
        return {"sent": False, "error": "no_key_or_recipient"}

    try:
        resp = requests.get(FAST2SMS_URL, params={
            "authorization": api_key,
            "message": message[:900],
            "language": "english",
            "route": "q",
            "numbers": number,
        }, timeout=15)
        data = resp.json()
        return {"sent": bool(data.get("return")), "raw": data}
    except Exception as e:
        logger.warning(f"Fast2SMS failure: {e}")
        return {"sent": False, "error": str(e)}
