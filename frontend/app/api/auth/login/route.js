import { NextResponse } from "next/server";
import {
  BACKEND_API_URL,
  TOKEN_COOKIE,
  USER_COOKIE,
  decodeToken,
  sessionCookieOptions,
} from "@/lib/session";

const error = (status, message) =>
  NextResponse.json({ statusCode: status, message }, { status });

export async function POST(request) {
  let credentials;
  try {
    credentials = await request.json();
  } catch {
    return error(400, "Send your email and password as JSON");
  }

  let backend;
  try {
    backend = await fetch(`${BACKEND_API_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ email: credentials?.email, password: credentials?.password }),
      cache: "no-store",
    });
  } catch {
    return error(502, "Cannot reach the server. Please try again.");
  }

  const data = await backend.json().catch(() => null);
  if (!backend.ok) {
    return NextResponse.json(data ?? { statusCode: backend.status, message: "Sign in failed" }, {
      status: backend.status,
    });
  }

  const claims = decodeToken(data?.accessToken);
  if (!claims || !data.user) {
    return error(502, "The server sent an invalid sign-in response");
  }

  const user = {
    id: claims.userId,
    role: claims.role,
    name: data.user.name,
    email: data.user.email,
  };
  const options = sessionCookieOptions(request, claims.exp);
  const response = NextResponse.json({ user });
  response.cookies.set(TOKEN_COOKIE, data.accessToken, options);
  response.cookies.set(USER_COOKIE, JSON.stringify({ name: user.name, email: user.email }), options);
  return response;
}
