import comuniDataset from "@/data/comuni-istat.json";
import capDataset from "@/data/cap-ipa.json";
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
import {
  buildCapIndex,
  lookupCap,
  type CapIndex,
  type CapTuple,
} from "@/lib/cap-model";

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
let cachedCapIndex: CapIndex | null = null;

const getIndex = (): ComuneIndex => {
  if (!cachedIndex) {
    cachedIndex = buildComuneIndex(
      (comuniDataset.comuni as unknown as ComuneTuple[]) || [],
    );
  }
  return cachedIndex;
};

const getCapIndex = (): CapIndex => {
  if (!cachedCapIndex) {
    cachedCapIndex = buildCapIndex(
      (capDataset.unique as unknown as CapTuple[]) || [],
      capDataset.ambiguous || [],
    );
  }
  return cachedCapIndex;
};

/**
 * Il CAP attaccato al comune, con il motivo quando non c'e.
 *
 * Le due tabelle restano separate — fonti diverse, licenze diverse, regole
 * diverse — e si incontrano qui, dove una risposta HTTP le deve portare
 * insieme perche il form non faccia due giri.
 */
const withPostalCode = (comune: ComuneMatch | null): ComuneMatch | null => {
  if (!comune) return null;
  const result = lookupCap(getCapIndex(), comune.belfiore);
  return {
    ...comune,
    postalCode: result.status === "unique" ? result.cap : "",
    postalCodeStatus: result.status,
  };
};

const allWithPostalCode = (comuni: ComuneMatch[]): ComuneMatch[] =>
  comuni.map((comune) => withPostalCode(comune) as ComuneMatch);

/** Provenienza del dataset, per la pagina che deve poterla dichiarare. */
export const getComuniSource = () => comuniDataset.source;

/** Provenienza del CAP: e una fonte diversa e va citata come tale. */
export const getCapSource = () => capDataset.source;

export const searchComuniByQuery = (
  query?: string | null,
  options: { limit?: number; province?: string | null } = {},
): ComuneMatch[] => allWithPostalCode(searchComuni(getIndex(), query, options));

export const lookupComuneByBelfiore = (code?: string | null) =>
  withPostalCode(findComuneByBelfiore(getIndex(), code));

export const lookupComuneByName = (
  name?: string | null,
  province?: string | null,
) => withPostalCode(findComuneByName(getIndex(), name, province));

export const lookupComuniByName = (name?: string | null) =>
  allWithPostalCode(findComuniByName(getIndex(), name));

export const classifyBelfioreCode = (code?: string | null): BelfioreOrigin =>
  classifyBelfiore(getIndex(), code);
