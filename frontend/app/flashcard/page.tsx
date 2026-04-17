"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import AnimatedBackground from "../../components/AnimatedBackground";
import { useAuth } from "../../lib/auth-context";

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";

type Thread = { id: string; title: string | null; updated_at: string; source_session_id: string | null; source_files: Array<{ name: string }> };
type Card = { front: string; back: string };
type ViewState = "select" | "generating" | "studying";
type Difficulty = "easy" | "medium" | "hard";

const FEATURES: Array<{ href: string; label: string; icon: React.ReactNode }> = [
  { href: "/flashcard",     label: "Flash Cards",    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="18" height="18"><rect x="5" y="7" width="11" height="8" rx="2"/><path d="M9 5h10v8"/><path d="M8.5 10.5h4"/></svg> },
  { href: "/podcast",       label: "Podcast",        icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="18" height="18"><path d="M4 13a8 8 0 0 1 16 0"/><rect x="4" y="13" width="3.5" height="6" rx="1.5"/><rect x="16.5" y="13" width="3.5" height="6" rx="1.5"/><path d="M7.5 19a4.5 4.5 0 0 0 9 0"/></svg> },
  { href: "/mockquiz",      label: "Mock Test",      icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="18" height="18"><circle cx="12" cy="12" r="9"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg> },
  { href: "/studyguide",    label: "Study Guide",    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="18" height="18"><path d="M5.5 6.5A2.5 2.5 0 0 1 8 4h10.5v15H8a2.5 2.5 0 0 0-2.5 2.5"/><path d="M5.5 6.5V20"/><path d="M9.5 8h6"/><path d="M9.5 11h6"/></svg> },
  { href: "/voice-learning", label: "Voice Learning", icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="18" height="18"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg> },
];

