"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import type {
  Map as LeafletMap,
  LayerGroup,
  Marker,
  Polyline,
  LatLngBoundsExpression,
} from "leaflet";
import type { Accommodation, Day, Trip } from "../types";
import { geocode, type LatLon } from "../lib/geocode";

/**
 * Interactive trip map.
 *
 * Renders every activity (and accommodation) on an OpenStreetMap base
 * layer, colour-coded by day, with a polyline connecting each day's
 * stops in chronological order. The component:
 *
 *   - Lazy-loads Leaflet (it touches `window`) so it stays SSR-safe.
 *   - Uses our `/api/geocode` proxy + localStorage cache so each unique
 *     place is resolved exactly once per device.
 *   - Lets the user filter to a single day (clicking a colour chip) or
 *     show them all at once.
 *   - Auto-fits the map to whatever is currently visible.
 */

interface TripMapProps {
  trip: Trip;
}

// Distinct, color-blind friendly palette cycled across days.
const DAY_COLORS = [
  "#34d399", // emerald
  "#60a5fa", // sky
  "#f472b6", // pink
  "#fbbf24", // amber
  "#a78bfa", // violet
  "#f87171", // rose
  "#22d3ee", // cyan
  "#84cc16", // lime
  "#fb923c", // orange
  "#e879f9", // fuchsia
];

const ACCOMMODATION_COLOR = "#facc15"; // yellow-400

interface ActivityPoint {
  kind: "activity";
  dayIdx: number;
  activityId: string;
  title: string;
  time: string;
  description: string;
  location: string;
  point: LatLon;
}

interface AccommodationPoint {
  kind: "accommodation";
  id: string;
  name: string;
  point: LatLon;
}

type MapPoint = ActivityPoint | AccommodationPoint;

