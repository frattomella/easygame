"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { Drawer, DrawerSection } from "@/components/web/overlays/Drawer";
import { Button } from "@/components/web/primitives/Button";
import { SegmentedControl, Skeleton } from "@/components/web/primitives/Controls";
import { InsetBlock } from "@/components/web/primitives/Surface";
import { Field, FieldSizeProvider, Select, TextInput, Textarea } from "@/components/web/forms/Field";
import type { KitComponent } from "@/components/forms/CustomKitComponentsBuilder";
import { buildAthleteKitBuilderComponents } from "@/lib/athlete-profile-fields";

/**
 * I cassetti dell'area Attività sportiva: il numero di maglia (sincronizzato
 * con la pagina Abbigliamento) e una nuova assegnazione di kit. Il costruttore
 * dei componenti e quello condiviso con la pagina Abbigliamento, caricato a
 * richiesta come nella V1.
 */

const CustomKitComponentsBuilder = dynamic(
  () => import("@/components/forms/CustomKitComponentsBuilder").then((module) => module.CustomKitComponentsBuilder),
  { ssr: false, loading: () => <Skeleton className="h-48 w-full" /> },
);

/* ── Numero maglia ─────────────────────────────────────────────────────── */
/**
 * **Il gruppo non si sceglie qui** (mandato multi-stagione B8/B9/B10): lo
 * dice la categoria primaria (`resolveNumberingGroupForCategory`), e questo
 * cassetto lo mostra soltanto. Un editor libero permetteva di assegnare
 * l'atleta a un gruppo che la sua categoria non nomina — la stessa
 * incoerenza che il numero, da solo, non puo correggere.
 */
export function AthleteJerseyNumberDrawer({
  open,
  onOpenChange,
  groupId,
  groupName,
  number,
  onNumberChange,
  onRandom,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Il gruppo derivato dalla categoria primaria, o "" se nessuno la nomina. */
  groupId: string;
  /** Il nome del gruppo derivato, o `null` se la categoria primaria non ne ha uno configurato. */
  groupName: string | null;
  number: string;
  onNumberChange: (value: string) => void;
  onRandom: () => void;
  onSave: () => void | Promise<void>;
}) {
  const [dirty, setDirty] = React.useState(false);
  React.useEffect(() => {
    if (!open) setDirty(false);
  }, [open]);
  const canSave = Boolean(groupId) || !number;

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      width="default"
      eyebrow="Abbigliamento"
      title="Numero maglia"
      description="Il numero viene sincronizzato con la pagina Abbigliamento. Eventuali duplicati nel gruppo vengono segnalati nella scheda."
      dirty={dirty}
      footer={
        <>
          <Button variant="primary" onClick={() => void onSave()} disabled={!canSave}>
            Salva
          </Button>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Annulla
          </Button>
        </>
      }
    >
      <FieldSizeProvider size="sm">
        <div className="flex flex-col gap-5">
          <Field
            label="Gruppo numerazione"
            htmlFor="jersey-group"
            helper={groupName ? "Assegnato automaticamente dalla categoria primaria" : undefined}
            warning={!groupName ? "Nessun gruppo numerazione configurato per questa categoria." : undefined}
          >
            <TextInput id="jersey-group" value={groupName || ""} disabled readOnly />
          </Field>
          <Field label="Numero" htmlFor="jersey-number" helper="Al massimo tre cifre. Il numero deve essere libero nel gruppo.">
            <div className="flex items-center gap-2">
              <TextInput
                id="jersey-number"
                numeric
                inputMode="numeric"
                placeholder="Es. 7, 23, 101"
                value={number}
                wrapperClassName="max-w-[12ch]"
                className="max-w-[12ch]"
                onChange={(event) => {
                  setDirty(true);
                  onNumberChange(event.target.value);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void onSave();
                }}
              />
              <Button variant="secondary" size="sm" onClick={onRandom} disabled={!groupId}>
                Random
              </Button>
            </div>
          </Field>
        </div>
      </FieldSizeProvider>
    </Drawer>
  );
}

