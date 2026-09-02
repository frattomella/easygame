/**
 * La **configurazione fiscale di un'organizzazione**: profilo, serie di
 * numerazione, tipi di operazione. **Unico proprietario.**
 *
 * **Perche i tre stanno insieme.** Sono le tre cose che una societa dichiara
 * su di se prima di poter emettere un documento, e si leggono sempre insieme:
 * il motore fiscale ha bisogno di tutte e tre per proporre qualcosa. Tenerle
 * in tre moduli avrebbe voluto dire tre letture e tre punti in cui dimenticare
 * di seminare i valori iniziali.
 *
 * **Questo dominio e di proprieta del club**, e la differenza con il Blocco D
 * lato piattaforma e netta: le condizioni commerciali di EasyGame le decide
 * Cedi Soft, il proprio regime fiscale lo dichiara la societa. Nessuno dei due
 * puo scrivere nell'altro. Vedi ADR-0052.
 */

import { prisma } from "./prisma";
import {
  createEmptyFiscalProfile,
  normalizeFiscalProfile,
  validateFiscalProfile,
  type FiscalProfile,
  type FiscalProfileIssue,
} from "@/lib/fiscal/fiscal-profile";
import {
  OPERATION_TYPE_SEEDS,
  asDeclaredFlag,
  classificationChanged,
  classificationOf,
  isActivityScope,
  isClassificationDeclared,
  isDirectionHint,
  normalizeOperationType,
  type ActivityScope,
  type DirectionHint,
  type NormalizedOperationType,
} from "@/lib/fiscal/operation-types";
import {
  DOCUMENT_NUMBER_KIND_DEFINITIONS,
  normalizeSeriesCode,
  type DocumentNumberKind,
} from "@/lib/documents/numbering";

const asText = (value: unknown) => String(value ?? "").trim();

const profileClient = () => (prisma as any).organizationFiscalProfile;
const operationClient = () => (prisma as any).fiscalOperationType;
const seriesClient = () => (prisma as any).documentSeries;

/* ------------------------------------------------------------- profilo */

/**
 * Il profilo fiscale di un club.
 *
 * **Ripiega sull'anagrafica quando la riga non esiste ancora.** Un club creato
 * prima del Blocco D ha gia ragione sociale, partita IVA e indirizzo dentro
 * `clubs`: partire da li invece che da un modulo vuoto evita di far ridigitare
 * dati che l'applicazione ha gia. Il ripiego e **solo in lettura**: al primo
 * salvataggio nasce la riga, e da quel momento comanda lei.
 */
export const getFiscalProfile = async (
  organizationId: string,
): Promise<FiscalProfile> => {
  const id = asText(organizationId);
  if (!id) throw new Error("Accesso negato: nessun club indicato");

  const row = await profileClient().findUnique({
    where: { organization_id: id },
  });

  if (row) return normalizeFiscalProfile(row);

  const club = await (prisma as any).club.findUnique({
    where: { id },
    select: {
      name: true,
      business_name: true,
      vat_number: true,
      fiscal_code: true,
      pec: true,
      sdi_code: true,
      tax_regime: true,
      legal_address: true,
      legal_city: true,
      legal_postal_code: true,
      legal_province: true,
      legal_country: true,
    },
  });

  if (!club) return createEmptyFiscalProfile();

  return normalizeFiscalProfile({
    legalName: club.business_name || club.name || "",
    vatNumber: club.vat_number || "",
    fiscalCode: club.fiscal_code || "",
    pec: club.pec || "",
    recipientCode: club.sdi_code || "",
    address: club.legal_address || "",
    city: club.legal_city || "",
    postalCode: club.legal_postal_code || "",
    province: club.legal_province || "",
    country: club.legal_country === "Italia" ? "IT" : club.legal_country || "IT",
  });
};

export type SaveFiscalProfileResult = {
  profile: FiscalProfile;
  issues: FiscalProfileIssue[];
};

/**
 * Scrive il profilo fiscale.
 *
 * **Rifiuta cio che e scritto male, accetta cio che e incompleto.** Un profilo
 * a meta e la condizione normale di una societa che sta configurando
 * EasyGame; una partita IVA di dieci cifre e un errore che, salvato, si
 * ripresenta come scarto dello SdI mesi dopo.
 */
