import React, { useState } from "react";
import Shell from "@/components/Shell";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { Sparkles, KeyRound, ArrowRight } from "lucide-react";

export default function CustomerEntry() {
  const nav = useNavigate();
  const [tab, setTab] = useState("existing"); // existing | new
  const [mobile, setMobile] = useState("");
  const [policy, setPolicy] = useState("");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [demoOtp, setDemoOtp] = useState("");
  const [busy, setBusy] = useState(false);

  const sendOtp = async () => {
    if (mobile.length !== 10) return toast.error("Mobile must be 10 digits");
    setBusy(true);
    try {
      const r = await api.post("/auth/otp/send", { mobile });
      setOtpSent(true);
      setDemoOtp(r.data.demo_otp || "");
      toast.success("OTP sent to your mobile");
    } catch (e) { toast.error(e.response?.data?.detail || "Failed"); }
    setBusy(false);
  };

  const verify = async () => {
    setBusy(true);
    try {
      await api.post("/auth/otp/verify", { mobile, otp });
      if (tab === "existing") {
        const p = await api.post("/policy/verify", { policy_no: policy });
        toast.success(`Policy verified · ${p.data.customer_name}`);
        nav(`/customer/service?mobile=${mobile}&policy=${policy}&type=existing`);
      } else {
        nav(`/customer/service?mobile=${mobile}&type=new`);
      }
    } catch (e) { toast.error(e.response?.data?.detail || "Verification failed"); }
    setBusy(false);
  };

  return (
    <Shell back>
      <div className="grid md:grid-cols-12 gap-10 mt-8">
        <div className="md:col-span-5">
          <div className="text-xs mono uppercase tracking-[0.24em] text-[#fb923c] mb-3">Step 01 · Identify</div>
          <h2 className="font-serif text-5xl leading-[0.95]">Who's calling?</h2>
          <p className="mt-4 text-[#14213d]/70 max-w-sm">Existing customers verify their policy. New callers only need a mobile number — we'll route you to the customer care center.</p>

          <div className="mt-8 flex gap-2 border border-[#14213d]/15 rounded-md p-1 bg-[#fdfaf3] w-fit">
            {[["existing", "Existing"], ["new", "New"]].map(([k, l]) => (
              <button
                key={k}
                onClick={() => setTab(k)}
                className={`px-4 py-2 text-sm rounded ${tab === k ? "bg-[#14213d] text-[#f6f1e8]" : "text-[#14213d]/70"}`}
                data-testid={`tab-${k}`}
              >{l}</button>
            ))}
          </div>
        </div>

        <div className="md:col-span-7">
          <div className="bg-[#fdfaf3] border border-[#14213d]/15 rounded-xl p-8">
            <div className="space-y-5">
              <label className="block">
                <div className="text-xs mono uppercase tracking-widest text-[#14213d]/60 mb-2">Mobile number</div>
                <Input value={mobile} onChange={(e) => setMobile(e.target.value.replace(/\D/g, "").slice(0, 10))}
                  placeholder="10-digit mobile" data-testid="mobile-input" className="text-lg" />
              </label>

              {tab === "existing" && (
                <label className="block">
                  <div className="text-xs mono uppercase tracking-widest text-[#14213d]/60 mb-2">Policy number (20 digits)</div>
                  <Input value={policy} onChange={(e) => setPolicy(e.target.value.replace(/\D/g, "").slice(0, 20))}
                    placeholder="20-digit policy no" data-testid="policy-input" className="mono" />
                  <div className="text-xs mt-1 text-[#14213d]/50">Try: 67010023456789012001 (Mumbai) or 94000012345678901001 (Delhi)</div>
                </label>
              )}

              {!otpSent ? (
                <Button onClick={sendOtp} disabled={busy} className="bg-[#14213d] hover:bg-[#14213d]/90 text-[#f6f1e8]" data-testid="send-otp-btn">
                  <KeyRound className="mr-2" size={16} /> Send OTP
                </Button>
              ) : (
                <>
                  <label className="block">
                    <div className="text-xs mono uppercase tracking-widest text-[#14213d]/60 mb-2 flex items-center gap-2">
                      OTP {demoOtp && <span className="text-[#fb923c]">· demo: {demoOtp}</span>}
                    </div>
                    <Input value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                      placeholder="6-digit OTP" data-testid="otp-input" className="mono text-lg tracking-widest" />
                  </label>
                  <Button onClick={verify} disabled={busy} className="bg-[#fb923c] hover:bg-[#f97316] text-[#14213d]" data-testid="verify-btn">
                    Verify &amp; continue <ArrowRight className="ml-2" size={16} />
                  </Button>
                </>
              )}

              <div className="pt-4 border-t border-[#14213d]/10 text-xs text-[#14213d]/60 flex items-center gap-2">
                <Sparkles size={12} className="text-[#fb923c]" /> Your OTP is generated fresh per request. Nothing is stored beyond this session.
              </div>
            </div>
          </div>
          <button onClick={() => nav(`/customer/history?mobile=${mobile}`)} disabled={mobile.length !== 10}
            className="mt-4 text-sm text-[#14213d]/60 hover:text-[#14213d] disabled:opacity-30 inline-flex items-center gap-1" data-testid="view-history-btn">
            View my past tickets →
          </button>
        </div>
      </div>
    </Shell>
  );
}
