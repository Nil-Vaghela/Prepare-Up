// /frontend/app/page.tsx
"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
declare global {
  interface Window {
    google?: any;
  }
}
import * as THREE from "three";

type Theme = {
  name: string;
  bg: string;
  text: string;
  muted: string;
  accent1: string;
  accent2: string;
  accent3: string;
  vignetteInner: string;
  vignetteOuter: string;
  surface: string;
  surfaceHover: string;
  border: string;
  borderHover: string;
  howGradStart: string;
  howGradMid: string;
  howGradEnd: string;
};

const THEMES: Record<string, Theme> = {
  dashboardCool: {
    name: "Dashboard Cool",
    bg: "#07070b",
    text: "rgba(255,255,255,0.92)",
    muted: "rgba(255,255,255,0.62)",
    accent1: "#5aa8ff",
    accent2: "#5fe3ff",
    accent3: "#7c8cff",
    vignetteInner: "rgba(90,168,255,0.00)",
    vignetteOuter: "rgba(0,0,0,0.55)",
    surface: "rgba(255,255,255,0.03)",
    surfaceHover: "rgba(255,255,255,0.045)",
    border: "rgba(255,255,255,0.10)",
    borderHover: "rgba(95,227,255,0.20)",
    howGradStart: "#ff2d6d",
    howGradMid: "#ff3b2f",
    howGradEnd: "#ff8a00",
  },
};

// ✅ Swap theme here
const ACTIVE_THEME_KEY = "dashboardCool";

type Mode = { title: string; desc: string; icon: string };
const MODES: Mode[] = [
  {
    title: "Podcast",
    desc: "Convert your notes into natural-voice podcasts. Learn on the go.",
    icon: "🎧",
  },
  {
    title: "Flashcard",
    desc: "Generate smart flashcards using spaced repetition for better recall.",
    icon: "🗂️",
  },
  {
    title: "Quiz",
    desc: "Turn your material into adaptive quizzes that test true understanding.",
    icon: "🧠",
  },
  {
    title: "Summary",
    desc: "Get concise AI summaries of long lectures or notes in seconds.",
    icon: "🧾",
  },
  {
    title: "Chat",
    desc: "Ask your notes anything — get instant, contextual answers.",
    icon: "💬",
  },
];

type HowStep = { n: string; title: string; text: string; className: string };
const HOW_STEPS: HowStep[] = [
  {
    n: "1",
    title: "Upload Your Notes",
    text: "Drop in your class notes, lecture slides, or text files. Prepare-Up instantly reads, cleans, and organizes your material for processing.",
    className: "howStep1",
  },
  {
    n: "2",
    title: "AI Summarizes Key Concepts",
    text: "Our adaptive AI extracts the most important topics, definitions, and explanations — turning clutter into clarity.",
    className: "howStep2",
  },
  {
    n: "3",
    title: "Listen to Your Notes",
    text: "Instantly generate natural-sounding podcasts. Revise anywhere — walking, commuting, or relaxing.",
    className: "howStep3",
  },
  {
    n: "4",
    title: "Generate Quiz or Flashcards",
    text: "Key points are transformed into flashcards optimized for recall. Each card adapts to your memory strength and repetition pace.",
    className: "howStep4",
  },
];

