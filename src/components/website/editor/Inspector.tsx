"use client";

import * as React from "react";
import { AlertTriangle, Copy, MousePointerClick, Trash2 } from "lucide-react";
import { getBlockDefinition, normalizeBlockProps } from "@/lib/website/registry";
import {
  duplicateBlock,
  duplicateSection,
  findSection,
  locateBlock,
  removeBlock,
  removeSection,
  toggleBlockVisibility,
  toggleSectionVisibility,
  updateBlockProps,
  updateBlockStyle,
  updateSection,
  updateSectionStyle,
} from "@/lib/website/document/operations";
import { SECTION_LAYOUTS, WEBSITE_DEVICES, type SectionLayout, type WebsiteDevice, type WebsitePageDocument } from "@/lib/website/document/types";
import type { EditorTarget } from "@/lib/website/editor-protocol";
import type { PublishIssueDto } from "@/lib/website/client";
import { Field, Select } from "@/components/web/forms/Field";
import { SegmentedControl, Toggle } from "@/components/web/primitives/Controls";
import { Button } from "@/components/web/primitives/Button";
import { blockIcon } from "./block-icons";
import { ControlField, controlVisible, type ControlContext } from "./ControlField";
import { SECTION_STYLE, SectionIdentityFields, StyleEditor } from "./StyleEditor";
import { SECTION_LAYOUT_LABELS } from "./LayersPanel";

/**
 * **L'inspector**: cio che si puo cambiare dell'elemento selezionato.
 *
 * Per un blocco legge i controlli dalla definizione del registry e li divide
 * in contenuto, dati e aspetto; per una sezione mostra layout, nome, ancora e
 * stile. Ogni modifica passa da un'operazione pura del documento, con una
 * chiave di cronologia per campo: digitare un titolo e un passo solo.
 */

type Tab = "content" | "data" | "style" | "visibility";

const DEVICE_LABELS: Record<WebsiteDevice, string> = { desktop: "Desktop", tablet: "Tablet", mobile: "Mobile" };

