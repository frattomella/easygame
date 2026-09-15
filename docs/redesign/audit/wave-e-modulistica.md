# Wave E — Audit di parità: Modulistica (modelli di documento e moduli online)

> Inventario funzionale dell'implementazione V1 sul branch `feat/web-redesign`,
> scritto **prima** della migrazione al Web V2 (Addendum del brief). È il
> contratto di parità: niente sparisce. Nessuna proposta di design.
>
> Rotta coperta: `/modulistica`. File: `src/app/modulistica/page.tsx` (2103
> righe), `src/components/forms/forms-dashboard.tsx` (717),
> `src/components/forms/DocumentEditor.tsx` (1178, editor visuale),
> `src/components/documents/BulkGenerationDialog.tsx` (855),
> `src/components/documents/{document-bundle,bulk-generation}.ts` (dominio
> puro), il client `src/lib/api/documents.ts` e `src/lib/api/forms.ts`, i
> permessi `src/lib/documents/permissions.ts` e `src/lib/forms/permissions.ts`,
> il catalogo `src/lib/forms/catalog.ts`; i test collegati.
>
> Metodo: lettura integrale della pagina, del cruscotto dei moduli online e
> delle firme dei tre componenti grandi; grep sui test.

---

## Indice

1. [Guscio, permessi e schede](#guscio-permessi-e-schede)
2. [Scheda «Documenti / Template»](#scheda-documenti--template)
3. [Scheda «Catalogo»](#scheda-catalogo)
4. [Scheda «Moduli online»](#scheda-moduli-online)
5. [Scheda «Ritirati»](#scheda-ritirati)
6. [Scheda «Documenti generati»](#scheda-documenti-generati)
7. [L'editor di un modello](#leditor-di-un-modello)
8. [I dialoghi](#i-dialoghi)
9. [Endpoint e librerie](#endpoint-e-librerie)
10. [Test collegati](#test-collegati)
11. [Inventario componenti](#inventario-componenti)
12. [Cosa **non** esiste in V1](#cosa-non-esiste-in-v1)
13. [Sintesi](#sintesi)

---

## Guscio, permessi e schede

`ModulisticaPageWithLayout`: `Sidebar` (`hidden lg:block`) + `Header
title="Modulistica"` (`hidden lg:block`) **piu** `MobileTopBar` (`lg:hidden`)
— la pagina e l'ultima in `DOPPIA_BARRA_NOTA` di
`navigazione-sotto-1024-e-768.test.mjs`; `responsive-invariants.test.mjs`
pretende `<MobileTopBar />` e `className={dashboardMainClassName}` (intento:
un guscio solo, niente `LayoutWithMobileNav`). Corpo `bg-gray-50`,
`DashboardPageContainer`, `SharedPageHeader title="Modulistica"
subtitle="Gestisci documenti, moduli e file condivisi del club."`.

### 7. Permessi (chiavi esatte)

- `canManage = canManageDocumentTemplates(activeRole)` =
  `canManageClubConfigurationAsActor` (direzione) → creare, modificare,
  pubblicare, ritirare, eliminare, adottare dal catalogo, vedere la scheda
  «Catalogo».
- `canRead = canReadDocumentTemplates(activeRole)` (gestione) → le quattro
  schede documentali e il caricamento dei modelli.
- `canReadForms = canReadClubForms(activeRole)` = `canAccessClubResource(role,
  "forms", "read")` → scheda «Moduli online». `canManageClubForms` (`"create"`)
  esiste ma la pagina **non** lo usa: i pulsanti dei moduli online si vedono a
  chiunque legga (il server decide).
- `canOpenPage = canRead || canReadForms`. Senza `clubId` → «Nessun club
  attivo: scegline uno dal menu in alto.»; senza `canOpenPage` → «I modelli di
  documento e i moduli online li vede chi lavora nella segreteria del club.»
- Rotta in `MANAGEMENT_PATHS`, layout `management-area-layout`
  (`canAccessPath`: owner, club_manager, collaborator, staff si; trainer,
  parent no — `document-permissions.test.mjs`).

### 11. Schede

`availableTabs` in ordine: `documents` (canRead), `catalog` (canManage),
`online-forms` (canReadForms), `retired` e `generated` (canRead).
`currentTab` **si ricava** (`availableTabs.includes(activeTab) ? activeTab :
availableTabs[0]`); default `documents`. Nessun parametro URL per la scheda.
Vista alternativa `activeView: "list" | "editor"`.

### 10. Navigazione e parametri

`?action=new` → apre il dialogo «Nuovo Documento» e viene tolto dall'URL con
`history.replaceState` (azioni rapide). Nessun altro parametro. In uscita:
`/api/v1/documents/generated/{id}?format=html` in nuova scheda.

---

## Scheda «Documenti / Template»

### 1. Dati mostrati

`listedTemplates = templates.filter(status !== "retired")`, griglia di card
1/2/3 colonne. Per card: titolo, descrizione (o `Parla di: {soggetto}`),
`TemplateStateLine`: badge di stato (`STATUS_LABELS`: Bozza / Attivo /
Ritirato), «Versione {n} del {data}» o «Mai pubblicato», badge «Modifiche non
pubblicate» se `hasUnpublishedChanges`, «{n} documento/i prodotti» se
`generatedCount > 0`.

Sopra l'elenco, se `interruptedBatch && !bulkTarget`: card ambra «Un lotto di
«{templateTitle}» e rimasto a meta» + «{servedSubjectIds.length} di
{subjects.length} serviti. Riprendendolo si generano solo i mancanti: i
documenti gia prodotti non si duplicano.» con **Riprendi** e **Scarta**.

### 2. Azioni

Intestazione: **Nuovo Documento** (solo `canManage`, solo in vista elenco e
scheda `documents`); in vista editor **Torna alla lista**.

Per card: pulsante **Genera documento** (se `canProduceFilled(template)` =
`status !== "retired" && publishedVersion > 0`) altrimenti **Stampa il modulo
vuoto** → dialogo «Genera documento»; **Genera per piu atleti** (solo `status
=== "active" && subjectKind === "athlete"`) → `openBulkDialog`; **Modifica il
testo** (`canManage`) → editor. Menu `···` (`aria-label="Azioni su {title}"`,
solo `canManage`): Modifica, Pubblica, Riattiva (se retired) / Ritira (se
active) / niente (se draft: «si pubblica, e da li si ritira»), Elimina (rosso).

`openBulkDialog`: rilegge `readStoredBatch()`; se un lotto in sospeso ha
servito tutti lo butta; se ne ha uno a meta → toast `"Un lotto di «{title}» e
rimasto a meta: riprendilo o scartalo prima di cominciarne un altro"` e non
apre. `resumeBulkBatch`: se il modello non c'e piu → `clearStoredBatch` +
toast `"Il modello di quel lotto non c'e piu: il lotto e stato scartato"`.

### 8. Stati

Loading: `AppLoadingScreen subtitle="Caricamento documenti del club..."`
dentro la scheda (W6-43: nessun `return` su loading prima dei Tabs). Vuoto:
«Nessun modello salvato» + «Crea un nuovo documento e modificalo direttamente
nel foglio visuale, senza scrivere HTML.» + **Nuovo Documento** (canManage).
Errore di lettura: toast `templatesResult.error` (l'elenco resta vuoto: non
distinguibile) / `"Errore nel caricamento dei modelli"`.

### 9. Flussi distruttivi

**Elimina** → dialogo «Eliminare «{title}»?»: se `generatedCount > 0` «Questo
modello ha gia prodotto {n} documento/i: si ritira, non si cancella, o quei
documenti non saprebbero piu spiegarsi.» e **Elimina** disabilitato;
altrimenti «Il modello non ha prodotto nessun documento: si puo eliminare.
L'operazione non si annulla.» → `deleteDocumentTemplate` → toast «Modello
eliminato» / errore del server. **Ritira** (nessuna conferma) →
`saveDocumentTemplateDraft(id, { status: "retired" })` → toast «Modello
ritirato: non produce documenti nuovi, e continua a spiegare quelli gia
prodotti»; **Riattiva** → «Modello riattivato».

---

## Scheda «Catalogo»

Solo `canManage` (anche il caricamento: `canManage ? listDocumentCatalog() :
[]`). Card «Catalogo dei modelli» / «Modelli scritti da EasyGame che il club
puo adottare. Adottarne uno ne crea una **copia del club**, gia pubblicata: da
quel momento si modifica liberamente e il catalogo non la tocca piu.»

Per voce (`DocumentCatalogEntry`): titolo, descrizione, chip «Parla di:
{soggetto}», chip classe (`CATALOG_CLASS_LABELS`: «Classe A — dice fatti del
gestionale», B «modulo di un ente terzo», C «contenuto legale o fiscale»),
«Del testo risponde {editorialOwner} — riletto il {lastReviewedAt}». A destra:
badge «Gia fra i modelli del club» se `adopted`, altrimenti **Adotta**
(`"Adozione..."`, disabilitato mentre un'adozione e in corso) →
`adoptCatalogEntry(key)` → toast `«{title}» adottato: e gia pubblicato, lo
trovi fra i modelli del club`; la voce diventa `adopted`.

Stati: «Caricamento del catalogo...», «Nessun modello disponibile nel
catalogo.», e in coda «Il club ha gia adottato tutto quello che il catalogo
distribuisce.» quando `adoptableCatalog.length === 0`.

---

## Scheda «Moduli online»

`<FormsDashboard />`, autonomo (non dipende dal `loading` documentale). Tre
schede interne: **Moduli** · **Da esaminare (N)** (N = somma di
`pendingCount`) · **Modelli consigliati**.

### Moduli

Azioni: **Nuovo modulo** (`create("blank")` → `createFormTemplate("blank")`,
poi apre il builder), **Mostra/Nascondi archiviati** (`includeArchived` →
rilettura con `?include_archived=1`).

Per riga (`FormTemplateSummary`): titolo (clic → `open(id)` →
`fetchFormTemplate` → `FormBuilder`), meta «{fieldCount} campi · versione {n}
· {soggetti da FORM_SUBJECTS} · aggiornato il {updatedAt}», chip «Da modello
EasyGame: {titolo}» se `catalogKey` e nel catalogo; badge «{pendingCount} da
esaminare» (ambra), «Modifiche non pubblicate» (azzurro), stato
(`FORM_STATUS_LABELS`: Bozza / Pubblicato / Archiviato). Menu `···`
(`aria-label="Azioni su {title}"`): **Duplica** → toast «Modulo duplicato»;
**Ripristina** (se archived) → «Modulo ripristinato come bozza» / **Archivia**
→ «Modulo archiviato»; **Elimina** → `deleteForm`; se `result.archived` toast
info «Il modulo ha gia delle compilazioni: e stato archiviato invece che
cancellato.», poi «Modulo eliminato». **Nessuna conferma** prima di eliminare.

Stati: `ListSkeleton rows=3`; errore → `LoadFailure` (icona, messaggio,
**Riprova**), con l'elenco **buttato** (`setTemplates([])`); vuoto → «Nessun
modulo, per ora» + «“Iscrizione online” e gia scritto: lo trovi in **Modelli
consigliati**, con link pubblico, dati dell'atleta, contatti del genitore,
documenti e consenso.»

### Da esaminare

Filtri (pulsanti): Da esaminare (`pending`, default) · Approvate · Rifiutate ·
Tutte → `fetchFormSubmissions({ status, limit: 50 })`. Per riga
(`FormSubmissionRecord`): nome (`subjects.find(label) || respondentName ||
respondentEmail || "Compilazione senza nome"`), meta «{templateTitle} ·
versione {n} · {submittedAt}», badge stato (`FORM_SUBMISSION_STATUS_LABELS`:
Da esaminare / Approvata / Rifiutata), **Esamina** → `SubmissionReviewDialog`
(condiviso con la scheda atleta tramite `compile-form-dialog`: **non si
riscrive**). Stati: skeleton, `LoadFailure` con Riprova, vuoto «Niente in coda»
+ «Le compilazioni arrivate compaiono qui prima di toccare l'anagrafica.»

### Modelli consigliati

`DISTRIBUTABLE_FORM_CATALOG` (classe A attive). Per voce: titolo, descrizione,
chip classe (`FORM_CATALOG_CLASS_LABELS`: «Classe A — campi che EasyGame sa gia
leggere e scrivere» …), chip «Iscrizione e rinnovo» se `purpose ===
"enrollment"`, «Del contenuto risponde {editorialOwner} — riletto il {data}»,
`<details>` «Cosa chiede questo modulo» con l'elenco dei campi di
`buildFormFromCatalog(entry).fields` («· {label} (obbligatorio)»). A destra:
«Gia fra i moduli del club» se `adoptedCatalogKeys.has(key)`, altrimenti **Usa
modello** (`"Adozione..."`) → `create(entry.key)`.

### Il builder

`FormBuilder` (`src/components/forms/form-builder.tsx`, 704 righe) con
`form-field-card`, `dynamic-field-picker`, `form-public-link`,
`form-renderer`: e l'editor del modulo (campi, impostazioni, link pubblico,
pubblica/ripristina). **Non fa parte di questa migrazione**: e un editor di
dominio con i suoi test (`forms-builder.test.mjs`) e si riusa cosi com'e.

---

## Scheda «Ritirati»

Card «Modelli ritirati» / «Un modello ritirato non produce documenti nuovi, e
continua a spiegare quelli che ha gia prodotto. Per questo si ritira invece
di cancellarlo.» Per riga: titolo + `TemplateStateLine`; se `canManage`:
**Riattiva**, **Elimina** (stesso dialogo). Stati: «Caricamento...», «Nessun
modello ritirato.»

---

## Scheda «Documenti generati»

Card «Documenti generati» / «Cio che il club ha prodotto. Aprirne uno lo
mostra **com'era**: non viene rigenerato, perche modificare un modello non
cambia un documento gia consegnato.» Tabella (`overflow-x-auto`, `min-w-[640px]`):
Modello · Versione (`v{n}`) · Soggetto (`subjectLabel || subjectKind`) · Data
(`generatedAt`) · Stato (`GENERATED_STATUS_LABELS`: generated «Generato»,
issued «Consegnato», awaiting_signature «In attesa di firma», signed «Copia
firmata rientrata», rejected «Respinto», archived «Archiviato») · **Apri**
(`<a target=_blank href="/api/v1/documents/generated/{id}?format=html">`).
Lettura `listGeneratedDocuments({ limit: 100 })`. Vuoto: «Nessun documento
generato: parti da un modello pubblicato e usa «Genera compilato».»

Non ci sono filtri, ricerca, ordinamento ne azioni oltre «Apri» (in
particolare **non** si carica la copia firmata da qui: `documents.generated.advance`
non ha una porta in questa pagina).

---

## L'editor di un modello

`activeView === "editor"` con `editorTemplate: DocumentTemplateDetail` (da
`getDocumentTemplate(id)`; errore → toast `error || "Modello non trovato"`).
Intestazione: titolo, descrizione, `TemplateStateLine`; a destra **Di chi
parla** (`Select` su `SUBJECT_LABELS`: club «La societa», athlete «Un atleta»,
person «Una persona dello staff», member «Un socio»; valore iniziale
`detail.subjectKind`), **Pubblica** (`"Pubblicazione..."`, disabilitato se
`publishing || savingDraft`). Riga: «**Salva** scrive la bozza e non cambia
nessun documento gia prodotto. **Pubblica** crea una versione, e i documenti
generati da quel momento la citeranno per sempre: pubblica dopo aver
salvato.» Card «Versioni pubblicate» se `versions.length`: «Versione {n} —
{data} — {title}».

`<DocumentEditor initialContent={draftContent} onSave={handleSaveDraft}
onCancel={handleBackToList} readOnly={!canManage} subject={editorSubject} />`
(1178 righe: foglio visuale, barra, segnaposto per soggetto
`listPlaceholderTokensForSubject(subject)`). **Si riusa cosi com'e.**

- `handleSaveDraft(content)` → `saveDocumentTemplateDraft(id, { content,
  subjectKind: editorSubject })` → toast «Bozza salvata. I documenti gia
  prodotti non cambiano: per farla valere, pubblicala» / errore.
- `handlePublish(id)` → `publishDocumentTemplate(id)`; se `issues.length` →
  dialogo «Questo modello non si puo pubblicare» (elenco `issue.key` in
  monospazio + `issue.message`, pulsante **Ho capito**), altrimenti toast
  `error || "Errore nella pubblicazione del modello"`; successo → toast
  «Pubblicata la versione {n}».

---

## I dialoghi

### «Nuovo Documento» (3 campi)

Titolo (`Input`, placeholder «Inserisci il titolo del documento», obbligatorio),
Descrizione (`Input`, «Inserisci una breve descrizione»), Di chi parla
(`Select` `SUBJECT_LABELS`, default `athlete`, nota `SUBJECT_HINT`: «Il
soggetto decide quali dati il modello sapra scrivere: un modello che parla di
un atleta non ha un allenatore a cui riferirsi, e quei campi resterebbero
bianchi.»). **Annulla** / **Crea** (`"Creazione..."`, disabilitato senza
titolo). Validazione: titolo vuoto → toast «Inserisci il titolo del
documento». Submit `createDocumentTemplate({ title, description, subjectKind,
content: "<h1>{title}</h1><p>Inserisci il contenuto qui.</p>" })` → toast
«Nuovo modello creato: e una bozza, finche non lo pubblichi» → apre l'editor.

### «Genera documento»

Titolo del modello; testo «**Genera vuoto** stampa il modulo da compilare a
mano. **Genera compilato** scrive dentro i dati dell'atleta, del club e della
cassa: serve un atleta, e serve un modello pubblicato.» Avvisi ambra (uno):
soggetto ≠ athlete «Questo modello parla di {soggetto}: da qui si stampa
vuoto. Il compilato parte da un atleta.»; `retired` «Questo modello e
ritirato: … Da qui esce solo il modulo vuoto; per generare di nuovo,
riattivalo.»; `publishedVersion === 0` «Questo modello non e mai stato
pubblicato: **Genera vuoto** stampa la bozza, e il compilato non si puo ancora
produrre.»; `hasUnpublishedChanges` «Questo modello ha modifiche non
pubblicate: **Genera vuoto** stampa la **bozza**, mentre i documenti compilati
continuano a citare la versione {n}. Pubblica prima, se il foglio di carta deve
dire la stessa cosa.» Ricerca atleta («Cerca per nome o cognome...») + `Select`
atleta («Seleziona un atleta (solo per il compilato)»; voce disabilitata
«Nessun atleta trovato» / «Nessun atleta disponibile»). Piede: **Annulla**,
**Genera vuoto**, **Genera compilato** (disabilitato se `generatingFilled ||
!selectedAthlete || subjectKind !== "athlete" || !canProduceFilled`, `title`
«Serve un modello pubblicato e non ritirato»).

- **Genera vuoto**: `openBundleWindow()` **prima** dell'`await` (altrimenti il
  browser la blocca) → `getDocumentTemplate` → `renderBundleInto(finestra,
  buildDocumentBundleHtml({ title, printLabel: "Stampa il modulo", documents:
  [{ html: renderBlankFormHtml({ title, bodyHtml:
  renderBlankTemplateForPdf(draftContent) }) }] }))`. Stampa la **bozza**.
  Errori: «Il browser ha bloccato la finestra di stampa», `error || "Modello
  non trovato"`.
- **Genera compilato**: `previewFilledDocument({ templateId, athleteId,
  seasonId: activeSeasonId })` (`GET /api/v1/documents/filled`) → apre
  l'anteprima. Errori: «Seleziona prima un atleta», `error || "Errore nella
  generazione del documento"`.

### Anteprima del compilato

Titolo `preview.title`. Riquadro ambra con `warnings[]`; «Dati mancanti:
restano campi da riempire a mano» + `missing.map(describePlaceholderKey)`;
«Segnaposto non riconosciuti: restano vuoti» + `unresolved`; se niente di
tutto cio «Tutti i segnaposto del modello sono stati compilati.»; `<iframe
sandbox="" srcDoc={html}>` alto 256px. Piede: **Annulla**, **Stampa
l'anteprima** (`printDocumentPage` → `openPrintableBundle(buildDocumentBundleHtml({
printLabel: "Stampa il documento" }))`, errore «Il browser ha bloccato la
finestra di stampa»), **Produci il documento** (`"Produzione..."`) →
`generateDocuments({ templateId, subjects: [{ kind: "athlete", id }],
seasonId })`; `outcome.failed[0]` → toast `reason`; successo → scheda
«generated», rilettura dei generati, toast «Documento prodotto: lo trovi in
«Documenti generati»».

### Genera per piu atleti (`BulkGenerationDialog`)

Montato con `key` per lotto, `template, athletes (bulkAthletes: id + label),
seasonId, resume, onClose (closeBulkDialog → rilegge lo storage),
onCompleted (refreshAfterBulk: rilegge modelli e generati senza `loading`)`.
Quattro stadi interni: `select` (ricerca, `SelectAllCheckbox` «gli atleti in
elenco», `SelectRowCheckbox`, contatore) → `preview` («Stai per generare {n}
documenti, in {k} chiamate da al piu 50», campione con «questi campi restano
bianchi») → `running` (fette da `BULK_GENERATION_SLICE` = 50, stato in
`sessionStorage`, ripresa dopo F5, `retryFailures`) → `done` («Non generati, e
il motivo», «Riprova i {n} falliti», «Apri il fascicolo da stampare» con
`planBundleParts` e «Il fascicolo supera …»). E la sei-passi della guideline 07
§7.7 gia scritta; **si riusa cosi com'e** (i suoi test statici lo leggono
riga per riga).

### «Eliminare «{title}»?» — vedi §9 della scheda Documenti.

---

## Endpoint e librerie

| Funzione client | Endpoint | Permesso server |
|---|---|---|
| `listDocumentTemplates({ includeRetired: true })` | `GET /api/v1/documents/templates?include_retired=1` | `documents.templates.read` |
| `getDocumentTemplate(id)` | `GET /api/v1/documents/templates/{id}` | idem |
| `createDocumentTemplate` | `POST /api/v1/documents/templates` | `documents.templates.manage` |
| `saveDocumentTemplateDraft(id, { content, subjectKind \| status })` | `PATCH /api/v1/documents/templates/{id}` | idem |
| `publishDocumentTemplate(id)` | `POST /api/v1/documents/templates/{id}/publish` (`issues[]` sull'errore) | idem |
| `deleteDocumentTemplate(id)` | `DELETE /api/v1/documents/templates/{id}` (rifiuta se ha prodotto) | idem |
| `listDocumentCatalog()` / `adoptCatalogEntry(key)` | `GET` / `POST /api/v1/documents/catalog` | idem |
| `previewFilledDocument` | `GET /api/v1/documents/filled?templateId&athleteId&seasonId` | `documents.generate` + sensibilita |
| `generateDocuments` | `POST /api/v1/documents/generated` (≤ 50 soggetti) | idem |
| `listGeneratedDocuments({ limit: 100 })` | `GET /api/v1/documents/generated?limit=100` | `documents.generated.read` |
| apertura di un generato | `GET /api/v1/documents/generated/{id}?format=html` | idem |
| `getClubAthletes(clubId)` (`simplified-db`) | atleti per il compilato e il lotto | risorsa `athletes` |
| `formsApi.fetchFormTemplates({ includeArchived })` | `GET /api/v1/forms[?include_archived=1]` | risorsa `forms` read |
| `fetchFormTemplate(id)` | `GET /api/v1/forms/{id}` | idem |
| `createFormTemplate(starter)` | `POST /api/v1/forms { starter }` | `forms` create |
| `duplicateForm` / `archiveForm` / `restoreForm` | `PATCH /api/v1/forms/{id} { action }` | idem |
| `deleteForm(id)` | `DELETE /api/v1/forms/{id}` → `{ deleted, archived }` | idem |
| `fetchFormSubmissions({ status, limit: 50 })` | `GET /api/v1/forms/submissions?status=&limit=50` | `forms` read |

Dominio puro riusato: `applyPlaceholderValues`, `describePlaceholderKey`,
`normalizePlaceholderKey`, `DOCUMENT_SIGNATURE_TOKENS` (`lib/documents/placeholders`),
`renderBlankFormHtml` (`lib/documents/document-view`), `buildDocumentBundleHtml`,
`openBundleWindow`, `openPrintableBundle`, `renderBundleInto`
(`components/documents/document-bundle.ts`), `clearStoredBatch`,
`pendingSubjects`, `readStoredBatch` (`components/documents/bulk-generation.ts`).

## Test collegati

- `tests/ui/modulistica-template-lifecycle.test.mjs` — legge `page.tsx`
  (senza commenti), `DocumentEditor.tsx`, `lib/api/documents.ts`,
  `document-view.ts`: nessuna funzione sui modelli da `simplified-db` (ma
  `getClubAthletes` importato da li), i nove gesti del client documentale,
  niente `apiRequest`/`fetch` in pagina, residui DOC-02/DOC-03/IA assenti,
  «Bozza/Attivo/Ritirato/Modifiche non pubblicate», `issues` e `issue.key`,
  «Ritira» e non «Archivia», `deleteTarget.generatedCount > 0`,
  `newDocumentSubject` + `SUBJECT_HINT` + quattro soggetti,
  `editorTemplate.versions.map`, anteprima prima di produzione con
  `filledPreview.{missing,unresolved,warnings}` e «Dati mancanti: restano
  campi da riempire a mano», link `?format=html`, catalogo (`entry.catalogClass`,
  `entry.editorialOwner`, `formatDate(entry.lastReviewedAt)`, `entry.adopted ?`,
  scheda solo `canManage`), modulo vuoto (`renderBlankTemplateForPdf`,
  `applyPlaceholderValues({ content, rendered: BLANK_SIGNATURE_HTML })`,
  `template.draftContent`, i tre avvisi), niente `@page`/`794px`,
  `openBundleWindow()` / `renderBundleInto(` / `openPrintableBundle(`,
  `aria-label` del menu, `canProduceFilled`, etichette «Genera documento» /
  «Stampa il modulo vuoto», `describePlaceholderKey` dal proprietario,
  `subject={editorSubject}`, responsive (nessun `grid-cols-2/3` nudo,
  `TabsList` flex-wrap, `DialogFooter` impilati).
- `tests/ui/modulistica-schede-e-stati.test.mjs` — `page.tsx` e
  `forms-dashboard.tsx`: `canReadClubForms` importato, `canReadForms =`,
  `TabsTrigger` condizionati, `canOpenPage = canRead || canReadForms`, `if
  (!clubId || !canOpenPage)`, frase del diniego, `availableTabs`/`currentTab`,
  niente `if (loading) { return`, `<FormsDashboard />` senza `loading`,
  `documentsLoading ? (` + `AppLoadingScreen`; nel cruscotto i tre stati
  `templatesState.status`/`submissionsState.status`, «Nessun modulo, per ora»,
  «Niente in coda», `LoadFailure` + `onRetry`, `setTemplates([])` prima
  dell'errore, «Modelli consigliati», `<TabsTrigger value="modelli">`,
  `DISTRIBUTABLE_FORM_CATALOG`, `FORM_CATALOG_CLASS_LABELS`,
  `entry.editorialOwner`, `entry.lastReviewedAt`, «Da modello EasyGame»,
  `catalogTitleByKey.get(template.catalogKey)`.
- `tests/ui/modulistica-bulk-generation.test.mjs` — `page.tsx`:
  `openBulkDialog` che rilegge `readStoredBatch()`, il toast «riprendilo o
  scartalo…», `if (sospeso && !pendingSubjects(sospeso).length)`,
  `<BulkGenerationDialog`, «Genera per piu atleti», `template.status ===
  "active" && template.subjectKind === "athlete"`; il resto legge il dialogo.
- `tests/ui/forms-builder.test.mjs` — `page.tsx`: `<FormsDashboard />`
  importato da `@/components/forms/forms-dashboard`, nessuna logica dei moduli
  (`createFormTemplate`, `publishForm`, `publicSlug`, `online_form`,
  `FormSchema`) in `page.tsx`.
- `tests/ui/responsive-invariants.test.mjs` — `TabsList` flex-wrap;
  `<MobileTopBar />` + `dashboardMainClassName`, niente `LayoutWithMobileNav`.
- `tests/ui/navigazione-sotto-1024-e-768.test.mjs` — `DOPPIA_BARRA_NOTA`.
- `tests/ui/topbar-club-vs-platform.test.mjs`, `tests/lib/person-export.test.mjs`
  — la pagina nelle liste dei «generatori di documenti» (esclusioni).
- `tests/lib/document-placeholder-catalog.test.mjs` — `page.tsx` grezzo:
  `const renderBlankTemplateForPdf = `, `applyPlaceholderValues({ content,
  rendered: BLANK_SIGNATURE_HTML })`, «Genera vuoto», «Genera compilato»,
  `/api/v1/documents/filled`.
- `tests/ui/athlete-profile-integration-audit.test.mjs` — cerca
  `<CompileFormDialog` nella scheda atleta (non qui).
- `tests/auth/route-guards.test.mjs`, `tests/lib/document-permissions.test.mjs`,
  `tests/web/shell-navigation.test.mjs` — rotta, layout, `canAccessPath`.

## Inventario componenti

Pagina: `Card*, Button, Dialog*, Label, Input, Select*, DropdownMenu*, Tabs*,
Sidebar, Header, MobileTopBar, DashboardPageContainer, SharedPageHeader,
AppLoadingScreen, useToast (use-toast), useAuth, DocumentEditor,
FormsDashboard, BulkGenerationDialog` + lib elencate sopra.

Condivisi (si riusano, non si riscrivono): `SubmissionReviewDialog`
(scheda atleta via `compile-form-dialog`), `form-renderer` (rinnovo, modulo
pubblico), `document-bundle.ts`, `bulk-generation.ts`, `lib/api/*`,
`lib/documents/*`, `lib/forms/*`.

Editor di dominio riusati cosi come sono (una sola implementazione, non un
doppione): `DocumentEditor` (foglio visuale + segnaposto), `FormBuilder` (+
`form-field-card`, `dynamic-field-picker`, `form-public-link`),
`BulkGenerationDialog` (sei passi con storage di sessione).

Specifici della rotta (si rimuovono dopo la parita): `forms-dashboard.tsx`
(elenchi V1 dei moduli, della coda e del catalogo), `TemplateStatusBadge`,
`TemplateStateLine`, `STATUS_CLASSES`, i sei `Dialog` V1 della pagina, la
doppia barra mobile.

## Cosa non esiste in V1

- Filtri, ricerca, ordinamento, viste, export su nessuno dei sei elenchi.
- Modifica di titolo e descrizione di un modello (il client li accetta:
  `saveDocumentTemplateDraft({ title, description })`, ma nessun campo li
  offre; l'editor salva solo `content` e `subjectKind`).
- Caricamento della copia firmata / avanzamento di un generato
  (`documents.generated.advance`) da questa pagina.
- Un predicato client sui moduli online (`canManageClubForms` non e usato).
- Deep link alla scheda (`?tab=`) e all'editor (`?template=`).
- Conferma prima di **Ritira**, **Archivia** ed **Elimina** di un modulo
  online.

## Sintesi

1. Una rotta, due domini (modelli di documento; moduli online) con due
   cancelli; cinque schede ricavate dai permessi.
2. Modelli: ciclo di vita bozza → attivo → ritirato, versioni, catalogo con
   adozione = copia, generazione singola (vuoto / compilato con anteprima) e
   massiva (lotto ripartibile).
3. Moduli online: elenco con azioni di ciclo di vita, coda delle
   compilazioni con esame (dialogo condiviso), catalogo con adozione.
4. Tre editor di dominio grandi (foglio visuale, builder, lotto) che restano
   un'implementazione sola.
5. Stati: tre del modello (`Bozza/Attivo/Ritirato`), sei del generato, tre
   del modulo (`Bozza/Pubblicato/Archiviato`), tre della compilazione
   (`Da esaminare/Approvata/Rifiutata`) — solo `Bozza`, `Attivo`, `Archiviato`
   e `Rifiutata` hanno gia una parola in `status.ts`.
