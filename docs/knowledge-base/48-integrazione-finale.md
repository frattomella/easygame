# 48 — Integrazione finale PP-02/03/04/05: il piano

> Documento operativo. Scritto in Fase 0, prima di toccare codice, e aggiornato
> mentre l'integrazione procede. Dice **in che ordine** si uniscono le quattro
> lane, **che cosa collide** e **come si risolve** ogni collisione semantica.

---

## 1. La topologia vera

Le quattro lane **non** partono da `integration/web-v1` (`be97250`). Ne
condividono altri sedici commit, e il punto di biforcazione reale e:

```
0d66921  docs(pp-01): l'esito dello staging
```

`git merge-base` di **ogni coppia** di lane e `0d66921`, non `be97250`. La
conseguenza pratica e che **PP-01 e gia dentro tutte e quattro** e non va unita
a parte; e che diffare contro `be97250` mostra 94 file condivisi, di cui 63
falsi positivi (blob identici ereditati dal tratto comune, fra cui
`prisma/schema.prisma`, `scripts/pp-01-uat.mjs` e `src/lib/server/events.ts`
per tre lane su quattro). **Ogni confronto fra lane si fa contro `0d66921`.**

Contro quel punto la superficie di conflitto vera e **31 file**, e i conflitti
reali misurati con tre merge di prova sono **13 file**, identici in ogni ordine
di merge: l'ordine cambia **quando** si paga, mai **quanto**.

Distribuzione a coppie:

| coppia | file in conflitto |
|--------|-------------------|
| PP-02 x PP-04 | **11** — l'intera superficie di codice |
| PP-02 x PP-03 | 4 (di cui 1 di codice) |
| PP-02 x PP-05 | 3, solo documentazione |
| PP-03 x PP-04, PP-03 x PP-05, PP-04 x PP-05 | 2-3 ciascuna, solo documentazione |

---

## 2. L'ordine di merge

```
integration/web-v1  <-  0d66921
  1.  feat/pp-05-onboarding-communications     (0 conflitti)
  2.  feat/pp-03-trainer                       (3, documentazione)
  3.  feat/pp-04-athlete                       (2, documentazione)
  4.  fix/pp-02-area-famiglia                  (13: 3 doc + 10 codice)
```

Il criterio non e minimizzare il conflitto — il totale non cambia — ma
**concentrare il lavoro a mano in un punto solo, quando tutto il resto e gia
sul ramo**. PP-02 va per ultima perche e quella che deve essere riconciliata
*contro* le altre tre, non viceversa: e la lane che rinomina, che riscrive
`athleteBelongsToParent` e che porta il refactor strutturale.

PP-05 va per prima perche non collide con niente e perche **toglie**
`hashPassword`/`validatePassword` da `resources.ts`: metterla subito fa girare
ogni `typecheck` successivo contro la superficie di import definitiva.

---

## 3. La rinumerazione degli ADR — **fatta prima del merge**

Tutte e quattro le lane appendono in fondo a `18-decision-log.md`, alla stessa
riga, e si contendono gli stessi numeri: 0114, 0115, 0116 e 0117 sono
rivendicati da PP-02, PP-04 e PP-05 con contenuti **diversi**; 0125 da PP-03 e
PP-04.

PP-04 **non si tocca**: ha 281 riferimenti e i suoi ADR si citano a catena
(0117 -> 0122 -> 0123 -> 0124 -> 0125). Rinumerare lei costa piu che
rinumerare le altre tre insieme.

| lane | prima | dopo | riferimenti riscritti |
|------|-------|------|------------------------|
| PP-04 | 0114-0125 | **invariata** | — |
| PP-03 | 0125 | **0126** | 15 |
| PP-02 | 0114-0117 | **0127-0130** | 72 + 1 (ADR-0117 di WP-A) |
| PP-05 | 0114-0117 | **0131-0134** | 91 |

La rinumerazione si fa **su ogni lane, in un commit suo, prima del merge**:
cosi il conflitto su `18-decision-log.md` si riduce a una concatenazione in
coda, senza arbitrare numeri in mezzo a un merge.

Fatto: PP-03 (`9503fe4`), PP-05 (`43fc1bb`). PP-02 da fare prima del merge.

**Aggiornamento 2026-09-06.** La tabella qui sopra e invecchiata su due punti,
e vanno letti insieme a lei:

