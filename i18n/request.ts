import { cookies } from "next/headers";
import { getRequestConfig } from "next-intl/server";
import { LOCALE_COOKIE, normalizeLocale } from "./config";

/**
 * Resolves the active locale from the `NEXT_LOCALE` cookie (set by the language
 * switcher) and loads the matching message catalog. We run without locale-based
 * routing, so the URL never changes.
 */
export default getRequestConfig(async () => {
  const store = await cookies();
  const locale = normalizeLocale(store.get(LOCALE_COOKIE)?.value);

  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});
