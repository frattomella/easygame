# Brief di migrazione — pagine Web V2 (EGDS v3.1.0)

Questo e il contratto per chi migra **una** pagina dalla V1 al Web V2. Leggilo
tutto prima di toccare codice. La specifica visiva e in
`design-source/guidelines/05-web-desktop.md` … `10-handoff.md`; i mockup in
`design-source/web/`; l'inventario funzionale della tua pagina in
`docs/redesign/audit/`.

## Le due fonti di verita

- **Funzionalita**: il codice esistente (rotte, componenti, API, permessi,
  validazioni, test). L'audit della tua pagina elenca tutto: **niente sparisce**.
  Se il mockup non mostra una capacita, la ricostruisci con i pattern del
  sistema. Se il codice e il design divergono sul *comportamento*, vince il
  codice; su *aspetto, parole, forma dell'interazione*, vince il design.
- **Aspetto/UX**: guideline `05`–`10` e i mockup. Non inventare un secondo
  linguaggio visivo: componi con le primitive di `src/components/web/`.

## Le fondamenta (gia costruite — NON modificarle)

Tutto vive in `src/components/web/` e `src/lib/web/`. Se manca davvero un
componente generico, **non** lo aggiungi li: lo scrivi accanto alla tua pagina
(`src/components/<dominio>/v2/…`) e lo segnali nel rapporto finale, cosi il
lead lo promuove alle fondamenta.

