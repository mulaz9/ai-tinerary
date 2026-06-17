import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseAdminClient } from "../../../../lib/supabase/admin";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json(
      { error: "Supabase not configured." },
      { status: 503 },
    );
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const admin = createSupabaseAdminClient();
  if (!admin) {
    return NextResponse.json(
      { error: "Account deletion is not configured." },
      { status: 503 },
    );
  }

  const userId = user.id;

  const { error: sharesError } = await admin
    .from("trip_shares")
    .delete()
    .eq("owner_id", userId);
  if (sharesError) {
    console.error("[account/delete] trip_shares:", sharesError.message);
    return NextResponse.json(
      { error: "Failed to delete shared trip links." },
      { status: 500 },
    );
  }

  const { error: tripsError } = await admin
    .from("trips")
    .delete()
    .eq("user_id", userId);
  if (tripsError) {
    console.error("[account/delete] trips:", tripsError.message);
    return NextResponse.json(
      { error: "Failed to delete trips." },
      { status: 500 },
    );
  }

  const { error: deleteUserError } = await admin.auth.admin.deleteUser(userId);
  if (deleteUserError) {
    console.error("[account/delete] auth:", deleteUserError.message);
    return NextResponse.json(
      { error: "Failed to delete account." },
      { status: 500 },
    );
  }

  await supabase.auth.signOut();

  const url = new URL("/login", request.url);
  url.searchParams.set("accountDeleted", "1");
  return NextResponse.redirect(url, { status: 303 });
}
