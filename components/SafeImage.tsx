"use client";

import { useState } from "react";

const GRADIENTS = [
  "from-sky-900/50 via-slate-800/80 to-teal-900/50",
  "from-emerald-900/50 via-slate-800/80 to-indigo-900/50",
  "from-orange-900/40 via-slate-800/80 to-rose-900/40",
  "from-violet-900/50 via-slate-800/80 to-sky-900/50",
  "from-amber-900/40 via-slate-800/80 to-orange-900/40",
];

interface SafeImageProps {
  src: string;
  alt: string;
  className?: string;
  /** Short label shown in the gradient fallback */
  fallbackLabel?: string;
}

/**
 * Renders an <img> and gracefully falls back to a coloured gradient
 * if the image fails to load (broken URL, CORS issue, rate-limit …).
 */
export default function SafeImage({ src, alt, className = "", fallbackLabel }: SafeImageProps) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  // Keyed on src so a new URL gets a fresh chance after a previous failure.
  const error = failedSrc === src;

  // Deterministic gradient based on the alt text so the same card always
  // gets the same colour — no flickering on re-renders.
  const gradient = GRADIENTS[alt.length % GRADIENTS.length];

  if (error) {
    return (
      <div
        className={`flex items-end bg-gradient-to-br ${gradient} ${className}`}
        role="img"
        aria-label={alt}
      >
        {fallbackLabel ? (
          <span className="m-3 line-clamp-1 rounded-lg bg-black/20 px-2 py-1 text-xs font-medium text-white/50 backdrop-blur-sm">
            {fallbackLabel}
          </span>
        ) : null}
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      className={className}
      loading="lazy"
      onError={() => setFailedSrc(src)}
    />
  );
}
