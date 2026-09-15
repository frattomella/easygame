"use client";

import * as React from "react";
import { Save } from "lucide-react";
import {
  AUTOMATION_AUDIENCES,
  AUTOMATION_AUDIENCE_LABELS,
  AUTOMATION_DELIVERIES,
  AUTOMATION_DELIVERY_LABELS,
  MAX_AUTOMATION_OFFSETS,
  describeAutomationOffset,
  type AutomationAudience,
  type AutomationDelivery,
} from "@/lib/automations/catalog";
import { SUGGESTED_ATTACHMENT_CATEGORIES } from "@/lib/attachments";
import { Button } from "@/components/web/primitives/Button";
import { Toggle } from "@/components/web/primitives/Controls";
import { StatusPill, DataChip } from "@/components/web/primitives/StatusPill";
import { Eyebrow, Hairline, InsetBlock, Panel, PanelHeader } from "@/components/web/primitives/Surface";
import { Field, FormGrid, Select, TextInput, Textarea } from "@/components/web/forms/Field";
import { ruleStatusSpec } from "@/components/communications/v2/communication-status";
import { isRuleDraftDirty, parseOffsets, type RuleDraft, type RuleView } from "@/components/communications/v2/automation-model";

/**
 * Una regola di automazione: un pannello sezionato con il proprio «Salva»
 * (guideline 09 §9.1 pattern 5, «Settings»).
 *
 * **Perche l'interruttore e la prima riga.** E l'unica funzione del prodotto
 * che scrive a nome della societa senza che nessuno prema un pulsante: la
 * domanda «e accesa?» deve avere risposta prima di ogni altra, e spegnerla
 * non deve richiedere di capire il resto della scheda. L'interruttore **non
 * salva da solo**, come nella V1: la parola «Modifiche non salvate» accanto a
 * «Salva» dice che manca un gesto.
 *
 * **Perche l'anteprima mostra i segnaposto vuoti.** Un modello con
 * `{{importo}}` scritto male non deve arrivare a trecento famiglie: qui i
 * segnaposto che non producono niente si vedono **prima**, sotto il testo.
 */
