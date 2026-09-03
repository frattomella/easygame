# 42 — PP-01: Club, Atleti e Allenamenti

**Data:** 2026-09-03 · **Branch:** `feat/branding-pass` · **Ambito:** stabilizzazione
pre-produzione, prima del pilot reale di Fortitudo su `easygame-staging`.

Questo documento registra cosa e stato riprodotto, quale era la causa, cosa e
stato cambiato e come e stato verificato. Non e un piano: e il verbale.

---

## 0. La cosa piu importante che PP-01 ha trovato

**Tre dei difetti segnalati erano gia stati «chiusi» dalla Wave 6**, con le loro
sonde verdi, e la chiusura non era falsa: le sonde misuravano il **dominio**, e
il dominio era giusto. Il difetto stava fra il dominio e la persona.

| Difetto | Dove il dominio era giusto | Dove la persona lo vedeva rotto |
|---|---|---|
| Categorie di un allenamento | il payload conservava tutte e tre le categorie | l'etichetta tornava al **primo** riscontro (`training-utils.ts`) |
| Filtro stato atleti | `listResourcePage("athletes", {status})` restituiva l'insieme giusto | la cella dell'elenco stampava «In Prestito» per `inactive` e «Sospeso» per `loan` |
| Conflitto di campo | il controllo di sovrapposizione era corretto | la conferma dell'utente **non usciva dal browser** |

E percio che PP-01 aggiunge `scripts/pp-01-uat.mjs` accanto ai test, e che due
dei presidi esistenti sono stati **corretti nel loro modo di guardare**, non
solo integrati: uno cercava `'"In Prestito"'` fra virgolette mentre il difetto
era in un `<span>`, l'altro leggeva 1.800 caratteri a partire da un `indexOf`.

---

## 1. §A — Un allenamento di tre categorie ne mostrava una

