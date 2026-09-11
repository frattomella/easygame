import React, { useState } from "react";
import { View } from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import {
  ActionButton,
  BottomSheet,
  GlassRow,
  InfoNote,
  SecondaryScreenLayout,
  SectionLabel,
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
  const { selectedChildId, selectedChild } = useParentContext();
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

  const consents = consentsQuery.data || [];
  const pendingCount = consents.filter(
    (consent) => consent.status === "missing" || consent.onOutdatedVersion,
  ).length;

  const describe = (consent: ConsentSubjectState) => {
    // Quattro livelli del design (§5c): solid = aspetta la famiglia,
    // outline = nuova versione da rileggere, quiet = deciso.
    if (consent.status === "missing" && consent.required) {
      return {
        label: "Richiesto",
        tier: "solid" as const,
        tone: "warning" as const,
        color: "#F59E0B",
      };
    }
    if (consent.onOutdatedVersion) {
      return {
        label: "Nuova versione",
        tier: "outline" as const,
        tone: "warning" as const,
        color: "#F59E0B",
      };
    }
    switch (consent.status) {
      case "accepted":
        return {
          label: "Accettato",
          tier: "quiet" as const,
          tone: "success" as const,
          color: "#10B981",
        };
      case "revoked":
        return {
          label: "Revocato",
          tier: "quiet" as const,
          tone: "neutral" as const,
          color: "#64748B",
        };
      case "rejected":
        return {
          label: "Rifiutato",
          tier: "quiet" as const,
          tone: "neutral" as const,
          color: "#64748B",
        };
      default:
        return {
          label: "Da leggere",
          tier: "outline" as const,
          tone: "info" as const,
          color: "#2563EB",
        };
    }
  };

  return (
    <SecondaryScreenLayout
      title="Consensi"
      eyebrow={`Segreteria · ${selectedChild?.name || "Atleta"}`}
      contentGap={8}
      club={
        selectedChild
          ? {
              name: selectedChild.clubName,
              avatarUrl: selectedChild.clubLogoUrl,
            }
          : undefined
      }
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
        <>
          <SectionLabel
            label="Consensi"
            trailing={
              pendingCount > 0
                ? `${pendingCount} da decidere`
                : String(consents.length)
            }
          />
          {consents.map((consent) => {
            const look = describe(consent);
            return (
              <GlassRow
                key={consent.definitionId}
                icon="shield-checkmark-outline"
                iconColor={look.color}
                title={consent.definitionTitle || "Consenso"}
                meta={
                  consent.decidedAt
                    ? `${consent.status === "accepted" ? "Accettato" : consent.status === "revoked" ? "Revocato" : "Deciso"} il ${formatItalianDate(consent.decidedAt)}${consent.version ? ` · v${consent.version}` : ""}`
                    : consent.required
                      ? "Necessario per alcune funzionalità del club"
                      : "Mai deciso"
                }
                trailing={
                  <StatusPill
                    label={look.label}
                    tier={look.tier}
                    tone={look.tone}
                    small
                  />
                }
                chevron={false}
                onPress={() => {
                  setDecisionError("");
                  setOpenConsent(consent);
                }}
                accessibilityLabel={`${consent.definitionTitle || "Consenso"}, ${look.label}`}
              />
            );
          })}
        </>
      )}

      <BottomSheet
        visible={Boolean(openConsent)}
        onClose={() => setOpenConsent(null)}
        eyebrow="Consenso"
        title={openConsent?.definitionTitle || "Consenso"}
        actions={
          actions?.canAccept || actions?.canRevoke ? (
            <>
              <ActionButton
                variant="secondary"
                onPress={() => setOpenConsent(null)}
                style={{ width: 100 }}
              >
                Annulla
              </ActionButton>
              {actions?.canAccept ? (
                <ActionButton
                  variant="primary"
                  loading={deciding}
                  trailingIcon="arrow-forward"
                  onPress={() => void handleDecide("accepted")}
                  style={{ flex: 1 }}
                >
                  Accetto
                </ActionButton>
              ) : actions?.canRevoke ? (
                <ActionButton
                  variant="destructive"
                  loading={deciding}
                  onPress={() => void handleDecide("revoked")}
                  style={{ flex: 1 }}
                >
                  Revoca il consenso
                </ActionButton>
              ) : null}
            </>
          ) : undefined
        }
      >
        {openConsent ? (
          <View style={{ gap: Spacing.sm }}>
            <StatusPill
              label={describe(openConsent).label}
              tier={describe(openConsent).tier}
              tone={describe(openConsent).tone}
            />
            {openConsent.decidedAt ? (
              <SignatureText variant="small" tone="muted">
                Ultima decisione il {formatItalianDate(openConsent.decidedAt)}
                {openConsent.version
                  ? ` · versione ${openConsent.version}`
                  : ""}
              </SignatureText>
            ) : null}
            <InfoNote>
              Il testo integrale di questo consenso non è ancora consultabile da
              qui — richiedilo in segreteria se vuoi rileggerlo prima di
              decidere.
            </InfoNote>
            {decisionError ? (
              <InfoNote tone="danger">{decisionError}</InfoNote>
            ) : null}
          </View>
        ) : null}
      </BottomSheet>
    </SecondaryScreenLayout>
  );
}
