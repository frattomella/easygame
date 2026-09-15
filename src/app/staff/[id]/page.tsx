"use client";

import * as React from "react";
import { Suspense } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Pencil, Trash2 } from "lucide-react";
import Sidebar from "@/components/dashboard/Sidebar";
import Header from "@/components/dashboard/Header";
import { DashboardPageContainer, dashboardMainClassName } from "@/components/dashboard/dashboard-page-container";
import { useToast } from "@/components/ui/toast-notification";
import { useBreadcrumbLabel } from "@/components/web/shell/ShellProvider";
import { CollapsedSection, RecordAlertStrip, RecordAreaSwitcher, RecordHeader, type RecordAction } from "@/components/web/record/Record";
import { DetailCard, EmptyStateCard, type DetailField } from "@/components/web/page/Cards";
import { Button } from "@/components/web/primitives/Button";
import { Skeleton } from "@/components/web/primitives/Controls";
import { Panel } from "@/components/web/primitives/Surface";
import { DataChip, StatusPill } from "@/components/web/primitives/StatusPill";
import { Select } from "@/components/web/forms/Field";
import { formatDateShort, MISSING, orMissing } from "@/lib/web/format";
import { ClubPersonAccessCard } from "@/components/club/club-person-access-card";
import { PersonCompensationTab } from "@/components/sport-work/PersonCompensationTab";
import { ClothingSizesSummary } from "@/components/forms/clothing-sizes-fields";
import { supabase } from "@/lib/supabase";
import { deleteStaffMember, updateClubDataItem } from "@/lib/simplified-db";
import { collectStaffRoles, findStaffDepartment, normalizeDepartmentName, type StaffDepartment } from "@/lib/staff-directory";
import { ensureStaffDepartment, resolveStaffDepartments } from "@/lib/api/staff-departments";
import { StaffSectionDrawer, type StaffEditSection } from "@/components/staff/v2/staff-section-drawer";
import { DeleteStaffDialog } from "@/components/staff/v2/delete-staff-dialog";
import { useStaffClubId, withClubId } from "@/components/staff/v2/use-staff-club-id";
import {
  STAFF_AREAS,
  computeStaffAlerts,
  departmentChipTone,
  getStaffDisplayName,
  getStaffIdentity,
  resolveStaffArea,
  staffDocumentTypeLabel,
  staffHireDate,
  staffStatusSpec,
  type StaffArea,
  type StaffMember,
} from "@/components/staff/v2/staff-model";

/**
 * `/staff/[id]` — scheda di un membro dello staff (Web V2, pattern 2:
 * intestazione di scheda, tre aree, sezioni chiudibili).
 *
 * Le quattro tab della V1 confluiscono in tre aree: **Profilo** (Anagrafica +
 * Documenti), **Incarico** (Dati societari: informazioni societarie, taglie,
 * «Accesso EasyGame»), **Lavoro e compensi** (la tab condivisa). I vecchi
 * `?tab=anagrafica|societari|documenti|lavoro` restano link validi. Le
 * modifiche per sezione della modale V1 vivono ora nei cassetti, con le
 * stesse scritture: `updateClubDataItem` + `ensureStaffDepartment`; il
 * reparto si cambia in linea e si salva subito, come nella V1.
 */
const NO_DEPARTMENT = "__none__";

const genderLabel = (value?: string | null) => {
  const raw = String(value || "").trim().toUpperCase();
  if (raw === "M") return "Maschio";
  if (raw === "F") return "Femmina";
  return String(value || "").trim();
};

const dateOrMissing = (value?: string | null) => (String(value || "").trim() ? formatDateShort(value) : MISSING);

