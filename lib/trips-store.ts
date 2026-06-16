"use client";

import { useCallback, useEffect, useState } from "react";
import { Trip } from "../types";
import {
  createSupabaseBrowserClient,
  isSupabaseConfigured,
} from "./supabase/client";
import { migrateTripAccommodations } from "./trip-accommodations";

/**
 * Store for user trips with opt-in Supabase sync.
 *
 * - Guest (not signed in): trips live in `localStorage` exactly like
 *   before auth existed.
 * - Authenticated: trips live in `public.trips` on Supabase, realtime,
 *   cross-device. Any guest trips are migrated into Supabase on sign-in.
 *
 * All mutations are fire-and-forget (`void`) so call sites don't need to
 * await. A shared in-memory cache + custom event keeps every mounted
 * `useAllTrips()` in sync for optimistic UI.
 */

const LEGACY_STORAGE_KEY = "ai-tinerary.user-trips.v1";
const EVENT_NAME = "ai-tinerary:user-trips-changed";

/**
 * Maximum number of trips a user can save, for both guests (localStorage)
 * and authenticated users (Supabase). Generating/saving beyond this is
 * blocked client-side with an error message.
 */
export const MAX_USER_TRIPS = 5;

let cache: Trip[] = [];
// Updated by the hook. Mutation functions consult it to decide whether
// to also upsert into Supabase.
let authedUserId: string | null = null;

function dispatchChange() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(EVENT_NAME));
  }
}

function setCache(next: Trip[]) {
  cache = next;
  dispatchChange();
}

function upsertIntoCache(trip: Trip, { moveToTop }: { moveToTop: boolean }) {
  const normalized: Trip = { ...trip, isUserCreated: true };
  const idx = cache.findIndex((t) => t.id === normalized.id);
  if (idx === -1) {
    cache = moveToTop ? [normalized, ...cache] : [...cache, normalized];
  } else if (moveToTop) {
    cache = [normalized, ...cache.filter((t) => t.id !== normalized.id)];
  } else {
    cache = cache.map((t, i) => (i === idx ? normalized : t));
  }
  dispatchChange();
}

function removeFromCache(id: string) {
  cache = cache.filter((t) => t.id !== id);
  dispatchChange();
}

// ─── localStorage (guest) backend ───────────────────────────────────────

function readLocal(): Trip[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((t: Trip) =>
      migrateTripAccommodations({ ...t, isUserCreated: true }),
    );
  } catch {
    return [];
  }
}

function writeLocal(trips: Trip[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LEGACY_STORAGE_KEY, JSON.stringify(trips));
  } catch {
    // ignore quota / serialization errors
  }
}

function clearLocal(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(LEGACY_STORAGE_KEY);
}

// ─── Supabase backend helpers ───────────────────────────────────────────

// Supabase's PostgrestError has non-enumerable fields that stringify as
// `{}`, which is what was showing up in the Next.js dev overlay. Grab
// every own property (including non-enumerable) so we actually see the
// message, code, details, hint, status — whichever are present.
function logSupabaseError(tag: string, error: unknown): void {
  if (error == null) {
    console.error(`[trips-store] ${tag}: (no error details)`);
    return;
  }
  if (typeof error !== "object") {
    console.error(`[trips-store] ${tag}:`, error);
    return;
  }
  const dump: Record<string, unknown> = {};
  for (const key of Object.getOwnPropertyNames(error)) {
    dump[key] = (error as Record<string, unknown>)[key];
  }
  const e = error as { message?: string };
  console.error(`[trips-store] ${tag}:`, e.message ?? "(empty)", dump);
}

