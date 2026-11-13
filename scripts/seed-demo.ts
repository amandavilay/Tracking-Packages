// Loads the sample emails plus fake tracking/price data so you can preview the UI without API keys.
import { db } from "../lib/db";
import { ingestEmail } from "../lib/ingest";
import * as S from "../tests/samples";

const DAY = 86400000;
const ago = (d: number) => new Date(Date.now() - d * DAY);
(async () => {
  await db.settings.upsert({ where: { id: 1 }, update: {}, create: { id: 1, palmCoastAddress: "12 Florida Park Dr, Palm Coast, FL 32137", boyntonAddress: "455 SW 8th Ave, Boynton Beach, FL 33435" } });
  const fresh = (e: typeof S.orderEmail, days: number) => ({ ...e, date: ago(days), text: e.text.replace("November 1, 2026", ago(days).toDateString()) });
  for (const [e, d] of [[S.orderEmail, 9], [S.shippingEmail, 7], [S.amazonShip, 2], [S.fedexNarvar, 0], [S.returnLabel, 5], [S.returnReceived, 2], [S.vagueShipping, 1]] as const)
    await ingestEmail(fresh(e, d), { allowClaude: false });
  const ev = (desc: string, loc: string, d: number) => ({ time: ago(d).toISOString(), description: desc, location: loc });
  await db.package.updateMany({ where: { carrier: "UPS", isReturn: false }, data: { status: "delivered", deliveredAt: ago(4), lastUpdate: ago(4), lastLocation: "Palm Coast, FL",
    events: JSON.stringify([ev("Delivered, front door", "Palm Coast, FL", 4), ev("Out for delivery", "Palm Coast, FL", 4.3), ev("Arrived at facility", "Jacksonville, FL", 5), ev("Shipped", "Columbus, OH", 7)]) } });
  await db.package.updateMany({ where: { carrier: "USPS" }, data: { status: "in_transit", lastUpdate: ago(0.3), lastLocation: "West Palm Beach, FL", estDelivery: new Date(),
    events: JSON.stringify([ev("Arrived at USPS regional facility", "West Palm Beach, FL", 0.3), ev("Accepted", "Seattle, WA", 2)]) } });
  await db.package.updateMany({ where: { carrier: "FedEx" }, data: { status: "exception", lastUpdate: ago(0.1), lastLocation: "Miami, FL",
    events: JSON.stringify([ev("Delivery exception: weather delay", "Miami, FL", 0.1)]) } });
  await db.package.updateMany({ where: { isReturn: true }, data: { status: "delivered" } });
  await db.returnRequest.updateMany({ data: { deliveredToRetailerAt: ago(16), droppedOffAt: ago(19), trackingStatus: "delivered" } });
  await db.item.updateMany({ where: { orderId: 1 }, data: { deliveredAt: ago(4) } });
  const items = await db.item.findMany();
  const priced = [[398, 349], [148, 148], [35.99, 29.99]];
  for (const [i, it] of items.entries()) {
    const [paid, now] = priced[i] || [it.pricePaid ?? 20, it.pricePaid ?? 20];
    await db.item.update({ where: { id: it.id }, data: { currentPrice: now, priceLastChecked: new Date(), trackUntil: new Date(+it.orderDate + 14 * DAY), imageUrl: null } });
    for (let k = 0; k < 5; k++) await db.pricePoint.create({ data: { itemId: it.id, price: paid - ((paid - now) * k) / 4, checkedAt: ago(5 - k) } });
  }
  await db.retailerPolicy.upsert({ where: { retailer: "jcrew" }, update: {}, create: { retailer: "jcrew", days: 30, basis: "delivery", source: "manual" } });
  await db.retailerPolicy.upsert({ where: { retailer: "amazon" }, update: {}, create: { retailer: "amazon", days: 30, basis: "delivery", source: "manual" } });
  await db.item.updateMany({ where: { retailer: "Amazon" }, data: { deliveredAt: ago(28) } });
  console.log("Demo data loaded.");
  process.exit(0);
})();
