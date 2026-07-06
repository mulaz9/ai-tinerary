"use client";

import { useEffect, useMemo, useState, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { createSupabaseBrowserClient } from "../../lib/supabase/client";
import { loadUserTrips } from "../../lib/trips-store";

const LEGACY_STORAGE_KEY = "ai-tinerary.user-trips.v1";

type Tab = "signin" | "signup";
type View = "form" | "forgot";

function authRedirectOrigin(): string {
  if (typeof window === "undefined") return "";
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/$/, "");
  return configured || window.location.origin;
}

function buildAuthCallbackUrl(nextPath: string): string {
  return `${authRedirectOrigin()}/auth/callback?next=${encodeURIComponent(nextPath)}`;
}

/** Only allow same-origin paths (blocks "//evil.com" open redirects). */
function sanitizeNextPath(next: string): string {
  return next.startsWith("/") && !next.startsWith("//") ? next : "/";
}

function LoginInner() {
  const t = useTranslations("login");
  const tCommon = useTranslations("common");
  const params = useSearchParams();
  const router = useRouter();
  const errorParam = params.get("error");
  const signedOut = params.get("signedOut") === "1";
  const accountDeleted = params.get("accountDeleted") === "1";
  const next = params.get("next") ?? "/";

  const [tab, setTab] = useState<Tab>("signin");
  const [view, setView] = useState<View>("form");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [resetEmail, setResetEmail] = useState("");

  const [oauthLoading, setOauthLoading] = useState(false);
  const [emailLoading, setEmailLoading] = useState(false);

  const [error, setError] = useState<string | null>(
    errorParam ? t("errorLoginFailed") : null,
  );
  const [info, setInfo] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [pendingConfirmEmail, setPendingConfirmEmail] = useState<string | null>(
    null,
  );
  const [resendCooldown, setResendCooldown] = useState(0);

  const [localTripCount, setLocalTripCount] = useState<number | null>(null);
  const [showSigninResetHint, setShowSigninResetHint] = useState(false);

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

  const heading = useMemo(() => {
    if (view === "forgot") return t("headingForgot");
    if (signedOut) return t("headingSignedOut");
    if (accountDeleted) return t("headingAccountDeleted");
    return tab === "signin" ? t("headingSignin") : t("headingSignup");
  }, [view, signedOut, accountDeleted, tab, t]);

  const subheading = useMemo(() => {
    if (view === "forgot") return t("subForgot");
    if (signedOut) return t("subSignedOut");
    if (accountDeleted) return t("subAccountDeleted");
    return tab === "signin" ? t("subSignin") : t("subSignup");
  }, [view, signedOut, accountDeleted, tab, t]);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = window.setInterval(() => {
      setResendCooldown((seconds) => Math.max(0, seconds - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [resendCooldown]);

  function startResendCooldown(seconds = 60) {
    setResendCooldown(seconds);
  }

  async function sendConfirmationResend(targetEmail: string, source: string) {
    const supabase = createSupabaseBrowserClient();
    if (!supabase) {
      throw new Error(t("errorSupabase"));
    }
    const emailRedirectTo = buildAuthCallbackUrl(sanitizeNextPath(next));
    const { error } = await supabase.auth.resend({
      type: "signup",
      email: targetEmail,
      options: { emailRedirectTo },
    });
    if (error) throw error;
    startResendCooldown();
    return emailRedirectTo;
  }

  function clearMessages() {
    setError(null);
    setInfo(null);
    setWarning(null);
    setPendingConfirmEmail(null);
    setShowSigninResetHint(false);
  }

  function switchToSignIn() {
    setTab("signin");
    setView("form");
    setWarning(null);
    setError(null);
    setInfo(null);
    setPendingConfirmEmail(null);
  }

  function switchTab(nextTab: Tab) {
    setTab(nextTab);
    setView("form");
    clearMessages();
  }

  async function signInWithGoogle() {
    setOauthLoading(true);
    clearMessages();
    try {
      const supabase = createSupabaseBrowserClient();
      if (!supabase) {
        throw new Error(t("errorSupabase"));
      }
      const redirectTo = buildAuthCallbackUrl(sanitizeNextPath(next));
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo },
      });
      if (error) throw error;
    } catch (e) {
      console.error(e);
      const msg =
        e instanceof Error && e.message === t("errorSupabase")
          ? e.message
          : t("errorCannotStart");
      setError(msg);
      setOauthLoading(false);
    }
  }

  async function handleEmailSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    clearMessages();

    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) {
      setError(t("errorNoCredentials"));
      return;
    }
    if (tab === "signup") {
      if (password.length < 8) {
        setError(t("errorShortPassword"));
        return;
      }
      if (password !== confirmPassword) {
        setError(t("errorPasswordMismatch"));
        return;
      }
    }

    setEmailLoading(true);
    try {
      const supabase = createSupabaseBrowserClient();
      if (!supabase) {
        throw new Error(t("errorSupabase"));
      }

      if (tab === "signin") {
        const { error } = await supabase.auth.signInWithPassword({
          email: trimmedEmail,
          password,
        });
        if (error) throw error;
        router.push(sanitizeNextPath(next));
        router.refresh();
        return;
      }

      const safeNext = sanitizeNextPath(next);
      const emailRedirectTo = buildAuthCallbackUrl(safeNext);
      const { data, error } = await supabase.auth.signUp({
        email: trimmedEmail,
        password,
        options: { emailRedirectTo },
      });
      if (error) throw error;

      if (data.session) {
        router.push(safeNext);
        router.refresh();
        return;
      }

      const existingAccount = (data.user?.identities?.length ?? 0) === 0;
      if (existingAccount) {
        setWarning(t("signupExistingAccountWarning", { email: trimmedEmail }));
      } else {
        setPendingConfirmEmail(trimmedEmail);
        setInfo(t("confirmEmailSent", { email: trimmedEmail }));
      }
      setPassword("");
      setConfirmPassword("");
    } catch (err) {
      console.error(err);
      setError(translateAuthError(err, t));
      if (
        tab === "signin" &&
        err instanceof Error &&
        err.message.toLowerCase().includes("invalid login credentials")
      ) {
        setShowSigninResetHint(true);
      }
    } finally {
      setEmailLoading(false);
    }
  }

  async function sendSetPasswordEmail() {
    const targetEmail = email.trim();
    if (!targetEmail || emailLoading) return;
    setEmailLoading(true);
    try {
      const supabase = createSupabaseBrowserClient();
      if (!supabase) {
        throw new Error(t("errorSupabase"));
      }
      const redirectTo = buildAuthCallbackUrl("/auth/update-password");
      const { error } = await supabase.auth.resetPasswordForEmail(targetEmail, {
        redirectTo,
      });
      if (error) throw error;
      setWarning(null);
      setInfo(t("resetEmailSent", { email: targetEmail }));
    } catch (err) {
      console.error(err);
      setError(translateAuthError(err, t));
    } finally {
      setEmailLoading(false);
    }
  }

  async function resendConfirmationEmail() {
    if (!pendingConfirmEmail || resendCooldown > 0) return;
    const confirmEmail = pendingConfirmEmail;
    setError(null);
    setInfo(null);
    setEmailLoading(true);
    try {
      await sendConfirmationResend(confirmEmail, "manual-resend");
      setPendingConfirmEmail(confirmEmail);
      setInfo(t("confirmEmailResent", { email: confirmEmail }));
    } catch (err) {
      console.error(err);
      setError(translateAuthError(err, t));
    } finally {
      setEmailLoading(false);
    }
  }

  async function handleForgotSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    clearMessages();

    const trimmed = resetEmail.trim();
    if (!trimmed) {
      setError(t("errorNoEmail"));
      return;
    }
    setEmailLoading(true);
    try {
      const supabase = createSupabaseBrowserClient();
      if (!supabase) {
        throw new Error(t("errorSupabase"));
      }
      const redirectTo = buildAuthCallbackUrl("/auth/update-password");
      const { error } = await supabase.auth.resetPasswordForEmail(trimmed, {
        redirectTo,
      });
      if (error) throw error;
      setInfo(t("resetEmailSent", { email: trimmed }));
    } catch (err) {
      console.error(err);
      setError(translateAuthError(err, t));
    } finally {
      setEmailLoading(false);
    }
  }

  function continueAsGuest() {
    router.push(next.startsWith("/") ? next : "/");
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#121212] px-5 py-10 text-white">
      <div className="w-full max-w-sm rounded-3xl border border-white/10 bg-white/3 p-8 shadow-2xl backdrop-blur">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-emerald-400/70">
          {t("kicker")}
        </p>
        <h1 className="mt-2 text-2xl font-bold leading-tight tracking-tight text-white">
          {heading}
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-white/50">
          {subheading}
        </p>

        {view === "form" ? (
          <>
            <div
              role="tablist"
              aria-label={t("tabsLabel")}
              className="mt-6 grid grid-cols-2 gap-1 rounded-full border border-white/10 bg-white/5 p-1 text-xs font-semibold"
            >
              <button
                type="button"
                role="tab"
                aria-selected={tab === "signin"}
                onClick={() => switchTab("signin")}
                className={`rounded-full px-3 py-2 transition ${
                  tab === "signin"
                    ? "bg-white text-neutral-900"
                    : "text-white/60 hover:text-white"
                }`}
              >
                {t("signin")}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={tab === "signup"}
                onClick={() => switchTab("signup")}
                className={`rounded-full px-3 py-2 transition ${
                  tab === "signup"
                    ? "bg-white text-neutral-900"
                    : "text-white/60 hover:text-white"
                }`}
              >
                {t("signup")}
              </button>
            </div>

            <form onSubmit={handleEmailSubmit} className="mt-5 space-y-3">
              <div>
                <label
                  htmlFor="email"
                  className="mb-1.5 block text-[11px] font-semibold uppercase tracking-widest text-white/40"
                >
                  {t("email")}
                </label>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white placeholder:text-white/30 focus:border-emerald-400/50 focus:outline-none focus:ring-2 focus:ring-emerald-400/30"
                  placeholder={t("emailPlaceholder")}
                />
              </div>
              <div>
                <label
                  htmlFor="password"
                  className="mb-1.5 block text-[11px] font-semibold uppercase tracking-widest text-white/40"
                >
                  {t("password")}
                </label>
                <input
                  id="password"
                  type="password"
                  autoComplete={
                    tab === "signin" ? "current-password" : "new-password"
                  }
                  required
                  minLength={tab === "signup" ? 8 : undefined}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white placeholder:text-white/30 focus:border-emerald-400/50 focus:outline-none focus:ring-2 focus:ring-emerald-400/30"
                  placeholder={
                    tab === "signup"
                      ? t("passwordPlaceholderSignup")
                      : t("passwordPlaceholderSignin")
                  }
                />
              </div>
              {tab === "signup" ? (
                <div>
                  <label
                    htmlFor="confirm-password"
                    className="mb-1.5 block text-[11px] font-semibold uppercase tracking-widest text-white/40"
                  >
                    {t("confirmPassword")}
                  </label>
                  <input
                    id="confirm-password"
                    type="password"
                    autoComplete="new-password"
                    required
                    minLength={8}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white placeholder:text-white/30 focus:border-emerald-400/50 focus:outline-none focus:ring-2 focus:ring-emerald-400/30"
                    placeholder={t("confirmPasswordPlaceholder")}
                  />
                </div>
              ) : null}

              {tab === "signin" ? (
                <div className="text-right">
                  <button
                    type="button"
                    onClick={() => {
                      setView("forgot");
                      setResetEmail(email);
                      clearMessages();
                    }}
                    className="text-xs text-white/50 underline-offset-2 hover:text-white/80 hover:underline"
                  >
                    {t("forgotPassword")}
                  </button>
                </div>
              ) : null}

              <button
                type="submit"
                disabled={emailLoading}
                className="mt-1 inline-flex w-full items-center justify-center gap-2 rounded-full bg-emerald-400 px-4 py-3 text-sm font-semibold text-neutral-900 transition hover:bg-emerald-300 disabled:opacity-60"
              >
                {emailLoading
                  ? t("wait")
                  : tab === "signin"
                    ? t("signin")
                    : t("createAccount")}
              </button>
            </form>

            <div className="my-5 flex items-center gap-3 text-[10px] font-semibold uppercase tracking-widest text-white/30">
              <span className="h-px flex-1 bg-white/10" aria-hidden="true" />
              {t("or")}
              <span className="h-px flex-1 bg-white/10" aria-hidden="true" />
            </div>

            <button
              type="button"
              onClick={signInWithGoogle}
              disabled={oauthLoading}
              className="inline-flex w-full items-center justify-center gap-3 rounded-full bg-white px-4 py-3 text-sm font-semibold text-neutral-900 transition hover:bg-white/90 disabled:opacity-60"
            >
              <GoogleIcon />
              {oauthLoading ? t("redirecting") : t("continueWithGoogle")}
            </button>
          </>
        ) : (
          <form onSubmit={handleForgotSubmit} className="mt-6 space-y-3">
            <div>
              <label
                htmlFor="reset-email"
                className="mb-1.5 block text-[11px] font-semibold uppercase tracking-widest text-white/40"
              >
                {t("email")}
              </label>
              <input
                id="reset-email"
                type="email"
                autoComplete="email"
                required
                value={resetEmail}
                onChange={(e) => setResetEmail(e.target.value)}
                className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white placeholder:text-white/30 focus:border-emerald-400/50 focus:outline-none focus:ring-2 focus:ring-emerald-400/30"
                placeholder={t("emailPlaceholder")}
              />
            </div>
            <button
              type="submit"
              disabled={emailLoading}
              className="mt-1 inline-flex w-full items-center justify-center gap-2 rounded-full bg-emerald-400 px-4 py-3 text-sm font-semibold text-neutral-900 transition hover:bg-emerald-300 disabled:opacity-60"
            >
              {emailLoading ? t("sending") : t("sendResetLink")}
            </button>
            <button
              type="button"
              onClick={() => {
                setView("form");
                clearMessages();
              }}
              className="inline-flex w-full items-center justify-center text-xs text-white/50 hover:text-white/80"
            >
              {t("backToLogin")}
            </button>
          </form>
        )}

        {error ? (
          <div className="mt-4 space-y-2 rounded-2xl border border-red-500/20 bg-red-500/10 px-3 py-2">
            <p className="text-center text-xs text-red-300">{error}</p>
            {showSigninResetHint ? (
              <>
                <p className="text-center text-[11px] leading-relaxed text-red-200/70">
                  {t("invalidCredentialsGoogleHint")}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    const currentEmail = email;
                    setView("forgot");
                    setResetEmail(currentEmail);
                    clearMessages();
                  }}
                  className="inline-flex w-full items-center justify-center text-xs font-semibold text-red-100 underline-offset-2 hover:underline"
                >
                  {t("setPasswordViaEmail")}
                </button>
              </>
            ) : null}
          </div>
        ) : null}
        {warning ? (
          <div className="mt-4 space-y-3 rounded-2xl border border-amber-500/25 bg-amber-500/10 px-3 py-3">
            <p className="text-center text-xs leading-relaxed text-amber-100">
              {warning}
            </p>
            <p className="text-center text-[11px] leading-relaxed text-amber-200/70">
              {t("signupExistingAccountHint")}
            </p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                onClick={switchToSignIn}
                className="inline-flex flex-1 items-center justify-center rounded-full border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-xs font-semibold text-amber-100 transition hover:bg-amber-500/20"
              >
                {t("signupGoToSignIn")}
              </button>
              <button
                type="button"
                onClick={signInWithGoogle}
                disabled={oauthLoading}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-white px-3 py-2 text-xs font-semibold text-neutral-900 transition hover:bg-white/90 disabled:opacity-60"
              >
                <GoogleIcon />
                {oauthLoading ? t("redirecting") : t("continueWithGoogle")}
              </button>
            </div>
            <button
              type="button"
              onClick={sendSetPasswordEmail}
              disabled={emailLoading}
              className="inline-flex w-full items-center justify-center rounded-full border border-white/15 bg-white/5 px-3 py-2 text-xs font-semibold text-white/90 transition hover:border-white/25 hover:bg-white/10 disabled:opacity-60"
            >
              {emailLoading ? t("sending") : t("setPasswordViaEmail")}
            </button>
          </div>
        ) : null}
        {info ? (
          <div className="mt-4 space-y-2">
            <p className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-center text-xs text-emerald-200">
              {info}
            </p>
            {pendingConfirmEmail ? (
              <>
                <p className="text-center text-[11px] leading-relaxed text-white/40">
                  {t("confirmEmailDeliveryHint")}
                </p>
                <button
                  type="button"
                  onClick={resendConfirmationEmail}
                  disabled={emailLoading || resendCooldown > 0}
                  className="inline-flex w-full items-center justify-center text-xs text-emerald-300/80 underline-offset-2 hover:text-emerald-200 hover:underline disabled:opacity-60"
                >
                  {emailLoading
                    ? t("resendConfirmationSending")
                    : resendCooldown > 0
                      ? t("resendConfirmationWait", { seconds: resendCooldown })
                      : t("resendConfirmation")}
                </button>
              </>
            ) : null}
          </div>
        ) : null}

        <div className="my-5 flex items-center gap-3 text-[10px] font-semibold uppercase tracking-widest text-white/30">
          <span className="h-px flex-1 bg-white/10" aria-hidden="true" />
          {t("or")}
          <span className="h-px flex-1 bg-white/10" aria-hidden="true" />
        </div>

        <button
          type="button"
          onClick={continueAsGuest}
          className="group inline-flex w-full items-center justify-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-3 text-sm font-semibold text-white/90 transition hover:border-white/25 hover:bg-white/10"
        >
          {t("useWithoutAccount")}
          <span
            aria-hidden="true"
            className="transition-transform group-hover:translate-x-0.5"
          >
            →
          </span>
        </button>

        <p className="mt-3 text-center text-[11px] leading-relaxed text-white/40">
          {t.rich("tripsSavedNotice", {
            device: t("savedOnThisDevice"),
            here:
              localTripCount && localTripCount > 0
                ? t("tripsHere", { count: localTripCount })
                : "",
            strong: (chunks) => (
              <strong className="font-semibold text-white/60">{chunks}</strong>
            ),
          })}
        </p>

        <p className="mt-6 border-t border-white/5 pt-5 text-center text-[11px] text-white/30">
          {t("supabaseTerms")}
          <br />
          <Link
            href="/"
            className="mt-1 inline-block text-white/40 underline-offset-2 hover:text-white/70 hover:underline"
          >
            {tCommon("backHome")}
          </Link>
        </p>
      </div>
    </div>
  );
}

function translateAuthError(
  err: unknown,
  t: (key: string) => string,
): string {
  if (!(err instanceof Error)) return t("errorGeneric");
  if (err.message === t("errorSupabase")) return err.message;
  const msg = err.message.toLowerCase();
  if (msg.includes("invalid login credentials")) {
    return t("errorInvalidCredentials");
  }
  if (msg.includes("email not confirmed")) {
    return t("errorEmailNotConfirmed");
  }
  if (msg.includes("user already registered")) {
    return t("errorAlreadyRegistered");
  }
  if (msg.includes("rate limit") || msg.includes("too many requests")) {
    return t("errorTooManyRequests");
  }
  if (msg.includes("password should be at least")) {
    return t("errorPasswordTooShort");
  }
  return err.message;
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
