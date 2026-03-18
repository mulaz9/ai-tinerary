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
  days: Day[];
}

export interface Day {
  id: string;
  day: number; // 1-based index
  date: string; // ISO date (YYYY-MM-DD)
  title: string;
  summary: string;
  activities: Activity[];
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
