"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/providers/AuthProvider";
import Sidebar from "@/components/dashboard/Sidebar";
import Header from "@/components/dashboard/Header";
import {
  DashboardPageContainer,
  dashboardMainClassName,
} from "@/components/dashboard/dashboard-page-container";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast-notification";
import { apiRequest } from "@/lib/api/client";
import { isPlatformAdminUser } from "@/lib/platform-admin";
import {
  Building2,
  BookOpen,
  Loader2,
  Mail,
  Save,
  Send,
  ShieldCheck,
  Trash2,
  Users,
} from "lucide-react";

type AdminUser = {
  id: string;
  email: string;
  first_name?: string | null;
  last_name?: string | null;
  role: string;
  is_club_creator: boolean;
  created_at: string;
};

type AdminClub = {
  id: string;
  name: string;
  city?: string | null;
  creator_id: string;
  contact_email?: string | null;
  contact_phone?: string | null;
  created_at: string;
  memberCount: number;
  settings?: any;
};

type AdminOverview = {
  summary: {
    totalUsers: number;
    totalClubs: number;
    totalMemberships: number;
  };
  users: AdminUser[];
  clubs: AdminClub[];
};

type SmtpConfiguration = {
  configured: boolean;
  enabled: boolean;
  host: string;
  port: number;
  securityMode: "starttls" | "ssl";
  username: string;
  fromEmail: string;
  fromName: string;
  passwordConfigured: boolean;
  lastTestAt: string | null;
  lastTestStatus: string | null;
};

const emptySmtpConfiguration: SmtpConfiguration = {
  configured: false,
  enabled: false,
  host: "",
  port: 587,
  securityMode: "starttls",
  username: "",
  fromEmail: "",
  fromName: "EasyGame",
  passwordConfigured: false,
  lastTestAt: null,
  lastTestStatus: null,
};

const formatDate = (value?: string | null) => {
  if (!value) {
    return "-";
  }

  return new Date(value).toLocaleDateString("it-IT");
};

