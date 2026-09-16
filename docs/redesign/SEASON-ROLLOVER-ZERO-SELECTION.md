# Riporto di stagione — zero significa zero (ADR-0196)

Data: 2026-09-17 · Branch `feat/web-redesign` · Baseline `627884b4`.

Il club: «creo una stagione nuova, EasyGame mi chiede quali atleti
riportare, non ne seleziono nessuno, e nella stagione nuova compaiono due
atleti — quelli con pagamenti — con i loro movimenti in prima nota».

## Riproduzione prima della correzione

### Sul database del redesign, in sola lettura (club pilota `4139ddd1`)

Audit del 2026-09-16 (ora DB): `18:04` storno di un incasso sponsor;
`18:07–18:08` cancellazione in blocco di ~309 schede (audit
`anagrafica.updated`, D-RD-27); `18:11:42` `season.created` «2026/27»
(2026-09-01 → 2027-08-31, attivata) + `season.rollover` con
`athlete_memberships: available 2, created 0, skipped 2`; `18:22` import.

Stato dopo: 2 stagioni **sovrapposte** (2026/2027 da luglio a giugno, 2026/27
da settembre ad agosto), 2 atleti rimasti — entrambi **inattivi**, con
`category_id` e appartenenze nelle categorie della stagione **archiviata**
(«Under 14 Gold», «Aquilotti»), 0 appartenenze nella stagione nuova, 4
`payment_transactions` (2 di un atleta, del 26 agosto; 2 sponsor), 13 rate.

Il riporto **non** ha scritto appartenenze ne copiato incassi. I due atleti
sembravano riportati per tre difetti di superficie:

| Cosa vedeva il club | Perche |
|---------------------|--------|
| I due atleti nella stagione nuova, con «Under 14 Gold» / «Aquilotti» | L'elenco atleti passa a `normalizeAthleteCategoryMemberships` il catalogo della **sola stagione attiva**; l'appartenenza alla categoria archiviata non trova il suo id e ripiega sul **nome**, che ora nomina la categoria copiata dal riporto. Misurato: `categoryId` risolto a `new-u14` con il solo catalogo B, a `old-u14` con il catalogo intero |
| Li vedeva sotto «Tutti» | Sull'archivio paginato (>200 schede) il chip senza filtri della griglia diceva «Tutti 200» acceso, mentre la banda sopra diceva «Attivi»; sotto la soglia una vista scelta una volta si ricordava per sempre |
| I loro incassi nella prima nota della stagione nuova | La prima nota si apriva su «Tutte le stagioni»; e un movimento manuale nasceva senza `season_id`, attribuito **per data** — nei giorni in comune fra due stagioni sovrapposte, a entrambe |

### Il wizard, sul deploy corrente (club QA `ae3d545b`, 209 tesserati)

Nuova stagione → Periodo → Cosa riportare (tipi predefiniti) → Tesserati:
**«209 riconfermati su 209»** senza aver toccato niente (`loadRoster`
spuntava tutti). Chiuso senza creare. «Nessuna selezione» valeva «tutti».

### Il server, con il doppio di Prisma (`tests/server/season-rollover-zero-selezione.test.mjs`)

Fixture del mandato: stagione A, tre atleti attivi in una squadra, due con
incassi e rate, uno senza. Crea la stagione B con riporto di categorie e
tesserati.

```
selectedAthleteIds = []        → ATHLETES CARRIED 0, MEMBERSHIPS CREATED 0 (gia corretto)
selectedAthleteIds = null      → ATHLETES CARRIED 3 (prima)  → 400 (dopo)
selectedAthleteIds assente     → ATHLETES CARRIED 3 (prima)  → 400 (dopo)
senza riporto                  → una sola scrittura: clubs.settings
incassi / rate / atleti        → mai toccati, in nessun caso
```

## Correzioni (ADR-0196)

1. Server: `athleteIds` obbligatorio (anche `[]`) quando `athlete_memberships`
   e fra i tipi; `null`/assente → errore **prima** di scrivere stagione e
   collezioni (`createClubSeason`, `runClubSeasonRollover`).
