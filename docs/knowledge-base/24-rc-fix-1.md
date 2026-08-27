# 24 — RC Fix 1: i difetti operativi chiusi prima della produzione

**Data:** 2026-08-27 · **Branch:** `integration/web-v1` · **Staging:** deployment
`dg17zy5wd`, alias `easygame-staging-pi.vercel.app`

Questo documento risponde a una domanda sola: **cosa era rotto, perche, e come
si sa che adesso funziona.** Non e un elenco di attivita: per ogni difetto c'e
la causa vera, il posto in cui e stata corretta, e la prova — quasi sempre una
misura fatta su staging, non un test che passa.

## La lezione che vale piu delle singole correzioni

Nove difetti su undici avevano una causa **diversa** da quella che sembravano
avere:

- «il pro-rata non si applica» non era il calcolo, era il periodo che nessuno
  compilava;
- «i PDF non si aprono» non era il visualizzatore, era una direttiva di
  sicurezza che spegneva il plugin;
- «la dashboard e lenta» non era una query lenta, erano dieci attese in fila e
  **la pagina montata due volte**;
- «la combobox e disabilitata» non era un guardrail, era un selettore CSS che
  verificava la presenza di un attributo invece del suo valore.

E due difetti — il piu costoso dei quali, il doppio montaggio della chrome —
**non erano visibili ne dal codice ne dai test**: si sono visti solo aprendo
la pagina su staging e contando le richieste. La regola che ne discende sta in
[15 — Testing](15-testing.md): un banco sintetico misura cio che ha modellato,
e non modella React.

## I punti, uno per uno

### 1. Scheda Club — autosave incompleto

**Tre difetti, uno silenzioso.**

L'autosave dipendeva da `activeTab`: cambiando scheda entro il secondo di
attesa il `clearTimeout` annullava la scrittura e non ne partiva un'altra,
perche la sezione modificata non era piu quella attiva. Nessun avviso.

Il pulsante «Salva Modifiche» rimasto **non salvava la scheda**: salvava tutto
il club — comprese le sezioni gia scritte dall'autosave — e ricaricava la
pagina. La motivazione originaria era il rischio di scrivere un IBAN a meta
digitazione, ma quel rischio un pulsante non lo toglie: lo toglie **non
scrivere un valore che non e ancora un valore**.

La proiezione `?fields=` non elencava indirizzo, CAP, regione, paese, dati
fiscali e IBAN: chi li chiedeva li riceveva **vuoti**, e chi rileggeva il
profilo per riscriverne una sezione li avrebbe azzerati.

**Correzione.** L'autosave guarda tutte le sezioni, non quella aperta.
`validateClubProfileSection` trattiene la sezione finche il valore non ha la
forma giusta e dice perche. Tutte le schede-modulo passano all'autosave e il
pulsante sparisce; restano fuori Stagioni (operazioni proprie con conferma) e
Account e Fatturazione (sola lettura). L'elenco dei campi proiettabili e stato
corretto.

**Due difetti introdotti dalla correzione stessa, trovati in UAT:**

- la scheda Pagamenti non tornava mai «pulita», perche la sua impronta
  conteneva un `updatedAt` marcato con l'ora corrente: **ogni tasto premuto in
  qualunque scheda riscriveva le impostazioni di incasso**. Un'impronta
  confronta cio che l'utente puo cambiare, e l'ora di scrittura non lo e;
- lo stato diceva «Salvato» su una sezione **rifiutata**, perche il successo
  di un'altra sezione sovrascriveva l'errore.

**Prova su staging.** Valore digitato in Contatti e scheda cambiata dopo
200 ms: persistito (`settings.contact2Name`). IBAN `IT60X05` incompleto: non
scritto, messaggio a schermo. IBAN completo: scritto. Dopo la correzione della
chrome: **una sola PATCH** per modifica, `paymentSettings.updatedAt` fermo.

### 2. «Nuovo atleta» e «Nuovo allenatore» fuori dal contenitore

