"use client";

import React, { useState } from "react";
import { useToast } from "@/components/ui/toast-notification";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Shield, User, UserPlus, UserX, Copy, Check } from "lucide-react";

export default function AccessManagementPage() {
  const { showToast } = useToast();
  const [generatedToken, setGeneratedToken] = useState<string>("");
  const [isCopied, setIsCopied] = useState(false);
  const [managers, setManagers] = useState([
    {
      id: "1",
      name: "Marco Rossi",
      email: "marco.rossi@example.com",
      accessDate: "10/05/2023",
      isActive: true,
    },
    {
      id: "2",
      name: "Laura Bianchi",
      email: "laura.bianchi@example.com",
      accessDate: "15/06/2023",
      isActive: true,
    },
    {
      id: "3",
      name: "Giuseppe Verdi",
      email: "giuseppe.verdi@example.com",
      accessDate: "22/07/2023",
      isActive: false,
    },
  ]);

  const generateToken = () => {
    const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let result = "";
    for (let i = 0; i < 10; i++) {
      result += characters.charAt(
        Math.floor(Math.random() * characters.length),
      );
    }
    setGeneratedToken(result);
    setIsCopied(false);
    showToast("success", "Token generato con successo");
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(generatedToken);
    setIsCopied(true);
    showToast("success", "Token copiato negli appunti");
  };

  const toggleManagerStatus = (id: string) => {
    setManagers(
      managers.map((manager) =>
        manager.id === id
          ? { ...manager, isActive: !manager.isActive }
          : manager,
      ),
    );
    showToast(
      "success",
      `Gestore ${managers.find((m) => m.id === id)?.isActive ? "disattivato" : "attivato"} con successo`,
    );
  };

  const deleteManager = (id: string) => {
    setManagers(managers.filter((manager) => manager.id !== id));
    showToast("success", "Gestore eliminato con successo");
  };

  return (
    <div className="flex flex-col gap-6 p-6 md:p-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <Shield className="h-8 w-8 text-blue-600" />
          Gestione Accessi
        </h1>
        <p className="text-muted-foreground">
          Gestisci gli accessi alla dashboard e al database del tuo club
          sportivo.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5 text-blue-600" />
              Genera Token per Gestori
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Crea un token a 10 caratteri per dare accesso a nuovi gestori. Il
              token sarà valido per 24 ore.
            </p>

            <div className="flex flex-col space-y-4">
              <Button
                onClick={generateToken}
                className="bg-blue-600 hover:bg-blue-700"
              >
                Genera Nuovo Token
              </Button>

              {generatedToken && (
                <div className="mt-4 space-y-2">
                  <Label>Token Generato:</Label>
                  <div className="flex">
                    <Input
                      value={generatedToken}
                      readOnly
                      className="font-mono text-lg tracking-wider bg-gray-50"
                    />
                    <Button
                      variant="outline"
                      className="ml-2"
                      onClick={copyToClipboard}
                    >
                      {isCopied ? (
                        <Check className="h-4 w-4" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Condividi questo token con il nuovo gestore per permettergli
                    di accedere alla dashboard.
                  </p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5 text-blue-600" />
              Gestori con Accesso
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="border rounded-md overflow-hidden">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Nome
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Email
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Data Accesso
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Stato
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Azioni
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {managers.map((manager) => (
                    <tr key={manager.id}>
                      <td className="px-4 py-3 text-sm">{manager.name}</td>
                      <td className="px-4 py-3 text-sm">{manager.email}</td>
                      <td className="px-4 py-3 text-sm">
                        {manager.accessDate}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${manager.isActive ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}`}
                        >
                          {manager.isActive ? "Attivo" : "Disattivato"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <div className="flex space-x-2">
                          <Button
                            variant="outline"
                            size="sm"
                            className={`${manager.isActive ? "text-yellow-600 border-yellow-600 hover:bg-yellow-50" : "text-green-600 border-green-600 hover:bg-green-50"}`}
                            onClick={() => toggleManagerStatus(manager.id)}
                          >
                            {manager.isActive ? "Disattiva" : "Attiva"}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-red-600 border-red-600 hover:bg-red-50"
                            onClick={() => deleteManager(manager.id)}
                          >
                            Elimina
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserX className="h-5 w-5 text-blue-600" />
            Richieste di Accesso in Attesa
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-gray-500">
            <p>Non ci sono richieste di accesso in attesa</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
