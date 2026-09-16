import type { MembershipTarget, MembershipTargetIndex } from "@/lib/categories/placement";
import { isWellFormedCodiceFiscale } from "@/lib/italian-registry";
import { todayLocalDateOnly } from "@/lib/date-only";
import { MIN_PLAUSIBLE_BIRTH_YEAR, isRealCalendarDate } from "@/lib/birth-date";

/**
 * **Il piano di un import di atleti** (ADR-0195).
 *
 * Un modulo puro, uno solo, che alimenta l'anteprima del wizard, il carico
 * da mandare al server, i test e il rapporto forense: per ogni riga letta
 * dal file dice cosa c'era, cosa se ne e capito, cosa la ferma, cosa la
 * segnala e cosa succedera. **Nessuna riga non vuota sparisce**: ogni riga
 * finisce in uno stato, e i totali tornano sempre
 * (`candidates = ready + warning + error + duplicate + excluded`).
 *
 * Il difetto che chiude — il file vero da 113 righe importato per 97 —
 * non era un parser che perdeva righe: era un parser che le **scartava**
 * senza che nessuno potesse fare niente. Quattro righe senza anno di
 * nascita (un dato che la scheda puo non avere), undici con una categoria
 * che nomina due squadre, una ripetuta nel file. Qui ognuna di quelle
 * sedici righe ha uno stato, un motivo e una via d'uscita: una correzione,
 * una decisione, o un'esclusione dichiarata.
 *
 * Le categorie del file **non si creano mai da sole** (§8 del mandato): ogni
 * etichetta distinta e una decisione del club — collegare a una squadra
 * esistente, crearne una nuova, non importarla — e finche la decisione non
 * c'e la riga non e pronta. Un nome che nomina due squadre (ADR-0155) non
 * si risolve scegliendo la prima.
 */

/* ── Vocabolario ─────────────────────────────────────────────────────────── */

export type ImportRowState = "ready" | "warning" | "error" | "duplicate_candidate" | "ignored_by_user";

export type ImportRowAction = "create" | "link" | "skip";

export type ImportIssueSeverity = "error" | "warning" | "info";

export type ImportIssueCode =
  | "missing_first_name"
  | "missing_last_name"
  | "missing_birth_date"
  | "invalid_birth_date"
  | "future_birth_date"
  | "implausible_birth_date"
  | "year_only"
  | "invalid_fiscal_code"
  | "invalid_email"
  | "gender_unrecognized"
  | "formula_like_text"
  | "category_pending"
  | "category_ambiguous"
  | "category_unknown"
  | "category_none"
  | "category_excluded"
  | "category_to_create"
  | "category_without_site"
  | "duplicate_in_file"
  | "possible_homonym_in_file"
  | "duplicate_existing"
  | "possible_homonym_existing"
  | "existing_inactive"
  | "link_keeps_membership"
  | "link_fills_fields"
  | "excluded_by_user";

export type ImportIssue = {
  readonly code: ImportIssueCode;
  readonly severity: ImportIssueSeverity;
  readonly message: string;
  /** La riga del file a cui si riferisce (duplicati nel file). */
  readonly relatedRow?: number;
  /** La scheda del club a cui si riferisce (duplicati e omonimi). */
  readonly relatedAthleteId?: string;
};

export type AthleteImportField =
  | "firstName"
  | "lastName"
  | "fullName"
  | "birthDate"
  | "birthYear"
  | "category"
  | "gender"
  | "fiscalCode"
  | "email"
  | "phone";

export type AthleteImportMapping = Partial<Record<AthleteImportField, string>>;

/** Una riga letta dal file, con il numero di riga **del file**. */
export type ParsedImportRow = {
  readonly sourceRowNumber: number;
  readonly values: Readonly<Record<string, string>>;
  /** Celle che contenevano una formula: il valore letto e il risultato memorizzato. */
  readonly formulaCells?: readonly string[];
};

export type ExistingAthleteIdentity = {
  id?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  birthDate?: string | null;
  fiscalCode?: string | null;
  status?: string | null;
  /** Vero se la scheda ha gia almeno un'appartenenza: collegarla non la cambia. */
  hasMemberships?: boolean | null;
  categoryLabel?: string | null;
};

export type RowCorrection = Partial<{
  firstName: string;
  lastName: string;
  birthDate: string;
  categoryLabel: string;
  gender: string;
  fiscalCode: string;
  email: string;
  phone: string;
}>;

export type CategoryDecision =
  | { readonly kind: "map"; readonly targetId: string }
  | {
      readonly kind: "create";
      readonly name: string;
      /** La sede della squadra nuova, o vuota: senza sede la categoria nasce senza squadra. */
      readonly siteId: string;
    }
  | { readonly kind: "skip"; readonly athletes: "import_without_category" | "exclude" };

export type DuplicateDecision =
  | { readonly kind: "link"; readonly athleteId: string }
  | { readonly kind: "new" }
  | { readonly kind: "skip" };

