# EasyGame Web — fonte di design CORRENTE

> **Versione corrente: EGDS v3.1.0 · "EasyGame blue · web" · 2026-09-15.**
> Importata da `EasyGame Design System.zip` (2026-09-15 00:41) e
> `EasyGame Web redesign project.zip` (2026-09-15 00:16).
>
> Qualunque artefatto non elencato qui sotto come *autorevole* e **storia**,
> non riferimento. Se un mockup e queste regole si contraddicono, vale
> l'ordine di precedenza scritto in `../guidelines/10-handoff.md` §10.2:
> `deprecated.md` → `05`–`10` → `02-foundations.md` → `tokens/web.css` →
> i file mockup.

## Cosa e autorevole per il Web

| File | Ruolo |
| --- | --- |
| `../guidelines/05-web-desktop.md` … `10-handoff.md` | **La specifica.** Fondamenta, guscio, DataGrid, moduli, pattern di pagina, contratto d'implementazione |
| `../tokens/web.css` | Il livello di token web (`--egw-*`), importato da `../styles.css` |
| `../guidelines/deprecated.md` §Web | Cio che non deve comparire |
| `EasyGame Web Direction v3.dc.html` | **Iterazione 4** — la tavola di direzione approvata: guscio corretto (barra laterale in gradiente, topbar con Azioni rapide · Notifiche · Account), cassetto Azioni rapide, tendina account, DataGrid su Atleti, anatomia della griglia |
| `EGShell.dc.html` · `EGRecord.dc.html` · `EGAthlete.dc.html` | I frame estratti: guscio, pagina scheda (intestazione, aree, colonna di stato), intestazione atleta |
| `EasyGame Web Design System.dc.html` | Il documento di sistema `v0.1 bozza`: vale per i principi, **non** per la geometria dove `05` la corregge (pillola di stato, densita righe) |
| `EasyGame Web Screens.dc.html` | Le quattro panoramiche di schermata (Atleti, Scheda atleta, Prima nota, Allenamenti): valgono per la **composizione della pagina**. La barra laterale bianca che mostrano e **superata** (C3 in `05` §5.0): il guscio e quello di Direction v3 |
| `assets/logo-white.png` · `logo-blue.png` · `icon-white.png` · `icon-blue.png` · `favicon.png` · `app-icon.png` | I marchi ufficiali. Mai ridisegnati, mai ricolorati, mai scritti come testo |
| `icons/*.svg` | Ionicons (MIT) usati nei mockup; nell'app si usa `lucide-react` con la stessa tabella di significati canonici (`02-foundations.md`) |
| `screenshots/dash.png` | Resa di riferimento della Dashboard |

## Cosa NON e autorevole (e non e stato importato)

- `EasyGame Web Direction.dc.html` (v1) e `EasyGame Web Direction v2.dc.html`:
  tavole superate dall'Iterazione 4.
- `EasyGame Web Pages.dc.html` e `EasyGame Web Redesign.dc.html`: esplorazioni
  precedenti alla Direction v3.
- `uploads/Immagine *.jpg`: schermate della **V1 attuale**, usate come input
  del designer. La V1 vive in git e sullo staging Fortitudo.
- Il `readme.md` della cartella madre e `SKILL.md` dicono ancora che il sistema
  descrive «l'app mobile» e che il Web e un segnaposto: **obsoleto** per questo
  lavoro. Per il Web valgono `05`–`10`.

## Due fonti di verita (regola ADR del redesign)

- **Funzionalita**: il codice dell'applicazione esistente (rotte, componenti,
  API, permessi, validazioni, test). Nessuna capacita esistente sparisce perche
  un mockup non la disegna.
- **Aspetto / UX**: gli artefatti qui sopra e le guideline `05`–`10`.

## Come guardare i mockup

```bash
node scripts/serve-design-source.mjs
# http://127.0.0.1:3020/web/
```

(o la configurazione `design-source` in `.claude/launch.json`).

## Storico delle importazioni

| Data | Versione | Cosa |
| --- | --- | --- |
| 2026-09-13 | EGDS v3.0.0 | Primo import (mobile; Web segnaposto) |
| 2026-09-15 | **EGDS v3.1.0** | Passata Web: `05`–`10`, `tokens/web.css`, cartella `web/` con Direction v3, frame EG*, Design System, Screens, marchi e icone |
