"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import type { Activity, TransportInfo } from "../types";
import { buildMapsUrl } from "../lib/maps";
import { buildTimeRange, suggestNextStartTime } from "../lib/activity-time";
import { isDuplicateActivity } from "../lib/activity-dedup";
import { useBodyScrollLock } from "../hooks/useBodyScrollLock";

interface AddActivityDialogProps {
  open: boolean;
  onClose: () => void;
  /** Trip destination, used to disambiguate Google Maps queries. */
  destination: string;
  /** Optional accommodation (origin for directions). */
  accommodation?: string;
  /** Date of the day we're adding to (YYYY-MM-DD), AI context only. */
  dayDate?: string;
  /** Existing activities of the day, used to suggest a sensible default time. */
  existingActivities: Activity[];
  /** All activities in the trip — used to block duplicate POIs. */
  tripActivities?: Activity[];
  /** ID of the day, used to derive a stable activity id. */
  dayId: string;
  onAdd: (activity: Activity) => void;
}

type Mode = "manual" | "ai";

const TRANSPORT_OPTIONS: TransportInfo["mode"][] = [
  "walk",
  "metro",
  "bus",
  "tram",
  "train",
  "ferry",
  "taxi",
];

function newActivityId(dayId: string): string {
  return `${dayId}-a-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 6)}`;
}

