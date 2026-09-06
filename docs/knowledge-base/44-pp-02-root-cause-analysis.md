# 44 — PP-02: analisi della causa e proposta di correzione architetturale

> Documento di **arresto**. Scritto dopo il ventottesimo round di revisione
> ostile su `fix/pp-02-area-famiglia`, quando il committente ha fissato una
> condizione esplicita: se entro il round 28 la convergenza non arriva a
> Critical 0 / High 0, **le correzioni incrementali si fermano** e si produce
> l'analisi della causa prima di continuare.
>
> Il round 28 non e pulito. Le correzioni incrementali si fermano qui.
> Ultimo commit di codice: `f9aecf7`. Dopo quello, in questo perimetro, non e
> stata scritta una riga di correzione.

---

## 1. Cosa e successo, in numeri

Ventotto round indipendenti. Dal quattordicesimo in poi **ogni round ha trovato
almeno un High**, e nella maggioranza dei casi il difetto piu grave del round
era **nato dalla correzione del round precedente**:

| Round | Il difetto piu grave | Chi l'aveva creato |
|-------|----------------------|--------------------|
| 20 | `contactOnly` perso alla riscrittura del blob | cinque stesure precedenti sulla riga |
| 23 | perdita di aggiornamento su `athletes.data` sotto concorrenza | il modello stesso |
| 26 | `upsert` saltava tutte le difese della modifica | la rotta generica, da sempre |
| 27 | la stessa correzione applicata a **una risorsa su due**; il blocco messo al round 26 andava in **abbraccio mortale** con il rollover | il round 26 |
| 28 | la revoca riconosce **quattro grafie di ruolo su ventidue** | il codice originale, mai misurato |

Il conteggio degli scrittori di `athletes.data` e stato rifatto da revisori
indipendenti quattro volte: **4 → 6 → 8 → 9 → 16**. Nessuno dei quattro
conteggi era in malafede. Il numero cresceva perche non esiste un posto dove
sia scritto.

---

## 2. I tre reperti del round 28 (verificati in prima persona)

### R-1 (High) — la revoca guarda lo *slug*, non il ruolo canonico

`src/lib/server/profile-account-links.ts:893-896` dichiara quattro insiemi di
**letterali**:

```
TRAINER_ROLES  = trainer, allenatore, coach
PARENT_ROLES   = parent, genitore, guardian, tutore
ATHLETE_ROLES  = athlete, atleta, player
STAFF_ROLES    = admin, manager, gestore, staff, member, socio,
                 collaborator, collaboratore
```

`src/lib/access-roles.ts:22-59` dichiara il dizionario canonico: **36 alias**.
La differenza — **14 grafie** — e invisibile a tutti e quattro gli sweep
(`:961`, `:1011`, `:1074`, `:1346`): fra le altre `tutor` (genitore),
`giocatore` e `giocatrice` (atleta), `club_manager`, `administrator`,
`amministratore`, `segreteria`, `secretary`, `membro`, `allenatrice`. E con
esse **tutte e quattro** le forme di slug personalizzato `custom:<base>:<nome>`,
che sono quelle che `assignClubRole` scrive **da se**.

Misurato dalle porte vere: tessera con `role: "tutor"`, revoca dalla Gestione
accessi → schermata «Accesso revocato», tessera cancellata, riga di audit
scritta con `unlinked_profiles_count: 0` — e `canParentAccessAthlete` risponde
**ancora true**. Con `role: "giocatore"`: `athletes.user_id` resta,
`GET /api/v1/athlete-accounts/me` risponde **200** con la scheda completa. Con
`club_manager` e con uno slug personalizzato: il profilo resta collegato a un
account che non esiste piu — cioe il difetto Fortitudo Scauri che lo sweep e
stato scritto per chiudere, riaperto per ogni club che usa i ruoli
personalizzati.

### R-2 (High) — la finestra di PP02-D34 non e «una corsa rara»

Il debito e **dichiarato** e la scelta fra i due mali e argomentata. Il reperto
non e che esista: e che la sua **caratterizzazione e sbagliata di un ordine di
grandezza**, e su quella caratterizzazione poggia la decisione di lasciarlo
aperto.

