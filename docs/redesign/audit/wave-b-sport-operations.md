# Wave B — Audit di parita funzionale: Dashboard, Allenamenti, Categorie, Certificati Medici

> Documento di sola lettura del comportamento **attuale** (V1, branch
> `feat/web-redesign`) di quattro superfici Web. Non propone design. E il
> contratto di parita per la ridisegnazione: ogni comportamento elencato qui
> deve restare raggiungibile dopo il redesign, salvo decisione esplicita
> contraria.
>
> Percorso dei file sorgente: `E:\Download\easygame` (radice repo). Le
> etichette sono riportate **esattamente** come compaiono nel codice
> (italiano, maiuscole comprese).

---

## 0. Avvertenza preliminare — due dashboard, non una

`/dashboard` ha **due implementazioni indipendenti** nel repository attuale,
ed entrambe sono raggiungibili in produzione:

1. **`src/app/dashboard/page.tsx`** — la dashboard attiva e mantenuta. Legge
   tutto con `loadClubDashboardOverview` (`src/lib/dashboard/club-overview.ts`)
   in un'unica lettura parallela (ottimizzata: prima erano 29 richieste, ora
   4). Mostra: riquadro Allenamenti + Certificati affiancati, tre schede
   laterali (Gare/Appuntamenti/Promemoria), `OnboardingResumeCard`,
   `MetricsOverview`. **Nessuna tab.**
2. **`src/app/dashboard/[dashboardId]/page.tsx`** — implementazione piu
   vecchia, con `Tabs` (`overview`), tre card colorate "Appuntamenti di
   Oggi / Gare di Oggi / Promemoria Attivi", `RecentActivity`,
   `UpcomingTrainings` e `CertificationAlerts` non embedded. Legge i dati con
   sei `await` consecutivi e query dirette Supabase (`organizations`/`clubs`,
   poi `getClubData`/`getClubAthletes`).

**Perche la seconda esiste ancora**: `src/app/token-verification/[userId]/page.tsx`
(il completamento login/invito) e `src/lib/auth.ts` interrogano ancora una
tabella legacy `dashboards` (`organization_id` → riga dashboard) e, se una riga
esiste (o viene creata al volo), **reindirizzano** i ruoli di direzione a
`/dashboard/{dashboardId}?clubId=...` — cioe alla versione vecchia. Il flusso
"normale" post-login (`getAccessRedirectPath` in `src/lib/access-roles.ts`,
usato da `AccessAreaGuard`) invece porta sempre a `/dashboard?clubId=...` —
la versione nuova, senza id. Le due strade non sono coordinate: un utente puo
arrivare all'una o all'altra a seconda del percorso di ingresso (verifica
token vs. normale navigazione). **Un redesign deve decidere esplicitamente
cosa fare di `[dashboardId]/page.tsx`** e della tabella `dashboards`, perche
oggi non e morta — e wired nel flusso di attivazione account
(`ClubCreationForm.tsx` la scrive in creazione club).

---

## 1. `/dashboard`

### 1.1 Data shown (versione corrente, `src/app/dashboard/page.tsx`)

Fonte dati unica: `loadClubDashboardOverview(clubId)` →
`{ club, athletes, certificates }`, con `club` che porta gia
`appointments`, `notes` (colonna `secretariat_notes`), `matches`,
`categories`, `trainings` come colonne JSON della riga club (`/api/v1/clubs`
con `fields=logo_url,appointments,secretariat_notes,matches,categories,trainings`),
`athletes` in proiezione `summary` (`getClubAthletes(clubId, { view: "summary" })`)
e `certificates` da `/api/v1/medical_certificates?organization_id=...&select=id,athlete_id,type,expiry_date`.

- **Logo/nome club** (header mobile, visibile solo `lg:hidden`): da
  `clubInfo.logo_url` (fallback `club_logo.png`) e `clubInfo.name`.
- **`OnboardingResumeCard`** — vedi §1.6.
- **`PageHeading`** — titolo "Dashboard", sottotitolo
  `Benvenuto nella dashboard di ${clubInfo.name}` o, senza club,
  `Benvenuto nella dashboard di gestione del tuo club sportivo.`
- **Riquadro "Allenamenti del giorno"** (`UpcomingTrainings`, `variant="embedded"`,
  `maxHeight="390px"`) — filtra gli allenamenti di **oggi soltanto** (non gli
  altri giorni: nota esplicita nello stato vuoto). Per ciascuno: badge
  categoria (colore da `getTrainingCategoryColor`), titolo, orario
  (`Clock`), luogo (`MapPin`), allenatore + rapporto presenze `X/Y Atleti`
  (`Users`) + stato se diverso da upcoming (`Concluso`/`Annullato`), stato
  presenze (`Presenze salvate` espandibile con elenco nome+segno presente/assente,
  `Presenze in corso`, `Presenze non registrate`). Pulsante **Presenze** che
  naviga a `/training?focus=attendance&trainingId=<id>&date=<yyyy-mm-dd>&clubId=<id>`.
- **Riquadro "Avvisi Certificati"** (`CertificationAlerts`, `source="provided"`,
  `variant="embedded"`, `maxHeight="290px"`) — alimentato da
  `buildCertificateAlerts` (client-side, dagli stessi `athletes`+`certificates`
  gia letti): un alert per atleta **attivo**, stato `expired`/`expiring`
  (finestra `CERTIFICATE_WARNING_DAYS = 30`)/`missing`; mostra fino a
  `MAX_VISIBLE_ALERTS = 8`, poi bottone "+N altri atleti con certificato
  scaduto, in scadenza o mancante. Vai alla pagina certificati". Icone/badge:
  `AlertCircle` rosso "Scaduto", `Clock` ambra "In Scadenza",
  `AlertCircle` grigio "Mancante", `CheckCircle` grigio "Valido" (stato
  `valid` non prodotto lato dashboard, ma gestito nel componente). Pulsante
  header "Vedi Tutti" → `/medical`.
- **Schede laterali** (`DashboardSideCard`, gradiente colorato, `aside` a
  destra ≥ xl, sotto in griglia 3 colonne ≥ sm):
  - **Gare** (`Trophy`, arancio→rosa) — count = `todayMatches.length` (in
    realta tutte le **prossime** partite non annullate, non solo "oggi":
    `selectUpcomingMatches` filtra `date >= oggi && status !== "cancelled"`).
    Ogni item: `vs {opponent}` o titolo, data+ora, categoria, badge
    `MatchCertificateWarningBadge` se ci sono convocati con certificato non
    valido. Click card → `/matches`.
  - **Appuntamenti** (`Calendar`, viola→fucsia) — count = prossimi
    appuntamenti (`selectUpcomingAppointments`, `date >= oggi`, ordinati per
    data+ora). Item: titolo, data+ora, persona/atleta. Click card →
    `/secretariat`.
  - **Promemoria** (`Bell`, lime→verde) — count = note attive
    (`selectActiveNotes`: senza `expiryDate` o `expiryDate >= oggi`). Item:
    contenuto nota, "Scade {data}" o "Promemoria attivo". Click card →
    `/secretariat`.
  - Ogni card, se vuota: testo dedicato ("Nessuna gara in programma" /
    "Nessun appuntamento in agenda" / "Nessun promemoria attivo") e comunque
    un link "Vedi tutte" con freccia.
- **`MetricsOverview`** (in fondo pagina, dati passati come props gia
  calcolati da `buildDashboardMetrics`, **non** ricalcolati dal componente
  perche `organizationId` non e passato in questa pagina):
  - "Atleti Totali" (blu, `Users`) — atleti con `status === "active"` (o
    assente = attivo). Click → `/athletes`.
  - "Categorie Attive" (verde, `Layers`) — `club.categories.length`. Click →
    `/categories`.
  - "Allenamenti in Programma" — testo card e "Allenamenti in programma"?
    In realta titolo card e cablato nel componente come
    **"Certificati in Scadenza"** per la terza e **"Certificati Scaduti"**
    per la quarta; la terza metrica passata come prop e
    `upcomingTrainings` **ma il componente non ha una card per gli
    allenamenti in questa pagina** — la quarta card visibile e
    "Certificati in Scadenza" (arancio, `AlertCircle`, click → `/medical`) e
    la quinta "Certificati Scaduti" (rosso, `AlertCircle`, click →
    `/medical`). `upcomingTrainings` (allenamenti nei prossimi 30 giorni,
    esclusi annullati) e calcolato ma **non renderizzato** da nessuna card in
    questa variante di `MetricsOverview` (il componente ha solo 4 card:
    Atleti, Categorie, Certificati in Scadenza, Certificati Scaduti — la
    metrica "allenamenti" resta calcolata e inutilizzata sopra la piega).

### 1.2 Actions

| Elemento | Azione | Target/API |
|---|---|---|
| Card "Gare" | click | `router.push("/matches")` |
| Card "Appuntamenti" | click | `router.push("/secretariat")` |
| Card "Promemoria" | click | `router.push("/secretariat")` |
| Pulsante "Presenze" su un allenamento | click | `window.location.href = /training?focus=attendance&trainingId=&date=&clubId=` |
| "Presenze salvate ▼/▲" | toggle espansione | client-side, poi `GET` (via Supabase) `training_attendance` filtrato per `training_id`(+`organization_id`) |
| Card metrica "Atleti Totali" | click | `window.location.href = "/athletes"` |
| Card metrica "Categorie Attive" | click | `window.location.href = "/categories"` |
| Card metrica "Certificati in Scadenza"/"Certificati Scaduti" | click | `window.location.href = "/medical"` |
| "Vedi Tutti" (Avvisi Certificati) | click | `router.push("/medical")` |
| Pulsante "Vedi" su un singolo alert certificato | click | `router.push(/athletes/{id}?clubId=&tab=sanitari#sanitari)` |
| Pulsante "Invia Promemoria" su un alert (stati expired/expiring/missing) | click | `POST /api/medical-certificate-reminders` `{ athleteId, certificateId, organizationId }` → toast esito |
| `OnboardingResumeCard` → "Riprendi" | click | `router.push("/onboarding")` |

### 1.3 Forms

Nessun form di creazione/modifica nella pagina stessa. L'unica interazione a
scrittura e l'invio di un promemoria certificato (vedi Actions).

### 1.4 Filtri / ricerca / ordinamento / viste

Nessun filtro utente-selezionabile. Filtri impliciti e fissi nel codice:
- Allenamenti: solo quelli **di oggi** (`isTrainingOnDate(training, oggi)`).
- Gare/Appuntamenti: solo **futuri o oggi**, ordinati per data poi ora
  (`compareByDateThenTime`).
- Promemoria: attivi (senza scadenza o non ancora scaduti).
- Avvisi certificati: solo atleti attivi; ordine
  scaduto → in scadenza → mancante, poi per data scadenza poi nome.

Nessuna vista salvata / `localStorage` specifica per questa pagina oltre ad
`activeClub` (sincronizzato, non specifico della dashboard).

### 1.5 Bulk actions / selection

Nessuna.

### 1.6 Onboarding / Setup guide

- **`OnboardingResumeCard`** (`src/components/dashboard/onboarding-resume-card.tsx`):
  legge `GET /api/v1/clubs?id=<clubId>&fields=settings`, normalizza con
  `normalizeOnboardingState`. Visibile solo se `canResumeOnboarding(state)` e
  vero (onboarding non completato). Testo: se `progress.completed === 0` →
  "Configura il club in cinque passi", altrimenti "Riprendi la configurazione
  iniziale"; sotto, `{completed}/{total} completati · prossimo passo:
  {nextStep.title || "conclusione"}`. Bottone "Riprendi" → `/onboarding`. I
  cinque passi (`ONBOARDING_STEPS`, `src/lib/onboarding.ts`): **Dati del
  club**, **Stagione**, **Categorie**, **Primi atleti**, **Le aree di
  EasyGame** (tour).
- **`SetupGuide.tsx`** (`src/components/dashboard/SetupGuide.tsx`) — popup
  flottante "Guida alla configurazione" con elenco puntato e pulsanti "Salta"
  / "Inizia tour", minimizzabile. **Componente orfano**: nessun import in
  tutto `src/` (grep negativo). Non renderizzato da nessuna pagina —
  candidato a rimozione, non a parita.
- **`AccessCodeGenerator.tsx`** — card "Codice di accesso" /
  "Genera un codice temporaneo da condividere con il nuovo membro." con
  pulsante "Genera codice" (genera 10 caratteri alfanumerici via
  `crypto.getRandomValues`, solo client-side, **nessuna persistenza/API**).
  **Componente orfano**: nessun import in `src/`. Candidato a rimozione.
- **`NewDashboard.tsx`** — dashboard "categorie" con dati **hard-coded**
  (Under 10/12/14/16 con conteggi finti), campo ricerca non funzionante,
  bottone "Nuova Categoria" senza azione (storyboard). **Componente orfano**:
  nessun import in `src/`. Candidato a rimozione.

### 1.7 Permessi / role gates

- L'intera area `/dashboard` e dietro `AccessAreaGuard`
  (`src/components/auth/access-area-guard.tsx`) via
  `src/app/dashboard/layout.tsx`.
- `/dashboard` e in `MANAGEMENT_PATH_PREFIXES` (`src/lib/access-roles.ts`):
  raggiungibile dai ruoli di gestione (owner, club_manager, collaborator,
  staff — cfr. `GESTIONE` in `src/lib/permissions/catalog.ts`), non da
  trainer/athlete/parent (che hanno le proprie dashboard dedicate:
  `/trainer-dashboard`, `/athlete-dashboard`, `/parent-view`).
- Nessun controllo di permesso puntuale (`canAccessClubResource`) dentro
  `page.tsx`: la pagina assume che chi arriva a `/dashboard` abbia gia
  diritto a vedere tutto cio che mostra (il filtro fine e sulle singole API
  chiamate, es. certificati/atleti).

### 1.8 States

- **Loading iniziale**: nessuno skeleton a livello pagina; i sotto-componenti
  (`UpcomingTrainings`, `CertificationAlerts`) mostrano skeleton animati
  propri (`animate-pulse`) mentre `isLoading` e vero.
- **Nessun club risolvibile** (`clubId` non risolvibile da query string ne da
  `localStorage.activeClub`): `isLoading` passa a `false` e la pagina
  renderizza comunque la struttura con tutti i dati a zero/vuoti (nessun
  messaggio "nessun club selezionato" esplicito in questa pagina).
- **Vuoto per sezione**: testi dedicati gia elencati in §1.1 (Gare,
  Appuntamenti, Promemoria, "Nessun allenamento programmato per oggi" +
  "Gli allenamenti di altri giorni non compaiono qui", "Nessun avviso sui
  certificati" + "Gli avvisi sui certificati in scadenza appariranno qui").
- **Errore**: `console.warn("Error loading dashboard data:", error)` — nessun
  banner d'errore mostrato all'utente in questa pagina.

### 1.9 Destructive flows

Nessuno diretto in questa pagina.

### 1.10 Navigazione

- Query param letti: `clubId` **o** `organizationId` (fallback
  `localStorage.activeClub.id`).
- Link in uscita: `/matches`, `/secretariat` (×2), `/athletes`, `/categories`,
  `/medical` (×3), `/onboarding`, `/training?focus=attendance&trainingId=&date=&clubId=`,
  `/athletes/{id}?clubId=&tab=sanitari#sanitari`.
- Nessun deep-link **in ingresso** con parametri di stato oltre a
  `clubId`/`organizationId` (niente `?tab=` o simili sulla pagina stessa).

### 1.11 Component inventory — `/dashboard`

| File | Ruolo | Uso |
|---|---|---|
| `src/app/dashboard/page.tsx` | Pagina corrente, orchestratore | pagina |
| `src/app/dashboard/[dashboardId]/page.tsx` | Dashboard legacy con tabs, ancora raggiunta da `token-verification` e da `auth.ts`/`ClubCreationForm.tsx` in creazione club | pagina, duplicato non rimosso |
| `src/components/dashboard/NewDashboard.tsx` | Mock "gestione categorie" con dati hard-coded | **orfano**, candidato rimozione |
| `src/components/dashboard/MetricsOverview.tsx` | 4 card metriche (atleti/categorie/certificati scadenza/certificati scaduti); sa anche auto-caricarsi via `organizationId` (usato dalla variante `[dashboardId]`) | condiviso fra le due dashboard |
| `src/components/dashboard/CertificationAlerts.tsx` | Riquadro avvisi certificati, con invio promemoria; sa auto-caricarsi (`source="self"`) o ricevere dati (`source="provided"`) | condiviso, dominio da preservare |
| `src/components/dashboard/UpcomingTrainings.tsx` | Riquadro allenamenti odierni con espansione presenze | condiviso, dominio da preservare |
| `src/components/dashboard/WeeklyTrainingSchedulePanel.tsx` | Editor programma settimanale (drag&drop, dialog aggiungi/modifica, autosave, impact banner) | usato da `/training`, non da `/dashboard` — vedi §2 |
| `src/components/dashboard/RecentActivity.tsx` | Elenco attivita recenti (tipizzato, ma **nessun produttore reale**: la pagina corrente lo passa sempre `activities={[]}`) | usato solo dalla variante `[dashboardId]` |
| `src/components/dashboard/SetupGuide.tsx` | Popup guida configurazione | **orfano** |
| `src/components/dashboard/onboarding-resume-card.tsx` | Banner ripresa onboarding | dominio da preservare |
| `src/components/dashboard/AccessCodeGenerator.tsx` | Generatore codice accesso client-only | **orfano** |
| `src/components/dashboard/Header.tsx`, `Sidebar.tsx` | Chrome applicativo (barra superiore, menu laterale) | condiviso da tutta l'app, non specifico di `/dashboard` |
| `src/components/dashboard/ProtectedRoute.tsx` | Guardia legacy basata su `useAuth` | **orfano**, superato da `AccessAreaGuard` |
| `src/components/dashboard/dashboard-page-container.tsx`, `page-heading.tsx`, `shared-page-header.tsx` | Contenitore layout + intestazione pagina condivisa | condiviso da (quasi) tutte le pagine gestionali |
| `src/lib/dashboard/club-overview.ts` | Lettura unica + derivazioni pure (metriche, alert certificati, selezione prossimi appuntamenti/gare/note) | dominio da preservare, **testato** |
| `src/lib/onboarding.ts` | Modello stato onboarding, 5 passi | dominio da preservare |
| `src/lib/match-certificate-warnings.ts` | Calcolo "convocati con certificato non valido" per una gara | dominio condiviso con `/matches` |

