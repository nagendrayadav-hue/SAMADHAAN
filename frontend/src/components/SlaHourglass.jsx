import React, { useEffect, useState } from "react";

/**
 * Live SLA Hourglass — 24-hour service level countdown.
 *
 * Bands (based on hours remaining until the 24h SLA is breached):
 *   > 12h remaining  →  green   · label "fast"     (mostly full)
 *   6h – 12h         →  amber   · label "faster"   (half-drained)
 *   < 6h remaining   →  red     · label "urgent"   (nearly empty)
 *
 * When ticket status is "Done" we short-circuit and show a settled green pill.
 * When "Escalated" we show a settled red pill.
 *
 * The SVG hourglass animates: top bulb sand shrinks, bottom bulb fills,
 * with a subtle falling-sand stream in the neck.
 */
export default function SlaHourglass({ createdAt, status, size = "md", showLabel = true }) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const settled = status === "Done" || status === "Escalated";
    if (settled) return;
    const id = setInterval(() => setNow(Date.now()), 30_000); // refresh every 30s
    return () => clearInterval(id);
  }, [status]);

  const created = createdAt ? new Date(createdAt).getTime() : now;
  const SLA_MS = 24 * 60 * 60 * 1000;
  const elapsed = Math.max(0, now - created);
  const remainingMs = Math.max(0, SLA_MS - elapsed);
  const remainingH = remainingMs / (60 * 60 * 1000);

  // fraction of sand still in the TOP bulb (drains from 1 → 0 across 24h)
  const topFraction = Math.max(0, Math.min(1, remainingMs / SLA_MS));

  let color, glow, label, breached = false;
  if (status === "Done") {
    color = "#10B981"; glow = "rgba(16,185,129,0.35)"; label = "on time";
  } else if (status === "Escalated" || remainingH <= 0) {
    color = "#F87171"; glow = "rgba(248,113,113,0.45)"; label = "breached";
    breached = true;
  } else if (remainingH > 12) {
    color = "#34D399"; glow = "rgba(52,211,153,0.35)"; label = "fast";
  } else if (remainingH >= 6) {
    color = "#FBBF24"; glow = "rgba(251,191,36,0.4)"; label = "faster";
  } else {
    color = "#F87171"; glow = "rgba(248,113,113,0.45)"; label = "urgent";
  }

  const dims = size === "lg" ? { w: 44, h: 60, font: 11 } : size === "sm" ? { w: 20, h: 28, font: 9 } : { w: 28, h: 38, font: 10 };
  const settled = status === "Done" || status === "Escalated";
  const remainingLabel = breached
    ? "0h"
    : remainingH >= 1
      ? `${Math.round(remainingH)}h`
      : `${Math.max(0, Math.round(remainingH * 60))}m`;

  return (
    <div
      className="inline-flex items-center gap-2 px-2.5 py-1 rounded-md"
      style={{
        background: "rgba(255,255,255,0.02)",
        border: `1px solid ${color}44`,
        boxShadow: `inset 0 0 0 1px ${color}22, 0 0 18px -8px ${glow}`,
      }}
      data-testid="sla-hourglass"
      title={settled ? `SLA · ${label}` : `SLA · ${remainingLabel} remaining · ${label}`}
    >
      <HourglassSvg width={dims.w} height={dims.h} color={color} topFraction={topFraction} animate={!settled && !breached} />
      {showLabel && (
        <div className="flex flex-col leading-tight">
          <span
            className="mono uppercase tracking-[0.24em] font-bold"
            style={{ color, fontSize: dims.font }}
          >
            {label}
          </span>
          {!settled && (
            <span className="mono tracking-widest" style={{ color: `${color}CC`, fontSize: dims.font - 1 }}>
              {remainingLabel} left
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function HourglassSvg({ width, height, color, topFraction, animate }) {
  // Geometry constants (viewBox 100 x 140)
  const VB_W = 100, VB_H = 140;

  // Top-bulb sand: an inverted-trapezoid whose top edge lowers as sand drains.
  // full-sand y_top = 22, empty y_top = 62 (neck)
  const topY = 22 + (1 - topFraction) * 40;
  // outer top bulb edges at y=22 span x 20→80; at y=62 span x 47→53 (neck)
  const topEdgeAtY = (y) => {
    const t = (y - 22) / (62 - 22);
    const half = (30 - 27 * t); // 30 → 3 half-width
    return [50 - half, 50 + half];
  };
  const [txL, txR] = topEdgeAtY(topY);
  const topSand = `M ${txL},${topY} L ${txR},${topY} L 53,62 L 47,62 Z`;

  // Bottom-bulb sand: a trapezoid whose top edge rises as sand accumulates.
  // full-sand y_top = 78 (just below neck), empty y_top = 118
  const bottomFraction = 1 - topFraction;
  const bottomY = 118 - bottomFraction * 40;
  const bottomEdgeAtY = (y) => {
    const t = (y - 78) / (118 - 78); // 0 near neck → 1 at base
    const half = 3 + 27 * t; // 3 → 30
    return [50 - half, 50 + half];
  };
  const [bxL, bxR] = bottomEdgeAtY(bottomY);
  const bottomSand = `M ${bxL},${bottomY} L ${bxR},${bottomY} L 80,118 L 20,118 Z`;

  return (
    <svg width={width} height={height} viewBox={`0 0 ${VB_W} ${VB_H}`} aria-hidden="true">
      <defs>
        <linearGradient id={`glass-${color}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.08" />
          <stop offset="100%" stopColor={color} stopOpacity="0.02" />
        </linearGradient>
      </defs>

      {/* Frame caps */}
      <rect x="14" y="10" width="72" height="6" rx="1.5" fill={color} opacity="0.85" />
      <rect x="14" y="124" width="72" height="6" rx="1.5" fill={color} opacity="0.85" />

      {/* Glass silhouette (top bulb) */}
      <path d="M 20,22 L 80,22 L 53,62 L 47,62 Z"
            fill={`url(#glass-${color})`} stroke={color} strokeOpacity="0.55" strokeWidth="1.4" />
      {/* Glass silhouette (bottom bulb) */}
      <path d="M 47,78 L 53,78 L 80,118 L 20,118 Z"
            fill={`url(#glass-${color})`} stroke={color} strokeOpacity="0.55" strokeWidth="1.4" />

      {/* Top sand */}
      {topFraction > 0.001 && (
        <path d={topSand} fill={color} opacity="0.92" />
      )}
      {/* Bottom sand */}
      {bottomFraction > 0.001 && (
        <path d={bottomSand} fill={color} opacity="0.92" />
      )}

      {/* Falling sand stream (only when actively draining) */}
      {animate && topFraction > 0.001 && topFraction < 1 && (
        <line x1="50" y1="62" x2="50" y2="78" stroke={color} strokeWidth="1.3" strokeLinecap="round">
          <animate attributeName="stroke-opacity" values="0.2;1;0.2" dur="0.9s" repeatCount="indefinite" />
        </line>
      )}
    </svg>
  );
}
