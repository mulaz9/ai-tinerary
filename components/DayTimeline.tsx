"use client";

import { useEffect, useMemo, useState } from "react";
import type { Accommodation, Activity, Day, GooglePlaceRating } from "../types";
import type { WeatherInfo } from "../lib/weather";
import ActivityCard from "./ActivityCard";
import WeatherBadge from "./WeatherBadge";
import EditTimeDialog from "./EditTimeDialog";
import AddActivityDialog from "./AddActivityDialog";
import {
  shiftStartTime,
  sortByStartTime,
} from "../lib/activity-time";

interface DayTimelineProps {
  days: Day[];
  weatherByDate?: Record<string, WeatherInfo>;
  /** Map of activity id → resolved image URL (used when the activity itself
   * doesn't ship a `photoUrl`). */
  imagesByActivityId?: Record<string, string>;
  /** Trip destination (Maps disambiguator + AI context). */
  destination: string;
  /** All accommodations on the trip; the one resolved per day drives the
   *  Maps origin and the AI prompt for new activities. */
  accommodations?: Accommodation[];
  /** Called whenever the user removes, re-times or adds an activity. */
  onChangeDays?: (nextDays: Day[]) => void;
  /** Scrolls to the trip map and opens the marker for this activity. */
  onActivityShowOnMap?: (activityId: string) => void;
  ratingForActivity?: (activityId: string) => GooglePlaceRating | undefined;
}

