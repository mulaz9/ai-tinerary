"use client";

import { useEffect, useState } from "react";
import type { Trip } from "../types";

/**
 * In-memory cache shared across all usages of the hook for the lifetime of
 * the page — prevents re-resolving the same "Cattedrale di Palma" query
 * every time a component remounts.
 */
const cache = new Map<string, string | null>();

function queryFor(
  activity: Trip["days"][number]["activities"][number],
  tripLocation: string,
): string {
  const primary =
    activity.location?.trim() || activity.title?.trim() || tripLocation;
  const context = tripLocation && !primary.includes(tripLocation)
    ? `, ${tripLocation}`
    : "";
  return `${primary}${context}`.trim();
}

/**
 * Progressively resolves Openverse image URLs for every activity in the trip
 * that doesn't already ship a `photoUrl`. Resolution is bounded to a small
 * concurrency window to be friendly to the upstream API and to avoid
 * clogging the browser's connection pool.
 *
 * Returns a map keyed by activity id; missing keys simply mean "still
 * loading" or "no match found".
 */
export function useActivityImages(
  trip: Trip | undefined,
  concurrency = 3,
): Record<string, string> {
  const [images, setImages] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!trip) return;

    const queue: { id: string; query: string }[] = [];
    const initial: Record<string, string> = {};

    for (const day of trip.days) {
      for (const a of day.activities) {
        if (a.photoUrl) {
          initial[a.id] = a.photoUrl;
          continue;
        }
        const query = queryFor(a, trip.location);
        const cached = cache.get(query);
        if (cached) {
          initial[a.id] = cached;
        } else if (cached === undefined) {
          queue.push({ id: a.id, query });
        }
      }
    }

    if (Object.keys(initial).length) {
      setImages((prev) => ({ ...prev, ...initial }));
    }

    if (!queue.length) return;

    let cancelled = false;
    let cursor = 0;

    const tripLocation = trip.location;

    const runOne = async (): Promise<void> => {
      while (!cancelled) {
        const idx = cursor++;
        if (idx >= queue.length) return;
        const { id, query } = queue[idx];
        try {
          const params = new URLSearchParams({ q: query });
          if (tripLocation) params.set("cityFallback", tripLocation);
          const res = await fetch(`/api/image?${params.toString()}`);
          if (!res.ok) {
            cache.set(query, null);
            continue;
          }
          const data = (await res.json()) as { url: string | null };
          cache.set(query, data.url ?? null);
          if (data.url && !cancelled) {
            setImages((prev) =>
              prev[id] === data.url ? prev : { ...prev, [id]: data.url! },
            );
          }
        } catch {
          cache.set(query, null);
        }
      }
    };

    const workers = Array.from(
      { length: Math.min(concurrency, queue.length) },
      runOne,
    );
    Promise.all(workers).catch(() => {
      /* individual errors already swallowed per-request */
    });

    return () => {
      cancelled = true;
    };
  }, [trip, concurrency]);

  return images;
}
