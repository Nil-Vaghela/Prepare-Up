"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type VoiceState =
  | "idle"
  | "connecting"
  | "listening"
  | "thinking"
  | "speaking"
  | "error"
  | "ended";

export interface TranscriptEntry {
  id: string;
  role: "user" | "ai";
  text: string;
  timestamp: Date;
  partial: boolean;
}

export interface UseVoiceSessionOptions {
  /** PrepareUp upload session ID — used to ground the tutor in study material */
  studySessionId?: string | null;
  voice?: string;
  accessToken?: string | null;
  onError?: (msg: string) => void;
}

export interface UseVoiceSessionReturn {
  state: VoiceState;
  transcript: TranscriptEntry[];
  isMuted: boolean;
  /** 0–1 amplitude, updated ~60fps — drives orb animation */
  audioLevel: number;
  /** 0–1 amplitude of AI output audio */
  aiAudioLevel: number;
  startSession: () => Promise<void>;
  stopSession: () => void;
  toggleMute: () => void;
  interruptAI: () => void;
  clearTranscript: () => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BACKEND_BASE =
  (typeof process !== "undefined" && process.env.NEXT_PUBLIC_BACKEND_URL) ||
  "http://localhost:8000";

const REALTIME_MODEL = "gpt-4o-realtime-preview";

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useVoiceSession(
  options: UseVoiceSessionOptions = {}
): UseVoiceSessionReturn {
  const { studySessionId, voice = "alloy", accessToken, onError } = options;

  const [state, setState] = useState<VoiceState>("idle");
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [isMuted, setIsMuted] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [aiAudioLevel, setAiAudioLevel] = useState(0);

  // WebRTC refs
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const audioElRef = useRef<HTMLAudioElement | null>(null);

  // Audio analysis refs
  const micAnalyserRef = useRef<AnalyserNode | null>(null);
  const aiAnalyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  // Transcript accumulation
  const aiPartialRef = useRef<{ id: string; text: string } | null>(null);

  // Echo suppression: track whether AI is currently outputting audio loudly
  const aiIsSpeakingRef = useRef(false);

  // -------------------------------------------------------------------------
  // State updater
  // -------------------------------------------------------------------------

  const updateState = useCallback((s: VoiceState) => setState(s), []);

  const emitError = useCallback(
    (msg: string) => {
      onError?.(msg);
    },
    [onError]
  );

  // -------------------------------------------------------------------------
  // Transcript helpers
  // -------------------------------------------------------------------------

  const upsertTranscript = useCallback((entry: TranscriptEntry) => {
    setTranscript((prev) => {
      const idx = prev.findIndex((e) => e.id === entry.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = entry;
        return next;
      }
      return [...prev, entry];
    });
  }, []);

  const clearTranscript = useCallback(() => setTranscript([]), []);

  // -------------------------------------------------------------------------
  // Audio level tracking (mic + AI output)
  // -------------------------------------------------------------------------

  const startLevelTracking = useCallback(
    (micStream: MediaStream, remoteStream: MediaStream) => {
      const ctx = new AudioContext();
      audioCtxRef.current = ctx;

      // Mic analyser
      const micSrc = ctx.createMediaStreamSource(micStream);
      const micAna = ctx.createAnalyser();
      micAna.fftSize = 256;
      micSrc.connect(micAna);
      micAnalyserRef.current = micAna;

      // AI output analyser
      const aiSrc = ctx.createMediaStreamSource(remoteStream);
      const aiAna = ctx.createAnalyser();
      aiAna.fftSize = 256;
      aiSrc.connect(aiAna);
      aiAnalyserRef.current = aiAna;

      const micData = new Uint8Array(micAna.frequencyBinCount);
      const aiData = new Uint8Array(aiAna.frequencyBinCount);

      const tick = () => {
        micAna.getByteFrequencyData(micData);
        const micAvg = micData.reduce((a, b) => a + b, 0) / micData.length;
        setAudioLevel(Math.min(1, micAvg / 80));

        aiAna.getByteFrequencyData(aiData);
        const aiAvg = aiData.reduce((a, b) => a + b, 0) / aiData.length;
        const aiLevel = Math.min(1, aiAvg / 80);
        setAiAudioLevel(aiLevel);
        // Track if AI audio is loud enough to potentially cause echo
        aiIsSpeakingRef.current = aiLevel > 0.15;

        animFrameRef.current = requestAnimationFrame(tick);
      };
      tick();
    },
    []
  );

  const stopLevelTracking = useCallback(() => {
    if (animFrameRef.current !== null) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    setAudioLevel(0);
    setAiAudioLevel(0);
    try {
      audioCtxRef.current?.close();
    } catch {
      // ignore
    }
    audioCtxRef.current = null;
    micAnalyserRef.current = null;
    aiAnalyserRef.current = null;
  }, []);

  // -------------------------------------------------------------------------
  // Data channel message handler
  // -------------------------------------------------------------------------

  const handleMessage = useCallback(
    (event: MessageEvent) => {
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(event.data as string);
      } catch {
        return;
      }

      const type = msg.type as string | undefined;

      switch (type) {
        // User speech activity
        case "input_audio_buffer.speech_started": {
          // Echo suppression: if AI is still outputting audio loudly,
          // this "speech" is likely its own voice feeding back through speakers.
          // Clear the buffer to discard it. Real user interruptions have
          // high mic level AND low/dropping AI level — those pass through.
          if (aiIsSpeakingRef.current && dcRef.current?.readyState === "open") {
            dcRef.current.send(JSON.stringify({ type: "input_audio_buffer.clear" }));
            // Do NOT transition state — keep speaking
          } else {
            updateState("listening");
          }
          break;
        }

        case "input_audio_buffer.speech_stopped":
        case "input_audio_buffer.committed":
          updateState("thinking");
          break;

        // User transcript (Whisper)
        case "conversation.item.input_audio_transcription.completed": {
          const text = ((msg.transcript as string) || "").trim();
          if (text) {
            upsertTranscript({
              id: (msg.item_id as string) || `user-${Date.now()}`,
              role: "user",
              text,
              timestamp: new Date(),
              partial: false,
            });
          }
          break;
        }

        // AI response lifecycle
        case "response.created":
          updateState("speaking");
          aiPartialRef.current = null;
          break;

        case "response.audio_transcript.delta": {
          const delta = (msg.delta as string) || "";
          const id = (msg.item_id as string) || "ai-partial";
          if (!aiPartialRef.current) {
            aiPartialRef.current = { id, text: delta };
          } else {
            aiPartialRef.current.text += delta;
          }
          upsertTranscript({
            id: aiPartialRef.current.id,
            role: "ai",
            text: aiPartialRef.current.text,
            timestamp: new Date(),
            partial: true,
          });
          break;
        }

        case "response.audio_transcript.done": {
          const finalText = (msg.transcript as string) || aiPartialRef.current?.text || "";
          const id = aiPartialRef.current?.id || `ai-${Date.now()}`;
          if (finalText.trim()) {
            upsertTranscript({
              id,
              role: "ai",
              text: finalText.trim(),
              timestamp: new Date(),
              partial: false,
            });
          }
          aiPartialRef.current = null;
          break;
        }

        case "response.done":
          aiIsSpeakingRef.current = false;
          updateState("listening");
          break;

        // Errors
        case "error": {
          const errMsg =
            (msg.error as { message?: string })?.message ||
            "Voice session error";
          console.error("[VoiceSession] OpenAI error:", msg.error);
          emitError(errMsg);
          break;
        }

        default:
          break;
      }
    },
    [updateState, upsertTranscript, emitError]
  );

