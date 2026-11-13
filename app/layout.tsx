import "./globals.css";
import type { Metadata, Viewport } from "next";
import TabBar from "@/components/TabBar";
import { RegisterSW } from "@/components/PushSetup";
import { activeDrops } from "@/lib/summary";

export const metadata: Metadata = {
  title: "Shopping Tracker",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Shopping", statusBarStyle: "default" },
  icons: { apple: "/apple-touch-icon.png", icon: "/icon-192.png" },
};
export const viewport: Viewport = { themeColor: "#fafaf9", width: "device-width", initialScale: 1, viewportFit: "cover" };
export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const drops = (await activeDrops().catch(() => [])).length;
  return (
    <html lang="en">
      <body>
        <RegisterSW />
        <main className="mx-auto max-w-xl px-4 pb-28 pt-[max(env(safe-area-inset-top),12px)]">{children}</main>
        <TabBar drops={drops} />
      </body>
    </html>
  );
}
