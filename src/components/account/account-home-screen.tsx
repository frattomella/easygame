"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
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
import { supabase } from "@/lib/supabase";
import {
  ArrowRight,
  Bell,
  Building2,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Crown,
  Home,
  Loader2,
  LogOut,
  Plus,
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
  createClubDefaults,
  createProfileDefaults,
  getInitials,
  mapMembershipToClub,
  MembershipRecord,
  ProfileFormState,
  sortClubs,
} from "./account-shared";

const ACCOUNT_HERO_IMAGE = "/images/account/account-hero.png";
const ACCOUNT_TEAM_IMAGE = "/images/account/account-team.png";

const getAccountFirstName = (displayName: string) =>
  displayName.split(" ").filter(Boolean)[0] || "EasyGamer";

const getAccessBadgeClassName = (ownerMode: boolean) =>
  ownerMode
    ? "bg-[#fff1d8] text-[#d97800]"
    : "bg-[#e9f1ff] text-[#075eee]";

type HeaderActionsProps = {
  accountDisplayName: string;
  avatarUrl?: string | null;
  email: string;
  onSupport: () => void;
  onProfile: () => void;
  onSignOut: () => void;
};

function AccountHeaderActions({
  accountDisplayName,
  avatarUrl,
  email,
  onSupport,
  onProfile,
  onSignOut,
}: HeaderActionsProps) {
  return (
    <div className="flex items-center gap-3 md:gap-4">
      <Button
        type="button"
        variant="outline"
        className="hidden h-12 rounded-full border-[#d8e4f6] bg-white px-6 text-sm font-bold text-[#111a35] shadow-[0_12px_30px_-18px_rgba(15,23,42,0.45)] hover:bg-[#f7fbff] md:inline-flex"
        onClick={onSupport}
      >
        <CircleHelp className="mr-2 h-4 w-4" />
        Ricevi assistenza
      </Button>

      <button
        type="button"
        className="flex h-14 w-14 items-center justify-center rounded-full border border-[#dfe8f6] bg-white text-[#111a35] shadow-[0_14px_32px_-20px_rgba(15,23,42,0.5)] transition hover:-translate-y-0.5 hover:border-blue-200 md:hidden"
        onClick={onSupport}
        aria-label="Ricevi assistenza"
      >
        <CircleHelp className="h-6 w-6" />
      </button>

      <button
        type="button"
        className="relative flex h-14 w-14 items-center justify-center rounded-full border border-[#dfe8f6] bg-white text-[#111a35] shadow-[0_14px_32px_-20px_rgba(15,23,42,0.5)] transition hover:-translate-y-0.5 hover:border-blue-200"
        aria-label="Notifiche"
      >
        <Bell className="h-6 w-6" />
        <span className="absolute -right-1 -top-1 flex h-6 min-w-6 items-center justify-center rounded-full bg-[#ff3131] px-1 text-xs font-black text-white ring-2 ring-white">
          3
        </span>
      </button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="flex h-14 items-center gap-2 rounded-full border border-[#dfe8f6] bg-white px-2 text-sm font-black text-[#111a35] shadow-[0_14px_32px_-20px_rgba(15,23,42,0.5)] transition hover:-translate-y-0.5 hover:border-blue-200 md:h-14 md:px-2"
            aria-label="Menu profilo"
          >
            <span className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-full bg-white text-sm font-black">
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt={accountDisplayName}
                  className="h-full w-full object-cover"
                />
              ) : (
                getInitials(accountDisplayName)
              )}
            </span>
            <ChevronDown className="hidden h-4 w-4 text-[#111a35] md:block" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64 rounded-2xl p-2">
          <div className="px-3 py-2">
            <p className="font-medium text-slate-900">{accountDisplayName}</p>
            <p className="text-xs text-slate-500">{email}</p>
          </div>
          <DropdownMenuSeparator />
          <DropdownMenuItem className="rounded-xl" onSelect={onProfile}>
            <UserCircle2 className="mr-2 h-4 w-4" />
            Profilo account
          </DropdownMenuItem>
          <DropdownMenuItem className="rounded-xl" onSelect={onSupport}>
            <CircleHelp className="mr-2 h-4 w-4" />
            Assistenza
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="rounded-xl text-red-600 focus:text-red-600"
            onSelect={onSignOut}
          >
            <LogOut className="mr-2 h-4 w-4" />
            Esci dall'account
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

