import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { NextResponse } from "next/server";
import { buildGeocodeFallbackQueries } from "../../../lib/geocode-fallbacks";
import { buildMapsQuery } from "../../../lib/maps";
import {
  countryCodeFromDestination,
  pickBestNominatimHit,
  type LatLon,
  type NominatimHit,
} from "../../../lib/nominatim-rank";
import { GEO_QUERY_VERSION } from "../../../lib/geo-query-version";

/**
 * Geocoding proxy: free Nominatim / OpenStreetMap only (no API key, no billing).
 *
 * GET  /api/geocode?q=Colosseo, Roma, Italia&dest=Roma, Italia
 *   → { result: { lat, lon, displayName } | null }
 *
 * POST /api/geocode  { items: [{ location, destination? }] }
 *   → { results: Array<{ lat, lon, displayName } | null> }
 *
 * Legacy POST { queries: string[] } is still supported.
 */

export const runtime = "nodejs";

const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
const USER_AGENT =
  process.env.NOMINATIM_USER_AGENT?.trim() || "ai-tinerary/1.0";

export interface GeocodeResult {
  lat: number;
  lon: number;
  displayName: string;
}

const cache = new Map<string, GeocodeResult | null>();

/**
 * Persistent on-disk cache for successful geocodes. Nominatim enforces a hard
 * 1 req/s policy, so geocoding a trip is expensive the first time. Persisting
 * resolved coordinates to disk means each unique address is only ever fetched
 * once for the whole machine — survives dev-server reloads and is shared across
 * every trip that references the same place.
 */
// GEO_QUERY_VERSION in the filename invalidates the cache on ranker changes.
const CACHE_FILE = join(
  process.cwd(),
  ".cache",
  `geocode-cache.${GEO_QUERY_VERSION}.json`,
);

/** Cap on persisted entries to keep the file from growing unbounded. */
const MAX_DISK_ENTRIES = 5000;

let cacheLoaded = false;
let saveTimer: ReturnType<typeof setTimeout> | null = null;

function loadDiskCache(): void {
  if (cacheLoaded) return;
  cacheLoaded = true;
  try {
    if (!existsSync(CACHE_FILE)) return;
    const parsed = JSON.parse(
      readFileSync(CACHE_FILE, "utf8"),
    ) as Record<string, GeocodeResult>;
    for (const [key, value] of Object.entries(parsed)) {
      if (value && Number.isFinite(value.lat) && Number.isFinite(value.lon)) {
        cache.set(key, value);
      }
    }
  } catch {
    // Corrupt or unreadable cache is non-fatal; we just re-geocode.
  }
}

function scheduleDiskSave(): void {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try {
      mkdirSync(dirname(CACHE_FILE), { recursive: true });
      const entries: Array<[string, GeocodeResult]> = [];
      for (const [key, value] of cache.entries()) {
        if (value) entries.push([key, value]);
      }
      // Maps iterate in insertion order — keep the most recent entries.
      const obj = Object.fromEntries(entries.slice(-MAX_DISK_ENTRIES));
      writeFileSync(CACHE_FILE, JSON.stringify(obj), "utf8");
    } catch {
      // Best effort: failing to persist just means we re-geocode next time.
    }
  }, 1500);
}

/** Store a result in memory and (for hits) persist it to disk. */
function cacheSet(key: string, value: GeocodeResult | null): void {
  cache.set(key, value);
  if (value) scheduleDiskSave();
}
const anchorCache = new Map<string, LatLon | null>();

let nominatimTail: Promise<unknown> = Promise.resolve();
let lastNominatimAt = 0;
const NOMINATIM_MIN_MS = 1100;

function normalize(q: string): string {
  return q.trim().replace(/\s+/g, " ").toLowerCase();
}

function enqueueNominatim<T>(work: () => Promise<T>): Promise<T> {
  const run = async (): Promise<T> => {
    const wait = Math.max(0, NOMINATIM_MIN_MS - (Date.now() - lastNominatimAt));
    if (wait) await new Promise((r) => setTimeout(r, wait));
    try {
      return await work();
    } finally {
      lastNominatimAt = Date.now();
    }
  };
  const next = nominatimTail.then(run, run);
  nominatimTail = next.catch(() => undefined);
  return next;
}

