"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import type { VoiceState } from "../../lib/hooks/useVoiceSession";

// ── App accent palette (matches --pu-accent-1/2/3 CSS vars) ──────────────────
const C = {
  cyan:   0x5FE3FF,
  blue:   0x5AA8FF,
  indigo: 0x7C8CFF,
  deep:   0x1A2A5A,
  dark:   0x07070B,
};

const STATE_LABELS: Record<VoiceState, string> = {
  idle:       "Ready",
  connecting: "Connecting…",
  listening:  "Listening…",
  thinking:   "Thinking…",
  speaking:   "Speaking",
  error:      "Error",
  ended:      "Session ended",
};
const STATE_UI_COLOR: Record<VoiceState, string> = {
  idle:       "rgba(255,255,255,0.28)",
  connecting: "rgba(90,168,255,0.90)",
  listening:  "rgba(95,227,255,0.90)",
  thinking:   "rgba(124,140,255,0.90)",
  speaking:   "rgba(95,227,255,0.90)",
  error:      "rgba(255,100,100,0.90)",
  ended:      "rgba(255,255,255,0.20)",
};
const STATE_CFG: Record<VoiceState, { bar: number; core: number; ring: number; glow: number }> = {
  idle:       { bar: C.blue,   core: C.blue,   ring: C.cyan,   glow: 0x0A1A3A },
  connecting: { bar: C.blue,   core: C.cyan,   ring: C.cyan,   glow: 0x0A2255 },
  listening:  { bar: C.cyan,   core: C.cyan,   ring: C.cyan,   glow: 0x083A44 },
  thinking:   { bar: C.indigo, core: C.indigo, ring: C.indigo, glow: 0x1A0A3A },
  speaking:   { bar: C.cyan,   core: C.cyan,   ring: C.blue,   glow: 0x0A1A44 },
  error:      { bar: 0xFF5555, core: 0xFF5555, ring: 0xFF4444, glow: 0x2A0808 },
  ended:      { bar: 0x334466, core: 0x334466, ring: 0x223355, glow: 0x050710 },
};

function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }
function clamp(v: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, v)); }

interface Props {
  state: VoiceState;
  audioLevel: number;
  aiAudioLevel: number;
  lastAIMessage?: string;
}