### 1.12 Test collegati — `/dashboard`

- `tests/lib/dashboard-overview.test.mjs`:
  - "l'apertura costa quattro richieste, non ventinove" — verifica il numero
    di chiamate di rete fatte da `loadClubDashboardOverview`.
  - "nessuna risorsa viene chiesta due volte".
  - "la riga del club arriva in una richiesta sola, con la proiezione" —
    verifica i `fields` richiesti a `/api/v1/clubs`.
  - "un club assente non fa partire nessuna richiesta".
  - "gli appuntamenti passati non compaiono, e l'ordine e cronologico".
  - "le partite annullate non sono prossime partite".
  - "un promemoria senza scadenza resta attivo".
  - "le metriche si ricavano dai dati gia letti" (`buildDashboardMetrics`).
  - "gli avvisi distinguono scaduto, in scadenza e mancante".
  - "con due certificati per lo stesso atleta vale il piu recente".
  - "la dashboard non rilegge cio che ha gia" — asserisce staticamente che
    `page.tsx` **non** contiene piu `getClubData(` ne `getClubAthletes(` ne
    passa `organizationId` a `<MetricsOverview>`.
  - "il riquadro allenamenti non aspetta 300 ms prima di partire" — asserisce
    che `UpcomingTrainings.tsx` non chiama piu `debounce(` al primo giro.
- `tests/ui/dashboard-metrics-requests.test.mjs`:
  - "la scheda metriche legge gli atleti una volta sola" — asserisce
    staticamente l'assenza della chiave di cache `all-athletes-${orgId}`.
  - "il totale atleti si ricava dalla lettura rimasta".
- `tests/ui/responsive-invariants.test.mjs` (righe ~386-410): verifica che
  `app/dashboard/page.tsx` dichiari `grid-cols-[minmax(0,1fr)]` seguito da
  `xl:grid-cols-[minmax(0,1fr)_320px]`, e che l'`<aside>` porti
  `grid min-w-0` (altrimenti le schede laterali escono a 375px).
- Nota: `tests/lib/dashboard-allenatore.test.mjs` esiste ma riguarda la
  **dashboard allenatore** (`/trainer-dashboard`, `trainer-dashboard-helpers.ts`),
  non `/dashboard` — fuori dallo scope di questo Wave, citato solo per non
  confonderlo.

---

## 2. `/medical` (Certificati Medici)

### 2.1 Data shown

Sorgente: effetto che, dato `clubId` (da query `?clubId=` → `activeClub.id`
dal contesto auth → `localStorage.activeClub`), legge:
- `simplified_athletes` (`club_id = clubId`) via Supabase diretto, con
  fallback legacy su `athletes` (`organization_id = clubId`) se la prima e
  vuota.
- `getClubCategories(clubId)` → popola il filtro categoria.
- `medical_certificates` (`athlete_id in [...]`) via Supabase diretto.

Per ogni atleta viene tenuto **un solo certificato**, il piu recente
(`getCertificateSortTime` = max fra `expiryDate` e `issueDate`); gli atleti
senza alcun certificato ricevono una riga sintetica
`certificateType: "Certificato Medico Mancante"`, `status: "missing"`.

- **Tre card statistiche** in alto: "Validi" (verde, `CheckCircle`),
  "In Scadenza" (ambra, `Clock`), "Scaduti" (rosso, `AlertCircle`) — conteggi
  calcolati **sull'intero elenco** `certificates` (non sul filtrato).
- **Barra ricerca+filtri**: campo "Cerca atleti..." (`Search` icon), select
  categoria "Tutte le categorie" + una opzione per categoria del club,
  pulsante "Carica Certificato" (`Upload` icon, blu).
- **Tabs** (`Tabs defaultValue="all"`): **Tutti**, **Validi**, **In
  Scadenza**, **Scaduti**, **Mancanti** (`TabsList` scrollabile
  orizzontalmente — a 375px "Mancanti" altrimenti veniva tagliata, nota nel
  codice).
- **Lista certificati filtrati** (`filteredCertificates`), una riga per
  atleta con: avatar (`AvatarImage` o `EntityIcon` fallback), nome atleta
  (link a `/athletes/{id}?clubId=&tab=sanitari#sanitari`), tipo certificato
  (`certificateType`, es. "Certificato Medico"/tipo scelto in upload),
  "Emesso il: {data}", "Scade il: {data}" (rosso e grassetto se scaduto),
  badge di stato (`Valido`/`In Scadenza`/`Scaduto`/`Mancante`), pulsanti
  **Visualizza** (`Eye`) e **Scarica** (`Download`, verde) se un file e
  presente, pulsante **Invia Promemoria** (`Send`) se stato
  scaduto/in scadenza/mancante.
- **Stato vuoto filtrato**: icona `FileHeart`, "Nessun certificato trovato" +
  "Prova a modificare i filtri di ricerca".
- **Loading**: spinner circolare centrato (`animate-spin`).

### 2.2 Actions

| Elemento | Target/API |
|---|---|
| "Carica Certificato" | apre `AddCertificateForm` in modalita creazione |
| Link nome atleta | `/athletes/{id}?clubId=&tab=sanitari#sanitari` |
| "Visualizza" | `openClientFileUrl(fileUrl)` (apre in nuova scheda/visualizzatore) |
| "Scarica" | `downloadAttachment(fileUrl, { documentType, fullName, date })` |
| "Invia Promemoria" | `POST /api/medical-certificate-reminders` `{ athleteId, certificateId (omesso se id sintetico "missing-"), organizationId }` |

### 2.3 Forms — `AddCertificateForm` (`src/components/forms/AddCertificateForm.tsx`)

Modal riusato per creazione **e correzione** (props `certificate` presente →
modalita modifica, titolo "Modifica Certificato" / descrizione "Correggi i
dati del certificato, o sostituiscine il file"; altrimenti "Carica Nuovo
Certificato" / "Inserisci i dettagli del certificato medico").

Campi:
1. **Atleta** (`select`, obbligatorio) — con campo di ricerca testuale sopra
   che filtra la lista (`athletes` passati + fetch autonomo da
   `simplified_athletes` se `clubId` presente); auto-seleziona se la ricerca
   produce **un solo** risultato. Se `lockAthleteSelection` + `athleteId`
   sono passati (contesto scheda atleta), il campo diventa un box di sola
   lettura col nome gia fissato.
2. **Tipo di Certificato** (`select`, obbligatorio) — opzioni: "Certificato
   Agonistico" (`Agonistico`, default), "Certificato Non Agonistico"
   (`Non Agonistico`), "Certificato di Sana e Robusta Costituzione"
   (`Sana e Robusta Costituzione`).
3. **Data di Emissione** (`input type="date"`, obbligatorio, default = oggi
   locale via `todayLocalDateOnly()`).
4. **Data di Scadenza** (`input type="date"`, obbligatorio) — calcolata
   automaticamente a +1 anno dalla data di emissione finche non viene
   modificata a mano (`expiryManuallyEdited`); sotto il campo, testo di stato
   ("Impostata automaticamente..." / "Scadenza modificata manualmente.") e
   pulsante "Ricalcola da emissione" (disabilitato se manca la data di
   emissione).
5. **Carica File** (`input type="file"`, label "Carica File *" in creazione,
   "Sostituisci File" in correzione se gia presente un file) — obbligatorio
   **solo in creazione o se non esiste gia un file**; in correzione, lasciare
   vuoto mantiene il file esistente, sceglierne uno lo **sostituisce** allo
   stesso riferimento (via `replaceAttachment`, non un nuovo record).

Validazioni bloccanti (`showToast("error", ...)`, nessun invio): campi
obbligatori mancanti ("Compila tutti i campi obbligatori"), club non
disponibile ("ID del club non disponibile"), file mancante alla creazione
("Il caricamento del file è obbligatorio"), scadenza non successiva
all'emissione ("La data di scadenza deve essere successiva alla data di
emissione").

Upload: passa da **Attachment Core**
(`uploadAttachment`/`replaceAttachment` in `src/lib/api/attachments.ts`, non
da `supabase.storage`), categoria dichiarata `medical_certificate`,
`ownerType: "athlete"`. Dopo l'upload, il chiamante (`handleAddCertificate`
in `medical/page.tsx`) esegue un `INSERT` **diretto** su
`supabase.from("medical_certificates")` con
`{organization_id, athlete_id, type, issue_date, expiry_date, file_url,
status: getMedicalCertificateStatus(expiry_date), notes: certificateType,
data: {source:"medical-page", uploaded_file_name}}`, poi sincronizza
`athletes.data.medicalCertExpiry` (tenendo la scadenza piu lontana fra quella
esistente e quella nuova) sia in stato locale sia via
`updateAthlete(athleteId, {...})`.

Pulsanti footer: **Annulla**, **Salva** (creazione) / **Salva modifiche**
(correzione) — disabilitato mentre `isSubmitting`, testo "Salvataggio...".

### 2.4 Stati validi/in scadenza/scaduto/mancante e soglie

- `getMedicalCertificateStatus(expiryDate)` (`src/lib/medical-certificates.ts`):
  `expired` se `expiryDate < oggi`; `expiring` se `oggi >= expiryDate - 1
  mese` (soglia **a un mese**, calcolata con `setMonth(-1)`, non "30 giorni"
  fissi); altrimenti `valid`.
- `getMedicalCertificateAvailability`: come sopra ma restituisce `missing` se
  non c'e alcuna data di scadenza.
- In dashboard (`club-overview.ts`) la soglia usata e invece
  **`CERTIFICATE_WARNING_DAYS = 30` giorni fissi** — **incoerenza fra le due
  soglie di "in scadenza"**: `/medical` usa "un mese di calendario da oggi",
  `/dashboard` usa "30 giorni da oggi". Su mesi di 31 giorni un certificato
  puo risultare "in scadenza" in una superficie e "valido" nell'altra per un
  giorno.
- Un atleta senza alcun certificato: riga sintetica id `missing-{athleteId}`,
  tipo "Certificato Medico Mancante", nessuna data.
- Etichette badge: `valid`→"Valido" (verde), `expiring`→"In Scadenza"
  (ambra), `expired`→"Scaduto" (rosso/destructive), `missing`→"Mancante"
  (grigio/secondary).

### 2.5 Filtri / ricerca / ordinamento

- Ricerca testo su `athleteName` (case-insensitive, substring).
- Tab di stato (`all`/`valid`/`expiring`/`expired`/`missing`).
- Filtro categoria (`categoryFilter`, default `all`) — usa
  `athleteMatchesAnyCategory(athlete, [selectedCategoryOption], categoryOptions)`,
  cioe il confronto **per identita di categoria** (id), non per nome:
  commento nel codice segnala esplicitamente il rischio di due categorie
  omonime di sedi diverse (ADR-0155) su un dato sanitario.
- Nessun ordinamento esplicito nella UI (l'ordine e quello di iterazione
  della `Map` costruita durante il fetch, quindi sostanzialmente per ordine
  di lettura atleti/certificati).
- Nessuno stato salvato in `localStorage` per filtri di questa pagina.

### 2.6 Bulk actions / selezione

Nessuna: ogni azione (visualizza/scarica/promemoria) e per singolo
certificato/atleta. Nessuna casella di selezione multipla, nessun "invia
promemoria a tutti gli scaduti".

### 2.7 Solleciti (promemoria)

- Endpoint: `POST /api/medical-certificate-reminders`
  (`src/app/api/medical-certificate-reminders/route.ts`).
- Autorizzazione: sessione autenticata + `canAccessClubResource(activeRole,
  "medical_certificates", "update")`, sul **club attivo** risolto da
  `resolveOrganizationScopeForUser` (non un club qualunque dell'utente).
- Trova i genitori/tutori collegati (`resolveGuardianRecipientIds`); se
  nessuno → 404 "Nessun account genitore o tutore collegato".
- Deduplica: non rimanda un promemoria **non letto** per la stessa chiave
  (`buildReminderKey(athleteId, certificateId)`) entro la finestra di
  riguardo (`getReminderWindowStart`); un promemoria **letto** puo essere
  rimandato.
- Risposta: `{ created, skipped, recipients }`; UI: toast "Promemoria
  inviato a {nome}" se `created>0`, altrimenti "Promemoria gia presente per
  questo certificato" se `skipped>0`, altrimenti "Nessun parent collegato a
  questo atleta".
- Esiste anche un **giro automatico** (`GET`, dietro `CRON_SECRET`, invocato
  da Vercel Cron) che scorre **tutti i club** e non filtra per "non letto
  soltanto" (manda comunque, a differenza del percorso manuale) — non
  raggiungibile da questa pagina ma rilevante per capire perche un atleta
  puo ricevere un sollecito senza che nessuno in segreteria l'abbia premuto.

### 2.8 Visualizza / Scarica

- "Visualizza" → `openClientFileUrl(fileUrl)`; se fallisce, toast errore
  "File del certificato non disponibile".
- "Scarica" → `downloadAttachment(fileUrl, { documentType:
  "Certificato {tipo|medico}", fullName: athleteName, date: expiryDate ||
  issueDate })`; stesso messaggio d'errore in caso di fallimento.
- Entrambi i pulsanti compaiono **solo** se `certificate.status !== "missing"`
  e `fileUrl` non vuoto.

### 2.9 Visite mediche (`src/lib/medical-visits.ts`)

**Non usato da `/medical/page.tsx`.** Il modello "Agonistica"/"Non
Agonistica" (tipologia di visita, distinto dal "Tipo di Certificato" del
form sopra) e usato solo da `src/app/trainers/[id]/page.tsx` (scheda
allenatore/staff). Da tenere presente per un redesign che unifichi le due
nozioni, ma non fa parte del comportamento osservabile di `/medical` oggi.

### 2.10 Permessi / role gates

- `/medical` e in `MANAGEMENT_PATH_PREFIXES` — stesso perimetro di
  `/dashboard` (owner, club_manager, collaborator, staff).
- La pagina stessa **non controlla alcun permesso puntuale**: nessuna
  chiamata a `canAccessClubResource` o simili in `page.tsx`. La sola difesa
  fine e sul server:
  - lettura dello **stato** del certificato: chiave `clinical.status_read`
    (ruoli `GESTIONE` + `trainer`, `byLink: true`);
  - lettura del **contenuto clinico** (allergie, patologie, farmaci, gruppo
    sanguigno, file): `clinical.read` (solo `GESTIONE`, `byLink: true`);
  - **scrittura** (registrare/modificare certificati e dati sanitari):
    `clinical.manage` (solo `GESTIONE`) — un allenatore non ha questa chiave,
    quindi non puo scrivere un certificato anche se aprisse la form.
- `src/lib/health/permissions.ts` e il punto che applica la distinzione
  stato/contenuto (campi clinici da rimuovere per un lettore ristretto,
  token di accesso guardiano da non far trapelare, ecc.) — non tocca
  direttamente `/medical` ma governa cosa arriva nelle risposte API che la
  pagina consuma indirettamente tramite altre superfici (scheda atleta).

### 2.11 States

- **Loading**: spinner `animate-spin` centrato nella card, mentre
  `isLoading` e vero.
- **Vuoto per assenza club**: se `clubId` non si risolve, l'effetto di fetch
  non parte (`if (!clubId) return`) — la pagina resta con liste vuote, nessun
  messaggio dedicato "nessun club".
- **Filtrato-vuoto**: icona `FileHeart` + "Nessun certificato trovato" +
  "Prova a modificare i filtri di ricerca".
- **Errore di caricamento**: toast `showToast("error", "Errore nel
  caricamento dei dati")`.
- **Errore di salvataggio**: vedi validazioni §2.3, piu
  `showToast("error", "Errore nell'aggiunta del certificato")` per eccezioni
  impreviste sull'insert.

### 2.12 Destructive flows

