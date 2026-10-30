import { Readable } from "node:stream";
import archiver from "archiver";
import { NextResponse } from "next/server";
import { storage } from "@/lib/storage";
import { contentDisposition } from "@/lib/utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/**
 * ZIP download of originals, streamed so memory stays flat for big events.
 *  GET  /api/events/:id/zip              → every photo
 *  GET  /api/events/:id/zip?ids=a,b,c    → just those photos
 *  POST /api/events/:id/zip (form field "ids" = "a,b,c") → same, with no URL length limit
 */
async function handle(req: Request, ctx: Ctx, idsParam: string | null) {
  const { id } = await ctx.params;
  const event = await storage.getEvent(id);
  if (!event) return NextResponse.json({ error: "Event not found" }, { status: 404 });

  let photos = await storage.listPhotos(id);
  if (idsParam) {
    const wanted = new Set(idsParam.split(",").map((s) => s.trim()).filter(Boolean));
    photos = photos.filter((p) => wanted.has(p.id));
  }
  if (photos.length === 0) {
    return NextResponse.json({ error: "No photos to download" }, { status: 404 });
  }

  // Photos are already compressed, so store them without re-deflating.
  const archive = archiver("zip", { store: true });
  req.signal.addEventListener("abort", () => archive.abort());

  // Append one file at a time so we never hold hundreds of file handles open.
  (async () => {
    const used = new Set<string>();
    for (const photo of photos) {
      const { stream } = await storage.openPhoto(id, photo, "original");
      let name = photo.filename;
      for (let n = 2; used.has(name.toLowerCase()); n++) {
        name = photo.filename.replace(/(\.[^.]+)?$/, ` (${n})$1`);
      }
      used.add(name.toLowerCase());
      const entryDone = new Promise<void>((resolve) => archive.once("entry", () => resolve()));
      archive.append(stream, { name });
      await entryDone;
    }
    await archive.finalize();
  })().catch((err) => archive.destroy(err));

  const slug = event.name.replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-").slice(0, 40) || "event";
  return new Response(Readable.toWeb(archive) as ReadableStream, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": contentDisposition(`${slug}-photos.zip`),
      "Cache-Control": "no-store",
    },
  });
}

export async function GET(req: Request, ctx: Ctx) {
  return handle(req, ctx, new URL(req.url).searchParams.get("ids"));
}

export async function POST(req: Request, ctx: Ctx) {
  const form = await req.formData().catch(() => null);
  const ids = form?.get("ids");
  return handle(req, ctx, typeof ids === "string" ? ids : null);
}
