# 10 — Convenzioni UI/UX

## Identita visiva (Blocco 3, 2026-08-23)

### Marchio

`src/components/brand/easygame-logo.tsx` — SVG in repo, nessuna richiesta di
rete. `EasyGameLogo` con `tone="dark"` su fondo chiaro e `tone="light"` su
fondo scuro; `EasyGameWordmark` dove EasyGame parla in prima persona
(accesso, console di piattaforma, account).

**Non reintrodurre** `r2.fivemanage.com`, `/logo.png`, `/logo-blu.png` o
`logo-bianco.png`: erano un PNG remoto sgranato e tre riferimenti a file
inesistenti. Un test di conformita lo impedisce.

### Tipografia

| Ruolo | Font | Dove |
|-------|------|------|
| Testo e dati | `Inter` (`font-sans`) | tutto il prodotto |
| Titoli e etichette | `Archivo` (`font-display`) | intestazioni, nomi club, targhe |

Self-hosted con `next/font`: nessuna richiesta a Google a runtime.
Le colonne di numeri — date, importi, numeri di maglia, stagioni — usano
`.eg-tabular`, altrimenti le cifre ballano da una riga all'altra.

### Token

In `globals.css`: `--eg-navy` (chrome e piattaforma), `--eg-blue` (azione
primaria), `--eg-paper` (fondo pagina), `--eg-line`, e `--eg-season`, che e
l'**unico ambra della chrome** ed e riservato alla stagione.

### La stagione e una targa, non un badge

Da WP-32 la stagione e il perimetro dei dati visibili. `SeasonPlate` e
`ClubIdentity` (`src/components/brand/club-identity.tsx`) la mostrano con un
colore proprio e cifre tabellari, in topbar desktop e mobile. Chi apre una
pagina deve sempre poter rispondere a «quale club, quale stagione».

### La scheda Stagioni (Blocco 6)

`src/components/organization/season-manager.tsx`, montata da
`/organization?tab=stagioni`. Regole che valgono anche per chi la modifichera:

- **niente logica in `page.tsx`.** La pagina Organizzazione ha nove schede: la
  gestione delle stagioni sta nel suo componente e parla solo con
  `@/lib/api/seasons`;
- **una procedura guidata, non un modulo.** Periodo → cosa riportare →
  riepilogo. Il riepilogo mostra i numeri veri, calcolati dal server in
  `preview`: annunciare una stima e peggio che non annunciare nulla;
- **si dice anche cosa non viene copiato.** Due riquadri fissi elencano i dati
  globali del club (restano disponibili, non si duplicano) e i dati operativi
  (non si riportano mai). Un'assenza non spiegata sembra un difetto;
- **conferma solo per cio che conta.** Cambio di stagione attiva e
  archiviazione passano da `ConfirmDialog`; spuntare cosa riportare no. Il
  cambio di stagione **non e autosalvabile**: cambia il perimetro dei dati;
- **stato visibile con un'etichetta, non con un colore soltanto.** Futura,
  Attiva, Archiviata sono scritte per esteso sul `Badge`;
- **375 / 768 / 1280.** Le righe della stagione impilano sotto `lg` e i
  comandi vanno a piena larghezza sotto `sm`; l'elenco di cosa riportare passa
  da una a due colonne a `md`. Nessuna larghezza fissa in pixel.

Verificato da `tests/ui/seasons-tab.test.mjs`.

### Chrome separate

| Contesto | Shell |
|----------|-------|
| Club | `dashboard/Sidebar` + `dashboard/Header` |
| Piattaforma | `platform-admin/platform-admin-shell` |

La console `platform_admin` **non** monta la chrome del club: un
amministratore di piattaforma non ha un club attivo e non deve vedere
«Atleti» o la stagione di una societa a cui non appartiene.

### Regole responsive

Breakpoint di riferimento: **375, 768, 1280 px**.

- nessuna pagina produce scroll orizzontale del documento: un contenuto piu
  largo scorre dentro il proprio contenitore (`.eg-scroll-x` o
  `overflow-x-auto`), mai il `body`;
- i modali hanno `max-h-[calc(100dvh-2rem)]` e `overflow-y-auto`. Senza,
  i pulsanti in fondo diventano irraggiungibili su telefono;
- **le classi `slide-in-from-*` dei modali non sono decorative**: `animate-in`
  riscrive `transform`, quindi sono loro a fornire il -50% che centra il
  riquadro. Toglierle lo sposta fuori schermo;
- il contenitore di pagina usa `h-[100dvh]`, non `h-screen`: `100vh` su
  telefono e piu alto dell'area visibile quando la barra del browser e
  presente, e il fondo pagina finisce sotto lo schermo;
