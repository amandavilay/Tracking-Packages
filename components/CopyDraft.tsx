"use client";
import { useState } from "react";

export default function CopyDraft({ subject, body, label = "Draft email" }: { subject: string; body: string; label?: string }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(`Subject: ${subject}\n\n${body}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div>
      <button type="button" className="btn-ghost" onClick={() => setOpen(!open)}>{open ? "Hide draft" : label}</button>
      {open && (
        <div className="mt-3 rounded-xl bg-stone-50 p-3 text-sm">
          <p className="font-medium">Subject: {subject}</p>
          <pre className="mt-2 whitespace-pre-wrap font-sans text-stone-700">{body}</pre>
          <div className="mt-3 flex gap-2">
            <button type="button" className="btn" onClick={copy}>{copied ? "Copied" : "Copy"}</button>
            <a className="btn-ghost" href={`mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`}>Open in Mail</a>
          </div>
          <p className="mt-2 text-xs text-stone-500">Nothing is sent automatically. Copy it and send it yourself.</p>
        </div>
      )}
    </div>
  );
}
