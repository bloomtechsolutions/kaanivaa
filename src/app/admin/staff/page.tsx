"use client";

import { Fragment, useMemo, useState } from "react";
import { useAdmin } from "@/components/AdminShell";
import { ErrorBox, Heading, Panel } from "@/components/ui";
import { supabase } from "@/lib/supabase/client";
import { ATTENDED, EVENT_DATES, LOCATIONS, STATUS_META, fmtDate, fmtTime, type Assignment, type Shift, type Staff } from "@/lib/roster";

function csvCell(v: unknown) {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

type Filter = "all" | "new";

export default function StaffPage() {
  const { role, staff, shifts, assignments, shiftById, draws, reload } = useAdmin();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [open, setOpen] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
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
        return { s, mine, attended: attended.length, absent: mine.filter((a) => a.status === "absent").length, days, won };
      })
      .filter((r) => (filter === "new" ? r.s.source !== "roster" : true));
  }, [staff, assignments, shiftById, draws, query, filter]);


  function exportCsv() {
    const header = ["Date", "Shift", "Timing", "Location", "Responsibility", "Name", "UID", "Email", "Extra shift", "Status", "Marked at", "Marked by"];
    const lines = assignments
      .map((a) => ({ a, sh: shiftById.get(a.shift_id)!, st: staff.find((s) => s.id === a.staff_id)! }))
      .filter((x) => x.st)
      .sort((x, y) => x.sh.id - y.sh.id || x.a.location.localeCompare(y.a.location) || x.st.full_name.localeCompare(y.st.full_name))
      .map(({ a, sh, st }) =>
        [sh.shift_date, `Shift ${sh.shift_no}`, `${fmtTime(sh.starts_at)}-${fmtTime(sh.ends_at)}`, a.location, a.responsibility,
          st.full_name, st.uid, st.email, a.extra ? "yes" : "", a.status, a.marked_at, a.marked_by].map(csvCell).join(","));
    const blob = new Blob([[header.join(","), ...lines].join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `kaanivaa44-attendance-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function removeAllDuties(name: string, ids: string[]) {
    if (!confirm(`Remove all ${ids.length} duties for ${name}? They stay on the staff list with no shifts.`)) return;
    const { error } = await supabase().from("assignments").delete().in("id", ids);
    setMsg(error ? { ok: false, text: error.message } : { ok: true, text: `All duties removed for ${name}.` });
    reload();
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
            {staff.length} staff · {assignments.length} duties
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
          {(["all", "new"] as Filter[]).map((f) => (
            <button key={f} onClick={() => setFilter(f)} className={`rounded-lg px-3 py-1.5 ${filter === f ? "bg-carnival-teal text-white" : ""}`}>
              {{ all: "All", new: "Newly added" }[f]}
            </button>
          ))}
        </div>
      </div>

      <Panel className="overflow-x-auto">
        <table className="w-full min-w-[680px] text-sm">
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
                    <td colSpan={7} className="px-4 py-3">
                      <div className="mb-2 text-xs text-carnival-ink/70">{s.email ?? "No email on file"} · {s.registration_status}</div>
                      {isAdmin && editing === s.id && (
                        <EditStaff
                          person={s}
                          onCancel={() => setEditing(null)}
                          onSaved={(text) => { setEditing(null); setMsg({ ok: true, text }); reload(); }}
                          onError={(text) => setMsg({ ok: false, text })}
                        />
                      )}
                      {isAdmin ? (
                        <DutyManager
                          person={s}
                          duties={mine}
                          shifts={shifts}
                          onDone={(text, ok = true) => { setMsg({ ok, text }); reload(); }}
                        />
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          {mine.map((a) => {
                            const sh = shiftById.get(a.shift_id)!;
                            return (
                              <span key={a.id} className={`rounded-lg px-2 py-1 text-xs font-semibold ring-1 ${STATUS_META[a.status].chip}`}>
                                {fmtDate(sh.shift_date, { day: "numeric", month: "short" })} S{sh.shift_no} · {a.location} · {STATUS_META[a.status].label}
                                {a.extra ? " · EXTRA" : ""}
                              </span>
                            );
                          })}
                          {mine.length === 0 && <span className="text-xs">No shifts assigned.</span>}
                        </div>
                      )}
                      {isAdmin && (
                        <div className="mt-3 flex flex-wrap gap-2">
                          <button onClick={() => setEditing(editing === s.id ? null : s.id)}
                            className="rounded-lg bg-white px-3 py-1.5 text-xs font-bold text-carnival-teal-dark ring-1 ring-carnival-teal/40 hover:bg-carnival-sky">
                            ✎ Edit details
                          </button>
                          <button onClick={() => autoAssign(s.id, s.full_name)} className="rounded-lg bg-carnival-teal px-3 py-1.5 text-xs font-bold text-white hover:bg-carnival-teal-dark">
                            Auto-assign duties for available days
                          </button>
                          {mine.length > 0 && (
                            <button onClick={() => removeAllDuties(s.full_name, mine.map((a) => a.id))}
                              className="rounded-lg bg-white px-3 py-1.5 text-xs font-bold text-rose-700 ring-1 ring-rose-300 hover:bg-rose-50">
                              Remove all duties (can&apos;t attend)
                            </button>
                          )}
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
    onDone(`${name} added${auto ? ` and assigned ${n} shift${n === 1 ? "" : "s"}` : ""}. They can see their duties on "My duty".`);
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

const shiftName = (sh: Shift) => `${fmtDate(sh.shift_date, { weekday: "short", day: "numeric", month: "short" })} · Shift ${sh.shift_no} (${fmtTime(sh.starts_at)}–${fmtTime(sh.ends_at)})`;

/** Admin: list a person's duties with Move / Remove (staff asked to change or drop a shift). */
function DutyManager({
  person, duties, shifts, onDone,
}: {
  person: Staff;
  duties: Assignment[];
  shifts: Shift[];
  onDone: (msg: string, ok?: boolean) => void;
}) {
  const [moving, setMoving] = useState<string | null>(null);
  const [toShift, setToShift] = useState<number>(0);
  const [toLoc, setToLoc] = useState("");
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [addShift, setAddShift] = useState<number>(0);
  const [addLoc, setAddLoc] = useState("");
  const byId = new Map(shifts.map((sh) => [sh.id, sh]));
  const taken = new Set(duties.map((a) => a.shift_id));
  const locs = LOCATIONS.filter((l) => l.name !== "Shift Leadership" || person.is_leader);

  function startMove(a: Assignment) {
    setMoving(a.id);
    setToShift(a.shift_id);
    setToLoc(a.location);
  }

  async function saveMove(a: Assignment) {
    setBusy(true);
    const { error } = await supabase().rpc("admin_move_assignment", { p_assignment: a.id, p_shift: toShift, p_location: toLoc });
    setBusy(false);
    if (error) return onDone(error.message, false);
    setMoving(null);
    onDone(`${person.full_name}: duty moved to ${shiftName(byId.get(toShift)!)} at ${toLoc}.`);
  }

  async function remove(a: Assignment) {
    const sh = byId.get(a.shift_id)!;
    if (!confirm(`Remove ${person.full_name} from ${shiftName(sh)} (${a.location})?`)) return;
    const { error } = await supabase().from("assignments").delete().eq("id", a.id);
    if (error) return onDone(error.message, false);
    onDone(`${person.full_name} removed from ${shiftName(sh)}.`);
  }

  function startAdd() {
    setAdding(true);
    setAddShift(shifts.find((x) => !taken.has(x.id))?.id ?? 0);
    setAddLoc(locs.find((l) => l.name !== "Shift Leadership")?.name ?? locs[0].name);
  }

  async function saveAdd() {
    const sh = byId.get(addShift);
    if (!sh) return;
    setBusy(true);
    const { error } = await supabase().from("assignments").insert({
      shift_id: addShift, staff_id: person.id, location: addLoc,
      responsibility: addLoc === "Shift Leadership" ? "LEADER" : "AREA",
    });
    setBusy(false);
    if (error) return onDone(error.message.includes("duplicate") ? `${person.full_name} is already on that shift.` : error.message, false);
    setAdding(false);
    onDone(`${person.full_name}: duty added on ${shiftName(sh)} at ${addLoc}.`);
  }

  const free = shifts.filter((x) => !taken.has(x.id));

  return (
    <ul className="divide-y divide-carnival-teal/10 rounded-xl bg-white ring-1 ring-carnival-teal/20">
      {duties.map((a) => {
        const sh = byId.get(a.shift_id)!;
        return (
          <li key={a.id} className="px-3 py-2 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold">{shiftName(sh)}</span>
              <span className="text-carnival-ink/70">· {a.location} · {a.responsibility}</span>
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ring-1 ${STATUS_META[a.status].chip}`}>{STATUS_META[a.status].label}</span>
              {a.extra && <span className="rounded bg-carnival-gold px-1.5 py-0.5 text-[10px] font-extrabold">EXTRA</span>}
              {moving !== a.id && (
                <span className="ml-auto flex gap-1.5">
                  <button onClick={() => startMove(a)} className="rounded-lg bg-carnival-sky px-2.5 py-1 text-xs font-bold text-carnival-teal-dark hover:bg-carnival-teal/20">Move</button>
                  <button onClick={() => remove(a)} className="rounded-lg bg-rose-50 px-2.5 py-1 text-xs font-bold text-rose-700 ring-1 ring-rose-200 hover:bg-rose-100">Remove</button>
                </span>
              )}
            </div>
            {moving === a.id && (
              <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg bg-carnival-cream p-2">
                <span className="text-xs font-bold">Move to</span>
                <select value={toShift} onChange={(e) => setToShift(Number(e.target.value))} aria-label="New shift"
                  className="rounded-lg border-0 bg-white px-2 py-1.5 text-xs ring-1 ring-carnival-teal/30">
                  {shifts.map((x) => (
                    <option key={x.id} value={x.id} disabled={x.id !== a.shift_id && taken.has(x.id)}>
                      {shiftName(x)}{x.id !== a.shift_id && taken.has(x.id) ? " — already on it" : ""}
                    </option>
                  ))}
                </select>
                <select value={toLoc} onChange={(e) => setToLoc(e.target.value)} aria-label="New location"
                  className="rounded-lg border-0 bg-white px-2 py-1.5 text-xs ring-1 ring-carnival-teal/30">
                  {locs.map((l) => <option key={l.name} value={l.name}>{l.name}</option>)}
                </select>
                <button onClick={() => saveMove(a)} disabled={busy || (toShift === a.shift_id && toLoc === a.location)}
                  className="rounded-lg bg-carnival-red px-3 py-1.5 text-xs font-bold text-white hover:bg-carnival-red-dark disabled:opacity-40">
                  {busy ? "Saving…" : "Save"}
                </button>
                <button onClick={() => setMoving(null)} className="text-xs font-bold text-carnival-ink/60 hover:underline">Cancel</button>
                {toShift !== a.shift_id && <span className="w-full text-[11px] text-carnival-ink/60">Attendance for this duty resets to “Not marked”.</span>}
              </div>
            )}
          </li>
        );
      })}
      {duties.length === 0 && <li className="px-3 py-2 text-xs text-carnival-ink/60">No shifts assigned.</li>}
      <li className="px-3 py-2">
        {!adding ? (
          <button onClick={startAdd} disabled={free.length === 0}
            className="rounded-lg bg-carnival-teal/10 px-3 py-1.5 text-xs font-bold text-carnival-teal-dark hover:bg-carnival-teal/20 disabled:opacity-40">
            + Add duty{free.length === 0 ? " (already on every shift)" : ""}
          </button>
        ) : (
          <div className="flex flex-wrap items-center gap-2 rounded-lg bg-carnival-cream p-2">
            <span className="text-xs font-bold">Add duty on</span>
            <select value={addShift} onChange={(e) => setAddShift(Number(e.target.value))} aria-label="Shift for new duty"
              className="rounded-lg border-0 bg-white px-2 py-1.5 text-xs ring-1 ring-carnival-teal/30">
              {shifts.map((x) => (
                <option key={x.id} value={x.id} disabled={taken.has(x.id)}>
                  {shiftName(x)}{taken.has(x.id) ? " — already on it" : ""}
                </option>
              ))}
            </select>
            <select value={addLoc} onChange={(e) => setAddLoc(e.target.value)} aria-label="Location for new duty"
              className="rounded-lg border-0 bg-white px-2 py-1.5 text-xs ring-1 ring-carnival-teal/30">
              {locs.map((l) => <option key={l.name} value={l.name}>{l.name}</option>)}
            </select>
            <button onClick={saveAdd} disabled={busy || !addShift || taken.has(addShift)}
              className="rounded-lg bg-carnival-red px-3 py-1.5 text-xs font-bold text-white hover:bg-carnival-red-dark disabled:opacity-40">
              {busy ? "Adding…" : "Add"}
            </button>
            <button onClick={() => setAdding(false)} className="text-xs font-bold text-carnival-ink/60 hover:underline">Cancel</button>
          </div>
        )}
      </li>
    </ul>
  );
}

