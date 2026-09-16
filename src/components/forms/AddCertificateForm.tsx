"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { Drawer } from "@/components/web/overlays/Drawer";
import { Button as WebButton } from "@/components/web/primitives/Button";
import { useToast } from "@/components/ui/toast-notification";
import { supabase } from "@/lib/supabase";
import { replaceAttachment, uploadAttachment } from "@/lib/api/attachments";
import { resolveAttachmentSource } from "@/lib/attachments";
import {
  compareAthletesByLastName,
  getAthleteDisplayName,
} from "@/lib/athlete-name-utils";
import { formatLocalDateOnly, todayLocalDateOnly } from "@/lib/date-only";

/**
 * Il certificato che si sta correggendo, quando la finestra si apre in
 * modifica. `fileUrl` dice se un file c'e gia: se c'e, caricarne uno nuovo e
 * una **sostituzione** e non un obbligo.
 */
export type EditableCertificate = {
  id: string;
  type?: string | null;
  issueDate?: string | null;
  expiryDate?: string | null;
  fileUrl?: string | null;
};

interface AddCertificateFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: any) => Promise<boolean | void> | boolean | void;
  athletes: { id: string; name: string }[];
  clubId?: string | null;
  athleteId?: string | null;
  athleteName?: string | null;
  lockAthleteSelection?: boolean;
  /**
   * Quando c'e, la finestra corregge invece di creare (N5).
   *
   * Prima esisteva **solo** la creazione: correggere una data di scadenza
   * sbagliata o allegare il file arrivato dopo voleva dire cancellare il
   * certificato e rifarlo — cioe perdere la riga che il club aveva
   * protocollato, e lasciare orfano l'allegato di prima.
   */
  certificate?: EditableCertificate | null;
  /**
   * Il guscio: la finestra modale della V1 (default, scheda atleta) oppure
   * il cassetto da 480 del Web V2 (`/medical`). Cambia solo l'involucro e i
   * pulsanti del piede: campi, validazioni e caricamento sono gli stessi.
   */
  presentation?: "modal" | "drawer";
}

const todayDate = () => todayLocalDateOnly();

/**
 * Un `<input type="date">` vuole `YYYY-MM-DD`. Dall'archivio la data puo
 * arrivare come ISO completa: tagliarla al giorno **senza** passare da
 * `new Date()` evita che un fuso a ovest di Greenwich la sposti indietro di
 * uno — che su una scadenza sanitaria e un giorno di copertura in meno.
 */
const toDateInputValue = (value: unknown) => {
  const testo = String(value || "").trim();
  if (!testo) return "";
  const match = testo.match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : "";
};

/*
  **La stessa data, un anno dopo — non l'istante UTC** (bug UAT "date-only
  timezone shift"). `new Date(...)T00:00:00` e mezzanotte locale, giusta
  per il calcolo; era `.toISOString()` a sbagliare, riconvertendo in UTC e
  spostando la scadenza indietro di un giorno a Roma — una copertura
  sanitaria in meno, non in piu.
*/
function addOneYear(dateString: string) {
  if (!dateString) return "";
  const date = new Date(`${dateString}T00:00:00`);
  if (Number.isNaN(date.getTime())) return "";
  date.setFullYear(date.getFullYear() + 1);
  return formatLocalDateOnly(date);
}

const initialCertificateForm = () => {
  const issueDate = todayDate();
  return {
    athleteId: "",
    certificateType: "Agonistico",
    issueDate,
    expiryDate: addOneYear(issueDate),
  };
};

