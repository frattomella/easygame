import { API_REGISTRY } from "@/lib/api/registry";

export type InternalApiStatus =
  | "Pronta"
  | "Da verificare"
  | "Interna"
  | "Non documentata";

export type InternalApiDocEntry = {
  area: string;
  method: string;
  path: string;
  description: string;
  auth: string;
  params: string;
  body: string;
  response: string;
  mobileNotes: string;
  status: InternalApiStatus;
};

const resourceAreaMap: Record<string, string> = {
  athletes: "Atleti",
  athlete_category_memberships: "Atleti",
  simplified_athletes: "Atleti",
  trainings: "Allenamenti",
  training_attendance: "Allenamenti",
  weekly_schedule: "Allenamenti",
  payments: "Pagamenti",
  simplified_payments: "Pagamenti",
  payment_methods: "Pagamenti",
  invoices: "Pagamenti",
  receipts: "Pagamenti",
  trainer_payments: "Pagamenti",
  expected_expenses: "Pagamenti",
  expected_income: "Pagamenti",
  sponsor_payments: "Pagamenti",
  bank_accounts: "Pagamenti",
  transactions: "Pagamenti",
  dashboards: "Dashboard",
  notifications: "Dashboard",
  simplified_notifications: "Dashboard",
  sponsors: "Sponsor",
  staff_members: "Staff/Soci",
  members: "Staff/Soci",
  trainers: "Staff/Soci",
  assets: "File/Asset",
  document_templates: "File/Asset",
  medical_certificates: "Atleti",
  simplified_certificates: "Atleti",
  clubs: "Club",
  organizations: "Club",
  organization_users: "Club",
  categories: "Club",
  access_tokens: "Auth",
};

const getResourceName = (path: string) => path.split("/")[3] || "";

const getArea = (path: string, name: string) => {
  if (path.includes("/auth/")) {
    return "Auth";
  }

  if (path.includes("/admin/")) {
    return "Altro";
  }

  if (path.includes("/registry")) {
    return "Altro";
  }

  if (path.includes("/training-automation")) {
    return "Allenamenti";
  }

  const resource = getResourceName(path);
  return resourceAreaMap[resource] || resourceAreaMap[name.split(".")[0]] || "Altro";
};

const getAuthLabel = (path: string) => {
  if (path.includes("/auth/login") || path.includes("/auth/register")) {
    return "Non richiesta";
  }

  if (
    path.includes("/auth/providers") ||
    path.includes("/auth/oauth/") ||
    path.includes("/registry")
  ) {
    return "Non richiesta / pubblica tecnica";
  }

  if (path.includes("/admin/")) {
    return "Platform admin";
  }

  return "Utente autenticato";
};

const getParamsLabel = (method: string, path: string) => {
  if (path.includes(":provider")) {
    return "provider: google | microsoft";
  }

  if (path.includes(":id")) {
    return "id risorsa nel path; header opzionale x-active-club-id";
  }

  if (path.includes("/:resource")) {
    return "resource nel path; query/filter dedotti dalla risorsa";
  }

  if (method === "GET" && !path.includes("/auth/")) {
    return "Query string opzionale; header opzionale x-active-club-id";
  }

  return "-";
};

const getBodyLabel = (method: string, path: string) => {
  if (method === "GET" || method === "DELETE") {
    return "-";
  }

  if (path.includes("/auth/login")) {
    return "email, password";
  }

  if (path.includes("/auth/register")) {
    return "email, password, dati profilo, dati club opzionali";
  }

  if (path.includes("/auth/verify/")) {
    return "payload verifica canale; codice quando richiesto";
  }

  if (path.includes("/auth/memberships/activate")) {
    return "organizationId / clubId";
  }

  if (path.includes("/auth/access/redeem")) {
    return "token accesso; target allenatore o genitore dedotto dal payload token";
  }

  if (path.includes(":id")) {
    return "data o payload parziale della risorsa";
  }

  return "data o payload della risorsa";
};

const getResponseLabel = (method: string, path: string) => {
  if (path.includes("/auth/login") || path.includes("/auth/register")) {
    return "Sessione utente, profilo e metadati di accesso";
  }

  if (path.includes("/auth/session") || path.includes("/auth/user")) {
    return "Profilo/sessione utente corrente";
  }

  if (method === "GET" && path.includes(":id")) {
    return "Oggetto risorsa o errore";
  }

  if (method === "GET") {
    return "Array data o oggetto informativo";
  }

  if (method === "DELETE") {
    return "Risorsa eliminata o conferma operazione";
  }

  return "Oggetto creato/aggiornato e campo error";
};