export const saveFiscalProfile = async (input: {
  organizationId: string;
  profile: unknown;
  markCompleted?: boolean;
}): Promise<SaveFiscalProfileResult> => {
  const id = asText(input.organizationId);
  if (!id) throw new Error("Accesso negato: nessun club indicato");

  const profile = normalizeFiscalProfile(input.profile);
  const issues = validateFiscalProfile(profile);

  if (issues.length) {
    const error: any = new Error(`${issues[0].path}: ${issues[0].message}`);
    error.issues = issues;
    throw error;
  }

  const data = {
    legal_name: profile.legalName || null,
    legal_form: profile.legalForm,
    fiscal_code: profile.fiscalCode || null,
    vat_number: profile.vatNumber || null,
    tax_regime_code: profile.taxRegimeCode || null,
    special_regimes: profile.specialRegimes,
    address: profile.address || null,
    city: profile.city || null,
    province: profile.province || null,
    postal_code: profile.postalCode || null,
    country: profile.country || "IT",
    city_code: profile.cityCode || null,
    pec: profile.pec || null,
    recipient_code: profile.recipientCode || null,
    rea_office: profile.reaOffice || null,
    rea_number: profile.reaNumber || null,
    rea_capital: profile.reaCapital,
    rea_sole_shareholder: profile.reaSoleShareholder,
    rea_in_liquidation: profile.reaInLiquidation,
    stamp_duty: profile.stampDuty,
    settings: profile.settings,
    ...(input.markCompleted ? { completed_at: new Date() } : {}),
  };

  const row = await profileClient().upsert({
    where: { organization_id: id },
    create: { organization_id: id, ...data },
    update: data,
  });

  return { profile: normalizeFiscalProfile(row), issues: [] };
};

/* ------------------------------------------------------ tipi operazione */

/**
 * I tipi di operazione di un club, seminando il catalogo iniziale al primo
 * accesso.
 *
 * **Perche la semina e qui e non in una migrazione.** Una migrazione che
 * inserisse nove righe per ogni club esistente sarebbe una scrittura di massa
 * su dati di produzione per una funzione che nessuno ha ancora aperto. Qui le
 * righe nascono quando servono, e per i club che non useranno mai la
 * classificazione non nascono affatto.
 */
export const listOperationTypes = async (
  organizationId: string,
  options: { seed?: boolean } = {},
): Promise<NormalizedOperationType[]> => {
  const id = asText(organizationId);
  if (!id) throw new Error("Accesso negato: nessun club indicato");

  const rows = await operationClient().findMany({
    where: { organization_id: id },
    orderBy: { code: "asc" },
  });

  if (options.seed === false) {
    return rows.map(normalizeOperationType);
  }

  /*
    **Il seme completa, non popola soltanto.**

    Fin qui la condizione era `rows.length`: bastava una riga perche il seme
    non girasse piu. Ha funzionato finche il catalogo di sistema non e
    cambiato — e la Wave 6 lo cambia, aggiungendo le quattro causali che
    chiudono W4-R7: tre in uscita e la liquidazione di un contributo, che e
    invece un'entrata.

    Con la vecchia condizione un club **gia configurato** — cioe ogni club
    vero — non le avrebbe viste mai: avrebbe continuato a non poter
    classificare un compenso, e il rendiconto avrebbe continuato a dire
    «non classificato» su quasi tutte le uscite. Il difetto sarebbe stato
    invisibile in sviluppo, dove i club nascono vuoti, e universale in
    produzione.

    Si scrivono **solo le mancanti**, per codice. Cio che il club ha
    configurato non si tocca, e una causale di sistema disattivata resta
    disattivata: la riga c'e, quindi `skipDuplicates` la salta e non la
    resuscita. Una causale di sistema non si puo cancellare — si disattiva
    (vedi `deleteOperationType`) — quindi non esiste il caso «il club l'ha
    tolta apposta e gliela rimettiamo».
  */
  const presenti = new Set(rows.map((row: any) => asText(row.code)));
  const mancanti = OPERATION_TYPE_SEEDS.filter(
    (seed) => !presenti.has(seed.code),
  );

  if (!mancanti.length) {
    return rows.map(normalizeOperationType);
  }

  await operationClient().createMany({
    data: mancanti.map((seed) => ({
      organization_id: id,
      code: seed.code,
      label: seed.label,
      document_route: seed.documentRoute,
      activity_scope: seed.activityScope,
      direction_hint: seed.directionHint ?? null,
      is_system: true,
      reporting_bucket: seed.reportingBucket ?? null,
      notes: seed.notes || null,
      /*
        Nessuna voce del seme nasce con `deductible`, `is_membership_fee` o un
        autore della classificazione. Le sette `unspecified` restano tali
        finche un professionista non le guarda (§15 del piano): una causale
        seminata gia classificata sembrerebbe configurata, e nessuno tornerebbe
        a controllarla.
      */
    })),
    /*
      Due richieste simultanee sulla stessa societa proverebbero a seminare
      entrambe. La seconda non deve fallire: il catalogo c'e comunque.
    */
    skipDuplicates: true,
  });

  const seeded = await operationClient().findMany({
    where: { organization_id: id },
    orderBy: { code: "asc" },
  });

  return seeded.map(normalizeOperationType);
};

