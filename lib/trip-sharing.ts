"use client";

import type { SharePermission, Trip, TripShare } from "../types";
import { createSupabaseBrowserClient } from "./supabase/client";
import { migrateTripAccommodations } from "./trip-accommodations";

export async function createShareLink(
  tripId: string,
  permission: SharePermission,
): Promise<TripShare | null> {
  const supabase = createSupabaseBrowserClient();
  if (!supabase) return null;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("trip_shares")
    .insert({ trip_id: tripId, owner_id: user.id, permission })
    .select()
    .single();

  if (error) {
    console.error("[trip-sharing] createShareLink:", error.message);
    return null;
  }
  return data as TripShare;
}

export async function getSharesForTrip(
  tripId: string,
): Promise<TripShare[]> {
  const supabase = createSupabaseBrowserClient();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("trip_shares")
    .select("*")
    .eq("trip_id", tripId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[trip-sharing] getSharesForTrip:", error.message);
    return [];
  }
  return (data ?? []) as TripShare[];
}

export async function revokeShareLink(shareId: string): Promise<boolean> {
  const supabase = createSupabaseBrowserClient();
  if (!supabase) return false;

  const { error } = await supabase
    .from("trip_shares")
    .delete()
    .eq("id", shareId);

  if (error) {
    console.error("[trip-sharing] revokeShareLink:", error.message);
    return false;
  }
  return true;
}

export async function resolveShareToken(
  token: string,
): Promise<{ tripId: string; permission: SharePermission } | null> {
  const supabase = createSupabaseBrowserClient();
  if (!supabase) return null;

  // Token-scoped SECURITY DEFINER function — RLS no longer exposes
  // trip_shares rows to non-owners.
  const { data, error } = await supabase
    .rpc("resolve_share_token", { p_token: token })
    .single();

  if (error || !data) return null;
  const row = data as { trip_id: string; permission: SharePermission };
  return { tripId: row.trip_id, permission: row.permission };
}

export async function fetchSharedTrip(token: string): Promise<Trip | null> {
  const supabase = createSupabaseBrowserClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .rpc("fetch_shared_trip", { p_token: token })
    .single();

  if (error || !data) return null;
  const row = data as { id: string; data: Trip };
  return migrateTripAccommodations({ ...row.data, id: row.id });
}

export async function updateSharedTrip(
  token: string,
  trip: Trip,
): Promise<boolean> {
  const supabase = createSupabaseBrowserClient();
  if (!supabase) return false;

  const { data, error } = await supabase.rpc("update_shared_trip", {
    p_token: token,
    p_data: trip,
  });

  if (error) {
    console.error("[trip-sharing] updateSharedTrip:", error.message);
    return false;
  }
  return data === true;
}

export function buildShareUrl(token: string): string {
  if (typeof window === "undefined") return `/trip/shared/${token}`;
  return `${window.location.origin}/trip/shared/${token}`;
}

// ─── Visited share tokens (localStorage) ────────────────────────────────

const VISITED_SHARES_KEY = "ai-tinerary.visited-shares.v1";

interface VisitedShare {
  token: string;
  tripId: string;
  permission: SharePermission;
  visitedAt: string;
}

function readVisitedShares(): VisitedShare[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(VISITED_SHARES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeVisitedShares(shares: VisitedShare[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(VISITED_SHARES_KEY, JSON.stringify(shares));
  } catch {
    // ignore
  }
}

export function saveVisitedShare(
  token: string,
  tripId: string,
  permission: SharePermission,
): void {
  const shares = readVisitedShares().filter((s) => s.token !== token);
  shares.unshift({ token, tripId, permission, visitedAt: new Date().toISOString() });
  writeVisitedShares(shares.slice(0, 50));
}

export function getVisitedShares(): VisitedShare[] {
  return readVisitedShares();
}

export function removeVisitedShare(token: string): void {
  writeVisitedShares(readVisitedShares().filter((s) => s.token !== token));
}

export async function fetchTripsSharedWithMe(): Promise<
  Array<Trip & { _shareToken: string; _sharePermission: SharePermission }>
> {
  const visited = getVisitedShares();
  if (visited.length === 0) return [];

  const supabase = createSupabaseBrowserClient();
  if (!supabase) return [];

  const { data, error } = await supabase.rpc("fetch_shared_trips", {
    p_tokens: visited.map((v) => v.token),
  });

  if (error || !data) return [];

  const rows = data as Array<{
    share_token: string;
    permission: SharePermission;
    id: string;
    data: Trip;
  }>;
  const byToken = new Map(rows.map((row) => [row.share_token, row]));
  const results: Array<Trip & { _shareToken: string; _sharePermission: SharePermission }> = [];

  for (const v of visited) {
    const row = byToken.get(v.token);
    if (row) {
      const migrated = migrateTripAccommodations({ ...row.data, id: row.id });
      results.push({
        ...migrated,
        _shareToken: v.token,
        _sharePermission: row.permission,
      });
    }
  }

  // Prune revoked/expired shares so they stop cluttering localStorage.
  if (results.length < visited.length) {
    writeVisitedShares(visited.filter((v) => byToken.has(v.token)));
  }
  return results;
}
