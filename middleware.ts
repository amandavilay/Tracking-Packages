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
  if (!pw) {
    // No password set: allowed locally, locked in production so the app is never open to the public.
    if (process.env.NODE_ENV !== "production") return NextResponse.next();
    return new NextResponse("Set APP_PASSWORD in Vercel to open this app.", { status: 503 });
  }
  if (req.cookies.get("st_session")?.value === (await sessionToken(pw))) return NextResponse.next();
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = `?next=${encodeURIComponent(pathname)}`;
  return NextResponse.redirect(url);
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
