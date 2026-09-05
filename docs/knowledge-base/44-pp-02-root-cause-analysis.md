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
