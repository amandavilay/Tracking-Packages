import * as webpush from "web-push";
import { db, getSettings } from "./db";

export type NotifyType = "priceDrop" | "returnWindow" | "delivery" | "exception" | "refund" | "digest";

const FLAG: Record<Exclude<NotifyType, "digest">, string> = {
  priceDrop: "notifyPriceDrop",
  returnWindow: "notifyReturnWindow",
  delivery: "notifyDelivery",
  exception: "notifyException",
  refund: "notifyRefund",
};

let configured = false;
function setup() {
  if (configured) return true;
  const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } = process.env;
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) return false;
  webpush.setVapidDetails(VAPID_SUBJECT || "mailto:admin@example.com", VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  configured = true;
  return true;
}

/** Send a web push to every subscribed device, if this notification type is turned on. */
export async function notify(type: NotifyType, title: string, body: string, url = "/") {
  const s = await getSettings();
  if (type === "digest" ? !s.digestEnabled : !(s as any)[FLAG[type]]) return 0;
  if (!setup()) return 0;
  const subs = await db.pushSubscription.findMany();
  let sent = 0;
  for (const sub of subs) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify({ title, body, url }),
      );
      sent++;
    } catch (e: any) {
      if (e?.statusCode === 404 || e?.statusCode === 410) await db.pushSubscription.delete({ where: { id: sub.id } });
    }
  }
  return sent;
}
