# AI-tinerary — Android TWA (Google Play)

Wrapper Android separato dal progetto Next.js. L'app carica
`https://ai-tinerary-nine.vercel.app` a schermo intero tramite Trusted Web Activity.

## Prerequisiti

- Node.js 18+
- JDK 17+ (`sudo apt install openjdk-17-jdk`)
- [Android Studio](https://developer.android.com/studio) (Linux)
- Account Google Play Console (25$ una tantum)

## 1. Variabili d'ambiente (repo Next.js / Vercel)

Aggiungi su Vercel:

| Variabile | Uso |
|-----------|-----|
| `NEXT_PUBLIC_SUPABASE_URL` | Auth + sync viaggi |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Client Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Cancellazione account (`/api/account/delete`) |
| `GEMINI_API_KEY` / `GROQ_API_KEY` | Generazione AI |

## 2. Supabase Auth URLs

In **Supabase Dashboard → Authentication → URL Configuration**:

- **Site URL:** `https://ai-tinerary-nine.vercel.app`
- **Redirect URLs:** aggiungi:
  - `https://ai-tinerary-nine.vercel.app/auth/callback`
  - `http://localhost:3000/auth/callback` (sviluppo locale)

Testa OAuth Google su emulatore Android o telefono fisico dopo il deploy PWA.

## 3. Generare il progetto TWA

Dopo il deploy PWA (manifest raggiungibile su produzione):

```bash
cd /path/to/ai-tinerary
mkdir -p mobile/android
cd mobile/android

npx @bubblewrap/cli init \
  --manifest https://ai-tinerary-nine.vercel.app/manifest.webmanifest
```

Risposte consigliate durante `init`:

- **Package name:** `com.aitinerary.app`
- **App name:** `AI-tinerary`
- **Host:** `ai-tinerary-nine.vercel.app`
- **Start URL:** `/`
- **Theme / background color:** `#121212`

Apri in Android Studio:

```bash
npx @bubblewrap/cli open
# oppure: android-studio .
```

## 4. Keystore e Digital Asset Links

### Creare keystore (Linux)

```bash
keytool -genkeypair -v \
  -keystore ai-tinerary-upload.jks \
  -alias upload \
  -keyalg RSA -keysize 2048 -validity 10000
```

**Non committare** il file `.jks`. Conservalo in un password manager.

### Ottenere SHA-256

```bash
keytool -list -v -keystore ai-tinerary-upload.jks -alias upload | grep SHA256
```

### Aggiornare assetlinks.json

Nel repo Next.js, modifica `public/.well-known/assetlinks.json`:

- Sostituisci `REPLACE_WITH_YOUR_SHA256_FINGERPRINT` con l'impronta SHA-256 (senza `:`)
- Verifica `package_name` = `com.aitinerary.app`

Deploy su Vercel, poi verifica:

https://developers.google.com/digital-asset-links/tools/generator

URL: `https://ai-tinerary-nine.vercel.app/.well-known/assetlinks.json`

## 5. Build APK/AAB

```bash
cd mobile/android

# Debug (test locale)
./gradlew assembleDebug
adb install app/build/outputs/apk/debug/app-debug.apk

# Release per Play Store
npx @bubblewrap/cli build
# oppure Android Studio → Build → Generate Signed Bundle / APK → .aab
```

## 6. Test su Linux

### Livello 1 — Browser (ogni giorno)

```bash
npx next dev
# Chrome DevTools → device toolbar (Pixel / iPhone)
```

### Livello 2 — PWA installabile

1. `npm run build && npm start` oppure deploy Vercel
2. Chrome → icona "Installa app" nella barra URL
3. Lighthouse → categoria PWA (dopo deploy produzione)

### Livello 3 — Emulatore Android

1. Android Studio → AVD Manager → Pixel 7, API 34, Google Play
2. Avvia emulatore → Chrome → `https://ai-tinerary-nine.vercel.app`
3. Test: login Google, mappe, generazione viaggio, input vocale

### Livello 4 — Telefono fisico

```bash
adb devices
adb install app/build/outputs/apk/debug/app-debug.apk
adb logcat | grep -i chromium
```

Abilita **Opzioni sviluppatore** e **Debug USB** sul telefono.

## 7. Google Play Console — listing

Prima del upload `.aab`:

| Asset | Specifiche |
|-------|------------|
| Icona | 512×512 PNG |
| Feature graphic | 1024×500 |
| Screenshot telefono | Minimo 2, consigliato 4-8 |
| Privacy Policy URL | `https://ai-tinerary-nine.vercel.app/privacy` |
| Data Safety | Email, dati viaggio, terze parti (Supabase, AI, mappe) |
| Cancellazione account | In-app su `/account` |
| Content rating | Questionario IARC |

### Data Safety — terze parti da dichiarare

- Supabase (auth, database)
- Google Gemini / Groq (generazione testi)
- Open-Meteo (meteo)
- Nominatim / OpenStreetMap (geocoding)
- OpenFreeMap (mappe)

## 8. Flusso di aggiornamento

- **Feature web:** `git push` → Vercel → aggiornamento automatico nell'app TWA
- **Ricompila `.aab` solo se cambi:** package name, icone launcher Android, splash nativo, permessi

## Troubleshooting

| Problema | Soluzione |
|----------|-----------|
| Barra browser visibile in TWA | Verifica `assetlinks.json` e SHA-256 del keystore di upload |
| OAuth non funziona | Controlla redirect URLs in Supabase |
| Cancellazione account fallisce | Aggiungi `SUPABASE_SERVICE_ROLE_KEY` su Vercel |
| PWA non installabile | Verifica HTTPS, manifest e service worker in produzione |
