"use client";

import React, { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Sidebar from "@/components/dashboard/Sidebar";
import Header from "@/components/dashboard/Header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast-notification";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  FileText,
  Plus,
  Trash2,
  Calendar,
  Download,
  Eye,
  Upload,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { addTrainerContract, deleteTrainerContract } from "@/lib/simplified-db";

interface Contract {
  id: string;
  title: string;
  description: string;
  fileName: string;
  uploadDate: string;
  expiryDate?: string;
}

export default function TrainerContractsPage({
  params,
}: {
  params: { id: string };
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { showToast } = useToast();
  const trainerId = params.id;
  const clubId = searchParams?.get("clubId");
  const [isLoading, setIsLoading] = useState(true);
  const [trainer, setTrainer] = useState<any>(null);
  const [contracts, setContracts] = useState<Contract[]>([]);

  const [isAddContractOpen, setIsAddContractOpen] = useState(false);
  const [isViewContractOpen, setIsViewContractOpen] = useState(false);
  const [selectedContract, setSelectedContract] = useState<Contract | null>(
    null,
  );
  const [newContract, setNewContract] = useState({
    title: "",
    description: "",
    fileName: "",
    expiryDate: "",
  });

  // Fetch trainer data from database
  useEffect(() => {
    const fetchTrainerData = async () => {
      if (!clubId || !trainerId) return;

      setIsLoading(true);
      try {
        // Fetch club data - removed trainer_contracts from select
        const { data: clubData, error: clubError } = await supabase
          .from("clubs")
          .select("members")
          .eq("id", clubId)
          .maybeSingle();

        if (clubError) throw clubError;

        if (!clubData) {
          showToast("error", "Club non trovato");
          router.push(`/trainers?clubId=${clubId}`);
          return;
        }

        // Find the specific trainer
        const trainerMember = clubData?.members?.find(
          (member: any) =>
            member.staff_data && member.staff_data.id === trainerId,
        );

        if (trainerMember && trainerMember.staff_data) {
          const staffData = trainerMember.staff_data;
          setTrainer({
            id: staffData.id,
            name: staffData.name,
            role: "Allenatore",
            category:
              staffData.categories?.length > 0
                ? `${staffData.categories.length} categorie`
                : "Nessuna categoria",
            email: staffData.email,
            phone: staffData.phone || "",
          });

          // Load trainer contracts from staff_data if available
          const trainerContracts = staffData.contracts || [];
          setContracts(trainerContracts);
        } else {
          showToast("error", "Allenatore non trovato");
          router.push(`/trainers?clubId=${clubId}`);
        }
      } catch (error) {
        console.error("Error fetching trainer data:", error);
        showToast("error", "Errore nel caricamento dei dati dell'allenatore");
      } finally {
        setIsLoading(false);
      }
    };

    fetchTrainerData();
  }, [clubId, trainerId, router, showToast]);

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    const { name, value } = e.target;
    setNewContract({ ...newContract, [name]: value });
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setNewContract({ ...newContract, fileName: e.target.files[0].name });
    }
  };

  const handleAddContract = async () => {
    if (!newContract.title || !newContract.fileName) {
      showToast("error", "Inserisci almeno il titolo e carica un file");
      return;
    }

    if (!clubId || !trainerId) {
      showToast("error", "Dati mancanti per salvare il contratto");
      return;
    }

    try {
      const contractData = {
        id: `contract-${Date.now()}`,
        title: newContract.title,
        description: newContract.description,
        fileName: newContract.fileName,
        uploadDate: new Date().toISOString().split("T")[0],
        expiryDate: newContract.expiryDate || undefined,
      };

      const savedContract = await addTrainerContract(
        clubId,
        trainerId,
        contractData,
      );
      setContracts([...contracts, savedContract]);
      setIsAddContractOpen(false);
      setNewContract({
        title: "",
        description: "",
        fileName: "",
        expiryDate: "",
      });

      showToast("success", "Contratto aggiunto con successo");
    } catch (error) {
      showToast("error", "Errore nel salvataggio del contratto");
    }
  };

  const handleDeleteContract = async (id: string) => {
    if (!clubId || !trainerId) return;

    if (confirm("Sei sicuro di voler eliminare questo contratto?")) {
      try {
        await deleteTrainerContract(clubId, trainerId, id);
        setContracts(contracts.filter((contract) => contract.id !== id));
        showToast("success", "Contratto eliminato con successo");
      } catch (error) {
        showToast("error", "Errore nell'eliminazione del contratto");
      }
    }
  };

  const handleViewContract = (contract: Contract) => {
    setSelectedContract(contract);
    setIsViewContractOpen(true);
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return "N/A";
    const date = new Date(dateString);
    return date.toLocaleDateString("it-IT", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  };

  // Show loading state
  if (isLoading) {
    return (
      <div className="flex h-screen bg-gray-50 dark:bg-gray-900">
        <Sidebar />
        <div className="flex flex-1 flex-col overflow-hidden">
          <Header title="Contratti Allenatore" />
          <main className="flex-1 overflow-y-auto p-4 md:p-6">
            <div className="flex justify-center items-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-700"></div>
            </div>
          </main>
        </div>
      </div>
    );
  }

  // Show error state if trainer not found
  if (!trainer) {
    return (
      <div className="flex h-screen bg-gray-50 dark:bg-gray-900">
        <Sidebar />
        <div className="flex flex-1 flex-col overflow-hidden">
          <Header title="Allenatore Non Trovato" />
          <main className="flex-1 overflow-y-auto p-4 md:p-6">
            <div className="flex flex-col items-center justify-center py-8">
              <h2 className="text-xl font-semibold mb-4">
                Allenatore non trovato
              </h2>
              <Button onClick={() => router.push(`/trainers?clubId=${clubId}`)}>
                Torna alla lista allenatori
              </Button>
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
        <Header title={`Contratti - ${trainer.name}`} />
        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          <div className="mx-auto max-w-6xl space-y-6">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-2xl font-bold">{trainer.name}</h2>
                <p className="text-muted-foreground">
                  {trainer.role} - {trainer.category}
                </p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => router.back()}>
                  Torna al Profilo
                </Button>
                <Button
                  className="bg-blue-600 hover:bg-blue-700"
                  onClick={() => setIsAddContractOpen(true)}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Nuovo Contratto
                </Button>
              </div>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Contratti</CardTitle>
              </CardHeader>
              <CardContent>
                {contracts.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    Nessun contratto caricato per questo allenatore.
                  </div>
                ) : (
                  <div className="space-y-4">
                    {contracts.map((contract) => (
                      <div
                        key={contract.id}
                        className="flex flex-col md:flex-row justify-between items-start md:items-center p-4 border rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                      >
                        <div className="flex items-start gap-3">
                          <div className="bg-blue-100 dark:bg-blue-900 p-2 rounded">
                            <FileText className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                          </div>
                          <div>
                            <h3 className="font-medium">{contract.title}</h3>
                            <p className="text-sm text-muted-foreground">
                              {contract.description}
                            </p>
                            <div className="flex flex-wrap gap-4 mt-1 text-xs text-muted-foreground">
                              <span className="flex items-center gap-1">
                                <Upload className="h-3 w-3" /> Caricato il{" "}
                                {formatDate(contract.uploadDate)}
                              </span>
                              {contract.expiryDate && (
                                <span className="flex items-center gap-1">
                                  <Calendar className="h-3 w-3" /> Scadenza:{" "}
                                  {formatDate(contract.expiryDate)}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="flex gap-2 mt-3 md:mt-0">
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-blue-600 border-blue-600"
                            onClick={() => handleViewContract(contract)}
                          >
                            <Eye className="h-4 w-4 mr-1" />
                            Visualizza
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-green-600 border-green-600"
                            onClick={() => {
                              // Create a download link for the contract
                              const element = document.createElement("a");
                              element.setAttribute(
                                "href",
                                `data:text/plain;charset=utf-8,${encodeURIComponent(`Contratto: ${contract.title}\nDescrizione: ${contract.description}\nFile: ${contract.fileName}\nData caricamento: ${formatDate(contract.uploadDate)}${contract.expiryDate ? `\nScadenza: ${formatDate(contract.expiryDate)}` : ""}`)}`,
                              );
                              element.setAttribute(
                                "download",
                                `${contract.fileName}`,
                              );
                              element.style.display = "none";
                              document.body.appendChild(element);
                              element.click();
                              document.body.removeChild(element);
                              showToast(
                                "success",
                                "Download del contratto iniziato",
                              );
                            }}
                          >
                            <Download className="h-4 w-4 mr-1" />
                            Scarica
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-red-500 hover:text-red-700"
                            onClick={() => handleDeleteContract(contract.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </main>
      </div>

      {/* Add Contract Dialog */}
      <Dialog open={isAddContractOpen} onOpenChange={setIsAddContractOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Aggiungi Nuovo Contratto</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="title">Titolo</Label>
              <Input
                id="title"
                name="title"
                value={newContract.title}
                onChange={handleInputChange}
                placeholder="Es. Contratto Stagione 2024/2025"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Descrizione</Label>
              <Input
                id="description"
                name="description"
                value={newContract.description}
                onChange={handleInputChange}
                placeholder="Descrizione opzionale"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="expiryDate">Data di Scadenza (opzionale)</Label>
              <Input
                id="expiryDate"
                name="expiryDate"
                type="date"
                value={newContract.expiryDate}
                onChange={handleInputChange}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="file">File Contratto</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="file"
                  type="file"
                  accept=".pdf,.doc,.docx"
                  onChange={handleFileChange}
                  className="flex-1"
                  required
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Formati supportati: PDF, DOC, DOCX
              </p>
            </div>
            <div className="flex justify-end gap-2 pt-4">
              <Button
                variant="outline"
                onClick={() => setIsAddContractOpen(false)}
              >
                Annulla
              </Button>
              <Button
                className="bg-blue-600 hover:bg-blue-700"
                onClick={handleAddContract}
              >
                Salva Contratto
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* View Contract Dialog */}
      <Dialog open={isViewContractOpen} onOpenChange={setIsViewContractOpen}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>{selectedContract?.title}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="bg-gray-100 dark:bg-gray-800 p-4 rounded-lg">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h3 className="font-medium">{selectedContract?.title}</h3>
                  <p className="text-sm text-muted-foreground">
                    {selectedContract?.description}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-green-600 border-green-600"
                  onClick={() => {
                    if (selectedContract) {
                      // Create a download link for the contract
                      const element = document.createElement("a");
                      element.setAttribute(
                        "href",
                        `data:text/plain;charset=utf-8,${encodeURIComponent(`Contratto: ${selectedContract.title}\nDescrizione: ${selectedContract.description}\nFile: ${selectedContract.fileName}\nData caricamento: ${formatDate(selectedContract.uploadDate)}${selectedContract.expiryDate ? `\nScadenza: ${formatDate(selectedContract.expiryDate)}` : ""}`)}`,
                      );
                      element.setAttribute(
                        "download",
                        `${selectedContract.fileName}`,
                      );
                      element.style.display = "none";
                      document.body.appendChild(element);
                      element.click();
                      document.body.removeChild(element);
                      showToast("success", "Download del contratto iniziato");
                    }
                  }}
                >
                  <Download className="h-4 w-4 mr-1" />
                  Scarica
                </Button>
              </div>
              <div className="flex flex-wrap gap-4 mb-4 text-sm text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Upload className="h-4 w-4" /> Caricato il{" "}
                  {formatDate(selectedContract?.uploadDate)}
                </span>
                {selectedContract?.expiryDate && (
                  <span className="flex items-center gap-1">
                    <Calendar className="h-4 w-4" /> Scadenza:{" "}
                    {formatDate(selectedContract?.expiryDate)}
                  </span>
                )}
                <span className="flex items-center gap-1">
                  <FileText className="h-4 w-4" /> {selectedContract?.fileName}
                </span>
              </div>
              <div className="aspect-[16/9] bg-white dark:bg-gray-700 rounded-lg flex items-center justify-center">
                <div className="text-center p-8">
                  <FileText className="h-16 w-16 mx-auto text-gray-400" />
                  <p className="mt-4 text-muted-foreground">
                    Anteprima non disponibile. Scarica il file per
                    visualizzarlo.
                  </p>
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-4">
              <Button
                variant="outline"
                onClick={() => setIsViewContractOpen(false)}
              >
                Chiudi
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
