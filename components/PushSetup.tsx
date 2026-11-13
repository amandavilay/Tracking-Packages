"use client";
import { useEffect, useState } from "react";

const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "";
function b64(s: string) {
  const pad = "=".repeat((4 - (s.length % 4)) % 4);
  const raw = atob((s + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export function RegisterSW() {
  useEffect(() => { if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js"); }, []);
  return null;
}

export default function PushSetup() {
  const [state, setState] = useState("checking");
  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return setState("unsupported");
    navigator.serviceWorker.ready.then(async (r) => setState((await r.pushManager.getSubscription()) ? "on" : Notification.permission === "denied" ? "denied" : "off"));
  }, []);
  const enable = async () => {
    const perm = await Notification.requestPermission();
    if (perm !== "granted") return setState("denied");
    const r = await navigator.serviceWorker.ready;
    const sub = await r.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64(key) });
    await fetch("/api/push", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(sub) });
    setState("on");
  };
  const test = () => fetch("/api/push", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ test: true }) });
  if (state === "unsupported")
    return <p className="text-sm text-stone-500">On iPhone, first add this app to your Home Screen (Share, then Add to Home Screen), then open it from there to turn on notifications.</p>;
  if (state === "denied") return <p className="text-sm text-stone-500">Notifications are blocked. Turn them on in iPhone Settings, Notifications.</p>;
  return state === "on" ? (
    <div className="flex items-center gap-3"><span className="text-sm text-emerald-700">Notifications are on for this device</span><button type="button" className="btn-ghost" onClick={test}>Send test</button></div>
  ) : (
    <button type="button" className="btn" onClick={enable} disabled={state === "checking"}>Turn on notifications</button>
  );
}
