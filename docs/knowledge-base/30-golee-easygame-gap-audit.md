# 30 — Golee vs EasyGame: gap audit competitivo e funzionale

**Data:** 2026-08-28
**Baseline EasyGame:** `integration/web-v1` @ `8274544` (Sport Work V1 `DONE`)
**Baseline Golee:** archivio di teardown in `E:\Download\golee_analisi\`,
`manager.golee.it` **v4.12.139**, piano Premium in prova, rilevazione 2026-08-28

> **Questo documento e un audit. Non ha modificato una riga di codice, non ha
> creato migrazioni, non ha corretto difetti, non ha aperto branch e non ha
> implementato nessuna wave.** I difetti trovati durante l'analisi sono
> registrati al §21 e non sono stati toccati.

> **Golee e un metro, non un modello.** Nessuna capability di Golee entra in
> questo documento come «da replicare». Ogni voce e stata riportata al
> **problema dell'utente** che risolve, e solo dopo si e chiesto se EasyGame lo
> risolva gia — e se lo risolva meglio. Dove EasyGame e equivalente o
> superiore, la riga dice **NO ACTION** e non genera sviluppo.

---

## Indice

1. [Metodo, fonti e affidabilita](#1--metodo-fonti-e-affidabilita)
2. [La scala di maturita](#2--la-scala-di-maturita)
3. [Capability matrix — 189 voci](#3--capability-matrix--189-voci)
4. [Registro dei gap: le 72 voci che passano il test](#4--registro-dei-gap-le-72-voci-che-passano-il-test)
5. [Le 6 differenze respinte](#5--le-6-differenze-respinte-non-sono-gap)
6. [EasyGame competitive advantages](#6--easygame-competitive-advantages)
7. [Golee advantages](#7--golee-advantages)
8. [Golee features / patterns NOT to copy](#8--golee-features--patterns-not-to-copy)
9. [Duplicazioni gia presenti in EasyGame](#9--duplicazioni-gia-presenti-in-easygame)
10. [Confronto UX](#10--confronto-ux)
11. [Permessi: confronto approfondito](#11--permessi-confronto-approfondito)
12. [Sport: analisi semantica del modello](#12--sport-analisi-semantica-del-modello)
13. [Amministrazione](#13--amministrazione)
14. [Documenti](#14--documenti)
15. [Reporting](#15--reporting)
16. [Mobile: sola analisi](#16--mobile-sola-analisi)
17. [Competitive scorecard](#17--competitive-scorecard)
18. [TOP 10 gap](#18--top-10-gap-easygame)
19. [TOP 10 quick win](#19--top-10-quick-win)
20. [Pre-production gap list](#20--pre-production-gap-list)
21. [Difetti e rischi trovati durante l'audit](#21--difetti-e-rischi-trovati-durante-laudit)
22. [Roadmap per wave](#22--roadmap-per-wave)
23. [Contatore wave](#23--contatore-wave)
24. [Limiti di questo audit](#24--limiti-di-questo-audit)

---

## 1 — Metodo, fonti e affidabilita

### 1.1 Fonte Golee

La fonte canonica e **`E:\Download\golee_analisi\final\`** (12 documenti), piu
`raw/menus/golee-bundle-extract.md` per permessi, feature flag e rotte. Le
cartelle `analysis/` e `easygame_readonly/` sono dichiarate dall'archivio stesso
come **materiale storico superato**: non sono state usate come fonte.

Il teardown non e stato rifatto. Le sue marcature di affidabilita sono state
riportate qui dentro, perche cambiano il peso di ogni conclusione:

| Marcatura | Significato | Peso dato in questo audit |
|---|---|---|
| `[ESEGUITO]` | workflow completato con salvataggio reale | massimo |
| `[UI]` | osservato a schermo | alto |
| `[UI-intro]` | pagina raggiunta, contenuto dietro schermata di avvio | medio |
| `[CLIENT]` | ricavato dal bundle dell'applicazione web | alto su *cosa esiste*, **nullo** su *come si comporta* |

**Copertura dichiarata dal teardown:** superficie funzionale conosciuta ~85%,
aree osservate a schermo ~40%, **workflow eseguiti con salvataggio: 1**
(creazione atleta). Aree `TODO`: 0.

### 1.2 Le riserve del teardown che questo audit eredita

1. **Le «incognite» del §C di `golee-limitations.md` non sono assenze.** Sono
   diciotto voci non verificate. In questa matrice compaiono con maturita
   dichiarata `?` e non generano mai un gap a favore di EasyGame.
2. **Il §0 dello stesso file corregge quattro conclusioni precedenti**
   (voucher, cambio stagione, periodi dei volontari, soglie dei compensi).
   Questo audit usa **le versioni corrette**, non quelle superate.
3. **Nessun workflow economico di Golee e stato eseguito.** Il modello della
   rata, dello storno e dell'incasso parziale e ricostruito dal codice del
   client: preciso su regole e condizioni, **non provato a runtime**.
4. **Il campione Golee e un circolo di tennis con 2 anagrafiche e importi da
   1,00 EUR.** Nessuna conclusione sulle prestazioni a scala e possibile.
5. **Il layout desktop pieno di Golee non e mai stato osservato** (pannello
   fermo a ~1139 px). Le valutazioni UX su densita e tabelle larghe sono
   provvisorie e sono marcate come tali.
6. **Aree `NOT ACCESSIBLE`:** Golee Pay a runtime, permessi con utenti diversi,
   sito web, schede «Notifiche verso i tesserati» e «verso fornitori», Messaggi
   (Beta), esperienza dell'app della famiglia, console `/admin/*`.

**Contraddizioni residue trovate nell'archivio Golee:** una sola, gia risolta
dall'archivio stesso — la copertura dei voucher, negata nelle analisi
intermedie e corretta in `final/` (`SPORT_VOUCHERS` esiste come metodo di
incasso). Nessun `TODO` residuo. Nessuna informazione non verificata e stata
promossa a fatto in questo documento.

### 1.3 Fonte EasyGame

Ricostruita da **HEAD**, non dalla memoria della conversazione ne dal file
`easygame_readonly/00-easygame-baseline.md` (storico, fuori perimetro):

- `prisma/schema.prisma` e le 18 migrazioni;
- l'albero `src/app/`, `src/lib/`, `src/lib/server/`, `src/components/`;
- KB [06](06-data-model.md), [08](08-roles-and-permissions.md),
  [11](11-capabilities.md), [16](16-technical-debt.md),
  [20](20-work-packages.md), [23](23-v1-release-matrix.md),
  [26](26-full-club-uat.md), [27](27-rc-fix-3.md),
  [28](28-lavoro-sportivo-e-compensi-analisi.md),
  [29](29-lavoro-sportivo-implementazione-uat.md);
- il decision log [18](18-decision-log.md) per il **perche** di ogni confine.

Dove la KB e il codice divergevano ha vinto il codice, e la divergenza e
segnalata al §21.

### 1.4 Il test del gap reale

Una funzione di Golee **non e** automaticamente un gap. Per entrare nel
registro del §4 ha dovuto superare quattro domande:

1. **quale problema dell'utente risolve?** (se non si sa dirlo, non e un gap);
2. **EasyGame non lo risolve gia?** (per intero o per altra via);
3. **ha valore reale per una ASD o una SSD italiana?**
4. **non duplica un dominio EasyGame esistente?** — e se lo tocca, si
   **estende** quel dominio, non se ne crea un secondo.

Su **89** capability in cui Golee e avanti, **83** hanno superato il test e
confluiscono nelle **72 voci** del registro del §4 — alcune voci ne consolidano
piu d'una, perche affrontarle separatamente sarebbe stato un modo per contarle
due volte. Le **6** che non lo hanno superato sono elencate una per una al §5,
con il motivo.

---

## 2 — La scala di maturita

Applicata **separatamente** ai due prodotti. Non misura il valore della
funzione: misura quanto e finita.

| Livello | Significato |
|---|---|
| **0** | assente |
| **1** | scaffold: esiste una tabella, una rotta, un tipo o un'etichetta, non un flusso |
| **2** | parziale: funziona un pezzo, o su una sola superficie, o senza il ciclo completo |
| **3** | funzionale: il flusso si chiude, ma senza prove a runtime, senza scala o con difetti noti |
| **4** | validata: il flusso e stato eseguito davvero, almeno una volta, su dati veri |
| **5** | matura: eseguita, coperta da test o invarianti, difesa dalle regressioni, usabile a scala |

`?` = non verificabile con le fonti disponibili. Una maturita `?` **non conta
mai** come punto a favore di EasyGame.

> **Attenzione sul confronto delle maturita.** Golee e un prodotto commerciale
> in esercizio con clienti paganti: la sua maturita reale e quasi ovunque
> superiore a quella che il teardown ha potuto *provare*. Le cifre di questa
> colonna riflettono l'evidenza raccolta, corretta al rialzo dove il fatto che
> il prodotto sia venduto e in se una prova di esercizio. Dove la correzione e
> stata applicata, la nota lo dice.

---

## 3 — Capability matrix — 189 voci

Legenda del **Gap**: `EG+` EasyGame superiore · `=` parita ·
`EG~` EasyGame parziale · `EG-` EasyGame mancante · `NA` non applicabile ·
`NO-COPY` non va copiato.
Priorita: `P0` blocca produzione/sicurezza/integrita · `P1` mancanza importante
per un gestionale professionale · `P2` alto valore, non blocker · `P3`
rifinitura o quick win · `—` nessuna azione.

### 3.1 Account e onboarding (11)

| # | Capability | Golee | Mat. G | EasyGame | Mat. E | Gap | Pri |
|---|---|---|---|---|---|---|---|
| C-001 | Registrazione utente | si, con policy | 4 | si, rate limit, password 12 | 4 | `=` | — |
| C-002 | Accesso con Google / Apple | osservato al login | 4 | codice completo, **spento senza credenziali** | 2 | `EG~` | P3 |
| C-003 | Verifica email / telefono | non osservata | ? | OTP obbligatorio, dipende da SMTP | 3 | `=` | — |
| C-004 | Recupero password | etichette presenti | 4 | token monouso 30 min, revoca sessioni | 4 | `=` | — |
| C-005 | Onboarding guidato del club | tutorial 30 min + video | 4 | `/onboarding`, 5 passi, riprendibile | 4 | `=` | — |
| C-006 | Multi-club per un solo account | non osservato | ? | `/account`, memberships, club attivo | 5 | `EG+` | — |
| C-007 | Multi-ruolo nello stesso club | profili `organization_admin`/`_person` | 3 | unique `(org,user,role)`, header ruolo attivo | 5 | `EG+` | — |
| C-008 | Account app del tesserato con ciclo di vita | 5 stati, link invito, disabilita, riallinea email | 5 | accesso tutore via token, nessun ciclo di vita | 2 | `EG~` | **P1** |
| C-009 | Invito collaboratori con ruolo | «Invita collaboratori», link, rimanda | 4 | membership + `/dashboard/access-management` | 3 | `EG~` | P2 |
| C-010 | Piano commerciale distinto dai permessi | **mescolati nella stessa matrice** | 1 | catalogo entitlement, `CapabilityGate` **con il motivo** | 4 | `EG+` | — |
| C-011 | Console di piattaforma | `/admin/*` non sondata | ? | `/private/...`, `requirePlatformAdmin`, verificata a schermo | 4 | `NA` | — |

### 3.2 Club, sedi, stagioni, configurazione (12)

| # | Capability | Golee | Mat. G | EasyGame | Mat. E | Gap | Pri |
|---|---|---|---|---|---|---|---|
| C-012 | Anagrafica societaria a schede | 8 schede | 5 | `/organization`, autosave per sezione | 4 | `EG~` | P3 |
| C-013 | Dati fiscali e regime | RF01–RF18, ATECO, SDI, legale rappr. | 5 | `organization_fiscal_profiles`, 10 forme giuridiche | 4 | `=` | — |
| C-014 | **Firma e timbro del presidente** | sezione dedicata + permesso proprio | 4 | assente | 0 | `EG-` | P2 |
| C-015 | Federazioni ed enti di affiliazione | entita con matricola e data | 4 | `clubs.settings.federations`, campo | 2 | `EG~` | P2 |
| C-016 | Sponsor | sezione del profilo + vetrina sul sito | 3 | `/sponsors`, dettaglio, **pagamenti sponsor** | 4 | `EG+` | — |
| C-017 | **Sedi e multi-sede** | **nessuna nozione di sede** | 0 | `club_sites` + gruppi operativi, ADR-0038 | 5 | `EG+` | — |
| C-018 | Strutture, campi, orari, prenotazioni | «Luogo» come attributo dell'evento | 0 | `/structures`, orari, prenotazioni, tariffe campo | 4 | `EG+` | — |
| C-019 | Stagione sportiva **o** anno solare | entrambe, data inizio configurabile | 4 | solo stagione, date libere | 3 | `EG~` | P3 |
| C-020 | **Riporto della configurazione a nuova stagione** | **«quote, entrate e pagamenti ripartono da zero»** | 1 | `/seasons/:id/rollover`: categorie, sconti, piani, gruppi, programma, previsionale; idempotente | 5 | `EG+` | — |
| C-021 | **Riconferma dei tesserati e ricomposizione squadre** | flusso esplicito con contatore non confermati + duplica gruppo con i tesserati | 4 | **assente**: le appartenenze non seguono la stagione | 0 | `EG-` | **P0** |
| C-022 | Sito web della societa | add-on 15 EUR/mese alimentato dal gestionale | 4 | assente | 0 | `NO-COPY` | — |
| C-023 | Campi personalizzati sulla persona | 10 tipi, entita associata, esportabili, richiedibili in iscrizione | 4 | solo dentro i moduli online | 2 | `EG~` | P2 |

### 3.3 Persone e anagrafiche (19)

| # | Capability | Golee | Mat. G | EasyGame | Mat. E | Gap | Pri |
|---|---|---|---|---|---|---|---|
| C-024 | Persona come nucleo unico | `org-person` con ruoli sopra | 4 | Person Core **solo** nel lavoro sportivo; atleti, allenatori, staff e soci restano quattro archivi | 3 | `EG~` | P2 |
| C-025 | Atleti: elenco, scheda, modifica | 11 schede | 5 | scheda a 7 sezioni, deep link, responsive verificata | 4 | `=` | — |
| C-026 | **Viste di elenco per compito** | 7 viste che cambiano tutte le colonne | 5 | colonne mostrabili/nascondibili, nessuna vista salvata | 2 | `EG~` | P2 |
| C-027 | Modifica in linea delle scadenze dall'elenco | link «Modifica» sulla cella | 4 | assente | 0 | `EG-` | P3 |
| C-028 | Profilo sanitario esteso | allergie, intolleranze, BLSD, primo soccorso, antincendio, data prevista visita | 5 | certificato medico con scadenza e stato, visite mediche | 2 | `EG~` | P2 |
| C-029 | Documento d'identita della persona | tipo, numero, rilascio, scadenza, permesso di soggiorno, tessera sanitaria | 4 | campi + allegato + OCR | 3 | `=` | — |
| C-030 | **OCR del documento d'identita** | assente | 0 | `tesseract.js` locale + MRZ, il file non lascia il browser | 3 | `EG+` | — |
| C-031 | Codice fiscale, comuni, CAP | calcolatore CF annidato, ISTAT completo | 4 | CF client **e** server, 7.896 comuni, CAP da IPA, 107 province | 5 | `EG+` | — |
| C-032 | Controllo duplicati alla creazione | **assente** (difetto dichiarato) | 0 | presente **solo** in approvazione modulo | 2 | `EG~` | P3 |
| C-033 | Import anagrafiche | import presente, dettaglio non osservato | 3 | CSV/XML/XLS(X), mappatura, anteprima per riga, 220 atleti in 10 richieste | 5 | `EG+` | — |
| C-034 | **Export degli elenchi** | CSV / Excel / PDF (gated dal piano) | 4 | **solo PDF**, per ambito di selezione | 2 | `EG~` | P2 |
| C-035 | Modifica di massa di **qualunque** campo | operazione generica «Seleziona quale dato modificare», compresi i personalizzati | 5 | azioni predefinite (stato, gruppo, reparto, tipo socio, categoria) | 3 | `EG~` | P2 |
| C-036 | Archivio: togliere dall'elenco senza cancellare | sezione dedicata, permessi separati archivio/storico | 4 | stato «disattivato», nessuna sezione archivio | 2 | `EG~` | P2 |
| C-037 | Genitori e responsabili legali | N per atleta, parentela tipizzata, anagrafica completa | 4 | tutori con anagrafica, accesso collegato, 13 test | 4 | `=` | — |
| C-038 | Intestatario dei documenti fiscali | campo esplicito sulla scheda | 4 | `fiscal-recipient.ts`, risolto dal tutore | 4 | `=` | — |
| C-039 | Fratelli e sconto fratelli | flag + regola `SELF-DECLARED` | 3 | sconti generici, nessun concetto di nucleo | 2 | `EG~` | P3 |
| C-040 | Staff tecnico e dirigenziale | due elenchi, 19 ruoli societari | 4 | `/staff` con reparti, `/trainers`, documenti | 4 | `=` | — |
| C-041 | Soci: anagrafica e tipologia | libro soci con tessera e tipologia | 4 | `/soci`, tre tipi, export PDF | 3 | `EG~` | P2 |
| C-042 | Ricerca globale | ⌘K con sinonimi mappati | 4 | assente (ricerca per elenco) | 0 | `EG-` | P3 |

### 3.4 Organizzazione sportiva e attivita (19)

| # | Capability | Golee | Mat. G | EasyGame | Mat. E | Gap | Pri |
|---|---|---|---|---|---|---|---|
| C-043 | **Categoria come entita** | **non esiste**: e un campo | 0 | `/categories`, anni di nascita, statistiche | 5 | `EG+` | — |
| C-044 | Squadra / gruppo come unita operativa | gruppo piatto con atleti e staff | 4 | **gruppo operativo = categoria x sede** (ADR-0055) | 5 | `EG+` | — |
| C-045 | Staff dentro il roster della squadra | tecnici e dirigenti nel gruppo | 4 | `trainers.groupIds`, allenatore su piu squadre | 3 | `=` | — |
| C-046 | Compatibilita fra categorie | assente | 0 | esplicita, orientata, non transitiva (ADR-0030) | 4 | `EG+` | — |
| C-047 | Numerazione maglie come dominio | numero di maglia = campo dell'atleta | 0 | `jersey_groups` + `jersey_assignments`, unicita, ADR-0057 | 4 | `EG+` | — |
| C-048 | Programma settimanale come oggetto | solo ricorrenza sull'evento | 0 | `weekly_schedule` + pannello dedicato | 4 | `EG+` | — |
| C-049 | Generazione automatica delle sedute | ricorrenza `SINGLE`/`FUTURE`/`ALL` | 3 | `training-automation`, **senza scheduler**: si invoca a mano | 3 | `=` | — |
| C-050 | **Calendario unico degli eventi** | un solo oggetto evento, 5 viste, 5 filtri | 5 | allenamenti e partite in due pagine, nessuna vista calendario unica | 2 | `EG~` | P2 |
| C-051 | Capienza dell'evento e lista d'attesa | massimo partecipanti + coda dimensionabile | 4 | assente | 0 | `EG-` | P2 |
| C-052 | Invito all'evento per gruppo o per singolo | due sorgenti, invito massivo | 4 | convocazioni gara; allenamenti senza invito | 3 | `EG~` | P2 |
| C-053 | **RSVP della famiglia** | conferma presenza/assenza dall'app, scadenza conferma e disdetta | 4 | `AttendanceConfirmation.tsx` esiste e **non e referenziato** | 0 | `EG-` | **P1** |
| C-054 | Appello e presenze | segnate da staff, via app o via QR | 4 | `training_attendance` + `AttendanceSheet` | 4 | `=` | — |
| C-055 | Presenze aggregate per persona | Eventi · Presenze · Assenze · **Nessuna risp.** · % | 5 | report aggregato di club/categoria, non per persona | 2 | `EG~` | P2 |
| C-056 | Solleciti mirati sui partecipanti | «notifica solo i senza risposta» e 4 varianti | 4 | assente | 0 | `EG-` | P2 |
| C-057 | Accesso con QR e verifica requisiti | Beta | 3 | assente (`qr-code-utils.ts` esiste ed e orfano) | 0 | `NO-COPY` | P3 |
| C-058 | Convocazioni gara | evento generico, nessuna convocazione dedicata | 2 | `MatchConvocations` con avvisi sui certificati | 4 | `EG+` | — |
| C-059 | Campionati e calendario gare federale | eventi di dominio nel client, **nessuna schermata** | 0 | assente | 0 | `NA` | — |
| C-060 | Valutazione sportiva su criteri configurabili | criteri, schede, statistiche atleta | 4 | assente | 0 | `EG-` | P3 |
| C-061 | Alert operativi per l'allenatore | non osservati | 2 | `GET /trainer/operational-alerts` | 4 | `EG+` | — |

### 3.5 Tesseramenti e federazioni (4)

| # | Capability | Golee | Mat. G | EasyGame | Mat. E | Gap | Pri |
|---|---|---|---|---|---|---|---|
| C-062 | **Tesseramento come entita con stato e scadenza** | numero, date, stato, ruolo, tipo tessera, doppio tesseramento | 4 | campi sparsi sulla scheda atleta | 1 | `EG~` | P2 |
| C-063 | Avvisi di scadenza tesseramento | 60 e 30 giorni prima + scaduto | 4 | assente | 0 | `EG-` | P2 |
| C-064 | Sincronizzazione con un portale federale | **solo CSI**, diff a 3 stati, due secchi operativi | 3 | assente | 0 | `EG-` | P3 |
| C-065 | Export in formato federale | «Formato CSI» con intestazioni imposte | 3 | assente | 0 | `EG-` | P3 |

### 3.6 Quote, listino, sconti (8)

| # | Capability | Golee | Mat. G | EasyGame | Mat. E | Gap | Pri |
|---|---|---|---|---|---|---|---|
| C-066 | Quota di squadra divisa in rate con scadenze | «Tariffe» sul gruppo | 4 | `payment_plans` con rate a percentuale/fisso/saldo | 5 | `EG+` | — |
| C-067 | Servizi obbligatori e opzionali nella quota | non osservati | 3 | inclusi nel piano, con composizione mostrata | 5 | `EG+` | — |
| C-068 | **Pro-rata sulla quota** | assente | 0 | a giorni o a mesi, con la `reason` di ogni esito | 5 | `EG+` | — |
| C-069 | Sconti automatici in fase di iscrizione | 3 tipi di regola, cumulabili, con descrizione | 4 | sconti applicati dalla segreteria, nessuna regola automatica sul modulo | 3 | `EG~` | P2 |
| C-070 | **Lo sconto sopravvive all'incasso parziale** | **no**: «lo sconto verra disassociato» (difetto ammesso) | 1 | si: lo sconto e sul piano, l'incasso e un movimento a parte | 4 | `EG+` | — |
| C-071 | Pacchetti, abbonamenti e carnet a ingressi | 3 durate, 3 visibilita in app, stati temporali e di credito | 5 | assente | 0 | `EG-` | P2 |
| C-072 | Consumo del credito del carnet su un evento | automatico o manuale | 3 | assente | 0 | `EG-` | P3 |
| C-073 | Catalogo merceologico e ordini | Articoli + Ordini, senza giacenze | 3 | `/clothing`: catalogo, kit, inventario, **consegne parziali** a 4 stati | 4 | `EG+` | — |

### 3.7 Incassi e pagamenti (14)

| # | Capability | Golee | Mat. G | EasyGame | Mat. E | Gap | Pri |
|---|---|---|---|---|---|---|---|
| C-074 | Registrazione di un incasso | azione sulla rata, non eseguita | 4 | `payment_transactions`: **la rata e un debito, l'incasso e un movimento** (ADR-0036) | 5 | `EG+` | — |
| C-075 | Incasso parziale | c'e, ma disassocia lo sconto | 3 | N movimenti per rata, anche con metodi diversi | 5 | `EG+` | — |
| C-076 | Stato della rata derivato, non impostato | «residuo zero → incassata» | 4 | derivato e **non scrivibile dal client** (S-13, 8 test) | 5 | `=` | — |
| C-077 | Storno compensativo, mai distruttivo | riga `isRefund`, storno parziale entro il massimo | 4 | movimento opposto, originale marcato, nessun `DELETE` | 5 | `=` | — |
| C-078 | Metodi di incasso configurabili | 12 codici, compreso `SPORT_VOUCHERS` | 4 | `payment_methods` + `clubs.settings.paymentMethods`, mai testo libero | 4 | `=` | — |
| C-079 | Pagamento online con carta | Golee Pay 2%, **non attivato in analisi** | 4 | Stripe Connect, collaudato in Sandbox (E-10) | 4 | `=` | — |
| C-080 | Addebito diretto SEPA | +0,35 EUR | 3 | assente | 0 | `EG-` | P3 |
| C-081 | Rateizzazione al consumatore (Klarna / Alma) | 2–4 rate, il club incassa subito | 3 | assente | 0 | `NO-COPY` | — |
| C-082 | Link di pagamento generato dalla segreteria | «Genera link pagamento» sulla rata | 4 | checkout dall'area famiglia, nessun link da inviare | 1 | `EG~` | P2 |
| C-083 | Pagamento contestuale dentro il modulo di iscrizione | si | 4 | differito (M-7) | 0 | `EG-` | P2 |
| C-084 | Commissione con decorrenza e storico | 2% con tre ripartizioni | 3 | `platform_commission_rules`, **congelata sull'incasso** (ADR-0050) | 5 | `EG+` | — |
| C-085 | Movimento automatico della commissione | causale «Fee Golee Pay» | 4 | riconciliazione congelata sulla riga d'incasso (lordo/fee/netto) | 3 | `=` | — |
| C-086 | Rimborso online | dialogo presente, non eseguito | 3 | avviato da EasyGame, **collaudato contro Stripe**, scritto dall'evento firmato | 5 | `EG+` | — |
| C-087 | Riconciliazione dei payout | ID payout, date, netto, export | 3 | non esposta (resta sul cruscotto del PSP) | 2 | `EG~` | P3 |

### 3.8 Amministrazione, contabilita, fiscalita (15)

| # | Capability | Golee | Mat. G | EasyGame | Mat. E | Gap | Pri |
|---|---|---|---|---|---|---|---|
| C-088 | Movimenti, entrate/uscite previste, giroconti | 4 schede, filtrate per stagione | 4 | `/movements`: Movimenti, Previsti, Giroconti | 4 | `=` | — |
| C-089 | **Causale con flag «detraibile» e «quota associativa»** | il perno di tutta la catena fiscale | 5 | `fiscal_operation_types` (percorso documentale, ambito), **nessuna detraibilita** | 2 | `EG~` | **P1** |
| C-090 | **Prima nota** | stampa cronologica | 4 | assente | 0 | `EG-` | **P1** |
| C-091 | **Rendiconto economico per voce di costo** | stampa per causale | 4 | aggregazioni parziali in `/reports` | 1 | `EG-` | **P1** |
| C-092 | Estratto conto | stampa | 4 | assente | 1 | `EG-` | P2 |
| C-093 | **Saldo IVA trimestrale per cassa** | «conteggia i movimenti incassati o pagati, non la data di emissione» | 4 | assente | 0 | `EG-` | P2 |
| C-094 | Bilancio con flusso di cassa | saldo iniziale e finale, entrate/uscite per causale | 4 | `/reports` con quattro sezioni, **una con un difetto noto** | 2 | `EG~` | **P1** |
| C-095 | Conti correnti, conto principale, IBAN | scheda dedicata | 4 | `bank_accounts` | 3 | `=` | — |
| C-096 | Fornitori e clienti con ciclo passivo | anagrafica, pagamenti, fatture, notifiche | 4 | il fornitore esiste come controparte di un movimento e nell'ordine abbigliamento | 1 | `EG-` | P2 |
| C-097 | Numerazione dei documenti per club ed esercizio | numerazione presente | 4 | `document_number_sequences`, si incrementa, **nessuna schermata la puo digitare** (ADR-0044) | 5 | `EG+` | — |
| C-098 | Generazione massiva di ricevute | permesso dedicato + feature | 4 | assente | 0 | `EG-` | P2 |
| C-099 | Fatturazione elettronica e SdI | **operativa** via Aruba, stati SDI notificati | 4 | tracciato `FPR12` generato e validato, **mai trasmesso** (ADR-0053) | 2 | `EG~` | **P1** |
| C-100 | **Dichiarazione 730 con importo calcolato** | 4 varianti, esclude contanti e voucher | 5 | assente | 0 | `EG-` | **P1** |
| C-101 | **Voucher e contributi da enti: ciclo di gestione** | **solo** metodo di incasso + 5 attestazioni | 1 | `funding_*`: assegnato, maturato, rendicontato, liquidato, residuo; regole come configurazione | 5 | `EG+` | — |
| C-102 | Maturazione sulla frequenza e riconciliazione riga per riga | assente | 0 | misurata dal server, idempotente, tre fonti di maturazione, CSV | 5 | `EG+` | — |

### 3.9 Lavoro sportivo e compensi (13)

| # | Capability | Golee | Mat. G | EasyGame | Mat. E | Gap | Pri |
|---|---|---|---|---|---|---|---|
| C-103 | Rapporto di lavoro con tipi e stati | campi `contract.*` sul documento | 3 | 3 tipi, 5 stati, transizioni dichiarate, attivazione che **dice cosa manca** | 5 | `EG+` | — |
| C-104 | Piano compensi con scadenze | compenso fisso/variabile, giorno del mese | 3 | rate uguali e mensilita, somma al centesimo, rifiuto se una scadenza ha gia ricevuto denaro | 5 | `EG+` | — |
| C-105 | Motore contributivo | «Contribuzione INPS», «Ritenute IRPEF» come campi | 2 | franchigia 5.000, riduzione 50%, aliquote per copertura, 1/3–2/3, **regole versionate per anno con la fonte** | 5 | `EG+` | — |
| C-106 | Posizione annua verso le soglie | avviso ai 15.000 EUR | 3 | per anno solare **per cassa**, erogato e dichiarato esterno distinti | 5 | `EG+` | — |
| C-107 | Autocertificazione dei compensi esterni | campo autodichiarato | 2 | record con storico, entra nel calcolo, sostituzione non distruttiva | 5 | `EG+` | — |
| C-108 | Registro del denaro in uscita | movimento in uscita generico | 2 | append-only, storno di segno opposto, idempotenza, capienza verificata dopo il blocco di riga | 5 | `EG+` | — |
| C-109 | Premi e rimborsi distinti dai compensi | rimborsi al volontario con autocertificazione | 2 | tre domini separati che **non consumano le franchigie** | 5 | `EG+` | — |
| C-110 | Fatture dei professionisti con P.IVA | scheda Compensi | 3 | registrazione con imponibile, IVA, ritenuta, scadenza, uscita | 4 | `=` | — |
| C-111 | Agenda degli adempimenti | FAQ che spiegano come farli | 1 | RASD, F24, autocertificazioni, contratti, CU; derivazione idempotente | 4 | `EG+` | — |
| C-112 | **Contratti Co.Co.Co. pronti da compilare** | 6 modelli, compresi due condivisi dalla FIGC | 5 | assente | 0 | `EG-` | **P1** |
| C-113 | Firma del documento di compenso | richiesta firma, stato, `.p7m` | 4 | assente | 0 | `EG-` | P2 |
| C-114 | Volontari: registro, periodi, rimborsi forfettari | flag + numero + periodo + registro firmabile + 5 modelli | 4 | dichiarato **non implementato in V1** | 0 | `EG-` | P2 |
| C-115 | Trasmissione UniEmens / RASD / cedolini | **non li produce**, lo dicono le sue FAQ | 0 | non li produce, e lo dichiara | 0 | `=` | — |

### 3.10 Documenti (13)

| # | Capability | Golee | Mat. G | EasyGame | Mat. E | Gap | Pri |
|---|---|---|---|---|---|---|---|
| C-116 | **Libreria di modelli documentali pronti** | **77 modelli mantenuti** | 5 | editor di template + esempi di modulo; nessuna libreria | 1 | `EG-` | **P1** |
| C-117 | Modelli di richiesta visita medica regionalizzati | **33**, di cui 30 per territorio fino alla ASL | 5 | assente | 0 | `EG-` | P2 |
| C-118 | Compilazione automatica del documento dai dati | segnaposto su tutto il modello dati | 5 | `DocumentEditor` con segnaposto club/atleta/genitore | 3 | `EG~` | **P1** |
| C-119 | Documento arricchito con gli importi del gestionale | `enrich_with_financial_amounts` | 4 | assente | 0 | `EG-` | **P1** |
| C-120 | Stampa massiva di un documento per N persone | `allow_bulk_print` | 4 | assente | 0 | `EG-` | P2 |
| C-121 | Ciclo di firma: richiesta, attesa, stato, file firmato | fino al `.p7m`, con notifica | 4 | firma grafica nel modulo online, nessun ciclo sul documento | 2 | `EG~` | P2 |
| C-122 | Cartelle o etichette per i documenti | configurabili | 3 | categorie sugli allegati | 2 | `=` | — |
| C-123 | Archivio allegati con permessi e servizio unico | cartelle e permessi per area | 3 | Attachment Core: driver, autorizzazione propria, `CSP: sandbox`, 7 combinazioni provate | 5 | `EG+` | — |
| C-124 | Documenti **richiesti** alla famiglia con stato | «Condividi documento con il tesserato» | 2 | `shared-documents`: richiesto → caricato → in revisione → approvato/respinto | 4 | `EG+` | — |
| C-125 | **Consenso come oggetto con ciclo di vita** | testo, allegato, firma, stato per persona, notifica alla revoca | 4 | campo dentro un modulo; nessuna revoca, nessuno stato per persona | 1 | `EG~` | **P1** |
| C-126 | Unione dei consensi PDF al documento generato | `imagick/merge-images` | 3 | assente | 0 | `EG-` | P3 |
| C-127 | Certificati medici con scadenza e stato | campo + automazioni | 4 | modello dedicato, stato, avvisi in dashboard, avvisi in convocazione | 5 | `EG+` | — |
| C-128 | Modulistica online: builder, versioni, coda, approvazione | modulo con firma, coda, approvazione massiva | 4 | 12 tipi di campo, **versioni immutabili citate dalla compilazione**, anteprima, duplicati, ciclo provato a runtime da sessione anonima | 5 | `EG+` | — |

### 3.11 Comunicazione e automazioni (12)

| # | Capability | Golee | Mat. G | EasyGame | Mat. E | Gap | Pri |
|---|---|---|---|---|---|---|---|
| C-129 | Notifiche in-app | presenti | 4 | modello `Notification` + `/notifications` | 4 | `=` | — |
| C-130 | **Motore di automazioni sulle scadenze** | **34 automazioni** su 6 domini, con interruttore per ciascuna | 5 | un solo cron (lavoro sportivo); promemoria certificati **da invocare a mano** | 1 | `EG-` | **P1** |
| C-131 | Anticipi configurabili (fino a 3 per automazione) | 7/10/30/60 giorni | 5 | assente | 0 | `EG-` | P1 |
| C-132 | Contenuto del messaggio con segnaposto | 18 variabili | 5 | assente | 0 | `EG-` | P1 |
| C-133 | Link di pagamento dentro il sollecito | `goleePayUrl` | 5 | assente | 0 | `EG-` | P1 |
| C-134 | Notifica singola **o** report giornaliero | scelta per automazione | 4 | assente | 0 | `EG-` | P2 |
| C-135 | Invio dalla casella della societa | solo Premium | 4 | SMTP configurabile con credenziali cifrate + test di invio | 3 | `=` | — |
| C-136 | **Bacheca con destinatari per ruolo e per gruppo** | post con allegati, bozza/pubblicato, notifica calcolata | 4 | assente | 0 | `EG-` | **P1** |
| C-137 | **Comunicazione massiva alle famiglie** | inclusa dal piano Plus | 4 | assente | 0 | `EG-` | **P1** |
| C-138 | Messaggistica 1:1 | Beta, modello non ricostruibile | 2 | `chat.tsx` montata, **senza modello dati** | 2 | `=` | — |
| C-139 | Promemoria interni verso staff e allenatori | non osservati | 2 | segreteria con 5 tipi di destinatario | 4 | `EG+` | — |
| C-140 | SMS applicativi | assenti | 0 | solo OTP via Twilio | 1 | `=` | — |

### 3.12 Reporting (6)

| # | Capability | Golee | Mat. G | EasyGame | Mat. E | Gap | Pri |
|---|---|---|---|---|---|---|---|
| C-141 | Dashboard con «stato dell'account» | contabilita, visite mediche, comunicazioni | 4 | dashboard con avvisi certificati e scadenze | 4 | `=` | — |
| C-142 | Dashboard personalizzabile | `custom-dashboard` | 3 | tabella `dashboards`, superficie ridotta | 2 | `=` | — |
| C-143 | Report presenze | per persona, con % e senza risposta | 4 | aggregato di club/categoria | 3 | `EG~` | P2 |
| C-144 | Report insoluti e scaduti | vista finanziaria + report | 4 | `/reports` sezione pagamenti, **«Incassato» conta le rate, non il denaro** | 3 | `EG~` | **P1** |
| C-145 | Report economico per causale | «Entrate/Uscite per causale» | 4 | assente | 1 | `EG-` | P1 |
| C-146 | Export strutturato dei report | CSV / Excel / PDF | 4 | CSV solo su riconciliazione bandi e dataset F24/CU | 1 | `EG~` | P2 |

### 3.13 Permessi e sicurezza (9)

| # | Capability | Golee | Mat. G | EasyGame | Mat. E | Gap | Pri |
|---|---|---|---|---|---|---|---|
| C-147 | Granularita dei permessi | **~90 chiavi** `risorsa:area:azione` | 5 | 7 ruoli + matrice per risorsa + 5 permessi di dominio | 3 | `EG~` | P2 |
| C-148 | Dato clinico separato dal dato anagrafico | `medical:read` != `medical-profile:read` | 5 | nessuna separazione: chi vede la scheda vede il certificato | 1 | `EG~` | P2 |
| C-149 | Denaro delle famiglie separato dai compensi dello staff | `financial:athlete` != `financial:staff` | 5 | `sport_work.*`, default negato, ogni diniego tracciato | 4 | `=` | — |
| C-150 | Permessi limitati a un gruppo o a una squadra | **incognita** del teardown | ? | allenatore su `groupIds`, pagina permessi trainer | 3 | `=` | — |
| C-151 | Preset di ruolo | **non trovati**: ~90 caselle da comporre | ? | 7 ruoli canonici con normalizzazione degli alias | 5 | `EG+` | — |
| C-152 | Diritti di piano separati dai permessi di ruolo | **mescolati** (difetto dichiarato) | 1 | entitlement con **motivo** del diniego, ADR-0046/0048 | 4 | `EG+` | — |
| C-153 | Audit dei dinieghi | non osservato | ? | `audit_logs` su **tutti** i dinieghi, 17 test | 5 | `EG+` | — |
| C-154 | Isolamento multi-tenant provato | non verificabile dall'esterno | ? | 11 tentativi IDOR fra due organizzazioni vere, 11 respinti | 5 | `EG+` | — |
| C-155 | Telemetria comportamentale verso terze parti | Meta, TikTok, Bing, **Clarity session replay** | 1 | nessuna | 5 | `NO-COPY` | — |

### 3.14 UX (10)

| # | Capability | Golee | Mat. G | EasyGame | Mat. E | Gap | Pri |
|---|---|---|---|---|---|---|---|
| C-156 | Creazione rapida di un'anagrafica | **4 click, 5 campi**, «Salva e vai alla scheda completa» | 5 | pagina dedicata `/athletes/new` con guscio completo | 3 | `EG~` | P3 |
| C-157 | Azioni rapide nominate per **compito** | `/quick-actions`, 13 voci per lavoro | 4 | assente | 0 | `EG-` | P3 |
| C-158 | Deep link alla scheda della persona | **non funziona** (difetto dichiarato) | 0 | `/athletes/[id]` e un indirizzo vero, condivisibile | 5 | `EG+` | — |
| C-159 | Responsivita a 375 / 768 / 1280 | dialoghi a bottom sheet, ma **tabella a 25 colonne a 375 px** | 3 | verificata a schermo su tutte le aree, `scrollWidth` mai oltre la viewport | 5 | `EG+` | — |
| C-160 | Tema chiaro / scuro | configurabile | 4 | `theme-switcher` | 3 | `=` | — |
| C-161 | Accessibilita | albero semantico pulito, tastiera | 4 | audit con 0 controlli senza nome su 660, 0 campi senza etichetta | 4 | `=` | — |
| C-162 | Conferme sulle operazioni irreversibili | dialoghi nominati sull'oggetto | 4 | conferme sulle azioni distruttive | 4 | `=` | — |
| C-163 | Pressione commerciale nell'interfaccia | **~20% dello schermo** | 1 | nessuna | 5 | `NO-COPY` | — |
| C-164 | Schermata di avvio obbligatoria per sezione | in almeno 13 sezioni | 2 | empty state che non blocca | 4 | `NO-COPY` | — |
| C-165 | Un solo sistema di avvisi a schermo | uno | 4 | **due sistemi di toast** montati insieme (D11) | 2 | `EG~` | P3 |

### 3.15 Governance associativa (9)

| # | Capability | Golee | Mat. G | EasyGame | Mat. E | Gap | Pri |
|---|---|---|---|---|---|---|---|
| C-166 | **Libro soci stampabile** | registro con tessera, tipologia, stampa | 4 | elenco soci con export PDF, nessun registro nel senso statutario | 2 | `EG~` | P2 |
| C-167 | «Tutti i tesserati sono soci» | scorciatoia di popolamento | 4 | assente | 0 | `EG-` | P3 |
| C-168 | Quota associativa collegata alla contabilita | flag `isMembershipFee` sulla causale | 4 | assente | 0 | `EG-` | P2 |
| C-169 | Dimissione del socio con data e motivo | «Dimetti» con motivo | 4 | stato disattivato, nessun motivo ne data di recesso | 1 | `EG~` | P3 |
| C-170 | **Registro volontari** | flag, numero, periodo, registro firmabile, 5 modelli | 4 | assente (dichiarato fuori da V1) | 0 | `EG-` | P2 |
| C-171 | Assemblee: tipologie, ordine del giorno, deleghe | 3 tipologie, 16 endpoint, riordino, deleghe | 4 | assente | 0 | `EG-` | P2 |
| C-172 | **Verbale generato con le delibere gia redatte** | 11 blocchi, 5 punti con testo giuridico pronto | 5 | assente | 0 | `EG-` | P2 |
| C-173 | Safeguarding: nomina, casellario, FAQ | copertura in 4 punti | 4 | assente | 0 | `EG-` | P2 |
| C-174 | Quorum e votazioni calcolati | **assenti** | 0 | assenti | 0 | `=` | — |

### 3.16 Ecosistema e servizi (5)

| # | Capability | Golee | Mat. G | EasyGame | Mat. E | Gap | Pri |
|---|---|---|---|---|---|---|---|
| C-175 | Marketplace di servizi accessori | 9 servizi, interni ed esterni | 4 | `/hub`, catalogo **statico** senza persistenza | 2 | `NO-COPY` | P3 |
| C-176 | Chat con commercialisti dentro il gestionale | servizio interno | 4 | assente | 0 | `NO-COPY` | — |
| C-177 | Contenuti normativi, guide, calcolatori | `/explore`, 3 calcolatori, webinar, FAQ normative | 4 | regole versionate con la **fonte normativa accanto a ogni valore** | 1 | `NO-COPY` | — |
| C-178 | Referral e promozioni mirate per federazione | canale di vendita | 4 | assente | 0 | `NO-COPY` | — |
| C-179 | Magazzino: la risposta al problema delle rimanenze | risolto **commercialmente** («Magazzino digitale») | 3 | magazzino vero: inventario, kit, taglia proposta dall'anagrafica, consegne parziali | 4 | `EG+` | — |

### 3.17 Mobile e area famiglia (4)

| # | Capability | Golee | Mat. G | EasyGame | Mat. E | Gap | Pri |
|---|---|---|---|---|---|---|---|
| C-180 | App dedicata alla famiglia | esiste, **non osservata** | ? | assente | 0 | `EG-` | P2 |
| C-181 | Area genitore su web | non osservata | ? | `/parent-view` + 9 sottopagine + API dedicate | 4 | `EG+` | — |
| C-182 | App per l'allenatore | app unica, non osservata | ? | Expo incompleta, **sviluppo differito** (ADR-0025) | 2 | `EG~` | P3 |
| C-183 | Tessera digitale / QR del tesserato | scheda «Tessera» nelle impostazioni app | 4 | assente | 0 | `EG-` | P3 |

### 3.18 Infrastruttura e qualita (6)

| # | Capability | Golee | Mat. G | EasyGame | Mat. E | Gap | Pri |
|---|---|---|---|---|---|---|---|
| C-184 | Test automatici | non ispezionabili | ? | **2.273 test**, discovery automatica | 5 | `EG+` | — |
| C-185 | Continuous integration | non ispezionabile | ? | 3 job su ogni push, 41 run, ultima verde | 5 | `EG+` | — |
| C-186 | Ambiente di produzione | in esercizio con clienti paganti | 5 | **non esiste**: solo `easygame-staging` | 0 | `EG-` | **P0** |
| C-187 | Error tracking | non osservabile | ? | `console.error` sui percorsi che perdono dati, nessun servizio | 1 | `EG~` | P1 |
| C-188 | Backup e restore provati | non osservabile | ? | esercitazione completa con verifica riga per riga | 5 | `EG+` | — |
| C-189 | Scheduler applicativo | motore di automazioni in esercizio | 5 | **un solo cron** (`sport-work/scheduler`); manutenzione e promemoria a mano | 2 | `EG~` | **P1** |

### 3.19 Riepilogo della matrice

| Esito | Voci |
|---|---|
| `EG+` **EasyGame superiore** | **53** |
| `=` **Parita** | **35** |
| `EG~` EasyGame parziale | **41** |
| `EG-` EasyGame mancante | **48** |
| `NO-COPY` non va copiato | **10** |
| `NA` non applicabile | **2** |
| **Totale** | **189** |

**Golee e avanti in 89 voci** (41 + 48). Di queste, **83 superano il test del
gap reale** e si consolidano nelle **72 voci del registro** (§4); **6 non lo
superano** (§5).

**NO ACTION complessivo: 106** = 53 superiori + 35 parita + 10 da non copiare +
2 non applicabili + 6 differenze respinte.

---

## 4 — Registro dei gap: le 72 voci che passano il test

Ogni riga dichiara il **problema dell'utente**, il **dominio EasyGame da
estendere** (mai da duplicare), la priorita, la release target e l'effort.

Release target: `PRE-PROD` · `V1.1` · `POST-V1` · `NO-ACTION`.
Effort: `S` · `M` · `L` · `XL`.

### 4.1 P0 — impediscono la produzione

| ID | Gap | Problema che risolve | Dominio da **estendere** | Rel. | Eff. |
|---|---|---|---|---|---|
| **G-01** | Riconferma dei tesserati e ricomposizione delle squadre alla nuova stagione (C-021) | Il 1° luglio la segreteria deve dire chi c'e ancora e ricostruire le squadre. Oggi il riporto copia la **configurazione** ma non le **appartenenze**: dopo un rollover ogni atleta risulta senza categoria nella stagione nuova | `src/lib/server/seasons.ts` (rollover) + `athlete_category_memberships` — **non** una tabella nuova | **PRE-PROD** | M |
| **G-02** | Ambiente di produzione (C-186) | Gia noto come X-1 in [23](23-v1-release-matrix.md). Ripetuto qui perche il confronto con un prodotto in esercizio lo rende evidente | fuori dal codice | **PRE-PROD** | S |

### 4.2 P1 — mancanze importanti per un gestionale professionale

| ID | Gap | Problema che risolve | Dominio da **estendere** | Rel. | Eff. |
|---|---|---|---|---|---|
| **G-03** | Motore di automazioni sulle scadenze (C-130) | La segreteria controlla a mano chi non ha pagato, a chi scade il certificato, a chi scade il documento. E la lavorazione manuale piu grande dell'anno | `Notification` + `email-service` + un cron nuovo accanto a `sport-work/scheduler`. **Nessun secondo canale di notifica** | V1.1 | L |
| **G-04** | Anticipi configurabili per automazione (C-131) | «Avvisami 30 e 7 giorni prima» | come G-03 | V1.1 | S |
| **G-05** | Contenuto del messaggio con segnaposto (C-132) | Il club vuole scrivere con le sue parole, non con le nostre | `document-templates` (i segnaposto esistono gia) | V1.1 | M |
| **G-06** | Link di pagamento dentro il sollecito (C-133, C-082) | Sollecitare senza dare il modo di pagare produce un secondo sollecito | `payment-gateway` + checkout esistente: serve un link firmato a scadenza | V1.1 | M |
| **G-07** | Comunicazione massiva alle famiglie con destinatari segmentati (C-137) | Oggi il club apre WhatsApp. Il dato di chi ha ricevuto cosa resta fuori dal gestionale | `Notification` + `email-service` + i gruppi operativi come pubblico | V1.1 | L |
| **G-08** | Bacheca con destinatari per ruolo e gruppo (C-136) | Un annuncio non e una notifica: resta, si consulta, ha allegati | risorsa nuova in `club_resource_items` + Attachment Core | V1.1 | M |
| **G-09** | Causale con flag di detraibilita e quota associativa (C-089) | E il perno che rende automatici 730, libro soci e rendiconto. Senza, ogni documento fiscale e scritto a mano | `fiscal_operation_types` — **estensione di colonne**, non tabella nuova | V1.1 | S |
| **G-10** | Prima nota (C-090) | Registro cronologico che il commercialista chiede ogni anno | `transactions` + `payment_transactions` + `sport_work_outbound_transactions`: e una **lettura**, non un archivio nuovo | V1.1 | M |
| **G-11** | Rendiconto economico per voce di costo e bilancio con flusso di cassa (C-091, C-094, C-145) | Il bilancio di una ASD si legge per causale, non per rata, e con il saldo iniziale e finale del periodo | come G-10, con G-09 come prerequisito | V1.1 | M |
| **G-12** | Estratto conto (C-092) | Stato dei conti in un periodo | `bank_accounts` + movimenti | V1.1 | S |
| **G-13** | Dichiarazione 730 con importo calcolato (C-100) | Adempimento annuale che **ogni** famiglia chiede a **ogni** club, oggi fatto a mano su Word | `payment_transactions` (fonte degli importi) + `fiscal-recipient` (intestatario) + G-09 | V1.1 | M |
| **G-14** | Libreria di modelli documentali pronti (C-116) | Il club non vuole un editor: vuole il documento gia scritto | `document_templates` + un **catalogo di piattaforma** seminato per club | V1.1 | L |
| **G-15** | Documento arricchito con gli importi del gestionale (C-118, C-119) | Un PDF con il logo non serve; un documento che dice la cifra giusta si | `DocumentEditor` — estendere il catalogo dei segnaposto a pagamenti, contributi e compensi | V1.1 | M |
| **G-16** | Contratti Co.Co.Co. pronti (C-112) | Il rapporto di lavoro sportivo esiste gia in EasyGame, ma il contratto va scritto fuori | `sport_work_relationships` + G-14/G-15: il modello legge i campi del rapporto | V1.1 | M |
| **G-17** | Consenso come oggetto con ciclo di vita (C-125) | Un consenso va dimostrato **e revocato**. Oggi vive dentro una compilazione e non si revoca | `form_submissions` + Attachment Core + una risorsa `consents` | V1.1 | M |
| **G-18** | Account della famiglia con ciclo di vita (C-008) | Il canale digitale vale quanto gli account attivi. Oggi non si sa quanti ce ne sono, chi non ha email, chi non ha mai accettato | `athlete-guardians.ts` + `users`/`organization_users`: stati, invito, revoca, «email mancante» come filtro | V1.1 | M |
| **G-19** | Correzione del report Pagamenti (C-144) | Il cliente legge un «Incassato» sbagliato: 179,80 invece di 250,00 sui dati della UAT | `calculatePaymentReport` — il campo `collectedAmount` **arriva gia** | V1.1 | S |
| **G-20** | RSVP della famiglia sull'evento (C-053) | L'allenatore non ha bisogno di sapere chi manca: ha bisogno di sapere **chi non ha risposto** | `training_attendance` + `parent-dashboard`; il componente `AttendanceConfirmation` esiste ed e orfano | V1.1 | M |
| **G-21** | Scheduler applicativo generale (C-189) | Tre funzioni che esistono (promemoria certificati, manutenzione, generazione allenamenti) **non girano** perche nessuno le chiama | `vercel.json` + il pattern gia collaudato di `sport-work/scheduler` | **PRE-PROD** | S |
| **G-22** | Error tracking (C-187) | Gia noto come R-5 | fuori dal codice | V1.1 | S |
| **G-23** | Trasmissione della fattura elettronica allo SdI (C-099) | Gia noto come X-4: manca l'intermediario, non il codice | `einvoice_transmissions`, registro degli adapter vuoto per costruzione | V1.1 | M |

### 4.3 P2 — alto valore, non blocker

| ID | Gap | Problema | Dominio da estendere | Rel. | Eff. |
|---|---|---|---|---|---|
| G-24 | Campi personalizzati sulla persona (C-023) | Ogni club ha tre domande che nessun gestionale ha previsto | `src/lib/forms/dynamic-fields.ts` + una colonna gia esistente per i dati liberi | V1.1 | M |
| G-25 | Viste di elenco per compito (C-026) | «Oggi controllo i certificati» non deve costare un filtro | pagina Atleti + `list-selection` | V1.1 | M |
| G-26 | Export CSV/Excel degli elenchi (C-034) | Il dato del cliente deve poter uscire | `person-export.ts` — le colonne ci sono gia | V1.1 | S |
| G-27 | Modifica di massa di un campo qualunque (C-035) | Copre i casi che nessuno ha previsto | azioni di massa esistenti + G-24 | V1.1 | M |
| G-28 | Archivio delle anagrafiche (C-036) | Togliere dall'elenco senza perdere lo storico | stato «disattivato» gia presente: serve la vista e il filtro | V1.1 | S |
| G-29 | Profilo sanitario esteso (C-028) | Allergie e intolleranze sono il dato che l'allenatore serve in trasferta | `medical_certificates` + scheda atleta, **con il permesso separato di G-33** | V1.1 | M |
| G-30 | Tesseramento come entita con stato e scadenza (C-062) | Il tesseramento scade e nessuno se ne accorge | risorsa nuova collegata alla persona + G-03 per gli avvisi | V1.1 | M |
| G-31 | Calendario unico degli eventi (C-050) | Allenamenti, gare, riunioni e camp sono lo stesso oggetto per chi guarda | `trainings` + `matches`: una **vista**, non un terzo archivio | POST-V1 | L |
| G-32 | Capienza dell'evento e lista d'attesa (C-051) | Corsi e camp hanno posti finiti | come G-31 | POST-V1 | M |
| G-33 | Permesso separato sul dato clinico, e granularita dei permessi dove serve (C-147, C-148) | L'allenatore deve sapere se il certificato e valido, non le patologie | `access-roles.ts` + il pattern dei 5 permessi di `sport_work` | V1.1 | M |
| G-34 | Presenze aggregate per persona con % (C-055) | Serve al bando, al genitore e all'allenatore | `funding` gia misura la frequenza per atleta: **riusare quella misura** | V1.1 | M |
| G-35 | Invito e sollecito mirato sui partecipanti (C-052, C-056) | «Notifica solo i senza risposta» | G-20 + G-03 | POST-V1 | M |
| G-36 | Sconti automatici in fase di iscrizione (C-069) | La regola («iscrizione anticipata», «fratelli») oggi la applica una persona | `discounts` + modulistica V2 | V1.1 | M |
| G-37 | Pagamento contestuale nel modulo di iscrizione (C-083) | Il club sa chi ha pagato prima ancora di approvare | modulistica V2 + checkout esistente | V1.1 | M |
| G-38 | Pacchetti, abbonamenti e carnet (C-071, C-072) | Circoli, palestre e sport individuali non hanno quote di squadra | **dominio nuovo**, accanto a `payment_plans`, non dentro | POST-V1 | XL |
| G-39 | Fornitori e clienti con ciclo passivo (C-096) | Le uscite verso i fornitori oggi sono righe senza anagrafica | `club_resource_items` + `transactions`; **non** duplicare `sport_work` | POST-V1 | M |
| G-40 | Generazione massiva di ricevute (C-098) | A settembre si emettono 200 ricevute | `fiscal-documents.ts`, emissione gia idempotente | V1.1 | S |
| G-41 | Saldo IVA trimestrale per cassa (C-093) | Il club in regime agevolato lo consegna al commercialista | G-09 + G-10 | POST-V1 | M |
| G-42 | Ciclo di firma del documento, compreso il documento di compenso (C-113, C-121) | La firma e uno stato, non un allegato | Attachment Core + `shared-documents` (che gia ha gli stati) | V1.1 | M |
| G-43 | Stampa massiva di un documento (C-120) | Trenta richieste di visita medica in un gesto | G-14/G-15 | V1.1 | S |
| G-44 | Modelli di richiesta visita medica regionalizzati (C-117) | La segretaria telefona alla ASL per farsi mandare il modulo | G-14 — e **lavoro editoriale**, non sviluppo | POST-V1 | L |
| G-45 | Libro soci nel senso statutario, con tessera e tipologia (C-041, C-166) | Il registro va esibito | `/soci` + G-09 (quota associativa) | POST-V1 | M |
| G-46 | Quota associativa collegata alla contabilita (C-168) | Distingue il socio dal tesserato senza tenere due elenchi | G-09 | POST-V1 | S |
| G-47 | Registro volontari, periodi e rimborsi forfettari (C-114, C-170) | Obbligo di legge per molte ASD | `sport_work_people` — **estensione**, non archivio nuovo. Le condizioni di legittimita restano SW-08, in attesa di validazione professionale | POST-V1 | M |
| G-48 | Assemblee, ordine del giorno, deleghe (C-171) | Adempimento ricorrente | dominio nuovo, piccolo, agganciato a `/soci` | POST-V1 | M |
| G-49 | Verbale con le delibere gia redatte (C-172) | Oggi si riapre il verbale dell'anno prima e si cambiano le date | G-14 + G-48 | POST-V1 | M |
| G-50 | Safeguarding: nomina e casellario (C-173) | Obbligo dal 2024 | G-14 + G-48 | POST-V1 | S |
| G-51 | Firma e timbro del presidente (C-014) | Ogni documento generato lo richiede | `/organization` + Attachment Core | V1.1 | S |
| G-52 | Federazioni come entita del club (C-015) | Matricola e data di affiliazione finiscono nei documenti | `/organization` — colonne, non tabella | V1.1 | S |
| G-53 | Avvisi di scadenza del tesseramento (C-063) | vedi G-30 | G-03 + G-30 | V1.1 | S |
| G-54 | Report economico esportabile (C-146) | Il commercialista vuole un file | G-10/G-11 + il pattern CSV gia usato dai bandi | V1.1 | S |
| G-55 | Report presenze per persona (C-143) | vedi G-34 | G-34 | V1.1 | S |
| G-56 | Persona come nucleo unico oltre il lavoro sportivo (C-024) | La stessa persona e atleta, genitore e dirigente: oggi sono quattro schede | **estendere Person Core**, con collegamento debole come gia fatto in Sport Work | POST-V1 | XL |
| G-57 | Invito collaboratori con ruolo proposto (C-009) | Aggiungere una segretaria oggi passa da un pannello tecnico | `organization_users` + `access-management` | V1.1 | S |
| G-58 | Notifica singola o report giornaliero (C-134) | Trenta email al giorno non si leggono | G-03 | V1.1 | S |
| G-59 | App dedicata alla famiglia (C-180) | Il canale digitale ha bisogno di un posto dove vivere | `parent-view` esiste: la scelta e web responsive vs app. **Differita da ADR-0025** | POST-V1 | XL |
| G-60 | Anagrafica societaria completa a schede (C-012) | Documenti del club e firma non hanno posto | `/organization` | V1.1 | S |
| G-61 | Riconoscimento del nucleo familiare e sconto fratelli (C-039) | Sconto ricorrente, oggi manuale | `discounts` + tutori gia collegati | POST-V1 | M |
| G-62 | Valutazione sportiva su criteri configurabili (C-060) | L'allenatore documenta la crescita dell'atleta | dominio nuovo, piccolo | POST-V1 | M |
| G-63 | Sincronizzazione con un portale federale (C-064, C-065) | Doppio inserimento su due sistemi | G-30 + un adapter per portale. **Uno solo esiste (CSI)** | POST-V1 | L |

### 4.4 P3 — rifiniture e quick win

| ID | Gap | Dominio | Rel. | Eff. |
|---|---|---|---|---|
| G-64 | Modifica in linea delle scadenze dall'elenco (C-027) | pagina Atleti | V1.1 | S |
| G-65 | Ricerca globale (C-042) | navigazione | V1.1 | M |
| G-66 | Azioni rapide per compito (C-157) | dashboard | V1.1 | S |
| G-67 | Controllo duplicati alla creazione manuale (C-032) | il controllo esiste in approvazione modulo: **riusarlo** | V1.1 | S |
| G-68 | Creazione rapida di un'anagrafica in tre campi (C-156) | `/athletes/new` | V1.1 | S |
| G-69 | Unificare i due sistemi di toast (C-165) | gia WP-14 `READY` | V1.1 | S |
| G-70 | Dimissione del socio con data e motivo (C-169) | `/soci` | POST-V1 | S |
| G-71 | Riconciliazione dei payout esposta (C-087) | pagamenti | POST-V1 | M |
| G-72 | Tessera digitale del tesserato (C-183) | `parent-view` + `qr-code-utils.ts` **gia presente e orfano** | POST-V1 | S |

---

### 4.5 Stato dopo la Wave 1

> Aggiornato il 2026-08-28, dopo l'esecuzione della
> [Wave 1](32-wave-1-implementation-uat.md). **Uno stato `CLOSED` qui significa
> che esiste una prova a runtime che lo chiude**, non che esiste il codice: il
> §1.4 del planning [31](31-wave-1-planning.md) spiega perche la distinzione
> conta, e il §4 del [32](32-wave-1-implementation-uat.md) porta le prove.

| Gap | Prima | Dopo | Prova |
|---|---|---|---|
| **G-01** — riconferma dei tesserati | OPEN | **CLOSED** | `scripts/season-rollover-uat.mjs`, 43/43: 180 riconfermati nella categoria giusta con la sede invariata, 20 fuori e intatti, `GET /athletes?category_id=<nuova>` risponde 180 dove prima rispondeva 0, secondo riporto a zero creazioni |
| **G-19** — il report Pagamenti conta le rate | OPEN | **CLOSED** | `scripts/wave-1-cash-cron-uat.mjs`, 28/28, piu la verifica a schermo: `/reports` «Pagato 720,00 €» e `/movements` «Entrate 720,00 €» sullo stesso club |
| **G-21** — le funzioni periodiche non girano | OPEN | **CLOSED** | Quattro voci `crons`; il giro dei certificati genera due promemoria e la seconda esecuzione zero; il giro degli allenamenti ne genera tre e la seconda esecuzione zero; la manutenzione gira e riporta cinque passi |
| **G-26** — export solo in PDF | OPEN | **CLOSED** | CSV su atleti, allenatori, staff e soci con le stesse colonne e gli stessi ambiti del PDF; 15 test sul tracciato, accenti e apostrofi compresi |
| **G-51** — firma e timbro del presidente | OPEN | **CLOSED** | Caricabili, sostituibili, rimovibili, non pubblici, e leggibili dal generatore documentale (`readClubSignatureImage`) |
| **AU-7** — il cambio stagione non ha un permesso | OPEN | **CLOSED** | `seasons.change` in `src/lib/seasons/permissions.ts`, perimetro invariato, diniego dell'allenatore verificato a runtime con la traccia in `audit_logs` |
| **G-07** — comunicazione massiva | OPEN | **PARTIAL** | Il sollecito insoluti ne e il primo pezzo. Restano segmentazione, bacheca e contenuto configurabile |
| **G-15** — documento arricchito | OPEN | **PARTIAL** | Il risolutore esiste e un modello lo usa. Resta il catalogo (G-14, Wave 3) |
| **G-02** — ambiente di produzione | OPEN | **OPEN** | Fuori dal codice: resta il blocker esterno X-1 |
| **G-06**, **G-03/04/05**, **G-13**, **G-14**, **G-43** | OPEN | **OPEN** | Wave 2, 3 e 4 come previsto |
| **AU-1** — «da verificare a runtime» | OPEN | **CHIUSO COME G-01** | Verificato al §1 del [31](31-wave-1-planning.md) e risolto dalla Wave |
| **C-017**, **C-020**, **C-074/075/077**, **C-097**, **C-158**, **C-159** | NO ACTION | **NO ACTION** | Gia superiori. La Wave le estende senza cambiarne il verdetto: il riporto **conferma** le sedi invece di duplicarle, e la responsivita non e peggiorata (§6 del [32](32-wave-1-implementation-uat.md)) |

**Effetto sui totali:** `EG-` da 48 a **44**, `EG~` da 41 a **40**. Le voci
totali restano **189**: una Wave non aggiunge capability al confronto, ne
chiude.

---

---

### 4.6 Stato dopo la Wave 2

> Aggiornato il 2026-08-29, dopo l'esecuzione della
> [Wave 2](34-wave-2-implementation-uat.md). Vale la stessa regola del §4.5:
> **`CLOSED` significa che esiste una prova a runtime**, non che esiste il
> codice. Le prove sono i 67 controlli di
> `scripts/wave-2-communications-uat.mjs`, eseguiti contro un'applicazione vera
> con una consegna email vera.

| Gap | Prima | Dopo | Prova |
|---|---|---|---|
| **G-03** — motore di automazioni | OPEN | **CLOSED** (quattro regole) | Quattordici controlli a runtime: la rata a sette giorni produce **un** messaggio, la seconda esecuzione dello stesso giorno zero, **due giri in parallelo un messaggio solo**, l'anticipo trascorso non recupera, la regola spenta tace, quattro club attraversati senza fermarsi su quello con la rata orfana. Sono le quattro regole del §4.1 del planning, non di piu |
| **G-04** — anticipi configurabili | OPEN | **CLOSED** | Fino a tre anticipi per regola, corrispondenza esatta, nessun recupero all'indietro. Verificato a runtime |
| **G-05** — contenuto con segnaposto | OPEN | **PARTIAL** | Chiuso per automazioni, comunicazione massiva e bacheca: il club scrive con le sue parole e vede l'anteprima sul primo destinatario vero. **Resta il sollecito a mano**, che passa ancora da `buildPaymentReminderLines` — cioe proprio il messaggio che una segreteria manda piu spesso (debito `W2-19`) |
| **G-06** — link di pagamento nel sollecito | OPEN | **PARTIAL** | Il link c'e, e nel sollecito **e** nelle automazioni: token opaco, solo l'impronta in archivio, scadenza, revoca, quattro esiti negativi indistinguibili byte per byte, nessun identificativo interno nella pagina pubblica. Non e `CLOSED` perche **nessun pagamento e mai passato da Stripe**: manca il giro sandbox (`R-16`, debito `W2-06`) |
| **G-07** — comunicazione massiva segmentata | PARTIAL | **CLOSED** | Ventiquattro controlli a runtime: la famiglia con due figli riceve **un** messaggio, l'atleta senza recapito compare fra gli esclusi con il motivo, due destinatari su tre ricevono davvero e il terzo risulta fallito, il doppio clic non manda niente, il registro dice chi ha ricevuto cosa |
| **G-08** — bacheca | OPEN | **CLOSED** | Dieci controlli: un annuncio nasce bozza e non lo legge nessuno, pubblicare raggiunge **solo** il pubblico scelto, pubblicare due volte non consegna due volte, segnare letto funziona una volta sola, ritirare non cancella le consegne, un annuncio di un altro club risponde 404 |
| **G-20** — RSVP | OPEN | **PARTIAL** | Chiuso sugli **allenamenti**: sette controlli, fra cui due risposte simultanee che producono una riga sola e l'appello che scrive la presenza senza toccare l'intenzione. **Partite e convocazioni no**: la convocazione vive sotto nove grafie dentro `matches` e non ha una forma su cui innescare (debito `W2-08`) |
| **G-58** — riepilogo giornaliero | OPEN | **CLOSED** | Modalita di consegna per club, indirizzata a chi puo vedere quel dato |
| **G-18** — account famiglia | OPEN | **OPEN** | Fuori perimetro per scelta dichiarata (§1.3 del planning). Arriva pero la sua meta misurabile: ogni anteprima dice quante famiglie non hanno email e quante non hanno account, **con il motivo** |
| **G-35**, **G-53** | OPEN | **OPEN** | POST-V1 come dichiarato: il primo diventa un criterio in piu ora che audience e RSVP esistono, il secondo resta bloccato da G-30 |

**Effetto sui totali del §3.** `EG-` da 44 a **39**, `EG~` da 40 a **38**. Le
voci totali restano **189**: una Wave non aggiunge capability al confronto, ne
chiude.

**Perche due `PARTIAL` invece di due `CLOSED`.** G-05 e G-06 sono chiusi dove il
codice gira e non dove il gap era nato: il primo lascia fuori il sollecito a
mano, il secondo non ha mai visto un pagamento vero. Dichiararli chiusi
costerebbe poco oggi e mentirebbe alla prima persona che li legge per decidere
cosa fare dopo.

### 4.7 Stato dopo la Wave 3

> Aggiornato il 2026-08-29, dopo l'esecuzione della
> [Wave 3](36-wave-3-implementation-uat.md). Vale la stessa regola del §4.5 e
> del §4.6: **`CLOSED` significa che esiste una prova a runtime**, non che
> esiste il codice. Le prove sono i 68 controlli di
> `scripts/wave-3-documents-uat.mjs`, eseguiti contro un'applicazione vera con
> due club veri e cinque ruoli veri.

| Gap | Prima | Dopo | Prova |
|---|---|---|---|
| **G-15** — documento arricchito dagli importi | PARTIAL | **CLOSED** | L'attestazione dice **80,00** su una rata da 130 marcata pagata con 80 incassati: l'importo e il denaro entrato, non il dovuto (ADR-0068). Il documento con gli importi si rifiuta a chi non puo vederli, **dicendo perche**. Un dato che manca resta bianco ed e elencato: mai «undefined» |
| **G-43** — stampa massiva | OPEN | **CLOSED** | Cinquanta documenti in un lotto solo in 1.155 ms; rieseguire lo stesso lotto produce **zero** righe nuove; un soggetto di un altro club dentro la selezione fallisce da solo e compare fra i falliti con il motivo, mentre gli altri passano. Cento documenti in due lotti: 1,9 s |
| **G-17** — consenso con ciclo di vita | OPEN | **CLOSED** | Accettare, revocare e riaccettare lascia **tre righe** e uno stato derivato «accettato»; pubblicare una versione nuova non invalida i consensi vecchi ma li segnala; la prova del consenso dato prima della revoca resta. Una definizione di un altro club risponde «Accesso negato» |
| **Scadenze documentali** (famiglia G-03) | OPEN | **CLOSED** | Un allegato che scade fra trenta giorni produce **una** consegna; la seconda esecuzione dello stesso giorno zero; due giri in parallelo una sola; la regola spenta tace. Il certificato medico resta su `AUT-03` e **nessun doppione** arriva da `AUT-05` |
| **G-14** — libreria di modelli pronti | OPEN | **PARTIAL** | Il catalogo esiste e funziona: dieci voci scritte, **sei distribuite** e adottabili con un clic. Non e `CLOSED` perche non e una libreria di settantasette modelli e non lo sara: le quattro voci di classe C sono ferme in attesa di validazione professionale, e i moduli territoriali non li apriamo affatto (ADR-0092). E una differenza che resta, ed e una scelta |
| **G-42** — ciclo di firma del documento | OPEN | **PARTIAL** | Il documento generato ha uno stato, e «firmato» pretende la copia firmata caricata come allegato: provato che senza allegato lo stato non avanza. Non e `CLOSED` perche la firma elettronica **qualificata** non c'e e non e stata promessa (ADR-0091): Golee arriva al `.p7m`, noi no |
| **G-44** — modelli visita medica regionalizzati | OPEN | **NO ACTION** | Confermato e dichiarato: trenta moduli territoriali sono un presidio permanente, non uno sviluppo. Il motore permette al club di caricare **il suo** modulo e compilarlo con i dati veri |
| **G-16** — contratti Co.Co.Co. pronti | OPEN | **OPEN** | POST-V1 come dichiarato. Mancano due cose distinte: la validazione professionale del testo (classe C) e i segnaposto del rapporto di lavoro sportivo. Il controllo di permesso che li proteggera esiste gia e non ha ancora niente da proteggere (debito `W3-06`) |
| **C-126** — unione dei consensi PDF | respinta | **respinta** | Confermata: il consenso non ha bisogno di un PDF per esistere, e se un PDF serve e un documento generato che **cita** il record |

**Effetto sui totali del §3.** In §3.10 — Documenti: C-118 e C-119 passano a
`EG+` (il nostro risolutore dichiara cosa non sa riempire, e gli importi
vengono dal registro incassi invece che da uno stato); C-120 passa a `=`;
C-125 passa a `EG+` (la revoca, piu l'evidenza versionata); C-116 resta `EG~`
e C-117 resta `EG-`, per scelta. `EG-` scende da **39 a 36**.

**Perche due `PARTIAL` invece di due `CLOSED`.** G-14 e G-42 sono chiusi dove
il codice gira e aperti dove il gap era nato: il primo perche un catalogo di
sei voci non e una libreria di settantasette, il secondo perche «firmato» da
noi significa una copia rientrata e non un `.p7m`. Dichiararli chiusi
costerebbe poco oggi e mentirebbe alla prima persona che li legge per decidere
cosa fare dopo.

---

## 5 — Le 6 differenze respinte (non sono gap)

Golee e avanti, ma la differenza **non supera il test del §1.4** e **non genera
alcuna voce di lavoro** — nemmeno assorbita dentro un'altra.

| # | Capability | Perche non e un gap |
|---|---|---|
| 1 | **C-002** accesso con Google / Apple | Il problema («entrare») e gia risolto. Il codice OAuth esiste, completo, ed e spento per mancanza di credenziali: e **configurazione di ambiente**, non sviluppo, e vive gia fra i blocker esterni |
| 2 | **C-019** anno solare come alternativa alla stagione sportiva | Una ASD italiana lavora per stagione. Le date di inizio e fine della stagione EasyGame sono gia libere, quindi un club che voglia l'anno solare **puo gia dichiararlo**. Nessun problema aperto |
| 3 | **C-080** addebito diretto SEPA | Il problema reale e «pagare senza usare la carta», ed e gia risolto da bonifico e incasso manuale. Aggiungere un metodo di pagamento non risolve un problema che qualcuno abbia oggi |
| 4 | **C-126** unione dei consensi PDF al documento generato | E una comodita di stampa, non un problema. Il consenso come oggetto (G-17) risolve la parte che conta: dimostrabilita e revoca |
| 5 | **C-167** «tutti i tesserati sono soci» | E una **scorciatoia di popolamento**, non una capability: la si valuta quando esistera il libro soci (G-45), e potrebbe non servire |
| 6 | **C-182** app per l'allenatore | Non e un gap verso Golee: e una **decisione di prodotto gia presa** ([ADR-0025](18-decision-log.md#adr-0025--mobile-app-differita-la-priorita-e-easygame-web-v1-responsive)), che differisce l'intero sviluppo mobile |

> **Nota sul metodo — cosa non e stato respinto, e perche.** Undici differenze
> sono nel registro del §4 con una voce propria **ma non hanno un problema
> autonomo**: si chiudono insieme a un gap piu grande e non vanno pianificate a
> parte. Sono gli anticipi configurabili (G-04, dentro G-03), i segnaposto
> (G-05), il link di pagamento nel sollecito (G-06), il report giornaliero
> (G-58), gli avvisi di scadenza del tesseramento (G-53, dentro G-30), l'export
> federale (G-63), il consumo del credito del carnet (dentro G-38), la
> riconciliazione dei payout (G-71), la tessera digitale (G-72), l'ambiente di
> produzione (G-02) e l'error tracking (G-22).
>
> Hanno una voce propria perche **e con quel nome che un cliente le chiede**,
> non perche costituiscano lavoro separato. Chi pianifica una wave le trova
> gia dentro il gap che le contiene.

---

## 6 — EasyGame competitive advantages

Sezione tanto importante quanto i gap. **Ordinata per distanza dal
concorrente**, non per dimensione del codice.

### 6.1 Cio che Golee non possiede affatto

| # | Vantaggio | Cosa Golee ha |
|---|---|---|
| **V-01** | **Il ciclo di gestione dei voucher e contributi da enti.** Assegnato → maturato → rendicontato → liquidato → residuo, con la maturazione **misurata dal server** sulla frequenza, tre fonti configurabili, riconciliazione riga per riga e CSV. Le regole di un bando sono **configurazione** (ADR-0037) | Un **metodo di incasso** `SPORT_VOUCHERS` e cinque modelli di attestazione. Il ciclo si chiude fuori dal gestionale: il club stampa, la famiglia porta all'ente. «Quando il beneficiario e il club, si torna a Excel» (parole del teardown) |
| **V-02** | **Multi-sede senza duplicare le squadre.** Sedi, gruppi operativi (categoria x sede), sede sull'appartenenza dell'atleta, filtro montato **solo** quando serve. 220 atleti su due sedi, nessuna contaminazione, provato a runtime | **Nessuna nozione di sede.** «Una societa con piu impianti deve duplicare i gruppi» |
| **V-03** | **Strutture e campi come risorse** con orari di apertura, prenotazioni e tariffe | «Il Luogo esiste solo come attributo dell'evento» |
| **V-04** | **Categoria come entita** con anni di nascita, statistiche e **compatibilita orientata e non transitiva** fra categorie | «Categoria e un campo». L'unita e il gruppo, piatto |
| **V-05** | **Numerazione delle maglie come dominio**: gruppi, stagione, unicita, motivo dell'eleggibilita | Numero di maglia = campo dell'atleta. Nessuna gestione dei conflitti |
| **V-06** | **Programma settimanale come oggetto** da cui si generano le sedute | Solo ricorrenza sull'evento |
| **V-07** | **Pro-rata sulla quota**, a giorni o a mesi, con la `reason` di ogni esito | Assente |
| **V-08** | **Magazzino vero**: inventario, kit, taglia proposta dall'anagrafica, **consegne parziali** con stato derivato («Parziale · 2/4 consegnati · 1 non disponibile») | Catalogo e ordini. Il problema delle rimanenze e risolto **commercialmente**, non nel software |
| **V-09** | **OCR del documento d'identita**, locale, il file non lascia il browser | Assente: tipo, numero e scadenza si inseriscono a mano |
| **V-10** | **Riporto della configurazione a nuova stagione**: categorie, sconti, piani, gruppi, programma e previsionale, idempotente e con rimappatura dei riferimenti | «Quote, entrate e pagamenti ripartono da zero» |

### 6.2 Cio che Golee ha, ma peggio

| # | Vantaggio | Il confronto |
|---|---|---|
| **V-11** | **Lavoro sportivo e compensi come dominio completo**: rapporti, piani, maturazione, **motore contributivo con regole versionate per anno e la fonte normativa accanto a ogni valore**, posizione annua per cassa, registro in uscita append-only, agenda degli adempimenti, giro notturno, cinque permessi dedicati. 72 controlli a runtime, 72 verdi | Golee **calcola** (fascia esente, INPS, avviso ai 15.000) e **documenta** (13 modelli, firma p7m) ma non ha un registro, non ha regole versionate, non ha un'agenda degli adempimenti. Ha in piu i **contratti pronti** (G-16) |
| **V-12** | **Il modello del denaro regge lo sconto.** Rata = debito, incasso = movimento (ADR-0036): un incasso parziale su una rata scontata **non tocca lo sconto** | Golee **disassocia lo sconto**, e lo dichiara nel proprio dialogo chiedendo all'utente come vorrebbe che funzionasse. E il difetto piu grave del prodotto concorrente |
| **V-13** | **Numerazione dei documenti per club ed esercizio, che si incrementa** e che **nessuna schermata puo digitare** (ADR-0044, due invarianti) | Numerazione presente, disciplina non verificabile |
| **V-14** | **Rimborso online collaudato contro Stripe**, con commissione restituita in proporzione, scritto dall'evento firmato, doppio clic che produce un solo rimborso | Dialogo presente, **nessuno storno eseguito** in analisi |
| **V-15** | **Diritti di piano separati dai permessi di ruolo**, con il **motivo** del diniego mostrato a schermo (ADR-0046, ADR-0048) | «L'utente bloccato non sa se e un problema di permesso o di abbonamento»: difetto dichiarato |
| **V-16** | **Sette ruoli canonici con normalizzazione degli alias.** Chi configura non compone una matrice | ~90 caselle e **nessun preset di ruolo trovato**. Il teardown lo definisce «l'incognita decisiva» |
| **V-17** | **Audit di tutti i dinieghi** piu isolamento multi-tenant provato con 11 tentativi IDOR fra due organizzazioni vere | Audit **non osservato**; isolamento non verificabile dall'esterno |
| **V-18** | **Deep link alla scheda della persona.** `/athletes/[id]` e un indirizzo condivisibile | **Non funziona**: navigando all'URL si torna alla lista |
| **V-19** | **Responsivita verificata a 375 / 768 / 1280** su ogni area, con `scrollWidth` mai oltre la viewport e le tabelle che scorrono nel proprio contenitore | A 375 px «la tabella mantiene tutte e 25 le colonne»: nessuna vista a schede |
| **V-20** | **Modulistica V2 con versioni immutabili**: una compilazione cita la versione con cui e stata fatta (ADR-0040), e l'approvazione e l'unico momento che scrive in anagrafica | Moduli presenti e maturi, ma **due generazioni convivono** (`/enrolls/legacy`) e il versionamento non e osservato |
| **V-21** | **Import atleti verificabile**: mappatura colonne, anteprima con esito per riga, scrittura a scaglioni con ritentativo riga per riga, 220 atleti in 10 richieste HTTP | Import presente, comportamento non osservato |
| **V-22** | **Nessuna telemetria comportamentale verso terze parti.** In un gestionale che tratta dati di minori e dati sanitari, e un vantaggio di prodotto, non un dettaglio | Meta, TikTok, Bing UET e **Microsoft Clarity con session replay**, con l'etichetta del pulsante premuto |
| **V-23** | **Nessuna pressione commerciale nell'interfaccia** e nessuna schermata di avvio obbligatoria | ~20% dello schermo occupato stabilmente; almeno 13 sezioni dietro una schermata introduttiva |
| **V-24** | **Documenti richiesti alla famiglia con stato** (richiesto → caricato → in revisione → approvato/respinto) | «Condividi documento con il tesserato»: il verso e uno solo |
| **V-25** | **Attachment Core**: un servizio unico con driver, autorizzazione propria, tipi chiusi, `Content-Security-Policy: sandbox`, provato su sette combinazioni | Cartelle e permessi per area; nessun dettaglio verificabile |
| **V-26** | **Convocazioni gara con avvisi sui certificati** e alert operativi per l'allenatore | L'evento e generico; nessuna convocazione dedicata |
| **V-27** | **Multi-club e multi-ruolo per un solo account** | Non osservato |
| **V-28** | **Backup e restore provati** con verifica riga per riga, e CI con tre job su ogni push | Non osservabile |

---

## 7 — Golee advantages

Solo cio che l'archivio del teardown **dimostra**. Nessuna inferenza.

| # | Vantaggio | Evidenza | Perche conta |
|---|---|---|---|
| **A-01** | **Il motore di automazione delle scadenze** — 34 automazioni su 3 destinatari e 6 domini, con interruttore, fino a 3 anticipi, aggregazione, mittente e contenuto personalizzabili | `[UI]` completo sulla scheda «verso di te», `[CLIENT]` sul resto | E, riga per riga, l'elenco delle lavorazioni manuali di una segreteria |
| **A-02** | **La libreria di 77 modelli documentali**, regionalizzata fino alla singola ASL, con compilazione dai dati e arricchimento finanziario | `[UI]`, elenco completo | Non e software: e **presidio redazionale**. La concorrenza di questa funzione e la cartella «Modelli» sul desktop |
| **A-03** | **La contabilita che arriva al documento** — Prima nota, Rendiconto per voce di costo, Estratto conto, **Saldo IVA trimestrale per cassa** | `[UI]`, con le descrizioni del prodotto | Che il saldo IVA sia **per cassa** dimostra che il caso d'uso reale e stato capito |
| **A-04** | **La causale come perno fiscale** (`deductible`, `isMembershipFee`, regime IVA) | `[UI]` + `[CLIENT]` | Un flag su una tabella di configurazione rende automatici 730, libro soci e rendiconto |
| **A-05** | **Il 730 con importo calcolato**, in 4 varianti, che esclude contanti e voucher | `[UI]` + `[CLIENT]` | La variante per **genitori separati** dimostra che il caso reale e stato guardato |
| **A-06** | **Due modelli economici coesistenti**: quota di squadra a rate **e** pacchetti/carnet attivabili in autonomia dalla famiglia | `[UI]` + `[CLIENT]` | E cio che rende il prodotto vendibile fuori dal calcio giovanile |
| **A-07** | **Il ciclo evento → invito → RSVP → presenza**, con capienza, lista d'attesa, scadenze di conferma e disdetta, e solleciti segmentati | `[CLIENT]`, modello completo | La colonna «Nessuna risposta» rende visibile il vero problema dell'allenatore |
| **A-08** | **Il verbale di assemblea con le delibere gia redatte**, a 11 blocchi componibili | `[CLIENT]`, testi integrali | Elimina la lavorazione tipica: riaprire il verbale dell'anno prima e cambiare le date |
| **A-09** | **La granularita dei permessi** (~90 chiavi) con separazioni non ovvie: clinico vs anagrafico, denaro famiglie vs compensi staff, firma del presidente, credenziali federali, «manda adesso» vs «configura» | `[CLIENT]` | E lavoro serio, e resta il modello a cui guardare per G-33 |
| **A-10** | **Le sette viste di elenco per compito** e la **modifica in linea** delle scadenze dalla riga | `[UI]` | E il modo in cui una segretaria cambia lavoro senza cambiare pagina |
| **A-11** | **Le opzioni che dichiarano la conseguenza** invece della funzione, e le **raccomandazioni esplicite** nelle scelte economiche | `[UI]` | Il prodotto prende posizione invece di scaricare la decisione sull'utente |
| **A-12** | **La riconferma dei tesserati al cambio stagione**, con contatore dei non confermati e duplicazione del gruppo | `[CLIENT]` | Obbliga la segreteria a decidere chi c'e ancora. E il momento piu costoso dell'anno |
| **A-13** | **La sincronizzazione federale come riconciliazione** (CSI): diff a tre stati e il caso «solo in Golee» sottoposto a decisione umana | `[CLIENT]` | Mostra i casi sporchi invece di risolverli in silenzio |
| **A-14** | **La modifica di massa di un campo qualunque**, compresi i personalizzati | `[CLIENT]` | Copre i casi che il prodotto non ha previsto |
| **A-15** | **La fatturazione elettronica operativa** con stati SDI notificati | `[CLIENT]` | EasyGame genera il tracciato e si ferma li |
| **A-16** | **Il ciclo di firma come stato del documento**, fino al `.p7m`, con notifica all'arrivo | `[CLIENT]` | E la differenza fra digitalizzare la stampa e digitalizzare il processo |
| **A-17** | **La creazione dell'atleta in 4 click e 5 campi**, con il calcolatore di CF annidato che restituisce il valore al dialogo padre | `[ESEGUITO]` | L'unico workflow eseguito con salvataggio, ed e il piu efficiente osservato |

---

## 8 — Golee features / patterns NOT to copy

| # | Golee | Perche non copiare | EasyGame |
|---|---|---|---|
| **N-01** | **Telemetria comportamentale verso Meta, TikTok, Bing e Clarity (session replay)**, con l'etichetta del pulsante premuto | Il gestionale tratta anagrafiche di **minori**, dati **sanitari** e dati economici delle famiglie. Profilare i percorsi di lavoro della segreteria verso piattaforme pubblicitarie e un rischio legale e reputazionale, non una funzione | EasyGame non ha nessuna terza parte di tracciamento. **Mantenere questa scelta e un vantaggio commerciale**, non una rinuncia |
| **N-02** | **Entitlement di piano nella stessa matrice dei permessi di ruolo** (`table:export`, `pro_prints`, `isProTab`) | L'utente bloccato non distingue «non ho il permesso» da «non ho il piano»: due cause con due rimedi diversi | ADR-0046 e ADR-0048 li tengono separati e **il diniego dice sempre il motivo**. Non tornare indietro |
| **N-03** | **Incasso parziale che disassocia lo sconto** | E il difetto piu grave del prodotto concorrente, ammesso nel dialogo stesso | ADR-0036: la rata e un debito, l'incasso e un movimento. Lo sconto non viene mai toccato da un incasso |
| **N-04** | **Schermata di avvio obbligatoria in ogni sezione mai usata** (13 sezioni) | Un click in piu prima di poter fare qualsiasi cosa. Rallenta chi sa dove andare e rende opaco il prodotto a chi lo valuta | Empty state che spiega e **non blocca** |
| **N-05** | **Pressione commerciale su ~20% dello schermo** | EasyGame e venduto a societa, non self-service con upsell continuo. Il modello commerciale e diverso | Nessun banner promozionale nell'area di lavoro |
| **N-06** | **Due modelli economici senza guida alla scelta** (Tariffe e Pacchetti) piu una migrazione dichiarata in corso | Se e quando G-38 introdurra i pacchetti, la scelta fra i due modelli va **guidata dal prodotto**, non lasciata dedurre | Oggi EasyGame ha un modello solo (piani e rate) ed e chiaro. Non introdurre il secondo senza la guida |
| **N-07** | **Tre posti chiamati «documenti»** piu «Genera documenti» piu «Cartelle» | Tassonomia ambigua che disorienta il nuovo utente | La modulistica EasyGame ha gia due schede distinte con nomi diversi. Quando arrivera G-14, **nominarla dentro Modulistica**, non accanto |
| **N-08** | **Rateizzazione al consumatore (Klarna, Alma) al 4,99% + 0,40** | Sposta il costo sulla famiglia o sul club, e introduce due fornitori in piu nel percorso del denaro. EasyGame ha gia il pagamento parziale, che risolve lo stesso problema senza finanziaria | Incasso parziale nativo: N movimenti per rata, anche con metodi diversi |
| **N-09** | **Marketplace di consulenze e chat con commercialisti dentro il gestionale** | E un modello di ricavo, non una funzione. Richiede un presidio professionale continuo che EasyGame oggi non ha, e crea responsabilita su consigli fiscali | EasyGame dichiara le regole con **la fonte normativa accanto** e si ferma dove serve la firma di un professionista (ADR-0072, ADR-0073) |
| **N-10** | **Sito web della societa come add-on** (15 EUR/mese) | E un prodotto diverso con un ciclo di vita diverso (SEO, domini, contenuti). Diluisce il perimetro | Fuori perimetro. Se serve, si integra un CMS, non lo si costruisce |
| **N-11** | **Numerazione della richiesta di iscrizione con due generazioni vive** (`/enrolls/legacy`) e **due generatori di verbale** | E debito che il concorrente si porta dietro. Non e un pattern | La Modulistica V2 ha **superato** la V1 e il residuo e registrato come D28 con un piano di chiusura |
| **N-12** | **Accesso con QR come funzione di prodotto (Beta)** | Ha senso «dove esiste una porta da controllare». Per il perimetro EasyGame attuale (societa di squadra, campi aperti, multi-sede) e una funzione senza destinatario | Non implementare finche non ci sara un cliente con una porta. Il generatore QR esiste gia nel repository per il giorno in cui servira |

---

## 9 — Duplicazioni gia presenti in EasyGame

Scoperte durante il confronto. **Nessuna e stata corretta.** Alcune sono gia in
[16](16-technical-debt.md); quelle nuove sono marcate.

| # | Duplicazione | Stato | Rischio |
|---|---|---|---|
| **D-A** | **Due registri di compensi**: `trainer_payments` (legacy) e il dominio Lavoro sportivo | Gia SW-05, per scelta (ADR-0076) | Un club puo registrare un compenso in due posti e vederne solo uno nelle soglie |
| **D-B** | **Due rappresentazioni delle risorse di club**: `club_resource_items` e le ~35 colonne `Json?` su `clubs` | Gia D2 | Perdita di scritture concorrenti |
| **D-C** | **Due sistemi di toast** montati insieme | Gia D11, WP-14 `READY` | Incoerenza visibile all'utente |
| **D-D** | **Due archivi di file**: `attachments`+`attachment_blobs` e la tabella `assets` (logo di club, allegati dei moduli V1) | Gia D13/F-6 | Due politiche di permessi su file dello stesso club |
| **D-E** | **Due generazioni di moduli**: `form_templates` e i residui `online_form` in `clubs.document_templates` | Gia D28 | Nessuna: niente li legge piu |
| **D-F** | **Due generazioni di pagine trainer** (`trainer-*-page.tsx` orfane accanto alle v2) | Gia D9 | Codice morto |
| **D-G** | **Quattro archivi di persona** — `athletes`, `trainers`, `staff_members`, `members` — piu **un quinto** (`sport_work_people`) che e l'unico Person Core vero | **NUOVA** (rilevata da questo audit) | La stessa persona esiste fino a cinque volte. E il problema che G-56 affronta; oggi il collegamento debole di Sport Work e l'unico ponte |
| **D-H** | **Due nozioni di «documento del tesserato»**: `shared-documents` (con stati e verso la famiglia) e gli allegati di categoria su Attachment Core | **NUOVA** | Due elenchi diversi della stessa cartella. Da unificare **prima** di costruire G-42 |
| **D-I** | **`/procura` con quattro fattispecie sotto lo stesso nome** | Gia SW-06 | Serve una decisione di prodotto |
| **D-J** | **`qr-code-utils.ts` presente e non referenziato da nessuno** | **NUOVA** | Codice morto; diventa utile solo con G-72 |
| **D-K** | **`AttendanceConfirmation.tsx` presente e non referenziato** | Gia in [11](11-capabilities.md) come `LEGACY/REVIEW` | E il punto di partenza di G-20: **verificarlo prima di scrivere codice nuovo** |
| **D-L** | **Due letture del «denaro incassato»**: `summarizeClubMovements` (corretta, cassa) e `calculatePaymentReport` (sbagliata, stato della rata) | Gia registrata da RC Fix 3 | **Due numeri diversi per la stessa domanda, in due pagine.** E G-19 |

---

## 10 — Confronto UX

Non solo funzioni: passaggi, chiarezza, ricerca, filtri, azioni di massa,
feedback, velocita, densita, errori, scopribilita.

| Dimensione | Golee | EasyGame | Chi vince |
|---|---|---|---|
| **Numero di passaggi per creare un'anagrafica** | **4 click, 5 campi**, con «Salva e vai alla scheda completa» che dichiara cosa succede dopo | Pagina dedicata con guscio completo: piu campi davanti, meno sorprese dopo | **Golee** — ma la differenza si chiude con G-68 |
| **Cambiare lavoro senza cambiare pagina** | 7 viste che riscrivono tutte le colonne | Colonne mostrabili/nascondibili, nessuna vista salvata | **Golee** (G-25) |
| **Aggiornare trenta scadenze** | Modifica in linea dalla riga: 1-2 click per atleta | Aprire la scheda: ~5 click per atleta | **Golee** (G-64) |
| **Ricerca** | Globale ⌘K con sinonimi mappati, piu ricerca in ogni elenco | Ricerca per elenco, server-side (`?q=`) | **Golee** (G-65) |
| **Filtri** | Primo livello espliciti + «Altri filtri» + intervalli di date | Filtri per elenco, filtro sede montato **solo** con due o piu sedi | **Parita** — EasyGame vince sulla scelta di non mostrare cio che non serve |
| **Azioni di massa** | Operazione generica su **qualunque** campo, compresi i personalizzati | Azioni predefinite, con la regola che «Selezionati» non si interseca mai con i filtri | **Golee** sulla copertura, **EasyGame** sulla correttezza (G-27) |
| **Export** | CSV / Excel / PDF, gated dal piano | Solo PDF, per ambito, non gated | **Golee** (G-26) |
| **Feedback e stati** | Opzioni che dichiarano la conseguenza; stati che ammettono il problema («Email mancante», «Solo in Golee») | Stati derivati e mai impostabili; `describeProrationResult` traduce cinque esiti che prima dicevano tutti «Non applicato» | **Parita**, per motivi diversi |
| **Errori** | Validazione che **non si azzera** dopo la correzione; normalizzazione silenziosa dei nomi | Errori di dominio con il motivo; nessun messaggio del database esce (verificato) — **tranne** `/api/v1/attachments/:id` (SW-12) | **EasyGame** |
| **Velocita percepita** | Non misurabile (2 anagrafiche) | Misurata: elenco paginato 14,9 kB / 35 ms su 223 atleti; avatar 23,7 MB → 140 kB | **EasyGame**, con l'avvertenza che il confronto non e alla pari |
| **Densita e tabelle larghe** | Vista «Personalizzata» con oltre 35 colonne, nessuna colonna nome bloccata osservata | Colonne configurabili; tabelle che scorrono nel **proprio** contenitore | **EasyGame** |
| **Responsive a 375 px** | Sidebar collassa, ma **25 colonne restano**: si consulta, non si lavora | Verificata su ogni area, `scrollWidth` mai oltre la viewport, dialoghi provati a 375 e 768 | **EasyGame** |
| **Scopribilita** | `/quick-actions` nomina i **lavori**, non i moduli; ma tre posti chiamati «documenti» | Navigazione per modulo; nessuna pagina di azioni per compito | **Pari**: Golee vince sulle azioni rapide (G-66), EasyGame sulla tassonomia |
| **Attrito di ingresso** | Schermata di avvio in 13 sezioni, +1 click ogni volta | Empty state che non blocca | **EasyGame** |
| **Rumore commerciale** | ~130 px su 678, cioe ~20% | Zero | **EasyGame** |
| **Condivisibilita** | **Nessun deep link** alla scheda | Ogni scheda ha il suo indirizzo | **EasyGame** |
| **Accessibilita** | Albero semantico pulito, tastiera funzionante | 0 controlli senza nome su 660, 0 campi senza etichetta, dialoghi con `aria-*` | **Parita** |

> **La sintesi onesta.** EasyGame e piu **corretto**; Golee e piu **veloce da
> usare**. Sono due qualita diverse e chi lavora in segreteria sente prima la
> seconda. Cinque dei dieci quick win del §19 servono a chiudere proprio questo
> scarto, e nessuno di essi tocca il modello dati.

---

## 11 — Permessi: confronto approfondito

| Ambito | Golee | EasyGame | Verdetto |
|---|---|---|---|
| **read** | ~90 chiavi `risorsa:area:azione`, con `read` distinto ovunque | `canAccessClubResource(role, resource, "read")` per risorsa, whitelist esplicita per il trainer | **GOLEE BETTER** sulla granularita |
| **write** | `write` separato da `create` e `delete` sui moduli | `create` / `update` / `delete` distinti nella matrice risorse | **PARITY** |
| **delete** | Separato solo dove serve | Separato; risorse admin-only per 7 tabelle sensibili | **PARITY** |
| **financial** | `financial:athlete:*` **!=** `financial:staff:*`, piu `passes:use` isolato e `receipts:bulk-generation` separato | `sport_work.read` / `read_own` / `pay` / `fiscal` separano i compensi dal resto; le quote restano dentro la matrice generale | **PARITY** — Golee e piu fine sulle ricevute, EasyGame e piu fine sui compensi |
| **documents** | `athlete:documents:*` e `staff:documents:*` separati da `upload` | Attachment Core con autorizzazione propria per `owner_type` | **PARITY** |
| **athletes** | Anagrafica, sportivo, note, calendario e criteri separati | Un solo permesso sulla risorsa `athletes` | **GOLEE BETTER** |
| **medical** | **`medical:read` != `medical-profile:read`**: certificato valido si, patologie no | Nessuna separazione: chi vede la scheda vede tutto | **GOLEE BETTER** — e il gap G-33, il piu importante di questa sezione |
| **staff** | Blocco simmetrico all'atleta | `/staff` dentro la matrice management | **GOLEE BETTER** |
| **reports** | `historical:financial:read` per i conti degli anni passati | Nessun permesso dedicato ai report | **GOLEE BETTER** |
| **payments** | Ricevute, fatture, prodotti, ingressi e compensi separati | Rimborso limitato a proprietario e gestore; incasso nella matrice generale | **PARITY** |
| **compensation** | `financial:compensations:{read,write}` | **Cinque** permessi con default negato, `read_own` predisposto, **ogni diniego tracciato** | **EASYGAME BETTER** |
| **settings** | `data-configuration`, `app:settings`, **`organization:change-season`** dedicato | `canManageClubConfiguration` = owner + club_manager; il cambio stagione non ha un permesso proprio | **GOLEE BETTER** su `change-season` |
| **Preset di ruolo** | **Non trovati.** ~90 caselle da comporre a mano | **7 ruoli canonici** con normalizzazione degli alias | **EASYGAME BETTER** — e la differenza fra un modello ottimo e uno usabile |
| **Ambito per gruppo/squadra** | **Incognita** del teardown | Allenatore su `groupIds`; senza dichiarazione segue tutte le squadre delle sue categorie | **EASYGAME BETTER** (per evidenza, non per certezza) |
| **Applicazione lato server** | **Non verificabile dall'esterno** | Server-side in `assertClubResourceAccess`, provato con 11 tentativi IDOR | **EASYGAME BETTER** |
| **Audit dei dinieghi** | Non osservato | `audit_logs` su **tutti** i dinieghi, con permesso mancante, percorso e metodo | **EASYGAME BETTER** |
| **Piano vs permesso** | **Mescolati** | Separati, con il motivo del diniego a schermo | **EASYGAME BETTER** |

**Risposta alla domanda posta dal mandato — «EasyGame consente di delegare
correttamente senza esporre informazioni sensibili?»**

**Quasi.** Delegare a una segreteria funziona: il ruolo `collaborator` esiste,
non vede le risorse admin-only e non vede i compensi. Delegare a un **allenatore**
espone oggi il **dato clinico** insieme all'anagrafica, perche EasyGame non
distingue «il certificato e valido» da «l'atleta e celiaco». E l'unico punto in
cui il modello dei permessi di EasyGame **non regge** il confronto, ed e il
motivo per cui G-33 e P2 e non P3.

Il secondo punto e `organization:change-season`: in EasyGame il cambio di
stagione attiva e nella stessa autorizzazione di qualunque altra configurazione,
e ha conseguenze su tutto il gestionale. Va isolato insieme a G-01.

---

## 12 — Sport: analisi semantica del modello

Il mandato chiede di non presumere che «categoria» equivalga a «squadra».
Non lo e, in nessuno dei due prodotti — ma per motivi opposti.

| Concetto | Golee | EasyGame |
|---|---|---|
| **Categoria** | **Non esiste** come entita: e un campo (`Categoria`, `Tipo di categoria`) | Entita con anni di nascita (il secondo facoltativo), statistiche, compatibilita orientata |
| **Squadra** | **E il gruppo**, che contiene atleti **e** staff. Piatto, senza sede | **E il gruppo operativo**: la coppia (categoria, sede). Una categoria non si duplica: si **colloca** (ADR-0055) |
| **Roster** | L'appartenenza al gruppo | `athlete_category_memberships` con `is_primary` e `site_id` |
| **Staff della squadra** | Dentro il gruppo | `trainers.groupIds`; senza dichiarazione l'allenatore segue tutte le squadre delle sue categorie |
| **Multi-sede** | **Assente**: si duplicano i gruppi | Nativo, e il filtro compare **solo** con due o piu sedi |
| **Campionato** | Eventi di dominio nel client, **nessuna schermata raggiungibile** | Assente |
| **Gara** | Evento di tipo «Partita»/«Torneo» | `/matches` con calendario, luoghi, **convocazioni** e avvisi sui certificati |
| **Convocazione** | Invito all'evento (per gruppo o singolo) | `MatchConvocations`, entita dedicata |
| **Allenamento** | Evento di tipo «Allenamento» con ricorrenza | `/training` + **programma settimanale come oggetto** + generatore |
| **Presenza** | Da staff, da app o da QR; aggregata **per persona** con % e «nessuna risposta» | `training_attendance` + `AttendanceSheet`; aggregazione di club/categoria, **non per persona** |
| **Calendario** | **Un solo oggetto evento**, 5 viste, 5 filtri | Allenamenti e partite in due pagine separate |
| **Statistiche** | Criteri di valutazione configurabili + schede | Assenti |

**Le tre conclusioni che contano.**

1. **Il modello organizzativo di EasyGame e piu ricco e piu corretto di quello
   di Golee.** Categoria, sede, struttura e gruppo sono quattro cose distinte
   (ADR-0038); in Golee sono una sola, piatta, e la multi-sede si risolve
   duplicando. Questo e un vantaggio strutturale che **non va perso** nel
   chiudere i gap sportivi.

2. **Il modello di attivita di EasyGame e piu povero.** Golee ha **un** oggetto
   evento con capienza, coda, scadenze e RSVP; EasyGame ha due archivi (`trainings`,
   `matches`) senza capienza, senza coda, senza RSVP, senza vista calendario
   comune. La chiusura del gap (G-31) **non deve creare un terzo archivio**: e
   una vista sopra i due esistenti, piu i campi mancanti su di essi.

3. **Il buco che pesa di piu non e una funzione ma un ciclo**: nessuno chiede
   alla famiglia se ci sara. Senza RSVP (G-20) mancano insieme la colonna
   «nessuna risposta», i solleciti mirati e la ragione stessa per cui una
   famiglia apre l'applicazione. **E il gap sportivo con il valore piu alto.**

---

## 13 — Amministrazione

Confronto voce per voce, come richiesto dal mandato.

| Voce | Golee | EasyGame | Chi vince |
|---|---|---|---|
| **Quote** | Tariffe sul gruppo, rate con scadenze | Piani con servizi obbligatori e opzionali, rate a percentuale/fisso/saldo, **pro-rata** | **EasyGame** |
| **Incassi** | Modello `tranche` pulito, azioni condizionate | **Due tabelle**: la rata e un debito, l'incasso e un movimento. Stato derivato e non scrivibile | **EasyGame** |
| **Incasso parziale** | C'e, ma **perde lo sconto** | N movimenti per rata, anche con metodi diversi, sconto intatto | **EasyGame** |
| **Insoluti** | Vista finanziaria della lista + automazioni di sollecito | Report presente **con un difetto noto** sul totale incassato; nessun sollecito | **Golee** |
| **Pagamenti online** | Golee Pay 2% + 4 metodi, **non attivato in analisi** | Stripe Connect provider-agnostico, **collaudato in Sandbox**, rimborso provato a runtime | **EasyGame** sulla profondita provata, **Golee** sull'ampiezza dei metodi |
| **Rimborsi e storni** | Storno compensativo parziale, dialogo con importo stornabile | Storno compensativo + rimborso online con commissione restituita in proporzione, **provato** | **EasyGame** |
| **Riconciliazione** | Payout esposti, export dedicato | Riconciliazione **congelata sulla riga d'incasso** (lordo, fee di piattaforma, fee del PSP, netto) | **Parita** |
| **Voucher** | Metodo di incasso + 5 attestazioni. Nessun ciclo | Ciclo completo con cinque importi, maturazione dalle presenze, riconciliazione riga per riga | **EasyGame, largamente** |
| **Contributi da enti** | Idem: funziona solo se il beneficiario e la famiglia | Funziona anche quando il beneficiario e il club e quando il contributo matura sulla frequenza | **EasyGame, largamente** |
| **Prima nota** | Stampa cronologica | **Assente** | **Golee** |
| **Movimenti** | Transazioni, previste, giroconti | Movimenti, previsti, giroconti | **Parita** |
| **Sponsor** | Sezione del profilo | Anagrafica + **pagamenti sponsor** | **EasyGame** |
| **Compensi** | Documento con periodo di competenza e stato firma; calcola la fascia esente e avvisa ai 15.000 | Dominio completo: rapporti, piani, maturazione, motore contributivo versionato, registro append-only, agenda adempimenti | **EasyGame, largamente** |
| **Contributi previdenziali** | Campi «Contribuzione INPS», «Ritenute IRPEF» | Franchigia 5.000, riduzione 50%, aliquote per copertura, ripartizione 1/3–2/3, **con la fonte normativa accanto a ogni valore** | **EasyGame** |
| **Premi** | Non distinti | Dominio separato, trattamento fiscale **dichiarato** e non dedotto | **EasyGame** |
| **Rimborsi spese** | Voci Trasporto/Vitto/Alloggio/Viaggio + autocertificazione | Cinque categorie, ciclo bozza → presentato → approvato → liquidato, non concorrono a nessuna soglia | **EasyGame** |
| **Fatturazione elettronica** | **Operativa** via Aruba, stati SDI notificati | Tracciato generato e validato, **mai trasmesso** | **Golee** |
| **Documentazione fiscale della famiglia (730)** | 4 varianti con importo calcolato | **Assente** | **Golee** |
| **Rendiconto e IVA** | Rendiconto per causale + saldo IVA **per cassa** | Assenti | **Golee** |

> **Dove EasyGame ha gia superato Golee, e va detto senza attenuazioni:**
> il modello del denaro (rata/incasso separati e stato derivato), l'incasso
> parziale che non rompe lo sconto, la numerazione dei documenti,
> **il ciclo dei contributi da enti** e **l'intero dominio del lavoro sportivo**.
> Sono cinque aree in cui il concorrente non e indietro di una funzione: e
> indietro di un modello.
>
> **Dove EasyGame e indietro, e altrettanto netto:** la contabilita non arriva
> mai a un documento. Prima nota, rendiconto per causale, estratto conto, saldo
> IVA e 730 sono **cinque assenze che il commercialista di ogni club nota il
> primo anno**. Tutte e cinque poggiano sullo stesso mattone mancante: la
> **causale con i flag fiscali** (G-09), che e una `S`.

---

## 14 — Documenti

| Voce | Golee | EasyGame | Chi vince |
|---|---|---|---|
| **Archivio** | Cartelle configurabili, documenti sulla persona | Attachment Core con driver, autorizzazione propria, tipi chiusi, sandbox CSP | **EasyGame** |
| **Upload** | Presente | Provato su 7 combinazioni di proprietario e categoria, rilettura byte per byte | **EasyGame** |
| **Preview** | «Visualizza anteprima» prima della generazione | «Visualizza» apre davvero (4 invarianti + verifica delle intestazioni) | **Parita** |
| **PDF** | Generazione lato prodotto, stampa massiva | Generazione client-side per elenchi e ordini; documenti fiscali stampabili con il marchio | **Golee** sulla copertura |
| **Certificati** | Campo + automazioni a 60/30 giorni | Modello dedicato con stato, avvisi in dashboard e in convocazione; **promemoria da invocare a mano** | **Parita** — EasyGame ha il dominio, Golee ha l'automazione |
| **Contratti** | 6 modelli Co.Co.Co. pronti, 2 condivisi dalla FIGC | Rapporto di lavoro completo, **nessun contratto da generare** | **Golee** |
| **Scadenze** | Automazioni per certificato, tesseramento, documento d'identita, BLSD | Scadenze presenti sui dati, **nessuna automazione** | **Golee** |
| **Allegati** | Multipli, per persona e per post | Attachment Core, riferimento `attachment:<uuid>` nel record | **EasyGame** |
| **Modulistica** | Moduli di iscrizione + libreria di stampa, due generazioni vive | Form builder con 12 tipi, **versioni immutabili**, coda, duplicati, ciclo pubblico provato a runtime | **EasyGame** |
| **OCR** | **Assente** | Locale, MRZ, il file non lascia il browser | **EasyGame** |
| **Storico** | Documenti sulla persona, `historical:*:read` | Allegati con autore e data; audit sui documenti | **Parita** |
| **Bulk** | Stampa massiva + generazione massiva di ricevute | **Assenti** | **Golee** |
| **Firma** | Ciclo completo fino al `.p7m`, con notifica | Firma grafica nel modulo online; **nessun ciclo sul documento** | **Golee** |
| **Libreria di modelli** | **77**, mantenuti e regionalizzati | **0** | **Golee, largamente** |

> **Il fossato di Golee e qui, ed e onesto dirlo: non e software.** Trenta
> modelli di richiesta visita medica aggiornati per regione e per ASL sono
> **lavoro editoriale continuo**. EasyGame puo costruire il motore (G-14, G-15,
> G-43) in una wave; **il catalogo e un impegno redazionale permanente**, e va
> deciso come tale — con una persona, non con uno sprint.

---

## 15 — Reporting

| Voce | Golee | EasyGame |
|---|---|---|
| **Dashboard** | «Stato del tuo account» su 3 assi, flussi di cassa, visite mediche per stato, calendario del giorno, note | Avvisi certificati, scadenze, panoramica; **legge l'archivio atleti quattro volte** (debito registrato) |
| **KPI** | Incassato, residuo, pagato, bilancio, previsionale, saldo iniziale e finale | Totale dovuto, pagato, in attesa, scaduto — **con il «pagato» che conta le rate, non il denaro** |
| **Report** | Bilancio + 4 stampe contabili | 4 sezioni: categorie, presenze, gare/convocazioni, pagamenti |
| **Statistiche** | Criteri di valutazione, % presenza per persona | Statistiche atleti per categoria |
| **PDF** | 4 stampe contabili + stampa massiva | Export PDF delle anagrafiche per ambito, ordine fornitore |
| **CSV** | Export tabelle CSV/Excel/PDF (gated) | Solo riconciliazione bandi e dataset F24/CU |
| **Export** | Su ogni tabella | Su due percorsi |
| **Report economici** | Prima nota, rendiconto per causale, estratto conto, IVA per cassa | Assenti |
| **Report sportivi** | Presenze per persona con % e «nessuna risposta» | Presenze aggregate di club/categoria |
| **Presenze** | Per persona e per evento, con filtri e export | Aggregate |
| **Insoluti** | Vista finanziaria + automazioni | Sezione del report, **con il difetto noto** |

**Il debito tecnico di `/reports` registrato in [16](16-technical-debt.md),
verificato durante questo audit e ancora aperto:**

> `calculatePaymentReport` in `src/lib/club-report-utils.ts` somma l'importo
> **dovuto** di ogni rata risultata saldata, e **zero** per una rata incassata a
> meta. Sui dati del Full Club UAT — 329,80 EUR dovuti, 250,00 EUR incassati —
> `/movements` dice 250,00 e `/reports` dice 179,80. **Due pagine dello stesso
> prodotto rispondono in modo diverso alla stessa domanda.**
> Il campo `collectedAmount` arriva gia sul movimento: manca solo di sommarlo.

Questo e **G-19**, ed e nella lista pre-produzione al §20. Non e stato corretto:
questo documento e un audit.

Le altre due voci aperte su `/reports`: **nessun export strutturato** (G-54) e
**nessun report economico per causale** (G-11).

---

## 16 — Mobile: sola analisi

> Come da mandato: **solo analisi**. Nessuna UAT Parent / Trainer / Collaborator
> e stata avviata.

| Aspetto | Golee | EasyGame |
|---|---|---|
| **Gestionale da telefono** | Mobile-first: dialoghi a bottom sheet, sidebar collassabile — ma **a 375 px la tabella mantiene 25 colonne**. «Usabile per consultare, molto meno per lavorare» | Web responsive **verificata** a 375/768/1280/1440 su ogni area, tabelle che scorrono nel proprio contenitore, dialoghi provati |
| **App per la famiglia** | Prodotto separato, **mai osservato** dal teardown. Il gestionale dichiara cosa espone: calendario, pagamenti, documenti, RSVP, QR, pacchetti, modifica dati con tre interruttori | **Assente.** L'area genitore e web (`/parent-view` + 9 sottopagine + API dedicate) |
| **App per l'allenatore** | Presumibilmente la stessa app, non osservata | Expo, **incompleta**, sola area allenatore, **sviluppo differito** (ADR-0025) |
| **Push** | Presenti (le automazioni le nominano) | **Assenti** |
| **Tessera digitale / QR** | Scheda dedicata nelle impostazioni app | Assente; il generatore QR esiste nel repository ed e orfano |

**La conclusione dell'analisi, senza raccomandare sviluppo mobile.**

Il gap non e «manca un'app». Il gap e che **manca il canale**: senza account
della famiglia con un ciclo di vita (G-18), senza RSVP (G-20) e senza
comunicazione massiva (G-07), un'app non avrebbe niente da mostrare che
`/parent-view` non mostri gia. **L'ordine corretto e canale prima, contenitore
poi** — ed e coerente con ADR-0025, che differisce il mobile e non il canale.

---

## 17 — Competitive scorecard

Punteggio 1–10 per asse. **Non favorisce EasyGame**: dove il teardown non ha
potuto misurare Golee, il punteggio di Golee e stato tenuto in mezzo e la nota
lo dichiara.

| # | Asse | Golee | EasyGame | Motivazione |
|---|---|---|---|---|
| 1 | **Account / onboarding** | **8** | **7** | Golee: 5 stati dell'account app, link di invito, tutorial guidato. EasyGame: multi-club e multi-ruolo (che Golee non mostra), onboarding riprendibile, ma **nessun ciclo di vita dell'account famiglia** |
| 2 | **Anagrafiche** | **9** | **7** | Golee: 7 viste, modifica in linea, ~60 campi, campi personalizzati, modifica di massa su qualunque campo. EasyGame: CF+ISTAT+CAP, OCR, import verificabile, multi-categoria — ma nessun campo personalizzato e nessuna vista salvata |
| 3 | **Organizzazione** | **5** | **8** | Golee non ha categoria, sede, struttura ne programma settimanale. EasyGame ha tutti e quattro, piu il riporto di stagione. Perde 2 punti sulla riconferma dei tesserati (G-01) |
| 4 | **Sport** | **8** | **6** | Golee: evento unico, capienza, coda, RSVP, presenze per persona con %, QR, criteri di valutazione. EasyGame: programma settimanale, convocazioni, numerazione maglie, alert trainer — ma **nessun RSVP e nessun calendario unico** |
| 5 | **Pagamenti** | **8** | **8** | Golee: 4 metodi, link di pagamento, rateizzazione al consumatore, movimento automatico della commissione — **ma perde lo sconto sull'incasso parziale**. EasyGame: modello piu corretto, rimborsi collaudati, commissione congelata — ma nessun link da inviare e nessun pagamento nel modulo |
| 6 | **Amministrazione** | **8** | **6** | Golee: prima nota, rendiconto, estratto conto, IVA per cassa, causali fiscali, fornitori, SdI operativo. EasyGame: contributi da enti (che Golee non ha), profilo fiscale, numerazione — **ma la contabilita non arriva a un documento** |
| 7 | **Lavoro sportivo** | **5** | **9** | Golee calcola e documenta. EasyGame ha un dominio intero, versionato per anno, con registro append-only e agenda degli adempimenti, provato a runtime. Perde 1 punto sui contratti da generare |
| 8 | **Documenti** | **9** | **5** | 77 modelli mantenuti e regionalizzati, arricchimento finanziario, stampa massiva, ciclo di firma fino al p7m. EasyGame ha il motore e l'archivio ma **zero catalogo** |
| 9 | **Comunicazione** | **9** | **3** | 34 automazioni, 18 segnaposto, bacheca, invio massivo, solleciti mirati. EasyGame ha notifiche e email transazionali, e **nessun canale verso le famiglie** |
| 10 | **Reporting** | **8** | **5** | Golee: bilancio con flusso di cassa, 4 stampe contabili, export su ogni tabella. EasyGame: 4 sezioni di report, **una con un difetto noto**, export quasi assente |
| 11 | **Permessi** | **8** | **6** | Golee: ~90 chiavi con separazioni non ovvie, ma **nessun preset** e piano mescolato ai permessi. EasyGame: 7 ruoli usabili, audit dei dinieghi, isolamento provato — ma **il dato clinico non e separato** |
| 12 | **UX** | **8** | **7** | Golee: 4 click per un'anagrafica, viste per compito, azioni per lavoro. EasyGame: responsivita verificata, deep link, nessun rumore commerciale — ma nessuna ricerca globale e due sistemi di toast |
| 13 | **Performance** | **6** | **8** | Golee **non misurabile** (2 anagrafiche): punteggio tenuto in mezzo, non a sfavore. EasyGame misurato su 223 atleti, con due elenchi non paginati dichiarati (P-5, SW-11) |
| 14 | **Mobile** | **7** | **4** | Golee ha un'app per la famiglia (non osservata) e un gestionale mobile-first che pero non rende le tabelle. EasyGame ha web responsive verificata e **nessuna app usabile** |
| 15 | **Automazioni** | **9** | **4** | Golee: 34 automazioni piu 11 automatismi fuori dal pannello. EasyGame: derivazioni forti (stati, maturazioni, idempotenza) ma **un solo cron in esercizio** |

### Totali

```
GOLEE:     115 / 150
EASYGAME:   93 / 150
```

**Distanza: 22 punti su 150.** Concentrata in **quattro assi** — comunicazione
(−6), documenti (−4), automazioni (−5), reporting (−3): **diciotto dei
ventidue punti** stanno li. Sui restanti undici assi la distanza netta e di
quattro punti, e su tre assi (organizzazione, lavoro sportivo, performance)
EasyGame e avanti di **nove punti complessivi**.

> **Come leggere questo risultato.** EasyGame non e indietro «in generale»: e
> indietro **in un quadrante preciso** — cio che il gestionale *manda fuori*
> (messaggi, documenti, report) e cio che fa *da solo* (automazioni). Su cio che
> il gestionale *sa* (modello dei dati, denaro, contributi, lavoro sportivo,
> organizzazione) e davanti. E una distanza costruibile in tre wave, e nessuna
> delle tre richiede di riscrivere un modello.

---

## 18 — TOP 10 gap EasyGame

Ordinati per **valore reale**, non per facilita.

| # | ID | Gap | Perche e primo | Pri | Rel. | Eff. |
|---|---|---|---|---|---|---|
| 1 | **G-01** | Riconferma dei tesserati e ricomposizione delle squadre alla nuova stagione | E l'unico gap che **rompe un anno di lavoro il 1° luglio**. Il riporto copia la configurazione ma non le appartenenze | P0 | PRE-PROD | M |
| 2 | **G-03** | Motore di automazioni sulle scadenze | E la funzione che elimina piu lavoro manuale, in entrambi i prodotti. Golee ci monetizza sopra, e non per caso | P1 | V1.1 | L |
| 3 | **G-07** | Comunicazione massiva alle famiglie con destinatari segmentati | Senza, la segreteria apre WhatsApp e il dato esce dal gestionale | P1 | V1.1 | L |
| 4 | **G-14 + G-15** | Libreria di modelli compilati dai dati del gestionale | Il club non vuole un editor: vuole il documento gia scritto e con la cifra giusta | P1 | V1.1 | L |
| 5 | **G-09 → G-13** | La catena fiscale: causale con flag → prima nota → rendiconto → 730 | Cinque assenze che poggiano su **un mattone da `S`**. Il commercialista le nota il primo anno | P1 | V1.1 | M |
| 6 | **G-19** | Il report Pagamenti dice un «Incassato» sbagliato | Non e una funzione mancante: e **un numero errato mostrato al cliente**, in contraddizione con un'altra pagina dello stesso prodotto | P1 | PRE-PROD | S |
| 7 | **G-20** | RSVP della famiglia sull'evento | E la ragione per cui una famiglia apre l'applicazione. Senza, il canale digitale non ha contenuto | P1 | V1.1 | M |
| 8 | **G-18** | Account della famiglia con ciclo di vita | Prerequisito di 3, 7 e di qualunque mobile futuro. Oggi non si sa quante famiglie siano raggiungibili | P1 | V1.1 | M |
| 9 | **G-33** | Permesso separato sul dato clinico | **L'unico punto in cui i permessi di EasyGame non reggono il confronto**, e riguarda dati sanitari di minori | P2 | V1.1 | M |
| 10 | **G-21** | Scheduler applicativo generale | Tre funzioni **gia scritte** non girano perche nessuno le chiama. Costo: una voce in `vercel.json` per ciascuna | P1 | PRE-PROD | S |

*Fuori dai primi dieci ma subito dopo:* G-24 (campi personalizzati), G-26
(export CSV), G-38 (pacchetti e carnet — l'unico `XL` che apre un mercato
nuovo), G-47/G-48/G-49 (governance associativa).

---

## 19 — TOP 10 quick win

Interventi piccoli con effetto sensibile. **Nessuno tocca il modello dati.**

| # | Quick win | Effetto | Riuso | Eff. |
|---|---|---|---|---|
| 1 | **Correggere `calculatePaymentReport`** perche sommi `collectedAmount` (G-19) | Toglie una contraddizione visibile fra due pagine | `summarizeClubMovements` fa gia esattamente questo | S |
| 2 | **Aggiungere i cron mancanti in `vercel.json`** (promemoria certificati, manutenzione, generazione allenamenti) (G-21) | Tre funzioni gia scritte cominciano a girare | pattern di `sport-work/scheduler`, gia collaudato | S |
| 3 | **Export CSV degli elenchi** accanto al PDF (G-26) | Il dato del cliente esce dal prodotto | `person-export.ts` ha gia colonne e ambiti | S |
| 4 | **Viste di elenco per compito** su Atleti (Anagrafica / Medica / Finanziaria / Sportiva / Documento) (G-25) | Elimina la costruzione di un filtro per ogni lavoro ricorrente | il filtro colonne esiste gia: servono cinque preset | S |
| 5 | **Modifica in linea della scadenza del certificato** dalla riga dell'elenco (G-64) | Da ~5 click a 1-2 per atleta sul lavoro piu ripetitivo dell'anno | la PATCH esiste | S |
| 6 | **Colonne contatto del tutore** nell'elenco atleti (telefono e email, tutore 1 e 2) | Permette di filtrare ed esportare i contatti della famiglia senza aprire le schede | `athlete-guardians.ts` li risolve gia | S |
| 7 | **«Email mancante» come filtro di prima classe** su atleti e tutori | E il prerequisito di ogni canale digitale, e oggi non e misurabile | filtri esistenti | S |
| 8 | **Firma e timbro del presidente** sul club, letti dai documenti generati (G-51) | Sblocca la generazione di documenti che oggi vanno firmati a mano | `/organization` + Attachment Core | S |
| 9 | **Controllo duplicati alla creazione manuale di un'anagrafica** (G-67) | La stessa protezione che esiste gia in approvazione modulo, applicata dove i duplicati nascono davvero | il controllo esiste: va **riusato**, non riscritto | S |
| 10 | **Modello «Attestazione di pagamento e frequenza»** con gli importi presi dal gestionale | Un solo documento, ma e **quello che ogni famiglia chiede** per i bandi. Prova sul campo il motore di G-15 | `DocumentEditor` + `payment_transactions` + `funding` | S |

*Due quick win aggiuntivi identificati, fuori dai primi dieci:* pagina di
**azioni rapide per compito** (G-66) e **unificazione dei due sistemi di toast**
(G-69, gia WP-14 `READY`).

---

## 20 — Pre-production gap list

**Deliberatamente corta.** Non ogni differenza con Golee e un blocker: qui c'e
**solo** cio che deve esistere prima di consegnare EasyGame a un cliente
pagante. Tutto il resto e V1.1 o POST-V1.

| # | ID | Cosa | Perche e pre-produzione |
|---|---|---|---|
| **PP-1** | **G-01** | Riconferma dei tesserati e ricomposizione delle squadre alla nuova stagione | Il primo cambio di stagione di un cliente vero lascia ogni atleta senza categoria. **Non e un disagio: e la perdita dell'organizzazione sportiva del club** |
| **PP-2** | **G-19** | Il report Pagamenti deve dire il denaro incassato, non le rate saldate | Un cliente pagante legge un dato economico **sbagliato**, e in contraddizione con un'altra pagina dello stesso prodotto |
| **PP-3** | **G-21** | I cron mancanti | Tre funzioni presenti nel prodotto (promemoria certificati, manutenzione, generazione allenamenti) **non girano**. Il cliente crede che il gestionale lo avvisi, e non succede nulla |
| **PP-4** | — | **Sollecito degli insoluti verso le famiglie**, anche solo massivo e manuale | E la prima cosa che una segreteria chiede a un gestionale. Senza, il cliente torna a Excel e a WhatsApp la prima settimana. E il sottoinsieme minimo di G-07 |
| **PP-5** | — | **Attestazione di pagamento e frequenza** (un modello, con gli importi dal gestionale) | Adempimento che ogni famiglia chiede ogni anno per i bandi. Oggi il club lo scrive a mano. E il sottoinsieme minimo di G-15 |
| **PP-6** | **G-26** | Export CSV degli elenchi | Il dato di un cliente pagante deve poter uscire dal prodotto. E anche una condizione di fiducia commerciale |

**Restano validi i blocker esterni gia dichiarati** in
[23](23-v1-release-matrix.md) e **non ripetuti qui**: X-1 (ambiente di
produzione), X-2 (variabili sul target Preview), X-6
(`EASYGAME_MAINTENANCE_TOKEN`).

**Cosa NON e pre-produzione**, e va detto: la libreria dei 77 modelli, le 34
automazioni, la bacheca, i pacchetti, la governance associativa, i tesseramenti
federali, la prima nota e il saldo IVA. Sono tutte cose che rendono EasyGame
**competitivo**; nessuna impedisce a una societa di lavorarci.

---

## 21 — Difetti e rischi trovati durante l'audit

**Registrati, non corretti**, come da mandato §29.

| # | Cosa | Dove | Gravita | Stato |
|---|---|---|---|---|
| **AU-1** | **Il riporto di stagione non riporta le appartenenze degli atleti.** `SEASON_ROLLOVER_TYPES` copia categorie, sconti, piani, gruppi operativi, gruppi numerazione, programma e previsionale; `athlete_category_memberships` **non e nell'elenco** e non e nemmeno fra i tipi season-scoped. Dopo un riporto le categorie nuove hanno id nuovi, e le appartenenze continuano a puntare a quelle archiviate | `src/lib/club-seasons.ts` (`SEASON_ROLLOVER_TYPES`), `src/lib/server/seasons.ts` | **ALTA** | **Dedotto dalla lettura del codice, non provato a runtime.** Va verificato con un riporto reale prima di dimensionare G-01 |
| **AU-2** | **Due letture diverse del denaro incassato in due pagine.** `/movements` usa `summarizeClubMovements` (cassa, corretto); `/reports` usa `calculatePaymentReport` (stato della rata, sbagliato) | `src/lib/club-report-utils.ts:477` | **MEDIA** | Gia registrato in [16](16-technical-debt.md) da RC Fix 3. Confermato ancora aperto |
| **AU-3** | **`src/lib/qr-code-utils.ts` non e referenziato da nessun file del repository** | `src/lib/qr-code-utils.ts` | BASSA | **NUOVO.** Codice morto; diventerebbe utile con G-72 |
| **AU-4** | **`AttendanceConfirmation.tsx` non e referenziato** | `src/components/` | BASSA | Gia in [11](11-capabilities.md) come `LEGACY/REVIEW`. Confermato: e il punto di partenza di G-20 |
| **AU-5** | **Due elenchi diversi dei documenti di un atleta**: `shared-documents` (con stati, verso la famiglia) e gli allegati di categoria su Attachment Core | `src/lib/shared-documents.ts` vs `src/lib/server/attachments.ts` | MEDIA | **NUOVO.** Da unificare **prima** di costruire il ciclo di firma (G-42), non dopo |
| **AU-6** | **Cinque archivi di persona** (`athletes`, `trainers`, `staff_members`, `members`, `sport_work_people`), di cui uno solo e un Person Core | schema | MEDIA | **NUOVO** come osservazione di insieme. E il gap G-56 visto dall'altro lato |
| **AU-7** | **Il cambio di stagione attiva non ha un permesso dedicato**: chi puo modificare la configurazione del club puo cambiare stagione, con conseguenze su tutto il gestionale | `src/lib/access-roles.ts`, `canManageClubConfiguration` | MEDIA | **NUOVO.** Golee ha `organization:change-season` come permesso a se. Da valutare insieme a G-01 |
| **AU-8** | **`/api/v1/attachments/:id` fa uscire il messaggio dell'ORM** su identificativo non-UUID | route allegati | MEDIA | Gia SW-12. Confermato aperto |
| **AU-9** | **Discrepanza fra KB e codice sul collaudo del checkout online.** [11](11-capabilities.md) dice «Pagare una rata online: **Da collaudare**»; [23](23-v1-release-matrix.md) E-10 dice «**Collaudato contro Stripe**, Sandbox Cedi Soft, 2026-08-27» con il dettaglio del giro | `11-capabilities.md` §«Pagamenti online e fiscalita dopo il Blocco D» | BASSA | **NUOVO.** La 23 e piu recente e piu dettagliata. **La 11 va allineata**: non e stato fatto qui perche questo commit e un audit |

---

## 22 — Roadmap per wave

**Cinque wave.** Non sono state forzate a cinque: quattro lasciavano insieme
cose che non si sviluppano insieme, sei separavano cose che condividono lo
stesso mattone.

> **NESSUNA WAVE E STATA IMPLEMENTATA.** Quanto segue e una proposta che
> attende approvazione.

Regola trasversale a tutte le wave: **si estende un dominio esistente, non se ne
crea un secondo.** Ogni workstream dichiara quale.

---

### WAVE 1 — «Il passaggio di stagione, e la cassa che dice il vero»

**Obiettivo**
Rendere EasyGame consegnabile a un cliente pagante: sopravvivere al primo cambio
di stagione, mostrare numeri economici veri, e far girare le funzioni che il
prodotto gia contiene.

**Gap chiusi**
G-01, G-19, G-21, piu i sottoinsiemi minimi PP-4 e PP-5, piu G-26 e G-51.

**Cosa sviluppiamo**
1. **Riconferma dei tesserati alla nuova stagione**: contatore dei non
   confermati, riconferma singola e massiva, e riporto delle appartenenze
   (atleta → categoria → sede) sulle categorie **appena copiate**, usando la
   rimappatura `rolloverSourceId` che il riporto gia produce.
2. **Permesso dedicato al cambio di stagione attiva** (AU-7).
3. **`calculatePaymentReport` che somma `collectedAmount`**, con `totalPending`
   e `totalOverdue` che ne ripartiscono il residuo.
4. **Tre voci `crons` in `vercel.json`** piu il segreto di manutenzione.
5. **Sollecito insoluti massivo e manuale**: selezione degli atleti con residuo,
   anteprima dei destinatari, invio email con il riepilogo della posizione.
6. **Modello «Attestazione di pagamento e frequenza»** con gli importi presi da
   `payment_transactions` e dalla frequenza gia misurata dal dominio contributi.
7. **Export CSV** accanto al PDF su atleti, allenatori, staff e soci.
8. **Firma e timbro del presidente** sul club, usati dal modello del punto 6.

**Cosa EasyGame possiede gia e riutilizziamo**
`runClubSeasonRollover` e la rimappatura dei riferimenti · `athlete_category_memberships`
· `summarizeClubMovements` (la formula corretta esiste) · il pattern di
`sport-work/scheduler` (cron autenticato e idempotente) · `email-service` e
`Notification` · `person-export.ts` · `DocumentEditor` e i suoi segnaposto ·
Attachment Core · la misura della frequenza del dominio contributi.

**Cosa NON copiamo da Golee**
La schermata di avvio obbligatoria (N-04). La riconferma di Golee **azzera anche
il denaro**: EasyGame riconferma le persone e **non tocca** rate e incassi, che
appartengono gia alla loro stagione.

**NO ACTION — analizzate e gia risolte da EasyGame**
Riporto della configurazione (C-020, gia superiore) · modello del denaro
(C-074/075/077) · numerazione dei documenti (C-097) · deep link (C-158) ·
responsivita (C-159).

**Workstream paralleli**

| WS | Contenuto | Tocca |
|---|---|---|
| **1A** | Riconferma tesserati + appartenenze + permesso stagione | `seasons.ts`, `club-seasons.ts`, `access-roles.ts` |
| **1B** | Correzione del report + export CSV | `club-report-utils.ts`, `person-export.ts` |
| **1C** | Cron e segreti | `vercel.json`, ambienti |
| **1D** | Sollecito insoluti + attestazione + firma presidente | `email-service`, `DocumentEditor`, `/organization` |

**Dipendenze** — 1A, 1B e 1C sono **indipendenti** e si sviluppano in parallelo.
1D dipende da 1C solo se il sollecito deve essere schedulato: nella Wave 1 e
**manuale**, quindi non dipende da nulla.

**Risultato utente**
Un club passa alla stagione 2027/28 e ritrova le sue squadre. Il report dice il
denaro che e entrato. I promemoria dei certificati partono da soli. La segreteria
manda i solleciti dal gestionale e stampa le attestazioni per i bandi.

**UAT** — Su un club con due stagioni e 200 atleti: riporto, riconferma di 180 e
non riconferma di 20, verifica che i 180 abbiano categoria e sede nella stagione
nuova e i 20 no; confronto `/movements` e `/reports` sullo stesso periodo (devono
dire lo stesso numero); esecuzione dei tre cron con verifica di idempotenza;
invio di un sollecito a 10 famiglie con conferma di ricezione; generazione di
un'attestazione e confronto degli importi con la scheda dell'atleta.

**Effort: M** · **Rischio: MEDIUM** (1A tocca il riporto, che e idempotente ma
centrale: serve una prova su copia dell'archivio prima di toccare un club vero)

---

### WAVE 2 — «Parlare con le famiglie»

**Obiettivo**
Dare a EasyGame il canale che oggi non ha: comunicazioni verso le famiglie,
avvisi automatici sulle scadenze, e un posto dove le famiglie rispondono.

**Gap chiusi** — G-03, G-04, G-05, G-06, G-07, G-08, G-18, G-20, G-58, G-53
(parte), G-35 (parte).

**Cosa sviluppiamo**
1. **Motore di automazioni**: un catalogo di regole (rata scaduta, rata in
   scadenza, certificato in scadenza e scaduto, documento in scadenza,
   tesseramento, compleanno), ciascuna con interruttore, **fino a tre anticipi**,
   destinatario (societa / famiglia) e scelta fra notifica singola e riepilogo
   giornaliero.
2. **Contenuto del messaggio con segnaposto**, riusando il catalogo di
   `DocumentEditor` esteso agli importi e alle scadenze.
3. **Link di pagamento firmato e a scadenza** da includere nel sollecito.
4. **Invio massivo segmentato**: destinatari per gruppo operativo, categoria,
   sede, stato dell'iscrizione o stato del certificato; anteprima del pubblico
   prima dell'invio; registro di cosa e stato mandato a chi.
5. **Bacheca**: post con allegati, destinatari per ruolo e per gruppo, bozza e
   pubblicato, notifica alla pubblicazione.
6. **Account della famiglia con ciclo di vita**: invito, stati (attivo, invitato,
   email mancante, disallineato), revoca, riallineamento dell'email.
7. **RSVP sull'evento**: la famiglia conferma o disdice dall'area genitore, con
   scadenza di conferma; l'allenatore vede **chi non ha risposto**.

**Cosa EasyGame possiede gia e riutilizziamo**
`Notification` e `email-service` (**unico punto di invio**, CLAUDE.md §2) ·
`audit_logs` · il pattern del cron di Sport Work · i gruppi operativi come
definizione naturale del pubblico · `athlete-guardians.ts` · `training_attendance`
· `AttendanceConfirmation.tsx` (da verificare, non da riscrivere) · Attachment
Core per gli allegati della bacheca · `parent-dashboard`.

**Cosa NON copiamo da Golee**
La **telemetria** (N-01): nessun tracciamento di terze parti sulle comunicazioni.
Il **gating per piano** delle automazioni: se diventeranno un servizio a
pagamento, passeranno dal catalogo entitlement (che dice il motivo), non da
`isProTab`. E non copiamo la **matrice di 34 automazioni**: se ne aprono sei,
quelle che una segreteria italiana controlla davvero, e si crescera per domanda.

**NO ACTION**
Mittente personalizzato (C-135, gia risolto da SMTP configurabile) · promemoria
interni verso lo staff (C-139, gia superiore) · notifiche in-app (C-129).

**Workstream paralleli**

| WS | Contenuto | Dipende da |
|---|---|---|
| **2A** | Motore di automazioni + anticipi + aggregazione + cron | Wave 1C |
| **2B** | Segnaposto + link di pagamento firmato | — |
| **2C** | Invio massivo segmentato + registro degli invii | 2B per il contenuto |
| **2D** | Bacheca | — |
| **2E** | Account famiglia con ciclo di vita | — |
| **2F** | RSVP + «senza risposta» sull'appello | 2E per il canale |

**Dipendenze** — 2A dipende dai cron della Wave 1. 2C e 2F dipendono da 2B e 2E
per contenuto e destinatari. 2D e completamente indipendente.

**Risultato utente**
Il club smette di usare WhatsApp. La famiglia riceve il sollecito con dentro il
link per pagare, conferma la presenza all'amichevole di sabato, e legge in
bacheca la comunicazione sulla chiusura natalizia. La segreteria vede quante
famiglie sono raggiungibili e quante no.

**UAT** — Sei automazioni accese su un club con 200 atleti e scadenze finte
sparse: verifica che ciascuna parta al giorno giusto, **una volta sola** su due
esecuzioni; invio massivo a un gruppo operativo con anteprima del pubblico e
confronto con l'elenco atteso; pubblicazione di un post con allegato e verifica
che lo veda solo il gruppo destinatario; invito di due famiglie, una con email e
una senza; RSVP di dieci famiglie su un allenamento e verifica della colonna
«senza risposta» sull'appello.

**Effort: L** · **Rischio: MEDIUM** (l'invio massivo raggiunge persone reali: la
prova va fatta su un club di collaudo con indirizzi controllati, mai su dati veri)

---

### WAVE 3 — «Documenti che escono gia compilati»

**Obiettivo**
Il club smette di scrivere documenti a mano.

**Gap chiusi** — G-14, G-15, G-16, G-17, G-42, G-43, G-40, G-52, G-13 (parte
documentale), G-51 (completamento).

**Cosa sviluppiamo**
1. **Catalogo di modelli di piattaforma**, seminato per club e aggiornabile
   centralmente, distinto dai modelli **del club** che restano suoi.
2. **Segnaposto estesi** a pagamenti, contributi, compensi, tesseramento e
   frequenza — e un flag per modello «arricchisci con gli importi».
3. **Primo nucleo editoriale** — le sei famiglie che ogni club usa:
   attestazione di pagamento e frequenza; dichiarazione per il 730; contratto
   Co.Co.Co. sportivo (tecnico e atleta); richiesta di visita medica agonistica
   e non agonistica (generiche); autorizzazione al trasporto e liberatoria
   foto/video; domanda di ammissione a socio.
4. **Ciclo di firma del documento**: richiesta → in attesa → firmato, con
   notifica all'arrivo e file firmato scaricabile.
5. **Generazione massiva** di un documento per N persone, e **emissione massiva
   di ricevute**.
6. **Consenso come oggetto**: testo, allegato, stato per persona, revoca con
   notifica alla societa.
7. **Federazioni e firma del presidente** come dati del club letti dai modelli.

**Cosa EasyGame possiede gia e riutilizziamo**
`document_templates` e `DocumentEditor` · Attachment Core · `shared-documents`
(che ha gia gli stati: **da unificare prima**, vedi AU-5) · `fiscal-recipient.ts`
per l'intestatario · `fiscal-documents.ts` per l'emissione idempotente ·
`form_template_versions` come **precedente di come si versiona un contenuto** ·
`sport_work_relationships` per i campi del contratto.

**Cosa NON copiamo da Golee**
I **77 modelli in blocco**: si parte da sei famiglie e si cresce per domanda.
La **tassonomia con tre posti chiamati «documenti»** (N-07): il catalogo vive
dentro Modulistica. I **modelli regionalizzati per ASL** (G-44) non entrano in
questa wave: sono un impegno redazionale permanente e vanno decisi come tale.
Il servizio a pagamento «Documenti personalizzati» (N-09).

**NO ACTION**
Archivio allegati (C-123) · certificati medici (C-127) · modulistica online
(C-128) · documenti richiesti alla famiglia (C-124): tutti gia superiori.

**Workstream paralleli**

| WS | Contenuto | Dipende da |
|---|---|---|
| **3A** | Catalogo di piattaforma + segnaposto estesi + arricchimento importi | — |
| **3B** | **Unificazione `shared-documents` / Attachment Core** (AU-5) | — |
| **3C** | Ciclo di firma | 3B |
| **3D** | Generazione massiva + ricevute massive | 3A |
| **3E** | Consensi come oggetto | 3B |
| **3F** | Redazione dei sei modelli | 3A |

**Dipendenze** — **3B e il prerequisito nascosto**: costruire il ciclo di firma
su due archivi paralleli li renderebbe tre. Va fatto per primo. 3F e lavoro
redazionale e puo cominciare subito, in parallelo a tutto.

**Risultato utente**
La segreteria genera trenta richieste di visita medica in un gesto, manda la
dichiarazione per il 730 con l'importo giusto senza aprire Excel, chiede la firma
di un contratto Co.Co.Co. e vede quando arriva, e sa chi ha revocato il consenso
alle foto.

**UAT** — Generazione dei sei modelli su un atleta reale con confronto campo per
campo con la scheda; generazione massiva su 30 atleti con verifica di tutti e 30
i file; ciclo di firma completo su un contratto; revoca di un consenso con
verifica della notifica; emissione massiva di 50 ricevute con verifica della
numerazione (nessun buco, nessun duplicato).

**Effort: L** · **Rischio: MEDIUM** (3B tocca un archivio in uso: va fatto con
una migrazione additiva e una lettura che accetta entrambe le forme)

---

### WAVE 4 — «La contabilita arriva al documento»

**Obiettivo**
Quello che il commercialista chiede a settembre esce dal gestionale.

**Gap chiusi** — G-09, G-10, G-11, G-12, G-41, G-45, G-46, G-54, G-39, G-23
(quando l'intermediario esistera).

**Cosa sviluppiamo**
1. **Causale con i flag fiscali**: `deducibile` e `quota associativa`
   sull'operazione, piu regime IVA. **E il mattone di tutta la wave.**
2. **Prima nota**: registro cronologico su tutti i movimenti — incassi, uscite,
   giroconti, erogazioni del lavoro sportivo — con filtro per periodo e stampa.
3. **Rendiconto economico per voce di costo**, con export.
4. **Estratto conto** per conto corrente e periodo.
5. **Saldo IVA trimestrale per cassa** (per i club che lo dichiarano nel profilo
   fiscale).
6. **Libro soci** collegato alla quota associativa, con dimissione motivata.
7. **Fornitori e clienti**: anagrafica minima con i movimenti collegati.
8. **Export strutturato** di tutti i report.

**Cosa EasyGame possiede gia e riutilizziamo**
`fiscal_operation_types` (le colonne si aggiungono, la tabella esiste) ·
`transactions`, `payment_transactions` e `sport_work_outbound_transactions` —
**la prima nota e una lettura di tre registri esistenti, non un quarto registro**
· `organization_fiscal_profiles` per sapere quale regime · `bank_accounts` ·
`/soci` · il pattern CSV gia usato dalla riconciliazione dei bandi ·
`document_number_sequences`.

**Cosa NON copiamo da Golee**
La **fatturazione elettronica come add-on a pagamento** (N-09/N-10): EasyGame
genera gia il tracciato, e l'intermediario e una decisione contrattuale, non un
servizio da rivendere. E non copiamo il **modello economico duale** (N-06): i
pacchetti sono la Wave 5, e arriveranno con la guida alla scelta.

**NO ACTION**
Contributi e voucher (C-101, C-102) · numerazione documenti (C-097) · movimenti
(C-088) · sponsor (C-016) · commissione congelata (C-084): tutti gia superiori
o in parita.

**Workstream paralleli**

| WS | Contenuto | Dipende da |
|---|---|---|
| **4A** | Causale con flag fiscali | — |
| **4B** | Prima nota + estratto conto | 4A |
| **4C** | Rendiconto per causale + IVA per cassa | 4A |
| **4D** | Libro soci + quota associativa | 4A |
| **4E** | Fornitori e clienti | — |
| **4F** | Export strutturato dei report | 4B, 4C |

**Dipendenze** — **4A blocca quasi tutto**, ed e una `S`: va fatto per primo e
da solo. 4E e indipendente.

**Risultato utente**
Il tesoriere stampa la prima nota dell'esercizio, il rendiconto per voce di costo
e il saldo IVA del trimestre, ed esibisce il libro soci con la quota associativa
agganciata ai pagamenti. Il commercialista riceve un CSV invece di una telefonata.

**UAT** — Su un club con un anno di movimenti reali: prima nota confrontata riga
per riga con `/movements`; rendiconto la cui somma per causale **torna** al totale
del bilancio; saldo IVA del trimestre confrontato a mano su dieci movimenti;
libro soci con dieci soci e le loro quote; export CSV riaperto in un foglio di
calcolo.

**Effort: L** · **Rischio: LOW** (sono quasi tutte **letture** di dati esistenti:
il rischio sta in 4A, che tocca una configurazione gia seminata sui club)

#### Esito, misurato (2026-08-30)

Il consuntivo per intero e in
[38 — Wave 4: implementazione e collaudo](38-wave-4-implementation-uat.md).
Qui solo lo stato dei gap.

| Gap | Previsto | **Esito** |
|---|---|---|
| **G-09** causale con i flag fiscali | chiuso | **CLOSED** — `deductible`, `is_membership_fee`, `reporting_bucket` e l'autore della classificazione, con una schermata che li configura |
| **G-10** prima nota | chiuso | **CLOSED** — e la vista `accounting_ledger_lines` |
| **G-11** rendiconto per voce | chiuso | **CLOSED** nel perimetro **gestionale**: il documento porta un disclaimer e il prodotto non lo chiama bilancio |
| **G-12** estratto conto | chiuso | **CLOSED** — saldo derivato per conto, movimenti filtrabili per conto e periodo |
| **G-13** dichiarazione 730 | V1.1 | **OPEN** — dipende dalla validazione professionale della detraibilita |
| **G-23** trasmissione allo SdI | quando l'intermediario esistera | **OPEN** — il tracciato si genera e si valida; l'intermediario non c'e, e la rotta risponde 503 dicendolo |
| **G-39** fornitori e ciclo passivo | chiuso | **PARTIAL** — la **controparte** generica esiste; fatture ricevute, scadenzario passivo e pagamenti a fornitore no |
| **G-41** saldo IVA trimestrale | chiuso | **OPEN** — imponibile e imposta si **conservano**, non si liquidano. Serve validazione professionale (§31 del piano) |
| **G-45** libro soci | chiuso | **PARTIAL** — registro append-only con numerazione, delibera, cessazione e stato derivato. E **bookkeeping**: nessun professionista ha confermato la conformita statutaria, e il prodotto non la dichiara |
| **G-46** quota associativa in contabilita | chiuso | **CLOSED** |
| **G-54** export economico | chiuso | **CLOSED** — CSV con venti colonne, sopra `csv.ts`, con anno fiscale, stagione e sede |

**CLOSED 6 · PARTIAL 2 · OPEN 3** (su undici gap del perimetro Wave 4).

**Cosa il piano non prevedeva e la Wave ha dovuto fare:** una barriera di
sicurezza. Due tornate di revisione ostile hanno trovato una classe di IDOR che
quattro correzioni successive non erano riuscite a chiudere, e due risorse senza
**nessun** confine. Vedi [14 — Sicurezza](14-security.md) §6-quinquies e
§6-octies, e [ADR-0094](18-decision-log.md#adr-0094--il-confine-multi-tenant-e-una-dichiarazione-obbligatoria-non-un-elenco).

---

### WAVE 5 — «L'attivita sportiva, e cio che la famiglia fa da sola»

**Obiettivo**
Chiudere il modello dell'attivita e dare alla famiglia qualcosa da fare oltre
che da leggere.

**Gap chiusi** — G-24, G-25, G-27, G-28, G-29, G-30, G-31, G-32, G-33, G-34,
G-35, G-36, G-37, G-38, G-55, G-57, G-64, G-65, G-66, G-67.

**Cosa sviluppiamo**
1. **Calendario unico**: una **vista** sopra `trainings` e `matches`, con le
   viste mese/settimana/giorno/agenda e i filtri per gruppo, sede e tipo.
2. **Capienza e lista d'attesa** sull'evento, con scadenza di conferma e disdetta.
3. **Presenze aggregate per persona** con % e «senza risposta», riusando la
   misura di frequenza che il dominio contributi gia calcola.
4. **Permesso separato sul dato clinico** (G-33) e archivio delle anagrafiche.
5. **Campi personalizzati sulla persona** e **viste di elenco per compito**, con
   modifica di massa su qualunque campo.
6. **Tesseramento come entita** con stato e scadenza, agganciato alle automazioni
   della Wave 2.
7. **Sconti automatici e pagamento contestuale** nel modulo di iscrizione.
8. **Pacchetti, abbonamenti e carnet** — il dominio che apre circoli, palestre e
   sport individuali. **Accanto** a `payment_plans`, non dentro.
9. Le rifiniture: ricerca globale, azioni rapide per compito, modifica in linea,
   controllo duplicati.

**Cosa EasyGame possiede gia e riutilizziamo**
`trainings` e `matches` · la misura di frequenza del dominio contributi ·
`access-roles.ts` e il **pattern dei cinque permessi di Sport Work** come modello
per G-33 · `list-selection.ts` · `src/lib/forms/dynamic-fields.ts` per i campi
personalizzati · modulistica V2 e checkout esistente · `discounts` ·
`payment_transactions` per il consumo di un carnet.

**Cosa NON copiamo da Golee**
L'**accesso con QR** (N-12): nessun destinatario nel perimetro attuale. Il
**modello economico duale senza guida** (N-06): i pacchetti arrivano **con** la
domanda «quota di squadra o abbonamento?» posta dal prodotto. I **campionati**
(C-059): non esistono nemmeno in Golee come schermata. Le **90 caselle di
permessi** (A-09): si aggiunge il permesso clinico, non una matrice.

**NO ACTION**
Categoria come entita (C-043) · gruppi operativi (C-044) · compatibilita
(C-046) · numerazione maglie (C-047) · programma settimanale (C-048) ·
convocazioni (C-058) · alert trainer (C-061) · pro-rata (C-068) · sconto che
sopravvive all'incasso parziale (C-070) · magazzino (C-073): dieci capability
analizzate e **gia risolte meglio** da EasyGame.

**Workstream paralleli**

| WS | Contenuto | Dipende da |
|---|---|---|
| **5A** | Calendario unico + capienza + lista d'attesa | Wave 2F (RSVP) |
| **5B** | Presenze per persona + report | — |
| **5C** | Permesso clinico + archivio anagrafiche | — |
| **5D** | Campi personalizzati + viste elenco + modifica di massa | — |
| **5E** | Tesseramento come entita | Wave 2A (automazioni) |
| **5F** | Sconti automatici + pagamento nel modulo | — |
| **5G** | Pacchetti, abbonamenti, carnet | 5A per il consumo su evento |
| **5H** | Rifiniture UX (ricerca globale, azioni rapide, modifica in linea, duplicati) | — |

**Dipendenze** — 5A dipende dal RSVP della Wave 2. 5G dipende da 5A. Gli altri
sei workstream sono **indipendenti fra loro**: e la wave piu parallelizzabile.

**Risultato utente**
Un circolo di tennis puo usare EasyGame: vende abbonamenti a ingressi, la famiglia
li attiva da sola, il credito si scala all'accesso. Una societa di squadra vede il
calendario di tutte le attivita in una pagina, sa chi ha risposto, e l'allenatore
vede il certificato valido **senza** vedere le patologie.

**UAT** — Creazione di un carnet da 10 ingressi, attivazione dalla famiglia,
consumo su 3 eventi, verifica del credito e dello stato; evento con capienza 15 e
20 invitati, con 5 in lista d'attesa e promozione automatica alla prima disdetta;
verifica che un allenatore veda lo stato del certificato e **non** il profilo
sanitario; tre campi personalizzati creati, compilati in blocco su 50 atleti ed
esportati.

**Effort: XL** · **Rischio: MEDIUM** (5G e un dominio economico nuovo: va
costruito **accanto** ai piani e non dentro, o si rompe il modello che oggi
funziona)

---

### Oltre le wave — analizzato e consapevolmente rinviato

| Voce | Gap | Perche fuori |
|---|---|---|
| Governance associativa (registro volontari, assemblee, verbali, safeguarding) | G-47, G-48, G-49, G-50 | Alto valore per una ASD, ma **nessuna dipendenza** dalle altre wave: e un blocco a se che si puo inserire quando serve commercialmente |
| Modelli di visita medica regionalizzati | G-44 | **Impegno redazionale permanente**, non sviluppo. Va deciso con una persona, non con uno sprint |
| Sincronizzazione con portali federali | G-63 | Un solo portale esiste davvero (CSI). Va aperto su richiesta di un cliente reale |
| Person Core esteso a tutte le anagrafiche | G-56 | `XL` strutturale, con rischio alto su dati in esercizio. Va affrontato quando il costo dei cinque archivi (AU-6) diventa misurabile |
| App per la famiglia | G-59 | **Differita da ADR-0025.** E dopo la Wave 2 il canale esistera comunque, sul web |
| Riconciliazione dei payout esposta in EasyGame | G-71 | Il cruscotto del PSP la fa gia. Si apre quando i volumi la rendono necessaria |
| Rateizzazione al consumatore (Klarna, Alma) e addebito SEPA | — | Vedi §5 e §8: nessun problema aperto che questi metodi risolvano |

---

## 23 — Contatore wave

```
Capability analizzate:                         189
  EasyGame superiore:                           53
  Parita:                                       35
  EasyGame parziale:                            41
  EasyGame mancante:                            48
  Non va copiato:                               10
  Non applicabile:                               2

Golee avanti in:                                89 capability
  Capability che superano il test del §1.4:     83
  consolidate in voci di gap:                   72
  Differenze respinte (non sono gap):            6

Gap analizzati:                                 72
Implementati in questo commit:                   0   (audit: nessun codice toccato)
Estensioni di sistemi EasyGame esistenti:       58   (di 72: l'80,6%)
Domini nuovi necessari:                          8   (bacheca, consensi, tesseramento,
                                                      assemblee, volontari, valutazioni,
                                                      pacchetti/carnet, fornitori)
Fuori dal codice (ambienti, editoriale):         6
NO ACTION:                                     106   (53 superiori + 35 parita +
                                                      10 da non copiare + 2 non
                                                      applicabili + 6 respinte)
Rinviati oltre le wave:                         11
Difetti registrati e non corretti:               9   (§21, di cui 5 nuovi)
Duplicazioni segnalate e non corrette:          12   (§9, di cui 4 nuove)

Pre-production gap:                              6
Quick win identificati:                         12   (10 in classifica, 2 aggiuntivi)
Wave proposte:                                   5
Wave implementate:                               0
```

> **Il numero che conta e uno solo: 58 gap su 72 si chiudono estendendo un
> dominio che EasyGame gia possiede.** Il confronto con Golee non chiede di
> ricostruire EasyGame: chiede di **finire** quello che c'e.

---

## 24 — Limiti di questo audit

1. **Golee non e stato riaperto.** Tutto viene dall'archivio di teardown, con i
   suoi limiti dichiarati: un solo workflow eseguito, ~40% osservato a schermo,
   nessun workflow economico provato, layout desktop mai visto, campione di due
   anagrafiche. Le maturita di Golee sono **stime di evidenza**, non misure.

2. **Le 18 incognite del teardown restano incognite.** In particolare: se
   esistano preset di ruolo, se i permessi si possano limitare a un gruppo, se
   esista un audit log, e cosa faccia davvero la scheda «Notifiche verso i
   tesserati». **Nessuna di esse e stata trattata come un'assenza.**

3. **EasyGame e stato letto, non eseguito.** La baseline viene dal codice a HEAD
   e dalle prove a runtime **gia registrate** nella KB (Blocco E, Full Club UAT,
   collaudo Sport Work). Questo audit non ha avviato l'applicazione. Il rischio
   piu rilevante che ne discende e **AU-1**, dedotto dalla lettura del riporto di
   stagione e **da verificare con una prova reale** prima di dimensionare G-01.

4. **Le maturita di EasyGame sono state prese dalle prove esistenti.** Dove la
   KB dichiarava `COMPLETE` senza una prova a runtime, la maturita e 3 e non 4.

5. **La scorecard e un giudizio, non una misura.** Le motivazioni sono scritte
   accanto a ogni punteggio proprio perche siano contestabili. L'asse
   **Performance** e quello piu debole del confronto: EasyGame e misurato, Golee
   no, e i due numeri non sono omogenei.

6. **Gli effort sono ordini di grandezza**, non stime. Nessuno di essi e stato
   validato contro il codice riga per riga.

7. **Nessun prezzo, nessun posizionamento commerciale.** Il confronto e
   funzionale. Che Golee costi 39,99 o 59,99 EUR al mese, e che venda
   **attraverso le federazioni**, e un dato di contesto riportato al §7 e non un
   elemento della valutazione.

---

*Documento prodotto il 2026-08-28 come audit. Nessun file di codice, nessuna
migrazione, nessuna configurazione e nessun deployment sono stati modificati.*
