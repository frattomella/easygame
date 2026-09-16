"use client";

import * as React from "react";
import { Pencil } from "lucide-react";
import { DetailCard } from "@/components/web/page/Cards";
import { Button } from "@/components/web/primitives/Button";
import { DataChip, StatusPill } from "@/components/web/primitives/StatusPill";
import { IdentityTile } from "@/components/web/primitives/Identity";
import { InsetBlock, Eyebrow } from "@/components/web/primitives/Surface";
import { Field, FormGrid, Select } from "@/components/web/forms/Field";
import { CategoryLabel } from "@/components/categories/category-label";
import { buildCategoryDisplayIndex } from "@/lib/categories/display";
import type { CategoryGroupLike } from "@/lib/categories/display";
import { isMultiSiteClub, type ClubSite } from "@/lib/club-sites";
import {
  assignmentStatusLabels,
  type ClothingAssignment,
  type ClothingAssignmentStatus,
} from "@/lib/clothing-inventory-utils";
import { formatDateShort, joinMeta } from "@/lib/web/format";
import { ATHLETE_RECORD_SECTIONS } from "@/lib/athlete-profile-tabs";
import {
  RecordRowList,
  RecordSection,
  clothingAssignmentStatus,
} from "./record-primitives";

/**
 * Le sezioni dell'area **Attività sportiva**: categorie e sede, taglie e
 * numero di maglia, numeri assegnati, assegnazioni kit. Le analitiche
 * (presenze e convocazioni) restano il componente condiviso
 * `AthleteCategoryAnalyticsSection`, montato dalla pagina.
 */

type MembershipLike = {
  categoryId: string | null;
  categoryName: string;
  isPrimary: boolean;
  siteId?: string | null;
};

/* ── Categorie e sede ──────────────────────────────────────────────────── */
export function AthleteCategoriesCard({
  memberships,
  categoryCatalog,
  categoryGroups,
  sites,
  onEdit,
}: {
  memberships: MembershipLike[];
  categoryCatalog: readonly { id?: string | null; name?: string | null }[];
  categoryGroups: readonly CategoryGroupLike[];
  sites: ClubSite[];
  onEdit: () => void;
}) {
  const primary = memberships.find((membership) => membership.isPrimary) || null;
  const secondary = memberships.filter((membership) => !membership.isPrimary);
  const siteName = primary?.siteId
    ? sites.find((site) => String(site.id) === String(primary.siteId))?.name || null
    : null;
  /* Un indice per la card, non uno per chip (D-RD-17 d): le due sorgenti sono le stesse per ogni riga. */
  const categoryDisplay = React.useMemo(
    () => buildCategoryDisplayIndex({ categories: categoryCatalog, groups: categoryGroups, sites }),
    [categoryCatalog, categoryGroups, sites],
  );
  const label = (membership: MembershipLike) => (
    <CategoryLabel
      category={{ categoryId: membership.categoryId, categoryName: membership.categoryName }}
      index={categoryDisplay}
    />
  );

  return (
    <div id={ATHLETE_RECORD_SECTIONS.categorie} className="scroll-mt-24">
      <DetailCard
        eyebrow="Attività sportiva"
        title="Categorie e gruppi"
        onEdit={onEdit}
        fields={[
          {
            label: "Categoria primaria",
            value: primary ? <DataChip tone="blue" size="sm">{label(primary)}</DataChip> : null,
          },
          ...(isMultiSiteClub(sites)
            ? [{ label: "Sede", value: siteName }]
            : []),
          {
            label: "Categorie secondarie",
            wide: true,
            value: secondary.length ? (
              <span className="flex flex-wrap gap-1.5">
                {secondary.map((membership) => (
                  <DataChip key={`secondary-${membership.categoryId}`} size="sm">
                    {label(membership)}
                  </DataChip>
                ))}
              </span>
            ) : null,
          },
        ]}
      />
    </div>
  );
}

/* ── Taglie e numero maglia ────────────────────────────────────────────── */
export type ClothingSizesLike = {
  profile?: string;
  shirtSize?: string;
  pantsSize?: string;
  shoeSize?: string;
};

