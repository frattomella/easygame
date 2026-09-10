import React from "react";
import { View } from "react-native";

import {
  GlassCard,
  MetaRow,
  SecondaryScreenLayout,
  StateMessage,
} from "@/components/signature";
import { mobileBackendStorage } from "@/services/mobile-backend-storage";
import { useAsyncSection } from "@/hooks/useAsyncSection";
import {
  summarizeTrainerCategories,
  type TrainerCategorySummary,
} from "@/lib/trainer-category-summary";
import { Spacing } from "@/constants/theme";

/**
 * Squadre/Categorie — prima schermata mobile per questa sezione (sul Web e
 * `trainer-categories-dashboard-page.tsx`). Nomi leggibili, mai
 * identificativi grezzi: e esattamente il difetto di leggibilita segnalato
 * nell'audit ("i gruppi operativi sono mostrati come id grezzi"), qui non
 * riprodotto perche la schermata nasce con `summarizeTrainerCategories`.
 * Il perimetro (quali categorie vedere) lo decide sempre il server sugli
 * elenchi gia filtrati — questa schermata aggrega, non filtra da capo.
 */
export default function TrainerCategoriesScreen() {
  const { status, data, errorMessage, reload } = useAsyncSection<
    TrainerCategorySummary[]
  >(
    async () => {
      const [categories, athletes, trainings, matches] = await Promise.all([
        mobileBackendStorage.getAssignedCategories(),
        mobileBackendStorage.getAthletes(),
        mobileBackendStorage.getTrainings(),
        mobileBackendStorage.getMatches(),
      ]);
      return summarizeTrainerCategories(
        categories,
        athletes,
        trainings,
        matches,
      );
    },
    (list) => list.length === 0,
  );

  return (
    <SecondaryScreenLayout title="Squadre" eyebrow="Le tue categorie">
      {status === "loading" ? (
        <StateMessage kind="loading" tone="dark" title="Carico le squadre…" />
      ) : status === "forbidden" ? (
        <StateMessage
          kind="forbidden"
          tone="dark"
          message="Il club non ti ha dato accesso a questa sezione."
        />
      ) : status === "network" || status === "error" ? (
        <StateMessage
          kind="error"
          tone="dark"
          message={errorMessage}
          actionLabel="Riprova"
          onAction={reload}
        />
      ) : status === "empty" ? (
        <StateMessage
          kind="empty"
          tone="dark"
          title="Nessuna categoria assegnata"
          message="Il club non ti ha ancora assegnato a nessun gruppo operativo."
        />
      ) : (
        (data || []).map((category) => (
          <GlassCard
            key={category.id}
            eyebrow={category.birthYearsLabel}
            title={category.name}
            style={{ gap: Spacing.xs }}
          >
            <MetaRow icon="people-outline">
              {category.athleteCount}{" "}
              {category.athleteCount === 1 ? "atleta" : "atleti"}
            </MetaRow>
            <MetaRow icon="fitness-outline">
              {category.trainingCount} allenamenti · {category.matchCount} gare
            </MetaRow>
          </GlassCard>
        ))
      )}
      <View style={{ height: Spacing.lg }} />
    </SecondaryScreenLayout>
  );
}
