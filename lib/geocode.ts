"use client";

import { buildMapsQuery } from "./maps";
import { GEO_QUERY_VERSION } from "./geo-query-version";

/**
 * Client-side geocoding helper.
 *
 * Resolves location strings into lat/lon via `/api/geocode` (Google
 * Geocoding when configured, else Nominatim). Cache: localStorage +
 * in-flight deduplication. Batch requests use POST for one round-trip.
 */

export interface LatLon {
  lat: number;
  lon: number;
}

/**
 * Only successful geocodes are cached (never `null`). The storage key embeds
 * GEO_QUERY_VERSION so bumping the ranker version invalidates stale entries.
 */
const STORAGE_KEY = `ai-tinerary.geocode-cache.v4.${GEO_QUERY_VERSION}`;
const LEGACY_STORAGE_KEYS = [
  "ai-tinerary.geocode-cache.v1",
  "ai-tinerary.geocode-cache.v3",
];

/** Keep the persisted cache bounded (~most recent entries win). */
const MAX_CACHE_ENTRIES = 500;

let memoryCache: Map<string, LatLon> | null = null;
const inflight = new Map<string, Promise<LatLon | null>>();

function normalize(query: string): string {
  return query.trim().replace(/\s+/g, " ").toLowerCase();
}

function isValidGeoEntry(value: unknown): value is LatLon {
  return (
    value !== null &&
    typeof value === "object" &&
    typeof (value as LatLon).lat === "number" &&
    typeof (value as LatLon).lon === "number" &&
    Number.isFinite((value as LatLon).lat) &&
    Number.isFinite((value as LatLon).lon)
  );
}

function ingestParsedEntries(parsed: Record<string, unknown>) {
  const cache = loadCache();
  for (const [k, v] of Object.entries(parsed)) {
    if (isValidGeoEntry(v)) cache.set(k, v);
  }
}

function loadCache(): Map<string, LatLon> {
  if (memoryCache) return memoryCache;
  memoryCache = new Map();
  if (typeof window === "undefined") return memoryCache;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      ingestParsedEntries(JSON.parse(raw) as Record<string, unknown>);
    }
    // Old versions may hold stale coordinates — just drop them.
    for (const legacyKey of LEGACY_STORAGE_KEYS) {
      try {
        window.localStorage.removeItem(legacyKey);
      } catch {
        // ignore
      }
    }
  } catch {
    // Corrupted cache — ignore and start fresh.
  }
  return memoryCache;
}

function persistCache() {
  if (typeof window === "undefined" || !memoryCache) return;
  try {
    // Bound the cache: Maps iterate in insertion order, so dropping the
    // oldest entries keeps the most recently added ones.
    while (memoryCache.size > MAX_CACHE_ENTRIES) {
      const oldest = memoryCache.keys().next().value;
      if (oldest === undefined) break;
      memoryCache.delete(oldest);
    }
    const obj: Record<string, LatLon> = {};
    for (const [k, v] of memoryCache.entries()) obj[k] = v;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
  } catch {
    // Quota / privacy mode — best effort only.
  }
}

function getCached(key: string): LatLon | undefined {
  return loadCache().get(key);
}

function setCached(key: string, value: LatLon | null) {
  const cache = loadCache();
  if (value) cache.set(key, value);
  else cache.delete(key);
  persistCache();
}

/**
 * Geocode a single query. Returns `null` when the place couldn't be
 * resolved. Repeated calls for the same input are deduplicated.
 */
export async function geocode(
  location: string,
  destination?: string,
): Promise<LatLon | null> {
  const query = buildMapsQuery(location, destination);
  const key = normalize(query);
  if (!key) return null;

  const hit = getCached(key);
  if (hit) return hit;

  const existing = inflight.get(key);
  if (existing) return existing;

  const promise = (async (): Promise<LatLon | null> => {
    try {
      const params = new URLSearchParams({ location, v: GEO_QUERY_VERSION });
      if (destination?.trim()) params.set("dest", destination.trim());
      // `v` keys the browser HTTP cache to the ranker version, so long-lived
      // Cache-Control headers don't serve stale coordinates after a bump.
      const res = await fetch(`/api/geocode?${params.toString()}`, {
        cache: "force-cache",
      });
      if (!res.ok) return null;
      const data: {
        result: { lat: number; lon: number } | null;
      } = await res.json();
      const r = data.result;
      return r ? { lat: r.lat, lon: r.lon } : null;
    } catch {
      return null;
    } finally {
      inflight.delete(key);
    }
  })();

  inflight.set(key, promise);
  const value = await promise;
  setCached(key, value);
  return value;
}

/**
 * Geocode many queries in one HTTP request. Returns results in the same
 * order as the input queries (after buildMapsQuery per item).
 */
export async function geocodeBatch(
  items: Array<{ location: string; destination?: string }>,
  onProgress?: (done: number, total: number) => void,
): Promise<Array<LatLon | null>> {
  const queries = items.map((item) =>
    buildMapsQuery(item.location, item.destination),
  );
  const keys = queries.map(normalize);
  const total = queries.length;
  const out: Array<LatLon | null> = new Array(total).fill(null);
  const uncachedIndices: number[] = [];

  for (let i = 0; i < total; i++) {
    const key = keys[i];
    if (!key) {
      onProgress?.(i + 1, total);
      continue;
    }
    const hit = getCached(key);
    if (hit) {
      out[i] = hit;
      onProgress?.(i + 1, total);
    } else {
      uncachedIndices.push(i);
    }
  }

  if (uncachedIndices.length === 0) return out;

  const BATCH_SIZE = 50;
  for (let start = 0; start < uncachedIndices.length; start += BATCH_SIZE) {
    const batchIndices = uncachedIndices.slice(start, start + BATCH_SIZE);
    const uncachedItems = batchIndices.map((i) => ({
      location: items[i].location,
      destination: items[i].destination,
    }));
    try {
      const res = await fetch("/api/geocode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: uncachedItems }),
      });
      if (!res.ok) {
        for (const i of batchIndices) {
          out[i] = await geocode(items[i].location, items[i].destination);
        }
      } else {
        const data: {
          results: Array<{ lat: number; lon: number } | null>;
        } = await res.json();
        for (let j = 0; j < batchIndices.length; j++) {
          const i = batchIndices[j];
          const r = data.results[j];
          const value = r ? { lat: r.lat, lon: r.lon } : null;
          out[i] = value;
          const key = keys[i];
          if (key) setCached(key, value);
        }
      }
      const done = out.filter((v) => v !== null).length;
      onProgress?.(done, total);
    } catch {
      for (const i of batchIndices) {
        out[i] = await geocode(items[i].location, items[i].destination);
      }
      onProgress?.(out.filter((v) => v !== null).length, total);
    }
  }

  return out;
}