  // -------------------------------------------------------------------------
  // Cleanup
  // -------------------------------------------------------------------------

  const cleanup = useCallback(() => {
    stopLevelTracking();

    micStreamRef.current?.getTracks().forEach((t) => t.stop());
    micStreamRef.current = null;

    dcRef.current?.close();
    dcRef.current = null;

    pcRef.current?.close();
    pcRef.current = null;

    if (audioElRef.current) {
      audioElRef.current.srcObject = null;
      audioElRef.current = null;
    }

    remoteStreamRef.current = null;
  }, [stopLevelTracking]);

  // Cleanup on unmount
  useEffect(() => cleanup, [cleanup]);

  // -------------------------------------------------------------------------
  // Start session
  // -------------------------------------------------------------------------

  const startSession = useCallback(async () => {
    if (state === "connecting" || state === "listening" || state === "speaking") return;

    try {
      updateState("connecting");

      // 1. Request microphone
      let micStream: MediaStream;
      try {
        micStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            sampleRate: 24000,
          },
        });
        micStreamRef.current = micStream;
      } catch {
        updateState("error");
        emitError(
          "Microphone access was denied. Please allow microphone access in your browser and try again."
        );
        return;
      }

      // 2. Get ephemeral token from our backend
      const tokenRes = await fetch(`${BACKEND_BASE}/api/voice/session`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({
          session_id: studySessionId ?? null,
          voice,
        }),
      });

      if (!tokenRes.ok) {
        let detail = `Server error ${tokenRes.status}`;
        try {
          detail = (await tokenRes.json()).detail || detail;
        } catch {
          // ignore
        }
        throw new Error(detail);
      }

      const { client_secret } = (await tokenRes.json()) as {
        client_secret: string;
        expires_at: number;
        openai_session_id: string;
        model: string;
      };

      // 3. Create RTCPeerConnection
      const pc = new RTCPeerConnection();
      pcRef.current = pc;

      // 4. Wire remote audio → hidden <audio> element
      const audioEl = new Audio();
      audioEl.autoplay = true;
      audioElRef.current = audioEl;

      pc.ontrack = (e) => {
        const [remoteStream] = e.streams;
        remoteStreamRef.current = remoteStream;
        audioEl.srcObject = remoteStream;
        // Start level tracking once we have both streams
        if (micStreamRef.current) {
          startLevelTracking(micStreamRef.current, remoteStream);
        }
      };

      // 5. Add mic track to peer connection
      micStream.getAudioTracks().forEach((track) =>
        pc.addTrack(track, micStream)
      );

      // 6. Data channel for event messages
      const dc = pc.createDataChannel("oai-events");
      dcRef.current = dc;

      dc.onopen = () => {
        updateState("listening");
      };

      dc.onmessage = handleMessage;

      dc.onerror = (e) => {
        console.error("[VoiceSession] Data channel error:", e);
        emitError("Voice connection error — please restart the session.");
      };

      pc.onconnectionstatechange = () => {
        if (
          pc.connectionState === "failed" ||
          pc.connectionState === "disconnected"
        ) {
          updateState("error");
          emitError("Voice connection was lost. Please restart the session.");
        }
      };

      // 7. SDP offer
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      // 8. Exchange SDP with OpenAI Realtime API
      const sdpRes = await fetch(
        `https://api.openai.com/v1/realtime?model=${REALTIME_MODEL}`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${client_secret}`,
            "Content-Type": "application/sdp",
          },
          body: offer.sdp,
        }
      );

      if (!sdpRes.ok) {
        throw new Error(
          `OpenAI Realtime connection failed (${sdpRes.status}). Check your API key has Realtime access.`
        );
      }

      const answerSdp = await sdpRes.text();
      await pc.setRemoteDescription({ type: "answer", sdp: answerSdp });

      // Session established — state transitions happen via data channel events
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Failed to start voice session";
      console.error("[VoiceSession] Start error:", err);
      updateState("error");
      emitError(msg);
      cleanup();
    }
  }, [
    state,
    studySessionId,
    voice,
    accessToken,
    updateState,
    emitError,
    handleMessage,
    startLevelTracking,
    cleanup,
  ]);

  // -------------------------------------------------------------------------
  // Controls
  // -------------------------------------------------------------------------

  const stopSession = useCallback(() => {
    cleanup();
    updateState("ended");
  }, [cleanup, updateState]);

  const toggleMute = useCallback(() => {
    const tracks = micStreamRef.current?.getAudioTracks() ?? [];
    const nextMuted = !isMuted;
    tracks.forEach((t) => {
      t.enabled = !nextMuted;
    });
    setIsMuted(nextMuted);
  }, [isMuted]);

  const interruptAI = useCallback(() => {
    if (dcRef.current?.readyState === "open") {
      dcRef.current.send(JSON.stringify({ type: "response.cancel" }));
      updateState("listening");
    }
  }, [updateState]);

  return {
    state,
    transcript,
    isMuted,
    audioLevel,
    aiAudioLevel,
    startSession,
    stopSession,
    toggleMute,
    interruptAI,
    clearTranscript,
  };
}