function parseNominatimHits(
  data: Array<{
    lat: string;
    lon: string;
    display_name: string;
    class?: string;
    type?: string;
    importance?: number;
  }>,
): NominatimHit[] {
  const hits: NominatimHit[] = [];
  for (const row of data) {
    const lat = Number.parseFloat(row.lat);
    const lon = Number.parseFloat(row.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    hits.push({
      lat,
      lon,
      displayName: row.display_name,
      class: row.class,
      type: row.type,
      importance: row.importance,
    });
  }
  return hits;
}

async function fetchNominatimHits(
  query: string,
  opts: { limit?: number; countryCode?: string | null } = {},
): Promise<NominatimHit[]> {
  return enqueueNominatim(async () => {
    const url = new URL(NOMINATIM_URL);
    url.searchParams.set("q", query);
    url.searchParams.set("format", "json");
    url.searchParams.set("limit", String(opts.limit ?? 8));
    url.searchParams.set("addressdetails", "0");
    if (opts.countryCode) {
      url.searchParams.set("countrycodes", opts.countryCode);
    }

    try {
      const res = await fetch(url.toString(), {
        headers: {
          "User-Agent": USER_AGENT,
          "Accept-Language": "it,en;q=0.8",
        },
        cache: "no-store",
      });
      if (res.status === 429) {
        await new Promise((r) => setTimeout(r, 3000));
        const retry = await fetch(url.toString(), {
          headers: {
            "User-Agent": USER_AGENT,
            "Accept-Language": "it,en;q=0.8",
          },
          cache: "no-store",
        });
        if (!retry.ok) return [];
        const data = (await retry.json()) as Array<{
          lat: string;
          lon: string;
          display_name: string;
          class?: string;
          type?: string;
          importance?: number;
        }>;
        return parseNominatimHits(Array.isArray(data) ? data : []);
      }
      if (!res.ok) return [];
      const data = (await res.json()) as Array<{
        lat: string;
        lon: string;
        display_name: string;
        class?: string;
        type?: string;
        importance?: number;
      }>;
      return parseNominatimHits(Array.isArray(data) ? data : []);
    } catch {
      return [];
    }
  });
}

async function getDestinationAnchor(destination?: string): Promise<LatLon | null> {
  const dest = destination?.trim();
  if (!dest) return null;
  const key = normalize(dest);
  if (anchorCache.has(key)) return anchorCache.get(key) ?? null;

  const countryCode = countryCodeFromDestination(dest);
  const hits = await fetchNominatimHits(dest, { limit: 3, countryCode });
  const best = pickBestNominatimHit(hits, dest, null);
  const anchor = best ? { lat: best.lat, lon: best.lon } : null;
  anchorCache.set(key, anchor);
  return anchor;
}

async function geocodeWithContext(
  location: string,
  destination?: string,
): Promise<GeocodeResult | null> {
  const anchor = await getDestinationAnchor(destination);
  const countryCode = countryCodeFromDestination(destination);
  const primaryKey = normalize(buildMapsQuery(location, destination));
  const queries = buildGeocodeFallbackQueries(location, destination);

  for (const query of queries.slice(0, 4)) {
    const key = normalize(query);
    if (!key) continue;

    const cached = cache.get(key);
    if (cached) return cached;

    let hits = await fetchNominatimHits(query, { limit: 8, countryCode });
    if (hits.length === 0 && countryCode) {
      hits = await fetchNominatimHits(query, { limit: 8 });
    }
    const best = pickBestNominatimHit(hits, query, anchor);
    if (!best) continue;

    const result = {
      lat: best.lat,
      lon: best.lon,
      displayName: best.displayName,
    };
    cacheSet(key, result);
    if (primaryKey && primaryKey !== key) cacheSet(primaryKey, result);
    return result;
  }

  return null;
}

async function geocodeOne(query: string, destination?: string): Promise<GeocodeResult | null> {
  if (destination) {
    return geocodeWithContext(query, destination);
  }
  const key = normalize(query);
  if (!key) return null;
  if (cache.has(key)) return cache.get(key) ?? null;

  const hits = await fetchNominatimHits(query, { limit: 8 });
  const best = pickBestNominatimHit(hits, query, null);
  const result = best
    ? { lat: best.lat, lon: best.lon, displayName: best.displayName }
    : null;
  if (result) cacheSet(key, result);
  return result;
}

type GeocodeItem = { location: string; destination?: string };

async function geocodeMany(items: GeocodeItem[]): Promise<(GeocodeResult | null)[]> {
  const results: (GeocodeResult | null)[] = new Array(items.length).fill(null);
  const pending: Array<{ index: number; item: GeocodeItem; query: string }> = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const query = buildMapsQuery(item.location, item.destination);
    const key = normalize(query);
    if (!key) continue;
    if (cache.has(key)) {
      const hit = cache.get(key);
      if (hit) {
        results[i] = hit;
        continue;
      }
    }
    pending.push({ index: i, item, query });
  }

  if (pending.length === 0) return results;

  const uniqueDestinations = [
    ...new Set(
      pending
        .map(({ item }) => item.destination?.trim())
        .filter((dest): dest is string => Boolean(dest)),
    ),
  ];
  await Promise.all(uniqueDestinations.map((dest) => getDestinationAnchor(dest)));

  for (const { index, item } of pending) {
    results[index] = await geocodeWithContext(item.location, item.destination);
  }

  return results;
}

