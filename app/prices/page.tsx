import Link from "next/link";
import { db } from "@/lib/db";
import { Header, Empty, money } from "@/components/ui";
import { addItemByUrl, checkPricesNow } from "@/app/actions";

const DAY = 86400000;

export default async function Prices() {
  const now = new Date();
  const items = await db.item.findMany({ where: { priceStatus: { not: "removed" }, trackUntil: { gte: now } } });
  const saved = (await db.item.aggregate({ _sum: { savedAmount: true } }))._sum.savedAmount ?? 0;
  const diff = (i: (typeof items)[number]) => (i.pricePaid != null && i.currentPrice != null ? i.pricePaid - i.currentPrice : -Infinity);
  const sorted = [...items].sort((a, b) => diff(b) - diff(a));

  return (
    <div>
      <Header title="Price Drops" right={<form action={checkPricesNow}><button className="btn-ghost">Check now</button></form>} />
      <div className="card mb-4 flex items-center justify-between">
        <span className="text-sm text-stone-500">Saved from price adjustments</span>
        <span className="text-lg font-semibold text-emerald-700">{money(saved)}</span>
      </div>
      {!sorted.length && <Empty>Items you buy are watched for 14 days after the order date.</Empty>}
      <div className="space-y-3">
        {sorted.map((i) => {
          const d = diff(i);
          const drop = d > 0;
          const left = Math.max(0, Math.ceil((+i.trackUntil! - +now) / DAY));
          return (
            <Link key={i.id} href={`/prices/${i.id}`} className={`card flex gap-3 ${drop ? "border-emerald-300 bg-emerald-50/60" : ""}`}>
              <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-stone-100">
                {i.imageUrl && <img src={i.imageUrl} alt="" className="h-full w-full object-cover" />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs text-stone-500">{i.retailer}</p>
                <p className="truncate font-medium">{i.name}</p>
                {i.variant && <p className="truncate text-xs text-stone-500">{i.variant}</p>}
                <div className="mt-1 flex items-baseline justify-between text-sm">
                  <span>
                    <span className="text-stone-500">Paid {money(i.pricePaid)}</span>
                    {i.priceStatus === "blocked" ? <span className="ml-2 text-stone-400">Can't check price</span> : <span className="ml-2">Now {money(i.currentPrice)}</span>}
                  </span>
                  <span className="text-xs text-stone-400">{left}d left</span>
                </div>
                {drop && (
                  <p className="mt-1 text-sm font-semibold text-emerald-700">
                    Down {money(d)} ({((d / i.pricePaid!) * 100).toFixed(0)}%)
                    {i.adjustStatus && <span className="ml-2 font-normal text-stone-600">{i.adjustStatus === "requested" ? "Adjustment requested" : "Refund received"}</span>}
                  </p>
                )}
                {!i.productUrl && <p className="mt-1 text-xs text-stone-400">No product link. Add one to track.</p>}
              </div>
            </Link>
          );
        })}
      </div>
      <details className="card mt-6">
        <summary className="cursor-pointer text-sm font-medium">Add an item by link</summary>
        <form action={addItemByUrl} className="mt-3 space-y-2">
          <input className="input" name="url" type="url" placeholder="Product page URL" required />
          <input className="input" name="price" inputMode="decimal" placeholder="Price you paid" required />
          <input className="input" name="name" placeholder="Name (optional)" />
          <input className="input" name="variant" placeholder="Size / color (optional)" />
          <button className="btn">Add</button>
        </form>
      </details>
    </div>
  );
}
