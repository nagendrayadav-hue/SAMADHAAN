"""Samaadhaan API — New India Assurance grievance portal.

Enhancements over v1:
  - Structured models (BaseDocument, PyObjectId pattern)
  - JWT sessions for office login (Bearer tokens)
  - Background APScheduler job auto-escalates 24h+ open tickets every 10 min
  - LLM-powered intent classification (auto-route new customer requests)
  - Analytics endpoint (per-office / per-service / trend)
  - Search + pagination on tickets
  - CSV export for offices
  - Full audit log for every action
  - OTP rate-limit (max 3 attempts, 5-min TTL)
"""
from __future__ import annotations

import csv
import io
import logging
import os
import random
import uuid
from pathlib import Path
from typing import List, Optional, Literal, Any

from fastapi import FastAPI, APIRouter, HTTPException, Depends, Header, Query
from fastapi.responses import StreamingResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field
from apscheduler.schedulers.asyncio import AsyncIOScheduler

from core import (
    now_iso, hours_ago_iso, parse_iso,
    issue_office_token, decode_token,
    HIGHER_AUTHORITY_EMAIL, CALL_CENTER_EMAIL, LANG_MAP,
)
from models import Policy, Office, OTP, Ticket, Notification, AuditLog
from llm import translate_text, classify_intent, summarize_concern, generate_subject, draft_office_solution
from mailer import send_email, OFFICIAL_TEMPLATE, team_for, chief_designation, department_for
from sms import send_sms

# ---------- setup ----------
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s :: %(message)s")
logger = logging.getLogger("samaadhaan")

mongo_url = os.environ["MONGO_URL"]
mongo_client = AsyncIOMotorClient(mongo_url)
db = mongo_client[os.environ["DB_NAME"]]

app = FastAPI(title="Samaadhaan API", version="2.0")
api = APIRouter(prefix="/api")
scheduler = AsyncIOScheduler(timezone="UTC")


# ---------- helpers ----------
def gen_id_str() -> str:
    return str(uuid.uuid4())


async def audit(actor: str, action: str, entity: str, entity_ref: str | None = None, details: dict | None = None):
    log = AuditLog(actor=actor, action=action, entity=entity, entity_ref=entity_ref, details=details)
    await db.audits.insert_one(log.to_mongo())


async def push_notification(**kwargs) -> Notification:
    """Persist a mock notification. If it's an email and Resend is configured,
    also actually deliver via Resend and store the provider id."""
    n = Notification(**kwargs)
    doc = n.to_mongo()

    if n.type == "email" and n.to:
        result = await send_email(n.to, n.subject or "Samaadhaan", n.message)
        doc["delivered"] = result.get("sent", False)
        doc["provider_id"] = result.get("id")
        doc["provider_error"] = result.get("error")

    if n.type == "sms" and n.to:
        result = await send_sms(n.to, n.message)
        doc["delivered"] = result.get("sent", False)
        doc["provider_id"] = result.get("id")
        doc["provider_error"] = result.get("error")

    await db.notifications.insert_one(doc)
    return n


def build_ticket_id(mobile: str, policy_no: str | None) -> str:
    tail = policy_no if policy_no else f"TKT{random.randint(1000, 9999)}"
    return f"{mobile}_{tail}"


# ---------- auth dependency ----------
async def current_office(authorization: str | None = Header(default=None)) -> dict:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Missing bearer token")
    token = authorization.split(None, 1)[1]
    payload = decode_token(token)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    return payload


def office_scope_query(payload: dict) -> dict:
    """Admins see everything; regional offices see only their code."""
    if payload.get("role") == "admin":
        return {}
    return {"office_code": payload["sub"]}


