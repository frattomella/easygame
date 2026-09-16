/**
 * Doppio del client Prisma per i test del data layer.
 *
 * Registra ogni chiamata (delegate, metodo, argomenti) e restituisce i record
 * che gli vengono forniti, filtrandoli con la stessa semantica di uguaglianza
 * che usa Prisma per i `where` semplici. Serve a verificare **quali vincoli
 * il codice applica** prima di toccare il database, non a simulare Prisma.
 */

/*
  La dichiarazione della vista del registro, importata dal codice vero.

  Il doppio non ricopia la regola: la **chiama**. Una seconda scrittura qui
  sarebbe una terza contabilita, e divergerebbe al primo cambiamento.
*/
import { buildLedgerView } from "../../src/lib/accounting/ledger-view.ts";
import { guardianIdentityKey } from "../../src/lib/server/athlete-guardians.ts";

/**
 * **I tutori di un atleta, materializzati come li ha materializzati il travaso.**
 *
 * PP-02 / WP-C. Fino a WP-B un tutore era un elemento di
 * `athletes.data.guardians[]`, e ogni fixture di questo repository lo scrive
 * cosi. Adesso l'autorita e la tabella `athlete_guardians`, e un doppio che
 * non la conoscesse farebbe rispondere «no» a **ogni** vaglio dell'area
 * famiglia — cioe farebbe passare per rotto cio che e giusto, che e il modo
 * peggiore in cui un test possa fallire.
 *
 * Il doppio fa quindi cio che la migrazione ha fatto una volta sull'archivio:
 * deriva le righe dagli atleti del seed, quando il seed non le dichiara gia.
 *
 * **Le due regole sono chiamate, non ricopiate.** L'identita la calcola
 * `guardianIdentityKey`, cioe la stessa funzione del modulo proprietario: se
 * quella cambia, questa la segue. E le collezioni si leggono con la precedenza
 * del prodotto — `guardians` se non e vuoto, **altrimenti** la coppia storica
 * `parent1`/`parent2` — perche unirle inventerebbe legami che nessun
 * predicato riconosceva, ed e esattamente l'errore che il primo travaso aveva
 * commesso.
 *
 * Cio che il doppio **non** puo dire e se il prodotto vero scriva quelle righe:
 * lo dicono le sonde contro PostgreSQL, ed e li che quella domanda va fatta.
 */
const tutoriDalSeed = (atleti = []) => {
  const righe = [];

  /*
    **L'identificativo di una riga e uno UUID, anche qui.**

    Il modulo proprietario riconosce una riga in tre modi — per identificativo,
    per la chiave che aveva nel blob, per identita — e il primo lo tenta solo se
    cio che gli arriva **ha la forma** di uno UUID, perche altrimenti la colonna
    lo rifiuterebbe. Un doppio che coniasse identificativi di comodo farebbe
    quindi cadere il ramo piu preciso dei tre, e i test misurerebbero il ripiego
    invece della strada vera.

    Deterministico e non casuale: due montaggi dello stesso seed devono produrre
    le stesse chiavi, altrimenti un test che ne salva una non la ritrova.
  */
  let contatore = 0;
  const identificativo = () => {
    contatore += 1;
    const coda = String(contatore).padStart(12, "0");
    return `a91adaa0-0000-4000-8000-${coda}`;
  };

  for (const atleta of atleti) {
    const data =
      atleta?.data && typeof atleta.data === "object" ? atleta.data : {};
    const elenco = Array.isArray(data.guardians) ? data.guardians : [];
    const sorgenti = elenco.length
      ? elenco
      : [data.parent1, data.parent2].filter(
          (valore) => valore && typeof valore === "object",
        );

    const viste = new Set();

    sorgenti.forEach((guardian, posizione) => {
      const record = guardian && typeof guardian === "object" ? guardian : {};

      /* Le sei grafie dell'identificativo, elementi di array compresi. */
      const dichiarati = new Set();
      for (const valore of [
        record.linkedUserId,
        record.linked_user_id,
        record.userId,
        record.user_id,
        record.linkedUserIds,
        record.linked_user_ids,
      ]) {
        for (const voce of Array.isArray(valore) ? valore : [valore]) {
          const pulito = String(voce ?? "").trim().toLowerCase();
          if (pulito) dichiarati.add(pulito);
        }
      }

      /* L'indirizzo che apre, nell'ordine in cui lo legge chi decide. */
      const indirizzo =
        [record.linkedUserEmail, record.linked_user_email, record.email]
          .map((valore) => String(valore ?? "").trim().toLowerCase())
          .find(Boolean) || null;

      const identita = dichiarati.size
        ? [...dichiarati]
        : [guardianIdentityKey({ email: indirizzo, legacyId: record.id }) ||
            `riga:pos-${posizione}`];

      for (const chiave of identita) {
        if (!chiave || viste.has(chiave)) continue;
        viste.add(chiave);

        righe.push({
          id: identificativo(),
          organization_id: atleta.organization_id,
          athlete_id: atleta.id,
          identity_key: chiave,
          /*
            **Un'identita che non e un indirizzo e un'utenza.**

            Il travaso vero pretende uno UUID valido, perche la chiave esterna
            rifiuterebbe un'utenza inventata. Qui la chiave esterna non c'e, e
            le fixture di questo repository usano identificativi che **non**
            sono UUID validi — `33333333-5g00-…` ne e uno. Pretendere la forma
            farebbe rispondere «non e tuo figlio» a un test che dice il
            contrario, cioe misurerebbe la fixture invece del prodotto.
          */
          user_id: chiave.includes("@") ? null : chiave,
          email: indirizzo,
          first_name: record.name ?? null,
          last_name: record.surname ?? null,
          phone: record.phone ?? record.telefono ?? null,
          relationship: record.relationship ?? null,
          contact_only: Boolean(record.contactOnly || record.contact_only),
          linked_at: record.linkedAt ? new Date(record.linkedAt) : null,
          revoked_at:
            record.accessRevokedAt || record.access_revoked_at
              ? new Date(record.accessRevokedAt || record.access_revoked_at)
              : null,
          access_token_value: record.parentAccessTokenValue ?? null,
          access_token_status: record.parentAccessTokenStatus ?? null,
          access_token_expires_at: record.parentAccessTokenExpiresAt
            ? new Date(record.parentAccessTokenExpiresAt)
            : null,
          access_token_generated_at: record.parentAccessTokenGeneratedAt
            ? new Date(record.parentAccessTokenGeneratedAt)
            : null,
          legacy_id: record.id ?? null,
          position: posizione,
          created_at: new Date(0),
          updated_at: new Date(0),
        });
      }
    });

    /*
      I due registri di scheda diventano fatti sulla riga, come nel travaso: il
      registro **vince** sul segno di riga.
    */
    const insieme = (chiave) =>
      new Set(
        (Array.isArray(data[chiave]) ? data[chiave] : [])
          .map((valore) => String(valore ?? "").trim().toLowerCase())
          .filter(Boolean),
      );
    const revocate = insieme("revokedGuardianIdentities");
    const recapiti = insieme("contactOnlyIdentities");

    for (const riga of righe) {
      if (riga.athlete_id !== atleta.id) continue;
      if (revocate.has(riga.identity_key)) {
        riga.revoked_at = riga.revoked_at || new Date(0);
      }
      if (recapiti.has(riga.identity_key)) riga.contact_only = true;
    }
  }

  return righe;
};

/** Vero se il valore soddisfa un filtro su campo JSON `{ path, equals }`. */
const matchesJsonPath = (value, condition) => {
  let current = value;
  for (const segment of condition.path) {
    if (current == null || typeof current !== "object") return false;
    current = current[segment];
  }
  return current === condition.equals;
};

/**
 * Applica `data` a una riga con la semantica di Prisma.
 *
 * L'unico operatore implementato e `increment`, e non per completezza: senza,
 * un test sulla numerazione dei documenti scriverebbe `{ increment: 1 }`
 * dentro la colonna e passerebbe lo stesso, provando il contrario di cio che
 * deve provare.
 */
