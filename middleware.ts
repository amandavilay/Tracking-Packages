import { NextResponse, type NextRequest } from "next/server";

import { sessionToken } from "./lib/session";

// Simple password gate so only you can open the app.

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (
    pathname.startsWith("/login") || pathname.startsWith("/api/cron") || pathname.startsWith("/api/login") ||
    pathname === "/sw.js" || pathname === "/manifest.webmanifest" || pathname.startsWith("/icon") || pathname === "/apple-touch-icon.png"
  ) return NextResponse.next();
  const pw = process.env.APP_PASSWORD;
  if (!pw) return NextResponse.next(); // no password configured (local dev)
  if (req.cookies.get("st_session")?.value === (await sessionToken(pw))) return NextResponse.next();
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = `?next=${encodeURIComponent(pathname)}`;
  return NextResponse.redirect(url);
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
