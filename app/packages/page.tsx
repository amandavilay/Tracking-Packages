import Link from "next/link";
import { db } from "@/lib/db";
import { Header, HomeTag, Empty, dateTime, shortDate } from "@/components/ui";
import { addPackage, refreshAll } from "@/app/actions";

const SECTIONS = [
  { key: "exception", title: "Exception / Delayed" },
  { key: "out_for_delivery", title: "Out for Delivery" },
  { key: "in_transit", title: "In Transit" },
  { key: "pending", title: "Waiting for Carrier" },
  { key: "delivered", title: "Delivered" },
];
const STATUS: Record<string, string> = { exception: "Exception", out_for_delivery: "Out for delivery", in_transit: "In transit", pending: "Label created", delivered: "Delivered" };

type Search = { home?: string; view?: string; q?: string };

export default async function Packages({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const archived = sp.view === "archived";
  const q = sp.q?.trim();
  const pkgs = await db.package.findMany({
    where: {
      archived,
      isReturn: false,
      ...(sp.home ? { home: sp.home } : {}),
      ...(q ? { OR: [{ description: { contains: q } }, { retailer: { contains: q } }, { trackingNumber: { contains: q.toUpperCase() } }] } : {}),
    },
    orderBy: [{ lastUpdate: "desc" }, { createdAt: "desc" }],
    take: archived ? 200 : undefined,
  });
  const reviewCount = await db.reviewItem.count({ where: { resolved: false } });
  const link = (o: Partial<Search>) => {
    const p = new URLSearchParams({ ...(sp.home ? { home: sp.home } : {}), ...(archived ? { view: "archived" } : {}), ...o } as Record<string, string>);
    for (const [k, v] of [...p]) if (!v) p.delete(k);
    return `/packages${p.size ? "?" + p : ""}`;
  };

  return (
    <div>
      <Header title={archived ? "Archived" : "Packages"} right={!archived && (
        <form action={refreshAll}><button className="btn-ghost" aria-label="Refresh">Refresh</button></form>
      )} />

      <div className="mb-4 flex gap-2">
        {[["", "All"], ["palm_coast", "Palm Coast"], ["boynton_beach", "Boynton Beach"]].map(([v, l]) => (
          <Link key={v} href={link({ home: v })} className={`chip px-3 py-1.5 text-sm ${(sp.home || "") === v ? "bg-stone-900 text-white" : "bg-white border border-stone-200 text-stone-600"}`}>{l}</Link>
        ))}
      </div>

      {reviewCount > 0 && !archived && (
        <Link href="/review" className="card mb-4 block border-amber-200 bg-amber-50 text-sm text-amber-900">
          {reviewCount} email{reviewCount > 1 ? "s need" : " needs"} review. Tap to fill in missing details.
        </Link>
      )}

      {archived && (
        <form className="mb-4"><input type="hidden" name="view" value="archived" /><input className="input" name="q" defaultValue={q} placeholder="Search archived packages" /></form>
      )}

      {!pkgs.length && <Empty>{archived ? "No archived packages." : "No packages yet. Connect Gmail in Settings or add a tracking number below."}</Empty>}

      {(archived ? [{ key: "*", title: "" }] : SECTIONS).map((s) => {
        const list = archived ? pkgs : pkgs.filter((p) => p.status === s.key);
        if (!list.length) return null;
        return (
          <section key={s.key}>
            {s.title && <h2 className={`h2 ${s.key === "exception" ? "text-red-600" : ""}`}>{s.title}</h2>}
            <div className="space-y-3">
              {list.map((p) => (
                <Link key={p.id} href={`/packages/${p.id}`} className={`card block ${p.status === "exception" ? "border-red-300 bg-red-50" : ""}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs text-stone-500">{p.retailer || "Unknown retailer"}</p>
                      <p className="truncate font-medium">{p.description || p.trackingNumber}</p>
                    </div>
                    <HomeTag home={p.home} />
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                    <span className={p.status === "exception" ? "font-medium text-red-700" : p.status === "delivered" ? "text-emerald-700" : ""}>{STATUS[p.status]}</span>
                    <span className="text-right text-stone-500">{p.carrier}</span>
                    <span className="truncate text-stone-500">{p.lastLocation || "No scans yet"}</span>
                    <span className="text-right text-stone-500">{dateTime(p.lastUpdate)}</span>
                    {p.status !== "delivered" && p.estDelivery && <span className="col-span-2 text-stone-600">Est. delivery {shortDate(p.estDelivery)}</span>}
                    {p.claimStatus && <span className="col-span-2 text-amber-700">Claim {p.claimStatus}</span>}
                  </div>
                </Link>
              ))}
            </div>
          </section>
        );
      })}

      {!archived && (
        <details className="card mt-6">
          <summary className="cursor-pointer text-sm font-medium">Add a tracking number</summary>
          <form action={addPackage} className="mt-3 space-y-2">
            <input className="input" name="tracking" placeholder="Tracking number" required />
            <input className="input" name="description" placeholder="What is it? (optional)" />
            <input className="input" name="retailer" placeholder="Retailer (optional)" />
            <select className="input" name="home" defaultValue=""><option value="">Home (optional)</option><option value="palm_coast">Palm Coast</option><option value="boynton_beach">Boynton Beach</option></select>
            <button className="btn">Add</button>
          </form>
        </details>
      )}
      <div className="mt-6 text-center">
        <Link href={archived ? "/packages" : "/packages?view=archived"} className="text-sm text-stone-500 underline">{archived ? "Back to active" : "View archived"}</Link>
      </div>
    </div>
  );
}
