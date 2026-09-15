# Wave E — Audit di parità: Documenti (coda di revisione documentale)

> Inventario funzionale dell'implementazione V1 sul branch `feat/web-redesign`,
> scritto **prima** della migrazione al Web V2 (Addendum del brief). È il
> contratto di parità: niente sparisce. Nessuna proposta di design.
>
> Rotta coperta: `/documenti`. File: `src/app/documenti/page.tsx` (113 righe),
> `src/components/documents/document-review-inbox.tsx` (454), il dominio puro
> `src/lib/documents/review-queue.ts`, le rotte
> `src/app/api/v1/document-submissions/route.ts` e `[id]/route.ts` lette solo
> per capire **cosa il server accetta e rifiuta**; i test collegati.
>
> Metodo: lettura integrale della pagina, del componente, del modulo di
> dominio e delle due rotte; grep sui test.

---

## Indice

1. [`/documenti` — coda dei documenti da verificare](#documenti--coda-dei-documenti-da-verificare)
2. [Endpoint e librerie](#endpoint-e-librerie)
3. [Test collegati](#test-collegati)
4. [Inventario componenti](#inventario-componenti)
5. [Cosa **non** esiste in V1 (e quindi non si inventa)](#cosa-non-esiste-in-v1)
6. [Sintesi](#sintesi)

---

## `/documenti` — coda dei documenti da verificare

File: `src/app/documenti/page.tsx`. Guscio: `Sidebar` + `Header
title="Documenti"` (che monta gia `MobileTopBar` sotto i 1024 px: la pagina
**non** impila due barre, fissato da `navigazione-sotto-1024-e-768.test.mjs`),
`bg-slate-50`, `DashboardPageContainer max-w-6xl`, `SharedPageHeader
title="Documenti da verificare" subtitle="Cosa le famiglie hanno caricato,
cosa il club sta ancora aspettando, e cosa e stato deciso. Una decisione presa
non si riscrive: si chiede un altro file."`. Sotto, `<DocumentReviewInbox
canReview={canReview} />`.

### 1. Dati mostrati

Tipo `DocumentReviewRow` (`lib/documents/review-queue.ts`): `id, requestId,
submissionId, subjectKind, subjectId, subjectName, documentKind,
documentKindLabel, title, state (missing | overdue | under_review | approved |
rejected), source (parent | club | public_form), submittedByName, submittedAt,
decidedAt, decisionNote, dueDate, overdue, fileUrl, historyCount`.

Sorgente: `apiRequest("/api/v1/document-submissions?view=queue")` (piu
`subject_kind=athlete&subject_id=` quando il componente e montato con
`subjectId`, cosa che **nessuno** fa oggi: l'unico montaggio e la pagina).
Se `payload.error` → `rows = []` e `loadError = message || "Impossibile
leggere la coda dei documenti"`.

Per ogni riga (card in elenco verticale, `rounded-2xl border`):
- **nome dell'atleta** (`subjectName || "Atleta"`) in grassetto;
- badge di stato (`getReviewQueueStateLabel`: «In attesa di caricamento»,
  «Scaduto», «Da verificare», «Approvato», «Da integrare»; classi colore per
  stato in `getReviewQueueStateClassName`);
- badge rosso **«Scaduto»** aggiuntivo se `row.overdue` (anche quando lo stato
  e `under_review`: sono due fatti);
- riga `title · documentKindLabel`;
- riga meta: `Caricato il gg/mm/aaaa` (`toLocaleDateString it-IT 2-digit`) o
  `Nessun file consegnato`, ` da {submittedByName}`, ` ({Famiglia | Segreteria
  | Modulo pubblico})` da `ETICHETTA_SORGENTE`, ` · Scadenza gg/mm/aaaa`;
- se `state === "rejected" && decisionNote` → `Motivo: {decisionNote}` in
  ambra.

Intestazione della card elenco: `"Caricamento..."` oppure `"{n} documento|i"`
(conteggio delle righe visibili dopo filtro e ricerca).

### 2. Azioni

Barra: sette **pastiglie di filtro** (`REVIEW_QUEUE_FILTERS`, ognuna con il
suo conteggio da `countReviewQueue`): Nuovi · Da integrare · Certificati ·
Identita · Scaduti · Approvati · Tutti. Default `new`. Campo di **ricerca**
(placeholder «Atleta, documento, genitore», `searchReviewQueue`: nome
dell'atleta, titolo, etichetta del tipo, `getDocumentKindLabel`, chi ha
caricato). Pulsante **Ricarica** (icona `RefreshCw`, `sr-only` «Ricarica»).

Per riga (`reviewQueueActions(row)`):
- **Apri** (`canOpen = Boolean(fileUrl)`) → `openClientFileUrl(row.fileUrl)`
  (mai un `<a href>`: l'allegato puo essere un `data:` URL, presidio in
  `tests/lib/attachment-names.test.mjs`);
- **Approva** e **Rifiuta** (`canDecide = state === "under_review" &&
  Boolean(submissionId)`) → aprono la card di decisione in fondo alla pagina;
- `canRemind` (`missing | overdue`) **esiste nel dominio ma nessun pulsante lo
  usa**: la V1 non ha un sollecito da questa pagina (vedi §Cosa non esiste).

### 3. Form

**Card di decisione** (compare sotto l'elenco quando `decisione` e valorizzata):
- titolo `Approvi «{title}»?` oppure `Chiedi di rifare «{title}»`;
- sul rifiuto un riquadro spiega: «La richiesta torna aperta e la famiglia la
  ritrova fra le cose da fare, con il motivo che scrivi qui sotto. E la stessa
  cosa che chiedere un'integrazione.» (PP-02 §H: «Rifiuta» e «richiedi
  integrazione» sono **una** transizione, fissato in `pp-02-superfici.test.mjs`);
- campo `Textarea`: sul rifiuto **«Motivo, obbligatorio»** (placeholder «Cosa
  deve rifare la famiglia: senza questo, ricarica lo stesso file.», 3 righe);
  sull'approvazione **«Nota, facoltativa»** (2 righe). Valore iniziale `""`,
  azzerato a ogni apertura;
- **Conferma** (`"Invio..."` mentre invia; disabilitato se `inCorso` o se
  rifiuto senza motivo) e **Annulla**.

Validazione client: rifiuto senza motivo → toast `"Il motivo del rifiuto e
obbligatorio"`. Server: `explainDocumentDecisionNoteDenial` (stesso vincolo).

Submit: `apiRequest("/api/v1/document-submissions/{submissionId || id}",
{ method: "POST", body: { decision, note: motivo.trim() || null } })`. Errore
→ toast `payload.error.message || "Decisione non riuscita"`. Successo → toast
`"Documento approvato"` / `"Documento rifiutato"`, chiusura della card,
ricarica della coda.

### 4. Filtri / ricerca / ordinamento / viste

Sette pastiglie (vedi §2), **una sola attiva**; ricerca libera; nessun
ordinamento configurabile (ordine del server); nessuna vista salvata; niente
persistito.

### 5. Selezione multipla / azioni di massa

Nessuna.

### 6. Export / import

Nessuno.

### 7. Permessi / ruoli

- Rotta senza layout di area dedicato (`src/app/documenti/` non ha
  `layout.tsx`): il cancello e in pagina.
- `canReview = chiaviNonRisolte || (roleHasPermission(role,
  "documents.review") && roleHasPermission(role, "documents.read_dossier"))`,
  con `role = activeClub?.role || userRole` e `chiaviNonRisolte =
  parseCustomRoleValue(role)` valorizzato **con zero chiavi** (un ruolo
  personalizzato di cui il client conosce solo lo slug: si lascia decidere la
  rotta, che le chiavi le ha davvero). Le due chiavi sono le stesse che il
  servizio pretende (`listDocumentReviewQueue`).
- Senza `canReview`: card «Accesso negato: la coda dei documenti da
  verificare la vede chi li verifica.» e nessuna chiamata.
- Approva/Rifiuta non hanno un secondo predicato: `canDecide` e di stato, il
  permesso e quello della pagina (`documents.review`, ruoli `GESTIONE`).

### 8. Stati

- **Loading**: titolo card `"Caricamento..."`, nessuno scheletro.
- **Errore di lettura**: card rossa «La coda non e stata caricata.» +
  messaggio; l'elenco resta vuoto ma distinguibile (W6-44).
- **Vuoto (dopo filtro/ricerca)**: «Nessun documento in questa vista.» (non
  distingue «nessuna richiesta nel club» da «filtro senza risultati»).
- **Stato per riga** (`ETICHETTE`): `missing` «In attesa di caricamento»,
  `overdue` «Scaduto», `under_review` «Da verificare», `approved`
  «Approvato», `rejected` «Da integrare»; ripiego «Da verificare».
- **Badge «Scaduto»** aggiuntivo su `overdue === true`.
- **Invio in corso**: `"Invio..."` sul pulsante.

### 9. Flussi distruttivi

Nessuna cancellazione. La **decisione** e irreversibile (tabella append-only:
«una decisione presa non si riscrive»), ma e un atto del lavoro quotidiano e
in V1 si conferma con **Conferma** nella card (nessun modale). Il rifiuto
chiede il motivo prima.

### 10. Navigazione e parametri

In entrata: nessun parametro letto (`?subject_id` non e letto dalla pagina).
In uscita: solo l'apertura del file in una nuova finestra. Voce di menu in
`SEGRETERIA › Documenti` (`navigation.ts`) e nel menu mobile.

### 11. Schede/sezioni

Nessuna: elenco piatto con la card di decisione in fondo.

### 12. Test collegati

- `tests/ui/pp-02-superfici.test.mjs` §H — legge
  `components/documents/document-review-inbox.tsx`: deve contenere «che
  chiedere un&apos;integrazione» e «Motivo, obbligatorio»; legge
  `lib/documents/review-queue.ts` per le sei chiavi di filtro (dominio, non
  toccato).
- `tests/ui/navigazione-sotto-1024-e-768.test.mjs` — `/documenti` in
  `VOCI_MOBILE_CLUB`; «Documenti non impila piu due barre»: `<Header
  title="Documenti" />` presente, nessun `<MobileTopBar`.
- `tests/lib/coda-documenti-club.test.mjs` — dominio puro
  `review-queue.ts` (non toccato).
- `tests/web/shell-navigation.test.mjs` — `/documenti` fra le destinazioni.

### 13. Inventario componenti

Pagina: `Header, Sidebar, DashboardPageContainer, dashboardMainClassName,
SharedPageHeader, useAuth, parseCustomRoleValue, roleHasPermission,
DocumentReviewInbox`. Componente: `Badge, Button, Card*, Input, Textarea,
useToast (toast-notification), apiRequest, openClientFileUrl, cn,
REVIEW_QUEUE_FILTERS, countReviewQueue, filterReviewQueue,
getReviewQueueStateClassName, getReviewQueueStateLabel, reviewQueueActions,
searchReviewQueue`.

Specifici della rotta (si rimuovono dopo la parita):
`document-review-inbox.tsx` (usato **solo** da `/documenti`; la prop
`subjectId` non e montata da nessuno). `getReviewQueueStateClassName`
(classi Tailwind V1 nel dominio) resta nel modulo puro perche il test di
dominio lo esporta; la V2 non lo usa.

---

## Endpoint e librerie

| Chiamata | Endpoint | Permesso server |
|---|---|---|
| lettura della coda | `GET /api/v1/document-submissions?view=queue[&subject_kind=&subject_id=]` | `documents.review` + `documents.read_dossier` (`listDocumentReviewQueue`) |
| decisione | `POST /api/v1/document-submissions/{submissionId \| requestId}` `{ decision: "approved" \| "rejected", note }` | `documents.review`; il motivo e obbligatorio sul rifiuto |
| apertura del file | `openClientFileUrl(row.fileUrl)` | l'URL e gia autenticato/`data:` |

Esistono anche `PATCH /api/v1/document-requests/:id { action: "remind" }`
(`remindDocumentRequest`, soglia di sei ore) e la creazione di richieste
(`POST /api/v1/document-requests`): **nessun componente client le chiama**
(grep su `src/`), quindi non fanno parte della parita di questa pagina.

## Test collegati

Vedi §12.

## Inventario componenti

Vedi §13.

## Cosa non esiste in V1

- **Sollecito** («Invia promemoria», «Richiedi al parent» della guideline 09
  §9.6): il dominio espone `canRemind` e il server ha la rotta, ma la V1 non
  ha il pulsante. Non si inventa; si segnala al lead come capacita
  irraggiungibile (CLAUDE.md §11.8).
- **Richiesta di un documento** da questa pagina: non c'e.
- **Deep link** `?subject_id=`: la prop esiste, nessuna URL la alimenta.
- Nessun export, nessuna selezione, nessuna vista salvata.

## Sintesi

1. Una rotta, una lettura (`view=queue`), una scrittura (la decisione).
2. Sette filtri di dominio con conteggi, una ricerca libera, un ricarica.
3. Tre azioni per riga (Apri, Approva, Rifiuta) governate da
   `reviewQueueActions`; la decisione chiede il motivo sul rifiuto e spiega
   che rifiutare e chiedere un'integrazione.
4. Cancello client `documents.review` + `documents.read_dossier`, con il
   ripiego «lascia decidere la rotta» per un ruolo di club senza chiavi.
5. Stati: cinque della riga + «Scaduto» come fatto aggiuntivo; nessuna parola
   di `CERTIFICATE_STATUS` dice «Da integrare» o «In attesa di caricamento».
