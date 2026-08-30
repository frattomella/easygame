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
 *
 * **La riga che rompeva la catena fiscale.** `operation_type_code` esiste su
 * `payment_transactions` da tempo, e `createPaymentTransaction` lo scrive. Ma
 * questo schema **non lo accettava**, e Zod scarta cio che non dichiara: il
 * campo spariva fra la richiesta e il dominio, la colonna restava `null` su
 * ogni incasso reale, e a valle il motore fiscale classificava ogni documento
 * come «quota attivita» ricadendo su un valore predefinito. Un motore
 * completo che non raggiungeva nessun dato, per un campo mancante in uno
 * schema (§5.2 del piano della Wave 4).
 *
 * Lo stesso vale per il conto finanziario e per la controparte, aggiunti al
 * dominio dalla stessa Wave: senza una riga qui non sarebbero mai arrivati a
 * una riga.
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
    /*
      La causale. Qui si controlla solo la **forma**: che il codice esista nel
      catalogo del club lo sa `fiscal_operation_types`, e chiederlo qui
      significherebbe una lettura del database dentro uno schema.
    */
    operation_type_code: z.string().trim().max(60).nullish(),
    operationTypeCode: z.string().trim().max(60).nullish(),
    /** Su quale conto e entrato il denaro. */
    financial_account_id: z.string().trim().max(64).optional(),
    financialAccountId: z.string().trim().max(64).optional(),
    /** La controparte, quando non e l'atleta: un socio, uno sponsor. */
    counterparty_kind: z.string().trim().max(40).optional(),
    counterpartyKind: z.string().trim().max(40).optional(),
    counterparty_id: z.string().trim().max(64).optional(),
    counterpartyId: z.string().trim().max(64).optional(),
    counterparty_label: z.string().trim().max(200).optional(),
    counterpartyLabel: z.string().trim().max(200).optional(),
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
    operationTypeCode: body.operation_type_code ?? body.operationTypeCode,
    financialAccountId: body.financial_account_id ?? body.financialAccountId,
    counterpartyKind: body.counterparty_kind ?? body.counterpartyKind,
    counterpartyId: body.counterparty_id ?? body.counterpartyId,
    counterpartyLabel: body.counterparty_label ?? body.counterpartyLabel,
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

/* ------------------------------------------- piattaforma: Stripe e billing */

/**
 * Le scritture della console «Pagamenti & Billing».
 *
 * **Perche uno schema discriminato e non cinque rotte.** Sono cinque atti
 * commerciali che la stessa persona compie nella stessa schermata — cambiare
 * la commissione, aprire un collegamento, sospendere un servizio,
 * risincronizzare, configurare il listino — e tenerli su cinque rotte avrebbe
 * voluto dire cinque controlli di ruolo da tenere allineati. Cio che li
 * distingue e `operation`, e cio che ogni ramo accetta e chiuso: una
 * percentuale sopra 100 o un tipo di account inventato vengono rifiutati qui,
 * con scritto perche, invece di arrivare al PSP.
 */
export const platformPaymentsWriteSchema = z.discriminatedUnion("operation", [
  z.object({
    operation: z.literal("commission"),
    /** Assente = la condizione standard di EasyGame. */
    organization_id: z.string().trim().optional(),
    percent: z.coerce
      .number({ invalid_type_error: "La percentuale deve essere un numero" })
      .min(0, "La percentuale non puo essere negativa")
      .max(100, "Una commissione sopra il 100% si porterebbe via l'incasso"),
    fixed_cents: z.coerce.number().int().nonnegative().optional(),
    effective_from: fields.isoDate("Data di decorrenza").optional(),
    note: z.string().trim().max(500).optional(),
  }),
  z.object({
    operation: z.literal("commission_reset"),
    organization_id: fields.id("Club"),
  }),
  z.object({
    operation: z.literal("connect_onboarding"),
    organization_id: fields.id("Club"),
    return_url: z.string().trim().url("URL di ritorno non valido"),
    refresh_url: z.string().trim().url("URL di rinnovo non valido"),
  }),
  z.object({
    operation: z.literal("connect_sync"),
    organization_id: fields.id("Club"),
  }),
  z.object({
    operation: z.literal("connect_toggle"),
    organization_id: fields.id("Club"),
    enabled: z.boolean(),
  }),
  z.object({
    operation: z.literal("settings"),
    connect: z
      .object({
        /*
          Il tipo di account e **irreversibile** per gli account gia creati: si
          accetta il valore, e la console avverte. Vedi ADR-0051.
        */
        accountType: z.enum(["standard", "express"]).optional(),
        defaultCountry: z.string().trim().length(2).optional(),
        onboardingEnabled: z.boolean().optional(),
      })
      .optional(),
    billing: z
      .object({
        prices: z
          .object({
            plusMonthly: z.string().trim().max(120).optional(),
            plusAnnual: z.string().trim().max(120).optional(),
          })
          .optional(),
        customerPortalEnabled: z.boolean().optional(),
      })
      .optional(),
    fiscal: z
      .object({
        /** `null` toglie la scelta e riporta la trasmissione a «non attiva». */
        providerKey: z.string().trim().max(60).nullable().optional(),
        environment: z.enum(["sandbox", "production"]).optional(),
      })
      .optional(),
  }),
]);

