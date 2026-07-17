import React, { useRef, useState, useEffect } from "react";
import { Mic, Square, Trash2, Languages, ExternalLink, Upload, AlertCircle } from "lucide-react";
import { Button } from "./ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Textarea } from "./ui/textarea";
import { LANGS, SPEECH_LOCALE } from "@/lib/api";
import { toast } from "sonner";

// Records audio via MediaRecorder + transcribes via browser SpeechRecognition (Web Speech API).
// Robust to the Emergent preview iframe restriction by exposing an "Open in new tab" fallback
// and an explicit audio file upload path.
export default function AudioCapture({ value, onChange, audioBase64, onAudioChange, language, onLanguageChange }) {
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [audioUrl, setAudioUrl] = useState(null);
  const [micError, setMicError] = useState(null);
  const [inIframe, setInIframe] = useState(false);
  const mediaRef = useRef(null);
  const chunksRef = useRef([]);
  const recognitionRef = useRef(null);
  const timerRef = useRef(null);
  const transcriptRef = useRef("");
  const streamRef = useRef(null);

  useEffect(() => {
    try { setInIframe(window.self !== window.top); } catch { setInIframe(true); }
    return () => stopAll();
  }, []);

  const stopAll = () => {
    try { mediaRef.current && mediaRef.current.state !== "inactive" && mediaRef.current.stop(); } catch {}
    try { recognitionRef.current && recognitionRef.current.stop(); } catch {}
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  };

  const start = async () => {
    setMicError(null);
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setMicError("This browser cannot access the microphone. Please use Chrome or Edge over HTTPS.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mr = new MediaRecorder(stream);
      mediaRef.current = mr;
      chunksRef.current = [];
      mr.ondataavailable = (e) => e.data.size > 0 && chunksRef.current.push(e.data);
      mr.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        setAudioUrl(URL.createObjectURL(blob));
        const reader = new FileReader();
        reader.onloadend = () => onAudioChange && onAudioChange(reader.result);
        reader.readAsDataURL(blob);
      };
      mr.start();

      // Web Speech Recognition (optional — falls back to typed text if unavailable)
      const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (SR) {
        const rec = new SR();
        rec.lang = SPEECH_LOCALE[language] || "en-IN";
        rec.continuous = true;
        rec.interimResults = true;
        transcriptRef.current = value || "";
        rec.onresult = (ev) => {
          let interim = "";
          let finalT = transcriptRef.current;
          for (let i = ev.resultIndex; i < ev.results.length; i++) {
            const t = ev.results[i][0].transcript;
            if (ev.results[i].isFinal) finalT += t + " ";
            else interim += t;
          }
          transcriptRef.current = finalT;
          onChange((finalT + interim).trim());
        };
        rec.onerror = () => {};
        recognitionRef.current = rec;
        rec.start();
      }

      setRecording(true);
      setElapsed(0);
      timerRef.current = setInterval(() => {
        setElapsed((s) => {
          if (s >= 120) { stop(); return 120; }
          return s + 1;
        });
      }, 1000);
    } catch (e) {
      const name = e && e.name;
      let msg = "Microphone access was blocked.";
      if (name === "NotAllowedError" || name === "SecurityError") {
        msg = inIframe
          ? "The preview window doesn't allow microphone. Open in a new tab to record."
          : "Microphone permission denied. Click the mic icon in the address bar and allow access.";
      } else if (name === "NotFoundError" || name === "DevicesNotFoundError") {
        msg = "No microphone detected on this device.";
      } else if (name === "NotReadableError") {
        msg = "The microphone is being used by another application.";
      }
      setMicError(msg);
      toast.error(msg);
    }
  };

  const stop = () => { stopAll(); setRecording(false); };
  const clearAudio = () => { setAudioUrl(null); onAudioChange && onAudioChange(null); onChange(""); transcriptRef.current = ""; };

  const onUpload = (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    if (f.size > 5 * 1024 * 1024) return toast.error("Audio file too large (max 5 MB).");
    setAudioUrl(URL.createObjectURL(f));
    const reader = new FileReader();
    reader.onloadend = () => onAudioChange && onAudioChange(reader.result);
    reader.readAsDataURL(f);
  };

  const openNewTab = () => window.open(window.location.href, "_blank", "noopener");

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 mono text-[10px] uppercase tracking-[0.24em]" style={{ color: "#94A3B8" }}>
          <Languages size={12} /> Speak in
        </div>
        <Select value={language} onValueChange={onLanguageChange}>
          <SelectTrigger className="w-56 h-10" style={{ background: "#080C14", borderColor: "#1E293B" }} data-testid="lang-select">
            <SelectValue placeholder="Language" />
          </SelectTrigger>
          <SelectContent>
            {LANGS.map((l) => <SelectItem key={l.code} value={l.code}>{l.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        {!recording ? (
          <Button onClick={start}
            className="uppercase mono tracking-widest font-bold"
            style={{ background: "#FBBF24", color: "#080C14" }}
            data-testid="record-btn">
            <Mic className="mr-2" size={14} /> Record voice · 2 min
          </Button>
        ) : (
          <Button onClick={stop} className="bg-red-600 hover:bg-red-700 text-white rec-pulse uppercase mono tracking-widest" data-testid="stop-btn">
            <Square className="mr-2" size={14} /> Stop · {String(Math.floor(elapsed / 60)).padStart(2, "0")}:{String(elapsed % 60).padStart(2, "0")}
          </Button>
        )}

        <label className="inline-flex items-center gap-2 cursor-pointer px-3 py-2 rounded-md mono text-[11px] uppercase tracking-widest"
               style={{ background: "#0F1626", border: "1px solid #1E293B", color: "#94A3B8" }}>
          <Upload size={12} /> Upload audio
          <input type="file" accept="audio/*" onChange={onUpload} className="hidden" data-testid="audio-upload" />
        </label>

        {audioUrl && (
          <>
            <audio controls src={audioUrl} className="h-9" data-testid="audio-preview" />
            <Button variant="ghost" onClick={clearAudio} data-testid="clear-audio-btn" style={{ color: "#94A3B8" }}>
              <Trash2 size={14} />
            </Button>
          </>
        )}
      </div>

      {micError && (
        <div className="rounded-md p-3 flex items-start gap-3"
             style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.35)" }}>
          <AlertCircle size={16} className="shrink-0 mt-0.5" style={{ color: "#F87171" }} />
          <div className="flex-1 text-sm" style={{ color: "#FCA5A5" }}>
            <div>{micError}</div>
            {inIframe && (
              <button onClick={openNewTab}
                className="mt-2 inline-flex items-center gap-1 mono text-[10px] uppercase tracking-widest px-2.5 py-1 rounded"
                style={{ background: "#FBBF24", color: "#080C14" }}
                data-testid="open-new-tab-btn">
                <ExternalLink size={11} /> Open in a new tab
              </button>
            )}
          </div>
        </div>
      )}

      {inIframe && !micError && !recording && (
        <div className="mono text-[10px]" style={{ color: "#94A3B8" }}>
          Tip · this preview may block the microphone. If Chrome shows "permission denied", click
          <button onClick={openNewTab} className="mx-1 underline" style={{ color: "#FBBF24" }} data-testid="tip-newtab">open in a new tab</button>
          — the standalone URL always works.
        </div>
      )}

      <Textarea
        value={value || ""}
        onChange={(e) => { transcriptRef.current = e.target.value; onChange(e.target.value); }}
        placeholder="Your voice will be transcribed here. You can also type or edit."
        rows={5}
        style={{ background: "#080C14", borderColor: "#1E293B", color: "#F1F5F9" }}
        data-testid="parsed-text"
      />
    </div>
  );
}