export const getOperationType = async (input: {
  organizationId: string;
  code: unknown;
}): Promise<NormalizedOperationType | null> => {
  const code = asText(input.code);
  if (!code) return null;

  const row = await operationClient().findFirst({
    where: { organization_id: asText(input.organizationId), code },
  });

  return row ? normalizeOperationType(row) : null;
};

/**
 * Le chiavi che il chiamante puo esprimere, in entrambe le grafie.
 *
 * Serve a distinguere «non lo hai nominato» da «lo hai messo a null», che
 * sono due intenzioni diverse: la prima conserva, la seconda cancella una
 * dichiarazione. Senza questa distinzione un `PATCH` che tocca solo
 * l'etichetta azzererebbe l'aliquota e l'ambito — ed e cio che il salvataggio
 * precedente faceva davvero, perche normalizzava il corpo e riscriveva tutte
 * le colonne.
 */
const dichiarato = (updates: Record<string, any>, ...keys: string[]) =>
  keys.some((key) => Object.prototype.hasOwnProperty.call(updates, key));

const asRecord = (value: unknown): Record<string, any> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, any>)
    : {};

/**
 * Aggiorna la configurazione di un tipo di operazione.
 *
 * **Il codice non si cambia mai.** E la chiave con cui gli incassi gia
 * registrati citano la classificazione: cambiarlo li lascerebbe a citare
 * qualcosa che non esiste piu. Si disattiva e se ne crea un altro.
 *
 * **Aggiorna solo cio che gli si nomina.** La riga esistente si legge prima, e
 * ogni campo assente dal corpo resta com'era. Il salvataggio precedente
 * riscriveva tutte le colonne partendo dal corpo normalizzato: un
 * aggiornamento della sola etichetta azzerava aliquota, natura IVA e ambito, e
 * lo faceva in silenzio.
 *
 * **La classificazione ha un autore.** Ambito, detraibilita e quota associativa
 * non sono attributi: sono una **decisione** fiscale, e una decisione presa da
 * nessuno non si distingue da una lasciata in bianco. Quando una delle tre
 * cambia verso un valore dichiarato, la riga registra chi e quando; quando
 * tutte e tre tornano non dichiarate, l'autore si cancella con esse — una
 * firma sotto un foglio bianco sarebbe peggio di nessuna firma.
 */
