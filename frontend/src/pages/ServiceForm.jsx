import React, { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import Shell from "@/components/Shell";
import { Button } from "@/components/ui/button";
import AudioCapture from "@/components/AudioCapture";
import { api } from "@/lib/api";
import { ticketDraft } from "@/lib/session";
import { toast } from "sonner";
import { FileText, Shield, MessageSquareWarning, HeartHandshake, Send, Radio, RotateCcw } from "lucide-react";

const DARK = "#080C14", PANEL = "#0F1626", BORDER = "#1E293B", GOLD = "#FBBF24", BLUE = "#3B82F6", MUTED = "#94A3B8";

const SERVICES = [
  { key: "policy", label: "Policy", icon: Shield, hint: "Endorsement · premium · renewal" },
  { key: "claims", label: "Claims", icon: FileText, hint: "New claim · document · status" },
  { key: "grievance", label: "Grievance", icon: MessageSquareWarning, hint: "Complaint · dissatisfaction" },
];

export default function ServiceForm() {
  const nav = useNavigate();
  const [sp] = useSearchParams();
  const mobile = sp.get("mobile");
  const policy = sp.get("policy");
  const customerType = sp.get("type");

  const [service, setService] = useState(customerType === "new" ? "service" : null);
  const [text, setText] = useState("");
  const [audio, setAudio] = useState(null);
  const [language, setLanguage] = useState("hi");
  const [busy, setBusy] = useState(false);

  // Restore draft on mount (per-mobile)
  useEffect(() => {
    if (!mobile) return;
    const d = ticketDraft.get(mobile);
    if (!d) return;
    if (d.service) setService(d.service);
    if (d.text) setText(d.text);
    if (d.audio) setAudio(d.audio);
    if (d.language) setLanguage(d.language);
  }, [mobile]);

  // Persist draft on any change
  useEffect(() => {
    if (!mobile) return;
    ticketDraft.set(mobile, { service, text, audio, language });
  }, [mobile, service, text, audio, language]);

  const clearDraft = () => {
    setText(""); setAudio(null); setService(customerType === "new" ? "service" : null); setLanguage("hi");
    ticketDraft.clear(mobile);
    toast("Draft cleared");
  };

  const submit = async () => {
    if (!text.trim() && !audio) return toast.error("Record a voice note or type your issue.");
    setBusy(true);
    try {
      const r = await api.post("/tickets", {
        mobile, customer_type: customerType, policy_no: policy || null,
        service_type: service, audio_base64: audio, parsed_text: text, language,
        auto_classify: true,
      });
      toast.success(`Ticket ${r.data.ticket_id} dispatched. SMS sent.`);
      ticketDraft.clear(mobile);
      nav(`/customer/history?mobile=${mobile}&new=${r.data.ticket_id}`);
    } catch (e) { toast.error(e.response?.data?.detail || "Failed"); }
    setBusy(false);
  };

  return (
    <Shell back>
      <div className="mt-10 grid lg:grid-cols-12 gap-8">
        <div className="lg:col-span-5">
          <div className="mono text-[10px] uppercase tracking-[0.28em]" style={{ color: GOLD }}>
            Node 02 · {customerType === "new" ? "Care intake" : "Category routing"}
          </div>
          <h2 className="aesthetic-serif text-5xl leading-[0.98] mt-4">Compose your envelope.</h2>
          <p className="mt-5 max-w-sm text-sm leading-relaxed" style={{ color: MUTED }}>
            Speak naturally in any Indian language. The AI transcribes on-device and dispatches the audio + text to the correct desk.
          </p>

          <div className="mt-6 p-4 rounded-xl mono text-xs" style={{ background: PANEL, border: `1px solid ${BORDER}` }}>
            <div className="flex items-center justify-between"><span style={{ color: MUTED }}>MOBILE</span><span>{mobile}</span></div>
            {policy && <div className="flex items-center justify-between mt-1"><span style={{ color: MUTED }}>POLICY</span><span>{policy}</span></div>}
            <div className="flex items-center justify-between mt-1"><span style={{ color: MUTED }}>TYPE</span><span className="uppercase">{customerType}</span></div>
            <div className="flex items-center justify-between mt-1"><span style={{ color: MUTED }}>TICKET</span>
              <span>{mobile}_{policy || "TKT####"}</span></div>
          </div>

          {customerType === "existing" && (
            <div className="mt-6 grid gap-3">
              {SERVICES.map(({ key, label, icon: Icon, hint }) => (
                <button key={key} onClick={() => setService(key)}
                  className="text-left card-lift rounded-xl p-4 flex gap-3 items-start"
                  style={{
                    background: PANEL,
                    border: `1px solid ${service === key ? GOLD : BORDER}`,
                  }}
                  data-testid={`service-${key}`}
                >
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                       style={{ background: DARK, border: `1px solid ${BORDER}`, color: service === key ? GOLD : BLUE }}>
                    <Icon size={16} />
                  </div>
                  <div>
                    <div className="aesthetic-serif text-2xl leading-none">{label}</div>
                    <div className="text-xs mt-1" style={{ color: MUTED }}>{hint}</div>
                  </div>
                </button>
              ))}
            </div>
          )}

          {customerType === "new" && (
            <div className="mt-6 rounded-xl p-5 flex gap-3" style={{ background: PANEL, border: `1px solid ${BORDER}` }}>
              <HeartHandshake className="shrink-0 mt-1" size={20} style={{ color: GOLD }} />
              <div>
                <div className="aesthetic-serif text-2xl">Customer Care</div>
                <div className="text-xs mt-1" style={{ color: MUTED }}>
                  Nearest office · product help · general query. Someone from New India will call you back.
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="lg:col-span-7">
          <div className="rounded-2xl p-6" style={{ background: PANEL, border: `1px solid ${BORDER}` }}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2 mono text-[10px] uppercase tracking-[0.28em]" style={{ color: MUTED }}>
                <Radio size={11} style={{ color: GOLD }} />
                Recording for · <span style={{ color: "#F1F5F9" }}>{customerType === "new" ? "Customer Care" : (service || "…")}</span>
              </div>
              <div className="mono text-[10px] uppercase tracking-[0.28em]" style={{ color: MUTED }}>2 min cap</div>
            </div>

            {(customerType === "new" || service) ? (
              <div className="space-y-4">
                <AudioCapture
                  value={text} onChange={setText}
                  audioBase64={audio} onAudioChange={setAudio}
                  language={language} onLanguageChange={setLanguage}
                />
                <div className="pt-4 flex items-center justify-between" style={{ borderTop: `1px solid ${BORDER}` }}>
                  <div className="flex items-center gap-3">
                    <div className="mono text-[11px]" style={{ color: MUTED }}>
                      Dispatch → {customerType === "new" ? "ravikant.vishl@newindia.co.in" : `nia.${policy ? policy.slice(0, 6) : "…"}@newindia.co.in`}
                    </div>
                    {(text || audio) && (
                      <button onClick={clearDraft}
                        className="mono text-[10px] uppercase tracking-widest inline-flex items-center gap-1"
                        style={{ color: MUTED }} data-testid="clear-draft-btn">
                        <RotateCcw size={10} /> clear draft
                      </button>
                    )}
                  </div>
                  <Button onClick={submit} disabled={busy}
                    className="uppercase mono tracking-widest font-bold"
                    style={{ background: GOLD, color: DARK }}
                    data-testid="submit-ticket-btn">
                    <Send className="mr-2" size={14} /> Dispatch envelope
                  </Button>
                </div>
              </div>
            ) : (
              <div className="text-center py-16 mono text-xs uppercase tracking-widest" style={{ color: MUTED }}>
                Select a category on the left to begin recording.
              </div>
            )}
          </div>
        </div>
      </div>
    </Shell>
  );
}
