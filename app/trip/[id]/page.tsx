import Link from "next/link";
import Sidebar from "../../../components/Sidebar";
import DayTimeline from "../../../components/DayTimeline";
import SafeImage from "../../../components/SafeImage";
import trips from "../../../data/trips";

export default async function TripDetails({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const trip = trips.find((t) => t.id === id);

  if (!trip) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#121212] text-white">
        <div className="text-center">
          <p className="text-sm text-white/50">Viaggio non trovato.</p>
          <Link
            href="/"
            className="mt-4 inline-flex rounded-xl bg-white px-4 py-2 text-sm font-semibold text-gray-900 transition hover:bg-white/90"
          >
            Torna alla home
          </Link>
        </div>
      </div>
    );
  }

  const totalActivities = trip.days.reduce(
    (acc, d) => acc + d.activities.length,
    0,
  );

  return (
    <div className="min-h-screen bg-[#121212] text-white">
      <Sidebar />

      {/* pb-24 = clearance for mobile bottom nav */}
      <main className="mx-auto max-w-6xl px-4 pb-24 sm:px-5 lg:ml-80 lg:pb-10">
        {/* ── Hero cover ───────────────────────────────────────────────── */}
        <div className="relative -mx-4 sm:-mx-5 lg:mx-0 lg:mt-6 lg:overflow-hidden lg:rounded-3xl">
          {trip.coverImageUrl ? (
            <SafeImage
              src={trip.coverImageUrl}
              alt={trip.name}
              className="h-52 w-full object-cover sm:h-64 lg:h-72"
              fallbackLabel={trip.name}
            />
          ) : (
            <div className="h-52 w-full bg-gradient-to-br from-emerald-900/40 via-slate-800 to-indigo-900/40 sm:h-64 lg:h-72" />
          )}

          {/* Gradient overlay for text readability */}
          <div className="absolute inset-0 bg-gradient-to-t from-[#121212] via-[#121212]/60 to-transparent" />

          {/* Title over image */}
          <div className="absolute inset-x-0 bottom-0 px-5 pb-5 sm:px-6 sm:pb-6">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-white drop-shadow-lg sm:text-3xl">
                  {trip.name}
                </h1>
                {trip.subtitle ? (
                  <p className="mt-1 text-sm text-white/70 drop-shadow">{trip.subtitle}</p>
                ) : null}
              </div>
              <Link
                href="/"
                className="hidden rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-sm font-semibold text-white backdrop-blur transition hover:bg-white/20 sm:inline-flex"
              >
                ← Home
              </Link>
            </div>
          </div>
        </div>

        {/* ── Trip info row ─────────────────────────────────────────────── */}
        <div className="mt-5 animate-fade-in-up px-1">
          <p className="max-w-2xl text-sm leading-relaxed text-white/55">
            {trip.description}
          </p>

          <div className="mt-4 flex flex-wrap gap-2 text-[11px] font-medium text-white/50">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.06] bg-white/[0.03] px-3 py-1.5">
              <span className="dot-accent" style={{ width: 5, height: 5 }} />
              {trip.location}
            </span>
            <span className="inline-flex items-center gap-1 rounded-full border border-white/[0.06] bg-white/[0.03] px-3 py-1.5">
              {trip.startDate} → {trip.endDate}
            </span>
            <span className="inline-flex items-center gap-1 rounded-full border border-white/[0.06] bg-white/[0.03] px-3 py-1.5">
              {trip.days.length} giorni · {totalActivities} attività
            </span>
          </div>
        </div>

        {/* ── Timeline ──────────────────────────────────────────────────── */}
        <DayTimeline days={trip.days} />
      </main>
    </div>
  );
}
