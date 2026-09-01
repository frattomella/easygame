# 41 — Wave 6: planning esecutivo

> **Completamento funzionale per Club, Parent, Trainer e Athlete, e chiusura dei
> blocker pre-produzione.**
>
> Questo documento è un **piano**. Nessuna riga di codice è stata scritta,
> nessuna migrazione creata, nessun dato toccato. Le otto ricognizioni che lo
> precedono sono state **di sola lettura**.
>
> Redatto il 2026-09-01, dopo le Wave 1–5
> ([32](32-wave-1-implementation-uat.md), [34](34-wave-2-implementation-uat.md),
> [36](36-wave-3-implementation-uat.md), [38](38-wave-4-implementation-uat.md),
> [40](40-wave-5-implementation-uat.md)).

---

## Indice

1. [Baseline misurata a HEAD](#1--baseline-misurata-a-head)
2. [Il metodo, e le otto ricognizioni](#2--il-metodo-e-le-otto-ricognizioni)
3. [Quattro premesse del mandato che i fatti correggono](#3--quattro-premesse-del-mandato-che-i-fatti-correggono)
4. [Il fatto architetturale: due sistemi di permessi che non si parlano](#4--il-fatto-architetturale-due-sistemi-di-permessi-che-non-si-parlano)
5. [Il registro dei difetti: 61 voci verificate](#5--il-registro-dei-difetti-61-voci-verificate)
6. [Capability dichiarate e irraggiungibili](#6--capability-dichiarate-e-irraggiungibili)
7. [EXTEND contro NEW](#7--extend-contro-new)
8. [Cosa NON sviluppiamo](#8--cosa-non-sviluppiamo)
9. [Schema: le entità nuove](#9--schema-le-entità-nuove)
10. [Permission model dei ruoli personalizzati](#10--permission-model-dei-ruoli-personalizzati)
11. [I workstream](#11--i-workstream)
12. [File e domain ownership](#12--file-e-domain-ownership)
13. [Il DAG delle dipendenze](#13--il-dag-delle-dipendenze)
14. [Migrazioni](#14--migrazioni)
15. [Privacy, consensi e retention](#15--privacy-consensi-e-retention)
16. [Observability](#16--observability)
17. [OCR: la decisione](#17--ocr-la-decisione)
18. [W4-R7: la decisione](#18--w4-r7-la-decisione)
19. [UAT definita prima del codice](#19--uat-definita-prima-del-codice)
20. [Blocker pre-production](#20--blocker-pre-production)

---

## 1 — Baseline misurata a HEAD

Commit `81cdb63`, branch `integration/web-v1`, albero pulito. Misurata, non
citata.

| Gate | Esito |
|---|---|
| `npm test` | **3.966 test, 3.966 verdi, 0 falliti**, 140 s — discovery su 281 file |
| `npm run typecheck` | nessun output |
| `npm run lint` | **0 errori, 36 warning** |
| Perimetro | 166 route handler, 94 pagine, 48 migrazioni, 73 tabelle |
| Database di sviluppo | `easygame-dev-db` attivo, `EASYGAME_DB_ENV=development` |

**Divergenza da correggere nel primo commit**: [CLAUDE.md](../../CLAUDE.md) §4
dichiara «3.820 al 2026-09-01». Sono 3.966.

### Fatti di runtime, letti dal database e non dal codice

| Fatto | Conseguenza |
|---|---|
| `athletes.status` è **`text` libero**, nessun enum; 224 righe tutte `active` minuscolo | Il vocabolario degli stati non è imposto dal database: vive interamente nel codice, e oggi non c'è un posto solo dove viva |
| `athletes.user_id` **esiste** (nullable, `onDelete: SetNull`) | Il legame atleta → account non richiede una migrazione strutturale |
| `organization_users(organization_id, user_id, role)` unique, `role` **text libero**, **sei colonne in tutto** | Non c'è dove mettere né permessi né scope: i ruoli personalizzati richiedono tabelle nuove |
| `medical_certificates.expiry_date` esiste | La data che il genitore non vede è già nel dato |
| `audit_logs` ha quattro indici — per club, per attore, per azione, per data | Lo schema di una UI di audit è già pronto: manca il lettore |

---

## 2 — Il metodo, e le otto ricognizioni

Otto letture indipendenti e **parallele**, tutte in sola lettura, ognuna con un
dominio e il divieto di sconfinare. A ognuna è stato chiesto di citare
`file:riga` per ogni affermazione e di scrivere «non esiste» **mostrando il
comando** che glielo ha fatto concludere. È la regola delle Wave 4 e 5, e serve
per la stessa ragione: una parte consistente di ciò che segue contraddice sia la
documentazione sia il mandato, e senza una citazione non sarebbe distinguibile
da un'opinione.

| Lettura | Dominio | Esito in una riga |
|---|---|---|
| **A** | Elenco e scheda atleti | Gli stati atleta sono **tre**, non quattro; il filtro si spegne da solo; e un'azione di massa scrive in archivio un valore che non esiste |
| **B** | Area famiglia | «Paga ora» è disabilitato perché confronta un'etichetta italiana con token inglesi. La rotta di checkout della famiglia **esiste già e il client la chiama già** |
| **C** | Dashboard allenatore e ruolo atleta | Il ruolo `athlete` è modellato end-to-end — pagina, guardia, redirect, sessione, slegamento — e **nessun percorso lo assegna** |
| **D** | Documenti, moduli, iscrizione | Il fascicolo della Wave 5 ha quattro rotte e **zero consumatori nella UI**: la famiglia legge ancora l'array JSON di prima |
| **E** | Appuntamenti e segreteria | Dalla segreteria non si può **né confermare né rifiutare**: la schermata confronta nomi di azione con nomi di stato |
| **F** | Ruoli, permessi, scope | Cinque chiavi su una, tre cablate su `owner \|\| club_manager`, zero scope, e un `club_manager` che può creare una tessera `owner` |
| **G** | Privacy, retention, observability | Quindici percorsi di invio su quindici ignorano il registro dei consensi. Cancellare un atleta distrugge i certificati e lascia vivi allegati e consensi |
| **H** | OCR e classificazione contabile | L'OCR **funziona**: è `tesseract.js` nel browser, montato in cinque schermate |

---

## 3 — Quattro premesse del mandato che i fatti correggono

Il mandato è approvato e viene eseguito. Ma quattro delle sue premesse sono
false, e continuare come se fossero vere produrrebbe lavoro sbagliato. Le
dichiaro qui, prima del piano.

### 3.1 «Gli atleti sono attivi, sospesi, in prestito, disattivati» — sono **tre**

`athletes.status` conosce tre valori: `active`, `inactive`, `suspended`
([schema.prisma:324](../../prisma/schema.prisma)). «In prestito» e
«disattivato» sono **lo stesso valore `inactive`**, etichettato in quattro modi
diversi nello stesso file:

| Riga | Etichetta per `inactive` |
|---|---|
| `athletes/page.tsx:1115` | «In Prestito» |
| `athletes/page.tsx:1856` | «Disattivati» |
| `athletes/page.tsx:251` | «Atleti in Prestito» |
| `athletes/page.tsx:2379` | «disattivato» |

Il cliente vede quattro filtri perché la pagina stampa quattro nomi per un
valore solo. Il mandato chiede un test di regressione su
`ACTIVE / SUSPENDED / LOAN / INACTIVE`: quel test **non può passare** finché
`LOAN` non esiste. Perciò la Wave 6 lo crea davvero — quarto stato, vocabolario
canonico in un modulo solo, normalizzazione in lettura — invece di rinominare le
etichette. Vedi lane **6A**.

### 3.2 «Il pulsante Scansiona documento non ha senso, il sistema non funziona» — funziona

L'OCR è reale, locale e già montato in cinque schermate:
`document-extraction.ts:74-87` definisce un contratto a provider, l'unico
provider è `tesseract-local` (`document-extraction-ocr.ts:21`), il
riconoscimento avviene nel browser dell'operatore
(`athletes/[id]/page.tsx:2823-2826`), la MRZ vince sulle etichette quando c'è
(`document-scan.ts:346-360`), e il codice fiscale proposto viene validato con il
carattere di controllo (`italian-registry.ts:515`) prima di essere accettato. La
regola del dominio è scritta a `document-extraction.ts:22-25`: **si propone, non
si scrive**.

**Non nascondiamo una capability che funziona.** Ciò che spiega la percezione
del cliente sono tre attriti misurabili, e sono quelli che la Wave corregge:

1. i **PDF sono rifiutati** (`document-extraction.ts:132-138`) — chi fotografa
   il documento col telefono ottiene un PDF e non ottiene nulla;
2. la **camera esiste solo nella scheda atleta**: `getUserMedia` compare in un
   punto solo di tutta l'applicazione, e le altre quattro schermate accettano
   solo un file;
3. la scheda atleta usa il flusso **vecchio**, che scrive tutti i campi trovati
   senza farli scegliere (`applyDocumentScanResult`), mentre
   `DocumentExtractionField` propone campo per campo. Sono **due UX diverse
   dietro lo stesso pulsante**.

Vedi §17.

### 3.3 «Se una struttura non è prenotabile il Parent vede il modulo con tariffa €0» — è un altro dominio

Il difetto è reale, ma non sta negli appuntamenti: negli appuntamenti non esiste
né un flag `bookable` né un prezzo (`grep -ni "bookable|price" src/lib/appointments/`
→ 0). Sta nelle **strutture** (`clubs.structures`), e ha tre cause distinte:

- il flag che il club usa — `isRentable`, «Affittabile: No» — **non è letto da
  nessuna riga del percorso famiglia**: `structures-utils.ts:305` filtra su
  `isVisibleToMembers`, e il gemello server
  `api/parent-dashboard/[athleteId]/structures/route.ts:100` fa lo stesso;
- il modulo di prenotazione è condizionato alla **lista**, non ai campi: basta
  una struttura con un campo prenotabile perché compaia, e il badge
  «Prenotabile» è fisso, non derivato;
- «€0» **non è una tariffa gratuita**: è il valore con cui il prodotto stesso
  crea le due righe di prezzo di ogni campo nuovo
  (`StructureFieldsSection.tsx:43-44`, duplicato in `structures/page.tsx:614-615`).

Vedi lane **6A**.

### 3.4 «Il Trainer ha perso il dato clinico e non c'è modo di restituirglielo» — la proiezione esiste

Il blocker W6-5 è meno grave di come la Wave 5 lo ha lasciato scritto. La
proiezione «idoneo / scaduto / data di scadenza» **esiste ed è raggiungibile dal
menu dell'allenatore**: `trainer-clinical-view.ts:105`
(`buildTrainerSquadCertificates`, con `allowed:false` quando manca
`clinical.status_read`), consumata da
`trainer-documents-dashboard-page.tsx:20,64-66`, pagina in sidebar
(`TrainerSidebar.tsx:134`). Ciò che manca non è la proiezione: è la
**concessione per singolo operatore**, cioè un pezzo di W6-1. Vedi lane **6C**.

---

## 4 — Il fatto architetturale: due sistemi di permessi che non si parlano

È il mattone su cui poggiano W6-1, W6-2 e W6-5, e va nominato prima del piano.

EasyGame decide «chi può fare cosa» in **due modi indipendenti**:

| Sistema | Dove | Come decide | Chi lo usa |
|---|---|---|---|
| **Catalogo delle chiavi** (Wave 5) | `permissions/catalog.ts` | 33 chiavi `dominio.atto`, ognuna con l'elenco dei ruoli che la portano | le guardie dei domini nuovi: eventi, documenti, appuntamenti, consensi, salute, soci, lavoro sportivo |
| **Matrice per risorsa** | `access-roles.ts:522-570` | `canAccessClubResource(ruolo, risorsa, azione)`, con `owner`/`club_manager` che **ritornano `true` incondizionatamente** (`:532-534`) | tutte le API generiche `/api/v1/[resource]` |

I due non si conoscono. E accanto a loro vivono **tre matrici private** che
tengono una copia propria: `sport-work/permissions.ts:73-83` (duplica il
catalogo), `communications/permissions.ts:94-110` (che è l'**autorità reale** su
`rsvp.answer`, non il catalogo), `accounting/permissions.ts:124-139` (le cui
chiavi **non sono in catalogo affatto**, benché il dominio `accounting` sia
dichiarato nel tipo e sia vuoto).

Sopra questo, W5-D01: **nove chiavi su trentatré non le chiede nessuno**, e la
verifica puntuale ha confermato il debito riga per riga. Peggio del numero è la
forma:

```
// src/lib/documents/permissions.ts:49-50 — l'unica chiamata a roleHasPermission del file
const canStandBeforeADocument = (role) =>
  roleHasPermission(role, "documents.templates.read");
```

**Cinque** chiavi si riducono a quella: `documents.generate`,
`documents.generated.read`, `documents.generated.advance`,
`consents.decide_for_others`, `consents.records.read`. **Tre** si riducono a
`canManageClubConfiguration`, cioè a `owner || club_manager` **cablato**, che non
passa da nessuna chiave e quindi non passerebbe da nessun motore di ruoli:
`documents.templates.manage`, `consents.definitions.manage`,
`members.register.manage`. **Una** — `sport_work.read_own` — non ha un atto da
proteggere, perché la superficie «i miei compensi» non esiste.

Conseguenza operativa già oggi: togliere `documents.templates.read` a un ruolo
gli toglie **in blocco** generazione, rilettura, avanzamento di stato,
registrazione dei consensi per conto terzi e lettura del registro consensi —
cinque capability distinte, un solo interruttore. E `consents.*` non è nemmeno
documentale: un ruolo «segreteria consensi» che non deve vedere i modelli di
stampa oggi è **irrappresentabile**.

> **Perché questo viene prima di tutto il resto.** Un motore di ruoli
> personalizzati costruito sopra questo stato mostrerebbe a un club cinque
> caselle che agiscono su un bit solo, e tre caselle che non agiscono affatto.
> Prometterebbe una configurabilità che non c'è. **W5-D01 è il primo commit
> della Wave**, non un residuo da chiudere alla fine.

E il vincolo di progetto più stringente emerso dalla ricognizione F: oggi un
`club_manager` **può creare una tessera `role: "owner"`** per un altro utente
(`resources.ts:1926-1933`). Il codice lo sa e lo accetta con questa motivazione:
«piccola oggi, perché owner e club_manager hanno gli stessi diritti, e una
scalata il giorno in cui non li avranno più». **La Wave 6 è quel giorno.**

---

## 5 — Il registro dei difetti: 61 voci verificate

Ogni voce è stata verificata nel codice. `NEW` = trovata da questa ricognizione
e non presente in [16 — Debito tecnico](16-technical-debt.md).

### 5.1 Elenco e scheda atleti (lane 6A)

| # | Difetto | Dove | Grav. |
|---|---|---|---|
| W6-01 | `paginated` è calcolato sul **totale già filtrato**; la guardia `if (!paginated) return` spegne la ricarica e i filtri successivi girano in memoria sull'array residuo → **0 risultati** | `athletes/page.tsx:432`, `:670-671` | **ALTA** `NEW` |
| W6-02 | La fetch iniziale non passa `status`, e con lista paginata il filtro client è saltato → **flash di tutti gli stati** | `athletes/page.tsx:542-545`, `:1081-1082` | MEDIA `NEW` |
| W6-03 | L'azione di massa scrive `status: "activate"`, valore inesistente: quegli atleti spariscono da **ogni** filtro, «Attivi» compreso | `athletes/page.tsx:1413-1415`, `:158` | **ALTA** `NEW` |
| W6-04 | Tre stati, quattro etichette (§3.1) | `athletes/page.tsx:251,1115,1856,2379` | MEDIA `NEW` |
| W6-05 | `updates.avatar ?? … ?? currentAthlete.avatar_url` — `??` tratta `null` come «non fornito» e **riesuma la foto** | `simplified-db.ts:1144-1145` | **ALTA** `NEW` |
| W6-06 | Le stesse righe rendono non azzerabili `accessCode` e `jersey_number` | `simplified-db.ts:1142-1143`, `:1156-1160` | BASSA `NEW` |
| W6-07 | Eliminare un atleta usa `confirm()` nativo, mentre la stessa scheda protegge con `AlertDialog` la cancellazione di un *certificato* | `athletes/[id]/page.tsx:1136` vs `:7310-7345` | MEDIA `NEW` |

### 5.2 Area famiglia (lane 6D)

| # | Difetto | Dove | Grav. |
|---|---|---|---|
| W6-08 | «Paga ora» sempre disabilitato: filtra `rata.status` con token inglesi mentre `status` è un'**etichetta italiana**; il campo macchina è `statusKey` | `parent-dashboard-pages.tsx:1102-1105` | **ALTA** `NEW` |
| W6-09 | «Nessuna stagione attiva»: il contesto famiglia ricostruisce `activeClub` **senza** i due campi stagione e dispatcha `club-updated`, che **azzera** l'etichetta calcolata da `AuthProvider` | `parent-dashboard-context.tsx:268-284` → `Header.tsx:228` | **ALTA** `NEW` |
| W6-10 | Per un tutore legato via `athletes.data.guardians` **senza** riga `organization_users`, l'etichetta di stagione non esiste in nessun momento | idem, `:255` | MEDIA `NEW` |
| W6-11 | Ricevuta non scaricabile per quegli stessi tutori: `assertActiveClub` gira **prima** del ramo del legame | `api/v1/documents/[kind]/[id]/route.ts:78` vs `:103-106` | **ALTA** `NEW` |
| W6-12 | Nessuna schermata di scelta figlio; l'ingresso porta sempre al **primo** | `access-roles.ts:436,444-448` | **ALTA** |
| W6-13 | Notifiche, bacheca e prenotazioni strutture **non sono filtrate per figlio** | `parent-dashboard.ts:778-785`, `board/route.ts:66-69`, `parent-dashboard.ts:974-983` | **ALTA** `NEW` |
| W6-14 | La query famiglia **non carica** `athlete_category_memberships`: il genitore vede solo la categoria primaria, e il calendario perde le attività della seconda | `parent-dashboard.ts:678-682`, `:571-572`, `:150-187` | **ALTA** `NEW` |
| W6-15 | Un `[id]` non-UUID ricade **in silenzio** sul primo figlio | `parent-dashboard.ts:737` | MEDIA `NEW` |
| W6-16 | Nell'area famiglia non esiste lo stato «in scadenza»: solo valido / scaduto / mancante | `parent-dashboard.ts:1013-1019` | **ALTA** |
| W6-17 | I certificati sono ordinati `expiry_date asc`: la Home accosta «Certificato valido» alla scadenza del **più vecchio**, tipicamente già scaduto | `parent-dashboard.ts:767` vs `parent-dashboard-pages.tsx:642-645` | **ALTA** `NEW` |
| W6-18 | Nessuna CTA per aggiornare il certificato; e l'upload della famiglia **non manda `documentType`**, benché la rotta lo accetti e il dominio conosca `medical_certificate` | `parent-dashboard-context.tsx:417-423` vs `documents/route.ts:148` | **ALTA** `NEW` |
| W6-19 | `payments.invoices` è nel payload e nel tipo, e **non è renderizzato da nessuna parte** | `parent-dashboard.ts:1042-1047` | MEDIA `NEW` |
| W6-20 | Notifiche famiglia: `take: 8`, nessun «segna come letta», nessuna paginazione | `parent-dashboard.ts:778-785` | MEDIA `NEW` |
| W6-21 | Il menu mobile della famiglia elenca quattro rotte **senza `athleteId`**, quindi non risolvibili | `mobile-header.tsx:236-260` | BASSA `NEW` |

### 5.3 Allenatore e atleta (lane 6C)

| # | Difetto | Dove | Grav. |
|---|---|---|---|
| W6-22 | Il perimetro dell'allenatore è applicato da **1 funzione su 9**. L'elenco del debito W5-D03 ne **omette una**: `createClubEvent` | `events.ts:253` applica; `:340,486,546,654,771,832,861,907` no | **ALTA** |
| W6-23 | Un allenatore che conosce un `eventId` fuori perimetro può farci **appello e convocazioni** | `events/[id]/participants/route.ts:79,89` | **ALTA** `NEW` |
| W6-24 | **Quattro** implementazioni della stessa domanda «cosa vede questo allenatore», e due divergono: `assertTrainerCanSeeEvent` legge solo `club.trainers`, `trainerEventFilter` legge anche `staff_members` → un allenatore registrato come staff passa il filtro eventi e viene **respinto sull'RSVP dello stesso evento** | `rsvp.ts:565,571` vs `events.ts:148-150`; più `resources.ts:4121` e `trainer-area.ts:153` | **ALTA** `NEW` |
| W6-25 | Il ruolo `athlete` è modellato end-to-end e **nessun percorso scrive `athlete.user_id`**: lo slega, non lo lega mai | `memberships/delete/route.ts:418-436` | **ALTA** `NEW` |
| W6-26 | «Invia credenziali» mostra solo un errore, in **tre** schede: atleta, staff, socio | `athletes/[id]/page.tsx:1164-1169`, `staff/[id]/page.tsx:371-376`, `soci/[id]/page.tsx:378-383` | **ALTA** |
| W6-27 | Non esiste un token `athlete_access`: il riscatto gestisce solo `trainer_id` e `athlete_id + guardian_id` | `auth/access/redeem/route.ts:207-210` | **ALTA** `NEW` |
| W6-28 | Le dieci chiavi `permissions.actions.*` dell'allenatore sono applicate **solo dal browser**: zero occorrenze in `src/lib/server/**` e `src/app/api/**` | già D-4 in [16](16-technical-debt.md) | **ALTA** |
| W6-29 | Le cinque chiavi `permissions.widgets.*` sono configurabili in `/permissions` e **non hanno consumatori** | `trainer-dashboard-permissions.ts:61-67` | MEDIA `NEW` |
| W6-30 | `/trainer-dashboard/notifications` è una pagina completa **assente dalla sidebar** e dal menu mobile | `notifications/page.tsx:25` | MEDIA `NEW` |
| W6-31 | `/trainer-dashboard/categories` esiste e **redirige**; la chiave di navigazione è forzata `false` | `categories/page.tsx:4`, `trainer-dashboard-permissions.ts:127` | BASSA `NEW` |
| W6-32 | `sport_work.read_own` è concesso a trainer e athlete e **nessuna superficie lo consuma** | `sport-work/permissions.ts:19-24` | MEDIA |
| W6-33 | La pagina profilo atleta monta la **sidebar gestionale**: un atleta vedrebbe cliccabili voci che poi rimbalzano sulla guardia | `athletes/[id]/profile/page.tsx:4,279` | MEDIA `NEW` |
| W6-34 | `/api/v1/auth/athlete-profile/[athleteId]` restituisce atleta e certificati **interi**, senza passare da `stripClinical*` | `route.ts:20-25,59-65` | MEDIA `NEW` |
| W6-35 | `stripClinicalCertificateFields` non ricorre sul `data` annidato | già W5-D05 | BASSA |

### 5.4 Documenti, moduli, iscrizione (lane 6E, 6F)

| # | Difetto | Dove | Grav. |
|---|---|---|---|
| W6-36 | Le **quattro rotte `v1` del fascicolo** (Wave 5) hanno **zero consumatori nella UI**: club e famiglia passano ancora dai due ponti legacy | `grep v1/document-requests` fuori da `src/app/api` → solo il registro | **ALTA** `NEW` |
| W6-37 | La famiglia legge **solo** `athletes.data.sharedDocuments`: una richiesta creata dalla segreteria nel fascicolo nuovo **non le arriva** | `parent-dashboard.ts:534-536` | **ALTA** `NEW` |
| W6-38 | `GET /api/parent-dashboard/[athleteId]/documents` — che unisce fascicolo nuovo e storico — è un **endpoint morto**: nessun client lo chiama | `route.ts:163-171` | **ALTA** `NEW` |
| W6-39 | Non esiste una **inbox club** «documenti da verificare»: `listPendingDocumentSubmissions` e la sua rotta esistono, zero componenti | `document-requests.ts:1291` | **ALTA** |
| W6-40 | Nell'area famiglia «richieste» e «archivio» sono la **stessa lista frullata due volte** | `parent-dashboard.ts:921-932` | **ALTA** `NEW` |
| W6-41 | `ParentEnrollmentPage` legge `pratica.missingDocuments`, l'API restituisce `pendingDocuments`: il blocco «Il club aspetta:» **non si mostra mai** | `parent-family-pages.tsx:815-816` vs `enrollment-requests.ts:265` | **ALTA** `NEW` |
| W6-42 | Il gate della pagina Modulistica è `canReadDocumentTemplates`, che **blocca anche la tab «Moduli online»** | `modulistica/page.tsx:344,1024` | **ALTA** `NEW` |
| W6-43 | L'uscita anticipata su `loading` sta **prima** dei Tabs: ogni ri-risoluzione del club **smonta** `FormsDashboard` e ne perde lo stato | `modulistica/page.tsx:1009-1017` | **ALTA** `NEW` |
| W6-44 | Il fallimento dell'elenco moduli è indistinguibile dall'elenco vuoto | `forms-dashboard.tsx:87-89`, `:216-228` | MEDIA `NEW` |
| W6-45 | I «modelli consigliati» sono voci di un menu a tendina, **indistinguibili** da un modulo creato dal club una volta creati | `starter-templates.ts:31-47`, `forms-dashboard.tsx:180-201` | MEDIA `NEW` |
| W6-46 | `listFamilyRenewalForms`: il filtro su `published_version` è **sempre vero** (colonna non nullable) e non c'è filtro sul tipo → un questionario di gradimento compare nel menu del rinnovo | `enrollment-requests.ts:461-471` | MEDIA `NEW` |
| W6-47 | Il catalogo dei tipi documento vive in `shared-documents.ts`, **il file che la lane 5J deve cancellare**, e non ha «tessera sanitaria» né «delega» | `shared-documents.ts:47-58` | MEDIA `NEW` |
| W6-48 | Salva/riprendi della compilazione: **non esiste** | nessuna persistenza in `public-form-page.tsx` | MEDIA `NEW` |
| W6-49 | N+1 sequenziale: una `loadPublishedSchema` per riga in un ciclo | `forms.ts:290-299` | MEDIA `NEW` |
| W6-50 | Lo stato «scaduto» non compare fra i badge documentali della scheda atleta, benché il dominio lo calcoli | `shared-documents.ts:143-158` vs `request-model.ts:412` | BASSA `NEW` |

### 5.5 Appuntamenti e strutture (lane 6A, 6H)

| # | Difetto | Dove | Grav. |
|---|---|---|---|
| W6-51 | **Dalla segreteria non si può confermare né rifiutare**: la schermata confronta nomi di **azione** (`confirm`) con nomi di **stato** (`confirmed`). Tutti e tre i rami sono sempre falsi | `secretariat/page.tsx:2146-2192` | **CRITICA** `NEW` |
| W6-52 | `/secretariat` non ha riprogrammazione (il client esiste, non è importato) né completa/assente (il client non esiste) | `appointments-client.ts:127` | **ALTA** `NEW` |
| W6-53 | **Nessuna UI per configurare gli slot**: quattro rotte e quattro funzioni di dominio senza superficie. Ogni club è quindi in configurazione «ripiego» sugli orari di apertura | nessun `.tsx` nomina `appointment-slots` | **ALTA** `NEW` |
| W6-54 | `isRentable` ignorato dal percorso famiglia (§3.3) | `structures-utils.ts:305`, `structures/route.ts:100` | **ALTA** `NEW` |
| W6-55 | Tariffa €0 = default di creazione del campo, duplicato in due file | `StructureFieldsSection.tsx:43-44`, `structures/page.tsx:614-615` | MEDIA `NEW` |
| W6-56 | `capacity` è inerte con `1` e **bugiarda** con valori maggiori: propone posti che l'indice unico rifiuta | `appointments/model.ts:636-653` | MEDIA (W5-D04) |
| W6-57 | Gli slot liberi arrivano alla famiglia **con lo spread**: `assignedToUserId` (UUID interno degli operatori), `capacity` e `taken` | `parent-dashboard/[athleteId]/appointments/route.ts:117-121`, `parent-dashboard.ts:1112-1116` | **ALTA** (W5-D05) |
| W6-58 | La lettura della famiglia non filtra per operatore, `riprogramma` sì: uno slot **offerto** può essere rifiutato allo spostamento | `appointments.ts:1291-1294` vs `:914-928` | MEDIA (W5-D05) |
| W6-59 | Un appuntamento creato dal desk nasce confermato e la famiglia **non riceve niente** | `appointments.ts:671,690-696` | MEDIA `NEW` |
| W6-60 | Prenotazione struttura: lettura-modifica-scrittura sull'intera colonna JSON senza transazione né versione — due prenotazioni simultanee, l'ultima vince | `structures/route.ts:92,158-165` | **ALTA** `NEW` |
| W6-61 | `AttendanceConfirmation.tsx` e `DENIAL_MESSAGES` dicono «allenamento» a mano: su una gara si leggono sbagliati | già W5-D05 | BASSA |

---

## 6 — Capability dichiarate e irraggiungibili

La lezione della Wave 5 — «una capability è completa quando **una persona ci
arriva**» — ha prodotto in questa ricognizione **quattordici** casi. Li elenco
insieme perché la forma è sempre la stessa: dominio corretto, rotta corretta,
test verdi, e nessuna schermata.

| # | Capability | Dove si spezza |
|---|---|---|
| 1 | Fascicolo documentale, lato club e famiglia | quattro rotte, zero consumatori (W6-36) |
| 2 | Inbox «documenti da verificare» | `listPendingDocumentSubmissions` senza UI (W6-39) |
| 3 | Lettura unificata dei documenti della famiglia | la rotta non è mai chiamata (W6-38) |
| 4 | Configurazione degli slot di appuntamento | quattro rotte, zero componenti (W6-53) |
| 5 | Conferma e rifiuto di un appuntamento dalla segreteria | confronto fra vocabolari diversi (W6-51) |
| 6 | Riprogrammazione dalla segreteria | client esistente, mai importato (W6-52) |
| 7 | Chiusura «completato» / «assente» | rotta senza client (W6-52) |
| 8 | Ruolo `athlete` | nessuno scrive `athlete.user_id` (W6-25) |
| 9 | Invio credenziali | tre pulsanti, un messaggio di errore (W6-26) |
| 10 | `sport_work.read_own` | nessuna superficie «i miei compensi» (W6-32) |
| 11 | `permissions.widgets.*` | cinque chiavi configurabili, zero consumatori (W6-29) |
| 12 | Notifiche dell'allenatore | pagina fuori dal menu (W6-30) |
| 13 | Fatture della famiglia | payload e tipo, nessun render (W6-19) |
| 14 | `normalizeActiveClubSeason` | zero chiamanti — ed è la funzione che risolve W6-09 |

A queste si aggiungono tre **superfici finte**, che sono peggio di una superficie
assente perché promettono un controllo che non esiste:

- `/dashboard/access-management` — mock integrale, **zero** chiamate di rete,
  token generato con un numero casuale **nel browser** e mai salvato, e la
  tabella `access_tokens` che la pagina dichiara di scrivere **non esiste nello
  schema**;
- le dieci chiavi `permissions.actions.*` dell'allenatore, applicate solo dal
  browser (W6-28);
- `viewAthleteContacts`, default `true`, unico gate della scheda contatti, **zero
  occorrenze lato server** (già in [16](16-technical-debt.md)).

---

## 7 — EXTEND contro NEW

La regola trasversale resta: **si estende un dominio esistente, non se ne crea un
secondo.**

### Si ESTENDE (la quasi totalità)

| Dominio | Proprietario | Cosa si aggiunge |
|---|---|---|
| Permessi | `src/lib/permissions/catalog.ts` | risoluzione per **ruolo personalizzato**, non solo per ruolo canonico |
| Accessi | `src/lib/server/resources.ts` | tetto sul ruolo concesso, anti-escalation |
| Eventi | `src/lib/server/events.ts` | `trainerEventFilter` applicato in **tutte e nove** le funzioni |
| Appuntamenti | `src/lib/server/appointments.ts` | UI degli slot; elenco chiuso di campi verso la famiglia; `capacity` rimossa |
| Fascicolo | `src/lib/server/document-requests.ts` | inbox club; la famiglia legge il fascicolo vero |
| Moduli | `src/lib/server/forms.ts` | distinzione modello/istanza; salva-riprendi; gate proprio |
| Iscrizione | `src/lib/server/enrollment-requests.ts` | filtro sui moduli di rinnovo; stati «da integrare» e «annullata» |
| Area famiglia | `src/lib/server/parent-dashboard.ts` | figlio selezionato ovunque; appartenenze multiple; stagione; `statusKey` |
| Area allenatore | `src/lib/server/trainer-area.ts` | perimetro unico, riusato dalle quattro implementazioni |
| Audit | `src/lib/server/audit.ts` | `listAuditEvents` — il **lettore** che manca |
| Consensi | `src/lib/server/consents.ts` + `audience.ts` | `consent_revoked` come motivo di esclusione |
| Contabilità | `src/lib/accounting/projection.ts` | causale su compensi e liquidazioni |
| OCR | `src/lib/document-extraction.ts` | camera nel campo condiviso; PDF a immagine; una sola UX |

### È NUOVO (sei moduli, e ognuno dichiara perché)

| Nuovo | Perché non è un'estensione |
|---|---|
| `src/lib/athletes/status.ts` | Il vocabolario dello stato atleta oggi **non ha un posto**: è ripetuto in quattro etichette e in tre confronti. Serve un proprietario, come `access-roles.ts` lo è dei ruoli |
| `src/lib/roles/` + `src/lib/server/club-roles.ts` | I ruoli personalizzati non sono un caso particolare dei sette canonici: hanno un ciclo di vita, uno scope e un'assegnazione. `access-roles.ts` resta il proprietario dei **canonici** e della risoluzione |
| `src/lib/server/athlete-accounts.ts` | «Atleta → account» è un atto con audit, revoca e stato. Non appartiene né a `resources.ts` né ad `auth-workflows.ts`: **usa** quest'ultimo |
| `src/app/athlete-dashboard/**` | L'area atleta è una superficie nuova. La pagina profilo esistente resta, ma non può montare la sidebar gestionale (W6-33) |
| `src/lib/server/data-subject.ts` | Export e cancellazione di una persona attraversano **tre indici polimorfi** — l'owner di un allegato, il soggetto di un consenso, i soggetti di una compilazione — e non è il lavoro di nessun dominio esistente |
| `src/lib/server/observability.ts` | Un punto solo che oggi scrive un errore strutturato con un identificativo di richiesta, e domani parla con un provider. **Non** una dipendenza nuova: vedi §16 |

---

## 8 — Cosa NON sviluppiamo

Dichiarato prima, per non scoprirlo dopo.

| Non facciamo | Perché |
|---|---|
| **OCR lato server o con un modello AI** | Deciso in Wave 3 ([35](35-wave-3-planning.md)) e confermato: privacy di un minore, DPA, costi ricorrenti, e revisione manuale comunque obbligatoria. Vedi §17 |
| **La regola fiscale delle causali in uscita** | W4-R7 è contabilità **gestionale**; il trattamento fiscale resta fuori (ADR-0093). Vedi §18 |
| **Messaggistica 1-a-1 famiglia ↔ club** | Il menu mobile la promette con una rotta inesistente. Si toglie la voce, non si costruisce il dominio |
| **Scope per gruppo** nei ruoli personalizzati | Sede e categoria sì. Il «gruppo» è la coppia (categoria, sede) e non è un'entità: darglielo come scope significherebbe crearne una |
| **Capienza multipla degli slot** | `capacity` si **toglie** (W6-56). Rimetterla vorrebbe dire toccare il presidio più delicato del dominio per una funzione che nessuna schermata sa ancora chiedere |
| **Validazione legale della policy consensi** | Separiamo **product rule** da **legal validation**, come il mandato chiede. Scriviamo la mappa e il meccanismo; la firma di un professionista resta un blocker esterno |
| **Refresh token, tesseramenti federali, governance associativa** | Fuori perimetro, già dichiarati POST-V1 |

---

## 9 — Schema: le entità nuove

Quattro tabelle, una colonna, e una rimozione.

### 9.1 `club_roles` — il ruolo personalizzato

    club_roles
      id               uuid PK
      organization_id  uuid NOT NULL  -> clubs, CASCADE
      slug             text NOT NULL        -- stabile, usato in organization_users.role
      name             text NOT NULL
      description      text
      base_role        text NOT NULL        -- il canonico da cui clona: vincola il tetto
      is_active        boolean NOT NULL DEFAULT true
      created_by       uuid
      created_at / updated_at
      UNIQUE (organization_id, slug)

`slug` è prefissato — `custom:segreteria` — perché `organization_users.role` è
**testo libero** e oggi qualunque stringa sconosciuta diventa vuota in lettura
(default negato). Il prefisso rende impossibile che un ruolo di club collida con
un canonico, e rende la distinzione leggibile in archivio.

### 9.2 `club_role_permissions` — le chiavi concesse

    club_role_permissions
      id             uuid PK
      role_id        uuid NOT NULL -> club_roles, CASCADE
      permission_key text NOT NULL        -- una chiave del catalogo
      UNIQUE (role_id, permission_key)

Una riga per chiave concessa. **Nessun diniego esplicito**: l'assenza è il
diniego, come nel catalogo.

### 9.3 `club_access_scopes` — il perimetro di un'assegnazione

    club_access_scopes
      id                    uuid PK
      organization_user_id  uuid NOT NULL -> organization_users, CASCADE
      scope_kind            text NOT NULL   -- 'site' | 'category'
      scope_value           text NOT NULL
      UNIQUE (organization_user_id, scope_kind, scope_value)

**Zero righe = tutto il club.** È la scelta che rende la migrazione additiva: chi
non ha scope oggi continua a vedere tutto domani.

### 9.4 `athlete_account_invites` — il ciclo di vita dell'accesso atleta

    athlete_account_invites
      id               uuid PK
      organization_id  uuid NOT NULL -> clubs, CASCADE
      athlete_id       uuid NOT NULL -> athletes, CASCADE
      email            text NOT NULL
      token_hash       text NOT NULL        -- mai il token in chiaro (ADR-0085)
      status           text NOT NULL        -- 'sent' | 'accepted' | 'revoked' | 'expired'
      expires_at       timestamp NOT NULL
      sent_at          timestamp NOT NULL
      accepted_at / revoked_at  timestamp
      created_by       uuid
      UNIQUE INDEX parziale (organization_id, athlete_id) WHERE status = 'sent'

L'indice parziale è la stessa forma di `appointments_slot_vivo_unico`: **un solo
invito vivo per atleta**, garantito dal database e non dal codice. Un reinvio
revoca il precedente e ne crea uno nuovo.

### 9.5 La colonna, e la rimozione

- `organization_users.custom_role_id` — uuid nullable verso `club_roles`. Quando
  è valorizzata, il ruolo effettivo è quello personalizzato e `role` porta lo
  slug.
- `appointment_slots.capacity` **si toglie** (W6-56). Migrazione senza backfill:
  in produzione ogni riga ha il default `1`, e con `1` i due comportamenti
  coincidono. **La rimozione non cambia nessun risultato osservabile.**

---

## 10 — Permission model dei ruoli personalizzati

### 10.1 La regola in una riga

> Un ruolo personalizzato è **un sottoinsieme** delle chiavi del suo
> `base_role`, mai un soprainsieme. Non può contenere una chiave di legame. Non
> può contenere una chiave riservata al proprietario.

### 10.2 Le tre classi di chiave

| Classe | Esempio | Concedibile a un ruolo personalizzato? |
|---|---|---|
| **Di ruolo** | `documents.review`, `events.manage` | **Sì** |
| **Di legame** (il simbolo `⛓` del catalogo) | `consents.decide_own`, `documents.submit_own`, `rsvp.answer` | **No, mai.** Il loro gate è il legame con quell'atleta: concederle a un ruolo le renderebbe più larghe di quello che sembrano — è la trappola che [40](40-wave-5-implementation-uat.md) §6 nomina esplicitamente |
| **Riservate al proprietario** | trasferimento proprietà, cancellazione organizzazione, gestione degli owner, configurazione di piattaforma | **No.** Vedi §10.4 |

### 10.3 W5-D01 prima di tutto

Le nove chiavi vengono innestate **nel loro punto minimo**, senza cambiare il
comportamento di oggi (il catalogo dà già gli stessi ruoli che le funzioni
cablate danno):

| Chiave | Innesto | Riga oggi |
|---|---|---|
| `documents.templates.manage` | `canManageDocumentTemplates` | `documents/permissions.ts:60-61` |
| `documents.generate` | `canGenerateDocumentWithSensitivity` | `:80` |
| `documents.generated.read` | `canReadGeneratedDocument` | `:163` |
| `documents.generated.advance` | `canAdvanceGeneratedDocument` | `:176-177` |
| `consents.definitions.manage` | `canManageConsentDefinitions` | `:180-181` |
| `consents.decide_for_others` | `canRecordConsentDecision` | `:189-190` |
| `consents.records.read` | `canReadConsentRecords` | `:193-194` |
| `members.register.manage` | `canManageMembershipRegister` | `members/permissions.ts:33-34` |
| `sport_work.read_own` | **la superficie «I miei compensi»** dell'allenatore | non esiste: si crea in 6C |

L'asimmetria che indica la strada: `canReadMembershipRegister`, quattro righe più
sotto, **usa già** `roleHasPermission(role, "members.register.read")`. La lettura
è agganciata al catalogo, la scrittura no.

E il **presidio** che impedisce la ricaduta va dove il debito dice che deve
andare: `tests/lib/catalogo-permessi.test.mjs` verifica oggi etichette, duplicati
e appartenenza ai ruoli — mai che una chiave sia **chiesta** da qualche parte. Si
aggiunge quel controllo, con l'elenco chiuso delle eccezioni motivate.

### 10.4 Owner-only, per la prima volta davvero

Oggi `isOwnerAccessRole` ha **zero chiamanti** e `owner` è funzionalmente
indistinguibile da `club_manager`. La Wave 6 introduce un elenco chiuso di atti
riservati al proprietario:

- creare, modificare o cancellare un **ruolo personalizzato**;
- assegnare o revocare il ruolo `owner`;
- assegnare un ruolo personalizzato che contenga chiavi di direzione;
- cancellare l'organizzazione;
- configurazioni di piattaforma e fatturazione.

E chiude il buco nominato in §4: `assertConcessioneDiAccessoLecita` acquista un
**tetto** — nessuno può concedere un ruolo che non possiede, e `owner` lo concede
solo un `owner`.

### 10.5 La prova che un permesso è vero

Il mandato la chiede, e diventa la forma dei test di 6G:

> togli la chiave: la funzione **sparisce dalla UI** e la rotta risponde **403**;
> rimetti la chiave: la funzione torna e la rotta risponde **200**.

Non «la matrice contiene la chiave»: il giro completo, dalla schermata alla riga.

---

## 11 — I workstream

Dieci lane. La divisione suggerita dal mandato è stata rispettata dove
l'ownership reale la conferma, e cambiata in due punti: gli appuntamenti tirano
dentro le **strutture** (perché lì sta il difetto che il mandato attribuisce a
loro), e il capitolo OCR si riduce da lane a **decisione più tre attriti**,
perché la capability esiste già.

| Lane | Titolo | Contenuto |
|---|---|---|
| **6A** | I difetti che vengono prima del piano | W6-01…W6-07, W6-51, W6-54, W6-55, sidebar e tooltip. Tutti difetti dimostrati, nessuna funzione nuova |
| **6B** | Il catalogo diventa vero | W5-D01: le nove chiavi innestate, il presidio nel test, e la separazione di `consents.*` da `documents.*` |
| **6C** | Allenatore e atleta come utenti | Perimetro unico applicato ovunque (W6-22…W6-24), «I miei compensi», account atleta (W6-25…W6-27), Athlete Dashboard V1 |
| **6D** | Famiglia: multi-figlio e multi-categoria | Schermata di scelta figlio, propagazione ovunque, appartenenze multiple, stagione, «Paga ora», ricevute, certificato con data e CTA |
| **6E** | Documenti: le tre aree | Inbox club, il fascicolo che arriva alla famiglia, «Da fare / Documenti / Moduli», catalogo canonico dei tipi |
| **6F** | Moduli e iscrizione online | Gate proprio, modello contro istanza, salva-riprendi, pipeline completa, rinnovo filtrato |
| **6G** | Ruoli personalizzati e access management | Le quattro tabelle, la risoluzione, la UI, l'anti-escalation, la UI di audit |
| **6H** | Appuntamenti | UI degli slot, segreteria completa, `capacity` rimossa, i minori di W5-D05 |
| **6I** | Privacy, retention, observability | Consensi prima dell'invio, export e cancellazione, identificativo di richiesta, cron che si lamentano, log ripuliti |
| **6J** | W4-R7, OCR, pulizia, KB, collaudi | Causale in uscita, i tre attriti OCR, registro API, tre sonde di runtime |

---

## 12 — File e domain ownership

Nessuna lane tocca i file di un'altra. È la condizione perché siano parallele.

| Lane | File di cui è **proprietaria** |
|---|---|
| 6A | `src/lib/athletes/status.ts` (nuovo), `src/app/athletes/page.tsx`, `src/app/athletes/[id]/page.tsx`, `src/lib/simplified-db.ts` (solo `updateClubAthlete`), le tre sidebar, `src/lib/structures-utils.ts`, `src/components/structures/**`, `src/app/secretariat/page.tsx` |
| 6B | `src/lib/documents/permissions.ts`, `src/lib/members/permissions.ts`, `src/lib/permissions/catalog.ts`, `tests/lib/catalogo-permessi.test.mjs` |
| 6C | `src/lib/server/events.ts`, `src/lib/server/rsvp.ts` (solo `assertTrainerCanSeeEvent`), `src/lib/server/trainer-area.ts`, `src/lib/server/athlete-accounts.ts` (nuovo), `src/app/athlete-dashboard/**` (nuovo), `src/components/trainer/**` |
| 6D | `src/lib/server/parent-dashboard.ts`, `src/components/parent-dashboard/**`, `src/app/parent-view/**` |
| 6E | `src/lib/server/document-requests.ts`, `src/lib/documents/request-model.ts`, `src/app/documenti/**` (nuovo), `src/components/documents/**` |
| 6F | `src/lib/server/forms.ts`, `src/lib/server/enrollment-requests.ts`, `src/app/modulistica/page.tsx`, `src/components/forms/**` |
| 6G | `src/lib/roles/**` (nuovo), `src/lib/server/club-roles.ts` (nuovo), `src/lib/access-roles.ts`, `src/app/dashboard/access-management/**`, `src/app/audit/**` (nuovo), `src/lib/server/audit.ts` |
| 6H | `src/lib/server/appointments.ts`, `src/lib/appointments/**`, `src/app/appuntamenti/**` (nuovo) |
| 6I | `src/lib/server/audience.ts`, `src/lib/audience/recipients.ts`, `src/lib/server/data-subject.ts` (nuovo), `src/lib/server/observability.ts` (nuovo), `src/lib/server/maintenance.ts`, `src/middleware.ts` |
| 6J | `src/lib/accounting/projection.ts`, `src/lib/server/sport-work-ledger.ts`, `src/lib/server/funding.ts`, `src/lib/document-extraction*.ts`, `docs/**` |

**Due sovrapposizioni dichiarate**, e come si risolvono:

- `src/lib/access-roles.ts` è toccato da 6B (niente) e 6G (molto): **6G è
  l'unico scrittore**, e 6B si ferma ai file dei domini.
- `src/app/secretariat/page.tsx` è toccato da 6A (il difetto W6-51, che è una
  correzione di poche righe) e da 6H (la segreteria completa): **6A va prima**,
  6H eredita.

---

## 13 — Il DAG delle dipendenze

    6A  difetti dimostrati, nessuna dipendenza
     |
    6B  le nove chiavi (prerequisito duro di 6G)
     |
     +--------+--------+--------+--------+
     |        |        |        |        |
    6C       6D       6E       6F       6H
   trainer  famiglia documenti moduli  appuntamenti
   + atleta                   + iscriz.
     |        |        |        |        |
     +--------+--------+--------+--------+
     |
    6G  ruoli personalizzati + access management + audit UI
     |
    6I  privacy, retention, observability
     |
    6J  W4-R7, OCR, pulizia, KB, tre collaudi di runtime

**Perché 6B viene prima di 6G e non dopo**: §4. Un motore costruito su cinque
caselle che agiscono su un bit solo prometterebbe una configurabilità che non
c'è.

**Perché 6G viene dopo le cinque lane di prodotto**: i ruoli personalizzati si
provano concedendo e togliendo chiavi su funzioni che devono già esistere. Il
test di §10.5 non è scrivibile prima.

**Perché 6I viene dopo 6G**: la UI di audit è di 6G, e la retention deve sapere
chi può cancellare cosa.

### Lane realmente parallelizzabili

| Onda | Lane in parallelo | Motivo |
|---|---|---|
| 1 | 6A | tocca file che tutte le altre leggeranno |
| 2 | 6B | quattro file, sblocca 6G |
| 3 | **6C ‖ 6D ‖ 6E ‖ 6F ‖ 6H** | domini disgiunti, proprietari distinti |
| 4 | 6G | ha bisogno delle superfici delle onde 2 e 3 |
| 5 | 6I | ha bisogno di 6G |
| 6 | 6J | consuntivo |

---

## 14 — Migrazioni

Cinque, tutte **additive** tranne l'ultima.

| # | Nome | Contenuto | Reversibile |
|---|---|---|---|
| 1 | `wave6_ruoli_personalizzati` | `club_roles`, `club_role_permissions`, `club_access_scopes`, `organization_users.custom_role_id` | Sì — zero righe = comportamento di oggi |
| 2 | `wave6_accesso_atleta` | `athlete_account_invites` più l'indice unico parziale | Sì |
| 3 | `wave6_stato_atleta` | **Nessuna colonna nuova.** Correzione dati: gli atleti con `status = 'activate'` tornano `active` (W6-03) | La correzione di un valore non valido non si annulla |
| 4 | `wave6_causale_in_uscita` | causale, etichetta congelata e ambito su `sport_work_outbound_transactions` e `funding_settlements`; aggiornamento delle due proiezioni SQL | Sì |
| 5 | `wave6_slot_senza_capienza` | rimozione di `appointment_slots.capacity` | **No**, ed è deliberato: §9.5 spiega perché non cambia nessun risultato osservabile |

Su tutte vale la regola di §8 di [CLAUDE.md](../../CLAUDE.md): la guardia copre
gli script npm, e un comando Prisma di scrittura invocato a mano la aggira. Si
esegue solo `npm run db:migrate` sul database di sviluppo.

---

## 15 — Privacy, consensi e retention

### 15.1 La mappa delle comunicazioni

Il mandato chiede di mappare ogni tipo di comunicazione prima di decidere. La
ricognizione G ne ha censite **venti**. Quindici hanno un contenuto o un
destinatario che un consenso potrebbe governare; **zero** consultano il
registro.

| Natura | Comunicazioni | Consenso richiesto? | Perché |
|---|---|---|---|
| **Sicurezza** | verifica email, verifica telefono, reset password | **No, e deve ignorare ogni revoca** | Base giuridica contrattuale; senza, l'account non è proteggibile |
| **Amministrativa necessaria** | esito di un modulo, richiesta documentale, appuntamento confermato o rifiutato, documenti in scadenza | **No** | Esecuzione del servizio richiesto dall'interessato |
| **Pagamento** | rate in scadenza, rate scadute, sollecito insoluti | **No** | Esecuzione del contratto. Un club che non può sollecitare non è un gestionale |
| **Sanitaria** | certificato mancante, in scadenza, scaduto | **No**, ma **contenuto cieco obbligatorio** | È un adempimento, non una comunicazione di dati sanitari: l'email non deve nominare il minore né la condizione |
| **Sportiva** | convocazioni, inviti a confermare, bacheca | **No** | È il servizio |
| **Marketing e generica** | comunicazione massiva del club, digest | **Sì** | È l'unico canale a testo libero: un club può usarlo per qualsiasi cosa |
| **Immagini e media** | — | **Sì**, quando esisterà | Nessun percorso di pubblicazione foto esiste oggi: il consenso `images` non ha nemmeno un consumatore potenziale |

**Product rule contro legal validation.** Questa tabella è la **regola di
prodotto**: dice quale meccanismo il software applica. Non è una consulenza
legale e non pretende di esserlo. Ciò che la Wave 6 costruisce è il
**meccanismo** — un consenso può bloccare un invio, e la revoca ha effetto — più
il default sicuro: **solo la classe «marketing e generica» è governata dal
consenso**, tutte le altre passano. Se un professionista deciderà che un'altra
classe va governata, sarà una riga di configurazione e non una Wave.

### 15.2 Il presidio che la Wave 5 ha dichiarato e non ha scritto

Il piano della Wave 5 prometteva il motivo di esclusione `consent_revoked`.
`grep -rn "consent_revoked" src/` → **zero occorrenze**. L'enum a
`recipients.ts:41-47` ha ancora sei membri. Si scrive adesso, e diventa il punto
di innesto: un campo `requiredConsentKey` sull'`AudienceScope` rende il filtro
**configurazione** invece che rifacimento. `announcements.ts` e i rami in-app di
`automations.ts` non passano dal risolutore unico e vanno agganciati a parte.

### 15.3 Retention e cancellazione (ADR-0019)

Lo stato è peggiore di come la KB lo racconta, e va detto:

- cancellare un atleta **distrugge in cascata i suoi certificati medici**;
- e **lascia vivi** allegati, consensi e compilazioni di moduli — l'owner di un
  allegato, il soggetto di un consenso e i soggetti di una compilazione sono
  indici **polimorfi senza foreign key**: dopo la cancellazione i dati del
  minore restano in archivio e nulla li lega più a niente;
- le guardie che esistono sulla cancellazione sono **tutte fiscali**, nessuna
  personale;
- non esiste export, non esiste anonimizzazione, non esiste una dichiarazione di
  finalità e durata per tabella.

Cosa fa la Wave 6, in ordine di importanza:

1. `src/lib/server/data-subject.ts` — **export** dei dati di una persona
   (attraversando i tre indici polimorfi) e **cancellazione** che li percorre
   invece di lasciarli orfani;
2. una guardia `assertPersonalDataDisposed`, gemella di quelle fiscali, sulla
   cancellazione di una risorsa;
3. `RETENTION.md` accanto al modello dati: per ogni tabella con dati personali,
   finalità e durata. È la seconda conseguenza di ADR-0019, e oggi non è scritta
   da nessuna parte;
4. la retention a orario nel giro di manutenzione, che ha già la forma giusta
   (passi indipendenti con report per passo).

**Minori**: il default è che il dato di un minore non si cancella in silenzio.
La cancellazione di un atleta minorenne produce un **riepilogo di ciò che verrà
distrutto**, e la conferma è esplicita.

### 15.4 I log

La terza conseguenza di ADR-0019 — «i log non devono contenere dati personali
non necessari» — **non è presidiata da niente**. La ricognizione ha trovato:

- cinque punti in `src/app/api/v1/auth/**` e `src/app/api/public/forms/**` che
  stampano l'**errore intero**: un errore di validazione dell'ORM su
  `user.create` porta con sé l'oggetto scritto, cioè `password_hash`; sulla
  rotta pubblica dei moduli porta risposte e soggetti, cioè il modulo compilato
  da un minore;
- circa dodici punti lato client che stampano **anagrafiche intere** — note di
  segreteria con nome del genitore, indirizzo, telefono e nome del minore;
  l'elenco atleti; l'elenco soci; l'elenco staff.

Sono le due correzioni meno costose di tutto il piano, e chiudono un blocker.

---

## 16 — Observability

**Niente dipendenze nuove.** Il vincolo ADR-0007 vale, e scegliere un provider
esterno è una decisione che non si prende dentro una lane. Ciò che la Wave 6
costruisce è il **posto** dove quel provider si innesterà, più il minimo che
serve stanotte:

| Cosa | Dove | Perché adesso |
|---|---|---|
| `x-request-id` generato e propagato | `src/middleware.ts` | Oggi due righe di log della stessa richiesta **non sono correlabili** |
| `reportServerError(error, { requestId, route })` | `src/lib/server/observability.ts` | Un punto solo: oggi scrive un errore strutturato e sanificato, domani parla con un provider senza toccare 166 rotte |
| Un passo di manutenzione fallito scrive `audit_logs` con esito `failure` | `maintenance.ts` | Un giro notturno che smette di girare è **invisibile fino alla telefonata di un club**. Una riga di audit è un segnale persistente a costo zero |
| `sanitizeMetadata` esportata e usata anche fuori dall'audit | `audit.ts:440` | Protegge già i segreti, ma protegge solo `audit_logs` |
| Regola ESLint `no-console` (eccetto errori e avvisi) su pagine e componenti | configurazione ESLint | Toglie in un colpo i dodici casi client di §15.4 |

Il marcatore di release e l'ambiente vengono dalle variabili già presenti su
Vercel; non se ne aggiungono di nuove.

---

## 17 — OCR: la decisione

**Esito: IMPLEMENTED, non DEFERRED** — e la decisione da registrare è che *non
si cambia motore*.

L'analisi comparativa che il mandato chiede è già stata fatta e si trova in
[35 — Wave 3](35-wave-3-planning.md): estrazione lato server o con un modello AI
è `POST-V1, con decisione a sé`, per quattro ragioni che restano tutte vere —
precisione (un dato non confermato su un tesseramento diventa un errore
federale), privacy (mandare la carta d'identità di un **minore** a un servizio
esterno richiede base giuridica, DPA e informativa), costi ricorrenti per
anagrafica, e revisione manuale comunque obbligatoria. A queste si aggiunge
ADR-0034: nessun URL firmato, nessun servizio proprietario dell'hosting.

Il motore locale ha una proprietà che nessun servizio esterno può offrire: **il
documento non lascia il browser**. Per un prodotto che tratta documenti di minori
è la posizione di partenza corretta, e cambiarla richiede una decisione di
prodotto e legale, non una lane.

Ciò che la Wave 6 fa sono i **tre attriti** di §3.2:

1. **PDF**: oggi rifiutati con una spiegazione. Si accetta il caso più comune —
   un PDF di una sola pagina che contiene un'immagine — estraendone l'immagine
   senza aggiungere un motore di rendering. Se il PDF è testo vettoriale il
   rifiuto resta, con la stessa spiegazione.
2. **Camera nel campo condiviso**: `getUserMedia` esiste in un punto solo. Si
   sposta dentro `DocumentExtractionField`, e le cinque schermate lo ereditano.
3. **Una sola UX**: la scheda atleta smette di scrivere tutti i campi trovati e
   passa alla proposta campo per campo, che è la regola dichiarata del dominio.

E si registra un ADR che dice **perché il motore resta locale**, così che la
domanda non venga riaperta senza i fatti.

---

## 18 — W4-R7: la decisione

**Esito: si implementa la parte deterministica, e si separa la tassonomia.**

La ricognizione ha stabilito che W4-R7 **non è bloccato da una decisione
fiscale** — lo dice la KB e lo conferma il codice: la determinazione fiscale del
compenso vive in colonne proprie e dichiaratamente fuori scope
(`fiscal_treatment`, `fiscal_snapshot`, e una ritenuta che è **sempre nulla in
V1** perché EasyGame non la determina). Aggiungere una causale **gestionale** non
tocca nessuna di quelle.

È bloccato da una decisione di **prodotto**: il catalogo di sistema ha nove
causali, **otto orientate all'entrata** e una neutra. Non esiste alcun codice
pensato per un'uscita, e un club si troverebbe davanti a una lista vuota.

La decisione che prendiamo, e che va registrata come ADR:

> **Le causali in uscita sono quattro, di sistema, e rispecchiano ciò che il
> prodotto già distingue**: compenso sportivo, rimborso spese, prestazione
> professionale, liquidazione di contributo. Non rispecchiano i sette sottotipi
> di `transaction_type`, perché quello è un enum tecnico e la voce di rendiconto
> che il club decide sta un livello sopra. Il club può aggiungerne altre:
> l'infrastruttura lo permette già.

La parte meccanica è la stessa forma già presente nel repository per l'incasso
atleta — colonna sulla tabella sorgente, letta dalla proiezione TypeScript e dal
gemello SQL — replicata due volte. Rimane invariata la regola dello **snapshot**:
la causale è configurazione mutabile, e congelarla sulla riga impedisce che
correggerla cambi retroattivamente la natura dei movimenti passati.

---

## 19 — UAT definita prima del codice

Tre sonde di runtime contro il database di sviluppo, sul modello della Wave 5,
più gli invarianti responsive. **Sono loro il verdetto**, non il numero di test.

| Sonda | Copre |
|---|---|
| `scripts/wave-6-uat.mjs` | U-01…U-24: i quattro stati atleta con ricarica e cambio filtro; rimozione avatar; famiglia con tre figli e scelta esplicita; appartenenze multiple; stagione attiva; «Paga ora»; ricevuta scaricabile da un tutore **senza** riga di membership; certificato con data nei tre stati; le tre aree documentali; inbox club; modulo online; iscrizione e rinnovo; appuntamento in tutti gli stati; slot configurati; account atleta dal primo invito alla revoca; Athlete Dashboard; «I miei compensi» dell'allenatore |
| `scripts/wave-6-roles-probe.mjs` | U-25…U-30: creazione di «Segreteria» da Collaborator e «Direttore Sportivo» da Staff; **la prova di §10.5** su ognuna delle chiavi del catalogo; scope per sede e per categoria; i quattro tentativi di escalation — concedere `owner`, concedere una chiave che non si possiede, concedere una chiave di legame, auto-promozione |
| `scripts/wave-6-security-probe.mjs` | U-31…U-38: genitore sul figlio altrui; allenatore sull'atleta e sull'evento altrui; download documentale cross-club; dato clinico; pagamenti; invito atleta; moduli pubblici; allegati; appuntamento; iscrizione. **Critical qualunque perdita di: minori, salute, denaro, tenant** |
| `tests/ui/responsive-invariants.test.mjs` | esteso a 375 / 768 / 1280 / 1440 sulle superfici nuove |

Le tre UAT del mandato — Parent, Trainer, Athlete — sono percorsi **completi**
dentro `wave-6-uat.mjs`, non elenchi di chiamate: ogni passo verifica che **una
persona ci arrivi**, non che il servizio risponda.

---

## 20 — Blocker pre-production

Alla fine della Wave 6 questi devono essere chiusi o dichiarati con un motivo.

| # | Blocker | Chiuso da | Rischio |
|---|---|---|---|
| W6-1 | Ruoli personalizzati | 6G | Il tetto anti-escalation è la parte delicata |
| W6-2 | `/dashboard/access-management` reale | 6G | — |
| W6-3 | W4-R7 | 6J | Decisione di prodotto presa in §18 |
| W6-4 | Policy consensi | 6I | **Resta un blocker esterno**: la validazione legale non è nostra |
| W6-5 | Dato clinico per operatore | 6C + 6G | Meno grave del previsto (§3.4) |
| ADR-0019 | Retention e cancellazione | 6I | La parte «finalità e durata per tabella» è redazionale |
| WP-16 | UI di consultazione dell'audit | 6G | — |
| WP-27 | Error tracking | 6I | Si costruisce il **punto di innesto**, non si sceglie un provider |
| X-1 | Ambiente di produzione | esterno | Non esiste un progetto production nello scope Vercel |

---

## Riferimenti

- [16 — Debito tecnico](16-technical-debt.md) — W5-D01…W5-D05 e i residui Wave 4
- [40 — Wave 5](40-wave-5-implementation-uat.md) §6 — i cinque blocker della Wave 6
- [20 — Work Package](20-work-packages.md) — W6-1…W6-5
- [30 — Gap audit](30-golee-easygame-gap-audit.md) §20 — la pre-production gap list
- [18 — Decision log](18-decision-log.md) — ADR-0007, 0019, 0034, 0085, 0090, 0093, 0098–0101
