/**
 * Il **profilo fiscale di un'organizzazione**: normalizzazione e validazione.
 *
 * **Perche e separato dall'anagrafica.** L'anagrafica del club risponde a
 * «come si chiama e dove lo trovo»; il profilo fiscale risponde a «che
 * soggetto e davanti al fisco». Sono due domande che cambiano in momenti
 * diversi — si cambia sede senza cambiare forma giuridica, e si cambia regime
 * senza traslocare — e tenerle nello stesso pugno di colonne significava
 * riaprire il modulo dei contatti per correggere un codice destinatario.
 *
 * **Cosa valida, e cosa non pretende.** Valida la **forma**: un codice fiscale
 * ha una lunghezza, una partita IVA ha undici cifre e una cifra di controllo,
 * un codice destinatario ne ha sette. Non pretende che tutto sia compilato: una
 * ASD senza partita IVA e un soggetto perfettamente legittimo, e un profilo che
 * la esigesse renderebbe il modulo incompilabile per la maggioranza dei
 * clienti. Cio che manca lo dice `missingForInvoicing`, quando e il momento di
 * emettere una fattura — non quando si salva il profilo.
 *
 * Modulo **puro**. Vedi ADR-0052.
 */

import {
  getLegalFormDefinition,
  isLegalForm,
  isSpecialRegime,
  isTaxRegimeCode,
  type LegalForm,
  type SpecialRegime,
} from "./legal-forms";

const asText = (value: unknown) => String(value ?? "").trim();
const asUpper = (value: unknown) => asText(value).toUpperCase();

const asRecord = (value: unknown): Record<string, any> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, any>)
    : {};

/* ------------------------------------------------------- il bollo */

export type StampDutySettings = {
  /** Se il club applica il bollo sui documenti che superano la soglia. */
  enabled: boolean;
  /** La soglia in centesimi. Configurazione, non una costante di legge cablata. */
  thresholdCents: number;
  /** L'importo del bollo in centesimi. */
  amountCents: number;
  /** Chi lo sostiene: il club oppure chi riceve il documento. */
  chargedTo: "issuer" | "recipient";
};

/**
 * Il bollo predefinito.
 *
 * **Perche spento.** I valori qui sotto sono quelli correnti dell'imposta di
 * bollo, ma *applicarla* e una decisione del soggetto e del suo regime, non
 * una conseguenza di aver installato un gestionale. Accendere il bollo per
 * impostazione predefinita avrebbe aggiunto due euro a documenti che non lo
 * prevedono, e nessuno se ne sarebbe accorto finche non fosse arrivato un
 * commercialista.
 */
export const DEFAULT_STAMP_DUTY: StampDutySettings = {
  enabled: false,
  thresholdCents: 7745,
  amountCents: 200,
  chargedTo: "issuer",
};

export const normalizeStampDuty = (value: unknown): StampDutySettings => {
  const record = asRecord(value);
  const threshold = Number(record.thresholdCents ?? record.threshold_cents);
  const amount = Number(record.amountCents ?? record.amount_cents);

  return {
    enabled: Boolean(record.enabled),
    thresholdCents: Number.isFinite(threshold)
      ? Math.max(0, Math.round(threshold))
      : DEFAULT_STAMP_DUTY.thresholdCents,
    amountCents: Number.isFinite(amount)
      ? Math.max(0, Math.round(amount))
      : DEFAULT_STAMP_DUTY.amountCents,
    chargedTo:
      (record.chargedTo ?? record.charged_to) === "recipient"
        ? "recipient"
        : "issuer",
  };
};

/* -------------------------------------------------------- il profilo */

export type FiscalProfile = {
  legalName: string;
  legalForm: LegalForm;
  fiscalCode: string;
  vatNumber: string;
  taxRegimeCode: string;
  specialRegimes: SpecialRegime[];
  address: string;
  city: string;
  province: string;
  postalCode: string;
  country: string;
  cityCode: string;
  pec: string;
  recipientCode: string;
  reaOffice: string;
  reaNumber: string;
  reaCapital: number | null;
  reaSoleShareholder: boolean | null;
  reaInLiquidation: boolean | null;
  stampDuty: StampDutySettings;
  settings: Record<string, any>;
  completedAt: string | null;
};

