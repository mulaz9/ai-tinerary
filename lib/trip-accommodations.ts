/**
 * Single source of truth for the multi-accommodation data model.
 *
 * Trips persisted before this feature only have `Trip.accommodation: string`.
 * The migration helper exposed here:
 *
 *   1. Promotes the legacy single string into `Trip.accommodations` (one
 *      entry assigned to every day).
 *   2. Keeps the legacy `accommodation` field in sync with the first
 *      accommodation's name so any UI still reading it keeps working.
 *   3. Re-issues stable ids for any accommodations that lost theirs
 *      (e.g. hand-edited trips).
 *
 * `originForDay` is the canonical way to resolve the directions origin for
 * a given day: assigned accommodation → first accommodation → undefined.
 */

import type { Accommodation, Day, Trip } from "../types";

/** Generates a stable accommodation id within a trip. */
function nextAccommodationId(used: Set<string>): string {
  let i = 1;
  while (used.has(`acc-${i}`)) i++;
  used.add(`acc-${i}`);
  return `acc-${i}`;
}

/**
 * Normalizes the multi-accommodation fields on a trip.
 *
 * - If `accommodations` is missing/empty but legacy `accommodation` is set,
 *   wraps it into a one-element array.
 * - Ensures every accommodation has a stable id.
 * - Drops `Day.accommodationId` references that no longer point to an
 *   existing accommodation.
 * - Mirrors the first accommodation's name into the legacy
 *   `Trip.accommodation` field.
 */
export function migrateTripAccommodations(trip: Trip): Trip {
  const list = Array.isArray(trip.accommodations) ? trip.accommodations : [];
  const used = new Set<string>();
  const normalized: Accommodation[] = [];

  for (const a of list) {
    const name = a?.name?.trim();
    if (!name) continue;
    const id =
      typeof a.id === "string" && a.id.trim().length > 0 && !used.has(a.id)
        ? a.id
        : nextAccommodationId(used);
    used.add(id);
    normalized.push({ id, name });
  }

  // Legacy fallback: hoist `trip.accommodation` (string) into the array if
  // we don't already have any entries.
  const legacy = trip.accommodation?.trim();
  if (normalized.length === 0 && legacy) {
    normalized.push({ id: nextAccommodationId(used), name: legacy });
  }

  const validIds = new Set(normalized.map((a) => a.id));
  const days: Day[] = trip.days.map((d) => {
    if (d.accommodationId && !validIds.has(d.accommodationId)) {
      const { accommodationId: _drop, ...rest } = d;
      void _drop;
      return rest;
    }
    return d;
  });

  return {
    ...trip,
    accommodations: normalized.length > 0 ? normalized : undefined,
    accommodation: normalized[0]?.name,
    days,
  };
}

/**
 * Returns the accommodation assigned to a day, falling back to the first
 * accommodation on the trip when no explicit assignment exists. Returns
 * `undefined` when the trip has no accommodations at all.
 */
export function getDayAccommodation(
  trip: Trip,
  day: Day,
): Accommodation | undefined {
  const list = trip.accommodations ?? [];
  if (list.length === 0) return undefined;
  if (day.accommodationId) {
    const match = list.find((a) => a.id === day.accommodationId);
    if (match) return match;
  }
  return list[0];
}

/**
 * Returns the directions origin for a given day, or `undefined` when the
 * trip has no accommodations. This is what the Maps URL builder should be
 * fed for activities that belong to the day.
 */
export function originForDay(trip: Trip, day: Day): string | undefined {
  return getDayAccommodation(trip, day)?.name;
}

/**
 * Convenience: returns the `accommodation` string the AI / single-activity
 * generator should treat as the day's origin. Identical to `originForDay`
 * — exists for call-site readability where the consumer is the AI layer.
 */
export const aiOriginForDay = originForDay;
