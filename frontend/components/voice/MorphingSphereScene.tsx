"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import type { VoiceState } from "../../lib/hooks/useVoiceSession";

interface Props {
  voiceState?: VoiceState;
  aiAudioLevel?: number;
  audioLevel?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// GLSL — Sphere (Simplex noise vertex displacement + HSV coloring)
// ─────────────────────────────────────────────────────────────────────────────

const SPHERE_VS = /* glsl */ `
  varying vec3 v_color;
  varying vec3 v_normal;

  uniform float u_time;
  uniform float u_progress;

  // ── HSV → RGB ────────────────────────────────────────────────────────────
  vec3 hsv2rgb(vec3 c) {
    vec4 K = vec4(1.0, 2.0/3.0, 1.0/3.0, 3.0);
    vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
    return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
  }

  // ── Simplex 3D noise ─────────────────────────────────────────────────────
  vec4 permute(vec4 x) { return mod(((x * 34.0) + 1.0) * x, 289.0); }
  vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

  float snoise(vec3 v) {
    const vec2 C = vec2(1.0/6.0, 1.0/3.0);
    const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);

    vec3 i  = floor(v + dot(v, C.yyy));
    vec3 x0 = v   - i + dot(i, C.xxx);
    vec3 g  = step(x0.yzx, x0.xyz);
    vec3 l  = 1.0 - g;
    vec3 i1 = min(g.xyz, l.zxy);
    vec3 i2 = max(g.xyz, l.zxy);
    vec3 x1 = x0 - i1 + C.xxx;
    vec3 x2 = x0 - i2 + 2.0*C.xxx;
    vec3 x3 = x0 - 1.0 + 3.0*C.xxx;

    i = mod(i, 289.0);
    vec4 p = permute(permute(permute(
        i.z + vec4(0.0, i1.z, i2.z, 1.0))
      + i.y + vec4(0.0, i1.y, i2.y, 1.0))
      + i.x + vec4(0.0, i1.x, i2.x, 1.0));

    float n_ = 1.0/7.0;
    vec3  ns  = n_ * D.wyz - D.xzx;
    vec4  j   = p - 49.0 * floor(p * ns.z * ns.z);
    vec4  x_  = floor(j * ns.z);
    vec4  y_  = floor(j - 7.0 * x_);
    vec4  x   = x_ * ns.x + ns.yyyy;
    vec4  y   = y_ * ns.x + ns.yyyy;
    vec4  h   = 1.0 - abs(x) - abs(y);

    vec4 b0 = vec4(x.xy, y.xy);
    vec4 b1 = vec4(x.zw, y.zw);
    vec4 s0 = floor(b0) * 2.0 + 1.0;
    vec4 s1 = floor(b1) * 2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));
    vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
    vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;

    vec3 p0 = vec3(a0.xy, h.x);
    vec3 p1 = vec3(a0.zw, h.y);
    vec3 p2 = vec3(a1.xy, h.z);
    vec3 p3 = vec3(a1.zw, h.w);

    vec4 norm = taylorInvSqrt(vec4(
      dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
    p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;

    vec4 m = max(0.6 - vec4(
      dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
    m = m * m;
    return 42.0 * dot(m * m, vec4(
      dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
  }

  void main() {
    float noise  = snoise(position * u_progress + u_time * 0.10);
    vec3  newPos = position * (noise + 0.75);

    // PrepareUp palette: cyan-blue hue range (0.54 → 0.66)
    v_color  = hsv2rgb(vec3(0.545 + noise * 0.11, 0.74, 0.90));
    v_normal = normal;

    gl_Position = projectionMatrix * modelViewMatrix * vec4(newPos, 1.0);
  }
`;

const SPHERE_FS = /* glsl */ `
  varying vec3 v_color;
  varying vec3 v_normal;

  void main() {
    vec3 skyColor    = vec3(0.37, 0.88, 1.00);   // bright cyan
    vec3 groundColor = vec3(0.03, 0.08, 0.28);   // deep navy

    vec3 lightDir = normalize(vec3(0.5, -1.0, -0.7));
    vec3 light    = mix(skyColor, groundColor, dot(lightDir, v_normal) * 0.5 + 0.5);

    gl_FragColor = vec4(light * v_color, 1.0);
  }
`;

// ─────────────────────────────────────────────────────────────────────────────
// GLSL — Particles (30K golden-angle sphere + sine displacement)
// ─────────────────────────────────────────────────────────────────────────────

const PARTICLE_VS = /* glsl */ `
  uniform float u_time;

  void main() {
    vec3 p = position;
    p.y += 0.22 * (sin(p.y * 5.0 + u_time) * 0.5 + 0.5);
    p.z += 0.06 * (sin(p.y * 9.0  + u_time) * 0.5 + 0.5);
    p.x += 0.04 * (sin(p.x * 7.0  + u_time * 0.8) * 0.5 + 0.5);

    vec4 mvPos   = modelViewMatrix * vec4(p, 1.0);
    gl_PointSize = 7.0 * (1.0 / -mvPos.z);
    gl_Position  = projectionMatrix * mvPos;
  }
`;

const PARTICLE_FS = /* glsl */ `
  uniform float u_progress;   // controls opacity

  void main() {
    // Soft round disc per point
    vec2  coord = gl_PointCoord - 0.5;
    float dist  = length(coord);
    if (dist > 0.5) discard;
    float alpha = (1.0 - dist * 2.0) * u_progress;
    gl_FragColor = vec4(0.52, 0.74, 1.00, alpha);
  }
`;

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }

