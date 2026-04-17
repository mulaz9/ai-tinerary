import { Activity, Day, Trip, TransportInfo } from "../types";
import { lookupImage } from "./images";

export interface GenerateTripInput {
  destination: string;
  arrival: string;
  departure: string;
  notes?: string;
  /** Optional place the traveller is staying at (hotel, airbnb, address…).
   *  Used as the directions origin for every activity and as a planning
   *  anchor in the prompt (morning routes start from the hotel etc.). */
  accommodation?: string;
}

export type AIProvider = "gemini" | "groq";

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
  process.env.GEMINI_MODEL?.trim() || "gemini-2.5-flash";
const GEMINI_FALLBACK_MODEL = "gemini-2.5-flash-lite";
const GEMINI_BASE =
  "https://generativelanguage.googleapis.com/v1beta/models";

const GROQ_MODEL = process.env.GROQ_MODEL?.trim() || "llama-3.3-70b-versatile";
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

const RETRY_DELAYS_MS = [1500, 4000];

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
 * Builds a Google Maps link. When an accommodation is known, the link opens
 * the directions view from the hotel to the activity; otherwise it falls
 * back to a simple search for the destination.
 */
function buildMapsUrl(destination: string, accommodation?: string): string {
  const dest = encodeURIComponent(destination);
  const origin = accommodation?.trim();
  if (origin) {
    return (
      `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(
        origin,
      )}&destination=${dest}`
    );
  }
  return `https://www.google.com/maps/search/?api=1&query=${dest}`;
}

function normalizeTransport(raw: RawActivity["transport"]): TransportInfo {
  const mode = (TRANSPORT_MODES as readonly string[]).includes(raw?.mode ?? "")
    ? (raw!.mode as TransportInfo["mode"])
    : "walk";
  return {
    mode,
    summary: raw?.summary?.trim() || "A piedi",
  };
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

  const days: Day[] = expectedDates.map((date, idx) => {
    const rd = byDate.get(date) ?? rawDays[idx] ?? {};
    const dayNumber = idx + 1;
    const dayId = `${tripId}-d${dayNumber}`;
    const activities: Activity[] = (rd.activities ?? []).map((ra, aIdx) => ({
      id: `${dayId}-a${aIdx + 1}`,
      time: ra.time?.trim() || "",
      title: ra.title?.trim() || "Attività",
      description: ra.description?.trim() || "",
      location: ra.location?.trim() || input.destination,
      tags: Array.isArray(ra.tags) ? ra.tags.filter(Boolean) : undefined,
      durationMins:
        typeof ra.durationMins === "number" && ra.durationMins > 0
          ? Math.round(ra.durationMins)
          : 60,
      mapsUrl: buildMapsUrl(
        ra.location?.trim() || input.destination,
        input.accommodation,
      ),
      transport: normalizeTransport(ra.transport),
    }));

    return {
      id: dayId,
      day: dayNumber,
      date,
      title: rd.title?.trim() || `Giorno ${dayNumber}`,
      summary: rd.summary?.trim() || "",
      activities,
    };
  });

  const coverImageUrl = await coverImageFor(input.destination);

  return {
    id: tripId,
    name: raw.name?.trim() || input.destination,
    subtitle: raw.subtitle?.trim() || `${startDate} → ${endDate}`,
    description:
      raw.description?.trim() ||
      `Itinerario per ${input.destination}, generato con AI.`,
    startDate,
    endDate,
    location: input.destination,
    accommodation: input.accommodation?.trim() || undefined,
    coverImageUrl,
    days,
    isUserCreated: true,
  };
}

function buildBasePrompt(input: GenerateTripInput): string {
  const arrival = splitDateTime(input.arrival);
  const departure = splitDateTime(input.departure);
  const dates = datesBetween(arrival.date, departure.date);

  const hotel = input.accommodation?.trim();

  return [
    `Sei un assistente di viaggio. Genera un itinerario dettagliato in ITALIANO.`,
    `Destinazione: ${input.destination}`,
    hotel ? `Alloggio (punto di partenza ogni mattina): ${hotel}` : "",
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
      ? `- Organizza i percorsi partendo e rientrando all'alloggio "${hotel}"; il campo "transport.summary" di ogni attività deve descrivere come muoversi dall'alloggio o dall'attività precedente.`
      : "",
    `- Per ogni attività specifica: time, title, description breve, location (luogo preciso), durationMins (numero intero di minuti), transport { mode, summary }.`,
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

function parseTripJson(text: string, provider: AIProvider): RawTrip {
  try {
    return JSON.parse(text) as RawTrip;
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
      if (err.code !== "rate_limit" && err.code !== "network") throw err;
      if (attempt === RETRY_DELAYS_MS.length) throw err;
      const suggested = (err.retryAfterSec ?? 0) * 1000;
      const wait = Math.min(
        Math.max(suggested, RETRY_DELAYS_MS[attempt]),
        15000,
      );
      await sleep(wait);
    }
  }
  throw lastError ?? new AIError("Errore sconosciuto.", "unknown", undefined, "gemini");
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
      (err.code === "rate_limit" || err.code === "model_not_found") &&
      GEMINI_FALLBACK_MODEL !== GEMINI_PRIMARY_MODEL;

    if (shouldSwitchModel) {
      text = await callGemini(GEMINI_FALLBACK_MODEL, apiKey, prompt);
    } else {
      throw err;
    }
  }

  return normalizeTrip(parseTripJson(text, "gemini"), input);
}

