import { buildMapsQuery } from "./maps";

/** Italian (and other) country names → forms Nominatim/OSM recognizes. */
const COUNTRY_ALIASES: Record<string, string> = {
  spagna: "España",
  espana: "España",
  francia: "France",
  germania: "Deutschland",
  austria: "Österreich",
  osterreich: "Österreich",
  svizzera: "Switzerland",
  "regno unito": "United Kingdom",
  inghilterra: "England",
  portogallo: "Portugal",
  grecia: "Greece",
  croazia: "Croatia",
  ungheria: "Hungary",
  polonia: "Poland",
  turchia: "Turkey",
  giappone: "Japan",
  thailandia: "Thailand",
  "stati uniti": "United States",
};

const REGION_TOKENS = new Set([
  "maiorca",
  "mallorca",
  "sicilia",
  "sicily",
  "sardegna",
  "sardinia",
  "corsica",
  "creta",
  "crete",
]);

function normalizeCountryNames(text: string): string {
  let out = text;
  for (const [from, to] of Object.entries(COUNTRY_ALIASES)) {
    out = out.replace(new RegExp(`\\b${from}\\b`, "gi"), to);
  }
  return out;
}

/** All recognized country forms (Italian aliases + their normalized targets). */
const COUNTRY_FORMS = new Set<string>([
  "italia",
  "italy",
  "españa",
  "espana",
  "spain",
  "thailand",
  ...Object.keys(COUNTRY_ALIASES),
  ...Object.values(COUNTRY_ALIASES).map((v) => v.toLowerCase()),
]);

function isCountryToken(token: string): boolean {
  return COUNTRY_FORMS.has(token.trim().toLowerCase());
}

function isRegionToken(token: string): boolean {
  return REGION_TOKENS.has(token.trim().toLowerCase());
}

function expandStreetAbbreviations(text: string): string {
  return text.replace(/\bAv\.\s*/gi, "Avinguda ");
}

function uniqueNonEmpty(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out;
}

function looksLikeAddress(text: string): boolean {
  return (
    /\b\d{1,5}\b/.test(text) ||
    /\b(carrer|calle|via|street|avenue|avinguda|av\.?|straße|rue|strada|plaça|plaza|passeig)\b/i.test(
      text,
    )
  );
}

/** Strip a trailing postal code from a token: "Bangkok 10200" → "Bangkok". */
function stripPostalCode(token: string): string {
  return token
    .replace(/\b\d{4,6}\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * City token from "POI, Street, City PostalCode, Country, …".
 * Skips country and region (island) tokens and any trip-destination token.
 */
function extractCityFromParts(parts: string[]): string | null {
  const tail = parts.slice(1).map((p) => normalizeCountryNames(p.trim()));
  for (let i = tail.length - 1; i >= 0; i--) {
    const token = stripPostalCode(tail[i]!);
    if (!token || isCountryToken(token) || isRegionToken(token)) continue;
    return token;
  }
  return null;
}

/** Country token (localized) from the location parts or the destination. */
function extractCountry(parts: string[], destination?: string): string | null {
  for (let i = parts.length - 1; i >= 0; i--) {
    const token = normalizeCountryNames(parts[i]!.trim());
    if (isCountryToken(token)) return token;
  }
  if (destination) {
    const destParts = destination.split(",").map((p) => p.trim());
    for (let i = destParts.length - 1; i >= 0; i--) {
      const token = normalizeCountryNames(destParts[i]!);
      if (isCountryToken(token)) return token;
    }
  }
  return null;
}

/**
 * Ordered geocoder queries from most likely-to-resolve to simpler fallbacks.
 *
 * AI-generated locations are usually "POI, Street, City PostalCode, Country".
 * The full detailed string often misses on OSM, so we lead with the highest
 * hit-rate form (POI + city + country), then progressively simplify. All forms
 * are country-normalized (e.g. "Spagna" → "España", "Thailandia" → "Thailand").
 */
export function buildGeocodeFallbackQueries(
  location: string,
  destination?: string,
): string[] {
  const loc = location.trim();
  const dest = destination?.trim();
  const localizedLoc = normalizeCountryNames(expandStreetAbbreviations(loc));
  const localizedDest = dest ? normalizeCountryNames(dest) : undefined;
  const parts = loc.split(",").map((p) => p.trim()).filter(Boolean);
  const fallbacks: string[] = [];

  const poi = parts[0] ? expandStreetAbbreviations(parts[0]) : "";
  const city = extractCityFromParts(parts);
  const country = extractCountry(parts, dest);
  const ctx = [city, country].filter(Boolean).join(", ") || localizedDest;

  // 1. POI + city + country — best hit rate for named places.
  if (poi && !looksLikeAddress(poi) && ctx) {
    fallbacks.push(`${poi}, ${ctx}`);
  }

  // 2. Full localized location with destination context.
  fallbacks.push(buildMapsQuery(localizedLoc, localizedDest ?? dest));

  // 3. Address tail without the POI name (helps when the POI name confuses OSM).
  if (parts.length >= 2) {
    const addressTail = normalizeCountryNames(
      expandStreetAbbreviations(parts.slice(1).join(", ")),
    );
    if (looksLikeAddress(addressTail)) {
      fallbacks.push(buildMapsQuery(addressTail, localizedDest ?? dest));
    }
  }

  // 4. Coarsest fallback: city + country, so the marker at least lands nearby.
  if (ctx) fallbacks.push(ctx);

  return uniqueNonEmpty(fallbacks);
}