export const saveOperationType = async (input: {
  organizationId: string;
  code: string;
  updates: unknown;
  /** Chi sta dichiarando. Nullo per le scritture di sistema. */
  actorUserId?: string | null;
}): Promise<NormalizedOperationType> => {
  const id = asText(input.organizationId);
  const code = asText(input.code);
  if (!id || !code) throw new Error("Accesso negato: operazione senza club");

  const updates = asRecord(input.updates);

  const existing = await operationClient().findUnique({
    where: { organization_id_code: { organization_id: id, code } },
  });

  const before = existing
    ? normalizeOperationType(existing)
    : normalizeOperationType({ code });

  /*
    Ogni campo si risolve **solo se nominato**, e cade su cio che c'era
    altrimenti. Non si fondono i due oggetti prima di normalizzarli: la riga
    porta le chiavi in `snake_case` e il corpo puo portarle in `camelCase`, e
    `normalizeOperationType` legge la prima delle due che trova — la fusione
    avrebbe fatto vincere sempre il valore vecchio.
  */
  const scelto = (chiavi: string[], fallback: unknown): unknown =>
    dichiarato(updates, ...chiavi)
      ? chiavi.map((key) => updates[key]).find((value) => value !== undefined)
      : fallback;

  const merged = normalizeOperationType({
    code,
    label: scelto(["label"], before.label),
    document_route: scelto(["document_route", "documentRoute"], before.documentRoute),
    vat_rate: scelto(["vat_rate", "vatRate"], before.vatRate),
    vat_nature: scelto(["vat_nature", "vatNature"], before.vatNature),
    reporting_bucket: scelto(
      ["reporting_bucket", "reportingBucket"],
      before.reportingBucket,
    ),
    default_description: scelto(
      ["default_description", "defaultDescription"],
      before.defaultDescription,
    ),
    is_active: scelto(["is_active", "isActive"], before.isActive),
    notes: scelto(["notes"], before.notes),
  });

  const scopeRichiesto =
    dichiarato(updates, "activity_scope", "activityScope") &&
    isActivityScope(updates.activity_scope ?? updates.activityScope)
      ? (String(updates.activity_scope ?? updates.activityScope) as ActivityScope)
      : before.activityScope;

  const after = {
    activityScope: scopeRichiesto,
    deductible: dichiarato(updates, "deductible")
      ? asDeclaredFlag(updates.deductible)
      : before.deductible,
    isMembershipFee: dichiarato(updates, "is_membership_fee", "isMembershipFee")
      ? asDeclaredFlag(updates.is_membership_fee ?? updates.isMembershipFee)
      : before.isMembershipFee,
  };

  const classificazioneCambiata = classificationChanged(
    classificationOf(before),
    after,
  );
  const dichiarazioneViva = isClassificationDeclared(after);

  const firma = classificazioneCambiata
    ? dichiarazioneViva
      ? {
          classified_by: asText(input.actorUserId) || null,
          classified_at: new Date(),
        }
      : { classified_by: null, classified_at: null }
    : {};

  const versoRichiesto = dichiarato(updates, "direction_hint", "directionHint")
    ? isDirectionHint(updates.direction_hint ?? updates.directionHint)
      ? (String(updates.direction_hint ?? updates.directionHint)
          .trim()
          .toUpperCase() as DirectionHint)
      : null
    : before.directionHint;

  const data = {
    label: merged.label || code,
    document_route: merged.documentRoute,
    vat_rate: merged.vatRate,
    vat_nature: merged.vatNature,
    activity_scope: after.activityScope,
    direction_hint: versoRichiesto,
    reporting_bucket: merged.reportingBucket,
    default_description: merged.defaultDescription,
    deductible: after.deductible,
    is_membership_fee: after.isMembershipFee,
    is_active: merged.isActive,
    notes: merged.notes,
    ...firma,
  };

  const row = await operationClient().upsert({
    where: { organization_id_code: { organization_id: id, code } },
    create: { organization_id: id, code, ...data },
    update: data,
  });

  return normalizeOperationType(row);
};

/**
 * Disattiva una causale, o la riattiva.
 *
 * **E l'unica cosa che si puo fare a una voce di sistema.** Le nove del seme
 * sono il vocabolario minimo con cui il prodotto parla di incassi: cancellarne
 * una lascerebbe i movimenti gia registrati a citare un codice che non esiste
 * piu, e la prossima semina la farebbe rinascere identica dando l'impressione
 * che il gesto non sia servito.
 */