# ---------- seed ----------
async def seed_data():
    if await db.policies.count_documents({}) == 0:
        for p in [
            Policy(policy_no="67010023456789012001", mobile="9876543210", office_code="670100",
                   customer_name="Ravi Kumar", product="Mediclaim Policy"),
            Policy(policy_no="67010023456789012002", mobile="9123456780", office_code="670100",
                   customer_name="Priya Sharma", product="Motor Insurance"),
            Policy(policy_no="94000012345678901001", mobile="9988776655", office_code="940000",
                   customer_name="Anil Deshpande", product="Home Insurance"),
        ]:
            await db.policies.insert_one(p.to_mongo())

    # Unified mailbox format: nia.{code}@newindia.co.in for policy/claims/grievance/general.
    unified_offices = [
        ("670100", "Mumbai Regional Office"),
        ("940000", "Delhi Regional Office"),
        ("admin", "Admin (All Offices)"),
    ]
    for code, name in unified_offices:
        mailbox = f"nia.{code}@newindia.co.in"
        await db.offices.update_one(
            {"code": code},
            {"$set": {"email": mailbox, "claims_email": mailbox, "grievance_email": mailbox, "name": name},
             "$setOnInsert": {"id": gen_id_str(), "code": code, "password": code}},
            upsert=True,
        )


# ---------- request payloads ----------
class OTPSendReq(BaseModel):
    mobile: str

class OTPVerifyReq(BaseModel):
    mobile: str
    otp: str

class PolicyVerifyReq(BaseModel):
    policy_no: str

class OfficeLoginReq(BaseModel):
    username: str
    password: str

class TicketCreateReq(BaseModel):
    mobile: str
    customer_type: Literal["new", "existing"]
    policy_no: Optional[str] = None
    service_type: Literal["service", "policy", "claims", "grievance"]
    audio_base64: Optional[str] = None
    parsed_text: str
    language: str = "en"
    auto_classify: bool = False   # If true, call LLM to refine service_type/priority

class TicketResolveReq(BaseModel):
    solution_text: str
    target_language: str = "hi"

class TranslateReq(BaseModel):
    text: str
    target_language: str

class ClassifyReq(BaseModel):
    text: str


class AIEmailReq(BaseModel):
    ticket_id: str            # id (uuid) of the ticket
    role: Literal["customer", "office"] = "customer"   # who is "sending" the email
    customer_email: Optional[str] = None    # optional override, else derived
    signer_name: Optional[str] = None
    signer_designation: Optional[str] = None
    send: bool = False        # if true, also deliver via Resend
    override_to: Optional[str] = None   # if provided, deliver to this address instead of default


# ============================================================
# AI EMAIL DRAFTING — fixed official template
# ============================================================
@api.post("/emails/draft")
async def draft_email(req: AIEmailReq):
    """Generate a formatted official email for a ticket.
    role=customer → email addressed to the office (Claims/Grievance/etc.) team
    role=office   → same format but signed by the office officer, addressed to the customer
    """
    t = await db.tickets.find_one({"id": req.ticket_id}, {"_id": 0})
    if not t:
        raise HTTPException(404, "Ticket not found")

    # AI-crafted subject + concern summary
    subject = await generate_subject(t["parsed_text"])
    concern = await summarize_concern(t["parsed_text"])

    if req.role == "customer":
        # From customer to their office team
        team = team_for(t["service_type"])
        signer_name = req.signer_name or (t.get("customer_name") or "Customer")
        signer_designation = req.signer_designation or "Policyholder"
        department = "—"
        company = "—"
    else:
        # From office to the customer
        off = await db.offices.find_one({"code": t["office_code"]}, {"_id": 0})
        team = t.get("customer_name") or "Customer"
        signer_name = req.signer_name or (off.get("name") if off else "Office")
        signer_designation = req.signer_designation or chief_designation(t["service_type"])
        department = department_for(t["service_type"])
        company = "New India Assurance"

    body = OFFICIAL_TEMPLATE.format(
        team=team,
        customer_name=t.get("customer_name") or "—",
        policy_no=t.get("policy_no") or "—",
        mobile=t.get("mobile") or "—",
        customer_email=req.customer_email or "—",
        subject=subject,
        concern=concern,
        signer_name=signer_name,
        signer_designation=signer_designation,
        department=department,
        company=company,
    )

    delivery = None
    default_to = t.get("target_email") if req.role == "customer" else req.customer_email
    to_addr = req.override_to or default_to
    if req.send and to_addr:
        result = await send_email(to_addr, subject, body)
        n = Notification(
            type="email", to=to_addr, subject=subject, message=body, ticket_id=t["ticket_id"],
        )
        doc = n.to_mongo()
        doc["delivered"] = result.get("sent", False)
        doc["provider_id"] = result.get("id")
        doc["provider_error"] = result.get("error")
        await db.notifications.insert_one(doc)
        await audit(f"ai:{req.role}", "email_sent", "ticket", t["ticket_id"],
                    {"to": to_addr, "delivered": result.get("sent", False)})
        delivery = {"sent": result.get("sent", False), "id": result.get("id"),
                    "error": result.get("error"), "to": to_addr}

    return {
        "subject": subject,
        "body": body,
        "to": to_addr,
        "team": team,
        "signer_designation": signer_designation,
        "delivery": delivery,
    }


