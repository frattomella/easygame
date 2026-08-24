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

**Stato:** ATTIVA.

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
