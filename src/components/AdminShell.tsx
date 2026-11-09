"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useContext, type ReactNode } from "react";
import { ErrorBox, Spinner } from "@/components/ui";
import { supabase } from "@/lib/supabase/client";
import { useRole, useRoster, type RosterData } from "@/lib/useRoster";

interface AdminCtx extends RosterData {
  role: "admin" | "leader";
  email: string | null;
}

const Ctx = createContext<AdminCtx | null>(null);

export function useAdmin() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAdmin outside AdminShell");
  return v;
}

const NAV = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/attendance", label: "Attendance" },
  { href: "/admin/staff", label: "Staff" },
  { href: "/admin/draw", label: "Lucky draw", adminOnly: true },
  { href: "/admin/users", label: "Users", adminOnly: true },
];

export default function AdminShell({ children }: { children: ReactNode }) {
  const { role, email } = useRole();
  const roster = useRoster();
  const pathname = usePathname();
  const router = useRouter();

  async function signOut() {
    await supabase().auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  let body: ReactNode;
  if (role === undefined || (role && roster.loading)) body = <Spinner />;
  else if (role === null)
    body = (
      <div className="mx-auto max-w-md py-10 text-center">
        <ErrorBox message={`${email ?? "This account"} is not on the Kaanivaa staff console list. Ask an admin to add you under Users.`} />
        <button onClick={signOut} className="mt-4 font-bold text-carnival-teal-dark underline">Sign out</button>
      </div>
    );
  else if (roster.error) body = <ErrorBox message={roster.error} />;
  else body = <Ctx.Provider value={{ ...roster, role, email }}>{children}</Ctx.Provider>;

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="sticky top-0 z-20 bg-carnival-red text-white shadow-md">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2">
          <Link href="/" className="mr-auto font-display text-lg whitespace-nowrap sm:mr-0">Kaanivaa 44</Link>
          <nav className="order-last -mx-1 flex w-full gap-1 overflow-x-auto text-sm font-semibold sm:order-none sm:w-auto sm:flex-1">
            {NAV.filter((n) => !n.adminOnly || role === "admin").map((n) => {
              const active = n.href === "/admin" ? pathname === "/admin" : pathname.startsWith(n.href);
              return (
                <Link key={n.href} href={n.href}
                  className={`rounded-full px-3 py-1.5 whitespace-nowrap ${active ? "bg-white text-carnival-red" : "hover:bg-white/15"}`}>
                  {n.label}
                </Link>
              );
            })}
          </nav>
          <div className="hidden text-right text-xs leading-tight sm:block">
            <div className="opacity-90">{email}</div>
            {role && <div className="font-bold uppercase tracking-wide text-carnival-gold">{role}</div>}
          </div>
          <button onClick={signOut} className="rounded-full bg-white/15 px-3 py-1.5 text-sm font-semibold hover:bg-white/25">Sign out</button>
        </div>
        <div className="bulbs bulbs-animated" aria-hidden />
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{body}</main>
    </div>
  );
}
