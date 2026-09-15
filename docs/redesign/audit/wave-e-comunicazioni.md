# Wave E — Audit di parità: Comunicazioni (massiva, bacheca, automazioni)

> Inventario funzionale dell'implementazione V1 sul branch `feat/web-redesign`,
> scritto **prima** della migrazione al Web V2 (Addendum del brief). È il
> contratto di parità: niente sparisce. Nessuna proposta di design.
>
> Rotte coperte: `/communications` (comunicazione massiva alle famiglie),
> `/communications/bacheca` (annunci in bacheca), `/communications/automazioni`
> (regole che partono da sole). Componente condiviso:
> `src/components/communications/audience-events.ts`. Dominio puro letto per
> capire cosa il server accetta: `src/lib/audience/criteria.ts`,
> `src/lib/audience/recipients.ts` (`AUDIENCE_EXCLUSION_LABELS`),
> `src/lib/automations/catalog.ts`, `src/lib/announcements/model.ts`,
> `src/lib/communications/permissions.ts`; rotte `/api/v1/communications`,
> `/api/v1/announcements[/:id]`, `/api/v1/automations[/run]`.
>
> Metodo: lettura integrale di `src/app/communications/page.tsx` (678 righe),
> `bacheca/page.tsx` (536), `automazioni/page.tsx` (470), di `audience-events.ts`
> e dei tre gruppi di rotte; grep sui test.

---

## Indice

