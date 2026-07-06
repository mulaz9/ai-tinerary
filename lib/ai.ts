import { Accommodation, Activity, Day, Trip, TransportInfo } from "../types";
import {
  LANGUAGE_FOR_AI,
  defaultLocale,
  normalizeLocale,
  type Locale,
} from "../i18n/config";
import { dedupeTripDays, isDuplicateActivity } from "./activity-dedup";
import { lookupImage } from "./images";
import { buildMapsUrl } from "./maps";
import { isRestaurant } from "./restaurant";
import {
  verifyRestaurantActivity,
  verifyRestaurantsInDays,
} from "./restaurant-verify";

/** Resolves a locale code (it/en/fr/es/de) to the language name used in prompts. */
function languageName(code?: string): string {
  return LANGUAGE_FOR_AI[normalizeLocale(code)];
}

export interface GenerateTripInput {
  destination: string;
  arrival: string;
  departure: string;
  notes?: string;
  /** UI locale (it/en/fr/es/de); the itinerary text is generated in this language. */
  language?: string;
  /**
   * Places the traveller is staying at across the trip (hotel, airbnb,
   * address…). The first one anchors the prompt (morning routes start
   * there) and is the default directions origin until the user assigns
   * specific accommodations to specific days.
   */
  accommodations?: string[];
  /** @deprecated legacy single-string field — equivalent to `accommodations: [value]`. */
  accommodation?: string;
}

/** Provider id (e.g. "gemini", "groq", "cerebras", …). */
export type AIProvider = string;

/** Human-readable names per provider id, used for UI messages. */
export const PROVIDER_LABELS: Record<string, string> = {
  gemini: "Gemini",
  groq: "Groq",
  cerebras: "Cerebras",
  mistral: "Mistral",
  openrouter: "OpenRouter",
  sambanova: "SambaNova",
  github: "GitHub Models",
  cloudflare: "Cloudflare Workers AI",
};

/** Maps a provider id to a display name (falls back to the id, then a generic label). */
export function providerLabel(id?: string): string {
  if (!id) return "il provider AI";
  return PROVIDER_LABELS[id] ?? id;
}

export interface GenerateTripResult {
  trip: Trip;
  provider: AIProvider;
  fellBack: boolean;
}

export class AIError extends Error {
  code:
    | "rate_limit"
    | "auth"
    | "bad_request"
    | "empty"
    | "network"
    | "model_not_found"
    | "unavailable"
    | "no_provider"
    | "unknown";
  retryAfterSec?: number;
  provider?: AIProvider;

  constructor(
    message: string,
    code: AIError["code"] = "unknown",
    retryAfterSec?: number,
    provider?: AIProvider,
  ) {
    super(message);
    this.name = "AIError";
    this.code = code;
    this.retryAfterSec = retryAfterSec;
    this.provider = provider;
  }
}

// ───────────────────────── Config ─────────────────────────

const GEMINI_PRIMARY_MODEL =
  process.env.GEMINI_MODEL?.trim() || "gemini-2.5-flash-lite";
const GEMINI_FALLBACK_MODEL = "gemini-2.5-flash";
const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

const RETRY_DELAYS_MS = [1500, 4000];

// ───────────────────────── OpenAI-compatible providers ─────────────────────────

/**
 * A free AI provider that speaks the OpenAI `/chat/completions` format. Each
 * entry is only built (and therefore used) when its API key is present, so
 * users enable as many free fallbacks as they want by adding env keys.
 */
interface OpenAICompatProvider {
  id: AIProvider;
  label: string;
  model: string;
  url: string;
  apiKey: string;
  /** Extra request headers (e.g. OpenRouter attribution). */
  headers?: Record<string, string>;
  /** Whether the provider reliably supports `response_format: json_object`. */
  supportsJsonMode: boolean;
}

/**
 * Builds the ordered list of available OpenAI-compatible fallbacks from env.
 * Order = preference after Gemini: Groq, Cerebras, Mistral, OpenRouter,
 * SambaNova, GitHub Models, Cloudflare. Default models are env-overridable.
 */
function buildProviders(): OpenAICompatProvider[] {
  const env = process.env;
  const providers: OpenAICompatProvider[] = [];

  if (env.GROQ_API_KEY) {
    providers.push({
      id: "groq",
      label: "Groq",
      model: env.GROQ_MODEL?.trim() || "llama-3.3-70b-versatile",
      url: "https://api.groq.com/openai/v1/chat/completions",
      apiKey: env.GROQ_API_KEY,
      supportsJsonMode: true,
    });
  }

  if (env.CEREBRAS_API_KEY) {
    providers.push({
      id: "cerebras",
      label: "Cerebras",
      model: env.CEREBRAS_MODEL?.trim() || "llama-3.3-70b",
      url: "https://api.cerebras.ai/v1/chat/completions",
      apiKey: env.CEREBRAS_API_KEY,
      supportsJsonMode: true,
    });
  }

  if (env.MISTRAL_API_KEY) {
    providers.push({
      id: "mistral",
      label: "Mistral",
      model: env.MISTRAL_MODEL?.trim() || "mistral-small-latest",
      url: "https://api.mistral.ai/v1/chat/completions",
      apiKey: env.MISTRAL_API_KEY,
      supportsJsonMode: true,
    });
  }

  if (env.OPENROUTER_API_KEY) {
    providers.push({
      id: "openrouter",
      label: "OpenRouter",
      model:
        env.OPENROUTER_MODEL?.trim() ||
        "meta-llama/llama-3.3-70b-instruct:free",
      url: "https://openrouter.ai/api/v1/chat/completions",
      apiKey: env.OPENROUTER_API_KEY,
      headers: {
        "HTTP-Referer":
          env.OPENROUTER_SITE_URL?.trim() || "https://ai-tinerary.app",
        "X-Title": "AI-tinerary",
      },
      supportsJsonMode: true,
    });
  }

  if (env.SAMBANOVA_API_KEY) {
    providers.push({
      id: "sambanova",
      label: "SambaNova",
      model: env.SAMBANOVA_MODEL?.trim() || "Meta-Llama-3.3-70B-Instruct",
      url: "https://api.sambanova.ai/v1/chat/completions",
      apiKey: env.SAMBANOVA_API_KEY,
      supportsJsonMode: true,
    });
  }

  if (env.GITHUB_MODELS_TOKEN) {
    providers.push({
      id: "github",
      label: "GitHub Models",
      model: env.GITHUB_MODELS_MODEL?.trim() || "openai/gpt-4o-mini",
      url: "https://models.github.ai/inference/chat/completions",
      apiKey: env.GITHUB_MODELS_TOKEN,
      supportsJsonMode: true,
    });
  }

  const cfAccount = env.CLOUDFLARE_ACCOUNT_ID?.trim();
  if (cfAccount && env.CLOUDFLARE_API_TOKEN) {
    providers.push({
      id: "cloudflare",
      label: "Cloudflare Workers AI",
      model:
        env.CLOUDFLARE_MODEL?.trim() ||
        "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
      url: `https://api.cloudflare.com/client/v4/accounts/${cfAccount}/ai/v1/chat/completions`,
      apiKey: env.CLOUDFLARE_API_TOKEN,
      supportsJsonMode: false,
    });
  }

  return providers;
}

