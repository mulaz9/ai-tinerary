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
    return NextResponse.redirect(new URL("/login", request.url), {
      status: 303,
    });
  }

  // The caller is a plain HTML form, so failures redirect back to /account
  // with an error flag instead of returning raw JSON.
  const failureRedirect = () => {
    const url = new URL("/account", request.url);
    url.searchParams.set("deleteError", "1");
    return NextResponse.redirect(url, { status: 303 });
  };

  const admin = createSupabaseAdminClient();
  if (!admin) {
    console.error("[account/delete] admin client not configured");
    return failureRedirect();
  }

  // trips.user_id and trip_shares.owner_id both cascade from auth.users, so
  // deleting the user atomically removes trips and share links too.
  const { error: deleteUserError } = await admin.auth.admin.deleteUser(user.id);
  if (deleteUserError) {
    console.error("[account/delete] auth:", deleteUserError.message);
    return failureRedirect();
  }

  await supabase.auth.signOut();

  const url = new URL("/login", request.url);
  url.searchParams.set("accountDeleted", "1");
  return NextResponse.redirect(url, { status: 303 });
}
