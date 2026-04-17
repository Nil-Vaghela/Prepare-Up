"use client";

import { useEffect, useRef } from "react";

/** Full-panel animated star field rendered on a transparent canvas. */
export default function StarField() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // ── Resize ───────────────────────────────────────────────────────────────
    function resize() {
      if (!canvas) return;
      canvas.width  = canvas.offsetWidth  * window.devicePixelRatio;
      canvas.height = canvas.offsetHeight * window.devicePixelRatio;
    }
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    // ── Stars ────────────────────────────────────────────────────────────────
    type Star = { x: number; y: number; r: number; a: number; speed: number };
    const COUNT = 420;
    let stars: Star[] = [];

    function scatter() {
      if (!canvas) return;
      const W = canvas.width;
      const H = canvas.height;
      stars = Array.from({ length: COUNT }, () => ({
        x:     Math.random() * W,
        y:     Math.random() * H,
        r:     0.4 + Math.random() * 1.2,
        a:     0.25 + Math.random() * 0.7,
        speed: 0.0003 + Math.random() * 0.0006,
      }));
    }
    scatter();

    // Re-scatter when canvas resizes so stars always fill the panel
    const roScatter = new ResizeObserver(() => { resize(); scatter(); });
    roScatter.observe(canvas);

    // ── Animate ───────────────────────────────────────────────────────────────
    let raf = 0;
    let t   = 0;

    function draw() {
      raf = requestAnimationFrame(draw);
      if (!canvas || !ctx) return;
      t += 1;
      const W = canvas.width;
      const H = canvas.height;

      ctx.clearRect(0, 0, W, H);

      for (const s of stars) {
        // Gentle twinkle
        const alpha = s.a * (0.7 + 0.3 * Math.sin(t * s.speed * 300 + s.x));
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r * window.devicePixelRatio, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(200,245,255,${alpha.toFixed(3)})`;
        ctx.fill();
      }
    }
    draw();

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      roScatter.disconnect();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position:     "absolute",
        inset:        "0",
        width:        "100%",
        height:       "100%",
        pointerEvents: "none",
        zIndex:       0,
      }}
    />
  );
}
