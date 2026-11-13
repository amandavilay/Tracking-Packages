import Link from "next/link";
import { db } from "@/lib/db";
import { Empty, shortDate } from "@/components/ui";
import { gmailLink } from "@/lib/gmail";
import { resolveReview, dismissReview } from "@/app/actions";

export default async function Review() {
  const items = await db.reviewItem.findMany({ where: { resolved: false }, orderBy: { createdAt: "desc" } });
  return (
    <div>
      <Link href="/packages" className="text-sm text-stone-500">‹ Packages</Link>
      <h1 className="h1 mt-2">Needs Review</h1>
      <p className="mt-1 text-sm text-stone-500">These emails look relevant but are missing key details.</p>
      {!items.length && <Empty>All caught up.</Empty>}
      <div className="mt-4 space-y-3">
        {items.map((r) => {
          const d = JSON.parse(r.data || "{}");
          return (
            <div key={r.id} className="card text-sm">
              <p className="text-xs text-stone-500">{r.sender.replace(/<.*>/, "")} · {shortDate(r.createdAt)} · {r.kind.replace("_", " ")}</p>
              <p className="font-medium">{r.subject}</p>
              <p className="mt-1 text-amber-700">Missing: {r.missing}</p>
              <a href={gmailLink(r.emailId)} target="_blank" className="mt-1 inline-block underline">Open email</a>
              <form action={resolveReview} className="mt-3 space-y-2">
                <input type="hidden" name="id" value={r.id} />
                <input className="input" name="retailer" defaultValue={d.retailer || ""} placeholder="Retailer" />
                <input className="input" name="orderNumber" defaultValue={d.orderNumber || ""} placeholder="Order number" />
                <input className="input" name="tracking" defaultValue={d.tracking?.[0]?.number || ""} placeholder="Tracking number" />
                <input className="input" name="itemName" defaultValue={d.items?.[0]?.name || ""} placeholder="Item name" />
                <div className="grid grid-cols-2 gap-2">
                  <input className="input" name="price" inputMode="decimal" defaultValue={d.items?.[0]?.price ?? ""} placeholder="Item price" />
                  <input className="input" name={r.kind === "refund" ? "amount" : "total"} inputMode="decimal" defaultValue={(r.kind === "refund" ? d.refundAmount : d.total) ?? ""} placeholder={r.kind === "refund" ? "Refund amount" : "Order total"} />
                </div>
                <input className="input" name="url" defaultValue={d.items?.[0]?.url || ""} placeholder="Product URL (for price tracking)" />
                <div className="flex gap-2"><button className="btn">Save</button></div>
              </form>
              <form action={dismissReview} className="mt-2"><input type="hidden" name="id" value={r.id} /><button className="text-stone-400">Not relevant, dismiss</button></form>
            </div>
          );
        })}
      </div>
    </div>
  );
}
