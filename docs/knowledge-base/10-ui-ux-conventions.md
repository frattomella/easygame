# 10 — Convenzioni UI/UX

## Identita visiva (Blocco 3, 2026-08-23)

### Marchio

`src/components/brand/easygame-logo.tsx` — SVG in repo, nessuna richiesta di
rete. `EasyGameLogo` con `tone="dark"` su fondo chiaro e `tone="light"` su
fondo scuro; `EasyGameWordmark` dove EasyGame parla in prima persona
(accesso, console di piattaforma, account).

**Non reintrodurre** `r2.fivemanage.com`, `/logo.png`, `/logo-blu.png` o
`logo-bianco.png`: erano un PNG remoto sgranato e tre riferimenti a file
inesistenti. Un test di conformita lo impedisce.

### Tipografia

| Ruolo | Font | Dove |
|-------|------|------|
| Testo e dati | `Inter` (`font-sans`) | tutto il prodotto |
| Titoli e etichette | `Archivo` (`font-display`) | intestazioni, nomi club, targhe |

Self-hosted con `next/font`: nessuna richiesta a Google a runtime.
Le colonne di numeri — date, importi, numeri di maglia, stagioni — usano
`.eg-tabular`, altrimenti le cifre ballano da una riga all'altra.

### Token

In `globals.css`: `--eg-navy` (chrome e piattaforma), `--eg-blue` (azione
primaria), `--eg-paper` (fondo pagina), `--eg-line`, e `--eg-season`, che e
l'**unico ambra della chrome** ed e riservato alla stagione.

### La stagione e una targa, non un badge

Da WP-32 la stagione e il perimetro dei dati visibili. `SeasonPlate` e
`ClubIdentity` (`src/components/brand/club-identity.tsx`) la mostrano con un
colore proprio e cifre tabellari, in topbar desktop e mobile. Chi apre una
pagina deve sempre poter rispondere a «quale club, quale stagione».

### La scheda Stagioni (Blocco 6)

`src/components/organization/season-manager.tsx`, montata da
`/organization?tab=stagioni`. Regole che valgono anche per chi la modifichera:

- **niente logica in `page.tsx`.** La pagina Organizzazione ha nove schede: la
  gestione delle stagioni sta nel suo componente e parla solo con
  `@/lib/api/seasons`;
- **una procedura guidata, non un modulo.** Periodo → cosa riportare →
  riepilogo. Il riepilogo mostra i numeri veri, calcolati dal server in
  `preview`: annunciare una stima e peggio che non annunciare nulla;
- **si dice anche cosa non viene copiato.** Due riquadri fissi elencano i dati
  globali del club (restano disponibili, non si duplicano) e i dati operativi
  (non si riportano mai). Un'assenza non spiegata sembra un difetto;
- **conferma solo per cio che conta.** Cambio di stagione attiva e
  archiviazione passano da `ConfirmDialog`; spuntare cosa riportare no. Il
  cambio di stagione **non e autosalvabile**: cambia il perimetro dei dati;
- **stato visibile con un'etichetta, non con un colore soltanto.** Futura,
  Attiva, Archiviata sono scritte per esteso sul `Badge`;
- **375 / 768 / 1280.** Le righe della stagione impilano sotto `lg` e i
  comandi vanno a piena larghezza sotto `sm`; l'elenco di cosa riportare passa
  da una a due colonne a `md`. Nessuna larghezza fissa in pixel.

Verificato da `tests/ui/seasons-tab.test.mjs`.

### Chrome separate

| Contesto | Shell |
|----------|-------|
| Club | `dashboard/Sidebar` + `dashboard/Header` |
| Piattaforma | `platform-admin/platform-admin-shell` |

La console `platform_admin` **non** monta la chrome del club: un
amministratore di piattaforma non ha un club attivo e non deve vedere
«Atleti» o la stagione di una societa a cui non appartiene.

### Regole responsive

Breakpoint di riferimento: **375, 768, 1280 px**.

- nessuna pagina produce scroll orizzontale del documento: un contenuto piu
  largo scorre dentro il proprio contenitore (`.eg-scroll-x` o
  `overflow-x-auto`), mai il `body`;
- i modali hanno `max-h-[calc(100dvh-2rem)]` e `overflow-y-auto`. Senza,
  i pulsanti in fondo diventano irraggiungibili su telefono;
- **le classi `slide-in-from-*` dei modali non sono decorative**: `animate-in`
  riscrive `transform`, quindi sono loro a fornire il -50% che centra il
  riquadro. Toglierle lo sposta fuori schermo;
- il contenitore di pagina usa `h-[100dvh]`, non `h-screen`: `100vh` su
  telefono e piu alto dell'area visibile quando la barra del browser e
  presente, e il fondo pagina finisce sotto lo schermo;
- **mai annidare `min-h-screen` dentro `min-h-screen`**: la colonna centrale
  non ha piu un'altezza da cui `flex-1 min-h-0 overflow-y-auto` possa
  ricavare uno scorrimento interno, e a scorrere finisce l'intero documento
  mentre la sidebar resta tagliata. Lo schema corretto e: contenitore
  `h-[100dvh] overflow-hidden` → colonna `min-h-0 flex-1 flex-col` →
  `<main className={dashboardMainClassName}>`;
- nelle schermate di accesso (`.eg-auth`) i comandi hanno almeno 44 px di
  altezza sotto il breakpoint `sm`. Nelle tabelle di gestione la densita
  resta voluta.

L'invariante e verificata da `tests/ui/app-shell-layout.test.mjs`, che legge
ogni schermata con barra laterale: radice `h-[100dvh]`, nessuna `min-h-screen`
fuori dai segnaposto centrati, e il taglio dello scorrimento fra radice e
`main`.

### Tendine, menu e popover

Valgono per **tutte** le superfici sovrapposte, non per la schermata in cui il
problema si nota:

- ogni contenuto sovrapposto ha un'altezza massima legata allo **spazio
  davvero disponibile** (`--radix-*-content-available-height`) e scorre al suo
  interno. Senza, con molte voci il menu esce dallo schermo e le ultime voci
  non si raggiungono;
- `SelectContent` monta i due comandi di scorrimento di Radix. Non sono
  decorativi: Radix **nasconde** la barra di scorrimento del viewport con uno
  `<style>` che inietta lui;
- quella barra viene rimessa in `globals.css` con
  `[data-radix-select-viewport][data-radix-select-viewport]`. L'attributo e
  ripetuto per superare in specificita la regola di Radix, che sta nel `body`
  e a parita di specificita vincerebbe;
