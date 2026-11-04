import { NextResponse } from "next/server";

const PUBLIC_PATHS = ["/login", "/sign-up"];

// Same behaviour as the original: unauthenticated visitors are sent to /login?next=<path>.
export function proxy(request) {
  const { pathname, search } = request.nextUrl;
  if (PUBLIC_PATHS.includes(pathname)) return NextResponse.next();
  if (request.cookies.get("im_leads_auth")?.value) return NextResponse.next();

  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = `?next=${encodeURIComponent(pathname + search)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!api|_next|favicon|apple-touch-icon|.*\\.(?:png|ico|svg|jpg|jpeg|webp)$).*)"],
};
