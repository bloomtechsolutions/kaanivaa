"use client";

import { useCallback, useState } from "react";
import { useAdmin } from "@/components/AdminShell";
import SpinWheel from "@/components/SpinWheel";
import { ErrorBox, Heading, Marquee, Panel } from "@/components/ui";
import { supabase } from "@/lib/supabase/client";
import { ATTENDED, fmtDate, type Draw } from "@/lib/roster";

interface Target {
  kind: "daily" | "grand";
  date: string | null;
  title: string;
  prize: string;
}

/** One person in a draw and how many entries (completed duties) they have. */
interface Entry {
  id: string;
  n: number;
}

interface Stage {
  target: Target;
  entries: Entry[];
  winnerIndex: number | null;
  winner: string | null;
  spinning: boolean;
  settled: boolean;
}

export default function DrawPage() {
  const { role, dates, draws, assignments, shiftById, staffById, reload } = useAdmin();
  const [excludePrev, setExcludePrev] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openList, setOpenList] = useState<string | null>(null);
  const [stage, setStage] = useState<Stage | null>(null);

  const onSettled = useCallback(() => setStage((s) => (s ? { ...s, settled: true, spinning: false } : s)), []);

  if (role !== "admin") return <ErrorBox message="Only admins can run the lucky draw." />;

  const targets: Target[] = [
    ...dates.map((d) => ({ kind: "daily" as const, date: d, title: fmtDate(d, { weekday: "long", day: "numeric", month: "long" }), prize: "MVR 2,000 to Swipe wallet" })),
    { kind: "grand", date: null, title: "Grand draw", prize: "iPhone 18 Pro" },
  ];
  const name = (id: string) => staffById.get(id)?.full_name ?? "Unknown";
  /** Collapse a raw entry list (one staff id per completed duty) into people with entry counts. */
  const toEntries = (raw: string[]): Entry[] => {
    const counts = new Map<string, number>();
    for (const id of raw) counts.set(id, (counts.get(id) ?? 0) + 1);
    return [...counts].map(([id, n]) => ({ id, n })).sort((a, b) => name(a.id).localeCompare(name(b.id)));
  };
  const totalOf = (e: Entry[]) => e.reduce((s, x) => s + x.n, 0);

  /** Mirrors public.draw_pool(): one entry per completed (present/late) duty. */
  function pool(t: Target): Entry[] {
    const voidedHere = new Set(draws.filter((d) => d.voided && d.kind === t.kind && d.draw_date === t.date).map((d) => d.staff_id));
    const dailyWinners = new Set(draws.filter((d) => !d.voided && d.kind === "daily").map((d) => d.staff_id));
    const raw: string[] = [];
    for (const a of assignments) {
      if (!ATTENDED.includes(a.status)) continue;
      if (t.kind === "daily" && shiftById.get(a.shift_id)!.shift_date !== t.date) continue;
      if (voidedHere.has(a.staff_id)) continue;
      if (t.kind === "daily" && excludePrev && dailyWinners.has(a.staff_id)) continue;
      raw.push(a.staff_id);
    }
    return toEntries(raw);
  }

  const activeFor = (t: Target) => draws.find((d) => !d.voided && d.kind === t.kind && d.draw_date === t.date);
  const keyOf = (t: Target) => t.kind + (t.date ?? "");

  function openStage(t: Target) {
    setError(null);
    setStage({ target: t, entries: pool(t), winnerIndex: null, winner: null, spinning: false, settled: false });
  }

  async function spin() {
    if (!stage || stage.spinning || stage.winner) return;
    setStage({ ...stage, spinning: true });
    const { data, error } = await supabase().rpc("run_draw", {
      p_kind: stage.target.kind,
      p_date: stage.target.date,
      p_exclude_previous: excludePrev,
    });
    if (error) {
      setStage({ ...stage, spinning: false });
      setError(error.message);
      return;
    }
    const draw = data as Draw;
    // Use the database's entry list so the wheel shows exactly who was in the draw, with their entries.
    const entries = toEntries(draw.pool);
    setStage({ ...stage, entries, spinning: true, winnerIndex: entries.findIndex((e) => e.id === draw.staff_id), winner: name(draw.staff_id) });
    reload();
  }

  async function voidDraw(d: Draw) {
    const reason = prompt(`Void the win for ${name(d.staff_id)}? Enter a reason (e.g. not present to claim):`);
    if (reason === null) return;
    const { error } = await supabase().rpc("void_draw", { p_draw: d.id, p_reason: reason });
    if (error) setError(error.message);
    else reload();
  }

  return (
    <div className="space-y-4">
      <Heading>Lucky draw</Heading>
      <Panel className="p-4 text-sm">
        <p>
          <b>Every completed duty is one entry</b> (marked <b>Present</b> or <b>Late</b>). Daily draw: duties completed that
          day (up to 3). Grand draw: all duties completed (up to 12) — someone with 12 completed duties has 12× the chance
          of someone with 1. The winning entry is picked in the database with a cryptographically random choice and saved
          with the full entry list; the wheel (one slice per person, sized by their entries) then spins to that name.
        </p>
        <label className="mt-3 flex items-center gap-2 font-semibold">
          <input type="checkbox" checked={excludePrev} onChange={(e) => setExcludePrev(e.target.checked)} className="size-4 accent-carnival-red" />
          Exclude people who already won a daily prize from later daily draws
        </label>
      </Panel>
      {error && <ErrorBox message={error} />}

      <div className="grid gap-4 md:grid-cols-2">
        {targets.map((t) => {
          const active = activeFor(t);
          const voided = draws.filter((d) => d.voided && d.kind === t.kind && d.draw_date === t.date);
          const eligible = active ? toEntries(active.pool) : pool(t);
          const entryCount = totalOf(eligible);
          const grand = t.kind === "grand";
          const k = keyOf(t);
          return (
            <Panel key={k} className={`overflow-hidden ${grand ? "md:col-span-2 ring-2 ring-carnival-gold" : ""}`}>
              <div className={`flex items-center justify-between px-4 py-2 text-white ${grand ? "bg-carnival-red" : "bg-carnival-teal"}`}>
                <span className="font-bold">{t.title}</span>
                <span className="text-sm font-semibold">{t.prize}</span>
              </div>
              <div className="p-4">
                {active ? (
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="text-xs font-bold uppercase tracking-wide text-carnival-ink/60">Winner</div>
                      <div className="font-display text-2xl text-carnival-red">{name(active.staff_id)}</div>
                      <div className="text-xs text-carnival-ink/60">
                        {staffById.get(active.staff_id)?.uid} · {eligible.find((e) => e.id === active.staff_id)?.n ?? 1} of{" "}
                        {active.pool_size} entries ({eligible.length} staff) · drawn{" "}
                        {new Date(active.drawn_at).toLocaleString("en-GB", { timeZone: "Indian/Maldives", dateStyle: "medium", timeStyle: "short" })}
                        {active.drawn_by && ` by ${active.drawn_by}`}
                      </div>
                    </div>
                    <button onClick={() => voidDraw(active)} className="rounded-lg bg-rose-50 px-3 py-1.5 text-xs font-bold text-rose-700 ring-1 ring-rose-200 hover:bg-rose-100">
                      Void &amp; allow redraw
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="text-sm">
                      <b className="text-xl tabular-nums">{entryCount}</b> entries ·{" "}
                      <b className="tabular-nums">{eligible.length}</b> eligible staff
                    </div>
                    <button onClick={() => openStage(t)} disabled={eligible.length === 0}
                      className="rounded-xl bg-carnival-red px-5 py-2.5 font-bold text-white shadow hover:bg-carnival-red-dark disabled:opacity-40">
                      🎡 Open spin wheel
                    </button>
                  </div>
                )}

                {eligible.length > 0 && (
                  <div className="mt-3 border-t border-carnival-teal/10 pt-2">
                    <button onClick={() => setOpenList(openList === k ? null : k)} className="text-xs font-bold text-carnival-teal-dark hover:underline">
                      {openList === k ? "Hide" : "Show"} {active ? "entries in this draw" : "eligible staff & entries"} ({eligible.length} staff · {entryCount} entries)
                    </button>
                    {openList === k && (
                      <ul className="mt-2 flex max-h-56 flex-wrap gap-1.5 overflow-y-auto">
                        {[...eligible].sort((a, b) => b.n - a.n || name(a.id).localeCompare(name(b.id))).map((e) => (
                          <li key={e.id} className={`rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${active?.staff_id === e.id ? "bg-carnival-gold ring-carnival-gold" : "bg-carnival-sky ring-carnival-teal/20"}`}>
                            {name(e.id)} <b className="text-carnival-red">×{e.n}</b>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}

                {voided.length > 0 && (
                  <ul className="mt-3 space-y-0.5 border-t border-carnival-teal/10 pt-2 text-xs text-carnival-ink/60">
                    {voided.map((d) => (
                      <li key={d.id}><s>{name(d.staff_id)}</s> — voided{d.void_reason ? `: ${d.void_reason}` : ""}</li>
                    ))}
                  </ul>
                )}
              </div>
            </Panel>
          );
        })}
      </div>

      {stage && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-carnival-ink/80 p-3 backdrop-blur-sm sm:p-6" role="dialog" aria-modal aria-label={`${stage.target.title} spin wheel`}>
          <div className="mx-auto max-w-5xl">
            <Marquee>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-bold uppercase tracking-widest text-carnival-teal-dark">{stage.target.title}</div>
                  <div className="font-display text-2xl text-carnival-red sm:text-3xl">{stage.target.prize}</div>
                </div>
                {!stage.spinning && (
                  <button onClick={() => setStage(null)} className="rounded-full bg-white px-3 py-1.5 text-sm font-bold ring-1 ring-carnival-teal/30 hover:bg-carnival-sky">
                    ✕ Close
                  </button>
                )}
              </div>

              <div className="mt-4 grid items-center gap-6 lg:grid-cols-[1fr_260px]">
                <SpinWheel items={stage.entries.map((e) => ({ name: name(e.id), weight: e.n }))} targetIndex={stage.winnerIndex} onSettled={onSettled} />
                <div className="space-y-3">
                  <div className="min-h-28 rounded-2xl bg-white p-4 text-center ring-1 ring-carnival-teal/20">
                    {stage.settled && stage.winner ? (
                      <div className="pop-in">
                        <div className="text-3xl" aria-hidden>🎉🏆🎉</div>
                        <div className="text-xs font-bold uppercase tracking-widest text-carnival-teal-dark">Winner</div>
                        <div className="font-display text-2xl leading-tight text-carnival-red">{stage.winner}</div>
                      </div>
                    ) : stage.spinning ? (
                      <div className="py-6 font-display text-xl text-carnival-teal-dark">Spinning…</div>
                    ) : (
                      <>
                        <div className="text-sm text-carnival-ink/70">
                          <b className="text-2xl text-carnival-ink">{totalOf(stage.entries)}</b> entries from{" "}
                          <b className="text-carnival-ink">{stage.entries.length}</b> staff
                        </div>
                        <button onClick={spin} className="mt-3 w-full rounded-xl bg-carnival-red py-3 font-display text-xl text-white shadow-lg hover:bg-carnival-red-dark">
                          SPIN!
                        </button>
                      </>
                    )}
                  </div>
                  <div className="rounded-2xl bg-white/80 p-3 ring-1 ring-carnival-teal/20">
                    <div className="mb-1 flex justify-between text-xs font-bold uppercase tracking-wide text-carnival-ink/60">
                      <span>Staff</span><span>Entries</span>
                    </div>
                    <ol className="max-h-64 space-y-0.5 overflow-y-auto text-sm">
                      {stage.entries.map((e, i) => (
                        <li key={e.id} className={`flex justify-between gap-2 rounded px-1.5 ${stage.settled && i === stage.winnerIndex ? "bg-carnival-gold font-extrabold" : ""}`}>
                          <span className="truncate">{name(e.id)}</span>
                          <span className="tabular-nums">{e.n}</span>
                        </li>
                      ))}
                    </ol>
                  </div>
                </div>
              </div>
            </Marquee>
          </div>
        </div>
      )}
    </div>
  );
}
