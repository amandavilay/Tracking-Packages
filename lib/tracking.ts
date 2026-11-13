import { db } from "./db";
import { notify } from "./push";
import { HOME_LABEL } from "./home";

const API = "https://api.17track.net/track/v2.2";
// 17TRACK carrier codes. Unknown carriers are left out so 17TRACK auto-detects.
const CARRIER_CODE: Record<string, number> = { UPS: 100002, FedEx: 100003, USPS: 21051, DHL: 100001 };

export interface TrackEvent { time: string; description: string; location?: string }

async function call(path: string, body: unknown) {
  const key = process.env.TRACK17_API_KEY;
  if (!key) throw new Error("TRACK17_API_KEY is not set");
  const r = await fetch(`${API}/${path}`, {
    method: "POST",
    headers: { "17token": key, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`17TRACK ${path} ${r.status}`);
  return r.json();
}

export function mapStatus(s?: string): string {
  switch (s) {
    case "Delivered": return "delivered";
    case "OutForDelivery": case "AvailableForPickup": return "out_for_delivery";
    case "Exception": case "DeliveryFailure": case "Expired": return "exception";
    case "InTransit": return "in_transit";
    default: return "pending"; // NotFound, InfoReceived
  }
}

/** Pure mapping from a 17TRACK track_info object to our package fields (unit tested). */
export function fromTrackInfo(info: any) {
  const events: TrackEvent[] = (info?.tracking?.providers || [])
    .flatMap((p: any) => p.events || [])
    .map((e: any) => ({ time: e.time_iso || e.time_utc, description: e.description, location: e.location || undefined }))
    .filter((e: TrackEvent) => e.time)
    .sort((a: TrackEvent, b: TrackEvent) => +new Date(b.time) - +new Date(a.time));
  const status = mapStatus(info?.latest_status?.status);
  const latest = events[0];
  const est = info?.time_metrics?.estimated_delivery_date?.to || info?.time_metrics?.estimated_delivery_date?.from;
  return {
    status,
    events,
    lastLocation: latest?.location,
    lastUpdate: latest ? new Date(latest.time) : undefined,
    estDelivery: est ? new Date(est) : undefined,
    deliveredAt: status === "delivered" && latest ? new Date(latest.time) : undefined,
  };
}

/** Refresh active packages (or the ids given). 17TRACK accepts up to 40 numbers per call. */
export async function refreshPackages(ids?: number[]) {
  const pkgs = await db.package.findMany({
    where: ids ? { id: { in: ids } } : { archived: false, NOT: { status: "delivered" } },
  });
  let updated = 0;
  for (let i = 0; i < pkgs.length; i += 40) {
    const batch = pkgs.slice(i, i + 40);
    const unregistered = batch.filter((p) => !p.registered);
    if (unregistered.length) {
      const res = await call("register", unregistered.map((p) => ({ number: p.trackingNumber, ...(CARRIER_CODE[p.carrier || ""] ? { carrier: CARRIER_CODE[p.carrier!] } : {}) })));
      const ok = new Set<string>([
        ...(res?.data?.accepted || []).map((a: any) => a.number),
        // Already registered numbers come back as rejected with code -18019901.
        ...(res?.data?.rejected || []).filter((r: any) => r?.error?.code === -18019901).map((r: any) => r.number),
      ]);
      await db.package.updateMany({ where: { trackingNumber: { in: [...ok] } }, data: { registered: true } });
    }
    const res = await call("gettrackinfo", batch.map((p) => ({ number: p.trackingNumber })));
    for (const a of res?.data?.accepted || []) {
      const pkg = batch.find((p) => p.trackingNumber === a.number);
      if (!pkg) continue;
      const t = fromTrackInfo(a.track_info);
      await db.package.update({
        where: { id: pkg.id },
        data: {
          status: t.status === "pending" && pkg.status !== "pending" ? pkg.status : t.status,
          events: JSON.stringify(t.events),
          lastLocation: t.lastLocation ?? pkg.lastLocation,
          lastUpdate: t.lastUpdate ?? pkg.lastUpdate,
          estDelivery: t.estDelivery ?? pkg.estDelivery,
          deliveredAt: pkg.deliveredAt ?? t.deliveredAt,
          notifiedStatus: t.status,
        },
      });
      updated++;
      await afterStatusChange(pkg, t.status, t.deliveredAt);
    }
  }
  return { checked: pkgs.length, updated };
}

async function afterStatusChange(pkg: { id: number; isReturn: boolean; trackingNumber: string; retailer: string | null; description: string | null; home: string | null; notifiedStatus: string | null }, status: string, deliveredAt?: Date) {
  if (status === pkg.notifiedStatus) return;
  const name = pkg.description || pkg.retailer || pkg.trackingNumber;
  const home = pkg.home ? ` (${HOME_LABEL[pkg.home]})` : "";
  if (status === "exception") await notify("exception", "Package problem", `${name}${home} has a delivery exception`, "/packages");
  if (status === "out_for_delivery") await notify("delivery", "Out for delivery", `${name}${home}`, "/packages");
  if (status === "delivered") {
    await notify("delivery", "Delivered", `${name}${home}`, "/packages");
    if (pkg.isReturn) {
      await db.returnRequest.updateMany({ where: { trackingNumber: pkg.trackingNumber, deliveredToRetailerAt: null }, data: { deliveredToRetailerAt: deliveredAt || new Date() } });
    } else {
      // Mark items in this order delivered so their return window starts.
      const full = await db.package.findUnique({ where: { id: pkg.id } });
      if (full?.orderId) await db.item.updateMany({ where: { orderId: full.orderId, deliveredAt: null }, data: { deliveredAt: deliveredAt || new Date() } });
    }
  }
  if (pkg.isReturn) await db.returnRequest.updateMany({ where: { trackingNumber: pkg.trackingNumber }, data: { trackingStatus: status } });
  if (pkg.isReturn && status === "in_transit") {
    await db.returnRequest.updateMany({ where: { trackingNumber: pkg.trackingNumber, droppedOffAt: null }, data: { droppedOffAt: new Date() } });
  }
}

/** Archive packages 7 days after delivery. */
export async function autoArchive() {
  const cutoff = new Date(Date.now() - 7 * 86400000);
  const r = await db.package.updateMany({ where: { archived: false, status: "delivered", deliveredAt: { lt: cutoff } }, data: { archived: true } });
  return { archived: r.count };
}
