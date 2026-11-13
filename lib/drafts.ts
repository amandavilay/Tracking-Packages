// Ready to copy email drafts. Nothing here ever sends email.
export interface Draft { subject: string; body: string }

const fmt = (n?: number | null) => (n == null ? "N/A" : `$${n.toFixed(2)}`);
const when = (d?: Date | null) =>
  d ? d.toLocaleString("en-US", { timeZone: "America/New_York", dateStyle: "medium", timeStyle: "short" }) + " ET" : "N/A";

export function missingPackageDraft(p: {
  retailer?: string | null; orderNumber?: string | null; trackingNumber: string; carrier?: string | null;
  deliveredAt?: Date | null; lastLocation?: string | null; description?: string | null;
}): Draft {
  return {
    subject: `Missing package: order ${p.orderNumber || ""} marked delivered but not received`.replace("  ", " "),
    body: `Hello ${p.retailer || ""} Customer Service,

My order was marked as delivered, but I never received it.

Order number: ${p.orderNumber || "N/A"}
Item(s): ${p.description || "N/A"}
Carrier: ${p.carrier || "N/A"}
Tracking number: ${p.trackingNumber}
Delivery scan: ${when(p.deliveredAt)}${p.lastLocation ? `, ${p.lastLocation}` : ""}

I have checked around my home, with neighbors, and with the carrier. Could you please send a replacement or issue a refund?

Thank you,`,
  };
}

export function priceAdjustmentDraft(i: {
  retailer: string; orderNumber?: string | null; name: string; variant?: string | null;
  pricePaid?: number | null; currentPrice?: number | null; productUrl?: string | null;
}): Draft {
  const diff = (i.pricePaid ?? 0) - (i.currentPrice ?? 0);
  return {
    subject: `Price adjustment request for order ${i.orderNumber || ""}`.trim(),
    body: `Hello ${i.retailer} Customer Service,

I recently purchased the item below and noticed the price has dropped. I would like to request a price adjustment for the difference.

Order number: ${i.orderNumber || "N/A"}
Item: ${i.name}${i.variant ? ` (${i.variant})` : ""}
Price paid: ${fmt(i.pricePaid)}
Current price: ${fmt(i.currentPrice)}
Difference: ${fmt(diff)}
${i.productUrl ? `Product page: ${i.productUrl}\n` : ""}
Please refund the difference to my original payment method. Thank you!`,
  };
}

export function refundFollowUpDraft(r: {
  retailer: string; orderNumber?: string | null; itemName: string; refundExpected?: number | null;
  trackingNumber?: string | null; deliveredToRetailerAt?: Date | null;
}): Draft {
  return {
    subject: `Refund status for returned order ${r.orderNumber || ""}`.trim(),
    body: `Hello ${r.retailer} Customer Service,

I returned the item below and tracking shows it was delivered to you, but I have not received my refund yet.

Order number: ${r.orderNumber || "N/A"}
Item: ${r.itemName}
Expected refund: ${fmt(r.refundExpected)}
Return tracking number: ${r.trackingNumber || "N/A"}
Delivered to you: ${when(r.deliveredToRetailerAt)}

Could you please confirm the status of my refund and when I can expect it?

Thank you,`,
  };
}
