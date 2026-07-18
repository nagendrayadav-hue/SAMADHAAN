import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import { AlertTriangle, ExternalLink } from "lucide-react";
import { api } from "@/lib/api";
import { toast } from "sonner";

const DARK = "#080C14", PANEL = "#0F1626", BORDER = "#1E293B", GOLD = "#FBBF24", MUTED = "#94A3B8", LIGHT = "#F1F5F9";

const APP_NAME = "Samaadhaan (New India Assurance grievance portal)";
const MANJULA = "manjula.vishal@newindia.co.in";

function buildBody({ customerName, caseId, adminName, priority, description, findings, businessImpact }) {
  return `Dear Manjula,

I would like to bring the following issue to your attention for your review and support.

Issue Summary:
Customer: ${customerName || "—"}
Case/Service Request ID: ${caseId || "—"}
Product/Release: ${APP_NAME}
Severity/Priority: ${priority || "—"}
Issue Description: ${description || "—"}

Current Status:
${findings || "[Summary of findings and troubleshooting completed so far]"}

Business Impact:
${businessImpact || "[Urgency and service disruption details]"}

Support Required:
Kindly review the issue and help with the necessary guidance/action to move this forward at the earliest.

Thanks & Regards,
${adminName || "—"}`;
}

export default function EscalateModal({ open, onOpenChange, ticket, adminDefault, onEscalated }) {
  const [customerName, setCustomerName] = useState("");
  const [caseId, setCaseId] = useState("");
  const [adminName, setAdminName] = useState("");
  const [findings, setFindings] = useState("");
  const [businessImpact, setBusinessImpact] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open || !ticket) return;
    setCustomerName(ticket.customer_name || "");
    setCaseId(ticket.ticket_id || "");
    setAdminName(adminDefault || "");
    setFindings("");
    setBusinessImpact("");
  }, [open, ticket, adminDefault]);

  const submit = async () => {
    if (!customerName.trim() || !caseId.trim() || !adminName.trim()) {
      return toast.error("Customer Name, Case ID and Admin Name are all required.");
    }
    setBusy(true);
    try {
      // Mark the ticket escalated on the backend (audit + status)
      const r = await api.post(`/tickets/${ticket.id}/escalate-auth`);
      if (onEscalated) onEscalated(r.data);

      const priority = (ticket.priority || "normal").toUpperCase();
      const description = ticket.parsed_text || "";
      const subject = `[Escalation] ${caseId} — ${customerName}`;
      const body = buildBody({
        customerName, caseId, adminName, priority, description, findings, businessImpact,
      });

      const url = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(MANJULA)}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
      window.open(url, "_blank", "noopener");
      toast.success("Ticket escalated · Gmail compose opened.");
      onOpenChange(false);
    } catch (e) { toast.error(e.response?.data?.detail || "Failed"); }
    setBusy(false);
  };

  const preview = ticket
    ? buildBody({
        customerName, caseId, adminName,
        priority: (ticket.priority || "normal").toUpperCase(),
        description: ticket.parsed_text,
        findings, businessImpact,
      })
    : "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto"
        style={{ background: PANEL, border: `1px solid ${BORDER}`, color: LIGHT }}>
        <DialogHeader>
          <DialogTitle className="font-display text-3xl flex items-center gap-2" style={{ color: LIGHT }}>
            <AlertTriangle size={20} style={{ color: "#F87171" }} /> Escalate to Manjula Vishal
          </DialogTitle>
        </DialogHeader>

        <div className="mono text-[11px] uppercase tracking-widest" style={{ color: MUTED }}>
          To: {MANJULA} · Ticket status will be marked Escalated on submit.
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-4">
          <label className="block">
            <div className="mono text-[10px] uppercase tracking-widest mb-1" style={{ color: MUTED }}>Customer Name *</div>
            <Input value={customerName} onChange={(e) => setCustomerName(e.target.value)}
              className="h-10" style={{ background: DARK, borderColor: BORDER }} data-testid="esc-customer" />
          </label>
          <label className="block">
            <div className="mono text-[10px] uppercase tracking-widest mb-1" style={{ color: MUTED }}>Case ID *</div>
            <Input value={caseId} onChange={(e) => setCaseId(e.target.value)}
              className="mono h-10" style={{ background: DARK, borderColor: BORDER }} data-testid="esc-caseid" />
          </label>
          <label className="block">
            <div className="mono text-[10px] uppercase tracking-widest mb-1" style={{ color: MUTED }}>Admin Name *</div>
            <Input value={adminName} onChange={(e) => setAdminName(e.target.value)}
              className="h-10" style={{ background: DARK, borderColor: BORDER }} data-testid="esc-admin" />
          </label>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
          <label className="block">
            <div className="mono text-[10px] uppercase tracking-widest mb-1" style={{ color: MUTED }}>Current status · findings so far</div>
            <Textarea rows={3} value={findings} onChange={(e) => setFindings(e.target.value)}
              placeholder="Steps taken, blockers…"
              style={{ background: DARK, borderColor: BORDER, color: LIGHT }} data-testid="esc-findings" />
          </label>
          <label className="block">
            <div className="mono text-[10px] uppercase tracking-widest mb-1" style={{ color: MUTED }}>Business impact</div>
            <Textarea rows={3} value={businessImpact} onChange={(e) => setBusinessImpact(e.target.value)}
              placeholder="Urgency, disruption, customer sentiment…"
              style={{ background: DARK, borderColor: BORDER, color: LIGHT }} data-testid="esc-impact" />
          </label>
        </div>

        <div className="mt-4">
          <div className="mono text-[10px] uppercase tracking-widest mb-1" style={{ color: MUTED }}>Preview</div>
          <pre className="rounded-md p-4 whitespace-pre-wrap text-sm"
               style={{ background: DARK, border: `1px solid ${BORDER}`, color: LIGHT }}
               data-testid="esc-preview">
{preview}
          </pre>
        </div>

        <div className="mt-4 flex gap-2 flex-wrap">
          <Button onClick={submit} disabled={busy}
            className="uppercase mono tracking-widest font-bold"
            style={{ background: "#DC2626", color: "#fff" }} data-testid="esc-submit-btn">
            <ExternalLink size={14} className="mr-2" /> {busy ? "Escalating…" : "Escalate & open Gmail"}
          </Button>
          <Button variant="ghost" onClick={() => onOpenChange(false)}
            className="uppercase mono tracking-widest" style={{ color: MUTED }}>
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
