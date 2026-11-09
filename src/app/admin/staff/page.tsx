"use client";

import { Fragment, useMemo, useState } from "react";
import { useAdmin } from "@/components/AdminShell";
import { Heading, Panel } from "@/components/ui";
import { ATTENDED, STATUS_META, fmtDate, fmtTime } from "@/lib/roster";

function csvCell(v: unknown) {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export default function StaffPage() {
  const { staff, assignments, shiftById, draws } = useAdmin();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<string | null>(null);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return staff
      .filter((s) => !q || `${s.full_name} ${s.uid ?? ""} ${s.email ?? ""}`.toLowerCase().includes(q))
      .map((s) => {
        const mine = assignments
          .filter((a) => a.staff_id === s.id)
          .sort((x, y) => x.shift_id - y.shift_id);
        const attended = mine.filter((a) => ATTENDED.includes(a.status));
        const days = new Set(attended.map((a) => shiftById.get(a.shift_id)!.shift_date));
        const won = draws.filter((d) => !d.voided && d.staff_id === s.id);
        return { s, mine, attended: attended.length, absent: mine.filter((a) => a.status === "absent").length, days, won };
      });
  }, [staff, assignments, shiftById, draws, query]);

  function exportCsv() {
    const header = ["Date", "Shift", "Timing", "Location", "Responsibility", "Name", "UID", "Email", "Status", "Marked at", "Marked by"];
    const lines = assignments
      .map((a) => ({ a, sh: shiftById.get(a.shift_id)!, st: staff.find((s) => s.id === a.staff_id)! }))
      .sort((x, y) => x.sh.id - y.sh.id || x.a.location.localeCompare(y.a.location) || x.st.full_name.localeCompare(y.st.full_name))
      .map(({ a, sh, st }) =>
        [sh.shift_date, `Shift ${sh.shift_no}`, `${fmtTime(sh.starts_at)}-${fmtTime(sh.ends_at)}`, a.location, a.responsibility,
          st.full_name, st.uid, st.email, a.status, a.marked_at, a.marked_by].map(csvCell).join(","));
    const blob = new Blob([[header.join(","), ...lines].join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `kaanivaa44-attendance-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <Heading>Staff</Heading>
        <button onClick={exportCsv} className="rounded-xl bg-carnival-teal px-4 py-2 text-sm font-bold text-white hover:bg-carnival-teal-dark">
          Export attendance CSV
        </button>
      </div>
      <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name, UID or email…" type="search"
        className="w-full rounded-xl border-0 bg-white px-4 py-2.5 ring-1 ring-carnival-teal/30 focus:ring-2 focus:ring-carnival-teal focus:outline-none" />

      <Panel className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-carnival-cream text-left text-xs uppercase tracking-wide text-carnival-ink/70">
            <tr>
              <th className="px-4 py-2">Name</th>
              <th className="px-2 py-2">UID</th>
              <th className="px-2 py-2">Available</th>
              <th className="px-2 py-2 text-right">Shifts</th>
              <th className="px-2 py-2 text-right">Attended</th>
              <th className="px-2 py-2 text-right">Absent</th>
              <th className="px-4 py-2">Draw entries</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-carnival-teal/10">
            {rows.map(({ s, mine, attended, absent, days, won }) => (
              <Fragment key={s.id}>
                <tr onClick={() => setOpen(open === s.id ? null : s.id)} className="cursor-pointer hover:bg-carnival-sky/50">
                  <td className="px-4 py-2 font-bold">
                    {s.full_name}
                    {s.is_leader && <span className="ml-2 rounded bg-carnival-red px-1.5 py-0.5 text-[10px] text-white">LEADER</span>}
                    {won.map((w) => (
                      <span key={w.id} className="ml-1 rounded bg-carnival-gold px-1.5 py-0.5 text-[10px]">
                        🏆 {w.kind === "grand" ? "iPhone" : `MVR 2k ${fmtDate(w.draw_date!, { day: "numeric", month: "short" })}`}
                      </span>
                    ))}
                  </td>
                  <td className="px-2 py-2 text-carnival-ink/70">{s.uid ?? "—"}</td>
                  <td className="px-2 py-2 text-carnival-ink/70">{s.available_dates.map((d) => d.slice(8)).join(", ")}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{mine.length}</td>
                  <td className="px-2 py-2 text-right font-bold text-emerald-700 tabular-nums">{attended}</td>
                  <td className="px-2 py-2 text-right text-rose-700 tabular-nums">{absent || ""}</td>
                  <td className="px-4 py-2">
                    {days.size ? `Grand + ${[...days].sort().map((d) => d.slice(8)).join(", ")} Nov` : <span className="text-carnival-ink/40">—</span>}
                  </td>
                </tr>
                {open === s.id && (
                  <tr className="bg-carnival-sky/40">
                    <td colSpan={7} className="px-4 py-3">
                      <div className="mb-2 text-xs text-carnival-ink/70">{s.email ?? "No email on file"} · {s.registration_status}</div>
                      <div className="flex flex-wrap gap-2">
                        {mine.map((a) => {
                          const sh = shiftById.get(a.shift_id)!;
                          return (
                            <span key={a.id} className={`rounded-lg px-2 py-1 text-xs font-semibold ring-1 ${STATUS_META[a.status].chip}`}>
                              {fmtDate(sh.shift_date, { day: "numeric", month: "short" })} S{sh.shift_no} · {a.location} · {STATUS_META[a.status].label}
                            </span>
                          );
                        })}
                        {mine.length === 0 && <span className="text-xs">No shifts assigned.</span>}
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </Panel>
    </div>
  );
}
