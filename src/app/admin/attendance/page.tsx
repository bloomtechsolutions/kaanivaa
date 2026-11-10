"use client";

import { useEffect, useMemo, useState } from "react";
import { useAdmin } from "@/components/AdminShell";
import { ErrorBox, Heading, Panel } from "@/components/ui";
import { supabase } from "@/lib/supabase/client";
import { LOCATIONS, RESP_META, STATUS_META, fmtDate, fmtTime, todayMV, type Shift, type Staff, type Status } from "@/lib/roster";

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
  const { shifts: allShifts, assignments, staff, staffById, setStatus, reload, areas, shiftIds } = useAdmin();
  // leaders limited to shifts only see those days/shifts
  const shifts = useMemo(
    () => (shiftIds.length ? allShifts.filter((s) => shiftIds.includes(s.id)) : allShifts),
    [allShifts, shiftIds],
  );
  const dates = useMemo(() => [...new Set(shifts.map((s) => s.shift_date))], [shifts]);
  // leaders limited to areas only see (and count) those locations
  const visibleLocations = areas.length ? LOCATIONS.filter((l) => areas.includes(l.name)) : LOCATIONS;
  const [notice, setNotice] = useState<string | null>(null);
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

  const shiftAll = assignments.filter((a) => a.shift_id === shiftId && visibleLocations.some((l) => l.name === a.location));
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

  if (!shift) {
    return shiftIds.length > 0 && shifts.length === 0 ? (
      <ErrorBox message="You have no shifts on the roster, so there is no attendance for you to mark. Ask an admin to check your shifts on the Users page." />
    ) : null;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <Heading>Attendance</Heading>
          {(areas.length > 0 || shiftIds.length > 0) && (
            <div className="mt-1 flex flex-wrap gap-1.5">
              {areas.length > 0 && (
                <span className="rounded-full bg-carnival-gold px-3 py-0.5 text-xs font-extrabold">Your area: {areas.join(", ")}</span>
              )}
              {shiftIds.length > 0 && (
                <span className="rounded-full bg-carnival-teal px-3 py-0.5 text-xs font-extrabold text-white">
                  Your shifts: {shifts.map((s) => `${fmtDate(s.shift_date, { day: "numeric", month: "short" })} S${s.shift_no}`).join(", ")}
                </span>
              )}
            </div>
          )}
        </div>
        <div className="text-sm font-semibold">
          <span className="text-2xl font-extrabold text-emerald-700 tabular-nums">{inCount}</span> / {shiftAll.length} checked in
        </div>
      </div>

      <Panel className="space-y-3 p-3">
        <div className="flex gap-2 overflow-x-auto">
          {dates.map((d) => (
            <button key={d} onClick={() => setShiftId((shifts.find((s) => s.shift_date === d && s.shift_no === shift.shift_no) ?? shifts.find((s) => s.shift_date === d))?.id ?? shiftId)}
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

      <AddExtraShift
        shift={shift}
        locations={visibleLocations}
        staff={staff}
        onShift={new Set(assignments.filter((a) => a.shift_id === shiftId).map((a) => a.staff_id))}
        onAdded={(msg) => { setError(null); setNotice(msg); reload(); }}
        onError={(msg) => { setNotice(null); setError(msg); }}
      />

      {error && <ErrorBox message={error} />}
      {notice && <div className="rounded-xl bg-emerald-50 p-3 text-sm font-semibold text-emerald-800 ring-1 ring-emerald-200">✓ {notice}</div>}

      {visibleLocations.map(({ name, target }) => {
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
                        {a.extra && a.added_by && ` · extra shift added by ${a.added_by.split("@")[0]}`}
                      </div>
                    </div>
                    {a.extra && (
                      <span className="ml-auto rounded bg-carnival-gold px-1.5 py-0.5 text-[10px] font-extrabold tracking-wide" title={a.added_by ? `Extra shift added by ${a.added_by}` : "Extra shift"}>
                        EXTRA
                      </span>
                    )}
                    <span className={`${a.extra ? "" : "ml-auto "}rounded px-1.5 py-0.5 text-[10px] font-extrabold tracking-wide ${RESP_META[a.responsibility]}`}>{a.responsibility}</span>
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
                    {a.extra && (
                      <button title="Remove this extra shift" disabled={busyIds.has(a.id)}
                        onClick={async () => {
                          if (!confirm(`Remove the extra shift for ${s.full_name}?`)) return;
                          const { error } = await supabase().rpc("remove_extra_shift", { p_assignment: a.id });
                          if (error) setError(error.message);
                          else { setNotice(`Extra shift removed for ${s.full_name}.`); reload(); }
                        }}
                        className="col-span-4 rounded-lg bg-rose-50 px-2.5 py-1.5 text-xs font-bold text-rose-700 ring-1 ring-rose-200 hover:bg-rose-100 sm:col-span-1">
                        ✕
                      </button>
                    )}
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

/** Leaders/admins: put someone on this shift as an extra duty (e.g. a volunteer who stays on). */
function AddExtraShift({
  shift, locations, staff, onShift, onAdded, onError,
}: {
  shift: Shift;
  locations: { name: string; target: number }[];
  staff: Staff[];
  onShift: Set<string>;
  onAdded: (msg: string) => void;
  onError: (msg: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [location, setLocation] = useState("");
  const [present, setPresent] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const term = q.trim().toLowerCase();
  const matches = term.length < 2 ? [] : staff
    .filter((s) => !onShift.has(s.id) && `${s.full_name} ${s.uid ?? ""} ${s.email ?? ""}`.toLowerCase().includes(term))
    .slice(0, 8);

  async function add(s: Staff) {
    setBusy(s.id);
    const { data, error } = await supabase().rpc("add_extra_shift", {
      p_staff: s.id, p_shift: shift.id, p_location: location || null, p_present: present,
    });
    setBusy(null);
    if (error) return onError(error.message);
    const loc = (data as { location: string }).location;
    setQ("");
    onAdded(`${s.full_name} added to Shift ${shift.shift_no} (${fmtDate(shift.shift_date)}) at ${loc}${present ? " and marked present" : ""}.`);
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)}
        className="w-full rounded-2xl border-2 border-dashed border-carnival-teal/40 bg-white/60 px-4 py-2.5 text-sm font-bold text-carnival-teal-dark hover:bg-white">
        + Add staff to this shift (extra shift)
      </button>
    );
  }

  return (
    <Panel className="space-y-3 p-4 ring-2 ring-carnival-gold">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="font-extrabold">Add staff to Shift {shift.shift_no} · {fmtDate(shift.shift_date)} {fmtTime(shift.starts_at)}–{fmtTime(shift.ends_at)}</div>
          <p className="text-xs text-carnival-ink/70">For someone taking an extra shift on top of their assigned duties. Each completed duty is a lucky draw entry.</p>
        </div>
        <button onClick={() => setOpen(false)} className="text-sm font-bold text-carnival-ink/60 hover:text-carnival-ink">✕</button>
      </div>
      <div className="flex flex-wrap gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search staff name or UID…" type="search" autoFocus
          className="w-full min-w-0 rounded-xl border-0 bg-white px-3 py-2 ring-1 ring-carnival-teal/30 focus:ring-2 focus:ring-carnival-teal focus:outline-none sm:w-auto sm:flex-1" />
        <select value={location} onChange={(e) => setLocation(e.target.value)} aria-label="Location"
          className="rounded-xl border-0 bg-white px-3 py-2 text-sm ring-1 ring-carnival-teal/30">
          <option value="">Location: where most needed</option>
          {locations.map((l) => <option key={l.name} value={l.name}>{l.name}</option>)}
        </select>
        <label className="flex items-center gap-2 text-sm font-semibold">
          <input type="checkbox" checked={present} onChange={(e) => setPresent(e.target.checked)} className="size-4 accent-carnival-red" />
          Mark present now
        </label>
      </div>
      {term.length >= 2 && (
        <ul className="divide-y divide-carnival-teal/10 rounded-xl bg-white ring-1 ring-carnival-teal/20">
          {matches.map((s) => (
            <li key={s.id} className="flex items-center justify-between gap-2 px-3 py-2">
              <div className="min-w-0">
                <div className="truncate font-bold">{s.full_name}</div>
                <div className="text-xs text-carnival-ink/60">{s.uid ?? "no UID"}{s.is_leader ? " · leader" : ""}</div>
              </div>
              <button onClick={() => add(s)} disabled={busy !== null}
                className="shrink-0 rounded-lg bg-carnival-red px-3 py-1.5 text-xs font-bold text-white hover:bg-carnival-red-dark disabled:opacity-50">
                {busy === s.id ? "Adding…" : "Add to shift"}
              </button>
            </li>
          ))}
          {matches.length === 0 && <li className="px-3 py-2 text-sm text-carnival-ink/60">No match (people already on this shift are hidden).</li>}
        </ul>
      )}
    </Panel>
  );
}
