"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import {
  removeMemberProfile,
  updateMemberProfile,
} from "@/lib/members/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Plus,
  Users,
  Mail,
  Phone,
  Calendar,
  Edit,
  Trash2,
  LayoutGrid,
  Table as TableIcon,
  Settings2,
  UserCheck,
  UserX,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  BulkSelectionToolbar,
  SelectAllCheckbox,
  SelectRowCheckbox,
  useListSelection,
} from "@/components/ui/list-selection";
import {
  availableExportScopes,
  exportScopeLabel,
  resolveScopeRows,
  type SelectionScope,
} from "@/lib/list-selection";
import { MEMBER_TYPES, normalizeMemberType } from "@/lib/member-types";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import Sidebar from "@/components/dashboard/Sidebar";
import Header from "@/components/dashboard/Header";
import { MobileTopBar } from "@/components/layout/MobileTopBar";
import {
  DashboardPageContainer,
  dashboardMainClassName,
} from "@/components/dashboard/dashboard-page-container";
import { SharedPageHeader } from "@/components/dashboard/shared-page-header";
import { useAuth } from "@/components/providers/AuthProvider";
import {
  comparePeopleByLastName,
  formatPersonNameLastFirst,
} from "@/lib/athlete-name-utils";
import { EntityIcon } from "@/components/ui/entity-icon";
import { exportPeopleCsv, exportPeoplePdf } from "@/lib/person-export";
import { fetchMembershipRegister } from "@/lib/members/client";
import { MEMBERSHIP_REGISTER_DISCLAIMER } from "@/lib/members/model";
import { useToast } from "@/components/ui/toast-notification";
import { FileDown, FileSpreadsheet } from "lucide-react";

interface Socio {
  id: string;
  name: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  membership_date?: string;
  membership_start?: string;
  is_active?: boolean;
  status?: string;
  role?: string;
  /** Ordinario, sostenitore, onorario: l'elenco sta in `lib/member-types.ts`. */
  type?: string;
  /*
    Il libro soci (Wave 4, §19). Sono campi **derivati** dagli eventi, non
    scritti in anagrafica: arrivano dal registro e servono all'elenco e
    all'export. `inRegister` distingue «non e socio» da «non e ancora nel
    libro», che per un club che parte adesso sono due cose molto diverse.
  */
  membershipStatus?: string;
  membershipNumber?: string;
  admissionDate?: string;
  cessationDate?: string;
  cessationReason?: string;
  isMemberNow?: boolean;
  inRegister?: boolean;
}

const getSocioIdentity = (member: Record<string, any>) => {
  const sanitizeText = (value: any) => {
    const trimmed = String(value ?? "").trim();
    return trimmed.toLowerCase() === "undefined undefined" ? "" : trimmed;
  };
  const firstName = String(
    member?.firstName ?? member?.first_name ?? "",
  ).trim();
  const lastName = String(
    member?.lastName ?? member?.last_name ?? member?.surname ?? "",
  ).trim();
  const explicitFullName = sanitizeText(
    member?.fullName ?? member?.full_name ?? member?.name,
  );
  const fullName =
    formatPersonNameLastFirst({
      first_name: firstName,
      last_name: lastName,
      name: explicitFullName,
      fullName: explicitFullName,
    }) || explicitFullName;

  return {
    firstName,
    lastName,
    fullName,
  };
};

const isRegisteredSocio = (member: Record<string, any>) => {
  const identity = getSocioIdentity(member);

  return Boolean(
    identity.fullName ||
      member?.membershipDate ||
      member?.registrationDate ||
      member?.email ||
      member?.phone ||
      member?.fiscalCode,
  );
};

/**
 * Lo stato di un socio in elenco.
 *
 * **Perche non e piu il flag dell'anagrafica.** «Attivo» in `clubs.members` e
 * un interruttore che qualcuno ha premuto; la qualifica di socio si **ricava**
 * dagli eventi del libro, e sa dire anche da quando. Dove il libro parla, si
 * mostra il libro.
 *
 * **Perche il flag resta quando il libro tace.** Un club che apre il libro
 * adesso ha centinaia di schede senza nessun evento: dire «Non socio» a tutte
 * sarebbe falso quanto dire «Attivo» a chi si e dimesso. Si dichiara che quella
 * persona non e ancora nel libro, che e cio che c'e da fare.
 */
