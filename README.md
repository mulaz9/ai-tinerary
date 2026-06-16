This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## AI trip generation

The "+ Nuovo viaggio" button on the home page generates a full itinerary
from a destination and arrival/departure date-times. The backend tries
**Google Gemini** first and automatically falls back, in order, to any other
configured provider if Gemini fails (rate-limit, auth problem, model missing,
network error, …). Configuring at least one provider is required.

All supported providers have a free tier. Each is enabled only when its key is
present in `.env.local`, so add as many as you want for more fallback headroom:

| Provider | Env key(s) | Default model | Notes |
| --- | --- | --- | --- |
| Gemini | `GEMINI_API_KEY` | `gemini-2.5-flash-lite` | Primary, native JSON schema (auto-switches to `gemini-2.5-flash` under load) |
| Groq | `GROQ_API_KEY` | `llama-3.3-70b-versatile` | Very fast |
| Cerebras | `CEREBRAS_API_KEY` | `llama-3.3-70b` | Very fast |
| Mistral | `MISTRAL_API_KEY` | `mistral-small-latest` | |
| OpenRouter | `OPENROUTER_API_KEY` | `meta-llama/llama-3.3-70b-instruct:free` | Aggregator, many `:free` models |
| SambaNova | `SAMBANOVA_API_KEY` | `Meta-Llama-3.3-70B-Instruct` | |
| GitHub Models | `GITHUB_MODELS_TOKEN` | `openai/gpt-4o-mini` | Uses a GitHub token |
| Cloudflare Workers AI | `CLOUDFLARE_ACCOUNT_ID` + `CLOUDFLARE_API_TOKEN` | `@cf/meta/llama-3.3-70b-instruct-fp8-fast` | |

Each model is overridable via the matching `*_MODEL` env var (see
`.env.example`). Where to get keys: Groq → [console.groq.com/keys](https://console.groq.com/keys),
Cerebras → [cloud.cerebras.ai](https://cloud.cerebras.ai), Mistral →
[console.mistral.ai](https://console.mistral.ai/api-keys), OpenRouter →
[openrouter.ai/keys](https://openrouter.ai/keys), SambaNova →
[cloud.sambanova.ai](https://cloud.sambanova.ai), GitHub Models →
[github.com/marketplace/models](https://github.com/marketplace/models),
Cloudflare → [dash.cloudflare.com](https://dash.cloudflare.com).

### Option A — Gemini (preferred)

1. Get a free API key at [Google AI Studio](https://aistudio.google.com/app/apikey).
2. Add it to `.env.local` in the project root:

   ```bash
   GEMINI_API_KEY=your_key_here
   ```

Default model: `gemini-2.5-flash-lite` (highest free-tier daily budget and the
most reliable under load). On `rate_limit`, `model_not_found`, or `unavailable`
(503 "high demand") the server retries and then auto-switches to
`gemini-2.5-flash`. Override the primary via `GEMINI_MODEL=...` in `.env.local`.

Approximate free-tier daily request budgets:

| Model | Free quota (per day, approx.) |
| --- | --- |
| `gemini-2.5-flash-lite` (primary) | ~1,000 |
| `gemini-2.5-flash` (fallback) | ~250 |
| `gemini-2.0-flash` | ~200 |

### Option B — Groq (alternative / fallback)

Groq is a free, very fast provider running open models (Llama 3.3 70B by
default). Works on its own, or as an automatic fallback when Gemini fails.

1. Sign up and create a key at [console.groq.com/keys](https://console.groq.com/keys).
2. Add it to `.env.local`:

   ```bash
   GROQ_API_KEY=gsk_your_key_here
   # optional override:
   # GROQ_MODEL=llama-3.3-70b-versatile
   ```

Free tier (at time of writing): ~30 requests/minute and ~14,400
requests/day on `llama-3.3-70b-versatile`.

### Fallback behaviour

The orchestrator tries Gemini first, then walks down the list of configured
providers (Groq, Cerebras, Mistral, OpenRouter, SambaNova, GitHub Models,
Cloudflare) transparently switching to the next on any of: `rate_limit`,
`auth`, `model_not_found`, `network`, `empty`, `unknown`. Invalid user input
(`bad_request`) is returned immediately without a retry. When a fallback is
used, the dialog briefly confirms which provider ultimately produced the
itinerary.

All non-Gemini providers use the OpenAI-compatible `/chat/completions` format,
so adding another such provider is just a new entry in `buildProviders()` in
[`lib/ai.ts`](lib/ai.ts).

## Authentication

Auth is **opt-in** via Supabase. Without it the app still works, just
storing trips locally. With it, signed-in users get cross-device sync.

Currently supported providers:

- **Email + password** (with email confirmation and password reset)
- **Google OAuth**

### Supabase setup

1. Create a project at [supabase.com](https://supabase.com), then add the
   following to `.env.local`:

   ```bash
   NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
   ```

2. In the Supabase dashboard go to **Authentication → URL Configuration**
   and add `http://localhost:3000` (and your production URL) to:

   - **Site URL**
   - **Redirect URLs** (also add `http://localhost:3000/auth/callback`)

3. Enable the providers you want under **Authentication → Providers**:

   - **Email**: enable. Keep "Confirm email" on (recommended). The
     confirmation and reset-password emails are sent automatically.
   - **Google**: enable and paste your Google OAuth client ID + secret.
     Add `https://<project>.supabase.co/auth/v1/callback` to the allowed
     redirect URIs in Google Cloud Console.

4. Run the SQL in `supabase/schema.sql` from the SQL Editor to create the
   `trips` table and row-level-security policies.

The login page lives at `/login` with tabs to switch between sign-in and
sign-up. Password reset uses `/auth/update-password` once the user clicks
the link in the email.

## Trip map

The collapsible **Mappa del viaggio** on trip detail pages uses
**MapLibre GL** with free **OpenFreeMap** vector tiles (no API key, no
billing) for the interactive map, and **OpenStreetMap Nominatim** to place
activity markers. There is nothing to configure — no Google Cloud account or
API key is required.

Optionally set `NOMINATIM_USER_AGENT` in `.env.local` to identify your app to
the Nominatim service (recommended for production, per its usage policy).
Geocoding is rate-limited to ~1 request/second.

**Signed-in users:** after the first geocode, coordinates are stored on each
activity/accommodation as `geo` inside the trip JSON in Supabase, so the map
loads on any device without calling the Geocoding API again (until a
location changes). Guests keep coordinates in `localStorage` only.

## Storage

Trips are stored in the browser's `localStorage`
(key: `ai-tinerary.user-trips.v1`), so they only appear on the device that
generated them. There are no hardcoded trips — the app starts empty and
every itinerary comes from the AI generator. When the user is signed in,
trips are also synced to Supabase via the `trips` table.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
