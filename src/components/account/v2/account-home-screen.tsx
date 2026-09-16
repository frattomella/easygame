"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Building2, ChevronDown, ChevronRight, CircleHelp, Crown, Loader2, LogOut, Plus, RotateCw, Search, Trash2, UserCircle2, UserPlus, Users } from "lucide-react";
import logoWhite from "@/../public/images/brand/logotipo-w.png";
import iconWhite from "@/../public/images/brand/icon-w.png";
import { useAuth } from "@/components/providers/AuthProvider";
import { useToast } from "@/components/ui/toast-notification";
import { apiRequest } from "@/lib/api/client";
import { fetchMemberships } from "@/lib/auth/memberships-client";
import { classifyMembershipResponse } from "@/lib/auth/membership-load-result";
import { getAccessRedirectPath, getAccessRoleLabel } from "@/lib/access-roles";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/web/page/PageHeader";
import { EmptyStateCard } from "@/components/web/page/Cards";
import { AlertBlock } from "@/components/web/page/Alerts";
import { Button, IconButton } from "@/components/web/primitives/Button";
import { Avatar } from "@/components/web/primitives/Identity";
import { Skeleton } from "@/components/web/primitives/Controls";
import { DataChip, StatusPill } from "@/components/web/primitives/StatusPill";
import { Panel, PanelHeader, SkyProvider } from "@/components/web/primitives/Surface";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@/components/web/primitives/Overlays";
import { TextInput } from "@/components/web/forms/Field";
import { DangerConfirmDialog } from "@/components/web/overlays/Modal";
import { formatInteger } from "@/lib/web/format";
import { AccountCreateClubDrawer, type CreateClubSection } from "@/components/account/v2/account-create-club-drawer";
import { AccountProfileDrawer } from "@/components/account/v2/account-profile-drawer";
import { AccountRedeemAccessDrawer } from "@/components/account/v2/account-redeem-access-drawer";
import {
  CLUB_ACCESS_STATUS,
  SEARCH_THRESHOLD,
  SUPPORT_URL,
  clubPlace,
  etichettaProfili,
  getAccountFirstName,
  matchesQuery,
  profileEmailChanged,
  profileFormDirty,
  profileNeedsCurrentPassword,
  profilePhoneChanged,
  validateProfileForm,
  type ProfileValidation,
} from "@/components/account/v2/account-model";
import {
  buildClubPayload,
  CREATE_CLUB_REQUIRED_FIELDS,
  createClubDefaults,
  createProfileDefaults,
  mapMembershipToClub,
  sortClubs,
  type AccountClub,
  type ClubCreateFormState,
  type MembershipRecord,
  type ProfileFormState,
} from "@/components/account/account-shared";

/**
 * Home account (Web V2, Wave E): la porta d'ingresso a tutti i club di una
 * persona. Ambiente 3 della guideline 05 §5.1 — «fuori dal club»: cielo
 * pieno, filigrana del marchio, pannelli bianchi — perche qui non c'e ancora
 * un club e il guscio gestionale non ha senso.
 *
 * Le tre cose che questa pagina deve fare bene restano quelle della V1:
 *
 * 1. **far scegliere in fretta** — con molti accessi serve un filtro, il ruolo
 *    va letto a colpo d'occhio e il club aperto per ultimo va riconosciuto;
 * 2. **dire la verita mentre carica** — lo scheletro ha la forma del
 *    contenuto; un errore di rete non viene mostrato come «nessun club»;
 * 3. **stare in 375 px** — le righe si impilano, i comandi restano da dito.
 *
 * Stessa logica dati della V1: `GET /api/v1/auth/memberships`, l'attivazione
 * con `POST /api/v1/auth/memberships/activate` che scrive `activeClub` nel
 * browser (chiave dichiarata), le verifiche di email e telefono, il link per
 * impostare una password, la creazione del club e il riscatto del token.
 * Cambia la forma: cassetti al posto delle modali, una conferma del sistema
 * al posto di `window.confirm`, la guardia sulle modifiche non salvate.
 *
 * I due elenchi non sono un `DataGrid`: sono le tessere di una persona, tre
 * o quattro righe lette da un telefono, e l'ambiente 3 non ha ne viste ne
 * colonne. Sono un pannello che tiene le righe (guideline 09 §9.3, «quando
 * non usare una card»), con la ricerca della V1 sopra la soglia.
 */

/* ── Pezzi di interfaccia ──────────────────────────────────────────────── */

/**
 * L'avviso di un recapito non verificato, con il gesto che lo risolve.
 *
 * Un componente solo per i due canali: il telefono e l'email hanno lo stesso
 * problema — «questo recapito non e provato» — e due riquadri scritti a mano
 * sarebbero divergiti alla prima modifica. A 375 px il pulsante va a capo
 * sotto il testo (`flex-wrap`) e la casella del codice scende in colonna.
 */
function VerificationNotice({
  tone,
  title,
  description,
  ctaLabel,
  pending,
  open,
  onAction,
  onConfirm,
  onResend,
}: {
  tone: "warning" | "info";
  title: string;
  description: string;
  ctaLabel: string;
  pending: boolean;
  /** Se la casella del codice e aperta: il codice e gia partito. */
  open: boolean;
  onAction: () => void;
  onConfirm: (code: string) => void;
  onResend: () => void;
}) {
  const [code, setCode] = React.useState("");
  const inputId = `verification-code-${tone}`;

  return (
    <AlertBlock
      severity={tone}
      title={title}
      role="status"
      actions={
        open ? undefined : (
          <Button variant="secondary" size="sm" loading={pending} onClick={onAction}>
            {ctaLabel}
          </Button>
        )
      }
    >
      <div className="flex flex-wrap items-center gap-3">
        <span className="min-w-0 flex-1">{description}</span>
      </div>
      {open ? (
        <form
          className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center"
          onSubmit={(event) => {
            event.preventDefault();
            onConfirm(code.trim());
          }}
        >
          <label className="sr-only" htmlFor={inputId}>
            Codice di verifica
          </label>
          <TextInput
            id={inputId}
            value={code}
            onChange={(event) => setCode(event.target.value)}
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            placeholder="Codice a 6 cifre"
            wrapperClassName="sm:max-w-[180px]"
          />
          <Button type="submit" variant="neutral" size="sm" loading={pending} disabled={!code.trim()}>
            Conferma
          </Button>
          <Button type="button" variant="text" size="sm" disabled={pending} onClick={onResend}>
            Rimanda il codice
          </Button>
        </form>
      ) : null}
    </AlertBlock>
  );
}

