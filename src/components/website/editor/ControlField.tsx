"use client";

import * as React from "react";
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, Plus, Trash2 } from "lucide-react";
import type { ControlDescriptor, ControlOption } from "@/lib/website/registry/types";
import { ICON_KEYS } from "@/lib/website/registry/fields";
import { LINK_KINDS, type LinkKind, type MediaRef, type WebsiteLink } from "@/lib/website/document/types";
import { uploadWebsiteInlineImage, type EditorOptionsDto, type PageSummaryDto } from "@/lib/website/client";
import { sanitizeWebsiteRichHtml } from "@/lib/rich-text/sanitize";
import { Field, Select, TextInput, Textarea } from "@/components/web/forms/Field";
import { SegmentedControl, Toggle, Checkbox } from "@/components/web/primitives/Controls";
import { Button } from "@/components/web/primitives/Button";
import { RichTextEditor } from "@/components/rich-text/RichTextEditor";
import { MediaField, MediaListField } from "@/components/website/admin/MediaPicker";

/**
 * **Un controllo dell'inspector per ogni tipo dichiarato nel registry.**
 *
 * L'inspector non conosce i blocchi: legge `controls` dalla definizione e
 * disegna qui il campo giusto. Un tipo di controllo nuovo nel registry che
 * non avesse un ramo qui non compilerebbe (`switch` esaustivo).
 *
 * I selettori di dati del gestionale (squadre, stagioni, moduli…) leggono le
 * opzioni dal server (`websiteApi.options`): l'editor non inventa elenchi.
 */

export type ControlContext = {
  options: EditorOptionsDto | null;
  pages: PageSummaryDto[];
  readOnly: boolean;
};

/* I selettori non accettano il valore vuoto: lo si traduce in una sentinella. */
const NONE = "__vuoto__";
const toSelect = (value: unknown) => (value === null || value === undefined || value === "" ? NONE : String(value));
const fromSelect = (value: string) => (value === NONE ? null : value);

export const controlVisible = (control: ControlDescriptor, props: Record<string, unknown>) => {
  if (!control.when) return true;
  const actual = props[control.when.key];
  return "equals" in control.when ? actual === control.when.equals : actual !== control.when.notEquals;
};

const LINK_KIND_LABELS: Record<LinkKind, string> = {
  none: "Nessuno",
  page: "Pagina del sito",
  url: "Indirizzo esterno",
  anchor: "Sezione della pagina",
  email: "Email",
  phone: "Telefono",
  form: "Modulo online",
};

export function LinkControl({
  value,
  onChange,
  context,
  label,
}: {
  value: WebsiteLink | null | undefined;
  onChange: (value: WebsiteLink) => void;
  context: ControlContext;
  label: string;
}) {
  const link: WebsiteLink = value || { kind: "none" };
  const set = (patch: Partial<WebsiteLink>) => onChange({ ...link, ...patch });
  const pageOptions = context.pages
    .filter((page) => !page.path.includes("*"))
    .map((page) => ({ value: page.id, label: `${page.title} (${page.path})` }));
  return (
    <div className="space-y-2 rounded-md border border-egw-hairline p-2">
      <Field label={label}>
        <Select
          value={link.kind}
          onValueChange={(kind) => set({ kind: kind as LinkKind })}
          options={LINK_KINDS.map((kind) => ({ value: kind, label: LINK_KIND_LABELS[kind] }))}
          disabled={context.readOnly}
          aria-label={`Tipo di collegamento: ${label}`}
        />
      </Field>
      {link.kind === "page" ? (
        <Select
          value={link.pageId || null}
          onValueChange={(pageId) => set({ pageId })}
          options={pageOptions}
          placeholder="Scegli la pagina"
          disabled={context.readOnly}
          aria-label="Pagina di destinazione"
        />
      ) : null}
      {link.kind === "url" ? (
        <TextInput
          value={link.url || ""}
          onChange={(event) => set({ url: event.target.value })}
          placeholder="https://"
          inputMode="url"
          disabled={context.readOnly}
          aria-label="Indirizzo esterno"
        />
      ) : null}
      {link.kind === "anchor" ? (
        <TextInput
          value={link.anchor || ""}
          onChange={(event) => set({ anchor: event.target.value })}
          placeholder="iscrizioni"
          disabled={context.readOnly}
          aria-label="Ancora della sezione (senza #)"
        />
      ) : null}
      {link.kind === "email" ? (
        <TextInput value={link.email || ""} onChange={(event) => set({ email: event.target.value })} type="email" disabled={context.readOnly} aria-label="Email" />
      ) : null}
      {link.kind === "phone" ? (
        <TextInput value={link.phone || ""} onChange={(event) => set({ phone: event.target.value })} type="tel" disabled={context.readOnly} aria-label="Telefono" />
      ) : null}
      {link.kind === "form" ? (
        <Select
          value={link.formSlug || null}
          onValueChange={(formSlug) => set({ formSlug })}
          options={(context.options?.forms || []).map((form) => ({ value: form.slug, label: form.title }))}
          placeholder={context.options?.forms.length ? "Scegli il modulo" : "Nessun modulo pubblicato"}
          disabled={context.readOnly}
          aria-label="Modulo online"
        />
      ) : null}
      {link.kind === "url" || link.kind === "form" ? (
        <label className="flex items-center gap-2 text-[12px] text-egw-ink-72">
          <Checkbox checked={Boolean(link.newTab)} onChange={(event) => set({ newTab: event.target.checked })} disabled={context.readOnly} size={16} />
          Apri in una nuova scheda
        </label>
      ) : null}
    </div>
  );
}

