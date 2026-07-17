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


async def summarize_concern(text: str, max_words: int = 60) -> str:
    """Turn a raw customer transcript into a crisp subject-worthy concern summary."""
    if not text.strip():
        return ""
    system = (
        f"Rewrite the customer's concern as a clear, formal, single-paragraph summary of at most {max_words} words. "
        "Preserve all specific facts (dates, amounts, names). No greetings, no signatures — just the summary."
    )
    out = await _chat_send(system, text)
    return out or text


async def generate_subject(text: str) -> str:
    """Produce a short, business-appropriate email subject from a customer concern."""
    if not text.strip():
        return "Customer request"
    system = (
        "Write a concise, professional email subject line (max 12 words) for the customer concern below. "
        "No quotes, no prefixes like 'Subject:'. Just the subject line."
    )
    out = await _chat_send(system, text)
    return (out or "Customer request").strip().strip('"').strip("'")


async def draft_office_solution(concern: str, service_type: str) -> str:
    """Draft a first-cut solution the officer can edit before sending."""
    if not concern.strip():
        return ""
    system = (
        f"You are a senior officer at New India Assurance handling {service_type}. Draft a helpful, factual "
        "reply outlining the steps you will take for the customer, in 120-180 words. Do not include greetings or "
        "signatures. Do not promise unrealistic timelines. Use plain English."
    )
    out = await _chat_send(system, concern)
    return out or ""