/** Admin: edit a staff member's details. */
function EditStaff({
  person, onCancel, onSaved, onError,
}: {
  person: Staff;
  onCancel: () => void;
  onSaved: (msg: string) => void;
  onError: (msg: string) => void;
}) {
  const [name, setName] = useState(person.full_name);
  const [uid, setUid] = useState(person.uid ?? "");
  const [email, setEmail] = useState(person.email ?? "");
  const [leader, setLeader] = useState(person.is_leader);
  const [dates, setDates] = useState<string[]>(person.available_dates);
  const [busy, setBusy] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (name.trim().length < 3) return onError("Enter the full name.");
    setBusy(true);
    const { error } = await supabase().from("staff").update({
      full_name: name.trim(),
      uid: uid.trim() ? uid.trim().toUpperCase() : null,
      email: email.trim() ? email.trim().toLowerCase() : null,
      is_leader: leader,
      available_dates: [...dates].sort(),
    }).eq("id", person.id);
    setBusy(false);
    if (error) {
      const m = error.message;
      return onError(
        m.includes("staff_uid_norm_uniq") ? `UID ${uid} already belongs to another staff member.`
        : m.includes("staff_email_uniq") ? `Email ${email} already belongs to another staff member.`
        : m.includes("staff_full_name_key") ? `Another staff member is already called "${name.trim()}".`
        : m,
      );
    }
    onSaved(`${name.trim()}'s details updated.`);
  }

  return (
    <form onSubmit={save} className="mb-3 space-y-3 rounded-xl bg-white p-3 ring-2 ring-carnival-gold">
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block text-xs font-semibold">Full name<input required minLength={3} value={name} onChange={(e) => setName(e.target.value)} className={field} /></label>
        <label className="block text-xs font-semibold">UID<input value={uid} onChange={(e) => setUid(e.target.value)} placeholder="U3450" className={field} /></label>
        <label className="block text-xs font-semibold">Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="u3450@bml.com.mv" className={field} /></label>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold">Available days</span>
        {EVENT_DATES.map((d) => {
          const on = dates.includes(d);
          return (
            <button type="button" key={d} onClick={() => setDates((p) => (on ? p.filter((x) => x !== d) : [...p, d]))} aria-pressed={on}
              className={`rounded-lg px-2.5 py-1 text-xs font-bold ring-1 ${on ? "bg-carnival-teal text-white ring-carnival-teal" : "bg-white ring-carnival-teal/30"}`}>
              {fmtDate(d)}
            </button>
          );
        })}
        <label className="ml-2 flex items-center gap-2 text-xs font-semibold">
          <input type="checkbox" checked={leader} onChange={(e) => setLeader(e.target.checked)} className="size-4 accent-carnival-red" />
          Shift leader
        </label>
      </div>
      <p className="text-[11px] text-carnival-ink/60">Changing available days doesn&apos;t move existing duties — use Move / Remove / + Add duty below, or Auto-assign.</p>
      <div className="flex gap-2">
        <button disabled={busy} className="rounded-lg bg-carnival-red px-4 py-1.5 text-xs font-bold text-white hover:bg-carnival-red-dark disabled:opacity-50">
          {busy ? "Saving…" : "Save details"}
        </button>
        <button type="button" onClick={onCancel} className="text-xs font-bold text-carnival-ink/60 hover:underline">Cancel</button>
      </div>
    </form>
  );
}
