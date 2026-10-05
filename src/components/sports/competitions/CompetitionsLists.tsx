"use client";

import * as React from "react";
import { ExternalLink, Pencil, Shield, Trash2 } from "lucide-react";
import { Button } from "@/components/web/primitives/Button";
import { DataChip, StatusPill } from "@/components/web/primitives/StatusPill";
import { Eyebrow, Panel } from "@/components/web/primitives/Surface";
import { formatDateShort } from "@/lib/web/format";
import type { CompetitionDto, OpponentDto } from "@/lib/sports/client";
import { COMPETITION_KIND_LABELS } from "@/components/sports/competitions/competitions-model";

/**
 * Gli elenchi di competizioni (raggruppate per stagione) e avversari: una
 * scheda per voce, una colonna da smartphone, due o tre da scrivania.
 */

type SeasonInfo = { id: string; label: string; active: boolean };

export function CompetitionsList({
  competitions,
  seasons,
  canManage,
  onEdit,
  onDelete,
}: {
  competitions: readonly CompetitionDto[];
  seasons: readonly SeasonInfo[];
  canManage: boolean;
  onEdit: (competition: CompetitionDto) => void;
  onDelete: (competition: CompetitionDto) => void;
}) {
  const groups = React.useMemo(() => {
    const order = [...seasons.map((season) => season.id), ""];
    const bySeason = new Map<string, CompetitionDto[]>();
    for (const competition of competitions) {
      const key = competition.seasonId && seasons.some((season) => season.id === competition.seasonId) ? competition.seasonId : "";
      bySeason.set(key, [...(bySeason.get(key) || []), competition]);
    }
    return order
      .filter((key) => bySeason.has(key))
      .map((key) => {
        const season = seasons.find((candidate) => candidate.id === key);
        return {
          key: key || "none",
          label: season ? `Stagione ${season.label}${season.active ? " (attiva)" : ""}` : "Senza stagione",
          items: bySeason.get(key) || [],
        };
      });
  }, [competitions, seasons]);

  return (
    <div className="space-y-6">
      {groups.map((group) => (
        <section key={group.key} aria-label={group.label}>
          <Eyebrow as="h2" className="mb-3">
            {group.label}
          </Eyebrow>
          <ul className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {group.items.map((competition) => {
              const club = competition.standings.find((row) => row.isClub);
              return (
                <li key={competition.id} className="min-w-0">
                  <Panel as="article" aria-label={competition.name} className="flex h-full flex-col p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="font-brand text-[15.5px] font-bold leading-5 text-egw-ink">{competition.name}</h3>
                        <p className="mt-1 flex flex-wrap items-center gap-1.5">
                          <DataChip tone="blue" size="sm">
                            {COMPETITION_KIND_LABELS[competition.kind] || "Competizione"}
                          </DataChip>
                          {competition.shortName && competition.shortName !== competition.name ? (
                            <DataChip size="sm">{competition.shortName}</DataChip>
                          ) : null}
                        </p>
                      </div>
                      {!competition.active ? (
                        <StatusPill status={{ label: "Non attiva", hue: "neutral", weight: "quiet" }} size="sm" />
                      ) : null}
                    </div>
                    <p className="mt-3 flex-1 text-[12.5px] text-egw-ink-72">
                      {competition.standings.length
                        ? `Classifica di ${competition.standings.length} squadre${club ? ` · il club è ${club.position}°` : ""}${
                            competition.standingsUpdatedAt ? ` · aggiornata il ${formatDateShort(competition.standingsUpdatedAt)}` : ""
                          }`
                        : "Nessuna classifica inserita."}
                    </p>
                    {canManage ? (
                      <div className="mt-4 flex flex-wrap gap-2 border-t border-egw-hairline pt-3">
                        <Button variant="secondary" size="sm" icon={<Pencil className="h-3.5 w-3.5" />} onClick={() => onEdit(competition)} aria-label={`Modifica ${competition.name}`}>
                          Modifica e classifica
                        </Button>
                        <Button variant="text" size="sm" icon={<Trash2 className="h-3.5 w-3.5" />} onClick={() => onDelete(competition)} aria-label={`Elimina ${competition.name}`}>
                          Elimina
                        </Button>
                      </div>
                    ) : null}
                  </Panel>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

export function OpponentsList({
  opponents,
  canManage,
  onEdit,
  onDelete,
}: {
  opponents: readonly OpponentDto[];
  canManage: boolean;
  onEdit: (opponent: OpponentDto) => void;
  onDelete: (opponent: OpponentDto) => void;
}) {
  return (
    <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3" aria-label="Avversari">
      {opponents.map((opponent) => (
        <li key={opponent.id} className="min-w-0">
          <Panel as="article" aria-label={opponent.name} className="flex h-full flex-col p-5">
            <div className="flex items-start gap-3">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-egw-field border border-egw-hairline bg-egw-page-100">
                {opponent.logoMediaId ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={`/api/public/website/media/${encodeURIComponent(opponent.logoMediaId)}`}
                    alt={`Logo di ${opponent.name}`}
                    className="h-full w-full object-contain"
                    loading="lazy"
                  />
                ) : (
                  <Shield className="h-5 w-5 text-egw-ink-42" aria-hidden />
                )}
              </span>
              <div className="min-w-0">
                <h3 className="egw-ellipsis font-brand text-[15px] font-bold leading-5 text-egw-ink" title={opponent.name}>
                  {opponent.name}
                </h3>
                <p className="mt-0.5 text-[12px] text-egw-ink-62">
                  {[opponent.shortName && opponent.shortName !== opponent.name ? opponent.shortName : null, opponent.city || null]
                    .filter(Boolean)
                    .join(" · ") || "—"}
                </p>
                {opponent.websiteUrl ? (
                  <a
                    href={opponent.websiteUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1 inline-flex max-w-full items-center gap-1 text-[12px] font-medium text-egw-blue-700 hover:underline"
                  >
                    <span className="truncate">{opponent.websiteUrl.replace(/^https?:\/\//, "").replace(/\/$/, "")}</span>
                    <ExternalLink className="h-3 w-3 shrink-0" aria-hidden />
                  </a>
                ) : null}
              </div>
            </div>
            {canManage ? (
              <div className="mt-4 flex flex-wrap gap-2 border-t border-egw-hairline pt-3">
                <Button variant="secondary" size="sm" icon={<Pencil className="h-3.5 w-3.5" />} onClick={() => onEdit(opponent)} aria-label={`Modifica ${opponent.name}`}>
                  Modifica
                </Button>
                <Button variant="text" size="sm" icon={<Trash2 className="h-3.5 w-3.5" />} onClick={() => onDelete(opponent)} aria-label={`Elimina ${opponent.name}`}>
                  Elimina
                </Button>
              </div>
            ) : null}
          </Panel>
        </li>
      ))}
    </ul>
  );
}
