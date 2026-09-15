# D-RD-16 — Piano di bonifica delle righe storiche di `athlete_category_memberships`

> **Stato: PIANO. Non eseguito. Nessuna scrittura autorizzata.**
> Redatto il 2026-09-15 sulla copia del pilota nel branch Neon
> `web-redesign-staging` (`br-hidden-salad-alm93r7e`), in sola lettura.
> L'esecuzione — anche il solo dry-run che apre una transazione — richiede
> un'autorizzazione esplicita separata (CLAUDE.md §8, ADR-0185).

## 0. Perche e perche adesso

Un difetto gia corretto (N1: la proiezione `athletes.category_id` trattata come
sorgente e poi riscritta come riga vera) ha lasciato in
`athlete_category_memberships` righe con **l'etichetta al posto
dell'identificativo** (`category_id = "Pulcini - S. Cosma"`), quasi sempre
gemelle di una riga vera dello stesso atleta. Dal deploy di ADR-0185
(`2aa19b2`) il lettore le riconosce e non ne fa piu categorie fantasma ne
secondarie inventate: **l'applicazione e corretta con o senza la bonifica**.

La bonifica serve a tre cose che il lettore non puo fare: (1) togliere dal
database righe che ogni consumatore diretto della tabella (export, analitiche,
mobile) deve altrimenti saper ignorare; (2) rendere l'unicita
`(organization_id, athlete_id, category_id)` di nuovo significativa; (3) far
uscire dal codice, un giorno, la lettura per alias.

## 1. Perimetro

| | |
| --- | --- |
| Club | Fortitudo Scauri, `organization_id = 4139ddd1-459b-4d61-9c5c-254dd5d67e16` |
| Tabelle scritte | `athlete_category_memberships` (fase A), `athletes` (`category_id`, `category_name`, `data.categories`, `data.categoryMemberships`; fasi A e B) |
| Tabelle lette | `club_resource_items` (`resource_type = 'categories'`, il catalogo), `athletes` |
| Ambienti, in ordine | 1. `web-redesign-staging` (copia del pilota, prova generale) → 2. staging Fortitudo (Neon `production`, `easygame-staging`) **solo con una seconda autorizzazione** → 3. produzione: non esiste nello scope; se compare, fermarsi |
| Fuori perimetro | La seconda organizzazione omonima `ef5317db-8e49-4401-b452-b915db2376f0` (7 righe storiche): stesso piano, censimento suo, autorizzazione sua. Gli altri club: 0 righe |

## 2. Righe sorgente rilevate (esatte, al 2026-09-15)

Fonte: `scripts/censimento-appartenenze-legacy.mjs --club 4139ddd1-… --righe`
(sola lettura) piu le query di §8. La tabella riga per riga e in **Appendice A**
(identificativi, nessun nome di persona).

Totale **215** riferimenti: **213 righe** di `athlete_category_memberships` +
**2 valori** della colonna `athletes.category_id`.

| Etichetta trovata in `category_id` | Righe | Di cui primarie | Con `site_id` | Categoria vera | Risolta per |
| --- | ---: | ---: | ---: | --- | --- |
| Aquilotti | 34 | 0 | 0 | `category-1787322161361-2ugcyol` | nome corrente |
| Under 19 Regionale | 29 | 0 | 0 | `category-1787322586145-tnn8ibt` | nome corrente |
| Under 17 Gold | 27 | 0 | 0 | `category-1787322561179-qy7imoq` | nome corrente |
| Under 14 Gold | 25 | 0 | 0 | `category-1787322361009-svwqtal` | nome corrente |
| Scoiattoli S. Cosma | 22 | 0 | 0 | `category-1787321995353-gtepjl2` | **alias** (21 righe identificate portano ancora `category_name = "Scoiattoli S. Cosma"`; nome corrente «Scoiattoli») |
| Esordienti | 18 | 0 | 0 | `category-1787322218340-0h1e2r5` | nome corrente |
| Under 13 Silver | 16 | 0 | 0 | `category-1787322273552-y4sumd1` | nome corrente |
| Under 15 Gold | 16 | 0 | 0 | `category-1787322409918-2z7yagl` | **alias** (16 righe identificate; nome corrente «Under 15 Eccellenza») |
| DR3 | 15 | 0 | 0 | `category-1787322647496-0kaqst0` | nome corrente |
| Pulcini - S. Cosma | 9 | **1** | 0 | `category-1787321890187-j8liup8` | **alias** (8 righe identificate; nome corrente «Pulcini») |
| Pulcini | 1 | 0 | 0 | `category-1787321890187-j8liup8` | **contesto dell'atleta** (nome ambiguo: due «Pulcini»; l'atleta ne ha una sola, vedi R3) |
| Serie C | 1 | 0 | 0 | `category-1787322675613-r4f23mo` | nome corrente |
| *(colonna `athletes.category_id`)* Under 14 Gold | 1 | — | — | `category-1787322361009-svwqtal` | come la riga primaria dell'atleta |
| *(colonna `athletes.category_id`)* Pulcini - S. Cosma | 1 | — | — | `category-1787321890187-j8liup8` | come la riga primaria dell'atleta |

Classificazione del censimento: **DETERMINISTIC 215, AMBIGUOUS 0,
UNRESOLVABLE 0**. Una riga (`7fdcf885-…`, «Pulcini») e deterministica **solo
per sequenza**: si risolve dopo che la primaria dello stesso atleta
(`36bb34af-…`) e stata portata sull'identificativo. E l'unica riga per cui
il piano chiede una **conferma a mano** prima dell'esecuzione (§3, R3).

Fatti che semplificano il piano, verificati sui dati:

- nessuna riga storica porta `site_id` (0 su 213): non c'e una sede da fondere;
- nessun atleta ha due primarie; nessun atleta con righe e senza primaria;
- una sola riga storica e primaria (`36bb34af-…`) e **non** ha una gemella
  identificata: va aggiornata, non cancellata;
- 211 righe storiche hanno una gemella identificata dello stesso atleta con la
  stessa categoria vera: sono copie e vanno cancellate;
- il vincolo unico `(organization_id, athlete_id, category_id)` non puo
  scattare: le righe da aggiornare (1 + 1 dopo R3) non hanno gemella.

## 3. Regole di mappatura (deterministiche, nell'ordine)

Il catalogo e `club_resource_items` con `resource_type = 'categories'`,
`id = payload->>'id'`, `name = coalesce(payload->>'name', name)`. Il confronto
dei nomi e `lower(trim(…))` — la stessa normalizzazione di
`normalizeCategoryToken` (ADR-0155).

| Regola | Condizione | Esito |
| --- | --- | --- |
| **R1 — nome corrente** | l'etichetta e il nome corrente di **una sola** categoria del catalogo | quella categoria |
| **R2 — alias** | R1 non risolve (0 categorie) **e** l'etichetta e il `category_name` di righe **identificate** (`category_id` nel catalogo) di **una sola** categoria vera | quella categoria |
| **R3 — contesto dell'atleta** | R1 trova **piu** categorie (nome ambiguo) e, **dopo R1/R2 applicate alle altre righe dello stesso atleta**, l'atleta ha righe identificate per **una sola** di quelle categorie | quella categoria — e la riga si **segnala** nel dry-run per conferma a mano (1 riga sul pilota) |
| **R0 — altrimenti** | nessuna delle precedenti, oppure piu candidati | `REVIEW`: la riga **non si tocca**, il dry-run la elenca, l'esecuzione **si ferma** se ne trova una |

Azione per riga risolta:

