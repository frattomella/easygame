"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/components/providers/AuthProvider";
import { useToast } from "@/components/ui/toast-notification";
import { apiRequest } from "@/lib/api/client";
import { fetchMemberships } from "@/lib/auth/memberships-client";
import { classifyMembershipResponse } from "@/lib/auth/membership-load-result";
import { getAccessRedirectPath, getAccessRoleLabel } from "@/lib/access-roles";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import {
  Building2,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Crown,
  Loader2,
  LogOut,
  Plus,
  RotateCw,
  Search,
  Trash2,
  TriangleAlert,
  UserCircle2,
  UserPlus,
  Users,
} from "lucide-react";
import { AccountCreateClubDialog } from "./account-create-club-dialog";
import { AccountProfileDialog } from "./account-profile-dialog";
import { AccountRedeemAccessDialog } from "./account-redeem-access-dialog";
import {
  AccountClub,
  buildClubPayload,
  ClubCreateFormState,
  CREATE_CLUB_REQUIRED_FIELDS,
  createClubDefaults,
  createProfileDefaults,
  getInitials,
  mapMembershipToClub,
  MembershipRecord,
  ProfileFormState,
  sortClubs,
} from "./account-shared";
import { EasyGameLogo } from "@/components/brand/easygame-logo";

/**
 * Home account: la porta d'ingresso a tutti i club di una persona.
 *
 * Rifatta con l'identita introdotta dal Blocco 3 (marchio SVG, `font-display`,
 * palette slate, cifre tabellari). La versione precedente viveva su una
 * tavolozza tutta sua, scritta in esadecimale dentro le classi: nessuno degli
 * altri schermi la usava, e ogni modifica al tema non la raggiungeva.
 *
 * Le tre cose che questa pagina deve fare bene:
 *
 * 1. **far scegliere in fretta** — con molti accessi serve un filtro, il ruolo
 *    va letto a colpo d'occhio e il club aperto per ultimo va riconosciuto;
 * 2. **dire la verita mentre carica** — lo scheletro ha la forma del
 *    contenuto, non e uno spinner a tutta pagina; un errore di rete non viene
 *    mostrato come "nessun club";
 * 3. **stare in 375 px** — le righe si impilano, i comandi restano da dito.
 */

const ACCOUNT_HERO_IMAGE = "/images/account/account-hero.png";

/** Oltre questa soglia cercare e piu veloce che scorrere. */
const SEARCH_THRESHOLD = 5;

const getAccountFirstName = (displayName: string) =>
  displayName.split(" ").filter(Boolean)[0] || "EasyGamer";

const matchesQuery = (club: AccountClub, query: string) => {
  if (!query) return true;
  const needle = query.trim().toLowerCase();
  return [club.name, club.city, club.province, club.roleLabel]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes(needle));
};

// --- pezzi di interfaccia ----------------------------------------------------

function ClubAvatar({ club }: { club: AccountClub }) {
  return (
    <span className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-xl border border-slate-200 bg-white">
      {club.logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- logo caricato dal club, spesso una data URL
        <img
          src={club.logoUrl}
          alt=""
          className="h-full w-full object-contain p-1"
        />
      ) : (
        <span className="font-display text-sm font-semibold text-slate-500">
          {getInitials(club.name)}
        </span>
      )}
    </span>
  );
}

