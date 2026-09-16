"use client";

import { todayLocalDateOnly } from "@/lib/date-only";
import * as React from "react";
import { UserRound } from "lucide-react";
import { Drawer, DrawerSection } from "@/components/web/overlays/Drawer";
import { Button } from "@/components/web/primitives/Button";
import { DataChip, StatusPill } from "@/components/web/primitives/StatusPill";
import { InsetBlock } from "@/components/web/primitives/Surface";
import { DateInput, Field, FieldSizeProvider, FormGrid, SearchableSelect, TextInput, Textarea, ValidationSummary } from "@/components/web/forms/Field";
import { AlertBlock } from "@/components/web/page/Alerts";
import { formatDateShort } from "@/lib/web/format";
import type { TrialAthlete } from "@/lib/trials/client";
import type { TrialCategoryOption, TrialTargetOption } from "@/components/trials/v2/use-trial-catalog";
import {
  EMPTY_TRIAL_FORM,
  findTrialMatches,
  trialFormFrom,
  trialStatusSpec,
  validateTrialForm,
  type TrialFormError,
  type TrialFormState,
} from "@/components/trials/v2/trial-model";

/**
 * Il modulo della persona in prova (ADR-0188): un cassetto da 480 con nome,
 * cognome e data di nascita in testa — il minimo affidabile — poi dove si
 * allena (categoria canonica, gruppo, sede) e i recapiti, che si vedono solo
 * se il ruolo puo leggerli.
 *
 * **Gli omonimi si mostrano, non si fondono.** Mentre si scrive un nome che
 * esiste gia fra le persone in prova, il cassetto lo dice, con la data di
 * nascita e la categoria per distinguerli, e offre di **usare quella**: la
 * scelta e di chi registra. `quick` e la forma da palestra: tre campi e la
 * categoria gia scelta dall'allenamento.
 */

