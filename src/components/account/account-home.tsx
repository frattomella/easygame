"use client";

import {
  ChangeEvent,
  FormEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/providers/AuthProvider";
import { apiRequest } from "@/lib/api/client";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast-notification";
import {
  ArrowRight,
  Building2,
  Camera,
  CheckCircle2,
  Crown,
  KeyRound,
  Loader2,
  LogOut,
  Mail,
  Phone,
  Plus,
  ShieldCheck,
  Upload,
  UserCircle2,
  Users,
} from "lucide-react";

type MembershipRecord = {
  organization_id: string;
  role: string;
  is_primary?: boolean;
  organizations?: {
    id?: string;
    name?: string | null;
    logo_url?: string | null;
    creator_id?: string | null;
    contact_email?: string | null;
    contact_phone?: string | null;
    city?: string | null;
    province?: string | null;
    created_at?: string | null;
  } | null;
};

type AccountClub = {
  id: string;
  name: string;
  role: string;
  roleLabel: string;
  isPrimary: boolean;
  logoUrl?: string | null;
  city?: string | null;
  province?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  createdAt?: string | null;
};

const getRoleLabel = (role: string) => {
  switch (role) {
    case "owner":
      return "Proprietario";
    case "admin":
      return "Amministratore";
    case "trainer":
      return "Allenatore";
    case "athlete":
      return "Atleta";
    case "parent":
      return "Genitore";
    default:
      return "Collaboratore";
  }
};

const formatDate = (value?: string | null) => {
  if (!value) return "-";

  try {
    return new Date(value).toLocaleDateString("it-IT");
  } catch {
    return "-";
  }
};

const sortClubsByName = (clubs: AccountClub[]) =>
  [...clubs].sort((left, right) => {
    if (left.isPrimary && !right.isPrimary) return -1;
    if (!left.isPrimary && right.isPrimary) return 1;
    return left.name.localeCompare(right.name);
  });

const getInitials = (value: string) =>
  value
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("") || "EG";

export default function AccountHome() {
  const router = useRouter();
  const { showToast } = useToast();
  const { user, loading, activeClub, setActiveClub, signOut } = useAuth();
  const avatarInputRef = useRef<HTMLInputElement | null>(null);

  const [pageLoading, setPageLoading] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [creatingClub, setCreatingClub] = useState(false);
  const [switchingClubId, setSwitchingClubId] = useState<string | null>(null);
  const [createClubOpen, setCreateClubOpen] = useState(false);

  const [profileForm, setProfileForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    avatarUrl: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [createClubForm, setCreateClubForm] = useState({
    name: "",
    city: "",
    contactEmail: "",
    contactPhone: "",
  });
  const [ownedClubs, setOwnedClubs] = useState<AccountClub[]>([]);
  const [accessClubs, setAccessClubs] = useState<AccountClub[]>([]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const params = new URLSearchParams(window.location.search);
    if (params.get("openCreateClub") === "1") {
      setCreateClubOpen(true);
    }
  }, []);

  useEffect(() => {
    if (loading) {
      return;
    }

    if (!user?.id) {
      router.replace("/login");
      return;
    }

    setProfileForm({
      firstName: user.user_metadata?.firstName || "",
      lastName: user.user_metadata?.lastName || "",
      email: user.email || "",
      phone: user.user_metadata?.phone || "",
      avatarUrl: user.user_metadata?.avatarUrl || "",
      newPassword: "",
      confirmPassword: "",
    });

    setCreateClubForm((previous) => ({
      ...previous,
      contactEmail: user.email || previous.contactEmail,
      contactPhone: user.user_metadata?.phone || previous.contactPhone,
    }));
  }, [loading, router, user]);

  useEffect(() => {
    if (!user?.id) {
      return;
    }

    const loadMemberships = async () => {
      setPageLoading(true);

      const response = await apiRequest<MembershipRecord[]>(
        "/api/v1/auth/memberships",
      );

      if (response.error) {
        showToast("error", response.error.message || "Errore caricamento club");
        setOwnedClubs([]);
        setAccessClubs([]);
        setPageLoading(false);
        return;
      }

      const memberships = Array.isArray(response.data)
        ? (response.data as MembershipRecord[])
        : [];

      const mappedClubs = memberships
        .map((membership) => {
          const organization = membership.organizations || {};
          return {
            id: membership.organization_id,
            name: organization.name || "Club",
            role: membership.role,
            roleLabel: getRoleLabel(membership.role),
            isPrimary: Boolean(membership.is_primary),
            logoUrl: organization.logo_url || null,
            city: organization.city || null,
            province: organization.province || null,
            contactEmail: organization.contact_email || null,
            contactPhone: organization.contact_phone || null,
            createdAt: organization.created_at || null,
            ownerId: organization.creator_id || null,
          };
        })
        .sort((left, right) => {
          if (left.isPrimary && !right.isPrimary) return -1;
          if (!left.isPrimary && right.isPrimary) return 1;
          return left.name.localeCompare(right.name);
        });

      const nextOwnedClubs = mappedClubs
        .filter((club) => club.role === "owner" || club.ownerId === user.id)
        .map(({ ownerId, ...club }) => club);
      const nextAccessClubs = mappedClubs
        .filter((club) => !(club.role === "owner" || club.ownerId === user.id))
        .map(({ ownerId, ...club }) => club);

      setOwnedClubs(nextOwnedClubs);
      setAccessClubs(nextAccessClubs);

      if (
        memberships.length === 0 &&
        (user.user_metadata?.isClubCreator || user.user_metadata?.createClub)
      ) {
        setCreateClubOpen(true);
      }

      setPageLoading(false);
    };

    loadMemberships();
  }, [showToast, user]);

  const clubSlotLimit = useMemo(() => {
    const rawLimit = Number(user?.user_metadata?.clubSlotLimit);
    return Number.isFinite(rawLimit) && rawLimit > 0 ? rawLimit : null;
  }, [user?.user_metadata?.clubSlotLimit]);

  const availableClubSlots =
    clubSlotLimit === null ? null : Math.max(clubSlotLimit - ownedClubs.length, 0);

  const emailVerified = Boolean(user?.user_metadata?.emailVerified);
  const phoneVerified = Boolean(user?.user_metadata?.phoneVerified);
  const activeClubId = activeClub?.id || null;
  const accountDisplayName =
    [profileForm.firstName, profileForm.lastName].filter(Boolean).join(" ") ||
    user?.user_metadata?.name ||
    user?.email ||
    "Utente EasyGame";

  const updateProfileField = (
    field: keyof typeof profileForm,
    value: string,
  ) => {
    setProfileForm((previous) => ({
      ...previous,
      [field]: value,
    }));
  };

  const updateCreateClubField = (
    field: keyof typeof createClubForm,
    value: string,
  ) => {
    setCreateClubForm((previous) => ({
      ...previous,
      [field]: value,
    }));
  };

  const markClubAsPrimary = (clubId: string) => {
    setOwnedClubs((previous) =>
      sortClubsByName(
        previous.map((club) => ({
          ...club,
          isPrimary: club.id === clubId,
        })),
      ),
    );
    setAccessClubs((previous) =>
      sortClubsByName(
        previous.map((club) => ({
          ...club,
          isPrimary: club.id === clubId,
        })),
      ),
    );
  };

  const persistActiveClub = async (club: AccountClub) => {
    if (!user?.id) {
      return;
    }

    setSwitchingClubId(club.id);

    const clearPrimaryResponse = await supabase
      .from("organization_users")
      .update({ is_primary: false })
      .eq("user_id", user.id);

    if (clearPrimaryResponse.error) {
      setSwitchingClubId(null);
      throw new Error(
        clearPrimaryResponse.error.message || "Impossibile aggiornare il club attivo",
      );
    }

    const setPrimaryResponse = await supabase
      .from("organization_users")
      .update({ is_primary: true })
      .match({
        user_id: user.id,
        organization_id: club.id,
      });

    if (setPrimaryResponse.error) {
      setSwitchingClubId(null);
      throw new Error(
        setPrimaryResponse.error.message || "Impossibile impostare il club attivo",
      );
    }

    const nextActiveClub = {
      id: club.id,
      role: club.role,
      roleLabel: club.roleLabel,
      name: club.name,
      logo_url: club.logoUrl || null,
      email: club.contactEmail || null,
      phone: club.contactPhone || null,
    };

    markClubAsPrimary(club.id);
    window.localStorage.setItem("activeClub", JSON.stringify(nextActiveClub));
    window.localStorage.setItem(
      `activeClub_${user.id}`,
      JSON.stringify(nextActiveClub),
    );
    setActiveClub(nextActiveClub);
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

  const handleAvatarUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    if (!file.type.startsWith("image/")) {
      showToast("error", "Seleziona un file immagine valido");
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      showToast("error", "L'immagine profilo deve essere sotto i 2 MB");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      updateProfileField("avatarUrl", String(reader.result || ""));
    };
    reader.readAsDataURL(file);
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

    setProfileForm((previous) => ({
      ...previous,
      newPassword: "",
      confirmPassword: "",
    }));

    if (emailChanged || phoneChanged) {
      showToast(
        "success",
        "Profilo aggiornato. Email e telefono modificati richiederanno una nuova verifica.",
      );
    } else {
      showToast("success", "Profilo aggiornato correttamente");
    }

    setSavingProfile(false);
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

    setCreatingClub(true);

    const response = await supabase
      .from("clubs")
      .insert([
        {
          name: createClubForm.name.trim(),
          city: createClubForm.city.trim() || null,
          creator_id: user.id,
          contact_email: createClubForm.contactEmail.trim() || user.email,
          contact_phone:
            createClubForm.contactPhone.trim() || user.user_metadata?.phone || null,
          members: [
            {
              user_id: user.id,
              role: "owner",
              is_primary: ownedClubs.length === 0 && accessClubs.length === 0,
            },
          ],
          dashboard_data: {
            settings: {
              theme: "default",
              layout: "standard",
              widgets: ["metrics", "activities", "trainings", "certifications"],
            },
          },
        },
      ])
      .select("*");

    if (response.error) {
      showToast("error", response.error.message || "Errore creazione club");
      setCreatingClub(false);
      return;
    }

    const createdClub = Array.isArray(response.data) ? response.data[0] : null;

    if (!createdClub) {
      showToast("error", "Club creato ma non recuperato correttamente");
      setCreatingClub(false);
      return;
    }

    const nextClub: AccountClub = {
      id: createdClub.id,
      name: createdClub.name || createClubForm.name.trim(),
      role: "owner",
      roleLabel: "Proprietario",
      isPrimary: ownedClubs.length === 0 && accessClubs.length === 0,
      logoUrl: createdClub.logo_url || null,
      city: createdClub.city || null,
      province: createdClub.province || null,
      contactEmail: createdClub.contact_email || null,
      contactPhone: createdClub.contact_phone || null,
      createdAt: createdClub.created_at || null,
    };

    setOwnedClubs((previous) => sortClubsByName([...previous, nextClub]));
    setCreateClubForm({
      name: "",
      city: "",
      contactEmail: user.email || "",
      contactPhone: user.user_metadata?.phone || "",
    });
    setCreateClubOpen(false);

    if (nextClub.isPrimary || !activeClubId) {
      try {
        await persistActiveClub(nextClub);
      } catch (error: any) {
        showToast(
          "error",
          error?.message || "Club creato ma non impostato come attivo",
        );
      }
    }

    showToast(
      "success",
      `Club ${nextClub.name} creato correttamente. Ora puoi aprire la dashboard quando vuoi.`,
    );
    setCreatingClub(false);
  };

  if (loading || pageLoading) {
    return (
      <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.18),_transparent_40%),linear-gradient(180deg,#f8fbff_0%,#eef4ff_45%,#f8fafc_100%)] px-4 py-10">
        <div className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-5xl items-center justify-center rounded-[32px] border border-white/70 bg-white/80 shadow-2xl backdrop-blur">
          <div className="flex items-center gap-3 text-slate-600">
            <Loader2 className="h-5 w-5 animate-spin" />
            Caricamento home account...
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.18),_transparent_40%),linear-gradient(180deg,#f8fbff_0%,#eef4ff_45%,#f8fafc_100%)] px-4 py-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="rounded-[32px] bg-gradient-to-r from-blue-700 via-blue-600 to-sky-500 p-6 text-white shadow-2xl">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-3">
              <div className="inline-flex items-center rounded-full bg-white/15 px-4 py-1 text-sm backdrop-blur">
                EasyGame Home
              </div>
              <div className="space-y-2">
                <h1 className="text-3xl font-semibold">{accountDisplayName}</h1>
                <p className="max-w-2xl text-blue-100">
                  Questa e la tua home privata dopo il login. Da qui scegli quale
                  club aprire, ne crei di nuovi e gestisci tutto il profilo del tuo
                  account utente.
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <div className="rounded-2xl border border-white/15 bg-white/10 px-4 py-3 backdrop-blur">
                <p className="text-xs uppercase tracking-[0.24em] text-blue-100">
                  Club attivo
                </p>
                <p className="mt-2 font-semibold">
                  {activeClub?.name || "Nessun club selezionato"}
                </p>
              </div>
              <Button
                type="button"
                variant="secondary"
                className="bg-white text-blue-700 hover:bg-blue-50"
                onClick={() => signOut()}
              >
                <LogOut className="mr-2 h-4 w-4" />
                Esci
              </Button>
            </div>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Card className="border-blue-100">
            <CardContent className="flex items-center gap-4 p-5">
              <div className="rounded-2xl bg-blue-100 p-3 text-blue-700">
                <UserCircle2 className="h-6 w-6" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Account utente</p>
                <p className="font-semibold">{accountDisplayName}</p>
              </div>
            </CardContent>
          </Card>

          <Card className="border-emerald-100">
            <CardContent className="flex items-center gap-4 p-5">
              <div className="rounded-2xl bg-emerald-100 p-3 text-emerald-700">
                <ShieldCheck className="h-6 w-6" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Verifiche</p>
                <div className="flex gap-2 pt-1">
                  <Badge variant={emailVerified ? "default" : "secondary"}>
                    Email {emailVerified ? "ok" : "pending"}
                  </Badge>
                  <Badge variant={phoneVerified ? "default" : "secondary"}>
                    Cellulare {phoneVerified ? "ok" : "pending"}
                  </Badge>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-amber-100">
            <CardContent className="flex items-center gap-4 p-5">
              <div className="rounded-2xl bg-amber-100 p-3 text-amber-700">
                <Crown className="h-6 w-6" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Club di proprieta</p>
                <p className="font-semibold">{ownedClubs.length}</p>
              </div>
            </CardContent>
          </Card>

          <Card className="border-purple-100">
            <CardContent className="flex items-center gap-4 p-5">
              <div className="rounded-2xl bg-purple-100 p-3 text-purple-700">
                <Users className="h-6 w-6" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Accessi esterni</p>
                <p className="font-semibold">{accessClubs.length}</p>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-6 xl:grid-cols-[1.35fr_0.95fr]">
          <div className="space-y-6">
            <Card className="border-blue-100 shadow-sm">
              <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-1">
                  <CardTitle>Club di proprieta</CardTitle>
                  <p className="text-sm text-muted-foreground">
                    Qui scegli quale dashboard aprire tra i club che possiedi.
                  </p>
                </div>
                <div className="flex flex-col items-start gap-3 sm:items-end">
                  <div className="text-sm text-muted-foreground">
                    Slot disponibili:{" "}
                    <span className="font-medium text-slate-900">
                      {clubSlotLimit === null ? "Illimitati" : availableClubSlots}
                    </span>
                  </div>
                  <Button
                    type="button"
                    onClick={() => setCreateClubOpen((previous) => !previous)}
                    disabled={
                      clubSlotLimit !== null && ownedClubs.length >= clubSlotLimit
                    }
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    {createClubOpen ? "Chiudi creazione" : "Crea nuovo club"}
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {createClubOpen && (
                  <div className="rounded-2xl border border-blue-100 bg-blue-50/60 p-4">
                    <form onSubmit={createOwnedClub} className="space-y-4">
                      <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-2">
                          <Label htmlFor="club-name">Nome club</Label>
                          <Input
                            id="club-name"
                            value={createClubForm.name}
                            onChange={(event) =>
                              updateCreateClubField("name", event.target.value)
                            }
                            placeholder="Es. EasyGame Academy"
                            required
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="club-city">Citta</Label>
                          <Input
                            id="club-city"
                            value={createClubForm.city}
                            onChange={(event) =>
                              updateCreateClubField("city", event.target.value)
                            }
                            placeholder="Es. Roma"
                          />
                        </div>
                      </div>

                      <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-2">
                          <Label htmlFor="club-email">Email contatto</Label>
                          <Input
                            id="club-email"
                            type="email"
                            value={createClubForm.contactEmail}
                            onChange={(event) =>
                              updateCreateClubField("contactEmail", event.target.value)
                            }
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="club-phone">Telefono contatto</Label>
                          <Input
                            id="club-phone"
                            type="tel"
                            value={createClubForm.contactPhone}
                            onChange={(event) =>
                              updateCreateClubField("contactPhone", event.target.value)
                            }
                          />
                        </div>
                      </div>

                      <Button
                        type="submit"
                        disabled={creatingClub || !createClubForm.name.trim()}
                      >
                        {creatingClub ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <Plus className="mr-2 h-4 w-4" />
                        )}
                        Salva nuovo club
                      </Button>
                    </form>
                  </div>
                )}

                {ownedClubs.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-5 py-10 text-center">
                    <Building2 className="mx-auto mb-3 h-10 w-10 text-slate-300" />
                    <p className="font-medium text-slate-900">
                      Non hai ancora club di proprieta
                    </p>
                    <p className="mt-2 text-sm text-slate-500">
                      Crea il primo club da questa home e poi decidi quando aprire la
                      sua dashboard.
                    </p>
                  </div>
                ) : (
                  <div className="grid gap-4 lg:grid-cols-2">
                    {ownedClubs.map((club) => (
                      <div
                        key={club.id}
                        className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-lg font-semibold text-slate-900">
                              {club.name}
                            </p>
                            <p className="mt-1 text-sm text-slate-500">
                              Creato il {formatDate(club.createdAt)}
                            </p>
                          </div>
                          <div className="flex flex-wrap justify-end gap-2">
                            <Badge variant="secondary">{club.roleLabel}</Badge>
                            {club.isPrimary || activeClubId === club.id ? (
                              <Badge>Attivo</Badge>
                            ) : null}
                          </div>
                        </div>

                        <div className="mt-4 grid gap-3 text-sm text-slate-500 md:grid-cols-2">
                          <div>
                            <p className="font-medium text-slate-900">Localita</p>
                            <p>
                              {[club.city, club.province].filter(Boolean).join(", ") ||
                                "Non indicata"}
                            </p>
                          </div>
                          <div>
                            <p className="font-medium text-slate-900">Contatti</p>
                            <p>{club.contactEmail || "Email non indicata"}</p>
                            <p>{club.contactPhone || "Telefono non indicato"}</p>
                          </div>
                        </div>

                        <div className="mt-5 flex flex-wrap gap-3">
                          <Button
                            type="button"
                            variant="outline"
                            disabled={switchingClubId === club.id}
                            onClick={() => persistActiveClub(club)}
                          >
                            {switchingClubId === club.id ? (
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                              <CheckCircle2 className="mr-2 h-4 w-4" />
                            )}
                            Rendi attivo
                          </Button>
                          <Button type="button" onClick={() => openClubArea(club)}>
                            <ArrowRight className="mr-2 h-4 w-4" />
                            Apri dashboard
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="border-purple-100 shadow-sm">
              <CardHeader>
                <CardTitle>Club con accesso assegnato</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Qui trovi i club non tuoi ai quali accedi con un ruolo specifico.
                </p>
              </CardHeader>
              <CardContent>
                {accessClubs.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-5 py-10 text-center">
                    <Users className="mx-auto mb-3 h-10 w-10 text-slate-300" />
                    <p className="font-medium text-slate-900">
                      Nessun accesso esterno disponibile
                    </p>
                    <p className="mt-2 text-sm text-slate-500">
                      Quando ti viene assegnato un ruolo in un altro club, lo trovi
                      qui e puoi aprirne subito l'area dedicata.
                    </p>
                  </div>
                ) : (
                  <div className="grid gap-4 lg:grid-cols-2">
                    {accessClubs.map((club) => (
                      <div
                        key={club.id}
                        className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-lg font-semibold text-slate-900">
                              {club.name}
                            </p>
                            <p className="mt-1 text-sm text-slate-500">
                              Accesso come {club.roleLabel.toLowerCase()}
                            </p>
                          </div>
                          <div className="flex flex-wrap justify-end gap-2">
                            <Badge variant="secondary">{club.roleLabel}</Badge>
                            {club.isPrimary || activeClubId === club.id ? (
                              <Badge>Attivo</Badge>
                            ) : null}
                          </div>
                        </div>

                        <div className="mt-4 grid gap-3 text-sm text-slate-500 md:grid-cols-2">
                          <div>
                            <p className="font-medium text-slate-900">Localita</p>
                            <p>
                              {[club.city, club.province].filter(Boolean).join(", ") ||
                                "Non indicata"}
                            </p>
                          </div>
                          <div>
                            <p className="font-medium text-slate-900">Contatti</p>
                            <p>{club.contactEmail || "Email non indicata"}</p>
                            <p>{club.contactPhone || "Telefono non indicato"}</p>
                          </div>
                        </div>

                        <div className="mt-5 flex flex-wrap gap-3">
                          <Button
                            type="button"
                            variant="outline"
                            disabled={switchingClubId === club.id}
                            onClick={() => persistActiveClub(club)}
                          >
                            {switchingClubId === club.id ? (
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                              <CheckCircle2 className="mr-2 h-4 w-4" />
                            )}
                            Imposta attivo
                          </Button>
                          <Button type="button" onClick={() => openClubArea(club)}>
                            <ArrowRight className="mr-2 h-4 w-4" />
                            {club.role === "trainer"
                              ? "Apri area trainer"
                              : "Apri area"}
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6">
            <Card className="border-blue-100 shadow-sm">
              <CardHeader>
                <CardTitle>Profilo account</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Gestisci immagine profilo, dati personali, contatti e password.
                </p>
              </CardHeader>
              <CardContent>
                <form onSubmit={saveProfile} className="space-y-5">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                    <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-3xl bg-blue-100 text-xl font-semibold text-blue-700">
                      {profileForm.avatarUrl ? (
                        <img
                          src={profileForm.avatarUrl}
                          alt="Immagine profilo"
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        getInitials(accountDisplayName)
                      )}
                    </div>
                    <div className="space-y-3">
                      <div>
                        <p className="font-medium text-slate-900">
                          Immagine profilo
                        </p>
                        <p className="text-sm text-slate-500">
                          Carica una foto per riconoscere subito il tuo account.
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-3">
                        <input
                          ref={avatarInputRef}
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={handleAvatarUpload}
                        />
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => avatarInputRef.current?.click()}
                        >
                          <Upload className="mr-2 h-4 w-4" />
                          Carica foto
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => updateProfileField("avatarUrl", "")}
                        >
                          <Camera className="mr-2 h-4 w-4" />
                          Rimuovi foto
                        </Button>
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="first-name">Nome</Label>
                      <Input
                        id="first-name"
                        value={profileForm.firstName}
                        onChange={(event) =>
                          updateProfileField("firstName", event.target.value)
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="last-name">Cognome</Label>
                      <Input
                        id="last-name"
                        value={profileForm.lastName}
                        onChange={(event) =>
                          updateProfileField("lastName", event.target.value)
                        }
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="email">Email accesso</Label>
                    <Input
                      id="email"
                      type="email"
                      value={profileForm.email}
                      onChange={(event) =>
                        updateProfileField("email", event.target.value)
                      }
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="phone">Cellulare</Label>
                    <Input
                      id="phone"
                      type="tel"
                      value={profileForm.phone}
                      onChange={(event) =>
                        updateProfileField("phone", event.target.value)
                      }
                    />
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="new-password">Nuova password</Label>
                      <Input
                        id="new-password"
                        type="password"
                        value={profileForm.newPassword}
                        onChange={(event) =>
                          updateProfileField("newPassword", event.target.value)
                        }
                        placeholder="Lascia vuoto per non cambiarla"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="confirm-password">Conferma password</Label>
                      <Input
                        id="confirm-password"
                        type="password"
                        value={profileForm.confirmPassword}
                        onChange={(event) =>
                          updateProfileField("confirmPassword", event.target.value)
                        }
                        placeholder="Ripeti la nuova password"
                      />
                    </div>
                  </div>

                  <Button type="submit" disabled={savingProfile}>
                    {savingProfile ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <CheckCircle2 className="mr-2 h-4 w-4" />
                    )}
                    Salva profilo
                  </Button>
                </form>
              </CardContent>
            </Card>

            <Card className="border-emerald-100 shadow-sm">
              <CardHeader>
                <CardTitle>Verifica e sicurezza</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-2xl border border-slate-200 p-4">
                  <div className="mb-2 flex items-center gap-2 text-sm font-medium text-slate-900">
                    <Mail className="h-4 w-4 text-blue-600" />
                    Email
                  </div>
                  <p className="text-sm text-slate-500">{user?.email}</p>
                  <Badge className="mt-3" variant={emailVerified ? "default" : "secondary"}>
                    {emailVerified ? "Verificata" : "Da verificare"}
                  </Badge>
                </div>

                <div className="rounded-2xl border border-slate-200 p-4">
                  <div className="mb-2 flex items-center gap-2 text-sm font-medium text-slate-900">
                    <Phone className="h-4 w-4 text-blue-600" />
                    Cellulare
                  </div>
                  <p className="text-sm text-slate-500">
                    {user?.user_metadata?.phone || "Non configurato"}
                  </p>
                  <Badge className="mt-3" variant={phoneVerified ? "default" : "secondary"}>
                    {phoneVerified ? "Verificato" : "Da verificare"}
                  </Badge>
                </div>

                <div className="rounded-2xl border border-slate-200 p-4">
                  <div className="mb-2 flex items-center gap-2 text-sm font-medium text-slate-900">
                    <KeyRound className="h-4 w-4 text-blue-600" />
                    Sicurezza account
                  </div>
                  <p className="text-sm text-slate-500">
                    Se cambi email o numero di cellulare, EasyGame richiede una
                    nuova verifica per mantenere il profilo sicuro.
                  </p>
                </div>

                <div className="rounded-2xl border border-slate-200 p-4">
                  <div className="mb-2 flex items-center gap-2 text-sm font-medium text-slate-900">
                    <Building2 className="h-4 w-4 text-blue-600" />
                    Club attivo
                  </div>
                  <p className="text-sm text-slate-500">
                    {activeClub?.name || "Nessun club attivo selezionato"}
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