2. Wizard e cassetto «Riporta dati»: elenco **senza nessuno spuntato**,
   «Seleziona tutti» esplicito, riepilogo che dichiara «Nessun tesserato
   riconfermato: le squadre nascono vuote», descrizione del passo che dice
   cosa succede a chi non e spuntato; avviso (non blocco) se il periodo si
   sovrappone a una stagione esistente.
3. Audit `season.rollover` anche dalla creazione guidata con
   `athletesProposed / athletesConfirmed / athletesNotConfirmed /
   athleteMembershipsCreated / athletesCarried`, chiavi visibili nel registro.
4. Prima nota: si apre sulla stagione attiva (se salvata), l'elenco aspetta
   il perimetro; movimenti manuali e giroconti portano `season_id` dalla
   stagione dichiarata o da `x-active-season-id` (solo stagioni salvate).
5. Elenco atleti: si apre sempre su «Attivi» (`rememberView={false}`, chip
   dell'archivio con il nome dello stato); identita delle appartenenze sul
   catalogo di tutte le stagioni; una categoria di un'altra stagione si
   legge «Nome · stagione X» e non entra in nessun gruppo operativo corrente.

## Cosa non cambia

- `SEASON_NEVER_COPIED_DATA_TYPES` (movimenti, presenze, gare, …) non e mai
  stato copiato e non lo e.
- Le righe proiettate (incassi, compensi) restano attribuite per data: la
  vista SQL non cambia, nessuna migrazione.
- I dati del pilota non si toccano.

## UAT (deploy `e24e0c4b` su `easygame-redesign-staging`, club QA UAT `ae3d545b`)

- Wizard: «UAT5 Stagione C» (2027-07-01 → 2028-06-30, futura, non attivata),
  passo Tesserati **0/209 spuntati**, riepilogo «Tesserati nelle squadre 0 su
  209» + «Nessun tesserato riconfermato», creata. DB: 3 categorie copiate in
  C, **0 appartenenze** in C, totali del club invariati (209 appartenenze,
  211 atleti, 25 incassi, 3 rate); audit `season.rollover` con
  `athletesRequested true, athletesProposed 209, athletesConfirmed 0,
  athleteMembershipsCreated 0, athletesCarried 0`.
- API `POST /seasons/:id/rollover` senza `athleteIds` e con `null` → 400
  «Indica quali tesserati riportare…»; con `[]` (anteprima) → confirmed 0,
  created 0.
- Scelta esplicita: riporto diretto con un solo id (Sara Blu Qa
  `9a9620a5`) → created 1, appartenenze in C = 1, club 210. Nell'elenco
  atleti la riga della stagione futura si legge «Categoria Inesistente ·
  stagione UAT5 Stagione C» (la primaria si sposta sulla riga nuova: regola
  W1 pre-esistente).
- Prima nota: una sola lettura, `season_id=` stagione attiva, stato vuoto
  che spiega e rimanda a «Tutte le stagioni». Conto «UAT5 Cassa»
  `3c152bae`, movimento del 15 set 2026 (`6cbec962`, data nella finestra di
  **entrambe** le stagioni) con header stagione → `season_id` = attiva;
  storno → stessa stagione; elenco: stagione attiva 2 righe, stagione
  archiviata 25 (i suoi incassi del 28 ago), nessuna riga in entrambe.
- Elenco atleti: archivio paginato con chip «Attivi 211» (= intestazione),
  375 px senza scorrimento orizzontale.
- Invarianti (sola lettura, 3 club): appartenenze fuori catalogo 0, doppie
  primarie 0, colonne dangling 0, `data.siteId` 0; censimento legacy 0/0/0.

Residui UAT su QA UAT Club (cleanup su autorizzazione): stagione
`season-2027-07-01-2028-06-30-31epu` con 3 categorie copiate e 1 piano,
appartenenza di Sara Blu Qa in C, conto `3c152bae`, movimento `6cbec962` +
storno.
