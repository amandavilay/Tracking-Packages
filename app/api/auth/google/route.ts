import { NextResponse } from "next/server";
import { authUrl } from "@/lib/gmail";
export const dynamic = "force-dynamic";
export function GET() {
  return NextResponse.redirect(authUrl());
}