# ============================================================
# AUTH — OTP
# ============================================================
@api.post("/auth/otp/send")
async def send_otp(req: OTPSendReq):
    if len(req.mobile) != 10 or not req.mobile.isdigit():
        raise HTTPException(400, "Mobile must be 10 digits")
    otp = f"{random.randint(100000, 999999)}"
    otp_doc = OTP(mobile=req.mobile, otp=otp)
    await db.otps.update_one(
        {"mobile": req.mobile},
        {"$set": otp_doc.to_mongo()},
        upsert=True,
    )
    await push_notification(type="sms", to=req.mobile,
                            message=f"Your Samaadhaan OTP is {otp}. Valid for 5 minutes.")
    await audit(f"customer:{req.mobile}", "otp_sent", "otp", req.mobile)
    return {"status": "sent", "demo_otp": otp}


@api.post("/auth/otp/verify")
async def verify_otp(req: OTPVerifyReq):
    rec = await db.otps.find_one({"mobile": req.mobile}, {"_id": 0})
    if not rec:
        raise HTTPException(401, "OTP not requested")
    otp_doc = OTP(**rec)
    # 5-min TTL
    age = (parse_iso(now_iso()) - parse_iso(otp_doc.created_at)).total_seconds()
    if age > 300:
        raise HTTPException(401, "OTP expired. Please request a new one.")
    if otp_doc.attempts >= 3:
        raise HTTPException(429, "Too many attempts. Please request a new OTP.")
    if otp_doc.otp != req.otp:
        await db.otps.update_one({"mobile": req.mobile}, {"$inc": {"attempts": 1}})
        raise HTTPException(401, "Invalid OTP")
    await db.otps.delete_one({"mobile": req.mobile})
    await audit(f"customer:{req.mobile}", "otp_verified", "otp", req.mobile)
    return {"status": "verified"}


# ============================================================
# POLICY
# ============================================================
@api.post("/policy/verify")
async def verify_policy(req: PolicyVerifyReq):
    if len(req.policy_no) != 20 or not req.policy_no.isdigit():
        raise HTTPException(400, "Policy No must be 20 digits")
    p = await db.policies.find_one({"policy_no": req.policy_no}, {"_id": 0})
    if not p:
        # Not a seeded demo policy — auto-register it so any real customer can proceed.
        office_code = req.policy_no[:6]
        off = await db.offices.find_one({"code": office_code}, {"_id": 0})
        if not off:
            office_code = "admin"
        new_policy = Policy(
            policy_no=req.policy_no, mobile="", office_code=office_code,
            customer_name="Customer", product="General Policy",
        )
        await db.policies.insert_one(new_policy.to_mongo())
        p = new_policy.to_mongo()
    return p


# ============================================================
# OFFICE AUTH
# ============================================================
@api.post("/auth/office/login")
async def office_login(req: OfficeLoginReq):
    o = await db.offices.find_one({"code": req.username, "password": req.password}, {"_id": 0})
    if not o:
        raise HTTPException(401, "Invalid office credentials")
    token = issue_office_token(o["code"], o["name"])
    await audit(o["code"], "login", "office", o["code"])
    return {"token": token, "office": {k: v for k, v in o.items() if k != "password"}}


@api.get("/auth/me")
async def me(payload: dict = Depends(current_office)):
    o = await db.offices.find_one({"code": payload["sub"]}, {"_id": 0, "password": 0})
    return {"office": o, "token_meta": payload}


@api.get("/offices")
async def list_offices():
    return await db.offices.find({}, {"_id": 0, "password": 0}).to_list(100)