const getMobileNotes = (path: string, mobileReady: boolean) => {
  if (path.includes("/auth/oauth/")) {
    return "Flusso web redirect: verificare deep link prima dell'uso mobile.";
  }

  if (path.includes("/admin/")) {
    return "Solo strumenti interni, non previsto per app mobile standard.";
  }

  if (path.includes("/registry")) {
    return "Utile per bootstrap tecnico, non mostrare nell'app utente.";
  }

  if (path.includes("/auth/access/redeem")) {
    return "Da usare per collegare account a profili allenatore o genitore tramite token monouso.";
  }

  if (!mobileReady) {
    return "Endpoint da validare prima di esporlo alla mobile app.";
  }

  return "Usare sessione/Bearer token e x-active-club-id quando l'endpoint lavora sul club attivo.";
};

const documentedApiFromRegistry = API_REGISTRY.flatMap<InternalApiDocEntry>(
  (entry) =>
    entry.method.split("|").map((method) => ({
      area: getArea(entry.path, entry.name),
      method,
      path: entry.path,
      description: entry.description,
      auth: getAuthLabel(entry.path),
      params: getParamsLabel(method, entry.path),
      body: getBodyLabel(method, entry.path),
      response: getResponseLabel(method, entry.path),
      mobileNotes: getMobileNotes(entry.path, entry.mobile_ready),
      status: entry.mobile_ready ? "Pronta" : "Da verificare",
    })),
);

const extraInternalApis: InternalApiDocEntry[] = [
  {
    area: "Altro",
    method: "GET",
    path: "/api/v1/admin/overview",
    description: "Panoramica interna di utenti, club e membership piattaforma.",
    auth: "Platform admin",
    params: "-",
    body: "-",
    response: "Summary globale, elenco utenti e club.",
    mobileNotes: "Non usare nella mobile app utente.",
    status: "Interna",
  },
  {
    area: "Altro",
    method: "DELETE",
    path: "/api/v1/admin/users/:id",
    description: "Eliminazione interna account piattaforma.",
    auth: "Platform admin",
    params: "id account nel path",
    body: "-",
    response: "Conferma eliminazione account.",
    mobileNotes: "Solo pannello amministrativo interno.",
    status: "Interna",
  },
  {
    area: "Altro",
    method: "DELETE",
    path: "/api/v1/admin/clubs/:id",
    description: "Eliminazione interna club e dati collegati.",
    auth: "Platform admin",
    params: "id club nel path",
    body: "-",
    response: "Conferma eliminazione club.",
    mobileNotes: "Solo pannello amministrativo interno.",
    status: "Interna",
  },
  {
    area: "Allenamenti",
    method: "POST",
    path: "/api/v1/training-automation",
    description: "Generazione/aggiornamento automazioni allenamenti.",
    auth: "Utente autenticato",
    params: "-",
    body: "Configurazione automazione allenamenti.",
    response: "Risultato dell'operazione di automazione.",
    mobileNotes: "Da usare solo da UI autorizzate del club.",
    status: "Da verificare",
  },
  {
    area: "Allenamenti",
    method: "GET",
    path: "/api/v1/training-automation",
    description: "Esecuzione/diagnostica automazioni allenamenti.",
    auth: "Utente autenticato o CRON_SECRET",
    params: "secret opzionale per cron autorizzato",
    body: "-",
    response: "Stato o risultato dell'automazione.",
    mobileNotes: "Endpoint operativo interno, non previsto per app mobile standard.",
    status: "Interna",
  },
];

export const internalApiRegistry = [
  ...documentedApiFromRegistry,
  ...extraInternalApis,
].sort((left, right) =>
  `${left.area}-${left.path}-${left.method}`.localeCompare(
    `${right.area}-${right.path}-${right.method}`,
    "it",
    { sensitivity: "base" },
  ),
);

export const internalApiAreas = Array.from(
  new Set(internalApiRegistry.map((entry) => entry.area)),
).sort((left, right) => left.localeCompare(right, "it"));
