# 10 — Convenzioni UI/UX

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
