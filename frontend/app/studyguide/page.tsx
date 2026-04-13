"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Sidebar from "../../components/Sidebar";
import { useAuth } from "../../lib/auth-context";
import { generateStudyGuide } from "../../lib/api";

export default function StudyGuidePage() {
  const { accessToken } = useAuth();
  const router = useRouter();

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionFiles, setSessionFiles] = useState<Array<{ name: string }>>([]);
  const [guideText, setGuideText] = useState("");
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const sid = sessionStorage.getItem("pu_session_id");
    const files = sessionStorage.getItem("pu_session_files");
    if (sid) setSessionId(sid);
    if (files) {
      try { setSessionFiles(JSON.parse(files)); } catch { /* */ }
    }
  }, []);

  const onGenerate = useCallback(async () => {
    if (!sessionId) return;
    setGenerating(true);
    setError("");
    try {
      const result = await generateStudyGuide(sessionId, accessToken);
      setGuideText(result.text);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Generation failed.");
    } finally {
      setGenerating(false);
    }
  }, [sessionId, accessToken]);

  // Render markdown-ish plain text: convert ## headings, bullet lists
  const renderGuideText = (text: string) => {
    const lines = text.split("\n");
    return lines.map((line, i) => {
      if (line.startsWith("## ")) {
        return <div key={i} className="pu-guideH2">{line.slice(3)}</div>;
      }
      if (line.startsWith("# ")) {
        return <div key={i} className="pu-guideH1">{line.slice(2)}</div>;
      }
      if (line.startsWith("- ") || line.startsWith("* ")) {
        return <div key={i} className="pu-guideBullet">• {line.slice(2)}</div>;
      }
      if (line.trim() === "") {
        return <div key={i} className="pu-guideSpacer" />;
      }
      return <div key={i} className="pu-guidePara">{line}</div>;
    });
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
                <div className="pu-pageTitle">Study Guide</div>
              </div>
              {guideText && (
                <div className="pu-topActions">
                  <button className="pu-btn" type="button" onClick={onGenerate} disabled={generating}>
                    {generating ? "Regenerating…" : "Regenerate"}
                  </button>
                  <button
                    className="pu-btn"
                    type="button"
                    onClick={() => {
                      const blob = new Blob([guideText], { type: "text/plain" });
                      const a = document.createElement("a");
                      a.href = URL.createObjectURL(blob);
                      a.download = "study-guide.txt";
                      a.click();
                    }}
                  >
                    Download
                  </button>
                </div>
              )}
            </div>

            <div className="pu-content">
              {!sessionId ? (
                <div className="pu-emptyState">
                  <div className="pu-emptyIcon">📖</div>
                  <div className="pu-emptyTitle">No study material yet</div>
                  <div className="pu-emptySub">Upload files first to generate a study guide.</div>
                  <button className="pu-btn pu-btnPrimary" type="button" onClick={() => router.push("/upload")}>
                    Upload Material
                  </button>
                </div>
              ) : !guideText ? (
                <div className="pu-landingShell">
                  <div className="pu-configCard">
                    <div className="pu-configTitle">Generate a study guide</div>
                    <div className="pu-configSub">
                      Source:{" "}
                      {sessionFiles.length > 0
                        ? sessionFiles.map((f) => f.name).join(", ")
                        : "uploaded material"}
                    </div>
                    <div className="pu-configDesc">
                      Creates a structured guide with headings, key concepts, bullet points, and a summary. Grounded exclusively in your uploaded content.
                    </div>
                    {error && <div className="pu-error">{error}</div>}
                    <button
                      className={`pu-btn pu-btnPrimary${generating ? " pu-btnDisabled" : ""}`}
                      disabled={generating}
                      onClick={onGenerate}
                      type="button"
                    >
                      {generating ? "Generating study guide…" : "Generate Study Guide"}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="pu-guideShell">
                  {error && <div className="pu-error">{error}</div>}
                  <div className="pu-guideBody">
                    {renderGuideText(guideText)}
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
        .pu-topActions { display: flex; gap: 10px; }
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
        .pu-guideShell { max-width: 720px; }
        .pu-guideBody { display: flex; flex-direction: column; gap: 6px; }
        .pu-guideH1 { font-size: 20px; font-weight: 950; color: rgba(255,255,255,0.95); margin-top: 20px; margin-bottom: 4px; letter-spacing: -0.02em; }
        .pu-guideH2 { font-size: 16px; font-weight: 900; color: #5fe3ff; margin-top: 16px; margin-bottom: 2px; }
        .pu-guidePara { font-size: 14px; line-height: 1.7; color: rgba(255,255,255,0.82); }
        .pu-guideBullet { font-size: 13px; line-height: 1.6; color: rgba(255,255,255,0.8); padding-left: 12px; }
        .pu-guideSpacer { height: 8px; }
        .pu-btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; height: 40px; padding: 0 18px; border-radius: 999px; border: 1px solid rgba(255,255,255,0.12); background: rgba(255,255,255,0.04); color: rgba(255,255,255,0.92); font-size: 12px; font-weight: 900; cursor: pointer; transition: transform 160ms ease, background 160ms ease; white-space: nowrap; }
        .pu-btn:hover { transform: translateY(-1px); background: rgba(255,255,255,0.06); border-color: rgba(95,227,255,0.22); }
        .pu-btnPrimary { background: linear-gradient(90deg, rgba(90,168,255,0.95), rgba(95,227,255,0.95)); color: rgba(0,0,0,0.9); border-color: transparent; }
        .pu-btnDisabled { opacity: 0.4; cursor: not-allowed; transform: none !important; }
        @media (max-width: 720px) { .pu-shell { grid-template-columns: 1fr; } }
      `}</style>
    </>
  );
}
