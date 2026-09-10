import type { RsvpInvitation } from "@/services/api";

/**
 * Lo stato che `RSVPControl` disegna (spec C2), derivato dall'invito reale
 * del server — mai un checkbox, mai un ottimismo locale: finche il server
 * non conferma, lo stato resta `updating`.
 */
export type RsvpControlView =
  | { kind: "pending"; deadlineLabel: string | null }
  | { kind: "attending"; note: string | null }
  | { kind: "not_attending"; note: string | null }
  | { kind: "disabled"; reason: string; lastState: "yes" | "no" | null }
  | { kind: "none" };

/** L'invito che riguarda un evento — un solo invito per (atleta, evento): mai una ricerca ambigua. */
export function findInvitationForEvent(
  invitations: RsvpInvitation[],
  eventId: string,
): RsvpInvitation | null {
  return (
    invitations.find((invitation) => invitation.trainingId === eventId) || null
  );
}

/**
 * Il badge "Da confermare" del Calendario (WP12 — gap noto chiuso).
 *
 * **Il difetto reale.** `ParentCalendarScreen` derivava `pending` da
 * `invitations.find(...)`: se la fetch degli inviti falliva, l'elenco
 * arrivava vuoto e ogni evento appariva silenziosamente "gia confermato" —
 * un errore di rete travestito da una lista pulita, esattamente il difetto
 * che `StateMessage` esiste per non ripetere altrove.
 *
 * La firma **costringe** chi chiama a dichiarare se la fetch e riuscita:
 * non esiste modo di ottenere "none" da una lettura fallita, perche
 * `invitationsLoadFailed` non e un default con cui si possa dimenticare di
 * passare qualcosa — va deciso a ogni chiamata.
 */
export type CalendarRsvpBadge = "pending" | "unknown" | "none";

export function resolveCalendarRsvpBadge(params: {
  rsvpRequired: boolean | undefined;
  invitation: RsvpInvitation | null;
  invitationsLoadFailed: boolean;
}): CalendarRsvpBadge {
  if (!params.rsvpRequired) {
    return "none";
  }
  if (params.invitationsLoadFailed) {
    return "unknown";
  }
  return params.invitation?.state === "no_response" ? "pending" : "none";
}

const shortDeadline = (deadline: string | null): string | null => {
  if (!deadline) return null;
  const parsed = new Date(deadline);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toLocaleDateString("it-IT", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
};

/**
 * Dall'invito reale (o dalla sua assenza — un evento senza RSVP richiesto
 * non ha invito) allo stato che `RSVPControl` disegna. Non decide se si
 * *puo* rispondere: quella decisione e gia nell'invito (`canAnswer`), presa
 * dal server (`canAnswerRsvp` in `src/lib/rsvp/model.ts`).
 */
export function resolveRsvpControlView(
  invitation: RsvpInvitation | null,
): RsvpControlView {
  if (!invitation) {
    return { kind: "none" };
  }

  if (!invitation.canAnswer) {
    return {
      kind: "disabled",
      reason: invitation.blockedMessage || "Risposte non disponibili.",
      lastState: invitation.state === "no_response" ? null : invitation.state,
    };
  }

  if (invitation.state === "yes") {
    return { kind: "attending", note: invitation.note || null };
  }

  if (invitation.state === "no") {
    return { kind: "not_attending", note: invitation.note || null };
  }

  return {
    kind: "pending",
    deadlineLabel: shortDeadline(invitation.deadline),
  };
}