- **mai annidare `min-h-screen` dentro `min-h-screen`**: la colonna centrale
  non ha piu un'altezza da cui `flex-1 min-h-0 overflow-y-auto` possa
  ricavare uno scorrimento interno, e a scorrere finisce l'intero documento
  mentre la sidebar resta tagliata. Lo schema corretto e: contenitore
  `h-[100dvh] overflow-hidden` → colonna `min-h-0 flex-1 flex-col` →
  `<main className={dashboardMainClassName}>`;
- nelle schermate di accesso (`.eg-auth`) i comandi hanno almeno 44 px di
  altezza sotto il breakpoint `sm`. Nelle tabelle di gestione la densita
  resta voluta.

### Attese e salvataggi

| Situazione | Componente |
|-----------|------------|
| Pagina o sezione in caricamento | `AppLoadingScreen` |
| Elenco in arrivo | `ListSkeleton` |
| Griglia di schede in arrivo | `CardsSkeleton` |
| Operazione bloccante | `AppBlockingOverlay` |
| Salvataggio automatico | `SaveStatus` (`idle` / `saving` / `saved` / `error`) |

Tutti dichiarano `role="status"` e `aria-live="polite"`.

### Quando una schermata puo salvarsi da sola (Blocco 4)

Il pulsante «Salva» non e gratis: chi lo dimentica perde il lavoro, e in una
pagina a schede uno solo in fondo a nove schede e una trappola. Ma l'autosave
non e sempre lecito. La regola:

| Puo essere in autosave | Deve restare a conferma esplicita |
|------------------------|-----------------------------------|
| Dati descrittivi: nome, sport, recapiti, link pubblici | Dati economici: quote, listini, IBAN, abbonamento |
| Contenuti che si riscrivono senza conseguenze (programma settimanale) | Dati fiscali che finiscono in fattura |
| | Operazioni **distruttive**: rimozione di elementi da un elenco |
| | Scelte che cambiano il perimetro dei dati: la stagione attiva (WP-32) |

Chi implementa un autosave deve fornire tutte e tre le cose insieme:

1. **debounce** (1 s nella scheda Club, 1,5 s nel programma settimanale);
2. **accorpamento** con `createCoalescingSaver` — due PATCH sovrapposte
   arrivano in ordine non garantito e l'ultima modifica puo perdersi;
3. **stato visibile** con `SaveStatus`, mai una scritta fissa "salvato".

L'elenco vero delle sezioni della scheda Club, con la motivazione di ciascuna,
sta in `src/lib/club-profile.ts` ed e verificato da
`tests/lib/club-profile-autosave.test.mjs`: la classificazione e codice, non
una convenzione da ricordare.

### Anagrafica assistita

`AssistedAddressFields` e `AssistedFiscalCodeField`
(`src/components/forms/assisted-anagrafica.tsx`) sono i campi da usare per
CAP, comune, provincia e codice fiscale. Regola unica: **suggerire, non
decidere**. L'assistenza compila solo cio che e vuoto e segnala cio che non
torna; non riscrive mai un valore digitato, e il pulsante «Calcola» del codice
fiscale non compare nemmeno quando il campo e gia valorizzato.

---
## Chrome: club e piattaforma sono due cose diverse (regola definitiva)

Esistono **due** chrome, e non vanno confuse. Un requisito scritto per l'una
non si applica mai all'altra: e cosi che nel Blocco 3 la topbar del club ha
perso comandi che servivano.

| | Topbar **Club** (`components/dashboard/Header.tsx`, `components/layout/MobileTopBar.tsx`) | Console **Piattaforma** (`components/platform-admin/platform-admin-shell.tsx`) |
|---|---|---|
| Marchio EasyGame | **no** dal Blocco 7: sta nella sidebar, sempre visibile a fianco | si |
| Identita club + stagione | si (`ClubIdentity`) | **no**: non amministra un club |
| Azioni rapide | si, filtrate da `canAccessPath` | **no** |
| Assistenza | si | **no** |
| Notifiche, account | si | account |
| Chat | **no** (nessun backend) | **no** |
| Voci di navigazione di club (`/athletes`, `/training`, …) | si | **no** |

`tests/ui/topbar-club-vs-platform.test.mjs` verifica ogni riga di questa
tabella. Se un WP futuro deve togliere un comando, deve dire **da quale delle
due**.

### Gerarchia della riga identita

Fissata dopo il Blocco 5, vale per `ClubIdentity` su desktop e su telefono:

