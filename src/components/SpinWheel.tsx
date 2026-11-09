"use client";

import { useEffect, useMemo, useRef } from "react";

const COLORS = [
  { fill: "#e3262b", text: "#ffffff" },
  { fill: "#0d9aa5", text: "#ffffff" },
  { fill: "#f5b82e", text: "#3a1d12" },
  { fill: "#fff4dc", text: "#3a1d12" },
];

const SPIN_MS = 7000;

function shortName(n: string) {
  const parts = n.trim().split(/\s+/);
  const s = parts.length > 2 ? `${parts[0]} ${parts[parts.length - 1]}` : n;
  return s.length > 20 ? s.slice(0, 19) + "…" : s;
}

/**
 * A prize wheel. The winner is decided elsewhere (in the database); when `targetIndex`
 * is set the wheel spins several turns and lands that segment under the pointer.
 */
export default function SpinWheel({
  names,
  targetIndex,
  onSettled,
}: {
  names: string[];
  targetIndex: number | null;
  onSettled?: () => void;
}) {
  const settledFor = useRef<number | null>(null);
  const n = Math.max(names.length, 1);
  const seg = 360 / n;
  const size = 520;
  const r = size / 2 - 8;
  const c = size / 2;
  const fontSize = Math.max(7, Math.min(16, 520 / n));

  // Each draw mounts a fresh wheel, so the spin always starts from 0°.
  const rotation = useMemo(() => {
    if (targetIndex === null) return 0;
    const centre = (targetIndex + 0.5) * seg;
    // deterministic offset inside the segment so it doesn't always stop dead-centre
    const jitter = (((targetIndex * 7919) % 100) / 100 - 0.5) * seg * 0.6;
    return 360 * 8 + (360 - centre) + jitter;
  }, [targetIndex, seg]);

  useEffect(() => {
    if (targetIndex === null) return;
    settledFor.current = null;
    const t = setTimeout(() => {
      if (settledFor.current !== targetIndex) {
        settledFor.current = targetIndex;
        onSettled?.();
      }
    }, SPIN_MS + 150);
    return () => clearTimeout(t);
  }, [targetIndex, onSettled]);

  const arc = (i: number) => {
    const a0 = ((i * seg - 90) * Math.PI) / 180;
    const a1 = (((i + 1) * seg - 90) * Math.PI) / 180;
    const large = seg > 180 ? 1 : 0;
    if (n === 1) return `M ${c} ${c - r} A ${r} ${r} 0 1 1 ${c - 0.01} ${c - r} Z`;
    return `M ${c} ${c} L ${c + r * Math.cos(a0)} ${c + r * Math.sin(a0)} A ${r} ${r} 0 ${large} 1 ${c + r * Math.cos(a1)} ${c + r * Math.sin(a1)} Z`;
  };

  return (
    <div className="relative mx-auto aspect-square w-full max-w-[min(80vh,520px)]">
      {/* pointer */}
      <div className="absolute left-1/2 top-0 z-10 -translate-x-1/2 -translate-y-1" aria-hidden>
        <svg width="36" height="44" viewBox="0 0 36 44">
          <path d="M18 44 L2 8 A16 16 0 0 1 34 8 Z" fill="#3a1d12" />
          <circle cx="18" cy="14" r="6" fill="#f5b82e" />
        </svg>
      </div>
      <svg viewBox={`0 0 ${size} ${size}`} className="h-full w-full drop-shadow-xl" role="img" aria-label={`Prize wheel with ${names.length} names`}>
        <circle cx={c} cy={c} r={r + 6} fill="#e3262b" />
        <circle cx={c} cy={c} r={r + 6} fill="none" stroke="#f5b82e" strokeWidth="3" strokeDasharray="2 10" />
        <g
          style={{
            transform: `rotate(${rotation}deg)`,
            transformOrigin: "50% 50%",
            transition: targetIndex === null ? "none" : `transform ${SPIN_MS}ms cubic-bezier(0.12, 0.6, 0.08, 1)`,
          }}
        >
          {names.map((name, i) => {
            // avoid the last segment matching the first one it touches
            const col = COLORS[n > 1 && i === n - 1 && i % COLORS.length === 0 ? 1 : i % COLORS.length];
            const mid = i * seg + seg / 2;
            return (
              <g key={i}>
                <path d={arc(i)} fill={col.fill} stroke="#ffffff" strokeWidth={n > 60 ? 0.5 : 1.5} />
                <text
                  x={c + r - 14}
                  y={c}
                  transform={`rotate(${mid - 90} ${c} ${c})`}
                  textAnchor="end"
                  dominantBaseline="central"
                  fontSize={fontSize}
                  fontWeight={700}
                  fill={col.text}
                  fontFamily="var(--font-body), sans-serif"
                >
                  {shortName(name)}
                </text>
              </g>
            );
          })}
        </g>
        <circle cx={c} cy={c} r={34} fill="#fff4dc" stroke="#e3262b" strokeWidth="5" />
        <text x={c} y={c} textAnchor="middle" dominantBaseline="central" fontSize="22" fill="#e3262b" fontFamily="var(--font-display), serif">
          44
        </text>
      </svg>
    </div>
  );
}
