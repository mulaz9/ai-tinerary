/**
 * Resolves royalty-free photos for a free-form place query, with a chain
 * of progressively-broader fallbacks so we (almost) never end up with a
 * blank gradient on a card.
 *
 * Strategy, in order:
 *
 *   1. Openverse (Wikimedia / CC aggregator) on the original query.
 *   2. Openverse on simplified variants of the query (numeric addresses
 *      stripped, "Via/Piazza/…" components removed, then bare POI name,
 *      then bare "City, Country", then bare "Country"). The first hit wins.
 *   3. Wikipedia (Italian then English) generator-search for the same set
 *      of variants — covers famous POIs that Openverse doesn't index.
 *   4. (Optional) An explicit `cityFallback` query on Openverse — useful
 *      when the caller wants to guarantee at least a city photo for cards
 *      that match nothing else (e.g. anonymous restaurants).
 *
 * Used both at AI-generation time (trip cover image) and at render time
 * (per-activity thumbnails) so every consumer benefits from the same
 * fallback chain.
 */

interface OpenverseImage {
  url?: string;
  thumbnail?: string;
}

interface OpenverseSearchResponse {
  results?: OpenverseImage[];
}

const OPENVERSE_ENDPOINT = "https://api.openverse.org/v1/images/";
const REVALIDATE_S = 60 * 60 * 24 * 30; // 30 days

// ────────────────────────── Query expansion ──────────────────────────

/** Words that signal a generic street/address component, not a POI name. */
const STREET_PREFIXES =
  /^(via|viale|piazza|piazzale|largo|corso|vicolo|strada|str\.?|rue|calle|avenida|boulevard|bd\.?|road|rd\.?|street|st\.?|avenue|ave\.?)\b/i;

/** Strips a trailing numeric address (e.g. "Via Roma 12", "Via X 5/6"). */
function stripTrailingNumber(s: string): string {
  return s.replace(/\s+\d{1,5}(?:\s*[\/-]\s*\d{1,5})?[a-z]?$/i, "").trim();
}

/**
 * Builds a fallback chain of queries, from most specific (the input) to
 * most generic (just "Italia"). Duplicates are deduplicated case-insensitively.
 */
export function expandQueryCandidates(raw: string): string[] {
  const trimmed = raw.trim();
  if (!trimmed) return [];
  const parts = trimmed
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);

  const out: string[] = [];
  const seen = new Set<string>();
  const push = (s: string) => {
    const v = s.trim().replace(/\s{2,}/g, " ");
    if (v.length > 1 && !seen.has(v.toLowerCase())) {
      seen.add(v.toLowerCase());
      out.push(v);
    }
  };

  push(trimmed);

  // Variant: strip numeric address from every part.
  const stripped = parts.map(stripTrailingNumber);
  if (stripped.length > 0) push(stripped.join(", "));

  // Variant: drop pure street components (anything starting with
  // "Via/Piazza/…" or containing a free-floating number).
  const cleaned = stripped.filter(
    (p) => !STREET_PREFIXES.test(p) && !/\b\d{1,5}\b/.test(p),
  );
  if (cleaned.length > 0) push(cleaned.join(", "));

  // Variant: just the first useful (non-address) component (the POI name).
  const poi = cleaned[0] ?? stripped[0] ?? parts[0];
  if (poi) push(poi);

  // Variant: last two parts ("City, Country") and last one ("Country").
  if (parts.length >= 2) {
    push(parts.slice(-2).join(", "));
    push(parts[parts.length - 1]);
  }

  return out;
}

// ────────────────────────── Openverse backend ──────────────────────────

async function tryOpenverse(query: string): Promise<string | undefined> {
  const q = query.trim();
  if (!q) return undefined;
  const url =
    `${OPENVERSE_ENDPOINT}` +
    `?q=${encodeURIComponent(q)}` +
    `&page_size=1&license_type=commercial&mature=false`;

  try {
    const res = await fetch(url, { next: { revalidate: REVALIDATE_S } });
    if (!res.ok) return undefined;
    const json = (await res.json()) as OpenverseSearchResponse;
    const hit = json.results?.[0];
    return hit?.url || hit?.thumbnail || undefined;
  } catch {
    return undefined;
  }
}

// ────────────────────────── Wikipedia backend ──────────────────────────

interface WikipediaPage {
  original?: { source?: string };
  thumbnail?: { source?: string };
}

interface WikipediaQueryResponse {
  query?: { pages?: Record<string, WikipediaPage> };
}

async function tryWikipedia(
  query: string,
  lang: "it" | "en",
): Promise<string | undefined> {
  const q = query.trim();
  if (!q) return undefined;
  const params = new URLSearchParams({
    action: "query",
    format: "json",
    origin: "*",
    generator: "search",
    gsrsearch: q,
    gsrlimit: "1",
    prop: "pageimages",
    piprop: "thumbnail|original",
    pithumbsize: "800",
  });
  const url = `https://${lang}.wikipedia.org/w/api.php?${params.toString()}`;

  try {
    const res = await fetch(url, { next: { revalidate: REVALIDATE_S } });
    if (!res.ok) return undefined;
    const json = (await res.json()) as WikipediaQueryResponse;
    const pages = json.query?.pages ?? {};
    for (const page of Object.values(pages)) {
      const hit = page.original?.source ?? page.thumbnail?.source;
      if (hit) return hit;
    }
    return undefined;
  } catch {
    return undefined;
  }
}

// ────────────────────────── Public API ──────────────────────────

export interface LookupImageOptions {
  /**
   * Last-resort fallback query (typically the trip's destination, e.g.
   * "Roma, Italia"). When everything else fails we run this through the
   * same Openverse → Wikipedia chain so the card still shows something
   * thematically related instead of a blank gradient.
   */
  cityFallback?: string;
}

/**
 * Resolves the first matching royalty-free image URL for `query`, walking
 * the fallback chain described at the top of this file. Returns
 * `undefined` only when literally every backend / variant came up empty.
 */
export async function lookupImage(
  query: string,
  opts: LookupImageOptions = {},
): Promise<string | undefined> {
  const candidates = expandQueryCandidates(query);
  if (candidates.length === 0 && !opts.cityFallback) return undefined;

  // 1) Openverse — fastest and cheapest, try every candidate first.
  for (const c of candidates) {
    const hit = await tryOpenverse(c);
    if (hit) return hit;
  }

  // 2) Wikipedia — only the top-2 most specific candidates so we don't
  //    DDOS the API on cards that have nothing to find.
  for (const c of candidates.slice(0, 2)) {
    const hit = (await tryWikipedia(c, "it")) ?? (await tryWikipedia(c, "en"));
    if (hit) return hit;
  }

  // 3) Last resort: a generic "city" photo. We funnel it through the same
  //    chain (Openverse first, then Wikipedia) since the cityFallback can
  //    be anything from "Roma" to "Roma, Italia".
  const cityFallback = opts.cityFallback?.trim();
  if (cityFallback) {
    const cityCandidates = expandQueryCandidates(cityFallback);
    for (const c of cityCandidates) {
      const hit = await tryOpenverse(c);
      if (hit) return hit;
    }
    for (const c of cityCandidates.slice(0, 1)) {
      const hit =
        (await tryWikipedia(c, "it")) ?? (await tryWikipedia(c, "en"));
      if (hit) return hit;
    }
  }

  return undefined;
}
