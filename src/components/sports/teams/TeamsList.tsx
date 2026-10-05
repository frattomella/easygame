"use client";

import * as React from "react";
import { Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/web/primitives/Button";
import { DataChip, StatusPill } from "@/components/web/primitives/StatusPill";
import { Panel } from "@/components/web/primitives/Surface";
import type { ClubTeamDto } from "@/lib/sports/client";
import {
  describeSeasonLinks,
  describeTeamSport,
  type TeamEditorOptions,
} from "@/components/sports/teams/team-options";

/**
 * L'elenco delle squadre stabili: una scheda per squadra, una colonna sotto
 * i 1024 px e due sopra. Nome, indirizzo pubblico, stato, sport e — per ogni
 * stagione — la categoria (e il gruppo) che in quella stagione la rappresenta.
 */
export function TeamsList({
  teams,
  options,
  canManage,
  onEdit,
  onDelete,
}: {
  teams: readonly ClubTeamDto[];
  options: TeamEditorOptions | null;
  canManage: boolean;
  onEdit: (team: ClubTeamDto) => void;
  onDelete: (team: ClubTeamDto) => void;
}) {
  return (
    <ul className="grid grid-cols-1 gap-4 lg:grid-cols-2" aria-label="Squadre stabili">
      {teams.map((team) => {
        const links = describeSeasonLinks(team, options);
        return (
          <li key={team.id} className="min-w-0">
            <Panel as="article" aria-label={team.name} className="flex h-full flex-col p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="font-brand text-[16px] font-bold leading-5 text-egw-ink">
                    {team.name}
                    {team.shortName && team.shortName !== team.name ? (
                      <span className="ml-2 text-[12.5px] font-medium text-egw-ink-62">{team.shortName}</span>
                    ) : null}
                  </h2>
                  <p className="egw-num mt-1 break-all text-[12px] text-egw-ink-62">/squadre/{team.slug}</p>
                </div>
                <StatusPill
                  status={team.active ? { label: "Attiva", hue: "green", weight: "outline" } : { label: "Non attiva", hue: "neutral", weight: "quiet" }}
                  size="sm"
                />
              </div>
              <p className="mt-2 text-[12.5px] text-egw-ink-72">
                {describeTeamSport(team, options)}
                {team.previousSlugs.length ? (
                  <span className="text-egw-ink-62"> · reindirizza anche da {team.previousSlugs.map((slug) => `/squadre/${slug}`).join(", ")}</span>
                ) : null}
              </p>
              <div className="mt-3 flex-1">
                {links.length ? (
                  <ul className="flex flex-wrap gap-1.5" aria-label={`Stagioni di ${team.name}`}>
                    {links.map((link) => (
                      <li key={link.key} className="min-w-0 max-w-full">
                        <DataChip tone={link.seasonActive ? "blue" : "neutral"} size="sm" className="max-w-full" title={[link.seasonLabel, link.categoryLabel, link.groupLabel].filter(Boolean).join(" · ")}>
                          <span className="truncate">
                            {link.seasonLabel} · {link.categoryLabel}
                            {link.groupLabel ? ` · ${link.groupLabel}` : ""}
                          </span>
                        </DataChip>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-[12px] text-egw-amber-ink">Non collegata a nessuna categoria: sul sito non mostra la rosa.</p>
                )}
              </div>
              {canManage ? (
                <div className="mt-4 flex flex-wrap gap-2 border-t border-egw-hairline pt-3">
                  <Button variant="secondary" size="sm" icon={<Pencil className="h-3.5 w-3.5" />} onClick={() => onEdit(team)} aria-label={`Modifica ${team.name}`}>
                    Modifica
                  </Button>
                  <Button variant="text" size="sm" icon={<Trash2 className="h-3.5 w-3.5" />} onClick={() => onDelete(team)} aria-label={`Elimina ${team.name}`}>
                    Elimina
                  </Button>
                </div>
              ) : null}
            </Panel>
          </li>
        );
      })}
    </ul>
  );
}