Nessuna cancellazione di certificati esposta in questa pagina (nessun
pulsante "Elimina certificato"). L'unica mutazione distruttiva-adiacente e la
**sostituzione** di un file gia caricato (sovrascrive il riferimento, non
crea una seconda riga) — nessuna finestra di conferma per la sostituzione,
solo il messaggio informativo "Un file e gia allegato. Sceglierne uno nuovo
lo sostituisce; lasciando vuoto resta quello."

### 2.13 Navigazione

- Query param letto: `clubId` (poi fallback `activeClub`/`localStorage`).
- Deep link **in ingresso**: `?action=new` apre automaticamente
  `AddCertificateForm` all'atterraggio (e ripulisce il parametro dall'URL con
  `history.replaceState`) — usato presumibilmente da link "Carica
  certificato" da altre pagine (es. scheda atleta).
- Link in uscita: `/athletes/{id}?clubId=&tab=sanitari#sanitari` (per riga
  certificato).

### 2.14 Component inventory — `/medical`

| File | Ruolo |
|---|---|
| `src/app/medical/page.tsx` | Pagina, stato e fetch |
| `src/components/forms/AddCertificateForm.tsx` | Dialog crea/modifica certificato |
| `src/components/forms/certificate-attachment-field.tsx` | Campo allegato riusabile (usato altrove, es. scheda atleta) — non montato direttamente da `/medical` ma condivide la stessa logica di sostituzione allegato |
| `src/lib/medical-certificates.ts` | Stato/etichette/derivazioni certificato (dominio puro, condiviso con scheda atleta/area famiglia) |
| `src/lib/medical-visits.ts` | Tipologia visita medica — **non usato da `/medical`**, usato da `/trainers/[id]` |
| `src/lib/health/permissions.ts` | Confine stato/contenuto clinico, usato dal server dietro le API che alimentano questa e altre pagine |
| `src/lib/client-files.ts` | `openClientFileUrl`, `downloadAttachment`, `downloadClientFileUrl` |
| `src/components/ui/entity-icon.tsx` (`EntityIcon`) | Fallback avatar |
| `src/app/api/medical-certificate-reminders/route.ts` | API solleciti (POST manuale, GET cron) |
| `src/lib/server/medical-certificate-reminders.ts` | Regole di deduplica/finestra (non client, ma determina il comportamento osservato) |

### 2.15 Test collegati — `/medical`

- `tests/ui/certificato-medico-salvataggio.test.mjs`: "`assets` resta una
  risorsa chiusa"; "il form del certificato non passa piu da
  `supabase.storage`"; "il file passa da Attachment Core, sul genere che
  accende la guardia clinica"; "la categoria dichiarata e riconosciuta come
  certificato medico"; "la finestra sa correggere, non solo creare"; "in
  correzione il file non e obbligatorio, e caricarne uno lo sostituisce"; "il
  form non dichiara lo stato del certificato"; "la scheda atleta ha una
  strada per correggere un certificato"; "la data arriva al campo senza
  passare da un fuso orario".
- `tests/server/certificato-medico-rilettura.test.mjs`: creazione/rilettura
  identica; tipo e date esatte (non default); correggere la scadenza la
  cambia davvero; correggere il tipo non perde l'allegato; sostituire il
  file cambia il riferimento senza lasciarne due; certificato senza file si
  crea/rilegge senza inventarne uno; l'allenatore **non** scrive un
  certificato (manca `clinical.manage`) ne corregge uno esistente; un
  certificato non si scrive sull'atleta di un altro club; all'allenatore
  esce solo lo stato, mai il contenuto; alla segreteria il contenuto esce.
- `tests/server/medical-certificate-reminders.test.mjs`: certificato scaduto
  genera un promemoria al tutore; rieseguire il giro non ne manda un secondo;
  la finestra di riguardo non guarda se il promemoria e stato letto (nel giro
  cron); passata la finestra il promemoria torna; certificato valido non
  genera niente; certificato vecchio non conta se ce n'e uno nuovo valido;
  atleta senza tutori raggiungibili finisce in `skipped`, non errore; il
  promemoria di un club non raggiunge l'account di un altro club; ogni
  lettura del giro filtra per club; il giro su tutti i club non si ferma al
  primo che fallisce; il giro lascia una riga di audit per club; la porta del
  cron non risponde a un Bearer sbagliato; le porte periodiche hanno uno
  scheduler; validazione UUID dell'atleta; la rotta non tiene una copia
  propria del validatore.
- `tests/ui/responsive-invariants.test.mjs`: la `TabsList` di
  `app/medical/page.tsx` dichiara `w-full justify-start overflow-x-auto`
  (altrimenti "Mancanti" viene tagliata a 375px).
- `tests/lib/catalogo-permessi.test.mjs`: copre (fra altro) le chiavi
  `clinical.status_read` / `clinical.read` / `clinical.manage` nel catalogo
  permessi.

---

## 3. `/training` (Allenamenti)

Fonte: `src/app/training/page.tsx` (2946 righe, letto per intero) e tutti i
componenti/lib collegati. Stringhe italiane riportate testualmente dal
codice.

### 3.1 Data shown

Header: `Header title="Allenamenti"`; `SharedPageHeader title="Allenamenti"
subtitle="Pianifica e gestisci il calendario degli allenamenti."`; titolo di
sezione `"Calendario Allenamenti"`.

Card per allenamento (Vista Giornaliera e Calendario Storico usano gli stessi
campi):
- Badge categoria (`training.category`, colore da `getTrainingCategoryColor`)
  — fallback `"bg-gray-100 text-gray-800"`.
- Titolo (`training.title`, default `"Allenamento"`).
- Orario: `training.time` (`getTrainingStartTime`/`getTrainingTimeLabel`,
  fallback `"Orario da definire"`) + `" - " + endTime` se presente.
- Luogo: `training.location` risolto via `findTrainingLocationOption` contro
  `structures`/`fields`, fallback `"Campo"`.
- Allenatore/i: `training.trainer` da `getTrainingTrainerLabel` (unisce tutti
  i nomi riconosciuti; etichette generiche come "Allenatore"/"Coach" filtrate;
  default `"Allenatore non specificato"`).
- Riepilogo presenze: `"{presenti}/{totale} Atleti"` — `presenti` da
  `readRecordedAttendance` (appello registrato) o fallback al legacy
  `attendees`; `totale` da `expectedAttendees` (calcolato dal roster
  gruppo/categoria, o dal valore salvato `expected_attendees` se il roster
  non e derivabile).
- Badge di stato (`getStatusBadge`, derivato da `getTrainingPhase` in base a
  data/ora/ora fine/status, non solo dallo stato salvato):
  - `upcoming` → **"In Programma"** (blu)
  - `in_progress` → **"In corso"** (ambra)
  - `concluded` → **"Concluso"** (blu)
  - `completed` → **"Completato"** (verde) — valore di stato legacy
  - `cancelled`/`annullato` → **"Annullato"** (rosso)
- Indicatore stato presenze (`getTrainingAttendanceStatus`): spunta verde +
  **"Presenze salvate"** quando `readRecordedAttendance(training).recorded > 0`;
  cerchio rosso con x + **"Presenze mancanti"** quando non ancora registrate
  e `canRecordTrainingAttendance` e vero (data ≤ oggi, non annullato);
  altrimenti nulla.
- Striscia rapida giorni della settimana (solo desktop, `hidden md:flex`):
  bottoni **Lun Mar Mer Gio Ven Sab Dom** per la settimana corrente, con un
  puntino verde se quel giorno ha almeno un allenamento.

Card di avviso categorie mancanti (`missingCategoryPanel`, mostrata quando il
programma settimanale o gli allenamenti futuri referenziano una categoria non
piu nel catalogo):
- Titolo: **"Categorie non rilevate nel programma allenamenti"**.
- Corpo: **"Alcuni allenamenti in programma fanno riferimento a categorie che
  probabilmente sono state eliminate o rinominate fuori sincronizzazione."**
- Contatori: **"Programma settimanale: {weeklyCount} • Allenamenti futuri:
  {upcomingCount}"**.
- Fino a 6 badge delle categorie incriminate.
- Pulsante **"Rimuovi allenamenti in programma"** (disabilitato durante
  `cleaningMissingCategories`, testo diventa **"Pulizia in corso..."**).

Banner di avviso caricamento (ambra): `Alcune sezioni non sono state caricate
correttamente: {sezioni}.` quando uno dei caricamenti paralleli (categorie/
allenatori/strutture/atleti/allenamenti/programma settimanale/sedi/gruppi
operativi) fallisce singolarmente (`Promise.allSettled`), oppure **"Non è
stato possibile caricare tutti i dati degli allenamenti. Riprova tra qualche
istante."** + toast **"Errore nel caricamento dei dati"** su fallimento
totale.

Tab Calendario (**"Calendario Storico"**):
- Griglia mensile (colonne Lun→Dom), pallino su oggi, badge col numero di
  allenamenti del giorno, giorno selezionato evidenziato.
- Sotto: elenco **"Allenamenti del {giorno settimana giorno mese anno}"** con
  lo stesso rendering badge/orario/luogo/allenatore/presenze, cliccabile
  quando le presenze sono registrabili (`role="button"` + tastiera
  Enter/Spazio).

Card Programma Settimanale: **"Programma Settimanale"** — renderizza
`<WeeklyTrainingSchedule>` (import dinamico), alimentato con `categories`,
`groups={groupOptions}` (solo gruppi attivi), `trainers`, `locations`,
`initialSchedule=weeklySchedule`, `autoSave=true`, `allowDragDrop=true`.

### 3.2 Actions

