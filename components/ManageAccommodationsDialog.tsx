"use client";

import { useEffect, useMemo, useState } from "react";
import type { Accommodation, Day, Trip } from "../types";

interface ManageAccommodationsDialogProps {
  /**
   * The dialog is always rendered when mounted; the parent decides when
   * to mount it via conditional rendering. This guarantees the initial
   * state is always seeded correctly from the `trip` prop without a
   * "blank flash" between mount and effect.
   */
  onClose: () => void;
  trip: Trip;
  /** Called with the updated trip when the user clicks "Salva". */
  onSave: (next: Trip) => void;
}

/**
 * Local working copy of the trip's accommodations. We don't mutate the
 * trip until the user clicks "Salva" so dialog state can be reset by
 * closing without saving. Each entry has a stable `id` (preserved from
 * the original trip when present) so day assignments survive renames.
 */
interface DraftAccommodation {
  id: string;
  name: string;
}

/** Generates a fresh accommodation id that doesn't collide with `used`. */
function nextId(used: Set<string>): string {
  let i = 1;
  while (used.has(`acc-${i}`)) i++;
  used.add(`acc-${i}`);
  return `acc-${i}`;
}

/** Builds the initial accommodations list from a trip. */
function seedDrafts(trip: Trip): DraftAccommodation[] {
  if (trip.accommodations && trip.accommodations.length > 0) {
    return trip.accommodations.map((a) => ({ id: a.id, name: a.name }));
  }
  const legacy = trip.accommodation?.trim();
  return legacy ? [{ id: "acc-1", name: legacy }] : [];
}

/** Builds the initial day-to-accommodation assignments map. */
function seedAssignments(trip: Trip): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  for (const day of trip.days) out[day.id] = day.accommodationId ?? null;
  return out;
}

