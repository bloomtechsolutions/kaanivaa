"use client";

import { Fragment, useMemo, useState } from "react";
import { useAdmin } from "@/components/AdminShell";
import { ErrorBox, Heading, Panel } from "@/components/ui";
import { supabase } from "@/lib/supabase/client";
import { ATTENDED, EVENT_DATES, STATUS_META, fmtDate, fmtTime } from "@/lib/roster";

function csvCell(v: unknown) {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

type Filter = "all" | "new" | "unconfirmed";

export default function StaffPage() {
  const { role, staff, assignments, shiftById, draws, reload } = useAdmin();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [open, setOpen] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const isAdmin = role === "admin";

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return staff
      .filter((s) => !q || `${s.full_name} ${s.uid ?? ""} ${s.email ?? ""}`.toLowerCase().includes(q))
      .map((s) => {
        const mine = assignments.filter((a) => a.staff_id === s.id).sort((x, y) => x.shift_id - y.shift_id);
        const attended = mine.filter((a) => ATTENDED.includes(a.status));
        const days = new Set(attended.map((a) => shiftById.get(a.shift_id)!.shift_date));
        const won = draws.filter((d) => !d.voided && d.staff_id === s.id);
        const confirmed = mine.filter((a) => a.confirmed_at).length;
        return { s, mine, attended: attended.length, absent: mine.filter((a) => a.status === "absent").length, days, won, confirmed };
      })
      .filter((r) => (filter === "new" ? r.s.source !== "roster" : filter === "unconfirmed" ? r.confirmed < r.mine.length : true));
  }, [staff, assignments, shiftById, draws, query, filter]);

  const totalConfirmed = assignments.filter((a) => a.confirmed_at).length;

  function exportCsv() {
    const header = ["Date", "Shift", "Timing", "Location", "Responsibility", "Name", "UID", "Email", "Confirmed at", "Status", "Marked at", "Marked by"];
    const lines = assignments
      .map((a) => ({ a, sh: shiftById.get(a.shift_id)!, st: staff.find((s) => s.id === a.staff_id)! }))
      .filter((x) => x.st)
      .sort((x, y) => x.sh.id - y.sh.id || x.a.location.localeCompare(y.a.location) || x.st.full_name.localeCompare(y.st.full_name))
      .map(({ a, sh, st }) =>
        [sh.shift_date, `Shift ${sh.shift_no}`, `${fmtTime(sh.starts_at)}-${fmtTime(sh.ends_at)}`, a.location, a.responsibility,
          st.full_name, st.uid, st.email, a.confirmed_at, a.status, a.marked_at, a.marked_by].map(csvCell).join(","));
    const blob = new Blob([[header.join(","), ...lines].join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `kaanivaa44-attendance-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function autoAssign(id: string, name: string) {
    const { data, error } = await supabase().rpc("admin_auto_assign", { p_staff: id });
    setMsg(error ? { ok: false, text: error.message } : { ok: true, text: `${name}: ${data} shift(s) assigned.` });
    reload();
  }

  async function removeStaff(id: string, name: string, shifts: number) {
    if (!confirm(`Remove ${name} and their ${shifts} assigned shift(s)? This cannot be undone.`)) return;
    const { error } = await supabase().from("staff").delete().eq("id", id);
    setMsg(error ? { ok: false, text: error.message.includes("foreign key") ? `${name} has a lucky draw win and cannot be removed.` : error.message } : { ok: true, text: `${name} removed.` });
    reload();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <Heading>Staff</Heading>
          <p className="text-sm text-carnival-ink/70">
            {staff.length} staff · duties confirmed <b>{totalConfirmed}</b> / {assignments.length}
          </p>
        </div>
        <div className="flex gap-2">
          {isAdmin && (
            <button onClick={() => setShowAdd((v) => !v)} className="rounded-xl bg-carnival-red px-4 py-2 text-sm font-bold text-white hover:bg-carnival-red-dark">
              {showAdd ? "Close" : "+ Add staff"}
            </button>
          )}
          <button onClick={exportCsv} className="rounded-xl bg-carnival-teal px-4 py-2 text-sm font-bold text-white hover:bg-carnival-teal-dark">
            Export CSV
          </button>
        </div>
      </div>

      {showAdd && isAdmin && <AddStaff onDone={(text) => { setMsg({ ok: true, text }); setShowAdd(false); reload(); }} />}
      {msg && (msg.ok
        ? <div className="rounded-xl bg-emerald-50 p-3 text-sm font-semibold text-emerald-800 ring-1 ring-emerald-200">{msg.text}</div>
        : <ErrorBox message={msg.text} />)}

      <div className="flex flex-wrap gap-2">
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name, UID or email…" type="search"
          className="min-w-0 flex-1 rounded-xl border-0 bg-white px-4 py-2.5 ring-1 ring-carnival-teal/30 focus:ring-2 focus:ring-carnival-teal focus:outline-none" />
        <div className="flex rounded-xl bg-white/80 p-1 text-xs font-bold ring-1 ring-carnival-teal/20">
          {(["all", "new", "unconfirmed"] as Filter[]).map((f) => (
            <button key={f} onClick={() => setFilter(f)} className={`rounded-lg px-3 py-1.5 ${filter === f ? "bg-carnival-teal text-white" : ""}`}>
              {{ all: "All", new: "Newly added", unconfirmed: "Not confirmed" }[f]}
            </button>
          ))}
        </div>
      </div>

      <Panel className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-carnival-cream text-left text-xs uppercase tracking-wide text-carnival-ink/70">
            <tr>
              <th className="px-4 py-2">Name</th>
              <th className="px-2 py-2">UID</th>
              <th className="px-2 py-2">Available</th>
              <th className="px-2 py-2 text-right">Shifts</th>
              <th className="px-2 py-2 text-right">Confirmed</th>
              <th className="px-2 py-2 text-right">Attended</th>
              <th className="px-2 py-2 text-right">Absent</th>
              <th className="px-4 py-2">Draw entries</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-carnival-teal/10">
            {rows.map(({ s, mine, attended, absent, days, won, confirmed }) => (
              <Fragment key={s.id}>
                <tr onClick={() => setOpen(open === s.id ? null : s.id)} className="cursor-pointer hover:bg-carnival-sky/50">
                  <td className="px-4 py-2 font-bold">
                    {s.full_name}
                    {s.is_leader && <span className="ml-2 rounded bg-carnival-red px-1.5 py-0.5 text-[10px] text-white">LEADER</span>}
                    {s.source !== "roster" && (
                      <span className="ml-1 rounded bg-carnival-teal px-1.5 py-0.5 text-[10px] text-white">{s.source === "self" ? "JOINED" : "ADDED"}</span>
                    )}
                    {won.map((w) => (
                      <span key={w.id} className="ml-1 rounded bg-carnival-gold px-1.5 py-0.5 text-[10px]">
                        🏆 {w.kind === "grand" ? "iPhone" : `MVR 2k ${fmtDate(w.draw_date!, { day: "numeric", month: "short" })}`}
                      </span>
                    ))}
                  </td>
                  <td className="px-2 py-2 text-carnival-ink/70">{s.uid ?? "—"}</td>
                  <td className="px-2 py-2 text-carnival-ink/70">{s.available_dates.map((d) => d.slice(8)).join(", ")}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{mine.length}</td>
                  <td className={`px-2 py-2 text-right font-bold tabular-nums ${mine.length && confirmed === mine.length ? "text-emerald-700" : "text-amber-600"}`}>
                    {mine.length ? `${confirmed}/${mine.length}` : "—"}
                  </td>
                  <td className="px-2 py-2 text-right font-bold text-emerald-700 tabular-nums">{attended}</td>
                  <td className="px-2 py-2 text-right text-rose-700 tabular-nums">{absent || ""}</td>
                  <td className="px-4 py-2">
                    {attended ? (
                      <span title={`Daily entries: ${[...days].sort().map((d) => `${d.slice(8)} Nov ×${mine.filter((a) => ATTENDED.includes(a.status) && shiftById.get(a.shift_id)!.shift_date === d).length}`).join(", ")}`}>
                        <b>{attended}</b> <span className="text-carnival-ink/60">({[...days].sort().map((d) => d.slice(8)).join(", ")} Nov)</span>
                      </span>
                    ) : <span className="text-carnival-ink/40">—</span>}
                  </td>
                </tr>
                {open === s.id && (
                  <tr className="bg-carnival-sky/40">
                    <td colSpan={8} className="px-4 py-3">
                      <div className="mb-2 text-xs text-carnival-ink/70">{s.email ?? "No email on file"} · {s.registration_status}</div>
                      <div className="flex flex-wrap gap-2">
                        {mine.map((a) => {
                          const sh = shiftById.get(a.shift_id)!;
                          return (
                            <span key={a.id} className={`rounded-lg px-2 py-1 text-xs font-semibold ring-1 ${STATUS_META[a.status].chip}`}>
                              {fmtDate(sh.shift_date, { day: "numeric", month: "short" })} S{sh.shift_no} · {a.location} · {STATUS_META[a.status].label}
                              {a.extra ? " · EXTRA" : ""}
                              {a.confirmed_at ? " · ✓ confirmed" : " · not confirmed"}
                            </span>
                          );
                        })}
                        {mine.length === 0 && <span className="text-xs">No shifts assigned.</span>}
                      </div>
                      {isAdmin && (
                        <div className="mt-3 flex flex-wrap gap-2">
                          <button onClick={() => autoAssign(s.id, s.full_name)} className="rounded-lg bg-carnival-teal px-3 py-1.5 text-xs font-bold text-white hover:bg-carnival-teal-dark">
                            Auto-assign duties for available days
                          </button>
                          {won.length === 0 && (
                            <button onClick={() => removeStaff(s.id, s.full_name, mine.length)} className="rounded-lg bg-rose-50 px-3 py-1.5 text-xs font-bold text-rose-700 ring-1 ring-rose-200 hover:bg-rose-100">
                              Remove staff
                            </button>
                          )}
                        </div>
                      )}
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

const field = "mt-1 w-full rounded-xl border-0 bg-white px-3 py-2 ring-1 ring-carnival-teal/30 focus:ring-2 focus:ring-carnival-teal focus:outline-none";

function AddStaff({ onDone }: { onDone: (msg: string) => void }) {
  const [name, setName] = useState("");
  const [uid, setUid] = useState("");
  const [email, setEmail] = useState("");
  const [dates, setDates] = useState<string[]>([]);
  const [leader, setLeader] = useState(false);
  const [auto, setAuto] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { data, error } = await supabase().rpc("admin_add_staff", {
      p_name: name, p_uid: uid, p_email: email, p_dates: dates, p_is_leader: leader, p_auto: auto,
    });
    setBusy(false);
    if (error) return setError(error.message);
    const n = (data as { assigned: number }).assigned;
    onDone(`${name} added${auto ? ` and assigned ${n} shift${n === 1 ? "" : "s"}` : ""}. Ask them to confirm via "My duty".`);
  }

  return (
    <Panel className="p-4">
      <form onSubmit={submit} className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block text-sm font-semibold">Full name<input required minLength={3} value={name} onChange={(e) => setName(e.target.value)} className={field} /></label>
          <label className="block text-sm font-semibold">UID<input value={uid} onChange={(e) => setUid(e.target.value)} placeholder="U3450" className={field} /></label>
          <label className="block text-sm font-semibold">Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="u3450@bml.com.mv" className={field} /></label>
        </div>
        <div>
          <div className="text-sm font-semibold">Available days</div>
          <div className="mt-1 flex flex-wrap gap-2">
            {EVENT_DATES.map((d) => {
              const on = dates.includes(d);
              return (
                <button type="button" key={d} onClick={() => setDates((p) => (on ? p.filter((x) => x !== d) : [...p, d].sort()))}
                  className={`rounded-lg px-3 py-1.5 text-sm font-bold ring-1 ${on ? "bg-carnival-teal text-white ring-carnival-teal" : "bg-white ring-carnival-teal/30"}`}>
                  {fmtDate(d)}
                </button>
              );
            })}
          </div>
        </div>
        <div className="flex flex-wrap gap-4 text-sm font-semibold">
          <label className="flex items-center gap-2"><input type="checkbox" checked={leader} onChange={(e) => setLeader(e.target.checked)} className="size-4 accent-carnival-red" />Shift leader</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} className="size-4 accent-carnival-red" />Auto-assign duties now</label>
        </div>
        {error && <ErrorBox message={error} />}
        <button disabled={busy || dates.length === 0} className="rounded-xl bg-carnival-red px-5 py-2 font-bold text-white hover:bg-carnival-red-dark disabled:opacity-50">
          {busy ? "Adding…" : "Add staff"}
        </button>
      </form>
    </Panel>
  );
}
