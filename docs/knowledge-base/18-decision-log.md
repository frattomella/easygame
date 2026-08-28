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

**Stato:** SUPERATA da
[ADR-0042](#adr-0042--il-cap-arriva-da-ipa-e-si-propone-solo-dove-il-comune-ne-ha-uno-solo),
che ha trovato la fonte mancante (IPA di AgID, CC BY 4.0). Il divieto di
inventare un mapping resta in piedi: ADR-0042 lo esegue, non lo rovescia.

---

## ADR-0036 — Una rata e un debito, un incasso e un movimento: due tabelle, non una

**Data:** 2026-08-26 · **Contesto:** Web V1, Workstream A — Pagamenti V2

**Contesto.** La segreteria segnalava quattro cose diverse: che per incassare
bisognava spostare a mano uno stato da «In attesa» a «Pagata»; che una rata da
130 EUR pagata in tre volte non era registrabile; che correggere un incasso
faceva sparire la rata; che lo stato di una rata poteva dire una cosa e gli
importi un'altra.

Sono lo stesso difetto visto da quattro lati. `payments` faceva **due
mestieri**: la riga portava l'importo dovuto (`amount`, `due_date`,
`description`) e, negli stessi campi, il modo in cui era stato pagato
(`status`, `paid_at`, `method`). Con un solo importo per riga, un incasso
parziale non e rappresentabile; con lo stato sulla riga del debito, l'unico
modo di dire «ho incassato» e modificare il debito.

**Decisione.**

1. **`payments` resta il dovuto.** Una riga = una rata, o una voce a debito
   aggiunta a mano.
2. **`payment_transactions` e il registro degli incassi.** Ogni riga e un
   movimento di denaro: importo, data, metodo, note, sorgente, riferimento
   esterno, chi l'ha registrato.
3. **Lo stato di una rata non e un dato, e un calcolo.**
   `resolveInstallmentLedger` confronta la somma degli incassi validi con il
   dovuto e produce `IN ATTESA`, `PARZIALMENTE PAGATA` o `PAGATA`, piu
   `SCADUTA` quando la scadenza e passata e la rata e ancora scoperta. Una
   rata scaduta e parziale porta **entrambe** le etichette.
4. **`payments.status`, `paid_at` e `method` sopravvivono come cache
   derivata.** Li riscrive il servizio incassi nella stessa transazione che
   inserisce il movimento. Restano perche meta applicazione li legge —
   riepiloghi, report, area Movimenti, app mobile — ma nessuna interfaccia li
   offre piu come campo modificabile.
5. **Un incasso non si cancella: si storna.** `reversed_at` marca
   l'originale, un movimento di segno opposto lo compensa,
   `reverses_transaction_id` li collega. Correggere significa stornare e
   registrare di nuovo.
6. **La ricevuta si emette per incasso**, non per rata: `receipts.payment_id`
   perde il vincolo di unicita e arriva `receipts.transaction_id`.

**Perche una cache derivata e non la rimozione dei tre campi.** Rimuoverli
avrebbe toccato l'area Movimenti, i report, la dashboard e il contratto API
che l'app mobile consuma — cioe un cambiamento di ampiezza sproporzionata
rispetto al difetto, in un workstream che deve restare confinato ai pagamenti.
Tenerli come copia scritta **solo dal server** ottiene la proprieta che serve
davvero: lo stato non puo piu contraddire gli importi, perche nessuno lo
scrive a mano. Il costo e che due rappresentazioni della stessa cosa
convivono; il rischio e mitigato dal fatto che una sola funzione le scrive
entrambe, nella stessa transazione.

**Perche nessuna migrazione dei dati.** Le rate gia marcate come pagate non
hanno un movimento che lo dimostri, e inventarne uno vorrebbe dire scrivere
denaro con una data e un metodo che nessuno ha dichiarato. Restano come sono:
`resolveInstallmentLedger` tratta una rata **senza nessun movimento** e
marcata pagata come incassata per intero. Al primo incasso registrato comanda
il registro. La compatibilita e ancorata all'assenza di movimenti, non
all'assenza di movimenti *validi*: altrimenti stornare l'unico incasso di una
rata la riporterebbe a «pagata», e lo storno non avrebbe effetto.