export type AthleteImportDecisions = {
  readonly categories?: Readonly<Record<string, CategoryDecision>>;
  readonly duplicates?: Readonly<Record<number, DuplicateDecision>>;
  readonly excludedRows?: readonly number[];
  readonly corrections?: Readonly<Record<number, RowCorrection>>;
};

export type NormalizedImportValues = {
  readonly firstName: string;
  readonly lastName: string;
  readonly birthDate: string;
  readonly birthDateKind: "full" | "year_only" | "missing" | "invalid";
  readonly rawBirth: string;
  readonly gender: string;
  readonly fiscalCode: string;
  readonly email: string;
  readonly phone: string;
  readonly categoryLabel: string;
};

export type CategoryResolution =
  | { readonly kind: "none" }
  | { readonly kind: "pending"; readonly label: string; readonly key: string }
  | { readonly kind: "target"; readonly label: string; readonly key: string; readonly target: MembershipTarget }
  | { readonly kind: "create"; readonly label: string; readonly key: string; readonly name: string; readonly siteId: string }
  | { readonly kind: "without_category"; readonly label: string; readonly key: string }
  | { readonly kind: "excluded"; readonly label: string; readonly key: string };

export type ImportRowDiagnostic = {
  readonly sourceRowNumber: number;
  readonly raw: Readonly<Record<string, string>>;
  readonly normalized: NormalizedImportValues;
  /** I campi cambiati dal club nel wizard, rispetto al file. */
  readonly correctedFields: readonly (keyof RowCorrection)[];
  readonly validation: { readonly errors: readonly ImportIssue[]; readonly warnings: readonly ImportIssue[] };
  readonly duplicateCandidates: {
    readonly inFile: readonly { readonly row: number; readonly strength: "strong" | "weak" }[];
    readonly existing: readonly {
      readonly athleteId: string;
      readonly label: string;
      readonly birthDate: string;
      readonly status: string;
      readonly strength: "strong" | "weak";
      readonly hasMemberships: boolean;
      readonly categoryLabel: string;
    }[];
    readonly decision: DuplicateDecision | null;
  };
  readonly categoryResolution: CategoryResolution;
  readonly state: ImportRowState;
  readonly finalAction: ImportRowAction;
  /** Tutte le voci, nell'ordine in cui si mostrano: errori, duplicati, avvisi. */
  readonly issues: readonly ImportIssue[];
};

export type ImportCategoryLabel = {
  readonly key: string;
  readonly label: string;
  /** Tutte le grafie con cui il file scrive questa etichetta (la prima e `label`). */
  readonly spellings: readonly string[];
  readonly rowNumbers: readonly number[];
  readonly count: number;
  readonly suggestion: {
    /** Le squadre che il nome puo indicare: una sola e una proposta, piu di una e una scelta. */
    readonly targets: readonly MembershipTarget[];
    readonly exact: boolean;
    readonly ambiguous: boolean;
  };
  readonly decision: CategoryDecision | null;
  /** La decisione e quella proposta da EasyGame, non ancora toccata dal club. */
  readonly suggested: boolean;
  /**
   * Vero quando la decisione basta a scrivere: «collega» con una squadra che
   * esiste, «crea» con un nome, «non importare». Un «collega» senza squadra
   * scelta e ancora da decidere, e lo si dice (revisione ostile C2/M4).
   */
  readonly resolved: boolean;
  readonly birthYearFrom: number | null;
  readonly birthYearTo: number | null;
};

export type AthleteImportTotals = {
  readonly candidates: number;
  readonly ready: number;
  readonly warning: number;
  readonly error: number;
  readonly duplicate: number;
  readonly excluded: number;
  readonly toCreate: number;
  readonly toLink: number;
  readonly toSkip: number;
  readonly withMembership: number;
  readonly categoriesToCreate: number;
  readonly pendingCategories: number;
  readonly pendingDuplicates: number;
  /** Righe ferme **solo** perche una categoria e da decidere: non un errore dei dati. */
  readonly awaitingDecision: number;
};

export type AthleteImportPlan = {
  readonly rows: readonly ImportRowDiagnostic[];
  readonly categories: readonly ImportCategoryLabel[];
  readonly totals: AthleteImportTotals;
  /** `candidates = ready + warning + error + duplicate + excluded`: se e falso e un difetto del piano. */
  readonly totalsConsistent: boolean;
};

export type AthleteImportPlanInput = {
  readonly rows: readonly ParsedImportRow[];
  readonly mapping: AthleteImportMapping;
  readonly targets?: MembershipTargetIndex | null;
  readonly existingAthletes?: readonly ExistingAthleteIdentity[];
  readonly decisions?: AthleteImportDecisions;
  readonly today?: string;
  /** Senza il permesso di creare categorie la proposta «crea» non si fa. */
  readonly canCreateCategories?: boolean;
};

/* ── Normalizzazione ─────────────────────────────────────────────────────── */

const text = (value: unknown) => String(value ?? "").trim();

/** Chiave di confronto di un nome o di un'etichetta: minuscolo, senza accenti, spazi compressi. */
export const nameKey = (value: unknown) =>
  text(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[\u2018\u2019\u0060]/g, "'")
    .replace(/\s+/g, " ")
    .trim();

