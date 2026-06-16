import { NextResponse } from "next/server";
import {
  parseTripFormFromSpeech,
  ParseTripFormInput,
  AIError,
  providerLabel,
} from "../../../lib/ai";

export const runtime = "nodejs";

export async function POST(req: Request) {
  let body: Partial<ParseTripFormInput>;
  try {
    body = (await req.json()) as Partial<ParseTripFormInput>;
  } catch {
    return NextResponse.json({ error: "Body JSON non valido." }, { status: 400 });
  }

  const transcript = body.transcript?.trim();
  const language = body.language?.trim() || undefined;
  const referenceDate = body.referenceDate?.trim() || undefined;

  if (!transcript) {
    return NextResponse.json(
      { error: "Campo obbligatorio: transcript." },
      { status: 400 },
    );
  }

  try {
    const { form, provider } = await parseTripFormFromSpeech({
      transcript,
      language,
      referenceDate,
    });
    return NextResponse.json({
      form,
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
