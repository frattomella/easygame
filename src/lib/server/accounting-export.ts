import { prisma } from "./prisma";
import { normalizeClubSeasons } from "@/lib/club-seasons";
import { normalizeClubSites } from "@/lib/club-sites";
import {
  readAllAccountingLines,
  TETTO_RIGHE_REGISTRO,
  type AccountingScope,
} from "./accounting";
import { AUDIT_ACTIONS, recordAuditEvent } from "./audit";
import { assertAccountingPermission } from "@/lib/accounting/permissions";
import { toFiscalYearFilter } from "@/lib/accounting/model";
import {
  ACCOUNTING_EXPORT_TITLE,
  buildAccountingExportCsv,
  type AccountingExportLine,
  type AccountingExportResult,
} from "@/lib/accounting/export";

/**
 * L'export contabile, **dal database al file**.
 *
 * Il modulo puro (`src/lib/accounting/export.ts`) sa comporre il CSV; qui si
 * fanno le tre cose che solo il server puo fare: verificare il permesso,
 * **sfogliare tutte** le righe del filtro, e chiedere ai documenti collegati
 * il numero e l'IVA che il movimento non possiede.
 *
 * ---
 *
 * ## Perche un modulo e non il corpo della rotta
 *
 * E la stessa forma di `accounting-reports.ts`, e per la stessa ragione: il
 * giorno in cui l'export viene chiamato da un secondo punto — un invio
 * programmato, un pulsante di un'altra pagina — il permesso, la paginazione e
 * il confine multi-tenant partono comunque da qui. Una rotta che facesse
 * questo lavoro nel suo corpo li lascerebbe indietro.
 *
 * ## Il file parziale, e perche non esce
 *
 * `listAccountingEntries` serve al massimo 500 righe per chiamata, ed e
 * giusto cosi: e la difesa di un elenco che si sfoglia. Un export deve invece
 * vedere **tutte** le righe del filtro, quindi le raccoglie sfogliando, come
 * gia fa il riepilogo.
 *
 * Il tetto esiste perche un club fuori scala non produca una lettura senza
 * fine. Oltre il tetto pero l'export **non consegna il file**: risponde un
 * errore che dice quante righe ha trovato e come restringere. Un riepilogo
 * troncato puo dichiararsi `truncated` e restare utile — e un ordine di
 * grandezza; un file di prima nota a cui mancano righe, aperto in un foglio di
 * calcolo che non sa niente di questa conversazione, **non si distingue da uno
 * completo**. Chi lo somma ottiene un numero sbagliato e non ha modo di
 * accorgersene.
 */

/**
 * Quante righe l'export legge prima di dichiarare che il filtro e troppo largo.
 *
 * Quarantamila sono molto piu di un anno di prima nota di una ASD, ed e lo
 * stesso numero del riepilogo: due tetti diversi sarebbero due risposte diverse
 * alla stessa domanda. Vive in `accounting.ts`, che e il proprietario della
 * lettura, e qui si riesporta per chi lo cita.
 */
export const RIGHE_MASSIME_EXPORT = TETTO_RIGHE_REGISTRO;

/**
 * L'export non serve nessun pulsante di riga: il file non porta «modifica»,
 * «storna» ne «riconcilia», quindi non ha nessun motivo di far calcolare quei
 * verdetti a chi legge le righe.
 */
const NESSUN_PERMESSO = { reverse: false, reconcile: false, manage: false };

const asText = (value: unknown) => String(value ?? "").trim();

export type AccountingExportFilters = {
  organizationId?: unknown;
  from?: unknown;
  to?: unknown;
  fiscalYear?: unknown;
  seasonId?: unknown;
  financialAccountId?: unknown;
  operationTypeCode?: unknown;
  direction?: unknown;
  sourceDomain?: unknown;
  siteId?: unknown;
  activityScope?: unknown;
  reconciliationStatus?: unknown;
  search?: unknown;
  /** Solo per il collaudo del rifiuto: vedi `RIGHE_MASSIME_EXPORT`. */
  maxRows?: number;
  generatedAt?: Date;
};

