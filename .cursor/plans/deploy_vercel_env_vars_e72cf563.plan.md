---
name: Deploy Vercel env vars
overview: Configurare le variabili d'ambiente su Vercel (senza committarle) e aggiornare Supabase/Google OAuth con il dominio di produzione così la demo online funziona.
todos:
  - id: vercel-env
    content: Aggiungere GEMINI_API_KEY, GROQ_API_KEY, NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY su Vercel (dashboard o CLI)
    status: pending
  - id: supabase-urls
    content: Aggiornare Site URL e Redirect URLs in Supabase con il dominio .vercel.app
    status: pending
  - id: google-oauth
    content: Aggiungere il dominio Vercel alle Authorized JavaScript origins in Google Cloud Console
    status: pending
  - id: redeploy
    content: Fare Redeploy su Vercel e testare login + creazione trip
    status: pending
  - id: rotate-keys
    content: Ruotare GEMINI_API_KEY e GROQ_API_KEY (sono state esposte in chat)
    status: pending
  - id: readme
    content: (Opzionale) Documentare le env vars richieste nel README
    status: pending
isProject: false
---

# Pubblicazione demo su Vercel senza esporre le chiavi

## Situazione attuale

- `.env*` è già in [.gitignore](.gitignore) (riga `.env*`), quindi `.env.local` NON viene pushato. Ottimo.
- Le chiavi in [.env.local](.env.local) sono di 3 tipi:
  - **Server-only** (mai esposte al browser): `GEMINI_API_KEY`, `GROQ_API_KEY`
  - **Pubbliche per design** (finiscono nel bundle JS, protette da Row Level Security): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` — va bene che siano visibili, è il loro scopo
- L'OAuth Google usa `window.location.origin` in [app/login/page.tsx](app/login/page.tsx) riga 53, quindi il redirect si adatta automaticamente al dominio Vercel.

## Passi

### 1. Configurare le env vars su Vercel

Due modi equivalenti, scegline uno:

**A) Dashboard web** (più semplice la prima volta)

- Vercel → il tuo progetto → _Settings_ → _Environment Variables_
- Aggiungi una per una, spuntando _Production_, _Preview_ e _Development_:
  - `GEMINI_API_KEY`
  - `GROQ_API_KEY`
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`

**B) Vercel CLI** (riproducibile)

```bash
npm i -g vercel
vercel link
vercel env add GEMINI_API_KEY production
vercel env add GROQ_API_KEY production
vercel env add NEXT_PUBLIC_SUPABASE_URL production
vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY production
# ripeti con "preview" e "development" se vuoi le stesse chiavi anche lì
```

Dopo aver aggiunto le variabili, fai un **Redeploy** (Vercel → Deployments → ⋯ → Redeploy) perché le env vars vengono iniettate al build time.

### 2. Aggiornare Supabase con il dominio Vercel

Altrimenti il login Google fallisce con "redirect_uri_mismatch".

- Supabase Dashboard → _Authentication_ → _URL Configuration_
  - **Site URL**: `https://<tuo-progetto>.vercel.app`
  - **Redirect URLs**: aggiungi
    - `https://<tuo-progetto>.vercel.app/auth/callback`
    - `https://*-<team>.vercel.app/auth/callback` (opzionale, per le preview deploy)
    - `http://localhost:3000/auth/callback` (per dev locale)

### 3. Aggiornare Google Cloud Console (OAuth)

- Google Cloud Console → _APIs & Services_ → _Credentials_ → il tuo OAuth 2.0 Client ID
- _Authorized redirect URIs_: aggiungi
  - `https://<project-ref>.supabase.co/auth/v1/callback` (già presente probabilmente)
- _Authorized JavaScript origins_: aggiungi
  - `https://<tuo-progetto>.vercel.app`

### 4. Verifica sulla demo online

- Apri `https://<tuo-progetto>.vercel.app`
- Fai login con Google → deve tornare alla home loggato
- Crea un trip → deve usare Gemini/Groq e salvarlo su Supabase

## Cosa NON fare

- Non aggiungere `SUPABASE_SERVICE_ROLE_KEY` con prefisso `NEXT_PUBLIC_` (bypasserebbe RLS dal browser).
- Non committare `.env.local` "per comodità demo": usa sempre il dashboard Vercel.
- La chiave `GEMINI_API_KEY` che hai in [.env.local](.env.local) è stata condivisa in chiaro in chat — **ruotala** su [Google AI Studio](https://aistudio.google.com/apikey) prima di andare in produzione (idem per la `GROQ_API_KEY`).

## Opzionale: README per chi clona il repo

Aggiungere in [README.md](README.md) una sezione "Deploy" con la lista delle 4 env vars richieste e il link "Deploy to Vercel", così altri possono replicare la demo con le _loro_ chiavi.
