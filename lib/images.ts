/**
 * Thin wrapper around the Openverse image search API — free, key-less, and
 * aggregates CC/public-domain photography indexed by Wikimedia.
 *
 * Used both at AI-generation time (for trip cover images) and at render time
 * (for per-activity thumbnails) so everything flows through a single place.
 */

interface OpenverseImage {
  url?: string;
  thumbnail?: string;
}

interface OpenverseSearchResponse {
  results?: OpenverseImage[];
}

const OPENVERSE_ENDPOINT = "https://api.openverse.org/v1/images/";

/**
 * Resolves the first matching royalty-free image URL for `query`, or
 * `undefined` when the lookup fails or returns no results.
 */
export async function lookupImage(
  query: string,
): Promise<string | undefined> {
  const q = query.trim();
  if (!q) return undefined;

  const url =
    `${OPENVERSE_ENDPOINT}` +
    `?q=${encodeURIComponent(q)}` +
    `&page_size=1&license_type=commercial&mature=false`;

  try {
    const res = await fetch(url, {
      // Cache for a month — a given "Cattedrale di Palma" lookup doesn't need
      // to be refreshed often, and this spares the public Openverse API.
      next: { revalidate: 60 * 60 * 24 * 30 },
    });
    if (!res.ok) return undefined;
    const json = (await res.json()) as OpenverseSearchResponse;
    const hit = json.results?.[0];
    return hit?.url || hit?.thumbnail || undefined;
  } catch {
    return undefined;
  }
}
