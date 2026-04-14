"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import AnimatedBackground from "../../components/AnimatedBackground";
import { useAuth } from "../../lib/auth-context";

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";

type Thread = { id: string; title: string | null; updated_at: string; source_session_id: string | null; source_files: Array<{ name: string }> };
type Card = { front: string; back: string };
type ViewState = "select" | "generating" | "studying";

const FEATURES = [
  { href: "/flashcard", label: "Flash Cards",  icon: "⊞" },
  { href: "/podcast",   label: "Podcast",      icon: "🎙" },
  { href: "/mockquiz",  label: "Mock Test",    icon: "✎" },
  { href: "/studyguide",label: "Study Guide",  icon: "≡" },
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
        body: JSON.stringify({ session_id: sid, output_type: "flash_card", count: cardCount }),
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
  }, [cardCount, accessToken]);

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
          <div className="fp-brand" onClick={() => router.push("/dashboard")} style={{ cursor: "pointer" }}>PrepareUp</div>
          <div className="fp-sectionLabel">MAIN</div>
          <nav className="fp-nav">
            {FEATURES.map(f => (
              <div key={f.href} className={`fp-navItem${f.href === "/flashcard" ? " active" : ""}`} onClick={() => router.push(f.href)}>
                <span className="fp-navIcon">{f.icon}</span>
                <span>{f.label}</span>
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
              <div className="fp-countRow">
                <span className="fp-countLabel">Cards to generate</span>
                <div className="fp-countBtns">
                  {[5, 10, 15, 20].map(n => (
                    <button key={n} className={`fp-countBtn${cardCount === n ? " active" : ""}`} onClick={() => setCardCount(n)}>{n}</button>
                  ))}
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
                <button className="fp-backBtn" onClick={() => { setView("select"); setSelected(null); }}>Back to Chats</button>
              </div>

              {/* Stats row */}
              <div className="fp-statsRow">
                <div className="fp-stat"><div className="fp-statVal">{displayCards.length}</div><div className="fp-statKey">Cards</div></div>
                <div className="fp-stat"><div className="fp-statVal">Medium</div><div className="fp-statKey">Difficulty</div></div>
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
        .fp-root{position:relative;z-index:1;display:grid;grid-template-columns:240px 1fr;gap:12px;height:100vh;padding:12px;box-sizing:border-box;font-family:ui-sans-serif,system-ui,-apple-system,sans-serif;color:rgba(255,255,255,0.92);-webkit-font-smoothing:antialiased;}
        .fp-glass{border-radius:20px;border:1px solid rgba(255,255,255,0.1);background:rgba(10,12,18,0.5);backdrop-filter:blur(18px) saturate(140%);-webkit-backdrop-filter:blur(18px) saturate(140%);box-shadow:0 20px 60px rgba(0,0,0,0.5);}
        .fp-sidebar{padding:16px;display:flex;flex-direction:column;min-height:0;overflow:hidden;}
        .fp-main{overflow-y:auto;padding:0;}
        .fp-brand{font-size:15px;font-weight:950;letter-spacing:-0.02em;background:linear-gradient(90deg,#5aa8ff,#5fe3ff);-webkit-background-clip:text;background-clip:text;color:transparent;margin-bottom:14px;}
        .fp-sectionLabel{font-size:10px;font-weight:900;letter-spacing:0.1em;text-transform:uppercase;color:rgba(255,255,255,0.4);margin-bottom:6px;}
        .fp-nav{display:flex;flex-direction:column;gap:4px;}
        .fp-navItem{display:flex;align-items:center;gap:10px;padding:9px 12px;border-radius:12px;border:1px solid transparent;cursor:pointer;font-size:13px;font-weight:700;color:rgba(255,255,255,0.75);transition:all 130ms;}
        .fp-navItem:hover{background:rgba(255,255,255,0.04);border-color:rgba(255,255,255,0.08);}
        .fp-navItem.active{background:rgba(255,255,255,0.06);border-color:rgba(95,227,255,0.25);color:rgba(255,255,255,0.95);}
        .fp-navIcon{font-size:14px;width:18px;text-align:center;}
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
        .fp-countRow{display:flex;flex-direction:column;align-items:center;gap:8px;margin-top:8px;}
        .fp-countLabel{font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:0.08em;color:rgba(255,255,255,0.5);}
        .fp-countBtns{display:flex;gap:8px;}
        .fp-countBtn{height:34px;padding:0 16px;border-radius:999px;border:1px solid rgba(255,255,255,0.12);background:rgba(255,255,255,0.04);color:rgba(255,255,255,0.82);font-size:13px;font-weight:800;cursor:pointer;transition:all 130ms;}
        .fp-countBtn.active{background:rgba(95,227,255,0.14);border-color:rgba(95,227,255,0.4);color:#5fe3ff;}
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
        @media(max-width:700px){.fp-root{grid-template-columns:1fr;}.fp-sidebar{display:none;}}
      `}</style>
    </>
  );
}
