import { prisma } from "@/lib/server/prisma";
import {
  hasBookingConflict,
  normalizeStructure,
  type ClubStructure,
  type StructureBooking,
} from "@/lib/structures-utils";

/**
 * **Le strutture del club, lette e scritte dal server.**
 *
 * ---
 *
 * ## Il difetto che questo file chiude (PP-02 §L)
 *
 * La rotta con cui una famiglia prenota un campo leggeva le strutture con
 * `getClubStructures` di `src/lib/simplified-db.ts`. Quel modulo e il **dominio
 * che gira nel browser**: parla con `/api/v1/...` attraverso `apiRequest`, che
 * fa `fetch("/api/v1/clubs?...")` — un percorso **relativo**.
 *
 * Dentro un route handler non c'e nessuna pagina da cui risolverlo, e Node
 * risponde `Failed to parse URL from /api/v1/clubs`. La funzione non propaga
 * l'errore: ha un `catch` che restituisce `[]`.
 *
 * Il risultato misurato: **ogni** richiesta di prenotazione riceveva
 * `404 Struttura non prenotabile`, su qualunque struttura, di qualunque club,
 * anche quella dichiarata prenotabile un istante prima nella stessa pagina.
 * Non era un permesso mancante ne una configurazione: la rotta non trovava
 * nessuna struttura perche non ne aveva lette.
 *
 * E la ragione per cui nessun test lo vedeva: il vaglio a monte —
 * «questa struttura e prenotabile?» — funziona ed e coperto, ma gira su un
 * elenco vuoto, e un elenco vuoto supera qualunque vaglio.
 *
 * ## Perche non basta correggere il chiamante
 *
 * Perche il chiamante e giusto e il modulo e nel posto sbagliato. Le strutture
 * sono un campo JSON del club (`clubs.structures`) e non hanno un mirror in
 * `club_resource_items` — non stanno in `CLUB_RESOURCE_TYPES` — quindi la
 * lettura e la scrittura server-side sono una query sola, e devono vivere in
 * `src/lib/server/`, come vuole CLAUDE.md §10.
 */

const asArray = (value: unknown): any[] => (Array.isArray(value) ? value : []);

export const readClubStructures = async (
  organizationId: string,
): Promise<ClubStructure[]> => {
  const id = String(organizationId || "").trim();
  if (!id) return [];

  const club = await prisma.club.findUnique({
    where: { id },
    select: { structures: true },
  });

  return asArray(club?.structures).map(normalizeStructure);
};

export type AppendBookingOutcome =
  | { ok: true }
  | { ok: false; reason: "structure_missing" | "conflict" };

/**
 * **Aggiunge una prenotazione, rileggendo le strutture nella transazione.**
 *
 * La rilettura non e una cerimonia: fra il controllo di conflitto della rotta e
 * la scrittura passa una manciata di millisecondi, e in quella finestra la
 * segreteria puo aver salvato la scheda della struttura da un'altra parte —
 * riscrivendo l'array intero. Senza rileggere, la prenotazione della famiglia
 * verrebbe scritta su una fotografia vecchia e cancellerebbe cio che nel
 * frattempo e stato messo.
 *
 * **Non e un controllo di concorrenza**, e non va scambiato per tale: le
 * prenotazioni vivono in un array JSON senza versione, e due famiglie che
 * premono nello stesso istante possono ancora sovrascriversi. La chiusura vera
 * e una tabella con il suo indice unico parziale — la stessa forma che
 * ADR-0098 ha dato agli eventi e ADR-0101 agli appuntamenti — e sta fra i
 * residui di PP-02 (PP02-D3). Qui si restringe la finestra e si dice quanto e
 * larga quella che resta.
 */
export const appendFamilyStructureBooking = async (input: {
  organizationId: string;
  structureId: string;
  booking: StructureBooking;
}): Promise<AppendBookingOutcome> => {
  const organizationId = String(input.organizationId || "").trim();
  const structureId = String(input.structureId || "").trim();

  return prisma.$transaction(async (tx) => {
    const club = await tx.club.findUnique({
      where: { id: organizationId },
      select: { structures: true },
    });

    const structures = asArray(club?.structures);
    const index = structures.findIndex(
      (structure: any) =>
        String(structure?.id || "").trim() === structureId,
    );

    if (index < 0) return { ok: false, reason: "structure_missing" } as const;

    const corrente = normalizeStructure(structures[index]);
    if (hasBookingConflict(corrente.bookings || [], input.booking)) {
      return { ok: false, reason: "conflict" } as const;
    }

    const successive = structures.map((structure: any, posizione: number) =>
      posizione === index
        ? {
            ...structure,
            bookings: [...asArray(structure?.bookings), input.booking],
          }
        : structure,
    );

    await tx.club.update({
      where: { id: organizationId },
      data: { structures: successive as any },
    });

    return { ok: true } as const;
  });
};
