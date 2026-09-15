"use client";

import * as React from "react";
import { Drawer, DrawerSection } from "@/components/web/overlays/Drawer";
import { DangerConfirmDialog } from "@/components/web/overlays/Modal";
import { DateInput, Field, FieldSizeProvider, FormGrid, Select, TextInput, Textarea, ValidationSummary } from "@/components/web/forms/Field";
import { Button } from "@/components/web/primitives/Button";
import { InsetBlock } from "@/components/web/primitives/Surface";
import { useToast } from "@/components/ui/toast-notification";
import { recordMembershipEvent } from "@/lib/members/client";
import {
  MEMBERSHIP_EVENT_LABELS,
  MEMBERSHIP_EVENT_TYPES,
  canApplyMembershipEvent,
  isMembershipCessation,
  validateMembershipEventDraft,
  type MemberStatus,
  type MembershipEventType,
} from "@/lib/members/model";
import { todayLocalDateOnly } from "@/lib/date-only";
import { formatDateShort } from "@/lib/web/format";

/**
 * «Registra un evento» nel libro soci, in un cassetto (guideline 08 §8.5).
 *
 * Sostituisce la card omonima di `membership-register-panel.tsx` (V1) con
 * gli stessi campi e la stessa scrittura (`POST /api/v1/membership/events`).
 * Gli eventi proponibili si ricavano dallo stato corrente con
 * `canApplyMembershipEvent`: offrire «ammetti» a chi e gia socio produrrebbe
 * un rifiuto del server su un gesto che l'interfaccia aveva appena suggerito.
 *
 * Una **cessazione** (dimissione, esclusione, decadenza) chiude la qualifica
 * di socio e il registro e append-only: la V1 la registrava al primo clic,
 * qui passa dal dialogo distruttivo (§8.9) che dice cosa cambia da quella
 * data. Ammissione e riammissione si registrano direttamente, come nella V1.
 *
 * **I permessi non si decidono qui.** Chi monta il cassetto verifica
 * `canManageMembershipRegister`, lo stesso modulo che il server applica.
 */
const emptyForm = () => ({
  eventType: "" as MembershipEventType | "",
  effectiveDate: todayLocalDateOnly(),
  reason: "",
  resolutionReference: "",
  resolutionDate: "",
  notes: "",
});

