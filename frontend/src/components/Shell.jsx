import React from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

export default function Shell({ children, back = false, right = null }) {
  const nav = useNavigate();
  const loc = useLocation();
  return (
    <div className="min-h-screen flex flex-col" style={{ background: "#080C14", color: "#F1F5F9" }}>
      <header className="sticky top-0 z-50" style={{ background: "rgba(15,22,38,0.9)", backdropFilter: "blur(12px)", borderBottom: "1px solid #1E293B" }}>
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3" data-testid="logo-link">
            <span className="mono font-bold text-lg px-2.5 py-1 rounded-md"
                  style={{ background: "#FBBF24", color: "#080C14" }}>S</span>
            <div className="leading-tight">
              <div className="font-semibold text-[15px] tracking-tight">Samadhaan Engine</div>
              <div className="text-[10px] uppercase tracking-[0.22em] mono" style={{ color: "#94A3B8" }}>
                Command Center · Gateway
              </div>
            </div>
          </Link>

          <div className="flex items-center gap-3">
            {right}
            <div className="hidden md:flex items-center gap-2 text-[10px] uppercase mono tracking-[0.22em]" style={{ color: "#94A3B8" }}>
              <span className="w-1.5 h-1.5 rounded-full dot-pulse" style={{ background: "#10B981" }} />
              live · {loc.pathname}
            </div>
          </div>
        </div>
      </header>

      {back && (
        <div className="max-w-7xl mx-auto px-6 pt-4">
          <button onClick={() => nav(-1)}
                  className="inline-flex items-center gap-1 text-xs uppercase tracking-widest mono transition"
                  style={{ color: "#94A3B8" }}
                  data-testid="back-btn">
            <ArrowLeft size={12} /> Return to previous node
          </button>
        </div>
      )}

      <main className="flex-1 max-w-7xl mx-auto w-full px-6 pb-20">{children}</main>

      <footer style={{ borderTop: "1px solid #1E293B", background: "rgba(15,22,38,0.3)" }}>
        <div className="max-w-7xl mx-auto px-6 py-4 text-center text-[10px] uppercase mono tracking-[0.28em]"
             style={{ color: "#475569" }}>
          Samadhaan · Strategic Redressal &amp; Dispatch Routing · New India Assurance · Escalations → manjula.vishal@newindia.co.in
        </div>
      </footer>
    </div>
  );
}
