import { randomBytes } from "node:crypto";
import { Readable } from "node:stream";
import sharp from "sharp";
import type { EventMeta, Photo, PhotoVariant } from "./types";

export const MAX_FILE_BYTES = 30 * 1024 * 1024;

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

export function resolveImageMime(
  type: string,
  name: string
): string | null {
  const mime = type.toLowerCase();

  if (EXT_BY_MIME[mime]) {
    return mime;
  }

  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return MIME_BY_EXT[ext] ?? null;
}

const ID_RE = /^[A-Za-z0-9_-]{4,64}$/;

export const isValidId = (value: string) =>
  ID_RE.test(value);

function sanitizeFilename(name: string, ext: string) {
  const base =
    name
      .split(/[\\/]/)
      .pop()
      ?.replace(/[\u0000-\u001f<>:"/\\|?*]/g, "_")
      .trim()
      .slice(0, 120) ?? "";

  const cleaned = base || `photo.${ext}`;

  return /\.[A-Za-z0-9]{2,5}$/.test(cleaned)
    ? cleaned
    : `${cleaned}.${ext}`;
}

export interface StoredFile {
  stream: Readable;
  size: number;
  mime: string;
}

export interface StorageDriver {
  createEvent(input: {
    name: string;
    description?: string;
    date?: string;
  }): Promise<EventMeta>;

  getEvent(id: string): Promise<EventMeta | null>;

  addPhoto(
    eventId: string,
    file: {
      name: string;
      mime: string;
      buffer: Buffer;
    }
  ): Promise<Photo>;

  listPhotos(eventId: string): Promise<Photo[]>;

  getPhoto(
    eventId: string,
    photoId: string
  ): Promise<Photo | null>;

  openPhoto(
    eventId: string,
    photo: Photo,
    variant: PhotoVariant
  ): Promise<StoredFile>;
}

type EventRow = {
  id: string;
  name: string;
  description: string | null;
  date: string | null;
  created_at: string;
};

type PhotoRow = {
  id: string;
  event_id: string;
  file_name: string;
  mime: string;
  ext: string;
  size_bytes: number;
  width: number | null;
  height: number | null;
  created_at: string;
  has_thumb: boolean;
  storage_path: string;
  thumb_path: string | null;
  view_path: string | null;
};

function mapEvent(row: EventRow): EventMeta {
  return {
    id: row.id,
    name: row.name,
    description: row.description || undefined,
    date: row.date || undefined,
    createdAt: row.created_at,
  };
}

function mapPhoto(row: PhotoRow): Photo {
  return {
    id: row.id,
    filename: row.file_name,
    mime: row.mime,
    ext: row.ext,
    size: Number(row.size_bytes),
    width: row.width ?? undefined,
    height: row.height ?? undefined,
    uploadedAt: row.created_at,
    hasThumb: Boolean(row.has_thumb),
  };
}

/**
 * Server-side Supabase REST and Storage driver.
 * SUPABASE_SECRET_KEY must remain server-side.
 */
class SupabaseDriver implements StorageDriver {
  private get url(): string {
    const value = process.env.SUPABASE_URL;

    if (!value) {
      throw new Error(
        "Missing SUPABASE_URL environment variable"
      );
    }

    return value.replace(/\/+$/, "");
  }

  private get key(): string {
    const value = process.env.SUPABASE_SECRET_KEY;

    if (!value) {
      throw new Error(
        "Missing SUPABASE_SECRET_KEY environment variable"
      );
    }

    return value;
  }

  private get bucket(): string {
    return process.env.SUPABASE_BUCKET || "snapshare-photos";
  }

  private headers(
    extra?: Record<string, string>
  ): Record<string, string> {
    return {
      apikey: this.key,
      Authorization: `Bearer ${this.key}`,
      ...extra,
    };
  }

  private async database<T>(
    table: string,
    query: string,
    init?: RequestInit
  ): Promise<T> {
    const response = await fetch(
      `${this.url}/rest/v1/${table}${query}`,
      {
        ...init,
        headers: this.headers({
          "Content-Type": "application/json",
          ...(init?.headers as
            | Record<string, string>
            | undefined),
        }),
        cache: "no-store",
      }
    );

    if (!response.ok) {
      const detail = await response.text().catch(() => "");

      console.error(
        "Supabase database request failed:",
        table,
        response.status,
        detail
      );

      throw new Error(
        `Database request failed (${response.status})`
      );
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return (await response.json()) as T;
  }

  private objectUrl(path: string): string {
    const safePath = path
      .split("/")
      .map(encodeURIComponent)
      .join("/");

    return (
      `${this.url}/storage/v1/object/` +
      `${encodeURIComponent(this.bucket)}/${safePath}`
    );
  }

  private async uploadObject(
    path: string,
    buffer: Buffer,
    mime: string
  ): Promise<void> {
    const response = await fetch(this.objectUrl(path), {
      method: "POST",
      headers: this.headers({
        "Content-Type": mime,
        "x-upsert": "false",
      }),
      body: new Uint8Array(buffer),
      cache: "no-store",
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");

      console.error(
        "Supabase Storage upload failed:",
        response.status,
        detail
      );

      throw new Error(
        `Photo storage upload failed (${response.status})`
      );
    }
  }

  private async removeObjects(
    paths: string[]
  ): Promise<void> {
    if (!paths.length) return;

    try {
      const response = await fetch(
        `${this.url}/storage/v1/object/${encodeURIComponent(
          this.bucket
        )}`,
        {
          method: "DELETE",
          headers: this.headers({
            "Content-Type": "application/json",
          }),
          body: JSON.stringify({ prefixes: paths }),
          cache: "no-store",
        }
      );

      if (!response.ok) {
        console.error(
          "Supabase Storage cleanup failed:",
          response.status
        );
      }
    } catch (error) {
      console.error(
        "Supabase Storage cleanup failed:",
        error
      );
    }
  }

  async createEvent(input: {
    name: string;
    description?: string;
    date?: string;
  }): Promise<EventMeta> {
    const id = randomBytes(7).toString("base64url");

    const rows = await this.database<EventRow[]>(
      "events",
      "?select=*",
      {
        method: "POST",
        headers: {
          Prefer: "return=representation",
        },
        body: JSON.stringify({
          id,
          name: input.name,
          description: input.description || null,
          date: input.date || null,
        }),
      }
    );

    if (!rows[0]) {
      throw new Error("Event creation returned no record");
    }

    return mapEvent(rows[0]);
  }

  async getEvent(id: string): Promise<EventMeta | null> {
    if (!isValidId(id)) return null;

    const rows = await this.database<EventRow[]>(
      "events",
      `?id=eq.${encodeURIComponent(id)}&select=*&limit=1`
    );

    return rows[0] ? mapEvent(rows[0]) : null;
  }

  async addPhoto(
    eventId: string,
    file: {
      name: string;
      mime: string;
      buffer: Buffer;
    }
  ): Promise<Photo> {
    if (!isValidId(eventId)) {
      throw new Error("Invalid event id");
    }

    const id =
      Date.now().toString(36) +
      randomBytes(4).toString("hex");

    const ext = EXT_BY_MIME[file.mime] ?? "jpg";

    const isHeic =
      file.mime === "image/heic" ||
      file.mime === "image/heif";

    const originalPath =
      `events/${eventId}/originals/${id}.${ext}`;

    const cleanup = [originalPath];

    let width: number | undefined;
    let height: number | undefined;
    let hasThumb = false;

    let thumbPath: string | null = null;
    let viewPath: string | null = null;

    let thumb: Buffer | null = null;
    let view: Buffer | null = null;

    try {
      const base = sharp(file.buffer, {
        failOn: "none",
      });

      const meta = await base.metadata();
      const swap = (meta.orientation ?? 1) >= 5;

      width = swap ? meta.height : meta.width;
      height = swap ? meta.width : meta.height;

      [thumb, view] = await Promise.all([
        base
          .clone()
          .rotate()
          .resize({
            width: 480,
            withoutEnlargement: true,
          })
          .webp({ quality: 72 })
          .toBuffer(),

        base
          .clone()
          .rotate()
          .resize({
            width: 2200,
            height: 2200,
            fit: "inside",
            withoutEnlargement: true,
          })
          .jpeg({ quality: 85 })
          .toBuffer(),
      ]);

      thumbPath =
        `events/${eventId}/thumbs/${id}.webp`;

      viewPath =
        `events/${eventId}/views/${id}.jpg`;

      cleanup.push(thumbPath, viewPath);
      hasThumb = true;
    } catch {
      if (!isHeic) {
        throw new Error("That file isn't a valid image");
      }
    }

    try {
      await this.uploadObject(
        originalPath,
        file.buffer,
        file.mime
      );

      if (
        hasThumb &&
        thumb &&
        view &&
        thumbPath &&
        viewPath
      ) {
        await Promise.all([
          this.uploadObject(
            thumbPath,
            thumb,
            "image/webp"
          ),
          this.uploadObject(
            viewPath,
            view,
            "image/jpeg"
          ),
        ]);
      }

      const rows = await this.database<PhotoRow[]>(
        "photos",
        "?select=*",
        {
          method: "POST",
          headers: {
            Prefer: "return=representation",
          },
          body: JSON.stringify({
            id,
            event_id: eventId,
            file_name: sanitizeFilename(
              file.name,
              ext
            ),
            mime: file.mime,
            ext,
            size_bytes: file.buffer.length,
            width: width ?? null,
            height: height ?? null,
            has_thumb: hasThumb,
            storage_path: originalPath,
            thumb_path: thumbPath,
            view_path: viewPath,
          }),
        }
      );

      if (!rows[0]) {
        throw new Error(
          "Photo record creation returned no record"
        );
      }

      return mapPhoto(rows[0]);
    } catch (error) {
      await this.removeObjects(cleanup);
      throw error;
    }
  }

  async listPhotos(eventId: string): Promise<Photo[]> {
    if (!isValidId(eventId)) return [];

    const rows = await this.database<PhotoRow[]>(
      "photos",
      `?event_id=eq.${encodeURIComponent(
        eventId
      )}&select=*&order=created_at.desc`
    );

    return rows.map(mapPhoto);
  }

  async getPhoto(
    eventId: string,
    photoId: string
  ): Promise<Photo | null> {
    if (!isValidId(eventId) || !isValidId(photoId)) {
      return null;
    }

    const rows = await this.database<PhotoRow[]>(
      "photos",
      `?event_id=eq.${encodeURIComponent(
        eventId
      )}&id=eq.${encodeURIComponent(
        photoId
      )}&select=*&limit=1`
    );

    return rows[0] ? mapPhoto(rows[0]) : null;
  }

  async openPhoto(
    eventId: string,
    photo: Photo,
    variant: PhotoVariant
  ): Promise<StoredFile> {
    if (!isValidId(eventId) || !isValidId(photo.id)) {
      throw new Error("Invalid photo id");
    }

    const rows = await this.database<
      Array<
        Pick<
          PhotoRow,
          "storage_path" | "thumb_path" | "view_path"
        >
      >
    >(
      "photos",
      `?event_id=eq.${encodeURIComponent(
        eventId
      )}&id=eq.${encodeURIComponent(
        photo.id
      )}&select=storage_path,thumb_path,view_path&limit=1`
    );

    const row = rows[0];

    if (!row?.storage_path) {
      throw new Error("Photo record not found");
    }

    let path = row.storage_path;
    let mime = photo.mime;

    if (
      variant === "thumb" &&
      photo.hasThumb &&
      row.thumb_path
    ) {
      path = row.thumb_path;
      mime = "image/webp";
    } else if (
      variant === "view" &&
      photo.hasThumb &&
      row.view_path
    ) {
      path = row.view_path;
      mime = "image/jpeg";
    }

    const response = await fetch(this.objectUrl(path), {
      headers: this.headers(),
      cache: "no-store",
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");

      console.error(
        "Supabase Storage download failed:",
        response.status,
        detail
      );

      throw new Error(
        `Photo could not be loaded (${response.status})`
      );
    }

    const buffer = Buffer.from(
      await response.arrayBuffer()
    );

    return {
      stream: Readable.from(buffer),
      size: buffer.length,
      mime,
    };
  }
}

export const storage: StorageDriver =
  new SupabaseDriver();
