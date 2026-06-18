import { appendFileSync } from "node:fs";
import { join } from "node:path";
import { NextResponse } from "next/server";

const LOG_PATH = join(process.cwd(), ".cursor/debug-4dd1f4.log");

export async function POST(request: Request) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ ok: false }, { status: 404 });
  }

  try {
    const payload = await request.json();
    appendFileSync(LOG_PATH, `${JSON.stringify(payload)}\n`, "utf8");
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
}
