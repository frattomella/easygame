import { updateEvent } from "@/lib/events/client";

/**
 * **Le due scritture dell'allenatore, sulla rotta che il ruolo ha davvero.**
 *
 * Da 5C la rotta e quella del dominio degli eventi: il parametro `resource`
 * resta nella firma perche le quattro schermate che la chiamano lo passano, e
 * cambiarlo qui vorrebbe dire toccarle tutte per una cosa che non le riguarda.
 * Sparira insieme all'ultima.
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
  _resource: "trainings" | "matches",
  itemId: string,
  updates: Record<string, any>,
) => updateEvent(itemId, updates);
