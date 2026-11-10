"use client";

import { useCallback, useEffect, useState } from "react";
import { useAdmin } from "@/components/AdminShell";
import { ErrorBox, Heading, Panel } from "@/components/ui";
import { supabase } from "@/lib/supabase/client";
import { LOCATIONS, fmtDate, fmtTime, type Assignment, type Shift } from "@/lib/roster";

interface Pair { shift_id: number; location: string; email: string }

interface AppUser {
  email: string;
  role: "admin" | "leader";
  areas: string[];
  shift_ids: number[];
  display_name: string | null;
  phone: string | null;
  staff_id: string | null;
  follow_roster: boolean;
  created_at: string;
}

export default function Users() {
  const { role, email: me, shifts, staff, assignments, reload } = useAdmin();
  const [users, setUsers] = useState<AppUser[]>([]);
  const [email, setEmail] = useState("");
  const [newRole, setNewRole] = useState<"leader" | "admin">("leader");
  const [error, setError] = useState<string | null>(null);
  const [pairs, setPairs] = useState<Pair[]>([]);

  const load = useCallback(async () => {
    const db = supabase();
    const [u, p] = await Promise.all([
      db.from("app_users").select("*").order("role").order("email"),
      db.from("area_leaders").select("shift_id, location, email"),
    ]);
    const err = u.error ?? p.error;
    if (err) return setError(err.message);
    setUsers(u.data as AppUser[]);
    setPairs(p.data as Pair[]);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch
    load();
  }, [load]);

  const pairsOf = (e: string) => pairs.filter((p) => p.email === e).length;

  async function addPair(p: Pair) {
    setPairs((list) => [...list, p]);
    const { error } = await supabase().from("area_leaders").insert(p);
    if (error) { setError(error.message); load(); }
    reload(); // the leader may have been added to that shift's roster
  }
  async function removePair(p: Pair) {
    setPairs((list) => list.filter((x) => !(x.shift_id === p.shift_id && x.location === p.location && x.email === p.email)));
    const { error } = await supabase().from("area_leaders").delete()
      .eq("shift_id", p.shift_id).eq("location", p.location).eq("email", p.email);
    if (error) { setError(error.message); load(); }
    reload();
  }

  if (role !== "admin") return <ErrorBox message="Only admins can manage users." />;

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const { error } = await supabase().from("app_users").upsert({ email: email.trim().toLowerCase(), role: newRole });
    if (error) return setError(error.message);
    setEmail("");
    setError(null);
    load();
  }

  async function saveLink(u: AppUser, patch: { staff_id?: string | null; follow_roster?: boolean }) {
    const next = { ...patch };
    if (patch.staff_id === null) next.follow_roster = false;
    setUsers((list) => list.map((x) => (x.email === u.email ? { ...x, ...next } : x)));
    const { error } = await supabase().from("app_users").update(next).eq("email", u.email);
    if (error) {
      setError(error.message);
      load();
    }
  }

  async function saveContact(u: AppUser, patch: { display_name?: string | null; phone?: string | null }) {
    setUsers((list) => list.map((x) => (x.email === u.email ? { ...x, ...patch } : x)));
    const { error } = await supabase().from("app_users").update(patch).eq("email", u.email);
    if (error) {
      setError(error.message);
      load();
    }
  }

  async function remove(u: AppUser) {
    if (!confirm(`Remove console access for ${u.email}?`)) return;
    const { error } = await supabase().from("app_users").delete().eq("email", u.email);
    if (error) setError(error.message);
    else load();
  }

  return (
    <div className="space-y-4">
      <div className="max-w-2xl space-y-4">
      <Heading>Console users</Heading>
      <Panel className="p-4 text-sm">
        <p>
          <b>Leaders</b> mark attendance and can add staff to extra shifts. Use <b>Area leaders per shift</b> below to pick
          who leads each area on each shift — a leader can have a different area on every shift, and then only sees and
          manages that area on that shift. Staff see that leader as “Report to” on My duty. <b>Admins</b> see everything,
          run lucky draws, change duties and manage users.
        </p>
        <p className="mt-2 text-carnival-ink/70">
          Each person also needs a login: in Supabase go to <i>Authentication → Users → Add user</i> and create the same email with a password.
        </p>
      </Panel>

      <Panel className="p-4">
        <form onSubmit={add} className="flex flex-wrap gap-2">
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@bml.com.mv"
            className="min-w-0 flex-1 rounded-xl border-0 bg-white px-3 py-2 ring-1 ring-carnival-teal/30 focus:ring-2 focus:ring-carnival-teal focus:outline-none" />
          <select value={newRole} onChange={(e) => setNewRole(e.target.value as "leader" | "admin")}
            className="rounded-xl border-0 bg-white px-3 py-2 ring-1 ring-carnival-teal/30">
            <option value="leader">Leader</option>
            <option value="admin">Admin</option>
          </select>
          <button className="rounded-xl bg-carnival-red px-4 py-2 font-bold text-white hover:bg-carnival-red-dark">Add</button>
        </form>
      </Panel>
      {error && <ErrorBox message={error} />}

      <Panel className="divide-y divide-carnival-teal/10">
        {users.map((u) => (
          <div key={u.email} className="px-4 py-2.5">
            <div className="flex items-center justify-between gap-2">
              <div>
                <div className="font-semibold">{u.email}</div>
                <div className={`text-xs font-bold uppercase ${u.role === "admin" ? "text-carnival-red" : "text-carnival-teal-dark"}`}>
                  {u.role}
                  {u.role === "leader" && (
                    <span className="ml-1 font-semibold normal-case text-carnival-ink/60">
                      · {pairsOf(u.email) ? `${pairsOf(u.email)} shift-area${pairsOf(u.email) === 1 ? "" : "s"} below` : "no areas yet — sees everything"}
                    </span>
                  )}
                </div>
              </div>
              {u.email !== me && (
                <button onClick={() => remove(u)} className="text-xs font-bold text-rose-700 hover:underline">Remove</button>
              )}
            </div>
            {u.role === "leader" && (
              <div className="mt-2 flex flex-wrap items-end gap-3">
                <label className="min-w-0 flex-1 text-xs font-semibold">
                  Staff record (links this login to the roster)
                  <select value={u.staff_id ?? ""} onChange={(e) => saveLink(u, { staff_id: e.target.value || null, ...(e.target.value ? { follow_roster: true } : {}) })}
                    className={`mt-1 w-full rounded-lg border-0 bg-white px-2.5 py-1.5 text-sm ring-1 ${u.staff_id ? "ring-carnival-teal/30" : "ring-amber-400"}`}>
                    <option value="">— Not linked —</option>
                    {[...staff].sort((a, b) => a.full_name.localeCompare(b.full_name)).map((p) => (
                      <option key={p.id} value={p.id}>{p.full_name}{p.uid ? ` (${p.uid})` : ""}{p.is_leader ? " · leader" : ""}</option>
                    ))}
                  </select>
                </label>
              </div>
            )}
            {u.role === "leader" && (
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <label className="text-xs font-semibold">
                  Name shown to staff (“Report to”)
                  <input defaultValue={u.display_name ?? ""} placeholder={staff.find((p) => p.id === u.staff_id)?.full_name ?? "e.g. Aishath Jeeza"}
                    onBlur={(e) => { const v = e.target.value.trim() || null; if (v !== (u.display_name ?? null)) saveContact(u, { display_name: v }); }}
                    className="mt-1 w-full rounded-lg border-0 bg-white px-2.5 py-1.5 text-sm ring-1 ring-carnival-teal/30 focus:ring-2 focus:ring-carnival-teal focus:outline-none" />
                </label>
                <label className="text-xs font-semibold">
                  Phone (optional, shown to their staff)
                  <input defaultValue={u.phone ?? ""} placeholder="e.g. 7771234" inputMode="tel"
                    onBlur={(e) => { const v = e.target.value.trim() || null; if (v !== (u.phone ?? null)) saveContact(u, { phone: v }); }}
                    className="mt-1 w-full rounded-lg border-0 bg-white px-2.5 py-1.5 text-sm ring-1 ring-carnival-teal/30 focus:ring-2 focus:ring-carnival-teal focus:outline-none" />
                </label>
              </div>
            )}
          </div>
        ))}
      </Panel>
      </div>

      <AreaLeaders
        shifts={shifts}
        assignments={assignments}
        pairs={pairs}
        onAdd={addPair}
        onRemove={removePair}
        leaders={users
          .filter((u) => u.role === "leader")
          .map((u) => ({
            email: u.email,
            name: u.display_name?.trim() || staff.find((p) => p.id === u.staff_id)?.full_name || null,
            staffId: u.staff_id,
          }))}
      />
    </div>
  );
}

