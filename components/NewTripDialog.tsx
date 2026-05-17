"use client";

import { useEffect, useRef, useState } from "react";
import { Trip } from "../types";
import { addUserTrip } from "../lib/trips-store";

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

const NewTripDialog = ({ open, onClose, onCreated }: NewTripDialogProps) => {
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

  const updateAccommodation = (idx: number, value: string) =>
    setAccommodations((prev) => prev.map((a, i) => (i === idx ? value : a)));
  const addAccommodation = () =>
    setAccommodations((prev) => [...prev, ""]);
  const removeAccommodation = (idx: number) =>
    setAccommodations((prev) =>
      prev.length <= 1 ? [""] : prev.filter((_, i) => i !== idx),
    );

  useEffect(() => {
    if (open) {
      setError(null);
      setInfo(null);
      setTimeout(() => firstFieldRef.current?.focus(), 50);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !loading) onClose();
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
    if (!destination.trim()) {
      setError("Inserisci una destinazione.");
      return;
    }
    if (!arrival || !departure) {
      setError("Inserisci data/ora di arrivo e partenza.");
      return;
    }
    if (arrival >= departure) {
      setError("La data di arrivo deve essere precedente alla partenza.");
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
        }),
      });

      const data = (await res.json()) as {
        trip?: Trip;
        provider?: "gemini" | "groq";
        fellBack?: boolean;
        error?: string;
        code?: string;
        retryAfterSec?: number;
      };
      if (!res.ok || !data.trip) {
        const prov =
          data.provider === "groq"
            ? "Groq"
            : data.provider === "gemini"
              ? "Gemini"
              : "il provider AI";
        let msg = data.error || `Errore server (${res.status})`;
        if (data.code === "rate_limit") {
          const wait = data.retryAfterSec
            ? ` Riprova tra ~${data.retryAfterSec}s.`
            : " Aggiungi GROQ_API_KEY in .env.local per un fallback gratuito.";
          msg = `Limite richieste ${prov} raggiunto.${wait}`;
        } else if (data.code === "auth") {
          msg = `Chiave API di ${prov} non valida o scaduta. Controlla GEMINI_API_KEY / GROQ_API_KEY in .env.local.`;
        } else if (data.code === "no_provider") {
          msg =
            "Nessun provider AI configurato. Aggiungi GEMINI_API_KEY o GROQ_API_KEY in .env.local.";
        } else if (data.code === "model_not_found") {
          msg = `${data.error ?? "Modello non disponibile."} Verifica le variabili GEMINI_MODEL / GROQ_MODEL in .env.local.`;
        }
        throw new Error(msg);
      }

      addUserTrip(data.trip);
      onCreated?.(data.trip);

      if (data.fellBack && data.provider) {
        setInfo(
          `Itinerario generato con il fallback ${
            data.provider === "groq" ? "Groq" : "Gemini"
          }.`,
        );
        setTimeout(() => {
          setDestination("");
          setAccommodations([""]);
          setNotes("");
          onClose();
        }, 1200);
      } else {
        setDestination("");
        setAccommodations([""]);
        setNotes("");
        onClose();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore sconosciuto.");
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
        aria-label="Chiudi"
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={() => !loading && onClose()}
      />

      <form
        onSubmit={handleSubmit}
        className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-white/10 bg-[#1a1a1a] shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-white/5 px-5 py-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-emerald-400/70">
              Nuovo viaggio
            </p>
            <h2 className="mt-0.5 text-lg font-bold text-white">
              Genera itinerario con AI
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="rounded-lg p-2 text-white/50 transition hover:bg-white/5 hover:text-white disabled:opacity-40"
            aria-label="Chiudi"
          >
            ✕
          </button>
        </div>

        <div className="space-y-4 px-5 py-5">
          <div>
            <label className="block text-[11px] font-medium uppercase tracking-wide text-white/50">
              Destinazione
            </label>
            <input
              ref={firstFieldRef}
              type="text"
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
              placeholder="Es. Lisbona, Portogallo"
              className="mt-1.5 w-full rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2.5 text-sm text-white placeholder-white/30 outline-none transition focus:border-emerald-400/40 focus:bg-white/[0.04]"
              disabled={loading}
            />
          </div>

          <div>
            <label className="block text-[11px] font-medium uppercase tracking-wide text-white/50">
              Alloggi{" "}
              <span className="text-white/30 normal-case tracking-normal">
                (opzionale — hotel, airbnb, indirizzo…)
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
                        ? "Es. Hotel Lisboa Plaza, Av. da Liberdade"
                        : "Es. Airbnb Alfama"
                    }
                    className="w-full rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2.5 text-sm text-white placeholder-white/30 outline-none transition focus:border-emerald-400/40 focus:bg-white/[0.04]"
                    disabled={loading}
                  />
                  {accommodations.length > 1 ? (
                    <button
                      type="button"
                      onClick={() => removeAccommodation(idx)}
                      disabled={loading}
                      aria-label="Rimuovi alloggio"
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
                Aggiungi alloggio
              </button>
            </div>
            <p className="mt-1.5 text-[11px] text-white/35">
              Aggiungine quanti vuoi. Potrai assegnarli ai singoli giorni
              dopo aver generato il viaggio.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-[11px] font-medium uppercase tracking-wide text-white/50">
                Arrivo
              </label>
              <input
                type="datetime-local"
                value={arrival}
                onChange={(e) => setArrival(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2.5 text-sm text-white outline-none transition focus:border-emerald-400/40 focus:bg-white/[0.04]"
                disabled={loading}
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium uppercase tracking-wide text-white/50">
                Partenza
              </label>
              <input
                type="datetime-local"
                value={departure}
                onChange={(e) => setDeparture(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2.5 text-sm text-white outline-none transition focus:border-emerald-400/40 focus:bg-white/[0.04]"
                disabled={loading}
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-medium uppercase tracking-wide text-white/50">
              Note / stile di viaggio (opzionale)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Es. budget medio, tanto mare, cucina locale, no musei…"
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

        <div className="flex items-center justify-end gap-2 border-t border-white/5 bg-white/[0.02] px-5 py-3.5">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="rounded-xl px-3.5 py-2 text-sm font-medium text-white/70 transition hover:bg-white/5 hover:text-white disabled:opacity-40"
          >
            Annulla
          </button>
          <button
            type="submit"
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? (
              <>
                <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-emerald-950/30 border-t-emerald-950" />
                Genero…
              </>
            ) : (
              <>Genera con AI</>
            )}
          </button>
        </div>
      </form>
    </div>
  );
};

export default NewTripDialog;
