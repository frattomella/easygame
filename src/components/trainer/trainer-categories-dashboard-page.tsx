"use client";

import { useMemo } from "react";
import { CalendarDays, Trophy, Users } from "lucide-react";

import { PageHeading } from "@/components/dashboard/page-heading";
import { Badge } from "@/components/ui/badge";
import { useTrainerDashboard } from "@/components/trainer/trainer-dashboard-context";
import {
  ActionLinkButton,
  SectionBlockedState,
  SectionEmptyState,
  SurfacePanel,
  getAthleteDisplayName,
} from "@/components/trainer/trainer-dashboard-shared";
import { athleteMatchesCategory } from "@/lib/category-utils";

/**
 * **Le proprie squadre, finalmente mostrate** (W6-31).
 *
 * ## Cosa c'era prima
 *
 * `/trainer-dashboard/categories` esisteva e faceva una cosa sola:
 * `redirect("/trainer-dashboard")`. La chiave di navigazione che l'avrebbe
 * accesa era forzata a `false` un'istruzione dopo essere stata letta. Era una
 * rotta che nessuno poteva raggiungere davanti a una pagina che non mostrava
 * niente — e una rotta che rimanda altrove e peggio di una rotta assente,
 * perche un link vecchio ci finisce dentro e l'utente non capisce perche si e
 * spostato.
 *
 * ## Cosa c'e adesso
 *
 * L'elenco delle categorie e dei gruppi del **perimetro**, che e la stessa
 * risposta che il server usa per filtrare eventi e atleti: qui non si ricalcola
 * niente, si mostra cio che l'allenatore ha gia in mano. Per ogni squadra: i
 * suoi atleti, quanti allenamenti e quante gare ha in calendario, e la strada
 * per aprirli.
 *
 * E la voce «proprie squadre/gruppi» che l'area allenatore non aveva.
 */
export default function TrainerCategoriesDashboardPage() {
  const {
    assignedAthletes,
    assignedCategories,
    permissions,
    trainerProfile,
    visibleMatches,
    visibleTrainings,
  } = useTrainerDashboard();

  /*
    Il gruppo operativo e la coppia (categoria, sede), e vive nel profilo come
    elenco di identificativi. Non si prova a risolverne il nome inventando una
    seconda idea di «gruppo»: si mostra che ci sono e quanti sono, e il taglio
    per sede lo ha gia applicato il server sugli atleti e sugli eventi.
  */
  const declaredGroups = useMemo(() => {
    const source =
      trainerProfile?.data && typeof trainerProfile.data === "object"
        ? trainerProfile.data
        : {};

    return Array.from(
      new Set(
        [
          trainerProfile?.groups,
          trainerProfile?.groupIds,
          trainerProfile?.group_ids,
          source?.groups,
          source?.groupIds,
          source?.group_ids,
        ]
          .flatMap((entry) => (Array.isArray(entry) ? entry : []))
          .map((entry) =>
            entry && typeof entry === "object"
              ? String((entry as any).id || "").trim()
              : String(entry || "").trim(),
          )
          .filter(Boolean),
      ),
    );
  }, [trainerProfile]);

  if (!permissions.navigation.categories) {
    return <SectionBlockedState section="categories" />;
  }

  return (
    <div className="space-y-6 pb-2">
      <PageHeading
        eyebrow="Dashboard trainer"
        title="Squadre e categorie"
        subtitle="Le squadre che segui, con i loro atleti e le loro attività."
      />

      {declaredGroups.length > 0 ? (
        <SurfacePanel
          title="I miei gruppi operativi"
          description="Il gruppo è la coppia categoria + sede: è il perimetro che il club ti ha assegnato."
          icon={Users}
        >
          <div className="flex flex-wrap gap-2">
            {declaredGroups.map((group) => (
              <Badge
                key={group}
                className="border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-50"
              >
                {group}
              </Badge>
            ))}
          </div>
        </SurfacePanel>
      ) : null}

      {assignedCategories.length > 0 ? (
        <div className="grid gap-6 xl:grid-cols-2">
          {assignedCategories.map((category: any) => {
            const athletes = assignedAthletes.filter((athlete: any) =>
              athleteMatchesCategory(athlete, category),
            );
            const trainings = visibleTrainings.filter((training: any) =>
              athleteMatchesCategory(
                { category_id: training?.categoryId, category: training?.category },
                category,
              ),
            );
            const matches = visibleMatches.filter((match: any) =>
              athleteMatchesCategory(
                { category_id: match?.categoryId, category: match?.category },
                category,
              ),
            );

            return (
              <SurfacePanel
                key={category.id || category.name}
                title={category.name || category.id}
                description={`${athletes.length} atleti nel tuo perimetro`}
                icon={Users}
                action={
                  <ActionLinkButton
                    href={`/trainer-dashboard/athletes?category=${encodeURIComponent(
                      String(category.id || category.name || ""),
                    )}`}
                    label="Atleti"
                  />
                }
              >
                <div className="space-y-4">
                  <div className="flex flex-wrap gap-2">
                    <Badge className="border-slate-200 bg-slate-100 text-slate-700 hover:bg-slate-100">
                      <CalendarDays className="mr-1 h-3.5 w-3.5" />
                      {trainings.length} allenamenti
                    </Badge>
                    <Badge className="border-slate-200 bg-slate-100 text-slate-700 hover:bg-slate-100">
                      <Trophy className="mr-1 h-3.5 w-3.5" />
                      {matches.length} gare
                    </Badge>
                  </div>

                  {athletes.length > 0 ? (
                    <ul className="space-y-1 text-sm text-slate-700">
                      {athletes.slice(0, 12).map((athlete: any) => (
                        <li
                          key={athlete.id}
                          className="rounded-xl border border-slate-100 bg-white px-3 py-2"
                        >
                          {getAthleteDisplayName(athlete)}
                        </li>
                      ))}
                      {athletes.length > 12 ? (
                        <li className="px-3 py-1 text-xs text-slate-500">
                          e altri {athletes.length - 12}
                        </li>
                      ) : null}
                    </ul>
                  ) : (
                    <SectionEmptyState
                      title="Nessun atleta"
                      description="Questa squadra non ha ancora atleti nel tuo perimetro."
                    />
                  )}
                </div>
              </SurfacePanel>
            );
          })}
        </div>
      ) : (
        <SectionEmptyState
          title="Nessuna squadra assegnata"
          description="Il club non ti ha ancora assegnato categorie o gruppi. Finché non lo fa, non vedi né atleti né calendario: chiedi alla segreteria di completare la tua scheda."
        />
      )}
    </div>
  );
}