/** Editor: which leader(s) lead each area on each shift. Staff see them as "Report to"; gaps in red. */
function AreaLeaders({
  shifts, assignments, pairs, leaders, onAdd, onRemove,
}: {
  shifts: Shift[];
  assignments: Assignment[];
  pairs: Pair[];
  leaders: { email: string; name: string | null; staffId: string | null }[];
  onAdd: (p: Pair) => void;
  onRemove: (p: Pair) => void;
}) {
  const label = (e: string) => leaders.find((l) => l.email === e)?.name ?? e.split("@")[0];
  // shifts each leader is rostered on (hint when picking)
  const onRoster = new Set(
    assignments.flatMap((a) => leaders.filter((l) => l.staffId === a.staff_id).map((l) => `${l.email}|${a.shift_id}`)),
  );
  let gaps = 0;
  const rows = shifts.map((sh) => ({
    sh,
    cells: LOCATIONS.map((l) => {
      const staffCount = assignments.filter((a) => a.shift_id === sh.id && a.location === l.name).length;
      const here = pairs.filter((p) => p.shift_id === sh.id && p.location === l.name);
      const gap = l.name !== "Shift Leadership" && staffCount > 0 && here.length === 0;
      if (gap) gaps++;
      return { loc: l.name, staffCount, here, gap };
    }),
  }));
  return (
    <Panel className="overflow-x-auto p-4">
      <h2 className="font-extrabold">Area leaders per shift</h2>
      <p className="text-xs text-carnival-ink/70">
        Pick the leader for each area on each shift (★ = rostered on that shift). They only see that area on that shift, and
        staff there see them as “Report to”.{" "}
        {gaps ? <b className="text-rose-700">{gaps} gap{gaps === 1 ? "" : "s"} still need a leader.</b> : <b className="text-emerald-700">Every area is covered.</b>}
      </p>
      <table className="mt-2 w-full min-w-[820px] text-xs">
        <thead>
          <tr className="text-left text-carnival-ink/60">
            <th className="py-1 pr-2">Shift</th>
            {LOCATIONS.map((l) => <th key={l.name} className="px-1 py-1">{l.name}</th>)}
          </tr>
        </thead>
        <tbody className="divide-y divide-carnival-teal/10">
          {rows.map(({ sh, cells }) => (
            <tr key={sh.id} className="align-top">
              <td className="whitespace-nowrap py-1.5 pr-2 font-bold">
                {fmtDate(sh.shift_date, { day: "numeric", month: "short" })} S{sh.shift_no}
                <div className="font-normal text-carnival-ink/50">{fmtTime(sh.starts_at)}–{fmtTime(sh.ends_at)}</div>
              </td>
              {cells.map((c) => (
                <td key={c.loc} className={`px-1 py-1.5 ${c.gap ? "bg-rose-50" : ""}`}>
                  <div className="text-[10px] text-carnival-ink/50">{c.staffCount} staff</div>
                  <div className="flex flex-wrap gap-1">
                    {c.here.map((p) => (
                      <span key={p.email} className="inline-flex items-center gap-1 rounded-full bg-carnival-teal px-2 py-0.5 font-bold text-white">
                        {label(p.email)}
                        <button onClick={() => onRemove(p)} aria-label={`Remove ${label(p.email)} from ${c.loc}`} className="hover:text-carnival-gold">✕</button>
                      </span>
                    ))}
                  </div>
                  <select value="" onChange={(e) => e.target.value && onAdd({ shift_id: sh.id, location: c.loc, email: e.target.value })}
                    aria-label={`Add leader to ${c.loc}, ${sh.shift_date} shift ${sh.shift_no}`}
                    className={`mt-1 w-full rounded-md border-0 bg-white px-1 py-0.5 text-[11px] ring-1 ${c.gap ? "ring-rose-400" : "ring-carnival-teal/30"}`}>
                    <option value="">{c.gap ? "— no leader —" : "+ add"}</option>
                    {leaders
                      .filter((l) => !c.here.some((p) => p.email === l.email))
                      .sort((a, b) => Number(onRoster.has(`${b.email}|${sh.id}`)) - Number(onRoster.has(`${a.email}|${sh.id}`)) || label(a.email).localeCompare(label(b.email)))
                      .map((l) => (
                        <option key={l.email} value={l.email}>{onRoster.has(`${l.email}|${sh.id}`) ? "★ " : ""}{label(l.email)}</option>
                      ))}
                  </select>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </Panel>
  );
}
