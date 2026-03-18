"use client";

import { useMemo, useState } from "react";
import { Day } from "../types";
import ActivityCard from "./ActivityCard";

interface DayTimelineProps {
  days: Day[];
}

const DayTimeline = ({ days }: DayTimelineProps) => {
  /* ── State: track completed activities ───────────────────────────────── */
  const allActivityIds = useMemo(
    () => days.flatMap((d) => d.activities.map((a) => a.id)),
    [days],
  );

  const [done, setDone] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    for (const id of allActivityIds) initial[id] = false;
    return initial;
  });

  const completedCount = useMemo(
    () => Object.values(done).filter(Boolean).length,
    [done],
  );
  const totalCount = allActivityIds.length;
  const pctGlobal = totalCount ? Math.round((completedCount / totalCount) * 100) : 0;

  /* ── Helper: per-day completion ────────────────────────────────────── */
  const dayProgress = (day: Day) => {
    const total = day.activities.length;
    if (!total) return { done: 0, total: 0, pct: 0 };
    const doneCount = day.activities.filter((a) => done[a.id]).length;
    return { done: doneCount, total, pct: Math.round((doneCount / total) * 100) };
  };

  return (
    <div className="mt-8 animate-fade-in">
      {/* ── Global progress header ──────────────────────────────────── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-lg font-semibold text-white">Timeline</h3>
          <p className="text-xs text-white/50">
            Spunta le attività completate · stato locale (demo)
          </p>
        </div>
        <div className="flex items-center gap-3">
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

      {/* ── Day sections ────────────────────────────────────────────── */}
      <div className="stagger-children mt-6 space-y-5">
        {days.map((day, idx) => {
          const prog = dayProgress(day);

          return (
            <section
              key={day.id}
              style={{ "--i": idx } as React.CSSProperties}
              className="overflow-hidden rounded-2xl border border-white/[0.06] bg-[#161616]"
            >
              {/* ── Day header ───────────────────────────────────────── */}
              <div className="flex flex-col gap-3 border-b border-white/[0.06] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                  {/* Day number badge */}
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-400/10 text-xs font-bold text-emerald-300">
                    {day.day}
                  </span>
                  <div className="min-w-0">
                    <h4 className="text-sm font-semibold text-white">{day.title}</h4>
                    <p className="text-xs text-white/50">{day.date} · {day.summary}</p>
                  </div>
                </div>

                {/* Per-day progress */}
                <div className="flex items-center gap-2 pl-11 sm:pl-0">
                  <div className="h-1 w-16 overflow-hidden rounded-full bg-white/10">
                    <div
                      className="h-full rounded-full bg-emerald-400/80 transition-all duration-500"
                      style={{ width: `${prog.pct}%` }}
                    />
                  </div>
                  <span className="text-[11px] tabular-nums text-white/50">
                    {prog.done}/{prog.total}
                  </span>
                </div>
              </div>

              {/* ── Activity list ────────────────────────────────────── */}
              <div className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-2">
                {day.activities.map((activity) => (
                  <ActivityCard
                    key={activity.id}
                    activity={activity}
                    checked={!!done[activity.id]}
                    onToggle={(next) =>
                      setDone((prev) => ({
                        ...prev,
                        [activity.id]: next,
                      }))
                    }
                  />
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
};

export default DayTimeline;
