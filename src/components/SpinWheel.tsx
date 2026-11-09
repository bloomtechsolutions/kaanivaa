"use client";

import { useEffect, useMemo, useRef } from "react";

const COLORS = [
  { fill: "#e3262b", text: "#ffffff" },
  { fill: "#0d9aa5", text: "#ffffff" },
  { fill: "#f5b82e", text: "#3a1d12" },
  { fill: "#fff4dc", text: "#3a1d12" },
];

const SPIN_MS = 7000;

export interface WheelItem {
  name: string;
  /** Number of entries (completed duties). The slice size is proportional to it. */
  weight: number;
}

function shortName(n: string) {
  const parts = n.trim().split(/\s+/);
  const s = parts.length > 2 ? `${parts[0]} ${parts[parts.length - 1]}` : n;
  return s.length > 20 ? s.slice(0, 19) + "…" : s;
}

/**
 * A prize wheel with one slice per person, sized by their number of entries.
 * The winner is decided elsewhere (in the database); when `targetIndex` is set the
 * wheel spins several turns and lands inside that person's slice.
 */
export default function SpinWheel({
  items,
  targetIndex,
  onSettled,
}: {
  items: WheelItem[];
  targetIndex: number | null;
  onSettled?: () => void;
}) {
  const settledFor = useRef<number | null>(null);
  const size = 520;
  const r = size / 2 - 8;
  const c = size / 2;

  // start/end angle (degrees, clockwise from the pointer) of every slice
  const slices = useMemo(() => {
    const total = items.reduce((s, it) => s + Math.max(it.weight, 0), 0) || 1;
    const out: { start: number; end: number; span: number }[] = [];
    for (const it of items) {
      const start = out.length ? out[out.length - 1].end : 0;
      const span = (Math.max(it.weight, 0) / total) * 360;
      out.push({ start, end: start + span, span });
    }
    return out;
  }, [items]);

  // Each draw mounts a fresh wheel, so the spin always starts from 0°.
  const rotation = useMemo(() => {
    if (targetIndex === null || !slices[targetIndex]) return 0;
    const sl = slices[targetIndex];
    // land somewhere inside the slice (not always dead-centre), keeping clear of its edges
    const offset = (((targetIndex * 7919) % 100) / 100 - 0.5) * sl.span * 0.6;
    const centre = sl.start + sl.span / 2 + offset;
    return 360 * 8 + (360 - centre);
  }, [targetIndex, slices]);

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

  const arc = (start: number, end: number) => {
    if (end - start >= 359.999) return `M ${c} ${c - r} A ${r} ${r} 0 1 1 ${c - 0.01} ${c - r} Z`;
    const a0 = ((start - 90) * Math.PI) / 180;
    const a1 = ((end - 90) * Math.PI) / 180;
    const large = end - start > 180 ? 1 : 0;
    return `M ${c} ${c} L ${c + r * Math.cos(a0)} ${c + r * Math.sin(a0)} A ${r} ${r} 0 ${large} 1 ${c + r * Math.cos(a1)} ${c + r * Math.sin(a1)} Z`;
  };

  const n = items.length;
  const totalEntries = items.reduce((s, it) => s + it.weight, 0);

  return (
    <div className="relative mx-auto aspect-square w-full max-w-[min(80vh,520px)]">
      {/* pointer */}
      <div className="absolute left-1/2 top-0 z-10 -translate-x-1/2 -translate-y-1" aria-hidden>
        <svg width="36" height="44" viewBox="0 0 36 44">
          <path d="M18 44 L2 8 A16 16 0 0 1 34 8 Z" fill="#3a1d12" />
          <circle cx="18" cy="14" r="6" fill="#f5b82e" />
        </svg>
      </div>
      <svg viewBox={`0 0 ${size} ${size}`} className="h-full w-full drop-shadow-xl" role="img"
        aria-label={`Prize wheel with ${n} staff and ${totalEntries} entries`}>
        <circle cx={c} cy={c} r={r + 6} fill="#e3262b" />
        <circle cx={c} cy={c} r={r + 6} fill="none" stroke="#f5b82e" strokeWidth="3" strokeDasharray="2 10" />
        <g
          style={{
            transform: `rotate(${rotation}deg)`,
            transformOrigin: "50% 50%",
            transition: targetIndex === null ? "none" : `transform ${SPIN_MS}ms cubic-bezier(0.12, 0.6, 0.08, 1)`,
          }}
        >
          {items.map((it, i) => {
            const sl = slices[i];
            // avoid the last slice matching the first one it touches
            const col = COLORS[n > 1 && i === n - 1 && i % COLORS.length === 0 ? 1 : i % COLORS.length];
            const mid = sl.start + sl.span / 2;
            // label size follows the slice width; very thin slices get no label
            const fontSize = Math.max(7, Math.min(16, sl.span * 1.45));
            return (
              <g key={i}>
                <path d={arc(sl.start, sl.end)} fill={col.fill} stroke="#ffffff" strokeWidth={n > 60 ? 0.5 : 1.5} />
                {sl.span >= 2.2 && (
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
                    {shortName(it.name)}
                    {it.weight > 1 ? ` ×${it.weight}` : ""}
                  </text>
                )}
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
