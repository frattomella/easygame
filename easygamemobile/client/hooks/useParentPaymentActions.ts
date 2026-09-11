import { useState } from "react";
import { Platform } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import * as WebBrowser from "expo-web-browser";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";

import { mobileBackendStorage } from "@/services/mobile-backend-storage";
import { classifyFetchError, fetchErrorMessage } from "@/lib/fetch-error";
import type { FamilyFiscalDocument, ParentPayment } from "@/services/api";

/**
 * Le due azioni reali dei pagamenti, condivise da elenco e dettaglio:
 *
 * - **Paga ora** — `checkoutParentPayment` apre `/pay/<token>` (una pagina
 *   EasyGame pubblica, non gia una sessione Stripe) nel browser di sistema;
 *   la mobile app non contiene logica di pagamento autorevole, solo la
 *   chiama e aspetta. Il pagamento avviene fuori dall'app: al ritorno si
 *   invalida la query, mai un aggiornamento ottimistico.
 * - **Ricevuta / Fattura** — lo stesso meccanismo dei documenti: il file
 *   (HTML stampabile, `downloadPath`) si scarica con l'header Bearer in
 *   cache e si apre con il foglio di condivisione del sistema. Sul web,
 *   dove la condivisione non c'e, si apre in una nuova scheda.
 */
export function useParentPaymentActions(selectedChildId: string | null) {
  const queryClient = useQueryClient();
  const [checkoutPaymentId, setCheckoutPaymentId] = useState<string | null>(
    null,
  );
  const [documentId, setDocumentId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const payNow = async (payment: ParentPayment) => {
    if (!selectedChildId) return;
    setCheckoutPaymentId(payment.id);
    setError("");
    try {
      const { url } = await mobileBackendStorage.checkoutParentPayment(
        selectedChildId,
        payment.id,
      );
      await WebBrowser.openBrowserAsync(url);
      await queryClient.invalidateQueries({
        queryKey: ["parent-dashboard", selectedChildId],
      });
    } catch (checkoutError) {
      const kind = classifyFetchError(checkoutError);
      setError(
        fetchErrorMessage(
          checkoutError,
          kind === "forbidden"
            ? "Accesso non consentito."
            : "Impossibile avviare il pagamento. Riprova.",
        ),
      );
    } finally {
      setCheckoutPaymentId(null);
    }
  };

  const openDocument = async (document: FamilyFiscalDocument) => {
    setDocumentId(document.id);
    setError("");
    try {
      const target = await mobileBackendStorage.resolveAuthorizedFileTarget(
        document.downloadPath,
      );
      if (Platform.OS === "web") {
        await WebBrowser.openBrowserAsync(target.url);
        return;
      }
      const destination = new File(
        Paths.cache,
        `${document.kind}-${document.number.replace(/[^\w-]+/g, "_")}.html`,
      );
      const downloaded = await File.downloadFileAsync(target.url, destination, {
        headers: target.headers,
        idempotent: true,
      });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(downloaded.uri, { mimeType: "text/html" });
      }
    } catch (documentError) {
      setError(
        fetchErrorMessage(
          documentError,
          document.kind === "invoice"
            ? "Apertura della fattura non riuscita."
            : "Apertura della ricevuta non riuscita.",
        ),
      );
    } finally {
      setDocumentId(null);
    }
  };

  return {
    payNow,
    openDocument,
    checkoutPaymentId,
    documentId,
    error,
    clearError: () => setError(""),
  };
}
