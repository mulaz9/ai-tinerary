import { NextResponse } from "next/server";
import {
  generateActivity,
  GenerateActivityInput,
  AIError,
} from "../../../lib/ai";

export const runtime = "nodejs";

export async function POST(req: Request) {
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
    });
    return NextResponse.json({ activity, provider });
  } catch (err) {
    if (err instanceof AIError) {
      const status =
        err.code === "rate_limit"
          ? 429
          : err.code === "auth" || err.code === "no_provider"
            ? 401
            : err.code === "model_not_found"
              ? 404
              : err.code === "bad_request"
                ? 400
                : 500;
      return NextResponse.json(
        {
          error: err.message,
          code: err.code,
          provider: err.provider,
          retryAfterSec: err.retryAfterSec,
        },
        { status },
      );
    }
    const message = err instanceof Error ? err.message : "Errore sconosciuto.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