function buildPopupHtml(p: MapPoint): string {
  const escape = (s: string) =>
    s.replace(/[&<>"']/g, (c) =>
      c === "&"
        ? "&amp;"
        : c === "<"
        ? "&lt;"
        : c === ">"
        ? "&gt;"
        : c === '"'
        ? "&quot;"
        : "&#39;",
    );
  if (p.kind === "accommodation") {
    return `
      <div style="min-width:180px;font-family:Inter,system-ui,sans-serif;color:#0f0f0f">
        <div style="font-size:11px;font-weight:600;color:#a16207;text-transform:uppercase;letter-spacing:.04em">Alloggio</div>
        <div style="font-size:14px;font-weight:600;margin-top:2px">${escape(p.name)}</div>
      </div>`;
  }
  const time = p.time ? `<span style="color:#16a34a;font-weight:600">${escape(p.time)}</span> · ` : "";
  return `
    <div style="max-width:260px;font-family:Inter,system-ui,sans-serif;color:#0f0f0f">
      <div style="font-size:11px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:.04em">Giorno ${p.dayIdx + 1}</div>
      <div style="font-size:14px;font-weight:600;margin-top:2px;line-height:1.2">${escape(p.title)}</div>
      <div style="font-size:12px;margin-top:4px;color:#475569">${time}${escape(p.location)}</div>
      ${p.description ? `<div style="font-size:12px;margin-top:6px;color:#334155;line-height:1.4">${escape(p.description)}</div>` : ""}
    </div>`;
}

function makeNumberedIcon(L: typeof import("leaflet"), color: string, label: string) {
  return L.divIcon({
    className: "trip-map-marker",
    html: `<div style="
      width:28px;height:28px;border-radius:50%;
      background:${color};
      color:#0a0a0a;
      font-weight:700;font-size:12px;
      display:flex;align-items:center;justify-content:center;
      border:2px solid rgba(255,255,255,.95);
      box-shadow:0 2px 6px rgba(0,0,0,.45);
      font-family:Inter,system-ui,sans-serif;
    ">${label}</div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    popupAnchor: [0, -14],
  });
}

function makeHomeIcon(L: typeof import("leaflet"), color: string) {
  return L.divIcon({
    className: "trip-map-marker",
    html: `<div style="
      width:30px;height:30px;border-radius:8px;
      background:${color};
      display:flex;align-items:center;justify-content:center;
      border:2px solid rgba(255,255,255,.95);
      box-shadow:0 2px 6px rgba(0,0,0,.45);
      font-family:Inter,system-ui,sans-serif;
    ">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#0a0a0a" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M3 12l9-9 9 9"/><path d="M5 10v10h14V10"/>
      </svg>
    </div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
    popupAnchor: [0, -15],
  });
}

/** Resolves every activity + accommodation in the trip into lat/lon. */
async function geocodeTrip(
  trip: Trip,
  onProgress?: (done: number, total: number) => void,
): Promise<{ activities: ActivityPoint[]; accommodations: AccommodationPoint[] }> {
  const dest = trip.location;
  const tasks: Array<{ run: () => Promise<MapPoint | null> }> = [];

  trip.days.forEach((day, dayIdx) => {
    day.activities.forEach((a) => {
      tasks.push({
        run: async () => {
          const p = await geocode(a.location || dest, dest);
          if (!p) return null;
          return {
            kind: "activity",
            dayIdx,
            activityId: a.id,
            title: a.title,
            time: a.time,
            description: a.description,
            location: a.location,
            point: p,
          };
        },
      });
    });
  });

  (trip.accommodations ?? []).forEach((acc) => {
    tasks.push({
      run: async () => {
        const p = await geocode(acc.name, dest);
        if (!p) return null;
        return { kind: "accommodation", id: acc.id, name: acc.name, point: p };
      },
    });
  });

  const total = tasks.length;
  let done = 0;
  const settled = await Promise.all(
    tasks.map((t) =>
      t.run().then((r) => {
        done += 1;
        onProgress?.(done, total);
        return r;
      }),
    ),
  );

  const activities: ActivityPoint[] = [];
  const accommodations: AccommodationPoint[] = [];
  for (const r of settled) {
    if (!r) continue;
    if (r.kind === "activity") activities.push(r);
    else accommodations.push(r);
  }
  return { activities, accommodations };
}

const TripMap = ({ trip }: TripMapProps) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const layersRef = useRef<{
    markers: LayerGroup | null;
    lines: LayerGroup | null;
  }>({ markers: null, lines: null });
  const leafletRef = useRef<typeof import("leaflet") | null>(null);

  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [activities, setActivities] = useState<ActivityPoint[]>([]);
  const [accommodationPoints, setAccommodationPoints] = useState<AccommodationPoint[]>([]);
  /** `null` = show all days. */
  const [selectedDay, setSelectedDay] = useState<number | null>(null);

  const totalActivities = useMemo(
    () => trip.days.reduce((acc, d) => acc + d.activities.length, 0),
    [trip],
  );

  // Identity key for the data we need to geocode. Changes when any
  // activity/accommodation is added, removed, or its location edited.
  const dataKey = useMemo(() => {
    const acts = trip.days
      .flatMap((d) => d.activities.map((a) => `${a.id}:${a.location}`))
      .join("|");
    const accs = (trip.accommodations ?? [])
      .map((a) => `${a.id}:${a.name}`)
      .join("|");
    return `${trip.location}::${acts}::${accs}`;
  }, [trip]);

  // ── Geocode whenever the trip data changes (and only while expanded) ──
  useEffect(() => {
    if (!expanded) return;
    let cancelled = false;
    setLoading(true);
    setProgress({ done: 0, total: 0 });
    geocodeTrip(trip, (done, total) => {
      if (!cancelled) setProgress({ done, total });
    })
      .then(({ activities, accommodations }) => {
        if (cancelled) return;
        setActivities(activities);
        setAccommodationPoints(accommodations);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [expanded, dataKey, trip]);

  // ── Initialise the Leaflet map once the section is opened ─────────────
  useEffect(() => {
    if (!expanded) return;
    if (mapRef.current || !containerRef.current) return;
    let cancelled = false;
    (async () => {
      const L = await import("leaflet");
      if (cancelled || !containerRef.current) return;
      leafletRef.current = L;

      const map = L.map(containerRef.current, {
        zoomControl: true,
        scrollWheelZoom: false,
        attributionControl: true,
      }).setView([41.9028, 12.4964], 5);

      // CartoDB Voyager — light, Google-Maps-like base style (subtle road
      // colors, named POIs). Free to use with attribution and no API key.
      L.tileLayer(
        "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",
        {
          attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
          subdomains: "abcd",
          maxZoom: 19,
        },
      ).addTo(map);

      layersRef.current.lines = L.layerGroup().addTo(map);
      layersRef.current.markers = L.layerGroup().addTo(map);

      mapRef.current = map;
      // Make sure tiles fill the container after the section animates open.
      requestAnimationFrame(() => map.invalidateSize());
    })();
    return () => {
      cancelled = true;
    };
  }, [expanded]);

  // Cleanup on unmount.
  useEffect(
    () => () => {
      mapRef.current?.remove();
      mapRef.current = null;
      layersRef.current = { markers: null, lines: null };
    },
    [],
  );

  // ── Redraw layers whenever resolved data or the day filter changes ────
  useEffect(() => {
    const map = mapRef.current;
    const L = leafletRef.current;
    const markers = layersRef.current.markers;
    const lines = layersRef.current.lines;
    if (!map || !L || !markers || !lines) return;

    markers.clearLayers();
    lines.clearLayers();

    const visible = activities.filter(
      (a) => selectedDay === null || a.dayIdx === selectedDay,
    );

    // Per-day route lines (chronological inside a day) ──────────────────
    const byDay = new Map<number, ActivityPoint[]>();
    for (const a of visible) {
      const list = byDay.get(a.dayIdx) ?? [];
      list.push(a);
      byDay.set(a.dayIdx, list);
    }
    const allLatLngs: Array<[number, number]> = [];
    for (const [dayIdx, list] of byDay.entries()) {
      if (list.length < 2) {
        list.forEach((p) => allLatLngs.push([p.point.lat, p.point.lon]));
        continue;
      }
      const coords: Array<[number, number]> = list.map((p) => [p.point.lat, p.point.lon]);
      const color = DAY_COLORS[dayIdx % DAY_COLORS.length];
      L.polyline(coords, {
        color,
        weight: 4,
        opacity: 0.85,
        dashArray: "6 8",
      }).addTo(lines as LayerGroup) as Polyline;
      coords.forEach((c) => allLatLngs.push(c));
    }

    // Activity markers ───────────────────────────────────────────────────
    const indexByDay = new Map<number, number>();
    for (const a of visible) {
      const i = (indexByDay.get(a.dayIdx) ?? 0) + 1;
      indexByDay.set(a.dayIdx, i);
      const color = DAY_COLORS[a.dayIdx % DAY_COLORS.length];
      const m = L.marker([a.point.lat, a.point.lon], {
        icon: makeNumberedIcon(L, color, String(i)),
      }) as Marker;
      m.bindPopup(buildPopupHtml(a), { offset: L.point(0, -4) });
      m.addTo(markers as LayerGroup);
    }

    // Accommodation markers (always visible — they "anchor" the trip) ────
    for (const acc of accommodationPoints) {
      const m = L.marker([acc.point.lat, acc.point.lon], {
        icon: makeHomeIcon(L, ACCOMMODATION_COLOR),
        zIndexOffset: -100,
      }) as Marker;
      m.bindPopup(buildPopupHtml(acc), { offset: L.point(0, -4) });
      m.addTo(markers as LayerGroup);
      allLatLngs.push([acc.point.lat, acc.point.lon]);
    }

    // Fit bounds to whatever is now on the map ───────────────────────────
    if (allLatLngs.length === 1) {
      map.setView(allLatLngs[0], 13);
    } else if (allLatLngs.length > 1) {
      const bounds: LatLngBoundsExpression = allLatLngs;
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
    }
  }, [activities, accommodationPoints, selectedDay]);

  // Re-flow tiles when the section is opened/resized.
  useEffect(() => {
    if (!expanded) return;
    const map = mapRef.current;
    if (!map) return;
    const id = window.setTimeout(() => map.invalidateSize(), 350);
    return () => window.clearTimeout(id);
  }, [expanded]);

  const resolvedCount = activities.length;
  const missing =
    !loading && progress
      ? Math.max(0, progress.total - resolvedCount - accommodationPoints.length)
      : 0;

  return (
    <section className="mt-6 overflow-hidden rounded-2xl border border-white/[0.06] bg-[#161616]">
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
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
            {/* ── Day filter chips ───────────────────────────────────── */}
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

            {/* ── Status row ─────────────────────────────────────────── */}
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

            {/* ── Map container ──────────────────────────────────────── */}
            <div
              ref={containerRef}
              className="trip-map-canvas h-[420px] w-full overflow-hidden rounded-xl border border-white/[0.06] bg-[#e9e6df]"
            />
          </div>
        </div>
      </div>
    </section>
  );
};

export default TripMap;