async function persistTrip(trip: Trip, userId: string): Promise<void> {
  const supabase = createSupabaseBrowserClient();
  if (!supabase) return;
  const { error } = await supabase.from("trips").upsert(
    {
      id: trip.id,
      user_id: userId,
      data: { ...trip, isUserCreated: true },
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" },
  );
  if (error) logSupabaseError("upsert failed", error);
}

async function migrateLocalToSupabase(userId: string): Promise<void> {
  if (typeof window === "undefined") return;
  const supabase = createSupabaseBrowserClient();
  if (!supabase) return;
  const local = readLocal();
  if (local.length === 0) return;
  const now = new Date().toISOString();
  const rows = local.map((t) => ({
    id: t.id,
    user_id: userId,
    data: { ...t, isUserCreated: true },
    updated_at: now,
  }));
  const { error } = await supabase
    .from("trips")
    .upsert(rows, { onConflict: "id" });
  if (error) {
    logSupabaseError("migration failed", error);
    return;
  }
  clearLocal();
}

// ─── Public API ─────────────────────────────────────────────────────────

/** @deprecated kept for backwards compatibility. Returns the cached snapshot. */
export function loadUserTrips(): Trip[] {
  return cache.length ? cache : readLocal();
}

/** Current number of saved trips (from the in-memory cache / localStorage). */
export function getUserTripCount(): number {
  return (cache.length ? cache : readLocal()).length;
}

/** Whether another *new* trip can be saved without hitting the limit. */
export function canAddUserTrip(): boolean {
  return getUserTripCount() < MAX_USER_TRIPS;
}

/**
 * Adds a new trip (or updates an existing one by id). Returns `false` when
 * the trip is new and the {@link MAX_USER_TRIPS} limit has been reached, so
 * call sites can surface an error. Updates to existing trips always succeed.
 */
export function addUserTrip(trip: Trip): boolean {
  const isExisting = cache.some((t) => t.id === trip.id);
  if (!isExisting && cache.length >= MAX_USER_TRIPS) {
    return false;
  }
  upsertIntoCache(trip, { moveToTop: true });
  if (authedUserId) {
    void persistTrip(trip, authedUserId);
  } else {
    writeLocal(cache);
  }
  return true;
}

export function updateUserTrip(trip: Trip): void {
  upsertIntoCache(trip, { moveToTop: false });
  if (authedUserId) {
    void persistTrip(trip, authedUserId);
  } else {
    writeLocal(cache);
  }
}

export function removeUserTrip(id: string): void {
  removeFromCache(id);
  if (authedUserId) {
    const userId = authedUserId;
    void (async () => {
      const supabase = createSupabaseBrowserClient();
      if (!supabase) return;
      await supabase.from("trips").delete().eq("id", id).eq("user_id", userId);
    })();
  } else {
    writeLocal(cache);
  }
}

/**
 * Reactive hook returning all user trips. Switches seamlessly between
 * localStorage (guest) and Supabase (authenticated) as auth state changes.
 */
export function useAllTrips(): {
  trips: Trip[];
  userTrips: Trip[];
  hydrated: boolean;
} {
  const [trips, setTrips] = useState<Trip[]>(cache);
  const [hydrated, setHydrated] = useState(false);

  const refreshFromCache = useCallback(() => {
    setTrips([...cache]);
  }, []);

  useEffect(() => {
    const onCustom = () => refreshFromCache();
    const onStorage = (e: StorageEvent) => {
      if (e.key === LEGACY_STORAGE_KEY && !authedUserId) {
        cache = readLocal();
        refreshFromCache();
      }
    };
    window.addEventListener(EVENT_NAME, onCustom as EventListener);
    window.addEventListener("storage", onStorage);

    const supabase = isSupabaseConfigured()
      ? createSupabaseBrowserClient()
      : null;

    let cancelled = false;
    let channel: ReturnType<NonNullable<typeof supabase>["channel"]> | null =
      null;
    // Per-effect-instance bookkeeping so we don't re-migrate or
    // re-subscribe when `onAuthStateChange` fires TOKEN_REFRESHED /
    // USER_UPDATED events for a user we're already tracking.
    let subscribedUserId: string | null = null;
    const migratedUserIds = new Set<string>();

    async function fetchFor(userId: string) {
      if (!supabase) return;
      try {
        const { data, error } = await supabase
          .from("trips")
          .select("id, data, updated_at")
          .eq("user_id", userId)
          .order("updated_at", { ascending: false });
        if (cancelled) return;
        if (error) {
          logSupabaseError("fetch failed", error);
          return;
        }
        const rows = (data ?? []).map((row) =>
          migrateTripAccommodations({
            ...(row.data as Trip),
            id: row.id,
            isUserCreated: true,
          }),
        );
        setCache(rows);
      } catch (err) {
        if (cancelled) return;
        logSupabaseError("fetch threw", err);
      }
    }

    function removeChannelsByTopic(topic: string) {
      if (!supabase) return;
      // realtime-js stores channels under `realtime:<topic>`. `channel()`
      // returns the existing one if found, which causes the "cannot add
      // postgres_changes callbacks after subscribe()" error when it's
      // already been subscribed (e.g. from a previous effect cycle, a
      // dev-mode StrictMode remount, or an HMR reload that preserved the
      // supabase-ssr singleton). Nuke any leftovers for this topic before
      // creating a new channel.
      const fullTopic = `realtime:${topic}`;
      for (const existing of supabase.getChannels()) {
        if (existing.topic === fullTopic) {
          supabase.removeChannel(existing);
        }
      }
    }

    function subscribe(userId: string) {
      if (!supabase) return;
      if (subscribedUserId === userId && channel) return;

      const topic = `trips:${userId}`;
      removeChannelsByTopic(topic);
      channel = null;
      subscribedUserId = userId;

      channel = supabase
        .channel(topic)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "trips",
            filter: `user_id=eq.${userId}`,
          },
          () => {
            void fetchFor(userId);
          },
        )
        .subscribe();
    }

    async function enterAuthed(userId: string) {
      authedUserId = userId;
      if (!migratedUserIds.has(userId)) {
        migratedUserIds.add(userId);
        await migrateLocalToSupabase(userId);
        if (cancelled) return;
      }
      // Skip the initial fetch if we're already subscribed — the realtime
      // channel will keep us in sync and the cache is already populated.
      if (subscribedUserId !== userId) {
        await fetchFor(userId);
        if (cancelled) return;
      }
      subscribe(userId);
    }

    function enterGuest() {
      const prevSubscribed = subscribedUserId;
      authedUserId = null;
      subscribedUserId = null;
      if (supabase && prevSubscribed) {
        removeChannelsByTopic(`trips:${prevSubscribed}`);
      }
      channel = null;
      cache = readLocal();
      refreshFromCache();
    }

    // `onAuthStateChange` fires an INITIAL_SESSION event on mount, so we
    // don't need a separate `init()` — doing both caused a race where
    // `enterAuthed` ran twice and the second `subscribe()` attached `.on`
    // to an already-subscribed realtime channel.
    if (supabase) {
      const authSub = supabase.auth.onAuthStateChange((_event, session) => {
        if (cancelled) return;
        const userId = session?.user?.id;
        if (userId) {
          void enterAuthed(userId).finally(() => {
            if (!cancelled) setHydrated(true);
          });
        } else {
          enterGuest();
          setHydrated(true);
        }
      });

      return () => {
        cancelled = true;
        if (subscribedUserId) {
          removeChannelsByTopic(`trips:${subscribedUserId}`);
        }
        channel = null;
        authSub.data.subscription.unsubscribe();
        window.removeEventListener(EVENT_NAME, onCustom as EventListener);
        window.removeEventListener("storage", onStorage);
      };
    }

    enterGuest();
    setHydrated(true);
    return () => {
      cancelled = true;
      window.removeEventListener(EVENT_NAME, onCustom as EventListener);
      window.removeEventListener("storage", onStorage);
    };
  }, [refreshFromCache]);

  return { trips, userTrips: trips, hydrated };
}
