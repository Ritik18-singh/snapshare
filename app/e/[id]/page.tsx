import Link from "next/link";
import { notFound } from "next/navigation";
import EventClient from "@/components/EventClient";
import { storage } from "@/lib/storage";
import { formatEventDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const event = await storage.getEvent(id);
  return { title: event ? `${event.name} — SnapShare` : "Event not found" };
}

export default async function EventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const event = await storage.getEvent(id);
  if (!event) notFound();

  return (
    <main className="mx-auto max-w-6xl px-4 pb-24 pt-8 sm:px-6">
      <header className="mb-8 text-center">
        <h1 className="font-display text-3xl sm:text-5xl">{event.name}</h1>
        {event.date && <p className="mt-2 text-stone-500">{formatEventDate(event.date)}</p>}
        {event.description && <p className="mx-auto mt-3 max-w-xl text-stone-600">{event.description}</p>}
      </header>

      <EventClient eventId={event.id} />

      <footer className="mt-16 text-center text-sm text-stone-400">
        <Link href={`/e/${event.id}/share`} className="hover:text-stone-600 hover:underline">
          Share this event
        </Link>
        {" · "}
        <Link href="/" className="hover:text-stone-600 hover:underline">
          Powered by SnapShare
        </Link>
      </footer>
    </main>
  );
}
