import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import QRCode from "qrcode";
import ShareActions from "@/components/ShareActions";
import { storage } from "@/lib/storage";
import { formatEventDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function SharePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const event = await storage.getEvent(id);
  if (!event) notFound();

  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "http";
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const base = (process.env.NEXT_PUBLIC_BASE_URL || `${proto}://${host}`).replace(/\/$/, "");
  const url = `${base}/e/${event.id}`;

  const qr = await QRCode.toDataURL(url, { width: 720, margin: 2, errorCorrectionLevel: "M" });
  const isLocal = /^(localhost|127\.|0\.0\.0\.0)/.test(new URL(url).host);

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col items-center px-5 py-10 text-center">
      <p className="mb-2 text-sm font-semibold uppercase tracking-widest text-rose-600 print:hidden">
        Your event is ready
      </p>
      <h1 className="font-display text-3xl md:text-4xl">{event.name}</h1>
      {event.date && <p className="mt-1 text-stone-500">{formatEventDate(event.date)}</p>}

      <div className="mt-8 rounded-3xl border border-stone-200 bg-white p-5 shadow-sm print:border-0 print:shadow-none">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={qr} alt={`QR code linking to ${url}`} className="h-64 w-64 sm:h-80 sm:w-80" />
        <p className="mt-2 font-display text-lg">Scan to share your photos</p>
      </div>

      <p className="mt-5 max-w-full break-all rounded-lg bg-stone-100 px-3 py-2 font-mono text-sm text-stone-700 print:bg-transparent">
        {url}
      </p>

      <div className="mt-5">
        <ShareActions url={url} qr={qr} title={event.name} />
      </div>

      {isLocal && (
        <p className="mt-6 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800 print:hidden">
          This link uses <code>localhost</code>, which phones can&rsquo;t reach. Set{" "}
          <code>NEXT_PUBLIC_BASE_URL</code> to your computer&rsquo;s network address (e.g.{" "}
          <code>http://192.168.1.20:3000</code>) or your deployed domain, then reload this page.
        </p>
      )}

      <Link
        href={`/e/${event.id}`}
        className="mt-8 rounded-xl bg-stone-900 px-6 py-3 font-medium text-white transition hover:bg-stone-700 print:hidden"
      >
        Open the gallery &rarr;
      </Link>
      <Link href="/" className="mt-4 text-sm text-stone-500 hover:underline print:hidden">
        Create another event
      </Link>
    </main>
  );
}
