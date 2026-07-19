import React, { useEffect, useState } from "react";
import Shell from "@/components/Shell";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { customerSession } from "@/lib/session";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { Sparkles, KeyRound, ArrowRight, ShieldCheck, RotateCcw } from "lucide-react";

const DARK = "#080C14", PANEL = "#0F1626", BORDER = "#1E293B", GOLD = "#FBBF24", BLUE = "#3B82F6", MUTED = "#94A3B8";

export default function CustomerEntry() {
  const nav = useNavigate();
  const [tab, setTab] = useState("existing");
  const [mobile, setMobile] = useState("");
  const [email, setEmail] = useState("");
  const [sendSms, setSendSms] = useState(false);   // SMS is opt-in
  const [policy, setPolicy] = useState("");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [otpVerified, setOtpVerified] = useState(false);
  const [demoOtp, setDemoOtp] = useState("");
  const [channelStatus, setChannelStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const [deliveryPromoted, setDeliveryPromoted] = useState(false); // true after grace window expires w/o confirmed delivery

  useEffect(() => {
    const s = customerSession.get();
    if (!s) return;
    if (s.mobile) setMobile(s.mobile);
    if (s.email) setEmail(s.email);
    if (typeof s.sendSms === "boolean") setSendSms(s.sendSms);
    if (s.policy) setPolicy(s.policy);
    if (s.tab) setTab(s.tab);
    if (s.otpVerified) setOtpVerified(true);
  }, []);

  useEffect(() => {
    // Persist form fields for a smooth refresh — but never persist the verified flag.
    customerSession.patch({ mobile, email, sendSms, policy, tab, otpVerified: false });
  }, [mobile, email, sendSms, policy, tab]);

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  const sendOtp = async () => {
    if (mobile.length !== 10) return toast.error("Mobile must be 10 digits");
    if (!emailValid) return toast.error("A valid email is required for OTP");
    setBusy(true);
    setDeliveryPromoted(true);   // fallback is ALWAYS visible immediately — real delivery is best-effort
    try {
      const r = await api.post("/auth/otp/send", { mobile, email, send_sms: sendSms });
      setOtpSent(true);
      setDemoOtp(r.data.demo_otp || "");
      setChannelStatus({ email: r.data.email, sms: r.data.sms });
      const eOk = r.data.email?.delivered;
      const sOk = r.data.sms?.delivered;
      if (eOk && sOk) toast.success("OTP dispatched · Email + SMS also sent");
      else if (eOk) toast.success("OTP dispatched · Email also sent");
      else if (sOk) toast.success("OTP dispatched · SMS also sent");
      else toast("OTP ready on-screen · real-channel delivery pending", { icon: "🔐" });
    } catch (e) {
      toast.error(e.response?.data?.detail || "Backend error — check the on-screen code");
    }
    setBusy(false);
  };

  const verify = async () => {
    setBusy(true);
    try {
      await api.post("/auth/otp/verify", { mobile, otp });
      setOtpVerified(true);
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

  const continueVerified = () => {
    if (tab === "existing" && policy) {
      nav(`/customer/service?mobile=${mobile}&policy=${policy}&type=existing`);
    } else {
      nav(`/customer/service?mobile=${mobile}&type=new`);
    }
  };

  const forgetSession = () => {
    customerSession.clear();
    setMobile(""); setEmail(""); setSendSms(false); setPolicy(""); setOtp(""); setOtpSent(false); setOtpVerified(false); setDemoOtp(""); setChannelStatus(null);
    toast("Session cleared");
  };

  return (
    <Shell back>
      <div className="grid lg:grid-cols-12 gap-10 mt-10">
        <div className="lg:col-span-5">
          <div className="mono text-[10px] uppercase tracking-[0.28em]" style={{ color: GOLD }}>Node 01 · Customer Verification</div>
          <h2 className="aesthetic-serif text-5xl leading-[0.98] mt-4">Identity handshake.</h2>
          <p className="mt-5 max-w-sm text-sm leading-relaxed" style={{ color: MUTED }}>
            Existing customers verify policy. New callers only need a mobile number — we forward you to the customer care center at ravikant.vishl@oursamadhaan.com.
          </p>

          <div className="mt-8 inline-flex gap-1 rounded-xl p-1" style={{ background: PANEL, border: `1px solid ${BORDER}` }}>
            {[["existing", "Existing"], ["new", "New Caller"]].map(([k, l]) => (
              <button key={k} onClick={() => setTab(k)}
                className="px-4 py-2 text-xs uppercase mono tracking-widest rounded-lg transition"
                style={tab === k
                  ? { background: GOLD, color: DARK }
                  : { color: MUTED }}
                data-testid={`tab-${k}`}
              >{l}</button>
            ))}
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <button onClick={() => nav(`/customer/history?mobile=${mobile}`)} disabled={mobile.length !== 10}
              className="text-xs uppercase mono tracking-widest inline-flex items-center gap-1 disabled:opacity-30"
              style={{ color: BLUE }} data-testid="view-history-btn">
              View my session logs →
            </button>
            <button onClick={forgetSession}
              className="text-xs uppercase mono tracking-widest inline-flex items-center gap-1"
              style={{ color: MUTED }} data-testid="forget-session-btn">
              <RotateCcw size={11} /> Forget session
            </button>
          </div>
        </div>

        <div className="lg:col-span-7">
          <div className="rounded-2xl p-8" style={{ background: PANEL, border: `1px solid ${BORDER}`, boxShadow: "0 20px 60px -20px rgba(0,0,0,0.6)" }}>
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2">
                <ShieldCheck size={16} style={{ color: GOLD }} />
                <div className="mono text-[10px] uppercase tracking-[0.28em]" style={{ color: MUTED }}>
                  {otpVerified ? "Session restored" : "Verification envelope"}
                </div>
              </div>
              <div className="mono text-[10px] uppercase tracking-[0.28em]" style={{ color: MUTED }}>OTP · TTL 5 min</div>
            </div>

            <div className="space-y-5">
              <label className="block">
                <div className="mono text-[10px] uppercase tracking-[0.24em] mb-2 flex items-center justify-between" style={{ color: MUTED }}>
                  <span>Email address <span style={{ color: "#F87171" }}>*</span></span>
                  <span style={{ color: GOLD }}>primary channel</span>
                </div>
                <Input value={email} onChange={(e) => setEmail(e.target.value.trim())}
                  placeholder="you@example.com"
                  type="email"
                  className="h-12"
                  style={{ background: DARK, borderColor: BORDER }}
                  data-testid="email-input" />
                <div className="text-[11px] mt-2 mono" style={{ color: MUTED }}>
                  We deliver your OTP here — it's the reliable channel.
                </div>
              </label>

              <label className="block">
                <div className="mono text-[10px] uppercase tracking-[0.24em] mb-2" style={{ color: MUTED }}>Mobile Number <span style={{ color: "#F87171" }}>*</span></div>
                <Input value={mobile} onChange={(e) => setMobile(e.target.value.replace(/\D/g, "").slice(0, 10))}
                  placeholder="10-digit mobile"
                  className="mono text-lg h-12"
                  style={{ background: DARK, borderColor: BORDER }}
                  data-testid="mobile-input" />
              </label>

              <label className="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" checked={sendSms} onChange={(e) => setSendSms(e.target.checked)}
                  className="w-4 h-4 accent-[#FBBF24]"
                  data-testid="send-sms-check" />
                <span className="mono text-[11px] uppercase tracking-widest" style={{ color: MUTED }}>
                  Also send the OTP by SMS <span style={{ color: MUTED }}>(optional redundancy)</span>
                </span>
              </label>

              {tab === "existing" && (
                <label className="block">
                  <div className="mono text-[10px] uppercase tracking-[0.24em] mb-2" style={{ color: MUTED }}>Policy Number · 20 digits</div>
                  <Input value={policy} onChange={(e) => setPolicy(e.target.value.replace(/\D/g, "").slice(0, 20))}
                    placeholder="20-digit policy no"
                    className="mono h-12"
                    style={{ background: DARK, borderColor: BORDER }}
                    data-testid="policy-input" />
                  <div className="text-[11px] mt-2 mono" style={{ color: MUTED }}>
                    Demo · 67010023456789012001 (Mumbai) · 94000012345678901001 (Delhi)
                  </div>
                </label>
              )}

              {otpVerified ? (
                <Button onClick={continueVerified}
                  className="w-full h-12 uppercase mono tracking-widest font-bold"
                  style={{ background: GOLD, color: DARK }}
                  data-testid="continue-verified-btn">
                  Continue to service <ArrowRight className="ml-2" size={14} />
                </Button>
              ) : !otpSent ? (
                <Button onClick={sendOtp} disabled={busy}
                  className="w-full h-12 uppercase mono tracking-widest font-bold"
                  style={{ background: GOLD, color: DARK }}
                  data-testid="send-otp-btn">
                  <KeyRound className="mr-2" size={14} /> Dispatch OTP
                </Button>
              ) : (
                <>
                  {demoOtp && (
                    // Fallback is ALWAYS shown prominently the moment the backend
                    // responds — no timer, no wait. Real SMS/email delivery
                    // remains best-effort and is reported below via status pills.
                    <div
                      className="rounded-xl px-4 py-3 flex items-center justify-between gap-3"
                      style={{
                        background: "rgba(251,191,36,0.08)",
                        border: `1px solid ${GOLD}`,
                        boxShadow: `0 0 0 3px rgba(251,191,36,0.08)`,
                      }}
                      data-testid="fallback-otp-promoted"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="mono text-[10px] uppercase tracking-[0.24em]" style={{ color: GOLD }}>
                          Your OTP · use this to continue
                        </div>
                        <div className="mono text-3xl font-bold tracking-[0.4em] mt-1" style={{ color: GOLD }}>
                          {demoOtp}
                        </div>
                        <div className="mono text-[10px] mt-1" style={{ color: MUTED }}>
                          On-screen fallback · SMS/email are dispatched as a bonus if the platform allows.
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => { setOtp(demoOtp); }}
                        className="mono text-[10px] uppercase tracking-widest px-3 py-2 rounded-md font-bold shrink-0"
                        style={{ background: GOLD, color: DARK }}
                        data-testid="fill-fallback-btn"
                      >
                        Fill in
                      </button>
                    </div>
                  )}

                  <label className="block">
                    <div className="mono text-[10px] uppercase tracking-[0.24em] mb-2 flex items-center gap-2" style={{ color: MUTED }}>
                      Enter OTP
                    </div>
                    <Input value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                      placeholder="6-digit OTP"
                      className="mono h-12 text-lg tracking-[0.4em]"
                      style={{ background: DARK, borderColor: BORDER }}
                      data-testid="otp-input" />
                  </label>

                  {channelStatus && (
                    <div className="grid grid-cols-2 gap-2 mono text-[10px] uppercase tracking-widest">
                      <div className="rounded-md px-3 py-2 flex items-center justify-between"
                           style={{ background: DARK, border: `1px solid ${BORDER}` }}
                           data-testid="channel-email">
                        <span style={{ color: MUTED }}>Email</span>
                        <span style={{ color: channelStatus.email?.delivered ? "#10B981" : "#F87171" }}>
                          {channelStatus.email?.delivered
                            ? `delivered · ${channelStatus.email.attempts || 1}×`
                            : "failed"}
                        </span>
                      </div>
                      <div className="rounded-md px-3 py-2 flex items-center justify-between"
                           style={{ background: DARK, border: `1px solid ${BORDER}` }}
                           data-testid="channel-sms">
                        <span style={{ color: MUTED }}>SMS</span>
                        <span style={{ color: channelStatus.sms == null ? MUTED : channelStatus.sms.delivered ? "#10B981" : "#F87171" }}>
                          {channelStatus.sms == null ? "skipped" : channelStatus.sms.delivered ? "delivered" : "failed"}
                        </span>
                      </div>
                    </div>
                  )}

                  <Button onClick={verify} disabled={busy}
                    className="w-full h-12 uppercase mono tracking-widest font-bold"
                    style={{ background: GOLD, color: DARK }}
                    data-testid="verify-btn">
                    Verify &amp; Continue <ArrowRight className="ml-2" size={14} />
                  </Button>
                </>
              )}

              <div className="pt-4 flex items-center gap-2 text-[11px]" style={{ borderTop: `1px solid ${BORDER}`, color: MUTED }}>
                <Sparkles size={11} style={{ color: GOLD }} /> OTP is generated fresh per request · 3-attempt lockout · session survives refresh.
              </div>
            </div>
          </div>
        </div>
      </div>
    </Shell>
  );
}
