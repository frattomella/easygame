import { apiRequest } from "./api/client";

type AuthMetadata = Record<string, any>;

type MockUser = {
  id: string;
  email: string;
  user_metadata: AuthMetadata;
  app_metadata: Record<string, any>;
  aud: string;
  created_at: string;
  updated_at: string;
};

type MockSession = {
  access_token: string;
  refresh_token: string;
  token_type: "bearer";
  expires_in: number;
  expires_at: number;
  user: MockUser;
};

type QueryFilter =
  | { type: "eq"; column: string; value: any }
  | { type: "neq"; column: string; value: any }
  | { type: "in"; column: string; value: any[] }
  | { type: "lte"; column: string; value: any }
  | { type: "match"; value: Record<string, any> }
  | { type: "or"; value: string };

type QueryAction = "select" | "insert" | "update" | "delete" | "upsert";

type RealtimeHandler = {
  id: string;
  table?: string;
  event: string;
  callback: (payload: any) => void;
};

type SelectToken =
  | { type: "wildcard" }
  | { type: "field"; value: string }
  | { type: "relation"; relation: string; columns: string };

const SESSION_KEY = "easygame.api-session.v1";
const isBrowser = () => typeof window !== "undefined";

const authListeners = new Set<
  (event: string, session: MockSession | null) => void
>();
const realtimeHandlers = new Map<string, RealtimeHandler[]>();
const uploadedAssetUrls = new Map<string, string>();

const clone = <T>(value: T): T => {
  if (value === undefined || value === null) {
    return value;
  }

  return JSON.parse(JSON.stringify(value));
};

const getSessionCache = (): MockSession | null => {
  if (!isBrowser()) {
    return null;
  }

  const raw = window.localStorage.getItem(SESSION_KEY);
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as MockSession;
  } catch {
    window.localStorage.removeItem(SESSION_KEY);
    return null;
  }
};

const saveSessionCache = (session: MockSession | null) => {
  if (!isBrowser()) {
    return;
  }

  if (!session) {
    window.localStorage.removeItem(SESSION_KEY);
    return;
  }

  window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
};

const emitAuthState = (event: string, session: MockSession | null) => {
  authListeners.forEach((listener) => {
    try {
      listener(event, session ? clone(session) : null);
    } catch (error) {
      console.error("Auth listener error:", error);
    }
  });
};

const splitTopLevel = (value: string) => {
  const parts: string[] = [];
  let current = "";
  let depth = 0;

  for (const char of value) {
    if (char === "(") depth += 1;
    if (char === ")") depth -= 1;

    if (char === "," && depth === 0) {
      parts.push(current.trim());
      current = "";
      continue;
    }

    current += char;
  }

  if (current.trim()) {
    parts.push(current.trim());
  }

  return parts;
};

const parseSelect = (value?: string | null): SelectToken[] => {
  if (!value || value === "*") {
    return [{ type: "wildcard" }];
  }

  return splitTopLevel(value).map((part) => {
    if (part === "*") {
      return { type: "wildcard" } as SelectToken;
    }

    const relationMatch = part.match(/^([a-zA-Z0-9_]+)(?:!inner)?\((.*)\)$/);
    if (relationMatch) {
      return {
        type: "relation",
        relation: relationMatch[1],
        columns: relationMatch[2] || "*",
      } as SelectToken;
    }

    return { type: "field", value: part } as SelectToken;
  });
};

const getNestedValue = (row: any, column: string) => {
  if (!row || !column) return undefined;

  if (column.includes(".")) {
    return column
      .split(".")
      .reduce(
        (value, segment) =>
          value !== null && value !== undefined ? value[segment] : undefined,
        row,
      );
  }

  return row[column];
};

const toComparableValue = (value: any) => {
  if (value === undefined) return null;
  return value;
};

const getRelatedRecord = (
  store: { tables: Record<string, any[]> },
  currentTable: string,
  row: any,
  relation: string,
) => {
  if (!row) return null;

  if (row[relation]) {
    return row[relation];
  }

  const relationTable = relation;
  const foreignKeyCandidates = [
    `${relation.replace(/s$/, "")}_id`,
    `${relation}_id`,
    relation === "organizations" ? "organization_id" : "",
    relation === "athletes" ? "athlete_id" : "",
    relation === "categories" ? "category_id" : "",
  ].filter(Boolean);

  const foreignKey = foreignKeyCandidates.find((candidate) => row[candidate]);

  if (!foreignKey) {
    if (relation === "organizations" && currentTable === "organization_users") {
      return (
        store.tables.organizations?.find(
          (item) => item.id === row.organization_id,
        ) || null
      );
    }
    return null;
  }

  return (
    store.tables[relationTable]?.find((item) => item.id === row[foreignKey]) ||
    null
  );
};