export default function HomePage() {
  const bgRef = useRef<HTMLDivElement | null>(null);
  const theme = THEMES[ACTIVE_THEME_KEY];
  const css = useMemo(() => buildCss(theme), [theme]);

  useEffect(() => {
    const mount = bgRef.current;
    if (!mount) return;

    // --- Cool metaball-like shader background (no external deps) ---
    const isMobile =
      /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
        navigator.userAgent
      );
    const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
    const isLowPower = isMobile || (navigator.hardwareConcurrency || 4) <= 4;

    const dpr = Math.min(window.devicePixelRatio || 1, isMobile ? 1.5 : 2);

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
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    const canvas = renderer.domElement;
    canvas.style.cssText = `
      position: fixed;
      inset: 0;
      width: 100%;
      height: 100%;
      z-index: 0;
      display: block;
      border: 0;
      outline: 0;
    `;

    mount.innerHTML = "";
    mount.appendChild(canvas);

    const uniforms = {
      uTime: { value: 0.0 },
      uResolution: {
        value: new THREE.Vector2(window.innerWidth, window.innerHeight),
      },
      uActualResolution: {
        value: new THREE.Vector2(
          window.innerWidth * dpr,
          window.innerHeight * dpr
        ),
      },
      uMouse: { value: new THREE.Vector2(0.5, 0.5) },
      uCount: { value: isMobile ? 4 : 7 },
      uSmooth: { value: 0.55 },
      uSpeed: { value: 0.62 },
      uContrast: { value: 1.7 },
      uFog: { value: 0.14 },
      // palette from theme
      uBg: { value: new THREE.Color(theme.bg) },
      uLight: { value: new THREE.Color(theme.accent2) },
      uLight2: { value: new THREE.Color(theme.accent1) },
      uIsSafari: { value: isSafari ? 1.0 : 0.0 },
      uIsLowPower: { value: isLowPower ? 1.0 : 0.0 },
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
        ${
          isMobile || isSafari || isLowPower
            ? "precision mediump float;"
            : "precision highp float;"
        }

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
          int steps = (uIsSafari > 0.5) ? 20 : (uIsLowPower > 0.5 ? 18 : 44);

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

          vec3 ro = vec3(uv * 2.0, -1.0);
          vec3 rd = vec3(0.0, 0.0, 1.0);

          float t = rayMarch(ro, rd);
          vec3 col = uBg;

          if (t > 0.0) {
            vec3 p = ro + rd * t;
            vec3 n = calcNormal(p);

            vec3 lightDir = normalize(vec3(0.7, 1.0, 0.6));
            float diff = max(dot(n, lightDir), 0.0);
            float fres = pow(1.0 - max(dot(-rd, n), 0.0), 1.35);

            // cool base tint
            vec3 base = vec3(0.02, 0.04, 0.07);

            // two-tone glow (cyan + blue)
            vec3 glow = mix(uLight2, uLight, 0.55) * (diff * 0.9 + fres * 0.55);

            col = base + glow;

            // filmic
            col = pow(col, vec3(uContrast));
            col = col / (col + vec3(0.85));

            // fog back to bg
            float fogAmt = 1.0 - exp(-t * uFog);
            col = mix(col, uBg, fogAmt * 0.62);
          }

          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });

    const plane = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
    scene.add(plane);

    const clock = new THREE.Clock();

    const setMouse = (x: number, y: number) => {
      uniforms.uMouse.value.set(
        x / window.innerWidth,
        1.0 - y / window.innerHeight
      );
    };

    const onMouseMove = (e: MouseEvent) => setMouse(e.clientX, e.clientY);
    const onTouchMove = (e: TouchEvent) => {
      if (!e.touches[0]) return;
      setMouse(e.touches[0].clientX, e.touches[0].clientY);
    };

    window.addEventListener("mousemove", onMouseMove, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: true });

    const onResize = () => {
      const ndpr = Math.min(window.devicePixelRatio || 1, isMobile ? 1.5 : 2);
      renderer.setPixelRatio(ndpr);
      renderer.setSize(window.innerWidth, window.innerHeight);
      uniforms.uResolution.value.set(window.innerWidth, window.innerHeight);
      uniforms.uActualResolution.value.set(
        window.innerWidth * ndpr,
        window.innerHeight * ndpr
      );

      renderer.domElement.style.width = "100%";
      renderer.domElement.style.height = "100%";
      renderer.domElement.style.border = "0";
      renderer.domElement.style.outline = "0";
    };

    window.addEventListener("resize", onResize, { passive: true });

    // init center
    setMouse(window.innerWidth / 2, window.innerHeight / 2);

    let raf = 0;
    const tick = () => {
      raf = window.requestAnimationFrame(tick);
      uniforms.uTime.value = clock.getElapsedTime();
      renderer.render(scene, camera);
    };

    tick();

    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("resize", onResize);
      window.cancelAnimationFrame(raf);

      material.dispose();
      (plane.geometry as THREE.BufferGeometry).dispose();
      renderer.dispose();
      if (renderer.domElement?.parentNode)
        renderer.domElement.parentNode.removeChild(renderer.domElement);
    };
  }, [theme]);

  return (
    <main className="pu-home">
      <div ref={bgRef} className="pu-bg" aria-hidden="true" />
      <div className="pu-vignette" aria-hidden="true" />

      <style>{css}</style>

      <Topbar />
      <Hero />
      <ModesSection />
      <HowItWorksSection theme={theme} />
      <Footer />
    </main>
  );
}

