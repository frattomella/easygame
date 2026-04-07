# Guida Testing e Deploy

Questa guida usa lo stack gia configurato nel progetto:

- `Next.js` per frontend e API
- `Prisma` come ORM
- `PostgreSQL` come database SQL
- `Vercel` per hosting app
- `Neon` come database PostgreSQL gestito

## 1. Crea il database

Percorso consigliato per il testing online:

1. Crea un account su Neon.
2. Crea un nuovo progetto PostgreSQL.
3. Copia entrambe le stringhe di connessione:
   - pooled connection per runtime app
   - direct connection per migrazioni Prisma

Nel progetto queste variabili sono gia previste in `\.env.local.example`:

```env
DATABASE_URL=""
DIRECT_URL=""
NEXT_PUBLIC_APP_URL="http://localhost:3000"
```

## 2. Collega il database in locale

Da PowerShell:

```powershell
cd "E:\Download\easygame"
Copy-Item .env.local.example .env.local
```

Poi apri `.env.local` e inserisci:

- `DATABASE_URL`: URL pooled di Neon
- `DIRECT_URL`: URL direct di Neon
- `NEXT_PUBLIC_APP_URL=http://localhost:3000`

## 3. Inizializza schema e dati demo

Usa `npm.cmd` e `npx.cmd` in PowerShell:

```powershell
cd "E:\Download\easygame"
npm.cmd install
npx.cmd prisma generate
npx.cmd prisma migrate dev --name init
npm.cmd run prisma:seed
npm.cmd run dev
```

Apri poi `http://localhost:3000`.

## 4. Verifica funzionale

Per il testing applicativo controlla almeno questi flussi:

1. login e logout
2. creazione e modifica atleti
3. pagina pagamenti
4. creazione fatture e ricevute collegate
5. metodi di pagamento
6. lettura registro API su `/api/v1/registry`

## 5. Deploy su Vercel

1. Crea un progetto su Vercel e collega il repository.
2. In `Settings -> Environment Variables` inserisci:
   - `DATABASE_URL`
   - `DIRECT_URL`
   - `NEXT_PUBLIC_APP_URL`
3. Imposta `NEXT_PUBLIC_APP_URL` con l'URL pubblico Vercel finale.
4. In `Build and Deployment Settings` imposta il build command su:

```bash
npm run vercel-build
```

Questo script nel progetto esegue:

```bash
prisma generate && prisma migrate deploy && next build
```

## 6. Ambiente test e produzione

Configurazione consigliata:

- Neon branch/database `main`: produzione
- Neon branch/database `staging`: test
- Vercel Production: collegato al DB produzione
- Vercel Preview o progetto separato: collegato al DB test

In questo modo testi su dati reali separati senza toccare la produzione.

## 7. File importanti del progetto

- `prisma/schema.prisma`
- `.env.local.example`
- `src/lib/api/registry.ts`
- `docs/api-registry.md`
- `package.json`

## 8. Nota tecnica

La build attuale passa, ma in `next.config.js` e ancora presente `typescript.ignoreBuildErrors = true`.
Prima della produzione definitiva conviene rimuovere quel flag e chiudere gli ultimi errori TypeScript residui.