/**
 * Chiave di confronto di un'etichetta di categoria: solo lettere e cifre,
 * «under» abbreviato in «u», cosi «UNDER14 GOLD», «Under 14 Gold» e
 * «U14 Gold» sono la stessa parola. Serve a **proporre**, mai a decidere.
 */
export const categoryLabelKey = (value: unknown) =>
  nameKey(value)
    .replace(/[^a-z0-9]+/g, "")
    .replace(/^under(?=\d)/, "u");

const excelSerialToDate = (value: number) => {
  const epoch = Date.UTC(1899, 11, 30);
  return new Date(epoch + value * 86400000).toISOString().slice(0, 10);
};

export type ParsedBirthDate = { iso: string; kind: "full" | "year_only" | "missing" | "invalid" };

export const parseBirthDate = (value: unknown): ParsedBirthDate => {
  if (value === null || value === undefined || value === "") return { iso: "", kind: "missing" };
  if (typeof value === "number" && Number.isFinite(value)) {
    if (value > 20000) return { iso: excelSerialToDate(value), kind: "full" };
    if (value >= 1900 && value <= 2100) return { iso: `${value}-01-01`, kind: "year_only" };
    return { iso: "", kind: "invalid" };
  }
  const raw = text(value);
  if (!raw) return { iso: "", kind: "missing" };
  if (/^\d{4}$/.test(raw)) return { iso: `${raw}-01-01`, kind: "year_only" };
  if (/^\d{4}-\d{2}-\d{2}(T.*)?$/.test(raw)) {
    const iso = raw.slice(0, 10);
    return isRealCalendarDate(iso) ? { iso, kind: "full" } : { iso: "", kind: "invalid" };
  }
  const slash = raw.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (slash) {
    const [, day, month, year] = slash;
    const iso = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
    return isRealCalendarDate(iso) ? { iso, kind: "full" } : { iso: "", kind: "invalid" };
  }
  /* Solo formati espliciti: `new Date("12/03/2010")` leggerebbe all'americana. */
  return { iso: "", kind: "invalid" };
};

export const splitFullName = (value: unknown) => {
  const parts = text(value).split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: "", lastName: "" };
  if (parts.length === 1) return { firstName: parts[0], lastName: "" };
  /* Negli export italiani il nominativo e quasi sempre «Cognome Nome». */
  return { firstName: parts[parts.length - 1], lastName: parts.slice(0, -1).join(" ") };
};