function CheckboxList({
  options,
  value,
  onChange,
  disabled,
  label,
}: {
  options: readonly ControlOption[];
  value: string[];
  onChange: (value: string[]) => void;
  disabled: boolean;
  label: string;
}) {
  const chosen = new Set(value);
  return (
    <fieldset className="space-y-1">
      <legend className="mb-1 text-[12px] font-semibold text-egw-ink-72">{label}</legend>
      {options.map((option) => (
        <label key={option.value} className="flex items-center gap-2 text-[12.5px] text-egw-ink">
          <Checkbox
            checked={chosen.has(option.value)}
            disabled={disabled}
            size={16}
            onChange={(event) => {
              const next = options.map((item) => item.value).filter((item) => (item === option.value ? event.target.checked : chosen.has(item)));
              onChange(next);
            }}
          />
          {option.label}
        </label>
      ))}
      {!options.length ? <p className="text-[12px] text-egw-ink-42">Nessuna opzione disponibile.</p> : null}
    </fieldset>
  );
}

const emptyListItem = (fields: readonly ControlDescriptor[]) => {
  const item: Record<string, unknown> = { id: `i${Math.random().toString(36).slice(2, 10)}` };
  for (const field of fields) {
    switch (field.type) {
      case "toggle":
        item[field.key] = false;
        break;
      case "number":
        item[field.key] = field.min;
        break;
      case "media":
        item[field.key] = null;
        break;
      case "media-list":
      case "multi-select":
      case "form-list":
      case "stat-keys":
        item[field.key] = [];
        break;
      case "link":
        item[field.key] = { kind: "none" };
        break;
      case "cta":
        item[field.key] = { label: "", link: { kind: "none" } };
        break;
      case "select":
      case "segmented":
        item[field.key] = field.options[0]?.value ?? "";
        break;
      default:
        item[field.key] = "";
    }
  }
  return item;
};

