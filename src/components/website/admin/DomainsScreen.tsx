"use client";

import * as React from "react";
import { Globe, Plus, RefreshCw, Star, Trash2 } from "lucide-react";
import { Panel, PanelHeader } from "@/components/web/primitives/Surface";
import { Button } from "@/components/web/primitives/Button";
import { DataChip, StatusPill } from "@/components/web/primitives/StatusPill";
import { AlertBlock } from "@/components/web/page/Alerts";
import { EmptyStateCard, InfoCard } from "@/components/web/page/Cards";
import { Field, TextInput } from "@/components/web/forms/Field";
import { DangerConfirmDialog } from "@/components/web/overlays/Modal";
import { useToast } from "@/components/ui/toast-notification";
import { formatDateTime } from "@/lib/web/format";
import { websiteApi, type DomainDto, type DomainsDto } from "@/lib/website/client";
import { useWebsiteArea } from "./WebsiteAreaShell";
import { CopyButton, ListSkeleton, domainStateSpec, tlsStateSpec } from "./admin-ui";

/**
 * **Il dominio del sito** (ADR-0200 §2): solo domini della societa, nessun
 * sottodominio EasyGame. La gestione e del solo proprietario.
 */

const FLOW = [
  { title: "Inserisci il dominio", text: "Il dominio o sottodominio della societa, es. www.miasocieta.it." },
  { title: "Crea i record DNS", text: "Nel pannello del registrar (Aruba, Register, GoDaddy…) aggiungi i record indicati." },
  { title: "Verifica", text: "Quando i record sono attivi premi «Verifica ora»: puo servire qualche ora." },
  { title: "Pubblica", text: "Con il dominio attivo e il certificato HTTPS emesso, il sito pubblicato e online." },
];

const PURPOSE_LABELS = { ownership: "Prova di proprieta", routing: "Instradamento" } as const;

