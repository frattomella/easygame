"use client";

import React, { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import Sidebar from "@/components/dashboard/Sidebar";
import Header from "@/components/dashboard/Header";
import {
  DashboardPageContainer,
  dashboardMainClassName,
} from "@/components/dashboard/dashboard-page-container";
import { SharedPageHeader } from "@/components/dashboard/shared-page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast-notification";
import { useAuth } from "@/components/providers/AuthProvider";
import { AthleteCreateForm } from "@/components/forms/AthleteCreateForm";
import { findCategoryForBirthDate } from "@/lib/category-utils";
import { addClubAthlete, getClubCategories } from "@/lib/simplified-db";
import { sortByName } from "@/lib/sorting";

/**
 * Iscrivere un atleta: **una pagina**, come per allenatori e soci (ADR-0057).
 *
 * **Perche non una finestra.** Il modulo di iscrizione e il piu lungo che una
 * segreteria compila — anagrafica, codice fiscale, residenza, contatti,
 * genitori, tesseramento, taglie. Dentro una finestra scorreva in un riquadro
 * dentro una pagina che scorre a sua volta, a 375 px non aveva dove stare, e
 * un clic fuori lo chiudeva portandosi via cio che era stato scritto.
 * Allenatori e soci avevano gia la loro pagina: l'atleta, che ha piu campi di
 * entrambi, era rimasto l'unico in una finestra.
 *
 * La pagina non contiene logica di dominio: monta il modulo, scrive con
 * `addClubAthlete` e porta alla scheda appena creata — che e il gesto
 * successivo naturale, invece di riportare a un elenco dove cercarla.
 */

function NewAthletePageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { showToast } = useToast();
  const { user, activeClub } = useAuth();

  const clubIdFromUrl = searchParams?.get("clubId");
  const [clubId, setClubId] = React.useState<string | null>(
    clubIdFromUrl || null,
  );
  const [categories, setCategories] = React.useState<any[]>([]);

  React.useEffect(() => {
    if (clubIdFromUrl && clubIdFromUrl !== "null") {
      setClubId(clubIdFromUrl);
      return;
    }

    if (activeClub?.id) {
      setClubId(activeClub.id);
      return;
    }

    if (typeof window === "undefined") return;

    const stored = window.localStorage.getItem("activeClub");
    if (!stored) return;

    try {
      const parsed = JSON.parse(stored);
      if (parsed?.id) setClubId(parsed.id);
    } catch {
      // Un `activeClub` illeggibile non e un errore da mostrare: la pagina
      // dice comunque che serve scegliere un club.
    }
  }, [clubIdFromUrl, activeClub]);

  React.useEffect(() => {
    if (!clubId) return;
    let cancelled = false;

    void getClubCategories(clubId).then((rows: any) => {
      if (cancelled) return;
      setCategories(
        sortByName(Array.isArray(rows) ? rows : [], (row: any) => row?.name),
      );
    });

    return () => {
      cancelled = true;
    };
  }, [clubId]);

  const backHref = clubId ? `/athletes?clubId=${clubId}` : "/athletes";

  const handleSubmit = async (draft: any) => {
    if (!clubId || !user) {
      showToast("error", "Club o utente non trovato");
      return false;
    }

    try {
      const linkedCategory =
        categories.find((category) => category.id === draft.categoryId) ||
        findCategoryForBirthDate(draft.birthDate, categories);

      const secondaryIds: string[] = Array.isArray(draft.secondaryCategoryIds)
        ? draft.secondaryCategoryIds
        : [];

      /*
        Le appartenenze si scrivono alla creazione, primaria e secondarie: un
        atleta che si allena con due gruppi lo fa dal primo giorno, e finora la
        seconda si poteva aggiungere solo riaprendo la scheda.
      */
      const categoryMemberships = [
        ...(linkedCategory
          ? [
              {
                category_id: linkedCategory.id,
                category_name: linkedCategory.name,
                is_primary: true,
              },
            ]
          : []),
        ...secondaryIds
          .filter((id) => id && id !== linkedCategory?.id)
          .map((id) => {
            const category = categories.find((item) => item.id === id);
            return {
              category_id: id,
              category_name: category?.name || id,
              is_primary: false,
            };
          }),
      ];

      const saved = await addClubAthlete(clubId, {
        firstName: draft.firstName,
        lastName: draft.lastName,
        birthDate: draft.birthDate,
        category: linkedCategory?.id || null,
        categoryName: linkedCategory?.name || null,
        medicalCertExpiry: draft.medicalCertExpiry || null,
        status: "active",
        data: draft.data || {},
        ...(categoryMemberships.length ? { categoryMemberships } : {}),
      });

      showToast(
        "success",
        `Atleta ${draft.firstName} ${draft.lastName} iscritto con successo`,
      );

      /*
        Si va sulla scheda appena creata: chi ha appena iscritto un atleta
        quasi sempre continua da li — piano di pagamento, certificato,
        documenti — e riportarlo all'elenco lo costringerebbe a ritrovarlo.
      */
      router.push(saved?.id ? `/athletes/${saved.id}` : backHref);
      return true;
    } catch (error) {
      console.error("Error creating athlete:", error);
      showToast("error", "Errore durante la creazione dell'atleta");
      return false;
    }
  };

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50">
      <div className="hidden md:block">
        <Sidebar />
      </div>

      <div className="flex flex-1 flex-col">
        <Header title="Nuovo Atleta" />

        <main className={dashboardMainClassName}>
          <DashboardPageContainer className="max-w-5xl">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex min-w-0 items-center gap-4">
                <Button
                  variant="ghost"
                  size="icon"
                  className="rounded-full"
                  aria-label="Torna agli atleti"
                  onClick={() => router.push(backHref)}
                >
                  <ArrowLeft className="h-5 w-5" />
                </Button>
                <SharedPageHeader
                  title="Nuovo Atleta"
                  subtitle="Obbligatori nome, cognome e data di nascita. Il resto si puo compilare ora o dopo."
                  className="flex-1"
                />
              </div>

              <Button
                type="submit"
                form="athlete-create-form"
                disabled={!clubId}
                className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 sm:w-auto"
              >
                Salva Atleta
              </Button>
            </div>

            {!clubId ? (
              <Card className="border-amber-200 bg-amber-50">
                <CardContent className="py-6 text-amber-900">
                  Seleziona prima un club dalla tua area account, poi torna qui
                  per iscrivere il nuovo atleta.
                </CardContent>
              </Card>
            ) : null}

            <Card className="shadow-sm">
              <CardContent className="pt-6">
                <AthleteCreateForm
                  formId="athlete-create-form"
                  categories={categories}
                  onSubmit={handleSubmit}
                  onCancel={() => router.push(backHref)}
                />
              </CardContent>
            </Card>
          </DashboardPageContainer>
        </main>
      </div>
    </div>
  );
}

export default function NewAthletePage() {
  return (
    <Suspense fallback={null}>
      <NewAthletePageContent />
    </Suspense>
  );
}
