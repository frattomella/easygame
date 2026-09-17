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

## UAT

Compilato a fine lotto (vedi rapporto finale).
