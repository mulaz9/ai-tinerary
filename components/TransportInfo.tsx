import Link from "next/link";
import { useTranslations } from "next-intl";
import { TransportInfo as TransportInfoType } from "../types";

interface TransportInfoProps {
  transport?: TransportInfoType;
}

export default function TransportInfo({ transport }: TransportInfoProps) {
  const t = useTranslations("transport");
  if (!transport) return null;

  return (
    <div className="mt-2.5 flex flex-wrap items-center gap-1.5 text-[11px] text-white/45">
      <span className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.06] bg-white/[0.03] px-2.5 py-1">
        <span className="h-1 w-1 rounded-full bg-sky-400/60" />
        {t(transport.mode)}: {transport.summary}
      </span>
      {transport.routeUrl ? (
        <Link
          href={transport.routeUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 rounded-full border border-sky-400/15 bg-sky-400/[0.06] px-2.5 py-1 font-semibold text-sky-300/70 transition hover:bg-sky-400/10"
        >
          {t("route")}
        </Link>
      ) : null}
    </div>
  );
}