| Pulsante/controllo | Target/effetto | API |
|---|---|---|
| **"Nuovo Allenamento"** (in alto, blu) | apre modal `AddTrainingForm` | — |
| **"Vai a oggi"** | `setDate(new Date())` | — |
| Freccia giorno prec./succ. | `goToPreviousDay`/`goToNextDay` | — |
| Bottoni rapidi giorno settimana | `setDate(currentDay)` | — |
| Filtro sede (`SiteFilter`) | `setSiteFilter` | — |
| **"Presenze"**/**"Modifica Presenze"** (per allenamento) | apre `AttendanceSheet` via `openAttendanceSheet` | `GET /api/v1/events/:id/participants` (fallback se `training.attendance` vuoto) |
| **"Modifica"** (ambra) | apre `EditTrainingForm` con `editingTraining` | — |
| **"Annulla"** (outline arancio, nascosto se gia `annullato`/`concluded`) | `window.confirm("Vuoi davvero annullare questo allenamento?")` → `cancelEvent(id, version)` | `PATCH /api/v1/events/:id` `{status:"cancelled", version}` |
| **"Ripristina"** (outline smeraldo, solo se `annullato`) | `window.confirm("Vuoi ripristinare questo allenamento annullato?")` → `restoreEvent(id, version)` | `PATCH /api/v1/events/:id` `{status:"scheduled", version}` |
| Menu kebab (⋮, dropdown custom) → **"Elimina"** | apre `AlertDialog` di conferma (`showDeleteTraining`) | — |
| Conferma elimina → **"Elimina"** | `deleteEventIfEmpty(id)` | `DELETE /api/v1/events/:id` |
| Pannello categorie mancanti → **"Rimuovi allenamenti in programma"** | apre `AlertDialog` di conferma, poi `eseguiPuliziaCategorie` | `cleanupOrphanScheduledTrainings` → `DELETE /api/v1/events/:id` per allenamento + aggiornamento diretto colonna `weekly_schedule` |
| Freccia mese calendario | `goToCalendarMonth(±1)` | — |
| Click cella giorno calendario | `setCalendarDate(day)` | — |
| Pannello Programma Settimanale | vedi `WeeklyTrainingSchedulePanel` (§1.11) + `TrainingScheduleAutomationPanel` sotto | `POST/GET /api/v1/training-automation`, `PATCH clubs` per `weekly_schedule` |

### 3.3 Forms

**`AddTrainingForm`** (**"Aggiungi Nuovo Allenamento"**, sottotitolo
**"Inserisci i dettagli del nuovo allenamento"**). Campi (modalita
allenamento, `isAppointment=false`):
- **Titolo** (`title`, testo, obbligatorio, placeholder "Es. Allenamento
  settimanale").
- **Data** (`date`, `type="date"`, obbligatorio, default
  `formatLocalDateOnly(selectedDate || new Date())`).
- **Ora inizio** (`time`, `type="time"` o `<select>` di `availableTimes` se
  fornito, default `"18:00"`).
- **Ora fine** (`endTime`, `type="time"`, default `"19:30"`).
- `EventRsvpFields` — checkbox **"Chiedi conferma alle famiglie"** (aiuto:
  "Le famiglie ricevono la convocazione e rispondono «ci sono» o «non ci
  sono». Senza questa spunta l'evento non chiede niente a nessuno."),
  **"Rispondere entro"** (`datetime-local`, disabilitato se non
  `rsvpRequired`), **"Capienza"** (`number`, min 0, placeholder "Nessun
  limite").
- **Gruppi** (`TrainingGroupSelector`) — elenco a checkbox di `groupOptions`
  (fallback a un gruppo sintetico per categoria se `groups` e vuoto);
  etichetta con sede solo se ≥2 gruppi condividono lo stesso nome categoria;
  errore **"Seleziona almeno un gruppo"** se nessuno selezionato;
  obbligatorio.
- **Allenatori** — grid a checkbox, quelli auto-selezionati marcati
  **"Associato"** (da `getAssociatedTrainerIdsForGroups`, sui gruppi
  selezionati); aiuto: "Gli allenatori collegati alle categorie selezionate
  vengono proposti automaticamente. Puoi aggiungerne altri manualmente.";
  errore **"Seleziona almeno un allenatore"** se vuoto; obbligatorio.
- **Struttura** (`structureId`, `<select>`) — elenca tutte le strutture, le
  consigliate (stessa sede del gruppo selezionato, via
  `resolveRecommendedStructures`) portano il suffisso **" · Consigliata
  (stessa sede)"** e vengono ordinate prima; placeholder "Seleziona una
  struttura" / vuoto "Nessuna struttura disponibile".
- **Campo della struttura** (`locationId`, `<select>`) filtrato sulla
  struttura scelta; placeholder "Seleziona un campo" / vuoto "Nessun campo
  disponibile".

Modalita appuntamento (`isAppointment=true`, non usata da `/training` oggi ma
stesso componente): titolo "Aggiungi Nuovo Appuntamento", campi
`contactName` (Nome Richiedente, obbligatorio), `athleteName` (Nome Atleta,
opzionale), `description`.

Validazione all'invio: titolo/data/ora obbligatori; se non appuntamento
richiede ≥1 gruppo, `structureId`, `locationId`, ≥1 allenatore, altrimenti
toast **"Compila tutti i campi obbligatori"**; `isValidTimeRange(time,
endTime)` deve valere altrimenti toast **"L'orario di fine deve essere
successivo all'orario di inizio"**. Footer: **"Annulla"** / **"Salva"**.

Effetti collaterali all'invio (`handleAddTraining`):
1. Verifica sovrapposizione via `findTrainingCollisions` (stesso campo +
   orari che si sovrappongono, esclusi annullati) → dialog di conferma
   titolo **"Il campo risulta gia occupato"**, bottone **"Inseriscilo
   comunque"**, descrizione: "In quel campo e a quell'ora ci sono gia
   {n} allenamento(i). Puoi inserirlo lo stesso — due squadre su meta campo,
   o un allenamento congiunto, sono situazioni normali — e l'allenamento
   verra creato accanto agli altri." Rifiutare annulla il salvataggio.
2. Verifica cross-site via `isCrossSiteEvent(groupSiteId, structureSiteId)` →
   dialog titolo **"La struttura appartiene a un'altra sede"**, bottone
   **"Conferma comunque"**, descrizione che nomina le due sedi e precisa che
   salvare non sposta la categoria ne alcun atleta.
3. `createEvent("training", newTraining)` → `POST /api/v1/events` con
   `{data:{...,kind:"training"}}`; stato locale aggiornato in ottimistico;
   toast successo "Allenamento {titolo} aggiunto e salvato con successo";
   fallimento: messaggio del server testuale, fallback "Errore durante
   l'aggiunta dell'allenamento".
4. Guardia di concorrenza `salvataggioInCorso` evita doppio invio.

**`EditTrainingForm`** (Dialog, titolo **"Modifica Allenamento"**). Campi:
Titolo, Data, Orario inizio, Orario fine, Campo (`<select>` di **nomi** di
location, non oggetti — il prop `locations` passa `locations.map(l =>
l.name)`), Allenatori (checkbox), `TrainingGroupSelector` (gruppi derivati da
`groupIds` esistenti o retro-compilati via `groupIdsForCategories` per
allenamenti legacy senza gruppi), checkbox **"sendNotifications"** ("Invia
notifiche delle modifiche ad atleti, genitori e allenatori", default
selezionato — solo UI, nessuna notifica reale oltre al toast).

Banner **"consolidato"** (ambra) mostrato quando `editingTraining.attendance`
ha gia voci: "Questo allenamento ha gia una storia — convocazioni, presenze o
risposte delle famiglie. Titolo, note e allenatori restano modificabili;
giorno, ora, luogo, categorie e gruppi no: cambiarli cambierebbe il
significato delle presenze gia registrate. Per spostarlo davvero, annullalo e
creane uno nuovo." E' solo consultivo lato client; il server
(`campiCongelatiToccati` in `src/lib/events/model.ts`) e l'autorita e
congela: `starts_at` (l'istante), `ends_at` (la fine), `site_id` (la sede),
`structure_id` (la struttura), `field_id` (il campo), `category_id`/
`category_ids` (categoria/categorie), `group_ids` (i gruppi), `capacity`
(la capienza), `rsvp_required`, `rsvp_deadline` — solo una volta che l'evento
ha davvero righe di partecipazione; titolo/note/allenatori non si congelano
mai.

Tracciamento modifiche (`changes[]`) confronta data/orario/fine/campo/
allenatori/categorie con `originalTraining` e mostra avviso ambra:
**"Modifiche rilevate" / "Stai modificando: {elenco}. Verrà inviata una
notifica agli atleti, genitori e allenatori coinvolti."**

Validazione: `isValidTimeRange` altrimenti toast "L'orario di fine deve
essere successivo all'orario di inizio"; ≥1 allenatore altrimenti "Seleziona
almeno un allenatore". Footer: **"Annulla"** / **"Salva Modifiche"**.

Handler di submit a livello pagina (`onSubmit`):
1. Ri-verifica sovrapposizione (`findTrainingCollisions`, `ignoreId` =
   l'allenamento stesso) → stesso pattern di conferma, bottone **"Salva
   comunque"**.
2. Costruisce `updateData` (titolo, data, ora, ora fine, luogo, trainerIds +
   etichetta, categorie, groupIds, categoryId, etichetta categoria,
   locationId, fieldId, allowOverlap, updated_at).
3. `updateEvent(id, updateData, editingTraining.version)` →
   `PATCH /api/v1/events/:id` con `{data:{...updateData, version}}`. Al
   successo aggiorna `trainings` locale e ri-sincronizza `editingTraining`
   (cosi il modal ancora aperto mostra i dati freschi). Toast successo
   "Allenamento {titolo} modificato e salvato con successo".
4. Al fallimento: toast col messaggio del server testuale, fallback "Errore
   durante la modifica dell'allenamento"; se il messaggio matcha
   `/modificato da qualcun altro/i` (conflitto 409 di lock ottimistico), la
   pagina ricarica tutti i dati e ri-sincronizza il modal di modifica aperto
   con la riga fresca.

Dialoghi del programma settimanale (Aggiungi/Modifica in
`WeeklyTrainingSchedulePanel`, gia documentati in §1.11): campi Giorno /
Gruppo / Orario inizio / Orario fine / Struttura / Campo della struttura /
Allenatori / interruttore Regola attiva; autosave ogni 1200ms; banner impatto;
toggle **"Assistente Automazione"** che apre `TrainingScheduleAutomationPanel`.

### 3.4 Flusso di registrazione presenze (`AttendanceSheet`)

Trigger: `openAttendanceSheet(training)` — calcola il roster dai **gruppi**,
non dalla categoria (`readTrainingGroupIds` → `getAthleteGroupIds`), con
fallback al confronto per categoria per allenamenti creati prima dei gruppi
(ADR-0055). Rilegge anche l'appello gia salvato via
`GET /api/v1/events/:id/participants` quando `training.attendance` e vuoto, e
unisce nel roster ogni atleta con una voce salvata anche se ha lasciato il
gruppo da allora (atleti salvati "fuori categoria").

UI:
- Header: titolo, `{data} • {ora} • {categoria} • {luogo}`.
- Contatore **"Presenti: {n} / {totale}"** e bottone **"Segna tutti
  presenti"** (verde, marca presente ogni riga attuale).
- `TrainingRsvpSummary` — renderizzato solo se l'evento ha `rsvpRequired`;
  legge `GET /api/v1/rsvp?training_id=`; mostra conteggi **"{n} ci saranno"**
  / **"{n} non ci saranno"** / **"{n} senza risposta"**, testo scadenza
  "Conferme chiuse il " / "Conferme aperte fino al ", ed elenco chip degli
  atleti senza risposta attesa, oppure **"Tutte le famiglie attese hanno
  risposto."**
- Casella **"Aggiungi atleta extra"** ("Cerca atleta del club...", aiuto
  "Cerca tra tutti gli atleti del club ed evita duplicati nella lista
  presenze.") — cerca in `clubAthletes` non ancora elencati; ogni risultato
  mostra nome, categoria primaria (se presente), badge partecipazione
  ("Primaria"/"Secondaria"/"Extra categoria", smeraldo/blu cielo/ambra);
  cliccare aggiunge l'atleta come presente.
- Righe roster: l'intera riga e cliccabile (alterna presente/assente),
  checkbox `aria-label="Presente: {nome}"`, badge "Presente"/"Assente",
  badge partecipazione, icona+etichetta avviso certificato medico
  (`getMedicalCertificateAvailability` → "Certificato mancante" /
  "Certificato scaduto" / "Certificato in scadenza", nessuna se valido),
  didascalia "Categoria primaria: {nome}" se non primaria, campo note libero
  per atleta (il click non propaga al toggle).
- Footer: **"Annulla"** (chiude senza salvare) / **"Salva Presenze"** (blu,
  salva).

Salvataggio (`handleSaveAttendanceSheet` in `page.tsx`):
`saveTrainingAttendance(clubId, trainingId, attendance[])` →
`src/lib/simplified-db.ts` → `saveEventAttendance(id, entries)` (client) →
`POST /api/v1/events/:id/participants` con
`{data:{action:"attendance", entries:[{athleteId, status:"present"|"absent",
notes}]}}`. Al successo: `trainings` locale aggiornato (`attendance`,
conteggio `attendees`), modal chiuso, toast "Presenze salvate con successo"
(a livello pagina) — nota: anche il `handleSave` interno di `AttendanceSheet`
lancia lo stesso toast **immediatamente** al click (quindi puo apparire due
volte in rapida successione: quello della pagina arriva dopo che il
salvataggio asincrono si risolve). Al fallimento: toast "Errore nel
salvataggio delle presenze".

### 3.5 Flussi annulla/elimina/ripristina

Tre verbi distinti, tutti tramite lo scrittore canonico degli eventi
(`src/lib/server/events.ts`), mai una scrittura Prisma diretta:

- **Annulla**: `window.confirm("Vuoi davvero annullare questo
  allenamento?")` → `cancelEvent(id, version)` =
  `updateEvent(id, {status:"cancelled"}, version)` →
  `PATCH /api/v1/events/:id`. Disponibile finche non e gia `annullato`. La
  storia (presenze/convocazioni/RSVP) resta; l'evento diventa in gran parte
  di sola lettura (`assertEventoAperto` blocca ulteriori scritture di
  presenze/convocazioni su eventi annullati/archiviati).
- **Ripristina**: `window.confirm("Vuoi ripristinare questo allenamento
  annullato?")` → `restoreEvent(id, version)` =
  `updateEvent(id, {status:"scheduled"}, version)`. Mostrato solo quando
  `derivedStatus === "annullato"`.
- **Elimina** (cancellazione definitiva): raggiungibile solo dal menu kebab →
  `AlertDialog` dell'app (titolo **"Eliminare l'allenamento?"**, corpo
  «{titolo}» verra rimosso dal calendario. L'operazione non puo essere
  annullata.), azione rossa **"Elimina"** → `deleteEventIfEmpty(id)` →
  `DELETE /api/v1/events/:id`. Vincolo lato server: **riesce solo se
  l'evento non ha righe di partecipazione** (nessuna presenza, convocazione,
  risposta RSVP) — altrimenti va annullato. Toast "Allenamento eliminato con
  successo" / "Errore durante l'eliminazione".
- Annulla/Ripristina inviano la `version` in memoria per il lock
  ottimistico; una risposta 409 contiene "modificato da qualcun altro" e
  scatena `loadData()` per aggiornare la copia locale obsoleta (cablato solo
  sui rami d'errore di annulla/ripristina, non su elimina).
- **Pulizia massiva** (pannello categorie mancanti): **"Rimuovi allenamenti
  in programma"** → dialog di conferma (**"Rimuovere gli allenamenti in
  programma?"**, corpo che spiega che rimuove solo gli allenamenti **non
  ancora avvenuti**/righe di programma settimanale legate a categorie
  eliminate, e che tutto cio con presenze/RSVP va annullato singolarmente) →
  `cleanupOrphanScheduledTrainings(clubId, references)`: rimuove le righe
  `weekly_schedule` corrispondenti direttamente, poi chiama
  `deleteEventIfEmpty` una per una sugli allenamenti futuri corrispondenti,
  raccogliendo `removedWeeklyScheduleItems` / `removedUpcomingTrainings` /
  `keptWithHistory`. Messaggi toast:
  - niente da rimuovere: "Nessun allenamento programmato da ripulire"
  - alcuni trattenuti: "Rimossi {dettaglio}. {kept} non si possono
    cancellare perche hanno gia presenze o risposte: vanno annullati uno per
    uno." (o, se nulla rimosso: "Non e stato rimosso niente: {kept}
    allenamenti hanno gia presenze o risposte e vanno annullati uno per
    uno.")
  - successo completo: "Rimossi {dettaglio}, collegati a categorie
    eliminate"

### 3.6 Conflitti

- **Sovrapposizione orario sullo stesso campo** (`findTrainingCollisions` in
  `src/lib/training-utils.ts`): stesso `locationId`, stesso giorno,
  intervalli `[ora,oraFine)` che si sovrappongono, esclusi gli annullati e
  (in modifica) l'allenamento stesso. Non e un blocco rigido — solo un
  prompt di conferma (vedi §3.3), e la scelta confermata (`allowOverlap`)
  viaggia al server perche client e server siano d'accordo.
- **Struttura cross-site rispetto al gruppo** (`isCrossSiteEvent`): confronta
  il `siteId` comune dei gruppi selezionati con il `siteId` della struttura
  scelta; se diversi, avvisa ma non blocca mai — sia in creazione che in
  modifica (anche in `WeeklyTrainingSchedulePanel`, dove l'avviso in
  modifica scatta solo se la struttura e realmente cambiata).
- **Conflitti di chiusura campo/struttura lato server** (motore
  automazione allenamenti, `/api/v1/training-automation`) restituiscono
  messaggi distinti che la pagina renderizza testualmente dentro
  `TrainingScheduleAutomationPanel`: motivo di esclusione
  `OUTSIDE_OPENING_HOURS` ("Motivo: {motivo}"), e conflitti di occupazione
  "Occupa lo stesso posto di «{altroTitolo}»".
- I messaggi del server per fallimenti aggiungi/modifica sono mostrati cosi
  come sono (nessuna ri-interpretazione lato client), es. "Il campo e gia
  occupato in quell'orario da «Under 15»" o "La struttura e chiusa a
  quell'ora".

### 3.7 Gestione sedi/gruppi

