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
  /** Opens this place on the embedded trip map. */
  onShowOnMap?: () => void;
  transport?: Parameters<typeof TransportInfo>[0]["transport"];
  meta?: React.ReactNode;
  checked?: boolean;
  onToggle?: (next: boolean) => void;
  /** Removes this card. When provided, a small × button is shown on hover. */
  onRemove?: () => void;
  /** Opens an edit dialog for the activity start time. When provided, the
   *  time badge becomes a clickable button and a small clock action appears
   *  in the top-right corner. */
  onEditTime?: () => void;
}

export default function LocationCard({
  title,
  time,
  description,
  location,
  photoUrl,
  mapsUrl,
  onShowOnMap,
  transport,
  meta,
  checked,
  onToggle,
  onRemove,
  onEditTime,
}: LocationCardProps) {
  return (
    <div
      className={`group relative overflow-hidden rounded-2xl border transition-all duration-200 ${
        checked
          ? "border-emerald-400/20 bg-emerald-400/[0.04]"
          : "border-white/[0.06] bg-[#1a1a1a] hover:border-white/10 hover:bg-[#1e1e1e]"
      }`}
    >
      {/* ── Action buttons (edit time + remove) ─────────────────────────── */}
      <div className="absolute right-2 top-2 z-10 flex items-center gap-1">
        {onEditTime ? (
          <button
            type="button"
            onClick={onEditTime}
            aria-label={`Modifica orario di ${title}`}
            title="Modifica orario"
            className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-black/50 text-white/70 backdrop-blur transition hover:border-emerald-400/40 hover:bg-emerald-500/15 hover:text-emerald-200"
          >
            <svg
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="9" />
              <polyline points="12 7 12 12 15 14" />
            </svg>
          </button>
        ) : null}
        {onRemove ? (
          <button
            type="button"
            onClick={onRemove}
            aria-label={`Rimuovi ${title}`}
            title="Rimuovi attività"
            className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-black/50 text-white/70 backdrop-blur transition hover:border-red-400/40 hover:bg-red-500/20 hover:text-red-200"
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M18 6L6 18" />
              <path d="M6 6l12 12" />
            </svg>
          </button>
        ) : null}
      </div>

      {/* ── Image area (collapses when checked) ────────────────────────── */}
      <div
        className={`grid transition-[grid-template-rows,opacity] duration-300 ease-in-out ${
          checked ? "grid-rows-[0fr] opacity-0" : "grid-rows-[1fr] opacity-100"
        }`}
        aria-hidden={checked}
      >
        <div className="relative min-h-0 overflow-hidden">
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

          {/* Time badge over image — clickable when editable. */}
          {time ? (
            onEditTime ? (
              <button
                type="button"
                onClick={onEditTime}
                title="Modifica orario"
                className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-lg bg-black/60 px-2.5 py-1 text-[11px] font-semibold tabular-nums text-emerald-300 backdrop-blur-sm transition hover:bg-black/75 hover:text-emerald-200"
              >
                <svg
                  width="11"
                  height="11"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <circle cx="12" cy="12" r="9" />
                  <polyline points="12 7 12 12 15 14" />
                </svg>
                {time}
              </button>
            ) : (
              <span className="absolute left-3 top-3 rounded-lg bg-black/60 px-2.5 py-1 text-[11px] font-semibold tabular-nums text-emerald-300 backdrop-blur-sm">
                {time}
              </span>
            )
          ) : onEditTime ? (
            <button
              type="button"
              onClick={onEditTime}
              title="Aggiungi orario"
              className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-black/40 px-2.5 py-1 text-[11px] font-semibold text-white/70 backdrop-blur-sm transition hover:bg-black/60 hover:text-white"
            >
              <svg
                width="11"
                height="11"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <circle cx="12" cy="12" r="9" />
                <polyline points="12 7 12 12 15 14" />
              </svg>
              Imposta orario
            </button>
          ) : null}
        </div>
      </div>

      {/* ── Content area ───────────────────────────────────────────────── */}
      <div className={checked ? "px-4 py-3" : "p-4"}>
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
            {/* Title row — when checked, the time badge moves inline so the
                collapsed card still shows the "when" at a glance. */}
            <div className="flex items-center gap-2">
              {checked && time ? (
                <span className="inline-flex shrink-0 rounded-md bg-emerald-400/15 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-emerald-300/90">
                  {time}
                </span>
              ) : null}
              <h3
                className={`min-w-0 flex-1 text-sm font-semibold leading-snug transition-colors ${
                  checked
                    ? "truncate text-white/50 line-through decoration-white/20"
                    : "text-white"
                }`}
              >
                {title}
              </h3>
            </div>

            {/* Body + pills — collapse when the activity is checked. */}
            <div
              className={`grid transition-[grid-template-rows,opacity,margin] duration-300 ease-in-out ${
                checked
                  ? "mt-0 grid-rows-[0fr] opacity-0"
                  : "mt-1.5 grid-rows-[1fr] opacity-100"
              }`}
              aria-hidden={checked}
            >
              <div className="min-h-0 overflow-hidden">
                <p className="line-clamp-2 text-[13px] leading-relaxed text-white/55">
                  {description}
                </p>

                {/* Pills row */}
                <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[11px] text-white/50">
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.06] bg-white/[0.03] px-2.5 py-1">
                    <span className="dot-accent" style={{ width: 5, height: 5 }} />
                    {location}
                  </span>
                  {meta}
                  <MapEmbed mapsUrl={mapsUrl} onShowOnMap={onShowOnMap} />
                </div>

                <TransportInfo transport={transport} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