export const createEmptyFiscalProfile = (): FiscalProfile => ({
  legalName: "",
  legalForm: "altro",
  fiscalCode: "",
  vatNumber: "",
  taxRegimeCode: "",
  specialRegimes: [],
  address: "",
  city: "",
  province: "",
  postalCode: "",
  country: "IT",
  cityCode: "",
  pec: "",
  recipientCode: "",
  reaOffice: "",
  reaNumber: "",
  reaCapital: null,
  reaSoleShareholder: null,
  reaInLiquidation: null,
  stampDuty: { ...DEFAULT_STAMP_DUTY },
  settings: {},
  completedAt: null,
});

const firstText = (...values: unknown[]) => {
  for (const value of values) {
    const text = asText(value);
    if (text) return text;
  }
  return "";
};

const toNullableBoolean = (value: unknown) =>
  value === true || value === false ? value : null;

export const normalizeFiscalProfile = (value: unknown): FiscalProfile => {
  const record = asRecord(value);
  const empty = createEmptyFiscalProfile();
  const capital = Number(record.reaCapital ?? record.rea_capital);

  return {
    legalName: firstText(record.legalName, record.legal_name),
    legalForm: isLegalForm(record.legalForm ?? record.legal_form)
      ? ((record.legalForm ?? record.legal_form) as LegalForm)
      : empty.legalForm,
    /*
      Codice fiscale e partita IVA si conservano in maiuscolo e senza spazi: la
      stessa societa scritta in tre modi diversi in tre schermate diventa tre
      soggetti quando qualcuno prova a riconciliare.
    */
    fiscalCode: asUpper(
      firstText(record.fiscalCode, record.fiscal_code).replace(/\s+/g, ""),
    ),
    vatNumber: asUpper(
      firstText(record.vatNumber, record.vat_number).replace(/[\s.]+/g, ""),
    ),
    taxRegimeCode: asUpper(firstText(record.taxRegimeCode, record.tax_regime_code)),
    specialRegimes: Array.from(
      new Set(
        (Array.isArray(record.specialRegimes)
          ? record.specialRegimes
          : Array.isArray(record.special_regimes)
            ? record.special_regimes
            : []
        )
          .map((entry: unknown) => asText(entry))
          .filter(isSpecialRegime),
      ),
    ) as SpecialRegime[],
    address: firstText(record.address),
    city: firstText(record.city),
    province: asUpper(firstText(record.province)).slice(0, 2),
    postalCode: firstText(record.postalCode, record.postal_code),
    country: asUpper(firstText(record.country) || empty.country).slice(0, 2),
    cityCode: asUpper(firstText(record.cityCode, record.city_code)),
    pec: firstText(record.pec).toLowerCase(),
    recipientCode: asUpper(firstText(record.recipientCode, record.recipient_code)),
    reaOffice: asUpper(firstText(record.reaOffice, record.rea_office)).slice(0, 2),
    reaNumber: firstText(record.reaNumber, record.rea_number),
    reaCapital: Number.isFinite(capital) ? Math.max(0, capital) : null,
    reaSoleShareholder: toNullableBoolean(
      record.reaSoleShareholder ?? record.rea_sole_shareholder,
    ),
    reaInLiquidation: toNullableBoolean(
      record.reaInLiquidation ?? record.rea_in_liquidation,
    ),
    stampDuty: normalizeStampDuty(record.stampDuty ?? record.stamp_duty),
    settings: asRecord(record.settings),
    completedAt: firstText(record.completedAt, record.completed_at) || null,
  };
};

/* ------------------------------------------------------- validazione */

const FISCAL_CODE_PATTERN = /^[A-Z0-9]{11,16}$/;
const VAT_PATTERN = /^\d{11}$/;
/** Sette caratteri, oppure `0000000` quando si usa la PEC. */
const RECIPIENT_CODE_PATTERN = /^[A-Z0-9]{6,7}$/;
const POSTAL_CODE_PATTERN = /^\d{5}$/;
const PROVINCE_PATTERN = /^[A-Z]{2}$/;

/**
 * La cifra di controllo di una partita IVA italiana.
 *
 * **Perche vale la pena.** Una partita IVA sbagliata di una cifra e la causa
 * piu comune di scarto di una fattura elettronica, e lo si scopre giorni dopo
 * dallo SdI. Undici cifre le conta chiunque; la cifra di controllo dice se
 * quelle undici cifre possono essere una partita IVA.
 */
export const isValidItalianVatNumber = (value: unknown) => {
  const digits = asText(value).replace(/[\s.]+/g, "");
  if (!VAT_PATTERN.test(digits)) return false;

  let sum = 0;
  for (let index = 0; index < 10; index += 1) {
    const digit = Number(digits[index]);
    if (index % 2 === 0) {
      sum += digit;
      continue;
    }

    const doubled = digit * 2;
    sum += doubled > 9 ? doubled - 9 : doubled;
  }

  const check = (10 - (sum % 10)) % 10;
  return check === Number(digits[10]);
};