export const setOperationTypeActive = async (input: {
  organizationId: string;
  code: string;
  isActive: boolean;
}): Promise<NormalizedOperationType> => {
  const id = asText(input.organizationId);
  const code = asText(input.code);
  if (!id || !code) throw new Error("Accesso negato: operazione senza club");

  const existing = await operationClient().findUnique({
    where: { organization_id_code: { organization_id: id, code } },
  });
  if (!existing) throw new Error("Causale non trovata");

  const row = await operationClient().update({
    where: { organization_id_code: { organization_id: id, code } },
    data: { is_active: Boolean(input.isActive) },
  });

  return normalizeOperationType(row);
};

/**
 * Cancella una causale, e quasi sempre si rifiuta di farlo.
 *
 * Tre casi, e due su tre finiscono con una disattivazione:
 *
 * 1. **voce di sistema**: non si cancella mai, per la ragione scritta sopra;
 * 2. **voce gia usata**: c'e un movimento o un incasso che la cita, e la chiave
 *    esterna e `RESTRICT`. Il database direbbe di no con un errore di vincolo:
 *    qui si dice di no con una frase che spiega cosa fare;
 * 3. **voce del club mai usata**: e un errore di battitura di dieci minuti fa,
 *    e cancellarla non toglie niente a nessuno.
 */
export const deleteOperationType = async (input: {
  organizationId: string;
  code: string;
}): Promise<{ deleted: boolean; operationType: NormalizedOperationType }> => {
  const id = asText(input.organizationId);
  const code = asText(input.code);
  if (!id || !code) throw new Error("Accesso negato: operazione senza club");

  const existing = await operationClient().findUnique({
    where: { organization_id_code: { organization_id: id, code } },
  });
  if (!existing) throw new Error("Causale non trovata");

  if (existing.is_system) {
    throw new Error(
      "Una causale predefinita non si cancella: si disattiva, e resta leggibile sui movimenti che la citano",
    );
  }

  const [movimenti, incassi] = await Promise.all([
    (prisma as any).accountingEntry.count({
      where: { organization_id: id, operation_type_code: code },
    }),
    (prisma as any).paymentTransaction.count({
      where: { organization_id: id, operation_type_code: code },
    }),
  ]);

  if (movimenti + incassi > 0) {
    const row = await operationClient().update({
      where: { organization_id_code: { organization_id: id, code } },
      data: { is_active: false },
    });

    return { deleted: false, operationType: normalizeOperationType(row) };
  }

  const row = await operationClient().delete({
    where: { organization_id_code: { organization_id: id, code } },
  });

  return { deleted: true, operationType: normalizeOperationType(row) };
};

/* ------------------------------------------------------------- le serie */

export type DocumentSeriesRecord = {
  id: string;
  kind: DocumentNumberKind;
  code: string;
  label: string;
  prefix: string;
  isDefault: boolean;
  isActive: boolean;
};

const toSeries = (row: any): DocumentSeriesRecord => ({
  id: String(row.id),
  kind: row.kind as DocumentNumberKind,
  code: normalizeSeriesCode(row.code),
  label: asText(row.label),
  prefix: asText(row.prefix),
  isDefault: Boolean(row.is_default),
  isActive: Boolean(row.is_active),
});

/**
 * Le serie di un club per un tipo di documento.
 *
 * Chi non ne ha configurata nessuna ne ha comunque una: quella predefinita,
 * con codice vuoto, che e la serie in cui e stato emesso tutto fino a oggi. La
 * si restituisce senza scriverla, perche una societa che non sa cosa sia una
 * serie non deve trovarsene una in elenco.
 */
export const listDocumentSeries = async (input: {
  organizationId: string;
  kind: DocumentNumberKind;
}): Promise<DocumentSeriesRecord[]> => {
  const id = asText(input.organizationId);
  const rows: any[] = await seriesClient().findMany({
    where: { organization_id: id, kind: input.kind },
    orderBy: [{ is_default: "desc" }, { code: "asc" }],
  });

  const configured: DocumentSeriesRecord[] = rows.map(toSeries);
  if (configured.some((entry) => entry.code === "")) return configured;

  return [
    {
      id: "",
      kind: input.kind,
      code: "",
      label: `${DOCUMENT_NUMBER_KIND_DEFINITIONS[input.kind].label} — serie predefinita`,
      prefix: DOCUMENT_NUMBER_KIND_DEFINITIONS[input.kind].prefix,
      isDefault: !configured.some((entry) => entry.isDefault),
      isActive: true,
    },
    ...configured,
  ];
};