function Topbar() {
  const [loading, setLoading] = useState(false);
  const [gsiReady, setGsiReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAuthMenu, setShowAuthMenu] = useState(false);

  const API_BASE =
    process.env.NEXT_PUBLIC_API_BASE_URL?.trim() || "http://localhost:8000";
  const GOOGLE_CLIENT_ID =
    process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID?.trim() || "";

  const ALLOWED_ORIGINS = new Set([
    "http://localhost:3000",
    "http://127.0.0.1:3000",
  ]);

  // Load Google Identity Services script once
  useEffect(() => {
    let cancelled = false;

    const markReadyIfAvailable = () => {
      if (cancelled) return;
      if (window.google?.accounts?.id) setGsiReady(true);
    };

    // If already loaded
    if (window.google?.accounts?.id) {
      setGsiReady(true);
      return;
    }

    // If script tag already exists, wait for it
    const existing = document.querySelector<HTMLScriptElement>(
      'script[src="https://accounts.google.com/gsi/client"]'
    );
    if (existing) {
      existing.addEventListener("load", markReadyIfAvailable);
      // in case it already loaded before listener attached
      setTimeout(markReadyIfAvailable, 0);
      return () => {
        cancelled = true;
        existing.removeEventListener("load", markReadyIfAvailable);
      };
    }

    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = markReadyIfAvailable;
    script.onerror = () => {
      if (cancelled) return;
      setError(
        "Failed to load Google Sign-In. Disable ad-blockers and try again."
      );
    };
    document.body.appendChild(script);

    return () => {
      cancelled = true;
      script.onload = null;
      script.onerror = null;
    };
  }, []);

  const handleGoogleLogin = async () => {
    setError(null);
    setShowAuthMenu(false);
    // Google Identity Services is strict about the page origin matching the OAuth "Authorized JavaScript origins".
    // Safari can sometimes open localhost without the port or via a different host; fail fast with a clear fix.
    const origin = window.location.origin;
    if (!ALLOWED_ORIGINS.has(origin)) {
      setError(
        `Google Sign-In blocked: this page is running at ${origin}. ` +
          `Open http://localhost:3000 (or add ${origin} as an Authorized JavaScript origin in Google Cloud Console).`
      );
      return;
    }



    if (!GOOGLE_CLIENT_ID) {
      setError(
        "Missing NEXT_PUBLIC_GOOGLE_CLIENT_ID in frontend environment. Check docker-compose and rebuild."
      );
      return;
    }

    if (!window.google?.accounts?.id) {
      setError("Google Sign-In not ready yet. Please try again in a second.");
      return;
    }

    setLoading(true);

    try {
      // Re-init each click is okay for now; later we can init once.
      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        // Safari/non-Chrome can fail with FedCM prompts; force legacy behavior.
        // This is safe and avoids Safari weirdness.
        use_fedcm_for_prompt: false,
        ux_mode: "popup",
        cancel_on_tap_outside: false,
        auto_select: false,
        callback: async (response: any) => {
          try {
            const res = await fetch(`${API_BASE}/api/auth/google`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              credentials: "include", // ✅ Required for cross-origin cookies (Safari especially)
              body: JSON.stringify({ id_token: response.credential }),
            });

            if (!res.ok) {
              const txt = await res.text();
              console.error("/api/auth/google failed:", res.status, txt);
              setError(
                `Login failed (${res.status}). ` +
                  (txt?.slice(0, 180) || "Please try again.")
              );
              return;
            }

            const data = await res.json();

            // Access token for API calls (refresh token stays HttpOnly cookie)
            if (data?.access_token) {
              localStorage.setItem("access_token", data.access_token);
            }

            window.location.href = "/dashboard";
          } catch (e: any) {
            console.error("Google login callback error:", e);
            setError(e?.message || "Login failed. Please try again.");
          } finally {
            setLoading(false);
          }
        },
      });

      // Show the One Tap / prompt
      window.google.accounts.id.prompt();
    } catch (e: any) {
      console.error("Google login init/prompt error:", e);
      setError(e?.message || "Login failed. Please try again.");
      setLoading(false);
    }
  };

  return (
    <header className="topbar">
      <div className="brand">Prepare-Up</div>
      <div className="tagline">Study Smarter not Harder</div>

      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ position: "relative" }}>
          <button
            className="btn"
            onClick={() =>
              setShowAuthMenu((prev) => !prev)
            }
          >
            Sign In
          </button>

          {showAuthMenu && (
            <div
              style={{
                position: "absolute",
                top: "110%",
                right: 0,
                minWidth: 220,
                padding: 10,
                borderRadius: 14,
                border: "1px solid rgba(255,255,255,0.12)",
                background: "rgba(0,0,0,0.85)",
                backdropFilter: "blur(12px)",
                boxShadow: "0 12px 40px rgba(0,0,0,0.45)",
                display: "flex",
                flexDirection: "column",
                gap: 8,
                zIndex: 10,
              }}
            >
              <button
                className="gsi-material-button"
                onClick={handleGoogleLogin}
                disabled={loading || !gsiReady}
              >
                <div className="gsi-material-button-state"></div>
                <div className="gsi-material-button-content-wrapper">
                  <div className="gsi-material-button-icon">
                    <svg
                      version="1.1"
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 48 48"
                      style={{ display: "block" }}
                    >
                      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
                      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
                      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
                      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
                    </svg>
                  </div>
                  <span className="gsi-material-button-contents">
                    {loading
                      ? "Signing In…"
                      : gsiReady
                      ? "Sign in with Google"
                      : "Loading…"}
                  </span>
                  <span style={{ display: "none" }}>
                    Sign in with Google
                  </span>
                </div>
              </button>

              <button
                className="btn"
                style={{
                  width: "100%",
                  opacity: 0.6,
                  cursor: "not-allowed",
                }}
                disabled
              >
                Sign in with Apple (Coming Soon)
              </button>
            </div>
          )}
        </div>
      </div>

      {error ? (
        <div
          style={{
            position: "absolute",
            top: 58,
            right: 20,
            maxWidth: 420,
            padding: "10px 12px",
            borderRadius: 12,
            border: "1px solid rgba(255,255,255,0.12)",
            background: "rgba(0,0,0,0.65)",
            color: "rgba(255,255,255,0.9)",
            fontSize: 12,
            fontWeight: 800,
            zIndex: 5,
          }}
          role="alert"
        >
          {error}
        </div>
      ) : null}
    </header>
  );
}

