# Il confine di stagione — ricostruzione, correzioni, UAT (ADR-0197)

Lotto del 2026-09-17 sul branch `feat/web-redesign`. Decisione:
[ADR-0197](../knowledge-base/18-decision-log.md#adr-0197--il-confine-di-stagione-la-stagione-attiva-e-il-perimetro-operativo-lo-storico-resta-con-la-sua-stagione-e-di-quale-stagione-parliamo-ha-un-solo-risolutore).

## Ricostruzione sul pilota (sola lettura, Fortitudo redesign `4139ddd1`)

Script: `.codex-scratch/season/trace-fortitudo.mjs`,
`trace-fortitudo-audit.mjs` (non committati, `DATABASE_URL` = `DIRECT_URL` di
`.env.local`). Nessuna scrittura.

| Voce | Misura |
|------|--------|
| Stagione attiva | `season-2026-09-01-2027-08-31-ru1uu` «2026/27» (1 set 2026 → 31 ago 2027), creata e attivata 2026-09-16 18:11:42Z dal wizard, riattivata 2026-09-17 01:44:44Z (dopo un ritorno sulla precedente alle 01:44:03Z) |
| Stagione precedente | `season-2026-2027` «2026/2027» (1 lug 2026 → 30 giu 2027, **sovrapposta**), archiviata, e la piu vecchia (baseline dei record senza annata) |
| Programma settimanale | 40 voci in colonna e 40 in `club_resource_items`, **tutte** con la stagione attiva, tutte attive, 14 categorie **tutte** del catalogo della stagione attiva (0 di altre stagioni, 0 sconosciute); 5 con gruppo operativo |
| Riporto del 2026-09-16 | `season.rollover`: categorie 17, piani 4, gruppi 19, gruppi numerazione 3, **programma settimanale 36**, tesserati 0 (2 saltati) |
| Categorie | 34 (17 per stagione), gruppi operativi 38 (19 per stagione) |
| Allenatori | 11, `categories` con identificativi **della stagione precedente** (es. Marco Fabbri: `category-1787322361009-svwqtal`, `category-1787322409918-2z7yagl`); nessun `seasonId`, nessuna tabella di assegnazione |
| Eventi | `club_events`: 21 allenamenti generati (`auto:…`, creati 2026-09-13 18:31Z dal cron) + 2 «upcoming» con la stagione precedente, 1 gara con la stagione precedente, **3 allenamenti e 1 gara senza stagione** (creati a mano 3–13 set); 15 `event.cancelled` dell'utente il 2026-09-17 01:42Z; presenze: 38 righe, tutte su eventi della stagione precedente |
| Appartenenze | 112 sulla stagione attiva, 2 sulla precedente |

### Cause

- **A** (`missing_schedule`): il pannello manda il proprio stato come
  `weeklySchedule` e `normalizeScheduleItem` non porta `seasonId`; il server
  filtrava l'override con la regola dei record senza annata → 40 voci
  scartate come «della stagione piu vecchia». Riprodotto con il doppio di
  Prisma **prima** della correzione:
  `tests/server/programma-settimanale-stagione-adr-0197.test.mjs` (override
  senza `seasonId`, due stagioni, attiva la piu recente → `missing_schedule`;
  il cron con le stesse voci generava).
  In piu: 36 voci riportate dalla stagione precedente + 4 nuove = 40 tutte
  della stagione attiva, cioe **le 36 della precedente sono state cancellate**
  dall'autosave del pannello, che riscrive la colonna intera con la lettura
  filtrata (`updateClubData` → `PATCH /api/v1/clubs`).
- **B** (calendario): `GET /api/v1/events` filtrava per stagione solo con
  `season_id` esplicito, che nessuna schermata passa, e non leggeva
  `x-active-season-id`; gli eventi manuali nascevano con `season_id = null`.
- **C** (allenatori): la pagina risolveva `trainer.categories` sul catalogo
  di tutte le stagioni (`?fields=categories`) e mostrava le squadre dell'anno
  scorso come attuali; `getClubTrainers` le risolveva sul catalogo della
  sola stagione attiva e per gli id dell'anno scorso restituiva l'id come
  nome, che l'indice delle etichette traduceva nel nome dell'anno scorso.

## Correzioni

Vedi ADR-0197 §1–§11. In sintesi: risolutore canonico
(`src/lib/seasons/context.ts`, `src/lib/server/season-context.ts`);
generazione nella stagione dichiarata con diagnostica; colonna di stagione
riscritta per intero che conserva le altre stagioni (server); eventi per
identita con stampo alla creazione; allenatori per stagione
(`src/lib/trainers/season-assignments.ts`) e riporto `trainer_assignments`;
riepilogo del wizard con il «non riportato»; eliminazione di una stagione
vuota (`src/lib/server/season-delete.ts`); D-RD-27/29/30; Dashboard sulla
stagione attiva; cambio stagione senza F5.

## Prove

`tests/server/programma-settimanale-stagione-adr-0197.test.mjs`,
`tests/server/colonna-di-stagione-riscritta-adr-0197.test.mjs`,
`tests/server/calendario-stagione-adr-0197.test.mjs`,
`tests/lib/allenatori-stagione-adr-0197.test.mjs`,
`tests/server/season-rollover-allenatori-adr-0197.test.mjs`,
`tests/server/season-delete-adr-0197.test.mjs`,
`tests/server/audit-cancellazione-anagrafica-drd27.test.mjs`,
`tests/lib/season-context-adr-0197.test.mjs`,
`tests/ui/confine-di-stagione-adr-0197.test.mjs`, piu i casi aggiunti a
`tests/server/sport-work-f24-entry.test.mjs` e
`tests/lib/dashboard-overview.test.mjs`.

## Cosa non e stato fatto su dati reali

- Nessun backfill degli eventi senza stagione del pilota (D-RD-32): la regola
  li mostra nella stagione piu vecchia, che e quella in cui sono nati.
- Nessuna rigenerazione, nessuna assegnazione, nessuna eliminazione sul
  pilota. Le 36 voci del programma della stagione precedente **non stanno
  piu nel database corrente** (la colonna e stata riscritta fra il
  2026-09-16 18:11Z e 23:40Z). Sono leggibili nel ramo Neon
  `br-sparkling-butterfly-al5o6a2g` (istantanea del 2026-09-16 12:03Z, prima
  del riporto) e recuperabili con un ripristino puntuale (Neon conserva 7
  giorni): **solo su autorizzazione**, con un piano scritto — non in questo
  lotto.

## UAT (deploy `43f2fe71` su `easygame-redesign-staging`, club QA UAT `ae3d545b`)

Deploy `dpl_DHZz7kr7moMVn6PKRmj6wiDNCdpM` (guardia EXPECTED = ACTUAL su
progetto e database; migrazione della vista applicata; backup Neon
`br-dawn-darkness-alxjp8qo` prima del deploy). Stagione A = `2026/2027`
(`season-2026-09-01-2027-06-30-2pqcf`, 1 set 2026 → 30 giu 2027).

- **A popolata**: allenatore «Coach UAT7 Rossi» (`trainer-uat7-rossi`)
  assegnato dalla scheda a «Pulcini» della A (l'editor offre le sole tre
  categorie della A, scrive l'identificativo); 2 voci del programma
  (`uat7-a-1/2`); allenamento «UAT7 Allenamento A» 20 set 18:00 (nato con
  `season_id` A dall'header).
- **B creata dal wizard**: «UAT7 Stagione B» (`season-2026-09-15-2027-09-14-p3dfw`,
  15 set 2026 → 14 set 2027, **sovrapposta**), riporto di categorie e gruppi,
  0 tesserati; il riepilogo dichiara «Assegnazioni allenatori 0 riportati su
  1», «Programma settimanale 0 su 2», «Movimenti economici 0 — lo storico
  resta». Audit `season.rollover`: categorie 3, tesserati 0.
- **Allenatori in B**: «Nessuna categoria assegnata nella stagione UAT7
  Stagione B · Stagione precedente: 2026/2027: Pulcini»; colonna «Categorie
  UAT7 Stagione B». In A (dopo l'attivazione): «Pulcini».
- **Calendario §41**: allenamento B 20 set 19:00 nato con `season_id` B;
  stesso giorno, B mostra solo le 19:00, A solo le 18:00, `all_seasons=1` 2.
  La pagina dice «Stagione UAT7 Stagione B · 1 evento».
- **Programma settimanale B**: 40 voci scritte con l'header B dal percorso
  del pannello (`PATCH /clubs`): la colonna ha 40 B **e le 2 della A intatte**.
  Pagina «Programma settimanale · Stagione UAT7 Stagione B (40)». Anteprima
  una settimana (17 → 24 set): `totalRules 40, validRules 40, invalidRules
  0`, 48 occorrenze, tutte B; esecuzione: 48 creati, 0 conflitti; seconda
  esecuzione: 0 creati, 48 esistenti. Calendario B nella settimana: 49; A: 1.
- **A → B → A → B senza F5**: attivata la A, la barra laterale passa a
  «Stagione 2026/2027» subito; Allenatori mostra «Pulcini» come attuale;
  Calendario «Stagione 2026/2027 · 1 evento»; riattivata la B (evento
  `club-updated`), il Calendario passa a «49 eventi» senza ricaricare.
- **Eliminazione**: «UAT7 Vuota» (futura, vuota) creata e **eliminata** dal
  cassetto — impatto tutto a zero, CTA spenta finche il testo non e esatto,
  toast «eliminata definitivamente», riga sparita; `season.delete.requested`
  + `season.deleted` con impatto. Rifiuti: B attiva → «Prima di eliminare
  questa stagione, imposta un'altra stagione come attiva»; A → «contiene
  dati storici che non si cancellano (1 allenamenti e gare, 209 tesserati
  nelle squadre, 2 movimenti contabili, 2 rate sui piani della stagione)»;
  conferma sbagliata → «Per confermare scrivi esattamente: ELIMINA UAT7
  Vuota». Ogni rifiuto ha la sua riga `season.delete.requested · denied`.
- **Sonda DB** (`.codex-scratch/season/sonda-uat-0197.mjs`): appartenenze
  209 A / 0 B; programma 2 A / 40 B; eventi 1 A / 49 B; movimenti 2 A / 0 B;
  Rossi 1 riferimento in A. Invarianti categorie 0/0/0/0 su tre club.
- **Pilota (sola lettura)**: anteprima della generazione con le 40 voci
  reali, dal cron e dal percorso del pannello (override senza `seasonId`,
  stagione dichiarata): 40 valide, 50 occorrenze nella settimana, tutte
  nella stagione attiva; nessuna scrittura (colonna ancora 40).

Residui UAT su QA UAT Club (cleanup su autorizzazione): stagione
`season-2026-09-15-2027-09-14-p3dfw` «UAT7 Stagione B» (**attiva**: la
precedente `2pqcf` e archiviata) con 3 categorie; allenatore
`trainer-uat7-rossi`; struttura `structure-uat7`; 42 voci del programma
(`uat7-a-*`, `uat7-b-*`); 50 eventi (`uat7-training-a`, `uat7-training-b`,
48 `auto:…` in B).
