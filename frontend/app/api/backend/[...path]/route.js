import { NextResponse } from "next/server";
import { BACKEND_API_URL, TOKEN_COOKIE, clearSessionCookies } from "@/lib/session";

const REQUEST_HEADERS = ["accept", "content-type"];
const RESPONSE_HEADERS = ["content-type", "content-disposition"];

async function forward(request, { params }) {
  const { path } = await params;
  if (path.some((segment) => segment === "." || segment === "..")) {
    return NextResponse.json({ statusCode: 400, message: "Invalid path" }, { status: 400 });
  }

  const headers = new Headers();
  for (const name of REQUEST_HEADERS) {
    const value = request.headers.get(name);
    if (value) {
      headers.set(name, value);
    }
  }
  const token = request.cookies.get(TOKEN_COOKIE)?.value;
  if (token) {
    headers.set("authorization", `Bearer ${token}`);
  }

  const target = `${BACKEND_API_URL}/${path.map(encodeURIComponent).join("/")}${request.nextUrl.search}`;
  const hasBody = !["GET", "HEAD"].includes(request.method);

  let backend;
  try {
    backend = await fetch(target, {
      method: request.method,
      headers,
      body: hasBody ? await request.arrayBuffer() : undefined,
      cache: "no-store",
      redirect: "manual",
    });
  } catch {
    return NextResponse.json(
      { statusCode: 502, message: "Cannot reach the server. Please try again." },
      { status: 502 },
    );
  }

  const responseHeaders = new Headers();
  for (const name of RESPONSE_HEADERS) {
    const value = backend.headers.get(name);
    if (value) {
      responseHeaders.set(name, value);
    }
  }

  const response = new NextResponse(backend.status === 204 ? null : backend.body, {
    status: backend.status,
    headers: responseHeaders,
  });
  return backend.status === 401 ? clearSessionCookies(response) : response;
}

export const GET = forward;
export const POST = forward;
export const PUT = forward;
export const PATCH = forward;
export const DELETE = forward;
