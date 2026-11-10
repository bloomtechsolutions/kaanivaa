export type Status = "pending" | "present" | "late" | "absent" | "excused";
export type Responsibility = "LEADER" | "TENT" | "AREA";

export interface Staff {
  id: string;
  full_name: string;
  uid: string | null;
  email: string | null;
  is_leader: boolean;
  registration_status: string | null;
  available_dates: string[];
  phone: string | null;
  source: "roster" | "admin" | "self";
}

export interface Shift {
  id: number;
  shift_date: string;
  shift_no: number;
  starts_at: string;
  ends_at: string;
}

export interface Assignment {
  id: string;
  shift_id: number;
  staff_id: string;
  location: string;
  responsibility: Responsibility;
  status: Status;
  marked_at: string | null;
  marked_by: string | null;
  note: string | null;
  confirmed_at: string | null;
  /** added by a leader/admin as an extra shift */
  extra: boolean;
  added_by: string | null;
}

export interface Draw {
  id: string;
  kind: "daily" | "grand";
  draw_date: string | null;
  prize: string;
  staff_id: string;
  pool_size: number;
  /** one element per entry (a staff id repeats once per completed duty) */
  pool: string[];
  /** distinct people in the draw */
  entrants: number | null;
  drawn_at: string;
  drawn_by: string | null;
  voided: boolean;
  void_reason: string | null;
}

/** Locations in display order with their planned headcount per shift. */
export const LOCATIONS: { name: string; target: number }[] = [
  { name: "Shift Leadership", target: 3 },
  { name: "Swipe 1", target: 15 },
  { name: "Swipe 2", target: 15 },
  { name: "BML Stall", target: 10 },
  { name: "Products Showcase", target: 5 },
];

export const EVENT_DATES = ["2026-11-11", "2026-11-12", "2026-11-13", "2026-11-14"];

export const ATTENDED: Status[] = ["present", "late"];

export const STATUS_META: Record<Status, { label: string; chip: string; dot: string }> = {
  pending: { label: "Not marked", chip: "bg-slate-100 text-slate-600 ring-slate-200", dot: "bg-slate-300" },
  present: { label: "Present", chip: "bg-emerald-50 text-emerald-700 ring-emerald-200", dot: "bg-emerald-500" },
  late: { label: "Late", chip: "bg-amber-50 text-amber-700 ring-amber-200", dot: "bg-amber-500" },
  absent: { label: "Absent", chip: "bg-rose-50 text-rose-700 ring-rose-200", dot: "bg-rose-500" },
  excused: { label: "Excused", chip: "bg-sky-50 text-sky-700 ring-sky-200", dot: "bg-sky-500" },
};

export const RESP_META: Record<Responsibility, string> = {
  LEADER: "bg-carnival-red text-white",
  TENT: "bg-carnival-teal text-white",
  AREA: "bg-carnival-cream text-carnival-ink ring-1 ring-carnival-gold/60",
};

export function fmtDate(d: string, opts: Intl.DateTimeFormatOptions = { weekday: "short", day: "numeric", month: "short" }) {
  return new Date(d + "T00:00:00").toLocaleDateString("en-GB", opts);
}

export function fmtTime(t: string) {
  const [h, m] = t.split(":");
  return `${h === "24" ? "00" : h}:${m}`;
}

export function shiftLabel(s: Pick<Shift, "shift_no" | "starts_at" | "ends_at">) {
  return `Shift ${s.shift_no} · ${fmtTime(s.starts_at)}–${fmtTime(s.ends_at)}`;
}

/** Today's date in the Maldives (UTC+5) as YYYY-MM-DD. */
/** Attendance for a shift is open from 00:00 on its date until 02:00 the next morning (Maldives time). */
export function attendanceOpen(shiftDate: string, now: number) {
  const start = Date.parse(`${shiftDate}T00:00:00+05:00`);
  return now >= start && now < start + 26 * 3600_000;
}

export function todayMV() {
  return new Date(Date.now() + 5 * 3600_000).toISOString().slice(0, 10);
}
