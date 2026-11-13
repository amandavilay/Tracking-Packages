import { db } from "./db";
import { scanGmail } from "./ingest";
import { refreshPackages, autoArchive } from "./tracking";
import { checkPrices } from "./prices";
import { returnWindowAlerts } from "./returns";
import { maybeSendDigest } from "./summary";

/** Keep item delivery dates in sync with delivered packages (starts return windows). */
async function syncDeliveries() {
  const pkgs = await db.package.findMany({ where: { status: "delivered", isReturn: false, orderId: { not: null } } });
  for (const p of pkgs)
    await db.item.updateMany({ where: { orderId: p.orderId!, deliveredAt: null }, data: { deliveredAt: p.deliveredAt ?? p.lastUpdate ?? new Date() } });
}

export const JOBS: Record<string, () => Promise<unknown>> = {
  scan: async () => {
    const r = await scanGmail();
    await syncDeliveries();
    return r;
  },
  tracking: async () => ({ ...(await refreshPackages()), ...(await autoArchive()), ...(await syncDeliveries(), {}) }),
  prices: () => checkPrices(),
  returns: () => returnWindowAlerts(),
  digest: () => maybeSendDigest(),
};
