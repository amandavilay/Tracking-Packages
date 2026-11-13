import * as cheerio from "cheerio";
import { db } from "./db";
import { askJSON } from "./claude";
import { htmlToText } from "./gmail";
import { notify } from "./push";

const UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const num = (v: unknown) => {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? "").replace(/[^0-9.]/g, ""));
  return isFinite(n) && n > 0 ? n : undefined;
};

function words(s?: string | null) {
  return (s || "").toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 0 && !["size", "color", "colour"].includes(w));
}

/** Read the price from JSON-LD, then Open Graph / microdata. Tries to match the purchased variant. */
export function extractStructuredPrice(html: string, variant?: string | null): { price?: number; image?: string } {
  const $ = cheerio.load(html);
  const image = $('meta[property="og:image"]').attr("content");
  const offers: { price: number; label: string }[] = [];
  const visit = (node: any, label = "") => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) return node.forEach((n) => visit(n, label));
    const type = [].concat(node["@type"] || []).join(",");
    const here = [label, node.name, node.sku, node.color, node.size].filter(Boolean).join(" ");
    if (/Offer/.test(type)) {
      const p = num(node.price ?? node.lowPrice ?? node.priceSpecification?.price);
      if (p) offers.push({ price: p, label: here });
    }
    for (const k of ["offers", "hasVariant", "@graph", "itemListElement"]) if (node[k]) visit(node[k], /Product/.test(type) ? here : label);
  };
  $('script[type="application/ld+json"]').each((_, el) => {
    try { visit(JSON.parse($(el).text())); } catch { /* ignore bad JSON-LD */ }
  });
  if (offers.length) {
    const want = words(variant);
    if (want.length > 1) {
      const scored = offers.map((o) => ({ o, s: want.filter((w) => words(o.label).includes(w)).length })).sort((a, b) => b.s - a.s);
      if (scored[0].s > 0) return { price: scored[0].o.price, image };
    }
    return { price: offers[0].price, image };
  }
  const meta = num(
    $('meta[property="product:price:amount"]').attr("content") ??
      $('meta[property="og:price:amount"]').attr("content") ??
      $('[itemprop="price"]').attr("content") ??
      $('[itemprop="price"]').first().text(),
  );
  return { price: meta, image };
}

export async function fetchPrice(url: string, variant?: string | null): Promise<{ price?: number; image?: string; blocked?: boolean }> {
  let html: string;
  try {
    const r = await fetch(url, { headers: { "User-Agent": UA, Accept: "text/html", "Accept-Language": "en-US" }, redirect: "follow", signal: AbortSignal.timeout(15000) });
    if (!r.ok) return { blocked: true };
    html = await r.text();
  } catch {
    return { blocked: true };
  }
  if (/captcha|access denied|are you a robot|px-captcha/i.test(html.slice(0, 5000)) && html.length < 50000) return { blocked: true };
  const s = extractStructuredPrice(html, variant);
  if (s.price) return s;
  const ai = await askJSON<{ price: number | null }>(
    "You read a product page and report the current selling price in USD for the requested variant. Use the sale price if one is shown. Return null if no price is visible.",
    `Variant wanted: ${variant || "any"}\n\nPage text:\n${htmlToText(html).slice(0, 15000)}`,
    { type: "object", additionalProperties: false, required: ["price"], properties: { price: { type: ["number", "null"] } } },
  );
  return ai?.price ? { price: ai.price, image: s.image } : { blocked: true, image: s.image };
}

/** Twice daily: check every item still inside its 14 day window. */
export async function checkPrices(itemIds?: number[]) {
  const now = new Date();
  await db.item.updateMany({ where: { priceStatus: { not: "removed" }, trackUntil: { lt: now } }, data: { priceStatus: "removed" } });
  const items = await db.item.findMany({
    where: itemIds ? { id: { in: itemIds } } : { productUrl: { not: null }, priceStatus: { not: "removed" }, trackUntil: { gte: now } },
  });
  let checked = 0;
  for (const it of items) {
    if (!it.productUrl) continue;
    const r = await fetchPrice(it.productUrl, it.variant);
    checked++;
    if (r.blocked || !r.price) {
      await db.item.update({ where: { id: it.id }, data: { priceStatus: "blocked", priceLastChecked: now, imageUrl: it.imageUrl ?? r.image } });
      continue;
    }
    await db.item.update({ where: { id: it.id }, data: { currentPrice: r.price, priceStatus: "ok", priceLastChecked: now, imageUrl: it.imageUrl ?? r.image } });
    await db.pricePoint.create({ data: { itemId: it.id, price: r.price } });
    const drop = (it.pricePaid ?? 0) - r.price;
    if (it.pricePaid && drop >= 5 && (it.dropNotifiedAt == null || r.price < it.dropNotifiedAt)) {
      await notify("priceDrop", `Price drop: $${drop.toFixed(2)} off`, `${it.name} at ${it.retailer} is now $${r.price.toFixed(2)}`, "/prices");
      await db.item.update({ where: { id: it.id }, data: { dropNotifiedAt: r.price } });
    }
  }
  return { checked };
}
