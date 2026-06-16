"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Trip } from "../types";
import SafeImage from "./SafeImage";
import { removeUserTrip } from "../lib/trips-store";
import { getCountryFromLocation } from "../lib/country-flag";
import ShareTripDialog from "./ShareTripDialog";

interface TripProps {
  trip: Trip;
}

const TripCard = ({ trip }: TripProps) => {
  const t = useTranslations("shareDialog");
  const tCommon = useTranslations("common");
  const tHome = useTranslations("home");
  const totalActivities = trip.days.reduce((acc, d) => acc + d.activities.length, 0);
  const firstDay = trip.days[0];
  const country = getCountryFromLocation(trip.location);
  const [shareOpen, setShareOpen] = useState(false);

  const handleRemove = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const ok = window.confirm(t("removeTripConfirm", { name: trip.name }));
    if (!ok) return;
    removeUserTrip(trip.id);
  };

  const handleShare = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setShareOpen(true);
  };

  return (
    <>
      <div className="group relative overflow-hidden rounded-2xl border border-white/[0.06] bg-[#1a1a1a] transition-all duration-200 hover:border-white/10 hover:shadow-lg hover:shadow-black/20 focus-within:ring-2 focus-within:ring-emerald-300/30">
        {/* Stretched link — covers the entire card so a click anywhere on
            it (outside the action buttons) opens the trip. Visually
            invisible; action buttons sit above via higher z-index. */}
        <Link
          href={`/trip/${trip.id}`}
          aria-label={t("openTrip", { name: trip.name })}
          className="absolute inset-0 z-0 cursor-pointer rounded-2xl focus:outline-none"
        >
          <span className="sr-only">{t("openTrip", { name: trip.name })}</span>
        </Link>

        {trip.isUserCreated ? (
          <span className="pointer-events-none absolute left-3 top-3 z-20 rounded-full bg-emerald-500/90 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-950 shadow">
            AI
          </span>
        ) : null}

        {/* Action buttons (top-right corner) */}
        <div className="absolute right-3 top-3 z-20 flex items-center gap-1.5">
          <button
            type="button"
            onClick={handleShare}
            aria-label={t("shareTripOf", { name: trip.name })}
            title={t("shareTrip")}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-black/50 text-white/80 backdrop-blur transition hover:border-emerald-400/40 hover:bg-emerald-500/20 hover:text-emerald-200"
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
              <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
              <polyline points="16 6 12 2 8 6" />
              <line x1="12" y1="2" x2="12" y2="15" />
            </svg>
          </button>
          {trip.isUserCreated ? (
            <button
              type="button"
              onClick={handleRemove}
              aria-label={t("removeTripOf", { name: trip.name })}
              title={t("removeTripTitle")}
              className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-black/50 text-white/70 backdrop-blur transition hover:border-red-400/40 hover:bg-red-500/20 hover:text-red-200"
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
          ) : null}
        </div>

        {/* Cover band (purely visual — clicks pass through to the link) */}
        <div className="pointer-events-none relative">
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
        </div>

        <div className="pointer-events-none relative p-5">
          {/* Title */}
          <h2 className="flex items-center gap-2 text-lg font-bold tracking-tight text-white">
            {country ? (
              <span
                className="text-xl leading-none"
                aria-label={country.code}
                title={country.code}
              >
                {country.flag}
              </span>
            ) : null}
            <span className="min-w-0 truncate">{trip.name}</span>
          </h2>
          {trip.subtitle ? (
            <p className="mt-1 line-clamp-2 text-[13px] text-white/50">
              {trip.subtitle}
            </p>
          ) : null}

          {/* Meta pills */}
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] text-white/45">
            <span className="inline-flex items-center gap-1.5">
              <span className="dot-accent" style={{ width: 5, height: 5 }} />
              {trip.location}
            </span>
            <span>
              {trip.startDate} → {trip.endDate}
            </span>
            <span>
              {tCommon("daysCount", { count: trip.days.length })} ·{" "}
              {tCommon("activitiesCount", { count: totalActivities })}
            </span>
          </div>

          {/* First day preview */}
          {firstDay ? (
            <div className="mt-4 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3.5">
              <div className="flex items-center justify-between gap-4">
                <p className="text-sm font-semibold text-white/90">
                  {tHome("day", { day: firstDay.day, title: firstDay.title })}
                </p>
                <span className="shrink-0 text-[11px] tabular-nums text-white/35">
                  {firstDay.date}
                </span>
              </div>
              <p className="mt-1 line-clamp-2 text-[13px] text-white/45">
                {firstDay.summary}
              </p>
            </div>
          ) : null}
        </div>
      </div>

      <ShareTripDialog
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        tripId={trip.id}
      />
    </>
  );
};

export default TripCard;