type AccountHeroProps = HeaderActionsProps & {
  firstName: string;
};

function AccountHero(props: AccountHeroProps) {
  return (
    <header className="relative overflow-hidden px-5 pt-8 md:px-8 md:pt-8 xl:px-12 xl:pt-9">
      <div className="relative z-10 flex items-center justify-between gap-5">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center md:h-12 md:w-12">
            <span className="bg-gradient-to-br from-[#0875ff] to-[#004de1] bg-clip-text text-[44px] font-black leading-none tracking-[-0.08em] text-transparent md:text-[48px]">
              G
            </span>
          </div>
          <span className="text-[25px] font-black tracking-normal text-[#07112f] md:text-[26px]">
            EasyGame
          </span>
        </div>

        <AccountHeaderActions {...props} />
      </div>

      <div className="relative z-10 grid min-h-[395px] pt-10 md:min-h-[340px] md:grid-cols-[minmax(0,0.82fr)_minmax(420px,1fr)] md:items-start md:pt-12">
        <div className="max-w-[560px]">
          <div className="inline-flex items-center gap-2 rounded-full bg-[#eaf2ff] px-3 py-1.5 text-sm font-black uppercase text-[#075eee] md:text-sm">
            <Home className="h-4 w-4" />
            HOME ACCOUNT
          </div>

          <h1 className="mt-8 max-w-[560px] text-[43px] font-black leading-[1.12] tracking-normal text-[#07112f] md:mt-9 md:text-[52px] xl:text-[58px]">
            Bentornata, {props.firstName} 👋
          </h1>
          <p className="mt-5 max-w-[410px] text-[20px] font-medium leading-[1.55] text-[#5f6b84] md:text-[21px]">
            Gestisci i club che possiedi e accedi a quelli dove sei stata
            invitata.
          </p>
        </div>

        <div className="pointer-events-none absolute -right-10 top-[120px] h-[300px] w-[390px] md:relative md:-right-4 md:top-auto md:h-[345px] md:w-full xl:-right-1 xl:h-[360px]">
          <Image
            src={ACCOUNT_HERO_IMAGE}
            alt="Kit sportivo EasyGame"
            fill
            priority
            sizes="(max-width: 768px) 390px, 760px"
            className="object-contain object-center"
            style={{
              maskImage:
                "radial-gradient(ellipse at center, black 58%, rgba(0,0,0,0.88) 70%, transparent 98%)",
            }}
          />
        </div>
      </div>
    </header>
  );
}

function ClubLogo({ club }: { club: AccountClub }) {
  return (
    <span className="flex h-[74px] w-[74px] shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#f2f6fd] md:h-[78px] md:w-[78px]">
      {club.logoUrl ? (
        <img
          src={club.logoUrl}
          alt={club.name}
          className="h-[62px] w-[62px] object-contain md:h-[66px] md:w-[66px]"
        />
      ) : (
        <Building2 className="h-8 w-8 text-[#8fa2c2]" />
      )}
    </span>
  );
}

type ClubAccessRowProps = {
  club: AccountClub;
  ownerMode: boolean;
  switchingClubId: string | null;
  onOpen: () => void;
};

function ClubAccessRow({
  club,
  ownerMode,
  switchingClubId,
  onOpen,
}: ClubAccessRowProps) {
  const isSwitching = switchingClubId === club.id;

  return (
    <button
      type="button"
      className="group flex w-full items-center gap-4 rounded-[20px] border border-[#dce6f4] bg-white px-4 py-4 text-left shadow-[0_12px_36px_-30px_rgba(15,23,42,0.45)] transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-[0_22px_46px_-30px_rgba(15,23,42,0.55)] md:gap-5 md:rounded-[18px] md:px-5 md:py-5"
      onClick={onOpen}
    >
      <ClubLogo club={club} />

      <span className="min-w-0 flex-1">
        <span className="flex flex-col gap-2 md:flex-row md:items-center md:gap-3">
          <span className="truncate text-[22px] font-black leading-tight text-[#07112f] md:text-[20px] xl:text-[22px]">
            {club.name}
          </span>
          <span
            className={`inline-flex w-fit items-center rounded-full px-3 py-1 text-sm font-black ${getAccessBadgeClassName(ownerMode)}`}
          >
            {ownerMode ? "Proprietà" : club.roleLabel}
          </span>
        </span>
      </span>

      <span className="ml-auto flex h-10 w-10 shrink-0 items-center justify-center text-[#596781] transition group-hover:translate-x-1 group-hover:text-[#075eee]">
        {isSwitching ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : (
          <ChevronRight className="h-8 w-8 stroke-[2.4]" />
        )}
      </span>
    </button>
  );
}

