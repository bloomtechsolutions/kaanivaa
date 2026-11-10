import Image from "next/image";
import Link from "next/link";
import { PublicHeader } from "@/components/ui";
import VenueMap from "@/components/VenueMap";

const CONTACTS = [
  {
    team: "Merchant",
    people: [
      { name: "Niyaz Waleed", phone: "7969621" },
      { name: "Mohamed Jaish Riyaz", phone: "9454543" },
    ],
  },
  {
    team: "Swipe",
    people: [
      { name: "Ahmed Hizaam Khaleel", phone: "9495936" },
      { name: "Ismail Nashau Nashid", phone: "7686915" },
    ],
  },
];

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
          <div className="rounded-2xl bg-carnival-teal p-6 text-white shadow-lg">
            <div className="font-display text-2xl">Focal contact points</div>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              {CONTACTS.map((g) => (
                <div key={g.team}>
                  <div className="text-xs font-extrabold uppercase tracking-wider text-white/80">{g.team}</div>
                  <ul className="mt-1.5 space-y-2">
                    {g.people.map((p) => (
                      <li key={p.phone}>
                        <a href={`tel:+960${p.phone}`} className="group flex items-center gap-2.5 rounded-xl bg-white/10 px-3 py-2 hover:bg-white/20"
                          aria-label={`Call ${p.name} on ${p.phone}`}>
                          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-white text-carnival-teal-dark">
                            <svg viewBox="0 0 24 24" className="size-4" fill="currentColor" aria-hidden>
                              <path d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 11.4 11.4 0 0 0 3.6.57 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.57 3.57a1 1 0 0 1-.25 1z" />
                            </svg>
                          </span>
                          <span className="min-w-0 leading-tight">
                            <span className="block text-sm font-bold">{p.name}</span>
                            <span className="text-sm tabular-nums text-white/85 group-hover:underline">{p.phone}</span>
                          </span>
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </section>

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
