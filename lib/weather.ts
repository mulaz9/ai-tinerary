export type WeatherKind = "forecast" | "climate";

export interface WeatherInfo {
  tMin: number;
  tMax: number;
  precipitation: number;
  weatherCode: number;
  kind: WeatherKind;
}

export interface Coords {
  lat: number;
  lon: number;
  name?: string;
}

const GEOCODE_REVALIDATE = 60 * 60 * 24 * 30; // 30 days
const FORECAST_REVALIDATE = 60 * 60 * 3; // 3 hours
const CLIMATE_REVALIDATE = 60 * 60 * 24 * 14; // 14 days

// Open-Meteo's forecast endpoint currently accepts start_date/end_date only up
// to ~15 days ahead. If ANY date in the range is out of bounds, the API
// rejects the whole call with HTTP 400. We stay well inside that window and
// route anything further out to the climate (historical average) endpoint.
const FORECAST_HORIZON_DAYS = 13;

// How many past years to average for the climate baseline.
const CLIMATE_YEARS = 10;

function toIsoDate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseIsoDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1));
}

function daysBetween(a: Date, b: Date): number {
  const MS = 1000 * 60 * 60 * 24;
  return Math.round((b.getTime() - a.getTime()) / MS);
}

/**
 * Geocode a free-form location string via Open-Meteo's geocoding API.
 * Returns null when the lookup fails or the string is empty.
 */
