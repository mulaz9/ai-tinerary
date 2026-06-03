"use client";

import { use, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Sidebar from "../../../../components/Sidebar";
import DayTimeline from "../../../../components/DayTimeline";
import SafeImage from "../../../../components/SafeImage";
import ManageAccommodationsDialog from "../../../../components/ManageAccommodationsDialog";
import TripMap, { type MapFocusTarget } from "../../../../components/TripMap";
import {
  fetchSharedTrip,
  resolveShareToken,
  saveVisitedShare,
  updateSharedTrip,
} from "../../../../lib/trip-sharing";
import { createSupabaseBrowserClient } from "../../../../lib/supabase/client";
import type { WeatherInfo } from "../../../../lib/weather";
import { useActivityImages } from "../../../../lib/use-activity-images";
import { usePlaceRatings } from "../../../../lib/use-place-ratings";
import { buildMapsSearchUrl, buildMapsUrl } from "../../../../lib/maps";
import {
  migrateTripAccommodations,
  originForDay,
} from "../../../../lib/trip-accommodations";
import { getCountryFromLocation } from "../../../../lib/country-flag";
import type { Day, SharePermission, Trip } from "../../../../types";

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

export default function SharedTripPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);
  const router = useRouter();

  const [trip, setTrip] = useState<Trip | null>(null);
  const [permission, setPermission] = useState<SharePermission>("read");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
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
  const imagesByActivityId = useActivityImages(trip ?? undefined);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const supabase = createSupabaseBrowserClient();
      if (!supabase) {
        setError("Supabase non configurato.");
        setLoading(false);
        return;
      }

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.push(
          `/login?next=${encodeURIComponent(`/trip/shared/${token}`)}`,
        );
        return;
      }

      const resolved = await resolveShareToken(token);
      if (!resolved) {
        if (!cancelled) {
          setError("Link di condivisione non valido o revocato.");
          setLoading(false);
        }
        return;
      }

      setPermission(resolved.permission);
      saveVisitedShare(token, resolved.tripId, resolved.permission);
      const tripData = await fetchSharedTrip(resolved.tripId);
      if (!cancelled) {
        if (tripData) {
          setTrip(tripData);
        } else {
          setError("Impossibile caricare il viaggio condiviso.");
        }
        setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [token, router]);

  // Weather fetch
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

  const commit = useCallback(
    (next: Trip) => {
      const normalized = applyMapsOrigin(next);
      setTrip(normalized);
      void updateSharedTrip(normalized);
    },
    [],
  );

  const { ratingForActivity } = usePlaceRatings(
    trip ?? undefined,
    permission === "write" ? commit : undefined,
  );

  const handleChangeDays = useCallback(
    (nextDays: Day[]) => {
      if (!trip) return;
      commit({ ...trip, days: nextDays });
    },
    [trip, commit],
  );

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#121212] text-white/50">
        <p className="text-sm">Caricamento viaggio condiviso…</p>
      </div>
    );
  }

  if (error || !trip) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#121212] text-white">
        <div className="text-center">
          <p className="text-sm text-white/50">
            {error ?? "Viaggio non trovato."}
          </p>
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

  const totalActivities = trip.days.reduce(
    (acc, d) => acc + d.activities.length,
    0,
  );
  const country = getCountryFromLocation(trip.location);

  return (
    <div className="min-h-screen bg-[#121212] text-white">
      <Sidebar />

      <main className="mx-auto max-w-6xl px-4 pb-24 sm:px-5 lg:ml-80 lg:pb-10">
        {/* Hero cover */}
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

          <div className="absolute inset-0 bg-gradient-to-t from-[#121212] via-[#121212]/60 to-transparent" />

          <div className="absolute inset-x-0 bottom-0 px-5 pb-5 sm:px-6 sm:pb-6">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <h1 className="flex flex-wrap items-center gap-2 text-2xl font-bold tracking-tight text-white drop-shadow-lg sm:text-3xl">
                  {country ? (
                    <span
                      className="text-3xl leading-none drop-shadow sm:text-4xl"
                      aria-label={`Bandiera ${country.code}`}
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
          </div>
        </div>

        {/* Trip info row */}
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
            {(trip.accommodations ?? []).map((acc) => (
              <a
                key={acc.id}
                href={buildMapsSearchUrl(acc.name, trip.location)}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/20 bg-emerald-500/10 px-3 py-1.5 text-emerald-200 transition hover:bg-emerald-500/20"
                title="Apri su Google Maps"
              >
                <span aria-hidden>🏨</span>
                {acc.name}
              </a>
            ))}
            {permission === "write" ? (
              <button
                type="button"
                onClick={() => setManageAccommodationsOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-white/15 bg-white/[0.02] px-3 py-1.5 text-white/60 transition hover:border-emerald-400/30 hover:bg-emerald-500/5 hover:text-emerald-200"
                title={
                  trip.accommodations?.length
                    ? "Gestisci alloggi"
                    : "Aggiungi alloggio"
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
                  ? "Gestisci alloggi"
                  : "Aggiungi alloggio"}
              </button>
            ) : null}
            <span className="inline-flex items-center gap-1 rounded-full border border-blue-400/20 bg-blue-500/10 px-3 py-1.5 text-blue-300">
              Condiviso ·{" "}
              {permission === "read" ? "sola lettura" : "lettura e scrittura"}
            </span>
          </div>
        </div>

        {/* Map */}
        <TripMap
          trip={trip}
          onTripGeoSaved={permission === "write" ? commit : undefined}
          focusTarget={mapFocus}
          ratingForActivity={ratingForActivity}
        />

        {/* Timeline */}
        <DayTimeline
          days={trip.days}
          weatherByDate={weatherByDate}
          imagesByActivityId={imagesByActivityId}
          destination={trip.location}
          accommodations={trip.accommodations ?? []}
          onChangeDays={permission === "write" ? handleChangeDays : undefined}
          onActivityShowOnMap={focusActivityOnMap}
          ratingForActivity={ratingForActivity}
        />
      </main>

      {permission === "write" && manageAccommodationsOpen ? (
        <ManageAccommodationsDialog
          onClose={() => setManageAccommodationsOpen(false)}
          trip={trip}
          onSave={(next) => commit(next)}
        />
      ) : null}
    </div>
  );
}
