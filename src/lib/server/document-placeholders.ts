import { prisma } from "./prisma";
import { getResourceById } from "./resources";
import { readClubSignatureImage } from "./club-signature";
import { loadAttendanceInputs } from "./funding";
import {
  applyPlaceholderValues,
  extractPlaceholderKeys,
  isKnownPlaceholderKey,
  BLANK_FIELD_HTML,
} from "@/lib/documents/placeholders";
import {
  escapeHtml,
  formatAmountValue,
  formatDate,
} from "@/lib/documents/document-view";
import { resolveFiscalRecipient } from "@/lib/documents/fiscal-recipient";
import {
  buildInstallmentLedgers,
  summarizeLedgers,
} from "@/lib/payments/installment-ledger";
import { measureAttendanceByPeriod } from "@/lib/funding/attendance-measure";
import { findPaymentPlan } from "@/lib/payment-plan-utils";
import { normalizeClubSeasons, type ClubSeason } from "@/lib/club-seasons";

/**
 * Il risolutore dei segnaposto: chi mette i dati dentro un modello.
 *
 * **Il buco che chiude (PP-5).** Il catalogo dei segnaposto esisteva gia — lo
 * mostra l'editor dei modelli — e la generazione esisteva gia. In mezzo non
 * c'era niente: `renderBlankTemplateForPdf` sostituisce **ogni** segnaposto
 * con un campo vuoto, anche quando un atleta e stato scelto. EasyGame stampava
 * il modulo vuoto avendo il dato in mano. Questa e l'unica capability nuova
 * della Wave 1 (ADR-0071).
 *
 * **Non sostituisce il modulo vuoto: gli si affianca.** Il modulo da compilare
 * a mano resta la cosa giusta per una liberatoria che qualcuno deve firmare in
 * segreteria. Le due strade convivono, e la scelta e di chi genera.
 *
 * ## I quattro vincoli che accetta per non diventare un secondo sistema
 *
 * 1. **Catalogo chiuso e condiviso.** Le chiavi che sa risolvere sono un
 *    sottoinsieme di `src/lib/documents/placeholders.ts`, lo stesso elenco che
 *    l'editor propone. Un segnaposto fuori catalogo non viene inventato:
 *    diventa un campo vuoto ed **e elencato** in `unresolved`.
 * 2. **Legge, non calcola.** Gli importi arrivano da `installment-ledger`
 *    (`buildInstallmentLedgers` + `summarizeLedgers`), che e il registro
 *    incassi: `{{payment.total_paid}}` e **il denaro entrato**, non il dovuto
 *    di una rata marcata pagata (ADR-0068). La frequenza arriva da
 *    `measureAttendanceByPeriod`, la stessa che misura i bandi (ADR-0037).
 *    Nessuna formula nuova nasce qui.
 * 3. **Il documento non mente.** Un dato che manca resta bianco e finisce in
 *    `missing`; un segnaposto sconosciuto finisce in `unresolved`; una firma
 *    che il club non ha caricato produce un `warning` **prima** di generare
 *    (§5.5.25). Non esiste un percorso in cui il foglio esca con «undefined»
 *    o con un numero verosimile e falso.
 * 4. **Niente HTML iniettabile.** Ogni valore che viene da un'anagrafica passa
 *    da `escapeHtml`. Un cognome scritto `<script>…` e un cognome, non codice:
 *    il modello lo ha scritto la segreteria, il nome no.
 *
 * **Il confine di sicurezza e `organization_id`**, come per ogni risorsa di
 * club: l'atleta si cerca **dentro** il club dello scope, e un identificativo
 * di un'altra societa risponde «Accesso negato» — mai il messaggio dell'ORM.
 */

export type DocumentPlaceholderScope = {
  userId: string;
  activeOrganizationId: string | null;
  allowedOrganizationIds: string[];
};

export type DocumentPlaceholderTemplate = {
  id?: string | null;
  title?: string | null;
  content: string;
};

export type ResolvedDocumentPlaceholders = {
  /** Il contenuto del modello con i segnaposto sostituiti. */
  html: string;
  /** Il titolo del documento: quello del modello. */
  title: string;
  /** Cio che il risolutore ha scritto, in chiaro: alimenta l'anteprima. */
  values: Record<string, string>;
  /** Segnaposto usati dal modello che il risolutore non conosce. */
  unresolved: string[];
  /** Segnaposto conosciuti il cui dato non c'e: restano bianchi. */
  missing: string[];
  /** Cose da dire **prima** di stampare (firma o timbro mancanti). */
  warnings: string[];
  /** L'intestazione della pagina stampabile. */
  issuer: {
    name: string;
    logoUrl: string | null;
    address: string | null;
    city: string | null;
    postalCode: string | null;
    province: string | null;
    fiscalCode: string | null;
    vatNumber: string | null;
  };
};

