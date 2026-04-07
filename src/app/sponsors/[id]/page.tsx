"use client";

import React, { useState, useEffect } from "react";
import Sidebar from "@/components/dashboard/Sidebar";
import Header from "@/components/dashboard/Header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { LogoUpload } from "@/components/ui/avatar-upload";
import Image from "next/image";
import companyDefaultImage from "@/../public/images/company.png";
import {
  Building,
  Mail,
  Phone,
  MapPin,
  Edit,
  Trash2,
  X,
  CreditCard,
  FileText,
  Plus,
  Download,
  Upload,
  Euro,
  Calendar,
  TrendingUp,
  TrendingDown,
} from "lucide-react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useToast } from "@/components/ui/toast-notification";
import { supabase } from "@/lib/supabase";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

export default function SponsorDetailsPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { showToast } = useToast();
  const sponsorId = params?.id as string;
  const clubId = searchParams?.get("clubId");
  const [isLoading, setIsLoading] = useState(true);
  const [sponsor, setSponsor] = useState<any>(null);
  const [payments, setPayments] = useState<any[]>([]);
  const [documents, setDocuments] = useState<any[]>([]);
  const [editingSection, setEditingSection] = useState<string | null>(null);
  const [editFormData, setEditFormData] = useState<any>({});
  const [showAddPaymentDialog, setShowAddPaymentDialog] = useState(false);
  const [showAddDocumentDialog, setShowAddDocumentDialog] = useState(false);
  const [newPayment, setNewPayment] = useState({
    description: "",
    amount: 0,
    type: "entrata",
    date: new Date().toISOString().split("T")[0],
    paymentMethod: "",
    bankAccount: "",
    notes: "",
  });
  const [newDocument, setNewDocument] = useState({
    title: "",
    description: "",
    file: null as File | null,
  });

  // Fetch sponsor data from database
  useEffect(() => {
    const fetchSponsorData = async () => {
      if (!clubId || clubId === "null" || clubId.trim() === "") {
        console.error("Invalid or missing clubId parameter:", clubId);
        showToast("error", "ID del club mancante. Torna alla lista sponsor.");
        setIsLoading(false);
        return;
      }

      if (!sponsorId) {
        console.error("Missing sponsorId parameter");
        showToast("error", "ID dello sponsor mancante");
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      try {
        console.log("Fetching club data for clubId:", clubId);
        
        const { data: clubData, error: clubError } = await supabase
          .from("clubs")
          .select("sponsors")
          .eq("id", clubId)
          .maybeSingle();

        if (clubError) {
          console.error("Error fetching club data:", clubError);
          showToast("error", `Errore nel caricamento dei dati del club: ${clubError.message}`);
          setIsLoading(false);
          return;
        }

        if (!clubData) {
          console.error("Club data not found for clubId:", clubId);
          showToast("error", "Club non trovato. Verifica l'ID del club.");
          setIsLoading(false);
          return;
        }

        console.log("Club data loaded successfully:", clubData);

        // Find sponsor in sponsors array
        let sponsorData = null;
        if (clubData?.sponsors && Array.isArray(clubData.sponsors)) {
          sponsorData = clubData.sponsors.find(
            (sponsor: any) => sponsor.id === sponsorId
          );
        }

        if (!sponsorData) {
          console.error("Sponsor not found in club data. SponsorId:", sponsorId);
          console.log("Available sponsors:", clubData?.sponsors);
          showToast("error", "Sponsor/Fornitore non trovato");
          setIsLoading(false);
          return;
        }

        setSponsor({
          id: sponsorData.id,
          // Anagrafica
          name: sponsorData.name || "Nome non disponibile",
          fiscalCode: sponsorData.fiscalCode || "",
          phone: sponsorData.phone || "",
          phoneSecondary: sponsorData.phoneSecondary || "",
          email: sponsorData.email || "",
          isPublicAdministration: sponsorData.isPublicAdministration || false,
          isSponsor: sponsorData.type === "sponsor" || sponsorData.isSponsor || false,
          isSupplier: sponsorData.type === "fornitore" || sponsorData.isSupplier || false,
          
          // Sede
          address: sponsorData.address || "",
          streetNumber: sponsorData.streetNumber || "",
          city: sponsorData.city || "",
          postalCode: sponsorData.postalCode || "",
          country: sponsorData.country || "Italia",
          region: sponsorData.region || "",
          province: sponsorData.province || "",
          
          // Finanza
          vatNumber: sponsorData.vatNumber || "",
          pec: sponsorData.pec || "",
          sdi: sponsorData.sdi || "",
          iban: sponsorData.iban || "",
          
          // Existing fields
          type: sponsorData.type || "sponsor",
        });

        // Load payments and documents from sponsorData if available
        const sponsorPayments = sponsorData.payments || [];
        setPayments(sponsorPayments);
        
        const sponsorDocuments = sponsorData.documents || [];
        setDocuments(sponsorDocuments);
      } catch (error) {
        console.error("Error fetching sponsor data:", error);
        showToast("error", "Errore nel caricamento dei dati dello sponsor");
      } finally {
        setIsLoading(false);
      }
    };

    fetchSponsorData();
  }, [clubId, sponsorId, showToast]);

  const handleEditSection = (section: string) => {
    setEditingSection(section);
    setEditFormData({ ...sponsor });
  };

  const handleSaveSection = async () => {
    if (!clubId || !sponsorId) return;

    try {
      const { updateClubDataItem } = await import("@/lib/simplified-db");
      
      await updateClubDataItem(clubId, "sponsors", sponsorId, editFormData);
      
      setSponsor(editFormData);
      setEditingSection(null);
      showToast("success", "Modifiche salvate con successo");
    } catch (error) {
      console.error("Error updating sponsor:", error);
      showToast("error", "Errore nel salvataggio delle modifiche");
    }
  };

  const handleDeleteSponsor = async () => {
    if (!clubId || !sponsorId) return;

    if (confirm("Sei sicuro di voler eliminare questo sponsor/fornitore?")) {
      try {
        const { deleteClubDataItem } = await import("@/lib/simplified-db");
        await deleteClubDataItem(clubId, "sponsors", sponsorId);
        showToast("success", "Sponsor/Fornitore eliminato con successo");
        router.push(`/sponsors?clubId=${clubId}`);
      } catch (error) {
        console.error("Error deleting sponsor:", error);
        showToast("error", "Errore nell'eliminazione dello sponsor");
      }
    }
  };

  const handleAddPayment = async () => {
    if (!newPayment.description || !newPayment.amount || !newPayment.paymentMethod) {
      showToast("error", "Compila tutti i campi obbligatori");
      return;
    }

    try {
      const paymentData = {
        id: `payment-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        ...newPayment,
        created_at: new Date().toISOString(),
      };

      const updatedPayments = [...payments, paymentData];
      setPayments(updatedPayments);

      // Update sponsor data with new payment
      const { updateClubDataItem } = await import("@/lib/simplified-db");
      await updateClubDataItem(clubId!, "sponsors", sponsorId, {
        ...sponsor,
        payments: updatedPayments,
      });

      setShowAddPaymentDialog(false);
      setNewPayment({
        description: "",
        amount: 0,
        type: "entrata",
        date: new Date().toISOString().split("T")[0],
        paymentMethod: "",
        bankAccount: "",
        notes: "",
      });
      showToast("success", "Pagamento registrato con successo");
    } catch (error) {
      console.error("Error adding payment:", error);
      showToast("error", "Errore nella registrazione del pagamento");
    }
  };

  const handleDeletePayment = async (paymentId: string) => {
    if (!confirm("Sei sicuro di voler eliminare questo pagamento?")) return;

    try {
      const updatedPayments = payments.filter(p => p.id !== paymentId);
      setPayments(updatedPayments);

      const { updateClubDataItem } = await import("@/lib/simplified-db");
      await updateClubDataItem(clubId!, "sponsors", sponsorId, {
        ...sponsor,
        payments: updatedPayments,
      });

      showToast("success", "Pagamento eliminato con successo");
    } catch (error) {
      console.error("Error deleting payment:", error);
      showToast("error", "Errore nell'eliminazione del pagamento");
    }
  };

  const handleAddDocument = async () => {
    if (!newDocument.title) {
      showToast("error", "Inserisci un titolo per il documento");
      return;
    }

    try {
      const documentData = {
        id: `doc-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        title: newDocument.title,
        description: newDocument.description,
        fileName: newDocument.file?.name || "",
        created_at: new Date().toISOString(),
      };

      const updatedDocuments = [...documents, documentData];
      setDocuments(updatedDocuments);

      const { updateClubDataItem } = await import("@/lib/simplified-db");
      await updateClubDataItem(clubId!, "sponsors", sponsorId, {
        ...sponsor,
        documents: updatedDocuments,
      });

      setShowAddDocumentDialog(false);
      setNewDocument({
        title: "",
        description: "",
        file: null,
      });
      showToast("success", "Documento aggiunto con successo");
    } catch (error) {
      console.error("Error adding document:", error);
      showToast("error", "Errore nell'aggiunta del documento");
    }
  };

  const handleDeleteDocument = async (documentId: string) => {
    if (!confirm("Sei sicuro di voler eliminare questo documento?")) return;

    try {
      const updatedDocuments = documents.filter(d => d.id !== documentId);
      setDocuments(updatedDocuments);

      const { updateClubDataItem } = await import("@/lib/simplified-db");
      await updateClubDataItem(clubId!, "sponsors", sponsorId, {
        ...sponsor,
        documents: updatedDocuments,
      });

      showToast("success", "Documento eliminato con successo");
    } catch (error) {
      console.error("Error deleting document:", error);
      showToast("error", "Errore nell'eliminazione del documento");
    }
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return "";
    const date = new Date(dateString);
    return date.toLocaleDateString("it-IT", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  // Show loading state
  if (isLoading) {
    return (
      <div className="flex h-screen bg-gray-50 dark:bg-gray-900">
        <Sidebar />
        <div className="flex flex-1 flex-col overflow-hidden">
          <Header title="Dettaglio Sponsor/Fornitore" />
          <main className="flex-1 overflow-y-auto p-4 md:p-6">
            <div className="flex justify-center items-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-700"></div>
            </div>
          </main>
        </div>
      </div>
    );
  }

  // Show error state if sponsor not found
  if (!sponsor) {
    return (
      <div className="flex h-screen bg-gray-50 dark:bg-gray-900">
        <Sidebar />
        <div className="flex flex-1 flex-col overflow-hidden">
          <Header title="Sponsor/Fornitore Non Trovato" />
          <main className="flex-1 overflow-y-auto p-4 md:p-6">
            <div className="flex flex-col items-center justify-center py-8">
              <h2 className="text-xl font-semibold mb-4">
                Sponsor/Fornitore non trovato
              </h2>
              <Button onClick={() => router.push(`/sponsors?clubId=${clubId}`)}>
                Torna alla lista sponsor
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
        <Header title="Dettaglio Sponsor/Fornitore" />
        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          <div className="mx-auto max-w-7xl space-y-6">
            {/* Header with info and actions */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <div className="flex items-center gap-4">
                {sponsor.logo ? (
                  <div className="h-16 w-16 rounded-lg overflow-hidden border-2 border-gray-200 dark:border-gray-700">
                    <img 
                      src={sponsor.logo} 
                      alt={sponsor.name} 
                      className="w-full h-full object-contain"
                    />
                  </div>
                ) : (
                  <div className="h-16 w-16 rounded-lg overflow-hidden border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-2">
                    <Image
                      src={companyDefaultImage}
                      alt={sponsor.name}
                      className="w-full h-full object-contain"
                      width={64}
                      height={64}
                    />
                  </div>
                )}
                <div>
                  <h1 className="text-2xl font-bold">{sponsor.name}</h1>
                  <div className="flex items-center gap-2 mt-1">
                    {sponsor.isSponsor && (
                      <Badge className="bg-blue-500 text-white">
                        Sponsor
                      </Badge>
                    )}
                    {sponsor.isSupplier && (
                      <Badge className="bg-green-500 text-white">
                        Fornitore
                      </Badge>
                    )}
                    {sponsor.isPublicAdministration && (
                      <Badge variant="outline">
                        P.A.
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex gap-2 w-full md:w-auto">
                <Button variant="destructive" className="flex-1 md:flex-none" onClick={handleDeleteSponsor}>
                  <Trash2 className="h-4 w-4 mr-2" />
                  Elimina
                </Button>
              </div>
            </div>

            {/* Tabs for different sections */}
            <Tabs defaultValue="anagrafica">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="anagrafica">
                  <Building className="h-4 w-4 mr-2" />
                  Anagrafica
                </TabsTrigger>
                <TabsTrigger value="finanza">
                  <CreditCard className="h-4 w-4 mr-2" />
                  Finanza
                </TabsTrigger>
                <TabsTrigger value="archivio">
                  <FileText className="h-4 w-4 mr-2" />
                  Archivio
                </TabsTrigger>
              </TabsList>

              {/* ANAGRAFICA TAB */}
              <TabsContent value="anagrafica" className="mt-4 space-y-6">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle>Dati Anagrafici</CardTitle>
                    <Button 
                      variant="ghost" 
                      size="sm"
                      onClick={() => handleEditSection('anagrafica')}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div>
                        <h3 className="text-sm font-medium text-muted-foreground">Ruolo</h3>
                        <div className="flex gap-2 mt-2">
                          <div className="flex items-center gap-2">
                            <span className="text-sm">Sponsor:</span>
                            <Badge className={sponsor.isSponsor ? "bg-blue-500" : "bg-gray-400"}>
                              {sponsor.isSponsor ? "SÌ" : "NO"}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm">Fornitore:</span>
                            <Badge className={sponsor.isSupplier ? "bg-green-500" : "bg-gray-400"}>
                              {sponsor.isSupplier ? "SÌ" : "NO"}
                            </Badge>
                          </div>
                        </div>
                      </div>
                      <div>
                        <h3 className="text-sm font-medium text-muted-foreground">Nome/Ragione Sociale *</h3>
                        <p className="mt-1">{sponsor.name}</p>
                      </div>
                      <div>
                        <h3 className="text-sm font-medium text-muted-foreground">Codice Fiscale</h3>
                        <p className="mt-1">{sponsor.fiscalCode || "-"}</p>
                      </div>
                      <div>
                        <h3 className="text-sm font-medium text-muted-foreground">Telefono (Primario)</h3>
                        <div className="flex items-center gap-2 mt-1">
                          <Phone className="h-4 w-4 text-muted-foreground" />
                          <p>{sponsor.phone || "-"}</p>
                        </div>
                      </div>
                      <div>
                        <h3 className="text-sm font-medium text-muted-foreground">Telefono (Secondario)</h3>
                        <div className="flex items-center gap-2 mt-1">
                          <Phone className="h-4 w-4 text-muted-foreground" />
                          <p>{sponsor.phoneSecondary || "-"}</p>
                        </div>
                      </div>
                      <div>
                        <h3 className="text-sm font-medium text-muted-foreground">Email</h3>
                        <div className="flex items-center gap-2 mt-1">
                          <Mail className="h-4 w-4 text-muted-foreground" />
                          <p>{sponsor.email}</p>
                        </div>
                      </div>
                      <div>
                        <h3 className="text-sm font-medium text-muted-foreground">Pubblica Amministrazione</h3>
                        <Badge className={sponsor.isPublicAdministration ? "bg-blue-500" : "bg-gray-400"}>
                          {sponsor.isPublicAdministration ? "SÌ" : "NO"}
                        </Badge>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle>Sede</CardTitle>
                    <Button 
                      variant="ghost" 
                      size="sm"
                      onClick={() => handleEditSection('sede')}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div>
                        <h3 className="text-sm font-medium text-muted-foreground">Indirizzo</h3>
                        <div className="flex items-center gap-2 mt-1">
                          <MapPin className="h-4 w-4 text-muted-foreground" />
                          <p>{sponsor.address || "-"}</p>
                        </div>
                      </div>
                      <div>
                        <h3 className="text-sm font-medium text-muted-foreground">Numero Civico</h3>
                        <p className="mt-1">{sponsor.streetNumber || "-"}</p>
                      </div>
                      <div>
                        <h3 className="text-sm font-medium text-muted-foreground">Comune</h3>
                        <p className="mt-1">{sponsor.city || "-"}</p>
                      </div>
                      <div>
                        <h3 className="text-sm font-medium text-muted-foreground">CAP</h3>
                        <p className="mt-1">{sponsor.postalCode || "-"}</p>
                      </div>
                      <div>
                        <h3 className="text-sm font-medium text-muted-foreground">Paese</h3>
                        <p className="mt-1">{sponsor.country}</p>
                      </div>
                      <div>
                        <h3 className="text-sm font-medium text-muted-foreground">Regione</h3>
                        <p className="mt-1">{sponsor.region || "-"}</p>
                      </div>
                      <div>
                        <h3 className="text-sm font-medium text-muted-foreground">Provincia</h3>
                        <p className="mt-1">{sponsor.province || "-"}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* FINANZA TAB */}
              <TabsContent value="finanza" className="mt-4 space-y-6">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle>Dati Finanziari</CardTitle>
                    <Button 
                      variant="ghost" 
                      size="sm"
                      onClick={() => handleEditSection('finanza')}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div>
                        <h3 className="text-sm font-medium text-muted-foreground">Partita IVA</h3>
                        <p className="mt-1">{sponsor.vatNumber || "-"}</p>
                      </div>
                      <div>
                        <h3 className="text-sm font-medium text-muted-foreground">PEC</h3>
                        <p className="mt-1">{sponsor.pec || "-"}</p>
                      </div>
                      <div>
                        <h3 className="text-sm font-medium text-muted-foreground">SDI (Fatturazione Elettronica)</h3>
                        <p className="mt-1">{sponsor.sdi || "-"}</p>
                      </div>
                      <div>
                        <h3 className="text-sm font-medium text-muted-foreground">IBAN</h3>
                        <p className="mt-1 font-mono">{sponsor.iban || "-"}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle>Pagamenti</CardTitle>
                    <Button 
                      className="bg-blue-600 hover:bg-blue-700"
                      onClick={() => setShowAddPaymentDialog(true)}
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Nuovo Pagamento
                    </Button>
                  </CardHeader>
                  <CardContent>
                    <div className="rounded-md border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Data</TableHead>
                            <TableHead>Causale</TableHead>
                            <TableHead>Tipo</TableHead>
                            <TableHead>Importo</TableHead>
                            <TableHead>Metodo</TableHead>
                            <TableHead className="text-right">Azioni</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {payments.length === 0 ? (
                            <TableRow>
                              <TableCell colSpan={6} className="h-24 text-center">
                                Nessun pagamento registrato
                              </TableCell>
                            </TableRow>
                          ) : (
                            payments.map((payment) => (
                              <TableRow key={payment.id}>
                                <TableCell>{formatDate(payment.date)}</TableCell>
                                <TableCell>{payment.description}</TableCell>
                                <TableCell>
                                  {payment.type === "entrata" ? (
                                    <div className="flex items-center gap-1 text-green-600">
                                      <TrendingUp className="h-4 w-4" />
                                      <span>Entrata</span>
                                    </div>
                                  ) : (
                                    <div className="flex items-center gap-1 text-red-600">
                                      <TrendingDown className="h-4 w-4" />
                                      <span>Uscita</span>
                                    </div>
                                  )}
                                </TableCell>
                                <TableCell className={payment.type === "entrata" ? "text-green-600 font-medium" : "text-red-600 font-medium"}>
                                  {payment.type === "entrata" ? "+" : "-"}€{payment.amount.toFixed(2)}
                                </TableCell>
                                <TableCell>{payment.paymentMethod}</TableCell>
                                <TableCell className="text-right">
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-8 w-8 p-0 text-red-600"
                                    onClick={() => handleDeletePayment(payment.id)}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </TableCell>
                              </TableRow>
                            ))
                          )}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* ARCHIVIO TAB */}
              <TabsContent value="archivio" className="mt-4 space-y-6">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle>Documenti e Contratti</CardTitle>
                    <Button 
                      className="bg-blue-600 hover:bg-blue-700"
                      onClick={() => setShowAddDocumentDialog(true)}
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Nuovo Documento
                    </Button>
                  </CardHeader>
                  <CardContent>
                    <div className="rounded-md border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Titolo</TableHead>
                            <TableHead>Descrizione</TableHead>
                            <TableHead>Data Creazione</TableHead>
                            <TableHead className="text-right">Azioni</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {documents.length === 0 ? (
                            <TableRow>
                              <TableCell colSpan={4} className="h-24 text-center">
                                Nessun documento registrato
                              </TableCell>
                            </TableRow>
                          ) : (
                            documents.map((document) => (
                              <TableRow key={document.id}>
                                <TableCell className="font-medium">{document.title}</TableCell>
                                <TableCell>{document.description || "-"}</TableCell>
                                <TableCell>{formatDate(document.created_at)}</TableCell>
                                <TableCell className="text-right">
                                  <div className="flex justify-end gap-2">
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      className="h-8 w-8 p-0"
                                    >
                                      <Download className="h-4 w-4" />
                                    </Button>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      className="h-8 w-8 p-0 text-red-600"
                                      onClick={() => handleDeleteDocument(document.id)}
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  </div>
                                </TableCell>
                              </TableRow>
                            ))
                          )}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>
        </main>
      </div>

      {/* Edit Section Modal */}
      {editingSection && (
        <div 
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={() => setEditingSection(null)}
        >
          <div 
            className="bg-white dark:bg-gray-800 rounded-lg max-w-2xl w-full max-h-[90vh] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b">
              <h3 className="text-lg font-semibold">Modifica Informazioni</h3>
              <Button 
                variant="ghost" 
                size="sm"
                onClick={() => setEditingSection(null)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="p-6 overflow-auto max-h-[calc(90vh-140px)]">
              {editingSection === 'anagrafica' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex items-center gap-2">
                      <Label>Sponsor</Label>
                      <Switch 
                        checked={editFormData.isSponsor}
                        onCheckedChange={(checked) => setEditFormData({...editFormData, isSponsor: checked})}
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <Label>Fornitore</Label>
                      <Switch 
                        checked={editFormData.isSupplier}
                        onCheckedChange={(checked) => setEditFormData({...editFormData, isSupplier: checked})}
                      />
                    </div>
                  </div>
                  <div>
                    <Label>Nome/Ragione Sociale *</Label>
                    <Input 
                      value={editFormData.name || ''} 
                      onChange={(e) => setEditFormData({...editFormData, name: e.target.value})}
                    />
                  </div>
                  <div>
                    <Label>Codice Fiscale</Label>
                    <Input 
                      value={editFormData.fiscalCode || ''} 
                      onChange={(e) => setEditFormData({...editFormData, fiscalCode: e.target.value})}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Telefono (Primario)</Label>
                      <Input 
                        value={editFormData.phone || ''} 
                        onChange={(e) => setEditFormData({...editFormData, phone: e.target.value})}
                      />
                    </div>
                    <div>
                      <Label>Telefono (Secondario)</Label>
                      <Input 
                        value={editFormData.phoneSecondary || ''} 
                        onChange={(e) => setEditFormData({...editFormData, phoneSecondary: e.target.value})}
                      />
                    </div>
                  </div>
                  <div>
                    <Label>Email</Label>
                    <Input 
                      type="email"
                      value={editFormData.email || ''} 
                      onChange={(e) => setEditFormData({...editFormData, email: e.target.value})}
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <Label>Pubblica Amministrazione</Label>
                    <Switch 
                      checked={editFormData.isPublicAdministration}
                      onCheckedChange={(checked) => setEditFormData({...editFormData, isPublicAdministration: checked})}
                    />
                  </div>
                </div>
              )}

              {editingSection === 'sede' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Indirizzo</Label>
                      <Input 
                        value={editFormData.address || ''} 
                        onChange={(e) => setEditFormData({...editFormData, address: e.target.value})}
                      />
                    </div>
                    <div>
                      <Label>Numero Civico</Label>
                      <Input 
                        value={editFormData.streetNumber || ''} 
                        onChange={(e) => setEditFormData({...editFormData, streetNumber: e.target.value})}
                      />
                    </div>
                    <div>
                      <Label>Comune</Label>
                      <Input 
                        value={editFormData.city || ''} 
                        onChange={(e) => setEditFormData({...editFormData, city: e.target.value})}
                      />
                    </div>
                    <div>
                      <Label>CAP</Label>
                      <Input 
                        value={editFormData.postalCode || ''} 
                        onChange={(e) => setEditFormData({...editFormData, postalCode: e.target.value})}
                      />
                    </div>
                    <div>
                      <Label>Paese</Label>
                      <Input 
                        value={editFormData.country || ''} 
                        onChange={(e) => setEditFormData({...editFormData, country: e.target.value})}
                      />
                    </div>
                    <div>
                      <Label>Regione</Label>
                      <Input 
                        value={editFormData.region || ''} 
                        onChange={(e) => setEditFormData({...editFormData, region: e.target.value})}
                      />
                    </div>
                    <div>
                      <Label>Provincia</Label>
                      <Input 
                        value={editFormData.province || ''} 
                        onChange={(e) => setEditFormData({...editFormData, province: e.target.value})}
                      />
                    </div>
                  </div>
                </div>
              )}

              {editingSection === 'finanza' && (
                <div className="space-y-4">
                  <div>
                    <Label>Partita IVA</Label>
                    <Input 
                      value={editFormData.vatNumber || ''} 
                      onChange={(e) => setEditFormData({...editFormData, vatNumber: e.target.value})}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>PEC</Label>
                      <Input 
                        value={editFormData.pec || ''} 
                        onChange={(e) => setEditFormData({...editFormData, pec: e.target.value})}
                      />
                    </div>
                    <div>
                      <Label>SDI (Fatturazione Elettronica)</Label>
                      <Input 
                        value={editFormData.sdi || ''} 
                        onChange={(e) => setEditFormData({...editFormData, sdi: e.target.value})}
                      />
                    </div>
                  </div>
                  <div>
                    <Label>IBAN</Label>
                    <Input 
                      value={editFormData.iban || ''} 
                      onChange={(e) => setEditFormData({...editFormData, iban: e.target.value})}
                    />
                  </div>
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2 p-4 border-t">
              <Button variant="outline" onClick={() => setEditingSection(null)}>
                Annulla
              </Button>
              <Button onClick={handleSaveSection} className="bg-blue-600 hover:bg-blue-700">
                Salva Modifiche
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Add Payment Dialog */}
      <Dialog open={showAddPaymentDialog} onOpenChange={setShowAddPaymentDialog}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Crea Nuovo Pagamento</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div>
              <Label>Causale *</Label>
              <Input 
                value={newPayment.description}
                onChange={(e) => setNewPayment({...newPayment, description: e.target.value})}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Importo (€) *</Label>
                <Input 
                  type="number"
                  value={newPayment.amount || ''}
                  onChange={(e) => setNewPayment({...newPayment, amount: parseFloat(e.target.value) || 0})}
                />
              </div>
              <div>
                <Label>Tipo *</Label>
                <select 
                  className="w-full h-10 rounded-md border border-input bg-background px-3"
                  value={newPayment.type}
                  onChange={(e) => setNewPayment({...newPayment, type: e.target.value})}
                >
                  <option value="entrata">In entrata</option>
                  <option value="uscita">In uscita</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Data *</Label>
                <Input 
                  type="date"
                  value={newPayment.date}
                  onChange={(e) => setNewPayment({...newPayment, date: e.target.value})}
                />
              </div>
              <div>
                <Label>Metodo di pagamento *</Label>
                <Input 
                  value={newPayment.paymentMethod}
                  onChange={(e) => setNewPayment({...newPayment, paymentMethod: e.target.value})}
                />
              </div>
            </div>
            <div>
              <Label>Conto Corrente</Label>
              <Input 
                value={newPayment.bankAccount}
                onChange={(e) => setNewPayment({...newPayment, bankAccount: e.target.value})}
              />
            </div>
            <div>
              <Label>Note</Label>
              <Textarea 
                value={newPayment.notes}
                onChange={(e) => setNewPayment({...newPayment, notes: e.target.value})}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddPaymentDialog(false)}>
              Annulla
            </Button>
            <Button onClick={handleAddPayment} className="bg-blue-600 hover:bg-blue-700">
              Registra Pagamento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Document Dialog */}
      <Dialog open={showAddDocumentDialog} onOpenChange={setShowAddDocumentDialog}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Aggiungi Documento</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div>
              <Label>Titolo *</Label>
              <Input 
                value={newDocument.title}
                onChange={(e) => setNewDocument({...newDocument, title: e.target.value})}
              />
            </div>
            <div>
              <Label>Descrizione</Label>
              <Textarea 
                value={newDocument.description}
                onChange={(e) => setNewDocument({...newDocument, description: e.target.value})}
                rows={3}
              />
            </div>
            <div>
              <Label>Allega documento</Label>
              <div className="flex items-center gap-2 mt-2">
                <Button 
                  variant="outline"
                  onClick={() => document.getElementById('document-file-input')?.click()}
                  className="flex items-center gap-2"
                >
                  <Upload className="h-4 w-4" />
                  {newDocument.file ? newDocument.file.name : "Seleziona file"}
                </Button>
                <input
                  id="document-file-input"
                  type="file"
                  className="hidden"
                  onChange={(e) => setNewDocument({...newDocument, file: e.target.files?.[0] || null})}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDocumentDialog(false)}>
              Annulla
            </Button>
            <Button onClick={handleAddDocument} className="bg-blue-600 hover:bg-blue-700">
              Aggiungi Documento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
