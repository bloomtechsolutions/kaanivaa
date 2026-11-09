import Image from "next/image";
import Link from "next/link";
import { PublicHeader } from "@/components/ui";

const DAYS = [
  { d: "Wed", n: "11" },
  { d: "Thu", n: "12" },
  { d: "Fri", n: "13" },
  { d: "Sat", n: "14" },
];

export default function Home() {
  return (
    <>
      <PublicHeader />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 pb-16">
        <section className="flex flex-col items-center text-center">
          <Image src="/kaanivaa-logo.png" alt="Kaanivaa 44" width={676} height={321} priority className="h-auto w-full max-w-xl" />
          <p className="mt-2 text-lg font-semibold text-carnival-teal-dark">Staff duty roster · 11–14 November 2026</p>
          <div className="mt-4 flex gap-2">
            {DAYS.map((x) => (
              <div key={x.n} className="w-16 rounded-xl bg-white/90 py-2 shadow-sm ring-1 ring-carnival-red/20">
                <div className="text-xs font-bold uppercase text-carnival-red">{x.d}</div>
                <div className="font-display text-2xl">{x.n}</div>
              </div>
            ))}
          </div>
          <p className="mt-3 text-sm text-carnival-ink/80">Shifts: 16:00–18:00 · 20:00–22:00 · 22:00–00:00</p>
        </section>

        <section className="mt-8 grid gap-4 sm:grid-cols-2">
          <Link href="/me" className="group rounded-2xl bg-carnival-red p-6 text-white shadow-lg transition hover:-translate-y-0.5 hover:bg-carnival-red-dark">
            <div className="font-display text-2xl">Find my duty</div>
            <p className="mt-1 text-white/90">Enter your staff UID or BML email to see your shifts, locations and lucky draw entries.</p>
            <span className="mt-4 inline-block font-bold group-hover:underline">Check now →</span>
          </Link>
          <Link href="/winners" className="group rounded-2xl bg-carnival-teal p-6 text-white shadow-lg transition hover:-translate-y-0.5 hover:bg-carnival-teal-dark">
            <div className="font-display text-2xl">Lucky draw winners</div>
            <p className="mt-1 text-white/90">Daily MVR 2,000 Swipe wallet winners and the grand iPhone 18 Pro winner.</p>
            <span className="mt-4 inline-block font-bold group-hover:underline">See winners →</span>
          </Link>
        </section>

        <section className="mt-8">
          <Image src="/good-news.png" alt="Good news! Everyone who takes part in the Kaanivaa will be entered into a lucky draw. One lucky staff member will win an iPhone 18 Pro, plus a daily lucky draw of MVR 2,000 straight to your Swipe wallet." width={832} height={409} className="mx-auto h-auto w-full max-w-3xl" />
          <p className="mx-auto mt-2 max-w-3xl text-center text-sm text-carnival-ink/70">
            You are entered once your attendance is marked <b>present</b> by your shift leader. Attend any shift for the grand draw; attend on a day for that day&apos;s draw.
          </p>
        </section>
      </main>
    </>
  );
}