const denied = (message: string) => new Error(`Accesso negato: ${message}`);

const asText = (value: unknown) => String(value ?? "").trim();

const asRecord = (value: unknown): Record<string, any> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, any>)
    : {};

const firstText = (...values: unknown[]) => {
  for (const value of values) {
    const text = asText(value);
    if (text) return text;
  }
  return "";
};

const ensureOrganizationAccess = (
  scope: DocumentPlaceholderScope | undefined,
  organizationId: string,
) => {
  if (!organizationId) throw new Error("Nessun club indicato");
  if (!scope) return;
  if (!scope.allowedOrganizationIds.includes(organizationId)) {
    throw denied("il club non e fra quelli accessibili");
  }
};

/**
 * Il blocco firma da compilare a mano.
 *
 * E lo stesso riquadro tratteggiato del modulo vuoto: quando la firma non c'e
 * — o quando a firmare deve essere una persona, non il club — il documento
 * lascia lo spazio invece di far finta di niente.
 */
const signaturePlaceholderHtml = (label: string) =>
  `<div style="margin: 28px 0 18px; padding: 18px; border: 1px dashed #94a3b8; border-radius: 8px; color: #475569; background-color: #f8fafc;"><strong>${escapeHtml(
    label,
  )}</strong></div>`;

const signatureImageHtml = (dataUrl: string, label: string) =>
  `<img src="${escapeHtml(dataUrl)}" alt="${escapeHtml(
    label,
  )}" style="max-height: 90px; max-width: 260px;" />`;

/* ===================================================== la parte pura */

export type DocumentPlaceholderContext = {
  club: Record<string, any>;
  athlete: Record<string, any>;
  season: ClubSeason | null;
  /** Righe `payments` gia ristrette al periodo dell'attestazione. */
  charges: unknown[];
  /** Righe `payment_transactions` dell'atleta. */
  transactions: unknown[];
  /** Piani di pagamento del club, per dare un nome al piano dell'atleta. */
  paymentPlans: unknown[];
  attendance: { sessions: number; hours: number };
  signature: { dataUrl: string } | null;
  stamp: { dataUrl: string } | null;
  documentTitle: string;
  now: Date;
};

/**
 * Il valore di un segnaposto: il testo che vale, e — solo per firma e timbro —
 * l'HTML voluto che lo rappresenta.
 *
 * La distinzione non e cosmetica: senza, o le firme diventano testo o un nome
 * diventa codice. `html` assente significa «neutralizzalo», ed e il caso
 * normale.
 */
export type PlaceholderValue = { text: string; html?: string };

const guardianAt = (athlete: Record<string, any>, index: number) => {
  const guardians = asRecord(athlete.data).guardians;
  const list = Array.isArray(guardians) ? guardians.filter(Boolean) : [];
  return asRecord(list[index]);
};

/**
 * Le chiavi che il risolutore sa produrre, con il loro valore.
 *
 * **Pura**: riceve i record gia letti e non tocca ne Prisma ne la rete. E la
 * funzione che i test provano riga per riga.
 *
 * Le chiavi del catalogo che **non** compaiono qui (staff, allenatori, soci,
 * sponsor, certificati) non sono dimenticate: in un'attestazione intestata a
 * un atleta non hanno un soggetto a cui riferirsi, e inventarne uno sarebbe
 * peggio di lasciarle bianche. Se un modello le usa, finiscono in
 * `unresolved`.
 */
