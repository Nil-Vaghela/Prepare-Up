"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import AnimatedBackground from "../../components/AnimatedBackground";
import { useAuth } from "../../lib/auth-context";

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";

type Thread = { id: string; title: string | null; updated_at: string; source_session_id: string | null; source_files: Array<{ name: string }> };
type Turn = { speaker: string; text: string };
type ViewState = "select" | "generating" | "listening";
type AudioState = "idle" | "loading" | "ready" | "error";

const FEATURES: Array<{ href: string; label: string; icon: React.ReactNode }> = [
  { href: "/flashcard",     label: "Flash Cards",    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="18" height="18"><rect x="5" y="7" width="11" height="8" rx="2"/><path d="M9 5h10v8"/><path d="M8.5 10.5h4"/></svg> },
  { href: "/podcast",       label: "Podcast",        icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="18" height="18"><path d="M4 13a8 8 0 0 1 16 0"/><rect x="4" y="13" width="3.5" height="6" rx="1.5"/><rect x="16.5" y="13" width="3.5" height="6" rx="1.5"/><path d="M7.5 19a4.5 4.5 0 0 0 9 0"/></svg> },
  { href: "/mockquiz",      label: "Mock Test",      icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="18" height="18"><circle cx="12" cy="12" r="9"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg> },
  { href: "/studyguide",    label: "Study Guide",    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="18" height="18"><path d="M5.5 6.5A2.5 2.5 0 0 1 8 4h10.5v15H8a2.5 2.5 0 0 0-2.5 2.5"/><path d="M5.5 6.5V20"/><path d="M9.5 8h6"/><path d="M9.5 11h6"/></svg> },
  { href: "/voice-learning", label: "Voice Learning", icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="18" height="18"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg> },
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

  // Refinement
  const [refineText, setRefineText] = useState("");
  const [refining, setRefining] = useState(false);
  const [refineError, setRefineError] = useState("");

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

  const onRefineScript = useCallback(async () => {
    if (!refineText.trim() || !selected) return;
    setRefining(true);
    setRefineError("");
    const sid = selected.source_session_id;
    if (!sid) { setRefineError("No session attached to this chat."); setRefining(false); return; }
    try {
      const res = await fetch(`${BACKEND}/api/generate`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({
          session_id: sid,
          output_type: "podcast",
          refinement_instructions: refineText.trim(),
          previous_script: script,
        }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.detail || "Refinement failed"); }
      const data = await res.json();
      const turns: Turn[] = Array.isArray(data.script)
        ? data.script
        : Array.isArray(data.podcast_script)
          ? data.podcast_script
          : [];
      if (!turns.length) throw new Error("No script returned from refinement.");
      if (data.speakers?.length >= 2) setSpeakers([data.speakers[0], data.speakers[1]]);
      setScript(turns);
      setRefineText("");
      // Reset audio since script changed
      if (audioUrl) { URL.revokeObjectURL(audioUrl); setAudioUrl(null); }
      setAudioState("idle");
    } catch (e: unknown) {
      setRefineError(e instanceof Error ? e.message : "Refinement failed.");
    } finally {
      setRefining(false);
    }
  }, [refineText, selected, script, accessToken, audioUrl]);

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
          <div className="pd-brandRow">
            <div className="pd-brand" onClick={() => router.push("/dashboard")} style={{ cursor: "pointer" }}>PrepareUp</div>
            <button className="pd-homeBtn" onClick={() => router.push("/dashboard")} title="Home">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="15" height="15"><path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.5z"/><path d="M9 21V12h6v9"/></svg>
            </button>
          </div>
          <div className="pd-sectionLabel">MAIN</div>
          <nav className="pu-sideNav">
            {FEATURES.map(f => (
              <div key={f.href} className={`pu-sideItem${f.href === "/podcast" ? " active" : ""}`} onClick={() => router.push(f.href)}>
                <span className="pu-sideIcon">{f.icon}</span>
                <div className="pu-sideLabel">{f.label}</div>
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
                <div className="pd-headerActions" />
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

              {/* Refinement panel */}
              <div className="pd-refinePanel">
                <div className="pd-refineLabel">REFINE THIS PODCAST</div>
                <div className="pd-refineSub">Describe changes to the script — tone, focus, length, or specific topics to emphasize.</div>
                {refineError && <div className="pd-error" style={{ marginBottom: 0 }}>{refineError}</div>}
                <div className="pd-refineRow">
                  <textarea
                    className="pd-refineInput"
                    placeholder="e.g. Make it shorter and more conversational. Add more examples about the second topic."
                    value={refineText}
                    onChange={e => setRefineText(e.target.value)}
                    rows={3}
                    disabled={refining}
                  />
                  <button
                    className="pd-ctrlBtn pd-ctrlAccent"
                    onClick={onRefineScript}
                    disabled={refining || !refineText.trim()}
                  >
                    {refining ? (
                      <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span className="pd-spinnerSm" /> Refining…
                      </span>
                    ) : "↺ Regenerate"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      <style jsx>{`
        :global(body){margin:0;background:#07070b;}
        .pd-root{position:relative;z-index:1;display:grid;grid-template-columns:340px 1fr;gap:12px;height:100vh;padding:12px;box-sizing:border-box;font-family:ui-sans-serif,system-ui,-apple-system,sans-serif;color:rgba(255,255,255,0.92);-webkit-font-smoothing:antialiased;}
        .pd-glass{border-radius:20px;border:1px solid rgba(255,255,255,0.1);background:rgba(10,12,18,0.5);backdrop-filter:blur(18px) saturate(140%);-webkit-backdrop-filter:blur(18px) saturate(140%);box-shadow:0 20px 60px rgba(0,0,0,0.5);}
        .pd-sidebar{padding:16px;display:flex;flex-direction:column;min-height:0;overflow:hidden;}
        .pd-main{overflow-y:auto;padding:0;}
        .pd-brandRow{display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;}
        .pd-brand{font-size:15px;font-weight:950;letter-spacing:-0.02em;background:linear-gradient(90deg,#5aa8ff,#5fe3ff);-webkit-background-clip:text;background-clip:text;color:transparent;}
        .pd-homeBtn{width:28px;height:28px;border-radius:9px;border:1px solid rgba(255,255,255,0.1);background:rgba(255,255,255,0.04);color:rgba(255,255,255,0.6);display:grid;place-items:center;cursor:pointer;transition:all 130ms;flex-shrink:0;}
        .pd-homeBtn:hover{background:rgba(95,227,255,0.1);border-color:rgba(95,227,255,0.3);color:#5fe3ff;}
        .pd-sectionLabel{font-size:10px;font-weight:900;letter-spacing:0.1em;text-transform:uppercase;color:rgba(255,255,255,0.4);margin-bottom:6px;}
        .pu-sideNav{margin-top:8px;display:flex;flex-direction:column;gap:6px;}
        .pu-sideItem{display:flex;align-items:center;gap:12px;padding:10px 12px;border-radius:14px;border:1px solid rgba(255,255,255,0.08);background:rgba(10,12,18,0.2);cursor:pointer;user-select:none;text-decoration:none;color:rgba(255,255,255,0.88);transition:transform 140ms ease,background 140ms ease,border-color 140ms ease;position:relative;overflow:hidden;}
        .pu-sideItem:hover{background:rgba(255,255,255,0.04);border-color:rgba(95,227,255,0.18);transform:translateY(-1px);}
        .pu-sideItem.active{border-color:rgba(95,227,255,0.26);background:rgba(255,255,255,0.05);}
        .pu-sideItem.active::before{content:"";position:absolute;left:10px;top:10px;bottom:10px;width:3px;border-radius:999px;background:linear-gradient(180deg,#5fe3ff,#5aa8ff);}
        .pu-sideIcon{width:18px;height:18px;display:grid;place-items:center;color:rgba(255,255,255,0.72);flex-shrink:0;}
        .pu-sideLabel{font-size:12px;font-weight:900;color:rgba(255,255,255,0.88);}
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
        .pd-ctrlBtn:hover:not(:disabled){background:rgba(255,255,255,0.07);border-color:rgba(95,227,255,0.22);transform:translateY(-1px);}
        .pd-ctrlBtn:disabled{opacity:0.4;cursor:default;}
        .pd-ctrlAccent{background:linear-gradient(90deg,rgba(90,168,255,0.9),rgba(95,227,255,0.9));color:rgba(0,0,0,0.85);border-color:transparent;}
        /* Refinement panel */
        .pd-refinePanel{border-radius:16px;border:1px solid rgba(255,255,255,0.08);background:rgba(255,255,255,0.02);padding:18px;display:flex;flex-direction:column;gap:12px;}
        .pd-refineLabel{font-size:10px;font-weight:900;letter-spacing:0.1em;text-transform:uppercase;color:#5aa8ff;}
        .pd-refineSub{font-size:12px;color:rgba(255,255,255,0.5);line-height:1.5;}
        .pd-refineRow{display:flex;gap:10px;align-items:flex-start;}
        .pd-refineInput{flex:1;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.1);border-radius:12px;padding:10px 14px;font-size:13px;color:rgba(255,255,255,0.88);outline:none;resize:vertical;font-family:inherit;line-height:1.5;min-height:70px;}
        .pd-refineInput::placeholder{color:rgba(255,255,255,0.3);}
        .pd-refineInput:focus{border-color:rgba(95,227,255,0.3);}
        .pd-refineInput:disabled{opacity:0.5;}
        .pd-spinnerSm{display:inline-block;width:14px;height:14px;border-radius:50%;border:2px solid rgba(0,0,0,0.2);border-top-color:rgba(0,0,0,0.7);animation:spin 0.7s linear infinite;}
        @keyframes spin{to{transform:rotate(360deg)}}
        @media(max-width:900px){.pd-root{grid-template-columns:1fr;}.pd-sidebar{display:none;}}
      `}</style>
    </>
  );
}
