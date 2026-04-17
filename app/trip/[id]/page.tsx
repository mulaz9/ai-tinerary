"use client";

import { use, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Sidebar from "../../../components/Sidebar";
import DayTimeline from "../../../components/DayTimeline";
import SafeImage from "../../../components/SafeImage";
import { updateUserTrip, useAllTrips } from "../../../lib/trips-store";
import type { WeatherInfo } from "../../../lib/weather";
import { useActivityImages } from "../../../lib/use-activity-images";
import type { Day, Trip } from "../../../types";

/**
 * Rebuilds activity `mapsUrl` values to reflect the trip's current
 * accommodation. Called every time we serialize the trip back to localStorage
 * so old trips without an origin get retro-upgraded as soon as the user
 * edits them.
 */
function applyMapsOrigin(trip: Trip): Trip {
  const origin = trip.accommodation?.trim();
  const nextDays: Day[] = trip.days.map((day) => ({
    ...day,
    activities: day.activities.map((a) => ({
      ...a,
      mapsUrl: origin
        ? `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(
            origin,
          )}&destination=${encodeURIComponent(a.location || trip.location)}`
        : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
            a.location || trip.location,
          )}`,
    })),
  }));
  return { ...trip, days: nextDays };
}

export default function TripDetails({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { trips, hydrated } = useAllTrips();
  const storedTrip = trips.find((t) => t.id === id);

  // Local, editable copy of the trip. This is what the UI renders and mutates
  // in response to remove / reorder actions. We re-sync it whenever the
  // stored version changes identity (initial load, or an external update).
  const [trip, setTrip] = useState<Trip | undefined>(storedTrip);

  useEffect(() => {
    if (storedTrip) setTrip(storedTrip);
  }, [storedTrip]);

  const [weatherByDate, setWeatherByDate] = useState<
    Record<string, WeatherInfo>
  >({});
  const imagesByActivityId = useActivityImages(trip);

  // ── Weather fetch (unchanged) ─────────────────────────────────────────
  const datesKey = useMemo(
    () => trip?.days.map((d) => d.date).join(",") ?? "",
    [trip],
  );

  useEffect(() => {
    if (!trip || !datesKey) return;
    let cancelled = false;
    const url =
      `/api/weather?location=${encodeURIComponent(trip.location)}` +
      `&dates=${encodeURIComponent(datesKey)}`;

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
  }, [trip?.location, datesKey, trip]);

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

  // ── Render guards ─────────────────────────────────────────────────────

  if (hydrated && !trip) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#121212] text-white">
        <div className="text-center">
          <p className="text-sm text-white/50">Viaggio non trovato.</p>
          <Link
            href="/"
            className="mt-4 inline-flex rounded-xl bg-white px-4 py-2 text-sm font-semibold text-gray-900 transition hover:bg-white/90"
          >
            Torna alla home
          </Link>
        </div>
      </div>
    );
  }

  if (!trip) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#121212] text-white/50">
        <p className="text-sm">Caricamento…</p>
      </div>
    );
  }

  const totalActivities = trip.days.reduce(
    (acc, d) => acc + d.activities.length,
    0,
  );

  return (
    <div className="min-h-screen bg-[#121212] text-white">
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

          {/* Title over image */}
          <div className="absolute inset-x-0 bottom-0 px-5 pb-5 sm:px-6 sm:pb-6">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-white drop-shadow-lg sm:text-3xl">
                  {trip.name}
                </h1>
                {trip.subtitle ? (
                  <p className="mt-1 text-sm text-white/70 drop-shadow">{trip.subtitle}</p>
                ) : null}
              </div>
              <Link
                href="/"
                className="hidden rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-sm font-semibold text-white backdrop-blur transition hover:bg-white/20 sm:inline-flex"
              >
                ← Home
              </Link>
            </div>
          </div>
        </div>

        {/* ── Trip info row ─────────────────────────────────────────────── */}
        <div className="mt-5 animate-fade-in-up px-1">
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
              {trip.days.length} giorni · {totalActivities} attività
            </span>
            {trip.accommodation ? (
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                  trip.accommodation,
                )}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/20 bg-emerald-500/10 px-3 py-1.5 text-emerald-200 transition hover:bg-emerald-500/20"
                title="Apri su Google Maps"
              >
                <span aria-hidden>🏨</span>
                {trip.accommodation}
              </a>
            ) : null}
            {trip.isUserCreated ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/20 bg-emerald-500/10 px-3 py-1.5 text-emerald-300">
                Generato con AI
              </span>
            ) : null}
          </div>
        </div>

        {/* ── Timeline ──────────────────────────────────────────────────── */}
        <DayTimeline
          days={trip.days}
          weatherByDate={weatherByDate}
          imagesByActivityId={imagesByActivityId}
          onChangeDays={handleChangeDays}
        />
      </main>
    </div>
  );
}
