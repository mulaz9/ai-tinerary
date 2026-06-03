import { NextResponse } from "next/server";

/**
 * Google Places ratings proxy.
 *
 * Primary: Places API (New) — Text Search
 * Fallback: Places API (Legacy) — Find Place + Place Details
 *
 * GET  /api/places?q=Colosseo, Roma, Italia
 * POST /api/places { queries: string[] }
 *   → { results: Array<{ rating: number; reviewCount: number } | null> }
 *
 * Enable in Google Cloud: **Places API (New)** (`places.googleapis.com`).
 * Optional fallback: **Places API** (legacy).
 */

export const runtime = "nodejs";

const PLACES_NEW_SEARCH_URL = "https://places.googleapis.com/v1/places:searchText";
const FIND_PLACE_URL =
  "https://maps.googleapis.com/maps/api/place/findplacefromtext/json";
const PLACE_DETAILS_URL =
  "https://maps.googleapis.com/maps/api/place/details/json";

const GOOGLE_KEY =
  process.env.GOOGLE_MAPS_API_KEY?.trim() ||
  process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim() ||
  "";

export interface PlaceRatingResult {
  rating: number;
  reviewCount: number;
}

const cache = new Map<string, PlaceRatingResult | null>();

function normalize(q: string): string {
  return q.trim().replace(/\s+/g, " ").toLowerCase();
}

type PlacesNewResponse = {
  places?: Array<{
    rating?: number;
    userRatingCount?: number;
  }>;
  error?: { message?: string; status?: string };
};

async function searchTextNew(
  query: string,
): Promise<{ result: PlaceRatingResult | null; error?: string }> {
  const res = await fetch(PLACES_NEW_SEARCH_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": GOOGLE_KEY,
      "X-Goog-FieldMask": "places.rating,places.userRatingCount",
    },
    body: JSON.stringify({ textQuery: query }),
    cache: "no-store",
  });

  const data: PlacesNewResponse = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { result: null, error: data.error?.message ?? `HTTP ${res.status}` };
  }

  const place = data.places?.[0];
  if (!place) {
    return {
      result: null,
      error: data.error?.message ?? "Nessun luogo trovato per la query.",
    };
  }

  const rating = place.rating;
  const reviewCount = place.userRatingCount;
  if (
    typeof rating !== "number" ||
    !Number.isFinite(rating) ||
    typeof reviewCount !== "number" ||
    reviewCount < 0
  ) {
    return { result: null, error: "Luogo senza rating o recensioni." };
  }

  return { result: { rating, reviewCount } };
}

async function searchTextLegacy(query: string): Promise<PlaceRatingResult | null> {
  const findUrl = new URL(FIND_PLACE_URL);
  findUrl.searchParams.set("input", query);
  findUrl.searchParams.set("inputtype", "textquery");
  findUrl.searchParams.set("fields", "place_id");
  findUrl.searchParams.set("key", GOOGLE_KEY);

  const findRes = await fetch(findUrl.toString(), { cache: "no-store" });
  if (!findRes.ok) return null;

  const findData: {
    status: string;
    candidates?: Array<{ place_id?: string }>;
  } = await findRes.json();

  if (findData.status !== "OK" || !findData.candidates?.[0]?.place_id) {
    return null;
  }

  const placeId = findData.candidates[0].place_id;
  const detailsUrl = new URL(PLACE_DETAILS_URL);
  detailsUrl.searchParams.set("place_id", placeId);
  detailsUrl.searchParams.set("fields", "rating,user_ratings_total");
  detailsUrl.searchParams.set("key", GOOGLE_KEY);

  const detailsRes = await fetch(detailsUrl.toString(), { cache: "no-store" });
  if (!detailsRes.ok) return null;

  const detailsData: {
    status: string;
    result?: {
      rating?: number;
      user_ratings_total?: number;
    };
  } = await detailsRes.json();

  if (detailsData.status !== "OK" || !detailsData.result) return null;

  const rating = detailsData.result.rating;
  const reviewCount = detailsData.result.user_ratings_total;
  if (
    typeof rating !== "number" ||
    !Number.isFinite(rating) ||
    typeof reviewCount !== "number" ||
    reviewCount < 0
  ) {
    return null;
  }

  return { rating, reviewCount };
}

