/**
 * Pick the best Nominatim hit for a trip POI query, biased toward the trip
 * destination so "Duomo" doesn't land in the wrong country.
 */

export interface NominatimHit {
  lat: number;
  lon: number;
  displayName: string;
  class?: string;
  type?: string;
  importance?: number;
}

export interface LatLon {
  lat: number;
  lon: number;
}

const COUNTRY_TO_ISO: Record<string, string> = {
  italia: "it",
  italy: "it",
  spagna: "es",
  spain: "es",
  espana: "es",
  "españa": "es",
  francia: "fr",
  france: "fr",
  germania: "de",
  germany: "de",
  deutschland: "de",
  "regno unito": "gb",
  "united kingdom": "gb",
  uk: "gb",
  inghilterra: "gb",
  england: "gb",
  portogallo: "pt",
  portugal: "pt",
  grecia: "gr",
  greece: "gr",
  austria: "at",
  "österreich": "at",
  osterreich: "at",
  svizzera: "ch",
  switzerland: "ch",
  belgio: "be",
  belgium: "be",
  "paesi bassi": "nl",
  netherlands: "nl",
  olanda: "nl",
  croazia: "hr",
  croatia: "hr",
  ungheria: "hu",
  hungary: "hu",
  "repubblica ceca": "cz",
  "czech republic": "cz",
  czechia: "cz",
  polonia: "pl",
  poland: "pl",
  turchia: "tr",
  turkey: "tr",
  turkiye: "tr",
  thailandia: "th",
  thailand: "th",
  giappone: "jp",
  japan: "jp",
  "stati uniti": "us",
  "united states": "us",
  usa: "us",
};

const CLASS_BONUS: Record<string, number> = {
  tourism: 6,
  amenity: 6,
  historic: 6,
  building: 4,
  shop: 3,
  leisure: 3,
  railway: 2,
  highway: 1,
  place: 0,
  landuse: -1,
  boundary: -4,
  administrative: -5,
};

function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export function countryCodeFromDestination(destination?: string): string | null {
  if (!destination?.trim()) return null;
  const tail = destination.split(",").pop()?.trim();
  if (!tail) return null;
  return COUNTRY_TO_ISO[normalizeText(tail)] ?? null;
}

function haversineKm(a: LatLon, b: LatLon): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(h)));
}

function queryTokens(query: string): string[] {
  return normalizeText(query)
    .split(/[,;|/]+|\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 2);
}

function scoreHit(
  hit: NominatimHit,
  query: string,
  anchor?: LatLon | null,
): number {
  let score = (hit.importance ?? 0) * 12;
  score += CLASS_BONUS[hit.class ?? ""] ?? 0;

  const display = normalizeText(hit.displayName);
  const tokens = queryTokens(query);
  let matched = 0;
  for (const token of tokens) {
    if (display.includes(token)) matched += 1;
  }
  score += matched * 2.5;

  if (anchor) {
    const km = haversineKm(anchor, hit);
    if (km <= 3) score += 10;
    else if (km <= 15) score += 7;
    else if (km <= 60) score += 4;
    else if (km <= 150) score += 1;
    else if (km > 400) score -= 12;
    else if (km > 200) score -= 6;
  }

  return score;
}

export function pickBestNominatimHit(
  hits: NominatimHit[],
  query: string,
  anchor?: LatLon | null,
): NominatimHit | null {
  if (hits.length === 0) return null;
  if (hits.length === 1) return hits[0] ?? null;

  let best = hits[0]!;
  let bestScore = scoreHit(best, query, anchor);
  for (let i = 1; i < hits.length; i++) {
    const hit = hits[i]!;
    const nextScore = scoreHit(hit, query, anchor);
    if (nextScore > bestScore) {
      best = hit;
      bestScore = nextScore;
    }
  }
  return best;
}