// ───────────────────────── Shared schema + prompt ─────────────────────────

const TRANSPORT_MODES = [
  "bus",
  "tram",
  "metro",
  "train",
  "walk",
  "ferry",
  "taxi",
] as const;

const tripResponseSchema = {
  type: "object",
  properties: {
    name: { type: "string" },
    subtitle: { type: "string" },
    description: { type: "string" },
    days: {
      type: "array",
      items: {
        type: "object",
        properties: {
          date: { type: "string" },
          title: { type: "string" },
          summary: { type: "string" },
          activities: {
            type: "array",
            items: {
              type: "object",
              properties: {
                time: { type: "string" },
                title: { type: "string" },
                description: { type: "string" },
                location: { type: "string" },
                tags: { type: "array", items: { type: "string" } },
                durationMins: { type: "integer" },
                transport: {
                  type: "object",
                  properties: {
                    mode: { type: "string", enum: [...TRANSPORT_MODES] },
                    summary: { type: "string" },
                  },
                  required: ["mode", "summary"],
                },
              },
              required: [
                "time",
                "title",
                "description",
                "location",
                "durationMins",
                "transport",
              ],
            },
          },
        },
        required: ["date", "title", "summary", "activities"],
      },
    },
  },
  required: ["name", "subtitle", "description", "days"],
} as const;

interface RawActivity {
  time?: string;
  title?: string;
  description?: string;
  location?: string;
  tags?: string[];
  durationMins?: number;
  transport?: { mode?: string; summary?: string };
}

interface RawDay {
  date?: string;
  title?: string;
  summary?: string;
  activities?: RawActivity[];
}

interface RawTrip {
  name?: string;
  subtitle?: string;
  description?: string;
  days?: RawDay[];
}