function ClubRow({
  club,
  ownerMode,
  isActive,
  isSwitching,
  isDeleting,
  onOpen,
  onDelete,
}: {
  club: AccountClub;
  ownerMode: boolean;
  isActive: boolean;
  isSwitching: boolean;
  isDeleting: boolean;
  onOpen: () => void;
  onDelete?: () => void;
}) {
  const place = clubPlace(club);

  return (
    <li className={cn("flex items-stretch gap-2 rounded-egw-field border bg-egw-page-100 transition-colors duration-hover", isActive ? "border-[rgba(37,99,235,.28)]" : "border-egw-hairline hover:border-[rgba(37,99,235,.32)]")}>
      <button
        type="button"
        onClick={onOpen}
        disabled={isSwitching}
        aria-label={`Apri ${club.name}`}
        className="flex min-w-0 flex-1 items-center gap-3 rounded-egw-field p-3 text-left focus-visible:outline-none focus-visible:shadow-egw-focus disabled:cursor-progress"
      >
        <Avatar src={club.logoUrl} name={club.name} size={40} />

        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="egw-ellipsis font-brand text-[13.5px] font-semibold text-egw-ink">{club.name}</span>
            {isActive ? <StatusPill status={CLUB_ACCESS_STATUS.open} size="sm" /> : null}
          </span>

          <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
            <DataChip
              size="sm"
              tone={ownerMode ? "amber" : "blue"}
              icon={ownerMode ? <Crown aria-hidden /> : <Users aria-hidden />}
            >
              {ownerMode ? "Proprietà" : club.roleLabel}
            </DataChip>
            {place ? <span className="egw-ellipsis font-brand text-[11.5px] text-egw-ink-62">{place}</span> : null}
            {club.activeSeasonLabel ? <span className="egw-num font-brand text-[11.5px] font-semibold text-egw-ink-72">{club.activeSeasonLabel}</span> : null}
          </span>

          {/*
            **Chi sei dentro questo club.** Sta sotto il ruolo e non accanto: e
            la risposta a una seconda domanda, e su 375 px accanto non ci sta.
            I nomi **vanno a capo**, non in ellissi: un elenco di figli
            troncato risponde meta domanda, e un nodo che non va a capo alza la
            larghezza minima della colonna e fa scorrere la pagina.
          */}
          {club.linkedProfiles?.length ? (
            <span className="mt-1 flex w-full min-w-0 flex-wrap items-baseline gap-x-1.5 gap-y-1 font-brand text-[11.5px] text-egw-ink-62" data-testid="profili-collegati">
              <span className="shrink-0 text-egw-ink-42">{etichettaProfili(club.linkedProfiles)}</span>
              <span className="min-w-0 break-words font-medium text-egw-ink-72">{club.linkedProfiles.map((profilo) => profilo.name).join(", ")}</span>
            </span>
          ) : null}
        </span>

        <span className="grid h-8 w-8 shrink-0 place-items-center text-egw-ink-42">
          {isSwitching ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <ChevronRight className="h-5 w-5" aria-hidden />}
        </span>
      </button>

      {!ownerMode && onDelete ? (
        <span className="flex shrink-0 items-center pr-2">
          <IconButton aria-label={`Elimina l'accesso ${club.roleLabel} a ${club.name}`} variant="danger" loading={isDeleting} onClick={onDelete}>
            <Trash2 />
          </IconButton>
        </span>
      ) : null}
    </li>
  );
}

function PanelSkeleton() {
  return (
    <ul className="flex flex-col gap-2" aria-hidden>
      {[0, 1, 2].map((index) => (
        <li key={`skeleton-${index}`} className="flex items-center gap-3 rounded-egw-field border border-egw-hairline bg-egw-page-100 p-3">
          <Skeleton className="h-10 w-10 shrink-0 rounded-egw-pill" />
          <span className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-3.5 w-2/5" />
            <Skeleton className="h-3 w-1/4" />
          </span>
        </li>
      ))}
    </ul>
  );
}

function PanelEmptyState({ ownerMode, filtered, onAction }: { ownerMode: boolean; filtered: boolean; onAction: () => void }) {
  if (filtered) {
    return (
      <EmptyStateCard flat title="Nessun club corrisponde alla ricerca" description="Prova con un altro nome, una città o un ruolo." />
    );
  }

  return (
    <EmptyStateCard
      flat
      icon={ownerMode ? <Building2 /> : <UserPlus />}
      iconTone={ownerMode ? "amber" : "blue"}
      title={ownerMode ? "Non hai ancora creato un club" : "Nessun accesso assegnato"}
      description={ownerMode ? "Crea il tuo club: bastano nome, sede e contatti, il resto si completa dopo." : "Se una società ti ha invitato, inserisci il token che ti ha condiviso."}
      primary={
        <Button variant="secondary" size="sm" onClick={onAction}>
          {ownerMode ? "Crea un club" : "Inserisci un token"}
        </Button>
      }
    />
  );
}

