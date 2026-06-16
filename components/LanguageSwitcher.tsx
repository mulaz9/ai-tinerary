"use client";

import { useLocale } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { setLocale } from "../app/actions/locale";
import {
  LOCALE_FLAGS,
  LOCALE_NAMES,
  locales,
  normalizeLocale,
  type Locale,
} from "../i18n/config";

interface LanguageSwitcherProps {
  variant?: "sidebar" | "compact";
}

export default function LanguageSwitcher({
  variant = "sidebar",
}: LanguageSwitcherProps) {
  const active = normalizeLocale(useLocale());
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  function choose(locale: Locale) {
    setOpen(false);
    if (locale === active) return;
    startTransition(async () => {
      await setLocale(locale);
      router.refresh();
    });
  }

  const compact = variant === "compact";

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={pending}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={
          compact
            ? "flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[11px] font-semibold text-white/80 transition hover:bg-white/10 disabled:opacity-50"
            : "flex w-full items-center justify-between gap-2 rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-sm font-medium text-white/80 transition hover:bg-white/10 disabled:opacity-50"
        }
      >
        <span className="flex items-center gap-1.5">
          <span className="text-base leading-none" aria-hidden="true">
            {LOCALE_FLAGS[active]}
          </span>
          {!compact && <span>{LOCALE_NAMES[active]}</span>}
        </span>
        <svg
          viewBox="0 0 20 20"
          className={`h-3.5 w-3.5 shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
          fill="currentColor"
          aria-hidden="true"
        >
          <path d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.17l3.71-3.94a.75.75 0 1 1 1.08 1.04l-4.25 4.5a.75.75 0 0 1-1.08 0l-4.25-4.5a.75.75 0 0 1 .02-1.06z" />
        </svg>
      </button>

      {open && (
        <ul
          role="listbox"
          className={`absolute z-50 min-w-[10rem] overflow-hidden rounded-2xl border border-white/10 bg-[#1c1c1c] py-1 shadow-xl ${
            compact ? "right-0 top-full mt-1" : "bottom-full left-0 mb-1 w-full"
          }`}
        >
          {locales.map((locale) => (
            <li key={locale}>
              <button
                type="button"
                role="option"
                aria-selected={locale === active}
                onClick={() => choose(locale)}
                className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition hover:bg-white/10 ${
                  locale === active ? "text-white" : "text-white/70"
                }`}
              >
                <span className="text-base leading-none" aria-hidden="true">
                  {LOCALE_FLAGS[locale]}
                </span>
                <span className="flex-1">{LOCALE_NAMES[locale]}</span>
                {locale === active && (
                  <span className="text-emerald-400" aria-hidden="true">
                    ✓
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