/* --------------------------------------------------- fiscalita del club */

/**
 * Il profilo fiscale.
 *
 * **Chiuso, ma quasi tutto opzionale.** Chiuso perche i campi sono noti e un
 * campo in piu qui e quasi sempre un errore di battitura che finirebbe in un
 * documento. Opzionale perche un profilo a meta e la condizione normale di chi
 * sta configurando: cio che manca lo si chiede al momento di emettere, dove
 * serve davvero (`missingForInvoicing`).
 */
export const fiscalProfileInputSchema = z.object({
  legalName: z.string().trim().max(200).optional(),
  legalForm: z.string().trim().max(40).optional(),
  fiscalCode: z.string().trim().max(20).optional(),
  vatNumber: z.string().trim().max(20).optional(),
  taxRegimeCode: z.string().trim().max(10).optional(),
  specialRegimes: z.array(z.string().trim().max(40)).optional(),
  address: z.string().trim().max(200).optional(),
  city: z.string().trim().max(120).optional(),
  province: z.string().trim().max(4).optional(),
  postalCode: z.string().trim().max(10).optional(),
  country: z.string().trim().max(4).optional(),
  cityCode: z.string().trim().max(8).optional(),
  pec: z.string().trim().max(320).optional(),
  recipientCode: z.string().trim().max(10).optional(),
  reaOffice: z.string().trim().max(4).optional(),
  reaNumber: z.string().trim().max(40).optional(),
  reaCapital: z.coerce.number().nonnegative().nullable().optional(),
  reaSoleShareholder: z.boolean().nullable().optional(),
  reaInLiquidation: z.boolean().nullable().optional(),
  stampDuty: z
    .object({
      enabled: z.boolean().optional(),
      thresholdCents: z.coerce.number().int().nonnegative().optional(),
      amountCents: z.coerce.number().int().nonnegative().optional(),
      chargedTo: z.enum(["issuer", "recipient"]).optional(),
    })
    .optional(),
  markCompleted: z.boolean().optional(),
});

/**
 * Un tipo di operazione.
 *
 * `code` c'e ma non e modificabile a valle **di proposito**: e la chiave con
 * cui gli incassi gia registrati citano la classificazione, e cambiarlo li
 * lascerebbe a citare qualcosa che non esiste piu.
 */
export const fiscalOperationTypeInputSchema = z.object({
  code: fields.id("Codice operazione"),
  label: z.string().trim().max(200).optional(),
  documentRoute: z
    .enum(["none", "receipt", "invoice", "invoice_or_receipt"])
    .optional(),
  vatRate: z.coerce.number().min(0).max(100).nullable().optional(),
  vatNature: z.string().trim().max(10).nullable().optional(),
  activityScope: z
    .enum(["institutional", "commercial", "unspecified"])
    .optional(),
  /** Verso suggerito, mai imposto. `null` = la causale serve in entrambi. */
  directionHint: z.enum(["IN", "OUT"]).nullable().optional(),
  /** La voce di rendiconto: testo libero del club, non un piano dei conti. */
  reportingBucket: z.string().trim().max(120).nullable().optional(),
  defaultDescription: z.string().trim().max(200).nullable().optional(),
  /*
    I due flag fiscali sono **tri-stato**, e `nullable()` non e una comodita:
    `null` significa «nessuno l'ha dichiarato» ed e diverso da `false`. Un
    `z.boolean().optional()` avrebbe reso impossibile ritirare una
    dichiarazione, e un valore predefinito `false` avrebbe scritto un no che
    nessuno ha detto.
  */
  deductible: z.boolean().nullable().optional(),
  isMembershipFee: z.boolean().nullable().optional(),
  isActive: z.boolean().optional(),
  notes: z.string().trim().max(1000).optional(),
});

