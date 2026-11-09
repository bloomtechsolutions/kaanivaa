"use client";

import Link from "next/link";
import { useAdmin } from "@/components/AdminShell";
import { Heading, Panel } from "@/components/ui";
import { ATTENDED, fmtDate, fmtTime, todayMV, type Assignment } from "@/lib/roster";

function tally(list: Assignment[]) {
  const t = { total: list.length, present: 0, late: 0, absent: 0, excused: 0, pending: 0 };
  for (const a of list) t[a.status]++;
  return t;
}

export default function Overview() {
  const { shifts, assignments, staff, draws, dates } = useAdmin();
  const today = todayMV();
  const all = tally(assignments);
  const marked = all.total - all.pending;
  const confirmed = assignments.filter((a) => a.confirmed_at).length;
  const attendedStaff = new Set(assignments.filter((a) => ATTENDED.includes(a.status)).map((a) => a.staff_id));
  const activeDraws = draws.filter((d) => !d.voided);

  return (
    <div className="space-y-6">
      <Heading>Overview</Heading>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Kpi label="Registered staff" value={staff.length} sub={`${staff.filter((s) => s.is_leader).length} leaders · ${staff.filter((s) => s.source !== "roster").length} new`} />
        <Kpi label="Shift assignments" value={all.total} sub={`${shifts.length} shifts over ${dates.length} days`} />
        <Kpi label="Duties confirmed" value={`${all.total ? Math.round((confirmed / all.total) * 100) : 0}%`} sub={`${confirmed} of ${all.total} by staff`} />
        <Kpi label="Attendance marked" value={`${all.total ? Math.round((marked / all.total) * 100) : 0}%`} sub={`${marked} of ${all.total}`} />
        <Kpi label="In grand draw" value={attendedStaff.size} sub={`${activeDraws.length} of ${dates.length + 1} draws done`} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {dates.map((d) => (
          <Panel key={d} className={`overflow-hidden ${d === today ? "ring-2 ring-carnival-red" : ""}`}>
            <div className="flex items-center justify-between bg-carnival-teal px-4 py-2 text-white">
              <span className="font-bold">{fmtDate(d, { weekday: "long", day: "numeric", month: "long" })}</span>
              {d === today && <span className="rounded-full bg-white px-2 py-0.5 text-xs font-bold text-carnival-red">TODAY</span>}
            </div>
            <ul className="divide-y divide-carnival-teal/10">
              {shifts.filter((s) => s.shift_date === d).map((s) => {
                const t = tally(assignments.filter((a) => a.shift_id === s.id));
                const pct = (n: number) => `${t.total ? (n / t.total) * 100 : 0}%`;
                return (
                  <li key={s.id}>
                    <Link href={`/admin/attendance?shift=${s.id}`} className="block px-4 py-3 hover:bg-carnival-cream/60">
                      <div className="flex items-baseline justify-between">
                        <span className="font-bold">Shift {s.shift_no} <span className="font-normal text-carnival-ink/70">{fmtTime(s.starts_at)}–{fmtTime(s.ends_at)}</span></span>
                        <span className="text-sm tabular-nums"><b className="text-emerald-700">{t.present + t.late}</b> / {t.total} in</span>
                      </div>
                      <div className="mt-2 flex h-2.5 overflow-hidden rounded-full bg-slate-100" aria-hidden>
                        <div className="bg-emerald-500" style={{ width: pct(t.present) }} />
                        <div className="bg-amber-500" style={{ width: pct(t.late) }} />
                        <div className="bg-sky-500" style={{ width: pct(t.excused) }} />
                        <div className="bg-rose-500" style={{ width: pct(t.absent) }} />
                      </div>
                      <div className="mt-1 flex gap-3 text-xs text-carnival-ink/70">
                        <span>Late {t.late}</span><span>Absent {t.absent}</span><span>Excused {t.excused}</span><span>Not marked {t.pending}</span>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </Panel>
        ))}
      </div>
    </div>
  );
}

function Kpi({ label, value, sub }: { label: string; value: number | string; sub: string }) {
  return (
    <Panel className="p-4">
      <div className="text-xs font-bold uppercase tracking-wide text-carnival-teal-dark">{label}</div>
      <div className="mt-1 font-display text-3xl text-carnival-red tabular-nums">{value}</div>
      <div className="text-xs text-carnival-ink/70">{sub}</div>
    </Panel>
  );
}