function DnsRecordsTable({ domain }: { domain: DomainDto }) {
  if (!domain.records.length) return null;
  return (
    <div className="mt-4">
      <p className="mb-2 text-[12px] font-semibold text-egw-ink-72">Record DNS da creare</p>
      <div className="overflow-x-auto rounded-egw-field border border-egw-hairline">
        <table className="w-full min-w-[620px] text-left text-[12.5px]">
          <thead className="bg-egw-page-100 text-[11px] uppercase tracking-wide text-egw-ink-62">
            <tr>
              <th scope="col" className="px-3 py-2 font-semibold">Tipo</th>
              <th scope="col" className="px-3 py-2 font-semibold">Nome</th>
              <th scope="col" className="px-3 py-2 font-semibold">Valore</th>
              <th scope="col" className="px-3 py-2 font-semibold">Scopo</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-egw-hairline">
            {domain.records.map((record, index) => (
              <React.Fragment key={`${record.type}-${record.fqdn}-${record.value}-${index}`}>
                <tr>
                  <td className="px-3 py-2 font-semibold text-egw-ink">{record.type}</td>
                  <td className="px-3 py-2">
                    <span className="inline-flex items-center gap-1.5">
                      <code className="break-all font-mono text-[12px] text-egw-ink">{record.name}</code>
                      <CopyButton value={record.name} label={`Copia il nome ${record.name}`} />
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <span className="inline-flex items-center gap-1.5">
                      <code className="break-all font-mono text-[12px] text-egw-ink">{record.value}</code>
                      <CopyButton value={record.value} label="Copia il valore" />
                    </span>
                  </td>
                  <td className="px-3 py-2 text-egw-ink-72">{PURPOSE_LABELS[record.purpose]}</td>
                </tr>
                {record.note ? (
                  <tr>
                    <td colSpan={4} className="px-3 pb-2 pt-0 text-[11.5px] text-egw-amber-ink">{record.note}</td>
                  </tr>
                ) : null}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-1.5 text-[11.5px] text-egw-ink-62">Alcuni registrar vogliono il nome completo ({domain.records[0]?.fqdn}) invece di quello relativo.</p>
    </div>
  );
}

export function DomainsScreen() {
  const { reload, can, canEdit } = useWebsiteArea();
  const { showToast } = useToast();
  const [data, setData] = React.useState<DomainsDto | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [hostname, setHostname] = React.useState("");
  const [adding, setAdding] = React.useState(false);
  const [addError, setAddError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [toRemove, setToRemove] = React.useState<DomainDto | null>(null);
  const manage = can("website.domain.manage") && canEdit;

  const load = React.useCallback(async () => {
    const result = await websiteApi.domains();
    if (result.error) setError(result.error.message);
    else {
      setError(null);
      setData(result.data);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  const add = async (value: string) => {
    const host = value.trim();
    if (!host) return;
    setAdding(true);
    setAddError(null);
    const result = await websiteApi.addDomain(host);
    setAdding(false);
    if (result.error) {
      setAddError(result.error.message);
      return;
    }
    setHostname("");
    showToast("success", `${result.data.hostname} aggiunto: ora crea i record DNS`);
    await load();
    await reload();
  };

  const verify = async (domain: DomainDto) => {
    setBusy(`verify-${domain.id}`);
    const result = await websiteApi.verifyDomain(domain.id);
    setBusy(null);
    if (result.error) {
      showToast("error", result.error.message);
      return;
    }
    showToast(result.data.state === "failed" ? "error" : "success", result.data.state === "active" ? `${domain.hostname} e attivo` : `${domain.hostname}: ${domainStateSpec(result.data.state).label.toLowerCase()}`);
    await load();
    await reload();
  };

  const setPrimary = async (domain: DomainDto) => {
    setBusy(`primary-${domain.id}`);
    const result = await websiteApi.setPrimaryDomain(domain.id);
    setBusy(null);
    if (result.error) {
      showToast("error", result.error.message);
      return;
    }
    setData(result.data);
    showToast("success", `${domain.hostname} e ora il dominio principale`);
    await reload();
  };

  const remove = async () => {
    if (!toRemove) return;
    setBusy(`remove-${toRemove.id}`);
    const result = await websiteApi.removeDomain(toRemove.id);
    setBusy(null);
    if (result.error) {
      showToast("error", result.error.message);
      return;
    }
    setData(result.data);
    showToast("success", `${toRemove.hostname} rimosso`);
    setToRemove(null);
    await reload();
  };

  const hostnames = new Set(data?.domains.map((domain) => domain.hostname) ?? []);

  return (
    <div className="space-y-5">
      {!can("website.domain.manage") ? (
        <InfoCard eyebrow="Solo lettura">La gestione del dominio e riservata al proprietario del club.</InfoCard>
      ) : null}
      {data && !data.provider.configured ? (
        <AlertBlock severity="warning" title="Il collegamento dei domini non e ancora configurato su questa installazione">
          Puoi inserire il dominio e preparare i record DNS; la verifica e il certificato partiranno quando il servizio sara configurato.
        </AlertBlock>
      ) : null}

      <Panel as="section">
        <PanelHeader eyebrow="Come funziona" title="Collegare il dominio in quattro passi" />
        <ol className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {FLOW.map((step, index) => (
            <li key={step.title} className="rounded-egw-field border border-egw-hairline bg-egw-page-100 p-3">
              <span className="egw-num inline-flex h-6 w-6 items-center justify-center rounded-full bg-egw-navy-800 text-[11px] font-bold text-white">{index + 1}</span>
              <p className="mt-2 text-[13px] font-semibold text-egw-ink">{step.title}</p>
              <p className="mt-0.5 text-[12px] leading-[1.5] text-egw-ink-62">{step.text}</p>
            </li>
          ))}
        </ol>
        {data ? (
          <p className="mt-3 text-[11.5px] text-egw-ink-62">Servizio: {data.provider.label}{data.provider.configured ? "" : " (non configurato)"}</p>
        ) : null}
      </Panel>

      {manage ? (
        <Panel as="section">
          <PanelHeader eyebrow="Nuovo dominio" title="Aggiungi un dominio" />
          <form
            className="flex flex-col gap-3 sm:flex-row sm:items-start"
            onSubmit={(event) => {
              event.preventDefault();
              void add(hostname);
            }}
          >
            <Field
              label="Dominio"
              htmlFor="domain-hostname"
              className="flex-1"
              error={addError ?? undefined}
              helper="Usa un dominio della societa (es. www.miasocieta.it o basket.miasocieta.it). Gli indirizzi EasyGame non si usano per i siti."
            >
              <TextInput id="domain-hostname" value={hostname} onChange={(event) => setHostname(event.target.value)} placeholder="www.miasocieta.it" autoComplete="off" spellCheck={false} />
            </Field>
            <Button type="submit" variant="primary" icon={<Plus className="h-4 w-4" />} loading={adding} disabled={!hostname.trim()} className="sm:mt-[21px]">
              Aggiungi
            </Button>
          </form>
        </Panel>
      ) : null}

      {error ? (
        <AlertBlock severity="danger" title="I domini non si possono caricare">{error}</AlertBlock>
      ) : !data ? (
        <ListSkeleton rows={2} />
      ) : !data.domains.length ? (
        <EmptyStateCard icon={<Globe className="h-6 w-6" />} title="Nessun dominio collegato" description="Finche non colleghi un dominio, il sito si vede solo nell'anteprima privata." />
      ) : (
        data.domains.map((domain) => (
          <Panel key={domain.id} as="article">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="break-all text-[15px] font-bold text-egw-ink">{domain.hostname}</h3>
                  <DataChip size="sm" tone={domain.role === "primary" ? "navy" : "neutral"}>{domain.role === "primary" ? "Principale" : "Reindirizza al principale"}</DataChip>
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <StatusPill status={domainStateSpec(domain.state)} size="sm" />
                  <StatusPill status={tlsStateSpec(domain.tlsState)} size="sm" />
                </div>
                <p className="mt-2 text-[12px] text-egw-ink-62">
                  {domain.lastCheckedAt ? `Ultimo controllo ${formatDateTime(domain.lastCheckedAt)}` : "Mai verificato"}
                  {domain.attemptCount ? ` · ${domain.attemptCount} tentativi` : ""}
                  {domain.activatedAt ? ` · attivo dal ${formatDateTime(domain.activatedAt)}` : ""}
                </p>
              </div>
              {manage ? (
                <div className="flex flex-wrap gap-2">
                  {domain.state !== "active" || domain.tlsState !== "active" ? (
                    <Button size="sm" variant="secondary" icon={<RefreshCw className="h-4 w-4" />} loading={busy === `verify-${domain.id}`} disabled={Boolean(busy)} onClick={() => void verify(domain)}>Verifica ora</Button>
                  ) : null}
                  {domain.role !== "primary" && domain.state === "active" ? (
                    <Button size="sm" variant="secondary" icon={<Star className="h-4 w-4" />} loading={busy === `primary-${domain.id}`} disabled={Boolean(busy)} onClick={() => void setPrimary(domain)}>Imposta come principale</Button>
                  ) : null}
                  <Button size="sm" variant="danger" icon={<Trash2 className="h-4 w-4" />} disabled={Boolean(busy)} onClick={() => setToRemove(domain)}>Rimuovi</Button>
                </div>
              ) : null}
            </div>
            {domain.lastError ? (
              <AlertBlock severity="danger" title="Ultimo errore" className="mt-3">{domain.lastError}</AlertBlock>
            ) : null}
            {domain.state !== "active" ? <DnsRecordsTable domain={domain} /> : null}
            {domain.companion && !hostnames.has(domain.companion) ? (
              <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-egw-field border border-egw-tint-blue-bd bg-egw-tint-blue px-3 py-2.5">
                <p className="text-[12.5px] text-egw-ink-72">
                  Consigliato: aggiungi anche <strong className="text-egw-ink">{domain.companion}</strong>, cosi chi lo digita arriva comunque al sito.
                </p>
                {manage ? (
                  <Button size="xs" variant="secondary" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => void add(domain.companion as string)} loading={adding}>
                    Aggiungi {domain.companion}
                  </Button>
                ) : null}
              </div>
            ) : null}
          </Panel>
        ))
      )}

      <DangerConfirmDialog
        open={Boolean(toRemove)}
        onOpenChange={(next) => !next && setToRemove(null)}
        title={`Rimuovere ${toRemove?.hostname ?? "il dominio"}?`}
        description="Il sito smette di rispondere su questo indirizzo."
        consequences={[
          toRemove?.role === "primary" ? "E il dominio principale: il sito non sara raggiungibile finche non ne imposti un altro" : "Chi usa questo indirizzo non verra piu reindirizzato",
          "Per ricollegarlo dovrai ripetere la verifica",
        ]}
        irreversible={false}
        confirmLabel="Rimuovi il dominio"
        onConfirm={remove}
        loading={Boolean(toRemove && busy === `remove-${toRemove.id}`)}
      />
    </div>
  );
}