function RoleBadge({ ownerMode, label }: { ownerMode: boolean; label: string }) {
  return (
    <span
      className={cn(
        "inline-flex w-fit items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium",
        // L'ambra qui dice "sei tu il proprietario", non "stagione": da quando
        // il token della stagione e grigio (Blocco 7) va scritto per esteso.
        ownerMode
          ? "bg-amber-50 text-amber-700"
          : "bg-[var(--eg-blue-soft)] text-[var(--eg-blue)]",
      )}
    >
      {ownerMode ? (
        <Crown className="h-3 w-3" aria-hidden />
      ) : (
        <Users className="h-3 w-3" aria-hidden />
      )}
      {ownerMode ? "Proprieta" : label}
    </span>
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
  const place = [club.city, club.province].filter(Boolean).join(", ");

  return (
    <li className="flex items-stretch gap-1 rounded-xl border border-slate-200 bg-white transition-colors hover:border-blue-300">
      <button
        type="button"
        onClick={onOpen}
        disabled={isSwitching}
        className="flex min-w-0 flex-1 items-center gap-3 rounded-xl p-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
      >
        <ClubAvatar club={club} />

        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="truncate font-display font-semibold tracking-tight text-slate-900">
              {club.name}
            </span>
            {isActive ? (
              <span className="eg-eyebrow-sm rounded bg-slate-900 px-1.5 py-0.5 leading-none text-white">
                Aperto
              </span>
            ) : null}
          </span>

          <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
            <RoleBadge ownerMode={ownerMode} label={club.roleLabel} />
            {place ? (
              <span className="truncate text-xs text-slate-500">{place}</span>
            ) : null}
            {club.activeSeasonLabel ? (
              <span className="eg-tabular text-xs text-[var(--eg-season)]">
                {club.activeSeasonLabel}
              </span>
            ) : null}
          </span>
        </span>

        <span className="grid h-8 w-8 shrink-0 place-items-center text-slate-400">
          {isSwitching ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <ChevronRight className="h-5 w-5" aria-hidden />
          )}
        </span>
      </button>

      {!ownerMode && onDelete ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="my-2 mr-2 h-10 w-10 shrink-0 self-center text-slate-400 hover:bg-red-50 hover:text-red-600"
          disabled={isDeleting}
          onClick={onDelete}
          aria-label={`Elimina l'accesso ${club.roleLabel} a ${club.name}`}
        >
          {isDeleting ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <Trash2 className="h-4 w-4" aria-hidden />
          )}
        </Button>
      ) : null}
    </li>
  );
}

function PanelSkeleton() {
  return (
    <ul className="space-y-2" aria-hidden>
      {[0, 1, 2].map((index) => (
        <li
          key={`skeleton-${index}`}
          className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3"
        >
          <span className="h-12 w-12 shrink-0 animate-pulse rounded-xl bg-slate-100" />
          <span className="flex-1 space-y-2">
            <span className="block h-3.5 w-2/5 animate-pulse rounded bg-slate-100" />
            <span className="block h-3 w-1/4 animate-pulse rounded bg-slate-100" />
          </span>
        </li>
      ))}
    </ul>
  );
}

