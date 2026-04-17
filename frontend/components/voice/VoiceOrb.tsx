"use client";

import { useEffect, useRef } from "react";
import type { VoiceState } from "../../lib/hooks/useVoiceSession";

interface VoiceOrbProps {
  state: VoiceState;
  audioLevel: number;   // 0–1 mic amplitude
  aiAudioLevel: number; // 0–1 AI output amplitude
  onClick?: () => void;
}

// State → visual config
const STATE_CONFIG: Record<
  VoiceState,
  { label: string; color: string; glowColor: string; ring: boolean }
> = {
  idle: {
    label: "Tap to start",
    color: "rgba(255,255,255,0.06)",
    glowColor: "rgba(90,168,255,0.15)",
    ring: false,
  },
  connecting: {
    label: "Connecting…",
    color: "rgba(90,168,255,0.12)",
    glowColor: "rgba(90,168,255,0.3)",
    ring: true,
  },
  listening: {
    label: "Listening",
    color: "rgba(95,227,255,0.12)",
    glowColor: "rgba(95,227,255,0.3)",
    ring: false,
  },
  thinking: {
    label: "Thinking…",
    color: "rgba(168,130,255,0.12)",
    glowColor: "rgba(168,130,255,0.3)",
    ring: true,
  },
  speaking: {
    label: "Speaking",
    color: "rgba(100,220,180,0.12)",
    glowColor: "rgba(100,220,180,0.35)",
    ring: false,
  },
  error: {
    label: "Error — tap to retry",
    color: "rgba(255,90,90,0.12)",
    glowColor: "rgba(255,90,90,0.3)",
    ring: false,
  },
  ended: {
    label: "Session ended",
    color: "rgba(255,255,255,0.04)",
    glowColor: "rgba(255,255,255,0.06)",
    ring: false,
  },
};

export default function VoiceOrb({ state, audioLevel, aiAudioLevel, onClick }: VoiceOrbProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number | null>(null);
  const phaseRef = useRef(0);

  const cfg = STATE_CONFIG[state];

  // Dynamic scale based on audio amplitude
  const activeLevel =
    state === "speaking" ? aiAudioLevel :
    state === "listening" ? audioLevel : 0;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const SIZE = 200;
    canvas.width = SIZE;
    canvas.height = SIZE;
    const cx = SIZE / 2;
    const cy = SIZE / 2;

    const draw = () => {
      phaseRef.current += 0.025;
      const phase = phaseRef.current;
      ctx.clearRect(0, 0, SIZE, SIZE);

      // Current live amplitude (0–1)
      const amp = state === "speaking" ? aiAudioLevel : state === "listening" ? audioLevel : 0;
      const pulse = state === "connecting" || state === "thinking"
        ? 0.5 + 0.5 * Math.sin(phase * 2)
        : 0;

      const baseR = 68;
      const waveAmp = 8 + amp * 22 + pulse * 6;

      // ── Glow rings ─────────────────────────────────────────────────────
      if (state !== "idle" && state !== "ended") {
        const numRings = state === "speaking" ? 3 : 2;
        for (let r = 0; r < numRings; r++) {
          const ringScale = 1 + (r + 1) * 0.18 + amp * 0.12 + pulse * 0.08;
          const ringOpacity = (0.18 - r * 0.05) * (0.6 + amp * 0.4);
          const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, baseR * ringScale);
          gradient.addColorStop(0, cfg.glowColor.replace(")", `, ${ringOpacity})`).replace("rgba(", "rgba("));
          gradient.addColorStop(1, "transparent");
          ctx.beginPath();
          ctx.arc(cx, cy, baseR * ringScale, 0, Math.PI * 2);
          ctx.fillStyle = gradient;
          ctx.fill();
        }
      }

      // ── Blob shape ──────────────────────────────────────────────────────
      ctx.beginPath();
      const steps = 120;
      for (let i = 0; i <= steps; i++) {
        const angle = (i / steps) * Math.PI * 2;
        // Multi-frequency distortion for organic shape
        const distortion =
          Math.sin(angle * 3 + phase * 1.2) * waveAmp * 0.35 +
          Math.sin(angle * 5 - phase * 0.8) * waveAmp * 0.2 +
          Math.sin(angle * 2 + phase * 0.5) * waveAmp * 0.15 +
          Math.cos(angle * 4 + phase * 1.5) * waveAmp * 0.1;
        const r = baseR + distortion;
        const x = cx + r * Math.cos(angle);
        const y = cy + r * Math.sin(angle);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();

      // Fill with radial gradient
      const fillGrad = ctx.createRadialGradient(cx - 12, cy - 12, 0, cx, cy, baseR + waveAmp);
      const baseColor = cfg.color;
      // Parse the rgba string to apply dynamic opacity
      const brightFactor = 0.7 + amp * 0.3 + pulse * 0.15;
      fillGrad.addColorStop(0, baseColor.replace(/[\d.]+\)$/, `${Math.min(1, brightFactor * 0.9)})`));
      fillGrad.addColorStop(1, baseColor.replace(/[\d.]+\)$/, `${Math.min(1, brightFactor * 0.5)})`));
      ctx.fillStyle = fillGrad;
      ctx.fill();

      // Inner glow
      const innerGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, baseR * 0.7);
      innerGrad.addColorStop(0, cfg.glowColor.replace(/[\d.]+\)$/, `${0.25 + amp * 0.2})`));
      innerGrad.addColorStop(1, "transparent");
      ctx.fillStyle = innerGrad;
      ctx.fill();

      // ── Spinning ring (connecting / thinking) ──────────────────────────
      if (cfg.ring) {
        const ringR = baseR + waveAmp + 8;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(phase * 1.5);
        // Draw a fading arc that rotates to simulate a spinner
        ctx.beginPath();
        ctx.arc(0, 0, ringR, 0, Math.PI * 1.4);
        ctx.strokeStyle = cfg.glowColor;
        ctx.lineWidth = 2;
        ctx.lineCap = "round";
        ctx.globalAlpha = 0.7;
        ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.restore();
      }

      animRef.current = requestAnimationFrame(draw);
    };

    animRef.current = requestAnimationFrame(draw);
    return () => {
      if (animRef.current !== null) cancelAnimationFrame(animRef.current);
    };
  }, [state, audioLevel, aiAudioLevel, cfg]);

  return (
    <div className="vo-root" onClick={onClick} role="button" aria-label={cfg.label}>
      <canvas ref={canvasRef} className="vo-canvas" />
      <div className="vo-label">{cfg.label}</div>

      <style jsx>{`
        .vo-root {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 16px;
          cursor: ${state === "idle" || state === "error" || state === "ended" ? "pointer" : "default"};
          user-select: none;
          -webkit-tap-highlight-color: transparent;
        }
        .vo-canvas {
          width: 200px;
          height: 200px;
          border-radius: 50%;
          transition: filter 0.3s ease;
          filter: ${state !== "idle" && state !== "ended"
            ? `drop-shadow(0 0 24px ${cfg.glowColor})`
            : "none"};
        }
        .vo-label {
          font-size: 13px;
          font-weight: 800;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          color: rgba(255,255,255,0.55);
          transition: color 0.3s ease;
        }
      `}</style>
    </div>
  );
}
