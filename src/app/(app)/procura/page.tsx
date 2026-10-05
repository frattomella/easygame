"use client";

import * as React from "react";
import { ChevronRight, Pencil, Plus, Scale, Trash2 } from "lucide-react";
import Sidebar from "@/components/dashboard/Sidebar";
import Header from "@/components/dashboard/Header";
import { DashboardPageContainer, dashboardMainClassName } from "@/components/dashboard/dashboard-page-container";
import { useAuth } from "@/components/providers/AuthProvider";
import { useToast } from "@/components/ui/toast-notification";
import { HeaderStat, PageHeader } from "@/components/web/page/PageHeader";
import { Button } from "@/components/web/primitives/Button";
import { IdentityCell } from "@/components/web/primitives/Identity";
import { DataGrid } from "@/components/web/datagrid/DataGrid";
import type { ColumnDef, FilterDef, RowActionDef, ViewDef } from "@/components/web/datagrid/types";
import { formatInteger, formatMoney } from "@/lib/web/format";
import { addClubData, deleteClubDataItem, getClubAthletes, getClubData, updateClubDataItem } from "@/lib/simplified-db";
import { ProcuraDrawer } from "@/components/procura/v2/procura-drawer";
import { ProcuraInspector, type People } from "@/components/procura/v2/procura-inspector";
import { DeleteProcuraDialog } from "@/components/procura/v2/delete-procura-dialog";
import {
  athletesOf,
  contactsOf,
  countAssociations,
  matchesProcuraSearch,
  paymentsBalance,
  paymentsOf,
  procuraCity,
  procuraMeta,
  trainersOf,
  type PersonRef,
  type Procura,
  type ProcuraAssociation,
  type ProcuraDraft,
  type ProcuraPayment,
} from "@/components/procura/v2/procura-model";

/**
 * `/procura` — le procure del club (Web V2, pattern 1: intestazione di pagina
 * + DataGrid a tutta larghezza, con l'ispettore a cassetto per il dettaglio).
 *
 * Una «procura» qui e un record CRM in forma libera nella colonna JSON
 * `clubs.procure` — non e un tutore (`athlete_guardians`) ne un mandato di
 * `/sport-work`. I dati e le scritture sono quelli della V1, via
 * `simplified-db`: ogni mutazione rilegge e riscrive l'intera colonna. La
 * forma salvata non cambia: `club-financial-summary.ts` legge i pagamenti
 * delle procure (`procura_id`, `procura_name`, `payments[].amount/type`) per
 * i movimenti consolidati del club.
 */
const PROCURE_VIEWS: ViewDef[] = [
  { id: "no-contacts", label: "Senza contatti", filters: { contacts: "none" }, builtIn: true, tone: "amber" },
  { id: "with-payments", label: "Con pagamenti", filters: { payments: "some" }, builtIn: true },
];

const emptyPeople: People = { athletes: [], trainers: [] };

