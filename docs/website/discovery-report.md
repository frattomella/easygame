# EasyGame Website — Report di discovery tecnico

> Stato: **proposta**, nessun codice scritto. Data: 2026-10-05.
> Fonti analizzate: `E:\Download\easygame` (branch `feat/web-redesign`),
> `E:\cedi-platform-product` (GPW / Dealer Web, ultimo commit 2026-10-04),
> `E:\cedi-platform` (repo precedente).
> Questo documento non e ancora KB: le decisioni accettate diventeranno ADR in
> `docs/knowledge-base/18-decision-log.md`.

---

## 0. Cinque fatti che cambiano il progetto

1. **Esiste una posizione di prodotto contraria.** `docs/knowledge-base/30-golee-easygame-gap-audit.md`
   classifica il sito della societa `NO-COPY` (C-022, riga 201) e N-10 (riga 786) dice
   «Fuori perimetro. Se serve, si integra un CMS, non lo si costruisce». Serve un ADR
   che **superi esplicitamente N-10** prima di qualunque codice.
2. **EasyGame non ha risultati, statistiche, classifiche, competizioni ne avversari
   strutturati.** Una gara (`club_events.kind='match'`) ha data, luogo, avversario come
   testo libero, casa/trasferta e convocazioni. Niente punteggio, periodi, tabellino,
   MVP, arbitri. «Partite COMPLETE» in KB 11 significa calendario e convocazioni.
   RESULTS, MATCH DETAIL (risultato), PLAYER/TEAM STATS e STANDINGS **non hanno una
   sorgente dati**.
3. **Nessuna persona ha un flag di pubblicabilita.** Esiste il consenso `images`
   («Pubblicazione di immagini e video», `src/lib/consents/catalog.ts`) ma in modalita
   `block_negative` non blocca chi non ha mai deciso, e un club senza definizione attiva
   non applica nulla. Altezza, ruolo in campo e biografia dell'atleta **non esistono**.
4. **Il gestionale non ha nessuna gestione dell'host.** `src/middleware.ts` non legge mai
   `host`; il root layout (`src/app/layout.tsx`) avvolge tutto in `AppClientProviders`
   (Auth, Shell, Toast): un sito pubblico renderizzato sotto quel layout spedirebbe al
   visitatore il bundle e le chiamate di sessione del gestionale.
5. **GPW e proprietario Cedi Soft** (`LICENSE`: «All rights reserved… except under an
   explicit written agreement») e gira su **Next 16 / React 19 / Tailwind 4 / backend
   .NET**; EasyGame e Next 14 / React 18 / Tailwind 3 / Prisma. Il riuso e
   «porting per riferimento» di moduli puri, non copia di cartelle.

Ci sono anche buone notizie: EasyGame ha gia **entitlement e add-on** (ADR-0046/0048/0051),
un **dominio sponsor completo con logo**, un **catalogo permessi con ruoli personalizzati**,
**moduli online pubblici** con rate limit (ADR-0189/0191), un **registro consensi**
append-only, **TipTap** e un **sanitizzatore** HTML lato server.

---

## A. Architettura attuale del Website Builder GPW

