"use client";

import * as React from "react";
import { Camera, ImageOff, KeyRound, Pencil, Trash2 } from "lucide-react";
import {
  RecordAlertStrip,
  RecordAreaSwitcher,
  RecordHeader,
  type RecordAction,
} from "@/components/web/record/Record";
import { DataChip, StatusPill } from "@/components/web/primitives/StatusPill";
import { Button } from "@/components/web/primitives/Button";
import { useBreadcrumbLabel } from "@/components/web/shell/ShellProvider";
import { useToast } from "@/components/ui/toast-notification";
import { formatDateShort, joinMeta } from "@/lib/web/format";
import {
  buildCategoryDisplayIndex,
  type CategoryGroupLike,
} from "@/lib/categories/display";
import { CategoryLabel, MembershipRoleBadge } from "@/components/categories/category-label";
import {
  ATHLETE_RECORD_AREAS,
  type AthleteRecordAreaValue,
  type AthleteRecordTarget,
} from "@/lib/athlete-profile-tabs";
import type { AthleteRecordAlert } from "./athlete-record-alerts";

/**
 * L'intestazione della scheda atleta (guideline 09 §9.8, mockup `EGAthlete`).
 *
 * Tile d'identita da 72px con il numero di maglia (o le iniziali), occhiello
 * «ATLETA · TESSERATO 2026/2027», nome 800/28, i chip di classificazione
 * (categoria · sede) e la pillola di stato, la riga meta (nascita · comune).
 * A destra due azioni al massimo; **tutto il resto sta nel `···`**, compresa
 * l'eliminazione: il pulsante rosso nell'intestazione e deprecato.
 *
 * Sotto il nome la striscia degli avvisi, e in basso a destra lo switcher
 * delle quattro aree.
 *
 * La foto profilo resta una capacita della V1 (`AvatarUpload`): qui vive nel
 * menu `···` («Cambia foto», «Rimuovi foto») con le stesse regole — solo
 * immagini, al massimo 5 MB, salvata subito.
 */
export type AthleteRecordHeaderCategory = {
  categoryId: string | null;
  categoryName: string;
  isPrimary: boolean;
  siteId?: string | null;
};