export default function ProcuraPage() {
  const { showToast } = useToast();
  const { activeClub, user } = useAuth();
  const clubId = activeClub?.id ?? null;

  const [procure, setProcure] = React.useState<Procura[]>([]);
  const [people, setPeople] = React.useState<People>(emptyPeople);
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [reloadKey, setReloadKey] = React.useState(0);

  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [inspectorOpen, setInspectorOpen] = React.useState(false);
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Procura | null>(null);
  const [deleting, setDeleting] = React.useState<Procura | null>(null);
  const [deleteBusy, setDeleteBusy] = React.useState(false);
  // «Modifica informazioni» dall'ispettore: un cassetto non apre un secondo
  // cassetto, quindi l'ispettore si chiude e, salvato, si riapre da solo.
  const [returnToInspector, setReturnToInspector] = React.useState(false);

  /* ── Lettura (stesse tre letture della V1) ─────────────────────────────── */
  React.useEffect(() => {
    if (!clubId || !user) {
      setLoading(false);
      setProcure([]);
      setPeople(emptyPeople);
      return;
    }
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        // Le procure: se questa lettura fallisce l'elenco e in errore, non vuoto.
        const procureData = await getClubData(clubId, "procure");
        if (cancelled) return;
        setProcure(Array.isArray(procureData) ? procureData : []);
        setLoadError(null);

        // Atleti e allenatori servono ai nomi: senza, si legge «Sconosciuto».
        let athletes: PersonRef[] = [];
        try {
          const athletesData = await getClubAthletes(clubId);
          athletes = (Array.isArray(athletesData) ? athletesData : []).map((athlete: any) => ({
            id: String(athlete.id),
            name: `${athlete.first_name} ${athlete.last_name}`,
            firstName: athlete.first_name,
            lastName: athlete.last_name,
            type: "athlete" as const,
          }));
        } catch {
          console.warn("Athletes not found, using empty array");
        }
        let trainers: PersonRef[] = [];
        try {
          const trainersData = await getClubData(clubId, "trainers");
          trainers = (Array.isArray(trainersData) ? trainersData : []).map((trainer: any) => ({
            id: String(trainer.id),
            name: `${trainer.firstName} ${trainer.lastName}`,
            firstName: trainer.firstName,
            lastName: trainer.lastName,
            type: "trainer" as const,
          }));
        } catch {
          console.warn("Trainers not found, using empty array");
        }
        if (cancelled) return;
        setPeople({ athletes, trainers });
      } catch (error) {
        if (cancelled) return;
        console.error("Error loading procura data:", error);
        setProcure([]);
        setLoadError(error instanceof Error ? error.message : null);
        showToast("error", "Errore nel caricamento dei dati");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [clubId, user, reloadKey, showToast]);

  const reload = () => setReloadKey((k) => k + 1);

  const selected = React.useMemo(() => procure.find((p) => p.id === selectedId) ?? null, [procure, selectedId]);

  /* ── Scritture (stesse funzioni, stessi messaggi della V1) ─────────────── */
  const openInspector = (procura: Procura) => {
    setSelectedId(procura.id);
    setInspectorOpen(true);
  };

  const openCreate = () => {
    setEditing(null);
    setDrawerOpen(true);
  };

  const openEdit = (procura: Procura) => {
    setReturnToInspector(inspectorOpen && selectedId === procura.id);
    setInspectorOpen(false);
    setEditing(procura);
    setDrawerOpen(true);
  };

  /** V1 `saveProcura`: crea o aggiorna l'intera procura, contatti compresi. */
  const saveProcura = async (draft: ProcuraDraft): Promise<boolean> => {
    if (!clubId) {
      showToast("error", "Club non trovato");
      return false;
    }
    try {
      const procuraToSave = {
        ...draft,
        id: editing?.id || `procura_${Date.now()}`,
        createdAt: editing?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      if (editing) {
        const updated = await updateClubDataItem(clubId, "procure", editing.id, procuraToSave);
        setProcure(Array.isArray(updated) ? updated : []);
        showToast("success", "Procura aggiornata con successo");
        if (returnToInspector) setInspectorOpen(true);
      } else {
        const saved = await addClubData(clubId, "procure", procuraToSave);
        setProcure((prev) => (Array.isArray(prev) ? [...prev, saved] : [saved]));
        setSelectedId(saved?.id ?? procuraToSave.id);
        showToast("success", "Nuova procura aggiunta con successo");
      }
      setEditing(null);
      setReturnToInspector(false);
      return true;
    } catch (error) {
      console.error("Error saving procura:", error);
      showToast("error", error instanceof Error ? error.message : "Errore nel salvataggio della procura");
      return false;
    }
  };

  /** V1 `deleteProcura`, dopo la conferma nel modale. */
  const confirmDelete = async () => {
    if (!deleting) return;
    if (!clubId) {
      showToast("error", "Club non trovato");
      return;
    }
    setDeleteBusy(true);
    try {
      const updated = await deleteClubDataItem(clubId, "procure", deleting.id);
      setProcure(Array.isArray(updated) ? updated : []);
      if (selectedId === deleting.id) {
        setSelectedId(null);
        setInspectorOpen(false);
      }
      showToast("success", "Procura eliminata con successo");
      setDeleting(null);
    } catch (error) {
      console.error("Error deleting procura:", error);
      showToast("error", "Errore nell'eliminazione della procura");
    } finally {
      setDeleteBusy(false);
    }
  };

  /** V1 `addPayment`. */
  const addPayment = async (procura: Procura, payment: ProcuraPayment): Promise<boolean> => {
    if (!clubId) {
      showToast("error", "Club non trovato");
      return false;
    }
    try {
      const updatedProcura = { ...procura, payments: [...paymentsOf(procura), payment] };
      const updated = await updateClubDataItem(clubId, "procure", procura.id, updatedProcura);
      setProcure(Array.isArray(updated) ? updated : []);
      showToast("success", "Pagamento aggiunto con successo");
      return true;
    } catch (error) {
      console.error("Error adding payment:", error);
      showToast("error", "Errore nell'aggiunta del pagamento");
      return false;
    }
  };

  /** V1 `addAssociation` (creazione). */
  const addAssociation = async (procura: Procura, association: ProcuraAssociation): Promise<boolean> => {
    if (!clubId) {
      showToast("error", "Club non trovato");
      return false;
    }
    try {
      const field = association.personType === "athlete" ? "athletes" : "trainers";
      const current = field === "athletes" ? athletesOf(procura) : trainersOf(procura);
      const updatedProcura = { ...procura, [field]: [...current, association] };
      const updated = await updateClubDataItem(clubId, "procure", procura.id, updatedProcura);
      setProcure(Array.isArray(updated) ? updated : []);
      showToast("success", "Associazione aggiunta con successo");
      return true;
    } catch (error) {
      console.error("Error adding association:", error);
      showToast("error", "Errore nell'aggiunta dell'associazione");
      return false;
    }
  };

  /** V1 `updateSelectedProcura`: modifica/eliminazione di un'associazione, note. */
  const updateProcura = async (updatedProcura: Procura): Promise<boolean> => {
    if (!clubId) {
      showToast("error", "Club non trovato");
      return false;
    }
    try {
      const updated = await updateClubDataItem(clubId, "procure", updatedProcura.id, updatedProcura);
      setProcure(Array.isArray(updated) ? updated : []);
      showToast("success", "Modifiche salvate con successo");
      return true;
    } catch (error) {
      console.error("Error updating procura:", error);
      showToast("error", "Errore nel salvataggio delle modifiche");
      return false;
    }
  };

  /* ── Griglia ───────────────────────────────────────────────────────────── */
  const columns = React.useMemo<ColumnDef<Procura>[]>(
    () => [
      {
        id: "identity",
        header: "Nome",
        kind: "identity",
        locked: true,
        width: 2,
        cell: (row) => <IdentityCell name={String(row.name || "")} meta={procuraMeta(row)} onClick={() => openInspector(row)} />,
        sortValue: (row) => String(row.name || "").trim().toLowerCase(),
        exportValue: (row) => String(row.name || ""),
        title: (row) => String(row.name || ""),
      },
      {
        id: "city",
        header: "Città",
        kind: "text",
        hidden: true,
        cell: (row) => procuraCity(row),
        sortValue: (row) => procuraCity(row).toLowerCase() || null,
      },
      {
        id: "contacts",
        header: "Contatti",
        kind: "number",
        align: "right",
        cell: (row) => formatInteger(contactsOf(row).length),
        sortValue: (row) => contactsOf(row).length,
      },
      {
        id: "athletes",
        header: "Atleti",
        kind: "number",
        align: "right",
        cell: (row) => formatInteger(athletesOf(row).length),
        sortValue: (row) => athletesOf(row).length,
      },
      {
        id: "trainers",
        header: "Allenatori",
        kind: "number",
        align: "right",
        cell: (row) => formatInteger(trainersOf(row).length),
        sortValue: (row) => trainersOf(row).length,
      },
      {
        id: "payments",
        header: "Pagamenti",
        kind: "number",
        align: "right",
        cell: (row) => formatInteger(paymentsOf(row).length),
        sortValue: (row) => paymentsOf(row).length,
      },
      {
        id: "balance",
        header: "Saldo pagamenti",
        kind: "amount",
        hidden: true,
        cell: (row) => (paymentsOf(row).length ? formatMoney(paymentsBalance(row)) : null),
        sortValue: (row) => (paymentsOf(row).length ? paymentsBalance(row) : null),
        exportValue: (row) => (paymentsOf(row).length ? paymentsBalance(row) : ""),
      },
    ],
    // `openInspector` e stabile nel significato: dipende solo dai setter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const filters = React.useMemo<FilterDef<Procura>[]>(
    () => [
      {
        id: "contacts",
        label: "Contatti",
        type: "select",
        options: [
          { value: "some", label: "Con contatti" },
          { value: "none", label: "Senza contatti" },
        ],
        apply: (row, value) => (value === "some" ? contactsOf(row).length > 0 : value === "none" ? contactsOf(row).length === 0 : true),
      },
      {
        id: "associations",
        label: "Associazioni",
        type: "select",
        options: [
          { value: "athletes", label: "Con atleti" },
          { value: "trainers", label: "Con allenatori" },
          { value: "none", label: "Senza associazioni" },
        ],
        apply: (row, value) =>
          value === "athletes"
            ? athletesOf(row).length > 0
            : value === "trainers"
              ? trainersOf(row).length > 0
              : value === "none"
                ? athletesOf(row).length + trainersOf(row).length === 0
                : true,
      },
      {
        id: "payments",
        label: "Pagamenti",
        type: "select",
        options: [
          { value: "some", label: "Con pagamenti" },
          { value: "none", label: "Senza pagamenti" },
        ],
        apply: (row, value) => (value === "some" ? paymentsOf(row).length > 0 : value === "none" ? paymentsOf(row).length === 0 : true),
      },
    ],
    [],
  );

  const rowActions = React.useMemo<RowActionDef<Procura>[]>(
    () => [
      { id: "open", label: "Apri", icon: <ChevronRight />, primary: true, onClick: (row) => openInspector(row) },
      { id: "edit", label: "Modifica", icon: <Pencil />, onClick: (row) => openEdit(row) },
      { id: "delete", label: "Elimina", icon: <Trash2 />, tone: "danger", onClick: (row) => setDeleting(row) },
    ],
    // `openEdit` legge se l'ispettore e aperto su quella riga.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [inspectorOpen, selectedId],
  );

  const search = React.useMemo(
    () => ({
      placeholder: "Cerca per nome, città, contatto",
      match: (row: Procura, query: string) => matchesProcuraSearch(row, query),
    }),
    [],
  );

  const totals = React.useMemo(() => countAssociations(procure), [procure]);
  const gridState = loading ? "loading" : loadError ? "error" : "ready";

  return (
    <div className="flex h-[100dvh] bg-egw-page">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Header title="Procure" />
        <main className={dashboardMainClassName}>
          <DashboardPageContainer>
            <PageHeader
              eyebrow="Persone"
              title="Procure"
              description="Le procure del club: recapiti, atleti e allenatori associati, movimenti registrati."
              stats={
                <>
                  <HeaderStat value={formatInteger(procure.length)} label={procure.length === 1 ? "procura" : "procure"} />
                  <HeaderStat value={formatInteger(totals.contacts)} label={totals.contacts === 1 ? "contatto" : "contatti"} />
                  <HeaderStat value={formatInteger(totals.athletes)} label="atleti associati" tone="blue" />
                  <HeaderStat value={formatInteger(totals.trainers)} label="allenatori associati" tone="blue" />
                </>
              }
              actions={
                <Button variant="primary" icon={<Plus />} onClick={openCreate}>
                  Nuova procura
                </Button>
              }
            />

            <DataGrid<Procura>
              module="procure"
              aria-label="Elenco delle procure"
              rows={procure}
              getRowId={(row) => String(row.id)}
              rowLabel={(row) => String(row.name || "")}
              columns={columns}
              filters={filters}
              views={PROCURE_VIEWS}
              search={search}
              defaultSort={{ columnId: "identity", direction: "asc" }}
              rowActions={rowActions}
              onOpenRow={openInspector}
              onInspectRow={openInspector}
              activeRowId={inspectorOpen ? selectedId : null}
              state={gridState}
              errorMessage={loadError}
              onRetry={reload}
              noun={{ singular: "procura", plural: "procure" }}
              empty={{
                icon: <Scale />,
                title: "Nessuna procura in archivio",
                description: "Registra la prima procura del club: nome, sede e procuratori da contattare.",
                primary: (
                  <Button variant="primary" size="sm" icon={<Plus />} onClick={openCreate}>
                    Nuova procura
                  </Button>
                ),
              }}
            />
          </DashboardPageContainer>
        </main>
      </div>

      <ProcuraDrawer
        open={drawerOpen}
        onOpenChange={(open) => {
          setDrawerOpen(open);
          if (!open) {
            setEditing(null);
            setReturnToInspector(false);
          }
        }}
        procura={editing}
        onSave={saveProcura}
      />

      <ProcuraInspector
        open={inspectorOpen && Boolean(selected)}
        onOpenChange={setInspectorOpen}
        procura={selected}
        people={people}
        onEdit={openEdit}
        onAddPayment={addPayment}
        onAddAssociation={addAssociation}
        onUpdateProcura={updateProcura}
      />

      <DeleteProcuraDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => !open && !deleteBusy && setDeleting(null)}
        procura={deleting}
        onConfirm={confirmDelete}
        loading={deleteBusy}
      />
    </div>
  );
}
