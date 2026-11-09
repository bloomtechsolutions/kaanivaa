"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "./supabase/client";
import type { Assignment, Draw, Shift, Staff, Status } from "./roster";

export interface RosterData {
  staff: Staff[];
  shifts: Shift[];
  assignments: Assignment[];
  draws: Draw[];
  staffById: Map<string, Staff>;
  shiftById: Map<number, Shift>;
  dates: string[];
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
  setStatus: (ids: string[], status: Status) => Promise<string | null>;
}

/** Loads the full roster (it is small: ~600 rows) and keeps it live via Supabase Realtime. */
export function useRoster(): RosterData {
  const [staff, setStaff] = useState<Staff[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [draws, setDraws] = useState<Draw[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const db = supabase();
    const [st, sh, as, dr] = await Promise.all([
      db.from("staff").select("*").order("full_name"),
      db.from("shifts").select("*").order("shift_date").order("shift_no"),
      db.from("assignments").select("*").range(0, 4999),
      db.from("draws").select("*").order("drawn_at"),
    ]);
    const err = st.error ?? sh.error ?? as.error ?? dr.error;
    setError(err ? err.message : null);
    if (!err) {
      setStaff(st.data as Staff[]);
      setShifts(sh.data as Shift[]);
      setAssignments(as.data as Assignment[]);
      setDraws(dr.data as Draw[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch
    reload();
    const db = supabase();
    const channel = db
      .channel("roster-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "assignments" }, (payload) => {
        if (payload.eventType === "DELETE") {
          const oldId = (payload.old as { id: string }).id;
          setAssignments((prev) => prev.filter((a) => a.id !== oldId));
          return;
        }
        const row = payload.new as Assignment;
        setAssignments((prev) => {
          const i = prev.findIndex((a) => a.id === row.id);
          if (i === -1) return [...prev, row];
          const next = prev.slice();
          next[i] = row;
          return next;
        });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "staff" }, () => {
        db.from("staff").select("*").order("full_name").then(({ data }) => data && setStaff(data as Staff[]));
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "draws" }, () => {
        db.from("draws").select("*").order("drawn_at").then(({ data }) => data && setDraws(data as Draw[]));
      })
      .subscribe();
    return () => {
      db.removeChannel(channel);
    };
  }, [reload]);

  const setStatus = useCallback(async (ids: string[], status: Status) => {
    if (ids.length === 0) return null;
    const set = new Set(ids);
    setAssignments((prev) => prev.map((a) => (set.has(a.id) ? { ...a, status } : a)));
    const { data, error } = await supabase().from("assignments").update({ status }).in("id", ids).select();
    if (error) {
      await reload();
      return error.message;
    }
    const byId = new Map((data as Assignment[]).map((a) => [a.id, a]));
    setAssignments((prev) => prev.map((a) => byId.get(a.id) ?? a));
    return null;
  }, [reload]);

  const staffById = useMemo(() => new Map(staff.map((s) => [s.id, s])), [staff]);
  const shiftById = useMemo(() => new Map(shifts.map((s) => [s.id, s])), [shifts]);
  const dates = useMemo(() => [...new Set(shifts.map((s) => s.shift_date))], [shifts]);

  return { staff, shifts, assignments, draws, staffById, shiftById, dates, loading, error, reload, setStatus };
}

export function useRole() {
  const [role, setRole] = useState<"admin" | "leader" | null | undefined>(undefined);
  const [email, setEmail] = useState<string | null>(null);
  useEffect(() => {
    const db = supabase();
    db.auth.getUser().then(async ({ data }) => {
      const e = data.user?.email?.toLowerCase() ?? null;
      setEmail(e);
      if (!e) return setRole(null);
      const { data: row } = await db.from("app_users").select("role").eq("email", e).maybeSingle();
      setRole((row?.role as "admin" | "leader" | undefined) ?? null);
    });
  }, []);
  return { role, email };
}
