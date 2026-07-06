"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useLocale } from "next-intl";

/**
 * Single inline calendar to pick an arrival→departure date range.
 * First tap selects the start, second tap the end; tapping before the
 * start (or when a full range is already selected) restarts the range.
 * Works on plain YYYY-MM-DD strings to avoid timezone drift.
 */

interface DateRangeCalendarProps {
  /** YYYY-MM-DD or null */
  startDate: string | null;
  /** YYYY-MM-DD or null */
  endDate: string | null;
  onSelect: (start: string, end: string | null) => void;
  disabled?: boolean;
}

function toKey(year: number, month: number, day: number): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${year}-${pad(month + 1)}-${pad(day)}`;
}

export default function DateRangeCalendar({
  startDate,
  endDate,
  onSelect,
  disabled = false,
}: DateRangeCalendarProps) {
  const locale = useLocale();
  const gridRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // #region agent log
    const el = gridRef.current;
    if (!el) return;
    const cs = getComputedStyle(el);
    fetch("/api/debug-89ffaa", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: "89ffaa",
        hypothesisId: "HC4",
        location: "DateRangeCalendar.tsx:grid-measure",
        message: "calendar grid computed style",
        data: {
          display: cs.display,
          gridTemplateColumns: cs.gridTemplateColumns.slice(0, 120),
          gridWidth: el.offsetWidth,
          gridHeight: el.offsetHeight,
          styleSheets: Array.from(document.styleSheets)
            .map((s) => (s.href ? s.href.split("/").pop() : "inline"))
            .slice(0, 10),
          ua: navigator.userAgent.slice(0, 120),
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
  }, []);

  const initial = startDate ? new Date(`${startDate}T12:00`) : new Date();
  const [viewYear, setViewYear] = useState(initial.getFullYear());
  const [viewMonth, setViewMonth] = useState(initial.getMonth());

  // When the range changes from outside (e.g. voice assist fills the form),
  // navigate the calendar to the month of the new start date.
  const startMonthKey = startDate ? startDate.slice(0, 7) : null;
  useEffect(() => {
    if (!startMonthKey) return;
    const [y, m] = startMonthKey.split("-").map(Number);
    setViewYear(y);
    setViewMonth(m - 1);
  }, [startMonthKey]);

  const monthLabel = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        month: "long",
        year: "numeric",
      }).format(new Date(viewYear, viewMonth, 1)),
    [locale, viewYear, viewMonth],
  );

  // Monday-first weekday header (2024-01-01 is a Monday).
  const weekdays = useMemo(() => {
    const fmt = new Intl.DateTimeFormat(locale, { weekday: "narrow" });
    return Array.from({ length: 7 }, (_, i) =>
      fmt.format(new Date(2024, 0, 1 + i)),
    );
  }, [locale]);

  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const firstWeekday = (new Date(viewYear, viewMonth, 1).getDay() + 6) % 7;

  const todayKey = useMemo(() => {
    const now = new Date();
    return toKey(now.getFullYear(), now.getMonth(), now.getDate());
  }, []);

  const shiftMonth = (delta: number) => {
    const d = new Date(viewYear, viewMonth + delta, 1);
    setViewYear(d.getFullYear());
    setViewMonth(d.getMonth());
  };

  const handleDayTap = (dayKey: string) => {
    if (disabled) return;
    if (!startDate || endDate || dayKey < startDate) {
      onSelect(dayKey, null);
    } else {
      onSelect(startDate, dayKey);
    }
  };

  const cells: Array<{ day: number; key: string } | null> = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ day: d, key: toKey(viewYear, viewMonth, d) });
  }

  const navBtnClass =
    "flex h-8 w-8 items-center justify-center rounded-lg text-white/50 transition hover:bg-white/5 hover:text-white disabled:opacity-40";

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
      <div className="flex items-center justify-between pb-2">
        <button
          type="button"
          onClick={() => shiftMonth(-1)}
          disabled={disabled}
          aria-label="←"
          className={navBtnClass}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        <p className="text-sm font-semibold capitalize text-white">{monthLabel}</p>
        <button
          type="button"
          onClick={() => shiftMonth(1)}
          disabled={disabled}
          aria-label="→"
          className={navBtnClass}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M9 6l6 6-6 6" />
          </svg>
        </button>
      </div>

      <div
        ref={gridRef}
        className="text-center"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
          rowGap: "0.25rem",
        }}
      >
        {weekdays.map((w, i) => (
          <span
            key={`${w}-${i}`}
            className="pb-1 text-[10px] font-semibold uppercase text-white/35"
          >
            {w}
          </span>
        ))}
        {cells.map((cell, i) => {
          if (!cell) return <span key={`empty-${i}`} />;
          const isStart = cell.key === startDate;
          const isEnd = cell.key === endDate;
          const inRange =
            !!startDate &&
            !!endDate &&
            cell.key > startDate &&
            cell.key < endDate;
          const isToday = cell.key === todayKey;

          let cls =
            "mx-auto flex h-9 w-9 items-center justify-center rounded-full text-[13px] transition disabled:cursor-not-allowed disabled:opacity-40 ";
          if (isStart || isEnd) {
            cls += "bg-emerald-500 font-semibold text-emerald-950";
          } else if (inRange) {
            cls += "bg-emerald-500/15 text-emerald-100";
          } else {
            cls += "text-white/75 hover:bg-white/10";
            if (isToday) cls += " border border-emerald-400/40";
          }

          return (
            <button
              key={cell.key}
              type="button"
              disabled={disabled}
              onClick={() => handleDayTap(cell.key)}
              className={cls}
            >
              {cell.day}
            </button>
          );
        })}
      </div>
    </div>
  );
}
