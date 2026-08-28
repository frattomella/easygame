# 31 — Wave 1: planning esecutivo

**Data:** 2026-08-28
**Baseline:** `integration/web-v1` @ `8274544`
**Origine:** i gap di Wave 1 di [30 — Gap audit](30-golee-easygame-gap-audit.md)
**Stato:** **PLANNING**. Nessuna riga di codice, nessuna migrazione, nessuno
schema, nessun workstream avviato.

> **Cosa e stato fatto per scrivere questo documento:** una verifica a runtime
> su un club QA creato e distrutto sul **database di sviluppo**, piu la lettura
> del codice a HEAD. Nessun fix. Il §1.2 dichiara cosa e stato scritto e cosa e
> stato rimosso.

> **Principio che governa ogni riga.** Golee e servito a trovare i problemi.
> **Non e la specifica.** Ogni intervento parte dai domini EasyGame esistenti e
> li **estende**. Una capability nuova va motivata; un secondo sistema accanto a
> un domain owner che gia esiste e vietato.

---

## Indice

1. [La verifica runtime](#1--la-verifica-runtime)
2. [Riesame dei gap di Wave 1](#2--riesame-dei-gap-di-wave-1)
3. [Pre-production challenge](#3--pre-production-challenge)
4. [Wave 1 — descrizione](#4--wave-1--il-passaggio-di-stagione-e-la-cassa-che-dice-il-vero)
5. [Cosa sviluppiamo](#5--cosa-sviluppiamo)
6. [Cosa EasyGame possiede gia](#6--cosa-easygame-possiede-gia--extend-vs-new)
7. [Cosa non copiamo da Golee](#7--cosa-non-copiamo-da-golee)
8. [Workstream paralleli](#8--workstream-paralleli)
9. [Ordine di merge](#9--ordine-di-merge)
10. [UAT della Wave](#10--uat-della-wave)
11. [Audit obbligatorio di fine Wave](#11--audit-obbligatorio-di-fine-wave)
12. [Come cambierebbe la gap matrix](#12--come-cambierebbe-la-gap-matrix)
13. [Contatore](#13--contatore)
14. [Scoperte collaterali della verifica](#14--scoperte-collaterali-della-verifica)

---

## 1 — La verifica runtime

### 1.1 Perche era obbligatoria

Il finding **G-01** dell'audit 30 — «il riporto di stagione non riporta
`athlete_category_memberships`» — era **dedotto staticamente**, leggendo
`SEASON_ROLLOVER_TYPES`. L'audit stesso lo aveva marcato **AU-1** come «da
verificare con una prova reale prima di dimensionare G-01», e questo documento
non poteva dimensionare nulla prima di quella prova.

E stato giusto insistere: **al primo tentativo la prova ha dato il risultato
opposto**, e solo guardando il database si e capito che era il collaudo a
sbagliare, non il prodotto. Il §1.4 lo racconta, perche e la parte che conta
per chi rifara questa verifica.

### 1.2 Ambiente e disciplina

| Voce | Valore |
|---|---|
| Database | **sviluppo locale** — `127.0.0.1:5434/easygame_dev`, `EASYGAME_DB_ENV="development"` |
| Applicazione | `next dev` su `127.0.0.1:3010`, avviata per il collaudo e **spenta al termine** |
| Percorso | **HTTP reale**, con cookie di sessione vero e le stesse rotte del browser |
| Scritture | un club QA `WAVE1 QA Club <timestamp>`, un utente, una sessione, 2 sedi, 2 categorie, 4 gruppi operativi, 3 atleti, 3 appartenenze, 2 stagioni |
| Pulizia | **eseguita**. Verifica finale: `club QA residui: 0`, `utenti QA residui: 0`, `sessioni QA residue: 0`. Il database di sviluppo e tornato ai suoi due club preesistenti (`EasyGame FC`, `Nuovo Club`) |
| Dati preesistenti | **nessuno letto in scrittura, nessuno modificato** |
| Script | resta nella cartella di lavoro temporanea della sessione, **fuori dal repository**. Se la Wave verra autorizzata, diventera `scripts/season-rollover-uat.mjs` sullo stile di `scripts/sport-work-uat.mjs` |

### 1.3 Lo scenario eseguito

```
club QA
  └─ stagione A «QA 2026/2027» (attiva)
       ├─ 2 sedi: QA Sede Nord, QA Sede Sud
       ├─ 2 categorie: QA Under 12, QA Under 14
       ├─ 4 gruppi operativi (categoria x sede)
       └─ 3 atleti con 3 appartenenze (categoria + sede)
  └─ POST /api/v1/seasons  { label: «QA 2027/2028», activate: true,
                             rollover: { sourceSeasonId: A, types: <tutti gli 8> } }
```

**Esito: 23 controlli su 23 verdi.**

### 1.4 Il primo tentativo, e perche sbagliava

I due giri precedenti hanno prodotto un risultato **rassicurante e falso**: gli
atleti sembravano restare nelle categorie della stagione nuova. La causa era il
collaudo, non il prodotto:

1. **Il primo giro non ha eseguito alcun riporto.** `POST /api/v1/seasons` con
   `rollover: { sourceSeasonId }` **ma senza `types`** restituisce `200` e
   `rollover: null`: `normalizeRolloverTypes(undefined)` torna un array vuoto e
   `createClubSeason` salta il riporto senza dire niente. *(Registrata come
   scoperta collaterale al §14, W1-14.)*
2. **Il secondo giro creava le risorse con la forma sbagliata.** Le risorse di
   club vogliono i campi **al primo livello** del corpo, non dentro una chiave
   `payload`. Il server aveva quindi scartato `categoryId` e `siteId` dei gruppi
   e assegnato alle categorie un id proprio, diverso da quello che il collaudo
   credeva di aver imposto: le appartenenze puntavano a un id **inesistente**, e
   il filtro `?category_id=` continuava a rispondere perche cadeva sulla colonna
   legacy `athletes.category_id`.

**La lezione di metodo:** una verifica che conferma cio che si spera va guardata
due volte. La certezza e arrivata solo confrontando le **righe del database**
con le risposte HTTP.

### 1.5 Cosa dice la prova, riga per riga

| # | Osservazione | Esito |
|---|---|---|
| 1 | Le categorie create dall'API portano la stagione attiva (`payload.seasonId`) | confermato |
| 2 | Il riporto crea **2 categorie nuove** e **4 gruppi nuovi** (`created: 6`) | confermato |
| 3 | Le categorie della stagione B hanno **id nuovi**, con `rolloverSourceId` che cita l'id della stagione A | confermato |
| 4 | I **gruppi operativi** della stagione B sono **rimappati correttamente** sulle categorie nuove | confermato |
| 5 | Le **sedi non si duplicano**: i gruppi di B citano le stesse sedi di A. Corretto — una sede e un dato globale | confermato |
| 6 | `athlete_category_memberships` **non compare** fra gli 8 tipi riportabili offerti dall'API | confermato |
| 7 | Le appartenenze restano **tre**, invariate, e continuano a citare le categorie della **stagione A** | confermato |
| 8 | `GET /api/v1/athletes?category_id=<categoria nuova>` in stagione B risponde **0** per entrambe le categorie | confermato |
| 9 | Gli atleti **restano visibili** nell'elenco generale: sono dato globale, non spariscono | confermato |
| 10 | La scheda dell'atleta mostra `category_id` = **la categoria della stagione A**, che la stagione B non elenca | confermato |
| 11 | Tornando alla stagione A **tutto e intatto**: 2 atleti nella prima categoria | confermato |

### 1.6 Il verdetto su G-01

**CONFIRMED — verificato a runtime.** Con una precisazione che cambia il tono
del problema e non la sua gravita:

> **Nessun dato viene perso. Viene *scollegato*.**
>
> Dopo il riporto il club ha, nella stagione nuova, le sue categorie e i suoi
> gruppi operativi — **vuoti**. I 3 atleti (in un club vero: 200) restano in
> archivio, ma non appartengono a nessuna squadra della stagione attiva. Nessuna
> schermata lo dice: il riepilogo del riporto annuncia «6 voci create» e tace
> sui tesserati.
>
> E c'e un secondo effetto, piu insidioso: la colonna legacy
> `athletes.category_id` continua a citare la categoria **archiviata**, quindi
> la scheda dell'atleta mostra una categoria che nella stagione attiva **non
> esiste piu**. Il club non vede un vuoto: vede un dato che sembra giusto.

Il lavoro manuale che ne discende — riassegnare a mano categoria e sede di ogni
tesserato, il 1° luglio — e esattamente il momento piu costoso dell'anno per una
segreteria.

---

## 2 — Riesame dei gap di Wave 1

Nove voci. Per ognuna: problema reale, evidenza **dichiarata**, stato, owner,
riuso, sviluppo, cosa non faremo, effort, rischio.

---

### G-01 — Riconferma dei tesserati e ricomposizione delle squadre alla nuova stagione

**Problema reale.** Il 1° luglio una societa apre la stagione nuova. Deve dire
chi c'e ancora e ricostruire le squadre. Oggi crea la stagione, chiede il
riporto, legge «6 voci create» — e si ritrova le squadre vuote, con le schede
degli atleti che mostrano ancora la categoria dell'anno prima. Con 200 tesserati
sono 200 riassegnazioni a mano, fatte scoprendo il problema invece che essendone
avvisati.

**Evidenza.** **RUNTIME** (§1, 23/23 su club QA) + **CODICE**
(`SEASON_ROLLOVER_TYPES` in `src/lib/club-seasons.ts:469`;
`athlete_category_memberships` assente sia da quell'elenco sia da
`SEASON_SCOPED_DATA_TYPES`) + **KB** ([06](06-data-model.md): gli atleti sono
dato globale).

**Stato: `CONFIRMED`.**

**EasyGame owner.** `src/lib/server/seasons.ts` (scrittura) +
`src/lib/club-seasons.ts` (modello) — sono gia i proprietari dichiarati del
dominio stagioni in `CLAUDE.md` §2. Le appartenenze restano di
`athlete_category_memberships` via `src/lib/server/resources.ts`.

**Riuso.** `runClubSeasonRollover` e il suo `idMap` — la rimappatura dei
riferimenti **esiste gia e funziona** (prova §1.5, riga 4): serve estenderla,
non riscriverla. `planSeasonRollover` per l'idempotenza via `rolloverSourceId`.
`summarizeSeasonContents` per il conteggio nel riepilogo. Le azioni di massa gia
presenti sugli atleti per la selezione.

**Sviluppo necessario.**

1. Un tipo riportabile nuovo, **«Tesserati nelle squadre»**, che clona le
   appartenenze della stagione di origine rimappando `category_id` con l'`idMap`
   gia costruito, e conservando `site_id` (le sedi non si duplicano) e
   `is_primary`.
2. **Riconferma per tesserato**: le appartenenze non si riportano tutte in
   silenzio. Un passo di conferma elenca i tesserati della stagione di origine,
   li propone tutti selezionati, e permette di escludere chi non rinnova. Il
   riepilogo dice **quanti** vengono portati e **quanti** restano fuori.
3. **Il riepilogo del riporto deve nominare i tesserati**: oggi dice «6 voci
   create» e tace su di loro. Anche non riportandoli, deve dirlo.
4. **Allineamento della colonna legacy** `athletes.category_id` quando
   l'appartenenza primaria viene riportata, perche la scheda non mostri una
   categoria archiviata.
5. **Permesso dedicato al cambio di stagione** (vedi AU-7).

**Cosa NON faremo.**
- **Non copiamo il modello Golee di azzerare il denaro.** Golee dichiara che
  «quote, entrate e pagamenti ripartono da zero»: in EasyGame rate e incassi
  appartengono gia alla loro stagione e **non si toccano**.
- Non introduciamo una tabella «iscrizione alla stagione»: l'appartenenza a una
  categoria stagionale gia dice tutto.
- Non rendiamo gli atleti season-scoped: sono dato globale per scelta, e
  cambiarlo riscriverebbe mezzo prodotto.
- Non tocchiamo `athletes.category_id` come modello — la si allinea, non la si
  promuove a fonte.

**Effort: M** · **Rischio: MEDIUM** (tocca il riporto, che e centrale e
idempotente: va provato su copia dell'archivio prima di qualunque club vero)

---

### G-19 — Il report Pagamenti conta le rate, non il denaro

**Problema reale.** Un cliente pagante apre `/reports` e legge «Incassato
179,80». Apre `/movements` e legge «250,00». Sono lo stesso periodo e lo stesso
club. Uno dei due e sbagliato, ed e il report.

**Evidenza.** **CODICE**, deterministica: `calculatePaymentReport`
(`src/lib/club-report-utils.ts:477`) somma `movement.amount` — l'importo
**dovuto** — quando la rata risulta saldata, e **zero** per una rata incassata a
meta; `summarizeClubMovements` (`src/lib/club-financial-summary.ts:1319`) somma
`movement.collectedAmount`, che e la cassa. **KB**: gia registrato in
[16](16-technical-debt.md) e misurato a runtime dal Full Club UAT (329,80
dovuti, 250,00 incassati). **ADR-0068** dice quale delle due letture e quella
giusta.

**Stato: `CONFIRMED`.** Non e stato ri-provato a runtime perche il difetto e
deterministico dal codice ed e **gia** stato misurato su dati reali: rifarlo
avrebbe aggiunto un fixture, non una certezza.

**EasyGame owner.** `src/lib/club-report-utils.ts`, letta da `/reports`.

**Riuso.** `summarizeClubMovements` — **la formula corretta esiste gia**. Il
campo `collectedAmount` **arriva gia** sul movimento normalizzato: non serve
recuperarlo, serve sommarlo.

**Sviluppo necessario.** `totalPaid` somma `collectedAmount`; `totalPending` e
`totalOverdue` ripartiscono il **residuo** (`amount − collectedAmount`) invece
dell'importo intero; i contatori distinguono le rate parzialmente incassate
invece di contarle come «in attesa». Piu un'invariante che impedisca a una
seconda pagina di ricominciare a dedurre la cassa dallo stato della rata.

**Cosa NON faremo.** Non riscriviamo `/reports`. Non ne allarghiamo il perimetro
a categorie e soglie di scaduto, che nessuno ha ricollaudato: e la stessa
delimitazione che RC Fix 3 aveva dichiarato.

**Effort: S** · **Rischio: LOW**

---

### G-21 — Le funzioni periodiche che nessuno chiama

**Problema reale.** EasyGame contiene tre funzioni che hanno senso solo se
girano da sole — promemoria dei certificati medici, generazione automatica degli
allenamenti, pulizia periodica. **Nessuna delle tre gira.** Il club crede di
avere un gestionale che lo avvisa, e non succede niente.

**Evidenza.** **CODICE**, verificata rotta per rotta:

| Funzione | Rotta | Autenticazione | Agganciabile a un cron? |
|---|---|---|---|
| Lavoro sportivo | `GET /api/v1/sport-work/scheduler` | `Bearer CRON_SECRET` | **gia agganciata** (unica voce in `vercel.json`) |
| Generazione allenamenti | `GET /api/v1/training-automation` | `Bearer CRON_SECRET` | **si, subito**: la porta esiste ed e identica a quella che gia funziona |
| Manutenzione | `POST /api/v1/maintenance` | `x-maintenance-token` **oppure** sessione `platform_admin` | **no**: e un `POST` con un'intestazione propria |
| Promemoria certificati | `POST /api/medical-certificate-reminders` | **solo `requireAuthenticatedUser`** | **no**: non ha nessuna porta per un cron, e lavora sul club della sessione |

**Stato: `PARTIAL`.** Il gap dell'audit diceva «tre voci in `vercel.json`, `S`».
**E vero per una sola delle tre.** Vercel Cron invoca la rotta in **GET** e non
consente intestazioni proprie — manda `Authorization: Bearer $CRON_SECRET` e
basta. Che sia cosi lo conferma il prodotto stesso: il giro del lavoro sportivo,
l'unico che funziona, e proprio un `GET` con quel `Bearer`. *(Da riverificare
sulla documentazione Vercel al momento dell'implementazione: e un
comportamento di un prodotto esterno, non nostro.)*

**EasyGame owner.** `vercel.json` per il trigger; `src/lib/server/maintenance.ts`
e il dominio dei certificati (`src/lib/medical-certificates.ts` +
`src/app/api/medical-certificate-reminders/route.ts`) per il lavoro.

**Riuso.** Il **modello di porta** di `sport-work/scheduler`: `GET`,
`Bearer CRON_SECRET`, `503` se il segreto manca, idempotente per chiave
deterministica. E gia collaudato e va copiato **come pattern interno**, non
reinventato. Per i certificati: `sendNotificationEmails` e la logica di
deduplicazione dei promemoria gia presente nella rotta.

**Sviluppo necessario.**
1. Una voce `crons` per `training-automation`. **Una riga.**
2. Una porta `GET` autenticata con `CRON_SECRET` sulla manutenzione, accanto a
   quella esistente — **senza** rimuovere il token, che resta la strada per un
   trigger fuori da Vercel (ADR-0007 vieta di legarsi all'hosting).
3. Una porta cron per i promemoria dei certificati che **itera i club** invece
   di leggere il club dalla sessione, con la stessa idempotenza del giro
   notturno.
4. Le tre voci in `vercel.json` e i segreti negli ambienti.

**Cosa NON faremo.** Non usiamo un servizio di scheduling proprietario
dell'hosting come **unico** canale (ADR-0007): il trigger resta fuori e
sostituibile. Non costruiamo il motore di automazioni configurabile di Golee —
**quello e Wave 2**: qui si accende cio che esiste gia, con orari fissi.

**Effort: M** (era `S` nell'audit: la revisione lo corregge) · **Rischio: LOW**

---

### G-26 — Gli elenchi escono solo in PDF

**Problema reale.** Il dato di un club deve poter uscire dal prodotto: per il
commercialista, per la federazione, per un foglio di calcolo. Oggi esce solo in
PDF, che e un documento da leggere, non un dato da usare.

**Evidenza.** **CODICE**: `src/lib/person-export.ts` produce solo
`printPeoplePdf`. `text/csv` compare in tutto `src/` in tre soli punti —
riconciliazione dei bandi, adempimenti del lavoro sportivo, e i nomi di file
degli allegati. Nessun elenco di persone lo produce.

**Stato: `CONFIRMED`.**

**EasyGame owner.** `src/lib/person-export.ts`, che gia possiede **quali colonne
ha ciascuna entita** e **come si legge un valore da un record senza schema**.

**Riuso.** Le definizioni di colonna per atleti, allenatori, staff e soci
esistono e rispettano gia le colonne visibili in elenco. Gli **ambiti di
selezione** (`SelectionScope`, `describeSelection`) esistono. Il tracciato a
punto e virgola della riconciliazione bandi e il precedente da seguire: stesso
separatore, stessa codifica.

**Sviluppo necessario.** Una funzione di serializzazione CSV accanto a quella
PDF, la voce nel menu di export delle quattro liste, e il rispetto delle stesse
colonne visibili. Niente di piu.

**Cosa NON faremo.** Non introduciamo Excel binario (`xlsx` e gia una dipendenza
per l'**import**, ma un `.xlsx` in uscita e un formato in piu da mantenere).
**Non mettiamo l'export dietro il piano commerciale**, che e cio che fa Golee
(`table:export`): il dato del cliente e del cliente.

**Effort: S** · **Rischio: LOW**

---

### G-51 — Firma e timbro del presidente

**Problema reale.** Ogni documento che una societa emette — attestazioni,
richieste di visita medica, dichiarazioni — va firmato dal presidente. Oggi si
stampa, si firma a penna, si scansiona. Per trenta richieste di visita medica
sono trenta giri.

**Evidenza.** **CODICE**: nessuna occorrenza di `firma`, `timbro` o
`signature` sul dominio del club. Esiste `signature-pad.tsx`, ma e la firma
**del compilatore** dentro un modulo online: un'altra cosa.

**Stato: `CONFIRMED`.**

**EasyGame owner.** `/organization` per il dato del club; **Attachment Core**
(`src/lib/server/attachments.ts`) per il file.

**Riuso.** Attachment Core con `owner_type` sul club: driver, autorizzazione
propria, tipi chiusi, limite di dimensione — **gia tutto li**. Il pannello
`/organization` con autosave per sezione.

**Sviluppo necessario.** Una sezione «Firma e timbro» nell'anagrafica
societaria: caricamento di due immagini, anteprima, sostituzione, rimozione. E
un modo per un documento di chiederle. Nient'altro in questa Wave.

**Cosa NON faremo.** **Non copiamo il permesso dedicato di Golee**
(`club:signature:*`) — non ancora: EasyGame ha sette ruoli e non una matrice, e
aggiungere un permesso qui vorrebbe dire aprire il modello per un caso solo.
Sara la Wave 5, con G-33, quando i permessi si toccano davvero. In Wave 1 la
firma sta dove sta la configurazione del club: proprietario e gestore.

**Effort: S** · **Rischio: LOW**

---

### PP-4 — Sollecito degli insoluti verso le famiglie

**Problema reale.** E la prima cosa che una segreteria chiede a un gestionale:
«chi non ha pagato, e come glielo dico». Oggi EasyGame sa perfettamente **chi**
(lo stato della rata e derivato dagli incassi, ed e corretto) e non ha **nessun
modo di dirglielo**. Il club apre WhatsApp, e il dato di cosa e stato
sollecitato esce dal gestionale.

**Evidenza.** **CODICE**. Un meccanismo di sollecito **esiste**, ma per un'altra
cosa: `POST /api/athletes/[athleteId]/documents` con `action: "remind"` scrive
una notifica ai genitori, manda l'email e si protegge con una finestra di **sei
ore**. E per **un documento**, di **un atleta**, alla volta. Per il denaro non
esiste niente: le uniche occorrenze di «sollecit» in tutto `src/` sono quelle tre.

**Stato: `PARTIAL`** — il meccanismo c'e, il destinatario e l'oggetto no.

**Un limite da dichiarare adesso, non a sviluppo fatto.** `createParentNotifications`
parte da `getParentUserIds(athlete)`: raggiunge **solo i genitori con un account
collegato**. Se la famiglia non ne ha uno, la funzione esce senza fare niente e
**senza dirlo**. Un sollecito di massa costruito cosi raggiungerebbe una
frazione sconosciuta delle famiglie e riporterebbe «inviato».

**EasyGame owner.** `src/lib/server/email/` — **unico punto di invio**, come
prescrive `CLAUDE.md` §2. `Notification` per la traccia in-app.
`src/lib/server/payment-transactions.ts` e `summarizeClubMovements` per sapere
chi deve quanto.

**Riuso.** Il pattern di `createParentNotifications` (notifica + email +
finestra di riguardo). `athlete-guardians.ts`, che risolve i tutori e **conosce
gli indirizzi anche quando non c'e un account**. Lo stato della rata gia
derivato. Le azioni di massa e `list-selection.ts` per la selezione.

**Sviluppo necessario.**
1. Un'azione **«Sollecita»** sull'elenco dei pagamenti, con selezione multipla.
2. **Anteprima dei destinatari prima dell'invio**, divisa in due: chi e
   raggiungibile e chi no, **con il motivo** (nessun tutore, nessuna email,
   nessun account). Chi non e raggiungibile si vede, non si perde.
3. Un messaggio con il riepilogo della posizione: importo residuo, rate scadute,
   scadenza della prossima.
4. Una traccia di cosa e stato mandato a chi e quando, con la stessa finestra di
   riguardo gia usata per i documenti.
5. L'invio passa da `email-service` e raggiunge il tutore **per indirizzo** anche
   senza account collegato.

**Cosa NON faremo.**
- **Niente motore di automazioni.** Il sollecito di Wave 1 e **manuale e
  massivo**: lo lancia una persona. Le 34 automazioni configurabili di Golee, i
  tre anticipi, il report giornaliero e i 18 segnaposto sono **Wave 2**, e
  costruirli qui vorrebbe dire farli due volte.
- **Niente secondo canale di notifica**: si scrive in `notifications` e si manda
  da `email-service`, punto.
- **Niente link di pagamento dentro il messaggio** (G-06, Wave 2): richiede un
  link firmato a scadenza, che e un pezzo di sicurezza a se.
- Niente SMS.

**Effort: M** · **Rischio: MEDIUM** (raggiunge persone reali: il collaudo va
fatto su un club QA con indirizzi controllati, **mai** su dati veri)

---

### PP-5 — Attestazione di pagamento e frequenza

**Problema reale.** Ogni anno, ogni famiglia chiede al club un foglio che
attesti quanto ha pagato e che il figlio ha frequentato: serve per i bandi, per
il datore di lavoro, per il 730. Oggi la segreteria lo scrive a mano, uno per
uno, copiando gli importi da una schermata.

**Evidenza.** **CODICE**, ed e peggio di come l'audit lo aveva descritto.
Il catalogo dei segnaposto **esiste gia** in `src/components/forms/DocumentEditor.tsx`
e comprende gia quelli che servono: `{{payment.total_due}}`,
`{{payment.total_paid}}`, `{{payment.remaining}}`, `{{athlete.*}}`, `{{club.*}}`,
`{{season.year}}`. **Ma nessuno li risolve.** La generazione passa da
`renderBlankTemplateForPdf` (`src/app/modulistica/page.tsx:266`), che sostituisce
**ogni** segnaposto con `<span class="blank-field"></span>` — e lo fa anche
quando un atleta e stato selezionato (riga 845, con `selectedAthlete` scelto a
riga 1379).

> **In una frase: EasyGame stampa il modulo vuoto. Il dato ce l'ha, e non lo
> mette dentro.**

**Stato: `PARTIAL`** — il catalogo c'e, il risolutore no.

**EasyGame owner.** `document_templates` + `DocumentEditor` per il modello;
**`src/lib/server/` per il risolutore**, che e logica di dominio e non puo stare
in `page.tsx` (`CLAUDE.md` §11, errore tipico n. 2).

**Riuso.** Il catalogo dei segnaposto, gia scritto e gia raggruppato.
`renderBlankTemplateForPdf`, che resta **la strada giusta per il modulo da
compilare a mano** e non va sostituita: se ne affianca una seconda.
`payment_transactions` e `summarizeClubMovements` per gli importi.
La misura della frequenza che il **dominio contributi** gia calcola per atleta e
per periodo — e la stessa domanda, ed e gia risolta.
`fiscal-recipient.ts` per l'intestatario.

**Sviluppo necessario.**
1. Un **risolutore dei segnaposto** lato server: prende un modello, un atleta e
   una stagione, e restituisce il documento compilato. Modulo puro e testabile,
   con un catalogo **chiuso** — un segnaposto che non conosce resta vuoto e lo
   dichiara, non produce testo a caso.
2. Il modello **«Attestazione di pagamento e frequenza»**, seminato per il club.
3. Nel generatore, la scelta fra **«modulo vuoto»** (oggi) e **«compilato»**.
4. Gli importi arrivano **dalla cassa** (`collectedAmount`), non dallo stato
   della rata: e la stessa disciplina di G-19, e per questo PP-5 **dipende** da
   quel lavoro.

**Cosa NON faremo.**
- **Non apriamo la libreria dei 77 modelli.** Uno, quello che ogni famiglia
  chiede. Il catalogo e Wave 3, ed e **lavoro editoriale**, non sviluppo.
- **Niente stampa massiva** (G-43, Wave 3): un documento, un atleta.
- **Niente dichiarazione 730** (G-13, Wave 3): richiede la causale con la
  detraibilita (G-09), che in Wave 1 non esiste.
- **Niente firma digitale ne `.p7m`** (Wave 3).

**Effort: M** · **Rischio: LOW**

---

### AU-7 — Il cambio di stagione non ha un permesso proprio

**Problema reale.** Cambiare la stagione attiva riscrive il perimetro di **tutti**
i dati che il club vede. Oggi puo farlo chiunque possa modificare la
configurazione del club, cioe proprietario e gestore, senza che l'azione sia
distinta dalle altre.

**Evidenza.** **CODICE**: `canManageClubConfiguration` in
`src/lib/access-roles.ts` e `true` per `owner` e `club_manager`, e non esiste
alcun permesso dedicato. **CONFRONTO**: Golee ha `organization:change-season`
come chiave a se.

**Stato: `CONFIRMED`.**

**EasyGame owner.** `src/lib/access-roles.ts` — **unica fonte di verita per i
ruoli**, `CLAUDE.md` §2.

**Riuso.** La matrice esistente e il pattern gia collaudato dei cinque permessi
di dominio del lavoro sportivo (`src/lib/sport-work/permissions.ts`): permesso
di dominio, **nessun ruolo nuovo**, default negato, diniego tracciato.

**Sviluppo necessario.** Un permesso `seasons.change` con lo stesso perimetro
attuale (proprietario e gestore: **non si restringe niente adesso**), il diniego
tracciato in `audit_logs`, e il test di matrice. Serve a rendere la decisione
**esplicita e spostabile**, non a togliere accesso a qualcuno oggi.

**Cosa NON faremo.** Non copiamo le ~90 chiavi di Golee. Non tocchiamo gli altri
permessi: il dato clinico separato dall'anagrafica (G-33) e Wave 5.

**Effort: S** · **Rischio: LOW**

---

### G-02 — Ambiente di produzione

**Problema reale.** Non esiste. `vercel project ls` mostra un solo progetto,
`easygame-staging`. Finche l'unico ambiente e staging, «rilasciato» non ha un
significato operativo.

**Evidenza.** **KB**: [23](23-v1-release-matrix.md), blocker esterno X-1.
Confermato ancora aperto.

**Stato: `CONFIRMED`, fuori dal codice.**

**Owner.** Proprietario del prodotto. Insieme a X-2 (`DATABASE_URL` e
`DIRECT_URL` sul target Preview) e X-6 (`EASYGAME_MAINTENANCE_TOKEN`).

**Sviluppo necessario.** Nessuno. E una decisione e una configurazione.

**Effort: S** · **Rischio: MEDIUM** (ogni deploy esegue `prisma migrate deploy`:
il primo su un ambiente nuovo va fatto guardando `prisma migrate status`)

---

## 3 — Pre-production challenge

La domanda, per ciascuno: **un club pagante puo iniziare a usare EasyGame senza
questa funzione?**

| # | Voce | Risposta | Classe |
|---|---|---|---|
| **PP-1** | **G-01 — riconferma tesserati** | **Si, il primo giorno. No, al primo cambio di stagione.** E il ragionamento che decide: il prodotto **offre** un riporto, lo esegue, dichiara «6 voci create» e lascia il club convinto di aver traslocato mentre le squadre sono vuote e le schede mostrano una categoria archiviata. Non manca una funzione: **una funzione che c'e dice il falso per omissione**. Un club che si iscrive a maggio ci sbatte in sei settimane | **BLOCKER** |
| **PP-2** | **G-19 — «Incassato» sbagliato nel report** | **Si, ma leggendo un numero falso.** Due pagine dello stesso prodotto rispondono in modo diverso a «quanto ho incassato», e quella sbagliata e quella che si chiama «Report». Su un gestionale amministrativo il dato economico **e** il prodotto. Correzione: `S` | **BLOCKER** |
| **PP-3** | **G-21 — le funzioni periodiche non girano** | **Si.** Nessuna schermata promette che i promemoria partano da soli, quindi il club non si aspetta niente che non arrivi. Resta che tre funzioni pagate non producono valore, e che senza manutenzione sessioni scadute e contatori si accumulano — un problema che cresce, non che blocca | **IMPORTANT** |
| **PP-4** | **sollecito insoluti** | **Si.** Il club manda le email dal suo indirizzo, come fa oggi con qualunque altro strumento. Ma e la prima funzione che una segreteria cerca, e la sua assenza e il motivo piu probabile per cui il gestionale resta un archivio invece di diventare lo strumento di lavoro. Non e un blocker: e la differenza fra adozione e abbandono | **IMPORTANT** |
| **PP-5** | **attestazione di pagamento e frequenza** | **Si.** E un adempimento **annuale**: un club che parte a settembre ne ha bisogno in primavera. C'e tempo, e c'e un modo manuale. Ma va fatto prima del primo giro di bandi | **IMPORTANT** |
| **PP-6** | **G-26 — export CSV** | **Si.** L'export PDF esiste. Il CSV e una questione di fiducia commerciale e di portabilita del dato del cliente, non di operativita quotidiana. Costo `S`, valore alto, **urgenza bassa** | **ENHANCEMENT** |

### 3.1 Blocker reali

**Due nel software** — **PP-1** e **PP-2** — **piu uno esterno gia noto**,
l'ambiente di produzione (X-1), che non e una scoperta di questo confronto.

**Non ho promosso a blocker** le altre quattro, e vale la pena dire perche:
gonfiare la lista dei blocker significa non averne piu. Un club puo lavorare,
incassare, iscrivere, tesserare e rendicontare senza sollecito automatico, senza
attestazione generata e senza CSV. **Non puo** lavorare con un report che
sbaglia i soldi, e **non puo** perdere l'organizzazione delle sue squadre al
cambio di stagione.

### 3.2 Nota sul perimetro minimo di PP-1

Il blocker non e «la funzione completa di riconferma». Il blocker e che **il
prodotto non dice cosa sta per fare e cosa ha fatto**. Se servisse chiudere il
rischio con l'intervento piu piccolo possibile, basterebbe:

1. il riepilogo del riporto che dichiara **«0 tesserati riportati»** invece di
   tacere;
2. un'azione «porta i tesserati nella stagione nuova» eseguibile **dopo**.

E un `S` invece di un `M`. Non e la strada consigliata — la riconferma per
tesserato e la cosa giusta e va fatta bene — ma va scritta, perche se la data di
produzione stringesse sarebbe l'unica parte davvero indispensabile.

---

## 4 — WAVE 1 — «Il passaggio di stagione, e la cassa che dice il vero»

### Perche la facciamo

EasyGame ha un modello dei dati piu solido di quello del concorrente, e due
punti in cui il prodotto tradisce quel modello: al cambio di stagione perde il
legame fra i tesserati e le loro squadre senza dirlo, e nel report dei pagamenti
risponde con un numero che contraddice un'altra sua pagina. Sono i due soli
difetti trovati nell'audit che rendono **rischioso** consegnare il prodotto a un
club che paga.

Intorno a questi due, la Wave accende cio che il prodotto contiene gia e non
usa — tre funzioni periodiche che nessuno chiama — e aggiunge le due cose
minime senza le quali una segreteria torna al foglio di calcolo la prima
settimana: sollecitare chi non ha pagato, e stampare l'attestazione che ogni
famiglia chiede.

Non e la wave che ci rende competitivi. **E la wave che ci rende consegnabili.**

### Cosa sara diverso per il cliente

| Oggi | Dopo la Wave 1 |
|---|---|
| Crea la stagione nuova, legge «6 voci create», e scopre da solo che le squadre sono vuote | Il riporto gli chiede **chi rinnova**, glieli mostra tutti selezionati, e gli dice quanti ne porta e quanti ne lascia fuori. Il 1° luglio le squadre ci sono |
| La scheda di un atleta mostra una categoria che nella stagione attiva non esiste piu | La scheda mostra la squadra della stagione in cui sta lavorando |
| `/reports` dice «Incassato 179,80», `/movements` dice «250,00» | Le due pagine dicono lo stesso numero, e quel numero e il denaro entrato |
| I promemoria dei certificati partono se qualcuno preme un pulsante | Partono da soli, ogni giorno |
| Gli allenamenti ricorrenti si generano a mano | Si generano da soli |
| Chi non ha pagato lo si scopre a schermo e lo si insegue su WhatsApp | Si selezionano gli insoluti, si vede **chi si riesce a raggiungere e chi no**, e si manda il sollecito dal gestionale |
| L'attestazione per il bando si scrive a mano copiando gli importi | Si genera compilata, con l'importo preso dalla cassa e la firma del presidente |
| Gli elenchi escono in PDF | Escono anche in CSV, con le colonne che l'utente sta guardando |
| Cambiare stagione e un'operazione come un'altra | E un'azione con un permesso proprio, e lascia traccia |

---

## 5 — Cosa sviluppiamo

Elenco puntuale: **azione, schermata, comportamento, stato, automazione,
validazione, output.**

### 5.1 Riporto della stagione con riconferma dei tesserati

1. **Azione** «Porta i tesserati nella stagione nuova», come nono tipo
   riportabile nella procedura guidata di creazione stagione.
   **Schermata:** `/organization?tab=stagioni`, passo del riporto.
   **Comportamento:** elenca i tesserati della stagione di origine con la loro
   squadra, tutti selezionati; si deselezionano quelli che non rinnovano.
   **Output:** N appartenenze clonate nella stagione nuova, con `category_id`
   rimappato dall'`idMap` del riporto e `site_id` invariato.
2. **Comportamento** l'appartenenza clonata porta `rolloverSourceId`, quindi
   **rieseguire il riporto non duplica**: e la stessa idempotenza gia usata per
   categorie e gruppi.
3. **Validazione** riportare i tesserati richiede che le **categorie** siano fra
   i tipi selezionati: senza categorie di destinazione non c'e dove metterli, e
   la procedura lo dice invece di riportare appartenenze orfane.
4. **Output** il riepilogo finale dichiara `«N categorie · N gruppi · N
   tesserati riportati · N non riconfermati»`. **Anche quando i tesserati sono
   zero**: e il silenzio di oggi il difetto.
5. **Comportamento** all'atleta riportato si allinea `athletes.category_id` sulla
   categoria primaria nuova, perche la scheda non mostri una categoria
   archiviata.
6. **Stato** un tesserato non riconfermato **non viene toccato**: resta in
   archivio, con le sue appartenenze storiche intatte. Nessuna cancellazione.
7. **Schermata** nella stagione nuova, un avviso che elenca **quanti tesserati
   sono senza squadra**, con il collegamento all'azione di assegnazione in
   blocco che gia esiste.

### 5.2 La cassa nel report

8. **Comportamento** `totalPaid` somma `collectedAmount`; `totalPending` e
   `totalOverdue` ripartiscono il residuo.
   **Schermata:** `/reports`, sezione «Report pagamenti atleti».
   **Output:** «Pagato» uguale a quello di `/movements`, sullo stesso periodo.
9. **Stato** una rata incassata a meta smette di contare come «in attesa» per
   l'intero: contribuisce alla cassa per la parte incassata e al residuo per il
   resto.
10. **Validazione** un'invariante impedisce a una schermata di dedurre di nuovo
    la cassa dallo stato della rata: e la protezione che ADR-0068 chiede.

### 5.3 Le funzioni periodiche

11. **Automazione** generazione degli allenamenti, ogni notte. *(Una voce in
    `vercel.json`: la porta esiste.)*
12. **Automazione** manutenzione periodica, con una porta `GET` autenticata da
    `CRON_SECRET` accanto al token esistente, che resta.
13. **Automazione** promemoria dei certificati medici, ogni mattina, **su tutti
    i club**, con la stessa idempotenza del giro del lavoro sportivo:
    rieseguirla non manda un secondo promemoria.
14. **Validazione** ogni porta cron risponde `503` se `CRON_SECRET` non e
    configurato e `401` se il `Bearer` non corrisponde. Mai `200` a vuoto.

### 5.4 Sollecito degli insoluti

15. **Azione** «Sollecita» sulla selezione multipla dell'elenco pagamenti.
    **Schermata:** `/payments`.
16. **Schermata** anteprima dei destinatari in **due elenchi**: raggiungibili, e
    non raggiungibili **con il motivo** (nessun tutore, nessuna email, nessun
    account collegato).
17. **Comportamento** l'invio raggiunge il tutore **per indirizzo email**, anche
    senza account collegato; a chi ha l'account arriva anche la notifica in-app.
18. **Output** il messaggio riporta importo residuo, numero di rate scadute e
    scadenza della prossima. **Nessun link di pagamento** (Wave 2).
19. **Stato** su ogni rata resta la data dell'ultimo sollecito; un secondo invio
    entro la finestra di riguardo viene rifiutato **dicendolo**, come gia fa il
    sollecito sui documenti.
20. **Validazione** l'azione richiede almeno un destinatario raggiungibile: se
    non ce n'e nessuno non parte niente e la schermata spiega perche.

### 5.5 Attestazione compilata

21. **Azione** «Genera compilato» accanto a «Genera vuoto», nel generatore di
    documenti. **Schermata:** `/modulistica`, con l'atleta gia selezionabile
    come oggi.
22. **Comportamento** un risolutore lato server sostituisce i segnaposto con i
    dati dell'atleta, del club, della stagione e della **cassa**.
23. **Output** il modello «Attestazione di pagamento e frequenza», seminato per
    il club, con importo versato, periodo e frequenza.
24. **Validazione** un segnaposto che il risolutore non conosce resta un campo
    vuoto **ed e elencato** nell'anteprima: il documento non mente e non
    inventa.
25. **Comportamento** il documento porta la firma e il timbro del presidente se
    il club li ha caricati; se non li ha, lo dice prima di generare.

### 5.6 Export e permessi

26. **Azione** «Esporta CSV» accanto a «Esporta PDF» su atleti, allenatori,
    staff e soci, con gli stessi ambiti di selezione e **le colonne visibili**.
27. **Schermata** sezione «Firma e timbro» in `/organization`, con caricamento,
    anteprima, sostituzione e rimozione.
28. **Comportamento** un permesso `seasons.change` distinto, con il perimetro di
    oggi (proprietario e gestore) e il **diniego tracciato**.

---

## 6 — Cosa EasyGame possiede gia — EXTEND vs NEW

| # | Intervento | Domain owner riutilizzato | Verdetto |
|---|---|---|---|
| 1 | Riporto delle appartenenze | `src/lib/server/seasons.ts` + `src/lib/club-seasons.ts` + `athlete_category_memberships`. **L'`idMap` che rimappa i riferimenti esiste gia e funziona** (provato al §1.5) | **EXTEND** |
| 2 | Riconferma per tesserato | La procedura guidata di creazione stagione + `list-selection.ts` | **EXTEND** |
| 3 | Permesso `seasons.change` | `src/lib/access-roles.ts` + il pattern dei permessi di dominio di `sport-work/permissions.ts` | **EXTEND** |
| 4 | Cassa nel report | `club-report-utils.ts`, con la formula gia scritta in `summarizeClubMovements` | **EXTEND** |
| 5 | Cron allenamenti | `GET /api/v1/training-automation`, gia autenticata con `CRON_SECRET` | **EXTEND** (una riga di configurazione) |
| 6 | Cron manutenzione | `src/app/api/v1/maintenance/route.ts` + `src/lib/server/maintenance.ts` | **EXTEND** (una porta nuova su un dominio esistente) |
| 7 | Cron certificati | `src/app/api/medical-certificate-reminders/route.ts` + `sendNotificationEmails` | **EXTEND** (idem) |
| 8 | Sollecito insoluti | `src/lib/server/email/` (**unico punto di invio**), `Notification`, `athlete-guardians.ts`, `payment_transactions`, il pattern di `createParentNotifications` con la finestra di sei ore | **EXTEND** |
| 9 | **Risolutore dei segnaposto** | Il **catalogo** dei segnaposto esiste in `DocumentEditor`; **cio che non esiste e chi li risolve**: `renderBlankTemplateForPdf` li svuota tutti, di proposito, e resta la strada giusta per il modulo da compilare a mano | **NEW CAPABILITY** |
| 10 | Modello «Attestazione» | `document_templates` + gli importi da `payment_transactions` + la frequenza gia misurata dal **dominio contributi** | **EXTEND** |
| 11 | Export CSV | `person-export.ts` (colonne e ambiti gia definiti) + il tracciato a punto e virgola della riconciliazione bandi | **EXTEND** |
| 12 | Firma e timbro | `/organization` + **Attachment Core** | **EXTEND** |

### 6.1 Motivazione dell'unica NEW CAPABILITY

**Il risolutore dei segnaposto (#9).** Nulla in EasyGame risolve oggi un
segnaposto contro i dati di una persona: l'unico consumatore esistente li
**cancella**. Non e un'estensione mascherata da riscrittura — e la parte che
manca fra un catalogo che c'e e un output che c'e.

Vincoli che accetta per non diventare un secondo sistema:
- **modulo puro sotto `src/lib/server/`**, isolabile (ADR-0007), non dentro
  `page.tsx`;
- **catalogo chiuso**, lo stesso che `DocumentEditor` gia mostra: due elenchi
  che divergono sarebbero peggio di nessun elenco;
- **legge, non scrive**: gli importi vengono dal registro incassi, la frequenza
  dal dominio contributi. Non calcola niente per conto proprio;
- **non sostituisce** `renderBlankTemplateForPdf`: le si affianca.

---

## 7 — Cosa non copiamo da Golee

| # | GOLEE | EASYGAME | PERCHE |
|---|---|---|---|
| 1 | Al cambio stagione **«quote, entrate e pagamenti ripartono da zero»** | Rate e incassi appartengono gia alla loro stagione e **restano dove sono**. Si riportano le **persone**, non si azzera il denaro | Azzerare la contabilita per traslocare e una scorciatoia che costa lo storico. Il modello EasyGame non ne ha bisogno: la stagione e gia il perimetro |
| 2 | **34 automazioni configurabili**, tre destinatari, tre anticipi, 18 segnaposto, report giornaliero | Wave 1 accende **tre giri a orario fisso** e un sollecito **manuale e massivo** | Costruire il motore configurabile adesso vorrebbe dire progettarlo prima di sapere quali sei automazioni un club italiano usa davvero. E Wave 2, dopo che il sollecito manuale avra detto cosa serve |
| 3 | **Link di pagamento dentro il sollecito** (`goleePayUrl`) | Non in Wave 1 | Richiede un link firmato con scadenza: e un pezzo di sicurezza, e va fatto una volta sola e bene (G-06, Wave 2) |
| 4 | **77 modelli documentali** mantenuti e regionalizzati | **Uno**: l'attestazione di pagamento e frequenza | Il catalogo e presidio redazionale permanente, non sviluppo. Va deciso con una persona che lo mantenga (Wave 3) |
| 5 | **Export gated dal piano** (`table:export`, `pro_prints`) | Export sempre disponibile | Il dato del cliente e del cliente. Farne una leva commerciale e una scelta che non vogliamo prendere |
| 6 | **Permesso dedicato alla firma del presidente** (`club:signature:*`) | La firma sta nella configurazione del club: proprietario e gestore | EasyGame ha sette ruoli usabili, non una matrice di novanta caselle. Si apre il modello dei permessi quando serve davvero — e serve sul **dato clinico**, in Wave 5 |
| 7 | **Schermata di avvio obbligatoria** in ogni sezione | Empty state che spiega e non blocca | Un click in piu per sezione, ogni volta, e attrito che si paga per sempre |
| 8 | **Riconferma che cancella chi non conferma** | Il non riconfermato **resta in archivio**, con la sua storia | Cancellare un tesserato perche non rinnova e perdere lo storico economico e sportivo che il club deve conservare |
| 9 | **Nessun controllo di duplicati** alla creazione, **nessun deep link** alla scheda | Restano come sono: EasyGame e gia avanti su entrambi | Elencati per completezza: sono difetti del concorrente, non modelli |

---

## 8 — Workstream paralleli

Sette lane. Nessuna coppia parallela scrive pesantemente sullo stesso owner.

---

### W1-A — Stagione: riconferma e riporto dei tesserati

- **Scope:** punti 1–7 del §5, piu il permesso `seasons.change` (punto 28).
- **Owner probabili:** `src/lib/club-seasons.ts`, `src/lib/server/seasons.ts`,
  `src/lib/access-roles.ts`, `src/app/api/v1/seasons/**`, la procedura guidata
  in `/organization?tab=stagioni`.
- **Dipendenze:** nessuna.
- **Conflitto potenziale:** **nessuno.** Nessun altro workstream tocca il
  dominio stagioni. Sfiora `athlete_category_memberships` in **scrittura**, che
  nessun altro tocca in questa Wave.
- **Effort: M** · **Rischio: MEDIUM**

### W1-B — La cassa nel report

- **Scope:** punti 8–10.
- **Owner probabili:** `src/lib/club-report-utils.ts`, `/reports`, invariante in
  `tests/`.
- **Dipendenze:** nessuna.
- **Conflitto potenziale:** **con W1-F e W1-G**, che leggono gli stessi importi.
  Si risolve con l'ordine di merge: B per prima, F e G la consumano.
- **Effort: S** · **Rischio: LOW**

### W1-C — Le funzioni periodiche

- **Scope:** punti 11–14.
- **Owner probabili:** `vercel.json`, `src/app/api/v1/maintenance/route.ts`,
  `src/app/api/medical-certificate-reminders/route.ts`, `src/lib/server/maintenance.ts`.
- **Dipendenze:** i segreti d'ambiente (`CRON_SECRET` gia su staging,
  `EASYGAME_MAINTENANCE_TOKEN` ancora da configurare — X-6).
- **Conflitto potenziale:** **nessuno.** Nessun'altra lane tocca quei file.
- **Effort: M** · **Rischio: LOW**

### W1-D — Export CSV

- **Scope:** punto 26.
- **Owner probabili:** `src/lib/person-export.ts`, i menu di export di
  `/athletes`, `/trainers`, `/staff`, `/soci`.
- **Dipendenze:** nessuna.
- **Conflitto potenziale:** **basso.** Tocca le pagine elenco solo nel menu di
  export. Nessun'altra lane le tocca.
- **Effort: S** · **Rischio: LOW**

### W1-E — Firma e timbro del presidente

- **Scope:** punto 27.
- **Owner probabili:** `/organization`, `src/lib/server/attachments.ts` (solo in
  lettura del contratto: **non si modifica** Attachment Core).
- **Dipendenze:** nessuna.
- **Conflitto potenziale:** **nessuno.**
- **Effort: S** · **Rischio: LOW**

### W1-F — Sollecito degli insoluti

- **Scope:** punti 15–20.
- **Owner probabili:** `src/lib/server/email/`, `src/lib/athlete-guardians.ts`,
  una rotta nuova sotto `/api/v1/`, la pagina `/payments`.
- **Dipendenze:** **W1-B** — deve leggere il residuo con la formula corretta, o
  solleciterebbe la cifra sbagliata.
- **Conflitto potenziale:** con W1-B sulla lettura degli importi. Nessuno sui
  file, se il residuo si legge da `summarizeClubMovements` invece di
  ricalcolarlo.
- **Effort: M** · **Rischio: MEDIUM**

### W1-G — Attestazione compilata

- **Scope:** punti 21–25.
- **Owner probabili:** un modulo nuovo sotto `src/lib/server/`, `/modulistica`,
  `document_templates`.
- **Dipendenze:** **W1-B** (gli importi) e **W1-E** (la firma sul documento).
- **Conflitto potenziale:** con W1-E su `/organization` **no**, perche G legge la
  firma e non la configura.
- **Effort: M** · **Rischio: LOW**

### 8.1 Chi puo partire insieme

```
SUBITO, in parallelo (5 lane):     W1-A   W1-B   W1-C   W1-D   W1-E
DOPO che W1-B e a posto:           W1-F
DOPO che W1-B e W1-E sono a posto: W1-G
```

**Perche non piu di cinque insieme.** Non e un limite di persone: e che W1-F e
W1-G leggono numeri che W1-B sta correggendo. Farli in parallelo significherebbe
scrivere due volte la stessa lettura del denaro — che e esattamente il difetto
che questa Wave chiude.

**W1-A e la lane critica** per durata e rischio: conviene sia la prima ad avere
qualcuno sopra, anche se non e la prima a essere unita.

---

## 9 — Ordine di merge

Ordinato per rischio di conflitto crescente e dipendenza.

| # | Lane | Perche qui |
|---|---|---|
| **1** | **W1-C** — funzioni periodiche | Tocca file che nessun altro tocca. Unirla per prima toglie di mezzo la configurazione degli ambienti, che ha tempi non nostri |
| **2** | **W1-B** — la cassa nel report | **Prerequisito di F e G.** Piccola, isolata, e con la sua invariante evita che le lane successive reintroducano la lettura sbagliata |
| **3** | **W1-A** — stagione e riconferma | E la piu rischiosa: va unita quando l'albero e ancora quieto e l'attenzione alta, non alla fine. I suoi owner sono esclusivi: nessun conflitto testuale atteso |
| **4** | **W1-E** — firma e timbro | Prerequisito di G. Isolata |
| **5** | **W1-D** — export CSV | Tocca i menu delle liste. Dopo A, che non le tocca ma ne cambia il contenuto in stagione nuova |
| **6** | **W1-F** — sollecito insoluti | Dopo B. Prima di G perche non ne dipende |
| **7** | **W1-G** — attestazione compilata | Ultima: dipende da B e da E |

**Regola di rebase.** Ogni lane si riallinea su `integration/web-v1` **prima** di
essere unita, e rifa girare i gate. Una lane che resta aperta oltre due merge
altrui va riallineata comunque.

**Punto di non ritorno.** Dopo il merge 3 (W1-A) va eseguita la UAT del §10.1
**prima** di procedere: se il riporto sbagliasse, tutto cio che viene dopo
lavorerebbe su un archivio sbagliato.

---

## 10 — UAT della Wave

> **La Wave non e `DONE` perche i test sono verdi.** Gli scenari qui sotto si
> definiscono **adesso**, prima dello sviluppo, e si eseguono **a runtime**
> sull'applicazione vera, con un cookie di sessione vero, sul database di
> sviluppo — lo stesso metodo di `scripts/sport-work-uat.mjs` e della verifica
> del §1.

### 10.1 Happy path — il passaggio di stagione

1. Club QA con **due sedi**, **tre categorie**, **200 atleti** distribuiti,
   appartenenze con sede, allenamenti e presenze, rate e incassi.
2. Creazione della stagione B con riporto, **tutti i tipi**, tesserati inclusi.
3. Riconferma di **180**, esclusione di **20**.
4. Verifica: 180 appartenenze nella stagione B con la categoria **nuova** e la
   sede **invariata**; 20 senza; nessuna appartenenza della stagione A alterata.
5. `GET /athletes?category_id=<categoria nuova>` restituisce il numero atteso —
   **e il controllo che al §1 rispondeva zero**.
6. La scheda dei 180 mostra la categoria della stagione B; quella dei 20 mostra
   l'avviso «senza squadra».
7. **Riporto rieseguito**: `created: 0`, `skipped: 180`. Nessun duplicato.
8. Riattivando la stagione A, tutto e come prima.

### 10.2 Happy path — la cassa

9. Rata da 130 EUR: 50 in contanti, 30 con carta. `/movements` e `/reports`
   dicono **entrambe 80,00** incassati e 50,00 residui, sullo stesso periodo.
10. Storno dei 30: entrambe dicono 50,00 e 80,00.
11. Un club senza incassi: entrambe dicono zero, e nessuna delle due mostra
    `NaN` o un vuoto.

### 10.3 Dati reali QA

12. Il collaudo gira sul club di sviluppo **popolato** (223 atleti, due sedi,
    due stagioni), non su tre righe.
13. Il sollecito si prova su un club QA con **indirizzi controllati**. **Mai su
    anagrafiche reali.**

### 10.4 Multi-tenant

14. Due organizzazioni. Il riporto della prima non tocca una riga della seconda:
    conteggi prima e dopo, identici.
15. Il sollecito della prima non raggiunge un tutore della seconda.
16. Un CSV chiesto dalla prima non contiene una riga della seconda.
17. Tentativo di riporto con `x-active-club-id` di un'altra organizzazione:
    respinto, e il diniego finisce in `audit_logs`.

### 10.5 Permessi

18. `owner` e `club_manager` cambiano stagione. `collaborator`, `staff`,
    `trainer`, `parent`, `athlete`: **respinti**, con `Accesso negato` e traccia
    in audit.
19. Chi non puo leggere i dati economici non vede il sollecito.
20. La firma del presidente si carica solo da proprietario e gestore.
21. Nessun errore di autorizzazione fa uscire un messaggio dell'ORM.

### 10.6 Concorrenza

22. **Due riporti simultanei** sulla stessa stagione: l'esito e uno solo, le
    appartenenze non si duplicano. E lo scenario che sul denaro ha gia trovato
    un P0 nel Full Club UAT, e va rifatto qui.
23. **Doppio clic sul sollecito**: due richieste HTTP, **un solo** invio per
    destinatario.
24. Riporto in corso mentre un'altra sessione modifica una categoria: nessuna
    scrittura persa (`clubs.settings` si patcha per chiavi, ADR-0069).

### 10.7 Responsive

25. **375 / 768 / 1280 / 1440** su: procedura di riporto, elenco di riconferma,
    `/reports`, anteprima dei destinatari del sollecito, sezione firma,
    generatore di documenti.
26. `document.scrollWidth` mai superiore alla viewport; le tabelle scorrono nel
    **proprio** contenitore.
27. L'elenco di riconferma con 200 righe deve essere **usabile a 375 px**: se e
    una tabella a scorrimento orizzontale, non lo e.

### 10.8 Regressione sui domini toccati

28. Stagioni: creazione, attivazione, archiviazione, riporto della sola
    configurazione (senza tesserati) — tutto come prima.
29. Pagamenti: incasso, incasso parziale, storno, ricevuta, fattura — invariati.
30. Anagrafiche: creazione, import, export PDF, azioni di massa — invariati.
31. Lavoro sportivo: il giro notturno continua a girare **da solo**, e le tre
    voci `crons` nuove non interferiscono.
32. `npm test`, `npm run typecheck`, `npm run lint`, `npm run build` verdi. I
    warning di lint **non aumentano**.

### 10.9 Performance

La Wave tocca `/reports` e aggiunge un elenco che puo avere centinaia di righe:
la misura e obbligatoria.

33. Riporto con **200 tesserati**: durata e numero di query. **Nessuna N+1** —
    le appartenenze si scrivono in blocco, come gia fa il riporto delle altre
    collezioni.
34. `/reports` su 223 atleti: tempo e peso **prima e dopo**. La correzione non
    deve introdurre una lettura per rata.
35. Elenco di riconferma con 200 righe: peso della risposta. Se non pagina, va
    dichiarato — come e stato fatto per P-5 e SW-11, non nascosto.
36. Il cron dei certificati su **tutti** i club: durata, e verifica che una
    seconda esecuzione non mandi un secondo promemoria.

### 10.10 Cosa fa fallire la UAT

- Un solo tesserato che finisce nella squadra sbagliata.
- `/reports` e `/movements` che dicono numeri diversi.
- Un sollecito che riporta «inviato» a chi non l'ha ricevuto.
- Un documento compilato con un importo che non torna con la scheda.
- Una riga di un'altra organizzazione, in qualunque schermata o file.

---

## 11 — Audit obbligatorio di fine Wave

Quando l'implementazione sara autorizzata **e conclusa**, la Wave non si dichiara
`DONE`: si sottopone a un audit indipendente, che verifica:

| # | Dimensione | Cosa deve dimostrare |
|---|---|---|
| 1 | **Gap realmente chiusi** | Ogni gap del §2 con la prova a runtime che lo chiude, non il commit che lo dichiara |
| 2 | **Nessuna capability duplicata** | Nessun secondo registro, secondo canale di notifica, secondo archivio documenti, seconda lettura del denaro |
| 3 | **Nessun pattern Golee copiato senza ragione** | Il §7 riletto voce per voce sul codice scritto |
| 4 | **Ownership rispettata** | `CLAUDE.md` §2: nessuna logica di stagione fuori da `seasons.ts`, nessun invio email fuori da `email/`, nessuna query club-scoped fuori da `resources.ts` |
| 5 | **Modular monolith preservato** | Nessun servizio nuovo, nessun accoppiamento all'hosting, la logica nuova isolabile sotto `src/lib/server/` (ADR-0007) |
| 6 | **Nessuna regressione** | I quattro gate verdi **piu** gli scenari 28–32 rieseguiti |
| 7 | **Security e multi-tenant** | Gli scenari 14–21 rieseguiti sul codice finale |
| 8 | **UX** | Passaggi contati sui flussi nuovi; nessuna schermata che blocca; ogni diniego che dice il motivo |
| 9 | **Runtime** | Ogni affermazione dell'audit con la sua prova eseguita, non dedotta — **e il §1.4 dice perche** |
| 10 | **Performance** | Gli scenari 33–36, con i numeri prima e dopo |
| 11 | **Responsive** | 375 / 768 / 1280 / 1440 su tutte le schermate nuove |
| 12 | **Debito tecnico introdotto** | Dichiarato in [16](16-technical-debt.md) nello stesso commit. Zero non e una risposta credibile |

**Poi una seconda revisione critica**, indipendente dalla prima, con il mandato
di **smontare** le conclusioni dell'audit — lo stesso metodo che nel Blocco E ha
fatto rientrare dalla porta di servizio un difetto gia dichiarato chiuso.

**Solo dopo** la Wave puo dichiararsi `WAVE 1 = DONE`.

---

## 12 — Come cambierebbe la gap matrix

Proiezione. **La matrice del documento 30 non e stata modificata.**

| Gap | Oggi | Dopo la Wave 1 | Nota |
|---|---|---|---|
| **G-01** | OPEN | **CLOSED** | Con la prova degli scenari 1–8 |
| **G-19** | OPEN | **CLOSED** | Con la prova degli scenari 9–11 |
| **G-21** | OPEN | **CLOSED** | Le tre funzioni girano; il trigger resta fuori dall'hosting |
| **G-26** | OPEN | **CLOSED** | CSV su quattro elenchi |
| **G-51** | OPEN | **CLOSED** | Firma e timbro caricabili e leggibili da un documento |
| **AU-7** | OPEN | **CLOSED** | Permesso dedicato, perimetro invariato |
| **G-02** | OPEN | **OPEN** | Fuori dal codice: resta X-1 |
| **G-07** (comunicazione massiva) | OPEN | **PARTIAL** | Il sollecito insoluti ne e il primo pezzo. Restano segmentazione, bacheca, contenuto configurabile |
| **G-15** (documento arricchito) | OPEN | **PARTIAL** | Il risolutore esiste e un modello lo usa. Resta il catalogo |
| **G-06** (link di pagamento nel sollecito) | OPEN | **OPEN** | Wave 2 |
| **G-03/G-04/G-05** (motore automazioni) | OPEN | **OPEN** | Wave 2. La Wave 1 accende giri a orario fisso, che **non sono** il motore |
| **G-13** (730) | OPEN | **OPEN** | Dipende da G-09, Wave 4 |
| **G-14** (libreria modelli) | OPEN | **OPEN** | Wave 3, ed e lavoro editoriale |
| **G-43** (stampa massiva) | OPEN | **OPEN** | Wave 3 |
| **C-020** riporto configurazione | NO ACTION | **NO ACTION** | Gia superiore. La Wave lo estende senza cambiarne il verdetto |
| **C-074/075/077** modello del denaro | NO ACTION | **NO ACTION** | Gia superiore |
| **C-097** numerazione documenti | NO ACTION | **NO ACTION** | Gia superiore |
| **C-158** deep link | NO ACTION | **NO ACTION** | Gia superiore |
| **C-159** responsivita | NO ACTION | **NO ACTION** | Gia superiore, e la Wave deve non peggiorarla |
| **C-017** multi-sede | NO ACTION | **NO ACTION** | Gia superiore. Il riporto **conferma** le sedi invece di duplicarle (§1.5, riga 5) |

**Effetto sui totali della matrice:** `EG-` da 48 a **44**; `EG~` da 41 a **40**
(due voci scendono da mancante a parziale, tre da parziale a risolte). Le voci
totali restano **189**: una Wave non aggiunge capability al confronto, ne chiude.

---

## 13 — Contatore

```
Gap Wave 1 analizzati:            9
  Confirmed:                      6    (G-01, G-19, G-26, G-51, AU-7, G-02)
  Partial:                        3    (G-21, PP-4, PP-5)
  Needs runtime verification:     0    (G-01 era l'unico, ed e stato verificato)
  False positive:                 0
  Already solved:                 0

Da implementare:                  8    (G-02 e fuori dal codice)
  EXTEND:                        11 interventi su 12
  NEW CAPABILITY:                 1    (il risolutore dei segnaposto, §6.1)

NO ACTION nel perimetro Wave 1:   6    capability analizzate e gia risolte
                                       meglio da EasyGame (C-017, C-020,
                                       C-074/075/077, C-097, C-158, C-159)

Blocker production reali:         3    2 nel software (G-01, G-19)
                                       + 1 esterno gia noto (X-1)
Workstream:                       7    di cui 5 avviabili subito
Scoperte collaterali:             5    (§14), nessuna corretta
Codice modificato:                0
```

---

## 14 — Scoperte collaterali della verifica

Trovate durante il collaudo del §1. **Nessuna corretta.** Non entrano nel
perimetro della Wave se non dove indicato.

| # | Cosa | Dove | Gravita | Nota |
|---|---|---|---|---|
| **W1-11** | **Il riepilogo del riporto tace sui tesserati.** Dichiara «6 voci create» ed e vero, ma non dice che le persone non sono state portate | `createClubSeason` → risposta di `POST /api/v1/seasons` | **ALTA** | **Entra in W1-A**: e il cuore di PP-1. Anche se non si riportassero i tesserati, il silenzio va tolto |
| **W1-12** | **La colonna legacy `athletes.category_id` sopravvive al cambio stagione** e cita una categoria archiviata, quindi la scheda mostra una squadra che nella stagione attiva non esiste | `athletes.category_id` vs `athlete_category_memberships` | **MEDIA** | **Entra in W1-A** (punto 5 del §5). E il lato visibile della doppia sorgente gia nota |
| **W1-13** | **`POST /api/v1/seasons` con `rollover` ma senza `types` risponde `200` e non riporta niente**, senza dirlo. `normalizeRolloverTypes(undefined)` torna vuoto e `createClubSeason` salta il riporto in silenzio | `src/lib/server/seasons.ts`, `src/lib/club-seasons.ts:566` | **MEDIA** | **NUOVA.** L'interfaccia manda sempre i tipi, quindi non si vede: ma un chiamante API che chiede un riporto ottiene un no-op felice. Candidata a W1-A, costo trascurabile |
| **W1-14** | **La proiezione di elenco delle risorse di club non espone `payload.id`** | `listResource` | **BASSA** | Non e un difetto: e una proiezione. Va **documentata**, perche chi scrive un collaudo ci cade — questo collaudo ci e caduto |
| **W1-15** | **`createParentNotifications` esce in silenzio se nessun tutore ha un account collegato** | `src/app/api/athletes/[athleteId]/documents/route.ts:121` | **MEDIA** | **Entra in W1-F** come vincolo di progetto: un invio che non raggiunge nessuno non deve dire «inviato» |

Restano aperte e **fuori dal perimetro** di questa Wave le voci gia registrate
nell'audit 30 §21: AU-3 (`qr-code-utils.ts` orfano), AU-4
(`AttendanceConfirmation.tsx` orfano — e il punto di partenza di G-20, Wave 2),
AU-5 (due elenchi di documenti dell'atleta — da unificare **prima** di G-42,
Wave 3), AU-6 (cinque archivi di persona), AU-8 (`/api/v1/attachments/:id` che
fa uscire il messaggio dell'ORM), AU-9 (la [11](11-capabilities.md) dice «da
collaudare» dove la [23](23-v1-release-matrix.md) dice «collaudato»: **va
allineata**, in un commit che non sia un audit).

---

*Documento di planning prodotto il 2026-08-28. La sola scrittura effettuata e
stata su un club QA del database di **sviluppo**, creato e rimosso durante la
verifica del §1. Nessun file di codice, nessuno schema, nessuna migrazione e
nessuna configurazione di ambiente sono stati modificati. Nessun workstream e
stato avviato.*
