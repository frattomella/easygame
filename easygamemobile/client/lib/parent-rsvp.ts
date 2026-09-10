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
