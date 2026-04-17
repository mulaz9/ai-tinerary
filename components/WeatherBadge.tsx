import type { WeatherInfo } from "../lib/weather";

interface WeatherBadgeProps {
  info: WeatherInfo;
}

interface CodeMeta {
  emoji: string;
  label: string;
}

// WMO weather interpretation codes — grouped broadly for readable summaries.
const WEATHER_CODE_MAP: Record<number, CodeMeta> = {
  0: { emoji: "☀️", label: "Sereno" },
  1: { emoji: "🌤️", label: "Prev. sereno" },
  2: { emoji: "⛅", label: "Parz. nuvoloso" },
  3: { emoji: "☁️", label: "Nuvoloso" },
  45: { emoji: "🌫️", label: "Nebbia" },
  48: { emoji: "🌫️", label: "Nebbia" },
  51: { emoji: "🌦️", label: "Pioviggine" },
  53: { emoji: "🌦️", label: "Pioviggine" },
  55: { emoji: "🌦️", label: "Pioviggine" },
  56: { emoji: "🌧️", label: "Pioviggine gelata" },
  57: { emoji: "🌧️", label: "Pioviggine gelata" },
  61: { emoji: "🌧️", label: "Pioggia leggera" },
  63: { emoji: "🌧️", label: "Pioggia" },
  65: { emoji: "🌧️", label: "Pioggia forte" },
  66: { emoji: "🌧️", label: "Pioggia gelata" },
  67: { emoji: "🌧️", label: "Pioggia gelata" },
  71: { emoji: "🌨️", label: "Neve leggera" },
  73: { emoji: "🌨️", label: "Neve" },
  75: { emoji: "❄️", label: "Neve forte" },
  77: { emoji: "❄️", label: "Granuli di neve" },
  80: { emoji: "🌦️", label: "Rovesci" },
  81: { emoji: "🌧️", label: "Rovesci" },
  82: { emoji: "⛈️", label: "Rovesci forti" },
  85: { emoji: "🌨️", label: "Rovesci di neve" },
  86: { emoji: "🌨️", label: "Rovesci di neve" },
  95: { emoji: "⛈️", label: "Temporale" },
  96: { emoji: "⛈️", label: "Temporale + grandine" },
  99: { emoji: "⛈️", label: "Temporale forte" },
};

function describe(code: number): CodeMeta {
  return WEATHER_CODE_MAP[code] ?? { emoji: "🌡️", label: "—" };
}

export default function WeatherBadge({ info }: WeatherBadgeProps) {
  const { emoji, label } = describe(info.weatherCode);
  const tMin = Math.round(info.tMin);
  const tMax = Math.round(info.tMax);
  const isClimate = info.kind === "climate";

  const title = isClimate
    ? `Clima tipico: ${label} · ${tMin}°/${tMax}° · precip. ~${info.precipitation}mm`
    : `Previsioni: ${label} · ${tMin}°/${tMax}° · precip. ${info.precipitation}mm`;

  return (
    <div
      title={title}
      className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.06] bg-white/[0.03] px-2.5 py-1 text-[11px] font-medium text-white/70"
    >
      <span aria-hidden className="text-sm leading-none">
        {emoji}
      </span>
      <span className="tabular-nums">
        {tMin}°/{tMax}°
      </span>
      {isClimate ? (
        <span className="text-[10px] font-normal uppercase tracking-wide text-white/40">
          tipico
        </span>
      ) : null}
    </div>
  );
}
