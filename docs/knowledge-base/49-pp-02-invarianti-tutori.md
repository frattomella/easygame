# 49 — Le invarianti del dominio «genitori e tutori»

> Contratto unico e verificabile. Ogni riga di questo documento o e gia
> misurata da una sonda, o dichiara esplicitamente di non esserlo.
>
> Nasce dopo quindici revisioni indipendenti e settantasei difetti, **tutti sul
> bordo**: dove il modulo proprietario incontra chi lo chiama. Nelle ultime due
> tornate i reperti non erano piu difetti residui del dominio ma **regressioni
> delle correzioni precedenti** — il ciclo revisione → correzione locale →
> revisione aveva smesso di convergere.
>
> La causa, letta a posteriori, e una sola: **ogni consumatore si ricostruiva le
> regole in casa**. «Questa voce e esclusa?» era scritta a mano in nove file con
> nove sfumature. Correggerne una lasciava le altre; ogni correzione ne creava
> una versione nuova.
>
> Questo documento non aggiunge difese. Dice **chi decide**, e toglie a tutti
> gli altri il permesso di deciderlo.

---

## 0. Dove vivono le regole

Le primitive stanno in **`src/lib/guardians/`**, sono pure, e **non hanno
parametri che ne cambino la semantica**: un parametro di sicurezza e il permesso
di divergere scritto nella firma (ADR-0153).

| Modulo | Risponde a |
|--------|------------|
| `exclusion.ts` | «questa persona e fuori?» (§C) e «e questa voce, che ne raccoglie piu di una?» |
| `identity.ts` | «quali identificativi porta questa riga?», in tutte le grafie (§B) |
| `projection.ts` | «come diventano voci queste righe?» (§D, §E, §F) |
| `documents.ts` | «chi puo nominare un documento nuovo?» (§G) |
| `notifications.ts` | «chi riceve un avviso nuovo?» (§H) |

Le porte che scrivono restano in `src/lib/server/athlete-guardians.ts` (autorita
di riga) e `src/lib/server/profile-account-links.ts` (scollegamento e sweep).

**Chi lo fa valere.** `scripts/pp-02-censimento.mjs`, che deriva dall'albero chi
tocca il dominio: **C3** pretende che ogni consumatore canonico **importi** una
primitiva che il modulo **esporta davvero** — non che ne nomini il nome in un
commento — e **C5** che nessuno fuori dai moduli canonici ripieghi l'OR
dell'esclusione. `scripts/pp-02-mutazioni.mjs` misura che quelle sonde mordano,
rompendo il codice sul serio.

---

## A. L'autorita

**`athlete_guardians` e l'autorita.** Una riga di quella tabella e il fatto; il
resto e derivazione.

`athletes.data.guardians[]` e una **proiezione in sola lettura**. Non e
autorita di sicurezza, e nessun lettore che decida un accesso, una revoca, un
legame, un pagamento, un documento, una notifica o un'autorizzazione puo
dedurre l'autorita da li.

Lo fa valere l'**archivio**, non il documento: un vaglio PostgreSQL rifiuta
`INSERT`/`UPDATE`/`DELETE` su `athlete_guardians` fuori da una transazione che
abbia dichiarato `SET LOCAL "easygame.guardian_writer"`, e quella riga la scrive
una funzione sola (ADR-0118, ADR-0119).

**Misurato da:** `pp-02-proprietario-tutore` (il vaglio morde; disabilitandolo
la sonda diventa rossa), `pp-02-censimento` C4 (nessuno scrive fuori dal modulo),
`pp-02-quinto-vaglio` L3/L4 (la difesa si misura **tentando di violarla**, non
confrontando un testo).

---

## B. Le parole

Non sono sinonimi, e confonderle e costato quattro difetti.

