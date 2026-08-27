# 25 — RC Fix 2: coerenza delle anagrafiche, azioni di massa, marchio dell'intermediario

**Data:** 2026-08-28 · **Branch:** `integration/web-v1` · **Staging:** *non
ancora distribuito* (vedi [Cosa resta aperto](#cosa-resta-aperto))

Come [24 — RC Fix 1](24-rc-fix-1.md), questo documento risponde a una domanda
sola: **cosa era rotto, perche, e come si sa che adesso funziona.**

## La lezione che vale piu delle singole correzioni

RC Fix 1 aveva imparato che i difetti veri si vedono solo aprendo la pagina.
RC Fix 2 lo conferma due volte, e in modo piu scomodo: **i due difetti piu
gravi di questo giro non erano nell'elenco dei punti da correggere.** Sono
emersi provando l'applicazione dopo aver finito il lavoro richiesto.

1. **La data di nascita non arrivava nel form**, e quindi il codice fiscale
   non si poteva calcolare da **nessuna** finestra di modifica. Il punto 3
   chiedeva un «hard check del flusso CF»: leggendo il codice il flusso
   sembrava corretto — c'era il calcolo, c'era la validazione, c'era il
   pulsante. Il difetto stava fra una colonna `DateTime` e un
   `<input type="date">`, cioe in un posto che nessun test di unita guardava e
   nessuna lettura del codice avrebbe insospettito.

2. **Una casella di selezione annunciava «Seleziona null».** Il codice era
   corretto per ogni anagrafica che ha un nome. Nei dati di sviluppo ce n'era
   una che non ce l'ha.

La regola che ne discende e la stessa di RC Fix 1, rafforzata: **un punto di
collaudo che si chiude leggendo il codice non e stato collaudato.** I sedici
punti di questo giro sono stati richiusi uno per uno su un'applicazione che
gira, e i due difetti sopra sono il rendimento di quella scelta.

## I punti, uno per uno

### 0. Pulizia dei dati di collaudo RC Fix 1 su staging

**Fatto.** Prima: 221 atleti su EasyGame FC, di cui **220 con marcatore
`RC1`**; un piano pagamento QA; un documento allenatore QA con il suo allegato.

Rimossi: i 220 atleti e le loro 220 appartenenze di categoria, il piano
`Quota annuale pro-rata`, il documento `Contratto 2026/2027` con allegato e
blob.

**Non toccati, per scelta:** `audit_logs` (618 righe, invariate), l'account
Stripe connesso (1, invariato), i 2 movimenti del registro incassi (nessuno
riconducibile agli atleti RC1: verificato prima di cancellare), i 307 atleti e
174 risorse degli altri club, e le due anagrafiche **fixture** del
provisioning E2E — `Giulia Athlete` e `Luca Trainer`, riconosciute dal marcatore
`stagingE2E: true` e non dalla data di creazione, che le avrebbe fatte
sembrare dati RC1.

Dopo: 1 atleta (la fixture), 0 allegati. **Integrita referenziale verificata su
dieci relazioni: zero orfani.**

### 1. Ordine dei campi anagrafici

**La causa.** Nove anagrafiche di persona chiedevano gli stessi sei dati in sei
ordini diversi: l'email fra cognome e data di nascita nel nuovo socio, la
categoria fra data e sesso nel nuovo atleta, eta e nazionalita sparse nella
scheda allenatore, il codice fiscale chiuso in una fisarmonica.

E il **luogo di nascita non era un campo**: viveva dentro
`AssistedFiscalCodeField`. Nelle schede allenatore e staff questo produceva
**due controlli per lo stesso dato** — una casella libera e la ricerca nascosta
sotto il codice fiscale — di cui solo la seconda produceva il codice catastale.
Chi compilava la prima si sentiva rispondere che il comune mancava.

**Correzione.** L'ordine e dichiarato in `src/lib/person-identity.ts` e
disegnato da `PersonIdentityFields`: non esiste un modo di montarlo che produca
una sequenza diversa. `BirthPlaceField` e estratto dal campo del codice
fiscale. Vedi [ADR-0066](18-decision-log.md#adr-0066--lordine-dei-campi-anagrafici-e-un-componente-non-una-convenzione).

**Prova a schermo.** L'albero di accessibilita della finestra «Modifica
Informazioni Generali» di un atleta:

    textbox "Nome" → textbox "Cognome" → textbox "Data di nascita" →
    combobox comune di nascita → combobox "Sesso" → textbox "Codice fiscale"
    → textbox nazionalita → combobox categoria

Nuovo staff e nuovo socio danno la stessa sequenza.

### 2. Maiuscola automatica su nomi e cognomi

**La causa.** La regola esisteva (`CapitalizedInput`) ma viveva **solo nei
campi di testo**: l'import atleti da file — il modo in cui un club carica i
primi duecento nomi — la aggirava del tutto, e nell'elenco ordinato i nomi
importati e quelli digitati sembravano due archivi diversi. Due schede
(staff, in modifica) avevano ancora due `<Input>` nudi.

**Correzione.** `normalizeAnagraficaText` in `src/lib/server/anagrafica.ts`,
chiamata accanto a `assertAnagraficaIsValid` in **tutte e cinque** le scritture
di `resources.ts` (un test conta le due chiamate e pretende che siano pari).
Tocca solo campi semantici di persona o luogo; mai email, codici, IBAN o note.

**Prova a schermo.** Digitato `de luca` nel campo Cognome di «Nuovo staff» e
premuto Tab: il campo diventa `De Luca`.

### 3. Codice fiscale — e il difetto che il punto cercava

**La causa.** `athletes.birth_date` e una colonna `DateTime`: dall'API arriva
come `2010-05-12T00:00:00.000Z`. Un `<input type="date">` accetta solo
`YYYY-MM-DD` e con qualunque altra forma **si disegna vuoto, senza dire
niente**. Il calcolo del codice fiscale legge la stessa data, non la riconosce
e risponde «per calcolarlo servono ancora: data di nascita» — mentre la
scheda, due centimetri piu su, quella data la mostrava.

**Correzione.** `toDateInputValue` nel modulo condiviso: vale per tutte e nove
le anagrafiche insieme, e il campo e il calcolo leggono la **stessa** funzione.
Si tagliano i primi dieci caratteri invece di costruire una `Date`: a ovest di
Greenwich `new Date(...)` letta con i getter locali e il giorno prima, e una
data di nascita spostata di un giorno produce un codice fiscale **plausibile e
sbagliato**.

**Prova a schermo.** Sulla scheda di un'atleta nata il 12 mag 2010: prima il
campo era vuoto e mancava «data di nascita»; dopo mostra `2010-05-12`, e
completando sesso e comune **da tastiera** compare «Calcola codice fiscale» e
produce `RSSGLI10E52H503Y` — «Codice fiscale valido».

### 4. Autosave — normalizzazione dell'interfaccia

**Gia chiuso da RC Fix 1**, verificato qui e protetto da test nuovi.

**Prova a schermo.** Sulla scheda Club: l'elemento `role="status"` esiste ma a
riposo ha **testo vuoto**; nessun badge permanente; **zero** pulsanti «Salva»
nella pagina. Modificando il nome, l'indicatore passa a `Salvato alle 00:29` e
sparisce da solo.

### 5. Lettura del documento su nuovo atleta / staff / socio / allenatore

**Gia presente** su tutte e cinque le superfici (le quattro piu il
genitore/tutore). Qui e stato corretto un difetto di accessibilita: l'anteprima
dei dati letti compariva **sotto** il pulsante appena premuto, e chi naviga da
tastiera restava con il fuoco sul pulsante. Adesso il fuoco arriva
sull'anteprima, che e una regione con un nome.

Il flusso resta quello di ADR: **si propone, non si scrive.** Nessun servizio
esterno introdotto.

### 6-9. Selezione multipla e azioni di massa

**La causa.** L'elenco Atleti aveva il pattern maturo; allenatori, staff e soci
avevano l'export PDF e basta — e quell'export prendeva **sempre tutto**.

**Correzione.** Regole in `src/lib/list-selection.ts` (modulo puro),
interfaccia in `src/components/ui/list-selection.tsx`. Le azioni le decide il
dominio:

| Elenco | Azioni | Nota |
|---|---|---|
| Allenatori | attiva/sospendi, assegna a gruppo o categoria, export | l'assegnazione **aggiunge** |
| Staff | attiva/disattiva, sposta di reparto, export | il reparto e uno solo: **sostituisce** |
| Soci | attiva/disattiva, tipo socio, export | il tipo e uno solo: **sostituisce** |

**Nessuna eliminazione di massa** fuori dagli atleti: non e stata chiesta, e
cancellare dieci anagrafiche in un clic e l'operazione con il rapporto peggiore
fra gesto e conseguenza. **Nessun export CSV**: non e uno standard di questo
prodotto — l'unico CSV esistente e la riconciliazione dei bandi, con un
generatore suo — e introdurlo qui avrebbe voluto dire inventarne il formato.

**Prova a schermo.** Selezionati due allenatori: la barra dice «2 allenatori
selezionati» con Attiva, Sospendi, Assegna a un gruppo, Esporta PDF, Cancella
selezione. Su un socio solo: «1 socio selezionato». A riposo la barra **non
esiste**.

### 10. Export PDF per ambito

**Correzione.** `availableExportScopes` offre solo gli ambiti che dicono
qualcosa di **diverso** fra loro, e con una selezione attiva il primo e sempre
«selezionati» — e cio che evita il PDF di quaranta pagine a chi ne aveva
scelte quattro.

**La regola che conta.** «Selezionati» significa **esattamente** i selezionati:
`resolveScopeRows` non interseca mai con il filtro. Un export con dentro una
persona che nessuno ha scelto e un documento che poi esce dal club.

**Prova a schermo.** Con 2 allenatori selezionati su 3, il menu offre
«Esporta selezionati (2)» e «Esporta tutti (3)» — e **non** «risultato
filtrato», perche nessun filtro sta togliendo niente.

### 11-15. Multi-sede

**Gia costruito** (ADR-0038, ADR-0055) e coperto da 21 test. Qui e stato fatto
il *hard check* richiesto, con una sola aggiunta.

**Verificato a schermo:**

- **11 e 13.** Le liste sono operativamente separate: `Pulcini · Santi Cosma
  (99)` e `Pulcini · Scauri (99)` sono due schede distinte, ognuna con il
  proprio elenco e la propria casella «seleziona tutti»;
- **12.** Nella modifica di una categoria: «Sedi in cui e attiva — Ogni sede
  spuntata diventa un gruppo operativo… La categoria resta una sola… Togliere
  una sede non cancella niente: il gruppo viene archiviato»;
- **14.** Sede e struttura restano concetti distinti, come prima;
- **15.** L'assegnazione di massa di un allenatore offre `Pulcini · Santi
  Cosma` e `Pulcini · Scauri` **separatamente**, non la categoria: assegnare
  a Roma non implica Aprilia.

**L'aggiunta:** un **filtro gruppo** accanto al filtro sede. Le liste erano gia
separate, ma per arrivare a una squadra si poteva solo scegliere la sede e poi
scorrere: su sei categorie in tre sedi sono diciotto schede da attraversare.
Sede → Gruppo, oppure direttamente Gruppo. Un gruppo e la coppia (categoria,
sede), quindi il filtro si traduce nei due parametri che l'archivio conosce
gia e restringe **anche** la query.

### 16. Marchio dell'intermediario di pagamento

**La causa.** La scheda diceva «il provider» sette volte e non nominava mai
Stripe. Era una scelta deliberata — il registro dei provider prevede che un
domani ce ne sia un altro — ma per chi guardava era una societa che stava per
dare i propri dati bancari, e a cui venivano chiesti documenti d'identita, a
un'azienda **senza nome**.

**Correzione.** Il nome arriva da `account.provider`, non da una stringa
scritta nella pagina. Il logotipo si monta solo se l'intermediario e Stripe, e
solo dove si decide di collegare un conto — non su ogni rata e non su ogni
movimento. «Pagamenti online» e «Payout» si leggono separatamente, perche un
conto puo incassare e non poter ancora versare.

**Prova.** Il logotipo e stato verificato **geometricamente** in un browser: i
sette tracciati disegnano sette glifi da sinistra a destra, non sovrapposti,
con una `t` alta e stretta, una `i` il cui punto sta esattamente sopra il suo
stelo e una `p` con discendente. E la parola «stripe».

> **Non provato a schermo dentro l'applicazione.** Sul club di sviluppo la
> scheda Pagamenti e dietro un abbonamento non attivo, e la scheda del conto
> non si monta. Resta coperta da sei test e dalla verifica del logotipo.

### 17. `/athletes/:id` senza `clubId`

**La causa — e non era il server.** La rotta non ha **mai** letto `clubId`
dalla query: risolve lo scope dalla sessione e filtra da li. Era la **pagina**
a pretendere il parametro e a fermarsi con «ID del club mancante».

**Correzione.** `resolveActiveClubId`, come nel resto dell'applicazione. Se
manca tutto, l'atleta si carica lo stesso e il club si adotta dal record.

**Prova a schermo.** `/athletes/<id>` senza `?clubId=` apre la scheda completa.

### 18-19. Copia, densita, accessibilita

Rimossi: il campo «Luogo di nascita» duplicato su due schede, il secondo
controllo del comune, la voce «Altro» del sesso che il calcolo del codice
fiscale non puo usare. Nessun badge decorativo aggiunto.

Accessibilita: ogni casella dice **cosa** sta selezionando e lo dice con il
nome della persona; il conteggio e in una regione annunciata; il logotipo ha un
testo alternativo; i menu sono quelli condivisi (uno fatto con `div` e
`onClick` si vede uguale e non si apre da tastiera — la scelta del comune di
nascita in UAT e stata fatta **con la tastiera**, freccia giu e Invio).

Corretto: «Seleziona **null**» su una riga senza nome.

## I gate

| Gate | Esito |
|---|---|
| `npm test` | **1.893 verdi**, 0 falliti (da 1.838: **55 nuovi**) |
| `npm run typecheck` | nessun output |
| `npm run lint` | 0 errori, 40 warning — **invariati** |
| `npm run build` | completa |
| `npx tsc --allowUnreachableCode false` | pulito (gate della CI) |
| CI remota | verde su `737e0ff` (HEAD) |
| Multi-tenant | i test di isolamento restano verdi; 5 nuovi sullo scope atleta |
| Responsive | 375 / 768 / 1280 / 1440: nessuno scorrimento orizzontale, **zero** comandi fuori schermo |

### Test nuovi, per file

| File | Test | Cosa protegge |
|---|---|---|
| `tests/ui/person-identity-order.test.mjs` | 7 | l'ordine dei sei campi, e che la mezzanotte UTC non diventi il giorno prima |
| `tests/lib/list-selection.test.mjs` | 9 | «selezionati» non si interseca con i filtri |
| `tests/ui/bulk-selection-surfaces.test.mjs` | 6 | i tre elenchi, e che nessuno prenda l'eliminazione di massa |
| `tests/server/athlete-scope-fallback.test.mjs` | 5 | lo scope atleta, e che non diventi una porta su tutti i club |
| `tests/ui/stripe-branding.test.mjs` | 6 | il nome dal record, il marchio solo dove serve |
| `tests/ui/rc-fix-2-accessibility.test.mjs` | 6 | nomi delle caselle, fuoco, tastiera |
| `tests/server/anagrafica-validation.test.mjs` | +5 | la maiuscola lato server, e che ogni scrittura validata sia anche normalizzata |
| `tests/ui/responsive-invariants.test.mjs` | +4 | le superfici nuove a 375 px |
| `tests/lib/club-profile-autosave.test.mjs` | +2 | niente indicatore a riposo, niente CTA doppia |
| `tests/ui/multisite-ux.test.mjs` | +4 | il filtro gruppo non attraversa le sedi |

## Cosa resta aperto

1. **Il deploy su staging non e stato eseguito.** Il comando `npx vercel
   --prod` sul progetto `easygame-staging` e stato **bloccato dal
   classificatore dei permessi**. Il codice e su GitHub e la CI e verde; su
   staging gira ancora la build di RC Fix 1. Di conseguenza **la UAT del
   punto 20 e stata fatta in locale**, su una build di produzione del ramo
   corrente servita da `scripts/start-verify-server.mjs` con il database di
   sviluppo — non su staging.

2. **Le quattro categorie «Categoria importata»** create dall'import RC1 su
   EasyGame FC sono rimaste. Non erano nell'elenco da rimuovere e ora non sono
   referenziate da nessun atleta: si tolgono in una riga, ma la decisione e di
   chi ha scritto l'elenco.

3. **I deployment Preview di `easygame-staging` falliscono tutti** — anche
   quelli precedenti a questo lavoro — con `Environment variable not found:
   DIRECT_URL`. E una variabile mancante nell'ambiente Preview, non un difetto
   del codice; cambiarla richiede autorizzazione ([CLAUDE.md §9](../../CLAUDE.md)).

4. **Il progetto Neon `easygame-production`** esiste ancora e non e stato
   toccato. Era gia annotato in [24 — RC Fix 1](24-rc-fix-1.md).

5. **Il conteggio delle schede di gruppo** sopra la soglia di paginazione conta
   le righe caricate, non quelle del gruppo: registrato in
   [16 — Debito tecnico](16-technical-debt.md).
