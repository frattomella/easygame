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
([ADR-0130](18-decision-log.md#adr-0130--una-difesa-che-dipende-da-unenumerazione-ha-un-test-che-enumera-il-dominio)).
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
§3 descrive e che ADR-0130 esiste per rendere impossibile.

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
| chi la scrive | diciannove istruzioni su otto file, tre delle quali nel browser | **una** funzione, e a farlo valere e un vaglio dell'archivio (ADR-0136) |
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
(ADR-0136).

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

---

## PP-02 — il vaglio strutturale, e i sette reperti (2026-09-06)

Due revisori indipendenti hanno attaccato il passaggio dei tutori all'archivio
relazionale, con la regola che ogni sonda dovesse **discriminare**: mutare la
difesa e mostrare che diventa rossa.

Hanno trovato **sette difetti**. Cinque li aveva introdotti il passaggio stesso,
poche ore prima. E il numero che conta di piu e un altro: fra le **268 sonde
contro PostgreSQL e i 4.754 test** che c'erano gia, **nessuna** ne vedeva uno.

| Reperto | Gravita | Il presupposto che era falso |
|---|---|---|
| il primo salvataggio di una scheda **travasata** cancellava l'accesso del tutore, o rispondeva 403 e la scheda non si salvava piu | **Critical** | «se la chiave calcolata non combacia, l'identita e cambiata» — su una scheda travasata non combacia **mai**: la chiave e l'utenza, cio che torna e l'indirizzo |
| una revoca non chiudeva il **gettone** pendente: la persona espulsa lo riscattava e rientrava, con tessera nuova | **Critical** | «il ripristino del gettone non ha piu niente da difendere» — era l'unico posto da cui passava l'identificativo del record |
| una persona **revocata** restava fra i destinatari dei promemoria sul certificato di un minore e dei solleciti con il link per pagare | **Critical** | «i due registri erano il surrogato di una chiave» — come **archivio** si, come **denormalizzazione per i canali di avviso** servivano ancora |
| un ruolo ristretto ai **soli moduli** si scriveva addosso il fascicolo sanitario di un minore approvando una pratica | **High** | «chi esamina le pratiche e la gestione» — vero per i quattro ruoli canonici, falso per i ruoli personalizzati, che esistono per sciogliere quel mazzo |
| l'indirizzo **verificato** si scriveva dal registro generico, e da li si apriva l'area famiglia di un minore qualunque | **High** | «cambiare indirizzo azzera la verifica» — lo fa la rotta dedicata, non il registro |
| il travaso **fondeva** madre e padre con un indirizzo di famiglia: del secondo restava il nome del primo, e la ricevuta usciva intestata al minore | **High** | «due righe con la stessa identita sono la stessa persona» — con un indirizzo condiviso sono due |
| la proiezione cancellava **codice fiscale, indirizzo e data di nascita** del tutore, per tutto il club, senza modo di riscriverli | **High** | «la proiezione riproduce la forma vecchia» — riproduceva le colonne che esistevano |

Piu due Medium: cancellare la propria utenza falliva per chiunque fosse tutore
(`SET NULL` e una `UPDATE`, che il vaglio rifiutava), e `bloccaSchede`
inghiottiva un `40P01` lasciando la transazione avvelenata e l'operatore con un
messaggio che non nomina ne la causa ne il rimedio.

### Cosa insegna, al di la delle sette correzioni

**1. Le sonde misuravano le porte, non i dati che ci passano.** Tutte
seminavano club nuovi. Nessuna seminava un club **travasato**, ed e li che
vivevano due dei tre Critical: la differenza fra una riga nata dal prodotto e
una nata dalla migrazione non era misurata da nessuna parte.

**2. Cancellare una difesa chiede la stessa prova che aggiungerla.**
`restoreGuardianAccessTokens` e stato tolto con la motivazione «non ha piu
niente da difendere». Era vero per cio che difendeva **in vista** — il gettone
dentro il blob — e falso per cio che trasportava: l'identificativo del record.
Nessuna sonda copriva quel trasporto, perche nessuno lo aveva mai chiamato una
difesa.

**3. Una regola scritta in un posto solo va cercata in tutti i posti che fanno
la stessa cosa.** «Un salvataggio d'anagrafica non concede accessi» era
diventata la regola del modulo proprietario, e la porta dei moduli faceva la
stessa cosa senza gate. La domanda giusta non e «la regola e scritta?» ma
«quante porte producono questo effetto?».

**4. Una proiezione riproduce cio che le si dice di riprodurre.** Il codice
fiscale non aveva una colonna, quindi non c'era: e non decideva niente, quindi
nessuna difesa se ne e accorta. Cio che non decide niente si perde in silenzio.

### La risposta, oltre alle correzioni

`scripts/pp-02-vaglio-strutturale.mjs`: i sette reperti come prove permanenti,
ognuna con il suo **controllo** — la stessa mossa dove la difesa non deve
intervenire. Le sonde dei revisori erano usa e getta; queste proprieta non lo
sono, perche ognuna nasce da un presupposto che sembrava ovvio e sembrera ovvio
di nuovo.

E `scripts/helpers/travaso-tutori.mjs` cerca adesso **l'ultima** migrazione che
porti il travaso, invece di nominarla: due volte una sonda ha continuato a
misurare la versione vecchia, verde, mentre il prodotto era cambiato sotto.

---

## Il secondo vaglio indipendente (2026-09-06)

Chiusi i sette reperti del vaglio strutturale, una **seconda** revisione
indipendente ha attaccato lo stesso pacchetto senza conoscerlo: PostgreSQL vero,
entrypoint vere, ogni sonda tenuta a dimostrare di discriminare. Ha trovato
**0 Critical, 4 High, 1 Medium**.

| # | gravita | dove |
|---|---------|------|
| R-1 | High | `resources.ts` — ogni salvataggio cancellava i due registri di difesa |
| R-2 | High | `resources.ts` — un salvataggio con `data` e senza `guardians` cancellava tutte le righe |
| R-3 | High | `profile-account-links.ts` — la revoca non chiudeva l'area famiglia se la tessera non era `parent` |
| R-4 | High | `athlete-guardians.ts` — un invito senza `token_type` sopravviveva a ogni revoca |
| R-5 | Medium | `athlete-guardians.ts` — la lettura dei gettoni non aveva filtro di club |

### Il numero che conta

Nessuno dei cinque sta dentro `athlete-guardians.ts`. **Tutti** sul bordo, dove
il modulo proprietario incontra chi lo chiama — e nessuno era visto dalle 268
sonde, dai 4.754 test e dal vaglio strutturale che c'erano prima.

E la seconda volta di fila che i reperti stanno tutti sul confine. La prima si
poteva leggere come un caso; due volte e una proprieta del problema. Un dominio
con un proprietario unico non lo mette in sicurezza il proprietario: lo mettono
in sicurezza i suoi confini, e sono loro che vanno attaccati per primi.

### La sonda che descriveva il difetto invece di difendere da lui

R-3 ha una coda che vale piu del reperto. `pp-02-totalita-ruoli` chiedeva, per
ogni grafia di ruolo, che revocare una tessera **non** togliesse il legame di
famiglia — la protezione giusta, con l'intenzione giusta scritta in testa al
file: «revocare la tessera di allenatore a un padre gli toglierebbe l'accesso ai
figli».

Ma la sua semina dava a ogni soggetto **una sola** tessera. Con una tessera
sola, revocarla non e togliere un ruolo: e togliere la persona dal club. La
sonda stava percio pretendendo che l'area famiglia sopravvivesse a un'uscita
completa — cioe **asseriva il difetto**, e sarebbe diventata rossa sulla
correzione.

Non e stata allentata. E stata divisa in due proprieta con due semine diverse:
T-13 (una tessera sola, l'area si chiude) e T-15 (due tessere, revocata l'altra
i figli restano). Rimettendo il difetto vecchio cade T-13; togliendo il freno
alla correzione cade T-15. Nessuna delle due, da sola, distingue la correzione
dal difetto opposto.

**La lezione.** Quando una sonda di sicurezza diventa rossa su una correzione,
la prima domanda non e quale delle due sia sbagliata: e **quale scenario la sua
semina rappresenta davvero**. Qui la semina rappresentava un caso che
l'intenzione scritta nel file non nominava.

---

## Il terzo vaglio indipendente (2026-09-06)

**1 Critical, 3 High, 2 Medium.** Come le due volte precedenti: nessun reperto
dentro `athlete-guardians.ts`, tutti sul bordo.

| # | gravita | cosa |
|---|---------|------|
| R-B | Critical | il riscatto collega un tutore per una via che non passava dal predicato condiviso |
| R-A | High | due revoche concorrenti si assolvono a vicenda: zero tessere, tutore ancora collegato |
| R-C | High | revocare la madre revocava la riga del padre che condivide l'indirizzo di famiglia |
| R-G | High | abbraccio mortale con il riallineamento di stagione: PP02-D34 su un'altra coppia |
| R-E | Medium | `guardians` con un valore non-elenco cancellava tutte le righe |
| R-H | Medium | due salvataggi concorrenti perdono un tutore (debito D49) |

### Il Critical, e come l'ho generato io

La revisione precedente aveva trovato che lo sweep dei gettoni era **piu
stretto** del riscatto. Ho unito le due letture in una funzione sola e ho
scritto nel codice: «allargare questa porta allarga anche la revoca, e non si
puo piu allargarne una sola».

**Era falso, e l'ho scritto con la sicurezza di chi ha appena misurato.** La
funzione condivisa governa la decisione sul **ruolo**; il collegamento del
tutore avviene piu sotto, su `parentTarget?.guardian`, che dipende dalle sole
`athlete_id` + `guardian_id` e avviene **qualunque sia il ruolo**. Un carico con
`role: "trainer"` e le due chiavi collegava percio un tutore che nessuna revoca
sapeva chiudere — e riapriva la riga: `revoked_at` azzerato, utenza riscritta,
in audit un `accessTokenRedeemed` che diceva soltanto `trainer`.

Avevo unito **due domande diverse** credendole una: «questo gettone concede il
ruolo di genitore?» e «questo gettone puo collegare un tutore?». La seconda e
piu larga, ed e quella che la revoca deve farsi. Ora sono due funzioni con una
relazione dichiarata — la stretta e per costruzione un sottoinsieme della larga
— e una sonda enumera le forme di carico per verificarlo.

### Il filo, tre volte su tre

La revisione l'ha detto meglio di come l'avevo capito io:

> le tre affermazioni di sicurezza piu forti del pacchetto sono documentate nei
> commenti e non presidiate da nessuna prova. Ogni volta la frase e vera del
> pezzo che e stato corretto e falsa del pezzo accanto che nessuno ha
> riguardato.

Tre affermazioni, tutte mie, tutte false: «le due porte sono larghe uguale»
(R-B), «non c'e un ordine di acquisizione da incrociare con il rollover» (R-G),
«non c'e uno snapshot da rimandare» (R-H, in parte).

**La regola che ne ricavo.** Un commento che afferma una proprieta di sicurezza
e un debito finche non ha una sonda che la misura. Le tre affermazioni sono ora
tre asserzioni: l'invariante fra i due predicati, il vaglio strutturale su chi
prende l'ordine dei blocchi, e la misura dichiarata di D49.

### La sonda che non discriminava

Il vaglio strutturale di R-G cercava `bloccaSchede` dentro il testo dei moduli.
Togliendo la **chiamata** e lasciando l'`import`, restava verde: cercava il
nome, non l'atto. Se ne e accorta la verifica di mutazione, non la lettura —
ed e l'unica delle undici mutazioni di questa tornata a non aver discriminato.

Corretta a cercare `bloccaSchede(`, e diventata rossa **subito**, su un terzo
modulo che nessuno aveva guardato: `unlinkDirectAthleteProfile` scriveva le
schede in massa senza prendere l'ordine. Da li il residuo vero — dentro **una**
transazione i due sweep prendevano due lotti, e due lotti crescenti non sono un
ordine crescente — chiuso bloccando l'unione a monte, in un lotto solo.

---

## Il quarto vaglio indipendente (2026-09-06)

**1 Critical, 3 High, 1 Medium.** Quattro su cinque erano affermazioni scritte
nei commenti e non presidiate da nessuna sonda — la regolarita che ADR-0138
aveva appena nominato, confermata su se stessa.

| # | gravita | l'affermazione che era falsa |
|---|---------|------------------------------|
| R-1 | Critical | «un salvataggio d'anagrafica non puo far crescere l'insieme delle identita che aprono il fascicolo» |
| R-2 | High | «chiudere il gettone e la differenza fra una revoca e una revoca che si puo annullare» |
| R-3 | High | (la correzione del giorno prima, applicata al club invece che alla scheda) |
| R-4 | High | «cio che si perde nella ricomposizione non decide niente li, perche li nessuno decide un accesso» |
| R-5 | Medium | «un tutore vive dentro `athletes.data.guardians`» — in `data-subject.ts`, non piu vera da WP-C |

### R-2 e R-3 sono i due lati della stessa correzione, fatta il giorno prima

Il terzo vaglio aveva trovato che revocare una madre revocava anche la riga del
padre che condivide l'indirizzo di famiglia. La correzione distingueva **per
scheda**: «se qui c'e una riga provatamente sua, quelle prese dal solo indirizzo
sono di un altro».

Sbagliata dai due lati insieme, ed e istruttivo che siano stati trovati nello
stesso passaggio:

* **troppo stretta sulla scheda della persona** — la sua seconda riga veniva
  risparmiata, e con lei il gettone che la nomina: rientrava riscattandolo;
* **troppo larga sul resto del club** — il `WHERE` e di club e il risparmio era
  per scheda, quindi altrove cadeva tutto, compresa la riga di un terzo con
  un'utenza propria.

La regola che le sostituisce non guarda la scheda: si risparmia **solo** una
riga che porta l'utenza di un'altra persona (ADR-0139). Le due mutazioni la
fissano dai due lati — risparmiando di piu la persona revocata rientra,
risparmiando di meno il terzo viene tagliato fuori — e nessuna delle due
asserzioni, da sola, distingue la regola dal difetto opposto.

### Il Critical: contare le righe non e contare le identita

Il vaglio sulla concessione contava le righe che **nascono**. Riusare l'`id` di
una riga esistente — che la proiezione pubblica — bastava a scavalcarlo: un
ruolo di club «Segreteria» con **zero caselle** spuntate spostava il legame di
un minore su un indirizzo qualunque, e chiunque avesse una tessera nel club e
quell'indirizzo verificato apriva il fascicolo, dato clinico compreso. Misurato
dalla rotta HTTP vera, con il cruscotto famiglia che consegna allergie e
patologie.

Il numero delle righe non era mai stato la cosa giusta da guardare. Ora si
confrontano gli **insiemi di identita**, prima e dopo — e si confronta il valore
che verra scritto, non quello che il client manda: il primo tentativo negava un
salvataggio che tentava di togliere il segno di solo-recapito, che e appiccicoso
e non si toglie, quindi non apriva niente.

### La regola che non ho tenuto, e che ora e una sonda

Negare **ogni** crescita e gia stato provato, e il prezzo era che una segreteria
non potesse piu correggere un refuso in un'email. La correzione ha quindi un
controllo esplicito accanto al reperto: lo stesso `PATCH`, dallo stesso ruolo
ristretto, verso un indirizzo **che non e di nessuno**, deve riuscire — e
riesce.

---

## Il quinto vaglio indipendente (2026-09-06)

**1 Critical, 2 High, 1 Medium latente.** Quinta volta su cinque: tutti sul
bordo, e tutti e quattro dalla miniera che ADR-0138 aveva dichiarato — una
frase di sicurezza scritta in un commento, vera del pezzo appena corretto e
falsa del pezzo accanto.

| # | gravita | la frase falsificata |
|---|---------|----------------------|
| R-1 | Critical | «la revoca e un fatto sulla riga, e si toglie **solo** riscattando un invito» |
| R-2 | High | (la stessa, dal verso opposto: si puo **chiudere** un accesso senza revocarlo) |
| R-3 | High | «una posizione in piu su una ricevuta e un difetto di forma» — scritta da me il giorno prima |
| R-4 | Medium | «questa porta non concede senza la chiave» — vera solo per un chiamante che passi `false` |

### Il Critical: la difesa non era dove ne stava il nome

`revoked_at` e il **marchio** della revoca. Cio che tiene chiusa la porta e la
coppia `(identity_key, email)` della riga revocata, che `findGuardianLinks`
interroga per sapere **di chi** e la revoca. Il salvataggio dell'anagrafica
riscriveva entrambe, e il vaglio sulla crescita — scritto lo stesso giorno — non
poteva vederlo, perche mappa ogni riga revocata su niente: una riga revocata non
apre, quindi non fa crescere l'insieme. Il ragionamento era giusto e la
conclusione sbagliata, perche la domanda non era «questa riga apre?» ma «questa
scrittura tocca cio che tiene chiusa una porta?».

**La regola generale.** Quando una difesa e implementata da una *query* e non da
una colonna, cio che va protetto sono i **campi che quella query interroga**.

### R-3: avevo scritto io la frase, il giorno prima

Correggendo il quarto vaglio avevo smesso di fondere le righe con un legame
vivo, e avevo scritto: «una posizione in piu su una ricevuta e un difetto di
forma; un accesso vivo che nessuna schermata mostra e un difetto di sicurezza».

La seconda meta era vera. La prima no, e la misura l'ha mostrata subito: al
primo salvataggio la proiezione passa da due voci a tre e ogni lettore
posizionale slitta di uno — fra questi il **destinatario fiscale** di una
ricevuta, cioe il codice fiscale che una famiglia porta in detrazione, e
l'indice con cui l'approvazione di un modulo dice quale riga sta sostituendo,
che di li ne cancella una viva e diversa.

Avevo scelto fra due mali dichiarandone uno lieve **senza misurarlo**. Era la
terza volta in tre giorni che una mia frase di sicurezza risultava vera del
pezzo appena toccato e falsa di quello accanto — e stavolta l'avevo scritta
*dopo* aver formulato ADR-0138, che dice esattamente di non farlo.

La fusione e tornata com'era, e il buco si chiude dall'altro lato: la scheda
mostra una voce, e revocarla revoca **tutte** le righe che le stanno dietro.

### La deriva dell'archivio

Alla fine di questo giro una sonda del vaglio strutturale e diventata rossa
senza che il codice fosse cambiato: nel database di sviluppo la funzione del
vaglio era la **versione precedente**, riapplicata prendendo il file di una
migrazione piu vecchia. Per mezza giornata la deroga che permette di cancellare
il proprio account non c'era, e delle quattordici sonde una sola se ne e
accorta, per caso.

Una difesa che vive nell'archivio non la vede nessuna revisione del codice e
non la mostra `git diff`. Ora c'e una sonda che confronta la funzione **viva**
con le condizioni che la migrazione piu recente dichiara, estratte dal file
(ADR-0141). Rimettendo la versione vecchia nomina le otto condizioni mancanti.

---

## Il sesto vaglio, interrotto — e cio che aveva gia visto (2026-09-06)

Il sesto revisore indipendente e stato interrotto dall'arresto della macchina.
Non ha lasciato un referto: ha lasciato una sonda a meta con **tre ipotesi**
scritte in testa al file. Una si verifica leggendo il codice, ed e un difetto
reale.

**Il difetto (§T).** Il commit precedente aveva allargato `revokeGuardianRow`
per revocare **l'intera voce** — tutte le righe che la scheda mostra come una
sola. Lo sweep dei gettoni che accompagna la revoca continuava pero a ricevere
**una** riga: quella che il chiamante aveva nominato. Un invito che nominasse
una delle altre restava percio `active` dopo una revoca riuscita, e
`linkGuardianAccount` azzera `revoked_at` e riscrive l'utenza: chi aveva quel
codice in tasca rientrava nel fascicolo del minore.

E la terza volta che questo pacchetto riapre la stessa forma — una revoca che
lascia viva la propria strada di ritorno — e la prima in cui la causa non e una
difesa dimenticata ma una difesa **allargata a meta**: *quando si allarga una
porta, si allarga anche cio che la porta chiude*.

**Le altre due ipotesi**, non ancora misurate, sono passate al vaglio nuovo:

* **§M** — un salvataggio ordinario cancella la riga nascosta dietro una voce
  (non e nominata, e la `DELETE` risparmia solo le righe revocate). Toglie un
  accesso, quindi non e un varco; ma distrugge in silenzio un tutore legittimo,
  senza revoca e senza audit. Vicino a D49.
* **§P** — le posizioni delle righe **revocate** non si rinumerano, mentre le
  righe in arrivo prendono l'indice dell'array. Due righe possono percio
  finire sulla stessa posizione e la proiezione le fonde, con la regola «chi
  chiude vince»: un tutore **vivo** verrebbe mostrato come revocato. Sarebbe un
  falso senso di revoca — la schermata dice chiuso, l'archivio dice aperto.

### La lezione sul metodo

Un revisore perso non e una revisione persa a zero: le **ipotesi** che aveva
scritto sono sopravvissute nel file di sonda, e una si e chiusa senza bisogno
del suo referto. Vale la pena scrivere in testa a una sonda *quale frase si sta
cercando di falsificare*, prima di riuscirci.

---

## Il sesto vaglio indipendente (2026-09-06)

**2 Critical, 1 High, 1 Low.** Le due ipotesi che il revisore interrotto aveva
lasciato scritte in testa alla sua sonda erano **vere tutte e due**, ed erano la
stessa: la `position` era diventata una chiave che nessuno teneva unica
(ADR-0142).

Il difetto piu istruttivo non e pero nel prodotto. E nella sonda.

### La terza sonda vacua, e la peggiore

ADR-0141 — scritto il giorno prima — aveva introdotto una sonda che confronta la
funzione viva del vaglio d'archivio con quella dichiarata dalla migrazione,
**proprio** perche l'ambiente aveva gia subito una deriva silenziosa.

Il vaglio l'ha falsificata in due mosse: spegnere il trigger, o riscrivere la
funzione con tutte le condizioni dichiarate e il `RAISE EXCEPTION` sostituito da
un `RETURN`. In entrambi i casi **la sonda resta verde** e una scrittura fuori
dal modulo passa.

Terza volta che una sonda di questo pacchetto cerca un **nome** invece di un
**atto**:

1. il vaglio strutturale cercava `bloccaSchede` nel testo, e trovava l'`import`;
2. due asserzioni descrivevano lo **stato di sfruttamento** invece della
   proprieta, e passavano solo finche il difetto c'era;
3. questa confrontava il **testo** di una difesa invece di tentarla.

E la terza e la piu grave, perche era stata scritta apposta per accorgersi di
qualcosa che il codice non mostra. **Una difesa dell'archivio si misura tentando
di violarla** (ADR-0143) — e la scrittura deve toccare una riga che esiste: la
prima correzione scriveva su un atleta inesistente ed era verde con il vaglio
spento, perche un trigger di riga su zero righe non scatta. La stessa forma di
errore che stava misurando, due volte di fila.

### La correzione che ha rotto la correzione precedente

Allineando la revoca alla lettura — «si chiude la persona su questa scheda, non
la voce che la mostra» — la sonda del quarto vaglio e diventata rossa: la regola
di ADR-0139, che risparmia le righe con l'utenza di **un'altra** persona, ora
risparmiava anche le righe **dentro la voce** che l'operatore aveva
esplicitamente tolto.

Le due regole erano entrambe giuste e in conflitto, e la distinzione che le
riconcilia non e sulla gravita ma sulla **provenienza della selezione**: la voce
e cio che l'operatore ha davanti e ha deciso di togliere — intenzione
dichiarata; l'estensione per identita e inferenza nostra. La regola del terzo
risparmiato vale sulla seconda, non sulla prima.

Senza la sonda del quarto vaglio ancora in piedi, questa correzione avrebbe
riaperto in silenzio un Critical chiuso due giorni prima.

---

## Il settimo vaglio indipendente (2026-09-06)

**1 Critical, 2 High**, piu un'intermittenza trovata correggendoli. Settima volta
su sette: tutti sul bordo. Due dei tre falsificano frasi scritte nelle ventiquattro
ore precedenti.

| # | gravita | la frase falsificata |
|---|---------|----------------------|
| R-1 | Critical | «Le posizioni tenute da chi sopravvive **senza esserne nominato** si saltano» — guardava solo le righe **revocate** |
| R-2 | High | «la regola vale **piena** sull'estensione per identita» — `!suaUtenza ||` la spegneva del tutto |
| R-3 | High | «chiuderlo e la differenza fra una revoca e una revoca che si puo annullare» — vero delle due porte che si chiamano revoca, falso della terza |

### R-3 e la quarta ricorrenza della stessa forma

«Una revoca che lascia viva la propria strada di ritorno» e ricomparsa per la
quarta volta, e stavolta sulla **sola porta che non porta quel nome**: togliere
un tutore dalla scheda. Nessuno la chiama revoca, quindi nessuno le aveva dato
cio che accompagna una revoca — e bastava rimettere la persona perche il vecchio
invito tornasse spendibile, perche il client rimanda l'identificativo che aveva
letto e quello diventa il `legacy_id` della riga nuova.

Le tre volte precedenti la causa era stata una difesa dimenticata, poi una
allargata a meta, poi di nuovo. Questa volta e **una porta che non si era
riconosciuta come tale**.

### L'intermittenza, e perche stava per essere archiviata

Chiusi i tre reperti, la sonda del settimo vaglio dava **30/30 da sola e 28/30
in sequenza**. La spiegazione comoda era «sonda instabile».

Otto esecuzioni di fila: tre rosse. E le due asserzioni che cadevano erano quelle
sul **destinatario fiscale** — il codice fiscale stampato sulla ricevuta che una
famiglia porta in detrazione — che cambiava persona da un'esecuzione all'altra.

La causa era nella correzione appena scritta: la rinumerazione riscrive la
posizione delle righe **nominate**, e lasciava quelle nascoste sulla vecchia, da
dove potevano collidere con un'altra voce. A pari posizione la fusione sceglie
per identificativo, che e casuale: da li il caso.

**La lezione.** Un difetto che si presenta tre volte su otto non lo si riproduce
quando lo si cerca, e la sonda che lo trova viene creduta instabile invece che
informativa. Una sonda che cambia esito senza che il codice cambi non e instabile
finche non lo si e **dimostrato**: e un difetto che non si sa ancora nominare.

---

## L'ottavo vaglio indipendente (2026-09-06)

**0 Critical, 4 High, 1 Medium** — e per la prima volta in otto giri **nessun
Critical**. Tutti e quattro gli High di nuovo sul bordo, e nessuno dentro cio
che le ultime tre revisioni avevano corretto: le correzioni tengono, i difetti
si sono spostati alle porte accanto.

| # | gravita | dove |
|---|---------|------|
| R-1 | High | l'approvazione di un modulo toglie un tutore e non chiude il suo invito |
| R-2 | High | la sostituzione toglie **una riga** dove la voce ne mostra due |
| R-3 | High | `unlinkGuardianAccount` scriveva **fuori dal proprio club**, su una chiave che il client puo scrivere |
| R-4 | High | l'oblio lasciava nome e indirizzo del tutore nel carico di un invito, e l'invito vivo |
| R-5 | Medium | la traccia diceva «Genitore aggiunto» proprio quando una riga viva era stata cancellata |

### La frase falsificata in ventiquattro ore, di nuovo

Il settimo vaglio aveva chiuso una porta e il commento diceva «e la **sola**
strada». Ne esistevano tre. La regolarita e ormai una legge del pacchetto: **una
frase che dice «l'unico», «sempre», «mai» invecchia peggio di qualunque riga di
codice**, e va scritta come asserzione o non scritta.

La domanda giusta davanti a una porta non e «si chiama revoca?» ma «dopo questa
istruzione, quella persona puo ancora rientrare?».

### Una difesa in piu che era una porta in piu

Il reperto piu istruttivo e R-3, perche il blocco incriminato **esisteva per
sicurezza**: chiudeva il gettone «per sicurezza in piu», dice il suo commento.
Lo faceva leggendo l'identificativo da una chiave del blob che la rotta generica
lascia scrivere, e passandolo a un `updateMany` senza filtro di club. Una
scrittura cross-tenant, dentro una funzione che nessuno sospettava.

Ed era **ridondante**: la strada buona esisteva gia due righe sopra. Una difesa
che si appoggia a un dato che l'attaccante controlla non e una difesa in piu.

### La correzione che ha rotto un test, e perche va detto

Togliendo quel blocco ho tagliato anche la riga di audit che gli stava sotto:
`npm test` e passato da 4754 a 4753, e il test che e caduto era esattamente
quello che verifica che lo scollegamento **lasci una traccia**. Recuperata dalla
versione committata.

Un taglio fatto per estremi di testo invece che per struttura porta via cio che
gli sta accanto, e cio che gli stava accanto era la sola prova che l'operazione
fosse avvenuta.

---

## Il nono vaglio indipendente (2026-09-06)

**0 Critical, 3 High**, piu 2 Medium e 1 Low. Secondo giro di fila senza
Critical — e due dei tre High stanno **esattamente accanto** a cio che l'ottavo
vaglio aveva corretto: la meta non ristretta della porta che ha ristretto, e il
caso adiacente della fetta che ha aggiunto.

| # | gravita | dove |
|---|---------|------|
| R-1 | High | il gemello allenatore ristretto su un asse solo: il numero da revocare lo sceglie ancora il client |
| R-2 | High | il riepilogo dell'oblio conta i gettoni con un criterio, la cancellazione ne toglie un altro |
| R-3 | High | la sostituzione **cancella** invece di revocare: nessun marchio, nessun registro, nessun audit |
| R-4 | Medium | l'etichetta d'audit corretta ieri non arriva in nessun archivio |
| R-5 | Medium | l'archivio dei gettoni si leggeva tutto, a ogni scrittura di tutore, dentro la transazione bloccata |
| R-6 | Low | il rapporto dell'oblio non conta cio che l'oblio ha tolto |

### Il pattern nuovo: una regola applicata a meta

ADR-0145 ha enunciato «una difesa che si appoggia a un dato che l'attaccante
controlla e una porta in piu» e l'ha applicata al ramo genitore, togliendo il
blocco. Al gemello allenatore ha aggiunto il filtro di club **e basta**.

Cioe: ho scritto la regola guardando un caso, e l'ho applicata a quel caso.
L'altro ramo — identico riga per riga, dieci schermate piu su nello stesso file
— e rimasto com'era, e un ruolo `staff` poteva usarlo per revocare l'invito di
una famiglia passando dall'identificativo che scrive lui.

**Quando un ADR enuncia un principio a partire da un caso, la prima cosa da fare
non e scriverlo: e cercare i gemelli e applicarlo li.**

### Due correzioni di ieri che erano meta correzioni

* **R-2** — «l'oblio lo chiude e lo cancella» era vero della semina in cui la
  riga del tutore e ancora viva, e falso del caso che *un'altra correzione di
  questo stesso pacchetto* produce: un gettone orfano, la cui riga e stata tolta
  dalla scheda. Il riepilogo lo contava, la cancellazione no.
* **R-4** — l'etichetta «Genitore sostituito» corretta ieri viveva solo nel
  corpo di una risposta HTTP. Nessun archivio la conservava. Una correzione che
  nessun archivio conserva e vacua nel senso stretto.

### E due sonde vacue, di cui una mia

La sonda dell'ottavo vaglio asseriva che l'inventario contenesse una fetta il
cui nome `includes("resource_item")`: **cerca un nome, non un atto**, e non
confronta mai il conteggio con cio che la cancellazione toglie. Da li R-2.

E le asserzioni di costo del nono vaglio erano vacue a loro volta: cercavano la
parola `athlete` nel **testo** SQL, ma una restrizione su una chiave JSON compare
come `"payload"->$3 = $4` — il nome della chiave e un **parametro**. La soglia,
poi, era `<= 1`, e una scansione integrale e esattamente una: la misura passava
sia con la lettura ristretta sia con quella di tutto il club. Verificato per
iniezione, e ri-specificato a zero.

Terza volta che il pattern «un nome invece di un atto» compare, e la seconda in
cui compare **dentro una sonda scritta per misurare quel pattern**.

---

## Il decimo vaglio indipendente (2026-09-06)

**0 Critical, 2 High, 4 Medium.** Terzo giro di fila senza Critical — e per la
seconda volta di fila i due High stanno **esattamente accanto** a cio che il
commit precedente ha corretto.

| # | gravita | dove |
|---|---------|------|
| R-1 | High | la correzione di ieri cercava una grafia sola: non combaciava mai, e ha rotto anche il caso onesto |
| R-2 | High | un terzo che compila un modulo pubblico **rinomina** un genitore esistente |
| R-3 | Medium | la stringa d'audit corretta l'altro ieri finiva in una colonna che nessun lettore mostra |
| R-4 | Medium | ...e conteneva nomi, aprendo un ottavo indice non dichiarato |
| R-5 | Medium | «Scollega allenatore» usciva prima di chiudere l'invito, se il profilo non era collegato |
| R-6 | Medium | la cancellazione ordinaria della scheda lasciava l'invito con nome e indirizzo di un terzo |

### Il difetto piu istruttivo: una difesa inerte

Ieri ho tolto dal ramo allenatore la chiave scelta dal client e ho scritto che
il gettone si cerca «come lo cerca il dominio dei tutori». Il dominio dei tutori
ne cerca **due grafie**; io ne ho cercata una — l'uuid — e il gettone di ogni
allenatore del prodotto porta l'identificativo **logico**. L'istruzione non
combaciava mai.

Due conseguenze, e la seconda e peggiore della prima:

* il difetto restava aperto in forma nuova (chi veniva scollegato rientrava);
* **il caso onesto, che prima funzionava, ha smesso.**

Una difesa che non combacia mai e **verde**: non solleva, non registra niente, e
da fuori e identica a una difesa che funziona. Il momento in cui e piu facile
scriverne una inerte e proprio quando si sta **correggendo** una difesa, perche
si guarda cio che si toglie e non cio che si mette.

### Due correzioni che si sono annullate a vicenda

R-3 e R-4 sono la stessa correzione vista da due lati: l'altro ieri ho fatto
salvare in audit le stringhe di `applied` perche non morissero nel corpo di una
risposta HTTP. Ma il lettore del registro proietta i metadati attraverso un
elenco chiuso e `applied` non c'era — quindi la correzione era **muta**; e
l'etichetta porta un nome — quindi era anche **costosa**, avendo aperto un
archivio di dati personali non dichiarato.

Muta e costosa insieme: il peggior rapporto possibile. La forma che le tiene
insieme e conservare il **tipo** e non il nome — «Genitore sostituito» — e
metterlo in elenco perche il lettore lo mostri.

### Tre asserzioni vacue nella sonda precedente

Il decimo vaglio ha anche mostrato che tre asserzioni del nono erano verdi per
la ragione sbagliata: due asserivano che un gettone **sbagliato** restasse
attivo su una porta che non revocava niente, e una era un'implicazione il cui
antecedente non era mai vero. E la quarta volta che «un nome invece di un atto»
compare, e la seconda dentro una sonda scritta per misurare quel pattern.
