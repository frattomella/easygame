"use client";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDate, getAthleteDisplayName, getAthleteMedicalExpiry } from "@/components/trainer/trainer-dashboard-shared";
import { type TrainerDashboardPermissions } from "@/lib/trainer-dashboard-permissions";

function InfoRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
        {label}
      </p>
      <p className="mt-2 text-sm font-medium text-slate-700">{value || "-"}</p>
    </div>
  );
}

export default function TrainerAthleteTechnicalDialog({
  athlete,
  isOpen,
  onClose,
  permissions,
}: {
  athlete: any | null;
  isOpen: boolean;
  onClose: () => void;
  permissions: TrainerDashboardPermissions;
}) {
  if (!athlete) {
    return null;
  }

  const data = athlete?.data || {};
  const canViewDetails = permissions.actions.viewAthleteDetails;
  const canViewContacts = permissions.actions.viewAthleteContacts;
  const canViewMedical = permissions.actions.viewMedicalStatus;
  const canViewEnrollment = permissions.actions.viewEnrollmentAndPayments;
  const canViewTechnical = permissions.actions.viewAthleteTechnicalSheet;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-5xl rounded-3xl border border-slate-200 bg-white">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold text-slate-900">
            {getAthleteDisplayName(athlete)}
          </DialogTitle>
          <div className="flex flex-wrap gap-2 pt-2">
            <Badge className="border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-50">
              {athlete?.category_name || data?.categoryName || "Senza categoria"}
            </Badge>
            {canViewMedical ? (
              <Badge className="border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-50">
                Certificato{" "}
                {getAthleteMedicalExpiry(athlete)
                  ? formatDate(getAthleteMedicalExpiry(athlete))
                  : "non registrato"}
              </Badge>
            ) : null}
          </div>
        </DialogHeader>

        <Tabs defaultValue="overview" className="mt-2">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="overview">Panoramica</TabsTrigger>
            <TabsTrigger value="technical" disabled={!canViewTechnical}>
              Tecnica
            </TabsTrigger>
            <TabsTrigger value="medical" disabled={!canViewMedical}>
              Medico
            </TabsTrigger>
            <TabsTrigger value="enrollment" disabled={!canViewEnrollment}>
              Iscrizione
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4 pt-4">
            <Card className="border-slate-200 shadow-none">
              <CardHeader>
                <CardTitle className="text-lg">Dati atleta</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {canViewDetails ? (
                  <>
                    <InfoRow
                      label="Data di nascita"
                      value={
                        athlete?.birth_date
                          ? formatDate(athlete.birth_date)
                          : data?.birthDate
                            ? formatDate(data.birthDate)
                            : "-"
                      }
                    />
                    <InfoRow label="Luogo di nascita" value={data?.birthPlace || "-"} />
                    <InfoRow label="Codice fiscale" value={data?.fiscalCode || "-"} />
                    <InfoRow label="Nazionalità" value={data?.nationality || "-"} />
                    <InfoRow label="Comune" value={data?.city || "-"} />
                    <InfoRow label="Indirizzo" value={data?.address || "-"} />
                  </>
                ) : (
                  <InfoRow
                    label="Profilo"
                    value="La visualizzazione dei dati anagrafici è limitata dai permessi del club."
                  />
                )}

                {canViewContacts ? (
                  <>
                    <InfoRow label="Telefono" value={data?.phone || athlete?.phone || "-"} />
                    <InfoRow label="Email" value={data?.email || athlete?.email || "-"} />
                    <InfoRow
                      label="Contatto emergenza"
                      value={data?.emergencyPhone || data?.emergencyContact || "-"}
                    />
                  </>
                ) : null}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="technical" className="space-y-4 pt-4">
            <Card className="border-slate-200 shadow-none">
              <CardHeader>
                <CardTitle className="text-lg">Scheda tecnica</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                <InfoRow
                  label="Categoria"
                  value={athlete?.category_name || data?.categoryName || "-"}
                />
                <InfoRow label="Numero maglia" value={athlete?.jersey_number || data?.jerseyNumber || "-"} />
                <InfoRow label="Gruppo taglie" value={data?.clothingProfile || "-"} />
                <InfoRow label="Taglia maglia" value={data?.shirtSize || "-"} />
                <InfoRow label="Taglia pantaloni" value={data?.pantsSize || "-"} />
                <InfoRow label="Taglia scarpe" value={data?.shoeSize || "-"} />
                <InfoRow label="Note tecniche" value={data?.notes || "-"} />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="medical" className="space-y-4 pt-4">
            <Card className="border-slate-200 shadow-none">
              <CardHeader>
                <CardTitle className="text-lg">Area medica</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                <InfoRow
                  label="Certificato"
                  value={
                    getAthleteMedicalExpiry(athlete)
                      ? formatDate(getAthleteMedicalExpiry(athlete))
                      : "Non registrato"
                  }
                />
                <InfoRow label="Gruppo sanguigno" value={data?.bloodType || "-"} />
                <InfoRow label="Allergie" value={data?.allergies || "-"} />
                <InfoRow label="Patologie" value={data?.chronicDiseases || "-"} />
                <InfoRow label="Farmaci" value={data?.medications || "-"} />
                <InfoRow label="BLSD / Primo soccorso" value={`${data?.blsd ? "BLSD" : ""}${data?.firstAid ? " Primo soccorso" : ""}`.trim() || "-"} />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="enrollment" className="space-y-4 pt-4">
            <Card className="border-slate-200 shadow-none">
              <CardHeader>
                <CardTitle className="text-lg">Iscrizione e pagamenti</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                <InfoRow label="Stato iscrizione" value={data?.enrollmentStatus ? "Attiva" : "Non definita"} />
                <InfoRow label="Piano selezionato" value={data?.selectedPlan || "-"} />
                <InfoRow label="Sconto" value={data?.discount || "-"} />
                <InfoRow
                  label="Pagamenti registrati"
                  value={Array.isArray(data?.payments) ? String(data.payments.length) : "0"}
                />
                <InfoRow
                  label="Tesseramenti"
                  value={Array.isArray(data?.registrations) ? String(data.registrations.length) : "0"}
                />
                <InfoRow label="Note iscrizione" value={data?.enrollmentNotes || "-"} />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
