import type { PlaceGeo } from "../types";
import { buildMapsQuery, buildMapsUrl } from "./maps";
import { geoQueryKey } from "./trip-map-geo";
import { isRestaurant } from "./restaurant";

/**
 * Server-side restaurant verification against OpenStreetMap (free, no key).
 *
 * For every restaurant activity we:
 *   1. Geocode its `location` via Nominatim.
 *      - If it resolves to a real food POI (amenity=restaurant/cafe/…) we keep
 *        it and just attach coordinates (`geo`) so it matches a real place.
 *   2. Otherwise (the AI invented a name / it's a generic area), we look up
 *      real restaurants nearby via the Overpass API and replace it with the
 *      best-tagged, closest one.
 *
 * Everything is best-effort and time-budgeted: any network/parse failure or a
 * blown deadline simply leaves the original activity untouched. It never throws.
 */

const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
const OVERPASS_URL = "https://overpass-api.de/api/interpreter";
const USER_AGENT =
  process.env.NOMINATIM_USER_AGENT?.trim() || "ai-tinerary/1.0";

/** OSM `amenity` values we treat as eateries. */
const FOOD_AMENITIES = new Set([
  "restaurant",
  "cafe",
  "fast_food",
  "bistro",
  "bar",
  "pub",
  "ice_cream",
  "food_court",
]);

/** Tags that signal a well-maintained (therefore more reputable) POI. */
const QUALITY_TAGS = [
  "cuisine",
  "website",
  "contact:website",
  "opening_hours",
  "phone",
  "contact:phone",
  "wikidata",
  "wikipedia",
  "brand",
  "stars",
];

/** Overall time budget for the whole verification pass (ms). */
const DEFAULT_BUDGET_MS = 9000;
/** Per-request network timeout (ms). */
const REQUEST_TIMEOUT_MS = 6000;
/** Min spacing between Nominatim calls (its usage policy: ~1 req/s). */
const NOMINATIM_MIN_MS = 1100;

export interface VerifyOptions {
  destination: string;
  /** Directions origin used to rebuild `mapsUrl` when a place is replaced. */
  origin?: string;
}

/** Minimal shape we read/write on an activity (works for `Activity` too). */
export interface VerifiableActivity {
  title: string;
  description: string;
  location: string;
  tags?: string[];
  mapsUrl?: string;
  geo?: PlaceGeo;
}

interface NominatimHit {
  lat: number;
  lon: number;
  class: string;
  type: string;
  displayName: string;
}

interface OsmCandidate {
  name: string;
  lat: number;
  lon: number;
  tags: Record<string, string>;
}

// ── Nominatim politeness queue (serialised, ~1 req/s) ──────────────────────
let nominatimTail: Promise<unknown> = Promise.resolve();
let lastNominatimAt = 0;

