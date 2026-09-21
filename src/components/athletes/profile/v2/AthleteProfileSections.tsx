"use client";

import * as React from "react";
import { Copy, KeyRound, Pencil, Plus, RefreshCw, Trash2, Unlink2 } from "lucide-react";
import { DetailCard } from "@/components/web/page/Cards";
import { Button, IconButton } from "@/components/web/primitives/Button";
import { InsetBlock, Eyebrow, Hairline } from "@/components/web/primitives/Surface";
import { DataChip, StatusPill } from "@/components/web/primitives/StatusPill";
import { ProgressBar } from "@/components/web/primitives/Controls";
import { formatDateShort, formatDateTime, joinMeta, MISSING } from "@/lib/web/format";
import { CategoryLabel, MembershipRoleBadge } from "@/components/categories/category-label";
import { buildCategoryDisplayIndex } from "@/lib/categories/display";
import type { CategoryGroupLike } from "@/lib/categories/display";
import {
  formatParentAccessToken,
  getGuardianAccessStatus,
  getGuardianTokenTiming,
} from "@/lib/athlete-guardians";
import { ATHLETE_RECORD_SECTIONS } from "@/lib/athlete-profile-tabs";
import { FieldList, RecordSection, guardianAccessStatus } from "./record-primitives";

/**
 * Le sezioni dell'area **Profilo**: anagrafica, contatti, famiglia, indirizzo.
 * Nessuna possiede lo stato: ricevono l'atleta gia normalizzato dalla pagina
 * e restituiscono le intenzioni (`onEdit`, `onAdd`, …), come i pannelli V1.
 */

type AthleteLike = Record<string, any>;

export type AthleteMembershipLike = {
  categoryId: string | null;
  categoryName: string;
  isPrimary: boolean;
};

/* ── Anagrafica ────────────────────────────────────────────────────────── */
export function AthleteAnagraficaCard({
  athlete,
  memberships,
  categoryCatalog,
  categoryGroups,
  onEdit,
}: {
  athlete: AthleteLike;
  memberships: AthleteMembershipLike[];
  categoryCatalog: readonly { id?: string | null; name?: string | null }[];
  categoryGroups: readonly CategoryGroupLike[];
  onEdit: () => void;
}) {
  /* Un indice per la card, non uno per chip (D-RD-17 d). */
  const categoryDisplay = React.useMemo(
    () => buildCategoryDisplayIndex({ categories: categoryCatalog, groups: categoryGroups }),
    [categoryCatalog, categoryGroups],
  );
  return (
    <DetailCard
      className="scroll-mt-24"
      eyebrow="Anagrafica"
      title="Informazioni generali"
      onEdit={onEdit}
      fields={[
        { label: "Nome", value: athlete.name },
        { label: "Cognome", value: athlete.surname },
        { label: "Codice fiscale", value: athlete.fiscalCode ? <span className="egw-num">{athlete.fiscalCode}</span> : null },
        { label: "Data di nascita", value: athlete.birthDate ? formatDateShort(athlete.birthDate) : null },
        { label: "Nazionalità", value: athlete.nationality },
        { label: "Comune", value: athlete.birthPlace },
        { label: "Sesso", value: athlete.gender },
        {
          label: "Categorie di appartenenza",
          wide: true,
          value: memberships.length ? (
            <span className="flex flex-wrap gap-1.5">
              {memberships.map((membership) => (
                <DataChip key={`athlete-general-category-${membership.categoryId}`} tone={membership.isPrimary ? "blue" : "neutral"} size="sm">
                  <CategoryLabel
                    category={{ categoryId: membership.categoryId, categoryName: membership.categoryName }}
                    index={categoryDisplay}
                  />
                  <MembershipRoleBadge isPrimary={membership.isPrimary} />
                </DataChip>
              ))}
            </span>
          ) : null,
        },
        { label: "Note", value: athlete.notes, wide: true },
      ]}
    />
  );
}

/* ── Contatti ──────────────────────────────────────────────────────────── */
export function AthleteContattiCard({ athlete, onEdit }: { athlete: AthleteLike; onEdit: () => void }) {
  return (
    <div id={ATHLETE_RECORD_SECTIONS.contatti} className="scroll-mt-24">
      <DetailCard
        eyebrow="Contatti Atleta"
        title="Contatto atleta"
        onEdit={onEdit}
        columns={2}
        fields={[
          { label: "Telefono", value: athlete.phone ? <span className="egw-num">{athlete.phone}</span> : null },
          { label: "Email", value: athlete.email },
        ]}
      />
    </div>
  );
}

/* ── Indirizzo (dentro una sezione chiusa) ─────────────────────────────── */
export const summarizeAddress = (athlete: AthleteLike) =>
  joinMeta(
    [athlete.address, athlete.streetNumber].filter(Boolean).join(" ") || null,
    [athlete.postalCode, athlete.city].filter(Boolean).join(" ") || null,
    athlete.province || null,
  ) || "Indirizzo non registrato";

export function AthleteIndirizzoFields({ athlete }: { athlete: AthleteLike }) {
  return (
    <FieldList
      fields={[
        { label: "Indirizzo", value: athlete.address },
        { label: "N. civico", value: athlete.streetNumber },
        { label: "Comune", value: athlete.city },
        { label: "CAP", value: athlete.postalCode ? <span className="egw-num">{athlete.postalCode}</span> : null },
        { label: "Paese", value: athlete.country },
        { label: "Regione", value: athlete.region },
        { label: "Provincia", value: athlete.province },
      ]}
    />
  );
}

/* ── Famiglia e tutori ─────────────────────────────────────────────────── */
export type GuardianLike = Record<string, any>;

