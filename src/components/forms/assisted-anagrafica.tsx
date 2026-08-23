"use client";

import { useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  ITALIAN_PROVINCES,
  checkCodiceFiscale,
  computeCodiceFiscale,
  extractBelfioreCode,
  findProvince,
  isValidBelfioreCode,
  suggestAddressCompletion,
  validateAddressFields,
  type AddressFields,
  type AddressSuggestion,
} from "@/lib/italian-registry";
import { CircleCheck, TriangleAlert, Wand2 } from "lucide-react";

/**
 * Campi anagrafici assistiti.
 *
 * Il principio e uno solo: **suggerire, non decidere**. L'assistenza riempie
 * cio che manca e segnala cio che non torna, ma non riscrive mai un valore che
 * qualcuno ha digitato — nemmeno quando la tabella dice il contrario. In una
 * segreteria sportiva il dato inserito a mano viene quasi sempre da un
 * documento in mano all'operatore.
 */

const issueFor = (issues: { field: string; message: string }[], field: string) =>
  issues.find((issue) => issue.field === field)?.message || "";

function FieldError({ message }: { message: string }) {
  if (!message) return null;
  return (
    <p className="flex items-start gap-1.5 text-xs text-red-700" role="alert">
      <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
      {message}
    </p>
  );
}

export type AssistedAddressValue = AddressFields;
export type AssistedAddressPatch = AddressSuggestion;

