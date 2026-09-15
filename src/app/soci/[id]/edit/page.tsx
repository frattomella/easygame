"use client";

import * as React from "react";
import { Suspense } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Trash2 } from "lucide-react";
import Sidebar from "@/components/dashboard/Sidebar";
import Header from "@/components/dashboard/Header";
import { DashboardPageContainer, dashboardMainClassName } from "@/components/dashboard/dashboard-page-container";
import { useAuth } from "@/components/providers/AuthProvider";
import { useToast } from "@/components/ui/toast-notification";
import { useBreadcrumbLabel } from "@/components/web/shell/ShellProvider";
import { PageHeader } from "@/components/web/page/PageHeader";
import { EmptyStateCard } from "@/components/web/page/Cards";
import { Button } from "@/components/web/primitives/Button";
import { Skeleton } from "@/components/web/primitives/Controls";
import { Panel } from "@/components/web/primitives/Surface";
import { supabase } from "@/lib/supabase";
import { removeMemberProfile, updateMemberProfile } from "@/lib/members/client";
import { canManageMembershipRegister } from "@/lib/members/permissions";
import { MemberForm, memberFormValuesFrom, type MemberFormValues } from "@/components/soci/v2/member-form";
import { memberEditPayload } from "@/components/soci/v2/member-form-model";
import { DeleteMemberDialog } from "@/components/soci/v2/delete-member-dialog";
import { useRouteClubId, withClubId } from "@/components/web/hooks/use-route-club-id";
import { memberRecordFrom, type MemberRecord } from "@/components/soci/v2/member-model";

/**
 * `/soci/[id]/edit` — modifica completa di un socio (Web V2, pattern 6).
 * Nella V1 la scheda modificava una sezione per volta in una modale; qui e
 * il modulo intero, con la stessa scrittura della modale
 * (`updateMemberProfile`, una riga sola) e la zona pericolosa in fondo
 * (guideline 08 §8.4). Il numero di tessera e la storia associativa non si
 * modificano da qui: il primo lo assegna il libro, la seconda si cambia
 * aggiungendo un evento.
 */
function EditMemberPageContent() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { showToast } = useToast();
  const { activeClub, userRole } = useAuth();
  const memberId = params?.id as string;
  const { clubId, resolved } = useRouteClubId(searchParams?.get("clubId"));
  const canManage = canManageMembershipRegister(activeClub?.role || userRole);

  const [member, setMember] = React.useState<MemberRecord | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [submitting, setSubmitting] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);
  const [deleteBusy, setDeleteBusy] = React.useState(false);

  useBreadcrumbLabel(member?.name || null);

  React.useEffect(() => {
    if (!resolved) return;
    if (!clubId || !memberId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const { data: clubData, error } = await supabase.from("clubs").select("members").eq("id", clubId).maybeSingle();
        if (cancelled) return;
        if (error) {
          showToast("error", `Errore nel caricamento dei dati del club: ${error.message}`);
          return;
        }
        if (!clubData) {
          showToast("error", "Club non trovato. Verifica l'ID del club.");
          return;
        }
        const members: Record<string, any>[] = Array.isArray(clubData?.members) ? clubData.members : [];
        const found = members.find((m) => String(m.id) === String(memberId)) || null;
        if (!found) showToast("error", "Socio non trovato");
        setMember(found ? memberRecordFrom({ ...found, id: String(found.id) }) : null);
      } catch (error) {
        if (cancelled) return;
        console.error("Error fetching member data:", error);
        showToast("error", "Errore nel caricamento dei dati del socio");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [clubId, resolved, memberId, showToast]);

  const recordPath = withClubId(`/soci/${memberId}`, clubId);

  const handleSubmit = async (values: MemberFormValues) => {
    if (!clubId || !memberId) {
      showToast("error", "ID del club mancante");
      return;
    }
    setSubmitting(true);
    try {
      const risposta = await updateMemberProfile({ clubId, memberId, updates: memberEditPayload(values) });
      if (risposta.error) throw new Error(risposta.error.message);
      showToast("success", "Modifiche salvate con successo");
      router.push(recordPath);
    } catch (error) {
      console.error("Error updating member:", error);
      showToast("error", error instanceof Error && error.message ? error.message : "Errore nel salvataggio delle modifiche");
    } finally {
      setSubmitting(false);
    }
  };

  const confirmDelete = async () => {
    if (!clubId || !memberId) return;
    setDeleteBusy(true);
    try {
      const esito = await removeMemberProfile({ clubId, memberId });
      if (esito.error) throw new Error(esito.error.message);
      showToast("success", "Socio eliminato con successo");
      router.push(withClubId("/soci", clubId));
    } catch (error) {
      console.error("Error deleting member:", error);
      showToast("error", error instanceof Error && error.message ? error.message : "Errore nell'eliminazione del socio");
      setDeleteBusy(false);
    }
  };

  return (
    <div className="flex h-[100dvh] bg-egw-page">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Header title="Soci" />
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
                title="Socio non trovato"
                description="La scheda che cerchi non è in questo club, oppure è stata eliminata."
                primary={
                  <Button variant="primary" onClick={() => router.push(withClubId("/soci", clubId))}>
                    Torna alla lista soci
                  </Button>
                }
              />
            ) : !canManage ? (
              <EmptyStateCard
                iconTone="neutral"
                title="Il libro soci lo tiene la direzione del club"
                description="Con il tuo ruolo puoi consultare la scheda, non correggerla."
                primary={
                  <Button variant="primary" onClick={() => router.push(recordPath)}>
                    Apri la scheda
                  </Button>
                }
              />
            ) : (
              <>
                <PageHeader eyebrow="Soci" title={`Modifica ${member.name}`} description="Correggi i dati della scheda e salva." />
                <MemberForm
                  mode="edit"
                  idPrefix="member-edit"
                  initialValues={memberFormValuesFrom(member)}
                  onSubmit={handleSubmit}
                  onCancel={() => router.push(recordPath)}
                  submitLabel="Salva modifiche"
                  submitting={submitting}
                  dangerZone={
                    <Button variant="danger" icon={<Trash2 />} onClick={() => setDeleting(true)}>
                      Elimina socio
                    </Button>
                  }
                />
              </>
            )}
          </DashboardPageContainer>
        </main>
      </div>

      <DeleteMemberDialog open={deleting} onOpenChange={(open) => !deleteBusy && setDeleting(open)} name={member?.name || ""} onConfirm={confirmDelete} loading={deleteBusy} />
    </div>
  );
}

export default function EditMemberPage() {
  return (
    <Suspense fallback={null}>
      <EditMemberPageContent />
    </Suspense>
  );
}
