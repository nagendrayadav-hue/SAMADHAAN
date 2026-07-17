import React from "react";
import { useNavigate } from "react-router-dom";
import Shell from "@/components/Shell";
import { UserRound, Building2, ArrowUpRight } from "lucide-react";

export default function Home() {
  const nav = useNavigate();
  return (
    <Shell>
      <section className="pt-10 pb-8">
        <div className="grid md:grid-cols-12 gap-8 items-end">
          <div className="md:col-span-8">
            <div className="text-xs uppercase mono tracking-[0.24em] text-[#fb923c] mb-4">Grievance Redressal · समाधान</div>
            <h1 className="font-serif text-5xl sm:text-6xl lg:text-7xl leading-[0.95] tracking-tight">
              A single door for every <em className="text-[#fb923c] not-italic">policy, claim &amp; concern.</em>
            </h1>
          </div>
          <div className="md:col-span-4 text-[#14213d]/70 text-base leading-relaxed">
            Voice-first. Multilingual. Traced end-to-end from your mobile to your regional office — and escalated to leadership if unattended for 24 hours.
          </div>
        </div>
      </section>

      <section className="grid md:grid-cols-2 gap-6 stagger-in mt-6">
        <button
          onClick={() => nav("/customer")}
          className="card-lift text-left bg-[#fdfaf3] border border-[#14213d]/15 rounded-xl p-8 flex flex-col justify-between min-h-[280px]"
          data-testid="customer-entry-btn"
        >
          <div>
            <div className="w-12 h-12 rounded-md bg-[#14213d] text-[#f6f1e8] flex items-center justify-center mb-6">
              <UserRound size={22} />
            </div>
            <div className="text-xs mono uppercase tracking-widest text-[#14213d]/50 mb-2">01 — For you</div>
            <div className="font-serif text-4xl leading-tight">Customer</div>
            <p className="mt-3 text-[#14213d]/70 max-w-md">Existing policyholder or a new caller — raise a service request, claim query or grievance in your own language.</p>
          </div>
          <div className="mt-8 inline-flex items-center gap-2 text-sm uppercase mono tracking-widest text-[#fb923c]">
            Continue as customer <ArrowUpRight size={14} />
          </div>
        </button>

        <button
          onClick={() => nav("/office/login")}
          className="card-lift text-left bg-[#14213d] text-[#f6f1e8] border border-[#14213d] rounded-xl p-8 flex flex-col justify-between min-h-[280px]"
          data-testid="office-entry-btn"
        >
          <div>
            <div className="w-12 h-12 rounded-md bg-[#fb923c] text-[#14213d] flex items-center justify-center mb-6">
              <Building2 size={22} />
            </div>
            <div className="text-xs mono uppercase tracking-widest text-[#f6f1e8]/60 mb-2">02 — Office team</div>
            <div className="font-serif text-4xl leading-tight">Office Login</div>
            <p className="mt-3 text-[#f6f1e8]/75 max-w-md">Regional offices &amp; admin — receive escalations, respond in the customer's language, and close the loop.</p>
          </div>
          <div className="mt-8 inline-flex items-center gap-2 text-sm uppercase mono tracking-widest text-[#fb923c]">
            Sign in <ArrowUpRight size={14} />
          </div>
        </button>
      </section>

      <section className="mt-16 grid sm:grid-cols-3 gap-4 text-sm">
        {[
          ["Voice-first intake", "Record up to 2 min · auto-transcribed on-device"],
          ["Right office, first time", "Policy · Claims · Grievance routed by office code"],
          ["24-hour auto-escalation", "Unattended cases surface to Manjula Vishal"],
        ].map(([t, s]) => (
          <div key={t} className="bg-[#fdfaf3]/60 border border-[#14213d]/10 rounded-lg p-5">
            <div className="font-serif text-2xl">{t}</div>
            <div className="mt-2 text-[#14213d]/65">{s}</div>
          </div>
        ))}
      </section>
    </Shell>
  );
}
