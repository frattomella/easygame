"use client";

import { useEffect, useState } from "react";
import { Eye, LayoutPanelTop, Save, ShieldCheck, SlidersHorizontal } from "lucide-react";
import Sidebar from "@/components/dashboard/Sidebar";
import Header from "@/components/dashboard/Header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/toast-notification";
import { useAuth } from "@/components/providers/AuthProvider";
import { getClubSettings, saveClubSettings } from "@/lib/simplified-db";
import {
  buildTrainerDashboardPermissionPayload,
  DEFAULT_TRAINER_DASHBOARD_PERMISSIONS,
  resolveTrainerDashboardPermissions,
  type TrainerActionPermissionKey,
  type TrainerDashboardPermissions,
  type TrainerNavigationPermissionKey,
  type TrainerWidgetPermissionKey,
} from "@/lib/trainer-dashboard-permissions";

const NAV_OPTIONS: Array<{
  key: TrainerNavigationPermissionKey;
  label: string;
  description: string;
}> = [
  {
    key: "home",
    label: "Home dashboard",
    description: "Pagina iniziale trainer con panoramica, sintesi e scorciatoie.",
  },
  {
    key: "trainings",
    label: "Pagina allenamenti",
    description: "Mostra la sezione dedicata agli allenamenti delle categorie assegnate.",
  },
  {
    key: "matches",
    label: "Pagina gare",
    description: "Mostra il calendario gare filtrato sul trainer.",
  },
  {
    key: "athletes",
    label: "Pagina atleti",
    description: "Mostra il roster degli atleti appartenenti alle categorie collegate.",
  },
  {
    key: "categories",
    label: "Pagina categorie",
    description: "Mostra l’overview delle categorie assegnate al trainer.",
  },
];

const WIDGET_OPTIONS: Array<{
  key: TrainerWidgetPermissionKey;
  label: string;
  description: string;
}> = [
  {
    key: "summary",
    label: "Card riepilogo",
    description: "Attiva i numeri rapidi su categorie, atleti, allenamenti e gare.",
  },
  {
    key: "upcomingTrainings",
    label: "Prossimi allenamenti",
    description: "Mostra il blocco con i prossimi allenamenti nella home trainer.",
  },
  {
    key: "upcomingMatches",
    label: "Prossime gare",
    description: "Mostra il blocco con le prossime gare nella home trainer.",
  },
  {
    key: "assignedAthletes",
    label: "Roster in evidenza",
    description: "Mostra un’anteprima degli atleti assegnati nella home trainer.",
  },
  {
    key: "assignedCategories",
    label: "Categorie in evidenza",
    description: "Mostra nella home l’elenco delle categorie collegate al trainer.",
  },
];

const ACTION_OPTIONS: Array<{
  key: TrainerActionPermissionKey;
  label: string;
  description: string;
}> = [
  {
    key: "viewTrainingDetails",
    label: "Dettagli allenamento",
    description: "Consente di vedere luogo, categoria e metadati completi degli allenamenti.",
  },
  {
    key: "manageAttendance",
    label: "Gestione presenze",
    description: "Abilita le funzioni operative relative alle presenze allenamento.",
  },
  {
    key: "manageTrainingStatus",
    label: "Stato allenamento",
    description: "Consente di annullare o ripristinare gli allenamenti assegnati.",
  },
  {
    key: "viewMatchDetails",
    label: "Dettagli gara",
    description: "Consente di vedere luogo, avversario e dettagli completi delle gare.",
  },
  {
    key: "manageConvocations",
    label: "Gestione convocazioni",
    description: "Abilita le funzioni operative relative a convocazioni e gestione gara.",
  },
  {
    key: "viewAthleteDetails",
    label: "Scheda atleta estesa",
    description: "Mostra dati anagrafici e informazioni base nella pagina atleti trainer.",
  },
  {
    key: "viewAthleteTechnicalSheet",
    label: "Scheda tecnica atleta",
    description: "Abilita l’apertura della scheda completa dell’atleta dalla dashboard trainer.",
  },
  {
    key: "viewAthleteContacts",
    label: "Contatti atleta",
    description: "Mostra recapiti e contatti disponibili del roster collegato.",
  },
  {
    key: "viewMedicalStatus",
    label: "Stato medico",
    description: "Mostra la scadenza del certificato e gli indicatori sanitari sintetici.",
  },
  {
    key: "viewEnrollmentAndPayments",
    label: "Iscrizione e pagamenti",
    description: "Mostra nella scheda atleta le sezioni relative a iscrizione, piano e pagamenti.",
  },
];

