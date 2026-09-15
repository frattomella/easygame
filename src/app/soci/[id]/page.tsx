"use client";

import * as React from "react";
import { Suspense } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { BookOpen, Pencil, Trash2 } from "lucide-react";
import Sidebar from "@/components/dashboard/Sidebar";
import Header from "@/components/dashboard/Header";
import { DashboardPageContainer, dashboardMainClassName } from "@/components/dashboard/dashboard-page-container";
import { useAuth } from "@/components/providers/AuthProvider";
import { useToast } from "@/components/ui/toast-notification";
import { useBreadcrumbLabel } from "@/components/web/shell/ShellProvider";
import { CollapsedSection, RecordAlertStrip, RecordAreaSwitcher, RecordHeader, type RecordAction } from "@/components/web/record/Record";
import { DetailCard, EmptyStateCard, type DetailField } from "@/components/web/page/Cards";
import { Button } from "@/components/web/primitives/Button";
import { Skeleton } from "@/components/web/primitives/Controls";
import { Panel } from "@/components/web/primitives/Surface";
import { DataChip, StatusPill } from "@/components/web/primitives/StatusPill";
import { formatDateShort, MISSING, orMissing } from "@/lib/web/format";
import { ClubPersonAccessCard } from "@/components/club/club-person-access-card";
import { ClothingSizesSummary } from "@/components/forms/clothing-sizes-fields";
import { genderLabel } from "@/lib/italian-registry";
import { supabase } from "@/lib/supabase";
import { fetchMembershipRecord, removeMemberProfile, updateMemberProfile, type MembershipRecordView } from "@/lib/members/client";
import { canManageMembershipRegister, canReadMembershipRegister } from "@/lib/members/permissions";
import { MemberSectionDrawer, type MemberEditSection } from "@/components/soci/v2/member-section-drawer";
import { MembershipEventDrawer } from "@/components/soci/v2/membership-event-drawer";
import { MembershipRegisterSection } from "@/components/soci/v2/membership-register-section";
import { DeleteMemberDialog } from "@/components/soci/v2/delete-member-dialog";
import { useMemberClubId, withClubId } from "@/components/soci/v2/use-member-club-id";
import {
  MEMBER_AREAS,
  computeMemberAlerts,
  memberCardStatusSpec,
  memberRecordFrom,
  memberStatusDetail,
  memberStatusSpec,
  resolveMemberArea,
  withRegisterRecord,
  type MemberArea,
  type MemberRecord,
} from "@/components/soci/v2/member-model";

/**
 * `/soci/[id]` — scheda di un socio (Web V2, pattern 2: intestazione di
 * scheda, tre aree, sezioni chiudibili).
 *
 * Le tre tab della V1 diventano tre aree: **Profilo** (Informazioni
 * personali, Contatti e residenza, Taglie), **Dati associativi** (tipo,
 * date, stato della scheda, «Accesso EasyGame»), **Libro soci** (posizione
 * derivata, registrazione di un evento, storico). `?tab=anagrafica|
 * associativi|libro` restano link validi. Le modifiche per sezione della
 * modale V1 vivono nei cassetti, con la stessa scrittura
 * (`updateMemberProfile`, una riga sola); il libro si legge con
 * `fetchMembershipRecord` e si scrive solo aggiungendo un evento.
 */
const dateOrMissing = (value?: string | null) => (String(value || "").trim() ? formatDateShort(value) : MISSING);

