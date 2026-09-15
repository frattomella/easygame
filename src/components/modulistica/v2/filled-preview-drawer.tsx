"use client";

import * as React from "react";
import { FileCheck, Printer } from "lucide-react";
import { Drawer, DrawerSection } from "@/components/web/overlays/Drawer";
import { Button } from "@/components/web/primitives/Button";
import { AlertBlock } from "@/components/web/page/Alerts";
import { InsetBlock } from "@/components/web/primitives/Surface";
import { describePlaceholderKey } from "@/lib/documents/placeholders";

/**
 * L'anteprima del documento compilato: cosa c'e dentro, e cosa **non** ci e
 * entrato. §5.5.24 chiede che i segnaposto che il risolutore non ha saputo
 * riempire siano elencati **prima** di produrre: un'attestazione con tre
 * righe bianche che nessuno ha notato e peggio di un modulo vuoto, perche
 * sembra completa. L'anteprima non scrive niente: e la differenza con
 * «Produci il documento», ed e per questo che sono due pulsanti e non uno.
 *
 * Un cassetto da 720 (guideline 06 §6.7): il foglio si legge, non si
 * intravede in un modale.
 */
export type FilledPreviewState = {
  templateId: string;
  athleteId: string;
  title: string;
  html: string;
  unresolved: string[];
  missing: string[];
  warnings: string[];
};

export function FilledPreviewDrawer({
  open,
  onOpenChange,
  preview,
  onPrint,
  onProduce,
  producing,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  preview: FilledPreviewState | null;
  onPrint: () => void;
  onProduce: () => Promise<void>;
  producing?: boolean;
}) {
  const nothingMissing = Boolean(preview && !preview.warnings.length && !preview.missing.length && !preview.unresolved.length);
  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      width="wide"
      eyebrow="Anteprima del documento compilato"
      title={preview?.title || "Documento"}
      description="Ciò che vedi qui non è ancora stato prodotto: nessuna riga viene scritta finché non lo produci."
      locked={producing}
      data-test="filled-preview-drawer"
      footer={
        <>
          <Button variant="primary" icon={<FileCheck />} onClick={() => void onProduce()} loading={producing}>
            Produci il documento
          </Button>
          <Button variant="secondary" icon={<Printer />} onClick={onPrint} disabled={producing}>
            Stampa l&apos;anteprima
          </Button>
          <Button variant="text" onClick={() => onOpenChange(false)} disabled={producing}>
            Annulla
          </Button>
        </>
      }
    >
      {preview?.warnings.length ? (
        <DrawerSection>
          <AlertBlock severity="warning" title="Avvisi del risolutore">
            <ul className="list-disc space-y-1 pl-4">
              {preview.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          </AlertBlock>
        </DrawerSection>
      ) : null}

      {preview?.missing.length ? (
        <DrawerSection>
          <AlertBlock severity="warning" title="Dati mancanti: restano campi da riempire a mano">
            {preview.missing.map(describePlaceholderKey).join(", ")}
          </AlertBlock>
        </DrawerSection>
      ) : null}

      {preview?.unresolved.length ? (
        <DrawerSection>
          <AlertBlock severity="danger" title="Segnaposto non riconosciuti: restano vuoti">
            <span className="egw-num">{preview.unresolved.join(", ")}</span>
          </AlertBlock>
        </DrawerSection>
      ) : null}

      {nothingMissing ? (
        <DrawerSection>
          <AlertBlock severity="success" title="Tutti i segnaposto del modello sono stati compilati" />
        </DrawerSection>
      ) : null}

      {preview ? (
        <DrawerSection eyebrow="Il foglio">
          <InsetBlock className="p-2">
            <iframe title="Anteprima del documento" srcDoc={preview.html} sandbox="" className="h-[60vh] min-h-[320px] w-full rounded-egw-chip bg-white" />
          </InsetBlock>
        </DrawerSection>
      ) : null}
    </Drawer>
  );
}
