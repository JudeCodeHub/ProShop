import { NextResponse } from "next/server";
import { clearSessionCookies } from "@/lib/session";

export async function POST() {
  return clearSessionCookies(new NextResponse(null, { status: 204 }));
}
