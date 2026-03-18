import Link from "next/link";

interface MapEmbedProps {
  mapsUrl?: string;
  label?: string;
}

export default function MapEmbed({ mapsUrl, label = "Maps" }: MapEmbedProps) {
  if (!mapsUrl) return null;

  return (
    <Link
      href={mapsUrl}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/15 bg-emerald-400/[0.06] px-2.5 py-1 text-[11px] font-semibold text-emerald-300/80 transition hover:bg-emerald-400/10"
    >
      <span className="h-1 w-1 rounded-full bg-emerald-400/70" />
      {label}
    </Link>
  );
}
