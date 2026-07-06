import { NextResponse } from "next/server";
import {
  generateTrip,
  GenerateTripInput,
  AIError,
  providerLabel,
} from "../../../lib/ai";
import { rateLimitGuard } from "../../../lib/rate-limit";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const limited = rateLimitGuard(req, "generate-trip", 5, 60_000);
  if (limited) {
    return NextResponse.json(
      { error: "Troppe richieste.", code: "rate_limit", retryAfterSec: limited.retryAfterSec },
      { status: 429, headers: { "Retry-After": String(limited.retryAfterSec) } },
    );
  }

  let body: Partial<GenerateTripInput>;
  try {
    body = (await req.json()) as Partial<GenerateTripInput>;
  } catch {
    return NextResponse.json({ error: "Body JSON non valido." }, { status: 400 });
  }

  const destination = body.destination?.trim();
  const arrival = body.arrival?.trim();
  const departure = body.departure?.trim();
  const notes = body.notes?.trim() || undefined;
  const language = body.language?.trim() || undefined;
  const accommodation = body.accommodation?.trim() || undefined;
  const accommodations = Array.isArray(body.accommodations)
    ? body.accommodations
        .map((a) => (typeof a === "string" ? a.trim() : ""))
        .filter((a): a is string => a.length > 0)
    : undefined;

  if (!destination || !arrival || !departure) {
    return NextResponse.json(
      { error: "Campi obbligatori: destination, arrival, departure." },
      { status: 400 },
    );
  }

  try {
    const { trip, provider, fellBack } = await generateTrip({
      destination,
      arrival,
      departure,
      notes,
      language,
      accommodation,
      accommodations,
    });
    return NextResponse.json({
      trip,
      provider,
      providerLabel: providerLabel(provider),
      fellBack,
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