function toIsoDate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function datesBetween(startIso: string, endIso: string): string[] {
  const start = new Date(`${startIso}T00:00:00Z`);
  const end = new Date(`${endIso}T00:00:00Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return [];
  const out: string[] = [];
  const cursor = new Date(start);
  while (cursor.getTime() <= end.getTime()) {
    out.push(toIsoDate(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
}

function splitDateTime(value: string): { date: string; time: string } {
  if (!value) return { date: "", time: "" };
  const [datePart, timePartRaw] = value.split("T");
  const timePart = (timePartRaw ?? "").slice(0, 5);
  return { date: datePart ?? "", time: timePart };
}

/**
 * Royalty-free cover photo for a destination. Uses the leading phrase before
 * the first comma ("Lisbona, Portogallo" → "Lisbona") so the search isn't
 * diluted by the country qualifier, and biases the query toward cityscape
 * shots to avoid coats of arms / flags as the first Openverse hit.
 */
async function coverImageFor(destination: string): Promise<string | undefined> {
  const cleaned = destination.trim();
  if (!cleaned) return undefined;
  const primary = cleaned.split(",")[0].trim() || cleaned;
  return lookupImage(`${primary} cityscape`);
}

/**
 * Locale-aware fallback strings used when the model omits a field, so
 * non-Italian trips don't get Italian placeholders.
 */
const AI_FALLBACKS: Record<
  Locale,
  {
    onFoot: string;
    activity: string;
    day: (n: number) => string;
    description: (destination: string) => string;
  }
> = {
  it: {
    onFoot: "A piedi",
    activity: "Attività",
    day: (n) => `Giorno ${n}`,
    description: (d) => `Itinerario per ${d}, generato con AI.`,
  },
  en: {
    onFoot: "On foot",
    activity: "Activity",
    day: (n) => `Day ${n}`,
    description: (d) => `AI-generated itinerary for ${d}.`,
  },
  fr: {
    onFoot: "À pied",
    activity: "Activité",
    day: (n) => `Jour ${n}`,
    description: (d) => `Itinéraire pour ${d}, généré par IA.`,
  },
  es: {
    onFoot: "A pie",
    activity: "Actividad",
    day: (n) => `Día ${n}`,
    description: (d) => `Itinerario para ${d}, generado con IA.`,
  },
  de: {
    onFoot: "Zu Fuß",
    activity: "Aktivität",
    day: (n) => `Tag ${n}`,
    description: (d) => `KI-generierte Reiseroute für ${d}.`,
  },
};

function normalizeTransport(
  raw: RawActivity["transport"],
  locale: Locale = defaultLocale,
): TransportInfo {
  const mode = (TRANSPORT_MODES as readonly string[]).includes(raw?.mode ?? "")
    ? (raw!.mode as TransportInfo["mode"])
    : "walk";
  return {
    mode,
    summary: raw?.summary?.trim() || AI_FALLBACKS[locale].onFoot,
  };
}

/**
 * Resolves the input's accommodations into the canonical `Accommodation[]`
 * shape (`{ id, name }`), pulling from either the new `accommodations`
 * array or the legacy single `accommodation` field. Empty entries are
 * dropped, leading/trailing whitespace is stripped, ids are stable
 * (`acc-1`, `acc-2`, …).
 */
function buildAccommodations(input: GenerateTripInput): Accommodation[] {
  const fromArray = Array.isArray(input.accommodations)
    ? input.accommodations.map((s) => s?.trim()).filter((s): s is string => !!s)
    : [];
  const fromLegacy = input.accommodation?.trim();
  const names = fromArray.length > 0 ? fromArray : fromLegacy ? [fromLegacy] : [];
  const unique: string[] = [];
  const seen = new Set<string>();
  for (const name of names) {
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(name);
  }

  return unique.map((name, i) => ({ id: `acc-${i + 1}`, name }));
}

async function normalizeTrip(
  raw: RawTrip,
  input: GenerateTripInput,
): Promise<Trip> {
  const tripId = `user-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 6)}`;

  const arrival = splitDateTime(input.arrival);
  const departure = splitDateTime(input.departure);
  const startDate = arrival.date;
  const endDate = departure.date;
  const expectedDates = datesBetween(startDate, endDate);

  const rawDays = Array.isArray(raw.days) ? raw.days : [];
  const byDate = new Map<string, RawDay>();
  for (const rd of rawDays) {
    if (rd?.date) byDate.set(rd.date, rd);
  }

  const accommodations = buildAccommodations(input);
  const defaultAccommodationId = accommodations[0]?.id;
  const defaultOrigin = accommodations[0]?.name;
  const locale = normalizeLocale(input.language);
  const fallbacks = AI_FALLBACKS[locale];

  const days: Day[] = expectedDates.map((date, idx) => {
    const rd = byDate.get(date) ?? rawDays[idx] ?? {};
    const dayNumber = idx + 1;
    const dayId = `${tripId}-d${dayNumber}`;
    const activities: Activity[] = (rd.activities ?? []).map((ra, aIdx) => ({
      id: `${dayId}-a${aIdx + 1}`,
      time: ra.time?.trim() || "",
      title: ra.title?.trim() || fallbacks.activity,
      description: ra.description?.trim() || "",
      location: ra.location?.trim() || input.destination,
      tags: Array.isArray(ra.tags) ? ra.tags.filter(Boolean) : undefined,
      durationMins:
        typeof ra.durationMins === "number" && ra.durationMins > 0
          ? Math.round(ra.durationMins)
          : 60,
      mapsUrl: buildMapsUrl(ra.location?.trim() || input.destination, {
        destination: input.destination,
        origin: defaultOrigin,
      }),
      transport: normalizeTransport(ra.transport, locale),
    }));

    return {
      id: dayId,
      day: dayNumber,
      date,
      title: rd.title?.trim() || fallbacks.day(dayNumber),
      summary: rd.summary?.trim() || "",
      activities,
      accommodationId: defaultAccommodationId,
    };
  });

  // Cover image and restaurant verification are independent → run in parallel.
  const [coverImageUrl, verifiedDays] = await Promise.all([
    coverImageFor(input.destination),
    verifyRestaurantsInDays(days, {
      destination: input.destination,
      origin: defaultOrigin,
    }),
  ]);

  return {
    id: tripId,
    name: raw.name?.trim() || input.destination,
    subtitle: raw.subtitle?.trim() || `${startDate} → ${endDate}`,
    description:
      raw.description?.trim() || fallbacks.description(input.destination),
    startDate,
    endDate,
    location: input.destination,
    accommodation: defaultOrigin,
    accommodations: accommodations.length > 0 ? accommodations : undefined,
    coverImageUrl,
    days: dedupeTripDays(verifiedDays),
    isUserCreated: true,
    contentLang: normalizeLocale(input.language),
  };
}

function buildBasePrompt(input: GenerateTripInput): string {
  const arrival = splitDateTime(input.arrival);
  const departure = splitDateTime(input.departure);
  const dates = datesBetween(arrival.date, departure.date);
  const lang = languageName(input.language);

  const accommodations = buildAccommodations(input);
  const hotel = accommodations[0]?.name;
  const accommodationsLine =
    accommodations.length > 1
      ? `Alloggi del viaggio (l'utente li assegnerà ai giorni dopo la generazione): ${accommodations
          .map((a) => `"${a.name}"`)
          .join(", ")}. Pianifica come se ogni notte si dormisse nel più vicino al programma del giorno.`
      : hotel
        ? `Alloggio (punto di partenza ogni mattina): ${hotel}`
        : "";

  return [
    `Sei un assistente di viaggio. Genera un itinerario dettagliato. Scrivi TUTTI i testi rivolti all'utente (name, subtitle, description, title e summary dei giorni, description e transport.summary delle attività) nella lingua: ${lang}.`,
    `Destinazione: ${input.destination}`,
    accommodationsLine,
    `Arrivo: ${arrival.date} alle ${arrival.time || "??:??"}`,
    `Partenza: ${departure.date} alle ${departure.time || "??:??"}`,
    input.notes ? `Note/preferenze utente: ${input.notes}` : "",
    ``,
    `Regole:`,
    `- Crea esattamente un giorno per ciascuna di queste date (in ordine): ${dates.join(", ")}.`,
    `- Ogni giorno deve avere 3-6 attività realistiche, con orari coerenti (campo "time" in formato "HH:MM–HH:MM").`,
    `- Il primo giorno inizia dopo l'orario di arrivo (${arrival.time || "??:??"}).`,
    `- L'ultimo giorno deve finire prima dell'orario di partenza (${departure.time || "??:??"}), prevedendo lo spostamento verso il punto di partenza.`,
    hotel
      ? `- Organizza i percorsi partendo e rientrando all'alloggio${
          accommodations.length > 1 ? " più adatto al giorno" : ` "${hotel}"`
        }; il campo "transport.summary" di ogni attività deve descrivere come muoversi dall'alloggio o dall'attività precedente.`
      : "",
    `- Per ogni attività specifica: time, title, description breve, location, durationMins (numero intero di minuti), transport { mode, summary }.`,
    `- Il campo "location" DEVE essere geocodabile su Google Maps senza ambiguità: usa il nome ufficiale del luogo seguito dalla città e dal paese (es. "Colosseo, Roma, Italia", "Museo del Prado, Madrid, Spagna"). Se conosci l'indirizzo preciso, includilo ("Piazza del Colosseo 1, Roma, Italia"). Evita nomi generici ("centro città", "ristorante tipico"): specifica sempre un POI o un indirizzo reale e verificabile.`,
    `- Per i pasti (pranzo/cena/colazione) scegli SEMPRE un ristorante REALE, attualmente in attività e noto, indicando il nome ufficiale esatto + via e numero civico + città + paese (es. "Trattoria Da Enzo al 29, Via dei Vascellari 29, Roma, Italia"). NON inventare nomi e NON usare descrizioni vaghe ("una trattoria tipica", "un ristorante in zona"). Preferisci locali affermati e ben recensiti.`,
    `- Aggiungi sempre il tag "cibo" alle attività che sono pasti o tappe gastronomiche.`,
    `- Non inventare luoghi: se non sei certo dell'esistenza di un nome, usa un punto di riferimento famoso e realmente esistente nella zona.`,
    `- NON ripetere la stessa attività, lo stesso POI o lo stesso ristorante in giorni diversi né più volte nello stesso giorno: ogni tappa deve essere unica nell'intero itinerario.`,
    `- mode deve essere uno tra: bus, tram, metro, train, walk, ferry, taxi.`,
    `- tags facoltativi (es. "cibo", "cultura", "mare", "relax", "foto", "shopping", "natura", "logistica", "passeggiata").`,
    `- "name" del viaggio breve e accattivante; "subtitle" con date leggibili; "description" 1-2 frasi.`,
    `- Rispondi SOLO con JSON valido conforme allo schema.`,
  ]
    .filter(Boolean)
    .join("\n");
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Pulls a JSON object out of a model response that may be wrapped in markdown
 * fences or surrounded by prose. Falls back to the trimmed input when no
 * object delimiters are found. Needed because some free providers don't honor
 * `response_format: json_object`.
 */
function extractJsonObject(text: string): string {
  let t = text.trim();
  const fenced = t.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fenced) t = fenced[1].trim();
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) {
    t = t.slice(start, end + 1);
  }
  return t;
}

function parseTripJson(text: string, provider: AIProvider): RawTrip {
  try {
    return JSON.parse(extractJsonObject(text)) as RawTrip;
  } catch {
    throw new AIError(
      "Risposta AI non in formato JSON valido.",
      "empty",
      undefined,
      provider,
    );
  }
}

// ───────────────────────── Gemini provider ─────────────────────────

interface GeminiErrorShape {
  error?: {
    status?: string;
    message?: string;
    details?: Array<{
      "@type"?: string;
      retryDelay?: string;
    }>;
  };
}

