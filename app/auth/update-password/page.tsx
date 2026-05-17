"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "../../../lib/supabase/client";

function UpdatePasswordInner() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [hasSession, setHasSession] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  // The reset link sends the user through /auth/callback which exchanges the
  // code for a session cookie. We verify here that a session actually exists
  // before letting them update the password.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const supabase = createSupabaseBrowserClient();
        if (!supabase) {
          if (!cancelled) {
            setError("Supabase non configurato.");
            setChecking(false);
          }
          return;
        }
        const { data } = await supabase.auth.getUser();
        if (cancelled) return;
        setHasSession(Boolean(data.user));
        setChecking(false);
      } catch (err) {
        console.error(err);
        if (!cancelled) {
          setError("Impossibile verificare la sessione. Riprova dal link nell'email.");
          setChecking(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setInfo(null);

    if (password.length < 8) {
      setError("La password deve avere almeno 8 caratteri.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Le password non coincidono.");
      return;
    }

    setLoading(true);
    try {
      const supabase = createSupabaseBrowserClient();
      if (!supabase) throw new Error("Supabase non configurato.");
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setInfo("Password aggiornata. Ti reindirizzo…");
      setTimeout(() => {
        router.push("/");
        router.refresh();
      }, 900);
    } catch (err) {
      console.error(err);
      const msg =
        err instanceof Error
          ? err.message
          : "Impossibile aggiornare la password.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#121212] px-5 py-10 text-white">
      <div className="w-full max-w-sm rounded-3xl border border-white/10 bg-white/3 p-8 shadow-2xl backdrop-blur">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-emerald-400/70">
          AI-tinerary
        </p>
        <h1 className="mt-2 text-2xl font-bold leading-tight tracking-tight text-white">
          Imposta nuova password
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-white/50">
          Scegli una nuova password per il tuo account. Dovrà avere almeno 8 caratteri.
        </p>

        {checking ? (
          <p className="mt-6 text-center text-sm text-white/50">
            Verifica del link in corso…
          </p>
        ) : !hasSession ? (
          <div className="mt-6 space-y-3">
            <p className="rounded-2xl border border-red-500/20 bg-red-500/10 px-3 py-3 text-center text-xs text-red-300">
              Link non valido o scaduto. Richiedi un nuovo link di reset.
            </p>
            <Link
              href="/login"
              className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-3 text-sm font-semibold text-white/90 transition hover:border-white/25 hover:bg-white/10"
            >
              ← Torna al login
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-6 space-y-3">
            <div>
              <label
                htmlFor="new-password"
                className="mb-1.5 block text-[11px] font-semibold uppercase tracking-widest text-white/40"
              >
                Nuova password
              </label>
              <input
                id="new-password"
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white placeholder:text-white/30 focus:border-emerald-400/50 focus:outline-none focus:ring-2 focus:ring-emerald-400/30"
                placeholder="Almeno 8 caratteri"
              />
            </div>
            <div>
              <label
                htmlFor="confirm-new-password"
                className="mb-1.5 block text-[11px] font-semibold uppercase tracking-widest text-white/40"
              >
                Conferma nuova password
              </label>
              <input
                id="confirm-new-password"
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white placeholder:text-white/30 focus:border-emerald-400/50 focus:outline-none focus:ring-2 focus:ring-emerald-400/30"
                placeholder="Ripeti la password"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="mt-1 inline-flex w-full items-center justify-center gap-2 rounded-full bg-emerald-400 px-4 py-3 text-sm font-semibold text-neutral-900 transition hover:bg-emerald-300 disabled:opacity-60"
            >
              {loading ? "Salvataggio…" : "Aggiorna password"}
            </button>
          </form>
        )}

        {error ? (
          <p className="mt-4 rounded-2xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-center text-xs text-red-300">
            {error}
          </p>
        ) : null}
        {info ? (
          <p className="mt-4 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-center text-xs text-emerald-200">
            {info}
          </p>
        ) : null}

        <p className="mt-6 border-t border-white/5 pt-5 text-center text-[11px] text-white/30">
          <Link
            href="/login"
            className="text-white/40 underline-offset-2 hover:text-white/70 hover:underline"
          >
            Torna al login
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function UpdatePasswordPage() {
  return (
    <Suspense fallback={null}>
      <UpdatePasswordInner />
    </Suspense>
  );
}