Repo di riferimento: **`E:\cedi-platform-product`**. Il repo `E:\cedi-platform` **non**
contiene un builder funzionante (git traccia 0 file sotto `apps/dealer-web`; restano solo
`dist/` non tracciati dell'era «Template V1»): va ignorato.

### A.1 Cartelle e file principali

| Area | Percorso | Note |
|---|---|---|
| App unica (dashboard + editor + preview + BFF + siti pubblici) | `apps/dealer-web/src/app/` | route group `(public)/site/**`, `(management)/management/**`, `(editor)/management/editor`, `(preview)/preview/**` (ADR-0028) |
| Middleware host-based | `apps/dealer-web/src/proxy.ts` | classifica host MANAGEMENT/TENANT/UNATTRIBUTABLE, 1 chiamata `routing`, redirect canonical 301, rewrite su `/site{path}` |
| Editor | `apps/dealer-web/src/components/editor/` | `editor-workspace.tsx` (1586 LOC), `editor-model.ts` (415), `editor-history.ts` (111), `structure-panel.tsx`, `inspector.tsx`, `style-controls.ts`, `global-style-panel.tsx`, `add-section-dialog.tsx`, `section-wireframe.tsx`, `media-drawer.tsx`, `publish-drawer.tsx` |
| Protocollo editor ↔ iframe | `apps/dealer-web/src/components/editor-protocol.ts` (214), `editor-probe.tsx` (634) | postMessage tipizzato; il probe vive dentro la preview |
| Form generator dei blocchi | `apps/dealer-web/src/components/site-block-editor.tsx` (2148) | `BLOCK_SHAPE` (descrittori campi), `BLOCK_STARTER`, `newBlock`, `blocksAllowedOn`, `AssetPicker` |
| Contratti TS | `packages/products/dealer-web/contracts/src/index.ts` (3665) | `DealerSiteDraft`, `DealerSitePage`, `DealerSiteBlock` (union di 30 tipi), `DealerSiteBlockStyle` |
| Renderer | `packages/products/dealer-web/ui/src/site-pages.tsx` (4561) | un `switch(block.type)`; 8 sole isole client |
| Stile | `ui/src/dealer-palette.ts`, `site-preferences.ts`, `section-style.ts`, `template-presentation.ts`, `packages/ui/tokens/src/site.css` | 2 colori → palette derivata con correzione WCAG; preferenze come `data-pref-*` |
| SEO | `apps/dealer-web/src/app/robots.ts`, `sitemap.ts`, `ui/src/site-seo.ts`, `ui/src/structured-data.tsx` | per host |
| Immagini | `ui/src/site-image.tsx` | `<picture>` AVIF/WebP/JPEG, niente `next/image` |
| Backend | `backend/Products/DealerWeb/*` (Domain, Application, Infrastructure, Contracts) + `backend/Api/.../Endpoints/DealerWebEndpoints.cs` | .NET, schema PG `dealer_web` |
| Entitlement | `backend/Platform/{ProductAccess,Entitlements,Commerce,Billing}` | ADR-0032/0037 |
| ADR | `docs/knowledge-base/26_Architecture_Freeze/ADR/` ADR-0028, 0030, 0033, 0039, 0040, 0041 | |
| Doc prodotto | `docs/knowledge-base/49_Automotive_Dealer_Web/`, `docs/gest-park-web-*.md` | runbook dominio, hosting, media |

### A.2 Modello contenuto

**SITE (draft) → PAGE → SECTION («block») → FIELD.** Non c'e un quarto livello
(`editor-model.ts:17-21`) e niente posizionamento libero («NOT an Elementor», ADR-0033).

- `site_drafts`: impostazioni globali (template `(key, major)`, preferenze, branding,
  profilo, SEO globale, consensi lead, cookie). Concorrenza su `revision`.
- `site_page_documents`: una riga per pagina, `kind` (HOME, ABOUT, CONTACTS, PRIVACY,
  COOKIE, CUSTOM…), `slug`/`path` unico per sito, SEO per pagina, `status`,
  `visibility`, `show_in_navigation`, `sort_order`, **`blocks_json` jsonb**, `version`.
- Blocchi: props **piatte** sull'oggetto (nessun `props`), `blockId` UUID, `isVisible`,
  `style` a **token chiusi** (variant, alignment, height, background, overlay,
  textTone, spacing, `hideOnMobile`). Niente CSS libero.
- Navigazione: **derivata dalle pagine** (`show_in_navigation`, `sort_order`), niente
  tabella menu e niente dropdown. Footer derivato dal profilo, non editabile.

### A.3 Editor

- Nessuna libreria editor: **React state puro, HTML5 drag & drop nativo**, alternative da
  tastiera (Alt+↑/↓) e annunci per screen reader.
- Operazioni pure (`moveBlock`, `duplicateBlock`, `toggleBlockVisibility`, `removeBlock`,
  `insertBlock`, `replaceBlock`), undo/redo come reducer puro (25 passi, coalescenza 1,2 s).
- **Autosave** debounce 600 ms, PUT per pagina con `expectedVersion`, 409 → stato
  `conflict`; `mergeSavedPage` conserva cio che si digita durante il salvataggio.
- Canvas: **iframe same-origin alla larghezza reale del device** (1280/820/390) scalato con
  `transform: scale()` → le media query si comportano come sul device vero.
- Inspector a schede (Contenuto/Layout/Aspetto/Spazi) generato dai descrittori; controlli
  testo, numero, toggle, asset, icona, destinazione link sicura, scelte segmentate,
  colore; testo inline `contenteditable` sanificato nell'iframe.
- Mancano: rich text (paragrafi da textarea), select, override per breakpoint, zod.

### A.4 Registry

**Non esiste un registry unico**: ogni tipo e definito in 5 record paralleli
(`SITE_BLOCK_LABEL`, `BLOCK_SHAPE`, `BLOCK_STARTER`, `blocksAllowedOn`, `LIVE_TEXT_FIELDS`)
in 3 package, piu il catalogo preset C# (`SiteSectionPresets.cs`, 31 preset) e la
validazione C#. Totalita garantita dai `Record<DealerSiteBlockType, …>`.
30 tipi: 24 CMS generici, 2 da adattare (OPENING_HOURS, LEAD_FORM), 4 automotive.

### A.5 Pubblicazione

- Draft vs published (ADR-0030): publish valida e congela **tutto il sito** in un
  `published_revisions.snapshot_json` con hash sha256, **immutabile** (trigger PG),
  append-only. Rollback = nuova revisione `ROLLBACK`. `restore-to-draft` separato.
- Idempotency key obbligatoria su publish/rollback/schedule; concorrenza ottimistica
  ovunque; pubblicazione programmata con worker `SKIP LOCKED`.
- «Modifiche non pubblicate» calcolato confrontando lo snapshot che si produrrebbe con
  quello corrente (`SitePublicationDrift.cs`).
- Letti **live, non dallo snapshot**: catalogo veicoli, news, redirect, manutenzione,
  entitlement. Questo e il pattern giusto anche per i dati sportivi.
- **Nessuna cache**: tutto `force-dynamic` + `no-store`, il sito pubblico e letto due volte
  per richiesta (metadata + page). Da **non** copiare.

### A.6 Renderer pubblico

Server components; il renderer sta in un package che **non importa mai** l'editor; la
preview riusa lo stesso renderer dentro un iframe con il probe. Font self-hosted,
nessun JS oltre a 8 isole (cookie consent, mappe con consenso, form, lightbox…).

### A.7 Domini

`site_domains`: hostname unico globale, `kind` PLATFORM/CUSTOM, macchina a stati
PENDING_VERIFICATION → VERIFIED → PROVISIONING → ACTIVE (+ BLOCKED, FAILED, SUSPENDED),
`tls_state`, TXT `_cedi-verify.<host>` (token 32 hex) + CNAME al target, DNS-over-HTTPS,
Cloudflare for SaaS per il TLS (adattatore **mai provato su una zona reale**), un primario
per sito, 301 verso il canonical. `www` e apex sono due righe senza logica dedicata.
Ogni sito nasce con un **sottodominio piattaforma** `dealer-{hex}.{suffix}`: escluso
dal requisito EasyGame. Hosting su Fly + Cloudflare Tunnel; Vercel scartato per la
registrazione per dominio.

### A.8 Media, SEO, template, entitlement

- Media: storage locale o S3/R2, varianti THUMB/CARD/DETAIL/HERO × AVIF/WebP/JPEG con
  job asincroni (libvips), dedupe per checksum, asset referenziati da una revisione non
  cancellabili. **Niente alt text sugli asset del sito, niente focal point, niente crop.**
- SEO: globale + pagina, robots/sitemap per host, OpenGraph, JSON-LD (Organization,
  NewsArticle, FAQPage…), redirect manager.
- Template: **codice**, uno solo (`dealer-classic@1`); `(key, major)` congelato, minor e
  patch risolti al render; cambiare template nasconde i blocchi sconosciuti senza
  cancellarli.
- Entitlement: ProductAccess (Active/Suspended/Revoked) + Entitlement a 4 stati
  (INCLUDED/ON_REQUEST/PURCHASABLE/UNAVAILABLE) + quote; letti live a ogni richiesta.

---

## B. Cosa possiamo riutilizzare

Legenda decisione: **PORT** = portare il modulo adattandolo (React 18, Next 14, niente
`@cedi/*`); **PATTERN** = reimplementare seguendo il disegno; **NO** = non portare.

| Elemento | GPW location | Riutilizzabile | Adattamento necessario | Decisione |
|---|---|---|---|---|
| Undo/redo reducer | `components/editor/editor-history.ts` | Si, puro | tipi del nostro documento | **PORT** |
| Protocollo postMessage editor↔iframe | `components/editor-protocol.ts` | Si, nessun import | messaggi per sezione+blocco (4 livelli) | **PORT** |
| Probe nell'iframe (selezione, toolbar, inline text) | `components/editor-probe.tsx` | Quasi | togliere `@cedi/ui-primitives` → `lucide-react`; React 18 | **PORT** |
| Sanificazione testo inline | `components/editor/inline-text.ts` | Si | nessuno | **PORT** |
| Frame scalato per device | `components/scaled-preview-frame.tsx` + logica `DEVICES` in `editor-workspace.tsx` | Si | breakpoint EasyGame 375/768/1280 | **PORT** |
| Operazioni sul documento (move/duplicate/insert/remove/toggle/merge salvataggio) | `components/editor/editor-model.ts` | Parziale | estendere a sezione→blocchi; togliere `DYNAMIC_SOURCE` automotive | **PORT** |
| Stato salvataggio/pubblicazione | `components/editor/editor-status.ts` | Si | etichette | **PORT** |
| Autosave con `expectedVersion` e gestione 409 | `editor-workspace.tsx` (~L104, L290-393) | Pattern | sopra `src/lib/api/client.ts`, non `fetch` | **PATTERN** |
| Shell editor (top bar, rail, pannelli, stage) | `editor-workspace.tsx`, `structure-panel.tsx`, `inspector.tsx` | Struttura si, codice no (`gp` kit, fetch hardcoded, 1586 LOC) | ricostruire con EGDS e componenti EasyGame | **PATTERN** |
| Form generator da descrittori | `site-block-editor.tsx` (`BLOCK_SHAPE`, `BlockFields`, `ListEditor`) | Pattern valido | descrittori derivati dallo schema zod; aggiungere select, rich text (TipTap esistente), datasource picker | **PATTERN** |
| Libreria sezioni con wireframe SVG | `add-section-dialog.tsx`, `section-library.ts`, `section-wireframe.tsx` | Pattern | preset sportivi | **PATTERN** |
| Controlli di stile a token chiusi + contrasto | `style-controls.ts`, `section-style.ts` | Pattern | token EasyGame + override per breakpoint | **PATTERN** |
| Palette derivata con correzione WCAG | `ui/src/dealer-palette.ts` | Si, quasi puro | variabili `--ws-*` | **PORT** |
| Preferenze tema come `data-*` + CSS | `site-preferences.ts`, `packages/ui/tokens/src/site.css` | Pattern | Tailwind 3, classi statiche | **PATTERN** |
| Snapshot immutabile + rollback come nuova revisione + idempotency | `Domain/Publishing.cs`, ADR-0030, migrazione `PublishingLifecycle` | Concetto | Prisma + trigger SQL a mano | **PATTERN** |
| Drift «modifiche non pubblicate» | `Domain/SitePublicationDrift.cs` | Concetto | hash del draft vs hash dello snapshot | **PATTERN** |
| Ordine decisionale del middleware host | `apps/dealer-web/src/proxy.ts` | Concetto | edge Next 14 senza Prisma → rewrite verso route Node | **PATTERN** |
| Macchina a stati dominio + TXT di verifica | `Domain/SiteDomain.cs`, `DnsOverHttpsResolver.cs` | Concetto | `dns.promises` di Node, adattatore provider | **PATTERN** |
| Robots/sitemap/OG/JSON-LD per host | `app/robots.ts`, `app/sitemap.ts`, `ui/src/site-seo.ts`, `structured-data.tsx` | Pattern | `SportsOrganization`, `SportsEvent`, `NewsArticle` | **PATTERN** |
| `<picture>` multi-formato | `ui/src/site-image.tsx` | Pattern | dipende dalla decisione D6 (immagini) | **PATTERN** |
| Slug riservati, link interni sicuri | `SitePageDocument.cs:751-788`, `editor-destination.ts` | Si | lista route EasyGame | **PATTERN** |
| Template come dati `(key, major)` | ADR-0040, `DealerWebTemplates.cs` | Concetto | template = documento seed, non codice di render | **PATTERN** |
| Entitlement a stati, letti live | ADR-0032/0037 | Concetto | **gia presente** in EasyGame (`src/lib/entitlements/`) | riuso EasyGame |
| Blocchi generici (HERO, RICH_TEXT, TEXT_WITH_IMAGE, GALLERY, FEATURE_GRID, CTA, STATS_BAND, FAQ, TIMELINE, TEAM, DOWNLOAD, LEGAL_TEXT, NEWS_*, CONTACT_DETAILS, LOCATION) | casi in `site-pages.tsx` | Markup come riferimento visivo | renderer nuovi, server components, token EasyGame | **PATTERN** |

## C. Cosa NON dobbiamo portare

| Elemento | Motivo |
|---|---|
| Veicoli, catalogo, ricerca, BRAND_STRIP, Park sync, price alert, campagne, WhatsApp CTA | dominio automotive |
| Lead/CRM/B2B, `dealerweb.vehicle.*`, `crm.*`, `b2b.*` | dominio automotive; le richieste EasyGame finiscono in `form_submissions` |
| Profilo legale dealer (P.IVA, REA, generazione note legali) | modello diverso; il club ha gia i suoi dati fiscali, **che non vanno pubblicati di default** |
| Backend .NET, `proxyToApi`, EF Core, hosted workers, NetVips, adattatore SigV4 | stack diverso; in EasyGame la logica vive in `src/lib/server/` |
| `@cedi/*` (platform-identity, entitlements, ui-primitives, `gp` kit) | nessun accoppiamento runtime fra prodotti |
| **Sottodominio piattaforma** `dealer-{hex}.{suffix}` | vietato dal requisito (§2): niente URL pubblici temporanei |
| Hosting Fly + Cloudflare Tunnel | EasyGame e su Vercel; decisione infrastrutturale separata (D5) |
| Strategia «nessuna cache, doppio fetch per richiesta» | Core Web Vitals; vedi H e §25 |
| Registry spezzato in 5 record + C# | causa di divergenze; EasyGame avra **una** definizione per tipo |
| Template come codice di rendering | richiesta: template = punto di partenza modificabile |
| Pubblicazione programmata con worker | overengineering per V1 (i cron Vercel esistono, si valuta in V2) |
| Codice copiato verbatim | licenza proprietaria: anche se il titolare e lo stesso (Cedi Soft), serve conferma scritta interna (D1) |

---

## D. Gap EasyGame

| # | Gap | Evidenza | Impatto |
|---|---|---|---|
| G1 | Posizione di prodotto N-10 «NO-COPY» | KB 30 righe 201, 786 | ADR che la superi |
| G2 | Nessun entitlement `website`, nessun extra Hub | `src/lib/entitlements/catalog.ts:31`, `HubExtraServiceKey` in `src/lib/payments/payment-types.ts` | facile: estendere i cataloghi |
| G3 | Stati extra solo `not_active/active/trialing/cancelled` | `HubExtraBillingStatus` | manca «sospeso/scaduto»: derivarlo |
| G4 | Nessuna gestione host; middleware edge senza Prisma; matcher esclude i path con estensione (`robots.txt`, `sitemap.xml`) | `src/middleware.ts:231` | serve un ramo host in testa al middleware |
| G5 | Root layout unico con provider client del gestionale | `src/app/layout.tsx` | serve un root layout separato per il sito (D7) |
| G6 | Nessun route group; `tests/auth/route-guards.test.mjs` vincola le cartelle top-level | | ogni nuova cartella va dichiarata |
| G7 | **Nessun risultato/statistica/classifica/competizione/avversario** | KB 11, `src/lib/events/model.ts` | blocca RESULTS, MATCH DETAIL, STATS, STANDINGS (D3) |
| G8 | Eventi solo `training|match` | `EVENT_KINDS` | open day, camp, tornei non sono eventi |
| G9 | Nessun flag di pubblicabilita per persona; consenso `images` non applicato a chi non ha deciso | `src/lib/consents/*` | gate privacy nuovo (H, D4) |
| G10 | Nessun `isMinor` condiviso (quello di `data-subject.ts:338` e privato) | | estrarre in `src/lib/` puro |
| G11 | Altezza, ruolo in campo, bio atleta inesistenti; numero di maglia con due sorgenti | `jersey-numbering-utils.ts` | profilo pubblico sportivo |
| G12 | Categorie ricreate ogni stagione; nome non e identita (ADR-0155) | `src/lib/categories/identity.ts` | URL squadra stabili da progettare |
| G13 | Media in `bytea` (`attachment_blobs`), nessun ridimensionamento, logo club e foto atleta come data URL o dietro sessione | `src/lib/server/attachments.ts`, KB 16 D13 | servire immagini pubbliche efficienti (D6) |
| G14 | Il sanitizzatore ammette immagini solo da `ATTACHMENT_ENDPOINT` | `src/lib/rich-text/sanitize.ts` | variante per il sito pubblico |
| G15 | Nessuna news pubblica (bacheca = interna per audience) | `src/lib/server/announcements.ts` | dominio articoli nuovo |
| G16 | Sponsor completi ma senza campi vetrina; logo come data URL nel payload | `src/lib/sponsors/model.ts` | estendere il dominio sponsor, non duplicarlo |
| G17 | Nessuna cache (`unstable_cache`, `revalidateTag`) ne batch loader | grep su `src/` | resolver datasource a livello pagina |
| G18 | Nessuna iscrizione/prova anonima fuori dai moduli online; appuntamenti solo autenticati | `trial-athletes.ts` «mai pubblica» | le CTA puntano ai moduli online |
| G19 | Nessun captcha | | i form pubblici si appoggiano ai rate limit esistenti |
| G20 | KB 06 ancora descrive `matches/trainings` come risorse generiche | KB 06 righe 231-243 | correggere quando si tocca |

---

## E. Architettura proposta

Modular monolith, nessun servizio nuovo. Il modulo vive nei posti dove EasyGame mette gia
le cose: **dominio puro** in `src/lib/website/`, **scrittura e accesso dati** in
`src/lib/server/website/`, **rotte** in `src/app/api/v1/website/**`, **UI** in
`src/components/website/`, **renderer pubblico** in un albero che non importa mai l'editor.

```
                         ┌──────────────── host = app (easygame) ─────────────────┐
 Operatore club ──────▶  │ /website/**  (gestionale, AccessAreaGuard + Capability) │
                         │   editor (client)  ── apiRequest ──▶ /api/v1/website/** │
                         │   iframe preview ──▶ /website/preview/** (sessione,     │
                         │                      noindex, stesso renderer, draft)   │
                         └───────────────┬─────────────────────────────────────────┘
                                         │ src/lib/server/website/*  (unici scrittori)
                                         ▼
          ┌───────────────────────── PostgreSQL (Neon) ─────────────────────────────┐
          │ website_sites · website_pages · website_revisions (immutabile)          │
          │ website_domains · website_articles · website_people_publications        │
          │ attachments(+website_media_meta) · club_events · athletes · clubs …     │
          └───────────────────────────────▲─────────────────────────────────────────┘
                                          │ datasource registry (solo DTO pubblici)
                         ┌────────────────┴───────── host = dominio del club ───────┐
 Visitatore ──────────▶  │ middleware: host ∉ APP_HOSTS → rewrite /site-render/... │
                         │ (site) root layout separato: nessun provider gestionale │
                         │ resolve host → website_domains ACTIVE → sito PUBLISHED  │
                         │ snapshot pubblicato + resolver pagina (batch, cache)     │
                         │ server components, isole client minime                   │
                         └──────────────────────────────────────────────────────────┘
```

### E.1 Struttura dei file (proposta)

```
src/lib/website/                      # PURO, testabile, importabile dal client
  access-state.ts                     # stato add-on: not_enabled|trial|active|suspended
  permissions.ts                      # matrice dominio + narrowDomainPermission
  document/schema.ts                  # zod: Site, Page, Section, Block (union chiusa)
  document/operations.ts              # move/duplicate/insert/remove/toggle (port GPW)
  document/history.ts                 # undo/redo (port GPW)
  registry/                           # UNA definizione per tipo (metadati + schema + defaults
    definitions.ts                    #   + controlli + datasource + chiavi responsive)
  theme/tokens.ts, theme/palette.ts   # token, palette derivata WCAG (port GPW)
  responsive.ts                       # merge base ⊕ tablet ⊕ mobile, token→classi statiche
  templates/*.ts                      # documenti seed (Club Modern, Academy, …)
  public-dto.ts                       # tipi dei DTO pubblici (mai entita interne)
  people-visibility.ts                # regola UNICA «questa persona si mostra e come?»
  domains/model.ts                    # macchina a stati, normalizzazione host, record DNS
  publishing/snapshot.ts              # capture, hash, drift
  editor-protocol.ts                  # postMessage tipizzato (port GPW)
src/lib/server/website/               # SERVER ONLY
  sites.ts  pages.ts  publishing.ts  domains.ts  articles.ts  media.ts  people.ts
  host-resolution.ts                  # host → sito pubblicato (unico punto)
  datasources/registry.ts             # NEXT_MATCH, MATCH_LIST, TEAM_ROSTER, …
  datasources/page-resolver.ts        # raccoglie, deduplica, raggruppa per loader
  domain-providers/{manual,vercel}.ts # adattatori TLS/attach (D5)
src/components/website/editor/**      # client: shell, pannelli, inspector, probe
src/components/website/render/**      # server components del sito pubblico (mai editor)
src/app/website/**                    # area gestionale
src/app/(site)/site-render/[host]/[[...path]]/page.tsx   # renderer pubblico (vedi D7)
src/app/api/v1/website/**             # API autenticate
```

Regole: il renderer importa solo `src/lib/website/**` (puro) e
`src/components/website/render/**`; un test statico vieta import da
`components/website/editor` e da `components/providers`.

### E.2 Modello editor

**SITE → PAGE → SECTION → BLOCK**, set di blocchi **chiuso** (come ADR-0033 GPW), niente
posizionamento libero. Una sezione ha layout (1-4 colonne, stack, griglia), stile a token e
una lista di blocchi per colonna. Le «sezioni sportive» (Match Hero, Last Match, Roster
Carousel…) sono **preset**: una sezione preconfigurata con un blocco composito; dopo
l'inserimento e una sezione come le altre.

```ts
type Section = { id; layout: LayoutToken; style: Responsive<SectionStyle>;
                 hidden: boolean | { mobile?: boolean; tablet?: boolean; desktop?: boolean };
                 columns: Block[][] }
type Block   = { id; type: BlockType; props: PropsOf<type>;      // validato da zod
                 style?: Responsive<BlockStyle>; hidden?: …;
                 datasource?: DatasourceRef }                     // solo blocchi dinamici
type Responsive<T> = { base: T; tablet?: Partial<T>; mobile?: Partial<T> }
```

Override per breakpoint **solo sui token di stile** (padding, gap, allineamento, colonne,
dimensione testo, visibilita), mai su contenuto o datasource. Ogni token mappa su un insieme
**statico** di classi Tailwind (`py-6 md:py-12 lg:py-16`), cosi niente CSS inline per
breakpoint e niente classi generate a runtime che il JIT non vede.

### E.3 Registry dei componenti

Una definizione per tipo, divisa in tre facce che non si importano a vicenda:

| Faccia | Dove | Contenuto |
|---|---|---|
| Definizione (pura) | `src/lib/website/registry/definitions.ts` | `type, label, category, icon (nome lucide), schema zod, defaults, controls (descrittori), responsiveKeys, datasource?: {key, configSchema}, allowedIn` |
| Renderer | `src/components/website/render/blocks/<type>.tsx` | server component, riceve `props` + `data` risolta |
| Editor | `src/components/website/editor/controls/**` | generato dai descrittori; controlli speciali (media, datasource, link) |

La totalita si fa valere con `Record<BlockType, …>` + un test che verifica che ogni tipo
abbia renderer, defaults validi e controlli coerenti con lo schema.

---

## F. Modello dati proposto (senza migration)

Principio: **nessuna copia** di atleti, squadre, gare, sponsor. Il sito conserva
configurazione e contenuto editoriale; i dati sportivi si leggono live.

| Tabella | Colonne principali | Note |
|---|---|---|
| `website_sites` | `id`, `organization_id` **UNIQUE**, `status` (`setup|draft|published|offline`), `template_key`, `template_version`, `theme` jsonb, `navigation` jsonb (menu header/footer, 1 livello di dropdown), `header` jsonb, `footer` jsonb, `seo` jsonb (globale), `settings` jsonb (social, contatti pubblici scelti), `draft_version` int, `current_revision_id`, `published_at`, timestamps | un sito per club in V1. Il menu sta qui: piccolo, letto sempre insieme, versionato con lo snapshot |
| `website_pages` | `id`, `site_id`, `organization_id`, `kind` (`home|standard|legal|news_index|news_article|team|match|player`), `slug`, `path` (UNIQUE per sito), `title`, `seo` jsonb, `document` jsonb (sezioni), `hidden`, `sort_order`, `version`, `deleted_at` | `team|match|player|news_article` sono **template di pagina dinamica**: un documento, N URL |
| `website_revisions` | `id`, `site_id`, `organization_id`, `revision_number` (UNIQUE per sito), `snapshot` jsonb, `snapshot_hash`, `origin` (`manual|rollback`), `source_revision_id`, `idempotency_key` (UNIQUE per sito), `actor_user_id`, `created_at` | **immutabile** con trigger SQL; retention: ultime N + quelle referenziate |
| `website_domains` | `id`, `site_id`, `organization_id`, `hostname` **UNIQUE globale**, `role` (`primary|redirect`), `state` (`pending_dns|verified|provisioning|active|failed|suspended|removed`), `tls_state` (`not_tracked|pending|active|failed`), `verification_token`, `dns_requirements` jsonb, `provider`, `provider_ref`, `last_checked_at`, `attempt_count`, `version` | indice parziale: un `primary` per sito |
| `website_articles` | `id`, `site_id`, `organization_id`, `slug` (UNIQUE per sito), `title`, `excerpt`, `body_html` (sanificato sul server), `cover_attachment_id`, `gallery` jsonb (id allegati), `category_key`, `author_label`, `status` (`draft|scheduled|published|archived`), `publish_at`, `published_at`, `featured`, `seo` jsonb, `version` | **fuori dallo snapshot**: ogni articolo ha il suo stato. Categorie in `website_sites.settings` |
| `website_people_publications` | `id`, `organization_id`, `person_kind` (`athlete|trainer|staff`), `person_id`, `published` bool, `name_display` (`full|first_initial|initials`), `photo_attachment_id`, `position_label`, `height_cm`, `public_bio`, `updated_by`, timestamps; UNIQUE `(organization_id, person_kind, person_id)` | **opt-in esplicito**. Polimorfo perche allenatori e staff sono collezioni JSON. Va registrata in `data-subject.ts` (si cancella) |
| `website_media_meta` | `attachment_id` PK, `organization_id`, `alt_text`, `focal_x`, `focal_y`, `title` | non tocca lo schema `attachments` |
| — sponsor | **nessuna tabella**: si estende il payload sponsor (`showcase: {visible, tierKey, logoAttachmentId, websiteUrl, publicDescription, order, visibleFrom, visibleTo}`) scritto da `src/lib/server/sponsors.ts`; livelli in `settings.sponsorTiers` | il logo passa da data URL ad allegato |
| — risultati (se D3 = si) | colonne su `club_events` scritte da `src/lib/server/events.ts`: `score_home`, `score_away`, `period_scores` jsonb, `result_status` | decisione separata, ADR proprio |
| — redirect | V1.1: `website_redirects` | |

Ridondanze verificate: niente `WebsiteSponsor` (esiste il dominio sponsor), niente
`WebsiteTheme`/`WebsiteNavigation` come tabelle (jsonb sul sito), niente copia di squadre o
roster (letti da categorie, gruppi, appartenenze), niente seconda media library (allegati).

---

## G. Permission model

Nuovo `PermissionDomain` `website` in `src/lib/permissions/catalog.ts`, matrice in
`src/lib/website/permissions.ts` con `narrowDomainPermission` (come seasons e
communications). **Nessun ruolo nuovo** (KB 08).

| Chiave | owner | club_manager | collaborator | staff | trainer/parent/athlete |
|---|---|---|---|---|---|
| `website.read` | ✓ | ✓ | ✓ | ✓ | — |
| `website.pages.manage` (pagine, sezioni, menu) | ✓ | ✓ | ✓ | — | — |
| `website.blog.manage` | ✓ | ✓ | ✓ | ✓ | — |
| `website.media.manage` | ✓ | ✓ | ✓ | ✓ | — |
| `website.sponsors.showcase` (solo vetrina, non contratti) | ✓ | ✓ | ✓ | — | — |
| `website.theme.manage` | ✓ | ✓ | — | — | — |
| `website.seo.manage` | ✓ | ✓ | ✓ | — | — |
| `website.people.publish` (chi compare sul sito) | ✓ | ✓ | — | — | — |
| `website.publish` | ✓ | ✓ | — | — | — |
| `website.domain.manage` | ✓ | (D8) | — | — | — |

- Attivazione/sospensione dell'add-on: **solo piattaforma** (`setClubExtraService`,
  come oggi), mai il club.
