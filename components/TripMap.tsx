"use client";

import { useEffect, useMemo, useState } from "react";
import {
  APIProvider,
  AdvancedMarker,
  InfoWindow,
  Map as GoogleMap,
  Polyline,
  useMap,
} from "@vis.gl/react-google-maps";
import PlaceRatingBadge from "./PlaceRatingBadge";
import type { GooglePlaceRating, Trip } from "../types";
import {
  buildTripMapCacheKey,
  getTripMapCache,
  setTripMapCache,
  type CachedAccommodationPoint,
  type CachedActivityPoint,
  type CachedLatLon,
} from "../lib/trip-map-cache";
import {
  hasTripGeoChanges,
  mapPointsFromTrip,
  mergeGeoIntoTrip,
  resolveTripMapPoints,
} from "../lib/trip-map-geo";

/**
 * Interactive trip map (Google Maps).
 *
 * Coordinates are read from `activity.geo` / `accommodation.geo` on the trip
 * (persisted to Supabase for signed-in users). Missing places are geocoded via
 * API, then saved back through `onTripGeoSaved`.
 */

export interface MapFocusTarget {
  activityId: string;
  /** Bumped on every Maps click (even same activity) to re-trigger open. */
  token: number;
}

interface TripMapProps {
  trip: Trip;
  /** Persists geocoded coordinates on the trip (e.g. `updateUserTrip`). */
  onTripGeoSaved?: (trip: Trip) => void;
  /** Expands map, scrolls into view, closes any open popup, then opens this activity. */
  focusTarget?: MapFocusTarget | null;
  /** Live Google ratings (same source as activity cards). */
  ratingForActivity?: (activityId: string) => GooglePlaceRating | undefined;
}

const DAY_COLORS = [
  "#34d399",
  "#60a5fa",
  "#f472b6",
  "#fbbf24",
  "#a78bfa",
  "#f87171",
  "#22d3ee",
  "#84cc16",
  "#fb923c",
  "#e879f9",
];

const ACCOMMODATION_COLOR = "#facc15";

const MAPS_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim() ?? "";

type ActivityPoint = CachedActivityPoint;
type AccommodationPoint = CachedAccommodationPoint;
type LatLon = CachedLatLon;

type MapPoint = ActivityPoint | AccommodationPoint;

function infoWindowKey(p: MapPoint): string {
  return p.kind === "activity" ? `act-${p.activityId}` : `acc-${p.id}`;
}

function PopupShell({
  onClose,
  children,
}: {
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="trip-map-popup relative box-border min-w-[200px] max-w-[272px] px-4 py-3.5 pr-11">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        className="absolute right-2.5 top-2.5 flex h-7 w-7 items-center justify-center rounded-md text-[20px] leading-none text-slate-400 transition hover:bg-slate-100 hover:text-slate-800"
        aria-label="Chiudi"
      >
        ×
      </button>
      {children}
    </div>
  );
}

function buildPopupContent(
  p: MapPoint,
  ratingForActivity?: (activityId: string) => GooglePlaceRating | undefined,
): React.ReactNode {
  if (p.kind === "accommodation") {
    return (
      <div className="flex flex-col gap-2 font-sans text-slate-900">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-700">
          Alloggio
        </p>
        <p className="text-sm font-semibold leading-snug">{p.name}</p>
      </div>
    );
  }
  const placeRating = ratingForActivity?.(p.activityId) ?? p.placeRating;

  return (
    <div className="flex flex-col gap-2 font-sans text-slate-900">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
        Giorno {p.dayIdx + 1}
      </p>
      <p className="text-sm font-semibold leading-snug">{p.title}</p>
      <p className="text-xs leading-relaxed text-slate-600">
        {p.time ? (
          <span className="font-semibold text-emerald-700">{p.time}</span>
        ) : null}
        {p.time && p.location ? (
          <span className="text-slate-400"> · </span>
        ) : null}
        {p.location}
      </p>
      {placeRating ? (
        <PlaceRatingBadge rating={placeRating} variant="google" />
      ) : null}
      {p.description ? (
        <p className="border-t border-slate-200/80 pt-2 text-xs leading-relaxed text-slate-700">
          {p.description}
        </p>
      ) : null}
      {p.mapsUrl ? (
        <a
          href={p.mapsUrl}
          target="_blank"
          rel="noreferrer"
          className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 hover:underline"
        >
          Apri in Google Maps
          <span aria-hidden>↗</span>
        </a>
      ) : null}
    </div>
  );
}

