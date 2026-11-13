import { test } from "node:test";
import assert from "node:assert/strict";
import { regexExtract } from "../lib/parser";
import { findTrackingNumbers } from "../lib/carriers";
import { tagHome } from "../lib/home";
import * as S from "./samples";

test("order confirmation: number, total, items, variants, address, URLs", () => {
  const p = regexExtract(S.orderEmail);
  assert.equal(p.kind, "order");
  assert.equal(p.retailer, "J.Crew");
  assert.equal(p.orderNumber, "JC1234567");
  assert.equal(p.total, 581.49);
  assert.equal(p.items.length, 2);
  assert.equal(p.items[0].name, "Ludlow Slim-fit Suit Jacket");
  assert.equal(p.items[0].price, 398);
  assert.equal(p.items[0].variant, "Size: 40R, Color: Navy");
  assert.match(p.items[1].url!, /cashmere-crew/);
  assert.match(p.shippingAddress!, /Palm Coast, FL 32137/);
  assert.equal(p.orderDate!.getFullYear(), 2026);
  assert.deepEqual(p.missing, []);
});

test("shipping: UPS tracking from text and link, deduped", () => {
  const p = regexExtract(S.shippingEmail);
  assert.equal(p.kind, "shipping");
  assert.deepEqual(p.tracking, [{ number: "1Z999AA10123456784", carrier: "UPS" }]);
  assert.equal(p.orderNumber, "JC1234567");
});

test("Amazon shipment with USPS number and Boynton address", () => {
  const p = regexExtract(S.amazonShip);
  assert.equal(p.retailer, "Amazon");
  assert.equal(p.orderNumber, "112-1234567-7654321");
  assert.equal(p.tracking[0].carrier, "USPS");
  assert.equal(p.tracking[0].number, "9400111899223197428490");
  assert.equal(tagHome(p.shippingAddress, "", ""), "boynton_beach");
});

test("Narvar FedEx: retailer from display name, FedEx by context", () => {
  const p = regexExtract(S.fedexNarvar);
  assert.equal(p.kind, "shipping");
  assert.equal(p.retailer, "Nordstrom");
  assert.deepEqual(p.tracking, [{ number: "771234567890", carrier: "FedEx" }]);
});

test("return label, return received, refund", () => {
  const a = regexExtract(S.returnLabel);
  assert.equal(a.kind, "return_label");
  assert.equal(a.tracking[0].number, "1Z999AA10198765432");
  assert.equal(regexExtract(S.returnReceived).kind, "return_received");
  const r = regexExtract(S.refundEmail);
  assert.equal(r.kind, "refund");
  assert.equal(r.refundAmount, 148);
  assert.equal(r.orderNumber, "JC1234567");
});

test("newsletter is irrelevant, vague shipping needs review", () => {
  assert.equal(regexExtract(S.newsletter).kind, "irrelevant");
  const v = regexExtract(S.vagueShipping);
  assert.equal(v.kind, "shipping");
  assert.ok(v.missing.includes("tracking number"));
});

test("carrier formats", () => {
  const t = findTrackingNumbers("TBA123456789012 and LZ123456789US and JD014600006281234567");
  assert.deepEqual(t.map((x) => x.carrier).sort(), ["Amazon", "DHL", "USPS"]);
  assert.equal(findTrackingNumbers("Call us at 8005551234 or order 123456789012").length, 0);
});

test("home tagging uses saved addresses first", () => {
  assert.equal(tagHome("12 Florida Park Dr, Palm Coast FL 32137", "12 Florida Park Dr, Palm Coast, FL 32137", ""), "palm_coast");
  assert.equal(tagHome("99 Ocean Ave, Somewhere 33435", "", "99 Ocean Ave Boynton Beach FL 33435"), "boynton_beach");
  assert.equal(tagHome("1 Main St, Austin TX 78701", "", ""), null);
});
