"use client";

import * as React from "react";
import { History, PowerOff, RotateCcw, Undo2 } from "lucide-react";
import { Panel, PanelHeader } from "@/components/web/primitives/Surface";
import { Button } from "@/components/web/primitives/Button";
import { DataChip, StatusPill } from "@/components/web/primitives/StatusPill";
import { AlertBlock } from "@/components/web/page/Alerts";
import { EmptyStateCard, InfoCard } from "@/components/web/page/Cards";
import { ConfirmDialog, DangerConfirmDialog } from "@/components/web/overlays/Modal";
import { useToast } from "@/components/ui/toast-notification";
import { formatDateTime } from "@/lib/web/format";
import { isConflict, newIdempotencyKey, websiteApi, type RevisionDto } from "@/lib/website/client";
import { useWebsiteArea } from "./WebsiteAreaShell";
import { PublishButton } from "./PublishDrawer";
import { ListSkeleton, SITE_STATUS } from "./admin-ui";

/**
 * **Lo storico delle pubblicazioni** (ADR-0200 §5). Una revisione non si
 * modifica mai: ripristinarla ne crea una nuova; riportarla nella bozza
 * sostituisce la bozza corrente e non tocca il pubblico.
 */

type Pending = { kind: "rollback" | "restore"; revision: RevisionDto } | { kind: "unpublish" } | null;

