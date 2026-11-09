import type { Workbook, Worksheet } from "exceljs";
import { ATTENDED, LOCATIONS, STATUS_META, fmtDate, fmtTime, type Assignment, type Draw, type Shift, type Staff } from "./roster";

export interface ReportData {
  staff: Staff[];
  shifts: Shift[];
  assignments: Assignment[];
  draws: Draw[];
}

export type ReportKind = "full" | "daily" | "staff" | "draws" | "followup";

const RED = "FFE3262B";
const TEAL = "FF0D9AA5";
const CREAM = "FFFFF4DC";
const STATUS_FILL: Record<string, string> = {
  present: "FFD1FAE5",
  late: "FFFEF3C7",
  absent: "FFFFE4E6",
  excused: "FFE0F2FE",
};

const mv = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("en-GB", { timeZone: "Indian/Maldives", dateStyle: "medium", timeStyle: "short" }) : "";

interface Col {
  header: string;
  width: number;
}

/** Adds a sheet with a styled title, a red header row, filters and frozen panes. */
function table(wb: Workbook, name: string, title: string, cols: Col[], rows: (string | number | null)[][], statusCol?: number): Worksheet {
  const ws = wb.addWorksheet(name, { views: [{ state: "frozen", ySplit: 3 }] });
  ws.columns = cols.map((c) => ({ width: c.width }));
  ws.mergeCells(1, 1, 1, cols.length);
  const t = ws.getCell(1, 1);
  t.value = title;
  t.font = { bold: true, size: 14, color: { argb: RED } };
  ws.getCell(2, 1).value = `Generated ${mv(new Date().toISOString())} (Maldives time)`;
  ws.getCell(2, 1).font = { italic: true, size: 9, color: { argb: "FF6B7280" } };

  const head = ws.getRow(3);
  head.values = cols.map((c) => c.header);
  head.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: RED } };
    cell.alignment = { vertical: "middle", wrapText: true };
  });
  head.height = 20;

  rows.forEach((r) => {
    const row = ws.addRow(r);
    if (statusCol !== undefined) {
      const key = String(r[statusCol] ?? "").toLowerCase().replace("not marked", "pending");
      const fill = STATUS_FILL[key];
      if (fill) row.getCell(statusCol + 1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: fill } };
    }
  });
  if (rows.length) ws.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3 + rows.length, column: cols.length } };
  return ws;
}

function makeIndex(d: ReportData) {
  const staffById = new Map(d.staff.map((s) => [s.id, s]));
  const shiftById = new Map(d.shifts.map((s) => [s.id, s]));
  const locOrder = new Map(LOCATIONS.map((l, i) => [l.name, i]));
  const sorted = d.assignments
    .map((a) => ({ a, sh: shiftById.get(a.shift_id)!, st: staffById.get(a.staff_id)! }))
    .filter((x) => x.sh && x.st)
    .sort(
      (x, y) =>
        x.sh.shift_date.localeCompare(y.sh.shift_date) ||
        x.sh.shift_no - y.sh.shift_no ||
        (locOrder.get(x.a.location) ?? 9) - (locOrder.get(y.a.location) ?? 9) ||
        x.st.full_name.localeCompare(y.st.full_name),
    );
  return { staffById, shiftById, sorted };
}

const statusLabel = (s: Assignment["status"]) => STATUS_META[s].label;

// ---------------------------------------------------------------------------- sheets

function summarySheet(wb: Workbook, d: ReportData, date?: string) {
  const shifts = d.shifts.filter((s) => !date || s.shift_date === date);
  const rows = shifts.map((s) => {
    const list = d.assignments.filter((a) => a.shift_id === s.id);
    const n = (st: string) => list.filter((a) => a.status === st).length;
    const inCount = n("present") + n("late");
    return [
      fmtDate(s.shift_date, { weekday: "short", day: "numeric", month: "short", year: "numeric" }),
      `Shift ${s.shift_no}`,
      `${fmtTime(s.starts_at)}–${fmtTime(s.ends_at)}`,
      list.length,
      list.filter((a) => a.confirmed_at).length,
      n("present"),
      n("late"),
      n("absent"),
      n("excused"),
      n("pending"),
      list.length ? Math.round((inCount / list.length) * 100) / 100 : 0,
    ];
  });
  const ws = table(
    wb,
    "Summary",
    date ? `Kaanivaa 44 — ${fmtDate(date, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}` : "Kaanivaa 44 — Event summary",
    [
      { header: "Date", width: 18 }, { header: "Shift", width: 9 }, { header: "Timing", width: 13 },
      { header: "Assigned", width: 10 }, { header: "Confirmed", width: 11 }, { header: "Present", width: 9 },
      { header: "Late", width: 7 }, { header: "Absent", width: 8 }, { header: "Excused", width: 9 },
      { header: "Not marked", width: 11 }, { header: "Turnout", width: 9 },
    ],
    rows,
  );
  ws.getColumn(11).numFmt = "0%";
  // totals row
  const total = ws.addRow([
    "TOTAL", "", "",
    ...[4, 5, 6, 7, 8, 9, 10].map((c) => rows.reduce((sum, r) => sum + Number(r[c - 1]), 0)),
  ]);
  const assigned = Number(total.getCell(4).value) || 0;
  total.getCell(11).value = assigned ? (Number(total.getCell(6).value) + Number(total.getCell(7).value)) / assigned : 0;
  total.font = { bold: true };
  total.eachCell((c) => (c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: CREAM } }));

  // location coverage under the table
  ws.addRow([]);
  const hdr = ws.addRow(["Coverage by location", "", "", ...LOCATIONS.map((l) => `${l.name} (plan ${l.target})`)]);
  hdr.font = { bold: true, color: { argb: TEAL } };
  for (const s of shifts) {
    ws.addRow([
      fmtDate(s.shift_date, { day: "numeric", month: "short" }), `Shift ${s.shift_no}`, "",
      ...LOCATIONS.map((l) => {
        const list = d.assignments.filter((a) => a.shift_id === s.id && a.location === l.name);
        return `${list.filter((a) => ATTENDED.includes(a.status)).length} in / ${list.length}`;
      }),
    ]);
  }
  [4, 5, 6, 7, 8].forEach((c) => (ws.getColumn(c).width = Math.max(ws.getColumn(c).width ?? 10, 14)));
}

