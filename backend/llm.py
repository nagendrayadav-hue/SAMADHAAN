"""LLM helpers: translation + lightweight classification via Emergent LLM key."""
from __future__ import annotations
import logging
import os
import uuid
import json
from core import LANG_MAP

logger = logging.getLogger(__name__)


def _get_key() -> str:
    return os.environ.get("EMERGENT_LLM_KEY", "")


async def _chat_send(system: str, user: str, model: tuple = ("anthropic", "claude-sonnet-4-6")) -> str:
    """Single-shot LLM call. Returns text or empty on failure."""
    api_key = _get_key()
    if not api_key:
        logger.warning("EMERGENT_LLM_KEY missing at call time")
        return ""
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
        chat = LlmChat(
            api_key=api_key,
            session_id=f"samaadhaan-{uuid.uuid4()}",
            system_message=system,
        ).with_model(*model)
        resp = await chat.send_message(UserMessage(text=user))
        return str(resp).strip()
    except Exception as e:
        logger.exception(f"LLM call failed: {e}")
        return ""


async def translate_text(text: str, target_language: str) -> str:
    if target_language == "en" or not text.strip():
        return text
    lang_name = LANG_MAP.get(target_language, target_language)
    system = (
        f"You are a professional translator. Translate user text to {lang_name}. "
        "Return ONLY the translated text. No quotes, prefixes, or explanations."
    )
    out = await _chat_send(system, text)
    return out or f"[translation unavailable] {text}"


async def classify_intent(text: str) -> dict:
    """Auto-detect service_type + priority + sentiment from parsed text.
    Cheap single call. Returns dict with keys: service_type, priority, sentiment."""
    if not text.strip():
        return {"service_type": "service", "priority": "normal", "sentiment": "neutral"}

    system = (
        "You classify insurance customer messages. Respond in strict JSON only with keys: "
        '{"service_type":"policy|claims|grievance|service","priority":"low|normal|high|urgent","sentiment":"positive|neutral|negative|angry"}. '
        "Rules: 'policy' = premium/endorsement/renewal/cover questions; 'claims' = claim filing/status/documents; "
        "'grievance' = complaints about staff/office/dissatisfaction; 'service' = general help / find office / product info. "
        "'urgent' if hospitalized/accident/death/time-critical. 'angry' if hostile language."
    )
    out = await _chat_send(system, text)
    try:
        # Strip markdown fences if any
        cleaned = out.strip().strip("`").strip()
        if cleaned.startswith("json"):
            cleaned = cleaned[4:].strip()
        data = json.loads(cleaned)
        return {
            "service_type": data.get("service_type", "service"),
            "priority": data.get("priority", "normal"),
            "sentiment": data.get("sentiment", "neutral"),
        }
    except Exception:
        return {"service_type": "service", "priority": "normal", "sentiment": "neutral"}
