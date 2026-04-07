"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function AppointmentModal() {
  return (
    <Dialog open onOpenChange={() => {}}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Prenota Appuntamento</DialogTitle>
        </DialogHeader>
        <div className="p-4">
          <p className="text-sm text-gray-500 mb-4">
            Prenota un appuntamento con la segreteria del club per discutere
            questioni importanti o richiedere assistenza.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function useParentViewModals() {
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [isDocumentModalOpen, setIsDocumentModalOpen] = useState(false);
  const [isCertificateModalOpen, setIsCertificateModalOpen] = useState(false);

  const PaymentModal = ({
    isOpen,
    setIsOpen,
  }: {
    isOpen: boolean;
    setIsOpen: (open: boolean) => void;
  }) => (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Effettua un pagamento</DialogTitle>
        </DialogHeader>
        <div className="p-4">
          <p className="text-sm text-gray-500 mb-4">
            Questa funzionalità sarà disponibile a breve. Potrai effettuare
            pagamenti online per quote, eventi e altro.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );

  const DocumentModal = ({
    isOpen,
    setIsOpen,
  }: {
    isOpen: boolean;
    setIsOpen: (open: boolean) => void;
  }) => (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Documenti</DialogTitle>
        </DialogHeader>
        <div className="p-4">
          <p className="text-sm text-gray-500 mb-4">
            Nessun documento disponibile al momento. Qui potrai visualizzare e
            firmare documenti importanti.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );

  const CertificateModal = ({
    isOpen,
    setIsOpen,
  }: {
    isOpen: boolean;
    setIsOpen: (open: boolean) => void;
  }) => (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Certificato Medico</DialogTitle>
        </DialogHeader>
        <div className="p-4">
          <p className="text-sm text-gray-500 mb-4">
            Il certificato medico risulta scaduto o mancante. Carica un nuovo
            certificato per continuare a partecipare alle attività.
          </p>
          {/* Upload functionality would go here */}
        </div>
      </DialogContent>
    </Dialog>
  );

  const AppointmentModalDialog = ({
    isOpen,
    setIsOpen,
  }: {
    isOpen: boolean;
    setIsOpen: (open: boolean) => void;
  }) => (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Prenota Appuntamento</DialogTitle>
        </DialogHeader>
        <div className="p-4">
          <p className="text-sm text-gray-500 mb-4">
            Prenota un appuntamento con la segreteria del club per discutere
            questioni importanti o richiedere assistenza.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );

  return {
    isPaymentModalOpen,
    setIsPaymentModalOpen,
    isDocumentModalOpen,
    setIsDocumentModalOpen,
    isCertificateModalOpen,
    setIsCertificateModalOpen,
    PaymentModal,
    DocumentModal,
    CertificateModal,
    AppointmentModal: AppointmentModalDialog,
  };
}
