import Image from "next/image";

/** Kaanivaa 44 venue map with the duty locations (Swipe 1, Swipe 2, BML Stall). */
export default function VenueMap({ title = "Venue map", className = "" }: { title?: string; className?: string }) {
  return (
    <section className={`mx-auto max-w-xl ${className}`}>
      <h2 className="text-center font-display text-2xl text-carnival-teal-dark sm:text-3xl">{title}</h2>
      <a href="/venue-map.webp" target="_blank" rel="noopener" className="mt-3 block overflow-hidden rounded-2xl bg-white shadow-md ring-1 ring-carnival-teal/20">
        <Image
          src="/venue-map.webp"
          alt="Venue map: Swipe 1 at the One Central Entrance, BML Stall in the middle of the main walkway near the Stage, Swipe 2 at the Ooredoo Entrance, with stalls, BML Experience Zones, Arcade Games, Bubble Station, Horror House, Laser Tag and Inflatable Games around them."
          width={661}
          height={756}
          className="h-auto w-full"
        />
      </a>
      <p className="mt-2 text-center text-xs text-carnival-ink/60">Tap the map to open it full size.</p>
    </section>
  );
}
