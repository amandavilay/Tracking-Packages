export type Carrier = "UPS" | "USPS" | "FedEx" | "DHL" | "Amazon" | "OnTrac" | "LaserShip" | "Unknown";
export interface TrackingHit { number: string; carrier: Carrier }

// Formats that are distinctive enough to trust anywhere in the email.
const STRONG: [RegExp, Carrier][] = [
  [/\b1Z[0-9A-Z]{16}\b/g, "UPS"],
  [/\b(?:94|93|92|95)\d{20}\b/g, "USPS"],
  [/\b(?:420\d{5})?(?:9[1-5]\d{20})\b/g, "USPS"],
  [/\b[A-Z]{2}\d{9}US\b/g, "USPS"],
  [/\bTBA\d{12}\b/g, "Amazon"],
  [/\bJD\d{18}\b/g, "DHL"],
  [/\bGM\d{16,18}\b/g, "DHL"],
  [/\b1LS\d{12,15}\b/g, "LaserShip"],
  [/\bC\d{14}\b/g, "OnTrac"],
];

// Plain digit runs are ambiguous, so only accept them when the text names the carrier
// or says "tracking" right before them.
const CONTEXT: [RegExp, Carrier][] = [
  [/fedex[^\n]{0,80}?\b(\d{12}|\d{15}|\d{20}|\d{22})\b/gi, "FedEx"],
  [/dhl[^\n]{0,80}?\b(\d{10,11})\b/gi, "DHL"],
  [/usps[^\n]{0,80}?\b(\d{20,22})\b/gi, "USPS"],
];
const GENERIC = /tracking\s*(?:number|no\.?|#|id)?\s*[:#]?\s*([A-Z0-9]{10,30})\b/gi;

// Tracking numbers hidden in carrier links (common in HTML emails).
const URLS: [RegExp, Carrier][] = [
  [/ups\.com\/[^\s"']*?(?:tracknum|InquiryNumber1|trackNums)=([0-9A-Z]{18})/gi, "UPS"],
  [/fedex\.com\/[^\s"']*?(?:tracknumbers|trknbr|trackingnumber)=(\d{12,22})/gi, "FedEx"],
  [/usps\.com\/[^\s"']*?(?:tLabels|qtc_tLabels1|tracknumbers)=([0-9A-Z]{13,34})/gi, "USPS"],
  [/dhl\.com\/[^\s"']*?(?:tracking-id|AWB|trackingNumber)=([0-9A-Z]{10,22})/gi, "DHL"],
];

export function guessCarrier(n: string): Carrier {
  if (/^1Z[0-9A-Z]{16}$/.test(n)) return "UPS";
  if (/^TBA\d{12}$/.test(n)) return "Amazon";
  if (/^(JD\d{18}|GM\d{16,18})$/.test(n)) return "DHL";
  if (/^[A-Z]{2}\d{9}US$/.test(n) || /^(420\d{5})?9[1-5]\d{20}$/.test(n)) return "USPS";
  if (/^1LS\d{12,15}$/.test(n)) return "LaserShip";
  if (/^C\d{14}$/.test(n)) return "OnTrac";
  if (/^\d{12}$|^\d{15}$/.test(n)) return "FedEx";
  if (/^\d{10}$/.test(n)) return "DHL";
  if (/^\d{20,22}$/.test(n)) return "USPS";
  return "Unknown";
}

export function findTrackingNumbers(text: string): TrackingHit[] {
  const found = new Map<string, Carrier>();
  const add = (n: string, c: Carrier) => {
    const num = n.toUpperCase().replace(/\s/g, "");
    if (!found.has(num) || found.get(num) === "Unknown") found.set(num, c);
  };
  for (const [re, c] of URLS) for (const m of text.matchAll(re)) add(m[1], c);
  for (const [re, c] of STRONG) for (const m of text.matchAll(re)) add(m[0], c);
  for (const [re, c] of CONTEXT) for (const m of text.matchAll(re)) add(m[1], c);
  for (const m of text.matchAll(GENERIC)) {
    const n = m[1];
    if (/\d/.test(n) && /^[A-Z0-9]+$/i.test(n) && !/^\d{1,9}$/.test(n)) add(n, guessCarrier(n.toUpperCase()));
  }
  // Drop numbers that are substrings of a longer hit (e.g. USPS 420+zip prefix forms).
  const nums = [...found.keys()];
  return nums
    .filter((n) => !nums.some((o) => o !== n && o.includes(n)))
    .map((number) => ({ number, carrier: found.get(number)! }));
}

export function carrierTrackUrl(carrier: string | null | undefined, n: string) {
  switch (carrier) {
    case "UPS": return `https://www.ups.com/track?tracknum=${n}`;
    case "USPS": return `https://tools.usps.com/go/TrackConfirmAction?tLabels=${n}`;
    case "FedEx": return `https://www.fedex.com/fedextrack/?trknbr=${n}`;
    case "DHL": return `https://www.dhl.com/us-en/home/tracking.html?tracking-id=${n}`;
    default: return `https://t.17track.net/en#nums=${n}`;
  }
}