export default function AddActivityDialog({
  open,
  onClose,
  destination,
  accommodation,
  dayDate,
  existingActivities,
  tripActivities,
  dayId,
  onAdd,
}: AddActivityDialogProps) {
  const t = useTranslations("addActivity");
  const tCommon = useTranslations("common");
  const tErr = useTranslations("aiErrors");
  const tTransport = useTranslations("transport");
  const locale = useLocale();
  const [mode, setMode] = useState<Mode>("manual");
  const [poi, setPoi] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [startTime, setStartTime] = useState("");
  const [durationMins, setDurationMins] = useState<number>(60);
  const [transportMode, setTransportMode] = useState<TransportInfo["mode"]>("walk");
  const [transportSummary, setTransportSummary] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const firstFieldRef = useRef<HTMLInputElement>(null);

  useBodyScrollLock(open);

  useEffect(() => {
    if (!open) return;
    const suggested = suggestNextStartTime(existingActivities);
    setMode("manual");
    setPoi("");
    setTitle("");
    setDescription("");
    setLocation("");
    setStartTime(suggested);
    setDurationMins(60);
    setTransportMode("walk");
    setTransportSummary("");
    setNotes("");
    setError(null);
    setInfo(null);
    setLoading(false);
    const focusTimer = setTimeout(() => firstFieldRef.current?.focus(), 30);
    return () => clearTimeout(focusTimer);
  }, [open, existingActivities]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !loading) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, loading, onClose]);

  if (!open) return null;

  const dedupPool = tripActivities ?? existingActivities;

  const rejectDuplicate = (candidate: { title: string; location: string }) => {
    if (isDuplicateActivity(candidate, dedupPool)) {
      setError(t("errorDuplicate"));
      return true;
    }
    return false;
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!title.trim()) {
      setError(t("errorNoTitle"));
      return;
    }
    if (!location.trim()) {
      setError(t("errorNoLocation"));
      return;
    }
    if (!startTime) {
      setError(t("errorNoStartTime"));
      return;
    }
    const newActivity: Activity = {
      id: newActivityId(dayId),
      time: buildTimeRange(startTime, durationMins),
      title: title.trim(),
      description: description.trim(),
      location: location.trim(),
      durationMins,
      mapsUrl: buildMapsUrl(location.trim(), {
        destination,
        origin: accommodation,
      }),
      transport: {
        mode: transportMode,
        summary: transportSummary.trim() || tTransport(transportMode),
      },
    };
    if (rejectDuplicate(newActivity)) return;
    onAdd(newActivity);
    onClose();
  };

  const handleAiSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    if (!poi.trim()) {
      setError(t("errorNoPoi"));
      return;
    }
    if (!startTime) {
      setError(t("errorNoStartTime"));
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/generate-activity", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          destination,
          accommodation,
          placeOfInterest: poi.trim(),
          dayDate,
          startTime,
          durationMins,
          notes: notes.trim() || undefined,
          language: locale,
          existingActivities: dedupPool.map((a) => ({
            title: a.title,
            location: a.location,
          })),
        }),
      });
      const data = (await res.json()) as {
        activity?: Omit<Activity, "id">;
        provider?: string;
        providerLabel?: string;
        error?: string;
        code?: string;
        retryAfterSec?: number;
      };
      if (!res.ok || !data.activity) {
        const prov = data.providerLabel ?? tErr("provider");
        let msg = data.error || tCommon("serverError", { status: res.status });
        if (data.code === "rate_limit") {
          const wait = data.retryAfterSec
            ? tErr("retryIn", { sec: data.retryAfterSec })
            : "";
          msg = tErr("rateLimit", { provider: prov, wait });
        } else if (data.code === "bad_request") {
          msg = t("errorDuplicate");
        } else if (data.code === "auth") {
          msg = tErr("authShort", { provider: prov });
        } else if (data.code === "no_provider") {
          msg = tErr("noProviderShort");
        }
        throw new Error(msg);
      }

      const a = data.activity;
      const finalTime = a.time
        ? a.time
        : buildTimeRange(startTime, a.durationMins ?? durationMins);
      const newActivity: Activity = {
        ...a,
        id: newActivityId(dayId),
        time: finalTime,
      };
      if (rejectDuplicate(newActivity)) return;
      onAdd(newActivity);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : tCommon("unknownError"));
    } finally {
      setLoading(false);
    }
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
        onClick={() => !loading && onClose()}
      />

      <form
        onSubmit={mode === "manual" ? handleManualSubmit : handleAiSubmit}
        className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-white/10 bg-[#1a1a1a] shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-white/5 px-5 py-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-emerald-400/70">
              {t("kicker")}
            </p>
            <h2 className="mt-0.5 text-lg font-bold text-white">
              {mode === "manual" ? t("manualTitle") : t("aiTitle")}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="rounded-lg p-2 text-white/50 transition hover:bg-white/5 hover:text-white disabled:opacity-40"
            aria-label={tCommon("close")}
          >
            ✕
          </button>
        </div>

        <div className="border-b border-white/5 bg-white/[0.02] px-5 pt-3">
          <div className="inline-flex rounded-xl border border-white/10 bg-white/[0.02] p-1">
            <button
              type="button"
              onClick={() => setMode("manual")}
              disabled={loading}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                mode === "manual"
                  ? "bg-white/10 text-white"
                  : "text-white/50 hover:text-white/80"
              }`}
            >
              {t("tabManual")}
            </button>
            <button
              type="button"
              onClick={() => setMode("ai")}
              disabled={loading}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                mode === "ai"
                  ? "bg-emerald-500/15 text-emerald-200"
                  : "text-white/50 hover:text-white/80"
              }`}
            >
              {t("tabAI")}
            </button>
          </div>
          <p className="mt-2 pb-3 text-[11px] text-white/40">
            {mode === "manual" ? t("manualHint") : t("aiHint")}
          </p>
        </div>

        <div className="space-y-4 px-5 py-5">
          {mode === "ai" ? (
            <div>
              <label className="block text-[11px] font-medium uppercase tracking-wide text-white/50">
                {t("poi")}
              </label>
              <input
                ref={firstFieldRef}
                type="text"
                value={poi}
                onChange={(e) => setPoi(e.target.value)}
                placeholder={t("poiPlaceholder")}
                className="mt-1.5 w-full rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2.5 text-sm text-white placeholder-white/30 outline-none transition focus:border-emerald-400/40 focus:bg-white/[0.04]"
                disabled={loading}
              />
              <p className="mt-1.5 text-[11px] text-white/35">
                {t("poiHint", { destination })}
              </p>
            </div>
          ) : (
            <>
              <div>
                <label className="block text-[11px] font-medium uppercase tracking-wide text-white/50">
                  {t("titleLabel")}
                </label>
                <input
                  ref={firstFieldRef}
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={t("titlePlaceholder")}
                  className="mt-1.5 w-full rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2.5 text-sm text-white placeholder-white/30 outline-none transition focus:border-emerald-400/40 focus:bg-white/[0.04]"
                  disabled={loading}
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium uppercase tracking-wide text-white/50">
                  {t("locationLabel")}
                </label>
                <input
                  type="text"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder={t("locationPlaceholder", { destination })}
                  className="mt-1.5 w-full rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2.5 text-sm text-white placeholder-white/30 outline-none transition focus:border-emerald-400/40 focus:bg-white/[0.04]"
                  disabled={loading}
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium uppercase tracking-wide text-white/50">
                  {t("descriptionLabel")}
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                  placeholder={t("descriptionPlaceholder")}
                  className="mt-1.5 w-full resize-none rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2.5 text-sm text-white placeholder-white/30 outline-none transition focus:border-emerald-400/40 focus:bg-white/[0.04]"
                  disabled={loading}
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium uppercase tracking-wide text-white/50">
                  {t("transportLabel")}
                </label>
                <div className="mt-1.5 grid grid-cols-2 gap-2 sm:grid-cols-[140px_1fr]">
                  <select
                    value={transportMode}
                    onChange={(e) =>
                      setTransportMode(e.target.value as TransportInfo["mode"])
                    }
                    className="rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2.5 text-sm text-white outline-none transition focus:border-emerald-400/40"
                    disabled={loading}
                  >
                    {TRANSPORT_OPTIONS.map((m) => (
                      <option key={m} value={m} className="bg-[#1a1a1a]">
                        {tTransport(m)}
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    value={transportSummary}
                    onChange={(e) => setTransportSummary(e.target.value)}
                    placeholder={t("transportSummaryPlaceholder")}
                    className="rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2.5 text-sm text-white placeholder-white/30 outline-none transition focus:border-emerald-400/40 focus:bg-white/[0.04]"
                    disabled={loading}
                  />
                </div>
              </div>
            </>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-medium uppercase tracking-wide text-white/50">
                {t("start")}
              </label>
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2.5 text-sm text-white outline-none transition focus:border-emerald-400/40 focus:bg-white/[0.04]"
                disabled={loading}
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium uppercase tracking-wide text-white/50">
                {t("durationMin")}
              </label>
              <input
                type="number"
                min={5}
                step={5}
                value={durationMins}
                onChange={(e) => {
                  const next = Number(e.target.value);
                  setDurationMins(Number.isFinite(next) && next > 0 ? next : 60);
                }}
                className="mt-1.5 w-full rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2.5 text-sm text-white outline-none transition focus:border-emerald-400/40 focus:bg-white/[0.04]"
                disabled={loading}
              />
            </div>
          </div>

          {mode === "ai" ? (
            <div>
              <label className="block text-[11px] font-medium uppercase tracking-wide text-white/50">
                {t("notes")}
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                placeholder={t("notesPlaceholder")}
                className="mt-1.5 w-full resize-none rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2.5 text-sm text-white placeholder-white/30 outline-none transition focus:border-emerald-400/40 focus:bg-white/[0.04]"
                disabled={loading}
              />
            </div>
          ) : null}

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

        <div className="flex items-center justify-end gap-2 border-t border-white/5 bg-white/[0.02] px-5 py-3.5">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="rounded-xl px-3.5 py-2 text-sm font-medium text-white/70 transition hover:bg-white/5 hover:text-white disabled:opacity-40"
          >
            {tCommon("cancel")}
          </button>
          <button
            type="submit"
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? (
              <>
                <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-emerald-950/30 border-t-emerald-950" />
                {tCommon("generating")}
              </>
            ) : mode === "manual" ? (
              tCommon("add")
            ) : (
              tCommon("generateWithAI")
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
