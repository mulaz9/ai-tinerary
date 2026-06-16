"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { createSupabaseBrowserClient } from "../lib/supabase/client";

interface UserInfo {
  email: string | null;
  name: string | null;
  avatarUrl: string | null;
}

function readUser(supabaseUser: {
  email?: string | null;
  user_metadata?: Record<string, unknown>;
} | null): UserInfo | null {
  if (!supabaseUser) return null;
  const meta = supabaseUser.user_metadata ?? {};
  return {
    email: supabaseUser.email ?? null,
    name:
      (meta.full_name as string | undefined) ??
      (meta.name as string | undefined) ??
      null,
    avatarUrl:
      (meta.avatar_url as string | undefined) ??
      (meta.picture as string | undefined) ??
      null,
  };
}

interface UserMenuProps {
  variant?: "sidebar" | "compact";
}

export default function UserMenu({ variant = "sidebar" }: UserMenuProps) {
  const [user, setUser] = useState<UserInfo | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const pathname = usePathname();
  const t = useTranslations("userMenu");

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    if (!supabase) {
      setHydrated(true);
      return;
    }
    let cancelled = false;
    supabase.auth.getUser().then(({ data }) => {
      if (cancelled) return;
      setUser(readUser(data.user ?? null));
      setHydrated(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setUser(readUser(session?.user ?? null));
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  if (!hydrated) return null;

  if (!user) {
    if (pathname === "/login") return null;
    const next = pathname && pathname !== "/" ? `?next=${encodeURIComponent(pathname)}` : "";
    if (variant === "compact") {
      return (
        <Link
          href={`/login${next}`}
          className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500 px-3 py-1.5 text-[11px] font-semibold text-emerald-950 transition hover:bg-emerald-400"
        >
          <GoogleDot />
          {t("signIn")}
        </Link>
      );
    }
    return (
      <Link
        href={`/login${next}`}
        className="mt-6 flex items-center justify-center gap-2 rounded-2xl bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-400"
      >
        <GoogleDot />
        {t("signInWithGoogle")}
      </Link>
    );
  }

  const initial = (user.name ?? user.email ?? "?").charAt(0).toUpperCase();

  if (variant === "compact") {
    return (
      <form action="/auth/signout" method="post" className="flex items-center">
        <button
          type="submit"
          title={user.email ?? t("signOut")}
          className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-semibold text-white/80 transition hover:bg-white/10"
        >
          <Avatar url={user.avatarUrl} initial={initial} size={20} />
          {t("signOut")}
        </button>
      </form>
    );
  }

  return (
    <div className="mt-6 flex items-center gap-3 rounded-2xl border border-white/10 bg-white/3 p-3">
      <Avatar url={user.avatarUrl} initial={initial} size={36} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-white">
          {user.name ?? user.email ?? t("user")}
        </p>
        {user.name && user.email ? (
          <p className="truncate text-xs text-white/50">{user.email}</p>
        ) : null}
      </div>
      <form action="/auth/signout" method="post">
        <button
          type="submit"
          className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-white/80 transition hover:bg-white/10"
        >
          {t("signOut")}
        </button>
      </form>
    </div>
  );
}

function Avatar({
  url,
  initial,
  size,
}: {
  url: string | null;
  initial: string;
  size: number;
}) {
  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt=""
        width={size}
        height={size}
        className="shrink-0 rounded-full object-cover ring-1 ring-white/10"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-xs font-bold text-emerald-300 ring-1 ring-emerald-400/30"
      style={{ width: size, height: size }}
    >
      {initial}
    </div>
  );
}

function GoogleDot() {
  return (
    <svg width="12" height="12" viewBox="0 0 18 18" aria-hidden="true">
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
