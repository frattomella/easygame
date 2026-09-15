"use client";

import * as React from "react";
import { Suspense } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Trash2 } from "lucide-react";
import Sidebar from "@/components/dashboard/Sidebar";
import Header from "@/components/dashboard/Header";
import { DashboardPageContainer, dashboardMainClassName } from "@/components/dashboard/dashboard-page-container";
import { useToast } from "@/components/ui/toast-notification";
import { useBreadcrumbLabel } from "@/components/web/shell/ShellProvider";
import { PageHeader } from "@/components/web/page/PageHeader";
import { EmptyStateCard } from "@/components/web/page/Cards";
import { Button } from "@/components/web/primitives/Button";
import { Skeleton } from "@/components/web/primitives/Controls";
import { Panel } from "@/components/web/primitives/Surface";
import { supabase } from "@/lib/supabase";
import { deleteStaffMember, updateClubDataItem } from "@/lib/simplified-db";
import { collectStaffRoles, type StaffDepartment } from "@/lib/staff-directory";
import { ensureStaffDepartment, resolveStaffDepartments } from "@/lib/api/staff-departments";
import { StaffForm, staffFormValuesFrom, type StaffFormValues } from "@/components/staff/v2/staff-form";
import { DeleteStaffDialog } from "@/components/staff/v2/delete-staff-dialog";
import { useStaffClubId, withClubId } from "@/components/staff/v2/use-staff-club-id";
import { getStaffDisplayName, type StaffMember } from "@/components/staff/v2/staff-model";

/**
 * `/staff/[id]/edit` — modifica completa di un membro dello staff (Web V2,
 * pattern 6). Nella V1 era un rinvio alla scheda, che modificava una sezione
 * per volta in una modale; qui e il modulo intero, con le stesse scritture
 * della modale (`updateClubDataItem` + `ensureStaffDepartment`) e la zona
 * pericolosa in fondo (guideline 08 §8.4).
 */
function EditStaffMemberPageContent() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { showToast } = useToast();
  const staffId = params?.id as string;
  const { clubId, resolved } = useStaffClubId(searchParams?.get("clubId"));

  const [member, setMember] = React.useState<StaffMember | null>(null);
  const [members, setMembers] = React.useState<StaffMember[]>([]);
  const [departments, setDepartments] = React.useState<StaffDepartment[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [submitting, setSubmitting] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);
  const [deleteBusy, setDeleteBusy] = React.useState(false);

  useBreadcrumbLabel(member ? getStaffDisplayName(member) : null);

  React.useEffect(() => {
    if (!resolved) return;
    if (!clubId || !staffId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const { data: clubData, error } = await supabase
          .from("clubs")
          .select("staff_members, settings")
          .eq("id", clubId)
          .maybeSingle();
        if (cancelled) return;
        if (error) {
          showToast("error", `Errore nel caricamento dei dati del club: ${error.message}`);
          return;
        }
        if (!clubData) {
          showToast("error", "Club non trovato. Verifica l'ID del club.");
          return;
        }
        const list: StaffMember[] = Array.isArray(clubData?.staff_members) ? clubData.staff_members : [];
        const settings = clubData?.settings && typeof clubData.settings === "object" ? clubData.settings : {};
        setMembers(list);
        setDepartments(resolveStaffDepartments(settings, list));
        const found = list.find((item) => String(item.id) === String(staffId)) || null;
        if (!found) showToast("error", "Membro dello staff non trovato");
        setMember(found);
      } catch (error) {
        if (cancelled) return;
        console.error("Error fetching staff data:", error);
        showToast("error", "Errore nel caricamento dei dati del membro dello staff");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [clubId, resolved, staffId, showToast]);

  const recordPath = withClubId(`/staff/${staffId}`, clubId);

  const handleSubmit = async (values: StaffFormValues) => {
    if (!clubId || !staffId) {
      showToast("error", "ID del club mancante. Impossibile salvare.");
      return;
    }
    setSubmitting(true);
    try {
      const firstName = values.name.trim();
      const lastName = values.surname.trim();
      const payload = {
        ...values,
        name: firstName,
        firstName,
        surname: lastName,
        lastName,
        fullName: [firstName, lastName].filter(Boolean).join(" ") || undefined,
      };
      await updateClubDataItem(clubId, "staff_members", staffId, payload);
      await ensureStaffDepartment(clubId, payload.department);
      showToast("success", "Modifiche salvate con successo");
      router.push(recordPath);
    } catch (error) {
      console.error("Error updating staff member:", error);
      showToast("error", "Errore nel salvataggio delle modifiche");
    } finally {
      setSubmitting(false);
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

  const name = member ? getStaffDisplayName(member) : "";

  return (
    <div className="flex h-[100dvh] bg-egw-page">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Header title="Staff" />
        <main className={dashboardMainClassName}>
          <DashboardPageContainer className="max-w-[1120px]">
            {loading ? (
              <>
                <Skeleton className="h-8 w-64" />
                <Panel>
                  <Skeleton className="mb-4 h-4 w-40" />
                  <Skeleton className="mb-3 h-[46px] w-full" />
                  <Skeleton className="h-[46px] w-full" />
                </Panel>
              </>
            ) : !member ? (
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
                <PageHeader eyebrow="Staff" title={`Modifica ${name}`} description="Correggi i dati della scheda e salva." />
                <StaffForm
                  mode="edit"
                  idPrefix="staff-edit"
                  initialValues={staffFormValuesFrom(member)}
                  roles={collectStaffRoles(members)}
                  departments={departments}
                  onSubmit={handleSubmit}
                  onCancel={() => router.push(recordPath)}
                  submitLabel="Salva modifiche"
                  submitting={submitting}
                  dangerZone={
                    <Button variant="danger" icon={<Trash2 />} onClick={() => setDeleting(true)}>
                      Elimina membro dello staff
                    </Button>
                  }
                />
              </>
            )}
          </DashboardPageContainer>
        </main>
      </div>

      <DeleteStaffDialog open={deleting} onOpenChange={(open) => !deleteBusy && setDeleting(open)} name={name} onConfirm={confirmDelete} loading={deleteBusy} />
    </div>
  );
}

export default function EditStaffMemberPage() {
  return (
    <Suspense fallback={null}>
      <EditStaffMemberPageContent />
    </Suspense>
  );
}
