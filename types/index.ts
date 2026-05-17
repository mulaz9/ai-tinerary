export interface Trip {
  id: string;
  name: string;
  subtitle?: string;
  startDate: string; // ISO date (YYYY-MM-DD)
  endDate: string; // ISO date (YYYY-MM-DD)
  description: string;
  coverImageUrl?: string;
  /** @deprecated - prefer coverImageUrl (keeping for backward compatibility) */
  coverEmoji?: string;
  location: string;
  /**
   * @deprecated retained for backwards compatibility with trips persisted
   * before the multi-accommodation refactor. New consumers should read
   * `accommodations` instead. This field, when set, mirrors the name of
   * the first item in `accommodations` so existing UI keeps working.
   */
  accommodation?: string;
  /**
   * Places the traveller is staying at across the trip (hotel, airbnb,
   * friend's place…). When set, each `Day.accommodationId` references one
   * of these to drive the directions origin per day.
   */
  accommodations?: Accommodation[];
  days: Day[];
  isUserCreated?: boolean;
}

export interface Accommodation {
  /** Stable id within a trip (e.g. `acc-1`). */
  id: string;
  /** Free-form name/address of the accommodation. */
  name: string;
}

export interface Day {
  id: string;
  day: number; // 1-based index
  date: string; // ISO date (YYYY-MM-DD)
  title: string;
  summary: string;
  activities: Activity[];
  /**
   * Optional id of a `Trip.accommodations` entry that covers this day.
   * Falls back to the first accommodation when missing.
   */
  accommodationId?: string;
}

export interface Activity {
  id: string;
  time: string; // e.g. "09:00"
  title: string;
  description: string;
  location: string;
  tags?: string[];
  durationMins?: number;
  photoUrl?: string;
  mapsUrl?: string;
  transport?: TransportInfo;
}

export interface TransportInfo {
  mode: "bus" | "tram" | "metro" | "train" | "walk" | "ferry" | "taxi";
  summary: string; // short and readable
  routeUrl?: string; // link to route planner
}

export type SharePermission = "read" | "write";

export interface TripShare {
  id: string;
  trip_id: string;
  owner_id: string;
  share_token: string;
  permission: SharePermission;
  created_at: string;
}
