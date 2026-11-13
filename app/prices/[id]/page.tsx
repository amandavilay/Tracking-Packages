import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { money, PriceChart, dateTime } from "@/components/ui";
import CopyDraft from "@/components/CopyDraft";
import { priceAdjustmentDraft } from "@/lib/drafts";
import { setAdjust, removeItemFromPrices } from "@/app/actions";

export default async function ItemDetail({ params }: { params: Promise<{ id: string }> }) {
  const i = await db.item.findUnique({ where: { id: Number((await params).id) }, include: { order: true, prices: { orderBy: { checkedAt: "asc" } } } });
  if (!i) notFound();
  const d = i.pricePaid != null && i.currentPrice != null ? i.pricePaid - i.currentPrice : 0;
  const draft = priceAdjustmentDraft({ ...i, orderNumber: i.order?.orderNumber });
  return (
    <div>
      <Link href="/prices" className="text-sm text-stone-500">‹ Price Drops</Link>
      <div className="mt-3 flex gap-4">
        {i.imageUrl && <img src={i.imageUrl} alt="" className="h-24 w-24 rounded-xl object-cover" />}
        <div>
          <p className="text-sm text-stone-500">{i.retailer}</p>
          <h1 className="text-xl font-semibold">{i.name}</h1>
          {i.variant && <p className="text-sm text-stone-500">{i.variant}</p>}
          {i.productUrl && <a href={i.productUrl} target="_blank" className="text-sm underline">Product page</a>}
        </div>
      </div>
      <div className="card mt-4 grid grid-cols-3 text-center">
        <div><p className="label">Paid</p><p className="mt-1 font-semibold">{money(i.pricePaid)}</p></div>
        <div><p className="label">Now</p><p className="mt-1 font-semibold">{i.priceStatus === "blocked" ? "N/A" : money(i.currentPrice)}</p></div>
        <div><p className="label">Diff</p><p className={`mt-1 font-semibold ${d > 0 ? "text-emerald-700" : ""}`}>{d > 0 ? `-${money(d)}` : money(0)}</p></div>
      </div>
      {i.priceStatus === "blocked" && <p className="mt-2 text-sm text-stone-500">This site blocks automatic price checks.</p>}
      <p className="mt-2 text-xs text-stone-400">Last checked {dateTime(i.priceLastChecked)}</p>

      <h2 className="h2">Price history</h2>
      <div className="card"><PriceChart points={i.prices} paid={i.pricePaid} /></div>

      {d > 0 && (
        <div className="card mt-4 space-y-3">
          <CopyDraft label="Draft price adjustment email" subject={draft.subject} body={draft.body} />
          <form action={setAdjust} className="flex flex-wrap gap-2">
            <input type="hidden" name="id" value={i.id} />
            {[["requested", "Adjustment requested"], ["refunded", "Refund received"], ["", "Clear"]].map(([v, l]) => (
              <button key={v} name="status" value={v} className={`chip px-3 py-1.5 text-sm ${(i.adjustStatus || "") === v ? "bg-stone-900 text-white" : "border border-stone-200"}`}>{l}</button>
            ))}
          </form>
        </div>
      )}
      <form action={removeItemFromPrices} className="mt-6 text-center">
        <input type="hidden" name="id" value={i.id} />
        <button className="text-sm text-stone-500">Stop tracking this item</button>
      </form>
    </div>
  );
}
