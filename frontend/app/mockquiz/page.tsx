"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import AnimatedBackground from "../../components/AnimatedBackground";
import { useAuth } from "../../lib/auth-context";

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";

type Thread = { id: string; title: string | null; updated_at: string; source_session_id: string | null; source_files: Array<{ name: string }> };
type Question = { prompt: string; options: string[]; answer: number; explanation: string };
type ViewState = "select" | "generating" | "quizzing" | "done";
type Difficulty = "easy" | "medium" | "hard";

const FEATURES: Array<{ href: string; label: string; icon: React.ReactNode }> = [
  { href: "/flashcard",     label: "Flash Cards",    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="18" height="18"><rect x="5" y="7" width="11" height="8" rx="2"/><path d="M9 5h10v8"/><path d="M8.5 10.5h4"/></svg> },
  { href: "/podcast",       label: "Podcast",        icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="18" height="18"><path d="M4 13a8 8 0 0 1 16 0"/><rect x="4" y="13" width="3.5" height="6" rx="1.5"/><rect x="16.5" y="13" width="3.5" height="6" rx="1.5"/><path d="M7.5 19a4.5 4.5 0 0 0 9 0"/></svg> },
  { href: "/mockquiz",      label: "Mock Test",      icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="18" height="18"><circle cx="12" cy="12" r="9"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg> },
  { href: "/studyguide",    label: "Study Guide",    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="18" height="18"><path d="M5.5 6.5A2.5 2.5 0 0 1 8 4h10.5v15H8a2.5 2.5 0 0 0-2.5 2.5"/><path d="M5.5 6.5V20"/><path d="M9.5 8h6"/><path d="M9.5 11h6"/></svg> },
  { href: "/voice-learning", label: "Voice Learning", icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="18" height="18"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg> },
];

// Timer limits in seconds; 0 = no limit
const TIMER_OPTIONS: { label: string; value: number }[] = [
  { label: "None", value: 0 },
  { label: "5 min", value: 300 },
  { label: "10 min", value: 600 },
  { label: "15 min", value: 900 },
];