**Perche `source` esiste ma accetta solo `MANUAL`.** Il modello dichiara
`MANUAL | STRIPE | CEDIPAY | IMPORT | OTHER` perche il giorno in cui un
provider viene attivato non serva una migrazione. Il servizio **rifiuta**
tutto cio che non e `MANUAL`: accettare un incasso dichiarato `STRIPE` senza
un webhook verificato vorrebbe dire registrare denaro che nessuno ha
incassato. Vedi [ADR-0013](#adr-0013--i-pagamenti-restano-in-roadmap-e-passeranno-da-cedipay--platformpayments)
e il rischio 6 in [14 — Sicurezza](14-security.md).

**Conseguenze.**

- La segreteria registra un incasso con «Registra pagamento»: importo
  precompilato con il residuo e modificabile, metodo scelto fra quelli
  configurati dal club, data, note, riepilogo. Lo stato lo ricava il sistema.
- Una rata mostra sempre dovuto, incassato, residuo, scadenza, stato e barra
  di avanzamento; il dettaglio elenca gli incassi in ordine **crescente**, che
  e l'ordine di un estratto conto.
- Scheda atleta e area Movimenti montano lo **stesso** componente: non
  esistono due finestre «quasi uguali» che divergono alla prossima modifica.
- I totali dell'atleta si sommano per **importo**, non per stato: un acconto
  da 50 su una rata da 200 conta 50. Prima contava zero, perche la rata non
  era «pagata».
- Registrare e stornare richiedono il ruolo che governa la configurazione del
  club e finiscono nell'audit log.
- `receipt_number` resta univoco su tutta la tabella e non per club: e un
  difetto di modello preesistente, annotato in
  [16 — Debito tecnico](16-technical-debt.md). L'emissione lo aggira
  riprovando con il numero successivo.

**Cosa questa decisione NON fa.** Non introduce una contabilita fiscale: la
fattura resta l'oggetto che era, la numerazione non e un registro IVA, e non
si tocca il ciclo attivo. Non attiva nessun pagamento online.

**Stato:** ATTIVA.

---

## ADR-0037 — Un contributo non e un pagamento: due contabilita separate, e le regole del bando sono dati

**Data:** 2026-08-26 · **Contesto:** Web V1, Workstream A — Voucher e contributi

**Contesto.** Le societa sportive incassano da due fonti che si somigliano solo
in banca: le famiglie, e gli enti che finanziano la pratica sportiva dei minori
(voucher regionali, contributi comunali, bandi). Il caso reale di riferimento e
il **Voucher per lo Sport della Regione Lazio 2025** (Sport e Salute): un
plafond per atleta, mensilita riconosciute solo se l'atleta ha frequentato
abbastanza, e il pagamento al club che arriva **dopo** la maturazione e la
rendicontazione.

EasyGame non aveva un posto dove tenere niente di tutto questo. L'unico modo di
registrare un contributo sarebbe stato inventare un incasso — cioe dichiarare
denaro che nessuno ha ancora versato — e la rata della famiglia sarebbe
risultata saldata da soldi che il club non ha.

**Decisione 1: le regole del bando sono configurazione, non codice.**

`funding_programs` porta in colonne tutto cio che distingue un bando
dall'altro: importo per periodo, frequenza (mensile o a N giorni), requisito
minimo, unita del requisito (ore o presenze), comportamento sotto soglia
(`none` / `prorata` / `full`), plafond per atleta, tetto ai periodi, tetto
all'importo, validita, stato, e il codice voucher individuale sul
beneficiario.

Il Voucher Lazio 2025 e un insieme di valori, non un ramo dentro il calcolo. Un
test statico verifica che **nessuna sua costante compaia in `src/`**: un
dominio che si dice configurabile e poi porta 500, 60 o 8 dentro un modulo non
e configurabile, e il secondo bando che arriva lo scopre nel modo peggiore.

**Decisione 2: cinque importi, e restano cinque.**

| Importo | Cosa significa | Dove sta |
|---|---|---|
| **assegnato** | il plafond riservato all'atleta | `funding_enrollments.assigned_amount` |
| **maturato** | quanto ne ha guadagnato frequentando | Σ `funding_accruals.accrued_amount` |
| **rendicontato** | quanto e stato dichiarato all'ente | Σ maturato con stato `reported`/`settled` |
| **liquidato** | quanto l'ente ha **versato** | Σ `funding_settlement_lines.amount` |
| **residuo** | quanto puo ancora maturare | assegnato − maturato |

Il **liquidato si legge dalle righe di liquidazione, non dallo stato del
periodo**: con liquidazioni parziali — che sono la norma — i due numeri
differiscono, e fidarsi dello stato conterebbe come incassati soldi arrivati a
meta.

**Decisione 3: il maturato lo calcola il server, dalle presenze.**

`recomputeEnrollmentAccruals` legge `training_attendance` e gli allenamenti in
`club_resource_items`, misura ore o sessioni periodo per periodo e applica la
configurazione. La segreteria non digita nessun numero. Tre proprieta
deliberate:

- **il ricalcolo e un'azione, non un effetto della lettura.** Scansiona le
  presenze e gli allenamenti del club: farlo a ogni apertura di una scheda
  costerebbe una scansione per visita. E ripetibile — l'unico
  `(enrollment_id, period_index)` lo rende idempotente — quindi si rifa ogni
  volta che qualcuno corregge un appello;
- **un periodo gia liquidato non si riscrive**, perche l'ente ha versato su
  quel numero; ma il suo maturato **consuma comunque plafond**, altrimenti i
  periodi successivi ne troverebbero piu di quanto ce n'e;
- **un periodo rendicontato torna «maturato» se il ricalcolo ne cambia
  l'importo**: cio che era stato dichiarato all'ente non corrisponde piu, e
  fingere il contrario e il modo in cui una rendicontazione diventa falsa.

Conta solo `status = "present"`. Un allenamento senza appello non e una
presenza: un contributo pubblico si rendiconta con cio che si puo dimostrare.
Un allenamento **senza orario** non contribuisce alle ore e la cosa viene
*detta* (`sessionsWithoutDuration`) invece di sparire in un totale piu basso —
un requisito orario mancato per dati incompleti e un problema di anagrafica,
non di frequenza, e le due cose si risolvono in modi diversi.

**Decisione 4: il periodo non e una tabella.**

I periodi si ricavano interamente dalla configurazione
(`generateFundingPeriods`). Salvarli sarebbe una seconda fonte di verita per
qualcosa che si ricalcola in un microsecondo, con il rischio classico che le
due divergano il giorno in cui qualcuno corregge le date del bando. Il periodo
viene **denormalizzato dentro il maturato**, dove serve a spiegare un importo
gia calcolato e dove congelarlo e giusto.

Il mensile segue il **mese di calendario**, non trenta giorni dall'inizio: un
ente che dice «mensilita» intende gennaio, febbraio, marzo, e una
rendicontazione sfasata di qualche giorno non gli e accettabile. Il primo e
l'ultimo periodo possono essere parziali e restano tali.

**Decisione 5: le due contabilita non si sommano, e nemmeno si toccano.**

`src/lib/server/funding.ts` **non importa** `payment_transactions` ne
`athletePayment`, e `installment-ledger.ts` non sa cosa sia un contributo. Una
liquidazione non genera nessun incasso della famiglia. Nella scheda atleta i
contributi hanno un riquadro proprio, e il Riepilogo Incassi dichiara di chi e
il denaro che mostra: «Pagamenti della famiglia».

**Perche non si compensa automaticamente la rata della famiglia.** Sarebbe la
cosa che sembra piu comoda e la piu pericolosa: nella pratica il voucher copre
una parte della quota, e quale parte lo decide il club insieme alla famiglia —
non l'importo maturato. Compensare in automatico farebbe risultare **saldate
rate che nessuno ha pagato**, e la scoperta arriverebbe a fine stagione. Il
collegamento fra un contributo e le rate che alleggerisce resta una decisione
esplicita, oggi non implementata, tracciata come voce di backlog.

**Conseguenze.**

- Un voucher assegnato non compare mai come incasso. Il maturato e un credito
  verso l'ente; solo la liquidazione e cassa, e resta comunque distinta dai
  pagamenti della famiglia.
- La scheda atleta mostra i cinque importi e il dettaglio periodo per periodo,
  con il motivo di ciascun importo: «Requisito raggiunto», «Sotto la soglia di
  8 ore», «Plafond quasi esaurito».
- Configurare, ricalcolare, rendicontare e liquidare richiedono
  `canManageClubConfiguration`. Ogni scrittura finisce nell'audit log.
- Un atleta puo beneficiare di piu contributi insieme; i riepiloghi si sommano
  fra loro, mai con i pagamenti.
- Il modello e pronto per bandi che EasyGame non ha ancora visto: unita del
  requisito e comportamento sotto soglia sono elenchi estendibili, non
  condizioni sparse.

**Cosa questa decisione NON fa.** Non implementa la trasmissione telematica
delle rendicontazioni a nessun ente: `reported` e una marcatura interna, e il
canale verso il finanziatore resta quello che il bando prescrive. Non introduce
una contabilita fiscale. Non modifica il dominio dei pagamenti
([ADR-0036](#adr-0036--una-rata-e-un-debito-un-incasso-e-un-movimento-due-tabelle-non-una)).

## ADR-0038 — La sede e un concetto separato dalla categoria, e il gruppo operativo e la loro coppia

**Data:** 2026-08-26 · **Contesto:** Web V1, Workstream B · voce di backlog P-01

**Problema.** Lo stesso club svolge la **stessa** categoria in luoghi diversi:
i Pulcini si allenano a Roma e ad Aprilia. L'unico modo di dirlo era duplicare
la categoria — `Pulcini - Roma`, `Pulcini - Aprilia` — e con la categoria si
duplica tutto quello che le sta attaccato:

- due fasce di anni di nascita da tenere allineate a mano;
- due configurazioni di compatibilita ([ADR-0030](#adr-0030--la-compatibilita-fra-categorie-e-configurata-non-dedotta)),
  che vanno scritte due volte e in due direzioni;
- due righe in ogni elenco che ragiona per categoria, comprese quelle dove la
  sede non c'entra niente (magazzino, quote, certificati);
- un atleta che «cambia categoria» quando in realta ha solo cambiato citta,
  perdendo la continuita della sua appartenenza.

**Decisione.** Quattro concetti distinti, ognuno con una domanda sola.

| Concetto | Domanda a cui risponde | Dove vive |
|---|---|---|
| **Categoria** | in che fascia gioca? | `categories` — **invariata** |
| **Sede** | in che citta opera il club? | `clubs.club_sites` |
| **Struttura** | in che impianto? | `structures[].siteId` |
| **Gruppo operativo** | quale squadra concreta? | `clubs.category_groups` |

Il gruppo operativo e la coppia **(categoria, sede)**: `Pulcini` a `Roma`, che
si mostra `Pulcini · Roma`. Non e una categoria, non ne crea una e non ne
eredita nessuna proprieta: la categoria resta una sola, con una sola fascia
d'anno e una sola compatibilita.

La sede dell'atleta sta sull'**appartenenza**, non sull'anagrafica
(`athlete_category_memberships.site_id`): e la risposta esatta alla domanda
«dove svolge *questa* categoria», e permette a un atleta di essere Pulcino a
Roma e fuori quota ad Aprilia senza che le due cose si contraddicano.

**Tre proprieta volute.**

1. **Niente deduzione dal nome.** Una sede non si riconosce dal suffisso di
   una categoria. `Pulcini - Scauri` resta una categoria che si chiama cosi:
   il collegamento a una sede esiste **solo** se qualcuno lo configura. E la
   stessa scelta di ADR-0030 e per la stessa ragione — i nomi reali non sono
   parsabili, e sbagliare a parsarli significa spostare atleti.
2. **Il club mono-sede non paga niente.** Con meno di due sedi attive
   `isMultiSiteClub` e falsa: i gruppi restano **impliciti** (uno per
   categoria, con l'etichetta della categoria) e nessuna interfaccia mostra un
   filtro sede. Chi non ha il problema non vede la soluzione.
3. **Il dato storico non sparisce.** Sede vuota su un record significa «sede
   non dichiarata», **non** «nessuna sede»: il record resta visibile con
   qualunque filtro sede. E l'invariante che rende la migrazione sicura, ed e
   verificata dai test — nessun atleta, nessuna struttura e nessun gruppo puo
   uscire da un elenco perche le sedi sono state introdotte.

**Alternative scartate.**

- *Categoria con campo sede.* Rende la categoria non unica: `Pulcini` a Roma e
  `Pulcini` ad Aprilia diventano due categorie con lo stesso nome, e ogni
  elenco per categoria le mostra entrambe. E la duplicazione di prima, con un
  campo in piu.
- *Sede sull'anagrafica dell'atleta.* Un atleta che partecipa a due gruppi in
  due sedi non e rappresentabile, e la sede diventa un attributo della persona
  invece che dell'attivita.
- *Sede dedotta dalla struttura dell'allenamento.* Funziona finche un gruppo
  si allena sempre nello stesso impianto. Il primo allenamento in trasferta lo
  sposta di sede.

**Cosa e stagionale e cosa no.** `category_groups` segue le categorie: e
stagionale e riportabile fra stagioni. `club_sites` **no**: un impianto a Roma
resta a Roma anche l'anno dopo, e duplicarlo a ogni stagione moltiplicherebbe
le sedi. Vedi `SEASON_SCOPED_DATA_TYPES` e `SEASON_GLOBAL_DATA_TYPES` in
`src/lib/club-seasons.ts`.
## ADR-0039 — I moduli escono da `clubs.document_templates` e diventano tre tabelle

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
## ADR-0040 — Una compilazione cita una versione immutabile e non scrive in anagrafica

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

## ADR-0041 — Numerazione e fine riga quando piu workstream lavorano in parallelo

**Data:** 2026-08-25 · **Contesto:** integrazione Web V1 (Workstream A, B e C)

**Problema.** Tre workstream sono partiti dallo stesso commit e hanno lavorato
in parallelo per giorni senza vedersi. Ognuno ha fatto la cosa giusta e ha
numerato il proprio lavoro dal primo numero libero **che vedeva**. Al momento
del merge c'erano tre `ADR-0036`, tre `WP-47`, due `D28`, due `R-11` e tre
migrazioni con lo stesso timestamp `20260826090000`.

Nessuno di questi e un conflitto che Git segnala: sono due significati diversi
per la stessa etichetta in file che si fondono puliti. Un riferimento
`ADR-0036` in un commento del codice diventa ambiguo, e resta ambiguo per
sempre, perche nessuno rilegge un commento per chiedersi a quale delle tre
decisioni si riferisse.

Un quarto problema e emerso dallo stesso lavoro parallelo: il Workstream B ha
incontrato un test che falliva nel suo worktree e non nella copia principale,
e ha reagito cambiando `core.autocrlf` sulla propria macchina. Il test
misurava una distanza in caratteri nel sorgente, e in un checkout CRLF ogni
riga in mezzo ne aggiunge uno.

**Decisione.**

1. **Le etichette si assegnano all'integrazione, non allo sviluppo.** Un
   workstream numera come crede mentre lavora; chi integra rinumera in ordine
   **di merge**, che e l'ordine in cui le decisioni entrano nella storia del
   repository. Qui: Workstream A tiene 0036-0037, B diventa 0038, C diventa
   0039-0040. Lo stesso per i WP (47-48, 49, 50), per il debito tecnico e per
   le voci di backlog.
2. **La rinumerazione non e completa finche non e verificata da un test.**
   `tests/ui/kb-link-integrity.test.mjs` controlla i link interni della KB e
   che gli ADR non abbiano doppioni ne salti. Rinumerare a mano trentatre
   riferimenti sparsi in venticinque file senza una verifica automatica
   significa spostare il problema, non risolverlo: ha infatti fatto emergere
   due link gia rotti dalla baseline.
3. **Le migrazioni si rinominano, non si riscrivono.** Timestamp distinti e
   crescenti nell'ordine di merge; il contenuto SQL resta identico byte per
   byte. Il timestamp di una migrazione dice quando entra nella catena, non
   quando qualcuno l'ha scritta.
4. **I fine riga sono una proprieta del repository, non della macchina.**
   `.gitattributes` con `* text=auto eol=lf`, piu i file eseguiti da Windows
   (`.bat`, `.cmd`, `.ps1`) tenuti a CRLF di proposito. In piu, i test che
   leggono il sorgente lo normalizzano a LF: la convenzione fissa il
   checkout, la normalizzazione difende comunque.

**Perche non lasciare a ogni workstream un intervallo riservato** (A: 0036-39,
B: 0040-43, C: 0044-47). Sembra piu semplice e ha due difetti. Lascia buchi
quando un workstream ne usa meno di quanti gliene erano stati assegnati, e un
registro con i buchi non si legge piu in ordine cronologico. E soprattutto
richiede di sapere in anticipo quanti workstream partiranno e quanto
decideranno: e una previsione, e una previsione sbagliata torna a produrre
collisioni.

**Perche l'ordine di merge e non quello cronologico delle date.** Le date sono
tutte lo stesso giorno, e comunque descrivono quando qualcuno ha scritto il
documento, non quando la decisione e entrata nel prodotto. L'ordine di merge
e verificabile dalla storia di Git, che e la sola cronologia su cui due
persone non possono essere in disaccordo.

**Conseguenze.**

- Chi apre un workstream parallelo sa che la sua numerazione e **provvisoria**
  e non deve difenderla al merge;
- chi integra ha una regola invece di un giudizio caso per caso, e un test che
  gli dice quando ha finito;
- un checkout su una macchina nuova produce gli stessi byte di uno su una
  macchina vecchia, e un test che fallisce dice qualcosa del codice.

**Stato:** ATTIVA.

---

## ADR-0042 — Il CAP arriva da IPA, e si propone solo dove il comune ne ha uno solo

**Data:** 2026-08-25 · **Contesto:** Blocco A, punto 9 · voci di backlog B7-07, B8-06

**Supera [ADR-0035](#adr-0035--il-cap-non-si-risolve-in-comune-finche-non-arriva-una-fonte-con-una-licenza).**

**Cosa diceva ADR-0035, e perche aveva ragione.** Nel repository non esisteva
nessuna fonte del CAP, ISTAT non lo pubblica, e un mapping scritto a memoria o
dedotto avrebbe prodotto indirizzi formalmente plausibili e sostanzialmente
falsi — su una ricevuta o su un tesseramento. La decisione di non inventare
niente era quella giusta e resta in piedi: **questo ADR non la rovescia, la
esegue.** Quello che mancava era una fonte, non un permesso.

**Cosa e cambiato.** La ricerca di ADR-0035 si era fermata a Poste Italiane —
che pubblica i CAP ma non con una licenza di ridistribuzione — e alle raccolte
non ufficiali. La fonte c'era in un posto in cui non era stata cercata:
l'**Indice della Pubblica Amministrazione (IPA)**, gestito da AgID.

Verifica fatta prima di decidere, contro le cinque proprieta che ADR-0035
chiedeva:

| # | Proprieta richiesta | IPA |
|---|---------------------|-----|
| 1 | Copertura completa | 7.888 comuni su 7.896 (99,9%) hanno almeno un'osservazione |
| 2 | Relazione molti-a-molti dichiarata | **Parziale, e da qui discende la decisione** — vedi sotto |
| 3 | Chiave di collegamento con ISTAT | Denominazione + sigla di provincia, unite all'archivio ISTAT gia in repository per ricavare il codice catastale |
| 4 | Licenza compatibile con la ridistribuzione | **CC BY 4.0**, la stessa dell'archivio ISTAT gia in uso |
| 5 | Aggiornamento tracciabile | Giornaliero, con `sha256` della fonte inciso nel dataset generato |

Sono state esaminate e **scartate** due alternative:

- il *Cruscotto Italia* di `dati.gov.it`, che federa 28 dataset istituzionali:
  non contiene i CAP. Porta ANNCSU (stradario, Agenzia delle Entrate), che ha
  vie e numeri civici ma non codici postali;
- `comuni-json`, la raccolta comunitaria piu citata, che ha i CAP come array e
  soddisfarebbe il punto 2: **dichiara esplicitamente di non applicare nessuna
  licenza** alla parte CAP, perche gli autori stessi non sono sicuri dei
  diritti sulla fonte originale, e i dati sono fermi al 2020. Fallisce 4 e 5.

**Che cosa e davvero il dato di IPA.** IPA non pubblica «i CAP del comune X».
Pubblica **l'indirizzo della sede di ogni pubblica amministrazione**, e quindi
il suo CAP. Raggruppati per comune, sono i *CAP osservati* in quel comune. La
differenza non e accademica:

- per un comune con un solo CAP, l'insieme osservato ha un elemento solo e
  quell'elemento **e** il CAP del comune;
- per una citta grande, l'insieme osservato e un **sottoinsieme** dei suoi CAP.
  Roma ne ha oltre 200 e IPA ne vede quelli degli uffici pubblici.

**Decisione.** Si genera `src/data/cap-ipa.json` con
`scripts/build-cap-dataset.mjs`, gemello di `build-comuni-dataset.mjs`, e si
applica una regola sola:

> **Il CAP si propone solo dove l'osservazione e unica.**

Per gli altri comuni il dataset registra **che** ce n'e piu d'uno e **non
quali**: pubblicare il sottoinsieme lo farebbe sembrare l'elenco completo. Al
form serve solo sapere che li non deve compilare, e dirlo all'operatore.

Numeri della generazione corrente: **7.836** comuni con CAP univoco, **52** con
CAP multipli, **8** senza osservazione.

**Perche il CAP vuoto ha due significati e non uno.** `postalCodeStatus` vale
`unique`, `ambiguous` o `unknown`. Con una stringa vuota sola il form non
potrebbe distinguere «questo comune ha piu CAP, indica quello dell'indirizzo»
da «di questo comune non so niente» — che per chi sta compilando sono due
situazioni diverse, e una delle due sembrerebbe un guasto.

**La sigla di provincia di IPA non e sempre quella di oggi.** 154 comuni sardi
portano ancora `VS`, `CI`, `OT` e `OG`, le province riorganizzate nel 2016,
dove ISTAT scrive `SU`, `SS` e `NU`. La tentazione era scrivere la tabella
delle province abolite dentro lo script: storia amministrativa incisa nel
codice, che invecchia da sola e che nessuno rivedra alla prossima
riorganizzazione. Il ripiego scelto non invecchia: **se una denominazione
appartiene a un comune solo in tutta Italia**, l'osservazione fatta sotto quel
nome e sua, qualunque sigla porti la riga. Se il nome e condiviso — sono sette
in Italia — non si ripiega e si resta senza osservazione.

**Conseguenze.**

- La segreteria sceglie il comune e il CAP compare, per il 99,2% dei comuni;
- il CAP non sovrascrive mai un valore digitato: stessa regola del codice
  fiscale (ADR-0032), e per la stessa ragione — il dato inserito a mano viene
  da un documento in mano all'operatore;
- il dataset e 134 kB e sta **sul server**, come quello dei comuni: viaggia su
  `/api/v1/comuni` insieme al comune, senza un secondo giro di rete;
- la direzione opposta — **si digita il CAP e si vorrebbe il comune** — resta
  aperta e non e chiusa da questo ADR. Con i soli CAP univoci si risolverebbe
  il paese e non la citta, cioe si sbaglierebbe proprio dove serve di piu;
- il file va rigenerato: IPA cambia ogni giorno, e
  `node scripts/build-cap-dataset.mjs --check` dice quando il repository si e
  allontanato dalla fonte.

**Stato:** ATTIVA. Supera ADR-0035.

## ADR-0043 — Sede e categoria non stanno nel modulo: le mette il server quando il modulo si apre

**Data:** 2026-08-26
**Contesto:** Blocco Finale B, chiusura di R-14 / B9-18.

Un atleta iscritto approvando una compilazione nasceva senza sede. Non si
rompeva niente — `null` significa «non dichiarata» e resta visibile a ogni
filtro (ADR-0038) — ma in un club multi-sede la segreteria doveva ricordarsi
di assegnarla a mano, per ogni iscrizione, tutti i settembre.

**La strada che sembrava ovvia, e perche non e stata presa.** Aggiungere al
modulo un menu a tendina «Sede» con le sedi scritte dentro. Le opzioni di un
campo a scelta stanno nella **versione pubblicata**, che e immutabile — e deve
esserlo, altrimenti le risposte gia arrivate citerebbero opzioni che il modulo
non offre piu. Ma le sedi non sono un'opinione di chi ha costruito il modulo:
sono anagrafica del club, e cambiano quando il club apre una palestra. Un
modulo di iscrizione pubblicato a settembre avrebbe proposto a marzo le sedi
di settembre, e nessuno ripubblica dodici moduli per una palestra nuova.

**La decisione.** Il catalogo dei dati dinamici puo dichiarare che le opzioni
di un campo hanno una **fonte**: `club_sites` o `club_categories`
(`DynamicFieldOptionsSource`). Il modulo dichiara *dove va la sede*; quali
sedi siano possibili lo dice il club, al momento in cui il modulo viene
aperto. `applyServerFieldOptions` riempie le opzioni, e passa dalla **stessa
funzione** tre volte: quando il modulo pubblico viene servito, quando la
compilazione interna viene aperta, e quando un invio viene validato.

**Perche questo e anche il controllo di sicurezza, e non ce n'e un secondo.**
Chi compila non manda un `site_id`. Manda il testo di un'opzione che il server
ha appena messo lui, e la validazione dei campi a scelta — quella che c'era
gia — rifiuta un testo fuori elenco. Un identificativo inventato, o la sede di
un altro club, non vengono respinti da un controllo aggiuntivo: non sono mai
stati un valore accettabile. All'approvazione il nome viene risolto in
identificativo contro le sedi **attive** del club proprietario del modulo, e
un nome che non risolve non diventa niente.

**Un club con una sede sola non vede la domanda.** Scegliere fra una
possibilita non e una scelta, ed e un errore di compilazione in piu per chi la
legge. Il campo esce dallo schema servito; all'approvazione la sede unica
viene assegnata lo stesso, perche il dato giusto da scrivere resta quello. Per
le categorie la soglia e una: un club con una categoria puo comunque volerla
scritta sul modulo, ed e la sola cosa che quel campo dichiara.

**Conseguenze.**

- `athlete.categoryName` smette di essere di sola lettura: approvare iscrive
  l'atleta alla categoria scelta e crea l'appartenenza con la sede;
- con la sola sede, l'approvazione aggiorna le appartenenze che **non ne
  dichiarano una**. Un'appartenenza gia collocata non si sposta: chi l'ha
  collocata ne sapeva piu di un modulo;
- la bozza e le versioni pubblicate **non** vengono riscritte. Le opzioni
  restano assenti li dentro: e il posto giusto, perche li dentro non c'erano
  mai state;
- l'anteprima del builder passa dalla stessa funzione, alimentata da
  `optionCatalog` che `GET /api/v1/forms/:id` restituisce accanto alla bozza.
  Un'anteprima con la tendina vuota dove il modulo pubblicato ne mostra una
  piena mentirebbe sull'unica cosa che l'anteprima esiste per dire;
- il modulo pubblico fa una lettura in piu del club. E deliberata: due
  percorsi di lettura sono due occasioni perche un giorno smettano di
  coincidere.

**Stato:** ATTIVA. Chiude R-14 e B9-18, e completa ADR-0038 dal lato dei
moduli.

## ADR-0044 — Un numero di documento appartiene a un club e a un esercizio, e si incrementa

**Data:** 2026-08-26
**Contesto:** Blocco Finale B, chiusura di D28.

`receipts.receipt_number` e `invoices.invoice_number` erano univoci su **tutta
la tabella**. Due societa che emettevano la loro prima ricevuta dell'anno
chiedevano entrambe `R-2026-0001`, e la seconda falliva per un motivo che non
aveva niente a che vedere con lei. La mitigazione in uso — riprovare con il
numero successivo, fino a venticinque volte — funzionava, e produceva
numerazioni con buchi appena due club emettevano nello stesso momento.

**La decisione, in due parti.**

*Il vincolo diventa composto:* `(organization_id, receipt_number)` e
`(organization_id, invoice_number)`. Alfa e Beta hanno entrambe la loro
ricevuta 1 del 2026, e devono averla. La conversione e sicura sul dato
esistente proprio perche il vincolo era globale: due club non hanno potuto
avere lo stesso numero.

*La sequenza diventa una riga con un contatore*
(`document_number_sequences`, chiave `(club, tipo, anno)`), e il numero si
**incrementa** invece di ricavarsi contando.

**Perche contare non era un'alternativa.** Due operatori della stessa societa
che incassano nello stesso secondo leggono lo stesso conteggio e chiedono lo
stesso numero: uno dei due incassi non si documenta, oppure due incassi
portano lo stesso numero. Non e un caso da laboratorio, e il sabato mattina di
una segreteria con due sportelli. E contare non e nemmeno corretto in
tranquillita: una ricevuta annullata farebbe riusare il suo numero.

**Come si evita la corsa.** L'incremento e `UPDATE ... SET last_number =
last_number + 1` in una sola istruzione, dentro una transazione. Postgres
blocca quella riga fino al commit: la seconda richiesta non legge un valore
vecchio, **aspetta**. Il valore assegnato si rilegge nella stessa transazione,
quindi si vede il proprio incremento e nessun altro. Un test presidia la
**forma** dell'istruzione — un doppio di Prisma non ha i lock di Postgres, e
fingere di provare la concorrenza sarebbe peggio che non provarla.

**L'unico punto in cui si riprova.** Se la riga della sequenza non esiste
ancora va creata, e due richieste possono provarci insieme: in Postgres un
errore di chiave duplicata annulla l'intera transazione e non si recupera da
dentro. Si riprova l'operazione intera, al massimo tre volte. La finestra e
larga quanto il primo documento di un club in un anno.

**Un buco e preferibile a un duplicato.** La sequenza conta cio che e stato
**assegnato**, non cio che esiste. Se la scrittura del documento fallisce dopo
l'assegnazione, quel numero resta consumato: un buco nella numerazione e
leggibile e spiegabile, lo stesso numero su due documenti no.

**Conseguenze.**

- la forma del numero (`R-2026-0001`, `FT-2026-0001`) sta in un modulo puro,
  `src/lib/documents/numbering.ts`, con la funzione che la rilegge — perche
  nei dati esistono numeri di fattura scritti a mano, che fino a oggi
  arrivavano dal client;
- la pagina Movimenti aveva una **seconda implementazione**: scriveva la riga
  della ricevuta dal browser e si calcolava il numero contando quelle
  scaricate in pagina, per giunta in una forma diversa (`R-2026-001`). Adesso
  passa dalla stessa rotta della scheda atleta. Un test impedisce che
  ricompaia;
- `resolveUpsertWhere` usa la chiave composta: con la sola colonna un upsert
  avrebbe potuto aggiornare la fattura di un'altra societa;
- **il numero di fattura lo digita ancora una persona** in `AddInvoiceForm`.
  Il vincolo per club lo rende innocuo fra societa diverse, ma la numerazione
  server-side delle fatture non e chiusa da questo ADR: serve prima il flusso
  di emissione del documento.

**Stato:** ATTIVA. Chiude D28.

## ADR-0045 — CediPay e il livello di prodotto, il PSP sta sotto e si sostituisce

**Data:** 2026-08-26
**Contesto:** Blocco Finale B, R-05. Gli endpoint dei pagamenti online
rispondevano 501 con un `TODO`, e l'interfaccia offriva comunque il pulsante.

Una funzione che l'interfaccia promette e il server rifiuta non e una funzione
a meta: e una promessa rotta **davanti a chi sta pagando**.

**La decisione, in una riga.**

    EasyGame → CediPay → Payment Provider

CediPay e il livello di **prodotto**: il nome che una societa legge, le regole
che EasyGame applica, la commissione che la piattaforma trattiene. Non e un
processore e non lo diventera: sotto c'e sempre un PSP.

**Perche il nome del PSP non entra nel dominio.** Se `stripe` comparisse
dentro le rate, le ricevute o le impostazioni del club, sostituirlo vorrebbe
dire riscrivere quei tre domini. Nel dominio esiste «un incasso online», il
suo stato e il suo riferimento esterno; il provider e un valore di
configurazione piu un adapter che implementa `CediPayProvider` — sette
operazioni: creare il negozio, attivarlo, leggerne lo stato, creare un
checkout, leggere un pagamento, rimborsare, interpretare un webhook.

**Il primo provider: Stripe, addebiti diretti.** La documentazione Stripe
indica l'addebito diretto come il modello delle piattaforme SaaS, ed e anche
quello giusto per come stanno le cose qui: chi paga sta pagando **la sua
societa sportiva**, non EasyGame. Sull'estratto conto della famiglia compare
il club, la pagina di pagamento porta il branding del club, e il denaro entra
sul saldo del club senza passare da un conto di Cedi.

Il modello alternativo — addebito indiretto, con il denaro che transita dalla
piattaforma — e quello dei marketplace. EasyGame non vende lo sport, lo
amministra: far transitare le quote da un conto Cedi cambierebbe la natura del
rapporto, e con essa gli obblighi.

**Le altre scelte Connect, e chi le deve confermare.**

| Scelta | Valore | Chi decide |
|--------|--------|-----------|
| Tipo di addebito | Diretto, `Stripe-Account` sulla richiesta | tecnica, presa |
| Commissione | `payment_intent_data[application_fee_amount]` | tecnica, presa |
| Attivazione del club | Flusso in hosting su Stripe (`account_links`) | tecnica, presa |
| Dashboard dell'account connesso | **Stripe completa** — ed e *immutabile* dopo la creazione | **decisione di prodotto** |
| Responsabilita dei saldi negativi | **Stripe** — che Stripe indica come impostazione migliore per una piattaforma SaaS nuova | **decisione di prodotto e legale** |
| Percentuale e quota fissa | Configurazione, mai codice | **accordo commerciale** |

Le tre righe in grassetto **non si chiudono scrivendo codice**: la prima e
irreversibile senza ricreare gli account, la seconda e un'assunzione di
rischio, la terza e un contratto. Sono scritte qui perche vanno decise, non
perche siano state decise.

**Perche non c'e la libreria `stripe`.** Le operazioni sono sette chiamate
HTTP con corpo `form-urlencoded`. L'SDK legherebbe l'astrazione
provider-agnostica alla forma degli oggetti di un provider — cioe farebbe
perdere esattamente cio per cui l'astrazione esiste. La parte in cui l'SDK
vale davvero e la verifica della firma, ed e implementata a parte, su
`node:crypto`, con diciassette test.

**La firma e la sola cosa collaudabile senza credenziali, ed e collaudata.**
L'endpoint del webhook e pubblico: senza verifica, «il pagamento e riuscito» e
una frase che puo scrivere chiunque conosca l'indirizzo, e un incasso mai
avvenuto entra in contabilita. Sono presidiati: solo lo schema `v1` (accettare
`v0` e un downgrade), confronto a tempo costante, tolleranza di cinque minuti
sul timestamp contro il replay, e **zero non e un valore ammesso** perche zero
disabilita il controllo.

**Cosa NON e collaudato, e va detto.** Tutto cio che parla con
`api.stripe.com`. In questo repository non ci sono credenziali Stripe e non se
ne inventano. Il codice e scritto sulla documentazione ufficiale consultata il
2026-08-26; finche non gira contro un account vero e **da collaudare**, non
funzionante. Il registro lo dichiara: `isConfigured()` distingue «non c'e
l'adapter» da «non ci sono le credenziali», e `describeCediPayReadiness`
distingue quattro blocchi diversi — nessun adapter, ambiente non configurato,
club che li ha disattivati, conto del club non ancora abilitato — perche li
risolvono quattro persone diverse.

**Conseguenze.**

- `paypal`, `postepay` e `mastercard` restano nelle impostazioni perche stanno
  gia nei dati dei club, e sono dichiarati **senza adapter**: il registro lo
  dice, invece di lasciarlo scoprire a chi preme «Paga»;
- `postepay` e `mastercard` non sono provider ma un metodo e un circuito: si
  raggiungono comunque attraverso un PSP. Restano per compatibilita del dato;
- un rimborso chiede indietro anche la commissione (`refund_application_fee`).
  Senza, la commissione resta alla piattaforma e a rimetterla e il club, che
  ha rimborsato tutto;
- ogni chiamata che crea qualcosa porta una chiave di idempotenza: un doppio
  clic o un tentativo dopo un timeout di rete non deve produrre due addebiti a
  una famiglia.

**Stato:** ATTIVA. Chiude la parte architetturale di R-05; la parte
collaudabile solo con credenziali resta aperta e dichiarata.

## ADR-0046 — Chi puo usare cosa si calcola in un posto solo, e la risposta dice sempre perche

**Data:** 2026-08-26
**Contesto:** Blocco Finale B, fondamenta SaaS (P-07).

Piano, servizi opzionali e stato dell'abbonamento esistevano gia come **dati**
(`subscriptionSettings`, `extraServices`, `HUB_EXTRA_SERVICE_DEFINITIONS`), ma
non esisteva niente che li trasformasse in una risposta. La domanda «questo
club ha i report avanzati?» non aveva un posto dove essere posta.

**Cosa succede se non lo si crea.** La domanda finisce scritta a mano in ogni
componente che mostra un report: un `plan === "plus"` qui, un
`extras.includes(...)` la, e dopo sei mesi nessuno sa piu quali schermate
controllano davvero qualcosa. Aggiungere un piano diventa un lavoro di
archeologia, e nel frattempo due schermate della stessa funzione danno due
risposte diverse.

**La decisione.** Un catalogo chiuso di funzioni (`EntitlementKey`) e una
funzione pura che le risolve. Chi la usa non conosce ne i piani ne i servizi:
conosce il nome della funzione.

**La risposta e sempre motivata, e non e un vezzo.** Non basta sapere che una
funzione e spenta: chi la vede spenta deve capire **cosa fare**. Passare a un
piano superiore, attivare un servizio, rinnovare un abbonamento scaduto, o
chiedere a Cedi sono quattro strade diverse, percorse da persone diverse. Una
funzione che restituisse solo `false` costringerebbe ogni schermata a
reinventarsi il messaggio — ed e cosi che nascono dieci spiegazioni diverse
della stessa cosa.

**L'ordine dei controlli e la regola.** Eccezione della piattaforma (in
entrambe le direzioni), poi amministratore di piattaforma, poi piano che vale,
poi servizio attivo. L'eccezione vince anche sull'amministratore, perche
esiste apposta per i casi che il listino non prevede.

**Tre scelte che sembrano dettagli.**

- *Le funzioni gia in produzione stanno in `free`.* Multi-sede, moduli,
  contributi e scanner sono in uso presso club veri da prima che esistesse un
  piano. Metterli in `plus` non sarebbe una scelta di listino: sarebbe
  **toglierli a chi li usa**, e non e una decisione che si prende scrivendo un
  file di configurazione;
- *`past_due` continua a pagare.* Un pagamento in ritardo non e una disdetta.
  Spegnere il gestionale di una societa il giorno in cui una carta scade e un
  modo per perdere il cliente invece dell'insoluto;
- *un abbonamento scaduto riporta a `free`, non spegne tutto.* Toglie cio per
  cui il club non sta piu pagando, non il gestionale.

**Il platform admin vede tutto, e si vede che lo sta facendo.** Chi assiste
deve poter aprire qualunque schermata di qualunque club. Ma la ragione resta
scritta (`platform_admin`), cosi l'interfaccia puo dire «stai vedendo una
funzione che questo club non ha» invece di far credere che il club ce l'abbia
— che e il modo piu rapido per chiudere una segnalazione sbagliando.

**Il limite dichiarato, e va letto prima di gating qualunque cosa.** Piano e
servizi attivi stanno in `clubs.settings`, e la pagina Organizzazione permette
al **club** di modificarli. Finche gli entitlement **descrivono** — la console
li mostra, l'interfaccia puo spiegare cosa manca — non e un problema. Il
giorno in cui cominciano a **negare** l'accesso, un club potra concedersi il
piano superiore da solo. Il piano deve prima passare sotto il controllo della
piattaforma: vedi D37. Le **eccezioni** nascono gia governate — le scrive solo
`POST /api/v1/entitlements`, riservato a platform_admin.

**Perche non e un ERP.** La console mostra piano, servizi, funzioni e stato
degli incassi online, e permette di concedere o revocare. Non ci sono fatture
verso Cedi, non c'e un listino modificabile, non c'e la contabilita della
piattaforma: serve a rispondere al telefono e a sbloccare un cliente.

**Stato:** ATTIVA. Il limite qui sopra e stato rimosso dal Blocco Finale C:
[ADR-0048](#adr-0048--il-piano-di-una-societa-appartiene-alla-piattaforma-non-alla-societa)
ha portato piano e servizi sotto il controllo della piattaforma, e da allora
questo strato **nega** su tre scritture.

## ADR-0047 — Un pagamento non e un documento: ricevuta e fattura si scelgono

**Data:** 2026-08-26
**Contesto:** Blocco Finale B, chiusura di D36.

Il numero di fattura lo digitava l'operatore in `AddInvoiceForm` e arrivava al
server dentro il corpo della richiesta. Dentro la stessa societa nulla
impediva di ripetere un numero, di saltarne uno o di scriverlo in una forma
che poi nessuno rileggeva.

**La distinzione che regge tutto il resto.** Un pagamento e un fatto: del
denaro e arrivato. Un documento e una **scelta**: ricevuta *oppure* fattura,
emessa a partire da quel fatto. Non sono la stessa cosa e non lo diventano per
comodita — la maggior parte delle ASD non emette fatture affatto, e
trasformare ogni incasso in fattura sarebbe sbagliato per quasi tutte.

**Due registri, non uno.** `R-2026-0001` e `FT-2026-0001` sono numerazioni
distinte, per club e per esercizio, entrambe assegnate da
`allocateDocumentNumber` ([ADR-0044](#adr-0044--un-numero-di-documento-appartiene-a-un-club-e-a-un-esercizio-e-si-incrementa)).
La prima fattura di una societa e la numero 1 anche se quella societa ha gia
emesso trenta ricevute.

**L'intestatario non e l'atleta, quasi mai.** Un minorenne non ha una
posizione fiscale: la quota la paga un genitore, e la detrazione per attivita
sportiva la chiede **quel** genitore, con il suo codice fiscale. Una fattura
intestata al bambino e corretta in tutto tranne che nell'unica cosa per cui
serve. `resolveFiscalRecipient` sceglie in quest'ordine: il tutore che il club
ha indicato come intestatario, il primo tutore con un codice fiscale,
l'atleta — che e il caso giusto quando l'atleta e maggiorenne.

**Perche una fattura senza codice fiscale si rifiuta e una ricevuta no.** Una
ricevuta senza codice fiscale resta una ricevuta valida, e rifiutarsi di
emetterla vorrebbe dire non documentare un incasso avvenuto. Una fattura senza
intestatario fiscale non e un documento: si rifiuta, e il messaggio dice le
due strade — completare l'anagrafica, oppure emettere una ricevuta.

**Cosa NON c'e, e non va lasciato credere che ci sia.** La trasmissione allo
SdI. `is_electronic` resta `false` **per costruzione**: EasyGame produce e
numera il documento, non lo trasmette. La fattura elettronica passa da un
intermediario accreditato, che e un servizio esterno con un contratto e delle
credenziali, e in questo repository non esiste. Dichiarare elettronica una
fattura che nessuno ha trasmesso significherebbe far credere a una societa di
aver adempiuto — che e il modo peggiore in cui questo software potrebbe
sbagliare.

**Quando servira, l'astrazione e gia disegnata altrove.** Il canale di
trasmissione va modellato come e stato modellato il PSV dei pagamenti
([ADR-0045](#adr-0045--cedipay-e-il-livello-di-prodotto-il-psp-sta-sotto-e-si-sostituisce)):
un contratto con le operazioni che servono, un adapter per l'intermediario
scelto, e il nome dell'intermediario che non compare nel dominio. La scelta
dell'intermediario e una decisione commerciale, non tecnica.

**Conseguenze.**

- `POST /api/v1/payment-transactions/:id` accetta una terza azione,
  `issue-invoice`, accanto a `reverse` e `issue-receipt`. E idempotente come
  la ricevuta: chiederla due volte restituisce quella gia emessa invece di
  consumare un numero;
- l'elenco degli incassi mostra due pulsanti, «Ricevuta» e «Fattura», perche
  la scelta e di chi emette;
- `AddInvoiceForm` resta dov'e per le fatture non collegate a un incasso, e
  con essa resta il numero digitato a mano: D36 e chiuso per il percorso che
  parte da un incasso, che e quello che genera il volume.

**Stato:** ATTIVA.

---

## ADR-0048 — Il piano di una societa appartiene alla piattaforma, non alla societa

**Data:** 2026-08-26
**Stato:** ATTIVA
**Contesto:** Blocco Finale C, chiude [D37](16-technical-debt.md) e R-18

**Il problema.** Piano, stato dell'abbonamento e servizi aggiuntivi stavano in
`clubs.settings`, e `clubs.settings` si scrive dalla pagina Organizzazione:
c'era una tendina «Piano: Free / Plus» dentro il gestionale della societa.
Finche quello strato **descriveva** non era sfruttabile — nessuna schermata
veniva negata da li — ma [ADR-0046](#adr-0046--chi-puo-usare-cosa-si-calcola-in-un-posto-solo-e-la-risposta-dice-sempre-perche)
lo ha reso l'ingresso del calcolo degli entitlement. Il gating vero non e mai
stato acceso per questa ragione sola: il giorno in cui una funzione viene
negata, un club si concede il piano superiore da solo.

**La decisione.** Quattro chiavi di `clubs.settings` — `subscription`,
`subscriptionSettings`, `extraServices`, `entitlements` — diventano di
proprieta della piattaforma. Si scrivono solo da `setClubPlan`,
`setClubExtraService` e `setClubEntitlementOverride`, cioe da
`POST /api/v1/entitlements` con ruolo `platform_admin`. La societa le legge e
basta.

**Perche la guardia sta nella scrittura e non nell'interfaccia.** Togliere la
tendina non protegge niente: la pagina Organizzazione rimanda l'intero blocco
delle impostazioni a `PATCH /api/v1/clubs/:id`, e la stessa richiesta la puo
rifare a mano chiunque sappia aprire la console del browser. La regola vive in
`withPlatformOwnedSettings`, che e una funzione pura chiamata dentro
`resources.ts` sia in creazione sia in modifica. Anche la creazione: un club
che nascesse con `plan: "plus"` avrebbe aggirato un controllo messo solo sulla
modifica.

**Perche ignora invece di rifiutare.** Il salvataggio di un recapito manda
anche il piano, perche quella pagina manda tutto. Rispondere «Accesso negato»
al salvataggio di un numero di telefono renderebbe la pagina inutilizzabile
per un campo che nessuno stava cercando di cambiare. Il valore che arriva
dalla societa viene quindi **sostituito** con quello che c'e; se era
**diverso** — cioe se era un tentativo vero — resta una riga di audit con
esito `denied`.

**Il difetto trovato mentre si chiudeva questo.** Il calcolo leggeva
`settings.subscriptionSettings`; la pagina Organizzazione scriveva
`settings.subscription`. **Nessun club aveva quindi il piano che credeva di
avere**: il calcolo partiva sempre dai valori predefiniti, e una societa messa
in Plus restava trattata come Free. Il test che avrebbe dovuto accorgersene
seminava a sua volta `subscriptionSettings`, cioe provava la stessa cosa
sbagliata. La scelta della chiave sta ora in `readSubscriptionSettingsSource`,
un posto solo, e la chiave storica resta leggibile.

**Il gating che si e potuto accendere di conseguenza.** Tre punti, e non di
piu: `POST /api/payments/create-checkout-session` (`online_payments`),
`POST /api/v1/funding/programs` (`funding_programs`), `POST /api/v1/forms`
(`forms_v2`). La **lettura** non e mai negata: disattivare un servizio non
deve nascondere a una societa le compilazioni che ha gia ricevuto o i
contributi che ha gia maturato. Nell'interfaccia, `CapabilityGate` mostra il
motivo invece di far sparire la schermata — «Disponibile con il piano Plus» e
«L'abbonamento non e in corso» portano a fare due cose diverse, e un `403`
generico le farebbe finire entrambe al telefono.

**Cosa NON e stato fatto.** Nessun listino, nessuna fatturazione verso Cedi,
nessuna scadenza automatica. La console di piattaforma assegna il piano e
attiva i servizi; il resto e commerciale e non sta in questo repository.

**Conseguenze.**

- la scheda «Account e Fatturazione» della pagina Organizzazione e in **sola
  lettura**, con scritto che i valori li gestisce Cedi;
- `ResourceRequestOptions` porta `isPlatformAdmin`, ricavato **sempre** dalla
  sessione nel route handler;
- tre azioni nuove nell'audit: `platform.club_plan.changed`,
  `platform.club_service.changed`, `platform.entitlement.overridden`;
- un test statico impedisce a qualunque file fuori dai moduli degli
  entitlement di scrivere `plan === "plus"`.

## ADR-0049 — CediPay non e un prodotto della V1: sotto c'e Stripe, e si chiama Stripe

**Data:** 2026-08-26
**Stato:** ATTIVA
**Contesto:** Blocco D. Supera la parte **di prodotto** di
[ADR-0045](#adr-0045--cedipay-e-il-livello-di-prodotto-il-psp-sta-sotto-e-si-sostituisce);
l'astrazione tecnica che quell'ADR ha introdotto resta.

**Il problema.** ADR-0045 aveva creato un livello di prodotto fra EasyGame e il
PSP: «CediPay (Stripe)» era il nome che una societa leggeva nelle proprie
impostazioni. Un marchio che sta in mezzo a un incasso deve pero poter
rispondere a tre domande — **chi incassa**, **chi risponde di un rimborso**,
**chi compare sull'estratto conto della famiglia** — e nella V1 la risposta a
tutte e tre e «il club, tramite Stripe». Il nome prometteva quindi un soggetto
che non esiste, e prometterlo a chi paga e peggio che non nominarlo affatto.

**La decisione.** Nella V1 non esiste un prodotto chiamato CediPay. Cio che una
societa legge e il nome del PSP. L'**astrazione** provider-agnostica resta ed e
la parte che valeva la pena tenere: e cio che rende sostituibile il PSP senza
riscrivere rate, ricevute e impostazioni.

- `src/lib/payments/cedipay/` diventa `src/lib/payments/gateway/`;
- `src/lib/server/cedipay.ts` diventa `src/lib/server/payment-gateway.ts`;
- `CediPay*` diventa `PaymentGateway*` / `Gateway*`;
- l'etichetta «CediPay (Stripe)» diventa «Stripe»;
- il webhook scrive `source: "STRIPE"`.

**Perche `CEDIPAY` resta nel vocabolario degli incassi.** Perche esistono righe
gia scritte con quel valore, e riscriverle sarebbe modificare denaro registrato
— la cosa che tutto il registro incassi esiste per non fare. Il valore resta
**leggibile** e non si scrive piu.

**Conseguenze.**

- un test invariante vieta il marchio CediPay nelle etichette dei gateway;
- se un giorno CediPay diventera un prodotto vero, questa ADR va superata da
  una nuova che dica chi e il soggetto e cosa risponde.

---

## ADR-0050 — Una condizione commerciale ha una decorrenza, e la commissione si congela sull'incasso

**Data:** 2026-08-26
**Stato:** ATTIVA
**Contesto:** Blocco D. Estende la proprieta di piattaforma di
[ADR-0048](#adr-0048--il-piano-di-una-societa-appartiene-alla-piattaforma-non-alla-societa)
ai dati commerciali dei pagamenti.

**Il problema, in due parti.** La percentuale di EasyGame viveva in
`clubs.settings.paymentSettings.platformFeePercent`. Quel campo lo scrive la
pagina Organizzazione, e la guardia di ADR-0048 copriva `subscription`,
`subscriptionSettings`, `extraServices` ed `entitlements` — non
`paymentSettings`. Quindi:

1. **una societa poteva azzerarsi la commissione**, e non serviva nemmeno la
   console del browser: il campo era nella pagina;
2. **non esisteva traccia di quale percentuale valesse il giorno di un
   incasso**. Passare dall'1% all'1,5% riscriveva la lettura del passato,
   perche il passato veniva riletto con il valore corrente.

**La decisione, in due difese.**

*La prima:* le condizioni commerciali stanno in `platform_commission_rules`, e
**non si sovrascrivono**. Cambiare la percentuale significa aggiungere una riga
con una `effective_from`. `organization_id` nullo e la condizione standard di
EasyGame; valorizzato, e l'override di un club. Il passato resta leggibile
perche le righe vecchie non spariscono.

*La seconda:* la commissione effettivamente applicata viene **scritta sulla
riga dell'incasso** — `platform_fee_cents`, `net_amount_cents`,
`applied_fee_percent`, `commission_rule_id` — e non si ricalcola mai piu.

**Perche servono entrambe, e non e ridondanza.** Rispondono a due domande
diverse. La prima spiega *perche* quel numero: si puo ricostruire quale
condizione era in vigore, da quando, e con quale motivazione. La seconda
garantisce che *quel* numero non cambi: una regola scritta con decorrenza
retroattiva — cosa legittima, si fa per correggere un errore — cambierebbe il
risultato della risoluzione su incassi gia avvenuti.

**Il criterio di spareggio, e perche non e nella data.** Due condizioni con la
stessa decorrenza succedono davvero: riportare un club allo standard scrive una
regola «da adesso» mentre quella da sostituire porta lo stesso istante. Il
primo tentativo — spostare la nuova un millisecondo avanti — la rendeva
tecnicamente **futura**, e su un orologio a bassa risoluzione non entrava in
vigore affatto. Il criterio e quindi esplicito e fuori dalla data: decorrenza
piu recente, poi scrittura piu recente, poi override del club sulla condizione
generale, poi l'ultima incontrata — con `loadCommissionRules` che restituisce
le righe in ordine crescente perche quell'«ultima» sia definita.

**Cosa il club continua a governare.** L'interruttore
`paymentSettings.enabled`: sospendere gli incassi online durante la chiusura
estiva e una scelta operativa della segreteria, e toglierla sarebbe stato un
danno senza un motivo. La guardia lavora quindi **campo per campo** dentro
`paymentSettings`, non sull'intera chiave.

**Storno e rimborso non sono la stessa operazione.** Lo storno dice «questo
incasso non e mai avvenuto» — correzione di un errore di registrazione — e
toglie dai totali entrambe le righe. Il rimborso dice l'opposto: l'incasso e
avvenuto, e poi del denaro e tornato indietro. Restano due movimenti che
**contano entrambi**, ed e anche l'unico modo di rappresentare un rimborso
parziale: con la meccanica dello storno, restituire 30 € su 130 avrebbe dovuto
annullare l'incasso intero e registrarne uno nuovo da 100, e la famiglia non
avrebbe piu trovato traccia dei 130 versati.

**Conseguenze.**

- `PLATFORM_OWNED_PAYMENT_FIELDS` e `PLATFORM_OWNED_PROVIDER_FIELDS` elencano
  cosa un club non scrive; un tentativo lascia una riga di audit `denied` con
  il **percorso** del campo, non solo la chiave;
- la commissione restituita da un rimborso e **proporzionale a quella
  trattenuta**, non ricalcolata sulla condizione di oggi;
- `DEFAULT_PLATFORM_FEE_PERCENT` scende da 2,5 a 1 e smette di essere il
  listino: e solo il valore di riserva quando nessuna condizione e stata ancora
  scritta.

---

## ADR-0051 — Due flussi Stripe, due account, due segreti: il denaro delle famiglie non e il fatturato di EasyGame

**Data:** 2026-08-26
**Stato:** ATTIVA
**Contesto:** Blocco D

**Il problema.** EasyGame deve incassare due denari diversi. La quota che una
**famiglia** paga appartiene economicamente al **club**; la quota che una
**societa** paga per usare EasyGame appartiene a **Cedi Soft**. Prima del
Blocco D esisteva solo il primo, a meta, e il secondo era un campo descrittivo
che nessuno scriveva.

**La decisione: due flussi separati fino in fondo.**

*Flusso B — atleta/genitore verso il club.* Addebiti **diretti** su account
connessi Stripe (`Stripe-Account` sulla richiesta), con la commissione della
piattaforma in `application_fee_amount`. Chi paga sta pagando **la sua societa
sportiva**, non EasyGame: sull'estratto conto della famiglia compare il club, e
il denaro entra sul saldo del club senza passare da un conto di Cedi. Un
marketplace avrebbe scelto l'addebito indiretto; un gestionale no — EasyGame non
vende lo sport, lo amministra.

*Flusso A — club verso Cedi Soft.* Abbonamenti sull'account **centrale** di Cedi
Soft, senza `Stripe-Account`. Vive in `platform_billing_accounts` e non tocca
**mai** `payment_transactions`: un abbonamento che comparisse nel registro
incassi di un club sarebbe un errore contabile che nessuno cercherebbe li.

**Perche due endpoint webhook e non uno.** Perche sono due account con **due
segreti di firma diversi**. Un endpoint solo avrebbe dovuto provare entrambi i
segreti su ogni richiesta, e quando una firma si verifica «con uno dei due» non
si sa piu quale flusso ha parlato. `POST /api/payments/webhook` ascolta Connect,
`POST /api/billing/webhook` ascolta la piattaforma, e ognuno rifiuta gli eventi
dell'altro dicendolo.

**L'account connesso esce da `clubs.settings`.** Finche l'identificativo stava
in un campo scrivibile dalla pagina Organizzazione — con accanto un menu a
tendina per dichiararsi «attivo» — una societa poteva incollarci l'account di
chiunque: gli incassi delle famiglie sarebbero finiti su un conto scelto dal
club, con EasyGame a fare da tramite. `club_payment_accounts` lo scrivono due
sole cose: la console di piattaforma e un evento `account.updated` la cui firma
e stata verificata.

**Perche EasyGame non raccoglie i dati KYC.** Perche non e un intermediario
finanziario e non deve diventarlo. Chiedere documento e dati del rappresentante
legale dentro un gestionale sportivo significherebbe custodire dati di identita
che il PSP e attrezzato a custodire e noi no. Si genera un **link di
onboarding** — che scade, perche un indirizzo di attivazione riutilizzabile e a
tutti gli effetti una credenziale — e li dentro ci va chi ha titolo.

**L'account connesso vince sui metadati.** I metadati di un pagamento li puo
scrivere chiunque sappia creare un pagamento su un account connesso;
`event.account` lo scrive Stripe. Quando divergono l'evento **non** viene
assecondato. E quando `event.account` cita un account che non risulta collegato
a nessuna societa, l'evento viene ignorato invece di ripiegare sui metadati: era
il buco piu grande rimasto, perche avrebbe permesso a chi puo generare un evento
sul proprio account Connect di citare la rata di un'altra societa.

**Le decisioni che restano da prendere, e che questo ADR non prende.**

1. **Tipo di account Connect: `standard` o `express`.** E **irreversibile per
   account gia creato**. Il valore predefinito e `standard` — la societa ha un
   proprio cruscotto Stripe e un rapporto diretto con il PSP — ed e
   configurabile in Platform Admin *prima* del primo collegamento reale. Con
   `express` la piattaforma governa di piu e assume piu responsabilita di
   assistenza.
2. **Chi risponde dei saldi negativi** dopo un rimborso su un account con saldo
   insufficiente.
3. La percentuale del listino, che ha un posto dove essere scritta ma non un
   valore deciso.

**Conseguenze.**

- `payment_webhook_events` porta `flow` (`connect` | `platform`) e
  `external_account_id`;
- la variabile `STRIPE_BILLING_WEBHOOK_SECRET` e distinta da
  `STRIPE_WEBHOOK_SECRET`: riusare la stessa renderebbe impossibile ruotarne una
  sola;
- gli stati dell'account connesso sono **sette**, e ognuno dice **chi** deve
  muoversi.

---

## ADR-0052 — La sigla non decide il trattamento fiscale: il profilo si dichiara, il documento si propone

**Data:** 2026-08-26
**Stato:** ATTIVA
**Contesto:** Blocco D. Estende
[ADR-0047](#adr-0047--un-pagamento-non-e-un-documento-ricevuta-e-fattura-si-scelgono).

**Il problema.** EasyGame trattava implicitamente ogni cliente come una ASD, e
il profilo fiscale era un pugno di colonne su `clubs` — `vat_number`,
`sdi_code`, `tax_regime` — senza forma giuridica ne regime strutturato. Due
conseguenze: una SSD a r.l. non aveva dove dichiarare i propri dati REA, e
nessuna schermata poteva sapere cosa una societa fosse davanti al fisco.

**La tentazione da cui questo ADR difende.** Dedurre il trattamento dalla sigla
— «e una ASD, quindi ricevuta senza IVA» — e la cosa piu naturale e piu dannosa
che un gestionale sportivo possa fare. Due ASD possono avere trattamenti
diversi: una in regime forfettario della L. 398/1991 e una no, una con partita
IVA per l'attivita commerciale e una senza. Un software che indovina produce
documenti sbagliati **con l'aria di essere giusti**, e chi li riceve non ha
motivo di dubitarne.

**La decisione, in tre pezzi.**

1. **Il profilo fiscale e un'entita a se** (`organization_fiscal_profiles`),
   separata dall'anagrafica. L'anagrafica risponde a «come si chiama e dove la
   trovo»; il profilo a «che soggetto e davanti al fisco». Cambiano in momenti
   diversi. La forma giuridica si **registra**; cio che comporta lo dicono il
   regime, la partita IVA e la classificazione delle operazioni, tutti
   dichiarati.
2. **Le operazioni si classificano** (`fiscal_operation_types`), e la
   classificazione e **configurazione**. EasyGame semina un catalogo iniziale di
   nove voci — quota associativa, iscrizione, tesseramento, corso, vendita,
   sponsorizzazione, contributo, altro — con i valori piu conservativi
   possibili: nessuna aliquota, nessuna natura IVA, nessuna esenzione. Il giorno
   in cui un commercialista li configura, li configura lui.
3. **Il motore fiscale propone.** Da profilo + tipo di operazione +
   configurazione esce una *proposta* con la sua motivazione, non una decisione.
   Da «non so cosa sia questo incasso» non segue «non si puo fatturare»: si
   propone la ricevuta — il documento che non afferma nulla di piu di quel che si
   sa — e si dichiara che manca la classificazione.

**Lo snapshot, e il difetto silenzioso che chiude.** Una ricevuta si ristampava
leggendo l'anagrafica **di oggi**. Bastava che una famiglia traslocasse, o che
qualcuno correggesse un codice fiscale digitato male, perche la ricevuta gia
consegnata mesi prima diventasse un documento **diverso** da quello che quella
famiglia aveva in mano: due documenti con lo stesso numero. Al momento
dell'emissione si scrive ora una fotografia completa — emittente, intestatario,
importi, causale, riferimenti — e la ristampa legge solo quella.

**L'immutabilita e un elenco, non un divieto totale.** Alcune cose su un
documento emesso si devono poter cambiare: l'allegato rigenerato, un riferimento
interno, la marcatura di annullamento. Cio che non si tocca e **cio che qualcuno
ha in mano su carta**: numero, serie, data, importo, intestatario. Un elenco
esplicito si legge e si prova; «e immutabile» sparso nel codice no.

**Conseguenze.**

- l'emissione dei documenti esce da `payment-transactions.ts` e passa a
  `fiscal-documents.ts`: un pagamento e un documento sono due domini con
  cardinalita diverse — un incasso puo non produrre documenti, un documento puo
  coprire piu incassi;
- la numerazione appartiene a un club, a una **serie** e a un esercizio: il
  vincolo di ADR-0044 si allarga, e la serie vuota — quella in cui e stato
  emesso tutto fino a oggi — resta il caso predefinito;
- annullare non libera il numero: un buco e leggibile e spiegabile, lo stesso
  numero su due documenti no;
- l'imposta di bollo e configurazione — soglia e importo cambiano per legge, e
  una costante nel codice significherebbe un rilascio del software per una
  modifica normativa — e nasce **spenta**.

---

## ADR-0053 — EasyGame prepara il tracciato FatturaPA; non lo trasmette, e non lo dichiara trasmesso

**Data:** 2026-08-26
**Stato:** ATTIVA
**Contesto:** Blocco D. Sostituisce lo stato `DEFERRED_POST_V1` di E-9 con un
dominio implementato e una trasmissione dichiaratamente non attiva.

**Il problema.** La fatturazione elettronica non e una chiamata HTTP a un
indirizzo pubblico: richiede un intermediario accreditato, un canale, una firma
e un contratto. Scegliere quell'intermediario e una decisione commerciale di
Cedi Soft che non appartiene a chi scrive il codice — ma il momento in cui la si
prende non deve essere il momento in cui si scopre che mezza applicazione parla
direttamente con un fornitore.

**La decisione.** Il dominio si implementa per intero **tranne** la
trasmissione. EasyGame:

- costruisce il tracciato `FatturaElettronica` versione `FPR12` a partire dallo
  **snapshot** del documento, non dall'anagrafica di oggi;
- lo valida formalmente — campi obbligatori, lunghezze, natura IVA obbligatoria
  quando l'aliquota e zero, che e lo scarto piu comune dello SdI;
- lo conserva in `einvoice_transmissions`, separato dalla fattura;
- si ferma a `ready_to_send`.

**Perche la trasmissione e un oggetto separato dalla fattura.** Una fattura
esiste, e valida ed e numerata anche se non e mai stata trasmessa; una
trasmissione puo fallire, essere scartata e ripetuta senza che la fattura cambi.
Tenere lo stato di trasmissione dentro la fattura vorrebbe dire che «scartata
dallo SdI» diventa uno stato del documento — e non lo e.

**Perche il registro degli adapter e vuoto per costruzione.** Un adapter finto
che risponde «trasmessa» e **peggio** di nessun adapter: produce esattamente lo
stato che non si deve poter raggiungere, e lo produce in modo indistinguibile da
quello vero. `canTransition` rifiuta ogni stato che presupponga un invio finche
`providerConfigured` e falso, e quel parametro **non ha un valore predefinito**:
chi chiama deve dirlo esplicitamente, perche un default `true` sarebbe la porta
da cui la trasmissione finta rientrerebbe.

**La riserva che va detta apertamente.** Il tracciato e scritto sulla specifica
pubblica e **non e mai stato accettato dallo SdI**, perche non esiste un canale
verso lo SdI in questo repository. Va considerato *da collaudare*, non
funzionante. Il primo invio reale trovera differenze: e normale, ed e un'altra
ragione per cui lo stato non puo superare `ready_to_send`.

**Cosa serve per accendere la trasmissione.** Tre cose, e nient'altro cambia: un
file sotto `src/lib/fiscal/fatturapa/providers/`, una riga nel registro degli
adapter, e la configurazione in Platform Admin.

**Conseguenze.**

- `invoices.is_electronic` resta `false` **per costruzione**;
- `POST /api/v1/einvoice/:invoiceId` con `action: "transmit"` risponde `503` con
  il motivo, invece di non esistere: se l'azione non ci fosse, chi legge l'API
  concluderebbe che manca da implementare;
- la sezione «Fiscalita» della console di piattaforma dice a chiare lettere che
  l'invio elettronico non e configurato, ed elenca cosa EasyGame fa davvero.

---

## ADR-0054 — Il massimale del bando non e l'importo assegnato al club, e una presenza non e sempre una prova

**Data:** 2026-08-26
**Stato:** ATTIVA
**Contesto:** Blocco D2. Completa il modello economico di
[ADR-0037](#adr-0037--un-contributo-non-e-un-pagamento-due-contabilita-separate-e-le-regole-del-bando-sono-dati),
che aveva reso configurabili le regole di un bando ma teneva ancora due
concetti distinti dentro un numero solo, e una previsione dentro un credito.

**Il primo problema: un campo per due cose.** Un voucher regionale riconosce
fino a 500 EUR a Mario. Mario decide di usarne 300 presso questa societa e il
resto altrove — un'altra ASD, un centro estivo, una piscina. EasyGame non sa
dove finiscano gli altri 200 e **non deve comportarsi come se li avesse**.
Finora `athlete_plafond` era usato per entrambe le domande: quanto il bando
riconosce, e quanto questo club puo far maturare. Con quell'ambiguita il club
vede 500 in carico, matura oltre i 300, e li rendiconta a un ente che ne
riconoscera 300.

**La decisione, prima parte.** Due valori, con due nomi e due posti:

| Valore | Dove vive | Cosa risponde |
|---|---|---|
| **Massimale del programma** | `funding_programs.athlete_plafond` | fin dove arriva il bando |
| **Importo assegnato al club** | `funding_enrollments.assigned_amount` | quanto questo club ha in carico |

Il massimale **valida** l'assegnato e non lo sostituisce: `validateAssignedAmount`
rifiuta un assegnato maggiore del massimale, e senza indicazione esplicita
l'assegnato coincide con il massimale — che resta il caso piu comune. Il tetto
della maturazione, del ricalcolo e di ogni conferma e **sempre** l'assegnato.

**Il secondo problema: la presenza come prova universale.** Su molti bandi la
frequenza ufficiale non si registra in EasyGame: si registra su una piattaforma
dell'ente, e l'appello del club e al massimo un'indicazione. Farlo maturare vuol
dire dichiarare all'ente un credito che l'ente non ha riconosciuto — e
accorgersene alla liquidazione, quando le due cifre non coincidono.

**La decisione, seconda parte.** La fonte della maturazione diventa
**configurazione**, come tutto il resto del bando:

- `easygame_attendance` — l'appello di EasyGame **e** la fonte: il periodo
  matura da solo al raggiungimento del requisito. E il comportamento
  precedente, ed e il default: nessun programma esistente cambia;
- `external_confirmation` — la fonte e altrove: EasyGame calcola la
  **previsione** e aspetta una conferma esplicita;
- `external_import` — come sopra, con le conferme che arrivano da un file;
- `external_api` — dichiarato nel modello e **non selezionabile**. Nessun ente
  espone oggi una API che EasyGame possa chiamare, e un adapter finto sarebbe
  peggio di nessun adapter: la validazione lo rifiuta.

**Previsione e maturato sono due numeri, non due letture dello stesso.**
`funding_accruals.estimated_amount` porta quanto il periodo varrebbe secondo
l'appello del club; `accrued_amount` resta a zero finche non arriva una
conferma, e lo stato `pending_confirmation` lo dice a chiare lettere. Un
periodo in attesa **non** e un periodo perso: nel riepilogo si conta a parte,
perche «l'atleta non ha frequentato abbastanza» e «l'ente non ha ancora
risposto» sono due problemi diversi con due rimedi diversi.

**Perche la conferma e un atto e non un campo.** Quel numero finira in una
rendicontazione, e qualcuno dovra poter dire da dove viene. La conferma
registra periodo, importo, data, utente, riferimento esterno e nota; una
correzione successiva sovrascrive l'importo e conserva il precedente in
`data.previousConfirmations`. Tre limiti non sono negoziabili:

1. non si conferma su un programma a fonte EasyGame — li il maturato si
   ricalcola, e digitarlo riaprirebbe la porta all'importo inventato;
2. la somma dei confermati non supera l'**importo assegnato al club**;
3. un periodo gia liquidato non si tocca: l'ente ha versato su quel numero.

**Perche un ricalcolo non riscrive una conferma.** Il ricalcolo legge le
presenze; la conferma dichiara cio che una fonte esterna ha riconosciuto. Se il
primo potesse sovrascrivere la seconda, il numero comunicato all'ente
cambierebbe da solo ogni volta che qualcuno corregge un appello. Il ricalcolo
aggiorna la previsione **attorno** alla conferma e ne lascia l'importo dov'e.

**Perche l'import e un parser di cinque colonne e non un'integrazione.** Le
conferme arrivano in blocco — un prospetto con un periodo e un importo per riga
— e confermarne duecento a mano vuol dire non confermarne nessuna. Il tracciato
e lo stesso della riconciliazione in uscita (punto e virgola, virgola
decimale), cosi il file che il club esporta ha la forma di quello che rimanda
indietro. Nessuna riga sparisce in silenzio: cio che non si legge e cio che non
trova il suo periodo torna indietro elencato con il numero di riga.

**Conseguenze.**

- `POST /api/v1/funding/accruals` accetta due azioni nuove, `confirm` e
  `import`, che scrivono la stessa cosa e si distinguono per provenienza
  (`funding_accruals.accrual_origin`);
- `markAccrualsReported` rifiuta un periodo `pending_confirmation` con un
  messaggio che dice cosa fare: una previsione non si rendiconta;
- la scheda economica dell'atleta mostra **sei** importi in sequenza —
  massimale programma, assegnato al club, maturato, rendicontato, liquidato,
  residuo — piu la previsione quando la fonte e esterna;
- il dettaglio periodo per periodo smette di essere una tabella a otto colonne
  e diventa una riga che si apre: otto colonne a 375 px non si leggono.

**Cosa **non** cambia.** La separazione fra contributi e pagamenti della
famiglia resta quella di ADR-0037: nessuna conferma, nessuna liquidazione e
nessun maturato crea una `payment_transaction`. Liquidato resta l'unico dei sei
importi che sia cassa.

---

## ADR-0055 — Configurazione si sceglie per categoria, operazione si sceglie per gruppo

**Data:** 2026-08-26
**Stato:** ATTIVA
**Contesto:** Blocco D2. Completa
[ADR-0038](#adr-0038--la-sede-e-un-concetto-separato-dalla-categoria-e-il-gruppo-operativo-e-la-loro-coppia),
che aveva introdotto sedi e gruppi operativi come **modello** e li aveva usati
come **filtro**. Il filtro non bastava.

**Il problema.** Un club con tre sedi ha tre squadre di Pulcini. Con la sede
come solo attributo, l'elenco `Pulcini` restava **uno** — diciotto atleti di
Scauri e quattordici di Santi Cosma nella stessa lista, distinguibili da una
colonna. Quella lista non si puo usare: chi stampa un appello, chi ordina il
materiale o chi conta gli iscritti di una squadra deve poter prendere *una*
squadra. Peggio: aprendo l'appello di un allenamento di Santi Cosma comparivano
anche i Pulcini di Scauri, che a quell'ora sono a trenta chilometri — e una
presenza segnata per errore li diventa, tre passaggi dopo, un contributo
pubblico rendicontato.

**La decisione.** Il gruppo operativo smette di essere un'etichetta e diventa
**l'unita delle operazioni**. La regola sta in una riga:

| Superficie | Cosa si sceglie |
|---|---|
| *configurazione* — fascia d'anno, compatibilita, proprieta sportive | **categoria** |
| *operazione* — elenco atleti, allenamenti, presenze, programma settimanale, assegnazione allenatori, numerazione, report operativi | **gruppo operativo** |

**Una fonte sola per l'identita di un gruppo.** L'id si **deriva** sempre da
`(categoryId, siteId)` con `buildCategoryGroupId`, anche quando il record
salvato ne porta uno proprio: un id arbitrario in configurazione sarebbe una
seconda identita per la stessa squadra, e le appartenenze degli atleti — che il
loro id lo ricavano dalla coppia — non lo incontrerebbero mai.
`getMembershipGroupId` e l'unico posto che fa quella traduzione.

**Le sedi si spuntano dove si crea la categoria.** Prima erano una finestra a
parte raggiungibile dall'elenco: due superfici per la stessa configurazione, e
chi creava una categoria nuova doveva ricordarsi di aprire anche la seconda. Ora
la spunta sta nel modulo della categoria e il salvataggio scrive i gruppi.
`components/sites/category-groups-editor.tsx` e stato **rimosso**.

**Togliere una sede archivia, non cancella.** Un gruppo che ha avuto atleti,
allenamenti e presenze non si porta via: `active: false`, e resta leggibile.
Cancellarlo lascerebbe orfano lo storico che lo cita per id.

**Chi non ha sede non e in tutte le sedi — negli elenchi.** E la sola
differenza rispetto a ADR-0038, e vale solo per il **raggruppamento**: un
atleta senza sede dichiarata finisce in un gruppo suo, `Categoria · Sede non
assegnata`, visibile e distinto. Metterlo in ogni squadra lo farebbe comparire
in appelli a cui non appartiene; nasconderlo lo farebbe sparire. Il **filtro**
sede resta non distruttivo come prima: `recordMatchesSite` non cambia.

**Un allenamento dichiara i suoi gruppi, e possono essere piu d'uno.** Due sedi
vicine che si allenano insieme una volta al mese sono **un** allenamento con due
gruppi: duplicarlo vorrebbe dire due appelli da tenere allineati e due volte le
stesse ore nei conteggi. Un allenamento che non dichiara gruppi e un dato
precedente, e ricade sulla categoria — cioe si comporta come prima.

**I contributi contano solo la squadra giusta.** `loadAttendanceInputs` filtra
gli allenamenti sui gruppi dell'atleta prima di misurare: l'esistenza di un
allenamento di un'altra sede non produce ne ore ne previsione ne maturato,
nemmeno se un appello sbagliato aveva segnato l'atleta presente. Un allenamento
senza gruppi resta dentro: escluderlo cancellerebbe frequenza vera da stagioni
gia rendicontate.

**Il club mono-sede non paga niente.** Con una squadra per categoria le
etichette restano i nomi delle categorie, il modulo non mostra le sedi e il
programma settimanale dice «Pulcini» come ha sempre detto. Il concetto di
gruppo resta trasparente a chi non ha il problema.

**Il dato storico si colloca in blocco.** Un club che configura le sedi oggi ha
centinaia di atleti senza sede: assegnarla scheda per scheda vuol dire non
assegnarla. Il cambio di categoria in blocco accetta una sede, e **preserva**
quella esistente quando non se ne indica una — un difetto reale trovato qui:
`resolveRequestedAthleteMemberships` scartava `site_id` a ogni cambio di
categoria, primarie e secondarie comprese.

**Conseguenze.**

- `athlete_category_memberships.site_id` resta l'unica scrittura della sede: la
  coppia con `category_id` **e** il gruppo, e non ci sono due filtri da
  comporre a mano;
- `groupIds` compare sugli allenamenti, sulle righe del programma settimanale e
  sugli allenatori; ovunque un elenco vuoto significa «non dichiarato» e ricade
  sul comportamento precedente;
- la deduplica degli allenamenti generati dal programma include il gruppo: due
  squadre della stessa categoria alla stessa ora in due sedi sono due
  allenamenti, non un duplicato;
- `src/components/dashboard/WeeklyTrainingSchedule.tsx` — il duplicato non
  montato con l'autosave senza deduplica, debito D22 — e stato **rimosso**;
- le sedi restano **globali** e i gruppi restano **stagionali**, come gia
  previsto dal rollover: presenze e allenamenti non si riportano.

**L'alternativa scartata.** Duplicare la categoria — `Pulcini Scauri`,
`Pulcini Santi Cosma` — e cio che i club fanno oggi a mano, ed e esattamente il
difetto che ADR-0038 esisteva per chiudere: due fasce d'anno da tenere
allineate, due compatibilita da configurare due volte, e un atleta che «cambia
categoria» quando ha solo cambiato citta.

---

## ADR-0056 — La scheda «Iscrizione» ha un riepilogo solo, e una fonte sola per i numeri

**Data:** 2026-08-26
**Stato:** ATTIVA
**Contesto:** Blocco D2. La scheda economica dell'atleta ha ricevuto, in tre
blocchi successivi, Payments V2 ([ADR-0036](#adr-0036--una-rata-e-un-debito-un-incasso-e-un-movimento-due-tabelle-non-una)),
i contributi ([ADR-0037](#adr-0037--un-contributo-non-e-un-pagamento-due-contabilita-separate-e-le-regole-del-bando-sono-dati))
e la fiscalita. Ogni blocco ha aggiunto il suo riquadro senza togliere il
precedente.

**Il problema, contato.** Sei riquadri, e dentro:

- **tre** rappresentazioni dei totali — «Riepilogo Incasso», l'intestazione di
  «Storico Pagamenti» (*Totale registrato · Pagato · Residuo*) e la griglia
  *Obbligatori / Opzionali / Totale finale* dentro la configurazione del piano;
- **due** elenchi degli stessi incassi — «Rate e incassi» e la tabella di
  «Storico Pagamenti»;
- due percorsi per agire su una rata, uno dei quali (la tabella) era anche
  l'unico da cui si raggiungessero modifica ed eliminazione.

I tre totali non venivano dalla stessa fonte: due si calcolavano da
`athlete_payments` e dal JSON storico, uno dagli incassi di Payments V2. Non
coincidevano sempre. Chi apriva la scheda per sapere quanto restava da
incassare trovava tre numeri e doveva scegliere di quale fidarsi.

**La decisione, prima parte: una fonte sola.** Lo stato delle rate esce dai
componenti e diventa `useAthletePaymentLedger`. La scheda «Iscrizione» e l'area
Movimenti leggono **lo stesso** stato; dentro la scheda, riepilogo, prossima
rata ed elenco rate leggono la stessa istanza. Non esistono piu due modi di
calcolare «pagato».

**La decisione, seconda parte: un ordine, e la progressive disclosure.**

| # | Sezione | Chiusa? |
|---|---|---|
| 1 | Riepilogo iscrizione — piano, quota, pagato, residuo, stato | aperta |
| 2 | Prossima rata | aperta |
| 3 | Rate | chiusa, salvo anomalie |
| 4 | Composizione della quota | chiusa |
| 5 | Voucher e contributi | aperta |
| 6 | Documenti e ricevute | chiusa |

Le prime due rispondono alle cinque domande di chi apre la scheda — che piano
c'e, quanto deve, quanto ha pagato, quanto resta, cosa fare adesso. Tutto il
resto e dettaglio.

**Perche «la prossima rata» e una sezione e non una riga dell'elenco.**
Aprendo la scheda la segreteria fa quasi sempre una cosa sola: incassare la
rata che tocca. Se per trovarla deve scorrere quattro righe uguali e
confrontare quattro date, l'elenco le sta chiedendo un lavoro che il programma
sa gia fare. L'ordine di priorita e quello del problema, non del calendario:
prima la scaduta piu vecchia, poi la prima scoperta per scadenza; una rata
senza data va in fondo.

**Perche le rate restano chiuse.** Quattro righe regolari non aggiungono
niente a «residuo 350 EUR, prossima il 30 settembre». La sezione si apre da
sola quando c'e una rata scaduta o un pagamento parziale, perche li il
dettaglio **e** l'informazione.

**Cosa e stato rimosso davvero.** La card «Riepilogo Incasso», la card
«Storico Pagamenti» con la sua tabella e i suoi totali, la griglia dei totali
dentro la configurazione del piano, e la card «Status Iscrizione» a tutta
larghezza con il riquadro colorato — lo stato dell'iscrizione e la sua data
sono due campi, non un pannello. Nessuno dei tre e stato «lasciato per
sicurezza».

**Dove sono finite le azioni che vivevano nella tabella rimossa.** Modifica ed
eliminazione di una rata stanno nel **dettaglio della rata**, che e dove si
guarda quella rata; l'aggiunta di una voce a debito sta nell'intestazione
della sezione «Rate». Su una rata su cui e gia entrato denaro l'etichetta dice
«Annulla rata» invece di «Elimina rata»: il rifiuto si legge prima del clic,
non dopo.

**Cosa non cambia.** Lo stato di una rata resta **derivato** dagli incassi e
non si imposta a mano (ADR-0036). I contributi restano in un riquadro proprio,
fuori dai totali della famiglia, e la scheda lo dice a chiare lettere invece di
lasciarlo dedurre (ADR-0037).

**Conseguenze.**

- `AthletePaymentLedger` diventa una vista sottile sull'hook e resta il
  componente montato dall'area Movimenti;
- `InstallmentLedgerList` accetta `onEditInstallment` / `onDeleteInstallment`:
  l'anagrafica della rata, mai il suo stato;
- le ricevute e le fatture dell'atleta si leggono da `receipts` e `invoices`
  filtrate per `athlete_id`, risorse che esistevano gia: nessun secondo elenco
  di «documenti dell'atleta» da tenere allineato;
- `page.tsx` della scheda atleta scende di circa 430 righe, e la scheda
  economica smette di essere una delle ragioni per cui cresce.

---

## ADR-0057 — Iscrivere un atleta e una pagina, e il numero di maglia non e un dato anagrafico

**Data:** 2026-08-26
**Stato:** ATTIVA
**Contesto:** Blocco D2. Chiude l'ultima disparita fra le tre anagrafiche di
persona.

**Il problema, prima parte.** Allenatori e soci si creano da una **pagina**
dedicata dal Blocco 7 (`/trainers/new`, `/soci/new`). L'atleta — che ha piu
campi di entrambi, perche porta anche genitori, tesseramento e taglie — era
rimasto l'unico dentro una **finestra**. Un modulo di quella lunghezza dentro
una finestra scorre in un riquadro dentro una pagina che scorre a sua volta; a
375 px non ha dove stare; e un clic fuori lo chiude portandosi via tutto quello
che era stato scritto, senza chiedere niente.

**La decisione, prima parte.** Il modulo esce dalla finestra e diventa
`AthleteCreateForm`, montato da `/athletes/new` nello stesso guscio di
allenatori e soci: intestazione con «indietro» e salvataggio, modulo in una
`Card`, sezioni a scomparsa. Chi salva arriva sulla **scheda appena creata** e
non sull'elenco: dopo aver iscritto un atleta si continua quasi sempre da li —
piano di pagamento, certificato, documenti — e riportare all'elenco
costringerebbe a ritrovarlo.

Gli indirizzi `?action=new` continuano a funzionare e reindirizzano: un
collegamento salvato non deve smettere di portare da qualche parte.

**Il problema, seconda parte.** Il modulo chiedeva il **numero di maglia**. Non
e un dato della persona: e un'**assegnazione**. Appartiene a un gruppo di
numerazione, vale per una stagione, e puo essere gia occupata da qualcun altro.
Chiederlo all'iscrizione produceva un numero che nessuna regola aveva
verificato — nessun controllo di unicita, nessun gruppo, nessuna stagione — e
che l'assegnazione vera avrebbe poi contraddetto senza che nessuno se ne
accorgesse.

**La decisione, seconda parte.** Il campo esce dall'iscrizione. Il numero si
assegna da dove esistono le regole che lo governano: i gruppi di numerazione.

**Conseguenze.**

- `AthleteQuickCreateDialog` non esiste piu: e diventato `AthleteCreateForm`,
  senza `Modal` e senza `isOpen`/`onClose`;
- `AddAthleteForm`, componente orfano mai montato che duplicava la stessa
  idea, e stato **rimosso** insieme a lei;
- la sezione «Taglie e numero di maglia» del modulo si chiama «Taglie»;
- la pagina Atleti non contiene piu la logica di creazione: `/athletes/new`
  scrive con `addClubAthlete` e la pagina si limita a portarci.

---

## ADR-0058 — Uno stato che si ricava non si scrive, e la guardia sta in ogni strada che porta al campo

**Data:** 2026-08-26 · **Stato:** accettata · **Blocco E**

### Contesto

[ADR-0036](#adr-0036--una-rata-e-un-debito-un-incasso-e-un-movimento-due-tabelle-non-una)
stabilisce che lo stato di una rata non e una dichiarazione dell'operatore: si
ricava dagli incassi. Il servizio che registra un incasso lo rispettava, era
coperto da test, ed era scritto nella matrice RC come `DONE`.

Provandolo davvero nel Blocco E si e visto che la regola valeva **solo dentro
quel servizio**. Il campo `payments.status` era raggiungibile da altre due
strade:

1. la risorsa generica, `PATCH /api/v1/payments/:id`, che scriveva `status`
   come qualunque altra colonna;
2. la rotta dedicata `PATCH /api/athlete-payments/:id` con
   `action: "update"`, che accettava `updates.status` fra le modifiche
   dell'importo — e quando il valore era «paid» ci metteva pure una data di
   pagamento.

Il risultato era un record che si contraddiceva da solo: `status: "paid"`
accanto a `data.ledger: {state: "partial", paidAmount: 100, residualAmount: 30}`.
E il campo sbagliato e quello che meta applicazione legge — riepiloghi,
Movimenti, report, area genitore — perche il registro degli incassi va
caricato a parte.

### Decisione

**La guardia sta dove il dato viene scritto, e in ogni strada che ci porta.**

Non e una regola nuova: e la stessa di
[ADR-0048](#adr-0048--il-piano-di-una-societa-appartiene-alla-piattaforma-non-alla-societa)
per il piano di un club e di
[ADR-0050](#adr-0050--una-condizione-commerciale-ha-una-decorrenza-e-la-commissione-si-congela-sullincasso)
per le condizioni commerciali. Quello che il Blocco E aggiunge e il
**controllo che sia applicata ovunque**, non solo sul percorso principale.

Tre conseguenze concrete:

1. la risorsa generica ignora `pending`, `partially_paid` e `paid` quando
   arrivano dal client, per la creazione **e** per la modifica. Ignora, non
   rifiuta: chi salva una rata rimanda indietro il record intero, e un 403 su
   un campo che nessuno stava cambiando romperebbe le schermate. Un valore
   **diverso** da quello che c'e lascia un audit `denied` su
   `payment_state`;
2. `cancelled` resta scrivibile. Annullare una rata non e dire che e stata
   incassata: e dire che quel debito non esiste piu, ed e cio che fa la
   sostituzione del piano di pagamento. E la stessa distinzione che il
   ricalcolo gia rispettava rifiutandosi di sovrascrivere una rata annullata;
3. la rotta dedicata smette di leggere lo stato dal client **e** ricalcola
   dopo aver cambiato l'importo. Il secondo pezzo non e cortesia: cambiare
   l'importo cambia il debito, quindi puo cambiare lo stato — una rata da 130
   con 100 incassati e parziale, la stessa rata portata a 100 e saldata. Senza
   il ricalcolo, togliere al client la possibilita di scrivere lo stato
   avrebbe lasciato il record indietro invece che sbagliato.

### Conseguenze

- una rata non puo piu nascere pagata, ne diventarlo senza un incasso;
- il ricalcolo dal registro e ora esportato dal modulo che lo possiede, e chi
  cambia l'importo lo chiama invece di riscrivere lo stato per conto suo;
- otto test a runtime in `tests/server/payment-state-ownership.test.mjs`, piu
  un'invariante sul codice della rotta dedicata.

### Alternative scartate

**Rendere `payments.status` una colonna calcolata.** Sarebbe la soluzione
giusta e non e questa: meta applicazione legge quella colonna con Prisma, e
una vista o un trigger cambierebbero il modello di lettura di tutto il
prodotto durante un blocco di stabilizzazione. Resta la strada per il futuro.

**Rispondere «Accesso negato».** Provato mentalmente e scartato per la stessa
ragione di ADR-0048: le schermate mandano il record intero.

---

## ADR-0059 — L'adapter del driver e il client Prisma sono la stessa cosa in due pacchetti

**Data:** 2026-08-26 · **Stato:** accettata · **Blocco E**

### Contesto

EasyGame parla con PostgreSQL attraverso un *driver adapter* di Prisma:
`@prisma/client` genera le query, `@prisma/adapter-pg` le esegue con `pg` e
riporta indietro il risultato.

Il repository aveva `@prisma/client` 6 e `@prisma/adapter-pg` **7**. Il
disallineamento non si vedeva: le due librerie si parlavano, il build passava,
i 1.535 test erano verdi, l'applicazione funzionava. Funzionava per tutto
tranne una cosa — **le colonne `Bytes`**. Ogni tentativo di scrivere un blob
rispondeva:

    Raw query failed. Code: `InvalidArg`.
    Message: `JS functions cannot be represented as a serde_json::Value on JsResultSet.rows`

In pratica, dal giorno in cui gli allegati sono stati spostati fuori dai
record, **nessun allegato poteva essere salvato**: documenti dell'atleta,
contratti e visite mediche dell'allenatore, BLSD, documenti di staff e soci,
allegati dei moduli pubblici. L'unica superficie di EasyGame aperta su
Internet accettava un file e rispondeva 500.

Nessun test lo vedeva, e la ragione e istruttiva: i test del servizio allegati
sostituiscono il client Prisma con un doppio. E la scelta giusta per quei test
— verificano permessi, checksum, nome del file, il fatto che il binario non
stia nel record — e lascia scoperta **esattamente** la classe di difetti che
vive nel confine fra il client e il database.

### Decisione

1. **`@prisma/adapter-pg` segue la generazione di `@prisma/client`.** Non e
   una preferenza: le due librerie condividono un protocollo interno che
   cambia fra major. Un'invariante lo verifica sia su `package.json` sia su
   cio che e davvero installato, perche un `npm install` distratto rimette il
   difetto senza toccare un file tracciato;
2. **il pool si costruisce qui e l'adapter lo riceve gia fatto.** La firma
   dell'adapter 6 accetta un `pg.Pool` o la sua configurazione; quella della 7
   accetta una stringa di connessione e dei callback. Passare un pool
   esplicito, oltre a essere la firma corretta, e il posto dove agganciare
   l'ascolto degli errori del pool, che il codice precedente otteneva con un
   callback che con la 6 non esiste;
3. **aggiornare Prisma e un lavoro suo.** Portare il client alla 7 tocca
   schema, generazione e tipi di tutto il prodotto: non si fa dentro un blocco
   di stabilizzazione per correggere un difetto che si chiude allineando una
   dipendenza.

### Conseguenze

- gli allegati funzionano, provati su sette combinazioni di proprietario e
  categoria con rilettura byte per byte;
- `@types/pg` entra fra le dipendenze di sviluppo, perche il pool ora e
  costruito nel codice dell'applicazione;
- `tests/server/prisma-driver-alignment.test.mjs` impedisce il ritorno.

### La lezione, che vale oltre questo difetto

Un doppio del client Prisma prova il dominio e **non prova il driver**. Ogni
tipo di colonna che non sia testo, numero, data o JSON — oggi `Bytes`, domani
`Decimal` o un tipo geografico — va esercitato almeno una volta contro un
database vero, o non e provato affatto.

---

## ADR-0060 — La firma dice chi ha parlato, non da quale mondo: sandbox e produzione si separano sull'evento

**Data:** 2026-08-26
**Stato:** ATTIVA
**Contesto:** Blocco E. Completa
[ADR-0051](#adr-0051--due-flussi-stripe-due-account-due-segreti-il-denaro-delle-famiglie-non-e-il-fatturato-di-easygame)
dal lato dell'ambiente.

**Il problema.** ADR-0051 ha messo in fila tre controlli su un evento di
webhook: la **firma** — viene da Stripe; l'**account** (`event.account`) — viene
per conto di una societa che EasyGame conosce; la **deduplica** — non l'abbiamo
gia visto. Mancava la quarta domanda, e non e una domanda minore: **da quale
mondo**.

Un endpoint di staging puo ricevere un evento **live**. Non e un caso
ipotetico: succede quando un endpoint viene registrato sull'account sbagliato,
quando un segreto di firma viene copiato da un ambiente all'altro, e quando
qualcuno rinvia a mano un evento dalla dashboard di produzione. Quell'evento
avrebbe una firma **perfettamente valida**, supererebbe i tre controlli
esistenti, e registrerebbe denaro vero nel registro incassi di un database di
prova.

L'errore inverso e peggiore, e vale la pena scriverlo: un evento **di prova**
accettato in produzione fa comparire un incasso mai avvenuto sulla rata di una
famiglia vera, con la ricevuta che ne consegue.

**La decisione.** Ogni evento porta con se l'ambiente che il provider dichiara
(`livemode` su Stripe), e viene confrontato con l'ambiente che il deployment si
aspetta. Se non coincidono, l'evento non viene elaborato.

*L'ambiente atteso lo dice la chiave segreta, non una variabile dedicata.*
La chiave di prova e quella di produzione — `sk_` seguito da `test` o da `live`
— sono due credenziali diverse e dichiarano da sole a
quale mondo appartengono. E la fonte migliore perche non puo divergere da cio
che regola davvero le chiamate **in uscita**: una variabile separata puo
restare indietro dopo una rotazione, una chiave no. `PAYMENT_MODE` resta il
ripiego per quando la chiave non e riconoscibile.

*Un evento che non dichiara l'ambiente viene rifiutato, non assunto «di
prova».* `Boolean(undefined)` e falso, ed e esattamente il ripiego silenzioso
che questo controllo esiste per togliere: un corpo senza `livemode` non e un
evento Stripe completo, e non c'e modo di dimostrare che appartenga a qui.

*Il controllo sta prima della deduplica.* Non e un dettaglio d'ordine: se un
evento dell'ambiente sbagliato occupasse una riga nella memoria degli eventi
gia visti, il rinvio dello **stesso identificativo** all'ambiente a cui
appartiene davvero risulterebbe un duplicato e verrebbe scartato senza
registrare l'incasso.

**Il secondo difetto che questo blocco chiude: la commissione di Stripe non si
calcola.** `provider_fee_cents` esisteva in tabella dal Blocco D e non lo
scriveva nessuno. La tentazione di riempirlo con una formula — «1,5% + 25
centesimi» — va nominata per rifiutarla: quella cifra cambia per metodo di
pagamento, circuito e paese della carta, e cambia di listino senza avvisare.
Una formula sarebbe giusta il giorno in cui viene scritta e sbagliata il giorno
dopo, e il numero sbagliato comparirebbe in un rendiconto **con l'aria di
essere un fatto**.

Si chiede al PSP. Su Stripe il dato vive sul `balance_transaction` del charge,
letto **sull'account connesso** perche e li che l'addebito diretto avviene. Le
voci si leggono per **tipo** (`stripe_fee`, `application_fee`) e non per
posizione, perche l'elenco puo contenerne altre — imposte, costi di rete — e
sommarle tutte attribuirebbe a Stripe cio che non e suo.

*`null` significa «non ancora noto», e non zero.* La transazione di saldo
matura dopo l'incasso, a volte giorni dopo per i metodi differiti. Scrivere
zero direbbe «gratis», che e un'affermazione diversa. E la lettura non puo far
fallire l'incasso: se il PSP non risponde, l'eccezione non risale — un webhook
che rispondesse 500 farebbe riprovare Stripe e lascerebbe non registrato un
incasso gia avvenuto, per un motivo che non lo riguarda.

**Conseguenze.**

- `src/lib/payments/live-mode.ts` e la regola, pura e collaudabile senza un
  ambiente; `src/lib/server/payment-environment.ts` e la sola parte che legge
  le variabili;
- `GatewayWebhookEvent.liveMode` e `PlatformBillingEvent.liveMode` portano
  l'ambiente su **entrambi** i flussi di ADR-0051, che condividono la chiave
  segreta e quindi l'ambiente, pur non condividendo il segreto di firma;
- `PaymentGateway.fetchSettlement` e **opzionale**: un PSP che non espone la
  propria commissione per transazione dice «non lo so», e non costringe
  EasyGame a inventarla;
- restano da collaudare contro Stripe, per la ragione di ADR-0045, tutte le
  chiamate che parlano con `api.stripe.com`: la traduzione ha test, la rete no.

---

## ADR-0061 — Un account connesso nasce sulla Accounts v2; il resto dell'integrazione resta sulla v1

**Data:** 2026-08-27
**Stato:** ATTIVA
**Contesto:** Blocco E, collaudo Stripe Sandbox. Rivede la sola **creazione**
degli account connessi di
[ADR-0049](#adr-0049--cedipay-non-e-un-prodotto-della-v1-sotto-ce-stripe-e-si-chiama-stripe)
e [ADR-0051](#adr-0051--due-flussi-stripe-due-account-due-segreti-il-denaro-delle-famiglie-non-e-il-fatturato-di-easygame).

**Il problema.** Al primo tentativo di creare un account connesso vero sulla
sandbox, Stripe ha rifiutato la chiamata: *«Stripe no longer recommends
Accounts v1 for new Connect integrations. Create connected accounts with
`POST /v2/core/accounts` instead.»* Non e un avviso di deprecazione con un
periodo di grazia: e un `400`, e le sandbox nuove nascono con
`POST /v1/accounts` **disattivata**.

Stripe offre due uscite. La prima e un interruttore sul cruscotto — «Accounts
v1 support» — pensato per gli scenari di compatibilita di chi ha gia un parco
di account v1. La seconda e usare la v2.

**La decisione.** Migrare alla Accounts v2 **il solo provisioning**: creazione
dell'account, link di onboarding, rilettura dello stato. Non accendere
l'interruttore di compatibilita.

*Perche non l'interruttore.* EasyGame non ha ancora incassato un euro online:
non ha un parco di account v1 da proteggere, e quindi non ha lo scenario per
cui quell'interruttore esiste. Accenderlo avrebbe voluto dire **nascere
deprecati** — un debito tecnico creato di proposito, in cambio di zero righe
di codice risparmiate oggi e di una migrazione obbligata domani, quando ci
sarebbero stati account veri di club veri da portare dietro.

*Perche non tutto il resto.* Stripe dichiara l'interoperabilita fra le due
versioni: un identificativo di account creato in v2 e accettato dagli endpoint
v1. Checkout, addebiti diretti, application fee, rimborsi, movimenti di saldo
e verifica della firma continuano quindi a funzionare **senza modifiche**.
Riscriverli sarebbe stato un rischio preso senza contropartita, su codice che
ADR-0050 e ADR-0060 hanno appena collaudato.

*La traduzione che conta, e che non e meccanica.* La v1 esponeva due booleani
(`charges_enabled`, `payouts_enabled`) e un `disabled_reason`. La v2 espone
per **ogni capacita** uno stato e un elenco di motivi. Il punto in cui una
traduzione letterale avrebbe fatto danno: un account appena creato ha
`card_payments.status = "restricted"` con motivo `requirements_past_due`.
Tradotto alla lettera, la console avrebbe detto che Stripe ha **limitato** il
club un istante dopo averlo creato — e avrebbe mandato una segreteria a
cercare un guasto inesistente invece che a completare l'onboarding. La
distinzione la fa il **motivo**, non lo stato: `restricted_other` e
`unsupported_country` sono blocchi veri, tutto il resto e onboarding da fare.

*Chi paga cosa, deciso una volta sola.* Nella v2 il tipo di account non esiste
piu: al suo posto ci sono `dashboard` e `defaults.responsibilities`.
L'equivalente dell'account **Standard** e `dashboard: "full"` con
`fees_collector: "stripe"` e `losses_collector: "stripe"`. Non e un dettaglio
di configurazione: dice **chi e l'esercente**. Con `fees_collector:
"application"` sarebbe EasyGame a pagare le commissioni Stripe e a doverle
riaddebitare; con `losses_collector: "application"` sarebbe EasyGame a
rispondere del saldo negativo di un club. Nessuna delle due e vera nel modello
di ADR-0049 — e nessuna delle due si corregge dopo: **Stripe congela le
responsabilita alla creazione**.

**Conseguenze.**

- `callStripeV2` in `src/lib/payments/gateway/providers/stripe-http.ts` e il
  secondo trasporto: corpo JSON, `Stripe-Version` **obbligatoria** in
  intestazione, e `include` per chiedere i rami della risposta. Cio che non si
  include torna `null` e non «vuoto»: una rilettura senza
  `configuration.merchant` direbbe che un club operativo non ha capacita, e la
  sincronizzazione gli spegnerebbe i pagamenti;
- il contratto `PaymentGateway` **non cambia**: la migrazione resta dentro il
  provider Stripe, e `src/lib/server/connect-accounts.ts` non sa che e
  avvenuta. E la prova che l'astrazione provider-agnostica di ADR-0049
  serviva a qualcosa;
- `tests/lib/stripe-connect-v2.test.mjs` include un **guardrail**: se qualcuno
  ripristinasse `callStripe("/accounts")` il test fallisce. Il rifiuto di
  Stripe arriva a runtime e in sandbox l'interruttore di compatibilita puo
  mascherarlo — senza guardrail, il difetto si vedrebbe il giorno del
  passaggio al live;
- **verificato sul campo:** un account creato in v2 emette ancora l'evento v1
  `account.updated`. Durante l'onboarding del collaudo ne sono arrivati dieci,
  tutti elaborati e correttamente attribuiti al club. La sincronizzazione
  automatica non va quindi rifatta sugli eventi v2, e resta valida com'e;
- vale ancora la riserva di ADR-0045: la traduzione ha test, la rete no.

**Alternative scartate.**

*Accendere «Accounts v1 support».* Un minuto di lavoro contro una migrazione
obbligata piu avanti, con account di club veri da portare dietro invece di
zero. Il costo si sposta, non si evita, e si sposta nel momento peggiore.

*Migrare tutta l'integrazione alla v2.* Checkout, rimborsi e saldi non hanno
un problema da risolvere: funzionano, e sono stati collaudati. Toccarli
avrebbe messo a rischio la parte che regge il denaro per allineare un numero
di versione.

---

## ADR-0062 — Un incasso si riconosce dal denaro, non dall'evento che lo racconta

**Data:** 2026-08-27
**Stato:** ATTIVA
**Contesto:** Blocco E, collaudo Stripe Sandbox. Completa
[ADR-0051](#adr-0051--due-flussi-stripe-due-account-due-segreti-il-denaro-delle-famiglie-non-e-il-fatturato-di-easygame)
sul lato dell'idempotenza.

**Il difetto, trovato al primo pagamento vero.** Un incasso di 50 € su una rata
da 130 € ha prodotto **due movimenti da 50 €**. La rata risultava pagata per
100 €. Nessun errore, nessun log rosso: il webhook ha risposto `200` due volte,
e correttamente.

La causa non e un doppio invio. Un pagamento riuscito genera **due eventi
diversi**, entrambi legittimi, entrambi sottoscritti da EasyGame:
`payment_intent.succeeded` e `checkout.session.completed`. Il provider traduceva
in un incasso **l'oggetto di qualunque evento** — sessione, intent o charge — e
la deduplica esistente e sull'identificativo dell'**evento**. Due eventi diversi
hanno due identificativi diversi: la deduplica li lasciava passare entrambi.

Il denaro invece era uno. La sessione lo chiama `cs_…`, l'intent `pi_…`, il
charge `ch_…`: tre nomi di un fatto solo.

**Perche i test non l'hanno visto.** C'era un test dedicato, e asseriva il
comportamento sbagliato:

> `test("due eventi diversi sullo stesso pagamento restano due eventi")`
> «la chiave e l'evento, non il pagamento: uno dice autorizzato, l'altro incassato»

Contava le righe degli **eventi** — due, corretto — e non contava mai quelle dei
**movimenti**. La cosa sbagliata non era osservata, quindi il test era verde
mentre il difetto era presente. E' il modo piu comune in cui una suite numerosa
lascia passare un errore contabile.

**La decisione.** L'identita di un incasso e il **denaro**, non l'evento — e
per Stripe il denaro si chiama **PaymentIntent**.

Un incasso si registra quindi con l'identificativo dell'intent, comunque sia
arrivata la notizia: la sessione di checkout usa il proprio `payment_intent`,
l'intent usa se stesso, il charge usa il proprio `payment_intent`. In piu,
`GatewayPayment` porta `relatedExternalIds` — gli altri nomi dello stesso
pagamento — e prima di registrare il gestore del webhook cerca nel registro
**tutti** quei nomi.

**Perche l'intent e non la sessione.** Perche e l'unica cosa che i due eventi
hanno in comune. Un PaymentIntent **non sa** di essere nato da una sessione di
checkout: non esiste un campo che lo riporti indietro. Ancorare l'identita alla
sessione rende quindi la deduplica dipendente dall'**ordine di arrivo** — se
l'intent arriva per primo funziona, nell'ordine opposto no.

Non e un'ipotesi: la prima versione di questa correzione faceva esattamente
cosi, e il **secondo** pagamento del collaudo e stato accreditato due volte
perche Stripe ha consegnato la sessione prima dell'intent. Nel giro di un
minuto si sono presentati entrambi gli ordini.

L'intent e anche l'identificativo che citano gli eventi di rimborso
(`charge.payment_intent`): conservarlo fa combaciare anche quel lato, che con
l'identificativo di sessione non avrebbe trovato l'incasso originale.

Quando una sessione non ha ancora un intent — metodi differiti, sessione
completata prima che il denaro arrivi — resta l'identificativo della sessione,
che e l'unico che esista.

Non e un principio nuovo nel codice: `recordRefundTransaction` lo applicava gia
ai rimborsi, dove lo stesso problema si presenta fra `charge.refunded` e
`charge.refund.updated`. Mancava sugli incassi, cioe sul lato che porta il
denaro dentro.

**Perche non si e scelto di ridurre gli eventi sottoscritti.** Tenere solo
`checkout.session.completed` avrebbe risolto il sintomo e aperto un buco: con i
metodi di pagamento differiti la sessione si completa **prima** che il denaro
arrivi, e l'incasso vero e annunciato dall'intent. Tenere solo l'intent avrebbe
perso il caso opposto. I due eventi servono entrambi: quello che mancava era
sapere che parlano della stessa cosa.

**Cosa non cambia.** `fetchChargeForSettlement` continua ad accettare tutte e
tre le forme di identificativo e a risalire al `balance_transaction` da
ciascuna: normalizzare cio che si **scrive** non obbliga a irrigidire cio che si
**legge**, e le righe registrate prima di questa correzione portano ancora
l'identificativo della sessione.

**Conseguenze.**

- `GatewayPayment.relatedExternalIds` e opzionale: un provider che non conosce
  i nomi alternativi del proprio denaro non e obbligato a inventarli, e resta
  protetto dalla deduplica sull'evento;
- i due eventi restano **entrambi** registrati in `payment_webhook_events`: sono
  davvero arrivati, e cancellarne la traccia renderebbe cieca la diagnosi;
- il test che asseriva il contrario e stato riscritto, e ne sono stati aggiunti
  altri: i **due ordini di arrivo**, il caso che la guardia **non** deve
  bloccare — due acconti veri sulla stessa rata restano due incassi — e la
  mappatura dei due eventi allo stesso nome, provata sul provider con eventi
  firmati;
- una lezione sui test, pagata due volte. Il primo tentativo di regressione
  usava lo **stesso `id` di evento** per i due eventi: a scattare era la
  deduplica dell'evento, non quella del denaro, e il test passava senza provare
  niente. C'e ora un test che verifica che i due eventi abbiano davvero
  identificativi diversi — una guardia sulla guardia, perche un test che passa
  per la ragione sbagliata e peggio di un test assente;
- **la corsa fra i due eventi non era teorica.** Il controllo applicativo e
  una lettura seguita da una scrittura, e Stripe consegna i due eventi
  praticamente insieme: nel collaudo sono arrivati a **109 millisecondi** di
  distanza, elaborati da due invocazioni distinte, ed entrambe leggevano «non
  c'e» prima che una delle due scrivesse. Il doppio accredito si e ripresentato
  a **ogni** pagamento, anche dopo che l'identita era corretta.

  La finestra si chiude solo dove la concorrenza si arbitra davvero, cioe nel
  database: l'indice unico **parziale**
  `payment_transactions_incasso_unico` ammette al piu un incasso positivo per
  (club, pagamento del provider). E' parziale perche il vincolo non vale per
  tutte le righe: storni e rimborsi copiano per costruzione l'identificativo
  dell'incasso che compensano — e devono farlo, perche e cosi che si
  ricollegano — e un indice pieno avrebbe impedito di rimborsare.

  Il controllo applicativo **resta**: risponde nel caso normale — la
  riconsegna a distanza di secondi — e da un messaggio comprensibile invece di
  far risalire un'eccezione di vincolo. Il rifiuto del database, quando
  arriva, si traduce in «gia incassato» e non in un 500, perche per Stripe un
  500 significa «riprova» e riproverebbe per tre giorni;

**Alternative scartate.**

*Un vincolo di unicita su `(organization_id, external_payment_id)`.* Lo storno e
il rimborso copiano l'identificativo dell'incasso originale: il vincolo li
avrebbe rifiutati. Servirebbe un indice parziale, ed e una migrazione che
merita di essere pensata a parte e non dentro la correzione di un difetto.

*Deduplicare sull'importo e sulla rata.* Due acconti uguali sulla stessa rata
sono legittimi — 50 € e 50 € su 130 € — e sarebbero stati scartati come
duplicati. Si sarebbe passati da contare due volte a non contare affatto.

---

## ADR-0063 — La chiave di idempotenza di un checkout si ancora al residuo, non all'orologio

**Data:** 2026-08-27
**Stato:** ATTIVA
**Contesto:** Blocco E, collaudo Stripe Sandbox. Secondo difetto di idempotenza
trovato nella stessa sessione di
[ADR-0062](#adr-0062--un-incasso-si-riconosce-dal-denaro-non-dallevento-che-lo-racconta).

**Il difetto.** La chiave di idempotenza con cui EasyGame apre una sessione di
pagamento era `checkout:{club}:{rata}:{importo}`. Bastava a impedire che un
doppio clic aprisse due checkout — che e il motivo per cui esiste — ma non
conteneva **nulla che cambiasse fra un pagamento e il successivo**.

Conseguenza concreta: una famiglia versa 50 € su una rata da 130 €, torna piu
tardi per versarne altri 50, e Stripe restituisce **la stessa sessione**,
quella gia pagata. La famiglia legge «hai completato il pagamento» davanti a un
residuo di 80 €. Il secondo versamento era **impossibile**, e senza alcun
messaggio che lo spiegasse.

**Perche non era emerso.** La matrice di collaudo prevedeva 50 € e poi 80 €:
due importi diversi, quindi due chiavi diverse. Il difetto si manifesta solo
con **due acconti dello stesso importo** — che e il caso piu naturale del
mondo, perche una rata si divide volentieri a meta. E' venuto fuori per
incidente, ripetendo un pagamento da 50 € dopo aver ripulito i dati di un altro
difetto.

**La decisione.** La chiave include l'**importo gia incassato** sulla rata:
`checkout:{club}:{rata}:{importo}:{gia incassato}`.

E' la cosa giusta da metterci perche ha esattamente la stabilita che serve:
**non cambia** fra due clic dello stesso tentativo — e li la sessione va
riusata, che e lo scopo dell'idempotenza — e **cambia** dopo ogni incasso
andato a buon fine, che e esattamente quando serve una sessione nuova.

**Perche non un orologio.** Mettere un timestamp, o una finestra temporale,
avrebbe rotto l'idempotenza anche quando serviva: due clic a cavallo del
confine di una finestra avrebbero aperto due sessioni, cioe due addebiti. Un
tempo non sa niente di cio che sta pagando.

**Perche non un identificativo casuale per tentativo.** Avrebbe tolto
l'idempotenza del tutto: ogni richiesta una sessione nuova, doppio clic
compreso.

**Conseguenze.**

- `buildCheckoutIdempotencyKey` e una funzione **pura ed esportata**: la
  composizione della chiave si prova senza rete e senza database, che e la
  ragione per cui prima non era provata affatto — viveva inline dentro una
  funzione che parla con Prisma e con Stripe;
- quattro test la coprono, incluso quello che descrive il difetto: stesso
  importo, residuo diverso, chiavi diverse;
- l'acconto senza rata continua a usare il segnaposto `acconto` e resta
  distinguibile.

---

## ADR-0064 — Un interruttore spento di proposito si distingue da uno mai acceso, e la differenza e una data

**Stato:** accettato — 2026-08-27 (Blocco E, chiusura E9)

**Contesto.** `club_payment_accounts.online_payments_enabled` e l'interruttore
**commerciale** della piattaforma: dice se Cedi Soft ha venduto gli incassi
online a quella societa. Nasce `false` per default di colonna.

`startConnectOnboarding` e `applyProviderAccountSnapshot` fanno entrambi
`upsert`, e scrivevano `online_payments_enabled: true` **solo** nel ramo
`create`. Bastava che una riga esistesse gia — legacy, o lasciata da un
tentativo precedente — perche il valore restasse al default e ci restasse per
sempre: il club completava l'onboarding, Stripe dichiarava `charges_enabled` e
`payouts_enabled` veri con zero requisiti, ed EasyGame rispondeva «i pagamenti
online non sono attivi per questa societa».

Il difetto aveva anche una seconda faccia, peggiore della prima:
`applyProviderAccountSnapshot` leggeva quel `false` come una **sospensione
decisa dalla piattaforma** e forzava lo stato a `disabled` a ogni
sincronizzazione riuscita. Dalla console si leggeva «Disabilitato» senza che
nessuno avesse disabilitato niente. Trovato nel collaudo sandbox del Blocco E
(E9).

**La decisione da prendere.** Il debito tecnico poneva la domanda giusta:
`online_payments_enabled` e un default tecnico o un atto commerciale? La
risposta e **entrambi**, in momenti diversi — ed e precisamente la ragione per
cui un booleano solo non basta:

- quando la piattaforma predispone l'incasso per un club, l'interruttore deve
  **inizializzarsi**: e un default tecnico che segue un fatto;
- quando la piattaforma sospende un club — abbonamento non pagato,
  contestazione — l'interruttore e un **atto commerciale**, e nessun evento del
  PSP lo puo ribaltare.

Un booleano non distingue i due `false`. Una data si.

**La decisione.** Si aggiunge `online_payments_decided_at`:

- `NULL` — nessuno ha mai mosso l'interruttore. Il `false` accanto e il default
  della colonna, non una scelta, e si puo inizializzare;
- valorizzata — qualcuno ha deciso, e la sua decisione vale, che sia «acceso» o
  «spento».

La stampiglia **solo** `setClubOnlinePaymentsEnabled`, cioe la sola porta da cui
la piattaforma esprime una volonta. Un'inizializzazione automatica non
stampiglia niente: non e una decisione, e dichiararla tale renderebbe
indistinguibile la prossima.

La regola vive in `resolvePlatformEnablement`, funzione **pura** in
`src/lib/payments/connect-account.ts`, e viene applicata da entrambi gli upsert.

**Perche non un `true` indiscriminato nel ramo `update`.** Perche e il difetto
opposto e costa di piu: riaccenderebbe gli incassi di una societa sospesa di
proposito al primo `account.updated` che passa — e quegli eventi passano da
soli, senza che nessuno prema niente.

**Perche l'inizializzazione all'avvio dell'onboarding e sicura.** Perche
l'interruttore commerciale non e l'unica condizione: `describeCheckoutReadiness`
chiede anche che l'account sia `active` e che incassi davvero. Predisporre non
e abilitare, e un account in verifica resta non incassabile con l'interruttore
acceso.

**Conseguenze.**

- migrazione `20260827040000_interruttore_pagamenti_deciso`, che **stampiglia
  le decisioni gia prese** prima di cambiare le regole: le righe con
  l'interruttore acceso e quelle in stato `disabled` — che scrive solo la
  sospensione esplicita — ricevono `updated_at` come data di decisione. Tutto
  il resto resta `NULL`, ed e il caso legacy che va inizializzato;
- `ClubPaymentAccountRecord` espone `onlinePaymentsDecidedAt`: la console puo
  distinguere «da abilitare» da «sospeso»;
- dodici test di regressione in `tests/server/connect-enablement.test.mjs`
  coprono i cinque scenari (nessuna riga, riga legacy, sospensione esplicita
  preservata, multi-tenant, account non pronto), quattro test puri coprono
  `resolvePlatformEnablement`;
- il test «la sospensione decisa dalla piattaforma vince su cio che dice il PSP»
  ora stampiglia la data: senza, descriveva la confusione invece della regola.

---

## ADR-0065 — Il rimborso si avvia da EasyGame; a scriverlo nel registro resta l'evento firmato

**Stato:** accettato — 2026-08-27 (Blocco E, Payment System V1)

**Contesto.** Dopo il collaudo sandbox del 2026-08-27 il giro dei rimborsi era
per meta: `PaymentGateway.refund` esisteva dal Blocco D, e
`recordRefundTransaction` sapeva registrare un rimborso arrivato da un evento
firmato — con il rimborso parziale, la commissione proporzionale e la rata
ricalcolata. Nel mezzo non c'era niente: **nessuna rotta di EasyGame avviava un
rimborso.**

Il club poteva farlo dal proprio cruscotto Stripe, che con `dashboard: "full"`
ha (ADR-0061), ed EasyGame lo registrava correttamente. Funzionava, e chiedeva
a una segreteria sportiva di riconoscere un `pi_…` in un elenco di pagamenti
per fare una cosa che EasyGame le mostra gia in scheda — con il rischio, ogni
volta, di rimborsare il pagamento sbagliato.

**Le tre decisioni.**

**1. Il rimborso si chiede su un incasso, non su una rata.** Una rata da 130 €
pagata con due incassi — 50 e 80 — non ha «130 € rimborsabili»: ha due
movimenti, ciascuno con il proprio pagamento presso il PSP e il proprio residuo
rimborsabile. Rimborsare «30 € della rata» costringerebbe a scegliere da quale
dei due prenderli, e qualunque scelta sarebbe arbitraria — e sbagliata sul
cruscotto di Stripe, dove i due addebiti restano distinti.

    Rata 130 = incasso A (50) + incasso B (80)
    rimborso di 30 su B → A resta 50, B vale 50, la rata ha incassato 100

**2. La risposta HTTP del provider non e il registro.** E la stessa regola che
vale per gli incassi (ADR-0045), e vale per lo stesso motivo: un rimborso puo
nascere `pending` e restarci per giorni sui metodi differiti, e puo fallire.
Scrivere il movimento sulla risposta vorrebbe dire raccontare a una famiglia che
i soldi sono tornati mentre sono ancora in viaggio, e doverlo disdire.

Quel che serve nel frattempo e sapere che **una richiesta e in volo**. Si annota
sull'incasso originale, in `data.refundRequests`, e **si spegne da sola** quando
il movimento con quell'identificativo compare nel registro: nessuno stato da
tenere allineato a mano, nessuna seconda tabella. E la stessa meccanica del
«pagamento in verifica».

**3. Il rimborsabile si calcola dal registro, non si chiede al provider.**
Perche serve a disegnare l'interfaccia — un pulsante per riga — e
un'interfaccia che per accendersi fa una chiamata di rete per riga e
un'interfaccia che non si apre quando il PSP e lento. La regola vive in
`src/lib/payments/refunds.ts`, modulo **puro**, e la applicano sia la schermata
sia il servizio: una sola idea di «quanto si puo restituire». Il provider resta
l'autorita su cio che accetta, e la sua parola arriva dal webhook.

**Sei ostacoli, sei messaggi.** Come per il checkout (`describeCheckoutReadiness`):
`not_a_payment`, `reversed`, `manual_payment`, `provider_missing`,
`nothing_left`, `in_progress`. I due che si confondono di piu sono il terzo e il
secondo — un incasso **manuale** non si rimborsa dal PSP perche quel denaro dal
PSP non e mai passato, e un incasso **stornato** non si rimborsa perche per il
registro non e mai avvenuto.

**L'idempotenza.** La chiave e
`refund:{club}:{pagamento}:{importo}:{gia rimborsato}`, con lo stesso
ragionamento di ADR-0063: **non cambia** fra due clic dello stesso tentativo — e
li il rimborso va riusato — e **cambia** dopo ogni rimborso riuscito, che e
quando ne serve uno nuovo. Senza il gia rimborsato, un secondo rimborso da 30 €
sullo stesso incasso avrebbe ricevuto indietro il primo, e il club avrebbe
creduto di averne fatti due.

Davanti all'idempotenza del provider c'e una difesa applicativa: **finche una
richiesta e in volo, non ne parte un'altra**. L'idempotenza di Stripe e la rete
di sicurezza, non la prima linea.

**Chi puo rimborsare.** Proprietario e gestore del club —
`canManageClubConfiguration`, la stessa porta dello storno. Non allenatori, non
collaboratori. Il rimborso passa dalla rotta che gia governa le azioni su un
incasso (`POST /api/v1/payment-transactions/:id`) e non da una rotta propria:
stessa risorsa, stesso controllo di ruolo, stesso confine di club — una rotta a
parte avrebbe dovuto ricopiare le tre cose, ed e cosi che due percorsi
cominciano a divergere.

**Tre azioni nel registro degli eventi, non una.** `payment.refund.requested`,
`payment.refund.completed`, `payment.refund.failed`. Il rimborso e l'unica
operazione di EasyGame che parte, resta in volo e puo finire in due modi:
registrarne una sola vorrebbe dire non poter distinguere «non e mai partito» da
«e partito e non e arrivato», che e esattamente la domanda che si pone quando
una famiglia chiama.

**Conseguenze.**

- `requestGatewayRefund` in `src/lib/server/payment-gateway.ts`: legge
  l'incasso **con lo scope**, verifica che l'account connesso della riga
  coincida con quello del club, chiama il gateway e annota. Nessun componente
  parla con Stripe;
- l'account su cui rimborsare arriva da `club_payment_accounts` e non dalla
  riga dell'incasso: quella arriva da un evento, e un evento non e un
  lasciapassare. Quando i due divergono ci si ferma;
- **nessuna tabella nuova.** Il rimborso resta una riga di
  `payment_transactions`, e Payments V2 resta la fonte canonica: scheda atleta,
  tab Iscrizione, rata, area Movimenti e storico incassi si aggiornano da sola
  perche leggono tutti lo stesso registro;
- 30 test sul servizio, 27 sul modulo puro, 22 sulle invarianti di interfaccia.

**Cosa non e stato fatto, e perche.** La **nota di credito**. Un rimborso non
lascia documenti fiscali in uno stato impossibile — `assertIssuable` rifiuta gia
di emettere una ricevuta da un movimento negativo, e la ricevuta dell'incasso
originale resta valida perche quel denaro era davvero arrivato. Ma il documento
che rettifica una ricevuta dopo un rimborso **non esiste** in EasyGame: esiste
la numerazione (`credit_note` in `DOCUMENT_NUMBER_KINDS`) e non il documento.
E scope fiscale, non scope pagamenti, e inventarlo qui avrebbe voluto dire
inventare anche la sua trasmissione. Vedi [16](16-technical-debt.md).

---

## ADR-0066 — L'ordine dei campi anagrafici e un componente, non una convenzione

**Data:** 2026-08-27 (RC Fix 2, punti 1, 2 e 3)
**Stato:** accettata

**Contesto.** EasyGame ha nove anagrafiche di persona fisica: atleta,
allenatore, staff, socio e genitore/tutore, in creazione e in modifica. Tutte
chiedono gli stessi sei dati — nome, cognome, data di nascita, luogo di
nascita, sesso, codice fiscale — e fino a RC Fix 1 li chiedevano in **sei
ordini diversi**:

| Anagrafica | Cosa c'era in mezzo |
|---|---|
| Nuovo socio | l'**email** fra cognome e data di nascita |
| Nuovo atleta | la **categoria** fra data di nascita e sesso, e il codice fiscale chiuso in una fisarmonica |
| Nuovo staff | la **nazionalita** fra data di nascita e sesso |
| Scheda allenatore | **eta**, **nazionalita** e **formazione scolastica** sparse nel blocco |
| Scheda staff | idem, piu nome e cognome ancora senza maiuscola automatica |
| Genitore (creazione atleta) | codice fiscale come `<Input>` nudo, senza calcolo ne validazione |

E il **luogo di nascita** non era un campo: viveva dentro
`AssistedFiscalCodeField`, montato solo se chi chiamava passava
`onBelfioreCodeChange`. Nelle schede allenatore e staff questo produceva
**due controlli per lo stesso dato** — una casella libera «Luogo di Nascita» e
la ricerca nascosta sotto il codice fiscale — di cui solo la seconda produceva
il codice catastale. Chi compilava la prima si sentiva rispondere che il
comune mancava.

**Perche conta.** Chi lavora in segreteria compila la stessa sequenza decine di
volte al giorno, leggendola da un documento che ha in mano. L'ordine e memoria
muscolare: cambiarlo fra una scheda e l'altra costa un errore ogni volta che la
mano arriva prima dell'occhio.

**Decisione.** L'ordine e **uno** — nome, cognome, data di nascita, luogo di
nascita, sesso, codice fiscale — ed e dichiarato una volta sola in
`src/lib/person-identity.ts`. Le nove anagrafiche non lo rispettano per
convenzione: montano `PersonIdentityFields`
(`src/components/forms/person-identity-fields.tsx`), e **non esiste un modo di
montarlo che produca una sequenza diversa**.

L'ordine non e arbitrario: e l'**ordine di derivazione**. Il codice fiscale si
calcola dai cinque campi che lo precedono, quindi sta in fondo; il luogo di
nascita e cio che produce il codice catastale, quindi sta prima del risultato
del calcolo e non dopo.

**Conseguenze.**

- `BirthPlaceField` e stato **estratto** da `AssistedFiscalCodeField`: il
  campo del codice fiscale non disegna piu il comune di nascita, e le due
  caselle duplicate delle schede allenatore e staff sono una sola;
- il campo del codice fiscale **non e condizionato**. Il pulsante «Calcola»
  compare quando ci sono i dati per calcolarlo, e quando non ci sono si dice
  quali mancano; il campo sta al sesto posto sempre. Un campo che si sposta a
  seconda di cosa e stato compilato e un campo che la volta dopo non si trova;
- il sesso perde la voce «Altro» che il solo modulo *nuovo staff* offriva: le
  lettere che il codice fiscale conosce sono due, e la scheda di modifica gia
  riduceva a M/F cio che ci finiva dentro;
- le anagrafiche che chiamano i campi `name`/`surname` invece di
  `firstName`/`lastName` non vengono riallineate in archivio — sarebbe
  riscrivere i payload di ogni club per un guadagno che nessuno vedrebbe. La
  traduzione avviene in un posto solo (`readPersonIdentity` /
  `writePersonIdentity`);
- la **maiuscola iniziale passa anche dal server**
  (`normalizeAnagraficaText` in `src/lib/server/anagrafica.ts`, chiamata
  accanto a `assertAnagraficaIsValid` in tutte e cinque le scritture di
  `resources.ts`). `CapitalizedInput` la applicava all'uscita dal campo, e
  finiva li: l'import atleti da file — il modo in cui un club carica i primi
  duecento nomi — la aggirava del tutto, e nell'elenco ordinato i nomi
  importati e quelli digitati sembravano due archivi diversi. La regola resta
  quella di ADR-0032: non tocca identificatori, e non tocca un valore che ha
  gia una maiuscola dentro.

**Cosa non e cambiato.** La scheda club resta l'eccezione dichiarata: il legale
rappresentante ha un codice fiscale che si puo **verificare** ma non calcolare,
perche il form non raccoglie data di nascita ne sesso. Monta il solo
`AssistedFiscalCodeField` con `enableCompute={false}`.

## ADR-0067 — Il denaro si arbitra bloccando la riga, non solo con un indice

**Data:** 2026-08-28 (Full Club UAT)
**Stato:** accettata

**Contesto.** [ADR-0062](#adr-0062--un-incasso-si-riconosce-dal-denaro-non-dallevento-che-lo-racconta)
aveva gia riconosciuto che una lettura seguita da una scrittura non basta ad
arbitrare due richieste concorrenti, e aveva chiuso la finestra dove la
concorrenza si arbitra davvero: nel database, con due indici unici parziali —
un incasso positivo per `(club, pagamento del provider)`, un movimento
negativo per `(club, riferimento del provider)`.

Quegli indici sono **parziali di proposito**, e il pezzo che lasciano fuori e
esattamente quello in cui il difetto si e ripresentato: gli incassi
**manuali**, che un identificativo del provider non ce l'hanno.

Il Full Club UAT lo ha misurato: sei richieste concorrenti da 50 € su una rata
con 99,80 € di residuo, quattro accettate; 450,00 € registrati su 329,80 €
dovuti. Il controllo di capienza leggeva il registro prima di aprire la
transazione, e le quattro richieste hanno visto tutte lo stesso residuo. Anche
il ricalcolo dello stato della rata girava su quella lettura, e infatti lo
stato salvato contraddiceva i suoi importi.

**Perche un indice non poteva chiudere questo caso.** Due incassi da 50 € in
contanti sulla stessa rata sono **legittimi** — un acconto e un saldo, o due
genitori allo sportello in due momenti — e devono poter esistere entrambi.
Non c'e una colonna la cui unicita esprima la regola: la regola non e «questa
riga non si ripete», e «la somma delle righe non supera il dovuto». Un
invariante su un aggregato, non su una riga.

**Decisione.** Le tre operazioni che muovono denaro —
`createPaymentTransaction`, `reversePaymentTransaction`,
`recordRefundTransaction` — bloccano con `SELECT ... FOR UPDATE` la riga su
cui decidono, **dentro** la transazione, e rifanno li la verifica che prima
stava fuori.

Tre conseguenze che fanno parte della decisione:

1. **Si blocca l'aggregato, non la riga comoda.** Tutte e tre ricalcolano lo
   stato della **rata** dal registro: se lo storno bloccasse solo l'incasso e
   l'incasso solo la rata, due operazioni sulla stessa rata non si vedrebbero
   e i due ricalcoli si sovrascriverebbero. La rata si blocca sempre.
2. **L'ordine e fisso: prima la rata, poi l'incasso.** Due ordini diversi
   sulle stesse due righe sono un abbraccio mortale che non si vede in
   sviluppo e si presenta il giorno delle iscrizioni. Il blocco lo prende una
   funzione sola perche l'ordine non sia una convenzione da ricordare.
3. **I controlli di forma restano fuori.** Importo positivo e metodo indicato
   non dipendono dall'archivio: aprire una transazione e un blocco di riga per
   accorgersi che l'importo e zero e costo senza guadagno.

**Conseguenze.** Due richieste sulla stessa rata si mettono in fila; rate
diverse no, perche il blocco e sulla riga. Gli indici di ADR-0062 restano e
continuano a coprire il canale online, dove sono la difesa piu economica: il
blocco vi aggiunge un errore di dominio leggibile al posto di un errore di
vincolo.

**Alternative scartate.** Isolamento `SERIALIZABLE` sulla transazione:
avrebbe funzionato, ma sposta il costo su **tutte** le transazioni del
processo e introduce fallimenti da ritentare in un punto dove il chiamante e
una segreteria che ha appena premuto un pulsante. Un vincolo `CHECK` sulla
somma: Postgres non lo esprime su piu righe senza un trigger, e un trigger e
logica di dominio spostata dove nessuno la cerca (ADR-0007).

**Aggiornamento (revisione indipendente, 2026-08-28): le operazioni sono
quattro.** La revisione del changeset ha trovato che «le tre operazioni che
muovono denaro» era la lista sbagliata. La regola non e «chi scrive un
movimento», e **chi decide sullo stato economico di una rata** — e la quarta e
`PATCH /api/athlete-payments/:id`, che ne cambia l'importo. Cambiare l'importo
cambia il residuo, quindi cambia lo stato, e quella rotta chiamava
`recomputeChargeFromLedger` fuori da qualunque transazione, su una rata letta
prima.

Due correzioni, e una regola scritta meglio:

- `lockInstallmentAndTransaction` e **esportata**, e la rotta la usa. L'ordine
  resta quello: prima la rata, poi l'incasso;
- `createPaymentTransaction` rilegge dentro il blocco anche la **rata**, non
  solo il registro. Il residuo e una sottrazione fra due numeri e rileggerne
  uno solo lascia aperta meta della finestra: con la rata portata da 130 a 40
  mentre l'incasso e in volo, il controllo diceva ancora di si a 130;
- la regola, riscritta: **chi decide sullo stato economico di una rata prende
  il blocco della rata, e decide su cio che legge dopo averlo preso.** Chi
  scrive un movimento e un sottoinsieme di chi decide, non l'inverso — ed e la
  differenza fra le due formulazioni che aveva lasciato fuori la quarta.

Il costo di sbagliare la lista e asimmetrico: un'operazione in piu nella fila
rallenta una rata alla volta, una in meno riapre l'invariante per tutte.
