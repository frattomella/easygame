"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ScrollText, ShieldAlert } from "lucide-react";
import Sidebar from "@/components/dashboard/Sidebar";
import Header from "@/components/dashboard/Header";
import { DashboardPageContainer, dashboardMainClassName } from "@/components/dashboard/dashboard-page-container";
import { apiRequest } from "@/lib/api/client";
import { HeaderStat, PageHeader } from "@/components/web/page/PageHeader";
import { EmptyStateCard } from "@/components/web/page/Cards";
import { Field, TextInput } from "@/components/web/forms/Field";
import { InsetBlock } from "@/components/web/primitives/Surface";
import { DataGrid } from "@/components/web/datagrid/DataGrid";
import type { FilterState } from "@/components/web/datagrid/types";
import { formatInteger } from "@/lib/web/format";
import {
  AUDIT_PAGE_SIZE,
  AUDIT_VIEWS,
  auditFiltersToQuery,
  buildAuditColumns,
  buildAuditFilters,
} from "@/components/audit/v2/audit-grid";
import { ServerPager } from "@/components/web/datagrid/ServerPager";
import { AuditInspector } from "@/components/audit/v2/audit-inspector";
import type { AuditEvent } from "@/components/audit/v2/audit-model";

/**
 * **La consultazione del registro** (WP-16, Wave 6 lane 6G) — Web V2,
 * pattern 10: intestazione → banda di filtri → griglia con lettura server.
 *
 * Il registro esisteva da tre Wave — centootto punti di scrittura, quattro
 * indici gia adatti alla lettura — e non lo leggeva nessuno. Questa e la
 * schermata che mancava; nella V1 era anche l'unica pagina di gestione
 * **senza guscio** (ne barra laterale ne intestazione): qui lo monta come
 * ogni altra.
 *
 * ## Cosa si vede, e cosa no
 *
 * Solo le righe del **club attivo**: quelle senza club — il giro notturno dei
 * promemoria, un accesso fallito prima che ci sia un'organizzazione — non
 * appartengono a nessuno e non escono dalla rotta.
 *
 * Dei metadati esce un elenco **chiuso** di chiavi che descrivono l'atto —
 * quale permesso e stato negato, quale percorso, quante righe — e mai il
 * contenuto: nessun nome, nessun importo, nessun testo libero. Il dispositivo
 * di chi ha operato (`user_agent`) resta fuori del tutto.
 *
 * ## Il permesso e una chiave, non il percorso
 *
 * `/audit` non e fra i prefissi riservati alla direzione: chi decide e
 * `audit.read`. Tolta la chiave a un ruolo, questa pagina dice che l'accesso e
 * negato e la rotta risponde 403; rimessa, tornano entrambe. E la prova che
 * §10.5 del piano chiede, e per essere una prova deve passare da qui.
 *
 * ## La griglia mostra i filtri, il server li applica
 *
 * In mano c'e una pagina di cinquanta righe: i filtri della griglia — area,
 * esito, periodo, solo dinieghi — e i due campi di testo della banda — chi,
 * risorsa — ricostruiscono la query e rileggono dal servizio, con gli stessi
 * parametri della V1.
 */

type Filtri = {
  area: string;
  outcome: string;
  actorEmail: string;
  resource: string;
  from: string;
  to: string;
  denied: boolean;
};

const FILTRI_VUOTI: Filtri = { area: "", outcome: "", actorEmail: "", resource: "", from: "", to: "", denied: false };

