"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Sidebar from "../../components/Sidebar";
import { useAuth } from "../../lib/auth-context";

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";

type Question = {
  prompt: string;
  options: string[];
  answer: number;
  explanation: string;
};

type QuizState = "landing" | "quizzing" | "done";

export default function MockQuizPage() {
  const { accessToken } = useAuth();
  const router = useRouter();

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionFiles, setSessionFiles] = useState<Array<{ name: string }>>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");
  const [count, setCount] = useState(10);
  const [quizState, setQuizState] = useState<QuizState>("landing");

  // Quiz progress
  const [currentIdx, setCurrentIdx] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [answered, setAnswered] = useState<number[]>([]); // selected index per question
  const [score, setScore] = useState(0);

  useEffect(() => {
    const sid = sessionStorage.getItem("pu_session_id");
    const files = sessionStorage.getItem("pu_session_files");
    if (sid) setSessionId(sid);
    if (files) { try { setSessionFiles(JSON.parse(files)); } catch { /* */ } }
  }, []);

  const onGenerate = useCallback(async () => {
    if (!sessionId) return;
    setGenerating(true);
    setError("");
    try {
      const res = await fetch(`${BACKEND}/api/quiz/generate`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({ session_id: sessionId, count }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setQuestions(data.questions || []);
      setCurrentIdx(0);
      setSelected(null);
      setAnswered([]);
      setScore(0);
      setQuizState("quizzing");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Generation failed.");
    } finally {
      setGenerating(false);
    }
  }, [sessionId, count, accessToken]);

  const onSelectOption = (idx: number) => {
    if (selected !== null) return; // already answered
    setSelected(idx);
    const q = questions[currentIdx];
    if (idx === q.answer) setScore((s) => s + 1);
    setAnswered((prev) => {
      const updated = [...prev];
      updated[currentIdx] = idx;
      return updated;
    });
  };

  const onNext = () => {
    if (currentIdx < questions.length - 1) {
      setCurrentIdx((i) => i + 1);
      setSelected(answered[currentIdx + 1] ?? null);
    } else {
      setQuizState("done");
    }
  };

  const onRestart = () => {
    setCurrentIdx(0);
    setSelected(null);
    setAnswered([]);
    setScore(0);
    setQuizState("quizzing");
  };

  const q = questions[currentIdx];
  const pct = questions.length ? Math.round((score / questions.length) * 100) : 0;

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
                <div className="pu-pageTitle">Mock Quiz</div>
              </div>
              {quizState === "quizzing" && (
                <div className="pu-topMeta">
                  {currentIdx + 1} / {questions.length} · Score: {score}
                </div>
              )}
            </div>

            <div className="pu-content">
              {!sessionId ? (
                <div className="pu-emptyState">
                  <div className="pu-emptyIcon">🧠</div>
                  <div className="pu-emptyTitle">No study material yet</div>
                  <div className="pu-emptySub">Upload files first to generate a quiz.</div>
                  <button className="pu-btn pu-btnPrimary" type="button" onClick={() => router.push("/upload")}>
                    Upload Material
                  </button>
                </div>
              ) : quizState === "landing" ? (
                <div className="pu-landingShell">
                  <div className="pu-configCard">
                    <div className="pu-configTitle">Generate a mock quiz</div>
                    <div className="pu-configSub">
                      Source:{" "}
                      {sessionFiles.length > 0 ? sessionFiles.map((f) => f.name).join(", ") : "uploaded material"}
                    </div>
                    <div className="pu-configDesc">
                      Creates multiple-choice questions with explanations, grounded in your uploaded content.
                    </div>
                    <div className="pu-configRow">
                      <label className="pu-configLabel">Number of questions</label>
                      <div className="pu-countBtns">
                        {[5, 10, 15, 20].map((n) => (
                          <button
                            key={n}
                            className={`pu-countBtn${count === n ? " active" : ""}`}
                            type="button"
                            onClick={() => setCount(n)}
                          >{n}</button>
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
                      {generating ? "Generating quiz…" : `Generate ${count} questions`}
                    </button>
                  </div>
                </div>
              ) : quizState === "quizzing" ? (
                <div className="pu-quizShell">
                  <div className="pu-progress">
                    <div className="pu-progressBar" style={{ width: `${((currentIdx + (selected !== null ? 1 : 0)) / questions.length) * 100}%` }} />
                  </div>

                  <div className="pu-questionCard">
                    <div className="pu-qNumber">Question {currentIdx + 1}</div>
                    <div className="pu-qPrompt">{q.prompt}</div>

                    <div className="pu-options">
                      {q.options.map((opt, i) => {
                        let cls = "pu-option";
                        if (selected !== null) {
                          if (i === q.answer) cls += " correct";
                          else if (i === selected && selected !== q.answer) cls += " wrong";
                          else cls += " faded";
                        }
                        return (
                          <button key={i} className={cls} type="button" onClick={() => onSelectOption(i)}>
                            <span className="pu-optLabel">{String.fromCharCode(65 + i)}</span>
                            <span className="pu-optText">{opt}</span>
                          </button>
                        );
                      })}
                    </div>

                    {selected !== null && (
                      <div className={`pu-explanation${selected === q.answer ? " correct" : " wrong"}`}>
                        <strong>{selected === q.answer ? "✓ Correct!" : "✗ Incorrect."}</strong>
                        {" "}{q.explanation}
                      </div>
                    )}

                    {selected !== null && (
                      <button className="pu-btn pu-btnPrimary" type="button" onClick={onNext} style={{ alignSelf: "flex-end", marginTop: 8 }}>
                        {currentIdx < questions.length - 1 ? "Next →" : "See Results"}
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                /* Done */
                <div className="pu-resultsShell">
                  <div className="pu-resultsCard">
                    <div className="pu-resultsScore">{pct}%</div>
                    <div className="pu-resultsTitle">
                      {pct >= 80 ? "Great job! 🎉" : pct >= 60 ? "Good effort! 📖" : "Keep studying! 💪"}
                    </div>
                    <div className="pu-resultsSub">
                      You scored {score} out of {questions.length} questions correctly.
                    </div>
                    <div className="pu-resultsBtns">
                      <button className="pu-btn pu-btnPrimary" type="button" onClick={onRestart}>Try Again</button>
                      <button className="pu-btn" type="button" onClick={() => { setQuizState("landing"); setQuestions([]); }}>
                        New Quiz
                      </button>
                    </div>
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
          --pu-bg: #07070b; --pu-text: rgba(255,255,255,0.92);
          --pu-accent-1: #5aa8ff; --pu-accent-2: #5fe3ff;
          --pu-radius-lg: 22px; --pu-border: rgba(255,255,255,0.1);
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
        .pu-topMeta { font-size: 13px; font-weight: 900; color: rgba(255,255,255,0.6); }
        .pu-content { flex: 1; min-height: 0; overflow-y: auto; padding: 20px; display: flex; justify-content: center; }
        .pu-emptyState { text-align: center; padding: 48px 24px; width: 100%; max-width: 400px; }
        .pu-emptyIcon { font-size: 40px; margin-bottom: 16px; }
        .pu-emptyTitle { font-size: 18px; font-weight: 950; color: rgba(255,255,255,0.9); margin-bottom: 8px; }
        .pu-emptySub { font-size: 13px; color: rgba(255,255,255,0.6); line-height: 1.6; margin-bottom: 20px; }
        .pu-landingShell { max-width: 520px; width: 100%; }
        .pu-configCard { padding: 28px; border-radius: var(--pu-radius-lg); border: 1px solid rgba(255,255,255,0.1); background: rgba(10,12,18,0.3); display: flex; flex-direction: column; gap: 18px; }
        .pu-configTitle { font-size: 18px; font-weight: 950; color: rgba(255,255,255,0.94); }
        .pu-configSub { font-size: 13px; color: rgba(255,255,255,0.6); }
        .pu-configDesc { font-size: 13px; color: rgba(255,255,255,0.65); line-height: 1.6; }
        .pu-configRow { display: flex; flex-direction: column; gap: 8px; }
        .pu-configLabel { font-size: 11px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.08em; color: rgba(255,255,255,0.55); }
        .pu-countBtns { display: flex; gap: 8px; }
        .pu-countBtn { height: 36px; padding: 0 18px; border-radius: 999px; border: 1px solid rgba(255,255,255,0.12); background: rgba(255,255,255,0.04); color: rgba(255,255,255,0.85); font-size: 13px; font-weight: 900; cursor: pointer; transition: background 140ms, border-color 140ms; }
        .pu-countBtn.active { background: rgba(95,227,255,0.12); border-color: rgba(95,227,255,0.35); color: #5fe3ff; }
        .pu-error { font-size: 13px; color: #ff6b6b; padding: 12px 16px; border-radius: 14px; border: 1px solid rgba(255,107,107,0.2); background: rgba(255,107,107,0.06); }
        .pu-quizShell { width: 100%; max-width: 640px; display: flex; flex-direction: column; gap: 16px; }
        .pu-progress { width: 100%; height: 3px; border-radius: 999px; background: rgba(255,255,255,0.08); overflow: hidden; }
        .pu-progressBar { height: 100%; border-radius: 999px; background: linear-gradient(90deg, #5aa8ff, #5fe3ff); transition: width 300ms ease; }
        .pu-questionCard { padding: 24px; border-radius: var(--pu-radius-lg); border: 1px solid rgba(255,255,255,0.1); background: rgba(10,12,18,0.3); display: flex; flex-direction: column; gap: 16px; }
        .pu-qNumber { font-size: 10px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.1em; color: rgba(255,255,255,0.45); }
        .pu-qPrompt { font-size: 17px; font-weight: 900; color: rgba(255,255,255,0.94); line-height: 1.4; letter-spacing: -0.01em; }
        .pu-options { display: flex; flex-direction: column; gap: 8px; }
        .pu-option { display: flex; align-items: center; gap: 12px; padding: 13px 16px; border-radius: 14px; border: 1px solid rgba(255,255,255,0.1); background: rgba(255,255,255,0.03); cursor: pointer; text-align: left; transition: background 140ms, border-color 140ms, transform 100ms; }
        .pu-option:hover { background: rgba(255,255,255,0.06); border-color: rgba(95,227,255,0.22); transform: translateY(-1px); }
        .pu-option.correct { border-color: rgba(95,227,100,0.4); background: rgba(95,227,100,0.08); cursor: default; transform: none; }
        .pu-option.wrong { border-color: rgba(255,107,107,0.4); background: rgba(255,107,107,0.08); cursor: default; transform: none; }
        .pu-option.faded { opacity: 0.45; cursor: default; transform: none; }
        .pu-optLabel { width: 26px; height: 26px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.15); background: rgba(255,255,255,0.05); display: grid; place-items: center; font-size: 12px; font-weight: 900; color: rgba(255,255,255,0.7); flex-shrink: 0; }
        .pu-optText { font-size: 14px; font-weight: 700; color: rgba(255,255,255,0.88); line-height: 1.4; }
        .pu-explanation { padding: 12px 16px; border-radius: 14px; font-size: 13px; line-height: 1.6; }
        .pu-explanation.correct { border: 1px solid rgba(95,227,100,0.2); background: rgba(95,227,100,0.06); color: rgba(255,255,255,0.85); }
        .pu-explanation.wrong { border: 1px solid rgba(255,107,107,0.2); background: rgba(255,107,107,0.06); color: rgba(255,255,255,0.85); }
        .pu-resultsShell { display: flex; align-items: center; justify-content: center; width: 100%; min-height: 200px; }
        .pu-resultsCard { text-align: center; max-width: 400px; padding: 40px 28px; border-radius: var(--pu-radius-lg); border: 1px solid rgba(255,255,255,0.1); background: rgba(10,12,18,0.4); }
        .pu-resultsScore { font-size: 72px; font-weight: 950; letter-spacing: -0.04em; background: linear-gradient(90deg, #5aa8ff, #5fe3ff); -webkit-background-clip: text; background-clip: text; color: transparent; line-height: 1; }
        .pu-resultsTitle { font-size: 20px; font-weight: 950; color: rgba(255,255,255,0.94); margin-top: 12px; margin-bottom: 8px; }
        .pu-resultsSub { font-size: 13px; color: rgba(255,255,255,0.65); margin-bottom: 24px; }
        .pu-resultsBtns { display: flex; gap: 10px; justify-content: center; flex-wrap: wrap; }
        .pu-btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; height: 40px; padding: 0 18px; border-radius: 999px; border: 1px solid rgba(255,255,255,0.12); background: rgba(255,255,255,0.04); color: rgba(255,255,255,0.92); font-size: 12px; font-weight: 900; cursor: pointer; transition: transform 160ms ease, background 160ms ease; white-space: nowrap; }
        .pu-btn:hover { transform: translateY(-1px); background: rgba(255,255,255,0.06); border-color: rgba(95,227,255,0.22); }
        .pu-btnPrimary { background: linear-gradient(90deg, rgba(90,168,255,0.95), rgba(95,227,255,0.95)); color: rgba(0,0,0,0.9); border-color: transparent; }
        .pu-btnDisabled { opacity: 0.4; cursor: not-allowed; transform: none !important; }
        @media (max-width: 720px) { .pu-shell { grid-template-columns: 1fr; } }
      `}</style>
    </>
  );
}