const applySelect = (
  store: { tables: Record<string, any[]> },
  table: string,
  row: any,
  selectClause?: string | null,
) => {
  const tokens = parseSelect(selectClause);
  if (!row) return null;

  const includesWildcard = tokens.some((token) => token.type === "wildcard");
  const result = includesWildcard ? clone(row) : {};

  tokens.forEach((token) => {
    if (token.type === "field") {
      (result as any)[token.value] = clone(getNestedValue(row, token.value));
      return;
    }

    if (token.type === "relation") {
      const related = getRelatedRecord(store, table, row, token.relation);
      (result as any)[token.relation] = related
        ? applySelect(store, token.relation, related, token.columns)
        : null;
    }
  });

  return result;
};

const applyFilters = (rows: any[], filters: QueryFilter[]) => {
  return rows.filter((row) =>
    filters.every((filter) => {
      if (filter.type === "eq") {
        return (
          toComparableValue(getNestedValue(row, filter.column)) ===
          toComparableValue(filter.value)
        );
      }

      if (filter.type === "neq") {
        return (
          toComparableValue(getNestedValue(row, filter.column)) !==
          toComparableValue(filter.value)
        );
      }

      if (filter.type === "in") {
        return filter.value.includes(getNestedValue(row, filter.column));
      }

      if (filter.type === "lte") {
        return (
          String(toComparableValue(getNestedValue(row, filter.column))) <=
          String(toComparableValue(filter.value))
        );
      }

      if (filter.type === "match") {
        return Object.entries(filter.value).every(
          ([column, value]) =>
            toComparableValue(getNestedValue(row, column)) ===
            toComparableValue(value),
        );
      }

      if (filter.type === "or") {
        return splitTopLevel(filter.value).some((segment) => {
          const cleaned = segment.trim();
          if (!cleaned) return false;

          const [column, operator, ...valueParts] = cleaned.split(".");
          const parsedValue = valueParts.join(".");
          const currentValue = getNestedValue(row, column);

          if (operator === "eq") {
            return String(toComparableValue(currentValue)) === parsedValue;
          }

          if (operator === "is" && parsedValue === "null") {
            return currentValue === null || currentValue === undefined;
          }

          return false;
        });
      }

      return true;
    }),
  );
};

const sortRows = (
  rows: any[],
  column?: string,
  ascending: boolean = true,
) => {
  if (!column) return rows;

  return [...rows].sort((left, right) => {
    const leftValue = getNestedValue(left, column);
    const rightValue = getNestedValue(right, column);

    if (leftValue === rightValue) return 0;

    if (leftValue === undefined || leftValue === null) {
      return ascending ? 1 : -1;
    }

    if (rightValue === undefined || rightValue === null) {
      return ascending ? -1 : 1;
    }

    if (leftValue > rightValue) {
      return ascending ? 1 : -1;
    }

    return ascending ? -1 : 1;
  });
};

const generateId = () => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `api-${Math.random().toString(36).slice(2, 10)}-${Date.now()}`;
};

const notifyRealtime = ({
  event,
  table,
  newRow,
  oldRow,
}: {
  event: string;
  table: string;
  newRow?: any;
  oldRow?: any;
}) => {
  realtimeHandlers.forEach((handlers) => {
    handlers.forEach((handler) => {
      const eventMatches =
        handler.event === "*" ||
        handler.event === event ||
        (handler.event === "postgres_changes" && Boolean(event));
      const tableMatches = !handler.table || handler.table === table;

      if (!eventMatches || !tableMatches) return;

      handler.callback({
        eventType: event,
        schema: "public",
        table,
        new: newRow ? clone(newRow) : null,
        old: oldRow ? clone(oldRow) : null,
      });
    });
  });
};

const inferRelations = (
  selectClause: string | null,
  filters: QueryFilter[],
  orderBy?: { column: string; ascending: boolean },
) => {
  const relations = new Set<string>();

  parseSelect(selectClause).forEach((token) => {
    if (token.type === "relation") {
      relations.add(token.relation);
    }
  });

  for (const filter of filters) {
    if ("column" in filter && filter.column.includes(".")) {
      relations.add(filter.column.split(".")[0]);
    }
  }

  if (orderBy?.column?.includes(".")) {
    relations.add(orderBy.column.split(".")[0]);
  }

  return relations;
};

