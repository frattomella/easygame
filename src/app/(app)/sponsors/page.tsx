"use client";

import * as React from "react";
import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Building, ChevronRight, Euro, Pencil, Plus, Trash2 } from "lucide-react";
import Sidebar from "@/components/dashboard/Sidebar";
import Header from "@/components/dashboard/Header";
import { DashboardPageContainer, dashboardMainClassName } from "@/components/dashboard/dashboard-page-container";
import { useAuth } from "@/components/providers/AuthProvider";
import { useToast } from "@/components/ui/toast-notification";
import { HeaderStat, PageHeader } from "@/components/web/page/PageHeader";
import { EmptyStateCard } from "@/components/web/page/Cards";
import { Button } from "@/components/web/primitives/Button";
import { SegmentedControl } from "@/components/web/primitives/Controls";
import { IdentityCell } from "@/components/web/primitives/Identity";
import { DataChip, StatusPill } from "@/components/web/primitives/StatusPill";
import { DataGrid } from "@/components/web/datagrid/DataGrid";
import type { ColumnDef, FilterDef, RowActionDef, ViewDef } from "@/components/web/datagrid/types";
import { formatDateShort, formatDaysLabel, formatInteger, formatMoney, joinMeta } from "@/lib/web/format";
import { apiRequest } from "@/lib/api/client";
import { supabase } from "@/lib/supabase";
import { addClubData, deleteClubDataItem, updateClubDataItem } from "@/lib/simplified-db";
import { sortByName } from "@/lib/sorting";
import { normalizeClubSeasons } from "@/lib/club-seasons";
import { getClubPaymentMethodChoices } from "@/lib/payments/payment-config-utils";
import { canManageClubConfigurationAsActor } from "@/lib/access-roles";
import { hasAccountingPermission } from "@/lib/accounting/permissions";
import { fetchSponsorsWithCredit, recordSponsorCollection } from "@/lib/sponsors/client";
import {
  fromSponsorCents,
  normalizeSponsorContract,
  type SponsorContract,
  type SponsorCredit,
} from "@/lib/sponsors/model";
import { SponsorDrawer } from "@/components/sponsors/v2/sponsor-drawer";
import { CollectionDrawer, type SponsorCollectionSubmission } from "@/components/sponsors/v2/collection-drawer";
import { SponsorCollectionsGrid } from "@/components/sponsors/v2/collections-grid";
import { DeleteSponsorDialog } from "@/components/sponsors/v2/delete-sponsor-dialog";
import { StornoIncassoDialog } from "@/components/sponsors/v2/storno-incasso-dialog";
import { useRouteClubId, withClubId } from "@/components/web/hooks/use-route-club-id";
import {
  contractLifecycle,
  contractStatusSpec,
  creditStatusSpec,
  matchesSponsorSearch,
  newSponsorId,
  sponsorDraftFrom,
  sponsorKindLabel,
  sponsorMeta,
  sponsorName,
  sponsorPayload,
  sumCollectionsInPeriodCents,
  type ContractLifecycle,
  type SponsorCollectionRow,
  type SponsorDraft,
  type SponsorRecord,
} from "@/components/sponsors/v2/sponsor-model";

/**
 * `/sponsors` — sponsor e fornitori del club (Web V2, pattern 1:
 * intestazione di pagina + DataGrid a tutta larghezza).
 *
 * Le tre schede della V1 diventano: **Sponsor** e **Fornitori** una griglia
 * sola con il filtro «Tipologia» (stesso record, stesso `type`), e il
 * registro **Pagamenti** un secondo segmento («Incassi», `?tab=incassi`) sul
 * registro degli incassi che il server manda insieme al residuo. Le letture
 * e le scritture sono quelle della V1: anagrafica via `simplified-db` sul
 * CRUD generico `sponsors`; credito, contratto e incasso via
 * `@/lib/sponsors/client`. Le tre cifre le calcola il server e qui non si
 * ricalcolano (vedi `src/lib/server/sponsors.ts`).
 */
type SponsorRow = {
  record: SponsorRecord;
  contract: SponsorContract;
  credit: SponsorCredit | null;
  lifecycle: ContractLifecycle;
};

type ListTab = "sponsor" | "incassi";

