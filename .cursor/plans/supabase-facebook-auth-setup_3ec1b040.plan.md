---
name: supabase-facebook-auth-setup
overview: "Checklist operativa: configurare Supabase per attivare l'autenticazione email + password (codice già pronto) e aggiungere Facebook OAuth con i relativi passi su Facebook Developers, Supabase Dashboard e una piccola modifica a app/login/page.tsx."
todos:
  - id: supabase-env
    content: Verificare NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local
    status: pending
  - id: supabase-urls
    content: "Supabase: configurare Site URL e Redirect URLs (callback + update-password)"
    status: pending
  - id: supabase-email-provider
    content: "Supabase: verificare provider Email abilitato con Confirm email ON"
    status: pending
  - id: supabase-smtp
    content: "Supabase: configurare SMTP custom prima della produzione (opzionale per dev)"
    status: pending
  - id: test-email-flow
    content: Testare signup, login, reset password sul flusso email
    status: pending
  - id: fb-app-create
    content: "Facebook Developers: creare app Consumer con Facebook Login"
    status: pending
  - id: fb-redirect-uri
    content: "Facebook: aggiungere il Supabase callback URL agli OAuth Redirect URIs"
    status: pending
  - id: fb-credentials
    content: Copiare App ID + App Secret da Facebook in Supabase Providers -> Facebook
    status: pending
  - id: fb-live-mode
    content: "Facebook: completare Privacy Policy e passare App Mode a Live"
    status: pending
  - id: fb-button
    content: "Codice: aggiungere bottone Continua con Facebook in app/login/page.tsx"
    status: pending
  - id: fb-test
    content: Testare il flusso OAuth Facebook end-to-end
    status: pending
isProject: false
---

# Setup Supabase + Facebook Auth

Tutto il codice email/password è già scritto. Quello che resta è configurazione su dashboard esterne. Per Facebook serve in più una piccolissima modifica al login (un nuovo bottone).

## Parte 1 — Attivare l'email login su Supabase (oggi/quando vuoi testare)

