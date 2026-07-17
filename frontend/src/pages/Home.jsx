import React from "react";
import { useNavigate } from "react-router-dom";
import Shell from "@/components/Shell";
import { UserRound, Building2, ArrowRight, Radio } from "lucide-react";

export default function Home() {
  const nav = useNavigate();
  return (
    <Shell>
      <section className="pt-16 pb-8 text-center">
        <div className="inline-flex items-center gap-2 mono text-[10px] uppercase tracking-[0.28em] px-3 py-1 rounded-full"
             style={{ background: "#0F1626", border: "1px solid #1E293B", color: "#FBBF24" }}>
          <Radio size={10} /> Unified Gateway Control Node
        </div>
        <h1 className="mt-8 aesthetic-serif text-5xl md:text-6xl lg:text-7xl leading-[0.98] tracking-tight max-w-4xl mx-auto">
          Strategic Redressal &amp;
          <br />
          <span style={{ color: "#FBBF24" }}>Dispatch Routing</span> Framework
        </h1>
        <p className="mt-6 max-w-2xl mx-auto text-sm md:text-base leading-relaxed" style={{ color: "#94A3B8" }}>
          Select target operating partition directory. Customer interactions compile real-time automated translations. Office consoles maintain direct response dispatch.
        </p>
      </section>

      <section className="grid grid-cols-1 md:grid-cols-2 gap-8 stagger-in mt-8 max-w-5xl mx-auto">
        <button
          onClick={() => nav("/customer")}
          className="group card-lift text-left rounded-2xl p-8 flex flex-col justify-between min-h-[320px]"
          style={{ background: "#0F1626", border: "1px solid #1E293B" }}
          data-testid="customer-entry-btn"
        >
          <div>
            <div className="flex items-center justify-between">
              <div className="w-12 h-12 rounded-xl flex items-center justify-center transition"
                   style={{ background: "#080C14", border: "1px solid #1E293B", color: "#3B82F6" }}>
                <UserRound size={22} />
              </div>
              <div className="mono text-[10px] uppercase tracking-[0.24em]" style={{ color: "#475569" }}>PARTITION · 01</div>
            </div>
            <div className="mt-8">
              <div className="mono text-[10px] uppercase tracking-[0.24em]" style={{ color: "#3B82F6" }}>Customer Workspace</div>
              <div className="aesthetic-serif text-4xl mt-2 leading-none">Access Console</div>
              <p className="mt-4 text-sm leading-relaxed" style={{ color: "#94A3B8" }}>
                Verify policy credentials, capture real-time regional vocal transcripts, and generate AI-guided translation envelopes instantly.
              </p>
            </div>
          </div>
          <div className="mt-8 inline-flex items-center gap-2 text-xs uppercase mono tracking-[0.24em]"
               style={{ color: "#FBBF24" }}>
            Access Console <ArrowRight size={12} />
          </div>
        </button>

        <button
          onClick={() => nav("/office/login")}
          className="group card-lift text-left rounded-2xl p-8 flex flex-col justify-between min-h-[320px]"
          style={{ background: "#0F1626", border: "1px solid #1E293B" }}
          data-testid="office-entry-btn"
        >
          <div>
            <div className="flex items-center justify-between">
              <div className="w-12 h-12 rounded-xl flex items-center justify-center"
                   style={{ background: "#080C14", border: "1px solid #1E293B", color: "#FBBF24" }}>
                <Building2 size={22} />
              </div>
              <div className="mono text-[10px] uppercase tracking-[0.24em]" style={{ color: "#475569" }}>PARTITION · 02</div>
            </div>
            <div className="mt-8">
              <div className="mono text-[10px] uppercase tracking-[0.24em]" style={{ color: "#FBBF24" }}>Office Hub</div>
              <div className="aesthetic-serif text-4xl mt-2 leading-none">Secure Portal Login</div>
              <p className="mt-4 text-sm leading-relaxed" style={{ color: "#94A3B8" }}>
                Three-level workspace partitioning (670100 · 940000 · Admin). Monitor matched tickets and instantly generate AI response emails.
              </p>
            </div>
          </div>
          <div className="mt-8 inline-flex items-center gap-2 text-xs uppercase mono tracking-[0.24em]"
               style={{ color: "#FBBF24" }}>
            Secure Portal Login <ArrowRight size={12} />
          </div>
        </button>
      </section>

      <section className="mt-16 max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          ["01", "Voice Intake", "Record 2 min · on-device transcription"],
          ["02", "Routed Right", "Policy · Claims · Grievance to office desks"],
          ["03", "24h Auto-Escalation", "Unattended cases surface to Manjula Vishal"],
        ].map(([n, t, s]) => (
          <div key={n} className="p-5 rounded-xl" style={{ background: "#0F1626", border: "1px solid #1E293B" }}>
            <div className="mono text-[10px] uppercase tracking-[0.24em]" style={{ color: "#FBBF24" }}>PIPELINE · {n}</div>
            <div className="aesthetic-serif text-2xl mt-2">{t}</div>
            <div className="mt-1 text-xs" style={{ color: "#94A3B8" }}>{s}</div>
          </div>
        ))}
      </section>
    </Shell>
  );
}
