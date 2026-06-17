# Note per la review Apple (App Store Connect)

Incolla in **App Review Information → Notes** (o nella risposta se richiesta integrazione).

---

## English (for Apple reviewers)

**AI-tinerary** is a travel planning app that generates personalized day-by-day itineraries using AI. It is not a simple website bookmark.

**Core native-app functionality:**
- AI-powered trip generation (server-side, user provides destination/dates/preferences)
- Interactive day-by-day timeline with drag-and-drop activity reordering
- MapLibre interactive maps with activity markers and routes
- Weather forecasts per travel day (Open-Meteo)
- Multi-language support (IT, EN, FR, ES, DE)
- Trip sharing via secure token links
- Optional Google / email authentication with cloud sync (Supabase)

**Account & privacy:**
- Privacy Policy: https://ai-tinerary-nine.vercel.app/privacy
- Account deletion: tap Account (avatar in top bar) → Delete account permanently

**Test account (if needed):**
- The app works fully in guest mode without login (trips saved locally).
- To test cloud sync, sign in with Google or create an email account.

**Microphone / speech:**
- Voice input is optional when creating a new trip. If speech is unavailable on the device, a fallback message is shown and the user can type manually.

**Network:**
- The app requires an internet connection for AI generation, maps, weather, and cloud sync.

---

## Italiano (per riferimento)

L'app genera itinerari personalizzati con AI, include timeline interattiva, mappe MapLibre, meteo e condivisione viaggi. Non è un semplice wrapper del sito web.

Cancellazione account: icona Account in alto a destra → Elimina account.
Privacy: https://ai-tinerary-nine.vercel.app/privacy

---

## Criterio 4.2 — Minimum Functionality

Per evitare rifiuto come "sito web in WebView":

1. L'app offre **generazione AI** e **editing interattivo** non disponibili come semplice sito statico
2. Plugin Capacitor nativi: splash screen, status bar, share sheet, deep links
3. Non descrivere l'app come "versione mobile del sito" nel listing
4. Screenshot che mostrano mappe, timeline e generazione AI — non solo la home page

## Se Apple chiede una demo video

Registra (30–60 sec):
1. Creazione viaggio con AI
2. Apertura mappa con attività
3. Drag-and-drop di un'attività
4. (Opzionale) Login e sync
