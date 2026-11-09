"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ErrorBox, Heading, Marquee, PublicHeader } from "@/components/ui";
import { supabase } from "@/lib/supabase/client";
import { EVENT_DATES, fmtDate, todayMV } from "@/lib/roster";

const input =
  "mt-1 w-full rounded-xl border-0 bg-white px-4 py-3 ring-1 ring-carnival-teal/30 focus:ring-2 focus:ring-carnival-teal focus:outline-none";

export default function Join() {
  const [name, setName] = useState("");
  const [uid, setUid] = useState("");
  const [email, setEmail] = useState("");
  const [dates, setDates] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<number | null>(null);
  // Read the clock after mount (not during prerender)
  const [today, setToday] = useState<string | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- client clock only
    setToday(todayMV());
  }, []);
  const open = today ? EVENT_DATES.filter((d) => d >= today) : EVENT_DATES;

  function toggle(d: string) {
    setDates((p) => (p.includes(d) ? p.filter((x) => x !== d) : [...p, d].sort()));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { data, error } = await supabase().rpc("register_staff", { p_name: name, p_uid: uid, p_email: email, p_dates: dates });
    setBusy(false);
    if (error) return setError(error.message);
    setDone(data as number);
  }

  return (
    <>
      <PublicHeader />
      <main className="mx-auto w-full max-w-lg flex-1 px-4 pb-16">
        {done !== null ? (
          <Marquee>
            <div className="text-center">
              <div className="text-4xl" aria-hidden>🎪</div>
              <h1 className="mt-2 font-display text-2xl text-carnival-red">You&apos;re in, {name.split(" ")[0]}!</h1>
              <p className="mt-2">
                We&apos;ve assigned you <b>{done}</b> shift{done === 1 ? "" : "s"}. Open your duties to see your dates,
                times and locations.
              </p>
              <Link href={`/me?q=${encodeURIComponent(uid)}`}
                className="mt-5 inline-block rounded-xl bg-carnival-red px-6 py-3 font-bold text-white hover:bg-carnival-red-dark">
                See my duties →
              </Link>
            </div>
          </Marquee>
        ) : (
          <>
            <Heading>Join the Kaanivaa crew</Heading>
            <p className="mt-1 text-carnival-ink/80">
              Register as a volunteer. Your duties are assigned automatically to where help is needed most — and you&apos;re
              entered into the lucky draws for every day you attend.
            </p>
            {open.length === 0 ? (
              <div className="mt-6"><ErrorBox message="Registration is closed — the event days have passed." /></div>
            ) : (
              <form onSubmit={submit} className="mt-5 space-y-4 rounded-2xl bg-white/90 p-5 shadow-sm ring-1 ring-carnival-teal/20">
                <label className="block">
                  <span className="text-sm font-semibold">Full name</span>
                  <input required minLength={3} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" className={input} />
                </label>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block">
                    <span className="text-sm font-semibold">Staff UID</span>
                    <input required value={uid} onChange={(e) => setUid(e.target.value)} placeholder="U3450" className={input} />
                  </label>
                  <label className="block">
                    <span className="text-sm font-semibold">BML email</span>
                    <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="u3450@bml.com.mv" autoComplete="email" className={input} />
                  </label>
                </div>
                <fieldset>
                  <legend className="text-sm font-semibold">Days you can help</legend>
                  <div className="mt-1 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {EVENT_DATES.map((d) => {
                      const closed = today !== null && d < today;
                      const on = dates.includes(d);
                      return (
                        <button type="button" key={d} disabled={closed} onClick={() => toggle(d)} aria-pressed={on}
                          className={`rounded-xl px-2 py-2 text-sm font-bold ring-1 transition disabled:opacity-40 ${on ? "bg-carnival-teal text-white ring-carnival-teal" : "bg-white ring-carnival-teal/30 hover:bg-carnival-sky"}`}>
                          {fmtDate(d)}
                        </button>
                      );
                    })}
                  </div>
                </fieldset>
                {error && <ErrorBox message={error} />}
                <button disabled={busy || dates.length === 0} className="w-full rounded-xl bg-carnival-red py-3 font-bold text-white hover:bg-carnival-red-dark disabled:opacity-50">
                  {busy ? "Assigning your duties…" : "Join & get my duties"}
                </button>
                <p className="text-xs text-carnival-ink/60">Already registered? <Link href="/me" className="font-bold underline">Find my duty</Link></p>
              </form>
            )}
          </>
        )}
      </main>
    </>
  );
}
