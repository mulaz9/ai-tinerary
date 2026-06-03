import type { GooglePlaceRating } from "../types";

interface PlaceRatingBadgeProps {
  rating?: GooglePlaceRating | null;
  /** card: activity pills (dark); google: map InfoWindow (light) */
  variant?: "card" | "google" | "light";
  className?: string;
}

function GoogleGIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      aria-hidden
      focusable="false"
    >
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  );
}

export default function PlaceRatingBadge({
  rating,
  variant = "card",
  className = "",
}: PlaceRatingBadgeProps) {
  if (!rating || !Number.isFinite(rating.rating)) return null;

  const reviewsLabel = `${rating.reviewCount.toLocaleString("it-IT")} recensioni`;
  const title = `${rating.rating.toFixed(1)} · ${reviewsLabel} su Google`;

  if (variant === "google") {
    return (
      <div
        className={`inline-flex items-center gap-2 rounded-lg border border-slate-200/90 bg-gradient-to-br from-slate-50 to-white px-2.5 py-1.5 shadow-sm ${className}`}
        title={title}
      >
        <GoogleGIcon className="h-[18px] w-[18px] shrink-0" />
        <div className="flex min-w-0 flex-col leading-tight">
          <span className="flex items-center gap-1">
            <span className="text-[13px] font-semibold tabular-nums text-slate-900">
              {rating.rating.toFixed(1)}
            </span>
            <span className="text-[12px] text-amber-500" aria-hidden>
              ★
            </span>
          </span>
          <span className="text-[10px] text-slate-500">{reviewsLabel}</span>
        </div>
      </div>
    );
  }

  if (variant === "card") {
    return (
      <span
        className={`inline-flex items-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.04] px-2.5 py-1 text-[11px] leading-none text-white/75 ${className}`}
        title={title}
      >
        <GoogleGIcon className="h-3.5 w-3.5 shrink-0 opacity-95" />
        <span className="font-semibold tabular-nums text-white/90">
          {rating.rating.toFixed(1)}
        </span>
        <span className="text-amber-400/90" aria-hidden>
          ★
        </span>
        <span className="text-white/30" aria-hidden>
          ·
        </span>
        <span className="text-white/45">
          {rating.reviewCount.toLocaleString("it-IT")}
        </span>
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-medium leading-none text-amber-900 ${className}`}
      title={title}
    >
      <span className="text-amber-500" aria-hidden>
        ★
      </span>
      <span>{rating.rating.toFixed(1)}</span>
      <span className="text-amber-800/70">
        ({rating.reviewCount.toLocaleString("it-IT")})
      </span>
    </span>
  );
}