const fetchTable = async (resource: string) => {
  const response = await apiRequest<any[]>(`/api/v1/${resource}`);
  return {
    data: Array.isArray(response.data) ? response.data : [],
    error: response.error,
  };
};

const buildStoreSnapshot = async (
  table: string,
  relationNames: Set<string>,
) => {
  const resources = Array.from(new Set([table, ...relationNames]));
  const entries = await Promise.all(
    resources.map(async (resource) => {
      const result = await fetchTable(resource);
      return [resource, result.data] as const;
    }),
  );

  const tables = Object.fromEntries(entries);
  return {
    tables,
  };
};

const fileToDataUrl = async (file: File | Blob | any) => {
  if (!isBrowser()) {
    return "";
  }

  if (typeof file === "string") {
    return file;
  }

  if (file instanceof Blob) {
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }

  return "";
};

class ApiQueryBuilder {
  private action: QueryAction = "select";
  private filters: QueryFilter[] = [];
  private selectClause: string | null = "*";
  private payload: any = null;
  private singleResult = false;
  private orderBy?: { column: string; ascending: boolean };
  private rowLimit?: number;

  constructor(private readonly table: string) {}

  select(columns: string = "*") {
    this.selectClause = columns;
    return this;
  }

  insert(payload: any) {
    this.action = "insert";
    this.payload = payload;
    return this;
  }

  update(payload: any) {
    this.action = "update";
    this.payload = payload;
    return this;
  }

  upsert(payload: any) {
    this.action = "upsert";
    this.payload = payload;
    return this;
  }

  delete() {
    this.action = "delete";
    return this;
  }

  eq(column: string, value: any) {
    this.filters.push({ type: "eq", column, value });
    return this;
  }

  neq(column: string, value: any) {
    this.filters.push({ type: "neq", column, value });
    return this;
  }

  in(column: string, value: any[]) {
    this.filters.push({ type: "in", column, value });
    return this;
  }

  lte(column: string, value: any) {
    this.filters.push({ type: "lte", column, value });
    return this;
  }

  match(value: Record<string, any>) {
    this.filters.push({ type: "match", value });
    return this;
  }

  or(value: string) {
    this.filters.push({ type: "or", value });
    return this;
  }

  order(column: string, options?: { ascending?: boolean }) {
    this.orderBy = {
      column,
      ascending: options?.ascending !== false,
    };
    return this;
  }

  limit(value: number) {
    this.rowLimit = value;
    return this;
  }

  single() {
    this.singleResult = true;
    return this;
  }

  maybeSingle() {
    this.singleResult = true;
    return this;
  }

