"use client";

import { useState } from "react";
import { useAdmin } from "@/components/AdminShell";
import { ErrorBox, Heading, Panel } from "@/components/ui";
import { supabase } from "@/lib/supabase/client";

interface Result {
  attendance: number;
  draws: number;
  staff_removed: number;
  staff: number;
  assignments: number;
}

export default function ResetPage() {
  const { role, assignments, draws, staff, reload } = useAdmin();
  const [attendance, setAttendance] = useState(true);
  const [drawsOpt, setDrawsOpt] = useState(true);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState<"activity" | "full" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  if (role !== "admin") return <ErrorBox message="Only admins can reset data." />;

  const marked = assignments.filter((a) => a.status !== "pending").length;
  const newStaff = staff.filter((s) => s.source !== "roster").length;

  async function run(mode: "activity" | "full") {
    if (mode === "full" && typed.trim().toUpperCase() !== "RESET") return;
    if (mode === "activity" && !confirm("Clear the selected test activity? This cannot be undone.")) return;
    setBusy(mode);
    setError(null);
    setDone(null);
    const { data, error } = await supabase().rpc("admin_reset", {
      p_mode: mode,
      p_attendance: attendance,
      p_confirmations: false,
      p_draws: drawsOpt,
    });
    setBusy(null);
    if (error) return setError(error.message);
    const r = data as Result;
    setTyped("");
    setDone(
      mode === "full"
        ? `Back to the original roster: ${r.staff} staff, ${r.assignments} duties. Removed ${r.staff_removed} added staff and ${r.draws} draw(s); all attendance cleared.`
        : `Cleared ${r.attendance} attendance mark(s) and ${r.draws} draw(s).`,
    );
    await reload();
  }

  const check = "size-4 accent-carnival-red";

  return (
    <div className="max-w-3xl space-y-4">
      <Heading>Reset test data</Heading>
      <div className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900 ring-1 ring-amber-200">
        ⚠️ Use this only for testing before the event. Resets are permanent and affect every device straight away.
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Count label="Attendance marked" value={marked} />
        <Count label="Draws" value={draws.length} />
        <Count label="Added / joined staff" value={newStaff} />
      </div>

      {error && <ErrorBox message={error} />}
      {done && <div className="rounded-xl bg-emerald-50 p-3 text-sm font-semibold text-emerald-800 ring-1 ring-emerald-200">✓ {done}</div>}

      <Panel className="p-5">
        <h2 className="text-lg font-extrabold">1. Clear test activity</h2>
        <p className="text-sm text-carnival-ink/70">Keeps all staff and their duties. Clears only what you tick.</p>
        <div className="mt-3 space-y-2 text-sm font-semibold">
          <label className="flex items-center gap-2"><input type="checkbox" className={check} checked={attendance} onChange={(e) => setAttendance(e.target.checked)} />Attendance marks (back to “Not marked”)</label>
          <label className="flex items-center gap-2"><input type="checkbox" className={check} checked={drawsOpt} onChange={(e) => setDrawsOpt(e.target.checked)} />Lucky draw results (including voided)</label>
        </div>
        <button onClick={() => run("activity")} disabled={busy !== null || !(attendance || drawsOpt)}
          className="mt-4 rounded-xl bg-carnival-teal px-5 py-2.5 font-bold text-white hover:bg-carnival-teal-dark disabled:opacity-50">
          {busy === "activity" ? "Clearing…" : "Clear selected"}
        </button>
      </Panel>

      <Panel className="p-5 ring-2 ring-rose-200">
        <h2 className="text-lg font-extrabold text-rose-700">2. Full reset to the original roster</h2>
        <p className="text-sm text-carnival-ink/70">
          Restores the spreadsheet roster exactly (83 staff, 576 duties): removes every added or joined staff member,
          restores anyone removed or edited, and clears all attendance and draws. Console users are kept.
        </p>
        <label className="mt-3 block text-sm font-semibold">
          Type <b>RESET</b> to confirm
          <input value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off"
            className="mt-1 block w-full max-w-xs rounded-xl border-0 bg-white px-3 py-2 ring-1 ring-rose-300 focus:ring-2 focus:ring-rose-500 focus:outline-none" />
        </label>
        <button onClick={() => run("full")} disabled={busy !== null || typed.trim().toUpperCase() !== "RESET"}
          className="mt-3 rounded-xl bg-rose-600 px-5 py-2.5 font-bold text-white hover:bg-rose-700 disabled:opacity-40">
          {busy === "full" ? "Resetting…" : "Reset everything"}
        </button>
      </Panel>
    </div>
  );
}

function Count({ label, value }: { label: string; value: number }) {
  return (
    <Panel className="p-3">
      <div className="text-xs font-bold uppercase tracking-wide text-carnival-teal-dark">{label}</div>
      <div className="font-display text-2xl text-carnival-red tabular-nums">{value}</div>
    </Panel>
  );
}