type AccessPanelProps = {
  ownerMode: boolean;
  title: string;
  description: string;
  mobileDescription: string;
  countLabel: string;
  actionLabel: string;
  footerLabel: string;
  clubs: AccountClub[];
  switchingClubId: string | null;
  onAction: () => void;
  onOpenClub: (club: AccountClub) => void;
  onFooter: () => void;
  slotLabel?: string;
};

function AccountAccessPanel({
  ownerMode,
  title,
  description,
  mobileDescription,
  countLabel,
  actionLabel,
  footerLabel,
  clubs,
  switchingClubId,
  onAction,
  onOpenClub,
  onFooter,
  slotLabel,
}: AccessPanelProps) {
  const icon = ownerMode ? (
    <Crown className="h-9 w-9 stroke-[2.2]" />
  ) : (
    <Users className="h-9 w-9 stroke-[2.2]" />
  );

  return (
    <section
      id={ownerMode ? "owned-clubs" : "assigned-clubs"}
      className="rounded-[26px] border border-[#dfe8f6] bg-white/95 p-5 shadow-[0_24px_70px_-42px_rgba(15,23,42,0.42)] backdrop-blur md:rounded-[24px] md:p-7 xl:p-8"
    >
      <div className="flex items-start gap-4 md:gap-5">
        <div className="flex h-[78px] w-[78px] shrink-0 items-center justify-center rounded-full bg-[#eaf2ff] text-[#075eee]">
          {icon}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-[24px] font-black leading-tight text-[#07112f] md:text-[21px] xl:text-[23px]">
              {title}
            </h2>
            <span
              className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-sm font-black ${getAccessBadgeClassName(ownerMode)}`}
            >
              {ownerMode ? <Crown className="h-3.5 w-3.5" /> : <Users className="h-3.5 w-3.5" />}
              {countLabel}
            </span>
          </div>
          <p className="mt-2 hidden max-w-[460px] text-[15px] font-medium leading-7 text-[#5f6b84] md:block">
            {description}
          </p>
          <p className="mt-1 text-[20px] font-medium leading-7 text-[#5f6b84] md:hidden">
            {mobileDescription}
          </p>
          {slotLabel ? (
            <p className="mt-2 hidden text-xs font-semibold text-[#8b97ad] md:block">
              {slotLabel}
            </p>
          ) : null}
        </div>

        <Button
          type="button"
          className="h-[70px] w-[70px] shrink-0 rounded-[20px] bg-[#075eee] p-0 text-white shadow-[0_18px_34px_-18px_rgba(7,94,238,0.72)] hover:bg-[#0052db] md:h-12 md:w-auto md:rounded-full md:px-7 md:text-[15px] md:font-black"
          onClick={onAction}
        >
          <Plus className="h-9 w-9 md:mr-2 md:h-5 md:w-5" />
          <span className="hidden md:inline">{actionLabel}</span>
        </Button>
      </div>

      <div className="mt-8 space-y-3 md:mt-7">
        {clubs.map((club) => (
          <ClubAccessRow
            key={club.accessKey || `${club.id}:${club.role}`}
            club={club}
            ownerMode={ownerMode}
            switchingClubId={switchingClubId}
            onOpen={() => onOpenClub(club)}
          />
        ))}

        {clubs.length === 0 ? (
          <div className="rounded-[20px] border border-dashed border-[#d4dfed] bg-[#fbfdff] px-5 py-6 text-center text-[15px] font-semibold text-[#7b879d]">
            {ownerMode
              ? "Vuoi creare un nuovo club? Inizia ora e porta la tua squadra al successo."
              : "Inserisci un token per visualizzare qui i club a cui hai accesso."}
          </div>
        ) : null}

        {ownerMode ? (
          <button
            type="button"
            className="hidden w-full items-center justify-center gap-4 rounded-[16px] border border-dashed border-[#d9e4f3] bg-white px-5 py-5 text-sm font-medium text-[#69768f] md:flex"
            onClick={onAction}
          >
            <Building2 className="h-7 w-7 text-[#aab7ca]" />
            Vuoi creare un nuovo club? Inizia ora e porta la tua squadra al
            successo.
          </button>
        ) : null}
      </div>

      <button
        type="button"
        className="mx-auto mt-8 flex items-center gap-3 text-[20px] font-black text-[#075eee] transition hover:gap-4 md:mt-7 md:text-base"
        onClick={onFooter}
      >
        {footerLabel}
        <ArrowRight className="h-6 w-6" />
      </button>
    </section>
  );
}

function AccountBottomCTA({ onAddAccess }: { onAddAccess: () => void }) {
  return (
    <section className="relative overflow-hidden rounded-[26px] border border-[#d9e7fb] bg-[#f8fbff] shadow-[0_22px_70px_-46px_rgba(15,23,42,0.42)] md:rounded-[22px]">
      <div className="grid min-h-[250px] gap-2 p-7 md:min-h-[155px] md:grid-cols-[330px_minmax(0,1fr)_360px] md:items-center md:p-0 md:pr-10">
        <div className="pointer-events-none absolute right-0 top-8 h-[190px] w-[330px] md:relative md:right-auto md:top-auto md:h-[155px] md:w-full">
          <Image
            src={ACCOUNT_TEAM_IMAGE}
            alt="Squadra EasyGame"
            fill
            sizes="(max-width: 768px) 330px, 330px"
            className="object-cover object-center"
            style={{
              maskImage:
                "linear-gradient(to right, transparent 0%, black 18%, black 76%, transparent 100%)",
            }}
          />
        </div>

        <div className="relative z-10 max-w-[430px] pt-4 md:flex md:max-w-none md:items-center md:gap-7 md:pt-0">
          <div className="hidden h-[76px] w-[76px] shrink-0 items-center justify-center rounded-full bg-[#eaf2ff] text-[#075eee] md:flex">
            <Users className="h-9 w-9" />
          </div>
          <div>
            <h2 className="max-w-[300px] text-[28px] font-black leading-[1.35] text-[#07112f] md:max-w-none md:text-[23px]">
              Un club, una squadra, un'unica passione.
            </h2>
            <p className="mt-4 max-w-[315px] text-[19px] font-medium leading-8 text-[#5f6b84] md:mt-3 md:max-w-[520px] md:text-[17px] md:leading-7">
              Organizza, comunica e porta la tua squadra verso nuovi traguardi
              con EasyGame.
            </p>
          </div>
        </div>

        <div className="relative z-10 mt-28 md:mt-0 md:flex md:justify-end">
          <Button
            type="button"
            variant="outline"
            className="h-[74px] w-full rounded-full border-[#cbdcf7] bg-white text-[22px] font-black text-[#075eee] shadow-[0_18px_38px_-28px_rgba(15,23,42,0.45)] hover:bg-[#f8fbff] md:h-14 md:w-auto md:px-9 md:text-[18px]"
            onClick={onAddAccess}
          >
            <UserPlus className="mr-3 h-7 w-7 md:h-5 md:w-5" />
            Aggiungi accesso a un club
          </Button>
        </div>
      </div>
    </section>
  );
}

export default function AccountHomeScreen() {
  const router = useRouter();
  const { showToast } = useToast();
  const { user, loading, activeClub, setActiveClub, signOut } = useAuth();

  const [pageLoading, setPageLoading] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [creatingClub, setCreatingClub] = useState(false);
  const [redeemingAccess, setRedeemingAccess] = useState(false);
  const [switchingClubId, setSwitchingClubId] = useState<string | null>(null);

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
  const [ownedClubs, setOwnedClubs] = useState<AccountClub[]>([]);
  const [accessClubs, setAccessClubs] = useState<AccountClub[]>([]);

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
        current.map((item) => ({
          ...item,
          isPrimary: isSelectedAccess(item),
        })),
      ),
    );
    setAccessClubs((current) =>
      sortClubs(
        current.map((item) => ({
          ...item,
          isPrimary: isSelectedAccess(item),
        })),
      ),
    );
    setActiveClub(nextActiveClub);
  };

  const loadMemberships = async (silent = false) => {
    if (!user?.id) {
      setOwnedClubs([]);
      setAccessClubs([]);
      setPageLoading(false);
      return;
    }

    if (!silent) {
      setPageLoading(true);
    }

    const response = await apiRequest<MembershipRecord[]>("/api/v1/auth/memberships");

    if (response.error) {
      showToast("error", response.error.message || "Errore caricamento club");
      setOwnedClubs([]);
      setAccessClubs([]);
      if (!silent) {
        setPageLoading(false);
      }
      return;
    }

    const memberships = Array.isArray(response.data)
      ? (response.data as MembershipRecord[])
      : [];
    const mappedClubs = sortClubs(
      memberships.map((membership) => mapMembershipToClub(membership, user.id)),
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

    if (!silent) {
      setPageLoading(false);
    }
  };

  useEffect(() => {
    if (loading) {
      return;
    }

    if (!user?.id) {
      router.replace("/login");
      return;
    }

    setProfileForm(createProfileDefaults(user));
    setCreateClubForm(createClubDefaults(user));
  }, [loading, router, user]);

  useEffect(() => {
    if (!user?.id) {
      return;
    }

    void loadMemberships();
  }, [user?.id]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const params = new URLSearchParams(window.location.search);
    if (params.get("openCreateClub") === "1") {
      setCreateClubOpen(true);
      window.history.replaceState({}, "", "/account");
    }
  }, []);

  const updateProfileField = (field: keyof ProfileFormState, value: string) => {
    setProfileForm((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const updateClubField = (field: keyof ClubCreateFormState, value: any) => {
    setCreateClubForm((current) => ({
      ...current,
      [field]: value,
    }));
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

    syncActiveClubLocally(club);
    setSwitchingClubId(null);

    return response.data;
  };

  const openClubArea = async (club: AccountClub) => {
    try {
      const activatedAccess = await persistActiveClub(club);
      const redirectPath = String(activatedAccess?.redirect_path || "").trim();

      if (redirectPath) {
        router.push(redirectPath);
        return;
      }

      if (club.role === "trainer") {
        router.push("/trainer-dashboard");
        return;
      }

      if (club.role === "owner" || club.role === "admin") {
        router.push(`/dashboard?clubId=${club.id}`);
        return;
      }

      if ((club.role === "athlete" || club.role === "parent") && user?.id) {
        const athleteResponse = await supabase
          .from("athletes")
          .select("id")
          .eq("user_id", user.id)
          .maybeSingle();

        if (athleteResponse.data?.id) {
          router.push(`/parent-view/${athleteResponse.data.id}`);
          return;
        }
      }

      showToast(
        "success",
        `Accesso ${club.roleLabel.toLowerCase()} attivato su ${club.name}`,
      );
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

    if (!user?.id) {
      return;
    }

    if (clubSlotLimit !== null && ownedClubs.length >= clubSlotLimit) {
      showToast("error", "Hai esaurito gli slot disponibili per i club");
      return;
    }

    if (
      !createClubForm.name.trim() ||
      !createClubForm.type.trim() ||
      !createClubForm.address.trim() ||
      !createClubForm.city.trim() ||
      !createClubForm.province.trim() ||
      !createClubForm.contactEmail.trim() ||
      !createClubForm.contactPhone.trim()
    ) {
      showToast(
        "error",
        "Compila almeno nome, tipologia, indirizzo, citta, provincia, email e telefono.",
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
      contactEmail:
        createdClub.contact_email || createClubForm.contactEmail || null,
      contactPhone:
        createdClub.contact_phone || createClubForm.contactPhone || null,
      createdAt: createdClub.created_at || null,
      ownerId: user.id,
      accessKind: "ownership",
      accessKey: `ownership:${createdClub.id}`,
    };

    if (shouldBePrimary) {
      syncActiveClubLocally(createdSummary);
    }

    await loadMemberships(true);
    setCreateClubForm(createClubDefaults(user));
    setCreateClubTab("general");
    setCreateClubOpen(false);
    setCreatingClub(false);
    showToast(
      "success",
      `Club ${createdSummary.name} creato correttamente. Ora lo trovi nei tuoi club di proprietà.`,
    );
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
      {
        method: "POST",
        body: {
          token: accessToken,
        },
      },
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

  const handleSupport = () => {
    window.open("https://www.cedisoft.it/contatti/", "_blank", "noopener,noreferrer");
  };

  if (loading || pageLoading) {
    return (
      <div className="min-h-screen bg-[#f6faff] px-5 py-6 md:p-4">
        <div className="mx-auto flex min-h-[calc(100vh-3rem)] max-w-[1840px] items-center justify-center rounded-[28px] border border-white bg-white shadow-[0_24px_90px_-58px_rgba(15,23,42,0.45)]">
          <div className="flex items-center gap-3 text-lg font-semibold text-[#5f6b84]">
            <Loader2 className="h-6 w-6 animate-spin text-[#075eee]" />
            Caricamento home account...
          </div>
        </div>
      </div>
    );
  }

  const firstName = getAccountFirstName(accountDisplayName);
  const ownedFooterAction = () => {
    const firstOwnedClub = ownedClubs[0];
    if (firstOwnedClub) {
      void openClubArea(firstOwnedClub);
      return;
    }

    setCreateClubOpen(true);
  };
  const accessFooterAction = () => {
    const firstAccessClub = accessClubs[0];
    if (firstAccessClub) {
      void openClubArea(firstAccessClub);
      return;
    }

    setRedeemAccessOpen(true);
  };

  return (
    <div className="min-h-screen bg-[#f6faff] p-0 text-[#07112f] md:p-4">
      <div className="mx-auto min-h-screen max-w-[1840px] overflow-hidden bg-white shadow-[0_24px_90px_-58px_rgba(15,23,42,0.45)] md:min-h-[calc(100vh-2rem)] md:rounded-[28px] md:border md:border-white">
        <AccountHero
          firstName={firstName}
          accountDisplayName={accountDisplayName}
          avatarUrl={profileForm.avatarUrl}
          email={profileForm.email}
          onSupport={handleSupport}
          onProfile={() => setProfileOpen(true)}
          onSignOut={() => {
            void signOut();
          }}
        />

        <main className="relative z-20 space-y-7 px-5 pb-9 md:-mt-2 md:px-12 md:pb-10">
          <div className="grid gap-7 xl:grid-cols-2">
            <AccountAccessPanel
              ownerMode
              title="I tuoi club di proprietà"
              description="Qui trovi tutti i club che hai creato e che puoi amministrare come proprietario."
              mobileDescription="Qui trovi i club che hai creato."
              countLabel={`${ownedClubs.length} club`}
              slotLabel={
                clubSlotLimit === null
                  ? "Slot illimitati"
                  : `${availableClubSlots} slot disponibili`
              }
              actionLabel="Crea nuovo club"
              footerLabel="Vai alla gestione club"
              clubs={ownedClubs}
              switchingClubId={switchingClubId}
              onAction={() => setCreateClubOpen(true)}
              onOpenClub={(club) => {
                void openClubArea(club);
              }}
              onFooter={ownedFooterAction}
            />

            <AccountAccessPanel
              ownerMode={false}
              title="Club con accesso assegnato"
              description="Qui trovi i club ai quali hai accesso con il ruolo assegnato."
              mobileDescription="Qui trovi i club ai quali hai accesso."
              countLabel={`${accessClubs.length} accessi`}
              actionLabel="Aggiungi accesso"
              footerLabel="Vai a tutti i club"
              clubs={accessClubs}
              switchingClubId={switchingClubId}
              onAction={() => setRedeemAccessOpen(true)}
              onOpenClub={(club) => {
                void openClubArea(club);
              }}
              onFooter={accessFooterAction}
            />
          </div>

          <AccountBottomCTA onAddAccess={() => setRedeemAccessOpen(true)} />
        </main>
      </div>

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
