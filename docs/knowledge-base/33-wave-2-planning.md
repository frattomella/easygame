# 33 — Wave 2: planning esecutivo — Comunicazioni e automazioni

**Data:** 2026-08-29
**Baseline:** `integration/web-v1` @ `790c7d4`
**Origine:** i gap di Wave 2 di [30 — Gap audit](30-golee-easygame-gap-audit.md),
dopo la chiusura della [Wave 1](32-wave-1-implementation-uat.md)
**Stato:** **PROPOSTA**. Nessuna riga di codice scritta, nessuna migrazione
creata, nessun deploy. Questo documento e il **contratto** della Wave: se la
Wave verra autorizzata, non va riscritto a posteriori — cio che sara costruito
davvero andra in `34-wave-2-implementation-uat.md`, come la coppia 31/32.

> **Cosa e stato fatto per scriverlo:** lettura del codice a HEAD, piu
> interrogazioni **di sola lettura** sul database di sviluppo
> (`127.0.0.1:5434/easygame_dev`, `EASYGAME_DB_ENV="development"`). Nessuna
> scrittura, nessuna migrazione, nessun club creato. Il §1.1 dichiara cosa la
> verifica prova e cosa **non** prova.

> **Principio che governa ogni riga.** Golee e servito a trovare i problemi.
> **Non e la specifica.** Non si implementano 34 automazioni perche Golee ne ha
> 34: si aprono le poche che una segreteria italiana controlla davvero, e si
> cresce per domanda. Ogni intervento parte dai domini EasyGame esistenti e li
> **estende**; una capability nuova va motivata riga per riga.

---

## Indice

