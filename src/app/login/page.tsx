"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ErrorBox, Marquee, PublicHeader } from "@/components/ui";
import { supabase } from "@/lib/supabase/client";
import { isConfigured } from "@/lib/supabase/env";

export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabase().auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error) return setError(error.message);
    router.replace("/admin");
    router.refresh();
  }

  return (
    <>
      <PublicHeader />
      <main className="mx-auto w-full max-w-md flex-1 px-4 pb-16">
        <Marquee>
          <h1 className="text-center font-display text-2xl text-carnival-red">Leader &amp; Admin sign in</h1>
          {!isConfigured && (
            <div className="mt-4">
              <ErrorBox message="Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY." />
            </div>
          )}
          <form onSubmit={submit} className="mt-4 space-y-3">
            <label className="block">
              <span className="text-sm font-semibold">Email</span>
              <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email"
                className="mt-1 w-full rounded-xl border-0 bg-white px-4 py-3 ring-1 ring-carnival-teal/30 focus:ring-2 focus:ring-carnival-teal focus:outline-none" />
            </label>
            <label className="block">
              <span className="text-sm font-semibold">Password</span>
              <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password"
                className="mt-1 w-full rounded-xl border-0 bg-white px-4 py-3 ring-1 ring-carnival-teal/30 focus:ring-2 focus:ring-carnival-teal focus:outline-none" />
            </label>
            {error && <ErrorBox message={error} />}
            <button disabled={busy} className="w-full rounded-xl bg-carnival-red py-3 font-bold text-white hover:bg-carnival-red-dark disabled:opacity-50">
              {busy ? "Signing in…" : "Sign in"}
            </button>
          </form>
        </Marquee>
      </main>
    </>
  );
}