Misurato dalle due porte vere in parallelo, con lo sfasamento a 20 ms:

| club | durata della revoca | giri in cui il tutore revocato legge ancora il secondo figlio |
|------|---------------------|---------------------------------------------------------------|
| 40 tesserati | 49 ms | **5 su 5** |
| 400 tesserati | 222 ms | **5 su 5** |

La finestra non e «una scheda in una corsa rara»: e **l'intera durata dello
sweep**, e cresce linearmente con i tesserati.

### R-3 (Medium) — due letture dello stesso corpo sulla stessa rotta

`[resource]/[id]/route.ts:161` fa `body?.data ?? body`.
`[resource]/route.ts:46-58` ha `resolveCreatePayload`, con una euristica scritta
apposta per **non** confondere l'involucro con il contenuto.

`athletes` ha una colonna che si chiama `data`. Un `PATCH` con il corpo non
incartato — la forma che il `POST` della stessa rotta accetta — risponde **200
senza scrivere niente**. Oggi nessun client e colpito (incartano tutti), ma un
salvataggio che *toglie* un tutore diventerebbe un no-op silenzioso, e la forma
ha gia ingannato il revisore che l'ha trovata.

---

## 3. La causa

Non e una. Sono due, e hanno la stessa forma.

### Causa A — la decisione di accesso vive dentro un blob senza chiave

`athletes.data` e JSON libero. Dentro ci sono i tutori, e dentro i tutori c'e
**la decisione se un genitore vede o non vede il fascicolo di un minore**: tre
difese di riga piu due registri di scheda (`accessRevokedAt`, `contactOnly`,
`revokedGuardianIdentities`, `contactOnlyIdentities`, piu l'identita
corroborata). Sedici scrittori censiti riscrivono la colonna **per intero**.

Da qui, in catena e senza eccezioni:

- **la perdita di aggiornamento** e la modalita di guasto normale, non
  l'anomalia — chi legge, modifica e riscrive un blob cancella cio che un altro
  ha scritto nel mezzo;
- **il blocco per riga** (`lockAthleteRow`, round 23) e stato necessario perche
  non esiste una chiave su cui l'archivio possa fare il lavoro da se;
- **il ciclo** e stato necessario perche una revoca non e un `UPDATE`: e una
  scansione che riapre e riscrive N blob;
- **il deadlock** (PP02-D34) e nato dal blocco che serviva al ciclo;
- **il riporto delle difese** in `resources.ts` — cinque stesure, da «per id» a
  «per identita corroborata» — esiste solo perche la rotta generica riceve un
  blob che ha perso le difese e deve rimetterle dentro a mano.

Nessuno di questi cinque problemi esisterebbe se un tutore fosse **una riga**.

### Causa B — le difese sono attaccate a un'enumerazione, non al fatto

Questa e la causa che il round 28 ha isolato, ed e la piu importante perche non
si vede guardando il blob.

Tre volte di fila, in tre round consecutivi, il difetto piu grave aveva la
stessa forma: **una difesa vera, corretta, provata — che copre un valore su N**
di un'enumerazione scritta a mano.

| Round | L'enumerazione | Copriva | Su |
|-------|----------------|---------|-----|
| 26 | i verbi della rotta generica | 1 (`PATCH`) | 3 |
| 27 | le risorse con guardie nella modifica | 2 (le schede atleta) | 4 |
| 28 | le grafie del ruolo negli sweep | 4 | 22 |

E ogni volta la chiusura e stata **allungare l'elenco**. La correzione del
round 27 — `RISORSE_CHE_SI_MODIFICANO_DA_UN_POSTO_SOLO` — e essa stessa un
quinto elenco scritto a mano, che deve restare d'accordo con le guardie di
`updateResource` senza che nulla lo verifichi.

Il tratto comune e preciso: **due elenchi in due file diversi devono restare
d'accordo, e non esiste niente che lo controlli.** Gli insiemi di
`profile-account-links.ts` devono restare d'accordo con `ROLE_ALIASES` di
`access-roles.ts`; il parser del corpo del `PATCH` deve restare d'accordo con
quello del `POST`; l'elenco delle risorse reinstradate deve restare d'accordo
con l'elenco delle guardie.

