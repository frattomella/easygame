# 36 — Wave 3: implementazione e collaudo

**Data:** 2026-08-29
**Baseline:** `integration/web-v1` @ `18f0f40`
**Contratto:** [35 — Wave 3: planning esecutivo](35-wave-3-planning.md)
**Stato:** vedi [§9](#9--verdetto)

> Il documento [35](35-wave-3-planning.md) dice **cosa** si sarebbe fatto e
> **perche**. Questo dice **cosa e stato fatto davvero**, con la prova, e dove
> l'esecuzione si e discostata dal piano.

---

## Indice

1. [Cosa e cambiato per il club](#1--cosa-e-cambiato-per-il-club)
2. [La barriera, e le sette lane](#2--la-barriera-e-le-sette-lane)
3. [Dove ci siamo discostati dal piano](#3--dove-ci-siamo-discostati-dal-piano)
4. [Il collaudo a runtime](#4--il-collaudo-a-runtime)
5. [Prestazioni](#5--prestazioni)
6. [I bug trovati durante la Wave](#6--i-bug-trovati-durante-la-wave)
7. [Il catalogo: cosa esce e cosa resta fermo](#7--il-catalogo-cosa-esce-e-cosa-resta-fermo)
8. [Audit e seconda revisione](#8--audit-e-seconda-revisione)
9. [Verdetto](#9--verdetto)
10. [Residui dichiarati](#10--residui-dichiarati)

---

## 1 — Cosa e cambiato per il club

| Prima | Adesso |
|---|---|
| «Nuovo documento» apre una pagina bianca con scritto «Inserisci il contenuto qui» | Sei modelli pronti, scritti per una ASD italiana, che si adottano con un clic e da quel momento sono tuoi |
| Correggi un modello e i documenti dell'anno scorso cambiano sotto i piedi, perche non ne esisteva una copia | Un modello corretto e una **versione nuova**. Cio che hai gia consegnato resta com'era, e continua a citare la sua |
| «Chi ha rilasciato questa attestazione?» non ha risposta: il documento nasceva nel browser e moriva alla chiusura della scheda | Ha una riga: chi, quando, con quale modello, quale versione, e quali numeri c'erano scritti |
| L'attestazione la scrive la segretaria copiando gli importi da una schermata | Il documento dice la cifra giusta perche la legge dal registro incassi — e se un dato manca **lo dice prima**, invece di stampare un foglio con un buco |
| Trenta richieste di visita medica sono trenta aperture di scheda | Si selezionano trenta atleti e si genera un lotto. Chi non si e potuto generare compare con il motivo, e gli altri passano |
| «Chi ha dato il consenso immagini?» si risponde aprendo le compilazioni una per una, e «chi lo ha revocato» non si risponde affatto | Si risponde con un elenco. E la revoca **non cancella** la prova del consenso dato prima |
| Il documento d'identita scaduto lo scopre chi lo cerca | Lo dice il gestionale trenta giorni prima, con le stesse regole che il club gia governa per i certificati |
| Un collaboratore puo riscrivere il testo che la societa firma, e non puo stamparne una copia | I modelli li scrive la direzione; la segreteria genera cio che non porta dati delicati, e quando non puo **le viene detto perche** |

---

## 2 — La barriera, e le sette lane

L'ordine di merge e quello deciso al §15.4 del planning, con la barriera come
commit a se davanti a tutte.

| Lane | Commit | Cosa contiene |
|---|---|---|
| **barriera** | `963724b` | Sei tabelle e due colonne in una migrazione sola; la matrice dei permessi documentali in un modulo puro; il **contratto dei segnaposto** — ogni chiave dichiara soggetto, proprietario del dato e sensibilita. Le due porte di `W3-14` chiuse insieme |
| **W3-G** — scadenze | `ebcc29a` | `valid_from`/`valid_until` su `attachments`, lo stato derivato, il quinto innesco `AUT-05` con filtro per categoria, e il doppione con il certificato medico impedito in **tre** punti |
| **W3-A** — motore | `46a7947` | `src/lib/server/document-templates.ts` come proprietario unico, le rotte dei modelli e dei documenti generati, il travaso dalla colonna JSON |
| **W3-C** — consensi | `4737653` | Definizione, versione immutabile, decisioni append-only, stato derivato, schermata `/consensi` |
| **W3-B** — soggetti | `7995534` | Il risolutore impara club, persona e socio oltre all'atleta; sponsor, fornitori ed eventi smettono di essere proposti |
| **W3-A** — schermata | `fab5cd9` | `/modulistica` sopra il motore nuovo, e **cinquecento righe** di implementazioni doppie rimosse |
| **UAT** | `34a06d0` | I 38 scenari del §19, decisi prima del codice: 56 controlli su 56 |
| **W3-D** — catalogo | `ae8cdd6` | Dieci voci scritte, sei distribuite, quattro ferme e dichiarate |

---

## 3 — Dove ci siamo discostati dal piano

**Uno.** La barriera si era dimenticata una colonna: la **bozza** del contenuto
di un modello. Senza, l'editor avrebbe avuto due sole strade — pubblicare a
ogni salvataggio, e allora il numero di versione non direbbe piu «revisione» ma
«battitura», oppure tenere il testo nel browser, cioe perderlo. E arrivata con
una migrazione propria (`20260829110000_wave3_template_draft`) invece di essere
infilata nella barriera gia applicata.

**Due.** Il **protocollo** del documento generato era un `EXTEND` previsto dal
planning (E-8, su `document_number_sequences`). Non e stato fatto: quella e la
numerazione **fiscale**, con due invarianti proprie (ADR-0044) e un perimetro
che finisce alle ricevute e alle fatture. Estenderla a un documento che fiscale
non e, oppure aprire una seconda numerazione, sono due decisioni — e nessuna
delle due si prende dentro una lane. La colonna esiste e resta nulla (debito
`W3-01`).

**Tre.** Il contratto dei segnaposto e stato scritto **per intero nella
barriera** invece che a meta in W3-B. Il planning lo aveva diviso — tipi nella
barriera, valori nella lane — ma il catalogo ha un proprietario solo, e due
lane che scrivono lo stesso file nello stesso giorno sono due lane che si
sovrascrivono. W3-B si e concentrata sul risolutore, che e il pezzo che
mancava davvero.

**Quattro.** Il planning dava per scontato che la segreteria potesse generare
documenti senza dati delicati. Il server lo consente, ed e provato — ma
l'unica schermata che genera e `/modulistica`, che la stessa Wave ha riservato
alla direzione per chiudere `W3-14`. Il permesso esiste e oggi non ha una
porta: e il debito `W3-02`, e la chiusura e una schermata, non un permesso.

---

## 4 — Il collaudo a runtime

`scripts/wave-3-documents-uat.mjs`, contro un'applicazione vera con un
database vero, due club veri e cinque ruoli veri.

**56 controlli su 56.**

Cosa dimostra, in ordine di importanza:

1. **Il documento consegnato non cambia mai.** Generato con la versione 1, poi
   il modello viene riscritto e ripubblicato: la rilettura restituisce lo
   stesso HTML byte per byte e cita ancora la versione 1;
2. **l'anteprima non scrive.** Da una bozza non pubblicata non si genera, e la
   riga in `generated_documents` resta zero;
3. **l'importo e il denaro entrato.** Rata da 130 marcata pagata, incassati 80:
   il foglio dice **80,00**. E la ragione per cui si puo firmare;
4. **il lotto e idempotente nel database.** Cinquanta documenti, riesecuzione,
   zero righe nuove. Un soggetto di un altro club fallisce da solo e compare
   fra i falliti con il motivo;
5. **un documento generato non e un allegato.** Il suo identificativo su
   `/api/v1/attachments/:id` risponde **404**, e sulla sua rotta 200: ADR-0089
   provato, non dichiarato;
6. **il permesso guarda cosa il documento dice.** Il collaboratore genera la
   dichiarazione di iscrizione (201) e non l'attestazione con gli importi
   (403, «questo modello contiene importi, e li genera la direzione del club»);
7. **cross-tenant, quattro volte**, e mai il messaggio dell'ORM. Un
   identificativo inesistente e uno di un altro club danno la **stessa**
   risposta;
8. **la revoca non cancella.** Accettare, revocare, riaccettare lascia tre
   righe e uno stato derivato;
9. **le scadenze non producono doppioni**, nemmeno con due giri in parallelo, e
   il certificato medico resta su `AUT-03`;
10. **Unicode.** `Nicolò D'Angiò` e `Öztürk Đurić` arrivano interi; un cognome
    che contiene `<script>` resta un cognome.

---

## 5 — Prestazioni

Misurate durante il collaudo, sulla stessa esecuzione dei 56 controlli.

| Misura | Soglia (§20 del planning) | Misurato | Margine |
|---|---|---|---|
| Render di **un** documento | < 400 ms | **44 ms** | 9x |
| Anteprima completa | — | 57 ms | — |
| **Dieci** documenti | < 3 s | **228 ms** | 13x |
| **Cinquanta** in un lotto | — | **915 ms** | — |
| **Cento** in due lotti | < 30 s | **1.712 ms** | 17x |
| Elenco dei modelli | < 200 ms | **22 ms** | 9x |
| Elenco dei documenti generati (174) | — | 32 ms, 116 kB | — |

Due controlli verificano che gli elenchi **non portino il peso**: l'elenco dei
modelli non contiene `draftContent`, quello dei documenti non contiene
`contentHtml`. E lo stesso difetto per cui i modelli sono usciti dalla riga del
club, e sarebbe rientrato dalla finestra.

---

## 6 — I bug trovati durante la Wave

| # | Cosa | Dove trovato | Esito |
|---|---|---|---|
| 1 | **Collaboratore e staff potevano creare, modificare e cancellare i modelli** dal CRUD generico, e non potevano generare un documento | Sonda a runtime scritta **prima** della correzione (`scripts/wave-3-permissions-probe.mjs`), cinque ruoli veri | Corretto nella barriera, in **entrambe** le porte: la pagina e la rotta |
| 2 | **Due forme diverse nella stessa colonna JSON** — un modello creato dall'API compariva in Modulistica senza titolo e senza testo | Stessa sonda | Sparisce con il motore nuovo; il travaso riconosce entrambe le forme |
| 3 | **Una rotta Next non puo esportare costanti proprie**: `MAX_GENERATION_BATCH` faceva fallire la generazione dei tipi, quindi la build | `npx tsc` sul progetto intero | La costante e scesa nel dominio, dove serve anche al client |
| 4 | **Ricorsione infinita** in `buildCommonValues` durante l'estrazione delle chiavi comuni del risolutore | I 31 test esistenti sul risolutore, diventati rossi | Corretto prima del commit; i 31 tornano verdi senza modifiche al test |
| 5 | **Un commento troppo lungo** ha spinto `/onboarding` oltre la finestra di 400 caratteri che un test presidia | `npm test` | Commento accorciato. Il test presidia la cosa giusta con un mezzo fragile: debito `W3-07` |

**Tre controlli del collaudo erano scritti male**, e sono stati corretti nel
collaudo e non nel prodotto: il giro delle automazioni si aziona da una
sessione e non dal segreto del cron, un diniego di permesso e un `403` e non un
`400`, e la prova Unicode leggeva un modello che nel frattempo era stato
riscritto.

---

## 7 — Il catalogo: cosa esce e cosa resta fermo

Dieci voci scritte. **Sei distribuite**, quattro ferme.

| Voce | Classe | Stato |
|---|---|---|
| Attestazione di pagamento e frequenza | A | **distribuita** |
| Attestazione di sola frequenza | A | **distribuita** |
| Dichiarazione di iscrizione all'attivita | A | **distribuita** |
| Avviso di versamento della quota | A | **distribuita** |
| Richiesta di visita medico-sportiva | A | **distribuita** |
| Attestazione per bando o voucher | A | **distribuita** |
| Informativa e consenso privacy | **C** | ferma: cita il Regolamento (UE) 2016/679 |
| Consenso all'uso di immagini e video | **C** | ferma: riguarda l'immagine di minori |
| Autorizzazione alla trasferta | **C** | ferma: assegna responsabilita durante il trasporto |
| Delega al ritiro del minore | **C** | ferma: sposta la custodia di un minore |

Le quattro ferme **sono scritte**, cosi chi deve validarle ha un testo da
leggere invece di un foglio bianco, e ognuna dichiara **dentro il documento**
di non essere validata. La rotta del catalogo non le nomina nemmeno.

**Nessuna voce di classe B.** I trenta moduli territoriali di richiesta visita
medica sono il fossato editoriale di Golee, e il §17 del planning dice che non
lo apriamo. Il club carica il suo e lo compila con i segnaposto: il 90% del
valore all'1% del costo.

Un test verifica che **ogni voce distribuibile sia pubblicabile cosi com'e**:
una voce che nominasse un segnaposto fuori catalogo sarebbe un difetto
consegnato.

---

## 8 — Audit e seconda revisione

_Da compilare al termine delle quattro revisioni parallele e della seconda
revisione._

---

## 9 — Verdetto

_Da compilare._

---

## 10 — Residui dichiarati

Dieci voci, tutte in [16 — Debito tecnico](16-technical-debt.md), sezione
«Debito aperto dalla Wave 3». Le tre che pesano davvero:

- **`W3-01`** — il protocollo di un documento generato resta nullo. E una
  decisione rimandata, non una dimenticanza: darglielo significa estendere la
  numerazione fiscale o aprirne una seconda;
- **`W3-02`** — il permesso di generare concesso a collaboratore e staff non ha
  una schermata da cui esercitarlo. Il server lo consente, provato a runtime;
  manca la porta;
- **`W3-09`/`W3-10`** — il presidio redazionale. Le sei voci distribuite hanno
  un proprietario **nominale**, e le quattro ferme aspettano una validazione
  che nessuno ha ancora preso in carico. ADR-0092 dice cosa fare se non arriva:
  smettere di distribuire, non lasciare invecchiare.