const MembershipStatusBadge = ({ socio }: { socio: Socio }) => {
  if (socio.inRegister) {
    return (
      <Badge
        variant={socio.isMemberNow ? "default" : "outline"}
        className={
          socio.isMemberNow
            ? "bg-green-100 text-green-800 border-green-200"
            : "bg-amber-100 text-amber-900 border-amber-200"
        }
      >
        {socio.membershipStatus}
      </Badge>
    );
  }

  return (
    <Badge
      variant="outline"
      className="bg-gray-100 text-gray-800 border-gray-200"
      title="Non ancora registrato nel libro soci"
    >
      {socio.is_active || socio.status === "active"
        ? "Scheda attiva"
        : "Scheda non attiva"}
    </Badge>
  );
};

export default function SociPage() {
  const router = useRouter();
  const { activeClub } = useAuth();
  const { showToast } = useToast();
  const [soci, setSoci] = useState<Socio[]>([]);
  const [loading, setLoading] = useState(true);
  const [clubId, setClubId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"cards" | "table">("table");
  const [bulkBusy, setBulkBusy] = useState(false);
  const selection = useListSelection();
  /**
   * Gli ambiti di export che hanno senso adesso (RC Fix 2, punto 10).
   *
   * L'elenco Soci non ha filtri: «risultato filtrato» sarebbe una seconda
   * voce «tutti» con un altro nome, e infatti `availableExportScopes` non la
   * offre. Restano «selezionati» — quando una selezione c'e — e «tutti».
   */
  const exportScopes = availableExportScopes({
    selectedCount: selection.count,
    filteredCount: soci.length,
    totalCount: soci.length,
  });

  const rowsForScope = (scope: SelectionScope) =>
    resolveScopeRows({
      scope,
      rows: soci,
      filteredRows: soci,
      selectedIds: selection.selectedIds,
      idOf: (socio) => String(socio.id),
    });

  /**
   * Export PDF, con lo stesso motore dell'elenco Atleti.
   *
   * Non e una seconda implementazione: `printPeoplePdf` prende colonne e
   * righe e non sa di che entita si tratti (Blocco 7, punto 13).
   */
  const handleExportPdf = (scope: SelectionScope) => {
    const people = rowsForScope(scope);
    const result = exportPeoplePdf({
      entity: "members",
      people: people as unknown as Record<string, any>[],
      clubName: activeClub?.name || "EasyGame",
      visibleColumns,
      scope,
    });

    if (!result.ok) {
      showToast(
        "error",
        result.reason === "empty"
          ? "Nessun socio da esportare"
          : "Consenti i popup per generare il PDF",
      );
      return;
    }

    showToast("success", "PDF pronto: si apre la finestra di stampa");
  };

  /**
   * Lo stesso elenco in CSV: stesse colonne visibili, stessi valori.
   *
   * Il tracciato appartiene a `src/lib/csv.ts`, non a questa pagina.
   */
  const handleExportCsv = (scope: SelectionScope) => {
    const result = exportPeopleCsv({
      entity: "members",
      people: rowsForScope(scope) as unknown as Record<string, any>[],
      clubName: activeClub?.name || "EasyGame",
      visibleColumns,
      scope,
    });

    if (!result.ok) {
      showToast("error", "Nessun socio da esportare");
      return;
    }

    showToast("success", "CSV scaricato");
  };

  const [visibleColumns, setVisibleColumns] = useState({
    name: true,
    email: true,
    phone: true,
    membershipDate: true,
    status: true,
  });

  useEffect(() => {
    // Get clubId from auth context first, then localStorage as fallback
    if (activeClub?.id) {
      setClubId(activeClub.id);
      return;
    }

    if (typeof window !== "undefined") {
      const storedClub = localStorage.getItem("activeClub");
      if (storedClub) {
        try {
          const parsed = JSON.parse(storedClub);
          if (parsed?.id) {
            setClubId(parsed.id);
          }
        } catch (e) {
          console.error("Error parsing activeClub from localStorage", e);
        }
      }
    }
  }, [activeClub]);

  const fetchSoci = React.useCallback(
    async () => {
      // Don't query if clubId is not set or is invalid
      if (!clubId || clubId === "null" || clubId === "undefined") {
        setLoading(false);
        setSoci([]);
        return;
      }

      setLoading(true);

      try {
        // Fetch soci data from clubs.members JSONB column
        const { data, error } = await supabase
          .from("clubs")
          .select("members")
          .eq("id", clubId)
          .single();

        if (error) {
          console.error("Error fetching soci:", error);
          setSoci([]);
          return;
        }

        // Extract members array from the JSONB column
        const members = data?.members || [];

        // Transform data to match expected format
        const transformedData = members
          .filter((member: any) => isRegisteredSocio(member))
          .map((member: any) => {
            const identity = getSocioIdentity(member);

            return {
              id: member.id,
              name: identity.fullName || "Socio",
              firstName: identity.firstName,
              lastName: identity.lastName,
              email: member.email || "",
              phone: member.phone || "",
              role: member.role || "socio",
              type: normalizeMemberType(member.type),
              status: member.status || "active",
              is_active: member.status === "active",
              membership_start:
                member.membershipDate || member.registrationDate || "",
              membership_date:
                member.membershipDate || member.registrationDate || "",
              club_id: clubId,
            };
          })
          .sort(comparePeopleByLastName);

        /*
          Il libro soci, accanto all'anagrafica (Wave 4, §19).

          Sono due letture perche sono due cose: l'anagrafica dice chi c'e, il
          registro dice **chi e socio**, e lo dice derivandolo dagli eventi.
          Se il registro non e leggibile — un ruolo che non ha il permesso, un
          club che non ha ancora nessun evento — l'elenco resta quello di
          prima invece di sparire.
        */
        const { data: libro } = await fetchMembershipRegister({ clubId });
        const perSocio = new Map(
          (libro?.rows || []).map((riga) => [String(riga.memberId), riga]),
        );

        const conLibro = transformedData.map((socio: Socio) => {
          const riga = perSocio.get(String(socio.id));
          if (!riga) return socio;

          return {
            ...socio,
            membershipStatus: riga.eventCount > 0 ? riga.status.label : "",
            membershipNumber: riga.status.membershipNumber || "",
            admissionDate: riga.status.admittedOn || "",
            cessationDate: riga.status.endedOn || "",
            cessationReason: riga.status.endedOn ? riga.status.reason || "" : "",
            isMemberNow: riga.status.isMember,
            inRegister: riga.eventCount > 0,
          };
        });

        setSoci(conLibro);
        // Un id selezionato che non esiste piu mostrerebbe un conteggio che
        // non corrisponde a niente.
        selection.prune(conLibro.map((socio: Socio) => String(socio.id)));
      } catch (error) {
        console.error("Error fetching soci:", error);
        setSoci([]);
      } finally {
        setLoading(false);
      }
    },
    // `selection` cambia a ogni spunta: fra le dipendenze rileggerebbe
    // l'elenco a ogni casella premuta.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [clubId],
  );

  useEffect(() => {
    void fetchSoci();
  }, [fetchSoci]);

  /**
   * Scrive la stessa modifica su ogni socio selezionato.
   *
   * I soci vivono in un unico array JSONB (`clubs.members`): la modifica di
   * massa e **una sola scrittura**, non una per riga. Non e
   * un'ottimizzazione, e cio che la rende indivisibile — dieci scritture
   * separate possono fermarsi alla settima e lasciare l'elenco a meta.
   *
   * Si rilegge l'array dal server invece di ricostruirlo da cio che la
   * schermata mostra: l'elenco visualizzato e una **proiezione** (nomi
   * ricomposti, stato derivato), e riscriverlo cancellerebbe tutti i campi
   * che la proiezione non porta con se.
   */
  const applyToSelection = async (
    updatesFor: (member: Record<string, any>) => Record<string, any>,
    successMessage: (count: number) => string,
  ) => {
    if (!clubId || bulkBusy) return;

    const targetIds = new Set(rowsForScope("selected").map((s) => String(s.id)));
    if (!targetIds.size) return;

    setBulkBusy(true);
    try {
      /*
        **Un socio alla volta, anche quando sono venti.**

        Questa azione rileggeva `clubs.members` intera, cambiava gli elementi
        selezionati e risalvava l'array. E la riscrittura di massa che il
        registro generico non accetta piu — perche una sonda di concorrenza le
        ha fatto perdere un socio appena ammesso — e questa era l'ultima
        superficie che ancora la tentava, tramite l'adapter `supabase`.

        Venti richieste invece di una sono venti scritture di **una riga**,
        ognuna sotto il `FOR UPDATE` del club: chi ammette un socio nello stesso
        momento si mette in fila invece di sparire.
      */
      const bersagli = rowsForScope("selected");
      const esiti = await Promise.all(
        bersagli.map((socio) =>
          updateMemberProfile({
            clubId,
            memberId: String(socio.id),
            updates: updatesFor(socio),
          }),
        ),
      );

      const falliti = esiti.filter((esito) => esito.error);
      if (falliti.length) {
        throw new Error(
          falliti[0].error?.message ||
            `${falliti.length} soci non sono stati aggiornati`,
        );
      }

      await fetchSoci();
      showToast("success", successMessage(targetIds.size));
    } catch (error) {
      console.error("Error running bulk member action:", error);
      showToast("error", "Operazione non riuscita");
    } finally {
      setBulkBusy(false);
    }
  };

  const setSelectionStatus = (status: "active" | "inactive") =>
    applyToSelection(
      () => ({ status }),
      (count) =>
        `${count} soci ${status === "active" ? "attivati" : "disattivati"}`,
    );

  /**
   * Il tipo di socio e **uno solo**: qui si sostituisce, non si aggiunge.
   * L'elenco dei tipi e quello di `src/lib/member-types.ts`, lo stesso della
   * scheda: inventarne uno qui vorrebbe dire avere due elenchi.
   */
  const setSelectionType = (type: string) =>
    applyToSelection(
      () => ({ type }),
      (count) => `${count} soci impostati come ${type}`,
    );

  const handleDelete = async (socioId: string) => {
    if (!confirm("Sei sicuro di voler eliminare questo socio?")) return;

    try {
      /*
        **La cancellazione passa dal servizio, che sa dire di no.**

        Riscriveva l'array intero dal browser, e cosi facendo scavalcava la
        guardia del libro soci: un socio con una storia associativa veniva
        cancellato dall'anagrafica e restava citato nel registro, che e la sola
        cosa che il libro esiste per impedire. La scheda del socio era gia stata
        collegata al servizio; questo elenco no.
      */
      const esito = await removeMemberProfile({ clubId, memberId: socioId });
      if (esito.error) throw new Error(esito.error.message);

      setSoci(soci.filter((socio) => socio.id !== socioId));
      showToast("success", "Socio eliminato");
    } catch (error) {
      console.error("Error deleting socio:", error);
      showToast(
        "error",
        error instanceof Error && error.message
          ? error.message
          : "Errore nell'eliminazione del socio",
      );
    }
  };

  return (
    <div className="flex h-[100dvh] bg-gray-50 dark:bg-gray-900">
      {/* Sidebar */}
      <div className="hidden lg:block">
        <Sidebar />
      </div>

      {/* Main content */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <div className="hidden lg:block">
          <Header title="Soci" />
        </div>
        <div className="lg:hidden">
          <MobileTopBar />
        </div>

        <main className={dashboardMainClassName}>
          <DashboardPageContainer>
            {/* Header */}
            <SharedPageHeader
              title="Soci"
              subtitle="Gestisci i soci dell'associazione"
              actions={
              /*
                A 375 px i due comandi in riga sforavano di sei pixel e
                «Aggiungi Socio» finiva fuori dalla viewport (Blocco A, punto
                22). E la stessa riga di comandi che l'elenco Allenatori ha,
                dove pero era gia `w-full sm:w-auto flex-wrap`: due elenchi
                gemelli con due comportamenti diversi a schermo stretto.
              */
              <div className="flex w-full flex-wrap gap-2 sm:w-auto">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" disabled={!exportScopes.length}>
                      <FileDown className="mr-2 h-4 w-4" />
                      Esporta PDF
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {exportScopes.map((scope) => (
                      <DropdownMenuItem
                        key={scope}
                        onClick={() => handleExportPdf(scope)}
                      >
                        {exportScopeLabel(scope, rowsForScope(scope).length)}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" disabled={!exportScopes.length}>
                      <FileSpreadsheet className="mr-2 h-4 w-4" />
                      Esporta CSV
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {exportScopes.map((scope) => (
                      <DropdownMenuItem
                        key={scope}
                        onClick={() => handleExportCsv(scope)}
                      >
                        {exportScopeLabel(scope, rowsForScope(scope).length)}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
                <Button
                  variant={viewMode === "table" ? "default" : "outline"}
                  size="icon"
                  onClick={() => setViewMode("table")}
                  title="Visualizzazione Tabella"
                >
                  <TableIcon className="h-4 w-4" />
                </Button>
                <Button
                  variant={viewMode === "cards" ? "default" : "outline"}
                  size="icon"
                  onClick={() => setViewMode("cards")}
                  title="Visualizzazione Card"
                >
                  <LayoutGrid className="h-4 w-4" />
                </Button>

                {viewMode === "table" && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="outline"
                        size="icon"
                        title="Personalizza Colonne"
                      >
                        <Settings2 className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48">
                      <DropdownMenuLabel>Colonne Visibili</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      <DropdownMenuCheckboxItem
                        checked={visibleColumns.name}
                        onCheckedChange={(checked) =>
                          setVisibleColumns((prev) => ({
                            ...prev,
                            name: checked,
                          }))
                        }
                      >
                        Nome
                      </DropdownMenuCheckboxItem>
                      <DropdownMenuCheckboxItem
                        checked={visibleColumns.email}
                        onCheckedChange={(checked) =>
                          setVisibleColumns((prev) => ({
                            ...prev,
                            email: checked,
                          }))
                        }
                      >
                        Email
                      </DropdownMenuCheckboxItem>
                      <DropdownMenuCheckboxItem
                        checked={visibleColumns.phone}
                        onCheckedChange={(checked) =>
                          setVisibleColumns((prev) => ({
                            ...prev,
                            phone: checked,
                          }))
                        }
                      >
                        Telefono
                      </DropdownMenuCheckboxItem>
                      <DropdownMenuCheckboxItem
                        checked={visibleColumns.membershipDate}
                        onCheckedChange={(checked) =>
                          setVisibleColumns((prev) => ({
                            ...prev,
                            membershipDate: checked,
                          }))
                        }
                      >
                        Data Iscrizione
                      </DropdownMenuCheckboxItem>
                      <DropdownMenuCheckboxItem
                        checked={visibleColumns.status}
                        onCheckedChange={(checked) =>
                          setVisibleColumns((prev) => ({
                            ...prev,
                            status: checked,
                          }))
                        }
                      >
                        Stato
                      </DropdownMenuCheckboxItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
                <Button
                  onClick={() => {
                    if (typeof window !== "undefined") {
                      const storedClub = localStorage.getItem("activeClub");
                      if (storedClub) {
                        try {
                          const parsed = JSON.parse(storedClub);
                          if (parsed?.id) {
                            router.push(`/soci/new?clubId=${parsed.id}`);
                            return;
                          }
                        } catch (e) {
                          console.error(
                            "Errore nel parsing di activeClub da localStorage",
                            e,
                          );
                        }
                      }
                    }
                    router.push("/soci/new");
                  }}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Aggiungi Socio
                </Button>
              </div>
              }
            />

            {/*
              Cosa e questo elenco, detto nel prodotto (§19, §31). Il libro
              soci per una ASD non-ETS e obbligo statutario ed elemento
              probatorio, non un modello da depositare: chiamarlo «conforme»
              prometterebbe cio che nessuna norma definisce.
            */}
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
              {MEMBERSHIP_REGISTER_DISCLAIMER}
            </p>

            <BulkSelectionToolbar
              selection={selection}
              nouns={{ one: "socio", many: "soci" }}
              className="my-4"
            >
              <Button
                size="sm"
                variant="outline"
                className="h-8"
                disabled={bulkBusy}
                onClick={() => void setSelectionStatus("active")}
              >
                <UserCheck className="mr-1.5 h-3.5 w-3.5 text-green-600" aria-hidden />
                Attiva
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-8"
                disabled={bulkBusy}
                onClick={() => void setSelectionStatus("inactive")}
              >
                <UserX className="mr-1.5 h-3.5 w-3.5 text-amber-600" aria-hidden />
                Disattiva
              </Button>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8"
                    disabled={bulkBusy}
                  >
                    <Users className="mr-1.5 h-3.5 w-3.5 text-blue-600" aria-hidden />
                    Tipo socio
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuLabel>Il tipo e uno solo: sostituisce</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {MEMBER_TYPES.map((memberType) => (
                    <DropdownMenuItem
                      key={memberType}
                      onClick={() => void setSelectionType(memberType)}
                    >
                      {memberType}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>

              <Button
                size="sm"
                variant="outline"
                className="h-8"
                disabled={bulkBusy}
                onClick={() => handleExportPdf("selected")}
              >
                <FileDown className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                Esporta PDF
              </Button>

              <Button
                size="sm"
                variant="outline"
                className="h-8"
                disabled={bulkBusy}
                onClick={() => handleExportCsv("selected")}
              >
                <FileSpreadsheet className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                Esporta CSV
              </Button>
            </BulkSelectionToolbar>

            {/* Content */}
            {loading ? (
              <div className="text-center py-12">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
                <p className="mt-4 text-gray-600">Caricamento soci...</p>
              </div>
            ) : viewMode === "table" ? (
              <Card>
                <CardContent className="p-6">
                  <div className="rounded-md border overflow-x-auto">
                    <Table className="min-w-full">
                      <TableHeader>
                        <TableRow>
                          <TableHead key="select" className="w-12">
                            <SelectAllCheckbox
                              selection={selection}
                              ids={soci.map((socio) => String(socio.id))}
                              label="i soci in elenco"
                            />
                          </TableHead>
                          {visibleColumns.name && (
                            <TableHead key="name">Nome</TableHead>
                          )}
                          {visibleColumns.email && (
                            <TableHead
                              key="email"
                              className="hidden md:table-cell"
                            >
                              Email
                            </TableHead>
                          )}
                          {visibleColumns.phone && (
                            <TableHead
                              key="phone"
                              className="hidden md:table-cell"
                            >
                              Telefono
                            </TableHead>
                          )}
                          {visibleColumns.membershipDate && (
                            <TableHead
                              key="membershipDate"
                              className="hidden md:table-cell"
                            >
                              Data Iscrizione
                            </TableHead>
                          )}
                          {visibleColumns.status && (
                            <TableHead
                              key="status"
                              className="hidden md:table-cell"
                            >
                              Stato
                            </TableHead>
                          )}
                          <TableHead key="actions" className="text-right">
                            Azioni
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {soci.map((socio) => (
                          <TableRow
                            key={socio.id}
                            className="cursor-pointer hover:bg-muted/50"
                          >
                            <TableCell key={`${socio.id}-select`}>
                              <SelectRowCheckbox
                                selection={selection}
                                id={String(socio.id)}
                                label={socio.name}
                              />
                            </TableCell>
                            {visibleColumns.name && (
                              <TableCell
                                key={`${socio.id}-name`}
                                className="font-medium"
                              >
                                <div className="flex items-center gap-2">
                                  <EntityIcon
                                    type="member"
                                    size="sm"
                                    label={socio.name}
                                  />
                                  {socio.name}
                                </div>
                              </TableCell>
                            )}
                            {visibleColumns.email && (
                              <TableCell
                                key={`${socio.id}-email`}
                                className="hidden md:table-cell"
                              >
                                {socio.email || "N/A"}
                              </TableCell>
                            )}
                            {visibleColumns.phone && (
                              <TableCell
                                key={`${socio.id}-phone`}
                                className="hidden md:table-cell"
                              >
                                {socio.phone || "N/A"}
                              </TableCell>
                            )}
                            {visibleColumns.membershipDate && (
                              <TableCell
                                key={`${socio.id}-membershipDate`}
                                className="hidden md:table-cell"
                              >
                                {socio.membership_date || socio.membership_start
                                  ? new Date(
                                      socio.membership_date ||
                                        socio.membership_start ||
                                        "",
                                    ).toLocaleDateString("it-IT")
                                  : "N/A"}
                              </TableCell>
                            )}
                            {visibleColumns.status && (
                              <TableCell
                                key={`${socio.id}-status`}
                                className="hidden md:table-cell"
                              >
                                <MembershipStatusBadge socio={socio} />
                              </TableCell>
                            )}
                            <TableCell
                              key={`${socio.id}-actions`}
                              className="text-right"
                            >
                              <div className="flex justify-end gap-2">
                                <Button
                                  variant="outline"
                                  size="icon"
                                  className="h-8 w-8"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    router.push(
                                      `/soci/${socio.id}?clubId=${clubId}`,
                                    );
                                  }}
                                  title="Modifica"
                                >
                                  <Edit className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="outline"
                                  size="icon"
                                  className="h-8 w-8 text-red-600"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (
                                      confirm(
                                        "Sei sicuro di voler eliminare questo socio?",
                                      )
                                    ) {
                                      handleDelete(socio.id);
                                    }
                                  }}
                                  title="Elimina"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {soci.map((socio) => (
                  <Card
                    key={socio.id}
                    className="hover:shadow-lg transition-shadow duration-200 cursor-pointer"
                    onClick={() =>
                      router.push(`/soci/${socio.id}?clubId=${clubId}`)
                    }
                  >
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                      <div className="flex items-center gap-3">
                        {/*
                          La scheda si apre al clic: spuntare non deve aprirla,
                          o selezionare dieci soci vorrebbe dire aprire dieci
                          pagine.
                        */}
                        <span onClick={(event) => event.stopPropagation()}>
                          <SelectRowCheckbox
                            selection={selection}
                            id={String(socio.id)}
                            label={socio.name}
                          />
                        </span>
                        <EntityIcon
                          type="member"
                          size="sm"
                          label={socio.name}
                        />
                        <div>
                          <CardTitle className="text-lg">
                            {socio.name}
                          </CardTitle>
                        </div>
                      </div>
                      <MembershipStatusBadge socio={socio} />
                    </CardHeader>
                    <CardContent className="space-y-2">
                      <div className="flex items-center text-sm text-gray-600">
                        <Mail className="h-4 w-4 mr-2" />
                        {socio.email || "Email non disponibile"}
                      </div>
                      <div className="flex items-center text-sm text-gray-600">
                        <Phone className="h-4 w-4 mr-2" />
                        {socio.phone || "Telefono non disponibile"}
                      </div>
                      <div className="flex items-center text-sm text-gray-600">
                        <Calendar className="h-4 w-4 mr-2" />
                        {socio.membership_date || socio.membership_start
                          ? `Iscritto il ${new Date(socio.membership_date || socio.membership_start || "").toLocaleDateString("it-IT")}`
                          : "Data iscrizione non disponibile"}
                      </div>
                      <div className="flex justify-end gap-2 mt-4">
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={(e) => {
                            e.stopPropagation();
                            router.push(`/soci/${socio.id}?clubId=${clubId}`);
                          }}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(socio.id);
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}

            {soci.length === 0 && !loading && (
              <Card className="text-center py-12">
                <CardContent>
                  <Users className="h-16 w-16 mx-auto text-gray-400 mb-4" />
                  <h3 className="text-xl font-semibold mb-2">Nessun socio</h3>
                  <p className="text-gray-600 mb-4">
                    Inizia aggiungendo il primo socio della tua associazione
                  </p>
                  <Button
                    onClick={() => {
                      if (typeof window !== "undefined") {
                        const storedClub = localStorage.getItem("activeClub");
                        if (storedClub) {
                          try {
                            const parsed = JSON.parse(storedClub);
                            if (parsed?.id) {
                              router.push(`/soci/new?clubId=${parsed.id}`);
                              return;
                            }
                          } catch (e) {
                            console.error(
                              "Errore nel parsing di activeClub da localStorage",
                              e,
                            );
                          }
                        }
                      }
                      router.push("/soci/new");
                    }}
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    Aggiungi Socio
                  </Button>
                </CardContent>
              </Card>
            )}
          </DashboardPageContainer>
        </main>
      </div>
    </div>
  );
}
