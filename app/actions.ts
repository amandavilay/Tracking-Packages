"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db, getSettings } from "@/lib/db";
import { guessCarrier } from "@/lib/carriers";
import { refreshPackages } from "@/lib/tracking";
import { checkPrices } from "@/lib/prices";
import { scanGmail } from "@/lib/ingest";
import { retailerKey } from "@/lib/returns";
import { tagHome } from "@/lib/home";

const DAY = 86400000;
const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const numOrNull = (v: string) => (v === "" || isNaN(Number(v.replace(/[$,]/g, ""))) ? null : Number(v.replace(/[$,]/g, "")));
const done = (...paths: string[]) => paths.forEach((p) => revalidatePath(p));

// ---------- Packages ----------
export async function addPackage(f: FormData) {
  const n = str(f, "tracking").toUpperCase().replace(/\s/g, "");
  if (!n) return;
  const carrier = str(f, "carrier") || guessCarrier(n);
  const pkg = await db.package.upsert({
    where: { trackingNumber: n },
    update: {},
    create: { trackingNumber: n, carrier, retailer: str(f, "retailer") || null, description: str(f, "description") || null, home: str(f, "home") || null },
  });
  await refreshPackages([pkg.id]).catch(() => {});
  done("/packages");
}

export async function updatePackage(f: FormData) {
  const id = Number(f.get("id"));
  await db.package.update({
    where: { id },
    data: { description: str(f, "description") || null, retailer: str(f, "retailer") || null, home: str(f, "home") || null },
  });
  done("/packages", `/packages/${id}`);
}

export async function deletePackage(f: FormData) {
  await db.package.delete({ where: { id: Number(f.get("id")) } });
  done("/packages");
  redirect("/packages");
}

export async function refreshAll() {
  await refreshPackages().catch((e) => console.error(e));
  done("/packages");
}

export async function setClaim(f: FormData) {
  const id = Number(f.get("id"));
  await db.package.update({ where: { id }, data: { claimStatus: str(f, "status") || null } });
  done("/packages", `/packages/${id}`);
}

// ---------- Price drops ----------
export async function addItemByUrl(f: FormData) {
  const url = str(f, "url");
  const price = numOrNull(str(f, "price"));
  if (!url) return;
  const host = new URL(url).hostname.replace(/^www\./, "").split(".")[0];
  const now = new Date();
  const item = await db.item.create({
    data: {
      name: str(f, "name") || "Item from " + host, retailer: str(f, "retailer") || host[0].toUpperCase() + host.slice(1),
      variant: str(f, "variant") || null, pricePaid: price, productUrl: url, orderDate: now, trackUntil: new Date(+now + 14 * DAY),
    },
  });
  await checkPrices([item.id]).catch(() => {});
  done("/prices");
}

export async function setAdjust(f: FormData) {
  const id = Number(f.get("id"));
  const status = str(f, "status");
  const it = await db.item.findUniqueOrThrow({ where: { id } });
  const saved = status === "refunded" ? Math.max(0, (it.pricePaid ?? 0) - (it.currentPrice ?? it.pricePaid ?? 0)) : 0;
  await db.item.update({ where: { id }, data: { adjustStatus: status || null, savedAmount: saved } });
  done("/prices", "/spending");
}

export async function removeItemFromPrices(f: FormData) {
  await db.item.update({ where: { id: Number(f.get("id")) }, data: { priceStatus: "removed" } });
  done("/prices");
}

export async function checkPricesNow() {
  await checkPrices().catch((e) => console.error(e));
  done("/prices");
}

// ---------- Returns ----------
export async function setReturnDecision(f: FormData) {
  const id = Number(f.get("id"));
  const decision = str(f, "decision");
  const it = await db.item.update({ where: { id }, data: { returnDecision: decision }, include: { order: true } });
  if (decision === "returning" && !(await db.returnRequest.findFirst({ where: { itemId: id } }))) {
    await db.returnRequest.create({
      data: { itemId: id, retailer: it.retailer, itemName: it.name, orderNumber: it.order?.orderNumber, refundExpected: it.pricePaid },
    });
  }
  done("/returns");
}

export async function updateReturn(f: FormData) {
  const id = Number(f.get("id"));
  const tracking = str(f, "tracking").toUpperCase().replace(/\s/g, "");
  const r = await db.returnRequest.update({
    where: { id },
    data: {
      refundExpected: numOrNull(str(f, "refundExpected")),
      trackingNumber: tracking || null,
      ...(f.get("refundStatus") ? { refundStatus: str(f, "refundStatus"), refundedAt: str(f, "refundStatus") === "received" ? new Date() : null } : {}),
    },
  });
  if (r.refundStatus === "received" && r.refundAmount == null) await db.returnRequest.update({ where: { id }, data: { refundAmount: r.refundExpected } });
  if (tracking) {
    await db.package.upsert({
      where: { trackingNumber: tracking },
      update: { isReturn: true },
      create: { trackingNumber: tracking, carrier: guessCarrier(tracking), retailer: r.retailer, description: `Return: ${r.itemName}`, isReturn: true },
    });
  }
  done("/returns", "/spending");
}