const SPONSOR_VIEWS: ViewDef[] = [
  { id: "active", label: "Attivi", filters: { contract: "active" }, builtIn: true },
  { id: "expiring", label: "Contratti in scadenza", filters: { contract: "expiring" }, builtIn: true, tone: "amber" },
  { id: "expired", label: "Scaduti", filters: { contract: "expired" }, builtIn: true, tone: "red" },
];

const NO_VIEWS: ViewDef[] = [];

const moneyCents = (cents: number) => formatMoney(fromSponsorCents(cents));

function SponsorsPageContent() {
  const { showToast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { activeClub, userRole } = useAuth();
  const { clubId, resolved } = useRouteClubId(searchParams?.get("clubId"));
  const activeRole = activeClub?.role || userRole || null;

  /*
    Gli stessi predicati delle rotte, e nessun altro: il credito e gli
    incassi chiedono `accounting.read`, contratto e incasso
    `accounting.manage`, lo storno la direzione o `accounting.reverse`
    (`src/app/api/v1/payment-transactions/[id]/route.ts`). L'anagrafica resta
    al CRUD generico, aperto a tutti i ruoli gestionali.
  */
  const canReadCredit = hasAccountingPermission(activeRole, "accounting.read");
  const canManageCredit = hasAccountingPermission(activeRole, "accounting.manage");
  const canReverse = canManageClubConfigurationAsActor(activeRole) || hasAccountingPermission(activeRole, "accounting.reverse");

  const tab: ListTab = searchParams?.get("tab") === "incassi" && canReadCredit ? "incassi" : "sponsor";
  const setTab = (next: ListTab) => {
    const query = new URLSearchParams(searchParams?.toString() || "");
    if (next === "incassi") query.set("tab", "incassi");
    else query.delete("tab");
    const suffix = query.toString();
    router.replace(`/sponsors${suffix ? `?${suffix}` : ""}`, { scroll: false });
  };

  const [sponsors, setSponsors] = React.useState<SponsorRecord[]>([]);
  const [clubSettings, setClubSettings] = React.useState<Record<string, any>>({});
  const [credits, setCredits] = React.useState<Map<string, SponsorCredit>>(new Map());
  const [collections, setCollections] = React.useState<SponsorCollectionRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [creditError, setCreditError] = React.useState<string | null>(null);
  const [reloadKey, setReloadKey] = React.useState(0);
  const [requestedViewId, setRequestedViewId] = React.useState<string | null>(null);

  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<SponsorRecord | null>(null);
  const [collectionFor, setCollectionFor] = React.useState<SponsorRecord | null>(null);
  const [collectionOpen, setCollectionOpen] = React.useState(false);
  const [deleting, setDeleting] = React.useState<SponsorRecord | null>(null);
  const [deleteBusy, setDeleteBusy] = React.useState(false);
  const [reversing, setReversing] = React.useState<SponsorCollectionRow | null>(null);
  const [reverseBusy, setReverseBusy] = React.useState(false);

  /* ── Lettura: anagrafica + impostazioni, poi credito e incassi ─────────── */
  const loadCredits = React.useCallback(
    async (records: SponsorRecord[]) => {
      if (!clubId || !canReadCredit) {
        setCredits(new Map());
        setCollections([]);
        return;
      }
      /*
        Le tre cifre le calcola il server, che conosce **entrambe** le fonti
        degli incassi. La lettura e separata di proposito: se fallisce,
        l'elenco si vede comunque, e il residuo si dichiara non disponibile
        invece di ricadere su un calcolo che conosce il solo contratto.
      */
      const conCredito = await fetchSponsorsWithCredit({ clubId });
      if (conCredito.error || !conCredito.data?.sponsors) {
        setCredits(new Map());
        setCollections([]);
        setCreditError(conCredito.error?.message || "Residuo e incassi non disponibili");
        return;
      }
      setCreditError(null);
      const byId = new Map(records.map((record) => [String(record.id), record]));
      setCredits(new Map(conCredito.data.sponsors.map((riga) => [String(riga.sponsor.id), riga.credit])));
      /* Gli incassi arrivano con il residuo che spiegano: stessa fonte, stessa lettura. */
      setCollections(
        conCredito.data.sponsors.flatMap((riga) =>
          riga.collections.map((incasso) => ({
            ...incasso,
            sponsorId: String(riga.sponsor.id),
            sponsorName: byId.get(String(riga.sponsor.id))?.name || riga.sponsor.name || sponsorKindLabel(riga.sponsor.kind),
            sponsorKind: riga.sponsor.kind,
          })),
        ),
      );
    },
    [clubId, canReadCredit],
  );

  React.useEffect(() => {
    if (!resolved) return;
    if (!clubId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const { data: clubData, error } = await supabase.from("clubs").select("sponsors, settings").eq("id", clubId).maybeSingle();
        if (cancelled) return;
        if (error) throw error;
        const records: SponsorRecord[] = Array.isArray(clubData?.sponsors)
          ? clubData.sponsors.filter((item: any) => item && typeof item === "object" && item.id)
          : [];
        setSponsors(records);
        setClubSettings(clubData?.settings && typeof clubData.settings === "object" ? clubData.settings : {});
        setLoadError(null);
        await loadCredits(records);
      } catch (error) {
        if (cancelled) return;
        console.error("Error loading sponsors and payments:", error);
        showToast("error", "Errore nel caricamento dei dati");
        setSponsors([]);
        setCollections([]);
        setLoadError(error instanceof Error ? error.message : null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [clubId, resolved, reloadKey, loadCredits, showToast]);

  const reload = () => setReloadKey((key) => key + 1);

  /* ── Derivati ──────────────────────────────────────────────────────────── */
  const rows = React.useMemo<SponsorRow[]>(
    () =>
      sortByName(sponsors, (sponsor) => sponsor?.name).map((record) => {
        const contract = normalizeSponsorContract(record.contract);
        return {
          record,
          contract,
          credit: credits.get(String(record.id)) ?? null,
          lifecycle: contractLifecycle(contract),
        };
      }),
    [sponsors, credits],
  );

  const season = React.useMemo(() => normalizeClubSeasons(clubSettings).activeSeason, [clubSettings]);
  const methodChoices = React.useMemo(() => getClubPaymentMethodChoices(clubSettings), [clubSettings]);

  const stats = React.useMemo(() => {
    const active = rows.filter((row) => row.lifecycle.state === "active" || row.lifecycle.state === "expiring").length;
    const expiring = rows.filter((row) => row.lifecycle.state === "expiring").length;
    const expired = rows.filter((row) => row.lifecycle.state === "expired").length;
    const collectedSeasonCents = sumCollectionsInPeriodCents(collections, season.startDate, season.endDate);
    return { active, expiring, expired, collectedSeasonCents };
  }, [rows, collections, season]);

  const collectionsOf = (sponsorId: string) => collections.filter((row) => row.sponsorId === sponsorId);

  /* ── Scritture (stesse funzioni e stessi messaggi della V1) ────────────── */
  const openCreate = () => {
    setEditing(null);
    setDrawerOpen(true);
  };

  const openEdit = (record: SponsorRecord) => {
    setEditing(record);
    setDrawerOpen(true);
  };

  const saveSponsor = async (draft: SponsorDraft): Promise<boolean> => {
    if (!clubId) {
      showToast("error", "Nessun club selezionato. Vai alla dashboard per selezionare un club.");
      return false;
    }
    try {
      if (editing) {
        const updated = await updateClubDataItem(clubId, "sponsors", editing.id, sponsorPayload(draft));
        setSponsors(Array.isArray(updated) ? updated.filter((item: any) => item && item.id) : sponsors.map((item) => (item.id === editing.id ? { ...item, ...sponsorPayload(draft) } : item)));
        showToast("success", "Sponsor aggiornato con successo");
      } else {
        const now = new Date().toISOString();
        const added = await addClubData(clubId, "sponsors", { ...sponsorPayload(draft), id: newSponsorId(), created_at: now, updated_at: now });
        setSponsors((current) => [...current, added]);
        showToast("success", "Sponsor aggiunto con successo");
      }
      setEditing(null);
      return true;
    } catch (error) {
      console.error("Error saving sponsor:", error);
      showToast("error", "Errore nel salvare lo sponsor");
      return false;
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    if (!clubId) {
      showToast("error", "Nessun club selezionato. Vai alla dashboard per selezionare un club.");
      return;
    }
    setDeleteBusy(true);
    try {
      await deleteClubDataItem(clubId, "sponsors", deleting.id);
      setSponsors((current) => current.filter((item) => item.id !== deleting.id));
      /*
        Gli incassi di uno sponsor cancellato **restano nel registro**, con la
        controparte congelata: il denaro e entrato davvero. Qui spariscono
        solo dalla vista, come nella V1; la prossima lettura li riporta con
        l'etichetta congelata sulla riga.
      */
      setCollections((current) => current.filter((row) => row.sponsorId !== deleting.id));
      showToast("success", "Sponsor eliminato con successo");
      setDeleting(null);
    } catch (error) {
      console.error("Error deleting sponsor:", error);
      showToast("error", "Errore nell'eliminare lo sponsor");
    } finally {
      setDeleteBusy(false);
    }
  };

  const openCollection = (record: SponsorRecord | null) => {
    setCollectionFor(record);
    setCollectionOpen(true);
  };

  const submitCollection = async (submission: SponsorCollectionSubmission): Promise<boolean> => {
    if (!clubId) {
      showToast("error", "Nessun club selezionato. Vai alla dashboard per selezionare un club.");
      return false;
    }
    try {
      /*
        **L'incasso di uno sponsor va nel registro degli incassi**: da li lo
        legge la prima nota. La vecchia collezione JSON non riceve piu niente.
      */
      const risposta = await recordSponsorCollection({
        clubId,
        sponsorId: submission.sponsorId,
        amount: submission.amount,
        paidAt: submission.paidAt,
        paymentMethod: submission.paymentMethod,
        financialAccountId: submission.financialAccountId,
        operationTypeCode: submission.operationTypeCode,
        notes: submission.notes,
      });
      if (risposta.error) throw new Error(risposta.error.message);
      await loadCredits(sponsors);
      showToast("success", "Pagamento registrato con successo");
      return true;
    } catch (error) {
      console.error("Error saving payment:", error);
      showToast("error", error instanceof Error && error.message ? error.message : "Errore nel salvare il pagamento");
      return false;
    }
  };

  /**
   * **Un incasso non si cancella: si storna.** Stesso endpoint del registro
   * delle rate: nasce la riga opposta, l'originale resta con il motivo.
   */
  const confirmReverse = async (reason: string) => {
    if (!reversing) return;
    setReverseBusy(true);
    try {
      const { error } = await apiRequest(`/api/v1/payment-transactions/${encodeURIComponent(reversing.id)}`, {
        method: "POST",
        body: { action: "reverse", reason },
      });
      if (error) throw new Error(error.message || "Storno non riuscito");
      await loadCredits(sponsors);
      showToast("success", "Incasso stornato: resta visibile nello storico");
      setReversing(null);
    } catch (error) {
      showToast("error", error instanceof Error && error.message ? error.message : "Storno non riuscito");
    } finally {
      setReverseBusy(false);
    }
  };

  const recordHref = (record: SponsorRecord) => withClubId(`/sponsors/${encodeURIComponent(record.id)}`, clubId);
  const openRecord = (record: SponsorRecord) => router.push(recordHref(record));

  /* ── Griglia degli sponsor ─────────────────────────────────────────────── */
  const columns = React.useMemo<ColumnDef<SponsorRow>[]>(() => {
    const list: ColumnDef<SponsorRow>[] = [
      {
        id: "identity",
        header: "Nome",
        kind: "identity",
        locked: true,
        width: 2,
        cell: (row) => <IdentityCell name={sponsorName(row.record)} meta={sponsorMeta(row.record)} round avatarSrc={row.record.logo || null} href={recordHref(row.record)} onClick={() => openRecord(row.record)} />,
        sortValue: (row) => sponsorName(row.record).toLowerCase(),
        exportValue: (row) => sponsorName(row.record),
        title: (row) => sponsorName(row.record),
      },
      {
        id: "kind",
        header: "Tipologia",
        kind: "classification",
        cell: (row) => <DataChip tone={row.record.type === "fornitore" ? "neutral" : "blue"}>{sponsorKindLabel(row.record.type)}</DataChip>,
        sortValue: (row) => sponsorKindLabel(row.record.type),
        exportValue: (row) => sponsorKindLabel(row.record.type),
      },
    ];
    if (canReadCredit) {
      list.push(
        {
          id: "contractAmount",
          header: "Contratto",
          label: "Importo del contratto",
          kind: "amount",
          align: "right",
          cell: (row) => (row.lifecycle.state === "none" ? null : moneyCents(row.contract.agreedAmountCents)),
          sortValue: (row) => (row.lifecycle.state === "none" ? null : row.contract.agreedAmountCents),
          exportValue: (row) => (row.lifecycle.state === "none" ? "" : fromSponsorCents(row.contract.agreedAmountCents)),
        },
        {
          id: "contractEnd",
          header: "Scadenza contratto",
          kind: "status",
          cell: (row) => {
            if (row.lifecycle.state === "none") return <StatusPill status={contractStatusSpec(row.lifecycle)} />;
            const detail =
              row.lifecycle.state === "expiring" && row.lifecycle.days != null
                ? formatDaysLabel(row.lifecycle.days)
                : row.contract.endDate
                  ? formatDateShort(row.contract.endDate)
                  : null;
            return <StatusPill status={contractStatusSpec(row.lifecycle)} detail={detail} />;
          },
          sortValue: (row) => row.contract.endDate || null,
          exportValue: (row) => row.contract.endDate || "",
          title: (row) => (row.contract.endDate ? formatDateShort(row.contract.endDate) : undefined),
        },
        {
          id: "collected",
          header: "Incassato",
          kind: "amount",
          align: "right",
          cell: (row) => (row.credit ? moneyCents(row.credit.collectedCents) : null),
          sortValue: (row) => row.credit?.collectedCents ?? null,
          exportValue: (row) => (row.credit ? fromSponsorCents(row.credit.collectedCents) : ""),
        },
        {
          id: "outstanding",
          header: "Residuo",
          kind: "amount",
          align: "right",
          cell: (row) => {
            if (!row.credit) return <span className="text-egw-ink-62">{creditError ? "Non disponibile" : null}</span>;
            if (!row.credit.hasContract) return <span className="text-egw-ink-62">Nessun contratto</span>;
            return <span className={row.credit.outstandingCents > 0 ? "font-bold text-egw-amber-ink" : "font-bold"}>{moneyCents(row.credit.outstandingCents)}</span>;
          },
          sortValue: (row) => (row.credit?.hasContract ? row.credit.outstandingCents : null),
          exportValue: (row) => (row.credit?.hasContract ? fromSponsorCents(row.credit.outstandingCents) : ""),
        },
        {
          id: "credit",
          header: "Credito",
          kind: "status",
          cell: (row) => {
            const spec = creditStatusSpec(row.credit, row.lifecycle);
            return spec ? <StatusPill status={spec} /> : null;
          },
          sortValue: (row) => creditStatusSpec(row.credit, row.lifecycle)?.label ?? null,
          exportValue: (row) => creditStatusSpec(row.credit, row.lifecycle)?.label ?? "",
        },
      );
    }
    list.push(
      {
        id: "contacts",
        header: "Contatti",
        kind: "text",
        width: 1.4,
        cell: (row) => joinMeta(row.record.email, row.record.phone) || null,
        sortValue: (row) => String(row.record.email || "").toLowerCase() || null,
        exportValue: (row) => joinMeta(row.record.email, row.record.phone),
        title: (row) => joinMeta(row.record.email, row.record.phone) || undefined,
      },
      {
        id: "vatNumber",
        header: "P.IVA",
        kind: "text",
        hidden: true,
        cell: (row) => <span className="egw-num uppercase">{String(row.record.vatNumber || "").trim()}</span>,
        sortValue: (row) => String(row.record.vatNumber || "").trim() || null,
        exportValue: (row) => String(row.record.vatNumber || "").trim(),
      },
      {
        id: "fiscalCode",
        header: "Codice fiscale",
        kind: "text",
        hidden: true,
        cell: (row) => <span className="egw-num uppercase">{String(row.record.fiscalCode || "").trim()}</span>,
        sortValue: (row) => String(row.record.fiscalCode || "").trim() || null,
        exportValue: (row) => String(row.record.fiscalCode || "").trim(),
      },
      {
        id: "city",
        header: "Città",
        kind: "text",
        hidden: true,
        cell: (row) => String(row.record.city || "").trim(),
        sortValue: (row) => String(row.record.city || "").trim().toLowerCase() || null,
      },
      {
        id: "pec",
        header: "PEC",
        kind: "text",
        hidden: true,
        cell: (row) => String(row.record.pec || "").trim(),
        sortValue: (row) => String(row.record.pec || "").trim().toLowerCase() || null,
      },
    );
    return list;
    // `recordHref`/`openRecord` dipendono solo dal club.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canReadCredit, creditError, clubId]);

  const filters = React.useMemo<FilterDef<SponsorRow>[]>(() => {
    const list: FilterDef<SponsorRow>[] = [
      {
        id: "kind",
        label: "Tipologia",
        type: "select",
        pinned: true,
        options: [
          { value: "sponsor", label: "Sponsor" },
          { value: "fornitore", label: "Fornitori" },
        ],
        apply: (row, value) => (value === "sponsor" ? row.record.type !== "fornitore" : value === "fornitore" ? row.record.type === "fornitore" : true),
      },
    ];
    if (canReadCredit) {
      list.push(
        {
          id: "contract",
          label: "Contratto",
          type: "select",
          options: [
            { value: "active", label: "Attivo" },
            { value: "expiring", label: "In scadenza", tone: "amber" },
            { value: "expired", label: "Scaduto", tone: "red" },
            { value: "none", label: "Senza contratto" },
          ],
          apply: (row, value) => {
            if (value === "active") return row.lifecycle.state === "active" || row.lifecycle.state === "expiring";
            if (value === "expiring" || value === "expired" || value === "none") return row.lifecycle.state === value;
            return true;
          },
        },
        {
          id: "credit",
          label: "Credito",
          type: "select",
          options: [
            { value: "outstanding", label: "Con residuo", tone: "amber" },
            { value: "settled", label: "Saldato", tone: "green" },
          ],
          apply: (row, value) => {
            if (!row.credit?.hasContract) return value == null || value === "";
            if (value === "outstanding") return row.credit.outstandingCents > 0;
            if (value === "settled") return row.credit.isSettled;
            return true;
          },
        },
      );
    }
    return list;
  }, [canReadCredit]);

  const rowActions = React.useMemo<RowActionDef<SponsorRow>[]>(
    () => [
      { id: "open", label: "Apri", icon: <ChevronRight />, primary: true, onClick: (row) => openRecord(row.record) },
      { id: "edit", label: "Modifica", icon: <Pencil />, onClick: (row) => openEdit(row.record) },
      ...(canManageCredit
        ? [{ id: "collect", label: "Registra incasso", icon: <Euro />, onClick: (row: SponsorRow) => openCollection(row.record) }]
        : []),
      { id: "delete", label: "Elimina", icon: <Trash2 />, tone: "danger", onClick: (row) => setDeleting(row.record) },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [canManageCredit, clubId],
  );

  const search = React.useMemo(
    () => ({
      placeholder: "Cerca per nome, email, P.IVA",
      match: (row: SponsorRow, query: string) => matchesSponsorSearch(row.record, query),
    }),
    [],
  );

  const gridState = loading ? "loading" : loadError ? "error" : "ready";
  const collectionsState: "ready" | "loading" | "error" = loading ? "loading" : creditError ? "error" : "ready";

  return (
    <div className="flex h-[100dvh] bg-egw-page">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Header title="Sponsor" />
        <main className={dashboardMainClassName}>
          <DashboardPageContainer>
            {resolved && !clubId ? (
              <EmptyStateCard
                icon={<Building />}
                iconTone="neutral"
                title="Nessun club selezionato"
                description="Per gestire sponsor e fornitori, devi prima selezionare un club."
                primary={
                  <Button variant="primary" onClick={() => router.push("/dashboard")}>
                    Vai alla Dashboard
                  </Button>
                }
              />
            ) : (
              <>
                <PageHeader
                  eyebrow="Cassa e amministrazione"
                  title="Sponsor e fornitori"
                  description="Sponsor, partner e fornitori della società: contratti, incassi e residuo da incassare."
                  stats={
                    <>
                      <HeaderStat value={formatInteger(sponsors.length)} label="in archivio" />
                      {canReadCredit ? (
                        <>
                          <HeaderStat value={formatInteger(stats.active)} label="sponsor attivi" tone="green" onClick={() => setRequestedViewId("active")} />
                          <HeaderStat value={formatInteger(stats.expiring)} label="contratti in scadenza" tone={stats.expiring ? "amber" : "ink"} onClick={() => setRequestedViewId("expiring")} />
                          <HeaderStat value={formatInteger(stats.expired)} label="scaduti" tone={stats.expired ? "red" : "ink"} onClick={() => setRequestedViewId("expired")} />
                          <HeaderStat value={moneyCents(stats.collectedSeasonCents)} label={`incassato ${season.label}`} tone="blue" />
                        </>
                      ) : null}
                    </>
                  }
                  actions={
                    <>
                      <Button variant="primary" icon={<Plus />} onClick={openCreate}>
                        Nuovo sponsor
                      </Button>
                      {canManageCredit && sponsors.length ? (
                        <Button variant="secondary" icon={<Euro />} onClick={() => openCollection(null)}>
                          Registra incasso
                        </Button>
                      ) : null}
                    </>
                  }
                >
                  {canReadCredit ? (
                    <SegmentedControl<ListTab>
                      value={tab}
                      onChange={setTab}
                      aria-label="Sezione"
                      options={[
                        { value: "sponsor", label: "Sponsor" },
                        { value: "incassi", label: "Incassi" },
                      ]}
                    />
                  ) : null}
                </PageHeader>

                {tab === "sponsor" ? (
                  <DataGrid<SponsorRow>
                    module="sponsor"
                    aria-label="Elenco di sponsor e fornitori"
                    rows={rows}
                    getRowId={(row) => String(row.record.id)}
                    rowLabel={(row) => sponsorName(row.record)}
                    columns={columns}
                    filters={filters}
                    views={canReadCredit ? SPONSOR_VIEWS : NO_VIEWS}
                    search={search}
                    defaultSort={{ columnId: "identity", direction: "asc" }}
                    rowActions={rowActions}
                    onOpenRow={(row) => openRecord(row.record)}
                    requestedViewId={requestedViewId}
                    state={gridState}
                    errorMessage={loadError}
                    onRetry={reload}
                    noun={{ singular: "partner", plural: "partner" }}
                    empty={{
                      icon: <Building />,
                      title: "Nessuno sponsor in archivio",
                      description: "Registra il primo sponsor o fornitore del club: ragione sociale, contatti, dati fiscali e sede.",
                      primary: (
                        <Button variant="primary" size="sm" icon={<Plus />} onClick={openCreate}>
                          Nuovo sponsor
                        </Button>
                      ),
                    }}
                  />
                ) : (
                  <SponsorCollectionsGrid
                    module="sponsor-incassi"
                    rows={collections}
                    showSponsor
                    state={collectionsState}
                    errorMessage={creditError}
                    onRetry={reload}
                    onReverse={canReverse ? (row) => setReversing(row) : undefined}
                    onOpenSponsor={(row) => {
                      const record = sponsors.find((item) => String(item.id) === row.sponsorId);
                      if (record) openRecord(record);
                    }}
                    emptyPrimary={
                      canManageCredit && sponsors.length ? (
                        <Button variant="secondary" size="sm" icon={<Euro />} onClick={() => openCollection(null)}>
                          Registra incasso
                        </Button>
                      ) : null
                    }
                  />
                )}
              </>
            )}
          </DashboardPageContainer>
        </main>
      </div>

      <SponsorDrawer
        open={drawerOpen}
        onOpenChange={(open) => {
          setDrawerOpen(open);
          if (!open) setEditing(null);
        }}
        sponsor={editing}
        onSave={saveSponsor}
      />

      <CollectionDrawer
        open={collectionOpen}
        onOpenChange={(open) => {
          setCollectionOpen(open);
          if (!open) setCollectionFor(null);
        }}
        sponsor={collectionFor}
        sponsors={rows.map((row) => row.record)}
        methodChoices={methodChoices}
        onSubmit={submitCollection}
      />

      <DeleteSponsorDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => !open && !deleteBusy && setDeleting(null)}
        sponsor={deleting}
        collectionsCount={deleting ? collectionsOf(deleting.id).filter((row) => !row.reversed).length : 0}
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

export default function SponsorsPage() {
  return (
    <Suspense fallback={null}>
      <SponsorsPageContent />
    </Suspense>
  );
}
