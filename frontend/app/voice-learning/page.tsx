"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../lib/auth-context";
import { useVoiceSession } from "../../lib/hooks/useVoiceSession";
import ProfessorScene from "../../components/voice/ProfessorScene";
import WaterRippleScene from "../../components/voice/WaterRippleScene";
import PlanetScene from "../../components/voice/PlanetScene";
import AnimatedBackground from "../../components/AnimatedBackground";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";

type Thread = {
  id: string;
  title: string | null;
  updated_at: string;
  source_session_id: string | null;
  source_files: Array<{ name: string }>;
};

type ViewState = "setup" | "session";

const VOICE_OPTIONS = [
  { value: "alloy",   label: "Alloy",   hint: "Neutral & clear" },
  { value: "coral",   label: "Coral",   hint: "Warm & friendly" },
  { value: "shimmer", label: "Shimmer", hint: "Soft & calm" },
  { value: "echo",    label: "Echo",    hint: "Deep & steady" },
  { value: "sage",    label: "Sage",    hint: "Thoughtful" },
  { value: "ash",     label: "Ash",     hint: "Crisp & clear" },
];

// ── Icons (same SVGs as dashboard) ────────────────────────────────────────

function FlashCardsIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="18" height="18">
      <rect x="5" y="7" width="11" height="8" rx="2"/><path d="M9 5h10v8"/><path d="M8.5 10.5h4"/>
    </svg>
  );
}
function PodcastIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="18" height="18">
      <path d="M4 13a8 8 0 0 1 16 0"/><rect x="4" y="13" width="3.5" height="6" rx="1.5"/>
      <rect x="16.5" y="13" width="3.5" height="6" rx="1.5"/><path d="M7.5 19a4.5 4.5 0 0 0 9 0"/>
    </svg>
  );
}
function QuizIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="18" height="18">
      <circle cx="12" cy="12" r="9"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>
      <line x1="12" y1="17" x2="12.01" y2="17"/>
    </svg>
  );
}
function DocIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="18" height="18">
      <path d="M5.5 6.5A2.5 2.5 0 0 1 8 4h10.5v15H8a2.5 2.5 0 0 0-2.5 2.5"/>
      <path d="M5.5 6.5V20"/><path d="M9.5 8h6"/><path d="M9.5 11h6"/>
    </svg>
  );
}
function VoiceIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="18" height="18">
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
      <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
      <line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/>
    </svg>
  );
}
function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="14" height="14">
      <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function VoiceLearningPage() {
  const router = useRouter();
  const { accessToken, user, loading: authLoading } = useAuth();
  const [view, setView] = useState<ViewState>("setup");
  const [threads, setThreads] = useState<Thread[]>([]);
  const [recentQuery, setRecentQuery] = useState("");
  const [selectedThread, setSelectedThread] = useState<Thread | null>(null);
  const [selectedVoice, setSelectedVoice] = useState("coral");
  const [errorMsg, setErrorMsg] = useState("");
  const [previewingVoice, setPreviewingVoice] = useState<string | null>(null);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);

  const handleVoicePreview = useCallback(async (voice: string, e: React.MouseEvent) => {
    e.stopPropagation();
    // Stop any currently playing preview
    if (previewAudioRef.current) {
      previewAudioRef.current.pause();
      previewAudioRef.current = null;
    }
    if (previewingVoice === voice) {
      setPreviewingVoice(null);
      return;
    }
    setPreviewingVoice(voice);
    try {
      const res = await fetch(`${BACKEND}/api/voice/preview/${voice}`);
      if (!res.ok) throw new Error("Preview unavailable");
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const audio = new Audio(url);
      previewAudioRef.current = audio;
      audio.onended = () => { setPreviewingVoice(null); URL.revokeObjectURL(url); };
      audio.onerror = () => { setPreviewingVoice(null); URL.revokeObjectURL(url); };
      await audio.play();
    } catch {
      setPreviewingVoice(null);
    }
  }, [previewingVoice]);
  const {
    state: voiceState,
    transcript,
    isMuted,
    audioLevel,
    aiAudioLevel,
    startSession,
    stopSession,
    toggleMute,
    interruptAI,
  } = useVoiceSession({
    studySessionId: selectedThread?.source_session_id ?? null,
    voice: selectedVoice,
    language: "English",
    accessToken,
    onError: setErrorMsg,
  });

  // Fetch recent threads for sidebar + study material selector
  useEffect(() => {
    if (authLoading) return;
    fetch(`${BACKEND}/api/chat/threads`, {
      credentials: "include",
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
    })
      .then((r) => (r.ok ? r.json() : { threads: [] }))
      .then((d) => setThreads(d.threads || []))
      .catch(() => {});
  }, [accessToken, authLoading]);

  const filteredThreads = threads.filter((t) =>
    (t.title || "Untitled").toLowerCase().includes(recentQuery.toLowerCase())
  );

  // Last AI message for the professor speech bubble
  const lastAIMessage = [...transcript].reverse().find((e) => e.role === "ai")?.text;

  const handleStart = useCallback(async () => {
    setErrorMsg("");
    setView("session");
    await startSession();
  }, [startSession]);

  const handleEnd = useCallback(() => {
    stopSession();
    setView("setup");
  }, [stopSession]);

  const handleOrbClick = useCallback(() => {
    if (voiceState === "idle" || voiceState === "error" || voiceState === "ended") {
      startSession();
    }
  }, [voiceState, startSession]);

  const initials = user?.display_name
    ? user.display_name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()
    : "?";

  return (
    <div className="pu-root">
      <AnimatedBackground />
      <div className="pu-vignette" aria-hidden="true" />

      <style jsx global>{`
        :root {
          --pu-bg: #07070b;
          --pu-text: rgba(255,255,255,0.92);
          --pu-muted: rgba(255,255,255,0.62);
          --pu-accent-1: #5aa8ff;
          --pu-accent-2: #5fe3ff;
          --pu-accent-3: #7c8cff;
          --pu-font-sans: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial;
          --pu-radius-lg: 22px;
          --pu-radius-md: 18px;
          --pu-radius-sm: 14px;
          --pu-border: rgba(255,255,255,0.10);
          --pu-surface: rgba(255,255,255,0.03);
          --pu-shadow: 0 18px 60px rgba(0,0,0,0.46);
          --pu-shadow-soft: 0 10px 26px rgba(0,0,0,0.28);
        }
        * { box-sizing: border-box; }
      `}</style>

      <style jsx>{`
        .pu-vignette {
          position: fixed; inset: 0; z-index: 1; pointer-events: none;
          background: radial-gradient(80% 70% at 50% 35%, rgba(90,168,255,0.00), rgba(0,0,0,0.55));
        }
        .pu-root {
          position: relative; height: 100vh; padding: 14px; overflow: hidden;
          color: var(--pu-text); font-family: var(--pu-font-sans);
          -webkit-font-smoothing: antialiased;
        }
        .pu-shell {
          position: relative; z-index: 2; height: 100%;
          display: grid; grid-template-columns: 340px 1fr; gap: 14px; min-width: 0;
        }

        /* Glass — identical to dashboard */
        .pu-glass {
          position: relative; border-radius: var(--pu-radius-lg);
          border: 1px solid var(--pu-border);
          background: rgba(10,12,18,0.36);
          -webkit-backdrop-filter: blur(14px) saturate(140%);
          backdrop-filter: blur(14px) saturate(140%);
          box-shadow: var(--pu-shadow); overflow: hidden;
        }
        .pu-glass::before {
          content: ""; position: absolute; inset-inline: 0; top: 0; height: 1px;
          pointer-events: none; z-index: 1;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,0.10) 40%, rgba(255,255,255,0.10) 60%, transparent);
        }

        /* Sidebar */
        .pu-sidebar { padding: 14px; display: flex; flex-direction: column; min-height: 0; }
        .pu-brandRow { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
        .pu-brand {
          font-weight: 950; letter-spacing: -0.02em; font-size: 14px; cursor: pointer;
          background: linear-gradient(90deg, var(--pu-accent-1), var(--pu-accent-2));
          -webkit-background-clip: text; background-clip: text; color: transparent;
        }
        .pu-sectionLabel {
          margin-top: 14px; font-size: 10px; font-weight: 900;
          letter-spacing: 0.10em; text-transform: uppercase; color: rgba(255,255,255,0.48);
        }
        .pu-sideNav { margin-top: 10px; display: flex; flex-direction: column; gap: 10px; }
        .pu-sideItem {
          display: flex; align-items: center; gap: 12px; padding: 12px;
          border-radius: var(--pu-radius-md); border: 1px solid rgba(255,255,255,0.10);
          background: rgba(10,12,18,0.26); backdrop-filter: blur(12px) saturate(140%);
          cursor: pointer; user-select: none; text-decoration: none; color: var(--pu-text);
          transition: transform 160ms ease, background 160ms ease, border-color 160ms ease;
          position: relative; overflow: hidden;
        }
        .pu-sideItem:hover {
          transform: translateY(-1px); background: rgba(255,255,255,0.045);
          border-color: rgba(95,227,255,0.20);
        }
        .pu-sideItem.active { border-color: rgba(95,227,255,0.26); background: rgba(255,255,255,0.05); }
        .pu-sideItem.active::before {
          content: ""; position: absolute; left: 10px; top: 10px; bottom: 10px; width: 3px;
          border-radius: 999px;
          background: linear-gradient(180deg, var(--pu-accent-2), var(--pu-accent-1));
          box-shadow: 0 0 24px rgba(95,227,255,0.22);
        }
        .pu-sideIcon { width: 18px; height: 18px; display: grid; place-items: center; color: rgba(255,255,255,0.72); flex-shrink: 0; }
        .pu-sideLabel { font-size: 12px; font-weight: 900; color: rgba(255,255,255,0.88); }
        .pu-voiceBadge {
          margin-left: auto; font-size: 8px; font-weight: 900; letter-spacing: 0.08em;
          color: rgba(95,227,255,0.85); background: rgba(95,227,255,0.10);
          border: 1px solid rgba(95,227,255,0.20); border-radius: 999px; padding: 2px 6px; flex-shrink: 0;
        }
        .pu-showAll {
          margin-top: 12px; width: 100%; padding: 10px 12px; border-radius: 14px;
          border: 1px dashed rgba(255,255,255,0.16); background: rgba(255,255,255,0.02);
          color: rgba(255,255,255,0.82); font-size: 12px; font-weight: 900; cursor: pointer;
          transition: border-color 160ms, background 160ms;
        }
        .pu-showAll:hover { border-color: rgba(255,255,255,0.28); background: rgba(255,255,255,0.04); }
        .pu-search {
          margin-top: 10px; display: flex; align-items: center; gap: 8px;
          padding: 8px 10px; border-radius: 12px; border: 1px solid rgba(255,255,255,0.08);
          background: rgba(255,255,255,0.03); color: rgba(255,255,255,0.42);
        }
        .pu-search input {
          flex: 1; background: none; border: none; outline: none;
          color: rgba(255,255,255,0.88); font-size: 11px; font-weight: 700;
        }
        .pu-search input::placeholder { color: rgba(255,255,255,0.35); }
        .pu-list {
          flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 6px; margin-top: 8px;
          scrollbar-width: thin; scrollbar-color: rgba(255,255,255,0.06) transparent;
        }
        .pu-itemCompact {
          padding: 8px 10px; border-radius: 12px; cursor: pointer; display: block;
          text-decoration: none; border: 1px solid transparent;
          transition: background 140ms, border-color 140ms;
        }
        .pu-itemCompact:hover { background: rgba(255,255,255,0.04); border-color: rgba(255,255,255,0.08); }
        .pu-itemTitle { font-size: 11px; font-weight: 800; color: rgba(255,255,255,0.82); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .pu-itemSub { font-size: 10px; font-weight: 600; color: rgba(255,255,255,0.36); margin-top: 1px; }

        /* Main panel */
        .pu-main { display: flex; flex-direction: column; min-height: 0; overflow: hidden; }
        /* In session mode: kill the glass box, go full black */
        .pu-main--session {
          border-color: transparent !important;
          background: #000 !important;
          -webkit-backdrop-filter: none !important;
          backdrop-filter: none !important;
          box-shadow: none !important;
        }
        .pu-main--session::before { display: none !important; }
        .pu-topbar { display: flex; align-items: center; justify-content: flex-end; padding: 16px 20px 0; flex-shrink: 0; }
        .pu-userChip {
          display: flex; align-items: center; gap: 8px;
          background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.10);
          border-radius: 999px; padding: 5px 12px 5px 6px;
        }
        .pu-avatar {
          width: 26px; height: 26px; border-radius: 50%;
          background: rgba(90,168,255,0.15); border: 1px solid rgba(90,168,255,0.3);
          display: grid; place-items: center; font-size: 10px; font-weight: 900; color: rgba(255,255,255,0.9);
        }
        .pu-avatarImg { width: 26px; height: 26px; border-radius: 50%; object-fit: cover; }
        .pu-userName { font-size: 11px; font-weight: 800; color: rgba(255,255,255,0.85); }

        /* Setup */
        .vl-setup {
          flex: 1; overflow-y: auto; padding: 16px 24px 24px;
          display: flex; flex-direction: column; align-items: center; gap: 20px;
        }
        .vl-header { text-align: center; display: flex; flex-direction: column; align-items: center; gap: 10px; }
        .vl-icon {
          width: 60px; height: 60px; border-radius: 20px;
          background: rgba(95,227,255,0.08); border: 1px solid rgba(95,227,255,0.18);
          display: grid; place-items: center; color: rgba(95,227,255,0.85);
        }
        .vl-title {
          font-size: 26px; font-weight: 950; letter-spacing: -0.03em;
          background: linear-gradient(90deg, #fff 30%, var(--pu-accent-2));
          -webkit-background-clip: text; background-clip: text; color: transparent;
        }
        .vl-sub { font-size: 13px; font-weight: 600; color: rgba(255,255,255,0.45); max-width: 400px; line-height: 1.6; }
        .vl-body { width: 100%; max-width: 560px; display: flex; flex-direction: column; gap: 14px; }
        .vl-card {
          background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08);
          border-radius: var(--pu-radius-md); padding: 18px; display: flex; flex-direction: column; gap: 12px;
        }
        .vl-cardLabel {
          font-size: 10px; font-weight: 900; letter-spacing: 0.10em; text-transform: uppercase;
          color: rgba(255,255,255,0.48); display: flex; align-items: center; gap: 8px;
        }
        .vl-cardHint { font-size: 12px; color: rgba(255,255,255,0.36); font-weight: 600; line-height: 1.5; }
        .vl-optional {
          font-size: 9px; font-weight: 900; letter-spacing: 0.06em; text-transform: uppercase;
          color: rgba(255,255,255,0.25); background: rgba(255,255,255,0.06); padding: 2px 7px; border-radius: 999px;
        }
        .vl-voiceGrid { display: grid; grid-template-columns: repeat(3,1fr); gap: 8px; }
        .vl-voiceBtn {
          background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08);
          border-radius: var(--pu-radius-sm); padding: 10px 10px 8px; cursor: pointer;
          text-align: left; display: flex; flex-direction: column; gap: 2px;
          transition: background 0.15s, border-color 0.15s; position: relative;
        }
        .vl-voiceBtn:hover { background: rgba(255,255,255,0.06); border-color: rgba(255,255,255,0.16); }
        .vl-voiceBtn.selected { background: rgba(95,227,255,0.09); border-color: rgba(95,227,255,0.28); }
        .vl-voiceName { font-size: 12px; font-weight: 900; color: rgba(255,255,255,0.88); }
        .vl-voiceHint { font-size: 10px; font-weight: 600; color: rgba(255,255,255,0.36); }
        .vl-voicePreviewBtn {
          position: absolute; top: 7px; right: 7px;
          width: 22px; height: 22px; border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
          background: rgba(95,227,255,0.10); border: 1px solid rgba(95,227,255,0.20);
          color: rgba(95,227,255,0.8); cursor: pointer;
          transition: background 0.15s, transform 0.15s;
        }
        .vl-voicePreviewBtn:hover { background: rgba(95,227,255,0.22); transform: scale(1.1); }
        .vl-voicePreviewBtn.playing { background: rgba(95,227,255,0.25); border-color: rgba(95,227,255,0.5); animation: vl-pulse 0.8s ease infinite; }
        .vl-input {
          background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.10);
          border-radius: 10px; padding: 9px 12px; color: rgba(255,255,255,0.9);
          font-size: 12px; font-weight: 600; outline: none; width: 100%; transition: border-color 0.15s;
        }
        .vl-input::placeholder { color: rgba(255,255,255,0.28); }
        .vl-input:focus { border-color: rgba(95,227,255,0.35); }
        .vl-threadList { display: flex; flex-direction: column; gap: 4px; max-height: 180px; overflow-y: auto; }
        .vl-threadItem {
          background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.07);
          border-radius: 10px; padding: 9px 12px; cursor: pointer; text-align: left;
          transition: background 0.12s, border-color 0.12s;
        }
        .vl-threadItem:hover { background: rgba(95,227,255,0.06); border-color: rgba(95,227,255,0.18); }
        .vl-threadTitle { font-size: 12px; font-weight: 800; color: rgba(255,255,255,0.88); }
        .vl-threadFiles { font-size: 10px; font-weight: 600; color: rgba(255,255,255,0.35); margin-top: 2px; }
        .vl-noResults { font-size: 12px; color: rgba(255,255,255,0.3); text-align: center; padding: 8px 0; }
        .vl-selectedSession {
          display: flex; align-items: center; gap: 8px;
          background: rgba(95,227,255,0.07); border: 1px solid rgba(95,227,255,0.20);
          border-radius: 10px; padding: 9px 12px;
        }
        .vl-sessionIcon { color: rgba(95,227,255,0.7); flex-shrink: 0; }
        .vl-sessionName { flex: 1; font-size: 12px; font-weight: 800; color: rgba(255,255,255,0.88); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .vl-sessionRemove { background: none; border: none; color: rgba(255,255,255,0.35); font-size: 16px; cursor: pointer; padding: 0 2px; transition: color 0.12s; }
        .vl-sessionRemove:hover { color: rgba(255,255,255,0.7); }
        .vl-infoCard {
          background: rgba(90,168,255,0.05); border: 1px solid rgba(90,168,255,0.12);
          border-radius: var(--pu-radius-sm); padding: 14px 16px; display: flex; flex-direction: column; gap: 8px;
        }
        .vl-infoRow {
          display: flex; align-items: flex-start; gap: 8px;
          font-size: 11px; font-weight: 600; color: rgba(255,255,255,0.42); line-height: 1.45;
        }
        .vl-infoRow svg { flex-shrink: 0; margin-top: 1px; color: rgba(90,168,255,0.6); }
        .vl-startBtn {
          display: flex; align-items: center; justify-content: center; gap: 10px;
          height: 50px; border-radius: var(--pu-radius-md); width: 100%; max-width: 560px;
          background: linear-gradient(135deg, rgba(90,168,255,0.9), rgba(95,227,255,0.85));
          border: none; color: rgba(0,0,0,0.88); font-size: 14px; font-weight: 900;
          cursor: pointer; transition: transform 0.15s; letter-spacing: 0.01em;
        }
        .vl-startBtn:hover { transform: translateY(-2px); }

        /* Session */
        .vl-session { flex: 1; position: relative; min-height: 0; overflow: hidden; background: #000; }
        .vl-sessionHeader {
          position: absolute; top: 0; left: 0; right: 0; z-index: 10;
          display: flex; align-items: center; justify-content: space-between;
          padding: 14px 18px 0; gap: 10px;
        }
        .vl-sessionInfo { display: flex; align-items: center; gap: 8px; }
        .vl-statusDot { width: 8px; height: 8px; border-radius: 50%; transition: background 0.3s; }
        .vl-dot-idle       { background: rgba(255,255,255,0.22); }
        .vl-dot-connecting { background: rgba(90,168,255,0.8); animation: vl-pulse 1s ease infinite; }
        .vl-dot-listening  { background: rgba(95,227,255,0.9); animation: vl-pulse 2s ease infinite; }
        .vl-dot-thinking   { background: rgba(168,130,255,0.9); animation: vl-pulse 0.8s ease infinite; }
        .vl-dot-speaking   { background: rgba(100,220,180,0.9); animation: vl-pulse 1.2s ease infinite; }
        .vl-dot-error      { background: rgba(255,90,90,0.9); }
        .vl-dot-ended      { background: rgba(255,255,255,0.15); }
        @keyframes vl-pulse { 0%,100% { opacity:1; transform:scale(1); } 50% { opacity:0.5; transform:scale(0.8); } }
        .vl-statusText { font-size: 11px; font-weight: 700; color: rgba(255,255,255,0.42); }
        .vl-sessionActions { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
        .vl-ctrlBtn {
          display: inline-flex; align-items: center; gap: 6px; height: 32px; padding: 0 12px;
          border-radius: 999px; border: 1px solid rgba(255,255,255,0.10);
          background: rgba(255,255,255,0.04); color: rgba(255,255,255,0.7);
          font-size: 11px; font-weight: 800; cursor: pointer;
          transition: background 0.15s, border-color 0.15s, color 0.15s;
        }
        .vl-ctrlBtn:hover { background: rgba(255,255,255,0.07); color: rgba(255,255,255,0.95); }
        .vl-ctrlMuted { border-color: rgba(255,90,90,0.3); color: rgba(255,110,110,0.85); background: rgba(255,90,90,0.07); }
        .vl-ctrlInterrupt { border-color: rgba(168,130,255,0.3); color: rgba(168,130,255,0.9); background: rgba(168,130,255,0.07); }
        .vl-ctrlEnd { border-color: rgba(255,90,90,0.22); color: rgba(255,110,110,0.75); background: rgba(255,90,90,0.05); }
        .vl-ctrlEnd:hover { background: rgba(255,90,90,0.10); border-color: rgba(255,90,90,0.38); color: rgba(255,130,130,0.95); }
        .vl-errorBanner {
          display: flex; align-items: center; gap: 8px;
          background: rgba(255,90,90,0.09); border: 1px solid rgba(255,90,90,0.20);
          border-radius: 12px; padding: 10px 14px; margin: 0 18px;
          font-size: 12px; font-weight: 700; color: rgba(255,150,150,0.9); flex-shrink: 0;
        }
        .vl-errorDismiss { margin-left: auto; background: none; border: none; color: rgba(255,150,150,0.55); font-size: 16px; cursor: pointer; }
        .vl-sceneArea { display: contents; }
        .vl-sphereWrap {
          position: absolute;
          top: 50%; left: 50%;
          transform: translate(-50%, -50%);
          width: min(380px, 72vw); height: min(380px, 72vw);
        }
        .vl-subtitles {
          position: absolute; bottom: 28px; left: 50%; transform: translateX(-50%); z-index: 2;
          width: 100%; max-width: 560px; min-height: 52px;
          display: flex; align-items: center; justify-content: center;
          padding: 0 24px;
        }
        .vl-subtitleText {
          font-size: 14px; font-weight: 600; line-height: 1.6;
          color: rgba(255,255,255,0.78); text-align: center;
          background: rgba(10,12,20,0.55);
          border: 1px solid rgba(255,255,255,0.07);
          backdrop-filter: blur(14px);
          border-radius: 16px; padding: 10px 20px;
          max-height: 80px; overflow: hidden;
          display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical;
        }
        .vl-subtitleHint {
          font-size: 11px; font-weight: 700; letter-spacing: 0.06em;
          text-transform: uppercase; color: rgba(255,255,255,0.20);
        }

        @media (max-width: 980px) {
          .pu-shell { grid-template-columns: 1fr; }
          .pu-sidebar { display: none; }
        }
      `}</style>

      <div className="pu-shell">

        {/* ── Sidebar — identical look to dashboard ────────────────── */}
        <aside className="pu-glass pu-sidebar">
          <div className="pu-brandRow">
            <div className="pu-brand" onClick={() => router.push("/dashboard")}>Prepare-Up</div>
          </div>

          <div className="pu-sectionLabel">MAIN</div>
          <nav className="pu-sideNav" aria-label="Main navigation">
            <a href="/flashcard" className="pu-sideItem">
              <div className="pu-sideIcon"><FlashCardsIcon /></div>
              <div className="pu-sideLabel">Flash Cards</div>
            </a>
            <a href="/podcast" className="pu-sideItem">
              <div className="pu-sideIcon"><PodcastIcon /></div>
              <div className="pu-sideLabel">Podcast</div>
            </a>
            <a href="/mockquiz" className="pu-sideItem">
              <div className="pu-sideIcon"><QuizIcon /></div>
              <div className="pu-sideLabel">Mock Test</div>
            </a>
            <a href="/studyguide" className="pu-sideItem">
              <div className="pu-sideIcon"><DocIcon /></div>
              <div className="pu-sideLabel">Study Guide</div>
            </a>
            {/* Voice Learning — active (current page) */}
            <div className="pu-sideItem active" style={{ cursor: "default" }}>
              <div className="pu-sideIcon"><VoiceIcon /></div>
              <div className="pu-sideLabel">Voice Learning</div>
              <div className="pu-voiceBadge">LIVE</div>
            </div>
          </nav>

          <button className="pu-showAll" type="button" onClick={() => router.push("/dashboard")}>
            + New chat
          </button>

          <div className="pu-sectionLabel">RECENTS</div>

          <div className="pu-search">
            <SearchIcon />
            <input
              placeholder="Search chats…"
              value={recentQuery}
              onChange={(e) => setRecentQuery(e.target.value)}
              autoComplete="off"
              spellCheck={false}
            />
          </div>

          <div className="pu-list">
            {filteredThreads.slice(0, 12).map((t) => (
              <a key={t.id} href="/dashboard" className="pu-itemCompact">
                <div className="pu-itemTitle">{t.title || "Untitled chat"}</div>
                <div className="pu-itemSub">{t.source_files?.[0]?.name || " "}</div>
              </a>
            ))}
          </div>
        </aside>

        {/* ── Main panel ───────────────────────────────────────────── */}
        <main className={`pu-glass pu-main${view === "session" ? " pu-main--session" : ""}`}>
          {/* topbar only in setup; session header handles user chip inline */}
          {view === "setup" && (
          <div className="pu-topbar">
            {user && (
              <div className="pu-userChip">
                {user.avatar_url
                  ? <img src={user.avatar_url} alt="" className="pu-avatarImg" />
                  : <div className="pu-avatar">{initials}</div>
                }
                <span className="pu-userName">{user.display_name || user.email || "User"}</span>
              </div>
            )}
          </div>
          )}

          {/* ── Setup view ─────────────────────────────────────────── */}
          {view === "setup" && (
            <div className="vl-setup">
              <div className="vl-header">
                <div className="vl-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" width="28" height="28">
                    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                    <line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/>
                  </svg>
                </div>
                <div className="vl-title">Voice Learning</div>
                <div className="vl-sub">
                  Talk to your AI tutor in real time. Ask questions, get explanations, and study naturally — just speak.
                </div>
              </div>


              <div className="vl-body">
                {/* Voice picker */}
                <div className="vl-card">
                  <div className="vl-cardLabel">Tutor voice</div>
                  <div className="vl-voiceGrid">
                    {VOICE_OPTIONS.map((v) => (
                      <button
                        key={v.value}
                        className={`vl-voiceBtn${selectedVoice === v.value ? " selected" : ""}`}
                        onClick={() => setSelectedVoice(v.value)}
                        type="button"
                      >
                        <div className="vl-voiceName">{v.label}</div>
                        <div className="vl-voiceHint">{v.hint}</div>
                        <button
                          className={`vl-voicePreviewBtn${previewingVoice === v.value ? " playing" : ""}`}
                          onClick={(e) => handleVoicePreview(v.value, e)}
                          type="button"
                          title={previewingVoice === v.value ? "Stop preview" : "Preview voice"}
                        >
                          {previewingVoice === v.value ? (
                            <svg width="9" height="9" viewBox="0 0 9 9" fill="currentColor">
                              <rect x="1" y="1" width="2.5" height="7"/><rect x="5.5" y="1" width="2.5" height="7"/>
                            </svg>
                          ) : (
                            <svg width="9" height="9" viewBox="0 0 9 9" fill="currentColor">
                              <polygon points="2,1 8,4.5 2,8"/>
                            </svg>
                          )}
                        </button>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Study material */}
                <div className="vl-card">
                  <div className="vl-cardLabel">
                    Study material
                    
                  </div>
                  <div className="vl-cardHint">
                    Ground your tutor in your uploaded notes — it will answer from your content.
                  </div>

                  {selectedThread ? (
                    <div className="vl-selectedSession">
                      <div className="vl-sessionIcon"><DocIcon /></div>
                      <div className="vl-sessionName">{selectedThread.title || "Untitled chat"}</div>
                      <button className="vl-sessionRemove" onClick={() => setSelectedThread(null)} type="button">×</button>
                    </div>
                  ) : (
                    <>
                      <input
                        className="vl-input"
                        placeholder="Search your chats…"
                        value={recentQuery}
                        onChange={(e) => setRecentQuery(e.target.value)}
                      />
                      {filteredThreads.length > 0 && (
                        <div className="vl-threadList">
                          {filteredThreads.slice(0, 6).map((t) => (
                            <button
                              key={t.id}
                              className="vl-threadItem"
                              onClick={() => { setSelectedThread(t); setRecentQuery(""); }}
                              type="button"
                            >
                              <div className="vl-threadTitle">{t.title || "Untitled chat"}</div>
                              <div className="vl-threadFiles">{t.source_files?.map((f) => f.name).join(", ") || "No files"}</div>
                            </button>
                          ))}
                        </div>
                      )}
                      {recentQuery && filteredThreads.length === 0 && (
                        <div className="vl-noResults">No matching chats found</div>
                      )}
                    </>
                  )}
                </div>

                {/* Info */}
                <div className="vl-infoCard">
                  <div className="vl-infoRow">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="14" height="14"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                    Server voice activity detection — speak naturally, no button needed
                  </div>
                  <div className="vl-infoRow">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="14" height="14"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                    Your permanent API key stays on the server — only a 60-second ephemeral token is used
                  </div>
                </div>

                <button className="vl-startBtn" onClick={handleStart} type="button">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="18" height="18">
                    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                    <line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/>
                  </svg>
                  Start Voice Session
                </button>
              </div>
            </div>
          )}

          {/* ── Session view ────────────────────────────────────────── */}
          {view === "session" && (
            <div style={{ flex: 1, position: "relative", minHeight: 0, overflow: "hidden" }}>
              {/* Full-panel Three.js scene — fills the whole panel, no box boundary */}
              <div style={{ position: "absolute", inset: 0, zIndex: 0 }}>
                <PlanetScene
                  voiceState={voiceState}
                  aiAudioLevel={aiAudioLevel}
                  audioLevel={audioLevel}
                />
              </div>

              {/* Controls bar */}
              <div className="vl-sessionHeader">
                <div className="vl-sessionInfo">
                  <div className={`vl-statusDot vl-dot-${voiceState}`} />
                  <span className="vl-statusText">
                    {selectedThread
                      ? `Grounded in: ${selectedThread.title || "Untitled"}`
                      : "General tutor mode · speak anytime"}
                  </span>
                </div>
                <div className="vl-sessionActions">
                  {/* User chip in session header */}
                  {user && (
                    <div className="pu-userChip" style={{ marginRight: 4 }}>
                      {user.avatar_url
                        ? <img src={user.avatar_url} alt="" className="pu-avatarImg" />
                        : <div className="pu-avatar">{initials}</div>
                      }
                      <span className="pu-userName">{user.display_name || user.email || "User"}</span>
                    </div>
                  )}
                  <button
                    className={`vl-ctrlBtn${isMuted ? " vl-ctrlMuted" : ""}`}
                    onClick={toggleMute}
                    type="button"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="14" height="14">
                      {isMuted
                        ? <><line x1="1" y1="1" x2="23" y2="23"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"/></>
                        : <><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/></>
                      }
                    </svg>
                    {isMuted ? "Unmute" : "Mute"}
                  </button>

                  {(voiceState === "speaking" || voiceState === "thinking") && (
                    <button className="vl-ctrlBtn vl-ctrlInterrupt" onClick={interruptAI} type="button">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="14" height="14">
                        <rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>
                      </svg>
                      Interrupt
                    </button>
                  )}

                  <button className="vl-ctrlBtn vl-ctrlEnd" onClick={handleEnd} type="button">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="14" height="14">
                      <path d="M18.36 6.64A9 9 0 1 1 5.64 17.36"/><line x1="12" y1="2" x2="12" y2="12"/>
                    </svg>
                    End Session
                  </button>
                </div>
              </div>

              {errorMsg && (
                <div className="vl-errorBanner">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="14" height="14"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                  {errorMsg}
                  <button className="vl-errorDismiss" onClick={() => setErrorMsg("")} type="button">×</button>
                </div>
              )}

              {/* Subtitle strip */}
              <div className="vl-subtitles">
                {lastAIMessage ? (
                  <div className="vl-subtitleText">{lastAIMessage}</div>
                ) : (
                  <span className="vl-subtitleHint">
                    {voiceState === "connecting" ? "Connecting…" : "Speak to begin"}
                  </span>
                )}
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
