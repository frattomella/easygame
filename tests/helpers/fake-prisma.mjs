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
  const store = new Map(
    Object.entries(seedByDelegate).map(([name, rows]) => [name, rows.map((r) => ({ ...r }))]),
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

      return rows;
    },
    findFirst: async (args = {}) => {
      calls.push({ delegate: name, method: "findFirst", args });
      return rowsOf(name).find((r) => matchesWhere(r, args.where)) || null;
    },
    findUnique: async (args = {}) => {
      calls.push({ delegate: name, method: "findUnique", args });
      return rowsOf(name).find((r) => matchesWhere(r, args.where)) || null;
    },
    create: async (args = {}) => {
      calls.push({ delegate: name, method: "create", args });
      assertUnique(name, args.data || {});
      const created = {
        id: args.data?.id || `${name}-generated-${(generatedIds += 1)}`,
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
          id: row?.id || `${name}-generated-${(generatedIds += 1)}-${index}`,
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
        id: args.where?.id || `${name}-generated-${(generatedIds += 1)}`,
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

  const client = new Proxy(
    {
      $transaction: async (input) =>
        typeof input === "function" ? input(client) : Promise.all(input),
      $disconnect: async () => {},
      $queryRaw: async () => [],
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