- Il collaboratore «comunicazione» si ottiene con un ruolo personalizzato su base
  `collaborator` (news, pagine, foto), senza dominio, tema, pubblicazione.
- Ogni scrittura: `requireAuthenticatedUser` → `resolveOrganizationScopeForUser` →
  `assertActiveClub` → `requireClubEntitlement('website')` → permesso. Errori con
  «Accesso negato». Audit su publish, rollback, dominio, pubblicazione di persone.
- `/website` entra in `MANAGEMENT_PATH_PREFIXES` (non admin-only) e in
  `PROTECTED_PREFIXES`.

---

## H. Datasource architecture

```
page snapshot ─▶ collect(blocks) ─▶ [ {key:'NEXT_MATCH', cfg}, {key:'TEAM_ROSTER', cfg}, … ]
                  │ normalizza + valida cfg (zod) + hash → dedup
                  ▼
          group by loader:  events | roster | staff | sponsors | articles | club
                  │  1 query per loader per pagina (finestra unione, filtri in memoria)
                  ▼
          public mappers (allowlist colonne) ─▶ PublicDTO ─▶ renderer
```

- Registry server-only (`src/lib/server/website/datasources/registry.ts`). Ogni voce:
  `key`, `configSchema`, `loader` (quale aggregato serve), `select(cfg, aggregate)`,
  `toPublic` (DTO). Il frontend **non** interroga mai: riceve DTO gia risolti.
