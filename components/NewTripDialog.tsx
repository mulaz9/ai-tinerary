"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Trip } from "../types";
import { addUserTrip, MAX_USER_TRIPS, useAllTrips } from "../lib/trips-store";
import VoiceTripFormAssist, {
  type VoiceTripFormFields,
} from "./VoiceTripFormAssist";
import DateRangeCalendar from "./DateRangeCalendar";

interface NewTripDialogProps {
  open: boolean;
  onClose: () => void;
  onCreated?: (trip: Trip) => void;
}

function defaultArrival(): string {
  const d = new Date();
  d.setDate(d.getDate() + 14);
  d.setHours(10, 0, 0, 0);
  return toDateTimeLocal(d);
}

function defaultDeparture(): string {
  const d = new Date();
  d.setDate(d.getDate() + 18);
  d.setHours(18, 0, 0, 0);
  return toDateTimeLocal(d);
}

function toDateTimeLocal(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}

/** "2026-07-08" → e.g. "mer 8 lug" in the active locale (no TZ drift). */
function formatDayLabel(dateKey: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(new Date(`${dateKey}T12:00`));
}

const NewTripDialog = ({ open, onClose, onCreated }: NewTripDialogProps) => {
  const t = useTranslations("newTrip");
  const tErr = useTranslations("aiErrors");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const LIMIT_MESSAGE = t("limitReached", { max: MAX_USER_TRIPS });
  const [destination, setDestination] = useState("");
  // One row per accommodation. We always render at least one (possibly
  // empty) input — the trip can still be created without any.
  const [accommodations, setAccommodations] = useState<string[]>([""]);
  const [arrival, setArrival] = useState(defaultArrival);
  const [departure, setDeparture] = useState(defaultDeparture);
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const firstFieldRef = useRef<HTMLInputElement>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { trips, hydrated } = useAllTrips();
  const atLimit = hydrated && trips.length >= MAX_USER_TRIPS;

  useEffect(() => {
    return () => {
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    };
  }, []);

  const closeDialog = () => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    (document.activeElement as HTMLElement | null)?.blur();
    onClose();
  };

  const updateAccommodation = (idx: number, value: string) =>
    setAccommodations((prev) => prev.map((a, i) => (i === idx ? value : a)));
  const addAccommodation = () =>
    setAccommodations((prev) => [...prev, ""]);
  const removeAccommodation = (idx: number) =>
    setAccommodations((prev) =>
      prev.length <= 1 ? [""] : prev.filter((_, i) => i !== idx),
    );

  const handleVoiceApply = (fields: VoiceTripFormFields) => {
    if (fields.destination) setDestination(fields.destination);
    if (fields.arrival) setArrival(fields.arrival);
    if (fields.departure) setDeparture(fields.departure);
    if (fields.accommodations?.length) {
      setAccommodations(fields.accommodations);
    }
    if (fields.notes) setNotes(fields.notes);
  };

  useEffect(() => {
    if (!open) return;
    setError(null);
    setInfo(null);
    const focusTimer = setTimeout(() => firstFieldRef.current?.focus(), 50);
    return () => clearTimeout(focusTimer);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !loading) closeDialog();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, loading, onClose]);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setError(null);

    setInfo(null);
    if (atLimit) {
      setError(LIMIT_MESSAGE);
      return;
    }
    if (!destination.trim()) {
      setError(t("errorNoDestination"));
      return;
    }
    if (!arrival || !departure) {
      setError(t("errorNoDates"));
      return;
    }
    if (arrival >= departure) {
      setError(t("errorDateOrder"));
      return;
    }

    setLoading(true);
    try {
      const cleanedAccommodations = accommodations
        .map((a) => a.trim())
        .filter(Boolean);
      const res = await fetch("/api/generate-trip", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          destination: destination.trim(),
          accommodation: cleanedAccommodations[0],
          accommodations:
            cleanedAccommodations.length > 0 ? cleanedAccommodations : undefined,
          arrival,
          departure,
          notes: notes.trim() || undefined,
          language: locale,
        }),
      });

      const data = (await res.json()) as {
        trip?: Trip;
        provider?: string;
        providerLabel?: string;
        fellBack?: boolean;
        error?: string;
        code?: string;
        retryAfterSec?: number;
      };
      if (!res.ok || !data.trip) {
        const prov = data.providerLabel ?? tErr("provider");
        let msg = data.error || tCommon("serverError", { status: res.status });
        if (data.code === "rate_limit") {
          const wait = data.retryAfterSec
            ? tErr("retryIn", { sec: data.retryAfterSec })
            : tErr("addKeyHint");
          msg = tErr("rateLimit", { provider: prov, wait });
        } else if (data.code === "auth") {
          msg = tErr("auth", { provider: prov });
        } else if (data.code === "no_provider") {
          msg = tErr("noProvider");
        } else if (data.code === "model_not_found") {
          msg = tErr("modelNotFound", {
            error: data.error ?? tErr("modelNotFoundDefault"),
          });
        }
        throw new Error(msg);
      }

      const saved = addUserTrip(data.trip);
      if (!saved) {
        setError(LIMIT_MESSAGE);
        return;
      }

      setDestination("");
      setAccommodations([""]);
      setNotes("");
      setArrival(defaultArrival());
      setDeparture(defaultDeparture());

      if (onCreated) {
        onCreated(data.trip);
        return;
      }

      if (data.fellBack && data.provider) {
        setInfo(
          t("fellBack", { provider: data.providerLabel ?? "AI" }),
        );
        closeTimerRef.current = setTimeout(() => closeDialog(), 800);
      } else {
        closeDialog();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : tCommon("unknownError"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto overscroll-contain [-webkit-overflow-scrolling:touch]"
      aria-modal="true"
      role="dialog"
    >
      <button
        type="button"
        aria-label={tCommon("close")}
        className="fixed inset-0 bg-black/70 backdrop-blur-sm"
        onClick={() => !loading && closeDialog()}
      />

      <div className="relative flex min-h-full justify-center p-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))]">
        <form
          onSubmit={handleSubmit}
          className="relative z-10 my-auto w-full max-w-lg overflow-hidden rounded-2xl border border-white/10 bg-[#1a1a1a] shadow-2xl"
        >
        <div className="flex shrink-0 items-center justify-between border-b border-white/5 px-5 py-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-emerald-400/70">
              {t("kicker")}
            </p>
            <h2 className="mt-0.5 text-lg font-bold text-white">
              {t("title")}
            </h2>
          </div>
          <button
            type="button"
            onClick={closeDialog}
            disabled={loading}
            className="rounded-lg p-2 text-white/50 transition hover:bg-white/5 hover:text-white disabled:opacity-40"
            aria-label={tCommon("close")}
          >
            ✕
          </button>
        </div>

        <div className="space-y-4 px-5 py-5">
          {atLimit ? (
            <div className="rounded-xl border border-amber-400/20 bg-amber-500/10 px-3 py-2.5 text-[13px] text-amber-200">
              {LIMIT_MESSAGE}
            </div>
          ) : null}

          <VoiceTripFormAssist
            disabled={loading || atLimit}
            onApply={handleVoiceApply}
          />

          <div>
            <label className="block text-[11px] font-medium uppercase tracking-wide text-white/50">
              {t("destination")}
            </label>
            <input
              ref={firstFieldRef}
              type="text"
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
              placeholder={t("destinationPlaceholder")}
              className="mt-1.5 w-full rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2.5 text-sm text-white placeholder-white/30 outline-none transition focus:border-emerald-400/40 focus:bg-white/[0.04]"
              disabled={loading}
            />
          </div>

          <div>
            <label className="block text-[11px] font-medium uppercase tracking-wide text-white/50">
              {t("accommodations")}{" "}
              <span className="text-white/30 normal-case tracking-normal">
                {t("accommodationsOptional")}
              </span>
            </label>
            <div className="mt-1.5 space-y-2">
              {accommodations.map((value, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={value}
                    onChange={(e) => updateAccommodation(idx, e.target.value)}
                    placeholder={
                      idx === 0
                        ? t("firstAccommodationPlaceholder")
                        : t("otherAccommodationPlaceholder")
                    }
                    className="w-full rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2.5 text-sm text-white placeholder-white/30 outline-none transition focus:border-emerald-400/40 focus:bg-white/[0.04]"
                    disabled={loading}
                  />
                  {accommodations.length > 1 ? (
                    <button
                      type="button"
                      onClick={() => removeAccommodation(idx)}
                      disabled={loading}
                      aria-label={tCommon("removeAccommodation")}
                      className="rounded-lg border border-white/10 bg-white/[0.02] px-2.5 py-2.5 text-white/40 transition hover:border-red-400/30 hover:bg-red-500/10 hover:text-red-300 disabled:opacity-40"
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
                        <path d="M5 12h14" />
                      </svg>
                    </button>
                  ) : null}
                </div>
              ))}
              <button
                type="button"
                onClick={addAccommodation}
                disabled={loading}
                className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-white/10 bg-white/[0.02] px-3 py-1.5 text-xs font-medium text-white/50 transition hover:border-emerald-400/30 hover:bg-emerald-500/5 hover:text-emerald-200 disabled:opacity-40"
              >
                <svg
                  width="12"
                  height="12"
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
                {tCommon("addAccommodation")}
              </button>
            </div>
            <p className="mt-1.5 text-[11px] text-white/35">
              {t("accommodationsHint")}
            </p>
          </div>

          <div>
            <label className="block text-[11px] font-medium uppercase tracking-wide text-white/50">
              {t("dates")}
            </label>
            <p className="mt-1 text-[11px] text-white/35">{t("datesHint")}</p>
            <div className="mt-1.5">
              <DateRangeCalendar
                startDate={arrival ? arrival.slice(0, 10) : null}
                endDate={departure ? departure.slice(0, 10) : null}
                onSelect={(start, end) => {
                  setArrival(`${start}T${arrival.slice(11, 16) || "10:00"}`);
                  setDeparture(
                    end ? `${end}T${departure.slice(11, 16) || "18:00"}` : "",
                  );
                }}
                disabled={loading}
              />
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-[11px] font-medium uppercase tracking-wide text-white/50">
                  {t("arrival")}
                  {arrival ? (
                    <span className="ml-1.5 normal-case tracking-normal text-emerald-300/80">
                      {formatDayLabel(arrival.slice(0, 10), locale)}
                    </span>
                  ) : null}
                </label>
                <input
                  type="time"
                  value={arrival.slice(11, 16)}
                  onChange={(e) =>
                    arrival &&
                    setArrival(`${arrival.slice(0, 10)}T${e.target.value}`)
                  }
                  className="mt-1.5 w-full rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2.5 text-sm text-white outline-none transition focus:border-emerald-400/40 focus:bg-white/[0.04]"
                  disabled={loading || !arrival}
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium uppercase tracking-wide text-white/50">
                  {t("departure")}
                  {departure ? (
                    <span className="ml-1.5 normal-case tracking-normal text-emerald-300/80">
                      {formatDayLabel(departure.slice(0, 10), locale)}
                    </span>
                  ) : null}
                </label>
                <input
                  type="time"
                  value={departure.slice(11, 16)}
                  onChange={(e) =>
                    departure &&
                    setDeparture(`${departure.slice(0, 10)}T${e.target.value}`)
                  }
                  className="mt-1.5 w-full rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2.5 text-sm text-white outline-none transition focus:border-emerald-400/40 focus:bg-white/[0.04]"
                  disabled={loading || !departure}
                />
              </div>
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-medium uppercase tracking-wide text-white/50">
              {t("notes")}
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder={t("notesPlaceholder")}
              className="mt-1.5 w-full resize-none rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2.5 text-sm text-white placeholder-white/30 outline-none transition focus:border-emerald-400/40 focus:bg-white/[0.04]"
              disabled={loading}
            />
          </div>

          {error ? (
            <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2.5 text-[13px] text-red-300">
              {error}
            </div>
          ) : null}

          {info ? (
            <div className="rounded-xl border border-emerald-400/20 bg-emerald-500/10 px-3 py-2.5 text-[13px] text-emerald-200">
              {info}
            </div>
          ) : null}
        </div>

        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-white/5 bg-white/[0.02] px-5 py-3.5">
          <button
            type="button"
            onClick={closeDialog}
            disabled={loading}
            className="rounded-xl px-3.5 py-2 text-sm font-medium text-white/70 transition hover:bg-white/5 hover:text-white disabled:opacity-40"
          >
            {tCommon("cancel")}
          </button>
          <button
            type="submit"
            disabled={loading || atLimit}
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? (
              <>
                <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-emerald-950/30 border-t-emerald-950" />
                {tCommon("generating")}
              </>
            ) : (
              <>{tCommon("generateWithAI")}</>
            )}
          </button>
        </div>
      </form>
      </div>
    </div>
  );
};

export default NewTripDialog;