const READ_ONLY_PRESET: TrainerDashboardPermissions = {
  navigation: { ...DEFAULT_TRAINER_DASHBOARD_PERMISSIONS.navigation },
  widgets: { ...DEFAULT_TRAINER_DASHBOARD_PERMISSIONS.widgets },
  actions: {
    viewTrainingDetails: true,
    manageAttendance: false,
    manageTrainingStatus: false,
    viewMatchDetails: true,
    manageConvocations: false,
    viewAthleteDetails: true,
    viewAthleteTechnicalSheet: true,
    viewAthleteContacts: false,
    viewMedicalStatus: false,
    viewEnrollmentAndPayments: false,
  },
};

const CONTROLLED_PRESET: TrainerDashboardPermissions = {
  navigation: { ...DEFAULT_TRAINER_DASHBOARD_PERMISSIONS.navigation },
  widgets: { ...DEFAULT_TRAINER_DASHBOARD_PERMISSIONS.widgets },
  actions: {
    viewTrainingDetails: true,
    manageAttendance: true,
    manageTrainingStatus: true,
    viewMatchDetails: true,
    manageConvocations: true,
    viewAthleteDetails: true,
    viewAthleteTechnicalSheet: true,
    viewAthleteContacts: false,
    viewMedicalStatus: true,
    viewEnrollmentAndPayments: false,
  },
};

const FULL_PRESET: TrainerDashboardPermissions = {
  navigation: { ...DEFAULT_TRAINER_DASHBOARD_PERMISSIONS.navigation },
  widgets: { ...DEFAULT_TRAINER_DASHBOARD_PERMISSIONS.widgets },
  actions: { ...DEFAULT_TRAINER_DASHBOARD_PERMISSIONS.actions },
};

