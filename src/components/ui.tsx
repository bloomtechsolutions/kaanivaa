import Link from "next/link";
import type { ReactNode } from "react";

export function Marquee({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`marquee-card rounded-2xl ${className}`}>
      <div className="bulbs bulbs-animated mx-4 mt-2 opacity-90" aria-hidden />
      <div className="p-4 sm:p-6">{children}</div>
    </div>
  );
}

export function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-2xl bg-white/90 shadow-sm ring-1 ring-carnival-teal/20 ${className}`}>{children}</div>;
}

export function Heading({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <h1 className={`font-display text-2xl sm:text-3xl text-carnival-red tracking-wide ${className}`}>{children}</h1>;
}

export function PublicHeader() {
  return (
    <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-3">
      <Link href="/" className="font-display text-xl text-carnival-red">Kaanivaa 44</Link>
      <nav className="flex gap-1 text-sm font-semibold">
        <Link className="rounded-full px-3 py-1.5 hover:bg-white/70" href="/me">My duty</Link>
        <Link className="rounded-full px-3 py-1.5 hover:bg-white/70" href="/winners">Winners</Link>
        <Link className="rounded-full bg-carnival-teal px-3 py-1.5 text-white hover:bg-carnival-teal-dark" href="/admin">Admin</Link>
      </nav>
    </header>
  );
}

export function Spinner({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-16 text-carnival-teal-dark" role="status">
      <span className="size-5 animate-spin rounded-full border-2 border-carnival-teal border-t-transparent" />
      {label}
    </div>
  );
}

export function ErrorBox({ message }: { message: string }) {
  return <div className="rounded-xl bg-rose-50 p-4 text-sm text-rose-800 ring-1 ring-rose-200">{message}</div>;
}
