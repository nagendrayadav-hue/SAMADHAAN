import React, { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import Shell from "@/components/Shell";
import { api, LANGS, SPEECH_LOCALE, PRIORITY_COLOR, API } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import { LogOut, Volume2, AlertTriangle, Clock, CheckCircle2, Bell, RefreshCcw, Download, Search, BarChart3 } from "lucide-react";

const statusColor = {
  Done: "bg-green-100 text-green-800 border-green-300",
  Open: "bg-amber-100 text-amber-800 border-amber-300",
  InProgress: "bg-blue-100 text-blue-800 border-blue-300",
  Escalated: "bg-red-100 text-red-800 border-red-300",
};

export default function OfficeDashboard() {
  const nav = useNavigate();
  const [office, setOffice] = useState(null);
  const [tickets, setTickets] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [service, setService] = useState("");
  const [priority, setPriority] = useState("");
  const [notifs, setNotifs] = useState([]);
  const [active, setActive] = useState(null);
  const [solution, setSolution] = useState("");
  const [targetLang, setTargetLang] = useState("hi");
  const [busy, setBusy] = useState(false);
  const [analytics, setAnalytics] = useState(null);
  const LIMIT = 20;

  useEffect(() => {
    const o = JSON.parse(localStorage.getItem("samaadhaan_office") || "null");
    if (!o) { nav("/office/login"); return; }
    setOffice(o.office);
  }, []);

  useEffect(() => { if (office) load(); }, [office, page, q, status, service, priority]);

  const load = async () => {
    try {
      const params = { page, limit: LIMIT };
      if (q) params.q = q;
      if (status) params.status = status;
      if (service) params.service_type = service;
      if (priority) params.priority = priority;
      const [t, n, a] = await Promise.all([
        api.get("/tickets", { params }),
        api.get("/notifications", { params: { limit: 100 } }),
        api.get("/analytics/summary"),
      ]);
      setTickets(t.data.items);
      setTotal(t.data.total);
      setNotifs(n.data);
      setAnalytics(a.data);
    } catch (e) { /* handled by interceptor */ }
  };

  const openTicket = (t) => {
    setActive(t);
    setSolution(t.solution_text || "");
    setTargetLang(t.solution_language || t.language || "hi");
  };

  const resolve = async () => {
    if (!solution.trim()) return toast.error("Enter solution steps");
    setBusy(true);
    try {
      const r = await api.post(`/tickets/${active.id}/resolve`, { solution_text: solution, target_language: targetLang });
      toast.success("Resolved & translated. SMS sent to customer.");
      setActive(r.data);
      load();
    } catch (e) { toast.error(e.response?.data?.detail || "Failed"); }
    setBusy(false);
  };

  const simulateAge = async (id) => {
    await api.post(`/tickets/${id}/simulate-aging`);
    toast.info("Ticket aged 25h. Trigger 24h check to escalate.");
    load();
  };
  const escalate = async (id) => {
    await api.post(`/tickets/${id}/escalate-auth`);
    toast.warning("Escalated to Manjula Vishal.");
    setActive(null);
    load();
  };
  const autoEscalate = async () => {
    const r = await api.post("/tickets/auto-escalate");
    toast(`${r.data.escalated_count} ticket(s) auto-escalated`);
    load();
  };

  const exportCsv = () => {
    const raw = JSON.parse(localStorage.getItem("samaadhaan_office") || "{}");
    fetch(`${API}/tickets/export.csv`, { headers: { Authorization: `Bearer ${raw.token}` } })
      .then((r) => r.blob())
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url; a.download = `samaadhaan-${office.code}.csv`; a.click();
        URL.revokeObjectURL(url);
      });
  };

  const speak = (text, lang) => {
    if (!text || !window.speechSynthesis) return;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = SPEECH_LOCALE[lang] || "en-IN";
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  };

  const logout = () => { localStorage.removeItem("samaadhaan_office"); nav("/"); };

  const pages = Math.max(1, Math.ceil(total / LIMIT));

  if (!office) return null;

  return (
    <Shell badge={`Office · ${office.code}`}>
      <div className="mt-6 flex items-start justify-between flex-wrap gap-3">
        <div>
          <div className="text-xs mono uppercase tracking-[0.24em] text-[#fb923c]">Dashboard</div>
          <h2 className="font-serif text-5xl leading-[0.95]">{office.name}</h2>
          <div className="text-sm text-[#14213d]/60 mt-2 mono">{office.email}</div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" onClick={exportCsv} data-testid="export-csv-btn">
            <Download className="mr-2" size={14} /> Export CSV
          </Button>
          <Button variant="outline" onClick={autoEscalate} data-testid="auto-escalate-btn">
            <RefreshCcw className="mr-2" size={14} /> Run 24h check
          </Button>
          <Button variant="ghost" onClick={logout} data-testid="logout-btn"><LogOut size={14} className="mr-2" /> Logout</Button>
        </div>
      </div>

      {analytics && (
        <div className="mt-8 grid grid-cols-2 md:grid-cols-5 gap-3">
          {[
            ["Total", analytics.total, "text-[#14213d]"],
            ["Pending", (analytics.by_status.Open || 0), "text-amber-700"],
            ["Escalated", analytics.by_status.Escalated || 0, "text-red-700"],
            ["Resolved", analytics.by_status.Done || 0, "text-green-700"],
            ["Avg resolution", `${analytics.avg_resolution_hours}h`, "text-[#fb923c]"],
          ].map(([l, v, c]) => (
            <div key={l} className="bg-[#fdfaf3] border border-[#14213d]/15 rounded-md p-4">
              <div className="text-xs mono uppercase tracking-widest text-[#14213d]/60">{l}</div>
              <div className={`font-serif text-4xl ${c}`}>{v}</div>
            </div>
          ))}
        </div>
      )}

      <Tabs defaultValue="tickets" className="mt-10">
        <TabsList data-testid="tabs">
          <TabsTrigger value="tickets" data-testid="tab-tickets">Tickets</TabsTrigger>
          <TabsTrigger value="notifs" data-testid="tab-notifs"><Bell size={12} className="mr-1" /> Notifications ({notifs.length})</TabsTrigger>
          <TabsTrigger value="insights" data-testid="tab-insights"><BarChart3 size={12} className="mr-1" /> Insights</TabsTrigger>
        </TabsList>

        <TabsContent value="tickets">
          <div className="mt-4 grid md:grid-cols-4 gap-2">
            <div className="relative md:col-span-2">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#14213d]/40" size={14} />
              <Input placeholder="Search ticket, mobile, policy, text…" value={q}
                onChange={(e) => { setPage(1); setQ(e.target.value); }} className="pl-9" data-testid="search-input" />
            </div>
            <Select value={status || "all"} onValueChange={(v) => { setPage(1); setStatus(v === "all" ? "" : v); }}>
              <SelectTrigger data-testid="filter-status"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {["Open", "InProgress", "Escalated", "Done"].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={service || "all"} onValueChange={(v) => { setPage(1); setService(v === "all" ? "" : v); }}>
              <SelectTrigger data-testid="filter-service"><SelectValue placeholder="Service" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All services</SelectItem>
                {["policy", "claims", "grievance", "service"].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="mt-4 flex gap-2 flex-wrap">
            {["", "urgent", "high", "normal", "low"].map((p) => (
              <button key={p || "all"} onClick={() => { setPage(1); setPriority(p); }}
                className={`px-3 py-1 rounded-full text-xs mono uppercase tracking-widest border ${priority === p ? "bg-[#14213d] text-[#f6f1e8] border-[#14213d]" : "bg-[#fdfaf3] text-[#14213d]/70 border-[#14213d]/15"}`}
                data-testid={`priority-${p || "all"}`}
              >{p || "all priorities"}</button>
            ))}
          </div>

          <div className="mt-4 space-y-3">
            {tickets.length === 0 && <div className="text-center text-[#14213d]/60 py-16 border border-dashed border-[#14213d]/20 rounded-md">No tickets in this view.</div>}
            {tickets.map((t) => (
              <div key={t.id} className="bg-[#fdfaf3] border border-[#14213d]/15 rounded-md p-5 card-lift cursor-pointer" onClick={() => openTicket(t)} data-testid={`row-${t.ticket_id}`}>
                <div className="flex items-start justify-between flex-wrap gap-3">
                  <div>
                    <div className="mono text-xs text-[#14213d]/60">{new Date(t.created_at).toLocaleString()}</div>
                    <div className="font-serif text-2xl mt-1">{t.ticket_id}</div>
                    <div className="text-xs mono uppercase tracking-widest text-[#14213d]/60 mt-1">
                      {t.service_type} · {t.customer_type} · office {t.office_code} · {t.language}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <div className="flex items-center gap-2 flex-wrap justify-end">
                      <Badge className={`${statusColor[t.status]} border`}>{t.status}</Badge>
                      <Badge className={`${PRIORITY_COLOR[t.priority || "normal"]} border`}>{t.priority}</Badge>
                      <Badge variant="outline">{t.attended ? "Attended" : "Pending"}</Badge>
                    </div>
                    {t.escalated && <div className="text-xs text-red-700 mono flex items-center gap-1"><AlertTriangle size={12} /> Escalated</div>}
                  </div>
                </div>
                <div className="mt-3 text-sm text-[#14213d]/80 line-clamp-2">{t.parsed_text}</div>
              </div>
            ))}
          </div>

          {pages > 1 && (
            <div className="mt-6 flex justify-between items-center text-sm">
              <div className="text-[#14213d]/60 mono">{total} tickets · page {page} of {pages}</div>
              <div className="flex gap-2">
                <Button variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} data-testid="prev-page">Prev</Button>
                <Button variant="outline" disabled={page >= pages} onClick={() => setPage((p) => p + 1)} data-testid="next-page">Next</Button>
              </div>
            </div>
          )}
        </TabsContent>

        <TabsContent value="notifs">
          <div className="mt-4 space-y-2">
            {notifs.map((n) => (
              <div key={n.id} className="bg-[#fdfaf3] border border-[#14213d]/15 rounded-md p-4 text-sm" data-testid={`notif-${n.id}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge variant={n.type === "sms" ? "secondary" : "default"} className="uppercase">{n.type}</Badge>
                    <span className="mono text-xs text-[#14213d]/60">→ {n.to}</span>
                  </div>
                  <div className="mono text-xs text-[#14213d]/50">{new Date(n.created_at).toLocaleString()}</div>
                </div>
                {n.subject && <div className="font-serif text-lg mt-2">{n.subject}</div>}
                <div className="mt-1 whitespace-pre-wrap text-[#14213d]/85">{n.message}</div>
              </div>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="insights">
          {analytics && (
            <div className="mt-4 grid md:grid-cols-2 gap-4">
              <InsightsCard title="By status" data={analytics.by_status} />
              <InsightsCard title="By service" data={analytics.by_service} />
              <InsightsCard title="By priority" data={analytics.by_priority} />
              <InsightsCard title="By office" data={analytics.by_office} />
              <div className="md:col-span-2 bg-[#fdfaf3] border border-[#14213d]/15 rounded-md p-5">
                <div className="text-xs mono uppercase tracking-widest text-[#14213d]/60 mb-3">Last 7 days · new tickets</div>
                <div className="flex items-end gap-2 h-40">
                  {analytics.trend_7d.map((d) => {
                    const max = Math.max(1, ...analytics.trend_7d.map((x) => x.count));
                    const h = (d.count / max) * 100;
                    return (
                      <div key={d.day} className="flex-1 flex flex-col items-center gap-1">
                        <div className="w-full bg-[#14213d] rounded-t transition-all"
                          style={{ height: `${Math.max(h, 4)}%` }} title={`${d.day}: ${d.count}`} />
                        <div className="text-[10px] mono text-[#14213d]/60">{d.day}</div>
                        <div className="text-xs font-serif">{d.count}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={!!active} onOpenChange={(o) => !o && setActive(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-serif text-3xl">{active?.ticket_id}</DialogTitle>
          </DialogHeader>
          {active && (
            <div className="space-y-5">
              <div className="flex gap-2 flex-wrap">
                <Badge className={`${statusColor[active.status]} border`}>{active.status}</Badge>
                <Badge className={`${PRIORITY_COLOR[active.priority || "normal"]} border`}>{active.priority}</Badge>
                {active.sentiment && <Badge variant="outline">{active.sentiment}</Badge>}
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-[#14213d]/60 text-xs mono uppercase tracking-widest">Mobile</span><div>{active.mobile}</div></div>
                <div><span className="text-[#14213d]/60 text-xs mono uppercase tracking-widest">Policy</span><div>{active.policy_no || "N/A"}</div></div>
                <div><span className="text-[#14213d]/60 text-xs mono uppercase tracking-widest">Service</span><div>{active.service_type}</div></div>
                <div><span className="text-[#14213d]/60 text-xs mono uppercase tracking-widest">Language</span><div>{active.language}</div></div>
                <div className="col-span-2"><span className="text-[#14213d]/60 text-xs mono uppercase tracking-widest">Target email</span><div className="mono text-xs">{active.target_email}</div></div>
              </div>

              <div>
                <div className="text-xs mono uppercase tracking-widest text-[#14213d]/60 mb-1">Customer's note</div>
                <div className="bg-[#fdfaf3] border border-[#14213d]/15 rounded p-3 text-sm">{active.parsed_text}</div>
                {active.audio_base64 && <audio controls src={active.audio_base64} className="mt-2 w-full h-9" />}
              </div>

              <div>
                <div className="text-xs mono uppercase tracking-widest text-[#14213d]/60 mb-2">
                  Solution steps (English, up to ~250 words)
                </div>
                <Textarea rows={6} value={solution} onChange={(e) => setSolution(e.target.value)}
                  placeholder="Describe the steps taken / next steps for the customer…" data-testid="solution-input" />
              </div>

              <div className="flex items-end gap-3 flex-wrap">
                <div>
                  <div className="text-xs mono uppercase tracking-widest text-[#14213d]/60 mb-2">Reply in</div>
                  <Select value={targetLang} onValueChange={setTargetLang}>
                    <SelectTrigger className="w-56" data-testid="target-lang"><SelectValue /></SelectTrigger>
                    <SelectContent>{LANGS.map((l) => <SelectItem key={l.code} value={l.code}>{l.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <Button onClick={resolve} disabled={busy} className="bg-[#fb923c] hover:bg-[#f97316] text-[#14213d]" data-testid="resolve-btn">
                  <CheckCircle2 size={14} className="mr-2" /> Translate &amp; send
                </Button>
                {active.status !== "Escalated" && active.status !== "Done" && (
                  <>
                    <Button variant="outline" onClick={() => simulateAge(active.id)} data-testid="age-btn">
                      <Clock size={14} className="mr-2" /> Simulate 25h
                    </Button>
                    <Button variant="destructive" onClick={() => escalate(active.id)} data-testid="escalate-btn">
                      <AlertTriangle size={14} className="mr-2" /> Escalate now
                    </Button>
                  </>
                )}
              </div>

              {active.solution_translated && (
                <div className="bg-[#14213d] text-[#f6f1e8] rounded-md p-4">
                  <div className="text-xs mono uppercase tracking-widest text-[#f6f1e8]/60 mb-2 flex items-center justify-between">
                    <span>Translated · {active.solution_language}</span>
                    <button onClick={() => speak(active.solution_translated, active.solution_language)}
                      className="text-[#fb923c] hover:text-orange-300" data-testid="play-solution">
                      <Volume2 size={14} />
                    </button>
                  </div>
                  <div className="text-sm">{active.solution_translated}</div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Shell>
  );
}

function InsightsCard({ title, data }) {
  const entries = Object.entries(data);
  const total = entries.reduce((s, [, v]) => s + (v || 0), 0) || 1;
  return (
    <div className="bg-[#fdfaf3] border border-[#14213d]/15 rounded-md p-5">
      <div className="text-xs mono uppercase tracking-widest text-[#14213d]/60 mb-3">{title}</div>
      <div className="space-y-2">
        {entries.map(([k, v]) => (
          <div key={k} className="flex items-center gap-3 text-sm">
            <div className="w-24 mono text-xs text-[#14213d]/70">{k}</div>
            <div className="flex-1 bg-[#14213d]/10 h-2 rounded overflow-hidden">
              <div className="h-full bg-[#fb923c]" style={{ width: `${(v / total) * 100}%` }} />
            </div>
            <div className="w-8 text-right font-serif">{v}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