export function AthleteClothingPanel({
  sizes,
  activeProfile,
  options,
  onChangeSizes,
  onSaveSizes,
  jersey,
  onEditJersey,
}: {
  sizes: ClothingSizesLike;
  activeProfile: string;
  options: { shirt: readonly string[]; pants: readonly string[]; shoes: readonly string[] };
  onChangeSizes: (next: ClothingSizesLike) => void;
  onSaveSizes: () => void;
  jersey: {
    value: number | string | null;
    groupName: string;
    summary: string;
    hasDuplicate: boolean;
    randomSuggestion: number | null;
  };
  onEditJersey: () => void;
}) {
  const toOptions = (values: readonly string[]) => values.map((value) => ({ value, label: value }));
  return (
    <RecordSection
      id={ATHLETE_RECORD_SECTIONS.abbigliamento}
      eyebrow="Abbigliamento"
      title="Taglie e numero maglia"
      actions={
        <Button variant="secondary" size="sm" onClick={onSaveSizes}>
          Salva taglie
        </Button>
      }
    >
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_240px]">
        <FormGrid columns={2}>
          <Field label="Profilo taglie" htmlFor="athlete-clothing-profile">
            <Select
              id="athlete-clothing-profile"
              value={activeProfile}
              onValueChange={(value) => onChangeSizes({ ...sizes, profile: value, shirtSize: "", pantsSize: "", shoeSize: "" })}
              options={["BAMBINO", "BAMBINA", "UOMO", "DONNA"].map((value) => ({ value, label: value }))}
              placeholder="Seleziona profilo"
            />
          </Field>
          <Field label="Taglia maglietta" htmlFor="athlete-clothing-shirt">
            <Select id="athlete-clothing-shirt" value={sizes.shirtSize || ""} onValueChange={(v) => onChangeSizes({ ...sizes, shirtSize: v })} options={toOptions(options.shirt)} />
          </Field>
          <Field label="Taglia pantaloni" htmlFor="athlete-clothing-pants">
            <Select id="athlete-clothing-pants" value={sizes.pantsSize || ""} onValueChange={(v) => onChangeSizes({ ...sizes, pantsSize: v })} options={toOptions(options.pants)} />
          </Field>
          <Field label="Taglia scarpe" htmlFor="athlete-clothing-shoes">
            <Select id="athlete-clothing-shoes" value={sizes.shoeSize || ""} onValueChange={(v) => onChangeSizes({ ...sizes, shoeSize: v })} options={toOptions(options.shoes)} />
          </Field>
        </FormGrid>

        <InsetBlock className="flex flex-col gap-3">
          <Eyebrow>Numero maglia</Eyebrow>
          <div className="flex items-center gap-3">
            <IdentityTile number={jersey.value} name="Numero maglia" size={56} radius="panel-sm" />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap gap-1.5">
                <DataChip size="sm">{jersey.groupName}</DataChip>
                {jersey.hasDuplicate ? <DataChip tone="amber" size="sm">Duplicato</DataChip> : null}
                {jersey.randomSuggestion !== null ? <DataChip tone="blue" size="sm">Random: {jersey.randomSuggestion}</DataChip> : null}
              </div>
              <p className="mt-1.5 font-brand text-[11.5px] text-egw-ink-62">{jersey.summary}</p>
            </div>
          </div>
          <Button variant="secondary" size="sm" icon={<Pencil />} onClick={onEditJersey} aria-label="Modifica numero maglia">
            Modifica numero
          </Button>
        </InsetBlock>
      </div>
    </RecordSection>
  );
}

/* ── Numeri assegnati ──────────────────────────────────────────────────── */
export type JerseyRecordLike = {
  id?: string | null;
  groupId?: string | null;
  number: number | null;
  source?: string | null;
};

export function AthleteJerseyNumbersList({
  records,
  groupById,
  duplicateIds,
  randomSuggestion,
}: {
  records: JerseyRecordLike[];
  groupById: Map<string, { name?: string | null; season?: string | null }>;
  duplicateIds: Set<string>;
  randomSuggestion: number | null;
}) {
  const rows = records.filter((entry) => entry.number !== null);
  return (
    <RecordRowList
      aria-label="Numeri assegnati"
      rows={rows.map((entry) => {
        const group = entry.groupId ? groupById.get(entry.groupId) : null;
        const key = String(entry.id || `${entry.groupId}:${entry.number}`);
        return {
          id: key,
          title: (
            <span className="flex items-center gap-2">
              <IdentityTile number={entry.number} size={28} />
              {group?.name || "Senza gruppo"}
            </span>
          ),
          meta: group?.season || "Numero legato al gruppo",
          status: (
            <span className="flex flex-wrap gap-1.5">
              <DataChip size="sm">{entry.source === "clothing_assignment" ? "Da assegnazione kit" : "Manuale"}</DataChip>
              {duplicateIds.has(key) ? <DataChip tone="amber" size="sm">Duplicato</DataChip> : null}
            </span>
          ),
        };
      })}
      empty={
        <>
          Nessun numero assegnato a gruppi numerazione.
          {randomSuggestion !== null ? (
            <span className="mt-1 block">
              Numero random disponibile: <strong className="egw-num">{randomSuggestion}</strong>
            </span>
          ) : null}
        </>
      }
    />
  );
}

/* ── Assegnazioni kit ──────────────────────────────────────────────────── */
const SOURCE_LABELS: Record<string, string> = {
  inventory: "Magazzino",
  supplier_order: "Fornitore",
};

export function AthleteKitAssignmentsList({
  assignments,
  onUpdateStatus,
}: {
  assignments: ClothingAssignment[];
  onUpdateStatus: (assignment: ClothingAssignment, next: ClothingAssignmentStatus) => void;
}) {
  return (
    <RecordRowList
      aria-label="Assegnazioni kit"
      rows={assignments.map((assignment) => ({
        id: assignment.id,
        title: assignment.kitName || "Articoli",
        meta: joinMeta(formatDateShort(assignment.createdAt), SOURCE_LABELS[assignment.source] || "Manuale", assignment.notes || null),
        detail: (assignment.items || []).length ? (
          <span className="flex flex-wrap gap-1.5">
            {(assignment.items || []).map((item) => (
              <DataChip key={item.id} size="sm" title={item.name}>
                {joinMeta(item.name, item.size, item.color, item.variant, item.number !== null && item.number !== undefined ? `n. ${item.number}` : null)}
              </DataChip>
            ))}
          </span>
        ) : null,
        status: <StatusPill status={clothingAssignmentStatus(assignment.status, assignmentStatusLabels[assignment.status])} size="sm" />,
        actions: (
          <>
            {assignment.status !== "delivered" && assignment.status !== "cancelled" ? (
              <Button variant="row" size="xs" onClick={() => onUpdateStatus(assignment, "delivered")}>
                Consegnato
              </Button>
            ) : null}
            {assignment.status !== "cancelled" ? (
              <Button variant="row" size="xs" onClick={() => onUpdateStatus(assignment, "cancelled")}>
                Annulla
              </Button>
            ) : null}
          </>
        ),
      }))}
      empty="Nessuna assegnazione registrata"
    />
  );
}
