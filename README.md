# SnapShare

Create an event, share a link or QR code, and let guests upload photos from their phones into one live gallery. No accounts for guests.

**Stack:** Next.js 15 (App Router) · React 19 · Tailwind CSS 3 · sharp (thumbnails) · archiver (ZIP) · qrcode. Photos are stored on local disk by default, behind a small driver interface so you can move to S3 or Supabase.

## Run it

```bash
npm install
cp .env.example .env.local   # optional, see below
npm run dev                  # http://localhost:3000
```

To test uploads from a real phone on the same Wi-Fi, set `NEXT_PUBLIC_BASE_URL` in `.env.local` to your computer's address (for example `http://192.168.1.20:3000`) and restart. The QR code and link are built from that value.

Production: `npm run build && npm start`.

## How it works

| Page | Purpose |
| --- | --- |
| `/` | Create an event (name, optional date and welcome message) |
| `/e/:id/share` | Link, QR code (copy, share, download PNG, print) |
| `/e/:id` | What guests open: upload area plus live gallery |

| API | Purpose |
| --- | --- |
| `POST /api/events` | Create an event, returns `{ id, ... }` |
| `GET /api/events/:id` | Event details |
| `GET /api/events/:id/photos` | List photos, newest first |
| `POST /api/events/:id/photos` | Multipart upload, field `files` (repeatable) |
| `GET /api/events/:id/photos/:photoId?size=thumb\|view\|original&download=1` | Serve an image |
| `GET /api/events/:id/zip[?ids=a,b]` and `POST` (form field `ids`) | Streamed ZIP of originals |

Details worth knowing:

- **Uploads:** the browser sends one request per photo, 3 in parallel, with a progress bar and retry for each. Max 30 MB per photo.
- **Three sizes per photo:** a 480px WebP thumbnail for the grid, a 2200px JPEG for the lightbox, and the untouched original. "Download" and ZIPs always deliver originals.
- **Live gallery:** polls every 5 seconds while the tab is visible and refreshes on return.
- **Lightbox:** keyboard arrows, swipe on touch, per-photo download, open full size.
- **Select mode:** pick photos and download just those as a ZIP, or download everything.
- **Access model:** anyone with the event link can view, upload and download. The event id is a random 10-character token.

## Storage layout (local driver)

```
data/events/<eventId>/
  event.json
  originals/  views/  thumbs/
  meta/<photoId>.json      # one sidecar per photo, so concurrent uploads never race
```

Set `DATA_DIR` to put this somewhere else, such as a mounted volume.

## Moving to S3 / Supabase Storage

All file access goes through the `StorageDriver` interface in `lib/storage.ts` (`createEvent`, `getEvent`, `addPhoto`, `listPhotos`, `getPhoto`, `openPhoto`). To switch:

1. Write a class implementing it. Keep the same keys: `events/<id>/originals/<photoId>.<ext>`, `.../views/...`, `.../thumbs/...`, and the metadata JSON.
2. `openPhoto` returns a Node `Readable`, so for S3 use `GetObjectCommand` and return `Body`. Optionally redirect to a short-lived signed URL in the photo route instead.
3. Replace the last line (`export const storage = new LocalDriver()`) with your driver.

## Before you put this on the internet

- Local disk needs a persistent server or volume. It will not work on serverless hosts such as Vercel unless you switch to the S3 or Supabase driver.
- Add rate limiting on `POST /api/events` and the upload route, and put a body-size limit on your reverse proxy.
- HEIC/HEIF photos are stored and downloadable but get no thumbnail (the bundled sharp build can't decode them). iOS Safari normally converts to JPEG when uploading from the photo picker.
- There is no host dashboard or delete function yet. Natural next steps: a host token returned at creation to allow deleting photos, and an event expiry date.