/** La serie da usare quando chi emette non ne indica una. */
export const resolveDefaultSeries = async (input: {
  organizationId: string;
  kind: DocumentNumberKind;
}): Promise<string> => {
  const row = await seriesClient().findFirst({
    where: {
      organization_id: asText(input.organizationId),
      kind: input.kind,
      is_default: true,
      is_active: true,
    },
  });

  return normalizeSeriesCode(row?.code);
};

/**
 * Crea o aggiorna una serie.
 *
 * **Una sola predefinita per tipo.** La transazione toglie il segno alle altre
 * prima di metterlo a questa: due serie predefinite renderebbero indeterminato
 * quale numero prende il prossimo documento, e l'indeterminatezza in una
 * numerazione e esattamente cio che non si puo avere.
 */
export const saveDocumentSeries = async (input: {
  organizationId: string;
  kind: DocumentNumberKind;
  code: string;
  label: string;
  prefix?: string;
  isDefault?: boolean;
  isActive?: boolean;
}): Promise<DocumentSeriesRecord> => {
  const id = asText(input.organizationId);
  if (!id) throw new Error("Accesso negato: serie senza club");

  const code = normalizeSeriesCode(input.code);
  const prefix =
    asText(input.prefix).toUpperCase() ||
    DOCUMENT_NUMBER_KIND_DEFINITIONS[input.kind].prefix;

  return (prisma as any).$transaction(async (tx: any) => {
    if (input.isDefault) {
      await tx.documentSeries.updateMany({
        where: { organization_id: id, kind: input.kind },
        data: { is_default: false },
      });
    }

    const data = {
      label: asText(input.label) || code || "Serie predefinita",
      prefix,
      is_default: Boolean(input.isDefault),
      is_active: input.isActive === undefined ? true : Boolean(input.isActive),
    };

    const row = await tx.documentSeries.upsert({
      where: {
        organization_id_kind_code: {
          organization_id: id,
          kind: input.kind,
          code,
        },
      },
      create: { organization_id: id, kind: input.kind, code, ...data },
      update: data,
    });

    return toSeries(row);
  });
};

/**
 * **La classificazione contabile di un movimento** (W4-R7).
 *
 * Restituisce le tre colonne che le due tabelle sorgente hanno acquistato con
 * la Wave 6: il codice, l'etichetta **congelata** e l'ambito **congelato**.
 *
 * ## Perche congela
 *
 * La causale e configurazione del club, e un club la corregge. Senza lo scatto,
 * correggerla cambierebbe **retroattivamente** la natura di cio che e gia stato
 * registrato: un rendiconto stampato a marzo direbbe una cosa diversa se
 * ristampato a maggio, senza che nessun movimento sia cambiato. E la stessa
 * ragione per cui `payment_transactions` congela le sue, e sta scritta nello
 * schema accanto alla colonna.
 *
 * ## Perche deduce invece di chiedere
 *
 * Un campo facoltativo che nessuno compila e il buco di prima con un nome
 * nuovo. Qui il ripiego arriva da `transaction_type`, che il dominio conosce
 * **nel momento in cui scrive la riga**: la classificazione c'e dal primo
 * giorno, e resta sovrascrivibile. Cio che resta non classificato e allora una
 * scelta vera — non una dimenticanza.
 *
 * ## Cosa rifiuta
 *
 * Una causale il cui verso suggerito **contraddice il verso del fatto**: una
 * quota associativa su un compenso, o un compenso sportivo sul bonifico di un
 * ente. Non e pignoleria: falsa il rendiconto in due punti — gonfia una voce
 * dal lato sbagliato e sposta il movimento sotto un capitolo che non gli
 * appartiene — e il difetto sopravvivrebbe silenzioso fino al primo bilancio.
 *
 * Una causale **senza verso** (`directionHint: null`) passa in entrambi i
 * casi, ed e voluto: «altra operazione», una rettifica, una nota di credito
 * servono da tutt'e due le parti. Il verso lo decide il movimento.
 *
 * ## Perche il verso e quello del FATTO, non quello della riga
 *
 * Un fatto di dominio puo produrre righe di segno opposto sulla stessa
 * tabella: la liquidazione di un bando e un'entrata, e il suo **storno** e
 * un'uscita. Applicare la guardia al segno della singola riga imporrebbe due
 * causali diverse per lo stesso fatto, e le due righe non si eliderebbero piu
 * sotto la stessa voce di rendiconto.
 *
 * Non serve, perche uno storno non risolve niente: **eredita la fotografia**
 * — codice, etichetta e ambito congelati — della riga che annulla. Questa
 * funzione viene percio chiamata una volta sola, quando il fatto nasce, e il
 * verso da dichiararle e quello del fatto.
 */