function Hero() {
  return (
    <section className="hero" aria-label="Prepare-Up hero">
      <div className="kicker">
        <span aria-hidden="true">✨</span>
        <span>Your study routine, redefined</span>
      </div>

      <h1 className="headline">
        Listen, Revise, <span className="accent">Retain</span>
      </h1>

      <p className="sub">
        Powered by adaptive AI that converts your notes into voice lessons,
        flashcards, and memory-optimized quizzes.
      </p>

      <div className="ctaRow">
        <Link className="btn btnPrimary" href="/dashboard">
          Get Started
        </Link>
        <button
          type="button"
          className="btn"
          onClick={() => {
            const target = document.getElementById("how");
            if (!target) return;

            const reduceMotion = window.matchMedia?.(
              "(prefers-reduced-motion: reduce)"
            )?.matches;

            target.scrollIntoView({
              behavior: reduceMotion ? "auto" : "smooth",
              block: "start",
            });
          }}
        >
          How it works
        </button>
      </div>

      <div className="socialProof">5,000+ students joined this week</div>
    </section>
  );
}

function ModesSection() {
  return (
    <section id="modes" className="section" aria-label="Learning modes">
      <div className="sectionHeader">
        <div className="pill">
          <span className="dot" aria-hidden="true" />
          <span>Categories</span>
        </div>

        <h2 className="sectionTitle">
          Explore <span className="accent">Learning Modes</span>
        </h2>
        <div className="sectionDesc">
          Discover quizzes across various subjects to test and expand your
          knowledge
        </div>
      </div>

      <div className="grid">
        {MODES.map((m) => (
          <ModeCard key={m.title} title={m.title} desc={m.desc} icon={m.icon} />
        ))}
      </div>
    </section>
  );
}

function ModeCard({
  title,
  desc,
  icon,
}: {
  title: string;
  desc: string;
  icon: string;
}) {
  return (
    <div className="card">
      <div className="cardTop">
        <div className="iconBox" aria-hidden="true">
          {icon}
        </div>
        <div>
          <div className="cardTitle">{title}</div>
          <div className="cardSub">{desc}</div>
        </div>
      </div>
    </div>
  );
}

