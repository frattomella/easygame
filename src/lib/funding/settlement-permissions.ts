import {
  hasAccountingPermission,
  type AccountingPermission,
} from "@/lib/accounting/permissions";
import { hasFundingPermission } from "@/lib/funding/permissions";

/**
 * **Chi puo registrare, e chi puo stornare, il bonifico di un ente** (N15).
 *
 * ---
 *
 * ## Perche una porta a due chiavi
 *
 * Registrare una liquidazione e **due atti insieme**, e finora ne veniva
 * riconosciuto uno solo. E un atto del dominio dei bandi — chiude un credito
 * verso un ente, consuma il maturato di un periodo, cambia lo stato di quel
 * periodo — **e** un atto contabile: fa entrare denaro su un conto del club, e
 * quel denaro compare nel saldo, nella prima nota e nel rendiconto.
 *
 * Le due rotte chiedevano `canManageClubConfigurationAsActor`, che di questi
 * due fatti non ne nomina nessuno e per di piu rifiuta **ogni** ruolo
 * personalizzato per costruzione. Un club che avesse creato «Amministrazione»
 * a partire dal gestore non poteva registrare un bonifico, e nessuna casella
 * poteva rimediare.
 *
 * ## Cosa cambia, e cosa no
 *
 * **Il perimetro dei ruoli canonici non cambia di una riga.** L'intersezione
 * fra `funding.manage` (proprietario e gestore) e `accounting.manage`
 * (proprietario, gestore, collaboratore, staff) e esattamente proprietario e
 * gestore: gli stessi due di prima. Cio che si aggiunge e un ruolo
 * personalizzato costruito su quei due che porti **tutte e due** le chiavi.
 *
 * L'intersezione e voluta e non e una cautela: chi tiene la cassa senza sapere
 * nulla di bandi chiuderebbe un credito senza sapere quale, e chi gestisce i
 * bandi senza toccare la cassa farebbe entrare denaro su un conto che non ha
 * il diritto di vedere. Servono tutte e due, ed e per questo che sono due.
 *
 * ## Lo storno chiede di piu, e lo chiede al posto giusto
 *
 * `accounting.reverse` sta nel perimetro **amministrativo** e non in quello
 * della segreteria — la separazione e scritta in
 * `src/lib/accounting/permissions.ts` e non la si allarga qui. Stornare il
 * bonifico di un ente e stornare un movimento, e vale la regola dei movimenti.
 *
 * ## E il conto?
 *
 * Sceglierlo e vederne gli estremi e `accounting.accounts_read`, che vive gia
 * e che questo modulo si limita a **nominare**: senza, la finestra offrirebbe
 * un elenco di conti a chi non ha il diritto di sapere che esistono.
 */

export type SettlementAction = "record" | "reverse";

const CHIAVI_CONTABILI: Record<SettlementAction, AccountingPermission> = {
  record: "accounting.manage",
  reverse: "accounting.reverse",
};

const MOTIVI: Record<SettlementAction, string> = {
  record:
    "Accesso negato: registrare il bonifico di un ente e insieme un atto sui contributi e un movimento di cassa, e il ruolo attivo non ha tutte e due le chiavi",
  reverse:
    "Accesso negato: stornare il bonifico di un ente e stornare un movimento, e il ruolo attivo non puo farlo",
};

/**
 * Vero quando il ruolo attivo puo compiere l'atto.
 *
 * **Congiunzione, non disgiunzione.** Le due chiavi rispondono a due domande
 * diverse, e chi ne ha una sola sta facendo meta di un'operazione che non si
 * puo fare a meta.
 */
export const canActOnFundingSettlement = (
  role: string | null | undefined,
  action: SettlementAction,
) =>
  hasFundingPermission(role, "funding.manage") &&
  hasAccountingPermission(role, CHIAVI_CONTABILI[action]);

/**
 * Vero quando il ruolo attivo puo **scegliere il conto** su cui il bonifico e
 * arrivato, e leggerne gli estremi.
 */
export const canChooseSettlementAccount = (role: string | null | undefined) =>
  hasAccountingPermission(role, "accounting.accounts_read");

/**
 * Solleva se il ruolo non puo. Il messaggio contiene «Accesso negato» perche il
 * route handler lo mappi su 403: e la convenzione del repository.
 */
export const assertFundingSettlementPermission = (
  role: string | null | undefined,
  action: SettlementAction,
) => {
  if (!canActOnFundingSettlement(role, action)) {
    throw new Error(MOTIVI[action]);
  }
};
