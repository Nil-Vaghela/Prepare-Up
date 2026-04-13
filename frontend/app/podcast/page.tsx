"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Sidebar from "../../components/Sidebar";
import { useAuth } from "../../lib/auth-context";
import { generatePodcast, generatePodcastAudio, PodcastScriptTurn } from "../../lib/api";

type AudioState = "idle" | "loading" | "ready" | "error";

export default function PodcastPage() {
  const { accessToken } = useAuth();
  const router = useRouter();

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionFiles, setSessionFiles] = useState<Array<{ name: string }>>([]);

  // Script state
  const [speakers, setSpeakers] = useState<[string, string]>(["Host", "Guest"]);
  const [script, setScript] = useState<PodcastScriptTurn[]>([]);
  const [generating, setGenerating] = useState(false);
  const [scriptError, setScriptError] = useState("");

  // Audio state
  const [audioState, setAudioState] = useState<AudioState>("idle");
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioError, setAudioError] = useState("");
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    const sid = sessionStorage.getItem("pu_session_id");
    const files = sessionStorage.getItem("pu_session_files");
    if (sid) setSessionId(sid);
    if (files) {
      try { setSessionFiles(JSON.parse(files)); } catch { /* */ }
    }
  }, []);

  // Cleanup audio URL on unmount
  useEffect(() => {
    return () => {
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
  }, [audioUrl]);

  const onGenerateScript = useCallback(async () => {
    if (!sessionId) return;
    setGenerating(true);
    setScriptError("");
    setScript([]);
    setAudioState("idle");
    if (audioUrl) { URL.revokeObjectURL(audioUrl); setAudioUrl(null); }
    try {
      const result = await generatePodcast(sessionId, accessToken);
      setScript(result.script);
      if (result.speakers?.length >= 2) {
        setSpeakers([result.speakers[0], result.speakers[1]]);
      }
    } catch (e: unknown) {
      setScriptError(e instanceof Error ? e.message : "Script generation failed.");
    } finally {
      setGenerating(false);
    }
  }, [sessionId, accessToken, audioUrl]);

  const onGenerateAudio = useCallback(async () => {
    if (!script.length) return;
    setAudioState("loading");
    setAudioError("");
    if (audioUrl) { URL.revokeObjectURL(audioUrl); setAudioUrl(null); }
    try {
      const blob = await generatePodcastAudio(speakers, script, accessToken);
      const url = URL.createObjectURL(blob);
      setAudioUrl(url);
      setAudioState("ready");
    } catch (e: unknown) {
      setAudioError(e instanceof Error ? e.message : "Audio generation failed.");
      setAudioState("error");
    }
  }, [script, speakers, accessToken, audioUrl]);

  // Audio controls
  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) { audio.pause(); } else { audio.play(); }
  };

  const onTimeUpdate = () => {
    const audio = audioRef.current;
    if (audio) setCurrentTime(audio.currentTime);
  };

  const onLoadedMetadata = () => {
    const audio = audioRef.current;
    if (audio) setDuration(audio.duration);
  };

  const onSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const audio = audioRef.current;
    if (!audio) return;
    const t = parseFloat(e.target.value);
    audio.currentTime = t;
    setCurrentTime(t);
  };

  const formatTime = (s: number) => {
    if (!isFinite(s)) return "0:00";
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  const speakerColor = (sp: string) => {
    return sp === speakers[0]
      ? "rgba(90,168,255,0.9)"
      : "rgba(95,227,255,0.9)";
  };

  return (
    <>
      <div className="pu-bg" />
      <div className="pu-vignette" />
      <div className="pu-root">
        <div className="pu-shell">
          <Sidebar />

          <main className="pu-glass pu-main">
            <div className="pu-topbar">
              <div>
                <div className="pu-eyebrow">Generate</div>
                <div className="pu-pageTitle">Podcast</div>
              </div>
              {script.length > 0 && (
                <div className="pu-topActions">
                  <span className="pu-metaChip">{script.length} turns</span>
                  <button className="pu-btn" type="button" onClick={onGenerateScript} disabled={generating}>
                    Regenerate script
                  </button>
                </div>
              )}
            </div>

            <div className="pu-content">
              {!sessionId ? (
                <div className="pu-emptyState">
                  <div className="pu-emptyIcon">🎙️</div>
                  <div className="pu-emptyTitle">No study material yet</div>
                  <div className="pu-emptySub">Upload files first to generate a podcast from your content.</div>
                  <button className="pu-btn pu-btnPrimary" type="button" onClick={() => router.push("/upload")}>
                    Upload Material
                  </button>
                </div>
              ) : script.length === 0 ? (
                /* Landing: no script yet */
                <div className="pu-landingShell">
                  <div className="pu-configCard">
                    <div className="pu-configTitle">Generate a podcast script</div>
                    <div className="pu-configSub">
                      Source:{" "}
                      {sessionFiles.length > 0
                        ? sessionFiles.map((f) => f.name).join(", ")
                        : "uploaded material"}
                    </div>
                    <div className="pu-configDesc">
                      Creates a two-speaker conversational podcast covering your material. After the script is ready, you can convert it to MP3 audio.
                    </div>
                    {scriptError && <div className="pu-error">{scriptError}</div>}
                    <button
                      className={`pu-btn pu-btnPrimary${generating ? " pu-btnDisabled" : ""}`}
                      disabled={generating}
                      onClick={onGenerateScript}
                      type="button"
                    >
                      {generating ? "Writing script…" : "Generate Podcast Script"}
                    </button>
                  </div>
                </div>
              ) : (
                /* Script ready */
                <div className="pu-podcastShell">
                  {/* Audio player */}
                  <div className="pu-audioCard">
                    {audioState === "idle" && (
                      <div className="pu-audioIdle">
                        <div className="pu-audioIdleText">Script ready — convert to audio</div>
                        <button
                          className="pu-btn pu-btnPrimary"
                          type="button"
                          onClick={onGenerateAudio}
                        >
                          🎧 Generate Audio
                        </button>
                      </div>
                    )}

                    {audioState === "loading" && (
                      <div className="pu-audioLoading">
                        <div className="pu-spinner" />
                        <div className="pu-audioLoadingText">Synthesizing audio… this takes ~30–60s</div>
                      </div>
                    )}

                    {audioState === "error" && (
                      <div className="pu-audioIdle">
                        <div className="pu-error">{audioError}</div>
                        <button className="pu-btn" type="button" onClick={onGenerateAudio}>Retry</button>
                      </div>
                    )}

                    {audioState === "ready" && audioUrl && (
                      <div className="pu-player">
                        <audio
                          ref={audioRef}
                          src={audioUrl}
                          onTimeUpdate={onTimeUpdate}
                          onLoadedMetadata={onLoadedMetadata}
                          onPlay={() => setPlaying(true)}
                          onPause={() => setPlaying(false)}
                          onEnded={() => setPlaying(false)}
                          preload="metadata"
                        />
                        <div className="pu-playerTop">
                          <div className="pu-playerInfo">
                            <div className="pu-playerTitle">Podcast</div>
                            <div className="pu-playerSub">
                              {speakers[0]} & {speakers[1]}
                            </div>
                          </div>
                          <div className="pu-playerActions">
                            <a
                              href={audioUrl}
                              download="podcast.mp3"
                              className="pu-btn"
                              style={{ textDecoration: "none" }}
                            >
                              ↓ Download
                            </a>
                            <button className="pu-btn" type="button" onClick={onGenerateAudio}>
                              Regenerate
                            </button>
                          </div>
                        </div>
                        <div className="pu-playerControls">
                          <button className="pu-playBtn" type="button" onClick={togglePlay}>
                            {playing ? (
                              <svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22">
                                <rect x="6" y="4" width="4" height="16" rx="1" />
                                <rect x="14" y="4" width="4" height="16" rx="1" />
                              </svg>
                            ) : (
                              <svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22">
                                <path d="M8 5.14v14l11-7-11-7z" />
                              </svg>
                            )}
                          </button>
                          <span className="pu-playerTime">{formatTime(currentTime)}</span>
                          <input
                            type="range"
                            min={0}
                            max={duration || 100}
                            value={currentTime}
                            onChange={onSeek}
                            className="pu-seekBar"
                            step={0.1}
                          />
                          <span className="pu-playerTime">{formatTime(duration)}</span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Script transcript */}
                  <div className="pu-scriptHeader">
                    <div className="pu-scriptTitle">Script</div>
                    <div className="pu-speakerLegend">
                      {speakers.map((sp) => (
                        <span key={sp} className="pu-speakerChip" style={{ borderColor: speakerColor(sp), color: speakerColor(sp) }}>
                          {sp}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="pu-scriptBody">
                    {script.map((turn, i) => (
                      <div key={i} className={`pu-turn${turn.speaker === speakers[0] ? " turn-0" : " turn-1"}`}>
                        <div className="pu-turnSpeaker" style={{ color: speakerColor(turn.speaker) }}>
                          {turn.speaker}
                        </div>
                        <div className="pu-turnText">{turn.text}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </main>
        </div>
      </div>

      <style jsx>{`
        :global(body) { margin: 0; }
        :global(:root) {
          --pu-bg: #07070b;
          --pu-text: rgba(255,255,255,0.92);
          --pu-accent-1: #5aa8ff;
          --pu-accent-2: #5fe3ff;
          --pu-radius-lg: 22px;
          --pu-border: rgba(255,255,255,0.1);
          --pu-shadow: 0 18px 60px rgba(0,0,0,0.46);
          --pu-font-sans: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        }
        .pu-bg { position: fixed; inset: 0; z-index: 0; background: var(--pu-bg); }
        .pu-vignette { position: fixed; inset: 0; z-index: 1; pointer-events: none; background: radial-gradient(80% 70% at 50% 35%, rgba(90,168,255,0), rgba(0,0,0,0.55)); }
        .pu-root { position: relative; height: 100vh; padding: 14px; overflow: hidden; color: var(--pu-text); font-family: var(--pu-font-sans); -webkit-font-smoothing: antialiased; }
        .pu-shell { position: relative; z-index: 2; height: 100%; display: grid; grid-template-columns: 240px 1fr; gap: 14px; }
        .pu-glass { position: relative; border-radius: var(--pu-radius-lg); border: 1px solid var(--pu-border); background: rgba(10,12,18,0.36); -webkit-backdrop-filter: blur(14px) saturate(140%); backdrop-filter: blur(14px) saturate(140%); box-shadow: var(--pu-shadow); overflow: hidden; }
        .pu-glass::before { content: ""; position: absolute; inset: 0; pointer-events: none; z-index: 1; background: radial-gradient(60% 40% at 28% 10%, rgba(255,255,255,0.1), transparent 60%); opacity: 0.22; }
        .pu-glass > * { position: relative; z-index: 2; }
        .pu-main { display: flex; flex-direction: column; overflow: hidden; }
        .pu-topbar { padding: 18px 20px; border-bottom: 1px solid rgba(255,255,255,0.06); display: flex; align-items: center; justify-content: space-between; gap: 12px; }
        .pu-eyebrow { font-size: 10px; font-weight: 900; letter-spacing: 0.1em; text-transform: uppercase; color: rgba(255,255,255,0.5); }
        .pu-pageTitle { font-size: 20px; font-weight: 950; letter-spacing: -0.02em; color: rgba(255,255,255,0.94); margin-top: 4px; }
        .pu-topActions { display: flex; align-items: center; gap: 10px; }
        .pu-metaChip { height: 28px; padding: 0 12px; border-radius: 999px; border: 1px solid rgba(255,255,255,0.1); background: rgba(255,255,255,0.04); font-size: 11px; font-weight: 900; color: rgba(255,255,255,0.7); display: inline-flex; align-items: center; }
        .pu-content { flex: 1; min-height: 0; overflow-y: auto; padding: 20px; }
        .pu-landingShell { max-width: 520px; }
        .pu-emptyState { text-align: center; padding: 48px 24px; }
        .pu-emptyIcon { font-size: 40px; margin-bottom: 16px; }
        .pu-emptyTitle { font-size: 18px; font-weight: 950; color: rgba(255,255,255,0.9); margin-bottom: 8px; }
        .pu-emptySub { font-size: 13px; color: rgba(255,255,255,0.6); line-height: 1.6; margin-bottom: 20px; }
        .pu-configCard { padding: 28px; border-radius: var(--pu-radius-lg); border: 1px solid rgba(255,255,255,0.1); background: rgba(10,12,18,0.3); display: flex; flex-direction: column; gap: 16px; }
        .pu-configTitle { font-size: 18px; font-weight: 950; color: rgba(255,255,255,0.94); }
        .pu-configSub { font-size: 13px; color: rgba(255,255,255,0.6); }
        .pu-configDesc { font-size: 13px; color: rgba(255,255,255,0.65); line-height: 1.6; }
        .pu-error { font-size: 13px; color: #ff6b6b; padding: 12px 16px; border-radius: 14px; border: 1px solid rgba(255,107,107,0.2); background: rgba(255,107,107,0.06); }
        .pu-podcastShell { display: flex; flex-direction: column; gap: 20px; max-width: 680px; }
        /* Audio card */
        .pu-audioCard { border-radius: 18px; border: 1px solid rgba(255,255,255,0.1); background: rgba(10,12,18,0.4); -webkit-backdrop-filter: blur(14px); backdrop-filter: blur(14px); overflow: hidden; }
        .pu-audioIdle { padding: 20px; display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
        .pu-audioIdleText { font-size: 13px; color: rgba(255,255,255,0.72); font-weight: 700; }
        .pu-audioLoading { padding: 20px; display: flex; align-items: center; gap: 14px; }
        .pu-spinner { width: 22px; height: 22px; border: 2px solid rgba(255,255,255,0.1); border-top-color: #5fe3ff; border-radius: 999px; animation: spin 0.8s linear infinite; flex-shrink: 0; }
        @keyframes spin { to { transform: rotate(360deg); } }
        .pu-audioLoadingText { font-size: 13px; color: rgba(255,255,255,0.7); }
        .pu-player { padding: 16px 20px; display: flex; flex-direction: column; gap: 12px; }
        .pu-playerTop { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
        .pu-playerInfo {}
        .pu-playerTitle { font-size: 15px; font-weight: 900; color: rgba(255,255,255,0.92); }
        .pu-playerSub { font-size: 12px; color: rgba(255,255,255,0.55); margin-top: 2px; }
        .pu-playerActions { display: flex; gap: 8px; }
        .pu-playerControls { display: flex; align-items: center; gap: 12px; }
        .pu-playBtn { width: 42px; height: 42px; border-radius: 999px; background: linear-gradient(135deg, #5aa8ff, #5fe3ff); border: none; display: grid; place-items: center; cursor: pointer; color: rgba(0,0,0,0.9); flex-shrink: 0; transition: transform 140ms; }
        .pu-playBtn:hover { transform: scale(1.06); }
        .pu-playerTime { font-size: 11px; font-weight: 900; color: rgba(255,255,255,0.55); white-space: nowrap; min-width: 34px; }
        .pu-seekBar { flex: 1; height: 4px; -webkit-appearance: none; appearance: none; background: rgba(255,255,255,0.12); border-radius: 999px; outline: none; cursor: pointer; accent-color: #5fe3ff; }
        /* Script */
        .pu-scriptHeader { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
        .pu-scriptTitle { font-size: 13px; font-weight: 900; letter-spacing: 0.05em; text-transform: uppercase; color: rgba(255,255,255,0.5); }
        .pu-speakerLegend { display: flex; gap: 8px; }
        .pu-speakerChip { height: 26px; padding: 0 12px; border-radius: 999px; border: 1px solid; font-size: 11px; font-weight: 900; display: inline-flex; align-items: center; }
        .pu-scriptBody { display: flex; flex-direction: column; gap: 12px; }
        .pu-turn { padding: 14px 16px; border-radius: 16px; border: 1px solid rgba(255,255,255,0.07); background: rgba(255,255,255,0.03); }
        .pu-turn.turn-0 { border-color: rgba(90,168,255,0.12); background: rgba(90,168,255,0.04); }
        .pu-turn.turn-1 { border-color: rgba(95,227,255,0.1); background: rgba(95,227,255,0.03); }
        .pu-turnSpeaker { font-size: 10px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 6px; }
        .pu-turnText { font-size: 14px; line-height: 1.65; color: rgba(255,255,255,0.88); }
        .pu-btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; height: 40px; padding: 0 18px; border-radius: 999px; border: 1px solid rgba(255,255,255,0.12); background: rgba(255,255,255,0.04); color: rgba(255,255,255,0.92); font-size: 12px; font-weight: 900; cursor: pointer; transition: transform 160ms ease, background 160ms ease; white-space: nowrap; }
        .pu-btn:hover { transform: translateY(-1px); background: rgba(255,255,255,0.06); border-color: rgba(95,227,255,0.22); }
        .pu-btnPrimary { background: linear-gradient(90deg, rgba(90,168,255,0.95), rgba(95,227,255,0.95)); color: rgba(0,0,0,0.9); border-color: transparent; }
        .pu-btnDisabled { opacity: 0.4; cursor: not-allowed; transform: none !important; }
        @media (max-width: 720px) { .pu-shell { grid-template-columns: 1fr; } }
      `}</style>
    </>
  );
}