export default function PlatformAdminPage() {
  const router = useRouter();
  const { showToast } = useToast();
  const { user, loading } = useAuth();
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [search, setSearch] = useState("");
  const [pageLoading, setPageLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [smtpConfig, setSmtpConfig] = useState<SmtpConfiguration>(
    emptySmtpConfiguration,
  );
  const [smtpPassword, setSmtpPassword] = useState("");
  const [smtpTestRecipient, setSmtpTestRecipient] = useState("");
  const [smtpBusy, setSmtpBusy] = useState<"save" | "test" | null>(null);

  const canAccess = useMemo(() => isPlatformAdminUser(user), [user]);

  const loadOverview = async () => {
    setPageLoading(true);
    const response = await apiRequest<AdminOverview>("/api/v1/admin/overview");

    if (response.error) {
      showToast(
        "error",
        response.error.message || "Errore caricamento pannello admin",
      );
      setOverview(null);
      setPageLoading(false);
      return;
    }

    setOverview(response.data);
    setPageLoading(false);
  };

  const loadSmtpConfiguration = async () => {
    const response = await apiRequest<SmtpConfiguration>("/api/v1/admin/email");
    if (response.error) {
      showToast(
        "error",
        response.error.message || "Errore caricamento configurazione SMTP",
      );
      return;
    }
    if (response.data) setSmtpConfig(response.data);
  };

  useEffect(() => {
    if (loading) {
      return;
    }

    if (!user?.id) {
      router.replace("/login");
      return;
    }

    if (!canAccess) {
      router.replace("/account");
      return;
    }

    void loadOverview();
    void loadSmtpConfiguration();
  }, [canAccess, loading, router, user?.id]);

  useEffect(() => {
    if (!smtpTestRecipient && user?.email) setSmtpTestRecipient(user.email);
  }, [smtpTestRecipient, user?.email]);

  const updateSmtpField = <Key extends keyof SmtpConfiguration>(
    key: Key,
    value: SmtpConfiguration[Key],
  ) => setSmtpConfig((current) => ({ ...current, [key]: value }));

  const handleSaveSmtp = async () => {
    setSmtpBusy("save");
    const response = await apiRequest<SmtpConfiguration>(
      "/api/v1/admin/email",
      {
        method: "PUT",
        body: {
          enabled: smtpConfig.enabled,
          host: smtpConfig.host,
          port: smtpConfig.port,
          securityMode: smtpConfig.securityMode,
          username: smtpConfig.username,
          ...(smtpPassword ? { password: smtpPassword } : {}),
          fromEmail: smtpConfig.fromEmail,
          fromName: smtpConfig.fromName,
        },
      },
    );
    setSmtpBusy(null);
    if (response.error) {
      showToast(
        "error",
        response.error.message || "Salvataggio SMTP non riuscito",
      );
      return;
    }
    if (response.data) setSmtpConfig(response.data);
    setSmtpPassword("");
    showToast("success", "Configurazione SMTP salvata in modo sicuro");
  };

  const handleTestSmtp = async () => {
    setSmtpBusy("test");
    const response = await apiRequest<{ sent: boolean }>(
      "/api/v1/admin/email/test",
      { method: "POST", body: { to: smtpTestRecipient } },
    );
    setSmtpBusy(null);
    if (response.error) {
      showToast("error", response.error.message || "Test SMTP non riuscito");
      await loadSmtpConfiguration();
      return;
    }
    showToast("success", "Email di test inviata");
    await loadSmtpConfiguration();
  };

  const filteredUsers = useMemo(() => {
    const normalized = search.trim().toLowerCase();
    if (!normalized) {
      return overview?.users || [];
    }

    return (overview?.users || []).filter((item) =>
      [item.email, item.first_name, item.last_name, item.role]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(normalized)),
    );
  }, [overview?.users, search]);

  const filteredClubs = useMemo(() => {
    const normalized = search.trim().toLowerCase();
    if (!normalized) {
      return overview?.clubs || [];
    }

    return (overview?.clubs || []).filter((item) =>
      [item.name, item.city, item.contact_email, item.contact_phone]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(normalized)),
    );
  }, [overview?.clubs, search]);

  const handleDeleteClub = async (club: AdminClub) => {
    if (
      !window.confirm(
        `Confermi l'eliminazione definitiva del club ${club.name}? Questa azione rimuove anche dati e membership collegate.`,
      )
    ) {
      return;
    }

    setBusyId(`club-${club.id}`);
    const response = await apiRequest(`/api/v1/admin/clubs/${club.id}`, {
      method: "DELETE",
    });

    if (response.error) {
      showToast("error", response.error.message || "Errore eliminazione club");
      setBusyId(null);
      return;
    }

    showToast("success", `Club ${club.name} eliminato`);
    await loadOverview();
    setBusyId(null);
  };

  const handleDeleteUser = async (account: AdminUser) => {
    if (
      !window.confirm(
        `Confermi l'eliminazione definitiva dell'account ${account.email}?`,
      )
    ) {
      return;
    }

    setBusyId(`user-${account.id}`);
    const response = await apiRequest(`/api/v1/admin/users/${account.id}`, {
      method: "DELETE",
    });

    if (response.error) {
      showToast(
        "error",
        response.error.message || "Errore eliminazione account",
      );
      setBusyId(null);
      return;
    }

    showToast("success", `Account ${account.email} eliminato`);
    await loadOverview();
    setBusyId(null);
  };

  if (loading || pageLoading) {
    return (
      <div className="flex h-screen bg-gray-50">
        <Sidebar />
        <div className="flex flex-1 items-center justify-center">
          <div className="flex items-center gap-3 text-slate-600">
            <Loader2 className="h-5 w-5 animate-spin" />
            Caricamento dashboard admin...
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-gray-900">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header title="EasyGame Platform Admin" />
        <main className={dashboardMainClassName}>
          <DashboardPageContainer className="max-w-7xl">
            <div className="rounded-3xl border border-blue-100 bg-gradient-to-r from-slate-950 via-blue-950 to-blue-800 px-6 py-6 text-white shadow-xl">
              <div className="flex items-start justify-between gap-6">
                <div className="space-y-2">
                  <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-blue-100">
                    <ShieldCheck className="h-4 w-4" />
                    Accesso riservato piattaforma
                  </div>
                  <h1 className="bg-gradient-to-r from-blue-200 to-purple-200 bg-clip-text text-3xl font-bold leading-tight tracking-tight text-transparent md:text-4xl">
                    Controllo globale EasyGame
                  </h1>
                  <p className="max-w-3xl text-sm text-blue-100/90">
                    Qui puoi monitorare club, account registrati e accessi
                    dell&apos;applicazione. Il percorso è privato e accessibile
                    solo all&apos;amministrazione piattaforma.
                  </p>
                </div>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <Card>
                <CardContent className="flex items-center gap-4 p-5">
                  <div className="rounded-2xl bg-blue-100 p-3 text-blue-700">
                    <Users className="h-6 w-6" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">
                      Account registrati
                    </p>
                    <p className="text-2xl font-semibold">
                      {overview?.summary.totalUsers || 0}
                    </p>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="flex items-center gap-4 p-5">
                  <div className="rounded-2xl bg-emerald-100 p-3 text-emerald-700">
                    <Building2 className="h-6 w-6" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">
                      Club registrati
                    </p>
                    <p className="text-2xl font-semibold">
                      {overview?.summary.totalClubs || 0}
                    </p>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="flex items-center gap-4 p-5">
                  <div className="rounded-2xl bg-amber-100 p-3 text-amber-700">
                    <ShieldCheck className="h-6 w-6" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">
                      Accessi ai club
                    </p>
                    <p className="text-2xl font-semibold">
                      {overview?.summary.totalMemberships || 0}
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card className="border-emerald-100">
              <CardHeader>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Mail className="h-5 w-5 text-emerald-600" />
                      Provider email SMTP
                    </CardTitle>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Configurazione globale per OTP e notifiche, applicata
                      senza redeploy.
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Badge
                      variant={smtpConfig.enabled ? "secondary" : "outline"}
                    >
                      {smtpConfig.enabled ? "Attivo" : "Disattivato"}
                    </Badge>
                    {smtpConfig.passwordConfigured ? (
                      <Badge variant="secondary">Password cifrata</Badge>
                    ) : null}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-5">
                <label className="flex items-center gap-3 rounded-xl border p-3 text-sm">
                  <input
                    type="checkbox"
                    checked={smtpConfig.enabled}
                    onChange={(event) =>
                      updateSmtpField("enabled", event.target.checked)
                    }
                    className="h-4 w-4"
                  />
                  Abilita invio email tramite SMTP
                </label>

                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  <div className="space-y-2">
                    <Label htmlFor="smtp-host">Host</Label>
                    <Input
                      id="smtp-host"
                      value={smtpConfig.host}
                      onChange={(event) =>
                        updateSmtpField("host", event.target.value)
                      }
                      placeholder="smtp.example.com"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="smtp-port">Porta</Label>
                    <Input
                      id="smtp-port"
                      type="number"
                      min={1}
                      max={65535}
                      value={smtpConfig.port}
                      onChange={(event) =>
                        updateSmtpField("port", Number(event.target.value))
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="smtp-security">Sicurezza</Label>
                    <select
                      id="smtp-security"
                      value={smtpConfig.securityMode}
                      onChange={(event) =>
                        updateSmtpField(
                          "securityMode",
                          event.target.value as "starttls" | "ssl",
                        )
                      }
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    >
                      <option value="starttls">STARTTLS</option>
                      <option value="ssl">SSL/TLS</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="smtp-username">Username</Label>
                    <Input
                      id="smtp-username"
                      value={smtpConfig.username}
                      onChange={(event) =>
                        updateSmtpField("username", event.target.value)
                      }
                      autoComplete="off"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="smtp-password">
                      Password{" "}
                      {smtpConfig.passwordConfigured
                        ? "(lascia vuoto per mantenerla)"
                        : ""}
                    </Label>
                    <Input
                      id="smtp-password"
                      type="password"
                      value={smtpPassword}
                      onChange={(event) => setSmtpPassword(event.target.value)}
                      autoComplete="new-password"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="smtp-from-email">Email mittente</Label>
                    <Input
                      id="smtp-from-email"
                      type="email"
                      value={smtpConfig.fromEmail}
                      onChange={(event) =>
                        updateSmtpField("fromEmail", event.target.value)
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="smtp-from-name">Nome mittente</Label>
                    <Input
                      id="smtp-from-name"
                      value={smtpConfig.fromName}
                      onChange={(event) =>
                        updateSmtpField("fromName", event.target.value)
                      }
                    />
                  </div>
                </div>

                <div className="flex flex-col gap-3 rounded-xl bg-slate-50 p-4 md:flex-row md:items-end">
                  <div className="flex-1 space-y-2">
                    <Label htmlFor="smtp-test-recipient">
                      Destinatario test
                    </Label>
                    <Input
                      id="smtp-test-recipient"
                      type="email"
                      value={smtpTestRecipient}
                      onChange={(event) =>
                        setSmtpTestRecipient(event.target.value)
                      }
                    />
                  </div>
                  <Button
                    variant="outline"
                    onClick={handleTestSmtp}
                    disabled={smtpBusy !== null || !smtpConfig.configured}
                  >
                    {smtpBusy === "test" ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="mr-2 h-4 w-4" />
                    )}
                    Test invio email
                  </Button>
                  <Button onClick={handleSaveSmtp} disabled={smtpBusy !== null}>
                    {smtpBusy === "save" ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="mr-2 h-4 w-4" />
                    )}
                    Salva SMTP
                  </Button>
                </div>
                {smtpConfig.lastTestAt ? (
                  <p className="text-xs text-muted-foreground">
                    Ultimo test:{" "}
                    {new Date(smtpConfig.lastTestAt).toLocaleString("it-IT")} ·{" "}
                    {smtpConfig.lastTestStatus}
                  </p>
                ) : null}
              </CardContent>
            </Card>

            <Card className="border-blue-100 bg-blue-50/60">
              <CardContent className="flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between">
                <div className="flex items-start gap-4">
                  <div className="rounded-2xl bg-blue-600 p-3 text-white">
                    <BookOpen className="h-6 w-6" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold uppercase tracking-[0.16em] text-blue-700">
                      Documentazione interna
                    </p>
                    <h2 className="mt-1 text-xl font-semibold text-slate-950">
                      API applicazione
                    </h2>
                    <p className="mt-1 text-sm text-slate-600">
                      Registro privato degli endpoint EasyGame per sviluppo web
                      e futura app mobile.
                    </p>
                  </div>
                </div>
                <Button
                  className="bg-blue-600 hover:bg-blue-700"
                  onClick={() => router.push("/private/api-docs")}
                >
                  Apri API interne
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Ricerca globale</CardTitle>
              </CardHeader>
              <CardContent>
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Cerca club, email, ruolo o contatto..."
                />
              </CardContent>
            </Card>

            <div className="grid gap-6 xl:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Club registrati</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {filteredClubs.map((club) => {
                    const seasonCount = Array.isArray(club.settings?.seasons)
                      ? club.settings.seasons.length
                      : 0;
                    return (
                      <div
                        key={club.id}
                        className="rounded-2xl border border-slate-200 p-4"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="space-y-1">
                            <h3 className="font-semibold text-slate-900">
                              {club.name}
                            </h3>
                            <p className="text-sm text-muted-foreground">
                              {[club.city, club.contact_email]
                                .filter(Boolean)
                                .join(" · ") || "Contatti non definiti"}
                            </p>
                            <div className="flex flex-wrap gap-2 pt-2">
                              <Badge variant="secondary">
                                {club.memberCount} accessi
                              </Badge>
                              <Badge variant="secondary">
                                {seasonCount} stagioni
                              </Badge>
                              <Badge variant="outline">
                                Creato {formatDate(club.created_at)}
                              </Badge>
                            </div>
                          </div>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => handleDeleteClub(club)}
                            disabled={busyId === `club-${club.id}`}
                          >
                            {busyId === `club-${club.id}` ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Trash2 className="h-4 w-4" />
                            )}
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Account registrati</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {filteredUsers.map((account) => (
                    <div
                      key={account.id}
                      className="rounded-2xl border border-slate-200 p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1">
                          <h3 className="font-semibold text-slate-900">
                            {[account.first_name, account.last_name]
                              .filter(Boolean)
                              .join(" ") || account.email}
                          </h3>
                          <p className="text-sm text-muted-foreground">
                            {account.email}
                          </p>
                          <div className="flex flex-wrap gap-2 pt-2">
                            <Badge variant="secondary">{account.role}</Badge>
                            {account.is_club_creator ? (
                              <Badge variant="secondary">Creatore club</Badge>
                            ) : null}
                            <Badge variant="outline">
                              Registrato {formatDate(account.created_at)}
                            </Badge>
                          </div>
                        </div>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => handleDeleteUser(account)}
                          disabled={busyId === `user-${account.id}`}
                        >
                          {busyId === `user-${account.id}` ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          </DashboardPageContainer>
        </main>
      </div>
    </div>
  );
}
