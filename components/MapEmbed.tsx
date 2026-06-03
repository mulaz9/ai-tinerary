interface MapEmbedProps {
  mapsUrl?: string;
  label?: string;
  /** Scroll to the trip map and open this place (instead of opening Maps directly). */
  onShowOnMap?: () => void;
}

const pillClass =
  "inline-flex items-center gap-1.5 rounded-full border border-emerald-400/15 bg-emerald-400/[0.06] px-2.5 py-1 text-[11px] font-semibold text-emerald-300/80 transition hover:bg-emerald-400/10";

export default function MapEmbed({
  mapsUrl,
  label = "Maps",
  onShowOnMap,
}: MapEmbedProps) {
  if (!mapsUrl && !onShowOnMap) return null;

  if (onShowOnMap) {
    return (
      <button type="button" onClick={onShowOnMap} className={pillClass}>
        <span className="h-1 w-1 rounded-full bg-emerald-400/70" />
        {label}
      </button>
    );
  }

  return (
    <a href={mapsUrl} target="_blank" rel="noreferrer" className={pillClass}>
      <span className="h-1 w-1 rounded-full bg-emerald-400/70" />
      {label}
    </a>
  );
}
