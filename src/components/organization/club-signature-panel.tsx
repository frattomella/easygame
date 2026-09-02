"use client";

import React from "react";
import { Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast-notification";
import { canManageClubConfigurationAsActor } from "@/lib/access-roles";
import { readStoredActiveClub } from "@/lib/api/client";
import {
  loadClubSignatures,
  removeClubSignature,
  uploadClubSignature,
  type ClubSignatureState,
  type ClubSignatureSummary,
} from "@/lib/api/club-signature";
import {
  CLUB_SIGNATURE_ACCEPT_ATTRIBUTE,
  CLUB_SIGNATURE_KINDS,
  CLUB_SIGNATURE_LABELS,
  buildClubSignatureUrl,
  type ClubSignatureKind,
} from "@/lib/club-signature";

/**
 * Firma del presidente e timbro della societa.
 *
 * **Dove sta e perche.** Dentro la scheda **Dati Fiscali**, subito sotto
 * «Legale Rappresentante», e non in un tab suo. Una firma senza un nome
 * accanto non si sa di chi sia: chi la carica ha appena scritto nome, cognome
 * e codice fiscale di chi firma, e le due cose si controllano insieme. Un tab
 * in piu sarebbe stato il decimo, e su smartphone i tab sono un carosello: una
 * cosa che si usa due volte l'anno non merita due clic in piu a chiunque altro.
 *
 * **L'anteprima e un indirizzo, non un `data:`.** L'immagine arriva da una
 * rotta autenticata che verifica l'appartenenza al club: il browser la mette
 * in cache privata e la scheda non trasporta base64. E anche il motivo per cui
 * l'indirizzo porta l'impronta del contenuto — senza, dopo una sostituzione si
 * continuerebbe a vedere la firma di prima.
 *
 * **Il gate vero e sul server.** Qui le azioni di scrittura si nascondono a
 * chi non e proprietario o gestore, perche mostrare un pulsante che risponde
 * 403 e una promessa non mantenuta; ma e la rotta a decidere.
 */

export type ClubSignaturePanelProps = {
  clubId?: string | null;
};

type BusyKind = ClubSignatureKind | null;

const emptyState = (clubId: string): ClubSignatureState => ({
  organizationId: clubId,
  signatures: { signature: null, stamp: null },
  canManage: false,
});

/** La frase che spiega **a cosa serve**, non solo che manca qualcosa. */
const EMPTY_HINT: Record<ClubSignatureKind, string> = {
  signature:
    "Nessuna firma caricata: i documenti stampati lasceranno lo spazio per firmarli a mano.",
  stamp:
    "Nessun timbro caricato: i documenti stampati usciranno senza timbro della societa.",
};

export function ClubSignaturePanel({ clubId }: ClubSignaturePanelProps) {
  const { showToast } = useToast();
  const id = String(clubId || "").trim();

  const [state, setState] = React.useState<ClubSignatureState>(() =>
    emptyState(id),
  );
  const [canManage, setCanManage] = React.useState(false);
  const [busy, setBusy] = React.useState<BusyKind>(null);
  const [confirming, setConfirming] = React.useState<BusyKind>(null);

  const inputs = React.useRef<Record<string, HTMLInputElement | null>>({});

  /*
    Il ruolo memorizzato serve solo a non far comparire e sparire i pulsanti
    fra il primo render e la risposta del server: e la stessa lettura che fa
    ogni altro pannello di configurazione.
  */
  React.useEffect(() => {
    setCanManage(canManageClubConfigurationAsActor(readStoredActiveClub()?.role));
  }, []);

  const load = React.useCallback(async () => {
    if (!id) {
      setState(emptyState(""));
      return;
    }

    const next = await loadClubSignatures(id);
    setState(next);
    setCanManage(next.canManage);
  }, [id]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const handleFile = async (kind: ClubSignatureKind, file?: File | null) => {
    if (!file) return;

    if (!id) {
      showToast("error", "Salva prima la scheda del club");
      return;
    }

    setBusy(kind);
    const result = await uploadClubSignature(id, kind, file, file.name);
    setBusy(null);

    // Senza questo, ricaricare **lo stesso** file non emette `change`.
    const input = inputs.current[kind];
    if (input) input.value = "";

    if (!result.ok) {
      showToast("error", `${CLUB_SIGNATURE_LABELS[kind]}: ${result.message}`);
      return;
    }

    setState((current) => ({
      ...current,
      signatures: { ...current.signatures, [kind]: result.signature },
    }));
    showToast("success", `${CLUB_SIGNATURE_LABELS[kind]}: immagine salvata`);
  };

  const handleDelete = async (kind: ClubSignatureKind) => {
    setBusy(kind);
    const result = await removeClubSignature(id, kind);
    setBusy(null);
    setConfirming(null);

    if (!result.ok) {
      showToast(
        "error",
        `${CLUB_SIGNATURE_LABELS[kind]}: ${result.message || "rimozione non riuscita"}`,
      );
      return;
    }

    setState((current) => ({
      ...current,
      signatures: { ...current.signatures, [kind]: null },
    }));
    showToast("success", `${CLUB_SIGNATURE_LABELS[kind]}: immagine rimossa`);
  };

  const renderSlot = (kind: ClubSignatureKind) => {
    const signature: ClubSignatureSummary | null = state.signatures[kind];
    const isBusy = busy === kind;

    return (
      <div
        key={kind}
        className="flex flex-col gap-3 rounded-lg border border-border p-4"
      >
        <div>
          <p className="font-medium">{CLUB_SIGNATURE_LABELS[kind]}</p>
          <p className="text-sm text-muted-foreground">
            PNG, JPEG o WebP, fino a 2 MB. Meglio su sfondo trasparente o
            bianco: finisce dentro un documento.
          </p>
        </div>

        <div className="flex min-h-[6rem] items-center justify-center rounded-md border border-dashed border-border bg-muted/30 p-3">
          {signature ? (
            // eslint-disable-next-line @next/next/no-img-element -- immagine servita da una rotta autenticata, non ottimizzabile da next/image
            <img
              src={buildClubSignatureUrl(
                id,
                kind,
                signature.metadata?.checksum,
              )}
              alt={CLUB_SIGNATURE_LABELS[kind]}
              className="max-h-24 w-auto max-w-full object-contain"
            />
          ) : (
            <p className="text-center text-sm text-muted-foreground">
              {EMPTY_HINT[kind]}
            </p>
          )}
        </div>

        {canManage ? (
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="file"
              className="hidden"
              accept={CLUB_SIGNATURE_ACCEPT_ATTRIBUTE}
              ref={(element) => {
                inputs.current[kind] = element;
              }}
              onChange={(event) =>
                void handleFile(kind, event.target.files?.[0])
              }
            />

            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isBusy || !id}
              onClick={() => inputs.current[kind]?.click()}
            >
              <Upload className="mr-2 h-4 w-4" />
              {signature ? "Sostituisci" : "Carica"}
            </Button>

            {signature ? (
              confirming === kind ? (
                <>
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    disabled={isBusy}
                    onClick={() => void handleDelete(kind)}
                  >
                    Conferma rimozione
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={isBusy}
                    onClick={() => setConfirming(null)}
                  >
                    Annulla
                  </Button>
                </>
              ) : (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={isBusy}
                  className="text-red-600 hover:bg-red-50 hover:text-red-700"
                  onClick={() => setConfirming(kind)}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Rimuovi
                </Button>
              )
            ) : null}
          </div>
        ) : null}
      </div>
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Firma e timbro</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Compaiono sui documenti che la societa stampa: ricevute, attestati,
          moduli. Non sono pubblici — li vede solo chi appartiene al club.
        </p>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {CLUB_SIGNATURE_KINDS.map((kind) => renderSlot(kind))}
        </div>

        {!canManage ? (
          <p className="text-sm text-muted-foreground">
            Solo il proprietario e il gestore del club possono caricare o
            rimuovere firma e timbro.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
