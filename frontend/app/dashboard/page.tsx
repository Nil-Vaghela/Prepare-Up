"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";

type LocalFile = { id: string; file: File };

type UploadedFile = {
  id: string;
  name: string;
  status: "extracted" | "needs_ocr" | "error" | string;
  textLen: number;
};

type OutputType = "podcast" | "study_guide" | "narrative" | "flash_card";
type ChatRole = "user" | "ai";

type ChatMessage = {
  id: string;
  role: ChatRole;
  title?: string;
  meta?: string;
  text: string;
  loading?: boolean;
};

type ChatSession = {
  id: string;
  title: string;
  updatedAt: number;

  backendSessionId: string | null; // from /api/upload

  uploaded: UploadedFile[];
  combinedTextLen: number;

  selectedOutput: OutputType | null;
  messages: ChatMessage[];
};

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
  // Sidebar is NOT a router. It only offers generation modes.
  const [sidebarActive, setSidebarActive] = useState<"flash_cards" | "podcast" | "mock_test" | "study_guide" | null>(
    null
  );

  const onSidebarSelect = (key: "flash_cards" | "podcast" | "mock_test" | "study_guide") => {
    // Do NOT let users pick a mode before they have uploaded.
    // Otherwise we accidentally create empty threads like "New chat".
    if (!sessionId && uploaded.length === 0) {
      // Sprint 1: sidebar items are non-functional until upload exists
      return;
    }

    // Keep user on the single chat surface.
    if (view !== "chat") setView("chat");

    // Sprint 1: do not visually activate sidebar items
    // setSidebarActive(key);

    if (key === "flash_cards") {
      setSelectedOutput("flash_card");
      // upsertActiveSession({ selectedOutput: "flash_card" }); // removed per instructions
      return;
    }

    if (key === "podcast") {
      setSelectedOutput("podcast");
      // upsertActiveSession({ selectedOutput: "podcast" }); // removed per instructions
      return;
    }

    if (key === "study_guide") {
      setSelectedOutput("study_guide");
      // upsertActiveSession({ selectedOutput: "study_guide" }); // removed per instructions
      return;
    }

    // mock_test not implemented yet
    if (key === "mock_test") {
      // Sprint 1: no-op
      return;
    }
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
  const chatListRef = useRef<HTMLDivElement | null>(null);
  // Real chat threads (created when the user uploads / starts chatting)
  const [recentQuery, setRecentQuery] = useState("");
  const [recentVisible, setRecentVisible] = useState(12);
  const [chatSessions, setChatSessions] = useState<ChatSession[]>([]);

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

    setSidebarActive(null);
    setRecentQuery("");
    setRecentVisible(12);
  };

  const openChatThread = (id: string) => {
    const s = chatSessions.find((x) => x.id === id);
    if (!s) return;

    setActiveChatIdSync(s.id);
    setView("chat");

    setUploaded(s.uploaded);
    setCombinedTextLen(s.combinedTextLen);
    setSessionId(s.backendSessionId);

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

  const canContinue = files.length > 0 && !uploading;

  // -----------------------------
  // Discord integration (simple redirect)
  // -----------------------------
  const BACKEND_BASE = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";
  const DISCORD_CONNECT_URL =
    process.env.NEXT_PUBLIC_DISCORD_CONNECT_URL || `${BACKEND_BASE}/api/auth/discord`;

  const onConnectDiscord = () => {
    window.location.href = DISCORD_CONNECT_URL;
  };

  // Auto-upload-more behavior (no sync button)
  const pendingUploadCount = Math.max(0, files.length - uploaded.length);
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
    if (!files.length || uploading) return;

    setUploading(true);
    try {
      const form = new FormData();
      for (const f of files) form.append("files", f.file);

      const res = await fetch("http://localhost:8000/api/upload", { method: "POST", body: form });
      if (!res.ok) {
        const msg = await res.text();
        throw new Error(msg || "Upload failed");
      }

      const data = await res.json();

      // Support both backend response shapes:
      // Old: { files, combined_text, combined_len }
      // New: { session_id, files, preview, preview_len, ttl_seconds }
      const sid = typeof data.session_id === "string" ? data.session_id : null;
      if (sid) setSessionId(sid);

      const normalized: UploadedFile[] = (data.files || []).map((f: any) => {
        const name = f.name || f.filename || "unknown";
        const status = f.status || "extracted";

        // Prefer server-provided lengths if present
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

      // Prefer server-provided combined length; fallback to combined_text length; fallback to preview length
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
      // Only upsert here when we are already in chat (adding more files).
      // For the first upload, we upsert once with both sources + initial messages below.
      if (view !== "upload") {
        upsertActiveSession({ backendSessionId: sid || sessionId, uploaded: normalized, combinedTextLen: combinedLen });
      }

      if (view === "upload") {
        setView("chat");
        const initialMessages: ChatMessage[] = [
          {
            id: crypto.randomUUID(),
            role: "user",
            title: "Hello",
            text: `I uploaded ${normalized.length || 0} file(s). Can you help me?`,
          },
          {
            id: crypto.randomUUID(),
            role: "ai",
            title: "Welcome",
            meta: `Sources: ${normalized.length || 0} file(s) • ${channelsCount} channel`,
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
              ? { ...m, meta: `Sources: ${normalized.length || 0} file(s) • ${channelsCount} channel` }
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
    if (!sessionId) {
      alert("Upload is not ready yet. Please upload files first.");
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
      const res = await fetch("http://localhost:8000/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: sessionId,
          output_type: k,
        }),
      });

      if (!res.ok) {
        const msg = await res.text();
        throw new Error(msg || "Generate failed");
      }

      const data = await res.json();
      const answer =
        typeof data.text === "string"
          ? data.text
          : Array.isArray(data.cards)
          ? data.cards
              .map((c: any, i: number) => {
                const front = typeof c?.front === "string" ? c.front : "";
                const back = typeof c?.back === "string" ? c.back : "";
                return `${i + 1}. ${front}\n   - ${back}`;
              })
              .join("\n\n")
          : typeof data.response === "string"
          ? data.response
          : JSON.stringify(data);

      setMessages((prev) => {
        const next = prev.map((m) => (m.id === aiLoadingId ? { ...m, text: answer, loading: false } : m));
        upsertActiveSession({ messages: next });
        return next;
      });
    } catch (e: any) {
      setMessages((prev) => {
        const next = prev.map((m) =>
          m.id === aiLoadingId ? { ...m, text: `Error: ${e?.message || "Something went wrong"}`, loading: false } : m
        );
        upsertActiveSession({ messages: next });
        return next;
      });
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
    if (!sessionId) {
      alert("Upload is not ready yet. Please upload files first.");
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
      const res = await fetch("http://localhost:8000/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: sessionId,
          message: text,
          history: messages
            .filter((m) => !m.loading)
            .slice(-12)
            .map((m) => ({
              role: m.role, // "user" | "ai" (matches backend)
              content: [m.title, m.meta, m.text].filter(Boolean).join("\n"),
            })),
        }),
      });

      if (!res.ok) {
        const msg = await res.text();
        throw new Error(msg || "Chat failed");
      }

      const data = await res.json();
      const answer =
        typeof data.answer === "string"
          ? data.answer
          : typeof data.text === "string"
          ? data.text
          : typeof data.response === "string"
          ? data.response
          : JSON.stringify(data);

      setMessages((prev) => {
        const next = prev.map((m) => (m.id === aiLoadingId ? { ...m, text: answer, loading: false } : m));
        upsertActiveSession({ messages: next });
        return next;
      });
    } catch (e: any) {
      setMessages((prev) => {
        const next = prev.map((m) =>
          m.id === aiLoadingId ? { ...m, text: `Error: ${e?.message || "Something went wrong"}`, loading: false } : m
        );
        upsertActiveSession({ messages: next });
        return next;
      });
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
            <div className="pu-userChip">
              <div className="pu-avatar">N</div>
              <div>
                <div className="pu-userHint">Good morning</div>
                <div className="pu-userName">Nil Vaghela</div>
              </div>
            </div>
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

                  {/* Discord integration */}
                  <div className="pu-drop pu-discord">
                    <div className="pu-dropInner">
                      <div>
                        <div className="pu-dropTitle">
                          <span className="pu-dot idle" />
                          Connect Discord
                        </div>

                        <div className="pu-dropSub">
                          Link your Discord account so we can import your server/channel content.
                        </div>
                      </div>

                      <div className="pu-btnRow">
                        <button className="pu-btn" onClick={onConnectDiscord} type="button" suppressHydrationWarning>
                          <LinkIcon />
                          Connect
                        </button>
                      </div>
                    </div>
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
                  {messages.map((m) => (
                    <div key={m.id} className={`pu-msgRow ${m.role === "user" ? "right" : "left"}`}>
                      <div className={`pu-msgBubble ${m.role === "user" ? "user" : "ai"}`}>
                        {m.title ? <div className="pu-msgTitle">{m.title}</div> : null}
                        {m.meta ? <div className="pu-msgMeta">{m.meta}</div> : null}
                        <div className={`pu-msgText ${m.loading ? "loading" : ""}`}>{m.text}</div>
                      </div>
                    </div>
                  ))}

                  {!selectedOutput ? (
                    <div className="pu-msgRow right">
                      <div className="pu-outputPickerInFeed">
                        <div className="pu-pickerTitle">What should I make from your notes?</div>
                        <div className="pu-pickerSub">Choose one. You can refine the result right after.</div>
                        <div className="pu-outputRow">
                          {(
                            [
                              ["podcast", "Podcast"],
                              ["study_guide", "Study Guide"],
                              ["narrative", "Narrative"],
                              ["flash_card", "Flash Card"],
                            ] as Array<[OutputType, string]>
                          ).map(([key, label]) => (
                            <button
                              key={key}
                              type="button"
                              className="pu-outputBtn"
                              onClick={() => onSelectOutput(key)}
                              disabled={generating || uploading}
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  ) : null}
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
                      placeholder={
                        selectedOutput
                          ? "Ask for changes, add sections, shorten, format, etc…"
                          : "Pick Podcast / Study Guide / Narrative / Flash Card to start…"
                      }
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          onSendChat();
                        }
                      }}
                      disabled={!selectedOutput}
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
                      disabled={generating || !chatInput.trim() || !selectedOutput}
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