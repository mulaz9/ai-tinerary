import { NextResponse } from "next/server";
import {
  generateActivity,
  GenerateActivityInput,
  AIError,
  providerLabel,
} from "../../../lib/ai";
import { rateLimitGuard } from "../../../lib/rate-limit";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const limited = rateLimitGuard(req, "generate-activity", 10, 60_000);
  if (limited) {
    return NextResponse.json(
      { error: "Troppe richieste.", code: "rate_limit", retryAfterSec: limited.retryAfterSec },
      { status: 429, headers: { "Retry-After": String(limited.retryAfterSec) } },
    );
  }

  let body: Partial<GenerateActivityInput>;
  try {
    body = (await req.json()) as Partial<GenerateActivityInput>;
  } catch {
    return NextResponse.json({ error: "Body JSON non valido." }, { status: 400 });
  }

  const destination = body.destination?.trim();
  const placeOfInterest = body.placeOfInterest?.trim();
  const accommodation = body.accommodation?.trim() || undefined;
  const dayDate = body.dayDate?.trim() || undefined;
  const startTime = body.startTime?.trim() || undefined;
  const notes = body.notes?.trim() || undefined;
  const language = body.language?.trim() || undefined;
  const existingActivities = Array.isArray(body.existingActivities)
    ? body.existingActivities
        .map((a) => ({
          title: typeof a?.title === "string" ? a.title.trim() : "",
          location: typeof a?.location === "string" ? a.location.trim() : "",
        }))
        .filter((a) => a.title || a.location)
    : undefined;
  const durationMins =
    typeof body.durationMins === "number" && body.durationMins > 0
      ? Math.round(body.durationMins)
      : undefined;

  if (!destination || !placeOfInterest) {
    return NextResponse.json(
      { error: "Campi obbligatori: destination, placeOfInterest." },
      { status: 400 },
    );
  }

  try {
    const { activity, provider } = await generateActivity({
      destination,
      placeOfInterest,
      accommodation,
      dayDate,
      startTime,
      durationMins,
      notes,
      language,
      existingActivities,
    });
    return NextResponse.json({
      activity,
      provider,
      providerLabel: providerLabel(provider),
    });
  } catch (err) {
    if (err instanceof AIError) {
      const status =
        err.code === "rate_limit"
          ? 429
          : err.code === "auth" || err.code === "no_provider"
            ? 401
            : err.code === "model_not_found"
              ? 404
              : err.code === "unavailable"
                ? 503
                : err.code === "bad_request"
                  ? 400
                  : 500;
      return NextResponse.json(
        {
          error: err.message,
          code: err.code,
          provider: err.provider,
          providerLabel: providerLabel(err.provider),
          retryAfterSec: err.retryAfterSec,
        },
        { status },
      );
    }
    const message = err instanceof Error ? err.message : "Errore sconosciuto.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
