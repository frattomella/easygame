# RETENTION — finalità e durata di conservazione

> **Seconda conseguenza di [ADR-0019](18-decision-log.md#adr-0019--privacy-retention-e-audit-sono-bloccanti-per-la-produzione):**
> «i nuovi dati personali richiedono di dichiarare finalità e durata di
> conservazione». Fino alla Wave 6 questa dichiarazione **non era scritta da
> nessuna parte**.
>
> Scritto dalla lane **6I** della Wave 6.
> Fonte di verità: lo schema in [`prisma/schema.prisma`](../../prisma/schema.prisma)
> e il codice di [`src/lib/server/data-subject.ts`](../../src/lib/server/data-subject.ts).
> Se questo documento e il codice divergono, **vince il codice**.

---

## 0 — Cosa questo documento è, e cosa non è

**È** l'inventario delle tabelle che contengono dati personali, con per ognuna:
la finalità per cui il dato esiste, quanto si conserva, e cosa succede quando
una persona chiede la cancellazione.

**Non è** una policy legale. La determinazione dei periodi di conservazione
richiede una valutazione che EasyGame non fa e non può fare al posto di una
società sportiva: qui sono dichiarati i periodi che il **prodotto** applica o
propone, e i due obblighi che il prodotto conosce con certezza perché sono
scritti nel codice — la conservazione decennale dei documenti fiscali e la
rendicontazione ai finanziatori pubblici. **La validazione legale resta un
blocker esterno** ([§20 del piano Wave 6](41-wave-6-planning.md#20--blocker-pre-production),
riga W6-4).

---

## 1 — Le tre classi

Ogni tabella con dati personali ricade in una di tre classi. Sono le stesse che
`data-subject.ts` applica: il documento e il codice usano lo stesso vocabolario
apposta.

| Classe | Significato | Alla richiesta di cancellazione |
|---|---|---|
| **`delete`** | Il dato esiste solo per il servizio erogato a quella persona | Sparisce |
| **`anonymize`** | La riga serve a qualcun altro (un documento emesso, una consegna già partita), la persona no | Resta, e smette di nominare nessuno |
| **`retain`** | La società è **tenuta** a conservarla | Resta intera, e chi chiede la cancellazione viene informato di cosa resta e perché |

---

## 2 — Le tabelle, una per una

### 2.1 Anagrafiche di persona

| Tabella | Finalità | Durata | Classe |
|---|---|---|---|
| `athletes` | Iscrizione e gestione dell'attività sportiva | Per la durata del rapporto, poi finché esistono movimenti economici che la citano | `anonymize` |
| `athlete_category_memberships` | A quale gruppo appartiene, per convocazioni e calendario | Durata del rapporto | `delete` |
| `users` | Accesso all'applicazione | Durata dell'account | fuori dal perimetro 6I: la cancellazione di un account è un atto proprio |
| `organization_users` | Il ruolo di una persona in una società | Durata del rapporto | segue l'account |
| `club_members` / libro soci | Obbligo associativo | Secondo statuto; la cessazione **resta** | `retain` |

**`athletes.data` si azzera per intero**, non campo per campo. È un dizionario
libero e negli anni ci è finito dentro di tutto — tutori, indirizzi, note,
contatti di emergenza. Un elenco di chiavi da ripulire sarebbe incompleto il
giorno dopo.

### 2.2 Dato sanitario

| Tabella | Finalità | Durata | Classe |
|---|---|---|---|
| `medical_certificates` | Idoneità all'attività: adempimento di legge in capo alla società | Fino a un anno dalla scadenza del certificato, salvo contenzioso | `delete` |
| `attachments` con categoria medica | Il file del certificato | Come sopra | `delete` |

Chi vede lo **stato** del certificato non vede per ciò stesso il **contenuto**
clinico ([`src/lib/health/permissions.ts`](../../src/lib/health/permissions.ts)):
la retention non cambia quel confine, lo eredita.

### 2.3 Documenti e file

| Tabella | Finalità | Durata | Classe |
|---|---|---|---|
| `attachments` + `attachment_blobs` | I byte di ogni documento depositato | Durata del rapporto, salvo obbligo fiscale sul documento collegato | `delete` |
| `document_requests` | Cosa la società ha chiesto a chi | Durata del rapporto | `delete` |
| `document_submissions` | Cosa la persona ha consegnato, e con quale esito | Durata del rapporto | `delete` |
| `generated_documents` | Attestazioni, ricevute non fiscali, tesserini emessi dalla società | Il documento è **in mano a qualcuno**: resta | `anonymize` |
| `form_submissions` | Iscrizioni e moduli compilati | Durata del rapporto | `delete` se riguarda solo quella persona; `anonymize` + **revisione manuale** se riguarda anche altri |

**La compilazione condivisa è l'unico caso che il codice non decide da solo.**
Le risposte sono un testo unico: cancellarla toglierebbe a un'altra famiglia il
proprio modulo, e lasciarla intera conserverebbe il dato di chi ha chiesto di
sparire. `eraseDataSubject` toglie la citazione e mette la riga in
`manualReview`. È un lavoro che una persona deve guardare.

### 2.4 Consensi

| Tabella | Finalità | Durata | Classe |
|---|---|---|---|
| `consent_definitions` | Configurazione societaria: quali consensi si chiedono | Permanente (non è un dato personale) | — |
| `consent_versions` | **Quale testo** è stato accettato. Non si aggiorna mai | Permanente (non è un dato personale) | — |
| `consent_records` | La decisione di una persona, append-only | Durata del rapporto | `delete` |

Il registro è append-only e **una revoca non cancella l'accettazione**: aggiunge
una riga. Serve a dimostrare che a settembre il consenso c'era, anche dopo la
revoca di gennaio. Ma quando la persona viene cancellata non resta niente da
dimostrare *su di lei*, e le righe spariscono con lei.

### 2.5 Denaro e documenti fiscali — `retain`

| Tabella | Finalità | Durata |
|---|---|---|
| `athlete_payments` | Posizione economica: quote e rate | Come i registri contabili |
| `payment_transactions` | Movimenti di denaro incassati | **10 anni** (conservazione delle scritture contabili) |
| `invoices`, `receipts`, `e_invoice_transmissions` | Documenti fiscali emessi | **10 anni** |
| `document_number_sequences` | La numerazione, che non arretra mai | Permanente |
| `accounting_entries` e proiezioni | Prima nota | Come i registri contabili |
| `sport_work_*` (compensi, rapporti, dichiarazioni) | Lavoro sportivo | Secondo gli obblighi del rapporto; il registro **non si cancella, si storna** |
| `funding_enrollments`, `funding_accruals`, `funding_settlement_lines` | Attribuzione di denaro pubblico, rendicontata a un ente | Come richiesto dal bando |

**Nessuna di queste si cancella e nessuna si anonimizza.** Un movimento di
denaro senza beneficiario è esattamente ciò che le guardie fiscali di
`resources.ts` esistono per impedire — `assertPaymentHasNoEconomicHistory`,
`assertDocumentNotIssued`, `assertAthleteHasNoSettledFunding`,
`assertClubHasNoFiscalHistory`. `previewDataSubjectErasure` le dichiara nel
riepilogo, con il motivo: chi chiede la cancellazione ha diritto di sapere cosa
**non** viene cancellato.

### 2.6 Comunicazioni

| Tabella | Finalità | Durata | Classe |
|---|---|---|---|
| `communication_deliveries` | «A chi è stato scritto, quando, con quale esito»: risponde alla famiglia che dice di non aver ricevuto niente | 24 mesi (proposto) | `anonymize` |
| `notifications` | Avvisi in applicazione | 12 mesi (proposto) | segue l'account (`Cascade` su `users`) |
| `announcements` / bacheca | Comunicazione societaria | Durata della stagione + archivio | non è un dato personale |

### 2.7 Eventi, presenze, appuntamenti

| Tabella | Finalità | Durata | Classe |
|---|---|---|---|
| `club_event_participants` | Convocazione, risposta della famiglia, presenza | Durata della stagione + archivio societario | `delete` |
| `appointments` + `appointment_slots` | Incontri con la segreteria | 24 mesi (proposto) | `delete` |

### 2.8 Accesso, sicurezza, audit

| Tabella | Finalità | Durata | Come si applica |
|---|---|---|---|
| `sessions` | Sessione attiva | Fino alla scadenza | Cancellate a orario da `runScheduledMaintenance` |
| `auth_verification_challenges` | Sfide OTP | Fino alla scadenza | Idem |
| `auth_rate_limit_buckets` | Contatori dei tentativi | Fino alla scadenza | Idem |
| `access_tokens`, `athlete_account_invites` | Inviti e riscatti | Fino a scadenza o revoca | Il token in chiaro **non è mai in archivio**: solo l'impronta (ADR-0085) |
| `payment_links` | Link di pagamento emessi | Fino a scadenza | `delete` |
| `audit_logs` | Chi ha fatto cosa, dove, quando, con quale esito | **`AUDIT_LOG_RETENTION_DAYS`**, e se non è impostata **conserva tutto** | `getAuditRetentionDays` / `purgeExpiredAuditEvents` |

> **`AUDIT_LOG_RETENTION_DAYS` non impostata significa «conserva tutto», ed è
> deliberato.** Il periodo di conservazione dell'audit è una decisione di
> prodotto e di compliance, non un valore predefinito che qualcuno scopre dopo
> aver perso dei dati. Va deciso **prima** della produzione, e questa riga è il
> posto in cui si scrive quale periodo è stato scelto.

---

## 3 — Il giro a orario

Le righe scadute non le legge nessuna schermata, quindi nessuna schermata le
pulirà mai: crescono e basta. `runScheduledMaintenance`
([`src/lib/server/maintenance.ts`](../../src/lib/server/maintenance.ts)) le
toglie, con un passo indipendente per tabella.

**Dalla Wave 6 un passo fallito lascia una riga di `audit_logs` con esito
`failure`** (`maintenance.step.failed`). Il rapporto della funzione è il corpo
HTTP della risposta, e a invocarla è il cron: nessuno lo legge. Un passo che
falliva ogni notte per tre settimane era invisibile fino alla telefonata di un
club.

---

## 4 — I diritti dell'interessato: come si esercitano

[`src/lib/server/data-subject.ts`](../../src/lib/server/data-subject.ts), e le
tre rotte sotto `/api/v1/data-subject`.

| Atto | Rotta | Chi |
|---|---|---|
| Riepilogo di cosa verrebbe distrutto | `GET /api/v1/data-subject/<id>` | proprietario o gestore |
| Export | `GET /api/v1/data-subject/<id>/export` | proprietario o gestore |
| Cancellazione | `DELETE /api/v1/data-subject/<id>` | proprietario o gestore |

**La cancellazione pretende il gettone del riepilogo.** È l'impronta del piano:
se l'inventario è cambiato da quando è stato mostrato — un certificato caricato
nel frattempo, una fattura emessa — il gettone non corrisponde e la
cancellazione non parte. Non è un meccanismo di sicurezza: è un meccanismo che
rende **impossibile cancellare senza aver visto**.

**Per un minore serve una conferma in più.** `acknowledgeMinor` è obbligatorio
quando l'inventario dice `isMinor`, e **un'anagrafica senza data di nascita si
tratta come minore**: in una società sportiva è quasi sempre un ragazzo
inserito in fretta, e il default prudente costa una conferma.

### 4.1 I sei indici polimorfi

Una persona non è una tabella. I dati di un atleta vivono su tabelle con una
chiave esterna — dove il database sa dove sono — e su **sei indici polimorfi**,
dove non lo sa:

| Indice | Tabella |
|---|---|
| `owner_type` / `owner_id` | `attachments` |
| `subject_kind` / `subject_id` | `consent_records` |
| `subject_kind` / `subject_id` | `document_requests` |
| `subject_kind` / `subject_id` | `document_submissions` |
| `subject_kind` / `subject_id` | `generated_documents` |
| `subjects` (JSON) | `form_submissions` |

Più tre colonne che citano un atleta senza chiave esterna:
`club_event_participants.athlete_id`, `payment_links.athlete_id`,
`communication_deliveries.athlete_ids`.

Prima della Wave 6, cancellare un atleta le lasciava **tutte** in piedi: i dati
del minore restavano in archivio senza più niente che li legasse a niente. È la
forma peggiore del difetto, perché il dato resta e la possibilità di trovarlo
no.

### 4.2 La guardia

`assertPersonalDataDisposed` è la gemella personale delle guardie fiscali di
`resources.ts`. Non impedisce di cancellare: impedisce di cancellare **prima**.
Copre le quattro tabelle indicizzate; `generated_documents` no (si anonimizza,
non si cancella: contarla renderebbe la guardia insuperabile) e
`form_submissions` no (il legame vive in un JSON e non esiste un indice che
risponda alla domanda — `eraseDataSubject` le percorre, la guardia non le vede,
e dirlo è meglio che far finta di coprirle).

---

## 5 — I log

Terza conseguenza di ADR-0019: «i log non devono contenere dati personali non
necessari». Prima della Wave 6 **non era presidiata da niente**.

**Regola.** Un log del server non passa mai l'errore intero. Il messaggio di un
errore di validazione dell'ORM non è un riassunto: contiene l'argomento
dell'invocazione. Su `user.create` vuol dire `password_hash`; sulla rotta
pubblica dei moduli vuol dire `answers` e `subjects`, cioè il modulo compilato
da un minore.

| Presidio | Dove |
|---|---|
| `reportServerError(error, { requestId, route })` — il punto unico, che riduce l'errore a nome, messaggio (prima riga) e codice, e passa i metadati da `sanitizeMetadata` | [`src/lib/server/observability.ts`](../../src/lib/server/observability.ts) |
| `x-request-id` generato e propagato, così due righe della stessa richiesta sono correlabili | [`src/middleware.ts`](../../src/middleware.ts) |
| Regola ESLint `no-console` (eccetto `error` e `warn`) su `src/app/**/*.tsx` e `src/components/**` | [`.eslintrc.json`](../../.eslintrc.json) |
| Test che vieta un `console.*(..., error)` nuovo su `src/app/api/**` e `src/lib/server/**`, con registro chiuso dei residui | `tests/server/log-senza-dati-personali.test.mjs` |

**Perché `error` e `warn` restano ammessi lato client.** Sono il canale con cui
una schermata dice che qualcosa non ha funzionato: toglierli renderebbe un
guasto più difficile da vedere senza rendere nessun dato più protetto. Ciò che
la regola toglie sono i circa centodieci `console.log` di debug che stampavano
anagrafiche intere — note di segreteria con nome del genitore, indirizzo,
telefono e nome del minore; l'elenco atleti; l'elenco soci; l'elenco staff —
nella console del browser di chiunque avesse la pagina aperta.

---

## 6 — Consensi e comunicazioni

La mappa «natura della comunicazione → consenso che la governa» vive in
[`src/lib/consents/catalog.ts`](../../src/lib/consents/catalog.ts) e in nessun
altro posto. La regola di prodotto è quella del
[§15.1 del piano](41-wave-6-planning.md#151-la-mappa-delle-comunicazioni):

| Natura | Consenso richiesto | Perché |
|---|---|---|
| Sicurezza | **No**, e ignora ogni revoca | Senza, l'account non è proteggibile |
| Amministrativa necessaria | No | Esecuzione del servizio richiesto |
| Pagamento | No | Esecuzione del contratto |
| Sanitaria | No, ma **contenuto cieco obbligatorio** | È un adempimento, non una comunicazione di dati sanitari |
| Sportiva | No | È il servizio |
| Marketing e generica | **Sì** (`marketing`) | È l'unico canale a testo libero |
| Immagini e media | **Sì** (`images`), quando esisterà | Nessun percorso di pubblicazione foto esiste oggi |

**Il meccanismo**: `requiredConsentKey` su `AudienceScope` e su
`resolveAudience`. Chi ha revocato esce dal pubblico con il motivo
`consent_revoked`, non in silenzio. Una classe assente dalla mappa passa sempre.

**Cosa blocca**: `revoked` e `rejected`. **Cosa non blocca**: `missing` — il
registro è in adozione, e trattare l'assenza di una riga come un diniego
spegnerebbe la comunicazione massiva di ogni club che non ha ancora raccolto
niente. La modalità opposta (`require_explicit`) è già implementata e si accende
con un parametro: **è quello il punto in cui una decisione legale diventa una
riga di configurazione e non una Wave.**

---

## Riferimenti

- [ADR-0019](18-decision-log.md#adr-0019--privacy-retention-e-audit-sono-bloccanti-per-la-produzione) — privacy, retention e audit sono bloccanti
- [ADR-0034](18-decision-log.md) — i byte degli allegati, e perché non un object storage proprietario
- [ADR-0085](18-decision-log.md) — un token non si archivia in chiaro
- [ADR-0090](18-decision-log.md) — il dominio dei consensi
- [06 — Modello dati](06-data-model.md)
- [14 — Sicurezza](14-security.md)
- [41 — Wave 6: planning](41-wave-6-planning.md) §15 e §16
