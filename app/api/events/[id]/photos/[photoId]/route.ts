import { Readable } from "node:stream";
import { NextResponse } from "next/server";
import { storage } from "@/lib/storage";
import { contentDisposition } from "@/lib/utils";
import type { PhotoVariant } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/events/:id/photos/:photoId?size=thumb|view|original&download=1
 *  - thumb:    480px grid thumbnail
 *  - view:     ≤2200px preview used by the lightbox
 *  - original: untouched full-resolution upload (default)
 *  - download=1 forces a "Save as" with the original file name
 */
export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string; photoId: string }> },
) {
  const { id, photoId } = await ctx.params;
  const photo = await storage.getPhoto(id, photoId);
  if (!photo) return NextResponse.json({ error: "Photo not found" }, { status: 404 });

  const url = new URL(req.url);
  const requested = url.searchParams.get("size");
  const variant: PhotoVariant = requested === "thumb" || requested === "view" ? requested : "original";
  const download = url.searchParams.get("download") === "1";

  let file;
  try {
    file = await storage.openPhoto(id, photo, variant);
  } catch {
    return NextResponse.json({ error: "File missing" }, { status: 404 });
  }

  const headers: Record<string, string> = {
    "Content-Type": file.mime,
    "Content-Length": String(file.size),
    // Photo ids are unique and files never change, so cache aggressively.
    "Cache-Control": "public, max-age=31536000, immutable",
  };
  if (download) {
    // Downloads always deliver the original, never a resized preview.
    headers["Content-Disposition"] = contentDisposition(photo.filename);
  }

  return new Response(Readable.toWeb(file.stream) as ReadableStream, { headers });
}
