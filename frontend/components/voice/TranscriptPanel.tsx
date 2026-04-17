"use client";

import { useEffect, useRef } from "react";
import type { TranscriptEntry } from "../../lib/hooks/useVoiceSession";

interface TranscriptPanelProps {
  entries: TranscriptEntry[];
  onClear?: () => void;
}

export default function TranscriptPanel({ entries, onClear }: TranscriptPanelProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new entries
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [entries]);

  if (entries.length === 0) {
    return (
      <div className="tp-empty">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="28" height="28">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
        <span>Conversation transcript will appear here</span>
        <style jsx>{`
          .tp-empty {
            flex: 1;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 10px;
            color: rgba(255,255,255,0.22);
            font-size: 12px;
            font-weight: 700;
            text-align: center;
          }
        `}</style>
      </div>
    );
  }

  return (
    <div className="tp-root">
      {onClear && entries.length > 0 && (
        <button className="tp-clear" onClick={onClear} type="button">
          Clear transcript
        </button>
      )}

      <div className="tp-scroll">
        {entries.map((entry) => (
          <div key={entry.id} className={`tp-bubble tp-${entry.role}`}>
            <div className="tp-who">
              {entry.role === "user" ? "You" : "PrepareUp AI"}
            </div>
            <div className={`tp-text${entry.partial ? " tp-partial" : ""}`}>
              {entry.text}
              {entry.partial && <span className="tp-cursor" aria-hidden>▍</span>}
            </div>
            <div className="tp-time">
              {entry.timestamp.toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
              })}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <style jsx>{`
        .tp-root {
          flex: 1;
          display: flex;
          flex-direction: column;
          min-height: 0;
          position: relative;
        }
        .tp-clear {
          position: absolute;
          top: 0;
          right: 0;
          background: none;
          border: none;
          color: rgba(255,255,255,0.28);
          font-size: 10px;
          font-weight: 800;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          cursor: pointer;
          padding: 4px 8px;
          transition: color 0.15s;
          z-index: 1;
        }
        .tp-clear:hover {
          color: rgba(255,255,255,0.55);
        }
        .tp-scroll {
          flex: 1;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          gap: 10px;
          padding: 4px 2px 8px;
          scrollbar-width: thin;
          scrollbar-color: rgba(255,255,255,0.08) transparent;
        }
        .tp-bubble {
          display: flex;
          flex-direction: column;
          gap: 4px;
          max-width: 88%;
          animation: tp-fade 0.2s ease;
        }
        @keyframes tp-fade {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .tp-user {
          align-self: flex-end;
          align-items: flex-end;
        }
        .tp-ai {
          align-self: flex-start;
          align-items: flex-start;
        }
        .tp-who {
          font-size: 9px;
          font-weight: 900;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: rgba(255,255,255,0.3);
        }
        .tp-text {
          padding: 10px 14px;
          border-radius: 16px;
          font-size: 13px;
          font-weight: 600;
          line-height: 1.55;
          color: rgba(255,255,255,0.9);
          position: relative;
        }
        .tp-user .tp-text {
          background: rgba(90,168,255,0.18);
          border: 1px solid rgba(90,168,255,0.25);
          border-bottom-right-radius: 4px;
        }
        .tp-ai .tp-text {
          background: rgba(255,255,255,0.06);
          border: 1px solid rgba(255,255,255,0.1);
          border-bottom-left-radius: 4px;
        }
        .tp-partial {
          opacity: 0.85;
        }
        .tp-cursor {
          display: inline-block;
          animation: blink 0.8s step-end infinite;
          color: rgba(95,227,255,0.8);
          margin-left: 2px;
        }
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0; }
        }
        .tp-time {
          font-size: 9px;
          font-weight: 700;
          color: rgba(255,255,255,0.2);
          letter-spacing: 0.04em;
        }
      `}</style>
    </div>
  );
}