1. **logo del club** — l'elemento piu grande (48 px desktop, 40 px compatto) e
   **senza cornice**: un bordo attorno a un marchio gia squadrato lo fa
   sembrare la miniatura di un elenco. Solo il ripiego con le iniziali ha una
   piastra neutra, per non lasciare due lettere a mezz'aria;
2. **nome del club** — il testo piu grande della barra (`text-xl`, `text-base`
   in compatto), in `font-display`;
3. **stagione** — targhetta discreta, senza bordo, su una riga sola, **accanto**
   al nome. Va a capo quando lo spazio manca: non deve mai spingere fuori posto
   logo, nome o comandi. Dal Blocco 7 e **grigia**: vedi sotto.

### Il marchio EasyGame sta in un posto solo (Blocco 7)

Su desktop la sidebar e la topbar del club sono adiacenti e sempre entrambe
visibili. Il marchio compariva in tutte e due, a una trentina di pixel di
distanza: la seconda copia non aggiungeva informazione e sottraeva larghezza
al **logo del club**, che e l'unica identita che cambia da una schermata
all'altra.

Dal Blocco 7 il marchio vive nella sidebar (`components/dashboard/Sidebar.tsx`)
ed **e** il collegamento a `/account` — che era la sola funzione del logo
tolto dalla topbar. Nel menu utente resta la seconda via («Esci»). Sul menu di
navigazione di telefono il marchio resta, perche li la sidebar non c'e.

### La stagione e grigia (Blocco 7)

`--eg-season` e `--eg-season-soft` sono uno **slate**, non piu un ambra.

L'ambra e un colore semantico: nelle tabelle vuol dire «guarda qui» — quota in
attesa, certificato in scadenza. Sulla targhetta della stagione era acceso
sempre, su un valore quasi sempre corretto. Un avviso permanente non e piu un
avviso: consumava il significato dell'ambra in tutte le altre superfici senza
dire nulla in questa. La stagione resta leggibile perche ha un occhiello e le
cifre tabellari.

L'ambra resta dove segnala davvero qualcosa di specifico: la corona del
proprietario nella home account la scrive ora per esteso (`text-amber-700`),
perche quel colore diceva «sei tu il proprietario», non «stagione».

### Un solo stile per i comandi della topbar

Due varianti e basta, entrambe in `Header.tsx`:

- `topBarButtonClassName` — comando a sola icona, tondo;
- `topBarActionClassName` — stesso bordo, stesso fondo, stesso colore, con
  etichetta a partire da `xl`.

**Niente gradienti, niente pulsanti animati, niente varianti per contesto.** Le
azioni rapide erano un pulsante in gradiente animato: si mangiava l'attenzione
di tutta la barra e nessun altro comando aveva piu il suo peso.

## Tipografia: le regole definitive

**Due font, dichiarati una volta sola.** `Inter` (`--font-sans`) per testo e
dati, `Archivo` (`--font-display`) per i titoli, self-hosted con `next/font` in
`src/app/layout.tsx`. **Non se ne aggiungono altri e non si dichiarano
altrove**: un test lo impedisce.

| Serve | Si usa |
|---|---|
| Testo, etichette, dati | `font-sans` (predefinito su `body`) |
| Titoli, nomi propri, marchio | `font-display` |
| Colonne di date, importi, numeri, stagioni | `.eg-tabular` |
| Etichetta di sezione | `.eg-eyebrow` |
| Etichetta dentro una riga gia densa (stagione, «Aperto», «Piattaforma») | `.eg-eyebrow-sm` |

**Le taglie di occhiello sono due**, definite in `globals.css`. Prima erano
tre, scritte a mano con valori arbitrari diversi (`0.5625rem` qui, `0.625rem`
la): la stessa cosa in tre misure.

**Le taglie di testo vengono dalla scala Tailwind.** Nessun `text-[13px]`,
nessun `text-[0.9rem]`. Due eccezioni dichiarate, entrambe verificate dai test:

- i **documenti generati** per stampa, PDF ed email hanno il loro font di
  sistema: `next/font` non arriva dentro un PDF ne dentro un client di posta;
- le **primitive shadcn vendorizzate** (`ui/calendar.tsx`, `ui/form.tsx`)
  restano come sono: allinearle vuol dire perderne l'aggiornabilita.

Il resto dell'applicazione porta ancora una quindicina di taglie scritte a mano
in griglie dense: e debito noto (D26 in [16](16-technical-debt.md)) e si
normalizza toccando quelle pagine per altro motivo, **non** con un rifacimento
di massa.

## Vincolo per i WP successivi

Queste regole non si rinegoziano pagina per pagina:

1. **non si introducono font**, ne via `next/font` ne via CSS;
2. **non si ridisegna** cio che e gia allineato: si toglie solo la variazione
   arbitraria, cioe quella che fa la stessa cosa in un modo diverso senza un
   motivo scritto;