function enqueueNominatim<T>(work: () => Promise<T>): Promise<T> {
  const run = async (): Promise<T> => {
    const wait = Math.max(0, NOMINATIM_MIN_MS - (Date.now() - lastNominatimAt));
    if (wait) await sleep(wait);
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

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchJson(
  url: string,
  init?: RequestInit,
): Promise<unknown | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function geocodeNominatim(query: string): Promise<NominatimHit | null> {
  const q = query.trim();
  if (!q) return null;
  return enqueueNominatim(async () => {
    const url = new URL(NOMINATIM_URL);
    url.searchParams.set("q", q);
    url.searchParams.set("format", "json");
    url.searchParams.set("limit", "1");
    url.searchParams.set("addressdetails", "0");
    const data = (await fetchJson(url.toString(), {
      headers: { "User-Agent": USER_AGENT, "Accept-Language": "it,en;q=0.8" },
      cache: "no-store",
    })) as
      | Array<{
          lat: string;
          lon: string;
          class?: string;
          type?: string;
          display_name?: string;
        }>
      | null;
    const first = data?.[0];
    if (!first) return null;
    const lat = Number.parseFloat(first.lat);
    const lon = Number.parseFloat(first.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    return {
      lat,
      lon,
      class: first.class ?? "",
      type: first.type ?? "",
      displayName: first.display_name ?? "",
    };
  });
}

function isFoodPoi(hit: NominatimHit): boolean {
  return hit.class === "amenity" && FOOD_AMENITIES.has(hit.type);
}

async function overpassRestaurants(
  lat: number,
  lon: number,
  radius: number,
): Promise<OsmCandidate[]> {
  const filter = `["amenity"~"^(restaurant|cafe|fast_food|bistro|trattoria)$"]["name"]`;
  const query =
    `[out:json][timeout:8];` +
    `(node${filter}(around:${radius},${lat},${lon});` +
    `way${filter}(around:${radius},${lat},${lon}););` +
    `out center 60;`;
  const data = (await fetchJson(OVERPASS_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `data=${encodeURIComponent(query)}`,
    cache: "no-store",
  })) as {
    elements?: Array<{
      lat?: number;
      lon?: number;
      center?: { lat: number; lon: number };
      tags?: Record<string, string>;
    }>;
  } | null;

  const out: OsmCandidate[] = [];
  for (const el of data?.elements ?? []) {
    const name = el.tags?.name?.trim();
    if (!name) continue;
    const elat = el.lat ?? el.center?.lat;
    const elon = el.lon ?? el.center?.lon;
    if (!Number.isFinite(elat) || !Number.isFinite(elon)) continue;
    out.push({ name, lat: elat!, lon: elon!, tags: el.tags ?? {} });
  }
  return out;
}

function haversine(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number },
): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function qualityScore(tags: Record<string, string>): number {
  return QUALITY_TAGS.reduce((n, t) => (tags[t] ? n + 1 : n), 0);
}

/** Picks the most complete, closest restaurant not already used in the trip. */
function pickBest(
  candidates: OsmCandidate[],
  anchor: { lat: number; lon: number },
  usedNames: Set<string>,
): OsmCandidate | null {
  const ranked = candidates
    .filter((c) => !usedNames.has(c.name.toLowerCase()))
    .map((c) => ({
      c,
      score: qualityScore(c.tags),
      dist: haversine(anchor, c),
    }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.dist - b.dist;
    });
  return ranked[0]?.c ?? null;
}

function buildLocationString(
  cand: OsmCandidate,
  destination: string,
): string {
  const street = cand.tags["addr:street"];
  const num = cand.tags["addr:housenumber"];
  const streetPart = street ? (num ? `${street} ${num}` : street) : undefined;
  const tail = cand.tags["addr:city"] || destination;
  return [cand.name, streetPart, tail].filter(Boolean).join(", ");
}

/**
 * Meal-prefix words across the supported UI languages (it/en/fr/es/de). Used
 * to keep an opening label like "Lunch — …" / "Pranzo — …" when swapping in the
 * verified restaurant name.
 */
const MEAL_PREFIX_RE =
  /^(colazione|brunch|pranzo|cena|aperitivo|breakfast|lunch|dinner|supper|petit-déjeuner|petit déjeuner|déjeuner|dîner|apéritif|desayuno|almuerzo|comida|cena|merienda|frühstück|mittagessen|abendessen)/i;

/** Keeps any meal prefix from the original title, swapping in the real name. */
function buildTitle(originalTitle: string, name: string): string {
  const meal = originalTitle.match(MEAL_PREFIX_RE)?.[0];
  if (meal) {
    const cap = meal.charAt(0).toUpperCase() + meal.slice(1).toLowerCase();
    return `${cap} — ${name}`;
  }
  return name;
}

/**
 * Verifies/repairs a single restaurant activity. Returns a possibly-updated
 * copy; on any failure returns the input unchanged.
 */
export async function verifyRestaurantActivity<T extends VerifiableActivity>(
  activity: T,
  opts: VerifyOptions,
  ctx?: { usedNames?: Set<string>; fallbackAnchor?: NominatimHit | null },
): Promise<T> {
  try {
    const { destination, origin } = opts;
    const usedNames = ctx?.usedNames ?? new Set<string>();

    const hit = await geocodeNominatim(activity.location);

    // Real eatery → keep it, attach coordinates for the map.
    if (hit && isFoodPoi(hit)) {
      const label = (hit.displayName.split(",")[0] ?? activity.title).trim();
      if (label) usedNames.add(label.toLowerCase());
      usedNames.add(activity.location.split(",")[0]!.trim().toLowerCase());
      return {
        ...activity,
        geo: {
          lat: hit.lat,
          lon: hit.lon,
          queryKey: geoQueryKey(activity.location, destination),
        },
      };
    }

    // Not a real eatery → find a real one nearby and replace it.
    const anchor = hit ?? ctx?.fallbackAnchor ?? null;
    if (!anchor) return activity;

    let candidates = await overpassRestaurants(anchor.lat, anchor.lon, 1200);
    let best = pickBest(candidates, anchor, usedNames);
    if (!best) {
      candidates = await overpassRestaurants(anchor.lat, anchor.lon, 3500);
      best = pickBest(candidates, anchor, usedNames);
    }
    if (!best) return activity;

    usedNames.add(best.name.toLowerCase());
    const location = buildLocationString(best, destination);
    return {
      ...activity,
      title: buildTitle(activity.title, best.name),
      location,
      mapsUrl: buildMapsUrl(location, { destination, origin }),
      geo: {
        lat: best.lat,
        lon: best.lon,
        queryKey: geoQueryKey(location, destination),
      },
    };
  } catch {
    return activity;
  }
}

/**
 * Verifies every restaurant activity across the given days, replacing invented
 * ones with real nearby places. Best-effort within a time budget; unprocessed
 * activities are returned untouched.
 */
export async function verifyRestaurantsInDays<
  D extends { activities: VerifiableActivity[] },
>(days: D[], opts: VerifyOptions, budgetMs = DEFAULT_BUDGET_MS): Promise<D[]> {
  const deadline = Date.now() + budgetMs;
  const usedNames = new Set<string>();

  // Shared fallback anchor: the destination city centre, resolved once.
  let fallbackAnchor: NominatimHit | null = null;
  try {
    fallbackAnchor = await geocodeNominatim(opts.destination);
  } catch {
    fallbackAnchor = null;
  }

  const nextDays: D[] = [];
  for (const day of days) {
    const nextActivities: VerifiableActivity[] = [];
    for (const activity of day.activities) {
      const isFood = isRestaurant({
        tags: activity.tags,
        title: activity.title,
      });
      if (!isFood || Date.now() > deadline) {
        nextActivities.push(activity);
        continue;
      }
      const updated = await verifyRestaurantActivity(activity, opts, {
        usedNames,
        fallbackAnchor,
      });
      nextActivities.push(updated);
    }
    nextDays.push({ ...day, activities: nextActivities });
  }
  return nextDays;
}
