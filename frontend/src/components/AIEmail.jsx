import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { Button } from "./ui/button";
import { Sparkles, Copy, Mail, Check } from "lucide-react";
import { api } from "@/lib/api";
import { toast } from "sonner";

const DARK = "#080C14", PANEL = "#0F1626", BORDER = "#1E293B", GOLD = "#FBBF24", MUTED = "#94A3B8", LIGHT = "#F1F5F9";

// Modal that requests a fixed-format AI-drafted email from the backend and renders it.
export default function AIEmail({ ticketId, role = "customer", trigger, customerEmail }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState(null);
  const [copied, setCopied] = useState(false);

  const generate = async () => {
    if (!ticketId) return toast.error("No ticket selected");
    setBusy(true); setDraft(null);
    try {
      const r = await api.post("/emails/draft", { ticket_id: ticketId, role, customer_email: customerEmail });
      setDraft(r.data);
    } catch (e) { toast.error(e.response?.data?.detail || "Failed"); }
    setBusy(false);
  };

  const openDialog = () => { setOpen(true); if (!draft) generate(); };
  const copyBody = async () => {
    if (!draft) return;
    await navigator.clipboard.writeText(draft.body);
    setCopied(true); setTimeout(() => setCopied(false), 1400);
    toast.success("Email body copied");
  };
  const mailto = () => {
    if (!draft) return;
    const to = draft.to || "";
    window.location.href = `mailto:${to}?subject=${encodeURIComponent(draft.subject)}&body=${encodeURIComponent(draft.body)}`;
  };

  return (
    <>
      {trigger ? (
        <span onClick={openDialog}>{trigger}</span>
      ) : (
        <button onClick={openDialog}
          className="inline-flex items-center gap-2 mono text-[11px] uppercase tracking-widest hover:underline"
          style={{ color: GOLD }}
          data-testid={`ai-email-${role}`}>
          <Sparkles size={12} /> Generate AI email
        </button>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto"
          style={{ background: PANEL, border: `1px solid ${BORDER}`, color: LIGHT }}>
          <DialogHeader>
            <DialogTitle className="aesthetic-serif text-3xl flex items-center gap-2" style={{ color: LIGHT }}>
              <Sparkles size={20} style={{ color: GOLD }} /> AI-drafted email
            </DialogTitle>
          </DialogHeader>

          {busy && (
            <div className="py-14 text-center mono text-xs uppercase tracking-widest" style={{ color: MUTED }}>
              Drafting envelope…
            </div>
          )}

          {draft && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 mono text-xs">
                <div><span className="text-[10px] uppercase tracking-widest" style={{ color: MUTED }}>To · </span>{draft.to || "(customer)"}</div>
                <div><span className="text-[10px] uppercase tracking-widest" style={{ color: MUTED }}>Signed · </span>{draft.signer_designation}</div>
              </div>
              <div>
                <div className="mono text-[10px] uppercase tracking-widest mb-1" style={{ color: MUTED }}>Subject</div>
                <div className="rounded-md p-3 aesthetic-serif text-lg"
                     style={{ background: DARK, border: `1px solid ${BORDER}` }}>{draft.subject}</div>
              </div>
              <div>
                <div className="mono text-[10px] uppercase tracking-widest mb-1" style={{ color: MUTED }}>Body</div>
                <pre className="rounded-md p-4 whitespace-pre-wrap text-sm font-sans"
                     style={{ background: DARK, border: `1px solid ${BORDER}`, color: LIGHT, fontFamily: "'Plus Jakarta Sans',sans-serif" }}
                     data-testid="ai-email-body">
{draft.body}
                </pre>
              </div>
              <div className="flex gap-2 flex-wrap">
                <Button onClick={copyBody}
                  className="uppercase mono tracking-widest font-bold"
                  style={{ background: GOLD, color: DARK }}
                  data-testid="copy-email-btn">
                  {copied ? <Check size={14} className="mr-2" /> : <Copy size={14} className="mr-2" />}
                  {copied ? "Copied" : "Copy body"}
                </Button>
                <Button variant="outline" onClick={mailto}
                  className="uppercase mono tracking-widest"
                  style={{ background: PANEL, borderColor: BORDER, color: LIGHT }}
                  data-testid="mailto-btn">
                  <Mail size={14} className="mr-2" /> Open in email app
                </Button>
                <Button variant="ghost" onClick={generate}
                  className="uppercase mono tracking-widest"
                  style={{ color: MUTED }}
                  data-testid="regenerate-btn">
                  <Sparkles size={12} className="mr-2" /> Regenerate
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
