"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";

type Saved = { id: string; name: string };
const KEY = "snapshare:events";

function loadSaved(): Saved[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export default function CreateEventForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [date, setDate] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState<Saved[]>([]);

  useEffect(() => setSaved(loadSaved()), []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, date, description }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not create the event");
      try {
        const next = [{ id: data.id, name: data.name }, ...loadSaved()].slice(0, 10);
        localStorage.setItem(KEY, JSON.stringify(next));
      } catch {
        /* storage unavailable — not essential */
      }
      router.push(`/e/${data.id}/share`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setBusy(false);
    }
  }

  const field =
    "w-full rounded-xl border border-stone-300 bg-white px-4 py-3 text-base outline-none transition focus:border-rose-500 focus:ring-4 focus:ring-rose-100";

  return (
    <div className="w-full max-w-md">
      <form onSubmit={submit} className="space-y-4 rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
        <div>
          <label htmlFor="name" className="mb-1.5 block text-sm font-medium text-stone-700">
            Event name
          </label>
          <input
            id="name"
            required
            maxLength={80}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Priya & Arjun's Wedding"
            className={field}
          />
        </div>
        <div>
          <label htmlFor="date" className="mb-1.5 block text-sm font-medium text-stone-700">
            Date <span className="font-normal text-stone-400">(optional)</span>
          </label>
          <input id="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className={field} />
        </div>
        <div>
          <label htmlFor="desc" className="mb-1.5 block text-sm font-medium text-stone-700">
            Welcome message <span className="font-normal text-stone-400">(optional)</span>
          </label>
          <textarea
            id="desc"
            rows={2}
            maxLength={300}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Share your favourite moments from the night!"
            className={field + " resize-none"}
          />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={busy || !name.trim()}
          className="w-full rounded-xl bg-rose-600 px-4 py-3 font-medium text-white transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? "Creating…" : "Create event & get link"}
        </button>
      </form>

      {saved.length > 0 && (
        <div className="mt-6">
          <h2 className="mb-2 text-sm font-medium text-stone-500">Your recent events</h2>
          <ul className="divide-y divide-stone-200 overflow-hidden rounded-xl border border-stone-200 bg-white">
            {saved.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                <span className="truncate font-medium">{s.name}</span>
                <span className="flex shrink-0 gap-3">
                  <Link href={`/e/${s.id}`} className="text-rose-600 hover:underline">
                    Gallery
                  </Link>
                  <Link href={`/e/${s.id}/share`} className="text-stone-500 hover:underline">
                    QR
                  </Link>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