3. **una modifica alla chrome dichiara a quale delle due si applica** (club o
   piattaforma) e aggiorna `tests/ui/topbar-club-vs-platform.test.mjs`;
4. **una pagina nuova usa i componenti e i token esistenti.** Se serve davvero
   una variante nuova, va aggiunta qui prima di essere usata.

## Design system

- **Tailwind CSS 3** + **shadcn/ui** su Radix. Config in
  [`components.json`](../../components.json): style `default`, base color
  `neutral`, CSS variables **attive**, alias `@/components` e `@/lib/utils`.
- I colori si usano tramite i token semantici Tailwind
  (`bg-background`, `text-foreground`, `border-border`, `bg-primary`,
  `text-muted-foreground`, `bg-destructive`, ...), definiti come variabili HSL
  in `src/app/globals.css`.
- **Non introdurre colori hard-coded** dove esiste un token.
- `cn()` (`src/lib/utils.ts`, `clsx` + `tailwind-merge`) e l'unico modo corretto
  di comporre classi condizionali.

## Tema

`ThemeProvider` e configurato con `forcedTheme="light"`, `enableSystem={false}`
e `<html className="light">`. **L'app e mono-tema chiaro.**

Le variabili `.dark` esistono in `globals.css` e alcune classi `dark:` sono
sparse nei componenti, ma il dark mode **non e attivo**. Non aggiungere nuove
varianti `dark:` finche non esiste un WP che abilita il tema scuro.

## Lingua

Interfaccia, label, messaggi di errore e commenti di dominio sono **in
italiano**. Mantieni l'italiano per tutto cio che l'utente legge.
Identificatori di codice restano in inglese (`athlete`, `club`, `payment`).

## Layout delle pagine di management

```tsx
// desktop: Sidebar + Header;  mobile: MobileTopBar
<div className="flex h-screen bg-gray-50">
  <Sidebar />
  <div className="flex flex-1 flex-col overflow-hidden">
    <Header title="..." />
    <main className={dashboardMainClassName}>
      <DashboardPageContainer>{/* contenuto */}</DashboardPageContainer>
    </main>
  </div>
</div>
```

- `dashboardMainClassName` e `DashboardPageContainer` vivono in
  `src/components/dashboard/dashboard-page-container.tsx`. Usali invece di
  reinventare spaziature.
- Le pagine sotto `/dashboard` ereditano gia questa chrome dal layout: non
  duplicarla. Le altre pagine management la montano ancora a mano (~40 file):
  e il pattern esistente, non peggiorarlo ma non estenderlo.

## Componenti: dove mettere cosa

| Cartella | Contenuto |
|----------|-----------|
| `src/components/ui/` | Primitive riusabili e senza dominio (bottoni, dialog, tabelle, toast). Se e generato da shadcn, sta qui. |
| `src/components/<dominio>/` | Componenti legati a un dominio: `athletes/`, `matches/`, `payments/`, `trainer/`, `parent-dashboard/`, `structures/`, `forms/`, ... |
| `src/components/dashboard/` | Chrome e widget dell'area management |
| `src/components/providers/` | Solo context provider globali |
| `src/app/**/page.tsx` | Composizione della pagina. Nuova logica di dominio **non** va qui |

## Notifiche a schermo

Esistono **due** sistemi di toast montati insieme:

- `src/components/ui/toast-notification.tsx` — `ToastProvider` + `useToast`
  custom (il piu usato);
- `src/components/ui/toaster.tsx` + `use-toast.ts` — variante shadcn.

Entrambi sono attivi in `AppClientProviders`. **Per il codice nuovo usa
`useToast` da `@/components/ui/toast-notification`**, coerente con la maggior
parte delle pagine. La convergenza a uno solo e [WP-14](20-work-packages.md).

## Stati di caricamento ed errore

- `GlobalLoadingProvider` per gli overlay globali.
- `AccessAreaGuard` mostra uno spinner a tutta pagina finche la sessione non e
  risolta.
- Per il caricamento locale il pattern e uno `useState` booleano piu uno
  spinner Lucide (`Loader2` con `animate-spin`). Non c'e libreria di skeleton
  in uso (`skeleton.tsx` esiste ma non e referenziato).

**Tre stati, non due.** Dal Blocco 4 la home account distingue esplicitamente
_caricamento_, _vuoto_ ed _errore_, e la distinzione va mantenuta ovunque si
carichi un elenco: raccontare un errore di rete come "non hai nessun club" e
il modo piu veloce per far pensare a un utente che i suoi dati sono spariti.

