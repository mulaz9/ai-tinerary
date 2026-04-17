import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Refreshes the Supabase session cookie on every matched request and
 * returns both the mutated response and the current user (if any), so the
 * root `middleware.ts` can decide whether to redirect to `/login`.
 *
 * IMPORTANT: do not add logic between `createServerClient` and
 * `supabase.auth.getUser()` — per Supabase SSR docs the client must be
 * recreated per-request and the user fetched immediately after so the
 * cookies are refreshed.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    // Supabase not configured yet — skip auth entirely so the app still
    // boots during initial setup. The trips store will also no-op.
    return { response, user: null, configured: false as const };
  }

  const supabase = createServerClient(
    url,
    key,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  return { response, user, configured: true as const };
}
