"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  Map as MapGL,
  Layer,
  Marker,
  Popup,
  Source,
  useMap,
  type MapLayerMouseEvent,
} from "react-map-gl/maplibre";
import type { FeatureCollection, LineString } from "geojson";
import "maplibre-gl/dist/maplibre-gl.css";
import type { Trip } from "../types";
import { GoogleMapsPinIcon } from "./BrandIcons";
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
  hydrateActivityPointsFromTrip,
  mapCacheCoversTrip,
  mapPointsFromTrip,
  mergeGeoIntoTrip,
  mergeMapPointsForDisplay,
  subscribeTripMapResolve,
  tripGeoFingerprint,
} from "../lib/trip-map-geo";

/**
 * Interactive trip map (MapLibre GL + OpenFreeMap, no API key / no billing).
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

/** Free vector tiles, no API key, no usage billing. */
const MAP_STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";

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
  const tCommon = useTranslations("common");
  return (
    <div className="trip-map-popup relative box-border min-w-[200px] max-w-[272px] px-4 py-3.5 pr-11">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        className="absolute right-2.5 top-2.5 flex h-7 w-7 items-center justify-center rounded-md text-[20px] leading-none text-slate-400 transition hover:bg-slate-100 hover:text-slate-800"
        aria-label={tCommon("close")}
      >
        ×
      </button>
      {children}
    </div>
  );
}