// ---------- Settings ----------
export async function saveSettings(f: FormData) {
  await getSettings();
  const s = await db.settings.update({
    where: { id: 1 },
    data: {
      palmCoastAddress: str(f, "palmCoast"),
      boyntonAddress: str(f, "boynton"),
      digestEnabled: f.get("digestEnabled") === "on",
      digestHour: Number(f.get("digestHour") ?? 8),
      notifyPriceDrop: f.get("notifyPriceDrop") === "on",
      notifyReturnWindow: f.get("notifyReturnWindow") === "on",
      notifyDelivery: f.get("notifyDelivery") === "on",
      notifyException: f.get("notifyException") === "on",
      notifyRefund: f.get("notifyRefund") === "on",
    },
  });
  // Re-tag anything that is not tagged yet now that addresses are known.
  for (const o of await db.order.findMany({ where: { home: null, shippingAddress: { not: null } } })) {
    const home = tagHome(o.shippingAddress, s.palmCoastAddress, s.boyntonAddress);
    if (home) {
      await db.order.update({ where: { id: o.id }, data: { home } });
      await db.package.updateMany({ where: { orderId: o.id, home: null }, data: { home } });
    }
  }
  done("/settings", "/packages");
}

export async function savePolicy(f: FormData) {
  const retailer = retailerKey(str(f, "retailer"));
  const days = Number(f.get("days"));
  if (!retailer || !days) return;
  const data = { days, basis: str(f, "basis") || "delivery", source: "manual" };
  await db.retailerPolicy.upsert({ where: { retailer }, update: data, create: { retailer, ...data } });
  done("/settings", "/returns");
}

export async function deletePolicy(f: FormData) {
  await db.retailerPolicy.delete({ where: { retailer: str(f, "retailer") } });
  done("/settings", "/returns");
}

export async function disconnectGmail() {
  await db.settings.update({ where: { id: 1 }, data: { gmailTokensEnc: null, gmailEmail: null } });
  done("/settings");
}

export async function scanNow() {
  await scanGmail().catch((e) => console.error(e));
  done("/packages", "/settings", "/review");
}

// ---------- Needs review ----------
export async function resolveReview(f: FormData) {
  const id = Number(f.get("id"));
  const r = await db.reviewItem.findUniqueOrThrow({ where: { id } });
  const retailer = str(f, "retailer");
  const orderNumber = str(f, "orderNumber") || null;
  const tracking = str(f, "tracking").toUpperCase().replace(/\s/g, "");
  const itemName = str(f, "itemName");
  const price = numOrNull(str(f, "price"));
  const amount = numOrNull(str(f, "amount"));
  const parsed = JSON.parse(r.data || "{}");
  const date = parsed.orderDate ? new Date(parsed.orderDate) : r.createdAt;
  let order = orderNumber ? await db.order.findFirst({ where: { orderNumber } }) : null;
  if (!order && retailer && (orderNumber || itemName))
    order = await db.order.create({ data: { retailer, orderNumber, orderDate: date, total: numOrNull(str(f, "total")), emailId: r.emailId } });
  if (order && itemName)
    await db.item.create({ data: { orderId: order.id, name: itemName, retailer: order.retailer, pricePaid: price, productUrl: str(f, "url") || null, orderDate: order.orderDate, trackUntil: new Date(+order.orderDate + 14 * DAY) } });
  if (tracking)
    await db.package.upsert({
      where: { trackingNumber: tracking },
      update: { retailer: retailer || undefined, orderId: order?.id },
      create: { trackingNumber: tracking, carrier: guessCarrier(tracking), retailer: retailer || null, orderId: order?.id, description: itemName || null, emailId: r.emailId, isReturn: r.kind.startsWith("return") },
    });
  if (r.kind === "refund" && amount != null)
    await db.returnRequest.create({ data: { retailer: retailer || "Unknown", itemName: itemName || "Refund", orderNumber, refundStatus: "received", refundAmount: amount, refundedAt: date, emailId: r.emailId } });
  await db.reviewItem.update({ where: { id }, data: { resolved: true } });
  done("/review", "/packages", "/prices", "/returns", "/spending");
}

export async function dismissReview(f: FormData) {
  await db.reviewItem.update({ where: { id: Number(f.get("id")) }, data: { resolved: true } });
  done("/review");
}