export const buildPlaceholderValues = (
  context: DocumentPlaceholderContext,
): Record<string, PlaceholderValue> => {
  const { club, athlete, season, now } = context;
  const athleteData = asRecord(athlete.data);
  const clubSettings = asRecord(club.settings);

  const ledgers = buildInstallmentLedgers({
    charges: context.charges,
    transactions: context.transactions,
    now,
  });
  const totals = summarizeLedgers(ledgers);

  const recipient = resolveFiscalRecipient(athlete);
  const plan = findPaymentPlan(
    firstText(
      athleteData.selectedPlan,
      athleteData.selectedPlanId,
      athleteData.selected_plan_id,
    ),
    Array.isArray(context.paymentPlans) ? context.paymentPlans : [],
  );

  const parentOne = guardianAt(athlete, 0);
  const parentTwo = guardianAt(athlete, 1);

  const categoryName = firstText(athlete.category_name, athleteData.category);
  const recipientAddress = [
    recipient.address,
    [recipient.postalCode, recipient.city].filter(Boolean).join(" "),
    recipient.province ? `(${recipient.province})` : "",
  ]
    .filter(Boolean)
    .join(" — ");

  const text = (value: unknown): PlaceholderValue => ({ text: asText(value) });

  const signatureBlock = (label: string): PlaceholderValue => ({
    // Uno spazio per firmare non e un dato mancante: e cio che il documento
    // deve avere. Il testo dice a cosa serve, l'HTML disegna il riquadro.
    text: label,
    html: signaturePlaceholderHtml(label),
  });

  const clubImage = (
    image: { dataUrl: string } | null,
    label: string,
  ): PlaceholderValue =>
    image
      ? { text: label, html: signatureImageHtml(image.dataUrl, label) }
      : { text: "", html: signaturePlaceholderHtml(label) };

  return {
    "club.name": text(firstText(club.business_name, club.name)),
    "club.address": text(firstText(club.legal_address, club.address)),
    "club.city": text(firstText(club.legal_city, club.city)),
    "club.email": text(firstText(club.contact_email, clubSettings.companyEmail)),
    "club.phone": text(club.contact_phone),
    "club.fiscal_code": text(club.fiscal_code),
    "club.vat_number": text(club.vat_number),
    "club.website": text(firstText(club.website, clubSettings.website)),

    "athlete.first_name": text(athlete.first_name),
    "athlete.last_name": text(athlete.last_name),
    "athlete.birth_date": text(formatDate(athlete.birth_date)),
    "athlete.category_name": text(categoryName),
    "athlete.fiscal_code": text(
      firstText(athleteData.fiscalCode, athleteData.fiscal_code),
    ),
    "athlete.address": text(athleteData.address),
    "athlete.email": text(athleteData.email),
    "athlete.phone": text(athleteData.phone),
    "athlete.jersey_number": text(athlete.jersey_number),

    "parent.1.first_name": text(parentOne.name),
    "parent.1.last_name": text(parentOne.surname),
    "parent.1.email": text(parentOne.email),
    "parent.1.phone": text(parentOne.phone),
    "parent.2.first_name": text(parentTwo.name),
    "parent.2.last_name": text(parentTwo.surname),
    "parent.2.email": text(parentTwo.email),
    "parent.2.phone": text(parentTwo.phone),
    "guardian.name": text(
      firstText(
        [parentOne.name, parentOne.surname].filter(Boolean).join(" "),
        athleteData.parentName,
        athleteData.guardianName,
      ),
    ),

    "fiscal_recipient.name": text(recipient.name),
    "fiscal_recipient.fiscal_code": text(recipient.fiscalCode),
    "fiscal_recipient.address": text(recipientAddress),

    "category.name": text(categoryName),
    "team.name": text(firstText(athleteData.group, athleteData.team)),

    "registration.status": text(athlete.status),
    "payment.plan": text(plan?.name),
    /*
      I tre importi vengono dal registro incassi, e uno solo di loro e «il
      denaro»: `paidAmount` e cio che e **entrato in cassa**, non il dovuto di
      una rata marcata pagata. Un'attestazione che dicesse «ha versato 130»
      perche la rata risulta saldata mentre in cassa ce ne sono 80 sarebbe un
      documento firmato dal presidente che dichiara il falso.
    */
    "payment.total_due": text(formatAmountValue(totals.dueAmount)),
    "payment.total_paid": text(formatAmountValue(totals.paidAmount)),
    "payment.remaining": text(formatAmountValue(totals.residualAmount)),

    "attendance.sessions": text(String(context.attendance.sessions)),
    "attendance.hours": text(formatAmountValue(context.attendance.hours)),

    "document.title": text(context.documentTitle),
    "document.date": text(formatDate(now)),
    "current_date": text(formatDate(now)),
    "season.year": text(season?.label),
    "season.start_date": text(season ? formatDate(season.startDate) : ""),
    "season.end_date": text(season ? formatDate(season.endDate) : ""),

    "signature.athlete": signatureBlock("Firma dell'atleta"),
    "signature.parent": signatureBlock("Firma del genitore/tutore"),
    "signature.trainer": signatureBlock("Firma dell'allenatore"),
    "signature.club_representative": clubImage(
      context.signature,
      "Firma del presidente",
    ),
    "stamp.club": clubImage(context.stamp, "Timbro del club"),
  };
};