function rosterSheet(wb: Workbook, d: ReportData, name: string, title: string, date?: string) {
  const { sorted } = makeIndex(d);
  const rows = sorted
    .filter((x) => !date || x.sh.shift_date === date)
    .map(({ a, sh, st }) => [
      fmtDate(sh.shift_date, { day: "numeric", month: "short", year: "numeric" }),
      `Shift ${sh.shift_no}`,
      `${fmtTime(sh.starts_at)}–${fmtTime(sh.ends_at)}`,
      a.location,
      a.responsibility,
      st.full_name,
      st.uid,
      st.email,
      a.confirmed_at ? "Yes" : "No",
      mv(a.confirmed_at),
      statusLabel(a.status),
      mv(a.marked_at),
      a.marked_by,
    ]);
  table(
    wb, name, title,
    [
      { header: "Date", width: 13 }, { header: "Shift", width: 8 }, { header: "Timing", width: 12 },
      { header: "Location", width: 17 }, { header: "Role", width: 8 }, { header: "Staff name", width: 30 },
      { header: "UID", width: 9 }, { header: "Email", width: 26 }, { header: "Confirmed", width: 10 },
      { header: "Confirmed at", width: 19 }, { header: "Attendance", width: 11 }, { header: "Marked at", width: 19 },
      { header: "Marked by", width: 24 },
    ],
    rows, 10,
  );
}

function staffSheet(wb: Workbook, d: ReportData) {
  const { shiftById } = makeIndex(d);
  const rows = [...d.staff]
    .sort((a, b) => a.full_name.localeCompare(b.full_name))
    .map((s) => {
      const mine = d.assignments.filter((a) => a.staff_id === s.id);
      const attendedDays = [...new Set(mine.filter((a) => ATTENDED.includes(a.status)).map((a) => shiftById.get(a.shift_id)?.shift_date))]
        .filter(Boolean).sort() as string[];
      const wins = d.draws.filter((w) => !w.voided && w.staff_id === s.id)
        .map((w) => (w.kind === "grand" ? "iPhone 18 Pro" : `MVR 2,000 (${fmtDate(w.draw_date!, { day: "numeric", month: "short" })})`));
      const n = (st: string) => mine.filter((a) => a.status === st).length;
      return [
        s.full_name, s.uid, s.email, s.is_leader ? "Yes" : "",
        { roster: "Roster", admin: "Added by admin", self: "Self-registered" }[s.source],
        s.available_dates.map((x) => fmtDate(x, { day: "numeric", month: "short" })).join(", "),
        mine.length, mine.filter((a) => a.confirmed_at).length, n("present"), n("late"), n("absent"), n("excused"), n("pending"),
        attendedDays.length ? attendedDays.length + 1 : 0,
        wins.join("; "),
      ];
    });
  table(
    wb, "Staff", "Kaanivaa 44 — Staff summary",
    [
      { header: "Name", width: 30 }, { header: "UID", width: 9 }, { header: "Email", width: 26 }, { header: "Leader", width: 8 },
      { header: "Source", width: 15 }, { header: "Available", width: 22 }, { header: "Shifts", width: 8 },
      { header: "Confirmed", width: 10 }, { header: "Present", width: 9 }, { header: "Late", width: 7 }, { header: "Absent", width: 8 },
      { header: "Excused", width: 9 }, { header: "Not marked", width: 11 }, { header: "Draw entries", width: 12 },
      { header: "Prizes won", width: 30 },
    ],
    rows,
  );
}

