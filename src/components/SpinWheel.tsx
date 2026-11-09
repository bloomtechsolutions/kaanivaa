"use client";

import { useEffect, useMemo, useRef, useState } from "react";

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
 * A prize wheel with one equal slice per ENTRY (a person with 3 completed duties has 3 slices).
 * The winning entry is decided elsewhere (in the database); when `targetIndex` is set the wheel
 * spins several turns and lands that slice under the pointer. The name under the pointer is
 * shown live, so it stays readable even when there are too many slices to label.
 */
export default function SpinWheel({
  entries,
  targetIndex,
  onSettled,
}: {
  entries: string[];
  targetIndex: number | null;
  onSettled?: () => void;
}) {
  const settledFor = useRef<number | null>(null);
  const groupRef = useRef<SVGGElement>(null);
  const [pointerName, setPointerName] = useState<string | null>(null);
  const n = Math.max(entries.length, 1);
  const seg = 360 / n;
  const size = 520;
  const r = size / 2 - 8;
  const c = size / 2;
  const showLabels = seg >= 2.2;
  const fontSize = Math.max(7, Math.min(16, seg * 1.45));

  // Each draw mounts a fresh wheel, so the spin always starts from 0°.
  const rotation = useMemo(() => {
    if (targetIndex === null) return 0;
    const centre = (targetIndex + 0.5) * seg;
    // land inside the slice, not always dead-centre
    const jitter = (((targetIndex * 7919) % 100) / 100 - 0.5) * seg * 0.6;
    return 360 * 8 + (360 - centre) + jitter;
  }, [targetIndex, seg]);

  // Track which entry is under the pointer while spinning
  useEffect(() => {
    if (targetIndex === null) return;
    let raf = 0;
    const tick = () => {
      const g = groupRef.current;
      if (g) {
        const m = getComputedStyle(g).transform;
        const match = m.match(/matrix\(([^,]+),\s*([^,]+)/);
        if (match) {
          const ang = ((Math.atan2(+match[2], +match[1]) * 180) / Math.PI + 360) % 360;
          const idx = Math.floor((((360 - ang) % 360) / seg)) % n;
          setPointerName(entries[idx] ?? null);
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    const t = setTimeout(() => {
      cancelAnimationFrame(raf);
      setPointerName(entries[targetIndex] ?? null);
      if (settledFor.current !== targetIndex) {
        settledFor.current = targetIndex;
        onSettled?.();
      }
    }, SPIN_MS + 150);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(t);
    };
  }, [targetIndex, onSettled, entries, seg, n]);

  const arc = (i: number) => {
    if (n === 1) return `M ${c} ${c - r} A ${r} ${r} 0 1 1 ${c - 0.01} ${c - r} Z`;
    const a0 = ((i * seg - 90) * Math.PI) / 180;
    const a1 = (((i + 1) * seg - 90) * Math.PI) / 180;
    const large = seg > 180 ? 1 : 0;
    return `M ${c} ${c} L ${c + r * Math.cos(a0)} ${c + r * Math.sin(a0)} A ${r} ${r} 0 ${large} 1 ${c + r * Math.cos(a1)} ${c + r * Math.sin(a1)} Z`;
  };

  return (
    <div className="mx-auto w-full max-w-[min(80vh,520px)]">
      <div className="mb-2 flex h-10 items-center justify-center rounded-xl bg-carnival-ink px-3 text-center font-display text-lg text-carnival-gold sm:text-xl" aria-live="off">
        {pointerName ?? (showLabels ? "Ready to spin" : `${entries.length} entries on the wheel`)}
      </div>
      <div className="relative aspect-square w-full">
        {/* pointer */}
        <div className="absolute left-1/2 top-0 z-10 -translate-x-1/2 -translate-y-1" aria-hidden>
          <svg width="36" height="44" viewBox="0 0 36 44">
            <path d="M18 44 L2 8 A16 16 0 0 1 34 8 Z" fill="#3a1d12" />
            <circle cx="18" cy="14" r="6" fill="#f5b82e" />
          </svg>
        </div>
        <svg viewBox={`0 0 ${size} ${size}`} className="h-full w-full drop-shadow-xl" role="img" aria-label={`Prize wheel with ${entries.length} entries`}>
          <circle cx={c} cy={c} r={r + 6} fill="#e3262b" />
          <circle cx={c} cy={c} r={r + 6} fill="none" stroke="#f5b82e" strokeWidth="3" strokeDasharray="2 10" />
          <g
            ref={groupRef}
            style={{
              transform: `rotate(${rotation}deg)`,
              transformOrigin: "50% 50%",
              transition: targetIndex === null ? "none" : `transform ${SPIN_MS}ms cubic-bezier(0.12, 0.6, 0.08, 1)`,
            }}
          >
            {entries.map((name, i) => {
              // avoid the last slice matching the first one it touches
              const col = COLORS[n > 1 && i === n - 1 && i % COLORS.length === 0 ? 1 : i % COLORS.length];
              const mid = i * seg + seg / 2;
              return (
                <g key={i}>
                  <path d={arc(i)} fill={col.fill} stroke="#ffffff" strokeWidth={n > 120 ? 0.3 : n > 60 ? 0.5 : 1.5} />
                  {showLabels && (
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
    </div>
  );
}