- Contesto obbligatorio: `organizationId` **dal dominio risolto** (mai dalla richiesta),
  `seasonId` (stagione attiva via `resolveSeasonContext`, o esplicita nel blocco),
  modalita `public|preview`.
- Loader con `select` esplicito; **mai** `athletes.data` passato intero; `anonymized_at IS
  NULL`; appartenenze correnti; eventi non archiviati.
- Persone: passano tutte da `people-visibility.ts` (una funzione, nessuna ricostruzione
  altrove, come `isGuardianExcluded`). Regola V1 proposta:
  1. compare solo con `website_people_publications.published = true`;
  2. **minore** (nessuna data di nascita = minore): nome `first_initial` di default,
     foto solo se consenso `images` **esplicitamente concesso** (modalita
     `require_explicit` per il sito, a prescindere dalla configurazione del club);
  3. mai contatti, data di nascita completa, indirizzo, codice fiscale, dati sanitari,
     tutori, pagamenti; anno di nascita solo se il club lo abilita e non e minore;
  4. foto pubblica = `photo_attachment_id` scelto per il sito, **non** l'avatar interno.
- Datasource V1: `NEXT_MATCH`, `MATCH_LIST` (prossime/passate/tutte), `TEAMS`,
  `TEAM_ROSTER`, `PLAYER`, `STAFF`, `SPONSORS`, `LATEST_ARTICLES`, `CLUB_NUMBERS`
  (solo conteggi affidabili: atleti attivi nella stagione, squadre), `PUBLIC_FORMS`.
  `RECENT_RESULTS`, `LAST_MATCH` solo se D3. Stats/classifiche: no.
