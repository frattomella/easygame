import { prisma } from "./prisma";

/**
 * **Una notifica «di societa» e indirizzata, non lasciata a tutti.**
 *
 * ---
 *
 * ## Il difetto che questo modulo chiude, per la terza volta
 *
 * Nel modello `Notification`, `user_id: null` vuol dire «di club» — ma il
 * prodotto lo interpreta come **«di tutti»**: `parent-dashboard.ts` legge
 * `OR: [{ user_id: userId }, { user_id: null }]` e restituisce la riga intera,
 * **campo `data` compreso**, a qualunque genitore apra la propria area
 * famiglia.
 *
 * La stessa forma e stata trovata e chiusa gia due volte — nel giro delle
 * automazioni, dove la notifica portava «Rata scaduta: Mario Rossi — 130,00 €»
 * a ogni famiglia del club, e nello scheduler del lavoro sportivo. Le due
 * correzioni pero erano rimaste **private ai loro moduli**, e i due scrittori
 * dell'area genitore non erano mai stati toccati: la richiesta di appuntamento
 * di una famiglia — con nome del genitore, indirizzo, telefono, nome del
 * minore e il motivo scritto a mano — finiva nella bacheca di **ogni altra
 * famiglia**, e bastava aprire la propria pagina per raccoglierle tutte.
 *
 * Tre implementazioni della stessa regola sono il modo in cui la quarta nasce
 * gia sbagliata. La regola vive qui, e questo modulo e il suo proprietario
 * (CLAUDE.md §2).
 *
 * ## La regola
 *
 * Una notifica che riguarda la societa si scrive **una per destinatario**, e i
 * destinatari sono quelli che quel dato potrebbero gia vederlo. Chi chiama
 * dichiara il perimetro passando il predicato sul ruolo: non esiste un
 * perimetro giusto per tutti i contenuti — un arretrato economico e una
 * richiesta di appuntamento non si mostrano alle stesse persone.
 */

/** Vero se quel ruolo puo ricevere questa notifica di societa. */
export type ClubNotificationAudience = (role: string | null | undefined) => boolean;

/**
 * Gli account del club che soddisfano il perimetro dichiarato.
 *
 * Restituisce un elenco vuoto solo se davvero non c'e nessuno: chi chiama deve
 * poter dire «non e arrivata a nessuno» invece di dichiarare un successo.
 */
export const resolveClubNotificationRecipients = async (
  clubId: string,
  puoVedere: ClubNotificationAudience,
): Promise<string[]> => {
  const memberships = await (prisma as any).organizationUser.findMany({
    where: { organization_id: clubId },
    select: { user_id: true, role: true },
  });

  const destinatari = Array.from(
    new Set(
      memberships
        .filter((row: any) => puoVedere(row?.role))
        .map((row: any) => String(row?.user_id || "").trim())
        .filter(Boolean),
    ),
  ) as string[];

  if (destinatari.length > 0) return destinatari;

  /*
    **Un club il cui proprietario esiste solo in `clubs.creator_id`.**

    Non e un caso di scuola: `resolveOrganizationScopeForUser` riconosce
    l'`owner` anche da li, e la creazione di un club valorizza `creator_id`
    **senza** scrivere una riga di appartenenza. Senza questo ripiego la
    notifica di societa non arriverebbe a nessuno, in silenzio.
  */
  const club = await (prisma as any).club.findUnique({
    where: { id: clubId },
    select: { creator_id: true },
  });
  const creatore = String(club?.creator_id || "").trim();

  return creatore ? [creatore] : [];
};

/**
 * Scrive la notifica di societa **a ciascun destinatario**.
 *
 * Restituisce quanti ne ha raggiunti: zero significa che il club non ha nessun
 * account che possa vedere quel dato.
 */
export const createClubNotifications = async ({
  clubId,
  title,
  message,
  type,
  data,
  audience,
}: {
  clubId: string;
  title: string;
  message: string;
  type: string;
  data?: Record<string, unknown>;
  audience: ClubNotificationAudience;
}): Promise<number> => {
  const recipients = await resolveClubNotificationRecipients(clubId, audience);
  if (recipients.length === 0) return 0;

  await (prisma as any).notification.createMany({
    data: recipients.map((userId) => ({
      organization_id: clubId,
      user_id: userId,
      title,
      message,
      type,
      read: false,
      ...(data === undefined ? {} : { data }),
    })),
  });

  return recipients.length;
};
