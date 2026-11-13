import { NextResponse } from "next/server";
import { JOBS } from "@/lib/jobs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Vercel Cron sends "Authorization: Bearer $CRON_SECRET" automatically.
export async function GET(req: Request, { params }: { params: Promise<{ job: string }> }) {
  const { job } = await params;
  if (process.env.CRON_SECRET && req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const fn = JOBS[job];
  if (!fn) return NextResponse.json({ error: "unknown job" }, { status: 404 });
  try {
    return NextResponse.json({ job, result: await fn() });
  } catch (e) {
    return NextResponse.json({ job, error: (e as Error).message }, { status: 500 });
  }
}