export function AthleteRecordHeader({
  athlete,
  jerseyNumber,
  categories,
  categoryCatalog = [],
  categoryGroups = [],
  siteLabel,
  seasonLabel,
  status,
  alerts,
  onAlertAction,
  area,
  onAreaChange,
  problemsByArea,
  onOpenAccount,
  onEdit,
  onAvatarChange,
  onDelete,
}: {
  athlete: {
    name?: string | null;
    surname?: string | null;
    avatar?: string | null;
    birthDate?: string | null;
    birthPlace?: string | null;
  };
  jerseyNumber: number | string | null;
  categories: AthleteRecordHeaderCategory[];
  categoryCatalog?: readonly { id?: string | null; name?: string | null }[];
  categoryGroups?: readonly CategoryGroupLike[];
  /** Il nome della sede della categoria primaria, se il club e multi-sede. */
  siteLabel?: string | null;
  seasonLabel?: string | null;
  /** Lo stato dell'atleta, gia normalizzato (`active` · `suspended` · `loan` · `inactive`). */
  status?: string | null;
  alerts: AthleteRecordAlert[];
  onAlertAction: (target: AthleteRecordTarget) => void;
  area: AthleteRecordAreaValue;
  onAreaChange: (area: AthleteRecordAreaValue) => void;
  problemsByArea: Partial<Record<AthleteRecordAreaValue, number>>;
  /** Assente per chi non puo gestire l'accesso: il permesso negato e assenza. */
  onOpenAccount?: (() => void) | null;
  onEdit: () => void;
  onAvatarChange: (image: string | null) => void;
  onDelete: () => void;
}) {
  const { showToast } = useToast();
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const fullName = [athlete.name, athlete.surname].filter(Boolean).join(" ").trim();
  useBreadcrumbLabel(fullName || null);

  const display = React.useMemo(
    () => buildCategoryDisplayIndex({ categories: categoryCatalog, groups: categoryGroups }),
    [categoryCatalog, categoryGroups],
  );

  const onFileChosen = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] || null;
    event.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      showToast("error", "La foto profilo deve essere un'immagine");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      showToast("error", "La foto profilo non può superare 5 MB");
      return;
    }
    const reader = new FileReader();
    reader.onload = (loaded) => {
      if (loaded.target?.result) onAvatarChange(loaded.target.result as string);
    };
    reader.readAsDataURL(file);
  };

  const actions: RecordAction[] = [
    {
      id: "accesso",
      label: "Accesso EasyGame",
      icon: <KeyRound />,
      onClick: () => onOpenAccount?.(),
      hidden: !onOpenAccount,
    },
    { id: "modifica", label: "Modifica", icon: <Pencil />, onClick: onEdit },
    {
      id: "foto",
      label: athlete.avatar ? "Cambia foto profilo" : "Aggiungi foto profilo",
      icon: <Camera />,
      onClick: () => fileInputRef.current?.click(),
      overflow: true,
    },
    {
      id: "rimuovi-foto",
      label: "Rimuovi foto profilo",
      icon: <ImageOff />,
      onClick: () => onAvatarChange(null),
      overflow: true,
      hidden: !athlete.avatar,
    },
    {
      id: "elimina",
      label: "Elimina atleta",
      icon: <Trash2 />,
      onClick: onDelete,
      tone: "danger",
      overflow: true,
    },
  ];

  const primary = categories.find((membership) => membership.isPrimary) || null;
  const secondary = categories.filter((membership) => !membership.isPrimary);

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif"
        className="hidden"
        aria-label="Scegli la foto profilo"
        onChange={onFileChosen}
      />
      <RecordHeader
        eyebrow={joinMeta("Atleta", seasonLabel ? `Tesserato ${seasonLabel}` : null)}
        name={fullName || "Atleta"}
        identity={
          athlete.avatar
            ? { name: fullName, avatarSrc: athlete.avatar, round: true }
            : { name: fullName, number: jerseyNumber }
        }
        chips={
          <>
            {primary ? (
              <DataChip tone="blue" title="Categoria primaria">
                <CategoryLabel
                  category={{ categoryId: primary.categoryId, categoryName: primary.categoryName }}
                  index={display}
                />
                <MembershipRoleBadge isPrimary />
              </DataChip>
            ) : null}
            {secondary.map((membership) => (
              <DataChip key={`header-secondary-${membership.categoryId}`} tone="neutral" title="Categoria secondaria">
                <CategoryLabel
                  category={{ categoryId: membership.categoryId, categoryName: membership.categoryName }}
                  index={display}
                />
                <MembershipRoleBadge isPrimary={false} />
              </DataChip>
            ))}
            {siteLabel ? <DataChip tone="navy">{siteLabel}</DataChip> : null}
          </>
        }
        status={status ? <StatusPill status={status} /> : null}
        meta={joinMeta(
          athlete.birthDate ? formatDateShort(athlete.birthDate) : null,
          athlete.birthPlace || null,
        )}
        actions={actions}
        areas={
          /* A 375 px le quattro aree scorrono nella riga bassa del RecordHeader, che gia lo prevede. */
          <RecordAreaSwitcher
            value={area}
            onChange={onAreaChange}
            areas={ATHLETE_RECORD_AREAS.map((entry) => ({
              value: entry.value,
              label: entry.label,
              problems: problemsByArea[entry.value] || 0,
            }))}
          />
        }
      >
        <RecordAlertStrip
          items={alerts.map((alert) => ({
            id: alert.id,
            severity: alert.severity,
            text: alert.text,
            action: (
              <Button
                variant={alert.severity === "danger" ? "danger" : "secondary"}
                size="xs"
                onClick={() => onAlertAction(alert.target)}
              >
                {alert.action}
              </Button>
            ),
          }))}
        />
      </RecordHeader>
    </>
  );
}
