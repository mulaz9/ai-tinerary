# AI-tinerary — iOS (App Store)

Capacitor wrapper che carica la web app Next.js su Vercel a schermo intero.
Complementare al wrapper Android TWA in `../android/`.

## Architettura

```
mobile/ios/                    ← questo progetto (Capacitor)
├── capacitor.config.ts        ← server.url → Vercel
├── resources/                 ← icona + splash (1024×1024)
└── ios/App/                   ← progetto Xcode (generato)

Repo principale (ai-tinerary/) ← app vera
├── app/manifest.ts, app/sw.ts
├── app/account, app/privacy
└── public/icons/
```

Ogni `git push` su Vercel aggiorna l'app iOS **senza ricompilare l'IPA**,
finché non cambi icone native, bundle ID, permessi o plugin.

## Prerequisiti (dal piano Android)

Verificato nel repo principale:

- [x] `app/manifest.ts` + icone in `public/icons/`
- [x] `apple-touch-icon` e `theme-color` in `app/layout.tsx`
- [x] Account deletion: `/account` + `POST /api/account/delete`
- [x] Privacy Policy: `/privacy`
- [x] Safe-area: `viewport-fit=cover`, `env(safe-area-inset-*)` in `MobileNav`
- [x] Web Speech fallback: `VoiceTripFormAssist` mostra messaggio se unsupported

## Setup iniziale (Linux o Mac)

```bash
cd mobile/ios
npm install
npm run copy-icons    # copia icone da ../../public/icons/
npx cap sync ios
```

## Supabase OAuth (obbligatorio)

In **Supabase Dashboard → Authentication → URL Configuration**:

| Campo | Valore |
|-------|--------|
| Site URL | `https://ai-tinerary-nine.vercel.app` |
| Redirect URLs | `https://ai-tinerary-nine.vercel.app/auth/callback` |

Opzionale per deep link nativo (già in `Info.plist`):

- `aitinerary://auth/callback`

Aggiungi anche questa URL in Supabase Redirect URLs se usi il custom scheme.

## Build su Mac (obbligatorio per App Store)

```bash
cd mobile/ios
npm run copy-icons
npm run assets          # genera icone/splash iOS da resources/
npx cap sync ios
npm run open            # apre Xcode
```

In Xcode:

1. **Signing & Capabilities** → Team Apple Developer, bundle ID `com.aitinerary.app`
2. **Product → Archive** → Distribute → App Store Connect / TestFlight
3. Prima build: esegui `pod install` in `ios/App/` se CocoaPods lo richiede

### Variabile per URL di staging

```bash
CAPACITOR_SERVER_URL=https://your-preview.vercel.app npx cap sync ios
```

## Plugin Capacitor installati

| Plugin | Uso |
|--------|-----|
| `@capacitor/splash-screen` | Splash nativo (#121212) |
| `@capacitor/status-bar` | Barra stato scura |
| `@capacitor/app` | Deep link `aitinerary://` |
| `@capacitor/share` | Share sheet iOS (utile per review Apple) |

## Test senza Mac

| Test | Strumento |
|------|-----------|
| UI responsive / safe-area | Chrome DevTools |
| PWA Safari-like | iPhone Safari → URL Vercel |
| Capacitor config | `npx cap sync ios` su Linux |
| IPA / TestFlight | **Richiede Mac** o CI `macos-latest` |

Workaround: Mac cloud (MacStadium), GitHub Actions runner macOS, o Mac di un collaboratore per firma/upload (~15 min).

## Asset App Store

Vedi [APP_STORE_ASSETS.md](./APP_STORE_ASSETS.md).

## App Privacy (nutrition label)

Vedi [APP_PRIVACY_LABEL.md](./APP_PRIVACY_LABEL.md) per le risposte in App Store Connect.

## Note per la review Apple

Vedi [APP_REVIEW_NOTES.md](./APP_REVIEW_NOTES.md).

## Account deletion e privacy (riutilizzati dal web)

- **Privacy URL:** `https://ai-tinerary-nine.vercel.app/privacy`
- **Account deletion:** pagina `/account` nell'app (stesso endpoint del piano Android)
- **Env Vercel:** `SUPABASE_SERVICE_ROLE_KEY` per `/api/account/delete`

## Troubleshooting

| Problema | Soluzione |
|----------|-----------|
| Schermo bianco all'avvio | Verifica `server.url` in `capacitor.config.ts` e HTTPS |
| OAuth non torna all'app | Controlla redirect URLs Supabase; prova `aitinerary://` |
| Voce non funziona su iOS | Normale su alcuni WKWebView — fallback UI già presente |
| `pod install` fallisce | Installa CocoaPods su Mac: `sudo gem install cocoapods` |
| Mappe lente | Testa su dispositivo reale; MapLibre su WKWebView può essere più lento di Chrome Android |
