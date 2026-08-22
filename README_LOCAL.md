# EasyGame - avvio locale

Questa guida serve per avviare EasyGame sul PC senza ricordare comandi manuali.

## Database di sviluppo

L'ambiente locale **non deve mai puntare al database di staging** (ADR-0012).
Il modo piu rapido per averne uno tutto tuo:

```bash
docker compose -f docker-compose.dev.yml up -d
npx prisma migrate deploy
SEED_DEMO_PASSWORD="$(openssl rand -base64 18)" npm run prisma:seed
```

Poi in `.env`: le due connection string che trovi in `.env.example` e
`EASYGAME_DB_ENV="development"`.

In alternativa crea un branch `development` dalla console Neon.
Dettagli in `docs/knowledge-base/13-environments.md`.

## Requisiti

- Node.js LTS installato da https://nodejs.org/
- npm incluso con Node.js
- Accesso a un database PostgreSQL, consigliato Neon
- File `.env` configurato nella root del progetto

## Primo avvio su Windows

1. Apri la cartella del progetto EasyGame.
2. Fai doppio click su `EasyGame - Avvio Locale.bat`.
3. Se manca `.env`, il launcher crea `.env` da `.env.example` e si ferma.
4. Compila `DATABASE_URL` e `DIRECT_URL` in `.env`.
5. Fai di nuovo doppio click su `EasyGame - Avvio Locale.bat`.

Il launcher controlla Node.js, npm, `.env`, dipendenze, Prisma Client, connessione database e poi avvia Next.js.

## Avvio con PowerShell

Da PowerShell nella root del progetto:

```powershell
.\scripts\start-local.ps1
```

Se PowerShell blocca lo script per ExecutionPolicy:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\start-local.ps1
```

## Avvio su macOS/Linux

Da terminale nella root del progetto:

```sh
chmod +x start-local.sh
./start-local.sh
```

In alternativa:

```sh
npm run local
```

## URL locale

Di default EasyGame si apre su:

```text
http://localhost:3001
```

Se la porta `3001` e' occupata, il launcher prova `3002` e apre il browser sull'URL corretto.

## Configurare Neon

Nel pannello Neon copia le stringhe di connessione PostgreSQL del progetto.

Nel file `.env` imposta:

```env
DATABASE_URL="postgresql://USER:PASSWORD@HOST:PORT/DATABASE?sslmode=require"
DIRECT_URL="postgresql://USER:PASSWORD@HOST:PORT/DATABASE?sslmode=require"
```

Usa le tue credenziali reali solo in `.env`. Non inserirle in `.env.example`.

## Fermare l'app

Nella finestra del launcher premi:

```text
Ctrl+C
```

Il processo Next.js viene fermato e la porta locale torna libera.

## Problemi comuni

### Node.js non installato

Installa Node.js LTS da https://nodejs.org/, poi chiudi e riapri il launcher.

### Porta 3001 occupata

Il launcher prova automaticamente `3002`. Se anche `3002` e' occupata, chiudi altri server locali e riavvia.

### DATABASE_URL o DIRECT_URL mancanti

Apri `.env`, compila entrambe le variabili e riavvia il launcher.

### Errore Prisma

Controlla che `DATABASE_URL` e `DIRECT_URL` siano URL PostgreSQL valide, che Neon sia attivo e che `sslmode=require` sia presente quando richiesto.

### Tabella mancante o migration non applicata

Il launcher non applica migrazioni automatiche per evitare modifiche indesiderate al database. Dopo aver verificato il database giusto, usa un comando Prisma esplicito, ad esempio:

```sh
npm run db:migrate
```

### npm install fallisce

Controlla la connessione internet, eventuali proxy aziendali e la versione di Node.js. Poi rilancia il launcher.

## Comandi utili

```sh
npm run local
npm run setup:local
npm run db:generate
npm run db:migrate
npm run db:push
```

## Checklist test manuale

- Clonare repo pulita.
- Inserire `.env`.
- Doppio click su `EasyGame - Avvio Locale.bat`.
- Verificare installazione dipendenze.
- Verificare `prisma generate`.
- Verificare apertura browser.
- Verificare app su localhost.
- Verificare errore chiaro se `DATABASE_URL` manca.
- Verificare errore chiaro se Node manca.
- Verificare porta alternativa se `3001` e' occupata.