1. [La verifica dei gap](#1--la-verifica-dei-gap)
2. [L'inventario: cosa puo gia fare da innesco](#2--linventario-cosa-puo-gia-fare-da-innesco)
3. [Il motore di automazioni: EXTEND o NEW](#3--il-motore-di-automazioni-extend-o-new)
4. [Le prime automazioni](#4--le-prime-automazioni)
5. [Il link di pagamento sicuro (G-06)](#5--il-link-di-pagamento-sicuro-g-06)
6. [L'audience engine](#6--laudience-engine)
7. [La comunicazione massiva (G-07)](#7--la-comunicazione-massiva-g-07)
8. [La bacheca (G-08)](#8--la-bacheca-g-08)
9. [L'RSVP (G-20)](#9--lrsvp-g-20)
10. [Il confine con l'area genitore](#10--il-confine-con-larea-genitore)
11. [I permessi](#11--i-permessi)
12. [I workstream paralleli](#12--i-workstream-paralleli)
13. [Il DAG delle dipendenze e l'ordine di merge](#13--il-dag-delle-dipendenze-e-lordine-di-merge)
14. [Pre-production challenge](#14--pre-production-challenge)
15. [La UAT, decisa prima dello sviluppo](#15--la-uat-decisa-prima-dello-sviluppo)
16. [L'audit obbligatorio di fine Wave](#16--laudit-obbligatorio-di-fine-wave)
17. [Cosa non copiamo da Golee](#17--cosa-non-copiamo-da-golee)
18. [ADR da scrivere, contatori, effetto sulla gap matrix](#18--adr-da-scrivere-contatori-effetto-sulla-gap-matrix)

---

## 1 — La verifica dei gap

### 1.1 Cosa e stato verificato, e con che limite

| Voce | Valore |
|---|---|
| Codice | letto a HEAD `790c7d4` |
| Database | **sviluppo locale**, sole `SELECT` aggregate (`notifications`, `training_attendance`, `club_resource_items`) |
| Scritture | **nessuna** |
| Applicazione | **non avviata**: nessuna delle affermazioni di questo documento richiede un giro HTTP che il codice non dica gia |
| Limite dichiarato | il database di sviluppo ha due club di prova e poche righe. Serve a confermare **assenze strutturali** («questo tipo di notifica non esiste», «questa tabella e vuota»), non volumi ne comportamenti su dati reali |

**Le cinque osservazioni a runtime che contano:**

| # | Osservazione | Esito |
|---|---|---|
| 1 | `notifications` porta **due soli tipi** in archivio: `form_submission` (30) e `system` (1). Nessun `payment_reminder`, nessun `medical_certificate_reminder` | confermato |
| 2 | `training_attendance` e **vuota** sul database di sviluppo | confermato |
| 3 | `club_resource_items` porta **12 tipi** e nessuno riguarda comunicazioni, annunci o regole: le 30 voci di `CLUB_RESOURCE_TYPES` non contengono nulla di comunicazionale | confermato |
| 4 | `AttendanceConfirmation.tsx` **non e importato da nessun file** del repository (ricerca su `src/**`) | confermato |
| 5 | `POST /api/payments/create-checkout-session` chiama `requireAuthenticatedUser` come **prima istruzione**: una famiglia senza account non puo aprire un pagamento | confermato |

### 1.2 Il registro dei gap

Legenda stato: `CONFIRMED` · `PARTIAL` · `NEEDS RUNTIME` · `ALREADY SOLVED` ·
`FALSE POSITIVE`.

---

#### G-03 — Motore di automazioni sulle scadenze

| Voce | Contenuto |
|---|---|
| **Problema reale** | La segreteria controlla a mano chi non ha pagato e a chi scade il certificato. Dove un promemoria automatico esiste (certificati, lavoro sportivo), il club **non lo governa**: non puo spegnerlo, non puo scegliere quando parte, non puo scegliere a chi |
| **Evidenza** | Esistono **due** produttori automatici di promemoria, e sono l'uno l'opposto dell'altro. `sport-work-scheduler.ts` deduplica per sempre su `data.sportWorkKey` con preavvisi **costanti nel codice** (`PAYOUT_NOTICE_DAYS = 7`, `OBLIGATION_NOTICE_DAYS = 14`). `medical-certificate-reminders.ts` deduplica su `data.key` con **finestra di 7 giorni** e non ha nessun preavviso: parte su ogni certificato non valido. Il sollecito insoluti (`payment-reminders.ts`) ne usa una terza: una rivendicazione scritta in `athletes.data.paymentReminders[email]` con finestra di 6 ore, e non e nemmeno automatico — lo aziona una persona |
| **Stato** | **CONFIRMED**. Il gap non e «mancano le notifiche»: e che **tre dialetti di deduplicazione** e tre politiche di raggiungibilita convivono senza un proprietario |
| **Domain owner** | **nuovo**: `src/lib/automations/` (puro) + `src/lib/server/automations.ts` (unico scrittore). Delega ai proprietari esistenti per ogni valutazione di dominio, senza mai interrogare le rate o i certificati per conto proprio |
| **Da riutilizzare** | La porta cron (`authorizeCronRequest`) · il giro per club con `try/catch` per club di `runSportWorkSchedulerForAllClubs` · il modello `Notification` · `src/lib/server/email/` come **unico** punto di invio · `recordAuditEvent` · `buildInstallmentLedgers` · `getMedicalCertificateAvailability` |
| **Sviluppo** | Il catalogo delle regole come **configurazione di club**; un valutatore notturno; **un solo** registro delle consegne che serve insieme da deduplica e da «chi ha ricevuto cosa»; il riepilogo giornaliero (G-58) |
| **Non copiare** | La matrice di 34 automazioni cablate. E il gating per piano dentro la matrice dei permessi (N-02): se un giorno le automazioni saranno a listino, passeranno dal catalogo entitlement — che dice il **motivo** del diniego — non da un `isProTab` |
| **Effort** | **L** |
| **Rischio** | **ALTO**. E l'unica funzione della Wave che manda email a nome di una societa **senza che nessuno prema un pulsante**. Un difetto qui non produce una schermata sbagliata: produce trecento email sbagliate a famiglie reali, e non si richiamano |

---

#### G-04 — Anticipi configurabili

| Voce | Contenuto |
|---|---|
| **Problema reale** | «Avvisami 30 e 7 giorni prima». Oggi non esiste in nessun punto del prodotto |
| **Evidenza** | I due preavvisi esistenti sono costanti esportate (`PAYOUT_NOTICE_DAYS`, `OBLIGATION_NOTICE_DAYS`); i promemoria certificati non ne hanno affatto e partono su qualunque stato diverso da «valido» |
| **Stato** | **CONFIRMED**, ma **non e lavoro separato**: e un campo della regola di G-03 |
| **Domain owner** | dentro `src/lib/automations/` |
| **Sviluppo** | Fino a **tre** anticipi per regola, in giorni, con la regola che un anticipo gia trascorso non recupera all'indietro |
| **Effort** | **S** (dentro G-03) |
| **Rischio** | BASSO |

---

#### G-05 — Contenuto del messaggio con segnaposto

| Voce | Contenuto |
|---|---|
| **Problema reale** | Il club vuole scrivere con le sue parole. Oggi il testo di ogni messaggio e **codice** |
| **Evidenza** | `buildPaymentReminderLines` in `email-service.ts` costruisce le righe del sollecito; `buildReminderContent` in `medical-certificate-reminders.ts` costruisce quelle del certificato. Un club che voglia cambiare una parola apre una richiesta di assistenza |
| **Stato** | **PARTIAL**. Il risolutore dei segnaposto **esiste gia**: `src/lib/documents/placeholders.ts` (catalogo chiuso e unico) + `src/lib/server/document-placeholders.ts` (risolutore), costruiti in Wave 1 con i quattro vincoli di [ADR-0079](18-decision-log.md). Manca che un **messaggio** possa usarli, e mancano i segnaposto di scadenza e importo |
| **Domain owner** | `src/lib/documents/placeholders.ts` — **estensione del catalogo esistente**, mai un secondo catalogo |
| **Da riutilizzare** | Il catalogo, il risolutore, `applyPlaceholderValues`, `extractPlaceholderKeys` |
| **Sviluppo** | Modelli di messaggio per regola e per comunicazione, con anteprima su un destinatario vero prima dell'invio |
| **Non copiare** | Un editor di template libero con condizionali e cicli. Un segnaposto sconosciuto deve **fallire in anteprima**, non produrre una email con `{{importo}}` scritto dentro |
| **Effort** | **M** |
| **Rischio** | MEDIO — un segnaposto che risolve male scrive una cifra sbagliata a una famiglia |

---

#### G-06 — Link di pagamento dentro il sollecito

| Voce | Contenuto |
|---|---|
| **Problema reale** | Sollecitare senza dare il modo di pagare produce un secondo sollecito. E il club sul piano `plus` **ha gia comprato questa promessa**: la descrizione dell'entitlement `online_payments` dice testualmente che la famiglia paga «dal link» |
| **Evidenza** | `sendPaymentReminderEmail` dichiara nel proprio commento «Nessun link di pagamento». `POST /api/payments/create-checkout-session` richiede una sessione: **nessuna** superficie pubblica apre un pagamento. Il token genitore esiste (`createParentAccessToken`, `PARENT_TOKEN_EXPIRY_HOURS = 72`) ma serve a **collegare un account**, non a pagare: usarlo per un pagamento darebbe accesso all'intera area genitore per pagare una rata |
| **Stato** | **CONFIRMED** |
| **Domain owner** | `src/lib/server/payment-links.ts` (emissione e riscatto) — che **non calcola nulla di economico**: delega a `buildInstallmentLedgers` per il residuo e a `openGatewayCheckout` per il pagamento |
| **Da riutilizzare** | `openGatewayCheckout` (**il** checkout, non un secondo) · `resolveClubGatewayContext` · `requireClubEntitlement("online_payments")` · `AuthRateLimitBucket` per il rate limit · il precedente dello slug pubblico dei moduli (`public_slug` + `public_enabled`) · `recordAuditEvent` |
| **Sviluppo** | Token opaco in archivio (hash a riposo), ambito club+rata, scadenza, revoca, pagina pubblica `/pay/[token]`, registro degli accessi |
| **Non copiare** | Il finanziamento al consumatore (N-08) e qualunque secondo fornitore nel percorso del denaro. E niente pagina di pagamento propria: il denaro passa dal PSP |
| **Effort** | **M** |
| **Rischio** | **ALTO**. E l'unica superficie della Wave esposta su Internet senza autenticazione, e sta davanti a un pagamento |

---

#### G-07 — Comunicazione massiva con destinatari segmentati

| Voce | Contenuto |
|---|---|
| **Problema reale** | Oggi il club apre WhatsApp, e il dato di chi ha ricevuto cosa resta fuori dal gestionale |
| **Evidenza** | La Wave 1 ne ha costruito **il primo pezzo** e nient'altro: `payment-reminders.ts` sa fare anteprima a due elenchi, motivo dell'irraggiungibilita, invio per indirizzo anche senza account, e idempotenza. Ma il suo pubblico e **un elenco di rate selezionate a mano**, il testo e fisso, e il registro di cio che e uscito e la sola riga di audit `payment.reminder.sent` con dei conteggi |
| **Stato** | **PARTIAL** — come gia dichiarato al §4.5 della [30](30-golee-easygame-gap-audit.md) |
| **Domain owner** | `src/lib/server/communications.ts` (invio) + `src/lib/server/audience.ts` (pubblico). `src/lib/server/email/` resta **l'unico punto di invio** |
| **Da riutilizzare** | Tutto `payment-reminders.ts`: e il modello di riferimento, e va **migrato** sull'audience engine invece di essere lasciato come seconda implementazione |
| **Sviluppo** | Criteri di segmentazione, anteprima del pubblico, registro delle consegne per destinatario |
| **Non copiare** | Un secondo motore di comunicazione accanto a `email-service`. E la telemetria di apertura verso terze parti (N-01) |
| **Effort** | **L** |
| **Rischio** | MEDIO-ALTO — la superficie che raggiunge piu persone in un gesto solo |

---

#### G-08 — Bacheca con destinatari per ruolo e gruppo

| Voce | Contenuto |
|---|---|
| **Problema reale** | «Domenica il campo e chiuso» non e una notifica: resta, si consulta, ha un allegato, e chi arriva dopo lo deve trovare |
| **Evidenza** | `notifications` non ha allegato, non ha data di pubblicazione, non ha scadenza e non ha destinatario oltre a `user_id` (o `null` = tutto il club). La pagina `/notifications` filtra gli **ultimi 6 giorni** e si ferma a 50 righe: e un flusso che dimentica. `secretariat_notes` esiste, ma e una nota **interna** in area gestionale e non raggiunge le famiglie |
| **Stato** | **CONFIRMED** |
| **Domain owner** | risorsa di club nuova `announcements` in `club_resource_items` (quindi dentro `resources.ts`, con ambito, audit e superficie REST gia pronti) + **Attachment Core** per gli allegati |
| **Da riutilizzare** | `club_resource_items` · Attachment Core (`owner_type: "announcement"`) · l'audience engine per il pubblico · il registro delle consegne per il letto/non letto |
| **Sviluppo** | Bozza/pubblicato, pubblicazione programmata, scadenza, allegati, lettura |
| **Non copiare** | Commenti, reazioni, thread, notifiche di risposta. **Non e un social network**: un annuncio ha un autore e dei destinatari, e finisce li |
| **Effort** | **M** |
| **Rischio** | BASSO |

---

#### G-20 — RSVP della famiglia sull'evento

| Voce | Contenuto |
|---|---|
| **Problema reale** | L'allenatore non ha bisogno di sapere chi manca: ha bisogno di sapere **chi non ha risposto**, il giorno prima, quando puo ancora chiamare qualcuno |
| **Evidenza** | Il componente che l'audit indicava come punto di partenza (`src/components/parent/AttendanceConfirmation.tsx`) **non e un punto di partenza**: nessun file lo importa, la sua callback `onConfirm` non ha nessuna implementazione nel repository, e lo stato «gia confermato» lo legge da `localStorage`. Non ha «forse», non ha scadenza, non ha server. E un bozzetto di interfaccia. La sostanza vera sta altrove: `training_attendance` e una tabella reale, con risorsa REST (`resources.ts:191`), stati `present`/`absent` scritti dall'appello dell'allenatore (`simplified-db.ts:3399`) e letta dalla misura presenze dei bandi e dalla dashboard genitore |
| **Stato** | **CONFIRMED** come gap; il componente citato dall'audit e **FALSE START**, non una base |
| **Difetto trovato strada facendo** | `training_attendance` **non ha un indice unico** su `(organization_id, training_id, athlete_id)`: il client compensa cancellando a mano le righe duplicate dopo averle trovate. Con un RSVP che scrive sulla stessa riga, due righe significano **due risposte diverse per lo stesso atleta**. La chiave unica e quindi dentro il perimetro di questa lane, non fuori |
| **Domain owner** | `training_attendance` esteso — **non** una seconda tabella di presenze |
| **Da riutilizzare** | `training_attendance` · `parent-dashboard.ts` (che gia espone allenamenti e partite all'atleta giusto) · `/parent-view/[id]/trainings` · l'audience engine per l'invito |
| **Sviluppo** | Colonne di risposta distinte da `status`, chiave unica, scadenza di conferma sull'evento, vista staff «senza risposta» |
| **Non copiare** | Un secondo sistema di presenze. E l'RSVP che **scrive la presenza**: sono due fatti diversi |
| **Effort** | **M** |
| **Rischio** | MEDIO — tocca una tabella che alimenta la rendicontazione dei bandi |

---

#### Gap adiacenti, verificati e classificati

| Gap | Stato | Perche |
|---|---|---|
| **G-58** — notifica singola o riepilogo giornaliero | **CONFIRMED**, dentro G-03 | Non esiste nessuna aggregazione: ogni promemoria e una riga e una email |
| **G-35** — sollecito mirato «solo i senza risposta» | **CONFIRMED**, ma **POST-V1** | Diventa quasi gratuito una volta che esistono audience + RSVP: e un criterio in piu, non un lavoro. Non entra in Wave 2 |
| **G-53** — avvisi di scadenza del tesseramento | **BLOCCATO da G-30** | Il tesseramento non e ancora un'entita. La regola non ha su cosa girare. **NO ACTION** in Wave 2 |
| **Contratto in scadenza** (lavoro sportivo) | **ALREADY SOLVED** | `sport-work-scheduler` gia notifica a 7 e 14 giorni. Riscriverlo sul motore nuovo sarebbe un refactor senza guadagno per l'utente: **NO ACTION**, e va detto invece di lasciarlo credere aperto |
| **Adempimento lavoro sportivo** | **ALREADY SOLVED** | Come sopra: `syncObligations` + `OBLIGATION_NOTICE_DAYS` |
| **Voucher / presenze** | **FALSE POSITIVE** come automazione | La maturazione dei contributi e *request-driven* **per scelta motivata** (`maintenance.ts`): un giro notturno che la ricalcola toccherebbe periodi gia liquidati senza che nessuno l'abbia chiesto. **NO ACTION** |
| **G-18** — account famiglia con ciclo di vita | **FUORI PERIMETRO, dichiarato** | Era nella Wave 2 dell'audit; il perimetro di questa Wave non lo comprende. Vedi §1.3 |

### 1.3 Lo scostamento dal piano dell'audit, dichiarato subito

Il §11 della [30](30-golee-easygame-gap-audit.md) metteva **G-18** (account
della famiglia con ciclo di vita) dentro la Wave 2. Il perimetro chiesto per
questa Wave non lo comprende, e **non lo reintroduciamo**.

Va pero detto cosa si perde e cosa no. G-18 vale per due cose: sapere **quanti
account attivi ci sono** e poter **invitare chi non ce l'ha**. La prima meta
arriva comunque, come effetto collaterale onesto dell'audience engine: ogni
anteprima di pubblico dira quante famiglie non hanno email e quante non hanno
account, **con il motivo**, sullo stesso modello gia collaudato dal sollecito
di Wave 1. La seconda meta — invito, revoca, riallineamento — resta aperta, e
va nella futura Parent Wave insieme al resto.

---

## 2 — L'inventario: cosa puo gia fare da innesco

Prima di proporre un motore, ecco cosa esiste. La colonna che conta e
l'ultima: **cosa manca perche possa essere un innesco governato dal club**.

| Sorgente | Proprietario | Come si aziona oggi | Puo essere un trigger? | Cosa manca |
|---|---|---|---|---|
| **Giro lavoro sportivo** | `sport-work-scheduler.ts` | cron `30 3 * * *`, `GET` con `CRON_SECRET` | **Gia lo e**, con preavvisi cablati | Nulla che serva all'utente: **NO ACTION** |
| **Promemoria certificati** | `medical-certificate-reminders.ts` | cron `0 7 * * *` | **Gia lo e** | Interruttore, anticipi, destinatario, testo. E raggiunge **solo chi ha un account nel club** |
| **Generazione allenamenti** | `training-automation.ts` | cron `0 4 * * *` | No: produce dati, non avvisi | — |
| **Manutenzione** | `maintenance.ts` | cron `30 4 * * *` | No: pulisce righe scadute | — |
| **Sollecito insoluti** | `payment-reminders.ts` | **manuale**, dalla scheda «Previsti» di `/movements` | **Si**, ed e il candidato piu maturo | L'innesco automatico e la segmentazione |
| **Notifiche in-app** | modello `Notification` | scritte da 6 punti diversi | E il **canale**, non l'innesco | Nessuna programmazione, nessuna scadenza, nessun allegato |
| **Email** | `src/lib/server/email/` | `sendTransactionalEmail`, `sendPaymentReminderEmail`, `sendNotificationEmails` | E il **canale** | `sendNotificationEmails` dice solo «hai una notifica»: e corretta per un contenuto riservato, inutile per un avviso |
| **Audit** | `audit.ts` + `AUDIT_ACTIONS` | `recordAuditEvent` | E la **traccia**, non l'innesco | Tre azioni nuove |
| **Eventi di pagamento** | `handleGatewayWebhookEvent` + `PaymentWebhookEvent` | webhook firmato, deduplicato | **Si**, ed e l'unico evento vero del prodotto | Nulla: in Wave 2 non serve |
| **Rate** | `installment-ledger.ts` | **derivate**, mai memorizzate (ADR-0036) | Solo come **interrogazione**, mai come evento | — |
| **Certificati** | `medical-certificates.ts` | derivati dalla data | Come interrogazione | — |
| **Allenamenti** | `clubs.trainings` / `club_resource_items` | dati di club | Come interrogazione sulla data | — |
| **Contributi e voucher** | `funding.ts` | request-driven **per scelta** | **No** — vedi §1.2 | — |
| **Documenti condivisi** | `athletes/[id]/documents/route.ts` | notifica scritta dalla rotta | Si, ma «documento mancante» non e definito | Serve prima la nozione di documento **obbligatorio** |
| **Stagioni** | `seasons.ts` | atto della segreteria | Si, per la comunicazione di apertura stagione | In Wave 2 la si manda **a mano**: e gia sufficiente |
| **Moduli** | `form-submissions.ts` | notifica alla compilazione | Gia notifica | — |

**La conclusione dell'inventario, ed e la conclusione che decide la Wave:**

> **In EasyGame non esistono eventi di dominio.** Nessun modulo emette nulla, e
> [ADR-0036](18-decision-log.md) vieta esplicitamente di materializzare lo
> stato derivato — lo stato di una rata **non si imposta, si ricava**.
> Un motore *event-driven* richiederebbe quindi di introdurre prima un bus di
> eventi e delle proiezioni, cioe esattamente la copia dello stato derivato che
> il prodotto ha deciso di non avere.

Quindi il motore giusto per **questo** prodotto e un **valutatore periodico di
regole**: ogni notte, per ogni club, per ogni regola accesa, chiede al
proprietario del dominio «chi rientra oggi in questa condizione?». L'unico
innesco realmente a evento che esiste (il webhook di pagamento) non serve a
nessuna delle automazioni V1.

---

## 3 — Il motore di automazioni: EXTEND o NEW

### 3.1 Il verdetto

**Layer di orchestrazione sopra i proprietari esistenti**, con **due sole
capability nuove**. Non un motore di workflow.

| Componente | EXTEND / NEW | Motivo |
|---|---|---|
| Porta cron e autenticazione | **EXTEND** | `authorizeCronRequest` esiste, e stato reso severo dall'audit di Wave 1, e vale per qualunque schedulatore |
| Giro per club con isolamento dell'errore | **EXTEND** | Il pattern di `runSportWorkSchedulerForAllClubs` e gia quello giusto: un club che fallisce non ferma gli altri e compare nel rapporto **con il suo nome** |
| Valutazione delle condizioni | **EXTEND** | Delega a `buildInstallmentLedgers`, `getMedicalCertificateAvailability`, `club-sites.ts`. Il motore **non interroga mai le rate per conto proprio**: sarebbe la terza interpretazione del denaro che `tests/lib/reports-cash-invariant.test.mjs` esiste per impedire |
| Risoluzione del pubblico | **EXTEND** di cio che nasce in W2-C | Un solo audience engine, condiviso |
| Canali | **EXTEND** | `Notification` per l'in-app, `src/lib/server/email/` per l'email. **Nessun terzo canale**, nessun SMS, nessun WhatsApp |
| Traccia | **EXTEND** | `recordAuditEvent` con azioni nuove |
| **Catalogo delle regole come configurazione** | **NEW** | Non esiste niente di simile. E la capability che il club governa |
| **Registro unico delle consegne** | **NEW** | Sostituisce tre dialetti di deduplica e risponde insieme a «gli ho gia scritto?» e «chi ha ricevuto cosa?» |

**Due capability nuove, non di piu.** E il vincolo che questo documento impone
all'esecuzione, come il §6 della [31](31-wave-1-planning.md) aveva imposto
«11 EXTEND e 1 NEW» alla Wave 1.

### 3.2 Il modello

```
TRIGGER      un tipo dal catalogo CHIUSO, implementato in codice
   ↓         (il club sceglie quale, non ne scrive uno)
CONDITIONS   anticipi (fino a 3) + filtri di ambito (categoria, sede, gruppo)
   ↓
AUDIENCE     risolto dall'audience engine — famiglia, societa, o entrambe
   ↓
CONTENT      modello di messaggio con i segnaposto del catalogo unico
   ↓
ACTION       notifica in-app + email. Nient'altro.
   ↓
DEDUP        chiave deterministica per (regola, soggetto, occorrenza, destinatario)
   ↓
AUDIT        una riga per esecuzione, una riga per invio
```

**Cosa questo modello deliberatamente non ha,** e va scritto perche non venga
aggiunto per abitudine:

- **nessun ramo condizionale** e nessun «se… allora… altrimenti»;
- **nessuna attesa**: una regola non «dorme» in attesa di un evento;
- **nessuna macchina a stati**: un'automazione non ha uno stato proprio, ha
  solo la sua ultima esecuzione;
- **nessun linguaggio per l'utente**: il club non scrive espressioni. Sceglie
  da elenchi;
- **nessuna azione oltre al messaggio**: un'automazione **non** cambia dati.
  Non segna una rata, non scade un certificato, non archivia niente. Il giorno
  in cui lo facesse, un difetto notturno riscriverebbe l'archivio di un club.

### 3.3 Dove vive

| Modulo | Ruolo |
|---|---|
| `src/lib/automations/catalog.ts` | I tipi di trigger, chiusi. Modulo **puro** |
| `src/lib/automations/rules.ts` | Normalizzazione di una regola, validazione degli anticipi, costruzione della chiave di deduplica. **Puro e provabile senza database** |
| `src/lib/automations/digest.ts` | Il raggruppamento del riepilogo giornaliero (G-58). Puro |
| `src/lib/server/automations.ts` | **L'unico scrittore.** Legge le regole, valuta delegando, risolve il pubblico, scrive consegne e notifiche, invia, traccia |
| `src/app/api/v1/automations/route.ts` | `POST` a mano sul club attivo (per vedere subito l'effetto), `GET` da cron su tutti i club. Lo **stesso** schema a due porte gia collaudato da `sport-work/scheduler` |

**Le regole stanno in `club_resource_items`**, tipo `automation_rules`: sono
configurazione di club, e cosi ereditano ambito, `organization_id`, superficie
REST, audit e il proprietario unico `resources.ts` senza una tabella nuova.

**Il registro delle consegne e una tabella nuova**, e va motivata: mettere una
riga per ogni messaggio inviato dentro `club_resource_items` farebbe crescere
senza limite una tabella di configurazione, che e l'esatto contrario di cio per
cui esiste. Forma proposta:

```
communication_deliveries
  id, organization_id
  source_kind      'automation' | 'bulk' | 'board' | 'reminder'
  source_id        regola, comunicazione o annuncio
  dedup_key        deterministica: chi, per cosa, per quale occorrenza
  recipient_key    email normalizzata — la chiave gia scelta in Wave 1
  recipient_user_id?  quando esiste un account
  athlete_id?      la posizione a cui il messaggio si riferisce
  channel          'email' | 'in_app' | 'board'
  status           'sent' | 'skipped' | 'failed'
  reason?          il motivo, dall'enum chiusa
  read_at?         serve alla bacheca
  created_at
  UNIQUE (organization_id, dedup_key, recipient_key, channel)
```

**Un solo indice unico fa tre lavori:** impedisce il doppione, risponde a «chi
ha ricevuto cosa» (G-07) e regge il letto/non letto della bacheca (G-08). E la
ragione per cui questa tabella sta nella lane dell'audience e non in quella
delle automazioni.

---

## 4 — Le prime automazioni

Sono **quattro** regole piu una modalita di consegna. Non undici, e non
trentaquattro.

### 4.1 V1

| ID | Regola | Innesco | Anticipi predefiniti | Pubblico | Perche e V1 |
|---|---|---|---|---|---|
| **AUT-01** | **Rata in scadenza** | residuo > 0 e scadenza fra N giorni | 7 e 3 giorni prima | famiglia | E il lavoro manuale piu grande dell'anno, e il residuo lo sa gia calcolare il registro |
| **AUT-02** | **Rata scaduta** | residuo > 0 e scadenza passata da N giorni | 1 e 15 giorni dopo | famiglia (+ riepilogo alla societa) | E il sollecito di Wave 1, che smette di dipendere da qualcuno che si ricorda di premere |
| **AUT-03** | **Certificato medico** | mancante, in scadenza o scaduto | 30, 7 e 0 giorni | famiglia + societa | **Esiste gia e gira**: la Wave gli aggiunge interruttore, anticipi, testo e — importante — la **raggiungibilita per indirizzo**, non solo per account |
| **AUT-04** | **Richiesta di conferma per l'evento** | evento fra N ore con RSVP richiesto | 48 ore prima | famiglia | E il messaggio che rende utile G-20: senza invito, l'RSVP e una schermata che nessuno apre |

Piu, trasversale a tutte:

| ID | Modalita | Contenuto |
|---|---|---|
| **AUT-D** | **Riepilogo giornaliero** (G-58) | Per il pubblico «societa»: una email al giorno con tutto, invece di trenta. Scelta **per club**, non per regola: trenta email al giorno non si leggono, e il difetto non e della singola regola |

### 4.2 V1.1

| Regola | Perche non ora |
|---|---|
| **Documento mancante** | «Mancante» non e definito: non esiste una nozione di documento **obbligatorio**. E una decisione di modello dati (G-17 consenso, G-30 tesseramento), non di messaggistica. Costruirla adesso significherebbe inventare qui il concetto e poi rifarlo |
| **Convocazione** | La convocazione vive dentro il payload di `matches` sotto **nove grafie diverse** — `calledAthletes`, `selectedAthletes`, `roster`, `lineup`, `convocations`… — che `parent-dashboard.ts` normalizza a valle. Una regola non puo innescarsi su un dato che non ha una forma. Prima serve dare una forma alla convocazione |
| **Comunicazione di stagione** | In V1 la si manda **a mano** con la comunicazione massiva, che c'e. Automatizzarla richiede di decidere cosa fa il sistema quando la segreteria apre la stagione e poi la corregge |
| **Tesseramento in scadenza** (G-53) | Bloccata da G-30 |
| **Allenamento imminente** come promemoria a se | Un giro notturno non puo dire «fra due ore», e «domani hai allenamento» su un calendario settimanale fisso e esattamente il rumore che fa smettere di leggere i messaggi. Ha senso **solo** come portante dell'RSVP (AUT-04) |

### 4.3 NO ACTION, e va detto perche

| Regola chiesta | Verdetto | Motivo |
|---|---|---|
| **Contratto in scadenza** | **NO ACTION** | `sport-work-scheduler` lo fa gia a 7 giorni. Migrarlo sul motore nuovo e un refactor con **zero** guadagno per l'utente e rischio non nullo su un dominio che tocca denaro in uscita |
| **Adempimento lavoro sportivo** | **NO ACTION** | Idem, a 14 giorni |
| **Voucher / presenze** | **NO ACTION** | La maturazione e request-driven per una ragione scritta: automatizzarla ricalcolerebbe periodi gia liquidati |

---

## 5 — Il link di pagamento sicuro (G-06)

### 5.1 La decisione che conta: token in archivio, non token firmato senza stato

Il riflesso naturale e un JWT firmato che porta dentro club, rata e scadenza.
**E la scelta sbagliata qui**, e vale la pena dire perche prima di descrivere
il resto.

1. Il requisito include **revocabile**. Un token senza stato si revoca solo con
   una lista di revoca, cioe con una riga in archivio: e un token in archivio
   con un passaggio in piu.
2. Il requisito include **auditabile**. «Chi ha aperto questo link e quando»
   richiede comunque una riga.
3. Un token che **non porta claim** non e manomettibile: non c'e niente da
   manomettere. Trentadue byte casuali non dicono ne il club ne la rata, quindi
   **non espongono nessun identificativo interno** — che e il primo requisito
   della lista.
4. Il prodotto ha gia **due precedenti** di questa forma: lo slug pubblico dei
   moduli (`public_slug` casuale + `public_enabled` per spegnerlo) e il token
   genitore. Introdurre un terzo meccanismo di forma diversa sarebbe un
   dialetto in piu.

A riposo il token si conserva **hashato**, come `code_hash` delle sfide OTP e i
token di reset password: chi legge il database non ottiene link funzionanti.

### 5.2 La forma

```
payment_links
  id, organization_id
  payment_id            la rata. Non un importo libero
  athlete_id
  token_hash            SHA-256 del token; il token in chiaro esiste solo nel messaggio
  expires_at            default 30 giorni
  revoked_at?
  created_by            chi lo ha emesso
  last_used_at?, use_count
  UNIQUE (token_hash)
  INDEX (organization_id, payment_id)
```

Superficie:

- `GET /pay/[token]` — pagina pubblica: nome del club, atleta, quanto resta,
  scadenza, pulsante;
- `POST /api/public/payment-links/[token]/checkout` — apre il checkout.

### 5.3 Le dieci regole del riscatto

1. **Il residuo si ricalcola adesso**, da `buildInstallmentLedgers`. L'importo
   **non** viene congelato nel link: una famiglia che paga allo sportello e poi
   apre il link non deve pagare due volte.
2. **Rata gia saldata → una pagina che lo dice**, non un errore. E il caso piu
   frequente in assoluto, ed e una buona notizia.
3. **Pagamento parziale ammesso**, perche il prodotto lo ammette gia
   (ADR-0036). Il canale del link non puo essere piu rigido dello sportello.
4. **Quindi il link e multi-uso fino a scadenza**, non monouso: monouso
   romperebbe il secondo acconto.
5. **Token sconosciuto, scaduto o revocato rispondono la stessa cosa.** Mai
   «questo link e scaduto per il club X»: distinguere i casi dice a chi prova
   token a caso quando ha indovinato.
6. **Confronto a tempo costante** sull'hash, come `secretsMatch` in
   `cron-auth.ts`.
7. **Rate limit** per token e per IP, su `AuthRateLimitBucket`, che esiste gia
   e viene gia ripulito dalla manutenzione notturna.
8. **Il checkout e `openGatewayCheckout`**, con `actorUserId: null`. Non un
   secondo percorso di pagamento: **lo stesso**, comprese la chiave di
   idempotenza, la commissione e il webhook che registra l'incasso.
9. **L'entitlement vale anche qui.** Se il club non ha `online_payments`, il
   link **non si emette** e il sollecito lo dice in anteprima. Un messaggio non
   deve promettere un pagamento che il club non puo incassare.
10. **Tre azioni di audit**: `payment.link.issued`, `payment.link.opened`,
    `payment.link.revoked`. La prima ha un attore, la seconda no.

### 5.4 Compatibilita con Stripe Checkout

Verificata sul codice: `openGatewayCheckout` ha bisogno di
`organizationId`, `paymentId`, `amountCents`, `description`, `successUrl`,
`cancelUrl` e un `payer` facoltativo. **Tutti derivabili dal server** a partire
dalla riga del link. Nulla in `payment-gateway.ts` presuppone una sessione: la
sessione la pretende la **rotta**, non il dominio. Il vincolo che resta e
operativo, non tecnico: `R-16` dice che nessun checkout e mai passato da Stripe
davvero, quindi la UAT di questa lane va fatta **in sandbox con credenziali di
prova**, e non si dichiara chiusa senza.

---

## 6 — L'audience engine

Il componente condiviso. Piccolo, puro dove puo esserlo, con un solo
proprietario.

```
src/lib/audience/criteria.ts   criteri, normalizzazione, unione. PURO
src/lib/audience/recipients.ts deduplica, motivi di esclusione. PURO
src/lib/server/audience.ts     l'unico lettore: risolve un criterio in persone
```

**Ingresso**

```ts
{ organizationId, criteria: AudienceCriteria[], audienceRole: "family" | "club" }
```

Criteri, **enum chiusa** — un criterio nuovo si dichiara qui, non si inventa
dove serve:

`all_families` · `category_ids` · `group_ids` (gruppo operativo) · `site_ids` ·
`athlete_ids` · `staff_roles` · `overdue_payments` ·
`certificate_missing_or_expiring` · `no_account`

**Uscita — l'insieme canonico**

```ts
{
  recipients: [{
    key,            // email normalizzata: la chiave gia scelta in Wave 1
    name, email,
    userId | null,  // c'e l'account? decide il canale in-app
    positions: [{ athleteId, athleteName, guardianId }]
  }],
  excluded: [{ athleteId, guardianId, reason }],
  counts: { recipients, positions, excluded },
}
```

**Le cinque regole del risolutore**

1. **Una email, un messaggio.** La stessa email associata a piu persone
   riceve **un** messaggio che elenca tutte le posizioni. Due messaggi allo
   stesso indirizzo per due figli sono il difetto che una famiglia nota per
   prima. La chiave e l'indirizzo normalizzato, non l'account: e la scelta gia
   presa in [ADR-0078](18-decision-log.md), e va tenuta.
2. **Chi non si raggiunge compare, con il motivo.** L'enum estende quella gia
   in `payment-reminders.ts`: `no_guardian`, `no_email`, `no_account`, piu
   `duplicate` e `already_sent`. Un invio che non raggiunge nessuno **non e un
   successo**.
3. **Due politiche di raggiungibilita diventano una.** Oggi il promemoria
   certificati raggiunge **solo chi ha un account nel club**
   (`resolveGuardianRecipientIds` filtra su `organization_users`), mentre il
   sollecito raggiunge **anche chi ha solo un indirizzo**. Il secondo e il
   comportamento giusto: e nella Wave 2 che la differenza sparisce.
4. **Il perimetro e il club attivo.** Vale la stessa regola scritta in
   `payment-reminders.ts`: il ruolo con cui si decide e il club su cui si opera
   devono parlare dello **stesso** club, altrimenti chi e proprietario del
   proprio club e genitore in un altro leggerebbe gli indirizzi del secondo.
5. **L'anteprima e l'invio usano la stessa funzione.** Due risolutori
   diverrebbero due elenchi diversi alla prima modifica.

**Obbligo di consolidamento, dichiarato qui perche non sembri refactoring
opportunistico** (CLAUDE.md §3): `payment-reminders.ts` **deve** essere portato
sopra l'audience engine, in un commit proprio della lane W2-C, con un test
strutturale che vieti una seconda risoluzione del pubblico. Non e «gia che
c'ero»: e la condizione perche la Wave non lasci due audience resolver.

**Chi lo riutilizza:** solleciti · automazioni · comunicazione massiva ·
bacheca · invito RSVP. Cinque consumatori: e la prova che il componente va
scritto una volta e per primo.

---

## 7 — La comunicazione massiva (G-07)

**Cosa esiste gia** — e da qui si parte, non da zero: anteprima a due elenchi
con il motivo dell'irraggiungibilita, invio per indirizzo anche senza account,
esito **per destinatario**, idempotenza per rivendicazione, riga di audit. E
tutto in `payment-reminders.ts`, ed e buono. Manca che sia generale.

**Cosa si sviluppa**

1. Una comunicazione: oggetto, corpo con segnaposto, allegato facoltativo,
   pubblico per criteri.
2. **Anteprima obbligatoria** prima dell'invio: quanti raggiungo, quanti no e
   perche, e **il messaggio come lo leggera il primo destinatario** — con i
   segnaposto risolti su una persona vera.
3. Invio con esito per destinatario e **fallimento parziale che non annulla il
   resto**: chi e partito e partito.
4. Registro: `communication_deliveries` risponde a «chi ha ricevuto cosa,
   quando, su quale canale, e se no perche».

**Canali V1: email e notifica in-app. Nient'altro.** L'entitlement
`sms_notifications` esiste gia nel catalogo (area «comunicazione», sbloccato da
un servizio extra) e **non ha nessun provider dietro**: aggiungerlo e una
decisione commerciale separata, non un dettaglio di questa Wave. WhatsApp non
e nel catalogo affatto.

**Il limite di volume va deciso, non scoperto.** L'invio e sincrono dentro una
richiesta HTTP: su Vercel, un pubblico di 400 famiglie contro un SMTP lento
supera il tempo massimo di una funzione. Due opzioni, e la Wave ne sceglie una
**prima** di scrivere il codice: (a) invio a lotti con ripresa idempotente
guidata da `communication_deliveries` — l'indice unico rende sicura la
ripetizione; (b) tetto dichiarato per invio, con l'interfaccia che lo dice.
**Raccomandazione: (a)**, perche (b) sposta il problema sull'utente e il
registro delle consegne rende (a) quasi gratuita.

---

## 8 — La bacheca (G-08)

**Cosa serve davvero,** verificato contro il modello esistente:

| Elemento | Serve? | Perche |
|---|---|---|
| Comunicazione pubblicata che **resta** | **Si** | E l'intera differenza con la notifica: `/notifications` mostra 6 giorni e 50 righe |
| Destinatari mirati | **Si** | Riusa l'audience engine. Un avviso della Under 14 non riguarda tutti |
| Allegato | **Si** | Il modulo del torneo, il calendario in PDF. Attachment Core, `owner_type: "announcement"` |
| Bozza / pubblicato | **Si** | Si scrive in due momenti |
| Pubblicazione programmata | **Si** | «Esce lunedi alle 8». Costa un passo nel giro notturno, ed e la ragione per cui la bacheca **dipende dal cron di W2-A** |
| Scadenza | **Si**, come **filtro** | Un avviso scaduto non si cancella: smette di comparire in cima. Cancellarlo perderebbe la prova di averlo pubblicato |
| Letto / non letto | **Si** | Riga in `communication_deliveries` con `read_at`, `channel: "board"` |
| Feed di notizie | **No** | Un club non produce notizie ogni giorno. Un elenco per data e sufficiente |
| Commenti, reazioni, thread | **No** | Aprirebbero una moderazione che nessuno ha chiesto e che nessuno presidia |

**Non e un social network.** Un annuncio ha un autore, dei destinatari, una
finestra di validita e nessuna conversazione.

---

## 9 — L'RSVP (G-20)

### 9.1 L'invariante, che merita un ADR

> **L'RSVP e un'intenzione dichiarata dalla famiglia. La presenza e un fatto
> registrato dall'allenatore. Vivono sulla stessa riga e non si scrivono mai a
> vicenda.**

Se un «si» della famiglia scrivesse `status = "present"`, la misura presenze
dei bandi (`src/lib/funding/attendance-measure.ts`) conterebbe come frequenza
una promessa, e un contributo pubblico verrebbe rendicontato su un dato che
nessuno ha verificato. Non e un rischio teorico: e la funzione che oggi legge
quella tabella.

### 9.2 La forma

`training_attendance` esteso — **non** una seconda tabella:

```
+ rsvp_status        'yes' | 'no' | 'maybe' | null
+ rsvp_note          nota facoltativa della famiglia
+ rsvp_at            quando ha risposto
+ rsvp_by_user_id    chi ha risposto
+ UNIQUE (organization_id, training_id, athlete_id)
```

La chiave unica **manca oggi**, e `simplified-db.ts` compensa cancellando a
mano le righe duplicate dopo averle trovate. Con l'RSVP che scrive sulla stessa
riga, un duplicato significa due risposte contraddittorie: la migrazione deve
deduplicare prima e poi imporre il vincolo.

`maybe` esiste **solo se l'evento lo prevede**: la scadenza di conferma e la
disponibilita del «forse» stanno sull'evento, non sulla riga di risposta.

### 9.3 Il percorso

```
evento con RSVP richiesto e scadenza
   → AUT-04 invita la famiglia (48 ore prima)
   → la famiglia risponde da /parent-view/[id]/trainings: si / no / forse + nota
   → puo cambiare risposta finche la scadenza non passa
   → l'allenatore vede tre numeri e un elenco: SI, NO, SENZA RISPOSTA
   → il giorno dell'evento fa l'appello, che scrive `status` e non tocca l'RSVP
```

### 9.4 I confini

- **Allenamenti: si.** Sono l'evento che esiste, ha una data e ha
  `training_attendance`.
- **Partite e convocazioni: V1.1.** La convocazione non ha una forma (nove
  grafie). Darle una forma e un lavoro proprio, non un dettaglio dell'RSVP.
- **Risposta da link senza account: V1.1.** Riuserebbe il meccanismo di token
  di W2-B. Va segnalata come riuso possibile, **non** costruita ora: sarebbe la
  seconda superficie pubblica della Wave.
- **`AttendanceConfirmation.tsx`: si rimuove.** Il suo comportamento —
  `localStorage`, nessun server — e l'opposto del requisito, e tenerlo darebbe
  l'impressione che la funzione esista. Va nella pulizia QA di fine Wave, con
  la prova che nessuno lo importa. La sua **forma visiva** (radio + nota +
  conferma) e buona e si riusa.

---

## 10 — Il confine con l'area genitore

**La Parent UAT resta fuori scope.** La Wave 2 costruisce backend e superfici
condivise, non l'esperienza della famiglia.

**Cosa la Wave 2 costruisce, e che la futura Parent Wave consumera:**

| Superficie | Chi la usera |
|---|---|
| Audience engine con motivi di esclusione | l'invito e il censimento degli account (G-18) |
| `communication_deliveries` | «cosa ho ricevuto», storico famiglia |
| Dominio e API dell'RSVP | la schermata famiglia definitiva |
| API di lettura della bacheca | la bacheca lato famiglia |
| `/pay/[token]` e `payment_links` | il pagamento da sollecito, e domani da promemoria |
| Modelli di messaggio con segnaposto | qualunque messaggio verso la famiglia |

**Cosa la Wave 2 non tocca:** la struttura di `/parent-view`, l'onboarding
della famiglia, il ciclo di vita dell'account (G-18), l'applicazione dedicata
(G-59, differita da ADR-0025). Gli unici interventi su `/parent-view` sono
**due schermi**: rispondere all'RSVP e leggere la bacheca. Se durante
l'esecuzione una lane si trova a ridisegnare l'area genitore, ha superato il
confine e deve fermarsi.

---

## 11 — I permessi

Modello gia collaudato: `src/lib/sport-work/permissions.ts` e
`src/lib/seasons/permissions.ts`. **Default negato, nessun ruolo nuovo, il
perimetro si delega a `access-roles.ts` invece di ricopiarlo** — l'errore che
l'audit di Wave 1 ha trovato in `seasons/permissions.ts` e che non va ripetuto.

| Permesso | Chi | Cosa |
|---|---|---|
| `communications.send` | owner, club_manager | Creare e inviare una comunicazione |
| `communications.read_recipients` | owner, club_manager | Vedere l'elenco **nominativo** dei destinatari e degli esclusi |
| `automations.manage` | owner, club_manager | Creare, modificare, accendere e spegnere una regola |
| `board.publish` | owner, club_manager | Pubblicare in bacheca |
| `board.read` | tutti i ruoli del club | Leggere la bacheca destinata a se |
| `rsvp.read` | owner, club_manager, **trainer** | Leggere le risposte, **limitato ai propri gruppi operativi** per l'allenatore |
| `rsvp.answer` | parent (e athlete maggiorenne) | Rispondere per il proprio atleta |

**La regola sui dati economici, resa concreta.** Non basta dire «l'allenatore
non vede i dati economici»: la porta da chiudere e il **criterio**, non la
pagina.

- Il criterio `overdue_payments` nell'audience **richiede**
  `canManageClubConfiguration`: e un elenco di famiglie in arretrato, che e un
  dato economico anche se nessun importo compare a schermo.
- Un modello di messaggio che contiene segnaposto di importo o di residuo
  richiede lo stesso permesso per essere **inviato**, non solo scritto.
- Le automazioni AUT-01 e AUT-02 sono governabili solo da chi ha
  `automations.manage`, che ha gia quel perimetro.
- `rsvp.read` per un allenatore e limitato ai suoi gruppi: la regola di ambito
  esiste gia in `trainer-utils.ts` (ADR-0055) e si riusa.

**Il diniego dice sempre il motivo** (N-02): «non hai il permesso» e «il tuo
piano non comprende» sono due cause con due rimedi, e non devono avere lo
stesso messaggio.

---

## 12 — I workstream paralleli

La divisione proposta nel perimetro iniziale e **quasi** quella giusta. Due
scostamenti, entrambi dettati dall'ownership reale:

1. **Il registro delle consegne va con l'audience (W2-C), non con le
   automazioni (W2-A).** Deduplica e «chi ha ricevuto cosa» sono la stessa
   tabella, e chi definisce un destinatario e la lane C. Se stesse in A, la
   comunicazione massiva dipenderebbe dal motore di automazioni per una cosa
   che non c'entra.
2. **Il contenuto con segnaposto merita una lane propria (W2-F).** Lo
   consumano A e C, e nessuna delle due lo possiede. Lasciarlo dentro una delle
   due significa che l'altra aspetta, o che ne nasce una seconda copia.

| Lane | Contenuto | Domain owner | File probabili | Dipende da | Conflitti | Eff. | Rischio |
|---|---|---|---|---|---|---|---|
| **W2-F** — Contenuto e segnaposto | Modelli di messaggio, estensione del catalogo a importi e scadenze, anteprima su destinatario vero | `src/lib/documents/placeholders.ts` (esteso) | `documents/placeholders.ts`, `server/document-placeholders.ts`, `lib/messages/` | — | Nessuno | **M** | MEDIO |
| **W2-C** — Audience + comunicazione massiva | Audience engine, `communication_deliveries`, invio massivo, **migrazione del sollecito** | `server/audience.ts`, `server/communications.ts` | `lib/audience/**`, `server/communications.ts`, `server/payment-reminders.ts`, migrazione 1 | W2-F per il contenuto | `payment-reminders.ts` (con W2-A) · `CLUB_RESOURCE_TYPES` | **L** | ALTO |
| **W2-B** — Link di pagamento | `payment_links`, `/pay/[token]`, rotta pubblica, revoca, audit | `server/payment-links.ts` | `server/payment-links.ts`, `app/pay/**`, `app/api/public/payment-links/**`, migrazione 2 | W2-F solo per il segnaposto `{{link_pagamento}}` | Nessuno sul codice | **M** | ALTO |
| **W2-A** — Motore di automazioni | Catalogo regole, valutatore, cron, quattro regole V1, riepilogo giornaliero | `server/automations.ts` | `lib/automations/**`, `server/automations.ts`, `app/api/v1/automations/**`, `vercel.json` | W2-C (audience + registro), W2-F | `vercel.json` · `payment-reminders.ts` · `CLUB_RESOURCE_TYPES` | **L** | ALTO |
| **W2-D** — Bacheca | Annunci, allegati, programmazione, scadenza, letto/non letto | `club_resource_items` via `resources.ts` | `server/announcements.ts`, `app/**`, Attachment Core | W2-C (pubblico + registro), W2-A (cron per la programmazione) | `CLUB_RESOURCE_TYPES` | **M** | BASSO |
| **W2-E** — RSVP | Colonne, chiave unica, API risposta, vista «senza risposta», rimozione del bozzetto | `training_attendance` | `server/rsvp.ts`, `parent-view/**`, `trainer-dashboard/**`, migrazione 3 | W2-C solo per l'invito (AUT-04) | Nessuno | **M** | MEDIO |

**Chi puo partire nello stesso momento:** **W2-F, W2-C, W2-B e la parte di
dominio di W2-E** partono insieme il primo giorno. W2-A parte quando W2-C ha
consegnato audience e registro. W2-D parte quando W2-A ha la porta cron.

**Il conflitto vero da governare sono le migrazioni.** Tre lane ne producono
una ciascuna (`payment_links`, `communication_deliveries`, colonne di
`training_attendance`). Prisma le ordina per timestamp: se due lane le creano
in parallelo e si uniscono in ordine diverso, `prisma migrate status` diverge
fra sviluppo e staging. **Regola della Wave: ogni lane possiede esattamente una
migrazione, e la crea al momento del merge, non prima.**

Il secondo conflitto e minuscolo e prevedibile: tre lane aggiungono una stringa
al medesimo array `CLUB_RESOURCE_TYPES` in `resources.ts`. Si risolve
sequenziando, non coordinando.

---

## 13 — Il DAG delle dipendenze e l'ordine di merge

```
                    ┌──────────────┐
                    │    W2-F      │  contenuto e segnaposto
                    │  (nessuna    │
                    │  dipendenza) │
                    └──────┬───────┘
                           │
        ┌──────────────────┼───────────────────────┐
        │                  │                       │
        ▼                  ▼                       ▼
  ┌───────────┐     ┌─────────────┐          ┌───────────┐
  │   W2-B    │     │    W2-C     │          │   W2-E    │
  │ link pag. │     │  audience   │          │  RSVP     │
  │           │     │  + registro │          │ (dominio) │
  └───────────┘     └──────┬──────┘          └─────┬─────┘
                           │                       │
                  ┌────────┴────────┐              │
                  ▼                 ▼              │
            ┌───────────┐    ┌───────────┐         │
            │   W2-A    │    │   W2-D    │◄────────┘
            │ automaz.  │───▶│  bacheca  │   (invito RSVP = AUT-04,
            │  + cron   │    │(programm.)│    prodotto da W2-A)
            └───────────┘    └───────────┘
```

**Le dipendenze reali, una per una**

| Da | A | Perche |
|---|---|---|
| W2-F → W2-C | il corpo della comunicazione usa i segnaposto |
| W2-F → W2-A | il testo di una regola usa i segnaposto |
| W2-F → W2-B | il solo segnaposto `{{link_pagamento}}`. Dipendenza **debole**: W2-B puo svilupparsi tutta e agganciarsi in coda |
| W2-C → W2-A | il motore risolve il pubblico con l'audience engine e deduplica sul registro. **E la dipendenza forte della Wave** |
| W2-C → W2-D | il pubblico di un annuncio e lo stesso oggetto |
| W2-C → W2-E | solo per l'invito. Il dominio RSVP e indipendente |
| W2-A → W2-D | la pubblicazione programmata ha bisogno del giro notturno |
| **W2-B ⟂ tutto** | il link di pagamento e **indipendente**: puo essere sviluppato, collaudato e rilasciato da solo |

**Ordine di merge: F → B → C → E → A → D.**

`B` subito dopo `F` perche e indipendente e ad alto rischio: va in mano al
collaudo il prima possibile. `C` prima di `A` e `D` perche entrambe ne
dipendono. `E` prima di `A` perche AUT-04 invita a rispondere a qualcosa che
deve gia esistere.

---

## 14 — Pre-production challenge

Per ogni gap: **serve davvero prima della produzione?** La risposta onesta,
anche quando toglie lavoro alla Wave.

| Gap | Classificazione | Motivazione |
|---|---|---|
| **G-05** contenuto configurabile | **IMPORTANT** | Un club che non puo scrivere con le sue parole continua a usare WhatsApp, e il dato resta fuori. E la ragione per cui G-07 non basta da solo |
| **G-06** link di pagamento | **IMPORTANT**, con una nota che pesa | La descrizione dell'entitlement `online_payments` **promette gia** che «la famiglia paga la quota dal link». O il link esiste, o quella riga di catalogo va corretta prima di vendere un piano `plus`. Non e un blocker del prodotto: e un blocker della **promessa** |
| **G-07** segmentazione | **IMPORTANT** | Il minimo indispensabile (PP-4) l'ha gia dato la Wave 1. Il resto e cio che evita il ritorno a Excel entro la prima settimana |
| **G-03/04** automazioni | **V1.1** | Il promemoria che davvero blocca un atleta — il certificato — **gia parte da solo** dalla Wave 1. Quello che manca e il governo del club, che e importante ma non impedisce di operare |
| **G-58** riepilogo giornaliero | **V1.1** | Ha senso solo quando ci sono abbastanza automazioni da produrre rumore |
| **G-08** bacheca | **V1.1** | Un annuncio si puo mandare come comunicazione massiva. Meno comodo, non impossibile |
| **G-20** RSVP | **V1.1** | Nessuna operazione del club si ferma senza. E la funzione che da un motivo alla famiglia per aprire l'applicazione — che e strategico, non bloccante |
| **G-35** sollecito ai senza risposta | **POST-V1** | Diventa un criterio in piu quando esistono audience e RSVP |
| **G-53** avvisi tesseramento | **POST-V1** | Bloccato da G-30 |

### Il verdetto, ed e scomodo

**In questa Wave non c'e nessun BLOCKER di produzione.** I blocker restano
quelli gia noti e fuori dal codice: **G-02** (ambiente di produzione, cioe X-1)
e **G-22** (error tracking). Chi pianifica non deve poter dire il contrario per
giustificare la Wave.

**Allora perche farla adesso, e perche farla intera?** Per una ragione sola, e
va scritta: **cinque funzioni diverse hanno bisogno dello stesso pezzo.**
Solleciti, automazioni, comunicazione massiva, bacheca e invito RSVP chiedono
tutte «chi sono i destinatari, chi non raggiungo, e perche». Costruirle in cinque
momenti diversi significa costruire l'audience engine tre volte e accorgersene
alla quarta — che e esattamente il difetto storico di questo repository
(CLAUDE.md §11, punto 1). Farle insieme lo costruisce **una volta**.

Se la Wave dovesse essere ridotta, l'ordine in cui si taglia e:
**prima W2-D**, poi **W2-A**, poi **W2-E**. Non si taglia **W2-C**, perche e
il pezzo che gli altri riusano. **W2-B** si taglia solo insieme alla promessa
del catalogo entitlement.

---

## 15 — La UAT, decisa prima dello sviluppo

Come in Wave 1: gli scenari si scrivono **adesso**, prima del codice, e
diventano `scripts/wave-2-*-uat.mjs`. Su **database di sviluppo**, su HTTP
reale con sessione vera, con pulizia finale verificata a zero.

### 15.1 Automazioni

| # | Scenario | Esito atteso |
|---|---|---|
| A1 | Regola AUT-01 accesa, una rata che scade fra 7 giorni | Un messaggio, una riga in `communication_deliveries`, una notifica |
| A2 | **Secondo giro nello stesso giorno** | **Zero** nuovi messaggi. L'idempotenza e il requisito, non un dettaglio |
| A3 | **Cron invocato due volte in parallelo** | Zero doppioni: lo garantisce l'indice unico, non un controllo applicativo |
| A4 | Anticipi 7 e 3, rata a 7 giorni, poi lo stesso giro tre giorni dopo | Due messaggi in totale, uno per anticipo, mai due per lo stesso anticipo |
| A5 | Anticipo gia trascorso quando la regola viene accesa | **Nessun recupero all'indietro** |
| A6 | Regola spenta | Zero messaggi, e il rapporto lo dice |
| A7 | **Due club, uno con dati corrotti** | Il club sano riceve; il club rotto compare nel rapporto **con il suo nome** e non ferma gli altri |
| A8 | **Multi-tenant**: due club con la stessa email di tutore | Due messaggi distinti, ciascuno con i soli dati del proprio club. **Nessun dato dell'uno nell'altro** |
| A9 | SMTP non configurato | `status: "failed"`, motivo esplicito, **nessun conteggio ottimista** |
| A10 | Riepilogo giornaliero attivo, 12 scadenze | **Una** email alla societa, 12 righe dentro |
| A11 | Cron senza `CRON_SECRET` / con `Bearer` sbagliato | `503` / `401`. Mai `200` a vuoto |

### 15.2 Comunicazione massiva

| # | Scenario | Esito atteso |
|---|---|---|
| C1 | 1 destinatario | Inviato, registrato, tracciato |
| C2 | **100+ destinatari** | Tutti raggiunti; tempo misurato; se serve il lotto, la ripresa non duplica |
| C3 | Destinatario **senza email** | Compare fra gli esclusi con `no_email`, **prima** dell'invio |
| C4 | **Stessa email su due atleti** | **Un** messaggio, due posizioni dentro |
| C5 | Filtro per **gruppo operativo** | Solo gli atleti del gruppo. Verificato contro `getAthleteGroupIds` |
| C6 | Filtro per **sede** | Solo gli atleti della sede |
| C7 | Filtro **insoluti** con ruolo allenatore | **403**, con «Accesso negato» nel messaggio |
| C8 | **Fallimento parziale** (un indirizzo rifiutato) | Gli altri partono; il rifiutato risulta `failed` con il motivo |
| C9 | Anteprima e invio a distanza di minuti | Stesso elenco, o la differenza e dichiarata |
| C10 | **Cross-tenant**: club A tenta il pubblico del club B | **403**. Il perimetro e il club attivo |

### 15.3 Link di pagamento

| # | Scenario | Esito atteso |
|---|---|---|
| P1 | Link valido, rata scoperta | Checkout Stripe **sandbox** aperto, importo = residuo |
| P2 | Link **scaduto** | Pagina neutra. Nessun dato del club, nessun identificativo |
| P3 | Token **manomesso** (un carattere cambiato) | Stessa risposta di P2. Indistinguibile |
| P4 | Link del club A usato mentre si e loggati nel club B | Irrilevante: la rotta e pubblica e non legge la sessione. Il club lo dice la riga |
| P5 | **Rata gia saldata** | Pagina che dice «gia saldata». **Non** un errore |
| P6 | **Pagamento parziale**, poi riapertura dello stesso link | Il residuo aggiornato, e una **nuova** sessione di checkout (la chiave di idempotenza cambia con l'incassato) |
| P7 | Link **revocato** | Come P2 |
| P8 | Club **senza** l'entitlement `online_payments` | Il link **non viene emesso**, e il sollecito lo dichiara in anteprima |
| P9 | 50 tentativi con token casuali | Rate limit, e nessuna differenza di risposta fra i casi |
| P10 | Webhook dopo il pagamento da link | Incasso registrato **una volta**, con `payment_id` corretto |

### 15.4 Bacheca

| # | Scenario | Esito atteso |
|---|---|---|
| B1 | Creazione bozza | Non visibile a nessun destinatario |
| B2 | Pubblicazione con pubblico «Under 14» | Visibile ai soli genitori di quella categoria |
| B3 | Pubblicazione **programmata** a domani | Invisibile oggi; il giro notturno la pubblica; il **secondo** giro non la ripubblica |
| B4 | **Scadenza** passata | Fuori dall'elenco corrente, **ancora in archivio** |
| B5 | Lettura | `read_at` scritto una volta; una seconda apertura non lo sposta |
| B6 | Allegato | Scaricabile solo dai destinatari; **403** per gli altri; nessun URL pubblico |
| B7 | Cross-tenant | Un annuncio del club A non compare mai nel club B |

### 15.5 RSVP

| # | Scenario | Esito atteso |
|---|---|---|
| R1 | Risposta «si» | `rsvp_status = 'yes'`, `status` (presenza) **invariato** |
| R2 | Risposta «no» con nota | Nota salvata, visibile allo staff |
| R3 | **Cambio risposta** prima della scadenza | Una sola riga, aggiornata, con `rsvp_at` nuovo |
| R4 | Cambio **dopo** la scadenza | Rifiutato, con il motivo |
| R5 | **Doppio invio** simultaneo | Una riga sola: lo garantisce la chiave unica |
| R6 | Evento **cancellato** | L'RSVP non si perde e non si mostra come pendente |
| R7 | **Cross-tenant**: genitore del club A risponde per un atleta del club B | **403** |
| R8 | L'allenatore fa l'appello | `status` scritto, `rsvp_status` **non toccato** |
| R9 | Vista staff | Tre numeri corretti: si, no, **senza risposta** |
| R10 | Misura presenze dei bandi dopo un RSVP «si» senza appello | La frequenza **non cambia**. E l'invariante del §9.1 |

---

## 16 — L'audit obbligatorio di fine Wave

Stesso standard della Wave 1. Nessuna voce e facoltativa.

| # | Verifica | Criterio di superamento |
|---|---|---|
| 1 | **UAT a runtime** | Tutti gli scenari del §15, con lo script nel repository e l'esito nel documento 34 |
| 2 | **Audit indipendente** | Chi non ha scritto la lane la rilegge, con EXTEND vs NEW ricontato sul codice davvero scritto |
| 3 | **Seconda revisione** | Come in Wave 1: la prima revisione lascia sempre qualcosa |
| 4 | **Sicurezza** | La superficie pubblica `/pay/[token]` con attenzione dedicata: enumerazione, tempi di risposta, rate limit, assenza di identificativi interni. Piu: nessuna `password_hash`, nessun token, nessun codice OTP in nessuna risposta |
| 5 | **Multi-tenant** | Ogni lettura nuova con `organization_id`; ogni `organization_id` dal client passa da `ensureOrganizationAccess` |
| 6 | **Prestazioni** | L'invio a 100+ destinatari misurato; il giro notturno misurato su piu club; nessuna query per riga dentro un ciclo |
| 7 | **Responsivita** | Le schermate nuove a 375, 768 e 1280 px, **VISUAL** e non solo **STRUCTURAL** (la distinzione e quella del commit `d59b2f6`) |
| 8 | **Pulizia QA** | `AttendanceConfirmation.tsx` rimosso con la prova; nessun secondo audience resolver; nessun secondo punto di invio |
| 9 | **Gap matrix aggiornata** | Il §4.5 della [30](30-golee-easygame-gap-audit.md) con `CLOSED` **solo dove esiste una prova a runtime** |
| 10 | **Gate** | `npm test`, `typecheck`, `lint`, `build`. Test nuovi obbligatori su permessi e accesso ai dati (CLAUDE.md §4) |

---

## 17 — Cosa non copiamo da Golee

| # | Cosa | Perche non si copia |
|---|---|---|
| **1** | **La matrice di 34 automazioni cablate** | Trentaquattro regole scritte in codice sono trentaquattro posti dove cambiare una parola richiede un rilascio, e per un club sono trentaquattro interruttori da capire prima di poterne usare due. EasyGame ne apre **quattro** — quelle che una segreteria italiana controlla davvero — con anticipi, testo e pubblico governati dal club, e cresce per domanda. Il numero non e un obiettivo di prodotto |
| **2** | **Un motore di comunicazione proprio, accanto a quello che esiste** | `src/lib/server/email/` e l'unico punto di invio (CLAUDE.md §2). Un secondo motore significa due configurazioni SMTP, due politiche di errore e due posti dove un messaggio puo partire senza traccia. Il registro delle consegne e uno, l'invio e uno |
| **3** | **La telemetria comportamentale sulle comunicazioni** (N-01) | Golee traccia verso Meta, TikTok, Bing e Clarity. Qui si parla di anagrafiche di **minori** e di dati economici delle famiglie: sapere chi ha aperto una email vale molto meno del rischio di mandare quel dato a una piattaforma pubblicitaria. Il registro delle consegne dice cosa e **partito**, non chi ha aperto, ed e sufficiente per rispondere «non ho ricevuto niente» |
| **4** | **Il dato che esce dal gestionale** | La ragione stessa del gap G-07 e che oggi la segreteria apre WhatsApp e il dato resta fuori. Rispondere con un'integrazione verso un canale esterno riprodurrebbe il problema con piu passaggi. Prima il canale interno funziona, poi si valuta un canale in piu — e sara una decisione con un ADR, non un dettaglio implementativo |
| **5** | **Il gating per piano dentro la matrice dei permessi** (N-02) | «Non hai il permesso» e «non hai il piano» hanno due rimedi diversi. ADR-0046 e ADR-0048 li tengono separati e il diniego dice sempre quale dei due e. Le automazioni non fanno eccezione |
| **6** | **Il workflow builder generico** | Un motore che permette all'utente di comporre condizioni e azioni sposta la responsabilita di un messaggio sbagliato dal prodotto al club, e non la toglie a nessuno: e il prodotto che manda l'email. Il catalogo dei trigger resta **chiuso e in codice**; il club sceglie quando, a chi, e con che parole |
| **7** | **Il feed sociale** con commenti e reazioni | Aprirebbe una moderazione che nessuno presidia, su una piattaforma che tratta dati di minori |
| **8** | **La rateizzazione al consumatore nel link di pagamento** (N-08) | Sposta il costo sulla famiglia o sul club e mette due fornitori in piu nel percorso del denaro. Il pagamento parziale nativo risolve lo stesso problema senza finanziaria |
| **9** | **Il workflow che rompe l'ownership EasyGame** | Un'automazione che scrivesse lo stato di una rata o marcasse una presenza violerebbe due invarianti scritti: lo stato di una rata **si ricava** (ADR-0036) e la presenza e un fatto dell'allenatore. Le automazioni di EasyGame **leggono e scrivono messaggi**. Non toccano il dominio |

---

## 18 — ADR da scrivere, contatori, effetto sulla gap matrix

### 18.1 Gli ADR che la Wave dovra lasciare

| ADR | Titolo proposto |
|---|---|
| **ADR-0083** | Le automazioni sono un valutatore notturno di regole, non un motore di eventi: in EasyGame lo stato derivato non si materializza |
| **ADR-0084** | Un solo registro delle consegne: «gli ho gia scritto?» e «chi ha ricevuto cosa?» sono la stessa domanda |
| **ADR-0085** | Il link di pagamento e un token opaco in archivio, non un token firmato senza stato: revoca e audit richiedono comunque una riga |
| **ADR-0086** | L'RSVP e un'intenzione, la presenza e un fatto: stessa riga, colonne separate, nessuna scrittura incrociata |
| **ADR-0087** | Il pubblico di una comunicazione ha un solo risolutore, e il sollecito di Wave 1 ci si sposta sopra |

### 18.2 Contatori

| Voce | Numero |
|---|---|
| Gap del perimetro verificati | **9** (G-03, G-04, G-05, G-06, G-07, G-08, G-20, G-58, G-35) |
| `CONFIRMED` | **6** (G-03, G-04, G-06, G-08, G-20, G-58) |
| `PARTIAL` | **2** (G-05, G-07) |
| `ALREADY SOLVED` | **2** regole chieste (contratto in scadenza, adempimento) |
| `FALSE POSITIVE` | **1** (voucher/presenze come automazione) |
| `FALSE START` trovati | **1** (`AttendanceConfirmation.tsx`) |
| Difetti preesistenti trovati | **2** (chiave unica mancante su `training_attendance`; due politiche di raggiungibilita divergenti) |
| Da sviluppare | **7** gap (G-03, G-04, G-05, G-06, G-07, G-08, G-20) |
| **EXTEND** | **9** (cron, giro per club, notifiche, email, audit, segnaposto, `training_attendance`, `club_resource_items`, checkout) |
| **NEW CAPABILITY** | **4** (catalogo regole, registro consegne, audience engine, link di pagamento) |
| NO ACTION | **5** (contratto, adempimento, voucher, G-53, G-35) |
| Blocker di produzione introdotti dalla Wave | **0** |
| Migrazioni previste | **3**, una per lane |
| Automazioni V1 | **4** + 1 modalita di riepilogo |
| Workstream | **6**, di cui **4** avviabili il primo giorno |

### 18.3 Come cambierebbe la gap matrix

| Gap | Prima | Dopo la Wave 2 (se le prove reggono) |
|---|---|---|
| G-03 | OPEN | **CLOSED** — limitato alle quattro regole V1, e dichiarato cosi |
| G-04 | OPEN | **CLOSED** |
| G-05 | OPEN | **CLOSED** per i messaggi; resta il catalogo documentale (G-14, Wave 3) |
| G-06 | OPEN | **CLOSED** — solo con un giro Stripe sandbox vero (R-16) |
| G-07 | PARTIAL | **CLOSED** |
| G-08 | OPEN | **CLOSED** |
| G-20 | OPEN | **PARTIAL** — allenamenti si, partite e convocazioni no |
| G-58 | OPEN | **CLOSED** |
| G-18 | OPEN | **OPEN**, con il censimento dei non raggiungibili gia disponibile |
| G-35, G-53 | OPEN | **OPEN** — POST-V1 dichiarato |

Effetto sui totali del §3 della [30](30-golee-easygame-gap-audit.md): `EG-`
da 44 a **38**, `EG~` da 40 a **39**. Le voci totali restano **189**: una Wave
non aggiunge capability al confronto, ne chiude.

---

## Risultato per il club

Un club che apre EasyGame dopo la Wave 2 trova questo.

Non insegue piu chi non ha pagato: il gestionale scrive alla famiglia sette
giorni prima della scadenza e poi il giorno dopo, con le **parole del club**, e
dentro il messaggio c'e **il modo di pagare** — un link che vale trenta giorni,
che si spegne quando serve, e che se la rata e gia saldata lo dice invece di
prendere altri soldi.

Non apre piu WhatsApp per dire una cosa a trenta famiglie: sceglie una
categoria, un gruppo o una sede, **vede prima chi raggiunge e chi no con il
motivo**, e dopo l'invio sa dire a chi e arrivato. Chi non ha email compare in
un elenco, che e il primo passo per andarselo a prendere.

Quello che deve restare — il campo chiuso domenica, il modulo del torneo — lo
mette in bacheca, con l'allegato, ai destinatari giusti, e lo programma per
lunedi mattina.

E l'allenatore, il giorno prima dell'allenamento, non guarda piu un elenco di
assenti costruito a posteriori: guarda tre numeri — **si, no, senza risposta** —
e chiama solo i terzi.

Il tutto senza un secondo motore di comunicazione, senza un secondo sistema di
pagamenti, senza un secondo archivio di presenze, e senza una riga di dato
delle famiglie che esca verso qualcuno che non sia il club.
