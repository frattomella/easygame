"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import Sidebar from "@/components/dashboard/Sidebar";
import Header from "@/components/dashboard/Header";
import {
  DashboardPageContainer,
  dashboardMainClassName,
} from "@/components/dashboard/dashboard-page-container";
import { SharedPageHeader } from "@/components/dashboard/shared-page-header";
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
  ArrowLeft,
} from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/lib/supabase";
import { addTrainerContract, deleteTrainerContract } from "@/lib/simplified-db";
import { useAuth } from "@/components/providers/AuthProvider";
import { resolveActiveClubId } from "@/lib/active-club";
import { downloadAttachment, openClientFileUrl } from "@/lib/client-files";
import { uploadAttachmentReference } from "@/lib/api/attachments";

interface Contract {
  id: string;
  title: string;
  description: string;
  fileName: string;
  fileSize?: string;
  fileType?: string;
  /**
   * Il file vero.
   *
   * Fino al Blocco 7 il contratto salvava **solo** nome, peso e tipo: il
   * documento caricato veniva letto per ricavarne quei tre valori e poi
   * buttato. «Visualizza» apriva una scheda con quei metadati e «Scarica»
   * produceva un file di testo con dentro la descrizione, chiamato pero
   * `contratto.pdf`. Nessuno dei due mostrava il documento, perche il
   * documento non era da nessuna parte.
   */
  fileUrl?: string;
  uploadDate: string;
  expiryDate?: string;
}