function PanelEmptyState({
  ownerMode,
  filtered,
  onAction,
}: {
  ownerMode: boolean;
  filtered: boolean;
  onAction: () => void;
}) {
  if (filtered) {
    return (
      <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
        Nessun club corrisponde alla ricerca.
      </p>
    );
  }

  return (
    <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-7 text-center">
      <span className="mx-auto grid h-10 w-10 place-items-center rounded-full bg-white text-slate-400">
        {ownerMode ? (
          <Building2 className="h-5 w-5" aria-hidden />
        ) : (
          <UserPlus className="h-5 w-5" aria-hidden />
        )}
      </span>
      <p className="mt-3 font-medium text-slate-900">
        {ownerMode
          ? "Non hai ancora creato un club"
          : "Nessun accesso assegnato"}
      </p>
      <p className="mx-auto mt-1 max-w-sm text-sm text-slate-500">
        {ownerMode
          ? "Crea il tuo club: bastano nome, sede e contatti, il resto si completa dopo."
          : "Se una societa ti ha invitato, inserisci il token che ti ha condiviso."}
      </p>
      <Button type="button" variant="outline" className="mt-4" onClick={onAction}>
        {ownerMode ? "Crea un club" : "Inserisci un token"}
      </Button>
    </div>
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
    <section
      id={ownerMode ? "owned-clubs" : "assigned-clubs"}
      className="rounded-2xl border border-slate-200 bg-white p-4 md:p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 font-display text-lg font-semibold tracking-tight text-slate-900">
            {ownerMode ? (
              <Crown className="h-4 w-4 text-amber-700" aria-hidden />
            ) : (
              <Users className="h-4 w-4 text-[var(--eg-blue)]" aria-hidden />
            )}
            {title}
            <span className="eg-tabular rounded bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-600">
              {clubs.length}
            </span>
          </h2>
          <p className="mt-1 text-sm text-slate-500">{description}</p>
          {slotLabel ? (
            <p className="mt-1 text-xs text-slate-400">{slotLabel}</p>
          ) : null}
        </div>

        <Button type="button" size="sm" className="shrink-0" onClick={onAction}>
          <Plus className="mr-1.5 h-4 w-4" aria-hidden />
          {actionLabel}
        </Button>
      </div>

      <div className="mt-4">
        {loading ? (
          <PanelSkeleton />
        ) : clubs.length ? (
          <ul className="space-y-2">
            {clubs.map((club) => (
              <ClubRow
                key={club.accessKey || `${club.id}:${club.role}`}
                club={club}
                ownerMode={ownerMode}
                isActive={activeClubId === club.id}
                isSwitching={switchingClubId === club.id}
                isDeleting={
                  deletingAccessKey === (club.accessKey || club.membershipId)
                }
                onOpen={() => onOpenClub(club)}
                onDelete={
                  !ownerMode && onDeleteClub ? () => onDeleteClub(club) : undefined
                }
              />
            ))}
          </ul>
        ) : (
          <PanelEmptyState
            ownerMode={ownerMode}
            filtered={filtered}
            onAction={onAction}
          />
        )}
      </div>
    </section>
  );
}

// --- schermata ---------------------------------------------------------------

