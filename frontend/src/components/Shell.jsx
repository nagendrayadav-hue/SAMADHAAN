import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { ShieldCheck, ArrowLeft } from "lucide-react";

export default function Shell({ children, back = false, badge = "समाधान · Samaadhaan" }) {
  const navigate = useNavigate();
  return (
    <div className="grain min-h-screen relative">
      <div className="tape h-2 w-full" />
      <header className="relative z-10 max-w-6xl mx-auto px-6 pt-6 pb-4 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-3 group" data-testid="logo-link">
          <div className="w-10 h-10 rounded-md bg-[#14213d] text-[#f6f1e8] flex items-center justify-center">
            <ShieldCheck size={20} />
          </div>
          <div className="leading-tight">
            <div className="font-serif text-2xl">Samaadhaan</div>
            <div className="text-[11px] uppercase tracking-[0.18em] text-[#14213d]/60">New India Assurance · Grievance Portal</div>
          </div>
        </Link>
        <div className="text-xs mono uppercase tracking-widest text-[#14213d]/60 hidden sm:block">{badge}</div>
      </header>
      {back && (
        <div className="relative z-10 max-w-6xl mx-auto px-6">
          <button
            onClick={() => navigate(-1)}
            className="inline-flex items-center gap-1 text-sm text-[#14213d]/70 hover:text-[#14213d] transition"
            data-testid="back-btn"
          >
            <ArrowLeft size={14} /> back
          </button>
        </div>
      )}
      <main className="relative z-10 max-w-6xl mx-auto px-6 pb-24">{children}</main>
      <footer className="relative z-10 max-w-6xl mx-auto px-6 pb-8 text-[11px] uppercase tracking-widest text-[#14213d]/50 mono">
        Samaadhaan v1 · Escalations route to ravikant.vishl@newindia.co.in · Higher authority: Manjula Vishal
      </footer>
    </div>
  );
}
