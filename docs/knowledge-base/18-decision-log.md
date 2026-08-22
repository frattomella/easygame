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
`package.json`. Dal 2026-08-22 la discovery e automatica.

**Conseguenze.** Zero dipendenze e avvio istantaneo. In cambio: **si possono
testare solo moduli puri** (niente JSX, niente Next, import con estensione) e
nessun coverage. Dal 2026-08-22 la discovery e automatica su
`tests/**/*.test.mjs`.

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

---

# Decisioni deliberate dal proprietario del prodotto — 2026-08-22

Gli ADR **0011–0022** non sono ricostruzioni dal codice: sono decisioni **prese
esplicitamente** dal proprietario del prodotto e sono **vincolanti**.
Chiudono le questioni aperte A1–A9 elencate in [19 — Roadmap](19-roadmap.md).

---

## ADR-0011 — Production non attivata: staging e l'ambiente ufficiale fino alla UAT

**Decisione.** L'ambiente di produzione **non viene attivato ora**. Fino al
completamento della UAT finale, **staging e l'ambiente ufficiale** del
prodotto: e li che si valida, si dimostra e si raccoglie feedback.

**Conseguenze.**

- Staging va trattato con la cura di un ambiente reale: dati, accessi e
  credenziali non sono «di prova».
- Nessun deploy verso un progetto production, in nessuna circostanza, senza
  autorizzazione esplicita e verifica del target.
- L'attivazione della produzione e un lavoro pianificato (WP-26), non un
  effetto collaterale di un deploy.

**Chiude:** A1. **Stato:** ATTIVA.

---

## ADR-0012 — Database di development separato da staging

**Decisione.** Va creato un **branch/database Neon dedicato allo sviluppo**.
L'ambiente locale **non deve scrivere su staging**.

**Conseguenze.**

- `.env` locale punta al DB di development, mai a quello di staging.
- I comandi Prisma di scrittura (`migrate dev`, `db push`, `prisma:seed`)
  diventano sicuri in locale.
- Finche la separazione non e completa, in locale sono ammessi solo comandi di
  sola lettura, e il launcher deve avvisare quando rileva l'endpoint di
  staging.

**Chiude:** A2. **Stato:** ATTIVA. Attuazione: WP-09.

---

## ADR-0013 — I pagamenti restano in roadmap e passeranno da CediPay / Platform.Payments

**Decisione.** Il checkout online **non viene implementato ora** con un PSP
diretto. Resta in roadmap e, quando sara il momento, passera da
**CediPay / Platform.Payments** della Cedi Platform.

**Conseguenze.**

- `PAYMENT_PROVIDER_REGISTRY` resta con `isImplemented: false`; gli endpoint
  continuano a rispondere 501. E un comportamento onesto, non un difetto.
- **Non** si aggiungono SDK di PSP (Stripe, PayPal) al progetto: sarebbe
  accoppiamento da disfare.
- Il registro provider e il calcolo delle fee restano come punto di innesto
  futuro.
- Il webhook non va attivato finche non verifica le firme.

**Chiude:** A3. **Stato:** ATTIVA. Attuazione: WP-13.

---

## ADR-0014 — `/hub` resta statico

**Decisione.** Il catalogo marketplace di `/hub` **resta una pagina statica**.
Non viene ne reso funzionante ne nascosto.

**Conseguenze.** La capability resta `MISSING` con UI presente. Non aggiungere
chiamate dati ne persistenza finche non c'e una decisione diversa. Non
promettere all'utente finale funzioni che la pagina non svolge.

**Chiude:** A4. **Stato:** ATTIVA.

---

## ADR-0015 — Il reset password e obbligatorio prima della produzione

**Decisione.** Il recupero password self-service e un **requisito bloccante**
per l'attivazione della produzione. Va implementato **via SMTP**, riusando
l'infrastruttura email gia presente.

**Conseguenze.**

- Endpoint sotto `/api/v1/auth/password/*`, con rate limit e token a uso
  singolo, coerenti con il modello OTP esistente.
- Dipende dalla configurazione SMTP dell'ambiente, come la verifica email.
- Nessuna produzione senza questa funzione.

**Chiude:** A5. **Stato:** ATTIVA. Attuazione: WP-30.

---

## ADR-0016 — Si eliminano solo i residui classificati SAFE TO DELETE

**Decisione.** La rimozione di codice legacy procede **esclusivamente** sulle
voci gia classificate `SAFE TO DELETE` in [cleanup-report](cleanup-report.md).
Tutto cio che e `REVIEW BEFORE DELETE` resta finche non e riclassificato con
una verifica esplicita.