- Cache: dati per richiesta con `React.cache()`; tra richieste `unstable_cache` con tag
  `website:<siteId>` (snapshot, invalidato al publish) e TTL breve (60-120 s) per i dati
  sportivi. Nessuna invalidazione scritta dentro `events.ts` in V1 (non accoppiare il
  dominio eventi a Next): si valuta poi un hook in `src/lib/server/website/`.

## I. Custom domain architecture

- **Nessun URL pubblico temporaneo.** Prima del dominio c'e solo la preview autenticata.
- Flusso: inserisci host → normalizza (minuscolo, punycode, niente porta/path, rifiuto host
  EasyGame e IP) → mostra record: `TXT _easygame-verify.<host> = <token>` + `CNAME <host> →
  <target>` (apex: A/ALIAS, D5) → verifica con `dns.promises` (runtime Node) → attach al
  provider → TLS `active` → `state=active`.
- `www`: si propone la coppia apex + `www`; una e `primary`, l'altra `redirect` (301).
- Middleware (edge, senza DB): host ∈ `EASYGAME_APP_HOSTS` → comportamento attuale; altro
  host → rewrite `/site-render/<host>/<path>`; su host del club `/api/*` passa **solo**
  per l'allowlist pubblica (moduli, media del sito), mai le API del gestionale;
  `robots.txt`/`sitemap.xml` vanno inclusi nel matcher per gli host del club.
  `/site-render/*` chiamato direttamente sull'host app → 404.
