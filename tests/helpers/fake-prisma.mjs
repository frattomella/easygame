/**
 * Doppio del client Prisma per i test del data layer.
 *
 * Registra ogni chiamata (delegate, metodo, argomenti) e restituisce i record
 * che gli vengono forniti, filtrandoli con la stessa semantica di uguaglianza
 * che usa Prisma per i `where` semplici. Serve a verificare **quali vincoli
 * il codice applica** prima di toccare il database, non a simulare Prisma.
 */

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
      if ("gt" in condition) {
        if (!(value > condition.gt)) return false;
        continue;
      }
      if ("gte" in condition) {
        if (!(value >= condition.gte)) return false;
        continue;
      }
      if ("lt" in condition) {
        if (!(value < condition.lt)) return false;
        continue;
      }
      if ("lte" in condition) {
        if (!(value <= condition.lte)) return false;
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
  eInvoiceTransmission: [["invoice_id"]],
  platformSetting: [["key"]],
  receipt: [["transaction_id"]],
  fundingEnrollment: [["program_id", "athlete_id"]],
  athleteCategoryMembership: [
    ["organization_id", "athlete_id", "category_id"],
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
    createMany: async (args = {}) => {
      calls.push({ delegate: name, method: "createMany", args });
      const rows = Array.isArray(args.data) ? args.data : [args.data];
      rows.forEach((row, index) => {
        rowsOf(name).push({ id: row?.id || `${name}-generated-${index}`, ...row });
      });
      return { count: rows.length };
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
      const created = { id: args.where?.id || `${name}-generated`, ...args.create };
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
    updateMany: async (args = {}) => {
      calls.push({ delegate: name, method: "updateMany", args });
      let count = 0;
      for (const row of rowsOf(name)) {
        if (matchesWhere(row, args.where)) {
          applyData(row, args.data);
          count += 1;
        }
      }
      return { count };
    },
    count: async (args = {}) => {
      calls.push({ delegate: name, method: "count", args });
      return rowsOf(name).filter((r) => matchesWhere(r, args.where)).length;
    },
    // Solo `_count._all`: e la sola aggregazione che il codice usa, e un
    // doppio che ne simulasse altre direbbe di supportare cio che non prova.
    groupBy: async (args = {}) => {
      calls.push({ delegate: name, method: "groupBy", args });
      const by = Array.isArray(args.by) ? args.by : [args.by].filter(Boolean);
      const groups = new Map();

      for (const row of rowsOf(name).filter((r) => matchesWhere(r, args.where))) {
        const key = JSON.stringify(by.map((field) => row[field]));
        const group =
          groups.get(key) ||
          Object.fromEntries(by.map((field) => [field, row[field]]));
        group._count = { _all: (group._count?._all || 0) + 1 };
        groups.set(key, group);
      }

      return [...groups.values()];
    },
  });

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
        if (!delegates.has(property)) delegates.set(property, makeDelegate(property));
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
