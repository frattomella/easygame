/**
 * Consegna di un kit: stato per articolo, stato derivato, taglia proposta.
 *
 * ## Il problema
 *
 * Un kit non si consegna: si consegnano i suoi articoli, e quasi mai tutti
 * insieme. «Maglia e pantaloncino consegnati, felpa in arrivo, borsa esaurita»
 * e la situazione normale di ottobre, non un'eccezione. Finche l'assegnazione
 * aveva **un** solo stato, l'operatore doveva scegliere fra dire una cosa
 * falsa («consegnato») e non dire niente («assegnato»), e la domanda vera —
 * *a chi manca ancora qualcosa?* — non aveva risposta.
 *
 * ## Il modello
 *
 * Lo stato sta sull'**articolo**. Quello del kit non si scrive: si **deriva**.
 * Uno stato di kit scritto a mano si disallinea dai suoi articoli al primo
 * aggiornamento, e da quel momento nessuno dei due e attendibile.
 *
 * | Stato articolo | Significato |
 * |---|---|
 * | `to_prepare` | l'articolo esiste ma non e pronto (riservato, assegnato, da ordinare, in produzione) |
 * | `ready` | preparato, aspetta solo di essere consegnato |
 * | `delivered` | consegnato, con data |
 * | `unavailable` | non c'e: esaurito, annullato, taglia mancante |
 *
 * | Stato kit (derivato) | Quando |
 * |---|---|
 * | `to_prepare` | nessun articolo consegnato |
 * | `partial` | qualcuno consegnato, qualcuno no |
 * | `completed` | tutto il consegnabile e consegnato |
 *
 * Un articolo `unavailable` **non impedisce** il completamento: se la borsa e
 * esaurita e tutto il resto e stato consegnato, il kit e completato per quanto
 * dipende dalla societa. Resta contato a parte e visibile, cosi la borsa non
 * sparisce dal conteggio: `3/4 consegnati · 1 non disponibile`.
 */

import type {
  ClothingAssignment,
  ClothingAssignmentItem,
  ClothingAssignmentStatus,
  ClothingCatalogItem,
  ClothingSizeSource,
} from "./clothing-inventory-utils";
import type { ClothingSizes } from "./clothing-sizes";

export type ClothingItemState =
  | "to_prepare"
  | "ready"
  | "delivered"
  | "unavailable";

export type KitDeliveryState = "to_prepare" | "partial" | "completed";

export const CLOTHING_ITEM_STATE_LABELS: Record<ClothingItemState, string> = {
  to_prepare: "Da preparare",
  ready: "Pronto",
  delivered: "Consegnato",
  unavailable: "Non disponibile",
};

export const KIT_DELIVERY_STATE_LABELS: Record<KitDeliveryState, string> = {
  to_prepare: "Da preparare",
  partial: "Parziale",
  completed: "Completato",
};

/**
 * Lo stato del ciclo con cui si scrive ciascuno dei quattro stati operativi.
 *
 * Gli stati dell'ordine al fornitore (`to_order`, `ordered`, `in_production`)
 * restano leggibili ma non si scelgono da qui: li muove il flusso fornitore,
 * e per la segreteria sono tutti «da preparare».
 */
const STATE_TO_STATUS: Record<ClothingItemState, ClothingAssignmentStatus> = {
  to_prepare: "assigned",
  ready: "ready",
  delivered: "delivered",
  unavailable: "unavailable",
};

const STATUS_TO_STATE: Record<ClothingAssignmentStatus, ClothingItemState> = {
  reserved: "to_prepare",
  assigned: "to_prepare",
  to_order: "to_prepare",
  ordered: "to_prepare",
  in_production: "to_prepare",
  ready: "ready",
  received: "ready",
  delivered: "delivered",
  unavailable: "unavailable",
  cancelled: "unavailable",
};

export const getItemState = (
  item: Pick<ClothingAssignmentItem, "status" | "delivered">,
): ClothingItemState => {
  // `delivered` e un flag storico che convive con lo stato: quando dice
  // consegnato ha ragione, perche nessun flusso lo alza senza consegnare.
  if (item.delivered) return "delivered";
  return STATUS_TO_STATE[item.status] || "to_prepare";
};

