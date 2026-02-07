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
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const activeChatIdRef = useRef<string | null>(null);

  const setActiveChatIdSync = (id: string | null) => {
    activeChatIdRef.current = id;
    setActiveChatId(id);
  };

  type RecentThread = { id: string; title: string; sub: string };

  const toRelativeSub = (ts: number) => {
    const diffMs = Date.now() - ts;
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
  // Background shaders (cool glass vibe)
  // -----------------------------
  const shaders = useMemo(() => {
    const vertexShader = `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `;

    // Cooler blue/green blob, less “warm”
    const fragmentShader = `
      uniform float u_time;
      uniform vec2 u_resolution;
      uniform vec3 u_color1;
      uniform vec3 u_color2;
      uniform vec3 u_color3;
      uniform vec3 u_background;
      uniform float u_speed;
      uniform sampler2D u_waterTexture;
      uniform float u_waterStrength;
      uniform float u_ripple_time;
      uniform vec2 u_ripple_position;
      uniform float u_ripple_strength;

      void main() {
        vec2 r = u_resolution;
        vec2 FC = gl_FragCoord.xy;
        vec2 screenP = (FC.xy * 2.0 - r) / r.y;

        vec2 wCoord = vec2(FC.x / r.x, FC.y / r.y);
        float waterHeight = texture2D(u_waterTexture, wCoord).r;
        float waterInfluence = clamp(waterHeight * u_waterStrength, -0.5, 0.5);

        float baseRadius = 0.44;
        float waterPulse = waterInfluence * 0.12;
        float circleRadius = baseRadius + waterPulse;

        float distFromCenter = length(screenP);
        float inCircle = smoothstep(circleRadius + 0.12, circleRadius - 0.12, distFromCenter);

        vec3 col = u_background;
        float alpha = 1.0;

        if (inCircle > 0.0) {
          vec2 p = screenP * 0.82;

          float rippleTime = u_time - u_ripple_time;
          vec2 ripplePos = u_ripple_position * r;
          float rippleDist = distance(FC.xy, ripplePos);

          float clickRipple = 0.0;
          if (rippleTime < 2.8 && rippleTime > 0.0) {
            float rr = rippleTime * 170.0;
            float rw = 28.0;
            float decay = 1.0 - rippleTime / 2.8;
            clickRipple = exp(-abs(rippleDist - rr) / rw) * decay * u_ripple_strength;
          }

          float totalWater = clamp((waterInfluence + clickRipple * 0.10) * u_waterStrength, -0.8, 0.8);

          float angle = length(p) * 4.0;
          mat2 R = mat2(cos(angle), -sin(angle), sin(angle), cos(angle));
          p *= R;

          float l = length(p) - 0.7 + totalWater * 0.50;
          float t = u_time * u_speed + totalWater * 2.0;
          float enhancedY = p.y + totalWater * 0.28;

          float pattern1 = 0.5 + 0.5 * tanh(0.1 / max(l / 0.1, -l) - sin(l + enhancedY * max(1.0, -l / 0.1) + t));
          float pattern2 = 0.5 + 0.5 * tanh(0.1 / max(l / 0.1, -l) - sin(l + enhancedY * max(1.0, -l / 0.1) + t + 1.0));
          float pattern3 = 0.5 + 0.5 * tanh(0.1 / max(l / 0.1, -l) - sin(l + enhancedY * max(1.0, -l / 0.1) + t + 2.0));

          float intensity = 1.0 + totalWater * 0.40;

          vec3 blob;
          blob.r = pattern1 * u_color1.r * intensity;
          blob.g = pattern2 * u_color2.g * intensity;
          blob.b = pattern3 * u_color3.b * intensity;

          float blobAlpha = inCircle * 0.40; // cooler + slightly dimmer
          col = mix(u_background, blob, blobAlpha);
          alpha = 1.0;
        }

        gl_FragColor = vec4(col, alpha);
      }
    `;

    return { vertexShader, fragmentShader };
  }, []);

  useEffect(() => {
    const mount = bgMountRef.current;
    if (!mount) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    const simResolution = (() => {
      const w = window.innerWidth;
      if (w < 520) return 128;
      if (w < 1100) return 192;
      return 256;
    })();

    const waterSettings = {
      resolution: simResolution,
      damping: 0.913,
      tension: 0.02,
      rippleRadius: 8,
      mouseIntensity: 1.0,
      clickIntensity: 2.4,
      impactForce: 50000,
      rippleSize: 0.10,
      spiralIntensity: 0.18,
      swirlingMotion: 0.16,
      motionDecay: 0.08,
      rippleDecay: 1.0,
      waveHeight: 0.010,
    };

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
    camera.position.z = 1;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(dpr);
    renderer.setSize(window.innerWidth, window.innerHeight);

    const material = new THREE.ShaderMaterial({
      vertexShader: shaders.vertexShader,
      fragmentShader: shaders.fragmentShader,
      uniforms: {
        u_time: { value: 0.0 },
        u_resolution: { value: new THREE.Vector2(1, 1) },
        u_speed: { value: 1.02 },

        // Cooler palette (match your screenshot vibe)
        u_color1: { value: new THREE.Vector3(0.10, 0.55, 1.0) }, // blue
        u_color2: { value: new THREE.Vector3(0.00, 0.75, 0.55) }, // green-teal
        u_color3: { value: new THREE.Vector3(0.35, 0.55, 1.0) }, // softer blue
        u_background: { value: new THREE.Vector3(0.02, 0.03, 0.05) }, // near-black

        u_waterTexture: { value: null },
        u_waterStrength: { value: 0.40 },
        u_ripple_time: { value: -10.0 },
        u_ripple_position: { value: new THREE.Vector2(0.5, 0.5) },
        u_ripple_strength: { value: 0.50 },
      },
      transparent: true,
    });

    const syncResolutionUniform = () => {
      const v = new THREE.Vector2();
      renderer.getDrawingBufferSize(v);
      material.uniforms.u_resolution.value.copy(v);
    };

    mount.innerHTML = "";
    mount.appendChild(renderer.domElement);

    const resolution = waterSettings.resolution;
    let waterBuffers = {
      current: new Float32Array(resolution * resolution),
      previous: new Float32Array(resolution * resolution),
      velocity: new Float32Array(resolution * resolution * 2),
      vorticity: new Float32Array(resolution * resolution),
    };

    const waterTexture = new THREE.DataTexture(
      waterBuffers.current,
      resolution,
      resolution,
      THREE.RedFormat,
      THREE.FloatType
    );
    waterTexture.minFilter = THREE.LinearFilter;
    waterTexture.magFilter = THREE.LinearFilter;
    waterTexture.needsUpdate = true;

    material.uniforms.u_waterTexture.value = waterTexture;

    const geometry = new THREE.PlaneGeometry(2, 2);
    const mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);

    syncResolutionUniform();

    const updateWaterSimulation = () => {
      const { current, previous, velocity, vorticity } = waterBuffers;
      const damping = waterSettings.damping;
      const safeTension = Math.min(waterSettings.tension, 0.05);
      const velocityDissipation = waterSettings.motionDecay;
      const densityDissipation = waterSettings.rippleDecay;
      const vorticityInfluence = Math.min(Math.max(waterSettings.swirlingMotion, 0.0), 0.5);

      for (let i = 0; i < resolution * resolution * 2; i++) velocity[i] *= 1.0 - velocityDissipation;

      for (let i = 1; i < resolution - 1; i++) {
        for (let j = 1; j < resolution - 1; j++) {
          const index = i * resolution + j;
          const left = velocity[(index - 1) * 2 + 1];
          const right = velocity[(index + 1) * 2 + 1];
          const bottom = velocity[(index - resolution) * 2];
          const top = velocity[(index + resolution) * 2];
          vorticity[index] = (right - left - (top - bottom)) * 0.5;
        }
      }

      if (vorticityInfluence > 0.001) {
        for (let i = 1; i < resolution - 1; i++) {
          for (let j = 1; j < resolution - 1; j++) {
            const index = i * resolution + j;
            const velIndex = index * 2;

            const left = Math.abs(vorticity[index - 1]);
            const right = Math.abs(vorticity[index + 1]);
            const bottom = Math.abs(vorticity[index - resolution]);
            const top = Math.abs(vorticity[index + resolution]);

            const gradX = (right - left) * 0.5;
            const gradY = (top - bottom) * 0.5;

            const len = Math.sqrt(gradX * gradX + gradY * gradY) + 1e-5;
            const safeVort = Math.max(-1.0, Math.min(1.0, vorticity[index]));

            const forceX = (gradY / len) * safeVort * vorticityInfluence * 0.1;
            const forceY = (-gradX / len) * safeVort * vorticityInfluence * 0.1;

            velocity[velIndex] += Math.max(-0.1, Math.min(0.1, forceX));
            velocity[velIndex + 1] += Math.max(-0.1, Math.min(0.1, forceY));
          }
        }
      }

      for (let i = 1; i < resolution - 1; i++) {
        for (let j = 1; j < resolution - 1; j++) {
          const index = i * resolution + j;
          const velIndex = index * 2;

          const top = previous[index - resolution];
          const bottom = previous[index + resolution];
          const left = previous[index - 1];
          const right = previous[index + 1];

          current[index] = (top + bottom + left + right) / 2 - current[index];
          current[index] = current[index] * damping + previous[index] * (1 - damping);
          current[index] += (0 - previous[index]) * safeTension;

          const velMagnitude = Math.sqrt(
            velocity[velIndex] * velocity[velIndex] + velocity[velIndex + 1] * velocity[velIndex + 1]
          );
          const safeVelInfluence = Math.min(velMagnitude * waterSettings.waveHeight, 0.1);
          current[index] += safeVelInfluence;

          current[index] *= 1.0 - densityDissipation * 0.01;
          current[index] = Math.max(-2.0, Math.min(2.0, current[index]));
        }
      }

      for (let i = 0; i < resolution; i++) {
        current[i] = 0;
        current[(resolution - 1) * resolution + i] = 0;
        current[i * resolution] = 0;
        current[i * resolution + (resolution - 1)] = 0;
      }

      const tmp = waterBuffers.current;
      waterBuffers.current = waterBuffers.previous;
      waterBuffers.previous = tmp;

      waterTexture.image.data = waterBuffers.current;
      waterTexture.needsUpdate = true;
    };

    const addRipple = (x: number, y: number, strength = 1.0) => {
      const normalizedX = x / window.innerWidth;
      const normalizedY = 1.0 - y / window.innerHeight;

      const texX = Math.floor(normalizedX * resolution);
      const texY = Math.floor(normalizedY * resolution);

      const radius = Math.max(waterSettings.rippleRadius, Math.floor(waterSettings.rippleSize * resolution));
      const rippleStrength = strength * (waterSettings.impactForce / 100000);
      const radiusSquared = radius * radius;

      for (let i = -radius; i <= radius; i++) {
        for (let j = -radius; j <= radius; j++) {
          const dist2 = i * i + j * j;
          if (dist2 <= radiusSquared) {
            const posX = texX + i;
            const posY = texY + j;

            if (posX >= 0 && posX < resolution && posY >= 0 && posY < resolution) {
              const index = posY * resolution + posX;
              const velIndex = index * 2;

              const distance = Math.sqrt(dist2);
              const falloff = 1.0 - distance / radius;

              const rippleValue = Math.cos((distance / radius) * Math.PI * 0.5) * rippleStrength * falloff;

              waterBuffers.previous[index] += rippleValue;

              const angle = Math.atan2(j, i);
              const velStrength = rippleValue * waterSettings.spiralIntensity;

              waterBuffers.velocity[velIndex] += Math.cos(angle) * velStrength;
              waterBuffers.velocity[velIndex + 1] += Math.sin(angle) * velStrength;

              const swirlAngle = angle + Math.PI * 0.5;
              const swirlStrength = Math.min(velStrength * 0.3, 0.1);
              waterBuffers.velocity[velIndex] += Math.cos(swirlAngle) * swirlStrength;
              waterBuffers.velocity[velIndex + 1] += Math.sin(swirlAngle) * swirlStrength;
            }
          }
        }
      }
    };

    let lastMouse = { x: 0, y: 0 };
    let mouseThrottle = 0;

    const onMouseMove = (event: MouseEvent) => {
      const now = performance.now();
      if (now - mouseThrottle < 12) return;
      mouseThrottle = now;

      const x = event.clientX;
      const y = event.clientY;

      const dx = x - lastMouse.x;
      const dy = y - lastMouse.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist > 2) {
        const v = dist / 10;
        const velocityInfluence = Math.min(v / 10, 2.0);
        const baseIntensity = Math.min(dist / 30, 1.0);
        const finalIntensity =
          baseIntensity * velocityInfluence * waterSettings.mouseIntensity * (Math.random() * 0.25 + 0.75);

        addRipple(x + (Math.random() - 0.5) * 2, y + (Math.random() - 0.5) * 2, finalIntensity);

        lastMouse.x = x;
        lastMouse.y = y;
      }
    };

    const clock = new THREE.Clock();

    const onClick = (event: MouseEvent) => {
      const x = event.clientX;
      const y = event.clientY;

      addRipple(x, y, waterSettings.clickIntensity);
      material.uniforms.u_ripple_position.value.set(x / window.innerWidth, 1.0 - y / window.innerHeight);
      material.uniforms.u_ripple_time.value = clock.getElapsedTime();
    };

    const onTouchMove = (event: TouchEvent) => {
      event.preventDefault();
      if (!event.touches[0]) return;

      const now = performance.now();
      if (now - mouseThrottle < 12) return;
      mouseThrottle = now;

      const x = event.touches[0].clientX;
      const y = event.touches[0].clientY;

      const dx = x - lastMouse.x;
      const dy = y - lastMouse.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist > 2) {
        const v = dist / 10;
        const velocityInfluence = Math.min(v / 10, 2.0);
        const baseIntensity = Math.min(dist / 30, 1.0);
        const finalIntensity =
          baseIntensity * velocityInfluence * waterSettings.mouseIntensity * (Math.random() * 0.25 + 0.75);

        addRipple(x, y, finalIntensity);
        lastMouse.x = x;
        lastMouse.y = y;
      }
    };

    const onTouchStart = (event: TouchEvent) => {
      event.preventDefault();
      if (!event.touches[0]) return;

      const x = event.touches[0].clientX;
      const y = event.touches[0].clientY;

      addRipple(x, y, waterSettings.clickIntensity);
      material.uniforms.u_ripple_position.value.set(x / window.innerWidth, 1.0 - y / window.innerHeight);
      material.uniforms.u_ripple_time.value = clock.getElapsedTime();
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("click", onClick);
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    window.addEventListener("touchstart", onTouchStart, { passive: false });

    const onResize = () => {
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setSize(window.innerWidth, window.innerHeight);
      syncResolutionUniform();
    };
    window.addEventListener("resize", onResize);

    let rafId = 0;
    setTimeout(() => addRipple(window.innerWidth / 2, window.innerHeight / 2, 1.0), 220);

    const animate = () => {
      rafId = window.requestAnimationFrame(animate);
      material.uniforms.u_time.value = clock.getElapsedTime();
      updateWaterSimulation();
      renderer.render(scene, camera);
    };

    animate();

    const onVis = () => {
      if (document.hidden) cancelAnimationFrame(rafId);
      else animate();
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("resize", onResize);

      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("click", onClick);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchstart", onTouchStart);

      cancelAnimationFrame(rafId);

      geometry.dispose();
      material.dispose();
      waterTexture.dispose();
      renderer.dispose();

      if (renderer.domElement?.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement);
    };
  }, [shaders]);

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
    <div className="pu-root">
      <style jsx global>{`
        * {
          box-sizing: border-box;
        }
      `}</style>

      {/* background */}
      <div ref={bgMountRef} className="pu-bg" aria-hidden="true" />
      <div className="pu-vignette" aria-hidden="true" />

      <style jsx>{`
        :global(:root) {
          /* Black base + warm accent gradient */
          --pu-bg: #07070b;
          --pu-text: rgba(255, 255, 255, 0.92);
          --pu-muted: rgba(255, 255, 255, 0.62);

          --pu-accent-1: #5aa8ff; /* electric blue */
          --pu-accent-2: #5fe3ff; /* ice cyan */
          --pu-accent-3: #7c8cff; /* soft indigo */

          /* Glass on black (stronger, more premium) */
          --pu-glass: rgba(255, 255, 255, 0.05);
          --pu-glass-strong: rgba(255, 255, 255, 0.10);
          --pu-border: rgba(255, 255, 255, 0.14);
          --pu-border-soft: rgba(255, 255, 255, 0.10);
          --pu-shadow: rgba(0, 0, 0, 0.55);

          /* Typography (ChatGPT-like scale) */
          --pu-font-sans: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, "Apple Color Emoji", "Segoe UI Emoji";

          --pu-fs-10: 10px;
          --pu-fs-11: 11px;
          --pu-fs-12: 12px;
          --pu-fs-13: 13px;
          --pu-fs-14: 14px;

          --pu-lh-tight: 1.25;
          --pu-lh-body: 1.55;
        }

        .pu-bg {
          position: fixed;
          inset: 0;
          z-index: 0;
          background: var(--pu-bg);
        }

        /* Vignette for depth */
        .pu-vignette {
          position: fixed;
          inset: 0;
          z-index: 1;
          pointer-events: none;
          background: radial-gradient(
            80% 70% at 50% 35%,
            rgba(90, 168, 255, 0.00),
            rgba(0, 0, 0, 0.55)
          );
        }

        .pu-root {
          position: relative;
          height: 100vh;
          padding: 18px;
          overflow: hidden;
          color: var(--pu-text);
          font-family: var(--pu-font-sans);
          font-size: var(--pu-fs-13);
          -webkit-font-smoothing: antialiased;
          -moz-osx-font-smoothing: grayscale;
          text-rendering: optimizeLegibility;
        }

      

        .pu-shell {
          position: relative;
          z-index: 2;
          height: 100%;
          display: grid;
          grid-template-columns: 340px 1fr;
          gap: 14px;
        }

        /* Sidebar */
        .pu-sidebar {
          padding: 14px;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }

        .pu-brand {
          font-weight: 900;
          letter-spacing: -0.02em;
          background: linear-gradient(90deg, var(--pu-accent-1), var(--pu-accent-2));
          -webkit-background-clip: text;
          background-clip: text;
          color: transparent;
          font-size: var(--pu-fs-14);
        }

        .pu-subtitle {
          margin-top: 6px;
          font-size: var(--pu-fs-11);
          color: var(--pu-muted);
        }

        .pu-search {
          margin-top: 12px;
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 10px 12px;
          border-radius: 14px;
          border: 1px solid rgba(255, 255, 255, 0.10);
          background: rgba(255, 255, 255, 0.035);
        }

        .pu-search input {
          border: none;
          outline: none;
          background: transparent;
          width: 100%;
          color: var(--pu-text);
          font-size: var(--pu-fs-12);
        }

        .pu-list {
          margin-top: 14px;
          display: flex;
          flex-direction: column;
          gap: 10px;
          overflow: auto;
          position: relative;
          scrollbar-gutter: stable;
          padding-right: 6px;
        }
          .pu-list::after {
          content: "";
          position: sticky;
          bottom: 0;
          display: block;
          height: 34px;
          pointer-events: none;
          background: linear-gradient(180deg, rgba(0,0,0,0), rgba(0,0,0,0.55));
          border-radius: 14px;
        }
        .pu-itemCompact {
          padding: 10px 12px;
          border-radius: 14px;
          border: 1px solid rgba(255, 255, 255, 0.06);
          background: rgba(255, 255, 255, 0.018);
        }

        .pu-itemCompact:hover {
          background: rgba(255, 255, 255, 0.04);
          border-color: rgba(255, 255, 255, 0.14);
        }

        .pu-showAll {
          margin-top: 6px;
          width: 100%;
          padding: 10px 12px;
          border-radius: 14px;
          border: 1px dashed rgba(255, 255, 255, 0.14);
          background: rgba(255, 255, 255, 0.02);
          color: rgba(255, 255, 255, 0.78);
          font-size: 12px;
          font-weight: 850;
          cursor: pointer;
          transition: transform 160ms ease, background 160ms ease, border-color 160ms ease;
        }

        .pu-showAll:hover {
          background: rgba(255, 255, 255, 0.04);
          border-color: rgba(95, 227, 255, 0.22);
          transform: translateY(-1px);
        }
        .pu-item {
          padding: 12px;
          border-radius: 14px;
          border: 1px solid rgba(255, 255, 255, 0.10);
          background: rgba(255, 255, 255, 0.035);
          cursor: pointer;
          transition: transform 120ms ease, background 120ms ease, border-color 120ms ease;
        }

        .pu-item:hover {
          background: rgba(255, 255, 255, 0.05);
          border-color: rgba(255, 255, 255, 0.16);
          transform: translateY(-1px);
        }

        .pu-itemTitle {
          font-size: var(--pu-fs-12);
          font-weight: 850;
          color: rgba(255, 255, 255, 0.88);
        }

        .pu-itemSub {
          margin-top: 4px;
          font-size: var(--pu-fs-11);
          color: var(--pu-muted);
        }

        /* Main */
        .pu-main {
          display: flex;
          flex-direction: column;
          overflow: hidden;
          min-width: 0;
        }

        .pu-topbar {
          padding: 12px 14px 10px 14px;
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
          background: rgba(255, 255, 255, 0.04);
        }

        .pu-avatar {
          width: 30px;
          height: 30px;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.14);
          background: rgba(255, 255, 255, 0.06);
          display: grid;
          place-items: center;
          font-weight: 900;
          font-size: 12px;
          color: rgba(255, 255, 255, 0.9);
        }

        .pu-userHint {
          font-size: var(--pu-fs-10);
          font-weight: 800;
          color: rgba(255, 255, 255, 0.60);
          text-transform: uppercase;
          line-height: 1.1;
        }

        .pu-userName {
          font-size: var(--pu-fs-11);
          font-weight: 850;
          color: rgba(255, 255, 255, 0.9);
          line-height: 1.1;
        }

      

        .pu-content {
          flex: 1;
          min-height: 0;
          overflow: hidden; /* chat handles its own scroll */
          padding: 14px;
          position: relative;
        }

        /* Upload card (centered) */
        .pu-uploadCenter {
          height: 100%;
          display: grid;
          place-items: center;
        }

        .pu-uploadCard {
          width: min(860px, 100%);
          padding: 16px;
        }

        .pu-titleRow {
          display: flex;
          align-items: flex-end;
          justify-content: space-between;
          gap: 12px;
          margin-bottom: 12px;
          flex-wrap: wrap;
        }

        .pu-h1 {
          font-size: var(--pu-fs-14);
          font-weight: 900;
          letter-spacing: -0.02em;
          color: rgba(255, 255, 255, 0.9);
        }

        .pu-desc {
          margin-top: 6px;
          font-size: var(--pu-fs-12);
          color: var(--pu-muted);
          line-height: 1.45;
          max-width: 56ch;
        }

        .pu-btnRow {
          display: flex;
          gap: 10px;
          align-items: center;
        }

        .pu-btn {
          padding: 10px 12px;
          border-radius: 14px;
          border: 1px solid rgba(255, 255, 255, 0.12);
          background: rgba(255, 255, 255, 0.04);
          color: rgba(255, 255, 255, 0.9);
          font-size: var(--pu-fs-12);
          font-weight: 850;
          cursor: pointer;
        }

        .pu-btnPrimary {
          background: rgba(255, 255, 255, 0.07);
          border-color: rgba(255, 255, 255, 0.16);
        }

        .pu-btnDisabled {
          opacity: 0.45;
          cursor: not-allowed;
        }

        .pu-drop {
          margin-top: 12px;
          border-radius: 16px;
          border: 1px dashed rgba(255, 255, 255, 0.16);
          background: rgba(255, 255, 255, 0.03);
          padding: 18px;
          transition: background 120ms ease, border-color 120ms ease;
        }

        .pu-drop.drag {
          background: rgba(255, 255, 255, 0.05);
          border-color: rgba(255, 255, 255, 0.24);
        }

        .pu-dropInner {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 14px;
          flex-wrap: wrap;
        }

        .pu-dropTitle {
          font-weight: 850;
          font-size: var(--pu-fs-13);
          color: rgba(255, 255, 255, 0.88);
        }

        .pu-dropSub {
          margin-top: 6px;
          font-size: var(--pu-fs-11);
          color: var(--pu-muted);
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
          border-radius: 14px;
          border: 1px solid rgba(255, 255, 255, 0.10);
          background: rgba(255, 255, 255, 0.035);
        }

        .pu-fileName {
          font-size: var(--pu-fs-12);
          font-weight: 850;
          color: rgba(255, 255, 255, 0.88);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          max-width: 560px;
        }

        .pu-fileSize {
          margin-top: 4px;
          font-size: var(--pu-fs-11);
          color: var(--pu-muted);
        }

        .pu-remove {
          width: 40px;
          height: 40px;
          border-radius: 14px;
          border: 1px solid rgba(255, 255, 255, 0.12);
          background: rgba(255, 255, 255, 0.04);
          cursor: pointer;
          display: grid;
          place-items: center;
          color: rgba(255, 255, 255, 0.9);
          font-weight: 900;
        }

        /* Chat layout to match screenshot */
        /* Chat layout (clean, launch-worthy) */
        .pu-chatCanvas {
          height: 100%;
          display: grid;
          grid-template-rows: 1fr auto;
          gap: 10px;
          min-height: 0;
        }

        .pu-chatTop {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 10px 12px;
          border-radius: 14px;
          border: 1px solid rgba(255, 255, 255, 0.10);
          background: rgba(255, 255, 255, 0.03);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
        }

        .pu-chatTitle {
          font-size: 12px;
          font-weight: 900;
          color: rgba(255, 255, 255, 0.90);
          letter-spacing: -0.01em;
        }

        .pu-chatSub {
          margin-top: 4px;
          font-size: 11px;
          color: var(--pu-muted);
        }

        .pu-chatTopRight {
          display: flex;
          align-items: center;
          gap: 10px;
          flex-wrap: wrap;
          justify-content: flex-end;
        }

        .pu-outputPickerInFeed {
          width: min(620px, 86%);
          padding: 14px;
          border: 1px solid rgba(255, 255, 255, 0.08);
          background: rgba(255, 255, 255, 0.018);
        }

        .pu-outputRow {
          margin-top: 12px;
          display: flex;
          gap: 10px;
          justify-content: flex-start;
          flex-wrap: wrap;
        }

        .pu-pickerTitle {
          font-size: var(--pu-fs-13);
          font-weight: 900;
          color: rgba(255, 255, 255, 0.92);
          line-height: var(--pu-lh-tight);
        }

        .pu-pickerSub {
          margin-top: 6px;
          font-size: var(--pu-fs-11);
          color: var(--pu-muted);
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
          background: rgba(0, 0, 0, 0.28);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          padding: 14px 16px;
          box-shadow: 0 10px 22px rgba(0, 0, 0, 0.22);
        }

        .pu-msgBubble.user {
          background: rgba(0, 0, 0, 0.26);
          border-color: rgba(255, 255, 255, 0.10);
        }

        .pu-msgBubble.ai {
          background: rgba(0, 0, 0, 0.32);
          border-color: rgba(255, 255, 255, 0.14);
        }

        .pu-msgTitle {
          font-size: 13px;
          font-weight: 900;
          color: rgba(255, 255, 255, 0.90);
          letter-spacing: -0.01em;
          line-height: var(--pu-lh-tight);
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


        .pu-attach {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 8px 10px;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.12);
          background: rgba(255, 255, 255, 0.04);
          color: rgba(255, 255, 255, 0.88);
          font-size: var(--pu-fs-12);
          font-weight: 850;
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

        

        .pu-miniBtn {
          padding: 8px 10px;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.12);
          background: rgba(255, 255, 255, 0.04);
          color: rgba(255, 255, 255, 0.88);
          font-size: 11px;
          font-weight: 850;
          cursor: pointer;
          white-space: nowrap;
        }

        .pu-pill {
          font-size: var(--pu-fs-11);
          color: rgba(255, 255, 255, 0.62);
          border: 1px solid rgba(255, 255, 255, 0.12);
          background: rgba(255, 255, 255, 0.03);
          padding: 6px 10px;
          border-radius: 999px;
        }

        /* output pills under the question bubble, centered-ish */
        .pu-outputRow {
          margin-top: 12px;
          display: flex;
          gap: 10px;
          justify-content: center;
          flex-wrap: wrap;
        }

        .pu-outputBtn {
          padding: 9px 12px;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.14);
          background: rgba(255, 255, 255, 0.04);
          color: rgba(255, 255, 255, 0.88);
          font-size: var(--pu-fs-12);
          font-weight: 900;
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

        /* Bottom chat bar like screenshot */
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
          background: rgba(255, 255, 255, 0.04);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
        }

        .pu-chatInput {
          flex: 1;
          border: none;
          outline: none;
          background: transparent;
          color: rgba(255, 255, 255, 0.9);
          font-size: var(--pu-fs-13);
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
        }

        .pu-send:disabled {
          opacity: 0.55;
          cursor: not-allowed;
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
          gap: 8px;
        }

        .pu-sideItem {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 11px 12px;
          border-radius: 16px;
          border: 1px solid rgba(255, 255, 255, 0.06);
          background: rgba(255, 255, 255, 0.012);
          cursor: pointer;
          user-select: none;
          transition: transform 180ms ease, background 180ms ease, border-color 180ms ease, box-shadow 180ms ease;
          position: relative;
          overflow: hidden;
        }

        .pu-sideItem::after {
          content: "";
          position: absolute;
          inset: -40px;
          background: radial-gradient(40% 35% at 20% 30%, rgba(95, 227, 255, 0.10), rgba(0, 0, 0, 0));
          opacity: 0;
          transform: translate3d(-8px, 0, 0);
          transition: opacity 180ms ease, transform 180ms ease;
          pointer-events: none;
        }

        .pu-sideItem:hover {
          background: rgba(255, 255, 255, 0.03);
          border-color: rgba(255, 255, 255, 0.12);
          transform: translateY(-1px);
          box-shadow: 0 18px 44px rgba(0, 0, 0, 0.28);
        }

        .pu-sideItem:hover::after {
          opacity: 1;
          transform: translate3d(0, 0, 0);
        }

        .pu-sideItem.active {
          background: rgba(255, 255, 255, 0.04);
          border-color: rgba(95, 227, 255, 0.24);
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


        .pu-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 10px;
        }

        .pu-h2 {
          font-size: 13px;
          font-weight: 900;
          color: rgba(255, 255, 255, 0.9);
        }

        .pu-card {
          padding: 12px;
          border-radius: 14px;
          border: 1px solid rgba(255, 255, 255, 0.12);
          background: rgba(255, 255, 255, 0.045);
        }

        .pu-cardTitle {
          font-size: 12px;
          font-weight: 900;
          color: rgba(255, 255, 255, 0.9);
        }

        .pu-cardSub {
          margin-top: 6px;
          font-size: 11px;
          color: rgba(255, 255, 255, 0.64);
          line-height: 1.45;
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
          <div className="pu-brand">Prepare-Up</div>

          <div className="pu-sectionLabel">MAIN</div>
          <nav className="pu-sideNav" aria-label="Main navigation">
            {(
              [
                ["flash_cards", "Flash Cards", <FlashCardsIcon key="i" />],
                ["podcast", "Podcast", <MicIcon key="i" />],
                ["mock_test", "Mock Test", <QuizIcon key="i" />],
                ["study_guide", "Study Guide", <DocIcon key="i" />],
              ] as Array<[
                "flash_cards" | "podcast" | "mock_test" | "study_guide",
                string,
                React.ReactNode
              ]>
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
            <button className="pu-showAll" type="button" onClick={startNewChat} style={{ marginTop: 12 }}>
              + New chat
            </button>
          ) : null}

          <div className="pu-sectionLabel" style={{ marginTop: 14 }}>
            RECENTS
          </div>

          <div className="pu-search" style={{ marginTop: 8 }}>
            <SearchIcon />
            <input
              placeholder="Search chats…"
              value={recentQuery}
              onChange={(e) => {
                setRecentQuery(e.target.value);
                setRecentVisible(12);
              }}
            />
          </div>

          <div className="pu-list" aria-label="Recent chats" onScroll={onRecentsScroll}>
            {visibleRecents.map((c) => (
              <div
                key={c.id}
                className={`pu-item pu-itemCompact ${activeChatId === c.id ? "active" : ""}`}
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
                <div className="pu-itemSub">{c.sub}</div>
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
                <div className="pu-glass pu-uploadCard">
                  <div className="pu-titleRow">
                    <div>
                      <div className="pu-h1">Upload your notes</div>
                      <div className="pu-desc">
                        Add PDFs, docs, slides, images, audio/video, code, archives — anything. Next step will be chat +
                        generation options.
                      </div>
                    </div>
                    <div className="pu-btnRow">
                      <button className="pu-btn" onClick={onBrowse} type="button">
                        Browse
                      </button>
                      <button
                        className={`pu-btn pu-btnPrimary ${!canContinue ? "pu-btnDisabled" : ""}`}
                        onClick={onContinue}
                        disabled={!canContinue}
                        type="button"
                      >
                        {uploading ? "Uploading…" : "Continue"}
                      </button>
                    </div>
                  </div>

                  <div className={`pu-drop${dragging ? " drag" : ""}`}>
                    <div className="pu-dropInner">
                      <div>
                        <div className="pu-dropTitle">Drag & drop files here</div>
                        <div className="pu-dropSub">Supported: most file types • Local selection</div>
                      </div>
                      <div className="pu-btnRow">
                        <button className="pu-btn" onClick={onBrowse} type="button">
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
                          <button className="pu-remove" onClick={() => removeFile(f.id)} aria-label="Remove file">
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
              {/* Top bar */}
              {/* <div className="pu-chatTop">
                <div className="pu-chatTopLeft">
                  <div className="pu-chatTitle">Dashboard</div>
                  <div className="pu-chatSub">
                    Sources: {uploaded.length || 0} file(s) • {channelsCount} channel
                    {uploading ? " • Uploading…" : ""}
                    {!uploading && pendingUploadCount > 0 ? ` • Pending: ${pendingUploadCount}` : ""}
                  </div>
                </div>

                <div className="pu-chatTopRight">
                  <button className="pu-miniBtn" onClick={onUploadMore} type="button">
                    + Upload more
                  </button>
                  {selectedOutput ? (
                    <span className="pu-pill">Selected: {outputLabel(selectedOutput)}</span>
                  ) : (
                    <span className="pu-pill">Pick an output to start</span>
                  )}
                </div>
              </div> */}

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
                  <button className="pu-attach" type="button" onClick={onUploadMore}>
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
                  />
                  <button
                    className="pu-send"
                    onClick={onSendChat}
                    disabled={generating || !chatInput.trim() || !selectedOutput}
                    aria-label="Send"
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