function parseGeminiRetryAfter(
  res: Response,
  errJson: GeminiErrorShape,
): number | undefined {
  const header = res.headers.get("retry-after");
  if (header) {
    const asNum = Number(header);
    if (!Number.isNaN(asNum) && asNum > 0) return Math.ceil(asNum);
    const asDate = Date.parse(header);
    if (!Number.isNaN(asDate)) {
      const secs = Math.max(0, Math.ceil((asDate - Date.now()) / 1000));
      return secs || undefined;
    }
  }
  for (const d of errJson.error?.details ?? []) {
    const m = d?.retryDelay?.match(/^(\d+(?:\.\d+)?)s$/);
    if (m) return Math.ceil(Number(m[1]));
  }
  return undefined;
}

async function callGemini(
  model: string,
  apiKey: string,
  prompt: string,
): Promise<string> {
  const body = {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: tripResponseSchema,
      temperature: 0.7,
    },
  };

  const url = `${GEMINI_BASE}/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (err) {
    throw new AIError(
      err instanceof Error ? err.message : "Errore di rete.",
      "network",
      undefined,
      "gemini",
    );
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    let errJson: GeminiErrorShape = {};
    try {
      errJson = JSON.parse(errText) as GeminiErrorShape;
    } catch {
      // non-JSON body
    }
    const apiMsg = errJson.error?.message?.trim();

    if (res.status === 429) {
      throw new AIError(
        apiMsg || "Limite di richieste Gemini raggiunto.",
        "rate_limit",
        parseGeminiRetryAfter(res, errJson),
        "gemini",
      );
    }
    if (res.status === 401 || res.status === 403) {
      throw new AIError(
        apiMsg || "Chiave API Gemini non valida o non autorizzata.",
        "auth",
        undefined,
        "gemini",
      );
    }
    if (
      res.status === 404 ||
      (res.status === 400 && /is not found|not supported/i.test(apiMsg ?? ""))
    ) {
      throw new AIError(
        apiMsg || `Modello Gemini "${model}" non disponibile.`,
        "model_not_found",
        undefined,
        "gemini",
      );
    }
    if (res.status >= 400 && res.status < 500) {
      throw new AIError(
        apiMsg || `Richiesta Gemini rifiutata (status ${res.status}).`,
        "bad_request",
        undefined,
        "gemini",
      );
    }
    // 503 UNAVAILABLE / 500: the model is overloaded ("high demand"). This is
    // transient and very common on gemini-2.5-flash free tier — retry and/or
    // switch to the lite model instead of giving up on Gemini entirely.
    if (
      res.status === 503 ||
      res.status === 500 ||
      /unavailable|overload|high demand/i.test(apiMsg ?? "")
    ) {
      throw new AIError(
        apiMsg || "Modello Gemini momentaneamente sovraccarico.",
        "unavailable",
        undefined,
        "gemini",
      );
    }
    throw new AIError(
      apiMsg || `Gemini ha risposto con status ${res.status}.`,
      "unknown",
      undefined,
      "gemini",
    );
  }

  const json = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new AIError(
      "Gemini non ha restituito contenuto utilizzabile.",
      "empty",
      undefined,
      "gemini",
    );
  }
  return text;
}

async function callGeminiWithRetry(
  model: string,
  apiKey: string,
  prompt: string,
): Promise<string> {
  let lastError: AIError | undefined;
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    try {
      return await callGemini(model, apiKey, prompt);
    } catch (err) {
      if (!(err instanceof AIError)) throw err;
      lastError = err;
      if (
        err.code !== "rate_limit" &&
        err.code !== "network" &&
        err.code !== "unavailable"
      )
        throw err;
      if (attempt === RETRY_DELAYS_MS.length) throw err;
      const suggested = (err.retryAfterSec ?? 0) * 1000;
      const wait = Math.min(
        Math.max(suggested, RETRY_DELAYS_MS[attempt]),
        15000,
      );
      await sleep(wait);
    }
  }
  throw (
    lastError ??
    new AIError("Errore sconosciuto.", "unknown", undefined, "gemini")
  );
}

async function runGemini(
  prompt: string,
  input: GenerateTripInput,
): Promise<Trip> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new AIError(
      "GEMINI_API_KEY non configurata.",
      "auth",
      undefined,
      "gemini",
    );
  }

  let text: string;
  try {
    text = await callGeminiWithRetry(GEMINI_PRIMARY_MODEL, apiKey, prompt);
  } catch (err) {
    const shouldSwitchModel =
      err instanceof AIError &&
      (err.code === "rate_limit" ||
        err.code === "model_not_found" ||
        err.code === "unavailable") &&
      GEMINI_FALLBACK_MODEL !== GEMINI_PRIMARY_MODEL;

    if (shouldSwitchModel) {
      text = await callGeminiWithRetry(GEMINI_FALLBACK_MODEL, apiKey, prompt);
    } else {
      throw err;
    }
  }

  return normalizeTrip(parseTripJson(text, "gemini"), input);
}

// ───────────────────────── OpenAI-compatible provider runner ─────────────────────────

/**
 * Calls any OpenAI-compatible chat-completions endpoint. The expected JSON
 * schema is appended to the user message (and `response_format: json_object`
 * is requested when supported) so every provider returns a single JSON object.
 * Error handling mirrors the previous Groq path, tagging errors with the
 * provider id so the orchestrator's fallback logic and the UI work uniformly.
 */
async function callOpenAICompat(
  provider: OpenAICompatProvider,
  prompt: string,
  schema: object,
): Promise<string> {
  const body: Record<string, unknown> = {
    model: provider.model,
    messages: [
      {
        role: "system",
        content:
          "Sei un assistente di viaggio. Rispondi sempre con un JSON valido, senza testo aggiuntivo.",
      },
      {
        role: "user",
        content: `${prompt}\n\nFormato richiesto (JSON object con questa forma):\n${JSON.stringify(schema)}`,
      },
    ],
    temperature: 0.7,
  };
  if (provider.supportsJsonMode) {
    body.response_format = { type: "json_object" };
  }

  let res: Response;
  try {
    res = await fetch(provider.url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${provider.apiKey}`,
        ...(provider.headers ?? {}),
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    throw new AIError(
      err instanceof Error ? err.message : "Errore di rete.",
      "network",
      undefined,
      provider.id,
    );
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    let apiMsg: string | undefined;
    try {
      const parsed = JSON.parse(errText) as {
        error?: { message?: string; code?: string };
      };
      apiMsg = parsed.error?.message?.trim();
    } catch {
      apiMsg = errText.slice(0, 300);
    }

    const retryAfter = Number(res.headers.get("retry-after"));
    const retryAfterSec =
      Number.isFinite(retryAfter) && retryAfter > 0
        ? Math.ceil(retryAfter)
        : undefined;

    if (res.status === 429) {
      throw new AIError(
        apiMsg || `Limite di richieste ${provider.label} raggiunto.`,
        "rate_limit",
        retryAfterSec,
        provider.id,
      );
    }
    if (res.status === 401 || res.status === 403) {
      throw new AIError(
        apiMsg || `Chiave API ${provider.label} non valida o non autorizzata.`,
        "auth",
        undefined,
        provider.id,
      );
    }
    if (
      res.status === 404 ||
      (res.status === 400 &&
        /model.*(not.?found|decommissioned|does not exist|not supported)/i.test(
          apiMsg ?? "",
        ))
    ) {
      throw new AIError(
        apiMsg || `Modello ${provider.label} "${provider.model}" non disponibile.`,
        "model_not_found",
        undefined,
        provider.id,
      );
    }
    if (res.status >= 400 && res.status < 500) {
      throw new AIError(
        apiMsg || `Richiesta ${provider.label} rifiutata (status ${res.status}).`,
        "bad_request",
        undefined,
        provider.id,
      );
    }
    throw new AIError(
      apiMsg || `${provider.label} ha risposto con status ${res.status}.`,
      "unknown",
      undefined,
      provider.id,
    );
  }

  const json = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const text = json.choices?.[0]?.message?.content;
  if (!text) {
    throw new AIError(
      `${provider.label} non ha restituito contenuto utilizzabile.`,
      "empty",
      undefined,
      provider.id,
    );
  }
  return text;
}

