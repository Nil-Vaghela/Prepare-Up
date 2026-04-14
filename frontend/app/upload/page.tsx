"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Sidebar from "../../components/Sidebar";
import { useAuth } from "../../lib/auth-context";
import { uploadFiles, UploadedFile } from "../../lib/api";

type LocalFile = { id: string; file: File };

function formatBytes(bytes: number) {
  if (!bytes) return "0 B";
  const k = 1024;
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${units[i]}`;
}

export default function UploadPage() {
  const { accessToken } = useAuth();
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement | null>(null);

  const [files, setFiles] = useState<LocalFile[]>([]);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ session_id: string; files: UploadedFile[] } | null>(null);

  const addFiles = useCallback((incoming: FileList | null) => {
    if (!incoming) return;
    const arr = Array.from(incoming).map((f) => ({ id: crypto.randomUUID(), file: f }));
    setFiles((prev) => {
      const names = new Set(prev.map((x) => x.file.name));
      return [...prev, ...arr.filter((a) => !names.has(a.file.name))];
    });
  }, []);

  const removeFile = (id: string) => setFiles((prev) => prev.filter((f) => f.id !== id));

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      addFiles(e.dataTransfer.files);
    },
    [addFiles]
  );

  const onUpload = async () => {
    if (!files.length) return;
    setUploading(true);
    setError("");
    try {
      const res = await uploadFiles(files.map((f) => f.file), accessToken);
      setResult(res);
      // Store session in sessionStorage so other pages can pick it up
      sessionStorage.setItem("pu_session_id", res.session_id);
      sessionStorage.setItem("pu_session_files", JSON.stringify(res.files));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
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
                <div className="pu-eyebrow">Step 1</div>
                <div className="pu-pageTitle">Upload Study Material</div>
              </div>
            </div>

            <div className="pu-content">
              {!result ? (
                <div className="pu-uploadShell">
                  {/* Drop zone */}
                  <div
                    className={`pu-dropzone${dragging ? " dragging" : ""}`}
                    onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                    onDragLeave={() => setDragging(false)}
                    onDrop={onDrop}
                    onClick={() => inputRef.current?.click()}
                  >
                    <input
                      ref={inputRef}
                      type="file"
                      multiple
                      accept=".pdf,.docx,.pptx,.txt,.md,.csv,.json,.log,.html"
                      style={{ display: "none" }}
                      onChange={(e) => addFiles(e.target.files)}
                    />
                    <div className="pu-dropIcon">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" width="36" height="36">
                        <path d="M12 16V4" />
                        <path d="M8 8l4-4 4 4" />
                        <path d="M4 20h16" />
                      </svg>
                    </div>
                    <div className="pu-dropTitle">
                      {dragging ? "Drop files here" : "Drop files or click to browse"}
                    </div>
                    <div className="pu-dropSub">PDF, DOCX, PPTX, TXT, MD · Max 25 MB per file</div>
                  </div>

                  {/* File list */}
                  {files.length > 0 && (
                    <div className="pu-fileList">
                      <div className="pu-sectionLabel">Ready to upload</div>
                      {files.map(({ id, file }) => (
                        <div key={id} className="pu-fileRow">
                          <div className="pu-fileName">{file.name}</div>
                          <div className="pu-fileSize">{formatBytes(file.size)}</div>
                          <button
                            className="pu-removeBtn"
                            type="button"
                            onClick={() => removeFile(id)}
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {error && <div className="pu-error">{error}</div>}

                  <div className="pu-actions">
                    <button
                      className={`pu-btn pu-btnPrimary${!files.length || uploading ? " pu-btnDisabled" : ""}`}
                      disabled={!files.length || uploading}
                      onClick={onUpload}
                      type="button"
                    >
                      {uploading ? "Uploading…" : `Upload ${files.length ? `${files.length} file${files.length > 1 ? "s" : ""}` : ""}`}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="pu-successShell">
                  <div className="pu-successCard">
                    <div className="pu-successIcon">✓</div>
                    <div className="pu-successTitle">Upload complete</div>
                    <div className="pu-successSub">
                      {result.files.length} file{result.files.length > 1 ? "s" : ""} processed successfully.
                      Your content is ready to use.
                    </div>

                    <div className="pu-fileList" style={{ marginTop: 16 }}>
                      {result.files.map((f) => (
                        <div key={f.id} className="pu-fileRow">
                          <div className="pu-fileName">{f.name}</div>
                          <div className={`pu-fileStatus ${f.status}`}>
                            {f.status === "extracted" ? "✓ Extracted" :
                             f.status === "needs_ocr" ? "⚠ Needs OCR" :
                             f.status}
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="pu-nextActions">
                      <div className="pu-nextLabel">Now generate:</div>
                      <div className="pu-nextBtns">
                        <button className="pu-btn pu-btnPrimary" type="button" onClick={() => router.push("/flashcard")}>
                          Flashcards
                        </button>
                        <button className="pu-btn pu-btnPrimary" type="button" onClick={() => router.push("/studyguide")}>
                          Study Guide
                        </button>
                        <button className="pu-btn pu-btnPrimary" type="button" onClick={() => router.push("/podcast")}>
                          Podcast
                        </button>
                        <button className="pu-btn" type="button" onClick={() => router.push("/dashboard")}>
                          Back to Dashboard
                        </button>
                      </div>
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
          --pu-bg: #07070b;
          --pu-text: rgba(255,255,255,0.92);
          --pu-muted: rgba(255,255,255,0.62);
          --pu-accent-1: #5aa8ff;
          --pu-accent-2: #5fe3ff;
          --pu-radius-lg: 22px;
          --pu-radius-md: 18px;
          --pu-border: rgba(255,255,255,0.1);
          --pu-shadow: 0 18px 60px rgba(0,0,0,0.46);
          --pu-shadow-soft: 0 10px 26px rgba(0,0,0,0.28);
          --pu-font-sans: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        }
        .pu-bg { position: fixed; inset: 0; z-index: 0; background: var(--pu-bg); }
        .pu-vignette { position: fixed; inset: 0; z-index: 1; pointer-events: none; background: radial-gradient(80% 70% at 50% 35%, rgba(90,168,255,0), rgba(0,0,0,0.55)); }
        .pu-root { position: relative; height: 100vh; padding: 14px; overflow: hidden; color: var(--pu-text); font-family: var(--pu-font-sans); -webkit-font-smoothing: antialiased; }
        .pu-shell { position: relative; z-index: 2; height: 100%; display: grid; grid-template-columns: 240px 1fr; gap: 14px; min-width: 0; }
        .pu-glass { position: relative; border-radius: var(--pu-radius-lg); border: 1px solid var(--pu-border); background: rgba(10,12,18,0.36); -webkit-backdrop-filter: blur(14px) saturate(140%); backdrop-filter: blur(14px) saturate(140%); box-shadow: var(--pu-shadow); overflow: hidden; }
        .pu-glass::before { content: ""; position: absolute; inset: 0; pointer-events: none; z-index: 1; background: radial-gradient(60% 40% at 28% 10%, rgba(255,255,255,0.1), rgba(255,255,255,0) 60%), radial-gradient(50% 36% at 86% 12%, rgba(95,227,255,0.1), rgba(0,0,0,0) 62%); opacity: 0.22; }
        .pu-glass > * { position: relative; z-index: 2; }
        .pu-main { display: flex; flex-direction: column; overflow: hidden; min-width: 0; }
        .pu-topbar { padding: 18px 20px; border-bottom: 1px solid rgba(255,255,255,0.06); }
        .pu-eyebrow { font-size: 10px; font-weight: 900; letter-spacing: 0.1em; text-transform: uppercase; color: rgba(255,255,255,0.5); }
        .pu-pageTitle { font-size: 20px; font-weight: 950; letter-spacing: -0.02em; color: rgba(255,255,255,0.94); margin-top: 4px; }
        .pu-content { flex: 1; min-height: 0; overflow-y: auto; padding: 20px; }
        .pu-sectionLabel { font-size: 10px; font-weight: 900; letter-spacing: 0.1em; text-transform: uppercase; color: rgba(255,255,255,0.48); margin-bottom: 10px; }
        .pu-uploadShell { max-width: 620px; margin: 0 auto; display: flex; flex-direction: column; gap: 20px; }
        .pu-dropzone { border: 2px dashed rgba(255,255,255,0.16); border-radius: var(--pu-radius-lg); padding: 48px 24px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; cursor: pointer; transition: border-color 160ms ease, background 160ms ease; text-align: center; }
        .pu-dropzone:hover, .pu-dropzone.dragging { border-color: rgba(95,227,255,0.4); background: rgba(95,227,255,0.04); }
        .pu-dropIcon { color: rgba(255,255,255,0.6); }
        .pu-dropTitle { font-size: 15px; font-weight: 900; color: rgba(255,255,255,0.9); }
        .pu-dropSub { font-size: 12px; color: rgba(255,255,255,0.55); }
        .pu-fileList { display: flex; flex-direction: column; gap: 8px; }
        .pu-fileRow { display: flex; align-items: center; gap: 10px; padding: 10px 14px; border-radius: 14px; border: 1px solid rgba(255,255,255,0.08); background: rgba(255,255,255,0.03); }
        .pu-fileName { flex: 1; font-size: 13px; font-weight: 700; color: rgba(255,255,255,0.9); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .pu-fileSize { font-size: 11px; color: rgba(255,255,255,0.55); flex-shrink: 0; }
        .pu-fileStatus { font-size: 11px; flex-shrink: 0; }
        .pu-fileStatus.extracted { color: #5fe3ff; }
        .pu-fileStatus.needs_ocr { color: #ffb347; }
        .pu-fileStatus.error, .pu-fileStatus.extract_failed { color: #ff6b6b; }
        .pu-removeBtn { background: none; border: none; color: rgba(255,255,255,0.45); cursor: pointer; font-size: 13px; padding: 4px; border-radius: 6px; transition: color 140ms; flex-shrink: 0; }
        .pu-removeBtn:hover { color: rgba(255,100,100,0.9); }
        .pu-actions { display: flex; gap: 12px; }
        .pu-error { font-size: 13px; color: #ff6b6b; padding: 12px 16px; border-radius: 14px; border: 1px solid rgba(255,107,107,0.2); background: rgba(255,107,107,0.06); }
        .pu-btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; height: 40px; padding: 0 18px; border-radius: 999px; border: 1px solid rgba(255,255,255,0.12); background: rgba(255,255,255,0.04); color: rgba(255,255,255,0.92); font-size: 13px; font-weight: 900; cursor: pointer; transition: transform 160ms ease, background 160ms ease; white-space: nowrap; }
        .pu-btn:hover { transform: translateY(-1px); background: rgba(255,255,255,0.06); border-color: rgba(95,227,255,0.22); }
        .pu-btnPrimary { background: linear-gradient(90deg, rgba(90,168,255,0.95), rgba(95,227,255,0.95)); color: rgba(0,0,0,0.92); border-color: transparent; }
        .pu-btnDisabled { opacity: 0.45; cursor: not-allowed; transform: none !important; }
        .pu-successShell { display: flex; align-items: center; justify-content: center; min-height: 300px; }
        .pu-successCard { text-align: center; max-width: 520px; width: 100%; padding: 32px; border-radius: var(--pu-radius-lg); border: 1px solid rgba(95,227,255,0.2); background: rgba(10,12,18,0.4); }
        .pu-successIcon { width: 56px; height: 56px; border-radius: 999px; background: linear-gradient(135deg, #5aa8ff, #5fe3ff); display: grid; place-items: center; margin: 0 auto 16px; font-size: 22px; color: rgba(0,0,0,0.9); font-weight: 900; }
        .pu-successTitle { font-size: 22px; font-weight: 950; color: rgba(255,255,255,0.94); margin-bottom: 8px; }
        .pu-successSub { font-size: 13px; color: rgba(255,255,255,0.65); line-height: 1.6; }
        .pu-nextActions { margin-top: 20px; }
        .pu-nextLabel { font-size: 11px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.1em; color: rgba(255,255,255,0.5); margin-bottom: 12px; }
        .pu-nextBtns { display: flex; gap: 10px; flex-wrap: wrap; justify-content: center; }
        @media (max-width: 720px) { .pu-shell { grid-template-columns: 1fr; } }
      `}</style>
    </>
  );
}
