import Link from "next/link";
import { HOME_LABEL } from "@/lib/home";

export const money = (n?: number | null) => (n == null ? "N/A" : n.toLocaleString("en-US", { style: "currency", currency: "USD" }));
export const shortDate = (d?: Date | null) =>
  d ? d.toLocaleDateString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric" }) : "N/A";
export const dateTime = (d?: Date | null) =>
  d ? d.toLocaleString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "N/A";

export function HomeTag({ home }: { home?: string | null }) {
  if (!home) return null;
  return <span className={`chip ${home === "palm_coast" ? "bg-sky-50 text-sky-800" : "bg-amber-50 text-amber-800"}`}>{HOME_LABEL[home]}</span>;
}

export function Header({ title, right }: { title: string; right?: React.ReactNode }) {
  return (
    <header className="mb-4 flex items-center justify-between pt-2">
      <h1 className="h1">{title}</h1>
      <div className="flex items-center gap-2">
        {right}
        <Link href="/today" aria-label="Today" className="rounded-full p-2 text-stone-500 active:bg-stone-200">
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
        </Link>
        <Link href="/settings" aria-label="Settings" className="rounded-full p-2 text-stone-500 active:bg-stone-200">
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></svg>
        </Link>
      </div>
    </header>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="py-10 text-center text-sm text-stone-400">{children}</p>;
}

export function Bars({ rows }: { rows: { name: string; total: number }[] }) {
  const max = Math.max(1, ...rows.map((r) => Math.abs(r.total)));
  return (
    <div className="space-y-3">
      {rows.map((r) => (
        <div key={r.name}>
          <div className="flex justify-between text-sm"><span>{r.name}</span><span className="tabular-nums text-stone-600">{money(r.total)}</span></div>
          <div className="mt-1 h-2 rounded-full bg-stone-100"><div className="h-2 rounded-full bg-stone-800" style={{ width: `${(Math.max(0, r.total) / max) * 100}%` }} /></div>
        </div>
      ))}
    </div>
  );
}

export function PriceChart({ points, paid }: { points: { price: number; checkedAt: Date }[]; paid?: number | null }) {
  if (points.length < 2) return <p className="text-sm text-stone-400">Price history appears after a few checks.</p>;
  const W = 320, H = 120, P = 8;
  const vals = points.map((p) => p.price).concat(paid ?? []);
  const lo = Math.min(...vals), hi = Math.max(...vals), span = hi - lo || 1;
  const x = (i: number) => P + (i / (points.length - 1)) * (W - 2 * P);
  const y = (v: number) => H - P - ((v - lo) / span) * (H - 2 * P);
  const d = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.price).toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
      {paid != null && <line x1={P} x2={W - P} y1={y(paid)} y2={y(paid)} stroke="#a8a29e" strokeDasharray="4 4" />}
      <path d={d} fill="none" stroke="#059669" strokeWidth="2.5" strokeLinejoin="round" />
      {points.map((p, i) => <circle key={i} cx={x(i)} cy={y(p.price)} r="3" fill="#059669" />)}
    </svg>
  );
}