export default function AccountHomeScreen() {
  const router = useRouter();
  const { showToast } = useToast();
  const { user, loading, activeClub, setActiveClub, signOut } = useAuth();

  const [savingProfile, setSavingProfile] = useState(false);
  const [creatingClub, setCreatingClub] = useState(false);
  const [redeemingAccess, setRedeemingAccess] = useState(false);
  const [switchingClubId, setSwitchingClubId] = useState<string | null>(null);
  const [deletingAccessKey, setDeletingAccessKey] = useState<string | null>(null);

  const [profileOpen, setProfileOpen] = useState(false);
  const [createClubOpen, setCreateClubOpen] = useState(false);
  const [redeemAccessOpen, setRedeemAccessOpen] = useState(false);

  const [profileForm, setProfileForm] = useState<ProfileFormState>(
    createProfileDefaults(null),
  );
  const [createClubForm, setCreateClubForm] = useState<ClubCreateFormState>(
    createClubDefaults(null),
  );
  const [createClubTab, setCreateClubTab] = useState<
    "general" | "fiscal" | "bank" | "contacts" | "federation" | "social"
  >("general");
  const [accessToken, setAccessToken] = useState("");
  const [query, setQuery] = useState("");

  const [ownedClubs, setOwnedClubs] = useState<AccountClub[]>([]);
  const [accessClubs, setAccessClubs] = useState<AccountClub[]>([]);
  const [membershipsStatus, setMembershipsStatus] = useState<
    "loading" | "error" | "loaded"
  >("loading");
  const [membershipsError, setMembershipsError] = useState<string | null>(null);
  const [hasLoadedMemberships, setHasLoadedMemberships] = useState(false);
  const [membershipsLoading, setMembershipsLoading] = useState(false);

  const clubSlotLimit = useMemo(() => {
    const rawLimit = Number(user?.user_metadata?.clubSlotLimit);
    return Number.isFinite(rawLimit) && rawLimit > 0 ? rawLimit : null;
  }, [user?.user_metadata?.clubSlotLimit]);

  const activeClubId = activeClub?.id || null;
  const availableClubSlots =
    clubSlotLimit === null ? null : Math.max(clubSlotLimit - ownedClubs.length, 0);
  const emailVerified = Boolean(user?.user_metadata?.emailVerified);
  const phoneVerified = Boolean(user?.user_metadata?.phoneVerified);
  const accountDisplayName =
    [profileForm.firstName, profileForm.lastName].filter(Boolean).join(" ") ||
    user?.user_metadata?.name ||
    user?.email ||
    "Utente EasyGame";

  const syncActiveClubLocally = (club: AccountClub) => {
    const isSelectedAccess = (item: AccountClub) =>
      club.accessKey
        ? item.accessKey === club.accessKey
        : item.id === club.id && item.role === club.role;
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
        window.localStorage.setItem(
          `activeClub_${user.id}`,
          JSON.stringify(nextActiveClub),
        );
      }
    }

    setOwnedClubs((current) =>
      sortClubs(
        current.map((item) => ({ ...item, isPrimary: isSelectedAccess(item) })),
      ),
    );
    setAccessClubs((current) =>
      sortClubs(
        current.map((item) => ({ ...item, isPrimary: isSelectedAccess(item) })),
      ),
    );
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
        // Un errore temporaneo non equivale ad avere zero club: manteniamo i
        // dati gia caricati e distinguiamo "error" da "loaded-empty".
        setMembershipsError(result.message);
        setMembershipsStatus("error");
        return;
      }

      const mappedClubs = sortClubs(
        result.memberships.map((membership) =>
          mapMembershipToClub(membership, user.id),
        ),
      );

      setOwnedClubs(
        mappedClubs
          .filter((club) => club.accessKind === "ownership")
          .map(({ ownerId, ...club }) => club),
      );
      setAccessClubs(
        mappedClubs
          .filter(
            (club) =>
              club.accessKind !== "ownership" &&
              !(club.role === "owner" && club.ownerId === user.id),
          )
          .map(({ ownerId, ...club }) => club),
      );

      setMembershipsStatus("loaded");
      setHasLoadedMemberships(true);
    } finally {
      setMembershipsLoading(false);
    }
  };

  useEffect(() => {
    if (loading) return;

    if (!user?.id) {
      router.replace("/login");
      return;
    }

    setProfileForm(createProfileDefaults(user));
    setCreateClubForm(createClubDefaults(user));
  }, [loading, router, user]);

  useEffect(() => {
    // Attendiamo la validazione della sessione lato server: senza questo
    // controllo partirebbe una richiesta protetta basata solo sulla cache.
    if (loading || !user?.id) return;
    void loadMemberships();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, user?.id]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const params = new URLSearchParams(window.location.search);
    if (params.get("openCreateClub") === "1") {
      setCreateClubOpen(true);
      window.history.replaceState({}, "", "/account");
    }
  }, []);

  const updateProfileField = (field: keyof ProfileFormState, value: string) => {
    setProfileForm((current) => ({ ...current, [field]: value }));
  };

  const updateClubField = (field: keyof ClubCreateFormState, value: any) => {
    setCreateClubForm((current) => ({ ...current, [field]: value }));
  };

  const updateFederation = (
    federationId: string,
    field: "name" | "registrationNumber" | "affiliationDate",
    value: string,
  ) => {
    setCreateClubForm((current) => ({
      ...current,
      federations: current.federations.map((item) =>
        item.id === federationId ? { ...item, [field]: value } : item,
      ),
    }));
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
  };

  const removeFederation = (federationId: string) => {
    setCreateClubForm((current) => ({
      ...current,
      federations: current.federations.filter((item) => item.id !== federationId),
    }));
  };

  const persistActiveClub = async (club: AccountClub) => {
    setSwitchingClubId(club.id);

    const response = await apiRequest<MembershipRecord>(
      "/api/v1/auth/memberships/activate",
      {
        method: "POST",
        body: {
          organization_id: club.id,
          role: club.role,
          membership_id:
            club.accessKind === "ownership"
              ? undefined
              : club.membershipId || undefined,
          access_kind: club.accessKind || "membership",
        },
      },
    );

    if (response.error) {
      setSwitchingClubId(null);
      throw new Error(
        response.error.message || "Impossibile impostare il club attivo",
      );
    }

    const activatedRole = String(
      response.data?.resolved_role || response.data?.role || club.role,
    );
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
      const redirectPath = getAccessRedirectPath(
        activatedAccess?.resolved_role || activatedAccess?.role || club.role,
        {
          organizationId: club.id,
          linkedAthleteId: activatedAccess?.linked_athlete_id,
          linkedAthleteIds: activatedAccess?.linked_athlete_ids,
        },
      );

      if (redirectPath === "/account") {
        showToast(
          "error",
          "Accesso attivato, ma il profilo collegato non è disponibile",
        );
        return;
      }

      router.push(redirectPath);
    } catch (error: any) {
      showToast("error", error?.message || "Errore cambio club attivo");
    }
  };

  const saveProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (profileForm.newPassword !== profileForm.confirmPassword) {
      showToast("error", "Le password non coincidono");
      return;
    }

    setSavingProfile(true);

    const emailChanged =
      profileForm.email.trim().toLowerCase() !==
      String(user?.email || "").toLowerCase();
    const phoneChanged =
      profileForm.phone.trim() !== String(user?.user_metadata?.phone || "");

    const response = await supabase.auth.updateUser({
      email: profileForm.email.trim().toLowerCase(),
      password: profileForm.newPassword.trim() || undefined,
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

    setProfileForm((current) => ({
      ...current,
      newPassword: "",
      confirmPassword: "",
    }));
    setSavingProfile(false);
    setProfileOpen(false);

    if (emailChanged || phoneChanged) {
      showToast(
        "success",
        "Profilo aggiornato. Email e telefono richiederanno una nuova verifica.",
      );
    } else {
      showToast("success", "Profilo aggiornato correttamente");
    }
  };

  const createOwnedClub = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!user?.id) return;

    if (clubSlotLimit !== null && ownedClubs.length >= clubSlotLimit) {
      showToast("error", "Hai esaurito gli slot disponibili per i club");
      return;
    }

    /*
      Il messaggio nominava sette campi e lasciava l'utente sulla scheda dove
      stava: due di quei sette — email e telefono di contatto — vivono nella
      scheda «Contatti», che era chiusa. Chi premeva «Crea club» dalla scheda
      «Generali» leggeva di dover compilare campi che non erano sulla pagina.
      Adesso la mancanza porta alla scheda che la contiene, e il messaggio dice
      **solo** cio che manca davvero.
    */
    const missing = CREATE_CLUB_REQUIRED_FIELDS.filter(
      (entry) => !String(createClubForm[entry.field] || "").trim(),
    );

    if (missing.length > 0) {
      setCreateClubTab(missing[0].tab);
      showToast(
        "error",
        missing.length === 1
          ? `Manca ancora un dato obbligatorio: ${missing[0].label}.`
          : `Mancano ancora ${missing.length} dati obbligatori: ${missing
              .map((entry) => entry.label)
              .join(", ")}.`,
      );
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
    setCreateClubTab("general");
    setCreateClubOpen(false);
    setCreatingClub(false);
    showToast(
      "success",
      `Club ${createdSummary.name} creato. Ti accompagniamo nella configurazione iniziale.`,
    );
    router.push("/onboarding");
  };

  const redeemClubAccess = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!accessToken.trim()) {
      showToast("error", "Inserisci il token condiviso dal club");
      return;
    }

    setRedeemingAccess(true);

    const response = await apiRequest<{ membership: MembershipRecord }>(
      "/api/v1/auth/access/redeem",
      { method: "POST", body: { token: accessToken } },
    );

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

  const deleteAssignedAccess = async (club: AccountClub) => {
    if (!club.membershipId) {
      showToast("error", "Accesso assegnato non valido");
      return;
    }

    const confirmed = window.confirm(
      `Eliminare l'accesso ${club.roleLabel.toLowerCase()} a ${club.name}? Il profilo collegato verra scollegato dal tuo account, ma non verra eliminato dal club.`,
    );

    if (!confirmed) return;

    const accessKey = club.accessKey || club.membershipId;
    setDeletingAccessKey(accessKey);

    const response = await apiRequest<{
      deletedMembershipId: string;
      unlinkedProfilesCount: number;
    }>("/api/v1/auth/memberships/delete", {
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

    const activeAccessMatches =
      activeClub?.membershipId === club.membershipId ||
      activeClub?.accessKey === club.accessKey;
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
    window.open("https://www.cedisoft.it/contatti/", "_blank", "noopener,noreferrer");
  };

  const panelsLoading = loading || membershipsStatus === "loading";
  const totalClubs = ownedClubs.length + accessClubs.length;
  const showSearch = !panelsLoading && totalClubs >= SEARCH_THRESHOLD;
  const filteredOwnedClubs = ownedClubs.filter((club) => matchesQuery(club, query));
  const filteredAccessClubs = accessClubs.filter((club) => matchesQuery(club, query));
  const firstName = getAccountFirstName(accountDisplayName);
  const blockingError = membershipsStatus === "error" && !hasLoadedMemberships;

  return (
    <div className="min-h-[100dvh] bg-[var(--eg-paper)] text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex w-full max-w-6xl items-center gap-3 px-4 py-3 md:px-6">
          <EasyGameLogo className="h-8 w-8 shrink-0" />
          <span className="font-display text-base font-semibold tracking-tight">
            EasyGame
          </span>

          <div className="ml-auto flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="hidden text-slate-600 sm:inline-flex"
              onClick={handleSupport}
            >
              <CircleHelp className="mr-1.5 h-4 w-4" aria-hidden />
              Assistenza
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="flex h-11 items-center gap-2 rounded-full border border-slate-200 bg-white pl-1 pr-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                  aria-label="Menu account"
                >
                  <span className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-full bg-slate-100 text-xs font-semibold text-slate-600">
                    {profileForm.avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element -- avatar utente, spesso una data URL
                      <img
                        src={profileForm.avatarUrl}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      getInitials(accountDisplayName)
                    )}
                  </span>
                  <ChevronDown className="h-4 w-4 text-slate-500" aria-hidden />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                <div className="px-2 py-1.5">
                  <p className="truncate text-sm font-medium text-slate-900">
                    {accountDisplayName}
                  </p>
                  <p className="truncate text-xs text-slate-500">
                    {profileForm.email}
                  </p>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => setProfileOpen(true)}>
                  <UserCircle2 className="mr-2 h-4 w-4" aria-hidden />
                  Profilo account
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={handleSupport}>
                  <CircleHelp className="mr-2 h-4 w-4" aria-hidden />
                  Assistenza
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-red-600 focus:text-red-600"
                  onSelect={() => {
                    void signOut();
                  }}
                >
                  <LogOut className="mr-2 h-4 w-4" aria-hidden />
                  Esci dall&apos;account
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl space-y-5 px-4 py-6 md:px-6">
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="grid items-center gap-4 p-5 md:p-6 xl:grid-cols-[minmax(0,1fr)_320px]">
            <div>
              <p className="eg-eyebrow text-slate-400">Home account</p>
              <h1 className="mt-2 font-display text-2xl font-semibold tracking-tight md:text-3xl">
                Ciao, {firstName}
              </h1>
              <p className="mt-2 max-w-xl text-sm text-slate-600">
                Da qui entri nei club che possiedi e in quelli dove ti hanno
                assegnato un accesso. Ogni club porta con se il suo ruolo e la
                sua stagione attiva.
              </p>
            </div>

            <div className="relative hidden h-36 xl:block">
              <Image
                src={ACCOUNT_HERO_IMAGE}
                alt=""
                fill
                priority
                sizes="320px"
                className="object-contain object-right"
              />
            </div>
          </div>
        </section>

        {membershipsStatus === "error" && hasLoadedMemberships ? (
          <div
            className="flex flex-wrap items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
            role="alert"
          >
            <TriangleAlert className="h-4 w-4 shrink-0" aria-hidden />
            <span className="min-w-0 flex-1">
              {membershipsError ||
                "Aggiornamento dei club non riuscito: i dati mostrati potrebbero non essere aggiornati."}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={membershipsLoading}
              onClick={() => {
                void loadMemberships(true);
              }}
            >
              {membershipsLoading ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden />
              ) : (
                <RotateCw className="mr-1.5 h-3.5 w-3.5" aria-hidden />
              )}
              Riprova
            </Button>
          </div>
        ) : null}

        {blockingError ? (
          <section className="rounded-2xl border border-red-200 bg-white p-8 text-center">
            <span className="mx-auto grid h-11 w-11 place-items-center rounded-full bg-red-50 text-red-600">
              <TriangleAlert className="h-5 w-5" aria-hidden />
            </span>
            <h2 className="mt-4 font-display text-lg font-semibold text-slate-900">
              Non riusciamo a caricare i tuoi club
            </h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-slate-600">
              {membershipsError ||
                "Si e verificato un errore durante il caricamento. Nessun dato e stato modificato."}
            </p>
            <Button
              type="button"
              className="mt-5"
              disabled={membershipsLoading}
              onClick={() => {
                void loadMemberships();
              }}
            >
              {membershipsLoading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <RotateCw className="mr-2 h-4 w-4" aria-hidden />
              )}
              Riprova
            </Button>
          </section>
        ) : (
          <>
            {showSearch ? (
              <div className="relative">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                  aria-hidden
                />
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Cerca per nome, citta o ruolo"
                  aria-label="Cerca fra i tuoi club"
                  className="pl-9"
                />
              </div>
            ) : null}

            <div className="grid gap-5 xl:grid-cols-2">
              <AccessPanel
                ownerMode
                title="Club di proprieta"
                description="I club che hai creato e amministri come proprietario."
                actionLabel="Crea club"
                clubs={filteredOwnedClubs}
                loading={panelsLoading}
                filtered={Boolean(query) && ownedClubs.length > 0}
                activeClubId={activeClubId}
                switchingClubId={switchingClubId}
                deletingAccessKey={deletingAccessKey}
                slotLabel={
                  clubSlotLimit === null
                    ? undefined
                    : `${availableClubSlots} slot disponibili su ${clubSlotLimit}`
                }
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
                onDeleteClub={(club) => {
                  void deleteAssignedAccess(club);
                }}
              />
            </div>
          </>
        )}
      </main>

      <AccountProfileDialog
        open={profileOpen}
        onOpenChange={setProfileOpen}
        form={profileForm}
        accountDisplayName={accountDisplayName}
        activeClubName={activeClub?.name || null}
        emailVerified={emailVerified}
        phoneVerified={phoneVerified}
        saving={savingProfile}
        userRole={user?.user_metadata?.role || "user"}
        onChange={updateProfileField}
        onSubmit={saveProfile}
      />

      <AccountCreateClubDialog
        open={createClubOpen}
        onOpenChange={setCreateClubOpen}
        form={createClubForm}
        tab={createClubTab}
        creating={creatingClub}
        availableClubSlots={availableClubSlots}
        clubSlotLimit={clubSlotLimit}
        ownedClubCount={ownedClubs.length}
        onTabChange={setCreateClubTab}
        onFieldChange={updateClubField}
        onFederationChange={updateFederation}
        onFederationAdd={addFederation}
        onFederationRemove={removeFederation}
        onSubmit={createOwnedClub}
      />

      <AccountRedeemAccessDialog
        open={redeemAccessOpen}
        onOpenChange={setRedeemAccessOpen}
        value={accessToken}
        loading={redeemingAccess}
        onValueChange={setAccessToken}
        onSubmit={redeemClubAccess}
      />
    </div>
  );
}
