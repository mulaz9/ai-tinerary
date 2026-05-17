"use client";

import { buildMapsQuery } from "./maps";

/**
 * Client-side geocoding helper.
 *
 * Resolves free-form location strings (the same ones we already feed to
 * Google Maps for directions) into lat/lon coordinates, using our
 * `/api/geocode` proxy in front of OpenStreetMap Nominatim.
 *
 * Two layers of cache:
 *   1. `localStorage` so the same place is never geocoded twice across
 *      sessions on a given device.
 *   2. An in-memory promise map so concurrent React renders share a single
 *      in-flight request.
 */

export interface LatLon {
  lat: number;
  lon: number;
}

const STORAGE_KEY = "ai-tinerary.geocode-cache.v1";

type CacheEntry = LatLon | null;

let memoryCache: Map<string, CacheEntry> | null = null;
const inflight = new Map<string, Promise<CacheEntry>>();

function normalize(query: string): string {
  return query.trim().replace(/\s+/g, " ").toLowerCase();
}

function loadCache(): Map<string, CacheEntry> {
  if (memoryCache) return memoryCache;
  memoryCache = new Map();
  if (typeof window === "undefined") return memoryCache;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return memoryCache;
    const parsed: Record<string, CacheEntry> = JSON.parse(raw);
    for (const [k, v] of Object.entries(parsed)) memoryCache.set(k, v);
  } catch {
    // Corrupted cache — ignore and start fresh.
  }
  return memoryCache;
}

function persistCache() {
  if (typeof window === "undefined" || !memoryCache) return;
  try {
    const obj: Record<string, CacheEntry> = {};
    for (const [k, v] of memoryCache.entries()) obj[k] = v;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
  } catch {
    // Quota / privacy mode — best effort only.
  }
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

  const cache = loadCache();
  if (cache.has(key)) return cache.get(key) ?? null;

  const existing = inflight.get(key);
  if (existing) return existing;

  const promise = (async (): Promise<CacheEntry> => {
    try {
      const res = await fetch(
        `/api/geocode?q=${encodeURIComponent(query)}`,
        { cache: "force-cache" },
      );
      if (!res.ok) return null;
      const data: { result: { lat: number; lon: number } | null } =
        await res.json();
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
  cache.set(key, value);
  persistCache();
  return value;
}