Radice `min-h-screen` invece di `h-[100dvh]`: la radice cresce con il modulo,
il `main` non ha piu un'altezza da cui ricavare il proprio scorrimento e a
scorrere finisce il documento. La barra laterale, alta esattamente `100dvh` e
non sticky, usciva dallo schermo. Stessa forma sbagliata in Strutture, che
annidava `min-h-screen` dentro `min-h-screen`.

**Prova su staging**, `/trainers/new` a 1440 px: portando il `main` a fondo
(`scrollTop` 990) la barra laterale resta a `top: 0` e
`document.scrollTop` resta **0**. Nessuno scorrimento orizzontale a 375, 768,
1280, 1440.

### 3. Import atleti CSV / XML

Il flusso regge. Il collaudo su file interi ha trovato **una colonna non
riconosciuta**: i sinonimi previsti erano «Data nascita» e «Data di nascita»,
e il confronto e per inclusione del candidato nell'intestazione — non il
contrario — quindi «Nascita», «Nato il» e «Nata il», comuni negli export
italiani, non combaciavano. Ogni riga risultava senza data e **l'intero file
finiva fra gli scarti**.

Il riepilogo finale, poi, rivalutava il file contro il club di **dopo**
l'import: annunciava «IMPORTATI 220» accanto a «SCARTATI IN ANTEPRIMA 202»,
elencando come gia presenti proprio le righe appena scritte. Ora il piano viene
congelato quando si preme Importa.

**Prova su staging.** CSV da 223 righe con punto e virgola, intestazione
«Nascita», date italiane, campi vuoti, un doppione, una riga senza data e
un'email non valida: **223 lette, 220 importabili, 3 scartate**, 220 scritte in
6,5 s, 0 errori in scrittura. XML con elementi, attributi e CDATA: 3 lette, 2
importabili, 1 scartata con la ragione giusta.

**Limite noto:** l'import non assegna sede ne gruppo operativo.

### 4. Pro-rata sempre «Non applicato»

Il calcolo era giusto. Rotti erano il dato che riceveva e la risposta che dava.

Il modulo del piano chiede «Inizio periodo/stagione» e «Fine periodo/stagione»:
due date da riscrivere a mano ogni anno, accanto a una casella che si chiama
gia «stagione». Chi accendeva il pro-rata e le lasciava vuote — il caso normale
— otteneva un pro-rata che **non si applicava mai**. Ora, quando il piano non
dichiara un periodo proprio, si usa quello della **stagione attiva**: tutto o
niente, mai meta piano e meta stagione.

`applied` era un booleano, e la scheda atleta scriveva «Non applicato» in
quattro situazioni diverse che si risolvono in tre posti diversi. Ora ogni
esito porta una `reason` e `describeProrationResult` la traduce una volta sola
per le tre superfici che la mostravano ciascuna a modo suo.

**Prova su staging.** Piano «Quota annuale pro-rata», 600 €, pro-rata a giorni,
**date lasciate vuote**. Il modulo scrive: «Se lasci vuote le date uso il
periodo della stagione attiva: 2026-07-01 - 2027-06-30». La conferma sulla
scheda atleta mostra:

| voce | valore |
|------|--------|
| Servizi | 600,00 € |
| Pro-rata | **506,04 €** |
| Totale finale | 506,04 € |
| Rate | 1, scadenza 27 ago 2026 |

600 × 307/364 giorni = 506,04. Prima: «Non applicato», 600,00 €.

### 5. Tendine lunghe senza barra di scorrimento

`SelectContent` non aveva ne un'altezza massima ne i comandi di scorrimento, e
Radix **nasconde** la barra del viewport con uno `<style>` che inietta dentro
il portale. Menu contestuali, sottomenu e popover non avevano nessun tetto.

**Prova su staging** con **221 voci** reali: `max-height` 288 px,
`overflow-y: auto`, la lista scorre, il popover sta dentro lo schermo e
**l'ultima voce e raggiungibile**. Ricerca per nome (20), per cognome (11), per
«Cognome Nome» (11); elenco vuoto → «Nessun atleta trovato».

