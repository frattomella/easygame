"use client";

import React, { useState, useEffect } from "react";
import Sidebar from "@/components/dashboard/Sidebar";
import Header from "@/components/dashboard/Header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toast-notification";
import { Eye, Edit, Save, Shield, User, UserCog, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { TimerBadge } from "@/components/ui/timer-badge";
import TrainerPermissionsPage from "@/components/permissions/trainer-permissions-page";

export default function PermissionsPage() {
  return <TrainerPermissionsPage />;
  const { showToast } = useToast();

  // Visibility permissions
  const [visibilityPermissions, setVisibilityPermissions] = useState({
    registrationStatus: true,
    personalInfo: true,
    medicalCertificate: true,
    attendance: true,
    certificateHistory: true,
    documents: true,
    paymentsAndRegistration: true,
  });

  // Interaction permissions
  const [interactionPermissions, setInteractionPermissions] = useState({
    manageRegistrationStatus: false,
    editPersonalInfo: true,
    uploadMedicalCertificate: true,
    changePlan: false,
    addPayment: true,
    deleteItems: false,
    downloadReceipt: true,
    registerPayment: true,
    changePaymentStatus: false,
  });

  // Selected role state
  const [selectedRole, setSelectedRole] = useState("creator");
  const [generatedToken, setGeneratedToken] = useState("");
  const [tokenExpiryTime, setTokenExpiryTime] = useState<Date | null>(null);
  const [isTokenExpired, setIsTokenExpired] = useState(false);

  // Use empty array as initial state for server rendering, then populate on client
  const [managers, setManagers] = useState([]);

  // Initialize managers on client-side only - empty for new clubs
  useEffect(() => {
    // Empty for new clubs - managers will be added as needed
  }, []);

  const handleSavePermissions = () => {
    // In a real app, this would save to the backend
    showToast("success", "Permessi salvati con successo");
  };

  const handleRoleSelect = (role) => {
    setSelectedRole(role);
    // In a real app, you would load the permissions for the selected role from the backend
  };

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-gray-900">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header title="Gestione Permessi" />
        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          <div className="mx-auto max-w-9xl space-y-6">
            <div className="mb-6">
              <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                Gestione Permessi
              </h1>
              <p className="text-muted-foreground mt-1">
                Configura cosa possono vedere e fare i genitori quando accedono
                con il token dell'atleta
              </p>
            </div>

            <Tabs defaultValue="visibility">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger
                  value="visibility"
                  className="flex items-center gap-2"
                >
                  <Eye className="h-4 w-4" />
                  <span>Visibilità</span>
                </TabsTrigger>
                <TabsTrigger
                  value="interaction"
                  className="flex items-center gap-2"
                >
                  <Edit className="h-4 w-4" />
                  <span>Interazioni</span>
                </TabsTrigger>
                <TabsTrigger
                  value="management"
                  className="flex items-center gap-2"
                >
                  <Shield className="h-4 w-4" />
                  <span>Gestione</span>
                </TabsTrigger>
              </TabsList>

              <TabsContent value="visibility" className="space-y-4 mt-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Eye className="h-5 w-5" />
                      Visibilità per Ruoli
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground mb-6">
                      Seleziona quali sezioni della scheda atleta saranno
                      visibili ai vari ruoli quando accedono con il token
                    </p>

                    <div className="mb-6">
                      <Label>Seleziona Ruolo</Label>
                      <div className="flex space-x-2 mt-2">
                        <Button
                          variant="outline"
                          className={
                            selectedRole === "creator"
                              ? "border-blue-500 text-blue-500"
                              : ""
                          }
                          onClick={() => handleRoleSelect("creator")}
                        >
                          Creatore
                        </Button>
                        <Button
                          variant="outline"
                          className={
                            selectedRole === "manager"
                              ? "border-blue-500 text-blue-500"
                              : ""
                          }
                          onClick={() => handleRoleSelect("manager")}
                        >
                          Gestore
                        </Button>
                        <Button
                          variant="outline"
                          className={
                            selectedRole === "trainer"
                              ? "border-blue-500 text-blue-500"
                              : ""
                          }
                          onClick={() => handleRoleSelect("trainer")}
                        >
                          Allenatore
                        </Button>
                        <Button
                          variant="outline"
                          className={
                            selectedRole === "athlete"
                              ? "border-blue-500 text-blue-500"
                              : ""
                          }
                          onClick={() => handleRoleSelect("athlete")}
                        >
                          Atleta
                        </Button>
                        <Button
                          variant="outline"
                          className={
                            selectedRole === "parent"
                              ? "border-blue-500 text-blue-500"
                              : ""
                          }
                          onClick={() => handleRoleSelect("parent")}
                        >
                          Genitore
                        </Button>
                      </div>
                    </div>

                    <div className="space-y-6">
                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <Label>Stato Iscrizione</Label>
                          <p className="text-sm text-muted-foreground">
                            Mostra lo stato dell'iscrizione dell'atleta
                          </p>
                        </div>
                        <Switch
                          checked={visibilityPermissions.registrationStatus}
                          onCheckedChange={(checked) =>
                            setVisibilityPermissions({
                              ...visibilityPermissions,
                              registrationStatus: checked,
                            })
                          }
                        />
                      </div>

                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <Label>Informazioni Personali</Label>
                          <p className="text-sm text-muted-foreground">
                            Mostra i dati personali dell'atleta
                          </p>
                        </div>
                        <Switch
                          checked={visibilityPermissions.personalInfo}
                          onCheckedChange={(checked) =>
                            setVisibilityPermissions({
                              ...visibilityPermissions,
                              personalInfo: checked,
                            })
                          }
                        />
                      </div>

                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <Label>Certificato Medico</Label>
                          <p className="text-sm text-muted-foreground">
                            Mostra lo stato del certificato medico
                          </p>
                        </div>
                        <Switch
                          checked={visibilityPermissions.medicalCertificate}
                          onCheckedChange={(checked) =>
                            setVisibilityPermissions({
                              ...visibilityPermissions,
                              medicalCertificate: checked,
                            })
                          }
                        />
                      </div>

                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <Label>Presenze</Label>
                          <p className="text-sm text-muted-foreground">
                            Mostra il registro presenze dell'atleta
                          </p>
                        </div>
                        <Switch
                          checked={visibilityPermissions.attendance}
                          onCheckedChange={(checked) =>
                            setVisibilityPermissions({
                              ...visibilityPermissions,
                              attendance: checked,
                            })
                          }
                        />
                      </div>

                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <Label>Storico Certificati</Label>
                          <p className="text-sm text-muted-foreground">
                            Mostra lo storico dei certificati medici
                          </p>
                        </div>
                        <Switch
                          checked={visibilityPermissions.certificateHistory}
                          onCheckedChange={(checked) =>
                            setVisibilityPermissions({
                              ...visibilityPermissions,
                              certificateHistory: checked,
                            })
                          }
                        />
                      </div>

                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <Label>Documenti</Label>
                          <p className="text-sm text-muted-foreground">
                            Mostra i documenti dell'atleta
                          </p>
                        </div>
                        <Switch
                          checked={visibilityPermissions.documents}
                          onCheckedChange={(checked) =>
                            setVisibilityPermissions({
                              ...visibilityPermissions,
                              documents: checked,
                            })
                          }
                        />
                      </div>

                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <Label>Iscrizione e Pagamenti</Label>
                          <p className="text-sm text-muted-foreground">
                            Mostra il piano di pagamento e lo storico pagamenti
                          </p>
                        </div>
                        <Switch
                          checked={
                            visibilityPermissions.paymentsAndRegistration
                          }
                          onCheckedChange={(checked) =>
                            setVisibilityPermissions({
                              ...visibilityPermissions,
                              paymentsAndRegistration: checked,
                            })
                          }
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="interaction" className="space-y-4 mt-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <UserCog className="h-5 w-5" />
                      Permessi di Interazione
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground mb-6">
                      Seleziona quali azioni possono compiere i vari ruoli
                      quando accedono con il token
                    </p>

                    <div className="mb-6">
                      <Label>Seleziona Ruolo</Label>
                      <div className="flex space-x-2 mt-2">
                        <Button
                          variant="outline"
                          className={
                            selectedRole === "creator"
                              ? "border-blue-500 text-blue-500"
                              : ""
                          }
                          onClick={() => handleRoleSelect("creator")}
                        >
                          Creatore
                        </Button>
                        <Button
                          variant="outline"
                          className={
                            selectedRole === "manager"
                              ? "border-blue-500 text-blue-500"
                              : ""
                          }
                          onClick={() => handleRoleSelect("manager")}
                        >
                          Gestore
                        </Button>
                        <Button
                          variant="outline"
                          className={
                            selectedRole === "trainer"
                              ? "border-blue-500 text-blue-500"
                              : ""
                          }
                          onClick={() => handleRoleSelect("trainer")}
                        >
                          Allenatore
                        </Button>
                        <Button
                          variant="outline"
                          className={
                            selectedRole === "athlete"
                              ? "border-blue-500 text-blue-500"
                              : ""
                          }
                          onClick={() => handleRoleSelect("athlete")}
                        >
                          Atleta
                        </Button>
                        <Button
                          variant="outline"
                          className={
                            selectedRole === "parent"
                              ? "border-blue-500 text-blue-500"
                              : ""
                          }
                          onClick={() => handleRoleSelect("parent")}
                        >
                          Genitore
                        </Button>
                      </div>
                    </div>

                    <div className="space-y-6">
                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <Label>Gestione Stato Iscrizione</Label>
                          <p className="text-sm text-muted-foreground">
                            Permette di modificare lo stato dell'iscrizione
                          </p>
                        </div>
                        <Switch
                          checked={
                            interactionPermissions.manageRegistrationStatus
                          }
                          onCheckedChange={(checked) =>
                            setInteractionPermissions({
                              ...interactionPermissions,
                              manageRegistrationStatus: checked,
                            })
                          }
                        />
                      </div>

                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <Label>Modificare Informazioni Personali</Label>
                          <p className="text-sm text-muted-foreground">
                            Permette di modificare i dati personali
                          </p>
                        </div>
                        <Switch
                          checked={interactionPermissions.editPersonalInfo}
                          onCheckedChange={(checked) =>
                            setInteractionPermissions({
                              ...interactionPermissions,
                              editPersonalInfo: checked,
                            })
                          }
                        />
                      </div>

                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <Label>Carica Nuovo Certificato</Label>
                          <p className="text-sm text-muted-foreground">
                            Permette di caricare nuovi certificati medici
                          </p>
                        </div>
                        <Switch
                          checked={
                            interactionPermissions.uploadMedicalCertificate
                          }
                          onCheckedChange={(checked) =>
                            setInteractionPermissions({
                              ...interactionPermissions,
                              uploadMedicalCertificate: checked,
                            })
                          }
                        />
                      </div>

                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <Label>Cambiare Piano</Label>
                          <p className="text-sm text-muted-foreground">
                            Permette di modificare il piano di pagamento
                          </p>
                        </div>
                        <Switch
                          checked={interactionPermissions.changePlan}
                          onCheckedChange={(checked) =>
                            setInteractionPermissions({
                              ...interactionPermissions,
                              changePlan: checked,
                            })
                          }
                        />
                      </div>

                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <Label>Aggiungere Pagamento</Label>
                          <p className="text-sm text-muted-foreground">
                            Permette di registrare nuovi pagamenti
                          </p>
                        </div>
                        <Switch
                          checked={interactionPermissions.addPayment}
                          onCheckedChange={(checked) =>
                            setInteractionPermissions({
                              ...interactionPermissions,
                              addPayment: checked,
                            })
                          }
                        />
                      </div>

                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <Label>Eliminare Elementi</Label>
                          <p className="text-sm text-muted-foreground">
                            Permette di eliminare documenti, certificati e
                            pagamenti
                          </p>
                        </div>
                        <Switch
                          checked={interactionPermissions.deleteItems}
                          onCheckedChange={(checked) =>
                            setInteractionPermissions({
                              ...interactionPermissions,
                              deleteItems: checked,
                            })
                          }
                        />
                      </div>

                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <Label>Scaricare Ricevute</Label>
                          <p className="text-sm text-muted-foreground">
                            Permette di scaricare le ricevute dei pagamenti
                          </p>
                        </div>
                        <Switch
                          checked={interactionPermissions.downloadReceipt}
                          onCheckedChange={(checked) =>
                            setInteractionPermissions({
                              ...interactionPermissions,
                              downloadReceipt: checked,
                            })
                          }
                        />
                      </div>

                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <Label>Registrare Pagamenti</Label>
                          <p className="text-sm text-muted-foreground">
                            Permette di registrare pagamenti in attesa
                          </p>
                        </div>
                        <Switch
                          checked={interactionPermissions.registerPayment}
                          onCheckedChange={(checked) =>
                            setInteractionPermissions({
                              ...interactionPermissions,
                              registerPayment: checked,
                            })
                          }
                        />
                      </div>

                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <Label>Modificare Stato Pagamenti</Label>
                          <p className="text-sm text-muted-foreground">
                            Permette di cambiare lo stato dei pagamenti
                          </p>
                        </div>
                        <Switch
                          checked={interactionPermissions.changePaymentStatus}
                          onCheckedChange={(checked) =>
                            setInteractionPermissions({
                              ...interactionPermissions,
                              changePaymentStatus: checked,
                            })
                          }
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="management" className="space-y-4 mt-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Shield className="h-5 w-5" />
                      Gestione Accessi
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground mb-6">
                      Gestisci gli accessi alla dashboard e al database, genera
                      token per nuovi gestori
                    </p>

                    <div className="space-y-6">
                      <div className="border rounded-lg p-4">
                        <h3 className="font-medium mb-2">
                          Genera Token Gestore
                        </h3>
                        <p className="text-sm text-muted-foreground mb-4">
                          Crea un token di 10 caratteri per consentire l'accesso
                          come gestore (valido per 2 minuti)
                        </p>
                        <div className="flex gap-2 items-center">
                          <div className="flex-1 flex items-center gap-2">
                            <Input
                              readOnly
                              value={generatedToken || ""}
                              placeholder="Il token generato apparirà qui"
                              className="font-mono w-64"
                            />
                            {generatedToken &&
                              tokenExpiryTime &&
                              !isTokenExpired && (
                                <TimerBadge
                                  expiryTime={tokenExpiryTime}
                                  onExpire={() => {
                                    setIsTokenExpired(true);
                                    showToast("warning", "Il token è scaduto");
                                  }}
                                />
                              )}
                          </div>
                          <div className="flex items-center gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-blue-600 border-blue-600"
                              onClick={() => {
                                // Use a client-side only function for random token generation
                                if (typeof window !== "undefined") {
                                  const chars =
                                    "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
                                  let token = "";
                                  for (let i = 0; i < 10; i++) {
                                    token += chars.charAt(
                                      Math.floor(Math.random() * chars.length),
                                    );
                                  }
                                  setGeneratedToken(token);
                                  // Set expiry time to 2 minutes from now
                                  const expiryTime = new Date();
                                  expiryTime.setMinutes(
                                    expiryTime.getMinutes() + 2,
                                  );
                                  setTokenExpiryTime(expiryTime);
                                  setIsTokenExpired(false);
                                  showToast(
                                    "success",
                                    "Token generato con successo (valido per 2 minuti)",
                                  );
                                }
                              }}
                            >
                              Genera Token
                            </Button>
                          </div>
                        </div>
                      </div>

                      <div className="border rounded-lg p-4">
                        <h3 className="font-medium mb-2">Gestori Attivi</h3>
                        <p className="text-sm text-muted-foreground mb-4">
                          Elenco degli utenti con accesso alla dashboard
                        </p>

                        <div className="overflow-x-auto">
                          <table className="w-full border-collapse">
                            <thead>
                              <tr className="border-b">
                                <th className="text-left py-2 px-4">Nome</th>
                                <th className="text-left py-2 px-4">Email</th>
                                <th className="text-left py-2 px-4">Ruolo</th>
                                <th className="text-left py-2 px-4">
                                  Data Accesso
                                </th>
                                <th className="text-left py-2 px-4">Azioni</th>
                              </tr>
                            </thead>
                            <tbody>
                              {managers.map((manager, index) => (
                                <tr
                                  key={index}
                                  className="border-b hover:bg-gray-50"
                                >
                                  <td className="py-2 px-4">{manager.name}</td>
                                  <td className="py-2 px-4">{manager.email}</td>
                                  <td className="py-2 px-4">
                                    <Badge
                                      variant={
                                        manager.role === "Creatore"
                                          ? "default"
                                          : "outline"
                                      }
                                    >
                                      {manager.role}
                                    </Badge>
                                  </td>
                                  <td className="py-2 px-4">
                                    {manager.accessDate}
                                  </td>
                                  <td className="py-2 px-4">
                                    <div className="flex gap-2">
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        className={
                                          manager.active
                                            ? "text-red-500"
                                            : "text-green-500"
                                        }
                                        disabled={manager.role === "Creatore"}
                                        onClick={() => {
                                          if (manager.role === "Creatore") {
                                            showToast(
                                              "error",
                                              "Impossibile disattivare il profilo Creatore",
                                            );
                                            return;
                                          }
                                          const updatedManagers = [...managers];
                                          updatedManagers[index].active =
                                            !updatedManagers[index].active;
                                          setManagers(updatedManagers);
                                          showToast(
                                            "success",
                                            `Accesso ${updatedManagers[index].active ? "attivato" : "disattivato"} per ${manager.name}`,
                                          );
                                        }}
                                      >
                                        {manager.active
                                          ? "Disattiva"
                                          : "Attiva"}
                                      </Button>
                                      {manager.role !== "Creatore" && (
                                        <Button
                                          variant="outline"
                                          size="sm"
                                          className="text-red-500"
                                          onClick={() => {
                                            if (
                                              confirm(
                                                `Sei sicuro di voler eliminare l'accesso per ${manager.name}?`,
                                              )
                                            ) {
                                              const updatedManagers =
                                                managers.filter(
                                                  (_, i) => i !== index,
                                                );
                                              setManagers(updatedManagers);
                                              showToast(
                                                "success",
                                                `Accesso eliminato per ${manager.name}`,
                                              );
                                            }
                                          }}
                                        >
                                          Elimina
                                        </Button>
                                      )}
                                    </div>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>

            <div className="flex justify-end">
              <Button
                className="bg-blue-600 hover:bg-blue-700"
                onClick={handleSavePermissions}
              >
                <Save className="h-4 w-4 mr-2" />
                Salva Permessi
              </Button>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
