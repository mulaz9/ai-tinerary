import { buildMapsQuery } from "./maps";
import { GEO_QUERY_VERSION } from "./geo-query-version";
import type { Trip } from "../types";
import { geocodeBatch } from "./geocode";
import { setTripMapCache } from "./trip-map-cache";
import type {
  CachedAccommodationPoint,
  CachedActivityPoint,
  CachedLatLon,
} from "./trip-map-cache";

/** Bumped when geocoder ranking changes — invalidates stale stored coordinates. */
export { GEO_QUERY_VERSION } from "./geo-query-version";

/** Normalized key for the string sent to the geocoder. */
export function geoQueryKey(location: string, destination?: string): string {
  return `${GEO_QUERY_VERSION}:${buildMapsQuery(location, destination)
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase()}`;
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

/** Refreshes display fields on cached map points from the current trip text. */
export function hydrateActivityPointsFromTrip(
  trip: Trip,
  points: CachedActivityPoint[],
): CachedActivityPoint[] {
  const byKey = new Map<string, Trip["days"][0]["activities"][0]>();
  trip.days.forEach((day, dayIdx) => {
    day.activities.forEach((a) => {
      byKey.set(`${dayIdx}:${a.id}`, a);
    });
  });
  return points.map((p) => {
    const activity = byKey.get(`${p.dayIdx}:${p.activityId}`);
    if (!activity) return p;
    return {
      ...p,
      title: activity.title,
      time: activity.time,
      description: activity.description,
      location: activity.location,
      mapsUrl: activity.mapsUrl,
    };
  });
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

function collectGeoSnapshot(
  trip: Trip,
): Record<string, (CachedLatLon & { queryKey?: string }) | null> {
  const out: Record<string, (CachedLatLon & { queryKey?: string }) | null> =
    {};
  trip.days.forEach((d) => {
    d.activities.forEach((a) => {
      out[`a:${d.id}:${a.id}`] = a.geo
        ? { lat: a.geo.lat, lon: a.geo.lon, queryKey: a.geo.queryKey }
        : null;
    });
  });
  for (const acc of trip.accommodations ?? []) {
    out[`acc:${acc.id}`] = acc.geo
      ? { lat: acc.geo.lat, lon: acc.geo.lon, queryKey: acc.geo.queryKey }
      : null;
  }
  return out;
}

export function tripGeoFingerprint(trip: Trip): string {
  return JSON.stringify(collectGeoSnapshot(trip));
}

/** True when every place lacking current trip geo has a cached marker. */
export function mapCacheCoversTrip(
  trip: Trip,
  cached: {
    activities: CachedActivityPoint[];
    accommodations: CachedAccommodationPoint[];
  },
): boolean {
  const dest = trip.location;
  const cachedActKeys = new Set(
    cached.activities.map((p) => `${p.dayIdx}:${p.activityId}`),
  );
  const cachedAccIds = new Set(cached.accommodations.map((p) => p.id));

  for (let dayIdx = 0; dayIdx < trip.days.length; dayIdx++) {
    for (const a of trip.days[dayIdx].activities) {
      const loc = a.location || dest;
      if (isGeoCurrent(a.geo, loc, dest)) continue;
      if (!cachedActKeys.has(`${dayIdx}:${a.id}`)) return false;
    }
  }
  for (const acc of trip.accommodations ?? []) {
    if (isGeoCurrent(acc.geo, acc.name, dest)) continue;
    if (!cachedAccIds.has(acc.id)) return false;
  }
  return true;
}

/** Merges stored trip geo with a (possibly partial) browser cache for display. */
export function mergeMapPointsForDisplay(
  trip: Trip,
  cached: {
    activities: CachedActivityPoint[];
    accommodations: CachedAccommodationPoint[];
  } | null,
): {
  activities: CachedActivityPoint[];
  accommodations: CachedAccommodationPoint[];
  complete: boolean;
} {
  const fromTrip = mapPointsFromTrip(trip);
  if (fromTrip.complete) return fromTrip;
  if (!cached) {
    return {
      activities: fromTrip.activities,
      accommodations: fromTrip.accommodations,
      complete: false,
    };
  }

  const actKeys = new Set(
    fromTrip.activities.map((p) => `${p.dayIdx}:${p.activityId}`),
  );
  const mergedActs = [...fromTrip.activities];
  for (const p of hydrateActivityPointsFromTrip(trip, cached.activities)) {
    const key = `${p.dayIdx}:${p.activityId}`;
    if (actKeys.has(key)) continue;
    actKeys.add(key);
    mergedActs.push(p);
  }

  const accIds = new Set(fromTrip.accommodations.map((p) => p.id));
  const mergedAccs = [...fromTrip.accommodations];
  for (const p of cached.accommodations) {
    if (accIds.has(p.id)) continue;
    accIds.add(p.id);
    mergedAccs.push(p);
  }

  return {
    activities: mergedActs,
    accommodations: mergedAccs,
    complete: mapCacheCoversTrip(trip, {
      activities: mergedActs,
      accommodations: mergedAccs,
    }),
  };
}

/**
 * Builds map marker data: uses stored `geo` on the trip first, then geocodes
 * only missing places.
 */
export async function resolveTripMapPoints(
  trip: Trip,
  onProgress?: (done: number, total: number) => void,
  onPartial?: (data: {
    activities: CachedActivityPoint[];
    accommodations: CachedAccommodationPoint[];
  }) => void,
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

  const emitPartial = () => {
    onPartial?.({
      activities: [...activities],
      accommodations: [...accommodations],
    });
  };

  if (prefilledActivities.length + prefilledAccommodations.length > 0) {
    emitPartial();
  }

  if (queue.length > 0) {
    const batchItems: Array<{ location: string; destination?: string }> = [];
    const batchIndexByQueueIndex: number[] = [];
    const keyToBatchIdx = new Map<string, number>();

    for (const item of queue) {
      const key = geoQueryKey(item.location, dest);
      let batchIdx = keyToBatchIdx.get(key);
      if (batchIdx === undefined) {
        batchIdx = batchItems.length;
        keyToBatchIdx.set(key, batchIdx);
        batchItems.push({
          location: item.location,
          destination: item.destination,
        });
      }
      batchIndexByQueueIndex.push(batchIdx);
    }

    const CHUNK_SIZE = 3;
    for (let start = 0; start < batchItems.length; start += CHUNK_SIZE) {
      const chunkItems = batchItems.slice(start, start + CHUNK_SIZE);
      const chunkCoords = await geocodeBatch(
        chunkItems,
        (batchDone, batchTotal) => {
          const globalBatchDone = start + batchDone;
          const mappedDone =
            prefilledCount +
            Math.round(
              (globalBatchDone / Math.max(batchItems.length, 1)) *
                queue.length,
            );
          onProgress?.(Math.min(total, mappedDone), total);
        },
      );

      for (let j = 0; j < chunkItems.length; j++) {
        const batchIdx = start + j;
        const c = chunkCoords[j];
        if (!c) continue;

        for (let qi = 0; qi < queue.length; qi++) {
          if (batchIndexByQueueIndex[qi] !== batchIdx) continue;
          const item = queue[qi]!;
          const meta = item.meta;
          if (meta.kind === "activity") {
            const a = meta.activity;
            if (
              activities.some(
                (p) =>
                  p.kind === "activity" &&
                  p.activityId === a.id &&
                  p.dayIdx === meta.dayIdx,
              )
            ) {
              continue;
            }
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
            });
          } else if (
            !accommodations.some((p) => p.id === meta.acc.id)
          ) {
            accommodations.push({
              kind: "accommodation",
              id: meta.acc.id,
              name: meta.acc.name,
              point: c,
            });
          }
        }
      }
      emitPartial();
    }

    done = total;
    onProgress?.(done, total);
  }

  const updatedTrip = mergeGeoIntoTrip(trip, { activities, accommodations });
  return { activities, accommodations, updatedTrip };
}