function fmtTime(s: number) {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

export default function MockQuizPage() {
  const router = useRouter();
  const { accessToken, loading: authLoading } = useAuth();
  const [threads, setThreads] = useState<Thread[]>([]);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Thread | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [view, setView] = useState<ViewState>("select");
  const [error, setError] = useState("");
  const [count, setCount] = useState(10);
  const [difficulty, setDifficulty] = useState<Difficulty>("medium");
  const [timeLimitSecs, setTimeLimitSecs] = useState(0); // 0 = no limit

  // Quiz progress
  const [currentIdx, setCurrentIdx] = useState(0);
  const [chosenIdx, setChosenIdx] = useState<number | null>(null);
  const [answered, setAnswered] = useState<number[]>([]); // -1 = skipped/timed-out
  const [score, setScore] = useState(0);

  // Timer
  const [timeLeft, setTimeLeft] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopTimer = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  }, []);

  // Stable countdown — recreated only when view/timeLimitSecs changes (NOT every tick)
  useEffect(() => {
    if (view !== "quizzing" || timeLimitSecs === 0) return;
    stopTimer();
    const id = setInterval(() => {
      setTimeLeft(t => Math.max(0, t - 1));
    }, 1000);
    timerRef.current = id;
    return () => { clearInterval(id); timerRef.current = null; };
  }, [view, timeLimitSecs, stopTimer]); // timeLeft intentionally NOT in deps

  // Auto-submit when timer reaches 0
  useEffect(() => {
    if (view !== "quizzing" || timeLeft > 0 || timeLimitSecs === 0) return;
    stopTimer();
    setAnswered(prev => {
      const next = [...prev];
      for (let i = 0; i < questions.length; i++) {
        if (next[i] === undefined) next[i] = -1;
      }
      return next;
    });
    setView("done");
  }, [timeLeft, view, timeLimitSecs, questions.length, stopTimer]);

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

  const filtered = threads.filter(t =>
    (t.title || "Untitled").toLowerCase().includes(query.toLowerCase())
  );

  const generate = useCallback(async (thread: Thread) => {
    const sid = thread.source_session_id;
    if (!sid) { setError("This chat has no uploaded content to generate from."); return; }
    setSelected(thread);
    setView("generating");
    setError("");
    try {
      const res = await fetch(`${BACKEND}/api/quiz/generate`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({ session_id: sid, count, difficulty }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.detail || "Generation failed"); }
      const data = await res.json();
      const qs: Question[] = Array.isArray(data.questions) ? data.questions : [];
      if (!qs.length) throw new Error("No questions returned. Try a different chat.");
      setQuestions(qs);
      setCurrentIdx(0);
      setChosenIdx(null);
      setAnswered([]);
      setScore(0);
      // Set timeLeft BEFORE setView so the effect sees the correct value on first run
      if (timeLimitSecs > 0) setTimeLeft(timeLimitSecs);
      setView("quizzing");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Generation failed.");
      setView("select");
    }
  }, [count, difficulty, timeLimitSecs, accessToken, stopTimer]);

  const onChoose = (i: number) => {
    if (chosenIdx !== null) return;
    stopTimer();
    setChosenIdx(i);
    const q = questions[currentIdx];
    if (i === q.answer) setScore(s => s + 1);
    setAnswered(prev => { const u = [...prev]; u[currentIdx] = i; return u; });
  };

  const onNext = () => {
    if (currentIdx < questions.length - 1) {
      const nextIdx = currentIdx + 1;
      setCurrentIdx(nextIdx);
      const nextAnswered = answered[nextIdx];
      setChosenIdx(nextAnswered !== undefined ? nextAnswered : null);
    } else {
      stopTimer();
      setView("done");
    }
  };

  const onRestart = () => {
    stopTimer();
    setCurrentIdx(0);
    setChosenIdx(null);
    setAnswered([]);
    setScore(0);
    if (timeLimitSecs > 0) setTimeLeft(timeLimitSecs);
    // view changes "done" → "quizzing", which re-triggers the timer effect
    setView("quizzing");
  };

  const q = questions[currentIdx];
  const answeredCount = answered.filter(a => a !== undefined).length;
  const pct = questions.length ? Math.round((score / questions.length) * 100) : 0;
  const progressPct = questions.length ? Math.round(((currentIdx + (chosenIdx !== null ? 1 : 0)) / questions.length) * 100) : 0;
  const timerWarning = timeLimitSecs > 0 && timeLeft > 0 && timeLeft <= 60;
  const timerUrgent = timeLimitSecs > 0 && timeLeft > 0 && timeLeft <= 20;

  // Wrong answers for review (includes skipped = -1)
  const incorrectCount = answered.filter((a, i) => a !== questions[i]?.answer).length;

  return (
    <>
      <AnimatedBackground />
      <div className="mq-root">
        {/* ── Sidebar ── */}
        <aside className="mq-glass mq-sidebar">
          <div className="mq-brandRow">
            <div className="mq-brand" onClick={() => router.push("/dashboard")} style={{ cursor: "pointer" }}>PrepareUp</div>
            <button className="mq-homeBtn" onClick={() => router.push("/dashboard")} title="Home">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="15" height="15"><path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.5z"/><path d="M9 21V12h6v9"/></svg>
            </button>
          </div>
          <div className="mq-sectionLabel">MAIN</div>
          <nav className="pu-sideNav">
            {FEATURES.map(f => (
              <div key={f.href} className={`pu-sideItem${f.href === "/mockquiz" ? " active" : ""}`} onClick={() => router.push(f.href)}>
                <span className="pu-sideIcon">{f.icon}</span>
                <div className="pu-sideLabel">{f.label}</div>
              </div>
            ))}
          </nav>
          <button className="mq-newChat" onClick={() => router.push("/dashboard")}>
            <span>+</span> New Chat
          </button>
          <div className="mq-sectionLabel" style={{ marginTop: 14 }}>RECENTS</div>
          <input className="mq-search" placeholder="Search chats…" value={query} onChange={e => setQuery(e.target.value)} />
          <div className="mq-list">
            {filtered.map(t => (
              <div key={t.id} className={`mq-thread${selected?.id === t.id ? " active" : ""}`} onClick={() => generate(t)}>
                <div className="mq-threadTitle">{t.title || "Untitled chat"}</div>
                <div className="mq-threadSub">{t.source_files?.map(f => f.name).join(", ") || "No files"}</div>
              </div>
            ))}
            {!filtered.length && <div className="mq-empty">No chats yet. Upload content from the dashboard first.</div>}
          </div>
        </aside>

        {/* ── Main ── */}
        <main className="mq-glass mq-main">
          {view === "select" && (
            <div className="mq-centerState">
              <div className="mq-centerIcon">✎</div>
              <div className="mq-centerTitle">Mock Test Workspace</div>
              <div className="mq-centerSub">Select a chat from the sidebar to generate a mock quiz from your notes.</div>
              {error && <div className="mq-error">{error}</div>}

              <div className="mq-configPanel">
                <div className="mq-configRow">
                  <span className="mq-countLabel">Questions</span>
                  <div className="mq-countBtns">
                    {[5, 10, 15, 20].map(n => (
                      <button key={n} className={`mq-countBtn${count === n ? " active" : ""}`} onClick={() => setCount(n)}>{n}</button>
                    ))}
                  </div>
                </div>

                <div className="mq-configRow">
                  <span className="mq-countLabel">Difficulty</span>
                  <div className="mq-countBtns">
                    {(["easy", "medium", "hard"] as Difficulty[]).map(d => (
                      <button key={d} className={`mq-countBtn${difficulty === d ? " active diff-" + d : ""}`} onClick={() => setDifficulty(d)}>
                        {d.charAt(0).toUpperCase() + d.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="mq-configRow">
                  <span className="mq-countLabel">Time Limit</span>
                  <div className="mq-countBtns">
                    {TIMER_OPTIONS.map(opt => (
                      <button key={opt.value} className={`mq-countBtn${timeLimitSecs === opt.value ? " active" : ""}`} onClick={() => setTimeLimitSecs(opt.value)}>
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {view === "generating" && (
            <div className="mq-centerState">
              <div className="mq-spinner" />
              <div className="mq-centerTitle">Generating quiz…</div>
              <div className="mq-centerSub">Writing {count} {difficulty} questions from "{selected?.title || "your chat"}"</div>
            </div>
          )}

          {view === "quizzing" && q && (
            <div className="mq-workspace">
              {/* Header */}
              <div className="mq-wsHeader">
                <div>
                  <div className="mq-wsEyebrow">MOCK TEST · {difficulty.toUpperCase()}</div>
                  <div className="mq-wsTitle">{selected?.title || "Your notes"}</div>
                </div>
                <div className="mq-headerRight">
                  {timeLimitSecs > 0 && (
                    <div className={`mq-timerBadge${timerUrgent ? " urgent" : timerWarning ? " warning" : ""}`}>
                      ⏱ {fmtTime(timeLeft)}
                    </div>
                  )}
                  <div className="mq-scoreBadge">Score: {score}/{answeredCount}</div>
                </div>
              </div>

              {/* Progress bar */}
              <div className="mq-progressWrap">
                <div className="mq-progressLabel">
                  <span>Question {currentIdx + 1} of {questions.length}</span>
                  <span>{progressPct}% complete</span>
                </div>
                <div className="mq-progressTrack"><div className="mq-progressFill" style={{ width: `${progressPct}%` }} /></div>
              </div>

              {/* Question card */}
              <div className="mq-questionCard">
                <div className="mq-qBadge">Q{currentIdx + 1}</div>
                <div className="mq-qText">{q.prompt}</div>

                <div className="mq-options">
                  {q.options.map((opt, i) => {
                    let cls = "mq-option";
                    if (chosenIdx !== null) {
                      if (i === q.answer) cls += " correct";
                      else if (i === chosenIdx && chosenIdx !== q.answer) cls += " wrong";
                      else cls += " faded";
                    }
                    return (
                      <button key={i} className={cls} type="button" onClick={() => onChoose(i)}>
                        <span className="mq-optLabel">{String.fromCharCode(65 + i)}</span>
                        <span className="mq-optText">{opt}</span>
                      </button>
                    );
                  })}
                </div>

                {chosenIdx !== null && (
                  <div className={`mq-explanation${chosenIdx === q.answer ? " correct" : " wrong"}`}>
                    <span className="mq-explIcon">{chosenIdx === q.answer ? "✓" : "✗"}</span>
                    <span><strong>{chosenIdx === q.answer ? "Correct!" : "Incorrect."}</strong> {q.explanation}</span>
                  </div>
                )}

                {chosenIdx !== null && (
                  <div className="mq-nextRow">
                    <button className="mq-ctrlBtn mq-ctrlAccent" type="button" onClick={onNext}>
                      {currentIdx < questions.length - 1 ? "Next Question →" : "See Results"}
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {view === "done" && (
            <div className="mq-reviewRoot">
              {/* Score summary */}
              <div className="mq-reviewHeader">
                <div className="mq-resultScore">{pct}%</div>
                <div className="mq-reviewTitle">
                  {pct >= 80 ? "Great job! 🎉" : pct >= 60 ? "Good effort! 📖" : "Keep studying! 💪"}
                </div>
                <div className="mq-reviewSub">
                  {score} correct · {incorrectCount} incorrect · {questions.length} total · {difficulty}
                </div>
                <div className="mq-reviewBtns">
                  <button className="mq-ctrlBtn mq-ctrlAccent" type="button" onClick={onRestart}>Try Again</button>
                  <button className="mq-ctrlBtn" type="button" onClick={() => { stopTimer(); setView("select"); setQuestions([]); setSelected(null); }}>New Quiz</button>
                </div>
              </div>

              {/* Incorrect questions review */}
              {incorrectCount > 0 && (
                <div className="mq-reviewSection">
                  <div className="mq-reviewSectionLabel">REVIEW — INCORRECT ANSWERS</div>
                  {questions.map((ques, qi) => {
                    const userAns = answered[qi];
                    const isCorrect = userAns === ques.answer;
                    if (isCorrect) return null;
                    return (
                      <div key={qi} className="mq-reviewCard">
                        <div className="mq-reviewQBadge">Q{qi + 1}</div>
                        <div className="mq-reviewQText">{ques.prompt}</div>
                        <div className="mq-reviewOptions">
                          {ques.options.map((opt, oi) => {
                            let cls = "mq-reviewOpt";
                            if (oi === ques.answer) cls += " correct";
                            else if (oi === userAns) cls += " wrong";
                            else cls += " faded";
                            return (
                              <div key={oi} className={cls}>
                                <span className="mq-optLabel">{String.fromCharCode(65 + oi)}</span>
                                <span className="mq-optText">{opt}</span>
                                {oi === ques.answer && <span className="mq-reviewTag">✓ Correct</span>}
                                {oi === userAns && oi !== ques.answer && <span className="mq-reviewTag wrong">✗ Your answer</span>}
                              </div>
                            );
                          })}
                          {(userAns === -1 || userAns === undefined) && (
                            <div className="mq-reviewSkipped">⏱ Time expired — question skipped</div>
                          )}
                        </div>
                        <div className="mq-reviewExpl">
                          <span className="mq-explIcon">💡</span>
                          <span>{ques.explanation}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {incorrectCount === 0 && (
                <div className="mq-reviewPerfect">
                  <div style={{ fontSize: 40 }}>🏆</div>
                  <div className="mq-reviewTitle">Perfect score! All answers correct.</div>
                </div>
              )}
            </div>
          )}
        </main>
      </div>

      <style jsx>{`
        :global(body){margin:0;background:#07070b;}
        .mq-root{position:relative;z-index:1;display:grid;grid-template-columns:340px 1fr;gap:12px;height:100vh;padding:12px;box-sizing:border-box;font-family:ui-sans-serif,system-ui,-apple-system,sans-serif;color:rgba(255,255,255,0.92);-webkit-font-smoothing:antialiased;}
        .mq-glass{border-radius:20px;border:1px solid rgba(255,255,255,0.1);background:rgba(10,12,18,0.5);backdrop-filter:blur(18px) saturate(140%);-webkit-backdrop-filter:blur(18px) saturate(140%);box-shadow:0 20px 60px rgba(0,0,0,0.5);}
        .mq-sidebar{padding:16px;display:flex;flex-direction:column;min-height:0;overflow:hidden;}
        .mq-main{overflow-y:auto;padding:0;}
        .mq-brandRow{display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;}
        .mq-brand{font-size:15px;font-weight:950;letter-spacing:-0.02em;background:linear-gradient(90deg,#5aa8ff,#5fe3ff);-webkit-background-clip:text;background-clip:text;color:transparent;}
        .mq-homeBtn{width:28px;height:28px;border-radius:9px;border:1px solid rgba(255,255,255,0.1);background:rgba(255,255,255,0.04);color:rgba(255,255,255,0.6);display:grid;place-items:center;cursor:pointer;transition:all 130ms;flex-shrink:0;}
        .mq-homeBtn:hover{background:rgba(95,227,255,0.1);border-color:rgba(95,227,255,0.3);color:#5fe3ff;}
        .mq-sectionLabel{font-size:10px;font-weight:900;letter-spacing:0.1em;text-transform:uppercase;color:rgba(255,255,255,0.4);margin-bottom:6px;}
        .pu-sideNav{margin-top:8px;display:flex;flex-direction:column;gap:6px;}
        .pu-sideItem{display:flex;align-items:center;gap:12px;padding:10px 12px;border-radius:14px;border:1px solid rgba(255,255,255,0.08);background:rgba(10,12,18,0.2);cursor:pointer;user-select:none;text-decoration:none;color:rgba(255,255,255,0.88);transition:transform 140ms ease,background 140ms ease,border-color 140ms ease;position:relative;overflow:hidden;}
        .pu-sideItem:hover{background:rgba(255,255,255,0.04);border-color:rgba(95,227,255,0.18);transform:translateY(-1px);}
        .pu-sideItem.active{border-color:rgba(95,227,255,0.26);background:rgba(255,255,255,0.05);}
        .pu-sideItem.active::before{content:"";position:absolute;left:10px;top:10px;bottom:10px;width:3px;border-radius:999px;background:linear-gradient(180deg,#5fe3ff,#5aa8ff);}
        .pu-sideIcon{width:18px;height:18px;display:grid;place-items:center;color:rgba(255,255,255,0.72);flex-shrink:0;}
        .pu-sideLabel{font-size:12px;font-weight:900;color:rgba(255,255,255,0.88);}
        .mq-search{margin-top:4px;width:100%;box-sizing:border-box;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:8px 12px;font-size:12px;color:rgba(255,255,255,0.85);outline:none;}
        .mq-search::placeholder{color:rgba(255,255,255,0.35);}
        .mq-list{flex:1;overflow-y:auto;display:flex;flex-direction:column;gap:4px;margin-top:8px;}
        .mq-thread{padding:10px 12px;border-radius:12px;border:1px solid rgba(255,255,255,0.06);background:rgba(255,255,255,0.02);cursor:pointer;transition:all 130ms;}
        .mq-thread:hover{background:rgba(255,255,255,0.05);border-color:rgba(95,227,255,0.18);}
        .mq-thread.active{border-color:rgba(95,227,255,0.3);background:rgba(95,227,255,0.06);}
        .mq-threadTitle{font-size:12px;font-weight:800;color:rgba(255,255,255,0.88);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
        .mq-threadSub{font-size:10px;color:rgba(255,255,255,0.42);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
        .mq-empty{font-size:12px;color:rgba(255,255,255,0.4);padding:12px 0;text-align:center;line-height:1.5;}
        .mq-newChat{width:100%;margin-top:10px;height:36px;border-radius:12px;border:1px dashed rgba(255,255,255,0.18);background:rgba(255,255,255,0.03);color:rgba(255,255,255,0.72);font-size:12px;font-weight:800;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px;transition:all 130ms;}
        .mq-newChat:hover{background:rgba(95,227,255,0.06);border-color:rgba(95,227,255,0.35);color:rgba(255,255,255,0.92);}
        /* Center states */
        .mq-centerState{display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;gap:16px;padding:40px;text-align:center;}
        .mq-centerIcon{font-size:48px;line-height:1;}
        .mq-centerTitle{font-size:22px;font-weight:950;letter-spacing:-0.02em;color:rgba(255,255,255,0.94);}
        .mq-centerSub{font-size:14px;color:rgba(255,255,255,0.55);line-height:1.6;max-width:420px;}
        .mq-error{font-size:13px;color:#ff6b6b;padding:10px 16px;border-radius:12px;border:1px solid rgba(255,107,107,0.2);background:rgba(255,107,107,0.07);}
        /* Config panel */
        .mq-configPanel{display:flex;flex-direction:column;gap:14px;margin-top:4px;width:100%;max-width:420px;}
        .mq-configRow{display:flex;flex-direction:column;align-items:center;gap:8px;}
        .mq-countLabel{font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:0.08em;color:rgba(255,255,255,0.5);}
        .mq-countBtns{display:flex;gap:8px;flex-wrap:wrap;justify-content:center;}
        .mq-countBtn{height:34px;padding:0 16px;border-radius:999px;border:1px solid rgba(255,255,255,0.12);background:rgba(255,255,255,0.04);color:rgba(255,255,255,0.82);font-size:13px;font-weight:800;cursor:pointer;transition:all 130ms;}
        .mq-countBtn.active{background:rgba(95,227,255,0.14);border-color:rgba(95,227,255,0.4);color:#5fe3ff;}
        .mq-countBtn.active.diff-easy{background:rgba(95,200,95,0.14);border-color:rgba(95,200,95,0.4);color:#5fc85f;}
        .mq-countBtn.active.diff-medium{background:rgba(255,200,90,0.14);border-color:rgba(255,200,90,0.4);color:#ffc85a;}
        .mq-countBtn.active.diff-hard{background:rgba(255,107,107,0.14);border-color:rgba(255,107,107,0.4);color:#ff6b6b;}
        .mq-spinner{width:36px;height:36px;border-radius:50%;border:3px solid rgba(255,255,255,0.1);border-top-color:#5aa8ff;animation:spin 0.8s linear infinite;}
        @keyframes spin{to{transform:rotate(360deg)}}
        /* Timer badge */
        .mq-timerBadge{font-size:13px;font-weight:900;padding:4px 12px;border-radius:999px;border:1px solid rgba(95,227,255,0.25);background:rgba(95,227,255,0.08);color:#5fe3ff;font-variant-numeric:tabular-nums;}
        .mq-timerBadge.warning{border-color:rgba(255,200,90,0.4);background:rgba(255,200,90,0.1);color:#ffc85a;}
        .mq-timerBadge.urgent{border-color:rgba(255,107,107,0.5);background:rgba(255,107,107,0.12);color:#ff6b6b;animation:pulse 0.8s ease-in-out infinite alternate;}
        @keyframes pulse{from{opacity:1}to{opacity:0.55}}
        /* Workspace */
        .mq-workspace{padding:24px;display:flex;flex-direction:column;gap:18px;max-width:700px;margin:0 auto;width:100%;box-sizing:border-box;}
        .mq-wsHeader{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap;}
        .mq-wsEyebrow{font-size:10px;font-weight:900;letter-spacing:0.1em;text-transform:uppercase;color:rgba(255,255,255,0.45);}
        .mq-wsTitle{font-size:20px;font-weight:950;letter-spacing:-0.02em;color:rgba(255,255,255,0.94);margin-top:4px;}
        .mq-headerRight{display:flex;align-items:center;gap:10px;flex-shrink:0;flex-wrap:wrap;}
        .mq-scoreBadge{font-size:13px;font-weight:900;color:rgba(255,255,255,0.7);}
        .mq-backBtn{height:34px;padding:0 14px;border-radius:999px;border:1px solid rgba(255,255,255,0.12);background:rgba(255,255,255,0.04);color:rgba(255,255,255,0.8);font-size:12px;font-weight:800;cursor:pointer;transition:all 130ms;}
        .mq-backBtn:hover{background:rgba(255,255,255,0.07);}
        /* Progress */
        .mq-progressWrap{display:flex;flex-direction:column;gap:6px;}
        .mq-progressLabel{display:flex;justify-content:space-between;font-size:11px;font-weight:700;color:rgba(255,255,255,0.5);}
        .mq-progressTrack{height:5px;border-radius:999px;background:rgba(255,255,255,0.08);overflow:hidden;}
        .mq-progressFill{height:100%;border-radius:999px;background:linear-gradient(90deg,#5aa8ff,#5fe3ff);transition:width 300ms ease;}
        /* Question card */
        .mq-questionCard{padding:24px;border-radius:20px;border:1px solid rgba(255,255,255,0.1);background:rgba(10,12,18,0.3);display:flex;flex-direction:column;gap:18px;}
        .mq-qBadge{font-size:10px;font-weight:900;letter-spacing:0.1em;text-transform:uppercase;color:rgba(255,255,255,0.4);}
        .mq-qText{font-size:18px;font-weight:900;color:rgba(255,255,255,0.94);line-height:1.45;letter-spacing:-0.01em;}
        /* Options */
        .mq-options{display:flex;flex-direction:column;gap:8px;}
        .mq-option{display:flex;align-items:center;gap:12px;padding:13px 16px;border-radius:14px;border:1px solid rgba(255,255,255,0.1);background:rgba(255,255,255,0.03);cursor:pointer;text-align:left;transition:all 140ms;}
        .mq-option:hover{background:rgba(255,255,255,0.06);border-color:rgba(95,227,255,0.22);transform:translateY(-1px);}
        .mq-option.correct{border-color:rgba(95,227,100,0.4);background:rgba(95,227,100,0.08);cursor:default;transform:none;}
        .mq-option.wrong{border-color:rgba(255,107,107,0.4);background:rgba(255,107,107,0.08);cursor:default;transform:none;}
        .mq-option.faded{opacity:0.38;cursor:default;transform:none;}
        .mq-optLabel{width:28px;height:28px;border-radius:9px;border:1px solid rgba(255,255,255,0.15);background:rgba(255,255,255,0.05);display:grid;place-items:center;font-size:12px;font-weight:900;color:rgba(255,255,255,0.7);flex-shrink:0;}
        .mq-optText{font-size:14px;font-weight:700;color:rgba(255,255,255,0.88);line-height:1.4;}
        /* Explanation */
        .mq-explanation{display:flex;gap:10px;padding:13px 16px;border-radius:14px;font-size:13px;line-height:1.6;}
        .mq-explanation.correct{border:1px solid rgba(95,227,100,0.2);background:rgba(95,227,100,0.06);color:rgba(255,255,255,0.85);}
        .mq-explanation.wrong{border:1px solid rgba(255,107,107,0.2);background:rgba(255,107,107,0.06);color:rgba(255,255,255,0.85);}
        .mq-explIcon{font-size:16px;flex-shrink:0;}
        .mq-nextRow{display:flex;justify-content:flex-end;}
        /* Buttons */
        .mq-ctrlBtn{height:40px;padding:0 20px;border-radius:999px;border:1px solid rgba(255,255,255,0.12);background:rgba(255,255,255,0.04);color:rgba(255,255,255,0.82);font-size:12px;font-weight:900;cursor:pointer;transition:all 130ms;white-space:nowrap;}
        .mq-ctrlBtn:hover:not(:disabled){background:rgba(255,255,255,0.07);border-color:rgba(95,227,255,0.22);transform:translateY(-1px);}
        .mq-ctrlBtn:disabled{opacity:0.3;cursor:default;}
        .mq-ctrlAccent{background:linear-gradient(90deg,rgba(90,168,255,0.9),rgba(95,227,255,0.9));color:rgba(0,0,0,0.85);border-color:transparent;}
        /* Review / Results */
        .mq-reviewRoot{padding:24px;display:flex;flex-direction:column;gap:24px;max-width:700px;margin:0 auto;width:100%;box-sizing:border-box;}
        .mq-reviewHeader{display:flex;flex-direction:column;align-items:center;gap:12px;text-align:center;padding-bottom:20px;border-bottom:1px solid rgba(255,255,255,0.08);}
        .mq-resultScore{font-size:72px;font-weight:950;letter-spacing:-0.04em;background:linear-gradient(90deg,#5aa8ff,#5fe3ff);-webkit-background-clip:text;background-clip:text;color:transparent;line-height:1;}
        .mq-reviewTitle{font-size:20px;font-weight:950;letter-spacing:-0.02em;color:rgba(255,255,255,0.94);}
        .mq-reviewSub{font-size:13px;color:rgba(255,255,255,0.5);}
        .mq-reviewBtns{display:flex;gap:10px;justify-content:center;flex-wrap:wrap;margin-top:4px;}
        .mq-reviewSection{display:flex;flex-direction:column;gap:16px;}
        .mq-reviewSectionLabel{font-size:10px;font-weight:900;letter-spacing:0.1em;text-transform:uppercase;color:rgba(255,107,107,0.7);}
        .mq-reviewCard{padding:20px;border-radius:18px;border:1px solid rgba(255,255,255,0.09);background:rgba(10,12,18,0.3);display:flex;flex-direction:column;gap:14px;}
        .mq-reviewQBadge{font-size:10px;font-weight:900;letter-spacing:0.1em;text-transform:uppercase;color:rgba(255,255,255,0.4);}
        .mq-reviewQText{font-size:16px;font-weight:900;color:rgba(255,255,255,0.92);line-height:1.45;letter-spacing:-0.01em;}
        .mq-reviewOptions{display:flex;flex-direction:column;gap:6px;}
        .mq-reviewOpt{display:flex;align-items:center;gap:12px;padding:10px 14px;border-radius:12px;border:1px solid rgba(255,255,255,0.07);background:rgba(255,255,255,0.02);}
        .mq-reviewOpt.correct{border-color:rgba(95,227,100,0.4);background:rgba(95,227,100,0.07);}
        .mq-reviewOpt.wrong{border-color:rgba(255,107,107,0.35);background:rgba(255,107,107,0.06);}
        .mq-reviewOpt.faded{opacity:0.3;}
        .mq-reviewTag{margin-left:auto;font-size:11px;font-weight:900;color:rgba(95,227,100,0.9);white-space:nowrap;}
        .mq-reviewTag.wrong{color:rgba(255,107,107,0.9);}
        .mq-reviewSkipped{font-size:12px;font-weight:700;color:rgba(255,200,90,0.8);padding:8px 0;}
        .mq-reviewExpl{display:flex;gap:10px;padding:10px 14px;border-radius:12px;border:1px solid rgba(255,255,255,0.06);background:rgba(255,255,255,0.02);font-size:13px;line-height:1.6;color:rgba(255,255,255,0.75);}
        .mq-reviewPerfect{display:flex;flex-direction:column;align-items:center;gap:12px;padding:40px;text-align:center;}
        @media(max-width:900px){.mq-root{grid-template-columns:1fr;}.mq-sidebar{display:none;}}
      `}</style>
    </>
  );
}
