import type { RawEmail } from "../lib/parser";

const d = (s: string) => new Date(s);

export const orderEmail: RawEmail = {
  id: "s-order-1",
  from: "J.Crew <orders@jcrew.com>",
  subject: "Your J.Crew order confirmation #JC1234567",
  date: d("2026-11-01T14:00:00Z"),
  text: `Thanks for your order!
Order Number: JC1234567
Order Date: November 1, 2026

Ludlow Slim-fit Suit Jacket $398.00
Size: 40R
Color: Navy
Cashmere Crewneck Sweater $148.00
Size: M
Color: Heather Grey

Subtotal $546.00
Shipping $0.00
Tax $35.49
Order Total: $581.49

Ship to:
Jane Doe
12 Florida Park Dr
Palm Coast, FL 32137

https://www.jcrew.com/p/mens/suits/ludlow-jacket/BJ123
https://www.jcrew.com/p/mens/sweaters/cashmere-crew/BK456`,
};

export const shippingEmail: RawEmail = {
  id: "s-ship-1",
  from: "J.Crew <shipping@jcrew.com>",
  subject: "Your J.Crew order has shipped",
  date: d("2026-11-03T14:00:00Z"),
  text: `Good news! Your order JC1234567 is on its way.
Carrier: UPS
Tracking Number: 1Z999AA10123456784
Track it: https://www.ups.com/track?tracknum=1Z999AA10123456784`,
};

export const amazonShip: RawEmail = {
  id: "s-ship-2",
  from: "Amazon.com <shipment-tracking@amazon.com>",
  subject: "Shipped: \"Anker USB C Charger...\"",
  date: d("2026-11-04T10:00:00Z"),
  text: `Your package is on the way.
Order # 112-1234567-7654321
Arriving Thursday
Ship to: 455 SW 8th Ave, Boynton Beach, FL 33435
Anker USB C Charger 65W $35.99
Your package is being shipped by USPS and the tracking number is 9400111899223197428490.`,
};

export const fedexNarvar: RawEmail = {
  id: "s-ship-3",
  from: "Nordstrom via Narvar <nordstrom@narvar.com>",
  subject: "Your Nordstrom order is out for delivery",
  date: d("2026-11-05T10:00:00Z"),
  text: `Your FedEx package is out for delivery. Tracking 771234567890
Order #: 6012345678`,
};

export const returnLabel: RawEmail = {
  id: "s-ret-1",
  from: "J.Crew Returns <returns@jcrew.com>",
  subject: "Your return label for order JC1234567",
  date: d("2026-11-08T10:00:00Z"),
  text: `Your return has been started. Print your return label below.
Order Number: JC1234567
Cashmere Crewneck Sweater $148.00
Return tracking: 1Z999AA10198765432`,
};

export const returnReceived: RawEmail = {
  id: "s-ret-2",
  from: "J.Crew Returns <returns@jcrew.com>",
  subject: "We've received your return",
  date: d("2026-11-11T10:00:00Z"),
  text: `We've received your return for order JC1234567. Your refund is being processed.
Tracking: 1Z999AA10198765432`,
};

export const refundEmail: RawEmail = {
  id: "s-refund-1",
  from: "J.Crew <customerservice@jcrew.com>",
  subject: "Your refund has been issued",
  date: d("2026-11-12T10:00:00Z"),
  text: `We've issued your refund of $148.00 for order JC1234567. It may take 3-5 business days to appear.`,
};

export const newsletter: RawEmail = {
  id: "s-news-1",
  from: "Gap <news@gap.com>",
  subject: "40% off everything this weekend",
  date: d("2026-11-06T10:00:00Z"),
  text: "Big sale. Shop now.",
};

export const vagueShipping: RawEmail = {
  id: "s-vague-1",
  from: "Shop <no-reply@shop.app>",
  subject: "Your package is on its way",
  date: d("2026-11-07T10:00:00Z"),
  text: "Your package is on its way. Open the Shop app to see details.",
};
