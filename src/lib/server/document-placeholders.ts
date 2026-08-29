import { prisma } from "./prisma";
import { buildMemberIdentity, getResourceById } from "./resources";
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

/**
 * Cio che **qualunque** documento ha, qualunque sia il suo soggetto.
 *
 * **Perche e una funzione a se** (Wave 3, W3-B). Fino alla Wave 2 il
 * risolutore sapeva compilare un documento solo: quello intestato a un atleta.
 * Un contratto per un allenatore o una delibera del club non avevano modo di
 * esistere, e le chiavi di staff, allenatori e soci restavano bianche — il
 * debito `DOC-04`.
 *
 * Il club, la data, la stagione, il titolo e i blocchi firma non dipendono dal
 * soggetto: vivono qui, e ogni soggetto ci aggiunge cio che sa di se.
 */
const buildCommonValues = (context: {
  club: Record<string, any>;
  season: ClubSeason | null;
  signature: { dataUrl: string } | null;
  stamp: { dataUrl: string } | null;
  documentTitle: string;
  now: Date;
}): Record<string, PlaceholderValue> => {
  const { club, season, now } = context;
  const clubSettings = asRecord(club.settings);

  return {
    "club.name": text(firstText(club.business_name, club.name)),
    "club.address": text(firstText(club.legal_address, club.address)),
    "club.city": text(firstText(club.legal_city, club.city)),
    "club.email": text(firstText(club.contact_email, clubSettings.companyEmail)),
    "club.phone": text(club.contact_phone),
    "club.fiscal_code": text(club.fiscal_code),
    "club.vat_number": text(club.vat_number),
    "club.website": text(firstText(club.website, clubSettings.website)),

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

  return {
    ...buildCommonValues(context),

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

    /*
      Il destinatario, in un **documento**, e il soggetto: e la differenza con
      un messaggio, dove il destinatario e chi legge — un genitore — e lo
      risolve chi manda. Un modello che scrive «Gentile {{recipient.name}}»
      funziona quindi in tutti e quattro i soggetti, ed e la ragione per cui la
      chiave e marcata `system` nel catalogo invece che «atleta».
    */
    "recipient.name": text(
      [athlete.first_name, athlete.last_name].filter(Boolean).join(" "),
    ),
    "recipient.first_name": text(athlete.first_name),
  };
};

/**
 * Nome e cognome di una persona che vive in una collezione JSON del club.
 *
 * **Chiama il proprietario, non lo ricopia.** Ne era nata una copia qui, e le
 * due divergevano proprio dove conta: `buildMemberIdentity` neutralizza la
 * stringa letterale «undefined undefined» — una forma storica reale del dato —
 * la copia no. Il risultato sarebbe stato un attestato, con la firma del
 * presidente sopra, intestato a «undefined undefined».
 */
const readClubPersonIdentity = (person: Record<string, any>) =>
  buildMemberIdentity(person || {});

/**
 * I valori di un documento che parla di **una persona del club**: allenatore
 * o staff.
 *
 * Le due famiglie di chiavi — `trainer.*` e `staff.*` — producono lo stesso
 * dato, e non e una svista. Chi scrive un modello per un allenatore cerca
 * «Allenatori» nella barra laterale, chi lo scrive per un dirigente cerca
 * «Staff», e nessuno dei due deve sapere che sotto sono la stessa persona con
 * un ruolo diverso. Il **soggetto** e lo stesso (`person`), quindi il modello
 * non promette niente che non sappia riempire.
 */
const buildPersonValues = (context: {
  club: Record<string, any>;
  person: Record<string, any>;
  season: ClubSeason | null;
  signature: { dataUrl: string } | null;
  stamp: { dataUrl: string } | null;
  documentTitle: string;
  now: Date;
}): Record<string, PlaceholderValue> => {
  const identity = readClubPersonIdentity(context.person);
  const person = context.person;

  const role = firstText(person.role, person.ruolo, person.position);
  const email = firstText(person.email, person.mail);
  const phone = firstText(person.phone, person.telefono, person.mobile);

  const shared = {
    first_name: text(identity.firstName),
    last_name: text(identity.lastName),
    role: text(role),
    email: text(email),
    phone: text(phone),
  };

  return {
    ...buildCommonValues(context),

    "trainer.first_name": shared.first_name,
    "trainer.last_name": shared.last_name,
    "trainer.role": shared.role,
    "trainer.email": shared.email,
    "trainer.phone": shared.phone,

    "staff.first_name": shared.first_name,
    "staff.last_name": shared.last_name,
    "staff.role": shared.role,
    "staff.email": shared.email,
    "staff.phone": shared.phone,

    "recipient.name": text(identity.fullName),
    "recipient.first_name": shared.first_name,
  };
};

/** I valori di un documento che parla di **un socio**. */
const buildMemberValues = (context: {
  club: Record<string, any>;
  member: Record<string, any>;
  season: ClubSeason | null;
  signature: { dataUrl: string } | null;
  stamp: { dataUrl: string } | null;
  documentTitle: string;
  now: Date;
}): Record<string, PlaceholderValue> => {
  const identity = readClubPersonIdentity(context.member);
  const member = context.member;

  return {
    ...buildCommonValues(context),

    "member.first_name": text(identity.firstName),
    "member.last_name": text(identity.lastName),
    "member.email": text(firstText(member.email, member.mail)),
    "member.phone": text(firstText(member.phone, member.telefono)),

    "recipient.name": text(identity.fullName),
    "recipient.first_name": text(identity.firstName),
  };
};

/**
 * I valori di un documento che parla **solo del club**: una delibera, un
 * regolamento, una comunicazione a firma della societa.
 *
 * Non ha bisogno di nessuna persona, ed e il caso che prima non esisteva: un
 * documento senza soggetto era impossibile da generare perche il risolutore
 * pretendeva un atleta.
 */
const buildClubOnlyValues = (context: {
  club: Record<string, any>;
  season: ClubSeason | null;
  signature: { dataUrl: string } | null;
  stamp: { dataUrl: string } | null;
  documentTitle: string;
  now: Date;
}): Record<string, PlaceholderValue> => {
  const common = buildCommonValues(context);
  return {
    ...common,
    "recipient.name": common["club.name"],
    "recipient.first_name": common["club.name"],
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

  /*
    **`values` porta soltanto cio che il modello ha davvero nominato**, e non
    tutto quello che il risolutore sa produrre.

    Il difetto che questa riga chiude era il piu grave della Wave, e l'audit lo
    ha misurato. Il risolutore costruisce sempre la mappa **completa** per il
    soggetto — versato, dovuto, residuo, codice fiscale del minore, recapiti
    dei tutori — perche non sa in anticipo quali chiavi il modello usera. Se
    quella mappa esce intera, esce anche da un modello che nomina il solo nome
    dell'atleta: e quel modello e stato pubblicato con `sensitivity: []`,
    quindi lo genera anche chi gli importi non li puo vedere.

    Peggio: `values` finisce in `values_snapshot`, cioe **si conserva**. Il
    documento resterebbe leggibile per sempre da chiunque, con dentro numeri
    che nessuno gli aveva chiesto di scrivere.

    Filtrando qui, `sensitivity` torna a descrivere onestamente il contenuto:
    cio che il documento dice e cio che il documento porta.
  */
  const disclosed: Record<string, string> = {};
  for (const key of used) {
    if (plain[key] !== undefined) disclosed[key] = plain[key];
  }

  return { html, values: disclosed, unresolved, missing, used };
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

/* ============================================ i soggetti oltre l'atleta */

/**
 * Di chi parla il documento che si sta generando.
 *
 * `athlete` e il caso di Wave 1 e resta identico; gli altri tre sono la
 * chiusura di `DOC-04` — l'editor proponeva chiavi di staff, allenatori e soci
 * dentro modelli che non avevano nessuno a cui riferirle.
 */
export type DocumentSubjectRef =
  | { kind: "club" }
  | { kind: "athlete"; id: string }
  | { kind: "person"; id: string }
  | { kind: "member"; id: string };

/**
 * Trova una persona dentro una collezione JSON del club.
 *
 * Cerca in `trainers` **e** in `staff_members`, nell'ordine, perche il
 * soggetto e uno solo — «una persona del club» — mentre le due collezioni sono
 * due elenchi che l'interfaccia tiene separati. Confronta piu grafie
 * dell'identificativo perche queste collezioni sono state scritte da schermate
 * diverse in anni diversi.
 */
const findClubPerson = (club: Record<string, any>, id: string) => {
  const wanted = asText(id);
  if (!wanted) return null;

  /*
    **Si confronta un campo solo, e se corrisponde a due righe non si sceglie.**

    Prima si confrontavano quattro grafie dell'identificativo — `id`, `uuid`,
    `user_id`, `userId` — e si prendeva la prima corrispondenza, cercando
    prima fra gli allenatori e poi nello staff. In una ASD la stessa persona
    ha spesso due schede, e il `user_id` di una puo coincidere con l'`id`
    dell'altra: il documento usciva intestato alla scheda sbagliata, con nome
    e codice fiscale di un'altra riga, e **ben formato** — quindi nessuno se
    ne accorgeva.

    Meglio rifiutare che indovinare: un documento intestato alla persona
    sbagliata e peggio di un documento non generato.
  */
  const matches: Record<string, any>[] = [];

  for (const key of ["trainers", "staff_members"]) {
    const list = Array.isArray(club[key]) ? club[key] : [];
    for (const entry of list) {
      if (!entry || typeof entry !== "object") continue;
      if (asText((entry as any).id) === wanted) {
        matches.push(entry as Record<string, any>);
      }
    }
  }

  if (matches.length > 1) {
    throw new Error(
      "L'identificativo della persona corrisponde a piu di una scheda: correggila prima di generare il documento",
    );
  }

  return matches[0] || null;
};

const findClubMember = (club: Record<string, any>, id: string) => {
  const wanted = asText(id);
  if (!wanted) return null;

  const list = Array.isArray(club.members) ? club.members : [];
  const found = list.find(
    (entry: any) =>
      entry &&
      typeof entry === "object" &&
      [entry.id, entry.uuid, entry.member_id, entry.user_id]
        .map((value) => asText(value))
        .includes(wanted),
  );

  return (found as Record<string, any>) || null;
};

/**
 * Il documento compilato, per **qualunque** soggetto.
 *
 * **Perche una funzione sola e non quattro rotte.** Il confine di sicurezza,
 * la lettura del club, la stagione, la firma e il timbro sono identici per
 * tutti e quattro i soggetti: quattro copie sarebbero quattro occasioni di
 * dimenticare un controllo. Cambia solo **chi** si legge e **quali chiavi** si
 * producono.
 *
 * L'atleta continua a passare da `resolveDocumentPlaceholders`, che resta la
 * strada collaudata: qui viene semplicemente richiamata.
 */
export const resolveDocumentForSubject = async ({
  template,
  organizationId,
  subject,
  seasonId,
  scope,
  now = new Date(),
}: {
  template: DocumentPlaceholderTemplate;
  organizationId: string;
  subject: DocumentSubjectRef;
  seasonId?: string | null;
  scope?: DocumentPlaceholderScope;
  now?: Date;
}): Promise<ResolvedDocumentPlaceholders> => {
  if (subject.kind === "athlete") {
    return resolveDocumentPlaceholders({
      template,
      organizationId,
      athleteId: subject.id,
      seasonId,
      scope,
      now,
    });
  }

  const clubId = asText(organizationId);
  ensureOrganizationAccess(scope, clubId);

  const club = await getResourceById("clubs", clubId, scope);
  if (!club) throw new Error("Club non trovato");

  const seasons = normalizeClubSeasons(asRecord((club as any).settings));
  const wantedSeasonId = asText(seasonId);
  const season =
    (wantedSeasonId
      ? seasons.seasons.find((item) => item.id === wantedSeasonId)
      : null) || seasons.activeSeason;

  const [signature, stamp] = await Promise.all([
    readClubSignatureImage(clubId, "signature", scope),
    readClubSignatureImage(clubId, "stamp", scope),
  ]);

  const documentTitle = firstText(template.title, "Documento");
  const common = {
    club: club as Record<string, any>,
    season,
    signature,
    stamp,
    documentTitle,
    now,
  };

  let values: Record<string, PlaceholderValue>;

  if (subject.kind === "club") {
    values = buildClubOnlyValues(common);
  } else if (subject.kind === "person") {
    const person = findClubPerson(club as Record<string, any>, subject.id);
    /*
      Una persona che non sta nelle collezioni di **questo** club risponde come
      un identificativo di un'altra societa: la ricerca e gia ristretta alla
      riga del club, quindi non esiste un modo di sbagliare il confine.
    */
    if (!person) throw denied("la persona non appartiene a questo club");
    values = buildPersonValues({ ...common, person });
  } else {
    const member = findClubMember(club as Record<string, any>, subject.id);
    if (!member) throw denied("il socio non appartiene a questo club");
    values = buildMemberValues({ ...common, member });
  }

  const compiled = compileTemplateWithValues({
    content: String(template.content || ""),
    values,
  });

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
 * Le chiavi che il risolutore sa produrre **per ogni soggetto**.
 *
 * Serve al test di contratto e all'editor: dire «questo modello parla di un
 * socio, quindi sa scrivere queste undici cose» e possibile solo se l'elenco
 * lo produce il risolutore, non un secondo elenco scritto a mano.
 */
export const RESOLVED_KEYS_BY_SUBJECT: Record<string, string[]> = {
  club: Object.keys(
    buildClubOnlyValues({
      club: {},
      season: null,
      signature: null,
      stamp: null,
      documentTitle: "",
      now: new Date(0),
    }),
  ),
  athlete: RESOLVED_PLACEHOLDER_KEYS,
  person: Object.keys(
    buildPersonValues({
      club: {},
      person: {},
      season: null,
      signature: null,
      stamp: null,
      documentTitle: "",
      now: new Date(0),
    }),
  ),
  member: Object.keys(
    buildMemberValues({
      club: {},
      member: {},
      season: null,
      signature: null,
      stamp: null,
      documentTitle: "",
      now: new Date(0),
    }),
  ),
};
