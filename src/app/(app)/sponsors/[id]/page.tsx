"use client";

import * as React from "react";
import { Suspense } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Euro, FileText, Pencil, Plus, Trash2 } from "lucide-react";
import Sidebar from "@/components/dashboard/Sidebar";
import Header from "@/components/dashboard/Header";
import { DashboardPageContainer, dashboardMainClassName } from "@/components/dashboard/dashboard-page-container";
import { useAuth } from "@/components/providers/AuthProvider";
import { useToast } from "@/components/ui/toast-notification";
import { useBreadcrumbLabel } from "@/components/web/shell/ShellProvider";
import { CollapsedSection, RecordAlertStrip, RecordAreaSwitcher, RecordHeader, type RecordAction } from "@/components/web/record/Record";
import { DetailCard, EmptyStateCard, SummaryCard, type DetailField } from "@/components/web/page/Cards";
import { DangerConfirmDialog } from "@/components/web/overlays/Modal";
import { Button } from "@/components/web/primitives/Button";
import { Skeleton } from "@/components/web/primitives/Controls";
import { Panel, PanelHeader } from "@/components/web/primitives/Surface";
import { DataChip, StatusPill } from "@/components/web/primitives/StatusPill";
import { DataGrid } from "@/components/web/datagrid/DataGrid";
import type { ColumnDef, RowActionDef } from "@/components/web/datagrid/types";
import { MISSING, formatDateShort, formatMoney, joinMeta, orMissing } from "@/lib/web/format";
import { apiRequest } from "@/lib/api/client";
import { supabase } from "@/lib/supabase";
import { deleteClubDataItem, updateClubDataItem } from "@/lib/simplified-db";
import { getClubPaymentMethodChoices } from "@/lib/payments/payment-config-utils";
import { canManageClubConfigurationAsActor } from "@/lib/access-roles";
import { hasAccountingPermission } from "@/lib/accounting/permissions";
import { fetchSponsorCredit, recordSponsorCollection, saveSponsorContract } from "@/lib/sponsors/client";
import {
  EMPTY_SPONSOR_CONTRACT,
  fromSponsorCents,
  normalizeSponsorContract,
  normalizeSponsorKind,
  resolveSponsorCredit,
  type SponsorContract,
  type SponsorCredit,
} from "@/lib/sponsors/model";
import { SponsorDrawer } from "@/components/sponsors/v2/sponsor-drawer";
import { ContractDrawer } from "@/components/sponsors/v2/contract-drawer";
import { CollectionDrawer, type SponsorCollectionSubmission } from "@/components/sponsors/v2/collection-drawer";
import { DocumentDrawer, type SponsorDocumentSubmission } from "@/components/sponsors/v2/document-drawer";
import { SponsorCollectionsGrid } from "@/components/sponsors/v2/collections-grid";
import { DeleteSponsorDialog } from "@/components/sponsors/v2/delete-sponsor-dialog";
import { StornoIncassoDialog } from "@/components/sponsors/v2/storno-incasso-dialog";
import { useRouteClubId, withClubId } from "@/components/web/hooks/use-route-club-id";
import {
  SPONSOR_AREAS,
  computeSponsorAlerts,
  contractLifecycle,
  contractPeriodLabel,
  contractStatusSpec,
  creditStatusSpec,
  newSponsorDocument,
  normalizeSponsorDocuments,
  resolveSponsorArea,
  sponsorKindLabel,
  sponsorName,
  sponsorPayload,
  type SponsorArea,
  type SponsorCollectionRow,
  type SponsorDocument,
  type SponsorDraft,
  type SponsorFormSection,
  type SponsorRecord,
} from "@/components/sponsors/v2/sponsor-model";