| Parola | Che cos'e |
|--------|-----------|
| **riga** (`guardian row`) | una riga di `athlete_guardians`. Unica per `(athlete_id, identity_key)`. E l'unita del **dominio** |
| **persona** (`logical person`) | chi sta dietro una o piu righe. Non ha una colonna: si riconosce da `user_id`, oppure dalla chiave d'identita, oppure dall'indirizzo — **in quest'ordine di forza** |
| **voce** (`projected entry`) | un elemento di `athletes.data.guardians[]`. E l'unita della **proiezione**, e puo raccogliere piu righe |
| **posizione** (`position`) | la colonna che tiene insieme le righe di una voce. Vedi §D |
| **utenza collegata** (`linked user`) | `athlete_guardians.user_id`. La scrive **solo** il riscatto di un invito: un legame non si crea salvando un'anagrafica |
| **riga revocata** | `revoked_at` valorizzato. La toglie **solo** un riscatto |
| **riga di solo recapito** | `contact_only`. Un indirizzo che qualcuno ha dichiarato, non un legame che il club abbia scritto |
| **riga nascosta** | una riga che condivide la posizione con un'altra e che la proiezione non pubblica separatamente. Esiste, decide, e la scheda non la nomina |
| **riga travasata** | nata dalla migrazione dal blob. Puo avere la chiave dell'utenza invece che dell'indirizzo, e puo essere **nascosta** |

**La distinzione che conta:** l'accesso lo decidono le **righe**; i documenti e
le notifiche leggono le **voci**. Un filtro scritto sull'unita sbagliata
punisce la persona sbagliata (ADR-0152).

---

## C. L'esclusione — un predicato solo

**`isGuardianExcluded(x)` e l'unica risposta alla domanda «questa persona e
fuori?».** Nessun consumatore la ricostruisce.

Vale su una **riga** e su una **voce**, e la semantica e una:

```
esclusa  ⟺  revoked_at valorizzato  ∨  contact_only
```

E un **OR**. Averlo ripiegato con due `AND` indipendenti ha prodotto una voce
le cui righe erano tutte escluse **in due modi diversi** e che usciva senza
nessuno dei due marchi: viva per chi la legge, e intestataria di una ricevuta.

**Regola sui marchi di una voce:** un marchio vale per la voce solo se vale per
**tutte** le righe che ci stanno dietro, e si piega con **la stessa domanda che
lo legge**.

**Misurato da:** `pp-02-quindicesimo-vaglio` A0–A3, `pp-02-censimento` C3.

---

## D. La posizione — e una chiave, e va tenuta unica

`position` era nata come compatibilita per i tre lettori che prendono i tutori
per posto. Poi due decisioni hanno cominciato a poggiarci sopra — la proiezione
**fonde** le righe che la condividono, `revokeGuardianRow` le **revoca** — e da
quel momento e diventata una **chiave**. Il momento in cui una colonna cambia
natura non si annuncia: si riconosce guardando chi la interroga per decidere
(ADR-0142).

Le invarianti, tutte misurate:

1. **le righe di una voce si muovono insieme.** Se una voce cambia posizione, le
   righe nascoste dietro — **comprese quelle revocate** — la seguono;
2. **una posizione nominata e nominata per tutte le righe che ci stanno
   dietro**, anche se la scheda ne pubblica un identificativo solo;
3. **una riga revocata non prende la posizione di una viva**: le posizioni che
   restano occupate da chi sopravvive senza essere nominato si saltano;
4. **un salvataggio ordinario non sposta `parent.1`/`parent.2` ne chi paga.**

**Misurato da:** `pp-02-sesto-vaglio` A/B/C, `pp-02-settimo-vaglio` D,
`pp-02-quattordicesimo-vaglio` B, `pp-02-quindicesimo-vaglio` B.

---

## E. La provenienza dei campi — il punto centrale

Quando piu righe finiscono in una voce, **non e consentito ereditare campi da
una riga esclusa**. E il difetto che due tornate di fila hanno prodotto, e la
sua forma peggiore era questa: la madre revocata ha codice fiscale, indirizzo e
telefono; il padre vivo non li ha; la ricevuta esce a nome del **padre** con i
dati della **madre**. Un dato personale di una persona esclusa consegnato ad
altri, e un documento fiscalmente falso.

I campi si dividono per **natura**, e la regola e diversa per ciascuna:

| Natura | Campi | Regola nella fusione |
|--------|-------|----------------------|
| **identita e dati personali** | nome, cognome, indirizzo, telefono, email, codice fiscale, dati fiscali | vengono **da una riga sola**: la prima non esclusa. Nessun ripiego, nessuna sovrapposizione. Se quella riga ha un campo vuoto, **resta vuoto** |
| **metadati di sicurezza** | `revoked_at`, `contact_only`, `user_id`, chiavi d'identita, dati del legame | valgono per la voce **solo se valgono per tutte** le righe (§C) |
| **traccia e compatibilita** | cio che dice all'operatore chi sta dietro la voce, marcatori di provenienza, metadati del travaso | campo **dedicato** (§F) |

