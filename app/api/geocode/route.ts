import { NextResponse } from "next/server";

/**
 * Geocoding proxy over OpenStreetMap Nominatim.
 *
 * Why a proxy?
 *  - Nominatim's free tier requires a real `User-Agent` and "absolute
 *    maximum of 1 request per second" (see https://operations.osmfoundation.org/policies/nominatim/).
 *    Doing it from the browser would leak the page Referer and offer no
 *    rate-limit guarantees across users.
 *  - The route maintains an in-memory cache so repeated lookups for the
 *    same query are instant and don't hit Nominatim again.
 *  - A serial queue throttles outbound calls to 1.1 req/s globally
 *    regardless of how many parallel clients ask at once.
 *
 * GET /api/geocode?q=Colosseo, Roma, Italia
 *   → { result: { lat: number, lon: number, displayName: string } | null }
 */

export const runtime = "nodejs";
// Cache responses on the CDN for a long time — addresses don't move.
export const revalidate = 0;

const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
// Nominatim's policy requires a meaningful User-Agent. They actively
// block requests that look like default http-client UAs or use fake
// example.com contacts. Override via env if you want a custom contact.
const USER_AGENT =
  process.env.NOMINATIM_USER_AGENT?.trim() || "ai-tinerary/1.0";

interface GeocodeResult {
  lat: number;
  lon: number;
  displayName: string;
}

const cache = new Map<string, GeocodeResult | null>();

// Serial queue → at most one fetch in flight; minimum 1100ms between
// outbound calls. Resolves in FIFO order.
let queueTail: Promise<unknown> = Promise.resolve();
let lastCallAt = 0;
const MIN_INTERVAL_MS = 1100;

function enqueue<T>(work: () => Promise<T>): Promise<T> {
  const run = async (): Promise<T> => {
    const wait = Math.max(0, MIN_INTERVAL_MS - (Date.now() - lastCallAt));
    if (wait) await new Promise((r) => setTimeout(r, wait));
    try {
      return await work();
    } finally {
      lastCallAt = Date.now();
    }
  };
  const next = queueTail.then(run, run);
  queueTail = next.catch(() => undefined);
  return next;
}

function normalize(q: string): string {
  return q.trim().replace(/\s+/g, " ").toLowerCase();
}

async function geocodeOne(query: string): Promise<GeocodeResult | null> {
  const key = normalize(query);
  if (!key) return null;
  if (cache.has(key)) return cache.get(key) ?? null;

  const result = await enqueue(async () => {
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

  cache.set(key, result);
  return result;
}

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
  return NextResponse.json(
    { result },
    {
      headers: {
        // Geocoding results are stable for a very long time.
        "cache-control":
          "public, s-maxage=2592000, stale-while-revalidate=604800",
      },
    },
  );
}