# ============================================================
# TICKETS
# ============================================================
@api.post("/tickets")
async def create_ticket(req: TicketCreateReq):
    if len(req.mobile) != 10 or not req.mobile.isdigit():
        raise HTTPException(400, "Invalid mobile number")

    office_code = "admin"
    customer_name = None
    product = None
    if req.customer_type == "existing":
        if not req.policy_no:
            raise HTTPException(400, "Policy No required")
        pol = await db.policies.find_one({"policy_no": req.policy_no}, {"_id": 0})
        if not pol:
            office_code_guess = req.policy_no[:6]
            off_check = await db.offices.find_one({"code": office_code_guess}, {"_id": 0})
            office_code_guess = office_code_guess if off_check else "admin"
            pol = Policy(
                policy_no=req.policy_no, mobile=req.mobile, office_code=office_code_guess,
                customer_name="Customer", product="General Policy",
            ).to_mongo()
            await db.policies.insert_one(pol)
        office_code = pol["office_code"]
        customer_name = pol.get("customer_name")
        product = pol.get("product")

    # Optional LLM classification
    service_type = req.service_type
    priority = "normal"
    sentiment = None
    if req.auto_classify and req.parsed_text:
        cls = await classify_intent(req.parsed_text)
        # Only override service_type for new/service (call center); for existing keep user's choice.
        if req.customer_type == "new":
            service_type = cls["service_type"] if cls["service_type"] != "service" else req.service_type
        priority = cls["priority"]
        sentiment = cls["sentiment"]

    # Resolve target email
    off = await db.offices.find_one({"code": office_code}, {"_id": 0})
    if service_type == "claims":
        target_email = off["claims_email"] if off else "claims@newindia.co.in"
    elif service_type == "grievance":
        target_email = off["grievance_email"] if off else "grievance@newindia.co.in"
    elif req.customer_type == "new":
        target_email = CALL_CENTER_EMAIL
    else:
        target_email = off["email"] if off else "office@newindia.co.in"

    ticket_id = build_ticket_id(req.mobile, req.policy_no)
    ticket = Ticket(
        ticket_id=ticket_id, mobile=req.mobile,
        customer_type=req.customer_type, customer_name=customer_name,
        policy_no=req.policy_no, product=product, service_type=service_type,
        office_code=office_code, target_email=target_email,
        audio_base64=req.audio_base64, parsed_text=req.parsed_text,
        language=req.language, priority=priority, sentiment=sentiment,
    )
    await db.tickets.insert_one(ticket.to_mongo())

    # Compose email in the fixed OFFICIAL template
    subject = f"[Samaadhaan] {service_type.upper()} — {ticket_id}"
    email_body = OFFICIAL_TEMPLATE.format(
        team=team_for(service_type),
        customer_name=customer_name or "New Caller",
        policy_no=req.policy_no or "—",
        mobile=req.mobile,
        customer_email="—",
        subject=subject,
        concern=req.parsed_text,
        signer_name="Samaadhaan Bot",
        signer_designation="Automated Intake",
        department="Customer Dispatch Cell",
        company="New India Assurance",
    )
    await push_notification(
        type="email", to=target_email,
        subject=subject, message=email_body, ticket_id=ticket_id,
    )
    await push_notification(
        type="sms", to=req.mobile,
        message=(
            f"Your issue has been escalated. Ticket: {ticket_id}. Someone from New India will call you shortly."
            if req.customer_type == "new"
            else f"Issue reported. Ticket: {ticket_id}. Concerned office will respond within 24 hours."
        ),
        ticket_id=ticket_id,
    )
    await audit(f"customer:{req.mobile}", "created", "ticket", ticket_id,
                {"office_code": office_code, "service_type": service_type, "priority": priority})
    return ticket.model_dump()


@api.get("/tickets")
async def list_tickets(
    payload: dict = Depends(current_office),
    q: Optional[str] = None,
    status: Optional[str] = None,
    service_type: Optional[str] = None,
    priority: Optional[str] = None,
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
):
    query: dict[str, Any] = office_scope_query(payload)
    if status:
        query["status"] = status
    if service_type:
        query["service_type"] = service_type
    if priority:
        query["priority"] = priority
    if q:
        query["$or"] = [
            {"ticket_id": {"$regex": q, "$options": "i"}},
            {"mobile": {"$regex": q}},
            {"policy_no": {"$regex": q}},
            {"parsed_text": {"$regex": q, "$options": "i"}},
        ]
    total = await db.tickets.count_documents(query)
    skip = (page - 1) * limit
    items = await db.tickets.find(query, {"_id": 0}).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
    return {"total": total, "page": page, "limit": limit, "items": items}


