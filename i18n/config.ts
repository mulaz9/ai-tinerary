/** Supported UI/content locales. `it` is the source language. */
export const locales = ["it", "en", "fr", "es", "de"] as const;

export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = "it";

/** Cookie that persists the user's chosen locale (1 year). */
export const LOCALE_COOKIE = "NEXT_LOCALE";

/** Human-readable names shown in the language switcher. */
export const LOCALE_NAMES: Record<Locale, string> = {
  it: "Italiano",
  en: "English",
  fr: "Français",
  es: "Español",
  de: "Deutsch",
};

/** Flag emoji per locale, for the switcher. */
export const LOCALE_FLAGS: Record<Locale, string> = {
  it: "🇮🇹",
  en: "🇬🇧",
  fr: "🇫🇷",
  es: "🇪🇸",
  de: "🇩🇪",
};

/** Language name passed to the AI prompts so output is in the right language. */
export const LANGUAGE_FOR_AI: Record<Locale, string> = {
  it: "italiano",
  en: "English",
  fr: "français",
  es: "español",
  de: "Deutsch",
};

/** BCP-47 tags for the browser Web Speech API. */
export const SPEECH_LOCALE: Record<Locale, string> = {
  it: "it-IT",
  en: "en-US",
  fr: "fr-FR",
  es: "es-ES",
  de: "de-DE",
};

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (locales as readonly string[]).includes(value);
}

export function normalizeLocale(value: unknown): Locale {
  return isLocale(value) ? value : defaultLocale;
}
