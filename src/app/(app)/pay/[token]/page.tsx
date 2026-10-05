import { PublicPaymentLinkPage } from "@/components/payments/PublicPaymentLinkPage";

/**
 * La pagina pubblica del link di pagamento (G-06, W2-B).
 *
 * Fuori dalla chrome dell'applicazione e fuori dai prefissi protetti di
 * `src/middleware.ts`: chi la apre non ha una sessione, e non deve averne una.
 * Il token resta nel percorso e non finisce mai in un parametro di query,
 * perche una query string entra nei log di accesso e nella cronologia
 * condivisa di un browser.
 */

type PublicPaymentRouteProps = {
  params: {
    token: string;
  };
};

export default function PublicPaymentRoute({
  params,
}: PublicPaymentRouteProps) {
  return <PublicPaymentLinkPage token={params.token} />;
}
