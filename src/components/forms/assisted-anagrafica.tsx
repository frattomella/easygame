"use client";

import { useEffect, useMemo, useState } from "react";
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
import { ComuneAutocomplete } from "./comune-autocomplete";
import { CapitalizedInput } from "./capitalized-input";
import { lookupComuneByBelfiore } from "@/lib/api/comuni";
import type { ComuneMatch } from "@/lib/comuni-model";

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
   * Perche il CAP non si e riempito da solo.
   *
   * Non e un dettaglio da nascondere: un campo che a volte si compila e a
   * volte no, senza dire perche, sembra rotto. I due modi di non sapere sono
   * diversi e all'operatore si dice quale — «questo comune ha piu CAP,
   * scrivilo tu» non e la stessa cosa di «di questo comune non so niente».
   */
  const [postalCodeNote, setPostalCodeNote] = useState("");

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
          {postalCodeNote && !issueFor(issues, "postalCode") ? (
            <p className="text-xs text-slate-500">{postalCodeNote}</p>
          ) : null}
        </div>

        {/*
          Il comune si sceglie dall'archivio ISTAT e porta con se la provincia.
          Resta un campo libero: una localita estera o un comune soppresso si
          possono ancora scrivere a mano.
        */}
        <div className="space-y-2">
          <ComuneAutocomplete
            id={`${idPrefix}-city`}
            value={values.city || ""}
            onChange={(city) => onChange({ city })}
            onSelect={(comune) => {
              const patch: AssistedAddressPatch = {
                city: comune.name,
                province: comune.province,
              };
              // La regione si compila solo se e vuota o se era il residuo
              // della provincia precedente: stessa regola della tendina.
              const previousProvince = findProvince(values.province);
              const currentRegion = String(values.region || "").trim();
              if (!currentRegion || currentRegion === previousProvince?.region) {
                patch.region = comune.region;
              }

              /*
                Il CAP segue la stessa regola di tutto questo componente:
                **suggerire, non decidere**. Si compila solo se il campo e
                vuoto — un CAP gia digitato viene da una busta o da un
                documento in mano all'operatore e non si sovrascrive — e solo
                se il comune ne ha uno solo. Per i 52 comuni con piu CAP il
                dataset sa che ce n'e piu d'uno e non sa quale sia il suo:
                dirlo e l'unica risposta onesta.
              */
              const currentPostalCode = String(values.postalCode || "").trim();
              if (comune.postalCodeStatus === "unique" && comune.postalCode) {
                if (!currentPostalCode) patch.postalCode = comune.postalCode;
                setPostalCodeNote("");
              } else if (comune.postalCodeStatus === "ambiguous") {
                setPostalCodeNote(
                  currentPostalCode
                    ? ""
                    : `${comune.name} ha piu di un CAP: indica quello dell'indirizzo.`,
                );
              } else {
                setPostalCodeNote("");
              }

              onChange(patch);
            }}
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
 * Il calcolo richiede il codice catastale del comune di nascita. Dal Blocco 7
 * EasyGame ha l'archivio ISTAT dei comuni (`src/data/comuni-istat.json`) e il
 * codice **si cerca**: l'operatore scrive il comune di nascita, non un codice
 * di quattro caratteri che deve trovare altrove. Resta la casella manuale, per
 * chi e nato all'estero o in un comune soppresso, che l'archivio non copre.
 *
 * Cio che non cambia (ADR-0027): il codice catastale non si indovina mai, e un
 * codice fiscale gia scritto non viene riscritto — al massimo si segnala che
 * non torna, e la sostituzione richiede una conferma esplicita.
 */
