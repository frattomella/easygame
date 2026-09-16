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
| `athletes.data.category`, `categoryName`, `categoryMemberships[]`, `categories[]` | writer delle appartenenze (`buildAthleteCategoryProjection`, stessa transazione); client `riallineaProiezioneAppartenenze` | consumatori diretti di `data` | PROJECTION 1:1 | corrente | nessuna |
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
scrivibile: tolti). Restano fuori ambito: `riallineamento-sede` della pagina
Categorie (agisce per categoria, sulla squadra che la categoria non serve
piu; passa dal registro generico vagliato) e i selettori di sede di slot,
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
| `season-memberships.ts` (rollover) | correnti | — | SI (copia il roster corrente per disegno) | invariato |
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