async function runOpenAICompat(
  provider: OpenAICompatProvider,
  prompt: string,
  input: GenerateTripInput,
): Promise<Trip> {
  const text = await callOpenAICompat(provider, prompt, tripResponseSchema);
  return normalizeTrip(parseTripJson(text, provider.id), input);
}

// ───────────────────────── Provider fallback policy ─────────────────────────

/**
 * Error codes from the first (preferred) provider that should trigger an
 * automatic attempt with the next provider. Shared between the trip-level
 * and the single-activity generators.
 */
const FALLBACK_CODES: ReadonlySet<AIError["code"]> = new Set([
  "rate_limit",
  "auth",
  "model_not_found",
  "unavailable",
  "network",
  "empty",
  "unknown",
]);

// ───────────────────────── Single-activity generation ─────────────────────────

export interface GenerateActivityInput {
  /** Trip destination (used as Maps disambiguator + AI context). */
  destination: string;
  /** Optional accommodation, used as the directions origin. */
  accommodation?: string;
  /** Free-form place / POI / landmark the user wants to visit. */
  placeOfInterest: string;
  /** YYYY-MM-DD of the day the activity belongs to (for context). */
  dayDate?: string;
  /** Desired start time, "HH:MM". */
  startTime?: string;
  /** Optional duration in minutes; when omitted the AI picks a reasonable one. */
  durationMins?: number;
  /** Free-form preferences. */
  notes?: string;
  /** UI locale (it/en/fr/es/de); the activity text is generated in this language. */
  language?: string;
  /** Activities already in the trip/day — used to avoid generating duplicates. */
  existingActivities?: { title: string; location: string }[];
}

const activityResponseSchema = {
  type: "object",
  properties: {
    title: { type: "string" },
    description: { type: "string" },
    location: { type: "string" },
    tags: { type: "array", items: { type: "string" } },
    durationMins: { type: "integer" },
    transport: {
      type: "object",
      properties: {
        mode: { type: "string", enum: [...TRANSPORT_MODES] },
        summary: { type: "string" },
      },
      required: ["mode", "summary"],
    },
  },
  required: ["title", "description", "location", "durationMins", "transport"],
} as const;

interface RawSingleActivity {
  title?: string;
  description?: string;
  location?: string;
  tags?: string[];
  durationMins?: number;
  transport?: { mode?: string; summary?: string };
}

function buildActivityPrompt(input: GenerateActivityInput): string {
  const startTime = input.startTime?.trim();
  const hotel = input.accommodation?.trim();
  const lang = languageName(input.language);
  const existing = (input.existingActivities ?? []).filter(
    (a) => a.title?.trim() || a.location?.trim(),
  );
  const existingLine =
    existing.length > 0
      ? `Attività già presenti nel viaggio (NON ripetere lo stesso POI/ristorante): ${existing
          .map((a) => `"${a.title}" @ ${a.location}`)
          .join("; ")}.`
      : "";
  return [
    `Sei un assistente di viaggio. Genera UNA sola attività di viaggio. Scrivi title, description e transport.summary nella lingua: ${lang}.`,
    `Destinazione del viaggio: ${input.destination}`,
    existingLine,
    hotel ? `Alloggio (punto di partenza): ${hotel}` : "",
    input.dayDate ? `Data: ${input.dayDate}` : "",
    `Luogo di interesse richiesto dall'utente: "${input.placeOfInterest}"`,
    startTime ? `Orario di inizio: ${startTime}` : "",
    typeof input.durationMins === "number"
      ? `Durata desiderata: ${input.durationMins} minuti`
      : "",
    input.notes ? `Note utente: ${input.notes}` : "",
    ``,
    `Regole:`,
    `- Restituisci SOLO i campi: title, description, location, tags (facoltativo), durationMins, transport { mode, summary }.`,
    `- "title" breve e concreto (max ~60 caratteri).`,
    `- "description" 1-2 frasi che spiegano cosa fare e perché vale la pena.`,
    `- "location" DEVE essere geocodabile su Google Maps senza ambiguità: nome ufficiale del POI seguito da città e paese (es. "Colosseo, Roma, Italia"). Se conosci l'indirizzo, includilo. Non inventare luoghi.`,
    `- Se è un ristorante o un pasto, scegli un locale REALE e in attività con nome ufficiale esatto + via e numero + città + paese, e aggiungi il tag "cibo". Niente nomi inventati o generici.`,
    `- Se l'utente ha indicato un luogo non famoso o ambiguo, scegli il punto di interesse più vicino e realmente esistente che meglio corrisponde.`,
    `- NON duplicare un'attività già elencata nel viaggio (stesso luogo o stesso ristorante).`,
    `- "durationMins" è un intero realistico (intero, in minuti).`,
    `- "transport.mode" tra: bus, tram, metro, train, walk, ferry, taxi.`,
    `- "transport.summary" descrive come arrivare ${hotel ? `dall'alloggio "${hotel}"` : "dal centro"} al luogo.`,
    `- Rispondi SOLO con JSON valido conforme allo schema.`,
  ]
    .filter(Boolean)
    .join("\n");
}

