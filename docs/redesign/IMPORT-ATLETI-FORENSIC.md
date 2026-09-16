# Import atleti — rapporto forense del file reale (ADR-0195)

Data: 2026-09-16 · Branch `feat/web-redesign` · Baseline `83370568`.

Il file del club (`ATLETI2026_RIORGANIZZATO_NOMI.xlsx`, 9.801 byte) e stato
letto **indipendentemente dall'app** (`.codex-scratch/import/censimento-xlsx.mjs`,
SheetJS grezzo, cella per cella) e poi passato al vecchio importer
(`.codex-scratch/import/riproduci-vecchio.mjs`, con il catalogo del club
pilota sul database redesign, sola lettura) e al nuovo piano
(`.codex-scratch/import/forense-nuovo.mjs`). I nomi delle persone **non**
sono in questo documento: il rapporto completo con i nomi e un artefatto
locale non versionato.

## Censimento del file

| Voce | Valore |
|------|--------|
| Fogli | 1 (`Atleti`) |
| Intervallo usato | `A1:E200` (200 righe fisiche, 5 colonne) |
| Intestazione | riga 1: `COGNOME · NOME · NUMERO MAGLIA · ANNO DI NASCITA · CATEGORIA` |
| Righe vuote | 86 (115–200: celle stub, tipo `z`, lasciate da una cancellazione) |
| Righe candidate | **113** (2–114) |
| Nome e cognome presenti | 113/113 |
| Categoria presente | 113/113 (13 etichette distinte, tutte in maiuscolo) |
| Anno di nascita | 108/113 come **testo** (`"2013"`), 5 mancanti (righe 2, 67, 68, 69, 70) |
| Numero maglia | 103/113 (non importato) |
| Nominativi ripetuti | 2: righe 78 = 90 (stesso anno), righe 69 = 94 (anno assente nella 69) |
| Righe nascoste, celle unite, formule, tipi anomali | nessuno |

Etichette: PULCINI 4 · SCOIATTOLI 7 · AQUILOTTI 9 · ESORDIENTI 10 ·
UNDER13 REG. 7 · UNDER14 GOLD 12 · UNDER14 REG. 7 · UNDER15 ECC 9 ·
PRIMA SQUADRA 12 · UNDER17 GOLD 10 · U19 GOLD 10 · U19 REG. 10 · UNDER17 REG 6.

## 113 → 97: cosa e successo davvero

L'import del club (2026-09-16, ~18:22 ora DB, account proprietario, deploy
`7df84022`) ha scritto **97** atleti. Riprodotto riga per riga:

```
RAW FILE           200 righe fisiche
→ LETTE (vecchio)  199 righe   (sheet_to_json con defval: le 86 vuote entrano)
→ CANDIDATE        113
→ VALIDE (vecchio)  97
→ IMPORTATE         97
```

| Righe | Persona | Comportamento vecchio | Causa | Comportamento nuovo |
|-------|---------|-----------------------|-------|---------------------|
| 3, 4, 5 (PULCINI) | 3 bambini 2018–2022 | **Scartate**: «nomina piu squadre del club» | Il club ha Pulcini in due sedi; il nome nudo e ambiguo (ADR-0155). Nessun modo di scegliere nell'import | Stato *Da correggere* con le due squadre; al passo Categorie il club sceglie la squadra e le 3 righe diventano pronte |
| 2 (PULCINI) | 1 bambino senza anno | **Scartata**: ambigua **e** «Data di nascita mancante» | Come sopra + data trattata come obbligatoria | Categoria da decidere; la data mancante e un **avviso** con «Correggi» |
| 6–12 (SCOIATTOLI) | 7 bambini | **Scartate**: ambigua | Scoiattoli in due sedi | Come PULCINI |
| 67, 68, 69, 70 (PRIMA SQUADRA) | 4 adulti senza anno | **Scartate**: «Data di nascita mancante» | La scheda puo non avere la data (`birth_date` nullable), ma l'importer la esigeva | *Da verificare*: si importano senza data, o si corregge l'anno nel wizard |
| 90 (U19 GOLD) | doppione della 78 | **Scartata**: «Riga duplicata nel file» | Deduplicazione automatica, nessuna scelta | *Possibile duplicato* con «riga 78»: il club decide (importa comunque / non importare) |
| 94 (U19 GOLD) | stesso nome della 69, anno diverso | importata | (omonimo non segnalato) | importata con l'avviso «stesso nome della riga 69 (data diversa o mancante)» |
| 115–200 | — | 86 righe vuote fra gli «scarti», totale «199 righe lette» | `sheet_to_json({defval})` restituisce anche le righe vuote | contate come «righe vuote ignorate», non candidate |

