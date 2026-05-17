import type { Activity } from "../types";

/**
 * Helpers to parse and manipulate the free-form `time` strings used by
 * activities. The AI typically emits ranges like `"10:00–12:00"` (en-dash),
 * but we also accept `"10:00-12:00"`, `"10:00 — 12:00"` or single times like
 * `"10:00"`. All helpers tolerate whitespace and missing parts.
 */

const TIME_RE = /(\d{1,2}):(\d{2})/;
const RANGE_SEP_RE = /\s*[–—-]\s*/;

/** HH:MM string → minutes since midnight, or `null` if unparseable. */
export function timeToMinutes(time: string | undefined | null): number | null {
  if (!time) return null;
  const m = time.match(TIME_RE);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(min)) return null;
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return h * 60 + min;
}

/** Minutes since midnight → "HH:MM" (wraps within 24h). */
export function minutesToTime(mins: number): string {
  const wrapped = ((mins % (24 * 60)) + 24 * 60) % (24 * 60);
  const h = Math.floor(wrapped / 60);
  const m = wrapped % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Splits a time field into start/end. End is `null` when not a range. */
export function parseTimeRange(time: string | undefined | null): {
  start: string | null;
  end: string | null;
} {
  if (!time) return { start: null, end: null };
  const parts = time.split(RANGE_SEP_RE).map((p) => p.trim());
  const startMatch = parts[0]?.match(TIME_RE);
  const start = startMatch ? `${startMatch[1].padStart(2, "0")}:${startMatch[2]}` : null;
  const endMatch = parts[1]?.match(TIME_RE);
  const end = endMatch ? `${endMatch[1].padStart(2, "0")}:${endMatch[2]}` : null;
  return { start, end };
}

/** Build a "HH:MM" or "HH:MM–HH:MM" string. Empty string when no start. */
export function formatTimeRange(start: string | null, end: string | null): string {
  if (!start) return "";
  if (end) return `${start}–${end}`;
  return start;
}

/**
 * Replaces the start of an existing time range with `newStart`, preserving
 * the original duration when present. Falls back to `durationMins` when the
 * activity didn't ship an end time.
 */
export function shiftStartTime(
  originalTime: string | undefined,
  newStart: string,
  durationMins?: number,
): string {
  const newStartMin = timeToMinutes(newStart);
  if (newStartMin === null) return originalTime ?? newStart;

  const { start: oldStart, end: oldEnd } = parseTimeRange(originalTime);
  const oldStartMin = timeToMinutes(oldStart);
  const oldEndMin = timeToMinutes(oldEnd);

  let durationToUse: number | null = null;
  if (oldStartMin !== null && oldEndMin !== null && oldEndMin > oldStartMin) {
    durationToUse = oldEndMin - oldStartMin;
  } else if (typeof durationMins === "number" && durationMins > 0) {
    durationToUse = durationMins;
  }

  if (durationToUse !== null) {
    return formatTimeRange(newStart, minutesToTime(newStartMin + durationToUse));
  }
  return newStart;
}

/**
 * Builds a brand-new time range from a start time and a duration in minutes.
 * If no duration is provided, only the start is returned.
 */
export function buildTimeRange(
  startTime: string,
  durationMins?: number,
): string {
  const startMin = timeToMinutes(startTime);
  if (startMin === null) return "";
  if (typeof durationMins === "number" && durationMins > 0) {
    return formatTimeRange(startTime, minutesToTime(startMin + durationMins));
  }
  return startTime;
}

/**
 * Returns a copy of `activities` sorted by start time ascending. Activities
 * without a parseable time bubble to the bottom, preserving their relative
 * input order (stable sort).
 */
export function sortByStartTime<T extends Activity>(activities: T[]): T[] {
  return activities
    .map((a, i) => ({
      a,
      i,
      m: timeToMinutes(parseTimeRange(a.time).start) ?? Number.POSITIVE_INFINITY,
    }))
    .sort((x, y) => (x.m === y.m ? x.i - y.i : x.m - y.m))
    .map(({ a }) => a);
}

/** Suggests the next "round" hour after the latest activity in a day. */
export function suggestNextStartTime(activities: Activity[]): string {
  let latestEnd = -1;
  for (const a of activities) {
    const { start, end } = parseTimeRange(a.time);
    const endMin =
      timeToMinutes(end) ??
      (timeToMinutes(start) !== null && a.durationMins
        ? (timeToMinutes(start) ?? 0) + a.durationMins
        : timeToMinutes(start));
    if (endMin !== null && endMin > latestEnd) latestEnd = endMin;
  }
  if (latestEnd < 0) return "10:00";
  // Round up to next half hour, plus 30 min buffer.
  const next = Math.ceil((latestEnd + 30) / 30) * 30;
  return minutesToTime(Math.min(next, 23 * 60 + 30));
}
