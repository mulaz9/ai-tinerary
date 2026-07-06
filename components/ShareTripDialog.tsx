"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useBodyScrollLock } from "../hooks/useBodyScrollLock";
import type { SharePermission, TripShare } from "../types";
import {
  buildShareUrl,
  createShareLink,
  getSharesForTrip,
  revokeShareLink,
} from "../lib/trip-sharing";

interface ShareTripDialogProps {
  open: boolean;
  onClose: () => void;
  tripId: string;
}

export default function ShareTripDialog({
  open,
  onClose,
  tripId,
}: ShareTripDialogProps) {
  const t = useTranslations("shareDialog");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const [permission, setPermission] = useState<SharePermission>("read");
  const [shares, setShares] = useState<TripShare[]>([]);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const copiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useBodyScrollLock(open);

  useEffect(() => {
    return () => {
      if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    getSharesForTrip(tripId).then((s) => {
      if (!cancelled) setShares(s);
    });
    return () => {
      cancelled = true;
    };
  }, [open, tripId]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  async function handleGenerate() {
    setLoading(true);
    const share = await createShareLink(tripId, permission);
    if (share) {
      setShares((prev) => [share, ...prev]);
    }
    setLoading(false);
  }

  async function handleRevoke(shareId: string) {
    const ok = await revokeShareLink(shareId);
    if (ok) {
      setShares((prev) => prev.filter((s) => s.id !== shareId));
    }
  }

  function handleCopy(token: string) {
    const url = buildShareUrl(token);
    navigator.clipboard.writeText(url).then(() => {
      setCopied(token);
      if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
      copiedTimerRef.current = setTimeout(() => setCopied(null), 2000);
    });
  }

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

      <div className="relative w-full max-w-md overflow-hidden rounded-2xl border border-white/10 bg-[#1a1a1a] shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/5 px-5 py-4">
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
            onClick={onClose}
            className="rounded-lg p-2 text-white/50 transition hover:bg-white/5 hover:text-white"
            aria-label={tCommon("close")}
          >
            ✕
          </button>
        </div>

        <div className="space-y-5 px-5 py-5">
          {/* Permission selector */}
          <div>
            <label className="block text-[11px] font-medium uppercase tracking-wide text-white/50">
              {t("permissions")}
            </label>
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={() => setPermission("read")}
                className={`flex-1 rounded-xl border px-3 py-2.5 text-sm font-medium transition ${
                  permission === "read"
                    ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-300"
                    : "border-white/10 bg-white/[0.02] text-white/60 hover:bg-white/[0.04]"
                }`}
              >
                {t("readOnly")}
              </button>
              <button
                type="button"
                onClick={() => setPermission("write")}
                className={`flex-1 rounded-xl border px-3 py-2.5 text-sm font-medium transition ${
                  permission === "write"
                    ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-300"
                    : "border-white/10 bg-white/[0.02] text-white/60 hover:bg-white/[0.04]"
                }`}
              >
                {t("readWrite")}
              </button>
            </div>
          </div>

          {/* Generate button */}
          <button
            type="button"
            onClick={handleGenerate}
            disabled={loading}
            className="w-full rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? (
              <span className="inline-flex items-center gap-2">
                <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-emerald-950/30 border-t-emerald-950" />
                {tCommon("generating")}
              </span>
            ) : (
              t("generateLink")
            )}
          </button>

          {/* Existing shares */}
          {shares.length > 0 && (
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wide text-white/50">
                {t("activeLinks")}
              </p>
              <ul className="mt-2 space-y-2">
                {shares.map((share) => (
                  <li
                    key={share.id}
                    className="flex items-center gap-2 rounded-xl border border-white/6 bg-white/[0.02] px-3 py-2.5"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs text-white/70 font-mono">
                        {buildShareUrl(share.share_token)}
                      </p>
                      <p className="mt-0.5 text-[11px] text-white/40">
                        {share.permission === "read"
                          ? t("readOnly")
                          : t("readWrite")}
                        {" · "}
                        {new Date(share.created_at).toLocaleDateString(locale)}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleCopy(share.share_token)}
                      className="shrink-0 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-[11px] font-semibold text-white/80 transition hover:bg-white/10"
                    >
                      {copied === share.share_token ? t("copied") : t("copy")}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRevoke(share.id)}
                      className="shrink-0 rounded-lg border border-red-500/20 bg-red-500/10 px-2.5 py-1.5 text-[11px] font-semibold text-red-300 transition hover:bg-red-500/20"
                    >
                      {t("revoke")}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end border-t border-white/5 bg-white/[0.02] px-5 py-3.5">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl px-3.5 py-2 text-sm font-medium text-white/70 transition hover:bg-white/5 hover:text-white"
          >
            {tCommon("close")}
          </button>
        </div>
      </div>
    </div>
  );
}
