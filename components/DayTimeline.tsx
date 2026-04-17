"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  closestCorners,
  pointerWithin,
  rectIntersection,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Activity, Day } from "../types";
import type { WeatherInfo } from "../lib/weather";
import ActivityCard from "./ActivityCard";
import WeatherBadge from "./WeatherBadge";

interface DayTimelineProps {
  days: Day[];
  weatherByDate?: Record<string, WeatherInfo>;
  /** Map of activity id → resolved image URL (used when the activity itself
   * doesn't ship a `photoUrl`). */
  imagesByActivityId?: Record<string, string>;
  /** Called whenever the user removes or reorders activities; receives the
   * fully-resolved next list of days. */
  onChangeDays?: (nextDays: Day[]) => void;
}

// ─────────────────────── Helpers ────────────────────────

/** Find the id of the day containing the given activity id (or null). */
function findDayIdOf(days: Day[], activityId: string): string | null {
  for (const d of days) {
    if (d.activities.some((a) => a.id === activityId)) return d.id;
  }
  return null;
}

/** True when `id` is the droppable id of a day container. */
function isDayContainerId(id: string): boolean {
  return id.startsWith("day:");
}

function dayContainerId(dayId: string): string {
  return `day:${dayId}`;
}

function dayIdFromContainer(id: string): string {
  return id.slice("day:".length);
}

// ─────────────────────── Sortable activity ────────────────────────

interface SortableActivityProps {
  activity: Activity;
  checked: boolean;
  onToggle: (next: boolean) => void;
  onRemove: () => void;
}

function SortableActivity({
  activity,
  checked,
  onToggle,
  onRemove,
}: SortableActivityProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: activity.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div ref={setNodeRef}>
      <ActivityCard
        activity={activity}
        checked={checked}
        onToggle={onToggle}
        onRemove={onRemove}
        dragHandleProps={{ ...attributes, ...listeners }}
        isDragging={isDragging}
        style={style}
      />
    </div>
  );
}

// ─────────────────────── Day droppable wrapper ────────────────────────

interface DayDroppableProps {
  dayId: string;
  isOver: boolean;
  children: React.ReactNode;
}

/** Thin wrapper that registers the day body as a droppable zone so activities
 *  can be dropped at the end of an empty (or any) day, not just onto another
 *  card inside that day. */
function DayDroppable({ dayId, isOver, children }: DayDroppableProps) {
  const { setNodeRef } = useDroppable({ id: dayContainerId(dayId) });
  return (
    <div
      ref={setNodeRef}
      className={`min-h-[60px] rounded-xl p-4 transition-colors ${
        isOver ? "bg-emerald-400/5 ring-1 ring-emerald-400/30" : ""
      }`}
    >
      {children}
    </div>
  );
}

// ─────────────────────── Main component ────────────────────────

