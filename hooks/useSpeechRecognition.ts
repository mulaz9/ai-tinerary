"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { SPEECH_LOCALE, normalizeLocale, type Locale } from "../i18n/config";

export type SpeechStatus = "unsupported" | "idle" | "listening" | "error";

type SpeechRecognitionCtor = new () => SpeechRecognition;

function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as Window & {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

interface UseSpeechRecognitionOptions {
  lang: Locale | string;
  /** Called with cumulative final text and optional interim suffix. */
  onTranscript?: (text: string, interim: string) => void;
  silenceMs?: number;
}

export function useSpeechRecognition({
  lang,
  onTranscript,
  silenceMs = 3000,
}: UseSpeechRecognitionOptions) {
  const [status, setStatus] = useState<SpeechStatus>("idle");
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const silenceTimerRef = useRef<number | null>(null);
  const finalRef = useRef("");
  const supported = getSpeechRecognitionCtor() !== null;

  useEffect(() => {
    if (!supported) setStatus("unsupported");
  }, [supported]);

  const clearSilenceTimer = useCallback(() => {
    if (silenceTimerRef.current) {
      window.clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
  }, []);

  const stop = useCallback(() => {
    clearSilenceTimer();
    const rec = recognitionRef.current;
    if (rec) {
      recognitionRef.current = null;
      try {
        rec.stop();
      } catch {
        // ignore — may already be stopped
      }
    }
    setStatus((s) => (s === "listening" ? "idle" : s));
  }, [clearSilenceTimer]);

  const reset = useCallback(() => {
    finalRef.current = "";
    setErrorCode(null);
    setStatus(supported ? "idle" : "unsupported");
  }, [supported]);

  const start = useCallback(() => {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) {
      setStatus("unsupported");
      return;
    }

    stop();
    finalRef.current = "";
    setErrorCode(null);

    const rec = new Ctor();
    recognitionRef.current = rec;
    rec.lang = SPEECH_LOCALE[normalizeLocale(lang)];
    rec.continuous = true;
    rec.interimResults = true;

    const scheduleSilenceStop = () => {
      clearSilenceTimer();
      silenceTimerRef.current = window.setTimeout(() => stop(), silenceMs);
    };

    rec.onresult = (event: SpeechRecognitionEvent) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const piece = event.results[i][0]?.transcript ?? "";
        if (event.results[i].isFinal) {
          const trimmed = piece.trim();
          if (trimmed) {
            finalRef.current = finalRef.current
              ? `${finalRef.current} ${trimmed}`
              : trimmed;
          }
        } else {
          interim += piece;
        }
      }
      onTranscript?.(finalRef.current, interim.trim());
      if (finalRef.current || interim.trim()) scheduleSilenceStop();
    };

    rec.onerror = (event: SpeechRecognitionErrorEvent) => {
      setErrorCode(event.error);
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        setStatus("error");
      } else if (event.error === "no-speech") {
        setStatus("idle");
      } else {
        setStatus("error");
      }
      stop();
    };

    rec.onend = () => {
      if (recognitionRef.current === rec) {
        recognitionRef.current = null;
        setStatus((s) => (s === "listening" ? "idle" : s));
      }
    };

    try {
      rec.start();
      setStatus("listening");
    } catch {
      setStatus("error");
      setErrorCode("start-failed");
    }
  }, [clearSilenceTimer, lang, onTranscript, silenceMs, stop]);

  useEffect(() => () => stop(), [stop]);

  return {
    status,
    errorCode,
    supported,
    start,
    stop,
    reset,
    isListening: status === "listening",
  };
}
