"use client";

import * as React from "react";
import { Pencil, Trash2 } from "lucide-react";
import { Drawer, DrawerSection } from "@/components/web/overlays/Drawer";
import { Button } from "@/components/web/primitives/Button";
import { DataChip, StatusPill } from "@/components/web/primitives/StatusPill";
import { InsetBlock } from "@/components/web/primitives/Surface";
import { Tooltip, TooltipProvider } from "@/components/web/primitives/Overlays";
import { formatInteger } from "@/lib/web/format";
import { isDirectionPermission } from "@/lib/roles/custom-role";
import { perimetroDelRuoloBase, statoRuolo, type RuoloDiClub } from "@/components/access-management/v2/access-model";

/**
 * L'ispettore di un ruolo di club (guideline 06 §6.7: cassetto 392, lettura).
 * Porta cio che la card V1 mostrava per intero su ogni riga — descrizione,
 * base, slug, il perimetro che la base porta «oltre alle caselle» e la nuvola
 * di tutte le etichette dei permessi — senza che la griglia debba allargarsi
 * a contenerlo.
 */
export function RoleInspector({
  ruolo,
  onClose,
  canManage,
  onEdit,
  onDelete,
}: {
  ruolo: RuoloDiClub | null;
  onClose: () => void;
  canManage: boolean;
  onEdit: (ruolo: RuoloDiClub) => void;
  onDelete: (ruolo: RuoloDiClub) => void;
}) {
  return (
    <Drawer
      open={Boolean(ruolo)}
      onOpenChange={(open) => !open && onClose()}
      width="narrow"
      eyebrow="Ruolo del club"
      title={ruolo?.name ?? "Ruolo"}
      description={ruolo?.description || undefined}
      data-test="role-inspector"
      footer={
        canManage && ruolo ? (
          <>
            <Button variant="secondary" icon={<Pencil />} onClick={() => onEdit(ruolo)}>
              Modifica
            </Button>
            <Button variant="danger" icon={<Trash2 />} onClick={() => onDelete(ruolo)}>
              Elimina
            </Button>
          </>
        ) : undefined
      }
    >
      {ruolo ? (
        <div className="flex flex-col gap-6">
          <InsetBlock>
            <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
              <div>
                <dt className="font-brand text-[11px] text-egw-ink-62">Parte da</dt>
                <dd className="mt-1">
                  <DataChip size="sm">da {ruolo.base_role_label}</DataChip>
                </dd>
              </div>
              <div>
                <dt className="font-brand text-[11px] text-egw-ink-62">Stato</dt>
                <dd className="mt-1">
                  <StatusPill status={statoRuolo(ruolo)} size="sm" />
                </dd>
              </div>
              <div>
                <dt className="font-brand text-[11px] text-egw-ink-62">Permessi</dt>
                <dd className="egw-num mt-1 font-brand text-[13px] font-bold text-egw-ink">{formatInteger(ruolo.permissions.length)}</dd>
              </div>
              <div>
                <dt className="font-brand text-[11px] text-egw-ink-62">Persone che lo portano</dt>
                <dd className="egw-num mt-1 font-brand text-[13px] font-bold text-egw-ink">{formatInteger(ruolo.assigned_count)}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="font-brand text-[11px] text-egw-ink-62">Identificativo</dt>
                <dd className="egw-num mt-1 break-all font-brand text-[12px] text-egw-ink-72">{ruolo.slug}</dd>
              </div>
            </dl>
            {ruolo.contains_direction_keys ? (
              <p className="mt-3">
                <DataChip size="sm" tone="amber">
                  contiene permessi di direzione
                </DataChip>
              </p>
            ) : null}
          </InsetBlock>

          <DrawerSection eyebrow="Oltre alle caselle">
            <p className="font-brand text-[12.5px] leading-[1.5] text-egw-ink-72">Il ruolo base porta: {perimetroDelRuoloBase(ruolo.base_role)}</p>
          </DrawerSection>

          <DrawerSection eyebrow="Permessi concessi">
            {ruolo.permission_labels.length ? (
              <TooltipProvider>
                <ul className="flex flex-wrap gap-1.5">
                  {ruolo.permission_labels.map((voce) => (
                    <li key={voce.key}>
                      <Tooltip content={`${voce.key}${isDirectionPermission(voce.key) ? " · direzione" : ""}`}>
                        <span>
                          <DataChip size="sm" tone={isDirectionPermission(voce.key) ? "amber" : "neutral"}>
                            {voce.label}
                          </DataChip>
                        </span>
                      </Tooltip>
                    </li>
                  ))}
                </ul>
              </TooltipProvider>
            ) : (
              <p className="font-brand text-[12.5px] text-egw-ink-62">Nessun permesso concesso: il ruolo vale solo per quello che la base porta con sé.</p>
            )}
          </DrawerSection>
        </div>
      ) : null}
    </Drawer>
  );
}
