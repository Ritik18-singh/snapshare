"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Gallery from "./Gallery";
import Uploader from "./Uploader";
import type { Photo } from "@/lib/types";

const POLL_MS = 5000;

const sameList = (a: Photo[], b: Photo[]) => a.length === b.length && a.every((p, i) => p.id === b[i].id);

export default function EventClient({ eventId }: { eventId: string }) {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [live, setLive] = useState(true);
  const inFlight = useRef(false);

  const refresh = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const res = await fetch(`/api/events/${eventId}/photos`, { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      const data: { photos: Photo[] } = await res.json();
      // Keep the same array identity when nothing changed to avoid re-rendering the grid.
      setPhotos((prev) => (sameList(prev, data.photos) ? prev : data.photos));
      setLive(true);
    } catch {
      setLive(false);
    } finally {
      inFlight.current = false;
    }
  }, [eventId]);

  // Live gallery: poll while the tab is visible, and catch up immediately on return.
  useEffect(() => {
    void refresh();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh]);

  return (
    <div className="space-y-10">
      <Uploader eventId={eventId} onUploaded={refresh} />
      <Gallery eventId={eventId} photos={photos} live={live} />
    </div>
  );
}
