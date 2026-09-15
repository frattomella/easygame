"use client";

import * as React from "react";
import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Sidebar from "@/components/dashboard/Sidebar";
import Header from "@/components/dashboard/Header";
import { DashboardPageContainer, dashboardMainClassName } from "@/components/dashboard/dashboard-page-container";
import { useToast } from "@/components/ui/toast-notification";
import { PageHeader } from "@/components/web/page/PageHeader";
import { Skeleton } from "@/components/web/primitives/Controls";
import { supabase } from "@/lib/supabase";
import { addStaffMember } from "@/lib/simplified-db";
import { collectStaffRoles, type StaffDepartment } from "@/lib/staff-directory";
import { ensureStaffDepartment, resolveStaffDepartments } from "@/lib/api/staff-departments";
import { StaffForm, emptyStaffFormValues, type StaffFormValues } from "@/components/staff/v2/staff-form";
import { useRouteClubId, withClubId } from "@/components/web/hooks/use-route-club-id";

/**
 * `/staff/new` — nuovo membro dello staff (Web V2, pattern 6: modulo a pagina
 * intera, pannelli a sezioni, barra delle azioni appiccicosa).
 *
 * Stessi campi, stesse validazioni e stesse scritture della V1:
 * `addStaffMember` e poi `ensureStaffDepartment`, cosi un reparto nato da
 * «Altro» e persistito subito in `settings.staffDepartments`.
 */
function NewStaffMemberPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { showToast } = useToast();
  const { clubId } = useRouteClubId(searchParams?.get("clubId"));
  const [departments, setDepartments] = React.useState<StaffDepartment[]>([]);
  const [roles, setRoles] = React.useState<string[]>(() => collectStaffRoles());
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (!clubId) return;
    let cancelled = false;
    const load = async () => {
      try {
        const { data: clubData, error } = await supabase
          .from("clubs")
          .select("settings, staff_members")
          .eq("id", clubId)
          .single();
        if (cancelled) return;
        if (error) {
          console.error("Error fetching departments:", error);
          return;
        }
        const settings = clubData?.settings && typeof clubData.settings === "object" ? clubData.settings : {};
        const members = Array.isArray(clubData?.staff_members) ? clubData.staff_members : [];
        setDepartments(resolveStaffDepartments(settings, members));
        // Un ruolo scritto a mano su un membro esistente deve ricomparire in
        // tendina, altrimenti la scelta «Altro» andrebbe rifatta ogni volta.
        setRoles(collectStaffRoles(members));
      } catch (error) {
        if (!cancelled) console.error("Error fetching departments:", error);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [clubId]);

  const handleSubmit = async (values: StaffFormValues) => {
    if (!clubId) {
      showToast("error", "ID del club mancante. Impossibile salvare.");
      return;
    }
    setSubmitting(true);
    try {
      const fullName = [values.name.trim(), values.surname.trim()].filter(Boolean).join(" ");
      await addStaffMember(clubId, {
        ...values,
        fullName,
        firstName: values.name.trim(),
        lastName: values.surname.trim(),
        avatar: null,
      });
      /*
        Il reparto si persiste **qui**, non nel cassetto di gestione: un
        reparto creato con «Altro» altrimenti resterebbe una stringa sul
        membro e non comparirebbe mai nelle tendine successive.
      */
      await ensureStaffDepartment(clubId, values.department);
      showToast("success", "Membro dello staff aggiunto con successo");
      router.push(withClubId("/staff", clubId));
    } catch (error) {
      console.error("Error adding staff member:", error);
      showToast("error", error instanceof Error ? error.message : "Errore durante l'aggiunta del membro dello staff");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex h-[100dvh] bg-egw-page">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Header title="Staff" />
        <main className={dashboardMainClassName}>
          <DashboardPageContainer className="max-w-[1120px]">
            <PageHeader eyebrow="Staff" title="Nuovo membro dello staff" description="Compila i dati per aggiungere un nuovo membro." />
            <StaffForm
              mode="create"
              idPrefix="staff"
              initialValues={emptyStaffFormValues()}
              roles={roles}
              departments={departments}
              onSubmit={handleSubmit}
              onCancel={() => router.back()}
              submitLabel="Salva membro"
              submitting={submitting}
            />
          </DashboardPageContainer>
        </main>
      </div>
    </div>
  );
}

export default function NewStaffMemberPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-[100dvh] bg-egw-page">
          <Sidebar />
          <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
            <Header title="Staff" />
            <main className={dashboardMainClassName}>
              <DashboardPageContainer className="max-w-[1120px]">
                <Skeleton className="h-8 w-64" />
                <Skeleton className="h-40 w-full" />
              </DashboardPageContainer>
            </main>
          </div>
        </div>
      }
    >
      <NewStaffMemberPageContent />
    </Suspense>
  );
}