export function MembershipEventDrawer({
  open,
  onOpenChange,
  clubId,
  memberId,
  memberName,
  currentStatus,
  onRecorded,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clubId: string | null;
  memberId: string;
  memberName: string;
  currentStatus: MemberStatus | null | undefined;
  onRecorded: () => Promise<void> | void;
}) {
  const { showToast } = useToast();
  const idPrefix = "membership-event";
  const [form, setForm] = React.useState(emptyForm);
  const [dirty, setDirty] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [confirming, setConfirming] = React.useState(false);
  const [errors, setErrors] = React.useState<Array<{ id?: string; label: string }>>([]);

  React.useEffect(() => {
    if (!open) {
      setForm(emptyForm());
      setDirty(false);
      setErrors([]);
      setConfirming(false);
    }
  }, [open]);

  const eventiPossibili = React.useMemo(() => {
    const stato = currentStatus || "mai_ammesso";
    return MEMBERSHIP_EVENT_TYPES.filter((tipo) => canApplyMembershipEvent(stato, tipo));
  }, [currentStatus]);

  const tipoScelto = (form.eventType || eventiPossibili[0] || "") as MembershipEventType | "";
  const serveMotivo = isMembershipCessation(tipoScelto);
  const serveDelibera = tipoScelto === "ADMISSION";
  const label = tipoScelto ? MEMBERSHIP_EVENT_LABELS[tipoScelto] : "";

  const update = (patch: Partial<ReturnType<typeof emptyForm>>) => {
    setForm((current) => ({ ...current, ...patch }));
    setDirty(true);
    if (errors.length) setErrors([]);
  };

  const FIELD_IDS: Record<string, string> = {
    eventType: `${idPrefix}-type`,
    effectiveDate: `${idPrefix}-effective-date`,
    resolutionReference: `${idPrefix}-resolution`,
    reason: `${idPrefix}-reason`,
  };

  const validate = () => {
    const result = validateMembershipEventDraft({
      eventType: tipoScelto,
      effectiveDate: form.effectiveDate,
      resolutionReference: form.resolutionReference,
      reason: form.reason,
    });
    const found = result.issues.map((issue) => ({ id: FIELD_IDS[issue.field], label: issue.message }));
    setErrors(found);
    return found.length === 0;
  };

  const registra = async () => {
    if (!clubId || !tipoScelto) return;
    setSaving(true);
    const { error } = await recordMembershipEvent({
      clubId,
      memberId,
      eventType: tipoScelto,
      effectiveDate: form.effectiveDate,
      reason: form.reason || null,
      resolutionReference: form.resolutionReference || null,
      resolutionDate: form.resolutionDate || null,
      notes: form.notes || null,
    });
    setSaving(false);
    if (error) {
      setConfirming(false);
      showToast("error", error.message);
      return;
    }
    showToast("success", "Evento registrato nel libro soci");
    setDirty(false);
    setConfirming(false);
    onOpenChange(false);
    await onRecorded();
  };

  const submit = () => {
    if (!validate()) return;
    if (serveMotivo) {
      setConfirming(true);
      return;
    }
    void registra();
  };

  const errorFor = (field: string) => errors.find((e) => e.id === FIELD_IDS[field])?.label;

  return (
    <>
      <Drawer
        open={open}
        onOpenChange={onOpenChange}
        width="default"
        eyebrow="Libro soci"
        title="Registra un evento"
        description={`Lo stato non è un campo: si ricava dagli eventi. ${memberName}`}
        dirty={dirty}
        locked={saving}
        data-test="membership-event-drawer"
        footer={
          <>
            <Button variant="primary" onClick={submit} loading={saving} disabled={!tipoScelto}>
              Registra nel libro
            </Button>
            <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={saving}>
              Annulla
            </Button>
          </>
        }
      >
        <FieldSizeProvider size="sm">
          <div className="flex flex-col gap-5">
            <ValidationSummary errors={errors} />
            <DrawerSection eyebrow="Evento">
              <FormGrid>
                <Field label="Evento" htmlFor={FIELD_IDS.eventType} required error={errorFor("eventType")}>
                  <Select
                    id={FIELD_IDS.eventType}
                    value={tipoScelto}
                    onValueChange={(value) => update({ eventType: value as MembershipEventType })}
                    options={eventiPossibili.map((tipo) => ({ value: tipo, label: MEMBERSHIP_EVENT_LABELS[tipo] }))}
                    placeholder="Scegli l'evento"
                  />
                </Field>
                <Field label="Ha effetto dal" htmlFor={FIELD_IDS.effectiveDate} required error={errorFor("effectiveDate")} width="16ch">
                  <DateInput id={FIELD_IDS.effectiveDate} value={form.effectiveDate} onChange={(event) => update({ effectiveDate: event.target.value })} />
                </Field>
              </FormGrid>
              {serveMotivo ? (
                <Field label="Motivo" htmlFor={FIELD_IDS.reason} required error={errorFor("reason")} className="mt-5">
                  <TextInput id={FIELD_IDS.reason} value={form.reason} onChange={(event) => update({ reason: event.target.value })} placeholder="Dimissioni volontarie, morosità, trasferimento…" />
                </Field>
              ) : null}
            </DrawerSection>
            <DrawerSection eyebrow="Delibera">
              <FormGrid>
                <Field label="Estremi della delibera" htmlFor={FIELD_IDS.resolutionReference} required={serveDelibera} error={errorFor("resolutionReference")}>
                  <TextInput
                    id={FIELD_IDS.resolutionReference}
                    value={form.resolutionReference}
                    onChange={(event) => update({ resolutionReference: event.target.value })}
                    placeholder="Delibera del consiglio direttivo n. 12"
                  />
                </Field>
                <Field label="Data della delibera" htmlFor={`${idPrefix}-resolution-date`} width="16ch">
                  <DateInput id={`${idPrefix}-resolution-date`} value={form.resolutionDate} onChange={(event) => update({ resolutionDate: event.target.value })} />
                </Field>
              </FormGrid>
            </DrawerSection>
            <DrawerSection eyebrow="Note">
              <Field label="Note" htmlFor={`${idPrefix}-notes`}>
                <Textarea id={`${idPrefix}-notes`} rows={2} value={form.notes} onChange={(event) => update({ notes: event.target.value })} />
              </Field>
            </DrawerSection>
            {serveMotivo ? (
              <InsetBlock>
                <p className="font-brand text-[12.5px] leading-[1.5] text-egw-ink-72">
                  Una {label.toLowerCase()} chiude la qualifica di socio dalla data indicata. Il registro è append-only: per far rientrare la persona si registra una riammissione.
                </p>
              </InsetBlock>
            ) : null}
          </div>
        </FieldSizeProvider>
      </Drawer>

      <DangerConfirmDialog
        open={confirming}
        onOpenChange={(next) => !saving && setConfirming(next)}
        title={`Registrare la ${label.toLowerCase()} di ${memberName}?`}
        description={`L'evento entra nel libro soci con effetto dal ${form.effectiveDate ? formatDateShort(form.effectiveDate) : "—"}.`}
        consequences={[
          "Da quella data la persona non risulta più socia",
          "Il numero di tessera resta nel libro e non si riassegna",
          "L'evento non si modifica e non si cancella: per farla rientrare si registra una riammissione",
        ]}
        confirmLabel="Registra nel libro"
        onConfirm={registra}
        loading={saving}
      />
    </>
  );
}