const applyData = (record, data = {}) => {
  for (const [key, value] of Object.entries(data)) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      if ("increment" in value) {
        record[key] = Number(record[key] || 0) + Number(value.increment);
        continue;
      }
      if ("decrement" in value) {
        record[key] = Number(record[key] || 0) - Number(value.decrement);
        continue;
      }
    }
    record[key] = value;
  }
  return record;
};

/**
 * I nomi che in Prisma sono **operatori** e non colonne.
 *
 * Servono a distinguere `{ equals: x }` — un filtro — da
 * `{ organization_id: ..., training_id: ... }` — una chiave composta.
 */
const PRISMA_FILTER_KEYS = new Set([
  "equals",
  "not",
  "in",
  "notIn",
  "lt",
  "lte",
  "gt",
  "gte",
  "contains",
  "startsWith",
  "endsWith",
  "mode",
  "path",
  "some",
  "every",
  "none",
  "is",
  "isNot",
  "has",
  "hasSome",
  "array_contains",
  "isEmpty",
]);

const matchesWhere = (record, where) => {
  if (!where) return true;

  for (const [key, condition] of Object.entries(where)) {
    if (key === "OR") {
      if (!condition.some((clause) => matchesWhere(record, clause))) return false;
      continue;
    }
    if (key === "AND") {
      if (!condition.every((clause) => matchesWhere(record, clause))) return false;
      continue;
    }
    if (key === "NOT") {
      if (matchesWhere(record, condition)) return false;
      continue;
    }

    /*
      `undefined` vuol dire **nessun filtro**, come in Prisma.

      Non e un dettaglio del doppio: e la semantica su cui si e nascosto un
      difetto vero. `external_payment_id: original.external_payment_id ||
      undefined` sembrava «filtra su questo incasso» e diventava «non filtrare
      niente» quando l'identificativo mancava — la somma dei rimborsi passava
      da un movimento a tutto il club. Un doppio che trattava `undefined` come
      un valore da confrontare rispondeva «nessuna riga» e faceva passare il
      test provando il contrario di cio che deve provare.
    */
    if (condition === undefined) continue;

    /*
      `null` significa `IS NULL`, e in un database **non esiste «assente»**.

      Le righe di questi doppi sono fixture scritte a mano, dove un campo non
      pertinente si omette; una riga letta da Postgres porta invece `null`
      esplicito. Confrontando `undefined === null` il doppio rispondeva «nessuna
      riga» dove il database avrebbe risposto «questa».

      Non e pedanteria: e la fedelta che serve a provare le guardie scritte
      **dentro** la scrittura — `updateMany({ where: { id, reversed_at: null } })`
      e il modo in cui si chiude una corsa fra storno e riconciliazione, e un
      doppio che non la sa eseguire fa fallire il test giusto.
    */
    if (condition === null) {
      if (record[key] !== null && record[key] !== undefined) return false;
      continue;
    }

    const value = record[key];

    if (condition && typeof condition === "object" && !Array.isArray(condition)) {
      if ("path" in condition && "equals" in condition) {
        if (!matchesJsonPath(value, condition)) return false;
        continue;
      }
      if ("in" in condition) {
        if (!condition.in.includes(value)) return false;
        continue;
      }
      /*
        `notIn`, e mancava.

        Il nome era gia in `PRISMA_FILTER_KEYS` — quindi il doppio lo
        riconosceva come operatore — ma nessun ramo lo valutava: la condizione
        cadeva in «non supportata», che la considera **soddisfatta**. Ogni
        filtro `notIn` era percio un filtro che non filtrava, e i test che ne
        dipendono passavano qualunque cosa escludessero.

        Non e teorico: `listClubEvents` toglie gli eventi archiviati e
        annullati con `status: { notIn: [...] }` (P0-3), e il conteggio
        dell'appello toglie le righe `pending`, che sono risposte della
        famiglia e non presenze registrate (P0-5). Con questo ramo assente il
        doppio le contava tutte.
      */
      if ("notIn" in condition) {
        if ((condition.notIn || []).includes(value)) return false;
        continue;
      }
      if ("not" in condition) {
        if (value === condition.not) return false;
        continue;
      }
      /*
        I quattro confronti d'ordine, e non per completezza: senza `lt` una
        `deleteMany({ where: { expires_at: { lt: now } } })` cadeva nel ramo
        «condizione non supportata», che la considera soddisfatta — e
        cancellava **tutte** le righe. Un test sulla pulizia dei dati scaduti
        sarebbe passato provando il contrario di cio che deve provare.
      */
      /*
        **Un intervallo ha due estremi, e questo doppio ne guardava uno.**

        Ognuno dei quattro rami finiva con `continue`, che passa alla chiave
        successiva del `where`: su `{ gte, lte }` — cioe la forma di ogni
        filtro per periodo — veniva verificato solo `gte`, e `lte` non veniva
        letto mai.

        Il risultato era che **nessun test poteva accorgersi** di un difetto
        sul limite superiore di un intervallo. E infatti non se n'e accorto
        nessuno: che il filtro `to` escludesse l'ultimo giorno di ogni periodo
        — un rimborso di fine anno fuori dal rendiconto, un incasso del 31
        dicembre contato zero volte fra due periodi adiacenti — lo ha trovato
        un audit che leggeva il database vero, non la suite.

        I confronti si valutano ora tutti e quattro, e si esce solo se ne era
        presente almeno uno.
      */
      const confronti = ["gt", "gte", "lt", "lte"].filter((op) => op in condition);
      if (confronti.length) {
        for (const op of confronti) {
          const limite = condition[op];
          const esito =
            op === "gt"
              ? value > limite
              : op === "gte"
                ? value >= limite
                : op === "lt"
                  ? value < limite
                  : value <= limite;
          if (!esito) return false;
        }
        continue;
      }
      /*
        `contains`, e serve a una cosa sola: la **ricerca** della prima nota.

        La vista `accounting_ledger_lines` porta una colonna `search_text` gia
        in minuscolo, e il filtro e `{ contains: <testo> }`. Senza questo ramo
        la condizione cadeva in «non supportata» — che la considera soddisfatta
        — e ogni test sulla ricerca sarebbe passato **qualunque cosa** cercasse,
        provando il contrario di cio che deve provare.
      */
      if ("contains" in condition) {
        const atteso = String(condition.contains ?? "");
        const trovato = value === null || value === undefined ? "" : String(value);
        const insensibile = condition.mode === "insensitive";
        if (
          !(insensibile
            ? trovato.toLowerCase().includes(atteso.toLowerCase())
            : trovato.includes(atteso))
        ) {
          return false;
        }
        continue;
      }
      /*
        `has`, cioe «questa colonna array contiene questo valore».

        Serve a una colonna sola ma decisiva: `communication_deliveries.athlete_ids`,
        che e il modo in cui il registro delle consegne dice **per chi** era un
        messaggio. Senza questo ramo la condizione cadeva in «non supportata» —
        che la considera soddisfatta — e la cancellazione dei dati di una
        persona avrebbe anonimizzato le consegne di **tutti**, con il test
        verde.
      */
      if ("has" in condition) {
        const lista = Array.isArray(value) ? value : [];
        if (!lista.includes(condition.has)) return false;
        continue;
      }
      /*
        `hasSome`, cioe «questa colonna array contiene **almeno uno** di
        questi valori».

        Aggiunto da PP-01 §A, e per la stessa ragione per cui `has` esiste:
        senza, la condizione cadeva in «non supportata», che la considera
        soddisfatta. Il perimetro di categoria sugli eventi
        (`club_events.category_ids`, ADR-0111) e scritto proprio cosi, e un
        doppio che lo ignora fa passare un test sul perimetro **restituendo
        tutte le righe** — che e il contrario di cio che quel test prova.
      */
      /*
        `isEmpty`, cioe «questa colonna array e vuota».

        Terzo operatore trovato mancante, e la terza volta con la stessa
        conseguenza: senza il ramo la condizione cadeva nel ripiego «non
        supportata, quindi soddisfatta». Qui il costo era preciso — il filtro
        della bacheca e
        `OR: [{ athlete_ids: { isEmpty: true } }, { athlete_ids: { has: id } }]`,
        e con il primo membro sempre vero l'`OR` intero era sempre vero: **la
        bacheca non filtrava per figlio**. Nel verso opposto, su una fixture
        senza la colonna, la condizione finiva nel ramo della chiave composta e
        rispondeva falso, nascondendo una consegna che Postgres avrebbe
        mostrato. Sbagliava in tutti e due i sensi.
      */
      if ("isEmpty" in condition) {
        const lista = Array.isArray(value) ? value : [];
        if (Boolean(condition.isEmpty) !== (lista.length === 0)) return false;
        continue;
      }

      if ("hasSome" in condition) {
        const lista = Array.isArray(value) ? value : [];
        const cercati = Array.isArray(condition.hasSome)
          ? condition.hasSome
          : [condition.hasSome];
        if (!cercati.some((atteso) => lista.includes(atteso))) return false;
        continue;
      }
      /*
        `array_contains`, cioe l'operatore `@>` di Postgres su una colonna
        `jsonb`.

        **E il ramo piu pericoloso che questo doppio abbia avuto**, e non
        perche sbagliasse: perche non c'era. Una condizione non supportata qui
        si considera **soddisfatta**, quindi un
        `where: { subjects: { array_contains: [{ subject: "athlete", recordId }] } }`
        non filtrava niente e il doppio restituiva **tutte** le righe del
        club. Due vincoli si appoggiano proprio a quel filtro — «questo modulo
        si compila una volta sola» e lo stato dei moduli online di un figlio —
        e un test su di essi poteva essere verde su una semantica che la
        produzione non ha. Lo ha trovato una revisione dichiarando di non aver
        letto questo file: e stato il sospetto a portarci, non la lettura.

        La semantica e quella di `@>`, e va detta per intero perche e
        controintuitiva su due punti:

        1. **contenimento parziale**: `[{recordId: "x"}]` corrisponde a un
           elemento `{recordId: "x", subject: "athlete", label: "..."}`. Si
           confrontano le sole chiavi scritte nel filtro;
        2. **non posizionale**: ogni elemento cercato puo stare in qualunque
           posizione dell'array della riga.
      */
      if ("array_contains" in condition) {
        const cercati = Array.isArray(condition.array_contains)
          ? condition.array_contains
          : [condition.array_contains];
        const presenti = Array.isArray(value) ? value : [];

        const contenuto = (elemento, atteso) => {
          if (atteso === null || typeof atteso !== "object") {
            return elemento === atteso;
          }
          if (Array.isArray(atteso)) {
            return (
              Array.isArray(elemento) &&
              atteso.every((voce) =>
                elemento.some((candidato) => contenuto(candidato, voce)),
              )
            );
          }
          if (!elemento || typeof elemento !== "object") return false;
          return Object.entries(atteso).every(([chiave, valore]) =>
            contenuto(elemento[chiave], valore),
          );
        };

        const tutti = cercati.every((atteso) =>
          presenti.some((elemento) => contenuto(elemento, atteso)),
        );
        if (!tutti) return false;
        continue;
      }

      /*
        La **chiave unica composta**, cioe come Prisma la scrive in un `where`
        unico: `{ organization_id_training_id_athlete_id: { organization_id,
        training_id, athlete_id } }`. Il nome della chiave non e una colonna,
        quindi senza questo ramo la condizione finiva in «non supportata» — che
        la considera soddisfatta — e il doppio faceva corrispondere la **prima
        riga qualunque**. Un `upsert` sulla chiave unica avrebbe aggiornato la
        riga sbagliata, e un test sulla risposta duplicata sarebbe passato
        provando il contrario di cio che deve provare.
      */
      const compoundFields = Object.keys(condition);
      if (
        value === undefined &&
        compoundFields.length > 0 &&
        compoundFields.every((field) => !PRISMA_FILTER_KEYS.has(field))
      ) {
        const matches = compoundFields.every((field) =>
          matchesWhere(record, { [field]: condition[field] }),
        );
        if (!matches) return false;
        continue;
      }

      // condizione non supportata: la si considera soddisfatta, cosi il test
      // fallisce sull'asserzione vera e non su una finta non-corrispondenza
      continue;
    }

    if (value !== condition) return false;
  }

  return true;
};