- Route Node: `host-resolution.ts` → `website_domains.state='active'` +
  `website_sites.status='published'` + add-on in stato servibile → altrimenti 404 (host
  sconosciuto) o pagina «sito non disponibile» `noindex` (sospeso).
- Host non primario → 301 al primario; `<link rel=canonical>` sempre sul primario.
- Cookie di sessione EasyGame non arrivano sul dominio del club (dominio diverso): il
  renderer non legge mai sessione.
- Provider TLS dietro adattatore (D5): `manual` (operatore aggiunge il dominio su Vercel,
  il sistema verifica DNS e lo stato), poi `vercel` (API domini del progetto) o Cloudflare
  for SaaS (allineato a GPW/Cedi Platform).

## J. Publishing lifecycle

```
EDIT ──autosave(version)──▶ DRAFT ──preview (sessione, noindex)──▶ PUBLISH
                                                         │ verifica: entitlement servibile,
                                                         │ dominio primario active, pagine
                                                         │ valide, pagine legali presenti
                                                         ▼
                                    website_revisions(n) immutabile ◀── ROLLBACK = revisione n+1
                                                         │ revalidateTag(website:<siteId>)
                                                         ▼
                                            sito pubblico (snapshot + dati live)
```

- Snapshot = tema, navigazione, header/footer, SEO, pagine e sezioni. **Non** contiene
  dati sportivi, sponsor, articoli: quelli sono live e rispettano le loro regole
  (pubblicazione persona, stato articolo, vetrina sponsor).
