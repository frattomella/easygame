# 18 — Decision log (ADR)

Registro delle decisioni architetturali. Gli ADR **0001–0009** sono
*ricostruiti dal codice esistente* durante l'audit del 2026-08-22: documentano
scelte gia in essere, non deliberazioni nuove.

Formato: contesto → decisione → conseguenze → stato.
Per una nuova decisione, aggiungi un ADR in fondo. **Non riscrivere un ADR
esistente**: se una decisione cambia, aggiungine uno nuovo che dichiari
superato il precedente.

---

## ADR-0001 — Un database condiviso con isolamento logico per tenant

**Contesto.** EasyGame serve molte societa sportive dallo stesso deployment.
Un database per club sarebbe stato piu isolato ma molto piu costoso da gestire.

**Decisione.** Un solo PostgreSQL su Neon. Ogni entita operativa porta
`organization_id`. Il filtro e applicato lato server in
`src/lib/server/resources.ts`.

**Conseguenze.** Backup, migrazioni e monitoring semplici. In compenso
l'isolamento e **solo applicativo**: nessuna Row Level Security, quindi un bug
in `resources.ts` diventerebbe una fuga cross-tenant.

**Stato:** ATTIVA. Riferimento: [`docs/multi-tenant-architecture.md`](../multi-tenant-architecture.md).

---

## ADR-0002 — Sessioni opache su database invece di JWT

**Contesto.** Serviva un meccanismo di sessione utilizzabile sia dal web
(cookie) sia dal mobile (Bearer), con revoca immediata.

**Decisione.** Token random salvato in `sessions`, validato a ogni richiesta.
Nessun JWT. Durata 14 giorni. Nessun refresh token reale
(`refresh_token === access_token`).

**Conseguenze.** Revoca immediata e nessuna gestione di chiavi di firma; in
cambio una query al DB per ogni richiesta autenticata. Alla scadenza serve un
nuovo login.

**Stato:** ATTIVA.

---

## ADR-0003 — Adapter «Supabase-like» al posto di Supabase

**Contesto.** Il progetto nasceva su Supabase. La migrazione a Prisma + Neon
avrebbe richiesto di riscrivere tutte le chiamate dati del client.

**Decisione.** Mantenere la forma dell'API Supabase in
`src/lib/supabase.ts`, reimplementandola su `fetch` verso `/api/v1`. Il resto
del client e rimasto invariato.

**Conseguenze.** Migrazione rapida e a basso rischio. In cambio: un nome
fuorviante, un livello di indirezione in piu, e chiavi legacy nello storage del
browser (`supabase_session`).

**Stato:** ATTIVA ma da ridurre gradualmente — vedi
[WP-17](20-work-packages.md).

---

## ADR-0004 — Registro risorse generico invece di endpoint per entita

**Contesto.** ~50 tipi di entita, molte con CRUD identico.

**Decisione.** `RESOURCE_CONFIG` + `/api/v1/[resource]` gestiscono
uniformemente sia i modelli Prisma sia le righe di `club_resource_items`.

**Conseguenze.** Aggiungere un'entita costa una riga di configurazione, e il
mobile riusa lo stesso client. In cambio: nessuna validazione per entita,
nessuna paginazione, e la difficolta di esprimere regole specifiche senza
sporcare il layer generico.

**Stato:** ATTIVA.

---

## ADR-0005 — Risorse di club come JSON generico

**Contesto.** Molte entita (categorie, allenamenti, partite, sponsor...) hanno
forma variabile e cambiano spesso.

**Decisione.** Salvarle in `club_resource_items` (`resource_type` + `payload`),
mantenendo in parallelo una copia aggregata nelle colonne `Json?` di `clubs`
per compatibilita con il codice preesistente.

**Conseguenze.** Grande flessibilita di schema; in cambio nessun vincolo di
integrita, nessun tipo garantito, e una **doppia scrittura** con un percorso
distruttivo (delete+insert) non transazionale.

**Stato:** ATTIVA, con debito noto (D2) — vedi
[WP-10](20-work-packages.md).

---

## ADR-0006 — Interfaccia e messaggi di errore in italiano

**Contesto.** Il prodotto si rivolge a ASD e societa sportive italiane.

**Decisione.** Testi UI **e** `error.message` delle API in italiano. Codici di
errore (`error.code`) e identificatori di codice in inglese.

**Conseguenze.** Nessun layer i18n: un'eventuale internazionalizzazione sara un
progetto a se.

**Stato:** ATTIVA.

---

## ADR-0007 — Nessuna migrazione .NET ora, ma nessun nuovo lock-in

**Contesto.** EasyGame potrebbe diventare un prodotto della Cedi Platform, con
un possibile backend .NET.

**Decisione.** **Non** avviare alcuna migrazione. Continuare su Next.js +
Prisma. Contemporaneamente, evitare scelte che rendano difficile spostare la
logica di dominio: niente servizi proprietari Vercel (KV, Blob, Edge Config),
niente Server Actions come unico canale di scrittura, logica nuova concentrata
in moduli isolabili sotto `src/lib/server/`.

**Conseguenze.** Il debito D1 (logica di dominio nel client) diventa il
principale ostacolo a una futura estrazione: da qui la priorita di WP-07.

**Stato:** ATTIVA.

---

## ADR-0008 — Test con il runner nativo di Node, senza framework

**Contesto.** Serviva una copertura minima sulle policy di sicurezza senza
introdurre Jest o Vitest.

**Decisione.** `node:test` con `--experimental-strip-types`, file `.mjs` che
importano direttamente i `.ts`, elencati esplicitamente in
`package.json → test:auth`.

**Conseguenze.** Zero dipendenze e avvio istantaneo. In cambio: **si possono
testare solo moduli puri** (niente JSX, niente Next), nessuna discovery
automatica, nessun coverage.

**Stato:** ATTIVA. Il limite va superato per testare le API — vedi
[WP-04](20-work-packages.md).

---

## ADR-0009 — Configurazione SMTP nel database, non nelle variabili d'ambiente

**Contesto.** Ogni installazione deve poter cambiare provider email senza un
redeploy.

**Decisione.** Tabella `email_provider_configs` (riga singola), gestita dalla
dashboard platform admin, password cifrata AES-GCM con chiave da
`SMTP_CREDENTIALS_SECRET` (fallback `AUTH_RATE_LIMIT_SECRET`).

**Conseguenze.** Configurazione a runtime e per-ambiente. In cambio: cambiare
il segreto di cifratura **rende indecifrabile** la password salvata, e il
login degli utenti non verificati **dipende** dalla presenza di questa
configurazione.

**Stato:** ATTIVA.

---

## ADR-0010 — La Knowledge Base e la fonte di verita per lo sviluppo assistito

**Data:** 2026-08-22

**Contesto.** Lo sviluppo procede in gran parte con agenti AI. Senza un
riferimento condiviso e verificabile ogni sessione riparte da zero, riscopre le
stesse cose e reintroduce gli stessi errori (duplicati, codice morto, seconde
implementazioni della stessa cosa).

**Decisione.** `docs/knowledge-base/` documenta il **codice reale**.
`CLAUDE.md` e `AGENTS.md` obbligano a leggerla prima di modificare e ad
aggiornarla nello stesso commit. Il codice resta l'autorita finale: se
divergono, si corregge la KB.

**Conseguenze.** Ogni cambiamento strutturale costa anche un aggiornamento
documentale. E il prezzo accettato per rendere il repository lavorabile in
parallelo da piu agenti.

**Stato:** ATTIVA.