export default function AuditPage() {
  const [applicati, setApplicati] = useState<Filtri>(FILTRI_VUOTI);
  const [offset, setOffset] = useState(0);
  const [caricamento, setCaricamento] = useState(true);
  const [negato, setNegato] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const [eventi, setEventi] = useState<AuditEvent[]>([]);
  const [aree, setAree] = useState<string[]>([]);
  const [totale, setTotale] = useState(0);
  const [aperto, setAperto] = useState<AuditEvent | null>(null);

  /* I due campi di testo si applicano con un breve ritardo: una richiesta per tasto sarebbe la pagina che si ridisegna dieci volte per una parola. */
  const [attoreDraft, setAttoreDraft] = useState("");
  const [risorsaDraft, setRisorsaDraft] = useState("");
  useEffect(() => {
    const handle = window.setTimeout(() => {
      setApplicati((current) => {
        const actorEmail = attoreDraft.trim();
        const resource = risorsaDraft.trim();
        if (current.actorEmail === actorEmail && current.resource === resource) return current;
        return { ...current, actorEmail, resource };
      });
      setOffset(0);
    }, 300);
    return () => window.clearTimeout(handle);
  }, [attoreDraft, risorsaDraft]);

  const query = useMemo(() => {
    const parametri = new URLSearchParams();
    if (applicati.area) parametri.set("area", applicati.area);
    if (applicati.outcome) parametri.set("outcome", applicati.outcome);
    if (applicati.actorEmail) parametri.set("actor_email", applicati.actorEmail);
    if (applicati.resource) parametri.set("resource", applicati.resource);
    if (applicati.from) parametri.set("from", applicati.from);
    if (applicati.to) parametri.set("to", `${applicati.to}T23:59:59`);
    if (applicati.denied) parametri.set("denied", "1");
    parametri.set("limit", String(AUDIT_PAGE_SIZE));
    parametri.set("offset", String(offset));
    return parametri.toString();
  }, [applicati, offset]);

  const carica = useCallback(async () => {
    setCaricamento(true);
    const risposta = await apiRequest<{ items: AuditEvent[]; total: number; areas: string[] }>(`/api/v1/audit?${query}`);
    setCaricamento(false);

    if (risposta.error) {
      setNegato(risposta.error.status === 403);
      setErrore(risposta.error.message);
      setEventi([]);
      return;
    }

    setNegato(false);
    setErrore(null);
    setEventi(risposta.data?.items || []);
    setTotale(risposta.data?.total || 0);
    if (risposta.data?.areas?.length) setAree(risposta.data.areas);
  }, [query]);

  useEffect(() => {
    void carica();
  }, [carica]);

  /** Dai filtri della griglia ai parametri del server; l'offset riparte da zero. */
  const handleGridFilters = useCallback((state: FilterState) => {
    const next = auditFiltersToQuery(state);
    setApplicati((current) => {
      if (current.area === next.area && current.outcome === next.outcome && current.from === next.from && current.to === next.to && current.denied === next.denied) {
        return current;
      }
      setOffset(0);
      return { ...current, ...next };
    });
  }, []);

  const columns = useMemo(() => buildAuditColumns(setAperto), []);
  const filters = useMemo(() => buildAuditFilters(aree), [aree]);

  const gridState = errore ? "error" : caricamento ? "loading" : "ready";

  return (
    <div className="flex h-[100dvh] bg-egw-page">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Header title="Registro attività" />
        <main className={dashboardMainClassName}>
          <DashboardPageContainer>
            <PageHeader
              eyebrow="Sicurezza"
              title="Registro attività"
              description="Chi ha fatto cosa in questo club, e cosa è stato negato."
              stats={!negato ? <HeaderStat value={formatInteger(totale)} label={totale === 1 ? "operazione" : "operazioni"} /> : null}
            />

            {negato ? (
              /*
                Un 403 si racconta, non si mostra come elenco vuoto: la
                chiave si chiama `audit.read` e la concede il proprietario.
              */
              <EmptyStateCard
                icon={<ShieldAlert />}
                iconTone="red"
                title="Il ruolo attivo non può leggere il registro"
                description={
                  <>
                    Serve il permesso <span className="font-mono">audit.read</span>. Lo concede il proprietario dalla gestione accessi.
                  </>
                }
              />
            ) : (
              <>
                <InsetBlock className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" data-test="audit-filter-band">
                  <Field label="Chi (indirizzo)" htmlFor="audit-attore">
                    <TextInput id="audit-attore" value={attoreDraft} onChange={(event) => setAttoreDraft(event.target.value)} placeholder="parte dell'indirizzo" />
                  </Field>
                  <Field label="Risorsa" htmlFor="audit-risorsa">
                    <TextInput id="audit-risorsa" value={risorsaDraft} onChange={(event) => setRisorsaDraft(event.target.value)} placeholder="athletes, payments…" />
                  </Field>
                </InsetBlock>

                <DataGrid<AuditEvent>
                  module="registro-attivita"
                  aria-label="Registro delle operazioni"
                  rows={eventi}
                  getRowId={(row) => row.id}
                  rowLabel={(row) => row.action}
                  columns={columns}
                  filters={filters}
                  views={AUDIT_VIEWS}
                  onFiltersChange={handleGridFilters}
                  onOpenRow={setAperto}
                  activeRowId={aperto?.id || null}
                  canSelect={false}
                  state={gridState}
                  errorMessage={errore}
                  onRetry={() => void carica()}
                  noun={{ singular: "operazione", plural: "operazioni" }}
                  totalCount={totale}
                  serverTotal={totale}
                  defaultPageSize={100}
                  hideFooter
                  footerRow={
                    <ServerPager noun={{ singular: "operazione", plural: "operazioni" }} offset={offset} limit={AUDIT_PAGE_SIZE} count={eventi.length} total={totale} busy={caricamento} onPageChange={setOffset} />
                  }
                  empty={{
                    icon: <ScrollText />,
                    title: "Nessuna operazione con questi filtri.",
                    description: "Allarga il periodo o togli un filtro: il registro tiene solo le righe del club attivo.",
                  }}
                />
              </>
            )}
          </DashboardPageContainer>
        </main>
      </div>

      <AuditInspector event={aperto} onOpenChange={(open) => !open && setAperto(null)} />
    </div>
  );
}
