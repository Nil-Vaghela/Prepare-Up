"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AnimatedBackground from "../../components/AnimatedBackground";
import { useAuth } from "../../lib/auth-context";

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";

type Thread = { id: string; title: string | null; updated_at: string; source_session_id: string | null; source_files: Array<{ name: string }> };
type Question = { prompt: string; options: string[]; answer: number; explanation: string };
type ViewState = "select" | "generating" | "quizzing" | "done";

const FEATURES = [
  { href: "/flashcard",  label: "Flash Cards", icon: "⊞" },
  { href: "/podcast",    label: "Podcast",     icon: "🎙" },
  { href: "/mockquiz",   label: "Mock Test",   icon: "✎" },
  { href: "/studyguide", label: "Study Guide", icon: "≡" },
];

export default function MockQuizPage() {
  const router = useRouter();
  const { accessToken } = useAuth();
  const [threads, setThreads] = useState<Thread[]>([]);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Thread | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [view, setView] = useState<ViewState>("select");
  const [error, setError] = useState("");
  const [count, setCount] = useState(10);

  // Quiz progress
  const [currentIdx, setCurrentIdx] = useState(0);
  const [chosenIdx, setChosenIdx] = useState<number | null>(null);
  const [answered, setAnswered] = useState<number[]>([]);
  const [score, setScore] = useState(0);

  useEffect(() => {
    fetch(`${BACKEND}/api/chat/threads`, {
      credentials: "include",
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
    })
      .then(r => r.ok ? r.json() : { threads: [] })
      .then(d => setThreads(d.threads || []))
      .catch(() => {});
  }, [accessToken]);

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
        body: JSON.stringify({ session_id: sid, count }),
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
      setView("quizzing");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Generation failed.");
      setView("select");
    }
  }, [count]);

  const onChoose = (i: number) => {
    if (chosenIdx !== null) return;
    setChosenIdx(i);
    const q = questions[currentIdx];
    if (i === q.answer) setScore(s => s + 1);
    setAnswered(prev => { const u = [...prev]; u[currentIdx] = i; return u; });
  };

  const onNext = () => {
    if (currentIdx < questions.length - 1) {
      setCurrentIdx(idx => idx + 1);
      setChosenIdx(answered[currentIdx + 1] ?? null);
    } else {
      setView("done");
    }
  };

  const onRestart = () => {
    setCurrentIdx(0);
    setChosenIdx(null);
    setAnswered([]);
    setScore(0);
    setView("quizzing");
  };

  const q = questions[currentIdx];
  const pct = questions.length ? Math.round((score / questions.length) * 100) : 0;
  const progressPct = questions.length ? Math.round(((currentIdx + (chosenIdx !== null ? 1 : 0)) / questions.length) * 100) : 0;

  return (
    <>
      <AnimatedBackground />
      <div className="mq-root">
        {/* ── Sidebar ── */}
        <aside className="mq-glass mq-sidebar">
          <div className="mq-brand" onClick={() => router.push("/dashboard")} style={{ cursor: "pointer" }}>PrepareUp</div>
          <div className="mq-sectionLabel">MAIN</div>
          <nav className="mq-nav">
            {FEATURES.map(f => (
              <div key={f.href} className={`mq-navItem${f.href === "/mockquiz" ? " active" : ""}`} onClick={() => router.push(f.href)}>
                <span className="mq-navIcon">{f.icon}</span>
                <span>{f.label}</span>
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
              <div className="mq-countRow">
                <span className="mq-countLabel">Questions to generate</span>
                <div className="mq-countBtns">
                  {[5, 10, 15, 20].map(n => (
                    <button key={n} className={`mq-countBtn${count === n ? " active" : ""}`} onClick={() => setCount(n)}>{n}</button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {view === "generating" && (
            <div className="mq-centerState">
              <div className="mq-spinner" />
              <div className="mq-centerTitle">Generating quiz…</div>
              <div className="mq-centerSub">Writing {count} questions from "{selected?.title || "your chat"}"</div>
            </div>
          )}

          {view === "quizzing" && q && (
            <div className="mq-workspace">
              {/* Header */}
              <div className="mq-wsHeader">
                <div>
                  <div className="mq-wsEyebrow">MOCK TEST</div>
                  <div className="mq-wsTitle">{selected?.title || "Your notes"}</div>
                </div>
                <div className="mq-headerRight">
                  <div className="mq-scoreBadge">Score: {score}/{currentIdx + (chosenIdx !== null ? 1 : 0)}</div>
                  <button className="mq-backBtn" onClick={() => { setView("select"); setSelected(null); }}>← Back</button>
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
            <div className="mq-centerState">
              <div className="mq-resultScore">{pct}%</div>
              <div className="mq-centerTitle">
                {pct >= 80 ? "Great job! 🎉" : pct >= 60 ? "Good effort! 📖" : "Keep studying! 💪"}
              </div>
              <div className="mq-centerSub">
                You scored {score} out of {questions.length} questions correctly.
              </div>
              <div className="mq-resultBtns">
                <button className="mq-ctrlBtn mq-ctrlAccent" type="button" onClick={onRestart}>Try Again</button>
                <button className="mq-ctrlBtn" type="button" onClick={() => { setView("select"); setQuestions([]); setSelected(null); }}>New Quiz</button>
              </div>
            </div>
          )}
        </main>
      </div>

      <style jsx>{`
        :global(body){margin:0;background:#07070b;}
        .mq-root{position:relative;z-index:1;display:grid;grid-template-columns:240px 1fr;gap:12px;height:100vh;padding:12px;box-sizing:border-box;font-family:ui-sans-serif,system-ui,-apple-system,sans-serif;color:rgba(255,255,255,0.92);-webkit-font-smoothing:antialiased;}
        .mq-glass{border-radius:20px;border:1px solid rgba(255,255,255,0.1);background:rgba(10,12,18,0.5);backdrop-filter:blur(18px) saturate(140%);-webkit-backdrop-filter:blur(18px) saturate(140%);box-shadow:0 20px 60px rgba(0,0,0,0.5);}
        .mq-sidebar{padding:16px;display:flex;flex-direction:column;min-height:0;overflow:hidden;}
        .mq-main{overflow-y:auto;padding:0;}
        .mq-brand{font-size:15px;font-weight:950;letter-spacing:-0.02em;background:linear-gradient(90deg,#5aa8ff,#5fe3ff);-webkit-background-clip:text;background-clip:text;color:transparent;margin-bottom:14px;}
        .mq-sectionLabel{font-size:10px;font-weight:900;letter-spacing:0.1em;text-transform:uppercase;color:rgba(255,255,255,0.4);margin-bottom:6px;}
        .mq-nav{display:flex;flex-direction:column;gap:4px;}
        .mq-navItem{display:flex;align-items:center;gap:10px;padding:9px 12px;border-radius:12px;border:1px solid transparent;cursor:pointer;font-size:13px;font-weight:700;color:rgba(255,255,255,0.75);transition:all 130ms;}
        .mq-navItem:hover{background:rgba(255,255,255,0.04);border-color:rgba(255,255,255,0.08);}
        .mq-navItem.active{background:rgba(255,255,255,0.06);border-color:rgba(95,227,255,0.25);color:rgba(255,255,255,0.95);}
        .mq-navIcon{font-size:14px;width:18px;text-align:center;}
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
        .mq-countRow{display:flex;flex-direction:column;align-items:center;gap:8px;margin-top:8px;}
        .mq-countLabel{font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:0.08em;color:rgba(255,255,255,0.5);}
        .mq-countBtns{display:flex;gap:8px;}
        .mq-countBtn{height:34px;padding:0 16px;border-radius:999px;border:1px solid rgba(255,255,255,0.12);background:rgba(255,255,255,0.04);color:rgba(255,255,255,0.82);font-size:13px;font-weight:800;cursor:pointer;transition:all 130ms;}
        .mq-countBtn.active{background:rgba(95,227,255,0.14);border-color:rgba(95,227,255,0.4);color:#5fe3ff;}
        .mq-spinner{width:36px;height:36px;border-radius:50%;border:3px solid rgba(255,255,255,0.1);border-top-color:#5aa8ff;animation:spin 0.8s linear infinite;}
        @keyframes spin{to{transform:rotate(360deg)}}
        /* Result score */
        .mq-resultScore{font-size:80px;font-weight:950;letter-spacing:-0.04em;background:linear-gradient(90deg,#5aa8ff,#5fe3ff);-webkit-background-clip:text;background-clip:text;color:transparent;line-height:1;}
        .mq-resultBtns{display:flex;gap:10px;justify-content:center;flex-wrap:wrap;}
        /* Workspace */
        .mq-workspace{padding:24px;display:flex;flex-direction:column;gap:18px;max-width:700px;margin:0 auto;width:100%;box-sizing:border-box;}
        .mq-wsHeader{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap;}
        .mq-wsEyebrow{font-size:10px;font-weight:900;letter-spacing:0.1em;text-transform:uppercase;color:rgba(255,255,255,0.45);}
        .mq-wsTitle{font-size:20px;font-weight:950;letter-spacing:-0.02em;color:rgba(255,255,255,0.94);margin-top:4px;}
        .mq-headerRight{display:flex;align-items:center;gap:10px;flex-shrink:0;}
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
        @media(max-width:700px){.mq-root{grid-template-columns:1fr;}.mq-sidebar{display:none;}}
      `}</style>
    </>
  );
}
