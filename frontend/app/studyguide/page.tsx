"use client";

import { useMemo, useState } from "react";

const mockSections = [
  {
    title: "Big-picture overview",
    subtitle: "Start here to understand the full topic before memorizing details.",
    body:
      "This study guide turns your selected source into a clean review flow: core ideas first, then high-yield details, then likely test points. Use it as a fast revision sheet before class, quizzes, or exams.",
  },
  {
    title: "Core concepts",
    subtitle: "The ideas you should be able to explain in simple language.",
    body:
      "Focus on understanding the main definitions, relationships, and cause-and-effect patterns in the material. If you can teach these concepts out loud without reading, you are in a strong position for both multiple-choice and short-answer questions.",
  },
  {
    title: "What to memorize",
    subtitle: "High-retention details that are likely to matter during recall.",
    bullets: [
      {
        label: "Definitions",
        text: "Know the exact meaning of the most important terms and when each one applies.",
      },
      {
        label: "Processes",
        text: "Be able to describe the order of steps clearly and identify why each step matters.",
      },
      {
        label: "Comparisons",
        text: "Practice comparing related ideas so you can quickly distinguish them under exam pressure.",
      },
    ],
  },
  {
    title: "Likely exam focus",
    subtitle: "Use this section to prioritize your review when time is limited.",
    body:
      "Spend most of your time on foundational concepts, repeated themes, and anything that connects definitions to examples. If your instructor emphasizes applications, make sure you can use the content in a scenario rather than only recognizing vocabulary.",
  },
];