export function RevisionsScreen() {
  const { overview, reload, can, canEdit } = useWebsiteArea();
  const { showToast } = useToast();
  const [data, setData] = React.useState<{ currentRevisionId: string | null; revisions: RevisionDto[] } | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState<Pending>(null);
  const [busy, setBusy] = React.useState(false);
  const keyRef = React.useRef("");
  const canPublish = can("website.publish") && canEdit;
  const site = overview.site;

  const load = React.useCallback(async () => {
    const result = await websiteApi.revisions();
    if (result.error) setError(result.error.message);
    else {
      setError(null);
      setData(result.data);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  const numberOf = (id: string | null) => data?.revisions.find((revision) => revision.id === id)?.revisionNumber;

  const open = (next: Pending) => {
    keyRef.current = newIdempotencyKey();
    setPending(next);
  };

  const confirm = async () => {
    if (!pending || !site) return;
    setBusy(true);
    if (pending.kind === "rollback") {
      const result = await websiteApi.rollback(pending.revision.id, keyRef.current);
      setBusy(false);
      if (result.error) {
        showToast("error", result.error.message);
        return;
      }
      showToast("success", `Ripristinata la versione ${pending.revision.revisionNumber}: ora e pubblica come versione ${result.data.revision.revisionNumber}`);
    } else if (pending.kind === "restore") {
      const result = await websiteApi.restoreDraft(pending.revision.id, site.draftVersion);
      setBusy(false);
      if (result.error) {
        showToast("error", isConflict(result) ? "La bozza e stata modificata nel frattempo: ho ricaricato, riprova" : result.error.message);
        if (isConflict(result)) await reload();
        return;
      }
      showToast("success", `La bozza ora e la versione ${result.data.fromRevision}. Il sito pubblico non e cambiato.`);
    } else {
      const result = await websiteApi.unpublish();
      setBusy(false);
      if (result.error) {
        showToast("error", result.error.message);
        return;
      }
      showToast("success", "Il sito e stato ritirato: il pubblico vede la pagina «sito non disponibile»");
    }
    setPending(null);
    await reload();
    await load();
  };

  if (!site) return null;

  return (
    <div className="space-y-5">
      <Panel as="section">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill status={SITE_STATUS[site.status]} />
              {overview.publication ? (
                <span className="text-[12.5px] text-egw-ink-72">Versione {overview.publication.revisionNumber} del {formatDateTime(overview.publication.publishedAt)}</span>
              ) : null}
            </div>
            <p className="mt-2 text-[12.5px] text-egw-ink-62">Pubblicare crea una nuova versione. Le precedenti restano qui e si possono ripristinare.</p>
          </div>
          {canPublish ? (
            <div className="flex flex-wrap gap-2">
              {site.status === "published" ? (
                <Button variant="danger" icon={<PowerOff className="h-4 w-4" />} onClick={() => open({ kind: "unpublish" })}>Ritira il sito</Button>
              ) : null}
              <PublishButton onPublished={async () => { await reload(); await load(); }} />
            </div>
          ) : null}
        </div>
      </Panel>

      {!can("website.publish") ? <InfoCard>Il tuo ruolo puo consultare lo storico, ma non pubblicare o ripristinare.</InfoCard> : null}

      <Panel as="section" flush>
        <div className="px-5 pt-5">
          <PanelHeader eyebrow="Storico" title="Versioni pubblicate" />
        </div>
        {error ? (
          <div className="px-5 pb-5"><AlertBlock severity="danger" title="Lo storico non si puo caricare">{error}</AlertBlock></div>
        ) : !data ? (
          <div className="px-5 pb-5"><ListSkeleton /></div>
        ) : !data.revisions.length ? (
          <EmptyStateCard flat icon={<History className="h-6 w-6" />} title="Nessuna versione" description="La prima versione nasce alla prima pubblicazione." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-[12.5px]">
              <thead className="border-y border-egw-hairline bg-egw-page-100 text-[11px] uppercase tracking-wide text-egw-ink-62">
                <tr>
                  <th scope="col" className="px-5 py-2.5 font-semibold">Versione</th>
                  <th scope="col" className="px-3 py-2.5 font-semibold">Data</th>
                  <th scope="col" className="px-3 py-2.5 font-semibold">Origine</th>
                  <th scope="col" className="px-3 py-2.5 font-semibold">Nota</th>
                  <th scope="col" className="px-3 py-2.5 text-right font-semibold">Pagine</th>
                  <th scope="col" className="px-5 py-2.5 text-right font-semibold"><span className="sr-only">Azioni</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-egw-hairline">
                {data.revisions.map((revision) => {
                  const current = revision.id === data.currentRevisionId;
                  return (
                    <tr key={revision.id} className={current ? "bg-egw-tint-green" : undefined}>
                      <td className="px-5 py-3">
                        <span className="egw-num font-semibold text-egw-ink">#{revision.revisionNumber}</span>
                        {current ? <DataChip size="sm" tone="green" className="ml-2">Corrente</DataChip> : null}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-egw-ink-72">{formatDateTime(revision.publishedAt)}</td>
                      <td className="px-3 py-3 text-egw-ink-72">
                        {revision.origin === "rollback" ? `Ripristino${numberOf(revision.sourceRevisionId) ? ` della #${numberOf(revision.sourceRevisionId)}` : ""}` : "Pubblicazione"}
                      </td>
                      <td className="max-w-[260px] px-3 py-3 text-egw-ink-72">{revision.note || "—"}</td>
                      <td className="egw-num px-3 py-3 text-right text-egw-ink-72">{revision.pageCount ?? "—"}</td>
                      <td className="px-5 py-3">
                        {canPublish ? (
                          <div className="flex justify-end gap-1.5">
                            {!current ? (
                              <Button size="xs" variant="secondary" icon={<RotateCcw className="h-3.5 w-3.5" />} onClick={() => open({ kind: "rollback", revision })}>Ripristina</Button>
                            ) : null}
                            <Button size="xs" variant="text" icon={<Undo2 className="h-3.5 w-3.5" />} onClick={() => open({ kind: "restore", revision })}>Riporta nella bozza</Button>
                          </div>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <ConfirmDialog
        open={pending?.kind === "rollback"}
        onOpenChange={(next) => !next && setPending(null)}
        title={pending?.kind === "rollback" ? `Ripristinare la versione ${pending.revision.revisionNumber}?` : "Ripristinare?"}
        description="Il pubblico vedra subito quella versione. Si crea una nuova versione copiata da quella scelta: lo storico non perde niente e la bozza non cambia."
        confirmLabel="Ripristina questa versione"
        onConfirm={confirm}
        loading={busy}
      />
      <ConfirmDialog
        open={pending?.kind === "restore"}
        onOpenChange={(next) => !next && setPending(null)}
        title={pending?.kind === "restore" ? `Riportare la versione ${pending.revision.revisionNumber} nella bozza?` : "Riportare nella bozza?"}
        description="La bozza corrente viene sostituita da questa versione: le modifiche non pubblicate andranno perse. Il sito pubblico non cambia finche non pubblichi."
        confirmLabel="Sostituisci la bozza"
        tone="danger"
        onConfirm={confirm}
        loading={busy}
      />
      <DangerConfirmDialog
        open={pending?.kind === "unpublish"}
        onOpenChange={(next) => !next && setPending(null)}
        title="Ritirare il sito?"
        description="Il sito smette di essere visibile al pubblico."
        consequences={["Chi visita il dominio vede «sito non disponibile»", "I motori di ricerca smettono di indicizzarlo", "Bozza, versioni e contenuti restano: puoi ripubblicare quando vuoi"]}
        irreversible={false}
        confirmLabel="Ritira il sito"
        onConfirm={confirm}
        loading={busy}
      />
    </div>
  );
}
