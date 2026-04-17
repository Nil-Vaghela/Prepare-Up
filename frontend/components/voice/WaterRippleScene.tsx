"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

// ─────────────────────────────────────────────────────────────────────────────
// Water ripple orb — always-on fluid animation, transparent bg, centred
// No audio-reactive behaviour: same animation regardless of voice state
// ─────────────────────────────────────────────────────────────────────────────

const N = 256;

const VERT = /* glsl */`
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position, 1.0); }
`;

const FRAG = /* glsl */`
  uniform float u_time;
  uniform vec2  u_resolution;
  uniform sampler2D u_waterTex;
  uniform float u_waterStrength;

  void main() {
    vec2 r   = u_resolution;
    vec2 FC  = gl_FragCoord.xy;
    vec2 screenP = (FC * 2.0 - r) / min(r.x, r.y);

    // Circular alpha mask
    float dist  = length(screenP);
    float alpha = smoothstep(0.90, 0.72, dist);
    if (alpha <= 0.0) { gl_FragColor = vec4(0.0); return; }

    // Water displacement
    vec2 wCoord = vec2(FC.x / r.x, FC.y / r.y);
    float waterH = texture2D(u_waterTex, wCoord).r;
    float wInfl  = clamp(waterH * u_waterStrength, -0.6, 0.6);
    float totalW = clamp(wInfl * u_waterStrength, -0.9, 0.9);

    vec2 p = screenP * 0.9;
    float angle = length(p) * 4.0;
    mat2 R = mat2(cos(angle), -sin(angle), sin(angle), cos(angle));
    p *= R;

    float l  = length(p) - 0.7 + totalW * 0.5;
    float t  = u_time * 1.3 + totalW * 2.0;
    float eY = p.y + totalW * 0.3;

    float p1 = 0.5 + 0.5 * tanh(0.1 / max(l/0.1,-l) - sin(l + eY*max(1.0,-l/0.1) + t));
    float p2 = 0.5 + 0.5 * tanh(0.1 / max(l/0.1,-l) - sin(l + eY*max(1.0,-l/0.1) + t + 1.0));
    float p3 = 0.5 + 0.5 * tanh(0.1 / max(l/0.1,-l) - sin(l + eY*max(1.0,-l/0.1) + t + 2.0));

    vec3 color;
    color.r = p1 * 0.05;
    color.g = p2 * 0.80;
    color.b = p3 * 1.00;

    gl_FragColor = vec4(color, alpha);
  }
`;

interface Props {
  audioLevel?:   number;
  aiAudioLevel?: number;
}