export default function StudyGuidePage() {
  const [focusValue, setFocusValue] = useState("");
  const [isRefining, setIsRefining] = useState(false);
  const [appliedFocus, setAppliedFocus] = useState("");

  const studyMeta = useMemo(
    () => [
      "Study guide",
      appliedFocus ? `Focused on: ${appliedFocus}` : "Balanced review",
      "Ready to refine",
    ],
    [appliedFocus]
  );

  const onRefocus = () => {
    const value = focusValue.trim();
    if (!value) return;
    setIsRefining(true);
    window.setTimeout(() => {
      setAppliedFocus(value);
      setIsRefining(false);
    }, 500);
  };

  return (
    <>
      <div className="pu-bg" />
      <div className="pu-vignette" />

      <div className="pu-root">
        <div className="pu-shell">
          <aside className="pu-glass pu-sidebar">
            <div className="pu-brandRow">
              <div className="pu-brand">PrepareUp</div>
              <button className="pu-btn" type="button">
                Back
              </button>
            </div>

            <div className="pu-sectionLabel">Outputs</div>
            <div className="pu-sideNav">
              <div className="pu-sideItem active">
                <div className="pu-sideIcon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="18" height="18">
                    <path d="M5.5 6.5A2.5 2.5 0 0 1 8 4h10.5v15H8a2.5 2.5 0 0 0-2.5 2.5" />
                    <path d="M5.5 6.5V20" />
                    <path d="M9.5 8h6" />
                    <path d="M9.5 11h6" />
                  </svg>
                </div>
                <div className="pu-sideLabel">Study guide</div>
              </div>
              <div className="pu-sideItem">
                <div className="pu-sideIcon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="18" height="18">
                    <path d="M4 13a8 8 0 0 1 16 0" />
                    <rect x="4" y="13" width="3.5" height="6" rx="1.5" />
                    <rect x="16.5" y="13" width="3.5" height="6" rx="1.5" />
                    <path d="M7.5 19a4.5 4.5 0 0 0 9 0" />
                  </svg>
                </div>
                <div className="pu-sideLabel">Podcast</div>
              </div>
              <div className="pu-sideItem">
                <div className="pu-sideIcon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="18" height="18">
                    <rect x="5" y="7" width="11" height="8" rx="2" />
                    <path d="M9 5h10v8" />
                    <path d="M8.5 10.5h4" />
                  </svg>
                </div>
                <div className="pu-sideLabel">Flashcards</div>
              </div>
              <div className="pu-sideItem">
                <div className="pu-sideIcon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="18" height="18">
                    <path d="M8 4h8l4 4v12H8z" />
                    <path d="M16 4v4h4" />
                    <path d="M11 13h6" />
                    <path d="M11 17h6" />
                  </svg>
                </div>
                <div className="pu-sideLabel">Summary</div>
              </div>
            </div>

            <div className="pu-sectionLabel">Included sections</div>
            <div className="pu-list">
              {mockSections.map((section) => (
                <div className="pu-itemCompact" key={section.title}>
                  <div className="pu-itemTitle">{section.title}</div>
                  <div className="pu-itemSub">{section.subtitle}</div>
                </div>
              ))}
            </div>
          </aside>

          <main className="pu-glass pu-main">
            <div className="pu-topbar">
              <div>
                <div className="pu-userHint">Selected output</div>
                <div className="pu-userName">Study guide</div>
              </div>

              <div className="pu-userChip">
                <div className="pu-avatar">RP</div>
                <div>
                  <div className="pu-userHint">Workspace</div>
                  <div className="pu-userName">PrepareUp</div>
                </div>
              </div>
            </div>

            <div className="pu-content">
              <div className="pu-studyShell">
                <section className="pu-studyHero">
                  <div className="pu-studyTop">
                    <div>
                      <div className="pu-studyEyebrow">Generated from your selected chat</div>
                      <div className="pu-studyTitle">Your study guide is ready</div>
                      <div className="pu-studySub">
                        Review the guide below. If it misses the angle you care about, use the refocus area to tell us what this
                        version should emphasize, such as formulas, definitions, exam questions, examples, or concise revision.
                      </div>

                      <div className="pu-studyMetaRow">
                        {studyMeta.map((item) => (
                          <div className="pu-studyChip" key={item}>
                            {item}
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="pu-studyActions">
                      <button className="pu-btn" type="button">
                        Download
                      </button>
                      <button
                        className="pu-btn pu-btnPrimary"
                        type="button"
                        onClick={onRefocus}
                        disabled={!focusValue.trim() || isRefining}
                      >
                        {isRefining ? "Updating..." : "Refocus guide"}
                      </button>
                    </div>
                  </div>
                </section>

                <section className="pu-studyBody">
                  {mockSections.map((section) => (
                    <div className="pu-studyCard" key={section.title}>
                      <div className="pu-studySectionTitle">{section.title}</div>
                      <div className="pu-studySectionSub">{section.subtitle}</div>

                      {section.body ? <div className="pu-studyText">{section.body}</div> : null}

                      {section.bullets ? (
                        <div className="pu-studyList">
                          {section.bullets.map((bullet) => (
                            <div className="pu-studyListItem" key={bullet.label}>
                              <div className="pu-studyListLabel">{bullet.label}</div>
                              <div className="pu-studyListText">{bullet.text}</div>
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  ))}
                </section>

                <div>
                  <div className="pu-focusBar">
                    <div>
                      <textarea
                        className="pu-focusInput"
                        value={focusValue}
                        onChange={(e) => setFocusValue(e.target.value)}
                        placeholder="Didn’t like this version? Tell us what to focus on — examples, formulas, exam prep, concise revision, definitions, likely questions..."
                      />
                      <div className="pu-focusHint">
                        Example: “Focus more on key definitions and likely exam-style questions.”
                      </div>
                    </div>

                    <button
                      className={`pu-btn pu-btnPrimary ${!focusValue.trim() || isRefining ? "pu-btnDisabled" : ""}`}
                      type="button"
                      disabled={!focusValue.trim() || isRefining}
                      onClick={onRefocus}
                    >
                      {isRefining ? "Regenerating..." : "Regenerate"}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </main>
        </div>
      </div>

      <style jsx>{`
        :global(:root) {
          --pu-bg: #07070b;
          --pu-text: rgba(255, 255, 255, 0.92);
          --pu-muted: rgba(255, 255, 255, 0.62);
          --pu-accent-1: #5aa8ff;
          --pu-accent-2: #5fe3ff;
          --pu-accent-3: #7c8cff;
          --pu-font-sans: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica,
            Arial, "Apple Color Emoji", "Segoe UI Emoji";
          --pu-radius-lg: 22px;
          --pu-radius-md: 18px;
          --pu-radius-sm: 14px;
          --pu-border: rgba(255, 255, 255, 0.1);
          --pu-border-2: rgba(255, 255, 255, 0.14);
          --pu-surface: rgba(255, 255, 255, 0.03);
          --pu-surface-2: rgba(255, 255, 255, 0.045);
          --pu-shadow: 0 18px 60px rgba(0, 0, 0, 0.46);
          --pu-shadow-soft: 0 10px 26px rgba(0, 0, 0, 0.28);
        }

        .pu-bg {
          position: fixed;
          inset: 0;
          z-index: 0;
          background: var(--pu-bg);
        }

        .pu-vignette {
          position: fixed;
          inset: 0;
          z-index: 1;
          pointer-events: none;
          background: radial-gradient(80% 70% at 50% 35%, rgba(90, 168, 255, 0), rgba(0, 0, 0, 0.55));
        }

        .pu-root {
          position: relative;
          height: 100vh;
          padding: 14px;
          overflow: hidden;
          color: var(--pu-text);
          font-family: var(--pu-font-sans);
          -webkit-font-smoothing: antialiased;
          -moz-osx-font-smoothing: grayscale;
          text-rendering: optimizeLegibility;
        }

        .pu-root::after {
          content: "";
          position: fixed;
          inset: 0;
          pointer-events: none;
          z-index: 1;
          opacity: 0.1;
          background-image: radial-gradient(rgba(255, 255, 255, 0.06) 1px, transparent 1px);
          background-size: 5px 5px;
          mix-blend-mode: overlay;
        }

        .pu-shell {
          position: relative;
          z-index: 2;
          height: 100%;
          display: grid;
          grid-template-columns: 340px 1fr;
          gap: 14px;
          min-width: 0;
        }

        .pu-glass {
          position: relative;
          border-radius: var(--pu-radius-lg);
          border: 1px solid var(--pu-border);
          background: rgba(10, 12, 18, 0.36);
          -webkit-backdrop-filter: blur(14px) saturate(140%);
          backdrop-filter: blur(14px) saturate(140%);
          box-shadow: var(--pu-shadow);
          overflow: hidden;
          will-change: backdrop-filter;
        }

        @supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
          .pu-glass {
            background: rgba(10, 12, 18, 0.62);
          }
        }

        .pu-glass::before {
          content: "";
          position: absolute;
          inset: 0;
          pointer-events: none;
          z-index: 1;
          background: radial-gradient(60% 40% at 28% 10%, rgba(255, 255, 255, 0.1), rgba(255, 255, 255, 0) 60%),
            radial-gradient(50% 36% at 86% 12%, rgba(95, 227, 255, 0.1), rgba(0, 0, 0, 0) 62%);
          opacity: 0.22;
        }

        .pu-glass::after {
          content: "";
          position: absolute;
          inset: 0;
          pointer-events: none;
          z-index: 1;
          background: linear-gradient(180deg, rgba(255, 255, 255, 0.1), rgba(255, 255, 255, 0) 34%);
          opacity: 0.35;
        }

        .pu-glass > * {
          position: relative;
          z-index: 2;
        }

        .pu-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          height: 38px;
          padding: 0 14px;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.12);
          background: rgba(255, 255, 255, 0.04);
          color: rgba(255, 255, 255, 0.92);
          font-size: 12px;
          font-weight: 900;
          cursor: pointer;
          transition: transform 160ms ease, background 160ms ease, border-color 160ms ease, box-shadow 160ms ease;
          white-space: nowrap;
        }

        .pu-btn:hover {
          transform: translateY(-1px);
          background: rgba(255, 255, 255, 0.06);
          border-color: rgba(95, 227, 255, 0.22);
          box-shadow: var(--pu-shadow-soft);
        }

        .pu-btnPrimary {
          border-color: rgba(95, 227, 255, 0.16);
          background: linear-gradient(90deg, rgba(90, 168, 255, 0.95), rgba(95, 227, 255, 0.95));
          color: rgba(0, 0, 0, 0.92);
        }

        .pu-btnDisabled {
          opacity: 0.45;
          cursor: not-allowed;
          transform: none !important;
          box-shadow: none !important;
        }

        .pu-sidebar {
          padding: 14px;
          display: flex;
          flex-direction: column;
          min-height: 0;
        }

        .pu-brandRow {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
        }

        .pu-brand {
          font-weight: 950;
          letter-spacing: -0.02em;
          background: linear-gradient(90deg, var(--pu-accent-1), var(--pu-accent-2));
          -webkit-background-clip: text;
          background-clip: text;
          color: transparent;
          font-size: 14px;
        }

        .pu-sectionLabel {
          margin-top: 14px;
          font-size: 10px;
          font-weight: 900;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: rgba(255, 255, 255, 0.48);
        }

        .pu-sideNav {
          margin-top: 10px;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .pu-sideItem {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px;
          border-radius: var(--pu-radius-md);
          border: 1px solid rgba(255, 255, 255, 0.1);
          background: rgba(10, 12, 18, 0.26);
          -webkit-backdrop-filter: blur(12px) saturate(140%);
          backdrop-filter: blur(12px) saturate(140%);
          cursor: pointer;
          user-select: none;
          transition: transform 160ms ease, background 160ms ease, border-color 160ms ease, box-shadow 160ms ease;
          position: relative;
          overflow: hidden;
        }

        .pu-sideItem:hover {
          transform: translateY(-1px);
          background: rgba(255, 255, 255, 0.045);
          border-color: rgba(95, 227, 255, 0.2);
          box-shadow: var(--pu-shadow-soft);
        }

        .pu-sideItem.active {
          border-color: rgba(95, 227, 255, 0.26);
          background: rgba(255, 255, 255, 0.05);
          box-shadow: 0 24px 70px rgba(0, 0, 0, 0.4);
        }

        .pu-sideItem.active::before {
          content: "";
          position: absolute;
          left: 10px;
          top: 10px;
          bottom: 10px;
          width: 3px;
          border-radius: 999px;
          background: linear-gradient(180deg, var(--pu-accent-2), var(--pu-accent-1));
          box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.06), 0 0 24px rgba(95, 227, 255, 0.22);
        }

        .pu-sideIcon {
          width: 18px;
          height: 18px;
          display: grid;
          place-items: center;
          color: rgba(255, 255, 255, 0.72);
        }

        .pu-sideLabel {
          font-size: 12px;
          font-weight: 900;
          color: rgba(255, 255, 255, 0.88);
        }

        .pu-list {
          margin-top: 12px;
          display: flex;
          flex-direction: column;
          gap: 10px;
          overflow: auto;
          min-height: 0;
          padding-right: 6px;
        }

        .pu-itemCompact {
          padding: 10px 12px;
          border-radius: 14px;
          border: 1px solid rgba(255, 255, 255, 0.08);
          background: rgba(255, 255, 255, 0.03);
          transition: transform 140ms ease, background 140ms ease, border-color 140ms ease;
        }

        .pu-itemCompact:hover {
          background: rgba(255, 255, 255, 0.045);
          border-color: rgba(255, 255, 255, 0.14);
          transform: translateY(-1px);
        }

        .pu-itemTitle {
          font-size: 12px;
          font-weight: 900;
          color: rgba(255, 255, 255, 0.9);
        }

        .pu-itemSub {
          margin-top: 4px;
          font-size: 11px;
          color: var(--pu-muted);
        }

        .pu-main {
          display: flex;
          flex-direction: column;
          overflow: hidden;
          min-width: 0;
        }

        .pu-topbar {
          padding: 14px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.06);
        }

        .pu-userChip {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 8px 10px;
          border-radius: 14px;
          border: 1px solid rgba(255, 255, 255, 0.12);
          background: rgba(255, 255, 255, 0.03);
        }

        .pu-avatar {
          width: 30px;
          height: 30px;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.14);
          background: rgba(255, 255, 255, 0.05);
          display: grid;
          place-items: center;
          font-weight: 950;
          font-size: 12px;
          color: rgba(255, 255, 255, 0.92);
        }

        .pu-userHint {
          font-size: 10px;
          font-weight: 900;
          color: rgba(255, 255, 255, 0.6);
          text-transform: uppercase;
          line-height: 1.1;
        }

        .pu-userName {
          font-size: 11px;
          font-weight: 900;
          color: rgba(255, 255, 255, 0.92);
          line-height: 1.1;
        }

        .pu-content {
          flex: 1;
          min-height: 0;
          overflow: hidden;
          padding: 14px;
          position: relative;
        }

        .pu-studyShell {
          height: 100%;
          display: grid;
          grid-template-rows: auto 1fr auto;
          gap: 14px;
          min-height: 0;
        }

        .pu-studyHero {
          padding: 18px;
          border-radius: var(--pu-radius-lg);
          border: 1px solid rgba(255, 255, 255, 0.1);
          background: rgba(10, 12, 18, 0.3);
          -webkit-backdrop-filter: blur(16px) saturate(140%);
          backdrop-filter: blur(16px) saturate(140%);
          box-shadow: var(--pu-shadow-soft);
          position: relative;
          overflow: hidden;
        }

        .pu-studyHero::before {
          content: "";
          position: absolute;
          inset: 0;
          pointer-events: none;
          background: radial-gradient(58% 42% at 18% 12%, rgba(255, 255, 255, 0.1), rgba(255, 255, 255, 0) 64%),
            radial-gradient(46% 34% at 86% 12%, rgba(95, 227, 255, 0.1), rgba(0, 0, 0, 0) 68%);
          opacity: 0.24;
        }

        .pu-studyHero > * {
          position: relative;
          z-index: 1;
        }

        .pu-studyTop {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 16px;
          flex-wrap: wrap;
        }

        .pu-studyEyebrow {
          font-size: 10px;
          font-weight: 900;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: rgba(255, 255, 255, 0.5);
        }

        .pu-studyTitle {
          margin-top: 8px;
          font-size: 22px;
          line-height: 1.1;
          font-weight: 950;
          letter-spacing: -0.03em;
          color: rgba(255, 255, 255, 0.94);
        }

        .pu-studySub {
          margin-top: 8px;
          max-width: 70ch;
          font-size: 13px;
          line-height: 1.6;
          color: rgba(255, 255, 255, 0.68);
        }

        .pu-studyMetaRow {
          margin-top: 14px;
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
        }

        .pu-studyChip {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          height: 32px;
          padding: 0 12px;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.12);
          background: rgba(255, 255, 255, 0.04);
          color: rgba(255, 255, 255, 0.82);
          font-size: 11px;
          font-weight: 900;
        }

        .pu-studyActions {
          display: flex;
          align-items: center;
          gap: 10px;
          flex-wrap: wrap;
        }

        .pu-studyBody {
          min-height: 0;
          overflow: auto;
          padding-right: 6px;
          display: grid;
          gap: 14px;
        }

        .pu-studyCard {
          padding: 18px;
          border-radius: var(--pu-radius-lg);
          border: 1px solid rgba(255, 255, 255, 0.1);
          background: rgba(10, 12, 18, 0.28);
          -webkit-backdrop-filter: blur(14px) saturate(140%);
          backdrop-filter: blur(14px) saturate(140%);
          box-shadow: var(--pu-shadow-soft);
        }

        .pu-studySectionTitle {
          font-size: 13px;
          font-weight: 950;
          letter-spacing: -0.01em;
          color: rgba(255, 255, 255, 0.92);
        }

        .pu-studySectionSub {
          margin-top: 6px;
          font-size: 11px;
          line-height: 1.5;
          color: rgba(255, 255, 255, 0.62);
        }

        .pu-studyText {
          margin-top: 12px;
          font-size: 14px;
          line-height: 1.7;
          color: rgba(255, 255, 255, 0.86);
          white-space: pre-wrap;
        }

        .pu-studyList {
          margin-top: 12px;
          display: grid;
          gap: 10px;
        }

        .pu-studyListItem {
          padding: 12px 14px;
          border-radius: 16px;
          border: 1px solid rgba(255, 255, 255, 0.08);
          background: rgba(255, 255, 255, 0.03);
        }

        .pu-studyListLabel {
          font-size: 12px;
          font-weight: 900;
          color: rgba(255, 255, 255, 0.9);
        }

        .pu-studyListText {
          margin-top: 6px;
          font-size: 13px;
          line-height: 1.6;
          color: rgba(255, 255, 255, 0.74);
        }

        .pu-focusBar {
          display: grid;
          grid-template-columns: 1fr auto;
          gap: 10px;
          align-items: center;
          padding: 14px;
          border-radius: var(--pu-radius-md);
          border: 1px solid rgba(255, 255, 255, 0.12);
          background: rgba(10, 12, 18, 0.3);
          -webkit-backdrop-filter: blur(14px) saturate(140%);
          backdrop-filter: blur(14px) saturate(140%);
        }

        .pu-focusInput {
          width: 100%;
          min-height: 44px;
          max-height: 120px;
          padding: 12px 14px;
          border-radius: 16px;
          border: 1px solid rgba(255, 255, 255, 0.12);
          background: rgba(255, 255, 255, 0.04);
          color: rgba(255, 255, 255, 0.92);
          font-size: 13px;
          line-height: 1.5;
          outline: none;
          resize: vertical;
        }

        .pu-focusInput::placeholder {
          color: rgba(255, 255, 255, 0.42);
        }

        .pu-focusHint {
          margin-top: 8px;
          font-size: 11px;
          color: rgba(255, 255, 255, 0.56);
        }

        @media (max-width: 980px) {
          .pu-shell {
            grid-template-columns: 1fr;
          }

          .pu-sidebar {
            display: none;
          }

          .pu-studyTop {
            flex-direction: column;
          }

          .pu-focusBar {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </>
  );
}