/* ── Nuova assegnazione kit ────────────────────────────────────────────── */
export type KitAssignmentDraft = {
  assignmentType: "kit" | "components" | string;
  kitId: string;
  components: KitComponent[];
  notes: string;
};

export function AthleteKitAssignmentDrawer({
  open,
  onOpenChange,
  draft,
  setDraft,
  kits,
  availableSizes,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  draft: KitAssignmentDraft;
  setDraft: React.Dispatch<React.SetStateAction<KitAssignmentDraft>>;
  kits: ReadonlyArray<{ id: string; name: string; components?: any[] }>;
  availableSizes: string[];
  onConfirm: () => void | Promise<void>;
}) {
  const [dirty, setDirty] = React.useState(false);
  React.useEffect(() => {
    if (!open) setDirty(false);
  }, [open]);
  const patch = (changes: Partial<KitAssignmentDraft>) => {
    setDirty(true);
    setDraft((current) => ({ ...current, ...changes }));
  };
  const selectedKit = kits.find((kit) => kit.id === draft.kitId) || null;
  const canConfirm = draft.assignmentType === "kit" ? Boolean(draft.kitId) : (draft.components || []).length > 0;

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      width="wide"
      eyebrow="Abbigliamento"
      title="Nuova assegnazione"
      dirty={dirty}
      footer={
        <>
          <Button variant="primary" onClick={() => void onConfirm()} disabled={!canConfirm}>
            Conferma
          </Button>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Annulla
          </Button>
        </>
      }
    >
      <FieldSizeProvider size="sm">
        <DrawerSection eyebrow="Tipo assegnazione">
          <SegmentedControl
            aria-label="Tipo assegnazione"
            value={draft.assignmentType === "components" ? "components" : "kit"}
            onChange={(value) => patch({ assignmentType: value })}
            options={[
              { value: "kit", label: "Kit completo" },
              { value: "components", label: "Componenti singoli" },
            ]}
          />
        </DrawerSection>

        {draft.assignmentType === "kit" ? (
          <DrawerSection eyebrow="Kit">
            <div className="flex flex-col gap-5">
              <Field label="Seleziona kit" htmlFor="kit-assignment-kit">
                <Select
                  id="kit-assignment-kit"
                  value={draft.kitId}
                  onValueChange={(value) => {
                    const kit = kits.find((entry) => entry.id === value);
                    patch({ kitId: value, components: buildAthleteKitBuilderComponents(kit?.components || []) });
                  }}
                  placeholder="Seleziona kit"
                  options={kits.map((kit) => ({ value: kit.id, label: kit.name }))}
                />
              </Field>
              {draft.kitId ? (
                <Field label="Dettaglio assegnazione">
                  <InsetBlock>
                    <CustomKitComponentsBuilder
                      value={draft.components}
                      onChange={(components) => patch({ components })}
                      defaultComponents={buildAthleteKitBuilderComponents(selectedKit?.components || [])}
                      availableSizes={availableSizes}
                    />
                  </InsetBlock>
                </Field>
              ) : null}
            </div>
          </DrawerSection>
        ) : (
          <DrawerSection eyebrow="Componenti singoli">
            <Field label="Componenti" helper="Durante l'assegnazione puoi definire taglie e numero maglia del singolo atleta.">
              <InsetBlock>
                <CustomKitComponentsBuilder value={draft.components} onChange={(components) => patch({ components })} availableSizes={availableSizes} />
              </InsetBlock>
            </Field>
          </DrawerSection>
        )}

        <DrawerSection eyebrow="Note">
          <Field label="Note" htmlFor="kit-assignment-notes">
            <Textarea id="kit-assignment-notes" value={draft.notes} onChange={(event) => patch({ notes: event.target.value })} />
          </Field>
        </DrawerSection>
      </FieldSizeProvider>
    </Drawer>
  );
}
