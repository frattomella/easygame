"use client";

import { ConfirmDialog, DangerConfirmDialog } from "@/components/web/overlays/Modal";
import { nomeAssegnazione, type Assegnazione, type RuoloDiClub } from "@/components/access-management/v2/access-model";

/**
 * Le due conferme della pagina «Ruoli e accessi» (guideline 08 §8.9).
 *
 * - **Cancellare un ruolo** e notevole, non irreversibile: il server rifiuta
 *   se qualcuno lo porta, e un ruolo si ricrea. `ConfirmDialog`, con la frase
 *   della V1 che spiega il rifiuto prima che arrivi.
 * - **Revocare un accesso** e la cancellazione dell'accesso di un utente del
 *   club, che la guideline elenca fra le operazioni ampie: modale rosso con
 *   cosa se ne va e la conferma scritta con il nome della persona.
 *
 * Sostituiscono i due `AlertDialog` della V1 con lo stesso testo.
 */
export function DeleteRoleDialog({
  ruolo,
  onOpenChange,
  onConfirm,
  loading,
}: {
  ruolo: RuoloDiClub | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void | Promise<void>;
  loading?: boolean;
}) {
  return (
    <ConfirmDialog
      open={Boolean(ruolo)}
      onOpenChange={onOpenChange}
      title={`Cancellare il ruolo «${ruolo?.name ?? ""}»?`}
      description="Un ruolo assegnato non si può cancellare: prima va revocato alle persone che lo portano."
      confirmLabel="Cancella"
      tone="danger"
      onConfirm={onConfirm}
      loading={loading}
    />
  );
}

export function RevokeAccessDialog({
  persona,
  onOpenChange,
  onConfirm,
  loading,
}: {
  persona: Assegnazione | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void | Promise<void>;
  loading?: boolean;
}) {
  const nome = persona ? nomeAssegnazione(persona) : "";
  return (
    <DangerConfirmDialog
      open={Boolean(persona)}
      onOpenChange={onOpenChange}
      title={`Revocare l'accesso a ${nome}?`}
      description="La persona non potrà più entrare in questo club. L'operazione resta nel registro."
      consequences={[
        `Il ruolo «${persona?.role_label ?? ""}» e il perimetro assegnato`,
        "Il collegamento fra l'account e le schede del club (atleta, allenatore, genitore)",
      ]}
      irreversible={false}
      typedConfirmation={nome}
      confirmLabel="Revoca"
      onConfirm={onConfirm}
      loading={loading}
    />
  );
}