function StaffMemberDetailsPageContent() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { showToast } = useToast();
  const staffId = params?.id as string;
  const { clubId, resolved } = useStaffClubId(searchParams?.get("clubId"));
  const requested = resolveStaffArea(searchParams?.get("tab"));

  const [isLoading, setIsLoading] = React.useState(true);
  const [staffMember, setStaffMember] = React.useState<StaffMember | null>(null);
  const [allStaffMembers, setAllStaffMembers] = React.useState<StaffMember[]>([]);
  const [staffDepartments, setStaffDepartments] = React.useState<StaffDepartment[]>([]);
  const [editingSection, setEditingSection] = React.useState<StaffEditSection | null>(null);
  const [isSavingDepartment, setIsSavingDepartment] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);
  const [deleteBusy, setDeleteBusy] = React.useState(false);

  const displayName = staffMember ? getStaffDisplayName(staffMember) : null;
  useBreadcrumbLabel(displayName);

  /* ── Caricamento, con il retry di rete della V1 (max 3, backoff 1s×n) ──── */
  React.useEffect(() => {
    if (!resolved) return;
    if (!clubId) {
      setIsLoading(false);
      return;
    }
    if (!staffId) {
      showToast("error", "ID del membro dello staff mancante");
      setIsLoading(false);
      return;
    }
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const fetchStaffData = async (retryCount = 0) => {
      setIsLoading(true);
      try {
        const { data: clubData, error: clubError } = await supabase
          .from("clubs")
          .select("staff_members, settings")
          .eq("id", clubId)
          .maybeSingle();
        if (cancelled) return;
        if (clubError) {
          if (clubError.message?.includes("Failed to fetch") && retryCount < 3) {
            timer = setTimeout(() => void fetchStaffData(retryCount + 1), 1000 * (retryCount + 1));
            return;
          }
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
        const members: StaffMember[] = Array.isArray(clubData?.staff_members) ? clubData.staff_members : [];
        const settings = clubData?.settings && typeof clubData.settings === "object" ? clubData.settings : {};
        setAllStaffMembers(members);
        // Stessa funzione dell'elenco: i reparti orfani rimasti sui membri
        // compaiono anche qui, invece di sparire dalla tendina.
        setStaffDepartments(resolveStaffDepartments(settings, members));
        const found = members.find((item) => String(item.id) === String(staffId));
        if (!found) {
          showToast("error", "Membro dello staff non trovato");
          setStaffMember(null);
          setIsLoading(false);
          return;
        }
        setStaffMember(found);
      } catch (error) {
        if (cancelled) return;
        console.error("Error fetching staff data:", error);
        showToast("error", "Errore nel caricamento dei dati del membro dello staff");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    void fetchStaffData();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [clubId, resolved, staffId, showToast]);

  /* ── Aree e link profondi ──────────────────────────────────────────────── */
  const area: StaffArea = requested.area;
  const setArea = (next: StaffArea) => {
    const query = new URLSearchParams();
    if (clubId) query.set("clubId", clubId);
    query.set("tab", next);
    router.replace(`/staff/${staffId}?${query.toString()}`, { scroll: false });
  };

  /* ── Scritture ─────────────────────────────────────────────────────────── */
  const applyLocal = (patch: Record<string, any>) => {
    setStaffMember((current) => (current ? { ...current, ...patch } : current));
    setAllStaffMembers((current) => current.map((member) => (String(member.id) === String(staffId) ? { ...member, ...patch } : member)));
  };

  const handleSaveSection = async (_section: StaffEditSection, payload: Record<string, any>) => {
    if (!clubId || !staffId) return;
    try {
      await updateClubDataItem(clubId, "staff_members", staffId, payload);
      await ensureStaffDepartment(clubId, payload.department);
      applyLocal(payload);
      setEditingSection(null);
      showToast("success", "Modifiche salvate con successo");
    } catch (error) {
      console.error("Error updating staff member:", error);
      showToast("error", "Errore nel salvataggio delle modifiche");
    }
  };

  /**
   * Il reparto si salva **subito**, come nella V1 (guideline 08 §8.7: il
   * reparto e uno dei pochi campi che si modificano in linea). Ottimistico,
   * con ritorno indietro se la scrittura fallisce; `settings` non si
   * riscrive mai da qui, il reparto nuovo lo persiste `ensureStaffDepartment`.
   */
  const handleDepartmentChange = async (departmentName: string) => {
    if (!clubId || !staffId || isSavingDepartment) return;
    const nextDepartment = departmentName === NO_DEPARTMENT ? "" : normalizeDepartmentName(departmentName);
    const previousDepartment = staffMember?.department || "";
    const previousMembers = allStaffMembers;
    const nextMembers = previousMembers.map((member) => (String(member.id) === String(staffId) ? { ...member, department: nextDepartment } : member));
    if (!nextMembers.some((member) => String(member.id) === String(staffId))) {
      showToast("error", "Membro dello staff non trovato");
      return;
    }
    setAllStaffMembers(nextMembers);
    setStaffMember((current) => (current ? { ...current, department: nextDepartment } : current));
    setIsSavingDepartment(true);
    try {
      const { error } = await supabase.from("clubs").update({ staff_members: nextMembers }).eq("id", clubId);
      if (error) throw error;
      await ensureStaffDepartment(clubId, nextDepartment);
      showToast("success", "Reparto aggiornato con successo");
    } catch (error) {
      console.error("Error assigning staff department:", error);
      setAllStaffMembers(previousMembers);
      setStaffMember((current) => (current ? { ...current, department: previousDepartment } : current));
      showToast("error", "Errore nell'aggiornamento del reparto");
    } finally {
      setIsSavingDepartment(false);
    }
  };

  const confirmDelete = async () => {
    if (!clubId || !staffId) return;
    setDeleteBusy(true);
    try {
      await deleteStaffMember(clubId, staffId);
      showToast("success", "Membro dello staff eliminato con successo");
      router.push(withClubId("/staff", clubId));
    } catch (error) {
      console.error("Error deleting staff member:", error);
      showToast("error", "Errore nell'eliminazione del membro dello staff");
      setDeleteBusy(false);
    }
  };

  /* ── Derivati ──────────────────────────────────────────────────────────── */
  const identity = getStaffIdentity(staffMember);
  const currentDepartment = normalizeDepartmentName(staffMember?.department);
  const savedDepartmentOptions = staffDepartments.filter((department) => normalizeDepartmentName(department.name));
  const departmentOptions =
    currentDepartment && !savedDepartmentOptions.some((d) => normalizeDepartmentName(d.name).toLowerCase() === currentDepartment.toLowerCase())
      ? [...savedDepartmentOptions, { id: `current-${currentDepartment}`, name: currentDepartment }]
      : savedDepartmentOptions;
  // Il valore della tendina e il nome **salvato**, anche se la scheda lo porta
  // con un'altra grafia: altrimenti la tendina mostra il segnaposto.
  const currentDepartmentValue =
    departmentOptions.find((d) => normalizeDepartmentName(d.name).toLowerCase() === currentDepartment.toLowerCase())?.name || currentDepartment;
  const alerts = React.useMemo(() => computeStaffAlerts(staffMember), [staffMember]);

  const headerActions: RecordAction[] = [
    { id: "edit", label: "Modifica", icon: <Pencil />, onClick: () => router.push(withClubId(`/staff/${staffId}/edit`, clubId)) },
    { id: "delete", label: "Elimina", icon: <Trash2 />, tone: "danger", overflow: true, onClick: () => setDeleting(true) },
  ];

  const personalFields: DetailField[] = staffMember
    ? [
        { label: "Nome", value: orMissing(identity.firstName) },
        { label: "Cognome", value: orMissing(identity.lastName) },
        { label: "Età", value: orMissing(staffMember.age) },
        { label: "Data di nascita", value: dateOrMissing(staffMember.birthDate) },
        { label: "Nazionalità", value: orMissing(staffMember.nationality || "Italiana") },
        { label: "Luogo di nascita", value: orMissing(staffMember.birthPlace) },
        { label: "Sesso", value: orMissing(genderLabel(staffMember.gender)) },
        { label: "Formazione scolastica", value: orMissing(staffMember.education) },
        { label: "Codice fiscale", value: <span className="egw-num uppercase">{orMissing(staffMember.fiscalCode || staffMember.fiscal_code)}</span> },
        { label: "Note", value: orMissing(staffMember.notes), wide: true },
      ]
    : [];

  const contactFields: DetailField[] = staffMember
    ? [
        { label: "Email", value: orMissing(staffMember.email) },
        { label: "Telefono", value: <span className="egw-num">{orMissing(staffMember.phone)}</span> },
        { label: "Indirizzo", value: orMissing(staffMember.address) },
        { label: "Città", value: orMissing(staffMember.city) },
        { label: "CAP", value: <span className="egw-num">{orMissing(staffMember.postalCode)}</span> },
      ]
    : [];

  const documentFields: DetailField[] = staffMember
    ? [
        { label: "Tipo di documento", value: orMissing(staffDocumentTypeLabel(staffMember.documentType)) },
        { label: "Numero documento", value: <span className="egw-num">{orMissing(staffMember.documentNumber)}</span> },
        { label: "Data di rilascio", value: dateOrMissing(staffMember.documentIssueDate) },
        { label: "Scadenza del documento", value: dateOrMissing(staffMember.documentExpiry) },
        { label: "Scadenza permesso di soggiorno", value: dateOrMissing(staffMember.residencePermitExpiry) },
      ]
    : [];

  const companyFields: DetailField[] = staffMember
    ? [
        { label: "Ruolo", value: orMissing(staffMember.role || "Staff") },
        { label: "Stato", value: <StatusPill status={staffStatusSpec(staffMember.status)} /> },
        { label: "Data di assunzione", value: dateOrMissing(staffHireDate(staffMember)) },
        {
          label: "Reparto",
          wide: true,
          value: (
            <div className="max-w-sm">
              <Select
                aria-label="Reparto"
                value={currentDepartmentValue || NO_DEPARTMENT}
                onValueChange={(value) => void handleDepartmentChange(value)}
                disabled={isSavingDepartment}
                options={[{ value: NO_DEPARTMENT, label: "Non assegnato" }, ...departmentOptions.map((d) => ({ value: d.name, label: d.name }))]}
                placeholder="Seleziona reparto"
              />
              <p className="mt-[7px] font-brand text-[11.5px] font-medium text-[rgba(11,26,58,.55)]">
                I reparti disponibili arrivano dalla gestione reparti dello staff.
              </p>
            </div>
          ),
        },
      ]
    : [];

  const documentSummary = staffMember
    ? [staffDocumentTypeLabel(staffMember.documentType), staffMember.documentNumber, staffMember.documentExpiry ? `scade il ${formatDateShort(staffMember.documentExpiry)}` : null]
        .filter(Boolean)
        .join(" · ") || "Nessun documento registrato"
    : "";

  const editButton = (section: StaffEditSection) => (
    <Button variant="secondary" size="sm" onClick={() => setEditingSection(section)}>
      Modifica
    </Button>
  );

  return (
    <div className="flex h-[100dvh] bg-egw-page">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Header title="Staff" />
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
                <DetailCard title="Informazioni personali" loading />
                <DetailCard title="Contatti e residenza" loading />
              </>
            ) : !staffMember ? (
              <EmptyStateCard
                iconTone="neutral"
                title="Membro dello staff non trovato"
                description="La scheda che cerchi non è in questo club, oppure è stata eliminata."
                primary={
                  <Button variant="primary" onClick={() => router.push(withClubId("/staff", clubId))}>
                    Torna alla lista staff
                  </Button>
                }
              />
            ) : (
              <>
                <RecordHeader
                  eyebrow="Staff"
                  name={identity.fullName}
                  identity={{ name: identity.fullName, round: true }}
                  chips={
                    <>
                      {currentDepartment ? (
                        <DataChip tone={departmentChipTone(findStaffDepartment(staffDepartments, currentDepartment))}>{currentDepartment}</DataChip>
                      ) : null}
                      {staffMember.role ? <DataChip>{staffMember.role}</DataChip> : null}
                    </>
                  }
                  status={<StatusPill status={staffStatusSpec(staffMember.status)} />}
                  actions={headerActions}
                  areas={
                    <RecordAreaSwitcher
                      value={area}
                      onChange={setArea}
                      areas={STAFF_AREAS.map((item) => ({ ...item, problems: item.value === "profilo" ? alerts.length : 0 }))}
                    />
                  }
                >
                  <RecordAlertStrip
                    items={alerts.map((alert) => ({
                      id: alert.id,
                      severity: alert.severity,
                      text: alert.text,
                      action: (
                        <Button variant="secondary" size="xs" onClick={() => setEditingSection(alert.id === "no-contact" ? "contacts" : "document")}>
                          {alert.id === "no-contact" ? "Aggiungi contatto" : "Aggiorna documento"}
                        </Button>
                      ),
                    }))}
                  />
                </RecordHeader>

                {area === "profilo" ? (
                  <>
                    <DetailCard eyebrow="Anagrafica" title="Informazioni personali" fields={personalFields} onEdit={() => setEditingSection("personal")} />
                    <DetailCard eyebrow="Contatti" title="Contatti e residenza" fields={contactFields} onEdit={() => setEditingSection("contacts")} />
                    {requested.section === "documento" ? (
                      <DetailCard eyebrow="Documenti" title="Documento di identità" fields={documentFields} onEdit={() => setEditingSection("document")} />
                    ) : (
                      <CollapsedSection id="documento" recordType="staff" title="Documento di identità" summary={documentSummary} actions={editButton("document")}>
                        <dl className="grid grid-cols-1 gap-x-6 gap-y-[18px] sm:grid-cols-2 lg:grid-cols-3">
                          {documentFields.map((field) => (
                            <div key={String(field.label)} className="min-w-0">
                              <dt className="font-brand text-[12px] text-[rgba(11,26,58,.55)]">{field.label}</dt>
                              <dd className="mt-1 break-words font-brand text-[13.5px] text-egw-ink">{field.value}</dd>
                            </div>
                          ))}
                        </dl>
                      </CollapsedSection>
                    )}
                  </>
                ) : null}

                {area === "incarico" ? (
                  <>
                    <DetailCard eyebrow="Dati societari" title="Informazioni societarie" fields={companyFields} onEdit={() => setEditingSection("company")} />
                    <CollapsedSection id="taglie" recordType="staff" title="Taglie vestiario" summary="Profilo, maglia, pantalone e scarpe" actions={editButton("clothing")}>
                      <ClothingSizesSummary value={staffMember.clothingSizes} person={{ gender: staffMember.gender, birthDate: staffMember.birthDate }} />
                    </CollapsedSection>
                    <ClubPersonAccessCard email={staffMember.email} personaLabel="membro dello staff" />
                  </>
                ) : null}

                {area === "lavoro" ? (
                  <PersonCompensationTab
                    originType="staff_member"
                    originId={staffId}
                    firstName={identity.firstName || staffMember.name}
                    lastName={identity.lastName}
                    fiscalCode={staffMember.fiscalCode || staffMember.fiscal_code}
                    email={staffMember.email}
                    phone={staffMember.phone}
                  />
                ) : null}
              </>
            )}
          </DashboardPageContainer>
        </main>
      </div>

      <StaffSectionDrawer
        section={editingSection}
        member={staffMember}
        roles={collectStaffRoles(allStaffMembers)}
        departments={departmentOptions}
        onClose={() => setEditingSection(null)}
        onSave={handleSaveSection}
      />

      <DeleteStaffDialog
        open={deleting}
        onOpenChange={(open) => !deleteBusy && setDeleting(open)}
        name={identity.fullName}
        onConfirm={confirmDelete}
        loading={deleteBusy}
      />
    </div>
  );
}

export default function StaffMemberDetailsPage() {
  return (
    <Suspense fallback={null}>
      <StaffMemberDetailsPageContent />
    </Suspense>
  );
}
