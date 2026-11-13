import { NextResponse } from "next/server";
import { saveTokensFromCode } from "@/lib/gmail";
import { scanGmail } from "@/lib/ingest";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: Request) {
  const code = new URL(req.url).searchParams.get("code");
  if (!code) return NextResponse.redirect(`${process.env.APP_URL}/settings?gmail=error`);
  await saveTokensFromCode(code);
  // Kick off the 60 day backfill (first batch); hourly scans finish the rest.
  scanGmail().catch((e) => console.error(e));
  return NextResponse.redirect(`${process.env.APP_URL}/settings?gmail=connected`);
}
