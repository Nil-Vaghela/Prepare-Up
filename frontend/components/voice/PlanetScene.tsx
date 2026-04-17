"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import type { VoiceState } from "../../lib/hooks/useVoiceSession";

interface Props {
  voiceState?: VoiceState;
  audioLevel?: number;
  aiAudioLevel?: number;
}

// ── Ripple/Shockwave shader ─────────────────────────────────────────────────
const MAX_RIPPLES = 10;
const RIPPLE_DURATION = 25; // seconds

const RippleShader = {
  uniforms: {
    tDiffuse:           { value: null as THREE.Texture | null },
    centers:            { value: Array.from({ length: MAX_RIPPLES }, () => new THREE.Vector2(0.5, 0.5)) },
    times:              { value: new Array<number>(MAX_RIPPLES).fill(0) },
    rippleActive:       { value: new Array<number>(MAX_RIPPLES).fill(0) },
    maxRadius:          { value: 1.0 },
    amplitude:          { value: 0.03 },
    secondaryAmplitude: { value: 0.01 },
    speed:              { value: 0.3 },
    frequency:          { value: 10.0 },
    aspect:             { value: 1.0 },
    smoothing:          { value: 0.95 },
    sigma:              { value: 0.6 },
    fadeDuration:       { value: 6.0 },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main(){
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.);
    }
  `,
  fragmentShader: /* glsl */`
    #define PI 3.14159265359
    #define MAX_RIPPLES ${MAX_RIPPLES}
    uniform sampler2D tDiffuse;
    uniform vec2  centers[MAX_RIPPLES];
    uniform float times[MAX_RIPPLES];
    uniform float rippleActive[MAX_RIPPLES];
    uniform float maxRadius;
    uniform float amplitude;
    uniform float secondaryAmplitude;
    uniform float speed;
    uniform float frequency;
    uniform float aspect;
    uniform float smoothing;
    uniform float sigma;
    uniform float fadeDuration;
    varying vec2 vUv;
    void main(){
      vec2 uv = vUv;
      vec2 totalWave = vec2(0.);
      for(int i=0;i<MAX_RIPPLES;i++){
        if(rippleActive[i]>0.){
          vec2 aUV = vec2((uv.x-centers[i].x)*aspect, uv.y-centers[i].y);
          float dist = length(aUV);
          float t = times[i]*speed;
          if(dist<t){
            float normDist = dist/maxRadius;
            float decay    = 1./(1.+sigma*normDist*normDist);
            float timeFade = pow(smoothstep(fadeDuration, fadeDuration-2., times[i]),2.);
            float smooth_  = smoothstep(1.-smoothing,1.,normDist);
            float pWave    = amplitude*sin(frequency*(t-dist))*decay*(1.-smooth_)*timeFade;
            float sWave    = secondaryAmplitude*sin(.5*frequency*(t-dist)+PI)*decay*(1.-smooth_)*timeFade;
            totalWave += normalize(aUV)*(pWave+sWave);
          }
        }
      }
      uv += totalWave;
      gl_FragColor = texture2D(tDiffuse,clamp(uv,0.,1.));
    }
  `,
};

// ── Component ────────────────────────────────────────────────────────────────
export default function PlanetScene({ audioLevel = 0, aiAudioLevel = 0 }: Props) {
  const mountRef  = useRef<HTMLDivElement>(null);
  const audioRef  = useRef(0);
  const aiRef     = useRef(0);

  useEffect(() => { audioRef.current = audioLevel;   }, [audioLevel]);
  useEffect(() => { aiRef.current    = aiAudioLevel; }, [aiAudioLevel]);

  useEffect(() => {
    const el = mountRef.current;
    if (!el) return;

    // ── Renderer — fills full panel, no mix-blend tricks needed ──────────────
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 1);
    const canvas = renderer.domElement;
    canvas.style.position = "absolute";
    canvas.style.inset    = "0";
    canvas.style.width    = "100%";
    canvas.style.height   = "100%";
    el.appendChild(canvas);

    // ── Scene & camera ────────────────────────────────────────────────────────
    const scene  = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    camera.position.z = 5;

    // ── Stars (Three.js, spread across full scene) ────────────────────────────
    const starCount = 1000;
    const starPos   = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount * 3; i++) starPos[i] = (Math.random() - 0.5) * 200;
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute("position", new THREE.BufferAttribute(starPos, 3));
    scene.add(new THREE.Points(starGeo, new THREE.PointsMaterial({
      color: "cyan", size: 0.12, sizeAttenuation: true, transparent: true, opacity: 0.7,
    })));

    // ── Lights ────────────────────────────────────────────────────────────────
    const ptLight = new THREE.PointLight(0xffffff, 1);
    ptLight.position.set(5, 5, 5);
    scene.add(ptLight);

    // ── Rotating group ────────────────────────────────────────────────────────
    const group = new THREE.Group();
    scene.add(group);

    // Inner icosahedron
    const innerGeo = new THREE.IcosahedronGeometry(1, 3);
    const innerMat = new THREE.MeshStandardMaterial({
      color: 0x222222, roughness: 0.5, metalness: 1,
      flatShading: true, transparent: true, opacity: 0.7,
    });
    const innerMesh = new THREE.Mesh(innerGeo, innerMat);
    group.add(innerMesh);

    // Wireframe overlay
    const outerGeo  = new THREE.IcosahedronGeometry(1.15, 3);
    const wfMat     = new THREE.MeshBasicMaterial({
      color: 0xffffff, wireframe: true, transparent: true, opacity: 0.1,
    });
    const wfMesh = new THREE.Mesh(outerGeo, wfMat);
    group.add(wfMesh);

    // Cyan surface particles (on wireframe vertices)
    const posAttr = outerGeo.attributes.position;
    const ptPositions: number[] = [];
    for (let i = 0; i < posAttr.count; i++) {
      ptPositions.push(posAttr.getX(i), posAttr.getY(i), posAttr.getZ(i));
    }
    const ptGeo = new THREE.BufferGeometry();
    ptGeo.setAttribute("position", new THREE.Float32BufferAttribute(ptPositions, 3));
    group.add(new THREE.Points(ptGeo, new THREE.PointsMaterial({
      color: "cyan", size: 0.025,
    })));

    // ── Post-processing ───────────────────────────────────────────────────────
    // NOTE: composer size is set in applySize below
    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));

    const bloomPass = new UnrealBloomPass(
      new THREE.Vector2(460, 460),
      1.5, 0.4, 0.05,
    );
    composer.addPass(bloomPass);

    const ripplePass = new ShaderPass(RippleShader);
    ripplePass.renderToScreen = true;
    composer.addPass(ripplePass);

    // ── Ripple state ──────────────────────────────────────────────────────────
    type Ripple = { center: THREE.Vector2; startTime: number };
    let ripples: Ripple[] = [];

    function spawnRipple(normX: number, normY: number) {
      ripples.push({ center: new THREE.Vector2(normX, normY), startTime: performance.now() / 1000 });
      if (ripples.length > MAX_RIPPLES) ripples.shift();
    }

    function updateRippleUniforms() {
      const now      = performance.now() / 1000;
      const uCenters = ripplePass.uniforms["centers"].value as THREE.Vector2[];
      const uTimes   = ripplePass.uniforms["times"].value as number[];
      const uActive  = ripplePass.uniforms["rippleActive"].value as number[];
      for (let i = 0; i < MAX_RIPPLES; i++) {
        if (i < ripples.length) {
          const age = now - ripples[i].startTime;
          uCenters[i].copy(ripples[i].center);
          uTimes[i]  = age;
          uActive[i] = age < RIPPLE_DURATION ? 1.0 : 0.0;
        } else {
          uActive[i] = 0.0;
        }
      }
      // Prune expired
      ripples = ripples.filter(r => (performance.now() / 1000 - r.startTime) < RIPPLE_DURATION);
    }

    // Click to spawn ripple (using canvas-relative coordinates)
    const onDblClick = (e: MouseEvent) => {
      const rect = el.getBoundingClientRect();
      const x    = (e.clientX - rect.left)  / rect.width;
      const y    = 1 - (e.clientY - rect.top) / rect.height;
      spawnRipple(x, y);
    };
    el.addEventListener("dblclick", onDblClick);

    // Auto-ripple: random position near centre every ~2-3 s
    let lastAutoRipple = performance.now() / 1000;
    let nextAutoDelay  = 2 + Math.random();

    // ── Resize ────────────────────────────────────────────────────────────────
    function applySize(w: number, h: number) {
      renderer.setSize(w, h, false);
      composer.setSize(w, h);
      bloomPass.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      (ripplePass.uniforms["aspect"] as { value: number }).value = w / h;
    }
    const ro = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect;
      applySize(Math.round(width) || 460, Math.round(height) || 460);
    });
    ro.observe(el);
    requestAnimationFrame(() => applySize(el.clientWidth || 460, el.clientHeight || 460));

    // ── Animate ───────────────────────────────────────────────────────────────
    let raf = 0;
    const clock = new THREE.Clock();
    let smoothBloom = 1.5;

    function animate() {
      raf = requestAnimationFrame(animate);
      const t   = clock.getElapsedTime();
      const now = performance.now() / 1000;
      const combined = Math.max(audioRef.current, aiRef.current);

      // Smooth bloom with audio
      const targetBloom = 1.5 + combined * 2.5;
      smoothBloom = smoothBloom * 0.92 + targetBloom * 0.08;
      bloomPass.strength = smoothBloom;

      // Rotation — slightly faster when audio active
      const speed = 0.003 + combined * 0.004;
      group.rotation.x += 0.002;
      group.rotation.y += speed;

      // Auto ripples
      if (now - lastAutoRipple > nextAutoDelay) {
        const angle = Math.random() * Math.PI * 2;
        const r     = 0.1 + Math.random() * 0.3;
        spawnRipple(0.5 + Math.cos(angle) * r, 0.5 + Math.sin(angle) * r);
        lastAutoRipple = now;
        nextAutoDelay  = 2 + Math.random() * 1.5;
      }

      updateRippleUniforms();
      composer.render();
    }
    animate();

    // ── Cleanup ───────────────────────────────────────────────────────────────
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      el.removeEventListener("dblclick", onDblClick);
      renderer.dispose();
      composer.dispose();
      if (canvas.parentNode === el) el.removeChild(canvas);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      ref={mountRef}
      style={{ position: "relative", width: "100%", height: "100%" }}
    />
  );
}
