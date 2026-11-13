import { NextResponse } from "next/server";
import { sessionToken } from "@/lib/session";

export async function POST(req: Request) {
  const f = await req.formData();
  const next = String(f.get("next") || "/packages");
  const base = process.env.APP_URL || new URL(req.url).origin;
  if (f.get("password") !== process.env.APP_PASSWORD) return NextResponse.redirect(`${base}/login?e=1&next=${encodeURIComponent(next)}`, 303);
  const res = NextResponse.redirect(`${base}${next.startsWith("/") ? next : "/packages"}`, 303);
  res.cookies.set("st_session", await sessionToken(process.env.APP_PASSWORD!), { httpOnly: true, secure: base.startsWith("https"), sameSite: "lax", maxAge: 60 * 60 * 24 * 365, path: "/" });
  return res;
}
