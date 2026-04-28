"use client";

import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { useTrainerDashboard } from "@/components/trainer/trainer-dashboard-context";
import TrainerAthleteTechnicalDialog from "@/components/trainer/TrainerAthleteTechnicalDialog";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  getAthleteDisplayName,
  getAthleteMedicalExpiry,
  SectionBlockedState,
  SectionEmptyState,
  formatDate,
} from "@/components/trainer/trainer-dashboard-shared";

export default function TrainerAthletesPage() {
  const { assignedAthletes, permissions } = useTrainerDashboard();
  const [selectedAthlete, setSelectedAthlete] = useState<any | null>(null);

  if (!permissions.navigation.athletes) {
    return <SectionBlockedState section="athletes" />;
  }

  if (assignedAthletes.length === 0) {
    return (
      <SectionEmptyState
        title="Nessun atleta assegnato"
        description="Questa pagina mostra solo gli atleti appartenenti alle categorie collegate al trainer."
      />
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
          Atleti
        </h1>
        <p className="text-gray-600 mt-2">
          Vedi tutti gli atleti delle categorie assegnate e apri la loro scheda tecnica in base ai permessi del club.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="bg-white shadow-md border-0 overflow-hidden">
          <div className="h-1 w-full bg-gradient-to-r from-blue-500 to-blue-600"></div>
          <CardContent className="p-6">
            <p className="text-sm font-medium text-muted-foreground">Atleti visibili</p>
            <p className="mt-2 text-3xl font-bold">{assignedAthletes.length}</p>
          </CardContent>
        </Card>
        <Card className="bg-white shadow-md border-0 overflow-hidden">
          <div className="h-1 w-full bg-gradient-to-r from-emerald-500 to-emerald-600"></div>
          <CardContent className="p-6">
            <p className="text-sm font-medium text-muted-foreground">Scheda tecnica</p>
            <p className="mt-2 text-sm font-semibold text-slate-700">
              {permissions.actions.viewAthleteTechnicalSheet ? "Abilitata" : "Disabilitata"}
            </p>
          </CardContent>
        </Card>
        <Card className="bg-white shadow-md border-0 overflow-hidden">
          <div className="h-1 w-full bg-gradient-to-r from-purple-500 to-purple-600"></div>
          <CardContent className="p-6">
            <p className="text-sm font-medium text-muted-foreground">Dati sensibili</p>
            <p className="mt-2 text-sm font-semibold text-slate-700">
              {permissions.actions.viewEnrollmentAndPayments
                ? "Iscrizione e pagamenti visibili"
                : "Iscrizione e pagamenti oscurati"}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className="rounded-[30px] border-white/80 bg-white/90 shadow-sm">
        <CardContent className="flex flex-col gap-3 p-6 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-600">
              Roster del trainer
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-slate-900">
              Atleti visibili dal tuo account
            </h2>
            <p className="mt-2 text-sm text-slate-500">
              I dati esposti qui rispettano i permessi impostati dal club.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge className="border-slate-200 bg-slate-100 text-slate-700 hover:bg-slate-100">
              {assignedAthletes.length} atleti
            </Badge>
            {permissions.actions.viewMedicalStatus ? (
              <Badge className="border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-50">
                Stato medico visibile
              </Badge>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <Card className="bg-white shadow-md border-0 overflow-hidden">
        <div className="h-1 w-full bg-gradient-to-r from-blue-500 to-purple-600"></div>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="px-4 py-3">Atleta</TableHead>
                <TableHead className="px-4 py-3">Categoria</TableHead>
                <TableHead className="px-4 py-3">Contatti</TableHead>
                <TableHead className="px-4 py-3">Certificato</TableHead>
                <TableHead className="px-4 py-3 text-right">Azioni</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {assignedAthletes.map((athlete) => (
                <TableRow key={athlete.id}>
                  <TableCell className="px-4 py-4 font-medium">
                    {getAthleteDisplayName(athlete)}
                  </TableCell>
                  <TableCell className="px-4 py-4">
                    {athlete?.category_name || athlete?.data?.categoryName || "-"}
                  </TableCell>
                  <TableCell className="px-4 py-4">
                    {permissions.actions.viewAthleteContacts
                      ? athlete?.data?.phone || athlete?.phone || athlete?.data?.email || "-"
                      : "Nascosti"}
                  </TableCell>
                  <TableCell className="px-4 py-4">
                    {permissions.actions.viewMedicalStatus
                      ? getAthleteMedicalExpiry(athlete)
                        ? formatDate(getAthleteMedicalExpiry(athlete))
                        : "Non registrato"
                      : "Nascosto"}
                  </TableCell>
                  <TableCell className="px-4 py-4 text-right">
                    {permissions.actions.viewAthleteTechnicalSheet ? (
                      <Button
                        size="sm"
                        className="bg-blue-600 hover:bg-blue-700"
                        onClick={() => setSelectedAthlete(athlete)}
                      >
                        Scheda tecnica
                      </Button>
                    ) : (
                      <Badge className="border-slate-200 bg-slate-100 text-slate-600 hover:bg-slate-100">
                        Consultazione base
                      </Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <TrainerAthleteTechnicalDialog
        athlete={selectedAthlete}
        isOpen={Boolean(selectedAthlete)}
        onClose={() => setSelectedAthlete(null)}
        permissions={permissions}
      />
    </div>
  );
}
