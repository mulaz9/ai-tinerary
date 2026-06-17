# App Store — asset richiesti

## Icona

| Asset | Dimensione | Note |
|-------|------------|------|
| App icon | 1024×1024 PNG | Senza trasparenza, senza angoli arrotondati (iOS li applica) |
| Sorgente | `resources/icon.png` | Copia da `../../public/icons/icon-512.png` o rigenera con `npm run icons` nel repo principale |

Genera le varianti iOS:

```bash
cd mobile/ios
npm run copy-icons
npm run assets
npx cap sync ios
```

## Screenshot (obbligatori)

| Dispositivo | Risoluzione consigliata | Obbligatorio |
|-------------|-------------------------|--------------|
| iPhone 6.7" | 1290×2796 | Sì |
| iPhone 6.5" | 1284×2778 | Consigliato |
| iPad 12.9" | 2048×2732 | Se supporti iPad |

Cattura screenshot reali dall'app su simulatore Xcode o dispositivo:

1. Home con lista viaggi
2. Dettaglio viaggio con timeline
3. Mappa interattiva
4. Dialog nuovo viaggio / generazione AI

## Metadati App Store Connect

| Campo | Contenuto suggerito |
|-------|---------------------|
| Nome | AI-tinerary |
| Sottotitolo | Itinerari di viaggio con AI |
| Categoria primaria | Viaggi |
| Categoria secondaria | Produttività (opzionale) |
| Privacy Policy URL | `https://ai-tinerary-nine.vercel.app/privacy` |
| Support URL | URL del sito o email supporto |
| Descrizione IT | Pianifica itinerari giorno per giorno con l'AI. Mappe, meteo, condivisione. |
| Descrizione EN | Plan day-by-day trips with AI. Maps, weather, sharing. |
| Parole chiave | travel,itinerary,ai,trip,planner,map,vacation |

## TestFlight

1. Archive in Xcode → Upload to App Store Connect
2. App Store Connect → TestFlight → aggiungi tester interni
3. Testa: login Google, generazione viaggio, mappe, cancellazione account
