import { NextResponse } from "next/server";
import { lookupImage } from "../../../lib/images";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim();

  if (!q) {
    return NextResponse.json(
      { error: "Parametro richiesto: q." },
      { status: 400 },
    );
  }

  const url = await lookupImage(q);
  return NextResponse.json(
    { url: url ?? null },
    {
      // Match the upstream revalidate window — safe to serve the same
      // result for a month for a given query.
      headers: {
        "cache-control":
          "public, s-maxage=2592000, stale-while-revalidate=86400",
      },
    },
  );
}
