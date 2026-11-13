"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { href: "/packages", label: "Packages", icon: "M3 7.5 12 3l9 4.5v9L12 21l-9-4.5zM3 7.5l9 4.5 9-4.5M12 12v9" },
  { href: "/prices", label: "Price Drops", icon: "M3 17l6-6 4 4 8-8M15 7h6v6" },
  { href: "/returns", label: "Returns", icon: "M9 14 4 9l5-5M4 9h11a5 5 0 0 1 0 10h-3" },
  { href: "/spending", label: "Spending", icon: "M4 20V10M10 20V4M16 20v-7M22 20H2" },
];

export default function TabBar({ drops }: { drops: number }) {
  const path = usePathname();
  if (path.startsWith("/login")) return null;
  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-stone-200 bg-white/90 backdrop-blur pb-[env(safe-area-inset-bottom)]">
      <div className="mx-auto flex max-w-xl">
        {tabs.map((t) => {
          const on = path.startsWith(t.href);
          return (
            <Link key={t.href} href={t.href} className={`relative flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] ${on ? "text-stone-900" : "text-stone-400"}`}>
              <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={on ? 2 : 1.6} strokeLinecap="round" strokeLinejoin="round"><path d={t.icon} /></svg>
              {t.label}
              {t.href === "/prices" && drops > 0 && (
                <span className="absolute right-[calc(50%-22px)] top-1.5 min-w-[18px] rounded-full bg-emerald-600 px-1 text-center text-[10px] font-semibold leading-[18px] text-white">{drops}</span>
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
