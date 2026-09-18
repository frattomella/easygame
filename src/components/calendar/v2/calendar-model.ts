import { ACTIVITY_STATUS, PERSON_STATUS, type StatusSpec } from "@/lib/web/status";
import { formatLocalDateOnly } from "@/lib/date-only";
import { trainingDisplayNote, trainingDisplayTitle } from "@/lib/events/training-presenter";

/**
 * Il modello puro del calendario unico nel Web V2 (ADR-0098: allenamenti e
 * gare sono la stessa riga con un `kind` diverso). Niente React: la forma
 * dell'evento come la rotta lo manda, la parola di stato, il raggruppamento
 * per giorno, i confini del mese e il collegamento alla pagina che **opera**
 * sull'evento.
 */
export type EventoCalendario = {
  id: string;
  eventId?: string;
  kind: "training" | "match";
  title?: string;
  date: string;
  time: string;
  end_time?: string;
  status: string;
  category?: string;
  categoryId?: string | null;
  siteId?: string | null;
  location?: string;
  opponent?: string;
  groupIds?: string[];
  seasonId?: string | null;
  rsvpRequired?: boolean;
  capacity?: number | null;
};

export type TipoEvento = "all" | "training" | "match";

export const dayKeyOf = (evento: Pick<EventoCalendario, "date">) => String(evento.date || "").slice(0, 10);

export const isGara = (evento: Pick<EventoCalendario, "kind">) => evento.kind === "match";

/**
 * Il titolo di riga: per una gara quello dell'evento o «Gara contro …»; per
 * un allenamento **il tipo**, con la categoria nel badge accanto (ADR-0198
 * §3) — un titolo scritto a mano che non e una data e la nota.
 */
export const titoloDi = (evento: EventoCalendario) =>
  isGara(evento) ? evento.title || `Gara contro ${evento.opponent || "avversario"}` : trainingDisplayTitle(evento);

export const notaDi = (evento: EventoCalendario) => (isGara(evento) ? null : trainingDisplayNote(evento));

/** La parola di stato (guideline 09 §9.4): Annullato · Completato · Archiviato · Programmato. */
export const statoDi = (status: string): StatusSpec => {
  switch (String(status || "").toLowerCase()) {
    case "cancelled":
    case "canceled":
    case "annullato":
    case "annullata":
      return ACTIVITY_STATUS.cancelled;
    case "completed":
    case "completato":
      return ACTIVITY_STATUS.completed;
    case "archived":
    case "archiviato":
      return PERSON_STATUS.archived;
    default:
      return ACTIVITY_STATUS.scheduled;
  }
};

export const isAnnullato = (evento: Pick<EventoCalendario, "status">) =>
  statoDi(evento.status) === ACTIVITY_STATUS.cancelled;

/** I giorni con i loro eventi, in ordine, come la V1 (`perGiorno`). */
export const raggruppaPerGiorno = (eventi: EventoCalendario[]) => {
  const mappa = new Map<string, EventoCalendario[]>();
  for (const evento of eventi) {
    const giorno = dayKeyOf(evento);
    if (!giorno) continue;
    mappa.set(giorno, [...(mappa.get(giorno) || []), evento]);
  }
  return Array.from(mappa.entries())
    .sort(([sinistra], [destra]) => sinistra.localeCompare(destra))
    .map(([giorno, righe]) => ({
      giorno,
      righe: righe.sort((sinistra, destra) => String(sinistra.time || "").localeCompare(String(destra.time || ""))),
    }));
};

/** Il filtro client della V1: sede, categoria (id o nome), gruppo. */
export const filtraEventi = (
  eventi: EventoCalendario[],
  { sede, categoria, gruppo }: { sede: string; categoria: string; gruppo: string },
) =>
  eventi.filter((evento) => {
    if (sede && String(evento.siteId || "") !== sede) return false;
    if (categoria && String(evento.categoryId || "") !== categoria && String(evento.category || "") !== categoria) {
      return false;
    }
    if (gruppo && !(evento.groupIds || []).includes(gruppo)) return false;
    return true;
  });

/** Primo e ultimo giorno civile del mese di `anchor`, come `YYYY-MM-DD`. */
export const confiniDelMese = (anchor: Date) => ({
  da: formatLocalDateOnly(new Date(anchor.getFullYear(), anchor.getMonth(), 1)),
  a: formatLocalDateOnly(new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0)),
});

/**
 * Dove si opera sull'evento: la pagina del suo tipo, aperta sul suo giorno.
 * `/training` legge gia `?date=`; `/matches` lo legge dalla Wave D.
 */
export const linkOperativo = (evento: EventoCalendario) => {
  const giorno = dayKeyOf(evento);
  const base = isGara(evento) ? "/matches" : "/training";
  return giorno ? `${base}?date=${giorno}` : base;
};

/** `?date=YYYY-MM-DD` → il giorno civile locale, o `null`. */
export const leggiDataRichiesta = (valore: string | null): Date | null => {
  if (!valore || !/^\d{4}-\d{2}-\d{2}$/.test(valore)) return null;
  const data = new Date(`${valore}T00:00:00`);
  return Number.isNaN(data.getTime()) ? null : data;
};