* **La base non e piu `0d66921`.** Tutte e quattro le lane hanno poi ricevuto
  `aa62e16` (la sonda della corsa con un'utenza sua), che e oggi il
  `merge-base` di ogni coppia. Ogni confronto fra lane si fa contro **quello**;
  contro `0d66921` si contano differenze che le lane condividono gia.
* **PP-02 ha ora sei ADR, non quattro.** WP-C+D ne ha aggiunti due (l'autorita
  sui tutori e il vaglio d'archivio) e il secondo vaglio indipendente un terzo,
  gia numerato **0137** perche 0120-0125 sono di PP-04 e 0131-0134 di PP-05.
  L'assegnazione finale di PP-02 e quindi:

  | prima | dopo |
  |-------|------|
  | 0114-0117 | **0127-0130** (come da piano) |
  | 0118 | **0135** |
  | 0119 | **0136** |
  | 0137 | invariato |

  I due numeri nuovi vanno in coda invece che dentro 0127-0130 perche quel
  blocco e largo quattro e PP-05 occupa gia da 0131: allargarlo vorrebbe dire
  rinumerare una terza lane per un risultato solo piu ordinato.

* **Un riferimento che resta valido puntando altrove.**
  `tests/lib/riscatto-perimetro.test.mjs` viene dalla base ed e identico in
  tutte e quattro le lane; cita `ADR-0117` intendendo il **test di totalita**
  di PP-02. Dopo il merge `ADR-0117` sara quello di PP-04 («la stessa domanda,
  per i due lettori dello stesso campo»), su tutt'altro tema. Git non lo
  segnala — nessun conflitto, nomi uguali — e va riscritto a **0130** insieme
  agli altri riferimenti di PP-02.

* **La ricetta della §4.1 non descrive piu il lato PP-02.** Vedi la nota in
  fondo a quella sezione.

**Collisione di nome fra schede KB**: PP-02 e PP-03 aggiungevano entrambe un
file con prefisso `44`. Git non le avrebbe messe in conflitto — nomi diversi —
e la collisione sarebbe entrata in silenzio. PP-03 e stata spostata a
`47-pp-03-trainer.md`; `44` resta all'analisi della causa di PP-02, che e gia
citata dai commenti del codice. `README.md` della KB indicizza oggi solo
42/42b/43/43b/44: vanno aggiunte le righe di 45, 46 e 47 **dopo** il merge.

---

## 4. I conflitti semantici, e come si risolvono

Sono quattro. Gli altri nove file sono testuali o concatenazioni.

### 4.1 `athleteBelongsToParent` — due riscritture indipendenti della stessa funzione

**Il piu pericoloso dell'intera integrazione.** PP-02 e PP-04 hanno riscritto
la stessa funzione con **firme diverse** e per ragioni diverse:

- **PP-02** aggiunge la revoca **per identita**: un tutore revocato, o un
  indirizzo presente solo come *recapito*, non passa piu; dopo una revoca
  sopravvive solo un legame **dichiarato**;
- **PP-04** aggiunge l'identita durevole dell'atleta (`schedeProprie`,
  `ancoraAtleta`) e la regola del ramo esclusivo.

L'istruzione finale della versione PP-04 e, letteralmente, il predicato
**pre-PP-02**:

```ts
return tutoreProvato ||
  getGuardianRows(athlete).some(g => isGuardianLinkedToUser(g, userId, userEmail));
```

Se in fase di merge vince quel lato, **la revoca per identita di PP-02 e
sconfitta in silenzio**: un tutore revocato con l'indirizzo ancora in anagrafica
torna a passare. Nessuna delle due versioni puo sostituire l'altra —
`revokedGuardianIdentities` esiste **solo** su PP-02 (7 file),
`isGuardianLinkedById` **solo** su PP-04.

**Risoluzione: si compone a mano, non si sceglie un lato.** Ordine di
valutazione:

1. prima il ramo esclusivo di PP-04 (`legameVivo` / `eLaPersonaStessa` /
   `tutoreProvato`);
2. poi il cancello di revoca di PP-02, applicato al ramo tutore **prima** di
   `tutoreProvato || isGuardianLinkedToUser(...)`;
3. `guardianDeclaredIds` resta l'unica strada che sopravvive a una revoca.

**Nota 2026-09-06 — questa ricetta e da rifare.** E stata scritta prima del
cutover WP-C+D, che ha spostato l'autorita sui tutori dal blob alla tabella e ha
cancellato `getGuardianRows`, `isGuardianLinkedToUser` e
`revokedGuardianIdentities` **come lettori di sicurezza**. La versione PP-04 li
chiama ancora. La conseguenza e paradossalmente **piu sicura** di quella
descritta qui: il merge non lascera passare in silenzio il predicato pre-PP-02,
perche non compilera. Cio che resta da comporre a mano e la sostanza di PP-04 —
il ramo esclusivo, `schedeProprie`, `ancoraAtleta` — sopra il lettore
relazionale `findGuardianLinks`.

**Il controllo che dice se la composizione e giusta**: si eseguono contro la
funzione fusa **entrambe** le suite,
`tests/server/pp-02-revoca-e-atleta-di-se.test.mjs` e
`tests/server/pp-04-porta-di-servizio.test.mjs`. Se una delle due diventa verde
solo togliendo un'asserzione, la composizione e sbagliata.

### 4.2 Due nomi per la stessa funzione: `includeSelf` vs `allowSelfAthleteLink`

PP-02 e PP-04 hanno implementato **la stessa** funzione — «l'atleta e tutore di
se stesso, su richiesta» — negli **stessi cinque punti di chiamata**, con nomi
diversi.

**Si adotta `allowSelfAthleteLink` di PP-04** e si rinominano i sei punti di
PP-02. Non e una preferenza di stile: PP-04 esporta un tipo (`ParentAccessOptions`),
ha il default restrittivo esplicito, e soprattutto
`tests/server/pp-04-porta-di-servizio.test.mjs` **cerca in `src/` la stringa
letterale** `"allowSelfAthleteLink: true"` e ne verifica l'elenco chiuso dei
file: un `includeSelf` superstite renderebbe quell'inventario verde a vuoto,
con il punto di chiamata scoperto.

### 4.3 `document-requests.ts` — la versione PP-02 e codice morto

PP-02 legge il flag con `(scope as any)?.includeSelf`, ma `DocumentDossierScope`
non ha quel campo e **nessun chiamante lo valorizza**: vale sempre `false`.
PP-04 lo passa come parametro esplicito. **Si prende PP-04 per intero.**

### 4.4 `profile-account-links.ts` — PP-03 cancella simboli che PP-02 usa

PP-03 ha sostituito i quattro `Set` di letterali con predicati basati su
`normalizeAccessRole` (`eAllenatore`, `eGenitore`, `eAtleta`, `eGestionale`).
PP-02 ha riscritto il **corpo** delle stesse funzioni.

**Nota (2026-09-05):** con WP-A, PP-02 ha fatto la stessa correzione con una
terza forma — i predicati canonici gia esportati da `access-roles.ts`
(`isTrainerAccessRole` e compagni). Le due intenzioni ora **coincidono**, e la
risoluzione e diventata una scelta di nome, non di semantica.

**Si tiene la forma di PP-02/WP-A** e si riscrivono i predicati locali di PP-03
su quella: `access-roles.ts` esporta gia i quattro predicati e l'insieme
gestionale, quindi la versione PP-03 e un quinto elenco scritto a mano
(`RUOLI_GESTIONALI`) di cui non c'e bisogno — ed e esattamente la classe di
difetto che ADR-0117 chiude. Il test di totalita di WP-A
(`scripts/pp-02-totalita-ruoli.mjs`) copre la forma fusa senza modifiche.

L'allargamento voluto di PP-03 — `owner` entra fra i ruoli gestionali — e gia
presente nella forma canonica, perche `isManagementAccessRole` lo include.

### 4.5 `memberships/route.ts` — tre lane, una riga

PP-02 e PP-04 riscrivono la stessa chiamata; PP-05 e disgiunta e si fonde da
sola. **PP-02 porta pero una correzione che non ha corrispettivo**: esclude la
propria scheda da `figli`, perche chi e insieme genitore e atleta non deve
trovarsi la propria scheda fra quelle dei figli. Quella riga **deve
sopravvivere**.

Risoluzione: PP-05 com'e + il nome di PP-04 + il filtro di PP-02.

---

## 5. `athlete-profile/[athleteId]/route.ts` — verificato, nessun bypass

PP-03 (guardia clinica) e PP-04 (invariante su `athletes.user_id`) toccano
questo file a ~85 righe di distanza e **si fondono da soli**. La composizione e
stata analizzata riga per riga:

- PP-04 rende `directAthleteAccess` **piu stretto**. Quel flag e cio che
  salta il perimetro di sede/categoria e cortocircuita il consenso al contenuto
  clinico: restringerlo manda **piu** lettori dentro `athleteWithinAccessScope`
  e dentro `hasHealthPermission`. Il perimetro guadagna portata, non la perde;
- PP-03 agisce **solo** sul ramo di chi non e entrato per legame diretto —
  cioe esattamente dove PP-04 sposta gli ex atleti.

Le due correzioni si rinforzano. Nessun ramo nuovo, nessun `||` nuovo, nessun
ritorno anticipato: non esiste un percorso che arrivi alla risposta senza
passare dal 401/403, ne uno che salti il perimetro senza che
`directAthleteAccess` sia vero **nella definizione stretta di PP-04**.

**Da verificare dopo il merge** (coerenza, non conflitto): che
`athleteBelongsToParent` fuso riceva ancora `ancoraAtleta` calcolato da
`clubsWhereStillAthlete`, altrimenti questa rotta torna a essere l'**unico**
lettore stretto di `athletes.user_id`.

---

## 6. Il gate dopo ogni passo

Dopo **ognuno** dei quattro merge: `npm test`, `npm run typecheck`,
`npm run lint`, `npm run build`. Il quarto passo non compilera finche la
rinomina `includeSelf` -> `allowSelfAthleteLink` e la riscrittura dei due gate
di ruolo non sono fatte entrambe.

Alla fine, sul ramo integrato, girano anche le sonde comportamentali contro
PostgreSQL vero di tutte e cinque le lane, i due test di totalita di WP-A, e le
sonde di concorrenza.
