export const TOKEN_COOKIE = "proshop_token";
export const USER_COOKIE = "proshop_user";

export const BACKEND_API_URL = (
  process.env.BACKEND_API_URL ?? "http://localhost:3001/api"
).replace(/\/+$/, "");

const ROLES = new Set(["admin", "cashier"]);

export function decodeToken(token, now = Date.now()) {
  if (typeof token !== "string") {
    return null;
  }
  const parts = token.split(".");
  if (parts.length !== 3) {
    return null;
  }
  try {
    const claims = JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")));
    const valid =
      Number.isInteger(claims.userId) &&
      ROLES.has(claims.role) &&
      typeof claims.exp === "number" &&
      claims.exp * 1000 > now;
    return valid ? { userId: claims.userId, role: claims.role, exp: claims.exp } : null;
  } catch {
    return null;
  }
}

export function readSession(cookieStore) {
  const token = cookieStore.get(TOKEN_COOKIE)?.value;
  const claims = decodeToken(token);
  if (!claims) {
    return null;
  }

  let profile = {};
  try {
    profile = JSON.parse(cookieStore.get(USER_COOKIE)?.value ?? "{}");
  } catch {
    profile = {};
  }

  return {
    token,
    user: {
      id: claims.userId,
      role: claims.role,
      name: typeof profile.name === "string" ? profile.name : "",
      email: typeof profile.email === "string" ? profile.email : "",
    },
  };
}

export function sessionCookieOptions(request, exp) {
  return {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: request.nextUrl.protocol === "https:",
    maxAge: Math.max(0, exp - Math.floor(Date.now() / 1000)),
  };
}

export function clearSessionCookies(response) {
  response.cookies.delete(TOKEN_COOKIE);
  response.cookies.delete(USER_COOKIE);
  return response;
}