async function callGeminiActivity(
  apiKey: string,
  prompt: string,
  model: string,
  schema: object = activityResponseSchema,
): Promise<string> {
  const body = {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: schema,
      temperature: 0.7,
    },
  };
  const url = `${GEMINI_BASE}/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (err) {
    // A thrown TypeError would skip provider fallback in the callers.
    throw new AIError(
      err instanceof Error ? err.message : "Errore di rete.",
      "network",
      undefined,
      "gemini",
    );
  }
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    let apiMsg: string | undefined;
    try {
      apiMsg = (JSON.parse(errText) as GeminiErrorShape).error?.message?.trim();
    } catch {
      apiMsg = errText.slice(0, 300);
    }
    if (res.status === 429) {
      throw new AIError(
        apiMsg || "Limite Gemini raggiunto.",
        "rate_limit",
        undefined,
        "gemini",
      );
    }
    if (res.status === 401 || res.status === 403) {
      throw new AIError(
        apiMsg || "Chiave Gemini non valida.",
        "auth",
        undefined,
        "gemini",
      );
    }
    if (res.status === 404) {
      throw new AIError(
        apiMsg || "Modello Gemini non disponibile.",
        "model_not_found",
        undefined,
        "gemini",
      );
    }
    if (
      res.status === 503 ||
      res.status === 500 ||
      /unavailable|overload|high demand/i.test(apiMsg ?? "")
    ) {
      throw new AIError(
        apiMsg || "Modello Gemini momentaneamente sovraccarico.",
        "unavailable",
        undefined,
        "gemini",
      );
    }
    throw new AIError(
      apiMsg || `Gemini status ${res.status}`,
      "unknown",
      undefined,
      "gemini",
    );
  }
  const json = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text)
    throw new AIError("Gemini risposta vuota.", "empty", undefined, "gemini");
  return text;
}

export interface GenerateActivityResult {
  /** Activity-shaped fields (no `id` — caller assigns one). */
  activity: Omit<Activity, "id">;
  provider: AIProvider;
}

/**
 * Generates a single activity from a free-form place/POI. Tries Gemini first
 * and falls back to Groq for the same set of recoverable error codes the
 * full-trip generator uses.
 */
export async function generateActivity(
  input: GenerateActivityInput,
): Promise<GenerateActivityResult> {
  const place = input.placeOfInterest?.trim();
  if (!place) {
    throw new AIError("Specifica un luogo di interesse.", "bad_request");
  }
  if (!input.destination?.trim()) {
    throw new AIError("Destinazione mancante.", "bad_request");
  }

  const prompt = buildActivityPrompt({ ...input, placeOfInterest: place });
  const geminiKey = process.env.GEMINI_API_KEY;
  const compatProviders = buildProviders();

  if (!geminiKey && compatProviders.length === 0) {
    throw new AIError("Nessuna chiave AI configurata.", "no_provider");
  }

  // Ordered attempts: Gemini first (when available), then each OpenAI-compatible
  // fallback. Each attempt yields the raw model text.
  const attempts: { id: AIProvider; getText: () => Promise<string> }[] = [];
  if (geminiKey) {
    attempts.push({
      id: "gemini",
      getText: async () => {
        try {
          return await callGeminiActivity(
            geminiKey,
            prompt,
            GEMINI_PRIMARY_MODEL,
          );
        } catch (e) {
          // On overload / rate-limit / missing model, retry on the lite model
          // before handing off to other providers.
          if (
            e instanceof AIError &&
            (e.code === "unavailable" ||
              e.code === "rate_limit" ||
              e.code === "model_not_found") &&
            GEMINI_FALLBACK_MODEL !== GEMINI_PRIMARY_MODEL
          ) {
            return await callGeminiActivity(
              geminiKey,
              prompt,
              GEMINI_FALLBACK_MODEL,
            );
          }
          throw e;
        }
      },
    });
  }
  for (const p of compatProviders) {
    attempts.push({
      id: p.id,
      getText: () => callOpenAICompat(p, prompt, activityResponseSchema),
    });
  }

  let primaryError: AIError | undefined;
  for (let i = 0; i < attempts.length; i++) {
    const { id: provider, getText } = attempts[i];
    try {
      const text = await getText();
      const raw = JSON.parse(extractJsonObject(text)) as RawSingleActivity;
      const location = raw.location?.trim() || place;
      const activity: Omit<Activity, "id"> = {
        time: input.startTime ? input.startTime : "",
        title: raw.title?.trim() || place,
        description: raw.description?.trim() || "",
        location,
        tags: Array.isArray(raw.tags) ? raw.tags.filter(Boolean) : undefined,
        durationMins:
          typeof raw.durationMins === "number" && raw.durationMins > 0
            ? Math.round(raw.durationMins)
            : (input.durationMins ?? 60),
        mapsUrl: buildMapsUrl(location, {
          destination: input.destination,
          origin: input.accommodation,
        }),
        transport: normalizeTransport(
          raw.transport,
          normalizeLocale(input.language),
        ),
      };
      // Only snap/replace when this is actually a restaurant, so a user-chosen
      // landmark is never swapped for an eatery.
      const finalActivity = isRestaurant({
        tags: activity.tags,
        title: activity.title,
      })
        ? await verifyRestaurantActivity(activity, {
            destination: input.destination,
            origin: input.accommodation,
          })
        : activity;
      const existing = input.existingActivities ?? [];
      if (isDuplicateActivity(finalActivity, existing)) {
        throw new AIError(
          "Questa attività è già presente nel viaggio.",
          "bad_request",
          undefined,
          provider,
        );
      }
      return { activity: finalActivity, provider };
    } catch (err) {
      let aiErr: AIError;
      if (err instanceof AIError) {
        aiErr = err;
      } else if (err instanceof SyntaxError) {
        aiErr = new AIError(
          "Risposta AI non in formato JSON valido.",
          "empty",
          undefined,
          provider,
        );
      } else {
        throw err;
      }
      if (i === 0) primaryError = aiErr;
      const isLast = i === attempts.length - 1;
      if (isLast || !FALLBACK_CODES.has(aiErr.code)) throw aiErr;
    }
  }

  throw primaryError ?? new AIError("Errore sconosciuto.");
}

// ───────────────────────── Orchestrator ─────────────────────────

export async function generateTrip(
  input: GenerateTripInput,
): Promise<GenerateTripResult> {
  if (!input.destination?.trim()) {
    throw new AIError("Destinazione mancante.", "bad_request");
  }
  const arrival = splitDateTime(input.arrival);
  const departure = splitDateTime(input.departure);
  if (!arrival.date || !departure.date) {
    throw new AIError("Date di arrivo/partenza non valide.", "bad_request");
  }
  if (arrival.date > departure.date) {
    throw new AIError(
      "La data di arrivo è successiva alla data di partenza.",
      "bad_request",
    );
  }

  const prompt = buildBasePrompt(input);
  const geminiKey = process.env.GEMINI_API_KEY;
  const compatProviders = buildProviders();

  if (!geminiKey && compatProviders.length === 0) {
    throw new AIError(
      "Nessuna chiave AI configurata. Aggiungi GEMINI_API_KEY o un'altra chiave provider (GROQ_API_KEY, CEREBRAS_API_KEY, …) in .env.local.",
      "no_provider",
    );
  }

  // Preferred order: Gemini first (higher quality JSON schema enforcement),
  // then every available free OpenAI-compatible provider as fallback.
  const attempts: { id: AIProvider; run: () => Promise<Trip> }[] = [];
  if (geminiKey) {
    attempts.push({ id: "gemini", run: () => runGemini(prompt, input) });
  }
  for (const p of compatProviders) {
    attempts.push({ id: p.id, run: () => runOpenAICompat(p, prompt, input) });
  }

  let primaryError: AIError | undefined;
  for (let i = 0; i < attempts.length; i++) {
    const { id: provider, run } = attempts[i];
    try {
      const trip = await run();
      return { trip, provider, fellBack: i > 0 };
    } catch (err) {
      if (!(err instanceof AIError)) throw err;
      if (i === 0) primaryError = err;
      const isLast = i === attempts.length - 1;
      if (isLast || !FALLBACK_CODES.has(err.code)) throw err;
      // otherwise: loop to the next provider
    }
  }

  // Unreachable, but keeps TS happy.
  throw primaryError ?? new AIError("Errore sconosciuto.");
}

// ───────────────────────── Trip translation ─────────────────────────

const translateResponseSchema = {
  type: "object",
  properties: {
    name: { type: "string" },
    subtitle: { type: "string" },
    description: { type: "string" },
    days: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          summary: { type: "string" },
          activities: {
            type: "array",
            items: {
              type: "object",
              properties: {
                title: { type: "string" },
                description: { type: "string" },
                transportSummary: { type: "string" },
              },
              required: ["title", "description", "transportSummary"],
            },
          },
        },
        required: ["title", "summary", "activities"],
      },
    },
  },
  required: ["name", "subtitle", "description", "days"],
} as const;

interface RawTranslatedActivity {
  title?: string;
  description?: string;
  transportSummary?: string;
}
interface RawTranslatedDay {
  title?: string;
  summary?: string;
  activities?: RawTranslatedActivity[];
}
interface RawTranslatedTrip {
  name?: string;
  subtitle?: string;
  description?: string;
  days?: RawTranslatedDay[];
}

export interface TranslateTripResult {
  trip: Trip;
  provider: AIProvider;
}

/** Compact, translatable view of a trip (text fields only, structure preserved). */
function buildTranslatablePayload(trip: Trip): RawTranslatedTrip {
  return {
    name: trip.name,
    subtitle: trip.subtitle ?? "",
    description: trip.description,
    days: trip.days.map((d) => ({
      title: d.title,
      summary: d.summary,
      activities: d.activities.map((a) => ({
        title: a.title,
        description: a.description,
        transportSummary: a.transport?.summary ?? "",
      })),
    })),
  };
}

function buildTranslatePrompt(trip: Trip, lang: string): string {
  return [
    `Sei un traduttore professionista. Traduci i testi del seguente itinerario di viaggio nella lingua: ${lang}.`,
    `Regole:`,
    `- Mantieni ESATTAMENTE la stessa struttura JSON, lo stesso numero di giorni e di attività, nello stesso ordine.`,
    `- Traduci SOLO i valori testuali: name, subtitle, description, days[].title, days[].summary, days[].activities[].title, days[].activities[].description, days[].activities[].transportSummary.`,
    `- NON tradurre né modificare nomi propri di luoghi, monumenti, ristoranti, vie o indirizzi quando compaiono: lasciali nella forma originale (servono per la geolocalizzazione).`,
    `- Non aggiungere né rimuovere campi.`,
    `- Rispondi SOLO con JSON valido con la stessa forma dell'input.`,
    ``,
    `Input:`,
    JSON.stringify(buildTranslatablePayload(trip)),
  ].join("\n");
}

