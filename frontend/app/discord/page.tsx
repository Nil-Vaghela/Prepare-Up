"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Sidebar from "../../components/Sidebar";
import { useAuth } from "../../lib/auth-context";
import { getDiscordStatus, getDiscordGuilds, importDiscordChannel, ingestDiscordText } from "../../lib/api";

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";

type Guild = {
  id: string;
  name: string;
  can_manage: boolean;
  installed: boolean;
  setup_status: "connected" | "can_install" | "needs_admin";
};

type Channel = {
  id: string;
  name: string;
  type: number;
  parent_id: string | null;
};

type ImportState = "idle" | "importing" | "done" | "error";

export default function DiscordPage() {
  const { accessToken } = useAuth();
  const router = useRouter();

  const [connected, setConnected] = useState(false);
  const [checking, setChecking] = useState(true);
  const [guilds, setGuilds] = useState<Guild[]>([]);
  const [loadingGuilds, setLoadingGuilds] = useState(false);
  const [botInstallUrl, setBotInstallUrl] = useState<string | null>(null);
  const [selectedGuild, setSelectedGuild] = useState<Guild | null>(null);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loadingChannels, setLoadingChannels] = useState(false);
  const [selectedChannel, setSelectedChannel] = useState<Channel | null>(null);
  const [importState, setImportState] = useState<ImportState>("idle");
  const [importError, setImportError] = useState("");
  const [importedCount, setImportedCount] = useState(0);
  const [sessionId, setSessionId] = useState<string | null>(null);

  useEffect(() => {
    // Fetch bot install URL
    fetch(`${BACKEND}/api/discord/bot/install-url`, { credentials: "include" })
      .then((r) => r.json())
      .then((d) => setBotInstallUrl(d.url))
      .catch(() => {});

    // Check if Discord is connected
    getDiscordStatus()
      .then((s) => {
        setConnected(s.connected);
        if (s.connected) loadGuilds();
      })
      .catch(() => setConnected(false))
      .finally(() => setChecking(false));

    // Check for discord=connected query param (callback from OAuth)
    const params = new URLSearchParams(window.location.search);
    if (params.get("discord") === "connected") {
      setConnected(true);
      loadGuilds();
      window.history.replaceState({}, "", "/discord");
    }
  }, []);

  const loadGuilds = async () => {
    setLoadingGuilds(true);
    try {
      const res = await getDiscordGuilds();
      setGuilds(res.guilds as Guild[]);
    } catch { /* */ }
    finally { setLoadingGuilds(false); }
  };

  const loadChannels = async (guildId: string) => {
    setLoadingChannels(true);
    setChannels([]);
    try {
      const res = await fetch(`${BACKEND}/api/discord/bot/guilds/${guildId}/channels`, {
        credentials: "include",
        headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
      });
      const data = await res.json();
      setChannels(data.channels || []);
    } catch { /* */ }
    finally { setLoadingChannels(false); }
  };

  const onSelectGuild = useCallback(async (guild: Guild) => {
    setSelectedGuild(guild);
    setSelectedChannel(null);
    if (guild.installed) {
      await loadChannels(guild.id);
    }
  }, []);

  const onImport = useCallback(async () => {
    if (!selectedChannel) return;
    setImportState("importing");
    setImportError("");
    try {
      const res = await importDiscordChannel(selectedChannel.id, 500);
      setImportedCount(res.count);
      // Ingest transcript into the session system
      const uploadRes = await ingestDiscordText(res.text, selectedChannel.name, accessToken);
      sessionStorage.setItem("pu_session_id", uploadRes.session_id);
      sessionStorage.setItem("pu_session_files", JSON.stringify(uploadRes.files));
      setSessionId(uploadRes.session_id);
      setImportState("done");
    } catch (e: unknown) {
      setImportError(e instanceof Error ? e.message : "Import failed.");
      setImportState("error");
    }
  }, [selectedChannel, accessToken]);

  const statusBadge = (s: Guild["setup_status"]) => {
    if (s === "connected") return <span className="pu-badge green">Bot installed</span>;
    if (s === "can_install") return <span className="pu-badge blue">Can install</span>;
    return <span className="pu-badge gray">Needs admin</span>;
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
                <div className="pu-eyebrow">Connect</div>
                <div className="pu-pageTitle">Discord Integration</div>
              </div>
              {connected && (
                <button
                  className="pu-btn"
                  type="button"
                  onClick={async () => {
                    await fetch(`${BACKEND}/api/discord/logout`, { method: "POST", credentials: "include" });
                    setConnected(false);
                    setGuilds([]);
                    setSelectedGuild(null);
                  }}
                >
                  Disconnect
                </button>
              )}
            </div>

            <div className="pu-content">
              {checking ? (
                <div className="pu-loadingRow">
                  <div className="pu-spinner" />
                  <span>Checking Discord connection…</span>
                </div>
              ) : !connected ? (
                /* Not connected */
                <div className="pu-connectShell">
                  <div className="pu-connectCard">
                    <div className="pu-connectIcon">
                      <svg viewBox="0 0 24 24" fill="currentColor" width="32" height="32" style={{ color: "#5865f2" }}>
                        <path d="M20 4a16.5 16.5 0 0 0-4.1-1.3l-.2.4a15.3 15.3 0 0 0-3.7 0l-.2-.4A16.5 16.5 0 0 0 4 4C1.5 7.7.8 11.3 1 14.8a17 17 0 0 0 5.1 2.6l.5-.7a11 11 0 0 1-1.7-1 10.2 10.2 0 0 0 .4.3c1.7 1 3.6 1.6 5.7 1.6s4-.6 5.7-1.6l.4-.3a11 11 0 0 1-1.7 1l.5.7a17 17 0 0 0 5.1-2.6c.3-3.6-.4-7.1-2.1-10.9ZM8.5 12.5a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3Zm7 0a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3Z" />
                      </svg>
                    </div>
                    <div className="pu-connectTitle">Connect your Discord</div>
                    <div className="pu-connectSub">
                      Import messages from your Discord servers to use as study material. Generate flashcards, study guides, and podcasts directly from your server discussions.
                    </div>
                    <a
                      href={`${BACKEND}/api/auth/discord`}
                      className="pu-btn pu-btnDiscord"
                    >
                      Connect Discord Account
                    </a>
                  </div>
                </div>
              ) : importState === "done" ? (
                /* Import complete */
                <div className="pu-successShell">
                  <div className="pu-successCard">
                    <div className="pu-successIcon">✓</div>
                    <div className="pu-successTitle">Import complete</div>
                    <div className="pu-successSub">
                      {importedCount} messages from #{selectedChannel?.name} are ready to use.
                    </div>
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
                      <button className="pu-btn" type="button" onClick={() => { setImportState("idle"); setSelectedChannel(null); }}>
                        Import another
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                /* Server + channel selection */
                <div className="pu-discordShell">
                  <div className="pu-section">
                    <div className="pu-sectionTitle">Your servers</div>
                    {loadingGuilds ? (
                      <div className="pu-loadingRow"><div className="pu-spinner" /><span>Loading servers…</span></div>
                    ) : guilds.length === 0 ? (
                      <div className="pu-emptyItem">No servers found. Make sure you share servers with PrepareUp bot.</div>
                    ) : (
                      <div className="pu-guildList">
                        {guilds.map((g) => (
                          <div
                            key={g.id}
                            className={`pu-guildRow${selectedGuild?.id === g.id ? " selected" : ""}${!g.installed ? " dimmed" : ""}`}
                            onClick={() => onSelectGuild(g)}
                          >
                            <div className="pu-guildInfo">
                              <div className="pu-guildName">{g.name}</div>
                              {statusBadge(g.setup_status)}
                            </div>
                            {!g.installed && g.can_manage && (
                              <a
                                href={botInstallUrl || "#"}
                                target="_blank"
                                rel="noopener"
                                className="pu-btn"
                                style={{ fontSize: 11, height: 30, padding: "0 12px" }}
                                onClick={(e) => e.stopPropagation()}
                              >
                                Install bot →
                              </a>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {selectedGuild && selectedGuild.installed && (
                    <div className="pu-section">
                      <div className="pu-sectionTitle">Channels in {selectedGuild.name}</div>
                      {loadingChannels ? (
                        <div className="pu-loadingRow"><div className="pu-spinner" /><span>Loading channels…</span></div>
                      ) : channels.length === 0 ? (
                        <div className="pu-emptyItem">No text channels visible to the bot.</div>
                      ) : (
                        <div className="pu-channelList">
                          {channels.map((ch) => (
                            <div
                              key={ch.id}
                              className={`pu-channelRow${selectedChannel?.id === ch.id ? " selected" : ""}`}
                              onClick={() => setSelectedChannel(ch)}
                            >
                              <span className="pu-hash">#</span>
                              <span className="pu-channelName">{ch.name}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {selectedGuild && !selectedGuild.installed && (
                    <div className="pu-section">
                      <div className="pu-infoBox">
                        <strong>Bot not installed</strong> — install the PrepareUp bot in {selectedGuild.name} to import messages.{" "}
                        {selectedGuild.can_manage ? (
                          <a href={botInstallUrl || "#"} target="_blank" rel="noopener" style={{ color: "#5fe3ff" }}>
                            Click here to install →
                          </a>
                        ) : (
                          "Ask a server admin to install the bot."
                        )}
                      </div>
                    </div>
                  )}

                  {selectedChannel && (
                    <div className="pu-section">
                      <div className="pu-importCard">
                        <div className="pu-importTitle">Import #{selectedChannel.name}</div>
                        <div className="pu-importSub">
                          Fetches up to 500 messages and converts them to study material you can use with all generation features.
                        </div>
                        {importError && <div className="pu-error">{importError}</div>}
                        <button
                          className={`pu-btn pu-btnPrimary${importState === "importing" ? " pu-btnDisabled" : ""}`}
                          disabled={importState === "importing"}
                          type="button"
                          onClick={onImport}
                        >
                          {importState === "importing" ? (
                            <><div className="pu-spinnerInline" />Importing…</>
                          ) : "Import Channel Messages"}
                        </button>
                      </div>
                    </div>
                  )}
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
        .pu-content { flex: 1; min-height: 0; overflow-y: auto; padding: 20px; }
        .pu-loadingRow { display: flex; align-items: center; gap: 10px; font-size: 13px; color: rgba(255,255,255,0.6); }
        .pu-spinner { width: 18px; height: 18px; border: 2px solid rgba(255,255,255,0.1); border-top-color: #5fe3ff; border-radius: 999px; animation: spin 0.8s linear infinite; flex-shrink: 0; }
        .pu-spinnerInline { width: 14px; height: 14px; border: 2px solid rgba(0,0,0,0.2); border-top-color: rgba(0,0,0,0.7); border-radius: 999px; animation: spin 0.8s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }
        .pu-connectShell { display: flex; align-items: center; justify-content: center; min-height: 200px; }
        .pu-connectCard { text-align: center; max-width: 420px; padding: 36px 28px; border-radius: var(--pu-radius-lg); border: 1px solid rgba(255,255,255,0.1); background: rgba(10,12,18,0.4); display: flex; flex-direction: column; align-items: center; gap: 16px; }
        .pu-connectIcon { width: 64px; height: 64px; border-radius: 18px; background: rgba(88,101,242,0.15); border: 1px solid rgba(88,101,242,0.25); display: grid; place-items: center; }
        .pu-connectTitle { font-size: 20px; font-weight: 950; color: rgba(255,255,255,0.94); }
        .pu-connectSub { font-size: 13px; color: rgba(255,255,255,0.65); line-height: 1.6; }
        .pu-discordShell { display: flex; flex-direction: column; gap: 20px; max-width: 620px; }
        .pu-section { display: flex; flex-direction: column; gap: 10px; }
        .pu-sectionTitle { font-size: 11px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.08em; color: rgba(255,255,255,0.55); }
        .pu-guildList { display: flex; flex-direction: column; gap: 8px; }
        .pu-guildRow { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 16px; border-radius: 14px; border: 1px solid rgba(255,255,255,0.08); background: rgba(255,255,255,0.03); cursor: pointer; transition: background 140ms, border-color 140ms; }
        .pu-guildRow:hover { background: rgba(255,255,255,0.05); border-color: rgba(95,227,255,0.18); }
        .pu-guildRow.selected { border-color: rgba(95,227,255,0.28); background: rgba(95,227,255,0.05); }
        .pu-guildRow.dimmed { opacity: 0.7; }
        .pu-guildInfo { display: flex; align-items: center; gap: 10px; }
        .pu-guildName { font-size: 13px; font-weight: 900; color: rgba(255,255,255,0.9); }
        .pu-badge { font-size: 10px; font-weight: 900; padding: 2px 8px; border-radius: 999px; }
        .pu-badge.green { background: rgba(95,227,100,0.12); color: #5fe364; border: 1px solid rgba(95,227,100,0.2); }
        .pu-badge.blue { background: rgba(90,168,255,0.12); color: #5aa8ff; border: 1px solid rgba(90,168,255,0.2); }
        .pu-badge.gray { background: rgba(255,255,255,0.06); color: rgba(255,255,255,0.5); border: 1px solid rgba(255,255,255,0.1); }
        .pu-channelList { display: flex; flex-direction: column; gap: 6px; }
        .pu-channelRow { display: flex; align-items: center; gap: 8px; padding: 10px 14px; border-radius: 12px; border: 1px solid rgba(255,255,255,0.07); background: rgba(255,255,255,0.02); cursor: pointer; transition: background 120ms, border-color 120ms; }
        .pu-channelRow:hover { background: rgba(255,255,255,0.04); }
        .pu-channelRow.selected { border-color: rgba(95,227,255,0.25); background: rgba(95,227,255,0.05); }
        .pu-hash { color: rgba(255,255,255,0.4); font-size: 14px; }
        .pu-channelName { font-size: 13px; font-weight: 700; color: rgba(255,255,255,0.85); }
        .pu-infoBox { padding: 14px 16px; border-radius: 14px; border: 1px solid rgba(255,183,77,0.2); background: rgba(255,183,77,0.06); font-size: 13px; line-height: 1.6; color: rgba(255,255,255,0.75); }
        .pu-importCard { padding: 20px; border-radius: 18px; border: 1px solid rgba(95,227,255,0.15); background: rgba(10,12,18,0.4); display: flex; flex-direction: column; gap: 14px; }
        .pu-importTitle { font-size: 16px; font-weight: 950; color: rgba(255,255,255,0.92); }
        .pu-importSub { font-size: 13px; color: rgba(255,255,255,0.65); line-height: 1.6; }
        .pu-emptyItem { font-size: 13px; color: rgba(255,255,255,0.5); padding: 14px; border-radius: 12px; border: 1px solid rgba(255,255,255,0.07); background: rgba(255,255,255,0.02); }
        .pu-successShell { display: flex; align-items: center; justify-content: center; min-height: 200px; }
        .pu-successCard { text-align: center; max-width: 480px; padding: 32px; border-radius: var(--pu-radius-lg); border: 1px solid rgba(95,227,255,0.18); background: rgba(10,12,18,0.4); }
        .pu-successIcon { width: 52px; height: 52px; border-radius: 999px; background: linear-gradient(135deg, #5aa8ff, #5fe3ff); display: grid; place-items: center; margin: 0 auto 14px; font-size: 20px; color: rgba(0,0,0,0.9); font-weight: 900; }
        .pu-successTitle { font-size: 20px; font-weight: 950; color: rgba(255,255,255,0.94); margin-bottom: 8px; }
        .pu-successSub { font-size: 13px; color: rgba(255,255,255,0.65); margin-bottom: 20px; }
        .pu-nextBtns { display: flex; gap: 10px; flex-wrap: wrap; justify-content: center; }
        .pu-error { font-size: 13px; color: #ff6b6b; padding: 12px 16px; border-radius: 14px; border: 1px solid rgba(255,107,107,0.2); background: rgba(255,107,107,0.06); }
        .pu-btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; height: 40px; padding: 0 18px; border-radius: 999px; border: 1px solid rgba(255,255,255,0.12); background: rgba(255,255,255,0.04); color: rgba(255,255,255,0.92); font-size: 12px; font-weight: 900; cursor: pointer; transition: transform 160ms ease, background 160ms ease; white-space: nowrap; text-decoration: none; }
        .pu-btn:hover { transform: translateY(-1px); background: rgba(255,255,255,0.06); border-color: rgba(95,227,255,0.22); }
        .pu-btnPrimary { background: linear-gradient(90deg, rgba(90,168,255,0.95), rgba(95,227,255,0.95)); color: rgba(0,0,0,0.9); border-color: transparent; }
        .pu-btnDiscord { background: #5865f2; color: white; border-color: transparent; font-size: 13px; height: 44px; }
        .pu-btnDisabled { opacity: 0.4; cursor: not-allowed; transform: none !important; }
        @media (max-width: 720px) { .pu-shell { grid-template-columns: 1fr; } }
      `}</style>
    </>
  );
}
