# 28 — Lavoro sportivo e compensi: analisi

> **Documento di analisi. Nessuna riga di codice, nessuna migrazione, nessuna
> modifica al database.** Serve a decidere l'architettura prima di scriverla.
>
> Data: **2026-08-28**. Branch di riferimento: `integration/web-v1`.
> Stato del codice descritto: quello del commit `3b03a30` (dopo RC Fix 3).

## Nota di metodo, da leggere prima di tutto

Questo documento contiene **due tipi di affermazioni** e non vanno confuse.

1. **Cosa c'e in EasyGame.** Verificato leggendo il repository. Se sbaglia,
   vince il codice.
2. **Cosa dice la normativa italiana sul lavoro sportivo.** Ricostruito da
   fonti ufficiali dove raggiungibili, da prassi professionale dove no.
   **Ogni regola porta la sua fonte e, quando serve, il suo grado di
   incertezza.**

Il secondo tipo di affermazione **non e una consulenza** e non puo diventare
codice senza la validazione di un professionista abilitato. Il capitolo
[21 — Validazione professionale](#21--validazione-professionale) elenca, una
per una, le regole che **devono** passare da un commercialista o da un
consulente del lavoro.

Marcature usate: **[ufficiale]** fonte istituzionale letta direttamente;
**[ufficiale, da rileggere a mano]** documento istituzionale individuato ma non
estraibile automaticamente; **[professionale]** ricostruzione di dottrina o
prassi professionale, con citazione dei riferimenti normativi.

---

## Indice

1. [Executive summary](#1--executive-summary)
2. [Normativa](#2--normativa)
3. [Soggetti](#3--soggetti)
4. [Tipologie di rapporto](#4--tipologie-di-rapporto)
5. [Soglie](#5--soglie)
6. [Fiscalita](#6--fiscalita)
7. [Contributi](#7--contributi-con-esempi-numerici-2026)
8. [Adempimenti](#8--adempimenti)
9. [Contratti e rapporto](#9--contratti-e-rapporto)
10. [Pagamenti](#10--pagamenti)
11. [Documenti e procure](#11--documenti-e-procure)
12. [RASD](#12--rasd)
13. [CU e F24](#13--cu-e-f24)
14. [Premi e rimborsi](#14--premi-e-rimborsi)
15. [UX](#15--ux)
16. [Modello dati proposto](#16--modello-dati-proposto)
17. [Integrazioni con EasyGame](#17--integrazioni-con-easygame-e-gap-analysis)
18. [Rischi](#18--rischi)
19. [Decisioni da prendere](#19--decisioni-da-prendere)
20. [Piano V1 / V2](#20--piano-v1--v2)
21. [Validazione professionale](#21--validazione-professionale)
22. [Proposta finale](#22--proposta-finale)
23. [Fonti](#23--fonti)

---

## 1 — Executive summary

### 1.1 La domanda

Puo EasyGame gestire i compensi di atleti, allenatori, preparatori e staff —
contratti, scadenze, pagamenti, contributi, ritenute, adempimenti — restando
un gestionale sportivo e senza diventare un software paghe?

### 1.2 La risposta breve

**Si, ma solo se si taglia il perimetro nel punto giusto.** Il punto giusto
non e «quanto e difficile da programmare»: e **dove passa la responsabilita
legale**.

- **Sotto quel confine** ci sono cose che EasyGame puo fare meglio di chiunque
  altro, perche e l'unico sistema che sa *chi allena cosa, quando, e quanto gli
  e stato pattuito*: il rapporto di lavoro, il piano compensi, la maturazione,
  l'erogazione, il documentale, le scadenze, la posizione annua del lavoratore
  rispetto alle soglie.
- **Sopra quel confine** ci sono cose che EasyGame **non deve fare**: versare,
  dichiarare, trasmettere, produrre il documento che fa fede. Ogni volta che un
  gestionale ha provato a fare da sostituto d'imposta senza esserlo, ha
  prodotto adempimenti sbagliati **con l'aria della competenza**. E esattamente
  l'errore che il motore fiscale di EasyGame gia esiste per impedire
  ([ADR-0052](18-decision-log.md)).

### 1.3 Le cinque cose che questo modulo deve fare bene

1. **Il rapporto di lavoro sportivo e un oggetto di prima classe.** Non un
   campo dentro l'allenatore, non un allegato. Ha una persona, un ruolo, un
   tipo, un periodo, un piano e uno stato.
2. **Il compenso ha tre stati, non uno.** *Programmato* (il piano lo prevede),
   *maturato* (il periodo e trascorso e la prestazione e stata resa), *erogato*
   (il denaro e uscito). Confonderli e lo stesso errore che
   [ADR-0036](18-decision-log.md#adr-0036--una-rata-e-un-debito-un-incasso-e-un-movimento-due-tabelle-non-una)
   ha gia chiuso sugli incassi — una rata e un debito, un incasso e un
   movimento, due tabelle e non una. **Qui vale identico, al contrario.**
3. **La posizione annua si calcola, non si scrive.** Il progressivo verso i
   5.000 e i 15.000 e una funzione di (erogazioni del club) + (compensi esterni
   dichiarati) su un **anno solare**. Nessuna schermata deve poterlo impostare
   a mano. Stessa disciplina del maturato dei contributi
   ([ADR-0054](18-decision-log.md#adr-0054--il-massimale-del-bando-non-e-limporto-assegnato-al-club-e-una-presenza-non-e-sempre-una-prova))
   e dello stato di una rata.
4. **EasyGame conosce solo cio che paga.** Le soglie sono **per lavoratore**,
   non per committente: senza autocertificazione degli altri compensi il
   calcolo e strutturalmente parziale. L'autocertificazione non e un allegato
   facoltativo: e **un dato di input del motore**, con un anno, una data, una
   firma e una scadenza.
5. **Le regole dell'anno sono configurazione versionata, non costanti sparse.**
   Aliquote, franchigie, riduzioni e loro scadenze cambiano per legge. Vanno in
   un modulo `SPORT_WORK_RULES_<anno>` che contiene anche la **fonte
   normativa**, esattamente come le regole di un bando sono gia dati e non
   codice ([ADR-0037](18-decision-log.md#adr-0037--un-contributo-non-e-un-pagamento-due-contabilita-separate-e-le-regole-del-bando-sono-dati)).

### 1.4 Le tre cose che questo modulo non deve fare in V1

1. **Non versare e non trasmettere.** Niente invio F24, niente Uniemens,
   niente flusso al RASD via API (non esiste una API pubblica per farlo),
   niente CU allo SdI. EasyGame **prepara i dati**, una persona li porta dove
   vanno. E la stessa scelta gia presa su FatturaPA e sulla rendicontazione dei
   bandi.
2. **Non fare le paghe.** Il lavoro subordinato sportivo — cedolino, INAIL,
   ferie, TFR, malattia, CCNL, conguagli — e un mestiere diverso, con un
   software diverso e una responsabilita professionale diversa. In V1 si
   **registra l'esistenza** di un rapporto subordinato e il suo costo; non lo
   si liquida.
3. **Non compensare in automatico.** Un compenso non paga una quota, un
   contributo non salda una rata, un rimborso non e un compenso. Stessa scelta
   di ADR-0037.

### 1.5 Cosa esiste gia e va riusato, non riscritto

| Serve | EasyGame ha gia |
|-------|-----------------|
| Disciplina del registro di denaro | `src/lib/server/payment-transactions.ts` + `src/lib/payments/installment-ledger.ts` (in entrata): stato derivato, storno invece di cancellazione, due scritture in una transazione |
| Aggregazione entrate/uscite | `src/lib/club-financial-summary.ts`, che gia normalizza `trainer_payments` e i pagamenti procura come **uscite** |
| Documenti e byte | Attachment Core (`attachments` + `attachment_blobs`), con `owner_type`/`owner_id` gia polimorfico |
| Tracciabilita | `audit_logs` con `recordAuditEvent`, gia esteso a incassi, storni, documenti, contributi e **tutti i dinieghi** |
| Notifiche + email | `Notification` + `POST /api/v1/notifications`, che invia anche l'email |
| Multi-tenant e autorizzazione | `requireAuthenticatedUser` + `resolveOrganizationScopeForUser` + `ensureOrganizationAccess`, con la convenzione «Accesso negato» → 403 |
| Motore documentale fiscale | `src/lib/fiscal/engine.ts`, `fiscal-profile.ts`, `operation-types.ts`, serie e numerazione per club/anno |
| Fatturazione elettronica in uscita | `src/lib/fiscal/fatturapa` + `EInvoiceTransmission` (tracciato si, trasmissione no) |
| Periodizzazione | `src/lib/club-seasons.ts` + `src/lib/server/seasons.ts`, con `SEASON_SCOPED_DATA_TYPES` e rollover idempotente |
| Gating per piano | `src/lib/entitlements/` con motivo esplicito ([ADR-0046](18-decision-log.md#adr-0046--chi-puo-usare-cosa-si-calcola-in-un-posto-solo-e-la-risposta-dice-sempre-perche), [ADR-0048](18-decision-log.md#adr-0048--il-piano-di-una-societa-appartiene-alla-piattaforma-non-alla-societa)) |
| Il precedente da imitare | `funding_programs`: regole come dati, cinque importi separati, maturato non scrivibile a mano |

### 1.6 Cosa esiste gia ed e il problema, non la soluzione

Tre cose nel repository **sembrano** questo modulo e non lo sono.

| Cosa | Dov'e | Perche e un problema |
|------|-------|----------------------|
| `trainer_payments` | tabella `TrainerPayment` in `prisma/schema.prisma:840`; capability «Compensi allenatori: COMPLETE» in [11](11-capabilities.md) | E una riga con `trainer_name` **testo libero**, `month` **stringa**, `amount` **Float** e `status` **impostabile a mano**. Non ha rapporto, non ha lordo/netto, non ha contributi, non ha anno fiscale, non ha storno. E un promemoria di pagamento, non un registro. **Il modulo nuovo lo assorbe: non gli si affianca.** |
| `clubs.procure` (JSON) + `/procura` | `src/app/procura/page.tsx` (1.690 righe), risorsa `procure` in `resources.ts:55` | Mescola tre cose diverse: l'**anagrafica di un'agenzia**, i suoi **contatti**, e una lista di **pagamenti** liberi con `personId` e `amount`. Il termine «procura» nel dominio sportivo ha almeno quattro significati distinti ([cap. 11](#11--documenti-e-procure)) e questa pagina non ne dichiara nessuno. |
| `clubs.trainers` / `clubs.staff_members` (JSON) | colonne JSON del club, proiettate da `src/lib/server/resources.ts` | Allenatori e staff **non sono righe di tabella**: sono elementi di un array JSON. Un rapporto di lavoro che deve puntare a una persona con integrita referenziale, qui, non ce l'ha. E il vincolo tecnico piu pesante di tutto il modulo ([cap. 16](#16--modello-dati-proposto)). |

### 1.7 La raccomandazione in una riga

Costruire **un dominio nuovo, isolato e versionato** (`sport-work`), che
**riusa** disciplina del ledger, attachment, audit, notifiche, auth e stagioni;
che **calcola e non versa**; che **assorbe** `trainer_payments`; che **non
tocca** i pagamenti in entrata; e che dichiara a chiare lettere, in ogni
schermata dove il numero puo essere parziale, **che il numero e parziale**.

---

## 2 — Normativa

### 2.1 L'impianto

La disciplina del lavoro sportivo e stata riscritta dal **D.Lgs. 28 febbraio
2021, n. 36** (attuativo della legge delega 86/2019), in vigore per la parte
lavoro dal **1 luglio 2023**, poi corretto dal **D.Lgs. 5 ottobre 2022, n. 163**
e dal **D.Lgs. 29 agosto 2023, n. 120**, e ritoccato dal **D.L. 31 maggio 2024,
n. 71** («decreto sport») sui rimborsi ai volontari. La professione di agente
sportivo e disciplinata a parte dal **D.Lgs. 28 febbraio 2021, n. 37**.

Prima del 1 luglio 2023 i compensi sportivi dilettantistici erano **redditi
diversi** ex art. 67 c. 1 lett. m) TUIR, con franchigia di 10.000 euro e
**nessuna contribuzione**. **Quel mondo non esiste piu**: chi progetta oggi un
modulo compensi su quello schema progetta su una norma superata.

### 2.2 Le norme che contano per questo modulo

| Riferimento | Oggetto | Rilevanza per EasyGame |
|-------------|---------|------------------------|
| D.Lgs. 36/2021, art. 25 | Definizione di **lavoratore sportivo** | Decide chi entra nel modulo |
| D.Lgs. 36/2021, art. 28 | Forme del rapporto; **presunzione di autonomia** entro 24 ore settimanali | Decide il tipo di rapporto |
| D.Lgs. 36/2021, art. 29 | **Volontari sportivi**: rimborsi documentati e forfettari | Separa il volontario dal lavoratore |
| D.Lgs. 36/2021, art. 34 | Obblighi **assicurativi** | Distingue INAIL da copertura sportiva ex art. 51 L. 289/2002 |
| D.Lgs. 36/2021, art. 35 | Regime **previdenziale**: Gestione separata, franchigia 5.000, riduzione 50% | Motore contributivo |
| D.Lgs. 36/2021, art. 36 | Regime **fiscale**: franchigia 15.000, autocertificazione, **premi** (c. 6-quater) | Motore fiscale |
| D.Lgs. 36/2021, art. 37 | **Co.co.co. amministrativo-gestionali** | Estende il perimetro oltre lo sportivo puro |
| D.Lgs. 39/2021 e regolamento RASD | **Registro** nazionale attivita sportive dilettantistiche | Adempimento comunicazionale |
| D.Lgs. 37/2021 | **Agente sportivo** e contratto di mandato | Il vero significato di «procura» |
| TUIR artt. 50, 51, 53, 54, 67 | Qualificazione dei redditi e trasferte | Base del calcolo |
| DPR 600/1973, artt. 23, 25, 30 | Ritenute; ritenuta sui **premi** (art. 30) | Cosa il club trattiene |
| DPR 322/1998, art. 4 | **Certificazione Unica** e modello 770 | Adempimento dichiarativo |
| L. 335/1995, art. 2 c. 30 | Ripartizione **1/3 lavoratore, 2/3 committente** | Chi paga cosa |

### 2.3 Prassi rilevante e aggiornata

| Fonte | Data | Cosa stabilisce |
|-------|------|-----------------|
| **INPS, circolare n. 88** | 31 ottobre 2023 | Prima disciplina operativa completa: iscrizione Gestione separata, franchigia 5.000 riferita al **lavoratore** e non al singolo committente, aliquote, Uniemens, F24. **[professionale]** — riprodotta da federazioni e ordini; il testo su inps.it va riletto a mano |
| **INAIL, circolare n. 46** | 27 ottobre 2023 | Assicurazione dei **subordinati sportivi** e dei **co.co.co. amministrativo-gestionali** ex artt. 34 e 37. **[professionale]** |
| **Dipartimento per lo Sport — FAQ lavoro sportivo** | pubbl. 19 marzo 2024, agg. 30 maggio 2024 | Interpretazione ufficiale su lavoratore sportivo, contratto, RASD, soglie. **[ufficiale, da rileggere a mano: il PDF non e estraibile automaticamente]** |
| **Agenzia delle Entrate — consulenza giuridica n. 14/2025** | 2025 | Ritenute sull'eccedenza dei 15.000; ruolo dell'autocertificazione; regime forfettario (coefficiente solo sull'eccedenza, ma i 15.000 rilevano per il tetto); **premi** ex art. 36 c. 6-quater (no CU, si 770 quadro SH prospetto G, ritenuta in quadro ST ex art. 30 DPR 600/73); premi che sono in realta retribuzione variabile seguono il regime del rapporto; IRAP: compensi sotto 85.000 non rilevano. **[professionale, con riferimenti puntuali]** |
| **INPS, circolare n. 8 del 3 febbraio 2026** | 3 febbraio 2026 | Aliquote, minimale e massimale Gestione separata **2026**. **[professionale]**. Numero **confermato**: e la n. 8 del 3 febbraio 2026. Alcune fonti secondarie citavano per lo stesso contenuto una «circolare n. 5/2026»: e sbagliato, e non va reintrodotto |

### 2.4 Cosa e incerto, e va detto

Tre punti sono **oggetto di interpretazione non consolidata**. Un software che
li tratta come certi produce numeri che sembrano definitivi e non lo sono.

1. **Come opera la franchigia contributiva di 5.000 euro con piu committenti.**
   La lettura prevalente (INPS circ. 88/2023) e che la soglia sia **del
   lavoratore** e si verifichi sommando i compensi di *tutti* i committenti,
   per cassa. Ma il singolo committente conosce solo cio che eroga:
   l'operativita dipende interamente dall'autocertificazione, e la dottrina
   professionale descrive il punto come tuttora **non chiaro**. Conseguenza di
   prodotto: il calcolo di EasyGame e sempre e solo *quello coerente con le
   dichiarazioni ricevute a quella data*, e la schermata deve dirlo.
2. **La deducibilita dei contributi a carico del lavoratore dalla base
   imponibile dell'eccedenza fiscale.** Per i redditi assimilati a lavoro
   dipendente i contributi obbligatori sono deducibili (art. 51 c. 2 lett. a
   TUIR), ma l'incastro con una franchigia di 15.000 che *non* e una deduzione
   ordinaria non e banale. Negli esempi del [cap. 7](#7--contributi-con-esempi-numerici-2026)
   il risultato e mostrato **in entrambe le ipotesi**, perche cambia il netto.
3. **La qualificazione reddituale della co.co.co. sportiva dilettantistica** —
   assimilata a lavoro dipendente (art. 50 c. 1 lett. c-bis TUIR) oppure lavoro
   autonomo (art. 53) — e quindi **quale ritenuta** si applica sull'eccedenza:
   per scaglioni con detrazioni (art. 23 DPR 600/73) oppure 20% a titolo
   d'acconto (art. 25 DPR 600/73). Le fonti consultate non sono del tutto
   allineate. **E la singola incertezza piu costosa del modulo**, perche cambia
   il netto erogato. Vedi [cap. 6](#6--fiscalita).

### 2.5 Validita temporale

| Regola | Valore | Vale fino a |
|--------|--------|-------------|
| Franchigia fiscale | 15.000 EUR / anno solare | a regime, salvo modifica legislativa |
| Franchigia contributiva | 5.000 EUR / anno solare | a regime, salvo modifica legislativa |
| **Riduzione al 50% della base imponibile contributiva** | 50% | **31 dicembre 2027** |
| Aliquote Gestione separata | annuali | esercizio 2026 (circolare di febbraio) |
| Massimale Gestione separata 2026 | 122.295 EUR | 2026 |
| Minimale per accredito integrale 2026 | 18.808 EUR | 2026 |

La riga in grassetto e la piu importante per l'architettura: **il 1 gennaio
2028, a parita di compenso, la contribuzione raddoppia**. Un motore non
versionato per anno quel giorno produce numeri sbagliati in silenzio.
---

## 3 — Soggetti

### 3.1 Chi e «lavoratore sportivo»

L'art. 25 D.Lgs. 36/2021 definisce lavoratore sportivo chi esercita
**verso un corrispettivo** una delle attivita sportive a favore di un ente
sportivo dilettantistico o professionistico, a prescindere dal settore
professionistico o dilettantistico e dalla forma (subordinata, autonoma,
co.co.co.). Rientrano espressamente **atleta, allenatore, istruttore,
direttore tecnico, direttore sportivo, preparatore atletico, direttore di
gara**, oltre a ogni altro tesserato che svolga mansioni **necessarie allo
svolgimento dell'attivita sportiva** individuate dai regolamenti federali.

**Non** e lavoratore sportivo chi svolge mansioni **amministrativo-gestionali**:
per quelle c'e l'art. 37, che pero estende **le stesse agevolazioni fiscali e
contributive**. Ed e una distinzione che EasyGame deve modellare, perche
cambia l'obbligo assicurativo ([cap. 8](#8--adempimenti)).

### 3.2 Tabella dei soggetti

Legenda regimi: **CCC** = co.co.co. sportiva; **AUT** = lavoro autonomo
sportivo (anche con P.IVA); **SUB** = lavoro subordinato; **VOL** = volontario
ex art. 29; **AG** = collaborazione amministrativo-gestionale ex art. 37;
**PRO** = professionista fuori dal lavoro sportivo (es. commercialista,
fisioterapista libero professionista).

| Soggetto | Lavoratore sportivo? | Regimi possibili | Documenti necessari | Adempimenti tipici |
|----------|----------------------|------------------|---------------------|--------------------|
| **Atleta** (dilettantismo) | Si, art. 25 | CCC (prevalente), AUT, SUB | Contratto scritto, documento d'identita, CF, autocertificazione compensi, IBAN, tesseramento | Comunicazione RASD, LUL, Uniemens, F24, CU |
| **Allenatore / istruttore** | Si, art. 25 | CCC (prevalente), AUT/P.IVA, SUB | Come sopra + qualifica/abilitazione federale, eventuale certificato antipedofilia dove richiesto | Come sopra |
| **Preparatore atletico** | Si, art. 25 | CCC, AUT/P.IVA | Come sopra + titolo | Come sopra |
| **Direttore tecnico / direttore sportivo** | Si, art. 25 | CCC, AUT, SUB | Come sopra + eventuale abilitazione (DS iscritto ad albo federale in alcune discipline) | Come sopra |
| **Direttore di gara / arbitro, giudice** | Si, art. 25, ma **il rapporto e con la federazione o l'organo tecnico**, non con il club | CCC, indennita federali | Nomina, non contratto del club | **Fuori perimetro EasyGame V1**: il club non e committente |
| **Staff sportivo** (medico sociale, fisioterapista, match analyst, team manager) | **Dipende dalla mansione e dai regolamenti federali** | CCC se mansione sportiva necessaria; altrimenti AUT/PRO o AG | Contratto o incarico, titolo abilitante ove previsto, P.IVA se professionista | Se sportivo: come sopra. Se PRO: solo fattura e ritenuta |
| **Collaboratore amministrativo-gestionale** (segreteria, tesoreria) | **No**, ma art. 37 gli estende le agevolazioni | AG (co.co.co. ex art. 409 n. 3 c.p.c.) | Contratto scritto con mansioni, durata, compenso, coordinamento | Comunicazione **UNILAV ordinaria** (non RASD), **INAIL dovuto**, Uniemens, F24, CU |
| **Professionista con P.IVA** | Solo se la prestazione e sportiva; altrimenti no | AUT/P.IVA, PRO | Fattura, dati P.IVA, regime dichiarato, eventuale cassa previdenziale | Nessun adempimento di lavoro; solo registrazione della fattura e ritenuta ove dovuta |
| **Lavoratore subordinato sportivo** | Si, art. 25 e 26 s. | SUB | Contratto, CCNL applicato, visita medica, INAIL | **Fuori V1**: paghe |
| **Volontario sportivo** | **No**, art. 29: la prestazione non e retribuita | VOL | Delibera dell'organo amministrativo, autodichiarazione altri rimborsi, giustificativi | Nessuna contribuzione; **assicurazione infortuni e RC obbligatoria** |
| **Dirigente / consigliere** | No (funzione associativa) | VOL o AG se davvero collabora | Verbale di nomina | Rimborsi come volontario |

### 3.3 La conseguenza di prodotto

I soggetti **non** hanno lo stesso motore. Almeno **quattro motori distinti**:

1. **Motore sportivo dilettantistico** (CCC, AUT senza P.IVA, AG): franchigia
   5.000 contributiva + 15.000 fiscale, riduzione 50%, Gestione separata.
2. **Motore P.IVA**: nessuna franchigia sportiva applicata dal club sulle
   somme fatturate come professionista ordinario; documento in entrata =
   fattura; il club e al piu sostituto per la ritenuta d'acconto.
3. **Motore volontario**: non e compenso, e rimborso; tetto mensile e delibera.
4. **Motore subordinato**: fuori V1, si registra il costo e basta.

Il campo che sceglie il motore **non e il ruolo sportivo**: e la coppia
`(tipo rapporto, profilo fiscale della persona)`. Modellarlo sul ruolo — «e un
allenatore quindi co.co.co.» — e l'errore piu facile e piu costoso.

---

## 4 — Tipologie di rapporto

| Tipologia | Base normativa | Chi la usa | Cosa la caratterizza | Trattamento |
|-----------|----------------|-----------|----------------------|-------------|
| **Co.co.co. sportiva** | art. 28 D.Lgs. 36/2021 | La maggioranza assoluta dei rapporti in ASD/SSD | **Presunzione di autonomia** se la prestazione non supera **24 ore settimanali** (escluso il tempo di partecipazione alle manifestazioni sportive) ed e coordinata sul piano tecnico-sportivo secondo i regolamenti federali. Presunzione **relativa**: oltre le 24 ore il contratto resta valido, ma l'onere della prova dell'autonomia passa al committente | Franchigia 5.000 + 15.000; Gestione separata; ripartizione 1/3–2/3; **no INAIL** (copertura sportiva ex art. 51 L. 289/2002) |
| **Lavoro autonomo sportivo** (senza P.IVA) | art. 25 e 28; TUIR art. 53 | Prestazioni episodiche ma non occasionali in senso tecnico | Assenza di coordinamento continuativo | Stesse franchigie; contribuzione a carico del lavoratore con rivalsa possibile |
| **Lavoro autonomo con P.IVA** | TUIR art. 53; regime forfettario L. 190/2014 | Preparatori, professionisti strutturati | Emette **fattura** | I 15.000 restano rilevanti sui compensi sportivi (il coefficiente forfettario si applica solo all'eccedenza) ma **rilevano per intero** ai fini del tetto forfettario 85.000. Il club **non** applica il motore co.co.co. |
| **Lavoro subordinato sportivo** | art. 26–27 D.Lgs. 36/2021 | Professionismo; raro in ASD dilettantistiche | Cedolino, CCNL, INAIL, TFR | **Fuori V1** |
| **Co.co.co. amministrativo-gestionale** | art. 37 | Segreteria, tesoreria | Non e sportivo, ma gode delle stesse agevolazioni | **INAIL dovuto** (circ. INAIL 46/2023); comunicazione **UNILAV ordinaria** entro le 24 del giorno precedente l'inizio |
| **Prestazione occasionale** ex art. 54-bis D.L. 50/2017 (PrestO/Libretto famiglia) | D.L. 50/2017 | — | **Non pertinente** al lavoro sportivo dilettantistico: la riforma ha costruito un canale proprio, e la co.co.co. sportiva copre il caso episodico con franchigia piu ampia. Il suo uso in ambito sportivo va considerato eccezionale e **non va offerto come opzione predefinita** | Da escludere da EasyGame V1 |
| **Volontariato** | art. 29 | Genitori, dirigenti, accompagnatori | **Non retribuito**. Solo rimborsi | Rimborsi documentati sempre; **forfettari fino a 400 EUR/mese** solo in occasione di manifestazioni ed eventi riconosciuti da FSN/DSA/EPS/CONI/CIP/Sport e Salute, **previa delibera dell'organo amministrativo** e **autodichiarazione** del volontario sugli altri rimborsi forfettari del mese (art. 29 c. 2 come modificato dal D.L. 71/2024) |
| **Rimborsi spese** | art. 29; TUIR art. 51 c. 5 | Tutti | Non sono compenso | Vedi [cap. 14](#14--premi-e-rimborsi) |
| **Premi** | art. 36 c. 6-quater D.Lgs. 36/2021; art. 30 DPR 600/73 | Atleti e tecnici | Somme per un risultato, non per la prestazione | Ritenuta a titolo d'imposta; **no CU**, si 770 quadro SH prospetto G. **Ma** se il «premio» e in realta parte variabile della retribuzione contrattuale, segue il regime del rapporto (AdE cons. giur. 14/2025) |
| **Indennita di trasferta** | TUIR art. 51 c. 5 | Trasferte fuori dal comune | Forfettaria, entro limiti | Vedi [cap. 14](#14--premi-e-rimborsi) |

### 4.1 Cosa deve restare separato dal compenso, e perche

Quattro fattispecie **non vanno mai sommate** al compenso nella stessa riga:

1. **Rimborso spese documentato** — non e reddito, non concorre a nessuna
   soglia, non va in CU come compenso.
2. **Rimborso forfettario al volontario** — ha un tetto mensile proprio
   (400 EUR), una condizione propria (delibera + evento riconosciuto) e una
   autodichiarazione propria. **Chi lo riceve non e un lavoratore.**
3. **Indennita di trasferta** — segue l'art. 51 c. 5 TUIR con soglie
   giornaliere proprie.
4. **Premio** — ha una ritenuta propria e un adempimento dichiarativo proprio.

Se EasyGame le mette nello stesso campo `amount` di un compenso, il
progressivo verso i 5.000 e i 15.000 diventa **falso**, e lo diventa in
eccesso: si dichiarano superamenti che non ci sono. E la ragione per cui il
modello dati del [cap. 16](#16--modello-dati-proposto) le tiene in **tabelle
diverse**, non in un enum di una tabella sola.

---

## 5 — Soglie

### 5.1 Le due soglie non si sommano e non si sostituiscono

| | Franchigia **contributiva** | Franchigia **fiscale** |
|---|---|---|
| Importo | **5.000 EUR** | **15.000 EUR** |
| Base normativa | art. 35 D.Lgs. 36/2021 | art. 36 c. 6 D.Lgs. 36/2021 |
| Periodo | anno solare, **per cassa** | anno solare |
| Riferita a | **il lavoratore**, sommando tutti i committenti | **il lavoratore**, sommando tutti i committenti |
| Cosa succede sopra | contribuzione Gestione separata **solo sull'eccedenza** | IRPEF **solo sull'eccedenza** |
| Chi la verifica | il committente, sulla base dell'autocertificazione | il committente, sulla base dell'autocertificazione |

L'errore piu comune sul campo — e quello che un software deve rendere
impossibile — e **scambiarle o sommarle**. Sono indipendenti: si puo superare
la prima senza avvicinarsi alla seconda, e infatti e il caso piu frequente.

### 5.2 Cosa concorre e cosa no

| Concorre alle soglie | Non concorre |
|----------------------|--------------|
| Compensi di lavoro sportivo (CCC, AUT) erogati da **qualunque** committente | Rimborsi spese **documentati** (vitto, alloggio, viaggio, trasporto) |
| Compensi per collaborazioni amministrativo-gestionali ex art. 37 | Rimborsi forfettari ai **volontari** ex art. 29 (hanno un regime proprio) |
| Compensi per collaborazioni sportive occasionali | Indennita di trasferta entro i limiti dell'art. 51 c. 5 TUIR |
| Compensi in natura e fringe benefit legati al rapporto | **Premi** ex art. 36 c. 6-quater (ritenuta a titolo d'imposta propria) |
| | Redditi di altra natura (dipendente altrove, professionale non sportivo) |

> **Da validare**: la collocazione dei premi rispetto alle soglie e uno dei
> punti in cui la prassi non e uniforme. La consulenza giuridica AdE 14/2025
> distingue i premi «veri» (ritenuta ex art. 30, no CU) dalle somme che *si
> chiamano* premio ma sono retribuzione variabile (che seguono il rapporto).
> **La distinzione la fa il contratto, non l'etichetta.** EasyGame deve
> chiederla esplicitamente all'inserimento, non dedurla.

### 5.3 Anno solare, non stagione

Entrambe le soglie sono **annuali su base solare** e — per la parte
contributiva — **per cassa**: conta quando il denaro e uscito, non quando la
prestazione e stata resa. Una stagione 2026/27 attraversa due anni solari e
quindi **due franchigie intere**. Vedi il [cap. 9.4](#94-il-modello-temporale)
e l'esempio del [cap. 15.1](#151-scenario-a--atleta-senior-stagione-202627).

### 5.4 Autocertificazione e superamento

- Il committente **puo non applicare** la ritenuta finche accerta, sulla base
  dell'**autocertificazione ricevuta**, che il totale non supera i 15.000
  (AdE, cons. giur. 14/2025).
- Stessa logica per la franchigia contributiva: il committente applica la
  franchigia **residua** dichiarata.
- Il **superamento** non azzera nulla e non retroagisce sul gia erogato: si
  applica **solo sull'eccedenza**, dal momento in cui si verifica.
- Se l'autocertificazione e **falsa o tardiva**, la responsabilita e del
  lavoratore, ma il **danno operativo** e del club: contributi non versati,
  ritenute non operate, sanzioni. **EasyGame deve conservare la
  dichiarazione, con data e firma, come prova di cosa il club sapeva quando.**
  E la funzione piu importante di tutto il sottosistema autocertificazioni: non
  calcolare meglio, ma **provare la diligenza**.

---

## 6 — Fiscalita

### 6.1 La regola

I compensi di lavoro sportivo nell'area del dilettantismo **non costituiscono
base imponibile ai fini fiscali fino a 15.000 EUR** nell'anno solare,
considerando **tutti** i committenti. Oltre, **solo l'eccedenza** concorre a
formare il reddito.

### 6.2 Cosa fa il club

| Situazione | Il club |
|-----------|---------|
| Totale dichiarato + erogato **≤ 15.000** | non opera ritenuta; **emette comunque la CU** |
| Totale **> 15.000** | opera la ritenuta **sulla sola eccedenza di sua competenza** (in base ai compensi gia certificati da altri e dichiarati) |
| Autocertificazione **mancante** | non ha la base per non applicare la ritenuta: la scelta prudente e trattenere. **Decisione di prodotto da prendere** ([cap. 19](#19--decisioni-da-prendere), D-6) |

### 6.3 L'incertezza sulla ritenuta

Sull'eccedenza dei 15.000 le fonti consultate indicano due strade diverse a
seconda della qualificazione reddituale:

| Ipotesi | Qualificazione | Ritenuta | Conseguenza |
|---------|----------------|----------|-------------|
| **A** | Reddito **assimilato a lavoro dipendente** (art. 50 c. 1 lett. c-bis TUIR) | art. 23 DPR 600/73: **per scaglioni** (23% sul primo scaglione fino a 28.000) con detrazioni | Il club deve gestire scaglioni e detrazioni: complessita da software paghe |
| **B** | Reddito di **lavoro autonomo** (art. 53 TUIR) | art. 25 DPR 600/73: **20% a titolo d'acconto** | Calcolo banale |

La consulenza giuridica AdE n. 14/2025 ragiona in termini di **artt. 53–54
TUIR** per i lavoratori sportivi autonomi (deduzione dei costi, coefficiente
forfettario sull'eccedenza), il che sostiene l'ipotesi B **per gli autonomi**;
per la **co.co.co.** la lettura prevalente in dottrina resta l'ipotesi A.

**Impatto per EasyGame.** Il modulo **non deve scegliere**: deve rendere la
regola un **dato della configurazione del regime**, con un valore predefinito
prudente e la fonte accanto. Esattamente come `fiscal/engine.ts` non deduce
mai una natura IVA da una sigla.

> **Raccomandazione V1.** Non calcolare la ritenuta IRPEF. Calcolare e mostrare
> **l'imponibile fiscale eccedente** e segnalarlo come «da liquidare con il
> consulente». Il netto viene mostrato come **netto previdenziale**, con
> un'etichetta esplicita che dice che la ritenuta non e compresa. Vedi
> [cap. 19](#19--decisioni-da-prendere), D-5.

### 6.4 Il caso P.IVA e forfettario

- I 15.000 restano rilevanti: il **coefficiente di redditivita** si applica
  solo ai compensi **eccedenti** i 15.000.
- **Ma** i compensi sportivi rilevano **per intero** per la verifica del limite
  di accesso/permanenza al forfettario (85.000 / 100.000 EUR).
- Il club che riceve una fattura da un forfettario **non opera ritenuta**.
- Sul fronte IRAP: per i collaboratori coordinati del dilettantismo, i singoli
  compensi **inferiori a 85.000 EUR non rilevano**; non e una franchigia, e una
  soglia: a 85.000 rilevano per intero (AdE cons. giur. 14/2025).

### 6.5 Cosa EasyGame non deve mai dedurre

- Non dedurre il regime dal ruolo.
- Non dedurre la qualificazione reddituale dal tipo di contratto senza che
  qualcuno l'abbia dichiarata.
- Non dedurre l'aliquota da un'etichetta.
- Non produrre un «netto» senza dire quali componenti contiene.

---

## 7 — Contributi (con esempi numerici 2026)

### 7.1 I parametri 2026

Fonte: circolare INPS n. 8 del 3 febbraio 2026 **[professionale]** — numero
confermato.

| Parametro | Valore 2026 |
|-----------|-------------|
| Franchigia contributiva | 5.000 EUR / anno solare, aggregata su **tutti** i committenti, per cassa |
| Riduzione della base imponibile | **50%**, fino al **31/12/2027** |
| Aliquota lavoratore sportivo **senza** altra copertura previdenziale | **25% IVS + 2,03%** aggiuntive = **27,03%** — causale F24 **CXX** |
| Aliquota lavoratore sportivo **con** altra copertura o **pensionato** | **24%** — causale F24 **C10** |
| Ripartizione dell'onere | **1/3 lavoratore, 2/3 committente** (L. 335/1995 art. 2 c. 30) |
| Massimale annuo | 122.295 EUR |
| Minimale per accredito integrale | 18.808 EUR |
| Versamento | F24, entro il **16 del mese successivo** all'erogazione |
| Denuncia | **Uniemens**, mensile |
| Cassa allargata | compensi pagati entro il **12 gennaio** si imputano all'anno precedente |

Per confronto, un co.co.co. **non** sportivo: 33% + 0,72% (o + 2,03% con
DIS-COLL), **senza** franchigia e **senza** riduzione al 50%. La differenza e
l'intero senso del regime.

### 7.2 La formula

```
imponibile_lordo   = max(0, compenso_progressivo_anno - franchigia_residua)
base_imponibile    = imponibile_lordo * fattore_riduzione        (0,50 fino al 2027)
contributo_totale  = base_imponibile * aliquota                  (27,03% oppure 24%)
quota_lavoratore   = contributo_totale * 1/3
quota_committente  = contributo_totale * 2/3
netto_previdenziale = compenso - quota_lavoratore
costo_club         = compenso + quota_committente
```

Il `compenso_progressivo_anno` include **i compensi esterni dichiarati**. E il
punto in cui il modulo autocertificazioni entra nel motore: non e un allegato,
e un termine dell'equazione.

### 7.3 Esempi obbligatori (2026, co.co.co. sportiva, nessuna altra copertura)

Tutti gli importi in euro. Arrotondamenti a due decimali.

#### A — compensi totali annui 4.000

| Voce | Valore |
|------|--------|
| Lordo | 4.000,00 |
| Imponibile previdenziale (4.000 − 5.000 → 0) | 0,00 |
| Contributo totale | 0,00 |
| Quota lavoratore | 0,00 |
| Quota club | 0,00 |
| Imponibile fiscale (4.000 − 15.000 → 0) | 0,00 |
| **Netto lavoratore** | **4.000,00** |
| **Costo club** | **4.000,00** |

#### B — 7.000

| Voce | Valore |
|------|--------|
| Lordo | 7.000,00 |
| Eccedenza franchigia | 2.000,00 |
| Base imponibile (50%) | 1.000,00 |
| Contributo totale (27,03%) | 270,30 |
| Quota lavoratore (1/3) | 90,10 |
| Quota club (2/3) | 180,20 |
| Imponibile fiscale | 0,00 |
| **Netto lavoratore** | **6.909,90** |
| **Costo club** | **7.180,20** |

#### C — 12.000

| Voce | Valore |
|------|--------|
| Lordo | 12.000,00 |
| Eccedenza franchigia | 7.000,00 |
| Base imponibile (50%) | 3.500,00 |
| Contributo totale | 946,05 |
| Quota lavoratore | 315,35 |
| Quota club | 630,70 |
| Imponibile fiscale | 0,00 |
| **Netto lavoratore** | **11.684,65** |
| **Costo club** | **12.630,70** |

#### D — 18.000 (**qui si supera anche la soglia fiscale**)

| Voce | Valore |
|------|--------|
| Lordo | 18.000,00 |
| Eccedenza franchigia contributiva | 13.000,00 |
| Base imponibile (50%) | 6.500,00 |
| Contributo totale | 1.756,95 |
| Quota lavoratore | 585,65 |
| Quota club | 1.171,30 |
| **Imponibile fiscale eccedente** | **3.000,00** |

Sulla ritenuta, le due ipotesi del [cap. 6.3](#63-lincertezza-sulla-ritenuta):

| Ipotesi | Base IRPEF | Ritenuta | Netto lavoratore |
|---------|-----------|----------|------------------|
| A1 — assimilato, contributi lavoratore **deducibili**, 23% | 2.414,35 | 555,30 | 16.859,05 |
| A2 — assimilato, contributi **non** dedotti, 23% | 3.000,00 | 690,00 | 16.724,35 |
| B — autonomo, ritenuta d'acconto 20% | 3.000,00 | 600,00 | 16.814,35 |

**Costo club: 19.171,30** in tutte e tre le ipotesi — la ritenuta non e un
costo del club, e denaro del lavoratore che il club versa per suo conto.
**Che il costo club non cambi mentre il netto cambia di 135 euro e esattamente
il motivo per cui la schermata deve mostrare le due grandezze separate e
dichiarare quale ipotesi sta usando.**

#### E — 4.000 da un altro club + 6.000 da EasyGame Club

Ipotesi: i 4.000 esterni sono **gia stati percepiti** prima dell'inizio del
rapporto e sono **dichiarati** in autocertificazione.

| Voce | Valore |
|------|--------|
| Progressivo esterno dichiarato | 4.000,00 |
| Franchigia residua all'inizio del rapporto | 1.000,00 |
| Lordo erogato dal club | 6.000,00 |
| — di cui coperto da franchigia | 1.000,00 |
| — di cui imponibile | 5.000,00 |
| Base imponibile (50%) | 2.500,00 |
| Contributo totale | 675,75 |
| Quota lavoratore | 225,25 |
| Quota club | 450,50 |
| Totale annuo del lavoratore (10.000) → imponibile fiscale | 0,00 |
| **Netto erogato dal club** | **5.774,75** |
| **Costo club** | **6.450,50** |

**Il controfattuale che giustifica il modulo autocertificazioni.** Se il club
non avesse saputo dei 4.000 esterni, avrebbe applicato la franchigia sui propri
primi 5.000: imponibile 1.000, base 500, contributo **135,15**. Contro
**675,75** dovuti. **540,60 euro di contribuzione omessa**, con sanzioni a
carico del club. Il valore dell'autocertificazione non e la precisione del
netto: e questo.

### 7.4 Regola pratica sull'ordine cronologico

La franchigia si consuma **per cassa**, nell'ordine in cui il denaro esce.
Questo significa che **lo stesso compenso annuo produce contributi diversi a
seconda di quando arrivano i compensi degli altri committenti**. EasyGame non
puo conoscere quell'ordine se non attraverso le dichiarazioni, e deve
quindi:

1. calcolare **al momento dell'erogazione**, con lo stato dichiarato a quella
   data;
2. **congelare** il calcolo sulla riga erogata (come gia si fa con la
   commissione di piattaforma: cambiare il listino non riscrive il passato);
3. offrire un **ricalcolo esplicito** quando arriva una dichiarazione nuova,
   che produce una **differenza** visibile e non una riscrittura silenziosa.

Il punto 3 e l'equivalente, in uscita, dello storno: **si corregge
aggiungendo, non sovrascrivendo**.
---

## 8 — Adempimenti

### 8.1 Il calendario del club

| Adempimento | Quando | Chi lo fa | EasyGame V1 |
|-------------|--------|-----------|-------------|
| **Contratto scritto** | prima dell'inizio del rapporto | club | **genera e archivia** |
| **Comunicazione di instaurazione al RASD** | entro il **30 del mese successivo** all'inizio del rapporto (co.co.co. sportiva) | club | **prepara i dati + promemoria**; non trasmette |
| **Comunicazione UNILAV ordinaria** (co.co.co. amministrativo-gestionale ex art. 37) | entro le **24:00 del giorno precedente** l'inizio | club | **promemoria**, con l'avviso che il termine e diverso |
| **Comunicazione di cessazione anticipata / variazione** | secondo le regole del canale usato | club | promemoria |
| **Libro Unico del Lavoro sportivo (LUL)** | gestito telematicamente **tramite il RASD**; per i co.co.co. sportivi l'iscrizione puo avvenire **in un'unica soluzione entro 30 giorni dalla fine dell'anno di riferimento** **[professionale, da validare]** | club | **prepara i dati** |
| **Uniemens** | mensile | club (o consulente) | **prepara i dati**; non trasmette |
| **Versamento contributi con F24** | entro il **16 del mese successivo** all'erogazione | club | **calcola gli importi e le causali**; non compila ne invia |
| **Certificazione Unica** | secondo i termini annuali (DPR 322/1998 art. 4) | club come sostituto d'imposta | **aggrega i dati**; non trasmette |
| **Modello 770** (incl. quadro SH prospetto G per i premi) | annuale | consulente | **fornisce l'estrazione** |
| **Assicurazione infortuni/RC** dei volontari e degli sportivi | continuativa | club | **scadenzario documentale** |
| **INAIL** per subordinati e co.co.co. amministrativo-gestionali | secondo le regole INAIL | consulente | fuori V1 |

### 8.2 La regola che tiene insieme il capitolo

**EasyGame produce l'input dell'adempimento, non l'adempimento.** Per ognuna
delle righe sopra, la funzione di prodotto e la stessa:

1. sapere che l'adempimento **esiste** per quel rapporto;
2. sapere **entro quando**;
3. avere **i dati pronti** in una forma che si possa copiare, esportare o
   consegnare;
4. sapere **se e stato fatto**, perche qualcuno lo ha marcato;
5. **non fingere** di averlo fatto.

Il punto 5 e quello su cui EasyGame ha gia una posizione documentata e
coerente: la console dice a chiare lettere che nessun documento e trasmesso
allo SdI; `external_api` esiste nel modello dei bandi ed e **non
selezionabile** perche un adapter finto sarebbe peggio di nessun adapter.
**Questo modulo eredita quella regola senza sconti.**

---

## 9 — Contratti e rapporto

### 9.1 Il rapporto di lavoro sportivo

L'entita centrale. Un rapporto lega **una persona** a **un club** per **un
periodo**, con **un tipo** e **un piano**.

| Campo | Note |
|-------|------|
| `subject_type` + `subject_id` | atleta / allenatore / staff / socio / esterno. Polimorfico come `Attachment.owner_type` e come `ClubEntityType` in `club-entity-directory.ts` |
| `role` | ruolo sportivo: atleta, allenatore, istruttore, preparatore, direttore tecnico, direttore sportivo, staff, amministrativo-gestionale |
| `engagement_type` | `cococo_sportiva` / `autonomo` / `autonomo_piva` / `subordinato` / `amministrativo_gestionale` / `volontario` |
| `regime_profile` | copertura previdenziale del lavoratore: `nessuna_altra` / `altra_copertura` / `pensionato`; e la scelta dell'aliquota |
| `season_id` | stagione EasyGame di riferimento (per la lettura operativa) |
| `start_date` / `end_date` | il periodo **contrattuale**, che non coincide con la stagione ne con l'anno fiscale |
| `weekly_hours` | dichiarate; serve alla presunzione delle 24 ore ex art. 28 |
| `agreed_amount` | importo pattuito complessivo |
| `amount_kind` | `stagionale` / `annuale` / `mensile` / `a_prestazione` |
| `plan` | riferimento al piano compensi |
| `variable_terms` | bonus e premi previsti, come **testo strutturato**, non come importo automatico |
| `notes` | |
| `contract_attachment_id` | il PDF firmato, in Attachment Core |
| `signature_state` | `non_richiesta` / `in_attesa` / `firmato` |
| `status` | vedi sotto |

### 9.2 Stati

| Stato | Significato | Cosa consente |
|-------|-------------|---------------|
| `bozza` | in preparazione | modifica libera; **nessuna** erogazione |
| `attivo` | in corso | maturazione ed erogazione |
| `sospeso` | interrotto temporaneamente (infortunio, aspettativa) | nessuna maturazione nuova; le erogazioni gia maturate restano dovute |
| `cessato` | chiuso prima del termine | genera l'adempimento «comunicazione di cessazione» |
| `scaduto` | arrivato a `end_date` senza rinnovo | genera l'adempimento «rinnovo o cessazione» |

Uno stato **non e un campo libero**: il passaggio `bozza → attivo` deve
verificare che ci siano contratto, dati anagrafici minimi e — se il regime lo
richiede — IBAN e autocertificazione dell'anno. E lo stesso schema del motore
fiscale: **la proposta dice cosa manca**, non nega e basta.

### 9.3 Il piano compensi

Un rapporto ha **un piano**, il piano genera **scadenze**. EasyGame ha gia
questo schema per le quote degli atleti (`payment_plans` con rate a
percentuale, fisso, saldo): **la struttura si riusa, i numeri no**, perche in
uscita servono grandezze che in entrata non esistono.

Tre forme sufficienti a coprire i casi reali:

| Forma | Esempio | Generazione |
|-------|---------|-------------|
| **Rate uguali** | 12.000 stagionali → 10 rate da 1.200 | l'utente sceglie numero rate e mese di partenza |
| **Mensilita** | 900 EUR/mese, settembre–giugno | l'utente sceglie importo e intervallo |
| **Fisso + variabile** | 5.000 fissi + 500 bonus playoff | la parte variabile nasce **non programmata**: si aggiunge quando l'evento accade |

Ogni scadenza porta:

| Campo | Fonte |
|-------|-------|
| `gross_amount` | il piano |
| `due_date` | il piano |
| `accrual_period` | il mese/periodo cui il compenso si riferisce |
| `status` | **derivato** dalle erogazioni: `programmata`, `maturata`, `parzialmente_erogata`, `erogata`, `scaduta` |
| `paid_amount`, `residual` | derivati dal registro |
| `taxable_social`, `employee_contribution`, `employer_contribution` | calcolati **al momento dell'erogazione**, congelati sulla riga |
| `taxable_fiscal`, `withholding` | idem |
| `net_amount`, `club_cost` | derivati |

**Nessuno di questi campi si imposta a mano.** E la lezione gia appresa da
ADR-0036 e dalla capability «stato dell'iscrizione derivato dagli incassi».

### 9.4 Il modello temporale

Tre periodizzazioni **non allineate**:

| Periodo | Chi lo usa | In EasyGame |
|---------|-----------|-------------|
| **Stagione sportiva** (es. 2026/27, set–giu) | il club, per organizzare | esiste: `clubs.settings.seasons`, una sola attiva |
| **Anno fiscale** (solare) | soglia 15.000, CU, 770 | **non esiste**: va introdotto |
| **Anno contributivo** (solare, per cassa) | franchigia 5.000, Uniemens, F24 | **non esiste**: va introdotto |

La regola di progettazione che ne discende:

> **Il rapporto e il piano appartengono alla stagione. Il calcolo e la
> posizione appartengono all'anno solare. Non si mescolano mai nella stessa
> tabella.**

In pratica:

- `sport_work_engagements.season_id` esiste ed e utile per l'operativita
  (quali contratti ho per la stagione in corso), ma **non e la chiave del
  motore**;
- la **posizione annua** (`sport_work_year_positions`) ha chiave
  `(organization_id, subject, year)` e **non conosce la stagione**;
- un rapporto stagionale genera erogazioni che ricadono in **due** posizioni
  annue;
- il **rollover di stagione** gia esistente (`POST /api/v1/seasons/:id/rollover`)
  puo copiare i rapporti come **bozze** della stagione nuova, mai come attivi:
  un contratto e un atto, non una configurazione.

E il punto in cui questo modulo tocca `SEASON_SCOPED_DATA_TYPES`: i rapporti
sono season-scoped, **le posizioni annue no**. Metterle nello stesso insieme
significherebbe azzerare i progressivi cambiando stagione, cioe a giugno.

### 9.5 Maturazione

Tre stati distinti, come annunciato nel [cap. 1.3](#13-le-cinque-cose-che-questo-modulo-deve-fare-bene):

| Stato | Cosa significa | Quando cambia | Chi lo decide |
|-------|----------------|---------------|---------------|
| **Programmato** | il piano lo prevede | alla creazione del piano | il piano |
| **Maturato** | il periodo e trascorso, il rapporto era attivo, la prestazione e stata resa | al termine del periodo di competenza | il **sistema**, con conferma umana se il rapporto e stato sospeso |
| **Erogato** | il denaro e uscito | alla registrazione dell'erogazione | una persona |

Perche serve lo stato intermedio: senza «maturato», il previsionale del club
e sbagliato (mostra come impegno anche cio che non e ancora dovuto), e la
cessazione a meta stagione non ha una regola per decidere quanto resta dovuto.

**Raccomandazione:** maturazione **per periodo di competenza**, calcolata dal
sistema, **non scrivibile a mano**, ricalcolabile in modo idempotente — la
stessa disciplina del maturato dei contributi, che ha gia funzionato.

**Da non fare in V1:** legare la maturazione alle presenze agli allenamenti.
E tecnicamente possibile (il dominio bandi lo fa gia) ma giuridicamente
delicato: subordinare il compenso alla presenza rilevata da un'app avvicina il
rapporto al lavoro subordinato. **Va deciso con un consulente del lavoro**, non
da noi.

---

## 10 — Pagamenti

### 10.1 Il flusso

```
scadenza maturata
  -> lettura della posizione annua alla data (erogato club + esterni dichiarati)
  -> calcolo franchigia residua (5.000)
  -> imponibile previdenziale, riduzione 50%, aliquota per regime
  -> quote lavoratore / committente
  -> verifica soglia fiscale (15.000) e imponibile eccedente
  -> proposta: lordo, trattenute, netto, costo club, con la MOTIVAZIONE
  -> conferma esplicita di una persona
  -> registrazione dell'erogazione (ledger OUTBOUND, immutabile)
  -> aggiornamento della posizione annua (derivato)
  -> comparsa in Movimenti come USCITA
  -> generazione degli adempimenti collegati (F24 del mese, Uniemens)
```

Il passaggio «proposta con la motivazione → conferma di una persona» e la
firma di `fiscal/engine.ts` e va replicata: il motore **propone e spiega**,
non decide.

### 10.2 Perche non si riusa Payments V2

`payment_transactions` e `installment-ledger.ts` sono costruiti attorno a un
incasso da una famiglia: hanno `athlete_id`, `payment_id`, il concetto di
provider e commissione di piattaforma, il rimborso, lo storno, la
riconciliazione con ricevuta e fattura. Un compenso non ha nessuna di queste
cose e ne ha altre che quelli non hanno (contributi, ritenute, quote
committente, posizione annua).

Forzarlo dentro produrrebbe la stessa confusione che ADR-0037 ha gia evitato
tra contributi e pagamenti, e ADR-0052 tra incasso e documento fiscale.

> **Raccomandazione: ledger OUTBOUND separato** (`sport_work_payouts`), con la
> **stessa disciplina** di quello in entrata:
>
> - niente `DELETE`: si storna, l'originale resta marcato e il movimento
>   opposto lo compensa;
> - stato della scadenza **derivato**, mai impostato;
> - le due scritture (erogazione + aggiornamento posizione) in **una
>   transazione**;
> - il confine di sicurezza e `organization_id`, con «Accesso negato» → 403;
> - i valori di calcolo **congelati** sulla riga, come la commissione.

### 10.3 Il rapporto con Movimenti

`club-financial-summary.ts` gia normalizza fonti eterogenee in
`NormalizedClubMovement` con `direction: "expense"`, e gia legge
`trainer_payments` e i pagamenti procura. **La strada e tracciata**: il ledger
OUTBOUND diventa una nuova sorgente di quella normalizzazione, con
`source: "sport_work"`.

Due regole per non duplicare il denaro:

1. **Un'erogazione produce una sola riga** in Movimenti. La scadenza
   programmata **non** e un movimento: al piu e un **impegno previsionale**
   (`expected_expenses`), che e una struttura gia esistente e distinta.
2. **La quota a carico del club non e un movimento separato** finche non viene
   versata. Il versamento F24 e un'uscita **verso l'INPS**, non verso il
   lavoratore, e va registrato come tale — quando qualcuno lo registra.

Il rischio da evitare, concreto e gia visto in questo repository su altri
domini: **il totale delle uscite che conta due volte lo stesso euro** perche
la stessa somma compare come compenso programmato, come compenso erogato e
come movimento manuale. La difesa e la stessa gia adottata per gli incassi:
una sola tabella scrive, tutto il resto legge.

---

## 11 — Documenti e procure

### 11.1 Documenti da gestire

Tutti su **Attachment Core**, con `owner_type = "sport_work_engagement"` (o
`"sport_work_subject"` per quelli della persona) e la `category` che ne dice il
tipo. Il pattern esiste gia ed e collaudato in `src/lib/trainer-documents.ts`,
che tiene nel record solo il riferimento `attachment:<id>`.

| Documento | Owner | Scade | Note |
|-----------|-------|-------|------|
| Contratto di lavoro sportivo | rapporto | si (`end_date`) | il documento che fa esistere il rapporto |
| Documento d'identita | persona | si | gia gestito su allenatori |
| Codice fiscale / tessera sanitaria | persona | no | |
| **Autocertificazione altri compensi** | persona + **anno** | **si, annuale** | vedi 11.2 |
| Coordinate bancarie / IBAN | persona | no | **dato sensibile**: vedi [cap. 18](#18--rischi) |
| Certificazione P.IVA / regime fiscale dichiarato | persona | no | serve al motore P.IVA |
| Fattura ricevuta (P.IVA) | erogazione | no | documento **in entrata** per il club |
| Ricevuta di compenso / quietanza | erogazione | no | documento che il club produce o riceve |
| Contratto di mandato con agente sportivo | rapporto o club | si | vedi 11.3 |
| Delibera dell'organo amministrativo sui rimborsi forfettari | club + anno | si | **condizione di legittimita** dei rimborsi ai volontari |
| Autodichiarazione del volontario sugli altri rimborsi del mese | persona + **mese** | si | art. 29 c. 2 |
| Copia della comunicazione RASD / UNILAV | rapporto | no | prova dell'adempimento |
| Polizza assicurativa | club | si | |
| CU consegnata | persona + anno | no | |

### 11.2 L'autocertificazione come dato, non come file

E il pezzo che nessun gestionale sportivo fa bene e che qui deve essere fatto
bene. Non e un allegato: e un **record**.

| Campo | Note |
|-------|------|
| `subject_type` + `subject_id` | la persona |
| `year` | **anno solare** |
| `declared_at` | data della dichiarazione |
| `external_gross_total` | compensi sportivi gia percepiti da **altri** committenti nell'anno |
| `committers` | elenco, opzionale ma raccomandato: chi, quanto, quando |
| `has_other_coverage` | altra copertura previdenziale o pensionato → sceglie l'aliquota |
| `signature_state` + `attachment_id` | il PDF firmato |
| `supersedes_id` | una dichiarazione **aggiorna** la precedente, non la sostituisce in archivio |
| `source` | `dichiarata_dal_lavoratore` / `inserita_dalla_segreteria` |

Regole:

- **Un anno, una dichiarazione valida alla volta**, ma **tutte** conservate.
- Una dichiarazione nuova **non riscrive** le erogazioni gia calcolate:
  produce una **differenza** e un avviso.
- La schermata dei compensi deve sempre riportare **la data dell'ultima
  dichiarazione**. Un progressivo aggiornato a otto mesi fa non e un
  progressivo, e un'illusione.
- Distinguere sempre, visivamente e nel modello, **compensi erogati dal club**
  (fatti) da **compensi esterni dichiarati** (affermazioni). Sono la stessa
  moneta e due gradi di certezza diversi.

### 11.3 Procure: quattro cose diverse con lo stesso nome

Nel dominio sportivo «procura» copre significati distinti. La pagina
`/procura` oggi non ne dichiara nessuno.

| Significato | Cos'e | Base normativa | Rilevanza per i compensi |
|-------------|-------|----------------|--------------------------|
| **Agente sportivo (procuratore)** | il professionista iscritto al **Registro nazionale degli agenti sportivi** che, in esecuzione di un **contratto di mandato sportivo**, mette in contatto le parti per la conclusione, risoluzione o rinnovo di un contratto di lavoro sportivo o per il trasferimento di una prestazione | **D.Lgs. 37/2021** | **Alta**: il club puo dovergli un **compenso**, che e un costo del club e non del lavoratore |
| **Mandato sportivo** | il contratto tra agente e assistito (o tra agente e club), **da depositare entro 20 giorni** presso il registro federale competente. Un agente puo assistere **al massimo due** soggetti nella stessa operazione. **Nessun compenso e dovuto dal minore**; puo essere il club a remunerare l'agente | D.Lgs. 37/2021 | **Alta**: e un documento con una scadenza e un adempimento di deposito |
| **Mandato al pagamento / delega di incasso** | l'autorizzazione a versare il compenso su un conto diverso da quello del lavoratore | codice civile | **Media**: e un rischio antifrode, non una funzione |
| **Rappresentanza legale / delega interna** | chi firma per la societa | statuto | **Bassa**: gia coperta da `representative_*` sul club |

**Conseguenza per il prodotto.** Non esiste «un campo procura». Esistono:

- **un'anagrafica di agente sportivo** (persona o societa, numero di
  iscrizione al registro, contatti) — che e cio che `clubs.procure` prova
  goffamente a essere;
- **un mandato** con parti, oggetto, durata, deposito, documento;
- eventuali **compensi all'agente**, che sono **costi del club** e vanno nel
  ledger OUTBOUND con una causale propria — **mai** confusi con il compenso
  dell'atleta;
- una **delega di pagamento** come attributo eccezionale dell'erogazione, con
  audit dedicato.

> **Decisione da prendere** ([cap. 19](#19--decisioni-da-prendere), D-8): la
> pagina `/procura` esistente va **assorbita e disambiguata**, non affiancata.
> Affiancarla significa avere due anagrafiche di agenzia e due liste di
> pagamenti, che e precisamente l'errore n. 1 dell'elenco «errori tipici» del
> `CLAUDE.md`.

---

## 12 — RASD

### 12.1 Cos'e

Il **Registro nazionale delle attivita sportive dilettantistiche**, istituito
presso il Dipartimento per lo Sport della Presidenza del Consiglio e gestito da
**Sport e Salute S.p.A.** (D.Lgs. 39/2021 e regolamento attuativo). Certifica
la natura dilettantistica dell'ente ed e il canale attraverso cui passano gli
adempimenti comunicazionali del lavoro sportivo.

### 12.2 Cosa ci passa

| Comunicazione | Termine | Canale | Note |
|---------------|---------|--------|------|
| **Instaurazione** di un rapporto di co.co.co. sportiva | entro il **30 del mese successivo** all'inizio | RASD **oppure** **UNILAV-Sport** | le comunicazioni fatte tramite RASD valgono come comunicazione di instaurazione |
| **Cessazione anticipata** | secondo le regole del canale | RASD o UNILAV-Sport | |
| **Variazione** | secondo le regole del canale | RASD o UNILAV-Sport | |
| **Libro Unico del Lavoro sportivo** | gestibile telematicamente tramite RASD; per i co.co.co. sportivi possibile l'iscrizione **in un'unica soluzione entro 30 giorni dalla fine dell'anno** **[professionale, da validare]** | RASD | la versione cartacea non serve se si usa il sistema digitale |
| **Uniemens / F24** dei collaboratori sportivi | mensile / entro il 16 | canali INPS; il RASD offre funzioni di supporto alla generazione dell'F24 | **[professionale, da validare]** |
| Co.co.co. **amministrativo-gestionale** ex art. 37 | **entro le 24:00 del giorno precedente** l'inizio | **UNILAV ordinario**, non RASD | termine e canale **diversi**: e un errore frequente |

**Sanzione** per omessa comunicazione: sanzione amministrativa **da 100 a 500
euro** per lavoratore **[professionale]**.

### 12.3 Cosa EasyGame puo e non puo fare

**Non risulta esistere una API pubblica** che consenta a un software terzo di
trasmettere comunicazioni al RASD per conto di un ente. Il registro e un
portale con accesso dell'ente.

Quindi:

| Puo | Non puo |
|-----|---------|
| sapere che la comunicazione **e dovuta**, per quel rapporto, entro quella data | trasmettere |
| calcolare la **scadenza** e metterla in agenda | dichiarare l'adempimento assolto da solo |
| **preparare i dati** nel formato che serve (generalita, ente, data inizio, tipologia, compenso previsto) e renderli esportabili o copiabili | garantire che il portale li accetti |
| registrare che **una persona** ha fatto la comunicazione, quando, e allegare la ricevuta | |
| distinguere il rapporto sportivo (RASD, mese successivo) da quello amministrativo-gestionale (UNILAV, giorno prima) e **non far sbagliare canale** | |

L'ultima riga e, in termini di valore per il club, la piu importante di tutto
il capitolo: **il valore non e trasmettere, e non sbagliare canale e non
sforare il termine.**

> Se un domani una API ufficiale esistesse, il modello va gia predisposto con
> `transmission_channel` e `transmission_state` — ma il valore `api` deve
> nascere **non selezionabile**, come `external_api` sui bandi.

---

## 13 — CU e F24

### 13.1 Certificazione Unica

L'ente sportivo che eroga compensi assume a tutti gli effetti la qualifica di
**sostituto d'imposta**. La CU e dovuta **anche in assenza di ritenute
operate**: il reddito, pur non tassato entro i 15.000, e fiscalmente rilevante
a fini informativi. La CU 2026 recepisce l'impianto della riforma e richiede
la corretta classificazione delle somme.

**Cosa EasyGame puo aggregare per la CU**, per persona e per anno solare:

| Voce | Fonte in EasyGame |
|------|-------------------|
| Compensi di lavoro sportivo erogati | ledger OUTBOUND, somma per anno |
| — di cui entro la franchigia dei 15.000 | motore fiscale |
| — di cui eccedenti | motore fiscale |
| Ritenute operate | erogazioni, se si sceglie di calcolarle |
| Contributi previdenziali a carico del lavoratore | erogazioni |
| Contributi a carico del committente | erogazioni |
| Rimborsi spese documentati (voce separata, non compenso) | sottosistema rimborsi |
| Premi ex art. 36 c. 6-quater | **non vanno in CU**: vanno nel **770 quadro SH prospetto G**, con la ritenuta nel **quadro ST** (AdE cons. giur. 14/2025) |

**Stato dell'adempimento** da tracciare: `da_preparare` → `dati_pronti` →
`consegnata_al_consulente` → `trasmessa` (marcata da una persona) →
`consegnata_al_lavoratore` (con l'archiviazione del PDF in Attachment Core).

**Cosa EasyGame non fa in V1**: generare il file telematico della CU e
trasmetterlo. Esattamente come per FatturaPA, dove il tracciato esiste ma non
e mai stato accettato dallo SdI e la console lo dice.

### 13.2 F24

| Domanda | Risposta |
|---------|----------|
| **Quando serve** | quando, in un mese, sono stati erogati compensi che superano la franchigia dei 5.000 e generano contribuzione |
| **Chi versa** | il **committente** (il club), per l'intero, trattenendo al lavoratore la sua quota di 1/3 |
| **Entro quando** | il **16 del mese successivo** all'erogazione |
| **Cosa contiene** | i contributi Gestione separata dovuti sui compensi erogati nel mese |
| **Causali** | **CXX** per l'aliquota complessiva del 27,03%; **C10** per il 24% **[professionale — da riverificare sulla circolare INPS vigente prima di scriverle in un enum]** |
| **Cosa puo fare EasyGame** | calcolare **importo, causale, periodo di riferimento e matricola** per ogni mese, e presentarli in una tabella copiabile/esportabile; ricordare la scadenza |
| **Cosa non deve fare** | generare il file F24 telematico, firmarlo, inviarlo, o dichiararlo pagato senza che qualcuno lo marchi |

**Il limite del software, detto esplicitamente.** Un F24 sbagliato costa
sanzioni e interessi. EasyGame non ha, e non deve avere, la delega a
determinare in via definitiva quanto un ente deve all'INPS. **La sua tabella e
un promemoria di riconciliazione per il consulente, non una liquidazione.**
Questa frase va scritta nell'interfaccia, non solo qui.

---

## 14 — Premi e rimborsi

### 14.1 Le sei fattispecie, tenute separate

| Fattispecie | Cos'e | Rilevanza fiscale | Rilevanza contributiva | Documentazione | Come si registra in EasyGame |
|-------------|-------|-------------------|------------------------|----------------|------------------------------|
| **Compenso** | corrispettivo della prestazione sportiva | concorre alla soglia 15.000 | concorre alla soglia 5.000 | contratto + erogazione | `sport_work_payouts`, tipo `compenso` |
| **Premio** | somma per un **risultato** (art. 36 c. 6-quater) | ritenuta propria ex art. 30 DPR 600/73, **a titolo d'imposta**; **no CU**, si 770 SH/G | **da validare**: non risulta concorrere alla base contributiva del rapporto | delibera/regolamento premi + erogazione | `sport_work_payouts`, tipo `premio`, **escluso dal progressivo delle soglie** |
| **Premio «finto»** | somma chiamata premio ma **parte variabile della retribuzione** contrattuale | segue il **regime del rapporto** (AdE cons. giur. 14/2025) | come il compenso | contratto che lo prevede | `sport_work_payouts`, tipo `compenso_variabile` |
| **Rimborso spese documentato** | vitto, alloggio, viaggio, trasporto effettivamente sostenuti e giustificati | **non concorre** | **non concorre** | giustificativi; dal 1/1/2025 **pagamento tracciabile** richiesto per la non imponibilita/deducibilita **[professionale, verifica]** | `sport_work_expense_claims`, con righe e allegati |
| **Indennita di trasferta forfettaria** | somma forfettaria per missioni **fuori dal territorio comunale** | non concorre entro i limiti dell'art. 51 c. 5 TUIR (**46,48 EUR/giorno** Italia, **77,47 EUR/giorno** estero, al netto di viaggio e trasporto) | idem | dichiarazione di trasferta | `sport_work_expense_claims`, tipo `indennita_trasferta` |
| **Rimborso chilometrico** | uso del mezzo proprio | non concorre se calcolato con le **tabelle ACI** e documentato | idem | percorso, targa, tabella ACI applicata | `sport_work_expense_claims`, tipo `chilometrico`, con `km` e `tariffa` |
| **Rimborso forfettario al volontario** | art. 29 c. 2, come modificato dal D.L. 71/2024: fino a **400 EUR/mese**, **anche nel comune di residenza** | non e reddito **se** ricorrono le condizioni | non concorre | **delibera preventiva dell'organo amministrativo** + attivita in occasione di manifestazioni riconosciute da FSN/DSA/EPS/CONI/CIP/Sport e Salute + **autodichiarazione** del volontario sugli altri rimborsi forfettari del mese | sottosistema **volontari**, separato dai rapporti di lavoro |

### 14.2 Il sottosistema rimborsi

Collegabile al rapporto ma **separato dal compenso**:

- una **nota spese** ha una persona, un periodo, uno stato
  (`bozza`/`presentata`/`approvata`/`liquidata`/`respinta`), righe tipizzate e
  allegati;
- la liquidazione produce **un'erogazione nel ledger OUTBOUND** con
  `kind = "rimborso"`, che **non entra** nel progressivo delle soglie;
- il tetto dei 400 EUR/mese del volontario e un **controllo mensile per
  persona**, e richiede l'autodichiarazione sugli altri enti — cioe **la
  stessa struttura dell'autocertificazione dei compensi, su base mensile**;
- la delibera dell'organo amministrativo e un documento **del club e
  dell'anno**, non della persona: senza di essa i rimborsi forfettari non sono
  legittimi, e il sistema deve dirlo **prima** della liquidazione, non dopo.

### 14.3 La trappola da evitare

Un rimborso spese **forfettario e ricorrente**, di importo fisso, erogato a chi
svolge una prestazione sportiva continuativa, non e un rimborso: e un compenso
mascherato. Nessun software puo o deve stabilirlo, ma un software puo **rendere
visibile il pattern** — «a questa persona hai erogato 12 rimborsi forfettari
identici in 12 mesi» — invece di nasconderlo. E una funzione di
**segnalazione**, non di blocco.
---

## 15 — UX

### 15.1 Scenario A — atleta senior, stagione 2026/27

**Dati.** Co.co.co. sportiva. Compenso pattuito **12.000 EUR stagionali**, in
**10 rate da 1.200**, da settembre 2026 a giugno 2027. Nessuna altra copertura
previdenziale (aliquota 27,03%). **Compensi esterni dichiarati per il 2026:
2.000 EUR**, percepiti prima di settembre. Nessun compenso esterno dichiarato
per il 2027.

**Anno fiscale/contributivo 2026** — franchigia 5.000, gia erosa per 2.000.

| Rata | Lordo | Progressivo anno | In franchigia | Imponibile | Base 50% | Contributo | Lavoratore | Club | Netto | Costo club |
|------|-------|------------------|---------------|-----------|----------|-----------|-----------|------|-------|-----------|
| — | — | 2.000,00 (esterni) | 2.000,00 | — | — | — | — | — | — | — |
| **Set 2026** | 1.200,00 | 3.200,00 | 1.200,00 | 0,00 | 0,00 | 0,00 | 0,00 | 0,00 | 1.200,00 | 1.200,00 |
| **Ott 2026** | 1.200,00 | 4.400,00 | 1.200,00 | 0,00 | 0,00 | 0,00 | 0,00 | 0,00 | 1.200,00 | 1.200,00 |
| **Nov 2026** | 1.200,00 | 5.600,00 | **600,00** | **600,00** | 300,00 | 81,09 | 27,03 | 54,06 | 1.172,97 | 1.254,06 |
| **Dic 2026** | 1.200,00 | 6.800,00 | 0,00 | 1.200,00 | 600,00 | 162,18 | 54,06 | 108,12 | 1.145,94 | 1.308,12 |
| **Totale 2026** | **4.800,00** | **6.800,00** | | **1.800,00** | **900,00** | **243,27** | **81,09** | **162,18** | **4.718,91** | **4.962,18** |

Soglia fiscale 2026: progressivo 6.800 su 15.000 → **nessuna ritenuta**.

**Anno 2027** — la franchigia **riparte da 5.000**.

| Rata | Lordo | Progressivo anno | In franchigia | Imponibile | Base 50% | Contributo | Lavoratore | Club | Netto | Costo club |
|------|-------|------------------|---------------|-----------|----------|-----------|-----------|------|-------|-----------|
| Gen–Apr 2027 (4 rate) | 4.800,00 | 4.800,00 | 4.800,00 | 0,00 | 0,00 | 0,00 | 0,00 | 0,00 | 4.800,00 | 4.800,00 |
| **Mag 2027** | 1.200,00 | 6.000,00 | **200,00** | **1.000,00** | 500,00 | 135,15 | 45,05 | 90,10 | 1.154,95 | 1.290,10 |
| **Giu 2027** | 1.200,00 | 7.200,00 | 0,00 | 1.200,00 | 600,00 | 162,18 | 54,06 | 108,12 | 1.145,94 | 1.308,12 |
| **Totale 2027** | **7.200,00** | **7.200,00** | | **2.200,00** | **1.100,00** | **297,33** | **99,11** | **198,22** | **7.100,89** | **7.398,22** |

**Totale stagione 2026/27**: lordo 12.000,00 — contributi lavoratore 180,20 —
contributi club 360,40 — **netto 11.819,80** — **costo club 12.360,40**.

**Il numero che spiega perche il modello temporale conta.** Se gli stessi
14.000 euro complessivi (12.000 dal club + 2.000 esterni) fossero caduti tutti
in **un solo anno solare**: imponibile 9.000, base 4.500, contributo
**1.216,35**. Distribuiti su due anni: **540,60**. **Una differenza di 675,75
euro prodotta solo dal calendario.** Un motore che ragiona per stagione invece
che per anno solare sbaglia di questo ordine di grandezza.

### 15.2 Scenario B — allenatore, superamento dei 5.000 in corso d'anno

**Dati.** Co.co.co. sportiva, **8.000 EUR annui** in 8 rate da 1.000.
**Compensi esterni dichiarati: 4.000 EUR**, gia percepiti. Aliquota 27,03%.

| Rata | Lordo | Progressivo anno | In franchigia | Imponibile | Base 50% | Contributo | Lavoratore | Club | Netto | Costo club |
|------|-------|------------------|---------------|-----------|----------|-----------|-----------|------|-------|-----------|
| — | — | 4.000,00 (esterni) | 4.000,00 | — | — | — | — | — | — | — |
| **Rata 1** | 1.000,00 | 5.000,00 | **1.000,00** | 0,00 | 0,00 | 0,00 | 0,00 | 0,00 | 1.000,00 | 1.000,00 |
| **Rata 2** | 1.000,00 | 6.000,00 | 0,00 | 1.000,00 | 500,00 | 135,15 | 45,05 | 90,10 | **954,95** | **1.090,10** |
| Rate 3–8 (6 rate) | 6.000,00 | 12.000,00 | 0,00 | 6.000,00 | 3.000,00 | 810,90 | 270,30 | 540,60 | 5.729,70 | 6.540,60 |
| **Totale anno** | **8.000,00** | **12.000,00** | | **7.000,00** | **3.500,00** | **946,05** | **315,35** | **630,70** | **7.684,65** | **8.630,70** |

**Cosa succede esattamente al superamento** (rata 1 → rata 2):

- il netto scende da **1.000,00** a **954,95**: −45,05, la quota del lavoratore;
- il costo club sale da **1.000,00** a **1.090,10**: +90,10, la quota del club;
- nasce un **F24 da versare entro il 16 del mese successivo**, causale CXX,
  importo 135,15;
- nasce l'obbligo di **denuncia Uniemens** per quel mese;
- il progressivo fiscale (12.000) resta sotto i 15.000: **nessuna ritenuta**;
- la dashboard passa il rapporto da «sotto soglia contributiva» a «in
  contribuzione» e lo dice **prima** che l'utente clicchi Paga.

**Il controfattuale.** Senza la dichiarazione dei 4.000 esterni, il club
avrebbe applicato la franchigia sui propri primi 5.000: imponibile 3.000, base
1.500, contributo **405,45** invece di 946,05. **540,60 euro di contribuzione
omessa.** L'autocertificazione non e burocrazia: e la differenza tra un
adempimento corretto e un'omissione.

### 15.3 Dashboard «Lavoro sportivo»

Una pagina, sei blocchi, nessun numero senza la sua data di riferimento.

| Blocco | KPI | Fonte |
|--------|-----|-------|
| **Denaro del mese** | compensi da erogare nel mese, erogati nel mese, costo club del mese | ledger OUTBOUND + scadenze |
| **Denaro dell'anno** | lordo erogato anno solare, contributi lavoratore, contributi club, **costo club totale** | posizione annua |
| **Scadenze** | prossime erogazioni, **F24 del mese** (importo e causale), Uniemens, comunicazioni RASD in scadenza, CU | agenda adempimenti |
| **Soglie** | quante persone sopra i 5.000, quante in avvicinamento (es. > 80%), quante sopra i 15.000, quante **senza autocertificazione dell'anno** | motore |
| **Contratti** | attivi, in scadenza a 30/60 giorni, scaduti senza rinnovo, in bozza da troppo tempo | rapporti |
| **Documenti mancanti** | rapporti senza contratto firmato, senza IBAN, senza documento d'identita, senza autocertificazione | join documentale |

Regola di presentazione: **ogni cifra che dipende da dichiarazioni esterne
porta accanto la data dell'ultima dichiarazione**. Un club che vede «progressivo
6.800» senza sapere che l'ultima dichiarazione e di febbraio ha un numero
falsamente preciso.

### 15.4 Scheda persona — tab «Lavoro / Compensi»

Da montare sulla scheda atleta, allenatore e staff. **Sei sezioni in ordine
fisso**, sulla falsariga della scheda «Iscrizione» ([ADR-0056](18-decision-log.md#adr-0056--la-scheda-iscrizione-ha-un-riepilogo-solo-e-una-fonte-sola-per-i-numeri)):

1. **Rapporto in corso** — tipo, ruolo, periodo, stato, importo pattuito, ore
   settimanali dichiarate. Un badge se il rapporto e scaduto o in scadenza.
2. **Posizione dell'anno** — un solo riquadro con: erogato dal club, esterno
   dichiarato (con data), **progressivo**, franchigia 5.000 residua, soglia
   15.000 residua, contributi lavoratore e club dell'anno, costo club
   dell'anno.
3. **Piano e scadenze** — tabella delle rate con stato derivato; azione
   principale = **la prossima scadenza maturata**, come gia si fa per la
   prossima rata dell'atleta.
4. **Erogazioni** — il registro: data, lordo, trattenute, netto, metodo,
   documento. Nessun pulsante «elimina»: solo **storna**.
5. **Documenti** — una griglia sola (tipo, file, caricamento, scadenza, stato,
   azioni), esattamente come i documenti dell'allenatore.
6. **Storico** — rapporti chiusi, autocertificazioni precedenti, CU degli anni
   passati.

**Cosa non mettere in questa scheda:** il calcolo interattivo «e se
cambiassi...». Un simulatore ha senso, ma **non** nella scheda della persona,
dove ogni numero deve essere un fatto.

### 15.5 Responsivita

Vincolo di progetto: ogni pagina toccata deve restare usabile a **375, 768 e
1280 px** (ADR-0025). Per questo modulo significa, in concreto:

- la tabella con dieci colonne di calcolo **non esiste** a 375 px: diventa una
  scheda per rata, con lordo e netto in evidenza e il dettaglio a scomparsa —
  lo stesso schema gia usato per le consegne parziali del vestiario;
- la conferma di un'erogazione e un dialogo a schede impilate, non una tabella
  editabile;
- la dashboard e una colonna sola di blocchi, ordinati per urgenza.

### 15.6 Permessi

| Ruolo | Cosa vede |
|-------|-----------|
| **Owner** | tutto, incluse le configurazioni di regime e le aliquote |
| **Club manager** | tutto l'operativo: rapporti, piani, erogazioni, adempimenti, documenti |
| **Staff / segreteria** (amministrazione) | **solo se abilitato**: creazione rapporti, caricamento documenti, preparazione erogazioni. **La conferma dell'erogazione resta a owner/club manager** |
| **Collaboratore** | solo i **propri** compensi |
| **Trainer** | solo i **propri** compensi. **Mai** quelli degli altri |
| **Atleta** | solo i **propri** |
| **Parent** | i compensi del **minore** di cui e tutore, se esistono |

Note di attuazione sul modello esistente:

- i ruoli canonici sono gia sette in `src/lib/access-roles.ts`; **non se ne
  aggiungono**;
- «amministrazione» **non e un ruolo nuovo**: e `staff` piu un permesso, sulla
  falsariga di `trainer-dashboard-permissions.ts`. Aggiungere un ottavo ruolo
  per un modulo e l'errore che il repository ha gia commesso altrove;
- il percorso `/sport-work` (o come si chiamera) va in
  `MANAGEMENT_PATH_PREFIXES`, e le sue risorse in
  `MANAGEMENT_ADMIN_ONLY_RESOURCES` se si sceglie di restringerle a
  owner/manager;
- l'accesso «solo i propri» per trainer e atleta **non e un filtro
  dell'interfaccia**: e un filtro del server, come gia
  `TRAINER_DASHBOARD_FILTERED_RESOURCES`.

### 15.7 Notifiche

Da montare su `Notification` + `POST /api/v1/notifications`, che invia anche
l'email. **Nessun canale nuovo.**

| Evento | Destinatario | Quando |
|--------|--------------|--------|
| Compenso da erogare | amministrazione | N giorni prima della scadenza |
| **Soglia 5.000 in avvicinamento** (es. 80%) | amministrazione | al calcolo |
| **Soglia 5.000 superata** | amministrazione + lavoratore | all'erogazione che la supera |
| **Soglia 15.000 in avvicinamento / superata** | amministrazione | idem |
| Contratto in scadenza | amministrazione | 60 e 30 giorni prima |
| **Autocertificazione mancante o scaduta** | amministrazione + lavoratore | inizio anno e prima di ogni erogazione |
| **Comunicazione RASD/UNILAV dovuta** | amministrazione | alla creazione del rapporto, e al 25 del mese |
| **F24 del mese** | amministrazione | il 10 del mese successivo |
| CU da preparare | amministrazione | secondo il calendario annuale |
| Documento scaduto (identita, polizza, mandato) | amministrazione | 30 giorni prima |

**Risolto per questo modulo il 2026-08-28.** Quando questa analisi e stata
scritta lo scheduler non esisteva. Oggi `vercel.json` registra
`GET /api/v1/sport-work/scheduler` alle 03:30 e `CRON_SECRET` e configurato su
`easygame-staging`: le notifiche a scadenza del lavoro sportivo partono da sole.
**Resta vero per il resto del prodotto**: la generazione automatica degli
allenamenti e i promemoria dei certificati medici non hanno un cron e vanno
ancora invocati a mano.

### 15.8 Privacy e GDPR

Il modulo contiene i dati economici piu sensibili dell'intero prodotto:
retribuzioni individuali, IBAN, posizioni contributive, dichiarazioni su
redditi percepiti altrove.

| Principio | Attuazione |
|-----------|-----------|
| **Minimizzazione** | non chiedere il dettaglio dei committenti esterni se basta il totale; non conservare copia del documento d'identita quando bastano gli estremi |
| **Accesso** | il default e **negato**: un trainer vede i propri compensi, non quelli dei colleghi. Il filtro e server-side |
| **Retention** | i dati fiscali hanno termini di conservazione propri (ordinariamente lunghi); le autocertificazioni superate **non si cancellano**, servono a provare la diligenza. Va definita una politica esplicita, non lasciata implicita |
| **Audit** | ogni lettura di un compenso altrui e ogni modifica di un rapporto vanno tracciate. `audit_logs` gia registra **anche i dinieghi**: qui serve tracciare anche gli **accessi riusciti** a dati economici di terzi |
| **Export / diritto di accesso** | l'interessato deve poter ottenere la propria posizione completa. `person-export.ts` esiste gia e va esteso |
| **Documenti** | i byte stanno in Attachment Core, fuori dal record, gia con `organization_id`. **L'IBAN non va nei log, non va nelle URL, non va nei metadati di audit** |
| **Segreti** | vale la regola gia in `CLAUDE.md`: mai restituire credenziali. Aggiungere IBAN e codici fiscali all'elenco dei campi da non far uscire nelle proiezioni di lista |

---

## 16 — Modello dati proposto

> Proposta, non decisione. Nessuna migrazione, nessuna colonna.

### 16.1 Il vincolo di partenza

**Allenatori e staff non sono righe di tabella.** Stanno in `clubs.trainers` e
`clubs.staff_members`, colonne **JSON** del club. Gli atleti invece sono una
tabella (`athletes`). Un rapporto di lavoro deve poter puntare a entrambi.

Tre strade:

| Strada | Pro | Contro |
|--------|-----|--------|
| **A — riferimento polimorfico** `subject_type` + `subject_id` | nessuna migrazione dell'anagrafica; e il pattern gia usato da `Attachment.owner_type` e da `ClubEntityType` | nessuna integrita referenziale sui JSON: un allenatore cancellato lascia un rapporto orfano |
| **B — estrarre allenatori e staff in tabelle** prima del modulo | modello sano | e un WP a se, grande, rischioso, e **non e questo il task** |
| **C — tabella `sport_work_subjects`** che materializza la persona del rapporto (nome, CF, data e luogo di nascita, residenza, IBAN, regime), con un puntatore **debole** all'anagrafica di origine | integrita dentro il modulo; il modulo funziona anche per persone che non sono ne atleti ne allenatori (un preparatore esterno, un agente) | duplicazione anagrafica da tenere allineata |

> **Raccomandazione: C, con A come collegamento.** Il rapporto punta a un
> `sport_work_subject` (integro, dentro il modulo), che a sua volta dichiara
> `origin_type` + `origin_id` verso l'anagrafica. E l'unica strada che non
> richiede di rifare le anagrafiche per fare i compensi, e che regge il caso —
> reale — del collaboratore che non e censito da nessuna parte.
> La duplicazione va gestita come gia si fa per lo **snapshot** dei documenti
> fiscali: il dato del rapporto e **fotografato al momento**, e cambiare
> l'anagrafica non riscrive un contratto gia firmato.

### 16.2 Le entita

```
sport_work_subjects           la persona, dentro il modulo
  id, organization_id, origin_type, origin_id
  nome, cognome, data/luogo nascita, sesso, codice_fiscale
  residenza, email, telefono
  fiscal_profile: none | piva_ordinaria | piva_forfettaria
  partita_iva, cassa_previdenziale
  social_coverage: nessuna_altra | altra_copertura | pensionato
  iban (cifrato o a accesso ristretto)

sport_work_engagements        il rapporto
  id, organization_id, subject_id, season_id
  role, engagement_type, start_date, end_date, weekly_hours
  agreed_amount, amount_kind, currency
  status: bozza | attivo | sospeso | cessato | scaduto
  contract_attachment_id, signature_state
  notes, created_by, timestamps

sport_work_plan_items         le scadenze programmate
  id, organization_id, engagement_id
  sequence, label, accrual_period_start, accrual_period_end
  gross_amount, due_date
  kind: compenso | compenso_variabile | premio
  accrual_state: programmata | maturata | annullata
  (stato di pagamento e importi NON qui: si derivano)

sport_work_payouts            il ledger OUTBOUND — l'unica scrittura di denaro
  id, organization_id, engagement_id, plan_item_id?
  kind: compenso | compenso_variabile | premio | rimborso | compenso_agente
  paid_at, gross_amount, method, reference, bank_account_id
  rules_version                      (es. "2026")
  taxable_social, social_rate, reduction_factor
  employee_contribution, employer_contribution
  taxable_fiscal, withholding_amount, withholding_basis
  net_amount, club_cost
  reversal_of_id, reversed_at, reversal_reason
  created_by, timestamps

sport_work_external_declarations   le autocertificazioni
  id, organization_id, subject_id, year
  declared_at, external_gross_total, committers (Json)
  has_other_coverage
  attachment_id, signature_state
  supersedes_id, source, created_by

sport_work_year_positions      la posizione annua — DERIVATA, materializzata
  organization_id, subject_id, year
  club_gross, external_declared, progressive
  social_franchise_used, social_taxable, employee_contrib, employer_contrib
  fiscal_franchise_used, fiscal_taxable, withheld
  last_declaration_at, computed_at

sport_work_expense_claims      note spese e rimborsi
  id, organization_id, subject_id, engagement_id?
  period, status: bozza|presentata|approvata|liquidata|respinta
  total_amount, payout_id?
sport_work_expense_lines
  claim_id, kind: documentato|indennita_trasferta|chilometrico|forfettario_volontario
  date, description, amount, km, aci_rate, attachment_id

sport_work_obligations         l'agenda degli adempimenti
  id, organization_id, engagement_id?, subject_id?
  kind: comunicazione_rasd | comunicazione_unilav | cessazione | lul
      | uniemens | f24 | cu | rinnovo_contratto | autocertificazione
      | documento_in_scadenza
  period, due_date
  state: dovuto | in_corso | assolto | non_dovuto
  assolved_by, assolved_at, evidence_attachment_id, notes

sport_agents / sport_agent_mandates    agenti sportivi e mandati
  (assorbono clubs.procure, disambiguandolo)
```

### 16.3 I moduli di codice

Rispettano la ownership dichiarata in `CLAUDE.md` §2.

| Modulo | Ruolo | Regola |
|--------|-------|--------|
| `src/lib/sport-work/rules/2026.ts`, `2027.ts`, … | **regole versionate per anno**: soglie, aliquote, riduzioni, causali, **con la fonte normativa nel commento** | dati, non logica |
| `src/lib/sport-work/rules/index.ts` | risoluzione `rulesFor(year)` | fallisce **esplicitamente** su un anno non configurato: mai un fallback silenzioso all'anno precedente |
| `src/lib/sport-work/engine.ts` | **modulo puro**: dato (regole, posizione annua, erogazione proposta) → (imponibili, contributi, netto, costo club, **motivazione**) | nessun DOM, nessuna rete, nessun Prisma. Testabile riga per riga |
| `src/lib/sport-work/position.ts` | calcolo della posizione annua da erogazioni + dichiarazioni | puro |
| `src/lib/sport-work/obligations.ts` | derivazione delle scadenze di adempimento da rapporti ed erogazioni | puro |
| `src/lib/server/sport-work.ts` | **unico** punto di scrittura di rapporti, piani ed erogazioni | scope, transazioni, audit, «Accesso negato» |
| `src/app/api/v1/sport-work/**` | endpoint | registrati in `docs/api-registry.md` e `src/lib/api/registry.ts` |

`rules_version` scritto sulla riga di erogazione e cio che rende il passato
**rileggibile**: se nel 2028 la riduzione al 50% decade, le erogazioni del 2026
continuano a spiegare se stesse. E la stessa tecnica gia usata per congelare la
commissione di piattaforma sull'incasso.

### 16.4 Cosa **non** creare

- Un secondo sistema di allegati.
- Un secondo canale di notifica.
- Un secondo client Prisma.
- Un ottavo ruolo di accesso.
- Un secondo motore fiscale accanto a `src/lib/fiscal/engine.ts`: quello decide
  **quale documento** proporre; questo decide **quanto**. Sono due domini, ma
  **devono conoscersi** quando un compenso a un professionista con P.IVA
  produce una fattura **in entrata** per il club.
- Una colonna JSON nuova su `clubs`. Il repository ha gia trentadue colonne
  JSON sul club e sa che e un debito ([16](16-technical-debt.md)).

---

## 17 — Integrazioni con EasyGame e gap analysis

### 17.1 Gap analysis per capability

Legenda: **ESISTE** — riusabile cosi com'e; **ESTENDERE** — c'e la base, serve
lavoro; **CREARE** — non c'e; **POST-V1** — non in V1.

| Capability | Stato | Nota |
|-----------|-------|------|
| Multi-tenant, scope, autorizzazione | **ESISTE** | `requireAuthenticatedUser`, `resolveOrganizationScopeForUser`, `ensureOrganizationAccess` |
| Ruoli e permessi | **ESTENDERE** | nessun ruolo nuovo; serve un permesso «amministrazione compensi» sul modello di `trainer-dashboard-permissions.ts` |
| Audit log | **ESTENDERE** | nuove azioni: rapporto creato/modificato/cessato, erogazione registrata/stornata, autocertificazione ricevuta, adempimento marcato assolto |
| Attachment Core | **ESISTE** | nuovi `owner_type` e `category`. Nessuna logica documentale nuova |
| Notifiche + email | **ESISTE** per il canale, **CREARE** per i trigger | e manca lo **scheduler** (vedi 15.7) |
| Stagioni | **ESISTE** | rapporti season-scoped; posizioni annue **no** |
| Rollover di stagione | **ESTENDERE** | copiare i rapporti come **bozze** |
| Anagrafica persona | **ESTENDERE** | `sport_work_subjects` + snapshot; l'ordine dei campi lo detta gia `person-identity.ts` |
| Anagrafica assistita (comuni, CF) | **ESISTE** | 7.896 comuni, calcolo e verifica CF, client e server |
| Ledger disciplinato | **ESISTE** come **modello da imitare**, **CREARE** come implementazione in uscita | `payment-transactions.ts` e il riferimento, non la sede |
| Movimenti / uscite | **ESTENDERE** | nuova sorgente in `club-financial-summary.ts`, `source: "sport_work"` |
| Budget previsionale | **ESTENDERE** | le scadenze programmate come impegno in `expected_expenses` |
| **Compensi allenatori (`trainer_payments`)** | **DA ASSORBIRE** | migrazione dei dati esistenti, e la capability in [11](11-capabilities.md) va **declassata** da COMPLETE: e un promemoria, non un registro |
| **Procure (`clubs.procure`, `/procura`)** | **DA DISAMBIGUARE** | vedi [cap. 11.3](#113-procure-quattro-cose-diverse-con-lo-stesso-nome) |
| Motore fiscale documentale | **ESISTE** | va **interrogato**, non duplicato, per il caso P.IVA |
| Ricevute e fatture, serie e numerazione | **ESISTE** | riusabile per le quietanze di compenso |
| FatturaPA / SdI | **ESISTE (tracciato)** / **POST-V1** | il compenso a P.IVA genera una fattura **passiva**: fuori perimetro |
| Entitlements / gating per piano | **ESISTE** | «Lavoro sportivo» diventa una nuova chiave di catalogo |
| Motore delle soglie e contributi | **CREARE** | il cuore del modulo |
| Regole versionate per anno | **CREARE** | precedente da imitare: le regole dei bandi come dati |
| Autocertificazioni | **CREARE** | |
| Posizione annua | **CREARE** | |
| Agenda adempimenti | **CREARE** | |
| Dati per F24 | **CREARE** | solo calcolo e presentazione |
| Dati per CU | **CREARE** | solo aggregazione |
| Generazione file CU / 770 / Uniemens | **POST-V1** | |
| Trasmissione RASD / UNILAV | **POST-V1**, e comunque **non via API** finche non esiste | |
| Paghe subordinati | **POST-V1 / integrazione esterna** | |
| Simulatore «quanto mi costa» | **POST-V1** | utile in vendita, non in V1 |
| Export contabile strutturato | **POST-V1** | i report societari oggi non hanno export strutturato |

### 17.2 Il vincolo Cedi Platform

`CLAUDE.md` §10: non introdurre accoppiamento che renda difficile spostare la
logica di dominio fuori da Next.js. Questo modulo lo **rispetta per
costruzione** se:

- il motore e un **modulo puro** senza Prisma e senza React;
- le regole dell'anno sono **dati serializzabili**;
- la scrittura passa dalle **API**, non da Server Actions;
- nessun servizio proprietario dell'hosting.

E anzi il candidato migliore del repository a essere un giorno un servizio a
se: un motore di calcolo con input e output dichiarati.

---

## 18 — Rischi

| # | Categoria | Rischio | Impatto | Mitigazione |
|---|-----------|---------|---------|-------------|
| R1 | **LEGAL** | EasyGame viene percepito come consulente: il club segue il numero e sbaglia adempimento | alto | disclaimer **funzionale**, non legale: ogni cifra dichiara le sue ipotesi e la data delle dichiarazioni su cui si basa. Nessuna schermata dice «devi versare X» |
| R2 | **LEGAL** | Le regole cambiano (riduzione 50% che decade il 31/12/2027) e il software continua a calcolare come prima | alto | `rules_version` obbligatoria; `rulesFor(anno)` **fallisce** su un anno non configurato |
| R3 | **FISCAL** | Ritenuta calcolata secondo l'ipotesi sbagliata ([cap. 6.3](#63-lincertezza-sulla-ritenuta)) | alto | **in V1 non calcolare la ritenuta**: mostrare l'imponibile eccedente e fermarsi |
| R4 | **FISCAL** | Autocertificazione assente o vecchia → franchigia applicata due volte → contribuzione omessa | alto | bloccare la conferma dell'erogazione senza dichiarazione dell'anno, o esigere una motivazione registrata |
| R5 | **FISCAL** | Rimborsi e premi conteggiati nelle soglie, o compensi mascherati da rimborsi | medio-alto | tabelle separate; segnalazione dei pattern ricorrenti |
| R6 | **PAYROLL** | Si scivola nelle paghe: qualcuno chiede il cedolino, poi il TFR, poi il CCNL | alto | perimetro dichiarato nella KB e nell'interfaccia; il subordinato in V1 e **solo un costo registrato** |
| R7 | **PAYROLL** | Maturazione legata alle presenze → indizio di subordinazione | medio | non farlo in V1; se richiesto, validarlo con un consulente del lavoro |
| R8 | **SECURITY** | IBAN e retribuzioni individuali esposti a ruoli sbagliati | alto | filtro **server-side**, mai dell'interfaccia; IBAN fuori da liste, log, URL e metadati di audit |
| R9 | **SECURITY** | Mandato al pagamento su conto di terzi usato per frode | medio | eccezione esplicita, con documento e audit dedicato |
| R10 | **PRIVACY** | Dati economici accessibili a chi non deve; nessuna politica di retention | alto | default negato; audit anche degli accessi riusciti; retention scritta |
| R11 | **PRODUCT** | Doppio conteggio delle uscite in Movimenti | medio-alto | una sola tabella scrive; la scadenza programmata **non** e un movimento |
| R12 | **PRODUCT** | Tre sistemi paralleli per la stessa cosa (`trainer_payments`, `/procura`, il modulo nuovo) | alto | assorbimento pianificato **prima** del rilascio, non dopo |
| R13 | **PRODUCT** | Modulo grande che non arriva mai in produzione | alto | tagliare V1 a cio che serve a un club vero: rapporto, piano, erogazione, soglie, agenda |
| R14 | **TECHNICAL** | Nessuna integrita referenziale verso allenatori e staff (JSON) | medio | `sport_work_subjects` con snapshot |
| R15 | **TECHNICAL** | Le notifiche a scadenza richiedono uno scheduler che non c'e | medio-alto | o si risolve lo scheduler, o in V1 le scadenze sono **una pagina che si guarda**, non un avviso che arriva. **Dirlo, non prometterlo** |
| R16 | **TECHNICAL** | Ricalcolo retroattivo che riscrive il passato | medio | correggere aggiungendo (storno + nuova riga), mai sovrascrivendo |
| R17 | **PRODUCT** | Il club usa EasyGame **al posto** del consulente | alto | il modulo produce **estrazioni per il consulente**; la CU e l'F24 non sono mai «fatti» dentro EasyGame |
---

## 19 — Decisioni da prendere

Non sono aperte all'infinito: ognuna ha una raccomandazione. Servono a te, non
al codice.

| # | Decisione | Opzioni | Raccomandazione |
|---|-----------|---------|-----------------|
| **D-1** | Ledger in uscita: riusare `payment_transactions` o crearne uno separato | riuso / separato | **Separato**, con la stessa disciplina. Un incasso e un'erogazione non hanno gli stessi campi ne le stesse regole |
| **D-2** | Cosa fare di `trainer_payments` | affiancare / assorbire / lasciare | **Assorbire**, con migrazione dei dati e declassamento della capability in [11](11-capabilities.md) |
| **D-3** | Cosa fare di `/procura` e `clubs.procure` | lasciare / assorbire / rifare | **Assorbire e disambiguare** in agenti + mandati + compensi all'agente |
| **D-4** | Identita della persona nel modulo | polimorfico puro / estrarre le anagrafiche / `sport_work_subjects` con snapshot | **`sport_work_subjects`**, con puntatore debole all'anagrafica di origine |
| **D-5** | Calcolare la **ritenuta IRPEF** in V1 | si / no / solo l'imponibile | **Solo l'imponibile eccedente.** Il netto mostrato e «netto previdenziale», dichiarato come tale |
| **D-6** | Erogazione **senza** autocertificazione dell'anno | bloccare / avvisare / consentire in silenzio | **Bloccare, con sblocco motivato e registrato.** Il silenzio e l'unica opzione inaccettabile |
| **D-7** | Maturazione legata alle **presenze** | si / no | **No in V1** (rischio di subordinazione) |
| **D-8** | Compensi agli **agenti sportivi** in V1 | dentro / fuori | **Dentro, ma come costo del club** con causale propria, mai mescolato al compenso dell'atleta |
| **D-9** | **Volontari e rimborsi forfettari** in V1 | dentro / fuori | **Dentro**, perche e il caso piu diffuso nelle ASD e il piu facile da sbagliare. Ma in un sottosistema **separato dai rapporti di lavoro** |
| **D-10** | **Scheduler** per le notifiche a scadenza | risolverlo ora / rimandarlo | **Risolverlo o dichiarare che le scadenze sono una pagina, non un avviso.** Non prometterle e basta |
| **D-11** | Gating per piano (entitlement) | modulo incluso / a pagamento | Decisione commerciale. Tecnicamente il gating **esiste gia** e va solo dichiarato: nuova chiave nel catalogo |
| **D-12** | **Subordinati** in V1 | pieni / solo registrazione del costo / esclusi | **Solo registrazione del costo**, con etichetta «gestito da software paghe» |
| **D-13** | Perimetro **P.IVA** in V1 | motore separato / solo registrazione della fattura | **Solo registrazione**: il documento e una fattura passiva, il calcolo lo fa chi la emette |
| **D-14** | Nome del dominio nell'interfaccia | «Compensi» / «Lavoro sportivo» / «Personale» | **«Lavoro sportivo»**: e il termine della legge, e comprende cio che «compensi» non comprende (contratti, adempimenti, documenti) |

---

## 20 — Piano V1 / V2

### 20.1 Classificazione per soggetto e regime

| Regime | V1 | POST-V1 | Software esterno / consulente |
|--------|----|---------|-------------------------------|
| **Co.co.co. sportiva** | **si, completo**: rapporto, piano, maturazione, erogazione, soglie, contributi, agenda, documenti | ritenuta IRPEF, dati CU/F24 esportabili in tracciato | trasmissione Uniemens, F24, CU |
| **Autonomo sportivo senza P.IVA** | **si**, stesso motore con la variante contributiva | | |
| **Amministrativo-gestionale (art. 37)** | **si**, con canale e termine di comunicazione **diversi** (UNILAV, giorno prima) e INAIL segnalato come dovuto | | INAIL: consulente |
| **P.IVA (ordinaria o forfettaria)** | **si, ma solo registrazione**: rapporto, importo pattuito, fattura ricevuta come allegato, erogazione, uscita in Movimenti. **Nessun calcolo contributivo del club** | eventuale ritenuta d'acconto, rivalsa cassa, calcolo IVA | il calcolo lo fa chi emette la fattura |
| **Subordinato sportivo** | **registrazione del costo e del contratto**, nient'altro. Nessun cedolino, nessun TFR, nessun INAIL, nessuna malattia | eventuale import del costo dal software paghe | **paghe: consulente del lavoro** |
| **Volontario** | **si**: rimborsi documentati, forfettari con tetto mensile, delibera, autodichiarazione | | |
| **Agente sportivo** | anagrafica, mandato con scadenza e deposito, compenso come costo del club | | |
| **Arbitri / direttori di gara** | **fuori**: il committente non e il club | | federazione |

### 20.2 Le fasi

**Fase 0 — Fondamenta (prerequisito, non negoziabile)**

- Modulo regole `SPORT_WORK_RULES_2026` con fonti citate.
- Motore puro `sport-work/engine.ts` + test **prima** di qualunque interfaccia,
  con gli esempi A–E di questo documento come casi di prova.
- `sport_work_subjects` e `sport_work_engagements`.
- Decisione presa su D-1, D-4, D-5, D-6.

**Fase 1 — Il rapporto e il suo denaro (il minimo utile a un club vero)**

- Rapporto: creazione, stati, contratto allegato.
- Piano compensi nelle tre forme.
- Maturazione per periodo.
- Erogazione: proposta con motivazione → conferma → ledger OUTBOUND → uscita in
  Movimenti.
- Posizione annua derivata, con progressivo e franchigie residue.
- Autocertificazioni.
- Tab «Lavoro / Compensi» sulla scheda persona.
- Assorbimento di `trainer_payments`.

**Fase 2 — Gli adempimenti**

- Agenda: comunicazioni RASD/UNILAV, F24 mensile, Uniemens, CU, rinnovi,
  documenti in scadenza.
- Dashboard «Lavoro sportivo».
- Notifiche (subordinata a D-10).
- Dati F24 e dati CU, in tabella copiabile ed esportabile.

**Fase 3 — I contorni**

- Rimborsi e note spese; volontari e tetto mensile.
- Premi, con la distinzione premio / retribuzione variabile.
- Agenti sportivi e mandati; assorbimento di `/procura`.

**Post-V1**

- Ritenuta IRPEF calcolata.
- Tracciati CU / 770 / Uniemens.
- Import del costo dal software paghe per i subordinati.
- Simulatore di costo.
- Export contabile strutturato.

**Mai, salvo cambio di scenario**

- Trasmissione telematica di adempimenti fiscali o previdenziali.
- Cedolino paga.
- Consulenza automatizzata sulla qualificazione del rapporto.

### 20.3 Nota sulla dimensione

Questo modulo, anche solo in Fase 0 + Fase 1, e **piu grande di qualunque WP
finora chiuso** in questo repository. Il vincolo di `CLAUDE.md` §3 (diff sopra
le ~400 righe da valutare per la divisione) non e un dettaglio: va pianificato
come **una serie di WP**, ognuno con i suoi test, non come un blocco unico.

L'ordine proposto non e negoziabile su un punto: **il motore puro e i suoi test
vengono prima dell'interfaccia**. Un motore fiscale sbagliato dietro una
schermata bella e il modo piu efficiente di fare danni a un cliente.

---

## 21 — Validazione professionale

Le voci seguenti **non devono diventare codice** prima di una conferma scritta.
Sono ordinate per costo dell'errore.

### 21.1 Da validare con un **commercialista** (fiscalita)

| # | Punto | Perche e critico |
|---|-------|------------------|
| V1 | **Qualificazione reddituale** della co.co.co. sportiva dilettantistica (art. 50 c. 1 lett. c-bis TUIR vs art. 53) e **quale ritenuta** si applica sull'eccedenza dei 15.000 | cambia il netto erogato |
| V2 | **Deducibilita** dei contributi a carico del lavoratore dalla base imponibile dell'eccedenza | cambia il netto (135 EUR nell'esempio D) |
| V3 | Trattamento dei **premi** ex art. 36 c. 6-quater: concorrono alle soglie? quale ritenuta? CU o 770? | cambia l'adempimento |
| V4 | Confine tra **premio** e **retribuzione variabile** | cambia il regime dell'intera somma |
| V5 | Obbligo e contenuto della **CU** per compensi interamente sotto i 15.000 | e un adempimento omesso o superfluo |
| V6 | Trattamento del **P.IVA forfettario** che presta attivita sportiva: cosa il club deve o non deve trattenere | |
| V7 | **Tracciabilita** obbligatoria dei rimborsi spese dal 1/1/2025 e sue conseguenze sulla non imponibilita | |
| V8 | Soglie e condizioni delle **indennita di trasferta** applicate al lavoro sportivo | |

### 21.2 Da validare con un **consulente del lavoro**

| # | Punto | Perche e critico |
|---|-------|------------------|
| V9 | Modalita esatta di applicazione della **franchigia contributiva dei 5.000** con pluralita di committenti, e cosa il committente deve fare quando la dichiarazione arriva **dopo** l'erogazione | e il cuore del motore; la prassi non e pacifica |
| V10 | **Aliquote 2026** e loro ripartizione per i lavoratori sportivi (25% + 2,03% / 24%; 1/3–2/3), con il **numero e la data esatti** della circolare INPS | vanno nei commenti di codice: devono essere giusti |
| V11 | **Causali F24** (CXX, C10) attualmente vigenti | un codice sbagliato produce un versamento inimputato |
| V12 | Termini e canale della **comunicazione** per ciascun tipo di rapporto (RASD mese successivo vs UNILAV giorno prima) | sanzione da 100 a 500 EUR per lavoratore |
| V13 | Regole e termini del **LUL sportivo** tramite il registro | |
| V14 | Obbligo **INAIL**: chi si, chi no (art. 34 vs art. 37) | |
| V15 | Se subordinare la **maturazione** del compenso alle presenze rilevate costituisca indizio di subordinazione | cambia la qualificazione del rapporto |
| V16 | Presunzione delle **24 ore settimanali**: come vanno contate, e cosa deve fare il software quando il rapporto le supera | |

### 21.3 Da validare con un **consulente ASD / esperto di diritto sportivo**

| # | Punto |
|---|-------|
| V17 | Condizioni di legittimita dei **rimborsi forfettari ai volontari** (400 EUR/mese): quali eventi, quale delibera, quale autodichiarazione |
| V18 | Quali figure di **staff** rientrino nel lavoro sportivo secondo i regolamenti federali della disciplina del club |
| V19 | Disciplina del **mandato con agente sportivo**: deposito, durata, limiti sul minore, chi paga |
| V20 | Adempimenti **federali** ulteriori (tesseramento, assicurazione) che si intrecciano con il rapporto di lavoro |

### 21.4 La regola operativa

Ogni regola validata entra nel codice **con la sua fonte nel commento**, nel
modulo `sport-work/rules/<anno>.ts`, e **con la data della validazione**. Una
regola senza fonte nel commento e un numero che nessuno potra piu verificare
tra due anni — che e esattamente il problema che questo documento esiste per
prevenire.

---

## 22 — Proposta finale

### 22.1 Cosa deve fare EasyGame V1

1. **Rendere il rapporto di lavoro sportivo un oggetto reale**: persona, ruolo,
   tipo, periodo, importo pattuito, contratto firmato, stato.
2. **Generare e governare il piano compensi**, con scadenze che maturano e non
   nascono gia dovute.
3. **Registrare le erogazioni in un registro immutabile**, con storno e senza
   cancellazione, che diventa **una** uscita in Movimenti.
4. **Calcolare, per ogni erogazione e con le regole dell'anno**: imponibile
   previdenziale, contributi lavoratore e club, netto previdenziale, costo
   club — **congelando** il calcolo sulla riga.
5. **Mantenere la posizione annua di ogni persona** verso le soglie dei 5.000 e
   dei 15.000, distinguendo sempre cio che il club ha pagato da cio che il
   lavoratore ha dichiarato, **con la data della dichiarazione**.
6. **Raccogliere e conservare le autocertificazioni**, e rifiutarsi di erogare
   al buio senza che qualcuno se ne assuma la responsabilita per iscritto.
7. **Tenere l'agenda degli adempimenti** — comunicazione al canale giusto entro
   il termine giusto, F24, Uniemens, CU, rinnovi, documenti in scadenza — e
   sapere se sono stati fatti.
8. **Preparare i dati** dell'F24 e della CU in una forma consegnabile al
   consulente.
9. **Tenere separati** compenso, premio, rimborso documentato, indennita di
   trasferta e rimborso forfettario al volontario, in tabelle diverse.
10. **Archiviare i documenti** su Attachment Core e far scadere quelli che
    scadono.
11. **Proteggere il dato economico**: default negato, filtro server-side, audit
    anche degli accessi riusciti.
12. **Assorbire** `trainer_payments` e disambiguare `/procura`.

### 22.2 Cosa NON deve fare EasyGame V1

1. **Non trasmettere** niente: non al RASD, non a UNILAV, non all'INPS, non
   all'Agenzia delle Entrate.
2. **Non generare** file telematici (CU, 770, Uniemens, F24).
3. **Non calcolare la ritenuta IRPEF** finche la qualificazione reddituale non
   e validata: mostrare l'imponibile eccedente e fermarsi.
4. **Non fare cedolini**, TFR, ferie, malattia, INAIL: niente paghe.
5. **Non qualificare** il rapporto al posto di un professionista («questo e un
   co.co.co.»): raccogliere una scelta dichiarata, non dedurla.
6. **Non compensare** in automatico compensi con quote, contributi con rate,
   rimborsi con compensi.
7. **Non dedurre** aliquote, regimi o nature da sigle e ruoli.
8. **Non mostrare un numero senza le sue ipotesi** e senza la data delle
   dichiarazioni su cui poggia.
9. **Non promettere avvisi** che senza scheduler non partiranno.
10. **Non creare** un secondo sistema di allegati, notifiche, ruoli o ledger.

### 22.3 Cosa lasciare al software paghe / al consulente

| Cosa | A chi |
|------|-------|
| Liquidazione dei **lavoratori subordinati**: cedolino, CCNL, TFR, ferie, malattia, INAIL | consulente del lavoro + software paghe |
| **Trasmissione** di Uniemens, F24, CU, 770 | consulente / intermediario abilitato |
| **Comunicazioni obbligatorie** al RASD e a UNILAV (l'operazione materiale) | club sul portale, o consulente |
| **Qualificazione** del rapporto e verifica della genuinita dell'autonomia | consulente del lavoro |
| **Determinazione definitiva** di quanto l'ente deve a INPS ed Erario | commercialista |
| **Gestione IVA e fatturazione** del professionista con P.IVA | il professionista stesso |
| **Contenzioso, sanzioni, ravvedimento** | professionisti |

### 22.4 La frase da tenere davanti per tutta l'implementazione

> EasyGame sa **chi lavora, quanto e stato pattuito, quanto e stato erogato e
> quando**. Nessun altro sistema del club lo sa. Questo e il suo vantaggio, ed
> e enorme.
>
> EasyGame **non sa** cosa il lavoratore ha percepito altrove se non glielo
> dicono, **non e** il sostituto d'imposta che risponde dell'adempimento, e
> **non ha** la delega per liquidare un tributo.
>
> Un modulo costruito sul primo paragrafo e indispensabile. Un modulo che
> pretende di coprire anche il secondo e un rischio legale col logo del
> cliente sopra.

---

## 23 — Fonti

### 23.1 Normativa (riferimenti primari)

- **D.Lgs. 28 febbraio 2021, n. 36** — riordino delle disposizioni in materia
  di enti sportivi e di lavoro sportivo. In particolare artt. 25, 28, 29, 34,
  35, 36, 37. Come modificato da D.Lgs. 163/2022, D.Lgs. 120/2023 e
  D.L. 71/2024.
- **D.Lgs. 28 febbraio 2021, n. 37** — professione di agente sportivo.
- **D.Lgs. 28 febbraio 2021, n. 39** — registro nazionale delle attivita
  sportive dilettantistiche.
- **D.P.R. 22 dicembre 1986, n. 917 (TUIR)** — artt. 50, 51, 53, 54, 67.
- **D.P.R. 29 settembre 1973, n. 600** — artt. 23, 25, 30.
- **D.P.R. 22 luglio 1998, n. 322** — art. 4 (CU e 770).
- **Legge 8 agosto 1995, n. 335** — art. 2 c. 30 (ripartizione 1/3–2/3).
- **Legge 27 dicembre 2002, n. 289** — art. 51 (copertura assicurativa
  sportiva).

> I testi vanno consultati su **Normattiva** (normattiva.it) nella versione
> vigente alla data di implementazione. Questo documento **non** riporta il
> testo degli articoli: ne riporta il contenuto ricostruito.

### 23.2 Prassi e documenti istituzionali

- [Dipartimento per lo Sport — FAQ sul lavoro sportivo](https://www.sport.governo.it/it/attivita-nazionale/riforma-dello-sport/faq-sul-lavoro-sportivo/) — pubbl. 19 marzo 2024, agg. 30 maggio 2024. **[ufficiale, PDF da rileggere a mano]**
- [Dipartimento per lo Sport — Registro nazionale delle attivita sportive](https://www.sport.governo.it/it/attivita-nazionale/registro-nazionale-delle-attivita-sportive-dilettantistiche/il-registro-nazionale-delle-attivita-sportive/) **[ufficiale]**
- [Sport e Salute — Vademecum lavoratori sportivi (RASD)](https://registro.sportesalute.eu/static/media/Vademecum%20lavoratori%20sportivi.6cd2e4f5876218ac5391.pdf) **[ufficiale, non raggiungibile al momento della stesura: HTTP 503]**
- [INPS — Gestione separata: aliquote contributive per il 2026](https://www.inps.it/it/it/inps-comunica/notizie/dettaglio-news-page.news.2026.02.gestione-separata-le-aliquote-contributive-per-il-2026.html) — circolare n. 8 del 3 febbraio 2026 **[ufficiale, contenuto non estraibile automaticamente]**
- INAIL, circolare n. 46 del 27 ottobre 2023 — assicurazione dei subordinati
  sportivi e dei co.co.co. amministrativo-gestionali (artt. 34 e 37).
- INPS, circolare n. 88 del 31 ottobre 2023 — disciplina operativa del lavoro
  sportivo.
- Agenzia delle Entrate, **consulenza giuridica n. 14/2025** — fiscalita del
  lavoro sportivo.

### 23.3 Ricostruzioni professionali consultate

- [Finanza & Fisco — Aliquote contributive Gestione separata 2026](https://www.finanzaefisco.com/aliquote-contributive-su-compensi-per-lanno-2026/)
- [Finanza & Fisco — Le risposte AdE nella consulenza giuridica n. 14/2025](https://www.finanzaefisco.com/sport-e-fiscalita-d-lgs-n-36-2021-le-risposte/)
- [Istituto Sport e Sociale — Lavoro sportivo: soglie fiscali e contributive per il 2026](https://istitutosportesociale.it/lavoro-sportivo-soglie-fiscali-e-contributive-per-il-2026/)
- [Fisco Chiaro Consulting — Soglia 5.000 e 15.000 per il lavoratore sportivo](https://www.fiscochiaroconsulting.it/lavoratore-sportivo-soglia-5000-15000/)
- [Fiscosport — La franchigia per lavoro sportivo e la circolare INPS 88/2023: una questione ancora non chiara](https://www.fiscosport.it/postquesiti/in-evidenza/la-franchigia-per-lavoro-sportivo-e-la-circolare-inps-n-88-2023-una-questione-ancora-non-chiara/)
- [Studio Pizzano — Lavoro sportivo dilettantistico: comunicazioni obbligatorie e sanzioni](https://www.studiopizzano.it/lavoro-sportivo-dilettantistico-le-comunicazioni-obbligatorie-e-sanzioni/)
- [Studio Pizzano — Certificazione Unica 2026 enti sportivi](https://www.studiopizzano.it/certificazione-unica-2026-enti-sportivi/)
- [ASI Nazionale — CU 2026 per enti sportivi: inquadramento normativo e responsabilita](https://www.asinazionale.it/notizie/cu-2026-per-enti-sportivi-inquadramento-normativo-obblighi-dichiarativi-e-profili-di-responsabilita/)
- [FiscoeTasse — Lavoro sportivo: istruzioni INPS su aliquote, Uniemens e versamenti](https://www.fiscoetasse.com/rassegna-stampa/34753-lavoro-sportivo-istruzioni-inps-su-aliquote-uniemens-e-versamenti.html)
- [ODCEC Torino — I collaboratori sportivi: le co.co.co. sportive (10 aprile 2025)](https://odcec.torino.it/public/convegni/moine_branca.pdf)
- [Fondazione Nazionale dei Commercialisti — Il lavoratore sportivo (quaderno operativo)](https://www.fondazionenazionalecommercialisti.it/filemanager/active/01687/2023_12_01_Quaderno_operativo_3_Il_lavoratore_sportivo_.pdf?fid=1687)
- [Olympus / Univ. Urbino — INAIL circ. 46/2023](https://olympus.uniurb.it/index.php?option=com_content&view=article&id=30906:inail46_23&catid=6&Itemid=137)
- [FIGC — Rimborsi spese forfettari volontari sportivi ex art. 29](https://www.figc.it/media/252816/117-rimborsi-spese-forfettari-volontari-sportivi-ex-art-29-del-decreto-n-36-2021.pdf)
- [Rivista di Diritto Sportivo (CONI) — Tassazione di agenti e procuratori sportivi](https://rivistadirittosportivo.coni.it/images/rivistadirittosportivo/ultime_novita/2024/16022024_Giurisprudenza_procuratori_GT_VF_21.02.24.pdf)
- [Sportello Fiscale-Legale FIP — Lavoratori sportivi autonomi con partita IVA: quadro RR](https://sportellofiscalelegale.fip.it/lavoratori-sportivi-autonomi-con-partita-iva-quadro-rr-e-calcolo-dei-contributi-inps/)

### 23.4 Codice EasyGame esaminato

`prisma/schema.prisma` · `src/lib/access-roles.ts` ·
`src/lib/club-financial-summary.ts` · `src/lib/club-entity-directory.ts` ·
`src/lib/club-seasons.ts` · `src/lib/person-identity.ts` ·
`src/lib/trainer-documents.ts` · `src/lib/entitlements/catalog.ts` ·
`src/lib/fiscal/engine.ts` · `src/lib/payments/installment-ledger.ts` ·
`src/lib/server/payment-transactions.ts` · `src/lib/server/resources.ts` ·
`src/lib/server/audit.ts` · `src/lib/server/funding.ts` ·
`src/app/procura/page.tsx` · `docs/knowledge-base/06`, `08`, `11`, `18`, `20`,
`21`.

---

## Stato del documento

- **Analisi, non progetto approvato.** Nessuna decisione di questo documento e
  vincolante finche non e discussa.
- **Nessun codice scritto, nessuna migrazione creata, nessun database
  toccato** — al momento in cui il documento e stato scritto. Il work package
  che lo ha attuato e documentato in
  [29](29-lavoro-sportivo-implementazione-uat.md); dove il codice si e
  discostato da questa analisi, lo dice quel documento e vincono gli ADR
  0071-0077 di [18](18-decision-log.md).
- Le regole normative **devono** passare dalla validazione del
  [cap. 21](#21--validazione-professionale) prima di diventare codice.
- Gli esempi numerici usano i parametri 2026 riportati al
  [cap. 7.1](#71-i-parametri-2026) e vanno ricalcolati se quei parametri
  cambiano.