# Public endpoint kept for customer history (no auth needed for own mobile)
@api.get("/history/{mobile}")
async def customer_history(mobile: str):
    if len(mobile) != 10 or not mobile.isdigit():
        raise HTTPException(400, "Invalid mobile")
    return await db.tickets.find({"mobile": mobile}, {"_id": 0}).sort("created_at", -1).to_list(200)


# ---------- Internal INBOX ----------
# Returns the emails routed to the currently-logged-in office as an inbox.
# Admin sees every email; office sees only emails to any of their mail addresses
# (office.email, claims_email, grievance_email).
@api.get("/inbox")
async def inbox(payload: dict = Depends(current_office), limit: int = Query(100, le=500)):
    query: dict[str, Any] = {"type": "email"}
    if payload.get("role") != "admin":
        off = await db.offices.find_one({"code": payload["sub"]}, {"_id": 0})
        if off:
            query["to"] = {"$in": [off["email"], off["claims_email"], off["grievance_email"]]}
        else:
            return []
    mails = await db.notifications.find(query, {"_id": 0}).sort("created_at", -1).to_list(limit)
    # Enrich with ticket data
    ticket_ids = [m.get("ticket_id") for m in mails if m.get("ticket_id")]
    tmap: dict[str, Any] = {}
    if ticket_ids:
        async for t in db.tickets.find({"ticket_id": {"$in": ticket_ids}}, {"_id": 0}):
            tmap[t["ticket_id"]] = t
    for m in mails:
        m["ticket"] = tmap.get(m.get("ticket_id"))
    return mails


@api.post("/inbox/{notif_id}/mark-read")
async def mark_read(notif_id: str, payload: dict = Depends(current_office)):
    await db.notifications.update_one({"id": notif_id}, {"$set": {"read_at": now_iso(), "read_by": payload["sub"]}})
    return {"status": "read"}


# NOTE: literal route MUST be declared before "/tickets/{ticket_pk}" to avoid shadowing.
@api.get("/tickets/export.csv")
async def export_csv(payload: dict = Depends(current_office)):
    scope = office_scope_query(payload)
    tickets = await db.tickets.find(scope, {"_id": 0}).sort("created_at", -1).to_list(5000)
    buf = io.StringIO()
    fields = ["created_at", "ticket_id", "mobile", "policy_no", "customer_type",
              "service_type", "priority", "office_code", "language", "status",
              "attended", "escalated", "parsed_text", "solution_text", "solution_language"]
    w = csv.DictWriter(buf, fieldnames=fields, extrasaction="ignore")
    w.writeheader()
    for t in tickets:
        w.writerow(t)
    buf.seek(0)
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="samaadhaan-{payload["sub"]}.csv"'},
    )


@api.get("/tickets/{ticket_pk}")
async def get_ticket(ticket_pk: str, payload: dict = Depends(current_office)):
    scope = office_scope_query(payload)
    scope["id"] = ticket_pk
    t = await db.tickets.find_one(scope, {"_id": 0})
    if not t:
        raise HTTPException(404, "Ticket not found")
    return t


@api.post("/tickets/{ticket_pk}/resolve")
async def resolve_ticket(ticket_pk: str, req: TicketResolveReq, payload: dict = Depends(current_office)):
    scope = office_scope_query(payload)
    scope["id"] = ticket_pk
    t = await db.tickets.find_one(scope, {"_id": 0})
    if not t:
        raise HTTPException(404, "Ticket not found")

    translated = await translate_text(req.solution_text, req.target_language)
    await db.tickets.update_one(
        {"id": ticket_pk},
        {"$set": {
            "solution_text": req.solution_text,
            "solution_translated": translated,
            "solution_language": req.target_language,
            "attended": True,
            "status": "Done",
            "resolved_at": now_iso(),
            "updated_at": now_iso(),
        }},
    )
    # SMS is disabled for tickets that were escalated (per user spec).
    if not t.get("escalated"):
        await push_notification(
            type="sms", to=t["mobile"],
            message=f"Ticket {t['ticket_id']} resolved. Solution ({LANG_MAP.get(req.target_language, req.target_language)}): {translated[:300]}",
            ticket_id=t["ticket_id"],
        )
    await audit(payload["sub"], "resolved", "ticket", t["ticket_id"],
                {"target_language": req.target_language, "sms_skipped": bool(t.get("escalated"))})
    t.update({
        "solution_text": req.solution_text, "solution_translated": translated,
        "solution_language": req.target_language, "attended": True, "status": "Done",
    })
    return t


