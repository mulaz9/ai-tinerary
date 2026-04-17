import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "./lib/supabase/middleware";

/**
 * Auth is opt-in: unauthenticated users keep browsing with trips stored
 * locally, signed-in users get Supabase-backed cross-device sync. The
 * only routing rule here is bouncing signed-in users away from /login.
 */
export async function proxy(request: NextRequest) {
  const { response, user, configured } = await updateSession(request);
  if (!configured) return response;

  const { pathname } = request.nextUrl;
  if (user && pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Run on every path except:
     * - Next internals (_next/static, _next/image)
     * - favicon
     * - public asset files (images, fonts…)
     * API routes are matched so server code can read the session cookie.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff|woff2|ttf)$).*)",
  ],
};