  then<TResult1 = any, TResult2 = never>(
    onfulfilled?:
      | ((value: { data: any; error: any }) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?:
      | ((reason: any) => TResult2 | PromiseLike<TResult2>)
      | null,
  ) {
    return this.execute().then(onfulfilled, onrejected);
  }

  catch<TResult = never>(
    onrejected?:
      | ((reason: any) => TResult | PromiseLike<TResult>)
      | null,
  ) {
    return this.execute().catch(onrejected);
  }

  finally(onfinally?: (() => void) | null) {
    return this.execute().finally(onfinally ?? undefined);
  }

  private async projectRows(rows: any[]) {
    const relationNames = inferRelations(
      this.selectClause,
      this.filters,
      this.orderBy,
    );
    const store = await buildStoreSnapshot(this.table, relationNames);
    const hydratedRows = rows.map((row) => {
      const nextRow = clone(row);
      relationNames.forEach((relation) => {
        if (!nextRow[relation]) {
          nextRow[relation] = getRelatedRecord(store, this.table, nextRow, relation);
        }
      });
      return nextRow;
    });

    let affectedRows = applyFilters(hydratedRows, this.filters);
    affectedRows = sortRows(
      affectedRows,
      this.orderBy?.column,
      this.orderBy?.ascending,
    );

    if (typeof this.rowLimit === "number") {
      affectedRows = affectedRows.slice(0, this.rowLimit);
    }

    const projectedRows = affectedRows.map((row) =>
      applySelect(store, this.table, row, this.selectClause),
    );

    return this.singleResult ? projectedRows[0] || null : projectedRows;
  }

  private async loadRows() {
    const result = await fetchTable(this.table);

    if (result.error) {
      throw new Error(result.error.message || "Errore caricamento risorsa");
    }

    return result.data;
  }

  private async execute() {
    try {
      if (this.action === "select") {
        const rows = await this.loadRows();
        return {
          data: await this.projectRows(rows),
          error: null,
        };
      }

      if (this.action === "insert" || this.action === "upsert") {
        const response = await apiRequest<any>(`/api/v1/${this.table}`, {
          method: "POST",
          body: {
            mode: this.action === "upsert" ? "upsert" : "create",
            data: this.payload,
          },
        });

        if (response.error) {
          return {
            data: this.singleResult ? null : [],
            error: response.error,
          };
        }

        const affected = Array.isArray(response.data)
          ? response.data
          : [response.data].filter(Boolean);

        affected.forEach((row) =>
          notifyRealtime({
            event: this.action === "insert" ? "INSERT" : "UPSERT",
            table: this.table,
            newRow: row,
          }),
        );

        return {
          data: await this.projectRows(affected),
          error: null,
        };
      }

      if (this.action === "update") {
        const existingRows = await this.loadRows();
        const rowsToUpdate = applyFilters(existingRows, this.filters);
        const affectedRows = [];

        for (const row of rowsToUpdate) {
          const response = await apiRequest<any>(`/api/v1/${this.table}/${row.id}`, {
            method: "PATCH",
            body: { data: this.payload },
          });

          if (response.error) {
            return {
              data: this.singleResult ? null : [],
              error: response.error,
            };
          }

          affectedRows.push(response.data);
          notifyRealtime({
            event: "UPDATE",
            table: this.table,
            newRow: response.data,
            oldRow: row,
          });
        }

        return {
          data: await this.projectRows(affectedRows),
          error: null,
        };
      }

      if (this.action === "delete") {
        const existingRows = await this.loadRows();
        const rowsToDelete = applyFilters(existingRows, this.filters);
        const affectedRows = [];

        for (const row of rowsToDelete) {
          const response = await apiRequest<any>(`/api/v1/${this.table}/${row.id}`, {
            method: "DELETE",
          });

          if (response.error) {
            return {
              data: this.singleResult ? null : [],
              error: response.error,
            };
          }

          affectedRows.push(response.data);
          notifyRealtime({
            event: "DELETE",
            table: this.table,
            oldRow: row,
          });
        }

        return {
          data: await this.projectRows(affectedRows),
          error: null,
        };
      }

      return {
        data: this.singleResult ? null : [],
        error: {
          message: "Operazione non supportata",
        },
      };
    } catch (error: any) {
      return {
        data: this.singleResult ? null : [],
        error: {
          message: error?.message || "Supabase API client error",
        },
      };
    }
  }
}

const createApiSupabaseClient = () => ({
  from(table: string) {
    return new ApiQueryBuilder(table);
  },

  auth: {
    async signInWithPassword({
      email,
      password,
    }: {
      email: string;
      password: string;
    }) {
      const response = await apiRequest<{
        user: MockUser | null;
        session: MockSession | null;
      }>("/api/v1/auth/login", {
        method: "POST",
        body: { email, password },
      });

      if (response.data?.session) {
        saveSessionCache(response.data.session);
        emitAuthState("SIGNED_IN", response.data.session);
      }

      return response;
    },

    async signUp({
      email,
      password,
      options,
    }: {
      email: string;
      password: string;
      options?: { data?: AuthMetadata };
    }) {
      const response = await apiRequest<{
        user: MockUser | null;
        session: MockSession | null;
      }>("/api/v1/auth/register", {
        method: "POST",
        body: { email, password, options },
      });

      if (response.data?.session) {
        saveSessionCache(response.data.session);
        emitAuthState("SIGNED_IN", response.data.session);
      }

      return response;
    },

    async signOut() {
      const response = await apiRequest("/api/v1/auth/logout", {
        method: "POST",
      });
      saveSessionCache(null);
      emitAuthState("SIGNED_OUT", null);
      return response;
    },

    async getSession() {
      const response = await apiRequest<{ session: MockSession | null }>(
        "/api/v1/auth/session",
      );

      if (response.data?.session) {
        saveSessionCache(response.data.session);
        return response;
      }

      return {
        data: {
          session: response.data?.session ?? getSessionCache(),
        },
        error: response.error,
      };
    },

    async getUser() {
      const response = await apiRequest<{ user: MockUser | null }>(
        "/api/v1/auth/user",
      );

      if (response.data?.user) {
        const session = getSessionCache();
        if (session) {
          saveSessionCache({
            ...session,
            user: response.data.user,
          });
        }
      }

      return response;
    },

    async updateUser({
      email,
      password,
      data,
    }: {
      email?: string;
      password?: string;
      data?: AuthMetadata;
    }) {
      const response = await apiRequest<{ user: MockUser | null }>(
        "/api/v1/auth/user",
        {
          method: "PATCH",
          body: { email, password, data },
        },
      );

      const session = getSessionCache();
      if (response.data?.user && session) {
        const nextSession = {
          ...session,
          user: response.data.user,
        };
        saveSessionCache(nextSession);
        emitAuthState("USER_UPDATED", nextSession);
      }

      return response;
    },

    onAuthStateChange(
      callback: (event: string, session: MockSession | null) => void,
    ) {
      authListeners.add(callback);
      return {
        data: {
          subscription: {
            unsubscribe: () => authListeners.delete(callback),
          },
        },
        error: null,
      };
    },

    async exchangeCodeForSession() {
      return this.getSession();
    },
  },

  channel(name: string) {
    const channelHandlers: RealtimeHandler[] = [];
    const channelApi = {
      on: (
        event: string,
        filter: { table?: string; event?: string },
        callback: (payload: any) => void,
      ) => {
        channelHandlers.push({
          id: generateId(),
          event: filter.event || event,
          table: filter.table,
          callback,
        });
        return channelApi;
      },
      subscribe: () => {
        realtimeHandlers.set(name, [
          ...(realtimeHandlers.get(name) || []),
          ...channelHandlers,
        ]);

        return {
          unsubscribe: () => {
            const existing = realtimeHandlers.get(name) || [];
            const handlerIds = new Set(channelHandlers.map((handler) => handler.id));
            realtimeHandlers.set(
              name,
              existing.filter((handler) => !handlerIds.has(handler.id)),
            );
          },
        };
      },
    };

    return channelApi;
  },

  removeChannel(channel: { unsubscribe?: () => void }) {
    channel?.unsubscribe?.();
  },

  storage: {
    from(bucket: string) {
      return {
        upload: async (path: string, file: File | Blob | any) => {
          const dataUrl = await fileToDataUrl(file);
          uploadedAssetUrls.set(`${bucket}:${path}`, dataUrl);
          const response = await apiRequest<any>("/api/v1/assets", {
            method: "POST",
            body: {
              mode: "upsert",
              data: {
                bucket,
                path,
                public_url: dataUrl,
                data_base64: dataUrl,
                file_name: file?.name || null,
                mime_type: file?.type || null,
              },
            },
          });

          if (response.error) {
            return {
              data: null,
              error: response.error,
            };
          }

          return {
            data: {
              path,
              fullPath: path,
            },
            error: null,
          };
        },

        getPublicUrl: (path: string) => ({
          data: {
            publicUrl:
              uploadedAssetUrls.get(`${bucket}:${path}`) ||
              `/api/v1/assets?bucket=${encodeURIComponent(
                bucket,
              )}&path=${encodeURIComponent(path)}`,
          },
        }),
      };
    },
  },
});

export const supabase = createApiSupabaseClient();

let queryCache: Map<string, { data: any; timestamp: number }> = new Map();
const CACHE_TTL = 5 * 60 * 1000;

export const cachedQuery = async (
  key: string,
  queryFn: () => Promise<any>,
  ttl: number = CACHE_TTL,
) => {
  const cached = queryCache.get(key);
  const now = Date.now();

  if (cached && now - cached.timestamp < ttl) {
    return cached.data;
  }

  const result = await queryFn();
  queryCache.set(key, { data: result, timestamp: now });

  if (queryCache.size > 100) {
    const expiredKeys = Array.from(queryCache.entries())
      .filter(([, value]) => now - value.timestamp > ttl)
      .map(([cacheKey]) => cacheKey);

    expiredKeys.forEach((cacheKey) => queryCache.delete(cacheKey));
  }

  return result;
};

export const clearCache = (pattern?: string) => {
  if (!pattern) {
    queryCache.clear();
    return;
  }

  const keysToDelete = Array.from(queryCache.keys()).filter((key) =>
    key.includes(pattern),
  );
  keysToDelete.forEach((key) => queryCache.delete(key));
};
