/**
 * Gli schemi degli endpoint che accettano un corpo strutturato.
 *
 * **Perche non uno schema per ogni rotta.** Il CRUD generico
 * (`/api/v1/<resource>`) accetta cinquanta risorse con forme diverse e in
 * evoluzione: uno schema chiuso li rifiuterebbe a raffica, e la Web App
 * smetterebbe di funzionare per campi che nessuno stava sbagliando. Gli
 * schemi stanno dove il corpo e **chiuso e conosciuto**: autenticazione,
 * denaro, stagioni, contributi, piano commerciale. Sono anche i posti in cui
 * un valore sbagliato costa di piu.
 *
 * **Cosa NON fanno.** Non controllano permessi, non toccano il database e non
 * decidono se un'operazione ha senso nel dominio — «l'importo supera il
 * residuo» resta una regola del registro incassi, dove vive il residuo. Qui
 * si stabilisce solo che il corpo e della forma dichiarata.
 */

import { fields, z } from "./index";

/* --------------------------------------------------- autenticazione */

export const loginInputSchema = z.object({
  email: fields.email(),
  password: fields.password(),
});

/**
 * La registrazione valida **le due cose che decidono l'esito**: email e
 * password. Il resto passa (`passthrough`) perche il corpo trasporta anche i
 * dati anagrafici raccolti dal form, che sono aperti e cambiano con i form;
 * chiuderli qui rifiuterebbe iscrizioni per un campo in piu, che e il modo
 * piu rapido di far tornare tutti alle coercizioni a mano.
 *
 * La **forza** della password non si valida qui: la politica vive in
 * `src/lib/auth/password-policy.ts` e resta l'unica a conoscerla.
 */
export const registerInputSchema = z
  .object({
    email: fields.email(),
    password: fields.password(),
  })
  .passthrough();

export const forgotPasswordInputSchema = z.object({
  email: fields.email(),
});

export const resetPasswordInputSchema = z.object({
  token: fields.text("Token", 512),
  password: fields.password(),
});

/* ---------------------------------------------------------- denaro */

/**
 * Un incasso.
 *
 * Accetta le due forme dei nomi — `payment_id` e `paymentId` — perche
 * entrambe circolano gia fra i chiamanti, e uniformarle sarebbe un cambio di
 * contratto che non appartiene a questo lavoro. Lo schema le riconosce
 * entrambe e restituisce una forma sola.
 */
export const paymentTransactionInputSchema = z
  .object({
    organization_id: z.string().trim().optional(),
    organizationId: z.string().trim().optional(),
    payment_id: z.string().trim().optional(),
    paymentId: z.string().trim().optional(),
    athlete_id: z.string().trim().optional(),
    athleteId: z.string().trim().optional(),
    amount: fields.amount("Importo dell'incasso"),
    paid_at: fields.isoDate("Data dell'incasso").optional(),
    paidAt: fields.isoDate("Data dell'incasso").optional(),
    payment_method: z.string().trim().max(120).optional(),
    paymentMethod: z.string().trim().max(120).optional(),
    notes: z.string().trim().max(2000).optional(),
    source: z.string().trim().max(60).optional(),
    external_reference: z.string().trim().max(200).optional(),
    externalReference: z.string().trim().max(200).optional(),
    allow_overpayment: z.boolean().optional(),
    allowOverpayment: z.boolean().optional(),
  })
  .transform((body) => ({
    organizationId: body.organization_id ?? body.organizationId,
    paymentId: body.payment_id ?? body.paymentId,
    athleteId: body.athlete_id ?? body.athleteId,
    amount: body.amount,
    paidAt: body.paid_at ?? body.paidAt,
    paymentMethod: body.payment_method ?? body.paymentMethod,
    notes: body.notes,
    source: body.source,
    externalReference: body.external_reference ?? body.externalReference,
    allowOverpayment: Boolean(body.allow_overpayment ?? body.allowOverpayment),
  }));

/**
 * Le azioni su un incasso gia registrato.
 *
 * Elenco chiuso: `reverse` storna, `issue-receipt` e `issue-invoice` emettono
 * un documento. Un'azione inventata non deve arrivare fino al dominio per
 * essere rifiutata li con un messaggio meno chiaro.
 */
export const paymentTransactionActionSchema = z.object({
  action: z.enum(["reverse", "issue-receipt", "issue-invoice"], {
    errorMap: () => ({ message: "Azione non riconosciuta" }),
  }),
  reason: z.string().trim().max(500).optional(),
  notes: z.string().trim().max(2000).optional(),
});

/* -------------------------------------------------------- stagioni */