@api.post("/tickets/{ticket_pk}/escalate")
async def escalate_ticket(ticket_pk: str, payload: Optional[dict] = None, _actor: str = "system"):
    """Escalate manually or from scheduler.

    Auto-sends a contextual, AI-drafted email through Resend directly to
    manjula.vishal@newindia.co.in (CC: office). No SMS is triggered.
    """
    t = await db.tickets.find_one({"id": ticket_pk}, {"_id": 0})
    if not t:
        raise HTTPException(404, "Ticket not found")
    if t.get("status") == "Done":
        raise HTTPException(400, "Already resolved")

    actor = payload["sub"] if payload else _actor
    reason = "24h+ SLA breach — no action from office" if actor == "system" else f"Manual escalation by {actor}"
    now_dt = parse_iso(now_iso())
    created_dt = parse_iso(t["created_at"])
    age_hours = round(max((now_dt - created_dt).total_seconds(), 0) / 3600, 1)
    escalation_number = int(t.get("escalation_count", 0)) + 1

    await db.tickets.update_one(
        {"id": ticket_pk},
        {"$set": {"escalated": True, "status": "Escalated", "updated_at": now_iso()},
         "$inc": {"escalation_count": 1}},
    )

    # Fresh AI classification snapshot at escalation time (priority + sentiment).
    cls = await classify_intent(t.get("parsed_text", "")) if t.get("parsed_text") else {"priority": t.get("priority"), "sentiment": t.get("sentiment"), "service_type": t.get("service_type")}
    # Persist enriched signals back onto the ticket.
    await db.tickets.update_one(
        {"id": ticket_pk},
        {"$set": {
            "priority": cls.get("priority") or t.get("priority") or "normal",
            "sentiment": cls.get("sentiment") or t.get("sentiment"),
        }},
    )

    concern_summary = await summarize_concern(t.get("parsed_text", ""))
    ai_subject = await generate_subject(t.get("parsed_text", ""))
    subject = f"[URGENT · ESCALATION #{escalation_number}] {ai_subject} — {t['ticket_id']}"

    off = await db.offices.find_one({"code": t.get("office_code")}, {"_id": 0})
    office_mail = off.get("email") if off else t.get("target_email")
    office_name = off.get("name") if off else t.get("office_code")

    context_lines = [
        f"IMMEDIATE ATTENTION REQUIRED — {reason}.",
        "",
        f"Ticket ID: {t['ticket_id']}",
        f"Age since creation: {age_hours} hours",
        f"Escalation attempt: #{escalation_number}",
        f"Assigned office: {office_name} ({t.get('office_code')})",
        f"Service category: {t.get('service_type', '').upper()}",
        f"Priority (AI-classified): {cls.get('priority', 'normal').upper()}",
        f"Sentiment (AI-classified): {cls.get('sentiment', 'neutral').upper()}",
        f"Original language: {t.get('language', 'en').upper()}",
        "",
        "─── Customer's concern (AI-summarised) ───",
        concern_summary,
        "",
        "─── Verbatim voice-note transcript ───",
        t.get("parsed_text", "(no transcript)"),
    ]
    concern_block = "\n".join(context_lines)

    body = OFFICIAL_TEMPLATE.format(
        team="Manjula Vishal (Higher Authority)",
        customer_name=t.get("customer_name") or "New Caller",
        policy_no=t.get("policy_no") or "—",
        mobile=t.get("mobile") or "—",
        customer_email="—",
        subject=ai_subject,
        concern=concern_block,
        signer_name="Samaadhaan Automated Escalation",
        signer_designation="24h SLA Watchdog",
        department="Grievance Cell",
        company="New India Assurance",
    )

    # Auto-deliver through Resend, straight to Manjula (no override).
    n = Notification(
        type="email", to=HIGHER_AUTHORITY_EMAIL,
        subject=subject, message=body, ticket_id=t["ticket_id"],
    )
    doc = n.to_mongo()
    result = await send_email(HIGHER_AUTHORITY_EMAIL, subject, body,
                              cc=[office_mail] if office_mail else None,
                              bypass_override=True)

    # Sandbox fallback: if Resend rejected because the domain is not verified,
    # retry via the standard TEST_EMAIL_OVERRIDE pathway so the demo still lands
    # in the user's inbox. The subject/body already contain the intended
    # recipient thanks to the override wrapper.
    fallback = False
    if not result.get("sent"):
        err = (result.get("error") or "").lower()
        if "verify a domain" in err or "own email address" in err:
            retry = await send_email(HIGHER_AUTHORITY_EMAIL, subject, body, cc=None,
                                     bypass_override=False)
            if retry.get("sent"):
                result = retry
                fallback = True

    doc["delivered"] = result.get("sent", False)
    doc["provider_id"] = result.get("id")
    doc["provider_error"] = result.get("error")
    doc["cc"] = [office_mail] if office_mail else []
    doc["fallback_used"] = fallback
    await db.notifications.insert_one(doc)

    await audit(actor, "escalated", "ticket", t["ticket_id"],
                {"to": HIGHER_AUTHORITY_EMAIL, "cc": office_mail, "reason": reason,
                 "age_hours": age_hours, "attempt": escalation_number,
                 "delivered": result.get("sent", False), "fallback": fallback})
    return {
        "status": "escalated",
        "delivered": result.get("sent", False),
        "email_id": result.get("id"),
        "to": HIGHER_AUTHORITY_EMAIL,
        "cc": office_mail,
        "fallback_used": fallback,
    }


