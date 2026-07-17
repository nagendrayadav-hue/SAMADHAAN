# Samaadhaan — Product Requirements Document

## Original problem statement
Multi-role New India Assurance customer service portal ("Samaadhaan") with:
- Customer / Office login split
- New customer: mobile + OTP → service ticket → mail to `ravikant.vishl@newindia.co.in`, ticket id `Mobile_TktID`, SMS confirmation
- Existing customer: mobile + policy (20-digit) + OTP → Policy / Claims / Grievance → audio note (2 min) or mail → NLP → routed to office/claims/grievance email of the office code
- Office console (`670100`, `940000`, `admin`) — filtered ticket dashboard, resolve in English → translate to local language → send to customer as SMS
- 24-hour escalation to Manjula Vishal (`manjula.vishal@newindia.co.in`)

## Personas
1. **New customer** — never held a policy; searching for nearest office or product help.
2. **Existing customer** — verified by policy; needs help on their policy / a claim / a grievance.
3. **Regional office user** — code-scoped; resolves tickets in-language.
4. **Admin** — cross-office visibility, exports, audit.
5. **Higher authority (Manjula Vishal)** — receives auto-escalations of stale tickets.

## What's implemented (v2 · 2026-07-17)
### Backend (`/app/backend/server.py`, `core.py`, `models.py`, `llm.py`)
- FastAPI + Motor + APScheduler + JWT
- OTP send/verify with 5-min TTL + 3-attempt lockout
- Policy verify (20-digit format check + existence)
- Office login → JWT bearer token (12h TTL); admin vs office role scoping on every list endpoint
- Ticket create with automatic routing:
  - New customer → `ravikant.vishl@newindia.co.in`
  - Existing/policy → office email
  - Existing/claims → office claims_email
  - Existing/grievance → office grievance_email
- Optional LLM auto-classification (Claude Sonnet 4.6 via Emergent LLM key) — service_type + priority + sentiment
- Ticket resolve: solution in English + LLM translation to any of 10 Indian languages + mock SMS to customer
- Escalation:
  - Manual "Escalate now" from dashboard
  - "Simulate 25h" for demo
  - Real background APScheduler job (every 10 min) auto-escalates any Open ticket older than 24h
  - Escalation notifies `manjula.vishal@newindia.co.in` + office
- Analytics endpoint (by status/service/priority/office, avg resolution hours, 7-day trend)
- Ticket search + pagination (`q`, `status`, `service_type`, `priority`, `page`, `limit`)
- CSV export (`/tickets/export.csv`)
- Full audit log (admin-only) — every create/resolve/escalate/login recorded
- Mocked SMS + email routed through `notifications` collection & visible in office dashboard

### Frontend (`/app/frontend/src/*`)
- React + React Router + shadcn/ui + Sonner + custom fonts (Instrument Serif + DM Sans)
- Aesthetic: cream (`#f6f1e8`) + navy (`#14213d`) + saffron (`#fb923c`) — Indian-editorial feel; grain overlay + tape header
- Pages:
  - `/` Home — Customer / Office picker
  - `/customer` — new/existing tabs → mobile → OTP (demo OTP shown) → policy verify
  - `/customer/service` — service chooser + AudioCapture (MediaRecorder + Web Speech API) + language picker → ticket submit
  - `/customer/history` — mobile-scoped ticket list with TTS playback of translated solution
  - `/office/login` — quick-fill office chips + JWT login
  - `/office/dashboard` — analytics tiles, filters (search/status/service/priority) + pagination, ticket dialog (resolve/translate/escalate/simulate-25h), notifications tab, insights tab (bar charts), CSV export

## Backlog (P1/P2)
- P1: Real SMS via Twilio + real email via Resend/SendGrid
- P1: Multi-tenant office user accounts (multiple users per office)
- P2: Whisper-based server-side transcription (fallback for browsers without Web Speech API)
- P2: Attachment storage (S3) instead of base64 audio in Mongo
- P2: Push notifications / websocket for real-time ticket updates
- P2: OMBUDSMAN / IRDAI escalation tier above Manjula
- P2: Customer self-service SLA tracker with countdown
