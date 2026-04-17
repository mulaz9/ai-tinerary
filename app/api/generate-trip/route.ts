import { NextResponse } from "next/server";
import {
  generateTrip,
  GenerateTripInput,
  AIError,
} from "../../../lib/ai";

export const runtime = "nodejs";

export async function POST(req: Request) {
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
  const accommodation = body.accommodation?.trim() || undefined;

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
      accommodation,
    });
    return NextResponse.json({ trip, provider, fellBack });
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