/**
 * `/sponsors/[id]` — scheda di uno sponsor o fornitore (Web V2, pattern 2:
 * intestazione di scheda, striscia di avvisi, quattro aree, sezioni
 * chiudibili).
 *
 * Le tre schede V1 (Anagrafica · Finanza · Archivio) diventano quattro aree:
 * **Anagrafica** (dati, contatti, dati fiscali, sede), **Contratto** (le tre
 * cifre e il contratto), **Incassi** (il registro, con «Registra incasso» e
 * «Storna»), **Documenti**. `?tab=finanza|archivio` restano link validi.
 * Le scritture sono quelle della V1: anagrafica e documenti con
 * `updateClubDataItem` (che fonde), contratto con `saveSponsorContract`,
 * incasso con `recordSponsorCollection`; lo storno — che la V1 rimandava
 * alla pagina Movimenti — passa dallo stesso endpoint del registro rate.
 */
const moneyCents = (cents: number) => formatMoney(fromSponsorCents(cents));

const dateOrMissing = (value: string | null | undefined) => (value ? formatDateShort(value) : MISSING);

function SponsorDetailsPageContent() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { showToast } = useToast();
  const { activeClub, userRole } = useAuth();
  const sponsorId = params?.id as string;
  const { clubId, resolved } = useRouteClubId(searchParams?.get("clubId"));
  const activeRole = activeClub?.role || userRole || null;

  const canReadCredit = hasAccountingPermission(activeRole, "accounting.read");
  const canManageCredit = hasAccountingPermission(activeRole, "accounting.manage");
  const canReverse = canManageClubConfigurationAsActor(activeRole) || hasAccountingPermission(activeRole, "accounting.reverse");

  const [isLoading, setIsLoading] = React.useState(true);
  const [sponsor, setSponsor] = React.useState<SponsorRecord | null>(null);
  const [contract, setContract] = React.useState<SponsorContract>({ ...EMPTY_SPONSOR_CONTRACT });
  const [documents, setDocuments] = React.useState<SponsorDocument[]>([]);
  const [clubSettings, setClubSettings] = React.useState<Record<string, any>>({});
  const [creditFromServer, setCreditFromServer] = React.useState<SponsorCredit | null>(null);
  const [collections, setCollections] = React.useState<SponsorCollectionRow[]>([]);
  const [creditError, setCreditError] = React.useState<string | null>(null);
  const [creditLoading, setCreditLoading] = React.useState(false);

  const [editingSection, setEditingSection] = React.useState<SponsorFormSection | "all" | null>(null);
  const [contractOpen, setContractOpen] = React.useState(false);
  const [collectionOpen, setCollectionOpen] = React.useState(false);
  const [documentOpen, setDocumentOpen] = React.useState(false);
  const [deletingDocument, setDeletingDocument] = React.useState<SponsorDocument | null>(null);
  const [documentBusy, setDocumentBusy] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);
  const [deleteBusy, setDeleteBusy] = React.useState(false);
  const [reversing, setReversing] = React.useState<SponsorCollectionRow | null>(null);
  const [reverseBusy, setReverseBusy] = React.useState(false);

  const displayName = sponsor ? sponsorName(sponsor) : null;
  useBreadcrumbLabel(displayName);

  /* ── Credito e incassi, dal server ─────────────────────────────────────── */
  const ricaricaIncassi = React.useCallback(
    async (record: SponsorRecord | null) => {
      if (!clubId || !sponsorId || !canReadCredit) return;
      setCreditLoading(true);
      const risposta = await fetchSponsorCredit(sponsorId, { clubId });
      setCreditLoading(false);
      if (risposta.error || !risposta.data) {
        setCreditError(risposta.error?.message || "Residuo e incassi non disponibili");
        return;
      }
      setCreditError(null);
      setCreditFromServer(risposta.data.credit || null);
      const name = record?.name || risposta.data.sponsor.name || sponsorKindLabel(risposta.data.sponsor.kind);
      setCollections(
        (risposta.data.collections || []).map((incasso) => ({
          ...incasso,
          sponsorId,
          sponsorName: name,
          sponsorKind: risposta.data!.sponsor.kind,
        })),
      );
    },
    [clubId, sponsorId, canReadCredit],
  );

  /* ── Lettura della scheda ──────────────────────────────────────────────── */
  React.useEffect(() => {
    if (!resolved) return;
    if (!clubId) {
      showToast("error", "ID del club mancante. Torna alla lista sponsor.");
      setIsLoading(false);
      return;
    }
    if (!sponsorId) {
      showToast("error", "ID dello sponsor mancante");
      setIsLoading(false);
      return;
    }
    let cancelled = false;
    const fetchSponsorData = async () => {
      setIsLoading(true);
      try {
        const { data: clubData, error: clubError } = await supabase.from("clubs").select("sponsors, settings").eq("id", clubId).maybeSingle();
        if (cancelled) return;
        if (clubError) {
          console.error("Error fetching club data:", clubError);
          showToast("error", `Errore nel caricamento dei dati del club: ${clubError.message}`);
          setIsLoading(false);
          return;
        }
        if (!clubData) {
          showToast("error", "Club non trovato. Verifica l'ID del club.");
          setIsLoading(false);
          return;
        }
        const found = Array.isArray(clubData.sponsors) ? clubData.sponsors.find((item: any) => item && String(item.id) === String(sponsorId)) : null;
        if (!found) {
          showToast("error", "Sponsor/Fornitore non trovato");
          setSponsor(null);
          setIsLoading(false);
          return;
        }
        setSponsor(found);
        setContract(normalizeSponsorContract(found.contract));
        setDocuments(normalizeSponsorDocuments(found.documents));
        setClubSettings(clubData.settings && typeof clubData.settings === "object" ? clubData.settings : {});
        void ricaricaIncassi(found);
      } catch (error) {
        if (cancelled) return;
        console.error("Error fetching sponsor data:", error);
        showToast("error", "Errore nel caricamento dei dati dello sponsor");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };
    void fetchSponsorData();
    return () => {
      cancelled = true;
    };
  }, [clubId, resolved, sponsorId, ricaricaIncassi, showToast]);

  /* ── Aree e link profondi ──────────────────────────────────────────────── */
  const requestedArea = resolveSponsorArea(searchParams?.get("tab"));
  const area: SponsorArea = !canReadCredit && (requestedArea === "contratto" || requestedArea === "incassi") ? "anagrafica" : requestedArea;
  const setArea = (next: SponsorArea) => {
    const query = new URLSearchParams();
    if (clubId) query.set("clubId", clubId);
    query.set("tab", next);
    router.replace(`/sponsors/${encodeURIComponent(sponsorId)}?${query.toString()}`, { scroll: false });
  };
  const areas = SPONSOR_AREAS.filter((item) => canReadCredit || (item.value !== "contratto" && item.value !== "incassi"));

  /* ── Derivati ──────────────────────────────────────────────────────────── */
  const credit = React.useMemo(
    () => creditFromServer || resolveSponsorCredit({ contract, collections }),
    [creditFromServer, contract, collections],
  );
  const lifecycle = React.useMemo(() => contractLifecycle(contract), [contract]);
  const alerts = React.useMemo(() => (canReadCredit ? computeSponsorAlerts(credit, lifecycle, moneyCents) : []), [canReadCredit, credit, lifecycle]);
  const methodChoices = React.useMemo(() => getClubPaymentMethodChoices(clubSettings), [clubSettings]);
  const kind = normalizeSponsorKind(sponsor?.type);

  /* ── Scritture ─────────────────────────────────────────────────────────── */
  const saveSection = async (draft: SponsorDraft): Promise<boolean> => {
    if (!clubId || !sponsorId) return false;
    try {
      const payload = sponsorPayload(draft);
      await updateClubDataItem(clubId, "sponsors", sponsorId, payload);
      setSponsor((current) => (current ? { ...current, ...payload } : current));
      showToast("success", "Modifiche salvate con successo");
      return true;
    } catch (error) {
      console.error("Error updating sponsor:", error);
      showToast("error", "Errore nel salvataggio delle modifiche");
      return false;
    }
  };

  const confirmDelete = async () => {
    if (!clubId || !sponsorId) return;
    setDeleteBusy(true);
    try {
      await deleteClubDataItem(clubId, "sponsors", sponsorId);
      showToast("success", "Sponsor/Fornitore eliminato con successo");
      router.push(withClubId("/sponsors", clubId));
    } catch (error) {
      console.error("Error deleting sponsor:", error);
      showToast("error", "Errore nell'eliminazione dello sponsor");
      setDeleteBusy(false);
    }
  };

  /** Il contratto si salva dalla sua rotta, una scheda alla volta, sotto il lock del club. */
  const saveContract = async (next: SponsorContract): Promise<boolean> => {
    if (!clubId || !sponsorId) return false;
    try {
      const risposta = await saveSponsorContract({ clubId, sponsorId, contract: next });
      if (risposta.error) throw new Error(risposta.error.message);
      setContract(next);
      showToast("success", "Contratto salvato");
      return true;
    } catch (error) {
      console.error("Error saving sponsor contract:", error);
      showToast("error", error instanceof Error && error.message ? error.message : "Errore nel salvataggio del contratto");
      return false;
    }
  };

  /** L'incasso va nel registro degli incassi: da li passa in prima nota. */
  const submitCollection = async (submission: SponsorCollectionSubmission): Promise<boolean> => {
    if (!clubId || !sponsorId) return false;
    try {
      const risposta = await recordSponsorCollection({
        clubId,
        sponsorId,
        amount: submission.amount,
        paidAt: submission.paidAt,
        paymentMethod: submission.paymentMethod,
        financialAccountId: submission.financialAccountId,
        operationTypeCode: submission.operationTypeCode,
        notes: submission.notes,
      });
      if (risposta.error) throw new Error(risposta.error.message);
      await ricaricaIncassi(sponsor);
      showToast("success", "Pagamento registrato con successo");
      return true;
    } catch (error) {
      console.error("Error adding payment:", error);
      showToast("error", error instanceof Error && error.message ? error.message : "Errore nella registrazione del pagamento");
      return false;
    }
  };

  /** **Un incasso non si cancella: si storna.** Stesso endpoint del registro delle rate. */
  const confirmReverse = async (reason: string) => {
    if (!reversing) return;
    setReverseBusy(true);
    try {
      const { error } = await apiRequest(`/api/v1/payment-transactions/${encodeURIComponent(reversing.id)}`, {
        method: "POST",
        body: { action: "reverse", reason },
      });
      if (error) throw new Error(error.message || "Storno non riuscito");
      await ricaricaIncassi(sponsor);
      showToast("success", "Incasso stornato: resta visibile nello storico");
      setReversing(null);
    } catch (error) {
      showToast("error", error instanceof Error && error.message ? error.message : "Storno non riuscito");
    } finally {
      setReverseBusy(false);
    }
  };

  const writeDocuments = async (next: SponsorDocument[]) => {
    if (!clubId || !sponsorId) throw new Error("Club o sponsor mancante");
    await updateClubDataItem(clubId, "sponsors", sponsorId, { documents: next });
    setDocuments(next);
  };

  const addDocument = async (submission: SponsorDocumentSubmission): Promise<boolean> => {
    try {
      await writeDocuments([...documents, newSponsorDocument(submission)]);
      showToast("success", "Documento aggiunto con successo");
      return true;
    } catch (error) {
      console.error("Error adding document:", error);
      showToast("error", "Errore nell'aggiunta del documento");
      return false;
    }
  };

  const confirmDeleteDocument = async () => {
    if (!deletingDocument) return;
    setDocumentBusy(true);
    try {
      await writeDocuments(documents.filter((item) => item.id !== deletingDocument.id));
      showToast("success", "Documento eliminato con successo");
      setDeletingDocument(null);
    } catch (error) {
      console.error("Error deleting document:", error);
      showToast("error", "Errore nell'eliminazione del documento");
    } finally {
      setDocumentBusy(false);
    }
  };

  /* ── Intestazione ──────────────────────────────────────────────────────── */
  const headerActions: RecordAction[] = [
    { id: "edit", label: "Modifica", icon: <Pencil />, onClick: () => setEditingSection("all") },
    { id: "collect", label: "Registra incasso", icon: <Euro />, hidden: !canManageCredit, onClick: () => setCollectionOpen(true) },
    { id: "delete", label: "Elimina", icon: <Trash2 />, tone: "danger", overflow: true, onClick: () => setDeleting(true) },
  ];

  const identityFields: DetailField[] = sponsor
    ? [
        { label: "Nome / Ragione sociale", value: orMissing(sponsor.name) },
        { label: "Tipologia", value: sponsorKindLabel(sponsor.type) },
        { label: "Pubblica amministrazione", value: sponsor.isPublicAdministration ? "Sì" : "No" },
        { label: "Codice fiscale", value: <span className="egw-num uppercase">{orMissing(sponsor.fiscalCode)}</span> },
      ]
    : [];

  const contactFields: DetailField[] = sponsor
    ? [
        { label: "Email", value: orMissing(sponsor.email) },
        { label: "PEC", value: orMissing(sponsor.pec) },
        { label: "Telefono", value: <span className="egw-num">{orMissing(sponsor.phone)}</span> },
        { label: "Telefono secondario", value: <span className="egw-num">{orMissing(sponsor.phoneSecondary)}</span> },
      ]
    : [];

  const fiscalFields: DetailField[] = sponsor
    ? [
        { label: "Partita IVA", value: <span className="egw-num uppercase">{orMissing(sponsor.vatNumber)}</span> },
        { label: "Codice fiscale", value: <span className="egw-num uppercase">{orMissing(sponsor.fiscalCode)}</span> },
        { label: "Codice SDI", value: <span className="egw-num uppercase">{orMissing(sponsor.sdi)}</span> },
        { label: "IBAN", value: <span className="egw-num uppercase">{orMissing(sponsor.iban)}</span> },
      ]
    : [];

  const addressFields: DetailField[] = sponsor
    ? [
        { label: "Indirizzo", value: orMissing(joinMeta(sponsor.address, sponsor.streetNumber)) },
        { label: "Comune", value: orMissing(sponsor.city) },
        { label: "CAP", value: <span className="egw-num">{orMissing(sponsor.postalCode)}</span> },
        { label: "Provincia", value: orMissing(sponsor.province) },
        { label: "Regione", value: orMissing(sponsor.region) },
        { label: "Paese", value: orMissing(sponsor.country || "Italia") },
      ]
    : [];

  const addressSummary = sponsor
    ? joinMeta(joinMeta(sponsor.address, sponsor.streetNumber), joinMeta(sponsor.postalCode, sponsor.city), sponsor.province) || "Nessuna sede registrata"
    : "";

  const contractFields: DetailField[] = [
    { label: "Importo pattuito", value: moneyCents(contract.agreedAmountCents) },
    { label: "Periodo", value: orMissing(contractPeriodLabel(contract, dateOrMissing)) },
    { label: "Riferimento del contratto", value: orMissing(contract.documentReference) },
    { label: "Note", value: <span className="whitespace-pre-line">{orMissing(contract.notes)}</span>, wide: true },
  ];

  /* ── Documenti ─────────────────────────────────────────────────────────── */
  const documentColumns = React.useMemo<ColumnDef<SponsorDocument>[]>(
    () => [
      { id: "title", header: "Titolo", kind: "identity", locked: true, width: 1.6, cell: (row) => <span className="font-semibold text-egw-ink">{row.title}</span>, sortValue: (row) => row.title.toLowerCase(), title: (row) => row.title },
      { id: "description", header: "Descrizione", kind: "text", width: 2, cell: (row) => row.description || null, sortValue: (row) => row.description.toLowerCase() || null, title: (row) => row.description || undefined },
      { id: "fileName", header: "File", kind: "text", cell: (row) => row.fileName || null, sortValue: (row) => row.fileName.toLowerCase() || null, title: (row) => row.fileName || undefined },
      { id: "createdAt", header: "Data creazione", kind: "date", cell: (row) => formatDateShort(row.created_at), sortValue: (row) => row.created_at || null },
    ],
    [],
  );
  const documentActions = React.useMemo<RowActionDef<SponsorDocument>[]>(
    () => [{ id: "delete", label: "Elimina", icon: <Trash2 />, tone: "danger", onClick: (row) => setDeletingDocument(row) }],
    [],
  );

  const editButton = (section: SponsorFormSection) => (
    <Button variant="secondary" size="sm" onClick={() => setEditingSection(section)}>
      Modifica
    </Button>
  );

  const collectButton = (size: "xs" | "sm" | "md" = "sm") =>
    canManageCredit ? (
      <Button variant="secondary" size={size} icon={<Euro />} onClick={() => setCollectionOpen(true)}>
        Registra incasso
      </Button>
    ) : null;

  return (
    <div className="flex h-[100dvh] bg-egw-page">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Header title="Sponsor" />
        <main className={dashboardMainClassName}>
          <DashboardPageContainer>
            {isLoading ? (
              <>
                <Panel className="flex items-center gap-5">
                  <Skeleton className="h-[72px] w-[72px] rounded-full" />
                  <div className="flex-1">
                    <Skeleton className="mb-3 h-7 w-56" />
                    <Skeleton className="h-4 w-40" />
                  </div>
                </Panel>
                <DetailCard title="Dati anagrafici" loading />
                <DetailCard title="Contatti" loading />
              </>
            ) : !sponsor ? (
              <EmptyStateCard
                iconTone="neutral"
                title="Sponsor/Fornitore non trovato"
                description="La scheda che cerchi non è in questo club, oppure è stata eliminata."
                primary={
                  <Button variant="primary" onClick={() => router.push(withClubId("/sponsors", clubId))}>
                    Torna alla lista sponsor
                  </Button>
                }
              />
            ) : (
              <>
                <RecordHeader
                  eyebrow={sponsorKindLabel(sponsor.type)}
                  name={sponsorName(sponsor)}
                  identity={{ name: sponsorName(sponsor), round: true, avatarSrc: sponsor.logo || null }}
                  chips={
                    <>
                      <DataChip tone={kind === "fornitore" ? "neutral" : "blue"}>{sponsorKindLabel(sponsor.type)}</DataChip>
                      {sponsor.isPublicAdministration ? <DataChip tone="navy">P.A.</DataChip> : null}
                      {sponsor.city ? <DataChip>{sponsor.city}</DataChip> : null}
                    </>
                  }
                  status={canReadCredit ? <StatusPill status={contractStatusSpec(lifecycle)} detail={lifecycle.state !== "none" && contract.endDate ? formatDateShort(contract.endDate) : undefined} /> : null}
                  meta={joinMeta(sponsor.email, sponsor.vatNumber ? `P.IVA ${sponsor.vatNumber}` : null) || undefined}
                  actions={headerActions}
                  areas={
                    <RecordAreaSwitcher
                      value={area}
                      onChange={setArea}
                      areas={areas.map((item) => ({ ...item, problems: item.value === "contratto" ? alerts.length : 0 }))}
                    />
                  }
                >
                  <RecordAlertStrip
                    items={alerts.map((alert) => ({
                      id: alert.id,
                      severity: alert.severity,
                      text: alert.text,
                      action:
                        alert.id === "outstanding" ? (
                          collectButton("xs")
                        ) : canManageCredit ? (
                          <Button variant="secondary" size="xs" onClick={() => setContractOpen(true)}>
                            Aggiorna contratto
                          </Button>
                        ) : undefined,
                    }))}
                  />
                </RecordHeader>

                {area === "anagrafica" ? (
                  <>
                    <DetailCard eyebrow="Identità" title="Dati anagrafici" fields={identityFields} onEdit={() => setEditingSection("identity")} />
                    <DetailCard eyebrow="Contatti" title="Contatti" fields={contactFields} onEdit={() => setEditingSection("contacts")} />
                    <DetailCard eyebrow="Dati fiscali" title="Dati fiscali" fields={fiscalFields} onEdit={() => setEditingSection("fiscal")} />
                    <CollapsedSection id="sede" recordType="sponsor" title="Sede" summary={addressSummary} actions={editButton("address")}>
                      <dl className="grid grid-cols-1 gap-x-6 gap-y-[18px] sm:grid-cols-2 lg:grid-cols-3">
                        {addressFields.map((field) => (
                          <div key={String(field.label)} className="min-w-0">
                            <dt className="font-brand text-[12px] text-[rgba(11,26,58,.55)]">{field.label}</dt>
                            <dd className="mt-1 break-words font-brand text-[13.5px] text-egw-ink">{field.value}</dd>
                          </div>
                        ))}
                      </dl>
                    </CollapsedSection>
                  </>
                ) : null}

                {area === "contratto" ? (
                  <>
                    {/*
                      Le tre cifre stanno **accanto**, mai sommate: il dovuto e un
                      impegno, l'incassato e cassa, il residuo e la loro differenza.
                      Il contenitore e tratteggiato perche non e cassa.
                    */}
                    <SummaryCard
                      dashed
                      eyebrow="Credito"
                      title="Dovuto, incassato, residuo"
                      rows={[
                        { label: "Dovuto · pattuito dal contratto, non e cassa", value: moneyCents(credit.dueCents) },
                        { label: "Incassato · somma degli incassi registrati", value: moneyCents(credit.collectedCents), tone: "green" },
                      ]}
                      total={{
                        label: credit.hasContract ? "Residuo · dovuto meno incassato" : "Residuo · nessun contratto registrato",
                        value: moneyCents(credit.outstandingCents),
                        tone: credit.outstandingCents > 0 ? "amber" : credit.outstandingCents < 0 ? "red" : "ink",
                      }}
                      footer={
                        <>
                          {creditError ? <span className="mr-auto font-brand text-[12px] text-egw-red">{creditError}</span> : null}
                          {(() => {
                            const spec = creditStatusSpec(credit, lifecycle);
                            return spec ? <StatusPill status={spec} /> : null;
                          })()}
                          {collectButton()}
                        </>
                      }
                    />
                    {credit.hasContract ? (
                      <DetailCard
                        eyebrow="Contratto"
                        title={contract.documentReference || "Contratto di sponsorizzazione"}
                        fields={contractFields}
                        onEdit={canManageCredit ? () => setContractOpen(true) : undefined}
                        actions={<StatusPill status={contractStatusSpec(lifecycle)} detail={contract.endDate ? formatDateShort(contract.endDate) : undefined} />}
                      />
                    ) : (
                      <EmptyStateCard
                        icon={<FileText />}
                        title="Nessun contratto registrato"
                        description="Importo pattuito, periodo e riferimento della scrittura firmata: da questi il residuo si calcola."
                        primary={
                          canManageCredit ? (
                            <Button variant="secondary" size="sm" icon={<Plus />} onClick={() => setContractOpen(true)}>
                              Registra contratto
                            </Button>
                          ) : null
                        }
                      />
                    )}
                  </>
                ) : null}

                {area === "incassi" ? (
                  <>
                    <PanelHeader
                      eyebrow="Registro"
                      title="Incassi"
                      description="Le righe del registro degli incassi con questa controparte. Un incasso non si cancella: si storna, e restano visibili entrambe le righe."
                      actions={collectButton()}
                      className="mb-0"
                    />
                    <SponsorCollectionsGrid
                      module="sponsor-scheda-incassi"
                      rows={collections}
                      showSponsor={false}
                      state={creditLoading ? "loading" : creditError ? "error" : "ready"}
                      errorMessage={creditError}
                      onRetry={() => void ricaricaIncassi(sponsor)}
                      onReverse={canReverse ? (row) => setReversing(row) : undefined}
                      emptyPrimary={
                        canManageCredit ? (
                          <Button variant="secondary" size="sm" icon={<Euro />} onClick={() => setCollectionOpen(true)}>
                            Registra incasso
                          </Button>
                        ) : null
                      }
                    />
                  </>
                ) : null}

                {area === "documenti" ? (
                  <>
                    <PanelHeader
                      eyebrow="Archivio"
                      title="Documenti e contratti"
                      description="Titolo, descrizione e nome del file di riferimento."
                      actions={
                        <Button variant="secondary" size="sm" icon={<Plus />} onClick={() => setDocumentOpen(true)}>
                          Nuovo documento
                        </Button>
                      }
                      className="mb-0"
                    />
                    <DataGrid<SponsorDocument>
                      module="sponsor-documenti"
                      aria-label="Documenti dello sponsor"
                      rows={documents}
                      getRowId={(row) => row.id}
                      rowLabel={(row) => row.title}
                      columns={documentColumns}
                      defaultSort={{ columnId: "createdAt", direction: "desc" }}
                      rowActions={documentActions}
                      canSelect={false}
                      hideViews
                      hideFooter={documents.length <= 25}
                      noun={{ singular: "documento", plural: "documenti" }}
                      empty={{
                        icon: <FileText />,
                        title: "Nessun documento registrato",
                        description: "Contratto firmato, lettera d'intenti, materiale di visibilità: un riferimento sulla scheda.",
                        primary: (
                          <Button variant="secondary" size="sm" icon={<Plus />} onClick={() => setDocumentOpen(true)}>
                            Nuovo documento
                          </Button>
                        ),
                      }}
                    />
                  </>
                ) : null}
              </>
            )}
          </DashboardPageContainer>
        </main>
      </div>

      <SponsorDrawer
        open={Boolean(editingSection)}
        onOpenChange={(open) => !open && setEditingSection(null)}
        sponsor={sponsor}
        section={editingSection === "all" ? null : editingSection}
        onSave={saveSection}
      />

      <ContractDrawer open={contractOpen} onOpenChange={setContractOpen} contract={contract} hasContract={credit.hasContract} onSave={saveContract} />

      <CollectionDrawer
        open={collectionOpen}
        onOpenChange={setCollectionOpen}
        sponsor={sponsor}
        sponsors={sponsor ? [sponsor] : []}
        methodChoices={methodChoices}
        onSubmit={submitCollection}
      />

      <DocumentDrawer open={documentOpen} onOpenChange={setDocumentOpen} onSave={addDocument} />

      <DangerConfirmDialog
        open={Boolean(deletingDocument)}
        onOpenChange={(open) => !open && !documentBusy && setDeletingDocument(null)}
        title={`Eliminare ${deletingDocument?.title ?? "questo documento"}?`}
        description="Sei sicuro di voler eliminare questo documento?"
        consequences={["Il titolo, la descrizione e il riferimento al file", "Il documento non compare più nell'archivio della scheda"]}
        confirmLabel="Elimina"
        onConfirm={confirmDeleteDocument}
        loading={documentBusy}
      />

      <DeleteSponsorDialog
        open={deleting}
        onOpenChange={(open) => !deleteBusy && setDeleting(open)}
        sponsor={sponsor}
        collectionsCount={collections.filter((row) => !row.reversed).length}
        onConfirm={confirmDelete}
        loading={deleteBusy}
      />

      <StornoIncassoDialog
        row={reversing}
        onOpenChange={(open) => {
          if (!open) setReversing(null);
        }}
        saving={reverseBusy}
        onSubmit={confirmReverse}
      />
    </div>
  );
}

export default function SponsorDetailsPage() {
  return (
    <Suspense fallback={null}>
      <SponsorDetailsPageContent />
    </Suspense>
  );
}
