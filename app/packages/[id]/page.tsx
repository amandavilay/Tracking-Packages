import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { HomeTag, dateTime, shortDate } from "@/components/ui";
import CopyDraft from "@/components/CopyDraft";
import { missingPackageDraft } from "@/lib/drafts";
import { gmailLink } from "@/lib/gmail";
import { carrierTrackUrl } from "@/lib/carriers";
import { updatePackage, deletePackage, setClaim } from "@/app/actions";
import type { TrackEvent } from "@/lib/tracking";

export default async function PackageDetail({ params }: { params: Promise<{ id: string }> }) {
  const p = await db.package.findUnique({ where: { id: Number((await params).id) }, include: { order: true } });
  if (!p) notFound();
  const events: TrackEvent[] = JSON.parse(p.events || "[]");
  const deliveredEvent = events.find((e) => /deliver/i.test(e.description));
  const draft = missingPackageDraft({
    ...p, orderNumber: p.order?.orderNumber, lastLocation: deliveredEvent?.location ?? p.lastLocation,
    deliveredAt: p.deliveredAt ?? (deliveredEvent ? new Date(deliveredEvent.time) : null),
  });

  return (
    <div>
      <Link href="/packages" className="text-sm text-stone-500">‹ Packages</Link>
      <div className="mt-3 flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-stone-500">{p.retailer || "Unknown retailer"}</p>
          <h1 className="h1">{p.description || p.trackingNumber}</h1>
        </div>
        <HomeTag home={p.home} />
      </div>

      <div className="card mt-4 grid grid-cols-2 gap-y-2 text-sm">
        <span className="text-stone-500">Carrier</span><span className="text-right">{p.carrier}</span>
        <span className="text-stone-500">Tracking</span><a className="text-right underline" href={carrierTrackUrl(p.carrier, p.trackingNumber)} target="_blank">{p.trackingNumber}</a>
        {p.order?.orderNumber && <><span className="text-stone-500">Order</span><span className="text-right">{p.order.orderNumber}</span></>}
        <span className="text-stone-500">Est. delivery</span><span className="text-right">{shortDate(p.estDelivery)}</span>
        {p.emailId && <><span className="text-stone-500">Email</span><a className="text-right underline" href={gmailLink(p.emailId)} target="_blank">Open in Gmail</a></>}
      </div>

      {p.status === "delivered" && !p.isReturn && (
        <div className="card mt-4 space-y-3">
          <p className="font-medium">Didn't get it?</p>
          <CopyDraft label="Draft missing package claim" subject={draft.subject} body={draft.body} />
          <form action={setClaim} className="flex flex-wrap gap-2">
            <input type="hidden" name="id" value={p.id} />
            {[["drafted", "Claim drafted"], ["sent", "Claim sent"], ["resolved", "Resolved"], ["", "No claim"]].map(([v, l]) => (
              <button key={v} name="status" value={v} className={`chip px-3 py-1.5 text-sm ${(p.claimStatus || "") === v ? "bg-stone-900 text-white" : "border border-stone-200"}`}>{l}</button>
            ))}
          </form>
        </div>
      )}

      <h2 className="h2">Scan history</h2>
      <ol className="card space-y-4">
        {!events.length && <li className="text-sm text-stone-400">No scans yet. Tap Refresh on the Packages tab.</li>}
        {events.map((e, i) => (
          <li key={i} className="relative pl-5">
            <span className={`absolute left-0 top-1.5 h-2.5 w-2.5 rounded-full ${i === 0 ? "bg-stone-900" : "bg-stone-300"}`} />
            <p className="text-sm font-medium">{e.description}</p>
            <p className="text-xs text-stone-500">{dateTime(new Date(e.time))}{e.location ? ` · ${e.location}` : ""}</p>
          </li>
        ))}
      </ol>

      <h2 className="h2">Edit</h2>
      <form action={updatePackage} className="card space-y-2">
        <input type="hidden" name="id" value={p.id} />
        <input className="input" name="description" defaultValue={p.description || ""} placeholder="Name" />
        <input className="input" name="retailer" defaultValue={p.retailer || ""} placeholder="Retailer" />
        <select className="input" name="home" defaultValue={p.home || ""}><option value="">No home</option><option value="palm_coast">Palm Coast</option><option value="boynton_beach">Boynton Beach</option></select>
        <button className="btn">Save</button>
      </form>
      <form action={deletePackage} className="mt-4 text-center">
        <input type="hidden" name="id" value={p.id} />
        <button className="text-sm text-red-600">Delete package</button>
      </form>
    </div>
  );
}
