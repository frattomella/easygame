## EasyGame SQL Backend

Questa versione del progetto usa un backend classico `Next.js + Prisma + PostgreSQL`.

### Stack backend

- Database SQL: PostgreSQL
- ORM: Prisma
- API: Route Handlers `Next.js` sotto `src/app/api/v1`
- Client app: adapter compatibile in `src/lib/supabase.ts`
- Registro API per web/mobile: `src/lib/api/registry.ts`

### Account demo seed

- `demo@easygame.it` / `password123`
- `trainer@easygame.it` / `password123`
- `athlete@easygame.it` / `password123`
- `parent@easygame.it` / `password123`

### Configurazione locale

1. Copia `.env.local.example` in `.env.local`
2. Inserisci la tua `DATABASE_URL` PostgreSQL
3. Se vuoi email, SMS e OAuth reali, compila anche:
   - `AUTH_BASE_URL`
   - `RESEND_API_KEY`
   - `AUTH_FROM_EMAIL`
   - `TWILIO_ACCOUNT_SID`
   - `TWILIO_AUTH_TOKEN`
   - `TWILIO_VERIFY_SERVICE_SID`
   - `GOOGLE_CLIENT_ID`
   - `GOOGLE_CLIENT_SECRET`
   - `MICROSOFT_CLIENT_ID`
   - `MICROSOFT_CLIENT_SECRET`
4. Esegui:

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

La nuova pagina ` /payments ` centralizza:

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