Apri il progetto su [supabase.com/dashboard](https://supabase.com/dashboard).

### 1.1 Verifica env vars in `.env.local`

Devono esistere queste due:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
```

Le trovi in **Project Settings -> API** sul dashboard.

### 1.2 URL Configuration

**Authentication -> URL Configuration**:

- **Site URL**: `http://localhost:3000` (per dev). In produzione cambialo o usa l'URL del deploy.
- **Redirect URLs**: aggiungi (uno per riga):
  - `http://localhost:3000/auth/callback`
  - `http://localhost:3000/auth/update-password`
  - (e gli equivalenti per il dominio di produzione, quando deployi)

Senza questi due redirect i link nelle email vengono rifiutati come "redirect not allowed".

### 1.3 Provider Email

**Authentication -> Providers -> Email**:

- **Enable Email provider**: ON (è il default).
- **Confirm email**: lascia ON (consigliato). La nuova UI mostra "Ti abbiamo inviato un'email di conferma" quando l'utente si registra.
  - Se per i test vuoi saltare la conferma, mettilo OFF temporaneamente: l'utente entra subito senza confermare.
- **Secure password change**: ON (richiede sessione attiva per cambiare password — il flusso `/auth/update-password` lo soddisfa già).
- **Minimum password length**: lascia 6 (la UI ne forza 8 lato client comunque).

### 1.4 Email Templates (verifica, non modificare)

**Authentication -> Email Templates**: i template di default funzionano già con il codice. Se li tocchi, mantieni la variabile `{{ .ConfirmationURL }}` perché punta a `/auth/callback?next=...` che il route handler `app/auth/callback/route.ts` gestisce.

### 1.5 SMTP (importante per produzione)

**Authentication -> Emails -> SMTP Settings**:

- In dev/test va bene l'SMTP integrato di Supabase (rate-limit basso: ~3-4 email/ora, le email arrivano da `noreply@mail.app.supabase.io`).
- Per produzione **abilita Custom SMTP** con un provider come Resend, SendGrid, Brevo o Postmark. Senza, gli utenti reali rischiano di non ricevere le email di conferma e reset.

### 1.6 Test del flusso

Dopo aver salvato:

1. Vai su `http://localhost:3000/login`, tab **Registrati**, crea un account con un'email vera.
2. Controlla la casella, clicca il link -> dovresti finire loggato sulla home.
3. Logout, tab **Accedi**, login con le credenziali.
4. Click su **Password dimenticata?**, inserisci l'email -> arriva il link che porta a `/auth/update-password`.

---

## Parte 2 — Aggiungere Facebook Login (domani)

### 2.1 Creare l'app su Facebook Developers

1. Vai su [developers.facebook.com](https://developers.facebook.com), accedi con il tuo account FB.
2. **My Apps -> Create App**:
   - Use case: **Authenticate and request data from users with Facebook Login**
   - App type: **Consumer**
   - Inserisci nome app (es. "AI-tinerary") ed email di contatto.
3. Nel dashboard dell'app appena creata, **Add Product -> Facebook Login -> Set Up** (web).
4. Salta il quickstart, vai su **Facebook Login -> Settings** nella sidebar.
5. In **Valid OAuth Redirect URIs** incolla l'URL di callback di Supabase:

```
https://<project-ref>.supabase.co/auth/v1/callback
```

Lo trovi anche in Supabase su **Authentication -> Providers -> Facebook** (campo "Callback URL"). 6. **App Settings -> Basic**:

- Copia **App ID** e **App Secret** (clicca "Show" per il secret, FB chiede la password).
- Aggiungi **Privacy Policy URL** (obbligatoria per andare in produzione su FB).

### 2.2 Configurare il provider su Supabase

**Authentication -> Providers -> Facebook**:

- Enable Facebook provider: ON.
- Incolla **Facebook client ID** = App ID.
- Incolla **Facebook secret** = App Secret.
- Salva.

### 2.3 Mettere l'app FB in modalità "Live"

Sul dashboard di Facebook, in alto, switch **App Mode** da "Development" a "Live". Senza questo passaggio solo gli utenti test/admin dell'app FB possono fare login.

Per andare Live FB richiede:

- Privacy Policy URL valido.
- Categoria dell'app selezionata.
- Per scope `email` di base non serve la review (è uno scope standard concesso d'ufficio).

### 2.4 Aggiungere il bottone "Continua con Facebook" nel codice

Modifica unica da fare a [app/login/page.tsx](app/login/page.tsx):

- Aggiungere uno state `facebookLoading` separato (o riusare `oauthLoading` con un parametro provider).
- Aggiungere una funzione `signInWithFacebook()` quasi identica a `signInWithGoogle()`, cambia solo `provider: "facebook"`.
- Aggiungere un bottone Facebook sotto al bottone Google, con la stessa struttura ma colore di brand FB (`bg-[#1877F2]` con testo bianco) e icona FB.
- Refactor minimo: estrarre una funzione generica `signInWithProvider(provider: "google" | "facebook")` per evitare duplicazione.

Snippet della parte chiave (giusto come riferimento, non lo crei adesso):

```tsx
async function signInWithProvider(provider: "google" | "facebook") {
  setOauthLoading(provider);
  // ... stessa logica di prima, passa provider all'options
  const { error } = await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo },
  });
  // ...
}
```

Nessuna modifica serve a `app/auth/callback/route.ts`: il callback OAuth funziona uguale per qualsiasi provider.

### 2.5 Test del flusso Facebook

1. Login -> "Continua con Facebook" -> consenso FB -> ritorno su `/auth/callback` -> sessione creata -> redirect su `/`.
2. Verifica che il proxy non blocchi: `proxy.ts` redireziona solo `/login` se loggato, quindi tutto ok.

---

## Note di sicurezza

- **Mai committare** App Secret di Facebook o `service_role` di Supabase.
- L'`anon key` di Supabase è pensata per essere pubblica (è già `NEXT_PUBLIC_*`) — protegge le RLS policies, non la chiave.
- Quando vai in produzione, ricordati di aggiungere il dominio reale **sia** in Supabase URL Configuration **sia** in Facebook OAuth Redirect URIs.

## Riepilogo cose da fare

Lato dashboard (no codice):

- Supabase: URL config + Email provider (oggi).
- SMTP custom (prima del deploy in produzione).
- Facebook Developers: creare app + configurare Facebook Login (domani).
- Supabase: incollare credenziali FB nel provider (domani).

Lato codice (domani, dopo aver creato l'app FB):

- Aggiungere bottone "Continua con Facebook" in [app/login/page.tsx](app/login/page.tsx) (~15 righe).
