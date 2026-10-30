"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Photo } from "@/lib/types";
import { cn, formatBytes } from "@/lib/utils";

const src = (eventId: string, id: string, size: "thumb" | "view" | "original") =>
  `/api/events/${eventId}/photos/${id}?size=${size}`;

export default function Gallery({ eventId, photos, live }: { eventId: string; photos: Photo[]; live: boolean }) {
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [openId, setOpenId] = useState<string | null>(null);

  // Drop selections for photos that no longer exist.
  useEffect(() => {
    setSelected((prev) => {
      const ids = new Set(photos.map((p) => p.id));
      const next = new Set([...prev].filter((id) => ids.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [photos]);

  // Selected ids are POSTed through a hidden form so the browser handles the
  // streaming download natively, with no limit on how many photos are chosen.
  const downloadZip = useCallback(
    (ids?: string[]) => {
      if (!ids) {
        window.location.href = `/api/events/${eventId}/zip`;
        return;
      }
      const form = document.createElement("form");
      form.method = "POST";
      form.action = `/api/events/${eventId}/zip`;
      const input = document.createElement("input");
      input.type = "hidden";
      input.name = "ids";
      input.value = ids.join(",");
      form.appendChild(input);
      document.body.appendChild(form);
      form.submit();
      form.remove();
    },
    [eventId],
  );

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const exitSelect = () => {
    setSelecting(false);
    setSelected(new Set());
  };

  const btn = "rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-sm font-medium transition hover:bg-stone-100";
  const primary = "rounded-lg bg-stone-900 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-stone-700";

  const openIndex = openId ? photos.findIndex((p) => p.id === openId) : -1;

  return (
    <section aria-label="Gallery">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h2 className="font-display text-2xl">
            {photos.length} photo{photos.length === 1 ? "" : "s"}
          </h2>
          <span
            title={live ? "Updating live" : "Reconnecting…"}
            className={cn("flex items-center gap-1.5 text-xs", live ? "text-emerald-600" : "text-stone-400")}
          >
            <span className={cn("h-2 w-2 rounded-full", live ? "animate-pulse bg-emerald-500" : "bg-stone-300")} />
            {live ? "Live" : "Offline"}
          </span>
        </div>

        {photos.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            {selecting ? (
              <>
                <span className="text-sm text-stone-500">{selected.size} selected</span>
                <button className={btn} onClick={() => setSelected(new Set(photos.map((p) => p.id)))}>
                  Select all
                </button>
                <button
                  className={cn(primary, selected.size === 0 && "pointer-events-none opacity-40")}
                  onClick={() => downloadZip([...selected])}
                >
                  Download ZIP
                </button>
                <button className={btn} onClick={exitSelect}>
                  Cancel
                </button>
              </>
            ) : (
              <>
                <button className={btn} onClick={() => setSelecting(true)}>
                  Select
                </button>
                <button className={primary} onClick={() => downloadZip()}>
                  Download all (ZIP)
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {photos.length === 0 ? (
        <div className="rounded-2xl border border-stone-200 bg-white px-6 py-16 text-center text-stone-500">
          No photos yet &mdash; be the first to add one!
        </div>
      ) : (
        <ul className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 sm:gap-2 md:grid-cols-4 lg:grid-cols-5">
          {photos.map((p) => {
            const isSel = selected.has(p.id);
            return (
              <li key={p.id}>
                <button
                  onClick={() => (selecting ? toggle(p.id) : setOpenId(p.id))}
                  className={cn(
                    "group relative block aspect-square w-full overflow-hidden rounded-lg bg-stone-200 outline-none focus-visible:ring-4 focus-visible:ring-rose-300",
                    isSel && "ring-4 ring-rose-500",
                  )}
                  aria-label={selecting ? `${isSel ? "Deselect" : "Select"} ${p.filename}` : `Open ${p.filename}`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={src(eventId, p.id, "thumb")}
                    alt={p.filename}
                    loading="lazy"
                    decoding="async"
                    className={cn(
                      "h-full w-full object-cover transition duration-300 group-hover:scale-105",
                      isSel && "scale-95",
                    )}
                  />
                  {selecting && (
                    <span
                      className={cn(
                        "absolute left-2 top-2 flex h-6 w-6 items-center justify-center rounded-full border-2 text-xs font-bold",
                        isSel ? "border-rose-500 bg-rose-500 text-white" : "border-white bg-black/20 text-transparent",
                      )}
                    >
                      ✓
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {openIndex >= 0 && (
        <Lightbox
          eventId={eventId}
          photos={photos}
          index={openIndex}
          onIndex={(i) => setOpenId(photos[i].id)}
          onClose={() => setOpenId(null)}
        />
      )}
    </section>
  );
}

function Lightbox({
  eventId,
  photos,
  index,
  onIndex,
  onClose,
}: {
  eventId: string;
  photos: Photo[];
  index: number;
  onIndex: (i: number) => void;
  onClose: () => void;
}) {
  const photo = photos[index];
  const touchX = useRef<number | null>(null);
  const hasPrev = index > 0;
  const hasNext = index < photos.length - 1;

  const go = useCallback(
    (delta: number) => {
      const next = index + delta;
      if (next >= 0 && next < photos.length) onIndex(next);
    },
    [index, photos.length, onIndex],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft") go(-1);
      else if (e.key === "ArrowRight") go(1);
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [go, onClose]);

  // Warm the cache for the neighbouring photos so swiping feels instant.
  useEffect(() => {
    [photos[index - 1], photos[index + 1]].forEach((p) => {
      if (p) new Image().src = src(eventId, p.id, "view");
    });
  }, [eventId, photos, index]);

  const link = "rounded-lg bg-white/10 px-3 py-2 text-sm font-medium text-white backdrop-blur transition hover:bg-white/20";

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-black/95"
      role="dialog"
      aria-modal="true"
      aria-label={photo.filename}
      onTouchStart={(e) => (touchX.current = e.touches[0].clientX)}
      onTouchEnd={(e) => {
        if (touchX.current === null) return;
        const dx = e.changedTouches[0].clientX - touchX.current;
        touchX.current = null;
        if (Math.abs(dx) > 60) go(dx < 0 ? 1 : -1);
      }}
    >
      <div className="flex items-center justify-between gap-3 px-4 py-3 text-white">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{photo.filename}</p>
          <p className="text-xs text-white/60">
            {index + 1} of {photos.length} &middot; {formatBytes(photo.size)}
            {photo.width && photo.height ? ` · ${photo.width}×${photo.height}` : ""}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <a href={src(eventId, photo.id, "original")} target="_blank" rel="noreferrer" className={link}>
            Full size
          </a>
          <a href={`/api/events/${eventId}/photos/${photo.id}?download=1`} className={cn(link, "!bg-rose-600 hover:!bg-rose-700")}>
            Download
          </a>
          <button onClick={onClose} aria-label="Close" className={cn(link, "px-3.5 text-base leading-none")}>
            ✕
          </button>
        </div>
      </div>

      <div className="relative flex min-h-0 flex-1 items-center justify-center px-2 pb-4" onClick={onClose}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          key={photo.id}
          src={src(eventId, photo.id, "view")}
          alt={photo.filename}
          className="max-h-full max-w-full select-none object-contain"
          onClick={(e) => e.stopPropagation()}
          draggable={false}
        />
        {hasPrev && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              go(-1);
            }}
            aria-label="Previous photo"
            className="absolute left-2 top-1/2 hidden h-11 w-11 -translate-y-1/2 rounded-full bg-white/10 text-2xl text-white backdrop-blur hover:bg-white/25 sm:block"
          >
            ‹
          </button>
        )}
        {hasNext && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              go(1);
            }}
            aria-label="Next photo"
            className="absolute right-2 top-1/2 hidden h-11 w-11 -translate-y-1/2 rounded-full bg-white/10 text-2xl text-white backdrop-blur hover:bg-white/25 sm:block"
          >
            ›
          </button>
        )}
      </div>
    </div>
  );
}