export interface TripMapResolveResult {
  activities: CachedActivityPoint[];
  accommodations: CachedAccommodationPoint[];
  updatedTrip: Trip;
}

export interface TripMapResolveListener {
  onProgress?: (done: number, total: number) => void;
  onPartial?: (data: {
    activities: CachedActivityPoint[];
    accommodations: CachedAccommodationPoint[];
  }) => void;
  onDone?: (result: TripMapResolveResult) => void;
  onError?: (error: unknown) => void;
}

interface ResolveJob {
  promise: Promise<TripMapResolveResult>;
  listeners: Set<TripMapResolveListener>;
  lastProgress: { done: number; total: number } | null;
  lastPartial: {
    activities: CachedActivityPoint[];
    accommodations: CachedAccommodationPoint[];
  } | null;
  result: TripMapResolveResult | null;
  error: unknown;
  settled: boolean;
}

const jobByCacheKey = new Map<string, ResolveJob>();

/**
 * Runs ONE geocode job per cache key and fans out progress/partial/done to all
 * subscribers. Survives React Strict Mode remounts: a late subscriber gets the
 * latest known progress + partial points replayed immediately.
 *
 * Returns an unsubscribe function.
 */
export function subscribeTripMapResolve(
  cacheKey: string,
  trip: Trip,
  listener: TripMapResolveListener,
): () => void {
  let job = jobByCacheKey.get(cacheKey);

  if (!job) {
    const created: ResolveJob = {
      listeners: new Set(),
      lastProgress: null,
      lastPartial: null,
      result: null,
      error: null,
      settled: false,
      promise: Promise.resolve() as unknown as Promise<TripMapResolveResult>,
    };

    created.promise = resolveTripMapPoints(
      trip,
      (done, total) => {
        created.lastProgress = { done, total };
        for (const l of created.listeners) l.onProgress?.(done, total);
      },
      (partial) => {
        created.lastPartial = partial;
        // Persist incrementally so React remounts (Strict Mode) and slow
        // Nominatim runs don't reset the map back to 0 markers.
        try {
          setTripMapCache(cacheKey, {
            activities: partial.activities,
            accommodations: partial.accommodations,
          });
        } catch {
          // best effort
        }
        for (const l of created.listeners) l.onPartial?.(partial);
      },
    )
      .then((result) => {
        created.result = result;
        created.settled = true;
        for (const l of created.listeners) l.onDone?.(result);
        return result;
      })
      .catch((error) => {
        created.error = error;
        created.settled = true;
        for (const l of created.listeners) l.onError?.(error);
        throw error;
      })
      .finally(() => {
        // Keep the entry briefly so very-late remounts still get onDone,
        // then free memory.
        setTimeout(() => jobByCacheKey.delete(cacheKey), 5000);
      }) as Promise<TripMapResolveResult>;

    jobByCacheKey.set(cacheKey, created);
    job = created;
  }

  job.listeners.add(listener);

  // Replay latest known state to this (possibly late) subscriber.
  if (job.lastPartial) listener.onPartial?.(job.lastPartial);
  if (job.lastProgress)
    listener.onProgress?.(job.lastProgress.done, job.lastProgress.total);
  if (job.settled) {
    if (job.error !== null) listener.onError?.(job.error);
    else if (job.result) listener.onDone?.(job.result);
  }

  return () => {
    job?.listeners.delete(listener);
  };
}