/**
 * Applica i valori al modello, e dice cosa non e riuscito a scrivere.
 *
 * **Pura**, come `buildPlaceholderValues`: e la coppia che i test provano
 * senza database.
 */
export const compileTemplateWithValues = ({
  content,
  values,
}: {
  content: string;
  values: Record<string, PlaceholderValue>;
}) => {
  const rendered: Record<string, string> = {};
  const plain: Record<string, string> = {};

  for (const [key, value] of Object.entries(values)) {
    plain[key] = value.text;
    rendered[key] =
      value.html !== undefined
        ? value.html
        : value.text
          ? escapeHtml(value.text)
          : // Un dato che manca e un campo da riempire a mano, non una riga
            // vuota che nessuno nota.
            BLANK_FIELD_HTML;
  }

  const { html, unresolved } = applyPlaceholderValues({ content, rendered });

  const used = new Set(extractPlaceholderKeys(content));
  const missing = [...used]
    .filter((key) => values[key] !== undefined && !values[key].text)
    .sort();

  return { html, values: plain, unresolved, missing, used };
};

/* ================================================ la parte che legge */

/**
 * Le rate che appartengono al periodo attestato.
 *
 * `payments` non porta una stagione — non e fra i tipi con `seasonId`
 * (`SEASON_SCOPED_DATA_TYPES`) — e il perimetro va quindi ricavato dalla data
 * di scadenza. Una rata **senza** data resta dentro: e un dato anteriore alle
 * stagioni, ed escluderlo farebbe sparire versamenti realmente avvenuti da
 * un'attestazione che serve a dimostrarli. E la stessa scelta che
 * `filterCollectionBySeason` fa con i record senza stagione.
 */
const chargesWithinSeason = (charges: any[], season: ClubSeason | null) => {
  if (!season) return charges;

  const start = asText(season.startDate).slice(0, 10);
  const end = asText(season.endDate).slice(0, 10);
  if (!start || !end) return charges;

  return charges.filter((charge) => {
    const dueDate = charge?.due_date;
    if (!dueDate) return true;

    const day =
      dueDate instanceof Date
        ? dueDate.toISOString().slice(0, 10)
        : asText(dueDate).slice(0, 10);
    if (!day) return true;

    return day >= start && day <= end;
  });
};

/**
 * Un modello, un atleta, una stagione: il documento compilato.
 *
 * Non scrive niente. Non emette un documento fiscale, non registra un incasso,
 * non tocca l'anagrafica: legge, compone, e restituisce una pagina.
 */
