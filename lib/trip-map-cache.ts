"use client";

import type { GooglePlaceRating, Trip } from "../types";

/**
 * Trip-level map geocoding cache.
 *
 * Browser-only fallback cache (guests / before trip JSON has `geo`).
 * Logged-in users persist coordinates on the trip in Supabase instead.
 * Invalidates when activity locations or accommodations change.
 */

export interface CachedLatLon {
  lat: number;
  lon: number;
}

export interface CachedActivityPoint {
  kind: "activity";
  dayIdx: number;
  activityId: string;
  title: string;
  time: string;
  description: string;
  location: string;
  point: CachedLatLon;
  mapsUrl?: string;
  placeRating?: GooglePlaceRating;
}

export interface CachedAccommodationPoint {
  kind: "accommodation";
  id: string;
  name: string;
  point: CachedLatLon;
}

export interface TripMapCacheEntry {
  activities: CachedActivityPoint[];
  accommodations: CachedAccommodationPoint[];
  cachedAt: number;
}

const STORAGE_KEY = "ai-tinerary.trip-map-cache.v1";
const MAX_ENTRIES = 40;

const memory = new Map<string, TripMapCacheEntry>();

/** Fingerprint of everything that affects geocoding / markers. */
export function buildTripMapDataKey(trip: Trip): string {
  const acts = trip.days
    .flatMap((d) =>
      d.activities.map((a) => `${d.id}:${a.id}:${a.location}`),
    )
    .join("|");
  const accs = (trip.accommodations ?? [])
    .map((a) => `${a.id}:${a.name}`)
    .join("|");
  return `${trip.location}::${acts}::${accs}`;
}

export function buildTripMapCacheKey(trip: Trip): string {
  return `${trip.id}::${buildTripMapDataKey(trip)}`;
}

type PersistedStore = {
  entries: Record<string, TripMapCacheEntry>;
  order: string[];
};

function loadStore(): PersistedStore {
  if (typeof window === "undefined") {
    return { entries: {}, order: [] };
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { entries: {}, order: [] };
    const parsed = JSON.parse(raw) as PersistedStore;
    if (!parsed.entries || !Array.isArray(parsed.order)) {
      return { entries: {}, order: [] };
    }
    return parsed;
  } catch {
    return { entries: {}, order: [] };
  }
}

function persistStore(store: PersistedStore) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // Quota exceeded — drop oldest half and retry once.
    const trimmed: PersistedStore = {
      entries: {},
      order: store.order.slice(Math.floor(store.order.length / 2)),
    };
    for (const k of trimmed.order) {
      const e = store.entries[k];
      if (e) trimmed.entries[k] = e;
    }
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
    } catch {
      // Best effort only.
    }
  }
}

export function getTripMapCache(cacheKey: string): TripMapCacheEntry | null {
  const mem = memory.get(cacheKey);
  if (mem) return mem;

  const store = loadStore();
  const entry = store.entries[cacheKey];
  if (!entry) return null;

  memory.set(cacheKey, entry);
  return entry;
}

export function setTripMapCache(
  cacheKey: string,
  data: Omit<TripMapCacheEntry, "cachedAt">,
): void {
  const entry: TripMapCacheEntry = { ...data, cachedAt: Date.now() };
  memory.set(cacheKey, entry);

  const store = loadStore();
  store.entries[cacheKey] = entry;
  store.order = store.order.filter((k) => k !== cacheKey);
  store.order.push(cacheKey);

  while (store.order.length > MAX_ENTRIES) {
    const evict = store.order.shift();
    if (evict) delete store.entries[evict];
  }

  persistStore(store);
}
