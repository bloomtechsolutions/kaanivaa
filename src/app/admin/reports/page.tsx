"use client";

import { useState } from "react";
import { useAdmin } from "@/components/AdminShell";
import { ErrorBox, Heading, Panel } from "@/components/ui";
import { downloadReport, type ReportKind } from "@/lib/excelReports";
import { fmtDate, todayMV } from "@/lib/roster";

const REPORTS: { kind: Exclude<ReportKind, "daily">; title: string; desc: string; icon: string }[] = [
  {
    kind: "full",
    title: "Full event report",
    icon: "📊",
    desc: "Everything in one workbook: summary & location coverage, master roster, a sheet per day, staff summary, lucky draw results with full entry lists, and the follow-up list.",
  },
  { kind: "staff", title: "Staff summary", icon: "👥", desc: "One row per staff member: availability, shifts, attendance totals, draw entries and prizes." },
  { kind: "draws", title: "Lucky draw report", icon: "🏆", desc: "All draws (including voided) with winner, entry count, who drew it and when, plus every entry list for audit." },
  { kind: "followup", title: "Follow-up list", icon: "📞", desc: "Everyone marked absent on a duty — with emails and who marked them, ready to contact." },
];

export default function Reports() {
  const { role, staff, shifts, assignments, draws, dates } = useAdmin();
  const today = todayMV();
  const [date, setDate] = useState(dates.includes(today) ? today : dates[0]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  if (role !== "admin") return <ErrorBox message="Only admins can download reports." />;

  async function go(kind: ReportKind) {
    setBusy(kind);
    setError(null);
    try {
      const file = await downloadReport(kind, { staff, shifts, assignments, draws }, date);
      setDone(file);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  const btn = "rounded-xl bg-carnival-red px-4 py-2 text-sm font-bold text-white hover:bg-carnival-red-dark disabled:opacity-50";

  return (
    <div className="max-w-4xl space-y-4">
      <div>
        <Heading>Excel reports</Heading>
        <p className="text-sm text-carnival-ink/70">Generated from live data at the moment you click — formatted .xlsx files with filters and frozen headers.</p>
      </div>
      {error && <ErrorBox message={error} />}
      {done && <div className="rounded-xl bg-emerald-50 p-3 text-sm font-semibold text-emerald-800 ring-1 ring-emerald-200">✓ Downloaded {done}</div>}

      <div className="grid gap-4 md:grid-cols-2">
        <Panel className="flex flex-col p-5 md:col-span-2">
          <div className="flex items-start gap-3">
            <span className="text-3xl" aria-hidden>📅</span>
            <div className="flex-1">
              <h2 className="text-lg font-extrabold">Daily report</h2>
              <p className="text-sm text-carnival-ink/70">One day: shift summary with location coverage, and the roster with attendance.</p>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {dates.map((d) => (
              <button key={d} onClick={() => setDate(d)} aria-pressed={date === d}
                className={`rounded-lg px-3 py-1.5 text-sm font-bold ring-1 ${date === d ? "bg-carnival-teal text-white ring-carnival-teal" : "bg-white ring-carnival-teal/30 hover:bg-carnival-sky"}`}>
                {fmtDate(d)}
              </button>
            ))}
            <button onClick={() => go("daily")} disabled={busy !== null} className={`${btn} ml-auto`}>
              {busy === "daily" ? "Preparing…" : "⬇ Download daily report"}
            </button>
          </div>
        </Panel>

        {REPORTS.map((r) => (
          <Panel key={r.kind} className={`flex flex-col p-5 ${r.kind === "full" ? "ring-2 ring-carnival-gold" : ""}`}>
            <div className="flex items-start gap-3">
              <span className="text-3xl" aria-hidden>{r.icon}</span>
              <div>
                <h2 className="text-lg font-extrabold">{r.title}</h2>
                <p className="text-sm text-carnival-ink/70">{r.desc}</p>
              </div>
            </div>
            <button onClick={() => go(r.kind)} disabled={busy !== null} className={`${btn} mt-4 self-start`}>
              {busy === r.kind ? "Preparing…" : "⬇ Download .xlsx"}
            </button>
          </Panel>
        ))}
      </div>
    </div>
  );
}