export default function MorphingSphereScene({
  voiceState = "idle",
  aiAudioLevel = 0,
  audioLevel = 0,
}: Props) {
  const mountRef = useRef<HTMLDivElement>(null);

  // Live refs — avoids stale closures in animation loop
  const vsRef  = useRef(voiceState);
  const aiRef  = useRef(aiAudioLevel);
  const micRef = useRef(audioLevel);
  useEffect(() => { vsRef.current  = voiceState;   }, [voiceState]);
  useEffect(() => { aiRef.current  = aiAudioLevel; }, [aiAudioLevel]);
  useEffect(() => { micRef.current = audioLevel;   }, [audioLevel]);

  useEffect(() => {
    const el = mountRef.current;
    if (!el) return;
    const W = el.clientWidth  || 700;
    const H = el.clientHeight || 700;

    // ── Renderer (transparent — WavyBackground shows through) ───────────────
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(W, H);
    renderer.setClearColor(0x000000, 0);
    el.appendChild(renderer.domElement);
    Object.assign(renderer.domElement.style, {
      width: "100%", height: "100%", display: "block",
    });

    const scene  = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, W / H, 0.1, 10000);
    camera.position.set(0, 0, 5.5);

    const clock = new THREE.Clock();

    // ── Resize ───────────────────────────────────────────────────────────────
    const onResize = () => {
      const w = el.clientWidth, h = el.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener("resize", onResize, { passive: true });

    // ── Morphing sphere ──────────────────────────────────────────────────────
    const sphereMat = new THREE.ShaderMaterial({
      vertexShader:   SPHERE_VS,
      fragmentShader: SPHERE_FS,
      uniforms: {
        u_time:     { value: 0 },
        u_progress: { value: 1 },
      },
    });
    const sphere = new THREE.Mesh(
      new THREE.SphereGeometry(1, 128, 128),
      sphereMat,
    );
    scene.add(sphere);

    // ── Particle cloud — golden-angle fibonacci sphere ────────────────────
    const N      = 30000;
    const ptPos  = new Float32Array(N * 3);
    const inc    = Math.PI * (3 - Math.sqrt(5));
    const offset = 2 / N;
    const pRadius = 2.15;
    for (let i = 0; i < N; i++) {
      const y   = i * offset - 1 + offset / 2;
      const r   = Math.sqrt(Math.max(0, 1 - y * y));
      const phi = i * inc;
      ptPos[i*3]   = pRadius * Math.cos(phi) * r;
      ptPos[i*3+1] = pRadius * y;
      ptPos[i*3+2] = pRadius * Math.sin(phi) * r;
    }
    const ptGeo = new THREE.BufferGeometry();
    ptGeo.setAttribute("position", new THREE.BufferAttribute(ptPos, 3));

    const ptMat = new THREE.ShaderMaterial({
      vertexShader:   PARTICLE_VS,
      fragmentShader: PARTICLE_FS,
      transparent: true,
      depthWrite: false,
      uniforms: {
        u_time:     { value: 0 },
        u_progress: { value: 0 },
      },
    });
    const points = new THREE.Points(ptGeo, ptMat);
    scene.add(points);

    // ── Animation loop ────────────────────────────────────────────────────────
    let frameId = 0;
    let smoothProgress = 1.0;
    let smoothParticle = 0.0;

    function animate() {
      frameId = requestAnimationFrame(animate);
      const t          = clock.getElapsedTime();
      const vs         = vsRef.current;
      const ai         = aiRef.current;
      const isSpeaking = vs === "speaking";
      const isListening= vs === "listening";

      // Base progress: slow sine oscillation between 1 and 5 (~12 s period)
      const base = 1.0 + 2.0 * (0.5 + 0.5 * Math.sin(t * 0.28 - Math.PI * 0.5)) * 2.0;

      // Audio pushes spikiness higher when AI is speaking
      const targetProgress = isSpeaking
        ? base + ai * 4.5
        : isListening
        ? Math.max(1.0, base - 1.0)
        : base;

      smoothProgress = lerp(smoothProgress, targetProgress, 0.035);
      sphereMat.uniforms.u_time.value     = t;
      sphereMat.uniforms.u_progress.value = smoothProgress;

      // Particle opacity fades in and tracks audio
      const targetParticle = isSpeaking
        ? 0.28 + ai * 0.28
        : isListening
        ? 0.20
        : 0.16;
      smoothParticle = lerp(smoothParticle, targetParticle, 0.04);
      ptMat.uniforms.u_time.value     = t;
      ptMat.uniforms.u_progress.value = smoothParticle;

      // Rotation — faster when AI is active
      const rotSpeed = isSpeaking ? 0.007 + ai * 0.014 : 0.004;
      points.rotation.y += rotSpeed;
      sphere.rotation.y += rotSpeed * 0.25;
      sphere.rotation.x  = Math.sin(t * 0.12) * 0.08;

      camera.lookAt(scene.position);
      renderer.render(scene, camera);
    }
    animate();

    return () => {
      cancelAnimationFrame(frameId);
      window.removeEventListener("resize", onResize);
      renderer.dispose();
      sphereMat.dispose();
      ptMat.dispose();
      sphere.geometry.dispose();
      ptGeo.dispose();
      if (el.contains(renderer.domElement)) el.removeChild(renderer.domElement);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div
      ref={mountRef}
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
    />
  );
}
