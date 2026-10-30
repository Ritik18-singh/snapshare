"use client";

import { useCallback, useRef, useState } from "react";
import { cn, formatBytes } from "@/lib/utils";

type Item = {
  key: string;
  file: File;
  progress: number;
  status: "queued" | "uploading" | "done" | "error";
  error?: string;
};

const MAX_BYTES = 30 * 1024 * 1024;
const HEIC = /\.(heic|heif)$/i;
const CONCURRENCY = 3;

// crypto.randomUUID needs a secure context, which plain-http LAN testing isn't.
const makeKey = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`;

export default function Uploader({ eventId, onUploaded }: { eventId: string; onUploaded: () => void }) {
  const [items, setItems] = useState<Item[]>([]);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const patch = useCallback((key: string, p: Partial<Item>) => {
    setItems((prev) => prev.map((i) => (i.key === key ? { ...i, ...p } : i)));
  }, []);

  // One request per photo: gives accurate per-file progress and lets one bad
  // file fail without sinking the rest of the batch.
  const sendOne = useCallback(
    (item: Item) =>
      new Promise<void>((resolve) => {
        patch(item.key, { status: "uploading", progress: 0, error: undefined });
        const xhr = new XMLHttpRequest();
        xhr.open("POST", `/api/events/${eventId}/photos`);
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) patch(item.key, { progress: e.loaded / e.total });
        };
        const fail = (msg: string) => {
          patch(item.key, { status: "error", error: msg });
          resolve();
        };
        xhr.onerror = () => fail("Network error");
        xhr.ontimeout = () => fail("Timed out");
        xhr.onload = () => {
          let data: { photos?: unknown[]; errors?: { error: string }[]; error?: string } = {};
          try {
            data = JSON.parse(xhr.responseText);
          } catch {
            /* non-JSON error page */
          }
          if (xhr.status < 300 && data.photos?.length) {
            patch(item.key, { status: "done", progress: 1 });
            resolve();
          } else {
            fail(data.errors?.[0]?.error ?? data.error ?? "Upload failed");
          }
        };
        const fd = new FormData();
        fd.append("files", item.file);
        xhr.send(fd);
      }),
    [eventId, patch],
  );

  const run = useCallback(
    async (queue: Item[]) => {
      let next = 0;
      const worker = async () => {
        while (next < queue.length) {
          await sendOne(queue[next++]);
          onUploaded(); // show each photo in the gallery as soon as it lands
        }
      };
      await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, worker));
    },
    [sendOne, onUploaded],
  );

  const addFiles = useCallback(
    (list: FileList | File[]) => {
      const created: Item[] = Array.from(list).map((file) => {
        const isImage = file.type.startsWith("image/") || HEIC.test(file.name);
        const error = !isImage ? "Not an image" : file.size > MAX_BYTES ? "Larger than 30 MB" : undefined;
        return { key: makeKey(), file, progress: 0, status: error ? "error" : "queued", error };
      });
      if (created.length === 0) return;
      setItems((prev) => [...prev, ...created]);
      void run(created.filter((i) => i.status === "queued"));
    },
    [run],
  );

  const doneCount = items.filter((i) => i.status === "done").length;
  const active = items.filter((i) => i.status !== "done");
  const uploading = items.some((i) => i.status === "uploading" || i.status === "queued");

  return (
    <section aria-label="Upload photos">
      <label
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          addFiles(e.dataTransfer.files);
        }}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-10 text-center transition",
          dragging ? "border-rose-500 bg-rose-50" : "border-stone-300 bg-white hover:border-rose-400 hover:bg-rose-50/50",
        )}
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/*,.heic,.heif"
          multiple
          className="sr-only"
          onChange={(e) => {
            if (e.target.files) addFiles(e.target.files);
            e.target.value = ""; // allow re-selecting the same files
          }}
        />
        <svg viewBox="0 0 24 24" className="mb-3 h-10 w-10 text-rose-500" fill="none" stroke="currentColor" strokeWidth="1.6">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 16V4m0 0L8 8m4-4 4 4M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
        </svg>
        <span className="text-lg font-medium">Add your photos</span>
        <span className="mt-1 text-sm text-stone-500">Tap to choose from your phone, or drag &amp; drop here</span>
        <span className="mt-1 text-xs text-stone-400">Select as many as you like &middot; up to 30 MB each</span>
      </label>

      {(active.length > 0 || doneCount > 0) && (
        <div className="mt-4 space-y-2">
          {doneCount > 0 && (
            <div className="flex items-center justify-between rounded-xl bg-emerald-50 px-4 py-2.5 text-sm text-emerald-800">
              <span>
                {uploading ? "Uploading… " : ""}✓ {doneCount} photo{doneCount === 1 ? "" : "s"} uploaded
              </span>
              {!uploading && (
                <button
                  onClick={() => setItems((prev) => prev.filter((i) => i.status !== "done"))}
                  className="text-emerald-700 underline"
                >
                  Dismiss
                </button>
              )}
            </div>
          )}
          {active.map((i) => (
            <div key={i.key} className="rounded-xl border border-stone-200 bg-white px-4 py-2.5">
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="truncate">{i.file.name}</span>
                <span className="shrink-0 text-xs text-stone-400">{formatBytes(i.file.size)}</span>
              </div>
              {i.status === "error" ? (
                <div className="mt-1 flex items-center justify-between text-xs text-red-600">
                  <span>{i.error}</span>
                  {i.file.size <= MAX_BYTES && i.error !== "Not an image" && (
                    <button onClick={() => void run([i])} className="font-medium underline">
                      Retry
                    </button>
                  )}
                </div>
              ) : (
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-stone-100">
                  <div
                    className="h-full rounded-full bg-rose-500 transition-all"
                    style={{ width: `${Math.round(i.progress * 100)}%` }}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
