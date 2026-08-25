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
`/api/medical-certificate-reminders`, `/api/online-forms`,
`/api/parent-dashboard/**`, `/api/payments/**`,
`/api/public/forms/[publicSlug]`.

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
| `GET|POST` | `/api/v1/funding/accruals` | `recompute` ricalcola dalle presenze, `report` rendiconta all'ente |
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

Solo una whitelist, confronto di uguaglianza esatta:

`id`, `email`, `user_id`, `organization_id`, `athlete_id`, `payment_id`,
`invoice_id`, `bucket`, `path`, `status`, `type`, `role`, `resource_type`.

`club_id` e accettato come alias di `organization_id`.

**Non esiste** paginazione, ordinamento configurabile, ricerca testuale o
filtro per intervallo. Le liste tornano complete. Vedi
[16 — Debito tecnico](16-technical-debt.md).

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
