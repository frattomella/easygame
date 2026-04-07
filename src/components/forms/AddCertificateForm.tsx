"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast-notification";
import { supabase } from "@/lib/supabase";

interface AddCertificateFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: any) => Promise<boolean | void> | boolean | void;
  athletes: { id: string; name: string }[];
  clubId?: string | null;
}

export function AddCertificateForm({
  isOpen,
  onClose,
  onSubmit,
  athletes = [],
  clubId,
}: AddCertificateFormProps) {
  const { showToast } = useToast();
  const [formData, setFormData] = useState({
    athleteId: "",
    certificateType: "Agonistico",
    issueDate: new Date().toISOString().split("T")[0],
    expiryDate: "",
  });
  const [searchQuery, setSearchQuery] = useState("");
  const [filteredAthletes, setFilteredAthletes] = useState(athletes);
  const [localAthletes, setLocalAthletes] = useState(athletes);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const certificateTypes = [
    { value: "Agonistico", label: "Certificato Agonistico" },
    { value: "Non Agonistico", label: "Certificato Non Agonistico" },
    {
      value: "Sana e Robusta Costituzione",
      label: "Certificato di Sana e Robusta Costituzione",
    },
  ];

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const query = e.target.value;
    setSearchQuery(query);

    if (query.trim() === "") {
      setFilteredAthletes(localAthletes);
    } else {
      const filtered = localAthletes.filter((athlete) =>
        athlete.name.toLowerCase().includes(query.toLowerCase()),
      );
      setFilteredAthletes(filtered);

      // Auto-select if only one athlete matches
      if (filtered.length === 1) {
        setFormData((prev) => ({
          ...prev,
          athleteId: filtered[0].id,
        }));
      }
    }
  };

  // Update filtered athletes when athletes prop changes
  React.useEffect(() => {
    if (athletes.length > 0) {
      setLocalAthletes(athletes);
      setFilteredAthletes(athletes);
    }
  }, [athletes]);

  // Fetch athletes if not provided and clubId is available
  React.useEffect(() => {
    const fetchAthletes = async () => {
      if (clubId && isOpen) {
        try {
          const { data: athletesData, error } = await supabase
            .from("simplified_athletes")
            .select("id, first_name, last_name")
            .eq("club_id", clubId);

          if (error) {
            console.error("Error fetching athletes:", error);
            showToast("error", "Errore nel caricamento degli atleti");
            return;
          }

          const fetchedAthletes = (athletesData || []).map((athlete: any) => ({
            id: athlete.id,
            name: `${athlete.first_name} ${athlete.last_name}`.trim(),
          }));
          console.log("Fetched athletes:", fetchedAthletes);
          setLocalAthletes(fetchedAthletes);
          setFilteredAthletes(fetchedAthletes);
        } catch (error) {
          console.error("Error fetching athletes:", error);
          showToast("error", "Errore nel caricamento degli atleti");
        }
      }
    };

    fetchAthletes();
  }, [clubId, isOpen, showToast]);

  const handleSubmit = async (
    e?: React.FormEvent<HTMLFormElement> | React.MouseEvent<HTMLButtonElement>,
  ) => {
    e?.preventDefault();

    // Validate form
    if (
      !formData.athleteId ||
      !formData.certificateType ||
      !formData.issueDate ||
      !formData.expiryDate
    ) {
      showToast("error", "Compila tutti i campi obbligatori");
      return;
    }

    // Validate clubId
    if (!clubId) {
      showToast("error", "ID del club non disponibile");
      return;
    }

    if (!selectedFile) {
      showToast("error", "Il caricamento del file è obbligatorio");
      return;
    }

    // Check if expiry date is after issue date
    if (new Date(formData.expiryDate) <= new Date(formData.issueDate)) {
      showToast(
        "error",
        "La data di scadenza deve essere successiva alla data di emissione",
      );
      return;
    }

    const safeFileName = selectedFile.name.replace(/[^a-zA-Z0-9._-]/g, "-");
    const storagePath = [
      "clubs",
      clubId,
      "athletes",
      formData.athleteId,
      "medical",
      `${Date.now()}-${safeFileName}`,
    ].join("/");

    setIsSubmitting(true);

    try {
      const uploadResult = await supabase
        .storage
        .from("medical-certificates")
        .upload(storagePath, selectedFile);

      if (uploadResult.error || !uploadResult.data?.path) {
        throw uploadResult.error || new Error("Upload non riuscito");
      }

      const publicUrlResult = supabase
        .storage
        .from("medical-certificates")
        .getPublicUrl(uploadResult.data.path);

      const fileUrl = publicUrlResult.data.publicUrl;
      const selectedAthlete = localAthletes.find(
        (athlete) => athlete.id === formData.athleteId,
      );

      const submitResult = await onSubmit({
        ...formData,
        athleteName: selectedAthlete?.name || "Atleta",
        fileUrl,
        fileName: selectedFile.name,
        status: new Date(formData.expiryDate) > new Date() ? "valid" : "expired",
        organizationId: clubId,
      });

      if (submitResult === false) {
        return;
      }

      setFormData({
        athleteId: "",
        certificateType: "Agonistico",
        issueDate: new Date().toISOString().split("T")[0],
        expiryDate: "",
      });
      setSelectedFile(null);
      setSearchQuery("");
      setFilteredAthletes(localAthletes);
      onClose();
    } catch (error) {
      console.error("Error uploading certificate file:", error);
      showToast("error", "Errore nel caricamento del file del certificato");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      title="Carica Nuovo Certificato"
      description="Inserisci i dettagli del certificato medico"
      isOpen={isOpen}
      onClose={onClose}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Annulla
          </Button>
          <Button
            onClick={handleSubmit}
            className="bg-blue-600 hover:bg-blue-700"
            disabled={isSubmitting}
          >
            {isSubmitting ? "Salvataggio..." : "Salva"}
          </Button>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="athleteId">Atleta</Label>
          <div className="relative">
            <Input
              id="athleteSearch"
              type="text"
              placeholder="Cerca atleta..."
              className="w-full mb-2"
              value={searchQuery}
              onChange={handleSearchChange}
            />
            <select
              id="athleteId"
              name="athleteId"
              value={formData.athleteId}
              onChange={handleChange}
              className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
              required
            >
              <option value="" disabled>
                {filteredAthletes.length === 0
                  ? "Nessun atleta trovato"
                  : "Seleziona un atleta"}
              </option>
              {filteredAthletes.map((athlete) => (
                <option key={athlete.id} value={athlete.id}>
                  {athlete.name}
                </option>
              ))}
            </select>
            {localAthletes.length === 0 && isOpen && (
              <p className="text-sm text-muted-foreground mt-1">
                Caricamento atleti...
              </p>
            )}
            {localAthletes.length === 0 && !isOpen && (
              <p className="text-sm text-muted-foreground mt-1">
                Nessun atleta disponibile per questo club
              </p>
            )}
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="certificateType">Tipo di Certificato</Label>
          <select
            id="certificateType"
            name="certificateType"
            value={formData.certificateType}
            onChange={handleChange}
            className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
            required
          >
            {certificateTypes.map((type) => (
              <option key={type.value} value={type.value}>
                {type.label}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="issueDate">Data di Emissione</Label>
            <Input
              id="issueDate"
              name="issueDate"
              type="date"
              value={formData.issueDate}
              onChange={handleChange}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="expiryDate">Data di Scadenza</Label>
            <Input
              id="expiryDate"
              name="expiryDate"
              type="date"
              value={formData.expiryDate}
              onChange={handleChange}
              required
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="fileUrl">Carica File *</Label>
          <Input
            id="fileUrl"
            name="fileUrl"
            type="file"
            required
            onChange={(e) => {
              setSelectedFile(e.target.files?.[0] || null);
            }}
          />
          {selectedFile && (
            <p className="text-sm text-muted-foreground">
              File selezionato: {selectedFile.name}
            </p>
          )}
        </div>
      </form>
    </Modal>
  );
}
