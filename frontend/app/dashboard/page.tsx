"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import * as THREE from "three";


type DiscordConnectState = "idle" | "connecting" | "connected" | "error";

type DiscordGuild = {
  id: string;
  name: string;
  owner?: boolean;
  permissions?: string | number;
  can_manage?: boolean;
  installed?: boolean;
};

type DiscordInstallPayload = { invite_url: string; message: string };
type DiscordChannel = {
  id: string;
  name: string;
  type?: number;
  parent_id?: string | null;
};

type LocalFile = { id: string; file: File };

type UploadedFile = {
  id: string;
  name: string;
  status: "extracted" | "needs_ocr" | "error" | string;
  textLen: number;
};

type OutputType = "podcast" | "study_guide" | "narrative" | "flash_card";
type ChatRole = "user" | "ai";

type PodcastTurn = { speaker: string; text: string };

type ChatMessage = {
  id: string;
  role: ChatRole;
  title?: string;
  meta?: string;
  text: string;
  loading?: boolean;
  // Rich output fields
  outputType?: OutputType;
  // podcast
  podcastSpeakers?: [string, string];
  podcastScript?: PodcastTurn[];
  audioUrl?: string;
  audioLoading?: boolean;
  // flashcards
  flashCards?: Array<{ front: string; back: string }>;
};

type ChatSession = {
  id: string;
  title: string;
  updatedAt: number;

  backendSessionId: string | null; // from /api/upload or persisted DB source session

  uploaded: UploadedFile[];
  combinedTextLen: number;

  selectedOutput: OutputType | null;
  messages: ChatMessage[];
};

type UserProfile = {
  id?: string | null;
  email?: string | null;
  name?: string | null;
  avatar_url?: string | null;
};

// window.google type is declared in lib/auth-context.tsx