**Misurato da:** `pp-02-quattordicesimo-vaglio` A2/A3/B3,
`pp-02-quindicesimo-vaglio` A3.

---

## F. La traccia senza la fuga di dati

La scheda deve poter dire che dietro una voce c'e una persona esclusa —
altrimenti la porta che **revoca** ragiona per posizione su qualcosa che la
porta che **mostra** non dichiara.

Quella traccia sta in un campo **suo** (`escluseDietro`), e:

* **non** conserva la traccia usando nome, codice fiscale, telefono, indirizzo o
  email della persona esclusa **dentro i campi della voce**;
* i lettori fiscali e documentali **non la leggono**: guardano i campi della
  voce;
* **non si persiste**: la proiezione la deriva a ogni scrittura, e un
  salvataggio che la rimandasse indietro non la scrive nella riga — altrimenti
  il miscuglio di due persone finirebbe nell'autorita.

**Misurato da:** `pp-02-quindicesimo-vaglio` A4.

---

## G. I lettori documentali e fiscali

Un documento **nuovo** non nomina chi il club ha escluso (ADR-0149). Vale per:

* il **destinatario fiscale** di una ricevuta;
* i segnaposto `{{parent.N.*}}`;
* il soggetto `guardian` di una pratica.

Una persona esclusa **non** diventa intestataria, **non** alimenta i segnaposto,
**non** cede i propri dati a una persona viva, e **non** fa slittare la
posizione di un altro: la voce esclusa risponde vuoto e la posizione resta dov'e.

**Le ricevute gia emesse non cambiano.** Il destinatario si congela sulla riga
al momento dell'emissione: chi ha pagato ha pagato.

**Misurato da:** `pp-02-dodicesimo-vaglio` D, `pp-02-tredicesimo-vaglio` B/C,
`pp-02-quattordicesimo-vaglio` A.

---

## H. Le notifiche

Un tutore escluso non riceve le notifiche nuove del minore. I registri
denormalizzati (`revokedGuardianIdentities`, `contactOnlyIdentities`) possono
esistere, ma sono **derivati dall'autorita** a ogni scrittura: non sono un
secondo archivio, e nessuna rotta li scrive.

**Misurato da:** `pp-02-secondo-vaglio` 1a–1f (con il caso ordinario di
ADR-0114: due genitori, un solo indirizzo di famiglia).

---

## I. Aprire e togliere l'accesso

**Ogni porta che toglie l'accesso chiude tutte le vie di rientro.** La domanda
da farsi non e «questa porta si chiama revoca?» ma **«dopo questa istruzione,
quella persona puo ancora rientrare?»** (ADR-0145).

Le porte che tolgono sono, e sono tutte censite in `pp-02-censimento`:

| Porta | Chiude l'invito con |
|-------|---------------------|
| «Scollega account» (tutore) | `revokeGuardianRow` → `revocaIGettoni` |
| «Scollega account» (allenatore/staff) | `chiudiGliInvitiDelProfilo` |
| revoca della tessera, uscita dal club | lo sweep → le due sopra |
| il salvataggio che toglie una voce | `saveGuardianRegistry` → `revocaIGettoni` |
| l'approvazione che sostituisce un tutore | **revoca**, non cancella: il marchio resta |
| la cancellazione del profilo | `eraseProfileInvites` (cancella: il carico porta dati personali) |
| la cancellazione della scheda | `eraseGuardianInvitesForAthlete` |
| l'oblio dell'interessato | come sopra, e cancella anche i gettoni |

**Cio che si chiude e tutto cio che non e gia chiuso.** Non si elenca «gli stati
aperti»: quell'elenco diverge da cio che il riscatto accetta — e successo con
`redeemed` multi-uso, e con `NULL` che in SQL non e selezionato da `<> 'revoked'`
mentre in JavaScript passa.

**Ogni porta che apre l'accesso** rispetta il club, il perimetro, il permesso
del ruolo — **personalizzato compreso**, quindi con una chiave di permesso e non
con la matrice del ruolo base — il legame esatto al profilo o alla riga, e lo
stato di revoca.

