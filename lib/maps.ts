/**
 * Builds accurate Google Maps links from the free-form strings the AI (or the
 * user) gives us.
 *
 * The AI typically returns a bare place name in the `location` field, e.g.
 * `"Colosseo"` or `"Museo del Prado"`. Google Maps happily resolves those,
 * but without a city/country qualifier it can land on a same-name replica in
 * another country. To fix that we always disambiguate with the trip
 * destination unless the string already contains it or looks like a concrete
 * address / coordinate.
 *
 * All helpers are pure strings → URL; no external API calls.
 */

/** Matches `lat,lng` with an optional space, where lat ∈ [-90,90], lng ∈ [-180,180]. */
const COORD_RE =
  /^\s*-?\d{1,3}(?:\.\d+)?\s*,\s*-?\d{1,3}(?:\.\d+)?\s*$/;

/** Heuristics that indicate the string is already precise enough. */
function looksPrecise(location: string): boolean {
  const trimmed = location.trim();
  if (!trimmed) return false;
  if (COORD_RE.test(trimmed)) return true;
  // Street address: contains a house number anywhere (e.g. "Via Roma 12").
  if (/\b\d{1,5}\b/.test(trimmed) && /[a-zàèéìòù]/i.test(trimmed)) return true;
  return false;
}

/** Case/diacritic-insensitive containment. */
function includesLoose(haystack: string, needle: string): boolean {
  if (!needle) return false;
  const norm = (s: string) =>
    s
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  return norm(haystack).includes(norm(needle));
}

/**
 * Returns the best Maps search query for `location`, disambiguated with the
 * trip destination when needed.
 *
 * Examples (destination = "Roma, Italia"):
 *   "Colosseo"              → "Colosseo, Roma, Italia"
 *   "Colosseo, Roma"        → "Colosseo, Roma"           (already contains city)
 *   "Via dei Fori Imp. 1"   → "Via dei Fori Imp. 1, Roma, Italia"
 *   "41.8902,12.4922"       → "41.8902,12.4922"          (coordinate)
 */
export function buildMapsQuery(location: string, destination?: string): string {
  const loc = location.trim();
  if (!loc) return destination?.trim() ?? "";
  if (COORD_RE.test(loc)) return loc;

  const dest = destination?.trim();
  if (!dest) return loc;

  // If the location already mentions any destination token (city OR country),
  // we assume it's disambiguated and leave it alone. Using the first token
  // (usually the city name) handles the common case; we also check the full
  // string for safety.
  const destCity = dest.split(",")[0]?.trim();
  if (destCity && includesLoose(loc, destCity)) return loc;
  if (includesLoose(loc, dest)) return loc;

  // For addresses with a number, append the full "City, Country" tail; for
  // bare POIs the same rule works and is what travellers actually type.
  return `${loc}, ${dest}`;
}

/** URL for a Google Maps search of `location` in `destination` context. */
export function buildMapsSearchUrl(
  location: string,
  destination?: string,
): string {
  const query = buildMapsQuery(location, destination);
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    query,
  )}`;
}

/**
 * URL for a Google Maps directions view from `origin` to `location`. Both
 * endpoints are disambiguated with `destination` so the route starts/ends
 * where the user actually is, not at a same-name place on another continent.
 */
export function buildMapsDirectionsUrl(
  location: string,
  origin: string,
  destination?: string,
): string {
  const originQuery = buildMapsQuery(origin, destination);
  const destQuery = buildMapsQuery(location, destination);
  return (
    `https://www.google.com/maps/dir/?api=1` +
    `&origin=${encodeURIComponent(originQuery)}` +
    `&destination=${encodeURIComponent(destQuery)}`
  );
}

/**
 * URL for a TripAdvisor search of `location` (disambiguated with the trip
 * destination). Used for the "Recensioni" link-out on restaurant cards: the
 * real star rating lives on the destination page, so we never call a paid
 * ratings API.
 */
export function buildReviewsUrl(
  location: string,
  destination?: string,
): string {
  const query = buildMapsQuery(location, destination);
  return `https://www.tripadvisor.com/Search?q=${encodeURIComponent(query)}`;
}

/**
 * Convenience: pick between a search URL and a directions URL depending on
 * whether an accommodation/origin is known.
 */
export function buildMapsUrl(
  location: string,
  opts: { destination?: string; origin?: string } = {},
): string {
  const { destination, origin } = opts;
  const o = origin?.trim();
  if (o) return buildMapsDirectionsUrl(location, o, destination);
  return buildMapsSearchUrl(location, destination);
}

// Re-export the precision heuristic so the AI layer can decide, if it wants,
// whether a location string from the model was already qualified enough.
export { looksPrecise };