export function AddCertificateForm({
  isOpen,
  onClose,
  onSubmit,
  athletes = [],
  clubId,
  athleteId,
  athleteName,
  lockAthleteSelection = false,
  certificate = null,
  presentation = "modal",
}: AddCertificateFormProps) {
  const { showToast } = useToast();
  const isAthleteLocked = Boolean(lockAthleteSelection && athleteId);
  const isEditing = Boolean(certificate?.id);
  /* In modifica il file e obbligatorio solo se non ce n'e gia uno. */
  const hasExistingFile = Boolean(String(certificate?.fileUrl || "").trim());
  const [formData, setFormData] = useState(initialCertificateForm);
  const [expiryManuallyEdited, setExpiryManuallyEdited] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [filteredAthletes, setFilteredAthletes] = useState(athletes);
  const [localAthletes, setLocalAthletes] = useState(athletes);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  /* Qualcosa e stato toccato: il cassetto chiede prima di buttarlo via. */
  const [touched, setTouched] = useState(false);

  const certificateTypes = [
    { value: "Agonistico", label: "Certificato Agonistico" },
    { value: "Non Agonistico", label: "Certificato Non Agonistico" },
    {
      value: "Sana e Robusta Costituzione",
      label: "Certificato di Sana e Robusta Costituzione",
    },
  ];

  const buildInitialForm = () => ({
    ...initialCertificateForm(),
    athleteId: isAthleteLocked ? athleteId || "" : "",
  });

  const ensureLockedAthlete = (
    items: { id: string; name: string }[],
  ): { id: string; name: string }[] => {
    if (!isAthleteLocked || !athleteId) {
      return items;
    }

    if (items.some((athlete) => athlete.id === athleteId)) {
      return items;
    }

    return [
      {
        id: athleteId,
        name: athleteName || "Atleta",
      },
      ...items,
    ];
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) => {
    const { name, value } = e.target;
    setTouched(true);
    if (name === "issueDate") {
      setFormData((prev) => ({
        ...prev,
        issueDate: value,
        expiryDate: expiryManuallyEdited ? prev.expiryDate : addOneYear(value),
      }));
      return;
    }

    if (name === "expiryDate") {
      setExpiryManuallyEdited(true);
      setFormData((prev) => ({ ...prev, expiryDate: value }));
      return;
    }

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
    const nextAthletes = ensureLockedAthlete(athletes);

    if (nextAthletes.length > 0) {
      setLocalAthletes(nextAthletes);
      setFilteredAthletes(nextAthletes);
    }
  }, [athletes, athleteId, athleteName, isAthleteLocked]);

  React.useEffect(() => {
    if (!isOpen) return;
    setTouched(false);

    /*
      In modifica la finestra si apre **sui valori del certificato**, non su
      quelli di default. Aprirla vuota e chiamarla «modifica» costringerebbe a
      ridigitare cio che c'e gia, e a ridigitarlo bene: la prima data sbagliata
      la scriverebbe il form.
    */
    if (certificate?.id) {
      setFormData({
        athleteId: athleteId || "",
        certificateType: String(certificate.type || "Agonistico"),
        issueDate: toDateInputValue(certificate.issueDate),
        expiryDate: toDateInputValue(certificate.expiryDate),
      });
      setExpiryManuallyEdited(true);
      setSelectedFile(null);
      if (isAthleteLocked) setSearchQuery(athleteName || "");
      return;
    }

    setFormData((prev) => {
      const next = isAthleteLocked ? { ...prev, athleteId: athleteId || "" } : prev;

      if (next.expiryDate || !next.issueDate) return next;
      return { ...next, expiryDate: addOneYear(next.issueDate) };
    });
    setExpiryManuallyEdited(false);
    if (isAthleteLocked) {
      setSearchQuery(athleteName || "");
    }
  }, [isOpen, athleteId, athleteName, isAthleteLocked, certificate]);

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

          const fetchedAthletes = (athletesData || [])
            .slice()
            .sort(compareAthletesByLastName)
            .map((athlete: any) => ({
              id: athlete.id,
              name: getAthleteDisplayName(athlete) || "Atleta",
            }));
          const nextAthletes = ensureLockedAthlete(fetchedAthletes);
          setLocalAthletes(nextAthletes);
          setFilteredAthletes(nextAthletes);
        } catch (error) {
          console.error("Error fetching athletes:", error);
          showToast("error", "Errore nel caricamento degli atleti");
        }
      }
    };

    fetchAthletes();
  }, [clubId, isOpen, showToast, athleteId, athleteName, isAthleteLocked]);

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

    /*
      Il file resta obbligatorio alla **creazione**: un certificato senza il
      documento che lo prova e una data che nessuno puo verificare. In
      correzione no — il file c'e gia, e pretenderlo di nuovo per cambiare una
      scadenza vorrebbe dire chiedere alla segreteria di ricaricare lo stesso
      PDF per correggere un refuso.
    */
    if (!selectedFile && !hasExistingFile) {
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

    setIsSubmitting(true);

    try {
      /*
        **Il file passa da Attachment Core, non da `supabase.storage`.**

        Qui c'era `supabase.storage.from("medical-certificates").upload(...)`,
        che nell'adattatore (`src/lib/supabase.ts`) e una `POST /api/v1/assets`.
        `assets` pero e una risorsa **chiusa** — la porta si sbarra in
        `ensureResource`, prima ancora della sessione — perche non porta un
        `organization_id` e autorizzare un documento sanitario deducendo il club
        da una convenzione sul nome del file non e un confine.

        Il risultato era che **SALVA non salvava**: il caricamento rispondeva
        403, l'eccezione veniva raccolta tre righe piu in basso, e `onSubmit`
        non veniva mai chiamato. Nessuna riga in `medical_certificates`, nessun
        errore comprensibile, la finestra che resta aperta. Il commento accanto
        alla chiusura diceva «nessun client chiedeva `/api/v1/assets`»: questo
        modulo era quel client, e la chiusura e arrivata due giorni prima che
        questo form venisse toccato l'ultima volta.

        Anche riaprendo quella porta non sarebbe andata bene: `getPublicUrl`
        restituiva l'intero **data URL** in base64, cioe un PDF intero dentro
        `medical_certificates.file_url`, e al ricaricamento della pagina il
        ripiego puntava di nuovo alla stessa rotta chiusa.

        Attachment Core e la strada che il repository ha gia (ADR-0034): i byte
        stanno in `attachment_blobs`, il record porta un riferimento di poche
        decine di caratteri, e la lettura passa da
        `GET /api/v1/attachments/:id`, che sul genere «certificato medico»
        pretende `clinical.read`. La categoria e percio `medical_certificate` e
        non una stringa qualunque: e quella che accende la guardia.
      */
      let fileUrl = String(certificate?.fileUrl || "");

      if (selectedFile) {
        /*
          **Sostituzione allo stesso id quando il file c'e gia.**

          Cosi il riferimento salvato sulla riga non cambia, e non esiste
          l'istante in cui `medical_certificates.file_url` punta a un allegato
          che non c'e piu. E la stessa scelta di `CertificateAttachmentField`.
        */
        const source = resolveAttachmentSource(fileUrl);

        const uploadResult =
          source.kind === "reference"
            ? await replaceAttachment(source.id, selectedFile, selectedFile.name)
            : await uploadAttachment({
                file: selectedFile,
                ownerType: "athlete",
                ownerId: formData.athleteId,
                category: "medical_certificate",
                fileName: selectedFile.name,
                organizationId: clubId,
              });

        if (!uploadResult.ok) {
          showToast("error", uploadResult.message);
          return;
        }

        if (source.kind !== "reference") {
          fileUrl = uploadResult.attachment.reference;
        }
      }

      const selectedAthlete = localAthletes.find(
        (athlete) => athlete.id === formData.athleteId,
      );

      const submitResult = await onSubmit({
        ...formData,
        id: certificate?.id || undefined,
        athleteName: selectedAthlete?.name || "Atleta",
        fileUrl,
        fileName: selectedFile?.name || "",
        organizationId: clubId,
      });

      if (submitResult === false) {
        return;
      }

      setFormData(buildInitialForm());
      setExpiryManuallyEdited(false);
      setSelectedFile(null);
      setSearchQuery("");
      setFilteredAthletes(localAthletes);
      setTouched(false);
      onClose();
    } catch (error) {
      console.error("Error uploading certificate file:", error);
      showToast("error", "Errore nel caricamento del file del certificato");
    } finally {
      setIsSubmitting(false);
    }
  };

  const description = isEditing
    ? "Correggi i dati del certificato, o sostituiscine il file"
    : "Inserisci i dettagli del certificato medico";

  const body = (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="athleteId">Atleta</Label>
        <div className="relative">
          {isAthleteLocked ? (
            <div className="h-10 rounded-egw-control border border-input bg-muted px-3 py-2 text-sm text-muted-foreground">
              {athleteName ||
                localAthletes.find((item) => item.id === athleteId)?.name ||
                "Atleta selezionato"}
            </div>
          ) : (
            <>
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
                className="w-full h-10 rounded-egw-control border border-input bg-background px-3 py-2 text-sm ring-offset-background"
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
            </>
          )}
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
          className="w-full h-10 rounded-egw-control border border-input bg-background px-3 py-2 text-sm ring-offset-background"
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
          <div className="flex flex-col gap-2 text-xs text-muted-foreground">
            <p>
              {expiryManuallyEdited
                ? "Scadenza modificata manualmente."
                : "Impostata automaticamente a un anno dalla data di emissione. Puoi modificarla manualmente."}
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-fit"
              onClick={() => {
                setFormData((prev) => ({
                  ...prev,
                  expiryDate: addOneYear(prev.issueDate),
                }));
                setExpiryManuallyEdited(false);
              }}
              disabled={!formData.issueDate}
            >
              Ricalcola da emissione
            </Button>
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="fileUrl">
          {hasExistingFile ? "Sostituisci File" : "Carica File *"}
        </Label>
        <Input
          id="fileUrl"
          name="fileUrl"
          type="file"
          required={!hasExistingFile}
          onChange={(e) => {
            setSelectedFile(e.target.files?.[0] || null);
            setTouched(true);
          }}
        />
        {selectedFile ? (
          <p className="text-sm text-muted-foreground">
            File selezionato: {selectedFile.name}
          </p>
        ) : hasExistingFile ? (
          <p className="text-sm text-muted-foreground">
            Un file e gia allegato. Sceglierne uno nuovo lo sostituisce;
            lasciando vuoto resta quello.
          </p>
        ) : null}
      </div>
    </form>
  );

  if (presentation === "drawer") {
    /*
      Il cassetto del Web V2 (guideline 06 §6.7): stesso modulo, stesse
      validazioni, con la guardia sulle modifiche non salvate e il piede
      con un solo primario. Le parole sono quelle del design: «Registra
      certificato», non «Carica».
    */
    return (
      <Drawer
        open={isOpen}
        onOpenChange={(open) => {
          if (!open) onClose();
        }}
        width="default"
        eyebrow="Certificati medici"
        title={isEditing ? "Modifica certificato" : "Registra certificato"}
        description={description}
        dirty={touched || Boolean(selectedFile)}
        locked={isSubmitting}
        data-test="medical-certificate-drawer"
        footer={
          <>
            <WebButton
              variant="primary"
              onClick={handleSubmit}
              loading={isSubmitting}
              disabled={isSubmitting}
            >
              {isEditing ? "Salva modifiche" : "Salva"}
            </WebButton>
            <WebButton variant="secondary" onClick={onClose} disabled={isSubmitting}>
              Annulla
            </WebButton>
          </>
        }
      >
        {body}
      </Drawer>
    );
  }

  return (
    <Modal
      title={isEditing ? "Modifica Certificato" : "Carica Nuovo Certificato"}
      description={description}
      isOpen={isOpen}
      onClose={onClose}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Annulla
          </Button>
          <Button
            onClick={handleSubmit}
            className="bg-egw-blue hover:bg-egw-blue-700"
            disabled={isSubmitting}
          >
            {isSubmitting ? "Salvataggio..." : isEditing ? "Salva modifiche" : "Salva"}
          </Button>
        </div>
      }
    >
      {body}
    </Modal>
  );
}
