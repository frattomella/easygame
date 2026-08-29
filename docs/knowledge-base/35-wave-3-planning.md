# 35 — Wave 3: planning esecutivo — Documenti intelligenti e modulistica

**Data:** 2026-08-29
**Baseline:** `integration/web-v1` @ `622242f` (Wave 2 = DONE)
**Perimetro:** G-14, G-15, G-16, G-17, G-42, G-43, G-44 e i debiti documentali
DOC-01…DOC-04
**Stato:** **PLANNING** — nessuna riga di codice, nessuna migrazione, nessun
deploy. Solo verifiche in lettura.

> **Il principio della Wave.** Golee ha **77 modelli**. Non li copiamo.
> Settantasette modelli non sono una funzionalita: sono un **presidio
> redazionale permanente**, cioe una persona che ogni anno controlla se il
> modulo della ASL di Bergamo e cambiato. Golee dimostra che il **problema**
> vale — il club non vuole un editor, vuole il foglio gia scritto — non che la
> soluzione sia un catalogo enorme.
>
> EasyGame costruisce tre cose, in quest'ordine: **un motore documentale
> generale**, **un catalogo iniziale piccolo e mantenibile**, **un processo
> che si puo tenere in piedi**. Il catalogo e la parte piu piccola delle tre,
> ed e l'ultima a essere scritta.

---

## Indice