export const seasonInputSchema = z.object({
  label: fields.text("Nome della stagione", 120),
  startDate: fields.isoDate("Data di inizio").optional(),
  endDate: fields.isoDate("Data di fine").optional(),
  activate: z.boolean().optional(),
  /*
    Il travaso da una stagione all'altra: quali collezioni copiare. La forma
    la conosce `seasons.ts`, qui si difende solo dal tipo — un oggetto al
    posto di un booleano finirebbe dentro un `Boolean(...)` e diventerebbe
    `true` senza che nessuno l'abbia chiesto.
  */
  rollover: z.record(z.unknown()).nullable().optional(),
});

/* -------------------------------------------- piano e servizi (Cedi) */

/**
 * Le tre scritture di `POST /api/v1/entitlements`.
 *
 * Uno schema discriminato e non tre rotte: sono decisioni che si prendono
 * insieme, e tre rotte avrebbero voluto dire tre controlli di ruolo da tenere
 * allineati.
 */
export const entitlementWriteSchema = z.preprocess(
  (value) =>
    /*
      `operation` assente vuol dire «eccezione»: e la forma con cui la console
      di piattaforma scriveva prima che il piano e i servizi passassero da
      qui, ed e ancora quella che manda. Metterle il valore predefinito qui
      invece che in ogni ramo evita di rompere il chiamante esistente.
    */
    value && typeof value === "object" && !Array.isArray(value)
      ? { operation: "override", ...(value as Record<string, unknown>) }
      : value,
  z.discriminatedUnion("operation", [
  z.object({
    operation: z.literal("plan"),
    organization_id: fields.id("Societa"),
    plan: z.enum(["free", "plus"]).optional(),
    status: z
      .enum([
        "not_active",
        "trialing",
        "active",
        "past_due",
        "cancelled",
        "expired",
      ])
      .optional(),
    renewal_date: fields.isoDate("Data di rinnovo").optional(),
  }),
  z.object({
    operation: z.literal("service"),
    organization_id: fields.id("Societa"),
    key: fields.text("Servizio", 60),
    value: z.boolean(),
  }),
  z.object({
    operation: z.literal("override"),
    organization_id: fields.id("Societa"),
    key: fields.text("Funzione", 60),
    /*
      Tre valori e non due: `null` toglie l'eccezione e riporta la funzione
      alla regola del listino, `false` la vieta. Senza la distinzione,
      «rimetti com'era» sarebbe irraggiungibile.
    */
    value: z.boolean().nullable(),
  }),
  ]),
);

/* ------------------------------------------------------ contributi */

/**
 * Un bando.
 *
 * **`passthrough` non e pigrizia, e la regola del dominio.** Le regole di un
 * bando sono **configurazione, mai codice** (CLAUDE.md, sezione 2): periodi,
 * soglie, unita di misura e pro-rata arrivano come dati e `buildProgramData`
 * li conosce. Uno schema chiuso qui li scarterebbe in silenzio — e un bando
 * caricato senza le sue regole e peggio di un bando rifiutato.
 *
 * Cio che questo schema garantisce e che i campi **numerici** siano numeri
 * non negativi: un plafond negativo o una soglia scritta come testo passavano
 * e si scoprivano al primo calcolo dei maturati.
 */
export const fundingProgramInputSchema = z
  .object({
    name: fields.text("Nome del bando", 200),
    funder_name: z.string().trim().max(200).optional(),
    funderName: z.string().trim().max(200).optional(),
    athlete_plafond: z.coerce.number().nonnegative().optional(),
    athletePlafond: z.coerce.number().nonnegative().optional(),
    period_amount: z.coerce.number().nonnegative().optional(),
    periodAmount: z.coerce.number().nonnegative().optional(),
    requirement_min: z.coerce.number().nonnegative().optional(),
    requirementMin: z.coerce.number().nonnegative().optional(),
    requirement_unit: z.string().trim().max(40).optional(),
    requirementUnit: z.string().trim().max(40).optional(),
  })
  .passthrough();

/**
 * Una liquidazione: quanto l'ente ha effettivamente versato, e su quali
 * periodi maturati.
 *
 * `lines` e opzionale perche una liquidazione puo arrivare senza dettaglio e
 * il dominio sa distribuirla; se c'e, ogni riga deve avere il periodo e
 * l'importo — una riga a meta si scoprirebbe altrimenti solo a scrittura
 * avvenuta.
 */
export const fundingSettlementInputSchema = z.object({
  program_id: z.string().trim().optional(),
  programId: z.string().trim().optional(),
  amount: fields.amount("Importo liquidato"),
  settled_at: fields.isoDate("Data di liquidazione").optional(),
  settledAt: fields.isoDate("Data di liquidazione").optional(),
  reference: z.string().trim().max(200).optional(),
  method: z.string().trim().max(60).optional(),
  notes: z.string().trim().max(2000).optional(),
  lines: z
    .array(
      z.object({
        accrual_id: z.string().trim().optional(),
        accrualId: z.string().trim().optional(),
        amount: fields.amount("Importo della riga"),
      }),
    )
    .optional(),
});