> Decisione: [ADR-0111](18-decision-log.md#adr-0111--un-evento-ha-una-categoria-primaria-e-tutte-le-sue-categorie).

### Riprodotto

Allenamento creato su tre categorie. Subito dopo il salvataggio la pagina mostra
«Under 12, Under 15, Prima squadra»; alla prima **ricarica** — che tipicamente
avviene quando si torna a guardarlo dopo che e finito — mostra «Under 12».

La conclusione dell'evento non c'entra: `status` non veniva scritto affatto, la
fase «concluso» si deriva dall'ora. E la **rilettura** a degradare, e la
conclusione e solo l'occasione piu frequente per rileggere.

### Causa, in due strati

**Strato 1 — la vista.** `resolveCategoryLabelForTraining`
(`src/lib/training-utils.ts`) chiamava `getCurrentCategoryMatch`, che iterava i
riferimenti e tornava **al primo che combaciava**. Il primo riferimento e
sempre `categoryId`, cioe la primaria. Le altre due non venivano mai raggiunte.
La stringa «A, B, C» che si vedeva prima della ricarica la componeva il modulo
di creazione, in memoria, e non sopravviveva a un giro in archivio.

**Strato 2 — l'archivio.** `club_events` aveva `category_id` **singolo**. Le
altre categorie vivevano dentro `payload.categories`, cioe in un posto che
nessuna query puo interrogare. Conseguenze misurate, tutte reali:

- filtrare il calendario per la **seconda** categoria non trovava l'evento
  (`listClubEvents`, `where.category_id`);
- un ruolo di club recintato sulla seconda categoria non lo vedeva affatto;
- **l'allenatore della seconda categoria era fuori perimetro sul proprio stesso
  allenamento** (`eventWithinTrainerPerimeter` guardava `category_id` e
  `category_name`, e `category_name` conteneva la stringa unita «A, B, C», che
  non e il nome di nessuna categoria: anche il ripiego era morto).

### Correzione

Nuova colonna `club_events.category_ids TEXT[]`, migrazione
`20260903120000_pp01_categorie_evento`, con **travaso** di cio che il payload
gia conteneva — ordine di dichiarazione conservato, primaria per prima,
duplicati e stringhe vuote tolti — e indice GIN.

`category_id` **resta la primaria** e nessun lettore storico cambia. La forma
storica (`toEventLegacyShape`) ora emette `categories` dalla colonna e non piu
solo dal payload.

Wire-up nel proprietario del dominio:

| Punto | Prima | Adesso |
|---|---|---|
| `listClubEvents`, filtro categoria | `where.category_id = x` | `OR` fra `category_id` e `category_ids has x` |
| `listClubEvents`, perimetro del ruolo | `category_id in [...]` | `OR` con `category_ids hasSome [...]` |
| `eventWithinTrainerPerimeter` | primaria + nome | tutte le categorie della riga |
| `assertAccessScopeOnEvent` | una categoria | passa se **almeno una** sta nel perimetro |

La scelta «almeno una» e deliberata e coincide con `hasSome` dell'elenco: un
evento che compare nel calendario e su cui poi ogni atto viene rifiutato e la
divergenza fra cio che si vede e cio che si puo. Il perimetro sulle **persone**
resta separato e piu stretto (`assertAtletiDentroIlPerimetro`).

E la vista: `getTrainingCategoryMatches` torna **tutte** le categorie
riconosciute, e l'etichetta le unisce.

---

## 2. §B — Modificare un allenamento concluso

> Decisione: [ADR-0112](18-decision-log.md#adr-0112--un-evento-con-una-storia-si-corregge-non-si-riscrive).

### Riprodotto

Due meta-verita opposte:

- il client **nascondeva** «Modifica» a un allenamento concluso, quindi non si
  poteva correggere un titolo sbagliato ne aggiungere una nota — cioe proprio le
  due cose che si scrivono **dopo** un allenamento;
- il server non aveva **nessuna** guardia. Passando dall'API si cambiavano data,
  campo, categorie e capienza di un evento con le presenze gia registrate.

E due difetti silenziosi che ne discendevano:

1. **Modificare un allenamento concluso lo riportava «in programma».** La
   fusione ripartiva da `existing.payload`, dove lo stato congelato al momento
   della creazione e `"upcoming"`; `completed` vive **solo in colonna**.
2. **Chiudere le convocazioni di una gara e poi modificarne il titolo le
   riapriva.** Stessa causa: `saveEventConvocations` scrive la colonna
   `convocation_status` e non tocca il payload.

### Correzione

**La fusione parte dalla riga, non dal payload.**
`merged = { ...toEventLegacyShape(existing), id, ...source }`. Il payload resta
l'archivio del dato di partenza (ADR-0098) e continua a portare le chiavi che
nessuna colonna copre, ma non e piu la fonte dello stato corrente.

**La regola di congelamento** (`campiCongelatiToccati`, dominio puro):

| Sempre modificabile | Congelato **se** l'evento ha righe di partecipazione |
|---|---|
| titolo, note, allenatori | istante, fine, sede, struttura, campo, categoria, categorie, gruppi, capienza, richiesta di conferma, termine per confermare |

La linea non passa fra «concluso» e «in programma»: passa fra **cio che ha
lasciato una traccia** e cio che non ne ha lasciata — la stessa distinzione con
cui ADR-0098 decide che un evento con storia si annulla e non si cancella. Un
allenamento concluso che nessuno ha segnato resta modificabile per intero.

**Annullare non e modificare**: un cambio di stato non e mai congelato,
altrimenti l'unica strada che ADR-0098 lascia aperta sarebbe chiusa da questa.

**Nella UI**: «Modifica» compare anche sugli allenamenti conclusi, e il modulo
dichiara in testa cosa e congelato e perche (prop `consolidato`). Il messaggio
del server — che nomina i campi toccati — non viene piu sostituito da «Errore
durante la modifica dell'allenamento».

**La traccia.** Uno scavalcamento della sovrapposizione finisce nel registro
(`sovrapposizioneConfermata`, con i titoli degli eventi in conflitto), e il campo
compare **solo** quando qualcuno ha davvero scavalcato: un avviso che si aggira
senza lasciare scritto chi e quando non e un avviso, e un controllo spento.

> **Nota sull'avviso in UI.** Il client conosce le presenze, non le convocazioni
> ne le risposte delle famiglie: l'avviso e un'anticipazione, non un presidio.
> L'autorita e il server, e quando dice di no lo dice con il proprio messaggio.

---

## 3. §C — Il conflitto di campo e orario

> Decisione: [ADR-0113](18-decision-log.md#adr-0113--il-campo-occupato-e-un-avviso-il-campo-chiuso-e-un-rifiuto).

### Riprodotto

Avviso mostrato, conferma data, e poi
`Errore durante l'aggiunta dell'allenamento`.

### Causa, doppia

1. **La conferma non usciva dal browser.** `window.confirm` decideva se
   *proseguire*, ma la richiesta che partiva era identica a quella che il server
   aveva gia rifiutato. Nessun campo di override esisteva: `grep` di
   `override|force|ignoreConflict|allowOverlap|skipOverlap` sull'intera catena
   dava **zero**.
2. **Client e server non parlavano dello stesso posto.** Il client confrontava
   il **campo** (`locationId`); il server legge il campo da `fieldId`/`field_id`,
   che il modulo **non mandava mai**, quindi `field_id` restava nullo e il
   controllo ricadeva sulla **struttura**. Effetto: due allenamenti su due campi
   diversi dello stesso impianto non davano nessun avviso nel browser e venivano
   rifiutati dal server, con un messaggio generico.

E un terzo: il messaggio vero del server — «Il campo e gia occupato in
quell'orario da «X»» — veniva scartato e sostituito da quello generico.

### Correzione

- `assertNoOverlap` accetta un consenso e, quando c'e, **torna i conflitti
  invece di lanciarli**. `createClubEvent` e `updateClubEvent` leggono
  `allowOverlap` dalla richiesta.
- **Resta bloccante** `assertFieldIsOpen`: il campo **chiuso** non e un giudizio
  di opportunita, e un orario in cui la struttura non apre. La distinzione
  richiesta dal mandato e questa.
- Il modulo manda `fieldId`: le due domande sono ora la stessa domanda.
- `window.confirm` sostituito dal dialogo dell'applicazione (`AlertDialog`), su
  creazione **e** modifica.
- Il messaggio del server arriva all'utente.
- Guardia sul doppio clic (`salvataggioInCorso`): con la sovrapposizione ora
  scavalcabile, la seconda richiesta non e piu fermata dal conflitto e creerebbe
  il doppione che prima l'errore nascondeva.
- `allowOverlap` **non** viene archiviato nel payload: e un'istruzione della
  richiesta, e conservarla la farebbe rispedire da sola alla modifica successiva.

---

## 4. §D — I filtri di stato degli atleti

### Cosa era gia a posto

Il flash iniziale e il «0 risultati» erano **gia stati corretti dalla Wave 6** e
non si riproducono: il vaglio di stato si applica su entrambi i rami del render,
la misura dell'archivio non viene piu da una risposta filtrata, e il filtro
server accetta tutte le grafie note (`athleteStatusQueryValues`). Verificato con
`scripts/wave-6-uat.mjs` (78/78) e con P-21 di `scripts/pp-01-uat.mjs`.

### Cosa era ancora rotto

**L'ultima copia del difetto W6-04**, in `src/app/athletes/page.tsx`: tre rami
per quattro stati, con **due scambiati**.

| Stato in archivio | Filtro che lo seleziona | Etichetta che la riga stampava |
|---|---|---|
| `inactive` | «Disattivati» | **«In Prestito»** |
| `loan` | «In prestito» | **«Sospeso»** |

Chi filtrava «In prestito» otteneva righe etichettate «Sospeso»: si legge
esattamente come «il filtro mostra le persone sbagliate».

**Perche il presidio non l'aveva visto**: `tests/ui/elenco-atleti-filtro.test.mjs`
verificava `sorgente.includes('"In Prestito"')` — **fra virgolette** — e la
scritta era testo JSX in un `<span>`.

### Correzione

La cella legge `ATHLETE_STATUS_LABELS` e `ATHLETE_STATUS_TONE`. Il secondo
esisteva dalla Wave 6, era stato scritto proprio per far combaciare i quattro
stati ovunque, e **non lo chiamava nessuno**.

Il presidio ora cerca la scritta e non la sua punteggiatura, fuori dai commenti,
e in piu verifica il **verso positivo**: la cella *deve* leggere il vocabolario.

---

## 5. §E — La foto profilo

**Non riproducibile.** La rimozione persiste su tutti i percorsi provati:

- dominio del browser → rotta reale → riga: `scripts/pp-01-uat.mjs` P-23/P-24;
- ciclo completo con sostituzione: `scripts/wave-6-uat.mjs` U-04/U-05;
- controspecchio: un salvataggio che non nomina la foto non la cancella.

La causa storica (W6-05) era un `??` che leggeva `null` come «non fornito»; e
stata corretta dalla Wave 6 con `primoDichiarato`, ed e ancora corretta. La foto
sta in due copie (`athletes.avatar_url` e `data.avatar`) e la rimozione le
azzera entrambe. Nessun file orfano: l'immagine e in linea, non un allegato.

**Residuo dichiarato**: la segnalazione arriva dall'uso su `easygame-staging`,
dove il codice corrente non e ancora stato distribuito. Va **riverificata dopo
il deploy**, sulla stessa scheda su cui si e vista.

---

## 6. §F — Conferma sull'eliminazione atleta

**Gia in essere, su entrambe le superfici.**

- Scheda: `richiediConferma` → `ConfirmDialog`, titolo «Eliminare questo
  atleta?», conferma «Elimina atleta», e la descrizione dice cosa resta in
  contabilita e cosa impedisce la cancellazione.
- Elenco: `pendingAthleteDeletion` → `ConfirmDialog`, stessa copia.
- Nessun `window.confirm` in nessuno dei due file, con un presidio che lo
  verifica.
- Guardia server-side **indipendente dalla UI**: `assertPersonalDataDisposed` e
  `assertAthleteHasNoSettledFunding` in `deleteResource`.

Nessuna modifica necessaria.

---

## 7. §G — «Accesso EasyGame» dietro un pulsante

Il pannello occupava la prima schermata di **ogni** atleta per una cosa che
nella vita di quell'atleta si fa una volta sola, o mai.

Adesso: pulsante «Accesso EasyGame» nell'intestazione → `AthleteAccountDialog`.
Contenuto identico — tre stati, quattro azioni, la storia degli inviti — e
nessuna riga del dominio toccata. `usePuoGestireAccessoAtleta` evita che la
chiave `accounts.athlete.manage` venga scritta due volte.

**Effetto secondario positivo**: `GET /api/v1/athlete-accounts/:id` partiva a
ogni apertura di scheda; adesso parte all'apertura del pannello.

«Invia credenziali» **non esisteva piu** (tolto da W6-26, con un presidio che ne
verifica l'assenza): il flusso odierno e invito → link → la persona sceglie la
password (ADR-0104). Nessuna password in chiaro, in nessun ramo.

---

## 8. §H — «Scansiona documento», tolto dalla scheda atleta

### Il censimento, prima di togliere

| Modulo | Altri chiamanti | Esito |
|---|---|---|
| `lib/document-scan.ts` | `lib/document-extraction.ts` | **resta** |
| `lib/document-extraction.ts` | `document-extraction-field`, `document-extraction-ocr` | **resta** |
| `lib/document-extraction-ocr.ts` | `document-extraction-field` | **resta** |
| `lib/pdf-embedded-image.ts` | `document-extraction-ocr` | **resta** |
| `components/forms/document-extraction-field.tsx` | soci/new, staff/new, trainers/new, `AthleteCreateForm`, **e il dialogo del tutore dentro questa stessa scheda** | **resta** |
| `tesseract.js` | `document-extraction-ocr` | **resta** |

La scheda atleta **duplicava** la catena OCR in linea invece di montare il campo
condiviso: e per questo che togliere il suo scanner non tocca nessun'altra
schermata.

### Cosa e stato tolto

Le due CTA, il dialogo, la fotocamera, l'import di `tesseract.js` in pagina, la
selezione dei campi e l'applicazione — **524 righe**. Il limite di crescita della
scheda (`MAX_ATHLETE_PAGE_LINES`) e stato abbassato **insieme** alla rimozione,
8.470 → 7.500, per non regalare alla prossima aggiunta lo spazio liberato.

### La decisione ribaltata, dichiarata

La Wave 6 aveva **respinto** una richiesta simile perche l'OCR esisteva ed era
reale. PP-01 non ripete quella richiesta: il proprietario del prodotto giudica
non utilizzabile **l'esperienza** di quella schermata, e la ricapability andra
riproposta con un percorso serio (acquisizione → riconoscimento → estrazione →
anteprima → conferma → precompilazione). Il presidio ha cambiato segno per **un
solo controllo**, e accanto gli e stato messo il censimento.

---

## 9. §I — «Dati personali» in fondo a «Generale»

**Nessuna duplicazione**: `AthleteDataSubjectSection` non mostra un solo campo
anagrafico. Mostra cosa esiste in archivio sulla persona, come si classifica
(cancellato / anonimizzato / conservato con il motivo) e le due azioni di export
e cancellazione. Lo spostamento e un trasloco, non una fusione.

Sta in coda a «Generale» perche «Generale» e la scheda che si apre da sola: la
guardia dell'eliminazione **nomina** questa sezione, e nominare un posto che si
raggiunge senza cercarlo e cio che lo rende una strada.

---

## 10. §K e §L — La navigazione

**Larghezza.** 320 px → **264 px** sulle tre barre blu (club, allenatore,
genitore). Compressa invariata a 80 px. Nessun offset da aggiornare: la colonna
del contenuto e `flex-1 min-w-0`. Il logotipo e 1000×200 a `h-8`, cioe 160 px, e
sta nei 232 px utili.

**Tooltip.** Esistevano gia su tutte le voci (`SidebarItemTooltip`, Radix, hover
**e** fuoco da tastiera). L'unica icona senza era **l'HUB**, che aveva `title`
del browser. Corretta.

**Lavoro Sportivo.** Da 5 voci a **1**, nella barra laterale e nel menu mobile —
la parita fra i due e verificata da un test esistente.

Nessuna rotta tolta, nessun deep link rotto: il modulo disegna gia la propria
riga di sezioni su **tutte** le sue pagine (`SPORT_WORK_SECTIONS`), e il gate di
permesso e unico (`sport_work.read` nel guscio, `/sport-work` nel prefisso di
`access-roles.ts`), quindi collassare le voci non cambia nessun accesso.

---

## 11. §J — Profile vs Account: **decisione**

### La ricognizione

| Capacita | `/profile/[userId]` | `/account` |
|---|---|---|
| Nome, cognome, telefono | si | si |
| **Email di accesso** | **in sola lettura** | **modificabile** |
| Password | si | si (stessa rotta) |
| Avatar | si, ma su `users.profile_image`, **che non e una colonna** | si, persistito |
| Rimuovi immagine | no | si |
| Stato di verifica email/telefono | no | si |
| Ruolo base e club attivo | no | si |
| Elenco club, cambio, creazione, riscatto accesso, uscita | no | si |
| **Funziona per** | `owner` e `club_manager` soltanto | **ogni ruolo** |

`/profile` scrive via `PATCH /api/v1/users/:id`, e `users` sta in
`MANAGEMENT_ADMIN_ONLY_RESOURCES`: per `collaborator`, `staff`, `trainer`,
`parent`, `athlete` e per **ogni ruolo personalizzato** la pagina si apriva vuota
e il salvataggio rispondeva 403, lasciando anche una riga di diniego nel
registro. `/account` passa da `PATCH /api/v1/auth/user`, che e una rotta
**personale**.

Aveva una cosa in piu — il controllo della politica delle password lato client —
ma la politica e **gia applicata dal server** per entrambe.

### Decisione: **CONSOLIDA SU `/account`, con REDIRECT**

- Le tre porte («Profilo» nel menu utente, l'avatar della barra mobile, il
  rimando dal primo accesso) portano a `/account?profile=1`, che apre
  direttamente il dialogo — sullo schema di `?openCreateClub=1`, gia presente.
- `/profile/[userId]` **resta come reindirizzamento**: l'indirizzo e
  raggiungibile da fuori — un segnalibro, un messaggio di primo accesso, la
  cronologia — e cancellare la cartella avrebbe trasformato ognuno di quei
  percorsi in un 404 per guadagnare due file in meno.
- Le 447 righe della pagina precedente sono state tolte: nessun test la copriva.

**Perche non e un redesign**: nessun campo nuovo, nessun layout nuovo. Si e
tolta una superficie che duplicava peggio, e si e messa una porta al suo posto.

---

## 12. §M — Permessi legacy vs Access Management: **decisione**

### La matrice di copertura

25 interruttori in `/permissions`: **10** voci di navigazione della dashboard
allenatore, **5** riquadri della sua home, **10** azioni e dati.

| Esito | Quanti |
|---|---|
| Coperti dal nuovo Access Management | **0** |
| Parzialmente coperti (esiste una chiave che governa il **dato**, non la voce di menu) | 7 |
| Non coperti | 18 |

I due sistemi lavorano su **archivi disgiunti**: `/permissions` scrive
`clubs.settings.trainerDashboardPermissions`; Access Management scrive
`club_roles`, `club_role_permissions`, `club_access_scopes` (ADR-0102, ADR-0103).
`PERMISSION_CATALOG` contiene **zero** chiavi di navigazione, riquadro o
`viewXxx`.

E lo **scope** e diverso per costruzione: `/permissions` e una configurazione
unica **per tutto il club**; Access Management e **per persona**.

### Decisione: **KEEP PARTIAL** — non rimuovere in PP-01

- **Non REMOVE / REDIRECT**: `/permissions` e l'unica superficie che governa
  quei 25 interruttori, che hanno effetto reale a runtime, e
  `tests/ui/permessi-navigazione-allenatore.test.mjs` deriva l'insieme delle
  leve **dalle schermate dell'allenatore** e verifica la corrispondenza nei due
  versi. Toglierla toglierebbe una funzione, non un doppione.
- **Non MERGE**: ADR-0102 lo vieta strutturalmente — un ruolo personalizzato e
  il **soffitto del ruolo base ∧ le chiavi concesse**, e le chiavi vengono dal
  catalogo. Mettere `navigation.home` o `widgets.summary` nel catalogo
  significherebbe portare interruttori di **impaginazione** dentro un modello di
  autorizzazione: un riquadro nascosto non e un dato protetto. E 10 delle
  `actions.*` sono applicate **solo nel browser** (debito W6-28): andrebbero
  prima rese effettive lato server.

### Cosa e stato fatto qui, e cosa no

**Fatto**: le due voci non si chiamano piu allo stesso modo. «Permessi» →
**«Permessi allenatore»**, che e il nome che la pagina porta gia nella propria
intestazione. E un cambio di etichetta, non di modello, e toglie l'unica
ambiguita reale: due voci adiacenti nello stesso gruppo con lo stesso
sostantivo.

**Non fatto, e dichiarato come residuo:**

| # | Residuo | Perche non qui |
|---|---|---|
| R-1 | `/permissions` **non** ha l'esclusione dei ruoli personalizzati che `/dashboard/access-management` ha. Un `custom:*` passa la guardia di rotta, `getClubSettings` **inghiotte il 403** e la pagina mostra tutti i 25 interruttori accesi a prescindere dalla configurazione vera; il salvataggio poi fallisce | E un difetto di autorizzazione su una pagina fuori dal perimetro PP-01, e va corretto con il suo commit e il suo test |
| R-2 | Le 10 `actions.*` sono applicate solo nel browser (W6-28) | Renderle effettive lato server tocca 10 schermate dell'allenatore |
| R-3 | Ne la barra laterale ne il menu mobile filtrano queste due voci per ruolo: `collaborator` e `staff` le vedono e rimbalzano | Vale per l'intera barra, non per queste due voci |
| R-4 | Non e verificabile dal codice se un club **abbia davvero** una configurazione non predefinita in `settings.trainerDashboardPermissions` | E una domanda sui dati, e determina se la pagina e solo presente o portante. **Va posta prima di qualunque rimozione.** |

---

## 13. Verifica

### Gate

| Gate | Esito |
|---|---|
| `npm test` | **4.617 / 4.617** (baseline 4.583, + 34 controlli nuovi) |
| `npm run typecheck` | pulito |
| `npm run lint` | 0 errori, 36 warning (baseline invariata) |
| `npm run build` | completa |
| `npx prisma migrate status` | allineato, 54 migrazioni |
| Working tree | pulito prima e dopo |

### Collaudo di dominio

| Sonda | Esito |
|---|---|
| `scripts/pp-01-uat.mjs` (nuova) | **31 / 31** |
| `scripts/wave-6-uat.mjs` (regressione) | **78 / 78** |

`scripts/pp-01-uat.mjs` semina un club con tre categorie, una struttura a **due
campi** e un allenatore della **sola seconda** categoria; copre creazione,
conclusione, rilettura, filtro per ognuna delle tre categorie, perimetro
dell'allenatore e del ruolo recintato, congelamento e annullamento, convocazione
che non si riapre, conflitto rifiutato e conflitto confermato, i quattro stati
atleta e la foto profilo dal dominio del browser fino alla riga. Il club viene
cancellato in `finally`.

### Nuovi test permanenti

- `tests/lib/pp-01-allenamenti.test.mjs` — 16 controlli sul dominio puro. Le tre
  funzioni implicate nel difetto §A non avevano **nessun** test: e il motivo per
  cui il difetto e sopravvissuto a due Wave.
- `tests/server/pp-01-perimetro-multi-categoria.test.mjs` — 5 controlli sul
  perimetro allargato. Un allargamento va misurato due volte: una per verificare
  che faccia cio che deve, e una per verificare che **non faccia altro**.
- `tests/ui/pp-01-superfici.test.mjs` — 12 controlli sulle superfici spostate.
  Presidiano che una funzione **abbia una porta**: «Accesso EasyGame» e
  completo e testato da una Wave, e se il pulsante che lo apre sparisse ogni
  test di dominio resterebbe verde.

### Presidi corretti nel modo di guardare

| Presidio | Cosa non vedeva |
|---|---|
| `tests/ui/elenco-atleti-filtro.test.mjs` | cercava `'"In Prestito"'` **fra virgolette**; il difetto era testo JSX |
| `tests/server/perimetro-sede-e-categoria.test.mjs` | leggeva 1.800 caratteri da un `indexOf`: un commento in piu e il presidio falliva su codice **non** cambiato |
| `tests/helpers/fake-prisma.mjs` | non implementava `hasSome`, e una condizione che non sa valutare la considera **soddisfatta**: un test sul perimetro di categoria sarebbe passato restituendo tutte le righe. Aggiunto |

### Cosa **non** e stato verificato, e perche

**Il collaudo dal browser con una sessione autenticata non e stato eseguito.**
La checklist puntuale di cio che resta da guardare a occhio — con, per ogni
riga, cosa succedeva **prima**, che e il modo piu rapido di riconoscere una
regressione — sta in
[42b — La UAT a schermo](42-pp-01-uat-a-schermo.md).
Le pagine gestionali richiedono un accesso, e non inserisco credenziali in un
modulo di login. Gli elementi 11-33 della UAT del mandato che dipendono da una
sessione — l'aspetto della barra a 375/768/1280/1440 px, il flash dell'elenco
atleti, il pannello dell'accesso aperto sullo schermo — restano da guardare a
occhio, dal proprietario del prodotto o con credenziali fornite.

Cio che si poteva verificare senza sessione e stato verificato: la logica dalle
sonde di dominio, e le proprieta strutturali dai test — che e il metodo che
questo repository usa gia per il responsive
(`tests/ui/responsive-invariants.test.mjs`, `app-shell-layout.test.mjs`).

---

## 14. Migrazione e deploy

`20260903120000_pp01_categorie_evento` — **additiva**: una colonna con default,
un `UPDATE` di travaso, un indice GIN. Nessun `DROP`, nessuna colonna
riscritta, `category_id` intatto.

Provata su una tabella temporanea prima di essere applicata (ordine conservato,
duplicati tolti, payload non-array e categoria nulla gestiti), poi applicata al
**solo** database di sviluppo (`easygame_dev`, porta 5434).

**Non e stata applicata a staging.** Ogni deploy Vercel esegue
`prisma migrate deploy`: il travaso girera sui dati pilot di Fortitudo al primo
deploy, ed e per questo che e stato scritto per essere idempotente e non
distruttivo.

---

## 15. Debito aperto da PP-01

> Le voci complete stanno in [16 — Debito tecnico](16-technical-debt.md), sezione «Debito aperto da PP-01».

| # | Cosa | Perche non qui |
|---|---|---|
| **PP01-D1** | `cleanupOrphanScheduledTrainings` (`simplified-db.ts`) scrive `clubs.trainings` direttamente dal browser: `resources.ts` lo rifiuta con 403 da ADR-0098, quindi il pulsante «Rimuovi allenamenti in programma» **fallisce sempre** | E un chiamante che nessuno ha migrato al dominio degli eventi: e una correzione con il suo commit, non un ritocco dentro una lane di altri difetti |
| **PP01-D2** | La modifica di un allenamento dal browser **non manda la versione**: `updateEvent(id, data)` senza terzo argomento, quindi il controllo ottimistico di ADR-0098 non puo mai fallire su quel percorso | Mandarla senza avere un percorso di ricarica sul 409 trasformerebbe un salvataggio riuscito in un errore per la segreteria |
| **PP01-D3** | `historicalCategoryName` viene scritto in due punti di `training/page.tsx` e **non lo legge nessuno** | Codice morto trovato mentre si tracciava §A |
| **PP01-D4** | `buildAthleteRows` emette **una riga per appartenenza**: un atleta in due categorie compare due volte, e i contatori per stato lo contano due volte | Tocca la forma dell'elenco, non i filtri: e un difetto di conteggio con un suo perimetro |
| **PP01-D5** | R-1 di §M: `/permissions` non esclude i ruoli personalizzati e mostra i valori predefiniti al posto di quelli veri | Vedi §12 |
| **PP01-D6** | Il menu `...` di un allenamento e costruito con `innerHTML` a mano invece che con la primitiva del menu | Riscriverlo e un cambiamento di natura diversa da una correzione di difetto |
