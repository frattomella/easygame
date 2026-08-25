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

---

## ADR-0023 — Il codice server e testabile senza toccare la produzione

**Data:** 2026-08-22

**Contesto.** [ADR-0008](#adr-0008--test-con-il-runner-nativo-di-node-senza-framework)
sceglieva il runner nativo di Node. Il limite pratico era che
`src/lib/server/**` non era importabile: import senza estensione, alias `@/`
sconosciuto a Node, e `PrismaClient` costruito all'import del modulo. Cosi
l'isolamento multi-tenant — la protezione principale del prodotto — restava
verificabile solo con test statici sul sorgente.

**Decisione.** Rendere testabile il layer server senza cambiare il modo in cui
Next costruisce il bundle:

1. un **hook di risoluzione ESM per i soli test**
   (`tests/helpers/extensionless-resolver.mjs`, registrato con `--import`)
   colma le differenze fra la risoluzione di Node e quella del bundler;
2. `src/lib/server/prisma.ts` costruisce il client **alla prima query** e
   permette di sostituirlo con `__setPrismaClientForTests()`. L'export resta un
   Proxy che inoltra al client attivo legando i metodi;
3. niente **parameter property** TypeScript nel codice server: non sono
   supportate dallo strip-only di Node e renderebbero non testabile ogni modulo
   che le importa.

**Conseguenze.**

- Il layer dati e coperto da test a runtime, validati per mutazione.
- Il Proxy aggiunge una indirezione al percorso dati: e stato verificato
  contro un database reale su query semplici, `findMany`, `$transaction` in
  forma array e callback, `$queryRaw` e `$disconnect`.
- I test girano con **isolamento per processo**: con `isolation=none` i file
  condividono i hook e il client iniettato da un file sovrascriveva quello di
  un altro.
- Il codice di produzione non dipende in alcun modo dall'hook.

**Stato:** ATTIVA.

---

## ADR-0024 — Database di sviluppo in Docker, branch Neon come alternativa

**Data:** 2026-08-22

**Contesto.** [ADR-0012](#adr-0012--database-di-development-separato-da-staging)
prevede un branch Neon dedicato allo sviluppo. La creazione richiede la console
Neon: da questa working copy non ci sono credenziali API. Il PostgreSQL gia
installato sulla macchina richiede una password non disponibile, e modificare
`pg_hba.conf` significherebbe toccare una configurazione di sicurezza di
sistema.

**Decisione.** Fornire un database di sviluppo **in Docker**
(`docker-compose.dev.yml`, PostgreSQL 17 sulla porta 5434) come opzione
predefinita, mantenendo il branch Neon come alternativa documentata per chi
vuole parita con la produzione.

**Conseguenze.**

- Lo sviluppo locale non tocca piu staging, che era l'obiettivo di ADR-0012.
- Serve Docker per l'opzione predefinita; chi non lo ha usa il branch Neon.
- Il database di sviluppo e PostgreSQL 17 «nudo», mentre gli ambienti usano
  Neon con pooler e SSL: differenze di comportamento sono possibili ma non ne
  sono emerse (le 7 migrazioni si applicano identiche).
- Le credenziali del container sono volutamente banali: e locale, usa e getta,
  mai esposto.

**Stato:** ATTIVA. Non supera ADR-0012: ne e l'attuazione.

---

## ADR-0025 — Mobile App differita: la priorita e EasyGame Web V1 responsive

**Data:** 2026-08-22

**Contesto.** Il repository contiene due applicazioni ([ADR-0020](#adr-0020--web-e-mobile-restano-nello-stesso-repository-con-confini-espliciti)):
la Web App in uso reale e la Mobile App, ferma allo stato di prototipo con la
sola area allenatore ([05](05-mobile-architecture.md)). La fase F4 della
roadmap prevedeva di portarla a prodotto distribuibile (WP-21..WP-25).

Nel frattempo la Web App presenta difetti che colpiscono l'uso quotidiano:
la pagina Atleti impiega decine di secondi con 200+ record, il cambio stagione
non separa davvero i dati, e il dominio pagamenti produce importi e stati
incoerenti. Inoltre gli utenti usano gia il Web da tablet e smartphone, dove
manca una verifica sistematica del comportamento responsive.

Investire sul mobile prima di aver chiuso questi punti significherebbe
duplicare su una seconda piattaforma regole di dominio ancora instabili.

**Decisione.** La Mobile App e **DIFFERITA**. La priorita assoluta e
completare **EasyGame Web V1** e renderla pienamente utilizzabile da desktop,
tablet e smartphone.

1. Nessuna nuova funzionalita Mobile fino a una decisione esplicita che superi
   questo ADR.
2. I WP-21..WP-25 passano allo stato `DEFERRED`. La fase F4 esce dal percorso
   critico.
3. Sul codice `easygamemobile/` restano ammessi **solo**: correzioni di
   sicurezza, e gli adeguamenti resi necessari da un cambio di contratto API
   deciso lato Web.
4. La responsivita del Web diventa un requisito di uscita di V1, non un
   miglioramento opzionale: ogni pagina toccata da un intervento deve restare
   usabile a 375 px, 768 px e 1280 px.
5. Le regole di dominio nuove continuano a nascere server-side
   ([ADR-0021](#adr-0021--backend-typescript-per-la-v1-nessuna-migrazione-net)), cosi che un futuro
   client mobile le consumi invece di riscriverle.

**Conseguenze.**

- La fase F4 non e cancellata, e sospesa: quando riprendera, trovera un
  dominio piu stabile e piu logica gia server-side.
- `easygamemobile/` resta nel repository e nella CI: continua a essere
  compilato e verificato, ma non evolve.
- Il divieto di reintrodurre un ORM o una connection string nel mobile
  ([ADR-0018](#adr-0018--il-mobile-parla-solo-con-le-api-easygame-mai-con-neon)) resta in
  vigore e la CI continua a farlo rispettare.
- Chi lavora su un dominio condiviso di fatto (permessi trainer, utility
  certificati) **non** deve piu allineare a mano la copia mobile: la si
  allineera alla ripresa di F4, dichiarando il disallineamento in
  [16 — Debito tecnico](16-technical-debt.md).

**Stato:** ATTIVA.

---

## ADR-0026 — L'autosave si applica per sezione, e la classificazione e codice

**Data:** 2026-08-23

**Contesto.** La scheda Club ha nove schede e **un solo** pulsante «Salva
Modifiche», in fondo alla pagina. Chi cambia un recapito e passa ad altro perde
la modifica; chi non nota il pulsante lo perde sempre. Estendere l'autosave a
tutta la pagina pero non e accettabile: la stessa maschera contiene l'IBAN
degli incassi, i listini delle quote, le affiliazioni federali (che si possono
rimuovere) e la stagione attiva, che dal Blocco 2 decide **quali dati esistono**
per il resto dell'applicazione.

**Decisione.** L'autosave si concede **per sezione**, non per pagina, e solo
alle sezioni descrittive: Generale, Contatti, Social. Restano a conferma
esplicita Dati Fiscali, Dati Bancari, Federazione, Stagioni, Pagamenti e
Account/Fatturazione.

La classificazione **non e una convenzione da ricordare**: vive in
`src/lib/club-profile.ts` come dato, con la motivazione di ogni sezione
accanto, e `buildClubProfileSectionUpdate` restituisce un oggetto vuoto per le
sezioni non in autosave. Un test verifica che una sezione in autosave non possa
scrivere IBAN, dati fiscali, stagioni o listini.

Ogni autosave deve avere tutte e tre le cose: debounce, accorpamento
(`createCoalescingSaver`, WP-36) e stato visibile (`SaveStatus`).

**Conseguenze.**

- Sulle schede in autosave il pulsante «Salva» sparisce, **tranne** quando ci
  sono modifiche pendenti in una sezione a conferma esplicita: in quel caso
  resta, con un avviso. Altrimenti cambiare scheda le farebbe perdere in
  silenzio.
- `clubs.settings` e una colonna JSON unica: una scrittura parziale e sempre un
  read-modify-write. `saveClubProfileSection` rilegge la sola colonna
  `settings`, e solo quando la sezione la tocca davvero.
- Aggiungere una sezione alla scheda Club obbliga a dichiararne la natura in
  `CLUB_PROFILE_SECTIONS`. E il punto: la domanda «questa si puo salvare da
  sola?» diventa impossibile da saltare.

**Stato:** ATTIVA.

---

## ADR-0027 — Il codice fiscale si calcola, i comuni non si inventano

**Data:** 2026-08-23

**Contesto.** Il Blocco 4 chiede compilazione assistita di CAP, comune,
provincia e codice fiscale. Il codice fiscale italiano si calcola da cognome,
nome, data di nascita, sesso e **codice catastale (Belfiore) del comune di
nascita**. I primi quattro elementi l'applicazione li ha; il quinto richiede la
tabella dei circa 8.000 comuni italiani, che nel repository non c'e e che
nessuno ha fornito.

La tentazione era generarla a memoria. Un codice catastale sbagliato produce un
codice fiscale **formalmente valido e sostanzialmente falso**, che finisce su
tesseramenti e fatture e che nessuna validazione successiva puo scoprire: il
carattere di controllo tornerebbe corretto.

**Decisione.** EasyGame contiene solo dati anagrafici che puo garantire:

1. le **107 province** con sigla e regione — insieme chiuso, stabile,
   verificabile;
2. l'algoritmo completo del codice fiscale, **carattere di controllo incluso**,
   che accetta il codice catastale come input e non lo indovina mai;
3. la verifica di un codice fiscale gia inserito, e l'estrazione del codice
   catastale da un codice valido.

Nessuna tabella dei comuni finche non arriva da una fonte ufficiale (ANPR o
ISTAT). Quando il codice catastale manca, l'interfaccia lo chiede una volta
invece di tirare a indovinare.

**Conseguenze.**

- Il completamento «CAP → comune» non esiste. Esiste «provincia → regione», che
  e esatto, e la validazione formale del CAP.
- Il pulsante «Calcola» del codice fiscale compare solo quando tutti gli
  elementi ci sono, e **solo se il campo e vuoto**: non esiste nemmeno il gesto
  che sovrascriverebbe un valore inserito a mano. Un codice che non corrisponde
  ai dati anagrafici viene **segnalato**, mai corretto d'ufficio.
- Le stesse regole valgono sul server (`src/lib/server/anagrafica.ts`), che
  importa lo stesso modulo puro: client e server non possono divergere.
- Se un domani arriva la tabella dei comuni, l'unico punto da toccare e
  `italian-registry.ts`: la firma di `computeCodiceFiscale` non cambia.

**Stato:** ATTIVA, **emendata dall'ADR-0032** (Blocco 7): la tabella dei comuni
e arrivata. Il divieto di inventarla resta, ed e ora verificabile.

---

## ADR-0028 — Lo stato dell'onboarding vive nelle impostazioni del club

**Data:** 2026-08-23

**Contesto.** L'onboarding introdotto dal Blocco 4 deve essere saltabile e
riprendibile. Serve quindi ricordare a che punto e. Le alternative erano una
tabella dedicata, il `localStorage` del browser, oppure una chiave dentro
`clubs.settings`.

**Decisione.** `clubs.settings.onboarding`, normalizzato da
`src/lib/onboarding.ts`.

**Motivi.** Lo stato appartiene al **club**, non alla persona ne al
dispositivo: se il proprietario configura le categorie dal portatile e il
giorno dopo apre dal telefono, deve trovare quei passi gia fatti. Il
`localStorage` fallirebbe entrambe le cose. Una tabella per cinque flag
richiederebbe una migrazione, un modello e un endpoint per un dato che non
viene mai interrogato trasversalmente.

**Conseguenze.**

- Nessuna migrazione. Lo stato viaggia con il club, anche nei backup.
- `normalizeOnboardingState` tollera qualunque cosa trovi: uno stato scritto
  male da una versione futura non rompe la dashboard, la riporta a «da fare».
- `settings` e una colonna JSON unica, quindi ogni scrittura passa da
  `patchClubSettings`, che rilegge prima di riscrivere. Senza, salvare
  l'onboarding cancellerebbe stagioni e listini.
- `skipped` **non** e uno stato finale: toglie l'invito automatico ma lascia il
  percorso raggiungibile. Un onboarding saltato non e un onboarding perduto.

**Stato:** ATTIVA.

---

## ADR-0029 — IMAP ha tabella, credenziali e contesto crittografico propri

**Data:** 2026-08-23

**Contesto.** Il Blocco 4 chiede una configurazione IMAP opzionale accanto a
SMTP, con il vincolo esplicito: «Mantieni credenziali SMTP e IMAP separate».
La tabella `email_provider_configs` esisteva gia e la tentazione era riusarla
con un secondo `id`.

**Decisione.** Tabella separata `imap_provider_configs`, e — soprattutto —
**contesto crittografico separato**: `credential-crypto.ts` accetta un
`purpose` (`smtp` | `imap`) che entra sia nella derivazione della chiave sia
nel dato autenticato di AES-GCM.

**Motivi.**

- Il riuso era comunque impedito da un vincolo del database: la riga SMTP ha un
  CHECK `provider = 'smtp'` e richiede mittente e nome mittente, che per la
  posta in entrata non hanno significato.
- «Separate» come requisito di prodotto significa che una credenziale non deve
  poter essere usata al posto dell'altra. Con lo stesso contesto crittografico
  lo sarebbe stata: bastava copiare tre colonne da una riga all'altra. Con
  contesti diversi la decifratura fallisce, ed e un test a dimostrarlo.

**Decisione secondaria: nessuna libreria IMAP.** Serve un solo comando —
`LOGIN` — per dire all'amministratore se la configurazione funziona. La
conversazione e scritta come macchina a stati pura (`imap-protocol.ts`),
verificabile senza rete, e il solo pezzo che tocca il socket
(`imap-client.ts`) resta di poche decine di righe.

**Conseguenze.**

- Nessuna dipendenza nuova, e la parte con la logica e coperta da test.
- Il traffico e sempre cifrato: con `starttls`, se il server rifiuta l'upgrade
  la sessione viene **chiusa** invece di autenticarsi in chiaro.
- Username e password con CR o LF vengono rifiutati prima di raggiungere il
  socket: sono valori che arrivano da un form e finirebbero dentro un
  protocollo a righe.
- Oggi la casella non viene **letta** da nessuna funzione applicativa: questo
  ADR copre la configurazione, non la ricezione.

**Stato:** ATTIVA.

---

## ADR-0030 — La compatibilita fra categorie e configurata, non dedotta

**Data:** 2026-08-23

**Contesto.** Il Blocco 5 di Web V1 chiede di poter dire «un atleta Under 13
puo essere utilizzato anche in Under 14, ma non automaticamente in Under 15».
Prima l'unica relazione fra atleta e categoria era l'appartenenza
(`athlete_category_memberships`): non esisteva modo di esprimere la vicinanza
fra due categorie.

La strada apparentemente piu breve — dedurre la vicinanza dal nome («Under 13»
accanto a «Under 14») o dagli anni di nascita — non regge nel prodotto reale:
le categorie sono personalizzate e si chiamano «Pulcini - Scauri», «Pulcini -
S. Cosma», «Prima squadra femminile». Nomi vicini non significano categorie
vicine, e nomi lontani non significano categorie incompatibili.

**Decisione.** La compatibilita e una **configurazione esplicita della
categoria**: ogni categoria porta `compatibleCategoryIds`, l'elenco delle
categorie in cui i **suoi** atleti possono essere utilizzati. La logica vive in
`src/lib/category-compatibility.ts`, modulo puro.

Tre proprieta del modello:

1. **esplicita** — nessuna inferenza da nome o anni di nascita: vale solo cio
   che l'utente configura nella scheda della categoria;
2. **orientata** — «U13 verso U14» dice che gli atleti U13 sono utilizzabili in
   U14, non il contrario. Le due direzioni si configurano separatamente;
3. **non transitiva** — se U13 dichiara U14 e U14 dichiara U15, un atleta U13
   **non** diventa eleggibile per U15. Si guarda un solo salto, mai la chiusura
   transitiva. E il requisito esplicito del prodotto, ed e imposto dal codice:
   `getCompatibleCategoryIds` non viene mai riapplicata al proprio risultato.

**Tre concetti restano separati.**

| Concetto | Dove vive | Significato |
|---|---|---|
| Categoria primaria | `athlete_category_memberships.is_primary` | la categoria dell'atleta |
| Appartenenza secondaria | `athlete_category_memberships` | l'atleta e iscritto anche qui |
| Eleggibilita compatibile | calcolata, **mai persistita** | l'atleta potrebbe essere usato qui |

L'eleggibilita non crea membership, non cambia la categoria primaria e non fa
entrare nessuno in un gruppo da sola: chi la vuole deve chiederla. Il primo
consumatore e il gruppo numerazione, che espone il flag
`includeCompatibleCategories` (default `false`).

**Dove sono i dati.** `compatibleCategoryIds` sta nel payload della categoria,
quindi in `club_resource_items` e nell'aggregato `clubs.categories`. **Nessuna
migrazione Prisma**: le categorie sono gia una risorsa JSON del club, e una
tabella di adiacenza avrebbe introdotto uno schema per un dato che oggi vive
interamente dentro la configurazione del club.

**Alternative scartate.**

- *Dedurre dagli anni di nascita.* Due categorie possono condividere gli anni
  senza essere intercambiabili (squadre diverse dello stesso paese), e due
  categorie adiacenti possono avere regolamenti che vietano lo scambio.
- *Relazione simmetrica.* «Gli U13 possono giocare in U14» quasi mai implica il
  contrario: renderla simmetrica avrebbe reso configurabile solo il caso raro.
- *Chiusura transitiva.* E esattamente cio che il prodotto vieta.
- *Tabella `category_compatibilities`.* Un secondo modo di conservare la
  configurazione di una categoria, con il rischio di disallineamento gia visto
  su `club_resource_items` (vedi ADR-0010).

**Conseguenze.**

- Le categorie personalizzate funzionano come quelle standard: il modello non
  guarda mai il nome.
- Chi legge una riga di un gruppo sa **perche** e li: `primary`, `secondary`,
  `compatible` o `external` (ha un numero ma non e piu nelle categorie del
  gruppo).
- Un club che non configura nulla non vede alcun cambiamento.

**Stato:** ATTIVA.

---

## ADR-0031 — Le stagioni hanno tre stati, una sola attiva, e si popolano per riporto

**Data:** 2026-08-24 · **Contesto:** Blocco 6, WP-35

**Problema.** Con WP-32 le stagioni erano davvero separate ma restavano due
buchi. Il primo: aprire una stagione nuova significava ricreare a mano
categorie, piani e sconti. Il secondo, meno visibile: lo stato di una stagione
non era governato. `normalizeClubSeasons` promuoveva ad `active` qualunque
stato non riconosciuto, quindi un club poteva ritrovarsi con tre stagioni
dichiarate attive e nessun modo di sapere quale contasse davvero.

La creazione, inoltre, viveva tutta nel browser: `handleCreateSeason` leggeva
le collezioni del club dallo stato React, ne clonava una parte con id
`Math.random()` e rimandava indietro l'intero oggetto club. Copiava anche
allenamenti, gare e movimenti, e rieseguirla duplicava tutto.

**Decisione.**

1. **Tre stati, una invariante.** `upcoming`, `active`, `archived`. La
   stagione puntata da `activeSeasonId` e l'unica `active`;
   `applySeasonStatuses` lo riafferma a ogni lettura e a ogni scrittura, e
   deduce dallo stato mancante il valore corretto dalle date. `draft` resta
   leggibile come `upcoming` per i club gia esistenti.
2. **Non si archivia la stagione attiva.** Si attiva un'altra stagione e
   quella viene archiviata di conseguenza. Cosi non esiste un istante in cui
   il club e senza perimetro dei dati.
3. **Le stagioni escono dal CRUD generico.** Endpoint dedicati
   `/api/v1/seasons`, dominio in `src/lib/server/seasons.ts`. Una stagione non
   e una risorsa: vive in `settings`, ha un'invariante propria e la sua
   creazione puo trascinarsi dietro una copia di dati.
4. **Il riporto copia la configurazione, mai la storia.** Categorie, sconti,
   piani, gruppi numerazione, programma settimanale, previsionale. Allenamenti,
   gare, presenze, movimenti e assegnazioni restano nella stagione in cui sono
   nati: chiederli e un errore dell'API, non un no-op.
5. **Riporto idempotente con record nuovi.** Ogni elemento copiato ha un id
   nuovo e porta `rolloverSourceId`; una seconda esecuzione riconosce cio che
   ha gia creato e non lo ricrea. I riferimenti fra elementi copiati vengono
   rimappati sui nuovi id.
6. **La stagione di un record e immutabile in aggiornamento.** Una PATCH con
   un `seasonId` diverso viene ignorata dal CRUD generico.

**Alternative scartate.**

- *Una tabella `seasons`.* Avrebbe richiesto una migrazione e un secondo
  luogo dove vive lo stesso concetto, mentre tutto il prodotto legge gia
  `clubs.settings.seasons`. Il modello e piccolo e la sua invariante e
  applicata in un punto solo: la tabella non risolveva un problema esistente.
- *Riusare gli stessi id nella stagione nuova.* Le due stagioni avrebbero
  condiviso la stessa riga: modificare la quota del 2027 avrebbe cambiato
  quella del 2026.
- *Riporto come copia integrale della stagione.* Falserebbe bilanci e
  presenze, e trasformerebbe l'archivio in una collezione di duplicati.
- *Consentire lo spostamento di un record fra stagioni.* Riscrive la storia di
  un'annata chiusa a fronte di una PATCH sbagliata. Chi vuole lo stesso
  elemento in due stagioni usa il riporto.
- *Rendere `trainers` e `staff_members` stagionali.* Sono anagrafiche globali
  del club: renderle stagionali avrebbe attribuito ogni allenatore esistente
  alla stagione baseline, facendoli sparire dall'annata corrente. Restano
  globali, e la procedura guidata lo dice esplicitamente invece di lasciarlo
  dedurre da un'assenza.

**Conseguenze.**

- Chi apre una stagione nuova vede, prima di confermare, quanti elementi
  verranno creati per ogni tipo: il numero viene dallo stesso calcolo che poi
  esegue la copia (`preview`), non da una stima.
- Il salvataggio generale della scheda Club non scrive piu le stagioni: era la
  strada per cui il salvataggio di un recapito poteva rimettere attiva
  l'annata precedente.
- Creazione, attivazione, archiviazione e riporto finiscono nell'audit log.

**Stato:** ATTIVA.


---

## ADR-0032 — L'archivio dei comuni e ISTAT, generato da uno script, servito dal server

**Data:** 2026-08-25 · **Contesto:** Blocco 7, punto 2

**Contesto.** [ADR-0027](#adr-0027--il-codice-fiscale-si-calcola-i-comuni-non-si-inventano)
aveva vietato la tabella dei comuni perche non ne esisteva una attendibile nel
repository, e generarla a memoria avrebbe prodotto codici fiscali
**formalmente validi e sostanzialmente falsi**. La conseguenza era che il
codice catastale lo digitava l'operatore, una volta per anagrafica: un dato di
quattro caratteri che nessuno ha in testa e che si va a cercare altrove.

Il Blocco 7 chiede di eliminare quella digitazione. La condizione posta da
ADR-0027 — «finche non arriva da una fonte ufficiale (ANPR o ISTAT)» — e ora
soddisfatta.

**Decisione.**

1. **La fonte e ISTAT**, l'elenco dei codici delle unita amministrative
   territoriali. Nella stessa riga porta denominazione, sigla della provincia,
   regione e **codice catastale (Belfiore)**, cioe lo stesso codice che
   l'Agenzia delle Entrate usa per il codice fiscale: non serve riconciliare
   due fonti.
2. **Il file in repo e generato, non scritto.**
   `scripts/build-comuni-dataset.mjs` scarica la fonte, verifica che le
   colonne siano quelle attese, che ogni codice catastale sia ben formato e
   unico, che ogni sigla sia una delle 107 note e che il numero di righe sia
   nell'ordine di grandezza giusto — e **fallisce senza scrivere** se qualcosa
   non torna. Il risultato, `src/data/comuni-istat.json`, dichiara URL,
   licenza, sha256 della fonte e numero di righe.
3. **La ricerca sta sul server.** Il dataset e circa 220 kB: nel bundle del
   client verrebbe scaricato da ogni pagina con un campo anagrafico. Vive
   dietro `GET /api/v1/comuni` (`src/lib/server/comuni.ts`), che risponde
   con le poche righe che servono. Il bundle condiviso non e cambiato.
4. **La logica di ricerca e un modulo puro** (`src/lib/comuni-model.ts`): il
   server gli passa 7.896 righe, i test sei. E la stessa separazione di
   `italian-registry.ts`.

**Cosa non e cambiato.** Il codice catastale **non si indovina mai**. Nessuna
funzione lo costruisce: o lo trova nell'archivio, o dice che non c'e. Un nome
di comune ambiguo senza provincia (`Castro` esiste in BG e in LE) non
restituisce il primo dei due: non restituisce niente, perche scegliere per
conto dell'utente vorrebbe dire scrivere il codice sbagliato dentro un codice
fiscale.

**Cosa e cambiato rispetto ad ADR-0027.** Un codice fiscale gia inserito puo
ora essere **sostituito**, ma solo con una conferma esplicita in due tempi e
solo quando non corrisponde ai dati anagrafici. Prima non esisteva il gesto; il
risultato pero era che una segnalazione di incoerenza non era azionabile e
l'operatore correggeva a mano ricopiando 16 caratteri.

**Cosa l'archivio non copre, e va detto.**

- **Il CAP.** ISTAT non lo pubblica in questo file e non e derivabile dal
  comune (i comuni grandi ne hanno decine). Resta digitato e validato nella
  forma, come prima.
- **I comuni soppressi** e **gli stati esteri** (codici `Z***`). Chi e nato a
  Zurigo o in un comune accorpato ha un codice fiscale valido che questa
  tabella non sa spiegare: per questo la casella manuale del codice catastale
  **resta**, chiusa dietro un collegamento, e un codice assente
  dall'archivio non viene mai segnalato come errore.

**Manutenzione.** ISTAT aggiorna l'elenco quando i comuni cambiano (fusioni,
cambi di provincia). `node scripts/build-comuni-dataset.mjs --check` dice se
il file in repo e ancora allineato; senza `--check` lo rigenera e il diff e
leggibile.

**Stato:** ATTIVA.


---

## ADR-0033 — Il PIN di club viene rimosso: non era una misura di sicurezza

**Data:** 2026-08-25 · **Contesto:** Blocco 7, punto 17

**Contesto.** EasyGame chiedeva un «PIN di 4 cifre» alla creazione del club e
lo usava per sbloccare il compenso di un allenatore, la scheda pagamenti,
l'eliminazione di un allenamento e la modifica di un pagamento atleta.

**Dependency audit.** Prima di rimuoverlo:

| Dove | Cosa c'era |
|------|------------|
| UI | `components/ui/pin-input.tsx`, montato in scheda allenatore (4 volte), scheda atleta (1), pagina allenamenti (1) |
| UI morta | `components/trainer/TrainerPayments.tsx`, mai importato, con `const correctPin = "1234"` |
| Creazione club | Campo «PIN di 4 cifre» in `ClubCreationForm` |
| API | `verifyClubPin` in `/api/athlete-payments/:id` |
| Client | `getClubPaymentPin` in `simplified-db.ts` |
| Database | `clubs.payment_pin`, e `payment_pin` fra i campi **proiettabili** di `/api/v1/clubs/:id` |
| Mobile | nessun riferimento |
| Seed, test, documentazione | nessun riferimento |

**Perche non era sicurezza.**

1. il valore predefinito era `"1234"`, scritto in chiaro **sia** nel client
   **sia** nel server, in un repository pubblico;
2. `payment_pin` era proiettabile: chiunque potesse leggere il club poteva
   leggere il PIN con `?fields=payment_pin`;
3. era un segreto **condiviso da tutto il club**: non diceva chi avesse agito,
   e chi lo conosceva lo conosceva per sempre;
4. quattro delle sei barriere erano **solo nell'interfaccia**: le stesse
   operazioni erano gia raggiungibili chiamando le API;
5. il componente morto lo confrontava con una costante, ignorando del tutto il
   PIN del club.

**Decisione.** Rimosso da UI, API e client. Al suo posto:

- la rotta `/api/athlete-payments/:id` controlla il **ruolo**
  (`canManageClubConfiguration`), cosa che il PIN non ha mai fatto: prima un
  allenatore con accesso al club poteva modificare un pagamento conoscendo
  quattro cifre note a tutti;
- dove il PIN era una conferma contro il clic sbagliato — eliminare un
  allenamento, eliminare un compenso — resta una **conferma esplicita**, che e
  cio che serviva davvero;
- dove nascondeva un dato che chi apre la pagina puo gia vedere — il compenso
  di un allenatore — non resta niente: e la matrice permessi a decidere chi
  entra nell'area.

**Cosa NON e stato toccato.** Access key, token di accesso genitore/allenatore
e membership sono concetti **diversi** e restano intatti: sono segreti
individuali, revocabili e con una scadenza. Il PIN non era nessuna di queste
cose.

**Dati legacy.** La colonna `clubs.payment_pin` resta nello schema. Toglierla
richiede una migrazione distruttiva e non serve a niente farlo: non la legge
piu nessuno e non e piu esposta dalle API. Un test lo dichiara, cosi la sua
presenza non sembra una dimenticanza.

**Stato:** ATTIVA.


---

## ADR-0034 — Gli allegati escono dai record e passano da un servizio con driver

**Data:** 2026-08-25 · **Contesto:** Blocco 8, punto B · WP-15

**Contesto.** Fino al Blocco 7 un allegato di EasyGame era una stringa
`data:application/pdf;base64,…` **dentro** il record di dominio: dentro
`athletes.data`, dentro il payload di un contratto allenatore, dentro un
certificato. Il Blocco 7 ha corretto tutto cio che si poteva correggere
lasciandolo li — apertura, download, eliminazione, nomi dei file — e ha
confermato che il resto e strutturale:

- una lista di 200 atleti trasferiva decine di MB. `view=summary` (WP-31) lo
  ha nascosto, non risolto: i byte sono ancora nella riga che si legge per
  mostrare un nome e una categoria;
- base64 costa il 33% in piu del binario, e Postgres lo tiene nel TOAST della
  stessa riga;
- un allegato non aveva **identita**: niente MIME affidabile, niente
  dimensione, niente autore, niente data. Nessun limite di dimensione e
  nessun controllo di tipo: si poteva caricare qualunque cosa;
- **non c'era autorizzazione sul file**. Il file era dentro un record gia
  letto: chi poteva leggere il record aveva i byte, sempre, tutti insieme.

**Decisione.**

1. **Un allegato e una riga di `attachments`**, con i suoi metadati
   (proprietario, categoria, nome originale, MIME, dimensione, sha256, autore,
   date). Il record di dominio ne conserva **solo un riferimento**, la stringa
   `attachment:<uuid>`.
2. **Il riferimento e una stringa** perche i campi che lo ospitano contenevano
   gia una stringa. Non c'e nessuna migrazione di forma da fare prima di poter
   usare il sistema nuovo, e i due formati convivono.
3. **I byte stanno in una tabella separata**, `attachment_blobs`. Se stessero
   sulla stessa riga dei metadati, elencare gli allegati tornerebbe a costare
   quanto scaricarli: sarebbe lo stesso difetto in un posto nuovo. Un test lo
   impedisce, verificando che nessuna `select` sui metadati nomini il
   contenuto.
4. **Il servizio e l'unico punto di scrittura e lettura**
   (`src/lib/server/attachments.ts`) e applica lo scope organizzativo su ogni
   operazione, con la stringa «Accesso negato» che il route handler mappa su
   403.
5. **Lo storage passa da un `StorageDriver`** — tre metodi: `put`, `get`,
   `remove`. Nessun chiamante sa dove sono i byte.

**Il provider esterno: decisione non presa, e perche.**

Il driver attivo e `database`. **Non e un ripiego**: risolve per intero il
difetto misurato — il binario non e piu nella riga che si legge per un elenco —
senza introdurre accoppiamento a un servizio proprietario dell'hosting, che
[ADR-0007](#adr-0007--nessuna-migrazione-net-ora-ma-nessun-nuovo-lock-in)
vieta. Per l'ordine di grandezza di una societa sportiva (alcune migliaia di
documenti, decine di GB nel caso peggiore) e la scelta corretta.

Scegliere un provider esterno **costa denaro e configurazione** ed e una
decisione del proprietario del prodotto, non di chi scrive il codice. Le
opzioni, con i loro vincoli:

| Opzione | Costo indicativo | Vincoli |
|---------|------------------|---------|
| **Restare su `database`** (attuale) | incluso nel piano Neon | Neon fattura lo storage; il backup del database include i file. Nessuna nuova credenziale |
| **S3-compatibile** (Cloudflare R2, Backblaze B2, Scaleway) | pochi euro/mese per decine di GB; R2 non fa pagare l'egress | Serve un bucket, due credenziali in Vercel e un driver nuovo (~150 righe). Nessun lock-in: e un protocollo, non un servizio |
| **Vercel Blob** | a consumo | **Escluso da ADR-0007**: servizio proprietario dell'hosting |

**Raccomandazione:** restare su `database` fino a quando l'archivio di un club
reale non supera qualche GB, poi passare a un driver S3-compatibile — che e
esattamente il lavoro che questa architettura riduce a un file nuovo e una
riga di configurazione. La condizione che fa scattare il cambio e misurabile:
`SELECT pg_size_pretty(pg_total_relation_size('attachment_blobs'))`.

**Migrazione dei dati legacy: incrementale, mai di massa.**

Un allegato legacy **continua a funzionare** e non e un errore da segnalare
all'utente. Migra quando qualcuno lo tocca: sostituire un file legacy lo
carica come allegato e il record passa dal data URL al riferimento. Non
esiste, e non deve esistere, un comando che riscrive l'archivio in blocco: la
riscrittura di massa di allegati e l'operazione che si scopre di aver
sbagliato quando un certificato medico non si apre piu e nessuno ha una copia.
`importLegacyDataUrl` esiste per convertirne **uno**.

**Cosa questa decisione non fa.**

- Non tocca `Asset.data_base64` e la tabella `assets`: sono la vecchia via del
  logo di club e delle immagini dei form, che ha un suo percorso e verra
  ricondotta al servizio quando quelle superfici si toccheranno;
- non introduce URL firmati. Un URL firmato sposterebbe l'autorizzazione dentro
  il provider di storage, cioe il lock-in che ADR-0007 vieta. Il file passa
  dalla sessione EasyGame come ogni altra richiesta.

**Stato:** ATTIVA.


---

## ADR-0035 — Il CAP non si risolve in comune finche non arriva una fonte con una licenza

**Data:** 2026-08-25 · **Contesto:** Blocco 8, punto A3 · voce di backlog B7-07

**Contesto.** Il Blocco 7 ha chiuso la ricerca comune → codice catastale con
l'archivio ISTAT ([ADR-0032](#adr-0032--larchivio-dei-comuni-e-istat-generato-da-uno-script-servito-dal-server)).
Resta aperta la direzione opposta, che una segreteria usa altrettanto spesso:
**si digita il CAP e si vorrebbe il comune**.

**Verifica fatta prima di decidere.** Nel repository **non esiste** una fonte
del CAP:

- `src/data/comuni-istat.json` ha tre colonne per riga — denominazione, sigla
  di provincia, codice catastale — e nient'altro. Il file ISTAT da cui e
  generato **non pubblica il CAP**;
- `src/lib/italian-registry.ts` conosce le 107 province con la loro regione, e
  del CAP valida solo la forma (cinque cifre);
- non c'e nessun altro dataset in `src/data/`.

**Decisione: la funzione resta `OPEN`, e non si inventa niente.** Un mapping
CAP → comune scritto a memoria o dedotto produce indirizzi formalmente
plausibili e sostanzialmente falsi, che finiscono su una ricevuta o su un
tesseramento. E lo stesso ragionamento che ha tenuto chiusa la tabella dei
comuni fino ad ADR-0032, ed e stato quello giusto.

**Cosa serve esattamente per chiuderla.** Una fonte con **tutte** queste
proprieta:

1. **copertura completa** dei CAP italiani, compresi quelli plurimi delle
   citta grandi (Roma ne ha oltre 200, Milano oltre 40) e i CAP dedicati a
   singole caselle postali o grandi utenze;
2. **relazione molti-a-molti dichiarata**: un comune ha piu CAP e alcuni CAP
   coprono piu comuni. Una fonte che espone un solo CAP per comune non e una
   fonte, e una semplificazione che sbaglia sulle citta dove serve di piu;
3. **chiave di collegamento con ISTAT**: codice ISTAT del comune o codice
   catastale. Riconciliare per nome non funziona — `Reggio nell'Emilia`,
   `Reggio Emilia`, `Reggio Nell'Emilia` sono la stessa cosa per una persona e
   tre stringhe diverse per un programma;
4. **licenza compatibile con la ridistribuzione** in un repository, come la
   CC BY 4.0 dell'archivio ISTAT gia in uso;
5. **aggiornamento tracciabile**, perche i CAP cambiano con le fusioni di
   comuni: un file scaricato una volta e dimenticato diventa sbagliato da
   solo.

Poste Italiane pubblica i CAP ma **non con una licenza di ridistribuzione**:
il suo servizio si consulta, non si copia. Le raccolte non ufficiali che
circolano soddisfano al massimo il punto 1, e nessuna dichiara la 4.

**Come si chiuderebbe, il giorno in cui la fonte c'e.** Esattamente come per i
comuni, e per questo il lavoro e piccolo: uno script che scarica, verifica e
genera (`scripts/build-cap-dataset.mjs`, gemello di
`build-comuni-dataset.mjs`), un modulo puro di ricerca, e un parametro in piu
su `GET /api/v1/comuni`. Nessun form cambia.

**Nel frattempo** il CAP resta digitato e validato nella forma, e il comune si
cerca per nome — che e la direzione che l'archivio ISTAT copre davvero.

**Stato:** ATTIVA.

---

## ADR-0036 — I moduli escono da `clubs.document_templates` e diventano tre tabelle

**Data:** 2026-08-26
**Contesto:** Modulistica V2, Workstream C.

Un modulo online, e ogni risposta che aveva raccolto, erano oggetti dentro
`clubs.document_templates` — lo stesso campo JSON dei modelli di stampa.

**Il problema non era estetico.** Tre difetti misurabili:

1. **una risposta riscriveva l'intero array del club.**
   `saveOnlineFormBundle` leggeva `document_templates`, ci rimetteva dentro
   tutti i moduli e tutte le compilazioni, e riscriveva la colonna. Due invii
   sovrapposti e l'ultimo cancellava il primo. Per un modulo di iscrizione
   aperto a duecento famiglie la sovrapposizione non e un caso limite: e il
   giorno in cui si manda il link;
2. **trovare un modulo pubblico costava una scansione.**
   `findPublicOnlineFormBySlug` faceva
   `WHERE document_templates @> '[{"type":"online_form","publicSlug":"…"}]'`
   su tutta la tabella `clubs`, senza indice utilizzabile;
3. **modificare un modulo cambiava retroattivamente il significato delle
   risposte gia raccolte**, perche non esisteva nessuna versione.

C'era anche un difetto di proprieta: `src/lib/server/online-forms.ts` scriveva
`clubs.document_templates` **direttamente con Prisma**, aggirando
`resources.ts` che di quel campo e il proprietario e che lo tiene allineato a
`club_resource_items`. E l'errore tipico numero 3 di `CLAUDE.md`.

**Decisione.** Tre tabelle: `form_templates` (il modulo, con la bozza),
`form_template_versions` (una versione pubblicata, immutabile),
`form_submissions` (una compilazione, che cita la versione con cui e stata
compilata).

**Perche tre e non una.** Bozza e versione pubblicata sono due cose diverse
con due cicli di vita diversi: la prima cambia mentre la si scrive, la seconda
non cambia mai. Tenerle nella stessa riga vorrebbe dire scegliere fra «il
pubblico vede le mie modifiche a meta» e «non posso salvare finche non ho
finito».

**Perche non `club_resource_items`.** Sarebbe stato il contenitore generico
gia esistente, e avrebbe evitato una migrazione. Ma un modulo ha uno slug
pubblico **unico su tutta l'istanza**, e un contenitore con `payload Json` non
puo esprimere un vincolo di unicita su un campo del payload. Senza quel
vincolo, due club possono pubblicare lo stesso link e chi lo apre finisce nel
posto sbagliato: non e un difetto di prestazioni, e un difetto di isolamento.

**Alternativa scartata: lasciare tutto com'era e mettere una toppa al
concorrente.** Un lock ottimistico sul JSON avrebbe chiuso il primo difetto e
nessuno degli altri due, al prezzo di rendere piu complicato il codice che si
voleva comunque riscrivere.

**Cosa comporta.** Una migrazione **additiva** (`20260826090000_forms_v2`) che
non legge e non riscrive `clubs.document_templates`, e uno script di travaso
separato (`scripts/migrate-forms-v2.mjs`) che **copia** invece di spostare:
finche il campo non viene ripulito a mano, il dato di partenza e ancora li.
Lo script conserva gli slug legacy — i link gia mandati alle famiglie devono
continuare a rispondere — e segnala quali non hanno suffisso casuale.

Gli allegati dei moduli legacy restano nella tabella `assets` e vengono citati
come `asset:<id>`: travasare dei binari e un'operazione a se, con un rischio
suo, e non c'e ragione di legarla a questa.

**Stato:** ATTIVA.

---

## ADR-0037 — Una compilazione cita una versione immutabile e non scrive in anagrafica

**Data:** 2026-08-26
**Contesto:** Modulistica V2, Workstream C.

Due decisioni che si tengono insieme, perche rispondono alla stessa domanda:
**di chi e la responsabilita di cio che finisce in archivio.**

### 1. Versionamento, non fotografia

Il modulo di iscrizione si corregge tutti gli anni, a stagione aperta.
Servono due cose insieme: le risposte gia arrivate devono restare leggibili
con le domande di allora, e chi le legge deve poter dire *quali* domande erano.

Le opzioni erano tre:

| Opzione | Perche no |
|---------|-----------|
| Nessuna: il modulo e uno solo | E lo stato di partenza. Correggere l'etichetta di una domanda cambia il senso di trecento risposte gia raccolte |
| Copia dello schema dentro ogni compilazione | Funziona, ma trecento copie dello stesso schema, e nessun modo di dire «queste due risposte sono confrontabili» |
| **Versioni immutabili citate dalla compilazione** | Scelta |

Una riga di `form_template_versions` non si aggiorna mai. `published_version`
sul modulo dice qual e quella corrente. Ripubblicare senza modifiche **non**
crea una versione gemella, altrimenti il numero di versione smetterebbe di
significare qualcosa.

**Conseguenza accettata:** un modulo con compilazioni non si cancella, si
archivia. Cancellarlo porterebbe via le versioni, e le risposte diventerebbero
un elenco di identificativi senza domande. `deleteFormTemplate` lo fa da solo
e lo dice.

**Perche non si conserva anche una copia dello schema nella compilazione.**
Sarebbe la stessa informazione in due posti, con la possibilita che divergano.
La citazione resta sempre risolvibile proprio perche la cancellazione e
impedita.

### 2. Una compilazione e una proposta

Un modulo pubblico e compilato da chi vuole, quando vuole, dal telefono.
Contiene errori di battitura, doppi invii e omonimie. Se quelle risposte
finissero direttamente nella scheda dell'atleta, l'anagrafica di un club
sarebbe la somma di quello che hanno digitato duecento persone.

**Decisione.** Una compilazione arriva, viene validata, e si ferma in coda.
La segreteria vede la **proposta** — quale scheda verrebbe toccata, quale
valore c'e adesso, quale ci sarebbe dopo, e quali schede esistenti le
somigliano — e decide. Solo l'approvazione scrive, e scrive passando da
`resources.ts`, quindi con la validazione anagrafica e la doppia scrittura
gia in essere.

**Un solo percorso.** Anche la compilazione fatta dalla segreteria dalla
scheda di un atleta passa dalla stessa coda e dalla stessa finestra di
revisione. Un secondo percorso «tanto qui e la segreteria» sarebbe un secondo
insieme di regole da tenere allineato, e uno dei due sbaglierebbe.

**Cio che l'anteprima mostra e cio che l'approvazione scrive**, perche e la
stessa funzione (`buildChangeSet`) a calcolarlo. Non esiste una scrittura che
l'anteprima non abbia descritto.

**Il mapping e server-trusted.** Un campo non porta un percorso, porta una
**chiave** di un catalogo chiuso (`src/lib/forms/dynamic-fields.ts`). Una
chiave che il catalogo non conosce viene scartata in normalizzazione, quindi
non arriva mai al momento in cui la si userebbe per scrivere. I dati della
societa sono marcati di sola lettura: un modulo di iscrizione non riscrive la
ragione sociale.

**I duplicati si mostrano, non si risolvono.** Codice fiscale, nome piu data
di nascita, email: tre criteri, e per ciascuno si dice **perche** due schede
si somigliano. Unire due anagrafiche e una decisione che costa, e chi la
prende deve essere una persona.

**Stato:** ATTIVA.
