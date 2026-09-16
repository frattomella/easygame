# Appartenenze, cambio categoria, sede derivata, storia — terzo lotto del redesign (2026-09-16)

Branch `feat/web-redesign`, da `4001594a`. Ambienti: Vercel
`easygame-redesign-staging`, Neon `web-redesign-staging`
(`br-hidden-salad-alm93r7e`, endpoint `ep-dry-block-alkxdiiu`). Nessun altro
ambiente toccato. Decisione: [ADR-0194](../knowledge-base/18-decision-log.md).

## 1. Trace in sola lettura (§4 del mandato)

Due agenti in sola lettura hanno tracciato writer e lettori; la lettura dei
dati del pilota (Fortitudo Scauri, `4139ddd1…`) e stata fatta con script
read-only in `.codex-scratch/adr0194/`. Verdetto per campo.

| Campo / tabella | Writer (prima → dopo) | Lettori | Classe | Corrente / storico | Azione |
|---|---|---|---|---|---|
| `athlete_category_memberships` (`category_id`, `is_primary`, `site_id`) | prima: client riga per riga (`simplified-db.replaceAthleteMemberships`), registro generico, conversione prova, approvazione iscrizione, riallineamento sede della pagina Categorie, rollover di stagione → dopo: **`src/lib/server/athlete-category-memberships.ts`** (scheda, creazione, blocco), conversione prova e approvazione via registro generico **vagliato** | tutti gli elenchi, filtri, gruppi, perimetri, rapporti | **AUTHORITY** (appartenenza e sede corrente) | corrente | writer unico + vaglio della coppia |
| `athletes.category_id` / `category_name` | writer delle appartenenze (stessa transazione), registro generico (vaglio ADR-0186) | lettori senza righe (C2), export, mobile | PROJECTION della primaria | corrente | nessuna |
| `athletes.data.category`, `categoryName`, `categoryMemberships[]`, `categories[]` | writer delle appartenenze (`buildAthleteCategoryProjection`, stessa transazione); il client riporta la proiezione risposta dal writer (nessun riallineamento) | consumatori diretti di `data` | PROJECTION 1:1 | corrente | nessuna |
| `athletes.data.siteId` | prima: approvazione dell'iscrizione → dopo: **nessuno** | `getAthleteSiteIds` (ripiego), normalizzatore legacy | **DEPRECATED** (copia una tantum) | corrente (stantia) | writer fermati; il writer delle appartenenze toglie la chiave; lettura di ripiego conservata; rimozione schema rinviata |
| `athletes.data.site_id` | prima: spread del cambio in blocco → dopo: **nessuno** | idem | **DEPRECATED** | corrente (stantia) | idem |
| `athletes.site_id` / `site_name` | — | — | non esistono | — | — |
| `clubs.club_sites` | pagina Strutture/Categorie | ovunque (`buildSiteIndex`) | CONFIG | corrente | nessuna |
| `clubs.category_groups` | pagina Categorie («Sedi in cui e attiva») | `buildCategoryGroups`, **`placement.ts`** | CONFIG (le squadre) | corrente | fonte delle collocazioni |
| `club_resource_items` (`categories`) | pagina Categorie | `loadClubCategoryCatalog` | CONFIG (catalogo) | corrente | nessuna |
| `club_events.category_id`, `category_ids`, `group_ids`, `site_id` | `events.ts` alla creazione/modifica dell'evento | proiezione `clubs.trainings/matches`, rapporti, calendari | **HISTORICAL SNAPSHOT** dell'evento | storico | immutabile rispetto alle appartenenze |
| `club_event_participants.is_extra_category` | prima: solo convocazioni → dopo: anche l'**appello, alla prima registrazione** | `getParticipationCategoryContext` | HISTORICAL SNAPSHOT (l'atleta era della categoria?) | storico | fotografia, mai riscritta |
| `club_event_participants.status/convocation_status/rsvp_*` | i tre scrittori di ADR-0099 | rapporti, bacheche | fatto storico | storico | intoccato dal cambio di categoria |
| `trial_athletes.category_id/group_id/site_id` | `trial-athletes.ts` | vista prove, conversione | AUTHORITY della prova; sede **derivata** dal gruppo o dalla squadra unica | corrente | un selettore solo («Squadra»); il gruppo resta esplicito (perimetro dell'allenatore) |
| `athletes.data.categoryMemberships[].site_id` | proiezione | consumatori di `data` | PROJECTION | corrente | nessuna |

Writer attivi capaci di scrivere una coppia (categoria, sede) non
configurata: **0** (il registro generico vaglia; il client non scrive righe).
Selettori di sede indipendenti su atleta/prova/iscrizione: **0**
(`athlete-primary-site`, `bulk-site-target`, `trial-site`, `athlete.siteId`
scrivibile: tolti). Il `riallineamento-sede` della pagina Categorie passa dal comando canonico
(revisione ostile B11). Restano fuori ambito i selettori di sede di slot,
strutture e prima nota (non sono la sede di un atleta).

## 2. Lettori storici (§21)

| Lettore | Sorgente della categoria corrente | Sorgente storica | Sicuro dopo un cambio | Azione |
|---|---|---|---|---|
| `category-athlete-stats.ts` (rapporto «categorie per atleta», bacheca allenatore) | membri correnti | eventi della categoria + righe | prima **NO** (le presenze di chi cambiava sparivano) → **SI**: entra chi ha una riga, `formerMember` («oggi in altra categoria») | corretto |
| `club-report-utils.calculateAttendanceReport` (attesi/mancanti) | membri correnti per allenamento | righe | prima NO → SI: chi ha una riga e atteso | corretto |
| `trainer-operational-alerts.getTrainingAttendanceStatus` (x/y, «presenze mancanti») | elenco corrente | righe | prima NO (le righe fuori elenco scartate) → SI | corretto |
| `getParticipationCategoryContext` (pettorina Primaria/Secondaria/Extra su appelli e rose) | appartenenza corrente | `is_extra_category` (ora anche dall'appello) | prima NO → SI per le righe registrate (`member`, «Della categoria»); senza riga vale l'appartenenza corrente | corretto |
| `parent-dashboard.ts` storia gare della famiglia | appartenenza corrente | righe (gia per gli allenamenti) | prima NO → SI | corretto |
| `athlete-category-analytics.ts` | correnti + categorie derivate dagli eventi con riga | eventi | gia SI (le righe storiche sopravvivono) | invariato |
| `funding.loadAttendanceInputs` (ore dei contributi) | gruppi correnti | righe | **PARZIALE**: regola anti-frode («una presenza sull'altra squadra non matura») incompatibile con la storia senza date | D-RD-25 |
| `rsvp.resolveExpectedAthletes` | correnti + righe | righe | SI per gli eventi aperti | invariato |
| `season-memberships.ts` (rollover) | correnti | — | SI (copia il roster corrente per disegno); la sede della riga nuova passa dal vaglio della coppia (B1) | corretto |
| export atleti (`person-export.ts`, elenco) | correnti | — | SI (e un roster) | colonna «Sede» per riga |

## 3. Semantica del cambio (§9)

Casi A–H: `tests/lib/appartenenze-piano-e-collocazione-adr-0194.test.mjs`.
Comando: `tests/server/appartenenze-comando-adr-0194.test.mjs` (permesso,
tenant, perimetro, anteprima = applicazione, lotti, audit, idempotenza,
coppie). Storia: `tests/server/appartenenze-storia-adr-0194.test.mjs`
(scenario obbligatorio §34 e variante con la secondaria). Superfici:
`tests/ui/appartenenze-superfici-adr-0194.test.mjs`. Concorrenza vera:
`scripts/prova-appartenenze-concorrenti.mjs` (EasyGame FC: 6 comandi → 1
primaria; QA UAT Club: 8 comandi, 4 scritti, 4 gia a posto, secondaria
estranea conservata).

**Trovato in UAT (§40, prova → atleta).** Ogni conversione con una
categoria falliva sul database vero con «la riga a cui si collega non
esiste»: il vaglio del padre (`guardParentBelongsToClub`, registro generico)
leggeva la scheda con il client **globale**, e la scheda nata dentro la
transazione della conversione (ADR-0188) non esiste ancora per chi sta
fuori. Il doppio non lo vedeva (esegue la transazione sullo stesso client)
e la prova sul database vero convertiva senza categoria. Chiuso: il vaglio
riceve il client di chi chiama (creazione e modifica); prova 45 di
`tests/server/atleti-in-prova.test.mjs` riproduce la visibilita e
`scripts/prova-conversione-concorrente.mjs <club> [n] [categoryId]` lo
misura sul database vero (EasyGame FC, UAT Esordienti: 4 concorrenti → 1
scheda, 1 primaria, sede Roma derivata dalla squadra unica).

## 4. Il dato del pilota (letto, non toccato)

Censimento del 2026-09-16 (`.codex-scratch/adr0194/censimento-coppie.mjs`):
Fortitudo Scauri 226 righe (215 + 11 create dall'UAT dell'utente alle
11:39–11:53Z con il cassetto precedente), 220 su una squadra configurata, 4
`Pulcini (mbawy4c) + S. Cosma` non configurate, 2 `Pulcini` senza sede, 12
`Aquilotti [S]` spurie. EasyGame FC 3 righe (2 su squadra, 1 senza sede); QA
UAT Club 209 righe senza sede (nessun gruppo configurato: corretto per
regola); `ef5317db…` 12 righe senza sede, non toccato. Nessuna riga
riscritta da questo lotto: D-RD-26.

## 5. Cio che questo lotto NON fa

- Nessuna migrazione, nessuna riscrittura di righe esistenti.
- Nessuna validita temporale sulle appartenenze (D-RD-25).
- Nessuna rimozione dallo schema delle copie legacy della sede in `data`.
- Nessuna bonifica del dato UAT del pilota (D-RD-26).
- Nessuna promozione dello staging ufficiale (§54 del lotto precedente).

## 6. Revisione ostile (§37)

Quattro revisori in sola lettura (A categoria, B sede, C storia, D
blocco/concorrenza/sicurezza), un solo scrittore. **Trovati**: Critical 0,
High 12, Medium 28, Low 28. **Alla chiusura**: Critical 0, High 0, Medium 8
aperti e dichiarati, Low 20 aperti e dichiarati.

Chiusi (High e Medium): vecchia primaria fuori catalogo che restava doppia
(A1/C7); perimetro dell'accesso sulle righe che non cambiano (A2/B9) e mai
in anteprima (A13/B16/D6) → blocco per atleta, non del lotto; colonne
scritte prima del vaglio e riallineamento client che riesumava le chiavi
legacy (A3/A12/B5/B6/D2 → PUT prima, `expectedRowIds`, proiezione dal
writer, scheda nuova tolta se le righe sono rifiutate); riporto di stagione
senza vaglio della coppia (A9/B1); upsert del registro senza vaglio (B2);
registro generico HTTP ancora aperto in scrittura (D3); `data.siteId` unito
alle sedi delle righe (B3) e riversato dal normalizzatore (B4);
`data.siteId`/`site_id` ancora scrivibili da un chiamante (B7); conversione
della prova con la sede dell'altra categoria (A8/B8) e proiezione senza la
sede derivata (B12); approvazione dell'iscrizione fuori dal writer con la
colonna scritta dal modulo (A6/B11); riallineamento della pagina Categorie
fuori dal writer (B11); rosa riaperta che riscriveva la fotografia (C1);
extra e ospiti fra gli «ex membri» del rapporto (C2) e fra gli attesi (C6);
`eraDellaCategoria` senza la colonna del club mai migrato (C3); pettorina
«Della categoria» irraggiungibile sulle rose (C4); export del rapporto senza
la nota (C5); ruolo/politiche non validati (D4); `updated` detto di righe
non scritte e «rimosse» dette di righe conservate (A4/D5); nessuna guardia
fra anteprima e applicazione (D7 → firme per atleta); writer che rifiutava
ogni riga di un club senza catalogo (A11/B13/D9); righe doppie in grafie
diverse (D12); errori del driver mostrati all'utente (D14); tetto di 2000
atleti in una richiesta (D1 → 200 per richiesta, il client spezza);
lunghezza controllata dopo la materializzazione (D17); nome nudo di
un'omonima risolto per etichetta (A5); risposta «Sede» dei moduli precedenti
buttata (A7) e non detta (B14); prova precedente alle squadre senza squadra
preselezionata (B15); conferma abilitata con zero aggiornati (A17);
`targetId` stantio con un messaggio fuorviante (A16); chiavi legacy
`data.category_*` lasciate nella proiezione (C12); primaria promossa dal
normalizzatore trattata come uscente (A14).

Aperti e dichiarati — Medium: `is_extra_category = false` sulle righe di
presenza **precedenti** a questo lotto e il default, non una fotografia (una
presenza extra registrata prima e letta «Della categoria» per chi poi ha
cambiato categoria; distinguere richiede una colonna nullable o un
backfill: D-RD-25); ruoli personalizzati senza chiavi di catalogo che
raggiungono `athletes`/`athlete_category_memberships` in scrittura come il
registro generico (D8, debito preesistente della matrice); catalogo e indice
delle squadre riletti a ogni riga sul registro generico (D10); audit scritto
dopo la transazione e in sequenza (D11); ore dei contributi filtrate sui
gruppi correnti (regola anti-frode, D-RD-25); riepilogo «Atleti nel filtro»
dei rapporti che conta anche gli ex membri (C10); rosa dell'allenatore
costruita dall'appartenenza corrente (C11); `expected` e `batchId` fidati
dal client come correlazione (D7, mitigato dalle firme). Low: 20, fra cui
`allowedOrganizationIds: []` letto come «nessun vincolo» dai chiamanti
interni (D13), seconda riga di audit del blocco su un nuovo tentativo
(D15), 403 per un atleta inesistente (D16), la prova §32.18 sul doppio non
misura il rollback (D18: lo misura il database vero), duplicati in input
del `PUT` fusi in silenzio (D19), righe RSVP «pending» lette come fatto
(C8), fotografia mai scritta su una riga preesistente all'appello (C9),
attestazione con la categoria corrente (C13, fuori lotto), omonime nella
stessa sede indistinguibili nelle tendine (A15), gruppo disattivato
spiegato come «non si svolge» (B18), `categoryName` grezzo su una riga
senza nome (B17), sede ignota su un club senza gruppi (B13 parziale).
