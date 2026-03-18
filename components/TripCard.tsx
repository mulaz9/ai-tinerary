import Link from "next/link";
import { Trip } from "../types";
import SafeImage from "./SafeImage";

interface TripProps {
  trip: Trip;
}

const TripCard = ({ trip }: TripProps) => {
  const totalActivities = trip.days.reduce((acc, d) => acc + d.activities.length, 0);
  const firstDay = trip.days[0];

  return (
    <div className="group overflow-hidden rounded-2xl border border-white/[0.06] bg-[#1a1a1a] transition-all duration-200 hover:border-white/10 hover:shadow-lg hover:shadow-black/20">
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
