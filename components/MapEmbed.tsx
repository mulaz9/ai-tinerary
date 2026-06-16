import { useTranslations } from "next-intl";
import { GoogleMapsPinIcon } from "./BrandIcons";

interface MapEmbedProps {
  mapsUrl?: string;
  label?: string;
  /** Scroll to the trip map and open this place (instead of opening Maps directly). */
  onShowOnMap?: () => void;
}

const pillClass =
  "inline-flex items-center gap-1.5 rounded-full border border-[#4285f4]/30 bg-[#4285f4]/10 px-2.5 py-1 text-[11px] font-semibold text-[#8ab4f8] transition hover:bg-[#4285f4]/20";

export default function MapEmbed({
  mapsUrl,
  label,
  onShowOnMap,
}: MapEmbedProps) {
  const t = useTranslations("mapEmbed");
  const text = label ?? t("label");
  if (!mapsUrl && !onShowOnMap) return null;

  if (onShowOnMap) {
    return (
      <button type="button" onClick={onShowOnMap} className={pillClass}>
        <GoogleMapsPinIcon size={12} />
        {text}
      </button>
    );
  }

  return (
    <a href={mapsUrl} target="_blank" rel="noreferrer" className={pillClass}>
      <GoogleMapsPinIcon size={12} />
      {text}
    </a>
  );
}
