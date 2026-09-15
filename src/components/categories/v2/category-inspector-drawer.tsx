"use client";

import * as React from "react";
import { BarChart3, Pencil, Users } from "lucide-react";
import { Drawer } from "@/components/web/overlays/Drawer";
import { Button } from "@/components/web/primitives/Button";
import { DataChip } from "@/components/web/primitives/StatusPill";
import { InsetBlock } from "@/components/web/primitives/Surface";
import { InfoCard } from "@/components/web/page/Cards";
import { formatInteger, MISSING } from "@/lib/web/format";
import { CategoryColorDot } from "@/components/categories/v2/category-editor-drawer";
import type { CategoryRow } from "@/components/categories/v2/category-grid-model";

/**
 * L'ispettore di una categoria (guideline 09 §9.3, «inspector summary
 * block»): il cassetto 392 che sostituisce la modale «Info» della V1
 * (`CategoryDetailsDialog`) con le **stesse informazioni** — nome, sport,
 * anni di nascita, atleti iscritti, allenatori, allenamenti settimanali, le
 * due note — piu cio che la card V1 mostrava accanto: le sedi dei gruppi
 * operativi e le categorie compatibili. Le azioni sono quelle della riga:
 * modifica, atleti, report.
 */
function Row({ label, value }: { label: React.ReactNode; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2 first:pt-0 last:pb-0">
      <dt className="shrink-0 font-brand text-[12px] text-egw-ink-62">{label}</dt>
      <dd className="min-w-0 text-right font-brand text-[13px] font-semibold text-egw-ink">
        {value === null || value === undefined || value === "" ? MISSING : value}
      </dd>
    </div>
  );
}

function ChipList({ items, emptyLabel }: { items: string[]; emptyLabel: string }) {
  if (!items.length) return <span className="font-normal text-egw-ink-42">{emptyLabel}</span>;
  return (
    <span className="flex flex-wrap justify-end gap-1">
      {items.map((item) => (
        <DataChip key={item} size="sm">
          {item}
        </DataChip>
      ))}
    </span>
  );
}

export function CategoryInspectorDrawer({
  category,
  open,
  onOpenChange,
  multiSite,
  onEdit,
  onViewAthletes,
  onReport,
}: {
  category: CategoryRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  multiSite: boolean;
  onEdit: (category: CategoryRow) => void;
  onViewAthletes: (category: CategoryRow) => void;
  onReport: (category: CategoryRow) => void;
}) {
  return (
    <Drawer
      open={open && Boolean(category)}
      onOpenChange={onOpenChange}
      width="narrow"
      eyebrow="Categoria"
      title={category?.name ?? "Categoria"}
      description={category?.sport}
      data-test="category-inspector-drawer"
      footer={
        category ? (
          <>
            <Button variant="neutral" icon={<Pencil />} onClick={() => onEdit(category)}>
              Modifica
            </Button>
            <Button variant="secondary" icon={<Users />} onClick={() => onViewAthletes(category)}>
              Vedi atleti
            </Button>
            <Button variant="text" icon={<BarChart3 />} onClick={() => onReport(category)}>
              Report
            </Button>
          </>
        ) : null
      }
    >
      {category ? (
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-egw-chip border border-egw-hairline bg-egw-page-100">
              <CategoryColorDot color={category.color} size={14} />
            </span>
            <div className="min-w-0">
              <p className="egw-ellipsis font-brand text-[15px] font-bold text-egw-ink">{category.name}</p>
              <p className="egw-num font-brand text-[12px] text-egw-ink-62">{category.birthYearsLabel}</p>
            </div>
          </div>

          <InsetBlock>
            <dl className="divide-y divide-egw-hairline">
              <Row label="Sport" value={category.sport} />
              <Row label="Anni di nascita" value={<span className="egw-num">{category.birthYearsLabel}</span>} />
              <Row label="Atleti iscritti" value={<span className="egw-num">{formatInteger(category.athletesCount)}</span>} />
              <Row
                label="Allenatori"
                value={<ChipList items={category.trainerNames} emptyLabel="Nessun allenatore assegnato" />}
              />
              <Row
                label="Allenamenti settimanali"
                value={
                  <span className="egw-num">
                    {formatInteger(category.trainingsPerWeek)}{" "}
                    <span className="font-normal text-egw-ink-62">
                      {category.trainingsPerWeek === 1 ? "allenamento settimanale" : "allenamenti settimanali"}
                    </span>
                  </span>
                }
              />
              {multiSite ? (
                <Row
                  label="Sedi"
                  value={<ChipList items={category.siteNames} emptyLabel="Nessuna sede: una squadra sola" />}
                />
              ) : null}
              {multiSite && category.archivedSiteNames.length ? (
                <Row
                  label="Gruppi archiviati"
                  value={<ChipList items={category.archivedSiteNames} emptyLabel="" />}
                />
              ) : null}
              <Row
                label="Categorie compatibili"
                value={<ChipList items={category.compatibleCategoryNames} emptyLabel="Nessuna" />}
              />
              <Row label="Ordine del club" value={<span className="egw-num">{formatInteger(category.posizione)}</span>} />
            </dl>
          </InsetBlock>

          <InfoCard eyebrow="Note">
            Categoria {category.name} collegata agli atleti nati in questo intervallo: {category.birthYearsLabel}.
            Per visualizzare allenatori e atleti specifici, utilizza le sezioni dedicate del sistema.
          </InfoCard>
        </div>
      ) : null}
    </Drawer>
  );
}