/** Merges the translated text back onto the trip, preserving all other fields. */
function mergeTranslatedTrip(
  trip: Trip,
  raw: RawTranslatedTrip,
  targetLang: string,
): Trip {
  const days: Day[] = trip.days.map((day, dIdx) => {
    const rd = raw.days?.[dIdx];
    const activities: Activity[] = day.activities.map((act, aIdx) => {
      const ra = rd?.activities?.[aIdx];
      const summary = ra?.transportSummary?.trim();
      return {
        ...act,
        title: ra?.title?.trim() || act.title,
        description: ra?.description?.trim() || act.description,
        transport: act.transport
          ? { ...act.transport, summary: summary || act.transport.summary }
          : act.transport,
      };
    });
    return {
      ...day,
      title: rd?.title?.trim() || day.title,
      summary: rd?.summary?.trim() || day.summary,
      activities,
    };
  });

  return {
    ...trip,
    name: raw.name?.trim() || trip.name,
    subtitle: raw.subtitle?.trim() || trip.subtitle,
    description: raw.description?.trim() || trip.description,
    days,
    contentLang: normalizeLocale(targetLang),
  };
}

/**
 * Re-translates an existing trip's user-facing text into `targetLang`, reusing
 * the same Gemini-first → OpenAI-compatible provider fallback chain. Geocodable
 * fields (locations, addresses), times, ids, images and coordinates are
 * preserved untouched.
 */
export async function translateTrip(
  trip: Trip,
  targetLang: string,
): Promise<TranslateTripResult> {
  const lang = languageName(targetLang);
  const prompt = buildTranslatePrompt(trip, lang);

  const geminiKey = process.env.GEMINI_API_KEY;
  const compatProviders = buildProviders();
  if (!geminiKey && compatProviders.length === 0) {
    throw new AIError("Nessuna chiave AI configurata.", "no_provider");
  }

  const attempts: { id: AIProvider; getText: () => Promise<string> }[] = [];
  if (geminiKey) {
    attempts.push({
      id: "gemini",
      getText: async () => {
        try {
          return await callGeminiActivity(
            geminiKey,
            prompt,
            GEMINI_PRIMARY_MODEL,
            translateResponseSchema,
          );
        } catch (e) {
          if (
            e instanceof AIError &&
            (e.code === "unavailable" ||
              e.code === "rate_limit" ||
              e.code === "model_not_found") &&
            GEMINI_FALLBACK_MODEL !== GEMINI_PRIMARY_MODEL
          ) {
            return await callGeminiActivity(
              geminiKey,
              prompt,
              GEMINI_FALLBACK_MODEL,
              translateResponseSchema,
            );
          }
          throw e;
        }
      },
    });
  }
  for (const p of compatProviders) {
    attempts.push({
      id: p.id,
      getText: () => callOpenAICompat(p, prompt, translateResponseSchema),
    });
  }

  let primaryError: AIError | undefined;
  for (let i = 0; i < attempts.length; i++) {
    const { id: provider, getText } = attempts[i];
    try {
      const text = await getText();
      const raw = JSON.parse(extractJsonObject(text)) as RawTranslatedTrip;
      return { trip: mergeTranslatedTrip(trip, raw, targetLang), provider };
    } catch (err) {
      let aiErr: AIError;
      if (err instanceof AIError) {
        aiErr = err;
      } else if (err instanceof SyntaxError) {
        aiErr = new AIError(
          "Risposta AI non in formato JSON valido.",
          "empty",
          undefined,
          provider,
        );
      } else {
        throw err;
      }
      if (i === 0) primaryError = aiErr;
      const isLast = i === attempts.length - 1;
      if (isLast || !FALLBACK_CODES.has(aiErr.code)) throw aiErr;
    }
  }

  throw primaryError ?? new AIError("Errore sconosciuto.");
}