export default function TrainerContractsUploadPage({
  params,
}: {
  params: { id: string };
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const { activeClub } = useAuth();
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [clubId, setClubId] = useState<string | null>(null);
  const [trainerId, setTrainerId] = useState<string>(params.id);
  const [trainer, setTrainer] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  const [isAddContractOpen, setIsAddContractOpen] = useState(false);
  const [isViewContractOpen, setIsViewContractOpen] = useState(false);
  const [selectedContract, setSelectedContract] = useState<Contract | null>(
    null,
  );
  const [newContract, setNewContract] = useState({
    title: "",
    description: "",
    fileName: "",
    fileSize: "",
    fileType: "",
    fileUrl: "",
    expiryDate: "",
  });
  const [dragActive, setDragActive] = useState(false);

  // Fetch trainer and contracts data
  React.useEffect(() => {
    const fetchData = async () => {
      try {
        // Get club ID from URL
        const urlClubId = resolveActiveClubId(activeClub?.id);
        if (!urlClubId) {
          showToast("error", "ID del club non trovato");
          router.back();
          return;
        }
        setClubId(urlClubId);

        console.log("Fetching club data for clubId:", urlClubId);
        console.log("Looking for trainerId:", trainerId);

        // Fetch club data including trainers and staff_members
        const { data: clubData, error: clubError } = await supabase
          .from("clubs")
          .select("trainers, staff_members")
          .eq("id", urlClubId)
          .maybeSingle();

        if (clubError) {
          console.error("Error fetching club data:", clubError);
          throw clubError;
        }

        if (!clubData) {
          showToast("error", "Club non trovato");
          router.back();
          return;
        }

        console.log("Club data loaded:", clubData);

        // Look for trainer in multiple places
        let trainerData = null;

        // First check trainers array
        if (clubData?.trainers && Array.isArray(clubData.trainers)) {
          trainerData = clubData.trainers.find(
            (trainer: any) => trainer.id === trainerId,
          );
          console.log("Found in trainers array:", trainerData);
        }

        // If not found in trainers array, check staff_members array
        if (
          !trainerData &&
          clubData?.staff_members &&
          Array.isArray(clubData.staff_members)
        ) {
          trainerData = clubData.staff_members.find(
            (staff: any) =>
              staff.id === trainerId &&
              (staff.role === "trainer" || staff.role === "allenatore"),
          );
          console.log("Found in staff_members array:", trainerData);
        }

        if (!trainerData) {
          console.error("Trainer not found. TrainerId:", trainerId);
          console.log("Available trainers:", clubData?.trainers);
          console.log("Available staff members:", clubData?.staff_members);
          showToast("error", "Allenatore non trovato");
          router.back();
          return;
        }

        setTrainer({
          id: trainerData.id,
          name: trainerData.name || "Nome non disponibile",
          role: "Allenatore",
          category:
            trainerData.categories?.length > 0
              ? `${trainerData.categories.length} categorie`
              : "Nessuna categoria",
          email: trainerData.email || "",
          phone: trainerData.phone || "",
        });

        // Load trainer contracts from trainerData if available
        const trainerContracts = trainerData.contracts || [];
        setContracts(trainerContracts);
        
        console.log("Trainer loaded successfully:", trainerData);
      } catch (error) {
        console.error("Error fetching data:", error);
        showToast("error", "Errore nel caricamento dei dati");
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [trainerId, router, showToast]);

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    const { name, value } = e.target;
    setNewContract({ ...newContract, [name]: value });
  };

  /** Legge il file **e lo tiene**: prima se ne ricavavano solo i metadati. */
  const acceptFile = async (file: File) => {
    /*
      Il contratto **non** entra nel record dell'allenatore: viene caricato e
      il record ne conserva il riferimento (WP-15, ADR-0034).
    */
    let fileUrl = "";
    try {
      fileUrl = await uploadAttachmentReference(file, {
        ownerType: "trainer",
        ownerId: trainerId,
        organizationId: clubId,
        category: "contratto",
      });
    } catch (error: any) {
      showToast("error", error?.message || "Non sono riuscito a caricare il file");
      return;
    }

    setNewContract((current) => ({
      ...current,
      title: current.title || file.name.replace(/.[^.]+$/, ""),
      fileName: file.name,
      fileSize: formatFileSize(file.size),
      fileType: file.type,
      fileUrl,
    }));
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) acceptFile(file);
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (file) acceptFile(file);
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  const handleAddContract = async () => {
    if (!newContract.title || !newContract.fileName) {
      showToast("error", "Inserisci almeno il titolo e carica un file");
      return;
    }

    if (!clubId || !trainerId) {
      showToast("error", "Dati mancanti per salvare il documento");
      return;
    }

    try {
      const contractData = {
        id: `contract-${Date.now()}`,
        title: newContract.title,
        description: newContract.description,
        fileName: newContract.fileName,
        fileSize: newContract.fileSize,
        fileType: newContract.fileType,
        fileUrl: newContract.fileUrl,
        uploadDate: new Date().toISOString().split("T")[0],
        expiryDate: newContract.expiryDate || undefined,
      };

      const savedContract = await addTrainerContract(
        clubId,
        trainerId,
        contractData,
      );
      setContracts([...contracts, savedContract]);
      setNewContract({
        title: "",
        description: "",
        fileName: "",
        fileSize: "",
        fileType: "",
        fileUrl: "",
        expiryDate: "",
      });
      setIsAddContractOpen(false);
      showToast("success", "Documento aggiunto con successo");
    } catch (error) {
      showToast("error", "Errore nel salvataggio del documento");
    }
  };

  const handleDeleteContract = async (id: string) => {
    if (!clubId || !trainerId) return;

    if (confirm("Sei sicuro di voler eliminare questo documento?")) {
      try {
        await deleteTrainerContract(clubId, trainerId, id);
        setContracts(contracts.filter((contract) => contract.id !== id));
        showToast("success", "Documento eliminato con successo");
      } catch (error) {
        showToast("error", "Errore nell'eliminazione del documento");
      }
    }
  };

  /**
   * «Visualizza» apre il documento, non una scheda di metadati.
   *
   * Il dialog resta come ripiego per i contratti caricati prima del Blocco 7,
   * che il file non ce l'hanno: li mostra cosa si sa e dice che il documento
   * va ricaricato, invece di far finta di aprirlo.
   */
  const handleViewContract = (contract: Contract) => {
    if (contract.fileUrl && openClientFileUrl(contract.fileUrl)) {
      return;
    }

    setSelectedContract(contract);
    setIsViewContractOpen(true);

    if (!contract.fileUrl) {
      showToast(
        "error",
        "Questo contratto e stato caricato senza il file: ricaricalo per poterlo aprire",
      );
    }
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen bg-background">
        <Sidebar />
        <div className="flex-1">
          <Header />
          <main className="p-6">
            <div className="flex justify-center items-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-700"></div>
            </div>
          </main>
        </div>
      </div>
    );
  }

  if (!trainer) {
    return (
      <div className="flex min-h-screen bg-background">
        <Sidebar />
        <div className="flex-1">
          <Header />
          <main className="p-6">
            <div className="flex flex-col items-center justify-center py-8">
              <h2 className="text-xl font-semibold mb-4">
                Allenatore non trovato
              </h2>
              <Button onClick={() => router.back()}>Torna indietro</Button>
            </div>
          </main>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />
      <div className="flex-1">
        <Header />
        <main className={dashboardMainClassName}>
          <DashboardPageContainer>
          <div className="flex items-center mb-6">
            <Button
              variant="outline"
              size="icon"
              onClick={() => router.back()}
              className="mr-4"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <SharedPageHeader
              title={`Documenti di ${trainer?.name || "Allenatore"}`}
              className="flex-1"
            />
          </div>

          <div className="grid grid-cols-1 gap-6 mb-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Documenti</CardTitle>
                <Button onClick={() => setIsAddContractOpen(true)}>
                  <Plus className="h-4 w-4 mr-2" /> Aggiungi Documento
                </Button>
              </CardHeader>
              <CardContent>
                {contracts.length === 0 ? (
                  <p className="text-muted-foreground text-center py-8">
                    Nessun documento disponibile
                  </p>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {contracts.map((contract) => (
                      <Card key={contract.id} className="overflow-hidden">
                        <CardContent className="p-0">
                          <div className="p-4 flex items-start space-x-4">
                            <div className="bg-primary/10 p-2 rounded-md">
                              <FileText className="h-8 w-8 text-primary" />
                            </div>
                            <div className="flex-1 space-y-1">
                              <h3 className="font-medium">{contract.title}</h3>
                              <p className="text-sm text-muted-foreground">
                                {contract.description}
                              </p>
                              <div className="flex items-center text-xs text-muted-foreground">
                                <span className="flex items-center">
                                  <Calendar className="h-3 w-3 mr-1" />
                                  Caricato: {contract.uploadDate}
                                </span>
                                {contract.expiryDate && (
                                  <span className="flex items-center ml-3">
                                    <Calendar className="h-3 w-3 mr-1" />
                                    Scadenza: {contract.expiryDate}
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-muted-foreground">
                                {contract.fileName} ({contract.fileSize})
                              </p>
                            </div>
                          </div>
                          <div className="border-t p-2 bg-muted/30 flex justify-end space-x-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleViewContract(contract)}
                            >
                              <Eye className="h-4 w-4 mr-1" /> Visualizza
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                if (
                                  !downloadAttachment(contract.fileUrl, {
                                    documentType: "Contratto",
                                    fullName: trainer?.name,
                                    date: contract.uploadDate,
                                    fileName: contract.fileName,
                                  })
                                ) {
                                  showToast(
                                    "error",
                                    "Questo contratto non ha un file allegato: ricaricalo",
                                  );
                                  return;
                                }

                                showToast(
                                  "success",
                                  "Download del documento iniziato",
                                );
                              }}
                            >
                              <Download className="h-4 w-4 mr-1" /> Scarica
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-destructive hover:text-destructive"
                              onClick={() => handleDeleteContract(contract.id)}
                            >
                              <Trash2 className="h-4 w-4 mr-1" /> Elimina
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Add Contract Dialog */}
          <Dialog open={isAddContractOpen} onOpenChange={setIsAddContractOpen}>
            <DialogContent className="sm:max-w-[550px]">
              <DialogHeader>
                <DialogTitle>Aggiungi Nuovo Documento</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="space-y-2">
                  <Label htmlFor="title">Titolo</Label>
                  <Input
                    id="title"
                    name="title"
                    value={newContract.title}
                    onChange={handleInputChange}
                    placeholder="Titolo del documento"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="description">Descrizione</Label>
                  <Textarea
                    id="description"
                    name="description"
                    value={newContract.description}
                    onChange={handleInputChange}
                    placeholder="Descrizione del documento"
                    rows={3}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="expiryDate">
                    Data di Scadenza (opzionale)
                  </Label>
                  <Input
                    id="expiryDate"
                    name="expiryDate"
                    type="date"
                    value={newContract.expiryDate}
                    onChange={handleInputChange}
                  />
                </div>
                <div className="space-y-2">
                  <Label>File</Label>
                  <div
                    className={`border-2 border-dashed rounded-md p-6 text-center ${dragActive ? "border-primary bg-primary/5" : "border-border"}`}
                    onDragEnter={handleDrag}
                    onDragLeave={handleDrag}
                    onDragOver={handleDrag}
                    onDrop={handleDrop}
                  >
                    <div className="flex flex-col items-center justify-center space-y-2">
                      <Upload className="h-8 w-8 text-muted-foreground" />
                      <div className="text-sm">
                        <p>
                          <label
                            htmlFor="file"
                            className="font-medium text-primary cursor-pointer hover:underline"
                          >
                            Clicca per caricare
                          </label>{" "}
                          o trascina e rilascia
                        </p>
                        <p className="text-xs text-muted-foreground">
                          PDF, DOC, DOCX (max 10MB)
                        </p>
                      </div>
                      <Input
                        id="file"
                        type="file"
                        className="sr-only"
                        onChange={handleFileChange}
                        accept=".pdf,.doc,.docx"
                      />
                    </div>
                    {newContract.fileName && (
                      <div className="mt-4 text-sm">
                        <p className="font-medium">{newContract.fileName}</p>
                        <p className="text-xs text-muted-foreground">
                          {newContract.fileSize}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex justify-end space-x-2 mt-4">
                <Button
                  variant="outline"
                  onClick={() => setIsAddContractOpen(false)}
                >
                  Annulla
                </Button>
                <Button
                  onClick={handleAddContract}
                  disabled={!newContract.title || !newContract.fileName}
                >
                  Aggiungi Documento
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          {/* View Contract Dialog */}
          <Dialog
            open={isViewContractOpen}
            onOpenChange={setIsViewContractOpen}
          >
            <DialogContent className="sm:max-w-[550px]">
              <DialogHeader>
                <DialogTitle>
                  {selectedContract?.title || "Visualizza Documento"}
                </DialogTitle>
              </DialogHeader>
              {selectedContract && (
                <div className="space-y-4">
                  <div className="rounded-md bg-muted p-4">
                    <div className="flex h-40 flex-col items-center justify-center gap-2 rounded border bg-background px-4 text-center">
                      <FileText className="h-10 w-10 text-muted-foreground" />
                      <p className="text-sm text-muted-foreground">
                        {selectedContract.fileUrl
                          ? "Anteprima non disponibile: usa Scarica per aprire il documento."
                          : "Documento non allegato: questo contratto e stato registrato senza il file."}
                      </p>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <h3 className="font-medium">Dettagli</h3>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div className="text-muted-foreground">Nome file:</div>
                      <div>{selectedContract.fileName}</div>
                      <div className="text-muted-foreground">Dimensione:</div>
                      <div>{selectedContract.fileSize}</div>
                      <div className="text-muted-foreground">
                        Data caricamento:
                      </div>
                      <div>{selectedContract.uploadDate}</div>
                      {selectedContract.expiryDate && (
                        <>
                          <div className="text-muted-foreground">
                            Data scadenza:
                          </div>
                          <div>{selectedContract.expiryDate}</div>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <h3 className="font-medium">Descrizione</h3>
                    <p className="text-sm">{selectedContract.description}</p>
                  </div>
                  <div className="flex justify-end space-x-2 mt-4">
                    <Button
                      variant="outline"
                      onClick={() => setIsViewContractOpen(false)}
                    >
                      Chiudi
                    </Button>
                    <Button
                      onClick={() => {
                        if (selectedContract) {
                          if (
                            !downloadAttachment(selectedContract.fileUrl, {
                              documentType: "Contratto",
                              fullName: trainer?.name,
                              date: selectedContract.uploadDate,
                              fileName: selectedContract.fileName,
                            })
                          ) {
                            showToast(
                              "error",
                              "Questo contratto non ha un file allegato: ricaricalo",
                            );
                            return;
                          }

                          showToast(
                            "success",
                            "Download del documento iniziato",
                          );
                        }
                      }}
                    >
                      <Download className="h-4 w-4 mr-2" /> Scarica
                    </Button>
                  </div>
                </div>
              )}
            </DialogContent>
          </Dialog>
          </DashboardPageContainer>
        </main>
      </div>
    </div>
  );
}