export const getStatusForItemState = (state: ClothingItemState) =>
  STATE_TO_STATUS[state];

export type KitDeliveryProgress = {
  total: number;
  delivered: number;
  ready: number;
  toPrepare: number;
  unavailable: number;
  /** Articoli che ci si aspetta di consegnare: il totale meno i non disponibili. */
  deliverable: number;
  state: KitDeliveryState;
  /** `2/4 consegnati`, con la coda dei non disponibili quando ce ne sono. */
  label: string;
};

export const getKitDeliveryProgress = (
  assignment: Pick<ClothingAssignment, "items">,
): KitDeliveryProgress => {
  const items = Array.isArray(assignment?.items) ? assignment.items : [];
  let delivered = 0;
  let ready = 0;
  let toPrepare = 0;
  let unavailable = 0;

  items.forEach((item) => {
    const state = getItemState(item);
    if (state === "delivered") delivered += 1;
    else if (state === "ready") ready += 1;
    else if (state === "unavailable") unavailable += 1;
    else toPrepare += 1;
  });

  const total = items.length;
  const deliverable = total - unavailable;

  const state: KitDeliveryState =
    delivered === 0
      ? "to_prepare"
      : deliverable > 0 && delivered >= deliverable
        ? "completed"
        : "partial";

  const label = total
    ? `${delivered}/${total} consegnati${
        unavailable ? ` · ${unavailable} non disponibil${unavailable === 1 ? "e" : "i"}` : ""
      }`
    : "Nessun articolo";

  return {
    total,
    delivered,
    ready,
    toPrepare,
    unavailable,
    deliverable,
    state,
    label,
  };
};

/**
 * Lo stato dell'assegnazione che corrisponde allo stato derivato del kit.
 *
 * Serve solo a tenere allineato il campo `status` che il resto
 * dell'applicazione legge gia (elenchi, filtri, ordini fornitore): la verita
 * resta sugli articoli, questo e il suo riassunto.
 */
export const deriveAssignmentStatus = (
  assignment: Pick<ClothingAssignment, "items" | "status">,
): ClothingAssignmentStatus => {
  const items = Array.isArray(assignment?.items) ? assignment.items : [];
  if (!items.length) return assignment.status;

  const progress = getKitDeliveryProgress(assignment);
  if (progress.state === "completed") return "delivered";
  if (progress.unavailable === items.length) return "unavailable";
  if (progress.delivered > 0) return "assigned";
  if (progress.ready > 0 && progress.ready + progress.unavailable === items.length) {
    return "ready";
  }

  // Nessun articolo si e mosso: l'assegnazione tiene lo stato che aveva, cosi
  // un ordine al fornitore non retrocede a «assegnato» solo perche lo si e
  // riletto.
  return assignment.status;
};

/**
 * Cambia lo stato di **un** articolo e riallinea il riassunto del kit.
 *
 * Funzione pura: non tocca il magazzino e non scrive niente. Il magazzino si
 * muove alla creazione dell'assegnazione e con
 * `updateClothingAssignmentStatus`; qui si registra una consegna, che e un
 * fatto della segreteria.
 */
export const setAssignmentItemState = ({
  assignment,
  itemId,
  state,
  deliveredAt,
  notes,
}: {
  assignment: ClothingAssignment;
  itemId: string;
  state: ClothingItemState;
  /** Data di consegna in ISO. Obbligatoria di fatto quando lo stato e `delivered`. */
  deliveredAt?: string | null;
  notes?: string;
}): ClothingAssignment => {
  const status = getStatusForItemState(state);
  const items = assignment.items.map((item) => {
    if (item.id !== itemId) return item;

    return {
      ...item,
      status,
      delivered: state === "delivered",
      deliveredAt:
        state === "delivered"
          ? deliveredAt || item.deliveredAt || new Date().toISOString()
          : null,
      notes: notes === undefined ? item.notes : notes,
    } satisfies ClothingAssignmentItem;
  });

  const next = { ...assignment, items };

  return {
    ...next,
    status: deriveAssignmentStatus(next),
    updatedAt: new Date().toISOString(),
  };
};

