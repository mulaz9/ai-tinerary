import { NextResponse } from "next/server";

/**
 * Geocoding proxy: free Nominatim / OpenStreetMap only (no API key, no billing).
 *
 * GET  /api/geocode?q=Colosseo, Roma, Italia
 *   → { result: { lat, lon, displayName } | null }
 *
 * POST /api/geocode  { queries: string[] }
 *   → { results: Array<{ lat, lon, displayName } | null> }
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

// Nominatim fallback: serial queue, 1.1s between outbound calls.
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

async function geocodeNominatim(query: string): Promise<GeocodeResult | null> {
  return enqueueNominatim(async () => {
    const url = new URL(NOMINATIM_URL);
    url.searchParams.set("q", query);
    url.searchParams.set("format", "json");
    url.searchParams.set("limit", "1");
    url.searchParams.set("addressdetails", "0");

    try {
      const res = await fetch(url.toString(), {
        headers: {
          "User-Agent": USER_AGENT,
          "Accept-Language": "it,en;q=0.8",
        },
        cache: "no-store",
      });
      if (!res.ok) return null;
      const data: Array<{
        lat: string;
        lon: string;
        display_name: string;
      }> = await res.json();
      const first = data[0];
      if (!first) return null;
      const lat = Number.parseFloat(first.lat);
      const lon = Number.parseFloat(first.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
      return { lat, lon, displayName: first.display_name };
    } catch {
      return null;
    }
  });
}

/** Resolve one query; uses cache, then Nominatim. */
export async function geocodeOne(query: string): Promise<GeocodeResult | null> {
  const key = normalize(query);
  if (!key) return null;
  if (cache.has(key)) return cache.get(key) ?? null;

  const result = await geocodeNominatim(query);

  cache.set(key, result);
  return result;
}

async function geocodeMany(queries: string[]): Promise<(GeocodeResult | null)[]> {
  const normalized = queries.map((q) => normalize(q));
  const results: (GeocodeResult | null)[] = new Array(queries.length).fill(
    null,
  );
  const pending: Array<{ index: number; query: string }> = [];

  for (let i = 0; i < queries.length; i++) {
    const key = normalized[i];
    if (!key) continue;
    if (cache.has(key)) {
      results[i] = cache.get(key) ?? null;
      continue;
    }
    pending.push({ index: i, query: queries[i].trim() });
  }

  if (pending.length === 0) return results;

  // Nominatim only, serial (rate-limited via the outbound queue).
  for (const { index, query } of pending) {
    results[index] = await geocodeOne(query);
  }
  return results;
}

const CACHE_HEADERS = {
  "cache-control":
    "public, s-maxage=2592000, stale-while-revalidate=604800",
};

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim();
  if (!q) {
    return NextResponse.json(
      { error: "Parametro richiesto: q." },
      { status: 400 },
    );
  }

  const result = await geocodeOne(q);
  return NextResponse.json({ result }, { headers: CACHE_HEADERS });
}

export async function POST(req: Request) {
  let body: { queries?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Body JSON non valido." },
      { status: 400 },
    );
  }

  const raw = body.queries;
  if (!Array.isArray(raw) || raw.length === 0) {
    return NextResponse.json(
      { error: "Parametro richiesto: queries (array non vuoto)." },
      { status: 400 },
    );
  }
  if (raw.length > 50) {
    return NextResponse.json(
      { error: "Massimo 50 query per richiesta." },
      { status: 400 },
    );
  }

  const queries = raw.map((q) => String(q).trim()).filter(Boolean);
  const results = await geocodeMany(queries);
  return NextResponse.json({ results }, { headers: CACHE_HEADERS });
}