export function AutomationRulePanel({
  rule,
  draft,
  onChange,
  onSave,
  saving,
  disabled,
}: {
  rule: RuleView;
  draft: RuleDraft;
  onChange: (patch: Partial<RuleDraft>) => void;
  onSave: () => void;
  saving: boolean;
  /** Un'altra regola sta salvando, o il giro sta girando. */
  disabled: boolean;
}) {
  const id = rule.trigger;
  const dirty = isRuleDraftDirty(rule, draft);
  const anticipi = parseOffsets(draft.offsetText).map((days) => describeAutomationOffset(rule.direction, days));

  return (
    <Panel as="section" id={`regola-${id}`} data-test="automation-rule">
      <PanelHeader
        eyebrow="Regola"
        title={rule.label}
        description={rule.description}
        actions={
          <label htmlFor={`accesa-${id}`} className="flex items-center gap-2.5">
            <StatusPill status={ruleStatusSpec(draft.enabled)} />
            <Toggle id={`accesa-${id}`} checked={draft.enabled} onCheckedChange={(next) => onChange({ enabled: next })} aria-label={`${rule.label}: ${draft.enabled ? "accesa" : "spenta"}`} />
          </label>
        }
      />

      <div className="flex flex-col gap-5">
        <FormGrid>
          <Field
            label={`Anticipi (giorni, al massimo ${MAX_AUTOMATION_OFFSETS})`}
            htmlFor={`anticipi-${id}`}
            helper={anticipi.length ? anticipi.join(" · ") : "Nessun anticipo: la regola non parte"}
          >
            <TextInput id={`anticipi-${id}`} inputMode="numeric" value={draft.offsetText} onChange={(event) => onChange({ offsetText: event.target.value })} placeholder="7, 3" />
          </Field>
          <Field label="Pubblico" htmlFor={`pubblico-${id}`}>
            <Select
              id={`pubblico-${id}`}
              value={draft.audience}
              onValueChange={(value) => onChange({ audience: value as AutomationAudience })}
              options={AUTOMATION_AUDIENCES.map((audience) => ({ value: audience, label: AUTOMATION_AUDIENCE_LABELS[audience] }))}
            />
          </Field>
        </FormGrid>

        <Field
          label="Come arriva alla societa"
          htmlFor={`consegna-${id}`}
          helper="Il riepilogo raccoglie in una sola email al giorno tutto cio che riguarda la societa. Alla famiglia arriva sempre il messaggio che la riguarda."
        >
          <Select
            id={`consegna-${id}`}
            value={draft.delivery}
            onValueChange={(value) => onChange({ delivery: value as AutomationDelivery })}
            options={AUTOMATION_DELIVERIES.map((delivery) => ({ value: delivery, label: AUTOMATION_DELIVERY_LABELS[delivery] }))}
            /* Alla sola famiglia il riepilogo non arriva mai: la scelta e temporaneamente senza effetto. */
            disabled={draft.audience === "family"}
          />
        </Field>

        {rule.supportsCategoryFilter ? (
          <Field
            label="Documenti da sorvegliare"
            htmlFor={`categorie-${id}`}
            helper="Separa le categorie con una virgola. Lascia vuoto per sorvegliare tutti i documenti con una scadenza. Il certificato medico resta fuori: lo governa la regola «Certificato medico», e due regole sulla stessa data sarebbero due promemoria."
          >
            <TextInput
              id={`categorie-${id}`}
              list={`categorie-note-${id}`}
              placeholder="blsd, documento-identita"
              value={draft.categoryText}
              onChange={(event) => onChange({ categoryText: event.target.value })}
            />
            <datalist id={`categorie-note-${id}`}>
              {SUGGESTED_ATTACHMENT_CATEGORIES.map((categoria) => (
                <option key={categoria} value={categoria} />
              ))}
            </datalist>
          </Field>
        ) : null}

        <Hairline />

        <Field label="Oggetto" htmlFor={`oggetto-${id}`}>
          <TextInput id={`oggetto-${id}`} value={draft.subject} onChange={(event) => onChange({ subject: event.target.value })} />
        </Field>

        <Field label="Testo" htmlFor={`testo-${id}`}>
          <Textarea id={`testo-${id}`} rows={10} value={draft.body} onChange={(event) => onChange({ body: event.target.value })} />
        </Field>

        <InsetBlock>
          <Eyebrow className="mb-2">Anteprima con dati di esempio</Eyebrow>
          <p className="font-brand text-[13px] font-semibold text-egw-ink">{rule.sample.subject}</p>
          <pre className="mt-1.5 overflow-x-auto whitespace-pre-wrap break-words font-brand text-[12px] leading-[1.55] text-egw-ink-72">{rule.sample.text}</pre>
          {rule.sample.unresolved.length > 0 ? (
            <p className="mt-3 flex flex-wrap items-center gap-1.5 font-brand text-[11.5px] font-medium text-egw-amber-ink">
              Segnaposto senza valore:
              {rule.sample.unresolved.map((key) => (
                <DataChip key={key} size="sm" tone="amber">
                  {key}
                </DataChip>
              ))}
            </p>
          ) : null}
          <p className="mt-2 font-brand text-[11.5px] text-[rgba(11,26,58,.55)]">
            L&apos;anteprima usa dati inventati. Serve a vedere la forma del messaggio e i segnaposto che restano vuoti.
          </p>
        </InsetBlock>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="font-brand text-[11.5px] text-[rgba(11,26,58,.55)]">
            Predefiniti: {rule.defaultOffsetDays.map((days) => describeAutomationOffset(rule.direction, days)).join(" · ")}
          </p>
          <div className="flex items-center gap-3">
            <span className="font-brand text-[12px] font-medium text-egw-amber-ink" aria-live="polite">
              {dirty ? "Modifiche non salvate" : ""}
            </span>
            {/*
              Navy pieno, non gradiente (guideline 05 C6): cinque regole
              sono cinque «Salva», e cinque gradienti sarebbero cinque
              primari sullo stesso schermo.
            */}
            <Button variant="neutral" icon={<Save />} loading={saving} disabled={disabled && !saving} onClick={onSave}>
              Salva
            </Button>
          </div>
        </div>
      </div>
    </Panel>
  );
}
