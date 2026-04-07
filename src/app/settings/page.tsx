"use client";

import React from "react";
import { useToast } from "@/components/ui/toast-notification";
import { saveClubSettings, getClubSettings } from "@/lib/simplified-db";
import Sidebar from "@/components/dashboard/Sidebar";
import Header from "@/components/dashboard/Header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Settings, User, Bell, Shield, Building, Globe } from "lucide-react";

export default function SettingsPage() {
  const { showToast } = useToast();
  const [loading, setLoading] = React.useState(true);
  const [clubId, setClubId] = React.useState<string>("");
  const [settings, setSettings] = React.useState({
    notifications: {
      certificates: true,
      trainings: true,
      athletes: true,
      email: true,
    },
    system: {
      language: "it",
      dateFormat: "dd/mm/yyyy",
      backup: true,
    },
    security: {
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
      currentPin: "",
      newPin: "",
      confirmPin: "",
    },
  });

  // Load settings on component mount
  React.useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      setLoading(true);

      // Get club ID from localStorage
      const activeClubData = localStorage.getItem("activeClub");
      if (!activeClubData) {
        console.warn("No active club found in localStorage");
        setLoading(false);
        return;
      }

      let activeClub;
      try {
        activeClub = JSON.parse(activeClubData);
      } catch (e) {
        console.error("Error parsing active club data:", e);
        showToast("error", "Errore nel caricamento dei dati del club");
        setLoading(false);
        return;
      }

      if (!activeClub || !activeClub.id) {
        console.error("Active club data is invalid:", activeClub);
        showToast("error", "ID Club non trovato");
        setLoading(false);
        return;
      }

      const currentClubId = activeClub.id;
      console.log("Loading settings for club ID:", currentClubId);
      setClubId(currentClubId);

      // Load settings from database
      const clubSettings = await getClubSettings(currentClubId);

      // Merge with default settings
      setSettings((prevSettings) => ({
        notifications: {
          ...prevSettings.notifications,
          ...clubSettings.notifications,
        },
        system: {
          ...prevSettings.system,
          ...clubSettings.system,
        },
        security: {
          ...prevSettings.security,
          // Don't load passwords from database for security
        },
      }));
    } catch (error) {
      console.error("Error loading settings:", error);
      showToast("error", "Errore nel caricamento delle impostazioni");
    } finally {
      setLoading(false);
    }
  };

  const saveNotificationSettings = async () => {
    try {
      if (!clubId) {
        console.error("No club ID available for saving settings");
        showToast("error", "ID club non disponibile");
        return;
      }

      console.log("Saving notification settings for club:", clubId);
      await saveClubSettings(clubId, {
        notifications: settings.notifications,
      });

      showToast("success", "Preferenze notifiche salvate con successo");
    } catch (error) {
      console.error("Error saving notification settings:", error);
      showToast("error", "Errore nel salvataggio delle preferenze notifiche");
    }
  };

  const saveSystemSettings = async () => {
    try {
      if (!clubId) {
        console.error("No club ID available for saving system settings");
        showToast("error", "ID club non disponibile");
        return;
      }

      console.log("Saving system settings for club:", clubId);
      await saveClubSettings(clubId, {
        system: settings.system,
      });

      // Apply language change immediately
      document.documentElement.lang = settings.system.language;
      localStorage.setItem("app-language", settings.system.language);

      const event = new CustomEvent("language-change", {
        detail: { language: settings.system.language },
      });
      window.dispatchEvent(event);

      showToast("success", "Impostazioni sistema salvate con successo");

      // Reload page if language changed
      if (settings.system.language !== "it") {
        setTimeout(() => {
          window.location.reload();
        }, 1000);
      }
    } catch (error) {
      console.error("Error saving system settings:", error);
      showToast("error", "Errore nel salvataggio delle impostazioni sistema");
    }
  };

  const saveSecuritySettings = async () => {
    try {
      if (!clubId) {
        console.error("No club ID available for saving security settings");
        showToast("error", "ID club non disponibile");
        return;
      }

      // Validate passwords
      if (
        settings.security.newPassword &&
        settings.security.newPassword !== settings.security.confirmPassword
      ) {
        showToast("error", "Le password non corrispondono");
        return;
      }

      if (
        settings.security.newPin &&
        settings.security.newPin !== settings.security.confirmPin
      ) {
        showToast("error", "I PIN non corrispondono");
        return;
      }

      console.log("Saving security settings for club:", clubId);
      // Save security settings (excluding actual passwords for security)
      await saveClubSettings(clubId, {
        security: {
          lastPasswordChange: new Date().toISOString(),
          lastPinChange: settings.security.newPin
            ? new Date().toISOString()
            : undefined,
        },
      });

      // Clear password fields
      setSettings((prev) => ({
        ...prev,
        security: {
          currentPassword: "",
          newPassword: "",
          confirmPassword: "",
          currentPin: "",
          newPin: "",
          confirmPin: "",
        },
      }));

      showToast("success", "Impostazioni di sicurezza aggiornate con successo");
    } catch (error) {
      console.error("Error saving security settings:", error);
      showToast(
        "error",
        "Errore nel salvataggio delle impostazioni di sicurezza",
      );
    }
  };

  const updateNotificationSetting = (key: string, value: boolean) => {
    setSettings((prev) => ({
      ...prev,
      notifications: {
        ...prev.notifications,
        [key]: value,
      },
    }));
  };

  const updateSystemSetting = (key: string, value: string | boolean) => {
    setSettings((prev) => ({
      ...prev,
      system: {
        ...prev.system,
        [key]: value,
      },
    }));
  };

  const updateSecuritySetting = (key: string, value: string) => {
    setSettings((prev) => ({
      ...prev,
      security: {
        ...prev.security,
        [key]: value,
      },
    }));
  };

  if (loading) {
    return (
      <div className="flex h-screen bg-gray-50 dark:bg-gray-900">
        <Sidebar />
        <div className="flex flex-1 flex-col overflow-hidden">
          <Header title="Impostazioni" />
          <main className="flex-1 overflow-y-auto p-4 md:p-6">
            <div className="mx-auto max-w-9xl space-y-6">
              <div className="space-y-2">
                <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                  Impostazioni
                </h1>
                <p className="text-gray-600 mt-2">
                  Configura preferenze, accessi e parametri dell’app.
                </p>
              </div>

              <div className="flex items-center justify-center h-64">
                <div className="text-center">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
                  <p className="text-gray-600 dark:text-gray-400">
                    Caricamento impostazioni...
                  </p>
                </div>
              </div>
            </div>
          </main>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-gray-900">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header title="Impostazioni" />
        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          <div className="mx-auto max-w-9xl space-y-6">
            <div className="space-y-2">
              <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                Impostazioni
              </h1>
              <p className="text-gray-600 mt-2">
                Configura preferenze, accessi e parametri dell’app.
              </p>
            </div>
            <Tabs defaultValue="notifications">
              <div className="flex overflow-x-auto pb-2">
                <TabsList className="inline-flex h-10 items-center justify-center rounded-md bg-muted p-1 text-muted-foreground">
                  <TabsTrigger
                    value="notifications"
                    className="flex items-center gap-2"
                  >
                    <Bell className="h-4 w-4" />
                    <span>Notifiche</span>
                  </TabsTrigger>
                  <TabsTrigger
                    value="system"
                    className="flex items-center gap-2"
                  >
                    <Settings className="h-4 w-4" />
                    <span>Sistema</span>
                  </TabsTrigger>
                  <TabsTrigger
                    value="security"
                    className="flex items-center gap-2"
                  >
                    <Shield className="h-4 w-4" />
                    <span>Sicurezza</span>
                  </TabsTrigger>
                </TabsList>
              </div>

              <TabsContent value="notifications" className="space-y-4 mt-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Preferenze Notifiche</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <Label htmlFor="cert-notifications">
                            Certificati in scadenza
                          </Label>
                          <p className="text-sm text-muted-foreground">
                            Ricevi notifiche quando i certificati medici stanno
                            per scadere
                          </p>
                        </div>
                        <Switch
                          id="cert-notifications"
                          checked={settings.notifications.certificates}
                          onCheckedChange={(checked) =>
                            updateNotificationSetting("certificates", checked)
                          }
                        />
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <Label htmlFor="training-notifications">
                            Allenamenti
                          </Label>
                          <p className="text-sm text-muted-foreground">
                            Ricevi notifiche per nuovi allenamenti programmati
                          </p>
                        </div>
                        <Switch
                          id="training-notifications"
                          checked={settings.notifications.trainings}
                          onCheckedChange={(checked) =>
                            updateNotificationSetting("trainings", checked)
                          }
                        />
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <Label htmlFor="athlete-notifications">
                            Nuovi atleti
                          </Label>
                          <p className="text-sm text-muted-foreground">
                            Ricevi notifiche quando vengono registrati nuovi
                            atleti
                          </p>
                        </div>
                        <Switch
                          id="athlete-notifications"
                          checked={settings.notifications.athletes}
                          onCheckedChange={(checked) =>
                            updateNotificationSetting("athletes", checked)
                          }
                        />
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <Label htmlFor="email-notifications">
                            Notifiche email
                          </Label>
                          <p className="text-sm text-muted-foreground">
                            Ricevi notifiche anche via email
                          </p>
                        </div>
                        <Switch
                          id="email-notifications"
                          checked={settings.notifications.email}
                          onCheckedChange={(checked) =>
                            updateNotificationSetting("email", checked)
                          }
                        />
                      </div>
                    </div>
                    <Button
                      className="bg-blue-600 hover:bg-blue-700"
                      onClick={saveNotificationSettings}
                    >
                      Salva preferenze
                    </Button>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="system" className="space-y-4 mt-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Impostazioni Sistema</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <Label htmlFor="language">Lingua</Label>
                          <p className="text-sm text-muted-foreground">
                            Seleziona la lingua predefinita del sistema
                          </p>
                        </div>
                        <div className="w-[180px]">
                          <select
                            className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
                            value={settings.system.language}
                            onChange={(e) =>
                              updateSystemSetting("language", e.target.value)
                            }
                          >
                            <option value="it">Italiano</option>
                            <option value="en">English</option>
                            <option value="es">Español</option>
                            <option value="fr">Français</option>
                          </select>
                        </div>
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <Label htmlFor="date-format">Formato data</Label>
                          <p className="text-sm text-muted-foreground">
                            Seleziona il formato data predefinito
                          </p>
                        </div>
                        <div className="w-[180px]">
                          <select
                            className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
                            value={settings.system.dateFormat}
                            onChange={(e) =>
                              updateSystemSetting("dateFormat", e.target.value)
                            }
                          >
                            <option value="dd/mm/yyyy">DD/MM/YYYY</option>
                            <option value="mm/dd/yyyy">MM/DD/YYYY</option>
                            <option value="yyyy-mm-dd">YYYY-MM-DD</option>
                          </select>
                        </div>
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <Label htmlFor="backup">Backup automatico</Label>
                          <p className="text-sm text-muted-foreground">
                            Esegui backup automatici dei dati
                          </p>
                        </div>
                        <Switch
                          id="backup"
                          checked={settings.system.backup}
                          onCheckedChange={(checked) =>
                            updateSystemSetting("backup", checked)
                          }
                        />
                      </div>
                    </div>
                    <Button
                      className="bg-blue-600 hover:bg-blue-700 text-white dark:text-white"
                      onClick={saveSystemSettings}
                    >
                      Salva impostazioni
                    </Button>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="security" className="space-y-4 mt-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Sicurezza</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="space-y-4">
                      <h3 className="text-lg font-medium">Cambia Password</h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="current-password">
                            Password Attuale
                          </Label>
                          <Input
                            id="current-password"
                            type="password"
                            value={settings.security.currentPassword}
                            onChange={(e) =>
                              updateSecuritySetting(
                                "currentPassword",
                                e.target.value,
                              )
                            }
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="new-password">Nuova Password</Label>
                          <Input
                            id="new-password"
                            type="password"
                            value={settings.security.newPassword}
                            onChange={(e) =>
                              updateSecuritySetting(
                                "newPassword",
                                e.target.value,
                              )
                            }
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="confirm-password">
                            Conferma Password
                          </Label>
                          <Input
                            id="confirm-password"
                            type="password"
                            value={settings.security.confirmPassword}
                            onChange={(e) =>
                              updateSecuritySetting(
                                "confirmPassword",
                                e.target.value,
                              )
                            }
                          />
                        </div>
                      </div>
                      <Button
                        className="bg-blue-600 hover:bg-blue-700 text-white dark:text-white"
                        onClick={saveSecuritySettings}
                      >
                        Aggiorna Password
                      </Button>
                    </div>

                    <div className="space-y-4 pt-6 border-t">
                      <h3 className="text-lg font-medium">
                        Cambia PIN di Sicurezza
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        Il PIN a 4 cifre è utilizzato per proteggere i dati
                        sensibili come stipendi e pagamenti.
                      </p>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="current-pin">PIN Attuale</Label>
                          <Input
                            id="current-pin"
                            type="password"
                            maxLength={4}
                            value={settings.security.currentPin}
                            onChange={(e) =>
                              updateSecuritySetting(
                                "currentPin",
                                e.target.value,
                              )
                            }
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="new-pin">Nuovo PIN</Label>
                          <Input
                            id="new-pin"
                            type="password"
                            maxLength={4}
                            value={settings.security.newPin}
                            onChange={(e) =>
                              updateSecuritySetting("newPin", e.target.value)
                            }
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="confirm-pin">Conferma PIN</Label>
                          <Input
                            id="confirm-pin"
                            type="password"
                            maxLength={4}
                            value={settings.security.confirmPin}
                            onChange={(e) =>
                              updateSecuritySetting(
                                "confirmPin",
                                e.target.value,
                              )
                            }
                          />
                        </div>
                      </div>
                      <Button
                        className="bg-blue-600 hover:bg-blue-700 text-white dark:text-white"
                        onClick={saveSecuritySettings}
                      >
                        Aggiorna PIN
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>
        </main>
      </div>
    </div>
  );
}
