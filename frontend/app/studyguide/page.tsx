"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AnimatedBackground from "../../components/AnimatedBackground";
import { useAuth } from "../../lib/auth-context";

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";

type Thread = { id: string; title: string | null; updated_at: string; source_session_id: string | null; source_files: Array<{ name: string }> };
type Section = { heading: string; bullets: string[] };
type ViewState = "select" | "generating" | "reading";

const FEATURES: Array<{ href: string; label: string; icon: React.ReactNode }> = [
  { href: "/flashcard",     label: "Flash Cards",    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="18" height="18"><rect x="5" y="7" width="11" height="8" rx="2"/><path d="M9 5h10v8"/><path d="M8.5 10.5h4"/></svg> },
  { href: "/podcast",       label: "Podcast",        icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="18" height="18"><path d="M4 13a8 8 0 0 1 16 0"/><rect x="4" y="13" width="3.5" height="6" rx="1.5"/><rect x="16.5" y="13" width="3.5" height="6" rx="1.5"/><path d="M7.5 19a4.5 4.5 0 0 0 9 0"/></svg> },
  { href: "/mockquiz",      label: "Mock Test",      icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="18" height="18"><circle cx="12" cy="12" r="9"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg> },
  { href: "/studyguide",    label: "Study Guide",    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="18" height="18"><path d="M5.5 6.5A2.5 2.5 0 0 1 8 4h10.5v15H8a2.5 2.5 0 0 0-2.5 2.5"/><path d="M5.5 6.5V20"/><path d="M9.5 8h6"/><path d="M9.5 11h6"/></svg> },
  { href: "/voice-learning", label: "Voice Learning", icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="18" height="18"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg> },
];

function parseGuide(text: string): Section[] {
  const lines = text.split("\n");
  const sections: Section[] = [];
  let current: Section | null = null;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith("## ") || line.startsWith("# ")) {
      if (current) sections.push(current);
      current = { heading: line.replace(/^#+\s*/, ""), bullets: [] };
    } else if (line.startsWith("- ") || line.startsWith("* ") || line.startsWith("• ")) {
      if (!current) current = { heading: "Overview", bullets: [] };
      current.bullets.push(line.replace(/^[-*•]\s*/, ""));
    } else if (current) {
      // Non-bullet line under a heading — treat as a paragraph bullet
      current.bullets.push(line);
    } else {
      // Before any heading
      current = { heading: "Overview", bullets: [line] };
    }
  }
  if (current && (current.bullets.length > 0 || current.heading)) sections.push(current);
  return sections.length ? sections : [{ heading: "Study Guide", bullets: [text] }];
}

