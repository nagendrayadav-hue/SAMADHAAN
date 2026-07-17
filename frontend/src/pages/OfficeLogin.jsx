import React, { useState } from "react";
import Shell from "@/components/Shell";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { LogIn, Shield } from "lucide-react";

const DARK = "#080C14", PANEL = "#0F1626", BORDER = "#1E293B", GOLD = "#FBBF24", BLUE = "#3B82F6", MUTED = "#94A3B8";

export default function OfficeLogin() {
  const nav = useNavigate();
  const [u, setU] = useState("");
  const [p, setP] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      const r = await api.post("/auth/office/login", { username: u, password: p });
      localStorage.setItem("samaadhaan_office", JSON.stringify(r.data));
      toast.success(`Welcome · ${r.data.office.name}`);
      nav("/office/dashboard");
    } catch (e) { toast.error(e.response?.data?.detail || "Login failed"); }
    setBusy(false);
  };
  const fill = (c) => { setU(c); setP(c); };

  return (
    <Shell back>
      <div className="mt-10 grid lg:grid-cols-12 gap-8">
        <div className="lg:col-span-6">
          <div className="mono text-[10px] uppercase tracking-[0.28em]" style={{ color: GOLD }}>Office · Sign in</div>
          <h2 className="aesthetic-serif text-5xl leading-[0.98] mt-4">Command terminal.</h2>
          <p className="mt-5 max-w-md text-sm leading-relaxed" style={{ color: MUTED }}>
            Regional offices see only tickets routed to them. Admin sees the entire network. Every login is audited.
          </p>

          <div className="mt-8 grid grid-cols-3 gap-3">
            {[
              ["670100", "Mumbai"],
              ["940000", "Delhi"],
              ["admin", "Admin"],
            ].map(([c, n]) => (
              <button key={c} onClick={() => fill(c)}
                className="text-left card-lift rounded-xl p-4"
                style={{ background: PANEL, border: `1px solid ${BORDER}` }}
                data-testid={`quick-${c}`}>
                <div className="mono text-[10px] uppercase tracking-widest" style={{ color: MUTED }}>Partition</div>
                <div className="mono text-lg mt-1">{c}</div>
                <div className="aesthetic-serif text-xl mt-1">{n}</div>
              </button>
            ))}
          </div>
        </div>

        <div className="lg:col-span-6">
          <div className="rounded-2xl p-8" style={{ background: PANEL, border: `1px solid ${BORDER}`, boxShadow: "0 20px 60px -20px rgba(0,0,0,0.7)" }}>
            <div className="flex items-center gap-2 mb-6">
              <Shield size={16} style={{ color: GOLD }} />
              <div className="mono text-[10px] uppercase tracking-[0.28em]" style={{ color: MUTED }}>Secure Portal Login</div>
            </div>

            <div className="space-y-4">
              <label className="block">
                <div className="mono text-[10px] uppercase tracking-[0.24em] mb-2" style={{ color: MUTED }}>Office code · username</div>
                <Input value={u} onChange={(e) => setU(e.target.value)}
                  className="mono h-12"
                  style={{ background: DARK, borderColor: BORDER }}
                  data-testid="office-user" />
              </label>
              <label className="block">
                <div className="mono text-[10px] uppercase tracking-[0.24em] mb-2" style={{ color: MUTED }}>Password</div>
                <Input type="password" value={p} onChange={(e) => setP(e.target.value)}
                  className="mono h-12"
                  style={{ background: DARK, borderColor: BORDER }}
                  data-testid="office-pass" />
              </label>
              <Button onClick={submit} disabled={busy}
                className="w-full h-12 uppercase mono tracking-widest font-bold"
                style={{ background: GOLD, color: DARK }}
                data-testid="office-login-btn">
                <LogIn className="mr-2" size={16} /> Access Terminal
              </Button>
              <div className="mono text-[11px]" style={{ color: MUTED }}>
                Demo · 670100/670100 · 940000/940000 · admin/admin
              </div>
            </div>
          </div>
        </div>
      </div>
    </Shell>
  );
}
