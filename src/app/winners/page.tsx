"use client";

import { useEffect, useState } from "react";
import { ErrorBox, Heading, Marquee, PublicHeader, Spinner } from "@/components/ui";
import { supabase } from "@/lib/supabase/client";
import { fmtDate } from "@/lib/roster";

interface Winner {
  kind: "daily" | "grand";
  draw_date: string | null;
  prize: string;
  full_name: string;
  drawn_at: string;
}

const EVENT_DATES = ["2026-11-11", "2026-11-12", "2026-11-13", "2026-11-14"];

export default function Winners() {
  const [winners, setWinners] = useState<Winner[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase()
      .rpc("public_winners")
      .then(({ data, error }) => {
        if (error) setError(error.message);
        else setWinners(data as Winner[]);
      });
  }, []);

  const grand = winners?.find((w) => w.kind === "grand");

  return (
    <>
      <PublicHeader />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 pb-16">
        <Heading className="text-center">Lucky Draw Winners</Heading>
        {error && <div className="mt-4"><ErrorBox message={error} /></div>}
        {!winners && !error && <Spinner />}
        {winners && (
          <div className="mt-6 space-y-6">
            <Marquee>
              <div className="text-center">
                <div className="text-sm font-bold uppercase tracking-widest text-carnival-teal-dark">Grand prize · iPhone 18 Pro</div>
                <div className={`mt-2 font-display text-3xl sm:text-4xl ${grand ? "text-carnival-red pop-in" : "text-carnival-ink/40"}`}>
                  {grand ? grand.full_name : "To be drawn"}
                </div>
              </div>
            </Marquee>
            <div className="grid gap-3 sm:grid-cols-2">
              {EVENT_DATES.map((d) => {
                const w = winners.find((x) => x.kind === "daily" && x.draw_date === d);
                return (
                  <div key={d} className="rounded-2xl bg-white/90 p-4 shadow-sm ring-1 ring-carnival-teal/20">
                    <div className="text-xs font-bold uppercase tracking-wide text-carnival-teal-dark">
                      {fmtDate(d, { weekday: "long", day: "numeric", month: "short" })} · MVR 2,000
                    </div>
                    <div className={`mt-1 text-xl font-extrabold ${w ? "text-carnival-red" : "text-carnival-ink/40"}`}>
                      {w ? w.full_name : "To be drawn"}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </main>
    </>
  );
}
