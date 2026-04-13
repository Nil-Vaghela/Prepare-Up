/**
 * API client for Prepare-Up backend.
 * All requests include credentials (cookies) and optional Bearer token.
 */

const BASE = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";

export type UserProfile = {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  email: string | null;
};

export type UploadedFile = {
  id: string;
  name: string;
  status: string;
  text_len: number;
};

export type UploadResult = {
  session_id: string;
  files: UploadedFile[];
  preview: string;
  preview_len: number;
};

export type Flashcard = {
  front: string;
  back: string;
};

export type FlashcardResult = {
  type: "flash_card";
  cards: Flashcard[];
};

export type StudyGuideResult = {
  type: "study_guide";
  text: string;
};

export type PodcastScriptTurn = {
  speaker: string;
  text: string;
};

export type PodcastResult = {
  type: "podcast";
  speakers: [string, string];
  script: PodcastScriptTurn[];
};

export type ChatThread = {
  id: string;
  title: string | null;
  updated_at: string;
  source_session_id: string | null;
  source_files: UploadedFile[];
  combined_text_len: number;
};

async function request<T>(
  path: string,
  init: RequestInit = {},
  accessToken?: string | null
): Promise<T> {
  const headers: Record<string, string> = {
    ...(init.headers as Record<string, string>),
  };
  if (accessToken) {
    headers["Authorization"] = `Bearer ${accessToken}`;
  }
  if (!(init.body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
  }

  const res = await fetch(`${BASE}${path}`, {
    credentials: "include",
    ...init,
    headers,
  });

  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const json = await res.json();
      msg = json.detail || JSON.stringify(json);
    } catch {
      // ignore
    }
    throw new Error(msg);
  }

  // For binary responses (audio)
  const ct = res.headers.get("content-type") || "";
  if (ct.startsWith("audio/")) {
    return res.blob() as unknown as T;
  }

  return res.json() as Promise<T>;
}

// ---- Auth ----

export async function loginWithGoogle(idToken: string): Promise<{ access_token: string; user: UserProfile }> {
  return request("/api/auth/google", {
    method: "POST",
    body: JSON.stringify({ id_token: idToken }),
  });
}

export async function getMe(accessToken: string): Promise<UserProfile> {
  return request("/api/auth/me", {}, accessToken);
}

export async function refreshToken(): Promise<{ access_token: string; user: UserProfile }> {
  return request("/api/auth/refresh", { method: "POST" });
}

export async function logout(): Promise<void> {
  return request("/api/auth/logout", { method: "POST" });
}

// ---- Upload ----

export async function uploadFiles(files: File[], accessToken?: string | null): Promise<UploadResult> {
  const form = new FormData();
  files.forEach((f) => form.append("files", f));
  return request<UploadResult>("/api/upload", { method: "POST", body: form }, accessToken);
}

// ---- Generate ----

export async function generateFlashcards(
  sessionId: string,
  count = 20,
  accessToken?: string | null
): Promise<FlashcardResult> {
  return request<FlashcardResult>(
    "/api/generate",
    { method: "POST", body: JSON.stringify({ session_id: sessionId, output_type: "flash_card", count }) },
    accessToken
  );
}

export async function generateStudyGuide(
  sessionId: string,
  accessToken?: string | null
): Promise<StudyGuideResult> {
  return request<StudyGuideResult>(
    "/api/generate",
    { method: "POST", body: JSON.stringify({ session_id: sessionId, output_type: "study_guide" }) },
    accessToken
  );
}

export async function generatePodcast(
  sessionId: string,
  accessToken?: string | null
): Promise<PodcastResult> {
  return request<PodcastResult>(
    "/api/generate",
    { method: "POST", body: JSON.stringify({ session_id: sessionId, output_type: "podcast" }) },
    accessToken
  );
}

// ---- Podcast Audio ----

export async function generatePodcastAudio(
  speakers: [string, string],
  script: PodcastScriptTurn[],
  accessToken?: string | null
): Promise<Blob> {
  const res = await fetch(`${BASE}/api/podcast/audio`, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    body: JSON.stringify({ speakers, script }),
  });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try { msg = (await res.json()).detail || msg; } catch { /* */ }
    throw new Error(msg);
  }
  return res.blob();
}

// ---- Chat ----

export async function getThreads(accessToken?: string | null): Promise<{ threads: ChatThread[] }> {
  return request<{ threads: ChatThread[] }>("/api/chat/threads", {}, accessToken);
}

export async function sendChat(
  sessionId: string,
  message: string,
  threadId: string | null,
  history: Array<{ role: "user" | "ai"; content: string }>,
  accessToken?: string | null
): Promise<{ type: string; answer: string; thread_id: string }> {
  return request(
    "/api/chat",
    {
      method: "POST",
      body: JSON.stringify({ session_id: sessionId, message, thread_id: threadId, history }),
    },
    accessToken
  );
}

// ---- Discord ----

export async function getDiscordStatus(): Promise<{ connected: boolean }> {
  return request("/api/discord/status", {});
}

export async function getDiscordGuilds(): Promise<{ guilds: unknown[] }> {
  return request("/api/discord/guilds", {});
}

export async function importDiscordChannel(
  channelId: string,
  maxMessages = 500
): Promise<{ channel_id: string; count: number; text: string }> {
  return request(`/api/discord/bot/channels/${channelId}/import?max_messages=${maxMessages}`, {
    method: "POST",
  });
}

export async function ingestDiscordText(
  text: string,
  channelName: string,
  accessToken?: string | null
): Promise<UploadResult> {
  // Send discord transcript as a text file to the upload endpoint
  const blob = new Blob([text], { type: "text/plain" });
  const file = new File([blob], `discord-${channelName}.txt`, { type: "text/plain" });
  return uploadFiles([file], accessToken);
}