1. [La verifica dei gap](#1--la-verifica-dei-gap)
2. [Attachment Core: la mappa, prima di tutto](#2--attachment-core-la-mappa-prima-di-tutto)
3. [Document Template Core: EXTEND o NEW](#3--document-template-core-extend-o-new)
4. [Il catalogo dei segnaposto](#4--il-catalogo-dei-segnaposto)
5. [Il versionamento, e perche lo storico non cambia](#5--il-versionamento-e-perche-lo-storico-non-cambia)
6. [Il catalogo V1: dieci modelli](#6--il-catalogo-v1-dieci-modelli)
7. [I consensi](#7--i-consensi)
8. [La firma: quattro cose diverse con lo stesso nome](#8--la-firma-quattro-cose-diverse-con-lo-stesso-nome)
9. [La modulistica pubblica](#9--la-modulistica-pubblica)
10. [OCR e lettura documenti](#10--ocr-e-lettura-documenti)
11. [Scadenze e documenti ricorrenti](#11--scadenze-e-documenti-ricorrenti)
12. [Generazione massiva](#12--generazione-massiva)
13. [Permessi e privacy](#13--permessi-e-privacy)
14. [I workstream paralleli](#14--i-workstream-paralleli)
15. [Il DAG e l'ordine di merge](#15--il-dag-e-lordine-di-merge)
16. [EXTEND vs NEW: il quadro completo](#16--extend-vs-new-il-quadro-completo)
17. [Cosa non copiamo da Golee](#17--cosa-non-copiamo-da-golee)
18. [Ownership redazionale](#18--ownership-redazionale)
19. [La UAT, decisa prima del codice](#19--la-uat-decisa-prima-del-codice)
20. [Prestazioni](#20--prestazioni)
21. [Pre-production challenge](#21--pre-production-challenge)
22. [L'audit obbligatorio di fine Wave](#22--laudit-obbligatorio-di-fine-wave)
23. [ADR da scrivere, contatori, effetto sulla gap matrix](#23--adr-da-scrivere-contatori-effetto-sulla-gap-matrix)
24. [Risultato per il club](#24--risultato-per-il-club)

---

## 1 — La verifica dei gap

### 1.1 Metodo, e il suo limite

Ogni voce e stata verificata **leggendo il codice**, non l'audit. Dove il
codice basta a decidere, lo stato e definitivo; dove serviva un'applicazione
in esecuzione — e questa e una fase di planning, quindi non l'abbiamo avviata
— lo stato e `NEEDS RUNTIME` e resta tale finche qualcuno non lo prova.

`ALREADY SOLVED` significa che il problema del cliente e risolto **oggi**, non
che esiste il codice. `PARTIAL` significa che una meta funziona e l'altra no,
e dice quale.

### 1.2 Il registro

| # | Gap | Problema reale | Evidenza | Stato | Domain owner | Cosa riusiamo | Cosa manca | Effort | Rischio | Target |
|---|---|---|---|---|---|---|---|---|---|---|
| **W3-01** | **G-14** — libreria di modelli pronti (C-116) | Il club non vuole un editor: vuole il foglio gia scritto. Oggi apre `/modulistica`, preme «Nuovo documento» e trova `<h1>Titolo</h1><p>Inserisci il contenuto qui.</p>` | `src/app/modulistica/page.tsx:667` — il modello nasce vuoto. L'unico modello seminato e l'attestazione di Wave 1 (`src/lib/documents/attestation-template.ts`) | **CONFIRMED** | Template Core (nuovo, §3) | `DocumentEditor`, il risolutore, la stampa | Un catalogo di piattaforma, e il posto dove metterlo | L | medio | **V1.1** |
| **W3-02** | **G-15** — documento arricchito dagli importi (C-118, C-119) | Un PDF con il logo non serve; un documento che dice la cifra giusta si | `src/lib/server/document-placeholders.ts` risolve gia importi, frequenza e intestatario fiscale, ed e collaudato | **PARTIAL** | `src/lib/server/document-placeholders.ts` | tutto il risolutore | Il **soggetto**: risolve solo l'atleta. Allenatore, staff, socio e club restano bianchi (debito `DOC-04`) | M | basso | **V1.1** |
| **W3-03** | **Il documento generato non esiste come record** | «Chi ha rilasciato questa attestazione, quando, con quale versione del modello e quali importi?» oggi non ha risposta: il documento e una pagina HTML che nasce nel browser e muore alla chiusura della scheda | `GET /api/v1/documents/filled` restituisce HTML e non scrive niente. Nessuna tabella `generated_documents` in `prisma/schema.prisma` | **CONFIRMED** | Template Core (nuovo, §3) | `document_number_sequences` per il protocollo | La riga, il suo audit, la sua permanenza | M | **alto** | **V1.1** |
| **W3-04** | **I modelli non hanno versioni** | Se il club corregge un modello, ogni documento gia rilasciato cambia retroattivamente — perche non ne esisteva una copia | `clubs.document_templates` e un array JSON (`prisma/schema.prisma:196`), scritto in place da `updateDocumentTemplate` (`src/lib/simplified-db.ts:3314`) | **CONFIRMED** | Template Core | il pattern gia collaudato di `form_template_versions` (ADR-0040) | Le versioni immutabili, e la citazione dal documento | M | **alto** | **V1.1** |
| **W3-05** | **G-17** — consenso con ciclo di vita (C-125) | Un consenso va **dimostrato** e **revocato**. Oggi e una casella spuntata dentro una compilazione: non si revoca, non si interroga per persona, non si sa quale testo e stato accettato | Nessun modulo `consent*` in `src/lib/`. Il consenso e un `checkbox` obbligatorio (`src/lib/forms/model.ts:113`) dentro `form_submissions.answers` | **CONFIRMED** | Consent domain (nuovo, §7) | `form_template_versions` come modello concettuale; Attachment Core per l'evidenza | Definizione, versione, stato per persona, revoca | M | medio | **V1.1** |
| **W3-06** | **G-43** — stampa massiva (C-120) | A settembre si generano trenta richieste di visita medica. Una per volta sono trenta aperture di scheda | La rotta e dichiaratamente singola: «Un documento, un atleta. Nessuna stampa massiva: e G-43, ed e Wave 3» (`src/app/api/v1/documents/filled/route.ts`) | **CONFIRMED** | Template Core + il ciclo a lotti di Wave 2 | `BULK_BATCH_SIZE`, il `communication_id` che rende ripartibile un lotto (`src/lib/server/communications.ts:48`) | Il fascicolo, il naming, gli errori parziali | M | medio | **V1.1** |
| **W3-07** | **Scadenze dei documenti** | Il certificato medico ha una scadenza governata; il documento d'identita, l'attestato BLSD, l'assicurazione e il contratto no | `medical_certificates.expiry_date` e una colonna vera; le altre scadenze vivono in JSON liberi (`staffMemberData.documentExpiry`, `src/lib/simplified-db.ts:3898`). `attachments` **non ha** nessuna data di validita | **PARTIAL** | `attachments` + `src/lib/automations/catalog.ts` | il motore di Wave 2 per intero: valutatore notturno, anticipi, deduplica, registro consegne | Una **fonte canonica** della validita di un documento, e il quinto innesco | S | basso | **V1.1** |
| **W3-08** | **G-42** — ciclo di firma del documento (C-113, C-121) | «Firmato» e uno stato, non un allegato | `src/lib/shared-documents.ts` ha gia gli stati `required → uploaded → under_review → approved/rejected`, ma vale per i documenti **chiesti alla famiglia**, non per quelli **emessi dal club** | **PARTIAL** | `shared-documents` (concetto), Attachment Core (il file firmato) | gli stati, gia scritti e collaudati | Lo stato sul documento **generato**, che oggi non esiste (W3-03) | M | medio | **V1.1** |
| **W3-09** | **G-16** — contratti Co.Co.Co. pronti (C-112) | Il rapporto di lavoro sportivo esiste in EasyGame; il contratto si scrive fuori | `sport_work_relationships` ha i dati; nessun modello li usa. Il risolutore non conosce il soggetto «lavoratore sportivo» | **CONFIRMED** | `sport-work` + Template Core | dati completi, gia in tabella | Un modello **giuridicamente valido**, che nessuno di noi puo redigere (classe C, §18) | M | **alto** (legale) | **POST-V1** |
| **W3-10** | **G-44** — modelli visita medica regionalizzati (C-117) | La segretaria telefona alla ASL per farsi mandare il modulo | Golee ne ha 33, di cui 30 per territorio | **CONFIRMED, NO ACTION** | nessuno | il motore: un club puo caricare **il suo** modello e usarlo con i segnaposto | Trenta moduli territoriali da mantenere per sempre. **Non lo facciamo** (§17, §18) | XL | **inaccettabile** | **NO ACTION** |
| **W3-11** | **G-51** — firma e timbro del presidente | Ogni documento generato lo richiede | Chiuso in Wave 1: caricabili, sostituibili, non pubblici, letti dal generatore (`readClubSignatureImage`), e la guardia `CLUB_OWNED_ATTACHMENT_TYPES` impedisce a un collaboratore di sostituirli | **ALREADY SOLVED** | `src/lib/server/club-signature.ts` | tutto | niente | — | — | **CHIUSO** |
| **W3-12** | **OCR / lettura documenti** | Foto del documento → estrazione → precompilazione | Esiste, ed e locale: `tesseract.js`, `document-scan.ts`, `document-extraction.ts` con contratto a provider, e il campo e montato in **cinque** schermate (atleta, socio, staff, allenatore, creazione atleta) | **ALREADY SOLVED** | `src/lib/document-extraction*.ts` | tutto | Solo il PDF, che il motore locale non legge e **lo dichiara** invece di fallire | S | basso | **V1.1 (solo PDF)** |
| **W3-13** | **C-126** — unione dei consensi PDF al documento | Comodita di stampa | Gia respinta dall'audit (§5, differenza 4): il problema vero — dimostrabilita e revoca — lo risolve W3-05 | **FALSE POSITIVE** | — | — | — | — | — | **NO ACTION** |
| **W3-14** | **`/modulistica` e aperta a chi non puo generare** | Un collaboratore apre la pagina, vede i modelli, li **modifica**, preme «Genera compilato» e riceve un 403 | `/modulistica` sta in `MANAGEMENT_PATH_PREFIXES` ma **non** in `MANAGEMENT_ADMIN_ONLY_PATH_PREFIXES` (`src/lib/access-roles.ts:82`), mentre la rotta `filled` richiede `canManageClubConfiguration`. In piu `document_templates` e in `CLUB_RESOURCE_TYPES`: collaboratore e staff hanno CRUD generico sui modelli | **NEEDS RUNTIME** | `src/lib/access-roles.ts` | la matrice esistente | Coerenza fra pagina, rotta e CRUD generico (§13) | S | **alto** | **V1** |

### 1.3 I debiti documentali gia registrati che questa Wave assorbe

Non sono gap verso Golee: sono cose che **il motore nuovo cancella per
costruzione**, e vanno chiuse dentro le lane che le sostituiscono, non in un
commit di pulizia a parte.

| # | Debito | Come muore |
|---|---|---|
| `DOC-02` | `generateDocumentTemplates`, ~200 righe di modelli predefiniti mai chiamati in `/modulistica`, con segnaposto **storici** (`{{first_name}}`, `{{fiscalCode}}`) che il risolutore non conosce | Il catalogo di piattaforma (W3-D) e cio che quel codice morto voleva essere. Si rimuove **nella stessa lane**, perche lasciare due cataloghi e esattamente l'errore n. 1 di CLAUDE.md |
| `DOC-03` | «Compila» sostituisce i segnaposto per conto proprio nel browser, con una terza mappa e l'anno letto da `localStorage` | Assorbito da «Genera compilato». E una rimozione con cambio di comportamento visibile: e una decisione di prodotto, e questa Wave la prende |
| `DOC-04` | Il catalogo propone staff, allenatori, soci, sponsor e certificati che il risolutore non sa riempire | Chiuso da W3-B: il risolutore impara i soggetti, oppure il segnaposto viene marcato per contesto e l'editor smette di proporlo dove non ha soggetto |
| `DOC-01` | `payments` non porta una stagione: il perimetro dell'attestazione si deduce dalla data di scadenza | **Resta aperto**, dichiarato. Marcare le rate con `seasonId` tocca la generazione dei piani e ogni schermata economica: e un lavoro a se, e non e questo |
| `D28` | I residui dei moduli V1 in `clubs.document_templates` | La migrazione di W3-A **legge** quella colonna, salta i tipi legacy come fa gia `getDocumentTemplatesFromClub`, e scrive nelle tabelle nuove. La colonna resta finche qualcuno non decide di cancellarla — come per i moduli (ADR-0039) |
| `D38` | Il documento di una ricevuta non viene archiviato | **Non lo tocchiamo**, e il §3.4 spiega perche la scelta di questa Wave non lo riapre |

---

## 2 — Attachment Core: la mappa, prima di tutto

CLAUDE.md vieta un secondo sistema di allegati. Prima di progettare qualunque
cosa, ecco **esattamente** cosa esiste, cosi che nessuna lane sia tentata di
rifarlo.

### 2.1 Cosa possiede Attachment Core

| Pezzo | File | Cosa garantisce |
|---|---|---|
| Il contratto lato modello | `src/lib/attachments.ts` (309 righe) | Riferimento `attachment:<id>`, 15 tipi MIME ammessi (elenco **chiuso**), limite 10 MB, `resolveAttachmentSource` come **unica** funzione che risponde a «che cosa ho in mano» |
| La riga | `Attachment` + `AttachmentBlob` (`prisma/schema.prisma:983`) | `organization_id`, `owner_type`, `owner_id`, `category`, nome, MIME, dimensione, `checksum` sha256, autore, date. I byte in tabella separata perche si leggono di rado |
| Il driver | `src/lib/server/attachments.ts` (535 righe) | `registerStorageDriver` / `setActiveStorageDriver`: oggi database, domani object storage, senza che il client se ne accorga (ADR-0007) |
| La consegna | `src/lib/server/stored-file-response.ts` | **Una** risposta per tutti i file: `nosniff` sempre, `inline` solo per i tipi guardabili, CSP che permette il visualizzatore PDF e vieta script e rete, nome RFC 6266 in due forme |
| Il nome | `src/lib/attachment-names.ts` | `BLSD_Rossi_Mario_2026-08-25.pdf`: il nome leggibile si costruisce dai dati della persona, non si inventa nel server |
| I dieci proprietari | `ATTACHMENT_OWNER_TYPES` | `athlete`, `trainer`, `staff`, `member`, `club`, `guardian`, `form`, `sport_work_relationship`, `sport_work_person`, `announcement`, `other` |

### 2.2 Dove vivono oggi i documenti, per area

| Area | Dove | Owner type |
|---|---|---|
| Documenti atleta | record dell'atleta, riferimento `attachment:` | `athlete` |
| Certificato medico | `medical_certificates` (modello proprio, con `expiry_date`) | `athlete` |
| Documenti allenatore | voce nel record dell'allenatore (`src/lib/trainer-documents.ts`), **un solo posto** dopo RC Fix 1 | `trainer` |
| Documenti staff / socio | record della persona | `staff`, `member` |
| Lavoro sportivo | **due** proprietari: quelli del rapporto finiscono con il rapporto, quelli della persona le restano addosso | `sport_work_relationship`, `sport_work_person` |
| Modulistica: allegati caricati in un modulo | `form_submissions.files` (metadati, mai byte) | `form` |
| Bacheca (Wave 2) | allegato dell'annuncio, il cui pubblico decide chi lo legge | `announcement` |
| Attestazioni Wave 1 | **nessun file**: il documento si rigenera e si stampa dal browser | — |
| Firma e timbro | `clubs.settings` porta il riferimento, i byte stanno in Attachment Core | `club` |

### 2.3 Le cinque cose che questa Wave **non** creera

1. **Nessuno storage nuovo.** Chi ha byte da conservare passa da
   `createAttachment`. Punto.
2. **Nessuna preview nuova.** Chi serve un file passa da
   `buildStoredFileResponse`. Le tre implementazioni divergenti sono gia state
   unificate una volta: non se ne apre una quarta.
3. **Nessun sistema di permessi nuovo.** Si estende `access-roles.ts` e si
   riusa il permesso di dominio di `sport-work` **solo** dove §13 lo dimostra
   necessario.
4. **Nessuna gestione MIME nuova.** L'elenco chiuso di
   `ALLOWED_ATTACHMENT_MIME_TYPES` resta chiuso, e **`text/html` resta fuori**
   (§3.4).
5. **Nessun secondo naming.** `attachment-names.ts` sa gia comporre un nome da
   una persona e una data: il fascicolo massivo lo riusa.

### 2.4 Il difetto che vincola tutta la progettazione

`GET /api/v1/attachments/:id` autorizza la **lettura** a chiunque appartenga al
club. L'unica eccezione e `announcement`, che passa dal pubblico dell'annuncio;
`club` e ristretto in **scrittura** ma non in lettura.

Vuol dire che, oggi, un allenatore che conosca un identificativo puo leggere
qualunque allegato del club. Per gli allegati **caricati** e una scelta
esistente e non la riapriamo qui. Ma ha una conseguenza diretta su questa Wave:

> **Un documento generato che contenga importi o dati sanitari non puo essere
> un `attachment`.** Metterlo li lo renderebbe leggibile da ogni membro del
> club, scavalcando qualunque permesso mettessimo sulla generazione.

E la ragione principale della forma scelta al §3.

---

## 3 — Document Template Core: EXTEND o NEW

### 3.1 Il verdetto

> **Il risolutore dei segnaposto di Wave 1 diventa il core: `EXTEND`.**
> **Lo storage dei modelli, no: `NEW`** — ed e, insieme ai consensi, l'unica
> NEW CAPABILITY della Wave.

Sono due decisioni separate perche riguardano due cose diverse, e confonderle
porterebbe o a riscrivere un risolutore che funziona, o a costruire un motore
sopra un array JSON.

### 3.2 Il risolutore: EXTEND, e basta

`src/lib/server/document-placeholders.ts` fa gia, oggi, cio che un motore
documentale deve fare:

- **catalogo chiuso e condiviso** con l'editor, con un test di contratto che
  impedisce che ne nasca un secondo;
- **legge, non calcola**: gli importi vengono da `installment-ledger`, la
  frequenza da `measureAttendanceByPeriod`. Nessuna formula nasce nel
  documento;
- **il documento non mente**: un dato che manca resta bianco ed e elencato in
  `missing`; un segnaposto sconosciuto finisce in `unresolved`; una firma
  assente produce un `warning` **prima** di stampare;
- **niente HTML iniettabile**: ogni valore da anagrafica passa da `escapeHtml`,
  e la distinzione fra «testo da neutralizzare» e «frammento voluto» e
  esplicita nel tipo (`PlaceholderValue`).

Non c'e niente da rifare. C'e da **aggiungere un soggetto** (§4.2) e da
**staccare la risoluzione dal soggetto unico «atleta»**.

### 3.3 Lo storage: perche NEW

Oggi un modello e un oggetto dentro `clubs.document_templates`, un array JSON
sulla riga del club. Le conseguenze, tutte verificate nel codice:

| Conseguenza | Evidenza |
|---|---|
| Non ha versioni | `updateDocumentTemplate` scrive in place (`simplified-db.ts:3314`) |
| Non ha autore ne date attendibili | l'oggetto ha `id`, `title`, `description`, `content`, `createdAt` — e `createdAt` lo mette il client |
| E scrivibile da collaboratore e staff | `document_templates` sta in `CLUB_RESOURCE_TYPES` e non in `MANAGEMENT_ADMIN_ONLY_RESOURCES` |
| Non distingue un modello del club da uno di piattaforma | non c'e un campo che lo dica |
| Convive con i residui dei moduli V1 | un file di 27 righe esiste **solo** per filtrarli (`D28`) |
| Cresce dentro la riga del club | ogni lettura del club porta con se tutti i modelli, contenuto HTML compreso |

Un catalogo di piattaforma, versioni immutabili e documenti che citano una
versione **non stanno** in un array JSON. E la stessa identica situazione da
cui sono usciti i moduli online con ADR-0039 e ADR-0040, e la strada e gia
tracciata e collaudata.

### 3.4 La forma

```
DOCUMENT TEMPLATE            document_templates                   chi possiede il modello
   -> VERSION                document_template_versions           immutabile, citabile
   -> PLACEHOLDERS           src/lib/documents/placeholders.ts    catalogo chiuso, esiste
   -> DATA SOURCE            il soggetto: atleta | persona | socio | club
   -> RENDER                 src/lib/server/document-placeholders.ts   esiste
   -> GENERATED DOCUMENT     generated_documents                  la riga che prima non c'era
   -> ATTACHMENT             solo per il file FIRMATO che rientra, e solo li
   -> AUDIT                  audit_logs                           esiste
```

**Tre tabelle, non piu.**

| Tabella | Contiene | Perche |
|---|---|---|
| `document_templates` | club, titolo, descrizione, `scope` (`platform` \| `club`), `source_template_key` (da quale voce di catalogo deriva), stato (`draft` \| `published` \| `archived`), `published_version`, autore, date | E il gemello di `form_templates`. Il campo `scope` e cio che permette a un club di **partire da** un modello di piattaforma e poi modificarlo senza che l'originale cambi |
| `document_template_versions` | `template_id`, `version`, `content_html`, `placeholder_keys[]`, `subject_kind`, chi e quando | **Immutabile**. E l'unica risposta possibile a «con quale testo e stato rilasciato questo documento?» che resti vera dopo che il modello e stato corretto |
| `generated_documents` | `template_id`, `version_id`, `subject_kind`, `subject_id`, `season_id`, `values_json`, `content_html`, `unresolved[]`, `missing[]`, `protocol_number`, `status`, `generated_by`, `generated_at`, `batch_id` | E il documento. Con dentro **cosa diceva** quando e stato rilasciato |

**Perche `content_html` sta nella riga e non in Attachment Core.** Tre ragioni,
in ordine di forza:

1. **Permessi** (§2.4): un allegato e leggibile da ogni membro del club. Un
   attestato che dice quanto ha versato una famiglia non lo e.
2. **`text/html` e fuori dall'elenco chiuso dei MIME**, e ci sta apposta:
   `attachments` serve file **caricati dagli utenti**, e ammettere l'HTML per
   un documento generato dal server lo ammetterebbe anche per un file che
   arriva da un modulo pubblico. Il debito `D38` lo dice gia, e questa scelta
   **non lo riapre**.
3. Un documento generato non e un file dell'utente: e un **fatto** del
   gestionale, come una ricevuta. Sta dove stanno i fatti.

**Perche l'HTML viene congelato e non rigenerato.** Congelare la versione e i
valori basterebbe **solo se il risolutore non cambiasse mai**. Cambiera. Una
colonna di testo costa poco e toglie di mezzo un'intera classe di dubbi: un
documento rilasciato a marzo si rilegge a novembre identico, qualunque cosa sia
successa nel frattempo al codice.

**Il PDF non lo produciamo, e va detto adesso.** Non c'e nessuna libreria PDF
fra le dipendenze: ogni stampa di EasyGame — ricevute, elenchi, attestazioni —
apre una finestra e chiama `window.print()`
(`src/lib/people-pdf-export.ts:216`). Introdurre un motore PDF lato server e
una decisione con un suo ADR, un suo peso nel bundle e un suo collaudo: **non
si prende dentro una Wave sui documenti**, si prende a parte. Le conseguenze
sono al §12.

### 3.5 Dove vive il codice

| Modulo | Ruolo |
|---|---|
| `src/lib/server/document-templates.ts` | **NUOVO, proprietario.** L'unico che scrive `document_templates`, `document_template_versions`, `generated_documents`. Nessuna scrittura altrove |
| `src/lib/documents/template-model.ts` | **NUOVO, puro.** Tipi, stati, transizioni, validazione di un contenuto. Si prova senza database |
| `src/lib/documents/placeholders.ts` | **ESTESO.** Il catalogo guadagna il **contesto** di ogni chiave (§4) |
| `src/lib/server/document-placeholders.ts` | **ESTESO.** Impara i soggetti oltre l'atleta |
| `src/lib/documents/catalog/` | **NUOVO, dati.** I dieci modelli del §6, come testo. Non e codice: e contenuto in un file, versionato con il repository |
| `src/lib/document-templates.ts` | **INVARIATO.** Continua a filtrare i residui dei moduli V1 finche `D28` resta aperto |

---

## 4 — Il catalogo dei segnaposto

### 4.1 Cosa esiste gia

`src/lib/documents/placeholders.ts` porta **83 chiavi** in 14 gruppi, piu 5
blocchi firma, ed e gia condiviso fra editor, risolutore documentale e
messaggi di Wave 2. Il catalogo e **chiuso**: una chiave fuori elenco non viene
inventata, resta un campo vuoto e viene dichiarata.

Il risolutore ne produce **una cinquantina**. Le altre sono nel catalogo perche
l'editor le propone, ma in un documento intestato a un atleta non hanno
soggetto: e il debito `DOC-04`.

### 4.2 Cosa aggiunge questa Wave: il **contesto**, non altre chiavi

Il problema di `DOC-04` non e che mancano segnaposto: e che il catalogo e
**piatto** mentre i documenti hanno un **soggetto**. Un contratto parla di un
allenatore, un'attestazione di un atleta, una delibera del club soltanto.

Ogni voce del catalogo guadagna quattro attributi, e il modello dichiara il suo
soggetto:

| Attributo | Valori | A cosa serve |
|---|---|---|
| `subject` | `club` \| `athlete` \| `person` \| `member` \| `document` \| `system` | L'editor propone **solo** le chiavi risolvibili per il soggetto del modello. Fine di `DOC-04` |
| `owner` | il modulo che produce il dato | `installment-ledger` per gli importi, `attendance-measure` per la frequenza, `fiscal-recipient` per l'intestatario. Nessuna formula nuova |
| `sensitivity` | `plain` \| `economic` \| `health` \| `minor` | `economic` esiste gia (`ECONOMIC_PLACEHOLDER_KEYS`, 6 chiavi) ed e gia usato dai messaggi di Wave 2. Si **generalizza**, non si duplica |
| `nullable` | `blank` \| `warn` \| `block` | Oggi tutto e `blank`. Un contratto senza compenso non deve uscire: quello e `block` |

E una sola aggiunta di chiavi, quella che il soggetto «persona» richiede:

| Gruppo | Chiavi nuove | Fonte | Sensitivity |
|---|---|---|---|
| Persona sportiva | `person.first_name`, `person.last_name`, `person.fiscal_code`, `person.birth_date`, `person.birth_place`, `person.address` | `sport_work_people` | `plain` |
| Rapporto | `relationship.role`, `relationship.kind`, `relationship.start_date`, `relationship.end_date` | `sport_work_relationships` | `plain` |
| Compenso | `relationship.gross_amount`, `relationship.plan_name` | `sport-work` | **`economic`**, e dietro `sport_work.read` — non basta essere della direzione |
| Documento | `document.protocol_number`, `document.validity_date` | `document_number_sequences`, `generated_documents` | `plain` |
| Consenso | `consent.title`, `consent.version`, `consent.accepted_at` | Consent domain (§7) | `plain` |

**Formattazione: una sola, gia scritta.** `formatAmountValue` e `formatDate` di
`document-view.ts` scrivono importo e data all'italiana **a mano**, perche
`toLocaleDateString("it-IT")` ripiega sull'ordine americano se l'ambiente non
ha i dati di localizzazione. Nessun documento nuovo formatta per conto proprio.

### 4.3 La regola che non cambia

Un segnaposto `economic` in un documento generato da chi non puo vedere quel
dato **non esce bianco**: la generazione si rifiuta e dice quale chiave e il
motivo. Un campo vuoto sarebbe indistinguibile da «importo zero», e su
un'attestazione firmata dal presidente e una differenza che conta.

---

## 5 — Il versionamento, e perche lo storico non cambia

Un documento generato deve sapere: **quale modello**, **quale versione**,
**quali dati**, **quando**, **da chi**. Sono cinque colonne di
`generated_documents`, ed e tutto.

L'invariante, in una riga:

> **Modificare un modello crea una versione nuova. I documenti gia rilasciati
> continuano a citare la loro, e nessuna operazione sul modello puo cambiarli.**

Le regole che la reggono, prese di peso da ADR-0040 perche li funzionano gia:

1. una versione **non si aggiorna mai**: si pubblica;
2. un modello con documenti generati **non si cancella**: si archivia — perche
   la citazione deve restare risolvibile;
3. il documento porta **anche** `values_json` e `content_html`: cosi resta
   leggibile anche se un giorno si decidesse di cancellare davvero una
   versione;
4. la bozza e modificabile quanto si vuole; la **pubblicazione** e l'atto che
   crea la versione;
5. generare da una bozza non pubblicata e possibile solo in **anteprima**, e
   l'anteprima non scrive una riga in `generated_documents`.

---

## 6 — Il catalogo V1: dieci modelli

**Non settantasette. Dieci.** Il criterio non e «cosa ha Golee» ma: *lo chiede
ogni club, ogni anno, e i dati per compilarlo li abbiamo gia*. Un modello che
non passa tutti e tre i test non entra.

| # | Modello | Soggetto | Valore | Frequenza | Dati disponibili? | Firma | Classe (§18) |
|---|---|---|---|---|---|---|---|
| **1** | **Attestazione di pagamento e frequenza** | atleta | La chiede ogni famiglia per il 730, per i bandi, per il datore di lavoro | annuale x N famiglie | **Si**, gia collaudati (Wave 1) | presidente | **A** |
| **2** | **Attestazione di sola frequenza** | atleta | Stessa richiesta, senza importi: la puo generare anche la segreteria che non vede la cassa | annuale | **Si** | presidente | **A** |
| **3** | **Dichiarazione di iscrizione all'attivita** | atleta | Scuola, datore di lavoro ed ente locale la chiedono a stagione aperta | continua | **Si** | presidente | **A** |
| **4** | **Avviso di versamento quota** | atleta | Dice quanto, entro quando, e **con che link si paga** (`{{payment.link}}`, Wave 2) | mensile | **Si** | nessuna | **A** |
| **5** | **Informativa e consenso privacy** | atleta / persona | Obbligo di legge a ogni iscrizione | annuale x tutti | **Si** | accettazione elettronica (§8) | **A** scheletro / **C** testo |
| **6** | **Consenso immagini foto e video** | atleta | Il piu revocato di tutti: e il caso che dimostra perche serve il dominio (§7) | annuale | **Si** | accettazione elettronica | **A** |
| **7** | **Liberatoria e autorizzazione trasferta** | atleta | Ogni trasferta di minori | ~10/anno | **Si** | firma del genitore (grafica o a mano) | **A** |
| **8** | **Delega al ritiro del minore** | atleta | Chi puo venire a prendere il bambino: lo chiede ogni societa con minori | annuale | **Si** (tutori) | firma del genitore | **A** |
| **9** | **Richiesta di visita medico-sportiva** | atleta | E il caso d'uso della stampa massiva: trenta in un gesto a settembre | annuale x tutti | **Si** | presidente | **A** — **non** e il modulo ASL regionale (§17) |
| **10** | **Attestazione per bando o voucher** | atleta | Il vantaggio V-01 arriva sul foglio: importi versati e frequenza **misurata dal server**, nel formato che l'ente chiede | annuale, a finestre | **Si** (`funding`) | presidente | **A** |

### 6.1 Cosa **non** entra nel catalogo V1, e perche

| Modello | Perche no |
|---|---|
| **Contratto Co.Co.Co.** (G-16) | Classe **C**: un contratto di lavoro sportivo sbagliato costa al club piu di quanto il modello gli faccia risparmiare. Serve una validazione professionale prima di distribuirlo, e serve il soggetto «persona sportiva» nel risolutore (W3-B). **POST-V1** |
| **Dichiarazione di tesseramento** | Il tesseramento **non e un'entita** in EasyGame: e G-30, e non e in questa Wave. Un modello che dichiara una cosa che il gestionale non sa e un foglio da compilare a mano con un'intestazione |
| **Autocertificazioni anagrafiche** (residenza, stato di famiglia) | Il testo e disciplinato dal DPR 445/2000 e cambia. Classe **C**. Il motore permette al club di caricarne una sua |
| **Moduli ASL regionali** (G-44) | Trenta moduli territoriali, per sempre. **Mai** (§17) |
| **Verbali di assemblea, nomine safeguarding** (G-49, G-50) | Dipendono da G-48, che non esiste. POST-V1 |

### 6.2 Come arrivano al club

Non tutti e dieci, tutti insieme, il primo giorno. Il modello di piattaforma si
**propone**, esattamente come fa oggi il pulsante «Aggiungi attestazione di
pagamento»: il club sceglie, e da quel momento la copia e sua e la puo
modificare. Un catalogo che si installa da solo e un elenco di trenta voci in
una schermata che serviva a trovarne una.

---

## 7 — I consensi

### 7.1 Serve un dominio vero? Si, e questa e la prova

Oggi un consenso e una casella spuntata dentro `form_submissions.answers`. Le
tre domande che una segreteria si fa davvero non hanno risposta:

| Domanda | Oggi |
|---|---|
| «Chi ha dato il consenso immagini?» | si apre ogni compilazione e si guarda dentro |
| «La signora Rossi lo ha **revocato** a gennaio: risulta?» | no. Una compilazione e immutabile: non si revoca |
| «Quale testo aveva accettato?» | la versione del **modulo**, non del **consenso**: se il modulo cambia per un'altra ragione, il testo accettato non e piu isolabile |

Un consenso non e una risposta a una domanda: e uno **stato di una persona**
che nasce, vale e finisce. E la stessa distinzione che il repository ha gia
fatto fra «presenza» e «intenzione» su `training_attendance` (ADR-0086), e per
la stessa ragione: due fatti diversi non stanno sulla stessa riga.

> **Verdetto: `NEW`.** E la seconda e ultima NEW CAPABILITY della Wave.

### 7.2 La forma

```
CONSENT DEFINITION      cosa si chiede (privacy, immagini, trasferte)
   -> VERSION           il testo esatto, immutabile
   -> SUBJECT           a chi si riferisce (atleta o persona)
   -> ACCEPTED/REJECTED lo stato, con la data
   -> REVOKED           uno stato terminale, con la data e il motivo
   -> EVIDENCE          da dove viene: compilazione, documento generato, o carta caricata
```

Tre tabelle, piccole:

| Tabella | Chiave |
|---|---|
| `consent_definitions` | club, `key` (`privacy`, `images`, `travel`), titolo, obbligatorieta, stato |
| `consent_versions` | `definition_id`, `version`, `body_text`, `published_at`. **Immutabile** |
| `consent_records` | `definition_id`, `version_id`, `subject_kind`, `subject_id`, `status` (`accepted` \| `rejected` \| `revoked`), `decided_at`, `decided_by`, `evidence_kind`, `evidence_id` |

### 7.3 Le regole

1. **Lo stato attuale si deriva**, non si scrive: e l'ultimo record per
   (definizione, soggetto). Come per le rate e per le scadenze del lavoro
   sportivo — lo stato non si imposta, si ricava;
2. **una revoca non cancella niente**: aggiunge una riga. Il consenso dato a
   settembre resta dimostrabile anche dopo la revoca di gennaio, ed e
   esattamente cio che serve se qualcuno contesta una foto pubblicata a
   ottobre;
3. **una versione nuova non invalida i consensi vecchi**, ma li segnala come
   «dati su una versione precedente»: e il club a decidere se richiederli;
4. **l'evidenza e un puntatore**, non una copia: la compilazione o il documento
   generato restano dove sono;
5. **il consenso non e un PDF isolato.** Il PDF, se serve, e un documento
   generato che **cita** il record — non il contrario.

---

## 8 — La firma: quattro cose diverse con lo stesso nome

Chiamare «firma digitale» una casella spuntata o un'immagine incollata e il
modo piu rapido di perdere una causa. Le quattro cose, distinte:

| # | Cosa | Cosa vale | Stato in EasyGame | Wave 3 |
|---|---|---|---|---|
| **1** | **Firma e timbro del presidente**: immagine caricata dal club, apposta sui documenti che il club emette | Vale quanto una firma su carta intestata: identifica l'emittente, non prova nulla contro un disconoscimento | **ESISTE** (G-51, Wave 1): caricabile, sostituibile, non pubblica, letta dal generatore, protetta in scrittura | **Riuso.** Nessun lavoro |
| **2** | **Firma grafica**: tratto disegnato con dito o mouse | Un'immagine. Prova poco da sola, molto se accompagnata da data, indirizzo IP e testo firmato | **ESISTE**: campo `signature` nella modulistica (`src/lib/forms/model.ts:116`) | **Riuso**, e diventa `evidence` di un consenso |
| **3** | **Accettazione elettronica**: chi, quando, da dove, **quale testo esatto** | E la forma piu solida che possiamo produrre onestamente: e un fatto tracciato, non un'immagine | **NON ESISTE** | **Si**: e `consent_records` del §7 |
| **4** | **Firma elettronica qualificata** (FEA/FEQ, `.p7m`, CAdES) | Ha valore legale pieno, equiparato all'autografa | **NON ESISTE**, e richiede un prestatore di servizi fiduciari, un contratto e un'integrazione | **NO** (§17). Golee ce l'ha; noi non la promettiamo finche non c'e |

### 8.1 Il ciclo di firma del documento (G-42): cosa facciamo davvero

Non «firma digitale». Uno **stato sul documento generato**:

```
generato -> emesso -> inviato per firma -> firmato (copia caricata) -> archiviato
                                        -> rifiutato
```

«Firmato» significa **una cosa sola, e la si scrive**: e rientrata una copia
firmata, caricata come allegato (`owner_type: athlete|trainer|…`, Attachment
Core) e collegata alla riga. E cio che una ASD fa oggi con la carta,
tracciato.

Gli stati sono gia scritti e collaudati in `src/lib/shared-documents.ts` per i
documenti **chiesti alla famiglia**: qui si applica lo stesso vocabolario al
documento **emesso dal club**, senza inventarne un secondo. **V1.1.**

---

## 9 — La modulistica pubblica

### 9.1 Cosa esiste gia — ed e piu di quanto il gap audit dia per scontato

`form_templates` + `form_template_versions` + `form_submissions` sono un
dominio completo e collaudato a runtime (C-128, maturita 5 contro 4 di Golee):

- 12 tipi di campo piu la sezione, fra cui **allegato** e **firma**;
- **versioni immutabili citate dalla compilazione** (ADR-0040);
- slug pubblico non indovinabile, apertura e chiusura del modulo;
- coda di approvazione: **solo l'approvazione scrive in anagrafica**, mai la
  compilazione;
- controllo duplicati, anteprima, duplicazione del modulo;
- allegati su Attachment Core, `owner_type: "form"`.

> **Nessun secondo form builder. Nessuna riga di builder in questa Wave.**

### 9.2 Cosa manca, e sono due cose sole

| Manca | Cosa aggiunge la Wave |
|---|---|
| Una compilazione **non produce un documento** | All'approvazione, la compilazione puo rendere una versione di modello e generare un `generated_document` con la compilazione come **data source**. La domanda del modulo diventa il segnaposto del documento |
| Una spunta di consenso **non produce un consenso** | Un campo puo essere marcato `consent:<key>`: all'approvazione nasce un `consent_record` che cita la versione del consenso, con la compilazione come evidenza |

Le quattro cose che il perimetro chiede al modulo pubblico — compilare dati,
creare o aggiornare la persona, raccogliere il consenso, allegare documenti —
**tre sono gia li**. La quarta, «generare il documento finale», e questa lane
(W3-F).

---

## 10 — OCR e lettura documenti

### 10.1 Verifica: esiste gia, ed e un vantaggio competitivo

La proposta «foto documento → estrazione dati → precompilazione» **e gia
implementata**. E il vantaggio **V-09** del gap audit: Golee non ce l'ha.

| Pezzo | File |
|---|---|
| Motore | `tesseract.js` (dipendenza dichiarata), locale, worker a import dinamico |
| Riconoscimento | `src/lib/document-scan.ts` — cognome, nome, data, luogo, numero documento, scadenza, da documento d'identita italiano |
| Contratto | `src/lib/document-extraction.ts` — `DocumentExtractionProvider`: si cambia motore senza toccare nessun form |
| UI | `src/components/forms/document-extraction-field.tsx`, montato in **cinque** schermate: atleta, socio, staff, allenatore, creazione atleta |
| Regola | **si propone, non si scrive**: il risultato e una proposta che qualcuno accetta campo per campo |
| Privacy | il file **non lascia il browser** |

### 10.2 Classificazione

| Cosa | Quando | Perche |
|---|---|---|
| Lettura di documenti d'identita da immagine con precompilazione | **GIA FATTO** | vedi sopra |
| **Lettura di PDF** | **V1.1** | `tesseract.js` non legge PDF: servirebbe rasterizzare con `pdfjs-dist`, ~1 MB su ogni sessione per una funzione usata una volta per anagrafica. Il modo giusto e un **secondo provider**, e il contratto esiste apposta. Oggi il PDF viene **rifiutato con una spiegazione**, non accettato per poi fallire |
| **Estrazione lato server o con un modello AI** | **POST-V1**, con decisione a se | Precisione: un OCR sbaglia, e su un tesseramento un dato non confermato diventa un errore federale. Privacy: mandare la carta d'identita di un **minore** a un servizio esterno richiede base giuridica, DPA e informativa — non una riga di codice. Costi: per anagrafica, ricorrenti. Revisione manuale: resterebbe comunque obbligatoria, quindi il guadagno e minore di quanto sembri |
| **Lettura di certificati medici** (data di scadenza dal PDF) | **POST-V1** | E il caso con il miglior rapporto valore/rischio dopo il documento d'identita, ma dipende dal PDF (V1.1) |

> **In Wave 3: NO ACTION.** Nessun prototipo, nessuna spesa. Questa sezione e
> l'assessment richiesto, e il suo esito e «non ora».

---

## 11 — Scadenze e documenti ricorrenti

### 11.1 Verifica

| Documento | Ha una scadenza governata? |
|---|---|
| Certificato medico | **Si**: `medical_certificates.expiry_date`, colonna vera, con stato, avvisi in dashboard e in convocazione, e la regola `AUT-03` di Wave 2 con anticipi 30/7/0 |
| Contratto di lavoro sportivo | **Si, ma altrove**: `sport-work-scheduler.ts` avvisa a 7 e 14 giorni. Deliberatamente **non** migrato su Wave 2 (`catalog.ts`), perche tocca denaro in uscita |
| Documento d'identita | **No**: `documentExpiry` e una stringa in un JSON libero (`simplified-db.ts:3898`), nessuno la guarda |
| Attestato BLSD | **No**: e una `category` di allegato, senza data |
| Assicurazione, altri documenti | **No** |
| **Qualunque allegato** | **No**: `attachments` non ha `valid_from` ne `valid_until` |

### 11.2 Verdetto: `EXTEND`, e per due terzi non si scrive niente

> **Nessun secondo scheduler.** Il motore di Wave 2 e gia tutto quello che
> serve: valutatore notturno, fino a tre anticipi per regola, deduplica
> permanente per occorrenza, registro delle consegne, riepilogo giornaliero,
> porta cron, schermata di configurazione, regole **nate spente**.

Manca **una** cosa: una fonte canonica della validita di un documento. Oggi non
c'e niente su cui innescare.

**La proposta, in due mosse:**

1. **Due colonne su `attachments`**: `valid_from`, `valid_until`, nullable.
   E un `EXTEND` di una tabella esistente, non un archivio nuovo. Lo **stato**
   (valido / in scadenza / scaduto) **non si scrive mai**: si deriva dalla data
   e da oggi, come lo stato di una rata e quello di una scadenza del lavoro
   sportivo;
2. **Un quinto innesco** in `AUTOMATION_TRIGGERS`: `document_expiry`, direzione
   `before`, anticipi predefiniti `[30, 7]`, pubblico `both`,
   `allowEconomic: false`, con un filtro per `category` — perche «avvisami per
   i BLSD» e «avvisami per i documenti d'identita» sono due regole diverse.

Il certificato medico **resta su `AUT-03`** e non viene migrato: ha un modello
proprio con una semantica propria (mancante / in scadenza / scaduto), funziona,
e riscriverlo sarebbe un refactor con zero guadagno per l'utente su un giro che
parte ogni mattina.

**Effort: S.** E la lane piu piccola della Wave, ed e **completamente
indipendente** dal resto (§15).

---

## 12 — Generazione massiva

### 12.1 Il caso

«Seleziono venti atleti, genero venti attestazioni, le stampo.» Oggi sono venti
aperture di scheda. E il gap G-43, ed e uno dei pochi punti dove Golee ha
qualcosa che noi non abbiamo (`allow_bulk_print`).

### 12.2 La forma, e il vincolo del PDF

Non c'e un motore PDF (§3.4). Quindi:

| | **V1.1 — quello che facciamo** | **Rimandato** |
|---|---|---|
| Generazione | N righe in `generated_documents`, tutte con lo stesso `batch_id` | — |
| Consegna | **un fascicolo HTML unico**, un documento per pagina con `page-break-after`, che il browser stampa in un PDF solo | ZIP di N PDF separati |
| Perche | Un fascicolo unico e piu utile del ZIP per il caso vero — trenta richieste di visita si stampano insieme — e non richiede nessuna dipendenza nuova | Il ZIP ha senso solo se ogni documento e un **file**, e un file vuol dire PDF: e un ADR a se |
| Naming | Quando i file arriveranno, il nome lo compone gia `attachment-names.ts`: `Attestazione_Rossi_Mario_2026-08-29.pdf` | — |

### 12.3 Le regole del lotto

Riprese **tali e quali** dall'invio a lotti di Wave 2, che gia le ha collaudate
(`src/lib/server/communications.ts`):

1. **`batch_id` dichiarato dal client**, come `communication_id`: senza, il
   secondo lotto non saprebbe chi e gia stato servito. E cio che ha reso
   l'invio di Wave 2 ripartibile dopo un ricaricamento della pagina
   (`7b71b41`);
2. **lotti da al piu 50 documenti** (non 200 come i messaggi: qui ogni elemento
   e una risoluzione di segnaposto con letture di cassa e presenze);
3. **errore parziale = documento in meno, non lotto perso**: chi fallisce
   compare nell'esito con **il motivo** — proprio come gli esclusi di una
   comunicazione massiva — e il lotto continua;
4. **idempotenza**: rieseguire lo stesso `batch_id` non genera doppioni;
5. **anteprima prima di generare**: quanti documenti, quanti segnaposto
   irrisolti in totale, e su quali soggetti. Generare cento fogli e accorgersi
   dopo che novanta hanno il codice fiscale bianco non e accettabile;
6. **un lotto e un evento di audit solo**, non cento.

---

## 13 — Permessi e privacy

Un documento generato puo contenere **dati personali** (sempre), **economici**
(attestazione di pagamento), **sanitari** (certificato) e **di minori** (quasi
sempre). E la superficie piu delicata della Wave.

### 13.1 Il difetto da chiudere prima di aprire le lane

`/modulistica` sta fra i percorsi gestionali ma **non** fra quelli riservati
alla direzione (`access-roles.ts:82`), mentre la rotta che genera il documento
compilato richiede `canManageClubConfiguration`. In piu `document_templates` e
in `CLUB_RESOURCE_TYPES`, quindi collaboratore e staff hanno **CRUD generico
sui modelli** attraverso il registro.

Il risultato: un collaboratore apre la pagina, puo **modificare** i modelli
societari, e non puo generare niente. E incoerente in tutte e tre le
direzioni.

> **Va chiuso nella barriera, prima delle lane** (§14). Non e una rifinitura: e
> la fondazione su cui si appoggia tutto il resto del paragrafo.

### 13.2 La matrice

Nessun sistema di permessi nuovo: si usa `access-roles.ts`, il permesso
esistente `canManageClubConfiguration`, e — solo dove il dato lo impone — il
permesso di dominio `sport_work.read`, che esiste gia.

| Azione | owner | club_manager | collaborator | staff | trainer | parent |
|---|---|---|---|---|---|---|
| Vedere l'elenco dei modelli | si | si | **si (lettura)** | **si (lettura)** | no | no |
| Creare, modificare, pubblicare un modello | si | si | **no** | **no** | no | no |
| Generare un documento **senza** dati economici o sanitari | si | si | **si** | **si** | no | no |
| Generare un documento **con** importi | si | si | no | no | no | no |
| Generare un documento con **compensi** (`relationship.*`) | solo con `sport_work.read` | solo con `sport_work.read` | no | no | no | no |
| Generare un documento con **dati sanitari** | si | si | no | no | no | no |
| Generazione massiva | si | si | solo modelli senza dati economici | idem | no | no |
| Leggere un documento generato | si | si | **solo quelli che ha generato** | idem | no | no |
| Scaricare / ristampare | come sopra | come sopra | come sopra | idem | no | no |
| Marcare «firmato», caricare la copia firmata | si | si | si | si | no | no |
| Vedere i propri documenti (area famiglia) | — | — | — | — | — | **solo i propri, e solo se il club li ha condivisi** |
| Definire un consenso e le sue versioni | si | si | no | no | no | no |
| Registrare accettazione o revoca | si | si | si | si | no | **si, sui propri** |
| Leggere lo stato dei consensi | si | si | si | si | no | **solo i propri** |

**Perche il collaboratore perde la scrittura sui modelli.** Non e una
restrizione gratuita: un modello e il testo con cui la societa dichiara cose
per iscritto, con il timbro e la firma del presidente sopra. E configurazione
societaria, esattamente come il conto corrente e la firma stessa. Che oggi sia
scrivibile e un effetto collaterale del CRUD generico, non una decisione.
**Va dichiarato come cambio di comportamento**, non fatto in silenzio.

### 13.3 Le regole non negoziabili

1. **Ogni query passa da `organization_id`.** Un `template_id` di un altro club
   risponde «Accesso negato», mai il messaggio dell'ORM. Vale per modelli,
   versioni, documenti generati, consensi;
2. **qualunque perdita cross-tenant = CRITICAL**, e la UAT la prova con
   identificativi veri di due club veri (§19);
3. **il documento generato non e un `attachment`** (§2.4, §3.4): non entra
   nell'endpoint che ogni membro del club puo leggere;
4. **un segnaposto sensibile non esce mai bianco per mancanza di permesso**: la
   generazione si rifiuta e dice quale chiave (§4.3);
5. **un errore di autorizzazione contiene «Accesso negato»**, che e la stringa
   da cui il route handler ricava il 403;
6. **ogni generazione e un evento di audit**: chi, quale modello, quale
   versione, quale soggetto, quali chiavi sensibili. Un lotto e **un** evento;
7. **nessun `password_hash`, token o codice** e nel catalogo dei segnaposto, e
   il catalogo e chiuso: non c'e modo di nominarli.

---

## 14 — I workstream paralleli

Sette lane piu una barriera. La barriera e un commit a se: la Wave 2 ha
imparato che tre migrazioni scritte in parallelo collidono sui timestamp e che
quattro copie della stessa matrice dei permessi restano indietro in silenzio.

### W3-BARRIERA — schema, permessi, contratto dei segnaposto

**Prima di tutto, e da sola.**

- le migrazioni: `document_templates`, `document_template_versions`,
  `generated_documents`, `consent_definitions`, `consent_versions`,
  `consent_records`, piu `valid_from` / `valid_until` su `attachments`;
- la matrice del §13, scritta **una volta**: `/modulistica` fra i percorsi
  riservati alla direzione, `document_templates` fuori da `CLUB_RESOURCE_TYPES`
  e dentro `DOMAIN_OWNED_RESOURCE_ITEM_TYPES` se resta raggiungibile dal
  registro generico;
- il contratto dei segnaposto: i quattro attributi del §4.2 sui tipi, **senza**
  ancora risolverli.

Effort **S**. Rischio **alto** se saltata.

### W3-A — Template Core e versioning

`src/lib/server/document-templates.ts` (proprietario), il modello puro, le
rotte, la migrazione da `clubs.document_templates`, e la rimozione di `DOC-02`
e `DOC-03` — che sono le due implementazioni che questa lane sostituisce.
Effort **L**. Rischio **medio**.

### W3-B — Catalogo dei segnaposto e soggetti

I quattro attributi risolti, il soggetto oltre l'atleta, la chiusura di
`DOC-04`, l'editor che propone solo cio che sa riempire. Tocca
`documents/placeholders.ts`, `server/document-placeholders.ts` e la rotta
`filled`. Effort **M**. Rischio **basso**: il catalogo ha gia un test di
contratto che impedisce che ne nasca un secondo.

### W3-C — Dominio dei consensi

Le tre tabelle, lo stato derivato, la revoca, la schermata. **Non tocca il
Template Core**: un consenso non ha bisogno di un documento per esistere.
Effort **M**. Rischio **medio**.

### W3-D — Catalogo V1

I dieci modelli come **contenuto**, la proposta al club, la schermata di
adozione. E la lane piu **editoriale** e la meno tecnica: va scritta contro il
motore finito, non insieme. Effort **M** (di scrittura, non di codice).
Rischio **basso** tecnicamente, **medio** redazionalmente (§18).

### W3-E — Generazione massiva

Selezione, lotto, fascicolo, esito con i motivi, idempotenza. Riusa il ciclo a
lotti di Wave 2. Effort **M**. Rischio **medio** (prestazioni, §20).

### W3-F — Modulistica pubblica → documento e consenso

All'approvazione: genera il documento, registra il consenso. **Nessun builder
nuovo.** Effort **M**. Rischio **basso**.

### W3-G — Scadenze documentali

Le due colonne, il quinto innesco, la schermata che le mostra. **Indipendente
da tutto il resto della Wave**: puo partire con la barriera e chiudersi per
prima. Effort **S**. Rischio **basso**.

### W3-H — OCR

**Non esiste come lane.** L'assessment e il §10, e il suo esito e NO ACTION. Se
qualcuno la volesse riaprire, il primo passo e il provider PDF, ed e V1.1.

---

## 15 — Il DAG e l'ordine di merge

```
                        W3-BARRIERA
                (schema + permessi + contratto)
                             |
        +--------------------+--------------------+
        |                    |                    |
      W3-A                 W3-C                 W3-G
  Template Core          Consensi          Scadenze doc.
   + versioning                            (indipendente,
        |                    |              chiude per prima)
        +---------+----------+
                  |
        +---------+----------+
        |                    |
      W3-B                 W3-F
   segnaposto        moduli -> documento
   e soggetti           e consenso
        |                    |
        +---------+----------+
                  |
        +---------+---------+
        |                   |
      W3-E                W3-D
     massiva          catalogo V1
```

### 15.1 Chi puo partire insieme

| Insieme | Lane | Perche non collidono |
|---|---|---|
| **Subito dopo la barriera** | **W3-A**, **W3-C**, **W3-G** | Tre domini disgiunti: `document_templates`, `consent_*`, `attachments` + `automations/catalog.ts`. Nessun file in comune |
| **Seconda ondata** | **W3-B**, **W3-F** | B possiede il risolutore, F possiede l'approvazione delle compilazioni. Si incontrano su **una** chiamata, che va concordata nella barriera |
| **Terza** | **W3-E**, **W3-D** | E consuma il motore, D lo riempie di contenuto. Non si toccano |

### 15.2 Chi ha bisogno della barriera di schema

**Tutte.** Sei tabelle e due colonne in un solo commit, prima di aprire
qualunque lane. E la lezione di Wave 2, e ha funzionato.

### 15.3 Chi scrive sugli stessi proprietari

| Proprietario | Chi scrive | Regola |
|---|---|---|
| `src/lib/server/document-templates.ts` | **solo W3-A** | B, D, E lo **leggono**. Nessun altro `INSERT` su quelle tre tabelle |
| `src/lib/documents/placeholders.ts` | **solo W3-B** | La barriera ci mette i **tipi**; i valori li mette B |
| `src/lib/server/consents.ts` | **solo W3-C** | F crea record **chiamando C**, non scrivendo la tabella |
| `src/lib/automations/catalog.ts` | **solo W3-G** | Nessun'altra lane aggiunge inneschi |
| `src/lib/access-roles.ts` | **solo la barriera** | Una matrice, un commit |
| `src/app/modulistica/page.tsx` | **W3-A**, poi **W3-D** | E un monolite di 1.603 righe con dentro due implementazioni morte: A le rimuove e scompone, D aggiunge il catalogo. **Mai in parallelo** |

### 15.4 Ordine di merge

**BARRIERA → W3-G → W3-A → W3-C → W3-B → W3-F → W3-E → W3-D**

- **G subito dopo la barriera** perche e piccola, indipendente e chiude un gap
  reale: se la Wave dovesse fermarsi, quello resta guadagnato;
- **A prima di B** perche B risolve segnaposto per una versione, e la versione
  la crea A;
- **D per ultima** perche un catalogo scritto contro un motore che sta ancora
  cambiando si riscrive due volte.

---

## 16 — EXTEND vs NEW: il quadro completo

**NEW CAPABILITY deve essere un'eccezione.** In questa Wave sono **due**, ed
entrambe hanno la stessa motivazione: *non esiste un dominio esistente il cui
proprietario possa ospitarle senza snaturarsi*.

### 16.1 NEW — due, motivate

| # | Cosa | Perche non e un EXTEND |
|---|---|---|
| **N-1** | **Document Template Core**: tre tabelle e il loro proprietario | L'alternativa e `clubs.document_templates`, un array JSON senza versioni, senza autore, scrivibile da collaboratore e staff, che convive con i residui dei moduli V1. Versioni immutabili e documenti che le citano **non stanno** in un array JSON: e la stessa identica situazione da cui i moduli online sono usciti con ADR-0039/ADR-0040. Ripetiamo una strada gia percorsa, non ne apriamo una |
| **N-2** | **Consent domain**: tre tabelle e il loro proprietario | L'alternativa e `form_submissions`, che e **immutabile per costruzione** e non puo rappresentare una revoca. Un consenso e uno stato di una persona, non una risposta a una domanda. La distinzione e la stessa che ADR-0086 ha gia fatto fra presenza e intenzione |

### 16.2 EXTEND — dodici

| # | Cosa | Dominio esistente |
|---|---|---|
| E-1 | Soggetti oltre l'atleta nel risolutore | `src/lib/server/document-placeholders.ts` |
| E-2 | Contesto, sensibilita e comportamento sul nullo nel catalogo | `src/lib/documents/placeholders.ts` |
| E-3 | Segnaposto della persona sportiva e del rapporto | stesso catalogo, dati da `sport-work` |
| E-4 | Quinto innesco `document_expiry` | `src/lib/automations/catalog.ts` |
| E-5 | Validita di un documento (`valid_from`, `valid_until`) | tabella `attachments` |
| E-6 | Ciclo a lotti per i documenti | il pattern di `src/lib/server/communications.ts` |
| E-7 | Naming dei documenti in un fascicolo | `src/lib/attachment-names.ts` |
| E-8 | Protocollo del documento generato | `document_number_sequences` + `src/lib/documents/numbering.ts` |
| E-9 | Firma e timbro dentro i documenti nuovi | `src/lib/server/club-signature.ts` |
| E-10 | Consegna del fascicolo stampabile | `src/lib/server/stored-file-response.ts` |
| E-11 | Compilazione che genera un documento e un consenso | `src/lib/server/form-submissions.ts` |
| E-12 | Permessi e matrice | `src/lib/access-roles.ts` |

### 16.3 NO ACTION — otto

Moduli ASL regionalizzati (G-44) · contratti Co.Co.Co. (G-16, POST-V1) ·
unione PDF dei consensi (C-126, gia respinta) · OCR in questa Wave ·
generazione PDF lato server (ADR a se) · ZIP di documenti (dipende dal PDF) ·
dichiarazione di tesseramento (dipende da G-30) · firma elettronica
qualificata.

---

## 17 — Cosa non copiamo da Golee

| # | Cosa | Perche no |
|---|---|---|
| **1** | **Il catalogo di 77 modelli** | Non e una funzionalita, e un **presidio redazionale permanente**. Un catalogo che nessuno mantiene invecchia, e un modello invecchiato che porta il timbro del club e peggio di nessun modello. Dieci mantenuti valgono piu di settantasette abbandonati |
| **2** | **I 33 modelli di visita medica regionalizzati, 30 dei quali fino alla singola ASL** | E il **fossato editoriale** di Golee, non un vantaggio tecnico: significa una persona che ogni anno telefona a trenta aziende sanitarie. Non lo apriamo, e non fingiamo di poterlo colmare. Il motore permette al club di caricare **il suo** modulo e compilarlo con i dati veri: e il 90% del valore all'1% del costo |
| **3** | **Il template HTML libero e incontrollato** | Un editor che accetta qualunque cosa produce documenti che il risolutore non sa compilare — e il reperto ce l'abbiamo in casa: il «generatore IA» di `/modulistica` scrive `{{first_name}}` e `{{fiscalCode}}`, che **non sono nel catalogo** e resteranno bianchi per sempre. Il catalogo resta chiuso, e chi scrive un modello vede solo cio che si puo riempire |
| **4** | **I 34 trigger cablati** (gia rifiutati in Wave 2, vale anche qui) | Vale la stessa regola per i modelli: quello che il prodotto promette, il prodotto lo mantiene |
| **5** | **La firma elettronica qualificata promessa e non spiegata** | Golee arriva al `.p7m`. Noi, finche non abbiamo un prestatore di servizi fiduciari, **non chiamiamo firma digitale** un'immagine o una casella. Diciamo «accettazione elettronica» e diciamo cosa prova |
| **6** | **Modelli duplicati per contesto** | Un'attestazione con importi e una senza sono **due modelli** solo se il permesso lo impone (ed e il nostro caso, §13). Non se ne creano trenta varianti per trenta sfumature: quello e il modo in cui un catalogo passa da 10 a 77 senza che nessuno decida |
| **7** | **Processi manuali travestiti da software** | Golee «documenta» il ciclo di firma ma il documento lo firma qualcuno su carta. Se una cosa la fa una persona, la schermata deve dirlo. Il nostro stato «firmato» significa **una copia firmata e rientrata**, e lo dichiara |
| **8** | **Il lock commerciale sui documenti** | Un documento generato con i dati del club **e del club**. Esce in HTML stampabile e i suoi dati escono in CSV, come gia fanno elenchi e rendiconti. Non esiste un formato nostro da cui non si esce |

---

## 18 — Ownership redazionale

E il punto piu importante di questo planning, ed e l'unico che non si risolve
scrivendo codice.

> **Se EasyGame distribuisce un modello, EasyGame risponde di cosa c'e scritto
> dentro.** Non «si e limitata a fornire uno strumento»: quel foglio esce con
> il logo del club, ma l'ha scritto il fornitore.

### 18.1 Le tre classi

| Classe | Cosa e | Chi lo mantiene | Cosa distribuiamo |
|---|---|---|---|
| **A — GENERIC** | Testi che dicono **fatti del gestionale**: chi ha versato quanto, chi ha frequentato quante ore, chi e iscritto, chi delega chi al ritiro | **EasyGame**, sostenibile: il testo cambia solo se cambia il prodotto | **Il modello completo.** Sono i dieci del §6 |
| **B — FEDERATION / REGION SPECIFIC** | Moduli della federazione, della regione, della ASL. Cambiano per decisione di terzi, senza preavviso, e sono diversi in ogni provincia | **Nessuno che abbiamo.** Manutenzione non sostenibile | **Niente.** Il club carica il suo modulo e lo compila con i segnaposto. Il valore arriva lo stesso, il presidio no |
| **C — LEGAL / FISCAL** | Contratti di lavoro sportivo, informative privacy, autocertificazioni, verbali. Un errore qui costa al club piu di quanto il modello gli faccia risparmiare | **Un professionista**, non noi | **Uno scheletro dichiarato tale**, con un avviso visibile: «testo da far validare». Oppure niente. Mai un testo che sembri approvato quando non lo e |

### 18.2 Le tre regole che ne discendono

1. **Ogni modello di piattaforma porta la sua classe in chiaro**, visibile a chi
   lo adotta. Un club deve sapere se sta prendendo un foglio pronto o uno
   scheletro da far controllare;
2. **ogni modello di piattaforma ha una data di revisione.** Un modello senza
   data e un modello che nessuno controlla;
3. **il catalogo non cresce senza che qualcuno accetti di mantenerlo.**
   Aggiungere l'undicesimo modello e una decisione con un costo ricorrente, non
   una riga di contenuto.

### 18.3 Il rischio dichiarato

Il catalogo V1 e **dieci modelli di classe A**, piu il testo privacy
distribuito come scheletro di classe C dichiarato. Se anche solo questi dieci
non trovano un proprietario redazionale, **il catalogo non va distribuito**: si
rilascia il motore e si lascia che ogni club scriva i suoi. Il motore da solo
vale gia la Wave; il catalogo abbandonato la fa perdere.

---

## 19 — La UAT, decisa prima del codice

Uno script `scripts/wave-3-documents-uat.mjs`, contro un'applicazione **vera**
con un database vero, sul modello dei 67 controlli di Wave 2 e dei 43 di
Wave 1. Gli scenari si scrivono **adesso**, prima del codice, perche uno
scenario scritto dopo descrive quello che il codice fa.

### 19.1 Motore e versioni

| # | Scenario | Atteso |
|---|---|---|
| 1 | Pubblico un modello, genero un documento, **modifico il modello**, ripubblico | Il documento gia generato e **identico byte per byte**. La versione citata e ancora la prima |
| 2 | Genero da una **bozza** non pubblicata | Anteprima si, riga in `generated_documents` **no** |
| 3 | Cancello un modello con documenti generati | Rifiutato: si archivia. La citazione resta risolvibile |
| 4 | Un modello adottato dal catalogo, poi modificato dal club | Il modello di piattaforma non cambia. La copia del club e sua |
| 5 | Genero due volte lo stesso documento per lo stesso soggetto | Due righe distinte, due protocolli distinti, nessuna sovrascrittura |

### 19.2 Segnaposto e soggetti

| # | Scenario | Atteso |
|---|---|---|
| 6 | Modello con un segnaposto **fuori catalogo** | Campo vuoto **dichiarato** in `unresolved`, non «undefined» |
| 7 | Atleta senza codice fiscale | Campo bianco, chiave in `missing`, e la schermata lo dice **prima** di generare |
| 8 | Modello con soggetto «atleta» che usa `{{trainer.*}}` | L'editor **non propone** quelle chiavi. Se sono nel testo, finiscono in `unresolved` |
| 9 | Documento su un **allenatore** | Nome, ruolo e rapporto risolti dal soggetto giusto |
| 10 | Documento sul **club** soltanto (nessuna persona) | Si genera, senza segnaposto di persona |
| 11 | Attestazione su un atleta con rata scontata e incasso parziale | L'importo e **il denaro entrato**, non il dovuto della rata marcata pagata (ADR-0068) |
| 12 | Firma e timbro caricati / non caricati | Immagine nel primo caso; riquadro tratteggiato **e avviso prima di generare** nel secondo |
| 13 | Cognome scritto `<script>alert(1)</script>` | Compare come testo. Nessuno script eseguito, in anteprima e nel fascicolo |
| 14 | **Unicode**: `Nicolo D'Angio`, `Ozturk`, `Duric`, apostrofi e accenti | Corretti a schermo, nel fascicolo stampato e nel nome del file |

### 19.3 Massiva

| # | Scenario | Atteso |
|---|---|---|
| 15 | **100 documenti** su 100 atleti veri | Tutti generati, 100 righe, un solo `batch_id`, un solo evento di audit |
| 16 | Fra i 100, tre atleti senza codice fiscale | 100 documenti generati, tre **elencati** con il motivo. Il lotto non si ferma |
| 17 | Ricarico la pagina a meta lotto e riprendo | Riprende da dove era, non ricomincia — come l'invio a lotti di Wave 2 |
| 18 | Rieseguo lo stesso `batch_id` | Zero documenti nuovi |
| 19 | Un soggetto di **un altro club** dentro la selezione | «Accesso negato». Nessun documento del lotto contiene i suoi dati |

### 19.4 Consensi

| # | Scenario | Atteso |
|---|---|---|
| 20 | Accetto, poi **revoco**, poi riaccetto | Tre righe, stato attuale «accettato», storico completo e interrogabile |
| 21 | Pubblico una versione nuova del consenso | I record vecchi restano validi e **segnalati** come dati su una versione precedente |
| 22 | Compilazione pubblica con campo consenso, poi approvazione | Nasce un `consent_record` che cita la versione, con la compilazione come evidenza |
| 23 | Revoco il consenso immagini | Lo stato cambia. La prova del consenso dato prima **resta** |

### 19.5 Permessi e multi-tenant

| # | Scenario | Atteso |
|---|---|---|
| 24 | **Collaboratore** apre `/modulistica` | Vede i modelli, **non li modifica**, genera solo cio che non ha importi. Nessun 403 su un pulsante che la pagina gli ha mostrato |
| 25 | **Allenatore** chiama a mano le rotte dei documenti | 403 su tutte |
| 26 | **Genitore** chiede il documento di un altro atleta | 404, non 403: non deve sapere che esiste |
| 27 | **Cross-tenant**: `template_id`, `version_id`, `generated_document_id`, `consent_record_id` del club A usati con la sessione del club B | Quattro «Accesso negato», mai il messaggio dell'ORM. **Qualunque fuga qui e CRITICAL** |
| 28 | Documento con importi generato da chi non puo vederli | **Rifiutato con la chiave e il motivo**, non generato con il campo bianco |
| 29 | Documento con compensi generato da chi non ha `sport_work.read` | Rifiutato |
| 30 | L'identificativo di un `generated_document` provato su `/api/v1/attachments/:id` | 404. Un documento generato **non e** un allegato |

### 19.6 Scadenze

| # | Scenario | Atteso |
|---|---|---|
| 31 | Allegato con `valid_until` fra 30 giorni, regola accesa | **Un** messaggio. La seconda esecuzione dello stesso giorno: zero |
| 32 | Due giri in parallelo | Un messaggio solo (la deduplica di Wave 2 regge) |
| 33 | Regola spenta | Silenzio |
| 34 | Certificato medico | Continua a passare da `AUT-03`, **non** dal quinto innesco. Nessun doppione |

### 19.7 Trasversali

| # | Scenario | Atteso |
|---|---|---|
| 35 | Anteprima e stampa del fascicolo su Chrome e Firefox | Impaginazione corretta, un documento per pagina |
| 36 | Sostituzione della copia firmata | La versione precedente non si perde; lo stato dice cosa e successo |
| 37 | **Responsive** a 375 / 768 / 1280 su `/modulistica`, editor, anteprima, selezione massiva | `scrollWidth` mai oltre la viewport; le tabelle scorrono nel proprio contenitore |
| 38 | Regressione sui domini toccati: attestazione di Wave 1, moduli online, allegati, automazioni | Tutti i test verdi, nessun comportamento cambiato senza che sia dichiarato |

### 19.8 Cosa fa fallire la UAT

Un solo controllo cross-tenant rosso. Un documento storico che cambia dopo la
modifica del modello. Un importo su un documento che non coincide con il
registro incassi. Un dato economico o sanitario visibile a chi non deve. Un
lotto che perde documenti in silenzio. Un segnaposto che esce «undefined».

---

## 20 — Prestazioni

Benchmark **prima** della fine della Wave, con lo stesso metodo di
`scripts/measure-web-v1-performance.mjs`.

| Misura | Soglia | Perche quella |
|---|---|---|
| Render di **un** documento (server, risoluzione compresa) | **< 400 ms** | Ogni documento legge cassa e presenze dell'atleta: e la stessa lettura che oggi fa `filled`, e va misurata prima di moltiplicarla per cento |
| **10** documenti | **< 3 s** | Il caso normale di una segreteria |
| **100** documenti, a lotti da 50 | **< 30 s complessivi**, nessun lotto oltre i 15 s | Il limite vero e il timeout della funzione. Wave 2 ha gia dimostrato che un giro senza budget di tempo **e** il timeout (`W2-12`): non ripetiamo l'errore |
| Peso del **fascicolo** da 100 documenti | **< 8 MB** di HTML | Sopra, il browser fatica a stamparlo. Se si supera, il lotto va diviso e va **detto**, non troncato in silenzio |
| Elenco dei modelli | **< 200 ms**, e **senza** il contenuto HTML | Oggi ogni lettura del club porta con se tutti i modelli con il loro HTML: e uno dei guadagni gratuiti dello spostamento fuori dalla colonna JSON |
| Riga di `generated_documents` | **< 200 kB** mediana | Un documento sopra quella soglia contiene quasi sempre un'immagine incorporata, e va guardato |

**Cosa cercare esplicitamente:** l'HTML della firma e del timbro e un `data:`
URL, e finisce **dentro** ogni documento generato. Su cento documenti sono
cento copie della stessa immagine. Va misurato, e se pesa, il fascicolo deve
portarla una volta sola.

---

## 21 — Pre-production challenge

Per ogni voce: cosa **impedisce** la produzione, cosa e **importante**, cosa
puo aspettare.

| Voce | Classificazione | Motivo |
|---|---|---|
| **W3-14** — `/modulistica` accessibile a chi non puo generare, modelli scrivibili da collaboratore | **IMPORTANT** | E l'unica voce di questa Wave con un profilo di sicurezza. Non e un blocker di produzione perche non e una fuga di dati, ma e incoerenza fra pagina, rotta e CRUD: va chiusa nella barriera |
| **W3-04** — i modelli non hanno versioni | **IMPORTANT** | Oggi il rischio e teorico perche i modelli sono pochi e i documenti non esistono come record. Diventa grave **il giorno dopo** che esistono |
| **W3-03** — il documento generato non e un record | **V1.1** | E la funzionalita, non un difetto della produzione |
| W3-01, W3-02, W3-05, W3-06, W3-07, W3-08 | **V1.1** | Sono la Wave |
| W3-09 (contratti), W3-10 (ASL), OCR server, PDF server, ZIP | **POST-V1 / NO ACTION** | §16.3, §17, §18 |

### Il verdetto, ed e importante che sia esplicito

> **Nessun gap della Wave 3 e un blocker di produzione.**

I blocker restano quelli gia noti e **fuori da questa Wave**: l'ambiente di
produzione (G-02 / X-1) e il giro sandbox di Stripe (R-16 / `W2-06`).

E soprattutto: **il fossato editoriale di Golee non e un blocker tecnico.**
Settantasette modelli sono un vantaggio commerciale che si compra con una
persona, non con un rilascio. Trattarlo come un requisito di ingegneria
significherebbe fermare la produzione per una cosa che la produzione non
richiede.

---

## 22 — L'audit obbligatorio di fine Wave

Stesso standard di Wave 1 e Wave 2, senza sconti:

1. **UAT a runtime** contro un'applicazione vera, con lo script del §19. Non
   una simulazione, non un test unitario travestito;
2. **quattro revisioni indipendenti e parallele**: correttezza, sicurezza e
   multi-tenant, duplicazione e ownership dei domini, aderenza al planning;
3. **remediation** di tutto cio che le quattro trovano;
4. **seconda revisione** sopra le correzioni — Wave 2 ha trovato cose **dietro**
   le prime correzioni (`238f1b9`), e non e stato un caso;
5. **0 Critical, 0 High** per dichiarare la Wave chiusa;
6. **CI verde**: `npm test`, `npm run typecheck`, `npm run lint` (0 errori,
   warning non in aumento), `npm run build`;
7. **deploy su staging** e smoke test;
8. **cleanup**: `DOC-02` e `DOC-03` rimossi, non annotati;
9. **gap matrix aggiornata** con la stessa regola delle Wave precedenti —
   `CLOSED` **solo** con una prova a runtime, e `PARTIAL` dichiarato dove il
   codice gira in un posto diverso da dove il gap era nato.

---

## 23 — ADR da scrivere, contatori, effetto sulla gap matrix

### 23.1 Gli ADR che la Wave dovra lasciare

Il decision log arriva a **ADR-0087**. Questa Wave ne prevede cinque:

| # | Decisione |
|---|---|
| **ADR-0088** | I modelli di documento escono da `clubs.document_templates` e diventano tre tabelle, con versioni immutabili — sul modello di ADR-0039/ADR-0040 |
| **ADR-0089** | Un documento generato conserva la propria resa (`content_html`) e **non e un allegato**: sta fuori da Attachment Core, perche un allegato e leggibile da ogni membro del club |
| **ADR-0090** | Il consenso e uno **stato della persona** con revoca, non una risposta dentro una compilazione |
| **ADR-0091** | «Firma» significa quattro cose diverse: EasyGame ne implementa tre e **non chiama firma digitale** nessuna delle tre |
| **ADR-0092** | Il catalogo dei modelli si classifica per **ownership redazionale** (A/B/C), e cio che non e mantenibile non si distribuisce |

Un sesto ADR, **fuori da questa Wave**, resta da prendere: se e come
introdurre una generazione PDF lato server. Da quello dipendono lo ZIP, il
`.p7m` e l'archiviazione della fattura (`D38`).

### 23.2 Contatori

| Voce | Numero |
|---|---|
| Gap verificati | **14** |
| Da sviluppare | **8** (una barriera + sette lane) |
| `EXTEND` | **12** |
| `NEW` | **2** (Template Core, Consent domain) |
| `NO ACTION` | **8** |
| Modelli nel catalogo V1 | **10** (non 77) |
| Tabelle nuove | **6**, piu 2 colonne su `attachments` |
| Blocker di produzione introdotti | **0** |
| ADR previsti | **5** |
| Scenari UAT decisi prima del codice | **38** |
| Debiti chiusi dalla Wave | **3** (`DOC-02`, `DOC-03`, `DOC-04`) |
| Debiti dichiarati aperti | **2** (`DOC-01`, `D38`) |

### 23.3 Come cambierebbe la gap matrix

Se la Wave chiude come pianificata, in §3.10 del gap audit:

| Capability | Oggi | Dopo |
|---|---|---|
| C-116 libreria di modelli | `EG-` (1 vs 5) | `EG~` — dieci mantenuti contro settantasette, **per scelta dichiarata** |
| C-118 compilazione automatica | `EG~` (3 vs 5) | `=` o `EG+` — il nostro risolutore dichiara cosa non sa riempire |
| C-119 documento con gli importi | `EG-` (0 vs 4) | `EG+` — gli importi vengono dal registro incassi, non da uno stato |
| C-120 stampa massiva | `EG-` (0 vs 4) | `=` |
| C-121 ciclo di firma | `EG~` (2 vs 4) | `EG~`, con **onesta sul livello** (§8) |
| C-125 consenso con ciclo di vita | `EG~` (1 vs 4) | `EG+` — la revoca, che Golee ha, piu l'evidenza versionata |
| C-117 modelli ASL regionalizzati | `EG-` (0 vs 5) | **invariato**, e resta invariato per scelta |

`EG-` scenderebbe da 39 a **36**; `EG~` resterebbe intorno a **38**, con voci
che cambiano segno in entrambe le direzioni. Il totale resta **189**: una Wave
non aggiunge capability al confronto.

---

## 24 — Risultato per il club

| Prima | Dopo |
|---|---|
| «Nuovo documento» apre una pagina bianca con scritto «Inserisci il contenuto qui» | Dieci modelli pronti, scritti per una ASD italiana, che si adottano con un clic e restano tuoi |
| L'attestazione la scrive la segretaria copiando gli importi da una schermata | Il documento dice la cifra giusta, perche la legge dal registro incassi — e se un dato manca **lo dice prima**, invece di stampare un foglio con un buco |
| Trenta richieste di visita medica sono trenta aperture di scheda | Si selezionano trenta atleti e si stampa un fascicolo. Chi non si e potuto generare compare con il motivo |
| Correggi un modello e i documenti dell'anno scorso cambiano sotto i piedi | Un modello corretto e una versione nuova. Cio che hai gia consegnato resta com'era, per sempre |
| «Chi ha dato il consenso immagini?» si risponde aprendo le compilazioni una per una | Si risponde con un elenco. E quando qualcuno **revoca**, si sa quando lo ha dato e quando lo ha tolto |
| Il documento d'identita scaduto lo scopre chi lo cerca | Lo dice il gestionale, trenta giorni prima, con le stesse regole che il club gia governa per i certificati |
| «Chi ha rilasciato questa attestazione?» non ha risposta | Ha una riga: chi, quando, con quale modello, quale versione e quali numeri |

---

**Fine del planning. La Wave 3 non e iniziata.**