function drawsSheets(wb: Workbook, d: ReportData) {
  const { staffById } = makeIndex(d);
  const name = (id: string) => staffById.get(id)?.full_name ?? "(removed)";
  const ordered = [...d.draws].sort((a, b) => a.drawn_at.localeCompare(b.drawn_at));
  table(
    wb, "Lucky draw", "Kaanivaa 44 — Lucky draw results",
    [
      { header: "Draw", width: 16 }, { header: "Prize", width: 26 }, { header: "Winner", width: 30 }, { header: "UID", width: 9 },
      { header: "Entries", width: 9 }, { header: "Drawn at", width: 20 }, { header: "Drawn by", width: 24 },
      { header: "Status", width: 10 }, { header: "Void reason", width: 30 },
    ],
    ordered.map((w) => [
      w.kind === "grand" ? "Grand draw" : fmtDate(w.draw_date!, { day: "numeric", month: "short", year: "numeric" }),
      w.prize, name(w.staff_id), staffById.get(w.staff_id)?.uid ?? "", w.pool_size, mv(w.drawn_at), w.drawn_by,
      w.voided ? "VOIDED" : "Valid", w.void_reason,
    ]),
  );
  // full entry lists, one column per draw (audit trail)
  if (ordered.length) {
    const ws = wb.addWorksheet("Draw entries", { views: [{ state: "frozen", ySplit: 1 }] });
    ordered.forEach((w, i) => {
      const col = ws.getColumn(i + 1);
      col.width = 30;
      const label = `${w.kind === "grand" ? "Grand" : fmtDate(w.draw_date!, { day: "numeric", month: "short" })}${w.voided ? " (voided)" : ""}`;
      const entries = [...w.pool].map(name).sort((a, b) => a.localeCompare(b));
      col.values = [label, ...entries];
      const h = ws.getCell(1, i + 1);
      h.font = { bold: true, color: { argb: "FFFFFFFF" } };
      h.fill = { type: "pattern", pattern: "solid", fgColor: { argb: RED } };
      entries.forEach((e, r) => {
        if (e === name(w.staff_id)) ws.getCell(r + 2, i + 1).font = { bold: true, color: { argb: RED } };
      });
    });
  }
}

function followupSheet(wb: Workbook, d: ReportData) {
  const { sorted } = makeIndex(d);
  const rows = sorted
    .filter(({ a }) => !a.confirmed_at || a.status === "absent")
    .map(({ a, sh, st }) => [
      st.full_name, st.uid, st.email,
      fmtDate(sh.shift_date, { day: "numeric", month: "short" }), `Shift ${sh.shift_no}`, `${fmtTime(sh.starts_at)}–${fmtTime(sh.ends_at)}`,
      a.location, a.confirmed_at ? "Yes" : "No", statusLabel(a.status),
    ]);
  table(
    wb, "Follow-up", "Kaanivaa 44 — Staff to follow up (unconfirmed duties or absences)",
    [
      { header: "Name", width: 30 }, { header: "UID", width: 9 }, { header: "Email", width: 26 }, { header: "Date", width: 9 },
      { header: "Shift", width: 8 }, { header: "Timing", width: 12 }, { header: "Location", width: 17 },
      { header: "Confirmed", width: 10 }, { header: "Attendance", width: 11 },
    ],
    rows, 8,
  );
}

// ---------------------------------------------------------------------------- entry point

export async function downloadReport(kind: ReportKind, d: ReportData, date?: string) {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = "Kaanivaa 44 Staff Roster";
  wb.created = new Date();
  const stamp = new Date().toISOString().slice(0, 10);
  let file = `Kaanivaa44_${stamp}.xlsx`;

  if (kind === "full") {
    summarySheet(wb, d);
    rosterSheet(wb, d, "Master roster", "Kaanivaa 44 — Master roster & attendance");
    for (const day of [...new Set(d.shifts.map((s) => s.shift_date))]) {
      rosterSheet(wb, d, fmtDate(day, { day: "numeric", month: "short" }), `Kaanivaa 44 — ${fmtDate(day, { weekday: "long", day: "numeric", month: "long" })}`, day);
    }
    staffSheet(wb, d);
    drawsSheets(wb, d);
    followupSheet(wb, d);
    file = `Kaanivaa44_Full_Report_${stamp}.xlsx`;
  } else if (kind === "daily" && date) {
    summarySheet(wb, d, date);
    rosterSheet(wb, d, "Roster", `Kaanivaa 44 — ${fmtDate(date, { weekday: "long", day: "numeric", month: "long" })}`, date);
    file = `Kaanivaa44_${date}_Daily_Report.xlsx`;
  } else if (kind === "staff") {
    staffSheet(wb, d);
    file = `Kaanivaa44_Staff_Summary_${stamp}.xlsx`;
  } else if (kind === "draws") {
    drawsSheets(wb, d);
    if (!d.draws.length) wb.getWorksheet("Lucky draw")!.addRow(["No draws yet"]);
    file = `Kaanivaa44_Lucky_Draw_${stamp}.xlsx`;
  } else if (kind === "followup") {
    followupSheet(wb, d);
    file = `Kaanivaa44_Follow_Up_${stamp}.xlsx`;
  }

  const buf = await wb.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = file;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return file;
}
