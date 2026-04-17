"use client";

import { useCallback, useEffect, useState } from "react";
import { Trip } from "../types";

const STORAGE_KEY = "ai-tinerary.user-trips.v1";
const EVENT_NAME = "ai-tinerary:user-trips-changed";

function readFromStorage(): Trip[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((t: Trip) => ({ ...t, isUserCreated: true }));
  } catch {
    return [];
  }
}

function writeToStorage(trips: Trip[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(trips));
    window.dispatchEvent(new CustomEvent(EVENT_NAME));
  } catch {
    // ignore quota / serialization errors
  }
}

export function loadUserTrips(): Trip[] {
  return readFromStorage();
}

export function addUserTrip(trip: Trip): void {
  const current = readFromStorage();
  const normalized: Trip = { ...trip, isUserCreated: true };
  const filtered = current.filter((t) => t.id !== normalized.id);
  writeToStorage([normalized, ...filtered]);
}

export function removeUserTrip(id: string): void {
  const current = readFromStorage();
  writeToStorage(current.filter((t) => t.id !== id));
}

/**
 * Replace a stored trip in place (matched by id). If the id doesn't exist
 * yet, the trip is simply appended — same semantics as `addUserTrip` but
 * without reordering the list, which matters while the user is mutating
 * activities on the detail page.
 */
export function updateUserTrip(trip: Trip): void {
  const current = readFromStorage();
  const idx = current.findIndex((t) => t.id === trip.id);
  const normalized: Trip = { ...trip, isUserCreated: true };
  const next =
    idx === -1
      ? [normalized, ...current]
      : current.map((t, i) => (i === idx ? normalized : t));
  writeToStorage(next);
}

/**
 * Reactive hook returning all user-created trips, refreshing when
 * localStorage changes either from this tab or another tab.
 */
export function useAllTrips(): {
  trips: Trip[];
  userTrips: Trip[];
  hydrated: boolean;
} {
  const [userTrips, setUserTrips] = useState<Trip[]>([]);
  const [hydrated, setHydrated] = useState(false);

  const refresh = useCallback(() => {
    setUserTrips(readFromStorage());
  }, []);

  useEffect(() => {
    refresh();
    setHydrated(true);

    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) refresh();
    };
    const onCustom = () => refresh();

    window.addEventListener("storage", onStorage);
    window.addEventListener(EVENT_NAME, onCustom as EventListener);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(EVENT_NAME, onCustom as EventListener);
    };
  }, [refresh]);

  return {
    trips: userTrips,
    userTrips,
    hydrated,
  };
}
