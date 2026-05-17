"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAllTrips } from "../lib/trips-store";
import UserMenu from "./UserMenu";
import { getCountryFromLocation } from "../lib/country-flag";

// ── minimal inline SVG icons (no external dependency) ──────────────────────

function IconHome({ active }: { active: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth={active ? 2 : 1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
    </svg>
  );
}

function IconMap({ active }: { active: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth={active ? 2 : 1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
    </svg>
  );
}

/**
 * Extracts the city from a free-form location string and returns it in
 * Title Case (so a stored value of `"roma"` shows up as `"Roma"`). Falls
 * back to the original string when there's no comma.
 */
function formatPlaceLabel(location: string): string {
  if (!location) return "";
  const first = location.split(",")[0]?.trim() ?? location.trim();
  return first
    .split(/\s+/)
    .map((w) =>
      w.length ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w,
    )
    .join(" ");
}

// ───────────────────────────────────────────────────────────────────────────

export default function MobileNav() {
  const pathname = usePathname();
  const { trips } = useAllTrips();

  if (pathname === "/login") return null;

  return (
    <>
      {/* ── Top bar (mobile only) ────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-white/10 bg-[#121212]/95 px-4 backdrop-blur-md lg:hidden">
        <Link href="/" className="text-sm font-bold tracking-tight text-white">
          ai‑tinerary
        </Link>

        <UserMenu variant="compact" />
      </header>

      {/* ── Bottom nav (mobile only) ─────────────────────────────────────── */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-40 flex border-t border-white/10 bg-[#121212]/95 backdrop-blur-md lg:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        {/* Home */}
        <Link
          href="/"
          className={`flex flex-1 flex-col items-center gap-1 py-3 text-[11px] font-medium transition-colors ${
            pathname === "/" ? "text-white" : "text-white/40 hover:text-white/70"
          }`}
        >
          <IconHome active={pathname === "/"} />
          Home
        </Link>

        {/* One tab per trip */}
        {trips.map((trip) => {
          const active = !!pathname?.startsWith(`/trip/${trip.id}`);
          const country = getCountryFromLocation(trip.location);
          // Show the city (first comma-separated segment) as the label,
          // properly capitalized. Falls back to the full location.
          const label = formatPlaceLabel(trip.location);
          return (
            <Link
              key={trip.id}
              href={`/trip/${trip.id}`}
              className={`flex flex-1 flex-col items-center gap-1 py-3 text-[11px] font-medium transition-colors ${
                active ? "text-white" : "text-white/40 hover:text-white/70"
              }`}
              aria-label={trip.name}
            >
              {country ? (
                <span
                  className="text-xl leading-none"
                  aria-hidden="true"
                  title={country.code}
                >
                  {country.flag}
                </span>
              ) : (
                <IconMap active={active} />
              )}
              <span className="max-w-full truncate">{label}</span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}
