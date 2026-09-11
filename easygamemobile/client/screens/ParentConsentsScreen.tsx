import React, { useState } from "react";
import { View } from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import {
  ActionButton,
  BottomSheet,
  ConsentRow,
  SecondaryScreenLayout,
  SignatureText,
  StateMessage,
  StatusPill,
} from "@/components/signature";
import { useParentContext } from "@/contexts/ParentContext";
import { useParentSectionStatus } from "@/hooks/useParentSectionStatus";
import { mobileBackendStorage } from "@/services/mobile-backend-storage";
import { resolveConsentActions } from "@/lib/parent-consents";
import { formatItalianDate } from "@/lib/mobile-ui";
import { classifyFetchError, fetchErrorMessage } from "@/lib/fetch-error";
import { Spacing } from "@/constants/theme";
import type { ConsentSubjectState } from "@/services/api";

/**
 * Consensi (WP7) — `GET/POST .../consents`. Nessuna API espone al genitore
 * il testo legale integrale (nemmeno la Web app lo mostra oggi — vedi KB):
 * il foglio di dettaglio lo dichiara onestamente invece di fingere una
 * lettura che non esiste. Le transizioni ammesse si leggono da
 * `resolveConsentActions`, specchio della matrice pura del dominio; il
 * server resta l'unico a farle valere davvero (400 su una non ammessa).
 */
export default function ParentConsentsScreen() {
  const { selectedChildId } = useParentContext();
  const queryClient = useQueryClient();
  const [openConsent, setOpenConsent] = useState<ConsentSubjectState | null>(
    null,
  );
  const [deciding, setDeciding] = useState(false);
  const [decisionError, setDecisionError] = useState("");

  const consentsQuery = useQuery({
    queryKey: ["parent-consents", selectedChildId],
    queryFn: () =>
      mobileBackendStorage.getParentConsents(selectedChildId as string),
    enabled: Boolean(selectedChildId),
  });
  const { status, errorMessage } = useParentSectionStatus(
    consentsQuery,
    (list) => list.length === 0,
  );

  const handleDecide = async (decision: "accepted" | "revoked") => {
    if (!selectedChildId || !openConsent) return;
    setDeciding(true);
    setDecisionError("");
    try {
      await mobileBackendStorage.answerParentConsent(selectedChildId, {
        definitionId: openConsent.definitionId,
        status: decision,
      });
      await queryClient.invalidateQueries({
        queryKey: ["parent-consents", selectedChildId],
      });
      setOpenConsent(null);
    } catch (error) {
      const kind = classifyFetchError(error);
      setDecisionError(
        fetchErrorMessage(
          error,
          kind === "forbidden"
            ? "Accesso non consentito."
            : "Non è stato possibile registrare la scelta. Riprova.",
        ),
      );
    } finally {
      setDeciding(false);
    }
  };

  const actions = openConsent
    ? resolveConsentActions(openConsent.status)
    : null;

  return (
    <SecondaryScreenLayout
      title="Consensi"
      eyebrow="Segreteria"
      skyHeight={360}
    >
      {status === "loading" ? (
        <StateMessage kind="loading" tone="dark" title="Carico i consensi…" />
      ) : status === "forbidden" ? (
        <StateMessage
          kind="forbidden"
          tone="dark"
          message="Il club non ti ha dato accesso ai consensi."
        />
      ) : status === "network" || status === "error" ? (
        <StateMessage
          kind="error"
          tone="dark"
          message={errorMessage}
          actionLabel="Riprova"
          onAction={() => void consentsQuery.refetch()}
        />
      ) : status === "empty" ? (
        <StateMessage
          kind="empty"
          tone="dark"
          title="Nessun consenso"
          message="Il club non ha ancora definito consensi per questo figlio."
        />
      ) : (
        (consentsQuery.data || []).map((consent) => (
          <ConsentRow
            key={consent.definitionId}
            title={consent.definitionTitle || "Consenso"}
            state={consent}
            metaLabel={
              consent.decidedAt
                ? `${consent.status === "accepted" ? "Accettato" : consent.status === "revoked" ? "Revocato" : "Deciso"} il ${formatItalianDate(consent.decidedAt)}${consent.version ? ` · v${consent.version}` : ""}`
                : "Mai deciso"
            }
            onPress={() => {
              setDecisionError("");
              setOpenConsent(consent);
            }}
          />
        ))
      )}

      <BottomSheet
        visible={Boolean(openConsent)}
        onClose={() => setOpenConsent(null)}
        accessibilityLabel={openConsent?.definitionTitle || "Consenso"}
      >
        {openConsent ? (
          <View style={{ gap: Spacing.sm }}>
            <SignatureText variant="eyebrow" tone="faint">
              Consenso
            </SignatureText>
            <SignatureText variant="h3" tone="ink">
              {openConsent.definitionTitle || "Consenso"}
            </SignatureText>
            <StatusPill
              label={
                openConsent.status === "accepted"
                  ? "Accettato"
                  : openConsent.status === "revoked"
                    ? "Revocato"
                    : openConsent.status === "rejected"
                      ? "Rifiutato"
                      : "Da leggere"
              }
              variant={
                openConsent.status === "accepted"
                  ? "success"
                  : openConsent.status === "missing"
                    ? "warning"
                    : "default"
              }
            />
            {openConsent.decidedAt ? (
              <SignatureText variant="small" tone="muted">
                Ultima decisione il {formatItalianDate(openConsent.decidedAt)}
                {openConsent.version
                  ? ` · versione ${openConsent.version}`
                  : ""}
              </SignatureText>
            ) : null}
            <SignatureText variant="small" tone="muted">
              Il testo integrale di questo consenso non è ancora consultabile da
              qui — richiedilo in segreteria se vuoi rileggerlo prima di
              decidere.
            </SignatureText>

            {decisionError ? (
              <SignatureText
                variant="small"
                style={{ color: "#B91C1C", fontWeight: "600" }}
              >
                {decisionError}
              </SignatureText>
            ) : null}

            <View
              style={{
                flexDirection: "row",
                gap: Spacing.sm,
                marginTop: Spacing.sm,
              }}
            >
              {actions?.canAccept ? (
                <ActionButton
                  variant="primary"
                  loading={deciding}
                  onPress={() => void handleDecide("accepted")}
                >
                  Accetto
                </ActionButton>
              ) : null}
              {actions?.canRevoke ? (
                <ActionButton
                  variant="secondary"
                  loading={deciding}
                  onPress={() => void handleDecide("revoked")}
                >
                  Revoca
                </ActionButton>
              ) : null}
            </View>
          </View>
        ) : null}
      </BottomSheet>

      <View style={{ height: Spacing.lg }} />
    </SecondaryScreenLayout>
  );
}