FILE CANDIDATES: **113** · EASYGAME CANDIDATES (vecchio): **97** ·
DIFFERENCE: **16** = 11 ambigue (4 PULCINI + 7 SCOIATTOLI, una delle quali
anche senza anno) + 4 senza anno + 1 doppione.

**Silent drops prima: 0 in senso stretto** — le 16 righe comparivano fra gli
scarti dell'anteprima — ma erano **irrecuperabili** dentro l'app (nessuna
scelta della squadra, nessuna correzione, nessuna decisione sul doppione) e
il conteggio esposto era «199 righe lette / 102 da scartare», che non
descrive il file. **Silent drops dopo: 0**, e ogni riga ha uno stato con una
via d'uscita: `113 = pronte + da verificare + da correggere + duplicati + escluse`
(`plan.totalsConsistent`).

## Il difetto piu grave: 9 categorie create da sole

Il vecchio import **creava le categorie del file** che non trovava per nome
(`supabase.from("categories").upsert` in `athletes/page.tsx`). Nel run del
2026-09-16 sono nate 9 categorie fantasma nel club pilota — `PRIMA
SQUADRA`, `U19 GOLD`, `U19 REG.`, `UNDER13 REG.`, `UNDER14 GOLD`,
`UNDER14 REG.`, `UNDER15 ECC`, `UNDER17 GOLD`, `UNDER17 REG` — accanto a
`Under 14 Gold`, `Under 17 Gold`, `Under 19 Gold`, `Under 14 Regionale`,
`Under 17 Regionale`, `Under 19 Regionale`, `Under 15 Eccellenza` che il
club **aveva gia** (con le loro sedi). 74 atleti su 97 sono finiti in
categorie doppie senza sede. Le stesse etichette ora vengono **proposte**
(`UNDER14 GOLD` → «Under 14 Gold · Scauri», chiave normalizzata
`u14gold`), mai applicate senza il club: creare una categoria e una
decisione esplicita, presa al passo Categorie e scritta solo alla conferma.

## Con il nuovo importer, sul club pilota (sola lettura)

Senza nessuna decisione: 113 candidate, 77 pronte, 5 da verificare (senza
anno), 30 da correggere (Pulcini, Scoiattoli, Aquilotti, Esordienti: dopo
il riporto di stagione il club ha **due** categorie omonime per ognuna, una
per stagione — l'omonimia si risolve scegliendo, con la stagione scritta
accanto), 1 possibile duplicato, 0 escluse; 9 etichette proposte
esattamente alle categorie che il vecchio import aveva creato (oggi
esistono). Totali coerenti.

Con le decisioni prese (fixture anonima con la stessa struttura,
`tests/lib/import-atleti-file-reale-adr-0195.test.mjs`): 106 da creare, 7
escluse per scelta (1 doppione + 6 di una categoria esclusa), 0 da
correggere, 5 categorie nel carico **solo perche decise**.

## Regressione

`tests/lib/import-atleti-file-reale-adr-0195.test.mjs` costruisce in memoria
un foglio con la stessa struttura (A1:E200, 113 righe, 86 vuote in coda,
anno come testo, 5 senza anno, 2 ripetizioni, 13 etichette di cui 2 con
due sedi e 9 sconosciute) e pretende: 113 candidate e 86 vuote (il vecchio
lettore ne dava 199, riprodotto nel test), totali coerenti, anno mancante =
avviso correggibile, duplicati visibili con la riga di riferimento,
ambiguita senza scelta automatica, nessuna categoria nel carico senza
decisione.
