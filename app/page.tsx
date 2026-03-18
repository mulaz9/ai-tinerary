import Sidebar from "../components/Sidebar";
import trips from "../data/trips";
import TripCard from "../components/TripCard";

export default function Home() {
  return (
    <div className="min-h-screen bg-[#121212] text-white">
      <Sidebar />

      {/* pb-24 = clearance for mobile bottom nav; lg resets to normal */}
      <main className="mx-auto max-w-6xl px-4 py-6 pb-24 sm:px-5 sm:py-8 lg:ml-80 lg:pb-10">
        {/* ── Hero ──────────────────────────────────────────────────────── */}
        <header className="animate-fade-in-up">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-emerald-400/70">
            AI-tinerary
          </p>
          <h1 className="mt-2 text-3xl font-bold leading-tight tracking-tight text-white sm:text-4xl">
            Pianifica e spunta<br className="hidden sm:block" /> le tue tappe
          </h1>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-white/50">
            Scegli un viaggio, esplora i giorni e spunta le attività man mano che
            le completi. Tutto hardcoded, niente DB.
          </p>
        </header>

        {/* ── Trip cards ────────────────────────────────────────────────── */}
        <section className="mt-10">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-base font-semibold text-white">Viaggi disponibili</h2>
            <span className="rounded-full border border-white/[0.06] bg-white/[0.03] px-3 py-1 text-[11px] font-medium text-white/50">
              {trips.length} viaggi
            </span>
          </div>

          <div className="stagger-children mt-4 grid gap-4 md:grid-cols-2">
            {trips.map((trip, i) => (
              <div key={trip.id} style={{ "--i": i } as React.CSSProperties}>
                <TripCard trip={trip} />
              </div>
            ))}
          </div>
        </section>

        {/* ── Day preview grid ──────────────────────────────────────────── */}
        <section className="mt-12 animate-fade-in">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold text-white">Prossime tappe</h3>
              <p className="mt-0.5 text-xs text-white/40">Anteprima rapida dei giorni</p>
            </div>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {trips
              .flatMap((t) => t.days.map((d) => ({ trip: t, day: d })))
              .slice(0, 6)
              .map(({ trip, day }) => (
                <a
                  key={day.id}
                  href={`/trip/${trip.id}`}
                  className="group rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4 transition-all duration-200 hover:border-white/10 hover:bg-white/[0.04] active:scale-[0.98]"
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-white">{trip.name}</p>
                    <span className="shrink-0 text-[11px] tabular-nums text-white/40">{day.date}</span>
                  </div>
                  <p className="mt-2 text-sm font-medium text-white/80">
                    Giorno {day.day}: {day.title}
                  </p>
                  <p className="mt-1.5 line-clamp-2 text-[13px] leading-relaxed text-white/45">
                    {day.summary}
                  </p>
                  <div className="mt-3 flex items-center justify-between">
                    <span className="text-[11px] text-white/35">
                      {day.activities.length} attività
                    </span>
                    <span className="text-[11px] font-medium text-emerald-400/60 opacity-0 transition-opacity group-hover:opacity-100">
                      Apri →
                    </span>
                  </div>
                </a>
              ))}
          </div>
        </section>
      </main>
    </div>
  );
}
