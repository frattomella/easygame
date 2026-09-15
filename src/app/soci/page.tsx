"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { BookOpen, ChevronRight, FileDown, FileSpreadsheet, Pencil, Plus, Trash2, UserCheck, UserX, Users } from "lucide-react";
import { supabase } from "@/lib/supabase";
import Sidebar from "@/components/dashboard/Sidebar";
import Header from "@/components/dashboard/Header";
import { DashboardPageContainer, dashboardMainClassName } from "@/components/dashboard/dashboard-page-container";
import { useAuth } from "@/components/providers/AuthProvider";
import { useToast } from "@/components/ui/toast-notification";
import { HeaderStat, PageHeader } from "@/components/web/page/PageHeader";
import { InfoCard } from "@/components/web/page/Cards";
import { Button } from "@/components/web/primitives/Button";
import { DataChip, StatusPill } from "@/components/web/primitives/StatusPill";
import { IdentityCell } from "@/components/web/primitives/Identity";
import { DataGrid } from "@/components/web/datagrid/DataGrid";
import type { BulkActionDef, ColumnDef, ExportRequest, FilterDef, RowActionDef, ViewDef } from "@/components/web/datagrid/types";
import { formatDateShort, formatInteger, joinMeta } from "@/lib/web/format";
import { exportPeopleCsv, exportPeoplePdf } from "@/lib/person-export";
import type { SelectionScope } from "@/lib/list-selection";
import { comparePeopleByLastName } from "@/lib/athlete-name-utils";
import { collectMemberTypes } from "@/lib/member-types";
import { fetchMembershipRegister, removeMemberProfile, updateMemberProfile } from "@/lib/members/client";
import { MEMBERSHIP_REGISTER_DISCLAIMER } from "@/lib/members/model";
import { canManageMembershipRegister, canReadMembershipRegister } from "@/lib/members/permissions";
import { DeleteMemberDialog } from "@/components/soci/v2/delete-member-dialog";
import { SetMemberTypeDrawer } from "@/components/soci/v2/set-member-type-drawer";
import { useMemberClubId, withClubId } from "@/components/soci/v2/use-member-club-id";
import {
  getMemberDisplayName,
  isMemberCardActive,
  isRegisteredMember,
  memberCardStatusSpec,
  memberRecordFrom,
  memberStatusDetail,
  memberStatusFilterKey,
  memberStatusSpec,
  mergeRegisterRows,
  type MemberRecord,
} from "@/components/soci/v2/member-model";

/**
 * `/soci` — elenco dei soci (Web V2, pattern 1: intestazione di pagina +
 * DataGrid a tutta larghezza).
 *
 * La griglia unica sostituisce sia la tabella sia la vista a card della V1:
 * cio che la card mostrava (stato, email, telefono, data di iscrizione) sono
 * colonne o la riga meta dell'identita. I dati e le scritture sono quelli
 * della V1: l'anagrafica da `clubs.members`, il libro da
 * `GET /api/v1/membership/register`, ogni scrittura da `lib/members/client`
 * — **una riga per socio**, mai la colonna intera dal browser.
 *
 * I permessi sono quelli del dominio (`lib/members/permissions.ts`), gli
 * stessi che il server applica: a chi non puo scrivere le azioni sono
 * **assenti**, non disabilitate. La V1 le mostrava a tutti e rispondeva 403.
 */
const STATUS_FILTER_OPTIONS = [
  { value: "member", label: "Socio" },
  { value: "ceased", label: "Cessato" },
  { value: "not_in_register", label: "Non nel libro" },
];

const CARD_FILTER_OPTIONS = [
  { value: "active", label: "Scheda attiva" },
  { value: "inactive", label: "Scheda non attiva" },
];

const MEMBER_VIEWS: ViewDef[] = [
  { id: "members", label: "Soci", filters: { status: "member" }, builtIn: true },
  { id: "ceased", label: "Cessati", filters: { status: "ceased" }, builtIn: true },
  { id: "not-in-register", label: "Non nel libro", filters: { status: "not_in_register" }, builtIn: true, tone: "amber" },
];

