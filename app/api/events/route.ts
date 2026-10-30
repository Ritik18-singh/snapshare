import { NextResponse } from "next/server";
import { storage } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/events — create an event. */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

  const name = str(body?.name, 80);
  if (!name) {
    return NextResponse.json({ error: "Event name is required" }, { status: 400 });
  }

  const date = str(body?.date, 10); // YYYY-MM-DD from <input type="date">
  const event = await storage.createEvent({
    name,
    description: str(body?.description, 300) || undefined,
    date: /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : undefined,
  });
  return NextResponse.json(event, { status: 201 });
}
