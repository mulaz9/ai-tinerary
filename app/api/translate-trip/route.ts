import { NextResponse } from "next/server";
import { translateTrip, AIError, providerLabel } from "../../../lib/ai";
import type { Trip } from "../../../types";

export const runtime = "nodejs";

export async function POST(req: Request) {
  let body: { trip?: Trip; targetLang?: string };
  try {
    body = (await req.json()) as { trip?: Trip; targetLang?: string };
  } catch {
    return NextResponse.json({ error: "Body JSON non valido." }, { status: 400 });
  }

  const trip = body.trip;
  const targetLang = body.targetLang?.trim();

  if (!trip || !Array.isArray(trip.days) || !targetLang) {
    return NextResponse.json(
      { error: "Campi obbligatori: trip, targetLang." },
      { status: 400 },
    );
  }

  try {
    const { trip: translated, provider } = await translateTrip(trip, targetLang);
    return NextResponse.json({
      trip: translated,
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
