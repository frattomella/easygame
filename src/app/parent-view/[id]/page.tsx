"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/providers/AuthProvider";
import { useToast } from "@/components/ui/toast-notification";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useParentViewModals } from "./page-modals";
import { PaymentSection } from "./payment-section";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";
import { AppBackButton } from "@/components/navigation/AppBackButton";

export default function ParentViewPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id as string;
  const { user } = useAuth();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [athleteData, setAthleteData] = useState<any>(null);
  const [clubData, setClubData] = useState<any>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [filteredData, setFilteredData] = useState<any>(null);
  const {
    isPaymentModalOpen,
    setIsPaymentModalOpen,
    isDocumentModalOpen,
    setIsDocumentModalOpen,
    isCertificateModalOpen,
    setIsCertificateModalOpen,
    PaymentModal,
    DocumentModal,
    CertificateModal,
  } = useParentViewModals();

  useEffect(() => {
    if (!id || !user?.id) return;

    const loadData = async () => {
      try {
        setLoading(true);
        console.log(`Loading athlete data for athlete ${id}`);

        // Load athlete data
        const { data: athlete, error: athleteError } = await supabase
          .from("athletes")
          .select("*, organizations(*)")
          .eq("id", id)
          .single();

        if (athleteError) {
          console.error("Error loading athlete:", athleteError);
          showToast("error", "Errore nel caricamento dell'atleta");
          return;
        }

        if (!athlete) {
          console.error("Athlete not found");
          showToast("error", "Atleta non trovato");
          return;
        }

        setAthleteData(athlete);
        setFilteredData(athlete);
        console.log(`Athlete data loaded:`, athlete);

        // Set club data from the athlete's organization
        if (athlete.organizations) {
          setClubData(athlete.organizations);
        }
      } catch (err) {
        console.error("Error loading data:", err);
        showToast("error", "Errore nel caricamento dei dati");
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [id, user, showToast]);

  // Handle search functionality
  useEffect(() => {
    if (!athleteData) return;

    if (!searchQuery) {
      setFilteredData(athleteData);
      return;
    }

    // This is a simple implementation. In a real app, you might want to search
    // through more fields or implement more sophisticated search logic
    const query = searchQuery.toLowerCase();
    const matchesSearch =
      athleteData.first_name?.toLowerCase().includes(query) ||
      athleteData.last_name?.toLowerCase().includes(query) ||
      `${athleteData.first_name} ${athleteData.last_name}`
        .toLowerCase()
        .includes(query);

    if (matchesSearch) {
      setFilteredData(athleteData);
    } else {
      setFilteredData(null);
    }
  }, [searchQuery, athleteData]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-md mx-auto space-y-8 text-center">
          <div className="animate-pulse">
            <h2 className="text-2xl font-bold">Caricamento dati...</h2>
            <p className="mt-2">Attendere prego</p>
          </div>
        </div>
      </div>
    );
  }

  if (!filteredData) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-md mx-auto space-y-8 text-center">
          <h2 className="text-2xl font-bold text-red-600">Dati non trovati</h2>
          <p className="mt-2">
            {searchQuery
              ? "Nessun risultato trovato per la ricerca."
              : "I dati richiesti non esistono o non hai i permessi per accedervi."}
          </p>
          {searchQuery && (
            <Button
              variant="outline"
              onClick={() => setSearchQuery("")}
              className="mt-4"
            >
              Cancella ricerca
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <AppBackButton fallbackHref="/account" />
            <h1 className="text-xl font-semibold text-gray-900">
              Area Genitore - {clubData?.name || "Club"}
            </h1>
          </div>
          <div className="flex items-center space-x-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
              <Input
                type="search"
                placeholder="Cerca..."
                className="pl-10 w-64"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="bg-white shadow rounded-lg p-6 mb-6">
          <h2 className="text-lg font-medium mb-4">Informazioni Atleta</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-gray-500">Nome</p>
              <p className="font-medium">
                {filteredData.first_name} {filteredData.last_name}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Data di nascita</p>
              <p className="font-medium">
                {filteredData.birth_date
                  ? new Date(filteredData.birth_date).toLocaleDateString()
                  : "N/A"}
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Presenze</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-blue-600">0%</div>
              <p className="text-sm text-gray-500 mt-2">Percentuale presenze</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Certificato</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-red-600">Scaduto</div>
              <p className="text-sm text-gray-500 mt-2">
                Stato certificato medico
              </p>
              <Button
                variant="outline"
                className="mt-4"
                onClick={() => setIsCertificateModalOpen(true)}
              >
                Gestisci
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Documenti</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-yellow-600">0</div>
              <p className="text-sm text-gray-500 mt-2">Documenti da firmare</p>
              <Button
                variant="outline"
                className="mt-4"
                onClick={() => setIsDocumentModalOpen(true)}
              >
                Visualizza
              </Button>
            </CardContent>
          </Card>
        </div>

        <div className="mt-6">
          <PaymentSection
            id={id}
            openPaymentModal={() => setIsPaymentModalOpen(true)}
          />
        </div>
      </main>

      <PaymentModal
        isOpen={isPaymentModalOpen}
        setIsOpen={setIsPaymentModalOpen}
      />
      <DocumentModal
        isOpen={isDocumentModalOpen}
        setIsOpen={setIsDocumentModalOpen}
      />
      <CertificateModal
        isOpen={isCertificateModalOpen}
        setIsOpen={setIsCertificateModalOpen}
      />
    </div>
  );
}
