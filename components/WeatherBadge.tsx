import { useTranslations } from "next-intl";
import type { WeatherInfo } from "../lib/weather";

interface WeatherBadgeProps {
  info: WeatherInfo;
}

interface CodeMeta {
  emoji: string;
  key: string;
}

// WMO weather interpretation codes — grouped broadly for readable summaries.
const WEATHER_CODE_MAP: Record<number, CodeMeta> = {
  0: { emoji: "☀️", key: "clear" },
  1: { emoji: "🌤️", key: "mostlyClear" },
  2: { emoji: "⛅", key: "partlyCloudy" },
  3: { emoji: "☁️", key: "cloudy" },
  45: { emoji: "🌫️", key: "fog" },
  48: { emoji: "🌫️", key: "fog" },
  51: { emoji: "🌦️", key: "drizzle" },
  53: { emoji: "🌦️", key: "drizzle" },
  55: { emoji: "🌦️", key: "drizzle" },
  56: { emoji: "🌧️", key: "freezingDrizzle" },
  57: { emoji: "🌧️", key: "freezingDrizzle" },
  61: { emoji: "🌧️", key: "lightRain" },
  63: { emoji: "🌧️", key: "rain" },
  65: { emoji: "🌧️", key: "heavyRain" },
  66: { emoji: "🌧️", key: "freezingRain" },
  67: { emoji: "🌧️", key: "freezingRain" },
  71: { emoji: "🌨️", key: "lightSnow" },
  73: { emoji: "🌨️", key: "snow" },
  75: { emoji: "❄️", key: "heavySnow" },
  77: { emoji: "❄️", key: "snowGrains" },
  80: { emoji: "🌦️", key: "showers" },
  81: { emoji: "🌧️", key: "showers" },
  82: { emoji: "⛈️", key: "heavyShowers" },
  85: { emoji: "🌨️", key: "snowShowers" },
  86: { emoji: "🌨️", key: "snowShowers" },
  95: { emoji: "⛈️", key: "thunderstorm" },
  96: { emoji: "⛈️", key: "thunderstormHail" },
  99: { emoji: "⛈️", key: "heavyThunderstorm" },
};

function describe(code: number): CodeMeta {
  return WEATHER_CODE_MAP[code] ?? { emoji: "🌡️", key: "unknown" };
}

export default function WeatherBadge({ info }: WeatherBadgeProps) {
  const t = useTranslations("weather");
  const { emoji, key } = describe(info.weatherCode);
  const label = t(`code.${key}`);
  const tMin = Math.round(info.tMin);
  const tMax = Math.round(info.tMax);
  const isClimate = info.kind === "climate";

  const title = isClimate
    ? t("climateTitle", { label, tMin, tMax, precip: info.precipitation })
    : t("forecastTitle", { label, tMin, tMax, precip: info.precipitation });

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
          {t("typical")}
        </span>
      ) : null}
    </div>
  );
}