- Pubblicazione per **sito intero** (come GPW): niente stati per singola pagina in V1.
- Idempotency key su publish e rollback; `draft_version` + `version` per pagina con 409.
- «Modifiche non pubblicate» = hash del draft ≠ `snapshot_hash` corrente.
- Rollback in V1 (costa poco con snapshot immutabili); pubblicazione programmata no.
- Sospensione dell'add-on: il sito va offline (pagina `noindex`), i dati restano;
  riattivazione = torna l'ultima revisione.

## K. MVP / V1

**Dentro V1**

1. Add-on `website` con stati derivati e gate su API e UI; permessi `website.*`.
2. Sito unico per club; pagine standard e legali; menu header (1 livello dropdown) e footer
   configurabili; tema globale (colori con palette WCAG, 4-6 coppie di font curate, radius,
   stile bottoni, larghezza container, spaziatura, stile header/footer).
3. Editor visuale: struttura sezioni/blocchi, aggiungi/rimuovi/duplica/sposta/nascondi,
   inspector da schema, preview Desktop/Tablet/Mobile in iframe, override di stile per
   breakpoint, undo/redo, autosave con conflitti.
4. **2 template** curati (Club Modern, Academy) come documenti seed. Professional e Minimal
   in V1.1.
5. Blocchi generici: Hero, Heading, Text (TipTap), Image, Gallery, Video (embed YouTube/
   Vimeo con consenso), Button/CTA, Columns via sezione, Spacer, Divider, Logo, FAQ,
   Contact (dati pubblici scelti), Map (con consenso), Social links, Card grid, Numbers.
6. Blocchi sportivi: Next Match, Match List, Team list, Team Roster, Player Card/Grid,
   Staff, Club Numbers, Match Hero (preset), Roster Carousel (preset).
7. Pubblicazione persone (opt-in, regola minori).
8. Sponsor: vetrina sul dominio esistente + Marquee, Grid, Featured, Section per livello.
9. News: articoli, lista, dettaglio, ultime news, sitemap.
10. Iscrizioni: CTA e blocco verso moduli online pubblicati (`/forms/<slug>`), compresi
    quelli di prova; nessun sistema parallelo.
11. SEO pagina + globale, OpenGraph, robots, sitemap, JSON-LD (`SportsOrganization`,
    `SportsEvent`, `NewsArticle`).
12. Media library sul servizio allegati, alt text, focal point, route pubblica con cache.
13. Dominio custom con verifica DNS, provider `manual`, primario + redirect, canonical.
14. Publish/rollback con snapshot immutabile.

**Fuori V1 (V1.1/V2)**: risultati e tabellini (salvo D3), statistiche, classifiche, open
day/camp come eventi, form incorporati nel sito, redirect manager, pubblicazione
programmata, piu siti per club, multilingua, crop, provider dominio automatico, template
3-4, preview condivisibile con token.

## L. Roadmap tecnica (Work Package)

Etichetta proposta `WS-xx` (come `PP-`/`WP-RD`); numeri ADR provvisori fino al merge.

| WP | Contenuto | DB | Verifica |
|---|---|---|---|
| **WS-00** | ADR: supera N-10; ADR dominio, privacy pubblica, pubblicazione. Solo docs | — | revisione |
| **WS-01** | Foundation: entitlement `website` + extra Hub, `access-state.ts`, dominio permessi `website`, area `/website` vuota con `CapabilityGate` | — | test puri, route guards, role authorization |
| **WS-02** | Root layout separato per il sito (D7): `(app)` + `(site)`, nessun cambio di comportamento | — | build, test route guards, smoke 375/768/1280 |
| **WS-03** | Documento: schema zod, operazioni, registry (solo definizioni), template seed | — | test puri |
| **WS-04** | Persistenza: `website_sites`, `website_pages`, writer, API, registry API, KB 06/09 | migrazione 1 | test server con fake prisma, tenant |
| **WS-05** | Renderer + blocchi generici + tema + preview autenticata noindex | — | test statico «il renderer non importa l'editor», snapshot HTML |
| **WS-06** | Editor shell: struttura, inspector, iframe+probe, device, undo, autosave | — | test operazioni, UAT nel browser |
| **WS-07** | Header/footer/menu, SEO pagina e globale, editor tema | — | test |
| **WS-08** | Media: owner type `website`, `website_media_meta`, route pubblica, sanitizzatore | migrazione 2 | test confine tenant sui media |
| **WS-09** | Persone pubbliche: tabella, `people-visibility.ts`, `isMinor` condiviso, UI, `data-subject.ts`, `RETENTION.md` | migrazione 3 | test minori/consenso/erasure |
| **WS-10** | Datasource registry + page resolver + blocchi sportivi V1 + pagine dinamiche team/player/match | — | test conteggio query, tenant, DTO allowlist |
| **WS-11** | Sponsor vetrina: campi, livelli, logo ad allegato, 4 blocchi | — (payload) | test dominio sponsor |
| **WS-12** | News: `website_articles`, editor TipTap, blocchi, sitemap | migrazione 4 | test |
| **WS-13** | Iscrizioni: blocco/CTA verso moduli pubblicati | — | E2E |
| **WS-14** | Domini: tabella, stato, verifica DNS, provider `manual`, middleware host, robots/sitemap per host, canonical | migrazione 5 | test middleware e host resolution |
| **WS-15** | Publishing: snapshot immutabile + trigger, publish/rollback, drift, cache tag, sito offline | migrazione 6 | test idempotenza, E2E su dominio di staging |
| WS-16 (D3) | Risultati minimi su `club_events` via `events.ts` + Results/Last Match | migrazione | test eventi |

