import comuniDataset from "@/data/comuni-istat.json";
import {
  buildComuneIndex,
  classifyBelfiore,
  findComuneByBelfiore,
  findComuneByName,
  findComuniByName,
  searchComuni,
  type BelfioreOrigin,
  type ComuneIndex,
  type ComuneMatch,
  type ComuneTuple,
} from "@/lib/comuni-model";

/**
 * L'archivio dei comuni, indicizzato una volta sola.
 *
 * **Perche sta sul server.** Il dataset ISTAT e circa 220 kB di JSON. Portarlo
 * nel bundle del client vorrebbe dire scaricarlo su ogni pagina che ha un
 * campo anagrafico, per una tendina che si usa dieci secondi. La ricerca sta
 * qui e viaggia su `/api/v1/comuni`, che risponde con le poche righe che
 * servono.
 *
 * L'indice si costruisce alla prima richiesta e resta in memoria per la vita
 * del processo: e una tabella di riferimento, non un dato di club, e non ha
 * nessuna dimensione multi-tenant.
 */

let cachedIndex: ComuneIndex | null = null;

const getIndex = (): ComuneIndex => {
  if (!cachedIndex) {
    cachedIndex = buildComuneIndex(
      (comuniDataset.comuni as unknown as ComuneTuple[]) || [],
    );
  }
  return cachedIndex;
};

/** Provenienza del dataset, per la pagina che deve poterla dichiarare. */
export const getComuniSource = () => comuniDataset.source;

export const searchComuniByQuery = (
  query?: string | null,
  options: { limit?: number; province?: string | null } = {},
): ComuneMatch[] => searchComuni(getIndex(), query, options);

export const lookupComuneByBelfiore = (code?: string | null) =>
  findComuneByBelfiore(getIndex(), code);

export const lookupComuneByName = (
  name?: string | null,
  province?: string | null,
) => findComuneByName(getIndex(), name, province);

export const lookupComuniByName = (name?: string | null) =>
  findComuniByName(getIndex(), name);

export const classifyBelfioreCode = (code?: string | null): BelfioreOrigin =>
  classifyBelfiore(getIndex(), code);
