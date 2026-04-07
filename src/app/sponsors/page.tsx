"use client";

import React, { useState, useEffect } from "react";
import { MobileTopBar } from "@/components/layout/MobileTopBar";
import Sidebar from "@/components/dashboard/Sidebar";
import Header from "@/components/dashboard/Header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toast-notification";
import { LogoUpload } from "@/components/ui/avatar-upload";
import Image from "next/image";
import companyDefaultImage from "@/../public/images/company.png";
import {
  Building,
  CreditCard,
  Mail,
  MapPin,
  Phone,
  Plus,
  Search,
  Trash2,
  Edit,
  FileText,
  Euro,
  Eye,
} from "lucide-react";
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
import {
  addClubData,
  getClubData,
  updateClubData,
  deleteClubDataItem,
} from "@/lib/simplified-db";
import { useRouter } from "next/navigation";

const SPONSOR_TYPE_OPTIONS = [
  { value: "sponsor", label: "Sponsor" },
  { value: "fornitore", label: "Fornitore" },
];

const getSponsorTypeLabel = (type?: string) =>
  type === "fornitore" ? "Fornitore" : "Sponsor";

export default function SponsorsPage() {
  const { showToast } = useToast();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState("sponsors");
  const [searchQuery, setSearchQuery] = useState("");
  const [showAddSponsorDialog, setShowAddSponsorDialog] = useState(false);
  const [showAddPaymentDialog, setShowAddPaymentDialog] = useState(false);
  const [selectedSponsor, setSelectedSponsor] = useState<any>(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [loading, setLoading] = useState(true);

  // Sponsors and payments from database
  const [sponsors, setSponsors] = useState([]);
  const [payments, setPayments] = useState([]);

  // Get club ID from localStorage or URL
  const [clubId, setClubId] = useState<string | null>(null);
  const [clubNotFound, setClubNotFound] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      // First check URL params
      const urlParams = new URLSearchParams(window.location.search);
      const urlClubId = urlParams.get("clubId");

      if (urlClubId) {
        setClubId(urlClubId);
        setClubNotFound(false);
        return;
      }

      // Then check localStorage
      const activeClub = localStorage.getItem("activeClub");
      if (activeClub) {
        try {
          const parsedClub = JSON.parse(activeClub);
          if (parsedClub.id) {
            setClubId(parsedClub.id);
            setClubNotFound(false);
          } else {
            setClubNotFound(true);
          }
        } catch (e) {
          console.error("Error parsing active club:", e);
          setClubNotFound(true);
        }
      } else {
        setClubNotFound(true);
      }
    }
  }, []);

  // New sponsor form state
  const [newSponsor, setNewSponsor] = useState({
    name: "",
    type: "sponsor",
    phone: "",
    email: "",
    vatNumber: "",
    pec: "",
    sdi: "",
    iban: "",
    address: "",
    city: "",
    postalCode: "",
    country: "Italia",
    region: "",
    province: "",
    logo: "",
  });

  // New payment form state
  const [newPayment, setNewPayment] = useState({
    sponsorId: "",
    date: new Date().toISOString().split("T")[0],
    amount: 0,
    description: "",
    type: "entrata",
    status: "completato",
  });

  // Reset new sponsor form
  const resetNewSponsor = React.useCallback(() => {
    setNewSponsor({
      name: "",
      type: "sponsor",
      phone: "",
      email: "",
      vatNumber: "",
      pec: "",
      sdi: "",
      iban: "",
      address: "",
      city: "",
      postalCode: "",
      country: "Italia",
      region: "",
      province: "",
      logo: "",
    });
    setIsEditMode(false);
    setSelectedSponsor(null);
  }, []);

  // Reset new payment form
  const resetNewPayment = React.useCallback(() => {
    setNewPayment({
      sponsorId: selectedSponsor ? selectedSponsor.id : "",
      date: new Date().toISOString().split("T")[0],
      amount: 0,
      description: "",
      type: "entrata",
      status: "completato",
    });
  }, [selectedSponsor]);

  // Load data from database function
  const loadSponsorsAndPayments = React.useCallback(async () => {
    if (!clubId) return;

    try {
      setLoading(true);
      const [sponsorsData, paymentsData] = await Promise.all([
        getClubData(clubId, "sponsors"),
        getClubData(clubId, "sponsor_payments"),
      ]);

      setSponsors(Array.isArray(sponsorsData) ? sponsorsData : []);
      setPayments(Array.isArray(paymentsData) ? paymentsData : []);
    } catch (error) {
      console.error("Error loading sponsors and payments:", error);
      showToast("error", "Errore nel caricamento dei dati");
      setSponsors([]);
      setPayments([]);
    } finally {
      setLoading(false);
    }
  }, [clubId, showToast]);

  // Load data from database
  React.useEffect(() => {
    if (clubId) {
      loadSponsorsAndPayments();
    }
  }, [clubId, loadSponsorsAndPayments]);

  // Filter sponsors based on search query and type
  const filteredSponsors = React.useMemo(() => {
    if (!Array.isArray(sponsors) || sponsors.length === 0) return [];
    return sponsors.filter((sponsor) => {
      if (!sponsor || typeof sponsor !== "object") return false;
      const name = sponsor.name || "";
      const email = sponsor.email || "";
      const vatNumber = sponsor.vatNumber || "";
      const query = (searchQuery || "").toLowerCase();
      return (
        name.toLowerCase().includes(query) ||
        email.toLowerCase().includes(query) ||
        vatNumber.toLowerCase().includes(query)
      );
    });
  }, [sponsors, searchQuery]);

  // Separate sponsors and suppliers
  const sponsorsList = React.useMemo(() => {
    return filteredSponsors.filter((s) => s.type === "sponsor");
  }, [filteredSponsors]);

  const suppliersList = React.useMemo(() => {
    return filteredSponsors.filter((s) => s.type === "fornitore");
  }, [filteredSponsors]);

  // Get payments for a specific sponsor
  const getSponsorPayments = React.useCallback(
    (sponsorId) => {
      if (!Array.isArray(payments) || payments.length === 0) return [];
      return payments.filter(
        (payment) => payment && payment.sponsorId === sponsorId,
      );
    },
    [payments],
  );

  // Handle sponsor form change
  const handleSponsorChange = React.useCallback((e) => {
    const { name, value } = e.target;
    setNewSponsor((prev) => ({ ...prev, [name]: value }));
  }, []);

  // Handle payment form change
  const handlePaymentChange = React.useCallback((e) => {
    const { name, value } = e.target;
    setNewPayment((prev) => ({ ...prev, [name]: value }));
  }, []);

  // Add or update sponsor
  const handleAddSponsor = React.useCallback(async () => {
    if (
      !newSponsor?.name?.trim() ||
      !newSponsor?.email?.trim() ||
      !newSponsor?.vatNumber?.trim()
    ) {
      showToast("error", "Compila tutti i campi obbligatori");
      return;
    }

    // Get the current clubId from state or URL
    let currentClubId = clubId;
    if (!currentClubId && typeof window !== "undefined") {
      // Check URL params first
      const urlParams = new URLSearchParams(window.location.search);
      const urlClubId = urlParams.get("clubId");
      if (urlClubId) {
        currentClubId = urlClubId;
        setClubId(urlClubId);
      } else {
        // Then check localStorage as fallback
        const activeClub = localStorage.getItem("activeClub");
        if (activeClub) {
          try {
            const parsedClub = JSON.parse(activeClub);
            currentClubId = parsedClub.id;
          } catch (e) {
            console.error("Error parsing active club:", e);
          }
        }
      }
    }

    if (!currentClubId) {
      console.error(
        "Club ID not found. URL clubId:",
        new URLSearchParams(window.location.search).get("clubId"),
        "localStorage activeClub:",
        localStorage.getItem("activeClub"),
      );
      showToast(
        "error",
        "Nessun club selezionato. Vai alla dashboard per selezionare un club.",
      );
      return;
    }

    try {
      if (isEditMode && newSponsor.id) {
        // Update existing sponsor
        const currentSponsors = Array.isArray(sponsors) ? sponsors : [];
        const updatedSponsors = currentSponsors.map((sponsor) =>
          sponsor && sponsor.id === newSponsor.id
            ? { ...newSponsor, updated_at: new Date().toISOString() }
            : sponsor,
        );

        await updateClubData(currentClubId, "sponsors", updatedSponsors);
        setSponsors(updatedSponsors);
        showToast("success", "Sponsor aggiornato con successo");
      } else {
        // Add new sponsor
        const newSponsorData = {
          ...newSponsor,
          id: `sponsor-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };

        const addedSponsor = await addClubData(
          currentClubId,
          "sponsors",
          newSponsorData,
        );
        const currentSponsors = Array.isArray(sponsors) ? sponsors : [];
        setSponsors([...currentSponsors, addedSponsor]);
        showToast("success", "Sponsor aggiunto con successo");
      }

      setShowAddSponsorDialog(false);
      resetNewSponsor();
      setIsEditMode(false);
    } catch (error) {
      console.error("Error saving sponsor:", error);
      showToast("error", "Errore nel salvare lo sponsor");
    }
  }, [newSponsor, isEditMode, clubId, sponsors, showToast, resetNewSponsor]);

  // Add new payment
  const handleAddPayment = React.useCallback(async () => {
    if (
      !newPayment?.sponsorId?.trim() ||
      !newPayment?.description?.trim() ||
      !newPayment?.amount ||
      parseFloat(newPayment.amount) <= 0
    ) {
      showToast("error", "Compila tutti i campi obbligatori");
      return;
    }

    // Get the current clubId from state or URL
    let currentClubId = clubId;
    if (!currentClubId && typeof window !== "undefined") {
      // Check URL params first
      const urlParams = new URLSearchParams(window.location.search);
      const urlClubId = urlParams.get("clubId");
      if (urlClubId) {
        currentClubId = urlClubId;
        setClubId(urlClubId);
      } else {
        // Then check localStorage as fallback
        const activeClub = localStorage.getItem("activeClub");
        if (activeClub) {
          try {
            const parsedClub = JSON.parse(activeClub);
            currentClubId = parsedClub.id;
          } catch (e) {
            console.error("Error parsing active club:", e);
          }
        }
      }
    }

    if (!currentClubId) {
      console.error(
        "Club ID not found. URL clubId:",
        new URLSearchParams(window.location.search).get("clubId"),
        "localStorage activeClub:",
        localStorage.getItem("activeClub"),
      );
      showToast(
        "error",
        "Nessun club selezionato. Vai alla dashboard per selezionare un club.",
      );
      return;
    }

    try {
      const newPaymentData = {
        ...newPayment,
        id: `payment-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        amount: parseFloat(newPayment.amount),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const addedPayment = await addClubData(
        currentClubId,
        "sponsor_payments",
        newPaymentData,
      );
      const currentPayments = Array.isArray(payments) ? payments : [];
      setPayments([...currentPayments, addedPayment]);
      setShowAddPaymentDialog(false);
      resetNewPayment();
      showToast("success", "Pagamento registrato con successo");
    } catch (error) {
      console.error("Error saving payment:", error);
      showToast("error", "Errore nel salvare il pagamento");
    }
  }, [newPayment, clubId, payments, showToast, resetNewPayment]);

  // Delete sponsor
  const handleDeleteSponsor = React.useCallback(
    async (sponsorId) => {
      if (
        !sponsorId ||
        !confirm("Sei sicuro di voler eliminare questo sponsor?")
      ) {
        return;
      }

      // Get the current clubId from state or URL
      let currentClubId = clubId;
      if (!currentClubId && typeof window !== "undefined") {
        // Check URL params first
        const urlParams = new URLSearchParams(window.location.search);
        const urlClubId = urlParams.get("clubId");
        if (urlClubId) {
          currentClubId = urlClubId;
          setClubId(urlClubId);
        } else {
          // Then check localStorage as fallback
          const activeClub = localStorage.getItem("activeClub");
          if (activeClub) {
            try {
              const parsedClub = JSON.parse(activeClub);
              currentClubId = parsedClub.id;
            } catch (e) {
              console.error("Error parsing active club:", e);
            }
          }
        }
      }

      if (!currentClubId) {
        console.error(
          "Club ID not found. URL clubId:",
          new URLSearchParams(window.location.search).get("clubId"),
          "localStorage activeClub:",
          localStorage.getItem("activeClub"),
        );
        showToast(
          "error",
          "Nessun club selezionato. Vai alla dashboard per selezionare un club.",
        );
        return;
      }

      try {
        // Delete sponsor from database
        await deleteClubDataItem(currentClubId, "sponsors", sponsorId);
        const currentSponsors = Array.isArray(sponsors) ? sponsors : [];
        setSponsors(
          currentSponsors.filter(
            (sponsor) => sponsor && sponsor.id !== sponsorId,
          ),
        );

        // Also delete all payments associated with this sponsor
        const currentPayments = Array.isArray(payments) ? payments : [];
        const remainingPayments = currentPayments.filter(
          (payment) => payment && payment.sponsorId !== sponsorId,
        );
        if (remainingPayments.length !== currentPayments.length) {
          await updateClubData(
            currentClubId,
            "sponsor_payments",
            remainingPayments,
          );
          setPayments(remainingPayments);
        }

        showToast("success", "Sponsor eliminato con successo");
      } catch (error) {
        console.error("Error deleting sponsor:", error);
        showToast("error", "Errore nell'eliminare lo sponsor");
      }
    },
    [clubId, sponsors, payments, showToast],
  );

  // Delete payment
  const handleDeletePayment = React.useCallback(
    async (paymentId) => {
      if (
        !paymentId ||
        !confirm("Sei sicuro di voler eliminare questo pagamento?")
      ) {
        return;
      }

      // Get the current clubId from state or URL
      let currentClubId = clubId;
      if (!currentClubId && typeof window !== "undefined") {
        // Check URL params first
        const urlParams = new URLSearchParams(window.location.search);
        const urlClubId = urlParams.get("clubId");
        if (urlClubId) {
          currentClubId = urlClubId;
          setClubId(urlClubId);
        } else {
          // Then check localStorage as fallback
          const activeClub = localStorage.getItem("activeClub");
          if (activeClub) {
            try {
              const parsedClub = JSON.parse(activeClub);
              currentClubId = parsedClub.id;
            } catch (e) {
              console.error("Error parsing active club:", e);
            }
          }
        }
      }

      if (!currentClubId) {
        console.error(
          "Club ID not found. URL clubId:",
          new URLSearchParams(window.location.search).get("clubId"),
          "localStorage activeClub:",
          localStorage.getItem("activeClub"),
        );
        showToast(
          "error",
          "Nessun club selezionato. Vai alla dashboard per selezionare un club.",
        );
        return;
      }

      try {
        await deleteClubDataItem(currentClubId, "sponsor_payments", paymentId);
        const currentPayments = Array.isArray(payments) ? payments : [];
        setPayments(
          currentPayments.filter(
            (payment) => payment && payment.id !== paymentId,
          ),
        );
        showToast("success", "Pagamento eliminato con successo");
      } catch (error) {
        console.error("Error deleting payment:", error);
        showToast("error", "Errore nell'eliminare il pagamento");
      }
    },
    [clubId, payments, showToast],
  );

  // Format date
  const formatDate = React.useCallback((dateString) => {
    if (!dateString) return "N/A";
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString("it-IT", {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    } catch (error) {
      return "N/A";
    }
  }, []);

  // Show message if no club is found
  if (clubNotFound) {
    return (
      <div className="flex h-screen bg-gray-50 dark:bg-gray-900">
        <Sidebar />
        <div className="flex flex-1 flex-col overflow-hidden">
          <Header title="Gestione Sponsor" />
          <main className="flex-1 overflow-y-auto p-4 md:p-6">
            <div className="mx-auto max-w-9xl">
              <Card>
                <CardContent className="p-8 text-center">
                  <Building className="h-16 w-16 mx-auto text-gray-400 mb-4" />
                  <h2 className="text-xl font-semibold mb-2">
                    Nessun Club Selezionato
                  </h2>
                  <p className="text-gray-600 mb-4">
                    Per gestire sponsor e fornitori, devi prima selezionare un
                    club.
                  </p>
                  <Button
                    onClick={() => (window.location.href = "/dashboard")}
                    className="bg-blue-600 hover:bg-blue-700"
                  >
                    Vai alla Dashboard
                  </Button>
                </CardContent>
              </Card>
            </div>
          </main>
        </div>
      </div>
    );
  }

  const renderSponsorsMainContent = () => (
    <main className="flex-1 overflow-y-auto p-4 md:p-6">
      <div className="mx-auto max-w-9xl space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
              Gestione Sponsor e Fornitori
            </h1>
            <p className="text-gray-600 mt-2">
              Gestisci sponsor, partner e fornitori della società.
            </p>
          </div>
          <Button
            className="bg-blue-600 hover:bg-blue-700"
            onClick={() => {
              resetNewSponsor();
              setNewSponsor((prev) => ({
                ...prev,
                type: activeTab === "suppliers" ? "fornitore" : "sponsor",
              }));
              setShowAddSponsorDialog(true);
            }}
          >
            <Plus className="h-4 w-4 mr-2" />
            Nuovo Sponsor/Fornitore
          </Button>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="w-full flex overflow-x-auto rounded-xl bg-muted p-1">
            <TabsTrigger
              value="sponsors"
              className="flex items-center gap-2 whitespace-nowrap text-xs sm:text-sm px-3 py-1.5"
            >
              <Building className="h-4 w-4" />
              Sponsor
            </TabsTrigger>
            <TabsTrigger
              value="suppliers"
              className="flex items-center gap-2 whitespace-nowrap text-xs sm:text-sm px-3 py-1.5"
            >
              <Building className="h-4 w-4" />
              Fornitori
            </TabsTrigger>
            <TabsTrigger
              value="payments"
              className="flex items-center gap-2 whitespace-nowrap text-xs sm:text-sm px-3 py-1.5"
            >
              <Euro className="h-4 w-4" />
              Pagamenti
            </TabsTrigger>
          </TabsList>

          <TabsContent value="sponsors" className="space-y-4 mt-4">
            <Card>
              <CardHeader>
                <div className="flex justify-between items-center">
                  <CardTitle>Elenco Sponsor</CardTitle>
                  <div className="relative w-64">
                    <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      placeholder="Cerca..."
                      className="pl-8"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Nome</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Telefono</TableHead>
                        <TableHead>P.IVA</TableHead>
                        <TableHead className="text-right">Azioni</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {loading ? (
                        <TableRow>
                          <TableCell colSpan={5} className="h-24 text-center">
                            Caricamento...
                          </TableCell>
                        </TableRow>
                      ) : Array.isArray(sponsorsList) &&
                        sponsorsList.length > 0 ? (
                        sponsorsList
                          .map((sponsor) => {
                            if (!sponsor || !sponsor.id) return null;
                            return (
                              <TableRow key={sponsor.id}>
                                <TableCell className="font-medium">
                                  <div className="flex items-center gap-3">
                                    {sponsor.logo ? (
                                      <div className="h-10 w-10 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700 flex-shrink-0">
                                        <img
                                          src={sponsor.logo}
                                          alt={sponsor.name}
                                          className="w-full h-full object-contain"
                                        />
                                      </div>
                                    ) : (
                                      <div className="h-10 w-10 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700 flex-shrink-0 bg-white dark:bg-gray-800 p-1">
                                        <Image
                                          src={companyDefaultImage}
                                          alt={sponsor.name}
                                          className="w-full h-full object-contain"
                                          width={40}
                                          height={40}
                                        />
                                      </div>
                                    )}
                                    <span>{sponsor.name || "N/A"}</span>
                                  </div>
                                </TableCell>
                                <TableCell>{sponsor.email || "N/A"}</TableCell>
                                <TableCell>{sponsor.phone || "N/A"}</TableCell>
                                <TableCell>
                                  {sponsor.vatNumber || "N/A"}
                                </TableCell>
                                <TableCell className="text-right">
                                  <div className="flex justify-end gap-2">
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      className="h-8 w-8 p-0"
                                      onClick={() =>
                                        router.push(
                                          `/sponsors/${sponsor.id}?clubId=${clubId}`,
                                        )
                                      }
                                      title="Visualizza Profilo"
                                    >
                                      <Eye className="h-4 w-4" />
                                    </Button>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      className="h-8 w-8 p-0 text-red-600"
                                      onClick={() =>
                                        handleDeleteSponsor(sponsor.id)
                                      }
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  </div>
                                </TableCell>
                              </TableRow>
                            );
                          })
                          .filter(Boolean)
                      ) : (
                        <TableRow>
                          <TableCell colSpan={5} className="h-24 text-center">
                            Nessuno sponsor trovato.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="suppliers" className="space-y-4 mt-4">
            <Card>
              <CardHeader>
                <div className="flex justify-between items-center">
                  <CardTitle>Elenco Fornitori</CardTitle>
                  <div className="relative w-64">
                    <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      placeholder="Cerca..."
                      className="pl-8"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Nome</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Telefono</TableHead>
                        <TableHead>P.IVA</TableHead>
                        <TableHead className="text-right">Azioni</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {loading ? (
                        <TableRow>
                          <TableCell colSpan={5} className="h-24 text-center">
                            Caricamento...
                          </TableCell>
                        </TableRow>
                      ) : Array.isArray(suppliersList) &&
                        suppliersList.length > 0 ? (
                        suppliersList
                          .map((supplier) => {
                            if (!supplier || !supplier.id) return null;
                            return (
                              <TableRow key={supplier.id}>
                                <TableCell className="font-medium">
                                  {supplier.name || "N/A"}
                                </TableCell>
                                <TableCell>{supplier.email || "N/A"}</TableCell>
                                <TableCell>{supplier.phone || "N/A"}</TableCell>
                                <TableCell>
                                  {supplier.vatNumber || "N/A"}
                                </TableCell>
                                <TableCell className="text-right">
                                  <div className="flex justify-end gap-2">
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      className="h-8 w-8 p-0"
                                      onClick={() =>
                                        router.push(
                                          `/sponsors/${supplier.id}?clubId=${clubId}`,
                                        )
                                      }
                                      title="Visualizza Profilo"
                                    >
                                      <Eye className="h-4 w-4" />
                                    </Button>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      className="h-8 w-8 p-0 text-red-600"
                                      onClick={() =>
                                        handleDeleteSponsor(supplier.id)
                                      }
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  </div>
                                </TableCell>
                              </TableRow>
                            );
                          })
                          .filter(Boolean)
                      ) : (
                        <TableRow>
                          <TableCell colSpan={5} className="h-24 text-center">
                            Nessun fornitore trovato.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="payments" className="space-y-4 mt-4">
            <Card>
              <CardHeader>
                <div className="flex justify-between items-center">
                  <CardTitle>Registro Pagamenti</CardTitle>
                  <Button
                    className="bg-blue-600 hover:bg-blue-700"
                    onClick={() => {
                      resetNewPayment();
                      setNewPayment((prev) => ({
                        ...prev,
                        sponsorId: selectedSponsor?.id || "",
                      }));
                      setShowAddPaymentDialog(true);
                    }}
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Nuovo Pagamento
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Data</TableHead>
                        <TableHead>Sponsor/Fornitore</TableHead>
                        <TableHead>Descrizione</TableHead>
                        <TableHead>Tipo</TableHead>
                        <TableHead>Importo</TableHead>
                        <TableHead>Stato</TableHead>
                        <TableHead className="text-right">Azioni</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {loading ? (
                        <TableRow>
                          <TableCell colSpan={7} className="h-24 text-center">
                            Caricamento...
                          </TableCell>
                        </TableRow>
                      ) : Array.isArray(payments) && payments.length > 0 ? (
                        payments
                          .map((payment) => {
                            if (!payment || !payment.id) return null;
                            const currentSponsors = Array.isArray(sponsors)
                              ? sponsors
                              : [];
                            const sponsor = currentSponsors.find(
                              (s) => s && s.id === payment.sponsorId,
                            );
                            return (
                              <TableRow key={payment.id}>
                                <TableCell>
                                  {formatDate(payment.date)}
                                </TableCell>
                                <TableCell className="font-medium">
                                  {sponsor?.name || "N/A"}
                                </TableCell>
                                <TableCell>
                                  {payment.description || "N/A"}
                                </TableCell>
                                <TableCell>
                                  <span
                                    className={`px-2 py-1 rounded-full text-xs font-medium ${payment.type === "entrata" ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}`}
                                  >
                                    {payment.type === "entrata"
                                      ? "Entrata"
                                      : "Uscita"}
                                  </span>
                                </TableCell>
                                <TableCell
                                  className={`font-medium ${payment.type === "entrata" ? "text-green-600" : "text-red-600"}`}
                                >
                                  {payment.type === "entrata" ? "+" : "-"} €
                                  {(payment.amount || 0).toFixed(2)}
                                </TableCell>
                                <TableCell>
                                  <span
                                    className={`px-2 py-1 rounded-full text-xs font-medium ${payment.status === "completato" ? "bg-blue-100 text-blue-800" : "bg-amber-100 text-amber-800"}`}
                                  >
                                    {payment.status === "completato"
                                      ? "Completato"
                                      : "In attesa"}
                                  </span>
                                </TableCell>
                                <TableCell className="text-right">
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-8 w-8 p-0 text-red-600"
                                    onClick={() =>
                                      handleDeletePayment(payment.id)
                                    }
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </TableCell>
                              </TableRow>
                            );
                          })
                          .filter(Boolean)
                      ) : (
                        <TableRow>
                          <TableCell colSpan={7} className="h-24 text-center">
                            Nessun pagamento registrato.
                          </TableCell>
                        </TableRow>
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
  );

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-gray-900">
      {/* Desktop layout */}
      <div className="hidden lg:flex w-full">
        <Sidebar />
        <div className="flex flex-1 flex-col overflow-hidden">
          <Header title="Gestione Sponsor" />
          {renderSponsorsMainContent()}
        </div>
      </div>

      {/* Mobile layout */}
      <div className="flex flex-1 flex-col lg:hidden">
        <MobileTopBar />
        {renderSponsorsMainContent()}
      </div>

      <Dialog
        open={showAddSponsorDialog}
        onOpenChange={(open) => {
          setShowAddSponsorDialog(open);
          if (!open) {
            resetNewSponsor();
          }
        }}
      >
        <DialogContent className="w-[calc(100vw-2rem)] max-w-4xl rounded-[28px] border-slate-200 bg-white/95 p-0 shadow-[0_30px_90px_-32px_rgba(15,23,42,0.35)]">
          <DialogHeader className="border-b border-slate-100 bg-gradient-to-r from-blue-700 via-blue-600 to-sky-500 px-6 py-5 text-white">
            <DialogTitle className="text-2xl">
              {isEditMode
                ? `Modifica ${getSponsorTypeLabel(newSponsor.type)}`
                : `Nuovo ${getSponsorTypeLabel(newSponsor.type)}`}
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-0 lg:grid-cols-[280px_1fr]">
            <div className="space-y-4 border-b border-slate-100 bg-slate-50/80 px-6 py-6 lg:border-b-0 lg:border-r">
              <div className="rounded-[24px] bg-white p-5 shadow-sm">
                <div className="flex justify-center">
                  <LogoUpload
                    currentLogo={newSponsor.logo || null}
                    onLogoChange={(value) =>
                      setNewSponsor((prev) => ({
                        ...prev,
                        logo: value || "",
                      }))
                    }
                    name={newSponsor.name || "Nuovo partner"}
                    className="mx-auto"
                  />
                </div>
                <div className="mt-4 space-y-1 text-center">
                  <p className="text-lg font-semibold text-slate-900">
                    {newSponsor.name || "Nuovo partner"}
                  </p>
                  <p className="text-sm text-slate-500">
                    {getSponsorTypeLabel(newSponsor.type)}
                  </p>
                </div>
              </div>

              <div className="rounded-[24px] bg-white p-5 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Campi obbligatori
                </p>
                <div className="mt-4 space-y-3 text-sm text-slate-600">
                  <p>Nome o ragione sociale</p>
                  <p>Email di riferimento</p>
                  <p>Partita IVA o identificativo fiscale</p>
                </div>
              </div>
            </div>

            <div className="max-h-[78vh] space-y-6 overflow-y-auto px-6 py-6">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="sponsor-name">Nome / Ragione sociale *</Label>
                  <Input
                    id="sponsor-name"
                    name="name"
                    value={newSponsor.name}
                    onChange={handleSponsorChange}
                    placeholder="Es. Partner Italia SRL"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="sponsor-type">Tipologia *</Label>
                  <select
                    id="sponsor-type"
                    name="type"
                    value={newSponsor.type}
                    onChange={handleSponsorChange}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
                  >
                    {SPONSOR_TYPE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="sponsor-email">Email *</Label>
                  <Input
                    id="sponsor-email"
                    name="email"
                    type="email"
                    value={newSponsor.email}
                    onChange={handleSponsorChange}
                    placeholder="amministrazione@azienda.it"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="sponsor-phone">Telefono</Label>
                  <Input
                    id="sponsor-phone"
                    name="phone"
                    value={newSponsor.phone}
                    onChange={handleSponsorChange}
                    placeholder="+39 333 1234567"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="sponsor-vat">Partita IVA *</Label>
                  <Input
                    id="sponsor-vat"
                    name="vatNumber"
                    value={newSponsor.vatNumber}
                    onChange={handleSponsorChange}
                    placeholder="IT01234567890"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="sponsor-pec">PEC</Label>
                  <Input
                    id="sponsor-pec"
                    name="pec"
                    value={newSponsor.pec}
                    onChange={handleSponsorChange}
                    placeholder="partner@pec.it"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="sponsor-sdi">Codice SDI</Label>
                  <Input
                    id="sponsor-sdi"
                    name="sdi"
                    value={newSponsor.sdi}
                    onChange={handleSponsorChange}
                    placeholder="ABC1234"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="sponsor-iban">IBAN</Label>
                  <Input
                    id="sponsor-iban"
                    name="iban"
                    value={newSponsor.iban}
                    onChange={handleSponsorChange}
                    placeholder="IT60X0542811101000000123456"
                  />
                </div>
              </div>

              <div className="rounded-[24px] border border-slate-100 bg-slate-50/70 p-5">
                <p className="text-base font-semibold text-slate-900">
                  Sede e localizzazione
                </p>
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="sponsor-address">Indirizzo</Label>
                    <Input
                      id="sponsor-address"
                      name="address"
                      value={newSponsor.address}
                      onChange={handleSponsorChange}
                      placeholder="Via Roma 10"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="sponsor-city">Città</Label>
                    <Input
                      id="sponsor-city"
                      name="city"
                      value={newSponsor.city}
                      onChange={handleSponsorChange}
                      placeholder="Milano"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="sponsor-province">Provincia</Label>
                    <Input
                      id="sponsor-province"
                      name="province"
                      value={newSponsor.province}
                      onChange={handleSponsorChange}
                      placeholder="MI"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="sponsor-postal">CAP</Label>
                    <Input
                      id="sponsor-postal"
                      name="postalCode"
                      value={newSponsor.postalCode}
                      onChange={handleSponsorChange}
                      placeholder="20100"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="sponsor-region">Regione</Label>
                    <Input
                      id="sponsor-region"
                      name="region"
                      value={newSponsor.region}
                      onChange={handleSponsorChange}
                      placeholder="Lombardia"
                    />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="sponsor-country">Nazione</Label>
                    <Input
                      id="sponsor-country"
                      name="country"
                      value={newSponsor.country}
                      onChange={handleSponsorChange}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
          <DialogFooter className="border-t border-slate-100 px-6 py-4">
            <Button variant="outline" onClick={() => setShowAddSponsorDialog(false)}>
              Annulla
            </Button>
            <Button className="bg-blue-600 hover:bg-blue-700" onClick={handleAddSponsor}>
              {isEditMode ? "Salva modifiche" : "Crea partner"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={showAddPaymentDialog}
        onOpenChange={(open) => {
          setShowAddPaymentDialog(open);
          if (!open) {
            resetNewPayment();
          }
        }}
      >
        <DialogContent className="w-[calc(100vw-2rem)] max-w-2xl rounded-[28px] border-slate-200 bg-white/95 p-0 shadow-[0_30px_90px_-32px_rgba(15,23,42,0.35)]">
          <DialogHeader className="border-b border-slate-100 bg-gradient-to-r from-slate-900 via-slate-800 to-slate-700 px-6 py-5 text-white">
            <DialogTitle className="text-2xl">Nuovo pagamento sponsor</DialogTitle>
          </DialogHeader>
          <div className="space-y-5 px-6 py-6">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="payment-sponsor">Sponsor / Fornitore *</Label>
                <select
                  id="payment-sponsor"
                  name="sponsorId"
                  value={newPayment.sponsorId}
                  onChange={handlePaymentChange}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
                >
                  <option value="">Seleziona un partner</option>
                  {sponsors.map((sponsor: any) => (
                    <option key={sponsor.id} value={sponsor.id}>
                      {sponsor.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="payment-date">Data *</Label>
                <Input
                  id="payment-date"
                  name="date"
                  type="date"
                  value={newPayment.date}
                  onChange={handlePaymentChange}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="payment-amount">Importo *</Label>
                <Input
                  id="payment-amount"
                  name="amount"
                  type="number"
                  min="0"
                  step="0.01"
                  value={newPayment.amount}
                  onChange={handlePaymentChange}
                  placeholder="0.00"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="payment-type">Tipo movimento</Label>
                <select
                  id="payment-type"
                  name="type"
                  value={newPayment.type}
                  onChange={handlePaymentChange}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
                >
                  <option value="entrata">Entrata</option>
                  <option value="uscita">Uscita</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="payment-status">Stato</Label>
                <select
                  id="payment-status"
                  name="status"
                  value={newPayment.status}
                  onChange={handlePaymentChange}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
                >
                  <option value="completato">Completato</option>
                  <option value="in_attesa">In attesa</option>
                </select>
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="payment-description">Descrizione *</Label>
                <Input
                  id="payment-description"
                  name="description"
                  value={newPayment.description}
                  onChange={handlePaymentChange}
                  placeholder="Es. Saldo sponsorizzazione stagione 2026"
                />
              </div>
            </div>
          </div>
          <DialogFooter className="border-t border-slate-100 px-6 py-4">
            <Button variant="outline" onClick={() => setShowAddPaymentDialog(false)}>
              Annulla
            </Button>
            <Button className="bg-blue-600 hover:bg-blue-700" onClick={handleAddPayment}>
              Registra pagamento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
