"use client";

import { useCallback, useEffect, useState } from "react";
import { Trip } from "../types";
import {
  createSupabaseBrowserClient,
  isSupabaseConfigured,
} from "./supabase/client";

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
    return parsed.map((t: Trip) => ({ ...t, isUserCreated: true }));
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
  if (error) console.error("[trips-store] upsert failed", error);
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
    console.error("[trips-store] migration failed", error);
    return;
  }
  clearLocal();
}

// ─── Public API ─────────────────────────────────────────────────────────

/** @deprecated kept for backwards compatibility. Returns the cached snapshot. */
export function loadUserTrips(): Trip[] {
  return cache.length ? cache : readLocal();
}

export function addUserTrip(trip: Trip): void {
  upsertIntoCache(trip, { moveToTop: true });
  if (authedUserId) {
    void persistTrip(trip, authedUserId);
  } else {
    writeLocal(cache);
  }
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

    async function fetchFor(userId: string) {
      if (!supabase) return;
      const { data, error } = await supabase
        .from("trips")
        .select("id, data, updated_at")
        .eq("user_id", userId)
        .order("updated_at", { ascending: false });
      if (cancelled) return;
      if (error) {
        console.error("[trips-store] fetch failed", error);
        return;
      }
      const rows = (data ?? []).map(
        (row) => ({ ...(row.data as Trip), id: row.id, isUserCreated: true }),
      );
      setCache(rows);
    }

    function subscribe(userId: string) {
      if (!supabase) return;
      channel?.unsubscribe();
      channel = supabase
        .channel(`trips:${userId}`)
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
      await migrateLocalToSupabase(userId);
      await fetchFor(userId);
      subscribe(userId);
    }

    function enterGuest() {
      authedUserId = null;
      channel?.unsubscribe();
      channel = null;
      cache = readLocal();
      refreshFromCache();
    }

    async function init() {
      if (supabase) {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (cancelled) return;
        if (user) {
          await enterAuthed(user.id);
        } else {
          enterGuest();
        }
      } else {
        enterGuest();
      }
      if (!cancelled) setHydrated(true);
    }

    void init();

    const authSub = supabase?.auth.onAuthStateChange((_event, session) => {
      const userId = session?.user?.id;
      if (userId) {
        void enterAuthed(userId);
      } else {
        enterGuest();
      }
    });

    return () => {
      cancelled = true;
      channel?.unsubscribe();
      authSub?.data.subscription.unsubscribe();
      window.removeEventListener(EVENT_NAME, onCustom as EventListener);
      window.removeEventListener("storage", onStorage);
    };
  }, [refreshFromCache]);

  return { trips, userTrips: trips, hydrated };
}