function ListControl({
  control,
  value,
  onChange,
  context,
}: {
  control: Extract<ControlDescriptor, { type: "list" }>;
  value: Array<Record<string, unknown>>;
  onChange: (value: Array<Record<string, unknown>>) => void;
  context: ControlContext;
}) {
  const [openId, setOpenId] = React.useState<string | null>(null);
  const move = (index: number, delta: -1 | 1) => {
    const target = index + delta;
    if (target < 0 || target >= value.length) return;
    const next = value.slice();
    const [item] = next.splice(index, 1);
    next.splice(target, 0, item);
    onChange(next);
  };
  return (
    <div className="space-y-1.5">
      <p className="text-[12px] font-semibold text-egw-ink-72">
        {control.label} <span className="font-normal text-egw-ink-42">({value.length}/{control.max})</span>
      </p>
      <ul className="space-y-1">
        {value.map((item, index) => {
          const id = String(item.id || index);
          const expanded = openId === id;
          const title = String(item[control.itemLabelKey] || "").replace(/<[^>]+>/g, "").trim() || `Elemento ${index + 1}`;
          return (
            <li key={id} className="rounded-md border border-egw-hairline bg-white">
              <div className="flex items-center gap-1 px-1.5 py-1">
                <button
                  type="button"
                  onClick={() => setOpenId(expanded ? null : id)}
                  aria-expanded={expanded}
                  className="flex min-w-0 flex-1 items-center gap-1 text-left text-[12.5px] font-semibold text-egw-ink"
                >
                  {expanded ? <ChevronDown className="h-3.5 w-3.5 shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0" />}
                  <span className="truncate">{title}</span>
                </button>
                {!context.readOnly ? (
                  <>
                    <button type="button" className="rounded p-1 text-egw-ink-62 hover:text-egw-ink" aria-label={`Sposta su ${title}`} onClick={() => move(index, -1)}>
                      <ArrowUp className="h-3.5 w-3.5" />
                    </button>
                    <button type="button" className="rounded p-1 text-egw-ink-62 hover:text-egw-ink" aria-label={`Sposta giu ${title}`} onClick={() => move(index, 1)}>
                      <ArrowDown className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      className="rounded p-1 text-egw-ink-62 hover:text-egw-red"
                      aria-label={`Togli ${title}`}
                      onClick={() => onChange(value.filter((_, position) => position !== index))}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </>
                ) : null}
              </div>
              {expanded ? (
                <div className="space-y-3 border-t border-egw-hairline p-2">
                  {control.fields
                    .filter((field) => controlVisible(field, item))
                    .map((field) => (
                      <ControlField
                        key={field.key}
                        control={field}
                        value={item[field.key]}
                        props={item}
                        context={context}
                        onChange={(fieldValue) => onChange(value.map((entry, position) => (position === index ? { ...entry, [field.key]: fieldValue } : entry)))}
                      />
                    ))}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
      {value.length < control.max && !context.readOnly ? (
        <Button
          size="xs"
          variant="secondary"
          icon={<Plus className="h-3.5 w-3.5" />}
          onClick={() => {
            const item = emptyListItem(control.fields);
            onChange([...value, item]);
            setOpenId(String(item.id));
          }}
        >
          {control.addLabel}
        </Button>
      ) : null}
    </div>
  );
}

export function ControlField({
  control,
  value,
  props,
  onChange,
  context,
}: {
  control: ControlDescriptor;
  value: unknown;
  props: Record<string, unknown>;
  onChange: (value: unknown) => void;
  context: ControlContext;
}) {
  const { readOnly, options } = context;
  const id = React.useId();
  const help = control.help;

  switch (control.type) {
    case "text":
      return (
        <Field label={control.label} htmlFor={id} helper={help}>
          <TextInput id={id} value={String(value ?? "")} maxLength={control.max} placeholder={control.placeholder} onChange={(event) => onChange(event.target.value)} disabled={readOnly} />
        </Field>
      );
    case "textarea":
      return (
        <Field label={control.label} htmlFor={id} helper={help}>
          <Textarea id={id} value={String(value ?? "")} maxLength={control.max} rows={control.rows || 3} onChange={(event) => onChange(event.target.value)} disabled={readOnly} />
        </Field>
      );
    case "richtext":
      return (
        <Field label={control.label} helper={help || "Il testo si ripulisce sul server: niente script, niente stili scritti a mano."}>
          {readOnly ? (
            <div className="rounded-md border border-egw-hairline p-2 text-[12.5px] text-egw-ink-62">Sola lettura</div>
          ) : (
            <RichTextEditor
              value={String(value ?? "")}
              onChange={(html) => onChange(html)}
              minHeight={140}
              sanitize={sanitizeWebsiteRichHtml}
              onUploadImage={uploadWebsiteInlineImage}
            />
          )}
        </Field>
      );
    case "number":
      return (
        <Field label={`${control.label}${control.unit ? ` (${control.unit})` : ""}`} htmlFor={id} helper={help}>
          <TextInput
            id={id}
            type="number"
            min={control.min}
            max={control.max}
            step={control.step || 1}
            value={value === null || value === undefined ? "" : String(value)}
            onChange={(event) => onChange(event.target.value === "" ? control.min : Number(event.target.value))}
            disabled={readOnly}
          />
        </Field>
      );
    case "toggle":
      return (
        <div className="flex items-start justify-between gap-3">
          <label htmlFor={id} className="text-[12.5px] font-semibold text-egw-ink-72">
            {control.label}
            {help ? <span className="block text-[11.5px] font-normal text-egw-ink-62">{help}</span> : null}
          </label>
          <Toggle id={id} checked={Boolean(value)} onCheckedChange={onChange} disabled={readOnly} aria-label={control.label} />
        </div>
      );
    case "select":
      return (
        <Field label={control.label} helper={help}>
          <Select
            value={toSelect(value)}
            onValueChange={(next) => onChange(fromSelect(next) ?? "")}
            options={control.options.map((option) => ({ value: toSelect(option.value), label: option.label }))}
            disabled={readOnly}
            aria-label={control.label}
          />
        </Field>
      );
    case "segmented":
      return (
        <Field label={control.label} helper={help}>
          <SegmentedControl
            mode="radio"
            size="sm"
            wrap
            value={String(value ?? "")}
            onChange={(next) => !readOnly && onChange(next)}
            options={control.options.map((option) => ({ value: option.value, label: option.label }))}
            aria-label={control.label}
          />
        </Field>
      );
    case "multi-select":
      return (
        <CheckboxList label={control.label} options={control.options} value={Array.isArray(value) ? (value as string[]) : []} onChange={onChange} disabled={readOnly} />
      );
    case "media":
      return <MediaField label={control.label} value={value as MediaRef | null} onChange={onChange} help={help} disabled={readOnly} />;
    case "media-list":
      return <MediaListField label={control.label} value={Array.isArray(value) ? (value as MediaRef[]) : []} onChange={onChange} max={control.max} />;
    case "link":
      return <LinkControl label={control.label} value={value as WebsiteLink} onChange={onChange} context={context} />;
    case "cta": {
      const cta = value && typeof value === "object" ? (value as { label?: string; link?: WebsiteLink }) : {};
      return (
        <div className="space-y-2">
          <Field label={`${control.label}: testo`} htmlFor={id} helper={help || "Vuoto = il bottone non compare."}>
            <TextInput id={id} value={cta.label || ""} maxLength={40} onChange={(event) => onChange({ ...cta, label: event.target.value })} disabled={readOnly} />
          </Field>
          <LinkControl label={`${control.label}: dove porta`} value={cta.link} onChange={(link) => onChange({ ...cta, link })} context={context} />
        </div>
      );
    }
    case "icon":
      return (
        <Field label={control.label} helper={help}>
          <Select
            value={toSelect(value)}
            onValueChange={(next) => onChange(fromSelect(next) ?? "")}
            options={[{ value: NONE, label: "Nessuna icona" }, ...ICON_KEYS.map((key) => ({ value: key, label: key }))]}
            disabled={readOnly}
            aria-label={control.label}
          />
        </Field>
      );
    case "embed-url":
      return (
        <Field label={control.label} htmlFor={id} helper={help || `Servizi ammessi: ${control.providers.join(", ")}. Il contenuto si carica solo dopo il consenso del visitatore.`}>
          <TextInput id={id} value={String(value ?? "")} inputMode="url" placeholder="https://" onChange={(event) => onChange(event.target.value)} disabled={readOnly} />
        </Field>
      );
    case "list":
      return (
        <ListControl
          control={control}
          value={Array.isArray(value) ? (value as Array<Record<string, unknown>>) : []}
          onChange={onChange}
          context={context}
        />
      );
    case "team": {
      const choices = [
        ...(control.allowAll ? [{ value: NONE, label: "Tutte le squadre" }] : [{ value: NONE, label: "Scegli una squadra" }]),
        ...(control.allowContext ? [{ value: "context", label: "La squadra della pagina (nei dettagli squadra)" }] : []),
        ...(options?.teams || []).map((team) => ({ value: team.id, label: team.name })),
      ];
      return (
        <Field label={control.label} helper={help || (!options?.teams.length ? "Crea le squadre stabili in Categorie → Squadre stabili." : undefined)}>
          <Select value={toSelect(value)} onValueChange={(next) => onChange(fromSelect(next))} options={choices} disabled={readOnly} aria-label={control.label} />
        </Field>
      );
    }
    case "season":
      return (
        <Field label={control.label} helper={help}>
          <Select
            value={toSelect(value ?? "active")}
            onValueChange={(next) => onChange(fromSelect(next) ?? "active")}
            options={[{ value: "active", label: "La stagione attiva" }, ...(options?.seasons || []).map((season) => ({ value: season.id, label: season.label }))]}
            disabled={readOnly}
            aria-label={control.label}
          />
        </Field>
      );
    case "competition":
      return (
        <Field label={control.label} helper={help}>
          <Select
            value={toSelect(value)}
            onValueChange={(next) => onChange(fromSelect(next))}
            options={[
              { value: NONE, label: "Tutte" },
              ...(control.allowContext ? [{ value: "context", label: "La competizione della pagina" }] : []),
              ...(options?.competitions || []).map((competition) => ({ value: competition.id, label: competition.name })),
            ]}
            disabled={readOnly}
            aria-label={control.label}
          />
        </Field>
      );
    case "person":
      return (
        <Field label={control.label} helper={help || "Compaiono solo le persone pubblicate in Sito web → Persone."}>
          <Select
            value={toSelect(value)}
            onValueChange={(next) => onChange(fromSelect(next))}
            options={[
              { value: NONE, label: "Scegli una persona" },
              ...(control.allowContext ? [{ value: "context", label: "La persona della pagina" }] : []),
              ...(options?.people || [])
                .filter((person) => !control.personKind || person.kind === control.personKind)
                .map((person) => ({ value: person.id, label: person.label })),
            ]}
            disabled={readOnly}
            aria-label={control.label}
          />
        </Field>
      );
    case "sponsor-tier":
      return (
        <Field label={control.label} helper={help}>
          <Select
            value={toSelect(value)}
            onValueChange={(next) => onChange(fromSelect(next) ?? "")}
            options={[{ value: NONE, label: "Tutti i livelli" }, ...(options?.sponsorTiers || []).map((tier) => ({ value: tier.key, label: tier.label }))]}
            disabled={readOnly}
            aria-label={control.label}
          />
        </Field>
      );
    case "article-category":
      return (
        <Field label={control.label} helper={help}>
          <Select
            value={toSelect(value)}
            onValueChange={(next) => onChange(fromSelect(next) ?? "")}
            options={[{ value: NONE, label: "Tutte le categorie" }, ...(options?.articleCategories || []).map((category) => ({ value: category.slug, label: category.label }))]}
            disabled={readOnly}
            aria-label={control.label}
          />
        </Field>
      );
    case "form":
      return (
        <Field label={control.label} helper={help || (!options?.forms.length ? "Nessun modulo pubblicato con link pubblico: crealo in Moduli online." : undefined)}>
          <Select
            value={toSelect(value)}
            onValueChange={(next) => onChange(fromSelect(next) ?? "")}
            options={[{ value: NONE, label: "Nessun modulo" }, ...(options?.forms || []).map((form) => ({ value: form.slug, label: form.title }))]}
            disabled={readOnly}
            aria-label={control.label}
          />
        </Field>
      );
    case "form-list":
      return (
        <CheckboxList
          label={control.label}
          options={(options?.forms || []).map((form) => ({ value: form.slug, label: form.title }))}
          value={Array.isArray(value) ? (value as string[]) : []}
          onChange={onChange}
          disabled={readOnly}
        />
      );
    case "stat-keys":
      return (
        <CheckboxList
          label={`${control.label} (${options?.sport.label || "sport del club"})`}
          options={(options?.sport.stats || []).map((stat) => ({ value: stat.key, label: stat.label }))}
          value={Array.isArray(value) ? (value as string[]) : []}
          onChange={onChange}
          disabled={readOnly}
        />
      );
    default: {
      const exhaustive: never = control;
      return exhaustive;
    }
  }
}