function MemberDetailsPageContent() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { showToast } = useToast();
  const { activeClub, userRole } = useAuth();
  const memberId = params?.id as string;
  const { clubId, resolved } = useMemberClubId(searchParams?.get("clubId"));
  const role = activeClub?.role || userRole;
  const canManage = canManageMembershipRegister(role);
  const canReadRegister = canReadMembershipRegister(role);
  const area: MemberArea = resolveMemberArea(searchParams?.get("tab"));

  const [isLoading, setIsLoading] = React.useState(true);
  const [member, setMember] = React.useState<MemberRecord | null>(null);
  const [record, setRecord] = React.useState<MembershipRecordView | null>(null);
  const [recordLoading, setRecordLoading] = React.useState(true);
  const [recordKey, setRecordKey] = React.useState(0);
  const [editingSection, setEditingSection] = React.useState<MemberEditSection | null>(null);
  const [eventOpen, setEventOpen] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);
  const [deleteBusy, setDeleteBusy] = React.useState(false);

  useBreadcrumbLabel(member?.name || null);

  /* ── Anagrafica ────────────────────────────────────────────────────────── */
  React.useEffect(() => {
    if (!resolved) return;
    if (!clubId) {
      showToast("error", "ID del club mancante. Torna alla lista soci.");
      setIsLoading(false);
      return;
    }
    if (!memberId) {
      showToast("error", "ID del socio mancante");
      setIsLoading(false);
      return;
    }
    let cancelled = false;
    const fetchMemberData = async () => {
      setIsLoading(true);
      try {
        const { data: clubData, error: clubError } = await supabase.from("clubs").select("members").eq("id", clubId).maybeSingle();
        if (cancelled) return;
        if (clubError) {
          console.error("Error fetching club data:", clubError);
          showToast(
            "error",
            clubError.message?.includes("Failed to fetch")
              ? "Errore di connessione. Verifica la tua connessione internet e riprova."
              : `Errore nel caricamento dei dati del club: ${clubError.message}`,
          );
          return;
        }
        if (!clubData) {
          showToast("error", "Club non trovato. Verifica l'ID del club.");
          return;
        }
        const members: Record<string, any>[] = Array.isArray(clubData?.members) ? clubData.members : [];
        const memberData = members.find((m) => String(m.id) === String(memberId));
        if (!memberData) {
          showToast("error", "Socio non trovato");
          setMember(null);
          return;
        }
        setMember(memberRecordFrom({ ...memberData, id: String(memberData.id) }));
      } catch (error: any) {
        if (cancelled) return;
        console.error("Error fetching member data:", error);
        showToast(
          "error",
          error?.message?.includes("Failed to fetch") ? "Errore di connessione. Verifica la tua connessione internet e riprova." : "Errore nel caricamento dei dati del socio",
        );
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };
    void fetchMemberData();
    return () => {
      cancelled = true;
    };
  }, [clubId, resolved, memberId, showToast]);

  /* ── Libro soci ────────────────────────────────────────────────────────── */
  React.useEffect(() => {
    if (!resolved || !clubId || !memberId) return;
    if (!canReadRegister) {
      setRecord(null);
      setRecordLoading(false);
      return;
    }
    let cancelled = false;
    const load = async () => {
      setRecordLoading(true);
      const { data, error } = await fetchMembershipRecord(memberId, { clubId });
      if (cancelled) return;
      // Un socio senza registro non e un errore da urlare: e il caso normale
      // di chi e stato creato prima che il libro esistesse.
      setRecord(error ? null : data);
      setRecordLoading(false);
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [clubId, resolved, memberId, canReadRegister, recordKey]);

  const reloadRecord = () => setRecordKey((k) => k + 1);

  /* ── Aree e link profondi ──────────────────────────────────────────────── */
  const setArea = (next: MemberArea) => {
    const query = new URLSearchParams();
    if (clubId) query.set("clubId", clubId);
    query.set("tab", next);
    router.replace(`/soci/${memberId}?${query.toString()}`, { scroll: false });
  };

  /* ── Scritture ─────────────────────────────────────────────────────────── */
  const handleSaveSection = async (_section: MemberEditSection, payload: Record<string, any>) => {
    if (!clubId || !memberId) return;
    try {
      /*
        **Una scheda alla volta, e non l'elenco.** `updateMemberProfile`
        corregge una riga sotto il lock del club: la copia dell'elenco non
        parte mai dal browser.
      */
      const risposta = await updateMemberProfile({ clubId, memberId, updates: payload });
      if (risposta.error) throw new Error(risposta.error.message);
      // Il record salvato torna dal server; la posizione nel libro si rideriva da `record`.
      const saved = risposta.data?.member;
      setMember((current) => {
        if (!current) return current;
        if (saved && typeof saved === "object") return memberRecordFrom({ ...saved, id: current.id });
        return { ...current, ...(payload as Partial<MemberRecord>) };
      });
      setEditingSection(null);
      showToast("success", "Modifiche salvate con successo");
    } catch (error) {
      console.error("Error updating member:", error);
      showToast("error", error instanceof Error && error.message ? error.message : "Errore nel salvataggio delle modifiche");
    }
  };

  const confirmDelete = async () => {
    if (!clubId || !memberId) return;
    setDeleteBusy(true);
    try {
      /*
        Il servizio rifiuta se il libro soci nomina questa persona, e dice
        perche: il messaggio arriva fin qui invece di un generico «errore».
      */
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

  /* ── Derivati ──────────────────────────────────────────────────────────── */
  const socio = React.useMemo(() => (member ? withRegisterRecord(member, record) : null), [member, record]);
  const alerts = React.useMemo(() => computeMemberAlerts(socio, { registerReadable: canReadRegister && !recordLoading }), [socio, canReadRegister, recordLoading]);

  const headerActions: RecordAction[] = [
    { id: "edit", label: "Modifica", icon: <Pencil />, hidden: !canManage, onClick: () => router.push(withClubId(`/soci/${memberId}/edit`, clubId)) },
    { id: "delete", label: "Elimina", icon: <Trash2 />, tone: "danger", overflow: true, hidden: !canManage, onClick: () => setDeleting(true) },
  ];

  const personalFields: DetailField[] = socio
    ? [
        { label: "Nome", value: orMissing(socio.firstName) },
        { label: "Cognome", value: orMissing(socio.lastName) },
        { label: "Data di nascita", value: dateOrMissing(socio.birthDate) },
        { label: "Sesso", value: socio.gender ? genderLabel(socio.gender) : MISSING },
        { label: "Luogo di nascita", value: orMissing(socio.birthPlace) },
        { label: "Codice fiscale", value: <span className="egw-num uppercase">{orMissing(socio.fiscalCode)}</span> },
        { label: "Note", value: orMissing(socio.notes), wide: true },
      ]
    : [];

  const contactFields: DetailField[] = socio
    ? [
        { label: "Email", value: orMissing(socio.email) },
        { label: "Telefono", value: <span className="egw-num">{orMissing(socio.phone)}</span> },
        { label: "Indirizzo", value: orMissing(socio.address), wide: true },
        { label: "Città", value: orMissing(socio.city) },
        { label: "CAP", value: <span className="egw-num">{orMissing(socio.postalCode)}</span> },
      ]
    : [];

  const membershipFields: DetailField[] = socio
    ? [
        { label: "Tipo socio", value: orMissing(socio.type) },
        {
          label: "Scheda",
          value: (
            <div>
              <StatusPill status={memberCardStatusSpec(socio.status)} />
              {/* Lo stato dell'anagrafica dice se la scheda e in uso. Non dice se la persona e socia: quello lo dice il libro. */}
              <p className="mt-1.5 font-brand text-[11.5px] text-[rgba(11,26,58,.55)]">La qualifica di socio è nell&apos;area «Libro soci».</p>
            </div>
          ),
        },
        { label: "Data iscrizione", value: dateOrMissing(socio.registrationDate) },
        { label: "Scadenza iscrizione", value: dateOrMissing(socio.membershipExpiry) },
        /* Il numero digitato a mano prima della Wave 4: le tessere gia consegnate lo portano stampato, ma non e piu la fonte. */
        { label: "Numero tessera (storico)", value: <span className="egw-num">{orMissing(socio.legacyMembershipNumber)}</span> },
      ]
    : [];

  const editButton = (section: MemberEditSection) =>
    canManage ? (
      <Button variant="secondary" size="sm" onClick={() => setEditingSection(section)}>
        Modifica
      </Button>
    ) : null;

  const alertAction = (id: string) => {
    if (id === "not-in-register" && canManage) {
      return (
        <Button variant="secondary" size="xs" icon={<BookOpen />} onClick={() => setEventOpen(true)}>
          Registra ammissione
        </Button>
      );
    }
    if (id === "no-contact" && canManage) {
      return (
        <Button variant="secondary" size="xs" onClick={() => setEditingSection("contacts")}>
          Aggiungi contatto
        </Button>
      );
    }
    if (id === "card-inactive" && canManage) {
      return (
        <Button variant="secondary" size="xs" onClick={() => setEditingSection("membership")}>
          Aggiorna scheda
        </Button>
      );
    }
    return undefined;
  };

  return (
    <div className="flex h-[100dvh] bg-egw-page">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Header title="Soci" />
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
            ) : !socio ? (
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
            ) : (
              <>
                <RecordHeader
                  eyebrow="Socio"
                  name={socio.name}
                  identity={{ name: socio.name, round: true, avatarSrc: socio.avatar }}
                  chips={
                    <>
                      <DataChip>{socio.type}</DataChip>
                      {socio.membershipNumber ? <DataChip tone="navy">tessera {socio.membershipNumber}</DataChip> : null}
                    </>
                  }
                  status={<StatusPill status={memberStatusSpec(socio)} detail={memberStatusDetail(socio)} />}
                  actions={headerActions}
                  areas={
                    <RecordAreaSwitcher
                      value={area}
                      onChange={setArea}
                      areas={MEMBER_AREAS.map((item) => ({
                        ...item,
                        problems: item.value === "libro" ? alerts.filter((a) => a.id === "not-in-register").length : item.value === "profilo" ? alerts.filter((a) => a.id === "no-contact").length : alerts.filter((a) => a.id === "card-inactive").length,
                      }))}
                    />
                  }
                >
                  <RecordAlertStrip items={alerts.map((alert) => ({ id: alert.id, severity: alert.severity, text: alert.text, action: alertAction(alert.id) }))} />
                </RecordHeader>

                {area === "profilo" ? (
                  <>
                    <DetailCard eyebrow="Anagrafica" title="Informazioni personali" fields={personalFields} onEdit={canManage ? () => setEditingSection("personal") : undefined} />
                    <DetailCard eyebrow="Contatti" title="Contatti e residenza" fields={contactFields} onEdit={canManage ? () => setEditingSection("contacts") : undefined} />
                    <CollapsedSection id="taglie" recordType="member" title="Taglie vestiario" summary="Profilo, maglia, pantalone e scarpe" actions={editButton("clothing")}>
                      <ClothingSizesSummary value={socio.clothingSizes} person={{ gender: socio.gender, birthDate: socio.birthDate }} />
                    </CollapsedSection>
                  </>
                ) : null}

                {area === "associativo" ? (
                  <>
                    <DetailCard eyebrow="Dati associativi" title="Dati associativi" fields={membershipFields} onEdit={canManage ? () => setEditingSection("membership") : undefined} />
                    <ClubPersonAccessCard email={socio.email} personaLabel="socio" />
                  </>
                ) : null}

                {area === "libro" ? (
                  canReadRegister ? (
                    <MembershipRegisterSection record={record} loading={recordLoading} canManage={canManage} onRecordEvent={() => setEventOpen(true)} />
                  ) : (
                    <EmptyStateCard iconTone="neutral" icon={<BookOpen />} title="Libro soci non leggibile con il tuo ruolo" description="Il libro soci del club lo legge chi ci lavora dentro." />
                  )
                ) : null}
              </>
            )}
          </DashboardPageContainer>
        </main>
      </div>

      <MemberSectionDrawer section={editingSection} member={socio} onClose={() => setEditingSection(null)} onSave={handleSaveSection} />

      {canManage ? (
        <MembershipEventDrawer
          open={eventOpen}
          onOpenChange={setEventOpen}
          clubId={clubId}
          memberId={memberId}
          memberName={socio?.name || ""}
          currentStatus={record?.status?.status || null}
          onRecorded={reloadRecord}
        />
      ) : null}

      <DeleteMemberDialog
        open={deleting}
        onOpenChange={(open) => !deleteBusy && setDeleting(open)}
        name={socio?.name || ""}
        eventCount={socio?.eventCount || 0}
        onConfirm={confirmDelete}
        loading={deleteBusy}
      />
    </div>
  );
}

export default function MemberDetailsPage() {
  return (
    <Suspense fallback={null}>
      <MemberDetailsPageContent />
    </Suspense>
  );
}
