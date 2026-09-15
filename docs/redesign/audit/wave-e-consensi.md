# Wave E — Audit di parità: Consensi

> Inventario funzionale dell'implementazione V1 sul branch `feat/web-redesign`,
> scritto **prima** della migrazione al Web V2 (Addendum del brief). È il
> contratto di parità: niente sparisce. Nessuna proposta di design.
>
> Rotta coperta: `/consensi`. File: `src/app/consensi/page.tsx` (836 righe);
> il dominio puro `src/lib/consents/model.ts` e i predicati
> `src/lib/consents/permissions.ts`; le rotte `src/app/api/v1/consents/**`
> lette solo per capire **cosa il server accetta e rifiuta**; i test
> collegati.
>
> Metodo: lettura integrale della pagina, del modello e dei permessi; grep
> sui test e sulle rotte.

---

## Indice

1. [`/consensi` — definizioni, testi e decisioni](#consensi--definizioni-testi-e-decisioni)
2. [Endpoint e librerie](#endpoint-e-librerie)
3. [Test collegati](#test-collegati)
4. [Inventario componenti](#inventario-componenti)
5. [Cosa **non** esiste in V1](#cosa-non-esiste-in-v1)
6. [Sintesi](#sintesi)

---

## `/consensi` — definizioni, testi e decisioni

Guscio: `Sidebar` + `Header title="Consensi"`, `bg-slate-50`,
`DashboardPageContainer max-w-7xl`, `SharedPageHeader title="Consensi"
subtitle="Cosa il club chiede di acconsentire, con quale testo, e chi ha
detto di si. Una revoca non cancella niente: aggiunge una riga."`. Layout a
due colonne (`lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]`, una colonna
sotto): a sinistra l'elenco e il modulo di creazione, a destra il dettaglio
della definizione selezionata.

### 1. Dati mostrati

**Definizione** (`GET /api/v1/consents?include_retired=1`): `id, key, title,
description, required, status (draft | active | retired), publishedVersion,
publishedVersionId, publishedAt`.

**Decisione** (`GET /api/v1/consents/{id}/records?limit=50`): `id, status
(accepted | rejected | revoked), version, subjectKind, subjectId,
subjectLabel, decidedAt, source (public_form | internal_form | manual |
import | subject), note`.

**Stato per soggetto** (`GET /api/v1/consents/states?subject_kind=&subject_id=`):
`definitionId, definitionKey, definitionTitle, required, subjectKind,
subjectId, subjectLabel, status (accepted | rejected | revoked | missing),
version, decidedAt, onOutdatedVersion, historyCount` — una riga per
definizione del club.

Colonna sinistra, card «I consensi del club»: un pulsante per definizione con
titolo, badge stato (`ETICHETTA_DEFINIZIONE`: Bozza / Attivo / Ritirato), riga
`key · versione {n}` oppure `· nessun testo pubblicato`, `· obbligatorio` se
`required`. La selezionata e evidenziata. Selezione iniziale: la prima.

Colonna destra, per la definizione selezionata:
- card titolo + badge stato; `description || "Nessuna descrizione."` +
  «Testo in vigore: versione {n} del {gg/mm/aaaa}.» oppure «Nessun testo
  pubblicato: non si possono raccogliere decisioni.»;
- card «Il soggetto» (vedi §3);
- elenco «Cosa ha firmato» (`stati[]`): per riga `definitionTitle`, badge
  stato (`ETICHETTA_STATO`: Accettato / Rifiutato / Revocato / Manca), badge
  ambra «versione precedente» se `onOutdatedVersion`, data;
- card «Le decisioni registrate»: tabella (`overflow-x-auto`, `min-w-[42rem]`)
  Data · Soggetto (`subjectLabel || subjectId` + tipo `ETICHETTA_SOGGETTO`:
  Atleta / Persona / Socio / Tutore) · Decisione (badge) · Versione (`?? "—"`)
  · Provenienza (`source` grezzo, **non** tradotto) · Nota (`|| "—"`).

Date: `formatData` scritta a mano (`gg/mm/aaaa`, `"—"` se assente).

### 2. Azioni

Configurazione (`puoConfigurare`): **Crea in bozza** (card «Definisci un
consenso»), **Pubblica versione {n+1}**, **Ritira** (se `active`),
**Riattiva** (se `retired`). Nessuna azione su una bozza oltre la
pubblicazione (il server accetta `draft → active` anche via `PATCH status`,
ma la V1 non lo offre: la prima pubblicazione attiva la definizione lato
server).

Lettura (`puoLeggere`): **Cosa ha firmato** (ricerca per soggetto).

Registrazione (`puoRegistrare`): **Accetta**, **Rifiuta**, **Revoca**
(icona `Undo2`).

Nessuna azione per riga della tabella delle decisioni (append-only: «non c'e
nessun pulsante per cancellarne una»).

### 3. Form

**Definisci un consenso** (solo `puoConfigurare`):
- Chiave (`Input`, placeholder `images`, nota «Minuscole, cifre, trattino. La
  citano i moduli e i modelli: dopo non si cambia.»; inviata con
  `normalizeConsentKey`; il server valida con `isValidConsentKey`, max 40,
  `^[a-z0-9_-]+$`);
- Titolo (`Input`, placeholder «Consenso immagini»);
- Descrizione (`Input`);
- casella «Segnala chi non lo ha dato» (`required`, default `false`).
- Validazione client: `!chiave || !titolo` → toast «Chiave e titolo sono
  obbligatori». Submit `POST /api/v1/consents { key, title, description,
  required }` → toast «Consenso creato: ora pubblica il testo», campi
  azzerati, rilettura, selezione della nuova. Errore → toast
  `message || "Creazione non riuscita"`.

**Pubblica un testo nuovo** (solo `puoConfigurare`, nella card della
definizione): `Textarea rows=5` (placeholder «Autorizzo la pubblicazione di
foto e video…», nota «Una versione pubblicata non si modifica piu. I consensi
gia raccolti restano validi e vengono segnalati come dati su una versione
precedente.»). Validazione: testo vuoto → toast «Il testo del consenso non puo
essere vuoto». Submit `POST /api/v1/consents/{id}/versions { body_text }` →
toast «Testo pubblicato. I consensi gia raccolti restano validi e vengono
segnalati come dati su una versione precedente», campo azzerato, rilettura.

**Il soggetto** (tutti i lettori): Tipo (`<select>` su `CONSENT_SUBJECT_KINDS`
con `ETICHETTA_SOGGETTO`, default `athlete`), Identificativo (`Input`,
l'id grezzo del record), Nome (`Input`, placeholder «Rossi Mario»,
`subject_label`), Nota (`Input`, placeholder «Modulo cartaceo consegnato in
segreteria», solo `puoRegistrare`). Valori iniziali vuoti, **non** azzerati
dopo la registrazione (solo la nota).

### 4. Filtri / ricerca / ordinamento / viste

Nessun filtro ne ricerca sull'elenco delle definizioni (include le ritirate
sempre) ne sulla tabella delle decisioni (`limit=50`, ordine del server). La
ricerca «Cosa ha firmato» e una lettura per soggetto, non un filtro.

### 5. Selezione multipla / azioni di massa

Nessuna.

### 6. Export / import

Nessuno.

### 7. Permessi (chiavi esatte, `src/lib/consents/permissions.ts`)

- `puoLeggere = canReadConsentRecords(ruolo)` = `consents.records.read`.
  Senza: pagina con `SharedPageHeader subtitle="Accesso negato: i consensi
  del club li legge chi ci lavora dentro."` e nessuna chiamata.
- `puoConfigurare = canManageConsentDefinitions(ruolo)` =
  `consents.definitions.manage`: card «Definisci un consenso», «Pubblica un
  testo nuovo», Ritira/Riattiva.
- `puoRegistrare = canRecordConsentDecision(ruolo)` =
  `consents.decide_for_others`: campo Nota e i tre pulsanti di decisione.
- `ruolo = activeClub?.role || userRole`. Nessun layout di area dedicato
  (`src/app/consensi/` non ha `layout.tsx`).

### 8. Stati

- Loading definizioni: «Caricamento…» nella card.
- Vuoto: «Nessun consenso definito.» + « Creane uno qui sotto.» (se
  `puoConfigurare`) / « La direzione del club non ne ha ancora definiti.»
- Nessuna definizione selezionata: «Seleziona un consenso per vederne il
  testo e le decisioni.»
- Errore di lettura definizioni: toast del messaggio (elenco vuoto).
- Errore di lettura decisioni: riquadro ambra `role="alert"` con il messaggio
  (`|| "Non sono riuscito a leggere le decisioni"`) e **Riprova**.
- Decisioni vuote: «Nessuna decisione registrata per questo consenso.»
- Stato definizione: Bozza / Attivo / Ritirato. Stato decisione: Accettato /
  Rifiutato / Revocato / Manca (`missing` solo negli stati per soggetto).
- Occupato (`occupato`): «crea», «pubblica», «stato», «ricerca», e il nome
  della decisione — disabilita **solo** il pulsante interessato.

### 9. Flussi distruttivi

Nessuna cancellazione. **Ritira** e **Riattiva** cambiano lo stato senza
conferma (`PATCH /api/v1/consents/{id} { status }`; transizioni ammesse
`canTransitionConsentDefinition`: `draft → active`, `active → retired |
draft`, `retired → active`). **Revoca** e una decisione in piu (append-only):
il server la rifiuta con `explainConsentDecisionDenial` se non c'e niente da
revocare («Non risulta nessun consenso da revocare per questo soggetto», «Il
consenso risulta rifiutato, non dato…», «Il consenso risulta gia revocato»;
e «Il consenso risulta dato: per ritirarlo si registra una revoca, non un
rifiuto»). La V1 mostra il messaggio del server nel toast.

### 10. Navigazione e parametri

Nessun parametro in entrata ne in uscita. Voce di menu `SEGRETERIA ›
Consensi`.

### 11. Schede/sezioni

Nessuna scheda: elenco a sinistra, dettaglio a destra con tre card.

### 12. Test collegati

Nessun test statico legge `src/app/consensi/page.tsx`. Collegati per dominio
(non toccati): `tests/lib/consents-model.test.mjs`,
`tests/server/consents-service.test.mjs`, `tests/lib/document-permissions.test.mjs`
(i tre predicati vivono in `consents/permissions.ts`),
`tests/lib/catalogo-permessi.test.mjs`, `tests/web/shell-navigation.test.mjs`
(`/consensi` fra le destinazioni).

### 13. Inventario componenti

`Header, Sidebar, DashboardPageContainer, dashboardMainClassName,
SharedPageHeader, Badge, Button, Card*, Input, Label, Textarea, useToast
(toast-notification), useAuth, apiRequest, CONSENT_SUBJECT_KINDS,
normalizeConsentKey, canManageConsentDefinitions, canReadConsentRecords,
canRecordConsentDecision, FileCheck2, ShieldCheck, Undo2`.

Specifici della rotta (spariscono con la V2): i tre dizionari di etichette
(`ETICHETTA_STATO`, `ETICHETTA_SOGGETTO`, `ETICHETTA_DEFINIZIONE`),
`COLORE_STATO`, `formatData`, i quattro tipi locali.

---

## Endpoint e librerie

| Chiamata | Endpoint | Permesso server |
|---|---|---|
| definizioni | `GET /api/v1/consents?include_retired=1` | `consents.records.read` (lettura) |
| crea definizione | `POST /api/v1/consents { key, title, description, required }` | `consents.definitions.manage` |
| cambia stato | `PATCH /api/v1/consents/{id} { status }` | idem |
| pubblica testo | `POST /api/v1/consents/{id}/versions { body_text }` | idem |
| decisioni | `GET /api/v1/consents/{id}/records?limit=50` | `consents.records.read` |
| registra decisione | `POST /api/v1/consents/{id}/records { subject_kind, subject_id, subject_label, status, source: "manual", note }` | `consents.decide_for_others` |
| stati per soggetto | `GET /api/v1/consents/states?subject_kind=&subject_id=` | `consents.records.read` |

Il `PATCH` accetta anche `title`, `description`, `required`: la V1 non li
modifica dopo la creazione.

## Test collegati

Vedi §12.

## Inventario componenti

Vedi §13.

## Cosa non esiste in V1

- Modifica di titolo, descrizione e «obbligatorio» dopo la creazione.
- Un selettore di persone: il soggetto si identifica scrivendo l'**id** a
  mano (e il nome a mano). Nessuna lettura di atleti/soci/tutori.
- Lo storico dei testi pubblicati (le versioni precedenti): si vede solo
  «versione {n} del {data}».
- Filtri, ricerca, ordinamento, paginazione oltre `limit=50`, export.
- Conferma prima di ritirare/riattivare/revocare.
- Traduzione di `source` (la tabella mostra `manual`, `public_form`…).

## Sintesi

1. Una rotta, tre letture (definizioni, decisioni, stati per soggetto) e
   quattro scritture (crea, pubblica testo, cambia stato, registra decisione).
2. Tre permessi con tre chiavi, applicati in pagina come predicati
   client-safe: `consents.records.read`, `consents.definitions.manage`,
   `consents.decide_for_others`.
3. Lo stato di un consenso **si ricava** dallo storico; una revoca aggiunge
   una riga; nessuna decisione si cancella.
4. Stati: tre della definizione (Bozza / Attivo / Ritirato) e quattro della
   decisione (Accettato / Rifiutato / Revocato / Manca) + il fatto «versione
   precedente». `status.ts` ha `draft`, `active`/`ATTIVO`, ma non «Ritirato»,
   «Accettato», «Revocato», «Manca».
