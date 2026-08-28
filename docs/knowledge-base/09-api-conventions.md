# 09 — Convenzioni API

Codice: `src/app/api/**/route.ts`, `src/lib/server/resources.ts`,
`src/lib/api/client.ts`, `src/lib/api/registry.ts`.
Elenco leggibile: [`docs/api-registry.md`](../api-registry.md).
Elenco macchina: `GET /api/v1/registry`.

## Envelope

**Ogni** risposta, successo o errore, ha questa forma:

```jsonc
{ "data": <payload | null | []>, "error": null }
{ "data": null, "error": { "message": "...", "code": "..." } }
```

Regole:

- `data` non e mai omesso; per le liste il fallback e `[]`, per i dettagli
  `null`;
- `error.message` e **in italiano**, destinato all'utente finale;
- `error.code` e presente solo dove il client deve ramificare
  (`EMAIL_NOT_VERIFIED`, `PHONE_NOT_VERIFIED`, `VERIFICATION_REQUIRED`,
  `RATE_LIMITED`, `SMTP_*`, `REQUEST_ABORTED`, `NETWORK_ERROR`);
- lo `status` HTTP viene aggiunto a `error.status` dal client, non dal server.

## Codici di stato usati

| Status | Quando |
|--------|--------|
| 200 | Successo (anche per create/update) |
| 400 | Input non valido, risorsa sconosciuta, errore generico di dominio |
| 401 | Sessione assente o non valida → `"Sessione non valida"` |
| 403 | Ruolo non autorizzato (`"Accesso negato..."`), verifica account mancante |
| 404 | Entita non trovata |
| 429 | Rate limit, con header `Retry-After` / `X-RateLimit-*` |
| 500 | Errore inatteso |
| 501 | Funzione non implementata (checkout pagamenti) |
| 503 | Provider esterno non disponibile (SMTP) |

**Convenzione interna:** nei route handler generici l'errore viene mappato con
`String(error.message).includes("Accesso negato") ? 403 : 400`. Se aggiungi un
errore di autorizzazione, il messaggio **deve** contenere `Accesso negato`,
altrimenti diventa un 400.

## Validazione del corpo — `VALIDATION_ERROR`

Dal Blocco Finale C gli endpoint a **corpo chiuso e conosciuto** dichiarano la
loro forma con uno schema `zod` in `src/lib/validation/`, invece di
coercizzarla a mano (D14, WP-05). Un corpo malformato produce:

```jsonc
{
  "data": null,
  "error": {
    "message": "amount: Importo dell'incasso deve essere maggiore di zero",
    "code": "VALIDATION_ERROR",
    "issues": [{ "path": "amount", "message": "…" }]
  }
}
```

con stato **400**. Il codice sta nell'envelope e non nel testo: un client puo
distinguere «hai sbagliato il corpo» da «non hai il permesso» senza leggere
dell'italiano.

**Dove sono gli schemi, e dove deliberatamente non sono.**

| Coperto | Non coperto, e perche |
|---------|----------------------|
| `auth/login`, `auth/register` | Il **CRUD generico** `/api/v1/<resource>`: cinquanta risorse con forme aperte e in evoluzione. Uno schema chiuso le rifiuterebbe a raffica |
| `payment-transactions` | I **moduli online**, che hanno gia una validazione propria guidata dallo schema del modulo (`src/lib/forms/validation.ts`) |
| `seasons`, `entitlements` | |
| `funding/programs`, `funding/settlements` | |

Due schemi sono **volutamente `passthrough`**: la registrazione, che trasporta
i dati anagrafici raccolti dal form, e il bando, le cui regole sono
configurazione e non codice. Chiuderli scarterebbe in silenzio cio che serve.

La **forza della password** non si valida negli schemi: la politica vive in
`src/lib/auth/password-policy.ts` e resta l'unica a conoscerla.

## Header di contesto

Impostati automaticamente da `apiRequest` (web) e da `services/api.ts` (mobile):

| Header | Significato | Letto dal server? |
|--------|-------------|-------------------|
| `x-active-club-id` | Club attivo proposto dal client | **Si**, validato contro `allowedOrganizationIds` |
| `x-active-access-role` | Ruolo con cui operare | **Si**, validato contro le membership |
| `x-active-season-id` | Stagione attiva | **Si** — il CRUD generico filtra e stampa la stagione sulle risorse club (WP-11, WP-32) |
| `Authorization: Bearer` | Token di sessione (mobile) | Si |

