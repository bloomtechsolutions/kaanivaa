"use client";

import { useCallback, useEffect, useState } from "react";
import { useAdmin } from "@/components/AdminShell";
import { ErrorBox, Heading, Panel } from "@/components/ui";
import { supabase } from "@/lib/supabase/client";
import { LOCATIONS } from "@/lib/roster";

interface AppUser {
  email: string;
  role: "admin" | "leader";
  areas: string[];
  created_at: string;
}

export default function Users() {
  const { role, email: me } = useAdmin();
  const [users, setUsers] = useState<AppUser[]>([]);
  const [email, setEmail] = useState("");
  const [newRole, setNewRole] = useState<"leader" | "admin">("leader");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase().from("app_users").select("*").order("role").order("email");
    if (error) setError(error.message);
    else setUsers(data as AppUser[]);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch
    load();
  }, [load]);

  if (role !== "admin") return <ErrorBox message="Only admins can manage users." />;

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const { error } = await supabase().from("app_users").upsert({ email: email.trim().toLowerCase(), role: newRole });
    if (error) return setError(error.message);
    setEmail("");
    setError(null);
    load();
  }

  async function toggleArea(u: AppUser, area: string) {
    const areas = u.areas.includes(area) ? u.areas.filter((a) => a !== area) : [...u.areas, area];
    setUsers((list) => list.map((x) => (x.email === u.email ? { ...x, areas } : x)));
    const { error } = await supabase().from("app_users").update({ areas }).eq("email", u.email);
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
    <div className="max-w-2xl space-y-4">
      <Heading>Console users</Heading>
      <Panel className="p-4 text-sm">
        <p>
          <b>Leaders</b> mark attendance and can add staff to extra shifts. Give a leader one or more <b>areas</b> and they
          will only see and manage staff in those areas (no area = all areas). <b>Admins</b> see everything, run lucky draws,
          change duties and manage users.
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
                  {u.role === "leader" && <span className="ml-1 font-semibold normal-case text-carnival-ink/60">· {u.areas.length ? u.areas.join(", ") : "all areas"}</span>}
                </div>
              </div>
              {u.email !== me && (
                <button onClick={() => remove(u)} className="text-xs font-bold text-rose-700 hover:underline">Remove</button>
              )}
            </div>
            {u.role === "leader" && (
              <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label={`Areas for ${u.email}`}>
                {LOCATIONS.map((l) => {
                  const on = u.areas.includes(l.name);
                  return (
                    <button key={l.name} onClick={() => toggleArea(u, l.name)} aria-pressed={on}
                      className={`rounded-full px-2.5 py-1 text-xs font-bold ring-1 ${on ? "bg-carnival-teal text-white ring-carnival-teal" : "bg-white ring-carnival-teal/30 hover:bg-carnival-sky"}`}>
                      {on ? "✓ " : ""}{l.name}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        ))}
      </Panel>
    </div>
  );
}