function NumberedMarkerPin({ color, label }: { color: string; label: string }) {
  return (
    <div
      className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-white/95 text-xs font-bold text-[#0a0a0a] shadow-md"
      style={{ background: color }}
    >
      {label}
    </div>
  );
}

function HomeMarkerPin({ color }: { color: string }) {
  return (
    <div
      className="flex h-[30px] w-[30px] items-center justify-center rounded-lg border-2 border-white/95 shadow-md"
      style={{ background: color }}
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="#0a0a0a"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M3 12l9-9 9 9" />
        <path d="M5 10v10h14V10" />
      </svg>
    </div>
  );
}

function persistMapResult(
  trip: Trip,
  cacheKey: string,
  result: {
    activities: CachedActivityPoint[];
    accommodations: CachedAccommodationPoint[];
  },
  onTripGeoSaved?: (trip: Trip) => void,
) {
  setTripMapCache(cacheKey, result);
  if (onTripGeoSaved) {
    const updated = mergeGeoIntoTrip(trip, result);
    if (hasTripGeoChanges(trip, updated)) onTripGeoSaved(updated);
  }
}

function FitMapBounds({
  points,
  disabled,
}: {
  points: Array<{ lat: number; lng: number }>;
  disabled?: boolean;
}) {
  const map = useMap();

  useEffect(() => {
    if (disabled || !map || points.length === 0) return;
    if (points.length === 1) {
      map.setCenter(points[0]);
      map.setZoom(13);
      return;
    }
    const bounds = new google.maps.LatLngBounds();
    for (const p of points) bounds.extend(p);
    map.fitBounds(bounds, { top: 40, right: 40, bottom: 40, left: 40 });
  }, [map, points, disabled]);

  return null;
}

/** Centers the map after an InfoWindow opens (popup needs time to lay out). */
function CenterOnInfoPoint({ infoPoint }: { infoPoint: MapPoint | null }) {
  const map = useMap();

  useEffect(() => {
    if (!map || !infoPoint) return;

    const position = {
      lat: infoPoint.point.lat,
      lng: infoPoint.point.lon,
    };

    const center = () => {
      map.panTo(position);
      const zoom = map.getZoom();
      if (zoom == null || zoom < 14) map.setZoom(14);
      // Shift view so the popup above the marker stays in frame.
      map.panBy(0, -140);
    };

    const t = window.setTimeout(center, 180);
    return () => window.clearTimeout(t);
  }, [
    map,
    infoPoint?.point.lat,
    infoPoint?.point.lon,
    infoPoint?.kind === "activity" ? infoPoint?.activityId : infoPoint?.id,
  ]);

  return null;
}

function TripMapGoogle({
  activities,
  accommodationPoints,
  selectedDay,
  infoPoint,
  onInfoPointChange,
  ratingForActivity,
}: {
  activities: ActivityPoint[];
  accommodationPoints: AccommodationPoint[];
  selectedDay: number | null;
  infoPoint: MapPoint | null;
  onInfoPointChange: (point: MapPoint | null) => void;
  ratingForActivity?: (activityId: string) => GooglePlaceRating | undefined;
}) {

  const visible = useMemo(
    () =>
      activities.filter(
        (a) => selectedDay === null || a.dayIdx === selectedDay,
      ),
    [activities, selectedDay],
  );

  const polylines = useMemo(() => {
    const byDay = new Map<number, ActivityPoint[]>();
    for (const a of visible) {
      const list = byDay.get(a.dayIdx) ?? [];
      list.push(a);
      byDay.set(a.dayIdx, list);
    }
    const lines: Array<{ dayIdx: number; path: google.maps.LatLngLiteral[] }> =
      [];
    for (const [dayIdx, list] of byDay.entries()) {
      if (list.length < 2) continue;
      lines.push({
        dayIdx,
        path: list.map((p) => ({ lat: p.point.lat, lng: p.point.lon })),
      });
    }
    return lines;
  }, [visible]);

  const fitPoints = useMemo(() => {
    const pts: google.maps.LatLngLiteral[] = visible.map((a) => ({
      lat: a.point.lat,
      lng: a.point.lon,
    }));
    for (const acc of accommodationPoints) {
      pts.push({ lat: acc.point.lat, lng: acc.point.lon });
    }
    return pts;
  }, [visible, accommodationPoints]);

  const runningIndex = useMemo(() => {
    const counts = new Map<number, number>();
    return visible.map((a) => {
      const i = (counts.get(a.dayIdx) ?? 0) + 1;
      counts.set(a.dayIdx, i);
      return i;
    });
  }, [visible]);

  const defaultCenter = fitPoints[0] ?? { lat: 41.9028, lng: 12.4964 };

  const closePopup = () => onInfoPointChange(null);

  return (
    <GoogleMap
      defaultCenter={defaultCenter}
      defaultZoom={5}
      mapId="DEMO_MAP_ID"
      gestureHandling="cooperative"
      disableDefaultUI={false}
      className="h-full w-full"
      reuseMaps
      onClick={closePopup}
    >
      <FitMapBounds points={fitPoints} disabled={!!infoPoint} />
      <CenterOnInfoPoint infoPoint={infoPoint} />

      {polylines.map(({ dayIdx, path }) => (
        <Polyline
          key={`line-${dayIdx}`}
          path={path}
          strokeColor={DAY_COLORS[dayIdx % DAY_COLORS.length]}
          strokeWeight={4}
          strokeOpacity={0.85}
        />
      ))}

      {visible.map((a, idx) => {
        const color = DAY_COLORS[a.dayIdx % DAY_COLORS.length];
        const label = String(runningIndex[idx]);
        return (
          <AdvancedMarker
            key={a.activityId}
            position={{ lat: a.point.lat, lng: a.point.lon }}
            onClick={(e) => {
              e.stop();
              onInfoPointChange(a);
            }}
          >
            <NumberedMarkerPin color={color} label={label} />
          </AdvancedMarker>
        );
      })}

      {accommodationPoints.map((acc) => (
        <AdvancedMarker
          key={acc.id}
          position={{ lat: acc.point.lat, lng: acc.point.lon }}
          onClick={(e) => {
            e.stop();
            onInfoPointChange(acc);
          }}
          zIndex={-100}
        >
          <HomeMarkerPin color={ACCOMMODATION_COLOR} />
        </AdvancedMarker>
      ))}

      {infoPoint ? (
        <InfoWindow
          key={infoWindowKey(infoPoint)}
          position={{
            lat: infoPoint.point.lat,
            lng: infoPoint.point.lon,
          }}
          headerDisabled
          onClose={closePopup}
          onCloseClick={closePopup}
        >
          <PopupShell onClose={closePopup}>
            {buildPopupContent(infoPoint, ratingForActivity)}
          </PopupShell>
        </InfoWindow>
      ) : null}
    </GoogleMap>
  );
}

const TripMap = ({
  trip,
  onTripGeoSaved,
  focusTarget = null,
  ratingForActivity,
}: TripMapProps) => {
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(
    null,
  );
  const [activities, setActivities] = useState<ActivityPoint[]>([]);
  const [accommodationPoints, setAccommodationPoints] = useState<
    AccommodationPoint[]
  >([]);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [infoPoint, setInfoPoint] = useState<MapPoint | null>(null);

  const totalActivities = useMemo(
    () => trip.days.reduce((acc, d) => acc + d.activities.length, 0),
    [trip],
  );

  const cacheKey = useMemo(() => buildTripMapCacheKey(trip), [trip]);

  const applyResult = (
    result: {
      activities: CachedActivityPoint[];
      accommodations: CachedAccommodationPoint[];
    },
    persist = true,
  ) => {
    setActivities(result.activities);
    setAccommodationPoints(result.accommodations);
    if (persist) persistMapResult(trip, cacheKey, result, onTripGeoSaved);
  };

  // Restore markers from trip JSON or browser cache when data changes.
  useEffect(() => {
    const fromTrip = mapPointsFromTrip(trip);
    if (fromTrip.complete) {
      setActivities(fromTrip.activities);
      setAccommodationPoints(fromTrip.accommodations);
      return;
    }
    const cached = getTripMapCache(cacheKey);
    if (cached) {
      setActivities(cached.activities);
      setAccommodationPoints(cached.accommodations);
    } else {
      setActivities([]);
      setAccommodationPoints([]);
    }
  }, [cacheKey, trip]);

  useEffect(() => {
    if (!expanded) return;
    let cancelled = false;

    const fromTrip = mapPointsFromTrip(trip);
    if (fromTrip.complete) {
      setActivities(fromTrip.activities);
      setAccommodationPoints(fromTrip.accommodations);
      setLoading(false);
      setProgress(null);
      return;
    }

    const cached = getTripMapCache(cacheKey);
    if (cached) {
      applyResult(cached);
      setLoading(false);
      setProgress(null);
      return;
    }

    setLoading(true);
    setProgress({ done: 0, total: 0 });
    resolveTripMapPoints(trip, (done, total) => {
      if (!cancelled) setProgress({ done, total });
    })
      .then(({ activities: acts, accommodations, updatedTrip }) => {
        if (cancelled) return;
        setActivities(acts);
        setAccommodationPoints(accommodations);
        setTripMapCache(cacheKey, { activities: acts, accommodations });
        if (onTripGeoSaved && hasTripGeoChanges(trip, updatedTrip)) {
          onTripGeoSaved(updatedTrip);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [expanded, cacheKey, trip, onTripGeoSaved]);

  const resolvedCount = activities.length;
  const missing =
    !loading && progress
      ? Math.max(
          0,
          progress.total - resolvedCount - accommodationPoints.length,
        )
      : 0;

  const mapReady = Boolean(MAPS_KEY);

  useEffect(() => {
    if (!focusTarget) return;
    setExpanded(true);
    const t = window.setTimeout(() => {
      document
        .getElementById("trip-map-section")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 80);
    return () => window.clearTimeout(t);
  }, [focusTarget?.activityId, focusTarget?.token]);

  // Close any open popup first, then open the newly requested activity.
  useEffect(() => {
    if (!focusTarget) return;

    setInfoPoint(null);

    if (loading) return;

    const { activityId } = focusTarget;
    const point = activities.find((a) => a.activityId === activityId);
    if (!point) return;

    let mapsUrl = point.mapsUrl;
    if (!mapsUrl) {
      for (const day of trip.days) {
        const a = day.activities.find((x) => x.id === activityId);
        if (a?.mapsUrl) {
          mapsUrl = a.mapsUrl;
          break;
        }
      }
    }
    const enriched: ActivityPoint = mapsUrl ? { ...point, mapsUrl } : point;

    const openTimer = window.setTimeout(() => {
      setSelectedDay(enriched.dayIdx);
      setInfoPoint(enriched);
    }, 80);

    return () => {
      window.clearTimeout(openTimer);
    };
  }, [
    focusTarget?.activityId,
    focusTarget?.token,
    activities,
    loading,
    trip.days,
  ]);

  return (
    <section
      id="trip-map-section"
      className="mt-6 scroll-mt-24 overflow-hidden rounded-2xl border border-white/[0.06] bg-[#161616] lg:scroll-mt-8"
    >
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className={`flex w-full items-center justify-between gap-3 px-5 py-4 text-left transition-colors hover:bg-white/[0.02] ${
          expanded ? "border-b border-white/[0.06]" : ""
        }`}
      >
        <div className="flex items-center gap-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-400/10 text-emerald-300">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M9 20l-5.447-2.724A2 2 0 0 1 2.5 15.5V5.382a1 1 0 0 1 1.447-.894L9 7" />
              <path d="M9 7v13" />
              <path d="M15 4v13" />
              <path d="M15 4l6 3v12.382a1 1 0 0 1-1.447.894L15 17" />
            </svg>
          </span>
          <div className="min-w-0">
            <h4 className="text-sm font-semibold text-white">
              Mappa del viaggio
            </h4>
            <p className="text-xs text-white/50">
              {totalActivities} attività
              {trip.accommodations?.length
                ? ` · ${trip.accommodations.length} ${trip.accommodations.length === 1 ? "alloggio" : "alloggi"}`
                : ""}
              {" · "}Google Maps
            </p>
          </div>
        </div>
        <svg
          aria-hidden
          viewBox="0 0 20 20"
          className={`h-4 w-4 shrink-0 text-white/40 transition-transform duration-300 ${
            expanded ? "rotate-180" : "rotate-0"
          }`}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M6 8l4 4 4-4" />
        </svg>
      </button>

      <div
        className={`grid transition-[grid-template-rows,opacity] duration-300 ease-in-out ${
          expanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
        }`}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="p-4">
            <div className="flex flex-wrap items-center gap-2 pb-3">
              <button
                type="button"
                onClick={() => setSelectedDay(null)}
                className={`rounded-full border px-3 py-1 text-[11px] font-medium transition ${
                  selectedDay === null
                    ? "border-white/20 bg-white/10 text-white"
                    : "border-white/[0.06] bg-white/[0.02] text-white/60 hover:bg-white/[0.06]"
                }`}
              >
                Tutti i giorni
              </button>
              {trip.days.map((d, idx) => {
                const color = DAY_COLORS[idx % DAY_COLORS.length];
                const active = selectedDay === idx;
                return (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() =>
                      setSelectedDay((cur) => (cur === idx ? null : idx))
                    }
                    className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-medium transition ${
                      active
                        ? "border-white/20 bg-white/10 text-white"
                        : "border-white/[0.06] bg-white/[0.02] text-white/60 hover:bg-white/[0.06]"
                    }`}
                    title={d.title}
                  >
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: color }}
                    />
                    Giorno {idx + 1}
                  </button>
                );
              })}
              {(trip.accommodations?.length ?? 0) > 0 ? (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-yellow-400/20 bg-yellow-400/10 px-3 py-1 text-[11px] font-medium text-yellow-200">
                  <span
                    className="inline-block h-2 w-2 rounded-sm"
                    style={{ backgroundColor: ACCOMMODATION_COLOR }}
                  />
                  Alloggi
                </span>
              ) : null}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pb-2 text-[11px] text-white/50">
              <span>
                {loading
                  ? progress
                    ? `Caricamento mappa… ${progress.done}/${progress.total}`
                    : "Caricamento mappa…"
                  : `${resolvedCount}/${totalActivities} attività localizzate${
                      missing > 0 ? ` · ${missing} non trovate` : ""
                    }`}
              </span>
              {!loading && resolvedCount === 0 && totalActivities > 0 ? (
                <span className="text-amber-300/80">
                  Impossibile localizzare le attività. Riprova più tardi.
                </span>
              ) : null}
            </div>

            {!mapReady ? (
              <div className="flex h-[420px] w-full items-center justify-center rounded-xl border border-amber-400/20 bg-amber-400/5 px-6 text-center text-sm text-amber-200/90">
                Configura{" "}
                <code className="mx-1 rounded bg-black/30 px-1.5 py-0.5 text-xs">
                  NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
                </code>{" "}
                in <code className="mx-1 text-xs">.env.local</code> per
                visualizzare la mappa. Vedi README.
              </div>
            ) : (
              <div className="trip-map-canvas h-[420px] w-full overflow-hidden rounded-xl border border-white/[0.06]">
                <APIProvider apiKey={MAPS_KEY}>
                  <TripMapGoogle
                    activities={activities}
                    accommodationPoints={accommodationPoints}
                    selectedDay={selectedDay}
                    infoPoint={infoPoint}
                    onInfoPointChange={setInfoPoint}
                    ratingForActivity={ratingForActivity}
                  />
                </APIProvider>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
};

export default TripMap;