Il cookie `easygame_session` e l'alternativa usata dal Web.

## Due famiglie di endpoint

### 1. API versionata `/api/v1` — la superficie ufficiale

| Gruppo | Path |
|--------|------|
| Auth | `/api/v1/auth/**` (vedi [07](07-authentication.md)) |
| Risorse generiche | `/api/v1/[resource]` e `/api/v1/[resource]/[id]` |
| Admin piattaforma | `/api/v1/admin/overview`, `/admin/clubs/[id]`, `/admin/users/[id]`, `/admin/email`, `/admin/email/test`, `/admin/imap`, `/admin/imap/test` |
| Registro | `/api/v1/registry` |
| Comuni | `/api/v1/comuni` (sola lettura, non e un dato di club) |
| Allegati | `/api/v1/attachments` e `/api/v1/attachments/[id]` |
| Incassi | `/api/v1/payment-transactions` e `/api/v1/payment-transactions/[id]` |
| Contributi | `/api/v1/funding/programs`, `/programs/[id]`, `/enrollments`, `/accruals`, `/settlements` |
| Trainer | `/api/v1/trainer/operational-alerts` |
| Automazioni | `/api/v1/training-automation` |

### 2. API di dominio non versionate — retaggio

`/api/athlete-payments/[paymentId]`, `/api/athletes/[athleteId]/documents/**`,
`/api/clothing/assignments`, `/api/forms/assets/[assetId]`,
`/api/medical-certificate-reminders`,
`/api/parent-dashboard/**`, `/api/payments/**`,
`/api/public/forms/[publicSlug]`.

`/api/public/forms/[publicSlug]` resta fuori da `/api/v1` **di proposito**:
non e la superficie ufficiale, e l'unico endpoint che risponde a chi non ha
una sessione. Vedi «Il modulo pubblico» qui sotto.

Sono nate per casi che il CRUD generico non copre. **Convenzione per il nuovo
codice: crea endpoint sotto `/api/v1/`.** Non spostare quelli esistenti senza un
WP dedicato: il client mobile e le pagine web li referenziano.

## Allegati: l'unico endpoint che non risponde JSON

`/api/v1/attachments/[id]` in `GET` restituisce **i byte del file**, non
l'envelope `{ data, error }`. E l'unica eccezione della superficie, ed e
deliberata: un allegato deve poter essere l'`href` di un link o il `src` di
un'immagine, e un envelope JSON non lo permette. Gli errori restano in
envelope, cosi il client li legge come sempre.

| Metodo | Path | Cosa fa |
|--------|------|---------|
| `GET` | `/api/v1/attachments?owner_type=&owner_id=&category=` | Metadati, **mai** i byte |
| `POST` | `/api/v1/attachments` | Caricamento, `multipart/form-data` |
| `GET` | `/api/v1/attachments/:id` | Il file, `Content-Disposition: inline` |
| `GET` | `/api/v1/attachments/:id?download=<nome>` | Il file, `Content-Disposition: attachment` con quel nome |
| `PUT` | `/api/v1/attachments/:id` | Sostituisce il contenuto **mantenendo l'id** |
| `DELETE` | `/api/v1/attachments/:id` | Elimina metadati e byte |

**Perche `multipart` e non JSON con base64.** Base64 costa il 33% in piu, e
un PDF da 8 MB come stringa JSON vive in tre copie fra parsing e decodifica.

**Perche il nome del download arriva in query.** Il nome leggibile
(`BLSD_Rossi_Mario_2026-08-25.pdf`) si costruisce dai dati della persona, che
stanno nel record di dominio e non nell'allegato. Il server non lo inventa: lo
riceve, lo ripulisce, e ci attacca l'estensione giusta ricavata dal MIME —
perche l'estensione la sa lui, non il client.

