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

  // #region agent log
  fetch("http://127.0.0.1:7872/ingest/266cf421-78fa-40dc-aeaf-b1a54776429d", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "89ffaa" },
    body: JSON.stringify({
      sessionId: "89ffaa",
      hypothesisId: "HD1-HD2",
      location: "parse-trip-form/route.ts:input",
      message: "parse-trip-form request received",
      data: { transcript, language, referenceDate },
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion

  try {
    const { form, provider } = await parseTripFormFromSpeech({
      transcript,
      language,
      referenceDate,
    });
    // #region agent log
    fetch("http://127.0.0.1:7872/ingest/266cf421-78fa-40dc-aeaf-b1a54776429d", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "89ffaa" },
      body: JSON.stringify({
        sessionId: "89ffaa",
        hypothesisId: "HD4",
        location: "parse-trip-form/route.ts:output",
        message: "parse-trip-form normalized result",
        data: { form, provider },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
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