/** Resolve many items but hit Nominatim once per unique location string. */
async function geocodeManyDeduped(
  items: GeocodeItem[],
): Promise<(GeocodeResult | null)[]> {
  const results: (GeocodeResult | null)[] = new Array(items.length).fill(null);
  const groups = new Map<string, number[]>();

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const query = buildMapsQuery(item.location, item.destination);
    const key = normalize(query);
    if (!key) continue;

    const cached = cache.get(key);
    if (cached) {
      results[i] = cached;
      continue;
    }

    const list = groups.get(key) ?? [];
    list.push(i);
    groups.set(key, list);
  }

  if (groups.size === 0) return results;

  const uniqueDestinations = [
    ...new Set(
      [...groups.values()]
        .flat()
        .map((index) => items[index]?.destination?.trim())
        .filter((dest): dest is string => Boolean(dest)),
    ),
  ];
  await Promise.all(uniqueDestinations.map((dest) => getDestinationAnchor(dest)));

  for (const indices of groups.values()) {
    const sample = items[indices[0]!]!;
    const resolved = await geocodeWithContext(
      sample.location,
      sample.destination,
    );
    for (const index of indices) {
      results[index] = resolved;
    }
  }

  return results;
}

const CACHE_HEADERS = {
  "cache-control":
    "public, s-maxage=2592000, stale-while-revalidate=604800",
};

export async function GET(req: Request) {
  loadDiskCache();
  const { searchParams } = new URL(req.url);
  const location =
    searchParams.get("location")?.trim() || searchParams.get("q")?.trim();
  const dest = searchParams.get("dest")?.trim() || undefined;
  if (!location) {
    return NextResponse.json(
      { error: "Parametro richiesto: location (o q)." },
      { status: 400 },
    );
  }

  const result = dest
    ? await geocodeWithContext(location, dest)
    : await geocodeOne(location);
  return NextResponse.json({ result }, { headers: CACHE_HEADERS });
}

export async function POST(req: Request) {
  loadDiskCache();
  let body: { queries?: unknown; items?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Body JSON non valido." },
      { status: 400 },
    );
  }

  if (Array.isArray(body.items) && body.items.length > 0) {
    if (body.items.length > 50) {
      return NextResponse.json(
        { error: "Massimo 50 query per richiesta." },
        { status: 400 },
      );
    }
    const items: GeocodeItem[] = body.items
      .map((raw) => {
        const row = raw as { location?: unknown; destination?: unknown };
        return {
          location: String(row.location ?? "").trim(),
          destination: row.destination
            ? String(row.destination).trim()
            : undefined,
        };
      })
      .filter((item) => item.location.length > 0);

    const results = await geocodeManyDeduped(items);
    return NextResponse.json({ results }, { headers: CACHE_HEADERS });
  }

  const raw = body.queries;
  if (!Array.isArray(raw) || raw.length === 0) {
    return NextResponse.json(
      { error: "Parametro richiesto: items o queries." },
      { status: 400 },
    );
  }
  if (raw.length > 50) {
    return NextResponse.json(
      { error: "Massimo 50 query per richiesta." },
      { status: 400 },
    );
  }

  const items: GeocodeItem[] = raw
    .map((q) => String(q).trim())
    .filter(Boolean)
    .map((query) => ({ location: query }));
  const results = await geocodeMany(items);
  return NextResponse.json({ results }, { headers: CACHE_HEADERS });
}