export default function FlashcardPage() {
  const router = useRouter();
  const { accessToken, loading: authLoading } = useAuth();
  const [threads, setThreads] = useState<Thread[]>([]);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Thread | null>(null);
  const [cards, setCards] = useState<Card[]>([]);
  const [view, setView] = useState<ViewState>("select");
  const [error, setError] = useState("");
  const [cardCount, setCardCount] = useState(10);
  const [difficulty, setDifficulty] = useState<Difficulty>("medium");
  const [idx, setIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [shuffled, setShuffled] = useState<Card[]>([]);

  useEffect(() => {
    if (authLoading) return; // wait for auth-context to finish restoring session
    fetch(`${BACKEND}/api/chat/threads`, {
      credentials: "include",
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
    })
      .then(r => r.ok ? r.json() : { threads: [] })
      .then(d => setThreads(d.threads || []))
      .catch(() => {});
  }, [accessToken, authLoading]);

  const filtered = threads.filter(t => (t.title || "Untitled").toLowerCase().includes(query.toLowerCase()));
  const displayCards = shuffled.length ? shuffled : cards;
  const card = displayCards[idx];

  const generate = useCallback(async (thread: Thread) => {
    const sid = thread.source_session_id;
    if (!sid) { setError("This chat has no uploaded content to generate from."); return; }
    setSelected(thread);
    setView("generating");
    setError("");
    try {
      const res = await fetch(`${BACKEND}/api/generate`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({ session_id: sid, output_type: "flash_card", count: cardCount, difficulty }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.detail || "Generation failed"); }
      const data = await res.json();
      const c: Card[] = Array.isArray(data.cards) ? data.cards : [];
      if (!c.length) throw new Error("The AI could not generate flashcards from this content. Make sure the chat has uploaded documents with sufficient text.");
      setCards(c);
      setShuffled([]);
      setIdx(0);
      setFlipped(false);
      setView("studying");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Generation failed.");
      setView("select");
    }
  }, [cardCount, difficulty, accessToken]);

  const shuffle = () => {
    const copy = [...cards].sort(() => Math.random() - 0.5);
    setShuffled(copy);
    setIdx(0);
    setFlipped(false);
  };

  const go = (delta: number) => {
    setFlipped(false);
    setTimeout(() => setIdx(i => Math.max(0, Math.min(displayCards.length - 1, i + delta))), 80);
  };

  const pct = displayCards.length ? Math.round(((idx + 1) / displayCards.length) * 100) : 0;

  return (
    <>
      <AnimatedBackground />
      <div className="fp-root">
        {/* ── Sidebar ── */}
        <aside className="fp-glass fp-sidebar">
          <div className="fp-brandRow">
            <div className="fp-brand" onClick={() => router.push("/dashboard")} style={{ cursor: "pointer" }}>PrepareUp</div>
            <button className="fp-homeBtn" onClick={() => router.push("/dashboard")} title="Home">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="15" height="15"><path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.5z"/><path d="M9 21V12h6v9"/></svg>
            </button>
          </div>
          <div className="fp-sectionLabel">MAIN</div>
          <nav className="pu-sideNav">
            {FEATURES.map(f => (
              <div key={f.href} className={`pu-sideItem${f.href === "/flashcard" ? " active" : ""}`} onClick={() => router.push(f.href)}>
                <span className="pu-sideIcon">{f.icon}</span>
                <div className="pu-sideLabel">{f.label}</div>
              </div>
            ))}
          </nav>
          <button className="fp-newChat" onClick={() => router.push("/dashboard")}>
            <span>+</span> New Chat
          </button>
          <div className="fp-sectionLabel" style={{ marginTop: 14 }}>RECENTS</div>
          <input className="fp-search" placeholder="Search chats…" value={query} onChange={e => setQuery(e.target.value)} />
          <div className="fp-list">
            {filtered.map(t => (
              <div key={t.id} className={`fp-thread${selected?.id === t.id ? " active" : ""}`} onClick={() => generate(t)}>
                <div className="fp-threadTitle">{t.title || "Untitled chat"}</div>
                <div className="fp-threadSub">{t.source_files?.map((f: { name: string }) => f.name).join(", ") || "No files"}</div>
              </div>
            ))}
            {!filtered.length && <div className="fp-empty">No chats yet. Upload content from the dashboard first.</div>}
          </div>
        </aside>

        {/* ── Main ── */}
        <main className="fp-glass fp-main">
          {view === "select" && (
            <div className="fp-selectState">
              <div className="fp-selectIcon">⊞</div>
              <div className="fp-selectTitle">Flashcard Workspace</div>
              <div className="fp-selectSub">Select a chat from the sidebar to generate flashcards from your notes.</div>
              {error && <div className="fp-error">{error}</div>}
              <div className="fp-configPanel">
                <div className="fp-countRow">
                  <span className="fp-countLabel">Cards to generate</span>
                  <div className="fp-countBtns">
                    {[5, 10, 15, 20].map(n => (
                      <button key={n} className={`fp-countBtn${cardCount === n ? " active" : ""}`} onClick={() => setCardCount(n)}>{n}</button>
                    ))}
                  </div>
                </div>
                <div className="fp-countRow">
                  <span className="fp-countLabel">Difficulty</span>
                  <div className="fp-countBtns">
                    {(["easy", "medium", "hard"] as Difficulty[]).map(d => (
                      <button key={d} className={`fp-countBtn${difficulty === d ? " active diff-" + d : ""}`} onClick={() => setDifficulty(d)}>
                        {d.charAt(0).toUpperCase() + d.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {view === "generating" && (
            <div className="fp-selectState">
              <div className="fp-spinner" />
              <div className="fp-selectTitle">Generating flashcards…</div>
              <div className="fp-selectSub">Building {cardCount} cards from "{selected?.title || "your chat"}"</div>
            </div>
          )}

          {view === "studying" && card && (
            <div className="fp-workspace">
              {/* Header */}
              <div className="fp-wsHeader">
                <div>
                  <div className="fp-wsEyebrow">FLASHCARD WORKSPACE</div>
                  <div className="fp-wsTitle">Studying: {selected?.title || "Your notes"}</div>
                </div>
              </div>

              {/* Stats row */}
              <div className="fp-statsRow">
                <div className="fp-stat"><div className="fp-statVal">{displayCards.length}</div><div className="fp-statKey">Cards</div></div>
                <div className="fp-stat"><div className={`fp-statVal fp-diff-${difficulty}`}>{difficulty.charAt(0).toUpperCase() + difficulty.slice(1)}</div><div className="fp-statKey">Difficulty</div></div>
                <div className="fp-stat"><div className="fp-statVal">{idx + 1}</div><div className="fp-statKey">Current Card</div></div>
              </div>

              {/* Progress */}
              <div className="fp-progressBar">
                <div className="fp-progressLabel">Card {idx + 1}/{displayCards.length} <span style={{ float: "right" }}>{pct}% complete</span></div>
                <div className="fp-progressTrack"><div className="fp-progressFill" style={{ width: `${pct}%` }} /></div>
              </div>

              {/* Card */}
              <div className={`fp-card${flipped ? " flipped" : ""}`} onClick={() => setFlipped(v => !v)}>
                <div className="fp-cardInner">
                  <div className="fp-face fp-front">
                    <div className="fp-faceLabel">FRONT</div>
                    <div className="fp-faceText">{card.front}</div>
                    <div className="fp-tapHint">Tap to reveal answer</div>
                  </div>
                  <div className="fp-face fp-back">
                    <div className="fp-faceLabel">BACK</div>
                    <div className="fp-faceText">{card.back}</div>
                    <div className="fp-tapHint">Tap to flip back</div>
                  </div>
                </div>
              </div>

              {/* Controls */}
              <div className="fp-controls">
                <button className="fp-ctrlBtn" disabled={idx === 0} onClick={() => go(-1)}>Previous</button>
                <button className="fp-ctrlBtn fp-ctrlPrimary" onClick={() => setFlipped(v => !v)}>
                  {flipped ? "Hide Answer" : "Show Answer"}
                </button>
                <button className="fp-ctrlBtn" onClick={() => { setIdx(0); setFlipped(false); setShuffled([]); }}>Restart</button>
                <button className="fp-ctrlBtn" onClick={shuffle}>Shuffle</button>
                <button className="fp-ctrlBtn fp-ctrlAccent" disabled={idx === displayCards.length - 1} onClick={() => go(1)}>Next</button>
              </div>

              {/* Deck tips */}
              <div className="fp-tips">
                <div className="fp-tipsLabel">DECK TIPS</div>
                <div className="fp-tipsTitle">Use these cards for active recall</div>
                <div className="fp-tipCards">
                  <div className="fp-tipCard"><div className="fp-tipHead">Say the answer first</div><div className="fp-tipBody">Try to answer before flipping the card so you actively retrieve the concept.</div></div>
                  <div className="fp-tipCard"><div className="fp-tipHead">Shuffle after one full pass</div><div className="fp-tipBody">This stops memorizing the order and strengthens real recall.</div></div>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      <style jsx>{`
        :global(body){margin:0;background:#07070b;}
        .fp-root{position:relative;z-index:1;display:grid;grid-template-columns:340px 1fr;gap:12px;height:100vh;padding:12px;box-sizing:border-box;font-family:ui-sans-serif,system-ui,-apple-system,sans-serif;color:rgba(255,255,255,0.92);-webkit-font-smoothing:antialiased;}
        .fp-glass{border-radius:20px;border:1px solid rgba(255,255,255,0.1);background:rgba(10,12,18,0.5);backdrop-filter:blur(18px) saturate(140%);-webkit-backdrop-filter:blur(18px) saturate(140%);box-shadow:0 20px 60px rgba(0,0,0,0.5);}
        .fp-sidebar{padding:16px;display:flex;flex-direction:column;min-height:0;overflow:hidden;}
        .fp-main{overflow-y:auto;padding:0;}
        .fp-brandRow{display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;}
        .fp-brand{font-size:15px;font-weight:950;letter-spacing:-0.02em;background:linear-gradient(90deg,#5aa8ff,#5fe3ff);-webkit-background-clip:text;background-clip:text;color:transparent;}
        .fp-homeBtn{width:28px;height:28px;border-radius:9px;border:1px solid rgba(255,255,255,0.1);background:rgba(255,255,255,0.04);color:rgba(255,255,255,0.6);display:grid;place-items:center;cursor:pointer;transition:all 130ms;flex-shrink:0;}
        .fp-homeBtn:hover{background:rgba(95,227,255,0.1);border-color:rgba(95,227,255,0.3);color:#5fe3ff;}
        .fp-sectionLabel{font-size:10px;font-weight:900;letter-spacing:0.1em;text-transform:uppercase;color:rgba(255,255,255,0.4);margin-bottom:6px;}
        .pu-sideNav{margin-top:8px;display:flex;flex-direction:column;gap:6px;}
        .pu-sideItem{display:flex;align-items:center;gap:12px;padding:10px 12px;border-radius:14px;border:1px solid rgba(255,255,255,0.08);background:rgba(10,12,18,0.2);cursor:pointer;user-select:none;text-decoration:none;color:rgba(255,255,255,0.88);transition:transform 140ms ease,background 140ms ease,border-color 140ms ease;position:relative;overflow:hidden;}
        .pu-sideItem:hover{background:rgba(255,255,255,0.04);border-color:rgba(95,227,255,0.18);transform:translateY(-1px);}
        .pu-sideItem.active{border-color:rgba(95,227,255,0.26);background:rgba(255,255,255,0.05);}
        .pu-sideItem.active::before{content:"";position:absolute;left:10px;top:10px;bottom:10px;width:3px;border-radius:999px;background:linear-gradient(180deg,#5fe3ff,#5aa8ff);}
        .pu-sideIcon{width:18px;height:18px;display:grid;place-items:center;color:rgba(255,255,255,0.72);flex-shrink:0;}
        .pu-sideLabel{font-size:12px;font-weight:900;color:rgba(255,255,255,0.88);}
        .fp-search{margin-top:4px;width:100%;box-sizing:border-box;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:8px 12px;font-size:12px;color:rgba(255,255,255,0.85);outline:none;}
        .fp-search::placeholder{color:rgba(255,255,255,0.35);}
        .fp-list{flex:1;overflow-y:auto;display:flex;flex-direction:column;gap:4px;margin-top:8px;}
        .fp-thread{padding:10px 12px;border-radius:12px;border:1px solid rgba(255,255,255,0.06);background:rgba(255,255,255,0.02);cursor:pointer;transition:all 130ms;}
        .fp-thread:hover{background:rgba(255,255,255,0.05);border-color:rgba(95,227,255,0.18);}
        .fp-thread.active{border-color:rgba(95,227,255,0.3);background:rgba(95,227,255,0.06);}
        .fp-threadTitle{font-size:12px;font-weight:800;color:rgba(255,255,255,0.88);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
        .fp-threadSub{font-size:10px;color:rgba(255,255,255,0.42);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
        .fp-empty{font-size:12px;color:rgba(255,255,255,0.4);padding:12px 0;text-align:center;line-height:1.5;}
        .fp-newChat{width:100%;margin-top:10px;height:36px;border-radius:12px;border:1px dashed rgba(255,255,255,0.18);background:rgba(255,255,255,0.03);color:rgba(255,255,255,0.72);font-size:12px;font-weight:800;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px;transition:all 130ms;}
        .fp-newChat:hover{background:rgba(95,227,255,0.06);border-color:rgba(95,227,255,0.35);color:rgba(255,255,255,0.92);}

        /* Select / generating state */
        .fp-selectState{display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;gap:16px;padding:40px;text-align:center;}
        .fp-selectIcon{font-size:48px;line-height:1;}
        .fp-selectTitle{font-size:22px;font-weight:950;letter-spacing:-0.02em;color:rgba(255,255,255,0.94);}
        .fp-selectSub{font-size:14px;color:rgba(255,255,255,0.55);line-height:1.6;max-width:420px;}
        .fp-error{font-size:13px;color:#ff6b6b;padding:10px 16px;border-radius:12px;border:1px solid rgba(255,107,107,0.2);background:rgba(255,107,107,0.07);}
        .fp-configPanel{display:flex;flex-direction:column;gap:14px;margin-top:4px;width:100%;max-width:400px;}
        .fp-countRow{display:flex;flex-direction:column;align-items:center;gap:8px;}
        .fp-countLabel{font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:0.08em;color:rgba(255,255,255,0.5);}
        .fp-countBtns{display:flex;gap:8px;flex-wrap:wrap;justify-content:center;}
        .fp-countBtn{height:34px;padding:0 16px;border-radius:999px;border:1px solid rgba(255,255,255,0.12);background:rgba(255,255,255,0.04);color:rgba(255,255,255,0.82);font-size:13px;font-weight:800;cursor:pointer;transition:all 130ms;}
        .fp-countBtn.active{background:rgba(95,227,255,0.14);border-color:rgba(95,227,255,0.4);color:#5fe3ff;}
        .fp-countBtn.active.diff-easy{background:rgba(95,200,95,0.14);border-color:rgba(95,200,95,0.4);color:#5fc85f;}
        .fp-countBtn.active.diff-medium{background:rgba(255,200,90,0.14);border-color:rgba(255,200,90,0.4);color:#ffc85a;}
        .fp-countBtn.active.diff-hard{background:rgba(255,107,107,0.14);border-color:rgba(255,107,107,0.4);color:#ff6b6b;}
        .fp-diff-easy{color:#5fc85f !important;}
        .fp-diff-medium{color:#ffc85a !important;}
        .fp-diff-hard{color:#ff6b6b !important;}
        .fp-spinner{width:36px;height:36px;border-radius:50%;border:3px solid rgba(255,255,255,0.1);border-top-color:#5aa8ff;animation:spin 0.8s linear infinite;}
        @keyframes spin{to{transform:rotate(360deg)}}

        /* Workspace */
        .fp-workspace{padding:24px;display:flex;flex-direction:column;gap:18px;}
        .fp-wsHeader{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;}
        .fp-wsEyebrow{font-size:10px;font-weight:900;letter-spacing:0.1em;text-transform:uppercase;color:rgba(255,255,255,0.45);}
        .fp-wsTitle{font-size:20px;font-weight:950;letter-spacing:-0.02em;color:rgba(255,255,255,0.94);margin-top:4px;}
        .fp-backBtn{flex-shrink:0;height:34px;padding:0 16px;border-radius:999px;border:1px solid rgba(255,255,255,0.12);background:rgba(255,255,255,0.04);color:rgba(255,255,255,0.8);font-size:12px;font-weight:800;cursor:pointer;white-space:nowrap;}
        .fp-backBtn:hover{background:rgba(255,255,255,0.07);border-color:rgba(95,227,255,0.22);}
        .fp-statsRow{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;}
        .fp-stat{padding:14px 16px;border-radius:14px;border:1px solid rgba(255,255,255,0.08);background:rgba(255,255,255,0.03);}
        .fp-statVal{font-size:22px;font-weight:950;color:rgba(255,255,255,0.94);letter-spacing:-0.02em;}
        .fp-statKey{font-size:11px;font-weight:700;color:rgba(255,255,255,0.48);margin-top:3px;}
        .fp-progressBar{display:flex;flex-direction:column;gap:6px;}
        .fp-progressLabel{font-size:11px;font-weight:700;color:rgba(255,255,255,0.5);}
        .fp-progressTrack{height:5px;border-radius:999px;background:rgba(255,255,255,0.08);overflow:hidden;}
        .fp-progressFill{height:100%;border-radius:999px;background:linear-gradient(90deg,#5aa8ff,#5fe3ff);transition:width 300ms ease;}

        /* Card */
        .fp-card{cursor:pointer;perspective:1000px;height:260px;flex-shrink:0;}
        .fp-cardInner{position:relative;width:100%;height:100%;transform-style:preserve-3d;transition:transform 400ms cubic-bezier(.4,0,.2,1);}
        .fp-card.flipped .fp-cardInner{transform:rotateY(180deg);}
        .fp-face{position:absolute;inset:0;border-radius:18px;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:28px;text-align:center;backface-visibility:hidden;-webkit-backface-visibility:hidden;}
        .fp-front{border:1px solid rgba(255,255,255,0.1);background:rgba(15,18,28,0.7);}
        .fp-back{border:1px solid rgba(90,168,255,0.25);background:rgba(10,16,35,0.75);transform:rotateY(180deg);}
        .fp-faceLabel{font-size:10px;font-weight:900;letter-spacing:0.12em;text-transform:uppercase;color:rgba(255,255,255,0.4);position:absolute;top:16px;left:20px;}
        .fp-faceText{font-size:20px;font-weight:800;color:rgba(255,255,255,0.94);line-height:1.4;letter-spacing:-0.01em;}
        .fp-tapHint{font-size:11px;color:rgba(255,255,255,0.3);position:absolute;bottom:14px;}

        /* Controls */
        .fp-controls{display:flex;align-items:center;justify-content:center;gap:8px;flex-wrap:wrap;}
        .fp-ctrlBtn{height:38px;padding:0 18px;border-radius:999px;border:1px solid rgba(255,255,255,0.12);background:rgba(255,255,255,0.04);color:rgba(255,255,255,0.82);font-size:12px;font-weight:800;cursor:pointer;transition:all 130ms;white-space:nowrap;}
        .fp-ctrlBtn:hover:not(:disabled){background:rgba(255,255,255,0.07);border-color:rgba(95,227,255,0.22);transform:translateY(-1px);}
        .fp-ctrlBtn:disabled{opacity:0.3;cursor:default;}
        .fp-ctrlPrimary{background:rgba(255,255,255,0.07);border-color:rgba(255,255,255,0.18);}
        .fp-ctrlAccent{background:linear-gradient(90deg,rgba(90,168,255,0.9),rgba(95,227,255,0.9));color:rgba(0,0,0,0.85);border-color:transparent;}

        /* Tips */
        .fp-tips{border-radius:16px;border:1px solid rgba(255,255,255,0.07);background:rgba(255,255,255,0.02);padding:18px;}
        .fp-tipsLabel{font-size:9px;font-weight:900;letter-spacing:0.12em;text-transform:uppercase;color:#5aa8ff;margin-bottom:4px;}
        .fp-tipsTitle{font-size:14px;font-weight:900;color:rgba(255,255,255,0.88);margin-bottom:12px;}
        .fp-tipCards{display:grid;grid-template-columns:1fr 1fr;gap:8px;}
        .fp-tipCard{padding:12px 14px;border-radius:12px;border:1px solid rgba(255,255,255,0.07);background:rgba(255,255,255,0.02);}
        .fp-tipHead{font-size:12px;font-weight:900;color:rgba(255,255,255,0.85);margin-bottom:3px;}
        .fp-tipBody{font-size:11px;color:rgba(255,255,255,0.5);line-height:1.5;}
        @media(max-width:900px){.fp-root{grid-template-columns:1fr;}.fp-sidebar{display:none;}}
      `}</style>
    </>
  );
}