export function AthleteGuardiansPanel({
  guardians,
  contactOnlyIdentities,
  nowMs,
  busyGuardianId,
  onAdd,
  onEdit,
  onRemove,
  onGenerateToken,
  onCopyToken,
  onDisconnect,
}: {
  guardians: GuardianLike[];
  contactOnlyIdentities: string[];
  nowMs: number;
  busyGuardianId: string | null;
  onAdd: () => void;
  onEdit: (index: number) => void;
  onRemove: (guardianId: string) => void;
  onGenerateToken: (guardianId: string) => void;
  onCopyToken: (token: string) => void;
  onDisconnect: (guardianId: string) => void;
}) {
  return (
    <RecordSection
      id={ATHLETE_RECORD_SECTIONS.famiglia}
      eyebrow="Famiglia"
      title="Genitori e tutori"
      description="Chi riceve comunicazioni, pagamenti e documenti del minore, e con quale accesso all'area famiglia."
      actions={
        <Button variant="secondary" size="sm" icon={<Plus />} onClick={onAdd}>
          Aggiungi
        </Button>
      }
    >
      {guardians.length ? (
        <div className="flex flex-col gap-3">
          {guardians.map((guardian, idx) => {
            const accessStatus = getGuardianAccessStatus(guardian, Date.now(), contactOnlyIdentities);
            const tokenValue =
              guardian.parentAccessTokenValue || guardian.parent_access_token_value || guardian.accessTokenValue || "";
            const linkedEmail = guardian.linkedUserEmail || guardian.linked_user_email || "";
            const expiresAt =
              guardian.parentAccessTokenExpiresAt ||
              guardian.parent_access_token_expires_at ||
              guardian.accessTokenExpiresAt ||
              null;
            const timing = getGuardianTokenTiming(guardian, nowMs);
            const isBusy = busyGuardianId === guardian.id;
            const isLinked = Boolean(guardian.linkedUserId || guardian.linked_user_id);
            const guardianName = [guardian.name, guardian.surname].filter(Boolean).join(" ") || "tutore";

            return (
              <InsetBlock key={guardian.id} className="p-4">
                <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-brand text-[14px] font-bold text-egw-ink">{guardianName}</p>
                    <p className="font-brand text-[12px] text-egw-ink-62">{guardian.relationship || "Parentela non indicata"}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <IconButton aria-label={`Modifica il tutore ${guardianName}`} variant="row" size="sm" onClick={() => onEdit(idx)}>
                      <Pencil />
                    </IconButton>
                    <IconButton aria-label={`Rimuovi il tutore ${guardianName}`} variant="row" size="sm" onClick={() => onRemove(guardian.id)}>
                      <Trash2 />
                    </IconButton>
                  </div>
                </div>
                <FieldList
                  fields={[
                    { label: "Nome", value: guardian.name },
                    { label: "Cognome", value: guardian.surname },
                    { label: "Parentela", value: guardian.relationship },
                    { label: "Codice fiscale", value: guardian.fiscalCode ? <span className="egw-num">{guardian.fiscalCode}</span> : null },
                    { label: "Data di nascita", value: guardian.birthDate ? formatDateShort(guardian.birthDate) : null },
                    { label: "Telefono", value: guardian.phone ? <span className="egw-num">{guardian.phone}</span> : null },
                    { label: "Email", value: guardian.email, wide: true },
                  ]}
                />

                <Hairline className="my-4" />

                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div className="min-w-0">
                    <Eyebrow className="mb-2">Accesso genitore</Eyebrow>
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusPill status={guardianAccessStatus(accessStatus.state, accessStatus.label)} size="sm" />
                      {isLinked && linkedEmail ? <span className="font-brand text-[12.5px] text-egw-ink-62">{linkedEmail}</span> : null}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {isLinked ? (
                      <Button variant="danger" size="sm" icon={<Unlink2 />} loading={isBusy} onClick={() => onDisconnect(guardian.id)}>
                        Scollega account
                      </Button>
                    ) : (
                      <Button
                        variant="secondary"
                        size="sm"
                        icon={tokenValue ? <RefreshCw /> : <KeyRound />}
                        loading={isBusy}
                        onClick={() => onGenerateToken(guardian.id)}
                      >
                        {tokenValue ? "Rigenera token" : "Genera token"}
                      </Button>
                    )}
                  </div>
                </div>

                {tokenValue ? (
                  <div className="mt-3 rounded-egw-field border border-egw-tint-blue-bd bg-egw-tint-blue p-3">
                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                      <div className="min-w-0">
                        <Eyebrow tone="blue">Token genitore</Eyebrow>
                        <p className="egw-num mt-1 font-brand text-[18px] font-extrabold text-egw-ink">{formatParentAccessToken(tokenValue)}</p>
                      </div>
                      <Button variant="secondary" size="sm" icon={<Copy />} onClick={() => onCopyToken(tokenValue)}>
                        Copia token
                      </Button>
                    </div>
                    <div className="mt-3">
                      <ProgressBar
                        value={timing.progress}
                        tone={timing.isExpired ? "amber" : "action"}
                        label={joinMeta(timing.label, expiresAt ? `Scade ${formatDateTime(expiresAt)}` : `Scade ${MISSING}`)}
                      />
                    </div>
                  </div>
                ) : null}
              </InsetBlock>
            );
          })}
        </div>
      ) : (
        <p className="rounded-egw-field border border-dashed border-[rgba(11,26,58,.22)] px-4 py-5 text-center font-brand text-[12.5px] text-egw-ink-62">
          Nessun genitore o tutore registrato
        </p>
      )}
    </RecordSection>
  );
}
