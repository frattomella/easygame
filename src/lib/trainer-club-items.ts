import { apiRequest } from "@/lib/api/client";

/**
 * **Le due scritture dell'allenatore, sulla rotta che il ruolo ha davvero.**
 *
 * Annullare un allenamento e salvare le convocazioni di una gara passavano da
 * `updateClubDataItem`, che legge e riscrive `clubs.<collezione>` con
 * `GET`/`PATCH /api/v1/clubs`. `clubs` sta in `MANAGEMENT_ADMIN_ONLY_RESOURCES`:
 * entrambe le operazioni rispondevano **403**, e la seconda dopo aver gia
 * mostrato all'allenatore un modale pieno di nomi da spuntare (D-2).
 *
 * `trainings` e `matches` stanno invece in `TRAINER_WRITE_RESOURCES`: la rotta
 * per risorsa, `PATCH /api/v1/<collezione>/<id>`, l'allenatore la puo aprire, e
 * in piu **non riscrive l'intera collezione** — due allenatori che salvano
 * insieme due allenamenti diversi non si sovrascrivono piu a vicenda.
 */
export const updateTrainerClubItem = async (
  resource: "trainings" | "matches",
  itemId: string,
  updates: Record<string, any>,
) => {
  const response = await apiRequest<any>(
    `/api/v1/${resource}/${encodeURIComponent(itemId)}`,
    { method: "PATCH", body: { data: updates } },
  );

  if (response.error) {
    throw new Error(
      response.error.message || "Impossibile salvare la modifica",
    );
  }

  return response.data;
};