export function Inspector({
  doc,
  selection,
  device,
  issues,
  context,
  onChange,
  onSelect,
}: {
  doc: WebsitePageDocument;
  selection: EditorTarget | null;
  device: WebsiteDevice;
  issues: PublishIssueDto[];
  context: ControlContext;
  onChange: (fn: (doc: WebsitePageDocument) => WebsitePageDocument, key?: string) => void;
  onSelect: (target: EditorTarget | null) => void;
}) {
  const [tab, setTab] = React.useState<Tab>("content");
  const readOnly = context.readOnly;

  React.useEffect(() => {
    setTab("content");
  }, [selection?.id]);

  if (!selection) {
    return (
      <div className="space-y-4 p-4">
        <div className="rounded-lg border border-dashed border-egw-hairline p-4 text-center text-[12.5px] text-egw-ink-62">
          <MousePointerClick className="mx-auto mb-2 h-5 w-5" aria-hidden="true" />
          Clicca un blocco nell&apos;anteprima o nella struttura per modificarlo. Con Alt+clic selezioni la sezione intera.
        </div>
        <IssueList issues={issues} onSelect={onSelect} />
      </div>
    );
  }

  if (selection.kind === "section") {
    const section = findSection(doc, selection.id);
    if (!section) return <p className="p-4 text-[12.5px] text-egw-ink-62">La sezione non esiste piu.</p>;
    const sectionIssues = issues.filter((issue) => issue.sectionId === section.id && !issue.blockId);
    return (
      <div className="p-4">
        <InspectorHeader
          title={section.label || "Sezione"}
          subtitle={SECTION_LAYOUT_LABELS[section.layout]}
          readOnly={readOnly}
          onDuplicate={() => {
            let newId: string | null = null;
            onChange((d) => {
              const result = duplicateSection(d, section.id);
              newId = result.newId;
              return result.doc;
            });
            if (newId) onSelect({ kind: "section", id: newId });
          }}
          onDelete={() => {
            onChange((d) => removeSection(d, section.id));
            onSelect(null);
          }}
        />
        <IssueList issues={sectionIssues} onSelect={onSelect} />
        <SegmentedControl
          className="mt-3"
          size="sm"
          value={tab === "data" ? "content" : tab}
          onChange={setTab}
          options={[
            { value: "content", label: "Layout" },
            { value: "style", label: "Stile" },
            { value: "visibility", label: "Visibilita" },
          ]}
          aria-label="Sezioni dell'inspector"
        />
        <div className="mt-4 space-y-4">
          {tab === "content" || tab === "data" ? (
            <>
              <Field label="Colonne" helper="Togliendo colonne i blocchi non si perdono: passano nell'ultima colonna che resta.">
                <Select
                  value={section.layout}
                  onValueChange={(layout) => onChange((d) => updateSection(d, section.id, { layout: layout as SectionLayout }))}
                  options={SECTION_LAYOUTS.map((layout) => ({ value: layout, label: SECTION_LAYOUT_LABELS[layout] }))}
                  disabled={readOnly}
                  aria-label="Layout della sezione"
                />
              </Field>
              <SectionIdentityFields
                label={section.label || ""}
                anchor={section.anchor || ""}
                readOnly={readOnly}
                onChange={(patch) => onChange((d) => updateSection(d, section.id, patch), `section:${section.id}:${Object.keys(patch)[0]}`)}
              />
            </>
          ) : null}
          {tab === "style" ? (
            <StyleEditor
              style={section.style}
              device={device}
              responsiveKeys={SECTION_STYLE.responsive}
              staticKeys={SECTION_STYLE.static}
              columnCount={section.columns.length}
              readOnly={readOnly}
              onChange={(style, key) => onChange((d) => updateSectionStyle(d, section.id, () => style), `section:${section.id}:${key}`)}
            />
          ) : null}
          {tab === "visibility" ? (
            <VisibilityEditor
              hidden={section.hidden}
              readOnly={readOnly}
              onToggle={(target) => onChange((d) => toggleSectionVisibility(d, section.id, target))}
            />
          ) : null}
        </div>
      </div>
    );
  }

  const location = locateBlock(doc, selection.id);
  if (!location) return <p className="p-4 text-[12.5px] text-egw-ink-62">Il blocco non esiste piu.</p>;
  const block = location.block;
  const definition = getBlockDefinition(block.type);
  if (!definition) {
    return (
      <div className="space-y-3 p-4">
        <p className="text-[12.5px] text-egw-red">Questo blocco ({block.type}) non e piu disponibile e non compare sul sito.</p>
        {!readOnly ? (
          <Button variant="danger" size="sm" icon={<Trash2 className="h-4 w-4" />} onClick={() => onChange((d) => removeBlock(d, block.id))}>
            Elimina il blocco
          </Button>
        ) : null}
      </div>
    );
  }
  const Icon = blockIcon(definition.icon);
  const props = { ...(normalizeBlockProps(block) || {}), ...block.props };
  const visible = definition.controls.filter((control) => controlVisible(control, props));
  const contentControls = visible.filter((control) => (control.group || "content") !== "data" && control.group !== "display");
  const dataControls = visible.filter((control) => control.group === "data");
  const displayControls = visible.filter((control) => control.group === "display");
  const blockIssues = issues.filter((issue) => issue.blockId === block.id);
  const hasStyle = definition.style.responsive.length > 0 || definition.style.static.length > 0;

  const tabs: Array<{ value: Tab; label: string }> = [
    { value: "content", label: "Contenuto" },
    ...(dataControls.length ? [{ value: "data" as Tab, label: "Dati" }] : []),
    { value: "style", label: "Stile" },
    { value: "visibility", label: "Visibilita" },
  ];

  const renderControls = (controls: typeof visible) =>
    controls.map((control) => (
      <ControlField
        key={control.key}
        control={control}
        value={props[control.key]}
        props={props}
        context={context}
        onChange={(value) => onChange((d) => updateBlockProps(d, block.id, { [control.key]: value }), `block:${block.id}:${control.key}`)}
      />
    ));

  return (
    <div className="p-4">
      <InspectorHeader
        title={definition.label}
        subtitle={definition.description}
        icon={<Icon className="h-4 w-4" aria-hidden="true" />}
        readOnly={readOnly}
        onDuplicate={() => {
          let newId: string | null = null;
          onChange((d) => {
            const result = duplicateBlock(d, block.id);
            newId = result.newId;
            return result.doc;
          });
          if (newId) onSelect({ kind: "block", id: newId });
        }}
        onDelete={() => {
          onChange((d) => removeBlock(d, block.id));
          onSelect(null);
        }}
      />
      <IssueList issues={blockIssues} onSelect={onSelect} />
      <button type="button" className="mt-2 text-[11.5px] font-semibold text-egw-blue-700 underline" onClick={() => onSelect({ kind: "section", id: location.section.id })}>
        Seleziona la sezione che lo contiene
      </button>
      <SegmentedControl className="mt-3" size="sm" wrap value={tabs.some((item) => item.value === tab) ? tab : "content"} onChange={setTab} options={tabs} aria-label="Sezioni dell'inspector" />
      <div className="mt-4 space-y-4">
        {tab === "content" ? (
          <>
            {renderControls(contentControls)}
            {displayControls.length ? (
              <div className="space-y-4 border-t border-egw-hairline pt-4">
                <h3 className="text-[12px] font-semibold uppercase tracking-wide text-egw-ink-42">Come si presenta</h3>
                {renderControls(displayControls)}
              </div>
            ) : null}
            {!contentControls.length && !displayControls.length ? <p className="text-[12.5px] text-egw-ink-62">Questo blocco non ha testi da scrivere.</p> : null}
          </>
        ) : null}
        {tab === "data" ? (
          <>
            <p className="text-[11.5px] text-egw-ink-62">I dati arrivano dal gestionale e si aggiornano da soli: qui scegli quali mostrare.</p>
            {renderControls(dataControls)}
          </>
        ) : null}
        {tab === "style" ? (
          hasStyle ? (
            <StyleEditor
              style={block.style}
              device={device}
              responsiveKeys={definition.style.responsive}
              staticKeys={definition.style.static}
              defaults={definition.style.defaults}
              readOnly={readOnly}
              onChange={(style, key) => onChange((d) => updateBlockStyle(d, block.id, () => style), `block:${block.id}:${key}`)}
            />
          ) : (
            <p className="text-[12.5px] text-egw-ink-62">Lo stile di questo blocco segue il tema e la sezione.</p>
          )
        ) : null}
        {tab === "visibility" ? (
          <VisibilityEditor hidden={block.hidden} readOnly={readOnly} onToggle={(target) => onChange((d) => toggleBlockVisibility(d, block.id, target))} />
        ) : null}
      </div>
    </div>
  );
}

