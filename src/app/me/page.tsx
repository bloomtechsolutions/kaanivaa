"use client";

import { useCallback, useEffect, useState } from "react";
import { ErrorBox, Heading, Panel, PublicHeader } from "@/components/ui";
import { supabase } from "@/lib/supabase/client";
import { ATTENDED, STATUS_META, fmtDate, fmtTime, type Status } from "@/lib/roster";

interface Row {
  full_name: string;
  assignment_id: string | null;
  shift_date: string | null;
  shift_no: number | null;
  starts_at: string | null;
  ends_at: string | null;
  location: string | null;
  responsibility: string | null;
  status: Status | null;
  confirmed_at: string | null;
}

export default function MyDuty() {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null);

  const lookup = useCallback(async (query: string) => {
    setBusy(true);
    setError(null);
    const { data, error } = await supabase().rpc("lookup_my_duty", { q: query });
    setBusy(false);
    if (error) return setError(error.message);
    setRows(data as Row[]);
  }, []);

  // Support links like /me?q=U3450 (e.g. right after joining)
  useEffect(() => {
    const fromUrl = new URLSearchParams(window.location.search).get("q");
    if (fromUrl) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reads the URL once on mount
      setQ(fromUrl);
      lookup(fromUrl);
    }
  }, [lookup]);

  async function confirm(ids: string[] | null) {
    setConfirming(ids ? ids[0] : "all");
    const { error } = await supabase().rpc("confirm_my_duty", { q, p_assignment_ids: ids });
    setConfirming(null);
    if (error) return setError(error.message);
    await lookup(q);
  }

  const shifts = rows?.filter((r) => r.shift_date) ?? [];
  const byDate = Map.groupBy(shifts, (r) => r.shift_date!);
  const attendedDays = [...byDate].filter(([, rs]) => rs.some((r) => ATTENDED.includes(r.status!))).map(([d]) => d);
  const unconfirmed = shifts.filter((r) => !r.confirmed_at);

  return (
    <>
      <PublicHeader />
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 pb-16">
        <Heading>Find my duty</Heading>
        <form onSubmit={(e) => { e.preventDefault(); lookup(q); }} className="mt-4 flex gap-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Staff UID (e.g. U3450) or BML email"
            autoComplete="email"
            className="min-w-0 flex-1 rounded-xl border-0 bg-white px-4 py-3 shadow-sm ring-1 ring-carnival-teal/30 focus:ring-2 focus:ring-carnival-teal focus:outline-none"
          />
          <button disabled={busy || q.trim().length < 3} className="rounded-xl bg-carnival-red px-5 py-3 font-bold text-white disabled:opacity-50">
            {busy ? "…" : "Search"}
          </button>
        </form>

        <div className="mt-6 space-y-4">
          {error && <ErrorBox message={error} />}
          {rows && rows.length === 0 && (
            <ErrorBox message="We couldn't find you. Check your UID/email, or join as a volunteer from the Join page." />
          )}
          {rows && rows.length > 0 && (
            <>
              <Panel className="p-5">
                <div className="text-sm text-carnival-ink/70">Hello,</div>
                <div className="font-display text-2xl text-carnival-teal-dark">{rows[0].full_name}</div>
                <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                  <Stat label="Shifts" value={shifts.length} />
                  <Stat label="Confirmed" value={shifts.length - unconfirmed.length} />
                  <Stat label="Draw entries" value={attendedDays.length > 0 ? attendedDays.length + 1 : 0} />
                </div>
                <p className="mt-3 text-sm text-carnival-ink/70">
                  {attendedDays.length > 0
                    ? `You're in the grand iPhone 18 Pro draw and the daily draw for ${attendedDays.map((d) => fmtDate(d, { day: "numeric", month: "short" })).join(", ")}.`
                    : "Once your shift leader marks you present, you're entered into the lucky draws."}
                </p>
                {shifts.length > 0 && (
                  unconfirmed.length > 0 ? (
                    <button onClick={() => confirm(null)} disabled={confirming !== null}
                      className="mt-4 w-full rounded-xl bg-carnival-red py-3 font-bold text-white shadow hover:bg-carnival-red-dark disabled:opacity-50">
                      {confirming === "all" ? "Confirming…" : `✓ I confirm all ${unconfirmed.length} duties`}
                    </button>
                  ) : (
                    <div className="mt-4 rounded-xl bg-emerald-50 py-3 text-center font-bold text-emerald-800 ring-1 ring-emerald-200">
                      ✓ All your duties are confirmed — thank you!
                    </div>
                  )
                )}
              </Panel>

              {[...byDate].map(([date, list]) => (
                <Panel key={date} className="overflow-hidden">
                  <div className="bg-carnival-teal px-5 py-2 font-bold text-white">{fmtDate(date, { weekday: "long", day: "numeric", month: "long" })}</div>
                  <ul className="divide-y divide-carnival-teal/10">
                    {list.map((r) => (
                      <li key={r.assignment_id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                        <div>
                          <div className="font-bold">
                            Shift {r.shift_no} · {fmtTime(r.starts_at!)}–{fmtTime(r.ends_at!)}
                          </div>
                          <div className="text-sm text-carnival-ink/70">
                            {r.location} · {r.responsibility}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {r.status !== "pending" && (
                            <span className={`rounded-full px-2.5 py-1 text-xs font-bold ring-1 ${STATUS_META[r.status!].chip}`}>
                              {STATUS_META[r.status!].label}
                            </span>
                          )}
                          {r.confirmed_at ? (
                            <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700 ring-1 ring-emerald-200">✓ Confirmed</span>
                          ) : (
                            <button onClick={() => confirm([r.assignment_id!])} disabled={confirming !== null}
                              className="rounded-full bg-carnival-gold px-3 py-1 text-xs font-extrabold hover:brightness-95 disabled:opacity-50">
                              {confirming === r.assignment_id ? "…" : "Confirm"}
                            </button>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                </Panel>
              ))}
            </>
          )}
        </div>
      </main>
    </>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-carnival-cream py-2">
      <div className="font-display text-2xl text-carnival-red">{value}</div>
      <div className="text-xs font-semibold uppercase tracking-wide text-carnival-ink/70">{label}</div>
    </div>
  );
}
