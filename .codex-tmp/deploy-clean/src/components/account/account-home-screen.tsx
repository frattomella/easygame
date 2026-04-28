"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
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
  Building2,
  CircleHelp,
  Crown,
  Loader2,
  LogOut,
  Plus,
  Sparkles,
  UserCircle2,
  Users,
} from "lucide-react";
import { AccountClubCard } from "./account-club-card";
import { AccountCreateClubDialog } from "./account-create-club-dialog";
import { AccountEmptyState } from "./account-empty-state";
import { AccountProfileDialog } from "./account-profile-dialog";
import { AccountRedeemAccessDialog } from "./account-redeem-access-dialog";
import {
  AccountClub,
  buildClubPayload,
  ClubCreateFormState,
  createClubDefaults,
  createProfileDefaults,
  EASYGAME_LOGO,
  getInitials,
  mapMembershipToClub,
  MembershipRecord,
  ProfileFormState,
  sortClubs,
} from "./account-shared";

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
    const nextActiveClub = {
      id: club.id,
      role: club.role,
      roleLabel: club.roleLabel,
      name: club.name,
      logo_url: club.logoUrl || null,
      email: club.contactEmail || null,
      phone: club.contactPhone || null,
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
          isPrimary: item.id === club.id,
        })),
      ),
    );
    setAccessClubs((current) =>
      sortClubs(
        current.map((item) => ({
          ...item,
          isPrimary: item.id === club.id,
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
        .filter((club) => club.role === "owner" || club.ownerId === user.id)
        .map(({ ownerId, ...club }) => club),
    );
    setAccessClubs(
      mappedClubs
        .filter((club) => !(club.role === "owner" || club.ownerId === user.id))
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
  };

  const openClubArea = async (club: AccountClub) => {
    try {
      await persistActiveClub(club);

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
      `Club ${createdSummary.name} creato correttamente. Ora lo trovi nei tuoi club di proprieta.`,
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
      <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.22),_transparent_42%),linear-gradient(180deg,#f8fbff_0%,#eef4ff_45%,#f8fafc_100%)] px-4 py-10">
        <div className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-6xl items-center justify-center rounded-[32px] border border-white/70 bg-white/85 shadow-2xl backdrop-blur">
          <div className="flex items-center gap-3 text-slate-600">
            <Loader2 className="h-5 w-5 animate-spin" />
            Caricamento home account...
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.22),_transparent_42%),linear-gradient(180deg,#f7fbff_0%,#eef4ff_45%,#f8fafc_100%)] px-4 py-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="overflow-hidden rounded-[34px] border border-white/70 bg-white/80 shadow-[0_24px_80px_-28px_rgba(15,23,42,0.35)] backdrop-blur-xl">
          <div className="flex flex-col gap-5 border-b border-slate-100 px-6 py-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-[22px] bg-gradient-to-br from-blue-600 to-sky-500 shadow-lg">
                <Image
                  src={EASYGAME_LOGO}
                  alt="EasyGame"
                  width={42}
                  height={42}
                  className="object-contain"
                />
              </div>
              <div className="space-y-1">
                <div className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-xs font-medium uppercase tracking-[0.2em] text-blue-700">
                  <Sparkles className="h-3.5 w-3.5" />
                  Home Account
                </div>
                <h1 className="text-2xl font-semibold text-slate-900">
                  Bentornato, {accountDisplayName}
                </h1>
                <p className="text-sm text-slate-500">
                  Da qui gestisci il tuo profilo utente, scegli quale club aprire
                  e aggiungi nuovi accessi senza entrare direttamente in una dashboard.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Button
                type="button"
                variant="outline"
                className="rounded-full border-slate-200 bg-white"
                onClick={handleSupport}
              >
                <CircleHelp className="mr-2 h-4 w-4" />
                Ricevi assistenza
              </Button>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-full border border-slate-200 bg-white text-sm font-semibold text-slate-700 shadow-sm transition hover:border-blue-200 hover:text-blue-700"
                  >
                    {profileForm.avatarUrl ? (
                      <img
                        src={profileForm.avatarUrl}
                        alt={accountDisplayName}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      getInitials(accountDisplayName)
                    )}
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-64 rounded-2xl p-2">
                  <div className="px-3 py-2">
                    <p className="font-medium text-slate-900">{accountDisplayName}</p>
                    <p className="text-xs text-slate-500">{profileForm.email}</p>
                  </div>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="rounded-xl"
                    onSelect={() => setProfileOpen(true)}
                  >
                    <UserCircle2 className="mr-2 h-4 w-4" />
                    Profilo account
                  </DropdownMenuItem>
                  <DropdownMenuItem className="rounded-xl" onSelect={handleSupport}>
                    <CircleHelp className="mr-2 h-4 w-4" />
                    Assistenza
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="rounded-xl text-red-600 focus:text-red-600"
                    onSelect={() => {
                      void signOut();
                    }}
                  >
                    <LogOut className="mr-2 h-4 w-4" />
                    Esci dall'account
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          <div className="grid gap-6 px-6 py-6 xl:grid-cols-[1fr_1fr]">
            <div className="space-y-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-lg font-semibold text-slate-900">
                    Club di proprieta
                  </p>
                  <p className="text-sm text-slate-500">
                    Qui trovi tutti i club che hai creato e che puoi amministrare
                    come proprietario.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge className="rounded-full bg-amber-50 text-amber-700 hover:bg-amber-50">
                    <Crown className="mr-1 h-3.5 w-3.5" />
                    {ownedClubs.length} club
                  </Badge>
                  <Badge className="rounded-full bg-slate-100 text-slate-700 hover:bg-slate-100">
                    {clubSlotLimit === null
                      ? "Slot illimitati"
                      : `${availableClubSlots} slot disponibili`}
                  </Badge>
                  <Button
                    type="button"
                    className="rounded-full bg-blue-600 hover:bg-blue-700"
                    onClick={() => setCreateClubOpen(true)}
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    Crea nuovo club
                  </Button>
                </div>
              </div>

              {ownedClubs.length === 0 ? (
                <AccountEmptyState
                  icon={<Building2 className="h-9 w-9" />}
                  title="Nessun club di proprieta"
                  description="Il tuo account utente e separato dai club: da qui puoi crearne uno nuovo, completare gia molte informazioni societarie e poi decidere quando aprirne la dashboard."
                  actionLabel="Crea il primo club"
                  onAction={() => setCreateClubOpen(true)}
                />
              ) : (
                <div className="grid gap-4">
                  {ownedClubs.map((club) => (
                    <AccountClubCard
                      key={club.id}
                      club={club}
                      activeClubId={activeClubId}
                      switchingClubId={switchingClubId}
                      ownerMode
                      onSetActive={() => {
                        void persistActiveClub(club).catch((error: any) => {
                          showToast(
                            "error",
                            error?.message || "Errore cambio club attivo",
                          );
                        });
                      }}
                      onOpen={() => {
                        void openClubArea(club);
                      }}
                    />
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-lg font-semibold text-slate-900">
                    Club con accesso assegnato
                  </p>
                  <p className="text-sm text-slate-500">
                    Inserisci un token condiviso da un club per collegare questo
                    account con il ruolo che ti e stato assegnato.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge className="rounded-full bg-violet-50 text-violet-700 hover:bg-violet-50">
                    <Users className="mr-1 h-3.5 w-3.5" />
                    {accessClubs.length} accessi
                  </Badge>
                  <Button
                    type="button"
                    variant="outline"
                    className="rounded-full border-blue-200 bg-white text-blue-700 hover:bg-blue-50"
                    onClick={() => setRedeemAccessOpen(true)}
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    Aggiungi accesso
                  </Button>
                </div>
              </div>

              {accessClubs.length === 0 ? (
                <AccountEmptyState
                  icon={<Users className="h-9 w-9" />}
                  title="Nessun accesso esterno collegato"
                  description="Quando un club ti condivide un token di accesso, lo inserisci qui e il relativo ruolo viene aggiunto al tuo account in modo ordinato e reperibile."
                  actionLabel="Inserisci un token"
                  onAction={() => setRedeemAccessOpen(true)}
                />
              ) : (
                <div className="grid gap-4">
                  {accessClubs.map((club) => (
                    <AccountClubCard
                      key={club.id}
                      club={club}
                      activeClubId={activeClubId}
                      switchingClubId={switchingClubId}
                      ownerMode={false}
                      onSetActive={() => {
                        void persistActiveClub(club).catch((error: any) => {
                          showToast(
                            "error",
                            error?.message || "Errore cambio club attivo",
                          );
                        });
                      }}
                      onOpen={() => {
                        void openClubArea(club);
                      }}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
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