function InspectorHeader({
  title,
  subtitle,
  icon,
  onDuplicate,
  onDelete,
  readOnly,
}: {
  title: string;
  subtitle: string;
  icon?: React.ReactNode;
  onDuplicate: () => void;
  onDelete: () => void;
  readOnly: boolean;
}) {
  return (
    <div className="flex items-start gap-2">
      {icon ? <span className="mt-0.5 rounded-md bg-egw-tint-blue p-1.5 text-egw-blue-700">{icon}</span> : null}
      <div className="min-w-0 flex-1">
        <h2 className="truncate text-[14px] font-semibold text-egw-ink">{title}</h2>
        <p className="text-[11.5px] leading-snug text-egw-ink-62">{subtitle}</p>
      </div>
      {!readOnly ? (
        <div className="flex shrink-0 gap-1">
          <button type="button" onClick={onDuplicate} className="rounded p-1.5 text-egw-ink-62 hover:bg-egw-page-100 hover:text-egw-ink" aria-label="Duplica" title="Duplica (Ctrl+D)">
            <Copy className="h-4 w-4" />
          </button>
          <button type="button" onClick={onDelete} className="rounded p-1.5 text-egw-ink-62 hover:bg-egw-tint-red hover:text-egw-red" aria-label="Elimina" title="Elimina (Canc)">
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ) : null}
    </div>
  );
}

function VisibilityEditor({
  hidden,
  onToggle,
  readOnly,
}: {
  hidden: Partial<Record<WebsiteDevice, boolean>> | undefined;
  onToggle: (device?: WebsiteDevice) => void;
  readOnly: boolean;
}) {
  return (
    <div className="space-y-3">
      <p className="text-[11.5px] text-egw-ink-62">
        Un elemento nascosto su tutti i dispositivi resta nella bozza ma non arriva al sito pubblicato: e il modo di metterlo da parte senza cancellarlo.
      </p>
      {WEBSITE_DEVICES.map((device) => (
        <div key={device} className="flex items-center justify-between">
          <span className="text-[12.5px] font-semibold text-egw-ink-72">Visibile su {DEVICE_LABELS[device]}</span>
          <Toggle checked={!hidden?.[device]} onCheckedChange={() => onToggle(device)} disabled={readOnly} aria-label={`Visibile su ${DEVICE_LABELS[device]}`} />
        </div>
      ))}
    </div>
  );
}

function IssueList({ issues, onSelect }: { issues: PublishIssueDto[]; onSelect: (target: EditorTarget | null) => void }) {
  if (!issues.length) return null;
  return (
    <ul className="mt-3 space-y-1.5" aria-label="Da sistemare prima di pubblicare">
      {issues.map((issue, index) => (
        <li
          key={`${issue.message}-${index}`}
          className={`flex items-start gap-2 rounded-md px-2 py-1.5 text-[12px] ${issue.level === "error" ? "bg-egw-tint-red text-egw-red" : "bg-egw-tint-amber text-egw-amber-ink"}`}
        >
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {issue.blockId || issue.sectionId ? (
            <button
              type="button"
              className="text-left underline-offset-2 hover:underline"
              onClick={() => onSelect(issue.blockId ? { kind: "block", id: issue.blockId } : { kind: "section", id: issue.sectionId as string })}
            >
              {issue.message}
            </button>
          ) : (
            <span>{issue.message}</span>
          )}
        </li>
      ))}
    </ul>
  );
}
