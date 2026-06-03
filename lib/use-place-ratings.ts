"use client";

import { useEffect, useMemo, useState } from "react";
import type { GooglePlaceRating, Trip } from "../types";
import {
  collectActivitiesNeedingRatings,
  fetchPlaceRatingsBatch,
  hasTripRatingChanges,
  isRatingCurrent,
  mergeRatingsIntoTrip,
  ratingQueryKey,
} from "./place-rating";

/**
 * Loads Google review ratings for trip activities (cached in localStorage).
 * Optionally persists merged ratings onto the trip (e.g. Supabase).
 */
export function usePlaceRatings(
  trip: Trip | undefined,
  onTripRatingsSaved?: (trip: Trip) => void,
): {
  ratingForActivity: (activityId: string) => GooglePlaceRating | undefined;
  loading: boolean;
} {
  const [overlay, setOverlay] = useState<Record<string, GooglePlaceRating>>(
    {},
  );
  const [loading, setLoading] = useState(false);

  const tripKey = useMemo(() => {
    if (!trip) return "";
    return collectActivitiesNeedingRatings(trip)
      .map((x) => `${x.activityId}:${x.location}`)
      .join("|");
  }, [trip]);

  useEffect(() => {
    if (!trip || !tripKey) {
      setOverlay({});
      setLoading(false);
      return;
    }

    const needed = collectActivitiesNeedingRatings(trip);
    if (needed.length === 0) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    fetchPlaceRatingsBatch(
      needed.map((n) => ({
        location: n.location,
        destination: n.destination,
      })),
    )
      .then((results) => {
        if (cancelled) return;
        const byId = new Map<string, GooglePlaceRating | null>();
        needed.forEach((n, i) => {
          byId.set(n.activityId, results[i]);
        });
        const nextOverlay: Record<string, GooglePlaceRating> = {};
        for (const [id, r] of byId.entries()) {
          if (r) nextOverlay[id] = r;
        }
        setOverlay(nextOverlay);

        if (onTripRatingsSaved) {
          const merged = mergeRatingsIntoTrip(trip, byId);
          if (hasTripRatingChanges(trip, merged)) {
            onTripRatingsSaved(merged);
          }
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [trip, tripKey, onTripRatingsSaved]);

  const ratingForActivity = (activityId: string): GooglePlaceRating | undefined => {
    if (!trip) return undefined;
    if (overlay[activityId]) return overlay[activityId];
    for (const day of trip.days) {
      const a = day.activities.find((x) => x.id === activityId);
      if (!a) continue;
      const loc = a.location || trip.location;
      if (isRatingCurrent(a.placeRating, loc, trip.location)) {
        return a.placeRating;
      }
    }
    return undefined;
  };

  return { ratingForActivity, loading };
}

export { ratingQueryKey, isRatingCurrent };
