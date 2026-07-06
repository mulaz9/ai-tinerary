import { NextResponse } from "next/server";
import {
  geocodeLocation,
  getWeatherForDates,
} from "../../../lib/weather";
import { rateLimitGuard } from "../../../lib/rate-limit";

export const runtime = "nodejs";

/** Hard cap on how many dates one request may ask for (a trip is ≤ ~1 month). */
const MAX_DATES = 31;

export async function GET(req: Request) {
  const limited = rateLimitGuard(req, "weather", 30, 60_000);
  if (limited) {
    return NextResponse.json(
      { error: "Troppe richieste.", retryAfterSec: limited.retryAfterSec },
      { status: 429, headers: { "Retry-After": String(limited.retryAfterSec) } },
    );
  }

  const { searchParams } = new URL(req.url);
  const location = searchParams.get("location")?.trim();
  const datesParam = searchParams.get("dates")?.trim();
  const lang = searchParams.get("lang")?.trim() || "en";

  if (!location || !datesParam) {
    return NextResponse.json(
      { error: "Parametri richiesti: location, dates (CSV)." },
      { status: 400 },
    );
  }

  const dates = datesParam
    .split(",")
    .map((d) => d.trim())
    .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
    .slice(0, MAX_DATES);

  if (!dates.length) {
    return NextResponse.json({ weatherByDate: {} });
  }

  const coords = await geocodeLocation(location, lang);
  if (!coords) {
    return NextResponse.json({ weatherByDate: {} });
  }

  const weatherByDate = await getWeatherForDates(coords, dates);
  return NextResponse.json({ weatherByDate });
}