export type ResolvedClassification = {
  operation_type_code: string | null;
  operation_type_label_snapshot: string | null;
  activity_scope_snapshot: string;
};

/** Il nome storico, tenuto per i chiamanti del lavoro sportivo. */
export type OutboundClassification = ResolvedClassification;

const resolveClassification = async (input: {
  organizationId: string;
  /** Cio che ha scelto chi registra. Vince sul ripiego. */
  code?: unknown;
  /** Il ripiego dedotto dal dominio, quando chi registra non sceglie. */
  fallbackCode?: string | null;
  /** Il verso del **fatto** che si sta registrando. */
  direction: DirectionHint;
}): Promise<ResolvedClassification> => {
  const organizationId = asText(input.organizationId);
  if (!organizationId) {
    throw new Error("Accesso negato: operazione senza club");
  }

  const scelto = asText(input.code);
  const code = scelto || asText(input.fallbackCode);

  const vuota: ResolvedClassification = {
    operation_type_code: null,
    operation_type_label_snapshot: null,
    activity_scope_snapshot: "unspecified",
  };

  if (!code) return vuota;

  const tipo = await getOperationType({ organizationId, code });

  if (!tipo) {
    /*
      Se manca il **ripiego** si prosegue senza classificare: un club che non ha
      ancora il catalogo non deve vedersi rifiutare un pagamento. Se manca cio
      che qualcuno ha **scelto**, invece, va detto: ha scelto qualcosa che non
      esiste, e scrivere `null` gli farebbe credere di aver classificato.
    */
    if (!scelto) return vuota;
    throw new Error(
      `Causale contabile non trovata: ${code}. Configurala fra le causali del club prima di usarla.`,
    );
  }

  if (tipo.directionHint && tipo.directionHint !== input.direction) {
    const atteso = input.direction === "IN" ? "entrata" : "uscita";
    const dichiarato =
      tipo.directionHint === "IN" ? "le entrate" : "le uscite";
    throw new Error(
      `La causale «${tipo.label}» e prevista per ${dichiarato}: su un movimento in ${atteso} falserebbe il rendiconto in due punti.`,
    );
  }

  if (!tipo.isActive && scelto) {
    throw new Error(
      `La causale «${tipo.label}» e disattivata: riattivala, oppure scegline un'altra.`,
    );
  }

  return {
    operation_type_code: tipo.code,
    operation_type_label_snapshot: tipo.label,
    activity_scope_snapshot: tipo.activityScope,
  };
};

/** La classificazione del denaro che **esce**: compensi, rimborsi, fatture. */
export const resolveOutboundClassification = (input: {
  organizationId: string;
  code?: unknown;
  fallbackCode?: string | null;
}): Promise<ResolvedClassification> =>
  resolveClassification({ ...input, direction: "OUT" });

/**
 * La classificazione del denaro che **entra** da un ente.
 *
 * Esiste perche `funding_settlements` registra un incasso — il bonifico con
 * cui il bando liquida al club i voucher maturati — e passava per la guardia
 * in uscita: la causale corretta veniva **rifiutata**, e l'unica ammessa era
 * quella che sommava un incasso dentro un capitolo di spesa.
 */
export const resolveInboundClassification = (input: {
  organizationId: string;
  code?: unknown;
  fallbackCode?: string | null;
}): Promise<ResolvedClassification> =>
  resolveClassification({ ...input, direction: "IN" });
