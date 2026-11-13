import { db } from "@/lib/db";
import { Header, Empty, money, shortDate } from "@/components/ui";
import CopyDraft from "@/components/CopyDraft";
import { openWindows, isOverdue } from "@/lib/returns";
import { refundFollowUpDraft } from "@/lib/drafts";
import { setReturnDecision, updateReturn } from "@/app/actions";

const STATUS: Record<string, string> = { pending: "Label created", in_transit: "In transit", out_for_delivery: "Out for delivery", delivered: "Delivered to retailer", exception: "Exception" };
const color = (left: number) => (left > 7 ? "bg-emerald-50 text-emerald-800" : left >= 4 ? "bg-amber-50 text-amber-800" : "bg-red-50 text-red-700");

export default async function Returns({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const tab = (await searchParams).tab === "active" ? "active" : "windows";
  const windows = tab === "windows" ? await openWindows() : [];
  const returns = await db.returnRequest.findMany({ orderBy: { createdAt: "desc" } });
  const active = returns.filter((r) => r.itemName !== "Refund" || r.refundStatus === "pending");
  const pending = returns.filter((r) => r.refundStatus === "pending").reduce((a, r) => a + (r.refundExpected ?? 0), 0);
  const received = returns.filter((r) => r.refundStatus === "received").reduce((a, r) => a + (r.refundAmount ?? 0), 0);

  return (
    <div>
      <Header title="Returns" />
      <div className="mb-4 grid grid-cols-2 rounded-full bg-stone-200/60 p-1 text-sm">
        <a href="/returns" className={`rounded-full py-1.5 text-center ${tab === "windows" ? "bg-white font-medium shadow-sm" : "text-stone-500"}`}>Return Windows</a>
        <a href="/returns?tab=active" className={`rounded-full py-1.5 text-center ${tab === "active" ? "bg-white font-medium shadow-sm" : "text-stone-500"}`}>Active Returns</a>
      </div>

      {tab === "windows" && (
        <div className="space-y-3">
          {!windows.length && <Empty>Delivered items with open return windows show up here.</Empty>}
          {windows.map(({ item, left, close, policy }) => (
            <div key={item.id} className="card">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs text-stone-500">{item.retailer}</p>
                  <p className="truncate font-medium">{item.name}</p>
                  <p className="text-xs text-stone-500">Closes {shortDate(close)} · {policy.days} days from {policy.basis}{policy.source === "default" ? " (estimated)" : ""}</p>
                </div>
                <span className={`chip whitespace-nowrap px-2.5 py-1 text-sm ${color(left)}`}>{left} day{left === 1 ? "" : "s"}</span>
              </div>
              <form action={setReturnDecision} className="mt-3 flex gap-2">
                <input type="hidden" name="id" value={item.id} />
                <button name="decision" value="keeping" className="btn-ghost">Keeping</button>
                <button name="decision" value="returning" className="btn-ghost">Returning</button>
              </form>
            </div>
          ))}
        </div>
      )}

      {tab === "active" && (
        <>
          <div className="card mb-4 grid grid-cols-2 text-center">
            <div><p className="label">Refunds pending</p><p className="mt-1 text-lg font-semibold">{money(pending)}</p></div>
            <div><p className="label">Refunds received</p><p className="mt-1 text-lg font-semibold text-emerald-700">{money(received)}</p></div>
          </div>
          {!active.length && <Empty>Returns are picked up from return label emails, or when you tap Returning.</Empty>}
          <div className="space-y-3">
            {active.map((r) => {
              const overdue = isOverdue(r);
              const draft = refundFollowUpDraft(r);
              return (
                <div key={r.id} className={`card ${overdue ? "border-red-300 bg-red-50" : ""}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs text-stone-500">{r.retailer}{r.orderNumber ? ` · ${r.orderNumber}` : ""}</p>
                      <p className="truncate font-medium">{r.itemName}</p>
                    </div>
                    <span className={`chip whitespace-nowrap ${r.refundStatus === "received" ? "bg-emerald-50 text-emerald-800" : overdue ? "bg-red-100 text-red-700" : "bg-stone-100 text-stone-600"}`}>
                      {r.refundStatus === "received" ? `Refunded ${money(r.refundAmount)}` : overdue ? "Refund overdue" : "Refund pending"}
                    </span>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-y-1 text-sm">
                    <span className="text-stone-500">Expected refund</span><span className="text-right">{money(r.refundExpected)}</span>
                    <span className="text-stone-500">Return tracking</span><span className="text-right">{r.trackingNumber ? STATUS[r.trackingStatus || "pending"] : "No label yet"}</span>
                    <span className="text-stone-500">Dropped off</span><span className="text-right">{shortDate(r.droppedOffAt)}</span>
                    {r.deliveredToRetailerAt && <><span className="text-stone-500">Received by retailer</span><span className="text-right">{shortDate(r.deliveredToRetailerAt)}</span></>}
                  </div>
                  {overdue && <div className="mt-3"><CopyDraft label="Draft refund follow up" subject={draft.subject} body={draft.body} /></div>}
                  <details className="mt-3">
                    <summary className="cursor-pointer text-sm text-stone-500">Edit</summary>
                    <form action={updateReturn} className="mt-2 space-y-2">
                      <input type="hidden" name="id" value={r.id} />
                      <input className="input" name="refundExpected" defaultValue={r.refundExpected ?? ""} placeholder="Expected refund" inputMode="decimal" />
                      <input className="input" name="tracking" defaultValue={r.trackingNumber ?? ""} placeholder="Return tracking number" />
                      <select className="input" name="refundStatus" defaultValue={r.refundStatus}><option value="pending">Refund pending</option><option value="received">Refund received</option></select>
                      <button className="btn">Save</button>
                    </form>
                  </details>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
