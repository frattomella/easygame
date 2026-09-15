"use client";

import * as React from "react";
import { Download, Printer } from "lucide-react";
import { Drawer, DrawerSection } from "@/components/web/overlays/Drawer";
import { Field, FieldSizeProvider, SearchableSelect } from "@/components/web/forms/Field";
import { Button } from "@/components/web/primitives/Button";
import { AlertBlock } from "@/components/web/page/Alerts";
import { InfoCard } from "@/components/web/page/Cards";
import type { DocumentTemplateSummary } from "@/lib/api/documents";
import { TemplateStateLine } from "@/components/modulistica/v2/template-state";
import { SUBJECT_LABELS, canProduceFilled, type AthleteOption } from "@/components/modulistica/v2/modulistica-model";

/**
 * «Genera documento»: le due strade, modulo vuoto o documento compilato
 * (guideline 08 §8.5: un cassetto da 480). Sostituisce il `Dialog` della V1
 * con le stesse due azioni e gli stessi avvisi, detti **prima** di
 * stampare:
 *
 * - il modulo vuoto stampa la **bozza**, ed e corretto in due casi su tre —
 *   quando `hasUnpublishedChanges` e falso la bozza **e** il testo
 *   pubblicato, parola per parola. Nel terzo caso il foglio di carta non
 *   direbbe cio che i documenti generati citeranno, e lo si dice qui;
 * - il compilato esce solo da un modello pubblicato e non ritirato, che
 *   parla di un atleta: sono le condizioni con cui il server accetta di
 *   produrre, e offrirlo lo stesso significherebbe promettere un 400.
 *
 * La ricerca dell'atleta e dentro il selettore (guideline 08 §8.2: la
 * ricerca e obbligatoria sopra otto opzioni).
 */
export function GenerateDocumentDrawer({
  open,
  onOpenChange,
  template,
  athletes,
  onBlank,
  onFilled,
  generatingFilled,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template: DocumentTemplateSummary | null;
  athletes: AthleteOption[];
  /** «Genera vuoto»: si apre la finestra nel gestore del clic, prima di ogni await. */
  onBlank: () => void;
  /** «Genera compilato»: l'anteprima dal risolutore lato server. */
  onFilled: (athleteId: string) => Promise<void>;
  generatingFilled?: boolean;
}) {
  const [selectedAthlete, setSelectedAthlete] = React.useState<string | null>(null);
  const athleteId = React.useId();

  React.useEffect(() => {
    if (open) setSelectedAthlete(null);
  }, [open, template?.id]);

  const options = React.useMemo(
    () => athletes.map((athlete) => ({ value: athlete.id, label: athlete.label, description: athlete.category || undefined })),
    [athletes],
  );

  const speaksOfAthlete = template?.subjectKind === "athlete";
  const filledAllowed = Boolean(template && speaksOfAthlete && canProduceFilled(template));

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      width="default"
      eyebrow="Genera documento"
      title={template?.title || "Genera documento"}
      locked={generatingFilled}
      data-test="generate-document-drawer"
      footer={
        <>
          <Button
            variant="primary"
            icon={<Download />}
            onClick={() => (selectedAthlete ? void onFilled(selectedAthlete) : undefined)}
            loading={generatingFilled}
            disabled={!selectedAthlete || !filledAllowed}
            title={template && !canProduceFilled(template) ? "Serve un modello pubblicato e non ritirato" : undefined}
          >
            Genera compilato
          </Button>
          <Button variant="secondary" icon={<Printer />} onClick={onBlank} disabled={generatingFilled}>
            Genera vuoto
          </Button>
          <Button variant="text" onClick={() => onOpenChange(false)} disabled={generatingFilled}>
            Annulla
          </Button>
        </>
      }
    >
      <FieldSizeProvider size="sm">
        {template ? (
          <DrawerSection>
            <TemplateStateLine template={template} />
          </DrawerSection>
        ) : null}

        <DrawerSection>
          <InfoCard>
            <strong>Genera vuoto</strong> stampa il modulo da compilare a mano. <strong>Genera compilato</strong> scrive dentro i dati
            dell&apos;atleta, del club e della cassa: serve un atleta, e serve un modello pubblicato.
          </InfoCard>
        </DrawerSection>

        {template && !speaksOfAthlete ? (
          <DrawerSection>
            <AlertBlock severity="warning" title={`Questo modello parla di ${SUBJECT_LABELS[template.subjectKind].toLowerCase()}`}>
              Da qui si stampa vuoto. Il compilato parte da un atleta.
            </AlertBlock>
          </DrawerSection>
        ) : null}

        {template?.status === "retired" ? (
          <DrawerSection>
            <AlertBlock severity="warning" title="Questo modello è ritirato">
              Non produce documenti nuovi, e continua a spiegare quelli già prodotti. Da qui esce solo il modulo vuoto; per generare di
              nuovo, riattivalo.
            </AlertBlock>
          </DrawerSection>
        ) : template && template.publishedVersion === 0 ? (
          <DrawerSection>
            <AlertBlock severity="warning" title="Questo modello non è mai stato pubblicato">
              <strong>Genera vuoto</strong> stampa la bozza, e il compilato non si può ancora produrre.
            </AlertBlock>
          </DrawerSection>
        ) : template?.hasUnpublishedChanges ? (
          <DrawerSection>
            <AlertBlock severity="warning" title="Questo modello ha modifiche non pubblicate">
              <strong>Genera vuoto</strong> stampa la <strong>bozza</strong>, mentre i documenti compilati continuano a citare la versione{" "}
              {template.publishedVersion}. Pubblica prima, se il foglio di carta deve dire la stessa cosa.
            </AlertBlock>
          </DrawerSection>
        ) : null}

        <DrawerSection eyebrow="Documento compilato">
          <Field label="Atleta" htmlFor={athleteId} helper="Solo per il compilato: il modulo vuoto non ha bisogno di un atleta.">
            <SearchableSelect
              id={athleteId}
              value={selectedAthlete}
              onValueChange={setSelectedAthlete}
              options={options}
              placeholder="Seleziona un atleta"
              searchPlaceholder="Cerca per nome o cognome"
              emptyLabel={athletes.length ? "Nessun atleta trovato" : "Nessun atleta disponibile"}
              disabled={!filledAllowed}
              allowClear
            />
          </Field>
        </DrawerSection>
      </FieldSizeProvider>
    </Drawer>
  );
}
