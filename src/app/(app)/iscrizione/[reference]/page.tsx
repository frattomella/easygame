import { PublicEnrollmentStatusPage } from "@/components/enrollment/PublicEnrollmentStatusPage";

/**
 * La pagina pubblica di una domanda di iscrizione (`/iscrizione/[reference]`).
 *
 * Il percorso lo dichiara `buildEnrollmentReceiptPath` in
 * `src/lib/forms/enrollment-receipt.ts`, che e il proprietario di quella
 * stringa: se cambia, cambia in un posto solo.
 *
 * Fuori dalla chrome dell'applicazione e fuori dai prefissi protetti di
 * `src/middleware.ts`: chi la apre non ha una sessione, e non deve averne una.
 * Il riferimento resta nel percorso e non finisce mai in un parametro di
 * query, perche una query string entra nei log di accesso e nella cronologia
 * condivisa di un browser — ed e la stessa regola gia applicata al token del
 * link di pagamento.
 */

type PublicEnrollmentRouteProps = {
  params: {
    reference: string;
  };
};

export default function PublicEnrollmentRoute({
  params,
}: PublicEnrollmentRouteProps) {
  return <PublicEnrollmentStatusPage reference={params.reference} />;
}