- **`cmdk` scrive `data-disabled="false"` sulle voci abilitate.** Lo stile di
  una voce spenta si scrive quindi `data-[disabled=true]:`, mai
  `data-[disabled]:`: quest'ultimo verifica la presenza dell'attributo e
  spegne l'elenco intero. Era la causa della combobox atleti «disabilitata»
  in Abbigliamento.

Verificate da `tests/ui/overlay-menus.test.mjs`.

### Attese e salvataggi

| Situazione | Componente |
|-----------|------------|
| Pagina o sezione in caricamento | `AppLoadingScreen` |
| Elenco in arrivo | `ListSkeleton` |
| Griglia di schede in arrivo | `CardsSkeleton` |
| Operazione bloccante | `AppBlockingOverlay` |
| Salvataggio automatico | `SaveStatus` (`idle` / `saving` / `saved` / `error`) |

Tutti dichiarano `role="status"` e `aria-live="polite"`.

### Quando una schermata puo salvarsi da sola (RC Fix 1)

Il pulsante «Salva» non e gratis: chi lo dimentica perde il lavoro, e in una
pagina a schede uno solo in fondo a nove schede e una trappola.

Il Blocco 4 aveva diviso le schede in due famiglie — descrittive in autosave,
sensibili a conferma — con una motivazione ragionevole: un IBAN salvato a meta
digitazione dirotta gli incassi. **RC Fix 1 sposta la linea**, perche il
compromesso a meta produceva una pagina che si comportava in due modi diversi
a seconda della scheda aperta, e perche il pulsante rimasto non risolveva il
problema che lo giustificava: salvava volentieri un IBAN sbagliato, chiedeva
solo un clic in piu.

La regola oggi:

| Puo essere in autosave | Deve restare fuori |
|------------------------|--------------------|
| Qualunque scheda che sia un **modulo**: anagrafica, recapiti, link, dati fiscali, conto, affiliazioni, interruttori di incasso | Superfici che **non sono un modulo**: hanno operazioni proprie con conferma (Stagioni, WP-32) o sono in sola lettura (Account e Fatturazione) |
| | Operazioni **distruttive** che non siano gia un gesto esplicito |

Cio che rende lecito l'autosave su un dato sensibile non e il dato: e che **un
valore incompleto non venga scritto**. `validateClubProfileSection` trattiene
la sezione finche l'IBAN non ha la forma di un IBAN, la partita IVA undici
cifre, il CAP cinque; e dice a schermo perche.

Chi implementa un autosave deve fornire tutte e quattro le cose insieme:

1. **debounce** (1 s nella scheda Club, 1,5 s nel programma settimanale);
2. **accorpamento** con `createCoalescingSaver` — due PATCH sovrapposte
   arrivano in ordine non garantito e l'ultima modifica puo perdersi. Quando
   piu sezioni scrivono nella stessa colonna JSON, l'accorpamento lavora
   sull'**insieme** delle sezioni sporche, non su una sola;
3. **validazione che trattiene**, non che avvisa dopo;
4. **stato visibile** con `SaveStatus`, uno solo per pagina, discreto e
   temporaneo: a riposo non disegna niente e «Salvato» sparisce da solo.

L'autosave guarda **tutte** le sezioni, non quella aperta. Legarlo alla scheda
attiva era il difetto piu costoso della pagina Club: cambiando scheda entro il
secondo di attesa il timer veniva annullato e la modifica spariva senza dirlo.

L'elenco vero delle sezioni della scheda Club, con la motivazione di ciascuna,
sta in `src/lib/club-profile.ts` ed e verificato da
`tests/lib/club-profile-autosave.test.mjs`: la classificazione e codice, non
una convenzione da ricordare.


### Anagrafica assistita

`AssistedAddressFields` e `AssistedFiscalCodeField`
(`src/components/forms/assisted-anagrafica.tsx`) sono i campi da usare per
CAP, comune, provincia e codice fiscale. Regola unica: **suggerire, non
decidere**. L'assistenza compila solo cio che e vuoto e segnala cio che non
torna; non riscrive mai un valore digitato, e il pulsante «Calcola» del codice
fiscale non compare nemmeno quando il campo e gia valorizzato.

