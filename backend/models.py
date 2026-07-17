"""Pydantic document models for Samaadhaan."""
from __future__ import annotations
from typing import Optional, Literal
from pydantic import Field
from core import BaseDocument, now_iso


class Policy(BaseDocument):
    policy_no: str
    mobile: str
    office_code: str
    customer_name: str
    product: str
    created_at: str = Field(default_factory=now_iso)


class Office(BaseDocument):
    code: str
    password: str
    name: str
    email: str
    claims_email: str
    grievance_email: str


class OTP(BaseDocument):
    mobile: str
    otp: str
    attempts: int = 0
    created_at: str = Field(default_factory=now_iso)


class Ticket(BaseDocument):
    ticket_id: str
    mobile: str
    customer_type: Literal["new", "existing"]
    customer_name: Optional[str] = None
    policy_no: Optional[str] = None
    product: Optional[str] = None
    service_type: Literal["service", "policy", "claims", "grievance"]
    office_code: str
    target_email: str
    audio_base64: Optional[str] = None
    parsed_text: str
    language: str = "en"
    priority: Literal["low", "normal", "high", "urgent"] = "normal"
    sentiment: Optional[Literal["positive", "neutral", "negative", "angry"]] = None
    solution_text: Optional[str] = None
    solution_translated: Optional[str] = None
    solution_language: Optional[str] = None
    attended: bool = False
    status: Literal["Open", "InProgress", "Escalated", "Done"] = "Open"
    escalated: bool = False
    escalation_count: int = 0
    created_at: str = Field(default_factory=now_iso)
    updated_at: str = Field(default_factory=now_iso)
    resolved_at: Optional[str] = None


class Notification(BaseDocument):
    type: Literal["sms", "email"]
    to: str
    subject: Optional[str] = None
    message: str
    ticket_id: Optional[str] = None
    created_at: str = Field(default_factory=now_iso)


class AuditLog(BaseDocument):
    actor: str            # office code or 'system' or 'customer:<mobile>'
    action: str           # created, resolved, escalated, aged, login, etc.
    entity: str           # 'ticket' | 'office' | 'otp'
    entity_ref: Optional[str] = None   # ticket_id / office code
    details: Optional[dict] = None
    created_at: str = Field(default_factory=now_iso)
