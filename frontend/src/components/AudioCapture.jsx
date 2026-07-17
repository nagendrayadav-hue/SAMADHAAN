import React, { useRef, useState, useEffect } from "react";
import { Mic, Square, Play, Trash2, Languages } from "lucide-react";
import { Button } from "./ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Textarea } from "./ui/textarea";
import { LANGS, SPEECH_LOCALE } from "@/lib/api";
import { toast } from "sonner";

// Records audio via MediaRecorder + transcribes via browser SpeechRecognition (Web Speech API)
export default function AudioCapture({ value, onChange, audioBase64, onAudioChange, language, onLanguageChange }) {
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [audioUrl, setAudioUrl] = useState(null);
  const mediaRef = useRef(null);
  const chunksRef = useRef([]);
  const recognitionRef = useRef(null);
  const timerRef = useRef(null);
  const transcriptRef = useRef("");

  useEffect(() => () => stopAll(), []);

  const stopAll = () => {
    try { mediaRef.current && mediaRef.current.state !== "inactive" && mediaRef.current.stop(); } catch {}
    try { recognitionRef.current && recognitionRef.current.stop(); } catch {}
    if (timerRef.current) clearInterval(timerRef.current);
  };

  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
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
        stream.getTracks().forEach((t) => t.stop());
      };
      mr.start();

      // Web Speech Recognition
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
        rec.onerror = (e) => console.warn("SR error", e);
        recognitionRef.current = rec;
        rec.start();
      } else {
        toast.warning("Speech recognition not supported in this browser. You can type your issue.");
      }

      setRecording(true);
      setElapsed(0);
      timerRef.current = setInterval(() => {
        setElapsed((s) => {
          if (s >= 120) { stop(); return 120; } // 2-minute cap
          return s + 1;
        });
      }, 1000);
    } catch (e) {
      toast.error("Microphone permission denied.");
    }
  };

  const stop = () => { stopAll(); setRecording(false); };
  const clearAudio = () => { setAudioUrl(null); onAudioChange && onAudioChange(null); onChange(""); transcriptRef.current = ""; };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-[#14213d]/60 mono">
          <Languages size={14} /> Speak in
        </div>
        <Select value={language} onValueChange={onLanguageChange}>
          <SelectTrigger className="w-56" data-testid="lang-select">
            <SelectValue placeholder="Language" />
          </SelectTrigger>
          <SelectContent>
            {LANGS.map((l) => <SelectItem key={l.code} value={l.code}>{l.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        {!recording ? (
          <Button onClick={start} className="bg-[#14213d] hover:bg-[#14213d]/90 text-[#f6f1e8]" data-testid="record-btn">
            <Mic className="mr-2" size={16} /> Record voice note (2 min)
          </Button>
        ) : (
          <Button onClick={stop} className="bg-red-600 hover:bg-red-700 text-white rec-pulse" data-testid="stop-btn">
            <Square className="mr-2" size={14} /> Stop · {String(Math.floor(elapsed / 60)).padStart(2, "0")}:{String(elapsed % 60).padStart(2, "0")}
          </Button>
        )}

        {audioUrl && (
          <>
            <audio controls src={audioUrl} className="h-9" data-testid="audio-preview" />
            <Button variant="ghost" onClick={clearAudio} data-testid="clear-audio-btn"><Trash2 size={14} /></Button>
          </>
        )}
      </div>

      <Textarea
        value={value || ""}
        onChange={(e) => { transcriptRef.current = e.target.value; onChange(e.target.value); }}
        placeholder="Your voice will be transcribed here. You can also type or edit."
        rows={5}
        className="bg-[#fdfaf3] border-[#14213d]/20"
        data-testid="parsed-text"
      />
    </div>
  );
}