export function AssistedAddressFields({
  idPrefix,
  values,
  onChange,
  showRegion = true,
  showCountry = true,
  className,
}: {
  idPrefix: string;
  values: AssistedAddressValue;
  onChange: (patch: AssistedAddressPatch) => void;
  showRegion?: boolean;
  showCountry?: boolean;
  className?: string;
}) {
  const issues = useMemo(() => validateAddressFields(values), [values]);

  /**
   * Alla scelta della provincia la regione si compila da sola solo se e
   * vuota, oppure se corrispondeva alla provincia precedente: in quel caso
   * non e un dato dell'utente, e il residuo della scelta precedente.
   */
  const handleProvinceChange = (nextProvinceCode: string) => {
    const patch: AssistedAddressPatch = { province: nextProvinceCode };
    const nextProvince = findProvince(nextProvinceCode);
    const previousProvince = findProvince(values.province);
    const currentRegion = String(values.region || "").trim();

    if (
      nextProvince &&
      (!currentRegion || currentRegion === previousProvince?.region)
    ) {
      patch.region = nextProvince.region;
    }

    onChange(patch);
  };

  const completion = useMemo(
    () => suggestAddressCompletion(values),
    [values],
  );
  const hasCompletion = Object.keys(completion).length > 0;

  return (
    <div className={cn("space-y-4", className)}>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-postal-code`}>CAP</Label>
          <Input
            id={`${idPrefix}-postal-code`}
            inputMode="numeric"
            maxLength={5}
            className="eg-tabular"
            value={values.postalCode || ""}
            onChange={(event) =>
              onChange({
                postalCode: event.target.value.replace(/[^0-9]/g, "").slice(0, 5),
              })
            }
            placeholder="20121"
            aria-invalid={Boolean(issueFor(issues, "postalCode"))}
          />
          <FieldError message={issueFor(issues, "postalCode")} />
        </div>

        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-city`}>Comune</Label>
          <Input
            id={`${idPrefix}-city`}
            value={values.city || ""}
            onChange={(event) => onChange({ city: event.target.value })}
            aria-invalid={Boolean(issueFor(issues, "city"))}
          />
          <FieldError message={issueFor(issues, "city")} />
        </div>

        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-province`}>Provincia</Label>
          <select
            id={`${idPrefix}-province`}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={findProvince(values.province)?.code || ""}
            onChange={(event) => handleProvinceChange(event.target.value)}
          >
            <option value="">Seleziona provincia</option>
            {ITALIAN_PROVINCES.map((province) => (
              <option key={province.code} value={province.code}>
                {province.code} — {province.name}
              </option>
            ))}
          </select>
          <FieldError message={issueFor(issues, "province")} />
          {values.province && !findProvince(values.province) ? (
            <p className="text-xs text-slate-500">
              Valore attuale: {values.province}
            </p>
          ) : null}
        </div>

        {showRegion ? (
          <div className="space-y-2">
            <Label htmlFor={`${idPrefix}-region`}>Regione</Label>
            <Input
              id={`${idPrefix}-region`}
              value={values.region || ""}
              onChange={(event) => onChange({ region: event.target.value })}
              aria-invalid={Boolean(issueFor(issues, "region"))}
            />
            <FieldError message={issueFor(issues, "region")} />
          </div>
        ) : null}

        {showCountry ? (
          <div className="space-y-2">
            <Label htmlFor={`${idPrefix}-country`}>Paese</Label>
            <Input
              id={`${idPrefix}-country`}
              value={values.country || ""}
              onChange={(event) => onChange({ country: event.target.value })}
              placeholder="Italia"
            />
          </div>
        ) : null}
      </div>

      {hasCompletion ? (
        <button
          type="button"
          onClick={() => onChange(completion)}
          className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
        >
          <Wand2 className="h-3.5 w-3.5" aria-hidden />
          Completa i campi mancanti
          {completion.region ? ` (regione ${completion.region})` : ""}
        </button>
      ) : null}
    </div>
  );
}

export type FiscalCodePerson = {
  firstName?: string | null;
  lastName?: string | null;
  birthDate?: string | null;
  gender?: string | null;
};

/**
 * Codice fiscale con calcolo assistito.
 *
 * Il calcolo richiede il codice catastale del comune di nascita: EasyGame non
 * ha la tabella dei comuni e non la inventa (vedi `lib/italian-registry.ts`).
 * Quando l'anagrafica ha gia un codice fiscale valido il codice catastale si
 * legge da li; altrimenti lo inserisce l'operatore una volta sola.
 */
export function AssistedFiscalCodeField({
  id,
  label = "Codice fiscale",
  value,
  onChange,
  person,
  belfioreCode,
  onBelfioreCodeChange,
  enableCompute = true,
  className,
}: {
  id: string;
  label?: string;
  value: string;
  onChange: (value: string) => void;
  person: FiscalCodePerson;
  belfioreCode?: string;
  onBelfioreCodeChange?: (value: string) => void;
  /**
   * Falso dove l'anagrafica non raccoglie data di nascita e sesso — per
   * esempio il legale rappresentante del club: li il codice si puo solo
   * verificare, non calcolare, e proporre il calcolo sarebbe una promessa
   * che il form non puo mantenere.
   */
  enableCompute?: boolean;
  className?: string;
}) {
  const effectiveBelfiore =
    String(belfioreCode || "").trim().toUpperCase() ||
    extractBelfioreCode(value);

  const computed = useMemo(
    () => computeCodiceFiscale({ ...person, belfioreCode: effectiveBelfiore }),
    [person, effectiveBelfiore],
  );

  const check = useMemo(
    () => checkCodiceFiscale(value, { ...person, belfioreCode: effectiveBelfiore }),
    [value, person, effectiveBelfiore],
  );

  const trimmed = String(value || "").trim();
  // Il pulsante non compare quando c'e gia un valore: cosi non esiste nemmeno
  // il gesto che potrebbe sovrascriverlo.
  const canFill = enableCompute && !trimmed && computed.ok;

  return (
    <div className={cn("space-y-2", className)}>
      <Label htmlFor={id}>{label}</Label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          id={id}
          value={value}
          onChange={(event) => onChange(event.target.value.toUpperCase())}
          maxLength={16}
          autoCapitalize="characters"
          className="eg-tabular uppercase"
          aria-invalid={check.status === "malformed" || check.status === "mismatch"}
        />
        {canFill ? (
          <Button
            type="button"
            variant="outline"
            className="shrink-0"
            onClick={() => onChange(computed.value)}
          >
            <Wand2 className="mr-2 h-4 w-4" aria-hidden />
            Calcola
          </Button>
        ) : null}
      </div>

      {check.status === "valid" ? (
        <p className="flex items-center gap-1.5 text-xs text-emerald-700">
          <CircleCheck className="h-3.5 w-3.5" aria-hidden />
          {check.message}
        </p>
      ) : null}
      {check.status === "malformed" || check.status === "mismatch" ? (
        <FieldError message={check.message} />
      ) : null}

      {enableCompute && !trimmed && !computed.ok ? (
        <p className="text-xs text-slate-500">
          Per calcolarlo servono ancora: {computed.missing.join(", ")}.
        </p>
      ) : null}

      {onBelfioreCodeChange ? (
        <div className="space-y-1.5 pt-1">
          <Label
            htmlFor={`${id}-belfiore`}
            className="text-xs font-normal text-slate-500"
          >
            Codice catastale del comune di nascita (es. H501)
          </Label>
          <Input
            id={`${id}-belfiore`}
            value={belfioreCode || ""}
            onChange={(event) =>
              onBelfioreCodeChange(
                event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4),
              )
            }
            maxLength={4}
            className="eg-tabular w-32 uppercase"
            placeholder={extractBelfioreCode(value) || "H501"}
          />
          {belfioreCode && !isValidBelfioreCode(belfioreCode) ? (
            <FieldError message="Il codice catastale e una lettera seguita da tre cifre" />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
