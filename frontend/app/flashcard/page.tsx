"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Sidebar from "../../components/Sidebar";
import { useAuth } from "../../lib/auth-context";
import { generateFlashcards, Flashcard } from "../../lib/api";

type ViewState = "landing" | "studying";

export default function FlashcardPage() {
  const { accessToken } = useAuth();
  const router = useRouter();

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionFiles, setSessionFiles] = useState<Array<{ name: string }>>([]);
  const [cards, setCards] = useState<Flashcard[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [view, setView] = useState<ViewState>("landing");
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");
  const [cardCount, setCardCount] = useState(20);

  // Load session from sessionStorage (set by upload page)
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
      const result = await generateFlashcards(sessionId, cardCount, accessToken);
      setCards(result.cards);
      setCurrentIdx(0);
      setFlipped(false);
      setView("studying");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Generation failed.");
    } finally {
      setGenerating(false);
    }
  }, [sessionId, cardCount, accessToken]);

  const prev = () => { setFlipped(false); setCurrentIdx((i) => Math.max(0, i - 1)); };
  const next = () => { setFlipped(false); setCurrentIdx((i) => Math.min(cards.length - 1, i + 1)); };

  const card = cards[currentIdx];

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
                <div className="pu-pageTitle">Flashcards</div>
              </div>
              {view === "studying" && (
                <div className="pu-topMeta">
                  {currentIdx + 1} / {cards.length}
                </div>
              )}
            </div>

            <div className="pu-content">
              {view === "landing" ? (
                <div className="pu-landingShell">
                  {!sessionId ? (
                    <div className="pu-emptyState">
                      <div className="pu-emptyIcon">📚</div>
                      <div className="pu-emptyTitle">No study material yet</div>
                      <div className="pu-emptySub">Upload files first to generate flashcards from your content.</div>
                      <button className="pu-btn pu-btnPrimary" type="button" onClick={() => router.push("/upload")}>
                        Upload Material
                      </button>
                    </div>
                  ) : (
                    <div className="pu-configCard">
                      <div className="pu-configTitle">Ready to generate flashcards</div>
                      <div className="pu-configSub">
                        Based on:{" "}
                        {sessionFiles.length > 0
                          ? sessionFiles.map((f) => f.name).join(", ")
                          : "your uploaded material"}
                      </div>

                      <div className="pu-configRow">
                        <label className="pu-configLabel">Number of cards</label>
                        <div className="pu-countBtns">
                          {[10, 15, 20, 30].map((n) => (
                            <button
                              key={n}
                              className={`pu-countBtn${cardCount === n ? " active" : ""}`}
                              type="button"
                              onClick={() => setCardCount(n)}
                            >
                              {n}
                            </button>
                          ))}
                        </div>
                      </div>

                      {error && <div className="pu-error">{error}</div>}

                      <button
                        className={`pu-btn pu-btnPrimary${generating ? " pu-btnDisabled" : ""}`}
                        disabled={generating}
                        onClick={onGenerate}
                        type="button"
                      >
                        {generating ? "Generating…" : `Generate ${cardCount} flashcards`}
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="pu-studyShell">
                  {/* Progress bar */}
                  <div className="pu-progress">
                    <div className="pu-progressBar" style={{ width: `${((currentIdx + 1) / cards.length) * 100}%` }} />
                  </div>

                  {/* Flashcard */}
                  <div className="pu-cardWrap" onClick={() => setFlipped((f) => !f)}>
                    <div className={`pu-card${flipped ? " flipped" : ""}`}>
                      <div className="pu-cardFace pu-cardFront">
                        <div className="pu-cardLabel">Question</div>
                        <div className="pu-cardText">{card?.front}</div>
                        <div className="pu-cardHint">Click to reveal answer</div>
                      </div>
                      <div className="pu-cardFace pu-cardBack">
                        <div className="pu-cardLabel">Answer</div>
                        <div className="pu-cardText">{card?.back}</div>
                      </div>
                    </div>
                  </div>

                  {/* Controls */}
                  <div className="pu-cardControls">
                    <button
                      className={`pu-btn${currentIdx === 0 ? " pu-btnDisabled" : ""}`}
                      disabled={currentIdx === 0}
                      onClick={prev}
                      type="button"
                    >
                      ← Previous
                    </button>
                    <button className="pu-btn" type="button" onClick={() => { setView("landing"); setCards([]); setCurrentIdx(0); setFlipped(false); }}>
                      Regenerate
                    </button>
                    <button
                      className={`pu-btn pu-btnPrimary${currentIdx === cards.length - 1 ? " pu-btnDisabled" : ""}`}
                      disabled={currentIdx === cards.length - 1}
                      onClick={next}
                      type="button"
                    >
                      Next →
                    </button>
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
          --pu-shadow-soft: 0 10px 26px rgba(0,0,0,0.28);
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
        .pu-topbar { padding: 18px 20px; border-bottom: 1px solid rgba(255,255,255,0.06); display: flex; align-items: center; justify-content: space-between; }
        .pu-eyebrow { font-size: 10px; font-weight: 900; letter-spacing: 0.1em; text-transform: uppercase; color: rgba(255,255,255,0.5); }
        .pu-pageTitle { font-size: 20px; font-weight: 950; letter-spacing: -0.02em; color: rgba(255,255,255,0.94); margin-top: 4px; }
        .pu-topMeta { font-size: 13px; font-weight: 900; color: rgba(255,255,255,0.6); }
        .pu-content { flex: 1; min-height: 0; overflow-y: auto; padding: 20px; display: flex; align-items: flex-start; justify-content: center; }
        .pu-landingShell { width: 100%; max-width: 520px; }
        .pu-emptyState { text-align: center; padding: 48px 24px; }
        .pu-emptyIcon { font-size: 40px; margin-bottom: 16px; }
        .pu-emptyTitle { font-size: 18px; font-weight: 950; color: rgba(255,255,255,0.9); margin-bottom: 8px; }
        .pu-emptySub { font-size: 13px; color: rgba(255,255,255,0.6); line-height: 1.6; margin-bottom: 20px; }
        .pu-configCard { padding: 28px; border-radius: var(--pu-radius-lg); border: 1px solid rgba(255,255,255,0.1); background: rgba(10,12,18,0.3); display: flex; flex-direction: column; gap: 18px; }
        .pu-configTitle { font-size: 18px; font-weight: 950; color: rgba(255,255,255,0.94); }
        .pu-configSub { font-size: 13px; color: rgba(255,255,255,0.6); line-height: 1.5; }
        .pu-configRow { display: flex; flex-direction: column; gap: 8px; }
        .pu-configLabel { font-size: 11px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.08em; color: rgba(255,255,255,0.55); }
        .pu-countBtns { display: flex; gap: 8px; }
        .pu-countBtn { height: 36px; padding: 0 18px; border-radius: 999px; border: 1px solid rgba(255,255,255,0.12); background: rgba(255,255,255,0.04); color: rgba(255,255,255,0.85); font-size: 13px; font-weight: 900; cursor: pointer; transition: background 140ms, border-color 140ms; }
        .pu-countBtn.active { background: rgba(95,227,255,0.12); border-color: rgba(95,227,255,0.35); color: #5fe3ff; }
        .pu-error { font-size: 13px; color: #ff6b6b; padding: 12px 16px; border-radius: 14px; border: 1px solid rgba(255,107,107,0.2); background: rgba(255,107,107,0.06); }
        .pu-studyShell { width: 100%; max-width: 600px; display: flex; flex-direction: column; gap: 20px; align-items: center; }
        .pu-progress { width: 100%; height: 3px; border-radius: 999px; background: rgba(255,255,255,0.08); overflow: hidden; }
        .pu-progressBar { height: 100%; border-radius: 999px; background: linear-gradient(90deg, #5aa8ff, #5fe3ff); transition: width 300ms ease; }
        .pu-cardWrap { width: 100%; perspective: 1200px; cursor: pointer; user-select: none; }
        .pu-card { position: relative; width: 100%; min-height: 240px; transform-style: preserve-3d; transition: transform 500ms cubic-bezier(0.4,0,0.2,1); border-radius: var(--pu-radius-lg); }
        .pu-card.flipped { transform: rotateY(180deg); }
        .pu-cardFace { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 32px 28px; border-radius: var(--pu-radius-lg); border: 1px solid rgba(255,255,255,0.1); backface-visibility: hidden; -webkit-backface-visibility: hidden; gap: 12px; }
        .pu-cardFront { background: rgba(10,12,18,0.5); -webkit-backdrop-filter: blur(16px); backdrop-filter: blur(16px); }
        .pu-cardBack { background: linear-gradient(135deg, rgba(90,168,255,0.12), rgba(95,227,255,0.12)); -webkit-backdrop-filter: blur(16px); backdrop-filter: blur(16px); border-color: rgba(95,227,255,0.2); transform: rotateY(180deg); }
        .pu-cardLabel { font-size: 10px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.1em; color: rgba(255,255,255,0.45); }
        .pu-cardText { font-size: 20px; font-weight: 950; text-align: center; color: rgba(255,255,255,0.94); line-height: 1.35; letter-spacing: -0.01em; }
        .pu-cardHint { font-size: 11px; color: rgba(255,255,255,0.38); }
        .pu-cardControls { display: flex; gap: 12px; align-items: center; }
        .pu-btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; height: 40px; padding: 0 18px; border-radius: 999px; border: 1px solid rgba(255,255,255,0.12); background: rgba(255,255,255,0.04); color: rgba(255,255,255,0.92); font-size: 12px; font-weight: 900; cursor: pointer; transition: transform 160ms ease, background 160ms ease; white-space: nowrap; }
        .pu-btn:hover { transform: translateY(-1px); background: rgba(255,255,255,0.06); border-color: rgba(95,227,255,0.22); }
        .pu-btnPrimary { background: linear-gradient(90deg, rgba(90,168,255,0.95), rgba(95,227,255,0.95)); color: rgba(0,0,0,0.9); border-color: transparent; }
        .pu-btnDisabled { opacity: 0.4; cursor: not-allowed; transform: none !important; }
        @media (max-width: 720px) { .pu-shell { grid-template-columns: 1fr; } }
      `}</style>
    </>
  );
}