// ───────────────────────── Trip form voice parsing ─────────────────────────

// All fields required: Gemini structured output omits optional properties,
// which silently dropped arrival/departure even when dates were spoken.
const parseTripFormSchema = {
  type: "object",
  properties: {
    destination: {
      type: "string",
      description: 'Città/area del viaggio, "" se assente',
    },
    arrival: {
      type: "string",
      description: 'Data-ora arrivo formato "YYYY-MM-DDTHH:MM", "" se assente',
    },
    departure: {
      type: "string",
      description: 'Data-ora partenza formato "YYYY-MM-DDTHH:MM", "" se assente',
    },
    accommodations: {
      type: "array",
      items: { type: "string" },
      description: "Nomi/indirizzi alloggi menzionati, [] se nessuno",
    },
    notes: {
      type: "string",
      description: 'Preferenze/stile di viaggio, "" se assenti',
    },
  },
  required: ["destination", "arrival", "departure", "accommodations", "notes"],
} as const;

interface RawParsedTripForm {
  destination?: string;
  arrival?: string;
  departure?: string;
  accommodations?: string[];
  notes?: string;
}

export interface ParseTripFormInput {
  transcript: string;
  language?: string;
  /** YYYY-MM-DD anchor for relative dates ("next weekend", …). */
  referenceDate?: string;
}

export interface ParsedTripForm {
  destination?: string;
  /** datetime-local compatible: YYYY-MM-DDTHH:MM */
  arrival?: string;
  departure?: string;
  accommodations?: string[];
  notes?: string;
}

export interface ParseTripFormResult {
  form: ParsedTripForm;
  provider: AIProvider;
}

function normalizeDateTimeLocal(value: string, defaultTime: string): string | undefined {
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(trimmed)) {
    return trimmed.slice(0, 16);
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return `${trimmed}T${defaultTime}`;
  }
  return undefined;
}

function normalizeParsedTripForm(raw: RawParsedTripForm): ParsedTripForm {
  const form: ParsedTripForm = {};
  const dest = raw.destination?.trim();
  if (dest) form.destination = dest;

  const arrival = raw.arrival?.trim()
    ? normalizeDateTimeLocal(raw.arrival, "10:00")
    : undefined;
  const departure = raw.departure?.trim()
    ? normalizeDateTimeLocal(raw.departure, "18:00")
    : undefined;
  if (arrival) form.arrival = arrival;
  if (departure) form.departure = departure;

  const accs = Array.isArray(raw.accommodations)
    ? raw.accommodations.map((a) => a?.trim()).filter((a): a is string => !!a)
    : [];
  if (accs.length > 0) form.accommodations = accs;

  const notes = raw.notes?.trim();
  if (notes) form.notes = notes;

  if (
    form.arrival &&
    form.departure &&
    form.arrival >= form.departure
  ) {
    delete form.departure;
  }

  return form;
}

function buildParseTripFormPrompt(input: ParseTripFormInput): string {
  const ref =
    input.referenceDate?.trim() ||
    new Date().toISOString().slice(0, 10);
  const lang = languageName(input.language);
  return [
    `Sei un assistente che estrae informazioni di viaggio da un testo parlato o scritto liberamente.`,
    `Lingua dell'utente: ${lang}.`,
    `Data di riferimento (oggi): ${ref}. Usala per interpretare date relative ("prossimo weekend", "tra 2 settimane", "next Friday").`,
    `Regole:`,
    `- Estrai SOLO ciò che è esplicito o chiaramente inferibile dal testo.`,
    `- NON inventare destinazione o date se assenti o ambigue: usa stringa vuota "" per i campi mancanti.`,
    `- "destination": città/area con paese se possibile (es. "Lisbona, Portogallo").`,
    `- "arrival" e "departure": formato "YYYY-MM-DDTHH:MM" (24h). Se manca l'ora usa 10:00 per arrivo e 18:00 per partenza.`,
    `- "accommodations": array di nomi/indirizzi hotel menzionati (array vuoto se nessuno).`,
    `- "notes": preferenze stile viaggio, budget, interessi — testo libero (stringa vuota se nessuna).`,
    `- Rispondi SOLO con JSON valido conforme allo schema.`,
    ``,
    `Testo utente:`,
    input.transcript.trim(),
  ].join("\n");
}

/**
 * Parses free-form speech/text into structured new-trip form fields.
 * Uses the same Gemini-first → OpenAI-compatible fallback chain.
 */
export async function parseTripFormFromSpeech(
  input: ParseTripFormInput,
): Promise<ParseTripFormResult> {
  const transcript = input.transcript?.trim();
  if (!transcript) {
    throw new AIError("Testo vuoto.", "bad_request");
  }

  const prompt = buildParseTripFormPrompt(input);
  const geminiKey = process.env.GEMINI_API_KEY;
  const compatProviders = buildProviders();
  if (!geminiKey && compatProviders.length === 0) {
    throw new AIError("Nessuna chiave AI configurata.", "no_provider");
  }

  const attempts: { id: AIProvider; getText: () => Promise<string> }[] = [];
  if (geminiKey) {
    attempts.push({
      id: "gemini",
      getText: async () => {
        try {
          return await callGeminiActivity(
            geminiKey,
            prompt,
            GEMINI_PRIMARY_MODEL,
            parseTripFormSchema,
          );
        } catch (e) {
          if (
            e instanceof AIError &&
            (e.code === "unavailable" ||
              e.code === "rate_limit" ||
              e.code === "model_not_found") &&
            GEMINI_FALLBACK_MODEL !== GEMINI_PRIMARY_MODEL
          ) {
            return await callGeminiActivity(
              geminiKey,
              prompt,
              GEMINI_FALLBACK_MODEL,
              parseTripFormSchema,
            );
          }
          throw e;
        }
      },
    });
  }
  for (const p of compatProviders) {
    attempts.push({
      id: p.id,
      getText: () => callOpenAICompat(p, prompt, parseTripFormSchema),
    });
  }

  let primaryError: AIError | undefined;
  for (let i = 0; i < attempts.length; i++) {
    const { id: provider, getText } = attempts[i];
    try {
      const text = await getText();
      const raw = JSON.parse(extractJsonObject(text)) as RawParsedTripForm;
      return { form: normalizeParsedTripForm(raw), provider };
    } catch (err) {
      let aiErr: AIError;
      if (err instanceof AIError) {
        aiErr = err;
      } else if (err instanceof SyntaxError) {
        aiErr = new AIError(
          "Risposta AI non in formato JSON valido.",
          "empty",
          undefined,
          provider,
        );
      } else {
        throw err;
      }
      if (i === 0) primaryError = aiErr;
      const isLast = i === attempts.length - 1;
      if (isLast || !FALLBACK_CODES.has(aiErr.code)) throw aiErr;
    }
  }

  throw primaryError ?? new AIError("Errore sconosciuto.");
}