export default function ManageAccommodationsDialog({
  onClose,
  trip,
  onSave,
}: ManageAccommodationsDialogProps) {
  // Working copies — seeded once on mount via the lazy `useState` form
  // so the very first render of the dialog already reflects the trip.
  const [drafts, setDrafts] = useState<DraftAccommodation[]>(() =>
    seedDrafts(trip),
  );
  /** Day id → assigned accommodation id (or `null` for "no accommodation"). */
  const [assignments, setAssignments] = useState<Record<string, string | null>>(
    () => seedAssignments(trip),
  );
  const [error, setError] = useState<string | null>(null);

  // ── Mutations on the drafts ─────────────────────────────────────────

  const addRow = () =>
    setDrafts((prev) => {
      const used = new Set(prev.map((p) => p.id));
      return [...prev, { id: nextId(used), name: "" }];
    });

  const removeRow = (id: string) =>
    setDrafts((prev) => prev.filter((p) => p.id !== id));

  const renameRow = (id: string, name: string) =>
    setDrafts((prev) => prev.map((p) => (p.id === id ? { ...p, name } : p)));

  const assignDay = (dayId: string, accommodationId: string | null) =>
    setAssignments((prev) => ({ ...prev, [dayId]: accommodationId }));

  // ── Save / close ────────────────────────────────────────────────────

  const validIds = useMemo(
    () => new Set(drafts.filter((d) => d.name.trim()).map((d) => d.id)),
    [drafts],
  );

  const handleSave = () => {
    setError(null);

    const cleaned: Accommodation[] = drafts
      .map((d) => ({ id: d.id, name: d.name.trim() }))
      .filter((d) => d.name.length > 0);

    // Deduplicate by name (case-insensitive) — keep the first occurrence.
    const seenNames = new Set<string>();
    const deduped: Accommodation[] = [];
    for (const a of cleaned) {
      const key = a.name.toLowerCase();
      if (seenNames.has(key)) continue;
      seenNames.add(key);
      deduped.push(a);
    }

    const dedupedIds = new Set(deduped.map((a) => a.id));
    const nextDays: Day[] = trip.days.map((day) => {
      const assigned = assignments[day.id];
      const next = assigned && dedupedIds.has(assigned) ? assigned : undefined;
      if (next === day.accommodationId) return day;
      // Preserve all other day fields verbatim.
      const { accommodationId: _drop, ...rest } = day;
      void _drop;
      return next ? { ...rest, accommodationId: next } : rest;
    });

    const nextTrip: Trip = {
      ...trip,
      accommodations: deduped.length > 0 ? deduped : undefined,
      // Mirror the legacy single-string field on the first item so any
      // residual UI still reading it keeps working.
      accommodation: deduped[0]?.name,
      days: nextDays,
    };
    onSave(nextTrip);
    onClose();
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      aria-modal="true"
      role="dialog"
    >
      <button
        type="button"
        aria-label="Chiudi"
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />

      <div className="relative flex max-h-[90vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#1a1a1a] shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/5 px-5 py-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-emerald-400/70">
              Alloggi
            </p>
            <h2 className="mt-0.5 text-lg font-bold text-white">
              Gestisci alloggi
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-white/50 transition hover:bg-white/5 hover:text-white"
            aria-label="Chiudi"
          >
            ✕
          </button>
        </div>

        <div className="space-y-5 overflow-y-auto px-5 py-5">
          {/* Accommodations list */}
          <div>
            <div className="flex items-center justify-between">
              <label className="block text-[11px] font-medium uppercase tracking-wide text-white/50">
                I tuoi alloggi
              </label>
              <span className="text-[11px] text-white/35">
                {drafts.filter((d) => d.name.trim()).length} totali
              </span>
            </div>
            <div className="mt-2 space-y-2">
              {drafts.length === 0 ? (
                <p className="rounded-xl border border-dashed border-white/10 px-3 py-4 text-center text-xs text-white/40">
                  Nessun alloggio. Aggiungine uno per associarlo ai giorni.
                </p>
              ) : (
                drafts.map((d) => (
                  <div key={d.id} className="flex items-center gap-2">
                    <span className="shrink-0 rounded-lg bg-emerald-400/10 px-2 py-1.5 text-[11px] font-bold text-emerald-300">
                      {d.id.replace("acc-", "#")}
                    </span>
                    <input
                      type="text"
                      value={d.name}
                      onChange={(e) => renameRow(d.id, e.target.value)}
                      placeholder="Es. Hotel Lisboa Plaza"
                      className="w-full rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2 text-sm text-white placeholder-white/30 outline-none transition focus:border-emerald-400/40 focus:bg-white/[0.04]"
                    />
                    <button
                      type="button"
                      onClick={() => removeRow(d.id)}
                      aria-label="Rimuovi alloggio"
                      className="rounded-lg border border-white/10 bg-white/[0.02] px-2 py-2 text-white/40 transition hover:border-red-400/30 hover:bg-red-500/10 hover:text-red-300"
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
                  </div>
                ))
              )}
              <button
                type="button"
                onClick={addRow}
                className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-white/10 bg-white/[0.02] px-3 py-1.5 text-xs font-medium text-white/50 transition hover:border-emerald-400/30 hover:bg-emerald-500/5 hover:text-emerald-200"
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
                Aggiungi alloggio
              </button>
            </div>
          </div>

          {/* Day-to-accommodation assignment */}
          <div>
            <label className="block text-[11px] font-medium uppercase tracking-wide text-white/50">
              Assegna i giorni
            </label>
            <p className="mt-1 text-[11px] text-white/35">
              Per ogni giorno, scegli l&apos;alloggio in cui dormi quella
              notte. Se non lo specifichi viene usato il primo della lista.
            </p>
            <div className="mt-2 space-y-1.5">
              {trip.days.map((day) => {
                const current = assignments[day.id] ?? null;
                const currentValid =
                  current !== null && validIds.has(current) ? current : "";
                return (
                  <div
                    key={day.id}
                    className="flex flex-wrap items-center gap-2 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2"
                  >
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-emerald-400/10 text-[11px] font-bold text-emerald-300">
                      {day.day}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-xs text-white/70">
                      {day.title}{" "}
                      <span className="text-white/35">· {day.date}</span>
                    </span>
                    <select
                      value={currentValid}
                      onChange={(e) =>
                        assignDay(day.id, e.target.value || null)
                      }
                      className="ml-auto rounded-lg border border-white/10 bg-white/[0.02] px-2 py-1.5 text-xs text-white outline-none transition focus:border-emerald-400/40"
                    >
                      <option value="" className="bg-[#1a1a1a]">
                        — nessuno —
                      </option>
                      {drafts
                        .filter((d) => d.name.trim())
                        .map((d) => (
                          <option
                            key={d.id}
                            value={d.id}
                            className="bg-[#1a1a1a]"
                          >
                            {d.name.trim()}
                          </option>
                        ))}
                    </select>
                  </div>
                );
              })}
            </div>
          </div>

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
            Annulla
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-400"
          >
            Salva
          </button>
        </div>
      </div>
    </div>
  );
}
