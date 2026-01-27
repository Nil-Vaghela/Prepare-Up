

"use client";

/**
 * Prepare‑Up Dashboard (UI shell)
 *
 * Goals (your current requirements):
 * 1) White background + pink→orange accent gradient (#EE0979 → #FF6A00)
 * 2) Glass UI cards on top (frosted / soft borders)
 * 3) No whole‑page scrolling (only sidebar list scroll + chat scroll)
 * 4) Chat layout: user messages on LEFT, AI messages on RIGHT
 * 5) “What should I make from your notes?” block on RIGHT
 * 6) Top right: user chip + hamburger button (opens RIGHT drawer)
 * 7) Background animation (optional) – subtle, stays behind UI, interactive ripples
 */

import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";

type ChatMessage = {
  id: string;
  role: "user" | "ai";
  title: string;
  subtitle?: string;
};

export default function DashboardPage() {
  // Right drawer
  const [drawerOpen, setDrawerOpen] = useState(false);
  const drawerRef = useRef<HTMLDivElement | null>(null);

  // Three.js background mount
  const bgMountRef = useRef<HTMLDivElement | null>(null);

  // Demo messages (static for now; later you’ll render real chat history)
  const messages: ChatMessage[] = useMemo(
    () => [
      {
        id: "u1",
        role: "user",
        title: "Hello",
        subtitle: "I uploaded 3 files. Can you help me?"
      },
      {
        id: "a1",
        role: "ai",
        title: "Hello, Nil",
        subtitle: "Sources: 3 files • 1 channel"
      },
      {
        id: "a2",
        role: "ai",
        title: "What should I make from your notes?",
        subtitle: "Choose an output to begin"
      }
    ],
    []
  );

  // -----------------------------
  // 1) GLOBAL BEHAVIOR
  // -----------------------------

  // Close drawer on Esc
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDrawerOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // Disable whole-page scroll (we only want internal scroll areas)
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // Close drawer when clicking outside the drawer panel
  useEffect(() => {
    if (!drawerOpen) return;

    const onMouseDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (drawerRef.current && !drawerRef.current.contains(target)) {
        setDrawerOpen(false);
      }
    };

    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [drawerOpen]);

  // -----------------------------
  // 2) SHADERS (SUBTLE BACKGROUND)
  // -----------------------------

  /**
   * Keep shaders stable across renders.
   * IMPORTANT: We keep the background subtle (lower alpha) so it doesn’t disturb reading.
   */
  const shaders = useMemo(() => {
    const vertexShader = `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `;

    // Water + swirl circle with click ripple
    // - no text
    // - no audio
    // - softened alpha so it looks like a premium ambient blob
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

        // Sample water height
        vec2 wCoord = vec2(FC.x / r.x, FC.y / r.y);
        float waterHeight = texture2D(u_waterTexture, wCoord).r;
        float waterInfluence = clamp(waterHeight * u_waterStrength, -0.5, 0.5);

        // Circle: keep smaller (background element)
        float baseRadius = 0.44;
        float waterPulse = waterInfluence * 0.14;
        float circleRadius = baseRadius + waterPulse;

        float distFromCenter = length(screenP);
        float inCircle = smoothstep(circleRadius + 0.12, circleRadius - 0.12, distFromCenter);

        vec3 col = u_background;
        float alpha = 1.0;

        if (inCircle > 0.0) {
          // Internal scale: smaller pattern = smaller perceived blob
          vec2 p = screenP * 0.82;

          // Click ripple ring
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

          // Swirl rotation
          float angle = length(p) * 4.0;
          mat2 R = mat2(cos(angle), -sin(angle), sin(angle), cos(angle));
          p *= R;

          float l = length(p) - 0.7 + totalWater * 0.55;
          float t = u_time * u_speed + totalWater * 2.0;
          float enhancedY = p.y + totalWater * 0.32;

          float pattern1 = 0.5 + 0.5 * tanh(0.1 / max(l / 0.1, -l) - sin(l + enhancedY * max(1.0, -l / 0.1) + t));
          float pattern2 = 0.5 + 0.5 * tanh(0.1 / max(l / 0.1, -l) - sin(l + enhancedY * max(1.0, -l / 0.1) + t + 1.0));
          float pattern3 = 0.5 + 0.5 * tanh(0.1 / max(l / 0.1, -l) - sin(l + enhancedY * max(1.0, -l / 0.1) + t + 2.0));

          float intensity = 1.0 + totalWater * 0.55;

          // Mix your warm gradient palette
          vec3 blob;
          blob.r = pattern1 * u_color1.r * intensity;
          blob.g = pattern2 * u_color2.g * intensity;
          blob.b = pattern3 * u_color3.b * intensity;

          // IMPORTANT: soften so it’s not distracting
          float blobAlpha = inCircle * 0.50;   // overall visibility of blob
          col = mix(u_background, blob, blobAlpha);

          // Keep alpha fully opaque because we already mix into background color.
          alpha = 1.0;
        }

        gl_FragColor = vec4(col, alpha);
      }
    `;

    return { vertexShader, fragmentShader };
  }, []);

  // -----------------------------
  // 3) THREE.JS BACKGROUND
  // -----------------------------

  useEffect(() => {
    const mount = bgMountRef.current;
    if (!mount) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    // Adaptive sim resolution: keeps it smooth & battery-friendly
    const simResolution = (() => {
      const w = window.innerWidth;
      if (w < 520) return 128;
      if (w < 1100) return 192;
      return 256;
    })();

    // You can tune these later (they control ripple feel)
    const waterSettings = {
      resolution: simResolution,
      damping: 0.913,
      tension: 0.02,
      rippleRadius: 8,
      mouseIntensity: 1.0,
      clickIntensity: 2.5,
      impactForce: 50000,
      rippleSize: 0.10,
      spiralIntensity: 0.20,
      swirlingMotion: 0.18,
      motionDecay: 0.08,
      rippleDecay: 1.0,
      waveHeight: 0.010
    };

    // --- Three scene
    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
    camera.position.z = 1;

    // alpha:true so it can sit on white seamlessly
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(dpr);
    renderer.setSize(window.innerWidth, window.innerHeight);

    // Make sure gl_FragCoord calculations match drawing buffer size on retina
    const syncResolutionUniform = () => {
      const v = new THREE.Vector2();
      renderer.getDrawingBufferSize(v);
      material.uniforms.u_resolution.value.copy(v);
    };

    // Mount safety for hot reload
    mount.innerHTML = "";
    mount.appendChild(renderer.domElement);

    // --- Water buffers
    const resolution = waterSettings.resolution;
    let waterBuffers = {
      current: new Float32Array(resolution * resolution),
      previous: new Float32Array(resolution * resolution),
      velocity: new Float32Array(resolution * resolution * 2),
      vorticity: new Float32Array(resolution * resolution)
    };

    for (let i = 0; i < resolution * resolution; i++) {
      waterBuffers.current[i] = 0.0;
      waterBuffers.previous[i] = 0.0;
      waterBuffers.velocity[i * 2] = 0.0;
      waterBuffers.velocity[i * 2 + 1] = 0.0;
      waterBuffers.vorticity[i] = 0.0;
    }

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

    // --- Shader material colors (match your gradient theme)
    const material = new THREE.ShaderMaterial({
      vertexShader: shaders.vertexShader,
      fragmentShader: shaders.fragmentShader,
      uniforms: {
        u_time: { value: 0.0 },
        u_resolution: { value: new THREE.Vector2(1, 1) },
        u_speed: { value: 1.05 },

        u_color1: { value: new THREE.Vector3(0.10, 0.60, 1.00) },  // #1A99FF-ish
        u_color2: { value: new THREE.Vector3(0.00, 0.92, 0.85) },  // #00EBD9-ish
        u_color3: { value: new THREE.Vector3(0.55, 0.70, 1.00) },  // #8CB3FF-ish
        u_background:{ value: new THREE.Vector3(0.02, 0.03, 0.06) }, // deeper navy-black
        u_waterTexture: { value: waterTexture },
        u_waterStrength: { value: 0.42 },
        u_ripple_time: { value: -10.0 },
        u_ripple_position: { value: new THREE.Vector2(0.5, 0.5) },
        u_ripple_strength: { value: 0.55 }
      },
      transparent: true
    });

    const geometry = new THREE.PlaneGeometry(2, 2);
    const mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);

    syncResolutionUniform();

    // --- Water simulation step
    const updateWaterSimulation = () => {
      const { current, previous, velocity, vorticity } = waterBuffers;
      const damping = waterSettings.damping;
      const safeTension = Math.min(waterSettings.tension, 0.05);
      const velocityDissipation = waterSettings.motionDecay;
      const densityDissipation = waterSettings.rippleDecay;
      const vorticityInfluence = Math.min(Math.max(waterSettings.swirlingMotion, 0.0), 0.5);

      // Dissipate velocity
      for (let i = 0; i < resolution * resolution * 2; i++) {
        velocity[i] *= 1.0 - velocityDissipation;
      }

      // Compute vorticity
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

      // Apply vorticity forces
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

      // Wave propagation (no wrapping)
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
            velocity[velIndex] * velocity[velIndex] +
              velocity[velIndex + 1] * velocity[velIndex + 1]
          );

          const safeVelInfluence = Math.min(velMagnitude * waterSettings.waveHeight, 0.1);
          current[index] += safeVelInfluence;

          current[index] *= 1.0 - densityDissipation * 0.01;
          current[index] = Math.max(-2.0, Math.min(2.0, current[index]));
        }
      }

      // Zero boundaries (prevents edge wrapping artifacts)
      for (let i = 0; i < resolution; i++) {
        current[i] = 0;
        current[(resolution - 1) * resolution + i] = 0;
        current[i * resolution] = 0;
        current[i * resolution + (resolution - 1)] = 0;
      }

      // Swap current/previous
      const tmp = waterBuffers.current;
      waterBuffers.current = waterBuffers.previous;
      waterBuffers.previous = tmp;

      waterTexture.image.data = waterBuffers.current;
      waterTexture.needsUpdate = true;
    };

    // Add ripple impulse at position
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

              const rippleValue =
                Math.cos((distance / radius) * Math.PI * 0.5) * rippleStrength * falloff;

              waterBuffers.previous[index] += rippleValue;

              const angle = Math.atan2(j, i);
              const velStrength = rippleValue * waterSettings.spiralIntensity;

              waterBuffers.velocity[velIndex] += Math.cos(angle) * velStrength;
              waterBuffers.velocity[velIndex + 1] += Math.sin(angle) * velStrength;

              // Small swirl
              const swirlAngle = angle + Math.PI * 0.5;
              const swirlStrength = Math.min(velStrength * 0.3, 0.1);
              waterBuffers.velocity[velIndex] += Math.cos(swirlAngle) * swirlStrength;
              waterBuffers.velocity[velIndex + 1] += Math.sin(swirlAngle) * swirlStrength;
            }
          }
        }
      }
    };

    // Interaction (mousemove + click + touch)
    let lastMouse = { x: 0, y: 0 };
    let mouseThrottle = 0;

    const onMouseMove = (event: MouseEvent) => {
      const now = performance.now();
      if (now - mouseThrottle < 10) return; // a touch slower = less distracting
      mouseThrottle = now;

      const x = event.clientX;
      const y = event.clientY;

      const dx = x - lastMouse.x;
      const dy = y - lastMouse.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist > 2) {
        const velocity = dist / 10;
        const velocityInfluence = Math.min(velocity / 10, 2.0);
        const baseIntensity = Math.min(dist / 28, 1.0);

        // Lower intensity on white background
        const finalIntensity =
          baseIntensity * velocityInfluence * waterSettings.mouseIntensity * (Math.random() * 0.25 + 0.75);

        addRipple(
          x + (Math.random() - 0.5) * 2,
          y + (Math.random() - 0.5) * 2,
          finalIntensity
        );

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
      if (now - mouseThrottle < 10) return;
      mouseThrottle = now;

      const x = event.touches[0].clientX;
      const y = event.touches[0].clientY;

      const dx = x - lastMouse.x;
      const dy = y - lastMouse.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist > 2) {
        const velocity = dist / 10;
        const velocityInfluence = Math.min(velocity / 10, 2.0);
        const baseIntensity = Math.min(dist / 28, 1.0);

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

    // Resize
    const onResize = () => {
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setSize(window.innerWidth, window.innerHeight);
      syncResolutionUniform();
    };
    window.addEventListener("resize", onResize);

    // Animation loop
    let rafId = 0;

    // Subtle initial ripple
    setTimeout(() => addRipple(window.innerWidth / 2, window.innerHeight / 2, 1.1), 250);

    const animate = () => {
      rafId = window.requestAnimationFrame(animate);
      const elapsed = clock.getElapsedTime();
      material.uniforms.u_time.value = elapsed;

      updateWaterSimulation();
      renderer.render(scene, camera);
    };

    animate();

    // Pause when hidden (battery)
    const onVis = () => {
      if (document.hidden) cancelAnimationFrame(rafId);
      else animate();
    };
    document.addEventListener("visibilitychange", onVis);

    // Cleanup
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

      if (renderer.domElement?.parentNode) {
        renderer.domElement.parentNode.removeChild(renderer.domElement);
      }
    };
  }, [shaders]);

  // -----------------------------
  // 4) UI
  // -----------------------------

  return (
    <div className="pu-root">
      {/*
        Global styles are scoped to this page via styled-jsx, but html/body rules are global.
        This is intentional to guarantee “no whole page scroll”.
      */}
      <style jsx global>{`
        :root {
          /* Black base + warm accent gradient */
          --pu-bg: #07070b;
          --pu-text: rgba(255, 255, 255, 0.92);
          --pu-muted: rgba(255, 255, 255, 0.62);

          --pu-accent-1: #ee0979;
          --pu-accent-2: #ff6a00;

          /* Glass on black (stronger, more premium) */
          --pu-glass: rgba(255, 255, 255, 0.05);
          --pu-glass-strong: rgba(255, 255, 255, 0.10);
          --pu-border: rgba(255, 255, 255, 0.14);
          --pu-border-soft: rgba(255, 255, 255, 0.10);
          --pu-shadow: rgba(0, 0, 0, 0.55);
        }

        html,
        body {
          height: 100%;
          background: var(--pu-bg);
          overflow: hidden; /* stop whole page scroll */
          color: var(--pu-text);
          font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial,
            "Apple Color Emoji", "Segoe UI Emoji";
          -webkit-font-smoothing: antialiased;
          -moz-osx-font-smoothing: grayscale;
        }

        * {
          box-sizing: border-box;
        }

        /* Background canvas mount */
        .pu-bg-canvas {
          position: fixed;
          inset: 0;
          z-index: 0;
          background: radial-gradient(1200px 800px at 20% 15%, rgba(238, 9, 121, 0.10), transparent 55%),
            radial-gradient(900px 700px at 85% 80%, rgba(255, 106, 0, 0.10), transparent 60%),
            var(--pu-bg);
        }

        /* Vignette for depth */
        .pu-vignette {
          position: fixed;
          inset: 0;
          z-index: 1;
          pointer-events: none;
          background: radial-gradient(
            80% 70% at 50% 35%,
            rgba(255, 255, 255, 0.00),
            rgba(0, 0, 0, 0.55)
          );
        }

        /* Root viewport (fixed) */
        .pu-root {
          position: relative;
          height: 100vh;
          padding: 18px;
          overflow: hidden;
        }

        /* Layout: sidebar + main */
        .pu-shell {
          position: relative;
          z-index: 2;
          height: 100%;
          display: grid;
          grid-template-columns: 320px 1fr;
          gap: 14px;
        }

        /* Glass panel base */
        .pu-glass {
          background: var(--pu-glass);
          backdrop-filter: blur(20px) saturate(150%);
          -webkit-backdrop-filter: blur(22px) saturate(150%);
          border: 1px solid var(--pu-border-soft);
          outline: 1px solid rgba(255, 255, 255, 0.06);
          outline-offset: -1px;
          box-shadow: 0 24px 70px var(--pu-shadow), inset 0 1px 0 rgba(255, 255, 255, 0.08);
          border-radius: 18px;
        }

        .pu-glass-strong {
          background: var(--pu-glass-strong);
        }

        /* Sidebar */
        .pu-sidebar {
          padding: 14px;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }

        .pu-brand {
          font-weight: 950;
          letter-spacing: -0.02em;
          background: linear-gradient(90deg, var(--pu-accent-1), var(--pu-accent-2));
          -webkit-background-clip: text;
          background-clip: text;
          color: transparent;
          font-size: 18px;
        }

        .pu-subtitle {
          margin-top: 6px;
          font-size: 12px;
          color: var(--pu-muted);
        }

        .pu-search {
          margin-top: 12px;
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 10px 12px;
          border-radius: 14px;
          border: 1px solid var(--pu-border);
          background: rgba(255, 255, 255, 0.06);
        }

        .pu-search input {
          border: none;
          outline: none;
          background: transparent;
          width: 100%;
          color: var(--pu-text);
          font-size: 13px;
        }

        .pu-list {
          margin-top: 14px;
          display: flex;
          flex-direction: column;
          gap: 10px;
          overflow-y: auto;
          overflow-x: hidden;
          padding-right: 6px;
        }

        .pu-item {
          padding: 12px;
          border-radius: 14px;
          border: 1px solid rgba(255, 255, 255, 0.10);
          background: rgba(255, 255, 255, 0.055);
          cursor: pointer;
          transition: transform 120ms ease, background 120ms ease, border-color 120ms ease;
        }

        .pu-item:hover {
          background: rgba(255, 255, 255, 0.075);
          border-color: rgba(255, 255, 255, 0.16);
          transform: translateY(-1px);
        }

        .pu-itemTitle {
          font-size: 13px;
          font-weight: 850;
          color: var(--pu-text);
        }

        .pu-itemSub {
          margin-top: 4px;
          font-size: 12px;
          color: var(--pu-muted);
        }

        /* Main */
        .pu-main {
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }

        /* Top bar (RIGHT aligned chip + hamburger) */
        .pu-topbar {
          padding: 12px 14px 10px 14px;
          display: flex;
          align-items: center;
          justify-content: flex-end;
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
          background: rgba(255, 255, 255, 0.06);
        }

        .pu-avatar {
          width: 32px;
          height: 32px;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.14);
          background: linear-gradient(
            135deg,
            rgba(238, 9, 121, 0.30),
            rgba(255, 106, 0, 0.25)
          );
          display: grid;
          place-items: center;
          color: rgba(255, 255, 255, 0.92);
          font-weight: 950;
          font-size: 12px;
        }

        .pu-userHint {
          font-size: 10px;
          font-weight: 900;
          color: rgba(255, 255, 255, 0.70);
          text-transform: uppercase;
          line-height: 1.1;
        }

        .pu-userName {
          font-size: 12px;
          font-weight: 900;
          color: var(--pu-text);
          line-height: 1.1;
        }

        .pu-hamburger {
          width: 40px;
          height: 40px;
          border-radius: 14px;
          border: 1px solid rgba(255, 255, 255, 0.12);
          background: rgba(255, 255, 255, 0.06);
          cursor: pointer;
          display: grid;
          place-items: center;
          transition: transform 120ms ease, background 120ms ease, border-color 120ms ease;
        }

        .pu-hamburger:hover {
          background: rgba(255, 255, 255, 0.08);
          border-color: rgba(255, 255, 255, 0.18);
          transform: translateY(-1px);
        }

        /* Internal scroll: chat area only */
        .pu-content {
          flex: 1;
          overflow-y: auto;
          overflow-x: hidden;
          padding: 18px;
          display: flex;
          flex-direction: column;
          gap: 14px;
        }

        /* Chat bubbles */
        .pu-bubble {
          max-width: 560px;
          padding: 14px;
          border-radius: 16px;
          border: 1px solid rgba(255, 255, 255, 0.12);
          background: rgba(255, 255, 255, 0.06);
        }

        .pu-bubble.user {
          margin-right: auto;
        }

        .pu-bubble.ai {
          margin-left: auto;
          background: 
            rgba(255, 255, 255, 0.05);
          border-color: rgba(255, 255, 255, 0.14);
        }

        .pu-bTitle {
          font-size: 13px;
          font-weight: 900;
          letter-spacing: -0.01em;
          color: var(--pu-text);
        }

        .pu-bSub {
          margin-top: 6px;
          font-size: 13px;
          line-height: 1.45;
          color: rgba(255, 255, 255, 0.72);
        }

        .pu-chips {
          display: flex;
          gap: 10px;
          justify-content: flex-end;
          flex-wrap: wrap;
          margin-top: 2px;
        }

        .pu-chip {
          padding: 9px 12px;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.14);
          background: rgba(255, 255, 255, 0.06);
          cursor: pointer;
          font-size: 12px;
          font-weight: 900;
          color: rgba(255, 255, 255, 0.90);
          transition: transform 120ms ease, background 120ms ease, border-color 120ms ease;
        }

        .pu-chip:hover {
          background: linear-gradient(
            90deg,
            rgba(238, 9, 121, 0.16),
            rgba(255, 106, 0, 0.16)
          );
          border-color: rgba(255, 255, 255, 0.18);
          transform: translateY(-1px);
        }

        .pu-inputRow {
          padding: 14px 18px;
          border-top: 1px solid rgba(255, 255, 255, 0.06);
          display: flex;
          gap: 10px;
          align-items: center;
        }

        .pu-input {
          flex: 1;
          padding: 12px 14px;
          border-radius: 16px;
          border: 1px solid rgba(255, 255, 255, 0.12);
          background: rgba(255, 255, 255, 0.06);
          outline: none;
          color: var(--pu-text);
          font-size: 14px;
        }

        .pu-input::placeholder {
          color: rgba(255, 255, 255, 0.45);
        }

        .pu-send {
          width: 46px;
          height: 46px;
          border-radius: 16px;
          border: 1px solid rgba(255, 255, 255, 0.14);
          background: linear-gradient(
            90deg,
            rgba(238, 9, 121, 0.22),
            rgba(255, 106, 0, 0.22)
          );
          cursor: pointer;
          display: grid;
          place-items: center;
          color: rgba(255, 255, 255, 0.94);
          font-weight: 900;
          font-size: 18px;
          transition: transform 120ms ease, filter 120ms ease;
        }

        .pu-send:hover {
          transform: translateY(-1px);
          filter: brightness(1.10);
        }

        .pu-overlay {
          position: fixed;
          inset: 0;
          z-index: 50;
          background: rgba(0, 0, 0, 0.55);
          backdrop-filter: blur(2px);
          -webkit-backdrop-filter: blur(2px);
        }

        .pu-drawer {
          position: fixed;
          top: 0;
          right: 0;
          height: 100vh;
          width: 380px;
          max-width: 92vw;
          z-index: 60;
          transform: translateX(100%);
          transition: transform 220ms ease;
          padding: 16px;
        }

        .pu-drawer.open {
          transform: translateX(0);
        }

        .pu-drawerPanel {
          height: 100%;
          padding: 14px;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .pu-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 10px;
        }

        .pu-h2 {
          font-size: 14px;
          font-weight: 950;
          color: var(--pu-text);
        }

        .pu-btn {
          padding: 9px 12px;
          border-radius: 12px;
          border: 1px solid rgba(255, 255, 255, 0.12);
          background: rgba(255, 255, 255, 0.06);
          cursor: pointer;
          font-size: 12px;
          font-weight: 900;
          color: var(--pu-text);
        }

        .pu-btn:hover {
          background: rgba(255, 255, 255, 0.08);
        }

        .pu-card {
          padding: 12px;
          border-radius: 14px;
          border: 1px solid rgba(255, 255, 255, 0.12);
          background: rgba(255, 255, 255, 0.06);
        }

        .pu-cardTitle {
          font-size: 13px;
          font-weight: 900;
          color: var(--pu-text);
        }

        .pu-cardSub {
          margin-top: 6px;
          font-size: 12px;
          color: rgba(255, 255, 255, 0.70);
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

      {/* Background animation layers */}
      <div ref={bgMountRef} className="pu-bg-canvas" aria-hidden="true" />
      <div className="pu-vignette" aria-hidden="true" />

      {/* App shell */}
      <div className="pu-shell">
        {/* Left sidebar: recent projects */}
        <aside className="pu-glass pu-sidebar" aria-label="Recent projects">
          <div className="pu-brand">Prepare‑Up</div>
          <div className="pu-subtitle">Recent projects</div>

          <div className="pu-search">
            <SearchIcon />
            <input placeholder="Search projects…" />
          </div>

          <div className="pu-list">
            <SidebarItem title="Software Development StudyGuide" sub="Last opened • Today" />
            <SidebarItem title="Compiler Designing" sub="Last opened • Yesterday" />
            <SidebarItem title="AI Study Guide Midterm" sub="Last opened • 2 days ago" />
            <SidebarItem title="Automated Theory Finals" sub="Last opened • 4 days ago" />
            <SidebarItem title="Mobile Computing Design" sub="Last opened • 1 week ago" />
            <SidebarItem title="Wireless Network Study Guide" sub="Last opened • 2 weeks ago" />
          </div>
        </aside>

        {/* Main workspace */}
        <main className="pu-glass pu-main" aria-label="Chat workspace">
          {/* Top bar (right aligned) */}
          <div className="pu-topbar">
            <div className="pu-userChip">
              <div className="pu-avatar" aria-hidden="true">
                N
              </div>
              <div>
                <div className="pu-userHint">Good morning</div>
                <div className="pu-userName">Nil Vaghela</div>
              </div>
            </div>

            <button
              className="pu-hamburger"
              aria-label="Open right sidebar"
              onClick={() => setDrawerOpen(true)}
              type="button"
            >
              <HamburgerIcon />
            </button>
          </div>

          {/* Chat scroll area */}
          <div className="pu-content">
            {messages.map((m) => (
              <div key={m.id} className={`pu-bubble ${m.role}`}
                role="article"
                aria-label={m.role === "ai" ? "Assistant message" : "User message"}
              >
                <div className="pu-bTitle">{m.title}</div>
                {m.subtitle ? <div className="pu-bSub">{m.subtitle}</div> : null}
              </div>
            ))}

            {/* Output chips: right aligned */}
            <div className="pu-chips" aria-label="Output options">
              <button className="pu-chip" type="button">Podcast</button>
              <button className="pu-chip" type="button">Study Guide</button>
              <button className="pu-chip" type="button">Narrative</button>
              <button className="pu-chip" type="button">Flash Card</button>
            </div>

            {/* Spacer so input doesn’t stick to last bubble */}
            <div style={{ height: 12 }} />
          </div>

          {/* Input row */}
          <div className="pu-inputRow">
            <input className="pu-input" placeholder="Ask me anything about your projects" />
            <button className="pu-send" aria-label="Send" type="button">
              ➤
            </button>
          </div>
        </main>
      </div>

      {/* Drawer overlay */}
      {drawerOpen ? (
        <div className="pu-overlay" aria-hidden="true" onClick={() => setDrawerOpen(false)} />
      ) : null}

      {/* Right drawer */}
      <aside className={`pu-drawer ${drawerOpen ? "open" : ""}`} aria-hidden={!drawerOpen}>
        <div ref={drawerRef} className="pu-glass pu-drawerPanel">
          <div className="pu-row">
            <div className="pu-h2">Project actions</div>
            <button className="pu-btn" onClick={() => setDrawerOpen(false)} type="button">
              Close
            </button>
          </div>

          <div className="pu-card">
            <div className="pu-cardTitle">Upload</div>
            <div className="pu-cardSub">Add PDFs, docs, or Discord exports.</div>
          </div>

          <div className="pu-card">
            <div className="pu-cardTitle">Generate</div>
            <div className="pu-cardSub">Podcast, study guide, narrative, flashcards, quizzes.</div>
          </div>

          <div className="pu-card">
            <div className="pu-cardTitle">Preferences</div>
            <div className="pu-cardSub">Voice, tone, difficulty, time budget.</div>
          </div>

          <div style={{ flex: 1 }} />

          <div className="pu-card">
            <div className="pu-cardTitle">Account</div>
            <div className="pu-cardSub">Profile, billing, workspace settings.</div>
          </div>
        </div>
      </aside>
    </div>
  );
}

/* ------------------------------
 * Sidebar item component
 * ------------------------------ */
function SidebarItem({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="pu-item" role="button" tabIndex={0}>
      <div className="pu-itemTitle">{title}</div>
      <div className="pu-itemSub">{sub}</div>
    </div>
  );
}

/* ------------------------------
 * Minimal inline icons
 * (kept inline so this file is self-contained)
 * ------------------------------ */
function SearchIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M10.5 18.5a8 8 0 1 1 0-16 8 8 0 0 1 0 16Z"
        stroke="rgba(255,255,255,0.55)"
        strokeWidth="2"
      />
      <path
        d="M16.5 16.5 21 21"
        stroke="rgba(255,255,255,0.55)"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
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
