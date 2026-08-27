"use client";

import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { normalizeGenderLetter } from "@/lib/italian-registry";
import {
  PERSON_IDENTITY_LABELS,
  toDateInputValue,
  type PersonIdentityPatch,
  type PersonIdentityValue,
} from "@/lib/person-identity";
import { CapitalizedInput } from "./capitalized-input";
import {
  AssistedFiscalCodeField,
  BirthPlaceField,
} from "./assisted-anagrafica";

/**
 * Il blocco di identita di una persona fisica: sei campi, un ordine solo.
 *
 * ## Perche esiste (RC Fix 2, punto 1)
 *
 * Nove anagrafiche chiedevano gli stessi sei dati, ognuna con la propria copia
 * del markup e il proprio ordine. Sistemare l'ordine pagina per pagina avrebbe
 * prodotto nove copie **allineate oggi** e divergenti alla prima modifica: e
 * gia successo con il telefono, con la capitalizzazione e con il codice
 * fiscale, tre volte di fila.
 *
 * Qui l'ordine e uno, dichiarato in `src/lib/person-identity.ts`, e nessuna
 * pagina puo cambiarlo: non c'e un modo di montare questo componente che
 * produca una sequenza diversa.
 *
 * ## Cosa il componente garantisce
 *
 * - **il codice fiscale sta in fondo**, sempre, anche quando non e ancora
 *   calcolabile. Il pulsante «Calcola» compare quando ci sono i dati; il
 *   campo, no: sta dov'e e basta. Un campo che si sposta a seconda di cosa e
 *   stato compilato e un campo che la volta dopo non si trova;
 * - **il luogo di nascita e un campo vero**, al quarto posto, non una casella
 *   nascosta dentro il codice fiscale. E da li che arriva il codice catastale,
 *   quindi e il campo che rende possibile il calcolo: tenerlo dopo il
 *   risultato del calcolo era l'ordine sbagliato;
 * - **nome e cognome si capitalizzano da soli** all'uscita dal campo, con la
 *   regola condivisa (`src/lib/text-capitalization.ts`);
 * - **il sesso e una scelta fra due lettere**, non testo libero. Il calcolo del
 *   codice fiscale ne ha bisogno, e «M», «maschio» e «Maschile» sono tre modi
 *   di rendere impossibile il calcolo.
 *
 * ## Cosa il componente **non** fa
 *
 * Non decide gli altri campi dell'anagrafica. Nazionalita, email, residenza,
 * ruolo, categoria vengono dopo e restano affare della singola scheda: questo
 * blocco e l'unico pezzo davvero uguale in tutte e nove.
 */
export function PersonIdentityFields({
  idPrefix,
  values,
  onChange,
  required,
  disabled = false,
  /**
   * Falso dove l'anagrafica non e di una persona fisica completa: li il codice
   * si puo verificare ma non calcolare.
   */
  enableFiscalCodeCompute = true,
  className,
}: {
  idPrefix: string;
  values: PersonIdentityValue;
  onChange: (patch: PersonIdentityPatch) => void;
  /** Quali dei sei campi la scheda considera obbligatori. */
  required?: Partial<Record<keyof PersonIdentityValue, boolean>>;
  disabled?: boolean;
  enableFiscalCodeCompute?: boolean;
  className?: string;
}) {
  const mark = (field: keyof PersonIdentityValue) =>
    required?.[field] ? " *" : "";

  const text = (field: keyof PersonIdentityValue) =>
    String(values[field] ?? "");

  return (
    <div className={cn("space-y-4", className)}>
      {/* 1 — Nome · 2 — Cognome */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-first-name`}>
            {PERSON_IDENTITY_LABELS.firstName}
            {mark("firstName")}
          </Label>
          <CapitalizedInput
            id={`${idPrefix}-first-name`}
            name="firstName"
            value={text("firstName")}
            disabled={disabled}
            required={Boolean(required?.firstName)}
            onChange={(event) => onChange({ firstName: event.target.value })}
            onValueChange={(firstName) => onChange({ firstName })}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-last-name`}>
            {PERSON_IDENTITY_LABELS.lastName}
            {mark("lastName")}
          </Label>
          <CapitalizedInput
            id={`${idPrefix}-last-name`}
            name="lastName"
            value={text("lastName")}
            disabled={disabled}
            required={Boolean(required?.lastName)}
            onChange={(event) => onChange({ lastName: event.target.value })}
            onValueChange={(lastName) => onChange({ lastName })}
          />
        </div>
      </div>

      {/* 3 — Data di nascita · 4 — Luogo di nascita */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-birth-date`}>
            {PERSON_IDENTITY_LABELS.birthDate}
            {mark("birthDate")}
          </Label>
          {/*
            La data si normalizza a `YYYY-MM-DD` in ingresso: dall'archivio
            arriva come istante ISO, e un `<input type="date">` con qualunque
            altra forma si disegna vuoto senza dire niente — con l'effetto che
            il codice fiscale non si poteva calcolare da nessuna finestra di
            modifica (RC Fix 2, punto 3).
          */}
          <Input
            id={`${idPrefix}-birth-date`}
            name="birthDate"
            type="date"
            value={toDateInputValue(values.birthDate)}
            disabled={disabled}
            required={Boolean(required?.birthDate)}
            onChange={(event) => onChange({ birthDate: event.target.value })}
          />
        </div>

        <BirthPlaceField
          id={`${idPrefix}-birth-place`}
          label={`${PERSON_IDENTITY_LABELS.birthPlace}${mark("birthPlace")}`}
          value={text("birthPlace")}
          belfioreCode={text("birthPlaceCode")}
          fiscalCode={text("fiscalCode")}
          disabled={disabled}
          onChange={onChange}
        />
      </div>

      {/* 5 — Sesso */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-gender`}>
            {PERSON_IDENTITY_LABELS.gender}
            {mark("gender")}
          </Label>
          <Select
            value={normalizeGenderLetter(values.gender)}
            disabled={disabled}
            onValueChange={(gender) => onChange({ gender })}
          >
            <SelectTrigger id={`${idPrefix}-gender`}>
              <SelectValue placeholder="Seleziona" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="M">Maschio</SelectItem>
              <SelectItem value="F">Femmina</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* 6 — Codice fiscale */}
      <AssistedFiscalCodeField
        id={`${idPrefix}-fiscal-code`}
        label={`${PERSON_IDENTITY_LABELS.fiscalCode}${mark("fiscalCode")}`}
        value={text("fiscalCode")}
        disabled={disabled}
        enableCompute={enableFiscalCodeCompute}
        onChange={(fiscalCode) => onChange({ fiscalCode })}
        belfioreCode={text("birthPlaceCode")}
        person={{
          firstName: values.firstName,
          lastName: values.lastName,
          // Il calcolo vuole `YYYY-MM-DD`: la stessa normalizzazione del campo
          // sopra, o il codice non si calcolerebbe pur avendo la data sotto gli
          // occhi.
          birthDate: toDateInputValue(values.birthDate),
          gender: values.gender,
        }}
      />
    </div>
  );
}
