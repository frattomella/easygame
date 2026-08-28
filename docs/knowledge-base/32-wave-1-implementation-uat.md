# 32 — Wave 1: implementazione e collaudo

**Data:** 2026-08-28 / 2026-08-29
**Baseline:** `integration/web-v1` @ `8274544`
**Contratto:** [31 — Wave 1: planning esecutivo](31-wave-1-planning.md)
**Stato:** **WAVE 1 = DONE** — vedi [§9 — Verdetto](#9--verdetto)

> Il documento [31](31-wave-1-planning.md) dice **cosa** si sarebbe fatto e
> **perche**. Questo dice **cosa e stato fatto davvero**, con la prova, e dove
> l'esecuzione si e discostata dal piano.

---

## Indice

1. [Cosa e cambiato per il club](#1--cosa-e-cambiato-per-il-club)
2. [I sette workstream](#2--i-sette-workstream)
3. [Dove ci siamo discostati dal piano](#3--dove-ci-siamo-discostati-dal-piano)
4. [Il collaudo a runtime](#4--il-collaudo-a-runtime)
5. [Prestazioni](#5--prestazioni)
6. [Responsivita](#6--responsivita)
7. [I bug trovati durante la Wave](#7--i-bug-trovati-durante-la-wave)
8. [Audit e seconda revisione](#8--audit-e-seconda-revisione)
9. [Verdetto](#9--verdetto)
10. [Residui dichiarati](#10--residui-dichiarati)

---

## 1 — Cosa e cambiato per il club

| Prima | Adesso |
|---|---|
| Crea la stagione nuova, legge «6 voci create», e scopre da solo che le squadre sono vuote | Il riporto gli chiede **chi rinnova**, glieli mostra tutti selezionati, e dichiara quanti ne porta e quanti ne lascia fuori — anche quando sono zero |
| La scheda di un atleta mostra una categoria che nella stagione attiva non esiste piu | La scheda mostra la squadra della stagione in cui si sta lavorando; chi resta fuori non viene toccato |
| Nessuno avvisa che dopo il cambio di stagione ci sono atleti senza squadra | Un avviso in `/organization` li conta, con il collegamento all'assegnazione |
| `/reports` dice «Pagato 179,80», `/movements` dice «Incassato 250,00» | Le due pagine dicono **lo stesso numero**, e quel numero e il denaro entrato |
| Promemoria dei certificati, generazione degli allenamenti e manutenzione non girano | Girano da soli, ogni notte, su tutti i club, e rieseguirli non duplica niente |
| Chi non ha pagato lo si insegue su WhatsApp | Si selezionano gli insoluti, si vede **chi si raggiunge e chi no con il motivo**, e si manda il sollecito dal gestionale |
| L'attestazione per il bando si scrive a mano copiando gli importi | Si genera compilata, con l'importo preso dalla cassa e la firma del presidente |
| Gli elenchi escono solo in PDF | Escono anche in CSV, con le colonne che l'utente sta guardando |
| Cambiare stagione e un'operazione come un'altra | E un'azione con un permesso proprio, e il diniego lascia traccia |

---

## 2 — I sette workstream

L'ordine e quello di merge deciso al §9 del planning: **C → B → A → E → D → F → G**.
Non e stato cambiato.

| Lane | Commit | Cosa contiene |
|---|---|---|
| **W1-C** — funzioni periodiche | `46e030e` | Quattro voci `crons` in `vercel.json`; porta `GET` sulla manutenzione con `CRON_SECRET` **obbligatorio in ogni ambiente**; il dominio dei promemoria certificati estratto in `src/lib/server/medical-certificate-reminders.ts` con porta cron che itera i club e `try/catch` per club |
| **W1-B** — la cassa nel report | `922cc59` | `calculatePaymentReport` somma `collectedAmount`; il residuo si ripartisce fra «in attesa» e «scaduto»; aritmetica in centesimi; `partialCount`; l'invariante strutturale che vieta una terza interpretazione del denaro |
| **W1-A** — stagione e riconferma | `2b4922b`, `2544bd9` | Il nono tipo riportabile «Tesserati nelle squadre»; il passo di riconferma; il riepilogo che nomina i tesserati sempre; l'allineamento di `athletes.category_id`; il permesso `seasons.change`; il `409` sulla corsa persa |
| **W1-E** — firma e timbro | `3834430` | Firma e timbro come allegati `owner_type: "club"`, MIME e limite piu stretti, sezione in «Dati Fiscali», `readClubSignatureImage` per il generatore documentale |
| **W1-D** — export CSV | `5fb3867` | `src/lib/csv.ts` come unico proprietario del tracciato; CSV su atleti, allenatori, staff e soci con le stesse colonne e gli stessi ambiti del PDF |
| **W1-F** — sollecito insoluti | `ac086a7` | Anteprima a due elenchi con il motivo dell'irraggiungibilita; invio per indirizzo anche senza account; idempotenza per rivendicazione (ADR-0078); esito per destinatario |
| **W1-G** — attestazione compilata | `fda327f` | Il risolutore dei segnaposto (unica capability nuova), il catalogo unico condiviso con `DocumentEditor`, il modello dell'attestazione, «Genera compilato» accanto a «Genera vuoto» |
| — | `0bb120e` | La correzione di sicurezza FIRMA-01 emersa dall'audit |

### 2.1 EXTEND vs NEW — verifica sul codice scritto

Il §6 del planning prevedeva **11 EXTEND e 1 NEW CAPABILITY**. E cio che e stato
fatto: l'unica capability nuova e il **risolutore dei segnaposto**
(`src/lib/server/document-placeholders.ts`), e ha rispettato i quattro vincoli
che il §6.1 gli aveva imposto — modulo puro sotto `src/lib/server/`, catalogo
chiuso e **unico** (estratto da `DocumentEditor` in
`src/lib/documents/placeholders.ts`, che entrambi importano), legge e non
calcola, e non sostituisce `renderBlankTemplateForPdf`.

Due moduli nuovi che **non** sono capability nuove, e vale la pena dire perche:

- `src/lib/csv.ts` non aggiunge una capability, ne **toglie** una duplicazione:
  il tracciato CSV era scritto due volte, in modo divergente, e ora ha un
  proprietario. Le due implementazioni preesistenti restano dove sono, in
  allowlist del test strutturale, e sono debito dichiarato.
- `src/lib/server/season-memberships.ts` e la parte del dominio stagioni che
  vive in tabella invece che in `clubs.settings`: `planSeasonRollover` lavora
  sulle collezioni JSON e non puo toccarla. E un'estensione del riporto, non un
  secondo riporto: riusa l'`idMap` che il piano gia costruisce.

---

## 3 — Dove ci siamo discostati dal piano

Tre scostamenti. Sono dichiarati qui perche il planning e il contratto, e un
contratto che cambia in silenzio non e piu un contratto.

### 3.1 La bandiera «primaria» si sposta (W1-A)

Il §10.1 punto 4 della UAT chiedeva «nessuna appartenenza della stagione A
alterata». **Non e stato possibile alla lettera**, e la ragione sta in base
dati: l'indice unico parziale
`athlete_category_memberships_single_primary_per_athlete`
(`prisma/migrations/20260409113000_athlete_category_memberships/migration.sql:32`)
ammette **una sola appartenenza primaria per atleta per club**, non una per
stagione.

«Primaria» significa quindi «la squadra in cui l'atleta sta adesso», ed e anche
cio da cui si ricava `athletes.category_id`. Riportare un tesserato **sposta**
quella bandiera sulla riga nuova e la toglie da quella vecchia. La riga della
stagione precedente **resta**, con la sua categoria e la sua sede: cambia solo
che non e piu la squadra corrente.

Lo scenario 4 della UAT va quindi letto cosi, ed e cosi che il collaudo lo
verifica: **nessuna appartenenza di origine cancellata, nessuna rimappata**, e
la sola bandiera si sposta. Chi non viene riconfermato non viene toccato
affatto — la sua appartenenza resta primaria.

### 3.2 Il sollecito sta su `/movements`, non su `/payments` (W1-F)

Il §5.4 indicava `/payments`. `src/app/payments/page.tsx` e una **redirezione**
a `/movements`: la pagina indicata dal planning non esiste come schermata. Vince
il codice, come prescrive `CLAUDE.md` §1. L'azione e sulla scheda «Previsti» di
`/movements`, dove gli insoluti gia si guardano.

### 3.3 Il perimetro dell'attestazione si ricava dalla scadenza (W1-G)

`payments` non e fra i `SEASON_SCOPED_DATA_TYPES`: una rata non porta una
stagione. Il documento compilato ricava quindi il perimetro dalla **scadenza**
della rata, e una rata senza data resta dentro — la stessa scelta che fa
`filterCollectionBySeason`. E registrato come DOC-01 in
[16](16-technical-debt.md).

---

## 4 — Il collaudo a runtime

> **La Wave non e `DONE` perche i test sono verdi.** Gli scenari del §10 sono
> stati eseguiti **sull'applicazione vera**, con un cookie di sessione vero,
> sul database di sviluppo, dalle stesse rotte che usa il browser.

Tre script, che restano nel repository ed sono rieseguibili:

| Script | Copre | Esito |
|---|---|---|
| `scripts/season-rollover-uat.mjs` | §10.1 (1-8), §10.4 (14-17), §10.5 (18-21), §10.6 (22, 24), §10.8 (28), §10.9 (33-35) | **48/48** |
| `scripts/wave-1-cash-cron-uat.mjs` | §10.2 (9-11), §10.3, §10.4, §10.9 (36) | **28/28** |
| `scripts/wave-1-reminders-docs-uat.mjs` | Solleciti e Documenti del §10, §10.6 (23) | **30/30** |

**106 controlli a runtime, tutti superati** — rieseguiti dopo le correzioni
dell'audit, non prima.

Tutti e tre si rifiutano di partire se `EASYGAME_DB_ENV` non vale
`development`, creano club QA con un prefisso riconoscibile e li distruggono
alla fine. Verifica finale dopo ogni giro: il database di sviluppo torna ai suoi
**due club preesistenti** e ai suoi **224 atleti**, senza residui.

### 4.1 Le prove che contano

**Il passaggio di stagione** (200 atleti, 3 categorie, 2 sedi, 6 gruppi, 180
riconfermati e 20 no):

- 180 appartenenze nella stagione nuova, **zero righe fuori posto**: ogni
  tesserato nella categoria corrispondente, con la sede invariata;
- i 20 esclusi non compaiono nella stagione nuova, e la loro scheda non viene
  riscritta;
- 200 appartenenze di origine ancora li, **nessuna cancellata, nessuna
  rimappata**;
- nessun atleta con due appartenenze primarie;
- `GET /athletes?category_id=<categoria nuova>` risponde **180** — e il
  controllo che al §1 del planning rispondeva **zero**;
- secondo riporto: `created: 0`, `alreadyPresent: 180`;
- due riporti simultanei: nessun duplicato, e chi perde la corsa riceve un
  **409** che dice di riprovare (riprodotto tre volte su tre);
- riattivando la stagione di origine, i 200 tesserati sono ancora tutti li;
- un allenatore riceve `403 Accesso negato`, e il diniego finisce in
  `audit_logs` con `permission: seasons.change`.

**La cassa** — le righe non sono costruite a mano: le scrive il servizio incassi
vero, dalle rotte del browser.

| Scenario | `/reports` | `/movements` |
|---|---|---|
| Rata 130, incassati 50 + 30 | Pagato **80,00** · residuo **50,00** | Entrate **80,00** · previste **50,00** |
| Stornati i 30 | Pagato **50,00** · residuo **80,00** | Entrate **50,00** · previste **80,00** |
| Club senza incassi | 0,00, nessun `NaN` | 0,00 |

La stessa uguaglianza e stata verificata **a schermo**, nel browser, su un club
QA con 12 rate in cinque stati diversi: `/reports` dice «Pagato 720,00 €» e
`/movements` dice «Entrate 720,00 €», con 840,00 € di residuo da entrambe le
parti.

**I giri automatici, non a vuoto.** Il dataset QA e costruito perche qualcosa
venga **generato**: due atleti con certificato scaduto e un tutore con account
producono due promemoria, e la seconda esecuzione ne produce **zero**; un club
con categoria, allenatore, impianto e programma settimanale genera **tre**
allenamenti, e la seconda esecuzione — con l'automazione riarmata, cosi la prova
e la deduplica e non la finestra oraria — non ne aggiunge nessuno.

**I solleciti.** Residuo dalla cassa e non dal dovuto; un tutore con email ma
**senza account collegato** e raggiungibile; chi non ha email e chi non ha
tutori compaiono fra i non raggiungibili **con il motivo**; il doppio clic
produce al piu un invio; con SMTP non configurato **nessuno risulta «inviato»**
e l'audit registra `failure`.

**Il documento.** Importo versato dalla cassa (120,00 su 200 dovuti) e residuo
(80,00); un segnaposto sconosciuto resta vuoto **ed e elencato**; senza firma il
documento si genera e lo dichiara; nessun «undefined»; un atleta di un altro club
viene rifiutato senza far uscire il messaggio dell'ORM.

---

## 5 — Prestazioni

Misure sul database di sviluppo, dalle rotte vere.

| Operazione | Misura | Nota |
|---|---|---|
| Riporto di stagione con **200 tesserati** | **141-262 ms** | Le appartenenze si scrivono in blocco (`createMany`), non una per volta: nessuna N+1 |
| Elenco di riconferma, 200 righe | **53-641 ms**, **78 kB** | Il primo giro paga la compilazione di sviluppo. **Non pagina**, ed e una scelta dichiarata: chi deve decidere chi rinnova deve poter scorrere l'elenco intero. Sopra il migliaio di tesserati va rivisto |
| Riepilogo stagioni | **41-60 ms** | Il conteggio dei tesserati per stagione e **una** lettura per tutte le stagioni, non una per stagione |
| Giro dei certificati su tutti i club | **74-86 ms** | |
| Giro degli allenamenti su tutti i club | **43 ms** | |
| Manutenzione periodica | **21-25 ms** | |
| Anteprima del sollecito, 3 posizioni | **49-324 ms** | |
| Invio del sollecito | **46-52 ms** | |
| Documento compilato | **57-650 ms** | |

`/reports` non e stato reso piu lento: la correzione somma un campo che era
**gia** sul movimento normalizzato, e non introduce nessuna lettura per rata.

---

## 6 — Responsivita

Verifica **visiva**, non solo strutturale, nel browser, a **375 / 768 / 1280 /
1440 px**, con `document.scrollWidth` misurato a ogni misura.

| Schermata | Verifica | 375 | 768 | 1280 | 1440 |
|---|---|---|---|---|---|
| Procedura di riporto — passo tipi | **VISUAL** | OK | OK | OK | OK |
| **Elenco di riconferma con 200 righe** | **VISUAL** | OK | OK | OK | OK |
| Riepilogo del riporto | **VISUAL** | OK | OK | OK | OK |
| `/reports` | **VISUAL** | OK | OK | OK | OK |
| `/movements` | **VISUAL** | OK | OK | OK | OK |
| Sezione «Firma e timbro» | **VISUAL** | OK | OK | OK | OK |
| Anteprima del documento compilato | **VISUAL** | OK | — | — | — |
| Anteprima dei destinatari del sollecito | **STRUCTURAL** | — | — | — | — |

**Nessuna misura VISUAL ha prodotto scorrimento orizzontale del documento**,
verificato con `document.scrollWidth` a ogni misura.

L'anteprima dei destinatari del sollecito e dichiarata **STRUCTURAL** e non
VISUAL: aprirla richiede un club QA con rate insolute e tutori, e il database di
sviluppo era gia stato riportato alla baseline. Vale per lei la verifica
statica di `tests/ui/responsive-invariants.test.mjs` — nessuna griglia a due
colonne senza punto di rottura, nessuna tabella fuori dal proprio contenitore —
e la scelta di progetto dichiarata dalla lane: liste impilate, nessuna tabella,
`max-h-[90vh]` con contenuto scorrevole. **Non e la stessa cosa di averla
aperta a 375 px**, ed e per questo che qui c'e scritto STRUCTURAL.

L'elenco di riconferma a 375 px e una **lista verticale di schede** con ricerca,
«Tutti»/«Nessuno» e contatore, non una tabella a scorrimento orizzontale: era il
punto 27 del §10.7, ed era la condizione perche la scelta si possa fare da uno
smartphone il 1° luglio.

Le tre superfici nuove sono state aggiunte alle invarianti statiche di
`tests/ui/responsive-invariants.test.mjs`.

---

## 7 — I bug trovati durante la Wave

| # | Bug | Dove | Esito |
|---|---|---|---|
| 1 | **Il validatore dell'atleta dei promemoria aveva quattro gruppi invece di cinque**: non corrispondeva a nessun UUID reale, quindi `POST /api/medical-certificate-reminders` rispondeva «Atleta non valido» a **qualunque** atleta e il pulsante «Sollecita» della segreteria non ha mai mandato niente | `src/app/api/medical-certificate-reminders/route.ts` | **Corretto** con test di regressione; il validatore ora ha un proprietario solo |
| 2 | **Gli allegati del club non avevano controllo di ruolo** (FIRMA-01): un collaboratore poteva elencare gli allegati del club, trovare la firma del presidente e sostituirla o cancellarla dalla rotta generica | `src/app/api/v1/attachments/**` | **Corretto** con test di contratto |
| 3 | **Due riporti simultanei rispondevano `400 Errore sulla stagione`**: il dato restava corretto, ma chi aveva premuto due volte non aveva modo di capire che poteva riprovare | `src/app/api/v1/seasons/season-request-context.ts` | **Corretto**: ora e un `409` che lo dice |
| 4 | **La mappa degli id del riporto restava vuota al secondo giro**: un piano di pagamento riportato dopo le categorie avrebbe puntato alle categorie della stagione **vecchia** | `src/lib/club-seasons.ts` | **Corretto** con test |
| 5 | **`POST /api/v1/seasons` con un riporto senza tipi rispondeva `200` senza fare niente** (W1-13) | `src/lib/server/seasons.ts` | **Corretto**: ora e un errore esplicito |

Il gemello del bug 1 in `src/lib/server/parent-dashboard.ts:17` **non e stato
corretto**: e un altro dominio, non collaudato in questa Wave, ed e registrato
in [16](16-technical-debt.md).

---

## 8 — Audit e seconda revisione

### 8.1 Il primo audit

Tre revisori indipendenti, con tre mandati diversi e uno solo in comune:
**assumere che il codice appena scritto contenga errori**. Nessuno dei tre ha
scritto una riga di codice; tutti e tre hanno lavorato sul diff
`8274544..HEAD`.

| Mandato | Cosa ha trovato |
|---|---|
| Ownership, duplicazioni, modular monolith | 1 CRITICAL, 5 HIGH, 9 MEDIUM, 8 LOW |
| Sicurezza e concorrenza | 3 HIGH, 5 MEDIUM, 3 LOW |
| Correttezza e regressioni | 1 CRITICAL, 4 HIGH, 12 MEDIUM, 10 LOW |

**Non e stato un audit di conferma.** Ha trovato un difetto che nessuno dei
2.436 test vedeva, e che avrebbe fatto danno al primo cambio di stagione andato
storto; tre escalation di privilegio; e una guardia che si dichiarava invariante
e non lo era.

I difetti sono elencati al §7 e nel commit `ad09690`, che li chiude. In sintesi:

- **1 CRITICAL** — la stagione veniva creata e attivata **prima** di validare il
  riporto: un rifiuto lasciava una stagione nuova, vuota e attiva;
- **3 HIGH sulla correttezza** — due categorie omonime che collassavano in una
  (con i tesserati che finivano nella squadra sbagliata), un atleta che poteva
  restare senza nessuna squadra corrente, e un N+1 sui destinatari del
  sollecito;
- **3 HIGH sulla sicurezza** — il ruolo risolto sul club attivo e il perimetro
  su un club qualunque fra quelli accessibili (solleciti e allegati), e
  `/api/v1/documents/filled` senza nessun controllo di ruolo;
- **1 HIGH sui dati** — il sollecito riscriveva `payments.data` intero senza
  blocco, e poteva cancellare la fotografia degli incassi;
- **2 HIGH sulla disciplina** — tre porte cron su quattro eseguivano senza
  segreto fuori da produzione, e due risolutori di segnaposto convivevano nella
  stessa schermata producendo due documenti diversi dallo stesso modello;
- **1 HIGH sulla protezione** — la guardia strutturale sul denaro cercava le tre
  grafie esatte del codice appena cancellato.

**Cosa i tre revisori hanno verificato e trovato corretto** (elencato perche si
sappia cosa e stato davvero guardato): un solo `PrismaClient`; un solo punto di
invio email; nessun import di `src/lib/server/**` da un componente; nessun
`fetch` diretto a `/api` introdotto; nessuna Server Action; nessun servizio
proprietario dell'hosting; firma e timbro interamente dentro Attachment Core;
il risolutore e il sollecito che **leggono** il denaro dal proprietario invece
di ricalcolarlo; la frequenza misurata una volta sola dal dominio contributi;
il catalogo dei segnaposto davvero unico; l'idempotenza del riporto appoggiata
a un vincolo che **esiste in base dati**; `idMap` che non esce dall'API; e il
§7 riletto voce per voce — **nessuna delle nove voci «da non copiare» e stata
copiata**.

### 8.2 La seconda revisione

Il §11 del planning prescrive «una seconda revisione critica, indipendente
dalla prima, con il mandato di **smontare** le conclusioni dell'audit». E cio
che e stato fatto, sul commit di correzione `ad09690`.

**Ha confermato sei correzioni** leggendole riga per riga: la validazione
spostata prima della scrittura, le due escalation di privilegio chiuse, il gate
cron non aggirabile, il lock sulla tabella giusta (`AthletePayment` e
`@@map("payments")`, e il `findFirst` e **dentro** la transazione), e il
confronto a tempo costante — su quest'ultimo ha esplicitamente **smentito** il
sospetto che il controllo di lunghezza fosse una debolezza: `crypto.timingSafeEqual`
fa lo stesso, e trapela la lunghezza del segreto, non il contenuto.

**E ne ha smontata una.** La correzione sulle categorie omonime chiudeva solo
meta del problema: proteggeva il ramo che corrisponde per nome e non quello che
corrisponde per `rolloverSourceId`. Al **secondo** riporto — cioe nel caso
reale, perche il primo quasi mai e l'ultimo — la collisione tornava. E la
seconda revisione ha fatto esattamente cio per cui esiste: ha trovato un
difetto dichiarato chiuso rientrato dalla porta di servizio.

Ha inoltre rilevato che una delle correzioni era **peggiorativa** (il
riallineamento di ripiego della scheda poteva contraddire una squadra
assegnata a mano), che l'apostrofo anti-formula sporcava i numeri di telefono,
e che un'etichetta della procedura aveva iniziato a mentire.

Tutti i CRITICAL, gli HIGH e i MEDIUM sono chiusi nel commit `5a90106`. I LOW
non inseguiti sono in [16](16-technical-debt.md), sezione «Debito rilevato
dall'audit di fine Wave 1 e non chiuso».

| Livello | Trovati | Corretti | Residui |
|---|---|---|---|
| CRITICAL | 2 | 2 | 0 |
| HIGH | 14 | 14 | 0 |
| MEDIUM | 26 | 19 | 7 (debito dichiarato) |
| LOW | 21 | 6 | 15 (debito dichiarato) |

I due CRITICAL sono lo stesso difetto trovato da due revisori con mandati
diversi (la stagione creata prima della validazione, e la rotta documentale
senza controllo di ruolo); gli HIGH comprendono le sovrapposizioni fra i tre
audit e la seconda revisione.

---

## 9 — Verdetto

### `WAVE 1 = DONE`

| Criterio | Esito |
|---|---|
| Gap Wave 1 chiusi, o motivatamente PARTIAL / NO ACTION | **si** — 6 CLOSED con prova a runtime, 2 PARTIAL, 1 OPEN fuori dal codice (§4.5 del [30](30-golee-easygame-gap-audit.md)) |
| Quattro gate locali | **verdi** — 2.456 test, typecheck pulito, lint 0 errori e nessun warning nuovo, build completata |
| CI | vedi §9.1 |
| Staging | vedi §9.1 |
| UAT a runtime | **106/106** su tre script rieseguibili |
| Audit | **eseguito**, non di conferma: 1 CRITICAL e 5 HIGH trovati e corretti |
| Seconda revisione | **eseguita**, ha smontato una correzione. Nessun CRITICAL o HIGH residuo |
| Regressioni | **nessuna** — gli scenari 28-32 del §10.8 rieseguiti, `renderBlankTemplateForPdf` invariato, il riporto della sola configurazione provato a runtime |
| Cleanup QA | **completato** — database di sviluppo a 2 club e 224 atleti, nessuna sessione QA. Le tracce in `audit_logs` dei club QA sono state rimosse con i club: la policy EasyGame non le dichiara append-only |
| Knowledge base | **aggiornata** — documenti 06, 09, 10, 11, 12, 13, 14, 15, 16, 18 (tre ADR nuovi), 30 (§4.5), 31 (stato), 32 (questo) |

**Cosa questo verdetto non dice.** Non dice che il codice e senza difetti: ne
sono stati trovati piu di quaranta in due giri di revisione, e i quaranta li
hanno trovati leggendo lo stesso codice che duemila test dichiaravano sano.
Dice che i gap approvati sono chiusi con una prova eseguita, che cio che resta
aperto e scritto, e che nessuno dei difetti residui e grave.

---

## 10 — Residui dichiarati

1. **G-02 — ambiente di produzione.** Fuori dal codice, resta il blocker
   esterno X-1. Non esiste un progetto Vercel di produzione, e la Wave non ne
   ha creato uno.
2. **G-07 e G-15 restano PARTIAL.** Il sollecito e il primo pezzo della
   comunicazione massiva; il risolutore e il primo pezzo del documento
   arricchito. Segmentazione, bacheca, contenuto configurabile e catalogo dei
   modelli sono Wave 2 e Wave 3.
3. **Il limite di cron del piano Vercel non e verificato.** `vercel.json` ora
   dichiara **quattro** voci `crons`; il piano dell'account non e leggibile
   dagli strumenti disponibili e il repository non lo documenta. Il primo
   deploy su staging lo dira.
4. **`EASYGAME_MAINTENANCE_TOKEN` non e configurato su nessun ambiente** (X-6).
   Non blocca la manutenzione, che ora ha la sua porta cron, ma il canale
   alternativo che ADR-0007 vuole tenere aperto resta inattivo.
5. **Sette MEDIUM e quindici LOW** dell'audit, elencati in
   [16](16-technical-debt.md): fra i piu rilevanti, `toISOString().slice(0, 10)`
   che sposta una data di un giorno fuori da UTC, il certificato citato nel
   messaggio che non e sempre quello che ha deciso l'invio, e il catalogo dei
   segnaposto che propone dati che nessun documento sa riempire.
6. **Il gemello del validatore troncato in `parent-dashboard.ts`** resta
   aperto: altro dominio, non collaudato in questa Wave (STAG-01).
7. **Gli allenamenti generati scrivono `clubs.trainings` senza passare da
   `resources.ts`** (STAG-02). Preesistente, ma da questa Wave gira ogni notte
   invece di dormire: il disallineamento cresce di un giorno al giorno.
8. **L'elenco di riconferma non pagina** (STAG-04). Misurato: 75-78 kB e
   53-605 ms su 200 tesserati. Sopra il migliaio va rivisto.
