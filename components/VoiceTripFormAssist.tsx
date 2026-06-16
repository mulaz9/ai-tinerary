"use client";

import { useCallback, useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useSpeechRecognition } from "../hooks/useSpeechRecognition";
import type { ParsedTripForm } from "../lib/ai";

export type VoiceTripFormFields = ParsedTripForm;

interface VoiceTripFormAssistProps {
  disabled?: boolean;
  onApply: (fields: VoiceTripFormFields) => void;
}

export default function VoiceTripFormAssist({
  disabled = false,
  onApply,
}: VoiceTripFormAssistProps) {
  const t = useTranslations("newTrip");
  const tCommon = useTranslations("common");
  const tErr = useTranslations("aiErrors");
  const locale = useLocale();

  const [transcript, setTranscript] = useState("");
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);

  const handleTranscript = useCallback((final: string, interim: string) => {
    const combined = interim ? `${final}${final ? " " : ""}${interim}` : final;
    setTranscript(combined);
  }, []);

  const { status, errorCode, supported, start, stop, reset, isListening } =
    useSpeechRecognition({
      lang: locale,
      onTranscript: handleTranscript,
    });

  useEffect(() => {
    if (status === "unsupported") return;
    if (errorCode === "not-allowed" || errorCode === "service-not-allowed") {
      setVoiceError(t("voicePermissionDenied"));
    } else if (errorCode === "no-speech") {
      setVoiceError(t("voiceNoSpeech"));
    } else if (errorCode) {
      setVoiceError(tCommon("unknownError"));
    }
  }, [status, errorCode, t, tCommon]);

  const toggleListening = () => {
    if (disabled || applying) return;
    setVoiceError(null);
    if (isListening) {
      stop();
    } else {
      start();
    }
  };

  const handleApply = async () => {
    const text = transcript.trim();
    if (!text || disabled || applying) return;
    setVoiceError(null);
    setApplying(true);
    stop();
    try {
      const res = await fetch("/api/parse-trip-form", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          transcript: text,
          language: locale,
          referenceDate: new Date().toISOString().slice(0, 10),
        }),
      });
      const data = (await res.json()) as {
        form?: VoiceTripFormFields;
        error?: string;
        code?: string;
        providerLabel?: string;
        retryAfterSec?: number;
      };
      if (!res.ok || !data.form) {
        const prov = data.providerLabel ?? tErr("provider");
        let msg = data.error || tCommon("serverError", { status: res.status });
        if (data.code === "rate_limit") {
          const wait = data.retryAfterSec
            ? tErr("retryIn", { sec: data.retryAfterSec })
            : "";
          msg = tErr("rateLimit", { provider: prov, wait });
        } else if (data.code === "bad_request") {
          msg = t("voiceParseError");
        } else if (data.code === "auth") {
          msg = tErr("authShort", { provider: prov });
        } else if (data.code === "no_provider") {
          msg = tErr("noProviderShort");
        }
        throw new Error(msg);
      }
      onApply(data.form);
    } catch (err) {
      setVoiceError(
        err instanceof Error ? err.message : t("voiceParseError"),
      );
    } finally {
      setApplying(false);
    }
  };

  if (!supported || status === "unsupported") {
    return (
      <p className="rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2.5 text-[12px] text-white/45">
        {t("voiceUnsupported")}
      </p>
    );
  }

  return (
    <div className="space-y-3 rounded-xl border border-white/10 bg-white/[0.02] p-3">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={toggleListening}
          disabled={disabled || applying}
          className={`inline-flex min-h-10 items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${
            isListening
              ? "border border-red-400/30 bg-red-500/15 text-red-200"
              : "border border-emerald-400/30 bg-emerald-500/15 text-emerald-100 hover:bg-emerald-500/25"
          }`}
        >
          {isListening ? (
            <>
              <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-red-400" />
              {t("voiceStop")}
            </>
          ) : (
            <>
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
                <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                <line x1="12" y1="19" x2="12" y2="22" />
              </svg>
              {t("voiceStart")}
            </>
          )}
        </button>
        {isListening ? (
          <span className="text-[11px] font-medium text-emerald-300/80">
            {t("voiceListening")}
          </span>
        ) : null}
        {transcript ? (
          <button
            type="button"
            onClick={() => {
              setTranscript("");
              reset();
              setVoiceError(null);
            }}
            disabled={disabled || applying || isListening}
            className="text-[11px] text-white/40 underline-offset-2 hover:text-white/60 hover:underline disabled:opacity-40"
          >
            {tCommon("cancel")}
          </button>
        ) : null}
      </div>

      <div>
        <label className="block text-[11px] font-medium uppercase tracking-wide text-white/50">
          {t("voicePreview")}
        </label>
        <textarea
          value={transcript}
          onChange={(e) => setTranscript(e.target.value)}
          rows={3}
          placeholder={t("voicePreviewPlaceholder")}
          disabled={disabled || applying}
          className="mt-1.5 w-full resize-none rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2.5 text-sm text-white placeholder-white/30 outline-none transition focus:border-emerald-400/40 focus:bg-white/[0.04] disabled:opacity-50"
        />
      </div>

      <button
        type="button"
        onClick={handleApply}
        disabled={disabled || applying || !transcript.trim() || isListening}
        className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
      >
        {applying ? (
          <>
            <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
            {t("voiceApplying")}
          </>
        ) : (
          t("voiceApply")
        )}
      </button>

      {voiceError ? (
        <p className="text-[12px] text-red-300">{voiceError}</p>
      ) : null}
    </div>
  );
}
