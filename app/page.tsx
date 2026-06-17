"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import Sidebar from "../components/Sidebar";
import TripCard from "../components/TripCard";
import NewTripDialog from "../components/NewTripDialog";
import { useAllTrips } from "../lib/trips-store";
import { fetchTripsSharedWithMe } from "../lib/trip-sharing";
import type { SharePermission, Trip } from "../types";

type SharedTrip = Trip & { _shareToken: string; _sharePermission: SharePermission };

export default function Home() {
  const router = useRouter();
  const t = useTranslations("home");
  const tCommon = useTranslations("common");
  const { trips } = useAllTrips();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [sharedTrips, setSharedTrips] = useState<SharedTrip[]>([]);

  useEffect(() => {
    fetchTripsSharedWithMe().then(setSharedTrips);
  }, []);

  return (
    <div className="min-h-screen min-w-0 max-w-full overflow-x-clip bg-[#121212] text-white">
      <Sidebar />

      {/* pb-24 = clearance for mobile bottom nav; lg resets to normal */}
      <main className="mx-auto min-w-0 max-w-6xl px-4 py-6 pb-24 sm:px-5 sm:py-8 lg:ml-80 lg:pb-10">
        {/* ── Hero ──────────────────────────────────────────────────────── */}
        <header className="animate-fade-in-up">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-emerald-400/70">
            {t("kicker")}
          </p>
          <h1 className="mt-2 text-3xl font-bold leading-tight tracking-tight text-white sm:text-4xl">
            {t("title")}
          </h1>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-white/50">
            {t("subtitle")}
          </p>
        </header>

        {/* ── Trip cards ────────────────────────────────────────────────── */}
        <section className="mt-10 min-w-0 overflow-x-clip">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-base font-semibold text-white">
              {t("availableTrips")}
            </h2>
            <div className="flex items-center gap-2">
              <span className="rounded-full border border-white/6 bg-white/30 px-3 py-1 text-[11px] font-medium text-white/50">
                {t("tripsBadge", { count: trips.length })}
              </span>
              <button
                type="button"
                onClick={() => setDialogOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500 px-3.5 py-1.5 text-[12px] font-semibold text-emerald-950 transition hover:bg-emerald-400"
              >
                <span className="text-base leading-none">+</span> {t("newTrip")}
              </button>
            </div>
          </div>

          <div className="stagger-children mt-4 grid min-w-0 gap-4 md:grid-cols-2">
            {trips.map((trip, i) => (
              <div
                key={trip.id}
                className="min-w-0"
                style={{ "--i": i } as React.CSSProperties}
              >
                <TripCard trip={trip} />
              </div>
            ))}
          </div>
        </section>

        {/* ── Day preview grid ──────────────────────────────────────────── */}
        <section className="mt-12 min-w-0 overflow-x-clip animate-fade-in">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold text-white">
                {t("nextStops")}
              </h3>
              <p className="mt-0.5 text-xs text-white/40">
                {t("nextStopsHint")}
              </p>
            </div>
          </div>

          <div className="mt-4 grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {trips
              .flatMap((t) => t.days.map((d) => ({ trip: t, day: d })))
              .slice(0, 6)
              .map(({ trip, day }) => (
                <a
                  key={day.id}
                  href={`/trip/${trip.id}`}
                  className="group min-w-0 max-w-full touch-manipulation rounded-2xl border border-white/6 bg-white/20 p-4 transition-all duration-200 hover:border-white/10 hover:bg-white/40 active:scale-[0.98]"
                >
                  <div className="flex min-w-0 items-center justify-between gap-3">
                    <p className="min-w-0 truncate text-sm font-semibold text-white">
                      {trip.name}
                    </p>
                    <span className="shrink-0 text-[11px] tabular-nums text-white/40">
                      {day.date}
                    </span>
                  </div>
                  <p className="mt-2 text-sm font-medium text-white/80">
                    {t("day", { day: day.day, title: day.title })}
                  </p>
                  <p className="mt-1.5 line-clamp-2 text-[13px] leading-relaxed text-white/45">
                    {day.summary}
                  </p>
                  <div className="mt-3 flex items-center justify-between">
                    <span className="text-[11px] text-white/35">
                      {tCommon("activitiesCount", { count: day.activities.length })}
                    </span>
                    <span className="text-[11px] font-medium text-emerald-400/60 opacity-0 transition-opacity group-hover:opacity-100">
                      {t("open")}
                    </span>
                  </div>
                </a>
              ))}
          </div>
        </section>
      </main>

      {sharedTrips.length > 0 && (
        <section className="mx-auto mt-12 max-w-6xl px-4 pb-10 sm:px-5 lg:ml-80">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold text-white">
                {t("sharedWithMe")}
              </h3>
              <p className="mt-0.5 text-xs text-white/40">
                {t("sharedWithMeHint")}
              </p>
            </div>
            <span className="rounded-full border border-white/6 bg-white/30 px-3 py-1 text-[11px] font-medium text-white/50">
              {t("sharedBadge", { count: sharedTrips.length })}
            </span>
          </div>

          <div className="mt-4 grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {sharedTrips.map((st) => (
              <Link
                key={st._shareToken}
                href={`/trip/shared/${st._shareToken}`}
                className="group min-w-0 max-w-full touch-manipulation rounded-2xl border border-white/6 bg-white/20 p-4 transition-all duration-200 hover:border-white/10 hover:bg-white/40 active:scale-[0.98]"
              >
                <div className="flex min-w-0 items-center justify-between gap-3">
                  <p className="min-w-0 truncate text-sm font-semibold text-white">
                    {st.name}
                  </p>
                  <span className="shrink-0 rounded-full border border-blue-400/20 bg-blue-500/10 px-2 py-0.5 text-[10px] font-medium text-blue-300">
                    {st._sharePermission === "read"
                      ? t("permissionRead")
                      : t("permissionWrite")}
                  </span>
                </div>
                <p className="mt-1.5 text-xs text-white/50">
                  {st.location} · {st.startDate} → {st.endDate}
                </p>
                <p className="mt-1.5 line-clamp-2 text-[13px] leading-relaxed text-white/45">
                  {st.description}
                </p>
                <div className="mt-3 flex items-center justify-between">
                  <span className="text-[11px] text-white/35">
                    {tCommon("daysCount", { count: st.days.length })}
                  </span>
                  <span className="text-[11px] font-medium text-blue-400/60 opacity-0 transition-opacity group-hover:opacity-100">
                    {t("open")}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      <NewTripDialog
        open={dialogOpen}
        onClose={() => {
          (document.activeElement as HTMLElement | null)?.blur();
          setDialogOpen(false);
        }}
        onCreated={(trip) => {
          (document.activeElement as HTMLElement | null)?.blur();
          setDialogOpen(false);
          router.push(`/trip/${trip.id}`);
        }}
      />
    </div>
  );
}
