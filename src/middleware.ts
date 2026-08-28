import { NextResponse, type NextRequest } from "next/server";
import { readSession } from "@/lib/supabase/middleware";

const PUBLIC_PATHS = ["/login", "/signup", "/auth"];

/**
 * T4 / R2, R5. Routing-level gating only.
 *
 * This exists so people land on a sensible screen. It is not the security
 * boundary — RLS is (AC3). Do not add a rule here and assume it protects data.
 */
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const { response, user, status } = await readSession(request);

  const isPublic = PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );

  if (!user) {
    if (isPublic) return response;
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  // Signed in: keep them off the auth screens.
  if (isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = status === "approved" ? "/share" : "/pending";
    url.search = "";
    return NextResponse.redirect(url);
  }

  // R2, R5: pending and rejected accounts only ever see /pending.
  if (status !== "approved" && pathname !== "/pending") {
    const url = request.nextUrl.clone();
    url.pathname = "/pending";
    url.search = "";
    return NextResponse.redirect(url);
  }

  if (status === "approved" && pathname === "/pending") {
    const url = request.nextUrl.clone();
    url.pathname = "/share";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    // Everything except Next internals, the API routes (which check their own
    // session), and static files.
    "/((?!_next/static|_next/image|api/|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