function formatBytes(bytes: number) {
  if (!bytes) return "0 B";
  const k = 1024;
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const v = bytes / Math.pow(k, i);
  return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

function isAllowed(file: File) {
  return file.size > 0;
}

export default function DashboardPage() {
  const router = useRouter();

  // Helper to build Authorization headers if accessToken exists
  const authHeaders = (token?: string | null) => {
    const t = token !== undefined ? token : accessToken;
    const h: Record<string, string> = {};
    if (t) h.Authorization = `Bearer ${t}`;
    return h;
  };

  // Silently refresh the access token from the HttpOnly refresh cookie.
  // Promise-lock ensures concurrent 401s only trigger ONE refresh, not many.
  const _refreshLockRef = useRef<Promise<string | null> | null>(null);
  const silentRefresh = async (): Promise<string | null> => {
    if (_refreshLockRef.current) return _refreshLockRef.current;
    const p = (async () => {
      try {
        const res = await fetch(`${BACKEND_BASE}/api/auth/refresh`, {
          method: "POST",
          credentials: "include",
        });
        if (!res.ok) return null;
        const data = await res.json();
        const newToken = typeof data?.access_token === "string" ? data.access_token : null;
        if (newToken) setAccessToken(newToken);
        return newToken;
      } catch {
        return null;
      } finally {
        _refreshLockRef.current = null;
      }
    })();
    _refreshLockRef.current = p;
    return p;
  };

  // Authenticated fetch that auto-refreshes on 401.
  const authFetch = async (url: string, init: RequestInit = {}): Promise<Response> => {
    const hdrs = new Headers(init.headers as HeadersInit);
    if (accessToken) hdrs.set("Authorization", `Bearer ${accessToken}`);

    const res = await fetch(url, { ...init, headers: hdrs, credentials: "include" });

    if (res.status === 401) {
      // Token may be expired — try a silent refresh and retry once
      const newToken = await silentRefresh();
      if (newToken) {
        hdrs.set("Authorization", `Bearer ${newToken}`);
        return fetch(url, { ...init, headers: hdrs, credentials: "include" });
      }
    }

    return res;
  };
  const [sidebarActive, setSidebarActive] = useState<"flash_cards" | "podcast" | "mock_test" | "study_guide" | null>(
    null
  );

  const onSidebarSelect = (key: "flash_cards" | "podcast" | "mock_test" | "study_guide") => {
    setSidebarActive(key);
    // Navigate to dedicated feature pages — they have their own chat-selection flow
    if (key === "flash_cards") { router.push("/flashcard");  return; }
    if (key === "podcast")     { router.push("/podcast");    return; }
    if (key === "mock_test")   { router.push("/mockquiz");   return; }
    if (key === "study_guide") { router.push("/studyguide"); return; }
  };

  // Background mount
  const bgMountRef = useRef<HTMLDivElement | null>(null);

  // Upload state (in-memory only)
  const [files, setFiles] = useState<LocalFile[]>([]);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Views
  const [view, setView] = useState<"upload" | "chat">("upload");

  // Network state
  const [uploading, setUploading] = useState(false);
  const [generating, setGenerating] = useState(false);

  // Extracted sources summary
  const [uploaded, setUploaded] = useState<UploadedFile[]>([]);
  const [channelsCount] = useState(1);
  const [combinedTextLen, setCombinedTextLen] = useState<number>(0);
  // Backend session id for new API shape
  const [sessionId, setSessionId] = useState<string | null>(null);

  // Chat
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [selectedOutput, setSelectedOutput] = useState<OutputType | null>(null);
  const [sourceExpired, setSourceExpired] = useState("");
    // Auth
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string>("");
  const [gsiReady, setGsiReady] = useState(false); 

  const [authMenuOpen, setAuthMenuOpen] = useState(false);
  const [authMenuPos, setAuthMenuPos] = useState<{ top: number; left: number } | null>(null);
  const authMenuRef = useRef<HTMLDivElement | null>(null);
  const signInBtnRef = useRef<HTMLButtonElement | null>(null);
  const userChipRef = useRef<HTMLDivElement | null>(null);
  const userMenuRef = useRef<HTMLDivElement | null>(null);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [userMenuPos, setUserMenuPos] = useState<{ top: number; left: number } | null>(null);
  const gsiBtnMountRef = useRef<HTMLDivElement | null>(null);

  const isAnonymous = !(userProfile && (userProfile.id || userProfile.email));
  const chatListRef = useRef<HTMLDivElement | null>(null);
  // Real chat threads (created when the user uploads / starts chatting)
  const [recentQuery, setRecentQuery] = useState("");
  const [recentVisible, setRecentVisible] = useState(12);
  const [chatSessions, setChatSessions] = useState<ChatSession[]>([]);
  const [chatsHydrated, setChatsHydrated] = useState(false);


  useEffect(() => {
  if (!chatsHydrated) return;

  const id = activeChatIdRef.current;
  if (!id) return;
  if (!chatSessions.length) return;

  const exists = chatSessions.some((s) => s.id === id);
  if (exists) void openChatThread(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [chatsHydrated, chatSessions]);

  // Hydration-safe "now" timestamp: null on SSR + first client render, then set after mount.
  const [nowTs, setNowTs] = useState<number | null>(null);

  useEffect(() => {
    setNowTs(Date.now());
    // Optional: keep recents fresh every minute (client-only)
    const id = window.setInterval(() => setNowTs(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const activeChatIdRef = useRef<string | null>(null);

  const activeSession = useMemo(
  () => chatSessions.find((s) => s.id === activeChatId) ?? null,
  [chatSessions, activeChatId]
  );

  const effectiveSessionId = sessionId || activeSession?.backendSessionId || null;
  const canChatInCurrentThread = !!effectiveSessionId;

  /** Store session context in sessionStorage then navigate to a feature page. */
  const navigateToFeature = (route: string) => {
    try {
      const sid = effectiveSessionId || sessionId;
      if (sid) sessionStorage.setItem("pu_session_id", sid);
      if (uploaded.length > 0) {
        sessionStorage.setItem(
          "pu_session_files",
          JSON.stringify(uploaded.map((f) => ({ name: f.name })))
        );
      }
    } catch { /* sessionStorage not available */ }
    router.push(route);
  };

  const extractErrorText = (raw: string) => {
    const text = (raw || "").trim();
    if (!text) return "";

    try {
      const parsed = JSON.parse(text);
      if (typeof parsed?.detail === "string") return parsed.detail;
      if (typeof parsed?.message === "string") return parsed.message;
      if (typeof parsed?.error === "string") return parsed.error;
    } catch {
      // plain text response; ignore
    }

    return text;
  };

  const isExpiredSourceError = (status: number, body: string) => {
    if (status !== 404 && status !== 400) return false;
    const msg = extractErrorText(body).toLowerCase();
    return (
      msg.includes("session expired") ||
      msg.includes("session not found") ||
      msg.includes("not found or expired") ||
      msg.includes("source expired") ||
      msg.includes("expired")
    );
  };

  const markSourceExpired = (detail?: string) => {
    const text =
      detail ||
      "This chat history was restored, but the original uploaded source expired. Re-upload your files to continue generating or chatting.";

    setSourceExpired(text);
    setSessionId(null);
    setSelectedOutput(null);
    setSidebarActive(null);

    const nextMessages = (() => {
      const already = messages.some((m) => m.role === "ai" && m.title === "Source expired");
      if (already) return messages;

      return [
        ...messages,
        {
          id: crypto.randomUUID(),
          role: "ai" as const,
          title: "Source expired",
          text,
        },
      ];
    })();

    setMessages(nextMessages);
    upsertActiveSession({
      backendSessionId: null,
      selectedOutput: null,
      messages: nextMessages,
    });
  };
  
  const setActiveChatIdSync = (id: string | null) => {
    activeChatIdRef.current = id;
    setActiveChatId(id);
  };

  type RecentThread = { id: string; title: string; sub: string };

  const toRelativeSub = (ts: number) => {
    if (nowTs === null) return "";
    const diffMs = nowTs - ts;
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 2) return "Just now";
    if (diffMin < 60) return `${diffMin} min ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr} hr ago`;
    const diffDay = Math.floor(diffHr / 24);
    if (diffDay === 1) return "Yesterday";
    if (diffDay < 14) return `${diffDay} days ago`;
    return "Older";
  };

  const threadRecents: RecentThread[] = useMemo(() => {
    const sorted = [...chatSessions].sort((a, b) => b.updatedAt - a.updatedAt);
    return sorted.map((s) => ({ id: s.id, title: s.title, sub: toRelativeSub(s.updatedAt) }));
  }, [chatSessions]);

  const filteredRecents = useMemo(() => {
    const q = recentQuery.trim().toLowerCase();
    if (!q) return threadRecents;
    return threadRecents.filter((c) => c.title.toLowerCase().includes(q));
  }, [recentQuery, threadRecents]);

  const visibleRecents = useMemo(() => filteredRecents.slice(0, recentVisible), [filteredRecents, recentVisible]);

  const onRecentsScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    const nearBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 80;
    if (!nearBottom) return;
    setRecentVisible((v) => Math.min(v + 10, filteredRecents.length));
  };
  const startNewChat = () => {
    setActiveChatIdSync(null);
    setView("upload");

    setFiles([]);
    // Ensure file input is cleared visually as well
    if (inputRef.current) inputRef.current.value = "";
    setUploaded([]);
    setCombinedTextLen(0);
    setSessionId(null);

    setMessages([]);
    setChatInput("");
    setSelectedOutput(null);
    setSourceExpired("");

    setSidebarActive(null);
    setRecentQuery("");
    setRecentVisible(12);
  };
  const loadThreadMessages = async (threadId: string) => {
    try {
      const res = await fetch(`${BACKEND_BASE}/api/chat/threads/${encodeURIComponent(threadId)}`, {
        credentials: "include",
        headers: {
          ...authHeaders(),
        },
      });

      if (!res.ok) return null;

      const data = await res.json();
      const msgs = Array.isArray(data?.messages) ? data.messages : [];
      const sourceFiles = Array.isArray(data?.thread?.source_files) ? data.thread.source_files : [];

      const mapped: ChatMessage[] = msgs.map((m: any) => {
      const raw = typeof m?.content === "string" ? m.content : "";
      const parts = raw.split("\n");
      const first = (parts[0] || "").trim();
      const second = (parts[1] || "").trim();
      const rest = parts.slice(2).join("\n").trim();

      if (m?.role === "ai" && first === "Welcome" && second.startsWith("Sources:")) {
        return {
          id: typeof m?.id === "string" ? m.id : crypto.randomUUID(),
          role: "ai",
          title: first,
          meta: second,
          text: rest || "Pick an output above to generate first. After that, use the chat bar to refine it.",
        };
      }

      return {
        id: typeof m?.id === "string" ? m.id : crypto.randomUUID(),
        role: m?.role === "ai" ? "ai" : "user",
        text: raw,
      };
    });

      const normalizedUploaded: UploadedFile[] = sourceFiles.map((f: any) => ({
        id: typeof f?.id === "string" ? f.id : crypto.randomUUID(),
        name: typeof f?.name === "string" ? f.name : "unknown",
        status: typeof f?.status === "string" ? f.status : "extracted",
        textLen: typeof f?.textLen === "number" ? f.textLen : typeof f?.text_len === "number" ? f.text_len : 0,
      }));

      const title =
        typeof data?.thread?.title === "string" && data.thread.title.trim() ? data.thread.title.trim() : "Chat";

      const backendSessionId =
        typeof data?.thread?.source_session_id === "string" && data.thread.source_session_id.trim()
          ? data.thread.source_session_id.trim()
          : null;

      const combinedTextLen =
        typeof data?.thread?.combined_text_len === "number" ? data.thread.combined_text_len : 0;

      return {
        title,
        messages: mapped,
        backendSessionId,
        uploaded: normalizedUploaded,
        combinedTextLen,
      };
    } catch {
      return null;
    }
  };

  const persistThreadSnapshot = async (opts?: {
    forceThreadId?: string | null;
    forceTitle?: string | null;
    forceMessages?: ChatMessage[];
  }) => {
    const resolvedSessionId = effectiveSessionId;
    if (!resolvedSessionId) return null;

    const sourceMessages = opts?.forceMessages ?? messages;

    // Persist only real, non-loading messages
    const snapshot = sourceMessages
      .filter((m) => !m.loading)
      .filter((m) => m.role === "user" || m.role === "ai")
      .map((m) => ({
        role: m.role,
        content: [m.title, m.meta, m.text].filter(Boolean).join("\n"),
      }))
      .filter((m) => m.content.trim().length > 0);

    // If nothing to save, bail
    if (snapshot.length === 0) return null;

    const threadId = (opts?.forceThreadId ?? activeChatIdRef.current) || null;
    const title =
      (opts?.forceTitle ?? (uploaded?.[0]?.name ? uploaded[0].name : "Chat")) || "Chat";

    try {
      const res = await authFetch(`${BACKEND_BASE}/api/chat/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: resolvedSessionId,
          thread_id: threadId,
          thread_title: title,
          messages: snapshot,
          source_session_id: resolvedSessionId,
          source_files: uploaded,
          combined_text_len: combinedTextLen,
        }),
      });

      if (!res.ok) return null;
      const data = await res.json();
      const backendThreadId = typeof data?.thread_id === "string" ? data.thread_id : null;
      return backendThreadId;
    } catch {
      return null;
    }
  };

  const openChatThread = async (id: string) => {
    const s = chatSessions.find((x) => x.id === id);
    if (!s) return;

    setActiveChatIdSync(s.id);
    setView("chat");

    // If this thread came from DB list, it will have messages: [] until we fetch it.
    if (!s.messages || s.messages.length === 0) {
      const loaded = await loadThreadMessages(s.id);
      if (loaded) {
        const restoredSessionId = loaded.backendSessionId || s.backendSessionId || null;
        setSourceExpired("");
        setSessionId(restoredSessionId);
        setUploaded(loaded.uploaded);
        setCombinedTextLen(loaded.combinedTextLen);
        setSelectedOutput(s.selectedOutput);
        setSidebarActive(
          s.selectedOutput === "flash_card"
            ? "flash_cards"
            : s.selectedOutput === "podcast"
            ? "podcast"
            : s.selectedOutput === "study_guide"
            ? "study_guide"
            : null
        );
        setMessages(loaded.messages);
        setChatSessions((prev) =>
          prev.map((cs) =>
            cs.id === s.id
              ? {
                  ...cs,
                  title: loaded.title,
                  backendSessionId: loaded.backendSessionId,
                  uploaded: loaded.uploaded,
                  combinedTextLen: loaded.combinedTextLen,
                  messages: loaded.messages,
                  updatedAt: Date.now(),
                }
              : cs
          )
        );
        return;
      }
    }

    // fallback to local
    setUploaded(s.uploaded);
    setCombinedTextLen(s.combinedTextLen);
    setSessionId(s.backendSessionId || null);
    setSourceExpired("");

    setSelectedOutput(s.selectedOutput);
    setSidebarActive(
      s.selectedOutput === "flash_card"
        ? "flash_cards"
        : s.selectedOutput === "podcast"
        ? "podcast"
        : s.selectedOutput === "study_guide"
        ? "study_guide"
        : null
    );

    setMessages(s.messages);
  };

  const upsertActiveSession = (patch: Partial<ChatSession>) => {
    setChatSessions((prev) => {
      const now = Date.now();
      const currentId = activeChatIdRef.current;
      const hasCurrent = !!currentId && prev.some((s) => s.id === currentId);

      // If no active chat yet (or the ref is stale), create it ONLY when we have real content.
      if (!hasCurrent) {
        const nextUploaded = patch.uploaded ?? uploaded;
        const nextBackendSid = patch.backendSessionId ?? sessionId;
        const nextMessages = patch.messages ?? messages;

        const hasRealUpload = nextUploaded.length > 0 || !!nextBackendSid;
        const hasRealMessages = nextMessages.length > 0;

        // No uploads + no session + no messages = don't create a thread.
        if (!hasRealUpload && !hasRealMessages) return prev;

        const newId = crypto.randomUUID();
        const baseTitle = patch.title || (nextUploaded[0]?.name ? nextUploaded[0].name : "New chat");
        const created: ChatSession = {
          id: newId,
          title: baseTitle,
          updatedAt: now,
          backendSessionId: nextBackendSid,
          uploaded: nextUploaded,
          combinedTextLen: patch.combinedTextLen ?? combinedTextLen,
          selectedOutput: patch.selectedOutput ?? selectedOutput,
          messages: nextMessages,
        };
        setActiveChatIdSync(newId);
        return [created, ...prev];
      }

      // Patch existing
      return prev.map((s) =>
        s.id === currentId
          ? {
              ...s,
              ...patch,
              updatedAt: now,
              backendSessionId: patch.backendSessionId ?? s.backendSessionId,
              uploaded: patch.uploaded ?? s.uploaded,
              combinedTextLen: patch.combinedTextLen ?? s.combinedTextLen,
              selectedOutput: patch.selectedOutput ?? s.selectedOutput,
              messages: patch.messages ?? s.messages,
            }
          : s
      );
    });
  };

  const composerPlaceholder = sourceExpired
    ? "Source expired — re-upload files to continue..."
    : canChatInCurrentThread
    ? "Ask for changes, add sections, shorten, format, etc..."
    : "Pick Podcast / Study Guide / Narrative / Flash Card to start...";
  const shouldShowOutputPicker = useMemo(() => {
  if (view !== "chat") return false;
  if (selectedOutput) return false;
  if (!messages.length) return false;

  const meaningful = messages.filter(
    (m) =>
      !m.loading &&
      [m.title, m.meta, m.text]
        .filter(Boolean)
        .join("\n")
        .trim().length > 0
  );

  const hasWelcome = meaningful.some(
    (m) =>
      m.role === "ai" &&
      (((m.title || "").trim() === "Welcome") ||
        /Pick an output above to generate first/i.test(m.text || ""))
  );
  if (!hasWelcome) return false;

  const nonWelcomeMessages = meaningful.filter(
    (m) =>
      !(
        m.role === "ai" &&
        (((m.title || "").trim() === "Welcome") ||
          /Pick an output above to generate first/i.test(m.text || ""))
      )
  );

  return nonWelcomeMessages.length <= 1;
}, [view, selectedOutput, messages]);

  // -----------------------------
  // Discord integration
  // -----------------------------
  const BACKEND_BASE =
    process.env.NEXT_PUBLIC_BACKEND_URL ||
    (typeof window !== "undefined" ? `http://${window.location.hostname}:8000` : "http://localhost:8000");
  const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || "";

  const getGreeting = () => {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 18) return "Good afternoon";
    return "Good evening";
  };

  const getDisplayName = () => {
    const name = userProfile?.name?.trim();
    if (name) return name;

    const email = userProfile?.email?.trim();
    if (email) {
      const base = email.split("@")[0] || "";
      return base || "Unknown";
    }

    return "Unknown";
  };

  const getAvatarInitial = () => {
    const s = (userProfile?.name || userProfile?.email || "U").trim();
    return (s[0] || "U").toUpperCase();
  };

  const refreshMe = async (opts?: { allowFail?: boolean }) => {
    const allowFail = !!opts?.allowFail;

    try {
      const headers: Record<string, string> = {};
      if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

      const res = await fetch(`${BACKEND_BASE}/api/auth/me`, {
        credentials: "include",
        headers,
      });

      if (!res.ok) {
        // Do not wipe UI state on a 401 right after login.
        // Only clear if we're strict AND we truly have no auth.
        if (!allowFail && !accessToken) {
          setUserProfile(null);
          setAccessToken(null);
        }
        return;
      }

      const data = await res.json();

      // Backend may return either:
      // 1) { user: {id, display_name, avatar_url}, access_token }
      // 2) { id, display_name, avatar_url } (legacy)
      const rawUser = data?.user || data?.profile || data;

      const profile: UserProfile | null = rawUser
        ? {
            id: typeof rawUser.id === "string" ? rawUser.id : null,
            name:
              typeof rawUser.display_name === "string"
                ? rawUser.display_name
                : typeof rawUser.name === "string"
                ? rawUser.name
                : null,
            avatar_url: typeof rawUser.avatar_url === "string" ? rawUser.avatar_url : null,
            email: typeof rawUser.email === "string" ? rawUser.email : null,
          }
        : null;

      if (profile && (profile.id || profile.email)) setUserProfile(profile);
      if (typeof data?.access_token === "string" && data.access_token.trim()) setAccessToken(data.access_token);
      // Leak-proof: do not persist auth/profile to localStorage
    } catch {
      if (!allowFail && !accessToken) {
        setUserProfile(null);
        setAccessToken(null);
      }
    }
  };

  const claimAnonymousChatIfSupported = async () => {
    try {
      await fetch(`${BACKEND_BASE}/api/chat/claim`, {
        method: "POST",
        credentials: "include",
        headers: {
          ...authHeaders(),
        },
      });
    } catch {
      // ignore
    }
  };

  const completeLogin = async (idToken: string) => {
    if (!idToken) return;
    setAuthLoading(true);
    setAuthError("");

    try {
      const res = await fetch(`${BACKEND_BASE}/api/auth/google`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ id_token: idToken, idToken }),
      });

      if (!res.ok) {
        const msg = await res.text();
        throw new Error(msg || "Google login failed");
      }

      const data = await res.json();
      const token = typeof data?.access_token === "string" ? data.access_token : null;
      const profile: UserProfile | null = data?.user || data?.profile || null;

      // Fallback: if backend doesn't provide name/avatar, decode from the Google id_token
      let mergedProfile: UserProfile | null = profile;
      try {
        const parts = idToken.split(".");
        if (parts.length === 3) {
          const payloadJson = atob(parts[1].replace(/-/g, "+").replace(/_/g, "/"));
          const payload = JSON.parse(payloadJson);

          const name = typeof payload?.name === "string" ? payload.name : null;
          const email = typeof payload?.email === "string" ? payload.email : null;
          const avatar_url = typeof payload?.picture === "string" ? payload.picture : null;

          mergedProfile = {
            ...(profile || {}),
            name: (profile?.name || name) ?? null,
            email: (profile?.email || email) ?? null,
            avatar_url: (profile?.avatar_url || avatar_url) ?? null,
          };
        }
      } catch {
        // ignore
      }

      if (token) setAccessToken(token);
      setUserProfile(mergedProfile);
      setAuthMenuOpen(false);

      // Leak-proof: do not persist auth/profile to localStorage

      await refreshMe({ allowFail: true });
      await claimAnonymousChatIfSupported();
      await loadThreadsFromBackend();

      // One-time greeting message
      // Only inject into an existing thread (avoid creating a junk "New chat" when user logs in before uploading).
      const name = mergedProfile?.name || mergedProfile?.email || "there";
      const hasThread = chatSessions.length > 0 || !!activeChatIdRef.current;
      const hasContext = uploaded.length > 0 || !!sessionId || messages.length > 0;

      if (hasThread || hasContext) {
        setMessages((prev) => {
          const already = prev.some((m) => m.role === "ai" && m.title === "Welcome back");
          if (already) return prev;
          const next = [
            ...prev,
            {
              id: crypto.randomUUID(),
              role: "ai",
              title: "Welcome back",
              text: `Hi ${name}! You’re signed in — your chats can now be saved.`,
            } as ChatMessage,
          ];
          upsertActiveSession({ messages: next });
          return next;
        });
      }
    } catch (e: any) {
      setAuthError(e?.message || "Google login failed");
    } finally {
      setAuthLoading(false);
    }
  };

  const ensureGsiLoaded = async () => {
    if (typeof window === "undefined") return;
    if (!GOOGLE_CLIENT_ID) return;

    if (window.google?.accounts?.id) {
      setGsiReady(true);
      return;
    }

    const existing = document.querySelector('script[data-pu-gsi="1"]') as HTMLScriptElement | null;
    if (existing) return;

    await new Promise<void>((resolve) => {
      const s = document.createElement("script");
      s.src = "https://accounts.google.com/gsi/client";
      s.async = true;
      s.defer = true;
      s.setAttribute("data-pu-gsi", "1");
      s.onload = () => resolve();
      s.onerror = () => resolve();
      document.head.appendChild(s);
    });

    if (window.google?.accounts?.id) setGsiReady(true);
  };

  const renderGsiButton = () => {
    if (!GOOGLE_CLIENT_ID) return;
    if (!gsiBtnMountRef.current) return;

    const idApi = window.google?.accounts?.id;
    if (!idApi?.initialize || !idApi?.renderButton) return;

    gsiBtnMountRef.current.innerHTML = "";

    idApi.initialize({
      client_id: GOOGLE_CLIENT_ID,
      callback: (res: { credential?: string }) => {
        const cred = res?.credential ?? "";
        void completeLogin(cred);
      },
    });

    idApi.renderButton(gsiBtnMountRef.current, {
      theme: "outline",
      size: "large",
      type: "standard",
      text: "signin_with",
      shape: "pill",
      width: 300,
    });
  };

  useEffect(() => {
    // Leak-proof: do not load tokens/profile from localStorage.
    // Always ask backend (cookie-based session/refresh) for the current user.
    void refreshMe({ allowFail: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void ensureGsiLoaded();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [GOOGLE_CLIENT_ID]);

  useEffect(() => {
    if (!authMenuOpen) return;
    if (!gsiReady) return;
    const t = window.setTimeout(() => renderGsiButton(), 0);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authMenuOpen, gsiReady]);

  useEffect(() => {
    if (!authMenuOpen) return;

    const onDown = (e: MouseEvent) => {
      const m = authMenuRef.current;
      const b = signInBtnRef.current;
      if (!m) return;
      const t = e.target as Node;
      if (m.contains(t)) return;
      if (b && b.contains(t)) return;
      setAuthMenuOpen(false);
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAuthMenuOpen(false);
    };

    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [authMenuOpen]);

  // Leak-proof: do not persist chat threads to localStorage

  const loadThreadsFromBackend = async (explicitToken?: string | null) => {
    const effectiveToken = explicitToken !== undefined ? explicitToken : accessToken;
    const hdrs: Record<string, string> = {};
    if (effectiveToken) hdrs.Authorization = `Bearer ${effectiveToken}`;

    try {
      const res = await fetch(`${BACKEND_BASE}/api/chat/threads`, {
        credentials: "include",
        headers: hdrs,
      });

      if (!res.ok) {
        setChatsHydrated(true);
        return;
      }

      const data = await res.json();
      const threads = Array.isArray(data?.threads) ? data.threads : [];

      const mapped: ChatSession[] = threads.map((t: any) => {
        const id = typeof t?.id === "string" ? t.id : crypto.randomUUID();
        const title = typeof t?.title === "string" && t.title.trim() ? t.title.trim() : "Chat";
        const updatedAt = t?.updated_at ? new Date(t.updated_at).getTime() : Date.now();

        return {
          id,
          title,
          updatedAt,
          backendSessionId:
            typeof t?.source_session_id === "string" && t.source_session_id.trim() ? t.source_session_id.trim() : null,
          uploaded: Array.isArray(t?.source_files)
            ? t.source_files.map((f: any) => ({
                id: typeof f?.id === "string" ? f.id : crypto.randomUUID(),
                name: typeof f?.name === "string" ? f.name : "unknown",
                status: typeof f?.status === "string" ? f.status : "extracted",
                textLen: typeof f?.textLen === "number" ? f.textLen : typeof f?.text_len === "number" ? f.text_len : 0,
              }))
            : [],
          combinedTextLen: typeof t?.combined_text_len === "number" ? t.combined_text_len : 0,
          selectedOutput: null,
          messages: [],
        };
      });

      setChatSessions(mapped);
      setChatsHydrated(true);
    } catch {
      setChatsHydrated(true);
    }
  };

  useEffect(() => {
    // On mount: restore auth session (refresh cookie → access token), then load threads.
    // This ensures logged-in users see their account threads after a page reload.
    const initSession = async () => {
      let restoredToken: string | null = null;
      try {
        const refreshRes = await fetch(`${BACKEND_BASE}/api/auth/refresh`, {
          method: "POST",
          credentials: "include",
        });
        if (refreshRes.ok) {
          const refreshData = await refreshRes.json();
          restoredToken = typeof refreshData?.access_token === "string" ? refreshData.access_token : null;
          const rawUser = refreshData?.user || refreshData?.profile;
          if (restoredToken) setAccessToken(restoredToken);
          if (rawUser) {
            setUserProfile({
              id: typeof rawUser.id === "string" ? rawUser.id : null,
              name: typeof rawUser.display_name === "string"
                ? rawUser.display_name
                : typeof rawUser.name === "string" ? rawUser.name : null,
              email: typeof rawUser.email === "string" ? rawUser.email : null,
              avatar_url: typeof rawUser.avatar_url === "string" ? rawUser.avatar_url : null,
            });
          }
        }
      } catch { /* backend not ready or not logged in */ }

      // Pass the restored token directly so the fetch uses it (state may not have propagated yet)
      await loadThreadsFromBackend(restoredToken);
    };

    void initSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onSignOut = async () => {
    setAuthLoading(true);
    setAuthError("");

    try {
      await fetch(`${BACKEND_BASE}/api/auth/logout`, { method: "POST", credentials: "include" });
    } catch {
      // ignore
    } finally {
      try {
        window.google?.accounts?.id?.disableAutoSelect?.();
      } catch {
        // ignore
      }

      // Leak-proof: no need to remove tokens/profile from localStorage

      setUserProfile(null);
      setAccessToken(null);
      setAuthMenuOpen(false);
      setAuthLoading(false);
      // Clear thread list immediately so logged-in threads don't flash on screen
      // while the re-fetch (anon-only) is in flight.
      setChatSessions([]);
      void refreshMe({ allowFail: true });
      void loadThreadsFromBackend();
    }
  };
  const DISCORD_CONNECT_URL =
    process.env.NEXT_PUBLIC_DISCORD_CONNECT_URL || `${BACKEND_BASE}/api/auth/discord`;

  // Optional: used to generate a bot invite link (server install)
  const DISCORD_CLIENT_ID = process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID || "";
  const DISCORD_BOT_INVITE_URL =
    process.env.NEXT_PUBLIC_DISCORD_BOT_INVITE_URL ||
    (DISCORD_CLIENT_ID
      ? `https://discord.com/oauth2/authorize?client_id=${encodeURIComponent(
          DISCORD_CLIENT_ID
        )}&scope=bot%20applications.commands&permissions=0&guild_select=true&disable_guild_select=false`
      : "");

  const [discordState, setDiscordState] = useState<DiscordConnectState>("idle");
  const [discordError, setDiscordError] = useState<string>("");
  const [discordGuilds, setDiscordGuilds] = useState<DiscordGuild[]>([]);
  const [discordGuildsLoading, setDiscordGuildsLoading] = useState(false);
  const [discordInstallOpen, setDiscordInstallOpen] = useState(false);
  const [discordInstallError, setDiscordInstallError] = useState<string>("");
  // Per-guild request state: maps guild_id → { message, invite_url, loading }
  const [discordRequestMessage, setDiscordRequestMessage] = useState<string>("");
  const [discordRequestInvite, setDiscordRequestInvite] = useState<string>("");
  const [discordRequestGuildId, setDiscordRequestGuildId] = useState<string>("");
  const [discordRequestLoading, setDiscordRequestLoading] = useState<string>(""); // guild_id of loading guild
  const [discordChannels, setDiscordChannels] = useState<DiscordChannel[]>([]);
  const [discordChannelsLoading, setDiscordChannelsLoading] = useState(false);
  const [selectedDiscordGuildId, setSelectedDiscordGuildId] = useState<string>("");
  const [selectedDiscordChannelId, setSelectedDiscordChannelId] = useState<string>("");

  const fetchDiscordGuilds = async () => {
    setDiscordGuildsLoading(true);
    setDiscordInstallError("");
    try {
      const res = await fetch(`${BACKEND_BASE}/api/discord/guilds`, {
        credentials: "include",
        headers: { ...authHeaders() },
      });
      if (!res.ok) {
        const msg = await res.text();
        throw new Error(msg || "Failed to load Discord servers");
      }
      const data = await res.json();
      const guilds: DiscordGuild[] = Array.isArray(data?.guilds) ? data.guilds : [];
      setDiscordGuilds(guilds);
    } catch (e: any) {
      setDiscordInstallError(e?.message || "Failed to load Discord servers");
      setDiscordGuilds([]);
    } finally {
      setDiscordGuildsLoading(false);
    }
  };

  const fetchDiscordChannels = async (guildId: string) => {
    setDiscordChannelsLoading(true);
    try {
      const res = await fetch(`${BACKEND_BASE}/api/discord/bot/guilds/${guildId}/channels`, {
        credentials: "include",
        headers: { ...authHeaders() },
      });
      if (!res.ok) {
        const msg = await res.text();
        throw new Error(msg || "Failed to load Discord channels");
      }
      const data = await res.json();
      const chans: DiscordChannel[] = Array.isArray(data?.channels) ? data.channels : [];
      setDiscordChannels(chans);
      setSelectedDiscordGuildId(guildId);
      // Do NOT auto-select a channel — user must pick one explicitly
      setSelectedDiscordChannelId("");
    } catch {
      setDiscordChannels([]);
      setSelectedDiscordGuildId(guildId);
      setSelectedDiscordChannelId("");
    } finally {
      setDiscordChannelsLoading(false);
    }
  };

  const openDiscordInstall = async () => {
    // Reset request panel state when refreshing guild list
    setDiscordRequestMessage("");
    setDiscordRequestInvite("");
    setDiscordRequestGuildId("");
    setDiscordRequestLoading("");
    await fetchDiscordGuilds();
  };

  const prepareDiscordSourceInBackground = async () => {
    // Populate the guild list so the server picker is ready.
    // Do NOT auto-select a guild or channel — the user must pick explicitly.
    try {
      const res = await fetch(`${BACKEND_BASE}/api/discord/guilds`, {
        credentials: "include",
        headers: { ...authHeaders() },
      });
      if (!res.ok) return;

      const data = await res.json();
      const guilds: DiscordGuild[] = Array.isArray(data?.guilds) ? data.guilds : [];
      setDiscordGuilds(guilds);
      // Reset any stale selection so Step 2 (server picker) is shown
      setSelectedDiscordGuildId((prev) => (guilds.some((g) => g.id === prev) ? prev : ""));
      setSelectedDiscordChannelId("");
      setDiscordChannels([]);
    } catch {
      // ignore background discovery failures on upload screen
    }
  };

  const refreshDiscordInstallState = async () => {
    await fetchDiscordGuilds();
  };

  const installBot = async () => {
    try {
      const res = await fetch(`${BACKEND_BASE}/api/discord/bot/install-url`, {
        credentials: "include",
        headers: { ...authHeaders() },
      });
      if (!res.ok) {
        const msg = await res.text();
        throw new Error(msg || "Failed to generate bot install URL");
      }

      const data = await res.json();
      const url = typeof data?.url === "string" ? data.url : "";
      if (!url) throw new Error("Missing bot install URL");

      const popup = window.open(url, "_blank", "noopener,noreferrer");

      // Refresh once right away
      void refreshDiscordInstallState();

      // Then poll for a short time while Discord install is happening
      let ticks = 0;
      const timer = window.setInterval(() => {
        ticks += 1;
        void refreshDiscordInstallState();

        const popupClosed = !popup || popup.closed;
        if (popupClosed || ticks >= 30) {
          window.clearInterval(timer);
          void refreshDiscordInstallState();
        }
      }, 2000);
    } catch (e: any) {
      setDiscordInstallError(e?.message || "Failed to generate bot install URL");
    }
  };

  const requestAdminInstall = async (g: DiscordGuild) => {
    // If already showing this guild's panel, toggle it off
    if (discordRequestGuildId === g.id && discordRequestMessage) {
      setDiscordRequestGuildId("");
      setDiscordRequestMessage("");
      setDiscordRequestInvite("");
      return;
    }

    setDiscordRequestMessage("");
    setDiscordRequestInvite("");
    setDiscordRequestGuildId(g.id);
    setDiscordRequestLoading(g.id);
    setDiscordInstallError("");
    try {
      const qs = new URLSearchParams({ guild_id: g.id, guild_name: g.name });
      const res = await fetch(`${BACKEND_BASE}/api/discord/bot/request-install?${qs.toString()}`, {
        credentials: "include",
        headers: { ...authHeaders() },
      });
      if (!res.ok) {
        const msg = await res.text();
        throw new Error(msg || "Failed to generate admin request message");
      }
      const data: DiscordInstallPayload = await res.json();
      setDiscordRequestMessage(data?.message || "");
      setDiscordRequestInvite(data?.invite_url || "");

      // Auto-copy for convenience
      try {
        if (data?.message) await navigator.clipboard.writeText(data.message);
      } catch {
        // ignore clipboard access
      }
    } catch (e: any) {
      setDiscordInstallError(e?.message || "Failed to generate request message");
      setDiscordRequestGuildId("");
    } finally {
      setDiscordRequestLoading("");
    }
  };

  const copyRequestMessage = async () => {
    try {
      if (!discordRequestMessage) return;
      await navigator.clipboard.writeText(discordRequestMessage);
    } catch {
      // ignore
    }
  };

  const sortedDiscordGuilds = useMemo(() => {
  return [...discordGuilds].sort((a, b) => {
    const rank = (g: DiscordGuild) => (g.installed ? 0 : g.can_manage ? 1 : 2);
    const diff = rank(a) - rank(b);
    if (diff !== 0) return diff;
    return a.name.localeCompare(b.name);
  });
  }, [discordGuilds]);

  useEffect(() => {
    if (discordState !== "connected") return;
    void prepareDiscordSourceInBackground();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [discordState]);

  // On mount: check if user already has a Discord session (persists across page reloads)
  useEffect(() => {
    const checkDiscordStatus = async () => {
      try {
        const res = await fetch(`${BACKEND_BASE}/api/discord/status`, {
          credentials: "include",
          headers: { ...authHeaders() },
        });
        if (!res.ok) return;
        const data = await res.json();
        if (data?.connected === true) {
          setDiscordState("connected");
          setDiscordError("");
        }
      } catch {
        // ignore — backend may not be ready yet
      }
    };
    void checkDiscordStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Read the redirect result from the URL once (prevents repeated token exchange loops)
  useEffect(() => {
    if (typeof window === "undefined") return;

    const url = new URL(window.location.href);
    const p = url.searchParams;

    const connectedFlag = p.get("discord");
    const err = p.get("error") || p.get("err") || p.get("discord_error");
    const errDesc = p.get("error_description") || p.get("errorDescription") || "";

    if (connectedFlag === "connected") {
      setDiscordState("connected");
      setDiscordError("");

      // Clear the query param so refresh doesn't re-run anything / confuse the UI
      p.delete("discord");
      if (p.toString() !== url.searchParams.toString()) {
        // (this check is mostly defensive)
      }
      const clean = `${url.pathname}${p.toString() ? `?${p.toString()}` : ""}${url.hash || ""}`;
      window.history.replaceState({}, "", clean);
      return;
    }

    if (err) {
      setDiscordState("error");
      setDiscordError(errDesc ? `${err}: ${errDesc}` : err);

      // Clear error params after reading
      p.delete("error");
      p.delete("err");
      p.delete("discord_error");
      p.delete("error_description");
      p.delete("errorDescription");
      const clean = `${url.pathname}${p.toString() ? `?${p.toString()}` : ""}${url.hash || ""}`;
      window.history.replaceState({}, "", clean);
      return;
    }
  }, []);

  const onConnectDiscord = () => {
    if (typeof window === "undefined") return;

    // Prevent double-clicks / repeated redirects (common cause of rate-limits)
    if (discordState === "connecting") return;

    setDiscordState("connecting");
    setDiscordError("");

    // Save an intent marker so if the user comes back without params we can still show a helpful message later
    try {
      window.sessionStorage.setItem("pu_discord_connecting", "1");
    } catch {
      // ignore
    }

    window.location.assign(DISCORD_CONNECT_URL);
  };

  const onInviteBot = () => {
    if (typeof window === "undefined") return;

    // Must connect Discord first so we can list servers + permissions.
    if (discordState !== "connected") {
      setDiscordState("error");
      setDiscordError("Connect Discord first, then choose a server to install the bot.");
      return;
    }

    void openDiscordInstall();
  };

  // Auto-upload-more behavior (no sync button)
  const selectedDiscordGuild = discordGuilds.find((g) => g.id === selectedDiscordGuildId) || null;
  const selectedDiscordChannel = discordChannels.find((c) => c.id === selectedDiscordChannelId) || null;
  const hasDiscordSource = discordState === "connected" && !!selectedDiscordGuild && !!selectedDiscordChannel;
  const pendingUploadCount = Math.max(0, files.length - uploaded.length);
  const canContinue = (files.length > 0 || hasDiscordSource) && !uploading;
  const autoSyncLockRef = useRef(false);
  const lastAutoUploadKeyRef = useRef<string>("");

  // -----------------------------
  // Global behavior
  // -----------------------------
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  useEffect(() => {
    const el = chatListRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  // Safety: if we have real chat state but no thread in Recents (can happen due to state timing), create one.
  useEffect(() => {
    if (chatSessions.length > 0) return;

    const hasRealUpload = uploaded.length > 0 || !!sessionId;
    const hasRealMessages = messages.length > 0;

    if (!hasRealUpload && !hasRealMessages) return;

    // Avoid creating a thread while we're still on the upload screen with nothing committed.
    // Only create when user is in chat OR we already have a backend session id.
    if (view === "upload" && !sessionId) return;

    // Bootstrap a thread from current state.
    upsertActiveSession({
      backendSessionId: sessionId,
      uploaded,
      combinedTextLen,
      selectedOutput,
      messages,
      title: uploaded[0]?.name ? uploaded[0].name : "New chat",
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatSessions.length, uploaded.length, sessionId, messages.length, view]);

  // -----------------------------
  // Background shader (glossy metaball vibe – same as Home)
  // -----------------------------
  useEffect(() => {
    const mount = bgMountRef.current;
    if (!mount) return;

    const ua = navigator.userAgent;
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);
    const isSafari = /^((?!chrome|android).)*safari/i.test(ua);
    const isChrome = /Chrome\//i.test(ua) && !/Edg\//i.test(ua) && !/OPR\//i.test(ua);
    const isLowPower = isMobile || (navigator.hardwareConcurrency || 4) <= 4;

    // Chrome + backdrop-filter + WebGL can get expensive. Cap DPR more aggressively on Chrome.
    const dprCap = isMobile ? 1.25 : isChrome ? 1.5 : 2;
    const dpr = Math.min(window.devicePixelRatio || 1, dprCap);

    // Respect reduced motion
    const prefersReducedMotion = typeof window !== "undefined" && window.matchMedia
      ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
      : false;

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
    camera.position.z = 1;

    const renderer = new THREE.WebGLRenderer({
      antialias: !isMobile && !isLowPower,
      alpha: true,
      powerPreference: isMobile ? "default" : "high-performance",
      premultipliedAlpha: false,
      preserveDrawingBuffer: false,
    });

    renderer.setPixelRatio(dpr);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setClearColor(0x000000, 0);

    // Consistent glow/contrast across Safari + Chrome
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;

    const canvas = renderer.domElement;
    canvas.style.cssText = `
      position: fixed;
      inset: 0;
      width: 100vw;
      height: 100vh;
      z-index: 0;
      display: block;
      border: 0;
      outline: 0;
    `;

    mount.innerHTML = "";
    mount.appendChild(canvas);

    const uniforms = {
      uTime: { value: 0.0 },
      uResolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
      uActualResolution: { value: new THREE.Vector2(window.innerWidth * dpr, window.innerHeight * dpr) },
      uMouse: { value: new THREE.Vector2(0.5, 0.5) },
      uCount: { value: isMobile ? 4 : isChrome ? 5 : 7 },
      uSmooth: { value: 0.55 },
      uSpeed: { value: 0.62 },
      uContrast: { value: 1.7 },
      uFog: { value: 0.14 },
      // dashboard palette
      uBg: { value: new THREE.Color(0x07070b) },
      uLight: { value: new THREE.Color(0x5fe3ff) },
      uLight2: { value: new THREE.Color(0x5aa8ff) },
      uIsSafari: { value: isSafari ? 1.0 : 0.0 },
      uIsLowPower: { value: isLowPower ? 1.0 : 0.0 },
      uIsChrome: { value: isChrome ? 1.0 : 0.0 },
    };

    const material = new THREE.ShaderMaterial({
      transparent: true,
      uniforms,
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        ${isMobile || isLowPower ? "precision mediump float;" : "precision highp float;"}

        uniform float uTime;
        uniform vec2 uResolution;
        uniform vec2 uActualResolution;
        uniform vec2 uMouse;
        uniform int uCount;
        uniform float uSmooth;
        uniform float uSpeed;
        uniform float uContrast;
        uniform float uFog;
        uniform vec3 uBg;
        uniform vec3 uLight;
        uniform vec3 uLight2;
        uniform float uIsSafari;
        uniform float uIsLowPower;
        uniform float uIsChrome;

        const float PI = 3.14159265359;
        const float EPS = 0.001;

        float smin(float a, float b, float k) {
          float h = max(k - abs(a - b), 0.0) / k;
          return min(a, b) - h * h * k * 0.25;
        }

        float sdSphere(vec3 p, float r) { return length(p) - r; }

        vec3 screenToWorld(vec2 n) {
          vec2 uv = n * 2.0 - 1.0;
          uv.x *= uResolution.x / uResolution.y;
          return vec3(uv * 2.0, 0.0);
        }

        float sceneSDF(vec3 p) {
          float d = 100.0;

          // fixed anchors (subtle corners)
          d = smin(d, sdSphere(p - screenToWorld(vec2(0.10, 0.86)), 0.85), 0.35);
          d = smin(d, sdSphere(p - screenToWorld(vec2(0.90, 0.14)), 0.95), 0.35);

          float t = uTime * uSpeed;
          int maxIter = (uIsLowPower > 0.5) ? 4 : (uIsSafari > 0.5 ? 5 : 8);

          for (int i = 0; i < 10; i++) {
            if (i >= uCount || i >= maxIter) break;
            float fi = float(i);
            float speed = 0.42 + fi * 0.12;
            float rad = 0.12 + mod(fi, 3.0) * 0.06;
            float orbit = 0.36 + mod(fi, 3.0) * 0.18;
            float ph = fi * PI * 0.35;

            vec3 o = vec3(
              sin(t * speed + ph) * orbit * 0.85,
              cos(t * speed * 0.85 + ph * 1.3) * orbit * 0.60,
              sin(t * speed * 0.5 + ph) * 0.35
            );

            // cursor attraction
            vec3 cursor = screenToWorld(uMouse);
            vec3 toC = cursor - o;
            float cd = length(toC);
            if (cd < 1.65 && cd > 0.0) {
              o += normalize(toC) * (1.0 - cd / 1.65) * 0.22;
            }

            d = smin(d, sdSphere(p - o, rad), uSmooth);
          }

          // cursor orb
          d = smin(d, sdSphere(p - screenToWorld(uMouse), 0.11), uSmooth);

          return d;
        }

        vec3 calcNormal(vec3 p) {
          float e = (uIsLowPower > 0.5) ? 0.002 : 0.001;
          return normalize(vec3(
            sceneSDF(p + vec3(e, 0.0, 0.0)) - sceneSDF(p - vec3(e, 0.0, 0.0)),
            sceneSDF(p + vec3(0.0, e, 0.0)) - sceneSDF(p - vec3(0.0, e, 0.0)),
            sceneSDF(p + vec3(0.0, 0.0, e)) - sceneSDF(p - vec3(0.0, 0.0, e))
          ));
        }

        float rayMarch(vec3 ro, vec3 rd) {
          float t = 0.0;
          int steps = (uIsLowPower > 0.5) ? 16 : ((uIsSafari > 0.5) ? 20 : ((uIsChrome > 0.5) ? 30 : 40));

          for (int i = 0; i < 64; i++) {
            if (i >= steps) break;
            vec3 p = ro + rd * t;
            float d = sceneSDF(p);
            if (d < EPS) return t;
            if (t > 5.0) break;
            t += d * (uIsLowPower > 0.5 ? 1.18 : 0.92);
          }

          return -1.0;
        }

        void main() {
          // use actual resolution to avoid DPR seams/frames
          vec2 uv = (gl_FragCoord.xy * 2.0 - uActualResolution.xy) / uActualResolution.xy;
          uv.x *= uResolution.x / uResolution.y;

          // For premium look: respond to mood/pulse (simulated with time for now)
          float uMood = 0.42 + 0.38 * sin(uTime * 0.12);
          float uPulse = 0.38 + 0.33 * sin(uTime * 0.31);

          vec3 ro = vec3(uv * 2.0, -1.0);
          vec3 rd = vec3(0.0, 0.0, 1.0);

          float t = rayMarch(ro, rd);
          vec3 col = uBg;

          if (t > 0.0) {
            vec3 p = ro + rd * t;
            vec3 n = calcNormal(p);

            vec3 lightDir = normalize(vec3(0.7, 1.0, 0.6));
            float diff = max(dot(n, lightDir), 0.0);

            // Secondary light to add depth (gives “premium” edge definition)
            vec3 lightDir2 = normalize(vec3(-0.6, 0.4, 0.7));
            float diff2 = max(dot(n, lightDir2), 0.0);

            float NoV = max(dot(n, -rd), 0.0);
            float fres = pow(1.0 - NoV, 1.35);

            // cool base tint
            vec3 base = vec3(0.02, 0.04, 0.07);

            // Specular
            vec3 viewDir = -rd;
            vec3 halfDir = normalize(lightDir + viewDir);
            float specPow = 32.0 + 36.0*uMood + 42.0*uPulse;
            float spec = pow(max(dot(n, halfDir), 0.0), specPow) * (0.20 + 0.30*uMood + 0.38*uPulse);
            // Colored spec tint (icey highlight)
            vec3 specCol = mix(uLight2, uLight, 0.65) * spec;

            // two-tone glow (cyan + blue), now with secondary light and fresnel
            vec3 glow = mix(uLight2, uLight, 0.55) * (
              diff * (0.82 + 0.28*uMood) +
              diff2 * (0.22 + 0.16*uMood) +
              fres * (0.58 + 0.30*uMood)
            );

            // Rim light (premium edge sheen)
            float rim = pow(1.0 - NoV, 2.6) * (0.18 + 0.22*uMood + 0.26*uPulse);
            vec3 rimCol = mix(uLight, uLight2, 0.35) * rim;

            // Subtle environment reflection (static, premium)
            vec3 env = vec3(0.018, 0.025, 0.045) * pow(fres, 1.5) * (0.26 + 0.14*uPulse);

            col = base + glow + env + rimCol + specCol;

            // filmic
            col = pow(col, vec3(uContrast));
            col = col / (col + vec3(0.85));

            // fog back to bg
            float fogAmt = 1.0 - exp(-t * uFog);
            col = mix(col, uBg, fogAmt * 0.62);

            // Subtle bloom-ish lift in highlights (cheap, premium)
            float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
            col += (col * col) * (0.045 + 0.035*uMood + 0.030*uPulse);
            col += mix(vec3(0.0), mix(uLight2, uLight, 0.5), smoothstep(0.55, 1.05, luma)) * (0.05*uMood + 0.06*uPulse);
          }

          // Screen-space vignette + subtle chroma tint (makes it feel “expensive”)
          float r = length(uv);
          float vig = smoothstep(1.10, 0.20, r);
          col *= mix(0.84, 1.06, vig);

          // Very subtle chroma shift (no multi-sampling; just grading)
          vec3 chroma = vec3(0.012, -0.006, 0.010) * (0.35 + 0.45*uMood + 0.60*uPulse);
          col = clamp(col + chroma * (1.0 - vig), 0.0, 1.0);

          // Tiny grain modulation to avoid banding on low-end displays
          float g = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898,78.233))) * 43758.5453);
          col += (g - 0.5) * (0.010 + 0.006*uMood);
          col = clamp(col, 0.0, 1.0);
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });

    const plane = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
    scene.add(plane);

    const clock = new THREE.Clock();

    // Throttle pointer updates: store target and lerp in RAF
    const mouseTarget = new THREE.Vector2(0.5, 0.5);
    const setMouseTarget = (x: number, y: number) => {
      mouseTarget.set(x / window.innerWidth, 1.0 - y / window.innerHeight);
    };

    const onMouseMove = (e: MouseEvent) => setMouseTarget(e.clientX, e.clientY);
    const onTouchMove = (e: TouchEvent) => {
      if (!e.touches[0]) return;
      setMouseTarget(e.touches[0].clientX, e.touches[0].clientY);
    };

    window.addEventListener("mousemove", onMouseMove, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: true });

    const onResize = () => {
      const ndpr = Math.min(window.devicePixelRatio || 1, isMobile ? 1.5 : 2);
      renderer.setPixelRatio(ndpr);
      renderer.setSize(window.innerWidth, window.innerHeight);
      uniforms.uResolution.value.set(window.innerWidth, window.innerHeight);
      uniforms.uActualResolution.value.set(window.innerWidth * ndpr, window.innerHeight * ndpr);

      renderer.domElement.style.width = "100vw";
      renderer.domElement.style.height = "100vh";
      renderer.domElement.style.border = "0";
      renderer.domElement.style.outline = "0";
    };

    window.addEventListener("resize", onResize, { passive: true });

    // init center
    setMouseTarget(window.innerWidth / 2, window.innerHeight / 2);

    let raf = 0;
    let running = true;

    const onVis = () => {
      running = document.visibilityState === "visible";
    };

    document.addEventListener("visibilitychange", onVis, { passive: true });

    const tick = () => {
      raf = window.requestAnimationFrame(tick);
      if (!running || prefersReducedMotion) return;

      uniforms.uTime.value = clock.getElapsedTime();

      // Smooth mouse (cheap) – makes it feel premium and reduces jitter work
      uniforms.uMouse.value.lerp(mouseTarget, 0.12);

      renderer.render(scene, camera);
    };

    tick();

    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", onVis);
      window.cancelAnimationFrame(raf);

      material.dispose();
      (plane.geometry as THREE.BufferGeometry).dispose();
      renderer.dispose();
      if (renderer.domElement?.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement);
    };
  }, []);

  // -----------------------------
  // Upload helpers
  // -----------------------------
  const addFiles = (incoming: FileList | File[]) => {
    const arr = Array.from(incoming).filter(isAllowed);

    const existing = new Set(files.map((x) => `${x.file.name}:${x.file.size}:${x.file.lastModified}`));

    const next: LocalFile[] = [];
    for (const f of arr) {
      const key = `${f.name}:${f.size}:${f.lastModified}`;
      if (!existing.has(key)) next.push({ id: crypto.randomUUID(), file: f });
    }

    if (next.length) setFiles((prev) => [...prev, ...next]);
  };

  const onBrowse = () => inputRef.current?.click();
  const onUploadMore = () => inputRef.current?.click();

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length) addFiles(e.target.files);
    e.target.value = "";
  };

  const removeFile = (id: string) => setFiles((prev) => prev.filter((x) => x.id !== id));

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files);
  };

  const outputLabel = (k: OutputType) =>
    k === "study_guide" ? "Study Guide" : k === "flash_card" ? "Flash Card" : k[0].toUpperCase() + k.slice(1);

  // -----------------------------
  // Upload to backend
  // -----------------------------
const uploadToBackend = async () => {
  if ((!files.length && !hasDiscordSource) || uploading) return;

  setUploading(true);
  try {
    const form = new FormData();

    for (const f of files) {
      form.append("files", f.file);
    }

    if (hasDiscordSource && selectedDiscordGuild && selectedDiscordChannel) {
      const importRes = await authFetch(
        `${BACKEND_BASE}/api/discord/bot/channels/${selectedDiscordChannel.id}/import?max_messages=300`,
        { method: "POST" }
      );

      if (!importRes.ok) {
        const msg = await importRes.text();
        throw new Error(msg || "Discord import failed");
      }

      const importData = await importRes.json();
      const discordText = typeof importData?.text === "string" ? importData.text : "";

      if (discordText.trim()) {
        const safeGuild =
          selectedDiscordGuild.name.replace(/[^a-zA-Z0-9-_ ]/g, "").trim() || "discord-server";
        const safeChannel =
          selectedDiscordChannel.name.replace(/[^a-zA-Z0-9-_ ]/g, "").trim() || "channel";

        const discordFile = new File(
          [discordText],
          `${safeGuild} - ${safeChannel}.txt`,
          { type: "text/plain" }
        );

        form.append("files", discordFile);
      }
    }

    const res = await authFetch(`${BACKEND_BASE}/api/upload`, {
      method: "POST",
      body: form,
    });

    if (!res.ok) {
      const msg = await res.text();
      throw new Error(msg || "Upload failed");
    }

    const data = await res.json();

      // Support both backend response shapes:
      // Old: { files, combined_text, combined_len }
      // New: { session_id, files, preview, preview_len, ttl_seconds }
      const sid = typeof data.session_id === "string" ? data.session_id : null;
      if (sid) {
        setSessionId(sid);
        setSourceExpired("");
      }

    const normalized: UploadedFile[] = (data.files || []).map((f: any) => {
      const name = f.name || f.filename || "unknown";
      const status = f.status || "extracted";

      const textLen =
        typeof f.text_len === "number"
          ? f.text_len
          : typeof f.textLen === "number"
          ? f.textLen
          : typeof f.text === "string"
          ? f.text.length
          : 0;

      return { id: crypto.randomUUID(), name, status, textLen };
    });

    const combinedLen =
      typeof data.combined_len === "number"
        ? data.combined_len
        : typeof data.combinedLen === "number"
        ? data.combinedLen
        : typeof data.combined_text === "string"
        ? data.combined_text.length
        : typeof data.preview_len === "number"
        ? data.preview_len
        : typeof data.preview === "string"
        ? data.preview.length
        : 0;

    setUploaded(normalized);
    setCombinedTextLen(combinedLen);

    if (view !== "upload") {
      upsertActiveSession({
        backendSessionId: sid || sessionId,
        uploaded: normalized,
        combinedTextLen: combinedLen,
      });
    }

    if (view === "upload") {
      setView("chat");

      const sourceMeta =
        hasDiscordSource && selectedDiscordGuild && selectedDiscordChannel
          ? `Sources: ${normalized.length || 0} file(s) • Discord ${selectedDiscordGuild.name} • #${selectedDiscordChannel.name}`
          : `Sources: ${normalized.length || 0} file(s) • ${channelsCount} channel`;

      const initialMessages: ChatMessage[] = [
        {
          id: crypto.randomUUID(),
          role: "user",
          title: "Hello",
          text:
            hasDiscordSource && selectedDiscordGuild && selectedDiscordChannel
              ? `I connected Discord and want to use #${selectedDiscordChannel.name} from ${selectedDiscordGuild.name}. Can you help me?`
              : `I uploaded ${normalized.length || 0} file(s). Can you help me?`,
        },
        {
          id: crypto.randomUUID(),
          role: "ai",
          title: "Welcome",
          meta: sourceMeta,
          text: "Pick an output above to generate first. After that, use the chat bar to refine it.",
        },
      ];

      setMessages(initialMessages);
      upsertActiveSession({
        backendSessionId: sid || sessionId,
        uploaded: normalized,
        combinedTextLen: combinedLen,
        messages: initialMessages,
        title: normalized[0]?.name ? normalized[0].name : "New chat",
      });
      setSelectedOutput(null);
    } else {
      setMessages((prev) =>
        prev.map((m) =>
          m.role === "ai" && m.title === "Welcome"
            ? {
                ...m,
                meta:
                  hasDiscordSource && selectedDiscordGuild && selectedDiscordChannel
                    ? `Sources: ${normalized.length || 0} file(s) • Discord ${selectedDiscordGuild.name} • #${selectedDiscordChannel.name}`
                    : `Sources: ${normalized.length || 0} file(s) • ${channelsCount} channel`,
              }
            : m
        )
      );
    }
  } finally {
    setUploading(false);
  }
};

  const onContinue = async () => {
    try {
      await uploadToBackend();
    } catch (e: any) {
      alert(`Upload failed: ${e?.message || "Unknown error"}`);
    }
  };

  // Auto-upload when user adds more files in chat view
  useEffect(() => {
    if (view !== "chat") return;
    if (!files.length) return;
    if (uploading) return;

    const key = files.map((f) => `${f.file.name}:${f.file.size}:${f.file.lastModified}`).join("|");
    if (pendingUploadCount <= 0) return;

    if (autoSyncLockRef.current) return;
    if (lastAutoUploadKeyRef.current === key) return;

    autoSyncLockRef.current = true;
    lastAutoUploadKeyRef.current = key;

    (async () => {
      try {
        await uploadToBackend();
      } catch {
        // ignore
      } finally {
        setTimeout(() => {
          autoSyncLockRef.current = false;
        }, 250);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files, view]);

  // -----------------------------
  // Generate output (buttons)
  // -----------------------------
  const onSelectOutput = async (k: OutputType) => {
    if (generating) return;
    const resolvedSessionId = effectiveSessionId;
    if (!resolvedSessionId) {
      if (messages.length > 0) {
        markSourceExpired();
      } else {
        alert("Upload files first (or connect Discord) so I have context. Then you can chat.");
      }
      return;
    }
    setSelectedOutput(k);
    upsertActiveSession({ selectedOutput: k });
    setGenerating(true);

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      text: `Make a ${outputLabel(k)} from my uploaded notes.`,
    };

    const aiLoadingId = crypto.randomUUID();
    const aiLoading: ChatMessage = {
      id: aiLoadingId,
      role: "ai",
      title: outputLabel(k),
      text: "Generating…",
      loading: true,
    };

    setMessages((prev) => {
      const next = [...prev, userMsg, aiLoading];
      upsertActiveSession({ messages: next });
      return next;
    });

    try {
      const res = await authFetch(`${BACKEND_BASE}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: resolvedSessionId,
          output_type: k,
        }),
      });

      if (!res.ok) {
        const raw = await res.text();
        const msg = extractErrorText(raw);
        if (isExpiredSourceError(res.status, raw)) {
          markSourceExpired(msg || undefined);
        }
        throw new Error(msg || "Generate failed");
      }

      const data = await res.json();

      // Build the AI message with structured data for rich rendering
      let richFields: Partial<ChatMessage> = { loading: false };

      if (k === "podcast" && Array.isArray(data.script)) {
        richFields = {
          ...richFields,
          outputType: "podcast",
          podcastSpeakers: Array.isArray(data.speakers) ? [data.speakers[0] ?? "Host", data.speakers[1] ?? "Guest"] : ["Host", "Guest"],
          podcastScript: data.script as PodcastTurn[],
          text: "", // text unused — rendered from script
          audioLoading: true,
        };
      } else if (k === "flash_card" && Array.isArray(data.cards)) {
        richFields = {
          ...richFields,
          outputType: "flash_card",
          flashCards: data.cards as Array<{ front: string; back: string }>,
          text: "",
        };
      } else if (typeof data.text === "string") {
        richFields = { ...richFields, text: data.text };
      } else if (typeof data.response === "string") {
        richFields = { ...richFields, text: data.response };
      } else {
        richFields = { ...richFields, text: "Done." };
      }

      const nextMessages = messages
        .concat([userMsg, aiLoading])
        .map((m) => (m.id === aiLoadingId ? { ...m, ...richFields } : m));

      setMessages(nextMessages);
      upsertActiveSession({ messages: nextMessages });
      void persistThreadSnapshot({ forceMessages: nextMessages });

      // Auto-fetch podcast audio in background after script arrives
      if (k === "podcast" && Array.isArray(data.script)) {
        const script = data.script as PodcastTurn[];
        const speakers: [string, string] = [data.speakers?.[0] ?? "Host", data.speakers?.[1] ?? "Guest"];
        void (async () => {
          try {
            const audioRes = await fetch(`${BACKEND_BASE}/api/podcast/audio`, {
              method: "POST",
              headers: { "Content-Type": "application/json", ...authHeaders() },
              credentials: "include",
              body: JSON.stringify({ speakers, script }),
            });
            if (!audioRes.ok) throw new Error("Audio generation failed");
            const blob = await audioRes.blob();
            const url = URL.createObjectURL(blob);
            setMessages((prev) =>
              prev.map((m) =>
                m.id === aiLoadingId ? { ...m, audioUrl: url, audioLoading: false } : m
              )
            );
          } catch {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === aiLoadingId ? { ...m, audioLoading: false } : m
              )
            );
          }
        })();
      }
    } catch (e: any) {
      const nextMessages = messages
        .concat([userMsg, aiLoading])
        .map((m) =>
          m.id === aiLoadingId ? { ...m, text: `Error: ${e?.message || "Something went wrong"}`, loading: false } : m
        );

      setMessages(nextMessages);
      upsertActiveSession({ messages: nextMessages });
      void persistThreadSnapshot({ forceMessages: nextMessages });
    } finally {
      setGenerating(false);
    }
  };

  // -----------------------------
  // Chat send (always visible bar, like your screenshot)
  // -----------------------------
  const onSendChat = async () => {
    const text = chatInput.trim();
    if (!text || generating) return;
    const resolvedSessionId = effectiveSessionId;
    if (!resolvedSessionId) {
      if (messages.length > 0) {
        markSourceExpired();
      } else {
        alert("Upload files first (or connect Discord) so I have context. Then you can chat.");
      }
      return;
    }

    setChatInput("");
    setGenerating(true);

    const userMsg: ChatMessage = { id: crypto.randomUUID(), role: "user", text };

    const aiLoadingId = crypto.randomUUID();
    const aiLoading: ChatMessage = { id: aiLoadingId, role: "ai", text: "Thinking…", loading: true };

    setMessages((prev) => {
      const next = [...prev, userMsg, aiLoading];
      upsertActiveSession({ messages: next });
      return next;
    });

    try {
      const res = await authFetch(`${BACKEND_BASE}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: resolvedSessionId,
          thread_id: activeChatIdRef.current,
          thread_title: uploaded?.[0]?.name ? uploaded[0].name : "Chat",
          message: text,
          history: messages
            .filter((m) => !m.loading)
            .filter((m) => m.role === "user" || m.role === "ai")
            .slice(-12)
            .map((m) => ({
              role: m.role,
              content: [m.title, m.meta, m.text].filter(Boolean).join("\n"),
            })),
        }),
      });

      if (!res.ok) {
        const raw = await res.text();
        const msg = extractErrorText(raw);
        if (isExpiredSourceError(res.status, raw)) {
          markSourceExpired(msg || undefined);
        }
        throw new Error(msg || "Chat failed");
      }

      const data = await res.json();
      const backendThreadId = typeof data?.thread_id === "string" ? data.thread_id : null;
      if (backendThreadId && backendThreadId !== activeChatIdRef.current) {
        const oldId = activeChatIdRef.current;
        setActiveChatIdSync(backendThreadId);
        setChatSessions((prev) => prev.map((cs) => (cs.id === oldId ? { ...cs, id: backendThreadId } : cs)));
      }
      const answer =
        typeof data.answer === "string"
          ? data.answer
          : typeof data.text === "string"
          ? data.text
          : typeof data.response === "string"
          ? data.response
          : JSON.stringify(data);

      const nextMessages = messages
        .concat([userMsg, aiLoading])
        .map((m) => (m.id === aiLoadingId ? { ...m, text: answer, loading: false } : m));

      setMessages(nextMessages);
      upsertActiveSession({ messages: nextMessages });
      void persistThreadSnapshot({
        forceThreadId: backendThreadId || activeChatIdRef.current,
        forceMessages: nextMessages,
      });
    } catch (e: any) {
      const nextMessages = messages
        .concat([userMsg, aiLoading])
        .map((m) =>
          m.id === aiLoadingId ? { ...m, text: `Error: ${e?.message || "Something went wrong"}`, loading: false } : m
        );

      setMessages(nextMessages);
      upsertActiveSession({ messages: nextMessages });
      void persistThreadSnapshot({ forceMessages: nextMessages });
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="pu-root" suppressHydrationWarning>
      {/* Global reset to remove any outer frame and match Home page */}
      <style jsx global>{`
        :global(html, body) {
          height: 100%;
          margin: 0 !important;
          padding: 0 !important;
          background: #07070b;
          overflow-x: hidden;
        }

        :global(body, #__next) {
          border: 0 !important;
          outline: 0 !important;
          box-shadow: none !important;
        }

        :global(*) {
          box-sizing: border-box;
        }
      `}</style>

      {/* background */}
      <div ref={bgMountRef} className="pu-bg" aria-hidden="true" />
      <div className="pu-vignette" aria-hidden="true" />

      <style jsx>{`
        :global(:root) {
          --pu-bg: #07070b;
          --pu-text: rgba(255, 255, 255, 0.92);
          --pu-muted: rgba(255, 255, 255, 0.62);

          /* Home page palette */
          --pu-accent-1: #5aa8ff; /* electric blue */
          --pu-accent-2: #5fe3ff; /* ice cyan */
          --pu-accent-3: #7c8cff; /* soft indigo */

          --pu-font-sans: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica,
            Arial, "Apple Color Emoji", "Segoe UI Emoji";

          --pu-radius-lg: 22px;
          --pu-radius-md: 18px;
          --pu-radius-sm: 14px;

          --pu-border: rgba(255, 255, 255, 0.10);
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
          background: radial-gradient(80% 70% at 50% 35%, rgba(90, 168, 255, 0.00), rgba(0, 0, 0, 0.55));
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

        /* subtle grain like Home */
        .pu-root::after {
          content: "";
          position: fixed;
          inset: 0;
          pointer-events: none;
          z-index: 1;
          opacity: 0.10;
          background-image: radial-gradient(rgba(255, 255, 255, 0.06) 1px, transparent 1px);
          background-size: 5px 5px;
          mix-blend-mode: overlay;
        }

        /* ===== Shell ===== */
        .pu-shell {
          position: relative;
          z-index: 2;
          height: 100%;
          display: grid;
          grid-template-columns: 340px 1fr;
          gap: 14px;
          min-width: 0;
        }

        /* ===== Home-style glossy surface (NOT milky) ===== */
        .pu-glass {
        position: relative;
        border-radius: var(--pu-radius-lg);
        border: 1px solid var(--pu-border);

        /* REAL glass */
        background: rgba(10, 12, 18, 0.36);
        -webkit-backdrop-filter: blur(14px) saturate(140%);
        backdrop-filter: blur(14px) saturate(140%);

        box-shadow: var(--pu-shadow);
        overflow: hidden;
        will-change: backdrop-filter;
      }

      /* Fallback if blur isn't supported */
      @supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
        .pu-glass {
          background: rgba(10, 12, 18, 0.62);
        }
      }

        /* glossy highlight (controlled, no white haze) */
        .pu-glass::before {
          content: "";
          position: absolute;
          inset: 0;
          pointer-events: none;
          z-index: 1;
          background:
            radial-gradient(60% 40% at 28% 10%, rgba(255, 255, 255, 0.10), rgba(255, 255, 255, 0.00) 60%),
            radial-gradient(50% 36% at 86% 12%, rgba(95, 227, 255, 0.10), rgba(0, 0, 0, 0.00) 62%);
          opacity: 0.22;
        }

        /* thin rim light */
        .pu-glass::after {
          content: "";
          position: absolute;
          inset: 0;
          pointer-events: none;
          z-index: 1;
          background: linear-gradient(180deg, rgba(255, 255, 255, 0.10), rgba(255, 255, 255, 0.00) 34%);
          opacity: 0.35;
        }

        .pu-glass > * {
          position: relative;
          z-index: 2;
        }

        /* ===== Buttons (match Home) ===== */
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

        /* ===== Sidebar ===== */
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
          letter-spacing: 0.10em;
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
          padding: 12px 12px;
          border-radius: var(--pu-radius-md);
          border: 1px solid rgba(255, 255, 255, 0.10);
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
          border-color: rgba(95, 227, 255, 0.20);
          box-shadow: var(--pu-shadow-soft);
        }

        .pu-sideItem.active {
          border-color: rgba(95, 227, 255, 0.26);
          background: rgba(255, 255, 255, 0.05);
          box-shadow: 0 24px 70px rgba(0, 0, 0, 0.40);
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

        .pu-showAll {
          margin-top: 12px;
          width: 100%;
          padding: 10px 12px;
          border-radius: 14px;
          border: 1px dashed rgba(255, 255, 255, 0.16);
          background: rgba(255, 255, 255, 0.02);
          color: rgba(255, 255, 255, 0.82);
          font-size: 12px;
          font-weight: 900;
          cursor: pointer;
          transition: transform 160ms ease, background 160ms ease, border-color 160ms ease;
        }

        .pu-showAll:hover {
          background: rgba(255, 255, 255, 0.04);
          border-color: rgba(95, 227, 255, 0.22);
          transform: translateY(-1px);
        }

        .pu-search {
          margin-top: 10px;
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 10px 12px;
          border-radius: 14px;
          border: 1px solid rgba(255, 255, 255, 0.10);
          background: rgba(255, 255, 255, 0.03);
        }

        .pu-search input {
          border: none;
          outline: none;
          background: transparent;
          width: 100%;
          color: var(--pu-text);
          font-size: 12px;
        }

        .pu-list {
          margin-top: 12px;
          display: flex;
          flex-direction: column;
          gap: 10px;
          overflow: auto;
          min-height: 0;
          padding-right: 6px;
          scrollbar-gutter: stable;
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
          color: rgba(255, 255, 255, 0.90);
        }

        .pu-itemSub {
          margin-top: 4px;
          font-size: 11px;
          color: var(--pu-muted);
        }

        /* ===== Main ===== */
        .pu-main {
          display: flex;
          flex-direction: column;
          overflow: hidden;
          min-width: 0;
        }

        .pu-topbar {
          padding: 14px 14px;
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
          color: rgba(255, 255, 255, 0.60);
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

        /* ===== Upload view (home-like glossy card) ===== */
        .pu-uploadCenter {
          height: 100%;
          display: grid;
          place-items: center;
        }

        .pu-uploadCard {
          width: min(860px, 100%);
          padding: 18px;
          border-radius: var(--pu-radius-lg);
          border: 1px solid rgba(255, 255, 255, 0.10);
          background: rgba(10, 12, 18, 0.32);
          -webkit-backdrop-filter: blur(16px) saturate(140%);
          backdrop-filter: blur(16px) saturate(140%);
          box-shadow: var(--pu-shadow);
          position: relative;
          overflow: hidden;
        }

        .pu-uploadCard::before {
          content: "";
          position: absolute;
          inset: 0;
          pointer-events: none;
          background:
            radial-gradient(62% 44% at 22% 12%, rgba(255, 255, 255, 0.11), rgba(255, 255, 255, 0.00) 64%),
            radial-gradient(56% 40% at 86% 10%, rgba(95, 227, 255, 0.10), rgba(0, 0, 0, 0.00) 68%);
          opacity: 0.26;
        }

        .pu-uploadCard > * {
          position: relative;
          z-index: 1;
        }

        .pu-titleRow {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          margin-bottom: 12px;
          flex-wrap: wrap;
        }

        .pu-h1 {
          font-size: 14px;
          font-weight: 950;
          letter-spacing: -0.02em;
          color: rgba(255, 255, 255, 0.92);
        }

        .pu-desc {
          margin-top: 6px;
          font-size: 12px;
          color: var(--pu-muted);
          line-height: 1.55;
          max-width: 60ch;
        }

        .pu-btnRow {
          display: flex;
          gap: 10px;
          align-items: center;
        }

        .pu-drop {
          margin-top: 12px;
          border-radius: var(--pu-radius-md);
          border: 1px dashed rgba(255, 255, 255, 0.16);
          background: rgba(255, 255, 255, 0.02);
          padding: 18px;
          transition: background 120ms ease, border-color 120ms ease;
        }

        .pu-drop.drag {
          background: rgba(255, 255, 255, 0.04);
          border-color: rgba(255, 255, 255, 0.26);
        }

        .pu-dropInner {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 14px;
          flex-wrap: wrap;
        }

        .pu-dropTitle {
          font-weight: 900;
          font-size: 13px;
          color: rgba(255, 255, 255, 0.90);
        }

        .pu-dropSub {
          margin-top: 6px;
          font-size: 11px;
          color: var(--pu-muted);
        }

        .pu-dot {
          width: 10px;
          height: 10px;
          border-radius: 999px;
          display: inline-block;
          margin-right: 10px;
          box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.08);
        }

        .pu-dot.idle {
          background: rgba(255, 255, 255, 0.30);
        }

        .pu-dot.ok {
          background: linear-gradient(90deg, var(--pu-accent-1), var(--pu-accent-2));
          box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.08), 0 0 16px rgba(95, 227, 255, 0.18);
        }

        /* ── Discord inline flow ── */
        .pu-discordStep {
          padding: 14px 16px 16px;
          border-top: 1px solid rgba(255,255,255,0.06);
          max-height: 340px;
          overflow-y: auto;
          scrollbar-width: thin;
          scrollbar-color: rgba(255,255,255,0.15) transparent;
        }
        .pu-discordStep::-webkit-scrollbar { width: 4px; }
        .pu-discordStep::-webkit-scrollbar-track { background: transparent; }
        .pu-discordStep::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.15); border-radius: 4px; }
        .pu-discordStepLabel {
          font-size: 10px;
          font-weight: 900;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: rgba(255,255,255,0.4);
          margin-bottom: 10px;
        }
        .pu-discordLoading {
          display: flex;
          align-items: center;
          gap: 10px;
          font-size: 12px;
          color: rgba(255,255,255,0.6);
          padding: 4px 0;
        }
        .pu-discordSpinner {
          width: 16px;
          height: 16px;
          border-radius: 50%;
          border: 2px solid rgba(255,255,255,0.1);
          border-top-color: #5aa8ff;
          animation: spin 0.7s linear infinite;
          flex-shrink: 0;
        }
        @keyframes spin { to { transform: rotate(360deg); } }
        .pu-discordEmpty {
          font-size: 12px;
          color: rgba(255,255,255,0.5);
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          gap: 8px;
        }
        .pu-discordGuilds {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .pu-discordGuild:hover { border-color: rgba(255,255,255,0.16); background: rgba(255,255,255,0.04); }
        .pu-discordGuild {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 10px 14px;
          border-radius: 14px;
          border: 1px solid rgba(255,255,255,0.08);
          background: rgba(255,255,255,0.02);
          transition: border-color 130ms, background 130ms;
        }
        .pu-discordGuild.ready {
          border-color: rgba(95,227,100,0.18);
          background: rgba(95,227,100,0.04);
        }
        .pu-discordGuildLeft { min-width: 0; flex: 1; }
        .pu-discordGuildName {
          font-size: 12px;
          font-weight: 800;
          color: rgba(255,255,255,0.9);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .pu-discordGuildStatus {
          font-size: 11px;
          color: rgba(255,255,255,0.5);
          margin-top: 2px;
        }
        .pu-discordGuild.ready .pu-discordGuildStatus { color: rgba(95,227,100,0.8); }
        .pu-discordChannels {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          max-height: 180px;
          overflow-y: auto;
          scrollbar-width: thin;
          scrollbar-color: rgba(255,255,255,0.15) transparent;
        }
        .pu-discordChannels::-webkit-scrollbar { width: 4px; }
        .pu-discordChannels::-webkit-scrollbar-track { background: transparent; }
        .pu-discordChannels::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.15); border-radius: 4px; }
        .pu-discordChan {
          height: 30px;
          padding: 0 12px;
          border-radius: 999px;
          border: 1px solid rgba(255,255,255,0.1);
          background: rgba(255,255,255,0.03);
          color: rgba(255,255,255,0.78);
          font-size: 12px;
          font-weight: 700;
          cursor: pointer;
          transition: all 130ms;
          white-space: nowrap;
        }
        .pu-discordChan:hover { background: rgba(255,255,255,0.07); border-color: rgba(95,227,255,0.25); }
        .pu-discordChan.active {
          background: rgba(95,227,255,0.12);
          border-color: rgba(95,227,255,0.4);
          color: #5fe3ff;
        }
        .pu-discordGuild.pu-discordGuildActive {
          border-color: rgba(95,227,255,0.25);
          background: rgba(95,227,255,0.05);
        }
        .pu-btnActive {
          background: rgba(95,227,100,0.12) !important;
          border-color: rgba(95,227,100,0.35) !important;
          color: rgba(95,227,100,0.9) !important;
        }
        .pu-discordRequest { margin-top: 0; padding: 10px 14px 12px; background: rgba(95,227,255,0.04); border: 1px solid rgba(95,227,255,0.14); border-top: none; border-radius: 0 0 14px 14px; }
        .pu-discordRequestPreview {
          font-size: 11px;
          color: rgba(255,255,255,0.55);
          background: rgba(0,0,0,0.25);
          border: 1px solid rgba(255,255,255,0.07);
          border-radius: 8px;
          padding: 8px 10px;
          margin: 8px 0;
          white-space: pre-wrap;
          max-height: 80px;
          overflow-y: auto;
          scrollbar-width: thin;
          scrollbar-color: rgba(255,255,255,0.1) transparent;
          line-height: 1.5;
        }
        .pu-discordRequestLabel {
          font-size: 11px;
          color: rgba(255,255,255,0.6);
          margin-bottom: 8px;
        }
        .pu-discordRequestBtns { display: flex; gap: 8px; flex-wrap: wrap; }

        .pu-fileList {
          margin-top: 14px;
          display: flex;
          flex-direction: column;
          gap: 10px;
          max-height: 240px;
          overflow: auto;
          padding-right: 6px;
        }

        .pu-fileItem {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 12px;
          border-radius: var(--pu-radius-md);
          border: 1px solid rgba(255, 255, 255, 0.10);
          background: rgba(255, 255, 255, 0.03);
        }

        .pu-fileName {
          font-size: 12px;
          font-weight: 900;
          color: rgba(255, 255, 255, 0.90);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          max-width: 560px;
        }

        .pu-fileSize {
          margin-top: 4px;
          font-size: 11px;
          color: var(--pu-muted);
        }

        .pu-remove {
          width: 40px;
          height: 40px;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.12);
          background: rgba(255, 255, 255, 0.04);
          cursor: pointer;
          display: grid;
          place-items: center;
          color: rgba(255, 255, 255, 0.92);
          font-weight: 950;
          transition: transform 160ms ease, background 160ms ease, border-color 160ms ease;
        }

        .pu-remove:hover {
          transform: translateY(-1px);
          background: rgba(255, 255, 255, 0.06);
          border-color: rgba(95, 227, 255, 0.18);
        }

        /* ===== Chat ===== */
        .pu-chatCanvas {
          height: 100%;
          display: grid;
          grid-template-rows: 1fr auto;
          gap: 10px;
          min-height: 0;
        }

        .pu-chatScroll {
          min-height: 0;
          overflow: auto;
          padding: 12px 10px 24px 10px;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .pu-msgRow {
          display: flex;
        }

        .pu-msgRow.left {
          justify-content: flex-start;
        }

        .pu-msgRow.right {
          justify-content: flex-end;
        }

        .pu-msgBubble {
          width: fit-content;
          max-width: min(720px, 86%);
          border-radius: 18px;
          border: 1px solid rgba(255, 255, 255, 0.10);
          background: rgba(10, 12, 18, 0.28);
          -webkit-backdrop-filter: blur(14px) saturate(140%);
          backdrop-filter: blur(14px) saturate(140%);
          padding: 14px 16px;
          box-shadow: 0 10px 22px rgba(0, 0, 0, 0.22);
        }

        .pu-msgBubble.ai {
          border-color: rgba(255, 255, 255, 0.14);
        }

        .pu-msgBubble.user {
          border-color: rgba(255, 255, 255, 0.10);
        }

        .pu-msgTitle {
          font-size: 13px;
          font-weight: 950;
          color: rgba(255, 255, 255, 0.92);
          letter-spacing: -0.01em;
          line-height: 1.25;
          margin-bottom: 2px;
        }

        .pu-msgMeta {
          margin-top: 6px;
          font-size: 12px;
          letter-spacing: 0.01em;
          color: rgba(255, 255, 255, 0.62);
        }

        .pu-msgText {
          margin-top: 8px;
          font-size: 14px;
          color: rgba(255, 255, 255, 0.86);
          line-height: 1.65;
          text-shadow: 0 1px 0 rgba(0, 0, 0, 0.35);
          white-space: pre-wrap;
        }

        .pu-msgText.loading {
          color: rgba(255, 255, 255, 0.70);
        }

        .pu-outputPickerInFeed {
          width: min(620px, 86%);
          padding: 14px;
          border-radius: 18px;
          border: 1px solid rgba(255, 255, 255, 0.10);
          background: rgba(255, 255, 255, 0.03);
        }

        .pu-pickerTitle {
          font-size: 13px;
          font-weight: 950;
          color: rgba(255, 255, 255, 0.92);
          line-height: 1.25;
        }

        .pu-pickerSub {
          margin-top: 6px;
          font-size: 11px;
          color: var(--pu-muted);
        }

        .pu-outputRow {
          margin-top: 12px;
          display: flex;
          gap: 10px;
          justify-content: center;
          flex-wrap: wrap;
        }

        .pu-outputBtn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          height: 34px;
          padding: 0 12px;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.12);
          background: rgba(255, 255, 255, 0.04);
          color: rgba(255, 255, 255, 0.90);
          font-size: 12px;
          font-weight: 950;
          cursor: pointer;
          transition: transform 120ms ease, background 120ms ease, border-color 120ms ease;
        }

        .pu-outputBtn:hover {
          background: rgba(255, 255, 255, 0.06);
          border-color: rgba(255, 255, 255, 0.20);
          transform: translateY(-1px);
        }

        .pu-outputBtn:disabled {
          opacity: 0.55;
          cursor: not-allowed;
        }

        .pu-chatBarWrap {
          padding: 8px 6px 10px 6px;
        }

        .pu-chatBar {
          width: 100%;
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 10px 12px;
          border-radius: 14px;
          border: 1px solid rgba(255, 255, 255, 0.12);
          background: rgba(10, 12, 18, 0.30);
          -webkit-backdrop-filter: blur(14px) saturate(140%);
          backdrop-filter: blur(14px) saturate(140%);
        }

        .pu-attach {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 8px 10px;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.12);
          background: rgba(255, 255, 255, 0.04);
          color: rgba(255, 255, 255, 0.90);
          font-size: 12px;
          font-weight: 900;
          cursor: pointer;
          white-space: nowrap;
          transition: transform 120ms ease, background 120ms ease, border-color 120ms ease;
        }

        .pu-attach:hover {
          background: rgba(255, 255, 255, 0.06);
          border-color: rgba(255, 255, 255, 0.18);
          transform: translateY(-1px);
        }

        .pu-attachText {
          color: rgba(255, 255, 255, 0.72);
        }

        .pu-chatInput {
          flex: 1;
          border: none;
          outline: none;
          background: transparent;
          color: rgba(255, 255, 255, 0.92);
          font-size: 13px;
        }

        .pu-send {
          width: 40px;
          height: 40px;
          border-radius: 12px;
          border: 1px solid rgba(255, 255, 255, 0.14);
          background: rgba(255, 255, 255, 0.06);
          cursor: pointer;
          display: grid;
          place-items: center;
          transition: transform 120ms ease, background 120ms ease, border-color 120ms ease;
        }
        .pu-authMenu {
          pointer-events: auto;
        }

        .pu-avatarImg {
          width: 30px;
          height: 30px;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.14);
          object-fit: cover;
          display: block;
        }

        :global(.g_id_signin) {
          width: 100% !important;
          display: flex !important;
          justify-content: center !important;
        }

        :global(.gsi-material-button.disabled) {
          opacity: 0.55;
          cursor: not-allowed;
        }

        :global(.gsi-material-button) {
          width: 100%;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          height: 44px;
          padding: 0 14px;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.12);
          background: rgba(255, 255, 255, 0.04);
          color: rgba(255, 255, 255, 0.92);
          font-size: 12px;
          font-weight: 900;
        }

        :global(.gsi-material-button-content-wrapper) {
          display: inline-flex;
          align-items: center;
          gap: 10px;
        }

        :global(.gsi-material-button-icon) {
          width: 18px;
          height: 18px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
        }

        .pu-send:hover {
          transform: translateY(-1px);
          background: rgba(255, 255, 255, 0.08);
          border-color: rgba(95, 227, 255, 0.20);
        }

        .pu-send:disabled {
          opacity: 0.55;
          cursor: not-allowed;
          transform: none;
        }

        @media (max-width: 980px) {
          .pu-shell {
            grid-template-columns: 1fr;
          }
          .pu-sidebar {
            display: none;
          }
        }
      `}</style>

      <div className="pu-shell">
        {/* Sidebar */}
        <aside className="pu-glass pu-sidebar">
          <div className="pu-brandRow">
            <div className="pu-brand">Prepare-Up</div>
          </div>

          <div className="pu-sectionLabel">MAIN</div>
          <nav className="pu-sideNav" aria-label="Main navigation">
            {(
              [
                ["flash_cards", "Flash Cards", <FlashCardsIcon key="i" />],
                ["podcast", "Podcast", <MicIcon key="i" />],
                ["mock_test", "Mock Test", <QuizIcon key="i" />],
                ["study_guide", "Study Guide", <DocIcon key="i" />],
              ] as Array<["flash_cards" | "podcast" | "mock_test" | "study_guide", string, React.ReactNode]>
            ).map(([key, label, icon]) => (
              <div
                key={key}
                className={`pu-sideItem ${sidebarActive === key ? "active" : ""}`}
                role="button"
                tabIndex={0}
                onClick={() => onSidebarSelect(key)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSidebarSelect(key);
                  }
                }}
              >
                <div className="pu-sideIcon">{icon}</div>
                <div className="pu-sideLabel">{label}</div>
              </div>
            ))}
          </nav>

          {chatSessions.length > 0 ? (
            <button className="pu-showAll" type="button" onClick={startNewChat}>
              + New chat
            </button>
          ) : null}

          <div className="pu-sectionLabel">RECENTS</div>

          <div className="pu-search">
            <SearchIcon />
            <input
              placeholder="Search chats…"
              value={recentQuery}
              onChange={(e) => {
                setRecentQuery(e.target.value);
                setRecentVisible(12);
              }}
              suppressHydrationWarning
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck={false}
              data-gramm="false"
              data-gramm_editor="false"
              data-enable-grammarly="false"
            />
          </div>

          <div className="pu-list" aria-label="Recent chats" onScroll={onRecentsScroll}>
            {visibleRecents.map((c) => (
              <div
                key={c.id}
                className={`pu-itemCompact ${activeChatId === c.id ? "active" : ""}`}
                role="button"
                tabIndex={0}
                onClick={() => openChatThread(c.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    openChatThread(c.id);
                  }
                }}
              >
                <div className="pu-itemTitle">{c.title}</div>
                <div className="pu-itemSub">{c.sub || " "}</div>
              </div>
            ))}
          </div>
        </aside>

        {/* Main */}
        <main className="pu-glass pu-main">
          <div className="pu-topbar">
          <div />

          {isAnonymous ? (
            <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
                <div style={{ fontSize: 11, fontWeight: 900, color: "rgba(255,255,255,0.62)" }}>
                  You’re chatting as a guest
                </div>

                <button
                  ref={signInBtnRef}
                  className={`pu-btn pu-btnPrimary ${authLoading ? "pu-btnDisabled" : ""}`}
                  type="button"
                  onClick={() => {
                    setAuthMenuOpen((v) => {
                      const next = !v;
                      if (next && signInBtnRef.current) {
                        const r = signInBtnRef.current.getBoundingClientRect();
                        const width = 340;
                        const pad = 12;
                        const top = Math.round(r.bottom + 10);
                        const left = Math.min(window.innerWidth - width - pad, Math.max(pad, Math.round(r.right - width)));
                        setAuthMenuPos({ top, left });
                      }
                      return next;
                    });
                  }}
                  disabled={authLoading || !GOOGLE_CLIENT_ID}
                  suppressHydrationWarning
                  aria-haspopup="dialog"
                  aria-expanded={authMenuOpen}
                  title={!GOOGLE_CLIENT_ID ? "Missing NEXT_PUBLIC_GOOGLE_CLIENT_ID" : ""}
                >
                  {authLoading ? "Signing in…" : "Sign in"}
                </button>
              </div>

              {authMenuOpen && typeof document !== "undefined"
                ? createPortal(
                    <div
                      ref={authMenuRef}
                      className="pu-authMenu"
                      style={{
                        position: "fixed",
                        top: authMenuPos?.top ?? 70,
                        left: authMenuPos?.left ?? Math.max(12, window.innerWidth - 340 - 12),
                        width: 340,
                        padding: 12,
                        borderRadius: 16,
                        border: "1px solid rgba(255,255,255,0.12)",
                        background: "rgba(10,12,18,0.78)",
                        backdropFilter: "blur(14px) saturate(140%)",
                        WebkitBackdropFilter: "blur(14px) saturate(140%)",
                        boxShadow: "0 18px 60px rgba(0,0,0,0.46)",
                        zIndex: 2147483000,
                        pointerEvents: "auto",
                      }}
                      role="dialog"
                      aria-label="Sign in options"
                    >
                      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                        <div style={{ fontSize: 12, fontWeight: 900, color: "rgba(255,255,255,0.88)" }}>
                          Sign in to save chats
                        </div>

                        {!GOOGLE_CLIENT_ID ? (
                          <div style={{ fontSize: 12, color: "rgba(255,120,120,0.95)" }}>
                            Missing NEXT_PUBLIC_GOOGLE_CLIENT_ID in your frontend environment.
                          </div>
                        ) : !gsiReady ? (
                          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.72)" }}>Loading Google Sign-In…</div>
                        ) : (
                          <div ref={gsiBtnMountRef} />
                        )}

                        <button className="gsi-material-button disabled" type="button" disabled aria-label="Sign in with Apple">
                          <div className="gsi-material-button-content-wrapper">
                            <div className="gsi-material-button-icon" aria-hidden="true">
                              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="20" height="20" fill="#e3e3e3">
                                <path d="M16.365 1.43c0 1.14-.42 2.2-1.26 3.16-.93 1.05-2.52 1.86-3.84 1.75-.16-1.24.44-2.58 1.3-3.55.94-1.06 2.58-1.82 3.8-1.36z" />
                                <path d="M20.4 17.2c-.52 1.2-1.14 2.29-1.96 3.38-1.11 1.48-2.02 2.5-3.51 2.52-1.46.02-1.93-.86-3.6-.86-1.67 0-2.18.84-3.56.88-1.44.05-2.54-1.15-3.66-2.62-2.24-2.93-3.95-8.27-1.65-11.87 1.14-1.77 3.19-2.9 5.42-2.93 1.42-.03 2.77.96 3.6.96.82 0 2.37-1.18 4-1.01.68.03 2.6.27 3.83 2.05-.1.06-2.28 1.33-2.26 3.97.02 3.15 2.76 4.2 2.79 4.21z" />
                              </svg>
                            </div>
                            <span className="gsi-material-button-contents">Sign in with Apple (soon)</span>
                          </div>
                        </button>

                        {authError ? (
                          <div style={{ fontSize: 12, lineHeight: 1.4, color: "rgba(255,120,120,0.95)", whiteSpace: "pre-wrap" }}>
                            {authError}
                          </div>
                        ) : null}
                      </div>
                    </div>,
                    document.body
                  )
                : null}
            </div>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2 }}>
                <div className="pu-userHint">{getGreeting()}</div>
                <div className="pu-userName">{getDisplayName()}</div>
              </div>

              <div className="pu-userChip" aria-label="Signed in user">
                {userProfile?.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img className="pu-avatarImg" src={userProfile.avatar_url} alt="" />
                ) : (
                  <div className="pu-avatar">{getAvatarInitial()}</div>
                )}
              </div>

              <button className="pu-btn" type="button" onClick={onSignOut} disabled={authLoading}>
                Sign out
              </button>
            </div>
          )}
        </div>

          <div
            className="pu-content"
            onDragEnter={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={(e) => {
              e.preventDefault();
              setDragging(false);
            }}
            onDrop={onDrop}
          >
            {view === "upload" ? (
              <div className="pu-uploadCenter">
                <div className="pu-uploadCard">
                  <div className="pu-titleRow">
                    <div>
                      <div className="pu-h1">Upload your notes</div>
                      <div className="pu-desc">
                        Add PDFs, docs, slides, images, audio/video, code, archives — anything. Next step will be chat +
                        generation options.
                      </div>
                    </div>
                    <div className="pu-btnRow">
                      <button className="pu-btn" onClick={onBrowse} type="button" suppressHydrationWarning>
                        Browse
                      </button>
                      <button
                        className={`pu-btn pu-btnPrimary ${!canContinue ? "pu-btnDisabled" : ""}`}
                        onClick={onContinue}
                        disabled={!canContinue}
                        type="button"
                        suppressHydrationWarning
                      >
                        {uploading ? "Uploading…" : "Continue"}
                      </button>
                    </div>
                  </div>

                  {/* ── Discord inline integration ── */}
                  <div className="pu-drop pu-discord">
                    {/* Header row — always visible */}
                    <div className="pu-dropInner" style={{ alignItems: "flex-start" }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="pu-dropTitle">
                          <span className={`pu-dot ${discordState === "connected" ? "ok" : "idle"}`} />
                          Discord
                          {discordState === "connected" && selectedDiscordGuild && selectedDiscordChannel && (
                            <span style={{ fontWeight: 700, fontSize: 11, color: "rgba(95,227,100,0.9)", marginLeft: 8 }}>
                              {selectedDiscordGuild.name} · #{selectedDiscordChannel.name}
                            </span>
                          )}
                        </div>
                        <div className="pu-dropSub">
                          {discordState === "idle" || discordState === "error"
                            ? "Connect Discord to import server messages as study material."
                            : discordState === "connecting"
                              ? "Redirecting to Discord…"
                              : hasDiscordSource
                                ? "Ready — messages will be imported when you click Continue."
                                : discordGuildsLoading
                                  ? "Loading your servers…"
                                  : selectedDiscordGuildId && !selectedDiscordChannelId
                                    ? `${selectedDiscordGuild?.name} — pick a channel below.`
                                    : discordGuilds.length > 0
                                      ? "Pick a server, then a channel to import from."
                                      : "Connected — click Load Servers to choose what to import."}
                        </div>
                        {discordState === "error" && discordError && (
                          <div className="pu-dropSub" style={{ marginTop: 6, color: "rgba(255,120,120,0.9)" }}>⚠️ {discordError}</div>
                        )}
                        {discordInstallError && discordState === "connected" && (
                          <div className="pu-dropSub" style={{ marginTop: 6, color: "rgba(255,120,120,0.9)" }}>⚠️ {discordInstallError}</div>
                        )}
                      </div>

                      <div className="pu-btnRow" style={{ flexShrink: 0 }}>
                        {discordState !== "connected" ? (
                          <button
                            className={`pu-btn ${discordState === "connecting" ? "pu-btnDisabled" : ""}`}
                            onClick={onConnectDiscord}
                            type="button"
                            disabled={discordState === "connecting"}
                            suppressHydrationWarning
                          >
                            <LinkIcon />
                            {discordState === "connecting" ? "Connecting…" : "Connect"}
                          </button>
                        ) : hasDiscordSource ? (
                          <button className="pu-btn" type="button"
                            onClick={() => { setSelectedDiscordGuildId(""); setSelectedDiscordChannelId(""); setDiscordChannels([]); }}>
                            Change
                          </button>
                        ) : selectedDiscordGuildId ? (
                          // Step 3 active — back to server list
                          <button className="pu-btn" type="button"
                            onClick={() => { setSelectedDiscordGuildId(""); setDiscordChannels([]); }}>
                            ← Servers
                          </button>
                        ) : (
                          // Disconnected or guilds not loaded — load servers
                          <button className="pu-btn" type="button"
                            onClick={() => void fetchDiscordGuilds()}
                            disabled={discordGuildsLoading}
                            suppressHydrationWarning>
                            {discordGuildsLoading ? "Loading…" : discordGuilds.length > 0 ? "Reload" : "Load Servers"}
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Step 2: server list */}
                    {discordState === "connected" && !selectedDiscordGuildId && (
                      <div className="pu-discordStep">
                        {discordGuildsLoading ? (
                          <div className="pu-discordLoading">
                            <div className="pu-discordSpinner" />
                            <span>Loading servers…</span>
                          </div>
                        ) : sortedDiscordGuilds.length === 0 ? (
                          <div className="pu-discordEmpty">
                            No Discord servers found. Make sure you authorized the right account.
                            <button className="pu-btn" style={{ marginTop: 8 }} onClick={() => void fetchDiscordGuilds()}>Retry</button>
                          </div>
                        ) : (
                          <>
                            <div className="pu-discordStepLabel">SELECT A SERVER</div>
                            <div className="pu-discordGuilds">
                              {sortedDiscordGuilds.map((g) => (
                                <div key={g.id}>
                                  <div className={`pu-discordGuild${g.installed ? " ready" : ""}${discordRequestGuildId === g.id ? " pu-discordGuildActive" : ""}`}>
                                    <div className="pu-discordGuildLeft">
                                      <div className="pu-discordGuildName">{g.name}</div>
                                      <div className="pu-discordGuildStatus">
                                        {g.installed ? "✓ Bot ready" : g.can_manage ? "Add bot to use" : "Needs admin"}
                                      </div>
                                    </div>
                                    {g.installed ? (
                                      <button className="pu-btn pu-btnPrimary" type="button"
                                        onClick={() => void fetchDiscordChannels(g.id)}>
                                        Select →
                                      </button>
                                    ) : g.can_manage ? (
                                      <button className="pu-btn" type="button" onClick={() => void installBot()}>
                                        Add Bot
                                      </button>
                                    ) : (
                                      <button
                                        className={`pu-btn${discordRequestGuildId === g.id && discordRequestMessage ? " pu-btnActive" : ""}`}
                                        type="button"
                                        disabled={discordRequestLoading === g.id}
                                        onClick={() => void requestAdminInstall(g)}
                                      >
                                        {discordRequestLoading === g.id ? "…" : discordRequestGuildId === g.id && discordRequestMessage ? "✓ Copied" : "Request"}
                                      </button>
                                    )}
                                  </div>
                                  {/* Inline request panel — shown right under this guild */}
                                  {discordRequestGuildId === g.id && discordRequestMessage && (
                                    <div className="pu-discordRequest">
                                      <div className="pu-discordRequestLabel">
                                        Message copied to clipboard! Send it to the admin of <strong>{g.name}</strong>:
                                      </div>
                                      <div className="pu-discordRequestPreview">
                                        {discordRequestMessage}
                                      </div>
                                      <div className="pu-discordRequestBtns">
                                        <button className="pu-btn" type="button" onClick={() => void copyRequestMessage()}>
                                          Copy again
                                        </button>
                                        {discordRequestInvite && (
                                          <button className="pu-btn" type="button"
                                            onClick={() => window.open(discordRequestInvite, "_blank", "noopener,noreferrer")}>
                                            Open invite link
                                          </button>
                                        )}
                                        <button className="pu-btn" style={{ marginLeft: "auto" }} type="button"
                                          onClick={() => { setDiscordRequestGuildId(""); setDiscordRequestMessage(""); setDiscordRequestInvite(""); }}>
                                          Dismiss
                                        </button>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          </>
                        )}
                      </div>
                    )}

                    {/* Step 3: channel list */}
                    {discordState === "connected" && selectedDiscordGuildId && !selectedDiscordChannelId && (
                      <div className="pu-discordStep">
                        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                          <button className="pu-btn" style={{ height: 28, padding: "0 10px", fontSize: 11 }} type="button"
                            onClick={() => { setSelectedDiscordGuildId(""); setDiscordChannels([]); }}>
                            ← Back
                          </button>
                          <div className="pu-discordStepLabel" style={{ margin: 0 }}>
                            {selectedDiscordGuild?.name} — PICK A CHANNEL
                          </div>
                        </div>
                        {discordChannelsLoading ? (
                          <div className="pu-discordLoading"><div className="pu-discordSpinner" /><span>Loading channels…</span></div>
                        ) : discordChannels.length === 0 ? (
                          <div className="pu-discordEmpty">No text channels found. Make sure the bot has read access.</div>
                        ) : (
                          <div className="pu-discordChannels">
                            {discordChannels.map((c) => (
                              <button
                                key={c.id}
                                className={`pu-discordChan${selectedDiscordChannelId === c.id ? " active" : ""}`}
                                type="button"
                                onClick={() => setSelectedDiscordChannelId(c.id)}
                              >
                                # {c.name}
                              </button>
                            ))}
                          </div>
                        )}
                        {selectedDiscordChannelId && !discordChannelsLoading && (
                          <div style={{ marginTop: 10, fontSize: 12, color: "rgba(95,227,100,0.9)", fontWeight: 800 }}>
                            ✓ #{discordChannels.find(c => c.id === selectedDiscordChannelId)?.name} selected — click Continue above to import.
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <div className={`pu-drop${dragging ? " drag" : ""}`}>
                    <div className="pu-dropInner">
                      <div>
                        <div className="pu-dropTitle">Drag & drop files here</div>
                        <div className="pu-dropSub">Supported: most file types • Local selection</div>
                      </div>
                      <div className="pu-btnRow">
                        <button className="pu-btn" onClick={onBrowse} type="button" suppressHydrationWarning>
                          Select files
                        </button>
                      </div>
                    </div>
                  </div>

                  <input ref={inputRef} type="file" multiple hidden onChange={onInputChange} accept="*/*" />

                  {files.length > 0 ? (
                    <div className="pu-fileList" aria-label="Selected files">
                      {files.map((f) => (
                        <div key={f.id} className="pu-fileItem">
                          <div>
                            <div className="pu-fileName">{f.file.name}</div>
                            <div className="pu-fileSize">{formatBytes(f.file.size)}</div>
                          </div>
                          <button
                            className="pu-remove"
                            onClick={() => removeFile(f.id)}
                            aria-label="Remove file"
                            suppressHydrationWarning
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
            ) : (
              <div className="pu-chatCanvas">
                
                {/* Chat feed */}
                <div ref={chatListRef} className="pu-chatScroll">
                  {
                  isAnonymous ? (
                    <div
                    style={{
                      margin:"0 10px 6px 10px",
                      padding:"10px 14px",
                      borderRadius:"14px",
                      border: "1px solid rgba(255,255,255,0.12)",
                      background: "rgba(48, 48, 48, 0.85)",
                      fontSize: "12px",
                      fontWeight: 600,
                      color: "rgba(255,255,255,0.85)",
                      backdropFilter: "blur(10px)",
                      WebkitBackdropFilter: "blur(10px)",

                    }}
                    > You are using anonymous mode. Chats and uploads will not be saved after you close this tab.
                    </div>
                  ) : null
                }
                  {messages.map((m) => (
                    <div key={m.id} className={`pu-msgRow ${m.role === "user" ? "right" : "left"}`}>
                      <div className={`pu-msgBubble ${m.role === "user" ? "user" : "ai"}`}>
                        {m.title ? <div className="pu-msgTitle">{m.title}</div> : null}
                        {m.meta  ? <div className="pu-msgMeta">{m.meta}</div>  : null}

                        {/* ── Podcast rich card ── */}
                        {m.outputType === "podcast" && !m.loading ? (
                          <PodcastCard
                            speakers={m.podcastSpeakers ?? ["Host", "Guest"]}
                            script={m.podcastScript ?? []}
                            audioUrl={m.audioUrl ?? null}
                            audioLoading={m.audioLoading ?? false}
                          />
                        ) : m.outputType === "flash_card" && !m.loading && Array.isArray(m.flashCards) ? (
                          /* ── Flashcard rich card ── */
                          <FlashCardDeck cards={m.flashCards} />
                        ) : (
                          /* ── Plain text (study guide, narrative, chat) ── */
                          <div className={`pu-msgText ${m.loading ? "loading" : ""}`}>{m.text}</div>
                        )}
                      </div>
                    </div>
                  ))}

                  {shouldShowOutputPicker && (
                  <div className="pu-msgRow right">
                    <div className="pu-outputPickerInFeed">
                      <div className="pu-pickerTitle">What should I make from your notes ??</div>
                      <div className="pu-pickerSub">Choose one. You can refine the result right after.</div>
                      <div className="pu-outputRow">
                        <button className="pu-outputBtn" onClick={() => void onSelectOutput("podcast")} disabled={generating}>
                          Podcast
                        </button>
                        <button className="pu-outputBtn" onClick={() => void onSelectOutput("study_guide")} disabled={generating}>
                          Study Guide
                        </button>
                        <button className="pu-outputBtn" onClick={() => void onSelectOutput("narrative")} disabled={generating}>
                          Narrative
                        </button>
                        <button className="pu-outputBtn" onClick={() => void onSelectOutput("flash_card")} disabled={generating}>
                          Flash Cards
                        </button>
                      </div>
                    </div>
                  </div>
                )}
                </div>

                {/* Bottom bar */}
                <div className="pu-chatBarWrap">
                  <div className="pu-chatBar">
                    <button className="pu-attach" type="button" onClick={onUploadMore} suppressHydrationWarning>
                      <PaperclipIcon />
                      <span className="pu-attachText">
                        {uploaded.length || 0} file(s)
                        {uploading ? " • uploading…" : ""}
                        {!uploading && pendingUploadCount > 0 ? ` • pending: ${pendingUploadCount}` : ""}
                      </span>
                    </button>

                    <input
                      className="pu-chatInput"
                      placeholder={composerPlaceholder}
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          onSendChat();
                        }
                      }}
                      disabled={generating || (!canChatInCurrentThread && !files.length && !uploaded.length)}
                      suppressHydrationWarning
                      autoComplete="off"
                      autoCorrect="off"
                      autoCapitalize="none"
                      spellCheck={false}
                      data-gramm="false"
                      data-gramm_editor="false"
                      data-enable-grammarly="false"
                    />
                    <button
                      className="pu-send"
                      onClick={onSendChat}
                      disabled={generating || !chatInput.trim() || !canChatInCurrentThread}
                      aria-label="Send"
                      suppressHydrationWarning
                    >
                      <SendIcon />
                    </button>
                  </div>
                </div>

                <input ref={inputRef} type="file" multiple hidden onChange={onInputChange} accept="*/*" />
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Podcast inline audio card
// ─────────────────────────────────────────────
function PodcastCard({
  speakers,
  script,
  audioUrl,
  audioLoading,
}: {
  speakers: [string, string];
  script: PodcastTurn[];
  audioUrl: string | null;
  audioLoading: boolean;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [showScript, setShowScript] = useState(false);

  const togglePlay = () => {
    const a = audioRef.current;
    if (!a) return;
    if (playing) { a.pause(); setPlaying(false); }
    else { void a.play(); setPlaying(true); }
  };

  const fmt = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  return (
    <div className="pc-root">
      {/* header */}
      <div className="pc-header">
        <div className="pc-icon">🎙</div>
        <div>
          <div className="pc-title">Podcast</div>
          <div className="pc-sub">{speakers[0]} &amp; {speakers[1]} · {script.length} turns</div>
        </div>
      </div>

      {/* audio player */}
      {audioUrl ? (
        <>
          <audio
            ref={audioRef}
            src={audioUrl}
            onTimeUpdate={(e) => setProgress((e.currentTarget.currentTime / (e.currentTarget.duration || 1)) * 100)}
            onDurationChange={(e) => setDuration(e.currentTarget.duration)}
            onEnded={() => setPlaying(false)}
          />
          <div className="pc-playerBar">
            <button className="pc-playBtn" onClick={togglePlay} type="button">
              {playing ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg>
              )}
            </button>
            <div className="pc-progressWrap">
              <div className="pc-waveform">
                {Array.from({ length: 32 }).map((_, i) => {
                  const pct = progress / 100;
                  const pos = i / 32;
                  const h = 20 + Math.abs(Math.sin((i * 0.7) + 1.3) * Math.cos(i * 0.4) * 22);
                  return (
                    <div
                      key={i}
                      className="pc-bar"
                      style={{
                        height: `${h}px`,
                        background: pos <= pct
                          ? "linear-gradient(180deg,#5aa8ff,#5fe3ff)"
                          : "rgba(255,255,255,0.15)",
                      }}
                    />
                  );
                })}
              </div>
              <input
                type="range" min={0} max={100} step={0.1}
                value={progress}
                className="pc-seek"
                onChange={(e) => {
                  const a = audioRef.current;
                  if (!a) return;
                  const v = parseFloat(e.target.value);
                  a.currentTime = (v / 100) * a.duration;
                  setProgress(v);
                }}
              />
            </div>
            <div className="pc-time">{fmt((progress / 100) * duration)} / {fmt(duration)}</div>
            <a href={audioUrl} download="podcast.mp3" className="pc-dl" title="Download MP3">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 16V4"/><path d="M8 12l4 4 4-4"/><path d="M4 20h16"/></svg>
            </a>
          </div>
        </>
      ) : (
        <div className="pc-audioLoading">
          {audioLoading ? (
            <><div className="pc-audioSpinner" /><span>Generating audio…</span></>
          ) : (
            <span style={{ color: "rgba(255,255,255,0.45)", fontSize: 12 }}>Audio unavailable</span>
          )}
        </div>
      )}

      {/* transcript toggle */}
      <button className="pc-scriptToggle" type="button" onClick={() => setShowScript((v) => !v)}>
        {showScript ? "Hide transcript ↑" : "Show transcript ↓"}
      </button>
      {showScript && (
        <div className="pc-script">
          {script.map((turn, i) => (
            <div key={i} className={`pc-turn ${turn.speaker === speakers[0] ? "host" : "guest"}`}>
              <span className="pc-speaker">{turn.speaker}</span>
              <span className="pc-turnText">{turn.text}</span>
            </div>
          ))}
        </div>
      )}

      <style jsx>{`
        .pc-root { display:flex; flex-direction:column; gap:10px; min-width:280px; max-width:520px; }
        .pc-header { display:flex; align-items:center; gap:10px; }
        .pc-icon { font-size:22px; line-height:1; }
        .pc-title { font-size:14px; font-weight:950; color:rgba(255,255,255,0.94); letter-spacing:-0.01em; }
        .pc-sub { font-size:11px; color:rgba(255,255,255,0.5); margin-top:2px; }
        .pc-playerBar { display:flex; align-items:center; gap:10px; padding:10px 12px; border-radius:14px; border:1px solid rgba(255,255,255,0.1); background:rgba(10,12,18,0.4); }
        .pc-playBtn { width:32px; height:32px; border-radius:50%; border:1px solid rgba(255,255,255,0.15); background:linear-gradient(135deg,rgba(90,168,255,0.85),rgba(95,227,255,0.85)); color:rgba(0,0,0,0.85); display:grid; place-items:center; cursor:pointer; flex-shrink:0; transition:transform 120ms; }
        .pc-playBtn:hover { transform:scale(1.06); }
        .pc-progressWrap { flex:1; position:relative; height:36px; display:flex; align-items:center; }
        .pc-waveform { position:absolute; inset:0; display:flex; align-items:center; gap:2px; pointer-events:none; overflow:hidden; }
        .pc-bar { flex:1; border-radius:2px; min-height:3px; transition:background 200ms; }
        .pc-seek { position:absolute; inset:0; width:100%; opacity:0; cursor:pointer; height:100%; }
        .pc-time { font-size:11px; font-weight:700; color:rgba(255,255,255,0.55); white-space:nowrap; flex-shrink:0; }
        .pc-dl { color:rgba(255,255,255,0.5); display:grid; place-items:center; flex-shrink:0; transition:color 140ms; }
        .pc-dl:hover { color:rgba(95,227,255,0.9); }
        .pc-audioLoading { display:flex; align-items:center; gap:8px; padding:10px 12px; border-radius:14px; border:1px solid rgba(255,255,255,0.08); background:rgba(10,12,18,0.3); font-size:12px; color:rgba(255,255,255,0.6); }
        .pc-audioSpinner { width:14px; height:14px; border-radius:50%; border:2px solid rgba(255,255,255,0.15); border-top-color:#5aa8ff; animation:spin 0.8s linear infinite; flex-shrink:0; }
        @keyframes spin { to { transform:rotate(360deg); } }
        .pc-scriptToggle { align-self:flex-start; font-size:11px; font-weight:700; color:rgba(95,227,255,0.7); background:none; border:none; cursor:pointer; padding:0; letter-spacing:0.02em; }
        .pc-scriptToggle:hover { color:rgba(95,227,255,1); }
        .pc-script { display:flex; flex-direction:column; gap:8px; max-height:280px; overflow-y:auto; padding:4px 0; }
        .pc-turn { display:flex; gap:8px; font-size:13px; line-height:1.5; }
        .pc-speaker { font-weight:900; min-width:46px; flex-shrink:0; }
        .pc-turn.host .pc-speaker { color:#5aa8ff; }
        .pc-turn.guest .pc-speaker { color:#5fe3ff; }
        .pc-turnText { color:rgba(255,255,255,0.82); }
      `}</style>
    </div>
  );
}

// ─────────────────────────────────────────────
// Flashcard inline deck
// ─────────────────────────────────────────────
function FlashCardDeck({ cards }: { cards: Array<{ front: string; back: string }> }) {
  const [idx, setIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);

  const go = (delta: number) => {
    setFlipped(false);
    setTimeout(() => setIdx((i) => Math.max(0, Math.min(cards.length - 1, i + delta))), 120);
  };

  const card = cards[idx];
  if (!card) return null;

  return (
    <div className="fc-root">
      <div className="fc-counter">{idx + 1} / {cards.length}</div>
      <div className={`fc-card ${flipped ? "flipped" : ""}`} onClick={() => setFlipped((v) => !v)}>
        <div className="fc-inner">
          <div className="fc-face fc-front"><span>{card.front}</span></div>
          <div className="fc-face fc-back"><span>{card.back}</span></div>
        </div>
        <div className="fc-hint">{flipped ? "Click to flip back" : "Click to reveal answer"}</div>
      </div>
      <div className="fc-nav">
        <button className="fc-navBtn" disabled={idx === 0} onClick={() => go(-1)} type="button">←</button>
        <div className="fc-dots">
          {cards.slice(Math.max(0, idx - 2), idx + 3).map((_, i) => {
            const real = Math.max(0, idx - 2) + i;
            return <div key={real} className={`fc-dot ${real === idx ? "active" : ""}`} />;
          })}
        </div>
        <button className="fc-navBtn" disabled={idx === cards.length - 1} onClick={() => go(1)} type="button">→</button>
      </div>

      <style jsx>{`
        .fc-root { display:flex; flex-direction:column; gap:10px; min-width:260px; max-width:460px; }
        .fc-counter { font-size:10px; font-weight:900; letter-spacing:0.1em; text-transform:uppercase; color:rgba(255,255,255,0.45); }
        .fc-card { cursor:pointer; perspective:900px; height:140px; }
        .fc-inner { position:relative; width:100%; height:100%; transform-style:preserve-3d; transition:transform 380ms cubic-bezier(.4,0,.2,1); }
        .fc-card.flipped .fc-inner { transform:rotateY(180deg); }
        .fc-face { position:absolute; inset:0; border-radius:16px; border:1px solid rgba(255,255,255,0.12); display:flex; align-items:center; justify-content:center; padding:18px; text-align:center; backface-visibility:hidden; -webkit-backface-visibility:hidden; }
        .fc-front { background:rgba(10,12,18,0.45); }
        .fc-back { background:rgba(16,22,40,0.55); border-color:rgba(90,168,255,0.22); transform:rotateY(180deg); }
        .fc-face span { font-size:14px; font-weight:700; color:rgba(255,255,255,0.9); line-height:1.5; }
        .fc-hint { font-size:10px; color:rgba(255,255,255,0.3); text-align:center; margin-top:4px; }
        .fc-nav { display:flex; align-items:center; justify-content:space-between; gap:8px; }
        .fc-navBtn { width:34px; height:34px; border-radius:50%; border:1px solid rgba(255,255,255,0.12); background:rgba(255,255,255,0.04); color:rgba(255,255,255,0.85); font-size:14px; cursor:pointer; display:grid; place-items:center; transition:background 140ms; }
        .fc-navBtn:hover:not(:disabled) { background:rgba(255,255,255,0.08); border-color:rgba(95,227,255,0.25); }
        .fc-navBtn:disabled { opacity:0.28; cursor:default; }
        .fc-dots { display:flex; gap:5px; align-items:center; }
        .fc-dot { width:5px; height:5px; border-radius:50%; background:rgba(255,255,255,0.2); transition:background 200ms; }
        .fc-dot.active { background:rgba(95,227,255,0.8); width:8px; border-radius:4px; }
      `}</style>
    </div>
  );
}

function HamburgerIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M5 7h14" stroke="rgba(255,255,255,0.90)" strokeWidth="2" strokeLinecap="round" />
      <path d="M5 12h14" stroke="rgba(255,255,255,0.90)" strokeWidth="2" strokeLinecap="round" />
      <path d="M5 17h14" stroke="rgba(255,255,255,0.90)" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M10.5 18.5a8 8 0 1 1 0-16 8 8 0 0 1 0 16Z" stroke="rgba(255,255,255,0.55)" strokeWidth="2" />
      <path
        d="M16.5 16.5 21 21"
        stroke="rgba(255,255,255,0.55)"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 12l16-8-7 16-2-7-7-1Z"
        stroke="rgba(255,255,255,0.92)"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function PaperclipIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M21 12.5 12.9 20.6a6 6 0 0 1-8.5-8.5l9.2-9.2a4.5 4.5 0 0 1 6.4 6.4l-9.4 9.4a3 3 0 0 1-4.2-4.2l8.7-8.7"
        stroke="rgba(255,255,255,0.72)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function FlashCardsIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M7 7h11a2 2 0 0 1 2 2v9" stroke="rgba(255,255,255,0.72)" strokeWidth="2" strokeLinecap="round" />
      <path d="M6 5h11a2 2 0 0 1 2 2" stroke="rgba(255,255,255,0.55)" strokeWidth="2" strokeLinecap="round" />
      <rect x="4" y="8" width="14" height="12" rx="2" stroke="rgba(255,255,255,0.72)" strokeWidth="2" />
    </svg>
  );
}

function MicIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 14a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v5a3 3 0 0 0 3 3Z" stroke="rgba(255,255,255,0.72)" strokeWidth="2" />
      <path d="M19 11a7 7 0 0 1-14 0" stroke="rgba(255,255,255,0.55)" strokeWidth="2" strokeLinecap="round" />
      <path d="M12 18v3" stroke="rgba(255,255,255,0.55)" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function QuizIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M7 7h10" stroke="rgba(255,255,255,0.72)" strokeWidth="2" strokeLinecap="round" />
      <path d="M7 12h6" stroke="rgba(255,255,255,0.55)" strokeWidth="2" strokeLinecap="round" />
      <path d="M7 17h8" stroke="rgba(255,255,255,0.55)" strokeWidth="2" strokeLinecap="round" />
      <rect x="5" y="4" width="14" height="18" rx="2" stroke="rgba(255,255,255,0.72)" strokeWidth="2" />
    </svg>
  );
}

function DocIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" stroke="rgba(255,255,255,0.72)" strokeWidth="2" />
      <path d="M14 3v5h5" stroke="rgba(255,255,255,0.55)" strokeWidth="2" strokeLinejoin="round" />
      <path d="M8 12h8" stroke="rgba(255,255,255,0.55)" strokeWidth="2" strokeLinecap="round" />
      <path d="M8 16h6" stroke="rgba(255,255,255,0.55)" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

//Code Publish
function ChatIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4v8Z"
        stroke="rgba(255,255,255,0.72)"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path d="M7.5 9.5h9" stroke="rgba(255,255,255,0.55)" strokeWidth="2" strokeLinecap="round" />
      <path d="M7.5 13h6" stroke="rgba(255,255,255,0.55)" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function LinkIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M10.5 13.5 13.5 10.5" stroke="rgba(255,255,255,0.85)" strokeWidth="2" strokeLinecap="round" />
      <path
        d="M8.5 15.5 7 17a4 4 0 0 1-5.7-5.7l1.5-1.5a4 4 0 0 1 5.7 0"
        stroke="rgba(255,255,255,0.85)"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M15.5 8.5 17 7a4 4 0 0 1 5.7 5.7l-1.5 1.5a4 4 0 0 1-5.7 0"
        stroke="rgba(255,255,255,0.85)"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 3v10" stroke="rgba(255,255,255,0.85)" strokeWidth="2" strokeLinecap="round" />
      <path
        d="M8 11l4 4 4-4"
        stroke="rgba(255,255,255,0.85)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M5 21h14" stroke="rgba(255,255,255,0.55)" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
