import Image from "next/image";
import Link from "next/link";
import { PublicHeader } from "@/components/ui";
import VenueMap from "@/components/VenueMap";

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
          <Image src="/kaanivaa-logo.webp" alt="Kaanivaa 44" width={676} height={321} priority className="h-auto w-full max-w-xl" />
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

        <section className="mx-auto mt-10 max-w-3xl space-y-2 text-center text-lg leading-relaxed text-carnival-teal-dark">
          <h2 className="font-display text-2xl sm:text-3xl">Good news!</h2>
          <p>Everyone who takes part in the Kaanivaa will be entered into a lucky draw!</p>
          <p>
            One lucky staff member will win an <b>iPhone 18 Pro</b>, plus a daily lucky draw of <b>MVR 2,000</b> straight to
            your Swipe wallet.
          </p>
          <p className="pt-1 text-sm text-carnival-ink/70">
            <b>Every duty you complete is one lucky draw entry</b> — once your shift leader marks you present. All your
            completed duties count for the grand draw; that day&apos;s duties count for the daily draw.
          </p>
        </section>

        <VenueMap className="mt-10" />
      </main>
    </>
  );
}
