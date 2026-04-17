"use client";

import Link from "next/link";
import { Trip } from "../types";
import SafeImage from "./SafeImage";
import { removeUserTrip } from "../lib/trips-store";

interface TripProps {
  trip: Trip;
}

const TripCard = ({ trip }: TripProps) => {
  const totalActivities = trip.days.reduce((acc, d) => acc + d.activities.length, 0);
  const firstDay = trip.days[0];

  const handleRemove = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const ok = window.confirm(`Rimuovere il viaggio "${trip.name}"?`);
    if (!ok) return;
    removeUserTrip(trip.id);
  };

  return (
    <div className="group relative overflow-hidden rounded-2xl border border-white/[0.06] bg-[#1a1a1a] transition-all duration-200 hover:border-white/10 hover:shadow-lg hover:shadow-black/20">
      {trip.isUserCreated ? (
        <>
          <span className="absolute left-3 top-3 z-10 rounded-full bg-emerald-500/90 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-950 shadow">
            AI
          </span>
          <button
            type="button"
            onClick={handleRemove}
            aria-label={`Rimuovi ${trip.name}`}
            title="Rimuovi viaggio"
            className="absolute right-3 top-3 z-10 inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-black/50 text-white/70 backdrop-blur transition hover:border-red-400/40 hover:bg-red-500/20 hover:text-red-200"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
              <path d="M10 11v6" />
              <path d="M14 11v6" />
              <path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
            </svg>
          </button>
        </>
      ) : null}

      {/* Cover band */}
      {trip.coverImageUrl ? (
        <div className="relative overflow-hidden">
          <SafeImage
            src={trip.coverImageUrl}
            alt={trip.name}
            className="h-32 w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
            fallbackLabel={trip.name}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#1a1a1a] to-transparent" />
        </div>
      ) : (
        <div className="h-32 w-full bg-gradient-to-br from-emerald-900/20 via-slate-800/50 to-indigo-900/20" />
      )}

      <div className="p-5">
        {/* Title + CTA */}
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="text-lg font-bold tracking-tight text-white">{trip.name}</h2>
            {trip.subtitle ? (
              <p className="mt-1 line-clamp-2 text-[13px] text-white/50">{trip.subtitle}</p>
            ) : null}
          </div>
          <Link
            href={`/trip/${trip.id}`}
            className="shrink-0 rounded-xl bg-white/[0.02] px-3.5 py-2 text-sm font-semibold text-gray-900 shadow-sm transition focus:outline-none focus:ring-2 focus:ring-emerald-300/40"
          >
            Apri
          </Link>
        </div>

        {/* Meta pills */}
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] text-white/45">
          <span className="inline-flex items-center gap-1.5">
            <span className="dot-accent" style={{ width: 5, height: 5 }} />
            {trip.location}
          </span>
          <span>{trip.startDate} → {trip.endDate}</span>
          <span>{trip.days.length} giorni · {totalActivities} attività</span>
        </div>

        {/* First day preview */}
        {firstDay ? (
          <div className="mt-4 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3.5">
            <div className="flex items-center justify-between gap-4">
              <p className="text-sm font-semibold text-white/90">
                Giorno {firstDay.day}: {firstDay.title}
              </p>
              <span className="shrink-0 text-[11px] tabular-nums text-white/35">
                {firstDay.date}
              </span>
            </div>
            <p className="mt-1 line-clamp-2 text-[13px] text-white/45">{firstDay.summary}</p>
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default TripCard;
