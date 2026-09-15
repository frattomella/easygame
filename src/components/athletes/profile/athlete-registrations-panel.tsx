"use client";

import React from "react";
import { Download, Eye, Pencil, Plus, Trash2 } from "lucide-react";
import { Button, IconButton } from "@/components/web/primitives/Button";
import { StatusPill } from "@/components/web/primitives/StatusPill";
import { AlertBlock } from "@/components/web/page/Alerts";
import { joinMeta } from "@/lib/web/format";
import {
  readRegistrationFederationLabel,
  type ClubFederation,
} from "@/lib/club-federations";
import { ATHLETE_RECORD_SECTIONS } from "@/lib/athlete-profile-tabs";
import {
  RecordRowList,
  RecordSection,
  dateOrMissing,
  registrationStatus,
} from "./v2/record-primitives";

/**
 * **I tesseramenti di un atleta** (N2, N4), nella forma della scheda V2.
 *
 * Come gli altri pannelli non possiede lo stato: riceve le righe e
 * restituisce le intenzioni.
 *
 * Tre regole che questo pannello mantiene.
 *
 * **«Visualizza» e «Scarica» compaiono solo se il file c'e** (N4). Il numero
 * di tessera e facoltativo di proposito (un tesseramento si registra prima che
 * la federazione emetta il numero), e l'allegato lo e altrettanto: la riga
 * **senza file e il caso ordinario**, non il limite.
 *
 * **Si puo correggere** (N4): una data sbagliata o il documento arrivato dopo
 * non costringono a cancellare e rifare.
 *
 * **L'ente si legge per identificativo** (N2), dal registro del club;
 * l'etichetta congelata sulla riga resta il ripiego per gli enti che il club
 * ha poi tolto, perche uno storico deve poter dire cosa fu vero.
 */

export type AthleteRegistration = {
  id?: string | null;
  federationId?: string | null;
  federation?: string | null;
  number?: string | null;
  status?: string | null;
  issueDate?: string | null;
  expiryDate?: string | null;
  notes?: string | null;
  fileName?: string | null;
  fileUrl?: string | null;
};

export function AthleteRegistrationsPanel({
  registrations,
  federations,
  canManage = true,
  onAdd,
  onEdit,
  onView,
  onDownload,
  onDelete,
}: {
  registrations: AthleteRegistration[];
  /** Le federazioni configurate dal club, gia risolte con il loro id. */
  federations: readonly ClubFederation[];
  canManage?: boolean;
  /** Mantenuto per compatibilita di firma: le date si formattano con il sistema. */
  formatDate?: (value: any) => string;
  onAdd: () => void;
  onEdit: (registration: AthleteRegistration) => void;
  onView: (registration: AthleteRegistration) => void;
  onDownload: (registration: AthleteRegistration) => void;
  onDelete: (registration: AthleteRegistration) => void;
}) {
  const rows = Array.isArray(registrations) ? registrations : [];

  return (
    <RecordSection
      id={ATHLETE_RECORD_SECTIONS.tesseramenti}
      eyebrow="Federazioni"
      title="Tesseramenti"
      actions={
        canManage ? (
          <Button variant="secondary" size="sm" icon={<Plus />} onClick={onAdd}>
            Aggiungi tesseramento
          </Button>
        ) : null
      }
    >
      {/*
        Nessuna federazione configurata: il club non puo tesserare nessuno, e
        dirlo qui evita che qualcuno apra la finestra per scoprire una tendina
        vuota.
      */}
      {federations.length === 0 ? (
        <AlertBlock severity="warning" title="Nessuna federazione o ente registrato nel club" className="mb-4">
          Aggiungili nella pagina Club, scheda «Federazione», prima di registrare un tesseramento.
        </AlertBlock>
      ) : null}

      <RecordRowList
        aria-label="Tesseramenti"
        rows={rows.map((registration, index) => {
          const federationLabel =
            readRegistrationFederationLabel(registration, federations) || "Ente non indicato";
          const hasFile = Boolean(String(registration.fileUrl || "").trim());

          return {
            id: String(registration.id || index),
            title: federationLabel,
            meta: joinMeta(
              registration.number ? `n. ${registration.number}` : "numero non ancora emesso",
              registration.expiryDate ? `scade ${dateOrMissing(registration.expiryDate)}` : null,
              hasFile ? null : "Nessun allegato",
            ),
            detail: registration.notes || null,
            status: <StatusPill status={registrationStatus(registration.status)} size="sm" />,
            actions: (
              <>
                {/* Le due azioni sul file compaiono **solo se il file c'e**. */}
                {hasFile ? (
                  <>
                    <IconButton aria-label={`Visualizza l'allegato del tesseramento ${federationLabel}`} onClick={() => onView(registration)}>
                      <Eye />
                    </IconButton>
                    <IconButton aria-label={`Scarica l'allegato del tesseramento ${federationLabel}`} onClick={() => onDownload(registration)}>
                      <Download />
                    </IconButton>
                  </>
                ) : null}
                {canManage ? (
                  <>
                    <IconButton aria-label={`Modifica il tesseramento ${federationLabel}`} onClick={() => onEdit(registration)}>
                      <Pencil />
                    </IconButton>
                    <IconButton aria-label={`Elimina il tesseramento ${federationLabel}`} onClick={() => onDelete(registration)}>
                      <Trash2 />
                    </IconButton>
                  </>
                ) : null}
              </>
            ),
          };
        })}
        empty="Nessun tesseramento registrato"
      />
    </RecordSection>
  );
}
