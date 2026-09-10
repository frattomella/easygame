import type {
  Athlete,
  ClubCategorySummary,
  Match,
  Training,
} from "@/services/api";

export interface TrainerCategorySummary {
  id: string;
  name: string;
  birthYearsLabel?: string;
  athleteCount: number;
  trainingCount: number;
  matchCount: number;
  athleteNames: string[];
}

const normalize = (value: unknown) =>
  String(value ?? "")
    .trim()
    .toLowerCase();

const belongsTo = (categoryId: unknown, category: unknown) =>
  Boolean(categoryId) && normalize(categoryId) === normalize(category);

/**
 * Un gruppo operativo (categoria+sede) come lo mostra la schermata Squadre:
 * nome leggibile — mai un identificativo grezzo, l'identita e
 * l'identificativo ma il nome e cio che si legge — con quanti atleti,
 * allenamenti e gare gli appartengono. Stesso calcolo del Web
 * (`trainer-categories-dashboard-page.tsx`): conta su elenchi gia filtrati
 * dal server sul perimetro dell'allenatore, non un secondo perimetro qui.
 */
export const summarizeTrainerCategories = (
  categories: ClubCategorySummary[],
  athletes: Athlete[],
  trainings: Training[],
  matches: Match[],
): TrainerCategorySummary[] =>
  categories.map((category) => {
    const categoryAthletes = athletes.filter((athlete) =>
      belongsTo(athlete.categoryId, category.id),
    );

    return {
      id: category.id,
      name: category.name,
      birthYearsLabel: category.birthYearsLabel,
      athleteCount: categoryAthletes.length,
      trainingCount: trainings.filter((training) =>
        belongsTo(training.categoryId, category.id),
      ).length,
      matchCount: matches.filter((match) =>
        belongsTo(match.categoryId, category.id),
      ).length,
      athleteNames: categoryAthletes.map((athlete) => athlete.name),
    };
  });
