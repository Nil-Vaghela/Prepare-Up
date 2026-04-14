"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import AnimatedBackground from "../../components/AnimatedBackground";
import { useAuth } from "../../lib/auth-context";

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";

type Thread = { id: string; title: string | null; updated_at: string; source_session_id: string | null; source_files: Array<{ name: string }> };
type Turn = { speaker: string; text: string };
type ViewState = "select" | "generating" | "listening";
type AudioState = "idle" | "loading" | "ready" | "error";

const FEATURES = [
  { href: "/flashcard",  label: "Flash Cards", icon: "⊞" },
  { href: "/podcast",    label: "Podcast",     icon: "🎙" },
  { href: "/mockquiz",   label: "Mock Test",   icon: "✎" },
  { href: "/studyguide", label: "Study Guide", icon: "≡" },
];

export default function PodcastPage() {
  const router = useRouter();
  const { accessToken, loading: authLoading } = useAuth();
  const [threads, setThreads] = useState<Thread[]>([]);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Thread | null>(null);
  const [view, setView] = useState<ViewState>("select");
  const [error, setError] = useState("");

  // Script
  const [speakers, setSpeakers] = useState<[string, string]>(["Host", "Guest"]);
  const [script, setScript] = useState<Turn[]>([]);

  // Audio
  const [audioState, setAudioState] = useState<AudioState>("idle");
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioError, setAudioError] = useState("");
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    if (authLoading) return;
    fetch(`${BACKEND}/api/chat/threads`, {
      credentials: "include",
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
    })
      .then(r => r.ok ? r.json() : { threads: [] })
      .then(d => setThreads(d.threads || []))
      .catch(() => {});
  }, [accessToken, authLoading]);

  // Cleanup blob URL only on unmount (not every time audioUrl changes — avoids revoke-before-play)
  const audioUrlRef = useRef<string | null>(null);
  audioUrlRef.current = audioUrl;
  useEffect(() => {
    return () => {
      if (audioUrlRef.current?.startsWith("blob:")) URL.revokeObjectURL(audioUrlRef.current);
    };
  }, []);

  const filtered = threads.filter(t =>
    (t.title || "Untitled").toLowerCase().includes(query.toLowerCase())
  );

  const generate = useCallback(async (thread: Thread) => {
    const sid = thread.source_session_id;
    if (!sid) { setError("This chat has no uploaded content to generate from."); return; }
    setSelected(thread);
    setView("generating");
    setError("");
    setScript([]);
    setAudioState("idle");
    if (audioUrl) { URL.revokeObjectURL(audioUrl); setAudioUrl(null); }
    try {
      const res = await fetch(`${BACKEND}/api/generate`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({ session_id: sid, output_type: "podcast" }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.detail || "Generation failed"); }
      const data = await res.json();
      // Support both {script: [{speaker, text}]} and {podcast_script: [...]} shapes
      const turns: Turn[] = Array.isArray(data.script)
        ? data.script
        : Array.isArray(data.podcast_script)
          ? data.podcast_script
          : [];
      if (!turns.length) throw new Error("No script returned. Try a different chat.");
      if (data.speakers?.length >= 2) setSpeakers([data.speakers[0], data.speakers[1]]);
      else {
        const names = Array.from(new Set(turns.map((t: Turn) => t.speaker))) as string[];
        if (names.length >= 2) setSpeakers([names[0], names[1]]);
      }
      setScript(turns);
      setView("listening");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Generation failed.");
      setView("select");
    }
  }, [audioUrl, accessToken]);

  const onGenerateAudio = useCallback(async () => {
    if (!script.length) return;
    setAudioState("loading");
    setAudioError("");
    if (audioUrl) { URL.revokeObjectURL(audioUrl); setAudioUrl(null); }
    try {
      const res = await fetch(`${BACKEND}/api/podcast/audio`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({ speakers, script }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.detail || "Audio generation failed"); }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      setAudioUrl(url);
      setAudioState("ready");
    } catch (e: unknown) {
      setAudioError(e instanceof Error ? e.message : "Audio generation failed.");
      setAudioState("error");
    }
  }, [script, speakers, audioUrl]);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) { audio.pause(); } else { void audio.play(); }
  };

  const formatTime = (s: number) => {
    if (!isFinite(s)) return "0:00";
    return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
  };

  const speakerColor = (sp: string) =>
    sp === speakers[0] ? "rgba(90,168,255,0.9)" : "rgba(95,227,255,0.9)";

  return (
    <>
      <AnimatedBackground />
      <div className="pd-root">
        {/* ── Sidebar ── */}
        <aside className="pd-glass pd-sidebar">
          <div className="pd-brand" onClick={() => router.push("/dashboard")} style={{ cursor: "pointer" }}>PrepareUp</div>
          <div className="pd-sectionLabel">MAIN</div>
          <nav className="pd-nav">
            {FEATURES.map(f => (
              <div key={f.href} className={`pd-navItem${f.href === "/podcast" ? " active" : ""}`} onClick={() => router.push(f.href)}>
                <span className="pd-navIcon">{f.icon}</span>
                <span>{f.label}</span>
              </div>
            ))}
          </nav>
          <button className="pd-newChat" onClick={() => router.push("/dashboard")}>
            <span>+</span> New Chat
          </button>
          <div className="pd-sectionLabel" style={{ marginTop: 14 }}>RECENTS</div>
          <input className="pd-search" placeholder="Search chats…" value={query} onChange={e => setQuery(e.target.value)} />
          <div className="pd-list">
            {filtered.map(t => (
              <div key={t.id} className={`pd-thread${selected?.id === t.id ? " active" : ""}`} onClick={() => generate(t)}>
                <div className="pd-threadTitle">{t.title || "Untitled chat"}</div>
                <div className="pd-threadSub">{t.source_files?.map(f => f.name).join(", ") || "No files"}</div>
              </div>
            ))}
            {!filtered.length && <div className="pd-empty">No chats yet. Upload content from the dashboard first.</div>}
          </div>
        </aside>

        {/* ── Main ── */}
        <main className="pd-glass pd-main">
          {view === "select" && (
            <div className="pd-centerState">
              <div className="pd-centerIcon">🎙</div>
              <div className="pd-centerTitle">Podcast Workspace</div>
              <div className="pd-centerSub">Select a chat from the sidebar to generate a two-speaker podcast from your notes.</div>
              {error && <div className="pd-error">{error}</div>}
            </div>
          )}

          {view === "generating" && (
            <div className="pd-centerState">
              <div className="pd-spinner" />
              <div className="pd-centerTitle">Writing podcast script…</div>
              <div className="pd-centerSub">Creating a two-speaker conversation from "{selected?.title || "your chat"}"</div>
            </div>
          )}

          {view === "listening" && script.length > 0 && (
            <div className="pd-workspace">
              {/* Header */}
              <div className="pd-wsHeader">
                <div>
                  <div className="pd-wsEyebrow">PODCAST WORKSPACE</div>
                  <div className="pd-wsTitle">{selected?.title || "Your notes"}</div>
                </div>
                <div className="pd-headerActions">
                  <button className="pd-backBtn" onClick={() => { setView("select"); setSelected(null); setScript([]); setAudioState("idle"); }}>← Back to Chats</button>
                </div>
              </div>

              {/* Speakers legend */}
              <div className="pd-speakersRow">
                {speakers.map(sp => (
                  <div key={sp} className="pd-speakerBadge" style={{ borderColor: speakerColor(sp), color: speakerColor(sp) }}>
                    <span className="pd-speakerDot" style={{ background: speakerColor(sp) }} />
                    {sp}
                  </div>
                ))}
                <div className="pd-metaChip">{script.length} turns</div>
              </div>

              {/* Audio player card */}
              <div className="pd-audioCard">
                {audioState === "idle" && (
                  <div className="pd-audioIdle">
                    <div className="pd-audioIdleLeft">
                      <div className="pd-audioIdleIcon">🎧</div>
                      <div>
                        <div className="pd-audioIdleTitle">Script ready</div>
                        <div className="pd-audioIdleSub">Convert this script to a real MP3 podcast with AI voices</div>
                      </div>
                    </div>
                    <button className="pd-ctrlBtn pd-ctrlAccent" onClick={onGenerateAudio}>Generate Audio</button>
                  </div>
                )}
                {audioState === "loading" && (
                  <div className="pd-audioLoading">
                    <div className="pd-spinner" style={{ width: 24, height: 24 }} />
                    <div>
                      <div className="pd-audioLoadTitle">Synthesizing voices…</div>
                      <div className="pd-audioLoadSub">This usually takes 30–90 seconds</div>
                    </div>
                  </div>
                )}
                {audioState === "error" && (
                  <div className="pd-audioIdle">
                    <div className="pd-error" style={{ flex: 1 }}>{audioError}</div>
                    <button className="pd-ctrlBtn" onClick={onGenerateAudio}>Retry</button>
                  </div>
                )}
                {audioState === "ready" && audioUrl && (
                  <div className="pd-player">
                    <audio
                      ref={audioRef}
                      src={audioUrl}
                      onTimeUpdate={() => { if (audioRef.current) setCurrentTime(audioRef.current.currentTime); }}
                      onLoadedMetadata={() => { if (audioRef.current) setDuration(audioRef.current.duration); }}
                      onPlay={() => setPlaying(true)}
                      onPause={() => setPlaying(false)}
                      onEnded={() => setPlaying(false)}
                      preload="metadata"
                    />
                    <div className="pd-playerTop">
                      <div>
                        <div className="pd-playerTitle">Podcast · {speakers[0]} & {speakers[1]}</div>
                        <div className="pd-playerSub">{script.length} turns · {formatTime(duration)}</div>
                      </div>
                      <div className="pd-playerBtns">
                        <a href={audioUrl} download="podcast.mp3" className="pd-ctrlBtn" style={{ textDecoration: "none" }}>↓ Download</a>
                        <button className="pd-ctrlBtn" onClick={onGenerateAudio}>Regenerate</button>
                      </div>
                    </div>
                    <div className="pd-playerControls">
                      <button className="pd-playBtn" onClick={togglePlay}>
                        {playing ? (
                          <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>
                        ) : (
                          <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><path d="M8 5.14v14l11-7-11-7z"/></svg>
                        )}
                      </button>
                      <span className="pd-playerTime">{formatTime(currentTime)}</span>
                      <input
                        type="range" min={0} max={duration || 100} value={currentTime} step={0.1}
                        onChange={e => { const t = parseFloat(e.target.value); if (audioRef.current) { audioRef.current.currentTime = t; } setCurrentTime(t); }}
                        className="pd-seekBar"
                      />
                      <span className="pd-playerTime">{formatTime(duration)}</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Script transcript */}
              <div className="pd-scriptLabel">SCRIPT TRANSCRIPT</div>
              <div className="pd-scriptBody">
                {script.map((turn, i) => (
                  <div key={i} className={`pd-turn${turn.speaker === speakers[0] ? " turn-a" : " turn-b"}`}>
                    <div className="pd-turnSpeaker" style={{ color: speakerColor(turn.speaker) }}>{turn.speaker}</div>
                    <div className="pd-turnText">{turn.text}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </main>
      </div>

      <style jsx>{`
        :global(body){margin:0;background:#07070b;}
        .pd-root{position:relative;z-index:1;display:grid;grid-template-columns:240px 1fr;gap:12px;height:100vh;padding:12px;box-sizing:border-box;font-family:ui-sans-serif,system-ui,-apple-system,sans-serif;color:rgba(255,255,255,0.92);-webkit-font-smoothing:antialiased;}
        .pd-glass{border-radius:20px;border:1px solid rgba(255,255,255,0.1);background:rgba(10,12,18,0.5);backdrop-filter:blur(18px) saturate(140%);-webkit-backdrop-filter:blur(18px) saturate(140%);box-shadow:0 20px 60px rgba(0,0,0,0.5);}
        .pd-sidebar{padding:16px;display:flex;flex-direction:column;min-height:0;overflow:hidden;}
        .pd-main{overflow-y:auto;padding:0;}
        .pd-brand{font-size:15px;font-weight:950;letter-spacing:-0.02em;background:linear-gradient(90deg,#5aa8ff,#5fe3ff);-webkit-background-clip:text;background-clip:text;color:transparent;margin-bottom:14px;}
        .pd-sectionLabel{font-size:10px;font-weight:900;letter-spacing:0.1em;text-transform:uppercase;color:rgba(255,255,255,0.4);margin-bottom:6px;}
        .pd-nav{display:flex;flex-direction:column;gap:4px;}
        .pd-navItem{display:flex;align-items:center;gap:10px;padding:9px 12px;border-radius:12px;border:1px solid transparent;cursor:pointer;font-size:13px;font-weight:700;color:rgba(255,255,255,0.75);transition:all 130ms;}
        .pd-navItem:hover{background:rgba(255,255,255,0.04);border-color:rgba(255,255,255,0.08);}
        .pd-navItem.active{background:rgba(255,255,255,0.06);border-color:rgba(95,227,255,0.25);color:rgba(255,255,255,0.95);}
        .pd-navIcon{font-size:14px;width:18px;text-align:center;}
        .pd-search{margin-top:4px;width:100%;box-sizing:border-box;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:8px 12px;font-size:12px;color:rgba(255,255,255,0.85);outline:none;}
        .pd-search::placeholder{color:rgba(255,255,255,0.35);}
        .pd-list{flex:1;overflow-y:auto;display:flex;flex-direction:column;gap:4px;margin-top:8px;}
        .pd-thread{padding:10px 12px;border-radius:12px;border:1px solid rgba(255,255,255,0.06);background:rgba(255,255,255,0.02);cursor:pointer;transition:all 130ms;}
        .pd-thread:hover{background:rgba(255,255,255,0.05);border-color:rgba(95,227,255,0.18);}
        .pd-thread.active{border-color:rgba(95,227,255,0.3);background:rgba(95,227,255,0.06);}
        .pd-threadTitle{font-size:12px;font-weight:800;color:rgba(255,255,255,0.88);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
        .pd-threadSub{font-size:10px;color:rgba(255,255,255,0.42);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
        .pd-empty{font-size:12px;color:rgba(255,255,255,0.4);padding:12px 0;text-align:center;line-height:1.5;}
        .pd-newChat{width:100%;margin-top:10px;height:36px;border-radius:12px;border:1px dashed rgba(255,255,255,0.18);background:rgba(255,255,255,0.03);color:rgba(255,255,255,0.72);font-size:12px;font-weight:800;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px;transition:all 130ms;}
        .pd-newChat:hover{background:rgba(95,227,255,0.06);border-color:rgba(95,227,255,0.35);color:rgba(255,255,255,0.92);}
        /* Center states */
        .pd-centerState{display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;gap:16px;padding:40px;text-align:center;}
        .pd-centerIcon{font-size:48px;line-height:1;}
        .pd-centerTitle{font-size:22px;font-weight:950;letter-spacing:-0.02em;color:rgba(255,255,255,0.94);}
        .pd-centerSub{font-size:14px;color:rgba(255,255,255,0.55);line-height:1.6;max-width:420px;}
        .pd-error{font-size:13px;color:#ff6b6b;padding:10px 16px;border-radius:12px;border:1px solid rgba(255,107,107,0.2);background:rgba(255,107,107,0.07);}
        .pd-spinner{width:36px;height:36px;border-radius:50%;border:3px solid rgba(255,255,255,0.1);border-top-color:#5aa8ff;animation:spin 0.8s linear infinite;flex-shrink:0;}
        @keyframes spin{to{transform:rotate(360deg)}}
        /* Workspace */
        .pd-workspace{padding:24px;display:flex;flex-direction:column;gap:18px;}
        .pd-wsHeader{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap;}
        .pd-wsEyebrow{font-size:10px;font-weight:900;letter-spacing:0.1em;text-transform:uppercase;color:rgba(255,255,255,0.45);}
        .pd-wsTitle{font-size:20px;font-weight:950;letter-spacing:-0.02em;color:rgba(255,255,255,0.94);margin-top:4px;}
        .pd-headerActions{flex-shrink:0;}
        .pd-backBtn{height:34px;padding:0 14px;border-radius:999px;border:1px solid rgba(255,255,255,0.12);background:rgba(255,255,255,0.04);color:rgba(255,255,255,0.8);font-size:12px;font-weight:800;cursor:pointer;transition:all 130ms;}
        .pd-backBtn:hover{background:rgba(255,255,255,0.07);}
        /* Speakers */
        .pd-speakersRow{display:flex;align-items:center;gap:8px;flex-wrap:wrap;}
        .pd-speakerBadge{display:flex;align-items:center;gap:6px;height:28px;padding:0 12px;border-radius:999px;border:1px solid;font-size:11px;font-weight:900;}
        .pd-speakerDot{width:7px;height:7px;border-radius:50%;flex-shrink:0;}
        .pd-metaChip{height:28px;padding:0 12px;border-radius:999px;border:1px solid rgba(255,255,255,0.1);background:rgba(255,255,255,0.04);font-size:11px;font-weight:700;color:rgba(255,255,255,0.55);display:inline-flex;align-items:center;}
        /* Audio card */
        .pd-audioCard{border-radius:18px;border:1px solid rgba(255,255,255,0.1);background:rgba(10,12,18,0.45);overflow:hidden;}
        .pd-audioIdle{padding:18px 20px;display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;}
        .pd-audioIdleLeft{display:flex;align-items:center;gap:14px;}
        .pd-audioIdleIcon{font-size:28px;flex-shrink:0;}
        .pd-audioIdleTitle{font-size:14px;font-weight:900;color:rgba(255,255,255,0.9);}
        .pd-audioIdleSub{font-size:12px;color:rgba(255,255,255,0.5);margin-top:2px;}
        .pd-audioLoading{padding:18px 20px;display:flex;align-items:center;gap:14px;}
        .pd-audioLoadTitle{font-size:13px;font-weight:900;color:rgba(255,255,255,0.85);}
        .pd-audioLoadSub{font-size:11px;color:rgba(255,255,255,0.5);margin-top:2px;}
        /* Player */
        .pd-player{padding:16px 20px;display:flex;flex-direction:column;gap:14px;}
        .pd-playerTop{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap;}
        .pd-playerTitle{font-size:14px;font-weight:900;color:rgba(255,255,255,0.9);}
        .pd-playerSub{font-size:11px;color:rgba(255,255,255,0.5);margin-top:2px;}
        .pd-playerBtns{display:flex;gap:8px;}
        .pd-playerControls{display:flex;align-items:center;gap:12px;}
        .pd-playBtn{width:42px;height:42px;border-radius:999px;background:linear-gradient(135deg,#5aa8ff,#5fe3ff);border:none;display:grid;place-items:center;cursor:pointer;color:rgba(0,0,0,0.9);flex-shrink:0;transition:transform 140ms;}
        .pd-playBtn:hover{transform:scale(1.07);}
        .pd-playerTime{font-size:11px;font-weight:800;color:rgba(255,255,255,0.5);white-space:nowrap;min-width:34px;}
        .pd-seekBar{flex:1;height:4px;-webkit-appearance:none;appearance:none;background:rgba(255,255,255,0.12);border-radius:999px;outline:none;cursor:pointer;accent-color:#5fe3ff;}
        /* Script */
        .pd-scriptLabel{font-size:10px;font-weight:900;letter-spacing:0.1em;text-transform:uppercase;color:rgba(255,255,255,0.4);}
        .pd-scriptBody{display:flex;flex-direction:column;gap:10px;}
        .pd-turn{padding:14px 18px;border-radius:16px;border:1px solid rgba(255,255,255,0.07);background:rgba(255,255,255,0.025);}
        .pd-turn.turn-a{border-color:rgba(90,168,255,0.14);background:rgba(90,168,255,0.045);}
        .pd-turn.turn-b{border-color:rgba(95,227,255,0.11);background:rgba(95,227,255,0.03);}
        .pd-turnSpeaker{font-size:10px;font-weight:900;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:6px;}
        .pd-turnText{font-size:14px;line-height:1.65;color:rgba(255,255,255,0.88);}
        /* Buttons */
        .pd-ctrlBtn{display:inline-flex;align-items:center;justify-content:center;height:38px;padding:0 16px;border-radius:999px;border:1px solid rgba(255,255,255,0.12);background:rgba(255,255,255,0.04);color:rgba(255,255,255,0.85);font-size:12px;font-weight:800;cursor:pointer;transition:all 130ms;white-space:nowrap;text-decoration:none;}
        .pd-ctrlBtn:hover{background:rgba(255,255,255,0.07);border-color:rgba(95,227,255,0.22);transform:translateY(-1px);}
        .pd-ctrlAccent{background:linear-gradient(90deg,rgba(90,168,255,0.9),rgba(95,227,255,0.9));color:rgba(0,0,0,0.85);border-color:transparent;}
        @media(max-width:700px){.pd-root{grid-template-columns:1fr;}.pd-sidebar{display:none;}}
      `}</style>
    </>
  );
}
