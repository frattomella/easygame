# Wave E — Audit di parità: EasyGame HUB (`/hub`)

> Inventario funzionale dell'implementazione V1 sul branch `feat/web-redesign`,
> scritto **prima** della migrazione al Web V2. È il contratto di parità:
> niente sparisce. Nessuna proposta di design.
>
> Rotta coperta: `/hub` (`src/app/hub/page.tsx`, 607 righe). Decisione in
> vigore: [ADR-0014](../../knowledge-base/18-decision-log.md#adr-0014--hub-resta-statico)
> — «il catalogo marketplace resta una pagina statica: nessuna chiamata dati,
> nessuna persistenza, non promettere all'utente funzioni che la pagina non
> svolge». Capability in [11](../../knowledge-base/11-capabilities.md):
> «Abbonamenti / HUB extra — MISSING — catalogo statico».

---

## Guscio

`Sidebar` + `Header title="EasyGame HUB"`; `main` **senza**
`dashboardMainClassName` né `DashboardPageContainer`: un hero a tutta
larghezza in gradiente viola→rosa→arancio (`bg-gradient-to-r`, `Sparkles`
animate, onda SVG decorativa) con tre badge «Marketplace · Novità ·
Tutorial» in glass, poi `max-w-7xl` con cinque tab.

Classificazione nel test `navigazione-sotto-1024-e-768`: **solo desktop**
(`SOLO_DESKTOP_CLUB["/hub"]`: sotto i 1024 px l'HUB ha il proprio
collegamento nella barra mobile, `showHubLink`). La pagina non deve comunque
traboccare a 375 px.

## 1. Dati mostrati (tutti **statici**, costanti in pagina)

- **Marketplace** (`marketplaceItems`, 4): Analytics Premium (€9.99/mese,
  popolare; Report personalizzati · Export PDF · Grafici interattivi) ·
  Multi-Club Manager (€19.99/mese; Fino a 5 club · Dashboard unificata ·
  Report consolidati) · Calendario Avanzato (€4.99/mese; Sync Google
  Calendar · Notifiche push · Promemoria automatici) · Document Manager Pro
  (€14.99/mese, popolare; Firma digitale · Template personalizzati ·
  Archiviazione cloud). Titolo sezione «Potenzia il tuo Club», sottotitolo
  «Scopri i servizi extra per portare la gestione del tuo club al livello
  successivo».
- **Novità** (`newsItems`, 3): «Nuova funzionalità: Gestione Gare» (15 Gen
  2025, feature) · «Aggiornamento Dashboard» (10 Gen 2025, update) ·
  «Miglioramenti Performance» (5 Gen 2025, improvement). Titolo «Ultime
  Novità», sottotitolo «Resta aggiornato sulle ultime funzionalità e
  miglioramenti».
- **Tutorial** (`tutorialItems`, 4): «Come creare il tuo primo club» (5 min,
  Iniziare) · «Gestire gli atleti» (8 min, Atleti) · «Pianificare gli
  allenamenti» (6 min, Allenamenti) · «Gestire i certificati medici» (4 min,
  Certificati). Le `thumbnail` puntano a Unsplash (la prima è un URL rotto
  con uno spazio) e **non vengono renderizzate** (la card mostra un
  gradiente con `Play`). Titolo «Video Tutorial», sottotitolo «Impara a
  usare EasyGame con i nostri tutorial guidati».
- **FAQ** (`faqItems`, 5): «Come posso aggiungere un nuovo atleta?» · «Come
  funziona il sistema di token per i genitori?» · «Posso gestire più club
  con lo stesso account?» · «Come ricevo le notifiche per i certificati in
  scadenza?» · «Posso esportare i dati degli atleti?», con le rispettive
  risposte. Titolo «Domande Frequenti», sottotitolo «Trova risposte alle
  domande più comuni».
- **Feedback**: testata «Il tuo feedback conta!» / «Aiutaci a migliorare
  EasyGame con i tuoi suggerimenti».
- **Proposte**: testata «Hai un'idea?» / «Proponi nuove funzionalità per
  EasyGame»; card «Contattaci direttamente» / «Per richieste urgenti o
  collaborazioni» con link esterno `https://www.cedisoft.it/contatti/`
  (`target=_blank`, `ExternalLink`).

## 2. Azioni

- **Acquista** (per servizio): pulsante in gradiente **senza `onClick`**:
  non fa niente.
- Card tutorial: `cursor-pointer`, **nessun handler**.
- FAQ: clic sulla card apre/chiude la risposta (`expandedFaq`).
- **Invia Feedback**: se il testo è vuoto → toast `error` «Inserisci un
  messaggio»; altrimenti toast `success` «Grazie per il tuo feedback! Lo
  esamineremo presto.» e campo azzerato. **Nessuna richiesta di rete: finge
  un invio.**
- **Invia Proposta**: se titolo o descrizione vuoti → toast `error`
  «Compila tutti i campi»; altrimenti toast `success` «Proposta inviata con
  successo! Ti contatteremo presto.» e campi azzerati. **Nessuna richiesta di
  rete: finge un invio.**

## 3. Moduli

| Sezione | Campo | Tipo | Iniziale | Validazione |
|---|---|---|---|---|
| Feedback | Tipo di feedback | tre pulsanti «💬 Feedback» · «🐛 Bug» · «⭐ Complimento» (`feedbackType`) | `feedback` | — (il valore non è usato da niente) |
| Feedback | Il tuo messaggio (`feedback-text`) | `Textarea rows=5`, placeholder «Scrivi qui il tuo feedback...» | `""` | non vuoto |
| Proposte | Titolo della proposta (`proposal-title`) | `Input`, placeholder «Es: Integrazione con WhatsApp» | `""` | non vuoto |
| Proposte | Descrizione dettagliata (`proposal-description`) | `Textarea rows=5`, placeholder «Descrivi la tua idea in dettaglio...» | `""` | non vuoto |

## 4. Filtri / viste

Cinque tab (`Tabs defaultValue="marketplace"`): Marketplace · Novità ·
Tutorial & FAQ · Feedback · Proposte. Nessun filtro.

## 5–6. Azioni di massa, export

Nessuna.

## 7. Permessi

Rotta in `MANAGEMENT_PATHS` (`/hub`), non admin-only. Nessun predicato
client, nessuna rotta server.

## 8. Stati

Nessuno (nessun caricamento, nessun errore). FAQ aperta/chiusa.

## 9. Flussi distruttivi

Nessuno.

## 10. Navigazione

Link esterno `https://www.cedisoft.it/contatti/`. Nessun parametro.

## 11. Schede/sezioni

Le cinque tab del punto 4; «Tutorial & FAQ» contiene due sezioni.

## 12. Test collegati

- `tests/ui/navigazione-sotto-1024-e-768.test.mjs` — `/hub` dichiarato
  `SOLO_DESKTOP_CLUB` (non legge la pagina).
- Nessun test legge `app/hub/page.tsx`.

## 13. Inventario componenti

`Sidebar, Header, Card*, Button, Badge, Tabs*, Input, Textarea, Label,
useToast`; 24 icone lucide. Tutto inline; nessun componente specifico da
rimuovere fuori dal file.

## Difetti della V1 (da dichiarare come GAP nella migrazione)

1. «Acquista» è un pulsante inerte (ADR-0014: non promettere funzioni che la
   pagina non svolge).
2. «Invia Feedback» e «Invia Proposta» **fingono un invio**: toast di
   successo senza nessuna richiesta. È il caso citato dal brief come GAP
   ammesso.
3. I tutorial non hanno un video collegato; le miniature sono URL esterni
   (uno rotto) mai renderizzati.
4. Emoji nei pulsanti, punti esclamativi nei testi, gradienti multicolore,
   glass/blur, hero a tutta larghezza: tutto in `deprecated.md`.

## Sintesi

Pagina statica di catalogo, novità, tutorial, FAQ e due moduli finti. La
migrazione ricostruisce le cinque sezioni con i pattern del sistema, mantiene
tutti i testi e il link di contatto, e dichiara come GAP i tre pulsanti che
in V1 non facevano niente o fingevano.
