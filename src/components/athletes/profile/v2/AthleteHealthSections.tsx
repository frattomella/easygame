"use client";

import * as React from "react";
import { Download, Eye, Plus, Trash2 } from "lucide-react";
import { DetailCard } from "@/components/web/page/Cards";
import { Button, IconButton } from "@/components/web/primitives/Button";
import { InsetBlock } from "@/components/web/primitives/Surface";
import { Toggle } from "@/components/web/primitives/Controls";
import { CertificateAttachmentField } from "@/components/forms/certificate-attachment-field";
import { formatDateShort, joinMeta } from "@/lib/web/format";
import { ATHLETE_RECORD_SECTIONS } from "@/lib/athlete-profile-tabs";
import { RecordRowList } from "./record-primitives";

/**
 * Le sezioni sanitarie dell'area **Documenti e sanità**: visite mediche,
 * attestati (BLSD, primo soccorso, antincendio) e anagrafica sanitaria. I
 * certificati medici hanno il proprio pannello (`athlete-certificates-panel`).
 *
 * Nessun gate client-side sul contenuto clinico: la V1 non ne aveva, e lo
 * applicano le API (`clinical.read` / `clinical.manage`). Non si inventa un
 * predicato che la V1 non ha (brief, regola 10).
 */

type AthleteLike = Record<string, any>;

/* ── Visite mediche ────────────────────────────────────────────────────── */
export type MedicalVisitLike = {
  id: string;
  title?: string;
  description?: string;
  type?: string;
  outcome?: string;
  paidBy?: string;
  location?: string;
  date?: string;
  fileUrl?: string;
};

export function AthleteMedicalVisitsList({
  visits,
  deletingId,
  onView,
  onDownload,
  onDelete,
}: {
  visits: MedicalVisitLike[];
  deletingId: string | null;
  onView: (visit: MedicalVisitLike) => void;
  onDownload: (visit: MedicalVisitLike) => void;
  onDelete: (visit: MedicalVisitLike) => void;
}) {
  return (
    <RecordRowList
      aria-label="Visite mediche"
      rows={visits.map((visit) => ({
        id: visit.id,
        title: visit.title || "Visita medica",
        meta: joinMeta(visit.type, visit.outcome ? `Esito: ${visit.outcome}` : null, visit.paidBy ? `Pagata da: ${visit.paidBy}` : null, visit.location),
        detail: visit.description || null,
        aside: visit.date ? formatDateShort(visit.date) : null,
        actions: (
          <>
            {visit.fileUrl ? (
              <>
                <IconButton aria-label={`Visualizza l'allegato della visita ${visit.title || ""}`} onClick={() => onView(visit)}>
                  <Eye />
                </IconButton>
                <IconButton aria-label={`Scarica l'allegato della visita ${visit.title || ""}`} onClick={() => onDownload(visit)}>
                  <Download />
                </IconButton>
              </>
            ) : null}
            <IconButton aria-label={`Elimina la visita ${visit.title || ""}`} loading={deletingId === visit.id} onClick={() => onDelete(visit)}>
              <Trash2 />
            </IconButton>
          </>
        ),
      }))}
      empty="Nessuna visita medica registrata"
    />
  );
}

/* ── Attestati ─────────────────────────────────────────────────────────── */
const ATTESTATI = [
  { key: "blsd", field: "blsd", label: "BLSD" },
  { key: "firstAid", field: "firstAid", label: "Primo soccorso" },
  { key: "fireSafety", field: "fireSafety", label: "Antincendio" },
] as const;

export function AthleteAttestatiPanel({
  athlete,
  athleteId,
  clubId,
  certificateFiles,
  onToggle,
  onFileChange,
}: {
  athlete: AthleteLike;
  athleteId: string;
  clubId: string | null;
  certificateFiles: Record<string, string>;
  onToggle: (field: "blsd" | "firstAid" | "fireSafety", checked: boolean) => void;
  onFileChange: (key: string, next: string | null) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      {ATTESTATI.map((attestato) => {
        const active = Boolean(athlete[attestato.field]);
        return (
          <InsetBlock key={attestato.key}>
            <div className="flex items-center justify-between gap-4">
              <label htmlFor={`attestato-${attestato.key}`} className="font-brand text-[13.5px] font-semibold text-egw-ink">
                {attestato.label}
                <span className="block font-brand text-[11.5px] font-medium text-egw-ink-62">{active ? "Conseguito" : "Non conseguito"}</span>
              </label>
              <Toggle id={`attestato-${attestato.key}`} checked={active} onCheckedChange={(next) => onToggle(attestato.field, next)} aria-label={attestato.label} />
            </div>
            {active ? (
              <div className="mt-4 border-t border-egw-hairline pt-4">
                <CertificateAttachmentField
                  documentType={attestato.label}
                  owner={{ type: "athlete", id: athleteId, organizationId: clubId }}
                  value={certificateFiles[attestato.key]}
                  onChange={(next) => onFileChange(attestato.key, next)}
                  person={{ firstName: athlete?.name, lastName: athlete?.surname, fullName: athlete?.fullName }}
                />
              </div>
            ) : null}
          </InsetBlock>
        );
      })}
    </div>
  );
}

/* ── Anagrafica sanitaria ──────────────────────────────────────────────── */
export function AthleteHealthInfoCard({ athlete, onEdit }: { athlete: AthleteLike; onEdit: () => void }) {
  return (
    <div id={ATHLETE_RECORD_SECTIONS.sanitaria} className="scroll-mt-24">
      <DetailCard
        eyebrow="Dato sanitario"
        title="Anagrafica sanitaria"
        onEdit={onEdit}
        columns={2}
        fields={[
          { label: "Gruppo sanguigno", value: athlete.bloodType },
          { label: "Allergie", value: athlete.allergies },
          { label: "Malattie croniche", value: athlete.chronicDiseases },
          { label: "Farmaci", value: athlete.medications },
          { label: "Contatto di emergenza", value: athlete.emergencyContact },
          { label: "Telefono di emergenza", value: athlete.emergencyPhone ? <span className="egw-num">{athlete.emergencyPhone}</span> : null },
        ]}
      />
    </div>
  );
}

/* ── L'azione «aggiungi» che accompagna una sezione chiusa ─────────────── */
export function AddAction({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <Button variant="secondary" size="sm" icon={<Plus />} onClick={onClick}>
      {label}
    </Button>
  );
}

