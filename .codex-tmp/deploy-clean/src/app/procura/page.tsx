"use client";

import React, { useState, useEffect } from "react";
import Sidebar from "@/components/dashboard/Sidebar";
import Header from "@/components/dashboard/Header";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast-notification";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Plus,
  Trash2,
  Edit,
  Euro,
  User,
  Search,
  Scale,
  Phone,
  Mail,
  MapPin,
  FileText,
  TrendingUp,
  TrendingDown,
  UserPlus,
  StickyNote,
  Save,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/components/providers/AuthProvider";
import {
  getClubData,
  addClubData,
  updateClubDataItem,
  deleteClubDataItem,
  getClubAthletes,
} from "@/lib/simplified-db";

export default function ProcuraPage() {
  const { showToast } = useToast();
  const { activeClub, user } = useAuth();
  const [loading, setLoading] = useState(true);

  // State for procure
  const [procure, setProcure] = useState<any[]>([]);
  const [selectedProcura, setSelectedProcura] = useState<any>(null);

  // State for new procura dialog
  const [isNewProcuraDialogOpen, setIsNewProcuraDialogOpen] = useState(false);
  const [editingProcura, setEditingProcura] = useState<any>(null);
  const [newProcura, setNewProcura] = useState({
    name: "",
    address: {
      street: "",
      city: "",
      province: "",
      postalCode: "",
      country: "Italia",
    },
    contacts: [],
    athletes: [],
    trainers: [],
    payments: [],
  });

  // State for contact dialog
  const [isNewContactDialogOpen, setIsNewContactDialogOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<any>(null);
  const [newContact, setNewContact] = useState({
    firstName: "",
    lastName: "",
    phone: "",
    email: "",
  });

  // State for athletes and trainers
  const [athletes, setAthletes] = useState<any[]>([]);
  const [trainers, setTrainers] = useState<any[]>([]);

  // State for payment dialog
  const [isNewPaymentDialogOpen, setIsNewPaymentDialogOpen] = useState(false);
  const [newPayment, setNewPayment] = useState({
    personId: "",
    personType: "athlete",
    date: new Date().toISOString().split("T")[0],
    amount: 0,
    type: "entrata",
    description: "",
  });

  // State for association dialog
  const [isAssociationDialogOpen, setIsAssociationDialogOpen] = useState(false);
  const [newAssociation, setNewAssociation] = useState({
    personId: "",
    personType: "athlete",
    cost: 0,
  });

  // State for editing association
  const [editingAssociation, setEditingAssociation] = useState<any>(null);
  const [editingAssociationType, setEditingAssociationType] =
    useState<string>("");

  // State for association notes dialog
  const [isNotesDialogOpen, setIsNotesDialogOpen] = useState(false);
  const [selectedAssociation, setSelectedAssociation] = useState<any>(null);
  const [associationNotes, setAssociationNotes] = useState("");

  // Search state
  const [searchQuery, setSearchQuery] = useState("");

  // Load data from database
  useEffect(() => {
    const loadData = async () => {
      if (!activeClub?.id || !user) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);

        // Load procure
        try {
          const procureData = await getClubData(activeClub.id, "procure");
          setProcure(Array.isArray(procureData) ? procureData : []);
        } catch (error) {
          console.warn("Procure not found, using empty array");
          setProcure([]);
        }

        // Load athletes
        try {
          const athletesData = await getClubAthletes(activeClub.id);
          const formattedAthletes = athletesData.map((athlete: any) => ({
            id: athlete.id,
            name: `${athlete.first_name} ${athlete.last_name}`,
            firstName: athlete.first_name,
            lastName: athlete.last_name,
            type: "athlete",
          }));
          setAthletes(formattedAthletes);
        } catch (error) {
          console.warn("Athletes not found, using empty array");
          setAthletes([]);
        }

        // Load trainers
        try {
          const trainersData = await getClubData(activeClub.id, "trainers");
          const formattedTrainers = Array.isArray(trainersData)
            ? trainersData.map((trainer: any) => ({
                id: trainer.id,
                name: `${trainer.firstName} ${trainer.lastName}`,
                firstName: trainer.firstName,
                lastName: trainer.lastName,
                type: "trainer",
              }))
            : [];
          setTrainers(formattedTrainers);
        } catch (error) {
          console.warn("Trainers not found, using empty array");
          setTrainers([]);
        }
      } catch (error) {
        console.error("Error loading procura data:", error);
        showToast("error", "Errore nel caricamento dei dati");
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [activeClub, user, showToast]);

  // Handle procura form changes
  const handleProcuraChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    const { name, value } = e.target;
    if (name.startsWith("address.")) {
      const addressField = name.split(".")[1];
      setNewProcura({
        ...newProcura,
        address: { ...newProcura.address, [addressField]: value },
      });
    } else {
      setNewProcura({ ...newProcura, [name]: value });
    }
  };

  // Save procura
  const saveProcura = async () => {
    if (!newProcura.name) {
      showToast("error", "Inserisci il nome della procura");
      return;
    }

    if (!activeClub?.id) {
      showToast("error", "Club non trovato");
      return;
    }

    try {
      const procuraToSave = {
        ...newProcura,
        id: editingProcura?.id || `procura_${Date.now()}`,
        createdAt: editingProcura?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      if (editingProcura) {
        const updatedProcure = await updateClubDataItem(
          activeClub.id,
          "procure",
          editingProcura.id,
          procuraToSave,
        );
        setProcure(Array.isArray(updatedProcure) ? updatedProcure : []);
        setSelectedProcura(
          Array.isArray(updatedProcure)
            ? updatedProcure.find((item: any) => item.id === editingProcura.id) ||
                null
            : null,
        );
        showToast("success", "Procura aggiornata con successo");
      } else {
        const savedProcura = await addClubData(
          activeClub.id,
          "procure",
          procuraToSave,
        );
        setProcure((prev) =>
          Array.isArray(prev) ? [...prev, savedProcura] : [savedProcura],
        );
        setSelectedProcura(savedProcura);
        showToast("success", "Nuova procura aggiunta con successo");
      }

      setIsNewProcuraDialogOpen(false);
      setEditingProcura(null);
      resetNewProcura();
    } catch (error) {
      console.error("Error saving procura:", error);
      showToast(
        "error",
        error instanceof Error
          ? error.message
          : "Errore nel salvataggio della procura",
      );
    }
  };

  // Edit procura
  const editProcura = (procura: any) => {
    setEditingProcura(procura);
    setNewProcura({
      name: procura.name,
      address: procura.address || {
        street: "",
        city: "",
        province: "",
        postalCode: "",
        country: "Italia",
      },
      contacts: procura.contacts || [],
      athletes: procura.athletes || [],
      trainers: procura.trainers || [],
      payments: procura.payments || [],
    });
    setIsNewProcuraDialogOpen(true);
  };

  // Delete procura
  const deleteProcura = async (procuraId: string) => {
    if (!confirm("Sei sicuro di voler eliminare questa procura?")) {
      return;
    }

    if (!activeClub?.id) {
      showToast("error", "Club non trovato");
      return;
    }

    try {
      const updatedProcure = await deleteClubDataItem(
        activeClub.id,
        "procure",
        procuraId,
      );
      setProcure(updatedProcure);
      if (selectedProcura?.id === procuraId) {
        setSelectedProcura(null);
      }
      showToast("success", "Procura eliminata con successo");
    } catch (error) {
      console.error("Error deleting procura:", error);
      showToast("error", "Errore nell'eliminazione della procura");
    }
  };

  // Reset new procura form
  const resetNewProcura = () => {
    setNewProcura({
      name: "",
      address: {
        street: "",
        city: "",
        province: "",
        postalCode: "",
        country: "Italia",
      },
      contacts: [],
      athletes: [],
      trainers: [],
      payments: [],
    });
  };

  // Add contact to procura
  const addContactToProcura = () => {
    if (!newContact.firstName || !newContact.lastName) {
      showToast("error", "Inserisci nome e cognome del contatto");
      return;
    }

    const contact = {
      ...newContact,
      id: editingContact?.id || `contact_${Date.now()}`,
    };

    if (editingContact) {
      setNewProcura({
        ...newProcura,
        contacts: newProcura.contacts.map((c: any) =>
          c.id === editingContact.id ? contact : c,
        ),
      });
    } else {
      setNewProcura({
        ...newProcura,
        contacts: [...newProcura.contacts, contact],
      });
    }

    setIsNewContactDialogOpen(false);
    setEditingContact(null);
    resetNewContact();
  };

  // Delete contact from procura
  const deleteContactFromProcura = (contactId: string) => {
    setNewProcura({
      ...newProcura,
      contacts: newProcura.contacts.filter((c: any) => c.id !== contactId),
    });
  };

  // Reset new contact form
  const resetNewContact = () => {
    setNewContact({
      firstName: "",
      lastName: "",
      phone: "",
      email: "",
    });
  };

  // Add payment
  const addPayment = async () => {
    if (!selectedProcura || !newPayment.personId || !newPayment.amount) {
      showToast("error", "Compila tutti i campi obbligatori");
      return;
    }

    if (!activeClub?.id) {
      showToast("error", "Club non trovato");
      return;
    }

    try {
      const payment = {
        ...newPayment,
        id: `payment_${Date.now()}`,
        createdAt: new Date().toISOString(),
      };

      const updatedProcura = {
        ...selectedProcura,
        payments: [...(selectedProcura.payments || []), payment],
      };

      const updatedProcure = await updateClubDataItem(
        activeClub.id,
        "procure",
        selectedProcura.id,
        updatedProcura,
      );
      setProcure(updatedProcure);
      setSelectedProcura(
        updatedProcure.find((p: any) => p.id === selectedProcura.id),
      );
      setIsNewPaymentDialogOpen(false);
      resetNewPayment();
      showToast("success", "Pagamento aggiunto con successo");
    } catch (error) {
      console.error("Error adding payment:", error);
      showToast("error", "Errore nell'aggiunta del pagamento");
    }
  };

  // Update selected procura in state and database
  const updateSelectedProcura = async (updatedProcura: any) => {
    if (!activeClub?.id) {
      showToast("error", "Club non trovato");
      return;
    }

    try {
      const updatedProcure = await updateClubDataItem(
        activeClub.id,
        "procure",
        updatedProcura.id,
        updatedProcura,
      );
      setProcure(updatedProcure);
      setSelectedProcura(
        updatedProcure.find((p: any) => p.id === updatedProcura.id),
      );
      showToast("success", "Modifiche salvate con successo");
    } catch (error) {
      console.error("Error updating procura:", error);
      showToast("error", "Errore nel salvataggio delle modifiche");
    }
  };

  // Delete association
  const deleteAssociation = async (personId: string, type: string) => {
    if (!confirm("Sei sicuro di voler eliminare questa associazione?")) {
      return;
    }

    const field = type === "athlete" ? "athletes" : "trainers";
    const updatedProcura = {
      ...selectedProcura,
      [field]: selectedProcura[field].filter(
        (a: any) => a.personId !== personId,
      ),
    };

    await updateSelectedProcura(updatedProcura);
  };

  // Edit association
  const editAssociation = (assoc: any, type: string) => {
    setEditingAssociation(assoc);
    setEditingAssociationType(type);
    setNewAssociation({
      personId: assoc.personId,
      personType: type,
      cost: assoc.cost || 0,
    });
    setIsAssociationDialogOpen(true);
  };

  // Update association
  const updateAssociation = async () => {
    if (!selectedProcura || !newAssociation.personId) {
      showToast("error", "Seleziona una persona");
      return;
    }

    const field =
      newAssociation.personType === "athlete" ? "athletes" : "trainers";
    const updatedProcura = {
      ...selectedProcura,
      [field]: selectedProcura[field].map((a: any) =>
        a.personId === editingAssociation.personId
          ? {
              ...a,
              cost: newAssociation.cost,
              personId: newAssociation.personId,
            }
          : a,
      ),
    };

    await updateSelectedProcura(updatedProcura);
    setIsAssociationDialogOpen(false);
    setEditingAssociation(null);
    setEditingAssociationType("");
    resetNewAssociation();
  };

  // Add association
  const addAssociation = async () => {
    if (!selectedProcura || !newAssociation.personId) {
      showToast("error", "Seleziona una persona da associare");
      return;
    }

    // If editing, call updateAssociation instead
    if (editingAssociation) {
      await updateAssociation();
      return;
    }

    if (!activeClub?.id) {
      showToast("error", "Club non trovato");
      return;
    }

    try {
      const association = {
        personId: newAssociation.personId,
        personType: newAssociation.personType,
        cost: newAssociation.cost,
        notes: "",
        addedAt: new Date().toISOString(),
      };

      const field =
        newAssociation.personType === "athlete" ? "athletes" : "trainers";
      const updatedProcura = {
        ...selectedProcura,
        [field]: [...(selectedProcura[field] || []), association],
      };

      const updatedProcure = await updateClubDataItem(
        activeClub.id,
        "procure",
        selectedProcura.id,
        updatedProcura,
      );
      setProcure(updatedProcure);
      setSelectedProcura(
        updatedProcure.find((p: any) => p.id === selectedProcura.id),
      );
      setIsAssociationDialogOpen(false);
      setEditingAssociation(null);
      setEditingAssociationType("");
      resetNewAssociation();
      showToast("success", "Associazione aggiunta con successo");
    } catch (error) {
      console.error("Error adding association:", error);
      showToast("error", "Errore nell'aggiunta dell'associazione");
    }
  };

  // Save association notes
  const saveAssociationNotes = async () => {
    if (!selectedProcura || !selectedAssociation) {
      return;
    }

    const field =
      selectedAssociation.type === "athlete" ? "athletes" : "trainers";
    const updatedProcura = {
      ...selectedProcura,
      [field]: selectedProcura[field].map((a: any) =>
        a.personId === selectedAssociation.personId
          ? { ...a, notes: associationNotes }
          : a,
      ),
    };

    await updateSelectedProcura(updatedProcura);
    setIsNotesDialogOpen(false);
    setSelectedAssociation(null);
    setAssociationNotes("");
  };

  // Reset forms
  const resetNewPayment = () => {
    setNewPayment({
      personId: "",
      personType: "athlete",
      date: new Date().toISOString().split("T")[0],
      amount: 0,
      type: "entrata",
      description: "",
    });
  };

  const resetNewAssociation = () => {
    setNewAssociation({
      personId: "",
      personType: "athlete",
      cost: 0,
    });
  };

  // Filter procure based on search
  const filteredProcure = procure.filter((p) =>
    p.name.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-gray-900">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header title="Gestione Procure" />
        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          <div className="mx-auto max-w-9xl space-y-6">
            <div>
              <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                Procura
              </h1>
              <p className="text-gray-600 mt-2">
                Gestisci le procure e i relativi documenti associati ai
                tesserati.
              </p>
            </div>
            <div className="space-y-6">
              {/* Data Grid for Procure */}
              <Card>
                <CardHeader>
                  <div className="flex justify-between items-center">
                    <div>
                      <CardTitle>Procure Registrate</CardTitle>
                      <CardDescription>
                        {filteredProcure.length} procure totali
                      </CardDescription>
                    </div>
                    <Dialog
                      open={isNewProcuraDialogOpen}
                      onOpenChange={setIsNewProcuraDialogOpen}
                    >
                      <DialogTrigger asChild>
                        <Button
                          className="bg-blue-600 hover:bg-blue-700"
                          onClick={() => {
                            resetNewProcura();
                            setEditingProcura(null);
                          }}
                        >
                          <Plus className="h-4 w-4 mr-2" />
                          Nuova Procura
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="w-[calc(100vw-2rem)] max-w-4xl overflow-hidden rounded-[30px] border border-slate-200 bg-white/95 p-0 shadow-[0_30px_90px_-32px_rgba(15,23,42,0.35)]">
                        <DialogHeader>
                          <DialogTitle className="border-b border-slate-100 bg-gradient-to-r from-blue-700 via-blue-600 to-sky-500 px-6 py-5 text-2xl text-white">
                            {editingProcura
                              ? "Modifica Procura"
                              : "Nuova Procura"}
                          </DialogTitle>
                        </DialogHeader>
                        <div className="max-h-[78vh] space-y-6 overflow-y-auto px-6 py-6">
                          <div>
                            <Label htmlFor="name">Nome Procura *</Label>
                            <Input
                              id="name"
                              name="name"
                              value={newProcura.name}
                              onChange={handleProcuraChange}
                              placeholder="Es. Studio Legale Rossi"
                            />
                          </div>
                          <div>
                            <Label>Indirizzo Sede Procura</Label>
                            <div className="space-y-2 mt-2">
                              <Input
                                name="address.street"
                                value={newProcura.address.street}
                                onChange={handleProcuraChange}
                                placeholder="Via/Piazza"
                              />
                              <div className="grid grid-cols-2 gap-2">
                                <Input
                                  name="address.city"
                                  value={newProcura.address.city}
                                  onChange={handleProcuraChange}
                                  placeholder="Città"
                                />
                                <Input
                                  name="address.province"
                                  value={newProcura.address.province}
                                  onChange={handleProcuraChange}
                                  placeholder="Provincia"
                                />
                              </div>
                              <div className="grid grid-cols-2 gap-2">
                                <Input
                                  name="address.postalCode"
                                  value={newProcura.address.postalCode}
                                  onChange={handleProcuraChange}
                                  placeholder="CAP"
                                />
                                <Input
                                  name="address.country"
                                  value={newProcura.address.country}
                                  onChange={handleProcuraChange}
                                  placeholder="Paese"
                                />
                              </div>
                            </div>
                          </div>

                          <div>
                            <div className="flex justify-between items-center mb-2">
                              <Label>Contatti Procuratori</Label>
                              <Dialog
                                open={isNewContactDialogOpen}
                                onOpenChange={setIsNewContactDialogOpen}
                              >
                                <DialogTrigger asChild>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => {
                                      resetNewContact();
                                      setEditingContact(null);
                                    }}
                                  >
                                    <UserPlus className="h-4 w-4 mr-2" />
                                    Aggiungi Contatto
                                  </Button>
                                </DialogTrigger>
                                <DialogContent>
                                  <DialogHeader>
                                    <DialogTitle>
                                      {editingContact
                                        ? "Modifica Contatto"
                                        : "Nuovo Contatto"}
                                    </DialogTitle>
                                  </DialogHeader>
                                  <div className="space-y-4 py-4">
                                    <div className="grid grid-cols-2 gap-4">
                                      <div>
                                        <Label htmlFor="contact-firstName">
                                          Nome *
                                        </Label>
                                        <Input
                                          id="contact-firstName"
                                          value={newContact.firstName}
                                          onChange={(e) =>
                                            setNewContact({
                                              ...newContact,
                                              firstName: e.target.value,
                                            })
                                          }
                                          placeholder="Nome"
                                        />
                                      </div>
                                      <div>
                                        <Label htmlFor="contact-lastName">
                                          Cognome *
                                        </Label>
                                        <Input
                                          id="contact-lastName"
                                          value={newContact.lastName}
                                          onChange={(e) =>
                                            setNewContact({
                                              ...newContact,
                                              lastName: e.target.value,
                                            })
                                          }
                                          placeholder="Cognome"
                                        />
                                      </div>
                                    </div>
                                    <div>
                                      <Label htmlFor="contact-phone">
                                        Telefono
                                      </Label>
                                      <Input
                                        id="contact-phone"
                                        value={newContact.phone}
                                        onChange={(e) =>
                                          setNewContact({
                                            ...newContact,
                                            phone: e.target.value,
                                          })
                                        }
                                        placeholder="+39 123 456 7890"
                                      />
                                    </div>
                                    <div>
                                      <Label htmlFor="contact-email">
                                        Email
                                      </Label>
                                      <Input
                                        id="contact-email"
                                        type="email"
                                        value={newContact.email}
                                        onChange={(e) =>
                                          setNewContact({
                                            ...newContact,
                                            email: e.target.value,
                                          })
                                        }
                                        placeholder="email@example.com"
                                      />
                                    </div>
                                  </div>
                                  <div className="flex justify-end gap-2">
                                    <Button
                                      variant="outline"
                                      onClick={() =>
                                        setIsNewContactDialogOpen(false)
                                      }
                                    >
                                      Annulla
                                    </Button>
                                    <Button onClick={addContactToProcura}>
                                      {editingContact ? "Aggiorna" : "Aggiungi"}
                                    </Button>
                                  </div>
                                </DialogContent>
                              </Dialog>
                            </div>
                            <div className="space-y-2">
                              {newProcura.contacts.length === 0 ? (
                                <p className="text-sm text-muted-foreground">
                                  Nessun contatto aggiunto
                                </p>
                              ) : (
                                newProcura.contacts.map((contact: any) => (
                                  <Card key={contact.id}>
                                    <CardContent className="p-3">
                                      <div className="flex justify-between items-start">
                                        <div>
                                          <p className="font-medium">
                                            {contact.firstName}{" "}
                                            {contact.lastName}
                                          </p>
                                          {contact.phone && (
                                            <p className="text-sm text-muted-foreground flex items-center gap-1">
                                              <Phone className="h-3 w-3" />
                                              {contact.phone}
                                            </p>
                                          )}
                                          {contact.email && (
                                            <p className="text-sm text-muted-foreground flex items-center gap-1">
                                              <Mail className="h-3 w-3" />
                                              {contact.email}
                                            </p>
                                          )}
                                        </div>
                                        <div className="flex gap-1">
                                          <Button
                                            variant="ghost"
                                            size="icon"
                                            onClick={() => {
                                              setEditingContact(contact);
                                              setNewContact({
                                                firstName: contact.firstName,
                                                lastName: contact.lastName,
                                                phone: contact.phone,
                                                email: contact.email,
                                              });
                                              setIsNewContactDialogOpen(true);
                                            }}
                                          >
                                            <Edit className="h-4 w-4 text-blue-600" />
                                          </Button>
                                          <Button
                                            variant="ghost"
                                            size="icon"
                                            onClick={() =>
                                              deleteContactFromProcura(
                                                contact.id,
                                              )
                                            }
                                          >
                                            <Trash2 className="h-4 w-4 text-red-600" />
                                          </Button>
                                        </div>
                                      </div>
                                    </CardContent>
                                  </Card>
                                ))
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="outline"
                            onClick={() => setIsNewProcuraDialogOpen(false)}
                          >
                            Annulla
                          </Button>
                          <Button onClick={saveProcura}>
                            {editingProcura ? "Aggiorna" : "Salva"}
                          </Button>
                        </div>
                      </DialogContent>
                    </Dialog>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="border rounded-lg overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead className="bg-gray-100 dark:bg-gray-800">
                          <tr>
                            <th className="px-4 py-3 text-left text-sm font-medium">
                              Nome Procura
                            </th>
                            <th className="px-4 py-3 text-left text-sm font-medium">
                              Contatti
                            </th>
                            <th className="px-4 py-3 text-left text-sm font-medium">
                              Atleti
                            </th>
                            <th className="px-4 py-3 text-left text-sm font-medium">
                              Allenatori
                            </th>
                            <th className="px-4 py-3 text-center text-sm font-medium">
                              Azioni
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {filteredProcure.length === 0 ? (
                            <tr>
                              <td
                                colSpan={5}
                                className="px-4 py-8 text-center text-muted-foreground"
                              >
                                <Scale className="h-12 w-12 mx-auto mb-4 opacity-50" />
                                <p>Nessuna procura trovata</p>
                              </td>
                            </tr>
                          ) : (
                            filteredProcure.map((procura) => (
                              <tr
                                key={procura.id}
                                className={`hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors cursor-pointer ${
                                  selectedProcura?.id === procura.id
                                    ? "bg-blue-50 dark:bg-blue-900/20"
                                    : ""
                                }`}
                                onClick={() => setSelectedProcura(procura)}
                              >
                                <td className="px-4 py-3">
                                  <p className="font-medium">{procura.name}</p>
                                  <p className="text-sm text-muted-foreground">
                                    {procura.address?.city || "N/A"}
                                  </p>
                                </td>
                                <td className="px-4 py-3">
                                  <Badge variant="secondary">
                                    {procura.contacts?.length || 0} contatti
                                  </Badge>
                                </td>
                                <td className="px-4 py-3">
                                  <Badge variant="secondary">
                                    {procura.athletes?.length || 0}
                                  </Badge>
                                </td>
                                <td className="px-4 py-3">
                                  <Badge variant="secondary">
                                    {procura.trainers?.length || 0}
                                  </Badge>
                                </td>
                                <td className="px-4 py-3 text-center">
                                  <div className="flex justify-center gap-1">
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        editProcura(procura);
                                      }}
                                    >
                                      <Edit className="h-4 w-4 text-blue-600" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        deleteProcura(procura.id);
                                      }}
                                    >
                                      <Trash2 className="h-4 w-4 text-red-600" />
                                    </Button>
                                  </div>
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Procura Details Box */}
              {selectedProcura && (
                <Card>
                  <CardHeader>
                    <div className="flex justify-between items-center">
                      <CardTitle>{selectedProcura.name}</CardTitle>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => editProcura(selectedProcura)}
                      >
                        <Edit className="h-4 w-4 mr-2" />
                        Modifica Informazioni
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <Tabs defaultValue="info">
                      <TabsList>
                        <TabsTrigger value="info">Informazioni</TabsTrigger>
                        <TabsTrigger value="payments">Pagamenti</TabsTrigger>
                        <TabsTrigger value="associations">
                          Associazioni
                        </TabsTrigger>
                      </TabsList>

                      <TabsContent value="info" className="space-y-4">
                        <div>
                          <Label className="text-muted-foreground flex items-center gap-2">
                            <MapPin className="h-4 w-4" />
                            Indirizzo Sede
                          </Label>
                          <p className="font-medium">
                            {selectedProcura.address?.street || ""}
                            {selectedProcura.address?.street && <br />}
                            {selectedProcura.address?.postalCode}{" "}
                            {selectedProcura.address?.city}{" "}
                            {selectedProcura.address?.province &&
                              `(${selectedProcura.address.province})`}
                            {selectedProcura.address?.city && <br />}
                            {selectedProcura.address?.country}
                          </p>
                        </div>

                        <div>
                          <Label className="text-muted-foreground mb-2 block">
                            Contatti Procuratori
                          </Label>
                          {(!selectedProcura.contacts ||
                            selectedProcura.contacts.length === 0) && (
                            <p className="text-sm text-muted-foreground">
                              Nessun contatto registrato
                            </p>
                          )}
                          <div className="space-y-2">
                            {selectedProcura.contacts?.map((contact: any) => (
                              <Card key={contact.id}>
                                <CardContent className="p-3">
                                  <p className="font-medium">
                                    {contact.firstName} {contact.lastName}
                                  </p>
                                  {contact.phone && (
                                    <p className="text-sm text-muted-foreground flex items-center gap-1">
                                      <Phone className="h-3 w-3" />
                                      {contact.phone}
                                    </p>
                                  )}
                                  {contact.email && (
                                    <p className="text-sm text-muted-foreground flex items-center gap-1">
                                      <Mail className="h-3 w-3" />
                                      {contact.email}
                                    </p>
                                  )}
                                </CardContent>
                              </Card>
                            ))}
                          </div>
                        </div>
                      </TabsContent>

                      <TabsContent value="payments" className="space-y-4">
                        <div className="flex justify-between items-center">
                          <h3 className="font-medium">Storico Pagamenti</h3>
                          <Dialog
                            open={isNewPaymentDialogOpen}
                            onOpenChange={setIsNewPaymentDialogOpen}
                          >
                            <DialogTrigger asChild>
                              <Button
                                size="sm"
                                className="bg-blue-600 hover:bg-blue-700"
                                onClick={resetNewPayment}
                              >
                                <Plus className="h-4 w-4 mr-2" />
                                Nuovo Pagamento
                              </Button>
                            </DialogTrigger>
                            <DialogContent>
                              <DialogHeader>
                                <DialogTitle>Nuovo Pagamento</DialogTitle>
                              </DialogHeader>
                              <div className="space-y-4 py-4">
                                <div>
                                  <Label>Tipo Persona</Label>
                                  <Select
                                    value={newPayment.personType}
                                    onValueChange={(value) =>
                                      setNewPayment({
                                        ...newPayment,
                                        personType: value,
                                        personId: "",
                                      })
                                    }
                                  >
                                    <SelectTrigger>
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="athlete">
                                        Atleta
                                      </SelectItem>
                                      <SelectItem value="trainer">
                                        Allenatore
                                      </SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                                <div>
                                  <Label>Persona</Label>
                                  <Select
                                    value={newPayment.personId}
                                    onValueChange={(value) =>
                                      setNewPayment({
                                        ...newPayment,
                                        personId: value,
                                      })
                                    }
                                  >
                                    <SelectTrigger>
                                      <SelectValue placeholder="Seleziona..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {(newPayment.personType === "athlete"
                                        ? selectedProcura.athletes || []
                                        : selectedProcura.trainers || []
                                      ).map((assoc: any) => {
                                        const person =
                                          newPayment.personType === "athlete"
                                            ? athletes.find(
                                                (a) => a.id === assoc.personId,
                                              )
                                            : trainers.find(
                                                (t) => t.id === assoc.personId,
                                              );
                                        return (
                                          <SelectItem
                                            key={assoc.personId}
                                            value={assoc.personId}
                                          >
                                            {person?.name || "Sconosciuto"}
                                          </SelectItem>
                                        );
                                      })}
                                    </SelectContent>
                                  </Select>
                                </div>
                                <div>
                                  <Label>Data</Label>
                                  <Input
                                    type="date"
                                    value={newPayment.date}
                                    onChange={(e) =>
                                      setNewPayment({
                                        ...newPayment,
                                        date: e.target.value,
                                      })
                                    }
                                  />
                                </div>
                                <div>
                                  <Label>Importo (€)</Label>
                                  <Input
                                    type="number"
                                    value={newPayment.amount}
                                    onChange={(e) =>
                                      setNewPayment({
                                        ...newPayment,
                                        amount: parseFloat(e.target.value) || 0,
                                      })
                                    }
                                    placeholder="0.00"
                                  />
                                </div>
                                <div>
                                  <Label>Tipo</Label>
                                  <Select
                                    value={newPayment.type}
                                    onValueChange={(value) =>
                                      setNewPayment({
                                        ...newPayment,
                                        type: value,
                                      })
                                    }
                                  >
                                    <SelectTrigger>
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="entrata">
                                        Entrata
                                      </SelectItem>
                                      <SelectItem value="uscita">
                                        Uscita
                                      </SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                                <div>
                                  <Label>Descrizione</Label>
                                  <Textarea
                                    value={newPayment.description}
                                    onChange={(e) =>
                                      setNewPayment({
                                        ...newPayment,
                                        description: e.target.value,
                                      })
                                    }
                                    placeholder="Descrizione del pagamento"
                                  />
                                </div>
                              </div>
                              <div className="flex justify-end gap-2">
                                <Button
                                  variant="outline"
                                  onClick={() =>
                                    setIsNewPaymentDialogOpen(false)
                                  }
                                >
                                  Annulla
                                </Button>
                                <Button onClick={addPayment}>Salva</Button>
                              </div>
                            </DialogContent>
                          </Dialog>
                        </div>
                        <div className="space-y-2">
                          {(!selectedProcura.payments ||
                            selectedProcura.payments.length === 0) && (
                            <div className="text-center py-8 text-muted-foreground">
                              <Euro className="h-12 w-12 mx-auto mb-4 opacity-50" />
                              <p>Nessun pagamento registrato</p>
                            </div>
                          )}
                          {selectedProcura.payments?.map((payment: any) => {
                            const person =
                              payment.personType === "athlete"
                                ? athletes.find(
                                    (a) => a.id === payment.personId,
                                  )
                                : trainers.find(
                                    (t) => t.id === payment.personId,
                                  );
                            return (
                              <Card key={payment.id}>
                                <CardContent className="p-4">
                                  <div className="flex justify-between items-start">
                                    <div>
                                      <p className="font-medium">
                                        {person?.name || "Sconosciuto"}
                                      </p>
                                      <p className="text-sm text-muted-foreground">
                                        {new Date(
                                          payment.date,
                                        ).toLocaleDateString("it-IT")}
                                      </p>
                                      {payment.description && (
                                        <p className="text-sm mt-1">
                                          {payment.description}
                                        </p>
                                      )}
                                    </div>
                                    <div className="text-right">
                                      <p
                                        className={`font-bold flex items-center gap-1 ${
                                          payment.type === "entrata"
                                            ? "text-green-600"
                                            : "text-red-600"
                                        }`}
                                      >
                                        {payment.type === "entrata" ? (
                                          <TrendingUp className="h-4 w-4" />
                                        ) : (
                                          <TrendingDown className="h-4 w-4" />
                                        )}
                                        €{payment.amount.toFixed(2)}
                                      </p>
                                      <Badge
                                        variant={
                                          payment.type === "entrata"
                                            ? "default"
                                            : "destructive"
                                        }
                                      >
                                        {payment.type === "entrata"
                                          ? "Entrata"
                                          : "Uscita"}
                                      </Badge>
                                    </div>
                                  </div>
                                </CardContent>
                              </Card>
                            );
                          })}
                        </div>
                      </TabsContent>

                      <TabsContent value="associations" className="space-y-4">
                        <div className="flex justify-between items-center">
                          <h3 className="font-medium">
                            Atleti e Allenatori Associati
                          </h3>
                          <Dialog
                            open={isAssociationDialogOpen}
                            onOpenChange={(open) => {
                              setIsAssociationDialogOpen(open);
                              if (!open) {
                                setEditingAssociation(null);
                                setEditingAssociationType("");
                                resetNewAssociation();
                              }
                            }}
                          >
                            <DialogTrigger asChild>
                              <Button
                                size="sm"
                                className="bg-blue-600 hover:bg-blue-700"
                                onClick={resetNewAssociation}
                              >
                                <Plus className="h-4 w-4 mr-2" />
                                Aggiungi Associazione
                              </Button>
                            </DialogTrigger>
                            <DialogContent>
                              <DialogHeader>
                                <DialogTitle>
                                  {editingAssociation
                                    ? "Modifica Associazione"
                                    : "Nuova Associazione"}
                                </DialogTitle>
                              </DialogHeader>
                              <div className="space-y-4 py-4">
                                <div>
                                  <Label>Tipo</Label>
                                  <Select
                                    value={newAssociation.personType}
                                    onValueChange={(value) =>
                                      setNewAssociation({
                                        ...newAssociation,
                                        personType: value,
                                        personId: "",
                                      })
                                    }
                                    disabled={!!editingAssociation}
                                  >
                                    <SelectTrigger>
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="athlete">
                                        Atleta
                                      </SelectItem>
                                      <SelectItem value="trainer">
                                        Allenatore
                                      </SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                                <div>
                                  <Label>Persona</Label>
                                  <Select
                                    value={newAssociation.personId}
                                    onValueChange={(value) =>
                                      setNewAssociation({
                                        ...newAssociation,
                                        personId: value,
                                      })
                                    }
                                  >
                                    <SelectTrigger>
                                      <SelectValue placeholder="Seleziona..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {(newAssociation.personType === "athlete"
                                        ? athletes
                                        : trainers
                                      ).map((person) => (
                                        <SelectItem
                                          key={person.id}
                                          value={person.id}
                                        >
                                          {person.name}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                                <div>
                                  <Label>Costo (€)</Label>
                                  <Input
                                    type="number"
                                    value={newAssociation.cost}
                                    onChange={(e) =>
                                      setNewAssociation({
                                        ...newAssociation,
                                        cost: parseFloat(e.target.value) || 0,
                                      })
                                    }
                                    placeholder="0.00"
                                  />
                                </div>
                              </div>
                              <div className="flex justify-end gap-2">
                                <Button
                                  variant="outline"
                                  onClick={() => {
                                    setIsAssociationDialogOpen(false);
                                    setEditingAssociation(null);
                                    setEditingAssociationType("");
                                  }}
                                >
                                  Annulla
                                </Button>
                                <Button onClick={addAssociation}>
                                  {editingAssociation ? "Aggiorna" : "Salva"}
                                </Button>
                              </div>
                            </DialogContent>
                          </Dialog>
                        </div>

                        {/* Notes Dialog */}
                        <Dialog
                          open={isNotesDialogOpen}
                          onOpenChange={setIsNotesDialogOpen}
                        >
                          <DialogContent>
                            <DialogHeader>
                              <DialogTitle>Note Associazione</DialogTitle>
                            </DialogHeader>
                            <div className="space-y-4 py-4">
                              <div>
                                <Label>Note</Label>
                                <Textarea
                                  value={associationNotes}
                                  onChange={(e) =>
                                    setAssociationNotes(e.target.value)
                                  }
                                  placeholder="Inserisci note per questa associazione..."
                                  rows={5}
                                />
                              </div>
                            </div>
                            <div className="flex justify-end gap-2">
                              <Button
                                variant="outline"
                                onClick={() => setIsNotesDialogOpen(false)}
                              >
                                Annulla
                              </Button>
                              <Button onClick={saveAssociationNotes}>
                                <Save className="h-4 w-4 mr-2" />
                                Salva Note
                              </Button>
                            </div>
                          </DialogContent>
                        </Dialog>

                        <div className="space-y-4">
                          <div>
                            <h4 className="font-medium mb-2">Atleti</h4>
                            {(!selectedProcura.athletes ||
                              selectedProcura.athletes.length === 0) && (
                              <p className="text-sm text-muted-foreground">
                                Nessun atleta associato
                              </p>
                            )}
                            <div className="space-y-2">
                              {selectedProcura.athletes?.map((assoc: any) => {
                                const athlete = athletes.find(
                                  (a) => a.id === assoc.personId,
                                );
                                return (
                                  <Card key={assoc.personId}>
                                    <CardContent className="p-3">
                                      <div className="flex justify-between items-start">
                                        <div className="flex-1">
                                          <p className="font-medium">
                                            {athlete?.name || "Sconosciuto"}
                                          </p>
                                          <p className="text-sm text-muted-foreground">
                                            Costo: €
                                            {assoc.cost?.toFixed(2) || "0.00"}
                                          </p>
                                          {assoc.notes && (
                                            <p className="text-sm text-muted-foreground mt-1 italic">
                                              Note: {assoc.notes}
                                            </p>
                                          )}
                                        </div>
                                        <div className="flex items-center gap-1">
                                          <Button
                                            variant="ghost"
                                            size="icon"
                                            onClick={() => {
                                              setSelectedAssociation({
                                                ...assoc,
                                                type: "athlete",
                                              });
                                              setAssociationNotes(
                                                assoc.notes || "",
                                              );
                                              setIsNotesDialogOpen(true);
                                            }}
                                            title="Aggiungi/Modifica Note"
                                          >
                                            <StickyNote
                                              className={`h-4 w-4 ${assoc.notes ? "text-yellow-600" : "text-gray-400"}`}
                                            />
                                          </Button>
                                          <Button
                                            variant="ghost"
                                            size="icon"
                                            onClick={() =>
                                              editAssociation(assoc, "athlete")
                                            }
                                          >
                                            <Edit className="h-4 w-4 text-blue-600" />
                                          </Button>
                                          <Button
                                            variant="ghost"
                                            size="icon"
                                            onClick={() =>
                                              deleteAssociation(
                                                assoc.personId,
                                                "athlete",
                                              )
                                            }
                                          >
                                            <Trash2 className="h-4 w-4 text-red-600" />
                                          </Button>
                                        </div>
                                      </div>
                                    </CardContent>
                                  </Card>
                                );
                              })}
                            </div>
                          </div>

                          <div>
                            <h4 className="font-medium mb-2">Allenatori</h4>
                            {(!selectedProcura.trainers ||
                              selectedProcura.trainers.length === 0) && (
                              <p className="text-sm text-muted-foreground">
                                Nessun allenatore associato
                              </p>
                            )}
                            <div className="space-y-2">
                              {selectedProcura.trainers?.map((assoc: any) => {
                                const trainer = trainers.find(
                                  (t) => t.id === assoc.personId,
                                );
                                return (
                                  <Card key={assoc.personId}>
                                    <CardContent className="p-3">
                                      <div className="flex justify-between items-start">
                                        <div className="flex-1">
                                          <p className="font-medium">
                                            {trainer?.name || "Sconosciuto"}
                                          </p>
                                          <p className="text-sm text-muted-foreground">
                                            Costo: €
                                            {assoc.cost?.toFixed(2) || "0.00"}
                                          </p>
                                          {assoc.notes && (
                                            <p className="text-sm text-muted-foreground mt-1 italic">
                                              Note: {assoc.notes}
                                            </p>
                                          )}
                                        </div>
                                        <div className="flex items-center gap-1">
                                          <Button
                                            variant="ghost"
                                            size="icon"
                                            onClick={() => {
                                              setSelectedAssociation({
                                                ...assoc,
                                                type: "trainer",
                                              });
                                              setAssociationNotes(
                                                assoc.notes || "",
                                              );
                                              setIsNotesDialogOpen(true);
                                            }}
                                            title="Aggiungi/Modifica Note"
                                          >
                                            <StickyNote
                                              className={`h-4 w-4 ${assoc.notes ? "text-yellow-600" : "text-gray-400"}`}
                                            />
                                          </Button>
                                          <Button
                                            variant="ghost"
                                            size="icon"
                                            onClick={() =>
                                              editAssociation(assoc, "trainer")
                                            }
                                          >
                                            <Edit className="h-4 w-4 text-blue-600" />
                                          </Button>
                                          <Button
                                            variant="ghost"
                                            size="icon"
                                            onClick={() =>
                                              deleteAssociation(
                                                assoc.personId,
                                                "trainer",
                                              )
                                            }
                                          >
                                            <Trash2 className="h-4 w-4 text-red-600" />
                                          </Button>
                                        </div>
                                      </div>
                                    </CardContent>
                                  </Card>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      </TabsContent>
                    </Tabs>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