/* ========================================================================== */
/* Le righe, tutte                                                             */
/* ========================================================================== */

const leggiTutteLeRighe = async (
  filtri: Record<string, unknown>,
  scope: AccountingScope,
  tetto: number,
) => {
  const { lines, total, truncated } = await readAllAccountingLines(
    filtri,
    scope,
    NESSUN_PERMESSO,
    tetto,
  );

  if (truncated) {
    throw new Error(
      `L'export si ferma a ${tetto} righe e il filtro ne seleziona ${total}: ` +
        "restringere il periodo o l'anno fiscale e riprovare. Un file a cui mancano righe, " +
        "una volta aperto in un foglio di calcolo, non si distingue da uno completo.",
    );
  }

  return { lines: lines as AccountingExportLine[], total };
};

/* ========================================================================== */
/* I nomi che la riga non porta                                                */
/* ========================================================================== */

/**
 * Le etichette di stagione e sede del club, in una lettura sola.
 *
 * Sono due mappe piccole — una manciata di stagioni e di sedi per club — e non
 * meritano un join riga per riga. Restano vuote dove il dato non c'e: una riga
 * proiettata non dichiara una stagione, e una cella vuota e la verita mentre
 * una inventata non lo sarebbe.
 */
const leggiEtichette = async (organizationId: string) => {
  const club = await (prisma as any).club.findUnique({
    where: { id: organizationId },
    select: { settings: true, club_sites: true },
  });

  const stagioni = new Map<string, string>();
  for (const stagione of normalizeClubSeasons(club?.settings)?.seasons || []) {
    const id = asText((stagione as any)?.id);
    if (id) stagioni.set(id, asText((stagione as any)?.label) || id);
  }

  const sedi = new Map<string, string>();
  for (const sede of normalizeClubSites(club?.club_sites)) {
    const id = asText(sede?.id);
    if (id) sedi.set(id, asText(sede?.name) || id);
  }

  return { stagioni, sedi };
};

/* ========================================================================== */
/* Il numero del documento e l'IVA                                             */
/* ========================================================================== */

/**
 * A blocchi, e non tutti gli identificativi in un `IN` solo.
 *
 * Un anno di prima nota di un club che fattura porta migliaia di documenti, e
 * un `IN` con migliaia di elementi e la forma di query che un database smette
 * di pianificare bene senza dirlo.
 */
const A_BLOCCHI = <T>(values: readonly T[], size = 200): T[][] => {
  const blocchi: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    blocchi.push(values.slice(index, index + size));
  }
  return blocchi;
};

type DatiDocumento = {
  number: string | null;
  label: string;
  taxableCents: number | null;
  vatCents: number | null;
};

