import Link from "next/link";
import { Header, Bars, money } from "@/components/ui";
import { spending } from "@/lib/summary";

const RANGES = [["this", "This month"], ["last", "Last month"], ["six", "Last 6 months"]] as const;

export default async function Spending({ searchParams }: { searchParams: Promise<{ r?: string }> }) {
  const r = ((await searchParams).r as "this" | "last" | "six") || "this";
  const s = await spending(RANGES.some(([k]) => k === r) ? r : "this");
  return (
    <div>
      <Header title="Spending" />
      <div className="mb-4 grid grid-cols-3 rounded-full bg-stone-200/60 p-1 text-sm">
        {RANGES.map(([k, l]) => (
          <Link key={k} href={`/spending?r=${k}`} className={`rounded-full py-1.5 text-center ${r === k ? "bg-white font-medium shadow-sm" : "text-stone-500"}`}>{l}</Link>
        ))}
      </div>
      <div className="card text-center">
        <p className="label">Net spend</p>
        <p className="mt-1 text-3xl font-semibold tabular-nums">{money(s.net)}</p>
        <p className="mt-1 text-sm text-stone-500">{money(s.spent)} ordered, {money(s.refunded)} refunded</p>
      </div>
      {r === "six" && (
        <>
          <h2 className="h2">By month</h2>
          <div className="card"><Bars rows={s.months} /></div>
        </>
      )}
      <h2 className="h2">By retailer</h2>
      <div className="card">{s.retailers.length ? <Bars rows={s.retailers} /> : <p className="text-sm text-stone-400">No orders in this period.</p>}</div>
      <h2 className="h2">All time</h2>
      <div className="card grid grid-cols-2 text-center">
        <div><p className="label">Saved from price adjustments</p><p className="mt-1 text-lg font-semibold text-emerald-700">{money(s.savedAll)}</p></div>
        <div><p className="label">Refunded from returns</p><p className="mt-1 text-lg font-semibold">{money(s.refundedAll)}</p></div>
      </div>
    </div>
  );
}