---

## J. Il confine di club

**Nessuna ricerca per un identificativo che non sia globalmente unico per
costruzione puo esistere senza il confine.** Vale per: identificativo logico di
un profilo, `trainer_id`, `staff_id`, identificativo di un gettone, indirizzo,
chiave d'identita.

Due regole che sono costate un Critical ciascuna:

1. **la guardia e l'uso interrogano la stessa riga.** Verificare con una query
   scoped e poi rileggere con un'altra non e una guardia: e un commento
   (ADR-0151);
2. **in Prisma `undefined` non e un filtro: lo toglie.** `organization_id: x ??
   undefined` in una ricerca di sicurezza e vietato. Senza club attivo non si
   cerca, e la risposta e la stessa che si darebbe a chi non esiste — per non
   distinguere «esiste altrove» da «non esiste».

**Misurato da:** `pp-02-tredicesimo-vaglio` A, `pp-02-quindicesimo-vaglio` C.

---

## Cosa questo contratto **non** copre

Dichiarato, non misurato. Chi tocca queste aree non ha una rete:

* **revoche concorrenti** e **rollover di stagione × revoca** su PostgreSQL vero
  (l'ordine dei blocchi e misurato staticamente, non sotto contesa);
* **riscatto cross-club sul ramo genitore**, replay e rate limiting;
* una persona con **due utenze** sulla stessa scheda;
* le fette di `data-subject.ts` diverse da quelle dei tutori e dei gettoni;
* `unlinkClubJsonProfiles`.

---

## Il consolidamento (2026-09-07)

Le regole di questo documento **non sono piu ricostruite** da nessun
consumatore: quattordici percorsi canonici su quaranta censiti importano le
primitive di §0, e le sei stesure dell'esclusione, le tre delle notifiche, le
due della guardia sulla concessione e le due della `where` degli inviti sono
diventate una ciascuna (−600 righe, ADR-0153).

**Le tre cose che il consolidamento ha trovato e che quindici revisioni non
avevano visto** — tutte trovate dal cambio di metodo, non da un'altra passata:

1. **un terzo gemello delle notifiche.** Il lettore dei recapiti in
   `src/lib/athlete-guardians.ts` era classificato «presentazione». Non lo e: da
   li escono i solleciti degli insoluti, con il nome del minore e un
   collegamento a gettone per pagare. Aveva la propria copia delle tre difese;
2. **la guardia del riscatto era piu stretta del legame che autorizza.** Cercava
   dentro la proiezione — che di una posizione condivisa pubblica un
   identificativo solo — mentre il collegamento cerca fra le righe: un invito
   coniato per la riga nascosta veniva rifiutato con 404;
3. **un lettore che il censimento non vedeva.** La bozza di rinnovo pescava il
   tutore dalla proiezione senza guardare i marchi, e il marcatore del
   censimento non agganciava la sua forma di lettura.

### Le sonde, e cosa misura ciascuna

| Sonda | Cosa misura |
|-------|-------------|
| `tests/lib/tutori-primitive.test.mjs` | il comportamento delle primitive, e la **totalita** derivata dal censimento (nessun elenco scritto a mano) |
| `scripts/pp-02-censimento.mjs` | C1–C5: il dominio non cresce di nascosto, e nessuno ricostruisce le regole |
| `scripts/pp-02-consolidamento.mjs` | la matrice di regressione: diciassette situazioni su PostgreSQL vero, piu otto giri di concorrenza |
| `scripts/pp-02-mutazioni.mjs` | che le sonde qui sopra **mordano**: undici difetti veri reintrodotti, undici sonde che diventano rosse |

### Cosa questo contratto **continua** a non coprire

Resta l'elenco qui sotto, con una riga in meno: le **revoche concorrenti** e il
**salvataggio stantio × revoca** su PostgreSQL vero adesso sono misurati
(`pp-02-consolidamento`, sezioni 17 e 18, otto ripetizioni). Non lo sono ancora:

* il **rollover di stagione × revoca** sotto contesa;
* **riscatto cross-club sul ramo genitore**, replay e rate limiting;
* una persona con **due utenze** sulla stessa scheda;
* le fette di `data-subject.ts` diverse da quelle dei tutori e dei gettoni;
* `unlinkClubJsonProfiles`.

---

## La revisione post-consolidamento (2026-09-07)

Una revisione indipendente ostile ha attaccato le invarianti di questo
documento e ne ha falsificate **sei**, tutte riprodotte prima di correggerle.
Il consolidamento non le ha create tutte — ma le ha rese **misurabili in un
posto solo**, ed e la ragione per cui si sono viste.

| # | Invariante falsificata | Dove viveva |
|---|---|---|
| R1 | §I — la revoca chiudeva **meno** di quanto il riscatto collegasse: un invito coniato sulla chiave d'identita era riscattabile e non chiudibile, e la scheda non lo mostrava | due predicati per la stessa domanda |
| R2 | §I — la guardia della concessione vedeva **la chiave** e non l'indirizzo: con `{ userId, email }` insieme, l'indirizzo verificato di un terzo usciva dal vaglio | l'unificazione delle due guardie |
| R3 | §C, §H — «un legame dichiarato vince» stava **prima** del marchio di riga: una riga di solo recapito che porta un'utenza riceveva su tutti e tre i canali | l'ordine di due `if` |
| R5 | §A — con zero righe i tre canali risuscitavano `parent1`/`parent2`: il blob tornava a essere **autorita di fatto** | la scelta fatta su «l'elenco e vuoto?» |
| R6 | §C al contrario — un residuo `revoked_at` dentro `data` marcava un tutore **vivo**, e chi paga cambiava persona | il predicato totale, contro una proiezione che non riemette tutte le grafie |
| R12 | §G — una voce non-oggetto faceva **slittare** i lettori posizionali | una difesa contro un dato malformato |

**La correzione e sempre nella primitiva**, mai nell'endpoint: sei fatti
cambiati in cinque file di `src/lib/guardians/` piu due nel proprietario.

### Le tre regole che ne escono

1. **Allargare una porta obbliga ad allargare la sua gemella.** R1 nasce dal
   consolidamento stesso: la guardia del riscatto e stata resa piu larga — e
   giustamente — mentre la funzione che chiude i gettoni e rimasta dov'era.
   «Cio che la revoca chiude deve contenere cio che il riscatto collega» era
   gia scritta; adesso e **una funzione sola** (`guardianRowNamedBy`), e
   allargarla li allarga insieme.
2. **Unificare due guardie e sceglierne una.** R2: la guardia unica ha ereditato
   il ramo per identificativo di utenza e **perso** quello per indirizzo. Una
   funzione che decide su «l'identita su cui la riga e unica» non risponde alla
   domanda «quali identita apriranno il fascicolo»: sono due, e adesso hanno
   due nomi (`guardianIdentityKey`, `guardianIdentityCandidates`).
3. **Un predicato totale obbliga la proiezione a essere totale.** R6: rendere
   `isGuardianExcluded` capace di leggere anche le grafie della **riga** — che
   e giusto — ha reso pericoloso un residuo che prima nessuno guardava. Chi
   allarga un lettore deve chiudere le strade da cui entra il dato che adesso
   legge.

### Il caso che il contratto vieta, e che la revisione ha chiarito

La coppia `contact_only = true` **con** `user_id` e **incoerente per
costruzione**: l'unico scrittore di `user_id` e il riscatto, e il riscatto
azzera `contact_only` nella stessa `UPDATE`. Esiste lo stesso, e la produce la
§3 del travaso — che marca per **identita** senza azzerare l'utenza.

Su una riga cosi vale §C senza deroghe: **e esclusa, e non riceve.** L'uscita
«un legame dichiarato vince» resta, ma vale sui **registri** — che sono elenchi
di identita, e dove un indirizzo di famiglia condiviso (ADR-0114) finisce per
colpa di un altro — **mai sul marchio**, che e l'autorita della riga su se
stessa.

### Cosa la revisione ha attaccato e non ha piegato

§E (nessun campo passa da una riga esclusa), §D4 (un salvataggio ordinario non
sposta chi paga), §F (un salvataggio che rimanda `escluseDietro` non lo
scrive), il confine di club (nessun `undefined` che allarghi un filtro), e la
larghezza del riscatto (nessun invito legittimo ha smesso di funzionare).