function PermissionRow({
  label,
  description,
  checked,
  onCheckedChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-2xl border border-slate-200/80 bg-white px-4 py-4">
      <div className="space-y-1">
        <Label className="text-sm font-semibold text-slate-900">{label}</Label>
        <p className="text-sm text-slate-500">{description}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}

export default function TrainerPermissionsPage() {
  const { showToast } = useToast();
  const { activeClub } = useAuth();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [permissions, setPermissions] = useState<TrainerDashboardPermissions>(
    DEFAULT_TRAINER_DASHBOARD_PERMISSIONS,
  );

  useEffect(() => {
    const loadPermissions = async () => {
      if (!activeClub?.id) {
        setIsLoading(false);
        return;
      }

      try {
        setIsLoading(true);
        const clubSettings = await getClubSettings(activeClub.id);
        setPermissions(resolveTrainerDashboardPermissions(clubSettings));
      } catch (error) {
        console.error("Error loading trainer permissions:", error);
        showToast("error", "Errore nel caricamento dei permessi trainer");
      } finally {
        setIsLoading(false);
      }
    };

    void loadPermissions();
  }, [activeClub?.id, showToast]);

  const updateNavigationPermission = (
    key: TrainerNavigationPermissionKey,
    checked: boolean,
  ) => {
    setPermissions((current) => ({
      ...current,
      navigation: {
        ...current.navigation,
        [key]: checked,
      },
    }));
  };

  const updateWidgetPermission = (
    key: TrainerWidgetPermissionKey,
    checked: boolean,
  ) => {
    setPermissions((current) => ({
      ...current,
      widgets: {
        ...current.widgets,
        [key]: checked,
      },
    }));
  };

  const updateActionPermission = (
    key: TrainerActionPermissionKey,
    checked: boolean,
  ) => {
    setPermissions((current) => ({
      ...current,
      actions: {
        ...current.actions,
        [key]: checked,
      },
    }));
  };

  const applyPreset = (preset: TrainerDashboardPermissions) => {
    setPermissions({
      navigation: { ...preset.navigation },
      widgets: { ...preset.widgets },
      actions: { ...preset.actions },
    });
  };

  const handleSave = async () => {
    if (!activeClub?.id) {
      showToast("error", "Nessun club attivo selezionato");
      return;
    }

    try {
      setIsSaving(true);
      await saveClubSettings(
        activeClub.id,
        buildTrainerDashboardPermissionPayload(permissions),
      );
      showToast("success", "Permessi trainer salvati con successo");
    } catch (error) {
      console.error("Error saving trainer permissions:", error);
      showToast("error", "Errore nel salvataggio dei permessi trainer");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-gray-900">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Header title="Permessi Allenatore" />
        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          <div className="mx-auto max-w-7xl space-y-6">
            <div className="rounded-[32px] border border-white/70 bg-white/90 px-6 py-6 shadow-sm">
              <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-blue-600">
                    Dashboard Trainer
                  </p>
                  <h1 className="mt-2 text-4xl font-bold text-slate-900">
                    Controlla esattamente cosa il trainer può vedere e fare
                  </h1>
                  <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">
                    Il trainer vedrà sempre e solo categorie, atleti, allenamenti e
                    gare assegnate al suo profilo. Da qui definisci quali pagine,
                    widget e funzioni operative rendere disponibili nella sua
                    dashboard.
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Badge className="border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-50">
                    Scope per categorie assegnate
                  </Badge>
                  <Badge className="border-slate-200 bg-slate-100 text-slate-700 hover:bg-slate-100">
                    Club: {activeClub?.name || "non selezionato"}
                  </Badge>
                </div>
              </div>
            </div>

            <Card className="rounded-[30px] border-white/70 bg-white/90 shadow-sm">
              <CardHeader className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2 text-xl">
                    <SlidersHorizontal className="h-5 w-5 text-blue-600" />
                    Preset rapidi
                  </CardTitle>
                  <p className="mt-2 text-sm text-slate-500">
                    Parti da una configurazione tipo e poi rifinisci le singole
                    autorizzazioni.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    className="rounded-2xl"
                    onClick={() => applyPreset(READ_ONLY_PRESET)}
                  >
                    Sola consultazione
                  </Button>
                  <Button
                    variant="outline"
                    className="rounded-2xl"
                    onClick={() => applyPreset(CONTROLLED_PRESET)}
                  >
                    Operatività controllata
                  </Button>
                  <Button
                    variant="outline"
                    className="rounded-2xl"
                    onClick={() => applyPreset(FULL_PRESET)}
                  >
                    Accesso completo
                  </Button>
                </div>
              </CardHeader>
            </Card>

            <div className="grid gap-6 xl:grid-cols-3">
              <Card className="rounded-[30px] border-white/70 bg-white/90 shadow-sm xl:col-span-1">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-xl">
                    <LayoutPanelTop className="h-5 w-5 text-blue-600" />
                    Navigazione
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {NAV_OPTIONS.map((option) => (
                    <PermissionRow
                      key={option.key}
                      label={option.label}
                      description={option.description}
                      checked={permissions.navigation[option.key]}
                      onCheckedChange={(checked) =>
                        updateNavigationPermission(option.key, checked)
                      }
                    />
                  ))}
                </CardContent>
              </Card>

              <Card className="rounded-[30px] border-white/70 bg-white/90 shadow-sm xl:col-span-1">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-xl">
                    <Eye className="h-5 w-5 text-blue-600" />
                    Widget Home
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {WIDGET_OPTIONS.map((option) => (
                    <PermissionRow
                      key={option.key}
                      label={option.label}
                      description={option.description}
                      checked={permissions.widgets[option.key]}
                      onCheckedChange={(checked) =>
                        updateWidgetPermission(option.key, checked)
                      }
                    />
                  ))}
                </CardContent>
              </Card>

              <Card className="rounded-[30px] border-white/70 bg-white/90 shadow-sm xl:col-span-1">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-xl">
                    <ShieldCheck className="h-5 w-5 text-blue-600" />
                    Azioni e dati
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {ACTION_OPTIONS.map((option) => (
                    <PermissionRow
                      key={option.key}
                      label={option.label}
                      description={option.description}
                      checked={permissions.actions[option.key]}
                      onCheckedChange={(checked) =>
                        updateActionPermission(option.key, checked)
                      }
                    />
                  ))}
                </CardContent>
              </Card>
            </div>

            <div className="flex justify-end">
              <Button
                className="rounded-2xl px-6"
                onClick={handleSave}
                disabled={isLoading || isSaving || !activeClub?.id}
              >
                <Save className="mr-2 h-4 w-4" />
                {isSaving ? "Salvataggio..." : "Salva permessi trainer"}
              </Button>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
