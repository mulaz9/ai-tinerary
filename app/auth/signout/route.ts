import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "../../../lib/supabase/server";

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  if (supabase) {
    await supabase.auth.signOut();
  }
  const url = new URL("/login", request.url);
  url.searchParams.set("signedOut", "1");
  return NextResponse.redirect(url, { status: 303 });
}
