import SafeImage from "./SafeImage";
import MapEmbed from "./MapEmbed";
import TransportInfo from "./TransportInfo";

interface LocationCardProps {
  title: string;
  time?: string;
  description: string;
  location: string;
  photoUrl?: string;
  mapsUrl?: string;
  transport?: Parameters<typeof TransportInfo>[0]["transport"];
  meta?: React.ReactNode;
  checked?: boolean;
  onToggle?: (next: boolean) => void;
}

export default function LocationCard({
  title,
  time,
  description,
  location,
  photoUrl,
  mapsUrl,
  transport,
  meta,
  checked,
  onToggle,
}: LocationCardProps) {
  return (
    <div
      className={`group overflow-hidden rounded-2xl border transition-all duration-200 ${
        checked
          ? "border-emerald-400/20 bg-emerald-400/[0.04]"
          : "border-white/[0.06] bg-[#1a1a1a] hover:border-white/10 hover:bg-[#1e1e1e]"
      }`}
    >
      {/* ── Image area ─────────────────────────────────────────────────── */}
      <div className="relative overflow-hidden">
        {photoUrl ? (
          <SafeImage
            src={photoUrl}
            alt={title}
            className="h-40 w-full object-cover transition-transform duration-500 group-hover:scale-[1.03] sm:h-44"
            fallbackLabel={location}
          />
        ) : (
          <div className="h-40 w-full bg-gradient-to-br from-emerald-900/20 via-slate-800/50 to-indigo-900/20 sm:h-44" />
        )}

        {/* Time badge over image */}
        {time ? (
          <span className="absolute left-3 top-3 rounded-lg bg-black/60 px-2.5 py-1 text-[11px] font-semibold tabular-nums text-emerald-300 backdrop-blur-sm">
            {time}
          </span>
        ) : null}
      </div>

      {/* ── Content area ───────────────────────────────────────────────── */}
      <div className="p-4">
        <div className="flex items-start gap-3">
          {/* Checkbox */}
          <label className="relative mt-0.5 flex h-[18px] w-[18px] shrink-0 cursor-pointer items-center justify-center">
            <input
              type="checkbox"
              checked={!!checked}
              onChange={(e) => onToggle?.(e.target.checked)}
              className="peer sr-only"
              aria-label={`Segna come completata: ${title}`}
            />
            <span
              className={`flex h-[18px] w-[18px] items-center justify-center rounded-md border transition-all ${
                checked
                  ? "border-emerald-400 bg-emerald-400 text-black"
                  : "border-white/20 bg-white/[0.03] peer-hover:border-white/30"
              }`}
            >
              {checked ? (
                <svg className="h-3 w-3" viewBox="0 0 12 12" fill="none">
                  <path d="M2.5 6L5 8.5L9.5 3.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              ) : null}
            </span>
          </label>

          <div className="min-w-0 flex-1">
            <h3
              className={`text-sm font-semibold leading-snug transition-colors ${
                checked ? "text-white/50 line-through decoration-white/20" : "text-white"
              }`}
            >
              {title}
            </h3>

            <p className="mt-1.5 line-clamp-2 text-[13px] leading-relaxed text-white/55">
              {description}
            </p>

            {/* Pills row */}
            <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[11px] text-white/50">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.06] bg-white/[0.03] px-2.5 py-1">
                <span className="dot-accent" style={{ width: 5, height: 5 }} />
                {location}
              </span>
              {meta}
              <MapEmbed mapsUrl={mapsUrl} />
            </div>

            <TransportInfo transport={transport} />
          </div>
        </div>
      </div>
    </div>
  );
}
