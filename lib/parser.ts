import { findTrackingNumbers, type TrackingHit } from "./carriers";
import { askJSON } from "./claude";

export type EmailKind = "order" | "shipping" | "delivered" | "return_label" | "return_received" | "refund" | "irrelevant";

export interface RawEmail {
  id: string;
  from: string;
  subject: string;
  date: Date;
  text: string; // plain text (HTML already converted)
  html?: string;
}

export interface ParsedItem { name: string; price?: number; variant?: string; url?: string; image?: string; quantity?: number }

export interface ParsedEmail {
  kind: EmailKind;
  retailer?: string;
  orderNumber?: string;
  orderDate?: Date;
  total?: number;
  shippingAddress?: string;
  items: ParsedItem[];
  tracking: TrackingHit[];
  refundAmount?: number;
  usedClaude: boolean;
  missing: string[];
}

const SENDER_RETAILERS: Record<string, string> = {
  amazon: "Amazon", target: "Target", walmart: "Walmart", nordstrom: "Nordstrom", bestbuy: "Best Buy",
  costco: "Costco", apple: "Apple", nike: "Nike", jcrew: "J.Crew", gap: "Gap", oldnavy: "Old Navy",
  sephora: "Sephora", ulta: "Ulta", homedepot: "Home Depot", lowes: "Lowe's", wayfair: "Wayfair",
  macys: "Macy's", zappos: "Zappos", chewy: "Chewy", mizzenandmain: "Mizzen+Main", lululemon: "lululemon",
};
// Aggregators send on behalf of a retailer; the real retailer is in the display name or subject.
const AGGREGATORS = /narvar|route|shop\.app|shopify|loopreturns|loop|happyreturns|aftership|ups|usps|fedex|dhl/i;

