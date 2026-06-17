# PWA parity checklist (repo principale)

Verifica che questi elementi siano presenti prima di pubblicare su App Store.
L'app iOS Capacitor li riutilizza via `server.url` → Vercel.

| Elemento | Path | Stato |
|----------|------|-------|
| Web manifest | `app/manifest.ts` → `/manifest.webmanifest` | OK |
| Service worker | `app/sw.ts` + Serwist | OK |
| Icone 192/512/maskable | `public/icons/` | OK |
| Apple touch icon | `public/icons/apple-touch-icon.png` | OK |
| theme-color + viewport-fit | `app/layout.tsx` | OK |
| appleWebApp metadata | `app/layout.tsx` | OK |
| Offline fallback | `app/~offline/page.tsx` | OK |
| Account deletion | `app/account/` + `/api/account/delete` | OK |
| Privacy policy | `app/privacy/` | OK |
| Safe-area bottom nav | `components/MobileNav.tsx` | OK |
| Safe-area top header | `components/MobileNav.tsx` | OK |
| iOS input font-size 16px | `styles/globals.css` | OK |
| Voice fallback UI | `components/VoiceTripFormAssist.tsx` | OK |

Dopo ogni modifica PWA nel repo principale: deploy Vercel → l'app iOS si aggiorna automaticamente.
