# 29 — Lavoro sportivo e compensi: implementazione e UAT

> Il work package che ha attuato l'analisi
> [28](28-lavoro-sportivo-e-compensi-analisi.md).
>
> Data: **2026-08-28**. Branch: `integration/web-v1`, dodici commit da
> `3b9dc18` al commit finale **`da34f8a`**, spinto su `origin`. Le decisioni
> architetturali sono negli ADR **0071–0077** di [18](18-decision-log.md).

---

## Verdetto

**SPORT WORK V1 = DONE.**

La consegna tecnica e chiusa. Il dominio e implementato, integrato, collaudato
a runtime e **in esercizio su staging**: 263 test propri dentro 2.276 verdi, 72
controlli end-to-end sull'applicazione vera, nessun difetto P0 o P1 aperto, CI
verde su tutti e tre i job del commit finale, deployment `READY` sul commit
finale, `CRON_SECRET` configurato e giro notturno che parte.

Le tre condizioni che tenevano il verdetto a PARTIAL sono state chiuse per due
terzi, e la terza non e piu una condizione tecnica:

1. il **deploy su staging** e stato eseguito — **chiuso**, vedi
   [Staging](#staging-eseguito);
2. lo **scheduler** era registrato in `vercel.json` ma non poteva partire senza
   `CRON_SECRET` — **chiuso**, la variabile e su `easygame-staging` e la rotta
   non risponde piu 503 (voce SW-13 di [16](16-technical-debt.md));
3. le **regole normative** del cap. 21 dell'analisi 28 attendono la firma di un
   professionista. **Resta aperta, e non e un difetto**: finche sono `PENDING`
   il motore propone e spiega invece di produrre un numero definitivo, che e la
   scelta dell'[ADR-0073](18-decision-log.md#adr-0073--il-motore-propone-e-spiega-cio-che-non-e-validato-non-produce-un-numero-definitivo).

**Cosa DONE non vuol dire.** Due cose restano vere e vanno dette a chi legge:
il modulo **non e mai stato esercitato da un club reale** — il collaudo lo ha
guidato uno script, non una segreteria — e la parte fiscale sopra i 15.000 non
dice ancora al club quanto trattenere. Sono condizioni di prodotto e di
consulenza, non di codice: nessuna delle due si chiude scrivendo software.

| Voce | Esito |
|------|-------|
| Person Core | **PASS** |
| Rapporti | **PASS** |
| Compensation Plans | **PASS** |
| Outbound Ledger | **PASS** |
| Rules Engine | **PASS** |
| External declarations | **PASS** |
| Contributions | **PARTIAL** — calcolate e congelate; la parte fiscale sopra soglia resta dichiarata «da verificare» per scelta ([ADR-0073](18-decision-log.md#adr-0073--il-motore-propone-e-spiega-cio-che-non-e-validato-non-produce-un-numero-definitivo)) |
| P.IVA | **PASS** |
| Bonuses | **PASS** |
| Expense reimbursements | **PASS** |
| Obligations | **PASS** |
| Scheduler | **PASS** — giro notturno provato su staging, 5 club, 0 falliti |
| Movements integration | **PASS** |
| Permissions | **PASS** |
| Multi-tenant | **PASS** |
| Security | **PASS** |
| Responsive | **PASS** — 375, 768, 1280, 1440 px, nessun trabocco su nessuna pagina |
| Performance | cruscotto 35 ms, scadenze 32 ms su 54 rapporti e 268 scadenze |
| Tests | **2.276 / 2.276** (263 del dominio) |
| CI | **PASS** su GitHub Actions per il commit finale `da34f8a`: Web App, Mobile App, Guardrail di sicurezza |
| Staging | **ESEGUITO** — deployment `READY`, smoke test verde, vedi sotto |
| `CRON_SECRET` | **CONFIGURATO** su `easygame-staging` (target Production). Non impostato altrove |
| Regole in attesa di validazione | **20** (cap. 21 dell'analisi 28); 3 attive nel rule set come `PENDING` |
| Blocker pre-produzione | **0 tecnici**, 1 non tecnico: la validazione professionale |
| Dati QA residui | **nessuno** — il collaudo ripulisce cio che crea |

---

## Cosa e stato costruito

114 file, 24.627 righe. Le proporzioni dicono qualcosa: 26 rotte, 14
componenti, 14 file di test, 12 moduli di dominio puro, 1 migrazione.

**Il motore e i suoi test vengono prima dell'interfaccia**, come l'analisi
chiedeva senza margini. I casi di prova sono gli esempi numerici A–E del cap.
7.3, e stanno nel test e non nel codice: un motore che li superasse leggendo una
costante scritta dentro `engine.ts` proverebbe solo di saper copiare se stesso.

Il perimetro V1 e quello dichiarato: co.co.co. sportiva con motore completo,
P.IVA come sola registrazione, subordinato come solo costo. Fuori restano
ritenuta IRPEF calcolata, tracciati telematici, cedolini, agenti sportivi,
volontari con rimborso forfettario e compensazione fra compensi e quote.

---

## Le tre cose che il modulo si rifiuta di fare

Non sono limiti da chiudere in una versione successiva: sono la ragione per cui
il modulo si puo consegnare.

**1. Non calcola la ritenuta IRPEF.** Sopra i 15.000 mostra l'imponibile
eccedente e si ferma. Quale ritenuta si applichi dipende dalla qualificazione
reddituale della co.co.co. sportiva, e le fonti non sono allineate: le due
ipotesi danno netti diversi di 135 euro su 18.000. Il numero mostrato si chiama
«netto previdenziale (ritenuta fiscale esclusa)» e l'etichetta la produce il
dominio, non la schermata — cosi il divieto vale anche nelle superfici che non
esistono ancora.

**2. Non converte i dati legacy ambigui.** `trainer_payments` non dichiara
rapporto, regole, contributi ne anno fiscale: trasformarlo in un'erogazione
scriverebbe **zero contributi** su compensi su cui i contributi possono
benissimo essere stati versati. Un numero falso con l'aria di un numero
storico. Il test che lo impedisce esiste perche il giorno in cui qualcuno
decidera che «tanto e comodo» deve fallire.

**3. Non trasmette niente.** Non al RASD, non a UNILAV, non all'INPS, non
all'Agenzia delle Entrate. Prepara i dati e ricorda il termine; «assolto»
significa che una persona lo ha fatto e lo ha dichiarato qui.

---

## Il collaudo a runtime, e i due difetti che ha trovato

`scripts/sport-work-uat.mjs` parla HTTP con l'applicazione in ascolto, con un
cookie di sessione vero. **72 controlli, 72 verdi.** Copre gli scenari A–E,
sicurezza, concorrenza, storno, anno nuovo, adempimenti e prestazioni.

Al primo giro erano 68 su 72. Due dei quattro fallimenti erano bug dello script;
**due erano difetti veri, e vivevano entrambi nello spazio fra il dominio e il
modo in cui le rotte lo chiamano** — cioe esattamente dove un doppio di Prisma
non guarda.

### Il registro delle uscite rispondeva elenco vuoto

Gli elenchi filtravano per anno cosi:

```ts
const year = Number(filter.fiscalYear);
...(Number.isInteger(year) ? { fiscal_year: year } : {})
```

Nei test passava `undefined`, e `Number(undefined)` e `NaN`: nessun filtro,
tutto verde. Ma le rotte leggono i parametri con `searchParams.get()`, che
quando il parametro manca restituisce **`null`** — e `Number(null)` non e
`NaN`: e `0`, ed e un intero. Il filtro diventava `fiscal_year = 0`.

**Effetto in schermata:** il registro rispondeva elenco vuoto a chiunque non
chiedesse un anno esplicito, e in Movimenti non compariva nessun compenso.

### Il doppio clic rispondeva 400 invece del movimento gia registrato

L'indice che protegge dal doppio invio e **parziale**, e per un indice parziale
Prisma riporta in `meta.target` il nome dell'indice, non quello delle colonne.
Il riconoscimento cercava solo le colonne, quindi cadeva proprio nel caso per
cui l'indice esiste. Il denaro non usciva due volte — il database teneva — ma
chi premeva due volte vedeva un errore invece di una conferma.

Il doppio di Prisma non lo poteva mostrare: non conosce gli indici parziali.

Un terzo difetto, cosmetico, si e visto **guardando la schermata**: una nota
scriveva «8200.00» dentro una frase italiana. Ora passa dal formattatore
italiano, che sotto le cinque cifre non raggruppa le migliaia — ed e giusto
cosi.

Tutti e tre hanno un test di regressione. La lezione e quella gia scritta in
[15](15-testing.md): **cio che i test non chiamano come lo chiama
l'interfaccia, non e provato.**

---

## Gli scenari, con i numeri

### A — Atleta senior, co.co.co., stagione 2026/27

12.000 euro in 10 rate da 1.200, con 2.000 euro di compensi esterni dichiarati
per il 2026.

- il piano genera **4 rate nel 2026 e 6 nel 2027**: due anni solari, due
  franchigie intere, due rule set;
- la soglia dei 5.000 cade sulla **terza** rata: 2.000 esterni + 3.600 erogati;
- progressivo 2026: **6.800 euro** (4.800 dal club + 2.000 dichiarati), tenuti
  in due colonne distinte;
- contributi 2026: **243,27 euro** — imponibile 1.800, base 900, aliquota
  27,03%;
- soglia fiscale non superata: il netto e definitivo e si chiama cosi.

### A2 — L'anno nuovo

L'erogazione del 30 gennaio 2027 usa il rule set **2027**, riparte da franchigia
piena, e dichiara `definitive: false` perche le aliquote 2027 non sono ancora
pubblicate. Un'erogazione datata **2028** fallisce con un messaggio che dice
quale file creare e avverte di non copiare l'anno prima.

### B — Allenatore, franchigia gia consumata altrove

8.000 pattuiti, 4.000 dichiarati altrove. La prima erogazione da 1.000 e
**coperta per intero** dalla franchigia residua; la seconda e interamente
imponibile: base 500, contributi **135,15** (45,05 lavoratore, 90,10 club),
netto 954,95, costo club 1.090,10.

### C — Professionista con P.IVA

La fattura si rifiuta su una co.co.co. e si accetta sul rapporto giusto. Il
pagamento non applica il calcolo co.co.co.: contributi zero, `rules_version`
nullo, trattamento fiscale `OUT_OF_SCOPE`, e **non entra nel progressivo**.

### D — Rimborso spese, 137,40 euro

Non si liquida senza approvazione. Liquidato, esce dal registro e **non
contamina** il progressivo dei compensi.

### E — Premio playoff, 500 euro

Nasce con trattamento fiscale «da verificare», esce come movimento proprio,
resta fuori dal progressivo, e non si eroga due volte.

### Concorrenza e storno

- due invii dello stesso clic: **una sola uscita**, il secondo riconosce il
  duplicato;
- due erogazioni simultanee da 800 su una rata da 1.200: **una sola passa**;
- lo storno nasce con segno opposto, l'originale resta marcato, la posizione
  scende, e la stessa erogazione non si storna due volte;
- uno storno senza motivo non passa.

### Autocertificazione

Senza, l'erogazione **si ferma** e dice perche. Con la conferma esplicita
procede, e scrive `sport_work.payment.without_current_self_declaration` con
attore, data, rapporto, erogazione e anno.

### Confine di club

Rapporti, scadenze, erogazioni, storni, posizioni, dichiarazioni, cruscotto e
dataset provati **dal club sbagliato**: tutti 403. Un allenatore autenticato
sullo stesso club: 403 su elenco, cruscotto, erogazione e dataset fiscali, con
il diniego tracciato.

---

## Responsivita

Sette pagine — cruscotto, rapporti, scheda rapporto, compensi, scadenze,
adempimenti, Movimenti — misurate a **375, 768, 1280 e 1440 px**: nessun
trabocco orizzontale del documento in nessuna delle 28 combinazioni. Le barre di
sezione e le tabelle larghe scorrono dentro il proprio contenitore.

Verificati a 375 px anche il **dialogo di erogazione** (326 px di larghezza,
scorrevole, con la spiegazione completa), il **dialogo di autocertificazione**
con il suo storico, e la sezione «Lavoro e compensi» della scheda allenatore —
censimento compreso.

---

## Prestazioni

Dataset: 54 rapporti, 268 scadenze, generati via API in 4,4 secondi.

| Chiamata | Tempo |
|----------|-------|
| `GET /relationships` (54 righe) | 20 ms |
| `GET /installments` (268 righe) | 32 ms |
| `GET /dashboard` | 35 ms |
| `GET /payouts` | 19 ms |
| `POST /obligations/sync` | 51 ms |

Nessun N+1 nelle liste: ogni elenco e una query sola con filtro
`organization_id`. Il cruscotto ne fa cinque in parallelo. **Il punto che
crescera** e `syncObligations`, che oggi legge per club e confronta riga per
riga: a mille rapporti va rimisurato.

---

## Staging: eseguito

Il branch e stato **spinto** su `integration/web-v1` fino al commit finale
`da34f8a`. La CI di GitHub Actions e verde su tutti e tre i job — Web App
(`src/`), Mobile App (`easygamemobile/`), Guardrail di sicurezza — e il deploy
su `easygame-staging` **e stato eseguito**.

| Cosa | Esito |
|------|-------|
| Deployment | `READY`, target production del progetto `easygame-staging`, alias `easygame-staging-pi.vercel.app` |
| Migrazioni | nessuna nuova: `20260828100000_sport_work` era gia applicata dal deploy precedente |
| `GET /` | 200 |
| `GET /login` | 200 |
| `GET /api/v1/registry` | 200 |

### Lo scheduler

`CRON_SECRET` e stato generato e impostato su `easygame-staging`, ambiente
Production, **e su nient'altro**. Il valore non e mai stato mostrato ne scritto
in un file del repository.

| Prova | Prima | Dopo |
|-------|-------|------|
| `GET /api/v1/sport-work/scheduler` senza header | **503** «CRON_SECRET non configurato» | **401** «Accesso negato: cron non autenticato» |
| stesso `GET` con un bearer sbagliato | — | **401** |
| stesso `GET` con il bearer giusto | — | **200** |

Il 503 che spariva era il punto: la porta ora esiste e chiede le credenziali
invece di dichiararsi non configurata.

**Esecuzione controllata**, due volte di fila con il bearer giusto:
`processedClubs: 5`, `failed: 0`, e le **due risposte byte per byte
identiche** — zero contratti portati a scaduti, zero maturati ricalcolati,
zero adempimenti creati, zero notifiche. Un controllo sul database di staging
conferma che non esiste **nessuna** notifica con `data.sportWorkKey`: il giro
non ne ha create e non ne ha duplicate.

**Va detto onestamente quanto vale questa prova.** Lo staging non ha oggi
**alcun** dato di lavoro sportivo — zero persone, zero rapporti, zero rate,
zero adempimenti — quindi il giro ha girato a vuoto. Cio che e dimostrato a
runtime e che il job **si autentica, parte, attraversa i cinque club e non
scrive nulla quando non c'e nulla da scrivere**. La deduplicazione vera, quella
per `data.sportWorkKey`, resta dimostrata dai test del dominio
(`tests/server/sport-work-scheduler.test.mjs`: «rieseguire il giro non produce
una seconda notifica», «rieseguire il giro non duplica l'agenda»), non dal
collaudo su staging. Per esercitarla davvero servirebbe seminare dei dati su
staging, che e una scrittura sul database e va autorizzata a parte.

Il cron di Vercel e registrato in `vercel.json` alle **03:30**: la prima
esecuzione automatica sara quella della notte successiva al deploy.

---

## Cosa resta dopo il DONE

Niente di quanto segue e un blocco tecnico: sono le cose che il software, da
solo, non puo chiudere.

| # | Cosa | Chi | Stato |
|---|------|-----|-------|
| 1 | Validazione delle regole del cap. 21 dell'analisi 28 | commercialista, consulente del lavoro, esperto di diritto sportivo | **aperto** — voce SW-02 |
| 2 | Verifica del numero e della data della circolare INPS 2026 | consulente del lavoro | **chiuso** il 2026-08-28: e la n. 8 del 3 febbraio 2026 (voce SW-04) |
| 3 | Deploy su staging e smoke test | chi ha l'autorizzazione | **chiuso**: deployment `READY` sul commit `da34f8a`, smoke test verde |
| 4 | `CRON_SECRET` e giro notturno attivo | chi ha l'autorizzazione | **chiuso** su staging (voce SW-13). Su produzione **non e stato impostato**: quando esistera un progetto di produzione andra fatto li |
| 5 | Collaudo con un club reale, guidato da una segreteria | prodotto | **aperto** |
| 6 | Esercitare il giro notturno su dati veri di staging | sviluppo + autorizzazione a scrivere sul database | **aperto** |
| 7 | Movimenti deve dire perche mancano i compensi a chi non li puo vedere | sviluppo, voce SW-01 | **aperto** |

Il debito aperto e in [16](16-technical-debt.md), voci SW-01…SW-13: restano
aperte SW-01, SW-02, SW-03, SW-05…SW-12; SW-04 e SW-13 sono chiuse.
