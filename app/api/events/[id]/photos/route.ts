import { NextResponse } from "next/server";
import { MAX_FILE_BYTES, resolveImageMime, storage } from "@/lib/storage";
import type { Photo } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/events/:id/photos — all photos, newest first. */
export async function GET(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  if (!(await storage.getEvent(id))) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }
  const photos = await storage.listPhotos(id);
  return NextResponse.json({ photos }, { headers: { "Cache-Control": "no-store" } });
}

/**
 * POST /api/events/:id/photos — multipart upload, field name "files" (repeatable).
 * No login required: possession of the event link is the permission.
 */
export async function POST(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  if (!(await storage.getEvent(id))) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }

  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > MAX_FILE_BYTES * 4) {
    return NextResponse.json({ error: "Upload is too large" }, { status: 413 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid upload" }, { status: 400 });
  }

  const files = form.getAll("files").filter((f): f is File => typeof f !== "string");
  if (files.length === 0) {
    return NextResponse.json({ error: "No files received" }, { status: 400 });
  }

  const photos: Photo[] = [];
  const errors: { name: string; error: string }[] = [];

  for (const file of files) {
    const mime = resolveImageMime(file.type, file.name);
    if (!mime) {
      errors.push({ name: file.name, error: "Only image files can be uploaded" });
      continue;
    }
    if (file.size > MAX_FILE_BYTES) {
      errors.push({ name: file.name, error: "Larger than 30 MB" });
      continue;
    }
    try {
      photos.push(await storage.addPhoto(id, { name: file.name, mime, buffer: Buffer.from(await file.arrayBuffer()) }));
    } catch (e) {
      errors.push({ name: file.name, error: e instanceof Error ? e.message : "Upload failed" });
    }
  }

  return NextResponse.json({ photos, errors }, { status: photos.length ? 201 : 400 });
}
