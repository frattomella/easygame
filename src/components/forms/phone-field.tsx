"use client";

import { useId, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  DEFAULT_PHONE_COUNTRY,
  PHONE_COUNTRIES,
  findPhoneCountry,
  formatPhoneNumber,
  isPlausiblePhoneNumber,
  parsePhoneNumber,
  sanitizeNationalNumber,
} from "@/lib/phone-numbers";

/**
 * Campo telefono condiviso: prefisso a tendina, numero a parte.
 *
 * Va usato **solo dove c'e davvero un numero di telefono**. Non su una partita
 * IVA, non su un numero di tessera, non su un IBAN: sono campi numerici, non
 * telefonici, e un selettore di prefisso li peggiora.
 *
 * Il valore che esce e sempre `+<prefisso> <numero>`. Un numero gia in
 * archivio che non dichiara un prefisso **non viene riscritto** finche
 * qualcuno non lo modifica: la tendina mostra l'Italia come ipotesi, ma
 * l'ipotesi non tocca il dato (vedi `src/lib/phone-numbers.ts`).
 */

export type PhoneFieldProps = {
  id?: string;
  label?: string | null;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  /** Mostra un avviso quando il numero non e plausibile. */
  showValidation?: boolean;
};

export function PhoneField({
  id,
  label = "Telefono",
  value,
  onChange,
  placeholder = "333 1234567",
  required = false,
  disabled = false,
  className,
  showValidation = true,
}: PhoneFieldProps) {
  const generatedId = useId();
  const fieldId = id || `phone-${generatedId}`;

  const parsed = useMemo(() => parsePhoneNumber(value), [value]);

  const selectedCountry =
    findPhoneCountry(parsed.countryCode) ||
    findPhoneCountry(DEFAULT_PHONE_COUNTRY);

  const handleCountryChange = (countryCode: string) => {
    const country = findPhoneCountry(countryCode);
    if (!country) return;

    // Cambiare il prefisso e una modifica esplicita: qui il valore si riscrive
    // anche se prima non ne dichiarava uno.
    onChange(formatPhoneNumber(country.dial, parsed.national));
  };

  const handleNumberChange = (next: string) => {
    const digits = sanitizeNationalNumber(next);

    if (!digits) {
      onChange("");
      return;
    }

    const dial = parsed.dial || selectedCountry?.dial || "";
    onChange(formatPhoneNumber(dial, digits));
  };

  const invalid =
    showValidation && Boolean(parsed.national) && !isPlausiblePhoneNumber(value);

  return (
    <div className={cn("space-y-2", className)}>
      {label ? (
        <Label htmlFor={fieldId}>
          {label}
          {required ? " *" : ""}
        </Label>
      ) : null}

      {/*
        `flex-wrap` non e un dettaglio: a 375 px, dentro una griglia a due
        colonne, la tendina del prefisso occupa 136 px dei 160 disponibili e
        al numero non resta niente. Andando a capo il campo resta usabile
        invece di comprimersi fino a sparire.
      */}
      <div className="flex flex-wrap gap-2">
        <select
          aria-label="Prefisso internazionale"
          className="h-10 w-[8.5rem] shrink-0 rounded-md border border-input bg-background px-2 text-sm"
          value={selectedCountry?.code || DEFAULT_PHONE_COUNTRY}
          disabled={disabled}
          onChange={(event) => handleCountryChange(event.target.value)}
        >
          {PHONE_COUNTRIES.map((country) => (
            <option key={country.code} value={country.code}>
              {country.flag} +{country.dial}
            </option>
          ))}
        </select>

        <Input
          id={fieldId}
          type="tel"
          inputMode="tel"
          autoComplete="tel-national"
          className="eg-tabular min-w-[8rem] flex-1"
          value={parsed.national}
          placeholder={placeholder}
          required={required}
          disabled={disabled}
          aria-invalid={invalid}
          onChange={(event) => handleNumberChange(event.target.value)}
        />
      </div>

      {invalid ? (
        <p className="text-xs text-red-700" role="alert">
          Numero non plausibile: controlla le cifre.
        </p>
      ) : null}

      {parsed.national && !parsed.dial ? (
        <p className="text-xs text-slate-500">
          Numero senza prefisso internazionale: scegline uno per completarlo.
        </p>
      ) : null}
    </div>
  );
}
