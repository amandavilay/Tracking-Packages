import { db, getSettings } from "./db";
import { parseEmail, type ParsedEmail, type RawEmail } from "./parser";
import { tagHome } from "./home";
import { gmailClient, listMessageIds, fetchMessage, buildQuery } from "./gmail";
import { notify } from "./push";

const DAY = 86400000;
const norm = (s?: string | null) => (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");

async function upsertOrder(p: ParsedEmail, emailId: string, home: string | null) {
  if (!p.retailer || (!p.orderNumber && !p.items.length)) return null;
  let order = p.orderNumber ? await db.order.findFirst({ where: { orderNumber: p.orderNumber } }) : null;
  const orderDate = p.orderDate || new Date();
  if (!order) {
    order = await db.order.create({
      data: { retailer: p.retailer, orderNumber: p.orderNumber, orderDate, total: p.total, shippingAddress: p.shippingAddress, home, emailId },
    });
  } else {
    order = await db.order.update({
      where: { id: order.id },
      data: {
        total: order.total ?? p.total,
        shippingAddress: order.shippingAddress ?? p.shippingAddress,
        home: order.home ?? home,
        // The order confirmation is the canonical email to link back to.
        emailId: p.kind === "order" ? emailId : order.emailId ?? emailId,
        orderDate: p.kind === "order" ? orderDate : order.orderDate,
      },
    });
  }
  // Items: dedupe by normalized name + variant within the order.
  const existing = await db.item.findMany({ where: { orderId: order.id } });
  for (const it of p.items) {
    const dupe = existing.find((e) => norm(e.name) === norm(it.name) && (!it.variant || norm(e.variant) === norm(it.variant)));
    if (dupe) {
      await db.item.update({
        where: { id: dupe.id },
        data: { pricePaid: dupe.pricePaid ?? it.price, productUrl: dupe.productUrl ?? it.url, imageUrl: dupe.imageUrl ?? it.image },
      });
      continue;
    }
    existing.push(
      await db.item.create({
        data: {
          orderId: order.id, name: it.name, retailer: order.retailer, variant: it.variant, pricePaid: it.price,
          productUrl: it.url, imageUrl: it.image, orderDate: order.orderDate,
          trackUntil: new Date(order.orderDate.getTime() + 14 * DAY),
        },
      }),
    );
  }
  return order;
}

async function handle(email: RawEmail, p: ParsedEmail) {
  const s = await getSettings();
  const home = tagHome(p.shippingAddress, s.palmCoastAddress, s.boyntonAddress);
  const order = await upsertOrder(p, email.id, home);

  if (p.kind === "shipping" || p.kind === "delivered") {
    const items = order ? await db.item.findMany({ where: { orderId: order.id } }) : [];
    const desc = (p.items.length ? p.items.map((i) => i.name) : items.map((i) => i.name)).slice(0, 3).join(", ") || undefined;
    for (const t of p.tracking) {
      const pkg = await db.package.findUnique({ where: { trackingNumber: t.number } });
      const data = {
        carrier: pkg?.carrier && pkg.carrier !== "Unknown" ? pkg.carrier : t.carrier,
        retailer: pkg?.retailer ?? p.retailer ?? order?.retailer,
        description: pkg?.description ?? desc,
        orderId: pkg?.orderId ?? order?.id,
        home: pkg?.home ?? home ?? order?.home,
        emailId: pkg?.emailId ?? email.id,
        ...(p.kind === "delivered" && !pkg?.deliveredAt ? { status: "delivered", deliveredAt: email.date, lastUpdate: email.date } : {}),
      };
      if (pkg) await db.package.update({ where: { id: pkg.id }, data });
      else await db.package.create({ data: { trackingNumber: t.number, ...data } });
    }
  }

  if (p.kind === "return_label" || p.kind === "return_received") {
    const items = order ? await db.item.findMany({ where: { orderId: order.id } }) : [];
    const names: { name: string; price?: number }[] = p.items.length
      ? p.items
      : items.map((i) => ({ name: i.name, price: i.pricePaid ?? undefined }));
    const targets = names.length ? names : [{ name: "Return" }];
    const tracking = p.tracking[0];
    const dropped = /drop(ped)?[ -]?off/i.test(email.subject + " " + email.text.slice(0, 2000));
    for (const it of targets) {
      const item = items.find((i) => norm(i.name) === norm(it.name)) || (items.length === 1 ? items[0] : undefined);
      const or = [
        ...(tracking ? [{ trackingNumber: tracking.number }] : []),
        ...(item ? [{ itemId: item.id }] : []),
        ...(p.orderNumber ? [{ orderNumber: p.orderNumber, itemName: it.name }] : []),
      ];
      let ret = or.length ? await db.returnRequest.findFirst({ where: { OR: or } }) : null;
      const data = {
        trackingNumber: ret?.trackingNumber ?? tracking?.number,
        carrier: ret?.carrier ?? tracking?.carrier,
        refundExpected: ret?.refundExpected ?? it.price ?? item?.pricePaid ?? undefined,
        ...(p.kind === "return_received" && dropped && !ret?.droppedOffAt ? { droppedOffAt: email.date } : {}),
        ...(p.kind === "return_received" && !dropped ? { deliveredToRetailerAt: ret?.deliveredToRetailerAt ?? email.date } : {}),
      };
      if (ret) ret = await db.returnRequest.update({ where: { id: ret.id }, data });
      else
        ret = await db.returnRequest.create({
          data: {
            retailer: p.retailer || order?.retailer || "Unknown", itemName: item?.name || it.name, itemId: item?.id,
            orderNumber: p.orderNumber, emailId: email.id, ...data,
          },
        });
      if (item) await db.item.update({ where: { id: item.id }, data: { returnDecision: "returning" } });
      if (tracking) {
        await db.package.upsert({
          where: { trackingNumber: tracking.number },
          update: { isReturn: true },
          create: {
            trackingNumber: tracking.number, carrier: tracking.carrier, retailer: ret.retailer,
            description: `Return: ${ret.itemName}`, isReturn: true, emailId: email.id,
          },
        });
      }
    }
  }

  if (p.kind === "refund") {
    const candidates = await db.returnRequest.findMany({
      where: { refundStatus: "pending", ...(p.orderNumber ? { orderNumber: p.orderNumber } : {}) },
      orderBy: { createdAt: "asc" },
    });
    const match = candidates.find((r) => p.orderNumber || norm(r.retailer) === norm(p.retailer));
    if (match) {
      await db.returnRequest.update({
        where: { id: match.id },
        data: { refundStatus: "received", refundAmount: p.refundAmount ?? match.refundExpected, refundedAt: email.date },
      });
    } else {
      await db.returnRequest.create({
        data: {
          retailer: p.retailer || "Unknown", itemName: p.items[0]?.name || "Refund", orderNumber: p.orderNumber,
          refundStatus: "received", refundAmount: p.refundAmount, refundedAt: email.date, emailId: email.id,
        },
      });
    }
    await notify("refund", "Refund received", `${p.retailer || "A retailer"} refunded $${(p.refundAmount ?? 0).toFixed(2)}`, "/returns");
  }
}

/** Parse and store one email. Each Gmail message is processed only once. */
export async function ingestEmail(email: RawEmail, opts?: { allowClaude?: boolean }) {
  if (await db.processedEmail.findUnique({ where: { id: email.id } })) return { skipped: true as const };
  const p = await parseEmail(email, opts);
  let kind: string = p.kind;
  if (p.kind !== "irrelevant") {
    if (p.missing.length) {
      kind = "review";
      await db.reviewItem.upsert({
        where: { emailId: email.id },
        update: {},
        create: {
          emailId: email.id, subject: email.subject, sender: email.from, snippet: email.text.slice(0, 400),
          kind: p.kind, missing: p.missing.join(", "),
          data: JSON.stringify({ ...p, orderDate: p.orderDate?.toISOString() }),
        },
      });
      // Keep whatever is usable (e.g. a tracking number without a retailer).
      await handle(email, p);
    } else await handle(email, p);
  }
  await db.processedEmail.create({ data: { id: email.id, kind, receivedAt: email.date } });
  return { kind, parsed: p };
}

/** Hourly scan. The first run backfills 60 days, in batches that fit serverless time limits. */
export async function scanGmail(limit = Number(process.env.SCAN_BATCH || 40)) {
  const g = await gmailClient();
  if (!g) return { error: "Gmail not connected" };
  const s = await getSettings();
  const started = new Date();
  const after = s.backfillDone && s.lastScanAt ? new Date(s.lastScanAt.getTime() - 2 * DAY) : new Date(Date.now() - 60 * DAY);
  const ids = await listMessageIds(g, buildQuery(after));
  const done = new Set((await db.processedEmail.findMany({ where: { id: { in: ids } }, select: { id: true } })).map((x) => x.id));
  const todo = ids.filter((id) => !done.has(id));
  let processed = 0;
  for (const id of todo.slice(0, limit)) {
    try {
      await ingestEmail(await fetchMessage(g, id));
      processed++;
    } catch (e) {
      console.error("ingest failed", id, (e as Error).message);
    }
  }
  const remaining = Math.max(0, todo.length - limit);
  if (!remaining) await db.settings.update({ where: { id: 1 }, data: { lastScanAt: started, backfillDone: true } });
  return { found: ids.length, processed, remaining };
}