## M. Rischi

| Rischio | Descrizione | Mitigazione |
|---|---|---|
| Privacy | il builder potrebbe esporre campi interni (contatti, CF, salute, tutori, pagamenti) | DTO a colonne esplicite, mai `data`; test che falliscono se un DTO contiene chiavi fuori allowlist |
| Minorenni | foto e nome completo di minori online | opt-in per persona, consenso `images` esplicito obbligatorio per la foto, nome abbreviato di default, data mancante = minore |
| Diritto all'oblio | cache e snapshot che trattengono una persona cancellata | gli snapshot non contengono persone; cache con TTL breve; `data-subject.ts` cancella `website_people_publications` |
| Multi-tenant | host → club sbagliato, editor che legge un altro club | un solo punto `host-resolution.ts`; `organization_id` su ogni riga; organizzazione dal dominio, mai dalla richiesta; test cross-tenant per ogni API |
| Dominio custom | takeover di domini abbandonati, host di altri, TLS in sospeso | TXT di proprieta obbligatorio, hostname unico globale, rimozione = disattiva subito, riverifica periodica |
| Query explosion | 15 blocchi = 15+ query sulle stesse righe | resolver di pagina con loader per aggregato, `React.cache`, test che conta le query |
| Caching | dati vecchi dopo un cambio; invalidazione fragile | snapshot per tag al publish; dati live con TTL breve; nessuna invalidazione sparsa nei domini |
| Editor state | conflitti fra due operatori, perdita di modifiche | versioni ottimistiche per pagina, merge di GPW, 409 visibile |
| Dati pubblici incompleti | componenti che promettono statistiche che non esistono | il registry non offre blocchi senza datasource reale; Club Numbers manuale dove il dato non e affidabile |
| Root layout | spostare il gestionale in un route group tocca tutte le cartelle | WP dedicato senza altre modifiche, test di regressione su route guard e smoke |
| Media in `bytea` | gallery pesanti gonfiano Neon e rallentano | limiti per sito, cache HTTP immutabile, storage driver S3/R2 prima di gallery estese (D6) |
| Migrazione codice GPW | versioni Next/React diverse, dipendenze `@cedi/*` | port solo di moduli puri, riscrittura del resto; nessun import cross-repo |
| Accoppiamento prodotti | divergenza futura Cedi Platform | nessuna dipendenza runtime; concetti allineati (snapshot, entitlement, domini) per facilitare una futura convergenza |
| Licenza | codice proprietario Cedi Soft | conferma interna scritta prima di portare file |
| Vercel | collegare molti domini a un progetto ha limiti e costi | adattatore provider, decisione D5 prima di WS-14 |

---

## Primo Work Package consigliato

**WS-01 — Foundation** (preceduto da WS-00, solo ADR). Nessuna migrazione, nessuna UI
complessa: rende il modulo esistente, governato e spento di default.

**File EasyGame toccati**

- `src/lib/entitlements/catalog.ts` — chiave `website`, area `comunicazione`,
  `unlockedByExtra: "website"`, non inclusa in nessun piano
- `src/lib/payments/payment-types.ts` — `HubExtraServiceKey` += `website`
- `src/lib/payments/payment-config-utils.ts` — definizione extra (prezzo da decidere, D2)
- `src/lib/website/access-state.ts` (nuovo) — `not_enabled | trial | active | suspended`
  dalla spiegazione dell'entitlement e dallo stato dell'extra
- `src/lib/website/permissions.ts` (nuovo) — matrice + `narrowDomainPermission`
- `src/lib/permissions/catalog.ts` — dominio `website` e chiavi
- `src/lib/access-roles.ts` — `/website` in `MANAGEMENT_PATH_PREFIXES`
- `src/middleware.ts` — `/website` in `PROTECTED_PREFIXES`
- `src/app/website/layout.tsx`, `src/app/website/page.tsx` — area con `CapabilityGate`
  e stato dell'add-on
- `src/components/platform-admin/club-services-section.tsx` — attivazione da console
- KB: 08, 11, 18 (ADR), 20, CLAUDE.md §2 (riga di ownership)

**Riuso GPW**: solo concetti (entitlement letto live, stati distinti accesso/capacita).

**Test**: `tests/lib/website-access-state.test.mjs`, `tests/lib/website-permissions.test.mjs`
(matrice, ruolo personalizzato che restringe, nessun ruolo esterno), aggiornamento di
`tests/auth/route-guards.test.mjs` e del test di autorizzazione ruoli.

## Decisioni da prendere prima dell'implementazione

| # | Decisione | Proposta |
|---|---|---|
| D1 | Conferma interna che il codice GPW (Cedi Soft) puo essere portato in EasyGame | richiesta scritta prima di WS-06 |
| D2 | Superare N-10 (KB 30) e prezzo/stati commerciali dell'add-on (trial: si puo pubblicare?) | ADR-0200; trial con preview e dominio, pubblicazione consentita |
| D3 | Risultati: costruire un minimo (punteggio finale + periodi su `club_events`) nel perimetro V1? | si, come WS-16; tabellini, statistiche e classifiche a V2 |
| D4 | Regola privacy di default per persone pubbliche (opt-in, minori, foto) | come H; validazione del consulente privacy del club/Cedi |
| D5 | Infrastruttura domini: Vercel (domini sul progetto) vs Cloudflare for SaaS; apex | `manual` in V1, adattatore; scelta automatica prima di WS-14 |
| D6 | Immagini: restare su `bytea` + `next/image` o introdurre object storage | `bytea` per V1 con limiti; storage S3/R2 prima delle gallery estese |
| D7 | Root layout separato: route group `(app)`+`(site)` (sposta tutte le cartelle) vs provider condizionali | route group, in un WP dedicato |
| D8 | `website.domain.manage` solo owner o anche club_manager | solo owner |
| D9 | Identita squadra stabile fra stagioni per URL pubblici | slug dalla categoria della stagione attiva, con redirect quando cambia |