- caricamento: uno **scheletro con la forma del contenuto**, non uno spinner a
  tutta pagina;
- vuoto: cosa manca, perche, e l'azione che lo risolve;
- errore: il messaggio del server, un `role="alert"` e un pulsante «Riprova».
  Se dei dati erano gia a schermo restano visibili, con un avviso sopra: un
  aggiornamento fallito non deve svuotare la pagina.

## Icone e immagini

- Icone: **`lucide-react`**. `@radix-ui/react-icons` e presente ma marginale.
- Immagini remote consentite solo dagli host in `next.config.js`
  (`r2.fivemanage.com`, `images.unsplash.com`, `api.dicebear.com`).
- Il progetto usa prevalentemente `<img>` invece di `next/image`: e la causa
  della maggior parte dei warning ESLint. Per il codice nuovo preferisci
  `next/image` quando l'immagine e statica e di dimensione nota.

## Ordinamento degli elenchi (Blocco 5, 2026-08-23)

Un solo comparatore per tutta la Web App: `src/lib/sorting.ts`.
**Non riscrivere `localeCompare` in una pagina.**

| Cosa | Helper | Modulo |
|---|---|---|
| Persone (atleti, allenatori, staff, soci, utenti) | `sortPeopleByLastName`, `comparePeopleByLastName` | `@/lib/athlete-name-utils` |
| Entita con un nome (categorie, gruppi, club, sponsor, strutture, articoli) | `sortByName`, `compareNameValues` | `@/lib/sorting` |
| Piu chiavi in cascata | `sortByNameKeys`, `compareNameValueLists` | `@/lib/sorting` |

Il confronto e italiano, case-insensitive (`sensitivity: "base"`), numerico
(«Under 9» precede «Under 10»), con i valori vuoti in fondo e **stabile**: due
nomi che differiscono solo per maiuscole o accenti restano nell'ordine di
partenza, cosi le chiavi successive (il nome dopo il cognome) possono decidere.

**Criterio unico per le persone: `Cognome` poi `Nome`.** Quando un record ha un
solo campo `name` (succede per allenatori e staff) si ricade sull'etichetta
completa: non si indovina dove finisca il cognome dentro un campo unico.

### Dove l'ordinamento alfabetico NON va applicato

Elenchi in cui l'ordine ha un significato funzionale. Applicarvi l'alfabetico e
una regressione:

- date, scadenze, cronologie, storici (`compareTrainingsByStart`,
  `createdAt` decrescente);
- rate e piani di pagamento: contano numero e scadenza;
- classifiche e priorita (avvisi certificati, alert);
- sequenze configurate a mano (voci di navigazione, opzioni di permesso,
  componenti di un kit, orario settimanale);
- il club principale in cima all'elenco club: e una priorita, non un ordine
  nominale — gli altri club seguono in alfabetico.

## Elenchi lunghi: chiusi di default (Blocco 5, 2026-08-23)

Quando una pagina mostra **N schede ognuna con la propria tabella** — oggi i
gruppi numerazione in `/clothing` — le schede partono **chiuse** e si aprono a
tendina (`Collapsible`). L'intestazione mostra i numeri che servono a decidere
se aprire (quanti atleti, quanti senza numero, quanti duplicati).

Dentro la scheda aperta: un campo di ricerca e un limite di righe con «Mostra
altri». Con centinaia di atleti la tabella completa costava piu del resto della
pagina, e nessuno la leggeva tutta.

## Form

Non c'e uno standard unico:

- la maggior parte dei form usa `useState` controllati;
- `react-hook-form` e installato ma usato **solo** da
  `src/components/ui/form.tsx`, che oggi non e referenziato.

Per il codice nuovo segui il pattern prevalente (state controllato) salvo WP che
introduca `react-hook-form` in modo sistematico.

## Responsive

Breakpoint Tailwind standard. Il pattern ricorrente e duplicare il markup:
`hidden lg:flex` per desktop e `lg:hidden` per mobile, con `MobileTopBar` al
posto di `Sidebar`+`Header`.

Nelle schermate nuove (account, onboarding, import) il markup **non** viene
duplicato: una sola struttura che si riorganizza con `grid`/`flex` e i
breakpoint. E meno codice e non puo divergere fra le due copie. Le tre misure
di riferimento restano 375, 768 e 1280 px ([ADR-0025](18-decision-log.md)).

## Accessibilita

Non esiste oggi una linea guida applicata ne test a11y. Le primitive Radix
forniscono la base (focus trap, ruoli ARIA). Non regredire: se usi un elemento
interattivo custom, aggiungi `aria-label` e gestione tastiera.