export default function ProfessorScene({ state, audioLevel, aiAudioLevel, lastAIMessage }: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef<VoiceState>(state);
  const aiRef    = useRef(aiAudioLevel);
  const micRef   = useRef(audioLevel);

  useEffect(() => { stateRef.current = state; },      [state]);
  useEffect(() => { aiRef.current  = aiAudioLevel; }, [aiAudioLevel]);
  useEffect(() => { micRef.current = audioLevel; },   [audioLevel]);

  useEffect(() => {
    const el = mountRef.current;
    if (!el) return;
    const W = el.clientWidth || 800;
    const H = el.clientHeight || 600;

    // ── Renderer ───────────────────────────────────────────────────────────────
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(W, H);
    renderer.setClearColor(0x000000, 0);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    el.appendChild(renderer.domElement);
    Object.assign(renderer.domElement.style, { width: "100%", height: "100%", display: "block" });

    const scene  = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(46, W / H, 0.1, 60);
    camera.position.set(0, 0, 4.2);
    camera.lookAt(0, 0, 0);

    const onResize = () => {
      const w = el.clientWidth, h = el.clientHeight;
      camera.aspect = w / h; camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener("resize", onResize);

    // ── Lights ─────────────────────────────────────────────────────────────────
    scene.add(new THREE.AmbientLight(0x5577AA, 0.5));
    const topLight = new THREE.PointLight(C.cyan, 1.8, 8);
    topLight.position.set(0, 3, 2);
    scene.add(topLight);
    const coreLight = new THREE.PointLight(C.blue, 3.0, 5);
    coreLight.position.set(0, 0, 0.5);
    scene.add(coreLight);

    // ── Core orb ───────────────────────────────────────────────────────────────
    // Inner bright nucleus
    const nucleusGeo = new THREE.SphereGeometry(0.14, 32, 24);
    const nucleusMat = new THREE.MeshStandardMaterial({
      color: C.cyan, emissive: C.cyan, emissiveIntensity: 2.5,
      roughness: 0.1, metalness: 0.2,
    });
    const nucleus = new THREE.Mesh(nucleusGeo, nucleusMat);
    scene.add(nucleus);

    // Mid glow shell
    const shellGeo = new THREE.SphereGeometry(0.24, 24, 18);
    const shellMat = new THREE.MeshStandardMaterial({
      color: C.blue, transparent: true, opacity: 0.12,
      roughness: 0.0, metalness: 0.0, side: THREE.BackSide,
      emissive: C.cyan, emissiveIntensity: 1.0,
    });
    const shellMesh = new THREE.Mesh(shellGeo, shellMat);
    scene.add(shellMesh);

    // Outer halo
    const haloGeo = new THREE.SphereGeometry(0.40, 20, 14);
    const haloMat = new THREE.MeshStandardMaterial({
      color: C.blue, transparent: true, opacity: 0.045,
      side: THREE.BackSide, roughness: 1, metalness: 0,
    });
    const haloMesh = new THREE.Mesh(haloGeo, haloMat);
    scene.add(haloMesh);

    // ── Frequency bars ─────────────────────────────────────────────────────────
    const BAR_COUNT  = 64;
    const BAR_RADIUS = 0.90; // distance from center to inner end of bar
    const BAR_BASE   = 0.06; // minimum bar length
    const BAR_MAX    = 0.55; // maximum bar extension
    const BAR_W      = 0.022;

    type Bar = {
      pivot: THREE.Group;
      mesh:  THREE.Mesh;
      mat:   THREE.MeshStandardMaterial;
      phase: number;
      curH:  number;
    };

    const bars: Bar[] = [];
    for (let i = 0; i < BAR_COUNT; i++) {
      const angle = (i / BAR_COUNT) * Math.PI * 2;
      const pivot = new THREE.Group();
      pivot.rotation.y = -angle;
      scene.add(pivot);

      // Box extends along Z; pivot rotation turns Z into the radial direction
      const geo = new THREE.BoxGeometry(BAR_W, BAR_W, BAR_BASE);
      const mat2 = new THREE.MeshStandardMaterial({
        color: C.cyan,
        emissive: C.cyan,
        emissiveIntensity: 0.8,
        roughness: 0.25,
        metalness: 0.4,
        transparent: true,
        opacity: 0.90,
      });
      const mesh = new THREE.Mesh(geo, mat2);
      // Position so inner face sits at BAR_RADIUS
      mesh.position.z = BAR_RADIUS + BAR_BASE / 2;
      pivot.add(mesh);

      bars.push({ pivot, mesh, mat: mat2, phase: (i / BAR_COUNT) * Math.PI * 2, curH: BAR_BASE });
    }

    // ── Accent rings ───────────────────────────────────────────────────────────
    type RingDef = { mesh: THREE.Mesh; mat: THREE.MeshStandardMaterial; speedX: number; speedZ: number };
    const accentRings: RingDef[] = [
      { r: 1.08, tube: 0.007, tiltX: Math.PI/2,   tiltZ: 0,     sX: 0.28,  sZ: 0.10 },
      { r: 1.18, tube: 0.005, tiltX: Math.PI/2.5, tiltZ: 0.55,  sX: -0.18, sZ: 0.22 },
      { r: 1.30, tube: 0.004, tiltX: Math.PI/3,   tiltZ: -0.40, sX: 0.12,  sZ: -0.16 },
    ].map(({ r, tube, tiltX, tiltZ, sX, sZ }) => {
      const geo = new THREE.TorusGeometry(r, tube, 10, 100);
      const mat2 = new THREE.MeshStandardMaterial({
        color: C.cyan, roughness: 0.2, metalness: 0.8,
        emissive: C.blue, emissiveIntensity: 0.8,
        transparent: true, opacity: 0.55,
      });
      const mesh = new THREE.Mesh(geo, mat2);
      mesh.rotation.x = tiltX;
      mesh.rotation.z = tiltZ;
      scene.add(mesh);
      return { mesh, mat: mat2, speedX: sX, speedZ: sZ };
    });

    // ── Orbiting glow dots ─────────────────────────────────────────────────────
    type GlowDot = { pivot: THREE.Group; mat: THREE.MeshStandardMaterial; speed: number };
    const glowDots: GlowDot[] = accentRings.map((ring, i) => {
      const pivot = new THREE.Group();
      pivot.rotation.x = ring.mesh.rotation.x;
      pivot.rotation.z = ring.mesh.rotation.z;
      scene.add(pivot);

      const r = [1.08, 1.18, 1.30][i];
      const size = [0.038, 0.030, 0.024][i];
      const mat2 = new THREE.MeshStandardMaterial({
        color: C.cyan, emissive: C.cyan,
        emissiveIntensity: 3.0, roughness: 0.0, metalness: 0.1,
      });
      const dot = new THREE.Mesh(new THREE.SphereGeometry(size, 10, 10), mat2);
      dot.position.set(r, 0, 0);
      pivot.add(dot);

      // Trail dots
      for (let t = 1; t <= 5; t++) {
        const tMat = new THREE.MeshBasicMaterial({
          color: C.blue, transparent: true,
          opacity: 0.5 - t * 0.09,
          blending: THREE.AdditiveBlending, depthWrite: false,
        });
        const tr = new THREE.Mesh(
          new THREE.SphereGeometry(size * (1 - t * 0.16), 6, 6), tMat
        );
        pivot.add(tr);
      }

      return { pivot, mat: mat2, speed: ring.speedX };
    });
    const dotAngles = glowDots.map(() => Math.random() * Math.PI * 2);

    // ── Floating particles ─────────────────────────────────────────────────────
    const PCOUNT = 280;
    const pPos  = new Float32Array(PCOUNT * 3);
    const pBase = new Float32Array(PCOUNT * 3);
    const pSpd  = new Float32Array(PCOUNT);
    const pAng  = new Float32Array(PCOUNT);
    for (let i = 0; i < PCOUNT; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi   = Math.acos(2 * Math.random() - 1);
      const r     = 1.5 + Math.random() * 1.2;
      pBase[i*3]   = pPos[i*3]   = r * Math.sin(phi) * Math.cos(theta);
      pBase[i*3+1] = pPos[i*3+1] = r * Math.sin(phi) * Math.sin(theta);
      pBase[i*3+2] = pPos[i*3+2] = r * Math.cos(phi);
      pSpd[i] = 0.0005 + Math.random() * 0.001;
      pAng[i] = Math.random() * Math.PI * 2;
    }
    const partGeo = new THREE.BufferGeometry();
    partGeo.setAttribute("position", new THREE.BufferAttribute(pPos.slice(), 3));
    const partMat = new THREE.PointsMaterial({
      color: C.blue, size: 0.022, sizeAttenuation: true,
      transparent: true, opacity: 0.40,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const particles = new THREE.Points(partGeo, partMat);
    scene.add(particles);

    // ── Pulse wave rings ───────────────────────────────────────────────────────
    type Pulse = { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; life: number };
    const pulses: Pulse[] = [];

    function emitPulse(color: number) {
      if (pulses.length >= 5) return;
      const geo = new THREE.TorusGeometry(0.90, 0.018, 8, 72);
      const mat2 = new THREE.MeshBasicMaterial({
        color, transparent: true, opacity: 0.70,
        blending: THREE.AdditiveBlending, depthWrite: false,
      });
      const mesh = new THREE.Mesh(geo, mat2);
      // Horizontal plane — matches the bar ring
      mesh.rotation.x = Math.PI / 2;
      scene.add(mesh);
      pulses.push({ mesh, mat: mat2, life: 1 });
    }

    // ── Thinking sweep indicator ────────────────────────────────────────────────
    // A single bright bar that sweeps around the ring during thinking
    const sweepGeo = new THREE.BoxGeometry(BAR_W * 1.6, BAR_W * 1.6, BAR_BASE + BAR_MAX * 0.6);
    const sweepMat = new THREE.MeshStandardMaterial({
      color: C.indigo, emissive: C.indigo, emissiveIntensity: 3.0,
      roughness: 0.1, metalness: 0.2,
      transparent: true, opacity: 0.9,
    });
    const sweepPivot = new THREE.Group();
    const sweepBar   = new THREE.Mesh(sweepGeo, sweepMat);
    sweepBar.position.z = BAR_RADIUS + (BAR_BASE + BAR_MAX * 0.6) / 2;
    sweepPivot.add(sweepBar);
    scene.add(sweepPivot);
    sweepPivot.visible = false;

    // ── Smooth state values ────────────────────────────────────────────────────
    const cur = {
      coreScale:  1.0,
      coreGlow:   2.5,
      ringOp:     0.55,
      partOp:     0.40,
      barColor:   new THREE.Color(C.cyan),
      coreColor:  new THREE.Color(C.cyan),
      ringColor:  new THREE.Color(C.cyan),
      glowColor:  new THREE.Color(C.deep),
    };
    const tBarColor  = new THREE.Color();
    const tCoreColor = new THREE.Color();
    const tRingColor = new THREE.Color();

    let pulseTimer  = 0;
    let sweepAngle  = 0;
    let frameId     = 0;
    const clock     = new THREE.Clock();

    // ── Simulated frequency data ───────────────────────────────────────────────
    function barTargetHeight(i: number, t: number, ai: number, mic: number, st: VoiceState): number {
      const norm = i / BAR_COUNT;

      if (st === "speaking") {
        // Layered sine waves simulate a real EQ spectrum
        const bass = Math.pow(Math.max(0, Math.sin(t * 5.5 + norm * Math.PI * 1.2)), 1.5);
        const mid  = Math.max(0, Math.sin(t * 11  + norm * Math.PI * 3.5));
        const hi   = Math.max(0, Math.sin(t * 18  + norm * Math.PI * 6.0)) * 0.6;
        const combined = (bass * 0.50 + mid * 0.35 + hi * 0.15);
        return BAR_BASE + (ai * 0.88 + 0.08) * BAR_MAX * combined;
      }
      if (st === "listening") {
        const wave = Math.max(0, Math.sin(t * 4 + norm * Math.PI * 4)) * 0.5 + 0.5;
        return BAR_BASE + mic * 0.28 * BAR_MAX * wave;
      }
      if (st === "thinking") {
        // Handled separately via sweep bar — keep main bars low
        return BAR_BASE + 0.015 * (Math.sin(t * 2 + norm * Math.PI * 2) * 0.5 + 0.5);
      }
      if (st === "connecting") {
        // Spinning ramp fills in
        const ramp = (norm + (t * 0.6 % 1)) % 1;
        return BAR_BASE + 0.22 * BAR_MAX * Math.pow(1 - ramp, 1.5);
      }
      // idle / ended
      return BAR_BASE + 0.018 * (Math.sin(t * 1.1 + norm * Math.PI * 2) * 0.5 + 0.5);
    }

    function animate() {
      frameId = requestAnimationFrame(animate);
      const t  = clock.getElapsedTime();
      const st = stateRef.current;
      const mic = clamp(micRef.current, 0, 1);
      const ai  = clamp(aiRef.current,  0, 1);
      const cfg = STATE_CFG[st];

      const isSpeaking  = st === "speaking";
      const isListening = st === "listening";
      const isThinking  = st === "thinking";

      // ── Target values ──────────────────────────────────────────────────────
      let tCoreScale  = 1.0;
      let tCoreGlow   = 2.5;
      let tRingOp     = 0.50;
      let tPartOp     = 0.38;

      if (isSpeaking) {
        tCoreScale = 1.0 + ai * 0.25 + Math.sin(t * 10) * ai * 0.06;
        tCoreGlow  = 4.0 + ai * 6.0;
        tRingOp    = 0.75 + ai * 0.25;
        tPartOp    = 0.65 + ai * 0.30;
      } else if (isListening) {
        tCoreScale = 1.0 + mic * 0.06;
        tCoreGlow  = 2.2 + mic * 1.5;
        tRingOp    = 0.35;
        tPartOp    = 0.30;
      } else if (isThinking) {
        tCoreScale = 1.0 + Math.sin(t * 2.5) * 0.05;
        tCoreGlow  = 2.8 + Math.sin(t * 2.0) * 0.6;
        tRingOp    = 0.60;
        tPartOp    = 0.50;
      } else if (st === "connecting") {
        tCoreScale = 1.0 + Math.sin(t * 4) * 0.08;
        tCoreGlow  = 3.2;
        tRingOp    = 0.65;
        tPartOp    = 0.55;
      } else {
        tCoreScale = 1.0 + Math.sin(t * 0.9) * 0.04;
        tCoreGlow  = 1.8;
        tRingOp    = 0.28;
        tPartOp    = 0.22;
      }

      const lp = 0.07;
      cur.coreScale = lerp(cur.coreScale, tCoreScale, lp);
      cur.coreGlow  = lerp(cur.coreGlow,  tCoreGlow,  0.04);
      cur.ringOp    = lerp(cur.ringOp,    tRingOp,    lp);
      cur.partOp    = lerp(cur.partOp,    tPartOp,    lp);

      tBarColor.setHex(cfg.bar);
      tCoreColor.setHex(cfg.core);
      tRingColor.setHex(cfg.ring);
      cur.barColor.lerp(tBarColor,   0.04);
      cur.coreColor.lerp(tCoreColor, 0.04);
      cur.ringColor.lerp(tRingColor, 0.04);

      // ── Core orb ────────────────────────────────────────────────────────────
      nucleus.scale.setScalar(cur.coreScale);
      shellMesh.scale.setScalar(cur.coreScale * 1.12);
      haloMesh.scale.setScalar(cur.coreScale * 1.20);
      nucleusMat.color.copy(cur.coreColor);
      nucleusMat.emissive.copy(cur.coreColor);
      nucleusMat.emissiveIntensity = cur.coreGlow * 0.9;
      shellMat.emissive.copy(cur.coreColor);
      shellMat.opacity = 0.10 + (isSpeaking ? ai * 0.14 : 0);
      coreLight.color.copy(cur.coreColor);
      coreLight.intensity = cur.coreGlow;
      topLight.color.copy(cur.ringColor);
      topLight.intensity = 1.5 + (isSpeaking ? ai * 1.5 : 0);

      // ── Frequency bars ───────────────────────────────────────────────────────
      bars.forEach((bar, i) => {
        const targetH = barTargetHeight(i, t, ai, mic, st);
        bar.curH = lerp(bar.curH, targetH, 0.18); // fast response

        const h  = bar.curH;
        bar.mesh.scale.z   = h / BAR_BASE;
        bar.mesh.position.z = BAR_RADIUS + h / 2;

        bar.mat.color.copy(cur.barColor);
        bar.mat.emissive.copy(cur.barColor);
        const relH = (h - BAR_BASE) / BAR_MAX;
        bar.mat.emissiveIntensity = 0.5 + relH * (isSpeaking ? 2.5 : 1.0);
        bar.mat.opacity = 0.55 + relH * 0.40;
      });

      // ── Accent rings spin ────────────────────────────────────────────────────
      const ringSpeedMult = isSpeaking ? 1.8 + ai * 3 : isThinking ? 1.5 : 1;
      accentRings.forEach((ring, i) => {
        ring.mesh.rotation.x += ring.speedX * ringSpeedMult * 0.010;
        ring.mesh.rotation.z += ring.speedZ * ringSpeedMult * 0.010;
        ring.mat.opacity = cur.ringOp - i * 0.08;
        ring.mat.color.copy(cur.ringColor);
        ring.mat.emissive.copy(cur.coreColor);
        ring.mat.emissiveIntensity = isSpeaking ? 1.0 + ai * 2.0 : 0.7;
      });

      // ── Orbiting glow dots ───────────────────────────────────────────────────
      glowDots.forEach((dot, i) => {
        const speedMult = isSpeaking ? 1.8 + ai * 2.5 : 1;
        const da = accentRings[i].speedX * speedMult * 0.010;
        dotAngles[i] += da;
        const r = [1.08, 1.18, 1.30][i];
        const ang = dotAngles[i];
        const children = dot.pivot.children;
        children[0].position.set(r * Math.cos(ang), 0, r * Math.sin(ang));
        dot.mat.color.copy(cur.ringColor);
        dot.mat.emissive.copy(cur.coreColor);
        dot.mat.emissiveIntensity = isSpeaking ? 4.0 + ai * 4 : 2.5;
        for (let k = 1; k < children.length; k++) {
          const ta = ang - da * k * 2.4;
          children[k].position.set(r * Math.cos(ta), 0, r * Math.sin(ta));
        }
      });

      // ── Particles ────────────────────────────────────────────────────────────
      const posArr = partGeo.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < PCOUNT; i++) {
        pAng[i] += pSpd[i] * (isSpeaking ? 1 + ai * 5 : 1);
        const drift = isSpeaking ? 0.06 + ai * 0.12 : 0.014;
        posArr.setXYZ(i,
          pBase[i*3]   + Math.cos(pAng[i] * 1.3) * drift,
          pBase[i*3+1] + Math.sin(pAng[i])        * drift,
          pBase[i*3+2] + Math.sin(pAng[i] * 0.8)  * drift * 0.5
        );
      }
      posArr.needsUpdate = true;
      partMat.opacity = cur.partOp;
      partMat.color.copy(cur.barColor);
      particles.rotation.y += 0.00018;

      // ── Pulse waves ──────────────────────────────────────────────────────────
      pulseTimer += 0.016;
      if (isSpeaking && ai > 0.12) {
        const interval = lerp(0.30, 0.07, ai);
        if (pulseTimer > interval) { emitPulse(cfg.ring); pulseTimer = 0; }
      }
      for (let i = pulses.length - 1; i >= 0; i--) {
        const p = pulses[i];
        p.life -= 0.020;
        p.mesh.scale.setScalar(1 + (1 - p.life) * 1.6);
        p.mat.opacity = p.life * 0.55;
        if (p.life <= 0) {
          scene.remove(p.mesh);
          p.mesh.geometry.dispose();
          p.mat.dispose();
          pulses.splice(i, 1);
        }
      }

      // ── Thinking sweep bar ────────────────────────────────────────────────────
      sweepPivot.visible = isThinking;
      if (isThinking) {
        sweepAngle += 0.055;
        sweepPivot.rotation.y = -sweepAngle;
        sweepMat.opacity = 0.7 + Math.sin(sweepAngle * 3) * 0.2;
        sweepMat.color.setHex(C.indigo);
        sweepMat.emissive.setHex(C.indigo);
      }

      // ── Camera subtle float ──────────────────────────────────────────────────
      camera.position.x = Math.sin(t * 0.09) * 0.12;
      camera.position.y = Math.cos(t * 0.07) * 0.08;
      camera.lookAt(0, 0, 0);

      renderer.render(scene, camera);
    }

    animate();

    return () => {
      cancelAnimationFrame(frameId);
      window.removeEventListener("resize", onResize);
      renderer.dispose();
      if (el.contains(renderer.domElement)) el.removeChild(renderer.domElement);
    };
  }, []);

  const label    = STATE_LABELS[state];
  const uiColor  = STATE_UI_COLOR[state];
  const isActive = state === "speaking" || state === "listening";

  return (
    <div style={{ position: "relative", width: "100%", height: "100%", background: "transparent" }}>
      {/* Three.js canvas */}
      <div ref={mountRef} style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} />

      {/* Radial ambient glow — uses theme accent */}
      <div style={{
        position: "absolute", inset: 0, pointerEvents: "none",
        background: `radial-gradient(ellipse 44% 44% at 50% 50%, ${
          state === "speaking"  ? "rgba(95,227,255,0.10)" :
          state === "listening" ? "rgba(95,227,255,0.07)" :
          state === "thinking"  ? "rgba(124,140,255,0.08)" :
                                  "rgba(90,168,255,0.05)"
        } 0%, transparent 65%)`,
        transition: "background 0.8s ease",
      }} />

      {/* Status pill — matches app glass style */}
      <div style={{
        position: "absolute", bottom: 28, left: "50%",
        transform: "translateX(-50%)",
        display: "flex", alignItems: "center", gap: 8,
        padding: "7px 18px", borderRadius: 999,
        background: "rgba(7,7,11,0.72)",
        border: `1px solid ${uiColor}`,
        backdropFilter: "blur(14px)",
        boxShadow: `0 0 18px ${uiColor.replace("0.90","0.15")}, inset 0 1px 0 rgba(255,255,255,0.06)`,
        transition: "border-color 0.5s, box-shadow 0.5s",
        zIndex: 10,
      }}>
        <span style={{
          width: 7, height: 7, borderRadius: "50%",
          background: uiColor, boxShadow: `0 0 7px ${uiColor}`,
          animation: isActive ? "vsPulse 1.0s ease-in-out infinite" : "none",
          flexShrink: 0,
        }} />
        <span style={{
          fontSize: 11, fontWeight: 800, letterSpacing: "0.06em",
          color: "rgba(255,255,255,0.90)", whiteSpace: "nowrap",
        }}>
          {label}
        </span>
      </div>

      {/* Last AI message */}
      {lastAIMessage && (
        <div style={{
          position: "absolute", bottom: 70, left: "50%",
          transform: "translateX(-50%)",
          maxWidth: "64%", textAlign: "center",
          fontSize: 12.5, lineHeight: 1.6,
          color: "rgba(255,255,255,0.46)",
          fontStyle: "italic", letterSpacing: "0.01em",
          pointerEvents: "none", zIndex: 10,
          overflow: "hidden",
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical" as const,
          textOverflow: "ellipsis",
        }}>
          &ldquo;{lastAIMessage}&rdquo;
        </div>
      )}

      {/* Listening hint */}
      {state === "listening" && (
        <div style={{
          position: "absolute", top: 20, left: "50%",
          transform: "translateX(-50%)",
          fontSize: 10, fontWeight: 700,
          color: "rgba(95,227,255,0.58)",
          letterSpacing: "0.14em", textTransform: "uppercase",
          pointerEvents: "none", zIndex: 10,
        }}>
          Speak now…
        </div>
      )}

      <style>{`
        @keyframes vsPulse {
          0%,100% { opacity:1; transform:scale(1); }
          50%      { opacity:0.38; transform:scale(1.55); }
        }
      `}</style>
    </div>
  );
}