Un elenco che deve restare d'accordo con un altro elenco **divergera**: e una
questione di tempo, non di attenzione.

### Perche i gate non lo vedono

Le 266 sonde PP-02 girano contro PostgreSQL vero, una parte consistente passa
dai route handler veri, e il perimetro di **lettura** dell'area famiglia e
coperto in modo convincente (undici porte verificate chiuse dopo una revoca
canonica). Il lavoro fatto e solido.

Ma la sonda esercita **il valore che chi ha scritto la difesa aveva in mente**.
La copertura e alta; la **varieta** e bassa. Ed e la varieta che qui decide:

- le sonde della revoca provano **quattro** valori di ruolo su ventidue, e
  nessuno slug personalizzato — la forma che il prodotto scrive da se;
- W-79 dichiara «la revoca vede anche una scheda toccata mentre gira» misurando
  **una** taglia di club e **uno** sfasamento, in cui la finestra non si apre;
- nessuna sonda chiama la rotta `PATCH` con un corpo nudo.

**Aggiungere sonde non chiude questa classe**, perche la classe non e finita: e
il prodotto cartesiano fra i valori di un'enumerazione e i punti in cui
quell'enumerazione e ricopiata. Serve un cambio di forma, non un'altra sonda.

### Cosa NON e la causa

Per equita, tre cose che sarebbe comodo incolpare e che non c'entrano:

- **non e la mancanza di test**: 4.742 test verdi, 266 sonde comportamentali
  contro PostgreSQL, 39 sonde di concorrenza. Il problema non e la quantita;
- **non e il blob da solo**: R-1 e R-3 non vivono in `athletes.data`. Chi
  chiudesse solo la Causa A avrebbe ancora due dei tre reperti del round 28;
- **non e la disattenzione dei round precedenti**: ogni difetto trovato era
  reale e ogni correzione era corretta *per il caso che aveva in mano*. Il
  guasto e nella forma che rende «il caso che ho in mano» diverso da «il caso».

---

## 4. La correzione architetturale proposta

Tre interventi, in questo ordine. Nessuno dei tre e un fix incrementale.

### AC-1 — un tutore diventa una riga (chiude la Causa A)

```
athlete_guardians
  id                uuid    pk
  organization_id   uuid    not null
  athlete_id        uuid    not null
  user_id           uuid    null
  email             text    null
  relationship      text    null
  contact_only      boolean not null default false
  linked_at         timestamptz null
  revoked_at        timestamptz null
  unique (athlete_id, coalesce(user_id::text, lower(email)))
```

piu `athletes.anonymized_at` come **colonna**, non come chiave dentro il blob.

Modulo proprietario unico: `src/lib/server/athlete-guardians.ts`, l'unico che
scrive la tabella. `resources.ts` **toglie** `guardians` da `athletes.data` in
scrittura, e la rotta generica non puo piu ne perdere ne riportare una difesa
perche non la vede.

Cosa sparisce, non cosa si aggiunge:

- il riporto delle difese in `resources.ts` (cinque stesure) — **eliminato**;
- `lockAthleteRow` sui percorsi del tutore — **non serve piu**: la chiave unica
  fa il lavoro;
- il ciclo dello sweep — diventa
  `UPDATE athlete_guardians SET revoked_at = now() WHERE organization_id = $1 AND user_id = $2`,
  una istruzione, nessuna scansione, nessun ordine di acquisizione da
  incrociare: **PP02-D34 e PP02-D33 si chiudono entrambi**, e R-2 con loro;
- i due registri di scheda (`revokedGuardianIdentities`, `contactOnlyIdentities`)
  — **eliminati**: erano il surrogato di una chiave.

Stima: 600–900 righe toccate, di cui **~350 cancellate**. Migrazione con
retro-riempimento dal blob e doppia scrittura per una release.

### AC-2 — un solo dizionario del ruolo (chiude R-1 e la Causa B sull'asse ruolo)