export default function SociPage() {
  const router = useRouter();
  const { activeClub, userRole } = useAuth();
  const { showToast } = useToast();
  const { clubId, resolved } = useMemberClubId(null);
  const role = activeClub?.role || userRole;
  const canManage = canManageMembershipRegister(role);
  const canReadRegister = canReadMembershipRegister(role);

  const [soci, setSoci] = React.useState<MemberRecord[]>([]);
  const [registerLoaded, setRegisterLoaded] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [reloadKey, setReloadKey] = React.useState(0);
  const [requestedViewId, setRequestedViewId] = React.useState<string | null>(null);
  const [typeRows, setTypeRows] = React.useState<MemberRecord[] | null>(null);
  const [deleting, setDeleting] = React.useState<MemberRecord | null>(null);
  const [deleteBusy, setDeleteBusy] = React.useState(false);
  const [bulkBusy, setBulkBusy] = React.useState(false);
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(() => new Set());

  React.useEffect(() => {
    if (!resolved) return;
    if (!clubId) {
      setLoading(false);
      setSoci([]);
      return;
    }
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase.from("clubs").select("members").eq("id", clubId).single();
        if (cancelled) return;
        if (error) throw error;
        const members: Record<string, any>[] = Array.isArray(data?.members) ? data.members : [];
        const anagrafica = members
          .filter((member) => isRegisteredMember(member))
          .map((member) => memberRecordFrom({ ...member, id: String(member.id) }))
          .sort(comparePeopleByLastName);

        /*
          Il libro soci, accanto all'anagrafica. Sono due letture perche sono
          due cose: l'anagrafica dice chi c'e, il registro dice **chi e socio**.
          Se il registro non e leggibile — un ruolo senza il permesso, un club
          senza eventi — l'elenco resta quello dell'anagrafica invece di sparire.
        */
        let conLibro = anagrafica;
        let libroLetto = false;
        if (canReadRegister) {
          const { data: libro, error: libroError } = await fetchMembershipRegister({ clubId });
          if (cancelled) return;
          if (!libroError && libro) {
            conLibro = mergeRegisterRows(anagrafica, libro.rows);
            libroLetto = true;
          }
        }
        setSoci(conLibro);
        setRegisterLoaded(libroLetto);
        setLoadError(null);
        // Un id selezionato che non esiste piu mostrerebbe un conteggio che
        // non corrisponde a niente.
        setSelectedIds((current) => new Set(Array.from(current).filter((id) => conLibro.some((m) => String(m.id) === id))));
      } catch (error) {
        if (cancelled) return;
        console.error("Error fetching soci:", error);
        setSoci([]);
        setLoadError(error instanceof Error ? error.message : null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [clubId, resolved, reloadKey, canReadRegister]);

  const reload = () => setReloadKey((k) => k + 1);

  /* ── Scritture ─────────────────────────────────────────────────────────── */

  /**
   * Scrive la stessa modifica su ogni socio selezionato, **una riga per
   * volta** (`PATCH /api/v1/membership/profiles/{id}`), ognuna sotto il
   * `FOR UPDATE` del club. La modifica **non e indivisibile**: se una
   * fallisce, le altre restano scritte. Per questo l'esito parziale va detto
   * e l'elenco va riletto comunque.
   */
  const applyToRows = async (rows: MemberRecord[], updatesFor: (member: MemberRecord) => Record<string, any>, successMessage: (count: number) => string) => {
    if (!clubId || bulkBusy || !rows.length) return;
    setBulkBusy(true);
    try {
      const esiti = await Promise.all(rows.map((socio) => updateMemberProfile({ clubId, memberId: String(socio.id), updates: updatesFor(socio) })));
      const falliti = esiti.filter((esito) => esito.error);
      reload();
      if (falliti.length) {
        showToast("error", `${falliti.length} soci su ${rows.length} non sono stati aggiornati: ` + (falliti[0].error?.message || "errore sconosciuto"));
        return;
      }
      showToast("success", successMessage(rows.length));
    } catch (error) {
      console.error("Error running bulk member action:", error);
      reload();
      showToast("error", error instanceof Error && error.message ? error.message : "Operazione non riuscita");
    } finally {
      setBulkBusy(false);
    }
  };

  const setRowsStatus = (rows: MemberRecord[], status: "active" | "inactive") =>
    applyToRows(rows, () => ({ status }), (count) => `${count} soci ${status === "active" ? "attivati" : "disattivati"}`);

  /** Il tipo di socio e **uno solo**: qui si sostituisce, non si aggiunge. */
  const setRowsType = (rows: MemberRecord[], type: string) => applyToRows(rows, () => ({ type }), (count) => `${count} soci impostati come ${type}`);

  /**
   * La cancellazione passa dal servizio, che sa dire di no: un socio con una
   * storia nel libro non si cancella, e il messaggio del server arriva fin qui.
   */
  const confirmDelete = async () => {
    if (!deleting || !clubId) return;
    const memberId = String(deleting.id);
    setDeleteBusy(true);
    try {
      const esito = await removeMemberProfile({ clubId, memberId });
      if (esito.error) throw new Error(esito.error.message);
      setSoci((current) => current.filter((socio) => String(socio.id) !== memberId));
      setSelectedIds((current) => {
        const copy = new Set(current);
        copy.delete(memberId);
        return copy;
      });
      showToast("success", "Socio eliminato");
      setDeleting(null);
    } catch (error) {
      console.error("Error deleting socio:", error);
      showToast("error", error instanceof Error && error.message ? error.message : "Errore nell'eliminazione del socio");
    } finally {
      setDeleteBusy(false);
    }
  };

  /* ── Esportazione (stesso motore della V1: person-export) ──────────────── */
  const runExport = (kind: "csv" | "pdf", rows: MemberRecord[], columnIds: string[], requestScope: "filtered" | "selected") => {
    const visibleColumns = {
      name: true,
      email: columnIds.includes("email"),
      phone: columnIds.includes("phone"),
      membershipDate: columnIds.includes("registrationDate"),
      status: columnIds.includes("status"),
    };
    const scope: SelectionScope = requestScope === "selected" ? "selected" : rows.length === soci.length ? "all" : "filtered";
    const people = rows as unknown as Record<string, any>[];
    const clubName = activeClub?.name || "EasyGame";
    if (kind === "pdf") {
      const result = exportPeoplePdf({
        entity: "members",
        people,
        clubName,
        visibleColumns,
        scope,
      });
      if (!result.ok) {
        showToast("error", result.reason === "empty" ? "Nessun socio da esportare" : "Consenti i popup per generare il PDF");
        return;
      }
      showToast("success", "PDF pronto: si apre la finestra di stampa");
      return;
    }
    const result = exportPeopleCsv({
      entity: "members",
      people,
      clubName,
      visibleColumns,
      scope,
    });
    if (!result.ok) {
      showToast("error", "Nessun socio da esportare");
      return;
    }
    showToast("success", "CSV scaricato");
  };

  const defaultExportColumnIds = ["email", "phone", "registrationDate", "status"];

  /* ── Griglia ───────────────────────────────────────────────────────────── */
  const recordHref = (member: MemberRecord) => withClubId(`/soci/${member.id}`, clubId);

  const columns = React.useMemo<ColumnDef<MemberRecord>[]>(
    () => [
      {
        id: "identity",
        header: "Nome",
        kind: "identity",
        locked: true,
        width: 2,
        cell: (row) => (
          <IdentityCell
            name={getMemberDisplayName(row)}
            round
            href={recordHref(row)}
            onClick={() => router.push(recordHref(row))}
            meta={joinMeta(row.type, row.membershipNumber ? `tessera ${row.membershipNumber}` : null)}
          />
        ),
        sortValue: (row) => `${row.lastName} ${row.firstName}`.trim().toLowerCase() || row.name.toLowerCase(),
        exportValue: (row) => getMemberDisplayName(row),
        title: (row) => getMemberDisplayName(row),
      },
      {
        id: "type",
        header: "Tipo socio",
        kind: "classification",
        cell: (row) => (
          <DataChip size="sm" title={row.type}>
            {row.type}
          </DataChip>
        ),
        sortValue: (row) => row.type.toLowerCase() || null,
        exportValue: (row) => row.type,
      },
      {
        id: "status",
        header: "Stato",
        kind: "status",
        cell: (row) => <StatusPill status={memberStatusSpec(row)} detail={memberStatusDetail(row)} />,
        sortValue: (row) => memberStatusSpec(row).label,
        exportValue: (row) => memberStatusSpec(row).label,
      },
      {
        id: "membershipNumber",
        header: "N. tessera",
        kind: "number",
        cell: (row) => <span className="egw-num">{row.membershipNumber}</span>,
        sortValue: (row) => row.membershipNumber || null,
        exportValue: (row) => row.membershipNumber,
      },
      {
        id: "registrationDate",
        header: "Data iscrizione",
        kind: "date",
        cell: (row) => (row.registrationDate ? formatDateShort(row.registrationDate) : null),
        sortValue: (row) => row.registrationDate || null,
        exportValue: (row) => row.registrationDate,
      },
      {
        id: "email",
        header: "Email",
        kind: "text",
        minWidth: 160,
        cell: (row) => row.email,
        sortValue: (row) => row.email.toLowerCase() || null,
      },
      {
        id: "phone",
        header: "Telefono",
        kind: "text",
        cell: (row) => <span className="egw-num">{row.phone}</span>,
        sortValue: (row) => row.phone || null,
        exportValue: (row) => row.phone,
        title: (row) => row.phone || undefined,
      },
      {
        id: "admissionDate",
        header: "Ammesso il",
        kind: "date",
        hidden: true,
        cell: (row) => (row.admissionDate ? formatDateShort(row.admissionDate) : null),
        sortValue: (row) => row.admissionDate || null,
        exportValue: (row) => row.admissionDate,
      },
      {
        id: "cessationDate",
        header: "Cessazione",
        kind: "date",
        hidden: true,
        cell: (row) => (row.cessationDate ? formatDateShort(row.cessationDate) : null),
        sortValue: (row) => row.cessationDate || null,
        exportValue: (row) => row.cessationDate,
        title: (row) => row.cessationReason || undefined,
      },
      {
        id: "cessationReason",
        header: "Motivo cessazione",
        kind: "text",
        hidden: true,
        cell: (row) => row.cessationReason,
        sortValue: (row) => row.cessationReason.toLowerCase() || null,
      },
      {
        id: "cardStatus",
        header: "Scheda",
        kind: "status",
        hidden: true,
        cell: (row) => <StatusPill status={memberCardStatusSpec(row.status)} />,
        sortValue: (row) => (isMemberCardActive(row) ? "active" : "inactive"),
        exportValue: (row) => memberCardStatusSpec(row.status).label,
      },
      {
        id: "fiscalCode",
        header: "Codice fiscale",
        kind: "text",
        hidden: true,
        cell: (row) => <span className="egw-num uppercase">{row.fiscalCode}</span>,
        sortValue: (row) => row.fiscalCode || null,
        exportValue: (row) => row.fiscalCode,
      },
      {
        id: "city",
        header: "Comune di residenza",
        kind: "text",
        hidden: true,
        cell: (row) => row.city,
        sortValue: (row) => row.city.toLowerCase() || null,
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [clubId],
  );

  const typesInUse = React.useMemo(() => collectMemberTypes(soci), [soci]);

  const filters = React.useMemo<FilterDef<MemberRecord>[]>(
    () => [
      {
        id: "status",
        label: "Stato",
        type: "select",
        pinned: true,
        options: STATUS_FILTER_OPTIONS.map((option) => ({ ...option, count: soci.filter((row) => memberStatusFilterKey(row) === option.value).length })),
        apply: (row, value) => (typeof value === "string" && value ? memberStatusFilterKey(row) === value : true),
      },
      {
        id: "type",
        label: "Tipo socio",
        type: "select",
        options: typesInUse.map((type) => ({ value: type, label: type, count: soci.filter((row) => row.type.toLowerCase() === type.toLowerCase()).length })),
        apply: (row, value) => (typeof value === "string" && value ? row.type.toLowerCase() === value.toLowerCase() : true),
      },
      {
        id: "card",
        label: "Scheda",
        type: "select",
        options: CARD_FILTER_OPTIONS,
        apply: (row, value) => (typeof value === "string" && value ? (isMemberCardActive(row) ? "active" : "inactive") === value : true),
      },
    ],
    [soci, typesInUse],
  );

  const rowActions = React.useMemo<RowActionDef<MemberRecord>[]>(
    () => [
      { id: "open", label: "Apri scheda", icon: <ChevronRight />, primary: true, onClick: (row) => router.push(recordHref(row)) },
      { id: "edit", label: "Modifica", icon: <Pencil />, hidden: () => !canManage, onClick: (row) => router.push(withClubId(`/soci/${row.id}/edit`, clubId)) },
      { id: "delete", label: "Elimina", icon: <Trash2 />, tone: "danger", hidden: () => !canManage, onClick: (row) => setDeleting(row) },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [clubId, canManage],
  );

  const bulkActions = React.useMemo<BulkActionDef<MemberRecord>[]>(
    () => [
      { id: "activate", label: "Attiva", icon: <UserCheck />, hidden: !canManage, onRun: (rows) => setRowsStatus(rows, "active"), disabled: () => bulkBusy },
      { id: "deactivate", label: "Disattiva", icon: <UserX />, hidden: !canManage, onRun: (rows) => setRowsStatus(rows, "inactive"), disabled: () => bulkBusy },
      { id: "set-type", label: "Tipo socio", icon: <Users />, hidden: !canManage, onRun: (rows) => setTypeRows(rows), disabled: () => bulkBusy },
      { id: "export-pdf", label: "Esporta PDF", icon: <FileDown />, onRun: (rows) => runExport("pdf", rows, defaultExportColumnIds, "selected"), disabled: () => bulkBusy },
      { id: "export-csv", label: "Esporta CSV", icon: <FileSpreadsheet />, onRun: (rows) => runExport("csv", rows, defaultExportColumnIds, "selected"), disabled: () => bulkBusy },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [canManage, bulkBusy, soci, clubId, activeClub?.name],
  );

  const onExport = (request: ExportRequest<MemberRecord>) =>
    runExport(request.kind === "pdf" ? "pdf" : "csv", request.rows, request.columns.map((c) => c.id), request.scope);

  const search = React.useMemo(
    () => ({
      placeholder: "Cerca per nome, email, telefono, tessera",
      match: (row: MemberRecord, query: string) => {
        const q = query.trim().toLowerCase();
        if (!q) return true;
        return [getMemberDisplayName(row), row.email, row.phone, row.fiscalCode, row.membershipNumber, row.type]
          .map((v) => String(v || "").toLowerCase())
          .some((v) => v.includes(q));
      },
    }),
    [],
  );

  const goToNew = () => router.push(withClubId("/soci/new", clubId));

  const activeCount = soci.filter((m) => m.isMemberNow).length;
  const notInRegisterCount = soci.filter((m) => !m.inRegister).length;
  const gridState = loading ? "loading" : loadError ? "error" : "ready";

  return (
    <div className="flex h-[100dvh] bg-egw-page">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Header title="Soci" />
        <main className={dashboardMainClassName}>
          <DashboardPageContainer>
            <PageHeader
              eyebrow="Persone"
              title="Soci"
              description="Gestisci i soci dell'associazione."
              stats={
                <>
                  <HeaderStat value={formatInteger(soci.length)} label={soci.length === 1 ? "socio" : "soci"} />
                  {registerLoaded ? (
                    <>
                      <HeaderStat value={formatInteger(activeCount)} label="attivi nel libro" tone="green" onClick={() => setRequestedViewId("members")} />
                      <HeaderStat
                        value={formatInteger(notInRegisterCount)}
                        label="non nel libro"
                        tone={notInRegisterCount ? "amber" : "ink"}
                        onClick={() => setRequestedViewId("not-in-register")}
                      />
                    </>
                  ) : null}
                </>
              }
              actions={
                canManage ? (
                  <Button variant="primary" icon={<Plus />} onClick={goToNew}>
                    Nuovo socio
                  </Button>
                ) : null
              }
            >
              {/*
                Cosa e questo elenco, detto nel prodotto (§19, §31). Il libro
                soci per una ASD non-ETS e obbligo statutario ed elemento
                probatorio, non un modello da depositare.
              */}
              <InfoCard eyebrow="Libro soci">
                {MEMBERSHIP_REGISTER_DISCLAIMER}
              </InfoCard>
            </PageHeader>

            <DataGrid<MemberRecord>
              module="soci"
              aria-label="Elenco dei soci"
              rows={soci}
              getRowId={(row) => String(row.id)}
              rowLabel={(row) => getMemberDisplayName(row)}
              columns={columns}
              filters={filters}
              views={MEMBER_VIEWS}
              requestedViewId={requestedViewId}
              search={search}
              defaultSort={{ columnId: "identity", direction: "asc" }}
              rowActions={rowActions}
              bulkActions={bulkActions}
              selectedIds={selectedIds}
              onSelectionChange={setSelectedIds}
              onOpenRow={(row) => router.push(recordHref(row))}
              state={gridState}
              errorMessage={loadError}
              onRetry={reload}
              noun={{ singular: "socio", plural: "soci" }}
              export={{ onExport, kinds: ["csv", "pdf"] }}
              empty={{
                icon: <BookOpen />,
                title: "Nessun socio",
                description: "Inizia aggiungendo il primo socio della tua associazione.",
                primary: canManage ? (
                  <Button variant="primary" size="sm" icon={<Plus />} onClick={goToNew}>
                    Nuovo socio
                  </Button>
                ) : null,
              }}
            />
          </DashboardPageContainer>
        </main>
      </div>

      <SetMemberTypeDrawer
        open={Boolean(typeRows)}
        onOpenChange={(open) => !open && setTypeRows(null)}
        rows={typeRows || []}
        onConfirm={(type) => setRowsType(typeRows || [], type)}
      />

      <DeleteMemberDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => !open && !deleteBusy && setDeleting(null)}
        name={deleting ? getMemberDisplayName(deleting) : ""}
        eventCount={deleting?.eventCount || 0}
        onConfirm={confirmDelete}
        loading={deleteBusy}
      />
    </div>
  );
}