export type FiscalProfileIssue = { path: string; message: string };

/**
 * Cosa e formalmente sbagliato in un profilo.
 *
 * **Un profilo incompleto non e sbagliato.** Qui finisce solo cio che e
 * scritto male: una partita IVA di dieci cifre, un CAP di quattro, una
 * provincia di tre lettere. Cio che manca e un'altra domanda, e ha un'altra
 * funzione (`missingForInvoicing`): un club che emette solo ricevute non deve
 * essere costretto a inventarsi un regime fiscale per salvare il proprio
 * indirizzo.
 */
export const validateFiscalProfile = (
  profile: FiscalProfile,
): FiscalProfileIssue[] => {
  const issues: FiscalProfileIssue[] = [];

  if (profile.fiscalCode && !FISCAL_CODE_PATTERN.test(profile.fiscalCode)) {
    issues.push({
      path: "fiscalCode",
      message:
        "Il codice fiscale deve avere 11 cifre (soggetti) o 16 caratteri (persone fisiche).",
    });
  }

  if (profile.vatNumber && !isValidItalianVatNumber(profile.vatNumber)) {
    issues.push({
      path: "vatNumber",
      message: "La partita IVA non e valida: controlla le undici cifre.",
    });
  }

  if (profile.taxRegimeCode && !isTaxRegimeCode(profile.taxRegimeCode)) {
    issues.push({
      path: "taxRegimeCode",
      message: "Codice regime fiscale non riconosciuto.",
    });
  }

  if (profile.postalCode && !POSTAL_CODE_PATTERN.test(profile.postalCode)) {
    issues.push({ path: "postalCode", message: "Il CAP deve avere cinque cifre." });
  }

  if (profile.province && !PROVINCE_PATTERN.test(profile.province)) {
    issues.push({
      path: "province",
      message: "La provincia si scrive con due lettere.",
    });
  }

  if (
    profile.recipientCode &&
    !RECIPIENT_CODE_PATTERN.test(profile.recipientCode)
  ) {
    issues.push({
      path: "recipientCode",
      message: "Il codice destinatario ha sette caratteri.",
    });
  }

  if (profile.pec && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profile.pec)) {
    issues.push({ path: "pec", message: "La PEC non e un indirizzo valido." });
  }

  const definition = getLegalFormDefinition(profile.legalForm);
  if (definition.requiresRea && profile.reaNumber && !profile.reaOffice) {
    issues.push({
      path: "reaOffice",
      message: "Con il numero REA serve anche la sigla della provincia dell'ufficio.",
    });
  }

  return issues;
};

/**
 * Cosa manca a questo profilo per poter **emettere una fattura**.
 *
 * Si chiede al momento dell'emissione, non del salvataggio: e li che
 * l'informazione serve davvero, ed e li che chi la legge sta cercando di fare
 * quella cosa specifica.
 */
export const missingForInvoicing = (profile: FiscalProfile): string[] => {
  const missing: string[] = [];

  if (!profile.legalName) missing.push("ragione sociale");
  if (!profile.vatNumber && !profile.fiscalCode) {
    missing.push("partita IVA o codice fiscale");
  }
  if (!profile.address) missing.push("indirizzo");
  if (!profile.city) missing.push("comune");
  if (!profile.postalCode) missing.push("CAP");
  if (!profile.province) missing.push("provincia");

  return missing;
};

/**
 * Cosa manca per **preparare** una fattura elettronica.
 *
 * E un insieme piu grande del precedente: il tracciato FatturaPA chiede il
 * regime fiscale e, quando il soggetto e iscritto al Registro Imprese, i dati
 * REA. Prepararlo senza vorrebbe dire produrre un file che verrebbe scartato.
 */
export const missingForEInvoicing = (profile: FiscalProfile): string[] => {
  const missing = missingForInvoicing(profile);

  if (!profile.vatNumber) missing.push("partita IVA");
  if (!profile.taxRegimeCode) missing.push("regime fiscale");

  const definition = getLegalFormDefinition(profile.legalForm);
  if (definition.requiresRea) {
    if (!profile.reaOffice) missing.push("ufficio REA");
    if (!profile.reaNumber) missing.push("numero REA");
  }

  return Array.from(new Set(missing));
};
