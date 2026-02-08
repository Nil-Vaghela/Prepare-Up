"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import * as THREE from "three";

export default function HomePage() {
  const bgRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const mount = bgRef.current;
    if (!mount) return;

    // --- Cool metaball-like shader background (no external deps) ---
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
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
      uCount: { value: isMobile ? 4 : 7 },
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
        ${isMobile || isSafari || isLowPower ? "precision mediump float;" : "precision highp float;"}

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
      uniforms.uMouse.value.set(x / window.innerWidth, 1.0 - y / window.innerHeight);
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
      uniforms.uActualResolution.value.set(window.innerWidth * ndpr, window.innerHeight * ndpr);

      renderer.domElement.style.width = "100vw";
      renderer.domElement.style.height = "100vh";
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
      if (renderer.domElement?.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement);
    };
  }, []);

  return (
    <main className="pu-home">
      <div ref={bgRef} className="pu-bg" aria-hidden="true" />
      <div className="pu-vignette" aria-hidden="true" />

      <style>{`
        /* ===== remove any outer frame ===== */
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
        :global(*) { box-sizing: border-box; }

        :global(:root) {
          --pu-bg: #07070b;
          --pu-text: rgba(255,255,255,0.92);
          --pu-muted: rgba(255,255,255,0.62);
          --pu-accent-1: #5aa8ff;
          --pu-accent-2: #5fe3ff;
          --pu-accent-3: #7c8cff;
        }

        .pu-bg { position: fixed; inset: 0; z-index: 0; background: var(--pu-bg); }
        .pu-vignette {
          position: fixed;
          inset: 0;
          z-index: 1;
          pointer-events: none;
          background: radial-gradient(80% 70% at 50% 35%, rgba(90,168,255,0.00), rgba(0,0,0,0.55));
        }

        .pu-home {
          position: relative;
          min-height: 100vh;
          width: 100vw;
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

        /* ===== Top bar (NO glass) ===== */
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
          color: #5fe3ff;
        }

        /* ===== Sections ===== */
        .section {
          position: relative;
          z-index: 2;
          max-width: 1100px;
          margin: 0 auto;
          padding: 26px 18px 70px;
        }

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

        .grid {
          margin-top: 18px;
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
          gap: 12px;
        }

        .card {
          border-radius: 18px;
          border: 1px solid rgba(255,255,255,0.10);
          background: rgba(255,255,255,0.03);
          padding: 14px;
          transition: transform 160ms ease, border-color 160ms ease, background 160ms ease;
        }

        .card:hover {
          transform: translateY(-1px);
          border-color: rgba(95,227,255,0.20);
          background: rgba(255,255,255,0.045);
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

        @media (max-width: 720px) {
          .tagline { display: none; }
        }
      `}</style>

      {/* Top bar */}
      <header className="topbar">
        <div className="brand">Prepare‑Up</div>
        <div className="tagline">Study Smarter not Harder</div>
        <Link className="btn" href="/dashboard">
          Sign In
        </Link>
      </header>

      {/* Hero */}
      <section className="hero">
        <div className="kicker">
          <span aria-hidden="true">✨</span>
          <span>Your study routine, redefined</span>
        </div>

        <h1 className="headline">
          Listen, Revise, <span className="accent">Retain</span>
        </h1>

        <p className="sub">
          Powered by adaptive AI that converts your notes into voice lessons, flashcards, and
          memory‑optimized quizzes.
        </p>

        <div className="ctaRow">
          <Link className="btn btnPrimary" href="/dashboard">
            Get Started
          </Link>
          <a className="btn" href="#modes">
            Explore
          </a>
        </div>

        <div className="socialProof">5,000+ students joined this week</div>
      </section>

      {/* Learning Modes */}
      <section id="modes" className="section">
        <div style={{ textAlign: "center" }}>
          <div className="pill">
            <span className="dot" aria-hidden="true" />
            <span>Categories</span>
          </div>

          <h2 className="sectionTitle">
            Explore <span className="accent">Learning Modes</span>
          </h2>
          <div className="sectionDesc">Discover quizzes across various subjects to test and expand your knowledge</div>
        </div>

        <div className="grid">
          <ModeCard title="Podcast" desc="Convert your notes into natural‑voice podcasts. Learn on the go." icon="🎧" />
          <ModeCard title="Flashcard" desc="Generate smart flashcards using spaced repetition for better recall." icon="🗂️" />
          <ModeCard title="Quiz" desc="Turn your material into adaptive quizzes that test true understanding." icon="🧠" />
          <ModeCard title="Summary" desc="Get concise AI summaries of long lectures or notes in seconds." icon="🧾" />
          <ModeCard title="Chat" desc="Ask your notes anything — get instant, contextual answers." icon="💬" />
        </div>
      </section>
    </main>
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