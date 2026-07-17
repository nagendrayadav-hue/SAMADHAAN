import React, { useState } from "react";
import Shell from "@/components/Shell";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { LogIn } from "lucide-react";

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

  const fill = (code) => { setU(code); setP(code); };

  return (
    <Shell back>
      <div className="mt-10 grid md:grid-cols-12 gap-8">
        <div className="md:col-span-6">
          <div className="text-xs mono uppercase tracking-[0.24em] text-[#fb923c] mb-3">Office · Sign in</div>
          <h2 className="font-serif text-5xl leading-[0.95]">Team console.</h2>
          <p className="mt-4 text-[#14213d]/70 max-w-md">Regional offices see only tickets routed to them. Admin sees everything, everywhere.</p>

          <div className="mt-8 grid grid-cols-3 gap-2 text-xs">
            {[
              ["670100", "Mumbai"],
              ["940000", "Delhi"],
              ["admin", "Admin"],
            ].map(([c, n]) => (
              <button key={c} onClick={() => fill(c)}
                className="bg-[#fdfaf3] border border-[#14213d]/15 rounded-md p-3 text-left card-lift"
                data-testid={`quick-${c}`}
              >
                <div className="mono text-[#14213d]/60">{c}</div>
                <div className="font-serif text-lg">{n}</div>
              </button>
            ))}
          </div>
        </div>

        <div className="md:col-span-6">
          <div className="bg-[#14213d] text-[#f6f1e8] rounded-xl p-8">
            <div className="space-y-4">
              <label className="block">
                <div className="text-xs mono uppercase tracking-widest text-[#f6f1e8]/60 mb-2">Office code / username</div>
                <Input value={u} onChange={(e) => setU(e.target.value)}
                  className="bg-[#0d1730] border-[#f6f1e8]/20 text-[#f6f1e8] mono" data-testid="office-user" />
              </label>
              <label className="block">
                <div className="text-xs mono uppercase tracking-widest text-[#f6f1e8]/60 mb-2">Password</div>
                <Input type="password" value={p} onChange={(e) => setP(e.target.value)}
                  className="bg-[#0d1730] border-[#f6f1e8]/20 text-[#f6f1e8] mono" data-testid="office-pass" />
              </label>
              <Button onClick={submit} disabled={busy} className="bg-[#fb923c] hover:bg-[#f97316] text-[#14213d] w-full" data-testid="office-login-btn">
                <LogIn className="mr-2" size={16} /> Sign in
              </Button>
              <div className="text-xs text-[#f6f1e8]/60">Demo credentials: 670100/670100 · 940000/940000 · admin/admin</div>
            </div>
          </div>
        </div>
      </div>
    </Shell>
  );
}