1. [`/communications` — comunicazione massiva](#communications--comunicazione-massiva)
2. [`/communications/bacheca` — bacheca](#communicationsbacheca--bacheca)
3. [`/communications/automazioni` — automazioni](#communicationsautomazioni--automazioni)
4. [Endpoint e librerie](#endpoint-e-librerie)
5. [Test collegati](#test-collegati)
6. [Inventario componenti](#inventario-componenti)
7. [Cosa non esiste in V1](#cosa-non-esiste-in-v1)
8. [Sintesi](#sintesi)

---

## `/communications` — comunicazione massiva

File: `src/app/communications/page.tsx`. Guscio: `Sidebar` + `Header
title="Comunicazioni"` + `DashboardPageContainer max-w-6xl` +
`SharedPageHeader title="Comunicazioni" subtitle="Scrivi alle famiglie {di
{clubName} | del club} e vedi chi raggiungi prima di mandare."`. Layout a due
colonne `lg:grid-cols-2`: card «Destinatari» (icona `Users`) e card
«Anteprima» (icona `Mail`).

### 1. Dati mostrati

- `clubName` da `readStoredActiveClub()?.name`.
- Opzioni dei criteri: categorie (`GET /api/v1/categories`), gruppi
  (`GET /api/v1/category_groups`), sedi (`GET /api/v1/club_sites`), eventi
  (`loadSelectableEvents()` → `GET /api/v1/events?from&to&status=scheduled`,
  finestra `EVENT_AUDIENCE_WINDOW_DAYS` = 30). Etichetta opzione:
  `name || label || title || id`; evento: `eventAudienceLabel`.
- **Anteprima** (`Preview`): `clubName`, `communicationId`, `criteriaLabel`,
  `reachable[]` (`email, name, athleteNames[], hasAccount`), `excluded[]`
  (`athleteName, guardianName, email, reason`), `counts {recipients,
  positions, excluded}`, `sample {to, subject, text, unresolved[]} | null`,
  `invalidPlaceholders[]`, `emailConfigured`, `canSend`, `blockedReason`.
  Mostrati: badge `{recipients} raggiungibili` (verde), `{excluded} esclusi`
  (ambra), `criteriaLabel` (outline); `blockedReason` in riquadro ambra con
  `AlertTriangle`; blocco «Come lo leggera {sample.to}» con `subject`,
  `text` in `pre`, «Senza valore: {unresolved.join(", ")}» (ambra); tabella
  degli esclusi (nome atleta · `AUDIENCE_EXCLUSION_LABELS[reason] || reason`)
  in un box `max-h-48 overflow-y-auto`. **Non mostrati**: `reachable[]`
  (nomi dei raggiungibili), `counts.positions`, `invalidPlaceholders`,
  `emailConfigured`, `hasAccount`.
- **Esito** (`Outcome`): «Inviati {sent} · saltati {skipped} · falliti
  {failed}», pulsante «Continua: restano {remaining}» se `remaining > 0`,
  elenco `deliveries[]` (`email || name || "—"` a sinistra; a destra
  `status` grezzo in inglese `sent|skipped|failed` colorato verde/rosso/grigio
  + ` · {reason}`), box `max-h-40 overflow-y-auto`.

### 2. Azioni

Intestazione: **Bacheca** (`<a href="/communications/bacheca">`),
**Automazioni** (`/communications/automazioni`), **Nuova comunicazione**
(`nuovaComunicazione`: azzera anteprima, esito, oggetto, testo, selezione e
**genera un nuovo `communicationId`** in `sessionStorage`
`easygame_communication_id`). Card destinatari: **Parti da un testo**
(ghost, imposta `TESTO_DI_PARTENZA`: oggetto «Comunicazione da
{{club.name}}», corpo «Gentile {{recipient.name}}, … Un saluto, {{club.name}}»),
**Vedi chi raggiungo** (`richiedi("preview")`, etichetta «Calcolo…» mentre
`busy === "preview"`). Card anteprima: **Manda a {counts.recipients}**
(`richiedi("send")`, «Invio…», `disabled={!preview.canSend || busy !== ""}`,
blu), **Continua: restano {remaining}** (`richiedi("send")`, stesso
`communicationId`: il server salta chi è già stato raggiunto).

### 3. Moduli

Un solo modulo, senza `<form>`:

| Campo | Tipo | Valore iniziale | Validazione |
|---|---|---|---|
| Criterio (`criterio`) | `select` su `CRITERI_OFFERTI` (9 voci: `all_families, category_ids, group_ids, site_ids, event_convocated, event_no_rsvp, overdue_payments, certificate_missing_or_expiring, no_account`; etichette `AUDIENCE_CRITERION_LABELS`) | `all_families` | cambiare criterio azzera `selected` e `preview` |
| Seleziona | elenco di checkbox (`opzioni`), visibile solo se `audienceCriterionNeedsSelection(kind)`; se vuoto: «Nessun evento in programma con la conferma di presenza attiva: accendila sull'evento per poter scrivere a chi non ha risposto.» (`event_no_rsvp`) · «Nessun evento in programma nei prossimi 30 giorni.» (`event_convocated`) · «Nessuna voce disponibile per questo criterio.» | `[]` | ogni cambio azzera `preview` |
| Oggetto (`oggetto`) | `Input`, placeholder `Comunicazione da {{club.name}}` | `""` | obbligatorio |
| Messaggio (`testo`) | `Textarea h-40`, placeholder `Gentile {{recipient.name}}, ...`; nota «Segnaposto disponibili: `{{club.name}}`, `{{recipient.name}}`, `{{athlete.first_name}}`.» | `""` | obbligatorio |

Validazione client in `richiedi` (toast di errore): «Oggetto e testo del
messaggio sono obbligatori»; se `richiedeSelezione && selected.length === 0`:
«Nessuna voce disponibile per questo criterio: scegline un altro» (se
`opzioni.length === 0`) altrimenti «Seleziona almeno una voce per questo
criterio».

Payload: `POST /api/v1/communications { criteria: [{kind} | {kind, values}],
template: {subject, body}, communication_id, preview?: true }`. Errore →
toast `response.error?.message || "Operazione non riuscita"`. Invio → toast
`success` «Inviato a {sent} destinatari» oppure `error` «Nessun messaggio
inviato: leggi l'esito per destinatario».

### 4. Filtri / viste

Nessuno.

### 5. Azioni di massa

Nessuna (l'invio è di per sé massivo).

### 6. Esportazioni

Nessuna.

### 7. Permessi

- Rotta in `MANAGEMENT_PATHS` **e** in `MANAGEMENT_ADMIN_ONLY_PATH_PREFIXES`
  (`/communications`): solo `owner` e `club_manager` (e i ruoli
  personalizzati su quella base, ristretti dal catalogo).
- Nessun predicato client sulla pagina. Il server pretende
  `communications.send` (invio e anteprima), `communications.read_recipients`
  (elenco nominativo), `communications.audience_economic` (criterio
  `overdue_payments`). Matrice: `src/lib/communications/permissions.ts`
  (`hasCommunicationPermission` passa da `narrowDomainPermission`).
- Il commento in pagina dichiara che nessun criterio è nascosto per ruolo:
  la rotta è già riservata ai ruoli con la matrice piena.

### 8. Stati

- Anteprima assente: «Scrivi il messaggio e premi «Vedi chi raggiungo»: nessun
  invio parte prima di questo passaggio.»
- `busy`: «Calcolo…» / «Invio…» sui pulsanti; entrambi disabilitati.
- `blockedReason` (dal server, es. SMTP non configurato): riquadro ambra,
  `canSend = false`.
- Stato per consegna: `sent | skipped | failed` (grezzo).
- Nessuno stato di caricamento per le opzioni; nessuno stato di errore per
  le letture (`catch(() => undefined)`).

### 9. Flussi distruttivi

L'invio è **irreversibile** ma senza conferma: la difesa è l'anteprima
obbligatoria (il pulsante «Manda» esiste solo dopo `preview`) e
l'identificativo di comunicazione persistito in `sessionStorage`, che rende
idempotente il doppio clic e il ricaricamento.

### 10. Navigazione e parametri

In uscita: `/communications/bacheca`, `/communications/automazioni`. Nessun
parametro in entrata. `sessionStorage.easygame_communication_id` sopravvive
al ricaricamento e viene rigenerato solo da «Nuova comunicazione».

### 11. Schede/sezioni

Nessuna: due card affiancate.

### 12. Test collegati

Vedi [Test collegati](#test-collegati).

### 13. Inventario componenti

`Sidebar, Header, DashboardPageContainer, dashboardMainClassName,
SharedPageHeader, Badge, Button, Card*, Input, Label, Textarea, useToast`;
lucide `AlertTriangle, Eye, Mail, Send, Users`; lib `apiRequest,
readStoredActiveClub, AUDIENCE_EXCLUSION_LABELS, AUDIENCE_CRITERION_LABELS,
AudienceCriterionKind`; condiviso `audience-events.ts`
(`audienceCriterionNeedsSelection, eventAudienceOptions, isEventAudienceKind,
loadSelectableEvents, EVENT_AUDIENCE_WINDOW_DAYS, SelectableEvent`).

---

## `/communications/bacheca` — bacheca

File: `src/app/communications/bacheca/page.tsx`. `Sidebar` + `Header
title="Bacheca"` + `DashboardPageContainer max-w-6xl` + `SharedPageHeader
title="Bacheca" subtitle="Gli avvisi che restano: chi li legge lo decidi tu,
e vedi quanti li hanno aperti."`. Layout `lg:grid-cols-[380px_1fr]`: card
«Nuovo avviso» (`Megaphone`) a sinistra, scaffali a destra.

### 1. Dati mostrati

`GET /api/v1/announcements` → `Announcement[]`: `id, title, body, status
("draft"|"published"), publishAt, expiresAt, publishedAt, criteria[], shelf
("draft"|"scheduled"|"current"|"expired"), audienceCount, readCount`.
Quattro scaffali (`SCAFFALI`), **mostrati solo se non vuoti**, con conteggio
fra parentesi: Bozze · Programmati · In bacheca · Scaduti. Per annuncio:
titolo, corpo `line-clamp-2`, badge `Eye {readCount}/{audienceCount}` (solo
se `status === "published"`), badge `CalendarClock {publishAt}` (data lunga
`it-IT`, solo se presente). **Non mostrati**: `expiresAt`, `publishedAt`,
`criteria` (chi lo legge), `body` intero.

### 2. Azioni

Per annuncio: **Pubblica** (`status === "draft"`, `POST
/api/v1/announcements/{id} {action: "publish"}`) → toast `success` «In
bacheca per {delivered} famiglie{, {withoutAccount} senza account}» oppure
`error` «Nessuna famiglia con un account puo leggerlo»; **Ritira** (`shelf
∈ {current, scheduled}`, `{action: "withdraw"}`) → toast «Annuncio ritirato
dalla bacheca». Errore → `response.error.message || "Operazione non
riuscita"`. Dopo ogni azione `carica()`. Nessuna conferma. **Nessuna
modifica né eliminazione** (la rotta `PATCH` esiste ma nessuna schermata la
usa; non esiste `DELETE`).

### 3. Moduli

«Nuovo avviso» (senza `<form>`):

| Campo | Tipo | Iniziale | Validazione |
|---|---|---|---|
| Titolo (`titolo`) | `Input`, placeholder «Domenica il campo e chiuso» | `""` | obbligatorio (pulsante disabilitato se vuoto) |
| Testo (`corpo`) | `Textarea h-28` | `""` | obbligatorio (idem) |
| Chi lo legge (`pubblico`) | `select` su `CRITERI_OFFERTI` (6 voci: `all_families, category_ids, group_ids, site_ids, event_convocated, event_no_rsvp`) | `all_families` | cambio azzera `selected` |
| Selezione | checkbox come in `/communications`, stessi tre testi di vuoto | `[]` | se `richiedeSelezione` e vuoto → toast «Nessuna voce disponibile per questo criterio: scegline un altro» / «Seleziona almeno una voce per questo criterio» |
| Esce il (`dal`) | `date` | `""` | — |
| Scade il (`al`) | `date` | `""` | server: scadenza dopo la pubblicazione |

Nota sotto le date: «Senza data esce quando lo pubblichi. Un avviso scaduto
non viene cancellato: esce dalla bacheca e resta in archivio.» Pulsante
**Salva come bozza** (`disabled={busy || !title.trim() || !body.trim()}`) →
`POST /api/v1/announcements {title, body, criteria, publishAt|null,
expiresAt|null}` → toast «Bozza salvata: pubblicala quando vuoi», campi
azzerati, `carica()`. Errore → `response.error?.message || "Annuncio non
creato"`. Server (`normalizeAnnouncementDraft`): «Un annuncio senza titolo
non si pubblica», «Un annuncio senza testo non si pubblica», «Nessun
destinatario: scegli chi deve leggere l'annuncio», scadenza ≤ uscita
rifiutata.

### 4–6. Filtri, massa, export

Nessuno.

### 7. Permessi

Come `/communications` (prefisso admin-only). Server: `board.publish` per
lettura elenco, creazione, pubblicazione, ritiro. Nessun predicato client.

### 8. Stati

- Caricamento: card «Carico la bacheca…».
- Vuoto: card «Nessun avviso. Il primo che scrivi resta in bacheca finche non
  scade, e chi arriva dopo lo trova.»
- Errore di lettura: toast `response.error.message || "Bacheca non
  leggibile"` (elenco resta vuoto).
- `busy` disabilita tutti i pulsanti.
- Scaffale come stato: Bozze / Programmati / In bacheca / Scaduti.

### 9. Flussi distruttivi

**Ritira** è reversibile (si ripubblica) e non chiede conferma.

### 10. Navigazione

Nessun link in uscita (la pagina madre porta qui). Nessun parametro.

### 11. Schede

Nessuna.

### 13. Inventario componenti

Come `/communications` più lucide `CalendarClock, Eye, Megaphone, Send,
Undo2`; `AudienceOption` da `audience-events.ts`.

---

## `/communications/automazioni` — automazioni

File: `src/app/communications/automazioni/page.tsx`. `Sidebar` + `Header
title="Automazioni"` + `DashboardPageContainer max-w-5xl` + `SharedPageHeader
title="Automazioni" subtitle="I messaggi che {clubName || "il club"} manda
da solo: quando partono, a chi, e con quali parole."`. Sotto: paragrafo «Il
giro parte ogni notte. Un anticipo gia trascorso non viene recuperato
all'indietro: accendere oggi una regola «7 giorni prima» non manda niente per
una scadenza fra due giorni.»

### 1. Dati mostrati

`GET /api/v1/automations` → `{clubName, rules[]}`; `RuleView`: `id, trigger,
enabled, offsetDays[], audience, delivery, template {subject, body},
categories[], updatedAt, label, description, direction ("before"|"after"),
defaultOffsetDays[], supportsCategoryFilter, sample {subject, text,
unresolved[]}`. Cinque trigger (`AUTOMATION_TRIGGER_KINDS`:
`installment_due, installment_overdue, certificate, event_rsvp,
document_expiry`). Una card per regola: titolo `label` (`Timer`),
interruttore «Accesa/Spenta», `description`, i campi, il blocco «Anteprima
con dati di esempio» (`sample.subject`, `sample.text` in `pre`, «Segnaposto
senza valore:» + badge per `unresolved`, nota «L'anteprima usa dati
inventati. Serve a vedere la forma del messaggio e i segnaposto che restano
vuoti.»), riga «Predefiniti: {defaultOffsetDays → describeAutomationOffset}».
**Non mostrato**: `updatedAt`.

### 2. Azioni

Intestazione: **Comunicazioni** (`Link` a `/communications`), **Esegui
adesso** (`POST /api/v1/automations/run {}`; `busy = "run"`) → toast
`success` se `totals.sent > 0` altrimenti `info`: «Occorrenze trovate:
{occurrences} · inviati {sent} · saltati {skipped} · falliti {failed}»;
errore → `response.error?.message || "Esecuzione non riuscita"`. Per regola:
**Salva** (`salva(rule)`, `disabled={busy !== ""}`) → `POST
/api/v1/automations {rule: {trigger, enabled, offsetDays: parseOffsets,
audience, delivery, template, categories: supportsCategoryFilter ?
parseCategories : []}}` → toast «{label}: configurazione salvata» + `carica()`;
errore → `response.error.message || "Salvataggio non riuscito"`.

### 3. Moduli (uno per regola, stato locale `rules` + `offsetText` + `categoryText`)

| Campo | Tipo | Iniziale | Note |
|---|---|---|---|
| Accesa/Spenta | checkbox nell'intestazione, etichetta «Accesa» / «Spenta» | `rule.enabled` | — |
| Anticipi (giorni, al massimo `MAX_AUTOMATION_OFFSETS`=3) (`anticipi-{trigger}`) | `Input inputMode=numeric`, testo libero «7, 3» | `offsetDays.join(", ")` | `parseOffsets` scarta ciò che non è un numero; aiuto: elenco `describeAutomationOffset(direction, days)` unito con « · » oppure «Nessun anticipo: la regola non parte» |
| Pubblico (`pubblico-{trigger}`) | `select` su `AUTOMATION_AUDIENCES` (`family, club, both`; etichette «Alla famiglia», «Alla societa», «Alla famiglia e alla societa») | `rule.audience` | — |
| Come arriva alla societa (`consegna-{trigger}`) | `select` su `AUTOMATION_DELIVERIES` (`immediate` «Notifica singola», `digest` «Riepilogo giornaliero alla societa»); **`disabled={rule.audience === "family"}`** | `rule.delivery` | aiuto: «Il riepilogo raccoglie in una sola email al giorno tutto cio che riguarda la societa. Alla famiglia arriva sempre il messaggio che la riguarda.» |
| Documenti da sorvegliare (`categorie-{trigger}`) | `Input` + `datalist` su `SUGGESTED_ATTACHMENT_CATEGORIES`, placeholder «blsd, documento-identita»; **solo se `supportsCategoryFilter`** | `categories.join(", ")` | aiuto: «Separa le categorie con una virgola. Lascia vuoto per sorvegliare tutti i documenti con una scadenza. Il certificato medico resta fuori: lo governa la regola «Certificato medico», e due regole sulla stessa data sarebbero due promemoria.» |
| Oggetto (`oggetto-{trigger}`) | `Input` | `template.subject` | — |
| Testo (`testo-{trigger}`) | `Textarea rows=10` | `template.body` | — |

Nessuna validazione client oltre `parseOffsets`; il server rifiuta
(`MAX_AUTOMATION_OFFSETS`, `MAX_AUTOMATION_OFFSET_DAYS` 120,
`MAX_AUTOMATION_CATEGORIES` 20). **Nessuna guardia** sulle modifiche non
salvate; **l'interruttore non salva da solo** (serve «Salva»).

### 4–6. Filtri, massa, export

Nessuno.

### 7. Permessi

Come `/communications` (prefisso admin-only). Server: `automations.manage`
(lettura, salvataggio, esecuzione). Nessun predicato client.

### 8. Stati

- Caricamento: «Caricamento…».
- Errore di lettura: card rossa con `AlertTriangle` + `errore`
  (`response.error?.message || "Lettura non riuscita"`); l'elenco resta vuoto.
- `busy` (trigger in salvataggio o `"run"`) disabilita tutti i pulsanti.
- Regola accesa/spenta (interruttore).

### 9. Flussi distruttivi

**Esegui adesso** manda email reali a tutte le occorrenze del giorno senza
conferma. Nessuna eliminazione (le regole sono un catalogo chiuso).

### 10. Navigazione

In uscita: `/communications`. Nessun parametro.

### 11. Schede

Nessuna: una card per regola, impilate.

### 13. Inventario componenti

`Link, Sidebar, Header, DashboardPageContainer, SharedPageHeader, Badge,
Button, Card*, Input, Label, Textarea, useToast`; lucide `AlertTriangle, Eye,
Play, Save, Timer`; lib `apiRequest, AUTOMATION_AUDIENCES,
AUTOMATION_AUDIENCE_LABELS, AUTOMATION_DELIVERIES, AUTOMATION_DELIVERY_LABELS,
MAX_AUTOMATION_OFFSETS, describeAutomationOffset, SUGGESTED_ATTACHMENT_CATEGORIES`.

---

## Endpoint e librerie

| Chiamata | Endpoint | Permesso server |
|---|---|---|
| anteprima | `POST /api/v1/communications { …, preview: true }` | `communications.send` (+ `audience_economic` per `overdue_payments`, `read_recipients` per i nomi) |
| invio / continua | `POST /api/v1/communications { criteria, template, communication_id }` | idem |
| elenco bacheca | `GET /api/v1/announcements` | `board.publish` |
| nuova bozza | `POST /api/v1/announcements` | `board.publish` |
| pubblica / ritira | `POST /api/v1/announcements/:id { action }` | `board.publish` |
| regole | `GET /api/v1/automations` | `automations.manage` |
| salva regola | `POST /api/v1/automations { rule }` | `automations.manage` |
| esegui adesso | `POST /api/v1/automations/run` | `automations.manage` |
| opzioni | `GET /api/v1/categories`, `/category_groups`, `/club_sites`; eventi via `loadSelectableEvents` | risorse generiche |

## Test collegati

- `tests/ui/communications-event-audience.test.mjs` — legge
  `app/communications/page.tsx` e `app/communications/bacheca/page.tsx`:
  `const CRITERI_OFFERTI = [...] as const` con i due criteri di evento;
  `loadSelectableEvents`, `eventAudienceOptions`,
  `audienceCriterionNeedsSelection` presenti; **nessun** `/api/v1/events` in
  pagina; classe `min-w-0 flex-1 break-words` sull'etichetta di un'opzione.
- `tests/ui/responsive-invariants.test.mjs` — `app/communications/automazioni/page.tsx`
  in `TOUCHED` (nessun `grid-cols-2/3` senza breakpoint).
- `tests/lib/communication-permissions.test.mjs`,
  `tests/lib/catalogo-permessi.test.mjs`,
  `tests/lib/presidi-che-nessuno-copriva.test.mjs` — dominio
  `lib/communications/permissions.ts` (non toccato).

## Inventario componenti

Condiviso (resta, si riusa): `src/components/communications/audience-events.ts`.
Specifico delle tre rotte (inline, si rimuove con la migrazione): il
`select` nativo dei criteri, l'elenco di checkbox, le card `slate`, i box
`max-h-*`, `formatDate` della bacheca, `offsetsToText/parseOffsets/
parseCategories` (si spostano nel modulo V2), il testo di partenza.

## Cosa non esiste in V1

- Nessun elenco delle comunicazioni inviate (nessuna rotta lo espone).
- Nessuna modifica di un annuncio dalla schermata (la rotta `PATCH` esiste
  ma non ha superficie: **non si inventa**, si segnala al lead).
- Nessuna eliminazione di annunci (nessuna rotta).
- Nessun allegato all'annuncio dalla schermata (`attachmentIds` nel modello,
  nessun campo).
- Nessuna guardia sulle modifiche non salvate in nessuna delle tre pagine.

## Sintesi

1. Tre rotte, un dominio (`communications/permissions.ts`), tutte riservate
   a proprietario e gestore dal prefisso admin-only; nessun predicato client.
2. La comunicazione massiva è **anteprima obbligatoria → invio**, con esito
   per destinatario e ripresa a lotti sullo stesso identificativo persistito
   in `sessionStorage`.
3. La bacheca è un modulo di bozza + quattro scaffali con pubblica/ritira e i
   due contatori (`readCount/audienceCount`).
4. Le automazioni sono cinque regole chiuse, ciascuna con interruttore,
   anticipi, pubblico, consegna, filtro documenti (una sola), oggetto, testo,
   anteprima con dati finti e «Salva» per regola; più «Esegui adesso».
5. Stati non nel sistema: consegna `sent|skipped|failed`, scaffale
   `draft|scheduled|current|expired`, regola `accesa|spenta`.
