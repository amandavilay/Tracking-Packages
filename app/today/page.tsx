import Link from "next/link";
import { Header, HomeTag, money } from "@/components/ui";
import { todaySummary } from "@/lib/summary";

function Block({ title, href, children, count }: { title: string; href: string; children: React.ReactNode; count: number }) {
  return (
    <section>
      <h2 className="h2">{title}</h2>
      <Link href={href} className="card block space-y-2">{count ? children : <p className="text-sm text-stone-400">None</p>}</Link>
    </section>
  );
}

export default async function Today() {
  const s = await todaySummary();
  const date = new Date().toLocaleDateString("en-US", { timeZone: "America/New_York", weekday: "long", month: "long", day: "numeric" });
  return (
    <div>
      <Header title="Today" />
      <p className="-mt-3 mb-2 text-sm text-stone-500">{date}</p>
      <Block title="Arriving today" href="/packages" count={s.arriving.length}>
        {s.arriving.map((p) => <div key={p.id} className="flex justify-between gap-2 text-sm"><span className="truncate">{p.description || p.retailer || p.trackingNumber}</span><HomeTag home={p.home} /></div>)}
      </Block>
      <Block title="Exceptions" href="/packages" count={s.exceptions.length}>
        {s.exceptions.map((p) => <p key={p.id} className="text-sm text-red-700">{p.description || p.trackingNumber} · {p.lastLocation || p.carrier}</p>)}
      </Block>
      <Block title="Price drops" href="/prices" count={s.drops.length}>
        {s.drops.map((i) => <div key={i.id} className="flex justify-between text-sm"><span className="truncate">{i.name}</span><span className="text-emerald-700">-{money(i.pricePaid! - i.currentPrice!)}</span></div>)}
      </Block>
      <Block title="Return windows closing" href="/returns" count={s.closing.length}>
        {s.closing.map((w) => <div key={w.item.id} className="flex justify-between text-sm"><span className="truncate">{w.item.name}</span><span className="text-red-700">{w.left}d left</span></div>)}
      </Block>
      <Block title="Overdue refunds" href="/returns?tab=active" count={s.overdue.length}>
        {s.overdue.map((r) => <div key={r.id} className="flex justify-between text-sm"><span className="truncate">{r.itemName} · {r.retailer}</span><span>{money(r.refundExpected)}</span></div>)}
      </Block>
    </div>
  );
}
