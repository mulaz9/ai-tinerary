import Link from "next/link";
import { getTranslations } from "next-intl/server";

export default async function OfflinePage() {
  const t = await getTranslations("offline");

  return (
    <main className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-6 text-center">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-400/80">
        {t("kicker")}
      </p>
      <h1 className="mt-3 text-2xl font-bold text-white">{t("title")}</h1>
      <p className="mt-3 text-sm leading-relaxed text-white/60">{t("body")}</p>
      <Link
        href="/"
        className="mt-8 rounded-full bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-400"
      >
        {t("retry")}
      </Link>
    </main>
  );
}