const DayTimeline = ({
  days,
  weatherByDate,
  imagesByActivityId,
  onChangeDays,
}: DayTimelineProps) => {
  const allActivityIds = useMemo(
    () => days.flatMap((d) => d.activities.map((a) => a.id)),
    [days],
  );

  const [done, setDone] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    for (const id of allActivityIds) initial[id] = false;
    return initial;
  });

  const [openDays, setOpenDays] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    for (const d of days) initial[d.id] = true;
    return initial;
  });

  // When new days appear (shouldn't happen in this flow but is cheap to
  // support), default them to open.
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

  // ─────────────────────── DnD wiring ────────────────────────

  const sensors = useSensors(
    // Require a small drag distance so single-taps on cards (e.g. on the
    // checkbox or the map link) don't accidentally initiate a drag.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 180, tolerance: 6 },
    }),
  );

  const [activeId, setActiveId] = useState<string | null>(null);
  const [overContainer, setOverContainer] = useState<string | null>(null);

  // Track days we auto-opened during the drag so we can close them again on
  // cancel. (If the user actually drops into one, we leave it open.)
  const autoOpenedRef = useRef<Set<string>>(new Set());

  const activeActivity: Activity | null = useMemo(() => {
    if (!activeId) return null;
    for (const d of days) {
      const hit = d.activities.find((a) => a.id === activeId);
      if (hit) return hit;
    }
    return null;
  }, [activeId, days]);

  /**
   * Custom collision detection: prefer direct pointer-over containers (day
   * panels) for cross-day moves, fall back to closest-corners between cards
   * for within-day reordering. This gives a noticeably smoother feel than
   * a single strategy.
   */
  const collisionDetection: CollisionDetection = (args) => {
    const pointerHits = pointerWithin(args);
    if (pointerHits.length > 0) return pointerHits;
    const rectHits = rectIntersection(args);
    if (rectHits.length > 0) return rectHits;
    return closestCorners(args);
  };

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(String(event.active.id));
  };

  const handleDragOver = (event: DragOverEvent) => {
    const { over } = event;
    const overId = over ? String(over.id) : null;
    if (!overId) {
      setOverContainer(null);
      return;
    }

    const targetDayId = isDayContainerId(overId)
      ? dayIdFromContainer(overId)
      : findDayIdOf(days, overId);

    setOverContainer(targetDayId);

    // Auto-expand the day under the cursor so the user can drop inside it
    // even when it was collapsed when the drag started.
    if (targetDayId && openDays[targetDayId] === false) {
      autoOpenedRef.current.add(targetDayId);
      setOpenDays((prev) => ({ ...prev, [targetDayId]: true }));
    }
  };

  const handleDragCancel = () => {
    // Re-collapse any day we opened purely to hint drop-targets.
    if (autoOpenedRef.current.size > 0) {
      setOpenDays((prev) => {
        const next = { ...prev };
        for (const id of autoOpenedRef.current) next[id] = false;
        return next;
      });
      autoOpenedRef.current.clear();
    }
    setActiveId(null);
    setOverContainer(null);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveId(null);
    setOverContainer(null);
    autoOpenedRef.current.clear();

    const { active, over } = event;
    if (!over || !onChangeDays) return;

    const activeIdStr = String(active.id);
    const overIdStr = String(over.id);

    const sourceDayId = findDayIdOf(days, activeIdStr);
    if (!sourceDayId) return;

    const targetDayId = isDayContainerId(overIdStr)
      ? dayIdFromContainer(overIdStr)
      : findDayIdOf(days, overIdStr);
    if (!targetDayId) return;

    const sourceDay = days.find((d) => d.id === sourceDayId);
    const targetDay = days.find((d) => d.id === targetDayId);
    if (!sourceDay || !targetDay) return;

    const sourceIndex = sourceDay.activities.findIndex(
      (a) => a.id === activeIdStr,
    );
    if (sourceIndex === -1) return;

    // ── Same day → simple reorder ─────────────────────────────────────────
    if (sourceDayId === targetDayId) {
      if (isDayContainerId(overIdStr)) return; // dropped on empty space of same day
      const targetIndex = targetDay.activities.findIndex(
        (a) => a.id === overIdStr,
      );
      if (targetIndex === -1 || sourceIndex === targetIndex) return;

      const nextDays = days.map((d) =>
        d.id === sourceDayId
          ? {
              ...d,
              activities: arrayMove(d.activities, sourceIndex, targetIndex),
            }
          : d,
      );
      onChangeDays(nextDays);
      return;
    }

    // ── Cross-day → remove from source, insert in target ──────────────────
    const moved = sourceDay.activities[sourceIndex];

    const overIndex = isDayContainerId(overIdStr)
      ? targetDay.activities.length
      : targetDay.activities.findIndex((a) => a.id === overIdStr);
    const insertIndex = overIndex === -1 ? targetDay.activities.length : overIndex;

    const nextDays = days.map((d) => {
      if (d.id === sourceDayId) {
        return {
          ...d,
          activities: d.activities.filter((a) => a.id !== activeIdStr),
        };
      }
      if (d.id === targetDayId) {
        const next = [...d.activities];
        next.splice(insertIndex, 0, moved);
        return { ...d, activities: next };
      }
      return d;
    });
    onChangeDays(nextDays);
  };

  // ─────────────────────── Activity removal ────────────────────────

  const handleRemoveActivity = (dayId: string, activityId: string) => {
    if (!onChangeDays) return;
    const nextDays = days.map((d) =>
      d.id === dayId
        ? { ...d, activities: d.activities.filter((a) => a.id !== activityId) }
        : d,
    );
    onChangeDays(nextDays);
  };

  // ─────────────────────── Render ────────────────────────

  return (
    <div className="mt-8 animate-fade-in">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-lg font-semibold text-white">Timeline</h3>
          <p className="text-xs text-white/50">
            Spunta le attività completate · trascina per riordinare o spostare
            tra giorni · stato locale
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

      <DndContext
        sensors={sensors}
        collisionDetection={collisionDetection}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <div className="stagger-children mt-6 space-y-5">
          {days.map((day, idx) => {
            const prog = dayProgress(day);
            const isOpen = !!openDays[day.id];
            const panelId = `day-panel-${day.id}`;
            const isOverThisDay = overContainer === day.id;

            return (
              <section
                key={day.id}
                style={{ "--i": idx } as React.CSSProperties}
                className={`overflow-hidden rounded-2xl border bg-[#161616] transition-colors ${
                  isOverThisDay
                    ? "border-emerald-400/40"
                    : "border-white/[0.06]"
                }`}
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
                    <SortableContext
                      items={day.activities.map((a) => a.id)}
                      strategy={rectSortingStrategy}
                    >
                      <DayDroppable dayId={day.id} isOver={isOverThisDay}>
                        {day.activities.length === 0 ? (
                          <p className="rounded-xl border border-dashed border-white/10 px-3 py-6 text-center text-xs text-white/40">
                            Trascina qui un&apos;attività per spostarla in
                            questo giorno.
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
                                <SortableActivity
                                  key={activity.id}
                                  activity={activityWithPhoto}
                                  checked={!!done[activity.id]}
                                  onToggle={(next) =>
                                    setDone((prev) => ({
                                      ...prev,
                                      [activity.id]: next,
                                    }))
                                  }
                                  onRemove={() =>
                                    handleRemoveActivity(day.id, activity.id)
                                  }
                                />
                              );
                            })}
                          </div>
                        )}
                      </DayDroppable>
                    </SortableContext>
                  </div>
                </div>
              </section>
            );
          })}
        </div>

        <DragOverlay dropAnimation={null}>
          {activeActivity ? (
            <ActivityCard
              activity={
                activeActivity.photoUrl
                  ? activeActivity
                  : imagesByActivityId?.[activeActivity.id]
                    ? {
                        ...activeActivity,
                        photoUrl: imagesByActivityId[activeActivity.id],
                      }
                    : activeActivity
              }
              checked={!!done[activeActivity.id]}
              isDragging
            />
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
};

export default DayTimeline;
