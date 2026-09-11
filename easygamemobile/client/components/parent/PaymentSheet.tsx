import React from "react";
import { StyleSheet, View } from "react-native";

import {
  ActionButton,
  BottomSheet,
  GlassSurface,
  IconChip,
  InfoNote,
  SelectionRing,
  SignatureText,
} from "@/components/signature";
import { EGGlass, EGShadow } from "@/constants/theme";
import { formatParentCurrency } from "@/lib/parent-payments";
import { resolveRemainingAmount } from "@/lib/parent-payment-plan";
import type { FamilyCheckoutState, ParentPayment } from "@/services/api";

interface PaymentSheetProps {
  payment: ParentPayment | null;
  athleteName: string;
  checkout: FamilyCheckoutState | null;
  loading: boolean;
  onClose: () => void;
  onConfirm: (payment: ParentPayment) => void;
}

/**
 * Il foglio "Come vuoi pagare?" del prototipo (`sheetIsPay`): riga di
 * riepilogo (rata · atleta · importo), le opzioni di pagamento come righe
 * di scelta con anello, poi Annulla + "Paga X". L'unico canale reale da
 * mobile e il checkout online del club (`payments.online`): quando non e
 * disponibile la riga lo dice con il motivo del server e il CTA resta
 * spento — "In segreteria" e informativo, non un pulsante che finge.
 */
export function PaymentSheet({
  payment,
  athleteName,
  checkout,
  loading,
  onClose,
  onConfirm,
}: PaymentSheetProps) {
  const remaining = payment ? resolveRemainingAmount(payment) : 0;
  const onlineAvailable = Boolean(checkout?.available);

  return (
    <BottomSheet
      visible={Boolean(payment)}
      onClose={onClose}
      eyebrow={
        payment
          ? `${payment.description || "Quota"} · ${formatParentCurrency(remaining)}`
          : ""
      }
      title="Come vuoi pagare?"
      actions={
        <>
          <ActionButton
            variant="secondary"
            onPress={onClose}
            style={styles.cancel}
          >
            Annulla
          </ActionButton>
          <ActionButton
            trailingIcon="arrow-forward"
            loading={loading}
            disabled={!onlineAvailable || !payment}
            onPress={() => payment && onConfirm(payment)}
            style={styles.confirm}
          >
            {`Paga ${formatParentCurrency(remaining)}`}
          </ActionButton>
        </>
      }
    >
      <View style={styles.summary}>
        <SignatureText style={styles.summaryLabel} numberOfLines={2}>
          {`${payment?.description || "Quota"} · ${athleteName}`}
        </SignatureText>
        <SignatureText style={styles.summaryAmount}>
          {formatParentCurrency(remaining)}
        </SignatureText>
      </View>

      <GlassSurface
        tone={onlineAvailable ? "strong" : "light"}
        corner="control"
        style={[
          styles.option,
          EGShadow.row,
          onlineAvailable ? styles.optionOn : null,
        ]}
      >
        <View style={styles.optionInner}>
          <IconChip name="card-outline" color="#2563EB" size={40} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <SignatureText style={styles.optionTitle}>
              Carta o pagamento online
            </SignatureText>
            <SignatureText style={styles.optionMeta} numberOfLines={2}>
              {onlineAvailable
                ? "Checkout sicuro EasyGame · si apre nel browser"
                : checkout?.message || "Non disponibile al momento"}
            </SignatureText>
          </View>
          <SelectionRing on={onlineAvailable} />
        </View>
      </GlassSurface>

      <GlassSurface
        tone="light"
        corner="control"
        style={[styles.option, EGShadow.row]}
      >
        <View style={styles.optionInner}>
          <IconChip name="storefront-outline" color="#2563EB" size={40} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <SignatureText style={styles.optionTitle}>
              In segreteria
            </SignatureText>
            <SignatureText style={styles.optionMeta}>
              Contanti o POS negli orari del club
            </SignatureText>
          </View>
        </View>
      </GlassSurface>

      {!onlineAvailable && checkout?.message ? (
        <InfoNote>{checkout.message}</InfoNote>
      ) : null}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  summary: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: 10,
    backgroundColor: "rgba(11,26,58,0.04)",
    borderWidth: 1,
    borderColor: EGGlass.hairline,
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
    borderBottomRightRadius: 5,
    borderBottomLeftRadius: 14,
    padding: 14,
    marginBottom: 2,
  },
  summaryLabel: {
    flex: 1,
    color: "rgba(11,26,58,0.62)",
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "600",
  },
  summaryAmount: {
    color: "#0B1A3A",
    fontSize: 22,
    lineHeight: 26,
    fontWeight: "800",
    letterSpacing: -0.66,
    fontVariant: ["tabular-nums"],
  },
  option: {
    minHeight: 64,
    borderColor: EGGlass.border,
  },
  optionOn: {
    borderColor: "rgba(37,99,235,0.4)",
  },
  optionInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
  },
  optionTitle: {
    color: "#0B1A3A",
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "700",
  },
  optionMeta: {
    color: "rgba(11,26,58,0.42)",
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "500",
  },
  cancel: { width: 100 },
  confirm: { flex: 1 },
});