### 6, 7, 9. Documenti dell'allenatore

Tre gesti rotti, tre posti diversi, una causa strutturale: erano un
sotto-sistema a se che non passava da Attachment Core.

- **caricare non salvava niente**: `addTrainerContract` leggeva e riscriveva
  `clubs.trainer_contracts`, una colonna **che non esiste**;
- **«Visualizza» riportava indietro**: `/trainers/:id/contracts` cercava
  l'allenatore in `clubs.members[].staff_data`, mentre gli allenatori stanno in
  `clubs.trainers`;
- **la scheda mostrava righe vuote**: leggeva `contract.name` e `contract.date`
  mentre chi salvava scriveva `title` e `uploadDate`; il pulsante di
  scaricamento non aveva `onClick`.

**Correzione.** Una griglia sola dentro la scheda — Tipo, Nome file, Caricato,
Scadenza, Stato, Azioni — con Visualizza, Scarica, Sostituisci ed Elimina per
riga, e una finestra leggera per aggiungere. Le due pagine dedicate spariscono.
I byte stanno in Attachment Core, il record conserva il riferimento.

**Prova su staging.** PDF caricato: riga in griglia, `attachments` con
`owner_type=trainer`, 595 byte, blob integro. «Visualizza»: apre
`/api/v1/attachments/<id>` e **resta sulla scheda**. «Sostituisci» con un PNG:
**stesso id**, `image/png`, 70 byte, e **un solo allegato** per l'allenatore —
nessun orfano.

### 8. Il visualizzatore PDF

**Causa misurata, non dedotta.** Servendo lo stesso PDF con i due insiemi di
header e leggendo la console:

| politica | risultato |
|----------|-----------|
| `sandbox; default-src 'none'` (in uso) | «Loading plugin data … has been blocked» + «Blocked script execution … sandboxed» |
| togliendo solo `object-src` | «Framing … has been blocked» |
| con `object-src 'self'` **e** `frame-src 'self'` | nessun errore |

Le immagini si vedevano lo stesso — non passano da un plugin — ed e la ragione
per cui il difetto sembrava capriccioso.

L'audit ha trovato altre tre rotte che servivano file in tre modi diversi: due
rispondevano **sempre** `attachment` (quindi «Visualizza» scaricava) e due non
mandavano `nosniff`, cioe un file registrato con un tipo sbagliato poteva
essere interpretato come pagina dentro l'origine di EasyGame. Tutte e quattro
passano ora da `src/lib/server/stored-file-response.ts`.

**Prova su staging**, sul contratto caricato: `Content-Type: application/pdf`,
`inline` con `filename` **e** `filename*`, CSP senza `sandbox` e con
`object-src`/`frame-src`, `nosniff`, 595 byte, firma `%PDF-1.4`; con
`?download=` diventa `attachment`.

### 10. Combobox atleti «disabilitata» in Abbigliamento

`cmdk` scrive `data-disabled={!!disabled}` su **ogni** voce: quelle abilitate
escono con `data-disabled="false"`, non senza attributo. Il selettore
`data-[disabled]:` verifica la **presenza** dell'attributo, quindi applicava
`opacity-50` e `pointer-events-none` a tutte.

**Prova su staging**, prima e dopo sullo stesso elenco:

| | `data-disabled` | `opacity` | `pointer-events` |
|---|---|---|---|
| prima | `"false"` | `0.5` | `none` |
| dopo | `"false"` | `1` | `auto` |

Selezione verificata: il campo mostra «Athlete Giulia - Senza categoria».

### 11. Dashboard Club — prestazioni

**Misura prima di toccare.** `npm run measure:dashboard` (nuovo) su archivi
sintetici, e il browser su staging.

| | richieste | giri di rete | kB |
|---|---|---|---|
| banco sintetico, 200 atleti, prima | 29 | 10 | 1.960 |
| banco sintetico, 200 atleti, dopo | 4 | 1 | 157 |
| staging, prima | 65 | — | — |
| staging, dopo, **221 atleti** | **23** | — | 116 |

