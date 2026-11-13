import { db } from "./db";
import { askJSON } from "./claude";
import { notify } from "./push";

const DAY = 86400000;
export const retailerKey = (r: string) => r.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Return policy for a retailer: manual override, then cached AI lookup, then a 30 day default. */
export async function getPolicy(retailer: string) {
  const key = retailerKey(retailer);
  const cached = await db.retailerPolicy.findUnique({ where: { retailer: key } });
  if (cached && (cached.source !== "default" || Date.now() - +cached.updatedAt < 7 * DAY)) return cached;
  const ai = await askJSON<{ days: number | null; basis: "delivery" | "order"; url: string | null }>(
    "You look up a US retailer's standard online return window by reading their official return policy page. Report the number of days and whether it counts from delivery or from the order/purchase date. Use null for days if you cannot find it.",
    `Retailer: ${retailer}. Find the standard return window for online orders.`,
    {
      type: "object", additionalProperties: false, required: ["days", "basis", "url"],
      properties: { days: { type: ["integer", "null"] }, basis: { type: "string", enum: ["delivery", "order"] }, url: { type: ["string", "null"] } },
    },
    { web: true },
  );
  const data = ai?.days
    ? { days: ai.days, basis: ai.basis, source: "ai", url: ai.url }
    : { days: 30, basis: "delivery", source: "default", url: null };
  return db.retailerPolicy.upsert({ where: { retailer: key }, update: data, create: { retailer: key, ...data } });
}

export function windowClose(item: { orderDate: Date; deliveredAt: Date | null }, policy: { days: number; basis: string }) {
  const start = policy.basis === "order" ? item.orderDate : item.deliveredAt ?? item.orderDate;
  return new Date(start.getTime() + policy.days * DAY);
}

export const daysLeft = (close: Date, now = new Date()) => Math.ceil((close.getTime() - now.getTime()) / DAY);

/** Items with an open return window, soonest closing first. */
export async function openWindows() {
  const items = await db.item.findMany({
    where: { deliveredAt: { not: null }, returnDecision: null },
    include: { order: true },
  });
  const out = [];
  for (const it of items) {
    const policy = await getPolicy(it.retailer);
    const close = windowClose(it, policy);
    const left = daysLeft(close);
    if (left >= 0) out.push({ item: it, policy, close, left });
  }
  return out.sort((a, b) => a.left - b.left);
}

export async function returnWindowAlerts() {
  let sent = 0;
  for (const w of await openWindows()) {
    if (w.left <= 3 && !w.item.windowNotified) {
      await notify("returnWindow", "Return window closing", `${w.item.name} (${w.item.retailer}): ${w.left} day${w.left === 1 ? "" : "s"} left`, "/returns");
      await db.item.update({ where: { id: w.item.id }, data: { windowNotified: true } });
      sent++;
    }
  }
  return { sent };
}

export const isOverdue = (r: { refundStatus: string; deliveredToRetailerAt: Date | null }, now = new Date()) =>
  r.refundStatus === "pending" && !!r.deliveredToRetailerAt && now.getTime() - r.deliveredToRetailerAt.getTime() > 14 * DAY;