function AccessPanel({
  ownerMode,
  title,
  description,
  actionLabel,
  clubs,
  loading,
  filtered,
  activeClubId,
  switchingClubId,
  deletingAccessKey,
  slotLabel,
  onAction,
  onOpenClub,
  onDeleteClub,
}: {
  ownerMode: boolean;
  title: string;
  description: string;
  actionLabel: string;
  clubs: AccountClub[];
  loading: boolean;
  filtered: boolean;
  activeClubId: string | null;
  switchingClubId: string | null;
  deletingAccessKey: string | null;
  slotLabel?: string;
  onAction: () => void;
  onOpenClub: (club: AccountClub) => void;
  onDeleteClub?: (club: AccountClub) => void;
}) {
  return (
    <Panel as="section" id={ownerMode ? "owned-clubs" : "assigned-clubs"} className="p-5">
      <PanelHeader
        eyebrow={
          <span className="inline-flex items-center gap-1.5 [&>svg]:h-3.5 [&>svg]:w-3.5">
            {ownerMode ? <Crown /> : <Users />}
            {ownerMode ? "Proprietà" : "Accessi"}
          </span>
        }
        title={
          <span className="inline-flex items-baseline gap-2">
            {title}
            <span className="egw-num font-brand text-[12px] font-bold text-egw-ink-62" aria-label={`${clubs.length} club`}>
              {formatInteger(clubs.length)}
            </span>
          </span>
        }
        description={
          <>
            {description}
            {slotLabel ? <span className="egw-num mt-1 block text-egw-ink-42">{slotLabel}</span> : null}
          </>
        }
        actions={
          <Button variant="secondary" size="sm" icon={<Plus />} onClick={onAction}>
            {actionLabel}
          </Button>
        }
      />

      {loading ? (
        <PanelSkeleton />
      ) : clubs.length ? (
        <ul className="flex flex-col gap-2">
          {clubs.map((club) => (
            <ClubRow
              key={club.accessKey || `${club.id}:${club.role}`}
              club={club}
              ownerMode={ownerMode}
              isActive={activeClubId === club.id}
              isSwitching={switchingClubId === club.id}
              isDeleting={deletingAccessKey === (club.accessKey || club.membershipId)}
              onOpen={() => onOpenClub(club)}
              onDelete={!ownerMode && onDeleteClub ? () => onDeleteClub(club) : undefined}
            />
          ))}
        </ul>
      ) : (
        <PanelEmptyState ownerMode={ownerMode} filtered={filtered} onAction={onAction} />
      )}
    </Panel>
  );
}

/* ── Schermata ─────────────────────────────────────────────────────────── */

