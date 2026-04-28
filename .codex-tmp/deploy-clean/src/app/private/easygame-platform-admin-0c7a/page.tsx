"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/providers/AuthProvider";
import Sidebar from "@/components/dashboard/Sidebar";
import Header from "@/components/dashboard/Header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast-notification";
import { apiRequest } from "@/lib/api/client";
import { isPlatformAdminUser } from "@/lib/platform-admin";
import {
  Building2,
  Loader2,
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

  const canAccess = useMemo(() => isPlatformAdminUser(user), [user]);

  const loadOverview = async () => {
    setPageLoading(true);
    const response = await apiRequest<AdminOverview>("/api/v1/admin/overview");

    if (response.error) {
      showToast("error", response.error.message || "Errore caricamento pannello admin");
      setOverview(null);
      setPageLoading(false);
      return;
    }

    setOverview(response.data);
    setPageLoading(false);
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
  }, [canAccess, loading, router, user?.id]);

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
      showToast("error", response.error.message || "Errore eliminazione account");
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
        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          <div className="mx-auto max-w-7xl space-y-6">
            <div className="rounded-3xl border border-blue-100 bg-gradient-to-r from-slate-950 via-blue-950 to-blue-800 px-6 py-6 text-white shadow-xl">
              <div className="flex items-start justify-between gap-6">
                <div className="space-y-2">
                  <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-blue-100">
                    <ShieldCheck className="h-4 w-4" />
                    Accesso riservato piattaforma
                  </div>
                  <h1 className="text-3xl font-bold">Controllo globale EasyGame</h1>
                  <p className="max-w-3xl text-sm text-blue-100/90">
                    Qui puoi monitorare club, account registrati e accessi
                    dell'applicazione. Il percorso è privato e accessibile solo
                    all'amministrazione piattaforma.
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
                    <p className="text-sm text-muted-foreground">Account registrati</p>
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
                    <p className="text-sm text-muted-foreground">Club registrati</p>
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
                    <p className="text-sm text-muted-foreground">Accessi ai club</p>
                    <p className="text-2xl font-semibold">
                      {overview?.summary.totalMemberships || 0}
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>

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
                            <h3 className="font-semibold text-slate-900">{club.name}</h3>
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
                          <p className="text-sm text-muted-foreground">{account.email}</p>
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
          </div>
        </main>
      </div>
    </div>
  );
}
