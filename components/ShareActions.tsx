"use client";

import { useEffect, useState } from "react";

export default function ShareActions({ url, qr, title }: { url: string; qr: string; title: string }) {
  const [copied, setCopied] = useState(false);
  const [canShare, setCanShare] = useState(false);

  useEffect(() => setCanShare(typeof navigator !== "undefined" && "share" in navigator), []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // Clipboard API needs https; fall back for plain-http LAN testing.
      const el = document.createElement("textarea");
      el.value = url;
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      el.remove();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const btn =
    "rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-medium transition hover:bg-stone-100";

  return (
    <div className="flex flex-wrap justify-center gap-2 print:hidden">
      <button onClick={copy} className={btn + " !border-rose-600 !bg-rose-600 !text-white hover:!bg-rose-700"}>
        {copied ? "Copied!" : "Copy link"}
      </button>
      {canShare && (
        <button onClick={() => navigator.share({ title, url }).catch(() => {})} className={btn}>
          Share…
        </button>
      )}
      <a href={qr} download={`${title.replace(/\W+/g, "-")}-qr.png`} className={btn}>
        Download QR
      </a>
      <button onClick={() => window.print()} className={btn}>
        Print
      </button>
    </div>
  );
}
