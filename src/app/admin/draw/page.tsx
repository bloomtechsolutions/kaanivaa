"use client";

import { useEffect, useRef, useState } from "react";
import { useAdmin } from "@/components/AdminShell";
import { ErrorBox, Heading, Marquee, Panel } from "@/components/ui";
import { supabase } from "@/lib/supabase/client";
import { ATTENDED, fmtDate, type Draw } from "@/lib/roster";

interface Target {
  kind: "daily" | "grand";
  date: string | null;
  title: string;
  prize: string;
}

export default function DrawPage() {
  const { role, dates, draws, assignments, shiftById, staffById, reload } = useAdmin();
  const [excludePrev, setExcludePrev] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stage, setStage] = useState<{ target: Target; names: string[]; winner: string | null } | null>(null);
  const [shown, setShown] = useState("");
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearInterval(timer.current);
  }, []);

  if (role !== "admin") return <ErrorBox message="Only admins can run the lucky draw." />;

  const targets: Target[] = [
    ...dates.map((d) => ({ kind: "daily" as const, date: d, title: fmtDate(d, { weekday: "long", day: "numeric", month: "long" }), prize: "MVR 2,000 to Swipe wallet" })),
    { kind: "grand", date: null, title: "Grand draw", prize: "iPhone 18 Pro" },
  ];

  /** Mirrors public.draw_pool() so organisers can see who is in before drawing. */
  function pool(t: Target) {
    const voidedHere = new Set(draws.filter((d) => d.voided && d.kind === t.kind && d.draw_date === t.date).map((d) => d.staff_id));
    const dailyWinners = new Set(draws.filter((d) => !d.voided && d.kind === "daily").map((d) => d.staff_id));
    const ids = new Set<string>();
    for (const a of assignments) {
      if (!ATTENDED.includes(a.status)) continue;
      if (t.kind === "daily" && shiftById.get(a.shift_id)!.shift_date !== t.date) continue;
      if (voidedHere.has(a.staff_id)) continue;
      if (t.kind === "daily" && excludePrev && dailyWinners.has(a.staff_id)) continue;
      ids.add(a.staff_id);
    }
    return [...ids];
  }

  const activeFor = (t: Target) => draws.find((d) => !d.voided && d.kind === t.kind && d.draw_date === t.date);

  async function run(t: Target) {
    const ids = pool(t);
    if (ids.length === 0) return setError("Nobody is eligible yet — mark attendance first.");
    if (!confirm(`Draw the ${t.title.toLowerCase().includes("grand") ? "grand prize" : `daily prize for ${t.title}`} from ${ids.length} eligible staff?`)) return;
    setError(null);
    const names = ids.map((id) => staffById.get(id)!.full_name);
    setStage({ target: t, names, winner: null });
    timer.current = setInterval(() => setShown(names[Math.floor(Math.random() * names.length)]), 70);

    // Let the name reel spin for at least 3.5s while the database picks the winner.
    const [{ data, error }] = await Promise.all([
      supabase().rpc("run_draw", { p_kind: t.kind, p_date: t.date, p_exclude_previous: excludePrev }),
      new Promise((r) => setTimeout(r, 3500)),
    ]);
    if (timer.current) clearInterval(timer.current);
    if (error) {
      setStage(null);
      setError(error.message);
      return;
    }
    const winner = staffById.get((data as Draw).staff_id)!.full_name;
    setShown(winner);
    setStage((s) => (s ? { ...s, winner } : s));
    reload();
  }

  async function voidDraw(d: Draw) {
    const reason = prompt(`Void the win for ${staffById.get(d.staff_id)?.full_name}? Enter a reason (e.g. not present to claim):`);
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
          Eligible = staff marked <b>Present</b> or <b>Late</b>. Daily draw: attended that day. Grand draw: attended any shift.
          Winners are picked in the database with a cryptographically random choice and recorded with the full entry list.
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
          const eligible = pool(t).length;
          const grand = t.kind === "grand";
          return (
            <Panel key={t.kind + t.date} className={`overflow-hidden ${grand ? "md:col-span-2 ring-2 ring-carnival-gold" : ""}`}>
              <div className={`flex items-center justify-between px-4 py-2 text-white ${grand ? "bg-carnival-red" : "bg-carnival-teal"}`}>
                <span className="font-bold">{t.title}</span>
                <span className="text-sm font-semibold">{t.prize}</span>
              </div>
              <div className="p-4">
                {active ? (
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="text-xs font-bold uppercase tracking-wide text-carnival-ink/60">Winner</div>
                      <div className="font-display text-2xl text-carnival-red">{staffById.get(active.staff_id)?.full_name}</div>
                      <div className="text-xs text-carnival-ink/60">
                        {staffById.get(active.staff_id)?.uid} · drawn from {active.pool_size} on{" "}
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
                    <div className="text-sm"><b className="text-xl tabular-nums">{eligible}</b> eligible staff</div>
                    <button onClick={() => run(t)} disabled={eligible === 0 || stage !== null}
                      className="rounded-xl bg-carnival-red px-5 py-2.5 font-bold text-white shadow hover:bg-carnival-red-dark disabled:opacity-40">
                      🎉 Draw winner
                    </button>
                  </div>
                )}
                {voided.length > 0 && (
                  <ul className="mt-3 space-y-0.5 border-t border-carnival-teal/10 pt-2 text-xs text-carnival-ink/60">
                    {voided.map((d) => (
                      <li key={d.id}><s>{staffById.get(d.staff_id)?.full_name}</s> — voided{d.void_reason ? `: ${d.void_reason}` : ""}</li>
                    ))}
                  </ul>
                )}
              </div>
            </Panel>
          );
        })}
      </div>

      {stage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-carnival-ink/70 p-4 backdrop-blur-sm" role="dialog" aria-modal>
          <Marquee className="w-full max-w-2xl">
            <div className="py-6 text-center">
              <div className="text-sm font-bold uppercase tracking-widest text-carnival-teal-dark">{stage.target.title}</div>
              <div className="mt-1 text-lg font-bold">{stage.target.prize}</div>
              <div className="mt-6 flex min-h-24 items-center justify-center">
                <div key={stage.winner ?? "spin"} className={`font-display text-3xl sm:text-5xl ${stage.winner ? "text-carnival-red pop-in" : "text-carnival-ink/70"}`}>
                  {shown}
                </div>
              </div>
              <div className="mt-2 text-sm text-carnival-ink/60">
                {stage.winner ? "Congratulations! 🎊" : `Drawing from ${stage.names.length} staff…`}
              </div>
              {stage.winner && (
                <button onClick={() => setStage(null)} className="mt-6 rounded-xl bg-carnival-teal px-6 py-2.5 font-bold text-white hover:bg-carnival-teal-dark">
                  Close
                </button>
              )}
            </div>
          </Marquee>
        </div>
      )}
    </div>
  );
}
