import { db, getSettings } from "./db";
import { openWindows, isOverdue } from "./returns";
import { HOME_LABEL } from "./home";
import { notify } from "./push";

export const etDate = (d = new Date()) => d.toLocaleDateString("en-CA", { timeZone: "America/New_York" });
export const etHour = (d = new Date()) => Number(d.toLocaleString("en-US", { timeZone: "America/New_York", hour: "numeric", hourCycle: "h23" }));

export async function activeDrops() {
  const items = await db.item.findMany({ where: { priceStatus: "ok", currentPrice: { not: null }, pricePaid: { not: null }, trackUntil: { gte: new Date() } } });
  return items.filter((i) => i.currentPrice! < i.pricePaid!);
}

export async function todaySummary() {
  const today = etDate();
  const pkgs = await db.package.findMany({ where: { archived: false, isReturn: false, NOT: { status: "delivered" } } });
  const arriving = pkgs.filter((p) => p.status === "out_for_delivery" || (p.estDelivery && etDate(p.estDelivery) === today));
  const exceptions = pkgs.filter((p) => p.status === "exception");
  const drops = await activeDrops();
  const closing = (await openWindows()).filter((w) => w.left <= 3);
  const overdue = (await db.returnRequest.findMany({ where: { refundStatus: "pending" } })).filter((r) => isOverdue(r));
  return { arriving, exceptions, drops, closing, overdue };
}

export function digestText(s: Awaited<ReturnType<typeof todaySummary>>) {
  const parts: string[] = [];
  if (s.arriving.length)
    parts.push(`Arriving today: ${s.arriving.map((p) => `${p.description || p.retailer || "package"}${p.home ? ` (${HOME_LABEL[p.home]})` : ""}`).join(", ")}`);
  if (s.exceptions.length) parts.push(`${s.exceptions.length} exception${s.exceptions.length > 1 ? "s" : ""}`);
  if (s.drops.length) parts.push(`${s.drops.length} price drop${s.drops.length > 1 ? "s" : ""}`);
  if (s.closing.length) parts.push(`${s.closing.length} return window${s.closing.length > 1 ? "s" : ""} closing`);
  if (s.overdue.length) parts.push(`${s.overdue.length} overdue refund${s.overdue.length > 1 ? "s" : ""}`);
  return parts.join(". ") || "Nothing needs your attention today.";
}

/** Runs every hour; sends once per day at the hour chosen in Settings (Eastern). */
export async function maybeSendDigest(force = false) {
  const s = await getSettings();
  const today = etDate();
  if (!force && (!s.digestEnabled || etHour() !== s.digestHour || s.lastDigestDate === today)) return { sent: false };
  const body = digestText(await todaySummary());
  await notify("digest", "Your morning summary", body, "/today");
  await db.settings.update({ where: { id: 1 }, data: { lastDigestDate: today } });
  return { sent: true, body };
}

/** Spending: orders by month minus refunds received. */
export async function spending(range: "this" | "last" | "six") {
  const now = new Date();
  const y = now.getFullYear(), m = now.getMonth();
  const from = range === "this" ? new Date(y, m, 1) : range === "last" ? new Date(y, m - 1, 1) : new Date(y, m - 5, 1);
  const to = range === "last" ? new Date(y, m, 1) : new Date(y, m + 1, 1);
  const orders = await db.order.findMany({ where: { orderDate: { gte: from, lt: to } }, include: { items: true } });
  const refunds = await db.returnRequest.findMany({ where: { refundStatus: "received", refundedAt: { gte: from, lt: to } } });
  const orderTotal = (o: (typeof orders)[number]) => o.total ?? o.items.reduce((a, i) => a + (i.pricePaid ?? 0), 0);
  const byRetailer = new Map<string, number>();
  const byMonth = new Map<string, number>();
  const key = (d: Date) => d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
  for (let d = new Date(from); d < to; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) byMonth.set(key(d), 0);
  for (const o of orders) {
    byRetailer.set(o.retailer, (byRetailer.get(o.retailer) ?? 0) + orderTotal(o));
    byMonth.set(key(o.orderDate), (byMonth.get(key(o.orderDate)) ?? 0) + orderTotal(o));
  }
  for (const r of refunds) {
    byRetailer.set(r.retailer, (byRetailer.get(r.retailer) ?? 0) - (r.refundAmount ?? 0));
    byMonth.set(key(r.refundedAt!), (byMonth.get(key(r.refundedAt!)) ?? 0) - (r.refundAmount ?? 0));
  }
  const spent = orders.reduce((a, o) => a + orderTotal(o), 0);
  const refunded = refunds.reduce((a, r) => a + (r.refundAmount ?? 0), 0);
  const saved = (await db.item.aggregate({ _sum: { savedAmount: true } }))._sum.savedAmount ?? 0;
  const refundedAll = (await db.returnRequest.aggregate({ where: { refundStatus: "received" }, _sum: { refundAmount: true } }))._sum.refundAmount ?? 0;
  return {
    net: spent - refunded, spent, refunded,
    retailers: [...byRetailer.entries()].map(([name, total]) => ({ name, total })).sort((a, b) => b.total - a.total),
    months: [...byMonth.entries()].map(([name, total]) => ({ name, total })),
    savedAll: saved, refundedAll,
  };
}
