"use server";

import { cookies } from "next/headers";
import { LOCALE_COOKIE, normalizeLocale } from "../../i18n/config";

/** Persists the chosen UI/content language in a cookie (read by i18n/request.ts). */
export async function setLocale(value: string) {
  const locale = normalizeLocale(value);
  const store = await cookies();
  store.set(LOCALE_COOKIE, locale, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
}