export async function geocodeLocation(
  name: string,
  lang = "en",
): Promise<Coords | null> {
  const trimmed = name?.trim();
  if (!trimmed) return null;

  const language = /^[a-z]{2}$/i.test(lang) ? lang.toLowerCase() : "en";
  const url =
    `https://geocoding-api.open-meteo.com/v1/search` +
    `?name=${encodeURIComponent(trimmed)}&count=1&language=${language}&format=json`;

  try {
    const res = await fetch(url, {
      next: { revalidate: GEOCODE_REVALIDATE },
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      results?: { latitude: number; longitude: number; name?: string }[];
    };
    const hit = json.results?.[0];
    if (!hit) return null;
    return { lat: hit.latitude, lon: hit.longitude, name: hit.name };
  } catch {
    return null;
  }
}

interface DailyForecastPayload {
  daily?: {
    time: string[];
    weather_code: number[];
    temperature_2m_max: number[];
    temperature_2m_min: number[];
    precipitation_sum: number[];
  };
}

async function fetchForecastRange(
  coords: Coords,
  startDate: string,
  endDate: string,
): Promise<Record<string, WeatherInfo>> {
  const url =
    `https://api.open-meteo.com/v1/forecast` +
    `?latitude=${coords.lat}&longitude=${coords.lon}` +
    `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum` +
    `&timezone=auto` +
    `&start_date=${startDate}&end_date=${endDate}`;

  const out: Record<string, WeatherInfo> = {};
  try {
    const res = await fetch(url, {
      next: { revalidate: FORECAST_REVALIDATE },
    });
    if (!res.ok) return out;
    const json = (await res.json()) as DailyForecastPayload;
    const d = json.daily;
    if (!d) return out;
    for (let i = 0; i < d.time.length; i++) {
      out[d.time[i]] = {
        tMin: d.temperature_2m_min[i],
        tMax: d.temperature_2m_max[i],
        precipitation: d.precipitation_sum[i] ?? 0,
        weatherCode: d.weather_code[i] ?? 0,
        kind: "forecast",
      };
    }
  } catch {
    // swallow — caller treats missing dates gracefully
  }
  return out;
}

interface DailyArchivePayload {
  daily?: {
    time: string[];
    weather_code: number[];
    temperature_2m_max: number[];
    temperature_2m_min: number[];
    precipitation_sum: number[];
  };
}

/**
 * For a target date, average the last N years of historical weather for that
 * exact month/day. Picks the most frequent weather_code.
 */
async function fetchClimateForDate(
  coords: Coords,
  targetIso: string,
): Promise<WeatherInfo | null> {
  const [, mm, dd] = targetIso.split("-");
  const currentYear = new Date().getUTCFullYear();
  // Use a past window that ends last year (archive usually has ~1 week lag).
  const endYear = currentYear - 1;
  const startYear = endYear - (CLIMATE_YEARS - 1);

  // archive-api accepts arbitrary date ranges; we fetch each year's single-day
  // window in one request by listing a wide range and filtering client-side,
  // but that wastes a lot of data. Instead, issue one request per year — the
  // responses are tiny (single-day) and Next.js caches them for 14 days.
  const years = Array.from({ length: CLIMATE_YEARS }, (_, i) => startYear + i);

  const daily: {
    tMin: number[];
    tMax: number[];
    precipitation: number[];
    weatherCode: number[];
  } = { tMin: [], tMax: [], precipitation: [], weatherCode: [] };

  await Promise.all(
    years.map(async (year) => {
      const date = `${year}-${mm}-${dd}`;
      const url =
        `https://archive-api.open-meteo.com/v1/archive` +
        `?latitude=${coords.lat}&longitude=${coords.lon}` +
        `&start_date=${date}&end_date=${date}` +
        `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum` +
        `&timezone=auto`;
      try {
        const res = await fetch(url, {
          next: { revalidate: CLIMATE_REVALIDATE },
        });
        if (!res.ok) return;
        const json = (await res.json()) as DailyArchivePayload;
        const d = json.daily;
        if (!d || !d.time?.length) return;
        const tMin = d.temperature_2m_min[0];
        const tMax = d.temperature_2m_max[0];
        const precip = d.precipitation_sum[0];
        const code = d.weather_code[0];
        if (typeof tMin === "number") daily.tMin.push(tMin);
        if (typeof tMax === "number") daily.tMax.push(tMax);
        if (typeof precip === "number") daily.precipitation.push(precip);
        if (typeof code === "number") daily.weatherCode.push(code);
      } catch {
        // ignore individual year failures
      }
    }),
  );

  if (!daily.tMin.length || !daily.tMax.length) return null;

  const avg = (xs: number[]) =>
    xs.reduce((s, x) => s + x, 0) / Math.max(xs.length, 1);

  // Most frequent weather code across the sampled years.
  const codeCounts = new Map<number, number>();
  for (const c of daily.weatherCode) {
    codeCounts.set(c, (codeCounts.get(c) ?? 0) + 1);
  }
  let mode = 0;
  let best = -1;
  for (const [code, count] of codeCounts) {
    if (count > best) {
      best = count;
      mode = code;
    }
  }

  return {
    tMin: Math.round(avg(daily.tMin) * 10) / 10,
    tMax: Math.round(avg(daily.tMax) * 10) / 10,
    precipitation: Math.round(avg(daily.precipitation) * 10) / 10,
    weatherCode: mode,
    kind: "climate",
  };
}

/**
 * Build a map of date -> WeatherInfo for the given dates. Uses the Open-Meteo
 * forecast API for dates within ~16 days, and averages historical data for
 * dates further out. Missing dates are simply omitted from the result.
 */
export async function getWeatherForDates(
  coords: Coords,
  dates: string[],
): Promise<Record<string, WeatherInfo>> {
  if (!dates.length) return {};

  const today = parseIsoDate(toIsoDate(new Date()));
  const nearDates: string[] = [];
  const farDates: string[] = [];

  for (const iso of dates) {
    const delta = daysBetween(today, parseIsoDate(iso));
    // Allow a small past window so "today" and recent days still resolve via
    // forecast (Open-Meteo returns recent past on the forecast endpoint too).
    if (delta >= -1 && delta <= FORECAST_HORIZON_DAYS) {
      nearDates.push(iso);
    } else {
      farDates.push(iso);
    }
  }

  const result: Record<string, WeatherInfo> = {};

  if (nearDates.length) {
    const sorted = [...nearDates].sort();
    const start = sorted[0];
    const end = sorted[sorted.length - 1];
    const forecast = await fetchForecastRange(coords, start, end);
    for (const iso of nearDates) {
      if (forecast[iso]) result[iso] = forecast[iso];
    }
  }

  // Any date we didn't resolve via forecast (e.g. the API rejected the range
  // because it extended beyond its moving horizon, or the call simply failed)
  // falls back to climatology so the UI still has something to show.
  const missing = dates.filter((iso) => !result[iso]);
  const toClimate = [...new Set([...farDates, ...missing])];

  if (toClimate.length) {
    const entries = await Promise.all(
      toClimate.map(
        async (iso) => [iso, await fetchClimateForDate(coords, iso)] as const,
      ),
    );
    for (const [iso, info] of entries) {
      if (info && !result[iso]) result[iso] = info;
    }
  }

  return result;
}
