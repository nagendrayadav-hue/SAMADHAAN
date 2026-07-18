import React, { useEffect, useState, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import Shell from "@/components/Shell";
import { api, LANGS, SPEECH_LOCALE, API } from "@/lib/api";
import { dashboardPrefs } from "@/lib/session";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import { LogOut, Volume2, AlertTriangle, Clock, CheckCircle2, Bell, RefreshCcw, Download, Search, BarChart3, Mail, Inbox as InboxIcon, MailOpen, ChevronRight } from "lucide-react";
import AIEmail from "@/components/AIEmail";
import EscalateModal from "@/components/EscalateModal";

const DARK = "#080C14", PANEL = "#0F1626", BORDER = "#1E293B", GOLD = "#FBBF24", BLUE = "#3B82F6", GREEN = "#10B981", MUTED = "#94A3B8", LIGHT = "#F1F5F9";

const statusPill = {
  Done: { bg: "rgba(16,185,129,0.12)", color: "#10B981", border: "rgba(16,185,129,0.3)" },
  Open: { bg: "rgba(251,191,36,0.12)", color: "#FBBF24", border: "rgba(251,191,36,0.3)" },
  InProgress: { bg: "rgba(59,130,246,0.12)", color: "#3B82F6", border: "rgba(59,130,246,0.3)" },
  Escalated: { bg: "rgba(239,68,68,0.15)", color: "#F87171", border: "rgba(239,68,68,0.35)" },
};
const priorityPill = {
  urgent: { bg: "rgba(239,68,68,0.15)", color: "#F87171", border: "rgba(239,68,68,0.35)" },
  high: { bg: "rgba(251,146,60,0.15)", color: "#FB923C", border: "rgba(251,146,60,0.35)" },
  normal: { bg: "rgba(59,130,246,0.12)", color: "#60A5FA", border: "rgba(59,130,246,0.3)" },
  low: { bg: "rgba(148,163,184,0.15)", color: "#94A3B8", border: "rgba(148,163,184,0.3)" },
};

export default function OfficeDashboard() {
  const nav = useNavigate();
  const savedPrefs = dashboardPrefs.get();
  const [office, setOffice] = useState(null);
  const [tickets, setTickets] = useState([]);
  const [inbox, setInbox] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(savedPrefs.page || 1);
  const [q, setQ] = useState(savedPrefs.q || "");
  const [statusF, setStatusF] = useState(savedPrefs.statusF || "");
  const [serviceF, setServiceF] = useState(savedPrefs.serviceF || "");
  const [priorityF, setPriorityF] = useState(savedPrefs.priorityF || "");
  const [tab, setTab] = useState(
    ["inbox", "pending", "inprogress", "resolved", "notifs", "insights"].includes(savedPrefs.tab)
      ? savedPrefs.tab : "pending"
  );
  const [notifs, setNotifs] = useState([]);
  const [active, setActive] = useState(null);
  const [selectedMail, setSelectedMail] = useState(null);
  const [solution, setSolution] = useState("");
  const [targetLang, setTargetLang] = useState("hi");
  const [busy, setBusy] = useState(false);
  const [analytics, setAnalytics] = useState(null);
  const seenMailIds = useRef(new Set());
  const [escalateOpen, setEscalateOpen] = useState(false);
  const LIMIT = 20;

  // Persist filter prefs
  useEffect(() => {
    dashboardPrefs.patch({ tab, q, statusF, serviceF, priorityF, page });
  }, [tab, q, statusF, serviceF, priorityF, page]);

  useEffect(() => {
    const o = JSON.parse(localStorage.getItem("samaadhaan_office") || "null");
    if (!o) { nav("/office/login"); return; }
    setOffice(o.office);
  }, []);

  useEffect(() => { if (office) load(); }, [office, page, q, serviceF, priorityF]);

  // Auto-refresh every 5s for the internal inbox feel
  useEffect(() => {
    if (!office) return;
    const id = setInterval(() => refreshInbox(), 5000);
    return () => clearInterval(id);
  }, [office]);

  const load = async () => {
    try {
      const params = { page, limit: 200 };  // fetch a wide window; tabs filter client-side
      if (q) params.q = q;
      if (serviceF) params.service_type = serviceF;
      if (priorityF) params.priority = priorityF;
      const [t, n, a, i] = await Promise.all([
        api.get("/tickets", { params }),
        api.get("/notifications", { params: { limit: 100 } }),
        api.get("/analytics/summary"),
        api.get("/inbox"),
      ]);
      setTickets(t.data.items); setTotal(t.data.total);
      setNotifs(n.data); setAnalytics(a.data); setInbox(i.data);
      if (seenMailIds.current.size === 0) i.data.forEach((m) => seenMailIds.current.add(m.id));
    } catch {}
  };

  const refreshInbox = async () => {
    try {
      const i = await api.get("/inbox");
      // Detect new mails and notify
      const fresh = i.data.filter((m) => !seenMailIds.current.has(m.id));
      fresh.forEach((m) => {
        seenMailIds.current.add(m.id);
        toast(`Incoming envelope · ${m.subject || "no subject"}`, { icon: "📥" });
      });
      setInbox(i.data);
      if (fresh.length) load(); // refresh ticket list too
    } catch {}
  };

  const openMail = (m) => {
    setSelectedMail(m);
    api.post(`/inbox/${m.id}/mark-read`).catch(() => {});
    if (m.ticket) openTicket(m.ticket);
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
      toast.success("Resolved · translated · SMS dispatched.");
      setActive(r.data); load();
    } catch (e) { toast.error(e.response?.data?.detail || "Failed"); }
    setBusy(false);
  };

  const simulateAge = async (id) => { await api.post(`/tickets/${id}/simulate-aging`); toast.info("Ticket aged 25h."); load(); };
  const openEscalate = () => setEscalateOpen(true);
  const autoEscalate = async () => { const r = await api.post("/tickets/auto-escalate"); toast(`${r.data.escalated_count} ticket(s) escalated`); load(); };

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
    window.speechSynthesis.cancel(); window.speechSynthesis.speak(u);
  };

  const logout = () => { localStorage.removeItem("samaadhaan_office"); nav("/"); };
  const pages = Math.max(1, Math.ceil(total / LIMIT));
  const unreadCount = useMemo(() => inbox.filter((m) => !m.read_at).length, [inbox]);

  if (!office) return null;

  return (
    <Shell right={
      <div className="hidden sm:flex items-center gap-3 px-3 py-1.5 rounded-lg mono text-[10px] uppercase tracking-[0.24em]"
           style={{ background: PANEL, border: `1px solid ${BORDER}`, color: MUTED }}>
        <span>Partition · <span style={{ color: LIGHT }}>{office.code}</span></span>
        <span style={{ color: BORDER }}>|</span>
        <span>{office.name}</span>
      </div>
    }>
      <div className="mt-6 flex items-start justify-between flex-wrap gap-3">
        <div>
          <div className="mono text-[10px] uppercase tracking-[0.28em]" style={{ color: GOLD }}>Command Center</div>
          <h2 className="aesthetic-serif text-5xl leading-[0.98] mt-4">{office.name}</h2>
          <div className="mono text-xs mt-2" style={{ color: MUTED }}>{office.email}</div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" onClick={exportCsv}
            className="uppercase mono tracking-widest"
            style={{ background: PANEL, borderColor: BORDER, color: LIGHT }}
            data-testid="export-csv-btn">
            <Download className="mr-2" size={12} /> CSV
          </Button>
          <Button variant="outline" onClick={autoEscalate}
            className="uppercase mono tracking-widest"
            style={{ background: PANEL, borderColor: BORDER, color: LIGHT }}
            data-testid="auto-escalate-btn">
            <RefreshCcw className="mr-2" size={12} /> 24h Check
          </Button>
          <Button variant="ghost" onClick={logout}
            className="uppercase mono tracking-widest"
            style={{ color: MUTED }}
            data-testid="logout-btn">
            <LogOut size={12} className="mr-2" /> Sign out
          </Button>
        </div>
      </div>

      {/* HERO — big-figures metric strip */}
      {analytics && (
        <div className="mt-8 rounded-2xl p-6 md:p-8"
             style={{ background: "linear-gradient(135deg, #0F1626 0%, #0a1020 100%)",
                      border: `1px solid ${BORDER}`,
                      boxShadow: "0 30px 80px -40px rgba(251,191,36,0.15)" }}>
          <div className="flex items-center justify-between flex-wrap gap-3 mb-6">
            <div>
              <div className="mono text-[10px] uppercase tracking-[0.28em]" style={{ color: MUTED }}>KPI Hero · Live</div>
              <div className="font-display text-3xl md:text-4xl mt-2">Grievance Redressal Snapshot</div>
            </div>
            <div className="mono text-[10px] uppercase tracking-[0.24em] px-3 py-1.5 rounded-full flex items-center gap-2"
                 style={{ background: DARK, border: `1px solid ${BORDER}`, color: GREEN }}>
              <span className="w-1.5 h-1.5 rounded-full dot-pulse" style={{ background: GREEN }} />
              polling · 5s
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {[
              ["Total envelopes", analytics.total, LIGHT, ""],
              ["Pending", (analytics.by_status.Open || 0) + (analytics.by_status.Escalated || 0), GOLD, "unresolved · needs attention"],
              ["In progress", analytics.by_status.InProgress || 0, BLUE, "actively worked on"],
              ["Resolved", analytics.by_status.Done || 0, GREEN, "closed · attended"],
              ["Avg SLA", `${analytics.avg_resolution_hours}h`, "#F87171", "avg time to resolve"],
            ].map(([l, v, c, sub]) => (
              <div key={l} className="rounded-xl p-4 md:p-5"
                   style={{ background: DARK, border: `1px solid ${BORDER}` }}>
                <div className="mono text-[10px] uppercase tracking-[0.24em]" style={{ color: MUTED }}>{l}</div>
                <div className="font-display text-4xl md:text-5xl mt-1" style={{ color: c }}>{v}</div>
                {sub && <div className="mono text-[10px] mt-1" style={{ color: MUTED }}>{sub}</div>}
              </div>
            ))}
          </div>
        </div>
      )}

      <Tabs value={tab} onValueChange={setTab} className="mt-10">
        <TabsList data-testid="tabs" className="mono text-[10px] uppercase tracking-widest"
          style={{ background: PANEL, border: `1px solid ${BORDER}` }}>
          <TabsTrigger value="inbox" data-testid="tab-inbox">
            <InboxIcon size={12} className="mr-1.5" /> Inbox {unreadCount > 0 && <span className="ml-2 px-1.5 py-0.5 rounded-full text-[9px] font-bold" style={{ background: GOLD, color: DARK }}>{unreadCount}</span>}
          </TabsTrigger>
          <TabsTrigger value="pending" data-testid="tab-pending">Pending</TabsTrigger>
          <TabsTrigger value="inprogress" data-testid="tab-inprogress">In Progress</TabsTrigger>
          <TabsTrigger value="resolved" data-testid="tab-resolved">Resolved</TabsTrigger>
          <TabsTrigger value="notifs" data-testid="tab-notifs">
            <Bell size={12} className="mr-1.5" /> Dispatches
          </TabsTrigger>
          <TabsTrigger value="insights" data-testid="tab-insights">
            <BarChart3 size={12} className="mr-1.5" /> Insights
          </TabsTrigger>
        </TabsList>

        {/* INBOX — internal mail from customer submissions */}
        <TabsContent value="inbox">
          <div className="mt-4 grid lg:grid-cols-12 gap-4">
            <div className="lg:col-span-5 rounded-2xl overflow-hidden" style={{ background: PANEL, border: `1px solid ${BORDER}` }}>
              <div className="px-5 py-3 flex items-center justify-between" style={{ borderBottom: `1px solid ${BORDER}` }}>
                <div className="mono text-[10px] uppercase tracking-[0.28em]" style={{ color: MUTED }}>
                  Internal envelopes · live
                </div>
                <div className="flex items-center gap-2 mono text-[10px]" style={{ color: MUTED }}>
                  <span className="w-1.5 h-1.5 rounded-full dot-pulse" style={{ background: GREEN }} />
                  polling 5s
                </div>
              </div>
              <div className="max-h-[560px] overflow-y-auto">
                {inbox.length === 0 && (
                  <div className="p-10 text-center mono text-xs uppercase tracking-widest" style={{ color: MUTED }}>
                    Inbox empty. Waiting for envelopes…
                  </div>
                )}
                {inbox.map((m) => {
                  const isSel = selectedMail?.id === m.id;
                  const unread = !m.read_at;
                  return (
                    <button key={m.id} onClick={() => openMail(m)}
                      className="w-full text-left px-5 py-4 transition"
                      style={{
                        borderBottom: `1px solid ${BORDER}`,
                        background: isSel ? "rgba(251,191,36,0.06)" : "transparent",
                      }}
                      data-testid={`inbox-${m.id}`}
                    >
                      <div className="flex items-center gap-3">
                        {unread
                          ? <Mail size={14} style={{ color: GOLD }} />
                          : <MailOpen size={14} style={{ color: MUTED }} />}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <div className="mono text-[10px] uppercase tracking-widest truncate" style={{ color: MUTED }}>
                              → {m.to}
                            </div>
                            <div className="mono text-[10px]" style={{ color: MUTED }}>
                              {new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </div>
                          </div>
                          <div className={`aesthetic-serif text-lg leading-tight mt-0.5 truncate ${unread ? "" : ""}`}
                               style={{ color: unread ? LIGHT : MUTED }}>
                            {m.subject || "(no subject)"}
                          </div>
                          {m.ticket && (
                            <div className="mt-1 mono text-[10px]" style={{ color: MUTED }}>
                              {m.ticket.service_type} · {m.ticket.mobile} · <span style={{ color: statusPill[m.ticket.status]?.color }}>{m.ticket.status}</span>
                            </div>
                          )}
                        </div>
                        <ChevronRight size={12} style={{ color: MUTED }} />
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="lg:col-span-7 rounded-2xl p-6" style={{ background: PANEL, border: `1px solid ${BORDER}` }}>
              {selectedMail ? (
                <div>
                  <div className="mono text-[10px] uppercase tracking-[0.28em]" style={{ color: MUTED }}>Envelope</div>
                  <div className="aesthetic-serif text-3xl mt-2 leading-tight">{selectedMail.subject}</div>
                  <div className="mt-3 grid grid-cols-2 gap-3 text-xs mono">
                    <div><span style={{ color: MUTED }}>TO · </span>{selectedMail.to}</div>
                    <div><span style={{ color: MUTED }}>WHEN · </span>{new Date(selectedMail.created_at).toLocaleString()}</div>
                  </div>
                  <pre className="mt-5 whitespace-pre-wrap font-sans text-sm p-4 rounded-lg"
                       style={{ background: DARK, border: `1px solid ${BORDER}`, color: LIGHT }}>
{selectedMail.message}
                  </pre>
                  {selectedMail.ticket && (
                    <div className="mt-5 flex items-center justify-between">
                      <div className="mono text-[10px] uppercase tracking-widest" style={{ color: MUTED }}>Linked ticket · {selectedMail.ticket.ticket_id}</div>
                      <Button onClick={() => openTicket(selectedMail.ticket)}
                        className="uppercase mono tracking-widest font-bold"
                        style={{ background: GOLD, color: DARK }}
                        data-testid="open-ticket-from-inbox"
                      >
                        Open ticket <ChevronRight size={12} className="ml-1" />
                      </Button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="h-full flex items-center justify-center py-24 mono text-xs uppercase tracking-widest" style={{ color: MUTED }}>
                  Select an envelope to preview.
                </div>
              )}
            </div>
          </div>
        </TabsContent>

        {/* Shared ticket list — used inside Pending / In Progress / Resolved tabs */}
        {["pending", "inprogress", "resolved"].map((bucket) => (
          <TabsContent key={bucket} value={bucket}>
            <TicketListBlock
              tickets={tickets.filter((t) => bucketMatches(bucket, t))}
              q={q} setQ={setQ}
              serviceF={serviceF} setServiceF={setServiceF}
              priorityF={priorityF} setPriorityF={setPriorityF}
              openTicket={openTicket}
              page={page} pages={pages} setPage={setPage}
              total={total}
            />
          </TabsContent>
        ))}

        {/* NOTIFS */}
        <TabsContent value="notifs">
          <div className="mt-4 space-y-2">
            {notifs.map((n) => (
              <div key={n.id} className="rounded-xl p-4 text-sm"
                   style={{ background: PANEL, border: `1px solid ${BORDER}` }}
                   data-testid={`notif-${n.id}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge variant={n.type === "sms" ? "secondary" : "default"} className="uppercase mono text-[10px]"
                           style={{ background: n.type === "sms" ? "rgba(59,130,246,0.15)" : GOLD,
                                    color: n.type === "sms" ? BLUE : DARK }}>
                      {n.type}
                    </Badge>
                    <span className="mono text-[10px]" style={{ color: MUTED }}>→ {n.to}</span>
                  </div>
                  <div className="mono text-[10px]" style={{ color: MUTED }}>{new Date(n.created_at).toLocaleString()}</div>
                </div>
                {n.subject && <div className="aesthetic-serif text-lg mt-2">{n.subject}</div>}
                <div className="mt-1 whitespace-pre-wrap text-sm" style={{ color: LIGHT }}>{n.message}</div>
              </div>
            ))}
          </div>
        </TabsContent>

        {/* INSIGHTS */}
        <TabsContent value="insights">
          {analytics && (
            <div className="mt-4 grid md:grid-cols-2 gap-4">
              <InsightsCard title="By status" data={analytics.by_status} />
              <InsightsCard title="By service" data={analytics.by_service} />
              <InsightsCard title="By priority" data={analytics.by_priority} />
              <InsightsCard title="By office" data={analytics.by_office} />
              <div className="md:col-span-2 rounded-2xl p-5" style={{ background: PANEL, border: `1px solid ${BORDER}` }}>
                <div className="mono text-[10px] uppercase tracking-[0.28em] mb-4" style={{ color: MUTED }}>Last 7 days · envelopes received</div>
                <div className="flex items-end gap-2 h-40">
                  {analytics.trend_7d.map((d) => {
                    const max = Math.max(1, ...analytics.trend_7d.map((x) => x.count));
                    const h = (d.count / max) * 100;
                    return (
                      <div key={d.day} className="flex-1 flex flex-col items-center gap-1">
                        <div className="w-full rounded-t transition-all" style={{ background: GOLD, height: `${Math.max(h, 4)}%` }} />
                        <div className="text-[10px] mono" style={{ color: MUTED }}>{d.day}</div>
                        <div className="text-xs aesthetic-serif">{d.count}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Ticket dialog */}
      <Dialog open={!!active} onOpenChange={(o) => !o && setActive(null)}>
        <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto"
          style={{ background: PANEL, border: `1px solid ${BORDER}`, color: LIGHT }}>
          <DialogHeader>
            <DialogTitle className="aesthetic-serif text-3xl" style={{ color: LIGHT }}>{active?.ticket_id}</DialogTitle>
          </DialogHeader>
          {active && (
            <div className="space-y-5">
              <div className="flex gap-2 flex-wrap">
                <span className="px-2.5 py-1 rounded-md mono text-[10px] uppercase tracking-widest"
                  style={{ background: statusPill[active.status].bg, color: statusPill[active.status].color, border: `1px solid ${statusPill[active.status].border}` }}>
                  {active.status}
                </span>
                <span className="px-2.5 py-1 rounded-md mono text-[10px] uppercase tracking-widest"
                  style={{ background: priorityPill[active.priority || "normal"].bg, color: priorityPill[active.priority || "normal"].color, border: `1px solid ${priorityPill[active.priority || "normal"].border}` }}>
                  {active.priority}
                </span>
                {active.sentiment && <Badge variant="outline" style={{ borderColor: BORDER, color: MUTED }}>{active.sentiment}</Badge>}
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm mono">
                <div><span className="text-[10px] uppercase tracking-widest" style={{ color: MUTED }}>Mobile · </span>{active.mobile}</div>
                <div><span className="text-[10px] uppercase tracking-widest" style={{ color: MUTED }}>Policy · </span>{active.policy_no || "N/A"}</div>
                <div><span className="text-[10px] uppercase tracking-widest" style={{ color: MUTED }}>Service · </span>{active.service_type}</div>
                <div><span className="text-[10px] uppercase tracking-widest" style={{ color: MUTED }}>Language · </span>{active.language}</div>
                <div className="col-span-2"><span className="text-[10px] uppercase tracking-widest" style={{ color: MUTED }}>Target email · </span>{active.target_email}</div>
              </div>

              <div>
                <div className="mono text-[10px] uppercase tracking-[0.24em] mb-2" style={{ color: MUTED }}>Customer voice note</div>
                <div className="rounded-lg p-4 aesthetic-serif text-lg leading-snug"
                     style={{ background: DARK, border: `1px solid ${BORDER}` }}>{active.parsed_text}</div>
                {active.audio_base64 && <audio controls src={active.audio_base64} className="mt-2 w-full h-9" />}
                <div className="mt-3">
                  <AIEmail ticketId={active.id} role="office" customerEmail="" />
                </div>
              </div>

              <div>
                <div className="mono text-[10px] uppercase tracking-[0.24em] mb-2" style={{ color: MUTED }}>Solution · English · up to ~250 words</div>
                <Textarea rows={6} value={solution} onChange={(e) => setSolution(e.target.value)}
                  placeholder="Steps taken / next steps for the customer…"
                  style={{ background: DARK, borderColor: BORDER, color: LIGHT }}
                  data-testid="solution-input" />
              </div>

              <div className="flex items-end gap-3 flex-wrap">
                <div>
                  <div className="mono text-[10px] uppercase tracking-[0.24em] mb-2" style={{ color: MUTED }}>Reply in</div>
                  <Select value={targetLang} onValueChange={setTargetLang}>
                    <SelectTrigger className="w-56 h-11" style={{ background: DARK, borderColor: BORDER }} data-testid="target-lang">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>{LANGS.map((l) => <SelectItem key={l.code} value={l.code}>{l.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <Button onClick={resolve} disabled={busy}
                  className="uppercase mono tracking-widest font-bold h-11"
                  style={{ background: GOLD, color: DARK }}
                  data-testid="resolve-btn">
                  <CheckCircle2 size={14} className="mr-2" /> Translate &amp; send
                </Button>
                {active.status !== "Escalated" && active.status !== "Done" && (
                  <>
                    <Button variant="outline" onClick={() => simulateAge(active.id)}
                      className="uppercase mono tracking-widest h-11"
                      style={{ background: PANEL, borderColor: BORDER, color: LIGHT }}
                      data-testid="age-btn">
                      <Clock size={12} className="mr-2" /> Age 25h
                    </Button>
                    <Button variant="destructive" onClick={openEscalate}
                      className="uppercase mono tracking-widest h-11"
                      data-testid="escalate-btn">
                      <AlertTriangle size={12} className="mr-2" /> Escalate
                    </Button>
                  </>
                )}
              </div>

              {active.solution_translated && (
                <div className="rounded-lg p-4" style={{ background: DARK, border: `1px solid ${BORDER}` }}>
                  <div className="mono text-[10px] uppercase tracking-[0.24em] mb-2 flex items-center justify-between" style={{ color: MUTED }}>
                    <span>Translated · {active.solution_language}</span>
                    <button onClick={() => speak(active.solution_translated, active.solution_language)}
                      style={{ color: GOLD }} data-testid="play-solution">
                      <Volume2 size={14} />
                    </button>
                  </div>
                  <div className="aesthetic-serif text-lg leading-snug">{active.solution_translated}</div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
      <EscalateModal
        open={escalateOpen}
        onOpenChange={setEscalateOpen}
        ticket={active}
        adminDefault={office.name}
        onEscalated={() => { setActive(null); load(); }}
      />
    </Shell>
  );
}

function bucketMatches(bucket, t) {
  if (bucket === "pending") return t.status === "Open" || t.status === "Escalated";
  if (bucket === "inprogress") return t.status === "InProgress";
  if (bucket === "resolved") return t.status === "Done";
  return true;
}

function TicketListBlock({ tickets, q, setQ, serviceF, setServiceF, priorityF, setPriorityF, openTicket, page, pages, setPage, total }) {
  return (
    <>
      <div className="mt-4 grid md:grid-cols-3 gap-2">
        <div className="relative md:col-span-2">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2" size={14} style={{ color: MUTED }} />
          <Input placeholder="Search ticket · mobile · policy · text…" value={q}
            onChange={(e) => { setPage(1); setQ(e.target.value); }} className="pl-9 h-11 mono"
            style={{ background: PANEL, borderColor: BORDER }}
            data-testid="search-input" />
        </div>
        <Select value={serviceF || "all"} onValueChange={(v) => { setPage(1); setServiceF(v === "all" ? "" : v); }}>
          <SelectTrigger className="h-11" style={{ background: PANEL, borderColor: BORDER }} data-testid="filter-service">
            <SelectValue placeholder="Service" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All services</SelectItem>
            {["policy", "claims", "grievance", "service"].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="mt-4 flex gap-2 flex-wrap">
        {["", "urgent", "high", "normal", "low"].map((p) => (
          <button key={p || "all"} onClick={() => { setPage(1); setPriorityF(p); }}
            className="px-3 py-1 rounded-full mono text-[10px] uppercase tracking-widest"
            style={priorityF === p
              ? { background: GOLD, color: DARK, border: `1px solid ${GOLD}` }
              : { background: PANEL, color: MUTED, border: `1px solid ${BORDER}` }}
            data-testid={`priority-${p || "all"}`}>
            {p || "all priorities"}
          </button>
        ))}
      </div>

      <div className="mt-4 space-y-3">
        {tickets.length === 0 && (
          <div className="text-center py-16 rounded-2xl mono text-xs uppercase tracking-widest"
               style={{ background: PANEL, border: `1px dashed ${BORDER}`, color: MUTED }}>
            No tickets in this view.
          </div>
        )}
        {tickets.map((t) => {
          const s = statusPill[t.status] || statusPill.Open;
          const pr = priorityPill[t.priority || "normal"];
          return (
            <div key={t.id} className="card-lift rounded-2xl p-5 cursor-pointer"
                 style={{ background: PANEL, border: `1px solid ${BORDER}` }}
                 onClick={() => openTicket(t)}
                 data-testid={`row-${t.ticket_id}`}>
              <div className="flex items-start justify-between flex-wrap gap-3">
                <div>
                  <div className="mono text-[10px] uppercase tracking-widest" style={{ color: MUTED }}>{new Date(t.created_at).toLocaleString()}</div>
                  <div className="font-display text-xl mt-1">{t.ticket_id}</div>
                  <div className="mono text-[10px] uppercase tracking-[0.24em] mt-1" style={{ color: MUTED }}>
                    {t.service_type} · {t.customer_type} · office {t.office_code} · lang {t.language}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <div className="flex items-center gap-2 flex-wrap justify-end">
                    <span className="px-2.5 py-1 rounded-md mono text-[10px] uppercase tracking-widest"
                      style={{ background: s.bg, color: s.color, border: `1px solid ${s.border}` }}>{t.status}</span>
                    <span className="px-2.5 py-1 rounded-md mono text-[10px] uppercase tracking-widest"
                      style={{ background: pr.bg, color: pr.color, border: `1px solid ${pr.border}` }}>{t.priority}</span>
                  </div>
                  {t.escalated && (
                    <div className="text-[10px] mono flex items-center gap-1" style={{ color: "#F87171" }}>
                      <AlertTriangle size={10} /> Escalated
                    </div>
                  )}
                </div>
              </div>
              <div className="mt-3 text-sm line-clamp-2" style={{ color: LIGHT }}>{t.parsed_text}</div>
            </div>
          );
        })}
      </div>

      {pages > 1 && (
        <div className="mt-6 flex justify-between items-center">
          <div className="mono text-xs" style={{ color: MUTED }}>{total} · page {page}/{pages}</div>
          <div className="flex gap-2">
            <Button variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}
              className="uppercase mono tracking-widest"
              style={{ background: PANEL, borderColor: BORDER, color: LIGHT }}
              data-testid="prev-page">Prev</Button>
            <Button variant="outline" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}
              className="uppercase mono tracking-widest"
              style={{ background: PANEL, borderColor: BORDER, color: LIGHT }}
              data-testid="next-page">Next</Button>
          </div>
        </div>
      )}
    </>
  );
}

function InsightsCard({ title, data }) {
  const entries = Object.entries(data);
  const total = entries.reduce((s, [, v]) => s + (v || 0), 0) || 1;
  return (
    <div className="rounded-2xl p-5" style={{ background: PANEL, border: `1px solid ${BORDER}` }}>
      <div className="mono text-[10px] uppercase tracking-[0.28em] mb-4" style={{ color: MUTED }}>{title}</div>
      <div className="space-y-2">
        {entries.map(([k, v]) => (
          <div key={k} className="flex items-center gap-3 text-sm">
            <div className="w-24 mono text-[10px] uppercase tracking-widest" style={{ color: MUTED }}>{k}</div>
            <div className="flex-1 h-1.5 rounded" style={{ background: BORDER }}>
              <div className="h-full rounded" style={{ background: GOLD, width: `${(v / total) * 100}%` }} />
            </div>
            <div className="w-8 text-right font-display">{v}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