export const normalizeGenderValue = (value: unknown) => {
  const upper = text(value).toUpperCase();
  if (!upper) return "";
  if (["M", "MASCHIO", "MALE", "MASCHILE", "U", "1"].includes(upper)) return "M";
  if (["F", "FEMMINA", "FEMALE", "FEMMINILE", "2"].includes(upper)) return "F";
  return "";
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Un testo che comincia come una formula: in un foglio aperto altrove diventerebbe codice. */
export const looksLikeFormula = (value: unknown) => /^[=@]|^[+\-](?=[^\d\s(])/.test(text(value));

const identityKey = (row: { firstName: string; lastName: string; birthDate: string }) =>
  `${nameKey(row.lastName)}|${nameKey(row.firstName)}|${row.birthDate}`;

const personKey = (row: { firstName: string; lastName: string }) =>
  `${nameKey(row.lastName)}|${nameKey(row.firstName)}`;

const normalizeRow = (
  row: ParsedImportRow,
  mapping: AthleteImportMapping,
  correction: RowCorrection | undefined,
): { values: NormalizedImportValues; correctedFields: (keyof RowCorrection)[] } => {
  const cell = (field: AthleteImportField) => (mapping[field] ? text(row.values[mapping[field] as string]) : "");
  const corrected: (keyof RowCorrection)[] = [];
  const fix = <K extends keyof RowCorrection>(key: K, fromFile: string) => {
    const value = correction?.[key];
    if (typeof value === "string" && value.trim() !== fromFile) {
      corrected.push(key);
      return value.trim();
    }
    return fromFile;
  };

  const split = splitFullName(cell("fullName"));
  const firstName = fix("firstName", cell("firstName") || split.firstName);
  const lastName = fix("lastName", cell("lastName") || split.lastName);
  const rawBirth = fix("birthDate", cell("birthDate") || cell("birthYear"));
  const birth = parseBirthDate(rawBirth);
  const gender = normalizeGenderValue(fix("gender", cell("gender")));
  const fiscalCode = fix("fiscalCode", cell("fiscalCode").toUpperCase()).toUpperCase();
  const email = fix("email", cell("email"));
  const phone = fix("phone", cell("phone"));
  const categoryLabel = fix("categoryLabel", cell("category"));

  return {
    values: {
      firstName,
      lastName,
      birthDate: birth.iso,
      birthDateKind: birth.kind,
      rawBirth,
      gender,
      fiscalCode,
      email,
      phone,
      categoryLabel,
    },
    correctedFields: corrected,
  };
};

/* ── Categorie: suggerimenti e decisioni ─────────────────────────────────── */

const suggestTargets = (label: string, targets: MembershipTargetIndex | null | undefined) => {
  if (!label || !targets) return { targets: [] as MembershipTarget[], exact: false, ambiguous: false };
  const byLabel = targets.fromLabel(label);
  if (byLabel.target) return { targets: [byLabel.target], exact: true, ambiguous: false };
  const key = categoryLabelKey(label);
  const same = targets.targets.filter(
    (target) => categoryLabelKey(target.label) === key || categoryLabelKey(target.categoryName) === key,
  );
  if (same.length) {
    const categoryIds = new Set(same.map((target) => target.categoryId));
    /* Una categoria sola con piu squadre, o piu categorie omonime: si sceglie, non si indovina. */
    return { targets: same, exact: same.length === 1, ambiguous: same.length > 1 || categoryIds.size > 1 };
  }
  /* «U14 REG.» per «Under 14 Regionale»: un'abbreviazione si propone, non si applica. */
  const near = targets.targets.filter((target) => {
    const candidate = categoryLabelKey(target.categoryName);
    return key.length >= 4 && candidate.length >= 4 && (candidate.startsWith(key) || key.startsWith(candidate));
  });
  return { targets: near, exact: false, ambiguous: near.length > 1 };
};

const collectCategories = (
  rows: readonly { sourceRowNumber: number; normalized: NormalizedImportValues }[],
  input: AthleteImportPlanInput,
): ImportCategoryLabel[] => {
  const byKey = new Map<string, { label: string; spellings: string[]; rows: number[]; years: number[] }>();
  for (const row of rows) {
    const label = row.normalized.categoryLabel;
    if (!label) continue;
    const key = categoryLabelKey(label) || nameKey(label);
    const entry = byKey.get(key) || { label, spellings: [], rows: [], years: [] };
    if (!entry.spellings.includes(label)) entry.spellings.push(label);
    entry.rows.push(row.sourceRowNumber);
    const year = Number(row.normalized.birthDate.slice(0, 4));
    if (Number.isFinite(year) && year > 0) entry.years.push(year);
    byKey.set(key, entry);
  }
  const decisions = input.decisions?.categories || {};
  return Array.from(byKey.entries()).map(([key, entry]) => {
    const suggestion = suggestTargets(entry.label, input.targets);
    const chosen = decisions[key] || null;
    /*
      Una squadra sola, trovata per **nome** (stesso nome a meno di maiuscole e
      spazi): si propone gia scelta, e il club la vede in anteprima. Una
      corrispondenza per chiave («U14» ↔ «Under 14») si propone e basta:
      serve un clic (revisione ostile B11).
    */
    const unica = suggestion.exact && !suggestion.ambiguous && suggestion.targets.length === 1 ? suggestion.targets[0] : null;
    const stessoNome = unica ? nameKey(unica.categoryName) === nameKey(entry.label) || nameKey(unica.label) === nameKey(entry.label) : false;
    const proposed = !chosen && unica && stessoNome ? ({ kind: "map", targetId: unica.id } as const) : null;
    const decision = chosen || proposed;
    const resolved =
      !!decision &&
      (decision.kind === "skip" ||
        (decision.kind === "map" && Boolean(input.targets?.byId(decision.targetId))) ||
        (decision.kind === "create" && Boolean(text(decision.name)) && input.canCreateCategories !== false));
    return {
      key,
      label: entry.label,
      spellings: entry.spellings,
      rowNumbers: entry.rows,
      count: entry.rows.length,
      suggestion,
      decision,
      suggested: !chosen && Boolean(proposed),
      resolved,
      birthYearFrom: entry.years.length ? Math.min(...entry.years) : null,
      birthYearTo: entry.years.length ? Math.max(...entry.years) : null,
    };
  });
};

const resolveCategory = (
  label: string,
  categories: readonly ImportCategoryLabel[],
  targets: MembershipTargetIndex | null | undefined,
): CategoryResolution => {
  if (!label) return { kind: "none" };
  const key = categoryLabelKey(label) || nameKey(label);
  const entry = categories.find((category) => category.key === key);
  const decision = entry?.decision || null;
  if (!decision || !entry?.resolved) return { kind: "pending", label, key };
  if (decision.kind === "map") {
    const target = targets?.byId(decision.targetId) || null;
    if (!target) return { kind: "pending", label, key };
    return { kind: "target", label, key, target };
  }
  if (decision.kind === "create") return { kind: "create", label, key, name: text(decision.name), siteId: decision.siteId || "" };
  return decision.athletes === "exclude" ? { kind: "excluded", label, key } : { kind: "without_category", label, key };
};

/* ── Il piano ────────────────────────────────────────────────────────────── */

export const buildAthleteImportPlan = (input: AthleteImportPlanInput): AthleteImportPlan => {
  const todayIso = String(input.today || "").slice(0, 10) || todayLocalDateOnly();
  const corrections = input.decisions?.corrections || {};
  const excluded = new Set(input.decisions?.excludedRows || []);
  const duplicateDecisions = input.decisions?.duplicates || {};

  const normalizedRows = input.rows.map((row) => {
    const { values, correctedFields } = normalizeRow(row, input.mapping, corrections[row.sourceRowNumber]);
    return { source: row, normalized: values, correctedFields, sourceRowNumber: row.sourceRowNumber };
  });

  const categories = collectCategories(normalizedRows, input);

  /* Indici per i duplicati: nel file e nel club. */
  const existing = (input.existingAthletes || []).map((athlete) => ({
    id: text(athlete.id),
    firstName: text(athlete.firstName),
    lastName: text(athlete.lastName),
    birthDate: text(athlete.birthDate).slice(0, 10),
    fiscalCode: text(athlete.fiscalCode).toUpperCase(),
    status: text(athlete.status) || "active",
    hasMemberships: Boolean(athlete.hasMemberships),
    categoryLabel: text(athlete.categoryLabel),
  }));
  const existingByIdentity = new Map<string, typeof existing>();
  const existingByPerson = new Map<string, typeof existing>();
  const existingByFiscal = new Map<string, typeof existing>();
  for (const athlete of existing) {
    const push = (map: Map<string, typeof existing>, key: string) => {
      if (!key) return;
      map.set(key, [...(map.get(key) || []), athlete]);
    };
    if (athlete.birthDate) push(existingByIdentity, identityKey(athlete));
    push(existingByPerson, personKey(athlete));
    push(existingByFiscal, athlete.fiscalCode);
  }
  const seenIdentity = new Map<string, number>();
  const seenPerson = new Map<string, number[]>();
  const seenFiscal = new Map<string, number>();
  const seenNameYear = new Map<string, number>();
  const existingByNameYear = new Map<string, typeof existing>();
  for (const athlete of existing) {
    if (!athlete.birthDate) continue;
    const key = `${personKey(athlete)}|${athlete.birthDate.slice(0, 4)}`;
    existingByNameYear.set(key, [...(existingByNameYear.get(key) || []), athlete]);
  }
  /* Una riga esclusa dal club, o decisa «non importare», non fa da ancora ai duplicati (revisione ostile A-M7). */
  const nonAncora = (row: number) => excluded.has(row) || duplicateDecisions[row]?.kind === "skip";
  let pendingDuplicateRows = 0;

  const rows: ImportRowDiagnostic[] = normalizedRows.map(({ source, normalized, correctedFields, sourceRowNumber }) => {
    const errors: ImportIssue[] = [];
    const warnings: ImportIssue[] = [];
    const error = (code: ImportIssueCode, message: string, extra: Partial<ImportIssue> = {}) =>
      errors.push({ code, severity: "error", message, ...extra });
    const warn = (code: ImportIssueCode, message: string, extra: Partial<ImportIssue> = {}) =>
      warnings.push({ code, severity: "warning", message, ...extra });

    if (!normalized.firstName) error("missing_first_name", "Nome mancante");
    if (!normalized.lastName) error("missing_last_name", "Cognome mancante");

    switch (normalized.birthDateKind) {
      case "missing":
        /* La scheda puo non avere la data: si importa e lo si dice, con la correzione a portata di mano. */
        warn("missing_birth_date", "Data di nascita mancante: la scheda nasce senza data");
        break;
      case "invalid":
        error("invalid_birth_date", `Data di nascita non riconosciuta (${normalized.rawBirth})`);
        break;
      default: {
        const year = Number(normalized.birthDate.slice(0, 4));
        if (normalized.birthDate > todayIso) error("future_birth_date", `Data di nascita nel futuro (${normalized.birthDate})`);
        else if (year < MIN_PLAUSIBLE_BIRTH_YEAR) error("implausible_birth_date", `Data di nascita non plausibile (${normalized.birthDate})`);
        else if (normalized.birthDateKind === "year_only" && input.mapping.birthDate && !input.mapping.birthYear) {
          warn("year_only", `Solo l'anno (${normalized.rawBirth}): data impostata al 1 gennaio`);
        }
      }
    }
    if (normalized.fiscalCode && !isWellFormedCodiceFiscale(normalized.fiscalCode)) error("invalid_fiscal_code", "Codice fiscale non valido");
    if (normalized.email && !EMAIL_PATTERN.test(normalized.email)) error("invalid_email", "Email non valida");
    if (input.mapping.gender && text(source.values[input.mapping.gender]) && !normalized.gender) warn("gender_unrecognized", "Sesso non riconosciuto");
    const formulaLike = Object.values(source.values).filter(looksLikeFormula);
    if (formulaLike.length || source.formulaCells?.length) {
      warn("formula_like_text", "Una cella sembra una formula: si importa come testo");
    }

    /* Categoria: la decisione del club, o la sua assenza. */
    const categoryResolution = resolveCategory(normalized.categoryLabel, categories, input.targets);
    const entry = categories.find((category) => category.label && category.key === (categoryLabelKey(normalized.categoryLabel) || nameKey(normalized.categoryLabel)));
    switch (categoryResolution.kind) {
      case "pending":
        if (entry?.decision?.kind === "map") {
          error("category_pending", `«${categoryResolution.label}»: scegliere la squadra al passo Categorie`);
        } else if (entry?.decision?.kind === "create") {
          error("category_pending", input.canCreateCategories === false ? `«${categoryResolution.label}»: il tuo ruolo non crea categorie, collegala o non importarla` : `«${categoryResolution.label}»: dare un nome alla categoria nuova al passo Categorie`);
        } else if (entry?.suggestion.ambiguous) {
          error(
            "category_ambiguous",
            `«${categoryResolution.label}» può indicare più squadre (${entry.suggestion.targets.map((target) => target.label).join(", ")}): scegliere quale al passo Categorie`,
          );
        } else if (entry?.suggestion.targets.length) {
          error("category_pending", `Decidere cosa fare di «${categoryResolution.label}» al passo Categorie`);
        } else {
          error("category_unknown", `«${categoryResolution.label}» non è una categoria del club: decidere al passo Categorie`);
        }
        break;
      case "create":
        warn("category_to_create", `Verra creata la categoria «${categoryResolution.name}»${categoryResolution.siteId ? "" : " senza sede"}`);
        break;
      case "without_category":
        warn("category_none", `«${categoryResolution.label}» non si importa: la scheda nasce senza categoria`);
        break;
      case "none":
        warn("category_none", "Nessuna categoria nel file: si assegna dopo l'import");
        break;
      case "target":
        if (!categoryResolution.target.siteId) {
          /* Squadra senza sede configurata: si scrive la categoria, la sede resta da assegnare. */
          warnings.push({ code: "category_without_site", severity: "info", message: "La squadra non ha una sede: la sede resta da assegnare" });
        }
        break;
      default:
        break;
    }

    /* Duplicati: nel file (chi viene prima resta, chi viene dopo decide) e nel club. */
    const inFile: { row: number; strength: "strong" | "weak" }[] = [];
    const existingMatches: ImportRowDiagnostic["duplicateCandidates"]["existing"][number][] = [];
    const hasName = Boolean(normalized.firstName && normalized.lastName);
    if (hasName) {
      const idKey = identityKey(normalized);
      const pKey = personKey(normalized);
      const fiscal = normalized.fiscalCode;
      const strongInFile = new Set<number>();
      const yearKey = normalized.birthDate ? `${pKey}|${normalized.birthDate.slice(0, 4)}` : "";
      if (normalized.birthDate && seenIdentity.has(idKey)) strongInFile.add(seenIdentity.get(idKey)!);
      /* Con il solo anno da una delle due parti, stesso nome e stesso anno sono la stessa persona (revisione ostile A-M6). */
      if (yearKey && normalized.birthDateKind === "year_only" && seenNameYear.has(yearKey)) strongInFile.add(seenNameYear.get(yearKey)!);
      if (fiscal && seenFiscal.has(fiscal)) strongInFile.add(seenFiscal.get(fiscal)!);
      for (const row of strongInFile) inFile.push({ row, strength: "strong" });
      for (const row of seenPerson.get(pKey) || []) if (!strongInFile.has(row)) inFile.push({ row, strength: "weak" });

      const strongExisting = new Map<string, (typeof existing)[number]>();
      if (normalized.birthDate) for (const athlete of existingByIdentity.get(idKey) || []) strongExisting.set(athlete.id, athlete);
      if (yearKey && normalized.birthDateKind === "year_only") for (const athlete of existingByNameYear.get(yearKey) || []) strongExisting.set(athlete.id, athlete);
      if (fiscal) for (const athlete of existingByFiscal.get(fiscal) || []) strongExisting.set(athlete.id, athlete);
      const describe = (athlete: (typeof existing)[number], strength: "strong" | "weak") => ({
        athleteId: athlete.id,
        label: `${athlete.lastName} ${athlete.firstName}`.trim(),
        birthDate: athlete.birthDate,
        status: athlete.status,
        strength,
        hasMemberships: athlete.hasMemberships,
        categoryLabel: athlete.categoryLabel,
      });
      for (const athlete of strongExisting.values()) existingMatches.push(describe(athlete, "strong"));
      for (const athlete of existingByPerson.get(pKey) || []) if (!strongExisting.has(athlete.id)) existingMatches.push(describe(athlete, "weak"));

      if (!nonAncora(sourceRowNumber)) {
        if (normalized.birthDate && !seenIdentity.has(idKey)) seenIdentity.set(idKey, sourceRowNumber);
        if (yearKey && !seenNameYear.has(yearKey)) seenNameYear.set(yearKey, sourceRowNumber);
        seenPerson.set(pKey, [...(seenPerson.get(pKey) || []), sourceRowNumber]);
        if (fiscal && !seenFiscal.has(fiscal)) seenFiscal.set(fiscal, sourceRowNumber);
      }
    }

    const decision = duplicateDecisions[sourceRowNumber] || null;
    const strongInFileRows = inFile.filter((item) => item.strength === "strong").map((item) => item.row);
    const weakInFileRows = inFile.filter((item) => item.strength === "weak").map((item) => item.row);
    const strongExistingMatches = existingMatches.filter((item) => item.strength === "strong");
    const weakExistingMatches = existingMatches.filter((item) => item.strength === "weak");
    const needsDuplicateDecision = (strongInFileRows.length > 0 || strongExistingMatches.length > 0) && !decision;
    const soloCategoriaDaDecidere = errors.every((issue) => issue.code === "category_pending" || issue.code === "category_ambiguous" || issue.code === "category_unknown");
    if (needsDuplicateDecision && !excluded.has(sourceRowNumber) && categoryResolution.kind !== "excluded" && soloCategoriaDaDecidere) pendingDuplicateRows += 1;

    for (const row of strongInFileRows) {
      warn("duplicate_in_file", `Stessa persona della riga ${row} del file`, { relatedRow: row });
    }
    for (const row of weakInFileRows) {
      warn("possible_homonym_in_file", `Stesso nome della riga ${row} del file (data diversa o mancante)`, { relatedRow: row });
    }
    for (const match of strongExistingMatches) {
      warn("duplicate_existing", `Già nel club: ${match.label}${match.birthDate ? ` (${match.birthDate})` : ""}${match.status !== "active" ? " — inattivo" : ""}`, { relatedAthleteId: match.athleteId });
    }
    for (const match of weakExistingMatches) {
      warn("possible_homonym_existing", `Possibile omonimo nel club: ${match.label}${match.birthDate ? ` (${match.birthDate})` : ""}`, { relatedAthleteId: match.athleteId });
    }

    /* La decisione presa sul duplicato dice cosa succede alla riga. */
    let finalAction: ImportRowAction = "create";
    if (decision?.kind === "skip") finalAction = "skip";
    if (decision?.kind === "link") {
      const linked = existing.find((athlete) => athlete.id === decision.athleteId);
      if (!linked) {
        error("duplicate_existing", "La scheda da collegare non è più fra quelle del club");
      } else {
        finalAction = "link";
        if (linked.status !== "active") warn("existing_inactive", "La scheda collegata è inattiva e resta inattiva: riattivarla è una scelta a parte");
        if (linked.hasMemberships && categoryResolution.kind === "target") {
          warn("link_keeps_membership", `La scheda ha già una categoria${linked.categoryLabel ? ` (${linked.categoryLabel})` : ""}: si conserva, la categoria del file non si applica`);
        }
        warnings.push({ code: "link_fills_fields", severity: "info", message: "Si completano solo i campi vuoti della scheda" });
      }
    }

    const userExcluded = excluded.has(sourceRowNumber);
    const excludedByCategory = categoryResolution.kind === "excluded";
    if (userExcluded) warnings.push({ code: "excluded_by_user", severity: "info", message: "Esclusa dal club" });
    if (excludedByCategory) warnings.push({ code: "category_excluded", severity: "info", message: `Esclusa: la categoria «${normalized.categoryLabel}» non si importa` });

    let state: ImportRowState;
    if (userExcluded || excludedByCategory || decision?.kind === "skip") {
      state = "ignored_by_user";
      finalAction = "skip";
    } else if (errors.length) {
      state = "error";
      finalAction = "skip";
    } else if (needsDuplicateDecision) {
      state = "duplicate_candidate";
      finalAction = "skip";
    } else if (warnings.some((issue) => issue.severity === "warning")) {
      state = "warning";
    } else {
      state = "ready";
    }

    return {
      sourceRowNumber,
      raw: source.values,
      normalized,
      correctedFields,
      validation: { errors, warnings },
      duplicateCandidates: { inFile, existing: existingMatches, decision },
      categoryResolution,
      state,
      finalAction,
      issues: [...errors, ...warnings],
    };
  });

  const count = (state: ImportRowState) => rows.filter((row) => row.state === state).length;
  const importable = rows.filter((row) => row.state === "ready" || row.state === "warning");
  const totals: AthleteImportTotals = {
    candidates: rows.length,
    ready: count("ready"),
    warning: count("warning"),
    error: count("error"),
    duplicate: count("duplicate_candidate"),
    excluded: count("ignored_by_user"),
    toCreate: importable.filter((row) => row.finalAction === "create").length,
    toLink: importable.filter((row) => row.finalAction === "link").length,
    toSkip: rows.length - importable.length,
    withMembership: importable.filter((row) => row.categoryResolution.kind === "target" || row.categoryResolution.kind === "create").length,
    categoriesToCreate: new Set(
      importable.filter((row) => row.categoryResolution.kind === "create").map((row) => (row.categoryResolution as { key: string }).key),
    ).size,
    pendingCategories: categories.filter((category) => !category.resolved).length,
    pendingDuplicates: pendingDuplicateRows,
    awaitingDecision: rows.filter(
      (row) =>
        row.state === "error" &&
        row.validation.errors.every((issue) => issue.code === "category_pending" || issue.code === "category_ambiguous" || issue.code === "category_unknown"),
    ).length,
  };
  const totalsConsistent =
    totals.candidates === totals.ready + totals.warning + totals.error + totals.duplicate + totals.excluded;

  return { rows, categories, totals, totalsConsistent };
};

/* ── Il carico per il server ─────────────────────────────────────────────── */

export type AthleteImportRequestRow = {
  sourceRowNumber: number;
  action: "create" | "link";
  athleteId?: string;
  /** Il club ha visto il possibile duplicato e ha scelto «importa come nuovo»: il server non lo ferma. */
  allowDuplicate?: boolean;
  athlete: {
    firstName: string;
    lastName: string;
    birthDate: string;
    gender: string;
    fiscalCode: string;
    email: string;
    phone: string;
  };
  category: { kind: "target"; targetId: string } | { kind: "create"; key: string } | null;
};

export type AthleteImportRequestCategory = {
  key: string;
  name: string;
  siteId: string;
  birthYearFrom: number | null;
  birthYearTo: number | null;
};

export type AthleteImportRequest = {
  batchId: string;
  categoriesToCreate: AthleteImportRequestCategory[];
  rows: AthleteImportRequestRow[];
};

export const buildAthleteImportRequest = (plan: AthleteImportPlan, batchId: string): AthleteImportRequest => {
  const rows: AthleteImportRequestRow[] = plan.rows
    .filter((row) => (row.state === "ready" || row.state === "warning") && row.finalAction !== "skip")
    .map((row) => {
      const category =
        row.categoryResolution.kind === "target"
          ? ({ kind: "target", targetId: row.categoryResolution.target.id } as const)
          : row.categoryResolution.kind === "create"
            ? ({ kind: "create", key: row.categoryResolution.key } as const)
            : null;
      return {
        sourceRowNumber: row.sourceRowNumber,
        action: row.finalAction === "link" ? "link" : "create",
        ...(row.finalAction === "link" && row.duplicateCandidates.decision?.kind === "link"
          ? { athleteId: row.duplicateCandidates.decision.athleteId }
          : {}),
        ...(row.duplicateCandidates.decision?.kind === "new" ? { allowDuplicate: true } : {}),
        athlete: {
          firstName: row.normalized.firstName,
          lastName: row.normalized.lastName,
          birthDate: row.normalized.birthDate,
          gender: row.normalized.gender,
          fiscalCode: row.normalized.fiscalCode,
          email: row.normalized.email,
          phone: row.normalized.phone,
        },
        category,
      };
    });
  const usedKeys = new Set(rows.flatMap((row) => (row.category?.kind === "create" ? [row.category.key] : [])));
  const categoriesToCreate = plan.categories
    .filter((category) => category.decision?.kind === "create" && usedKeys.has(category.key))
    .map((category) => {
      const decision = category.decision as Extract<CategoryDecision, { kind: "create" }>;
      return {
        key: category.key,
        name: decision.name || category.label,
        siteId: decision.siteId || "",
        birthYearFrom: category.birthYearFrom,
        birthYearTo: category.birthYearTo,
      };
    });
  return { batchId, categoriesToCreate, rows };
};

/* ── Etichette ───────────────────────────────────────────────────────────── */

export const IMPORT_ROW_STATE_LABELS: Record<ImportRowState, string> = {
  ready: "Pronta",
  warning: "Da verificare",
  error: "Da correggere",
  duplicate_candidate: "Possibile duplicato",
  ignored_by_user: "Esclusa",
};

export const IMPORT_ACTION_LABELS: Record<ImportRowAction, string> = {
  create: "Crea",
  link: "Collega",
  skip: "Non importa",
};

/** La risoluzione della categoria a parole (rapporto, anteprima). */
export const describeCategoryResolution = (resolution: CategoryResolution, labelOf: (target: MembershipTarget) => string = (target) => target.label) => {
  switch (resolution.kind) {
    case "target":
      return labelOf(resolution.target);
    case "create":
      return `Nuova: ${resolution.name}`;
    case "without_category":
      return "Senza categoria (scelta)";
    case "excluded":
      return "Categoria esclusa";
    case "pending":
      return "Da decidere";
    default:
      return "Senza categoria";
  }
};

/** Riga per riga, in forma piatta: per il rapporto scaricabile e per i test. */
export const flattenImportPlan = (plan: AthleteImportPlan, labelOf?: (target: MembershipTarget) => string) =>
  plan.rows.map((row) => ({
    row: row.sourceRowNumber,
    lastName: row.normalized.lastName,
    firstName: row.normalized.firstName,
    birthDate: row.normalized.birthDate || row.normalized.rawBirth,
    category: row.normalized.categoryLabel,
    resolution: describeCategoryResolution(row.categoryResolution, labelOf),
    state: row.state,
    stateLabel: IMPORT_ROW_STATE_LABELS[row.state],
    action: row.finalAction,
    actionLabel: IMPORT_ACTION_LABELS[row.finalAction],
    issues: row.issues.map((issue) => issue.message).join(" · "),
  }));