| Cosa | Da dove |
| --- | --- |
| Guscio | Gia montato: le pagine continuano a usare `Sidebar`, `Header`, `dashboardMainClassName`, `DashboardPageContainer` da `@/components/dashboard/*` (sono porte verso il V2). `useBreadcrumbLabel(nome)` da `@/components/web/shell/ShellProvider` per dare al breadcrumb il nome del record. Il topbar sul cielo: `<Header variant="sky" />` (**solo** la Dashboard) |
| Intestazione di pagina | `PageHeader`, `HeaderStat`, `ContextControl` da `@/components/web/page/PageHeader` |
| Pulsanti | `Button` (`variant`: `primary` = l'unico gradiente per schermata · `neutral` · `secondary` · `row` · `text` · `danger` = contorno rosso, mai riempimento · `ghost-on-sky` · `inverted-on-sky`; `size` md/sm/xs; `icon`, `loading`), `IconButton` (sempre `aria-label`) da `@/components/web/primitives/Button` |
| Superfici | `Panel` (piano 1), `InsetBlock` (piano 0, dentro un pannello), `PanelHeader`, `Eyebrow`, `Hairline` da `@/components/web/primitives/Surface` |
| Stato | `StatusPill` (`status` = una spec di `@/lib/web/status` o il valore grezzo dell'API; `detail` per la data/i giorni), `DataChip` (categoria, sede, tag — **mai** una parola di stato), `IconChip` da `@/components/web/primitives/StatusPill`. Le etichette vivono in `src/lib/web/status.ts`: se te ne serve una nuova la aggiungi **li** (e solo li) |
| Identita | `IdentityTile` (numero di maglia o iniziali), `Avatar` (l'unica forma rotonda con la pillola), `IdentityCell` (tile + nome + riga meta) da `@/components/web/primitives/Identity` |
| Controlli | `SegmentedControl`, `Checkbox`, `Toggle`, `Skeleton`, `ProgressBar` da `@/components/web/primitives/Controls` |
| Overlay | `Tooltip`, `TooltipProvider`, `Popover*`, `Menu*` da `@/components/web/primitives/Overlays`; `Drawer` (`width`: narrow 392 · default 480 · wide 720; `dirty` accende la guardia), `DrawerSection` da `@/components/web/overlays/Drawer`; `Modal`, `ConfirmDialog` (notevole/reversibile), `DangerConfirmDialog` (distruttiva: `consequences[]`, `typedConfirmation` solo se irreversibile o ampia), `DirtyGuardDialog` da `@/components/web/overlays/Modal` |
| Moduli | `Field`, `FieldSizeProvider` (`size="sm"` dentro un cassetto), `TextInput`, `CurrencyInput`, `Textarea`, `Select`, `SearchableSelect` (obbligatorio sopra otto opzioni), `MultiSelect`, `DateInput`, `TimeInput`, `FieldGroup`, `FormGrid`, `ValidationSummary` da `@/components/web/forms/Field` |
| Griglia | `DataGrid` + `CellChips` da `@/components/web/datagrid/DataGrid`; tipi in `@/components/web/datagrid/types` (`ColumnDef`, `FilterDef`, `ViewDef`, `BulkActionDef`, `RowActionDef`, `GroupDef`). Filtri/ordinamento/pagine sono **client-side** sulle `rows` che passi |
| Card | `KpiCard`, `KpiBar`, `SummaryCard` (`dashed` per la parte economica), `InfoCard`, `EmptyStateCard`, `DetailCard` (griglia etichetta/valore 3 colonne + `onEdit`), `TimelineRow` da `@/components/web/page/Cards` |
| Avvisi | `AlertBlock` (in pagina), `AlertCard` (Dashboard: conteggio + conseguenza + verbo) da `@/components/web/page/Alerts` |
| Scheda | `RecordHeader` (identita, chip, pillola, azioni: le distruttive **solo** nel `···`), `RecordAreaSwitcher` (3–5 aree), `RecordAlertStrip`, `CollapsedSection` (stato persistito), `SectionNav` da `@/components/web/record/Record` |
| Formattazione | `formatDateShort` (`24 set 2026`), `formatDateNumeric`, `formatMoney` (`305,00 €`), `formatInteger`, `formatPercent`, `daysUntil`, `formatDaysLabel`, `MISSING` (`—`), `joinMeta` da `@/lib/web/format` |
| Preferenze | `usePreference(modulo, chiave, default)` da `@/components/web/hooks/use-preference` (chiavi `egw.<modulo>.<chiave>`) |
| Toast | quello di sempre: `useToast().showToast("success"|"error"|"info", msg)` da `@/components/ui/toast-notification` (gia con l'aspetto V2) |

Le classi Tailwind del sistema: colori `egw-*` (`bg-egw-page`, `text-egw-ink-62`,
`text-egw-red`, `bg-egw-tint-amber`…), raggi `rounded-egw-panel|panel-sm|field|
control|chip|micro|check|menu|pill`, ombre `shadow-egw-plane-1|plane-2`, gradienti
`bg-egw-action|navy|match`, font `font-brand`, numeri `egw-num`. **Nessun
esadecimale nuovo, nessun raggio nuovo, nessuna ombra nuova, nessun font nuovo.**
Niente `bg-gradient-to-r from-blue-600 to-purple-600`, niente titoli in gradiente,
niente glass/blur, niente emoji, niente punti esclamativi, niente `window.confirm`.

## Le regole che non si piegano (guideline 10 §10.5)

1. Un ambiente per pagina: mist piatto (`--egw-page`) su ogni pagina di lavoro; il
   cielo **solo** sulla Dashboard.
2. Un solo gradiente d'azione per schermata (il primario di pagina) piu la voce
   attiva della barra. Le altre azioni sono `secondary`/`neutral`/`text`.
3. Lo stato e una parola: `StatusPill` con etichetta italiana e punto ad anello.
   Nessuna riga colorata, nessun colore da solo.
4. Numeri tabellari (`egw-num`), 700/800, importi a destra, date a sinistra, `—`
   per cio che manca.
5. Tre piani: nessuna card dentro una card (dentro un `Panel` si usa `InsetBlock`).
6. Angolo tagliato su ogni superficie rettangolare; solo pillola e avatar sono
   rotondi.
7. Righe ≤48px. Ogni elenco e il `DataGrid`. Ogni elenco ha viste, filtri,
   colonne, densita, esportazione (se la V1 la aveva), paginazione e i suoi stati.
8. I cassetti creano e modificano (480 ≤8 campi · 720 9–20 · pagina intera >20);
   i modali **solo** confermano. Un livello alla volta. Guardia sulle modifiche
   non salvate (`dirty`).
9. Conferma proporzionata: reversibile → nessuna conferma + toast; notevole →
   `ConfirmDialog`; distruttiva su un record → `DangerConfirmDialog` con «cosa se
   ne va»; irreversibile/ampia → in piu la conferma scritta.
10. Permesso negato = **assente**, mai disabilitato. Gli stessi predicati della V1
    (stesse chiavi, stessi `can…`): non si allentano e non si inventano.
11. Italiano, sentence case, `·` come separatore. Le etichette lunghe entrano
    (~30% sopra l'inglese): le intestazioni di colonna vanno a capo, le celle
    ellissano con il valore intero nel `title`, i pulsanti non ellissano mai.
12. Loading a scheletro nella forma di cio che arriva; mai spinner a pagina intera
    salvo il primissimo caricamento gia gestito dal guscio.
13. Ogni pagina resta usabile a **375, 768 e 1280 px** (CLAUDE.md): sotto i 1024
    il guscio mostra la barra mobile; la tua pagina deve solo non traboccare
    (griglie con `overflow-x:auto`, nessun `grid-cols-2` senza breakpoint).

## Ownership e disciplina

- Tocchi **solo** i file della tua rotta e i componenti di dominio che l'audit
  elenca come suoi. I componenti di dominio **condivisi** (usati anche da altre
  rotte) non si riscrivono: si riusano e, se serve un aspetto V2, si avvolgono.
- **Non** modifichi `src/components/web/**`, `src/lib/web/**`, il guscio, i
  layout, `AuthProvider`, `simplified-db.ts`, le API in `src/app/api/**`, lo schema
  Prisma, `package.json`, la KB in `docs/knowledge-base/**` (la aggiorna il lead).
- Riusi la logica dati della V1 cosi com'e (stesse funzioni, stessi endpoint,
  stessi header). Non aggiungi `fetch` diretti: `apiRequest`/`simplified-db`.
- Quando la V2 di una pagina e completa e a parita, **rimuovi** il codice V1
  specifico di quella pagina (componenti inline, dialoghi duplicati, codice morto
  che l'audit segnala) — ma solo dopo aver verificato con `grep` che nessun altro
  file lo importi. Non lasci una V1 e una V2 in parallelo.
- I test statici esistenti che leggono il sorgente della tua pagina
  (`tests/ui/*`): li aggiorni mantenendone l'**intento** (spesso basta ripuntarli
  al file nuovo o al pattern nuovo). Aggiungi test per cio che cambia forma:
  almeno un test statico di parita che elenchi le capacita dell'audit
  (etichette, azioni, endpoint) e le cerchi nel sorgente V2.
- **Non committare** e non fare `git add`: il lead integra e committa per ondata.
- Non lanciare `npm run build` (usa `.next` condiviso) e non avviare server: il
  lead verifica a schermo. Tu lanci `npm run typecheck` e i test mirati
  (`node --experimental-strip-types --import ./tests/helpers/register-hooks.mjs --test tests/ui/<file>.test.mjs`)
  e alla fine `npm test` una volta sola.

## Rapporto finale (obbligatorio, in questo ordine)

1. File creati / modificati / rimossi.
2. Checklist di parita rotta per rotta: per ogni capacita dell'audit → dove vive
   ora (A = come nel design · B = pattern equivalente · C = ricostruita col
   sistema) o **GAP** con il motivo.
3. Componenti generici che ti sono mancati (candidati alle fondamenta).
4. Esito di typecheck e test (numeri, e cosa hai ripuntato).
5. Cosa il lead deve verificare a schermo (percorsi e casi).