export default function AccountHomeScreen() {
  const router = useRouter();
  const { showToast } = useToast();
  const { user, loading, activeClub, setActiveClub, signOut } = useAuth();

  const [savingProfile, setSavingProfile] = React.useState(false);
  const [creatingClub, setCreatingClub] = React.useState(false);
  const [redeemingAccess, setRedeemingAccess] = React.useState(false);
  const [switchingClubId, setSwitchingClubId] = React.useState<string | null>(null);
  const [deletingAccessKey, setDeletingAccessKey] = React.useState<string | null>(null);
  const [deletingClub, setDeletingClub] = React.useState<AccountClub | null>(null);

  const [profileOpen, setProfileOpen] = React.useState(false);
  const [createClubOpen, setCreateClubOpen] = React.useState(false);
  const [redeemAccessOpen, setRedeemAccessOpen] = React.useState(false);

  const [profileForm, setProfileForm] = React.useState<ProfileFormState>(createProfileDefaults(null));
  const [profileInitial, setProfileInitial] = React.useState<ProfileFormState>(createProfileDefaults(null));
  const [profileErrors, setProfileErrors] = React.useState<ProfileValidation[]>([]);
  const [createClubForm, setCreateClubForm] = React.useState<ClubCreateFormState>(createClubDefaults(null));
  const [createClubDirty, setCreateClubDirty] = React.useState(false);
  const [createClubTab, setCreateClubTab] = React.useState<CreateClubSection>("general");
  const [createClubMissing, setCreateClubMissing] = React.useState<typeof CREATE_CLUB_REQUIRED_FIELDS[number][]>([]);
  const [accessToken, setAccessToken] = React.useState("");
  const [query, setQuery] = React.useState("");

  const [ownedClubs, setOwnedClubs] = React.useState<AccountClub[]>([]);
  const [accessClubs, setAccessClubs] = React.useState<AccountClub[]>([]);
  const [membershipsStatus, setMembershipsStatus] = React.useState<"loading" | "error" | "loaded">("loading");
  const [membershipsError, setMembershipsError] = React.useState<string | null>(null);
  const [hasLoadedMemberships, setHasLoadedMemberships] = React.useState(false);
  const [membershipsLoading, setMembershipsLoading] = React.useState(false);

  const clubSlotLimit = React.useMemo(() => {
    const rawLimit = Number(user?.user_metadata?.clubSlotLimit);
    return Number.isFinite(rawLimit) && rawLimit > 0 ? rawLimit : null;
  }, [user?.user_metadata?.clubSlotLimit]);

  const activeClubId = activeClub?.id || null;
  const availableClubSlots = clubSlotLimit === null ? null : Math.max(clubSlotLimit - ownedClubs.length, 0);
  const [verificatoOra, setVerificatoOra] = React.useState<Array<"email" | "phone">>([]);
  const emailVerified = Boolean(user?.user_metadata?.emailVerified) || verificatoOra.includes("email");
  const phoneVerified = Boolean(user?.user_metadata?.phoneVerified) || verificatoOra.includes("phone");

  /*
    **La verifica si completa qui, non altrove.** `/token-verification/<id>`
    riscatta il gettone di accesso a un club e non sa niente di OTP: il codice
    si scrive dentro l'avviso stesso, e `emailVerified`/`phoneVerified`
    vengono dal server al caricamento successivo.
  */
  const [verificationSending, setVerificationSending] = React.useState<"email" | "phone" | null>(null);
  const [verificationOpen, setVerificationOpen] = React.useState<"email" | "phone" | null>(null);

  /**
   * **Chi non ha una password non deve restare fuori dai propri recapiti.**
   * Chi si e registrato solo con Google o Microsoft, e chi ha subito uno
   * sfratto (ADR-0134), si scontra con `CURRENT_PASSWORD_REQUIRED`: la via
   * d'uscita e il recupero password, che manda un link all'indirizzo
   * dell'account. Qui c'e solo il pulsante che la rende raggiungibile.
   */
  const [sendingPasswordLink, setSendingPasswordLink] = React.useState(false);

  const requestPasswordLink = async () => {
    const indirizzo = String(user?.email || "").trim();
    if (!indirizzo || sendingPasswordLink) return;
    setSendingPasswordLink(true);

    const response = await apiRequest<{ sent: boolean }>("/api/v1/auth/password/forgot", { method: "POST", body: { email: indirizzo } });

    setSendingPasswordLink(false);

    /* La rotta risponde sempre allo stesso modo (anti-enumeration): si dice cosa succedera. */
    showToast(response.error ? "error" : "success", response.error ? response.error.message || "Invio non riuscito" : `Se serve, ti abbiamo scritto a ${indirizzo}: apri il link per impostare una password.`);
  };

  const requestVerificationCode = async (channel: "email" | "phone") => {
    if (!user?.id || verificationSending) return;
    setVerificationSending(channel);

    const response = await apiRequest<{ sent: boolean }>(`/api/v1/auth/verify/${channel}/send`, { method: "POST", body: { userId: user.id } });

    setVerificationSending(null);

    if (response.error) {
      showToast("error", response.error.message || "Invio non riuscito");
      /* Anche sul cooldown la casella si apre: il codice precedente e ancora buono. */
      if (response.error.code !== "RESEND_TOO_SOON") return;
    } else {
      showToast("success", channel === "email" ? "Ti abbiamo inviato un codice via email." : "Ti abbiamo inviato un codice via SMS.");
    }

    setVerificationOpen(channel);
  };

  const confirmVerificationCode = async (channel: "email" | "phone", code: string) => {
    if (!user?.id) return;
    setVerificationSending(channel);

    const response = await apiRequest<{ user: unknown }>(`/api/v1/auth/verify/${channel}/confirm`, { method: "POST", body: { userId: user.id, code } });

    setVerificationSending(null);

    if (response.error) {
      showToast("error", response.error.message || "Codice non valido");
      return;
    }

    setVerificationOpen(null);
    /* Il segno locale vale finche la pagina resta aperta; poi decide il server. */
    setVerificatoOra((precedente) => [...precedente, channel]);
    showToast("success", channel === "email" ? "Email verificata" : "Telefono verificato");
  };

  const accountDisplayName = [profileForm.firstName, profileForm.lastName].filter(Boolean).join(" ") || user?.user_metadata?.name || user?.email || "Utente EasyGame";

  const syncActiveClubLocally = (club: AccountClub) => {
    const isSelectedAccess = (item: AccountClub) => (club.accessKey ? item.accessKey === club.accessKey : item.id === club.id && item.role === club.role);
    const nextActiveClub = {
      id: club.id,
      role: club.role,
      roleLabel: club.roleLabel,
      name: club.name,
      logo_url: club.logoUrl || null,
      email: club.contactEmail || null,
      phone: club.contactPhone || null,
      membershipId: club.membershipId || null,
      accessKind: club.accessKind || "membership",
      accessKey: club.accessKey || null,
      activeSeasonId: club.activeSeasonId || null,
      activeSeasonLabel: club.activeSeasonLabel || null,
      linkedAthleteId: club.linkedAthleteId || null,
      linkedAthleteIds: club.linkedAthleteIds || [],
      redirectPath: club.redirectPath || null,
    };

    if (typeof window !== "undefined") {
      window.localStorage.setItem("activeClub", JSON.stringify(nextActiveClub));
      if (user?.id) {
        window.localStorage.setItem(`activeClub_${user.id}`, JSON.stringify(nextActiveClub));
      }
    }

    setOwnedClubs((current) => sortClubs(current.map((item) => ({ ...item, isPrimary: isSelectedAccess(item) }))));
    setAccessClubs((current) => sortClubs(current.map((item) => ({ ...item, isPrimary: isSelectedAccess(item) }))));
    setActiveClub(nextActiveClub);
  };

  const loadMemberships = async (silent = false) => {
    if (!user?.id) {
      setOwnedClubs([]);
      setAccessClubs([]);
      setHasLoadedMemberships(false);
      setMembershipsStatus("loading");
      setMembershipsLoading(false);
      return;
    }

    setMembershipsLoading(true);
    if (!hasLoadedMemberships && !silent) {
      setMembershipsStatus("loading");
    }
    setMembershipsError(null);

    try {
      const response = await fetchMemberships<MembershipRecord>(user.id);
      const result = classifyMembershipResponse(response);

      if (result.kind === "aborted" || result.kind === "unauthorized") {
        return;
      }

      if (result.kind === "error") {
        showToast("error", result.message);
        // Un errore temporaneo non equivale ad avere zero club: si tengono i
        // dati gia caricati e si distingue "error" da "loaded-empty".
        setMembershipsError(result.message);
        setMembershipsStatus("error");
        return;
      }

      const mappedClubs = sortClubs(result.memberships.map((membership) => mapMembershipToClub(membership, user.id)));

      setOwnedClubs(mappedClubs.filter((club) => club.accessKind === "ownership").map(({ ownerId, ...club }) => club));
      setAccessClubs(
        mappedClubs
          .filter((club) => club.accessKind !== "ownership" && !(club.role === "owner" && club.ownerId === user.id))
          .map(({ ownerId, ...club }) => club),
      );

      setMembershipsStatus("loaded");
      setHasLoadedMemberships(true);
    } finally {
      setMembershipsLoading(false);
    }
  };

  React.useEffect(() => {
    if (loading) return;

    if (!user?.id) {
      router.replace("/login");
      return;
    }

    const defaults = createProfileDefaults(user);
    setProfileForm(defaults);
    setProfileInitial(defaults);
    setCreateClubForm(createClubDefaults(user));
  }, [loading, router, user]);

  React.useEffect(() => {
    // Si attende la validazione della sessione lato server: senza, partirebbe
    // una richiesta protetta basata solo sulla cache.
    if (loading || !user?.id) return;
    void loadMemberships();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, user?.id]);

  React.useEffect(() => {
    if (typeof window === "undefined") return;

    const params = new URLSearchParams(window.location.search);
    if (params.get("openCreateClub") === "1") {
      setCreateClubOpen(true);
      window.history.replaceState({}, "", "/account");
    }
    /*
      **«Profilo» apre il profilo, non una pagina da cui cercarlo** (PP-01 §J):
      il parametro apre direttamente il cassetto invece di lasciare la persona
      davanti all'elenco dei club a cercarlo in un menu.
    */
    if (params.get("profile") === "1") {
      setProfileOpen(true);
      window.history.replaceState({}, "", "/account");
    }
  }, []);

  const updateProfileField = (field: keyof ProfileFormState, value: string) => {
    setProfileForm((current) => ({ ...current, [field]: value }));
    if (profileErrors.length) setProfileErrors([]);
  };

  const updateClubField = (field: keyof ClubCreateFormState, value: any) => {
    setCreateClubForm((current) => ({ ...current, [field]: value }));
    setCreateClubDirty(true);
    if (createClubMissing.length) setCreateClubMissing([]);
  };

  const updateFederation = (federationId: string, field: "name" | "registrationNumber" | "affiliationDate", value: string) => {
    setCreateClubForm((current) => ({
      ...current,
      federations: current.federations.map((item) => (item.id === federationId ? { ...item, [field]: value } : item)),
    }));
    setCreateClubDirty(true);
  };

  const addFederation = () => {
    setCreateClubForm((current) => ({
      ...current,
      federations: [
        ...current.federations,
        {
          id: `fed-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          name: "",
          registrationNumber: "",
          affiliationDate: "",
        },
      ],
    }));
    setCreateClubDirty(true);
  };

  const removeFederation = (federationId: string) => {
    setCreateClubForm((current) => ({
      ...current,
      federations: current.federations.filter((item) => item.id !== federationId),
    }));
    setCreateClubDirty(true);
  };

  const persistActiveClub = async (club: AccountClub) => {
    setSwitchingClubId(club.id);

    const response = await apiRequest<MembershipRecord>("/api/v1/auth/memberships/activate", {
      method: "POST",
      body: {
        organization_id: club.id,
        role: club.role,
        membership_id: club.accessKind === "ownership" ? undefined : club.membershipId || undefined,
        access_kind: club.accessKind || "membership",
      },
    });

    if (response.error) {
      setSwitchingClubId(null);
      throw new Error(response.error.message || "Impossibile impostare il club attivo");
    }

    const activatedRole = String(response.data?.resolved_role || response.data?.role || club.role);
    const activatedClub: AccountClub = {
      ...club,
      role: activatedRole,
      roleLabel: getAccessRoleLabel(activatedRole),
      linkedAthleteId: response.data?.linked_athlete_id || null,
      linkedAthleteIds: response.data?.linked_athlete_ids || [],
      redirectPath: response.data?.redirect_path || null,
    };

    syncActiveClubLocally(activatedClub);
    setSwitchingClubId(null);

    return { ...response.data, activatedClub };
  };

  const openClubArea = async (club: AccountClub) => {
    try {
      const activatedAccess = await persistActiveClub(club);
      const redirectPath = getAccessRedirectPath(activatedAccess?.resolved_role || activatedAccess?.role || club.role, {
        organizationId: club.id,
        linkedAthleteId: activatedAccess?.linked_athlete_id,
        linkedAthleteIds: activatedAccess?.linked_athlete_ids,
      });

      if (redirectPath === "/account") {
        showToast("error", "Accesso attivato, ma il profilo collegato non è disponibile");
        return;
      }

      router.push(redirectPath);
    } catch (error: any) {
      showToast("error", error?.message || "Errore cambio club attivo");
    }
  };

  const saveProfile = async () => {
    const errors = validateProfileForm(profileForm, user);
    setProfileErrors(errors);
    if (errors.length) {
      showToast("error", errors[0].message);
      return;
    }

    setSavingProfile(true);

    const emailChanged = profileEmailChanged(profileForm, user);
    const phoneChanged = profilePhoneChanged(profileForm, user);
    /* La password attuale si manda **solo** quando cambia un fattore. */
    const richiedePassword = profileNeedsCurrentPassword(profileForm, user);

    const response = await supabase.auth.updateUser({
      email: profileForm.email.trim().toLowerCase(),
      password: profileForm.newPassword.trim() || undefined,
      currentPassword: richiedePassword ? profileForm.currentPassword : undefined,
      data: {
        firstName: profileForm.firstName.trim(),
        lastName: profileForm.lastName.trim(),
        phone: profileForm.phone.trim(),
        avatarUrl: profileForm.avatarUrl || null,
      },
    });

    if (response.error) {
      showToast("error", response.error.message || "Errore aggiornamento profilo");
      setSavingProfile(false);
      return;
    }

    const saved: ProfileFormState = { ...profileForm, currentPassword: "", newPassword: "", confirmPassword: "" };
    setProfileForm(saved);
    setProfileInitial(saved);
    setSavingProfile(false);
    setProfileOpen(false);

    if (emailChanged || phoneChanged) {
      showToast("success", "Profilo aggiornato. Email e telefono richiederanno una nuova verifica.");
    } else {
      showToast("success", "Profilo aggiornato correttamente");
    }
  };

  const createOwnedClub = async () => {
    if (!user?.id) return;

    if (clubSlotLimit !== null && ownedClubs.length >= clubSlotLimit) {
      showToast("error", "Hai esaurito gli slot disponibili per i club");
      return;
    }

    /*
      Due dei sette obbligatori — email e telefono di contatto — vivono nella
      sezione «Contatti»: la mancanza porta alla sezione che la contiene, e il
      messaggio dice **solo** cio che manca davvero.
    */
    const missing = CREATE_CLUB_REQUIRED_FIELDS.filter((entry) => !String(createClubForm[entry.field] || "").trim());

    if (missing.length > 0) {
      setCreateClubMissing(missing);
      setCreateClubTab(missing[0].tab);
      showToast("error", missing.length === 1 ? `Manca ancora un dato obbligatorio: ${missing[0].label}.` : `Mancano ancora ${missing.length} dati obbligatori: ${missing.map((entry) => entry.label).join(", ")}.`);
      return;
    }

    setCreatingClub(true);

    const shouldBePrimary = ownedClubs.length === 0 && accessClubs.length === 0;
    const response = await apiRequest<any>("/api/v1/clubs", {
      method: "POST",
      body: {
        mode: "create",
        data: buildClubPayload(createClubForm, user, shouldBePrimary),
      },
    });

    if (response.error) {
      showToast("error", response.error.message || "Errore creazione club");
      setCreatingClub(false);
      return;
    }

    const createdClub = response.data;
    const createdSummary: AccountClub = {
      id: createdClub.id,
      name: createdClub.name || createClubForm.name.trim(),
      role: "owner",
      roleLabel: "Proprietario",
      isPrimary: shouldBePrimary,
      logoUrl: createdClub.logo_url || createClubForm.logoUrl || null,
      city: createdClub.city || createClubForm.city || null,
      province: createdClub.province || createClubForm.province || null,
      contactEmail: createdClub.contact_email || createClubForm.contactEmail || null,
      contactPhone: createdClub.contact_phone || createClubForm.contactPhone || null,
      createdAt: createdClub.created_at || null,
      ownerId: user.id,
      accessKind: "ownership",
      accessKey: `ownership:${createdClub.id}`,
    };

    // Il club appena creato diventa quello aperto: la configurazione iniziale
    // lavora sul club attivo, e non avrebbe senso proporla su un altro.
    syncActiveClubLocally(createdSummary);

    await loadMemberships(true);
    setCreateClubForm(createClubDefaults(user));
    setCreateClubDirty(false);
    setCreateClubTab("general");
    setCreateClubOpen(false);
    setCreatingClub(false);
    showToast("success", `Club ${createdSummary.name} creato. Ti accompagniamo nella configurazione iniziale.`);
    router.push("/onboarding");
  };

  const redeemClubAccess = async () => {
    if (!accessToken.trim()) {
      showToast("error", "Inserisci il token condiviso dal club");
      return;
    }

    setRedeemingAccess(true);

    const response = await apiRequest<{ membership: MembershipRecord }>("/api/v1/auth/access/redeem", { method: "POST", body: { token: accessToken } });

    if (response.error) {
      showToast("error", response.error.message || "Errore collegamento al club");
      setRedeemingAccess(false);
      return;
    }

    const membership = response.data?.membership;
    if (membership) {
      const club = mapMembershipToClub(membership, user?.id);
      if (club.isPrimary || !activeClubId) {
        syncActiveClubLocally(club);
      }
    }

    await loadMemberships(true);
    setAccessToken("");
    setRedeemAccessOpen(false);
    setRedeemingAccess(false);
    showToast("success", "Accesso aggiunto correttamente al tuo account");
  };

  const requestDeleteAccess = (club: AccountClub) => {
    if (!club.membershipId) {
      showToast("error", "Accesso assegnato non valido");
      return;
    }
    setDeletingClub(club);
  };

  const deleteAssignedAccess = async () => {
    const club = deletingClub;
    if (!club?.membershipId) return;

    const accessKey = club.accessKey || club.membershipId;
    setDeletingAccessKey(accessKey);

    const response = await apiRequest<{ deletedMembershipId: string; unlinkedProfilesCount: number }>("/api/v1/auth/memberships/delete", {
      method: "POST",
      body: {
        membership_id: club.membershipId,
        organization_id: club.id,
        role: club.role,
      },
    });

    if (response.error) {
      showToast("error", response.error.message || "Errore eliminazione accesso");
      setDeletingAccessKey(null);
      return;
    }

    setDeletingClub(null);

    const activeAccessMatches = activeClub?.membershipId === club.membershipId || activeClub?.accessKey === club.accessKey;
    if (activeAccessMatches && user?.id) {
      window.localStorage.removeItem("activeClub");
      window.localStorage.removeItem(`activeClub_${user.id}`);
      setActiveClub(null);
    }

    await loadMemberships(true);
    setDeletingAccessKey(null);
    showToast("success", "Accesso eliminato e profilo scollegato");
  };

  const handleSupport = () => {
    window.open(SUPPORT_URL, "_blank", "noopener,noreferrer");
  };

  const panelsLoading = loading || membershipsStatus === "loading";
  const totalClubs = ownedClubs.length + accessClubs.length;
  const showSearch = !panelsLoading && totalClubs >= SEARCH_THRESHOLD;
  const filteredOwnedClubs = ownedClubs.filter((club) => matchesQuery(club, query));
  const filteredAccessClubs = accessClubs.filter((club) => matchesQuery(club, query));
  const firstName = getAccountFirstName(accountDisplayName);
  const blockingError = membershipsStatus === "error" && !hasLoadedMemberships;
  const profileDirty = profileFormDirty(profileForm, profileInitial);

  return (
    <SkyProvider>
    <div className="egw-sky-full relative min-h-[100dvh] overflow-x-hidden font-brand">
      <Image src={iconWhite} alt="" aria-hidden className="pointer-events-none absolute -right-24 top-24 h-[520px] w-[520px] select-none object-contain opacity-[0.05]" />

      {/* Ambiente 3: sul cielo il marchio bianco e i controlli in vetro chiaro (§6.3). */}
      <header className="relative">
        <div className="mx-auto flex w-full max-w-5xl items-center gap-3 px-4 py-4 md:px-6">
          <Link href="/account" aria-label="EasyGame" className="rounded-egw-chip focus-visible:outline-none focus-visible:shadow-egw-focus-dark">
            <Image src={logoWhite} alt="EasyGame" width={168} height={40} className="h-auto w-[132px] object-contain sm:w-[168px]" priority />
          </Link>

          <div className="ml-auto flex items-center gap-2">
            <Button variant="ghost-on-sky" size="sm" icon={<CircleHelp />} className="hidden sm:inline-flex" onClick={handleSupport}>
              Assistenza
            </Button>

            <Menu>
              <MenuTrigger asChild>
                <button
                  type="button"
                  aria-label="Menu account"
                  className="flex h-[38px] items-center gap-2 rounded-egw-control border border-white/26 bg-white/14 pl-1.5 pr-2.5 text-white transition-colors duration-hover hover:bg-white/22 focus-visible:outline-none focus-visible:shadow-[var(--egw-focus-ring-dark)]"
                >
                  <Avatar src={profileForm.avatarUrl || null} name={accountDisplayName} size={27} />
                  <span className="hidden max-w-[120px] truncate text-[12px] font-bold sm:inline">{firstName}</span>
                  <ChevronDown className="h-3 w-3 opacity-80" aria-hidden />
                </button>
              </MenuTrigger>
              <MenuContent width={262}>
                <div className="flex items-center gap-2.5 px-2.5 py-2">
                  <Avatar src={profileForm.avatarUrl || null} name={accountDisplayName} size={38} />
                  <div className="min-w-0">
                    <p className="egw-ellipsis text-[13px] font-bold text-egw-ink">{accountDisplayName}</p>
                    <p className="egw-ellipsis text-[10.5px] text-[rgba(11,26,58,.55)]">{profileForm.email}</p>
                  </div>
                </div>
                <MenuSeparator />
                <MenuItem onSelect={() => setProfileOpen(true)}>
                  <UserCircle2 />
                  Profilo account
                </MenuItem>
                <MenuItem onSelect={handleSupport} tone="muted">
                  <CircleHelp />
                  Assistenza
                </MenuItem>
                <MenuSeparator />
                <MenuItem
                  tone="danger"
                  onSelect={() => {
                    void signOut();
                  }}
                >
                  <LogOut />
                  Esci dall&apos;account
                </MenuItem>
              </MenuContent>
            </Menu>
          </div>
        </div>
      </header>

      <main className="relative mx-auto flex w-full max-w-5xl flex-col gap-[18px] px-4 pb-12 pt-4 md:px-6">
        <PageHeader
          onSky
          eyebrow="Home account"
          title={`Ciao, ${firstName}`}
          description="Da qui entri nei club che possiedi e in quelli dove ti hanno assegnato un accesso. Ogni club porta con sé il suo ruolo e la sua stagione attiva."
          actions={
            <>
              <Button variant="ghost-on-sky" icon={<UserPlus />} onClick={() => setRedeemAccessOpen(true)}>
                Aggiungi accesso
              </Button>
              <Button variant="inverted-on-sky" icon={<Plus />} onClick={() => setCreateClubOpen(true)}>
                Crea club
              </Button>
            </>
          }
        />

        {/*
          **Gli avvisi di verifica dei recapiti (PP-05).** Il telefono sta sopra
          perche e l'unico che **blocca** (ADR-0132); l'email non impedisce
          niente e puo aspettare.
        */}
        {!phoneVerified ? (
          <VerificationNotice
            tone="warning"
            title="Telefono non verificato"
            description="Finché non verifichi il numero non potrai rientrare al prossimo accesso."
            ctaLabel="Verifica telefono"
            pending={verificationSending === "phone"}
            open={verificationOpen === "phone"}
            onAction={() => {
              void requestVerificationCode("phone");
            }}
            onResend={() => {
              void requestVerificationCode("phone");
            }}
            onConfirm={(code) => {
              void confirmVerificationCode("phone", code);
            }}
          />
        ) : null}

        {!emailVerified ? (
          <VerificationNotice
            tone="info"
            title="Email non verificata"
            description={`Non abbiamo ancora confermato ${profileForm.email || "il tuo indirizzo"}. Puoi usare EasyGame lo stesso, ma un indirizzo non verificato non vale come prova della tua identità.`}
            ctaLabel="Verifica email"
            pending={verificationSending === "email"}
            open={verificationOpen === "email"}
            onAction={() => {
              void requestVerificationCode("email");
            }}
            onResend={() => {
              void requestVerificationCode("email");
            }}
            onConfirm={(code) => {
              void confirmVerificationCode("email", code);
            }}
          />
        ) : null}

        {/*
          **La via d'uscita per chi non conosce nessuna password.** Sta accanto
          agli avvisi e non dentro il modulo del profilo, perche chi ne ha
          bisogno non arriva dal profilo. Compare sempre: dal client non si puo
          sapere se una password esista, e chiederlo al server la pubblicherebbe.
        */}
        <p className="text-[12px] leading-[1.5] text-white/80">
          Non conosci nessuna password di questo account — per esempio perché accedi con Google o Microsoft?{" "}
          <button
            type="button"
            className="rounded-egw-chip font-semibold text-white underline underline-offset-2 focus-visible:outline-none focus-visible:shadow-[var(--egw-focus-ring-dark)] disabled:opacity-60"
            disabled={sendingPasswordLink}
            onClick={() => {
              void requestPasswordLink();
            }}
          >
            Ricevi un link per impostarla
          </button>
          . Serve per cambiare email o cellulare.
        </p>

        {membershipsStatus === "error" && hasLoadedMemberships ? (
          <AlertBlock
            severity="danger"
            role="alert"
            title="Aggiornamento dei club non riuscito."
            actions={
              <Button variant="secondary" size="sm" icon={<RotateCw />} loading={membershipsLoading} onClick={() => void loadMemberships(true)}>
                Riprova
              </Button>
            }
          >
            {membershipsError || "I dati mostrati potrebbero non essere aggiornati."}
          </AlertBlock>
        ) : null}

        {blockingError ? (
          <EmptyStateCard
            icon={<RotateCw />}
            iconTone="red"
            title="Non riusciamo a caricare i tuoi club"
            description={membershipsError || "Si è verificato un errore durante il caricamento. Nessun dato è stato modificato."}
            primary={
              <Button variant="neutral" icon={<RotateCw />} loading={membershipsLoading} onClick={() => void loadMemberships()}>
                Riprova
              </Button>
            }
          />
        ) : (
          <>
            {showSearch ? (
              <TextInput
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Cerca per nome, città o ruolo"
                aria-label="Cerca fra i tuoi club"
                leading={<Search />}
                wrapperClassName="max-w-md"
              />
            ) : null}

            <div className="grid grid-cols-1 gap-[18px] xl:grid-cols-2">
              <AccessPanel
                ownerMode
                title="Club di proprietà"
                description="I club che hai creato e amministri come proprietario."
                actionLabel="Crea club"
                clubs={filteredOwnedClubs}
                loading={panelsLoading}
                filtered={Boolean(query) && ownedClubs.length > 0}
                activeClubId={activeClubId}
                switchingClubId={switchingClubId}
                deletingAccessKey={deletingAccessKey}
                slotLabel={clubSlotLimit === null ? undefined : `${availableClubSlots} slot disponibili su ${clubSlotLimit}`}
                onAction={() => setCreateClubOpen(true)}
                onOpenClub={(club) => {
                  void openClubArea(club);
                }}
              />

              <AccessPanel
                ownerMode={false}
                title="Accessi assegnati"
                description="I club dove qualcun altro ti ha dato un ruolo."
                actionLabel="Aggiungi accesso"
                clubs={filteredAccessClubs}
                loading={panelsLoading}
                filtered={Boolean(query) && accessClubs.length > 0}
                activeClubId={activeClubId}
                switchingClubId={switchingClubId}
                deletingAccessKey={deletingAccessKey}
                onAction={() => setRedeemAccessOpen(true)}
                onOpenClub={(club) => {
                  void openClubArea(club);
                }}
                onDeleteClub={requestDeleteAccess}
              />
            </div>
          </>
        )}
      </main>

      <AccountProfileDrawer
        open={profileOpen}
        onOpenChange={(open) => {
          setProfileOpen(open);
          if (!open) {
            setProfileForm(profileInitial);
            setProfileErrors([]);
          }
        }}
        form={profileForm}
        dirty={profileDirty}
        errors={profileErrors}
        accountDisplayName={accountDisplayName}
        activeClubName={activeClub?.name || null}
        emailVerified={emailVerified}
        phoneVerified={phoneVerified}
        saving={savingProfile}
        userRole={user?.user_metadata?.role || "user"}
        onChange={updateProfileField}
        onSubmit={() => void saveProfile()}
      />

      <AccountCreateClubDrawer
        open={createClubOpen}
        onOpenChange={(open) => {
          setCreateClubOpen(open);
          if (!open) setCreateClubMissing([]);
        }}
        form={createClubForm}
        dirty={createClubDirty}
        section={createClubTab}
        creating={creatingClub}
        availableClubSlots={availableClubSlots}
        clubSlotLimit={clubSlotLimit}
        ownedClubCount={ownedClubs.length}
        missing={createClubMissing}
        onSectionChange={setCreateClubTab}
        onFieldChange={updateClubField}
        onFederationChange={updateFederation}
        onFederationAdd={addFederation}
        onFederationRemove={removeFederation}
        onSubmit={() => void createOwnedClub()}
      />

      <AccountRedeemAccessDrawer
        open={redeemAccessOpen}
        onOpenChange={setRedeemAccessOpen}
        value={accessToken}
        loading={redeemingAccess}
        onValueChange={setAccessToken}
        onSubmit={() => void redeemClubAccess()}
      />

      <DangerConfirmDialog
        open={Boolean(deletingClub)}
        onOpenChange={(open) => !open && !deletingAccessKey && setDeletingClub(null)}
        title={`Eliminare l'accesso ${deletingClub?.roleLabel.toLowerCase() ?? ""} a ${deletingClub?.name ?? ""}?`}
        description="Il profilo collegato verrà scollegato dal tuo account, ma non verrà eliminato dal club."
        consequences={[`Il ruolo «${deletingClub?.roleLabel ?? ""}» in ${deletingClub?.name ?? "questo club"}`, "Il collegamento fra il tuo account e le schede di quel club"]}
        irreversible={false}
        confirmLabel="Elimina accesso"
        onConfirm={deleteAssignedAccess}
        loading={Boolean(deletingAccessKey)}
      />
    </div>
    </SkyProvider>
  );
}
