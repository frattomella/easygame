"use client";

import * as React from "react";
import { Trash2, Upload } from "lucide-react";
import { useToast } from "@/components/ui/toast-notification";
import { Panel, PanelHeader } from "@/components/web/primitives/Surface";
import { Button } from "@/components/web/primitives/Button";
import { useConfirm } from "@/components/web/overlays/useConfirm";
import { canManageClubConfigurationAsActor } from "@/lib/access-roles";
import { readStoredActiveClub } from "@/lib/api/client";
import { loadClubSignatures, removeClubSignature, uploadClubSignature, type ClubSignatureState, type ClubSignatureSummary } from "@/lib/api/club-signature";
import { CLUB_SIGNATURE_ACCEPT_ATTRIBUTE, CLUB_SIGNATURE_KINDS, CLUB_SIGNATURE_LABELS, buildClubSignatureUrl, type ClubSignatureKind } from "@/lib/club-signature";

/**
 * Firma del presidente e timbro della societa (Web V2).
 *
 * **Dove sta e perche.** Sotto «Legale rappresentante», nella sezione Dati
 * fiscali: una firma senza un nome accanto non si sa di chi sia.
 *
 * **L'anteprima e un indirizzo, non un `data:`.** L'immagine arriva da una
 * rotta autenticata che verifica l'appartenenza al club; l'indirizzo porta
 * l'impronta del contenuto, cosi dopo una sostituzione non si vede la firma
 * di prima.
 *
 * **Il gate vero e sul server.** Qui i comandi di scrittura sono assenti per
 * chi non e proprietario o gestore (guideline 05 §5.6: un permesso negato e
 * assenza, non un pulsante spento); ma e la rotta a decidere. La rimozione
 * chiede una conferma distruttiva (08 §8.9) al posto dei due pulsanti in
 * linea della V1.
 */
export type ClubSignaturePanelProps = {
  clubId?: string | null;
};

const emptyState = (clubId: string): ClubSignatureState => ({ organizationId: clubId, signatures: { signature: null, stamp: null }, canManage: false });

/** La frase che spiega **a cosa serve**, non solo che manca qualcosa. */
const EMPTY_HINT: Record<ClubSignatureKind, string> = {
  signature: "Nessuna firma caricata: i documenti stampati lasceranno lo spazio per firmarli a mano.",
  stamp: "Nessun timbro caricato: i documenti stampati usciranno senza timbro della societa.",
};

export function ClubSignaturePanel({ clubId }: ClubSignaturePanelProps) {
  const { showToast } = useToast();
  const [confirm, confirmDialog] = useConfirm();
  const id = String(clubId || "").trim();

  const [state, setState] = React.useState<ClubSignatureState>(() => emptyState(id));
  const [canManage, setCanManage] = React.useState(false);
  const [busy, setBusy] = React.useState<ClubSignatureKind | null>(null);
  const inputs = React.useRef<Record<string, HTMLInputElement | null>>({});

  /* Il ruolo memorizzato evita che i pulsanti compaiano e spariscano fra il primo render e la risposta del server. */
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
    setState((current) => ({ ...current, signatures: { ...current.signatures, [kind]: result.signature } }));
    showToast("success", `${CLUB_SIGNATURE_LABELS[kind]}: immagine salvata`);
  };

  const handleDelete = async (kind: ClubSignatureKind) => {
    const ok = await confirm({
      tone: "danger",
      title: `Rimuovere ${CLUB_SIGNATURE_LABELS[kind].toLowerCase()}?`,
      description: "I documenti stampati da qui in avanti usciranno senza.",
      confirmLabel: "Rimuovi",
      irreversible: false,
    });
    if (!ok) return;

    setBusy(kind);
    const result = await removeClubSignature(id, kind);
    setBusy(null);

    if (!result.ok) {
      showToast("error", `${CLUB_SIGNATURE_LABELS[kind]}: ${result.message || "rimozione non riuscita"}`);
      return;
    }
    setState((current) => ({ ...current, signatures: { ...current.signatures, [kind]: null } }));
    showToast("success", `${CLUB_SIGNATURE_LABELS[kind]}: immagine rimossa`);
  };

  const renderSlot = (kind: ClubSignatureKind) => {
    const signature: ClubSignatureSummary | null = state.signatures[kind];
    const isBusy = busy === kind;

    return (
      <div key={kind} className="flex flex-col gap-3 rounded-egw-field border border-egw-hairline bg-egw-page-100 p-4">
        <div>
          <p className="font-brand text-[13px] font-semibold text-egw-ink">{CLUB_SIGNATURE_LABELS[kind]}</p>
          <p className="mt-0.5 font-brand text-[11.5px] leading-[1.45] text-egw-ink-62">PNG, JPEG o WebP, fino a 2 MB. Meglio su sfondo trasparente o bianco: finisce dentro un documento.</p>
        </div>

        <div className="flex min-h-24 items-center justify-center rounded-egw-field border border-dashed border-[rgba(11,26,58,.22)] bg-white p-3">
          {signature ? (
            // eslint-disable-next-line @next/next/no-img-element -- immagine servita da una rotta autenticata, non ottimizzabile da next/image
            <img src={buildClubSignatureUrl(id, kind, signature.metadata?.checksum)} alt={CLUB_SIGNATURE_LABELS[kind]} className="max-h-24 w-auto max-w-full object-contain" />
          ) : (
            <p className="text-center font-brand text-[12px] leading-[1.45] text-egw-ink-62">{EMPTY_HINT[kind]}</p>
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
              onChange={(event) => void handleFile(kind, event.target.files?.[0])}
            />
            <Button variant="secondary" size="sm" icon={<Upload />} loading={isBusy} disabled={!id} onClick={() => inputs.current[kind]?.click()}>
              {signature ? "Sostituisci" : "Carica"}
            </Button>
            {signature ? (
              <Button variant="danger" size="sm" icon={<Trash2 />} disabled={isBusy} onClick={() => void handleDelete(kind)}>
                Rimuovi
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
    );
  };

  return (
    <Panel as="section" aria-labelledby="club-section-firma-title">
      <PanelHeader
        eyebrow="Dati fiscali"
        title={<span id="club-section-firma-title">Firma e timbro</span>}
        description="Compaiono sui documenti che la societa stampa: ricevute, attestati, moduli. Non sono pubblici — li vede solo chi appartiene al club."
      />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">{CLUB_SIGNATURE_KINDS.map((kind) => renderSlot(kind))}</div>
      {!canManage ? <p className="mt-4 font-brand text-[12px] text-egw-ink-62">Solo il proprietario e il gestore del club possono caricare o rimuovere firma e timbro.</p> : null}
      {confirmDialog}
    </Panel>
  );
}