function HowItWorksSection({ theme }: { theme: Theme }) {
  return (
    <section id="how" className="howSection" aria-label="How it works">
      <div className="howInner">
        <div className="howHeader">
          <div className="howHeaderCard">
            <div className="howTitle">How It Works</div>
            <div className="howDesc">
              From your notes to personalized podcasts, flashcards, and quizzes — see how AI makes studying effortless.
            </div>
          </div>
        </div>

        <div className="howTrack" aria-hidden="true">
          <svg
            className="howSvg"
            viewBox="0 0 1100 360"
            preserveAspectRatio="none"
          >
            <defs>
              <linearGradient id="howGrad" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor={theme.howGradStart} />
                <stop offset="55%" stopColor={theme.howGradMid} />
                <stop offset="100%" stopColor={theme.howGradEnd} />
              </linearGradient>
            </defs>
            <path
              d="M 20 240 C 200 340, 260 80, 420 180 C 560 270, 610 40, 760 90 C 890 140, 950 260, 1080 170"
              fill="none"
              stroke="url(#howGrad)"
              strokeWidth="4"
              strokeLinecap="round"
            />
          </svg>

          {/* dots sit ON the curve (line stays behind cards) */}
          <div className="howDots">
            <div className="howDot howDot1">
              <span className="howDotInner" />
            </div>
            <div className="howDot howDot2">
              <span className="howDotInner" />
            </div>
            <div className="howDot howDot3">
              <span className="howDotInner" />
            </div>
            <div className="howDot howDot4">
              <span className="howDotInner" />
            </div>
          </div>

          <div className="howSteps">
            {HOW_STEPS.map((s) => (
              <div key={s.n} className={`howStep ${s.className}`}>
                <div className="howCopy">
                  <div className="howStepTitle">{s.title}</div>
                  <div className="howStepText">{s.text}</div>
                </div>
                <div className="howBig">{s.n}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function buildCss(t: Theme) {
  return `
    /* ===== hard reset (prevents any white frame) ===== */
    :global(html, body) {
      height: 100%;
      width: 100%;
      margin: 0 !important;
      padding: 0 !important;
      background: ${t.bg} !important;
      background-color: ${t.bg} !important;
      scroll-behavior: smooth;
      overflow-x: hidden;
      overflow-y: auto;
      -webkit-overflow-scrolling: touch;
      overscroll-behavior-y: none;
      scrollbar-gutter: stable;
    }
    :global(body, #__next) {
      border: 0 !important;
      outline: 0 !important;
      box-shadow: none !important;
      overflow-x: hidden !important;
      width: 100%;
      min-height: 100dvh;
    }
    :global(html) {
      background-color: ${t.bg} !important;
      min-height: 100%;
    }

    :global(body) {
      background-color: ${t.bg} !important;
      min-height: 100vh;
    }
    :global(*) { box-sizing: border-box; }
    :global(main, section) { border: 0; outline: 0; }

    :global(:root) {
      --pu-bg: ${t.bg};
      --pu-text: ${t.text};
      --pu-muted: ${t.muted};
      --pu-accent-1: ${t.accent1};
      --pu-accent-2: ${t.accent2};
      --pu-accent-3: ${t.accent3};
      --pu-surface: ${t.surface};
      --pu-surface-hover: ${t.surfaceHover};
      --pu-border: ${t.border};
      --pu-border-hover: ${t.borderHover};
    }

    .pu-bg {
      position: fixed;
      inset: 0;
      z-index: 0;
      width: 100%;
      height: 100%;
      min-height: 100vh;
      background: var(--pu-bg);
    }
    .pu-vignette {
      position: fixed;
      inset: 0;
      z-index: 1;
      pointer-events: none;
      background: radial-gradient(80% 70% at 50% 35%, ${t.vignetteInner}, ${t.vignetteOuter});
    }

    .pu-home {
      position: relative;
      min-height: 100dvh;
      width: 100%;
      color: var(--pu-text);
      font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial,
        "Apple Color Emoji", "Segoe UI Emoji";
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
      text-rendering: optimizeLegibility;
      overflow-x: hidden;
    }

    /* subtle grain */
    .pu-home::after {
      content: "";
      position: fixed;
      inset: 0;
      pointer-events: none;
      z-index: 1;
      opacity: 0.10;
      background-image: radial-gradient(rgba(255,255,255,0.06) 1px, transparent 1px);
      background-size: 5px 5px;
      mix-blend-mode: overlay;
    }

    /* ===== Topbar (no glass) ===== */
    .topbar {
      position: relative;
      z-index: 2;
      padding: 18px 20px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }

    .brand {
      font-weight: 950;
      letter-spacing: -0.02em;
      background: linear-gradient(90deg, var(--pu-accent-1), var(--pu-accent-2));
      -webkit-background-clip: text;
      background-clip: text;
      color: transparent;
      font-size: 14px;
    }

    .tagline {
      font-size: 12px;
      color: rgba(255,255,255,0.58);
      text-align: center;
      flex: 1;
    }

    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      height: 34px;
      padding: 0 12px;
      border-radius: 999px;
      border: 1px solid rgba(255,255,255,0.12);
      background: rgba(255,255,255,0.04);
      color: rgba(255,255,255,0.9);
      font-size: 12px;
      font-weight: 900;
      cursor: pointer;
      text-decoration: none;
      transition: transform 160ms ease, background 160ms ease, border-color 160ms ease;
    }

    .btn:hover {
      transform: translateY(-1px);
      background: rgba(255,255,255,0.06);
      border-color: rgba(95,227,255,0.22);
    }

    .btnPrimary {
      border-color: rgba(95,227,255,0.16);
      background: linear-gradient(90deg, rgba(90,168,255,0.95), rgba(95,227,255,0.95));
      color: rgba(0,0,0,0.92);
    }

    /* ===== Hero ===== */
    .hero {
      position: relative;
      z-index: 2;
      max-width: 1100px;
      margin: 0 auto;
      padding: 76px 18px 28px;
      text-align: center;
    }

    .kicker {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      font-size: 12px;
      color: rgba(255,255,255,0.62);
    }

    .headline {
      margin: 18px 0 0;
      font-size: clamp(40px, 5.2vw, 64px);
      line-height: 1.02;
      font-weight: 950;
      letter-spacing: -0.03em;
    }

    .accent {
      background: linear-gradient(90deg, var(--pu-accent-2), var(--pu-accent-1));
      -webkit-background-clip: text;
      background-clip: text;
      color: transparent;
    }

    .sub {
      margin: 14px auto 0;
      max-width: 72ch;
      font-size: 13px;
      line-height: 1.6;
      color: rgba(255,255,255,0.62);
    }

    .ctaRow {
      margin-top: 22px;
      display: flex;
      justify-content: center;
      gap: 10px;
      flex-wrap: wrap;
    }

    .socialProof {
      margin-top: 12px;
      font-size: 12px;
      font-weight: 900;
      color: var(--pu-accent-2);
    }

    /* ===== Sections ===== */
    .section {
      position: relative;
      z-index: 2;
      max-width: 1100px;
      margin: 0 auto;
      padding: 26px 18px 40px;
    }

    .sectionHeader { text-align: center; }

    .sectionTitle {
      text-align: center;
      margin: 0;
      font-size: 40px;
      font-weight: 950;
      letter-spacing: -0.03em;
      line-height: 1.1;
    }

    .sectionDesc {
      text-align: center;
      margin-top: 10px;
      color: rgba(255,255,255,0.62);
      font-size: 12px;
    }

    .pill {
      margin: 0 auto 14px;
      width: fit-content;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 6px 10px;
      border-radius: 999px;
      border: 1px solid rgba(255,255,255,0.10);
      background: rgba(255,255,255,0.03);
      color: rgba(255,255,255,0.62);
      font-size: 11px;
      font-weight: 900;
    }

    .dot {
      width: 8px;
      height: 8px;
      border-radius: 999px;
      background: var(--pu-accent-2);
      box-shadow: 0 0 0 4px rgba(95,227,255,0.12);
    }

    /* grid: 3/2 centered on desktop */
    .grid {
      margin-top: 18px;
      display: grid;
      gap: 12px;
      grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
      justify-items: stretch;
    }

    @media (min-width: 980px) {
      .grid { grid-template-columns: repeat(6, minmax(0, 1fr)); }
      .grid > .card { grid-column: span 2; }
      .grid > .card:nth-child(4) { grid-column: 2 / span 2; }
      .grid > .card:nth-child(5) { grid-column: 4 / span 2; }
    }

    .card {
      border-radius: 18px;
      border: 1px solid var(--pu-border);
      background: var(--pu-surface);
      padding: 14px;
      transition: transform 160ms ease, border-color 160ms ease, background 160ms ease;
    }

    .card:hover {
      transform: translateY(-1px);
      border-color: var(--pu-border-hover);
      background: var(--pu-surface-hover);
    }

    .cardTop {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .iconBox {
      width: 44px;
      height: 44px;
      border-radius: 14px;
      border: 1px solid rgba(255,255,255,0.10);
      background: rgba(255,255,255,0.02);
      display: grid;
      place-items: center;
      font-size: 18px;
    }

    .cardTitle {
      font-size: 13px;
      font-weight: 950;
      color: rgba(255,255,255,0.9);
    }

    .cardSub {
      margin-top: 6px;
      font-size: 12px;
      color: rgba(255,255,255,0.62);
      line-height: 1.45;
    }

    /* ===== How It Works (wave) ===== */
    .howSection {
      position: relative;
      z-index: 2;
      max-width: 1100px;
      margin: 0 auto;
      padding: 10px 18px 92px;
    }

    .howInner {
      position: relative;
      border-radius: 22px;
      padding: 28px 0 0;
    }

    .howHeader {
      display: flex;
      align-items: stretch;
      justify-content: flex-start;
      gap: 16px;
      margin-bottom: 18px;
      padding: 0 18px;
    }

    .howHeaderCard {
      width: 100%;
      border-radius: 18px;
      border: 1px solid rgba(255,255,255,0.10);
      background: rgba(255,255,255,0.03);
      padding: 16px 18px 14px;
    }

    .howTitle {
      font-size: 20px;
      font-weight: 950;
      letter-spacing: -0.02em;
      color: rgba(255,255,255,0.92);
    }

    .howDesc {
      margin-top: 8px;
      font-size: 12px;
      line-height: 1.5;
      color: rgba(255,255,255,0.62);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 100%;
    }

    .howTrack {
      position: relative;
      height: 440px;
      border-radius: 22px;
      background: rgba(0,0,0,0.10);
      border: 1px solid rgba(255,255,255,0.06);
      overflow: hidden;
      margin: 0 18px;
    }

    .howTrack::before {
      content: "";
      position: absolute;
      inset: -2px;
      background:
        radial-gradient(70% 55% at 30% 40%, rgba(95,227,255,0.10), rgba(0,0,0,0)),
        radial-gradient(60% 60% at 78% 35%, rgba(90,168,255,0.08), rgba(0,0,0,0));
      pointer-events: none;
    }

    .howSvg{
      position:absolute;
      inset:0;
      width:100%;
      height:100%;
      opacity:.95;
      filter:drop-shadow(0 10px 28px rgba(255, 60, 80, .08));
      z-index:1;
      pointer-events:none;
      transform: translateY(18px);
    }

    .howDots{
      position:absolute;
      inset:0;
      z-index:2;
      pointer-events:none;
    }

    .howDot{
      position:absolute;
      width:34px;
      height:34px;
      border-radius:10px;
      background:rgba(255,255,255,.88);
      display:grid;
      place-items:center;
      box-shadow:0 10px 24px rgba(0,0,0,.28);
      transform:translate(-50%,-50%);
    }

    .howDotInner{
      width:10px;
      height:10px;
      border-radius:999px;
      background:rgba(0,0,0,.55);
    }

    /* Dot positions aligned to the SVG curve */
    .howDot1{ left:7.2%; top:69.5%; }
    .howDot2{ left:36.0%; top:51.0%; }
    .howDot3{ left:60.0%; top:22.0%; }
    .howDot4{ left:81.5%; top:55.0%; }

    .howSteps{
      position:absolute;
      inset:0;
      pointer-events:none;
      z-index:3;
    }

    .howStep{
      position:absolute;
      display:flex;
      align-items:flex-start;
      gap:12px;
      max-width:320px;
      z-index:3;
    }

    .howCopy{
      border-radius:16px;
      border:1px solid rgba(255,255,255,.10);
      background: rgba(0,0,0,0.72);
      padding: 16px 16px 15px;
      box-shadow: 0 14px 40px rgba(0,0,0,0.45);
      backdrop-filter:none;
      -webkit-backdrop-filter:none;
    }

    .howStepTitle {
      font-size: 12px;
      font-weight: 950;
      color: rgba(255,255,255,0.90);
      letter-spacing: -0.01em;
    }

    .howStepText {
      margin-top: 8px;
      font-size: 11px;
      line-height: 1.55;
      color: rgba(255,255,255,0.62);
      max-width: 34ch;
    }

    .howBig {
      position: absolute;
      font-size: 110px;
      font-weight: 950;
      color: rgba(255,255,255,0.04);
      letter-spacing: -0.06em;
      line-height: 1;
      pointer-events: none;
      user-select: none;
    }

    /* Positions aligned to the curve (adjusted for more spacing from SVG curve) */
    .howStep1 { left: 5%; top: 72%; }
    .howStep1 .howBig { left: 54px; top: -54px; }

    .howStep2 { left: 30%; top: 52%; }
    .howStep2 .howBig { left: 54px; top: -66px; }

    .howStep3 { left: 55%; top: 12%; }
    .howStep3 .howBig { left: 54px; top: -54px; }

    .howStep4 { right: 3%; top: 62%; }
    .howStep4 .howBig { left: -38px; top: -66px; }

    /* Mobile: stack vertically */
    @media (max-width: 900px) {
      .howTrack { height: auto; padding: 18px 14px; margin: 0 18px; }
      .howSvg { display: none; }
      .howDots{ display:none; }
      .howSteps { position: static; display: grid; gap: 12px; pointer-events: auto; padding: 0 18px; }
      .howStep { position: static; max-width: none; }
      .howBig { display: none; }
    }

    @media (max-width: 720px) {
      .tagline { display: none; }
    }

    @media (max-width: 520px) {
      .howHeader { flex-direction: column; }
    }

    /* ===== Footer (reference-style, matches theme) ===== */
    .footer {
      position: relative;
      z-index: 2;
      width: 100%;
      margin: 0;
      padding: 0;
      background: linear-gradient(180deg, rgba(0,0,0,0.00), rgba(0,0,0,0.25));
      overflow-x: clip;
    }

    .footerInner {
      width: 100%;
      max-width: 1400px;
      margin: 0 auto;
      padding: 42px 56px 28px;
    }

    .footerTop {
      display: grid;
      grid-template-columns: 2.1fr 1fr 1fr 1.05fr;
      gap: 28px;
      padding-top: 28px;
      border-top: 1px solid rgba(255,255,255,0.10);
      align-items: start;
    }

    .footerLeft { min-width: 0; }

    .footerBig {
      font-size: 30px;
      font-weight: 950;
      letter-spacing: -0.03em;
      line-height: 1.02;
      color: rgba(255,255,255,0.92);
      max-width: 18ch;
    }

    .footerLabel {
      font-size: 11px;
      font-weight: 950;
      letter-spacing: 0.10em;
      text-transform: uppercase;
      color: rgba(255,255,255,0.55);
      margin-bottom: 10px;
    }

    .footerLabelSpace { margin-top: 18px; }

    .footerLink {
      display: block;
      width: fit-content;
      color: rgba(255,255,255,0.74);
      text-decoration: none;
      font-size: 12px;
      font-weight: 850;
      padding: 6px 0;
      border-bottom: 1px solid rgba(255,255,255,0.0);
      transition: color 160ms ease, border-color 160ms ease, transform 160ms ease;
    }

    .footerLink:hover {
      color: rgba(255,255,255,0.92);
      border-color: rgba(95,227,255,0.24);
      transform: translateX(2px);
    }

    .footerRight { min-width: 0; justify-self: start; }

    .footerSmall {
      font-size: 12px;
      line-height: 1.6;
      color: rgba(255,255,255,0.62);
      margin-bottom: 10px;
      max-width: 30ch;
    }

    .footerCta {
      display: inline-block;
      width: fit-content;
      font-size: 12px;
      font-weight: 950;
      color: rgba(255,255,255,0.90);
      text-decoration: none;
      padding: 8px 0;
      border-bottom: 1px solid rgba(255,255,255,0.18);
      transition: border-color 160ms ease, transform 160ms ease;
    }

    .footerCta:hover {
      border-color: rgba(95,227,255,0.34);
      transform: translateX(2px);
    }

    .footerSocialRow {
      display: flex;
      gap: 12px;
      align-items: center;
      flex-wrap: wrap;
    }

    .footerSocial {
      width: 34px;
      height: 34px;
      border-radius: 999px;
      display: grid;
      place-items: center;
      border: 1px solid rgba(255,255,255,0.10);
      background: rgba(255,255,255,0.03);
      color: rgba(255,255,255,0.82);
      text-decoration: none;
      font-weight: 950;
      font-size: 12px;
      transition: transform 160ms ease, border-color 160ms ease, background 160ms ease;
    }

    .footerSocial:hover {
      transform: translateY(-1px);
      border-color: rgba(95,227,255,0.22);
      background: rgba(255,255,255,0.06);
      color: rgba(255,255,255,0.92);
    }

    .footerBottom {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
      margin-top: 18px;
      padding-top: 14px;
      border-top: 1px solid rgba(255,255,255,0.06);
      color: rgba(255,255,255,0.52);
      font-size: 11px;
      font-weight: 850;
    }

    .footerBottomLinks { display: flex; gap: 12px; }

    .footerBottomLink {
      color: rgba(255,255,255,0.58);
      text-decoration: none;
      transition: color 160ms ease;
    }

    .footerBottomLink:hover { color: rgba(255,255,255,0.86); }

    @media (max-width: 980px) {
      .footerInner { padding: 42px 24px 28px; }
      .footerTop { grid-template-columns: 1fr 1fr; }
      .footerBig { max-width: none; }
    }

    @media (max-width: 620px) {
      .footerInner { padding: 36px 16px 22px; }
      .footerTop { grid-template-columns: 1fr; }
      .footerBottom { flex-direction: column; align-items: flex-start; }
    }
    

    /* ===== Scrollbars: hide everywhere (still scrollable) =====
       Note: macOS overlay scrollbars may still flash while scrolling depending on OS settings.
    ===== */
    :global(html, body) {
      -ms-overflow-style: none;   /* IE/Edge legacy */
      scrollbar-width: none;      /* Firefox */
      overflow-y: hidden;
    }

    /* Firefox: hide on all scroll containers */
    :global(*) {
      scrollbar-width: none;
      -ms-overflow-style: none;
    }

    /* WebKit (Chrome/Safari): hide on html/body + all scroll containers */
    :global(html::-webkit-scrollbar, body::-webkit-scrollbar, *::-webkit-scrollbar) {
      width: 0 !important;
      height: 0 !important;
    }

    :global(html::-webkit-scrollbar-track, body::-webkit-scrollbar-track, *::-webkit-scrollbar-track) {
      background: transparent !important;
    }

    :global(html::-webkit-scrollbar-thumb, body::-webkit-scrollbar-thumb, *::-webkit-scrollbar-thumb) {
      background: transparent !important;
      border: 0 !important;
    }

    :global(html::-webkit-scrollbar-corner, body::-webkit-scrollbar-corner, *::-webkit-scrollbar-corner) {
      background: transparent !important;
    }

    /* ===== Google Official Button (material dark) ===== */
    .gsi-material-button {
      -webkit-user-select: none;
      user-select: none;
      background-color: #131314;
      border: 1px solid #8e918f;
      border-radius: 20px;
      box-sizing: border-box;
      color: #e3e3e3;
      cursor: pointer;
      font-family: 'Roboto', arial, sans-serif;
      font-size: 14px;
      height: 40px;
      letter-spacing: 0.25px;
      outline: none;
      overflow: hidden;
      padding: 0 14px;
      position: relative;
      text-align: center;
      transition: background-color .218s, border-color .218s, box-shadow .218s;
      width: 100%;
      max-width: 400px;
    }

    .gsi-material-button .gsi-material-button-icon {
      height: 20px;
      margin-right: 10px;
      min-width: 20px;
      width: 20px;
    }

    .gsi-material-button .gsi-material-button-content-wrapper {
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100%;
      width: 100%;
    }

    .gsi-material-button .gsi-material-button-contents {
      flex-grow: 1;
      font-weight: 500;
      text-align: center;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .gsi-material-button .gsi-material-button-state {
      transition: opacity .218s;
      bottom: 0;
      left: 0;
      opacity: 0;
      position: absolute;
      right: 0;
      top: 0;
    }

    .gsi-material-button:disabled {
      cursor: default;
      background-color: #13131461;
      border-color: #8e918f1f;
    }

    .gsi-material-button:not(:disabled):active .gsi-material-button-state,
    .gsi-material-button:not(:disabled):focus .gsi-material-button-state {
      background-color: #ffffff;
      opacity: 0.12;
    }

    .gsi-material-button:not(:disabled):hover {
      box-shadow: 0 1px 2px 0 rgba(60,64,67,.30),
                  0 1px 3px 1px rgba(60,64,67,.15);
    }

    .gsi-material-button:not(:disabled):hover .gsi-material-button-state {
      background-color: #ffffff;
      opacity: 0.08;
    }
  `;
}

// Footer (reference-style, matches theme)
function Footer() {
  return (
    <footer className="footer" aria-label="Footer">
      <div className="footerInner">
        <div className="footerTop">
          <div className="footerLeft">
            <div className="footerBig">The study OS for impatient students.</div>
          </div>

          <div className="footerCol">
            <div className="footerLabel">PRODUCT</div>
            <a className="footerLink" href="#modes">
              Learning modes
            </a>
            <a className="footerLink" href="#how">
              How it works
            </a>
            <a className="footerLink" href="#">
              Pricing
            </a>
          </div>

          <div className="footerCol">
            <div className="footerLabel">SUPPORT</div>
            <a className="footerLink" href="mailto:hello@prepareup.ai">
              hello@prepareup.ai
            </a>
            <a className="footerLink" href="#">
              Help center
            </a>
            <a className="footerLink" href="#">
              Privacy
            </a>
            <a className="footerLink" href="#">
              Terms
            </a>
          </div>

          <div className="footerCol footerRight">
            <div className="footerLabel footerLabelSpace">FOLLOW US</div>
            <div className="footerSocialRow" aria-label="Social links">
              <a className="footerSocial" href="#" aria-label="Behance">
                Be
              </a>
              <a className="footerSocial" href="#" aria-label="Dribbble">
                ◎
              </a>
              <a className="footerSocial" href="#" aria-label="Instagram">
                ⌁
              </a>
              <a className="footerSocial" href="#" aria-label="LinkedIn">
                in
              </a>
            </div>
          </div>
        </div>

        <div className="footerBottom">
          <div>© {new Date().getFullYear()} Prepare-Up</div>
          <div className="footerBottomLinks">
            <a className="footerBottomLink" href="#">
              Status
            </a>
            <a className="footerBottomLink" href="#">
              Security
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}