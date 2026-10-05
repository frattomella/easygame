"use client";

import * as React from "react";
import Link from "next/link";
import { Rocket } from "lucide-react";
import { Drawer, DrawerSection } from "@/components/web/overlays/Drawer";
import { Button } from "@/components/web/primitives/Button";
import { AlertBlock } from "@/components/web/page/Alerts";
import { Field, Textarea } from "@/components/web/forms/Field";
import { useToast } from "@/components/ui/toast-notification";
import { websiteApi, newIdempotencyKey, type PublishIssueDto, type PublishStatusDto, type RevisionDto } from "@/lib/website/client";
import { ListSkeleton } from "./admin-ui";

/**
 * **Il flusso di pubblicazione** condiviso da Panoramica e Versioni.
 *
 * Prima si chiede al server se il sito e pronto (`publishStatus`): gli errori
 * bloccano, gli avvisi no. La chiave di idempotenza nasce all'apertura del
 * cassetto, cosi un doppio clic o un nuovo tentativo dopo un errore di rete
 * non creano due revisioni.
 */

function IssueList({ issues, tone }: { issues: PublishIssueDto[]; tone: "error" | "warning" }) {
  return (
    <ul className="space-y-2">
      {issues.map((issue, index) => (
        <li
          key={`${issue.pageId ?? "site"}-${index}`}
          className={`rounded-egw-field border px-3 py-2 text-[12.5px] leading-[1.5] ${tone === "error" ? "border-egw-tint-red-bd bg-egw-tint-red" : "border-egw-tint-amber-bd bg-egw-tint-amber"}`}
        >
          {issue.pageTitle ? <span className="font-semibold text-egw-ink">Pagina «{issue.pageTitle}»: </span> : null}
          <span className="text-egw-ink-72">{issue.message}</span>
          {issue.pageId ? (
            <Link href={`/website/editor?page=${encodeURIComponent(issue.pageId)}`} className="ml-2 font-semibold text-egw-blue-700 underline">
              Apri nell&apos;editor
            </Link>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

export function PublishDrawer({
  open,
  onOpenChange,
  onPublished,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPublished?: (revision: RevisionDto) => void | Promise<void>;
}) {
  const { showToast } = useToast();
  const [status, setStatus] = React.useState<PublishStatusDto | null>(null);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [publishError, setPublishError] = React.useState<string | null>(null);
  const [note, setNote] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const keyRef = React.useRef<string>("");

  React.useEffect(() => {
    if (!open) return;
    keyRef.current = newIdempotencyKey();
    setStatus(null);
    setLoadError(null);
    setPublishError(null);
    setNote("");
    let cancelled = false;
    void websiteApi.publishStatus().then((result) => {
      if (cancelled) return;
      if (result.error) setLoadError(result.error.message);
      else setStatus(result.data);
    });
    return () => {
      cancelled = true;
    };
  }, [open]);

  const errors = status?.issues.filter((issue) => issue.level === "error") ?? [];
  const warnings = status?.issues.filter((issue) => issue.level === "warning") ?? [];

  const publish = async () => {
    setBusy(true);
    setPublishError(null);
    const result = await websiteApi.publish(keyRef.current, note.trim() || undefined);
    setBusy(false);
    if (result.error) {
      setPublishError(result.error.message);
      return;
    }
    showToast("success", result.data.reused ? "Questa pubblicazione era gia stata registrata" : `Sito pubblicato: versione ${result.data.revision.revisionNumber}`);
    onOpenChange(false);
    await onPublished?.(result.data.revision);
  };

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      title="Pubblica il sito"
      eyebrow="Pubblicazione"
      description="Le pagine, il menu, il tema e le impostazioni della bozza diventano la versione pubblica. News, sponsor, persone e gare sono sempre aggiornati e non serve pubblicarli."
      locked={busy}
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={busy}>Annulla</Button>
          <Button variant="primary" icon={<Rocket className="h-4 w-4" />} onClick={() => void publish()} loading={busy} disabled={!status || errors.length > 0}>
            Pubblica ora
          </Button>
        </div>
      }
    >
      {loadError ? (
        <AlertBlock severity="danger" title="Non riesco a controllare il sito">{loadError}</AlertBlock>
      ) : !status ? (
        <ListSkeleton rows={3} />
      ) : (
        <>
          <DrawerSection eyebrow="Stato">
            <div className="space-y-2">
              {errors.length ? (
                <AlertBlock severity="danger" title={`${errors.length === 1 ? "Un problema blocca" : `${errors.length} problemi bloccano`} la pubblicazione`}>
                  Correggi gli elementi qui sotto e riprova.
                </AlertBlock>
              ) : (
                <AlertBlock severity="success" title="Il sito e pronto per essere pubblicato" />
              )}
              {!status.hasUnpublishedChanges ? (
                <AlertBlock severity="info" title="Nessuna modifica dalla versione pubblicata">
                  Puoi comunque pubblicare: si crea una nuova versione identica alla precedente.
                </AlertBlock>
              ) : null}
              {status.primaryDomain ? (
                <p className="text-[12.5px] text-egw-ink-72">
                  Sara visibile su <strong className="text-egw-ink">{status.primaryDomain}</strong>.
                </p>
              ) : (
                <AlertBlock severity="warning" title="Nessun dominio attivo">
                  La versione viene registrata, ma il pubblico la vedra solo quando un dominio della societa sara collegato e attivo.{" "}
                  <Link href="/website/domini" className="font-semibold underline">Collega un dominio</Link>
                </AlertBlock>
              )}
            </div>
          </DrawerSection>
          {errors.length ? (
            <DrawerSection eyebrow="Da correggere">
              <IssueList issues={errors} tone="error" />
            </DrawerSection>
          ) : null}
          {warnings.length ? (
            <DrawerSection eyebrow="Avvisi (non bloccano)">
              <IssueList issues={warnings} tone="warning" />
            </DrawerSection>
          ) : null}
          <DrawerSection eyebrow="Nota">
            <Field label="Nota della versione" htmlFor="publish-note" optional helper="Resta nello storico delle versioni, per ricordare cosa e cambiato.">
              <Textarea id="publish-note" value={note} maxLength={200} onChange={(event) => setNote(event.target.value)} placeholder="Es. Aggiunta la pagina del camp estivo" />
            </Field>
          </DrawerSection>
          {publishError ? (
            <AlertBlock severity="danger" title="La pubblicazione non e riuscita">{publishError}</AlertBlock>
          ) : null}
        </>
      )}
    </Drawer>
  );
}

/** Il bottone «Pubblica» con il suo cassetto. */
export function PublishButton({
  onPublished,
  disabled,
  label = "Pubblica",
}: {
  onPublished?: (revision: RevisionDto) => void | Promise<void>;
  disabled?: boolean;
  label?: string;
}) {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <Button variant="primary" icon={<Rocket className="h-4 w-4" />} onClick={() => setOpen(true)} disabled={disabled}>
        {label}
      </Button>
      <PublishDrawer open={open} onOpenChange={setOpen} onPublished={onPublished} />
    </>
  );
}