const DayTimeline = ({
  days,
  weatherByDate,
  imagesByActivityId,
  destination,
  accommodations = [],
  onChangeDays,
  onActivityShowOnMap,
  ratingForActivity,
}: DayTimelineProps) => {
  /**
   * Resolves the accommodation a day is associated to: explicit
   * assignment first, falling back to the trip's first accommodation.
   * Used both for the inline badge and for the directions origin sent
   * to the AddActivityDialog.
   */
  const accommodationForDay = (day: Day): Accommodation | undefined => {
    if (accommodations.length === 0) return undefined;
    if (day.accommodationId) {
      const match = accommodations.find((a) => a.id === day.accommodationId);
      if (match) return match;
    }
    return accommodations[0];
  };
  // ── Activities are always rendered sorted by start time ──────────────
  const sortedDays = useMemo(
    () =>
      days.map((d) => ({
        ...d,
        activities: sortByStartTime(d.activities),
      })),
    [days],
  );

  const allActivityIds = useMemo(
    () => sortedDays.flatMap((d) => d.activities.map((a) => a.id)),
    [sortedDays],
  );

  // ── Done-checkboxes (local) ──────────────────────────────────────────
  const [done, setDone] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    for (const id of allActivityIds) initial[id] = false;
    return initial;
  });

  // ── Day expand/collapse state ────────────────────────────────────────
  const [openDays, setOpenDays] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    for (const d of days) initial[d.id] = true;
    return initial;
  });

  useEffect(() => {
    setOpenDays((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const d of days) {
        if (next[d.id] === undefined) {
          next[d.id] = true;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [days]);

  const toggleDay = (dayId: string) =>
    setOpenDays((prev) => ({ ...prev, [dayId]: !prev[dayId] }));

  const allOpen = days.every((d) => openDays[d.id]);
  const setAll = (value: boolean) => {
    const next: Record<string, boolean> = {};
    for (const d of days) next[d.id] = value;
    setOpenDays(next);
  };

  // ── Progress ─────────────────────────────────────────────────────────
  const completedCount = useMemo(
    () => Object.values(done).filter(Boolean).length,
    [done],
  );
  const totalCount = allActivityIds.length;
  const pctGlobal = totalCount
    ? Math.round((completedCount / totalCount) * 100)
    : 0;

  const dayProgress = (day: Day) => {
    const total = day.activities.length;
    if (!total) return { done: 0, total: 0, pct: 0 };
    const doneCount = day.activities.filter((a) => done[a.id]).length;
    return { done: doneCount, total, pct: Math.round((doneCount / total) * 100) };
  };

  // ── Mutations ────────────────────────────────────────────────────────

  const handleRemoveActivity = (dayId: string, activityId: string) => {
    if (!onChangeDays) return;
    const nextDays = days.map((d) =>
      d.id === dayId
        ? { ...d, activities: d.activities.filter((a) => a.id !== activityId) }
        : d,
    );
    onChangeDays(nextDays);
  };

  const handleEditActivityTime = (
    dayId: string,
    activityId: string,
    nextTime: string,
  ) => {
    if (!onChangeDays) return;
    const nextDays = days.map((d) => {
      if (d.id !== dayId) return d;
      const nextActivities = d.activities.map((a) =>
        a.id === activityId ? { ...a, time: nextTime } : a,
      );
      return { ...d, activities: sortByStartTime(nextActivities) };
    });
    onChangeDays(nextDays);
  };

  const handleAddActivity = (dayId: string, activity: Activity) => {
    if (!onChangeDays) return;
    const nextDays = days.map((d) => {
      if (d.id !== dayId) return d;
      const nextActivities = sortByStartTime([...d.activities, activity]);
      return { ...d, activities: nextActivities };
    });
    onChangeDays(nextDays);
  };

  // ── Edit-time + add-activity dialogs ─────────────────────────────────
  const [editTarget, setEditTarget] = useState<
    { dayId: string; activity: Activity } | null
  >(null);
  const [addTarget, setAddTarget] = useState<Day | null>(null);

  const editable = !!onChangeDays;

  return (
    <div className="mt-8 animate-fade-in">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-lg font-semibold text-white">Timeline</h3>
          <p className="text-xs text-white/50">
            Spunta le attività completate · modifica l&apos;orario di
            inizio per riordinarle · aggiungi nuove tappe in qualsiasi
            momento
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setAll(!allOpen)}
            className="rounded-full border border-white/[0.06] bg-white/[0.03] px-3 py-1 text-[11px] font-medium text-white/60 transition hover:bg-white/[0.06] hover:text-white/80"
          >
            {allOpen ? "Comprimi tutto" : "Espandi tutto"}
          </button>
          <div className="h-1.5 w-24 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-emerald-400 transition-all duration-500"
              style={{ width: `${pctGlobal}%` }}
            />
          </div>
          <span className="text-xs font-semibold tabular-nums text-white/70">
            {completedCount}/{totalCount}
          </span>
        </div>
      </div>

      <div className="stagger-children mt-6 space-y-5">
        {sortedDays.map((day, idx) => {
          const prog = dayProgress(day);
          const isOpen = !!openDays[day.id];
          const panelId = `day-panel-${day.id}`;
          const dayAccommodation = accommodationForDay(day);

          return (
            <section
              key={day.id}
              style={{ "--i": idx } as React.CSSProperties}
              className="overflow-hidden rounded-2xl border border-white/[0.06] bg-[#161616] transition-colors"
            >
              <button
                type="button"
                onClick={() => toggleDay(day.id)}
                aria-expanded={isOpen}
                aria-controls={panelId}
                className={`flex w-full flex-col gap-3 px-5 py-4 text-left transition-colors hover:bg-white/[0.02] sm:flex-row sm:items-center sm:justify-between ${
                  isOpen ? "border-b border-white/[0.06]" : ""
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-400/10 text-xs font-bold text-emerald-300">
                    {day.day}
                  </span>
                  <div className="min-w-0">
                    <h4 className="text-sm font-semibold text-white">
                      {day.title}
                    </h4>
                    <p className="text-xs text-white/50">
                      {day.date} · {day.summary}
                    </p>
                    {dayAccommodation ? (
                      <p
                        className="mt-1 inline-flex max-w-full items-center gap-1 truncate text-[11px] text-emerald-300/80"
                        title={dayAccommodation.name}
                      >
                        <span aria-hidden>🏨</span>
                        <span className="truncate">
                          {dayAccommodation.name}
                        </span>
                      </p>
                    ) : null}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 pl-11 sm:pl-0">
                  {weatherByDate?.[day.date] ? (
                    <WeatherBadge info={weatherByDate[day.date]} />
                  ) : null}
                  <div className="h-1 w-16 overflow-hidden rounded-full bg-white/10">
                    <div
                      className="h-full rounded-full bg-emerald-400/80 transition-all duration-500"
                      style={{ width: `${prog.pct}%` }}
                    />
                  </div>
                  <span className="text-[11px] tabular-nums text-white/50">
                    {prog.done}/{prog.total}
                  </span>
                  <svg
                    aria-hidden
                    viewBox="0 0 20 20"
                    className={`ml-1 h-4 w-4 shrink-0 text-white/40 transition-transform duration-300 ${
                      isOpen ? "rotate-180" : "rotate-0"
                    }`}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M6 8l4 4 4-4" />
                  </svg>
                </div>
              </button>

              <div
                id={panelId}
                role="region"
                aria-hidden={!isOpen}
                className={`grid transition-[grid-template-rows,opacity] duration-300 ease-in-out ${
                  isOpen
                    ? "grid-rows-[1fr] opacity-100"
                    : "grid-rows-[0fr] opacity-0"
                }`}
              >
                <div className="min-h-0 overflow-hidden">
                  <div className="space-y-4 p-4">
                    {editable ? (
                      <button
                        type="button"
                        onClick={() => setAddTarget(day)}
                        className="group flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-white/10 bg-white/[0.02] px-3 py-3 text-xs font-medium text-white/50 transition hover:border-emerald-400/30 hover:bg-emerald-500/5 hover:text-emerald-200"
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
                          <path d="M12 5v14" />
                          <path d="M5 12h14" />
                        </svg>
                        Aggiungi attività a {day.title}
                      </button>
                    ) : null}

                    {day.activities.length === 0 ? (
                      <p className="rounded-xl border border-dashed border-white/10 px-3 py-6 text-center text-xs text-white/40">
                        Nessuna attività in questo giorno. Aggiungine una con il
                        pulsante qui sopra.
                      </p>
                    ) : (
                      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-2">
                        {day.activities.map((activity) => {
                          const resolvedPhoto =
                            activity.photoUrl ??
                            imagesByActivityId?.[activity.id];
                          const activityWithPhoto = resolvedPhoto
                            ? { ...activity, photoUrl: resolvedPhoto }
                            : activity;
                          return (
                            <ActivityCard
                              key={activity.id}
                              activity={activityWithPhoto}
                              checked={!!done[activity.id]}
                              onToggle={(next) =>
                                setDone((prev) => ({
                                  ...prev,
                                  [activity.id]: next,
                                }))
                              }
                              onRemove={
                                editable
                                  ? () =>
                                      handleRemoveActivity(day.id, activity.id)
                                  : undefined
                              }
                              onEditTime={
                                editable
                                  ? () =>
                                      setEditTarget({
                                        dayId: day.id,
                                        activity,
                                      })
                                  : undefined
                              }
                              onShowOnMap={
                                onActivityShowOnMap
                                  ? () => onActivityShowOnMap(activity.id)
                                  : undefined
                              }
                              placeRating={ratingForActivity?.(activity.id)}
                            />
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </section>
          );
        })}
      </div>

      <EditTimeDialog
        open={!!editTarget}
        onClose={() => setEditTarget(null)}
        title={editTarget?.activity.title ?? ""}
        currentTime={editTarget?.activity.time}
        durationMins={editTarget?.activity.durationMins}
        onSave={(nextTime) => {
          if (!editTarget) return;
          // Preserve duration when the user only entered a start time.
          const finalTime = nextTime.includes("–")
            ? nextTime
            : shiftStartTime(
                editTarget.activity.time,
                nextTime,
                editTarget.activity.durationMins,
              );
          handleEditActivityTime(
            editTarget.dayId,
            editTarget.activity.id,
            finalTime,
          );
        }}
      />

      <AddActivityDialog
        open={!!addTarget}
        onClose={() => setAddTarget(null)}
        destination={destination}
        accommodation={
          addTarget ? accommodationForDay(addTarget)?.name : undefined
        }
        dayDate={addTarget?.date}
        existingActivities={addTarget?.activities ?? []}
        dayId={addTarget?.id ?? ""}
        onAdd={(activity) => {
          if (!addTarget) return;
          handleAddActivity(addTarget.id, activity);
        }}
      />
    </div>
  );
};

export default DayTimeline;