Vedi [ADR-0034](18-decision-log.md#adr-0034--gli-allegati-escono-dai-record-e-passano-da-un-servizio-con-driver).

## Incassi: perche non passano dal CRUD generico

| Metodo | Path | Cosa fa |
|--------|------|---------|
| `GET` | `/api/v1/payment-transactions?athlete_id=&payment_id=` | Gli incassi, in ordine cronologico **crescente** |
| `POST` | `/api/v1/payment-transactions` | Registra un incasso su una rata |
| `POST` | `/api/v1/payment-transactions/:id` | `{"action":"reverse"}` storna, `{"action":"issue-receipt"}` emette la ricevuta |

Registrare un incasso non e scrivere una riga: e scrivere una riga **e**
ricalcolare lo stato della rata, nella stessa transazione. Il CRUD generico sa
fare la prima cosa e non la seconda, e con la seconda a carico del client si
tornerebbe al difetto che [ADR-0036](18-decision-log.md#adr-0036--una-rata-e-un-debito-un-incasso-e-un-movimento-due-tabelle-non-una)
chiude — lo stato dichiarato dall'interfaccia invece che ricavato dagli
importi.

Tre conseguenze da conoscere:

- **non esiste `DELETE`.** Un incasso cancellato non lascia traccia di essere
  esistito, e cio che si vuole sapere di un errore di cassa e proprio che c'e
  stato. Per correggere: si storna e si registra di nuovo;
- **`POST` e `reverse` richiedono `canManageClubConfiguration`**, lo stesso
  ruolo che gia protegge `/api/athlete-payments/:id`. La lettura resta aperta
  a chi ha accesso al club, perche i riepiloghi la usano ovunque;
- **`source` diverso da `MANUAL` viene rifiutato con 400.** Il campo accetta
  `MANUAL | STRIPE | CEDIPAY | IMPORT | OTHER` perche il modello sia pronto,
  ma accettare un incasso dichiarato `STRIPE` senza un webhook verificato
  vorrebbe dire registrare denaro che nessuno ha incassato.

## Contributi: due contabilita, due superfici

| Metodo | Path | Cosa fa |
|--------|------|---------|
| `GET|POST` | `/api/v1/funding/programs` | I bandi del club. Le regole sono colonne |
| `GET|PATCH` | `/api/v1/funding/programs/:id` | Nessun `DELETE`: un programma con maturati si porta a `closed` |
| `GET|POST` | `/api/v1/funding/enrollments` | Beneficiari. `?view=overview&athlete_id=` restituisce i **cinque importi gia calcolati** |
| `GET|POST` | `/api/v1/funding/accruals` | `recompute` ricalcola dalle presenze, `confirm` registra cio che una fonte esterna ha riconosciuto, `import` ne carica un blocco, `report` rendiconta all'ente. Una previsione non si rendiconta |
| `GET|POST` | `/api/v1/funding/settlements` | Il versamento dell'ente, con la ripartizione sui periodi |

**Perche `view=overview` e non un calcolo nel client.** I cinque importi
richiedono di leggere maturati e righe di liquidazione insieme; farli calcolare
al client vorrebbe dire riscrivere il dominio in TypeScript di interfaccia, che
e il debito [D1](16-technical-debt.md) che EasyGame sta riducendo.

**Perche il ricalcolo e una `POST` e non un effetto della `GET`.** Scansiona
presenze e allenamenti del club: farlo a ogni apertura di scheda costerebbe una
scansione per visita. L'unico `(enrollment_id, period_index)` lo rende
idempotente, quindi si puo rifare quante volte serve.

**Questi endpoint non toccano i pagamenti.** Una liquidazione dell'ente non
genera nessun incasso della famiglia: confonderli farebbe risultare saldate
rate che nessuno ha pagato. Vedi
[ADR-0037](18-decision-log.md#adr-0037--un-contributo-non-e-un-pagamento-due-contabilita-separate-e-le-regole-del-bando-sono-dati).
## I moduli

`/api/v1/forms` e la superficie autenticata: moduli, versioni, coda delle
compilazioni, approvazione. Autorizzazione come sempre — sessione valida,
`organization_id` risolto dallo scope, mai creduto dal client.

`PATCH /api/v1/forms/:id` porta una `action` invece di avere sei endpoint:
`save_draft`, `publish`, `unpublish`, `archive`, `restore`, `duplicate`,
`regenerate_slug`, `set_public_access`. Sono la stessa risorsa in stati
diversi, e sei percorsi vorrebbero dire sei volte la stessa risoluzione di
sessione e scope — con sei occasioni di dimenticarne una.

### Il modulo pubblico

`GET|POST /api/public/forms/:slug` e **l'unico endpoint di EasyGame che
risponde senza sessione e scrive nel database di un club**. Le sue regole:

| Regola | Perche |
|--------|--------|
| Dal client arrivano solo risposte e file | Club, modulo, versione e stato li ricava il server dallo slug |
| Un solo esito negativo: **404** | Slug inesistente, modulo in bozza, link disabilitato o chiuso rispondono uguale: distinguere direbbe a chi prova gli slug quali ha indovinato |
| `multipart/form-data` per gli invii con allegati | Stessa ragione dell'endpoint allegati: base64 costa il 33% in piu e va tenuto in memoria per intero |
| Due contatori di rate limit distinti | Aprire un modulo e quasi gratuito (60 / 15 min per IP), inviarlo crea righe e allegati (10 / ora per IP) |
| Formati piu stretti di un caricamento autenticato | PDF e immagini, fino a 8 MB. Da chiunque abbia il link non si accettano fogli di calcolo e documenti Office |
| La risposta non contiene mai dati d'archivio | Nessuna precompilazione, nessun identificativo interno, nessuna compilazione gia raccolta |

Vedi [ADR-0039](18-decision-log.md#adr-0039--i-moduli-escono-da-clubsdocument_templates-e-diventano-tre-tabelle)
e [ADR-0040](18-decision-log.md#adr-0040--una-compilazione-cita-una-versione-immutabile-e-non-scrive-in-anagrafica).

## Il CRUD generico `/api/v1/[resource]`

`RESOURCE_CONFIG` (in `src/lib/server/resources.ts`) mappa il nome di risorsa a:

- `kind: "model"` → un delegate Prisma (`athletes` → `prisma.athlete`);
- `kind: "club_resource"` → riga di `club_resource_items` con quel
  `resource_type`.

| Metodo | Path | Note |
|--------|------|------|
| GET | `/api/v1/<resource>` | Lista. Filtri via query string |
| POST | `/api/v1/<resource>` | Create. Accetta un oggetto **o un array**. `{ mode: "upsert" }` per l'upsert. Body puo essere wrappato in `{ data, mode, meta }` |
| GET | `/api/v1/<resource>/<id>` | Dettaglio |
| PATCH | `/api/v1/<resource>/<id>` | Update parziale |
| DELETE | `/api/v1/<resource>/<id>` | Delete |

### Filtri supportati in query string

Uguaglianza esatta, solo su una whitelist:

`id`, `email`, `user_id`, `organization_id`, `athlete_id`, `payment_id`,
`invoice_id`, `bucket`, `path`, `status`, `type`, `role`, `resource_type`.

`club_id` e accettato come alias di `organization_id`.

**`id` su una risorsa di club vale due cose.** Le risorse servite da
`club_resource_items` — categorie, allenatori, soci, sedi, gruppi, e le altre
di `CLUB_RESOURCE_TYPES` — hanno l'UUID della riga **e** un id logico dentro
il payload (`category-under-12-bw552a`). Il filtro `id` accetta entrambi: se
il valore non e un UUID si cerca in `payload.id`.

Non e una comodita. `club_resource_items.id` e una colonna `uuid`, e
confrontarla con un id logico **fa fallire la query** con
`invalid input syntax for type uuid` invece di restituire zero righe: finche
il filtro non distingueva i due casi, nessuna categoria era eliminabile
(vedi [25 — RC Fix 2](25-rc-fix-2.md#lottavo-difetto-trovato-mentre-si-faceva-la-pulizia)).

**Cosa esce da un errore.** Il messaggio nell'envelope passa da
`publicErrorMessage`: i messaggi di dominio escono come sono — e
**«Accesso negato» esce sempre**, perche le rotte ci mappano sopra il 403 —
mentre quelli del database o dell'ORM vengono sostituiti da una frase
generica. Il dettaglio resta nei log del server.

### Pagina, ricerca e ordinamento

Dal Blocco 8 (WP-12) le liste sanno impaginare. **Il default non e cambiato**:
chi non chiede una pagina riceve la lista intera e nessun `meta`, perche un
default paginato troncherebbe in silenzio ogni chiamante esistente.

| Parametro | Significato |
|-----------|-------------|
| `?limit=` | Righe per pagina. Oltre 200 il server riduce a 200 |
| `?page=` / `?offset=` | Quale pagina. `page` e 1-based |
| `?q=` (o `?search=`) | Ricerca testuale, su un elenco chiuso di colonne per risorsa. Piu termini: ognuno deve comparire in almeno un campo |
| `?order_by=` + `?order=` | Ordinamento, su un elenco chiuso di colonne per risorsa |

Quando la pagina e stata chiesta la risposta porta anche
`meta: { total, limit, offset, hasMore }`, dove `total` e il conteggio
**dell'archivio**, non delle righe restituite.

### Categoria e sede di un atleta (Blocco Finale C)

Su `athletes` e `simplified_athletes`:

| Parametro | Significato |
|-----------|-------------|
| `?category_id=` | La categoria principale storica (`athletes.category_id`) **oppure** una delle appartenenze (`athlete_category_memberships`). Un atleta si allena con piu gruppi: guardarne una sola perderebbe meta degli iscritti |
| `?site_id=` | La sede di un'appartenenza. Chi non ha **nessuna** sede dichiarata resta visibile con qualunque filtro, perche sede vuota vuol dire «non dichiarata» e non «nessuna» ([ADR-0038](18-decision-log.md)) |

Servono perche la lista Atleti possa consumare la paginazione: senza,
chiedere una pagina avrebbe restituito duecento atleti da filtrare poi a tre,
cioe una pagina che non e una pagina (R-02).

### `view=summary` — proiezione leggera delle liste

Parametro riconosciuto **solo** su `athletes` e `simplified_athletes`. Un
valore diverso da `summary` non filtra nulla.

Gli allegati di un atleta (documenti d'identita, moduli di iscrizione,
certificati) sono salvati come **data URL base64 dentro `athletes.data`**: una
lista di 200 atleti trasferiva ~25 MB per mostrare nome, categoria e scadenza
certificato. Con `view=summary` la stessa lista scende a ~2 MB.

La proiezione toglie dal solo campo `data`:

- le collezioni di allegati: `certificateFiles`, `documents`,
  `enrollmentDocuments`, `guardians`, `identityDocuments`, `medicalVisits`,
  `paymentHistory`, `payments`, `registrationDocuments`, `registrations`;
- qualunque altro valore che sia un data URL di almeno 1 KB, **tranne**
  `avatar` e `avatar_url`, che la lista mostra.

Non e una cache: e la stessa lettura, con meno campi. Il dettaglio
(`GET /api/v1/<resource>/<id>`) restituisce sempre il `data` completo.
Lato client si chiede con `getClubAthletes(clubId, { view: "summary" })`; il
default resta `full`.

Resta valida come soluzione strutturale WP-15 (spostare i file fuori dal
database) e WP-12 (paginazione).

### `fields` — proiezione di colonne del club

Parametro riconosciuto **solo** per `clubs` e `organizations`, in lettura
(`GET /api/v1/clubs?id=…&fields=categories`) e sulla **risposta** della
scrittura (`PATCH /api/v1/clubs/:id?fields=id`).

La riga di un club porta 35 colonne JSON. Leggerla intera per modificarne una
sola trasferiva centinaia di KB a ogni salvataggio, autosave compresi.

- alle colonne richieste si aggiungono sempre `id`, `slug`, `name`,
  `settings`: costano poco e servono a indirizzare la scrittura successiva e a
  risolvere la stagione attiva;
- una colonna sconosciuta viene **ignorata**, non fa fallire la query: il
  parametro arriva dal client;
- senza `fields` la risposta e completa, quindi nessun chiamante esistente
  perde campi.

Lato client la proiezione e una scelta esplicita dei lettori in
`src/lib/simplified-db.ts` (`readClubFields` / `writeClubFields`), non un
comportamento globale dell'adapter: le `select` normali restano invariate.

### `settings_patch`: modificare una parte delle impostazioni

`PATCH /api/v1/clubs/:id` accetta, oltre a `settings`, il campo
**`settings_patch`**: un oggetto con le sole chiavi che cambiano.

| Campo | Semantica |
|-------|-----------|
| `settings` | **Sostituisce** l'intera colonna. E il modo per togliere una chiave. |
| `settings_patch` | **Fonde** le chiavi indicate con il valore corrente, letto al momento della scrittura sotto `SELECT … FOR UPDATE`. Le chiavi non citate non si muovono. |

La fusione e sul primo livello: `settings_patch: { paymentSettings: {…} }`
sostituisce `paymentSettings` per intero, non le sue sottochiavi. E cio che
serve, perche ogni scheda della pagina Club possiede chiavi di primo livello
distinte.

**Perche esiste.** Con il solo `settings` una scheda doveva rileggere la
colonna e riscriverla intera, portandosi dietro una copia delle altre sezioni
vecchia di secondi o di minuti: salvare i Contatti cancellava i Pagamenti
salvati nel frattempo da un'altra finestra, in silenzio
([ADR-0069](18-decision-log.md#adr-0069--una-modifica-parziale-di-clubssettings-dichiara-solo-le-proprie-chiavi)). Il campo e **additivo**: nessun
client esistente cambia comportamento, e nessun consumer mobile scrive
`clubs`.

Sulla **creazione** `settings_patch` vale come valore iniziale: non c'e niente
con cui fondersi.

### Filtro di stagione

Se la richiesta porta `x-active-season-id` e la risorsa e una `club_resource`
soggetta a stagione (`SEASON_SCOPED_DATA_TYPES` in `src/lib/club-seasons.ts`):

- in lettura la risposta esclude le risorse di altre stagioni;
- in creazione `payload.seasonId` viene stampato con la stagione attiva, se il
  payload non ne porta gia una;
- in **aggiornamento** la stagione del record esistente vince sempre: una
  PATCH non puo spostare un elemento in un'altra stagione. Chi vuole lo stesso
  elemento in due stagioni usa il riporto, che ne crea uno nuovo;
- le risorse **senza** `seasonId` (create prima delle stagioni) appartengono
  alla **stagione baseline**, cioe la piu vecchia del club;
- un id di stagione che il club non ha **non filtra nulla**: meglio mostrare
  tutto che una lista vuota inspiegabile;
- senza l'header il comportamento e invariato.

Non e un confine di sicurezza: il confine resta `organization_id`.

### Archivio dei comuni (Blocco 7)

Ogni comune restituito porta anche `postalCode` e `postalCodeStatus`
(`unique` | `ambiguous` | `unknown`), da una **fonte diversa** dichiarata a
parte in `capSource`: IPA di AgID, non ISTAT. Sono due campi e non uno perche
il CAP vuoto ha due significati — «questo comune ha piu CAP» e «di questo
comune non so niente» — e il form deve poterli distinguere per dire
all'operatore quale dei due e. Vedi
[ADR-0042](18-decision-log.md#adr-0042--il-cap-arriva-da-ipa-e-si-propone-solo-dove-il-comune-ne-ha-uno-solo).

`GET /api/v1/comuni` e l'unica rotta di **sola lettura su un dato che non
appartiene a nessun club**: e la tabella ISTAT dei comuni italiani. Non ha
`organization_id`, non passa da `resolveOrganizationScopeForUser`, non tocca
Prisma. Richiede comunque una sessione: l'anagrafica assistita e una funzione
dell'applicazione.

| Query | Significato |
|-------|-------------|
| `?q=abano` | Ricerca per nome, per nome nell'altra lingua ufficiale o per codice catastale |
| `?q=…&province=MI` | Come sopra, ristretta a una provincia |
| `?belfiore=A001` | Il comune di un codice catastale; elenco vuoto se non e in archivio (estero o soppresso) |
| `?name=Castro` | **Tutti** gli omonimi, per disambiguare |

Il client passa da `src/lib/api/comuni.ts`, che tiene una cache in memoria:
l'archivio e immutabile per la vita del processo, quindi la stessa query dara
sempre la stessa risposta.

### Gestione delle stagioni (Blocco 6)

Le stagioni non sono una risorsa del CRUD generico: vivono in
`clubs.settings`, hanno un'invariante propria e la loro creazione puo
trascinarsi dietro una copia di dati. Endpoint dedicati sotto
`/api/v1/seasons`, autorizzati da `canManageClubConfiguration` — quindi solo
`owner` e `club_manager`.

| Metodo | Percorso | Corpo | Effetto |
|--------|----------|-------|---------|
| `GET` | `/api/v1/seasons` | — | Stagioni, catalogo dei tipi riportabili e conteggi per stagione |
| `POST` | `/api/v1/seasons` | `{ label?, startDate, endDate, activate?, rollover? }` | Crea la stagione; con `rollover` ne popola la configurazione |
| `PATCH` | `/api/v1/seasons/:seasonId` | `{ action: "activate" \| "archive" }` | Cambia stato |
| `POST` | `/api/v1/seasons/:seasonId/rollover` | `{ sourceSeasonId, types, preview? }` | Riporta verso la stagione del percorso |

Regole applicate dal server, non dall'interfaccia:

- non si archivia la stagione attiva: prima se ne attiva un'altra, e questa
  passa ad archiviata da sola;
- non si riporta dentro una stagione archiviata;
- origine e destinazione devono essere due stagioni diverse ed esistenti;
- `types` accetta solo le chiavi di `SEASON_ROLLOVER_TYPES`. Chiedere
  `trainings` o `transactions` e un errore, non un no-op silenzioso;
- `preview: true` non scrive e restituisce **lo stesso conteggio**
  dell'esecuzione: il riepilogo mostrato prima della conferma non e una stima.

Ogni operazione scrive nell'audit log: `season.created`, `season.activated`,
`season.archived`, `season.rollover`.

### Effetti collaterali da conoscere

- `POST /api/v1/notifications` e `/api/v1/simplified_notifications` inviano
  anche **email** ai destinatari (`sendNotificationEmails`).
- Scrivere una `club_resource` risincronizza la colonna JSON su `clubs`;
  scrivere quella colonna riallinea le righe **in una sola transazione**,
  preservando gli `id` degli elementi gia presenti (WP-10). Vedi
  [06 — Modello dati](06-data-model.md).

## Sequenza obbligatoria in un route handler

Ogni nuovo endpoint autenticato deve seguire questo ordine:

```ts
const session = await requireAuthenticatedUser(request);
if (!session) return NextResponse.json(
  { data: null, error: { message: "Sessione non valida" } }, { status: 401 });

const scope = await resolveOrganizationScopeForUser(
  session.db.user_id,
  request.headers.get("x-active-club-id"),
  request.headers.get("x-active-access-role"),
);

assertClubResourceAccess(scope.activeRole, "<resource>", "<action>");
// oppure canManageClubConfiguration(scope.activeRole) per la configurazione
// oppure requirePlatformAdmin(request) per /api/v1/admin/*
```

Poi filtrare **sempre** per `scope.activeOrganizationId` o verificare che
l'`organization_id` del record sia in `scope.allowedOrganizationIds`.

## Validazione input

Oggi la validazione e **manuale** e disomogenea: coercizione con
`String(x || "").trim()`, controlli espliciti, `zod` usato negli endpoint
provider (`src/lib/email/smtp-config.ts`, `src/lib/email/imap-config.ts`).

`zod` e gia una dipendenza: preferiscilo per gli endpoint nuovi. Uniformare
l'esistente e [WP-05](20-work-packages.md).

### Anagrafica: la stessa regola sul client e sul server

Dal Blocco 4 le scritture su `clubs`, `organizations`, `athletes` e
`simplified_athletes` passano da `assertAnagraficaIsValid`
(`src/lib/server/anagrafica.ts`), invocata dentro `createResource` e
`updateResource`. Le regole vengono dallo stesso modulo puro che usa
l'interfaccia, `src/lib/italian-registry.ts`: non possono divergere.

Cosa viene rifiutato con **400**, con `error.message` che nomina il campo:

| Campo | Regola |
|-------|--------|
| `postal_code`, `legal_postal_code`, `data.postalCode` | cinque cifre, solo se il paese e l'Italia |
| `province`, `legal_province`, `data.province` | sigla o nome fra le 107 province |
| `fiscal_code` (club) | 11 cifre **oppure** codice fiscale di 16 caratteri con controllo valido |
| `representative_fiscal_code`, `data.fiscalCode` | codice fiscale di 16 caratteri, carattere di controllo verificato |

**Una sola indulgenza, deliberata:** su un aggiornamento un campo il cui valore
non cambia non viene ri-validato. Senza questa regola l'introduzione della
validazione avrebbe reso immodificabile ogni scheda gia in archivio con un CAP
o un codice fiscale sbagliato — bloccando la correzione di tutto il resto
proprio a chi ne ha piu bisogno. Su una creazione tutto viene validato.

## Registro API

Quando aggiungi o rimuovi un endpoint pubblico aggiorna, nello stesso commit:

1. `src/lib/api/registry.ts` (e/o `API_REGISTRY` in `resources.ts`);
2. `src/lib/api-docs/internal-api-registry.ts` se compare in `/private/api-docs`;
3. [`docs/api-registry.md`](../api-registry.md).

## Le rotte del Blocco D (2026-08-26)

### Piattaforma

`GET|POST /api/v1/platform/payments` — il centro di controllo commerciale.
Riservato a `platform_admin`, e il ruolo si ricava **sempre** dalla sessione:
se arrivasse dal corpo, chiunque potrebbe dichiararsi amministratore e
abbassarsi la commissione.

La scrittura usa uno schema discriminato su `operation` — `commission`,
`commission_reset`, `connect_onboarding`, `connect_sync`, `connect_toggle`,
`settings` — per la stessa ragione della rotta degli entitlement: sono atti
che la stessa persona compie nella stessa schermata, e sei rotte avrebbero
voluto dire sei controlli di ruolo da tenere allineati.

La lettura **non restituisce mai una chiave segreta**: dice *se* un ambiente e
configurato, non con cosa.

### Il conto di incasso, visto dal club

`GET|POST /api/v1/payments/account` — la societa **vede** lo stato del proprio
conto, cosa manca e la commissione che le viene applicata, e puo **chiedere il
link** di collegamento. Non puo scrivere l'identificativo dell'account,
dichiararsi attiva, cambiare la commissione ne accendersi il servizio: fino al
Blocco D poteva fare tutte e quattro le cose da un campo di testo.

Da RC Fix 2 la risposta porta anche `account.provider`. La scheda diceva «il
provider» e non lo nominava mai: una societa che sta per dare i propri dati
bancari, e a cui vengono chiesti documenti d'identita, ha diritto di sapere a
chi. Il nome arriva dal record e non e scritto nella pagina, cosi il giorno in
cui un club incassa con un altro intermediario la scheda lo dice da sola.
L'identificativo dell'account resta fuori: alla segreteria non serve.

### Checkout

`POST /api/payments/create-checkout-session` accetta ora un importo
**parziale** e lo valida contro il residuo letto dal registro. Il club della
rata comanda su quello mandato dal client: fidarsi del secondo permetterebbe
di aprire un checkout su una rata di un'altra societa.

`GET /api/payments/checkout-status` risponde con tre stati e non due:
`pending_confirmation` e uno stato vero, ed e quello in cui una famiglia si
trova fra il pagamento e la conferma firmata. Non interroga Stripe: uno stato
che il registro non ha ancora non e uno stato che EasyGame puo usare.

### Fiscalita del club

`GET|PUT /api/v1/fiscal/profile` e `GET|PUT|POST
/api/v1/fiscal/operation-types`. Le serie di numerazione stanno sulla seconda
rotta perche si configurano nella stessa schermata e nello stesso momento.
Un amministratore di piattaforma **legge** qualunque profilo — e cio che gli
permette di assistere — ma la scrittura resta di chi risponde del contenuto.

`POST /api/v1/documents/:kind/:id/cancel` — l'annullamento e una rotta a se e
non un `PATCH`, perche un documento emesso non si modifica affatto: l'unica
cosa che gli puo succedere dopo l'emissione e essere annullato.

### Fattura elettronica

`GET|POST /api/v1/einvoice/:invoiceId`. `action: "prepare"` genera e valida il
tracciato; `action: "transmit"` risponde **503 con il motivo**. Sembra strano
scrivere un'azione che non funziona: e invece l'unico modo onesto di
rappresentare lo stato delle cose. Se l'azione non esistesse, chi legge l'API
concluderebbe che manca da implementare.

### I due webhook

`POST /api/payments/webhook` (Connect) e `POST /api/billing/webhook`
(piattaforma) sono **due** perche sono due account Stripe con due segreti di
firma diversi. Nessuno dei due ha sessione e nessuno dei due puo averla: chi
chiama e Stripe. Cio che li difende e la firma verificata sul corpo grezzo
prima di guardarci dentro, piu la deduplica sull'identificativo dell'evento.
