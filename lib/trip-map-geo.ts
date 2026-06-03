import { buildMapsQuery } from "./maps";
import type { Trip } from "../types";
import { geocodeBatch } from "./geocode";
import type {
  CachedAccommodationPoint,
  CachedActivityPoint,
  CachedLatLon,
} from "./trip-map-cache";

/** Normalized key for the string sent to the geocoder. */
export function geoQueryKey(location: string, destination?: string): string {
  return buildMapsQuery(location, destination)
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

export function isGeoCurrent(
  geo: { queryKey: string } | undefined,
  location: string,
  destination?: string,
): boolean {
  if (!geo?.queryKey) return false;
  return geo.queryKey === geoQueryKey(location, destination);
}

export function mapPointsFromTrip(trip: Trip): {
  activities: CachedActivityPoint[];
  accommodations: CachedAccommodationPoint[];
  complete: boolean;
} {
  const dest = trip.location;
  const activities: CachedActivityPoint[] = [];
  const accommodations: CachedAccommodationPoint[] = [];
  let expected = 0;
  let resolved = 0;

  trip.days.forEach((day, dayIdx) => {
    day.activities.forEach((a) => {
      expected += 1;
      const loc = a.location || dest;
      if (!isGeoCurrent(a.geo, loc, dest)) return;
      resolved += 1;
      activities.push({
        kind: "activity",
        dayIdx,
        activityId: a.id,
        title: a.title,
        time: a.time,
        description: a.description,
        location: a.location,
        point: { lat: a.geo!.lat, lon: a.geo!.lon },
        mapsUrl: a.mapsUrl,
        placeRating: a.placeRating,
      });
    });
  });

  for (const acc of trip.accommodations ?? []) {
    expected += 1;
    if (!isGeoCurrent(acc.geo, acc.name, dest)) continue;
    resolved += 1;
    accommodations.push({
      kind: "accommodation",
      id: acc.id,
      name: acc.name,
      point: { lat: acc.geo!.lat, lon: acc.geo!.lon },
    });
  }

  return {
    activities,
    accommodations,
    complete: expected === 0 || resolved === expected,
  };
}

export function mergeGeoIntoTrip(
  trip: Trip,
  data: {
    activities: CachedActivityPoint[];
    accommodations: CachedAccommodationPoint[];
  },
): Trip {
  const dest = trip.location;

  const accById = new Map(
    data.accommodations.map((a) => [a.id, a.point] as const),
  );

  const days = trip.days.map((day, dayIdx) => ({
    ...day,
    activities: day.activities.map((a) => {
      const loc = a.location || dest;
      const key = geoQueryKey(loc, dest);
      const pt = data.activities.find(
        (p) => p.activityId === a.id && p.dayIdx === dayIdx,
      );
      if (pt) {
        return {
          ...a,
          geo: { lat: pt.point.lat, lon: pt.point.lon, queryKey: key },
        };
      }
      if (a.geo && !isGeoCurrent(a.geo, loc, dest)) {
        const { geo: _removed, ...rest } = a;
        return rest;
      }
      return a;
    }),
  }));

  const accommodations = (trip.accommodations ?? []).map((acc) => {
    const pt = accById.get(acc.id);
    if (pt) {
      return {
        ...acc,
        geo: {
          lat: pt.lat,
          lon: pt.lon,
          queryKey: geoQueryKey(acc.name, dest),
        },
      };
    }
    if (acc.geo && !isGeoCurrent(acc.geo, acc.name, dest)) {
      const { geo: _removed, ...rest } = acc;
      return rest;
    }
    return acc;
  });

  return { ...trip, days, accommodations };
}

export function hasTripGeoChanges(before: Trip, after: Trip): boolean {
  return JSON.stringify(collectGeoSnapshot(before)) !== JSON.stringify(collectGeoSnapshot(after));
}

function collectGeoSnapshot(trip: Trip): Record<string, CachedLatLon | null> {
  const out: Record<string, CachedLatLon | null> = {};
  trip.days.forEach((d) => {
    d.activities.forEach((a) => {
      out[`a:${d.id}:${a.id}`] = a.geo
        ? { lat: a.geo.lat, lon: a.geo.lon }
        : null;
    });
  });
  for (const acc of trip.accommodations ?? []) {
    out[`acc:${acc.id}`] = acc.geo
      ? { lat: acc.geo.lat, lon: acc.geo.lon }
      : null;
  }
  return out;
}

/**
 * Builds map marker data: uses stored `geo` on the trip first, then geocodes
 * only missing places.
 */
export async function resolveTripMapPoints(
  trip: Trip,
  onProgress?: (done: number, total: number) => void,
): Promise<{
  activities: CachedActivityPoint[];
  accommodations: CachedAccommodationPoint[];
  updatedTrip: Trip;
}> {
  const dest = trip.location;
  type QueueItem = {
    location: string;
    destination?: string;
    meta:
      | { kind: "activity"; dayIdx: number; activity: Trip["days"][0]["activities"][0] }
      | { kind: "accommodation"; acc: { id: string; name: string } };
  };

  const queue: QueueItem[] = [];
  const prefilledActivities: CachedActivityPoint[] = [];
  const prefilledAccommodations: CachedAccommodationPoint[] = [];

  trip.days.forEach((day, dayIdx) => {
    day.activities.forEach((a) => {
      const loc = a.location || dest;
      if (isGeoCurrent(a.geo, loc, dest)) {
        prefilledActivities.push({
          kind: "activity",
          dayIdx,
          activityId: a.id,
          title: a.title,
          time: a.time,
          description: a.description,
          location: a.location,
          point: { lat: a.geo!.lat, lon: a.geo!.lon },
          mapsUrl: a.mapsUrl,
          placeRating: a.placeRating,
        });
        return;
      }
      queue.push({
        location: loc,
        destination: dest,
        meta: { kind: "activity", dayIdx, activity: a },
      });
    });
  });

  for (const acc of trip.accommodations ?? []) {
    if (isGeoCurrent(acc.geo, acc.name, dest)) {
      prefilledAccommodations.push({
        kind: "accommodation",
        id: acc.id,
        name: acc.name,
        point: { lat: acc.geo!.lat, lon: acc.geo!.lon },
      });
      continue;
    }
    queue.push({
      location: acc.name,
      destination: dest,
      meta: { kind: "accommodation", acc },
    });
  }

  const total = prefilledActivities.length + prefilledAccommodations.length + queue.length;
  let done = prefilledActivities.length + prefilledAccommodations.length;
  onProgress?.(done, total);

  const activities = [...prefilledActivities];
  const accommodations = [...prefilledAccommodations];

  const prefilledCount =
    prefilledActivities.length + prefilledAccommodations.length;

  if (queue.length > 0) {
    const coords = await geocodeBatch(
      queue.map(({ location, destination }) => ({ location, destination })),
      (batchDone, _batchTotal) => {
        onProgress?.(prefilledCount + batchDone, total);
      },
    );

    queue.forEach((item, i) => {
      const c = coords[i];
      if (!c) return;
      const meta = item.meta;
      if (meta.kind === "activity") {
        const a = meta.activity;
        activities.push({
          kind: "activity",
          dayIdx: meta.dayIdx,
          activityId: a.id,
          title: a.title,
          time: a.time,
          description: a.description,
          location: a.location,
          point: c,
          mapsUrl: a.mapsUrl,
          placeRating: a.placeRating,
        });
      } else {
        accommodations.push({
          kind: "accommodation",
          id: meta.acc.id,
          name: meta.acc.name,
          point: c,
        });
      }
    });
    done = total;
    onProgress?.(done, total);
  }

  const updatedTrip = mergeGeoIntoTrip(trip, { activities, accommodations });
  return { activities, accommodations, updatedTrip };
}
