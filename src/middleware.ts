import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

interface CookieToSet {
  name: string;
  value: string;
  options?: CookieOptions;
}

// Refreshes the Supabase auth session on every request and blocks
// unauthenticated access to /admin and /dashboard at the edge. Final
// authorization (e.g. admin role, enrollment) still happens server-side in
// each page/route via lib/auth.ts and RLS — this is a fast first gate, not
// the source of truth. Because it's only a first gate, any failure here
// (missing env vars, a transient Supabase error) falls back to letting the
// request through rather than 500ing the entire site — the page-level
// requireUser()/requireAdmin() checks remain the real boundary.
export async function middleware(request: NextRequest) {
  try {
    let response = NextResponse.next({ request });

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(cookiesToSet: CookieToSet[]) {
            cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
            response = NextResponse.next({ request });
            cookiesToSet.forEach(({ name, value, options }) =>
              response.cookies.set(name, value, options)
            );
          },
        },
      }
    );

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const path = request.nextUrl.pathname;
    const isProtected = path.startsWith("/admin") || path.startsWith("/dashboard");

    if (isProtected && !user) {
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("next", path);
      return NextResponse.redirect(loginUrl);
    }

    return response;
  } catch (error) {
    console.error("middleware error — falling through to page-level auth checks:", error);
    return NextResponse.next({ request });
  }
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