export function AssistedFiscalCodeField({
  id,
  label = "Codice fiscale",
  value,
  onChange,
  person,
  belfioreCode,
  onBelfioreCodeChange,
  birthPlace,
  onBirthPlaceChange,
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
   * Comune di nascita, quando il form ne ha gia un campo: cosi la ricerca
   * scrive nell'anagrafica invece di vivere in un campo di servizio.
   */
  birthPlace?: string;
  onBirthPlaceChange?: (value: string) => void;
  /**
   * Falso dove l'anagrafica non raccoglie data di nascita e sesso — per
   * esempio il legale rappresentante del club: li il codice si puo solo
   * verificare, non calcolare, e proporre il calcolo sarebbe una promessa
   * che il form non puo mantenere.
   */
  enableCompute?: boolean;
  className?: string;
}) {
  const [manualBelfioreOpen, setManualBelfioreOpen] = useState(false);
  const [pendingOverwrite, setPendingOverwrite] = useState(false);
  const [localBirthPlace, setLocalBirthPlace] = useState("");
  const [resolvedComune, setResolvedComune] = useState<ComuneMatch | null>(null);

  const effectiveBelfiore =
    String(belfioreCode || "").trim().toUpperCase() ||
    extractBelfioreCode(value);

  /**
   * Che comune e il codice catastale in uso.
   *
   * Serve a rendere verificabile cio che finora era opaco: prima il campo
   * mostrava «H501» e nessuno poteva accorgersi che era il comune sbagliato.
   */
  useEffect(() => {
    if (!effectiveBelfiore) {
      setResolvedComune(null);
      return;
    }

    const controller = new AbortController();
    lookupComuneByBelfiore(effectiveBelfiore, controller.signal)
      .then((comune) => {
        if (!controller.signal.aborted) setResolvedComune(comune);
      })
      .catch(() => {});

    return () => controller.abort();
  }, [effectiveBelfiore]);

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

      {/*
        Sostituzione di un codice che non torna. Esiste il gesto, ma in due
        tempi: il primo clic dichiara l'intenzione, il secondo scrive. Un
        codice fiscale inserito a mano viene quasi sempre da un documento in
        mano all'operatore, e va sostituito solo da chi sa che sta sbagliando.
      */}
      {enableCompute && check.status === "mismatch" && check.expected ? (
        <div className="flex flex-wrap items-center gap-2">
          {pendingOverwrite ? (
            <>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={() => {
                  onChange(check.expected as string);
                  setPendingOverwrite(false);
                }}
              >
                Conferma la sostituzione
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setPendingOverwrite(false)}
              >
                Tieni quello inserito
              </Button>
            </>
          ) : (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setPendingOverwrite(true)}
            >
              <Wand2 className="mr-2 h-3.5 w-3.5" aria-hidden />
              Sostituisci con {check.expected}
            </Button>
          )}
        </div>
      ) : null}

      {onBelfioreCodeChange ? (
        <div className="space-y-2 pt-1">
          <ComuneAutocomplete
            id={`${id}-birth-comune`}
            label="Comune di nascita"
            value={
              onBirthPlaceChange ? birthPlace || "" : localBirthPlace
            }
            onChange={(next) => {
              if (onBirthPlaceChange) onBirthPlaceChange(next);
              else setLocalBirthPlace(next);
            }}
            onSelect={(comune) => {
              if (onBirthPlaceChange) onBirthPlaceChange(comune.name);
              else setLocalBirthPlace(comune.name);
              onBelfioreCodeChange(comune.belfiore);
            }}
            hint={
              effectiveBelfiore ? (
                <span className="flex flex-wrap items-center gap-1">
                  <span>Codice catastale</span>
                  <span className="eg-tabular font-medium text-slate-700">
                    {effectiveBelfiore}
                  </span>
                  {resolvedComune ? (
                    <span>
                      — {resolvedComune.name} ({resolvedComune.province})
                    </span>
                  ) : (
                    <span>
                      — non e nell&apos;archivio ISTAT: comune soppresso o stato
                      estero
                    </span>
                  )}
                </span>
              ) : (
                "Scegli il comune per ricavarne il codice catastale."
              )
            }
          />

          {/*
            La casella manuale resta, ma chiusa: e la via per chi e nato
            all'estero o in un comune che non esiste piu, non la via normale.
          */}
          {manualBelfioreOpen ? (
            <div className="space-y-1.5">
              <Label
                htmlFor={`${id}-belfiore`}
                className="text-xs font-normal text-slate-500"
              >
                Codice catastale (es. H501, oppure Z___ per uno stato estero)
              </Label>
              <Input
                id={`${id}-belfiore`}
                value={belfioreCode || ""}
                onChange={(event) =>
                  onBelfioreCodeChange(
                    event.target.value
                      .toUpperCase()
                      .replace(/[^A-Z0-9]/g, "")
                      .slice(0, 4),
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
          ) : (
            <button
              type="button"
              onClick={() => setManualBelfioreOpen(true)}
              className="text-xs font-medium text-slate-500 underline underline-offset-2 hover:text-slate-700"
            >
              Nato all&apos;estero o in un comune soppresso? Inserisci il codice
              catastale
            </button>
          )}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Residenza di una persona: via, comune, CAP.
 *
 * **Perche esiste** (Blocco A, punti 9 e 10). `AssistedAddressFields` e la
 * residenza *completa* — provincia, regione, nazione — e sta bene sulla scheda
 * di un club o di un atleta. Le sei anagrafiche di persona (allenatore, staff,
 * socio: creazione e scheda) ne chiedono tre campi soli, e per questo avevano
 * tre `<Input>` liberi ciascuna: sei copie dello stesso blocco, nessuna con la
 * ricerca del comune e nessuna con il CAP.
 *
 * L'effetto pratico era che l'assistenza anagrafica arrivava dove il form era
 * gia complesso e mancava dove era semplice — cioe esattamente dove una
 * segreteria digita di piu.
 *
 * Il CAP si compila con la stessa regola di tutto questo file: **si propone,
 * non si impone.** Solo se il campo e vuoto, e solo se il comune ne ha uno
 * solo; per gli altri lo si dice e si lascia scrivere.
 */
export type PersonResidenceValue = {
  address?: string;
  city?: string;
  postalCode?: string;
};

export function PersonResidenceFields({
  idPrefix,
  values,
  onChange,
  addressLabel = "Indirizzo",
  disabled = false,
  className,
}: {
  idPrefix: string;
  values: PersonResidenceValue;
  onChange: (patch: PersonResidenceValue) => void;
  addressLabel?: string;
  disabled?: boolean;
  className?: string;
}) {
  const [postalCodeNote, setPostalCodeNote] = useState("");

  return (
    <div className={cn("space-y-4", className)}>
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-address`}>{addressLabel}</Label>
        <CapitalizedInput
          id={`${idPrefix}-address`}
          value={values.address || ""}
          disabled={disabled}
          placeholder="Via Roma, 1"
          onChange={(event) => onChange({ address: event.target.value })}
          onValueChange={(address) => onChange({ address })}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {/*
          Il comune si sceglie dall'archivio ISTAT ma resta un campo libero:
          una localita estera o un comune soppresso si scrivono a mano.
        */}
        <ComuneAutocomplete
          id={`${idPrefix}-city`}
          label="Comune"
          value={values.city || ""}
          disabled={disabled}
          onChange={(city) => onChange({ city })}
          onSelect={(comune) => {
            const patch: PersonResidenceValue = { city: comune.name };
            const current = String(values.postalCode || "").trim();

            if (comune.postalCodeStatus === "unique" && comune.postalCode) {
              if (!current) patch.postalCode = comune.postalCode;
              setPostalCodeNote("");
            } else if (comune.postalCodeStatus === "ambiguous") {
              setPostalCodeNote(
                current
                  ? ""
                  : `${comune.name} ha piu di un CAP: indica quello dell'indirizzo.`,
              );
            } else {
              setPostalCodeNote("");
            }

            onChange(patch);
          }}
        />

        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-postal-code`}>CAP</Label>
          <Input
            id={`${idPrefix}-postal-code`}
            inputMode="numeric"
            maxLength={5}
            className="eg-tabular"
            disabled={disabled}
            value={values.postalCode || ""}
            placeholder="00100"
            onChange={(event) =>
              onChange({
                postalCode: event.target.value
                  .replace(/[^0-9]/g, "")
                  .slice(0, 5),
              })
            }
          />
          {postalCodeNote ? (
            <p className="text-xs text-slate-500">{postalCodeNote}</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
