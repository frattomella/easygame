## EasyGame

Gestionale multi-tenant per ASD, associazioni e societa sportive.
Backend `Next.js + Prisma + PostgreSQL (Neon)`, hosting Vercel.

> **Documentazione ufficiale: [`docs/knowledge-base/`](docs/knowledge-base/README.md)**
> E la fonte di verita su architettura, modello dati, autenticazione, ruoli,
> API, ambienti, sicurezza, debito tecnico e roadmap.
>
> Sviluppo assistito da AI: leggi [`CLAUDE.md`](CLAUDE.md) e
> [`AGENTS.md`](AGENTS.md) prima di modificare il codice.

Il repository contiene due applicazioni separate:

- **Web App** — `src/`, funzionante
- **Mobile App** — `easygamemobile/`, incompleta (solo area allenatore)

### Stack backend

- Database SQL: PostgreSQL
- ORM: Prisma
- API: Route Handlers `Next.js` sotto `src/app/api/v1`
- Client app: adapter compatibile in `src/lib/supabase.ts`
- Registro API per web/mobile: `src/lib/api/registry.ts`

### Account demo seed

Il seed crea quattro account demo — `demo@easygame.it` (owner),
`trainer@easygame.it`, `athlete@easygame.it`, `parent@easygame.it` — e imposta
per tutti la password che **tu** fornisci in `SEED_DEMO_PASSWORD`:

```bash
SEED_DEMO_PASSWORD="$(openssl rand -base64 24)" npm run prisma:seed
```

Non esiste piu una password predefinita e **nessuna credenziale reale va
scritta in questo repository**, che e pubblico. Le credenziali degli ambienti
condivisi si conservano fuori dal repository.

### Configurazione locale

1. Copia `.env.local.example` in `.env.local`
2. Inserisci la tua `DATABASE_URL` PostgreSQL
3. Configura SMTP dalla dashboard platform admin. La password viene cifrata con
   `SMTP_CREDENTIALS_SECRET` o, in fallback, `AUTH_RATE_LIMIT_SECRET`.
4. Se vuoi SMS e OAuth reali, compila anche:
   - `AUTH_BASE_URL`
   - `TWILIO_ACCOUNT_SID`
   - `TWILIO_AUTH_TOKEN`
   - `TWILIO_VERIFY_SERVICE_SID`
   - `GOOGLE_CLIENT_ID`
   - `GOOGLE_CLIENT_SECRET`
   - `MICROSOFT_CLIENT_ID`
   - `MICROSOFT_CLIENT_SECRET`
5. Esegui:

```bash
npm install
npx prisma migrate dev --name init
npm run prisma:seed
npm run dev
```

### Accesso app

- La landing pubblica e stata rimossa: `/`, `/login` e `/register` mostrano solo i flussi auth
- Password classica, verifica email e verifica cellulare convivono nello stesso backend
- OAuth web e pronto per Google e Microsoft

### Build produzione

```bash
npm run build
```

### Pagamenti

La nuova pagina `/payments` centralizza:

- pagamenti
- fatture
- ricevute
- metodi di pagamento

I record sono collegabili tra loro tramite `payment_id`, `invoice_id` e `receipt_id`.

### Registro API

Il file sorgente da mantenere aggiornato per la futura app mobile e:

- `src/lib/api/registry.ts`

Documentazione leggibile:

- `docs/api-registry.md`

Guida operativa per testing, DB e deploy:

- `docs/testing-and-deploy.md`
