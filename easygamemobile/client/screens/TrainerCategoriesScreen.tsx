import React from "react";
import { useNavigation } from "@react-navigation/native";

import {
  GlassRow,
  SecondaryScreenLayout,
  SectionLabel,
  StateMessage,
  StatusPill,
  SummaryCard,
} from "@/components/signature";
import { mobileBackendStorage } from "@/services/mobile-backend-storage";
import { useAsyncSection } from "@/hooks/useAsyncSection";
import {
  summarizeTrainerCategories,
  type TrainerCategorySummary,
} from "@/lib/trainer-category-summary";

/**
 * Squadre/Categorie — prima schermata mobile per questa sezione (sul Web e
 * `trainer-categories-dashboard-page.tsx`). Nomi leggibili, mai
 * identificativi grezzi (`summarizeTrainerCategories`). Il perimetro (quali
 * categorie vedere) lo decide sempre il server sugli elenchi gia filtrati —
 * questa schermata aggrega, non filtra da capo.
 *
 * Composizione: design §3c — scheda scura "Squadre seguite · N" nel cielo,
 * poi una riga per categoria (scudo, nome, "anni · atleti · allenamenti ·
 * gare", pill con il numero di atleti). La riga apre Atleti, dove la rosa
 * e gia raggruppata per categoria.
 */
export default function TrainerCategoriesScreen() {
  const navigation = useNavigation();
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

  const categories = data || [];
  const totalAthletes = categories.reduce(
    (sum, category) => sum + category.athleteCount,
    0,
  );
  const openAthletes = () =>
    (
      navigation.getParent() as
        | { navigate: (...args: unknown[]) => void }
        | undefined
    )?.navigate("AthletesTab");

  return (
    <SecondaryScreenLayout
      title="Squadre"
      eyebrow="Allenatore · Le tue categorie"
      skyHeight={300}
      contentGap={10}
    >
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
        <>
          <SummaryCard
            icon="shield-outline"
            eyebrow="Squadre seguite"
            title={`${totalAthletes} ${totalAthletes === 1 ? "atleta" : "atleti"} in rosa`}
            value={String(categories.length)}
          />
          <SectionLabel
            label="Categorie"
            trailing={String(categories.length)}
            style={{ paddingTop: 4 }}
          />
          {categories.map((category) => (
            <GlassRow
              key={category.id}
              icon="shield-outline"
              iconColor="#3533CD"
              title={category.name}
              meta={[
                category.birthYearsLabel,
                `${category.trainingCount} allenamenti · ${category.matchCount} gare`,
              ]
                .filter(Boolean)
                .join(" · ")}
              trailing={
                <StatusPill
                  label={`${category.athleteCount} ${category.athleteCount === 1 ? "atleta" : "atleti"}`}
                  tier="quiet"
                  tone="neutral"
                  small
                />
              }
              onPress={openAthletes}
            />
          ))}
        </>
      )}
    </SecondaryScreenLayout>
  );
}