export const resolveDocumentPlaceholders = async ({
  template,
  organizationId,
  athleteId,
  seasonId,
  scope,
  now = new Date(),
}: {
  template: DocumentPlaceholderTemplate;
  organizationId: string;
  athleteId: string;
  seasonId?: string | null;
  scope?: DocumentPlaceholderScope;
  now?: Date;
}): Promise<ResolvedDocumentPlaceholders> => {
  const clubId = asText(organizationId);
  ensureOrganizationAccess(scope, clubId);

  const wantedAthleteId = asText(athleteId);
  if (!wantedAthleteId) {
    throw new Error("Nessun atleta indicato");
  }

  /*
    L'atleta si cerca **dentro** il club, non si cerca e poi si confronta: con
    `findUnique` un identificativo di un'altra societa tornerebbe comunque, e
    basterebbe dimenticare un controllo perche il documento esca. Il filtro e
    la difesa; il messaggio qui sotto e solo la spiegazione.
  */
  const athlete = await (prisma as any).athlete.findFirst({
    where: { id: wantedAthleteId, organization_id: clubId },
  });

  if (!athlete) {
    throw denied("l'atleta non appartiene a questo club");
  }

  const club = await getResourceById("clubs", clubId, scope);
  if (!club) throw new Error("Club non trovato");

  const seasons = normalizeClubSeasons(asRecord((club as any).settings));
  const wantedSeasonId = asText(seasonId);
  const season =
    (wantedSeasonId
      ? seasons.seasons.find((item) => item.id === wantedSeasonId)
      : null) || seasons.activeSeason;

  const [charges, transactions, attendanceInputs, signature, stamp] =
    await Promise.all([
      (prisma as any).athletePayment.findMany({
        where: { organization_id: clubId, athlete_id: wantedAthleteId },
      }),
      (prisma as any).paymentTransaction.findMany({
        where: { organization_id: clubId, athlete_id: wantedAthleteId },
      }),
      loadAttendanceInputs(clubId, wantedAthleteId),
      readClubSignatureImage(clubId, "signature", scope),
      readClubSignatureImage(clubId, "stamp", scope),
    ]);

  /*
    La frequenza non si conta qui: la misura il dominio contributi, con un
    periodo solo — la stagione. Le regole («conta solo `present`», «un
    allenamento senza orario non porta ore») sono le sue, e restano una.
  */
  const [measure] = measureAttendanceByPeriod({
    periods: season
      ? [
          {
            index: 0,
            label: season.label,
            start: season.startDate,
            end: season.endDate,
          },
        ]
      : [],
    trainings: attendanceInputs.trainings,
    attendance: attendanceInputs.attendance,
    requirementUnit: "hours",
  });

  const documentTitle = firstText(template.title, "Documento");

  const values = buildPlaceholderValues({
    club: club as Record<string, any>,
    athlete,
    season,
    charges: chargesWithinSeason(
      Array.isArray(charges) ? charges : [],
      season,
    ),
    transactions: Array.isArray(transactions) ? transactions : [],
    paymentPlans: (club as any).payment_plans,
    attendance: {
      sessions: measure?.sessions || 0,
      hours: measure?.hours || 0,
    },
    signature,
    stamp,
    documentTitle,
    now,
  });

  const compiled = compileTemplateWithValues({
    content: String(template.content || ""),
    values,
  });

  /*
    §5.5.25: se il club non ha caricato firma o timbro il documento esce lo
    stesso — con lo spazio per firmarlo a mano — ma **chi genera lo sa prima**,
    non dopo aver mandato in stampa cinquanta fogli.
  */
  const warnings: string[] = [];
  if (compiled.used.has("signature.club_representative") && !signature) {
    warnings.push(
      "Il club non ha caricato la firma del presidente: il documento lascia lo spazio per firmarlo a mano. Si carica in Organizzazione → Firma e timbro.",
    );
  }
  if (compiled.used.has("stamp.club") && !stamp) {
    warnings.push(
      "Il club non ha caricato il timbro: il documento lascia lo spazio per apporlo a mano. Si carica in Organizzazione → Firma e timbro.",
    );
  }

  return {
    html: compiled.html,
    title: documentTitle,
    values: compiled.values,
    unresolved: compiled.unresolved,
    missing: compiled.missing,
    warnings,
    issuer: {
      name: firstText((club as any).business_name, (club as any).name),
      logoUrl: (club as any).logo_url || null,
      address: (club as any).legal_address || (club as any).address || null,
      city: (club as any).legal_city || (club as any).city || null,
      postalCode:
        (club as any).legal_postal_code || (club as any).postal_code || null,
      province: (club as any).legal_province || (club as any).province || null,
      fiscalCode: (club as any).fiscal_code || null,
      vatNumber: (club as any).vat_number || null,
    },
  };
};

/**
 * Le chiavi che il risolutore sa produrre.
 *
 * Esiste per il test di contratto: dimostra che non ne esiste una che il
 * catalogo condiviso non conosca — cioe che il risolutore non si e costruito
 * un secondo elenco per conto proprio.
 */
export const RESOLVED_PLACEHOLDER_KEYS = Object.keys(
  buildPlaceholderValues({
    club: {},
    athlete: {},
    season: null,
    charges: [],
    transactions: [],
    paymentPlans: [],
    attendance: { sessions: 0, hours: 0 },
    signature: null,
    stamp: null,
    documentTitle: "",
    now: new Date(0),
  }),
);

/**
 * Le chiavi prodotte che il catalogo condiviso **non** conosce.
 *
 * Deve restare vuoto. Se un giorno non lo e, qualcuno ha aggiunto un
 * segnaposto al risolutore senza aggiungerlo all'elenco che l'editor mostra:
 * il documento saprebbe scrivere un dato che nessuno puo chiedergli.
 */
export const PLACEHOLDER_KEYS_OUTSIDE_CATALOG = RESOLVED_PLACEHOLDER_KEYS.filter(
  (key) => !isKnownPlaceholderKey(key),
);
