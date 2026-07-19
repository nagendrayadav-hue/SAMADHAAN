"""Shared utilities: MongoDB base document pattern (PyObjectId), datetime helpers, JWT."""
from __future__ import annotations
from datetime import datetime, timezone, timedelta
from typing import Annotated, Any, Optional
from bson import ObjectId
from pydantic import BaseModel, Field, ConfigDict, BeforeValidator
import uuid
import jwt
import os

# ---------- ObjectId support ----------
def _coerce_object_id(v: Any) -> str:
    if isinstance(v, ObjectId):
        return str(v)
    if isinstance(v, str):
        return v
    raise TypeError(f"Cannot coerce {type(v)} to ObjectId string")

PyObjectId = Annotated[str, BeforeValidator(_coerce_object_id)]


class BaseDocument(BaseModel):
    """Base for all Mongo documents. Uses uuid `id` (not _id) to keep JSON simple."""
    model_config = ConfigDict(populate_by_name=True, arbitrary_types_allowed=True, extra="ignore")

    id: str = Field(default_factory=lambda: str(uuid.uuid4()))

    def to_mongo(self) -> dict:
        d = self.model_dump()
        # Serialize datetimes to iso strings for Mongo (we store as string for consistency).
        for k, v in list(d.items()):
            if isinstance(v, datetime):
                d[k] = v.isoformat()
        return d

    @classmethod
    def from_mongo(cls, doc: dict | None):
        if doc is None:
            return None
        doc.pop("_id", None)
        return cls(**doc)


# ---------- time ----------
def now_utc() -> datetime:
    return datetime.now(timezone.utc)

def now_iso() -> str:
    return now_utc().isoformat()

def hours_ago_iso(hours: int) -> str:
    return (now_utc() - timedelta(hours=hours)).isoformat()

def parse_iso(s: str) -> datetime:
    return datetime.fromisoformat(s.replace("Z", "+00:00"))


# ---------- JWT ----------
JWT_ALG = "HS256"
JWT_TTL_HOURS = 12

def _jwt_secret() -> str:
    return os.environ.get("JWT_SECRET", "dev-secret-change-me-in-production-please-32b")

def issue_office_token(code: str, name: str) -> str:
    payload = {
        "sub": code,
        "name": name,
        "role": "admin" if code == "admin" else "office",
        "exp": now_utc() + timedelta(hours=JWT_TTL_HOURS),
        "iat": now_utc(),
    }
    return jwt.encode(payload, _jwt_secret(), algorithm=JWT_ALG)

def decode_token(token: str) -> Optional[dict]:
    try:
        return jwt.decode(token, _jwt_secret(), algorithms=[JWT_ALG])
    except jwt.PyJWTError:
        return None


# ---------- constants ----------
LANG_MAP = {
    "hi": "Hindi", "mr": "Marathi", "ta": "Tamil", "te": "Telugu",
    "bn": "Bengali", "gu": "Gujarati", "kn": "Kannada", "ml": "Malayalam",
    "pa": "Punjabi", "en": "English",
}

HIGHER_AUTHORITY_EMAIL = "manjula.vishal@newindia.co.in"
CALL_CENTER_EMAIL = "ravikant.vishal@newindia.co.in"
