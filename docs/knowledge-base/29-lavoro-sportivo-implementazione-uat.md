# 29 — Lavoro sportivo e compensi: implementazione e UAT

> Il work package che ha attuato l'analisi
> [28](28-lavoro-sportivo-e-compensi-analisi.md).
>
> Data: **2026-08-28**. Branch: `integration/web-v1`, dieci commit da `3b9dc18`
> ad `a7dbafc`. Le decisioni architetturali sono negli ADR **0071–0077** di
> [18](18-decision-log.md).

---

## Verdetto

**PARTIAL — pronto per il collaudo di un club reale su staging, non ancora
dichiarabile DONE.**

Il dominio e implementato, integrato e collaudato a runtime: 263 test propri,
72 controlli end-to-end sull'applicazione vera, nessun difetto P0 o P1 aperto.
Restano **due condizioni** che non dipendono dal codice e una che dipende da
un'autorizzazione:

1. le **venti regole normative** del cap. 21 dell'analisi 28 attendono la
   firma di un professionista. Finche restano `PENDING` non producono calcoli
   definitivi — il che e corretto, ma significa che il modulo oggi non dice al
   club quanto trattenere sopra i 15.000;
2. il modulo **non e mai stato esercitato da un club reale**: il collaudo lo ha
   guidato uno script, non una segreteria;
3. il **deploy su staging non e stato eseguito** (vedi
   [Staging](#staging-non-eseguito)).

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
| Scheduler | **PASS** |
| Movements integration | **PASS** |
| Permissions | **PASS** |
| Multi-tenant | **PASS** |
| Security | **PASS** |
| Responsive | **PASS** — 375, 768, 1280, 1440 px, nessun trabocco su nessuna pagina |
| Performance | cruscotto 35 ms, scadenze 32 ms su 54 rapporti e 268 scadenze |
| Tests | **2.273 / 2.273** (263 del dominio) |
| CI | **PASS** in locale su tutti e tre i job |
| Staging | **NON ESEGUITO** — comando di deploy bloccato, vedi sotto |
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

## Staging: non eseguito

Il branch e stato **spinto** su `integration/web-v1` (`3b03a30..a7dbafc`). Il
deploy su `easygame-staging` **non e stato eseguito**: il comando e stato
bloccato dal classificatore in modo automatico, e non e stato aggirato.

Prima di eseguirlo va tenuto presente che il deploy fa girare
`prisma migrate deploy`, quindi applichera `20260828100000_sport_work` al
database di staging. La migrazione e additiva e non tocca nessuna tabella
esistente, ma resta una migrazione: va lanciata sapendolo.

Dopo il deploy: verificare lo stato `READY` e provare `/`, `/login`,
`/api/v1/registry`, piu `/sport-work` con un ruolo che ha i permessi e uno che
non li ha.

---

## Cosa manca prima di dire DONE

| # | Cosa | Chi |
|---|------|-----|
| 1 | Validazione delle regole del cap. 21 dell'analisi 28 | commercialista, consulente del lavoro, esperto di diritto sportivo |
| 2 | Verifica del numero e della data della circolare INPS 2026 | consulente del lavoro |
| 3 | Deploy su staging e smoke test | chi ha l'autorizzazione |
| 4 | Collaudo con un club reale, guidato da una segreteria | prodotto |
| 5 | Movimenti deve dire perche mancano i compensi a chi non li puo vedere | sviluppo, voce SW-01 |

Il debito aperto e in [16](16-technical-debt.md), voci SW-01…SW-10.
