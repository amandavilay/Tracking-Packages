import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { notify } from "@/lib/push";

export async function POST(req: Request) {
  const sub = await req.json();
  if (sub?.test) return NextResponse.json({ sent: await notify("digest", "Test notification", "Push notifications are working.", "/today") });
  await db.pushSubscription.upsert({
    where: { endpoint: sub.endpoint },
    update: { p256dh: sub.keys.p256dh, auth: sub.keys.auth },
    create: { endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth },
  });
  return NextResponse.json({ ok: true });
}