/**
 * La disattivazione o la cancellazione di una causale.
 *
 * `action` e obbligatoria: «disattiva» e «cancella» sono due gesti diversi con
 * due esiti diversi, e una rotta che li indovinasse dal contesto ne
 * sceglierebbe uno per conto di chi non l'ha detto.
 */
export const fiscalOperationTypeActionSchema = z.object({
  code: fields.id("Codice operazione"),
  action: z.enum(["activate", "deactivate", "delete"], {
    required_error: "Azione obbligatoria",
    invalid_type_error: "Azione non riconosciuta",
  }),
});

/* ------------------------------------------------------- conti finanziari */

/**
 * L'apertura di un conto finanziario.
 *
 * **Il saldo non compare, e non e una dimenticanza.** Un conto non ha un saldo
 * che si digita: il saldo e la somma dei suoi movimenti. Cio che si dichiara e
 * il **saldo di apertura**, cioe quanto c'era il giorno in cui il conto entra
 * in EasyGame, e ha una data propria perche un numero senza data non si sa a
 * cosa si riferisca.
 */
export const financialAccountCreateSchema = z.object({
  name: fields.text("Nome del conto", 120),
  kind: z.enum(["CASH", "BANK", "CLEARING"]).optional(),
  iban: z.string().trim().max(34).nullable().optional(),
  bankName: z.string().trim().max(120).nullable().optional(),
  /** Facoltativa e mai obbligatoria: un conto senza sede vale per tutte (ADR-0038). */
  siteId: z.string().trim().max(200).nullable().optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
  openingBalance: z.coerce.number().finite().optional(),
  openingBalanceCents: z.coerce.number().int().optional(),
  openingBalanceAt: fields.isoDate("Data del saldo di apertura").optional(),
});

/**
 * La modifica di un conto.
 *
 * **`kind`, `openingBalance` e `openingBalanceAt` non ci sono.** Il tipo dice
 * la natura di tutti i movimenti gia registrati e il saldo di apertura e il
 * punto di partenza della somma: cambiarli riscrive retroattivamente cio che
 * il conto ha significato finora. Si archivia e se ne apre un altro.
 */
export const financialAccountPatchSchema = z.object({
  name: z.string().trim().min(1, "Nome del conto obbligatorio").max(120).optional(),
  iban: z.string().trim().max(34).nullable().optional(),
  bankName: z.string().trim().max(120).nullable().optional(),
  siteId: z.string().trim().max(200).nullable().optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
  /** `true` archivia, `false` riapre. Non esiste una cancellazione. */
  archived: z.boolean().optional(),
});

export const documentSeriesInputSchema = z.object({
  kind: z.enum(["receipt", "invoice", "credit_note"]),
  code: z.string().trim().max(8),
  label: z.string().trim().max(120),
  prefix: z.string().trim().max(4).optional(),
  isDefault: z.boolean().optional(),
  isActive: z.boolean().optional(),
});

/**
 * L'annullamento di un documento emesso.
 *
 * Il motivo e **obbligatorio**: un annullamento senza motivo non si
 * ricostruisce mesi dopo, ed e esattamente la domanda che si pone chi trova un
 * buco in una numerazione.
 */
export const documentCancellationSchema = z.object({
  reason: fields.text("Motivo dell'annullamento", 500),
});

/* ----------------------------------------------------- checkout online */

/**
 * L'apertura di un checkout online.
 *
 * **Cosa non compare qui, e non e una dimenticanza:** il provider, il conto su
 * cui il denaro finisce e la commissione. Un client che potesse sceglierli
 * sceglierebbe il provider con meno controlli, il proprio conto e nessuna
 * commissione. Li dicono la configurazione di piattaforma e l'account connesso
 * della societa.
 */
export const checkoutSessionInputSchema = z.object({
  clubId: z.string().trim().optional(),
  club_id: z.string().trim().optional(),
  paymentId: z.string().trim().optional(),
  payment_id: z.string().trim().optional(),
  athleteId: z.string().trim().optional(),
  athlete_id: z.string().trim().optional(),
  amountCents: z.coerce.number().int().optional(),
  amount_cents: z.coerce.number().int().optional(),
  description: z.string().trim().max(300).optional(),
  successUrl: z.string().trim().url("URL di ritorno non valido").optional(),
  success_url: z.string().trim().url("URL di ritorno non valido").optional(),
  cancelUrl: z.string().trim().url("URL di annullamento non valido").optional(),
  cancel_url: z.string().trim().url("URL di annullamento non valido").optional(),
  payer: z
    .object({
      email: z.string().trim().max(320).optional(),
      name: z.string().trim().max(200).optional(),
    })
    .optional(),
});
