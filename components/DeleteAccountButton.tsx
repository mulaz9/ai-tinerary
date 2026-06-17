"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

export default function DeleteAccountButton() {
  const t = useTranslations("userMenu");
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="mt-2 w-full rounded-xl border border-red-500/20 bg-red-500/5 px-3 py-2 text-xs font-semibold text-red-300 transition hover:bg-red-500/10"
      >
        {t("deleteAccount")}
      </button>
    );
  }

  return (
    <div className="mt-2 rounded-xl border border-red-500/20 bg-red-500/5 p-3">
      <p className="text-xs leading-relaxed text-red-200/80">{t("deleteConfirm")}</p>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={() => setConfirming(false)}
          className="flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white/70 transition hover:bg-white/10"
        >
          {t("deleteCancel")}
        </button>
        <form action="/api/account/delete" method="post" className="flex-1">
          <button
            type="submit"
            className="w-full rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-red-500"
          >
            {t("deleteConfirmAction")}
          </button>
        </form>
      </div>
    </div>
  );
}