Dal Blocco 7 ([ADR-0032](18-decision-log.md#adr-0032--larchivio-dei-comuni-e-istat-generato-da-uno-script-servito-dal-server)):

- il comune si sceglie da `ComuneAutocomplete`, che interroga l'archivio
  ISTAT via `/api/v1/comuni` e porta con se sigla della provincia e **codice
  catastale**. Resta un campo di testo libero: una localita estera o un comune
  soppresso si scrivono ancora a mano;
- il **comune di nascita vive dentro** `AssistedFiscalCodeField`, non accanto
  ad esso: e li che serve, ed e li che si vede a quale comune corrisponde il
  codice catastale in uso. Dove esisteva un campo «Luogo di nascita» separato
  e stato assorbito, non duplicato;
- il **codice fiscale sta dopo il blocco anagrafico**, mai prima: si calcola da
  cognome, nome, data di nascita, sesso e comune, e un campo che chiede di
  calcolare qualcosa che il form non sa ancora e solo un campo vuoto piu in
  alto;
- un codice che non corrisponde ai dati puo essere sostituito, ma **in due
  tempi**: il primo clic dichiara l'intenzione, il secondo scrive.

---
## Chrome: club e piattaforma sono due cose diverse (regola definitiva)

Esistono **due** chrome, e non vanno confuse. Un requisito scritto per l'una
non si applica mai all'altra: e cosi che nel Blocco 3 la topbar del club ha
perso comandi che servivano.

| | Topbar **Club** (`components/dashboard/Header.tsx`, `components/layout/MobileTopBar.tsx`) | Console **Piattaforma** (`components/platform-admin/platform-admin-shell.tsx`) |
|---|---|---|
| Marchio EasyGame | **no** dal Blocco 7: sta nella sidebar, sempre visibile a fianco | si |
| Identita club + stagione | si (`ClubIdentity`) | **no**: non amministra un club |
| Azioni rapide | si, filtrate da `canAccessPath` | **no** |
| Assistenza | si | **no** |
| Notifiche, account | si | account |
| Chat | **no** (nessun backend) | **no** |
| Voci di navigazione di club (`/athletes`, `/training`, …) | si | **no** |

`tests/ui/topbar-club-vs-platform.test.mjs` verifica ogni riga di questa
tabella. Se un WP futuro deve togliere un comando, deve dire **da quale delle
due**.

### Gerarchia della riga identita

Fissata dopo il Blocco 5, vale per `ClubIdentity` su desktop e su telefono:

1. **logo del club** — l'elemento piu grande (48 px desktop, 40 px compatto) e
   **senza cornice**: un bordo attorno a un marchio gia squadrato lo fa
   sembrare la miniatura di un elenco. Solo il ripiego con le iniziali ha una
   piastra neutra, per non lasciare due lettere a mezz'aria;
2. **nome del club** — il testo piu grande della barra (`text-xl`, `text-base`
   in compatto), in `font-display`;
3. **stagione** — targhetta discreta, senza bordo, su una riga sola, **accanto**
   al nome. Va a capo quando lo spazio manca: non deve mai spingere fuori posto
   logo, nome o comandi. Dal Blocco 7 e **grigia**: vedi sotto.

## Form di creazione: pochi obblighi, molte sezioni (Blocco 7)

Il modello e «Nuovo atleta» (`AthleteCreateForm`, montato da
`/athletes/new`), e la regola vale per ogni form di creazione di
un'anagrafica.

**Una pagina, non una finestra** ([ADR-0057](18-decision-log.md#adr-0057--iscrivere-un-atleta-e-una-pagina-e-il-numero-di-maglia-non-e-un-dato-anagrafico)).
Le tre anagrafiche di persona — atleta, allenatore, socio — si creano da una
pagina dedicata con la stessa struttura: intestazione con «indietro» e
salvataggio, modulo in una `Card`, sezioni a scomparsa. Un modulo lungo dentro
una finestra scorre in un riquadro dentro una pagina che scorre, a 375 px non
ha dove stare, e un clic fuori porta via cio che era stato scritto.

**Il ciclo da evitare:** creare con tre campi, aprire la scheda, ricompilare
tutto. Chi iscrive un atleta ha davanti il modulo cartaceo con **tutti** i
dati: farglieli inserire in due momenti diversi non e semplicita, e lavoro
doppio.

**Il rimedio non e una pagina infinita.** Gli obbligatori restano quelli che
erano — nome, cognome, data di nascita — e tutto il resto vive in sezioni
`Accordion` **chiuse di default**. Chi ha fretta compila i tre campi e chiude;
chi ha il modulo in mano compila tutto in una volta.

Due vincoli che rendono la cosa sostenibile:

1. **si riusano i componenti condivisi** — codice fiscale assistito, indirizzo
   assistito, telefono, taglie, lettura documento — invece di reimplementarli.
   Un secondo campo «codice fiscale» scritto a mano dentro un form diverge dal
   resto dell'applicazione al primo cambiamento;
2. **le chiavi scritte sono quelle che la scheda legge.** Un dato inserito alla
   creazione ma salvato con un nome diverso esiste e non si vede, che e peggio
   di non averlo inserito. Un test verifica la corrispondenza chiave per chiave.

## Lettura documenti: si propone, non si scrive (Blocco 7)

`DocumentExtractionField` compila un'anagrafica dalla foto di un documento
d'identita. Quattro passi, e il quarto e il motivo per cui esiste:

1. si carica la foto;
2. il motore la legge — oggi OCR locale (`tesseract.js`): **il documento non
   lascia il browser**;
3. si vede cosa e stato letto, campo per campo, con quanta fiducia;
4. si sceglie cosa applicare, e solo allora il form cambia.

Un OCR sbaglia, e in un'anagrafica sportiva un dato sbagliato che nessuno ha
guardato finisce su un tesseramento. **Nessun campo viene scritto senza una
conferma esplicita.** I campi gia compilati a mano sono deselezionati di
partenza: chi ha digitato aveva il documento davanti.

I moduli:

| File | Cosa fa |
|---|---|
| `lib/document-scan.ts` | Riconosce le etichette di un documento italiano. Esisteva gia |
| `lib/document-extraction.ts` | Il **contratto**: `DocumentExtractionResult`, mapping verso i campi anagrafici, accettazione selettiva |
| `lib/document-extraction-ocr.ts` | Il motore OCR, unico provider di oggi |
| `components/forms/document-extraction-field.tsx` | Caricamento, anteprima, conferma |

**Che cosa resta da integrare** (non e stato dimenticato):

- il campo e montato sui form di **creazione** di staff, allenatore e socio. La
  scheda atleta ha un suo flusso completo, precedente e funzionante: va
  migrato su questo contratto, ma e un lavoro a se;
- **i PDF non si leggono**: `tesseract.js` legge immagini, e rasterizzare un
  PDF richiede una libreria che oggi non c'e;
- non esiste un provider remoto. Aggiungerlo significa implementare
  `DocumentExtractionProvider` — nessun form va toccato — ma mandare la carta
  d'identita di un minore a un servizio esterno e una decisione di prodotto,
  non una riga di codice.

## Taglie ed export valgono per tutte le persone (Blocco 7)

### Taglie

`src/lib/clothing-sizes.ts` e `ClothingSizesFields`. Sono le **stesse**
definizioni dell'abbigliamento: un magazzino che conosce `XL` e un'anagrafica
che scrive `Extra Large` non si parlano.

Erano scritte tre volte — nella scheda atleta, e una copia appiattita e con i
duplicati dentro in `registration-management`. Ora stanno in un posto solo, e
un test fallisce se ne ricompare una seconda.

Valgono per atleta, allenatore, staff e socio. **La numerazione di maglia
resta agli atleti**: darla a un dirigente creerebbe conflitti nei gruppi di
numerazione (WP-44) per un dato che non serve a nessuno.

Il profilo (bambino/bambina/uomo/donna) si deduce da sesso ed eta ma resta
scegliibile a mano — un adulto puo portare una taglia bambino. Per chi non ha
data di nascita in archivio, cioe quasi tutti gli allenatori e i soci, la
risposta e «adulto».

### Export

`src/lib/people-pdf-export.ts` si chiamava `athletes-pdf-export` ma non ha
mai saputo niente degli atleti: prende colonne e righe. Dal Blocco 7 lo usano
anche allenatori, staff e soci tramite `src/lib/person-export.ts`, che
contiene la sola parte che cambia — quali colonne ha ciascuna entita e come si
legge un valore da un record senza schema.

Le colonne **rispettano quelle visibili in elenco**, dove la pagina le
configura. Le colonne senza interruttore (codice fiscale, taglie) restano
sempre: in tabella non ci stanno, in un PDF servono.

## Telefoni e maiuscole: due regole condivise (Blocco 7, estese nel Blocco 8)

**Dove valgono.** Su **tutte** le anagrafiche e in **entrambi** i momenti:
creazione e modifica. Il Blocco 7 le aveva portate solo nei moduli di
creazione, e chi apriva una scheda esistente ritrovava i campi liberi di
prima: due comportamenti per lo stesso dato, a seconda di come ci si era
arrivati. Il Blocco 8 le ha portate anche su scheda atleta (atleta e
genitore/tutore), allenatore, staff, socio e **club**, che era rimasto fuori
del tutto.

L'elenco delle superfici e un test
(`tests/ui/anagrafiche-coverage.test.mjs`): una sesta anagrafica non puo
essere aggiunta senza passare di li.

### `PhoneField` — prefisso a tendina, numero a parte

Ogni anagrafica aveva un campo di testo libero, e dentro ci finiva di tutto:
`333 1234567`, `+39 333 1234567`, `0039 3331234567`, `333-123-4567`.

`src/components/forms/phone-field.tsx` con `src/lib/phone-numbers.ts`:
bandiera emoji, prefisso internazionale, numero separato, default 🇮🇹 `+39`.
Il valore memorizzato e sempre `+<prefisso> <numero>`.

**Va usato solo dove c'e davvero un numero di telefono.** Non su partita IVA,
numero di tessera o IBAN: sono campi numerici, non telefonici, e un selettore
di prefisso li peggiora.

**I dati legacy non si riscrivono.** `parsePhoneNumber` legge tutte le forme
di sopra; un numero che non dichiara un prefisso resta com'e e la tendina
mostra l'Italia solo come **ipotesi** (`assumedDefault`). Viene riscritto solo
se qualcuno lo modifica davvero: una normalizzazione di massa sui telefoni e
il tipo di operazione che si scopre di aver sbagliato quando un genitore non
riceve piu gli avvisi.

### `CapitalizedInput` — maiuscola dove ha senso

`src/lib/text-capitalization.ts` decide, `CapitalizedInput` applica **al blur**
— non mentre si digita: chi scrive `deLuca` e a meta di `De Luca`, e
correggerlo al terzo carattere gli sposta il cursore sotto le dita.

Cosa **non** fa:

- nessun `.toUpperCase()` indiscriminato;
- non tocca mai email, password, URL, username, codice fiscale, IBAN, partita
  IVA, numero di tessera, telefono, token. La regola e per parole in una
  lingua, non per identificatori. L'elenco e per sottostringa, perche gli
  stessi campi si chiamano in molti modi (`fiscalCode`, `fiscal_code`,
  `codiceFiscale`);
- non «corregge» le sigle: `ASD`, `US`, `U15`, `McDonald` restano come sono;
- le particelle in mezzo a un nome restano minuscole — `Mario de Luca`,
  `Van der Berg` — ma non se aprono il nome: `De Luca`. Dal Blocco 8 la
  particella si riconosce anche **prima di un apostrofo**: `reggio
  nell'emilia` → `Reggio nell'Emilia`, non `Nell'Emilia`;
- **non tocca un valore che ha gia una maiuscola dentro.** E la regola che il
  Blocco 8 ha dovuto aggiungere, e la ragione e misurata: applicando la
  capitalizzazione ai 7.896 comuni ISTAT, **30 nomi ufficiali venivano
  cambiati in peggio** — `Alcara li Fusi` → `Alcara Li Fusi`, `Morra De
  Sanctis` → `Morra de Sanctis`, `Riva presso Chieri` → `Riva Presso
  Chieri`. Nessun elenco di particelle chiude quel caso, perche non e una
  regola: `Alcara li Fusi` vuole `li` minuscolo e `Torre Le Nocelle` lo vuole
  maiuscolo. Sono nomi propri. Un valore scritto tutto minuscolo e «come
  capitava» e si sistema; un valore con una maiuscola dentro e gia una
  decisione di qualcuno — o dell'archivio ISTAT — e si lascia stare. Un test
  verifica i 7.896 nomi a ogni esecuzione;
- note e descrizioni prendono la maiuscola solo sulla prima lettera.

Nel dubbio la risposta e «non capitalizzare»: non farlo e reversibile, farlo
no.

## Il builder dei moduli: si mostra tre cose per volta (Blocco 9)

`src/components/forms/form-builder.tsx` e `form-field-card.tsx`, montati dalla
scheda «Moduli online» di `/modulistica`.

**Il difetto che questa sezione esiste per non far tornare.** L'editor
precedente teneva aperte, per ogni campo, tutte le impostazioni di tutti e
diciassette i tipi: tipo, placeholder, opzioni, minimo, massimo, tipi di file
accettati, dimensione massima, obbligatorieta. Chi doveva aggiungere «Nome del
genitore» ne leggeva otto che non lo riguardavano.

Le regole, che valgono anche per chi lo modifichera:

- **divulgazione progressiva.** Un campo chiuso mostra cosa chiede, di che
  tipo e, e se e obbligatorio. Descrizione, testo di esempio, opzioni e
  collegamento a un dato EasyGame stanno dietro «Impostazioni», che si apre
  per un campo alla volta. Un campo mostra solo le impostazioni che il suo
  tipo usa davvero — una tendina ha le opzioni, un campo data no;
- **l'anteprima non e un terzo pannello.** E la stessa pagina che cambia modo,
  e usa lo **stesso** `FormRenderer` del modulo pubblico. Tre rendering
  diversi sarebbero tre occasioni di mostrare in anteprima qualcosa di diverso
  da cio che il genitore poi compila;
- **l'utente non legge mai un identificativo tecnico.** «Telefono del
  genitore», mai `guardian.phone`. Le etichette vengono dal catalogo
  (`getDynamicFieldLabel`): un componente che se le costruisce da solo le fa
  divergere alla prima modifica;
- **la bozza si salva da sola, pubblicare e un gesto separato.** Debounce
  1,2 s, accorpamento con `createCoalescingSaver`, `SaveStatus` visibile: le
  tre cose che un autosave deve avere insieme. Una barra dichiara quando la
  bozza diverge da cio che il pubblico vede, altrimenti si crede di aver
  corretto un modulo che le famiglie stanno ancora compilando com'era;
- **«pubblicato» e «raggiungibile dal link» sono due interruttori**, e si
  vedono insieme nel pannello del link pubblico, con «Rigenera» accanto: un
  link di iscrizione prima o poi finisce in un gruppo dove non doveva.

### La coda della segreteria

Il numero di compilazioni da esaminare sta **sull'etichetta della scheda**:
una compilazione ferma in coda per tre settimane e un'iscrizione persa.

`SubmissionReviewDialog` mostra il valore attuale accanto a quello proposto,
distingue aggiunta da sostituzione, ed elenca gli omonimi **con il motivo per
cui somigliano**. Non decide: offre «Aggiorna questa scheda» e ricalcola.

### Il modulo pubblico

`/forms/[publicSlug]`. Non monta la chrome del club e non chiede una sessione.
Una colonna sola a **ogni** larghezza — e un modulo, non un cruscotto — con
comandi alti almeno 44 px e `min-h-[100dvh]`, non `h-screen`.

Verificato da `tests/ui/forms-builder.test.mjs`.

## Il numero di tessera non e obbligatorio (Blocco 7)

Vale per **atleta** e **allenatore**, ed e la scelta documentata per staff e
soci (dove non lo era gia).

Il motivo e la sequenza reale di una segreteria: un tesseramento si registra a
inizio stagione, la federazione emette il numero dopo. Pretenderlo al momento
dell'inserimento costringeva a inventarlo, e un numero di tessera inventato e
peggio di un campo vuoto — perche sembra un dato.

Cosa resta obbligatorio nel tesseramento di un atleta: la **federazione o
l'ente**. Senza quella il record non dice niente.

Client e server sono coerenti: `assertAnagraficaIsValid` non ha mai preteso un
numero di tessera, quindi non c'era divergenza da chiudere — solo un asterisco
e un controllo nel form da togliere.

## Allegati: se compare «Visualizza», il file si deve vedere (Blocco 7)

EasyGame salva gli allegati come **data URL** dentro il record. I browser
bloccano da anni la navigazione di primo livello verso `data:` — era il
vettore classico del phishing — quindi `window.open(dataUrl)` e
`<a href={dataUrl}>` non aprono e non scaricano niente. Non era un difetto di
un allegato o di un formato: era il meccanismo, e rendeva morto **ogni**
pulsante «Visualizza» dell'applicazione.

Regole:

- si passa sempre da `src/lib/client-files.ts`, che converte il data URL in
  un `Blob` e apre un **object URL** — non bloccato, e con il tipo MIME giusto,
  quindi il PDF si apre nel visualizzatore e l'immagine si vede;
- `openClientFileUrl` e `downloadClientFileUrl` restituiscono `false` quando
  non ci riescono: chi le chiama **deve** dirlo. Un pulsante che non fa niente
  e peggio di un messaggio di errore;
- il nome del file scaricato si costruisce con `buildAttachmentFileName`
  (`src/lib/attachment-names.ts`), mai a mano — vedi sotto;
- il blocco «allega / guarda / scarica / elimina» e un componente solo,
  `CertificateAttachmentField`. Era scritto sei volte, con gli stessi tre
  difetti in tutte e sei.

Quattro test in `tests/lib/attachment-names.test.mjs` falliscono se qualcuno
rimette un `window.open` su un allegato, un `<a href={…fileUrl}>`, un nome di
download scritto a mano, o un finto documento generato al posto del file vero.

### Come si chiama un file scaricato

```
<TipoDocumento>_<Cognome>_<Nome>_<data>.<estensione>
BLSD_Rossi_Mario_2026-08-25.pdf
```

Le parti mancanti si **saltano**, non si riempiono con segnaposto. L'estensione
viene dal MIME del data URL — che l'ha scritto il browser leggendo il file — e
solo in mancanza di quello dal nome originale. Un tipo sconosciuto non produce
estensione: meglio nessuna che una inventata.

Il file memorizzato non viene toccato: il nome e una decorazione del momento
del download.

### Il marchio EasyGame sta in un posto solo (Blocco 7)

Su desktop la sidebar e la topbar del club sono adiacenti e sempre entrambe
visibili. Il marchio compariva in tutte e due, a una trentina di pixel di
distanza: la seconda copia non aggiungeva informazione e sottraeva larghezza
al **logo del club**, che e l'unica identita che cambia da una schermata
all'altra.

Dal Blocco 7 il marchio vive nella sidebar (`components/dashboard/Sidebar.tsx`)
ed **e** il collegamento a `/account` — che era la sola funzione del logo
tolto dalla topbar. Nel menu utente resta la seconda via («Esci»). Sul menu di
navigazione di telefono il marchio resta, perche li la sidebar non c'e.

### La stagione e grigia (Blocco 7)

`--eg-season` e `--eg-season-soft` sono uno **slate**, non piu un ambra.

L'ambra e un colore semantico: nelle tabelle vuol dire «guarda qui» — quota in
attesa, certificato in scadenza. Sulla targhetta della stagione era acceso
sempre, su un valore quasi sempre corretto. Un avviso permanente non e piu un
avviso: consumava il significato dell'ambra in tutte le altre superfici senza
dire nulla in questa. La stagione resta leggibile perche ha un occhiello e le
cifre tabellari.

L'ambra resta dove segnala davvero qualcosa di specifico: la corona del
proprietario nella home account la scrive ora per esteso (`text-amber-700`),
perche quel colore diceva «sei tu il proprietario», non «stagione».

### Un solo stile per i comandi della topbar

Due varianti e basta, entrambe in `Header.tsx`:

- `topBarButtonClassName` — comando a sola icona, tondo;
- `topBarActionClassName` — stesso bordo, stesso fondo, stesso colore, con
  etichetta a partire da `xl`.

**Niente gradienti, niente pulsanti animati, niente varianti per contesto.** Le
azioni rapide erano un pulsante in gradiente animato: si mangiava l'attenzione
di tutta la barra e nessun altro comando aveva piu il suo peso.

## Tipografia: le regole definitive

**Due font, dichiarati una volta sola.** `Inter` (`--font-sans`) per testo e
dati, `Archivo` (`--font-display`) per i titoli, self-hosted con `next/font` in
`src/app/layout.tsx`. **Non se ne aggiungono altri e non si dichiarano
altrove**: un test lo impedisce.

| Serve | Si usa |
|---|---|
| Testo, etichette, dati | `font-sans` (predefinito su `body`) |
| Titoli, nomi propri, marchio | `font-display` |
| Colonne di date, importi, numeri, stagioni | `.eg-tabular` |
| Etichetta di sezione | `.eg-eyebrow` |
| Etichetta dentro una riga gia densa (stagione, «Aperto», «Piattaforma») | `.eg-eyebrow-sm` |

**Le taglie di occhiello sono due**, definite in `globals.css`. Prima erano
tre, scritte a mano con valori arbitrari diversi (`0.5625rem` qui, `0.625rem`
la): la stessa cosa in tre misure.

**Le taglie di testo vengono dalla scala Tailwind.** Nessun `text-[13px]`,
nessun `text-[0.9rem]`. Due eccezioni dichiarate, entrambe verificate dai test:

- i **documenti generati** per stampa, PDF ed email hanno il loro font di
  sistema: `next/font` non arriva dentro un PDF ne dentro un client di posta;
- le **primitive shadcn vendorizzate** (`ui/calendar.tsx`, `ui/form.tsx`)
  restano come sono: allinearle vuol dire perderne l'aggiornabilita.

Il resto dell'applicazione porta ancora una quindicina di taglie scritte a mano
in griglie dense: e debito noto (D26 in [16](16-technical-debt.md)) e si
normalizza toccando quelle pagine per altro motivo, **non** con un rifacimento
di massa.

## Vincolo per i WP successivi

Queste regole non si rinegoziano pagina per pagina:

1. **non si introducono font**, ne via `next/font` ne via CSS;
2. **non si ridisegna** cio che e gia allineato: si toglie solo la variazione
   arbitraria, cioe quella che fa la stessa cosa in un modo diverso senza un
   motivo scritto;
3. **una modifica alla chrome dichiara a quale delle due si applica** (club o
   piattaforma) e aggiorna `tests/ui/topbar-club-vs-platform.test.mjs`;
4. **una pagina nuova usa i componenti e i token esistenti.** Se serve davvero
   una variante nuova, va aggiunta qui prima di essere usata.

## Design system

- **Tailwind CSS 3** + **shadcn/ui** su Radix. Config in
  [`components.json`](../../components.json): style `default`, base color
  `neutral`, CSS variables **attive**, alias `@/components` e `@/lib/utils`.
- I colori si usano tramite i token semantici Tailwind
  (`bg-background`, `text-foreground`, `border-border`, `bg-primary`,
  `text-muted-foreground`, `bg-destructive`, ...), definiti come variabili HSL
  in `src/app/globals.css`.
- **Non introdurre colori hard-coded** dove esiste un token.
- `cn()` (`src/lib/utils.ts`, `clsx` + `tailwind-merge`) e l'unico modo corretto
  di comporre classi condizionali.

## Tema

`ThemeProvider` e configurato con `forcedTheme="light"`, `enableSystem={false}`
e `<html className="light">`. **L'app e mono-tema chiaro.**

Le variabili `.dark` esistono in `globals.css` e alcune classi `dark:` sono
sparse nei componenti, ma il dark mode **non e attivo**. Non aggiungere nuove
varianti `dark:` finche non esiste un WP che abilita il tema scuro.

## Lingua

Interfaccia, label, messaggi di errore e commenti di dominio sono **in
italiano**. Mantieni l'italiano per tutto cio che l'utente legge.
Identificatori di codice restano in inglese (`athlete`, `club`, `payment`).

## Layout delle pagine di management

```tsx
// desktop: Sidebar + Header;  mobile: MobileTopBar
<div className="flex h-[100dvh] bg-gray-50">
  <Sidebar />
  <div className="flex flex-1 flex-col overflow-hidden">
    <Header title="..." />
    <main className={dashboardMainClassName}>
      <DashboardPageContainer>{/* contenuto */}</DashboardPageContainer>
    </main>
  </div>
</div>
```

- `dashboardMainClassName` e `DashboardPageContainer` vivono in
  `src/components/dashboard/dashboard-page-container.tsx`. Usali invece di
  reinventare spaziature.
- Le pagine sotto `/dashboard` ereditano gia questa chrome dal layout: non
  duplicarla. Le altre pagine management la montano ancora a mano (~40 file):
  e il pattern esistente, non peggiorarlo ma non estenderlo.

## Componenti: dove mettere cosa

| Cartella | Contenuto |
|----------|-----------|
| `src/components/ui/` | Primitive riusabili e senza dominio (bottoni, dialog, tabelle, toast). Se e generato da shadcn, sta qui. |
| `src/components/<dominio>/` | Componenti legati a un dominio: `athletes/`, `matches/`, `payments/`, `trainer/`, `parent-dashboard/`, `structures/`, `forms/`, ... |
| `src/components/dashboard/` | Chrome e widget dell'area management |
| `src/components/providers/` | Solo context provider globali |
| `src/app/**/page.tsx` | Composizione della pagina. Nuova logica di dominio **non** va qui |

## Notifiche a schermo

Esistono **due** sistemi di toast montati insieme:

- `src/components/ui/toast-notification.tsx` — `ToastProvider` + `useToast`
  custom (il piu usato);
- `src/components/ui/toaster.tsx` + `use-toast.ts` — variante shadcn.

Entrambi sono attivi in `AppClientProviders`. **Per il codice nuovo usa
`useToast` da `@/components/ui/toast-notification`**, coerente con la maggior
parte delle pagine. La convergenza a uno solo e [WP-14](20-work-packages.md).

## Stati di caricamento ed errore

- `GlobalLoadingProvider` per gli overlay globali.
- `AccessAreaGuard` mostra uno spinner a tutta pagina finche la sessione non e
  risolta.
- Per il caricamento locale il pattern e uno `useState` booleano piu uno
  spinner Lucide (`Loader2` con `animate-spin`). Non c'e libreria di skeleton
  in uso (`skeleton.tsx` esiste ma non e referenziato).

**Tre stati, non due.** Dal Blocco 4 la home account distingue esplicitamente
_caricamento_, _vuoto_ ed _errore_, e la distinzione va mantenuta ovunque si
carichi un elenco: raccontare un errore di rete come "non hai nessun club" e
il modo piu veloce per far pensare a un utente che i suoi dati sono spariti.

- caricamento: uno **scheletro con la forma del contenuto**, non uno spinner a
  tutta pagina;
- vuoto: cosa manca, perche, e l'azione che lo risolve;
- errore: il messaggio del server, un `role="alert"` e un pulsante «Riprova».
  Se dei dati erano gia a schermo restano visibili, con un avviso sopra: un
  aggiornamento fallito non deve svuotare la pagina.

## Icone e immagini

- Icone: **`lucide-react`**. `@radix-ui/react-icons` e presente ma marginale.
- Immagini remote consentite solo dagli host in `next.config.js`
  (`r2.fivemanage.com`, `images.unsplash.com`, `api.dicebear.com`).
- Il progetto usa prevalentemente `<img>` invece di `next/image`: e la causa
  della maggior parte dei warning ESLint. Per il codice nuovo preferisci
  `next/image` quando l'immagine e statica e di dimensione nota.

## Ordinamento degli elenchi (Blocco 5, 2026-08-23)

Un solo comparatore per tutta la Web App: `src/lib/sorting.ts`.
**Non riscrivere `localeCompare` in una pagina.**

| Cosa | Helper | Modulo |
|---|---|---|
| Persone (atleti, allenatori, staff, soci, utenti) | `sortPeopleByLastName`, `comparePeopleByLastName` | `@/lib/athlete-name-utils` |
| Entita con un nome (categorie, gruppi, club, sponsor, strutture, articoli) | `sortByName`, `compareNameValues` | `@/lib/sorting` |
| Piu chiavi in cascata | `sortByNameKeys`, `compareNameValueLists` | `@/lib/sorting` |

Il confronto e italiano, case-insensitive (`sensitivity: "base"`), numerico
(«Under 9» precede «Under 10»), con i valori vuoti in fondo e **stabile**: due
nomi che differiscono solo per maiuscole o accenti restano nell'ordine di
partenza, cosi le chiavi successive (il nome dopo il cognome) possono decidere.

**Criterio unico per le persone: `Cognome` poi `Nome`.** Quando un record ha un
solo campo `name` (succede per allenatori e staff) si ricade sull'etichetta
completa: non si indovina dove finisca il cognome dentro un campo unico.

### Elenchi cronologici: quale direzione (Blocco 7)

«Non alfabetico» non vuol dire «nessun ordine». Alcuni elenchi comparivano
nell'ordine in cui erano stati scritti nel JSON — cioe di inserimento, che per
una segreteria non significa niente. Si usano `sortByDateDesc` e
`sortByDateAsc` da `@/lib/sorting`, con `paymentDateOf` come lettore della
data (i payload non hanno schema: incasso, poi scadenza, poi creazione).

| Vista | Direzione | Perche |
|---|---|---|
| Movimenti del club (incassi e uscite) | **decrescente** | Registro amministrativo: si guarda l'ultimo movimento |
| Bonifici fra conti | **decrescente** | Idem |
| Compensi di un allenatore | **decrescente** | Si controlla l'ultimo pagato |
| Contratti di un allenatore | **decrescente** | Il contratto in vigore e l'ultimo caricato |
| Storico pagamenti di un atleta | **decrescente** | Idem |
| Rate di un piano di pagamento | **crescente** | Si legge come una scaletta: si pagano in ordine |
| Rate di un atleta in «Rate e incassi» | **crescente per scadenza** | Stessa ragione. Le rate senza scadenza chiudono l'elenco |
| Incassi di una singola rata | **crescente** | E un estratto conto: «50, poi 30, poi 50» ricostruisce come si e arrivati al saldo, e quella ricostruzione si legge in avanti |
| Allenamenti e gare in calendario | **crescente** | E un'agenda, non un registro |

**Perche gli incassi di una rata vanno controcorrente rispetto ai movimenti
del club.** Sono due domande diverse. Nel registro del club si chiede «cosa e
successo per ultimo», e la risposta sta in cima. Dentro una rata si chiede
«come si e arrivati a questo residuo», e la risposta e una sequenza. Il
comparatore vive in `sortTransactionsChronologically`
(`@/lib/payments/installment-ledger`), che il server applica anche alle
risposte di `/api/v1/payment-transactions`: due cronologie ordinate in modo
diverso sono peggio di una cronologia non ordinata.

**Le voci senza data vanno in fondo in entrambe le direzioni**: una riga senza
data non e ne recente ne vecchia, e metterla in cima la farebbe sembrare
l'ultimo movimento.

### Dove l'ordinamento alfabetico NON va applicato

Elenchi in cui l'ordine ha un significato funzionale. Applicarvi l'alfabetico e
una regressione:

- date, scadenze, cronologie, storici (`compareTrainingsByStart`,
  `createdAt` decrescente);
- rate e piani di pagamento: contano numero e scadenza;
- classifiche e priorita (avvisi certificati, alert);
- sequenze configurate a mano (voci di navigazione, opzioni di permesso,
  componenti di un kit, orario settimanale);
- il club principale in cima all'elenco club: e una priorita, non un ordine
  nominale — gli altri club seguono in alfabetico.

## Elenchi lunghi: chiusi di default (Blocco 5, 2026-08-23)

Quando una pagina mostra **N schede ognuna con la propria tabella** — oggi i
gruppi numerazione in `/clothing` — le schede partono **chiuse** e si aprono a
tendina (`Collapsible`). L'intestazione mostra i numeri che servono a decidere
se aprire (quanti atleti, quanti senza numero, quanti duplicati).

Dentro la scheda aperta: un campo di ricerca e un limite di righe con «Mostra
altri». Con centinaia di atleti la tabella completa costava piu del resto della
pagina, e nessuno la leggeva tutta.

## Form

Non c'e uno standard unico:

- la maggior parte dei form usa `useState` controllati;
- `react-hook-form` e installato ma usato **solo** da
  `src/components/ui/form.tsx`, che oggi non e referenziato.

Per il codice nuovo segui il pattern prevalente (state controllato) salvo WP che
introduca `react-hook-form` in modo sistematico.

## Responsive

Breakpoint Tailwind standard. Il pattern ricorrente e duplicare il markup:
`hidden lg:flex` per desktop e `lg:hidden` per mobile, con `MobileTopBar` al
posto di `Sidebar`+`Header`.

Nelle schermate nuove (account, onboarding, import) il markup **non** viene
duplicato: una sola struttura che si riorganizza con `grid`/`flex` e i
breakpoint. E meno codice e non puo divergere fra le due copie. Le tre misure
di riferimento restano 375, 768 e 1280 px ([ADR-0025](18-decision-log.md)).

### Un contenitore flex deve poter restringersi (Blocco A, 2026-08-26)

**La regola.** Ogni elemento flex che contiene qualcosa di potenzialmente piu
largo di lui — una barra di schede, una tabella, una riga di comandi — vuole
`min-w-0`, oppure un `overflow` diverso da `visible`.

**Perche non e un dettaglio.** Un elemento flex ha `min-width: auto`: si
rifiuta di restringersi sotto la larghezza del proprio contenuto. Un figlio con
`overflow-x-auto` che dovrebbe scorrere **non scorre**: allarga il genitore, e
con lui la pagina. E il difetto piu insidioso di questa classe, perche ogni
singola classe scritta e corretta e sbagliato e cio che manca — nessuna
invariante statica lo puo vedere, e si scopre solo misurando la pagina.

Nel Blocco A e successo su `/organization` a 768 px: la barra delle nove
schede allargava il guscio del club a 1022 px e «Salva Modifiche» finiva fuori
schermo. Vedi [D34](16-technical-debt.md).

### La riga di comandi di un elenco va a capo

`flex w-full flex-wrap gap-2 sm:w-auto`, non `flex gap-2`. Due elenchi
gemelli con due varianti diverse producono due comportamenti diversi a 375 px,
ed e successo fra Allenatori e Soci: sei pixel di sfondamento bastavano a
rendere «Aggiungi Socio» impremibile.

## Accessibilita

Non esiste oggi una linea guida applicata ne test a11y. Le primitive Radix
forniscono la base (focus trap, ruoli ARIA). Non regredire: se usi un elemento
interattivo custom, aggiungi `aria-label` e gestione tastiera.

## Il filtro sede si mostra solo se serve (Workstream B, 2026-08-26)

Un club con **una** sede non deve vedere il concetto di sede da nessuna parte:
un menu con una voce sola non informa, occupa una riga e a 375 px la toglie a
cio che serve.

La regola sta nel componente, non nelle pagine. `SiteFilter`
(`src/components/sites/site-filter.tsx`) restituisce `null` quando
`isMultiSiteClub` e falsa — cioe con meno di **due sedi attive** — e ogni
schermata che lo monta eredita la stessa decisione senza riscriverla. Le
pagine che oggi lo montano sono Categorie, Atleti e Strutture.

Due componenti distinti di proposito:

| Componente | Quando si mostra | A cosa serve |
|---|---|---|
| `SiteFilter` | solo se il club e multi-sede | restringere un elenco |
| `SiteSelect` | se esiste almeno una sede | assegnare la sede a un record |

`SiteSelect` compare gia dalla prima sede perche assegnare una sede a una
struttura ha senso anche mentre il club sta configurando la seconda.

**«Tutte le sedi» non e un valore speciale.** Sede vuota sul filtro significa
«non restringere»; sede vuota sul record significa «non dichiarata», e un
record senza sede resta visibile con qualunque filtro. Le due asimmetrie
insieme sono cio che impedisce a un dato storico di sparire da un elenco il
giorno in cui il club configura le sedi ([ADR-0038](18-decision-log.md)).

## Le consegne si registrano dal telefono (Workstream B, 2026-08-26)

Il dialogo consegne di un kit
(`src/components/clothing/kit-delivery-dialog.tsx`) e a **schede impilate** e
non a tabella. Non e una preferenza estetica: le consegne si registrano in
magazzino, con il telefono in mano, ed e la schermata che a 375 px deve
funzionare per prima. Una tabella con sei colonne per articolo li sarebbe
inutilizzabile.

Lo stato del kit in cima **non e un campo**: e il riassunto degli articoli
(«Parziale · 2/4 consegnati · 1 non disponibile»). Non offrire un controllo
per cambiarlo — uno stato di kit scritto a mano si disallinea dai suoi
articoli al primo aggiornamento, e da quel momento nessuno dei due e
attendibile.

## Incassare una rata: due gesti, due finestre, un solo registro (Blocco E)

Una rata si incassa in due modi, e i due **non si confondono**:

| | «Registra pagamento» | «Paga online» |
|---|---|---|
| Cosa dice | Del denaro **e arrivato** | Del denaro **deve partire** |
| Chi lo fa | La segreteria | Chi paga |
| Chiede | Importo, data, metodo | Solo l'importo |
| Dove finisce | `payment_transactions`, subito | Sulla pagina del PSP, e torna col webhook |
| Chi lo scrive | La rotta autenticata | Solo l'evento firmato |

L'online **non** chiede data e metodo, e non e una semplificazione: il metodo
lo sceglie chi paga sulla pagina di Stripe e la data la stabilisce l'evento
firmato. Chiederli qui vorrebbe dire raccogliere due valori destinati a essere
ignorati.

**L'importo si sceglie anche online.** Fino al Blocco E il pulsante apriva il
checkout per il residuo intero: il registro sapeva gestire una rata pagata in
piu volte da sempre (ADR-0036) e il server accettava gia un importo parziale,
ma l'unico canale in cui l'acconto era impossibile era **quello che una
famiglia usa da sola**. Il canale manuale era piu flessibile di quello
automatico, che e il verso sbagliato. Ora le due finestre sono simmetriche:
importo precompilato col residuo, riepilogo «residuo / questo pagamento /
residuo dopo», stessa frase quando la rata restera parziale.

**L'unica asimmetria e voluta: online non si eccede il residuo.** Il canale
manuale accetta un incasso superiore, perche puo essere gia successo — denaro
arrivato allo sportello mentre qualcun altro registrava. Online il pagamento
non e ancora avvenuto: farlo partire per piu del dovuto **creerebbe** il
credito invece di registrarlo.

### Quando il pulsante non c'e

«Paga online» compare solo se `readiness.canCheckout` e vero, e lo calcola il
server: distingue provider non configurato, servizio spento dalla piattaforma,
abbonamento che non comprende la funzione, club senza account, account in
verifica e interruttore spento dalla segreteria. **Un pulsante che si accende e
poi spiega di non funzionare e peggio di un pulsante che non c'e.** Il
componente di lista non conosce Stripe: mostra la CTA solo se chi lo monta
gliela passa.

L'abbonamento e il sesto ostacolo, ed e arrivato tardi: fino al collaudo E-13
`readiness` non lo consultava e la rotta che incassa si, cosi su un club con il
piano `free` la CTA compariva e il clic rispondeva «Accesso negato:
l'abbonamento non e in corso». Le due superfici leggono ora la stessa regola.

Su una rata **saldata** non compare nessuna delle due CTA: entrambe passano
dallo stesso guardiano, `residualAmount > 0`.

### «Pagamento in verifica» deve sopravvivere al ritorno

E lo stato in cui una famiglia si trova fra il pagamento e la conferma firmata
del provider. Con carta e questione di secondi; con bonifico o SEPA puo durare
giorni, e dire «pagato» nel frattempo sarebbe una bugia che si scopre in
contabilita.

Il difetto era che lo stato viveva in una variabile React: il checkout porta
**fuori** dall'applicazione, e al ritorno la pagina e stata ricaricata da zero.
La finestra in cui l'etichetta va mostrata era esattamente quella in cui non
esisteva piu. Ora la rata in attesa e il suo residuo al momento del checkout si
scrivono in `sessionStorage` — **prima** di navigare, perche dopo questa pagina
puo non esistere piu.

Il residuo memorizzato e cio che permette di **smettere** senza interrogare
nessuno: quando il webhook ha registrato l'incasso il residuo scende, e il
confronto lo rivela alla prima lettura del registro. Senza, l'etichetta
resterebbe appesa fino alla chiusura della scheda.

`sessionStorage` e non `localStorage`: e un fatto di questa sessione del
browser, non una preferenza da conservare.
