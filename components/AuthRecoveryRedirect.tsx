"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "../lib/supabase/client";

/**
 * Safety net for password-recovery links. If the Supabase redirect URL
 * allowlist rejects our `/auth/callback?next=/auth/update-password` URL,
 * the email link falls back to the Site URL (the home page). The browser
 * client still exchanges the `?code=` in the URL and emits a
 * PASSWORD_RECOVERY event — we catch it here and send the user to the
 * update-password page no matter where they landed.
 */
export default function AuthRecoveryRedirect() {
  const router = useRouter();

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    if (!supabase) return;

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (
        event === "PASSWORD_RECOVERY" &&
        !window.location.pathname.startsWith("/auth/update-password")
      ) {
        router.replace("/auth/update-password");
      }
    });

    return () => subscription.unsubscribe();
  }, [router]);

  return null;
}
