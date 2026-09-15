"use client";

import * as React from "react";
import { Suspense } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { CalendarClock, LayoutGrid, Pencil, Plus, Trash2 } from "lucide-react";
import Sidebar from "@/components/dashboard/Sidebar";
import Header from "@/components/dashboard/Header";
import { DashboardPageContainer, dashboardMainClassName } from "@/components/dashboard/dashboard-page-container";
import { useToast } from "@/components/ui/toast-notification";
import { useBreadcrumbLabel } from "@/components/web/shell/ShellProvider";
import { CollapsedSection, RecordAlertStrip, RecordAreaSwitcher, RecordHeader, type RecordAction } from "@/components/web/record/Record";
import { DetailCard, EmptyStateCard, SummaryCard, type DetailField } from "@/components/web/page/Cards";
import { Button } from "@/components/web/primitives/Button";
import { Skeleton } from "@/components/web/primitives/Controls";
import { InsetBlock, Panel, PanelHeader } from "@/components/web/primitives/Surface";
import { DataChip, StatusPill } from "@/components/web/primitives/StatusPill";
import { DataGrid } from "@/components/web/datagrid/DataGrid";
import type { ColumnDef, RowActionDef } from "@/components/web/datagrid/types";
import { useConfirm } from "@/components/web/overlays/useConfirm";
import { formatDateShort, formatDateTime, formatMoney, MISSING, orMissing } from "@/lib/web/format";
import { PERSON_STATUS } from "@/lib/web/status";
import {
  findStructureById,
  normalizeStructure,
  WEEK_DAYS,
  type ClubStructure,
  type StructureBooking,
  type StructurePayment,
} from "@/lib/structures-utils";
import { normalizeClubSites, type ClubSite } from "@/lib/club-sites";
import { StructureDrawer, type StructureEditSection } from "@/components/structures/v2/structure-drawer";
import { BookingDrawer } from "@/components/structures/v2/booking-drawer";
import { BookingsCalendar } from "@/components/structures/v2/bookings-calendar";
import { RentPaymentDrawer } from "@/components/structures/v2/rent-payment-drawer";
import { DeleteStructureDialog } from "@/components/structures/v2/delete-structure-dialog";
import { useStructuresClubId } from "@/components/structures/v2/use-structures-club-id";
import {
  BOOKING_STATUS,
  STRUCTURE_AREAS,
  STRUCTURE_BOOKABILITY,
  STRUCTURE_VISIBILITY,
  bookingPaymentSpec,
  bookingStatusSpec,
  bookingWhoLabel,
  computeStructureAlerts,
  countFieldSlots,
  describeFieldSlots,
  fieldTone,
  isFamilyBooking,
  pluralize,
  rentPaymentSpec,
  resolveStructureArea,
  slotLabel,
  structureAddressLine,
  structureDisplayName,
  structureSiteName,
  withClubId,
  type StructureArea,
} from "@/components/structures/v2/structure-model";
import { bookingFormForDate, bookingFormFrom, emptyBookingForm, sortBookings, type BookingForm } from "@/components/structures/v2/booking-model";

/**
 * `/structures/[id]` — scheda di una struttura (Web V2, pattern 2:
 * intestazione di scheda, quattro aree, cassetti per le modifiche).
 *
 * Le sei tab della V1 confluiscono in quattro aree: **Struttura**
 * (Informazioni + Note + orari per campo), **Campi e disponibilità**,
 * **Tariffe e affitti** (Tariffe + Pagamenti / Fitti) e **Prenotazioni**. I
 * vecchi nomi restano `?tab=` validi. Il «Salva» unico della V1 sparisce:
 * ogni cassetto salva la propria sezione con la **stessa** scrittura
 * (`saveClubStructures` sull'intera colonna, la struttura sostituita
 * nell'array), cosi una modifica non resta mai in un draft che una
 * prenotazione della famiglia arrivata nel frattempo potrebbe far perdere.
 */
type RentPaymentRow = StructurePayment;