/**
 * I vincoli di unicita che il doppio fa rispettare.
 *
 * Il doppio non legge lo schema Prisma, quindi non li conosce. Vengono
 * dichiarati qui, e solo dove **un test dipende da loro**: un vincolo che
 * nessuno prova sarebbe una promessa in piu da tenere allineata a mano.
 *
 * Senza questo, il test sulla deduplica dei webhook passerebbe comunque —
 * provando esattamente il contrario di cio che deve provare.
 */
const UNIQUE_CONSTRAINTS = {
  /*
    Le persone in prova (ADR-0188): una presenza per (club, evento, persona), e
    una scheda atleta collegata a una prova sola (`athlete_id` unico, i NULL
    fuori). Sono i vincoli della migrazione, e un test ci si appoggia.
  */
  trialAttendance: [["organization_id", "event_id", "trial_athlete_id"]],
  trialAthlete: [
    {
      fields: ["athlete_id"],
      quando: (row) => row.athlete_id !== null && row.athlete_id !== undefined,
    },
  ],
  paymentWebhookEvent: [["provider", "event_id"]],
  documentNumberSequence: [["organization_id", "kind", "series", "year"]],
  clubPaymentAccount: [["organization_id"]],
  platformBillingAccount: [["organization_id"]],
  organizationFiscalProfile: [["organization_id"]],
  documentSeries: [["organization_id", "kind", "code"]],
  fiscalOperationType: [["organization_id", "code"]],
  /*
    Due conti «Banca» nello stesso club sono il modo piu rapido di far
    scegliere il conto sbagliato a chi registra. Il vincolo esiste in base dati
    (`financial_accounts_organization_id_name_key`) e un test ci si appoggia.
  */
  financialAccount: [["organization_id", "name"]],
  eInvoiceTransmission: [["invoice_id"]],
  platformSetting: [["key"]],
  /*
    **Un documento vivo per incasso**, e non uno qualunque.

    Il vincolo era pieno, e il database non lo e piu: e un indice unico
    **parziale** su `cancelled_at IS NULL`
    (`receipts_transaction_unico`, `invoices_transaction_unico`). La
    differenza non e formale — con il vincolo pieno una ricevuta annullata
    bloccava per sempre il suo incasso, e il doppio faceva fallire proprio la
    prova che dimostra che adesso non lo blocca piu.
  */
  receipt: [
    {
      fields: ["transaction_id"],
      quando: (row) =>
        row.transaction_id !== null &&
        row.transaction_id !== undefined &&
        !row.cancelled_at,
    },
    ["organization_id", "receipt_number"],
  ],
  invoice: [
    {
      fields: ["transaction_id"],
      quando: (row) =>
        row.transaction_id !== null &&
        row.transaction_id !== undefined &&
        !row.cancelled_at,
    },
    ["organization_id", "invoice_number"],
  ],
  fundingEnrollment: [["program_id", "athlete_id"]],
  athleteCategoryMembership: [
    ["organization_id", "athlete_id", "category_id"],
    /*
      L'indice unico **parziale** vero in base dati
      (`athlete_category_memberships_single_primary_per_athlete`): al piu una
      appartenenza primaria per atleta **per club**, non per stagione. Senza
      questo vincolo il riporto dei tesserati potrebbe clonare una seconda
      primaria e il test passerebbe descrivendo un database che rifiuterebbe
      la scrittura.
    */
    {
      fields: ["organization_id", "athlete_id"],
      quando: (row) => row.is_primary === true,
    },
  ],
  formTemplate: [["public_slug"]],
  /* Le bozze pubbliche e le revisioni (ADR-0189). */
  formDraft: [["resume_token_hash"]],
  formSubmissionRevision: [["submission_id", "revision"]],
  /*
    L'impronta della ricevuta di iscrizione (Wave 5, lane 5G): unica in base
    dati (`form_submissions_receipt_token_hash_key`), e **parziale** solo nel
    senso che la stragrande maggioranza delle righe la lascia nulla — una
    compilazione della segreteria non ha nessuna famiglia che la segue. Senza
    il predicato, la seconda compilazione interna senza ricevuta verrebbe
    rifiutata da un vincolo che il database non applica, perche in SQL due
    `NULL` non collidono mai.
  */
  formSubmission: [
    {
      fields: ["receipt_token_hash"],
      quando: (row) =>
        row.receipt_token_hash !== null && row.receipt_token_hash !== undefined,
    },
  ],
  /*
    Un **indice parziale**, come quello vero in base dati
    (`payment_transactions_incasso_unico`, ADR-0062): al piu un incasso
    positivo per (club, pagamento del provider). Storni e rimborsi copiano per
    costruzione l'identificativo dell'incasso che compensano — e devono farlo —
    quindi il vincolo non li riguarda.
  */
  paymentTransaction: [
    {
      fields: ["organization_id", "external_payment_id"],
      quando: (row) =>
        row.external_payment_id !== null &&
        row.external_payment_id !== undefined &&
        Number(row.amount) > 0,
    },
    /* Il gemello, sul denaro che esce: payment_transactions_storno_unico. */
    {
      fields: ["organization_id", "external_reference"],
      quando: (row) =>
        row.external_reference !== null &&
        row.external_reference !== undefined &&
        Number(row.amount) < 0,
    },
  ],
  /*
    Lavoro sportivo. I tre vincoli che il database fa rispettare sul denaro in
    uscita, e senza i quali i test proverebbero il contrario di cio che devono
    provare:

      * `sport_work_outbound_gesto_unico` — due invii dello stesso clic
        portano la stessa chiave, e il secondo non deve far uscire il denaro
        una seconda volta;
      * `sport_work_storno_unico` — stornare due volte la stessa erogazione
        riporterebbe il registro in attivo di un compenso intero;
      * `sport_work_dichiarazione_attiva_unica` — due autocertificazioni valide
        per lo stesso anno sono due risposte alla domanda «quanta franchigia
        resta», e la scelta fra le due la farebbe l'ordinamento di una query.
  */
  sportWorkOutboundTransaction: [
    {
      fields: ["organization_id", "idempotency_key"],
      quando: (row) =>
        row.idempotency_key !== null && row.idempotency_key !== undefined,
    },
    {
      fields: ["reversal_of_id"],
      quando: (row) =>
        row.reversal_of_id !== null && row.reversal_of_id !== undefined,
    },
  ],
  sportWorkExternalDeclaration: [
    {
      fields: ["organization_id", "person_id", "fiscal_year"],
      quando: (row) => row.status === "ACTIVE",
    },
  ],
  sportWorkCompensationPlan: [["relationship_id"]],
  sportWorkInstallment: [["plan_id", "sequence"]],
  sportWorkObligation: [["organization_id", "reference_key"]],
  sportWorkYearPosition: [["organization_id", "person_id", "year"]],
  /*
    Wave 2. I due vincoli su cui poggia l'intera deduplica delle comunicazioni,
    e senza i quali i test proverebbero il contrario di cio che devono provare:

      * `communication_deliveries_dedup_unique` — e la difesa contro il
        doppione, e la difesa **e l'indice**, non un controllo in memoria: e
        proprio con due esecuzioni concorrenti che un controllo applicativo non
        regge, quindi un doppio che non lo facesse rispettare mostrerebbe due
        messaggi come se fosse normale;
      * `club_event_participants_organization_id_event_id_athlete_id_key` —
        una riga per (club, evento, atleta). Due righe significano due risposte
        contraddittorie della stessa famiglia allo stesso invito, e da ADR-0099
        anche due convocazioni e due presenze: e la chiave che tiene insieme i
        tre fatti.
  */
  communicationDelivery: [
    ["organization_id", "dedup_key", "recipient_key", "channel"],
  ],
  clubEventParticipant: [["organization_id", "event_id", "athlete_id"]],
  clubEvent: [["organization_id", "kind", "legacy_id"]],
  paymentLink: [["token_hash"]],
  /*
    Wave 3. I tre vincoli su cui poggia il motore documentale:

      * `document_template_versions_template_id_version_key` — due righe con lo
        stesso numero di versione renderebbero ambigua la citazione di un
        documento, che e l'unica cosa che la versione deve garantire;
      * `generated_documents_..._batch_subject` — dentro un lotto lo stesso
        soggetto produce **un** documento. E cio che rende un nuovo tentativo
        capace di rigenerare solo i falliti, e in PostgreSQL vale solo quando
        `batch_id` non e nullo: una generazione singola resta libera di
        ripetersi, perche due attestazioni chieste due volte sono due
        documenti;
      * `consent_definitions_organization_id_key_key` — la chiave con cui un
        modulo o un modello nomina un consenso deve identificarne uno solo.
  */
  documentTemplateVersion: [["template_id", "version"]],
  generatedDocument: [
    {
      fields: [
        "organization_id",
        "batch_id",
        "template_id",
        "subject_kind",
        "subject_id",
      ],
      quando: (row) => row.batch_id !== null && row.batch_id !== undefined,
    },
  ],
  consentDefinition: [["organization_id", "key"]],
  documentTemplate: [
    {
      fields: ["organization_id", "catalog_key"],
      quando: (row) => row.catalog_key !== null && row.catalog_key !== undefined,
    },
  ],
  consentVersion: [["definition_id", "version"]],
  /*
    Wave 4, libro soci. I due indici **parziali** che il database fa rispettare,
    e senza i quali i test proverebbero il contrario di cio che devono provare:

      * `membership_events_ammissione_unica` — un socio si ammette una volta
        sola. Due ammissioni sono due date di ingresso, e il libro non saprebbe
        quale usare; chi rientra viene **riammesso**, che e un altro tipo di
        evento e per questo il vincolo e parziale;
      * `membership_events_numero_unico` — il numero di tessera non si ripete.
        La difesa e l'indice e non un controllo in memoria: e proprio con due
        ammissioni contemporanee che un controllo applicativo non regge.
  */
  membershipEvent: [
    {
      fields: ["organization_id", "member_id"],
      quando: (row) => row.event_type === "ADMISSION",
    },
    {
      fields: ["organization_id", "membership_number"],
      quando: (row) =>
        row.membership_number !== null && row.membership_number !== undefined,
    },
  ],
  /*
    Wave 5, appuntamenti. `appointments_organization_id_idempotency_key_key`: e
    la difesa contro il **doppio clic**, e la difesa e l'indice — non un
    controllo in memoria, che e proprio cio che due invii ravvicinati non
    reggono. Un doppio che non lo facesse rispettare mostrerebbe due
    appuntamenti come se fosse normale, e il test proverebbe il contrario di
    cio che deve provare.

    L'altro indice della tabella — `appointments_slot_vivo_unico`, parziale
    sugli stati vivi — **non** e dichiarato qui, e la ragione e onesta: le sue
    colonne comprendono `starts_at`, e questo doppio confronta i campi con
    `===`, che su due `Date` distinte con lo stesso istante risponde sempre
    «diverse». Dichiararlo darebbe un vincolo che non scatta mai, cioe una
    promessa peggiore del non averlo. Che quell'indice regga si prova contro il
    database vero, non qui.
  */
  appointment: [
    {
      fields: ["organization_id", "idempotency_key"],
      quando: (row) =>
        row.idempotency_key !== null && row.idempotency_key !== undefined,
    },
  ],
  /*
    Wave 6, accesso atleta. I due indici della tabella degli inviti:

      * `athlete_account_invites_vivo_unico` — **parziale** sul solo stato
        `sent`: un invito vivo per atleta, e a garantirlo e il database. Un
        doppio che non lo facesse rispettare mostrerebbe due token validi per
        la stessa persona come se fosse normale, e il test proverebbe il
        contrario di cio che deve provare. A differenza di
        `appointments_slot_vivo_unico`, le sue colonne sono tre stringhe: il
        confronto con `===` e fedele;
      * `athlete_account_invites_token_hash_key` — un token individua **un**
        invito, ed e cio che rende il riscatto una ricerca per impronta e non
        per atleta.
  */
  athleteAccountInvite: [
    {
      fields: ["organization_id", "athlete_id"],
      quando: (row) => row.status === "sent",
    },
    ["token_hash"],
  ],
};

