# Wave D — Audit di parità: Strutture

> Inventario funzionale dell'implementazione V1 di `/structures` e
> `/structures/[id]` sul branch `feat/web-redesign`, scritto **prima** della
> migrazione al Web V2 (Addendum del brief). Documenta il codice reale: nessuna
> proposta di design. Le tredici sezioni dell'audit di Wave A sono ripetute per
> ciascuna rotta.
>
> File letti per intero: `src/app/structures/page.tsx` (1770 righe),
> `src/app/structures/[id]/page.tsx`, `src/app/structures/layout.tsx`,
> `src/components/structures/*.tsx` (sei file), `src/lib/structures-utils.ts`,
> `src/lib/club-sites.ts` (parti su strutture e sedi), `src/components/sites/*`,
> `src/lib/opening-hours-utils.ts`, D-WEB in `16-technical-debt.md`, le righe
> di `11-capabilities.md` su strutture, multi-sede e prenotazione. Grep mirato
> su test, permessi, importatori.

---

## Indice

1. [`/structures` — elenco strutture](#structures--elenco-strutture)
2. [`/structures/[id]` — scheda struttura](#structuresid--scheda-struttura)
3. [Modello dati e librerie](#modello-dati-e-librerie)
4. [Test collegati](#12-test-collegati)
5. [Inventario componenti](#13-inventario-componenti)
6. [Sintesi](#sintesi)

---

## `/structures` — elenco strutture

File: `src/app/structures/page.tsx`. Layout: `MobileTopBar` **più**
`Header title="Strutture"` (doppia barra sotto i 1024 px, gia in allowlist
`DOPPIA_BARRA_NOTA` di `tests/ui/navigazione-sotto-1024-e-768.test.mjs`) +
`Sidebar` + `DashboardPageContainer` + `SharedPageHeader`.

Dati: `getClubStructures(clubId)` (colonna JSONB `clubs.structures`) e
`getClubData(clubId, "club_sites")`, entrambi da `@/lib/simplified-db` con
import dinamico. Il club attivo si legge da `useAuth().activeClub`, con
ripiego su `localStorage["activeClub_<userId>"]` e poi `localStorage.activeClub`,
piu un listener `storage`. Ogni riga passa da `normalizeStructure`
(`structures-utils`). La pagina tiene una **copia locale** dei tipi e di
`normalizeAvailability`/`normalizeField`/`normalizePayment` (PP-02 §L la
segnala come difetto: due copie della stessa regola).

### 1. Dati mostrati

Per struttura, una `Card` con:

- icona `Building2` in un riquadro blu, **nome** (`(Senza nome)` se vuoto);
- badge «Visibile ai tesserati» / «Non visibile ai tesserati»
  (`isVisibleToMembers`);
- indirizzo sotto il titolo (solo se presente);
- quattro riquadri: **Campi** (`fields.length`), **Prenotazioni**
  (`bookings.length`), **Affittabile** («Si»/«No» da `isRentable`), **Tipo**
  («Pubblica»/«Privata» da `isPublic`).

Ordine: alfabetico per nome (`sortByName`), poi filtrato per sede
(`filterStructuresBySite(structures, siteFilter)`: una struttura **senza
sede resta visibile** con qualunque filtro, ADR-0038).

Sopra l'elenco, se il club e caricato: `ClubSitesSection` (anagrafica delle
sedi, vedi §3) e, solo se `isMultiSiteClub(sites)`, il `SiteFilter`
«Mostra le strutture di».

Un blocco `{false ? … : null}` (righe 1119–1675) contiene l'editor inline
di pagamenti e campi/tariffe di una versione precedente: **codice morto**,
irraggiungibile insieme al modale «Aggiungi Pagamento» in fondo (aperto solo
da `openAddPayment`, chiamato solo nel blocco morto). Le funzioni
`addPayment`, `removePayment`, `addField`, `updateField`, `removeField`,
`addSlot`, `updateSlot`, `removeSlot`, `addPricing`, `updatePricing`,
`removePricing`, `toggleStructurePayments`, `toggleStructureFields`,
`formatDate`, `badgeClassForPaymentStatus`, `normalizeField`,
`normalizePayment` sono tutte morte. La copia locale di
`normalizeAvailability` e viva solo tramite `addField` (morta).

### 2. Azioni

| Azione | Dove | Cosa fa |
|---|---|---|
| **Nuova struttura** | pulsante in alto a destra (`Plus`) | apre il `Dialog` di creazione (vedi §3) |
| **Apri scheda** | per card, `outline sm` | `router.push('/structures/<id>?clubId=<clubId>')` |
| **Elimina** (icona cestino) | per card, `ghost sm` | `AlertDialog` «Eliminare la struttura?» — «Questa azione eliminerà anche campi, tariffe e pagamenti associati. Non è reversibile.» — Annulla / Elimina → `handleDeleteStructure` filtra l'array e `persist` → toast «Struttura eliminata» |
| Nuova sede / Modifica sede / Elimina sede / Sede attiva | dentro `ClubSitesSection` | vedi §3 |

Non esistono azioni di modifica dall'elenco: `openEditStructure` e definito
ma mai chiamato (la scheda e l'unico punto di modifica).

### 3. Form (ogni campo, validazione)

**Dialog «Aggiungi struttura» / «Modifica struttura»** (`max-w-xl`, chiusura
azzera il modulo):

| Campo | Controllo | Note |
|---|---|---|
| Nome * | `Input`, placeholder «Es: PalaSport» | **unica validazione**: vuoto → toast «Inserisci il nome della struttura» |
| Indirizzo | `Input`, «Via...» | trim |
| Sede | `SiteSelect` (montato solo se `sites.length > 0`), `emptyLabel="Nessuna sede"` | aiuto: «Senza sede la struttura resta visibile con qualunque filtro.» |
| Struttura pubblica | `Switch` (`isPublic`, default on) | «Visibile nei contesti interni.» |
| Visibile ai tesserati | `Switch` (`isVisibleToMembers`, default on) | «Se disattivato, la struttura non sarà visibile ad atleti e genitori.» |
| Prenotabile dalle famiglie | `Switch` (`isBookableByMembers`, default on) | W6-54: «Se disattivato, la struttura resta visibile ma l'area famiglia non mostra il modulo di prenotazione e la richiesta viene rifiutata.» |
| Affittabile | `Switch` (`isRentable`, default off) | «Il contratto d'affitto della struttura, con importo e scadenze. Non riguarda le prenotazioni delle famiglie.» |

Pulsanti: «Annulla», «Salva» (`Save`). Salvataggio: nuova struttura con
`id = uid("structure")`, `payments: []`, `fields: []`, appesa in coda;
`persist` = `saveClubStructures(clubId, next)` (riscrive **tutta** la
colonna); toast «Struttura salvata»; **dopo la creazione la pagina naviga
alla scheda** appena creata. Fallimento: toast «Salvataggio strutture
fallito». Nessun campo per tipologia, citta, referente, note, orari o
campi: quelli vivono solo nella scheda.

**La struttura non ha orari di apertura propri.** Gli «orari» del dominio
sono le fasce di **disponibilita per campo** (`fields[].availability`,
`Record<"Lun"…"Dom", {start,end}[]>`). `src/lib/opening-hours-utils.ts`
riguarda gli orari della **segreteria del club** (`clubs.opening_hours`,
appuntamenti e area famiglia) e non tocca le strutture; D-WEB (chiavi
non-giorno stampate come giorni) e un debito di quel modulo, non di questa
rotta.

**Dialog «Nuova sede» / «Modifica sede»** (`ClubSitesSection`, `sm:max-w-lg`):
Nome sede (obbligatorio: «Il nome della sede e obbligatorio»; duplicato
case-insensitive: «Esiste gia una sede con questo nome»), Citta, Indirizzo,
Note, `Switch` «Sede attiva». Salva → `onChange(normalizeClubSites(...))` →
`updateClubData(clubId, "club_sites", sites.map(serializeClubSite))`
ottimistico con ripristino e toast «Sedi aggiornate» / «Salvataggio sedi
fallito». Eliminazione **senza conferma**, disabilitata se la sede ha
strutture collegate (`title`: «Ha strutture collegate: disattivala invece di
eliminarla»). L'elenco mostra nome, badge «Disattivata», «citta · indirizzo»
o «Nessun indirizzo», e «· n struttura/e». Testo esplicativo: «Una sede e la
citta in cui il club opera. … Con una sola sede configurata nessuna
schermata mostra il filtro sede.»; vuoto: «Nessuna sede configurata: il club
lavora come mono-sede.»

### 4. Filtri, ricerca, ordinamento, raggruppamento

- Filtro sede (`SiteFilter`, «Mostra le strutture di», «Tutte le sedi»),
  montato solo per club multi-sede; valore vuoto = tutte.
- Nessuna ricerca, nessun ordinamento scelto dall'utente (fisso: nome),
  nessun raggruppamento, nessun filtro per tipo/visibilita.

### 5. Selezione multipla / azioni di massa

Nessuna.

### 6. Export / import

Nessuno.

### 7. Permessi / ruoli

`/structures` sta in `MANAGEMENT_PATH_PREFIXES` (`src/lib/access-roles.ts`)
e nel middleware: area `management`, ruoli di gestione (proprietario, club
manager, segreteria). Il layout `src/app/structures/layout.tsx` riesporta
`management-area-layout` (`AccessAreaGuard`). **Nessuna chiave di permesso
fine** (`can…`) sulla pagina: chi entra fa tutto. Gli allenatori non leggono
`club_sites` (PP03-D18) ma non arrivano a questa rotta.

### 8. Stati (con il testo)

| Stato | Testo |
|---|---|
| caricamento | `Card` «Caricamento...» |
| nessun club | «Nessun club selezionato» |
| elenco vuoto | «Nessuna struttura registrata.» |
| errore di lettura | toast «Errore nel caricamento delle strutture» (elenco resta vuoto) |
| salvataggio fallito | toast «Salvataggio strutture fallito» |
| badge visibilita | «Visibile ai tesserati» / «Non visibile ai tesserati» |

### 9. Flussi distruttivi

- Elimina struttura: `AlertDialog` (testo in §2), irreversibile, riscrive
  la colonna. Se ne vanno: campi, tariffe, fasce, pagamenti d'affitto,
  contratto, prenotazioni (anche quelle della famiglia). Gli allenamenti e
  le gare che portano `structure_id`/`field_id` della struttura (eventi in
  `club_events`, proiettati su `clubs.trainings`/`clubs.matches`) **restano
  con un riferimento orfano**: la V1 non li conta e non li nomina.
- Elimina sede: nessuna conferma; bloccata se ha strutture.

### 10. Navigazione e parametri

- Entrata: voce «Strutture» della barra (`navigation.ts`, `/structures`).
- Uscita: `/structures/<id>?clubId=<clubId>` (Apri scheda e dopo la
  creazione). La pagina non legge `?clubId` in ingresso.

### 11. Schede / sezioni

Nessuna tab. Sezioni verticali: intestazione, sedi operative, filtro sede,
elenco card.

### 12. Test collegati

Vedi [§12 in fondo](#12-test-collegati).

### 13. Inventario componenti

`MobileTopBar`, `Sidebar`, `Header`, `DashboardPageContainer`,
`SharedPageHeader`, `Card*`, `Button`, `Input`, `Label`, `Switch`, `Badge`,
`Separator`, `Dialog*`, `Select*` (morto), `AlertDialog*`, `Accordion*`
(morto), `useToast`, icone lucide (`Plus`, `Pencil` (morto), `Trash2`,
`CreditCard` (morto), `CalendarClock` (morto), `Building2`, `Save`, `Eye`,
`EyeOff`, `ChevronDown`, `ChevronUp` (morti)), `ClubSitesSection`,
`SiteFilter`, `SiteSelect`, `normalizeStructure`, `sortByName`,
`filterStructuresBySite`, `isMultiSiteClub`, `normalizeClubSites`,
`serializeClubSite`, `todayLocalDateOnly`.

---

## `/structures/[id]` — scheda struttura

File: `src/app/structures/[id]/page.tsx` (rotta) +
`src/components/structures/StructureDetailPage.tsx` (composizione) + cinque
sezioni. Layout: `Sidebar` + `Header title="Scheda struttura"` (niente
`MobileTopBar`) + `DashboardPageContainer`.

Dati: `clubId` da `?clubId=` → `activeClub.id` → `localStorage`; poi
`getClubStructures(clubId)` normalizzato, e `findStructureById`. **Salvataggio
unico** «Salva» in testa alla scheda: `onSave` sostituisce la struttura
nell'array e chiama `saveClubStructures` con **tutta** la colonna. La scheda
lavora su un `draft` locale (`useState`, riallineato quando cambia
`structure`): ogni sezione modifica il draft, niente si scrive finche non si
preme Salva. Rischio noto (non risolto in V1): una prenotazione della
famiglia arrivata mentre il draft e aperto viene sovrascritta al Salva.

### 1. Dati mostrati

Intestazione: «Torna alle strutture», icona `Building2`, nome (o «Struttura
senza nome»), «indirizzo, citta» (o «Indirizzo non inserito»), badge
«Visibile»/«Non visibile» (`isVisibleToMembers`) e
«Affittabile»/«Non affittabile» (`isRentable`), pulsante «Salva»
(«Salvataggio...» durante).

Sei tab (`Tabs`): **Informazioni · Campi · Pagamenti / Fitti · Tariffe ·
Prenotazioni · Note**.

### 2. Azioni

| Azione | Dove | Effetto |
|---|---|---|
| Torna alle strutture | intestazione | `/structures?clubId=` |
| Salva | intestazione | valida nome (toast «Il nome della struttura e obbligatorio»), `onSave(normalizeStructure(draft))`, toast «Struttura salvata» / «Salvataggio fallito» |
| Aggiungi campo | tab Campi | appende `newField()` |
| Elimina campo | per campo (`Trash2`, `title="Elimina campo"`) | rimuove **senza conferma** |
| Fascia (+) | per giorno | appende `{18:00, 22:00}` |
| Rimuovi fascia | per fascia | rimuove senza conferma |
| Aggiungi tariffa | per campo, tab Tariffe | appende `{60 min, 0}` |
| Elimina tariffa | per tariffa | rimuove senza conferma |
| Aggiungi (pagamento) | tab Pagamenti / Fitti | appende al draft, azzera il modulo |
| Elimina pagamento | per riga | rimuove senza conferma |
| Aggiungi/Salva prenotazione, Annulla modifica | tab Prenotazioni | vedi §3 |
| Modifica / Elimina prenotazione | per riga | carica nel modulo / rimuove senza conferma |
| Mese precedente / Oggi / Mese successivo | calendario | naviga il mese |
| clic su un giorno / su una prenotazione nel calendario | calendario | precompila la creazione su quel giorno / apre la modifica |

Non esiste «Elimina struttura» dalla scheda.

### 3. Form (ogni campo, validazione)

**Tab Informazioni** (`StructureInfoSection`): Nome struttura, Tipologia
(placeholder «Es. Centro sportivo, palestra, campo»), Indirizzo, Citta,
Referente, Telefono, Email (`type=email`), tre interruttori con badge
(«Struttura pubblica» → Pubblica/Privata; «Visibile ai tesserati» →
Visibile/Nascosta; «Affittabile» → Si/No, che scrive anche
`rent.enabled`), «Note interne» (`Textarea`). **Manca «Prenotabile dalle
famiglie»**: l'interruttore W6-54 si puo cambiare solo dal dialog di
creazione dell'elenco (e la modifica dall'elenco non e raggiungibile), cioe
dopo la creazione nessuna schermata lo modifica piu — irraggiungibile
(CLAUDE.md §11.8). Nessuna validazione oltre al nome al Salva.

**Tab Campi** (`StructureFieldsSection`): per campo — Nome campo,
Proprieta (`Select` Pubblica/Privata), tre interruttori «In affitto»
(`inRent`), «Prenotabile» (`isBookable`), «Visibile ai tesserati»
(`isVisible`); **Disponibilita** per i sette giorni (`WEEK_DAYS`:
Lunedi…Domenica), ogni giorno con n fasce `Inizio`/`Fine` (`type=time`) e
«Fascia» per aggiungerne una; «Nessuna fascia.» se vuoto. Un campo nuovo
nasce «Nuovo campo», Pubblica, `inRent=false`, `isBookable=true`,
`isVisible=true`, fasce Lun/Mer/Ven 18:00–22:00, **tariffe vuote** (W6-55:
mai `price: 0` nella fabbrica). Nessuna validazione sulle fasce (fine ≤
inizio e ammesso: e la fascia notturna di PP-02 §L; `00:00–00:00` vale come
vuota). Vuoto: «Nessun campo configurato.»

**Tab Tariffe** (`StructurePricingSection`): per campo, elenco tariffe con
«Durata minuti» (`DurationCounter` −/+, passo 15, 15–240, ripiego 60) e
«Prezzo» (`number step 0.01`); «Aggiungi tariffa»; «Nessuna tariffa
configurata.»; senza campi: «Aggiungi un campo prima di configurare le
tariffe.» Sul percorso famiglia una tariffa a 0 non si mostra
(`getVisibleBookableStructures`).

**Tab Pagamenti / Fitti** (`StructureRentPaymentsSection`):
- «Contratto di affitto» — «Gestisci canone, frequenza e scadenze della
  struttura.» — `Switch` (`rent.enabled || isRentable`, scrive entrambi);
  Canone (`number`), Frequenza (testo libero, default «mensile»), Giorno
  scadenza (`number 1–31`), Inizio contratto, Fine contratto (`date`), Note
  contratto.
- Modulo «nuovo pagamento» in linea: Data (oggi), Descrizione («Canone
  struttura»), Importo, Stato (`Pagato` / `In attesa` / `Scaduto`, default
  «In attesa»); «Aggiungi» esce in silenzio se data/descrizione mancano o
  l'importo non e un numero (virgola ammessa); `type: "Quota"` fisso.
- Elenco pagamenti: descrizione, «gg/mm/aaaa - EUR 0.00», badge colorato
  di stato (verde/giallo/rosso), cestino. Vuoto: «Nessun pagamento
  registrato.»

**Tab Prenotazioni** (`StructureBookingsSection`):
- Calendario mensile (griglia 7 colonne, `min-w-[760px]` scorrevole, sei
  settimane, Lun→Dom), etichetta mese in italiano, «Prenotazioni dentro ai
  giorni, colori distinti per campo.», max 3 prenotazioni per giorno e
  «+n altre», annullate al 50%, oggi cerchiato.
- Modulo: Campo (`Select` sui campi della struttura), Titolo («Prenotazione
  campo»), Data inizio / Ora inizio (18:00), Data fine / Ora fine (19:00),
  Stato (`In attesa` / `Confermata` / `Annullata`), Soggetto prenotante,
  Importo, Stato pagamento (`Non pagato` / `Parziale` / `Pagato`), Note.
  Validazioni: campo+titolo+orari («Campo, titolo e orari sono
  obbligatori»), fine dopo inizio («L'orario di fine deve essere successivo
  all'inizio»), conflitto sullo stesso campo con prenotazioni vive
  («Slot gia occupato per questo campo», `hasBookingConflict`). Gli istanti
  si compongono con `new Date(\`${date}T${time}\`).toISOString()` (fuso del
  dispositivo) e si rileggono con `localDateKey`/`toTimeString` (stesso
  fuso, bug UAT «date-only timezone shift» gia corretto). `bookedByType:
  "club"` per le prenotazioni della segreteria; quelle della famiglia
  arrivano dalla rotta `parent-dashboard/[athleteId]/structures` con
  `bookedByType` atleta/genitore e `status: "pending"`, e la segreteria le
  conferma da qui.
- Elenco ordinato per inizio: titolo, «campo - inizio / fine»
  (`toLocaleString("it-IT")`), «Prenotante: …», badge stato, «Modifica»,
  cestino. Vuoto: «Nessuna prenotazione registrata.»

**Tab Note**: `Textarea rows=8` su `notes` (lo **stesso** campo di «Note
interne» della tab Informazioni).

### 4. Filtri / ricerca / ordinamento

Nessuno (prenotazioni ordinate per inizio; calendario per mese).

### 5. Selezione multipla

Nessuna.

### 6. Export / import

Nessuno.

### 7. Permessi

Come l'elenco: area `management`, nessuna chiave fine.

### 8. Stati (con il testo)

| Stato | Testo |
|---|---|
| caricamento | «Caricamento struttura...» |
| non trovata | «Struttura non trovata» — «La struttura richiesta non esiste o non appartiene al club attivo.» — «Torna alle strutture» |
| errore lettura | toast «Errore nel caricamento della struttura» |
| salvataggio | «Salvataggio...», toast «Struttura salvata» / «Salvataggio fallito» / «Salvataggio struttura fallito» |
| badge intestazione | Visibile / Non visibile · Affittabile / Non affittabile |
| stato pagamento | Pagato (verde) · In attesa (giallo) · Scaduto (rosso) |
| stato prenotazione | Confermata (verde) · In attesa (giallo) · Annullata (grigio) |
| stato pagamento prenotazione | Non pagato · Parziale · Pagato (solo nel modulo, non mostrato in elenco) |

### 9. Flussi distruttivi

Tutte le rimozioni (campo, fascia, tariffa, pagamento, prenotazione) sono
**senza conferma** e solo sul draft: diventano definitive al «Salva» della
scheda. Nessuna eliminazione della struttura da qui.

### 10. Navigazione e parametri

`?clubId=` letto in ingresso e propagato a «Torna alle strutture». Nessun
parametro di tab: le sei tab non sono linkabili.

### 11. Schede / sezioni

Sei tab elencate in §1. Le tab «Tariffe» e «Campi» modificano lo stesso
array `fields`; «Note» e «Informazioni» lo stesso campo `notes`; il
`Switch` «Affittabile» compare sia in Informazioni sia in Pagamenti / Fitti.

### 12. Test collegati

| Test | Cosa legge |
|---|---|
| `tests/ui/multisite-ux.test.mjs` | `app/structures/page.tsx` deve montare `<SiteFilter` o `<SiteContextControl` e non una `<select … site` propria; deve contenere `filterStructuresBySite(structures, siteFilter)`; `components/sites/club-sites-section.tsx` e `site-filter.tsx` senza `grid-cols-[23]` senza breakpoint |
| `tests/ui/wave6-superfici-6a.test.mjs` | W6-54: `app/structures/page.tsx` contiene «Prenotabile dalle famiglie» e `isBookableByMembers: checked`, non «Abilita l'affitto della struttura.»; W6-55: la fabbrica `const newField` in `app/structures/page.tsx` e `const newField = ()` in `StructureFieldsSection.tsx` non contiene `price: 0` |
| `tests/ui/navigazione-sotto-1024-e-768.test.mjs` | `app/structures/page.tsx` e in `DOPPIA_BARRA_NOTA` (Header + MobileTopBar): chi corregge toglie la riga |
| `tests/auth/route-guards.test.mjs` | `structures/layout.tsx` riesporta il layout gestionale |
| `tests/web/shell-navigation.test.mjs` | `/structures` e una voce della barra |
| `tests/lib/pp-02-strutture-disponibilita.test.mjs`, `tests/lib/calendario-e-pubblico-evento.test.mjs`, `tests/server/*` | solo `structures-utils.ts` (sola lettura per questa migrazione) |

### 13. Inventario componenti

Rotta: `Sidebar`, `Header`, `DashboardPageContainer`, `Button`, `Card`,
`useAuth`, `useToast`, `StructureDetailPage`, `findStructureById`,
`normalizeStructure`. Composizione: `Badge`, `Tabs*`, `Textarea`, `cn`, le
cinque sezioni. Sezioni: `Card*`, `Input`, `Label`, `Switch`, `Select*`,
`Textarea`, `Badge`, `Button`, icone `Plus`, `Trash2`, `Pencil`,
`CalendarClock`, `ChevronLeft/Right`, `ArrowLeft`, `Building2`, `Save`;
da `structures-utils`: `WEEK_DAYS`, `uid`, `formatDate`,
`normalizeAvailability`, `hasBookingConflict` e i tipi; `todayLocalDateOnly`.

---

## Modello dati e librerie

`src/lib/structures-utils.ts` (**condiviso** con eventi, area famiglia e
server: sola lettura in questa migrazione):

- `ClubStructure { id, name, address, siteId, isPublic, isVisibleToMembers,
  isBookableByMembers, isRentable, payments[], fields[], city?, type?,
  contactName?, contactPhone?, contactEmail?, notes?, rent?, bookings? }`;
- `StructureField { id, name, ownership: Pubblica|Privata, inRent,
  isBookable, isVisible, availability: Record<day, {start,end}[]>,
  pricing: {id, durationMinutes, price}[] }`;
- `StructurePayment { id, date, description, type, amount, status:
  Pagato|In attesa|Scaduto }`;
- `StructureRent { enabled, amount, frequency, dueDay, contractStart,
  contractEnd, notes }`;
- `StructureBooking { id, structureId, fieldId, fieldName, title, start,
  end (ISO), status: pending|confirmed|cancelled, bookedByType, bookedById,
  bookedByName, athleteId, athleteName, parentId, amount?, paymentStatus:
  unpaid|paid|partial, notes, createdAt }`;
- `normalizeStructure` (ripieghi: `isPublic`, `isVisibleToMembers`,
  `isBookableByMembers` → `true`; `isRentable` → `false`; `rent.frequency`
  → «mensile», `rent.dueDay` → 1), `normalizeAvailability` (forma storica
  `{days, startTime, endTime}` senza orari → giornata **senza fasce**),
  `hasBookingConflict`, `getVisibleBookableStructures` (percorso famiglia),
  `isWithinFieldAvailability` (la fascia dichiarata **vincola** la
  prenotazione della famiglia e — tramite `src/lib/events/model.ts`, che la
  riesporta come `isWithinStructureFieldAvailability` con il fuso
  dell'evento — la programmazione di allenamenti e gare: un campo **senza
  fasce non e vincolato**), `describeFieldAvailability` («Lun 18:00-22:00 ·
  Mer …»), `describeFieldAvailabilityForDay`, `instantFromLocalTime`.

`src/lib/club-sites.ts`: `ClubSite`, `normalizeClubSites`,
`serializeClubSite`, `getActiveClubSites`, `isMultiSiteClub` (≥ 2 sedi
attive), `filterStructuresBySite`, `buildSiteIndex`.

Scritture: **una sola**, `saveClubStructures` (tutta la colonna); sedi con
`updateClubData(clubId, "club_sites", …)`. Nessun endpoint dedicato alle
strutture lato club; la famiglia prenota via
`POST /api/parent-dashboard/[athleteId]/structures` che scrive nella stessa
colonna (`src/lib/server/structure-bookings.ts`).

---

## Sintesi

1. Due rotte, una colonna JSONB, una funzione di scrittura: la parita e sul
   contenuto del draft, non sugli endpoint.
2. L'elenco V1 e un elenco di card senza ricerca, ordinamento, viste, bulk o
   export; **meta del file e codice morto** (editor inline di una versione
   precedente).
3. La creazione ha sette campi (nome, indirizzo, sede, quattro interruttori);
   tutto il resto (tipologia, contatti, campi, fasce, tariffe, affitto,
   prenotazioni, note) vive nella scheda, con un unico «Salva».
4. **Irraggiungibile in V1**: «Prenotabile dalle famiglie» dopo la
   creazione (la scheda non lo mostra); «Modifica struttura» dall'elenco.
5. Gli «orari» sono fasce per campo e per giorno; la struttura non ha orari
   propri e `opening-hours-utils` non c'entra.
6. Le rimozioni nella scheda sono senza conferma ma restano nel draft; solo
   l'eliminazione della struttura e definitiva e conferma con un
   `AlertDialog` che non nomina allenamenti e gare che la usano.
7. Le sedi (ADR-0038) si amministrano da questa pagina: nome unico, attiva
   /disattivata, non eliminabile se ha strutture.
8. Permessi: area di gestione, nessuna chiave fine.
9. Quattro test statici puntano al sorgente V1 (`multisite-ux`,
   `wave6-superfici-6a`, `navigazione-sotto-1024-e-768`, `route-guards`).
10. Da segnalare (non da risolvere qui): il Salva della scheda riscrive la
    colonna intera e puo sovrascrivere una prenotazione della famiglia
    arrivata nel frattempo; gli eventi con `structure_id` orfano dopo
    un'eliminazione.
