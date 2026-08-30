"use client";

import React, { useState, useEffect } from "react";
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
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { LogoUpload } from "@/components/ui/avatar-upload";
import { EntityIcon } from "@/components/ui/entity-icon";
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
  fetchSponsorCredit,
  recordSponsorCollection,
  saveSponsorContract,
} from "@/lib/sponsors/client";
import {
  EMPTY_SPONSOR_CONTRACT,
  fromSponsorCents,
  normalizeLegacySponsorCollections,
  normalizeSponsorContract,
  resolveSponsorCredit,
  sanitizeSponsorContract,
  toSponsorCents,
  type SponsorContract,
  type SponsorCredit,
} from "@/lib/sponsors/model";
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
  /*
    Il contratto vive accanto allo sponsor, non in una tabella sua: quattro
    campi che rendono il credito calcolabile. Il **residuo non sta qui** e non
    sta in archivio — si ricava a ogni render da contratto e incassi.
  */
  const [contract, setContract] = useState<SponsorContract>({
    ...EMPTY_SPONSOR_CONTRACT,
  });
  const [isEditingContract, setIsEditingContract] = useState(false);
  const [contractDraft, setContractDraft] = useState({
    agreedAmount: "",
    startDate: "",
    endDate: "",
    documentReference: "",
    notes: "",
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

        setContract(normalizeSponsorContract(sponsorData.contract));

        /*
          Gli incassi **non** si leggono piu dalla scheda: sono righe del
          registro degli incassi, e le due fonti le unisce il server. Vedi
          `ricaricaIncassi`, chiamata subito sotto.
        */
        void ricaricaIncassi();

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

  /**
   * Rilegge gli incassi dello sponsor **dal server**.
   *
   * Le fonti sono due — le righe di `payment_transactions` con la controparte
   * dichiarata, e la vecchia collezione JSON — e solo il server le conosce
   * entrambe e sa perche non si sommano due volte. Una pagina che ne guardasse
   * una sola direbbe un residuo sbagliato con la faccia di uno giusto.
   */
  const ricaricaIncassi = React.useCallback(async () => {
    if (!clubId || !sponsorId) return;

    const risposta = await fetchSponsorCredit(sponsorId, { clubId });
    if (risposta.error || !risposta.data) return;

    setCreditoDalServer(risposta.data.credit || null);
    setPayments(
      (risposta.data.collections || []).map((incasso) => ({
        id: incasso.id,
        description: incasso.notes || incasso.counterpartyLabel || "Incasso",
        amount: fromSponsorCents(incasso.amountCents),
        /* Uno storno e un'uscita: e denaro che torna indietro, e si vede. */
        type: incasso.amountCents < 0 || incasso.reversed ? "uscita" : "entrata",
        date: incasso.paidAt || "",
        paymentMethod: incasso.paymentMethod || "",
        notes: incasso.notes || "",
        reversed: incasso.reversed,
      })),
    );
  }, [clubId, sponsorId]);

  const handleAddPayment = async () => {
    if (!newPayment.description || !newPayment.amount || !newPayment.paymentMethod) {
      showToast("error", "Compila tutti i campi obbligatori");
      return;
    }

    try {
      /*
        **L'incasso di uno sponsor e un incasso, e va nel registro.**

        Questa riga scriveva nella collezione JSON annidata sulla scheda dello
        sponsor. Il residuo dello sponsor tornava, e il denaro **non arrivava
        in prima nota**: il §12 del piano chiede che un contratto da 5.000 con
        2.000 incassati produca 2.000 di entrata nel registro, e ne produceva
        zero. Il rendiconto del club non vedeva un euro di sponsorizzazioni.

        Adesso passa da `/api/v1/sponsorships/:id/collections`, che scrive una
        riga di `payment_transactions` con la controparte dichiarata: da li la
        legge il registro, che la proietta come qualunque altro incasso, e i
        saldi dei conti, che la sommano.
      */
      const risposta = await recordSponsorCollection({
        clubId,
        sponsorId,
        amount: newPayment.amount,
        paidAt: newPayment.date || null,
        paymentMethod: newPayment.paymentMethod,
        notes:
          [newPayment.description, newPayment.notes].filter(Boolean).join(" - ") ||
          null,
      });
      if (risposta.error) throw new Error(risposta.error.message);

      await ricaricaIncassi();

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
      showToast(
        "error",
        error instanceof Error && error.message
          ? error.message
          : "Errore nella registrazione del pagamento",
      );
    }
  };

  /**
   * **Un incasso non si cancella: si storna.**
   *
   * E la regola centrale della Wave 4 (D-3), e vale anche qui. Fino a ieri
   * questo pulsante toglieva un elemento dalla collezione JSON e risalvava
   * l'array: il denaro spariva senza uno storno, senza un autore e senza una
   * riga che lo raccontasse.
   *
   * Adesso l'incasso di uno sponsor e una riga del registro degli incassi, e si
   * corregge dove gli incassi si correggono — con uno storno, che lascia
   * l'originale al suo posto e gli mette accanto la riga opposta.
   */
  const handleDeletePayment = async (_paymentId: string) => {
    showToast(
      "error",
      "Un incasso non si cancella: si storna dalla pagina Movimenti, cosi la correzione resta leggibile.",
    );
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

  /*
    Le tre cifre, ricalcolate a ogni render.

    **Nessuna delle tre e salvata**, e il residuo meno delle altre: e la
    sottrazione fra il pattuito e cio che e davvero arrivato. Salvarlo vorrebbe
    dire vederlo divergere dagli incassi il primo giorno in cui qualcuno storna.
  */
  /**
   * Le tre cifre dello sponsor, **calcolate dal server**.
   *
   * Erano calcolate qui, dalla sola collezione JSON annidata sulla scheda. Da
   * quando un incasso di sponsorizzazione e una riga del registro degli
   * incassi, quella collezione e una delle **due** fonti, e la piu vecchia:
   * una pagina che guardasse solo lei direbbe che lo sponsor deve ancora tutto
   * il giorno dopo aver pagato.
   *
   * Il ripiego locale resta per il primo istante, prima che la lettura torni:
   * mostra il dovuto, che il contratto porta con se, invece di un riquadro
   * vuoto.
   */
  const [creditoDalServer, setCreditoDalServer] = useState<SponsorCredit | null>(
    null,
  );

  const credit = React.useMemo(
    () =>
      creditoDalServer ||
      resolveSponsorCredit({
        contract,
        collections: normalizeLegacySponsorCollections(payments),
      }),
    [creditoDalServer, contract, payments],
  );

  const openContractEditor = () => {
    setContractDraft({
      agreedAmount: contract.agreedAmountCents
        ? String(fromSponsorCents(contract.agreedAmountCents))
        : "",
      startDate: contract.startDate || "",
      endDate: contract.endDate || "",
      documentReference: contract.documentReference,
      notes: contract.notes,
    });
    setIsEditingContract(true);
  };

  const handleSaveContract = async () => {
    if (!clubId || !sponsorId) return;

    let next: SponsorContract;
    try {
      next = sanitizeSponsorContract({
        agreedAmountCents: toSponsorCents(contractDraft.agreedAmount),
        startDate: contractDraft.startDate,
        endDate: contractDraft.endDate,
        documentReference: contractDraft.documentReference,
        notes: contractDraft.notes,
      });
    } catch (error) {
      showToast(
        "error",
        error instanceof Error ? error.message : "Contratto non valido",
      );
      return;
    }

    try {
      /*
        **Il contratto si salva dalla sua rotta, non riscrivendo la scheda.**

        `updateClubDataItem` rileggeva `clubs.sponsors` intera, ne cambiava un
        elemento e la risalvava tutta dal browser. Una sonda di concorrenza ha
        salvato due contratti insieme e li ha visti fallire **tutte e otto le
        volte** su un conflitto di chiave primaria, con un messaggio che a chi
        lo riceveva non diceva niente.
      */
      const risposta = await saveSponsorContract({
        clubId,
        sponsorId,
        contract: next,
      });
      if (risposta.error) throw new Error(risposta.error.message);

      setContract(next);
      setIsEditingContract(false);
      showToast("success", "Contratto salvato");
    } catch (error) {
      console.error("Error saving sponsor contract:", error);
      showToast(
        "error",
        error instanceof Error && error.message
          ? error.message
          : "Errore nel salvataggio del contratto",
      );
    }
  };

  const formatAmount = (cents: number) =>
    new Intl.NumberFormat("it-IT", {
      style: "currency",
      currency: "EUR",
    }).format(fromSponsorCents(cents));

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
      <div className="flex h-[100dvh] bg-gray-50 dark:bg-gray-900">
        <Sidebar />
        <div className="flex flex-1 flex-col overflow-hidden">
          <Header title="Dettaglio Sponsor/Fornitore" />
          <main className={dashboardMainClassName}>
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
      <div className="flex h-[100dvh] bg-gray-50 dark:bg-gray-900">
        <Sidebar />
        <div className="flex flex-1 flex-col overflow-hidden">
          <Header title="Sponsor/Fornitore Non Trovato" />
          <main className={dashboardMainClassName}>
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
    <div className="flex h-[100dvh] bg-gray-50 dark:bg-gray-900">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header title="Dettaglio Sponsor/Fornitore" />
        <main className={dashboardMainClassName}>
          <DashboardPageContainer className="max-w-7xl">
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
                  <EntityIcon
                    type="sponsor"
                    size="lg"
                    shape="square"
                    label={sponsor.name}
                  />
                )}
                <div>
                  <h1 className="bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-3xl font-bold leading-tight tracking-tight text-transparent md:text-4xl">{sponsor.name}</h1>
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
                  <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <CardTitle>Contratto e credito</CardTitle>
                    {!isEditingContract && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="self-start sm:self-auto"
                        onClick={openContractEditor}
                      >
                        <Edit className="h-4 w-4 mr-2" />
                        {credit.hasContract ? "Modifica" : "Registra contratto"}
                      </Button>
                    )}
                  </CardHeader>
                  <CardContent className="space-y-6">
                    {/*
                      Le tre cifre stanno **accanto**, mai sommate: il dovuto e
                      un impegno, l'incassato e cassa, il residuo e la loro
                      differenza. Un riquadro unico che le sommasse direbbe un
                      numero che non esiste.
                    */}
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                      <div className="rounded-lg border p-4">
                        <p className="text-sm text-muted-foreground">Dovuto</p>
                        <p className="mt-1 text-2xl font-semibold">
                          {formatAmount(credit.dueCents)}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Pattuito dal contratto. Non e cassa.
                        </p>
                      </div>
                      <div className="rounded-lg border p-4">
                        <p className="text-sm text-muted-foreground">Incassato</p>
                        <p className="mt-1 text-2xl font-semibold text-green-600">
                          {formatAmount(credit.collectedCents)}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Somma degli incassi registrati.
                        </p>
                      </div>
                      <div className="rounded-lg border p-4">
                        <p className="text-sm text-muted-foreground">Residuo</p>
                        <p
                          className={
                            credit.outstandingCents > 0
                              ? "mt-1 text-2xl font-semibold text-amber-600"
                              : "mt-1 text-2xl font-semibold"
                          }
                        >
                          {formatAmount(credit.outstandingCents)}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {credit.hasContract
                            ? "Dovuto meno incassato."
                            : "Nessun contratto registrato."}
                        </p>
                      </div>
                    </div>

                    {isEditingContract ? (
                      <div className="space-y-4">
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                          <div className="space-y-2">
                            <Label htmlFor="contract-amount">
                              Importo pattuito (€)
                            </Label>
                            <Input
                              id="contract-amount"
                              inputMode="decimal"
                              value={contractDraft.agreedAmount}
                              onChange={(event) =>
                                setContractDraft({
                                  ...contractDraft,
                                  agreedAmount: event.target.value,
                                })
                              }
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="contract-reference">
                              Riferimento del contratto
                            </Label>
                            <Input
                              id="contract-reference"
                              value={contractDraft.documentReference}
                              onChange={(event) =>
                                setContractDraft({
                                  ...contractDraft,
                                  documentReference: event.target.value,
                                })
                              }
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="contract-start">Dal</Label>
                            <Input
                              id="contract-start"
                              type="date"
                              value={contractDraft.startDate}
                              onChange={(event) =>
                                setContractDraft({
                                  ...contractDraft,
                                  startDate: event.target.value,
                                })
                              }
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="contract-end">Al</Label>
                            <Input
                              id="contract-end"
                              type="date"
                              value={contractDraft.endDate}
                              onChange={(event) =>
                                setContractDraft({
                                  ...contractDraft,
                                  endDate: event.target.value,
                                })
                              }
                            />
                          </div>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="contract-notes">Note</Label>
                          <Textarea
                            id="contract-notes"
                            value={contractDraft.notes}
                            onChange={(event) =>
                              setContractDraft({
                                ...contractDraft,
                                notes: event.target.value,
                              })
                            }
                          />
                        </div>
                        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                          <Button
                            variant="outline"
                            onClick={() => setIsEditingContract(false)}
                          >
                            Annulla
                          </Button>
                          <Button
                            className="bg-blue-600 hover:bg-blue-700"
                            onClick={handleSaveContract}
                          >
                            Salva contratto
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                        <div>
                          <h3 className="text-sm font-medium text-muted-foreground">
                            Periodo
                          </h3>
                          <p className="mt-1">
                            {contract.startDate || contract.endDate
                              ? `${formatDate(contract.startDate || "") || "—"} → ${formatDate(contract.endDate || "") || "—"}`
                              : "-"}
                          </p>
                        </div>
                        <div>
                          <h3 className="text-sm font-medium text-muted-foreground">
                            Riferimento del contratto
                          </h3>
                          <p className="mt-1">
                            {contract.documentReference || "-"}
                          </p>
                        </div>
                        <div className="sm:col-span-2">
                          <h3 className="text-sm font-medium text-muted-foreground">
                            Note
                          </h3>
                          <p className="mt-1 whitespace-pre-line">
                            {contract.notes || "-"}
                          </p>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>

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
          </DashboardPageContainer>
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
