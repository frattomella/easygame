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
import { admitNewMember } from "@/lib/members/client";
import { MemberForm, emptyMemberFormValues, type MemberFormValues } from "@/components/soci/v2/member-form";
import { memberAdmissionPayload } from "@/components/soci/v2/member-form-model";
import { useRouteClubId, withClubId } from "@/components/web/hooks/use-route-club-id";

/**
 * `/soci/new` — nuovo socio (Web V2, pattern 6: modulo a pagina intera,
 * pannelli a sezioni, barra delle azioni appiccicosa).
 *
 * Stessi campi, stesse validazioni e stessa scrittura della V1: **una
 * chiamata al server** (`admitNewMember` → `POST /api/v1/membership/admissions`)
 * che crea l'anagrafica e la sua ammissione nel libro in una transazione, con
 * il numero di tessera assegnato dal server. Non si legge e non si riscrive
 * `clubs.members` dal browser.
 */
function NewSocioPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { showToast } = useToast();
  const { clubId } = useRouteClubId(searchParams?.get("clubId"));
  const [submitting, setSubmitting] = React.useState(false);

  const handleSubmit = async (values: MemberFormValues) => {
    if (!clubId) {
      showToast("error", "ID del club mancante");
      return;
    }
    setSubmitting(true);
    try {
      const { data, error } = await admitNewMember({ clubId, ...memberAdmissionPayload(values) });
      if (error) {
        showToast("error", error.message);
        return;
      }
      showToast("success", data?.event?.membershipNumber ? `Socio ammesso con la tessera n. ${data.event.membershipNumber}` : "Socio aggiunto con successo");
      router.push(withClubId("/soci", clubId));
    } catch (error: any) {
      console.error("Error:", error);
      showToast("error", `Errore: ${error?.message || "salvataggio non riuscito"}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex h-[100dvh] bg-egw-page">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Header title="Soci" />
        <main className={dashboardMainClassName}>
          <DashboardPageContainer className="max-w-[1120px]">
            <PageHeader eyebrow="Soci" title="Nuovo socio" description="Compila i dati per registrare un nuovo socio e la sua ammissione nel libro." />
            <MemberForm
              mode="create"
              idPrefix="member"
              initialValues={emptyMemberFormValues()}
              onSubmit={handleSubmit}
              onCancel={() => router.back()}
              submitLabel="Salva socio"
              submitting={submitting}
            />
          </DashboardPageContainer>
        </main>
      </div>
    </div>
  );
}

export default function NewSocioPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-[100dvh] bg-egw-page">
          <Sidebar />
          <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
            <Header title="Soci" />
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
      <NewSocioPageContent />
    </Suspense>
  );
}
