"use client";

import { useEffect, useState, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { createSupabaseBrowserClient } from "../../lib/supabase/client";
import { loadUserTrips } from "../../lib/trips-store";

const LEGACY_STORAGE_KEY = "ai-tinerary.user-trips.v1";

function LoginInner() {
  const params = useSearchParams();
  const router = useRouter();
  const errorParam = params.get("error");
  const signedOut = params.get("signedOut") === "1";
  const next = params.get("next") ?? "/";
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(
    errorParam ? "Accesso non riuscito, riprova." : null,
  );
  const [localTripCount, setLocalTripCount] = useState<number | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const cached = loadUserTrips();
      if (cached.length > 0) {
        setLocalTripCount(cached.length);
        return;
      }
      const raw = window.localStorage.getItem(LEGACY_STORAGE_KEY);
      if (!raw) {
        setLocalTripCount(0);
        return;
      }
      const parsed = JSON.parse(raw);
      setLocalTripCount(Array.isArray(parsed) ? parsed.length : 0);
    } catch {
      setLocalTripCount(0);
    }
  }, []);

  async function signInWithGoogle() {
    setLoading(true);
    setError(null);
    try {
      const supabase = createSupabaseBrowserClient();
      if (!supabase) {
        throw new Error(
          "Supabase non configurato. Imposta NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local",
        );
      }
      const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(
        next,
      )}`;
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo },
      });
      if (error) throw error;
    } catch (e) {
      console.error(e);
      const msg =
        e instanceof Error && e.message.startsWith("Supabase non configurato")
          ? e.message
          : "Impossibile avviare l'accesso. Controlla la configurazione.";
      setError(msg);
      setLoading(false);
    }
  }

  function continueAsGuest() {
    router.push(next.startsWith("/") ? next : "/");
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#121212] px-5 py-10 text-white">
      <div className="w-full max-w-sm rounded-3xl border border-white/10 bg-white/3 p-8 shadow-2xl backdrop-blur">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-emerald-400/70">
          AI-tinerary
        </p>
        <h1 className="mt-2 text-2xl font-bold leading-tight tracking-tight text-white">
          {signedOut ? "A presto" : "Bentornato"}
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-white/50">
          {signedOut
            ? "Sei uscito dal tuo account. Puoi rientrare o continuare come ospite."
            : "Accedi per sincronizzare i tuoi viaggi su tutti i dispositivi, oppure prosegui senza account."}
        </p>

        <button
          type="button"
          onClick={signInWithGoogle}
          disabled={loading}
          className="mt-7 inline-flex w-full items-center justify-center gap-3 rounded-full bg-white px-4 py-3 text-sm font-semibold text-neutral-900 transition hover:bg-white/90 disabled:opacity-60"
        >
          <GoogleIcon />
          {loading ? "Reindirizzamento…" : "Continua con Google"}
        </button>

        {error ? (
          <p className="mt-3 text-center text-xs text-red-400/90">{error}</p>
        ) : null}

        <div className="my-6 flex items-center gap-3 text-[10px] font-semibold uppercase tracking-widest text-white/30">
          <span className="h-px flex-1 bg-white/10" aria-hidden="true" />
          oppure
          <span className="h-px flex-1 bg-white/10" aria-hidden="true" />
        </div>

        <button
          type="button"
          onClick={continueAsGuest}
          className="group inline-flex w-full items-center justify-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-3 text-sm font-semibold text-white/90 transition hover:border-white/25 hover:bg-white/10"
        >
          Usa l&apos;app senza accedere
          <span
            aria-hidden="true"
            className="transition-transform group-hover:translate-x-0.5"
          >
            →
          </span>
        </button>

        <p className="mt-3 text-center text-[11px] leading-relaxed text-white/40">
          I viaggi verranno salvati solo su <strong className="font-semibold text-white/60">questo dispositivo</strong>.
          {localTripCount && localTripCount > 0
            ? ` Hai già ${localTripCount} ${
                localTripCount === 1 ? "viaggio salvato" : "viaggi salvati"
              } qui.`
            : ""}
          {" "}Puoi accedere più tardi per sincronizzarli.
        </p>

        <p className="mt-6 border-t border-white/5 pt-5 text-center text-[11px] text-white/30">
          Accedendo accetti di sincronizzare i tuoi itinerari con Supabase.
          <br />
          <Link
            href="/"
            className="mt-1 inline-block text-white/40 underline-offset-2 hover:text-white/70 hover:underline"
          >
            Torna alla home
          </Link>
        </p>
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"
      />
      <path
        fill="#FBBC05"
        d="M3.964 10.706A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.706V4.962H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.038l3.007-2.332z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.962L3.964 7.294C4.672 5.167 6.656 3.58 9 3.58z"
      />
    </svg>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginInner />
    </Suspense>
  );
}
