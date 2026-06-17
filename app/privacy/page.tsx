import Link from "next/link";
import { getTranslations } from "next-intl/server";

export default async function PrivacyPage() {
  const t = await getTranslations("privacy");

  const sections = [
    "intro",
    "dataCollected",
    "dataUse",
    "thirdParties",
    "storage",
    "rights",
    "contact",
  ] as const;

  return (
    <main className="mx-auto max-w-2xl px-6 py-10 pb-28 lg:pb-10">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-400/80">
        {t("kicker")}
      </p>
      <h1 className="mt-2 text-2xl font-bold text-white">{t("title")}</h1>
      <p className="mt-2 text-sm text-white/50">{t("updated")}</p>

      <div className="mt-8 space-y-8">
        {sections.map((key) => (
          <section key={key}>
            <h2 className="text-lg font-semibold text-white">{t(`${key}Title`)}</h2>
            <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-white/70">
              {t(`${key}Body`)}
            </p>
          </section>
        ))}
      </div>

      <Link
        href="/"
        className="mt-10 inline-flex text-sm font-semibold text-emerald-400 transition hover:text-emerald-300"
      >
        {t("backHome")}
      </Link>
    </main>
  );
}
