"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  formatTimeRange,
  parseTimeRange,
  shiftStartTime,
  timeToMinutes,
} from "../lib/activity-time";
import { useBodyScrollLock } from "../hooks/useBodyScrollLock";

interface EditTimeDialogProps {
  open: boolean;
  onClose: () => void;
  /** Activity title to display in the header. */
  title: string;
  /** Current `time` field of the activity. */
  currentTime?: string;
  /** Activity's known duration; used to recompute the end time when the user
   *  doesn't manually edit it. */
  durationMins?: number;
  onSave: (nextTime: string) => void;
}

export default function EditTimeDialog({
  open,
  onClose,
  title,
  currentTime,
  durationMins,
  onSave,
}: EditTimeDialogProps) {
  const t = useTranslations("editTime");
  const tCommon = useTranslations("common");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [touchedEnd, setTouchedEnd] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const startRef = useRef<HTMLInputElement>(null);

  useBodyScrollLock(open);

  useEffect(() => {
    if (!open) return;
    const parsed = parseTimeRange(currentTime);
    setStart(parsed.start ?? "");
    setEnd(parsed.end ?? "");
    setTouchedEnd(false);
    setError(null);
    const focusTimer = setTimeout(() => startRef.current?.focus(), 30);
    return () => clearTimeout(focusTimer);
  }, [open, currentTime]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // When the user changes the start time without touching the end,
  // auto-shift the end to preserve the original duration so the suggested
  // range stays consistent.
  useEffect(() => {
    if (!open || touchedEnd) return;
    if (!start) return;
    const newRange = shiftStartTime(currentTime, start, durationMins);
    const parsed = parseTimeRange(newRange);
    setEnd(parsed.end ?? "");
  }, [start, open, touchedEnd, currentTime, durationMins]);

  if (!open) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const startMin = timeToMinutes(start);
    if (startMin === null) {
      setError(t("errorInvalidStart"));
      return;
    }
    if (end) {
      const endMin = timeToMinutes(end);
      if (endMin === null) {
        setError(t("errorInvalidEnd"));
        return;
      }
      if (endMin <= startMin) {
        setError(t("errorEndBeforeStart"));
        return;
      }
    }
    onSave(formatTimeRange(start, end || null));
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      aria-modal="true"
      role="dialog"
    >
      <button
        type="button"
        aria-label={tCommon("close")}
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />
      <form
        onSubmit={handleSubmit}
        className="relative w-full max-w-sm overflow-hidden rounded-2xl border border-white/10 bg-[#1a1a1a] shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-white/5 px-5 py-4">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-emerald-400/70">
              {t("kicker")}
            </p>
            <h2 className="mt-0.5 truncate text-sm font-bold text-white">
              {title}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-white/50 transition hover:bg-white/5 hover:text-white"
            aria-label={tCommon("close")}
          >
            ✕
          </button>
        </div>

        <div className="space-y-4 px-5 py-5">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-medium uppercase tracking-wide text-white/50">
                {t("start")}
              </label>
              <input
                ref={startRef}
                type="time"
                value={start}
                onChange={(e) => setStart(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2.5 text-sm text-white outline-none transition focus:border-emerald-400/40 focus:bg-white/[0.04]"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium uppercase tracking-wide text-white/50">
                {t("end")}{" "}
                <span className="text-white/30 normal-case tracking-normal">
                  {t("endOptional")}
                </span>
              </label>
              <input
                type="time"
                value={end}
                onChange={(e) => {
                  setTouchedEnd(true);
                  setEnd(e.target.value);
                }}
                className="mt-1.5 w-full rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2.5 text-sm text-white outline-none transition focus:border-emerald-400/40 focus:bg-white/[0.04]"
              />
            </div>
          </div>

          <p className="text-[11px] text-white/40">{t("hint")}</p>

          {error ? (
            <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2.5 text-[13px] text-red-300">
              {error}
            </div>
          ) : null}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-white/5 bg-white/[0.02] px-5 py-3.5">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl px-3.5 py-2 text-sm font-medium text-white/70 transition hover:bg-white/5 hover:text-white"
          >
            {tCommon("cancel")}
          </button>
          <button
            type="submit"
            className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-400"
          >
            {tCommon("save")}
          </button>
        </div>
      </form>
    </div>
  );
}