function StructureDetailPageContent() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { showToast } = useToast();
  const structureId = String(params?.id || "");
  const { clubId, resolved } = useStructuresClubId(searchParams?.get("clubId"));
  const area: StructureArea = resolveStructureArea(searchParams?.get("tab"));
  const [confirm, confirmDialog] = useConfirm();

  const [structures, setStructures] = React.useState<ClubStructure[]>([]);
  const [sites, setSites] = React.useState<ClubSite[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [editing, setEditing] = React.useState<StructureEditSection | null>(null);
  const [bookingForm, setBookingForm] = React.useState<BookingForm | null>(null);
  const [paymentOpen, setPaymentOpen] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);
  const [deleteBusy, setDeleteBusy] = React.useState(false);

  const structure = React.useMemo(() => findStructureById(structures, structureId), [structures, structureId]);
  useBreadcrumbLabel(structure ? structureDisplayName(structure) : null);

  /* ── Caricamento ───────────────────────────────────────────────────────── */
  React.useEffect(() => {
    if (!resolved) return;
    if (!clubId) {
      setLoading(false);
      setStructures([]);
      return;
    }
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const { getClubStructures, getClubData } = await import("@/lib/simplified-db");
        const [items, dbSites] = await Promise.all([getClubStructures(clubId), getClubData(clubId, "club_sites")]);
        if (cancelled) return;
        setStructures((items || []).map((item: unknown) => normalizeStructure(item)));
        setSites(normalizeClubSites(dbSites));
      } catch (error) {
        if (cancelled) return;
        console.error(error);
        showToast("error", "Errore nel caricamento della struttura");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [clubId, resolved, showToast]);

  /* ── Aree e link profondi ──────────────────────────────────────────────── */
  const setArea = (next: StructureArea) => {
    const query = new URLSearchParams();
    if (clubId) query.set("clubId", clubId);
    query.set("tab", next);
    router.replace(`/structures/${structureId}?${query.toString()}`, { scroll: false });
  };

  /* ── Scritture (la stessa della V1: la struttura sostituita nell'array) ── */
  const saveStructure = async (next: ClubStructure, successMessage = "Struttura salvata") => {
    if (!clubId) return false;
    const normalized = normalizeStructure(next);
    const previous = structures;
    const nextStructures = structures.map((item) => (item.id === normalized.id ? normalized : item));
    setStructures(nextStructures);
    const { saveClubStructures } = await import("@/lib/simplified-db");
    const ok = await saveClubStructures(clubId, nextStructures);
    if (!ok) {
      setStructures(previous);
      showToast("error", "Salvataggio struttura fallito");
      return false;
    }
    if (successMessage) showToast("success", successMessage);
    return ok;
  };

  const handleSaveSection = async (next: ClubStructure) => {
    const ok = await saveStructure(next);
    if (ok) setEditing(null);
    return ok;
  };

  const handleSaveBooking = async (booking: StructureBooking) => {
    if (!structure) return false;
    const bookings = structure.bookings || [];
    const exists = bookings.some((item) => item.id === booking.id);
    const ok = await saveStructure(
      { ...structure, bookings: exists ? bookings.map((item) => (item.id === booking.id ? booking : item)) : [...bookings, booking] },
      "Prenotazione salvata",
    );
    if (ok) setBookingForm(null);
    return ok;
  };

  const handleDeleteBooking = async (booking: StructureBooking) => {
    if (!structure) return;
    const ok = await confirm({
      title: "Eliminare la prenotazione?",
      description: `${booking.title} · ${formatDateTime(booking.start)}${isFamilyBooking(booking) ? ". L'ha chiesta una famiglia: sparisce anche dalla sua area." : ""}`,
      confirmLabel: "Elimina",
      tone: "danger",
      consequences: ["La prenotazione e il suo importo"],
    });
    if (!ok) return;
    await saveStructure({ ...structure, bookings: (structure.bookings || []).filter((item) => item.id !== booking.id) }, "Prenotazione eliminata");
  };

  const handleSavePayment = async (payment: StructurePayment) => {
    if (!structure) return false;
    const ok = await saveStructure({ ...structure, payments: [...structure.payments, payment] }, "Pagamento aggiunto con successo");
    if (ok) setPaymentOpen(false);
    return ok;
  };

  const handleDeletePayment = async (payment: StructurePayment) => {
    if (!structure) return;
    const ok = await confirm({
      title: "Eliminare il pagamento?",
      description: `${payment.description} · ${formatDateShort(payment.date)} · ${formatMoney(payment.amount)}`,
      confirmLabel: "Elimina",
      tone: "danger",
      consequences: ["La riga del pagamento d'affitto"],
    });
    if (!ok) return;
    await saveStructure({ ...structure, payments: structure.payments.filter((item) => item.id !== payment.id) }, "Pagamento eliminato");
  };

  const confirmDelete = async () => {
    if (!clubId || !structure) return;
    setDeleteBusy(true);
    try {
      const { saveClubStructures } = await import("@/lib/simplified-db");
      const ok = await saveClubStructures(
        clubId,
        structures.filter((item) => item.id !== structure.id),
      );
      if (!ok) {
        showToast("error", "Salvataggio strutture fallito");
        setDeleteBusy(false);
        return;
      }
      showToast("success", "Struttura eliminata");
      router.push(withClubId("/structures", clubId));
    } catch (error) {
      console.error(error);
      showToast("error", "Salvataggio strutture fallito");
      setDeleteBusy(false);
    }
  };

  /* ── Derivati ──────────────────────────────────────────────────────────── */
  const alerts = React.useMemo(() => computeStructureAlerts(structure), [structure]);
  const siteName = structure ? structureSiteName(structure, sites) : "";
  const fieldIds = React.useMemo(() => (structure?.fields || []).map((field) => String(field.id)), [structure?.fields]);

  const headerActions: RecordAction[] = [
    { id: "edit", label: "Modifica", icon: <Pencil />, onClick: () => setEditing("info") },
    { id: "delete", label: "Elimina", icon: <Trash2 />, tone: "danger", overflow: true, onClick: () => setDeleting(true) },
  ];

  const infoFields: DetailField[] = structure
    ? [
        { label: "Nome", value: orMissing(structure.name) },
        { label: "Tipologia", value: orMissing(structure.type) },
        { label: "Proprietà", value: structure.isPublic ? "Pubblica" : "Privata" },
        { label: "Indirizzo", value: orMissing(structure.address) },
        { label: "Città", value: orMissing(structure.city) },
        ...(sites.length ? [{ label: "Sede", value: siteName || "Nessuna sede (visibile con qualunque filtro)" }] : []),
        { label: "Referente", value: orMissing(structure.contactName) },
        { label: "Telefono", value: <span className="egw-num">{orMissing(structure.contactPhone)}</span> },
        { label: "Email", value: orMissing(structure.contactEmail) },
        { label: "Visibile ai tesserati", value: <StatusPill size="sm" status={structure.isVisibleToMembers ? STRUCTURE_VISIBILITY.visible : STRUCTURE_VISIBILITY.hidden} /> },
        { label: "Prenotabile dalle famiglie", value: <StatusPill size="sm" status={structure.isBookableByMembers ? STRUCTURE_BOOKABILITY.bookable : STRUCTURE_BOOKABILITY.closed} /> },
        { label: "Affittabile", value: structure.isRentable ? "Sì" : "No" },
      ]
    : [];

  const rentRows = structure
    ? [
        { label: "Contratto", value: <StatusPill size="sm" status={structure.rent?.enabled || structure.isRentable ? PERSON_STATUS.active : PERSON_STATUS.inactive} /> },
        { label: "Canone", value: formatMoney(structure.rent?.amount) },
        { label: "Frequenza", value: orMissing(structure.rent?.frequency) },
        { label: "Giorno scadenza", value: structure.rent?.dueDay ? String(structure.rent.dueDay) : MISSING },
        { label: "Inizio contratto", value: structure.rent?.contractStart ? formatDateShort(structure.rent.contractStart) : MISSING },
        { label: "Fine contratto", value: structure.rent?.contractEnd ? formatDateShort(structure.rent.contractEnd) : MISSING },
      ]
    : [];

  /* ── Griglie secondarie ────────────────────────────────────────────────── */
  const paymentColumns = React.useMemo<ColumnDef<RentPaymentRow>[]>(
    () => [
      { id: "date", header: "Data", kind: "date", cell: (row) => formatDateShort(row.date), sortValue: (row) => row.date, exportValue: (row) => row.date },
      { id: "description", header: "Descrizione", kind: "text", width: 2, cell: (row) => row.description, sortValue: (row) => row.description.toLowerCase(), title: (row) => row.description },
      { id: "amount", header: "Importo", kind: "amount", align: "right", cell: (row) => formatMoney(row.amount), sortValue: (row) => row.amount, exportValue: (row) => row.amount },
      { id: "status", header: "Stato", kind: "status", cell: (row) => <StatusPill size="sm" status={rentPaymentSpec(row.status)} />, sortValue: (row) => row.status, exportValue: (row) => row.status },
    ],
    [],
  );

  const paymentActions = React.useMemo<RowActionDef<RentPaymentRow>[]>(
    () => [{ id: "delete", label: "Elimina", icon: <Trash2 />, tone: "danger", onClick: (row) => void handleDeletePayment(row) }],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [structure, clubId],
  );

  const bookingColumns = React.useMemo<ColumnDef<StructureBooking>[]>(
    () => [
      {
        id: "start",
        header: "Inizio",
        kind: "date",
        cell: (row) => <span className="egw-num">{formatDateTime(row.start)}</span>,
        sortValue: (row) => row.start,
        exportValue: (row) => row.start,
      },
      { id: "end", header: "Fine", kind: "date", cell: (row) => <span className="egw-num">{formatDateTime(row.end)}</span>, sortValue: (row) => row.end, exportValue: (row) => row.end },
      {
        id: "field",
        header: "Campo",
        kind: "classification",
        cell: (row) => (
          <DataChip size="sm" tone={fieldTone(String(row.fieldId || ""), fieldIds)} title={row.fieldName || "Campo"}>
            {row.fieldName || "Campo"}
          </DataChip>
        ),
        sortValue: (row) => String(row.fieldName || "").toLowerCase() || null,
        exportValue: (row) => row.fieldName || "",
      },
      { id: "title", header: "Titolo", kind: "text", width: 2, cell: (row) => row.title, sortValue: (row) => row.title.toLowerCase(), title: (row) => row.title },
      {
        id: "who",
        header: "Prenotante",
        kind: "text",
        cell: (row) => bookingWhoLabel(row) || null,
        sortValue: (row) => bookingWhoLabel(row).toLowerCase() || null,
        title: (row) => bookingWhoLabel(row) || undefined,
      },
      { id: "amount", header: "Importo", kind: "amount", align: "right", cell: (row) => (row.amount === undefined ? MISSING : formatMoney(row.amount)), sortValue: (row) => row.amount ?? null, exportValue: (row) => row.amount ?? "" },
      { id: "status", header: "Stato", kind: "status", cell: (row) => <StatusPill size="sm" status={bookingStatusSpec(row.status)} />, sortValue: (row) => row.status, exportValue: (row) => BOOKING_STATUS[row.status].label },
      { id: "payment", header: "Pagamento", kind: "status", cell: (row) => <StatusPill size="sm" status={bookingPaymentSpec(row.paymentStatus)} />, sortValue: (row) => row.paymentStatus || "unpaid", exportValue: (row) => bookingPaymentSpec(row.paymentStatus).label },
      { id: "notes", header: "Note", kind: "text", hidden: true, cell: (row) => row.notes || null, sortValue: (row) => row.notes || null, title: (row) => row.notes || undefined },
    ],
    [fieldIds],
  );

  const bookingActions = React.useMemo<RowActionDef<StructureBooking>[]>(
    () => [
      { id: "edit", label: "Modifica", icon: <Pencil />, primary: true, onClick: (row) => setBookingForm(bookingFormFrom(row)) },
      { id: "delete", label: "Elimina", icon: <Trash2 />, tone: "danger", onClick: (row) => void handleDeleteBooking(row) },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [structure, clubId],
  );

  const editingBooking = structure && bookingForm?.id ? (structure.bookings || []).find((item) => item.id === bookingForm.id) || null : null;

  const openNewBooking = () => {
    if (!structure) return;
    setBookingForm({ ...emptyBookingForm(), fieldId: structure.fields[0]?.id || "" });
  };

  const editButton = (section: StructureEditSection, label = "Modifica") => (
    <Button variant="secondary" size="sm" onClick={() => setEditing(section)}>
      {label}
    </Button>
  );

  return (
    <div className="flex h-[100dvh] bg-egw-page">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Header title="Strutture" />
        <main className={dashboardMainClassName}>
          <DashboardPageContainer>
            {loading ? (
              <>
                <Panel className="flex items-center gap-5">
                  <Skeleton className="h-[72px] w-[72px] rounded-egw-panel-sm" />
                  <div className="flex-1">
                    <Skeleton className="mb-3 h-7 w-56" />
                    <Skeleton className="h-4 w-40" />
                  </div>
                </Panel>
                <DetailCard title="Informazioni" loading />
              </>
            ) : !structure ? (
              <EmptyStateCard
                iconTone="neutral"
                title="Struttura non trovata"
                description="La struttura richiesta non esiste o non appartiene al club attivo."
                primary={
                  <Button variant="primary" onClick={() => router.push(withClubId("/structures", clubId))}>
                    Torna alle strutture
                  </Button>
                }
              />
            ) : (
              <>
                <RecordHeader
                  eyebrow="Struttura"
                  name={structureDisplayName(structure)}
                  identity={{ name: structureDisplayName(structure) }}
                  chips={
                    <>
                      {structure.type ? <DataChip>{structure.type}</DataChip> : null}
                      {siteName ? <DataChip tone="blue">{siteName}</DataChip> : null}
                      <DataChip>{structure.isPublic ? "Pubblica" : "Privata"}</DataChip>
                    </>
                  }
                  status={
                    <>
                      <StatusPill status={structure.isVisibleToMembers ? STRUCTURE_VISIBILITY.visible : STRUCTURE_VISIBILITY.hidden} />
                      <StatusPill status={structure.isBookableByMembers ? STRUCTURE_BOOKABILITY.bookable : STRUCTURE_BOOKABILITY.closed} />
                    </>
                  }
                  meta={structureAddressLine(structure) || "Indirizzo non inserito"}
                  actions={headerActions}
                  areas={
                    <RecordAreaSwitcher
                      value={area}
                      onChange={setArea}
                      areas={STRUCTURE_AREAS.map((item) => ({ ...item, problems: alerts.filter((alert) => alert.area === item.value).length }))}
                    />
                  }
                >
                  <RecordAlertStrip
                    items={alerts.map((alert) => ({
                      id: alert.id,
                      severity: alert.severity,
                      text: alert.text,
                      action: (
                        <Button variant="secondary" size="xs" onClick={() => (alert.area === "campi" ? setEditing("fields") : setArea(alert.area))}>
                          {alert.area === "campi" ? "Configura i campi" : alert.area === "prenotazioni" ? "Vai alle prenotazioni" : "Vai ai pagamenti"}
                        </Button>
                      ),
                    }))}
                  />
                </RecordHeader>

                {area === "struttura" ? (
                  <>
                    <DetailCard eyebrow="Anagrafica" title="Informazioni" fields={infoFields} onEdit={() => setEditing("info")} />
                    <CollapsedSection
                      id="note"
                      recordType="struttura"
                      title="Note interne"
                      summary={structure.notes || "Nessuna nota"}
                      actions={editButton("info")}
                    >
                      <p className="whitespace-pre-wrap font-brand text-[13.5px] leading-[1.55] text-egw-ink">{structure.notes || MISSING}</p>
                    </CollapsedSection>
                    <Panel as="section">
                      <PanelHeader
                        eyebrow="Disponibilità"
                        title="Orari per campo"
                        description="Le fasce dichiarate vincolano le prenotazioni della famiglia. Un campo senza fasce non è vincolato."
                        actions={editButton("fields")}
                      />
                      {structure.fields.length === 0 ? (
                        <InsetBlock dashed className="text-center font-brand text-[12.5px] text-egw-ink-62">
                          Nessun campo configurato.
                        </InsetBlock>
                      ) : (
                        <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
                          {structure.fields.map((field) => (
                            <div key={field.id} className="min-w-0">
                              <dt className="font-brand text-[12px] text-[rgba(11,26,58,.55)]">{field.name}</dt>
                              <dd className="mt-1 break-words font-brand text-[13.5px] text-egw-ink">{describeFieldSlots(field) || "Nessuna fascia: orario non vincolato"}</dd>
                            </div>
                          ))}
                        </dl>
                      )}
                    </Panel>
                  </>
                ) : null}

                {area === "campi" ? (
                  structure.fields.length === 0 ? (
                    <EmptyStateCard
                      icon={<LayoutGrid />}
                      title="Nessun campo configurato"
                      description="Un campo è ciò che si prenota: ha fasce orarie per giorno, tariffe e una visibilità propria."
                      primary={
                        <Button variant="neutral" size="sm" icon={<Plus />} onClick={() => setEditing("fields")}>
                          Aggiungi campo
                        </Button>
                      }
                    />
                  ) : (
                    <Panel as="section">
                      <PanelHeader
                        eyebrow="Campi"
                        title={pluralize(structure.fields.length, "campo", "campi")}
                        description="Proprietà, visibilità e fasce orarie per giorno."
                        actions={
                          <Button variant="neutral" size="sm" icon={<Pencil />} onClick={() => setEditing("fields")}>
                            Modifica campi
                          </Button>
                        }
                      />
                      <div className="flex flex-col gap-3">
                        {structure.fields.map((field) => (
                          <InsetBlock key={field.id}>
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-brand text-[14px] font-bold text-egw-ink">{field.name}</span>
                              <DataChip size="sm">{field.ownership}</DataChip>
                              <StatusPill size="sm" status={field.isVisible ? STRUCTURE_VISIBILITY.visible : STRUCTURE_VISIBILITY.hidden} />
                              <StatusPill size="sm" status={field.isBookable ? STRUCTURE_BOOKABILITY.bookable : STRUCTURE_BOOKABILITY.closed} />
                              {field.inRent ? <DataChip size="sm" tone="amber">In affitto</DataChip> : null}
                            </div>
                            <div className="egw-scroll mt-3 overflow-x-auto">
                              <table className="w-full min-w-[420px] border-collapse font-brand text-[12.5px]">
                                <tbody>
                                  {WEEK_DAYS.map((day) => {
                                    const slots = field.availability[day.key] || [];
                                    return (
                                      <tr key={day.key} className="border-t border-egw-hairline first:border-t-0">
                                        <th scope="row" className="w-28 py-1.5 pr-3 text-left font-semibold text-egw-ink-62">
                                          {day.label}
                                        </th>
                                        <td className="py-1.5 text-egw-ink">
                                          {slots.length ? (
                                            <span className="flex flex-wrap gap-1.5">
                                              {slots.map((slot, index) => (
                                                <DataChip key={`${day.key}-${index}`} size="sm">
                                                  <span className="egw-num">{slotLabel(slot)}</span>
                                                </DataChip>
                                              ))}
                                            </span>
                                          ) : (
                                            <span className="text-egw-ink-42">{MISSING}</span>
                                          )}
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                            <p className="mt-2 font-brand text-[11.5px] text-egw-ink-62">
                              {countFieldSlots(field) ? pluralize(countFieldSlots(field), "fascia dichiarata", "fasce dichiarate") : "Nessuna fascia: l'orario non è vincolato"}
                              {" · "}
                              {field.pricing.length ? pluralize(field.pricing.length, "tariffa", "tariffe") : "Tariffe non pubblicate"}
                            </p>
                          </InsetBlock>
                        ))}
                      </div>
                    </Panel>
                  )
                ) : null}

                {area === "tariffe" ? (
                  <>
                    <Panel as="section">
                      <PanelHeader eyebrow="Tariffe" title="Durata e prezzo per campo" description="Una tariffa senza importo non si mostra alla famiglia." actions={editButton("fields")} />
                      {structure.fields.length === 0 ? (
                        <InsetBlock dashed className="text-center font-brand text-[12.5px] text-egw-ink-62">
                          Aggiungi un campo prima di configurare le tariffe.
                        </InsetBlock>
                      ) : (
                        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                          {structure.fields.map((field) => (
                            <InsetBlock key={field.id}>
                              <p className="font-brand text-[13px] font-bold text-egw-ink">{field.name}</p>
                              {field.pricing.length === 0 ? (
                                <p className="mt-1.5 font-brand text-[12px] text-egw-ink-62">Nessuna tariffa configurata.</p>
                              ) : (
                                <dl className="mt-2">
                                  {field.pricing.map((price) => (
                                    <div key={price.id} className="flex items-baseline justify-between gap-4 border-b border-dashed border-egw-hairline py-1.5 last:border-0">
                                      <dt className="egw-num font-brand text-[12.5px] text-egw-ink-62">{price.durationMinutes} min</dt>
                                      <dd className="egw-num font-brand text-[13px] font-bold text-egw-ink">{price.price > 0 ? formatMoney(price.price) : "Non pubblicata"}</dd>
                                    </div>
                                  ))}
                                </dl>
                              )}
                            </InsetBlock>
                          ))}
                        </div>
                      )}
                    </Panel>

                    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] lg:items-start">
                      <SummaryCard
                        dashed
                        eyebrow="Affitto"
                        title="Contratto di affitto"
                        rows={rentRows}
                        footer={
                          <>
                            {structure.rent?.notes ? <p className="mr-auto font-brand text-[12px] text-egw-ink-62">{structure.rent.notes}</p> : null}
                            {editButton("rent")}
                          </>
                        }
                      />
                      <DataGrid<RentPaymentRow>
                        module="strutture-affitti"
                        aria-label="Pagamenti d'affitto"
                        rows={structure.payments}
                        getRowId={(row) => row.id}
                        columns={paymentColumns}
                        defaultSort={{ columnId: "date", direction: "desc" }}
                        rowActions={paymentActions}
                        rowLabel={(row) => row.description}
                        canSelect={false}
                        hideViews
                        hideFooter={structure.payments.length <= 25}
                        persist={false}
                        noun={{ singular: "pagamento", plural: "pagamenti" }}
                        banner={
                          <div className="flex flex-col items-start justify-between gap-3 border-b border-egw-hairline px-4 py-3 sm:flex-row sm:items-center">
                            <div>
                              <p className="font-brand text-[15px] font-bold text-egw-ink">Pagamenti d&apos;affitto</p>
                              <p className="font-brand text-[12px] text-egw-ink-62">Canoni e altre uscite verso il proprietario della struttura.</p>
                            </div>
                            <Button variant="neutral" size="sm" icon={<Plus />} onClick={() => setPaymentOpen(true)} className="w-full justify-center sm:w-auto">
                              Registra pagamento
                            </Button>
                          </div>
                        }
                        empty={{
                          icon: <CalendarClock />,
                          title: "Nessun pagamento registrato",
                          description: "Registra qui i canoni versati e quelli in attesa.",
                          primary: (
                            <Button variant="neutral" size="sm" icon={<Plus />} onClick={() => setPaymentOpen(true)}>
                              Registra pagamento
                            </Button>
                          ),
                        }}
                      />
                    </div>
                  </>
                ) : null}

                {area === "prenotazioni" ? (
                  <>
                    <BookingsCalendar
                      structure={structure}
                      onPickDay={(date) => setBookingForm(bookingFormForDate(structure, date))}
                      onPickBooking={(booking) => setBookingForm(bookingFormFrom(booking))}
                      actions={
                        <Button variant="neutral" size="sm" icon={<Plus />} onClick={openNewBooking}>
                          Nuova prenotazione
                        </Button>
                      }
                    />
                    <DataGrid<StructureBooking>
                      module="strutture-prenotazioni"
                      aria-label="Prenotazioni della struttura"
                      rows={sortBookings(structure.bookings || [])}
                      getRowId={(row) => row.id}
                      columns={bookingColumns}
                      defaultSort={{ columnId: "start", direction: "asc" }}
                      rowActions={bookingActions}
                      rowLabel={(row) => row.title}
                      canSelect={false}
                      hideViews
                      hideFooter={(structure.bookings || []).length <= 25}
                      persist={false}
                      onOpenRow={(row) => setBookingForm(bookingFormFrom(row))}
                      noun={{ singular: "prenotazione", plural: "prenotazioni" }}
                      empty={{
                        icon: <CalendarClock />,
                        title: "Nessuna prenotazione registrata",
                        description: "Le richieste delle famiglie arrivano qui in attesa di conferma; la segreteria può aggiungerne di sue.",
                        primary: (
                          <Button variant="neutral" size="sm" icon={<Plus />} onClick={openNewBooking}>
                            Nuova prenotazione
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

      <StructureDrawer
        open={Boolean(editing)}
        section={editing ?? "info"}
        structure={structure ?? null}
        sites={sites}
        onClose={() => setEditing(null)}
        onSave={handleSaveSection}
      />

      {structure ? (
        <BookingDrawer
          open={Boolean(bookingForm)}
          structure={structure}
          initialForm={bookingForm ?? emptyBookingForm()}
          editing={editingBooking}
          onClose={() => setBookingForm(null)}
          onSave={handleSaveBooking}
        />
      ) : null}

      <RentPaymentDrawer open={paymentOpen} onClose={() => setPaymentOpen(false)} onSave={handleSavePayment} />

      <DeleteStructureDialog
        open={deleting}
        onOpenChange={(open) => !deleteBusy && setDeleting(open)}
        structure={structure ?? null}
        clubId={clubId}
        onConfirm={confirmDelete}
        loading={deleteBusy}
      />

      {confirmDialog}
    </div>
  );
}

export default function StructureDetailRoute() {
  return (
    <Suspense fallback={null}>
      <StructureDetailPageContent />
    </Suspense>
  );
}
