import React, { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import Shell from "@/components/Shell";
import { api } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Volume2 } from "lucide-react";
import AIEmail from "@/components/AIEmail";

const DARK = "#080C14", PANEL = "#0F1626", BORDER = "#1E293B", GOLD = "#FBBF24", BLUE = "#3B82F6", MUTED = "#94A3B8";

const statusPill = {
  Done: { bg: "rgba(16,185,129,0.12)", color: "#10B981", border: "rgba(16,185,129,0.3)" },
  Open: { bg: "rgba(251,191,36,0.12)", color: "#FBBF24", border: "rgba(251,191,36,0.3)" },
  InProgress: { bg: "rgba(59,130,246,0.12)", color: "#3B82F6", border: "rgba(59,130,246,0.3)" },
  Escalated: { bg: "rgba(239,68,68,0.15)", color: "#F87171", border: "rgba(239,68,68,0.35)" },
};

const LOC = { hi: "hi-IN", mr: "mr-IN", ta: "ta-IN", te: "te-IN", bn: "bn-IN", gu: "gu-IN", kn: "kn-IN", ml: "ml-IN", pa: "pa-IN", en: "en-IN" };

export default function CustomerHistory() {
  const [sp] = useSearchParams();
  const mobile = sp.get("mobile");
  const [tickets, setTickets] = useState([]);

  useEffect(() => {
    if (!mobile) return;
    api.get(`/history/${mobile}`).then((r) => setTickets(r.data));
    const t = setInterval(() => { api.get(`/history/${mobile}`).then((r) => setTickets(r.data)); }, 8000);
    return () => clearInterval(t);
  }, [mobile]);

  const speak = (text, lang) => {
    if (!text || !window.speechSynthesis) return;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = LOC[lang] || "en-IN";
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  };

  return (
    <Shell back>
      <div className="mt-10">
        <div className="mono text-[10px] uppercase tracking-[0.28em]" style={{ color: GOLD }}>Session Logs</div>
        <h2 className="aesthetic-serif text-5xl leading-[0.98] mt-4">Your dispatched envelopes.</h2>
        <div className="mt-3 mono text-xs" style={{ color: MUTED }}>MOBILE · {mobile} · live-refresh every 8s</div>

        <div className="mt-8 space-y-3">
          {tickets.length === 0 && (
            <div className="text-center py-20 rounded-2xl mono text-xs uppercase tracking-widest"
                 style={{ background: PANEL, border: `1px dashed ${BORDER}`, color: MUTED }}>
              No envelopes on file.
            </div>
          )}
          {tickets.map((t) => {
            const s = statusPill[t.status] || statusPill.Open;
            return (
              <div key={t.id} className="rounded-2xl p-6" style={{ background: PANEL, border: `1px solid ${BORDER}` }} data-testid={`ticket-${t.ticket_id}`}>
                <div className="flex items-start justify-between flex-wrap gap-3">
                  <div>
                    <div className="mono text-[10px] uppercase tracking-widest" style={{ color: MUTED }}>{new Date(t.created_at).toLocaleString()}</div>
                    <div className="aesthetic-serif text-2xl mt-1">{t.ticket_id}</div>
                    <div className="mono text-[10px] uppercase tracking-[0.24em] mt-1" style={{ color: MUTED }}>
                      {t.service_type} · office {t.office_code} · lang {t.language}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-1 rounded-md mono text-[10px] uppercase tracking-widest"
                          style={{ background: s.bg, color: s.color, border: `1px solid ${s.border}` }}>{t.status}</span>
                    <Badge variant="outline" style={{ borderColor: BORDER, color: t.attended ? "#10B981" : MUTED }}>
                      {t.attended ? "Attended" : "Pending"}
                    </Badge>
                  </div>
                </div>
                <div className="mt-4 grid md:grid-cols-2 gap-6 text-sm">
                  <div>
                    <div className="mono text-[10px] uppercase tracking-[0.24em] mb-2" style={{ color: MUTED }}>Your voice note</div>
                    <div className="aesthetic-serif text-lg leading-snug" style={{ color: "#F1F5F9" }}>{t.parsed_text}</div>
                    {t.audio_base64 && <audio controls src={t.audio_base64} className="mt-2 h-8 w-full" />}
                    <div className="mt-3">
                      <AIEmail ticketId={t.id} role="customer" />
                    </div>
                  </div>
                  <div>
                    <div className="mono text-[10px] uppercase tracking-[0.24em] mb-2" style={{ color: MUTED }}>Office response</div>
                    {t.solution_text ? (
                      <>
                        <div className="text-xs" style={{ color: MUTED }}>EN</div>
                        <div className="text-sm">{t.solution_text}</div>
                        <div className="text-xs mt-3" style={{ color: MUTED }}>{t.solution_language?.toUpperCase()}</div>
                        <div className="aesthetic-serif text-lg leading-snug flex items-start gap-2">
                          {t.solution_translated}
                          <button onClick={() => speak(t.solution_translated, t.solution_language)}
                            className="shrink-0" style={{ color: GOLD }}
                            data-testid={`play-${t.ticket_id}`}>
                            <Volume2 size={14} />
                          </button>
                        </div>
                      </>
                    ) : (
                      <div className="italic mono text-xs" style={{ color: MUTED }}>Awaiting dispatch response…</div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </Shell>
  );
}
