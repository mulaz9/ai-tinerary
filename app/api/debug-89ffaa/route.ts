// #region agent log — debug session 89ffaa relay (iPhone can't reach 127.0.0.1)
import { NextResponse } from "next/server";

const INGEST_URL =
  "http://127.0.0.1:7872/ingest/266cf421-78fa-40dc-aeaf-b1a54776429d";

export async function POST(request: Request) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ ok: false }, { status: 404 });
  }
  try {
    const payload = await request.json();
    await fetch(INGEST_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Debug-Session-Id": "89ffaa",
      },
      body: JSON.stringify(payload),
    }).catch(() => {});
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
}
// #endregion
