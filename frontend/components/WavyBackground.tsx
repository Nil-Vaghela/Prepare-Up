"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

/**
 * WavyBackground — Three.js WebGL full-screen fragment-shader animation.
 *
 * Visual: domain-warped fractional Brownian motion with directional wave
 * bands, colored dark-navy → royal-blue → cyan, mouse-reactive ripple,
 * specular crests, and subtle film grain.
 *
 * Renders into a fixed full-screen canvas at z-index 0.
 * Use on any page instead of AnimatedBackground.
 */
export default function WavyBackground() {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    // ── Renderer ────────────────────────────────────────────────
    const renderer = new THREE.WebGLRenderer({
      antialias: false,
      alpha: false,
      powerPreference: "high-performance",
    });
    renderer.setPixelRatio(dpr);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    const canvas = renderer.domElement;
    canvas.style.cssText =
      "position:fixed;inset:0;width:100vw;height:100vh;z-index:0;display:block;";
    mount.innerHTML = "";
    mount.appendChild(canvas);

    // ── Scene ───────────────────────────────────────────────────
    const scene  = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    const uniforms = {
      uTime:       { value: 0.0 },
      uResolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
      uMouse:      { value: new THREE.Vector2(0.5, 0.5) },
    };

    // ── Fragment shader ─────────────────────────────────────────
    const fragmentShader = /* glsl */ `
      precision highp float;

      uniform float     uTime;
      uniform vec2      uResolution;
      uniform vec2      uMouse;

      // ── Gradient noise (smooth, range 0..1) ──────────────────
      vec2 hash2(vec2 p) {
        p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
        return -1.0 + 2.0 * fract(sin(p) * 43758.5453123);
      }

      float gnoise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
        float n = dot(i, vec2(1.0, 157.0));
        return mix(
          mix(dot(hash2(i + vec2(0,0)), f - vec2(0,0)),
              dot(hash2(i + vec2(1,0)), f - vec2(1,0)), u.x),
          mix(dot(hash2(i + vec2(0,1)), f - vec2(0,1)),
              dot(hash2(i + vec2(1,1)), f - vec2(1,1)), u.x),
          u.y
        ) * 0.5 + 0.5;
      }

      // ── Fractal Brownian Motion ──────────────────────────────
      float fbm(vec2 p) {
        float v = 0.0, a = 0.52;
        mat2 rot = mat2(1.6, 1.2, -1.2, 1.6);
        for (int i = 0; i < 5; i++) {
          v += a * gnoise(p);
          p  = rot * p;
          a *= 0.50;
        }
        return v;
      }

      void main() {
        vec2 fc  = gl_FragCoord.xy;
        vec2 uv  = fc / uResolution.xy;
        float ar = uResolution.x / uResolution.y;
        float t  = uTime * 0.28;

        // ── Aspect-correct coordinates ────────────────────────
        vec2 p = vec2(uv.x * ar, uv.y);
        vec2 m = vec2(uMouse.x * ar, uMouse.y);

        // ── Mouse ripple ──────────────────────────────────────
        float md = length(p - m);
        float ripple = sin(md * 22.0 - uTime * 5.5)
                       * exp(-md * 6.0) * 0.10;

        // ── Domain warp (3-pass) ──────────────────────────────
        vec2 q = vec2(
          fbm(p * 1.10 + t * 0.40),
          fbm(p * 1.10 + vec2(5.2, 1.3) + t * 0.32)
        );
        vec2 r = vec2(
          fbm(p * 0.90 + 3.8 * q + vec2(1.7, 9.2) + t * 0.22),
          fbm(p * 0.90 + 3.8 * q + vec2(8.3, 2.8) + t * 0.18)
        );
        float h = fbm(p * 1.40 + 3.5 * r + ripple + t * 0.12);

        // ── Directional wave bands over warp ─────────────────
        h += sin(p.x * 3.2  + h * 5.0 - t * 1.30) * 0.090;
        h += sin(p.x * 1.8  + p.y * 0.9 - t * 0.85) * 0.075;
        h += sin((p.x - p.y * 1.4) * 2.6 + t * 1.05) * 0.060;
        h += sin(p.y * 4.5  + p.x * 0.6 + t * 0.70) * 0.045;
        h  = clamp(h, 0.0, 1.0);

        // ── Colour ramp: near-black → navy → blue → cyan ─────
        vec3 c0 = vec3(0.018, 0.020, 0.038);   // void black
        vec3 c1 = vec3(0.030, 0.055, 0.130);   // deep navy
        vec3 c2 = vec3(0.048, 0.125, 0.295);   // dark blue
        vec3 c3 = vec3(0.082, 0.260, 0.540);   // ocean blue
        vec3 c4 = vec3(0.150, 0.480, 0.760);   // mid blue
        vec3 c5 = vec3(0.310, 0.740, 0.940);   // cyan

        vec3 col = c0;
        col = mix(col, c1, smoothstep(0.18, 0.35, h));
        col = mix(col, c2, smoothstep(0.32, 0.50, h));
        col = mix(col, c3, smoothstep(0.48, 0.63, h));
        col = mix(col, c4, smoothstep(0.61, 0.76, h));
        col = mix(col, c5, smoothstep(0.74, 0.90, h) * 0.72);

        // ── Specular glint at crests ──────────────────────────
        float crest = smoothstep(0.80, 0.97, h);
        col += vec3(0.45, 0.88, 1.00) * crest * 0.40;

        // ── Second light in blue mid-tones ────────────────────
        float mid = smoothstep(0.44, 0.62, h) * (1.0 - smoothstep(0.62, 0.80, h));
        col += vec3(0.08, 0.20, 0.55) * mid * 0.18;

        // ── Mouse glow ────────────────────────────────────────
        col += vec3(0.18, 0.52, 0.95) * exp(-md * 3.2) * 0.22;

        // ── Vignette ─────────────────────────────────────────
        float vd  = length(uv - 0.5) * 1.55;
        float vig = 1.0 - smoothstep(0.40, 1.30, vd);
        col *= 0.60 + 0.40 * vig;

        // ── Dim — this is a background ────────────────────────
        col *= 0.75;

        // ── Subtle chromatic shift ────────────────────────────
        col.r *= 0.96;
        col.b *= 1.04;

        // ── Film grain ────────────────────────────────────────
        float g = fract(sin(dot(fc, vec2(12.9898, 78.233))) * 43758.5453) - 0.5;
        col += g * 0.014;

        gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
      }
    `;

    const material = new THREE.ShaderMaterial({
      uniforms,
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = vec4(position.xy, 0.0, 1.0);
        }
      `,
      fragmentShader,
    });

    const plane = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
    scene.add(plane);

    // ── Mouse tracking (smooth follow) ──────────────────────────
    const mouseTarget = new THREE.Vector2(0.5, 0.5);
    const onMouseMove = (e: MouseEvent) => {
      mouseTarget.set(
        e.clientX / window.innerWidth,
        1.0 - e.clientY / window.innerHeight,
      );
    };
    window.addEventListener("mousemove", onMouseMove, { passive: true });

    // ── Resize ───────────────────────────────────────────────────
    const onResize = () => {
      renderer.setSize(window.innerWidth, window.innerHeight);
      uniforms.uResolution.value.set(window.innerWidth, window.innerHeight);
    };
    window.addEventListener("resize", onResize, { passive: true });

    // ── Animate ──────────────────────────────────────────────────
    const clock = new THREE.Clock();
    let animId = 0;

    const animate = () => {
      animId = requestAnimationFrame(animate);
      uniforms.uTime.value += clock.getDelta();
      uniforms.uMouse.value.lerp(mouseTarget, 0.055);
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("resize", onResize);
      renderer.dispose();
      material.dispose();
      plane.geometry.dispose();
      if (mount.contains(canvas)) mount.removeChild(canvas);
    };
  }, []);

  return (
    <div
      ref={mountRef}
      style={{ position: "fixed", inset: 0, zIndex: 0 }}
      aria-hidden="true"
    />
  );
}