function buildPopupContent(
  p: MapPoint,
  trip: Trip,
  t: (key: string, values?: Record<string, string | number>) => string,
): React.ReactNode {
  if (p.kind === "accommodation") {
    const acc = trip.accommodations?.find((a) => a.id === p.id);
    const name = acc?.name ?? p.name;
    return (
      <div className="flex flex-col gap-2 font-sans text-slate-900">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-700">
          {t("accommodation")}
        </p>
        <p className="text-sm font-semibold leading-snug">{name}</p>
      </div>
    );
  }

  const activity = trip.days[p.dayIdx]?.activities.find(
    (a) => a.id === p.activityId,
  );
  const title = activity?.title ?? p.title;
  const time = activity?.time ?? p.time;
  const location = activity?.location ?? p.location;
  const description = activity?.description ?? p.description;
  const mapsUrl = activity?.mapsUrl ?? p.mapsUrl;

  return (
    <div className="flex flex-col gap-2 font-sans text-slate-900">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
        {t("day", { day: p.dayIdx + 1 })}
      </p>
      <p className="text-sm font-semibold leading-snug">{title}</p>
      <p className="text-xs leading-relaxed text-slate-600">
        {time ? (
          <span className="font-semibold text-emerald-700">{time}</span>
        ) : null}
        {time && location ? (
          <span className="text-slate-400"> · </span>
        ) : null}
        {location}
      </p>
      {description ? (
        <p className="border-t border-slate-200/80 pt-2 text-xs leading-relaxed text-slate-700">
          {description}
        </p>
      ) : null}
      {mapsUrl ? (
        <a
          href={mapsUrl}
          target="_blank"
          rel="noreferrer"
          className="mt-1 inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 hover:underline"
        >
          <GoogleMapsPinIcon size={14} />
          {t("openInGoogleMaps")}
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

function sameActivityPoints(
  a: CachedActivityPoint[],
  b: CachedActivityPoint[],
): boolean {
  if (a.length !== b.length) return false;
  return a.every(
    (p, i) =>
      p.activityId === b[i].activityId &&
      p.dayIdx === b[i].dayIdx &&
      p.point.lat === b[i].point.lat &&
      p.point.lon === b[i].point.lon,
  );
}

function sameAccommodationPoints(
  a: CachedAccommodationPoint[],
  b: CachedAccommodationPoint[],
): boolean {
  if (a.length !== b.length) return false;
  return a.every(
    (p, i) =>
      p.id === b[i].id &&
      p.point.lat === b[i].point.lat &&
      p.point.lon === b[i].point.lon,
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
  geoPersistedRef?: { current: string | null },
) {
  setTripMapCache(cacheKey, result);
  if (!onTripGeoSaved) return;

  const updated = mergeGeoIntoTrip(trip, result);
  if (!hasTripGeoChanges(trip, updated)) return;

  const persistKey = `${cacheKey}::${tripGeoFingerprint(updated)}`;
  if (geoPersistedRef?.current === persistKey) return;
  if (geoPersistedRef) geoPersistedRef.current = persistKey;
  onTripGeoSaved(updated);
}

function FitMapBounds({
  points,
  disabled,
}: {
  points: Array<{ lat: number; lng: number }>;
  disabled?: boolean;
}) {
  const { current: map } = useMap();

  useEffect(() => {
    if (disabled || !map || points.length === 0) return;
    if (points.length === 1) {
      map.flyTo({ center: [points[0].lng, points[0].lat], zoom: 13, duration: 0 });
      return;
    }
    let minLng = points[0].lng;
    let minLat = points[0].lat;
    let maxLng = points[0].lng;
    let maxLat = points[0].lat;
    for (const p of points) {
      minLng = Math.min(minLng, p.lng);
      minLat = Math.min(minLat, p.lat);
      maxLng = Math.max(maxLng, p.lng);
      maxLat = Math.max(maxLat, p.lat);
    }
    map.fitBounds(
      [
        [minLng, minLat],
        [maxLng, maxLat],
      ],
      { padding: 40, duration: 0 },
    );
  }, [map, points, disabled]);

  return null;
}

/** Centers the map after a popup opens (popup needs time to lay out). */
function CenterOnInfoPoint({ infoPoint }: { infoPoint: MapPoint | null }) {
  const { current: map } = useMap();

  useEffect(() => {
    if (!map || !infoPoint) return;

    const center = () => {
      const zoom = map.getZoom();
      // Shift view so the popup above the marker stays in frame (offset Y).
      map.easeTo({
        center: [infoPoint.point.lon, infoPoint.point.lat],
        zoom: zoom == null || zoom < 14 ? 14 : zoom,
        offset: [0, 140],
        duration: 400,
      });
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

function TripMapView({
  trip,
  activities,
  accommodationPoints,
  selectedDay,
  infoPoint,
  onInfoPointChange,
}: {
  trip: Trip;
  activities: ActivityPoint[];
  accommodationPoints: AccommodationPoint[];
  selectedDay: number | null;
  infoPoint: MapPoint | null;
  onInfoPointChange: (point: MapPoint | null) => void;
}) {
  const t = useTranslations("tripMap");

  const visible = useMemo(
    () =>
      activities.filter(
        (a) => selectedDay === null || a.dayIdx === selectedDay,
      ),
    [activities, selectedDay],
  );

  const lineData = useMemo<FeatureCollection<LineString>>(() => {
    const byDay = new Map<number, ActivityPoint[]>();
    for (const a of visible) {
      const list = byDay.get(a.dayIdx) ?? [];
      list.push(a);
      byDay.set(a.dayIdx, list);
    }
    const features: FeatureCollection<LineString>["features"] = [];
    for (const [dayIdx, list] of byDay.entries()) {
      if (list.length < 2) continue;
      features.push({
        type: "Feature",
        properties: { color: DAY_COLORS[dayIdx % DAY_COLORS.length] },
        geometry: {
          type: "LineString",
          coordinates: list.map((p) => [p.point.lon, p.point.lat]),
        },
      });
    }
    return { type: "FeatureCollection", features };
  }, [visible]);

  const fitPoints = useMemo(() => {
    const pts: Array<{ lat: number; lng: number }> = visible.map((a) => ({
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

  useEffect(() => {
    // #region agent log
    fetch("http://127.0.0.1:7872/ingest/266cf421-78fa-40dc-aeaf-b1a54776429d", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "89ffaa" },
      body: JSON.stringify({
        sessionId: "89ffaa",
        hypothesisId: "H2-H4",
        location: "TripMap.tsx:infoPoint-effect",
        message: "infoPoint state changed",
        data: {
          hasInfoPoint: !!infoPoint,
          kind: infoPoint?.kind ?? null,
          id:
            infoPoint?.kind === "activity"
              ? infoPoint.activityId
              : infoPoint?.id ?? null,
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
  }, [infoPoint]);

  return (
    <MapGL
      initialViewState={{
        longitude: defaultCenter.lng,
        latitude: defaultCenter.lat,
        zoom: 5,
      }}
      mapStyle={MAP_STYLE_URL}
      style={{ width: "100%", height: "100%" }}
      cooperativeGestures
      reuseMaps
      onClick={(_e: MapLayerMouseEvent) => {
        // #region agent log
        fetch("http://127.0.0.1:7872/ingest/266cf421-78fa-40dc-aeaf-b1a54776429d", {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "89ffaa" },
          body: JSON.stringify({
            sessionId: "89ffaa",
            hypothesisId: "H1",
            location: "TripMap.tsx:map-onClick",
            message: "map background clicked — closing popup",
            data: { hadInfoPoint: !!infoPoint },
            timestamp: Date.now(),
          }),
        }).catch(() => {});
        // #endregion
        closePopup();
      }}
    >
      <FitMapBounds points={fitPoints} disabled={!!infoPoint} />
      <CenterOnInfoPoint infoPoint={infoPoint} />

      <Source id="trip-day-lines" type="geojson" data={lineData}>
        <Layer
          id="trip-day-lines-layer"
          type="line"
          layout={{ "line-cap": "round", "line-join": "round" }}
          paint={{
            "line-color": ["get", "color"],
            "line-width": 4,
            "line-opacity": 0.85,
          }}
        />
      </Source>

      {visible.map((a, idx) => {
        const color = DAY_COLORS[a.dayIdx % DAY_COLORS.length];
        const label = String(runningIndex[idx]);
        return (
          <Marker
            key={a.activityId}
            longitude={a.point.lon}
            latitude={a.point.lat}
            anchor="center"
            onClick={(e) => {
              e.originalEvent.stopPropagation();
              // #region agent log
              fetch("http://127.0.0.1:7872/ingest/266cf421-78fa-40dc-aeaf-b1a54776429d", {
                method: "POST",
                headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "89ffaa" },
                body: JSON.stringify({
                  sessionId: "89ffaa",
                  hypothesisId: "H1-H3",
                  location: "TripMap.tsx:marker-onClick",
                  message: "activity marker clicked",
                  data: { activityId: a.activityId, dayIdx: a.dayIdx },
                  timestamp: Date.now(),
                }),
              }).catch(() => {});
              // #endregion
              onInfoPointChange(a);
            }}
          >
            <NumberedMarkerPin color={color} label={label} />
          </Marker>
        );
      })}

      {accommodationPoints.map((acc) => (
        <Marker
          key={acc.id}
          longitude={acc.point.lon}
          latitude={acc.point.lat}
          anchor="center"
          onClick={(e) => {
            e.originalEvent.stopPropagation();
            onInfoPointChange(acc);
          }}
        >
          <HomeMarkerPin color={ACCOMMODATION_COLOR} />
        </Marker>
      ))}

      {infoPoint ? (
        <Popup
          key={infoWindowKey(infoPoint)}
          longitude={infoPoint.point.lon}
          latitude={infoPoint.point.lat}
          anchor="bottom"
          offset={24}
          closeButton={false}
          closeOnClick={false}
          onClose={closePopup}
          className="trip-map-popup-wrapper"
        >
          <PopupShell onClose={closePopup}>
            {buildPopupContent(infoPoint, trip, t)}
          </PopupShell>
        </Popup>
      ) : null}
    </MapGL>
  );
}

const TripMap = ({
  trip,
  onTripGeoSaved,
  focusTarget = null,
}: TripMapProps) => {
  const t = useTranslations("tripMap");
  const tCommon = useTranslations("common");
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
  const geoPersistedRef = useRef<string | null>(null);
  const tripRef = useRef(trip);
  tripRef.current = trip;

  const totalActivities = useMemo(
    () => trip.days.reduce((acc, d) => acc + d.activities.length, 0),
    [trip],
  );

  const cacheKey = useMemo(() => buildTripMapCacheKey(trip), [trip]);

  useEffect(() => {
    geoPersistedRef.current = null;
  }, [cacheKey]);

  const applyResult = (
    result: {
      activities: CachedActivityPoint[];
      accommodations: CachedAccommodationPoint[];
    },
    persist = true,
  ) => {
    const hydrated = hydrateActivityPointsFromTrip(trip, result.activities);
    setActivities((prev) =>
      sameActivityPoints(prev, hydrated) ? prev : hydrated,
    );
    setAccommodationPoints((prev) =>
      sameAccommodationPoints(prev, result.accommodations)
        ? prev
        : result.accommodations,
    );
    if (persist) {
      persistMapResult(
        trip,
        cacheKey,
        { activities: hydrated, accommodations: result.accommodations },
        onTripGeoSaved,
        geoPersistedRef,
      );
    }
  };

  // Restore markers from trip JSON or browser cache when data changes.
  useEffect(() => {
    const cached = getTripMapCache(cacheKey);
    const display = mergeMapPointsForDisplay(trip, cached);
    let source: "trip" | "cache" | "merged" | "empty";
    if (display.complete) source = "trip";
    else if (!cached) source = "empty";
    else if (cached.activities.length + cached.accommodations.length === 0)
      source = "empty";
    else if (
      display.activities.length === cached.activities.length &&
      display.accommodations.length === cached.accommodations.length
    )
      source = "cache";
    else source = "merged";

    // #region agent log
    fetch("/api/debug-log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: "4dd1f4",
        hypothesisId: "H1-H3",
        location: "TripMap.tsx:restore-effect",
        message: "restore markers effect",
        data: {
          source,
          displayComplete: display.complete,
          activityCount: display.activities.length,
          accommodationCount: display.accommodations.length,
          totalActivities,
          cacheCovers: cached ? mapCacheCoversTrip(trip, cached) : false,
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion

    setActivities((prev) =>
      sameActivityPoints(prev, display.activities) ? prev : display.activities,
    );
    setAccommodationPoints((prev) =>
      sameAccommodationPoints(prev, display.accommodations)
        ? prev
        : display.accommodations,
    );
  }, [cacheKey, trip, totalActivities]);

  useEffect(() => {
    const tripSnapshot = tripRef.current;

    const fromTrip = mapPointsFromTrip(tripSnapshot);
    if (fromTrip.complete) {
      setLoading(false);
      setProgress(null);
      return;
    }

    const cached = getTripMapCache(cacheKey);
    if (cached && mapCacheCoversTrip(tripSnapshot, cached)) {
      applyResult(cached);
      setLoading(false);
      setProgress(null);
      return;
    }

    setLoading(true);
    setProgress({ done: 0, total: 0 });

    // #region agent log
    fetch("/api/debug-log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: "4dd1f4",
        hypothesisId: "H3-H5",
        location: "TripMap.tsx:resolve-geocode",
        message: "starting geocode (mount or cache miss)",
        data: {
          totalActivities,
          partialCacheActivities: cached?.activities.length ?? 0,
          cacheCovers: cached ? mapCacheCoversTrip(tripSnapshot, cached) : false,
          expanded,
          cacheKey,
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion

    const unsubscribe = subscribeTripMapResolve(cacheKey, tripSnapshot, {
      onProgress: (done, total) => {
        setProgress({ done, total });
      },
      onPartial: (partial) => {
        const hydrated = hydrateActivityPointsFromTrip(
          tripRef.current,
          partial.activities,
        );
        setActivities((prev) =>
          sameActivityPoints(prev, hydrated) ? prev : hydrated,
        );
        setAccommodationPoints((prev) =>
          sameAccommodationPoints(prev, partial.accommodations)
            ? prev
            : partial.accommodations,
        );
      },
      onDone: ({ activities: acts, accommodations, updatedTrip }) => {
        const hydrated = hydrateActivityPointsFromTrip(tripRef.current, acts);
        setActivities((prev) =>
          sameActivityPoints(prev, hydrated) ? prev : hydrated,
        );
        setAccommodationPoints((prev) =>
          sameAccommodationPoints(prev, accommodations)
            ? prev
            : accommodations,
        );
        setLoading(false);
        if (buildTripMapCacheKey(tripRef.current) === cacheKey) {
          setTripMapCache(cacheKey, { activities: hydrated, accommodations });
          persistMapResult(
            tripRef.current,
            cacheKey,
            { activities: hydrated, accommodations },
            onTripGeoSaved,
            geoPersistedRef,
          );
        }
        // #region agent log
        fetch("/api/debug-log", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId: "4dd1f4",
            hypothesisId: "H3-H5",
            location: "TripMap.tsx:geocode-done",
            message: "geocode finished",
            data: {
              resolvedActivities: hydrated.length,
              totalActivities,
              geoChanged: hasTripGeoChanges(tripRef.current, updatedTrip),
              cacheKey,
            },
            timestamp: Date.now(),
          }),
        }).catch(() => {});
        // #endregion
      },
      onError: () => {
        setLoading(false);
        // #region agent log
        fetch("/api/debug-log", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId: "4dd1f4",
            hypothesisId: "H3-H5",
            location: "TripMap.tsx:geocode-error",
            message: "geocode promise rejected",
            data: { cacheKey },
            timestamp: Date.now(),
          }),
        }).catch(() => {});
        // #endregion
      },
    });

    return unsubscribe;
  }, [cacheKey, onTripGeoSaved, totalActivities]);

  const resolvedCount = activities.length;
  const missing =
    !loading && progress
      ? Math.max(
          0,
          progress.total - resolvedCount - accommodationPoints.length,
        )
      : 0;

  useEffect(() => {
    if (!focusTarget) return;
    setExpanded(true);
    const t = window.setTimeout(() => {
      // #region agent log
      fetch("http://127.0.0.1:7872/ingest/266cf421-78fa-40dc-aeaf-b1a54776429d", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "89ffaa" },
        body: JSON.stringify({
          sessionId: "89ffaa",
          hypothesisId: "H5",
          location: "TripMap.tsx:scrollIntoView",
          message: "focusTarget triggered scrollIntoView",
          data: {
            activityId: focusTarget.activityId,
            token: focusTarget.token,
            scrollY: window.scrollY,
          },
          timestamp: Date.now(),
        }),
      }).catch(() => {});
      // #endregion
      document
        .getElementById("trip-map-section")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 80);
    return () => window.clearTimeout(t);
  }, [focusTarget?.activityId, focusTarget?.token]);

  useEffect(() => {
    let lastScrollY = window.scrollY;
    const onScroll = () => {
      const dy = Math.abs(window.scrollY - lastScrollY);
      if (dy > 80) {
        const section = document.getElementById("trip-map-section");
        const rect = section?.getBoundingClientRect();
        // #region agent log
        fetch("http://127.0.0.1:7872/ingest/266cf421-78fa-40dc-aeaf-b1a54776429d", {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "89ffaa" },
          body: JSON.stringify({
            sessionId: "89ffaa",
            hypothesisId: "H6-H7",
            location: "TripMap.tsx:scroll-jump",
            message: "large scroll delta detected",
            data: {
              expanded,
              scrollY: window.scrollY,
              delta: window.scrollY - lastScrollY,
              mapSectionTop: rect?.top ?? null,
            },
            timestamp: Date.now(),
          }),
        }).catch(() => {});
        // #endregion
      }
      lastScrollY = window.scrollY;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [expanded]);

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
        onClick={() => {
          setExpanded((v) => {
            const next = !v;
            // #region agent log
            fetch("http://127.0.0.1:7872/ingest/266cf421-78fa-40dc-aeaf-b1a54776429d", {
              method: "POST",
              headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "89ffaa" },
              body: JSON.stringify({
                sessionId: "89ffaa",
                hypothesisId: "H6-H7",
                location: "TripMap.tsx:toggle-expanded",
                message: "map expand/collapse toggled",
                data: { expanded: next, scrollY: window.scrollY },
                timestamp: Date.now(),
              }),
            }).catch(() => {});
            // #endregion
            return next;
          });
        }}
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
              {t("title")}
            </h4>
            <p className="text-xs text-white/50">
              {loading && progress
                ? t("loadingWithProgress", {
                    done: progress.done,
                    total: progress.total,
                  })
                : `${tCommon("activitiesCount", { count: totalActivities })}${
                    trip.accommodations?.length
                      ? ` · ${t("accommodationsCount", { count: trip.accommodations.length })}`
                      : ""
                  }${!loading && activities.length > 0 ? ` · ${t("localized", { resolved: activities.length, total: totalActivities })}` : ""}`}
              {" · "}OpenStreetMap
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
                {t("allDays")}
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
                    {t("day", { day: idx + 1 })}
                  </button>
                );
              })}
              {(trip.accommodations?.length ?? 0) > 0 ? (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-yellow-400/20 bg-yellow-400/10 px-3 py-1 text-[11px] font-medium text-yellow-200">
                  <span
                    className="inline-block h-2 w-2 rounded-sm"
                    style={{ backgroundColor: ACCOMMODATION_COLOR }}
                  />
                  {t("accommodationsLabel")}
                </span>
              ) : null}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pb-2 text-[11px] text-white/50">
              <span>
                {loading
                  ? progress
                    ? t("loadingWithProgress", {
                        done: progress.done,
                        total: progress.total,
                      })
                    : t("loading")
                  : `${t("localized", {
                      resolved: resolvedCount,
                      total: totalActivities,
                    })}${missing > 0 ? t("notFound", { count: missing }) : ""}`}
              </span>
              {!loading && resolvedCount === 0 && totalActivities > 0 ? (
                <span className="text-amber-300/80">
                  {t("cannotLocalize")}
                </span>
              ) : null}
            </div>

            <div className="trip-map-canvas h-[420px] w-full overflow-hidden rounded-xl border border-white/[0.06]">
              <TripMapView
                trip={trip}
                activities={activities}
                accommodationPoints={accommodationPoints}
                selectedDay={selectedDay}
                infoPoint={infoPoint}
                onInfoPointChange={setInfoPoint}
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default TripMap;