| Azione | Condizione | Cosa si scrive |
| --- | --- | --- |
| **DELETE (gemella)** | l'atleta ha gia una riga identificata con la categoria vera | si cancella la riga storica. Prima, se la storica e primaria e la gemella no, si porta `is_primary = true` sulla gemella (0 casi sul pilota); se la storica ha `site_id` e la gemella no, si copia (0 casi) |
| **UPDATE** | l'atleta non ha quella categoria vera | `category_id = <id vero>`; `category_name` **resta com'e** (e l'alias di cui le altre gemelle hanno bisogno finche la bonifica non e finita, ADR-0185 §8); `is_primary` e `site_id` restano |
| **colonna `athletes`** | `athletes.category_id` non e nel catalogo | `category_id` e `category_name` = quelli della riga **primaria** dell'atleta dopo la fase A |

Ordine di esecuzione dentro la transazione: R1/R2 (UPDATE) → R3 (che ora
trova la gemella e diventa DELETE) → DELETE delle gemelle → colonne `athletes`.

## 4. Conteggi attesi

| Misura | Prima | Dopo fase A |
| --- | ---: | ---: |
| Righe `athlete_category_memberships` del club | 428 | **216** (428 − 212) |
| Righe con `category_id` non nel catalogo | 213 | **0** |
| Righe primarie | 213 | **213** (una per atleta con righe: invariato) |
| Atleti con righe | 213 | 213 |
| `athletes.category_id` non nel catalogo | 2 | **0** |
| Azioni | — | UPDATE 1 (`36bb34af-…` → `j8liup8`), DELETE 212 (211 gemelle + `7fdcf885-…` dopo R3), UPDATE `athletes` 2 |
| Output di `normalizeAthleteCategoryMemberships` per atleta | X | **identico a X** (il lettore gia collassa le gemelle: la bonifica non deve cambiare cio che l'app mostra) |

Fase B (proiezioni) e fase C (nomi stantii): vedi §10; non cambiano i conteggi
di fase A.

## 5. Idempotenza

- Ogni predicato seleziona **solo** righe con `category_id` fuori dal catalogo
  del club: una seconda esecuzione trova 0 righe e scrive 0 righe.
- Le azioni sono calcolate **dentro** la transazione dallo stato corrente, non
  da un elenco salvato: se qualcuno ha gia salvato la scheda di un atleta (che
  fonde la gemella, ADR-0185), quella riga semplicemente non c'e piu.
- La tabella di audit (§7) registra `run_id`, riga, azione, valori prima; una
  riga gia presente in audit con lo stesso `id` e `azione` non si riscrive.
- Il dry-run e ripetibile senza limiti: e una `SELECT`.

## 6. Strategia transazionale

- **Una transazione per club**, `READ COMMITTED`, `SET LOCAL statement_timeout = '60s'`,
  `SET LOCAL lock_timeout = '10s'`.
- **Blocco delle schede** secondo ADR-0138: `SELECT id FROM athletes WHERE id = ANY($ids) ORDER BY id FOR UPDATE` in **un lotto solo, crescente**, prima di toccare le righe figlie. `$ids` = gli atleti con almeno una riga storica (213) piu i 2 della colonna, deduplicati.
- Dentro la transazione, **prima** delle scritture: ricalcolo delle azioni (§3) e confronto con i conteggi attesi passati da riga di comando (`--attese update=1,delete=212,colonne=2`). Se non coincidono → `ROLLBACK` ed uscita con codice 2. Se esiste una riga `REVIEW` → `ROLLBACK`, codice 3.
- **Dopo** le scritture, sempre dentro la transazione: le query di validazione di §9 devono dare 0 / i conteggi attesi; altrimenti `ROLLBACK`, codice 4.
- `COMMIT` solo se tutto torna. Nessun `DELETE` senza `WHERE id = ANY(…)` esplicito calcolato nella stessa transazione.
- Lo script **non** passa dal client Prisma dell'app (`resources.ts` non e per le migrazioni) ma da `pg` con una connessione **diretta** (non pooler), come `scripts/db-guard.mjs` prevede per le scritture.

## 7. Backup e snapshot

Prima di ogni esecuzione reale, nell'ordine:

1. **Branch Neon** dal branch bersaglio, nominato `pre-drd16-<yyyymmdd>-<ambiente>` (per la prova generale: figlio di `web-redesign-staging`; per lo staging Fortitudo: figlio di `production`). E il ripristino di ultima istanza: si promuove o si legge.
2. **Estratto delle righe toccate**, prima della transazione, in
   `.codex-scratch/drd16/<run_id>/prima.json` (gitignorato): tutte le righe
   `athlete_category_memberships` del club (428) e le 215 sorgenti con ogni
   colonna, piu `athletes.category_id/category_name/data` dei 213 atleti.
3. **Tabella di audit nel database**, `bonifica_appartenenze_audit`
   (`run_id`, `organization_id`, `tabella`, `riga_id`, `azione`, `prima jsonb`,
   `dopo jsonb`, `eseguita_at`), scritta nella **stessa transazione**: se la
   bonifica torna indietro, torna indietro anche l'audit, e non resta un
   registro di cose mai successe. Creata dal migratore stesso (`CREATE TABLE IF
   NOT EXISTS`), non da Prisma: non e un modello dell'applicazione.

## 8. Dry-run

`node scripts/bonifica-appartenenze-legacy.mjs --club <id>` (da scrivere;
**non esiste ancora**) e in dry-run **per default**:

- apre solo `SELECT`; non `BEGIN`, non blocchi;
- stampa per ogni riga: `id`, `athlete_id`, etichetta, regola (R1/R2/R3/R0),
  categoria vera, azione, e per le R3 la dicitura `CONFERMA A MANO`;
- stampa i conteggi di §4 «prima» e quelli «dopo» attesi;
- scrive `.codex-scratch/drd16/<run_id>/piano.json` con lo stesso contenuto;
- esce con 0 se tutto e DETERMINISTIC, con 3 se c'e una `REVIEW`.

L'esecuzione richiede **tutte** queste condizioni: `--esegui`,
`--confermo <organization_id>` uguale a `--club`, `--attese …` uguale a cio che
il dry-run ha calcolato, la variabile `BONIFICA_APPARTENENZE_AUTORIZZATA=<run_id
del dry-run>`, `EASYGAME_DB_ENV` uguale all'ambiente dichiarato con
`--ambiente` (`web-redesign-staging` | `staging`), e la connection string passata
**esplicitamente** con `--url` (mai letta da `.env.local`, che punta al
redesign). Manca una condizione → non parte.

Query del dry-run (le stesse del censimento, in SQL, sola lettura):

```sql
-- catalogo del club
with cat as (
  select payload->>'id' as id, coalesce(payload->>'name', name) as name
  from club_resource_items
  where organization_id = $1 and resource_type = 'categories'
),
-- alias: nomi che le righe identificate portano ancora
alias as (
  select distinct lower(trim(category_name)) as nome, category_id
  from athlete_category_memberships
  where organization_id = $1 and category_id in (select id from cat)
),
leg as (
  select m.* from athlete_category_memberships m
  where m.organization_id = $1 and m.category_id not in (select id from cat)
)
select l.id, l.athlete_id, l.category_id as etichetta, l.is_primary, l.site_id,
  (select array_agg(distinct id) from cat
     where lower(trim(name)) = lower(trim(l.category_id)))            as per_nome,   -- R1
  (select array_agg(distinct category_id) from alias
     where nome = lower(trim(l.category_id)))                          as per_alias,  -- R2
  (select array_agg(t.category_id) from athlete_category_memberships t
     where t.athlete_id = l.athlete_id and t.organization_id = l.organization_id
       and t.category_id in (select id from cat))                      as identificate_atleta -- R3 / gemella
from leg l
order by l.category_id, l.athlete_id;
```

## 9. Query di validazione (prima, dentro la transazione, dopo)

```sql
-- V1: righe fuori catalogo — atteso 213 prima, 0 dopo
select count(*) from athlete_category_memberships m
where m.organization_id = $1
  and not exists (select 1 from club_resource_items c
                  where c.organization_id = m.organization_id
                    and c.resource_type = 'categories'
                    and c.payload->>'id' = m.category_id);

-- V2: totale righe — atteso 428 prima, 216 dopo
select count(*) from athlete_category_memberships where organization_id = $1;

-- V3: primarie — atteso 213 prima e dopo; nessun atleta con 0 o 2
select count(*) filter (where is_primary) from athlete_category_memberships where organization_id = $1;
select athlete_id, count(*) filter (where is_primary) as p
from athlete_category_memberships where organization_id = $1
group by 1 having count(*) filter (where is_primary) <> 1;   -- atteso: nessuna riga

-- V4: colonna athletes — atteso 2 prima, 0 dopo
select count(*) from athletes a where a.organization_id = $1 and a.category_id is not null
  and not exists (select 1 from club_resource_items c
                  where c.organization_id = a.organization_id and c.resource_type = 'categories'
                    and c.payload->>'id' = a.category_id);

-- V5: la colonna dice la primaria — atteso 0 dopo
select count(*) from athletes a join athlete_category_memberships m
  on m.athlete_id = a.id and m.is_primary
where a.organization_id = $1 and a.category_id is distinct from m.category_id;

-- V6: nessuna riga toccata fuori dal club — atteso 0 sempre
select count(*) from bonifica_appartenenze_audit where run_id = $2 and organization_id <> $1;
```

## 10. Rollback

- **Entro la transazione**: qualunque scostamento → `ROLLBACK` (§6). Nessuno
  stato intermedio e mai visibile.
- **Dopo il `COMMIT`**, per riga: dall'audit — `INSERT` delle righe cancellate
  con gli **stessi** `id`, `created_at`, `updated_at`, `site_id`, `is_primary`
  (`prima jsonb`), `UPDATE` inverso delle aggiornate, ripristino di
  `athletes.category_id/category_name/data` dal `prima`. Script
  `--annulla <run_id>`, anch'esso in una transazione con gli stessi blocchi.
- **Di ultima istanza**: il branch Neon `pre-drd16-…` (§7.1).
- L'applicazione legge correttamente **entrambi** gli stati (ADR-0185): un
  rollback non e un'emergenza per l'utente, e un ritorno a righe che il
  lettore gia sa ignorare.

## 11. Controlli di parita dopo la migrazione

1. `scripts/censimento-appartenenze-legacy.mjs --club <id>` → **0** riferimenti.
2. **Parita del lettore**: prima e dopo, per ogni atleta del club, l'output di
   `normalizeAthleteCategoryMemberships(athlete, catalogo)` serializzato
   (`categoryId`, `isPrimary`, `siteId`, ordinato) — i due file **devono
   essere identici**. Se differiscono, la bonifica ha cambiato cio che l'app
   mostra, e va capito prima di dichiararla riuscita. (Unica differenza
   ammessa: `storedCategoryName`, che sulle gemelle cancellate sparisce.)
3. **Parita delle etichette**: `buildCategoryDisplayIndex` + `buildClubCategoryOptions`
   sui dati bonificati danno le stesse opzioni (17) e le stesse etichette
   (`Pulcini · S. Cosma`, `Pulcini · Scauri`, `Scoiattoli · …`) di prima.
4. **Schermate** sul redesign staging con l'account di prova: scheda atleta,
   elenco atleti (intestazioni di gruppo), area allenatore, area famiglia di
   un atleta della bonifica — nessun identificativo a schermo, nessun fantasma,
   nessuna secondaria non dichiarata.
5. **Suite**: `npm test` verde (i test sui dati del pilota usano fixture, non
   il database: restano validi).

Poi, come passi **separati e a loro volta autorizzati**:

- **Fase B — proiezioni**: `athletes.data.categories` (213 atleti, 429 voci
  con etichette) e `athletes.data.categoryMemberships` (213 atleti con
  l'etichetta in `categoryId`) si rigenerano **dalle righe** dopo la fase A.
  Sono proiezioni (ADR-0185 §8): finche restano stantie non governano niente,
  ma un consumatore diretto le leggerebbe sbagliate.
- **Fase C — nomi stantii**: 45 righe identificate portano `category_name`
  diverso dal nome corrente (`Scoiattoli S. Cosma` ×21, `Under 15 Gold` ×16,
  `Pulcini - S. Cosma` ×8). Vanno allineate **solo dopo** la fase A: sono
  l'alias con cui R2 risolve le gemelle. Farlo prima renderebbe 47 righe
  `UNRESOLVABLE`.

## 12. Cosa manca prima di poter eseguire

- [ ] Scrivere `scripts/bonifica-appartenenze-legacy.mjs` (dry-run default,
      guardie di §8, audit di §7, annullamento di §10) e i suoi test su
      fixture (`tests/scripts/…`): la regola R3 e il calcolo delle attese vanno
      provati senza database.
- [ ] Autorizzazione esplicita per la **prova generale** su
      `web-redesign-staging` (branch Neon di sicurezza incluso).
- [ ] Conferma a mano della riga `7fdcf885-…` (R3).
- [ ] Rapporto della prova generale (conteggi §4, validazioni §9, parita §11).
- [ ] Autorizzazione esplicita **separata** per lo staging Fortitudo.

---

## Appendice A — Le 215 righe sorgente (identificativi; nessun nome di persona)

| Riga | Atleta | Etichetta trovata | Primaria | Categoria vera | Regola | Azione |
| --- | --- | --- | --- | --- | --- | --- |
| `51e8825e-308b-4809-8372-1671e47b0893` | `08ee91fb-585a-4881-8bd4-1ba79d5233af` | Aquilotti | no | `category-1787322161361-2ugcyol` | R1 | DELETE (gemella) |
| `2ba12f6e-d6a7-429b-96a9-4a8f6b31f8ff` | `0cd49836-9bd1-475b-a199-3dfeb1b9fd42` | Aquilotti | no | `category-1787322161361-2ugcyol` | R1 | DELETE (gemella) |
| `c2d4eec2-d53a-4b77-8021-f088ed95aeb1` | `347299ac-1575-435d-aa4a-c6ef4b1315df` | Aquilotti | no | `category-1787322161361-2ugcyol` | R1 | DELETE (gemella) |
| `0aaef326-6cf5-441f-8fd5-44c55465c142` | `35ed3e85-f7c2-433c-bf83-aa3accc7c552` | Aquilotti | no | `category-1787322161361-2ugcyol` | R1 | DELETE (gemella) |
| `f7a3ab7f-0382-4b34-ad33-fcee836b2117` | `4296b610-ca3b-4d95-8fec-08d18efe9d49` | Aquilotti | no | `category-1787322161361-2ugcyol` | R1 | DELETE (gemella) |
| `401be8a7-04a1-4979-aba5-d5a2c3a6e979` | `4594d9cf-7c87-4724-a71f-20b97f5e1fe6` | Aquilotti | no | `category-1787322161361-2ugcyol` | R1 | DELETE (gemella) |
| `340a4b69-a88c-4309-9263-cc458b57f89c` | `48d7033f-5d20-4d7e-88e0-a67211c2838b` | Aquilotti | no | `category-1787322161361-2ugcyol` | R1 | DELETE (gemella) |
| `bbd2bb35-e9af-42bd-bacf-a830cc765dbf` | `4b50cee9-96e8-49ff-a19d-7faf1571f0a7` | Aquilotti | no | `category-1787322161361-2ugcyol` | R1 | DELETE (gemella) |
| `c41c158c-ed60-44f3-9a8d-4f99ed395aa4` | `4c9bcd2d-138b-4f16-af6d-73e3a67fb612` | Aquilotti | no | `category-1787322161361-2ugcyol` | R1 | DELETE (gemella) |
| `eb773d2a-291d-4d49-ab76-a8db4a5be83d` | `50f49af9-5884-4209-b0c5-cdf76ff6ee39` | Aquilotti | no | `category-1787322161361-2ugcyol` | R1 | DELETE (gemella) |
| `f9ddefd7-f27a-4f2e-9264-676a16e00752` | `646848b7-5cdb-43b0-b697-9475802bba49` | Aquilotti | no | `category-1787322161361-2ugcyol` | R1 | DELETE (gemella) |
| `ef853a36-043c-4251-bccd-316ed8a62d1a` | `70e797cd-c153-4be0-88e2-8917978287ac` | Aquilotti | no | `category-1787322161361-2ugcyol` | R1 | DELETE (gemella) |
| `778d7001-f527-46d2-bb1f-7e5114232b55` | `711dc426-d99e-4f42-83b3-d6f66ba6e803` | Aquilotti | no | `category-1787322161361-2ugcyol` | R1 | DELETE (gemella) |
| `3e7a7c66-941d-4c32-9ae5-8f7d294b8257` | `71fc0254-c61e-416d-90ed-a9becfc651cb` | Aquilotti | no | `category-1787322161361-2ugcyol` | R1 | DELETE (gemella) |
| `43dd55d2-caf5-4975-9f2a-55327be0d0e9` | `7329b4ad-3314-4963-b769-1bf532a11dcd` | Aquilotti | no | `category-1787322161361-2ugcyol` | R1 | DELETE (gemella) |
| `5b04e4fc-1cb9-4ea3-b624-f5bebadeb78a` | `79464f5d-7a05-4781-955b-15720f73fca8` | Aquilotti | no | `category-1787322161361-2ugcyol` | R1 | DELETE (gemella) |
| `e394dd73-9e05-4dee-b321-e58cacd9cbb2` | `7c602497-efa0-445d-a740-992d642d84d9` | Aquilotti | no | `category-1787322161361-2ugcyol` | R1 | DELETE (gemella) |
| `2f4a064f-3230-442d-b325-462ca1a7dba5` | `8bcfc452-0f47-442c-9496-aed729454b27` | Aquilotti | no | `category-1787322161361-2ugcyol` | R1 | DELETE (gemella) |
| `81b86337-fa15-46a6-97cc-6583b767271e` | `90668dce-a65e-4779-a372-ad3a251d36e1` | Aquilotti | no | `category-1787322161361-2ugcyol` | R1 | DELETE (gemella) |
| `e78882eb-f89b-4d67-a155-92ae7ea5ac0e` | `98237bdd-50dd-4bd4-adb0-4d0e4d2e3337` | Aquilotti | no | `category-1787322161361-2ugcyol` | R1 | DELETE (gemella) |
| `7bd85f07-2984-49a8-954e-928732ff3270` | `9c7f7cd0-d62d-4f35-b8ae-5cc96378d111` | Aquilotti | no | `category-1787322161361-2ugcyol` | R1 | DELETE (gemella) |
| `edd0519c-b4b6-4f88-bfdf-edcfdaf962a8` | `a2f4981f-f1ad-49c3-814c-d431e1a087bf` | Aquilotti | no | `category-1787322161361-2ugcyol` | R1 | DELETE (gemella) |
| `9d0bd489-3661-42b2-a34f-d4014af66391` | `ab64a720-b174-409a-bdb3-24f0adf341f5` | Aquilotti | no | `category-1787322161361-2ugcyol` | R1 | DELETE (gemella) |
| `d2eed10a-c288-4b6a-bcf0-b589ec61fc52` | `af0ddd5a-4256-47d2-b6f5-4969614ed542` | Aquilotti | no | `category-1787322161361-2ugcyol` | R1 | DELETE (gemella) |
| `536ea707-4644-4af0-94b3-8a10cfb5f779` | `b288d6a3-1ee6-4205-bf56-ba9f042f671e` | Aquilotti | no | `category-1787322161361-2ugcyol` | R1 | DELETE (gemella) |
| `451e4a77-e12c-4540-aab8-c3e75aa08064` | `b694469d-b3a2-47a3-ab52-64c5a858bf18` | Aquilotti | no | `category-1787322161361-2ugcyol` | R1 | DELETE (gemella) |
| `38f7df98-f405-4052-a331-9892dccebc35` | `bec7a85f-9b2b-4f86-9109-42e2ea3c4685` | Aquilotti | no | `category-1787322161361-2ugcyol` | R1 | DELETE (gemella) |
| `6d673ab2-3c81-4160-a599-33377ec8e438` | `d20652e3-bfd4-4d02-899f-67b11db81ae9` | Aquilotti | no | `category-1787322161361-2ugcyol` | R1 | DELETE (gemella) |
| `c0a89a44-b5d0-49a8-abd7-e4fe2a231a96` | `d2ba2c68-4199-4a49-b4d0-72f4e36dc8ce` | Aquilotti | no | `category-1787322161361-2ugcyol` | R1 | DELETE (gemella) |
| `aeab1ebb-76e5-481a-9319-1c84e5e9460e` | `da3e1b5e-3c72-4121-b69b-c38b2fb08ee6` | Aquilotti | no | `category-1787322161361-2ugcyol` | R1 | DELETE (gemella) |
| `f373e28e-926a-45de-955e-2381b4430e86` | `debe8cb0-5e04-483e-a292-864753ef7858` | Aquilotti | no | `category-1787322161361-2ugcyol` | R1 | DELETE (gemella) |
| `cf69ae12-9679-4f98-8b49-d7cd11090b5c` | `e7f7e331-0923-4cae-8b40-0659d391a2b8` | Aquilotti | no | `category-1787322161361-2ugcyol` | R1 | DELETE (gemella) |
| `87edd135-fb30-4598-8087-a9212c70b891` | `f6c6f425-baf3-4c73-9c12-de5619ebec27` | Aquilotti | no | `category-1787322161361-2ugcyol` | R1 | DELETE (gemella) |
| `ceb1380b-d145-48f9-86bd-6bc652590eb9` | `f810fcd5-37d8-4cb5-9ccd-54d28020a1cc` | Aquilotti | no | `category-1787322161361-2ugcyol` | R1 | DELETE (gemella) |
| `111b51e2-6c7c-4d22-83fb-949b65d0d7d5` | `0f4cad1b-5fd4-4e0c-a48f-8783bdb2d967` | DR3 | no | `category-1787322647496-0kaqst0` | R1 | DELETE (gemella) |
| `b2774005-2b77-4e83-82cd-75c486f61e03` | `21f54686-eee2-4b54-a241-b5b5dc5e1fa8` | DR3 | no | `category-1787322647496-0kaqst0` | R1 | DELETE (gemella) |
| `2798d71f-b4f7-4c41-a49d-f5a7d11c6d3b` | `242af137-d3bc-442e-9266-c371e7f48f22` | DR3 | no | `category-1787322647496-0kaqst0` | R1 | DELETE (gemella) |
| `168ecbf5-23f0-4db0-8d7f-f79a654d168e` | `356bfecf-b201-40e6-9fb0-b14da91aefaf` | DR3 | no | `category-1787322647496-0kaqst0` | R1 | DELETE (gemella) |
| `20364559-4a7c-4782-b5bd-72a5579efd02` | `4136c7e2-84e4-40cb-8fe8-48cf73b324bb` | DR3 | no | `category-1787322647496-0kaqst0` | R1 | DELETE (gemella) |
| `43c59558-7286-4347-be93-59923d0d729e` | `4ee00f9a-97d6-44e6-a52a-dfde34a9adc0` | DR3 | no | `category-1787322647496-0kaqst0` | R1 | DELETE (gemella) |
| `c4be7bf6-a47d-4cad-a9df-88f6f8f4cdaf` | `57eb81e7-d22d-4106-afb6-05eac1b20329` | DR3 | no | `category-1787322647496-0kaqst0` | R1 | DELETE (gemella) |
| `1b4719e4-2c4b-4021-a722-68e314cb754d` | `7f3313dc-6a83-4328-b719-cf6ff973bfc3` | DR3 | no | `category-1787322647496-0kaqst0` | R1 | DELETE (gemella) |
| `e906133f-333e-4ef4-94dd-31ebc92bef99` | `a7b2d75a-0f6f-4f88-b653-6448a120aefe` | DR3 | no | `category-1787322647496-0kaqst0` | R1 | DELETE (gemella) |
| `3ff41b71-1c66-4a4d-9795-78ea43c37a0e` | `b144e57b-3ebe-4ee2-8e1e-a3296f50437b` | DR3 | no | `category-1787322647496-0kaqst0` | R1 | DELETE (gemella) |
| `aec93501-edc8-4782-9986-ff45e6323e47` | `bebd9468-f562-409a-abbb-d30e355ae31f` | DR3 | no | `category-1787322647496-0kaqst0` | R1 | DELETE (gemella) |
| `53e1bb22-9c55-4261-a6ec-df19f68aeef7` | `d0496850-c6ec-4d34-9818-b6995fbcda85` | DR3 | no | `category-1787322647496-0kaqst0` | R1 | DELETE (gemella) |
| `fbdc0355-b6c0-41f0-8167-438676f0e475` | `d941b091-cc8a-4e6f-bcca-11dfefc70746` | DR3 | no | `category-1787322647496-0kaqst0` | R1 | DELETE (gemella) |
| `3fb83b39-2dec-47e3-901d-40602d67a0fd` | `e03eb092-3399-4f4e-ab59-6809acc70123` | DR3 | no | `category-1787322647496-0kaqst0` | R1 | DELETE (gemella) |
| `178f4fee-893e-495e-8092-4d9cac333bd1` | `f7ef651d-efb8-4d3b-82c9-01b67bc46522` | DR3 | no | `category-1787322647496-0kaqst0` | R1 | DELETE (gemella) |
| `06998fb4-3197-4a3a-8da6-2bda1f5772f2` | `0a88e71b-f810-44cd-a939-8f36e55c37f3` | Esordienti | no | `category-1787322218340-0h1e2r5` | R1 | DELETE (gemella) |
| `6a0011d3-9bb7-442a-93c4-8cd667dd8af7` | `1091bf29-3fb0-483e-b78f-0f13a516f0b1` | Esordienti | no | `category-1787322218340-0h1e2r5` | R1 | DELETE (gemella) |
| `9a14d932-fef4-4741-8c30-91c12b4c27ff` | `15142004-4c86-48f4-9eb9-99a378c4afd3` | Esordienti | no | `category-1787322218340-0h1e2r5` | R1 | DELETE (gemella) |
| `a295879b-e687-4fd8-88e6-06c9ed7039f8` | `3022d39e-043e-4ee9-a50d-56e941007668` | Esordienti | no | `category-1787322218340-0h1e2r5` | R1 | DELETE (gemella) |
| `6239272a-f2ba-4ab9-b4ad-5691600d0b03` | `34dbea0a-a5e3-4ad8-966c-aae8047c3e0e` | Esordienti | no | `category-1787322218340-0h1e2r5` | R1 | DELETE (gemella) |
| `4eb6ee44-e8b6-4490-93fa-c653f6cd6e32` | `40fde4a1-cd18-4ee3-820e-46cbfeb06744` | Esordienti | no | `category-1787322218340-0h1e2r5` | R1 | DELETE (gemella) |
| `d55f57a1-8b34-49f1-8a1a-c4223ab32d9c` | `4e1c77ae-dc19-4796-b6b1-f4eb0be9f2ec` | Esordienti | no | `category-1787322218340-0h1e2r5` | R1 | DELETE (gemella) |
| `a399bbee-c481-4ae2-a46c-ffddbcd8a068` | `64624115-a8b0-4ae5-a4df-bd6e5c04f527` | Esordienti | no | `category-1787322218340-0h1e2r5` | R1 | DELETE (gemella) |
| `169aad59-2301-470f-9d1f-eb9bdcecbad1` | `68148000-8962-4d7d-b023-6c03b3c0d388` | Esordienti | no | `category-1787322218340-0h1e2r5` | R1 | DELETE (gemella) |
| `982cd737-222a-4538-a788-54c46bf8de53` | `6d4346b7-5ae8-47e4-9b60-b499d66a85a2` | Esordienti | no | `category-1787322218340-0h1e2r5` | R1 | DELETE (gemella) |
| `14ebb72e-c010-4a73-8f73-d61c39d24ea2` | `71fc0254-c61e-416d-90ed-a9becfc651cb` | Esordienti | no | `category-1787322218340-0h1e2r5` | R1 | DELETE (gemella) |
| `9343b184-b7b7-426d-935d-178ea893d809` | `8701b6fd-c130-47d1-9b02-aa392bb47512` | Esordienti | no | `category-1787322218340-0h1e2r5` | R1 | DELETE (gemella) |
| `37f9e8a9-af9a-4f99-a2e4-333be09f7288` | `8fcaac1e-b368-43bf-ab82-aacd15da5ae8` | Esordienti | no | `category-1787322218340-0h1e2r5` | R1 | DELETE (gemella) |
| `e808097a-2293-4314-8a0a-25b3d5b5315f` | `9594659d-19ef-4688-993e-cbdb937896aa` | Esordienti | no | `category-1787322218340-0h1e2r5` | R1 | DELETE (gemella) |
| `e9007c19-63a4-41d7-b3e4-8bb9b83db84d` | `c08273f0-5832-4158-a471-79830c4945cb` | Esordienti | no | `category-1787322218340-0h1e2r5` | R1 | DELETE (gemella) |
| `09695c22-d1b6-43cf-bce9-257fdaf66dcf` | `c99bb4c5-2232-440a-ab22-e2d955f801ec` | Esordienti | no | `category-1787322218340-0h1e2r5` | R1 | DELETE (gemella) |
| `48a080da-8eb3-48a4-8e65-3aa0be88a45b` | `d2d86551-9749-4877-842a-21b67f580fbe` | Esordienti | no | `category-1787322218340-0h1e2r5` | R1 | DELETE (gemella) |
| `ff7142fd-795a-4041-8021-92b878681b01` | `e8ecfb18-9e71-4a24-a6b2-4dff6fe934b1` | Esordienti | no | `category-1787322218340-0h1e2r5` | R1 | DELETE (gemella) |
| `7fdcf885-3429-48da-8f9d-94bd2ffe3fe5` | `2947d805-df94-43fd-94a6-4920489339ef` | Pulcini | no | `category-1787321890187-j8liup8` | R3 — nome ambiguo (`j8liup8`, `mbawy4c`); dopo l'UPDATE di `36bb34af-…` l'atleta ha solo `j8liup8`. **CONFERMA A MANO** | DELETE (gemella, dopo R1/R2) |
| `9f214bf7-fdb2-4637-ae19-b1c367a39237` | `06b782bc-9ffb-4050-b003-b89ba1edd266` | Pulcini - S. Cosma | no | `category-1787321890187-j8liup8` | R2 | DELETE (gemella) |
| `36bb34af-a98e-43ef-b117-e81c0df9dfb3` | `2947d805-df94-43fd-94a6-4920489339ef` | Pulcini - S. Cosma | sì | `category-1787321890187-j8liup8` | R2 — alias | UPDATE category_id |
| `9e15b701-044a-4249-b556-7b1819f129a2` | `2ed81e7e-978b-4f7a-8905-901337691e21` | Pulcini - S. Cosma | no | `category-1787321890187-j8liup8` | R2 | DELETE (gemella) |
| `4ba5e720-aee8-46cc-a9ce-f6a658d9fc10` | `87d5465c-9a89-40cb-a81e-bb8a9d1c5627` | Pulcini - S. Cosma | no | `category-1787321890187-j8liup8` | R2 | DELETE (gemella) |
| `c613732d-c8cc-4e7d-b3ce-8dd0f06f011c` | `a4f2ebd2-9e38-49e9-baa2-f018a8f5dd33` | Pulcini - S. Cosma | no | `category-1787321890187-j8liup8` | R2 | DELETE (gemella) |
| `9aebaaca-21cf-4410-bbc1-4b19484e6d54` | `b6d12b96-2243-4215-abc3-2b7ff42c920a` | Pulcini - S. Cosma | no | `category-1787321890187-j8liup8` | R2 | DELETE (gemella) |
| `2a242c17-0e3b-4ef9-800b-df0529a0ffd3` | `cd304bb1-09da-475e-9a0d-cc2dff4ce5da` | Pulcini - S. Cosma | no | `category-1787321890187-j8liup8` | R2 | DELETE (gemella) |
| `6e4a25e4-87f0-4987-adec-2d2697c04902` | `e79152f1-727e-4f3c-ba3a-c45d5dcace6e` | Pulcini - S. Cosma | no | `category-1787321890187-j8liup8` | R2 | DELETE (gemella) |
| `0e66b7e4-ebca-46e2-b716-e2c114b04ab0` | `f9da6510-8f7d-463e-9746-171261f74735` | Pulcini - S. Cosma | no | `category-1787321890187-j8liup8` | R2 | DELETE (gemella) |
| `f5b9b43e-8dc5-4690-be30-9c5de9fdcb7b` | `2119b3bc-0221-4c9f-843d-e5802bbd57d6` | Scoiattoli S. Cosma | no | `category-1787321995353-gtepjl2` | R2 | DELETE (gemella) |
| `bc650c08-6eb6-404b-8581-8caf48a9e210` | `3a809251-5c35-4524-acc0-2db5f096725e` | Scoiattoli S. Cosma | no | `category-1787321995353-gtepjl2` | R2 | DELETE (gemella) |
| `3e5baa63-be62-4602-8b39-c73768a389a4` | `3e3f7443-8908-4ab9-949a-3cb139958ca1` | Scoiattoli S. Cosma | no | `category-1787321995353-gtepjl2` | R2 | DELETE (gemella) |
| `d87eba87-58b7-4c92-b9ac-f4117c6e9c32` | `49db2f06-1a42-4f02-a5f5-7e318b0cfd78` | Scoiattoli S. Cosma | no | `category-1787321995353-gtepjl2` | R2 | DELETE (gemella) |
| `22758be1-d6ba-4f8d-be3e-16965f2ca8e9` | `4e5b6a01-a6e9-49ee-856b-689a13567516` | Scoiattoli S. Cosma | no | `category-1787321995353-gtepjl2` | R2 | DELETE (gemella) |
| `4be7b6c6-e988-46e5-8a44-f0caa816d02b` | `51b8d308-a207-4692-b6be-82938b1d6bb3` | Scoiattoli S. Cosma | no | `category-1787321995353-gtepjl2` | R2 | DELETE (gemella) |
| `65aa64f9-aae9-45b8-82f3-55c3b613902d` | `682effec-a28a-45c6-b7dc-3821cec78f1a` | Scoiattoli S. Cosma | no | `category-1787321995353-gtepjl2` | R2 | DELETE (gemella) |
| `c275ad28-03fb-4b04-bdfc-4f122f1c5c09` | `69b5eede-9eb6-4dbd-9b7e-a4801e1f5da8` | Scoiattoli S. Cosma | no | `category-1787321995353-gtepjl2` | R2 | DELETE (gemella) |
| `50f1b7e9-8d75-4aff-bb74-e2872cd03565` | `6a075af0-5f79-41b3-99a4-e9a069fd48ef` | Scoiattoli S. Cosma | no | `category-1787321995353-gtepjl2` | R2 | DELETE (gemella) |
| `52431c1d-d857-4d83-a3b0-da1b741e4262` | `72223619-71cf-4efb-be4f-d40e62c9eb19` | Scoiattoli S. Cosma | no | `category-1787321995353-gtepjl2` | R2 | DELETE (gemella) |
| `c6f524a5-b456-4ef6-b8fa-1ef9fbadc579` | `7a015af7-03c3-47d3-8ebf-e45fbfb5584a` | Scoiattoli S. Cosma | no | `category-1787321995353-gtepjl2` | R2 | DELETE (gemella) |
| `f2b5ccc2-e0dd-4d52-b510-dded59c36ddd` | `84448396-a926-4aa6-9cec-e5f2c7b88a58` | Scoiattoli S. Cosma | no | `category-1787321995353-gtepjl2` | R2 | DELETE (gemella) |
| `be21e10a-f600-4d28-9a20-7be61a028527` | `97e2331f-45be-4ffe-aa1a-4b77d62618fe` | Scoiattoli S. Cosma | no | `category-1787321995353-gtepjl2` | R2 | DELETE (gemella) |
| `ef82783e-8771-47b9-8bdb-c50801d99169` | `a2030884-3eaf-4e2a-829c-80c9c6cf1b15` | Scoiattoli S. Cosma | no | `category-1787321995353-gtepjl2` | R2 | DELETE (gemella) |
| `a2d7566c-f489-4030-b2d5-92b490433645` | `a932b399-286f-4209-90bb-cd698a956105` | Scoiattoli S. Cosma | no | `category-1787321995353-gtepjl2` | R2 | DELETE (gemella) |
| `b4256874-3c15-4598-b3e2-d0e48975901f` | `a9c74c27-1ca5-4f49-b77c-daed98a6a542` | Scoiattoli S. Cosma | no | `category-1787321995353-gtepjl2` | R2 | DELETE (gemella) |
| `18be898a-d103-465a-bf27-91d2f39d0902` | `bd0f57c8-6c4f-43c1-8657-8f86fe7826d6` | Scoiattoli S. Cosma | no | `category-1787321995353-gtepjl2` | R2 | DELETE (gemella) |
| `05b7051d-6289-4394-be3a-bbebb42e7d08` | `c5ef8f81-ac66-47da-b594-65197ff2f186` | Scoiattoli S. Cosma | no | `category-1787321995353-gtepjl2` | R2 | DELETE (gemella) |
| `9194be80-9f87-4a62-8b1f-0f278552891c` | `cdb031cc-6f98-444b-b250-5fc9bbdb94d3` | Scoiattoli S. Cosma | no | `category-1787321995353-gtepjl2` | R2 | DELETE (gemella) |
| `cf66f630-6691-4ad9-a267-b51c1e99986c` | `e919e5e5-3e08-4659-94c1-6976965362cc` | Scoiattoli S. Cosma | no | `category-1787321995353-gtepjl2` | R2 | DELETE (gemella) |
| `d85d660f-f2b2-470e-92ee-e885e279be42` | `eef88d0f-aed2-4eb2-8235-9f4290d5df2e` | Scoiattoli S. Cosma | no | `category-1787321995353-gtepjl2` | R2 | DELETE (gemella) |
| `514696a3-a58c-45cd-a64e-500e4b2589c0` | `f7ebea42-d8af-411b-b569-9a72c7118998` | Scoiattoli S. Cosma | no | `category-1787321995353-gtepjl2` | R2 | DELETE (gemella) |
| `49b3a557-b177-4ada-81d5-d5fe81b06af9` | `13d3937e-ddb6-4435-814f-0071a74b7270` | Serie C | no | `category-1787322675613-r4f23mo` | R1 | DELETE (gemella) |
| `09fc2142-f436-458a-aefd-2844b27b57f6` | `10095948-897b-410c-8810-62da4016acd4` | Under 13 Silver | no | `category-1787322273552-y4sumd1` | R1 | DELETE (gemella) |
| `ca255aed-2254-4c0a-a18c-4e62bda7bae6` | `18b72031-cffa-4161-8e28-72ca901d8da9` | Under 13 Silver | no | `category-1787322273552-y4sumd1` | R1 | DELETE (gemella) |
| `ee643f6c-9c33-47cd-9f9f-005a67d22e3b` | `1d3c8dd4-60b1-4de8-8a6f-3634bf6d8311` | Under 13 Silver | no | `category-1787322273552-y4sumd1` | R1 | DELETE (gemella) |
| `2a558170-d490-4af8-9241-f6e4d894ed6c` | `4227dbaa-033a-445d-a57d-5dcf73554ffd` | Under 13 Silver | no | `category-1787322273552-y4sumd1` | R1 | DELETE (gemella) |
| `3137909d-9aa5-430c-9b64-3efbeec8c8f9` | `6cc52793-57de-489b-abe1-d903c559068b` | Under 13 Silver | no | `category-1787322273552-y4sumd1` | R1 | DELETE (gemella) |
| `1f2152d1-3290-490c-94dd-a9506bc7c785` | `739f3c81-53bc-49c4-9b44-0b5086f76f3f` | Under 13 Silver | no | `category-1787322273552-y4sumd1` | R1 | DELETE (gemella) |
| `ff3d44e4-9d50-48d0-984f-a7f162dfa709` | `8443f82b-e315-4105-aa2a-215ce5a35eb1` | Under 13 Silver | no | `category-1787322273552-y4sumd1` | R1 | DELETE (gemella) |
| `43ef2c6a-4f90-4845-92d3-6128fec820ea` | `868f0f6e-8f74-4ce0-9de8-333dd2e81d30` | Under 13 Silver | no | `category-1787322273552-y4sumd1` | R1 | DELETE (gemella) |
| `7889cb7d-ad4c-413b-9012-9b6b77d7beaa` | `8e6dbd1f-264a-4d96-81af-333b1aa6437b` | Under 13 Silver | no | `category-1787322273552-y4sumd1` | R1 | DELETE (gemella) |
| `c2ec3eea-bfd0-4742-b182-62b5e037ab86` | `8f1c3961-7aa4-4a72-9d6a-8f5fc8e62843` | Under 13 Silver | no | `category-1787322273552-y4sumd1` | R1 | DELETE (gemella) |
| `3e0c3522-ba5f-4c39-8a29-fda40e4b47eb` | `9d9f4e65-3170-4a13-88fc-4c88de17069e` | Under 13 Silver | no | `category-1787322273552-y4sumd1` | R1 | DELETE (gemella) |
| `5921fed1-1c66-4ecc-a9f8-2e3464306cff` | `b54f7114-b591-45c9-b0fc-cad931d4c16d` | Under 13 Silver | no | `category-1787322273552-y4sumd1` | R1 | DELETE (gemella) |
| `8cd7b119-d25f-4a26-91c8-b334a0c4e27a` | `b94fa49a-0b21-4e32-b4fb-9eae53e14943` | Under 13 Silver | no | `category-1787322273552-y4sumd1` | R1 | DELETE (gemella) |
| `9a900413-2dd9-4494-9f61-13c482430b6a` | `db4c4884-7c65-448b-ac4b-e50c07ea8079` | Under 13 Silver | no | `category-1787322273552-y4sumd1` | R1 | DELETE (gemella) |
| `84351a31-a892-4b24-9f9f-bc39f1cf1b56` | `dc6e64e8-bc75-4994-91c8-9dbda8a4b325` | Under 13 Silver | no | `category-1787322273552-y4sumd1` | R1 | DELETE (gemella) |
| `b8065d9b-0357-4137-9f8b-7f3de34aacf6` | `face1270-781c-4386-960f-0a44ec2ab9da` | Under 13 Silver | no | `category-1787322273552-y4sumd1` | R1 | DELETE (gemella) |
| `328cb28f-3295-4561-a7c5-16ea4bf8849d` | `0cf6c7d5-3177-447f-a531-68bc7a22cff1` | Under 14 Gold | no | `category-1787322361009-svwqtal` | R1 | DELETE (gemella) |
| `ca231dd0-6fa1-495e-a0fa-1956302de362` | `12304dd9-42c7-444b-b093-fc41b1ff3609` | Under 14 Gold | no | `category-1787322361009-svwqtal` | R1 | DELETE (gemella) |
| `3bba0a77-98c1-4060-b1fe-4d884e4d860d` | `3048a707-695b-4047-b416-970d7b72074c` | Under 14 Gold | no | `category-1787322361009-svwqtal` | R1 | DELETE (gemella) |
| `9a8612f7-a75e-4263-94f2-73ea2c773e52` | `318bb645-95b1-4a62-a8f8-c9760cd003b5` | Under 14 Gold | no | `category-1787322361009-svwqtal` | R1 | DELETE (gemella) |
| `c36cd6e5-2352-445f-93b0-838c474e5096` | `3b6f118b-721e-407e-af66-3ceba9710690` | Under 14 Gold | no | `category-1787322361009-svwqtal` | R1 | DELETE (gemella) |
| `0c676c6a-35e1-4195-a226-6eab4a6afb64` | `431dc715-5898-47d3-ba74-b2dbc9ecb699` | Under 14 Gold | no | `category-1787322361009-svwqtal` | R1 | DELETE (gemella) |
| `740d96c7-0956-4fec-9461-638fa22d0407` | `545d1111-a7f2-449c-a3bc-e5fd78921b6e` | Under 14 Gold | no | `category-1787322361009-svwqtal` | R1 | DELETE (gemella) |
| `4ffdb502-2487-4f26-bd8b-325f14e6fa16` | `54715b70-0857-4ab4-b901-bca59f60abb4` | Under 14 Gold | no | `category-1787322361009-svwqtal` | R1 | DELETE (gemella) |
| `ff51fb94-2939-456b-a82e-afbcfc49c1f7` | `5568fe36-d7d4-4f86-ab8f-41772c0fd4b3` | Under 14 Gold | no | `category-1787322361009-svwqtal` | R1 | DELETE (gemella) |
| `c9e0e1fb-73ee-4c06-be00-8476ecea7862` | `55c1c2f3-924c-49f2-96a5-1888867558a1` | Under 14 Gold | no | `category-1787322361009-svwqtal` | R1 | DELETE (gemella) |
| `fd17d254-207a-455d-9e2f-994e6188fe18` | `5aef505b-9c06-43df-b576-b2324e964c85` | Under 14 Gold | no | `category-1787322361009-svwqtal` | R1 | DELETE (gemella) |
| `c4707f46-cd9c-4d80-96b8-115c62dee315` | `6aa611da-3721-437c-98c5-9244d29d663a` | Under 14 Gold | no | `category-1787322361009-svwqtal` | R1 | DELETE (gemella) |
| `6da9eaff-c80d-404f-8c54-32c0f956c5f5` | `72f284ee-d6b5-430c-ae79-0f5b507ff6c9` | Under 14 Gold | no | `category-1787322361009-svwqtal` | R1 | DELETE (gemella) |
| `25702e9b-3e86-4765-a166-04263fc064da` | `882db3db-3c11-4076-8090-08aa8a03ff02` | Under 14 Gold | no | `category-1787322361009-svwqtal` | R1 | DELETE (gemella) |
| `e10200a4-8d7d-4d82-9306-3e3bdfa43dc3` | `89f2f8ad-c4f3-48b8-8f81-3bbf3f501b92` | Under 14 Gold | no | `category-1787322361009-svwqtal` | R1 | DELETE (gemella) |
| `1db88c12-7cb0-49eb-95e8-0753c7096354` | `8c753df4-1961-4c18-9a6e-bc17a9aecac7` | Under 14 Gold | no | `category-1787322361009-svwqtal` | R1 | DELETE (gemella) |
| `5ae172e7-8916-4113-8aa3-117bad1813d2` | `9ef54062-cea0-4345-85d3-0de098b51eeb` | Under 14 Gold | no | `category-1787322361009-svwqtal` | R1 | DELETE (gemella) |
| `739e2779-d67b-4cdd-8f7d-7cfc6609c425` | `a166b943-19d0-4e15-bfc9-8a40fb78c8b0` | Under 14 Gold | no | `category-1787322361009-svwqtal` | R1 | DELETE (gemella) |
| `9b2afcb5-3e3d-4ea6-a4cc-644e6df4d38c` | `be689847-2d87-426d-88b2-a33243e130e2` | Under 14 Gold | no | `category-1787322361009-svwqtal` | R1 | DELETE (gemella) |
| `bc98dbba-77db-47d7-9ff3-95275f7bf8e7` | `c67b922f-dacb-49ce-94f7-d4fad8372c76` | Under 14 Gold | no | `category-1787322361009-svwqtal` | R1 | DELETE (gemella) |
| `0609db19-af14-497b-a4e7-15244a7a4e23` | `d4381d79-5b20-41dd-afb0-3cec2571e955` | Under 14 Gold | no | `category-1787322361009-svwqtal` | R1 | DELETE (gemella) |
| `0594b279-5365-44bd-8d9c-26e16c6ab3dd` | `d52ae31a-984d-4034-8c78-4e7a9f1bfcf9` | Under 14 Gold | no | `category-1787322361009-svwqtal` | R1 | DELETE (gemella) |
| `470087db-c832-4796-b9d6-716d37a71f22` | `e041c823-7a5c-4271-9550-d50e1b19c662` | Under 14 Gold | no | `category-1787322361009-svwqtal` | R1 | DELETE (gemella) |
| `c1ad610c-da67-491c-90e3-e4c0214950cf` | `e5a5e6ed-7f04-4f23-9557-c644c3765fbb` | Under 14 Gold | no | `category-1787322361009-svwqtal` | R1 | DELETE (gemella) |
| `d3a11727-3fb6-45d1-a0ee-9d77c4a67076` | `e8fd0f13-3def-4b16-a108-c4109cfb28dd` | Under 14 Gold | no | `category-1787322361009-svwqtal` | R1 | DELETE (gemella) |
| `6e0178d8-6a57-4c3d-a2bb-7ebe20591aa5` | `19fef68e-1158-45a6-80ec-da86f34ba829` | Under 15 Gold | no | `category-1787322409918-2z7yagl` | R2 | DELETE (gemella) |
| `3e472342-b980-4993-8afc-76e0a277b0a0` | `1ae40f20-b85b-4af9-8a67-bb9b066e1466` | Under 15 Gold | no | `category-1787322409918-2z7yagl` | R2 | DELETE (gemella) |
| `71b3ee43-e834-4b21-b55e-3b0f4ec9de92` | `230cc456-ab28-407b-ad00-c7e39f0420cd` | Under 15 Gold | no | `category-1787322409918-2z7yagl` | R2 | DELETE (gemella) |
| `4a9c932d-825b-4a95-bf0b-505bee801d7e` | `35aeec1a-7a97-466f-bc34-71316fd3e4f2` | Under 15 Gold | no | `category-1787322409918-2z7yagl` | R2 | DELETE (gemella) |
| `aae8856c-2c6c-43a1-b4ea-95116150fa89` | `4810246d-2e14-4f33-8d8c-8c65aea1df1e` | Under 15 Gold | no | `category-1787322409918-2z7yagl` | R2 | DELETE (gemella) |
| `1eca43a1-a267-4e63-a83e-add86ad97dbe` | `49426fc8-08dc-44a0-be88-1027f45d1aa6` | Under 15 Gold | no | `category-1787322409918-2z7yagl` | R2 | DELETE (gemella) |
| `6a8f6fc6-ae27-4fee-bdee-fee1731b7835` | `73ea3cf8-7ca7-48a7-85f1-cdbe1766a67b` | Under 15 Gold | no | `category-1787322409918-2z7yagl` | R2 | DELETE (gemella) |
| `34f73f48-59bc-4936-be7f-6655993cbb6b` | `74f8813a-677d-4f0a-b117-2c6bc0cff622` | Under 15 Gold | no | `category-1787322409918-2z7yagl` | R2 | DELETE (gemella) |
| `a104c530-9943-4be9-932e-623055557f63` | `7afee1b3-4357-4592-9299-e64df274dbd2` | Under 15 Gold | no | `category-1787322409918-2z7yagl` | R2 | DELETE (gemella) |
| `b7568609-765b-4cca-b322-ef2d037c7602` | `8a2beff8-8078-440f-8597-d31603f371ca` | Under 15 Gold | no | `category-1787322409918-2z7yagl` | R2 | DELETE (gemella) |
| `ff9ef6a5-7663-46cc-8bbc-d62625ba8995` | `971ae73e-4560-4004-b9cb-19c49fa1cd9d` | Under 15 Gold | no | `category-1787322409918-2z7yagl` | R2 | DELETE (gemella) |
| `da4ce56a-e141-45cf-ada7-5821572fcc10` | `cce3666c-2bbc-48bb-90ca-d73b80608f30` | Under 15 Gold | no | `category-1787322409918-2z7yagl` | R2 | DELETE (gemella) |
| `8a5ff887-fe73-48d9-bebf-e433d0ebfbee` | `ded62279-b3a1-43c6-9901-500edc7fd5df` | Under 15 Gold | no | `category-1787322409918-2z7yagl` | R2 | DELETE (gemella) |
| `c2df501c-5564-4019-a334-ca47f7d31eae` | `ec077bf4-ef9f-4ed9-b8a4-5bc572b30b8c` | Under 15 Gold | no | `category-1787322409918-2z7yagl` | R2 | DELETE (gemella) |
| `e882f95e-fa63-4279-a40b-e7a3d0f8b239` | `ef3d3cd9-37f6-46a5-b5fe-65b8ab0d0b66` | Under 15 Gold | no | `category-1787322409918-2z7yagl` | R2 | DELETE (gemella) |
| `7103ea03-dfc1-491a-9321-b0dd72b6157b` | `fe3102e1-7f11-48ab-97a6-f25bb52e4bf9` | Under 15 Gold | no | `category-1787322409918-2z7yagl` | R2 | DELETE (gemella) |
| `9470a98d-b0cf-4c43-9d70-401b169d1a7b` | `18b62a2d-2be8-45d4-b38d-e7955e987fb4` | Under 17 Gold | no | `category-1787322561179-qy7imoq` | R1 | DELETE (gemella) |
| `e33f5bca-d68c-43a8-b4bc-9f0845d454ca` | `1eb753b5-9e3d-4581-a5cb-d019e40e30bf` | Under 17 Gold | no | `category-1787322561179-qy7imoq` | R1 | DELETE (gemella) |
| `7913af5b-64a7-4e87-9cb3-6fecb915965c` | `1f00051c-416a-4bf9-aec4-c40c5113a343` | Under 17 Gold | no | `category-1787322561179-qy7imoq` | R1 | DELETE (gemella) |
| `460b35f3-c6bf-4b51-8f0e-fb586227b7c5` | `24572b22-e52d-45fd-8a56-87d9096afd46` | Under 17 Gold | no | `category-1787322561179-qy7imoq` | R1 | DELETE (gemella) |
| `6e779d5d-4598-49c3-95d0-f061965e3576` | `290090b3-523e-4f42-836a-a7f56216e982` | Under 17 Gold | no | `category-1787322561179-qy7imoq` | R1 | DELETE (gemella) |
| `8dc020fd-bf44-4243-80d6-cbd9063d5265` | `2ca581b1-5110-43f5-b411-42dbcc9e8968` | Under 17 Gold | no | `category-1787322561179-qy7imoq` | R1 | DELETE (gemella) |
| `e434f1ba-717d-48ed-a5dd-dd6048d52539` | `32c78d62-7de7-4ebd-9a8e-7998e7aa5f24` | Under 17 Gold | no | `category-1787322561179-qy7imoq` | R1 | DELETE (gemella) |
| `8ac1d3ba-a43a-49d8-bdc4-311ee92b0912` | `370f2b72-89ff-47fb-9ff4-1750625ca161` | Under 17 Gold | no | `category-1787322561179-qy7imoq` | R1 | DELETE (gemella) |
| `095eb1a5-f65d-4fe7-9772-a9dc458e81e4` | `3a4be303-59a5-44ea-a964-eccc6356cfb1` | Under 17 Gold | no | `category-1787322561179-qy7imoq` | R1 | DELETE (gemella) |
| `0332e4d1-37be-4920-b8dc-3a7f589b9567` | `44097022-57f0-44fb-a276-b2335f38279c` | Under 17 Gold | no | `category-1787322561179-qy7imoq` | R1 | DELETE (gemella) |
| `490fadfb-6e17-4780-870f-1418c32a840a` | `4a1e5286-8a9a-428a-94f5-14411c89492b` | Under 17 Gold | no | `category-1787322561179-qy7imoq` | R1 | DELETE (gemella) |
| `0ff3f8d7-2db1-474a-84a3-1192979a5f53` | `54e51647-d520-4887-9b4f-d2889db2a9e5` | Under 17 Gold | no | `category-1787322561179-qy7imoq` | R1 | DELETE (gemella) |
| `2c9188af-afa6-459b-972f-ea434af70ecd` | `7c19e01d-b01b-46d0-b95d-c258c99f353c` | Under 17 Gold | no | `category-1787322561179-qy7imoq` | R1 | DELETE (gemella) |
| `23ddc93d-1b84-4ea8-8eb6-fdca81b57714` | `8b4c4536-a988-4627-a1ca-c9d5bb0605ad` | Under 17 Gold | no | `category-1787322561179-qy7imoq` | R1 | DELETE (gemella) |
| `2bd36be5-d737-4e41-9785-5eb8e13d15b0` | `94c88e77-f768-40ac-93a7-3af6a06ab146` | Under 17 Gold | no | `category-1787322561179-qy7imoq` | R1 | DELETE (gemella) |
| `333a944f-493f-44c2-9a63-0aa44d7d6b98` | `98f38f8a-86ec-4683-8600-04f00ac8e87d` | Under 17 Gold | no | `category-1787322561179-qy7imoq` | R1 | DELETE (gemella) |
| `e6a79cdc-135c-4774-b921-a9b1b644ab1c` | `a349c9d5-f362-40e3-be47-93a21240dd23` | Under 17 Gold | no | `category-1787322561179-qy7imoq` | R1 | DELETE (gemella) |
| `ab7b8e77-d8f1-470a-b383-5d9cf1f3bfed` | `aa330fba-be13-41f5-806b-8ced88b89e77` | Under 17 Gold | no | `category-1787322561179-qy7imoq` | R1 | DELETE (gemella) |
| `91f2b976-e7c5-496d-b07c-75bd845b4bf3` | `b808070b-d3b6-4f4c-8190-a8b10562a4b0` | Under 17 Gold | no | `category-1787322561179-qy7imoq` | R1 | DELETE (gemella) |
| `c41f7cd5-a06d-45c3-8656-8b5f55bd2ea3` | `c604baaa-a364-403c-bd62-42a9ee42b891` | Under 17 Gold | no | `category-1787322561179-qy7imoq` | R1 | DELETE (gemella) |
| `770660b6-440a-4987-860a-6bc025c6ccac` | `c6c1a392-f38c-43fb-bba0-3f155636f60c` | Under 17 Gold | no | `category-1787322561179-qy7imoq` | R1 | DELETE (gemella) |
| `e4f130d0-0e7d-40f7-bec6-806f71f868d5` | `d52bad1f-c37f-4c17-8c2f-6fa33ac5ddaa` | Under 17 Gold | no | `category-1787322561179-qy7imoq` | R1 | DELETE (gemella) |
| `2eab7eb1-6bb0-4d47-b7e2-ecb990cdd751` | `d5aae968-3e4b-4bb7-bcd7-020d168c789d` | Under 17 Gold | no | `category-1787322561179-qy7imoq` | R1 | DELETE (gemella) |
| `2aa6418b-0f0b-40f4-9c8d-b43a999540a1` | `dcce00fb-c085-4028-b3c1-a3c778f7b612` | Under 17 Gold | no | `category-1787322561179-qy7imoq` | R1 | DELETE (gemella) |
| `8eeacd71-4a97-43f4-bca0-f846a782118d` | `ddce6ce1-3aa2-4f0b-8661-fbef28f34253` | Under 17 Gold | no | `category-1787322561179-qy7imoq` | R1 | DELETE (gemella) |
| `b8cfd587-4d26-4e5a-8099-05c48c9d73e9` | `e9bde1de-49b7-4b0b-93ff-9a3cb6e3ed1c` | Under 17 Gold | no | `category-1787322561179-qy7imoq` | R1 | DELETE (gemella) |
| `c6e275ef-b41a-4382-9ccf-ac6428b2edfb` | `f48643a0-1c87-40be-b8e3-e830e44ab490` | Under 17 Gold | no | `category-1787322561179-qy7imoq` | R1 | DELETE (gemella) |
| `87c475ea-0721-4a51-9c41-6fb8c338a2e6` | `01349eb6-c276-4a88-b427-ceb918f295e5` | Under 19 Regionale | no | `category-1787322586145-tnn8ibt` | R1 | DELETE (gemella) |
| `ff90045f-ed26-4f45-ae03-3368b244465d` | `0231b239-a96d-47e2-9d63-13bdce315828` | Under 19 Regionale | no | `category-1787322586145-tnn8ibt` | R1 | DELETE (gemella) |
| `24f2ff8a-f881-4d05-947c-b5d3c49b4924` | `04660ff6-fdbf-4d67-9aee-5047ce23a938` | Under 19 Regionale | no | `category-1787322586145-tnn8ibt` | R1 | DELETE (gemella) |
| `7e7eefc3-a7fc-4c42-9ad1-9d2b9305423d` | `09ed61a9-2412-4164-8629-614fce25882b` | Under 19 Regionale | no | `category-1787322586145-tnn8ibt` | R1 | DELETE (gemella) |
| `0489ab3d-0f5e-4256-a303-e8183083f02f` | `0be0ca77-031f-4645-85c7-797800d7377b` | Under 19 Regionale | no | `category-1787322586145-tnn8ibt` | R1 | DELETE (gemella) |
| `ecf2f1c0-7f46-4d29-875f-c648a0195120` | `1345934b-00da-4408-a2b6-3407ec11847e` | Under 19 Regionale | no | `category-1787322586145-tnn8ibt` | R1 | DELETE (gemella) |
| `ea3cab9f-53c8-4186-a9d2-21c67a95310d` | `144e05cc-4feb-4a79-843e-ec3556645e77` | Under 19 Regionale | no | `category-1787322586145-tnn8ibt` | R1 | DELETE (gemella) |
| `e20f9c32-ed8f-4483-a4bd-5675f4aa6166` | `16d19f8a-ac62-4c09-be5b-b13bbae44006` | Under 19 Regionale | no | `category-1787322586145-tnn8ibt` | R1 | DELETE (gemella) |
| `d47c934d-bb5a-478a-a7a4-49207869a64c` | `2402f2ec-a0f5-4fee-96b8-407b5f5fb752` | Under 19 Regionale | no | `category-1787322586145-tnn8ibt` | R1 | DELETE (gemella) |
| `146fadb0-a9cb-494a-9831-e9ec43d54900` | `242cd4bc-6e7b-4f06-9614-edef7760bf57` | Under 19 Regionale | no | `category-1787322586145-tnn8ibt` | R1 | DELETE (gemella) |
| `a50b8afa-62b5-4357-a1a6-8a9972ffe62f` | `2ec1e358-0eaa-4667-9d0b-55c04d6d37b7` | Under 19 Regionale | no | `category-1787322586145-tnn8ibt` | R1 | DELETE (gemella) |
| `8b043793-c589-4da2-85a7-01fa223350ac` | `4d68acdd-5c25-4ed0-b5eb-d406432a69fd` | Under 19 Regionale | no | `category-1787322586145-tnn8ibt` | R1 | DELETE (gemella) |
| `f8e234fa-4060-4d29-a29e-64946feb657a` | `57859558-cf05-4c5a-977a-58bda4d03304` | Under 19 Regionale | no | `category-1787322586145-tnn8ibt` | R1 | DELETE (gemella) |
| `2098eebb-78dd-44f8-8802-3508a3fedc4d` | `5855f970-6d6d-4268-9d6c-33e976915250` | Under 19 Regionale | no | `category-1787322586145-tnn8ibt` | R1 | DELETE (gemella) |
| `6999f667-c679-4e96-b6e6-80ade455e718` | `6c8c11c3-46e2-43d2-a961-bbbd81133ad3` | Under 19 Regionale | no | `category-1787322586145-tnn8ibt` | R1 | DELETE (gemella) |
| `55189b4d-e59e-4dd0-86d6-461519f3184b` | `6dfafe11-a1f2-4ee6-9c4b-120c331cc26a` | Under 19 Regionale | no | `category-1787322586145-tnn8ibt` | R1 | DELETE (gemella) |
| `18d858e9-0618-403a-9c4a-f0944b11037b` | `7427b4a9-cd2f-4514-8bae-266326b2b6b3` | Under 19 Regionale | no | `category-1787322586145-tnn8ibt` | R1 | DELETE (gemella) |
| `1fb5d389-b677-4ecb-b124-4134f658b7cb` | `7fe0c819-1fb6-4756-9a00-7ba2657f141f` | Under 19 Regionale | no | `category-1787322586145-tnn8ibt` | R1 | DELETE (gemella) |
| `606294e1-7c9a-4864-a011-8d96376b785b` | `821f1cd2-90fd-4a2a-b870-e13cfba89fda` | Under 19 Regionale | no | `category-1787322586145-tnn8ibt` | R1 | DELETE (gemella) |
| `715ce1e9-1845-4e32-b5da-bf226957ca84` | `9d02e598-2403-4f95-b640-6410da971361` | Under 19 Regionale | no | `category-1787322586145-tnn8ibt` | R1 | DELETE (gemella) |
| `c6d1dc3c-8a2d-490a-9f45-9fe9693e71b7` | `a189319c-0e28-4122-b619-584c49d0286c` | Under 19 Regionale | no | `category-1787322586145-tnn8ibt` | R1 | DELETE (gemella) |
| `87cef11c-7d6d-4cac-9da7-9081a3d72441` | `aa0df813-0053-4672-98d7-7199e49c3cdd` | Under 19 Regionale | no | `category-1787322586145-tnn8ibt` | R1 | DELETE (gemella) |
| `c67b578a-6232-4679-88a4-de1acbff871b` | `b167b4a0-3759-41c5-a517-fd44f5e09a78` | Under 19 Regionale | no | `category-1787322586145-tnn8ibt` | R1 | DELETE (gemella) |
| `50dd33dc-ca5a-4d5b-a3a4-1b32ed1a2ce8` | `b226919a-f707-47d5-9bad-74c1bc62d954` | Under 19 Regionale | no | `category-1787322586145-tnn8ibt` | R1 | DELETE (gemella) |
| `9ef96029-969e-42a2-b042-0c216f8e192b` | `b31fb0f0-0421-4529-8fe2-907a08241022` | Under 19 Regionale | no | `category-1787322586145-tnn8ibt` | R1 | DELETE (gemella) |
| `c8636679-ef8c-42ec-8ff7-0b1eebe42834` | `cbcd27c1-4e39-4d2e-8fe7-cd16f89af70d` | Under 19 Regionale | no | `category-1787322586145-tnn8ibt` | R1 | DELETE (gemella) |
| `19844335-441a-4c7d-a10c-133984d5b558` | `e3a626a9-1694-49ca-95f1-b5f64cbcd504` | Under 19 Regionale | no | `category-1787322586145-tnn8ibt` | R1 | DELETE (gemella) |
| `0cd087cf-6b97-402f-a049-da0b7bcf509c` | `e8b5f4a9-26a1-4fa8-84a2-b6fb030e51dd` | Under 19 Regionale | no | `category-1787322586145-tnn8ibt` | R1 | DELETE (gemella) |
| `bf5b190e-3e8a-4b83-bb65-09cfa07b6f0c` | `f2560d16-cfde-4d07-8a56-68213efd409f` | Under 19 Regionale | no | `category-1787322586145-tnn8ibt` | R1 | DELETE (gemella) |
| (colonna `athletes.category_id`) | `a166b943-19d0-4e15-bfc9-8a40fb78c8b0` | Under 14 Gold | primaria | (primaria dell'atleta) | colonna | UPDATE `athletes.category_id`/`category_name` |
| (colonna `athletes.category_id`) | `2947d805-df94-43fd-94a6-4920489339ef` | Pulcini - S. Cosma | primaria | (primaria dell'atleta) | colonna | UPDATE `athletes.category_id`/`category_name` |