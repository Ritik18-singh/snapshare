import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-5 text-center">
      <h1 className="font-display text-3xl">We can&rsquo;t find that event</h1>
      <p className="mt-3 text-stone-600">The link may be mistyped or the event may have been removed.</p>
      <Link href="/" className="mt-6 rounded-xl bg-rose-600 px-5 py-3 font-medium text-white hover:bg-rose-700">
        Create a new event
      </Link>
    </main>
  );
}
