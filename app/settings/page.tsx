import Link from "next/link";
import { db, getSettings } from "@/lib/db";
import PushSetup from "@/components/PushSetup";
import { dateTime } from "@/components/ui";
import { saveSettings, savePolicy, deletePolicy, disconnectGmail, scanNow } from "@/app/actions";

function Toggle({ name, label, on }: { name: string; label: string; on: boolean }) {
  return (
    <label className="flex items-center justify-between py-2 text-sm">
      {label}
      <input type="checkbox" name={name} defaultChecked={on} className="h-5 w-5 accent-stone-900" />
    </label>
  );
}

export default async function Settings({ searchParams }: { searchParams: Promise<{ gmail?: string }> }) {
  const sp = await searchParams;
  const s = await getSettings();
  const policies = await db.retailerPolicy.findMany({ orderBy: { retailer: "asc" } });
  const hours = Array.from({ length: 24 }, (_, h) => [h, new Date(2000, 0, 1, h).toLocaleTimeString("en-US", { hour: "numeric" })] as const);

  return (
    <div>
      <Link href="/packages" className="text-sm text-stone-500">‹ Back</Link>
      <h1 className="h1 mt-2">Settings</h1>

      <h2 className="h2">Gmail</h2>
      <div className="card space-y-3 text-sm">
        {sp.gmail === "connected" && <p className="text-emerald-700">Connected. The last 60 days are being imported now.</p>}
        {s.gmailEmail ? (
          <>
            <p>Connected as <span className="font-medium">{s.gmailEmail}</span> (read only)</p>
            <p className="text-stone-500">Last full scan: {dateTime(s.lastScanAt)}{!s.backfillDone && " · backfill in progress"}</p>
            <div className="flex gap-2">
              <form action={scanNow}><button className="btn">Scan now</button></form>
              <form action={disconnectGmail}><button className="btn-ghost">Disconnect</button></form>
            </div>
          </>
        ) : (
          <a href="/api/auth/google" className="btn">Connect Gmail</a>
        )}
        <Link href="/review" className="block text-stone-600 underline">Needs Review list</Link>
      </div>

      <form action={saveSettings}>
        <h2 className="h2">Homes</h2>
        <div className="card space-y-3">
          <div><p className="label mb-1">Palm Coast address</p><input className="input" name="palmCoast" defaultValue={s.palmCoastAddress} placeholder="Street, Palm Coast, FL ZIP" /></div>
          <div><p className="label mb-1">Boynton Beach address</p><input className="input" name="boynton" defaultValue={s.boyntonAddress} placeholder="Street, Boynton Beach, FL ZIP" /></div>
        </div>

        <h2 className="h2">Morning digest</h2>
        <div className="card">
          <Toggle name="digestEnabled" label="Send a daily summary" on={s.digestEnabled} />
          <label className="flex items-center justify-between py-2 text-sm">Time (Eastern)
            <select name="digestHour" defaultValue={s.digestHour} className="rounded-lg border border-stone-300 bg-white px-2 py-1">
              {hours.map(([h, l]) => <option key={h} value={h}>{l}</option>)}
            </select>
          </label>
        </div>

        <h2 className="h2">Notifications</h2>
        <div className="card divide-y divide-stone-100">
          <div className="pb-3"><PushSetup /></div>
          <Toggle name="notifyPriceDrop" label="Price drops of $5 or more" on={s.notifyPriceDrop} />
          <Toggle name="notifyReturnWindow" label="Return window closing in 3 days" on={s.notifyReturnWindow} />
          <Toggle name="notifyDelivery" label="Out for delivery and delivered" on={s.notifyDelivery} />
          <Toggle name="notifyException" label="Delivery exceptions" on={s.notifyException} />
          <Toggle name="notifyRefund" label="Refunds received" on={s.notifyRefund} />
        </div>
        <button className="btn mt-4 w-full">Save settings</button>
      </form>

      <h2 className="h2">Return policies</h2>
      <div className="card space-y-3 text-sm">
        <p className="text-stone-500">Looked up automatically from each retailer's policy page. Add one here to override.</p>
        {policies.map((p) => (
          <form key={p.retailer} action={deletePolicy} className="flex items-center justify-between">
            <input type="hidden" name="retailer" value={p.retailer} />
            <span>{p.retailer} · {p.days} days from {p.basis} <span className="text-stone-400">({p.source})</span></span>
            <button className="text-stone-400">Reset</button>
          </form>
        ))}
        <form action={savePolicy} className="grid grid-cols-3 gap-2">
          <input className="input col-span-3" name="retailer" placeholder="Retailer name" required />
          <input className="input" name="days" type="number" min="1" placeholder="Days" required />
          <select className="input col-span-2" name="basis"><option value="delivery">From delivery</option><option value="order">From order date</option></select>
          <button className="btn col-span-3">Save override</button>
        </form>
      </div>
    </div>
  );
}
