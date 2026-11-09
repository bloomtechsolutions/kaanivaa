"use client";

import { useEffect, useMemo, useState } from "react";
import { useAdmin } from "@/components/AdminShell";
import { ErrorBox, Heading, Panel } from "@/components/ui";
import { LOCATIONS, RESP_META, STATUS_META, fmtDate, fmtTime, todayMV, type Status } from "@/lib/roster";

const ACTIONS: { status: Status; short: string; cls: string }[] = [
  { status: "present", short: "Present", cls: "bg-emerald-600 text-white" },
  { status: "late", short: "Late", cls: "bg-amber-500 text-white" },
  { status: "absent", short: "Absent", cls: "bg-rose-600 text-white" },
  { status: "excused", short: "Excused", cls: "bg-sky-600 text-white" },
];

type Filter = "all" | "pending" | "in" | "out";

function defaultShiftNo() {
  const h = new Date(Date.now() + 5 * 3600_000).getUTCHours();
  return h < 19 ? 1 : h < 22 ? 2 : 3;
}

export default function Attendance() {
  const { shifts, assignments, staffById, dates, setStatus } = useAdmin();
  const [shiftId, setShiftId] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [error, setError] = useState<string | null>(null);
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());

  // Pick ?shift=ID from the overview, otherwise today's current shift.
  useEffect(() => {
    if (shiftId !== null || shifts.length === 0) return;
    const fromUrl = Number(new URLSearchParams(window.location.search).get("shift"));
    const today = todayMV();
    const date = dates.includes(today) ? today : dates[0];
    const pick =
      shifts.find((s) => s.id === fromUrl) ??
      shifts.find((s) => s.shift_date === date && s.shift_no === defaultShiftNo()) ??
      shifts[0];
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reads window.location once on mount
    setShiftId(pick.id);
  }, [shifts, dates, shiftId]);

  const shift = shifts.find((s) => s.id === shiftId);
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return assignments
      .filter((a) => a.shift_id === shiftId)
      .map((a) => ({ a, s: staffById.get(a.staff_id)! }))
      .filter(({ a, s }) => {
        if (q && !`${s.full_name} ${s.uid ?? ""} ${s.email ?? ""}`.toLowerCase().includes(q)) return false;
        if (filter === "pending") return a.status === "pending";
        if (filter === "in") return a.status === "present" || a.status === "late";
        if (filter === "out") return a.status === "absent" || a.status === "excused";
        return true;
      })
      .sort((x, y) => x.s.full_name.localeCompare(y.s.full_name));
  }, [assignments, shiftId, staffById, query, filter]);

  const shiftAll = assignments.filter((a) => a.shift_id === shiftId);
  const inCount = shiftAll.filter((a) => a.status === "present" || a.status === "late").length;

  async function mark(ids: string[], status: Status) {
    setBusyIds((p) => new Set([...p, ...ids]));
    const err = await setStatus(ids, status);
    setBusyIds((p) => {
      const n = new Set(p);
      ids.forEach((i) => n.delete(i));
      return n;
    });
    setError(err);
  }

  if (!shift) return null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <Heading>Attendance</Heading>
        <div className="text-sm font-semibold">
          <span className="text-2xl font-extrabold text-emerald-700 tabular-nums">{inCount}</span> / {shiftAll.length} checked in
        </div>
      </div>

      <Panel className="space-y-3 p-3">
        <div className="flex gap-2 overflow-x-auto">
          {dates.map((d) => (
            <button key={d} onClick={() => setShiftId(shifts.find((s) => s.shift_date === d && s.shift_no === shift.shift_no)?.id ?? shiftId)}
              className={`rounded-xl px-3 py-2 text-sm font-bold whitespace-nowrap ${d === shift.shift_date ? "bg-carnival-teal text-white" : "bg-carnival-sky hover:bg-carnival-teal/15"}`}>
              {fmtDate(d)}{d === todayMV() ? " · Today" : ""}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-3 gap-2">
          {shifts.filter((s) => s.shift_date === shift.shift_date).map((s) => (
            <button key={s.id} onClick={() => setShiftId(s.id)}
              className={`rounded-xl px-2 py-2 text-sm font-bold ${s.id === shiftId ? "bg-carnival-red text-white" : "bg-carnival-cream hover:bg-carnival-gold/30"}`}>
              Shift {s.shift_no}
              <span className="block text-xs font-semibold opacity-80">{fmtTime(s.starts_at)}–{fmtTime(s.ends_at)}</span>
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name or UID…" type="search"
            className="w-full min-w-0 rounded-xl border-0 bg-white px-3 py-2 sm:w-auto sm:flex-1 ring-1 ring-carnival-teal/30 focus:ring-2 focus:ring-carnival-teal focus:outline-none" />
          <div className="flex rounded-xl bg-carnival-sky p-1 text-xs font-bold">
            {(["all", "pending", "in", "out"] as Filter[]).map((f) => (
              <button key={f} onClick={() => setFilter(f)} className={`rounded-lg px-2.5 py-1.5 ${filter === f ? "bg-white shadow-sm" : ""}`}>
                {{ all: "All", pending: "Not marked", in: "In", out: "Out" }[f]}
              </button>
            ))}
          </div>
        </div>
      </Panel>

      {error && <ErrorBox message={error} />}

      {LOCATIONS.map(({ name, target }) => {
        const list = rows.filter((r) => r.a.location === name);
        const assigned = shiftAll.filter((a) => a.location === name);
        const present = assigned.filter((a) => a.status === "present" || a.status === "late").length;
        const pendingIds = assigned.filter((a) => a.status === "pending").map((a) => a.id);
        if (list.length === 0 && (query || filter !== "all")) return null;
        return (
          <Panel key={name} className="overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-carnival-teal/10 bg-carnival-cream px-4 py-2">
              <div>
                <span className="font-extrabold">{name}</span>
                <span className="ml-2 text-sm text-carnival-ink/70 tabular-nums">
                  {present}/{assigned.length} in{assigned.length !== target && ` · plan ${target}`}
                </span>
              </div>
              {pendingIds.length > 0 && (
                <button
                  onClick={() => confirm(`Mark ${pendingIds.length} unmarked staff at ${name} as present?`) && mark(pendingIds, "present")}
                  className="rounded-lg bg-emerald-600/10 px-2.5 py-1 text-xs font-bold text-emerald-800 hover:bg-emerald-600/20">
                  Mark {pendingIds.length} unmarked present
                </button>
              )}
            </div>
            <ul className="divide-y divide-carnival-teal/10">
              {list.map(({ a, s }) => (
                <li key={a.id} className={`flex flex-col gap-2 px-4 py-2.5 sm:flex-row sm:items-center ${busyIds.has(a.id) ? "opacity-60" : ""}`}>
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    <span className={`size-2.5 shrink-0 rounded-full ${STATUS_META[a.status].dot}`} title={STATUS_META[a.status].label} />
                    <div className="min-w-0">
                      <div className="truncate font-bold">{s.full_name}</div>
                      <div className="text-xs text-carnival-ink/60">
                        {s.uid ?? "no UID"}
                        {a.marked_at && ` · ${STATUS_META[a.status].label} ${new Date(a.marked_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Indian/Maldives" })}`}
                        {a.marked_by && ` by ${a.marked_by.split("@")[0]}`}
                      </div>
                    </div>
                    <span className={`ml-auto rounded px-1.5 py-0.5 text-[10px] font-extrabold tracking-wide ${RESP_META[a.responsibility]}`}>{a.responsibility}</span>
                  </div>
                  <div className="grid grid-cols-4 gap-1 sm:flex">
                    {ACTIONS.map((act) => {
                      const on = a.status === act.status;
                      return (
                        <button key={act.status} disabled={busyIds.has(a.id)} onClick={() => mark([a.id], on ? "pending" : act.status)}
                          aria-pressed={on}
                          className={`rounded-lg px-2.5 py-1.5 text-xs font-bold transition ${on ? act.cls : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
                          {act.short}
                        </button>
                      );
                    })}
                  </div>
                </li>
              ))}
              {list.length === 0 && <li className="px-4 py-3 text-sm text-carnival-ink/60">Nobody assigned.</li>}
            </ul>
          </Panel>
        );
      })}
    </div>
  );
}
