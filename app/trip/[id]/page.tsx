"use client";

import { use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { LOCALE_NAMES, normalizeLocale } from "../../../i18n/config";
import Sidebar from "../../../components/Sidebar";
import DayTimeline from "../../../components/DayTimeline";
import SafeImage from "../../../components/SafeImage";
import ShareTripDialog from "../../../components/ShareTripDialog";
import ManageAccommodationsDialog from "../../../components/ManageAccommodationsDialog";
import TripMap, { type MapFocusTarget } from "../../../components/TripMap";
import { updateUserTrip, useAllTrips } from "../../../lib/trips-store";
import type { WeatherInfo } from "../../../lib/weather";
import { useActivityImages } from "../../../lib/use-activity-images";
import { buildMapsSearchUrl, buildMapsUrl } from "../../../lib/maps";
import {
  migrateTripAccommodations,
  originForDay,
} from "../../../lib/trip-accommodations";
import { getCountryFromLocation } from "../../../lib/country-flag";
import type { Day, Trip } from "../../../types";

/**
 * Rebuilds activity `mapsUrl` values so each day uses its assigned
 * accommodation as the directions origin. Called every time we serialize
 * the trip so older trips also benefit from the per-day routing.
 */
function applyMapsOrigin(trip: Trip): Trip {
  const migrated = migrateTripAccommodations(trip);
  const destination = migrated.location;
  const nextDays: Day[] = migrated.days.map((day) => {
    const origin = originForDay(migrated, day);
    return {
      ...day,
      activities: day.activities.map((a) => ({
        ...a,
        mapsUrl: buildMapsUrl(a.location || migrated.location, {
          destination,
          origin,
        }),
      })),
    };
  });
  return { ...migrated, days: nextDays };
}

export default function TripDetails({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const locale = useLocale();
  const t = useTranslations("trip");
  const tCommon = useTranslations("common");
  const { trips, hydrated } = useAllTrips();
  const storedTrip = trips.find((trip) => trip.id === id);

  // Local, editable copy of the trip. This is what the UI renders and mutates
  // in response to remove / reorder actions. We re-sync it whenever the
  // stored version changes identity (initial load, or an external update).
  const [trip, setTrip] = useState<Trip | undefined>(storedTrip);

  useEffect(() => {
    if (!storedTrip) return;
    setTrip((prev) => (prev === storedTrip ? prev : storedTrip));
  }, [storedTrip]);

  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [manageAccommodationsOpen, setManageAccommodationsOpen] =
    useState(false);
  const [mapFocus, setMapFocus] = useState<MapFocusTarget | null>(null);

  const focusActivityOnMap = useCallback((activityId: string) => {
    setMapFocus((prev) => ({
      activityId,
      token: (prev?.token ?? 0) + 1,
    }));
  }, []);

  const [weatherByDate, setWeatherByDate] = useState<
    Record<string, WeatherInfo>
  >({});
  const imagesByActivityId = useActivityImages(trip);

  // ── Weather fetch ─────────────────────────────────────────────────────
  const weatherDatesKey = trip?.days.map((d) => d.date).join(",") ?? "";
  const weatherFetchKey = trip?.location
    ? `${trip.location}::${weatherDatesKey}`
    : "";
  const lastWeatherFetchKeyRef = useRef("");

  useEffect(() => {
    if (!trip?.location || !weatherDatesKey) return;
    if (lastWeatherFetchKeyRef.current === weatherFetchKey) return;
    lastWeatherFetchKeyRef.current = weatherFetchKey;
    let cancelled = false;
    const url =
      `/api/weather?location=${encodeURIComponent(trip.location)}` +
      `&dates=${encodeURIComponent(weatherDatesKey)}`;

    fetch(url)
      .then((res) => (res.ok ? res.json() : { weatherByDate: {} }))
      .then((data: { weatherByDate?: Record<string, WeatherInfo> }) => {
        if (!cancelled) setWeatherByDate(data.weatherByDate ?? {});
      })
      .catch(() => {
        if (!cancelled) setWeatherByDate({});
      });

    return () => {
      cancelled = true;
    };
  }, [weatherFetchKey]);

  // ── Mutations ─────────────────────────────────────────────────────────

  const commit = useCallback((next: Trip) => {
    const normalized = applyMapsOrigin(next);
    setTrip(normalized);
    updateUserTrip(normalized);
  }, []);

  const handleChangeDays = useCallback(
    (nextDays: Day[]) => {
      if (!trip) return;
      commit({ ...trip, days: nextDays });
    },
    [trip, commit],
  );

  const [translating, setTranslating] = useState(false);
  const [translateError, setTranslateError] = useState<string | null>(null);

  const handleTranslate = useCallback(async () => {
    if (!trip || translating) return;
    setTranslating(true);
    setTranslateError(null);
    try {
      const res = await fetch("/api/translate-trip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trip, targetLang: locale }),
      });
      const data = (await res.json()) as { trip?: Trip; error?: string };
      if (!res.ok || !data.trip) {
        setTranslateError(data.error || t("translateError"));
        return;
      }
      commit(data.trip);
    } catch {
      setTranslateError(t("translateError"));
    } finally {
      setTranslating(false);
    }
  }, [trip, translating, locale, commit, t]);

  // ── Render guards ─────────────────────────────────────────────────────

  if (hydrated && !trip) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#121212] text-white">
        <div className="text-center">
          <p className="text-sm text-white/50">{t("notFound")}</p>
          <Link
            href="/"
            className="mt-4 inline-flex rounded-xl bg-white px-4 py-2 text-sm font-semibold text-gray-900 transition hover:bg-white/90"
          >
            {tCommon("backHome")}
          </Link>
        </div>
      </div>
    );
  }

  if (!trip) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#121212] text-white/50">
        <p className="text-sm">{tCommon("loading")}</p>
      </div>
    );
  }

  const totalActivities = trip.days.reduce(
    (acc, d) => acc + d.activities.length,
    0,
  );
  const country = getCountryFromLocation(trip.location);

  return (
    <div className="min-h-screen overflow-x-hidden bg-[#121212] text-white">
      <Sidebar />

      {/* pb-24 = clearance for mobile bottom nav */}
      <main className="mx-auto max-w-6xl px-4 pb-24 sm:px-5 lg:ml-80 lg:pb-10">
        {/* ── Hero cover ───────────────────────────────────────────────── */}
        <div className="relative -mx-4 sm:-mx-5 lg:mx-0 lg:mt-6 lg:overflow-hidden lg:rounded-3xl">
          {trip.coverImageUrl ? (
            <SafeImage
              src={trip.coverImageUrl}
              alt={trip.name}
              className="h-52 w-full object-cover sm:h-64 lg:h-72"
              fallbackLabel={trip.name}
            />
          ) : (
            <div className="h-52 w-full bg-gradient-to-br from-emerald-900/40 via-slate-800 to-indigo-900/40 sm:h-64 lg:h-72" />
          )}

          {/* Gradient overlay for text readability */}
          <div className="absolute inset-0 bg-gradient-to-t from-[#121212] via-[#121212]/60 to-transparent" />

          {/* Share — desktop: over cover; mobile: see action row below hero */}
          <button
            type="button"
            onClick={() => setShareDialogOpen(true)}
            aria-label={t("shareTrip")}
            title={t("shareTrip")}
            className="absolute right-3 top-3 z-10 hidden h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-black/50 text-white backdrop-blur transition hover:border-emerald-400/40 hover:bg-emerald-500/20 hover:text-emerald-200 sm:right-4 sm:top-4 lg:inline-flex"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
              <polyline points="16 6 12 2 8 6" />
              <line x1="12" y1="2" x2="12" y2="15" />
            </svg>
          </button>

          {/* Title over image */}
          <div className="absolute inset-x-0 bottom-0 px-5 pb-5 sm:px-6 sm:pb-6">
            <h1 className="flex flex-wrap items-center gap-2 text-2xl font-bold tracking-tight text-white drop-shadow-lg sm:text-3xl">
              {country ? (
                <span
                  className="text-3xl leading-none drop-shadow sm:text-4xl"
                  aria-label={country.code}
                  title={country.code}
                >
                  {country.flag}
                </span>
              ) : null}
              <span>{trip.name}</span>
            </h1>
            {trip.subtitle ? (
              <p className="mt-1 text-sm text-white/70 drop-shadow">
                {trip.subtitle}
              </p>
            ) : null}
          </div>
        </div>

        {/* ── Trip info row ─────────────────────────────────────────────── */}
        <div className="mt-5 animate-fade-in-up px-1">
          <div className="mb-3 flex flex-wrap gap-2 lg:hidden">
            <button
              type="button"
              onClick={() => setShareDialogOpen(true)}
              className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-emerald-400/30 bg-emerald-500/15 px-4 py-2 text-xs font-semibold text-emerald-100 transition hover:bg-emerald-500/25"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
                <polyline points="16 6 12 2 8 6" />
                <line x1="12" y1="2" x2="12" y2="15" />
              </svg>
              {t("shareTrip")}
            </button>
          </div>

          <p className="max-w-2xl text-sm leading-relaxed text-white/55">
            {trip.description}
          </p>

          <div className="mt-4 flex flex-wrap gap-2 text-[11px] font-medium text-white/50">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.06] bg-white/[0.03] px-3 py-1.5">
              <span className="dot-accent" style={{ width: 5, height: 5 }} />
              {trip.location}
            </span>
            <span className="inline-flex items-center gap-1 rounded-full border border-white/[0.06] bg-white/[0.03] px-3 py-1.5">
              {trip.startDate} → {trip.endDate}
            </span>
            <span className="inline-flex items-center gap-1 rounded-full border border-white/[0.06] bg-white/[0.03] px-3 py-1.5">
              {tCommon("daysCount", { count: trip.days.length })} ·{" "}
              {tCommon("activitiesCount", { count: totalActivities })}
            </span>
            {(trip.accommodations ?? []).map((acc) => (
              <a
                key={acc.id}
                href={buildMapsSearchUrl(acc.name, trip.location)}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/20 bg-emerald-500/10 px-3 py-1.5 text-emerald-200 transition hover:bg-emerald-500/20"
                title={tCommon("openInGoogleMaps")}
              >
                <span aria-hidden>🏨</span>
                {acc.name}
              </a>
            ))}
            <button
              type="button"
              onClick={() => setManageAccommodationsOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-white/15 bg-white/[0.02] px-3 py-1.5 text-white/60 transition hover:border-emerald-400/30 hover:bg-emerald-500/5 hover:text-emerald-200"
              title={
                trip.accommodations?.length
                  ? tCommon("manageAccommodations")
                  : tCommon("addAccommodation")
              }
            >
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M12 5v14" />
                <path d="M5 12h14" />
              </svg>
              {trip.accommodations?.length
                ? tCommon("manageAccommodations")
                : tCommon("addAccommodation")}
            </button>
            {trip.isUserCreated ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/20 bg-emerald-500/10 px-3 py-1.5 text-emerald-300">
                {t("generatedWithAI")}
              </span>
            ) : null}
            {normalizeLocale(trip.contentLang) !== normalizeLocale(locale) ? (
              <button
                type="button"
                onClick={handleTranslate}
                disabled={translating}
                className="inline-flex items-center gap-1.5 rounded-full border border-sky-400/20 bg-sky-500/10 px-3 py-1.5 text-sky-200 transition hover:bg-sky-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                title={t("translate", { language: LOCALE_NAMES[normalizeLocale(locale)] })}
              >
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="m5 8 6 6" />
                  <path d="m4 14 6-6 2-3" />
                  <path d="M2 5h12" />
                  <path d="M7 2h1" />
                  <path d="m22 22-5-10-5 10" />
                  <path d="M14 18h6" />
                </svg>
                {translating
                  ? t("translating")
                  : t("translate", {
                      language: LOCALE_NAMES[normalizeLocale(locale)],
                    })}
              </button>
            ) : null}
          </div>
          {translateError ? (
            <p className="mt-2 text-xs text-red-400">{translateError}</p>
          ) : null}
        </div>

        {/* ── Map ───────────────────────────────────────────────────────── */}
        <TripMap
          trip={trip}
          onTripGeoSaved={commit}
          focusTarget={mapFocus}
        />

        {/* ── Timeline ──────────────────────────────────────────────────── */}
        <DayTimeline
          days={trip.days}
          weatherByDate={weatherByDate}
          imagesByActivityId={imagesByActivityId}
          destination={trip.location}
          accommodations={trip.accommodations ?? []}
          onChangeDays={handleChangeDays}
          onActivityShowOnMap={focusActivityOnMap}
        />
      </main>

      <ShareTripDialog
        open={shareDialogOpen}
        onClose={() => setShareDialogOpen(false)}
        tripId={trip.id}
      />

      {manageAccommodationsOpen ? (
        <ManageAccommodationsDialog
          onClose={() => setManageAccommodationsOpen(false)}
          trip={trip}
          onSave={(next) => commit(next)}
        />
      ) : null}
    </div>
  );
}
