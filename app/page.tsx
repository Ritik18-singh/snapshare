import CreateEventForm from "@/components/CreateEventForm";

const steps = [
  { n: "1", title: "Create an event", body: "Name it, and you instantly get a link and a QR code." },
  { n: "2", title: "Share with guests", body: "Print the QR on table cards or send the link. No sign-up, no app." },
  { n: "3", title: "Everyone uploads", body: "Guests add photos from their phone. The gallery fills up live." },
];

export default function Home() {
  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-12 px-5 py-12 md:flex-row md:items-start md:gap-16 md:py-20">
      <section className="flex-1">
        <p className="mb-4 text-sm font-semibold uppercase tracking-widest text-rose-600">SnapShare</p>
        <h1 className="font-display text-4xl leading-tight md:text-6xl">
          Every guest&rsquo;s photos,
          <br />
          one shared gallery.
        </h1>
        <p className="mt-5 max-w-lg text-lg text-stone-600">
          Stop chasing friends for pictures after the party. Create an event, share a link or QR code, and
          collect everything in one place &mdash; full resolution, ready to download.
        </p>
        <ol className="mt-10 space-y-5">
          {steps.map((s) => (
            <li key={s.n} className="flex gap-4">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-rose-100 font-display text-lg text-rose-700">
                {s.n}
              </span>
              <div>
                <h2 className="font-medium">{s.title}</h2>
                <p className="text-stone-600">{s.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>
      <section className="flex justify-center md:justify-end">
        <CreateEventForm />
      </section>
    </main>
  );
}
