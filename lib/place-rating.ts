"use client";

import { buildMapsQuery } from "./maps";
import type { GooglePlaceRating, Trip } from "../types";

/** Only successful ratings are cached (never `null` — failed lookups retry). */
const STORAGE_KEY = "ai-tinerary.place-rating-cache.v3";
const LEGACY_STORAGE_KEYS = [
  "ai-tinerary.place-rating-cache.v2",
  "ai-tinerary.place-rating-cache.v1",
];

let memoryCache: Map<string, GooglePlaceRating> | null = null;

function isValidRatingEntry(value: unknown): value is GooglePlaceRating {
  return (
    value !== null &&
    typeof value === "object" &&
    typeof (value as GooglePlaceRating).rating === "number" &&
    Number.isFinite((value as GooglePlaceRating).rating)
  );
}

export function ratingQueryKey(
  location: string,
  destination?: string,
): string {
  return buildMapsQuery(location, destination)
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

export function isRatingCurrent(
  rating: GooglePlaceRating | undefined,
  location: string,
  destination?: string,
): boolean {
  if (!rating?.queryKey) return false;
  return rating.queryKey === ratingQueryKey(location, destination);
}

function ingestParsedEntries(parsed: Record<string, unknown>) {
  const cache = loadCache();
  for (const [k, v] of Object.entries(parsed)) {
    if (isValidRatingEntry(v)) cache.set(k, v);
  }
}

function loadCache(): Map<string, GooglePlaceRating> {
  if (memoryCache) return memoryCache;
  memoryCache = new Map();
  if (typeof window === "undefined") return memoryCache;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      ingestParsedEntries(JSON.parse(raw) as Record<string, unknown>);
      return memoryCache;
    }
    for (const legacyKey of LEGACY_STORAGE_KEYS) {
      const legacyRaw = window.localStorage.getItem(legacyKey);
      if (!legacyRaw) continue;
      ingestParsedEntries(JSON.parse(legacyRaw) as Record<string, unknown>);
      persistCache();
      try {
        window.localStorage.removeItem(legacyKey);
      } catch {
        // ignore
      }
      break;
    }
  } catch {
    // ignore
  }
  return memoryCache;
}

function persistCache() {
  if (typeof window === "undefined" || !memoryCache) return;
  try {
    const obj: Record<string, GooglePlaceRating> = {};
    for (const [k, v] of memoryCache.entries()) obj[k] = v;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
  } catch {
    // ignore
  }
}

function getCached(key: string): GooglePlaceRating | undefined {
  return loadCache().get(key);
}

/** Persists successes only; removes stale negative entries. */
function setCached(key: string, value: GooglePlaceRating | null) {
  const cache = loadCache();
  if (value) cache.set(key, value);
  else cache.delete(key);
  persistCache();
}

export async function fetchPlaceRatingsBatch(
  items: Array<{ location: string; destination?: string }>,
): Promise<Array<GooglePlaceRating | null>> {
  const queries = items.map((item) =>
    buildMapsQuery(item.location, item.destination),
  );
  const keys = items.map((item) =>
    ratingQueryKey(item.location, item.destination),
  );
  const total = queries.length;
  const out: Array<GooglePlaceRating | null> = new Array(total).fill(null);
  const uncachedIndices: number[] = [];

  for (let i = 0; i < total; i++) {
    const key = keys[i];
    if (!key) continue;
    const hit = getCached(key);
    if (hit) {
      out[i] = hit;
    } else {
      uncachedIndices.push(i);
    }
  }

  if (uncachedIndices.length === 0) return out;

  const uncachedQueries = uncachedIndices.map((i) => queries[i]);
  try {
    const res = await fetch("/api/places", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ queries: uncachedQueries }),
    });
    if (!res.ok) return out;
    const data: {
      results: Array<{ rating: number; reviewCount: number } | null>;
    } = await res.json();

    for (let j = 0; j < uncachedIndices.length; j++) {
      const i = uncachedIndices[j];
      const r = data.results[j];
      const key = keys[i];
      const value: GooglePlaceRating | null = r
        ? { rating: r.rating, reviewCount: r.reviewCount, queryKey: key }
        : null;
      if (key) setCached(key, value);
      out[i] = value;
    }
  } catch {
    // best effort
  }

  return out;
}

export function mergeRatingsIntoTrip(
  trip: Trip,
  byActivityId: Map<string, GooglePlaceRating | null>,
): Trip {
  const dest = trip.location;
  const days = trip.days.map((day) => ({
    ...day,
    activities: day.activities.map((a) => {
      const loc = a.location || dest;
      const incoming = byActivityId.get(a.id);
      if (incoming) {
        return {
          ...a,
          placeRating: {
            ...incoming,
            queryKey: ratingQueryKey(loc, dest),
          },
        };
      }
      if (a.placeRating && !isRatingCurrent(a.placeRating, loc, dest)) {
        const { placeRating: _removed, ...rest } = a;
        return rest;
      }
      return a;
    }),
  }));
  return { ...trip, days };
}

export function collectActivitiesNeedingRatings(trip: Trip): Array<{
  activityId: string;
  location: string;
  destination: string;
}> {
  const dest = trip.location;
  const list: Array<{
    activityId: string;
    location: string;
    destination: string;
  }> = [];
  for (const day of trip.days) {
    for (const a of day.activities) {
      const loc = a.location?.trim() || dest;
      if (isRatingCurrent(a.placeRating, loc, dest)) continue;
      list.push({ activityId: a.id, location: loc, destination: dest });
    }
  }
  return list;
}

export function hasTripRatingChanges(before: Trip, after: Trip): boolean {
  return JSON.stringify(snapshotRatings(before)) !== JSON.stringify(snapshotRatings(after));
}

function snapshotRatings(trip: Trip): Record<string, GooglePlaceRating | null> {
  const out: Record<string, GooglePlaceRating | null> = {};
  for (const day of trip.days) {
    for (const a of day.activities) {
      out[a.id] = a.placeRating
        ? { ...a.placeRating }
        : null;
    }
  }
  return out;
}