async function findPlaceRating(query: string): Promise<PlaceRatingResult | null> {
  const key = normalize(query);
  if (!key) return null;
  const cached = cache.get(key);
  if (cached) return cached;
  if (!GOOGLE_KEY) return null;

  let result: PlaceRatingResult | null = null;
  try {
    const fresh = await searchTextNew(query);
    result = fresh.result;
    if (!result) result = await searchTextLegacy(query);
  } catch {
    result = null;
  }

  if (result) cache.set(key, result);
  return result;
}

/** Dev-only: surface Google error without using the null cache. */
async function diagnosePlaceRating(query: string): Promise<{
  result: PlaceRatingResult | null;
  newApi?: string;
  legacy?: string;
}> {
  const fresh = await searchTextNew(query);
  if (fresh.result) {
    return { result: fresh.result };
  }

  const findUrl = new URL(FIND_PLACE_URL);
  findUrl.searchParams.set("input", query);
  findUrl.searchParams.set("inputtype", "textquery");
  findUrl.searchParams.set("fields", "place_id");
  findUrl.searchParams.set("key", GOOGLE_KEY);

  let legacy = "non testato";
  try {
    const findRes = await fetch(findUrl.toString(), { cache: "no-store" });
    const findData: { status: string; error_message?: string } =
      await findRes.json();
    legacy =
      findData.status === "OK"
        ? "OK (ma Place Details non eseguito in diagnose)"
        : findData.error_message ?? findData.status;
  } catch (e) {
    legacy = e instanceof Error ? e.message : "errore rete";
  }

  const legacyResult = await searchTextLegacy(query);
  return {
    result: legacyResult,
    newApi: fresh.error,
    legacy,
  };
}

const CONCURRENCY = 6;

async function findMany(queries: string[]): Promise<(PlaceRatingResult | null)[]> {
  const results: (PlaceRatingResult | null)[] = new Array(queries.length).fill(
    null,
  );
  const pending: Array<{ index: number; query: string }> = [];

  for (let i = 0; i < queries.length; i++) {
    const q = queries[i].trim();
    if (!q) continue;
    const nk = normalize(q);
    const cached = cache.get(nk);
    if (cached) {
      results[i] = cached;
      continue;
    }
    pending.push({ index: i, query: q });
  }

  for (let offset = 0; offset < pending.length; offset += CONCURRENCY) {
    const chunk = pending.slice(offset, offset + CONCURRENCY);
    const chunkResults = await Promise.all(
      chunk.map(({ query }) => findPlaceRating(query)),
    );
    for (let j = 0; j < chunk.length; j++) {
      results[chunk[j].index] = chunkResults[j];
    }
  }

  return results;
}

const CACHE_HEADERS = {
  "cache-control":
    "public, s-maxage=604800, stale-while-revalidate=86400",
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
  if (!GOOGLE_KEY) {
    return NextResponse.json(
      { error: "GOOGLE_MAPS_API_KEY non configurata." },
      { status: 503 },
    );
  }
  if (
    process.env.NODE_ENV === "development" &&
    searchParams.get("debug") === "1"
  ) {
    const diag = await diagnosePlaceRating(q);
    return NextResponse.json(
      {
        result: diag.result,
        configured: true,
        debug: {
          newApi: diag.newApi,
          legacy: diag.legacy,
          hint:
            "Usa GOOGLE_MAPS_API_KEY senza restrizioni HTTP referrer (solo IP o nessuna restrizione). Abilita Places API (New) sul progetto della chiave server.",
        },
      },
      { headers: { "cache-control": "no-store" } },
    );
  }

  const result = await findPlaceRating(q);
  return NextResponse.json(
    { result, configured: true },
    { headers: CACHE_HEADERS },
  );
}

export async function POST(req: Request) {
  if (!GOOGLE_KEY) {
    return NextResponse.json(
      { error: "GOOGLE_MAPS_API_KEY non configurata." },
      { status: 503 },
    );
  }

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
  if (raw.length > 30) {
    return NextResponse.json(
      { error: "Massimo 30 query per richiesta." },
      { status: 400 },
    );
  }

  const queries = raw.map((q) => String(q).trim()).filter(Boolean);
  const results = await findMany(queries);
  return NextResponse.json({ results }, { headers: CACHE_HEADERS });
}