Gli sweep smettono di avere un vocabolario proprio. `shouldUnlinkProfileForRole`
e i quattro gate chiedono `normalizeAccessRole` (che gia risolve i 36 alias) e
`parseCustomRoleValue` (che gia risolve il ruolo base di uno slug
personalizzato). I quattro `Set` di letterali si cancellano.

### AC-3 — una sola lettura del corpo (chiude R-3)

`resolveCreatePayload` sale in un modulo condiviso dalle due rotte di
`[resource]`. Un corpo, una regola, tutti e tre i verbi.

### Il criterio trasversale: il test di totalita

E la parte che impedisce alla Causa B di tornare, ed e piu importante dei tre
interventi.

> **Regola.** Ogni enumerazione che governa una difesa deve avere un test che
> **enumera il dominio canonico** e fallisce quando compare un valore non
> coperto. Non un test che prova i valori a cui l'autore ha pensato: un test che
> *deriva* i valori dalla fonte unica e li prova tutti.

Applicata ai tre casi noti:

- per ogni chiave di `ROLE_ALIASES` piu le quattro forme `custom:`, la revoca
  deve scollegare il profilo corrispondente;
- per ogni risorsa e per ogni verbo della rotta generica, `PATCH` e `upsert`
  devono dare **lo stesso verdetto** (il revisore del round 28 ha gia scritto
  questa invariante e l'ha eseguita su sei coppie: e la forma giusta);
- per ogni risorsa, `POST` e `PATCH` devono leggere il corpo allo stesso modo.

Un test cosi non prova un caso: **rende impossibile la classe**.

---

## 5. Sequenza proposta

| WP | Contenuto | Dipende da |
|----|-----------|------------|
| **WP-A** | AC-2 + AC-3 + i due test di totalita relativi. Nessuna migrazione, diff piccolo, chiude R-1 e R-3 | — |
| **WP-B** | Migrazione `athlete_guardians` + `athletes.anonymized_at`, retro-riempimento, doppia scrittura | — |
| **WP-C** | `athlete-guardians.ts` diventa l'unico scrittore; `resources.ts` smette di vedere `guardians`; sweep a una istruzione | WP-B |
| **WP-D** | Rimozione della doppia scrittura, del riporto, dei due registri e di `lockAthleteRow` dai percorsi del tutore; chiusura di PP02-D33 e D34 | WP-C |

WP-A e indipendente e da solo porterebbe il round a Critical 0 / High 1 (resta
R-2, che si chiude solo con WP-C).

---

## 6. Stato del ramo

- Ultimo commit di codice: **`f9aecf7`**. Gate a quel commit: 4.742 test verdi,
  typecheck silenzioso, 0 errori di lint, build compilata, 266/266 sonde PP-02
  contro PostgreSQL, 31/31 PP-01, 8/8 concorrenza Wave 4.
- **Nessun deploy su staging**: il mandato lo subordina a un round pulito, e
  questo round non lo e.
- I tre reperti sono registrati come debito: **PP02-D35**, **PP02-D36**,
  **PP02-D37**; **PP02-D34** e stato ricaratterizzato con la misura vera.

---

## 7. Stato dell'esecuzione

### WP-A — **FATTO** (2026-09-05)

AC-2, AC-3 e i due test di totalita
([ADR-0117](18-decision-log.md#adr-0117--una-difesa-che-dipende-da-unenumerazione-ha-un-test-che-enumera-il-dominio)).
Nessuna migrazione, nessun cambio di modello, 4 file di prodotto toccati.

| | Prima | Dopo |
|---|---|---|
| il vocabolario del ruolo negli sweep | 4 `Set` di letterali, 19 grafie | i predicati canonici di `access-roles.ts`, 36 alias + gli slug `custom:` |
| la lettura del corpo della rotta generica | 2 regole, una per verbo | `src/lib/server/resource-request-payload.ts`, una per tre verbi |
| una scrittura che non scrive niente | 200 | 400 |
| il dominio, nelle prove | i valori a cui l'autore aveva pensato | derivato dalla fonte unica, esercitato tutto |

Gate a questo commit: **4.742 test verdi**, typecheck silenzioso, 0 errori di
lint, **266/266** sonde PP-02 contro PostgreSQL, **6/6** totalita dei ruoli
(40 grafie), **10/10** totalita del corpo (22 risorse esercitate, 27 dichiarate
non esercitate con il motivo).

**Verificate per mutazione**, che e la sola ragione per cui contano:
riportando la difesa vecchia, `pp-02-totalita-ruoli.mjs` diventa rossa su
**23 grafie su 40** e `pp-02-totalita-corpo.mjs` su **22 risorse su 22**.

### Due correzioni a questo documento, che la misura ha imposto

Sono qui e non solo nel debito perche in entrambi i casi **questo file** era
piu ottimista del vero, e un'analisi della causa che sbaglia la misura e
esattamente il difetto che descrive al §3.

1. **§2, R-1 diceva «quattordici grafie».** Sono **diciannove**: al vecchio
   `STAFF_ROLES` mancavano anche le cinque forme di `owner`. Revocare la
   tessera di un proprietario **non** scollegava la sua scheda staff. Con le
   quattro forme `custom:` fanno **ventitre** su quaranta.

2. **§2, R-3 era classificato Medium**, con la nota «oggi nessun client e
   colpito (incartano tutti)». Misurato: sulla difesa vecchia, **ventidue
   risorse su ventidue** fra quelle scrivibili dalla rotta generica accettavano
   un `PATCH` della forma `{ ...campi, data: {...} }`, rispondevano 200 e **non
   scrivevano niente**. Non era una particolarita di `athletes` — era
   `categories`, `club_sites`, `trainers`, `staff_members`, `sponsors`,
   `payment_plans`, `document_templates`, `weekly_schedule` e le altre. La
   gravita vera e perdita di dati silenziosa sull'intera superficie di
   scrittura generica.

In tutti e due i casi il numero era stato **dedotto** leggendo il codice invece
che **eseguito**. E la stessa forma del §3: «il caso che ho in mano» diverso da
«il caso».

### WP-B, WP-C, WP-D — da fare

`athlete_guardians`, il modulo proprietario unico, la rimozione del riporto e
dei due registri. Chiudono `PP02-D33`, `PP02-D34` e R-2, che WP-A **non**
tocca. Finche non sono fatti, PP-02 non e FINAL: resta un High aperto (R-2),
misurato 5 giri su 5 su due taglie di club.

### WP-C — la forma giusta non e la doppia scrittura (rilievo, 2026-09-06)

Il §4 di questo documento propone, per la transizione, «doppia scrittura per
una release». Provando a scriverla e emerso che **quella forma ricrea la Causa
B**, ed e bene dirlo prima che qualcuno la implementi.

**Il ragionamento.** Una doppia scrittura significa: ogni posto che scrive
`athletes.data.guardians[]` scrive **anche** la tabella. Ma «ogni posto che
scrive i tutori» e un'enumerazione scritta a mano, che deve restare d'accordo
con la realta senza che nulla lo verifichi — cioe esattamente la forma che il
§3 descrive e che ADR-0117 esiste per rendere impossibile.

E non e un rischio teorico: **il conteggio degli scrittori e stato rifatto
quattro volte in questo perimetro, e ogni volta cresceva** (4 → 6 → 8 → 9 →
16). Un sedicesimo scrittore dimenticato, in un mondo in cui la **decisione di
accesso** vive nella tabella, non e una riga che manca in una schermata: e un
tutore che la revoca non vede.

**Il censimento, rifatto.** Gli scrittori del blob che contano si riducono
pero a meno di quanto sembra, ed e il rilievo utile:

| dove | quanti punti di scrittura | nota |
|------|---------------------------|------|
| `resources.ts` | **6 istruzioni, dentro 2 sole funzioni** — `createResource` (4) e `updateResource` (2) | e l'anagrafica, cioe la via maestra |
| `profile-account-links.ts` | 2 — `unlinkGuardianAccount`, `unlinkParentGuardians` | scollegamento e sweep |
| `form-submissions.ts` | 1 — l'approvazione del modulo pubblico | |
| `access/redeem/route.ts` | 1 — il riscatto del gettone | |
| `data-subject.ts` | 1 — la cancellazione dell'interessato | |

Sono **cinque file e undici istruzioni**, non sedici scrittori sparsi: la
stima di 600–900 righe del §4 regge, e la parte di `resources.ts` si aggancia
in due punti soli invece che in sei.

**La forma corretta, allora, e quella che il §4 gia dice** e che la doppia
scrittura contraddiceva: `resources.ts` **toglie** `guardians` da
`athletes.data` in scrittura, e la rotta generica non puo piu ne perdere ne
riportare una difesa **perche non la vede**. Non due fonti tenute in accordo da
una lista di chiamanti: una fonte sola, e le altre quattro strade che passano
dal modulo proprietario.

**Conseguenza sulla sequenza.** WP-C non si puo spezzare in «prima la tabella
si popola, poi i lettori la guardano»: nell'intervallo la tabella sarebbe vera
per alcune strade e falsa per altre, e la prima cosa che la guardera e la
**revoca**. O si spostano scrittori e lettori insieme, o non si sposta niente.

**Stato.** Il modulo proprietario e scritto — chiave d'identita, riporto
conservativo sulle difese, sweep in una istruzione, anonimizzazione — ma **non
e stato committato**, perche senza i suoi chiamanti sarebbe codice
irraggiungibile (CLAUDE.md §11.8), che e il difetto che questo stesso documento
elenca fra quelli da non ripetere. Va ripreso insieme al suo cablaggio, in un
commit solo.

**Cosa resta vero, misurato**: `PP02-D33`, `PP02-D34` e R-2 sono ancora aperti,
e la finestra della revoca e ancora l'intera durata dello sweep. Finche WP-C e
WP-D non sono fatti, **PP-02 non e FINAL**.

### WP-C + WP-D — **FATTO** (2026-09-06)

Eseguiti come **un solo cutover**, e non per fretta: una fase intermedia in cui
alcuni scrittori toccano la tabella e altri il blob, con i lettori di sicurezza
liberi di scegliere, e esattamente la forma da cui questo pacchetto e nato.

#### Cosa e cambiato

| | Prima | Dopo |
|---|---|---|
| l'autorita sui tutori | `athletes.data.guardians[]`, un array JSON senza chiave | `athlete_guardians`, unica per `(athlete_id, identity_key)` |
| chi la scrive | diciannove istruzioni su otto file, tre delle quali nel browser | **una** funzione, e a farlo valere e un vaglio dell'archivio (ADR-0119) |
| la revoca di una tessera | un ciclo su ogni tesserato del club | una `UPDATE` con un `WHERE` |
| la ricerca dei figli di un tutore | una scansione di `athletes` in SQL grezzo dentro un array JSON | una interrogazione su un indice |
| il riporto delle difese in `resources.ts` | cinque stesure, ~640 righe | **cancellato** |
| i due registri di scheda | il surrogato di una chiave unica | **cancellati** |
| `athletes.data.guardians[]` | l'archivio | una **proiezione in sola lettura** che nessuna decisione di accesso guarda |

#### Il censimento, rifatto da zero

Non aggiornato: **rifatto**, contro il codice, con un revisore indipendente.
Sono **diciannove istruzioni di scrittura** in grado di cambiare uno stato di
tutore, su **otto file** — non sedici. Le tre in piu vivono in
`src/lib/simplified-db.ts`, cioe nel **browser**: compongono il blob e lo
mandano alla rotta generica, e nessuno dei cinque censimenti precedenti le
aveva nominate.

E il motivo per cui l'elenco cresceva ogni volta e sempre lo stesso, ed e
strutturale: la rotta generica scrive attraverso un delegato **calcolato a
runtime**, quindi nessuna ricerca testuale la trova e **nessun elenco scritto a
mano puo essere completo per costruzione**. Un test che portasse la lista dei
file «che oggi conosciamo» ripeterebbe lo stesso errore in forma di prova
(ADR-0119).

#### Il travaso di WP-B perdeva quattro identita e ne inventava quattro

WP-B aveva dichiarato «14 identita → 14 righe, 0 perse». Quel conteggio misura
che nessuna riga e sparita, e non e la proprieta che conta. La proprieta che
conta e un'**equivalenza fra due predicati**, e misurata su ventiquattro grafie
storiche il travaso sbagliava in **tutti e due i versi**:

- **quattro perse** — `linkedUserIds[]`, `linked_user_ids[]`, `linkedUserEmail`,
  `linked_user_email`, piu due identificativi sulla stessa riga e l'indirizzo di
  accesso diverso da quello di recapito. Un tutore legittimo avrebbe perso
  calendario, rate, ricevute, documenti e certificato **senza che nessuna
  schermata lo spiegasse**;
- **quattro inventate** — `parents[]`, `tutors[]`, `tutori[]`, e `parent1`
  quando `guardians` non e vuoto. Una persona che nessun predicato riconosce
  avrebbe aperto il fascicolo sanitario di un minore.

Le due cause sono la stessa vista da due lati: **un elenco scritto a mano invece
che derivato da chi decide**. Il travaso leggeva quattro grafie
dell'identificativo dove `guardianDeclaredIds` ne legge sei (e conta anche gli
elementi di un array), e **univa** sei collezioni dove `getGuardianRows` ne
legge una sola con una precedenza.

E la stessa causa che il §3 di questo documento descrive, in un posto in cui
nessuno l'aveva cercata: **una migrazione e codice, e le sue enumerazioni
invecchiano come le altre**.

Corretto con una migrazione in avanti — la precedente era gia stata applicata —
che rifa il travaso daccapo. Si puo, e non e una fortuna: nessun codice di
prodotto scriveva `athlete_guardians`, quindi ogni riga presente veniva dal
travaso.

#### Le misure

| Proprieta | Prima | Dopo |
|---|---|---|
| `R-2` — nessuna scheda sfugge alla revoca, a nessuno sfasamento | 7 su 7 sfuggono, revoca ~840 ms | **0 su 7**, revoca ~84 ms |
| l'equivalenza del travaso, 24 grafie | 11 righe rosse (4 perse, 4 inventate) | **24/24**, con due divergenze **dichiarate** |
| il vaglio del proprietario, 6 prove | — | **6/6**, e **4 su 6 rosse** togliendo il vaglio |
| `npm test` | 4.754 | 4.754 |
| sonde PP-02 contro PostgreSQL | 266 | 266 |
| `scripts/riscatto-perimetro.mjs` | 31/31 | 31/31 |
| totalita dei ruoli / del corpo | 6/6, 10/10 | 6/6, 10/10 |

#### Le due divergenze, dichiarate invece che scoperte

`scripts/pp-02-travaso-equivalente.mjs` non esenta i casi in cui il passaggio
cambia risposta: pretende **esattamente** la risposta dichiarata, quindi se
domani cambiasse — nell'uno o nell'altro verso — la riga diventa rossa.

1. **un restringimento**: una revoca registrata sull'identita chiude adesso
   tutti e due i percorsi. Prima un legame **dichiarato** sopravvissuto allo
   sweep continuava ad aprire, ed e il caso che `R-2` misura: la difesa non
   interveniva proprio quando serviva;
2. **un allargamento**: un tutore collegato **senza tessera** trova i propri
   figli con tutte e sei le grafie dell'identificativo invece che con quattro.
   E cio che `getParentLinkedAthletes` dichiarava di volere e che la sua
   ricerca realizzava solo in parte.

#### Il predicato vecchio, congelato

Fino al commit della correzione del travaso la sonda dell'equivalenza chiamava
`getParentLinkedAthletes`, cioe la porta vera. Dopo il cutover quella porta
legge la tabella: chiamarla confronterebbe la tabella con se stessa.

La regola vecchia vive percio **dentro la sonda**, copiata dal codice che
c'era. Che la copia sia fedele non e un'opinione: prima del cutover girava
contro l'originale e dava lo stesso verdetto su tutti e ventiquattro i casi,
divergenze comprese e con lo stesso verso.