/** L'errore che Prisma lancia su una chiave duplicata. */
const duplicateKeyError = (delegate, fields) => {
  const error = new Error(
    `Unique constraint failed on the fields: (${fields.join(",")}) [${delegate}]`,
  );
  error.code = "P2002";
  error.meta = { target: fields };
  return error;
};

export const createFakePrisma = (seedByDelegate = {}) => {
  const calls = [];
  /*
    Ogni riga creata senza id ne riceve uno **diverso**: due `create` di
    seguito sullo stesso delegate producevano la stessa chiave primaria, e un
    `findUnique` restituiva la prima delle due. Un database non lo farebbe
    mai, e un test che ne dipende verifica un comportamento che in produzione
    non esiste.
  */
  let generatedIds = 0;
  /*
    **Un identificativo generato ha la forma di uno UUID.** Le colonne `@db.Uuid`
    rifiutano tutto il resto, e i domini cercano per `id` solo cio che ha quella
    forma (`findClubEvent`, le persone in prova): un segnaposto leggibile
    faceva cadere il ramo piu preciso e i test misuravano il ripiego. Resta
    deterministico — stesso seme, stesse chiavi — e il nome del delegato sta
    nel terzo gruppo, cosi una riga si riconosce ancora a occhio.
  */
  const generatedId = (name, index = 0) => {
    generatedIds += 1;
    const tag = Array.from(String(name)).reduce((acc, ch) => (acc * 31 + ch.charCodeAt(0)) % 0xffff, 7).toString(16).padStart(4, "0");
    const coda = String(generatedIds * 100 + index).padStart(12, "0");
    return `f1a4e000-0000-4${tag.slice(0, 3)}-8${tag.slice(3, 4)}00-${coda}`;
  };
  const semi = { ...seedByDelegate };
  if (!semi.athleteGuardian && Array.isArray(semi.athlete)) {
    semi.athleteGuardian = tutoriDalSeed(semi.athlete);
  }

  const store = new Map(
    Object.entries(semi).map(([name, rows]) => [name, rows.map((r) => ({ ...r }))]),
  );

  const rowsOf = (name) => {
    if (!store.has(name)) store.set(name, []);
    return store.get(name);
  };

  /**
   * **La vista del registro, ricostruita dal doppio.**
   *
   * `accounting_ledger_lines` non e una tabella: e una vista che unisce i
   * movimenti propri alla proiezione di incassi, compensi, liquidazioni e
   * movimenti storici. Il doppio non parla SQL, quindi la ricompone con
   * `src/lib/accounting/ledger-view.ts` — che e la **stessa** dichiarazione
   * della regola che il file di migrazione traduce in SQL.
   *
   * Questo e cio che rende i test ancora capaci di dire qualcosa: senza,
   * qualunque prova sulla prima nota leggerebbe un elenco vuoto e passerebbe.
   * Che la dichiarazione e la traduzione coincidano davvero lo prova
   * `scripts/wave-4-registro-riconciliazione.mjs`, contro il database vero.
   *
   * Si ricalcola a **ogni** lettura, e non e uno spreco: un doppio che la
   * memorizzasse mostrerebbe righe vecchie dopo una scrittura, cioe
   * esattamente il difetto che una vista non puo avere.
   */
  const nomeOf = (persona) =>
    persona
      ? `${persona.first_name || ""} ${persona.last_name || ""}`.trim() || null
      : null;

  const perId = (name) => {
    const mappa = new Map();
    for (const riga of rowsOf(name)) mappa.set(riga.id, riga);
    return mappa;
  };

  const righeDelRegistro = () => {
    const conti = perId("financialAccount");
    const causali = rowsOf("fiscalOperationType");
    const causalePerCodice = new Map(
      causali.map((c) => [`${c.organization_id}|${c.code}`, c]),
    );
    const causalePerId = perId("fiscalOperationType");
    const atleti = perId("athlete");
    const persone = perId("sportWorkPerson");
    const programmi = perId("fundingProgram");
    const fatture = rowsOf("invoice");
    const ricevute = rowsOf("receipt");

    const numeroDocumento = (documentKind, documentId, organizationId) => {
      if (!documentId) return null;
      const tipo = String(documentKind || "").toLowerCase();
      const cerca = (righe, colonna) =>
        righe.find(
          (d) => d.id === documentId && d.organization_id === organizationId,
        )?.[colonna] || null;
      if (tipo === "invoice" || tipo === "fattura") {
        return cerca(fatture, "invoice_number");
      }
      if (tipo === "receipt" || tipo === "ricevuta") {
        return cerca(ricevute, "receipt_number");
      }
      return null;
    };

    return buildLedgerView({
      entries: rowsOf("accountingEntry").map((row) => ({
        ...row,
        _accountName: conti.get(row.financial_account_id)?.name || null,
        _operationTypeLabel: causalePerId.get(row.operation_type_id)?.label || null,
        _documentNumber: numeroDocumento(
          row.document_kind,
          row.document_id,
          row.organization_id,
        ),
      })),
      paymentTransactions: rowsOf("paymentTransaction").map((row) => {
        /*
          La fattura vince sulla ricevuta quando ci sono entrambe, e un
          documento **annullato** non si mostra: e la stessa regola della
          vista, e mostrarne una qui e l'altra li vorrebbe dire che il doppio
          descrive un database diverso da quello vero.
        */
        const fattura = fatture.find(
          (d) => d.transaction_id === row.id && !d.cancelled_at,
        );
        const ricevuta = ricevute.find(
          (d) => d.transaction_id === row.id && !d.cancelled_at,
        );
        const documento = fattura || ricevuta;
        const causale = causalePerCodice.get(
          `${row.organization_id}|${row.operation_type_code}`,
        );

        return {
          ...row,
          _athleteName: nomeOf(atleti.get(row.athlete_id)),
          _accountName: conti.get(row.financial_account_id)?.name || null,
          _operationTypeLabel: causale?.label || null,
          _activityScope: causale?.activity_scope || null,
          _documentKind: documento ? (fattura ? "invoice" : "receipt") : null,
          _documentId: documento?.id || null,
          _documentNumber:
            fattura?.invoice_number || ricevuta?.receipt_number || null,
        };
      }),
      sportWorkPayouts: rowsOf("sportWorkOutboundTransaction").map((row) => ({
        ...row,
        _personName: nomeOf(persone.get(row.person_id)),
        _accountName: conti.get(row.financial_account_id)?.name || null,
      })),
      fundingSettlements: rowsOf("fundingSettlement").map((row) => ({
        ...row,
        _programName: programmi.get(row.program_id)?.name || null,
        _accountName: conti.get(row.financial_account_id)?.name || null,
      })),
      clubs: rowsOf("club"),
    });
  };


  /*
    Un `create` che violerebbe un vincolo dichiarato fallisce come farebbe
    Postgres. Le righe del seed non vengono controllate: un seed e uno stato
    di partenza, non una scrittura.
  */
  const assertUnique = (name, data) => {
    for (const vincolo of UNIQUE_CONSTRAINTS[name] || []) {
      /*
        Due forme: un elenco di campi, oppure un oggetto con un predicato —
        che e come Postgres esprime un indice parziale. Senza il predicato, il
        vincolo sugli incassi rifiuterebbe i rimborsi, che condividono per
        costruzione l'identificativo dell'incasso originale.
      */
      const fields = Array.isArray(vincolo) ? vincolo : vincolo.fields;
      const quando = Array.isArray(vincolo) ? null : vincolo.quando;

      if (fields.some((field) => data[field] === undefined)) continue;
      if (quando && !quando(data)) continue;

      const clash = rowsOf(name).some(
        (row) =>
          fields.every((field) => row[field] === data[field]) &&
          (!quando || quando(row)),
      );

      if (clash) throw duplicateKeyError(name, fields);
    }
  };

  /**
   * **Le relazioni che `include` sa risolvere, dichiarate una per una.**
   *
   * PP-02. `include` veniva **ignorato**: la riga tornava senza le relazioni, e
   * un servizio che le legge trovava `undefined`. Non era una bugia comoda come
   * `hasSome` — che rispondeva «si» a una domanda che non sapeva valutare — ma
   * il danno e simmetrico: `getParentDashboardData` non era collaudabile
   * affatto, e la sua copertura viveva **solo** nella sonda contro il database
   * vero, che in integrazione continua non gira.
   *
   * E un elenco chiuso e non un motore: una relazione che non e qui continua a
   * non essere risolta, e si aggiunge quando serve. Un motore generico
   * dedurrebbe le chiavi dai nomi, e dedurre e il modo in cui un doppio comincia
   * a rispondere cose che il database non risponderebbe.
   */
  const RELAZIONI = {
    athlete: {
      organization: { tipo: "uno", delegato: "club", locale: "organization_id" },
      category_memberships: {
        tipo: "molti",
        delegato: "athleteCategoryMembership",
        remota: "athlete_id",
      },
      payments: {
        tipo: "molti",
        delegato: "athletePayment",
        remota: "athlete_id",
      },
      medical_certificates: {
        tipo: "molti",
        delegato: "medicalCertificate",
        remota: "athlete_id",
      },
    },
    documentRequest: {
      submissions: {
        tipo: "molti",
        delegato: "documentSubmission",
        remota: "request_id",
      },
    },
    appointment: {
      slot: { tipo: "uno", delegato: "appointmentSlot", locale: "slot_id" },
      athlete: { tipo: "uno", delegato: "athlete", locale: "athlete_id" },
    },
    /* Le pratiche di iscrizione (ADR-0189): modulo, versione compilata, revisioni. */
    formSubmission: {
      template: { tipo: "uno", delegato: "formTemplate", locale: "template_id" },
      template_version: { tipo: "uno", delegato: "formTemplateVersion", locale: "version_id" },
      revisions: { tipo: "molti", delegato: "formSubmissionRevision", remota: "submission_id" },
    },
    /* Le persone in prova (ADR-0188). */
    trialAthlete: {
      organization: { tipo: "uno", delegato: "club", locale: "organization_id" },
      athlete: { tipo: "uno", delegato: "athlete", locale: "athlete_id" },
      attendances: { tipo: "molti", delegato: "trialAttendance", remota: "trial_athlete_id" },
    },
    trialAttendance: {
      event: { tipo: "uno", delegato: "clubEvent", locale: "event_id" },
      trial_athlete: { tipo: "uno", delegato: "trialAthlete", locale: "trial_athlete_id" },
    },
  };
  /* L'inversa uno-a-uno: la prova da cui una scheda atleta e nata. */
  RELAZIONI.athlete.trial_origin = { tipo: "uno-inversa", delegato: "trialAthlete", remota: "athlete_id" };

  /**
   * **`select`, cioe la proiezione — quarto operatore trovato mancante.**
   *
   * Il doppio restituiva sempre la **riga intera**, e nessun test poteva
   * accorgersi che una query proietta. Il costo e stato misurato: il vaglio
   * dell'RSVP e stato spostato dal solo legame al «questo evento riguarda
   * l'atleta», e la funzione che lo decide legge categoria e appartenenze —
   * che la `select` di quel percorso **non chiedeva**. In produzione Prisma
   * proietta davvero, quindi la riga arrivava senza quei campi e la risposta
   * veniva rifiutata a **chiunque**; nei test arrivava intera e passava.
   *
   * E la stessa forma di `array_contains` e di `isEmpty`, con una differenza
   * che la rende peggiore: quelli facevano tornare **piu** righe del vero,
   * questo fa tornare **piu campi**, e un campo di troppo non si nota fino al
   * giorno in cui qualcuno decide qualcosa su di lui.
   *
   * Le relazioni chieste in `select` si comportano come in `include`: Prisma
   * accetta `select: { category_memberships: true }` e le risolve.
   */
  const applicaSelect = (name, row, select) => {
    if (!row || !select || typeof select !== "object") return row;

    const mappa = RELAZIONI[name] || {};
    const proiettata = {};

    for (const [chiave, chiesto] of Object.entries(select)) {
      if (!chiesto) continue;

      if (mappa[chiave]) {
        const risolta = applicaInclude(name, row, { [chiave]: chiesto });
        proiettata[chiave] = risolta?.[chiave];
        continue;
      }

      proiettata[chiave] = row[chiave];
    }

    return proiettata;
  };

  const applicaInclude = (name, row, include) => {
    if (!row || !include || typeof include !== "object") return row;

    const mappa = RELAZIONI[name];
    if (!mappa) return row;

    const arricchita = { ...row };

    for (const [chiave, richiesta] of Object.entries(include)) {
      if (!richiesta) continue;
      const relazione = mappa[chiave];
      if (!relazione) continue;

      /*
        **Una relazione seminata a mano vince su quella risolta.**

        Prima che `include` sapesse risolvere, i test scrivevano la relazione
        **dentro la riga** — `athlete.medical_certificates: [...]` — ed e una
        dichiarazione, non un residuo: quel test ha deciso cosa deve tornare.
        Risolverla comunque la sovrascriverebbe con l'elenco del delegato, che
        quei test non hanno seminato affatto: sette presidi sui promemoria dei
        certificati sono passati da verdi a rossi cosi, su codice non toccato.
      */
      if (Object.prototype.hasOwnProperty.call(row, chiave)) continue;

      if (relazione.tipo === "uno") {
        const riferimento = row[relazione.locale];
        arricchita[chiave] =
          (riferimento &&
            rowsOf(relazione.delegato).find(
              (candidata) => String(candidata.id) === String(riferimento),
            )) ||
          null;
        continue;
      }

      if (relazione.tipo === "uno-inversa") {
        const trovata = rowsOf(relazione.delegato).find(
          (candidata) => String(candidata[relazione.remota]) === String(row.id),
        );
        arricchita[chiave] = trovata ? (typeof richiesta === "object" && richiesta.select ? applicaSelect(relazione.delegato, trovata, richiesta.select) : trovata) : null;
        continue;
      }

      arricchita[chiave] = rowsOf(relazione.delegato).filter(
        (candidata) => String(candidata[relazione.remota]) === String(row.id),
      );
    }

    return arricchita;
  };

  const makeDelegate = (name) => ({
    findMany: async (args = {}) => {
      calls.push({ delegate: name, method: "findMany", args });
      let rows = rowsOf(name).filter((r) => matchesWhere(r, args.where));

      /*
        `orderBy`, `skip` e `take` vanno onorati: un doppio che li ignora
        farebbe passare una paginazione che non pagina.

        La forma **array** non e un caso raro: il codice vero la usa ovunque
        serva un criterio di spareggio — `[{ paid_at }, { created_at }]` sugli
        incassi, `[{ effective_from }, { created_at }]` sulle condizioni
        commerciali. Ignorarla faceva passare per ordinati dei risultati che
        arrivavano nell'ordine di inserimento.
      */
      const criteria = Array.isArray(args.orderBy)
        ? args.orderBy
        : args.orderBy && typeof args.orderBy === "object"
          ? [args.orderBy]
          : [];

      if (criteria.length) {
        rows = [...rows].sort((left, right) => {
          for (const criterion of criteria) {
            const [field, direction] = Object.entries(criterion || {})[0] || [];
            if (!field) continue;

            const a = left[field];
            const b = right[field];

            if (a === undefined || a === null) {
              if (b === undefined || b === null) continue;
              return 1;
            }
            if (b === undefined || b === null) return -1;

            /*
              Il confronto e a tre vie e **non** passa da `===`.

              Due `Date` con lo stesso istante non sono lo stesso oggetto: con
              `===` risultavano diverse, il ramo di uguaglianza non scattava e
              il comparatore restituiva un ordine arbitrario. Un test
              sull'ordinamento a parita di data — che e il caso in cui
              l'ordinamento serve — passava o falliva a seconda
              dell'implementazione di `sort`.
            */
            if (a < b) return direction === "desc" ? 1 : -1;
            if (a > b) return direction === "desc" ? -1 : 1;
          }
          return 0;
        });
      }

      if (Number.isInteger(args.skip)) rows = rows.slice(args.skip);
      if (Number.isInteger(args.take)) rows = rows.slice(0, args.take);

      if (args.include) {
        return rows.map((row) => applicaInclude(name, row, args.include));
      }
      if (args.select) {
        return rows.map((row) => applicaSelect(name, row, args.select));
      }
      return rows;
    },
    findFirst: async (args = {}) => {
      calls.push({ delegate: name, method: "findFirst", args });
      const row = rowsOf(name).find((r) => matchesWhere(r, args.where)) || null;
      if (args.include) return applicaInclude(name, row, args.include);
      if (args.select) return applicaSelect(name, row, args.select);
      return row;
    },
    findUnique: async (args = {}) => {
      calls.push({ delegate: name, method: "findUnique", args });
      const row = rowsOf(name).find((r) => matchesWhere(r, args.where)) || null;
      if (args.include) return applicaInclude(name, row, args.include);
      if (args.select) return applicaSelect(name, row, args.select);
      return row;
    },
    create: async (args = {}) => {
      calls.push({ delegate: name, method: "create", args });
      assertUnique(name, args.data || {});
      const created = {
        id: args.data?.id || generatedId(name),
        ...args.data,
      };
      rowsOf(name).push(created);
      return created;
    },
    /*
      `skipDuplicates` non e una comodita: e il modo in cui Postgres (`ON
      CONFLICT DO NOTHING`) rende idempotente una scrittura in blocco. Un
      doppio che inserisse comunque tutte le righe farebbe passare un test di
      idempotenza provando il contrario di cio che deve provare — e il conteggio
      restituito, che il codice usa per dire quanti record ha creato davvero,
      sarebbe una bugia.
    */
    createMany: async (args = {}) => {
      calls.push({ delegate: name, method: "createMany", args });
      const rows = Array.isArray(args.data) ? args.data : [args.data];
      let count = 0;

      rows.forEach((row, index) => {
        if (args.skipDuplicates) {
          try {
            assertUnique(name, row || {});
          } catch {
            return;
          }
        }
        rowsOf(name).push({
          id: row?.id || generatedId(name, index),
          ...row,
        });
        count += 1;
      });

      return { count };
    },
    update: async (args = {}) => {
      calls.push({ delegate: name, method: "update", args });
      const row = rowsOf(name).find((r) => matchesWhere(r, args.where));
      if (!row) throw new Error("Record to update not found");
      return applyData(row, args.data);
    },
    upsert: async (args = {}) => {
      calls.push({ delegate: name, method: "upsert", args });
      const row = rowsOf(name).find((r) => matchesWhere(r, args.where));
      if (row) {
        return applyData(row, args.update);
      }
      /*
        Il ramo `create` dell'upsert si comporta come un `create`: id diverso a
        ogni riga e vincoli fatti rispettare. Con l'id fisso di prima, due
        upsert su chiavi diverse producevano due righe con la **stessa** chiave
        primaria, e un `findUnique` successivo restituiva sempre la prima.
      */
      assertUnique(name, args.create || {});
      const created = {
        id: args.where?.id || generatedId(name),
        ...args.create,
      };
      rowsOf(name).push(created);
      return created;
    },
    delete: async (args = {}) => {
      calls.push({ delegate: name, method: "delete", args });
      const index = rowsOf(name).findIndex((r) => matchesWhere(r, args.where));
      if (index === -1) throw new Error("Record to delete does not exist");
      return rowsOf(name).splice(index, 1)[0];
    },
    deleteMany: async (args = {}) => {
      calls.push({ delegate: name, method: "deleteMany", args });
      const kept = rowsOf(name).filter((r) => !matchesWhere(r, args.where));
      const count = rowsOf(name).length - kept.length;
      store.set(name, kept);
      return { count };
    },
    /*
      `updateMany` fa rispettare i vincoli di unicita come `create`.

      Non e pedanteria: il riporto dei tesserati riassegna la bandiera
      «primaria» proprio con un `updateMany`, ed era l'unica scrittura di
      primarie che il doppio non poteva rifiutare — cioe l'unico punto in cui
      un test poteva passare descrivendo un database che avrebbe detto di no.
      La verifica esclude la riga che si sta aggiornando, altrimenti ogni
      aggiornamento sarebbe in conflitto con se stesso.
    */
    updateMany: async (args = {}) => {
      calls.push({ delegate: name, method: "updateMany", args });
      let count = 0;
      for (const row of rowsOf(name)) {
        if (!matchesWhere(row, args.where)) continue;

        const proposta = applyData({ ...row }, args.data);
        for (const vincolo of UNIQUE_CONSTRAINTS[name] || []) {
          const fields = Array.isArray(vincolo) ? vincolo : vincolo.fields;
          const quando = Array.isArray(vincolo) ? null : vincolo.quando;

          if (fields.some((field) => proposta[field] === undefined)) continue;
          if (quando && !quando(proposta)) continue;

          const clash = rowsOf(name).some(
            (other) =>
              other !== row &&
              fields.every((field) => other[field] === proposta[field]) &&
              (!quando || quando(other)),
          );
          if (clash) throw duplicateKeyError(name, fields);
        }

        applyData(row, args.data);
        count += 1;
      }
      return { count };
    },
    count: async (args = {}) => {
      calls.push({ delegate: name, method: "count", args });
      return rowsOf(name).filter((r) => matchesWhere(r, args.where)).length;
    },
    /*
      `_count._all` e `_sum`, e nient'altro.

      `_sum` e arrivato con il saldo dei conti finanziari, che si deriva
      sommando quattro tabelle **nel database**: la soglia del piano e 200 ms
      per conto, e un `findMany` di tutte le righe la sfonda al primo club con
      duemila incassi. Un doppio senza `_sum` avrebbe costretto il servizio a
      leggere tutte le righe per essere testabile — cioe a scrivere il codice
      lento per far passare il test.

      Le somme restano `null` quando il gruppo non ha righe con quel campo, ed
      e la semantica di Postgres: un `SUM` su nessuna riga non e zero, e un
      doppio che rispondesse `0` nasconderebbe la differenza fra «non c'e
      niente» e «la somma fa zero».
    */
    groupBy: async (args = {}) => {
      calls.push({ delegate: name, method: "groupBy", args });
      const by = Array.isArray(args.by) ? args.by : [args.by].filter(Boolean);
      const sumFields = Object.entries(args._sum || {})
        .filter(([, wanted]) => wanted)
        .map(([field]) => field);
      const groups = new Map();

      for (const row of rowsOf(name).filter((r) => matchesWhere(r, args.where))) {
        const key = JSON.stringify(by.map((field) => row[field]));
        const group =
          groups.get(key) ||
          Object.fromEntries(by.map((field) => [field, row[field]]));
        group._count = { _all: (group._count?._all || 0) + 1 };

        if (sumFields.length) {
          group._sum = group._sum || {};
          for (const field of sumFields) {
            const value = row[field];
            if (value === null || value === undefined) continue;
            group._sum[field] = (group._sum[field] || 0) + Number(value);
          }
        }

        groups.set(key, group);
      }

      if (sumFields.length) {
        for (const group of groups.values()) {
          group._sum = group._sum || {};
          for (const field of sumFields) {
            if (!(field in group._sum)) group._sum[field] = null;
          }
        }
      }

      return [...groups.values()];
    },
  });

  /**
   * Il delegate della vista: **legge e conta, e non scrive**.
   *
   * Postgres rifiuta una scrittura su una vista con `UNION ALL`, e il doppio
   * fa lo stesso. Non e zelo: un test che riuscisse a scrivere qui
   * descriverebbe un database che non esiste, e coprirebbe proprio il difetto
   * — materializzare come riga propria cio che appartiene a un dominio — che
   * questa Wave vieta.
   */
  const vistaRegistro = () => {
    const nonScrivibile = (metodo) => async () => {
      throw new Error(
        `cannot ${metodo} a view: accounting_ledger_lines e una vista, ` +
          "il registro si scrive nei domini che possiedono i numeri",
      );
    };

    return {
      findMany: async (args = {}) => {
        calls.push({ delegate: "accountingLedgerLine", method: "findMany", args });
        let rows = righeDelRegistro().filter((r) => matchesWhere(r, args.where));
        const criteri = Array.isArray(args.orderBy)
          ? args.orderBy
          : args.orderBy
            ? [args.orderBy]
            : [];
        if (criteri.length) {
          rows = [...rows].sort((left, right) => {
            for (const criterio of criteri) {
              const [campo, verso] = Object.entries(criterio || {})[0] || [];
              if (!campo) continue;
              const a = left[campo];
              const b = right[campo];
              if (a === undefined || a === null) {
                if (b === undefined || b === null) continue;
                return 1;
              }
              if (b === undefined || b === null) return -1;
              if (a < b) return verso === "desc" ? 1 : -1;
              if (a > b) return verso === "desc" ? -1 : 1;
            }
            return 0;
          });
        }
        const skip = Number(args.skip) || 0;
        const take = Number.isInteger(args.take) ? args.take : undefined;
        return take === undefined ? rows.slice(skip) : rows.slice(skip, skip + take);
      },
      count: async (args = {}) => {
        calls.push({ delegate: "accountingLedgerLine", method: "count", args });
        return righeDelRegistro().filter((r) => matchesWhere(r, args.where)).length;
      },
      findFirst: async (args = {}) => {
        calls.push({ delegate: "accountingLedgerLine", method: "findFirst", args });
        return righeDelRegistro().find((r) => matchesWhere(r, args.where)) || null;
      },
      create: nonScrivibile("create"),
      createMany: nonScrivibile("create"),
      update: nonScrivibile("update"),
      updateMany: nonScrivibile("update"),
      delete: nonScrivibile("delete"),
      deleteMany: nonScrivibile("delete"),
      upsert: nonScrivibile("upsert"),
    };
  };

  const delegates = new Map();

  /**
   * **L'unica istruzione SQL grezza che questo doppio sa eseguire.**
   *
   * Il contatore di frequenza (`auth-rate-limit.ts`) e un solo
   * `INSERT … ON CONFLICT DO UPDATE … RETURNING`, perche la sua atomicita
   * sotto richieste simultanee non ha una forma Prisma (B-H2, revisione
   * finale della Wave 6). Un doppio che rispondesse `[]` farebbe fallire ogni
   * test sui limiti; uno che rispondesse sempre `count: 1` li farebbe passare
   * provando il contrario di cio che devono provare.
   *
   * Si emula quindi **quella** istruzione, sulle righe di
   * `authRateLimitBucket`, con la stessa semantica: riga nuova o scaduta →
   * `count = 1` e nuova scadenza; riga viva → `count + 1`. L'ordine dei
   * parametri (chiave, scope, scadenza, adesso) e parte del contratto. La
   * concorrenza vera non si emula qui: la prova la sonda contro Postgres.
   *
   * Qualunque altra istruzione risponde `[]`, come prima: i `SELECT … FOR
   * UPDATE` dei lock di riga non hanno niente da restituire.
   */
  const eseguiSqlGrezzo = (strings, values) => {
    const testo = Array.isArray(strings)
      ? strings.join("?")
      : String(strings?.sql ?? strings ?? "");

    /*
      **PP-02. «In quali club questa persona compare come tutore».**

      Serve implementarla, non ignorarla: la risposta muta di `[]` sarebbe
      «nessun club», che e la risposta **stretta** — un test sul tutore senza
      tessera fallirebbe invece di passare per sbaglio, ma fallirebbe su un
      codice corretto, che e lo stesso disservizio al contrario. E la stessa
      lezione di `hasSome` in PP-01.
    */
    if (/FROM athletes/i.test(testo) && /guardians/i.test(testo)) {
      const identita = new Set(
        (Array.isArray(values?.[0]) ? values[0] : [])
          .map((valore) => String(valore || "").trim().toLowerCase())
          .filter(Boolean),
      );
      /*
        **Le stesse quattro chiavi della query vera, e non sette.**

        La prima stesura ne confrontava sette — le tre dell'indirizzo comprese —
        mentre la query di produzione ne guarda quattro, e il commento su
        `findClubsWhereUserIsGuardian` spiega a lungo perche l'indirizzo **non
        deve** allargare. Un doppio che contraddice l'invariante che presidia e
        la stessa lezione di `hasSome`, con il segno invertito: qui non
        mentirebbe dicendo di si, mentirebbe dicendo che il confine e piu largo
        di quello che il database applica.
      */
      const chiavi = ["linkedUserId", "linked_user_id", "userId", "user_id"];
      const club = new Set();

      rowsOf("athlete").forEach((riga) => {
        const tutori = riga?.data?.guardians;
        if (!Array.isArray(tutori)) return;
        const combacia = tutori.some(
          (tutore) =>
            tutore &&
            typeof tutore === "object" &&
            chiavi.some((chiave) =>
              identita.has(String(tutore[chiave] || "").trim().toLowerCase()),
            ),
        );
        if (combacia && riga.organization_id) club.add(String(riga.organization_id));
      });

      return Array.from(club).map((organization_id) => ({ organization_id }));
    }

    if (!/INSERT INTO auth_rate_limit_buckets/i.test(testo)) return [];

    const [key, scope, nextExpiry, now] = values;
    const righe = rowsOf("authRateLimitBucket");
    const esistente = righe.find((r) => r.key === key);

    if (!esistente) {
      righe.push({
        key,
        scope,
        count: 1,
        expires_at: nextExpiry,
        created_at: now,
        updated_at: now,
      });
      return [{ count: 1, expires_at: nextExpiry }];
    }

    if (esistente.expires_at <= now) {
      esistente.count = 1;
      esistente.expires_at = nextExpiry;
    } else {
      esistente.count += 1;
    }
    esistente.scope = scope;
    esistente.updated_at = now;
    return [{ count: esistente.count, expires_at: esistente.expires_at }];
  };

  const client = new Proxy(
    {
      $transaction: async (input) =>
        typeof input === "function" ? input(client) : Promise.all(input),
      $disconnect: async () => {},
      $queryRaw: async (strings, ...values) => eseguiSqlGrezzo(strings, values),
      /*
        **Il permesso di scrivere i tutori, che qui non ha niente da aprire.**

        `withGuardianWriter` dichiara `SET LOCAL "easygame.guardian_writer"`
        prima di toccare `athlete_guardians`: e la sola forma che l'archivio
        vero accetta, e senza questo metodo ogni percorso che passa dal modulo
        proprietario cadrebbe qui dentro con un errore che non parla del
        difetto che il test cerca.

        **Il doppio non puo misurare quella difesa**, ed e giusto dirlo invece
        di lasciarlo intuire: un vaglio dell'archivio si prova contro
        l'archivio. Lo fa `scripts/pp-02-proprietario-tutore.mjs`, che
        attacca la tabella con Prisma e con SQL grezzo da fuori il modulo e
        pretende un rifiuto — e che verificato per mutazione, tolto il vaglio,
        diventa rosso su quattro prove su sei.

        Qui l'istruzione si registra fra le chiamate e non fa altro: un test
        che volesse controllare **che** sia stata dichiarata puo leggerla.
      */
      $executeRawUnsafe: async (sql, ...values) => {
        calls.push({ delegate: "$executeRawUnsafe", method: "run", args: [sql, values] });
        return 0;
      },
    },
    {
      get: (target, property) => {
        if (property in target) return target[property];
        if (typeof property !== "string") return undefined;
        if (!delegates.has(property)) {
          delegates.set(
            property,
            property === "accountingLedgerLine"
              ? vistaRegistro()
              : makeDelegate(property),
          );
        }
        return delegates.get(property);
      },
    },
  );

  return {
    client,
    calls,
    rows: (name) => rowsOf(name),
    /** Ultima chiamata a un metodo su un delegate. */
    lastCall: (delegate, method) =>
      [...calls].reverse().find((c) => c.delegate === delegate && c.method === method) || null,
    reset: () => {
      calls.length = 0;
    },
  };
};
