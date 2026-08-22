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

---
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

## Icone e immagini

- Icone: **`lucide-react`**. `@radix-ui/react-icons` e presente ma marginale.
- Immagini remote consentite solo dagli host in `next.config.js`
  (`r2.fivemanage.com`, `images.unsplash.com`, `api.dicebear.com`).
- Il progetto usa prevalentemente `<img>` invece di `next/image`: e la causa
  della maggior parte dei warning ESLint. Per il codice nuovo preferisci
  `next/image` quando l'immagine e statica e di dimensione nota.

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

## Accessibilita

Non esiste oggi una linea guida applicata ne test a11y. Le primitive Radix
forniscono la base (focus trap, ruoli ARIA). Non regredire: se usi un elemento
interattivo custom, aggiungi `aria-label` e gestione tastiera.
