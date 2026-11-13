import { test } from "node:test";
import assert from "node:assert/strict";
import { db } from "../lib/db";
import { ingestEmail } from "../lib/ingest";
import { fromTrackInfo } from "../lib/tracking";
import { extractStructuredPrice } from "../lib/prices";
import { windowClose, daysLeft, isOverdue } from "../lib/returns";
import { missingPackageDraft, priceAdjustmentDraft } from "../lib/drafts";
import { spending } from "../lib/summary";
import * as S from "./samples";

const opts = { allowClaude: false };

test("full email pipeline with dedupe", async () => {
  await db.settings.upsert({ where: { id: 1 }, update: { palmCoastAddress: "12 Florida Park Dr, Palm Coast, FL 32137" }, create: { id: 1, palmCoastAddress: "12 Florida Park Dr, Palm Coast, FL 32137" } });
  for (const e of [S.orderEmail, S.shippingEmail, S.amazonShip, S.fedexNarvar, S.returnLabel, S.returnReceived, S.refundEmail, S.newsletter, S.vagueShipping])
    await ingestEmail(e, opts);
  // Same email again is skipped; a duplicate shipping email with a new id adds nothing.
  assert.equal((await ingestEmail(S.orderEmail, opts)).skipped, true);
  await ingestEmail({ ...S.shippingEmail, id: "s-ship-dup" }, opts);

  const orders = await db.order.findMany({ include: { items: true } });
  const jcrew = orders.find((o) => o.orderNumber === "JC1234567")!;
  assert.equal(jcrew.items.length, 2);
  assert.equal(jcrew.home, "palm_coast");
  assert.equal(jcrew.total, 581.49);

  const pkgs = await db.package.findMany();
  const outbound = pkgs.filter((p) => !p.isReturn);
  assert.equal(outbound.length, 3, "UPS + USPS + FedEx, no duplicates");
  const ups = outbound.find((p) => p.carrier === "UPS")!;
  assert.equal(ups.home, "palm_coast", "inherits home from order");
  assert.match(ups.description!, /Ludlow/);
  assert.equal(outbound.find((p) => p.carrier === "USPS")!.home, "boynton_beach");

  const returns = await db.returnRequest.findMany();
  assert.equal(returns.length, 1);
  assert.equal(returns[0].itemName, "Cashmere Crewneck Sweater");
  assert.equal(returns[0].refundStatus, "received");
  assert.equal(returns[0].refundAmount, 148);
  assert.ok(returns[0].deliveredToRetailerAt);
  assert.equal(pkgs.filter((p) => p.isReturn).length, 1);

  const review = await db.reviewItem.findMany();
  assert.deepEqual(review.map((r) => r.emailId), ["s-vague-1"]);

  const sp = await spending("this");
  assert.ok(sp.refunded >= 148);
});

test("17TRACK response mapping", () => {
  const t = fromTrackInfo({
    latest_status: { status: "Delivered" },
    time_metrics: { estimated_delivery_date: { from: "2026-11-05T00:00:00Z", to: null } },
    tracking: { providers: [{ events: [
      { time_iso: "2026-11-04T09:00:00-05:00", description: "In transit", location: "Jacksonville, FL" },
      { time_iso: "2026-11-05T14:12:00-05:00", description: "Delivered, front door", location: "Palm Coast, FL" },
    ] }] },
  });
  assert.equal(t.status, "delivered");
  assert.equal(t.events[0].description, "Delivered, front door");
  assert.equal(t.lastLocation, "Palm Coast, FL");
  assert.ok(t.deliveredAt);
});

test("price from JSON-LD matches the variant bought", () => {
  const html = `<html><head><meta property="og:image" content="https://x/img.jpg">
  <script type="application/ld+json">{"@type":"ProductGroup","name":"Tee","hasVariant":[
    {"@type":"Product","name":"Tee Navy M","offers":{"@type":"Offer","price":"30.00"}},
    {"@type":"Product","name":"Tee Black L","offers":{"@type":"Offer","price":"22.50"}}]}</script></head></html>`;
  assert.equal(extractStructuredPrice(html, "Size: L, Color: Black").price, 22.5);
  assert.equal(extractStructuredPrice(html, "Size: M, Color: Navy").price, 30);
  assert.equal(extractStructuredPrice(html).image, "https://x/img.jpg");
  assert.equal(extractStructuredPrice(`<meta property="product:price:amount" content="19.99">`).price, 19.99);
});

test("return windows and overdue refunds", () => {
  const close = windowClose({ orderDate: new Date("2026-11-01"), deliveredAt: new Date("2026-11-05") }, { days: 30, basis: "delivery" });
  assert.equal(close.toISOString().slice(0, 10), "2026-12-05");
  assert.equal(daysLeft(close, new Date("2026-12-02")), 3);
  assert.ok(isOverdue({ refundStatus: "pending", deliveredToRetailerAt: new Date("2026-10-01") }, new Date("2026-10-20")));
  assert.ok(!isOverdue({ refundStatus: "pending", deliveredToRetailerAt: new Date("2026-10-10") }, new Date("2026-10-20")));
});

test("drafts include required details", () => {
  const m = missingPackageDraft({ retailer: "J.Crew", orderNumber: "JC1", trackingNumber: "1Z1", carrier: "UPS", deliveredAt: new Date("2026-11-05T19:12:00Z"), lastLocation: "Palm Coast, FL" });
  assert.match(m.body, /JC1/); assert.match(m.body, /1Z1/); assert.match(m.body, /UPS/); assert.match(m.body, /Palm Coast/); assert.match(m.body, /2:12 PM/);
  const p = priceAdjustmentDraft({ retailer: "Gap", orderNumber: "G1", name: "Jeans", pricePaid: 80, currentPrice: 60 });
  assert.match(p.body, /\$80\.00/); assert.match(p.body, /\$60\.00/); assert.match(p.body, /\$20\.00/);
});