Non era una query lenta. Erano tre cose:

1. la pagina caricava appuntamenti, promemoria, partite e atleti con quattro
   `await` **consecutivi**, dopo altri due per identificare il club;
2. l'archivio atleti veniva letto **quattro volte**, tre delle quali con il
   `data` intero — tutori, rate, documenti — per contare gli atleti attivi; una
   di quelle letture non veniva usata da nessuno, e due componenti aspettavano
   300 ms di debounce prima ancora di cominciare;
3. **la chrome montava la pagina due volte.** Quattro schermate avevano due
   rami, uno `hidden lg:flex` e uno `lg:hidden`, entrambi contenenti il
   contenuto: nascosto dal CSS, vivo nel DOM. React eseguiva due volte ogni
   effetto, quindi ogni richiesta partiva due volte, a **ogni** breakpoint.

Il terzo punto e quello che il banco sintetico non poteva vedere: non
renderizza React. Non era solo un costo — su Club l'autosave girava in due
istanze, ognuna con il proprio accorpamento: due PATCH sovrapposte sulla stessa
colonna JSON, cioe la condizione in cui una scrittura ne cancella un'altra.

Sopra la piega restano **3 richieste e 29 kB**; il riquadro degli allenamenti
resta una lettura a se, progressiva.

## I gate

| Gate | Esito |
|------|-------|
| `npm test` | **1.838 verdi** (erano 1.746) |
| `npm run typecheck` | pulito |
| `npm run lint` | 0 errori, **40 warning** (erano 41) |
| `npm run build` | completa |
| CI su `integration/web-v1` | verde su Web, Mobile, Guardrail |
| Migrazioni | nessuna nuova; le tre in attesa **erano gia applicate** su staging |

### Test nuovi

| File | Copre |
|------|-------|
| `tests/ui/overlay-menus.test.mjs` | Tendine, menu e popover: altezza massima, comandi di scorrimento, barra rimessa, `data-[disabled=true]` |
| `tests/ui/app-shell-layout.test.mjs` | Radice `h-[100dvh]`, nessuna `min-h-screen`, taglio dello scorrimento, **nessun doppio montaggio** |
| `tests/lib/trainer-documents.test.mjs` | Documenti dell'allenatore, e che nessuno torni a scrivere su `trainer_contracts` |
| `tests/server/club-projection.test.mjs` | Ogni campo chiesto dal profilo del club deve essere proiettabile |
| `tests/lib/payment-proration.test.mjs` | Periodo dalla stagione, le sei ragioni, formattazione italiana |
| `tests/lib/dashboard-overview.test.mjs` | Quattro richieste, nessun duplicato, proiezione `summary` |
| `tests/server/stored-file-response.test.mjs` | La politica che non spegne il PDF, `inline` solo per cio che si guarda, RFC 6266 |
| `tests/lib/athlete-import-hardcheck.test.mjs` | File interi: separatori, date, doppioni, XML, scaglioni, avanzamento, riepilogo congelato |

## Cosa resta aperto

- **Dati di collaudo su staging.** Il club `EasyGame FC` contiene ora **220
  atleti sintetici** con cognome «… RC1», creati attraverso l'import per avere
  un archivio realistico, piu un piano di pagamento e un documento
  dell'allenatore. Non sono stati rimossi: cancellarli e una scrittura di massa
  che va decisa, non fatta di iniziativa.
- **La misura reale su 200+ atleti** e stata fatta sul club di prova, non sul
  club reale da 213 atleti presente su staging, che appartiene a un account
  vero.
- **Le altre ~40 schermate di gestione** montano la chrome a mano. Non
  duplicano il contenuto — il difetto era solo nelle quattro corrette — ma
  restano un pattern ripetuto: vedi [10 — UI/UX](10-ui-ux-conventions.md).
- **Esiste un progetto Neon `easygame-production`**, creato il 2026-08-26 e mai
  usato (0 secondi di attivita). Nello scope Vercel continua a non esserci un
  progetto di produzione. Non e stato toccato.
