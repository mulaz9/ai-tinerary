"use client";

import { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { createSupabaseBrowserClient } from "../../lib/supabase/client";

function LoginInner() {
  const params = useSearchParams();
  const errorParam = params.get("error");
  const next = params.get("next") ?? "/";
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(
    errorParam ? "Accesso non riuscito, riprova." : null,
  );

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

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#121212] px-5 py-10 text-white">
      <div className="w-full max-w-sm rounded-3xl border border-white/10 bg-white/3 p-8 shadow-2xl backdrop-blur">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-emerald-400/70">
          AI-tinerary
        </p>
        <h1 className="mt-2 text-2xl font-bold leading-tight tracking-tight text-white">
          Bentornato
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-white/50">
          Accedi per sincronizzare i tuoi viaggi su tutti i dispositivi.
        </p>

        <button
          type="button"
          onClick={signInWithGoogle}
          disabled={loading}
          className="mt-8 inline-flex w-full items-center justify-center gap-3 rounded-full bg-white px-4 py-3 text-sm font-semibold text-neutral-900 transition hover:bg-white/90 disabled:opacity-60"
        >
          <GoogleIcon />
          {loading ? "Reindirizzamento…" : "Continua con Google"}
        </button>

        {error ? (
          <p className="mt-4 text-center text-xs text-red-400/90">{error}</p>
        ) : null}

        <p className="mt-6 text-center text-[11px] text-white/30">
          Continuando accetti di sincronizzare i tuoi itinerari con Supabase.
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
