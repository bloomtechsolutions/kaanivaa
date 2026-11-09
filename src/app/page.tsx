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
          <div className="marquee-card mt-2 w-full max-w-md rounded-[2.5rem] px-6 pt-3 pb-5 text-center" role="img" aria-label="Kaanivaa 44">
            <div className="bulbs bulbs-animated mx-6" aria-hidden />
            <div className="mt-2 font-display text-5xl tracking-wider text-carnival-red drop-shadow-[0_2px_0_#f5b82e] sm:text-6xl">KAANIVAA</div>
            <div className="font-display text-6xl text-carnival-red drop-shadow-[0_2px_0_#f5b82e] sm:text-7xl">44</div>
            <div className="bulbs bulbs-animated mx-6 mt-2" aria-hidden />
          </div>
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

        <Link href="/join" className="mt-4 flex items-center justify-between gap-3 rounded-2xl bg-carnival-gold px-6 py-4 font-bold shadow-md transition hover:-translate-y-0.5">
          <span><span className="font-display text-xl">Want to help?</span> <span className="block text-sm font-semibold sm:inline">Join the crew — we&apos;ll assign your duties automatically.</span></span>
          <span className="whitespace-nowrap">Join →</span>
        </Link>

        <section className="mt-8">
          <div className="relative mx-auto max-w-3xl rounded-3xl border-2 border-carnival-teal/60 bg-white/90 px-6 pb-6 pt-8 shadow-sm">
            <h2 className="absolute -top-5 left-1/2 -translate-x-1/2 whitespace-nowrap bg-carnival-sky px-4 font-display text-2xl text-carnival-teal-dark sm:text-3xl">
              Good news!
            </h2>
            <div className="flex flex-col items-center gap-6 sm:flex-row">
              <div className="flex-1 space-y-2 text-lg leading-relaxed text-carnival-teal-dark">
                <p>Everyone who takes part in the Kaanivaa will be entered into a lucky draw!</p>
                <p className="uppercase">
                  One lucky staff member will win an <b className="font-extrabold">iPhone 18 Pro</b>
                </p>
                <p className="text-2xl font-bold">+</p>
                <p>A daily lucky draw of <b>MVR 2,000</b> straight to your Swipe wallet</p>
              </div>
              <div className="flex shrink-0 flex-col items-center gap-2" aria-hidden>
                <div className="flex size-28 items-center justify-center rounded-3xl bg-gradient-to-br from-[#6b1f2a] to-[#3b0d14] text-5xl shadow-lg">📱</div>
                <div className="rounded-full bg-carnival-gold px-3 py-1 text-sm font-extrabold">+ MVR 2,000 daily</div>
              </div>
            </div>
          </div>
          <p className="mx-auto mt-3 max-w-3xl text-center text-sm text-carnival-ink/70">You are entered once your attendance is marked <b>present</b> by your shift leader. Attend any shift for the grand draw; attend on a day for that day&apos;s draw.
          </p>
        </section>
      </main>
    </>
  );
}