export function TrialFormDrawer({
  open,
  onOpenChange,
  trial,
  existing,
  categoryOptions,
  targetOptions,
  canEditContacts,
  defaults,
  quick = false,
  saving,
  onSubmit,
  onPickExisting,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** In modifica: la riga; in creazione: `null`. */
  trial: TrialAthlete | null;
  /** Le persone in prova gia note, per proporre gli omonimi. */
  existing: readonly TrialAthlete[];
  categoryOptions: readonly TrialCategoryOption[];
  /** Le squadre scegliibili (ADR-0194): categoria, gruppo e sede in una scelta sola. */
  targetOptions: readonly TrialTargetOption[];
  canEditContacts: boolean;
  defaults?: Partial<TrialFormState>;
  quick?: boolean;
  saving: boolean;
  onSubmit: (form: TrialFormState) => void | Promise<void>;
  /** Chi registra sceglie una persona gia in prova invece di crearne una seconda. */
  onPickExisting?: (trial: TrialAthlete) => void;
}) {
  const [form, setForm] = React.useState<TrialFormState>(() => trialFormFrom(trial, defaults));
  const [errors, setErrors] = React.useState<TrialFormError[]>([]);
  const [touched, setTouched] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setForm(trialFormFrom(trial, defaults));
    setErrors([]);
    setTouched(false);
  }, [open, trial, defaults]);

  const set = <K extends keyof TrialFormState>(key: K, value: TrialFormState[K]) => {
    setTouched(true);
    setForm((current) => ({ ...current, [key]: value }));
  };

  const errorFor = (field: keyof TrialFormState) => errors.find((error) => error.field === field)?.message;

  const matches = React.useMemo(
    () => (trial ? [] : findTrialMatches(form, existing).filter((match) => match.trial.status !== "enrolled")),
    [existing, form, trial],
  );

  const submit = async () => {
    const found = validateTrialForm(form);
    setErrors(found);
    if (found.length) return;
    await onSubmit(form);
  };

  /*
    La squadra della prova, letta dal modulo: il gruppo se c'e, altrimenti la
    categoria senza sede. Scegliere una squadra scrive categoria, gruppo e
    sede insieme (ADR-0194 §16): niente tre tendine da tenere d'accordo.
  */
  const targetId = React.useMemo(() => {
    if (form.groupId) return targetOptions.find((t) => t.groupId === form.groupId)?.id || "";
    if (!form.categoryId) return "";
    const squadre = targetOptions.filter((t) => t.categoryId === form.categoryId);
    return squadre.find((t) => !t.groupId)?.id || (squadre.length === 1 ? squadre[0].id : "");
  }, [form.categoryId, form.groupId, targetOptions]);
  const scegliSquadra = (id: string | null) => {
    setTouched(true);
    const target = id ? targetOptions.find((t) => t.id === id) : null;
    setForm((current) => ({
      ...current,
      categoryId: target?.categoryId || "",
      groupId: target?.groupId || "",
      siteId: target?.siteId || "",
    }));
  };

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      width="default"
      eyebrow="Persona in prova"
      title={trial ? trial.name : quick ? "Nuova persona in prova" : "Registra una persona in prova"}
      description={
        trial
          ? "Aggiorna i dati: le presenze registrate restano sue."
          : "Bastano nome, cognome e data di nascita. Se torna, EasyGame la riconosce da qui."
      }
      dirty={touched}
      locked={saving}
      data-test="trial-form-drawer"
      footer={
        <>
          <Button variant="primary" onClick={() => void submit()} loading={saving}>
            {trial ? "Salva modifiche" : quick ? "Registra e segna presente" : "Registra"}
          </Button>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={saving}>
            Annulla
          </Button>
        </>
      }
    >
      <FieldSizeProvider size="sm">
        <form
          className="flex flex-col gap-6"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          {errors.length ? <ValidationSummary errors={errors.map((error) => ({ id: `trial-${error.field}`, label: error.message }))} /> : null}

          <DrawerSection eyebrow="Chi e" title="Anagrafica">
            <FormGrid columns={2}>
              <Field label="Nome" htmlFor="trial-firstName" required error={errorFor("firstName")}>
                <TextInput id="trial-firstName" autoComplete="off" value={form.firstName} onChange={(event) => set("firstName", event.target.value)} />
              </Field>
              <Field label="Cognome" htmlFor="trial-lastName" required error={errorFor("lastName")}>
                <TextInput id="trial-lastName" autoComplete="off" value={form.lastName} onChange={(event) => set("lastName", event.target.value)} />
              </Field>
            </FormGrid>
            <Field label="Data di nascita" htmlFor="trial-birthDate" required error={errorFor("birthDate")} helper="Distingue due omonimi e dice la categoria." className="mt-5" width="20ch">
              <DateInput id="trial-birthDate" value={form.birthDate} max={todayLocalDateOnly()} onChange={(event) => set("birthDate", event.target.value)} />
            </Field>
          </DrawerSection>

          {matches.length ? (
            <AlertBlock
              severity="warning"
              title={matches.some((match) => match.exact) ? "Questa persona sembra gia in prova" : "C'e gia una persona in prova con questo nome"}
            >
              <ul className="mt-2 flex flex-col gap-2" aria-label="Persone in prova con lo stesso nome">
                {matches.slice(0, 4).map(({ trial: match, exact }) => (
                  <li key={match.id} className="flex flex-wrap items-center justify-between gap-2 rounded-egw-control border border-egw-hairline bg-white px-3 py-2">
                    <span className="min-w-0">
                      <span className="block font-brand text-[12.5px] font-semibold text-egw-ink">{match.name}</span>
                      <span className="egw-num block font-brand text-[11px] text-egw-ink-62">
                        {[`nato il ${formatDateShort(match.birthDate)}`, match.categoryLabel, exact ? "stessa data di nascita" : null].filter(Boolean).join(" · ")}
                      </span>
                    </span>
                    <span className="flex items-center gap-2">
                      <StatusPill status={trialStatusSpec(match.status)} size="sm" />
                      {onPickExisting && match.status === "in_trial" ? (
                        <Button variant="secondary" size="xs" onClick={() => onPickExisting(match)}>
                          E lei
                        </Button>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 font-brand text-[11.5px] text-egw-ink-62">Se e un&apos;altra persona, prosegui: due omonimi possono esistere.</p>
            </AlertBlock>
          ) : null}

          <DrawerSection eyebrow="Dove si allena" title="Squadra">
            <Field label="Squadra" htmlFor="trial-category" optional helper="La squadra con cui prova: categoria e sede insieme. Solo le squadre del club.">
              <SearchableSelect
                id="trial-category"
                value={targetId || null}
                onValueChange={scegliSquadra}
                options={targetOptions.map((option) => ({ value: option.id, label: option.label }))}
                placeholder="Nessuna squadra"
                allowClear
              />
            </Field>
            {form.categoryId && !targetId ? (
              <p className="mt-2 font-brand text-[11.5px] text-egw-amber-ink">
                La categoria di questa prova si svolge in piu sedi: scegli la squadra.
              </p>
            ) : null}
          </DrawerSection>

          {!quick && canEditContacts ? (
            <DrawerSection eyebrow="Per ricontattare" title="Recapiti">
              <FormGrid columns={2}>
                <Field label="Telefono" htmlFor="trial-phone" optional>
                  <TextInput id="trial-phone" type="tel" inputMode="tel" autoComplete="off" value={form.phone} onChange={(event) => set("phone", event.target.value)} />
                </Field>
                <Field label="Email" htmlFor="trial-email" optional error={errorFor("email")}>
                  <TextInput id="trial-email" type="email" autoComplete="off" value={form.email} onChange={(event) => set("email", event.target.value)} />
                </Field>
                <Field label="Genitore o tutore" htmlFor="trial-guardianName" optional helper="Solo un nome per sapere chi chiamare: non crea un tutore ne un accesso.">
                  <TextInput id="trial-guardianName" autoComplete="off" value={form.guardianName} onChange={(event) => set("guardianName", event.target.value)} />
                </Field>
                <Field label="Telefono del tutore" htmlFor="trial-guardianPhone" optional>
                  <TextInput id="trial-guardianPhone" type="tel" inputMode="tel" autoComplete="off" value={form.guardianPhone} onChange={(event) => set("guardianPhone", event.target.value)} />
                </Field>
              </FormGrid>
            </DrawerSection>
          ) : null}

          {!quick ? (
            <DrawerSection eyebrow="Appunti" title="Note">
              <Field label="Note" htmlFor="trial-notes" optional>
                <Textarea id="trial-notes" rows={3} value={form.notes} onChange={(event) => set("notes", event.target.value)} />
              </Field>
            </DrawerSection>
          ) : null}

          {quick && form.categoryId ? (
            <InsetBlock className="flex items-center gap-2 py-3">
              <UserRound className="h-4 w-4 text-egw-ink-42" aria-hidden />
              <span className="font-brand text-[12px] text-egw-ink-62">Verra registrata con</span>
              <DataChip>{targetOptions.find((option) => option.id === targetId)?.label || categoryOptions.find((option) => option.id === form.categoryId)?.label || "Categoria"}</DataChip>
            </InsetBlock>
          ) : null}

          <button type="submit" className="hidden" aria-hidden tabIndex={-1} />
        </form>
      </FieldSizeProvider>
    </Drawer>
  );
}

export { EMPTY_TRIAL_FORM };
