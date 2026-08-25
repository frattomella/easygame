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
      if ("gt" in condition) {
        if (!(value > condition.gt)) return false;
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

  const makeDelegate = (name) => ({
    findMany: async (args = {}) => {
      calls.push({ delegate: name, method: "findMany", args });
      let rows = rowsOf(name).filter((r) => matchesWhere(r, args.where));

      // `orderBy`, `skip` e `take` vanno onorati: un doppio che li ignora
      // farebbe passare una paginazione che non pagina.
      const orderBy = args.orderBy;
      if (orderBy && typeof orderBy === "object" && !Array.isArray(orderBy)) {
        const [field, direction] = Object.entries(orderBy)[0] || [];
        if (field) {
          const sign = direction === "desc" ? -1 : 1;
          rows = [...rows].sort((left, right) => {
            const a = left[field];
            const b = right[field];
            if (a === b) return 0;
            if (a === undefined || a === null) return 1;
            if (b === undefined || b === null) return -1;
            return a > b ? sign : -sign;
          });
        }
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
      Object.assign(row, args.data);
      return row;
    },
    upsert: async (args = {}) => {
      calls.push({ delegate: name, method: "upsert", args });
      const row = rowsOf(name).find((r) => matchesWhere(r, args.where));
      if (row) {
        Object.assign(row, args.update);
        return row;
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
          Object.assign(row, args.data);
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
