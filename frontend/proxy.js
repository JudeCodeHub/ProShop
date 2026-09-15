import { NextResponse } from "next/server";
import { canAccess, homeFor } from "@/lib/routes";
import { TOKEN_COOKIE, clearSessionCookies, decodeToken } from "@/lib/session";

export function proxy(request) {
  const { pathname, search } = request.nextUrl;
  const token = request.cookies.get(TOKEN_COOKIE)?.value;
  const session = decodeToken(token);

  if (!session) {
    const response =
      pathname === "/login"
        ? NextResponse.next()
        : NextResponse.redirect(loginUrl(request, pathname, search));
    return token ? clearSessionCookies(response) : response;
  }

  if (pathname === "/login" || pathname === "/" || !canAccess(session.role, pathname)) {
    return NextResponse.redirect(new URL(homeFor(session.role), request.url));
  }
  return NextResponse.next();
}

function loginUrl(request, pathname, search) {
  const url = new URL("/login", request.url);
  if (pathname !== "/") {
    url.searchParams.set("next", `${pathname}${search}`);
  }
  return url;
}

export const config = {
  matcher: ["/((?!api/|_next/static|_next/image|favicon.ico).*)"],
};