const numeroONull = (value: unknown): number | null => {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

/**
 * Il documento collegato, letto **nel club del movimento**.
 *
 * Perche serve: `accounting_entries` porta `document_kind` e `document_id`, ma
 * non il numero e non l'IVA. Il numero lo possiede
 * `document_number_sequences` attraverso il documento — nessuno lo digita — e
 * imponibile e imposta stanno sulla fattura o sulla ricevuta, perche l'IVA e
 * un dato del documento e non del movimento di cassa (§16).
 *
 * **Ogni lettura porta il suo `organization_id`**, anche dopo che il confine e
 * gia stato verificato da `listAccountingEntries`: e la regola del repository,
 * e vale perche un identificativo di documento che arrivasse da una riga
 * malformata non deve poter pescare il numero di un'altra societa.
 */
const leggiDocumenti = async (
  organizationId: string,
  lines: readonly AccountingExportLine[],
): Promise<Map<string, DatiDocumento>> => {
  const ids = Array.from(
    new Set(lines.map((riga) => asText(riga.documentId)).filter(Boolean)),
  );
  const trovati = new Map<string, DatiDocumento>();
  if (!ids.length) return trovati;

  for (const blocco of A_BLOCCHI(ids)) {
    const [fatture, ricevute] = await Promise.all([
      (prisma as any).invoice.findMany({
        where: { organization_id: organizationId, id: { in: blocco } },
        select: {
          id: true,
          invoice_number: true,
          taxable_amount_cents: true,
          vat_amount_cents: true,
        },
      }),
      (prisma as any).receipt.findMany({
        where: { organization_id: organizationId, id: { in: blocco } },
        select: {
          id: true,
          receipt_number: true,
          taxable_amount_cents: true,
          vat_amount_cents: true,
        },
      }),
    ]);

    for (const riga of fatture || []) {
      trovati.set(String(riga.id), {
        number: asText(riga.invoice_number) || null,
        label: "Fattura",
        taxableCents: numeroONull(riga.taxable_amount_cents),
        vatCents: numeroONull(riga.vat_amount_cents),
      });
    }
    for (const riga of ricevute || []) {
      trovati.set(String(riga.id), {
        number: asText(riga.receipt_number) || null,
        label: "Ricevuta",
        taxableCents: numeroONull(riga.taxable_amount_cents),
        vatCents: numeroONull(riga.vat_amount_cents),
      });
    }
  }

  return trovati;
};

/* ========================================================================== */
/* Il nome del file                                                            */
/* ========================================================================== */

/**
 * Un nome parlante: cosa c'e dentro e di quale periodo.
 *
 * Non dice **di chi**: il nome del club finirebbe in un allegato di posta, e
 * il file lo scarica gia chi conosce la societa. Non dice nemmeno che il file
 * sia un documento — vedi la regola del §13 sulle parole vietate, che
 * `buildAccountingExportCsv` verifica su questo stesso nome.
 */
const nomeDelFile = (filtri: AccountingExportFilters): string => {
  const anno = toFiscalYearFilter(filtri.fiscalYear);
  if (anno !== null) return `${ACCOUNTING_EXPORT_TITLE} ${anno}`;

  const dal = asText(filtri.from).slice(0, 10);
  const al = asText(filtri.to).slice(0, 10);
  if (dal && al) return `${ACCOUNTING_EXPORT_TITLE} ${dal} ${al}`;
  if (dal) return `${ACCOUNTING_EXPORT_TITLE} dal ${dal}`;
  if (al) return `${ACCOUNTING_EXPORT_TITLE} al ${al}`;

  return ACCOUNTING_EXPORT_TITLE;
};

/* ========================================================================== */
/* L'export                                                                    */
/* ========================================================================== */

export type AccountingExportOutcome = AccountingExportResult & {
  organizationId: string;
};

/**
 * L'export contabile di un club.
 *
 * **Il permesso si verifica anche qui**, e non solo nell'involucro della
 * rotta: un export e la fotografia completa dei conti di una societa che
 * lascia l'applicazione dentro un file, ed e il motivo per cui la segreteria
 * non ce l'ha. Il giorno in cui questa funzione venisse chiamata da un job o
 * da una seconda rotta, il controllo c'e comunque. E la stessa disciplina di
 * `buildAccountingReport`, e costa una riga.
 */
export const buildAccountingExport = async (
  filtri: AccountingExportFilters,
  scope: AccountingScope & { activeRole?: string | null },
  request?: Request | null,
): Promise<AccountingExportOutcome> => {
  assertAccountingPermission(scope.activeRole, "accounting.export");

  /*
    Le proiezioni e i movimenti storici restano **dentro**, e non e un
    dettaglio: un export della contabilita che mostrasse solo le righe scritte
    a mano nasconderebbe incassi, compensi e contributi, cioe la maggior parte
    del denaro. Per questo qui non esistono i due interruttori che la prima
    nota offre per alleggerire una schermata.
  */
  const filtriDiLettura = {
    organizationId: filtri.organizationId,
    from: filtri.from,
    to: filtri.to,
    fiscalYear: filtri.fiscalYear,
    seasonId: filtri.seasonId,
    financialAccountId: filtri.financialAccountId,
    operationTypeCode: filtri.operationTypeCode,
    direction: filtri.direction,
    sourceDomain: filtri.sourceDomain,
    siteId: filtri.siteId,
    activityScope: filtri.activityScope,
    reconciliationStatus: filtri.reconciliationStatus,
    search: filtri.search,
  };

  /*
    La lettura viene **prima** di tutto il resto, e non per ordine di
    importanza: e lei che verifica il confine — `listAccountingEntries`
    risolve il club e nega l'accesso a quello di un altro. Cio che segue si
    appoggia a quel verdetto invece di ripeterlo con criteri propri.
  */
  const { lines } = await leggiTutteLeRighe(
    filtriDiLettura,
    scope,
    Number.isInteger(filtri.maxRows) && Number(filtri.maxRows) > 0
      ? Number(filtri.maxRows)
      : RIGHE_MASSIME_EXPORT,
  );

  const organizationId =
    asText(filtri.organizationId) || asText(scope.activeOrganizationId);
  if (!organizationId) {
    throw new Error("Accesso negato: nessun club attivo selezionato");
  }

  const documenti = await leggiDocumenti(organizationId, lines);

  /*
    **I nomi di stagione e sede, in una lettura sola.**
    La riga porta gli identificativi; un foglio che stampasse `2026-27` o un
    UUID direbbe qualcosa che chi lo apre non puo leggere. Sono due mappe
    piccole — un club ha una manciata di stagioni e di sedi — e vivono dove
    vivono da sempre, cioe dentro `clubs.settings` e `clubs.club_sites`.
  */
  const { stagioni, sedi } = await leggiEtichette(organizationId);

  const arricchite: AccountingExportLine[] = lines.map((riga) => {
    const etichette = {
      seasonLabel: riga.seasonId ? stagioni.get(String(riga.seasonId)) || null : null,
      siteLabel: riga.siteId ? sedi.get(String(riga.siteId)) || null : null,
    };

    const documento = riga.documentId ? documenti.get(String(riga.documentId)) : null;
    if (!documento) return { ...riga, ...etichette };

    return {
      ...riga,
      ...etichette,
      /*
        Il numero gia sulla riga vince su quello del documento: una riga
        proiettata lo porta dal suo dominio, che lo ha letto nello stesso
        momento in cui ha letto il resto. Le righe proprie non lo portano mai,
        ed e per loro che questa lettura esiste.
      */
      documentNumber: riga.documentNumber || documento.number,
      documentLabel: documento.label,
      taxableCents: documento.taxableCents,
      vatCents: documento.vatCents,
    };
  });

  const risultato = buildAccountingExportCsv(arricchite, {
    fileNameBase: nomeDelFile(filtri),
    generatedAt: filtri.generatedAt,
  });

  /*
    L'export si traccia. Non e una scrittura, ma e l'unica operazione della
    contabilita che porta **tutto** fuori dall'applicazione: «chi ha scaricato
    i conti della societa, quando, e con quale filtro» e una domanda che si
    pone dopo, e la risposta non esiste da nessun'altra parte.
  */
  await recordAuditEvent({
    action: AUDIT_ACTIONS.accountingExported,
    actorUserId: scope.userId,
    actorRole: scope.activeRole,
    organizationId,
    resource: "accounting_entries",
    resourceId: null,
    request: request || null,
    metadata: {
      rowCount: risultato.rowCount,
      fileName: risultato.fileName,
      filters: {
        from: asText(filtri.from) || null,
        to: asText(filtri.to) || null,
        fiscalYear: toFiscalYearFilter(filtri.fiscalYear),
        seasonId: asText(filtri.seasonId) || null,
        financialAccountId: asText(filtri.financialAccountId) || null,
        operationTypeCode: asText(filtri.operationTypeCode) || null,
        direction: asText(filtri.direction) || null,
        sourceDomain: asText(filtri.sourceDomain) || null,
        siteId: asText(filtri.siteId) || null,
        activityScope: asText(filtri.activityScope) || null,
      },
    },
  });

  return { ...risultato, organizationId };
};