// ───────────────────────── Groq provider ─────────────────────────

function buildGroqPrompt(base: string): string {
  return [
    base,
    ``,
    `Formato richiesto (JSON object con questa forma):`,
    JSON.stringify(tripResponseSchema),
  ].join("\n");
}

async function callGroq(apiKey: string, prompt: string): Promise<string> {
  const body = {
    model: GROQ_MODEL,
    messages: [
      {
        role: "system",
        content:
          "Sei un assistente di viaggio. Rispondi sempre con un JSON valido, senza testo aggiuntivo.",
      },
      { role: "user", content: prompt },
    ],
    response_format: { type: "json_object" },
    temperature: 0.7,
  };

  let res: Response;
  try {
    res = await fetch(GROQ_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    throw new AIError(
      err instanceof Error ? err.message : "Errore di rete.",
      "network",
      undefined,
      "groq",
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
        apiMsg || "Limite di richieste Groq raggiunto.",
        "rate_limit",
        retryAfterSec,
        "groq",
      );
    }
    if (res.status === 401 || res.status === 403) {
      throw new AIError(
        apiMsg || "Chiave API Groq non valida o non autorizzata.",
        "auth",
        undefined,
        "groq",
      );
    }
    if (
      res.status === 404 ||
      (res.status === 400 &&
        /model.*(not.?found|decommissioned|does not exist)/i.test(
          apiMsg ?? "",
        ))
    ) {
      throw new AIError(
        apiMsg || `Modello Groq "${GROQ_MODEL}" non disponibile.`,
        "model_not_found",
        undefined,
        "groq",
      );
    }
    if (res.status >= 400 && res.status < 500) {
      throw new AIError(
        apiMsg || `Richiesta Groq rifiutata (status ${res.status}).`,
        "bad_request",
        undefined,
        "groq",
      );
    }
    throw new AIError(
      apiMsg || `Groq ha risposto con status ${res.status}.`,
      "unknown",
      undefined,
      "groq",
    );
  }

  const json = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const text = json.choices?.[0]?.message?.content;
  if (!text) {
    throw new AIError(
      "Groq non ha restituito contenuto utilizzabile.",
      "empty",
      undefined,
      "groq",
    );
  }
  return text;
}

async function runGroq(
  prompt: string,
  input: GenerateTripInput,
): Promise<Trip> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new AIError(
      "GROQ_API_KEY non configurata.",
      "auth",
      undefined,
      "groq",
    );
  }
  const text = await callGroq(apiKey, buildGroqPrompt(prompt));
  return normalizeTrip(parseTripJson(text, "groq"), input);
}

// ───────────────────────── Orchestrator ─────────────────────────

/**
 * Error codes from the first (preferred) provider that should trigger an
 * automatic attempt with the next provider.
 */
const FALLBACK_CODES: ReadonlySet<AIError["code"]> = new Set([
  "rate_limit",
  "auth",
  "model_not_found",
  "network",
  "empty",
  "unknown",
]);

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
  const hasGemini = !!process.env.GEMINI_API_KEY;
  const hasGroq = !!process.env.GROQ_API_KEY;

  if (!hasGemini && !hasGroq) {
    throw new AIError(
      "Nessuna chiave AI configurata. Aggiungi GEMINI_API_KEY o GROQ_API_KEY in .env.local.",
      "no_provider",
    );
  }

  // Preferred order: Gemini first (higher quality JSON schema enforcement),
  // then Groq as a free, fast fallback.
  const providers: AIProvider[] = [];
  if (hasGemini) providers.push("gemini");
  if (hasGroq) providers.push("groq");

  let primaryError: AIError | undefined;
  for (let i = 0; i < providers.length; i++) {
    const provider = providers[i];
    try {
      const trip =
        provider === "gemini"
          ? await runGemini(prompt, input)
          : await runGroq(prompt, input);
      return { trip, provider, fellBack: i > 0 };
    } catch (err) {
      if (!(err instanceof AIError)) throw err;
      if (i === 0) primaryError = err;
      const isLast = i === providers.length - 1;
      if (isLast || !FALLBACK_CODES.has(err.code)) throw err;
      // otherwise: loop to the next provider
    }
  }

  // Unreachable, but keeps TS happy.
  throw primaryError ?? new AIError("Errore sconosciuto.");
}