Modello (`src/lib/club-sites.ts`, ADR-0038/ADR-0055): Categoria (fascia
d'eta) vs Sede (citta) vs Struttura (impianto, `siteId`) vs Gruppo operativo
(coppia categoria×sede, "chi si allena con chi"). Un club con 0-1 sedi attive
non e "multi-sede" (`isMultiSiteClub`) e tutto degrada a un gruppo implicito
per categoria.
- `buildCategoryGroups`: fonde i gruppi configurati esplicitamente con quelli
  impliciti (categorie senza sede configurata), ordinati per nome categoria
  poi nome sede.
- `getActiveCategoryGroups`: solo i gruppi `active` sono selezionabili nei
  form nuovo/modifica (i gruppi inattivi/storici restano visibili sugli
  allenamenti vecchi).
- `TrainingGroupSelector`: mostra il suffisso sede (separatore `" · "`, es.
  "Pulcini · Roma") solo quando ≥2 gruppi condividono lo stesso **nome**
  categoria (contati per nome, non per `categoryId`, per gestire due
  categorie realmente distinte che condividono un'etichetta su sedi
  diverse).
- `readTrainingGroupIds`/`getAthleteGroupIds`: un allenamento senza gruppi
  dichiarati (dato legacy) ricade sul confronto per categoria intera;
  `athleteMatchesGroup` non ha tolleranza sulla sede (nessuna indulgenza
  "non assegnato = combacia con tutto" — quella indulgenza vive solo in
  `recordMatchesSite`, usata per i filtri, non per l'appartenenza al roster).
- `resolveRecommendedStructures`: ordina/segna le strutture della sede del
  gruppo selezionato come consigliate (suffisso " · Consigliata (stessa
  sede)"), ma non filtra mai le strutture di altre sedi — il cross-site e
  un'eccezione esplicita per evento, non una restrizione.
- `SiteFilter` (`src/components/sites/site-filter.tsx`) alimenta la tendina
  "Sede" della vista giornaliera; non si monta affatto per club non
  multi-sede.
- Il filtro per sede nella vista giornaliera usa
  `recordMatchesSite(siteId ? [siteId] : [], siteFilter)`: una sede non
  dichiarata su un allenamento lo mantiene visibile con qualunque filtro (non
  distruttivo sui dati storici).

### 3.8 Filtri / ricerca / ordinamento / viste

- Due tab: **"Vista Giornaliera"** (default) e **"Calendario Storico"**.
- Vista giornaliera: navigazione a data singola (prec/succ/oggi/bottoni
  rapidi giorno settimana), piu filtro Sede. Nessuna ricerca testuale,
  nessun filtro categoria/allenatore/stato, nessuno stato di vista salvato,
  **nessun uso di `localStorage`** in questa pagina o nei suoi componenti
  diretti (confermato via grep — nessuno trovato).
- Ordinamento: `compareTrainingsByStart` (cronologico per data, poi ora
  inizio, poi titolo come spareggio) applicato ovunque gli allenamenti sono
  elencati.
- Vista calendario: griglia mensile navigabile, selezionare un giorno mostra
  l'elenco di quel giorno (stesso contenuto card, condensato).
- Query param gestiti: `trainingId`, `focus` (solo `"attendance"` ha
  significato — apre automaticamente il foglio presenze per quell'allenamento
  una volta sola, tracciato via `autoOpenedAttendanceId`), `date` (parsata
  come data locale senza ora, default oggi se il parsing fallisce). Un
  parametro separato one-shot `action=new` (letto direttamente da
  `window.location.search`, non da `useSearchParams`) apre il modal Aggiungi
  Allenamento e viene rimosso dall'URL via `history.replaceState`
  immediatamente dopo.

### 3.9 Bulk actions / selezione

Nessuna selezione multipla in nessun punto della pagina. La sola azione
"bulk" e la pulizia categorie mancanti, e la funzione "Rimuovi programmati" /
"Rigenera da capo" del pannello di automazione (§3.15), che operano su tutti
gli allenamenti futuri **generati**, non su una selezione dell'utente.

### 3.10 Exports / imports

Nessuno. Nessun export CSV/PDF, nessun import, nessun pulsante di stampa in
tutto l'albero di questa pagina.

### 3.11 Permessi / role gates

- A livello di percorso: `/training` e sotto `MANAGEMENT_PATH_PREFIXES`
  (`src/lib/access-roles.ts`) e protetto da `src/app/training/layout.tsx` →
  `management-area-layout` (`AccessAreaGuard`). Ruoli base ammessi:
  `MANAGEMENT_ROLES` = owner, club_manager, collaborator, staff (trainer/
  parent/athlete non possono aprire `/training`; i trainer usano
  `/trainer-dashboard`). Non e in `MANAGEMENT_ADMIN_ONLY_PATH_PREFIXES`, quindi
  tutti e quattro i ruoli (e i ruoli personalizzati ristretti da essi)
  possono raggiungerlo, soggetti al proprio perimetro sede/categoria
  (`access-scope.ts`) applicato lato server.
- Il CRUD degli eventi (`/api/v1/events*`) e vincolato dentro
  `src/lib/server/events.ts` da permessi di catalogo (`events.read`/
  `events.manage`) piu `assertActiveClub` per riga e, per attori tipo
  allenatore, il perimetro gruppo/categoria — non riprodotto lato client: il
  client mostra solo cio che il server restituisce.
- La generazione del programma settimanale ("Genera ora", "Genera fino a...",
  "Rigenera da capo", pulizia massiva "Rimuovi programmati") richiede
  `training_automation.manage`
  (`src/lib/training-automation-permissions.ts`): ruoli canonici solo owner/
  club_manager (non collaborator/staff/trainer), o un ruolo personalizzato
  esplicitamente ristretto da owner/club_manager che porti quella chiave via
  `narrowDomainPermission`. Leggere/scrivere `weekly_schedule` di per se e
  CRUD generico (`canAccessClubResource(role, "weekly_schedule", ...)`),
  indipendente da quella chiave.
- Convenzione errore di autorizzazione lato server: ogni fallimento di
  autorizzazione deve contenere la stringa **"Accesso negato"**
  (imposto da `assertTrainingAutomationPermission` e dal resto del dominio)
  cosi che il route handler generico lo mappi a HTTP 403.

### 3.12 States

- **Loading**: i sotto-componenti importati dinamicamente
  (`WeeklyTrainingSchedule`, `AddTrainingForm`, `EditTrainingForm`,
  `AttendanceSheet`) mostrano `<div className="h-56 animate-pulse .../>` o un
  placeholder a card bianca pulsante mentre il loro chunk carica; la card del
  programma settimanale stessa e differita dietro un `IntersectionObserver`
  (`shouldRenderSchedule`, `rootMargin` 240px) cosi non si renderizza finche
  non si scrolla vicino.
- **Vuoto (nessun allenamento quel giorno)**: **"Nessun allenamento
  programmato per questa data"** (vista giornaliera, `text-gray-500`);
  l'equivalente in vista calendario aggiunge un'icona `CalendarDays` sopra la
  stessa frase.
- **Filtrato-vuoto**: la stessa copia vuota si applica anche dopo che il
  filtro Sede riduce a zero l'elenco (nessun messaggio distinto "nessun
  risultato per questo filtro").
- **Errore (caricamento dati)**: fallimento parziale → banner ambra con le
  sezioni fallite ("Alcune sezioni non sono state caricate correttamente:
  {sezioni}."); fallimento totale → "Non è stato possibile caricare tutti i
  dati degli allenamenti. Riprova tra qualche istante." + toast "Errore nel
  caricamento dei dati".
- **Ristretto**: gestito interamente dalla guardia di layout (redirect/blocco
  prima che la pagina si monti) — il componente pagina non ha un ramo
  esplicito "non hai accesso".
- **Conflitto di lock ottimistico** (modifica/annulla/ripristina): un
  messaggio server che contiene "modificato da qualcun altro" scatena un
  `loadData()` automatico e, per la modifica, ri-sincronizza il modal ancora
  aperto con la riga fresca invece di lasciarlo bloccato a riprovare con una
  `version` obsoleta.

### 3.13 Destructive flows

| Azione | Conferma | Reversibile? |
|---|---|---|
| Annulla | `window.confirm` nativo | si, via Ripristina |
| Ripristina | `window.confirm` nativo | n/a |
| Elimina (cancellazione definitiva) | `AlertDialog` dell'app | no ("L'operazione non puo essere annullata") — e permessa lato server solo se l'evento ha zero righe di partecipazione |
| Massiva "Rimuovi allenamenti in programma" | `AlertDialog` dell'app che spiega il perimetro | no per cio che viene rimosso; lascia esplicitamente intatto cio che ha storia |
| Conferme sovrapposizione/cross-site al salvataggio | `AlertDialog` dell'app (helper condiviso basato su promise, `richiediConferma`), non `window.confirm` — deliberatamente, perche i browser sopprimono conferme native ripetute e alcune webview non le mostrano affatto | n/a (condiziona solo il salvataggio) |

Nota l'incoerenza deliberata gia segnalata nei commenti del codice:
Annulla/Ripristina usano ancora `window.confirm` nativo, mentre elimina,
pulizia massiva e conferme sovrapposizione/cross-site sono state migrate al
pattern `AlertDialog` in-app (un precedente flusso di conferma-elimina con
PIN e stato rimosso del tutto, "Blocco 7, punto 17").

### 3.14 Navigazione

- Query param consumati: `trainingId`, `focus=attendance` (apre
  automaticamente il foglio presenze una volta), `date` (seleziona il
  giorno/data calendario), `action=new` (apre il modal Aggiungi, poi rimosso
  dall'URL).
- Nessun deep-link in-pagina verso altre pagine (nessun `<Link>` esplicito
  trovato in questo file oltre alla chrome Sidebar/Header).
- Sia `AddTrainingForm` che `EditTrainingForm` sono consumati solo da questa
  pagina (il loro ramo `isAppointment` e codice morto su questa rotta — gli
  appuntamenti non si creano da `/training`).

### 3.15 Test collegati

- `tests/ui/training-categoria-groupOptions.test.mjs` — il `TrainingGroupSelector`
  condiviso conta le categorie omonime per nome non per `categoryId` (logica
  suffisso sede); verifica che piu schermate (allenamenti/gare/programma
  settimanale) usino tutte il selettore condiviso; verifica che il dialogo di
  modifica del programma settimanale scelga un *gruppo*, non una categoria
  grezza.
- `tests/ui/weekly-schedule-impact-banner.test.mjs` — dopo un salvataggio
  riuscito del programma settimanale, l'impatto sugli eventi futuri viene
  verificato; il banner risultante offre due scelte reali (non solo un OK);
  non e un modal bloccante a ogni pressione di tasto; il componente client
  non importa `src/lib/server/**`.
- `tests/ui/programma-settimanale-toggle-attivo.test.mjs` — il dialogo di
  modifica del programma settimanale ha un interruttore attivo/inattivo; una
  regola disattivata e segnalata visivamente nell'elenco.
- `tests/ui/struttura-consigliata-cross-site-superfici.test.mjs` —
  `AddTrainingForm`/`AddMatchForm`/`WeeklyTrainingSchedulePanel` usano tutti
  `resolveRecommendedStructures`; `training/page.tsx` richiede conferma
  cross-site prima di salvare un allenamento (verificato direttamente su
  questo file); l'avviso cross-site del dialogo di modifica del programma
  settimanale scatta solo se la struttura e davvero cambiata; nessuna di
  queste superfici importa `src/lib/server/**`.
- `tests/ui/multisite-ux.test.mjs` — suite ampia multi-sede/gruppi: il
  filtro sede non si monta per club a sede unica; le schermate con filtro
  sede riusano il componente condiviso; la sede di un allenamento si deriva
  dalla sua struttura (`training.siteId`/`site_id` NON deve apparire
  direttamente — verificato via regex); gli allenamenti sono assegnati a
  gruppi non a categorie grezze; le presenze mostrano solo la squadra
  dell'allenamento, non l'intera categoria; un allenamento senza gruppi
  dichiarati ricade sulla categoria; un allenatore puo seguire piu squadre
  senza duplicare la sua scheda; gli allenatori proposti seguono i gruppi
  selezionati; i gruppi impliciti non appaiono mai come squadre
  selezionabili.
- `tests/server/registro-presenze-rilettura.test.mjs` — il calendario
  riporta quante presenze registrate/presenti; un evento senza appello
  risponde zero (non una chiave assente); le schermate allenamenti e gare
  leggono lo stesso archivio per l'appello; "l'appello e stato fatto?" ha
  esattamente un lettore (verifica via regex che il vecchio controllo inline
  `Array.isArray(training.attendance)` sia sparito).
- `tests/server/convocazioni-rilettura.test.mjs` — suite analoga per le
  convocazioni gara (dominio adiacente, stesso schema); verifica che la
  pagina Gare salvi tramite lo scrittore canonico, non la proiezione legacy.
- `tests/lib/pp-01-allenamenti.test.mjs` — correttezza multi-categoria (tutte
  le categorie preservate, primaria prima, dedup, categoria sconosciuta non
  vuota l'etichetta); `allowOverlap` e un'istruzione di richiesta non un dato
  salvato sull'evento; regole di congelamento campi (§B): titolo/note/
  allenatori non si congelano mai; istante/luogo/categorie/capienza si
  congelano una volta che c'e storia; riscrivere un valore identico non conta
  come modifica; una stessa data come stringa vs Date non e un falso
  positivo di modifica; piu campi congelati sono tutti nominati insieme nel
  rifiuto.
- `tests/lib/categoria-omonima-programma-allenamenti.test.mjs` — due
  categorie identicamente nominate su due sedi restano due gruppi attivi
  distinti; i gruppi inattivi non emergono come opzione selezionabile e non
  creano un terzo fantasma; nessuna fusione silenziosa per nome (gli id
  restano canonici); rinominare una sede cambia solo l'etichetta del gruppo,
  non l'identita della categoria; la disambiguazione e per nome scritto
  esatto, riproducendo un bug segnalato specifico.
- `tests/lib/training-automation-permessi.test.mjs` — solo owner/club_manager
  generano sui ruoli canonici; un ruolo personalizzato senza la chiave non
  puo generare; uno con la chiave puo; un trainer non ottiene la capacita
  solo gestendo le presenze; `hasTrainingAutomationPermission` e l'unica
  vera funzione dietro il nome di comodo.
- `tests/lib/rimborso-stornato-e-allenamento-annullato.test.mjs` — verifiche
  adiacenti del dominio contributi: un rimborso stornato non consuma piu il
  suo tetto; la riga di storno non viene mai contata essa stessa come
  rimborso; un allenamento annullato non entra nella riconciliazione di un
  programma di finanziamento; uno stato mancante/assente non e trattato come
  "annullato".
- Pannello automazione (specifici): `tests/ui/sospensioni-automazione-panel.test.mjs`
  (elenco esclusioni/aggiungi/rimuovi), `tests/ui/training-schedule-automation-panel.test.mjs`
  (preset 7/14/21/30/60, interruttore unico di disattivazione,
  `generatedUntil` letto direttamente dalle impostazioni, "Genera fino
  a..."/anteprima condividono la stessa rotta canonica distinta solo da
  `preview`, il riepilogo mostra creati/esistenti/conflitti/esclusi non solo
  un totale, nessun import server), `tests/ui/training-schedule-automation-panel-genera-ora.test.mjs`
  ("Genera ora" conta `generatedCount` non `generatedTrainings.length`; il
  risultato — incluse le ragioni di esclusione — resta a schermo, non solo
  nel toast).
- Test del motore di generazione sottostante (esercitati indirettamente
  tramite questo pannello, non verificano il JSX della pagina):
  `gruppo-operativo-identita-slot`, `impatto-modifica-programma-settimanale`,
  `impatto-programma-hostile-audit-fix`, `programma-disattivato`,
  `sospensioni-generazione`, `tetto-applicazione-impatto`,
  `training-automation-genera-fino-a`,
  `training-automation-genera-ora-non-abortisce-il-blocco`,
  `training-automation-stagione` — coprono identita/fusione slot, parita
  anteprima/applicazione dell'impatto sul programma settimanale, un tetto a
  quanto un'applicazione puo toccare, semantica finestra di esclusione,
  esclusione di generazione per stagione/regola inattiva, e comportamento di
  intervallo data "genera fino a".

### 3.16 Component inventory

| File | Ruolo | Ambito |
|---|---|---|
| `src/app/training/page.tsx` | La pagina: stato, orchestrazione dati, tutto il rendering card/elenco/calendario, tutti i dialoghi di conferma | proprio della pagina |
| `src/app/training/layout.tsx` | `export { default } from "@/components/auth/management-area-layout"` — guardia di percorso | condiviso (tutte le pagine gestionali) |
| `src/components/training/TrainingGroupSelector.tsx` | Selettore a checkbox gruppi + helper `categoryIdsFromGroups`/`groupIdsForCategories` | UI di dominio condivisa (allenamenti + gare + programma settimanale) |
| `src/components/forms/AddTrainingForm.tsx` | Dialog crea-allenamento (raddoppia come crea-appuntamento, non usato qui) | componente condiviso, ma il ramo appuntamento e peso morto su questa rotta |
| `src/components/forms/EditTrainingForm.tsx` | Dialog modifica-allenamento | usato solo da `/training` (nessun altro importatore trovato) — candidato a consolidamento se ridisegnato |
| `src/components/trainer/AttendanceSheet.tsx` | UI di registrazione presenze | condiviso con le schermate area allenatore (`/training`, `trainer-trainings-page`, `trainer-trainings-dashboard-page`) |
| `src/components/trainer/TrainingRsvpSummary.tsx` | Conteggi RSVP dentro il foglio presenze | condiviso (stesse tre schermate) |
| `src/components/dashboard/WeeklyTrainingSchedulePanel.tsx` | Griglia programma ricorrente + dialoghi aggiungi/modifica | componente condiviso dashboard/training |
| `src/components/trainer/TrainingScheduleAutomationPanel.tsx` | Superficie di controllo generazione automatica incorporata nel pannello settimanale | usato solo da `WeeklyTrainingSchedulePanel` |
| `src/components/sites/site-filter.tsx` | Tendina Sede condivisa | condiviso (piu pagine) |
| `src/components/events/event-rsvp-fields.tsx` | Campi RSVP-richiesto/scadenza/capienza, wrapper leggero su `src/lib/events/model.ts` | condiviso (form allenamenti + gare) |
| `src/lib/training-utils.ts` | Helper di dominio puri: estrazione data/ora, risoluzione etichetta categoria/allenatore, calcolo sovrapposizioni/conflitti, `dedupeTrainings`, `getTrainingPhase`, `canRecordTrainingAttendance`, chiavi stabili | di dominio, ampiamente riusato |
| `src/lib/training-location-options.ts` | Costruisce l'elenco opzioni struttura/campo + helper di lookup/fallback | di dominio |
| `src/lib/training-automation-utils.ts` | Default/parsing impostazioni automazione, calcolo prossima esecuzione, etichette giorni | di dominio (logica pura condivisa client+server) |
| `src/lib/training-automation-permissions.ts` | Guardia permesso `training_automation.manage` | di dominio |
| `src/lib/server/training-automation.ts` | Motore di generazione server (non letto per intero — fuori dallo scope di parita client) | di dominio server |
| `src/lib/events/client.ts` | Wrapper `apiRequest` leggeri: `createEvent`, `updateEvent`, `cancelEvent`, `restoreEvent`, `deleteEventIfEmpty`, `listEventParticipants`, `saveEventAttendance`, `saveEventConvocations`, `createEventsBatch`, `listEvents` | livello di trasporto condiviso, tutte le schermate del dominio eventi |
| `src/lib/club-sites.ts` | Modello sedi/strutture/gruppi categoria: `buildSiteIndex`, `buildCategoryGroups`, `getActiveCategoryGroups`, `readTrainingGroupIds`, `getAthleteGroupIds`, `isCrossSiteEvent`, `resolveRecommendedStructures`, `recordMatchesSite`, ecc. | di dominio, condiviso ampiamente (atleti, gare, categorie) |
| `src/lib/category-utils.ts` | `athleteMatchesAnyCategory` (unico export usato da questa pagina) piu il modello piu ampio del catalogo categorie | condiviso |
| `src/lib/categories/identity.ts` | `sameCategory` — confronto canonico di identita categoria usato da `trainingMatchesCategory` | condiviso, sensibile a sicurezza/audit per la tabella di ownership di CLAUDE.md |
| `src/lib/athlete-category-memberships.ts` | `getParticipationCategoryContext`/`getParticipationCategoryBadgeLabel`/`getPrimaryAthleteCategoryMembership` | condiviso |
| `src/lib/athlete-participation-utils.ts` | `normalizeTrainingAttendanceEntries` | condiviso |
| `src/lib/athlete-name-utils.ts` | `getAthleteDisplayName`, `compareAthletesByLastName` | condiviso |
| `src/lib/medical-certificates.ts` | `getMedicalCertificateAvailability(Label)` | condiviso |
| `src/lib/trainer-operational-alerts.ts` | `readRecordedAttendance` — l'unico lettore di "l'appello e stato fatto" | condiviso (dashboard allenatore + questa pagina) |
| `src/lib/simplified-db.ts` | `getClubCategories/Trainings/Trainers/WeeklySchedule/Data/Structures/Athletes`, `cleanupOrphanScheduledTrainings`, `saveTrainingAttendance`, `clearUpcomingGeneratedTrainings` — modulo dominio client legacy esplicitamente "in riduzione" per CLAUDE.md (non aggiungere logica nuova qui) | condiviso, in via di superamento |
| `src/lib/trainer-utils.ts` | `getAssociatedTrainerIdsForGroups`/`trainerFollowsGroup`/`getTrainerDisplayName` | condiviso |

Nessun componente morto/orfano specifico di questa pagina oltre a
`EditTrainingForm` (consumatore unico — candidato a restare page-scoped
piuttosto che promosso a condiviso, se ridisegnato) e al ramo
`isAppointment` di `AddTrainingForm` (irraggiungibile da `/training` oggi).

---

## 4. `/categories` (Categorie)

Fonte: `src/app/categories/page.tsx` (~1590 righe, letto per intero) e i
moduli collegati (sedi, gruppi operativi, identita categoria).

### 4.1 Data shown

Header pagina: `SharedPageHeader` titolo **"Categorie"**, sottotitolo
**"Organizza le categorie e i gruppi sportivi del club."** `Header` del
browser: titolo anch'esso **"Categorie"**.

**Card per categoria** (grid `grid-cols-1 md:grid-cols-2 lg:grid-cols-3`),
costruita da `buildCategoryViewModel`:

| Elemento | Fonte | Note |
|---|---|---|
| Barra colore (`h-2`) | `category.color.split(" ")[0]` | `category.color` default `"bg-blue-500 text-white"` |
| Freccette su/giu (`ChevronUp`/`ChevronDown`, `data-testid="sposta-su"`/`"sposta-giu"`) | posizione nel risultato di `ordineDelClub` | renderizzate solo quando `!searchQuery && !siteFilter`; `aria-label`: "Sposta {nome} in su" / "in giu"; disabilitate a inizio/fine elenco |
| Nome categoria (`CardTitle`, troncato) | `category.name` |
| Badge sport (`Badge`, troncato max-w-180px, `title` = sport intero) | `category.sport` = `rawCategory.description \|\| rawCategory.sport \|\| "Sport"` |
| "Anni di nascita: {etichetta}" | `formatCategoryBirthYears` → "Nati nel {Y}" / "Nati dal {Y1} al {Y2}" / ripiega su `ageRange` grezzo / "Anni di nascita non definiti" |
| Badge sedi (icona `MapPin` + `group.siteName`) | solo se `isMultiSiteClub(sites)`; da `groupsByCategoryId.get(category.id)` filtrati `!group.implicit` |
| Bottone ghost "Cambia sedi" / "Assegna sedi" | accanto ai badge sede, solo multi-sede; etichetta dipende dall'esistenza di almeno un gruppo non implicito |
| "{n} atleti" | `category.athletesCount` = atleti attivi (`status === "active"`) che combaciano la categoria via `athleteBelongsToCategory` |
| "{n} allenatori" | `category.trainersCount` = allenatori che combaciano via `trainerHasCategory` |
| "{n} allenamento settimanale" / "{n} allenamenti settimanali" | `category.trainingsPerWeek` = `countWeeklyCategorySlots` (dedup per chiave stabile dello slot, filtrato sulla stagione attiva se `activeSeasonId` e impostato) |
| Menu kebab (`MoreVertical`, `aria-label="Azioni per {nome}"`) | Modifica / Info / Elimina |

**`CategoryDetailsDialog`** ("Info") — titolo **"Informazioni Categoria
{nome}"**, bottone **"Modifica Categoria"**, sezioni:
- "Informazioni Generali": Nome, Sport, Anni di nascita, Atleti iscritti,
  Allenatori, Allenamenti settimanali (con singolare/plurale)
- "Note": "Categoria {nome} collegata agli atleti nati in questo intervallo:
  {etichettaAnni}." + "Per visualizzare allenatori e atleti specifici,
  utilizza le sezioni dedicate del sistema."
- Footer: **"Chiudi"**

**Dialog conferma eliminazione** — titolo **"Conferma eliminazione"**:
nome categoria, "Atleti collegati: {n}", e corpo condizionale (§4.7).

Stati vuoto/loading/ristretto — §4.10.

### 4.2 Actions

| Azione | Trigger | Effetto/API |
|---|---|---|
| **"Nuova Categoria"** (in alto a destra, blu) | bottone `Plus` | apre `CategoryEditorDialog` (creazione) |
| Campo ricerca "Cerca categorie..." | icona `Search` | filtro client-side su nome/sport (§4.5) |
| Dropdown Filtri | **codice morto** — dietro `{false ? (...) : null}`, non renderizza mai. Contiene voci inerti "Per Sport", "Per Età", "Per Numero Atleti", "Resetta Filtri" — **irraggiungibile, candidato a rimozione** |
| `SiteFilter` "Mostra le categorie svolte a" | `<Select>` | filtro sede client-side (renderizza solo se `isMultiSiteClub`) |
| Freccette su/giu | per card | `spostaCategoria(categoryId, -1|1)` → riordino ottimistico, poi per ogni categoria riordinata chiama `PATCH /api/v1/categories/:id` con `{ sortOrder: indice }` e header `x-active-club-id`; ripristina + toast errore se fallisce |
| **"Cambia sedi"/"Assegna sedi"** | per card | apre il dialog editor precompilato su quella categoria (come Modifica, focalizzato sulle sedi) |
| **Modifica** (kebab) | `DropdownMenuItem` | apre `CategoryEditorDialog` in modifica, `initialData = selectedCategory` |
| **Info** (kebab) | `DropdownMenuItem` | apre `CategoryDetailsDialog` |
| **Elimina** (kebab, rosso) | `DropdownMenuItem` | apre il dialog di conferma eliminazione |
| **Modifica Categoria** (dentro il dialog Info) | bottone | chiude Info, apre l'editor in modifica |
| **Annulla** (dialog elimina) | bottone | chiude il dialog (disabilitato durante l'eliminazione) |
| **Elimina categoria** / "Eliminazione..." (dialog elimina) | bottone, rosso | `handleDeleteCategory` (§4.7) |
| **"Vai alla Dashboard"** (stato vuoto senza club) | bottone | `window.location.href = "/dashboard"` |
| **"Crea Prima Categoria"** (stato vuoto) | bottone | apre il dialog di creazione |
| Editor **"Salva"/"Aggiorna"** | submit | `handleAddCategory` (§4.3/§4.7) |
| Editor **"Annulla"** | bottone | chiude il dialog, nessun salvataggio |

La creazione/modifica categoria **non** passa dalla rotta generica
`/api/v1/categories` per l'upsert di base — scrive direttamente via
`supabase.from("categories").upsert(payload)` (scrittura diretta sulla
tabella, non tramite `apiRequest`), poi condizionalmente:
- `supabase.from("clubs").update({ trainers: updatedTrainers })` per la
  riassegnazione allenatori
- `persistCategoryGroups` → `updateClubData(activeClub.id, "category_groups",
  next)` (da `simplified-db.ts`) per i cambi sede/gruppo
- `PATCH /api/v1/athlete_category_memberships/:id` con `{ site_id }` per
  ciascuna appartenenza atleta, per il "riallineamento" se richiesto
- `PATCH /api/v1/categories/:id` con `{ sortOrder }`, solo da
  `spostaCategoria` (freccette), non dal dialog di modifica

Eliminazione categoria:
- `updateAthleteCategoryOnly` → `updateClubAthlete(clubId, athleteId,
  payload)` (simplified-db, non un fetch grezzo) per ogni atleta collegato,
  per rimuovere i riferimenti alla categoria
- `supabase.from("categories").delete().eq("id",
  categoryToDelete.id).eq("club_id", activeClub.id)`

### 4.3 Forms

**Dialog crea/modifica categoria** (`CategoryEditorDialog`,
`src/components/forms/CategoryEditorDialog.tsx`)

Titolo modal: **"Modifica Categoria"** / **"Aggiungi Nuova Categoria"**;
descrizione: **"Modifica i dettagli della categoria"** / **"Inserisci i
dettagli della nuova categoria"**. Footer: **"Annulla"**,
**"Aggiorna"/"Salva"**.

Campi, dall'alto in basso:

1. **Nome Categoria** (`name`, testo obbligatorio, placeholder "Es. Under
   14")
2. **Descrizione** (`description`, testo, placeholder "Es. Calcio a 5",
   `maxLength={CATEGORY_DESCRIPTION_MAX_LENGTH}` = **25**). Testo di aiuto:
   "Massimo 25 caratteri. La descrizione viene mostrata come badge." +
   contatore live "{n}/25". Rivalidato anche all'invio (toast d'errore se
   > 25 caratteri).
3. **Anno di nascita dal** (`birthYearFrom`, `<select>` obbligatorio, opzioni
   = ultimi 80 anni dall'anno corrente in ordine decrescente, placeholder
   "Seleziona anno")
4. **Anno di nascita al (facoltativo)** (`birthYearTo`, `<select>`
   opzionale, stesso intervallo; opzione 0 = "Solo l'anno iniziale", cioe
   categoria vuota/di un solo anno). Testo di aiuto sotto la coppia: "Gli
   atleti potranno essere collegati automaticamente a questa categoria in
   base al loro anno di nascita."
5. **Colore** (`color`, `<select>`) — 8 tonalita fisse: Blu (`bg-blue-500
   text-white`, default), Verde, Rosso, Giallo, Viola, Rosa, Indaco,
   Arancione (ognuna `bg-{x}-500 text-white`)
6. **Sedi in cui è attiva** — renderizzato solo se `availableSites.length >=
   2` (`showSites`). Chip a bottone toggle per sede (`aria-pressed`),
   selezionata = blu pieno. Testo di aiuto sul meccanismo del gruppo
   operativo (§4.4). Se nessuna selezionata: avviso ambra "Nessuna sede
   indicata: la categoria resta una squadra sola, senza sede."
   - **Pannello impatto** (`data-testid="impatto-cambio-sede"`, box ambra)
     appare solo modificando una categoria esistente E
     `atletiDisallineati > 0` (calcolato live via
     `rilevaDisallineamentiDiSede` a ogni toggle di sede). Mostra il
     conteggio ("1 atleta resta assegnato..." / "{n} atleti restano
     assegnati a una sede che questa categoria non servirà più"), un
     elenco per sede, testo esplicativo, e una **select di
     riallineamento** (`data-testid="riallineamento-sede"`, id
     `riallineamento-sede`): opzioni = "Lascia come sono" (default, valore
     vuoto), "Sposta su {nomeSede}" per ciascuna sede attualmente
     selezionata, e "Togli la sede (restano nella categoria, senza sede)"
     (`__senza_sede__`). Deselezionare una sede scelta per il riallineamento
     azzera automaticamente la selezione (`useEffect`).
7. **Categorie compatibili** — elenco chip toggle di tutte le altre
   categorie del club (`availableCategories` meno quella in modifica), da
   `readCategoryCompatibilityList`. Stato vuoto: "Nessun'altra categoria
   configurata nel club."
8. **Assegnazione rapida allenatori** — elenco chip toggle di tutti gli
   allenatori del club. Testo di aiuto: "Un allenatore può essere assegnato
   a più categorie." Stato vuoto: "Nessun allenatore disponibile nel club."

Validazione all'invio (`handleSubmit`):
- nome obbligatorio → "Il nome categoria e' obbligatorio"
- `birthYearFrom` deve essere un intero → "Inserisci un anno di nascita
  valido"
- `birthYearTo` (default = `birthYearFrom` se vuoto) deve essere intero →
  "L'anno di nascita finale non e' valido"
- `birthYearFrom > birthYearTo` → "L'anno di nascita iniziale non puo'
  essere maggiore di quello finale"
- descrizione > 25 caratteri → "La descrizione categoria deve essere al
  massimo 25 caratteri"

Payload inviato: `name`, `description`, `birthYearFrom`, `birthYearTo`,
`ageRange` (derivato `"Y"` o `"Y1-Y2"`), `athletesCount`/`trainersCount`/
`trainingsPerWeek` (riportati da `initialData`, default 0),
`assignedTrainerIds`, `compatibleCategoryIds`, `siteIds` (array vuoto se
`!showSites`), `riallineamento` (`{ athleteIds, siteId }` o `null`).

Comportamento di reset del form: resetta `formData` solo quando il dialog si
apre su un **target diverso** (tracciato via `resetTargetRef`, chiave
`initialData?.id ?? "__new__"`), non a ogni re-render del genitore — preserva
deliberatamente una modifica in corso attraverso un re-render causato da un
toast di errore. Se `onSubmit` ritorna `false`, il dialog resta aperto e
**non** resetta ne chiude il form.

**Dialog crea/modifica Sede** (`ClubSitesSection`,
`src/components/sites/club-sites-section.tsx`)

**Nota**: vive nella pagina **Strutture**, non su `/categories` — la pagina
categorie **consuma soltanto** `sites`/`siteIds`, non gestisce essa stessa il
CRUD delle sedi. Incluso perche nello scope della ricerca.

Titolo dialog: **"Modifica sede"** / **"Nuova sede"**. Campi:
1. **Nome sede** (`name`, obbligatorio, placeholder "Roma")
2. **Città** (`city`, opzionale)
3. **Indirizzo** (`address`, opzionale)
4. **Note** (`notes`, opzionale)
5. **Sede attiva** (`Switch`, default `true`)

Validazione: nome obbligatorio ("Il nome della sede e obbligatorio"); nome
duplicato (case-insensitive, escluso se stesso) rifiutato ("Esiste già una
sede con questo nome"). Footer: **Annulla** / **Salva**.

Vista elenco: ogni riga sede mostra nome (+ badge "Disattivata" se inattiva),
`città · indirizzo` (o "Nessun indirizzo") + conteggio strutture (" · {n}
strutture"), bottoni **Modifica** (matita) e **Elimina** (cestino). Elimina e
disabilitato con tooltip "Ha strutture collegate: disattivala invece di
eliminarla" quando `structureCountBySiteId[site.id] > 0` — una sede con
strutture collegate non si puo eliminare, solo disattivare. Testo
introduttivo e stato vuoto "Nessuna sede configurata: il club lavora come
mono-sede."

### 4.4 Categoria vs. gruppo operativo per sede

Modello centrale in `src/lib/club-sites.ts` (ADR-0038) piu
`src/lib/categories/identity.ts` (ADR-0155) e `src/lib/categories/display.ts`
(D-INT-3).

- **Categoria**: l'entita fascia-d'eta/configurazione (tabella `categories`)
  — una riga, un intervallo di anni di nascita, una configurazione di
  compatibilita, indipendentemente da quante sedi la ospitano.
- **Sede**: un luogo fisico in cui il club opera (`club_sites`), con `id,
  name, city, address, notes, active`.
- **Struttura**: un impianto dentro una sede (`structures.siteId`), fuori
  scope di questa pagina ma referenziato.
- **Gruppo operativo**: la coppia **(categoryId, siteId)** — la squadra
  reale e concreta, es. "Pulcini · Roma". Etichetta costruita da
  `buildCategoryGroupLabel(categoryName, siteName)` uniti con
  `CATEGORY_GROUP_SEPARATOR = " · "` (punto medio con spazi). L'id del
  gruppo e **derivato**, mai memorizzato arbitrariamente:
  `buildCategoryGroupId(categoryId, siteId)` → `group:${categoryId}:${siteId}`
  o `group:${categoryId}` senza sede.
- **Quale superficie usa cosa**: le superfici di configurazione (intervallo
  anni di nascita, compatibilita, proprieta sportive) selezionano la
  **categoria**; le superfici operative (rosa atleti, allenamenti,
  presenze, convocazioni, numerazione maglie, programma settimanale)
  selezionano il **gruppo operativo**. Confondere le due era il bug storico
  (atleti di "Pulcini · Scauri" che finivano nell'appello di "Pulcini ·
  Santi Cosma").
- **Categoria omonima** (due categorie con lo stesso nome su due sedi):
  l'identita **non** si deriva mai per corrispondenza di nome o parsing di
  suffisso di stringa (rifiuto esplicito di dedurre la sede dal nome, es.
  "Pulcini - Scauri" e solo un nome a meno che un legame sede non sia
  esplicitamente configurato). Due categorie con lo stesso nome ma `id`
  distinti reali restano sempre due voci di catalogo distinte
  (`findCategoryIndex`/`mergeCategoryOption` in `category-utils.ts` si
  rifiutano di fondere due voci che portano ciascuna un proprio id
  distinto, salvo quando il candidato e "derivato" da un record atleta
  obsoleto). Il confronto/matching per "questo atleta e in questa categoria"
  e centralizzato in `sameCategory`/`categoryIdentity`
  (`categories/identity.ts`): un id conosciuto dal catalogo vince; un nome
  si risolve solo se nomina esattamente **una** categoria nel catalogo,
  altrimenti e `ambiguous` e non risolve a **niente** (mai "il primo
  match" — e esattamente la regressione che ADR-0155 ha corretto).
- **Disambiguazione in visualizzazione** (`categories/display.ts`,
  componente `CategoryLabel`): un nome categoria si mostra nudo ("Under 15")
  a meno che (a) il nome sia ambiguo nell'insieme visualizzato E (b) la
  categoria abbia esattamente una sede tra i suoi gruppi attivi E (c)
  nessun'altra categoria omonima rivendichi in modo univoco la stessa sede —
  solo allora si aggiunge "(Sede)", es. "Under 15 (Formia)", renderizzato in
  uno `<span>` separato piu piccolo/attenuato (non concatenato nella stessa
  stringa, per correttezza screen-reader). **Nota importante**: `/categories/page.tsx`
  **non usa** `CategoryLabel`/`describeCategoryForDisplay` — costruisce la
  propria visualizzazione inline del nome, una discrepanza rispetto al
  meccanismo canonico da segnalare per il redesign.
- **Gruppi impliciti**: `buildCategoryGroups` restituisce sempre un gruppo
  per categoria configurata anche senza legame sede ("gruppo implicito",
  `siteId: ""`, `implicit: true`). Un riferimento categoria "fantasma"
  storico (un nome che il catalogo non riconosce, citato solo da un record
  atleta) e esplicitamente escluso dal diventare un gruppo implicito
  selezionabile (`configured: false`) — resta visibile in rose/report ma non
  appare mai come una terza squadra finta.
- **Cambiare le sedi di una categoria esistente non migra gli atleti.**
  Deselezionare una sede nell'editor non sposta/scollega le appartenenze
  atleta; **archivia** il gruppo ora non piu elencato (`active: false`,
  mantenuto per storia) via `buildCategoryGroupsForSites`.
  `rilevaDisallineamentiDiSede` calcola quali atleti restano puntati a una
  sede che la categoria non serve piu (un `DisallineamentoDiSede[]`),
  mostrato live nel dialog, con un "riallineamento" esplicito opzionale che
  l'utente puo attivare — mai automatico.
- Il multi-sede si attiva solo con **≥2 sedi attive** (`isMultiSiteClub`);
  con 0 o 1 sede, nessuna UI/filtro di sede appare in nessun punto e tutto si
  comporta esattamente come il prodotto mono-sede originario.

### 4.5 Filtri / ricerca / ordinamento / viste

- **Ricerca** (`searchQuery`, `Input` "Cerca categorie..."): confronto
  substring case-insensitive contro `category.name` OPPURE `category.sport`.
  Solo client-side, nessun debounce, nessuna persistenza URL/localStorage.
- **`SiteFilter`** (label **"Mostra le categorie svolte a"**, id
  `categories-site-filter`): un `<Select>` che non renderizza affatto a meno
  che `isMultiSiteClub(sites)`. Opzioni: "Tutte le sedi"
  (`ALL_SITES_VALUE = "__all_sites__"`, mappa a `""`) + una voce per sede
  attiva. Logica di filtro: una categoria combacia col filtro sede se ha
  **almeno un** gruppo il cui `siteId` e uguale alla sede selezionata OPPURE
  il cui `siteId` e vuoto (i gruppi impliciti/non assegnati restano visibili
  indipendentemente dal filtro — i dati storici non devono scomparire).
  Solo client-side, nessuna persistenza URL/localStorage.
- **Ordinamento**: `ordineDelClub` — chiave primaria `sortOrder` (letto via
  `readCategorySortOrder`, controllando `sortOrder`/`sort_order`/
  `payload.sortOrder`/`payload.sort_order`), valori assenti spinti a
  `Number.MAX_SAFE_INTEGER` (cioe in fondo); pareggi risolti dall'indice
  originale nell'array (ordine di creazione). E l'ordine scelto a mano dal
  club (D-INT-9), **non** alfabetico.
- **Riordino** (senza drag&drop, a freccette) disponibile solo quando **sia**
  la ricerca **sia** il filtro sede sono vuoti/non impostati — spostare "una
  posizione" dentro un sottoinsieme filtrato e stato giudicato privo di senso/
  fuorviante, quindi i controlli sono nascosti.
- Nessun toggle di raggruppamento/vista (elenco vs. raggruppato-per-sede)
  esiste su questa pagina — il raggruppamento per sede si manifesta solo
  come: (a) badge delle sedi assegnate per card, (b) il filtro sede che
  restringe la stessa grid piatta di card.
- Nessuna chiave `localStorage` usata da questa pagina per stato di
  filtro/ricerca/ordinamento — tutto ricade ai default (`""`) al
  remount/reload.

### 4.6 Bulk actions / selezione

Nessuna. Non esiste multi-selezione, nessun archivia/elimina/esporta
massivo su questa pagina. Ogni card categoria agisce individualmente.

### 4.7 Archive behaviour

**Non esiste uno stato/flag "archiviata" per la categoria stessa** — le
categorie si cancellano definitivamente, non si archiviano. Cio che **e**
archiviato (soft-delete) e un **gruppo operativo** (coppia
categoria↔sede), quando una sede viene deselezionata nell'editor:
`buildCategoryGroupsForSites` marca il gruppo `active: false` e lo mantiene
(con etichetta/nome categoria aggiornati) invece di rimuoverlo, "cosi la
storia che lo cita non resta orfana." I gruppi archiviati sono esclusi dagli
elenchi "attivi" (`getActiveCategoryGroups`, es. le tendine per assegnare un
nuovo allenamento) ma restano leggibili nei record storici.

**Flusso di eliminazione categoria** (`handleDeleteCategory`, kebab →
"Elimina"):
1. Apre `Dialog` "Conferma eliminazione" con nome categoria, conteggio
   atleti collegati (`categoryToDeleteAthletes`, via `getAthletesInCategory`),
   e testo condizionale:
   - Con atleti collegati: **"Questa categoria contiene {n} atleti.
     Eliminando la categoria, gli atleti verranno spostati in Senza
     categoria."**
   - Senza: **"Questa categoria non contiene atleti. Puoi eliminarla senza
     spostare tesserati."**
2. Bottone di conferma: **"Elimina categoria"**, diventa
   **"Eliminazione..."** e disabilitato durante l'operazione;
   **"Annulla"** disabilitato anch'esso durante l'eliminazione.
3. Alla conferma: `detachAthletesFromCategory` rimuove la categoria da ogni
   atleta collegato via `updateAthleteCategoryOnly`→`updateClubAthlete`
   (ricostruisce `category`, `category_id`, `categoryName`, `category_name`,
   `categories[]`, `categoryIds[]`, `categoryNames[]`,
   `categoryMemberships[]` su ogni atleta, promuovendo la prossima
   appartenenza rimasta a primaria se ne esiste una, altrimenti azzerando a
   stato vuoto/"Senza categoria") — ogni aggiornamento atleta e sequenziale/
   atteso, e se **uno qualunque** fallisce l'intera eliminazione si
   interrompe (la riga categoria non viene mai eliminata) e mostra toast
   **"Categoria non eliminata: non è stato possibile aggiornare gli atleti
   collegati."** (individuato su un messaggio d'errore che contiene
   `[athlete-update]`), o un generico **"Errore durante l'eliminazione della
   categoria. Verifica i dettagli in console."** per altri errori.
4. Se tutti gli aggiornamenti atleta riescono:
   `supabase.from("categories").delete().eq("id",
   ...).eq("club_id", ...)`. Al successo: stato locale aggiornato in
   ottimistico, `selectedCategory` azzerato se era quella eliminata, toast
   successo: **"Categoria eliminata. {n} atleti spostati in Senza
   categoria."** o **"Categoria eliminata."** (se nessuno), poi un
   `refetchCategories()` non bloccante (errori solo loggati, non mostrati).
5. Eliminare una categoria **non** toglie riferimenti a essa da allenatori,
   slot del programma settimanale, o righe `category_groups` in questo
   flusso (nessuna pulizia di `category_groups`/`trainers[].categories` che
   la referenzino) — degno di nota per la parita (comportamento esistente,
   non qualcosa da "correggere" nel redesign senza verifica, ma da
   riprodurre se mantenuto).

Nessuna azione "archivia categoria" esiste in nessun punto di `page.tsx`,
`CategoryEditorDialog`, o `CategoryDetailsDialog`.

### 4.8 Exports / imports

Nessuno su questa pagina. Nessun export CSV/PDF, nessun bottone di import,
nessun caricamento massivo per le categorie.

### 4.9 Permessi / role gates

Il file `categories/page.tsx` stesso **non contiene controlli espliciti di
chiave permesso** (nessun `narrowDomainPermission`, nessuna consultazione del
catalogo permessi, nessun componente di role-gate). Controllo d'accesso
osservato:
- Gate implicito via `useAuth()` → `user`/`activeClub`: se assenti, la pagina
  mostra lo stato vuoto "Club non selezionato" (non un 403).
- Tutte le letture/scritture Supabase sono ambientate con
  `.eq("club_id", activeClub.id)` — si affida a RLS/ambito di sessione
  piuttosto che a una chiave di permesso esplicita lato client.
- Le due chiamate `apiRequest` (PATCH riallineamento
  `athlete_category_memberships`, PATCH riordino `categories/:id`) passano
  l'header `x-active-club-id`; l'autorizzazione e imposta lato server dalla
  rotta generica delle risorse (`ensureOrganizationAccess`,
  `resolveOrganizationScopeForUser`), non visibile in questo file client.
  Nessun occultamento di UI per ruolo (es. nessun controllo tipo "solo
  admin vede Elimina") esiste in questo file — ogni utente con accesso alla
  pagina vede tutte le azioni.
- `tests/auth/perimetro-gruppo-operativo.test.mjs` e
  `tests/server/perimetro-sede-e-categoria.test.mjs` (lato server) impongono
  il modello di perimetro sede/categoria (ADR-0103) ma non sono esercitati
  dal percorso client di questa pagina direttamente.

### 4.10 States

- **Loading** (`loading || authLoading`): spinner centrato (`animate-spin`),
  nessun testo.
- **Ristretto / nessun club** (`!user || !activeClub`): icona circolare
  rossa (`Users`), titolo **"Club non selezionato"**, corpo **"Seleziona un
  club per visualizzare e gestire le categorie"**, bottone **"Vai alla
  Dashboard"**.
- **Vuoto (nessuna categoria esiste)** — stesso ramo del filtrato-vuoto
  (`filteredCategories.length === 0`): icona circolare grigia (`Users`),
  titolo **"Nessuna categoria presente"**, corpo **"Inizia creando la prima
  categoria per il tuo club"**, bottone **"Crea Prima Categoria"**. Nota:
  questa stessa UI si mostra sia quando non esiste alcuna categoria sia
  quando la ricerca/filtro sede semplicemente non trova corrispondenze —
  **non esiste una copia distinta "nessun risultato per questa ricerca"**;
  e la stessa proposta "crea la prima categoria" anche quando le categorie
  esistono ma sono filtrate via (nota di parita: un redesign potrebbe voler
  distinguerle, ma il comportamento attuale non lo fa).
- **Errore al caricamento iniziale**: intercettato in `try/catch` attorno a
  `loadCategories`, log `console.error("Error loading categories:",
  error)`, toast **error**: **"Errore durante il caricamento delle
  categorie"**, e reset di `categories`/`clubAthletes`/`clubTrainers` ad
  array vuoti (ricade nella UI di stato vuoto sopra, nessun banner d'errore
  inline distinto).
- **Errori di salvataggio** (blocco catch di `handleAddCategory`) mappano
  sottostringhe specifiche a toast in italiano:
  - `"Impossibile connettersi"` → "Problema di connessione al database.
    Verifica la configurazione di Supabase."
  - `"Risorse insufficienti"` → "Server sovraccarico. Riprova tra qualche
    secondo."
  - `"Failed to fetch"` → "Errore di connessione. Verifica la tua
    connessione internet e riprova."
  - `"ERR_INSUFFICIENT_RESOURCES"` → "Risorse insufficienti. Riprova tra
    qualche secondo."
  - `"Database"` → "Errore database: {messaggio}"
  - altrimenti → il `error.message` grezzo, o generico **"Errore imprevisto
    durante il salvataggio"**
- **Fallimento riordino** (`spostaCategoria`): ripristina lo stato
  ottimistico, toast errore **"Non e stato possibile salvare l'ordine"**.
- **Fallimento persistenza gruppi** (`persistCategoryGroups`): ripristina
  `rawCategoryGroups`, toast errore **"Salvataggio dei gruppi operativi
  fallito"**; successo (non silenzioso) toast **"Gruppi operativi
  aggiornati"**.
- **Fallimento parziale riallineamento**: toast **success** se tutti
  riallineati ("{n} assegnazione riallineata"/"{n} assegnazioni
  riallineate"), altrimenti toast **error**: "Riallineate {n} assegnazioni
  su {totale}: le altre vanno sistemate dalla scheda dell'atleta".

### 4.11 Destructive flows

| Flusso | Conferma | API/scrittura |
|---|---|---|
| **Elimina categoria** | Modal "Conferma eliminazione" (nome, conteggio atleti collegati, testo contestuale); bottone esplicito "Elimina categoria", disabilitato durante l'operazione, "Annulla" disponibile | Per atleta: `updateClubAthlete` (simplified-db) per rimuovere i riferimenti categoria → poi `supabase.from("categories").delete()` ambientato per id+club_id |
| **Rimuovere una sede da una categoria** (deseleziona nell'editor) | Nessun dialog di conferma separato — il pannello "impatto" ambra inline nello stesso form e l'avviso; il salvataggio avviene al normale submit del form | Il gruppo si archivia (`active:false`) via `persistCategoryGroups`/`updateClubData(..., "category_groups", ...)`; nessun dato atleta mutato a meno che sia scelta anche la select "riallineamento" |
| **Riallineare gli atleti disallineati** ("Riallineali adesso") | Select opt-in dentro il pannello impatto, default "Lascia come sono" (no-op) — nessun passo di conferma extra, e incluso nel Salva/Aggiorna principale | `PATCH /api/v1/athlete_category_memberships/:id` con `{ site_id }` per ogni appartenenza coinvolta |
| **Eliminare una Sede** (pagina Strutture, `ClubSitesSection`) | Nessun modal di conferma; il bottone e semplicemente disabilitato (con tooltip) se `structureCountBySiteId[site.id] > 0`, altrimenti elimina immediatamente al click | `onChange(normalizeClubSites(sites.filter(...).map(serializeClubSite)))` — nessuna chiamata server mostrata in questo componente stesso, propaga alla persistenza del genitore |
| **Riordinare le categorie** | Nessuna conferma (il click sulla freccetta e immediato, ottimistico) | `PATCH /api/v1/categories/:id` sequenziale per riga con il nuovo `sortOrder` |

Nessuna azione distruttiva in questa pagina usa `window.confirm()` — tutte
usano il componente `Dialog` personalizzato o sono toggle inline non
confermati.

### 4.12 Navigazione

- La pagina stessa **non legge alcun query param** (`useRouter()` e usato
  solo per `.push`, non `useSearchParams`).
- In uscita: l'azione "aggiungi atleta" di `CategoryAthletesDialog` fa
  `router.push('/athletes?category=' + selectedCategory.id)` piu un toast
  informativo **"Reindirizzamento alla pagina atleti per aggiungere nuovi
  atleti"**. Nota: lo stato `showAthletesDialog`/`categoryAthletes` e la
  chiamata di rendering `CategoryAthletesDialog` esistono ma **nessun
  bottone nella UI visibile di questa pagina imposta attualmente
  `showAthletesDialog` a true** — il dialog e il suo handler risultano
  percorsi di codice morti/irraggiungibili nel file attuale (nessuna
  chiamata `setShowAthletesDialog(true)` trovata su alcuna azione di card;
  solo `setShowCategoryDetails(true)` per Info) — da segnalare per il
  redesign, dato che CLAUDE.md avverte esplicitamente contro il codice
  "irraggiungibile" (§11.8).
- Bottone "Vai alla Dashboard" → `window.location.href = "/dashboard"`
  (navigazione completa, non `router.push`).
- Nessun supporto deep-link/ancora (nessun `#category-id`), nessuna gestione
  di query param in ingresso per, ad esempio, preselezionare una categoria o
  aprire il dialog di creazione dalla dashboard.

### 4.13 Test collegati

**Richiesti esplicitamente:**
- `tests/ui/categoria-omonima-superfici.test.mjs` — verifica che ogni
  superficie UI legga la sede dal modello condiviso `readSiteReference`/
  gruppi piuttosto che riscriverne una propria; la card atleta e la
  dashboard allenatore leggono sedi/gruppi; un allenatore puo leggere
  sedi/gruppi o la dashboard risponderebbe 403; "nessuna superficie riscrive
  in casa la regola della sede"; il gruppo operativo mantiene il proprio
  separatore (`CATEGORY_GROUP_SEPARATOR`).
- `tests/lib/categoria-identita-non-nome.test.mjs` — test centrali ADR-0155:
  un allenamento per "Under 15 Scauri" non e "Under 15 Formia"; funziona sia
  referenziato per id sia per nome-accanto-a-id; un atleta con due
  appartenenze combacia con entrambe e solo quelle; senza catalogo, il
  matching per nome funziona ancora (fallback); riferimenti ambigui per solo
  nome non combaciano con niente; `resolveCategoryId` non sceglie piu in
  silenzio il primo di due omonime; `buildClubCategoryOptions` non fonde due
  omonime a id vero ma fonde ancora la stessa categoria arrivata da due
  fonti; `athleteMatchesAnyCategory` con catalogo separa correttamente due
  sedi; senza catalogo, si comporta esattamente come prima (nessuna
  regressione); `sameCategory`/`athleteMatchesCategory` (le due risposte
  "canoniche") concordano su input identici.
- `tests/ui/multisite-ux.test.mjs` — ampie verifiche di meccanica UX:
  `SiteFilter` non si monta per club non multi-sede; le pagine con filtro
  sede riusano il componente condiviso (non tendine ad-hoc); le strutture
  portano la sede e restano visibili se non assegnate; nessuna grid legata
  alle sedi resta a 2 colonne a 375px (verifica responsive via regex su
  `grid-cols-[23]`); la sede di un allenamento deriva dalla sua struttura;
  una sede con strutture collegate non si puo eliminare, solo disattivare;
  "le sedi di una categoria si spuntano nel modulo della categoria" (nessuna
  seconda superficie); "non esiste una seconda superficie per i gruppi
  operativi"; salvare una categoria scrive i gruppi per le sedi spuntate;
  deselezionare una sede archivia (non elimina) il gruppo; la pagina Atleti
  raggruppa per gruppo operativo; l'etichetta porta la sede solo quando c'e
  piu di una squadra; un allenamento e assegnato a gruppi, non alla
  categoria nuda; l'appello mostra la squadra dell'allenamento, non l'intera
  categoria; un allenamento senza gruppi dichiarati ricade sulla categoria;
  il programma settimanale dichiara quale squadra, non solo quale fascia
  d'eta; un allenatore puo seguire piu squadre senza duplicare la sua
  scheda; gli allenatori proposti seguono i gruppi scelti; i dati senza sede
  si collocano in blocco piuttosto che carta per carta; cambiare categoria
  non scollega la sede dell'atleta; si puo scegliere una squadra, non solo
  una sede; scegliere una sede restringe le squadre offerte; il filtro
  gruppo restringe anche la query, non solo cio che e a schermo; i gruppi
  impliciti non appaiono mai come squadre selezionabili.
- `tests/ui/struttura-consigliata-cross-site-superfici.test.mjs` —
  `AddTrainingForm`/`AddMatchForm`/`WeeklyTrainingSchedulePanel` usano
  `resolveRecommendedStructures` per ordinare/segnare la struttura
  consigliata; `training/page.tsx` e `matches/page.tsx` richiedono conferma
  cross-site prima di salvare (non per le gare in trasferta); l'avviso
  cross-site in modifica scatta solo se la struttura e davvero cambiata;
  nessuna di queste superfici importa `src/lib/server`.

**Test aggiuntivi rilevanti trovati via ricerca** (non richiesti
esplicitamente ma coprono lo stesso dominio):
- `tests/lib/categoria-cambia-sede.test.mjs` — meccanica cambio-sede:
  il gruppo della vecchia sede si archivia (non resta attivo) su A→B; A+B→B
  archivia solo quello rimosso; B→nessuna-sede non lascia gruppi attivi;
  una sede disattivata non puo ospitare un gruppo aperto; un atleta sulla
  vecchia sede esce da ogni gruppo attivo della sua categoria; la sede si
  riconosce per id, non per nome.
- `tests/lib/cambio-sede-impatto.test.mjs` —
  `rilevaDisallineamentiDiSede`/`contaAtletiDisallineati`: A→B segnala gli
  atleti di B rimossa; A+B→B segnala solo quelli sulla sede rimossa; due
  sedi rimosse producono due voci ordinate per nome; un atleta contato una
  sola volta anche su piu sedi; restare su una sede ancora servita non e
  segnalato; un'appartenenza senza sede non e segnalata; un'appartenenza su
  un'altra categoria non conta; rimuovere tutte le sedi segnala tutti quelli
  che ne avevano una; una modifica senza effetto non segnala niente; il
  rilevamento non muta mai i dati atleta.
- `tests/lib/categoria-fantasma-atleta-derivata.test.mjs` — un riferimento
  categoria fantasma/legacy resta nel catalogo marcato `configured:false`;
  non diventa mai un terzo gruppo "Pulcini"/"Scoiattoli" selezionabile;
  il totale gruppi attivi resta 4 (non gonfiato); le etichette finali sono
  esattamente le 4 attese, nessun duplicato; un atleta con una riga a id
  corretto accanto si auto-risana.
- `tests/lib/categoria-omonima-programma-allenamenti.test.mjs` — due id di
  categoria omonimi restano due gruppi attivi (uno per sede) per entrambi
  "Pulcini" e "Scoiattoli"; un gruppo inattivo non e offerto come opzione e
  non genera un terzo; nessuna fusione per nome (gli id restano canonici);
  rinominare una sede cambia l'etichetta del gruppo, non l'identita della
  categoria; la disambiguazione e per nome scritto, non per `categoryId`
  (riproduzione di una regressione).
- `tests/lib/categoria-omonima-sede-visibile.test.mjs` —
  `buildCategoryDisplayIndex`/`describeCategoryForDisplay` (il motore di
  `CategoryLabel`): due omonime si leggono con la sede accanto; la sede
  resta un campo separato, non concatenato nella stringa; una categoria con
  nome univoco non porta sede; un club mono-sede senza omonime non mostra
  mai una parentesi; due omonime nella *stessa* sede NON si disambiguano per
  sede; una categoria su due sedi non ne rivendica una sola; un gruppo
  archiviato non presta la sua sede; un riferimento di catalogo sconosciuto
  si mostra com'e; funziona senza catalogo/gruppi; il rendering vive in un
  componente solo con la sede come informazione secondaria; il modulo di
  dominio non decide l'identita, solo l'etichetta.
- `tests/lib/categoria-primaria-non-e-secondaria.test.mjs` — invarianti
  primaria-vs-secondaria (la colonna legacy non crea una categoria duplicata;
  controspecchio; due categorie diverse restano due; niente e primaria e
  secondaria insieme; due "Under 15" su due sedi restano due categorie;
  cambiare/promuovere la primaria non duplica righe; rimuovere l'ultima
  categoria non ne lascia nessuna).
- `tests/lib/category-birth-years.test.mjs` — categorie a un solo anno di
  nascita; etichetta "Nati nel {Y}"; l'intervallo piu stretto vince in caso
  di pareggio; anni invertiti restano validi; senza anni → nessun
  intervallo.
- `tests/lib/category-compatibility.test.mjs` — compatibilita letta da
  tutte le forme di archiviazione; l'eleggibilita e direzionale
  (dichiarante → dichiarata, non il contrario); non e transitiva (U13 non
  raggiunge U15 via U14); non conta come appartenenza a meno che richiesta
  esplicitamente; primaria/appartenenza/eleggibilita restano insiemi
  disgiunti; funziona con categorie personalizzate e riferimenti per nome;
  una categoria non puo essere compatibile con se stessa; sopravvive alla
  normalizzazione delle opzioni categoria.
- `tests/lib/revisione-ostile-categorie.test.mjs` /
  `revisione-ostile-scrittura-categorie.test.mjs` — suite di revisione
  ostile/adversariale (C1-C3): la primaria dichiarata vince anche se non e
  la prima riga; indipendenza dall'ordine di lettura; la categoria a colonna
  di un club a meta migrazione non si perde; una colonna ambigua non entra
  mai come primaria; scritture: un nome ambiguo non crea mai una terza
  categoria fantasma; un id vero promuove la riga esistente; promuovere una
  secondaria ne mantiene la sede; una categoria genuinamente nuova crea
  ancora; cambi non ambigui basati su nome funzionano ancora; la vecchia
  primaria retrocede a secondaria senza duplicazione.
- `tests/ui/category-editor-dialog-preserva-il-form-su-errore.test.mjs` —
  comportamento di reset-al-cambio-target del dialog (non a ogni re-render
  del genitore); reset solo aprendo un target diverso; la chiave del target
  si azzera alla chiusura cosi riaprire lo stesso target resetta ancora; un
  salvataggio fallito (`result === false`) non chiude ne resetta il form;
  conferma che il vecchio `AddCategoryForm.tsx` duplicato (stesso bug,
  nessun importatore) e stato rimosso.
- `tests/ui/training-categoria-groupOptions.test.mjs` — il selettore gruppo
  condiviso conta le omonime per nome, non per `categoryId`; i file
  enumerati usano il selettore condiviso; anche il programma settimanale
  conta le omonime per nome; il dialog di modifica del programma settimanale
  scegli un gruppo, non una categoria grezza.

### 4.14 Component inventory

| File | Ruolo | Condiviso/dominio (da mantenere) vs. solo-pagina (candidato rimozione) |
|---|---|---|
| `src/app/categories/page.tsx` | La pagina: caricamento dati, costruzione view-model, ricerca/filtro/ordinamento, orchestrazione CRUD | solo pagina |
| `src/components/categories/CategoryDetailsDialog.tsx` | Modal "Info" di sola lettura | usato solo da questa pagina — verificare altre pagine prima di considerarlo rimovibile |
| `src/components/categories/category-label.tsx` (`CategoryLabel`) | Renderizza un nome categoria con la sede disambiguante tra parentesi quando serve | primitiva di dominio condivisa (ADR-0155/D-INT-3) — **non importata attualmente da `categories/page.tsx`** (la pagina costruisce la propria visualizzazione inline del nome), ma e il componente canonico che altre pagine dovrebbero usare; discrepanza da segnalare |
| `src/components/forms/CategoryEditorDialog.tsx` | Modal crea/modifica categoria, tutti i campi incl. sedi, compatibilita, allenatori | condiviso (importato qui; verificare altri chiamanti) |
| `src/components/sites/club-sites-section.tsx` (`ClubSitesSection`) | CRUD elenco+dialog Sede (vive nella pagina Strutture) | UI di dominio condivisa, non su `/categories` stessa |
| `src/components/sites/site-filter.tsx` | `SiteFilter`, `CategoryGroupFilter`, `SiteSelect` — tre componenti selettore collegati | `SiteFilter` usato qui; `CategoryGroupFilter`/`SiteSelect` non usati da questa pagina ma condivisi altrove |
| `src/lib/category-utils.ts` | `NormalizedCategoryOption`, `buildClubCategoryOptions`, `readCategorySortOrder`, `normalizeCategoryBirthYears`, `formatCategoryBirthYears`, `resolveCategoryId`, `resolveCategoryLabel`, `findCategoryForBirthDate`, `athleteMatchesCategory`/`athleteMatchesAnyCategory` (delegano a identity.ts) | modulo di dominio centrale, da mantenere |
| `src/lib/category-compatibility.ts` | `readCategoryCompatibilityList`, `buildCategoryCompatibilityIndex`, `getAthleteCategoryEligibility`, helper tipo eleggibilita | modulo di dominio centrale (ADR-0030), da mantenere |
| `src/lib/category-athlete-stats.ts` | Statistiche presenze/convocazioni per categoria (convocazioni, presenze, tasso non-risposta) | **non importato da `categories/page.tsx`** — usato altrove (dashboard allenatore/report); irrilevante per la parita di questa pagina ma non rimuovere |
| `src/lib/categories/identity.ts` | `sameCategory`, `sameAnyCategory`, `categoryIdentity`, `resolveCategoryReference`, `collectCategoryTokens`, `normalizeCategoryToken` | l'unica primitiva canonica di identita/matching (ADR-0155), da mantenere |
| `src/lib/categories/display.ts` | `buildCategoryDisplayIndex`, `describeCategoryForDisplay`, tipi `CategoryDisplay`/`CategoryDisplayIndex` | l'unica primitiva canonica di etichetta/disambiguazione (D-INT-3), da mantenere — nota: questa pagina non ci passa attualmente la propria visualizzazione inline del nome |
| `src/lib/club-sites.ts` | Dominio completo sedi/strutture/gruppi operativi: `ClubSite`, `CategoryGroup`, `normalizeClubSites`, `buildCategoryGroups`, `buildCategoryGroupsForSites`, `isMultiSiteClub`, `getActiveClubSites`, `CATEGORY_GROUP_SEPARATOR`, `isCrossSiteEvent`, `resolveRecommendedStructures`, `rilevaDisallineamentiDiSede`, `contaAtletiDisallineati`, `getAthleteSiteIds`, `athleteMatchesSite`, `groupAthletesByCategoryGroup`, `compareCategoryGroups`, ecc. | modulo di dominio condiviso centrale (ADR-0038), da mantenere — usato pesantemente da questa pagina e molte altre |
| `src/lib/simplified-db.ts` — `updateClubAthlete`, `updateClubData` | Solo queste due funzioni di questo grande file "in riduzione" sono usate da questa pagina (per CLAUDE.md, non aggiungere logica nuova qui) | condiviso, in riduzione — non estendere |
| `src/lib/api/client.ts` (`apiRequest`) | Wrapper HTTP per le due chiamate API dirette di questa pagina (PATCH riallineamento appartenenza, PATCH riordino categoria) | trasporto condiviso, da mantenere |
| `src/lib/api/registry.ts` | Dichiara le rotte CRUD generiche per `categories`, `category_groups`, `athlete_category_memberships` (e decine di altre risorse) via l'elenco `resourceNames` → `/api/v1/{resource}` (GET elenco/POST crea) e `/api/v1/{resource}/:id` (GET/PATCH/DELETE) | registro condiviso, mantenere sincronizzato |
| `src/lib/athlete-category-memberships.ts` | `normalizeAthleteCategoryMemberships`, `getPrimaryAthleteCategoryMembership`, `getAthleteCategoryReferences` (importati sia da `category-utils.ts` che dalla pagina) | dominio condiviso, da mantenere |
| `src/lib/trainer-utils.ts` | `getTrainerCategoryIds`, `getTrainerDisplayName`, `trainerHasCategory` usati per la statistica conteggio allenatori e il precompilamento allenatori assegnati nell'editor | condiviso, da mantenere |
| `src/lib/club-seasons.ts` | `normalizeClubSeasons` usato per risolvere `activeSeasonId` per il conteggio slot del programma settimanale | condiviso, da mantenere |
| `src/lib/sorting.ts` | `sortByName` usato per l'ordinamento dell'elenco allenatori nel dialog editor | utility generica condivisa |
| `src/lib/athlete-name-utils.ts` | `compareAthletesByLastName`, `getAthleteDisplayName` | condiviso, usato per il dialog atleti (attualmente irraggiungibile) e il flusso di eliminazione |
| `src/lib/supabase.ts` | Adapter diretto sulla tabella usato per letture `categories`/`simplified_athletes`/`clubs` e per l'upsert/delete grezzo di `categories` (per CLAUDE.md §11.6: **non** parla realmente con Supabase, e un adapter su `fetch`) | trasporto condiviso, da mantenere; nota: questa pagina bypassa la rotta REST generica `/api/v1/categories` per creazione/modifica/eliminazione, andando dritta su questo adapter tabella — una discrepanza rispetto alle chiamate di riordino/riallineamento che invece usano `apiRequest` |
| `src/components/dialogs/CategoryAthletesDialog.tsx` | Dialog elenco atleti-nella-categoria, cablato nel JSX di questa pagina ma **mai attivato da alcun bottone visibile** (codice morto/irraggiungibile, cfr. CLAUDE.md §11.8 "codice irraggiungibile") | segnalare per il redesign: cablarlo o rimuoverlo |

---

## Riepilogo — le 10 capacita piu facili da perdere in un redesign

1. **Due dashboard convivono** (`/dashboard/page.tsx` vs
   `/dashboard/[dashboardId]/page.tsx`), e la seconda e ancora raggiunta dal
   completamento login/invito (`token-verification`) tramite la tabella
   legacy `dashboards` — non e semplicemente "codice morto"; un redesign
   deve decidere esplicitamente cosa farne.
2. Le soglie "in scadenza" **non sono coerenti fra superfici**: la dashboard
   usa 30 giorni fissi, `/medical` usa "un mese di calendario" — possono
   divergere di un giorno sullo stesso certificato.
3. **Codice irraggiungibile in tre punti distinti**, tutti da verificare
   prima di "tradurlo per parita": in `/categories`, il dropdown Filtri
   (`{false ? ... : null}`) e `CategoryAthletesDialog` (mai attivato da
   alcun bottone); in `/dashboard`, `SetupGuide`/`AccessCodeGenerator`/
   `NewDashboard` sono orfani senza importatori.
4. Il promemoria certificati ha **due porte con regole diverse**: quella
   manuale (da `/dashboard` o `/medical`) ignora i promemoria gia letti,
   quella automatica via cron manda comunque anche se gia letto.
5. **Categoria vs. gruppo operativo per sede** (ADR-0038/ADR-0055/ADR-0155)
   e il meccanismo piu pervasivo e piu facile da romperlo per disattenzione:
   configurazione (intervallo anni, compatibilita) segue la categoria,
   tutto l'operativo (rosa, presenze, convocazioni, programma settimanale)
   segue il gruppo (categoria+sede); rimuovere una sede da una categoria
   **archivia** il gruppo, non sposta gli atleti (serve riallineamento
   esplicito, mai automatico); e l'identita non si deduce mai dal nome.
   `/categories/page.tsx` stessa **non usa** il componente canonico
   `CategoryLabel`/`describeCategoryForDisplay` per disambiguare — costruisce
   una visualizzazione inline propria.
6. In `/training`, **`EditTrainingForm` congela silenziosamente** giorno,
   ora, luogo, categorie/gruppi e capienza una volta che l'allenamento ha
   gia storia (presenze/convocazioni/RSVP) — solo titolo/note/allenatori
   restano modificabili; il banner e solo consultivo, il vincolo vero e
   server-side.
7. **Eliminare un allenamento riesce solo se non ha righe di
   partecipazione**; altrimenti va annullato (soft, reversibile via
   Ripristina). Annulla/Ripristina usano ancora `window.confirm` nativo,
   mentre Elimina e le conferme sovrapposizione/cross-site usano
   l'`AlertDialog` in-app — incoerenza deliberata, non un refuso.
8. **Eliminare una categoria non ripulisce ne allenatori ne
   `category_groups` ne slot del programma settimanale** che la
   referenziano — solo gli atleti collegati vengono scollegati
   (spostati in "Senza categoria"), e l'intera operazione abortisce se
   anche un solo aggiornamento atleta fallisce.
9. Lo stato vuoto di `/categories` **non distingue** "nessuna categoria
   esiste" da "il filtro/la ricerca non trova nulla" — stessa UI "Crea Prima
   Categoria" in entrambi i casi.
10. Nessuna delle quattro pagine applica un controllo di permesso puntuale
    lato client oltre al gate di percorso (`AccessAreaGuard`): la sicurezza
    fine (`clinical.manage`, `training_automation.manage`, il perimetro
    sede/categoria) e interamente delegata alle singole chiamate API/server
    — un redesign che sposti logica lato client deve preservare quel confine
    server-side, non rifarlo nel browser.
