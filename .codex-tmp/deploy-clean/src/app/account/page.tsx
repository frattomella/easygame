export { default } from "@/components/account/account-home-screen";
/*
"use client";

import AccountHome from "@/components/account/account-home";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Sidebar from "@/components/dashboard/Sidebar";
import Header from "@/components/dashboard/Header";
import { useAuth } from "@/components/providers/AuthProvider";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast-notification";
import {
  ArrowRight,
  Building2,
  CheckCircle2,
  Crown,
  KeyRound,
  Loader2,
  Mail,
  Phone,
  Plus,
  ShieldCheck,
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

type AccountTab = "profile" | "owned" | "access";

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
  if (!value) {
    return "-";
  }

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

export default function AccountPage() {
  return <AccountHome />;

  const router = useRouter();
  const { showToast } = useToast();
  const { user, loading, activeClub, setActiveClub } = useAuth();

  const [activeTab, setActiveTab] = useState<AccountTab>("profile");
  const [pageLoading, setPageLoading] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [creatingClub, setCreatingClub] = useState(false);
  const [switchingClubId, setSwitchingClubId] = useState<string | null>(null);

  const [profileForm, setProfileForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [createClubOpen, setCreateClubOpen] = useState(false);
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
      setActiveTab("owned");
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

      const response = await supabase
        .from("organization_users")
        .select(
          "organization_id, role, is_primary, organizations(id, name, logo_url, creator_id, contact_email, contact_phone, city, province, created_at)",
        )
        .eq("user_id", user.id);

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
      setPageLoading(false);
    };

    loadMemberships();
  }, [showToast, user?.id]);

  const clubSlotLimit = useMemo(() => {
    const rawLimit = Number(user?.user_metadata?.clubSlotLimit);
    return Number.isFinite(rawLimit) && rawLimit > 0 ? rawLimit : null;
  }, [user?.user_metadata?.clubSlotLimit]);

  const availableClubSlots =
    clubSlotLimit === null ? null : Math.max(clubSlotLimit - ownedClubs.length, 0);

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

      showToast(
        "success",
        `Accesso ${club.roleLabel.toLowerCase()} impostato su ${club.name}`,
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
        "Profilo aggiornato. Email e telefono modificati richiederanno una nuova verifica al prossimo accesso.",
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
    setActiveTab("owned");
    showToast("success", `Club ${nextClub.name} creato correttamente`);

    try {
      await persistActiveClub(nextClub);
      router.push(`/dashboard?clubId=${nextClub.id}`);
    } catch (error: any) {
      showToast(
        "error",
        error?.message || "Club creato ma non impostato come attivo",
      );
    } finally {
      setCreatingClub(false);
    }
  };

  if (loading || pageLoading) {
    return (
      <div className="flex h-screen bg-background">
        <Sidebar />
        <div className="flex flex-1 items-center justify-center">
          <div className="flex items-center gap-3 text-slate-600">
            <Loader2 className="h-5 w-5 animate-spin" />
            Caricamento account...
          </div>
        </div>
      </div>
    );
  }

  const emailVerified = Boolean(user?.user_metadata?.emailVerified);
  const phoneVerified = Boolean(user?.user_metadata?.phoneVerified);
  const activeClubId = activeClub?.id || null;
  const accountDisplayName =
    [profileForm.firstName, profileForm.lastName].filter(Boolean).join(" ") ||
    user?.user_metadata?.name ||
    user?.email ||
    "Utente EasyGame";

  return (
    <div className="flex h-screen bg-background">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header title="Account e Club" />
        <div className="flex-1 overflow-y-auto p-6">
          <div className="mx-auto max-w-7xl space-y-6">
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
                        Email {emailVerified ? "verificata" : "da verificare"}
                      </Badge>
                      <Badge variant={phoneVerified ? "default" : "secondary"}>
                        Cellulare {phoneVerified ? "verificato" : "da verificare"}
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
                    <p className="text-sm text-muted-foreground">Accessi ad altri club</p>
                    <p className="font-semibold">{accessClubs.length}</p>
                  </div>
                </CardContent>
              </Card>
            </div>

            <Tabs
              value={activeTab}
              onValueChange={(value) => setActiveTab(value as AccountTab)}
              className="space-y-6"
            >
              <TabsList className="grid w-full max-w-[720px] grid-cols-3">
                <TabsTrigger value="profile">Profilo</TabsTrigger>
                <TabsTrigger value="owned">Club di proprieta</TabsTrigger>
                <TabsTrigger value="access">Accessi</TabsTrigger>
              </TabsList>

              <TabsContent value="profile" className="space-y-6">
                <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
                  <Card>
                    <CardHeader>
                      <CardTitle>Dati account</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <form onSubmit={saveProfile} className="space-y-4">
                        <div className="grid gap-4 md:grid-cols-2">
                          <div className="space-y-2">
                            <Label htmlFor="first-name">Nome</Label>
                            <Input id="first-name" value={profileForm.firstName} onChange={(event) => updateProfileField("firstName", event.target.value)} />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="last-name">Cognome</Label>
                            <Input id="last-name" value={profileForm.lastName} onChange={(event) => updateProfileField("lastName", event.target.value)} />
                          </div>
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="email">Email accesso</Label>
                          <Input id="email" type="email" value={profileForm.email} onChange={(event) => updateProfileField("email", event.target.value)} />
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="phone">Cellulare</Label>
                          <Input id="phone" type="tel" value={profileForm.phone} onChange={(event) => updateProfileField("phone", event.target.value)} />
                        </div>

                        <div className="grid gap-4 md:grid-cols-2">
                          <div className="space-y-2">
                            <Label htmlFor="new-password">Nuova password</Label>
                            <Input id="new-password" type="password" value={profileForm.newPassword} onChange={(event) => updateProfileField("newPassword", event.target.value)} placeholder="Lascia vuoto per non cambiarla" />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="confirm-password">Conferma password</Label>
                            <Input id="confirm-password" type="password" value={profileForm.confirmPassword} onChange={(event) => updateProfileField("confirmPassword", event.target.value)} placeholder="Ripeti la nuova password" />
                          </div>
                        </div>

                        <Button type="submit" disabled={savingProfile}>
                          {savingProfile ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
                          Salva profilo
                        </Button>
                      </form>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle>Stato account</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="rounded-xl border border-slate-200 p-4">
                        <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                          <Mail className="h-4 w-4 text-blue-600" />
                          Email
                        </div>
                        <p className="text-sm text-muted-foreground">{user?.email}</p>
                        <Badge className="mt-3" variant={emailVerified ? "default" : "secondary"}>
                          {emailVerified ? "Verificata" : "Da verificare"}
                        </Badge>
                      </div>

                      <div className="rounded-xl border border-slate-200 p-4">
                        <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                          <Phone className="h-4 w-4 text-blue-600" />
                          Cellulare
                        </div>
                        <p className="text-sm text-muted-foreground">{user?.user_metadata?.phone || "Non configurato"}</p>
                        <Badge className="mt-3" variant={phoneVerified ? "default" : "secondary"}>
                          {phoneVerified ? "Verificato" : "Da verificare"}
                        </Badge>
                      </div>

                      <div className="rounded-xl border border-slate-200 p-4">
                        <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                          <KeyRound className="h-4 w-4 text-blue-600" />
                          Sicurezza account
                        </div>
                        <p className="text-sm text-muted-foreground">
                          Gestisci password, email e numero di accesso da questa
                          schermata. Quando cambi email o cellulare, lo stato di
                          verifica viene azzerato.
                        </p>
                      </div>

                      <div className="rounded-xl border border-slate-200 p-4">
                        <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                          <Building2 className="h-4 w-4 text-blue-600" />
                          Club attivo
                        </div>
                        <p className="text-sm text-muted-foreground">{activeClub?.name || "Nessun club attivo selezionato"}</p>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>

              <TabsContent value="owned" className="space-y-6">
                <div className="grid gap-4 md:grid-cols-3">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Slot club</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-2xl font-semibold">
                        {clubSlotLimit === null ? "Illimitati" : availableClubSlots}
                      </p>
                      <p className="mt-2 text-sm text-muted-foreground">
                        {clubSlotLimit === null
                          ? "Nessun limite slot configurato per questo account."
                          : `${ownedClubs.length} su ${clubSlotLimit} slot utilizzati.`}
                      </p>
                    </CardContent>
                  </Card>

                  <Card className="md:col-span-2">
                    <CardHeader>
                      <CardTitle className="text-base">Nuovo club</CardTitle>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                      <div>
                        <p className="font-medium">Crea un nuovo club proprietario</p>
                        <p className="text-sm text-muted-foreground">
                          Il club viene collegato al tuo account utente e gestito
                          separatamente dagli accessi esterni.
                        </p>
                      </div>
                      <Button
                        onClick={() => setCreateClubOpen((previous) => !previous)}
                        disabled={
                          clubSlotLimit !== null && ownedClubs.length >= clubSlotLimit
                        }
                      >
                        <Plus className="mr-2 h-4 w-4" />
                        {createClubOpen ? "Chiudi" : "Crea club"}
                      </Button>
                    </CardContent>
                  </Card>
                </div>

                {createClubOpen && (
                  <Card>
                    <CardHeader>
                      <CardTitle>Configura un nuovo club</CardTitle>
                    </CardHeader>
                    <CardContent>
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
                                updateCreateClubField(
                                  "contactEmail",
                                  event.target.value,
                                )
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
                                updateCreateClubField(
                                  "contactPhone",
                                  event.target.value,
                                )
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
                          Crea club
                        </Button>
                      </form>
                    </CardContent>
                  </Card>
                )}

                <div className="grid gap-4 xl:grid-cols-2">
                  {ownedClubs.length === 0 && (
                    <Card className="xl:col-span-2">
                      <CardContent className="flex min-h-[200px] flex-col items-center justify-center gap-3 text-center">
                        <Building2 className="h-10 w-10 text-slate-300" />
                        <div>
                          <p className="font-medium">Nessun club di proprieta</p>
                          <p className="text-sm text-muted-foreground">
                            Da qui puoi creare i club che possiedi e gestisci
                            direttamente con il tuo account.
                          </p>
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {ownedClubs.map((club) => (
                    <Card key={club.id}>
                      <CardHeader className="space-y-3">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <CardTitle className="text-lg">{club.name}</CardTitle>
                            <p className="mt-1 text-sm text-muted-foreground">
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
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="grid gap-3 text-sm text-muted-foreground md:grid-cols-2">
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

                        <div className="flex flex-wrap gap-3">
                          <Button
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
                          <Button onClick={() => openClubArea(club)}>
                            <ArrowRight className="mr-2 h-4 w-4" />
                            Apri dashboard
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </TabsContent>

              <TabsContent value="access" className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Accessi a club non proprietari</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">
                      Qui trovi tutti i club a cui il tuo account accede con un ruolo
                      operativo, senza esserne proprietario.
                    </p>
                  </CardContent>
                </Card>

                <div className="grid gap-4 xl:grid-cols-2">
                  {accessClubs.length === 0 && (
                    <Card className="xl:col-span-2">
                      <CardContent className="flex min-h-[200px] flex-col items-center justify-center gap-3 text-center">
                        <Users className="h-10 w-10 text-slate-300" />
                        <div>
                          <p className="font-medium">Nessun accesso esterno</p>
                          <p className="text-sm text-muted-foreground">
                            Quando ricevi un ruolo su un altro club, comparira in
                            questa sezione con il relativo livello di accesso.
                          </p>
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {accessClubs.map((club) => (
                    <Card key={club.id}>
                      <CardHeader className="space-y-3">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <CardTitle className="text-lg">{club.name}</CardTitle>
                            <p className="mt-1 text-sm text-muted-foreground">
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
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="grid gap-3 text-sm text-muted-foreground md:grid-cols-2">
                          <div>
                            <p className="font-medium text-slate-900">Localita</p>
                            <p>
                              {[club.city, club.province].filter(Boolean).join(", ") ||
                                "Non indicata"}
                            </p>
                          </div>
                          <div>
                            <p className="font-medium text-slate-900">Contatti club</p>
                            <p>{club.contactEmail || "Email non indicata"}</p>
                            <p>{club.contactPhone || "Telefono non indicato"}</p>
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-3">
                          <Button
                            variant="outline"
                            disabled={switchingClubId === club.id}
                            onClick={() => persistActiveClub(club)}
                          >
                            {switchingClubId === club.id ? (
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                              <CheckCircle2 className="mr-2 h-4 w-4" />
                            )}
                            Imposta come attivo
                          </Button>
                          <Button onClick={() => openClubArea(club)}>
                            <ArrowRight className="mr-2 h-4 w-4" />
                            {club.role === "trainer"
                              ? "Apri area trainer"
                              : "Apri accesso"}
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </div>
    </div>
  );
}
*/
