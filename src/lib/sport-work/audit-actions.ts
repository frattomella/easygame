/**
 * Le azioni tracciate dal dominio **Lavoro sportivo e compensi**.
 *
 * Stanno in un modulo puro e non dentro `src/lib/server/audit.ts` per una
 * ragione pratica: le usa anche il client — la scheda «Adempimenti» filtra il
 * registro per prefisso `sport_work.` — e importare un modulo di `server/` da
 * un componente e vietato.
 *
 * Il formato e quello del repository: `dominio.oggetto.verbo`, cosi il filtro
 * per prefisso e utile.
 *
 * **La riga che conta piu di tutte** e
 * `sport_work.payment.without_current_self_declaration`. Registra il momento in
 * cui una persona ha deciso di erogare un compenso pur sapendo che il calcolo
 * contributivo era incompleto. Non e un log tecnico: e la prova di cosa il
 * club sapeva, quando, e chi se ne e assunto la responsabilita. Se un giorno
 * arrivano contributi omessi e sanzioni, quella riga e il documento che dice
 * come sono andate le cose.
 */
export const SPORT_WORK_AUDIT_ACTIONS = {
  personCreated: "sport_work.person.created",
  personUpdated: "sport_work.person.updated",
  relationshipCreated: "sport_work.relationship.created",
  relationshipUpdated: "sport_work.relationship.updated",
  contractAttached: "sport_work.contract.attached",
  planCreated: "sport_work.plan.created",
  installmentChanged: "sport_work.installment.changed",
  compensationPaid: "sport_work.compensation.paid",
  compensationReversed: "sport_work.compensation.reversed",
  declarationCreated: "sport_work.self_declaration.created",
  paymentWithoutCurrentDeclaration:
    "sport_work.payment.without_current_self_declaration",
  bonusCreated: "sport_work.bonus.created",
  bonusPaid: "sport_work.bonus.paid",
  reimbursementApproved: "sport_work.reimbursement.approved",
  reimbursementPaid: "sport_work.reimbursement.paid",
  vatInvoicePaid: "sport_work.vat_invoice.paid",
  obligationCompleted: "sport_work.obligation.completed",
  obligationsSynced: "sport_work.obligations.synced",
  schedulerRun: "sport_work.scheduler.run",
} as const;

export type SportWorkAuditAction =
  (typeof SPORT_WORK_AUDIT_ACTIONS)[keyof typeof SPORT_WORK_AUDIT_ACTIONS];

export const SPORT_WORK_AUDIT_PREFIX = "sport_work.";