/* -------------------------------------------------------------------------- */
/* Taglie                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Da quale taglia dell'anagrafica prende un articolo.
 *
 * Vince la configurazione dell'articolo. Quando manca si guarda il **tipo**,
 * che nei dati reali e una parola italiana scritta a mano: e un ripiego, non
 * il modello, e per questo si puo sempre sovrascrivere. Non si guarda il nome
 * commerciale — «Kappa Kombat 2024» non dice se e una maglia.
 */
export const resolveItemSizeSource = (
  item: Pick<ClothingCatalogItem, "sizeSource" | "type"> | null | undefined,
): ClothingSizeSource => {
  if (item?.sizeSource && item.sizeSource !== "none") {
    return item.sizeSource;
  }

  const type = String(item?.type || "")
    .trim()
    .toLowerCase();

  if (!type) return "none";
  if (/scarp|calzatur|shoe|sneaker/.test(type)) return "shoes";
  if (/pantalon|short|calzoncin|pants|tuta|leggin/.test(type)) return "pants";
  if (/magli|shirt|felp|giacc|polo|canott|top|k-?way/.test(type)) return "shirt";

  return "none";
};

/**
 * La taglia da proporre per un articolo, letta dall'anagrafica della persona.
 *
 * **Proporre non e scrivere.** Il valore torna qui e finisce nel modulo di
 * assegnazione come precompilazione: se l'operatore lo cambia, cambia
 * l'assegnazione e **non** l'anagrafica. Sono due dati diversi — la taglia
 * della persona e la taglia di quel capo — e confonderli significa che
 * consegnare una maglia una taglia piu grande riscrive l'anagrafica di un
 * ragazzino che non e cresciuto.
 */
export const proposeSizeForItem = ({
  sizes,
  item,
}: {
  sizes?: Partial<ClothingSizes> | null;
  item?: Pick<ClothingCatalogItem, "sizeSource" | "type" | "sizes"> | null;
}): string => {
  const source = resolveItemSizeSource(item);
  if (source === "none") return "";

  const proposed = String(
    (source === "shirt"
      ? sizes?.shirtSize
      : source === "pants"
        ? sizes?.pantsSize
        : sizes?.shoeSize) || "",
  ).trim();

  if (!proposed) return "";

  // La taglia dell'anagrafica vale solo se l'articolo la prevede: proporre
  // una `L` per un capo che si vende in `46/48` non aiuta, confonde.
  const available = Array.isArray(item?.sizes) ? item.sizes : [];
  if (available.length && !available.includes(proposed)) {
    return "";
  }

  return proposed;
};

/**
 * Le taglie da proporre per tutti i componenti di un kit, in un colpo solo.
 * Restituisce solo le voci con una proposta: chi la consuma distingue «non
 * proposta» da «proposta vuota» senza un secondo controllo.
 */
export const proposeSizesForItems = ({
  sizes,
  items,
}: {
  sizes?: Partial<ClothingSizes> | null;
  items: ClothingCatalogItem[];
}): Record<string, string> => {
  const proposals: Record<string, string> = {};

  items.forEach((item) => {
    const proposed = proposeSizeForItem({ sizes, item });
    if (proposed) proposals[item.id] = proposed;
  });

  return proposals;
};

/**
 * La taglia effettiva di un articolo assegnato, e se e un override.
 *
 * L'override non e un errore da correggere: e l'informazione che quel capo e
 * stato dato in una taglia diversa da quella in anagrafica, e va mostrata
 * senza che nessuno tocchi l'anagrafica.
 */
export const describeAssignedSize = ({
  assignedSize,
  proposedSize,
}: {
  assignedSize?: string | null;
  proposedSize?: string | null;
}) => {
  const assigned = String(assignedSize || "").trim();
  const proposed = String(proposedSize || "").trim();

  return {
    size: assigned || proposed,
    proposed,
    isOverride: Boolean(assigned && proposed && assigned !== proposed),
  };
};
