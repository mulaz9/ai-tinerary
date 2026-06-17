# App Privacy — nutrition label (App Store Connect)

Compila in **App Store Connect → App Privacy** quando carichi l'app.

## Dati raccolti dall'app

### Identificatori

| Tipo | Collegato all'identità | Usato per tracking |
|------|------------------------|-------------------|
| User ID (Supabase) | Sì | No |
| Email | Sì | No |

### Dati di contatto

| Tipo | Collegato all'identità | Usato per tracking |
|------|------------------------|-------------------|
| Email | Sì (se login) | No |
| Nome (da Google OAuth) | Sì (opzionale) | No |

### Contenuto utente

| Tipo | Collegato all'identità | Usato per tracking |
|------|------------------------|-------------------|
| Altro contenuto utente (itinerari di viaggio) | Sì (se account) / No (guest locale) | No |

### Dati di utilizzo

| Tipo | Collegato all'identità | Usato per tracking |
|------|------------------------|-------------------|
| Dati di diagnostica (log server) | No | No |

## Finalità dichiarate

- Funzionalità dell'app (autenticazione, sync viaggi)
- Personalizzazione (preferenza lingua)
- Analitica del prodotto (solo se aggiungi analytics in futuro — attualmente **no**)

## Terze parti che ricevono dati

Dichiarare come "Third-Party Sharing":

| Terza parte | Dati condivisi | Finalità |
|-------------|----------------|----------|
| Supabase | Email, user ID, itinerari | Auth + database |
| Google (Gemini) | Testo input utente (prompt viaggio) | Generazione AI |
| Groq (fallback) | Testo input utente | Generazione AI |
| Open-Meteo | Coordinate città (meteo) | Previsioni meteo |
| Nominatim/OSM | Query luoghi | Geocoding |
| OpenFreeMap | Nessun dato personale | Tile mappe |

## Tracking

- **L'app non fa tracking** cross-app per pubblicità
- Nessun IDFA / App Tracking Transparency richiesto attualmente

## Cancellazione dati

- L'utente può eliminare singoli viaggi
- Cancellazione account in-app: `/account` → elimina account + dati cloud
- Guest: dati solo in localStorage sul dispositivo

## Note GDPR

- Privacy Policy: `https://ai-tinerary-nine.vercel.app/privacy`
- Sostituire `privacy@ai-tinerary.app` con email reale del titolare prima della submission
