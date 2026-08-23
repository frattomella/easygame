import {
  findProvince,
  isValidPostalCode,
  isWellFormedCodiceFiscale,
} from "../italian-registry";

/**
 * Validazione anagrafica lato server.
 *
 * Il client valida per aiutare chi compila; il server valida perche le API
 * sono raggiungibili anche senza passare dal client. Le regole sono le stesse
 * — vengono dallo stesso modulo puro `lib/italian-registry.ts` — cosi non
 * possono divergere.
 *
 * **Un solo compromesso, deliberato:** su un aggiornamento un campo che non
 * cambia non viene ri-validato. Altrimenti l'introduzione di questa regola
 * renderebbe non modificabile ogni anagrafica gia in archivio con un CAP o un
 * codice fiscale sbagliato — bloccando la correzione di tutto il resto della
 * scheda proprio a chi ha piu bisogno di correggerla.
 */

export class AnagraficaValidationError extends Error {
  readonly field: string;

  constructor(field: string, message: string) {
    super(message);
    this.field = field;
    this.name = "AnagraficaValidationError";
  }
}

const asText = (value: unknown) =>
  value === null || value === undefined ? "" : String(value).trim();

const isItalianCountry = (value: unknown) => {
  const normalized = asText(value).toLowerCase();
  return !normalized || normalized === "italia" || normalized === "italy";
};

type Check = {
  field: string;
  label: string;
  value: unknown;
  previous: unknown;
  kind: "postalCode" | "province" | "personalFiscalCode" | "entityFiscalCode";
};

const runCheck = (check: Check) => {
  const value = asText(check.value);
  if (!value) return;
  // Dato invariato: se era gia in archivio, non e questa scrittura a
  // introdurlo e bloccarla impedirebbe di correggere il resto della scheda.
  if (value === asText(check.previous)) return;

  if (check.kind === "postalCode" && !isValidPostalCode(value)) {
    throw new AnagraficaValidationError(
      check.field,
      `${check.label}: il CAP deve essere di cinque cifre`,
    );
  }

  if (check.kind === "province" && !findProvince(value)) {
    throw new AnagraficaValidationError(
      check.field,
      `${check.label}: provincia non riconosciuta, usa la sigla (per esempio MI)`,
    );
  }

  if (check.kind === "personalFiscalCode" && !isWellFormedCodiceFiscale(value)) {
    throw new AnagraficaValidationError(
      check.field,
      `${check.label}: codice fiscale non valido`,
    );
  }

  if (check.kind === "entityFiscalCode") {
    // Una ASD ha quasi sempre un codice fiscale numerico di 11 cifre; le
    // societa con persona fisica di riferimento usano il codice a 16.
    const numeric = /^\d{11}$/.test(value);
    if (!numeric && !isWellFormedCodiceFiscale(value)) {
      throw new AnagraficaValidationError(
        check.field,
        `${check.label}: deve essere di 11 cifre oppure un codice fiscale di 16 caratteri`,
      );
    }
  }
};

const asRecord = (value: unknown): Record<string, any> =>
  typeof value === "object" && value ? (value as Record<string, any>) : {};

const validateClubAnagrafica = (
  input: Record<string, any>,
  existing: Record<string, any> | null,
) => {
  const previous = existing || {};
  const checks: Check[] = [];

  if (isItalianCountry(input.country ?? previous.country)) {
    checks.push(
      {
        field: "postal_code",
        label: "Sede operativa",
        value: input.postal_code,
        previous: previous.postal_code,
        kind: "postalCode",
      },
      {
        field: "province",
        label: "Sede operativa",
        value: input.province,
        previous: previous.province,
        kind: "province",
      },
    );
  }

  if (isItalianCountry(input.legal_country ?? previous.legal_country)) {
    checks.push(
      {
        field: "legal_postal_code",
        label: "Sede legale",
        value: input.legal_postal_code,
        previous: previous.legal_postal_code,
        kind: "postalCode",
      },
      {
        field: "legal_province",
        label: "Sede legale",
        value: input.legal_province,
        previous: previous.legal_province,
        kind: "province",
      },
    );
  }

  checks.push(
    {
      field: "fiscal_code",
      label: "Codice fiscale del club",
      value: input.fiscal_code,
      previous: previous.fiscal_code,
      kind: "entityFiscalCode",
    },
    {
      field: "representative_fiscal_code",
      label: "Legale rappresentante",
      value: input.representative_fiscal_code,
      previous: previous.representative_fiscal_code,
      kind: "personalFiscalCode",
    },
  );

  checks.forEach(runCheck);
};

const validateAthleteAnagrafica = (
  input: Record<string, any>,
  existing: Record<string, any> | null,
) => {
  const data = asRecord(input.data);
  if (!Object.keys(data).length) return;

  const previousData = asRecord(existing?.data);

  if (isItalianCountry(data.country ?? previousData.country)) {
    runCheck({
      field: "postalCode",
      label: "Residenza",
      value: data.postalCode,
      previous: previousData.postalCode,
      kind: "postalCode",
    });
    runCheck({
      field: "province",
      label: "Residenza",
      value: data.province,
      previous: previousData.province,
      kind: "province",
    });
  }

  runCheck({
    field: "fiscalCode",
    label: "Atleta",
    value: data.fiscalCode,
    previous: previousData.fiscalCode,
    kind: "personalFiscalCode",
  });
};

/**
 * Punto di ingresso unico: chiamato da `resources.ts` su creazione e
 * aggiornamento. Su creazione `existing` e `null` e tutto viene validato.
 */
export const assertAnagraficaIsValid = (
  resource: string,
  input: Record<string, any>,
  existing: Record<string, any> | null = null,
) => {
  if (resource === "clubs" || resource === "organizations") {
    validateClubAnagrafica(input, existing);
    return;
  }

  if (resource === "athletes" || resource === "simplified_athletes") {
    validateAthleteAnagrafica(input, existing);
  }
};
