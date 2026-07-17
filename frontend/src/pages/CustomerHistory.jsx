import React, { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import Shell from "@/components/Shell";
import { api } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Volume2 } from "lucide-react";

const statusColor = {
  Done: "bg-green-100 text-green-800 border-green-300",
  Open: "bg-amber-100 text-amber-800 border-amber-300",
  Escalated: "bg-red-100 text-red-800 border-red-300",
};

export default function CustomerHistory() {
  const [sp] = useSearchParams();
  const mobile = sp.get("mobile");
  const [tickets, setTickets] = useState([]);

  useEffect(() => {
    if (!mobile) return;
    api.get(`/history/${mobile}`).then((r) => setTickets(r.data));
  }, [mobile]);

  const speak = (text, lang) => {
    if (!text || !window.speechSynthesis) return;
    const u = new SpeechSynthesisUtterance(text);
    const loc = { hi: "hi-IN", mr: "mr-IN", ta: "ta-IN", te: "te-IN", bn: "bn-IN", gu: "gu-IN", kn: "kn-IN", ml: "ml-IN", pa: "pa-IN", en: "en-IN" };
    u.lang = loc[lang] || "en-IN";
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  };

  return (
    <Shell back>
      <div className="mt-8">
        <div className="text-xs mono uppercase tracking-[0.24em] text-[#fb923c] mb-3">History</div>
        <h2 className="font-serif text-5xl leading-[0.95]">Your tickets</h2>
        <div className="text-sm text-[#14213d]/60 mt-2 mono">Mobile · {mobile}</div>

        <div className="mt-8 space-y-4">
          {tickets.length === 0 && (
            <div className="text-[#14213d]/60 text-center py-16 border border-dashed border-[#14213d]/20 rounded-md">
              No tickets yet.
            </div>
          )}
          {tickets.map((t) => (
            <div key={t.id} className="bg-[#fdfaf3] border border-[#14213d]/15 rounded-md p-5" data-testid={`ticket-${t.ticket_id}`}>
              <div className="flex items-start justify-between flex-wrap gap-3">
                <div>
                  <div className="mono text-xs text-[#14213d]/60">{new Date(t.created_at).toLocaleString()}</div>
                  <div className="font-serif text-2xl mt-1">{t.ticket_id}</div>
                  <div className="text-xs mono uppercase tracking-widest text-[#14213d]/60 mt-1">
                    {t.service_type} · office {t.office_code} · {t.language}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge className={`${statusColor[t.status] || ""} border`}>{t.status}</Badge>
                  <Badge variant="outline">{t.attended ? "Attended" : "Pending"}</Badge>
                </div>
              </div>
              <div className="mt-3 grid md:grid-cols-2 gap-4 text-sm">
                <div>
                  <div className="text-xs mono uppercase tracking-widest text-[#14213d]/50 mb-1">Your note</div>
                  <div className="text-[#14213d]/85">{t.parsed_text}</div>
                  {t.audio_base64 && <audio controls src={t.audio_base64} className="mt-2 h-8" />}
                </div>
                <div>
                  <div className="text-xs mono uppercase tracking-widest text-[#14213d]/50 mb-1">Solution</div>
                  {t.solution_text ? (
                    <>
                      <div className="text-[#14213d]/85 mb-1"><span className="text-[#14213d]/50">EN · </span>{t.solution_text}</div>
                      <div className="text-[#14213d]/85 flex items-start gap-2">
                        <span className="text-[#14213d]/50">{t.solution_language?.toUpperCase()} · </span>
                        <span>{t.solution_translated}</span>
                        <button onClick={() => speak(t.solution_translated, t.solution_language)}
                          className="text-[#fb923c] hover:text-[#f97316]" data-testid={`play-${t.ticket_id}`}>
                          <Volume2 size={14} />
                        </button>
                      </div>
                    </>
                  ) : <div className="text-[#14213d]/50 italic">Awaiting office response…</div>}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </Shell>
  );
}