@api.post("/tickets/{ticket_pk}/escalate-auth")
async def escalate_authed(ticket_pk: str, payload: dict = Depends(current_office)):
    return await escalate_ticket(ticket_pk, payload=payload)


@api.post("/tickets/{ticket_pk}/simulate-aging")
async def simulate_aging(ticket_pk: str, payload: dict = Depends(current_office)):
    r = await db.tickets.update_one({"id": ticket_pk}, {"$set": {"created_at": hours_ago_iso(25)}})
    if r.matched_count == 0:
        raise HTTPException(404, "Ticket not found")
    await audit(payload["sub"], "aged", "ticket", ticket_pk)
    return {"status": "aged"}


@api.post("/tickets/auto-escalate")
async def auto_escalate_stale(payload: dict = Depends(current_office)):
    return await _run_auto_escalate(actor=payload["sub"])


async def _run_auto_escalate(actor: str = "system") -> dict:
    cutoff = hours_ago_iso(24)
    stale = await db.tickets.find(
        {"status": "Open", "escalated": False, "created_at": {"$lt": cutoff}}, {"_id": 0}
    ).to_list(500)
    for t in stale:
        try:
            await escalate_ticket(t["id"], payload=None, _actor=actor)
        except HTTPException:
            pass
    if stale:
        logger.info(f"Auto-escalated {len(stale)} ticket(s) by {actor}")
    return {"escalated_count": len(stale)}


# ============================================================
# ANALYTICS
# ============================================================
@api.get("/analytics/summary")
async def analytics_summary(payload: dict = Depends(current_office)):
    scope = office_scope_query(payload)
    tickets = await db.tickets.find(scope, {"_id": 0}).to_list(2000)
    total = len(tickets)
    by_status = {"Open": 0, "InProgress": 0, "Escalated": 0, "Done": 0}
    by_service = {"policy": 0, "claims": 0, "grievance": 0, "service": 0}
    by_priority = {"low": 0, "normal": 0, "high": 0, "urgent": 0}
    by_office: dict[str, int] = {}
    for t in tickets:
        by_status[t.get("status", "Open")] = by_status.get(t.get("status", "Open"), 0) + 1
        by_service[t.get("service_type", "service")] = by_service.get(t.get("service_type", "service"), 0) + 1
        by_priority[t.get("priority", "normal")] = by_priority.get(t.get("priority", "normal"), 0) + 1
        by_office[t.get("office_code", "?")] = by_office.get(t.get("office_code", "?"), 0) + 1

    # Compute avg resolution time (hours)
    resolved = [t for t in tickets if t.get("resolved_at")]
    avg_hours = 0.0
    if resolved:
        total_sec = 0.0
        for t in resolved:
            dt = (parse_iso(t["resolved_at"]) - parse_iso(t["created_at"])).total_seconds()
            total_sec += max(dt, 0)
        avg_hours = round((total_sec / len(resolved)) / 3600, 2)

    # Last 7 day trend
    from datetime import timedelta as _td
    from core import now_utc
    days = []
    for i in range(6, -1, -1):
        day_start = (now_utc() - _td(days=i)).replace(hour=0, minute=0, second=0, microsecond=0)
        day_end = day_start + _td(days=1)
        count = sum(
            1 for t in tickets
            if day_start.isoformat() <= t["created_at"] < day_end.isoformat()
        )
        days.append({"day": day_start.strftime("%b %d"), "count": count})

    return {
        "total": total, "by_status": by_status, "by_service": by_service,
        "by_priority": by_priority, "by_office": by_office,
        "avg_resolution_hours": avg_hours, "trend_7d": days,
    }