**Conseguenze.**

- Nessuna rimozione «a occhio» o per pulizia estetica.
- Riclassificare da REVIEW a SAFE richiede: dimostrare che non e referenziato,
  dimostrare che la funzione non serve o e coperta altrove, e aggiornare il
  report nello stesso commit.
- Componenti trainer v1, primitive UI inutilizzate e schermate mobile v1
  **restano** finche non c'e quella verifica.

**Chiude:** A6. **Stato:** ATTIVA.

---

## ADR-0017 — `.babelrc` si rimuove solo se SWC supera tutti i gate

**Decisione.** La rimozione di `.babelrc` (e il ritorno a SWC) e autorizzata
**solo** se, senza di esso, passano **tutti** i gate: test, typecheck, lint,
build e smoke test su staging. Al primo problema si ripristina.

**Conseguenze.** Il cambio di toolchain e condizionato a evidenza, non a
opinione. Va fatto isolato, in un commit proprio, reversibile.

**Chiude:** A7. **Stato:** ATTIVA. Attuazione: WP-08.

---

## ADR-0018 — Il mobile parla solo con le API EasyGame, mai con Neon

**Decisione.** L'app mobile accede ai dati **esclusivamente** tramite le API
`/api/v1` della Web App. **Non** deve avere accesso diretto al database, ne uno
schema proprio, ne strumenti di migrazione. Il rischio Drizzle / Express /
`db:push` va **rimosso**.

**Conseguenze.**

- Da `easygamemobile/` spariscono Drizzle, la configurazione di migrazione, lo
  scaffold Express e ogni riferimento a `DATABASE_URL`.
- Nessuna connection string raggiunge mai il client mobile.
- Se al mobile serve un dato che l'API non espone, si aggiunge un endpoint lato
  Web: non si scavalca il backend.

**Chiude:** A8. **Stato:** ATTIVA. Attuazione: WP-06.

---

## ADR-0019 — Privacy, retention e audit sono bloccanti per la produzione

**Decisione.** Prima dell'attivazione della produzione vanno completati: policy
di **privacy**, policy di **retention** dei dati e **audit log** delle
operazioni sensibili.

**Contesto.** Il sistema tratta dati di minori (atleti) e dati fiscali
(fatture, ricevute, IBAN, codici fiscali).

**Conseguenze.**

- Nessuna produzione senza audit log funzionante (WP-16).
- I nuovi dati personali richiedono di dichiarare finalita e durata di
  conservazione.
- I log non devono contenere dati personali non necessari.

**Chiude:** A9. **Stato:** ATTIVA.

---

## ADR-0020 — Web e Mobile restano nello stesso repository, con confini espliciti

**Decisione.** Monorepo confermato: `src/` e `easygamemobile/` **restano
insieme**, con confini netti.

**Conseguenze.**

- Progetti npm indipendenti, nessun import tra i due alberi, nessun alias
  condiviso.
- Il mobile resta escluso da `tsconfig.json` e `.vercelignore` del Web.
- Un commit non tocca entrambi, salvo cambio di contratto API dichiarato.
- La CI li verifica con job separati.
- Il codice di fatto duplicato va allineato a mano e dichiarato nel commit.

**Stato:** ATTIVA.

---

## ADR-0021 — Backend TypeScript per la V1, nessuna migrazione .NET

**Decisione.** Il backend della V1 **resta TypeScript** su Next.js. **Nessuna
migrazione .NET ora.** In parallelo si **riduce progressivamente la business
logic client-side**, spostandola lato server.

**Conseguenze.**

- Conferma e rafforza ADR-0007.
- La riduzione di `simplified-db.ts` (WP-07) non e igiene opzionale: e la
  **preparazione concreta** a un'eventuale Cedi Platform.
- Nessun nuovo accoppiamento a servizi proprietari dell'hosting.
- Regola pratica: la logica nuova va nel server, mai nel client.

**Stato:** ATTIVA.

---

## ADR-0022 — Workflow di rilascio

**Decisione.** Il percorso obbligatorio di ogni modifica e:

```
locale -> test/build -> commit -> staging -> UAT -> production (solo autorizzata)
```

**Conseguenze.**

- Nessun commit senza gate verdi (test, typecheck, lint, build).
- Nessun deploy su staging senza commit corrispondente: staging riflette sempre
  uno stato tracciato in Git.
- Nessun passaggio in produzione senza UAT superata **e** autorizzazione
  esplicita.
- Non si «salta a staging» per provare: si prova in locale.

**Stato:** ATTIVA.
