import { NextResponse } from "next/server";
import {
  geocodeLocation,
  getWeatherForDates,
} from "../../../lib/weather";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const location = searchParams.get("location")?.trim();
  const datesParam = searchParams.get("dates")?.trim();

  if (!location || !datesParam) {
    return NextResponse.json(
      { error: "Parametri richiesti: location, dates (CSV)." },
      { status: 400 },
    );
  }

  const dates = datesParam
    .split(",")
    .map((d) => d.trim())
    .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d));

  if (!dates.length) {
    return NextResponse.json({ weatherByDate: {} });
  }

  const coords = await geocodeLocation(location);
  if (!coords) {
    return NextResponse.json({ weatherByDate: {} });
  }

  const weatherByDate = await getWeatherForDates(coords, dates);
  return NextResponse.json({ weatherByDate });
}