# ============================================================
# CSV EXPORT — moved above /tickets/{ticket_pk} to avoid route shadowing
# ============================================================


# ============================================================
# NOTIFICATIONS + AUDIT
# ============================================================
@api.get("/notifications")
async def list_notifications(payload: dict = Depends(current_office),
                             ticket_id: Optional[str] = None, to: Optional[str] = None,
                             limit: int = Query(200, le=500)):
    query: dict[str, Any] = {}
    if ticket_id:
        query["ticket_id"] = ticket_id
    if to:
        query["to"] = to

    # Scope: non-admin sees notifications tied to their tickets
    if payload.get("role") != "admin":
        scoped = await db.tickets.find({"office_code": payload["sub"]}, {"ticket_id": 1, "_id": 0}).to_list(2000)
        ids = [x["ticket_id"] for x in scoped]
        query["ticket_id"] = {"$in": ids} if "ticket_id" not in query else query["ticket_id"]

    return await db.notifications.find(query, {"_id": 0}).sort("created_at", -1).to_list(limit)


@api.get("/audit")
async def list_audit(payload: dict = Depends(current_office),
                     entity: Optional[str] = None, entity_ref: Optional[str] = None,
                     limit: int = Query(200, le=500)):
    if payload.get("role") != "admin":
        raise HTTPException(403, "Admin only")
    q: dict[str, Any] = {}
    if entity:
        q["entity"] = entity
    if entity_ref:
        q["entity_ref"] = entity_ref
    return await db.audits.find(q, {"_id": 0}).sort("created_at", -1).to_list(limit)


# ============================================================
# LLM UTILITIES
# ============================================================
@api.post("/translate")
async def translate(req: TranslateReq):
    return {"translated": await translate_text(req.text, req.target_language), "language": req.target_language}


@api.post("/classify")
async def classify(req: ClassifyReq):
    return await classify_intent(req.text)


# ============================================================
# ROOT
# ============================================================
@api.post("/admin/wipe")
async def wipe_all(payload: dict = Depends(current_office)):
    """Admin-only: purge tickets, notifications, and audit history. Keeps offices + policies."""
    if payload.get("role") != "admin":
        raise HTTPException(403, "Admin only")
    r1 = await db.tickets.delete_many({})
    r2 = await db.notifications.delete_many({})
    r3 = await db.audits.delete_many({})
    r4 = await db.otps.delete_many({})
    await audit("admin", "wipe", "system", details={
        "tickets": r1.deleted_count, "notifications": r2.deleted_count,
        "audits": r3.deleted_count, "otps": r4.deleted_count,
    })
    return {
        "tickets": r1.deleted_count, "notifications": r2.deleted_count,
        "audits": r3.deleted_count, "otps": r4.deleted_count,
    }


@api.get("/")
async def root():
    return {"service": "Samaadhaan API", "version": "2.0", "status": "ok"}


# ============================================================
# LIFECYCLE
# ============================================================
@app.on_event("startup")
async def on_start():
    await seed_data()
    # Real 24h auto-escalation — run every 10 minutes
    scheduler.add_job(_run_auto_escalate, "interval", minutes=10, id="auto-escalate", replace_existing=True)
    scheduler.start()
    logger.info("Samaadhaan v2 started · scheduler running · seed complete")


@app.on_event("shutdown")
async def on_stop():
    try:
        scheduler.shutdown(wait=False)
    except Exception:
        pass
    mongo_client.close()


app.include_router(api)
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)