export function retailerFromSender(from: string, subject: string): string | undefined {
  const display = from.replace(/<.*>/, "").replace(/"/g, "").replace(/\s+(via|from)\s+.*$/i, "").trim();
  const domain = (from.match(/@([\w.-]+)/)?.[1] || "").toLowerCase();
  const root = domain.split(".").slice(-2, -1)[0] || "";
  if (SENDER_RETAILERS[root]) return SENDER_RETAILERS[root];
  if (!AGGREGATORS.test(domain) && root) {
    return display && !/no.?reply|orders?|info|support|shipping/i.test(display) ? display : root[0].toUpperCase() + root.slice(1);
  }
  const fromSubject = subject.match(/(?:your|from)\s+([A-Z][\w&+'. ]{1,30}?)\s+(?:order|package|return|refund)/);
  if (fromSubject) return fromSubject[1].trim();
  if (display && !AGGREGATORS.test(display)) return display;
  return undefined;
}

export function classify(subject: string, text: string): EmailKind {
  const s = subject.toLowerCase();
  const t = (subject + " " + text.slice(0, 3000)).toLowerCase();
  if (/refund (has been |was )?(issued|processed|completed|confirmation)|\brefunded\b|(issued|processed) (your|a) refund/.test(t)) return "refund";
  if (/return (has been )?received|we('ve| have) received your return|return (is )?(complete|processed)|dropped off|drop-?off confirm/.test(t)) return "return_received";
  if (/return label|return request|return (is )?(started|confirmed|approved)|start(ed)? (a|your) return|return authori[sz]ation/.test(t)) return "return_label";
  if (/\bdelivered\b|has been delivered|was delivered/.test(s)) return "delivered";
  if (/has shipped|shipped|on (its|the) way|out for delivery|tracking number|in transit|shipment|track your (package|order)/.test(t)) return "shipping";
  if (/order confirm|thank(s| you) for (your )?(order|purchase)|order (received|placed)|we('ve| have) received your order|receipt|order #/.test(t)) return "order";
  return "irrelevant";
}

const money = (s: string) => parseFloat(s.replace(/[$,]/g, ""));

export function regexExtract(email: RawEmail): ParsedEmail {
  const text = email.text;
  const all = text + "\n" + (email.html || "");
  const kind = classify(email.subject, text);
  const out: ParsedEmail = { kind, items: [], tracking: [], usedClaude: false, missing: [] };
  out.retailer = retailerFromSender(email.from, email.subject);
  for (const m of (email.subject + "\n" + text).matchAll(/order(?:\s+confirmation)?\s*(?:number|no\.?|#|id)?\s*[:#]?\s*#?\s*([A-Z0-9][A-Z0-9-]{4,24})\b/gi)) {
    if (/\d/.test(m[1])) { out.orderNumber = m[1]; break; }
  }
  const total = text.match(/(?:order total|grand total|total charged)\s*[:\-]?\s*\$\s?([\d,]+\.\d{2})/i) || text.match(/(?<!sub)\btotal\s*[:\-]?\s*\$\s?([\d,]+\.\d{2})/i);
  if (total) out.total = money(total[1]);
  const refund = text.match(/refund(?:ed)?(?: amount| total)?(?: of)?\s*[:\-]?\s*\$\s?([\d,]+\.\d{2})/i)
    || text.match(/\$\s?([\d,]+\.\d{2})[^\n]{0,40}refund/i);
  if (refund) out.refundAmount = money(refund[1]);
  out.tracking = findTrackingNumbers(all);
  const addr = text.match(/(?:ship(?:ping)? to|shipping address|deliver(?:ing|y)? to)\s*:?\s*\n?([\s\S]{10,160}?\b\d{5}(?:-\d{4})?\b)/i);
  if (addr) out.shippingAddress = addr[1].replace(/\s+/g, " ").trim();
  const od = text.match(/order (?:date|placed)\s*:?\s*([A-Za-z]{3,9}\.? \d{1,2},? \d{4}|\d{1,2}\/\d{1,2}\/\d{2,4})/i);
  out.orderDate = od && !isNaN(Date.parse(od[1])) ? new Date(od[1]) : email.date;

  // Simple item lines: "Name ... $12.34" optionally followed by "Size: M" / "Color: Blue" lines.
  const lines = text.split(/\n/).map((l) => l.trim()).filter(Boolean);
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^(.{3,120}?)\s+(?:x\s?\d+\s+)?\$\s?([\d,]+\.\d{2})$/);
    if (!m || /total|subtotal|shipping|tax|discount|refund|savings|estimated|order/i.test(m[1])) continue;
    const variant: string[] = [];
    for (let j = i + 1; j < Math.min(i + 4, lines.length); j++) {
      const v = lines[j].match(/^(size|color|colour|style|fit|width)\s*:\s*(.+)$/i);
      if (v) variant.push(`${v[1][0].toUpperCase()}${v[1].slice(1).toLowerCase()}: ${v[2]}`);
    }
    out.items.push({ name: m[1].replace(/\s+x\s?\d+$/, ""), price: money(m[2]), variant: variant.join(", ") || undefined });
  }
  const urls = [...all.matchAll(/https?:\/\/[^\s"'<>)]+\/(?:products?|dp|p|ip)\/[^\s"'<>)]+/gi)].map((m) => m[0]);
  out.items.forEach((it, i) => { if (urls[i]) it.url = urls[i]; });
  out.missing = missingFields(out);
  return out;
}

export function missingFields(p: ParsedEmail): string[] {
  const m: string[] = [];
  if (!p.retailer) m.push("retailer");
  switch (p.kind) {
    case "order":
      if (!p.orderNumber) m.push("order number");
      if (!p.items.length) m.push("items");
      if (p.total == null) m.push("order total");
      break;
    case "shipping": case "delivered":
      if (!p.tracking.length) m.push("tracking number");
      break;
    case "return_label": case "return_received":
      if (!p.orderNumber && !p.items.length) m.push("order number or item");
      break;
    case "refund":
      if (p.refundAmount == null) m.push("refund amount");
      break;
  }
  return m;
}

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["kind", "retailer", "orderNumber", "orderDate", "total", "shippingAddress", "refundAmount", "items", "tracking"],
  properties: {
    kind: { type: "string", enum: ["order", "shipping", "delivered", "return_label", "return_received", "refund", "irrelevant"] },
    retailer: { type: ["string", "null"] },
    orderNumber: { type: ["string", "null"] },
    orderDate: { type: ["string", "null"], description: "ISO date" },
    total: { type: ["number", "null"] },
    shippingAddress: { type: ["string", "null"] },
    refundAmount: { type: ["number", "null"] },
    items: {
      type: "array",
      items: {
        type: "object", additionalProperties: false, required: ["name", "price", "variant", "url", "image"],
        properties: {
          name: { type: "string" }, price: { type: ["number", "null"] }, variant: { type: ["string", "null"] },
          url: { type: ["string", "null"] }, image: { type: ["string", "null"] },
        },
      },
    },
    tracking: {
      type: "array",
      items: {
        type: "object", additionalProperties: false, required: ["number", "carrier"],
        properties: { number: { type: "string" }, carrier: { type: "string" } },
      },
    },
  },
};

const SYSTEM = `You extract shopping data from a single email. Return the email's kind and every field you can find.
Retailer is the store the person bought from (not the carrier or a tracking service like Narvar or Route).
Item price is the price paid per item. Variant combines size and color, e.g. "Size: M, Color: Navy".
Product url should be the link to the product page if present. Use null for anything not in the email; never guess.`;

/** Regex first; fall back to Claude when regex left key fields empty. */
export async function parseEmail(email: RawEmail, opts: { allowClaude?: boolean } = { allowClaude: true }): Promise<ParsedEmail> {
  const r = regexExtract(email);
  if (r.kind === "irrelevant" || !r.missing.length || opts.allowClaude === false) return r;
  if (r.kind === "order" && r.missing.length === 0) return r;
  const body = email.text.slice(0, 20000);
  const links = email.html ? [...new Set([...email.html.matchAll(/href="(https?:[^"]+)"/g)].map((m) => m[1]))].slice(0, 60).join("\n") : "";
  const ai = await askJSON<any>(SYSTEM, `From: ${email.from}\nSubject: ${email.subject}\nDate: ${email.date.toISOString()}\n\n${body}\n\nLinks:\n${links}`, SCHEMA);
  if (!ai) return r;
  const merged: ParsedEmail = {
    kind: ai.kind || r.kind,
    retailer: r.retailer && !/^(Narvar|Route|Shop)$/i.test(r.retailer) ? r.retailer : ai.retailer ?? r.retailer,
    orderNumber: r.orderNumber ?? ai.orderNumber ?? undefined,
    orderDate: ai.orderDate && !isNaN(Date.parse(ai.orderDate)) ? new Date(ai.orderDate) : r.orderDate,
    total: r.total ?? ai.total ?? undefined,
    shippingAddress: r.shippingAddress ?? ai.shippingAddress ?? undefined,
    refundAmount: r.refundAmount ?? ai.refundAmount ?? undefined,
    items: r.items.length ? r.items : (ai.items || []).map((i: any) => ({
      name: i.name, price: i.price ?? undefined, variant: i.variant ?? undefined, url: i.url ?? undefined, image: i.image ?? undefined,
    })),
    tracking: r.tracking.length ? r.tracking : (ai.tracking || []).map((t: any) => ({ number: t.number.replace(/\s/g, "").toUpperCase(), carrier: t.carrier })),
    usedClaude: true,
    missing: [],
  };
  merged.missing = missingFields(merged);
  return merged;
}
