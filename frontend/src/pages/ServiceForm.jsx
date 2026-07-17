import React, { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import Shell from "@/components/Shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import AudioCapture from "@/components/AudioCapture";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { FileText, Shield, MessageSquareWarning, HeartHandshake, Send } from "lucide-react";

const SERVICES_EXISTING = [
  { key: "policy", label: "Policy", icon: Shield, hint: "Endorsement, premium, renewal, cover" },
  { key: "claims", label: "Claims", icon: FileText, hint: "New claim, document, status" },
  { key: "grievance", label: "Grievance", icon: MessageSquareWarning, hint: "Complaint against office / dissatisfaction" },
];

export default function ServiceForm() {
  const nav = useNavigate();
  const [sp] = useSearchParams();
  const mobile = sp.get("mobile");
  const policy = sp.get("policy");
  const customerType = sp.get("type"); // new | existing

  const [service, setService] = useState(customerType === "new" ? "service" : null);
  const [text, setText] = useState("");
  const [audio, setAudio] = useState(null);
  const [language, setLanguage] = useState("hi");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!text.trim() && !audio) return toast.error("Please record or type your issue.");
    setBusy(true);
    try {
      const r = await api.post("/tickets", {
        mobile, customer_type: customerType, policy_no: policy || null,
        service_type: service, audio_base64: audio, parsed_text: text, language,
        auto_classify: true,
      });
      toast.success(`Ticket ${r.data.ticket_id} created. SMS sent.`);
      nav(`/customer/history?mobile=${mobile}&new=${r.data.ticket_id}`);
    } catch (e) { toast.error(e.response?.data?.detail || "Failed"); }
    setBusy(false);
  };

  return (
    <Shell back>
      <div className="mt-8 grid md:grid-cols-12 gap-8">
        <div className="md:col-span-5">
          <div className="text-xs mono uppercase tracking-[0.24em] text-[#fb923c] mb-3">
            Step 02 · {customerType === "new" ? "Tell us what you need" : "Choose a category"}
          </div>
          <h2 className="font-serif text-5xl leading-[0.95]">Raise your concern.</h2>
          <p className="mt-4 text-[#14213d]/70 max-w-sm">Speak naturally in any Indian language. We transcribe on-device and forward the audio + text to the correct desk.</p>

          <div className="mt-8 text-sm mono uppercase tracking-widest text-[#14213d]/60">
            <div>Mobile · <span className="text-[#14213d]">{mobile}</span></div>
            {policy && <div>Policy · <span className="text-[#14213d]">{policy}</span></div>}
            <div>Customer · <span className="text-[#14213d]">{customerType}</span></div>
          </div>

          {customerType === "existing" && (
            <div className="mt-8 grid gap-3">
              {SERVICES_EXISTING.map(({ key, label, icon: Icon, hint }) => (
                <button key={key} onClick={() => setService(key)}
                  className={`text-left card-lift bg-[#fdfaf3] border rounded-md p-4 flex gap-3 items-start ${service === key ? "border-[#fb923c] ring-2 ring-[#fb923c]/30" : "border-[#14213d]/15"}`}
                  data-testid={`service-${key}`}
                >
                  <div className={`w-10 h-10 rounded-md flex items-center justify-center ${service === key ? "bg-[#fb923c] text-[#14213d]" : "bg-[#14213d] text-[#f6f1e8]"}`}>
                    <Icon size={16} />
                  </div>
                  <div>
                    <div className="font-serif text-2xl leading-none">{label}</div>
                    <div className="text-xs text-[#14213d]/60 mt-1">{hint}</div>
                  </div>
                </button>
              ))}
            </div>
          )}

          {customerType === "new" && (
            <div className="mt-8 bg-[#14213d] text-[#f6f1e8] rounded-md p-5 flex gap-3">
              <HeartHandshake className="shrink-0 mt-1" size={20} />
              <div>
                <div className="font-serif text-2xl">Customer Care</div>
                <div className="text-sm mt-1 text-[#f6f1e8]/80">Nearest office · product help · general query. Someone from New India will call you back.</div>
              </div>
            </div>
          )}
        </div>

        <div className="md:col-span-7">
          <Card className="bg-[#fdfaf3] border-[#14213d]/15 p-6">
            {(customerType === "new" || service) ? (
              <div className="space-y-4">
                <div className="text-xs mono uppercase tracking-widest text-[#14213d]/60">
                  Recording for: <span className="text-[#14213d]">{customerType === "new" ? "Customer Care" : service}</span>
                </div>
                <AudioCapture
                  value={text} onChange={setText}
                  audioBase64={audio} onAudioChange={setAudio}
                  language={language} onLanguageChange={setLanguage}
                />
                <div className="pt-4 border-t border-[#14213d]/10 flex items-center justify-between">
                  <div className="text-xs text-[#14213d]/60">
                    Ticket ID will be <span className="mono text-[#14213d]">{mobile}_{policy || "TKT####"}</span>
                  </div>
                  <Button onClick={submit} disabled={busy} className="bg-[#fb923c] hover:bg-[#f97316] text-[#14213d]" data-testid="submit-ticket-btn">
                    <Send className="mr-2" size={14} /> Submit &amp; notify office
                  </Button>
                </div>
              </div>
            ) : (
              <div className="text-center text-[#14213d]/60 py-12">Pick a category on the left to begin.</div>
            )}
          </Card>
        </div>
      </div>
    </Shell>
  );
}