export default function WaterRippleScene(_props: Props) {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = mountRef.current;
    if (!el) return;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    const canvas = renderer.domElement;
    canvas.style.position = "absolute";
    canvas.style.inset    = "0";
    canvas.style.width    = "100%";
    canvas.style.height   = "100%";
    el.appendChild(canvas);

    const scene  = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    // ── Water simulation ──────────────────────────────────────────────────────
    let cur  = new Float32Array(N * N);
    let prev = new Float32Array(N * N);
    const vel = new Float32Array(N * N * 2);

    const waterTex = new THREE.DataTexture(cur, N, N, THREE.RedFormat, THREE.FloatType);
    waterTex.minFilter = THREE.LinearFilter;
    waterTex.magFilter = THREE.LinearFilter;
    waterTex.needsUpdate = true;

    const uniforms = {
      u_time:          { value: 0 },
      u_resolution:    { value: new THREE.Vector2(1, 1) },
      u_waterTex:      { value: waterTex },
      u_waterStrength: { value: 0.65 },
    };

    const mat = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG,
      uniforms, transparent: true,
    });
    scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat));

    // ── Ripple helpers ────────────────────────────────────────────────────────
    function addRipple(px: number, py: number, strength = 1.0) {
      const w  = el!.clientWidth  || 400;
      const h  = el!.clientHeight || 400;
      const tx = Math.floor((px / w) * N);
      const ty = Math.floor((1 - py / h) * N);
      const radius = 10;
      const force  = strength * 0.55;
      for (let i = -radius; i <= radius; i++) {
        for (let j = -radius; j <= radius; j++) {
          const d2 = i*i + j*j;
          if (d2 > radius * radius) continue;
          const x = tx + i, y = ty + j;
          if (x < 1 || x >= N-1 || y < 1 || y >= N-1) continue;
          const idx = y * N + x;
          const d   = Math.sqrt(d2);
          const val = Math.cos((d / radius) * Math.PI * 0.5) * force * (1 - d / radius);
          prev[idx] += val;
          const ang = Math.atan2(j, i);
          vel[idx*2]   += Math.cos(ang) * val * 0.25;
          vel[idx*2+1] += Math.sin(ang) * val * 0.25;
        }
      }
    }

    function stepWater() {
      for (let i = 0; i < N * N * 2; i++) vel[i] *= 0.92;
      for (let i = 1; i < N-1; i++) {
        for (let j = 1; j < N-1; j++) {
          const idx = i * N + j;
          cur[idx]  = (prev[idx-N] + prev[idx+N] + prev[idx-1] + prev[idx+1]) / 2 - cur[idx];
          cur[idx] *= 0.913;
          const vm  = Math.sqrt(vel[idx*2]**2 + vel[idx*2+1]**2);
          cur[idx] += Math.min(vm * 0.01, 0.1);
          cur[idx]  = Math.max(-2, Math.min(2, cur[idx]));
        }
      }
      for (let i = 0; i < N; i++) {
        cur[i] = 0; cur[(N-1)*N+i] = 0;
        cur[i*N] = 0; cur[i*N+(N-1)] = 0;
      }
      [cur, prev] = [prev, cur];
      waterTex.image.data = cur;
      waterTex.needsUpdate = true;
    }

    // ── Resize ────────────────────────────────────────────────────────────────
    const ro = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      const w = Math.round(width) || 400, h = Math.round(height) || 400;
      renderer.setSize(w, h, false);
      uniforms.u_resolution.value.set(w, h);
    });
    ro.observe(el);
    requestAnimationFrame(() => {
      const w = el.clientWidth || 400, h = el.clientHeight || 400;
      renderer.setSize(w, h, false);
      uniforms.u_resolution.value.set(w, h);
    });

    // ── Mouse interaction ─────────────────────────────────────────────────────
    let lastX = 0, lastY = 0, lastT = 0;
    function onMove(e: MouseEvent) {
      const rect = el!.getBoundingClientRect();
      const mx = e.clientX - rect.left, my = e.clientY - rect.top;
      const now = performance.now();
      if (now - lastT < 8) return;
      lastT = now;
      const dx = mx - lastX, dy = my - lastY;
      const d = Math.sqrt(dx*dx + dy*dy);
      if (d > 1) { addRipple(mx, my, Math.min(d / 20, 1) * 1.2); lastX = mx; lastY = my; }
    }
    function onClick(e: MouseEvent) {
      const r = el!.getBoundingClientRect();
      addRipple(e.clientX - r.left, e.clientY - r.top, 3.5);
    }
    el.addEventListener("mousemove", onMove);
    el.addEventListener("click", onClick);

    // ── Idle ripples — keeps it alive without interaction ─────────────────────
    const clock = new THREE.Clock();
    let raf = 0, nextIdle = 0;

    function animate() {
      raf = requestAnimationFrame(animate);
      const t = clock.getElapsedTime();
      uniforms.u_time.value = t;

      if (t > nextIdle) {
        const w = el!.clientWidth || 400, h = el!.clientHeight || 400;
        addRipple(
          w * 0.25 + Math.random() * w * 0.5,
          h * 0.25 + Math.random() * h * 0.5,
          0.3 + Math.random() * 0.5,
        );
        nextIdle = t + 0.9 + Math.random() * 0.8;
      }

      stepWater();
      renderer.render(scene, camera);
    }
    animate();

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      el.removeEventListener("mousemove", onMove);
      el.removeEventListener("click", onClick);
      renderer.dispose();
      if (canvas.parentNode === el) el.removeChild(canvas);
    };
  }, []);

  return (
    <div ref={mountRef} style={{ position: "relative", width: "100%", height: "100%" }} />
  );
}