export default function StudyGuidePage() {
  const router = useRouter();
  const { accessToken, loading: authLoading } = useAuth();
  const [threads, setThreads] = useState<Thread[]>([]);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Thread | null>(null);
  const [sections, setSections] = useState<Section[]>([]);
  const [rawText, setRawText] = useState("");
  const [view, setView] = useState<ViewState>("select");
  const [error, setError] = useState("");
  const [activeSection, setActiveSection] = useState(0);

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
      const res = await fetch(`${BACKEND}/api/generate`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({ session_id: sid, output_type: "study_guide" }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.detail || "Generation failed"); }
      const data = await res.json();
      // generate endpoint returns {type: "study_guide", text: "..."}
      const text: string = data.text || data.guide || data.content || "";
      if (!text.trim()) throw new Error("The AI could not generate a study guide from this content. Make sure the chat has uploaded documents with sufficient text.");
      setRawText(text);
      setSections(parseGuide(text));
      setActiveSection(0);
      setView("reading");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Generation failed.");
      setView("select");
    }
  }, [accessToken]);

  const downloadGuide = () => {
    const blob = new Blob([rawText], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `study-guide-${selected?.title || "guide"}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <AnimatedBackground />
      <div className="sg-root">
        {/* ── Sidebar ── */}
        <aside className="sg-glass sg-sidebar">
          <div className="sg-brand" onClick={() => router.push("/dashboard")} style={{ cursor: "pointer" }}>PrepareUp</div>
          <div className="sg-sectionLabel">MAIN</div>
          <nav className="pu-sideNav">
            {FEATURES.map(f => (
              <div key={f.href} className={`pu-sideItem${f.href === "/studyguide" ? " active" : ""}`} onClick={() => router.push(f.href)}>
                <span className="pu-sideIcon">{f.icon}</span>
                <div className="pu-sideLabel">{f.label}</div>
              </div>
            ))}
          </nav>

          {view === "reading" ? (
            <>
              <div className="sg-sectionLabel" style={{ marginTop: 18 }}>INCLUDED SECTIONS</div>
              <div className="sg-list">
                {sections.map((s, i) => (
                  <div
                    key={i}
                    className={`sg-thread${activeSection === i ? " active" : ""}`}
                    onClick={() => setActiveSection(i)}
                  >
                    <div className="sg-threadTitle">{s.heading}</div>
                    <div className="sg-threadSub">{s.bullets.length} point{s.bullets.length !== 1 ? "s" : ""}</div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <>
              <button className="sg-newChat" onClick={() => router.push("/dashboard")}>
                <span>+</span> New Chat
              </button>
              <div className="sg-sectionLabel" style={{ marginTop: 14 }}>RECENTS</div>
              <input
                className="sg-search"
                placeholder="Search chats…"
                value={query}
                onChange={e => setQuery(e.target.value)}
              />
              <div className="sg-list">
                {filtered.map(t => (
                  <div
                    key={t.id}
                    className={`sg-thread${selected?.id === t.id ? " active" : ""}`}
                    onClick={() => generate(t)}
                  >
                    <div className="sg-threadTitle">{t.title || "Untitled chat"}</div>
                    <div className="sg-threadSub">{t.source_files?.map(f => f.name).join(", ") || "No files"}</div>
                  </div>
                ))}
                {!filtered.length && (
                  <div className="sg-empty">No chats yet. Upload content from the dashboard first.</div>
                )}
              </div>
            </>
          )}
        </aside>

        {/* ── Main ── */}
        <main className="sg-glass sg-main">
          {view === "select" && (
            <div className="sg-centerState">
              <div className="sg-centerIcon">≡</div>
              <div className="sg-centerTitle">Study Guide Workspace</div>
              <div className="sg-centerSub">Select a chat from the sidebar to generate a structured study guide from your notes.</div>
              {error && <div className="sg-error">{error}</div>}
            </div>
          )}

          {view === "generating" && (
            <div className="sg-centerState">
              <div className="sg-spinner" />
              <div className="sg-centerTitle">Generating study guide…</div>
              <div className="sg-centerSub">Structuring key concepts from "{selected?.title || "your chat"}"</div>
            </div>
          )}

          {view === "reading" && sections.length > 0 && (
            <div className="sg-workspace">
              {/* Header */}
              <div className="sg-wsHeader">
                <div>
                  <div className="sg-wsEyebrow">STUDY GUIDE</div>
                  <div className="sg-wsTitle">{selected?.title || "Your notes"}</div>
                </div>
                <div className="sg-headerActions">
                  <button className="sg-actionBtn" onClick={downloadGuide}>↓ Download</button>
                  <button className="sg-backBtn" onClick={() => { setView("select"); setSelected(null); }}>← Back to Chats</button>
                </div>
              </div>

              {/* Hero card */}
              <div className="sg-heroCard">
                <div className="sg-heroIcon">📚</div>
                <div className="sg-heroBody">
                  <div className="sg-heroTitle">Ready to study</div>
                  <div className="sg-heroSub">{sections.length} sections · {sections.reduce((n, s) => n + s.bullets.length, 0)} key points · Navigate sections in the sidebar</div>
                </div>
              </div>

              {/* Sections */}
              <div className="sg-sections">
                {sections.map((s, i) => (
                  <div key={i} id={`section-${i}`} className={`sg-sectionCard${activeSection === i ? " highlight" : ""}`}>
                    <div className="sg-secHeader" onClick={() => setActiveSection(activeSection === i ? -1 : i)}>
                      <div className="sg-secNum">{String(i + 1).padStart(2, "0")}</div>
                      <div className="sg-secHeading">{s.heading}</div>
                      <div className="sg-secCount">{s.bullets.length} pt</div>
                      <div className="sg-secChevron">{activeSection === i ? "▲" : "▼"}</div>
                    </div>
                    {(activeSection === i || activeSection === -1) && (
                      <ul className="sg-bullets">
                        {s.bullets.map((b, j) => (
                          <li key={j} className="sg-bullet">{b}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>

              {/* Nav buttons */}
              <div className="sg-navBtns">
                <button className="sg-ctrlBtn" disabled={activeSection <= 0} onClick={() => setActiveSection(a => Math.max(0, a - 1))}>← Previous Section</button>
                <button className="sg-ctrlBtn sg-ctrlAccent" disabled={activeSection >= sections.length - 1} onClick={() => setActiveSection(a => Math.min(sections.length - 1, a + 1))}>Next Section →</button>
              </div>
            </div>
          )}
        </main>
      </div>

      <style jsx>{`
        :global(body){margin:0;background:#07070b;}
        .sg-root{position:relative;z-index:1;display:grid;grid-template-columns:340px 1fr;gap:12px;height:100vh;padding:12px;box-sizing:border-box;font-family:ui-sans-serif,system-ui,-apple-system,sans-serif;color:rgba(255,255,255,0.92);-webkit-font-smoothing:antialiased;}
        .sg-glass{border-radius:20px;border:1px solid rgba(255,255,255,0.1);background:rgba(10,12,18,0.5);backdrop-filter:blur(18px) saturate(140%);-webkit-backdrop-filter:blur(18px) saturate(140%);box-shadow:0 20px 60px rgba(0,0,0,0.5);}
        .sg-sidebar{padding:16px;display:flex;flex-direction:column;min-height:0;overflow:hidden;}
        .sg-main{overflow-y:auto;padding:0;}
        .sg-brand{font-size:15px;font-weight:950;letter-spacing:-0.02em;background:linear-gradient(90deg,#5aa8ff,#5fe3ff);-webkit-background-clip:text;background-clip:text;color:transparent;margin-bottom:14px;}
        .sg-sectionLabel{font-size:10px;font-weight:900;letter-spacing:0.1em;text-transform:uppercase;color:rgba(255,255,255,0.4);margin-bottom:6px;}
        .pu-sideNav{margin-top:8px;display:flex;flex-direction:column;gap:6px;}
        .pu-sideItem{display:flex;align-items:center;gap:12px;padding:10px 12px;border-radius:14px;border:1px solid rgba(255,255,255,0.08);background:rgba(10,12,18,0.2);cursor:pointer;user-select:none;text-decoration:none;color:rgba(255,255,255,0.88);transition:transform 140ms ease,background 140ms ease,border-color 140ms ease;position:relative;overflow:hidden;}
        .pu-sideItem:hover{background:rgba(255,255,255,0.04);border-color:rgba(95,227,255,0.18);transform:translateY(-1px);}
        .pu-sideItem.active{border-color:rgba(95,227,255,0.26);background:rgba(255,255,255,0.05);}
        .pu-sideItem.active::before{content:"";position:absolute;left:10px;top:10px;bottom:10px;width:3px;border-radius:999px;background:linear-gradient(180deg,#5fe3ff,#5aa8ff);}
        .pu-sideIcon{width:18px;height:18px;display:grid;place-items:center;color:rgba(255,255,255,0.72);flex-shrink:0;}
        .pu-sideLabel{font-size:12px;font-weight:900;color:rgba(255,255,255,0.88);}
        .sg-search{margin-top:4px;width:100%;box-sizing:border-box;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:8px 12px;font-size:12px;color:rgba(255,255,255,0.85);outline:none;}
        .sg-search::placeholder{color:rgba(255,255,255,0.35);}
        .sg-list{flex:1;overflow-y:auto;display:flex;flex-direction:column;gap:4px;margin-top:8px;}
        .sg-thread{padding:10px 12px;border-radius:12px;border:1px solid rgba(255,255,255,0.06);background:rgba(255,255,255,0.02);cursor:pointer;transition:all 130ms;}
        .sg-thread:hover{background:rgba(255,255,255,0.05);border-color:rgba(95,227,255,0.18);}
        .sg-thread.active{border-color:rgba(95,227,255,0.3);background:rgba(95,227,255,0.06);}
        .sg-threadTitle{font-size:12px;font-weight:800;color:rgba(255,255,255,0.88);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
        .sg-threadSub{font-size:10px;color:rgba(255,255,255,0.42);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
        .sg-empty{font-size:12px;color:rgba(255,255,255,0.4);padding:12px 0;text-align:center;line-height:1.5;}
        .sg-newChat{width:100%;margin-top:10px;height:36px;border-radius:12px;border:1px dashed rgba(255,255,255,0.18);background:rgba(255,255,255,0.03);color:rgba(255,255,255,0.72);font-size:12px;font-weight:800;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px;transition:all 130ms;}
        .sg-newChat:hover{background:rgba(95,227,255,0.06);border-color:rgba(95,227,255,0.35);color:rgba(255,255,255,0.92);}
        /* Center states */
        .sg-centerState{display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;gap:16px;padding:40px;text-align:center;}
        .sg-centerIcon{font-size:48px;line-height:1;}
        .sg-centerTitle{font-size:22px;font-weight:950;letter-spacing:-0.02em;color:rgba(255,255,255,0.94);}
        .sg-centerSub{font-size:14px;color:rgba(255,255,255,0.55);line-height:1.6;max-width:420px;}
        .sg-error{font-size:13px;color:#ff6b6b;padding:10px 16px;border-radius:12px;border:1px solid rgba(255,107,107,0.2);background:rgba(255,107,107,0.07);}
        .sg-spinner{width:36px;height:36px;border-radius:50%;border:3px solid rgba(255,255,255,0.1);border-top-color:#5aa8ff;animation:spin 0.8s linear infinite;}
        @keyframes spin{to{transform:rotate(360deg)}}
        /* Workspace */
        .sg-workspace{padding:24px;display:flex;flex-direction:column;gap:18px;}
        .sg-wsHeader{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap;}
        .sg-wsEyebrow{font-size:10px;font-weight:900;letter-spacing:0.1em;text-transform:uppercase;color:rgba(255,255,255,0.45);}
        .sg-wsTitle{font-size:20px;font-weight:950;letter-spacing:-0.02em;color:rgba(255,255,255,0.94);margin-top:4px;}
        .sg-headerActions{display:flex;gap:8px;flex-shrink:0;}
        .sg-actionBtn{height:34px;padding:0 14px;border-radius:999px;border:1px solid rgba(255,255,255,0.12);background:rgba(255,255,255,0.04);color:rgba(255,255,255,0.8);font-size:12px;font-weight:800;cursor:pointer;transition:all 130ms;}
        .sg-actionBtn:hover{background:rgba(255,255,255,0.07);border-color:rgba(95,227,255,0.22);}
        .sg-backBtn{height:34px;padding:0 14px;border-radius:999px;border:1px solid rgba(255,255,255,0.12);background:rgba(255,255,255,0.04);color:rgba(255,255,255,0.8);font-size:12px;font-weight:800;cursor:pointer;transition:all 130ms;}
        .sg-backBtn:hover{background:rgba(255,255,255,0.07);border-color:rgba(95,227,255,0.22);}
        /* Hero */
        .sg-heroCard{display:flex;align-items:center;gap:16px;padding:18px 20px;border-radius:16px;border:1px solid rgba(95,227,255,0.15);background:rgba(95,227,255,0.04);}
        .sg-heroIcon{font-size:32px;flex-shrink:0;}
        .sg-heroTitle{font-size:15px;font-weight:900;color:rgba(255,255,255,0.92);}
        .sg-heroSub{font-size:12px;color:rgba(255,255,255,0.55);margin-top:3px;}
        /* Sections */
        .sg-sections{display:flex;flex-direction:column;gap:10px;}
        .sg-sectionCard{border-radius:16px;border:1px solid rgba(255,255,255,0.08);background:rgba(255,255,255,0.02);overflow:hidden;transition:border-color 200ms;}
        .sg-sectionCard.highlight{border-color:rgba(95,227,255,0.25);background:rgba(95,227,255,0.03);}
        .sg-secHeader{display:flex;align-items:center;gap:12px;padding:14px 18px;cursor:pointer;user-select:none;}
        .sg-secHeader:hover{background:rgba(255,255,255,0.02);}
        .sg-secNum{font-size:11px;font-weight:900;color:rgba(95,227,255,0.6);min-width:24px;}
        .sg-secHeading{flex:1;font-size:14px;font-weight:900;color:rgba(255,255,255,0.9);letter-spacing:-0.01em;}
        .sg-secCount{font-size:10px;font-weight:700;color:rgba(255,255,255,0.4);white-space:nowrap;}
        .sg-secChevron{font-size:10px;color:rgba(255,255,255,0.4);flex-shrink:0;}
        .sg-bullets{margin:0 0 16px 0;padding:0 18px 0 54px;display:flex;flex-direction:column;gap:8px;list-style:none;}
        .sg-bullet{font-size:13px;color:rgba(255,255,255,0.78);line-height:1.6;padding-left:18px;position:relative;}
        .sg-bullet::before{content:"•";position:absolute;left:0;color:#5aa8ff;font-size:16px;line-height:1.3;}
        /* Nav buttons */
        .sg-navBtns{display:flex;gap:10px;justify-content:center;padding:4px 0 8px;}
        .sg-ctrlBtn{height:38px;padding:0 18px;border-radius:999px;border:1px solid rgba(255,255,255,0.12);background:rgba(255,255,255,0.04);color:rgba(255,255,255,0.82);font-size:12px;font-weight:800;cursor:pointer;transition:all 130ms;white-space:nowrap;}
        .sg-ctrlBtn:hover:not(:disabled){background:rgba(255,255,255,0.07);border-color:rgba(95,227,255,0.22);transform:translateY(-1px);}
        .sg-ctrlBtn:disabled{opacity:0.3;cursor:default;}
        .sg-ctrlAccent{background:linear-gradient(90deg,rgba(90,168,255,0.9),rgba(95,227,255,0.9));color:rgba(0,0,0,0.85);border-color:transparent;}
        @media(max-width:900px){.sg-root{grid-template-columns:1fr;}.sg-sidebar{display:none;}}
      `}</style>
    </>
  );
}
