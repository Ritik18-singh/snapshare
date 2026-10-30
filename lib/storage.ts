import fs from "node:fs/promises";
import { createReadStream } from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import type { Readable } from "node:stream";
import sharp from "sharp";
import type { EventMeta, Photo, PhotoVariant } from "./types";

/* -------------------------------------------------------------------------- */
/*  Limits & validation                                                       */
/* -------------------------------------------------------------------------- */

export const MAX_FILE_BYTES = 30 * 1024 * 1024; // 30 MB per photo

const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
  "image/heic": "heic",
  "image/heif": "heif",
};

const MIME_BY_EXT: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  avif: "image/avif",
  heic: "image/heic",
  heif: "image/heif",
};

/** Resolve a usable image MIME type from the browser-provided type or file name. */
export function resolveImageMime(type: string, name: string): string | null {
  const t = type.toLowerCase();
  if (EXT_BY_MIME[t]) return t;
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return MIME_BY_EXT[ext] ?? null;
}

const ID_RE = /^[A-Za-z0-9_-]{4,64}$/;
/** IDs end up in file paths, so only ever allow a strict character set. */
export const isValidId = (s: string) => ID_RE.test(s);

function sanitizeFilename(name: string, ext: string) {
  const base = path.basename(name).replace(/[\u0000-\u001f<>:"/\\|?*]/g, "_").trim().slice(0, 120);
  const cleaned = base || `photo.${ext}`;
  return /\.[A-Za-z0-9]{2,5}$/.test(cleaned) ? cleaned : `${cleaned}.${ext}`;
}

/* -------------------------------------------------------------------------- */
/*  Storage driver interface                                                  */
/*                                                                            */
/*  Everything the API routes need goes through this interface, so swapping   */
/*  local disk for S3 / Supabase Storage only means writing another class     */
/*  that implements it (see README).                                          */
/* -------------------------------------------------------------------------- */

export interface StoredFile {
  stream: Readable;
  size: number;
  mime: string;
}

export interface StorageDriver {
  createEvent(input: { name: string; description?: string; date?: string }): Promise<EventMeta>;
  getEvent(id: string): Promise<EventMeta | null>;
  addPhoto(
    eventId: string,
    file: { name: string; mime: string; buffer: Buffer },
  ): Promise<Photo>;
  listPhotos(eventId: string): Promise<Photo[]>;
  getPhoto(eventId: string, photoId: string): Promise<Photo | null>;
  openPhoto(eventId: string, photo: Photo, variant: PhotoVariant): Promise<StoredFile>;
}

/* -------------------------------------------------------------------------- */
/*  Local disk driver                                                         */
/*                                                                            */
/*  data/events/<eventId>/                                                    */
/*    event.json                                                              */
/*    originals/<photoId>.<ext>     full-resolution upload                    */
/*    views/<photoId>.jpg           ≤2200px preview for the lightbox          */
/*    thumbs/<photoId>.webp         480px grid thumbnail                      */
/*    meta/<photoId>.json           one sidecar per photo (no shared index,   */
/*                                  so concurrent uploads never race)         */
/* -------------------------------------------------------------------------- */

const ROOT = path.resolve(process.env.DATA_DIR || path.join(process.cwd(), "data"));

class LocalDriver implements StorageDriver {
  private dir(eventId: string, ...parts: string[]) {
    if (!isValidId(eventId)) throw new Error("Invalid event id");
    return path.join(ROOT, "events", eventId, ...parts);
  }

  private async readJson<T>(file: string): Promise<T | null> {
    try {
      return JSON.parse(await fs.readFile(file, "utf8")) as T;
    } catch {
      return null;
    }
  }

  async createEvent(input: { name: string; description?: string; date?: string }) {
    const id = randomBytes(7).toString("base64url"); // 10 URL-safe chars
    const event: EventMeta = {
      id,
      name: input.name,
      description: input.description || undefined,
      date: input.date || undefined,
      createdAt: new Date().toISOString(),
    };
    await Promise.all(
      ["originals", "views", "thumbs", "meta"].map((d) =>
        fs.mkdir(this.dir(id, d), { recursive: true }),
      ),
    );
    await fs.writeFile(this.dir(id, "event.json"), JSON.stringify(event, null, 2));
    return event;
  }

  async getEvent(id: string) {
    if (!isValidId(id)) return null;
    return this.readJson<EventMeta>(this.dir(id, "event.json"));
  }

  async addPhoto(eventId: string, file: { name: string; mime: string; buffer: Buffer }) {
    const id = Date.now().toString(36) + randomBytes(4).toString("hex");
    const ext = EXT_BY_MIME[file.mime] ?? "jpg";
    const originalPath = this.dir(eventId, "originals", `${id}.${ext}`);
    const isHeic = file.mime === "image/heic" || file.mime === "image/heif";

    let width: number | undefined;
    let height: number | undefined;
    let hasThumb = false;

    try {
      const base = sharp(file.buffer, { failOn: "none" });
      const meta = await base.metadata();
      const swap = (meta.orientation ?? 1) >= 5; // EXIF rotated 90°/270°
      width = swap ? meta.height : meta.width;
      height = swap ? meta.width : meta.height;

      const [thumb, view] = await Promise.all([
        base.clone().rotate().resize({ width: 480, withoutEnlargement: true }).webp({ quality: 72 }).toBuffer(),
        base
          .clone()
          .rotate()
          .resize({ width: 2200, height: 2200, fit: "inside", withoutEnlargement: true })
          .jpeg({ quality: 85 })
          .toBuffer(),
      ]);
      await Promise.all([
        fs.writeFile(this.dir(eventId, "thumbs", `${id}.webp`), thumb),
        fs.writeFile(this.dir(eventId, "views", `${id}.jpg`), view),
      ]);
      hasThumb = true;
    } catch {
      // HEIC/HEIF can't be decoded by the bundled sharp build; keep the original
      // as-is. Anything else that fails to decode isn't a real image.
      if (!isHeic) throw new Error("That file isn't a valid image");
    }

    await fs.writeFile(originalPath, file.buffer);

    const photo: Photo = {
      id,
      filename: sanitizeFilename(file.name, ext),
      mime: file.mime,
      ext,
      size: file.buffer.length,
      width,
      height,
      uploadedAt: new Date().toISOString(),
      hasThumb,
    };
    await fs.writeFile(this.dir(eventId, "meta", `${id}.json`), JSON.stringify(photo));
    return photo;
  }

  async listPhotos(eventId: string) {
    let names: string[];
    try {
      names = await fs.readdir(this.dir(eventId, "meta"));
    } catch {
      return [];
    }
    const photos = await Promise.all(
      names
        .filter((n) => n.endsWith(".json"))
        .map((n) => this.readJson<Photo>(this.dir(eventId, "meta", n))),
    );
    return photos
      .filter((p): p is Photo => p !== null)
      .sort((a, b) => (a.uploadedAt === b.uploadedAt ? (a.id < b.id ? 1 : -1) : a.uploadedAt < b.uploadedAt ? 1 : -1));
  }

  async getPhoto(eventId: string, photoId: string) {
    if (!isValidId(eventId) || !isValidId(photoId)) return null;
    return this.readJson<Photo>(this.dir(eventId, "meta", `${photoId}.json`));
  }

  async openPhoto(eventId: string, photo: Photo, variant: PhotoVariant): Promise<StoredFile> {
    let file: string;
    let mime: string;
    if (variant === "thumb" && photo.hasThumb) {
      file = this.dir(eventId, "thumbs", `${photo.id}.webp`);
      mime = "image/webp";
    } else if (variant === "view" && photo.hasThumb) {
      file = this.dir(eventId, "views", `${photo.id}.jpg`);
      mime = "image/jpeg";
    } else {
      file = this.dir(eventId, "originals", `${photo.id}.${photo.ext}`);
      mime = photo.mime;
    }
    const stat = await fs.stat(file);
    return { stream: createReadStream(file), size: stat.size, mime };
  }
}

/** The one storage instance used by the API routes. Swap the driver here. */
export const storage: StorageDriver = new LocalDriver();
