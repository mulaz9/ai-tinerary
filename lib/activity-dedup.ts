import type { Activity, Day } from "../types";

/** Meal-prefix words — stripped before comparing titles. */
const MEAL_PREFIX_RE =
  /^(colazione|brunch|pranzo|cena|aperitivo|breakfast|lunch|dinner|supper|petit-déjeuner|petit déjeuner|déjeuner|dîner|apéritif|desayuno|almuerzo|comida|cena|merienda|frühstück|mittagessen|abendessen)\s*[—–-]?\s*/i;

function normalizeText(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Primary POI label from a title (drops meal prefixes like "Pranzo — …"). */
function titleCore(title: string): string {
  return normalizeText(title.replace(MEAL_PREFIX_RE, ""));
}

/** Location fingerprint: first two comma segments, normalized. */
function locationCore(location: string): string {
  const parts = location
    .split(",")
    .map((p) => normalizeText(p))
    .filter(Boolean);
  if (parts.length === 0) return normalizeText(location);
  return parts.slice(0, 2).join("|");
}

/**
 * Stable key for duplicate detection. Two activities match when they share the
 * same location core OR the same non-empty title core (≥ 4 chars).
 */
export function activityDedupKey(activity: {
  title: string;
  location: string;
}): string {
  const loc = locationCore(activity.location);
  const title = titleCore(activity.title);
  if (title.length >= 4) return `t:${title}|l:${loc}`;
  return `l:${loc}`;
}

export function isDuplicateActivity(
  candidate: { title: string; location: string },
  existing: { title: string; location: string }[],
): boolean {
  const key = activityDedupKey(candidate);
  return existing.some((a) => activityDedupKey(a) === key);
}

/** Removes duplicate activities across the whole trip (keeps first occurrence). */
export function dedupeTripDays(days: Day[]): Day[] {
  const seen = new Set<string>();
  return days.map((day) => {
    const activities: Activity[] = [];
    for (const activity of day.activities) {
      const key = activityDedupKey(activity);
      if (seen.has(key)) continue;
      seen.add(key);
      activities.push(activity);
    }
    return { ...day, activities };
  });
}
