"use client";

import React, { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BarChart3,
  ChevronDown,
  ChevronRight,
  Eye,
  FileHeart,
  MoreVertical,
  Search,
} from "lucide-react";
import { PageHeading } from "@/components/dashboard/page-heading";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useTrainerDashboard } from "@/components/trainer/trainer-dashboard-context";
import {
  SectionBlockedState,
  SectionEmptyState,
  formatDate,
  getAthleteMedicalExpiry,
} from "@/components/trainer/trainer-dashboard-shared";
import { resolveCategoryId } from "@/lib/category-utils";
import { getRecordDisplayCategory } from "@/lib/trainer-dashboard-helpers";
import { EntityIcon } from "@/components/ui/entity-icon";
import {
  compareAthletesByLastName,
  getAthleteDisplayName,
} from "@/lib/athlete-name-utils";
import { calculateCategoryAthleteStats } from "@/lib/category-athlete-stats";
import { normalizeAthleteCategoryMemberships } from "@/lib/athlete-category-memberships";

type TrainerAthleteRow = {
  id: string;
  displayName: string;
  avatar: string | null;
  categoryId: string;
  categoryLabel: string;
  membershipType: "primary" | "secondary";
  birthYear: string;
  birthDate: string | null;
  status: string;
  medicalCertExpiry: string | null;
  raw: any;
};

const normalizeValue = (value: unknown) =>
  String(value || "")
    .trim()
    .toLowerCase();

const resolveBirthYear = (value: unknown) => {
  const raw = String(value || "").trim();
  if (!raw) {
    return "-";
  }

  const birthDate = new Date(raw);
  if (Number.isNaN(birthDate.getTime())) {
    return "-";
  }

  return String(birthDate.getFullYear());
};

const resolveAthleteStatus = (athlete: any) =>
  normalizeValue(athlete?.status || athlete?.data?.status || "active") ||
  "active";

const isActiveStatus = (status: string) =>
  !status || ["active", "attivo", "enabled", "abilitato"].includes(status);

const resolveBirthDate = (athlete: any) =>
  athlete?.birth_date || athlete?.data?.birthDate || athlete?.birthDate || null;

const isCertificateExpired = (value: unknown) => {
  const raw = String(value || "").trim();
  if (!raw) {
    return false;
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    return false;
  }

  return parsed < new Date();
};

export default function TrainerAthletesDashboardPage() {
  const router = useRouter();
  const {
    assignedAthletes,
    assignedCategories,
    categories,
    permissions,
    visibleMatches,
    visibleTrainings,
  } = useTrainerDashboard();
  const [searchQuery, setSearchQuery] = useState("");
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(
    new Set(),
  );
  const [selectedReportCategory, setSelectedReportCategory] = useState<{
    id: string;
    name: string;
    athletes: TrainerAthleteRow[];
  } | null>(null);

  const canOpenAthleteProfile =
    permissions.actions.viewAthleteDetails ||
    permissions.actions.viewAthleteContacts ||
    permissions.actions.viewMedicalStatus ||
    permissions.actions.viewAthleteTechnicalSheet;

  const athleteRows = useMemo<TrainerAthleteRow[]>(
    () => {
      const assignedCategoryTokens = new Set(
        assignedCategories
          .flatMap((category: any) => [
            category?.id,
            category?.name,
            resolveCategoryId(category?.id || category?.name, categories),
          ])
          .map(normalizeValue)
          .filter(Boolean),
      );

      return [...assignedAthletes]
        .filter((athlete: any) => isActiveStatus(resolveAthleteStatus(athlete)))
        .sort(compareAthletesByLastName)
        .flatMap((athlete: any) => {
          const birthDate = resolveBirthDate(athlete);
          const memberships = normalizeAthleteCategoryMemberships(
            athlete,
            categories,
          );
          const fallbackCategoryLabel = getRecordDisplayCategory(
            athlete,
            categories,
          );
          const fallbackCategoryId =
            resolveCategoryId(
              athlete?.category_id ||
                athlete?.data?.categoryId ||
                athlete?.categoryId ||
                athlete?.category_name ||
                athlete?.data?.categoryName ||
                athlete?.categoryName ||
                fallbackCategoryLabel,
              categories,
            ) ||
            `trainer-category-${fallbackCategoryLabel
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, "-")
              .replace(/^-+|-+$/g, "")}`;
          const categoryMemberships =
            memberships.length > 0
              ? memberships
              : [
                  {
                    categoryId: fallbackCategoryId,
                    categoryName: fallbackCategoryLabel,
                    isPrimary: true,
                  },
                ];
          const assignedMemberships = categoryMemberships.filter((membership) => {
            if (assignedCategoryTokens.size === 0) {
              return true;
            }

            const resolvedId = resolveCategoryId(
              membership.categoryId || membership.categoryName,
              categories,
            );

            return [membership.categoryId, membership.categoryName, resolvedId]
              .map(normalizeValue)
              .filter(Boolean)
              .some((token) => assignedCategoryTokens.has(token));
          });
          const dedupedMemberships = new Map<string, any>();

          assignedMemberships.forEach((membership) => {
            const key =
              normalizeValue(membership.categoryId) ||
              normalizeValue(membership.categoryName);

            if (key && !dedupedMemberships.has(key)) {
              dedupedMemberships.set(key, membership);
            }
          });

          return Array.from(dedupedMemberships.values()).map((membership) => ({
            id: String(athlete?.id || "").trim(),
            displayName: getAthleteDisplayName(athlete),
            avatar:
              athlete?.avatar_url ||
              athlete?.data?.avatar ||
              athlete?.avatar ||
              null,
            categoryId: String(membership.categoryId || fallbackCategoryId),
            categoryLabel: String(
              membership.categoryName || fallbackCategoryLabel,
            ),
            membershipType: membership.isPrimary ? "primary" : "secondary",
            birthYear: resolveBirthYear(birthDate),
            birthDate: birthDate ? String(birthDate) : null,
            status: resolveAthleteStatus(athlete),
            medicalCertExpiry: getAthleteMedicalExpiry(athlete),
            raw: athlete,
          }));
        });
    },
    [assignedAthletes, assignedCategories, categories],
  );

  const filteredAthletes = useMemo(() => {
    const normalizedQuery = normalizeValue(searchQuery);

    return athleteRows.filter((athlete) => {
      const matchesQuery =
        !normalizedQuery ||
        normalizeValue(athlete.displayName).includes(normalizedQuery) ||
        normalizeValue(athlete.categoryLabel).includes(normalizedQuery);
      return matchesQuery;
    });
  }, [athleteRows, searchQuery]);

  const groupedCategories = useMemo(() => {
    const groups = new Map<
      string,
      {
        id: string;
        name: string;
        birthYearsLabel?: string;
        athletes: TrainerAthleteRow[];
      }
    >();

    assignedCategories.forEach((category: any) => {
      const categoryId =
        String(category?.id || category?.name || "").trim() ||
        `trainer-category-${String(category?.name || "categoria")
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")}`;
      groups.set(categoryId, {
        id: categoryId,
        name: String(category?.name || categoryId).trim(),
        birthYearsLabel:
          String(category?.birthYearsLabel || "").trim() || undefined,
        athletes: [],
      });
    });

    filteredAthletes.forEach((athlete) => {
      if (!groups.has(athlete.categoryId)) {
        groups.set(athlete.categoryId, {
          id: athlete.categoryId,
          name: athlete.categoryLabel || "Senza categoria",
          athletes: [],
        });
      }

      const group = groups.get(athlete.categoryId);
      if (group && !group.athletes.some((entry) => entry.id === athlete.id)) {
        group.athletes.push(athlete);
      }
    });

    return Array.from(groups.values())
      .map((group) => ({
        ...group,
        athletes: group.athletes.sort((left, right) =>
          compareAthletesByLastName(left.raw, right.raw),
        ),
      }))
      .filter((group) => group.athletes.length > 0);
  }, [assignedCategories, filteredAthletes]);

  const toggleCategoryCollapse = (categoryId: string) => {
    setCollapsedCategories((current) => {
      const next = new Set(current);
      if (next.has(categoryId)) {
        next.delete(categoryId);
      } else {
        next.add(categoryId);
      }
      return next;
    });
  };

  const renderAthleteTable = (categoryAthletes: TrainerAthleteRow[]) => (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b">
            <th className="px-4 py-3 text-left font-medium">Atleta</th>
            <th className="px-4 py-3 text-left font-medium">Anno nascita</th>
            {permissions.actions.viewMedicalStatus ? (
              <th className="px-4 py-3 text-left font-medium">
                Certificato Medico
              </th>
            ) : null}
            <th className="px-4 py-3 text-left font-medium">Azioni</th>
          </tr>
        </thead>
        <tbody>
          {categoryAthletes.map((athlete) => (
              <tr
                key={athlete.id}
                className="border-b transition-colors hover:bg-gray-50"
              >
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <Avatar>
                      {athlete.avatar ? (
                        <AvatarImage
                          src={athlete.avatar}
                          alt={athlete.displayName}
                        />
                      ) : (
                        <AvatarFallback className="bg-transparent p-0">
                          <EntityIcon
                            type="athlete"
                            label={athlete.displayName}
                            className="h-full w-full border-0"
                          />
                        </AvatarFallback>
                      )}
                    </Avatar>
                    <div className="min-w-0">
                      {canOpenAthleteProfile ? (
                        <button
                          onClick={() =>
                            router.push(
                              `/trainer-dashboard/athletes/${athlete.id}`,
                            )
                          }
                          className="cursor-pointer text-left hover:text-blue-600 hover:underline"
                        >
                          {athlete.displayName}
                        </button>
                      ) : (
                        <span>{athlete.displayName}</span>
                      )}
                      <div className="mt-1">
                        <Badge
                          className={
                            athlete.membershipType === "secondary"
                              ? "border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-50"
                              : "border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-50"
                          }
                        >
                          {athlete.membershipType === "secondary"
                            ? "Secondaria"
                            : "Primaria"}
                        </Badge>
                      </div>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3">{athlete.birthYear}</td>
                {permissions.actions.viewMedicalStatus ? (
                  <td className="px-4 py-3">
                    {athlete.medicalCertExpiry ? (
                      <div className="flex items-center gap-2">
                        <FileHeart
                          className={`h-4 w-4 ${
                            isCertificateExpired(athlete.medicalCertExpiry)
                              ? "text-red-500"
                              : "text-green-500"
                          }`}
                        />
                        <span
                          className={
                            isCertificateExpired(athlete.medicalCertExpiry)
                              ? "text-red-500"
                              : ""
                          }
                        >
                          {formatDate(athlete.medicalCertExpiry)}
                        </span>
                      </div>
                    ) : (
                      <span>-</span>
                    )}
                  </td>
                ) : null}
                <td className="px-4 py-3">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        disabled={!canOpenAthleteProfile}
                        onClick={() =>
                          router.push(
                            `/trainer-dashboard/athletes/${athlete.id}`,
                          )
                        }
                      >
                        <Eye className="mr-2 h-4 w-4 text-blue-600" />
                        Apri scheda atleta
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </td>
              </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  const reportRows = useMemo(() => {
    if (!selectedReportCategory) {
      return [];
    }

    return calculateCategoryAthleteStats(
      selectedReportCategory.name || selectedReportCategory.id,
      selectedReportCategory.athletes.map((athlete) => athlete.raw),
      visibleTrainings,
      [],
      visibleMatches,
      categories,
    );
  }, [categories, selectedReportCategory, visibleMatches, visibleTrainings]);

  return !permissions.navigation.athletes ? (
    <SectionBlockedState section="athletes" />
  ) : (
    <div className="space-y-6 pb-2">
      <div className="space-y-3">
        <PageHeading
          eyebrow="Dashboard trainer"
          title="Atleti"
          subtitle="Roster assegnato."
        />

        <div className="flex flex-wrap gap-2">
          <Badge className="border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-50">
            {new Set(athleteRows.map((athlete) => athlete.id)).size} atleti
            visibili
          </Badge>
          <Badge className="border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-50">
            {assignedCategories.length || groupedCategories.length} categorie
            assegnate
          </Badge>
        </div>
      </div>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:w-auto">
          <Input
            placeholder="Cerca atleti..."
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            className="w-full pl-10 sm:w-80"
          />
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        </div>
      </div>

      {groupedCategories.length === 0 ? (
        <SectionEmptyState
          title="Nessun atleta visibile"
          description="Roster vuoto."
        />
      ) : (
        <div className="space-y-4">
          {groupedCategories.map((categoryGroup) => {
            const isCollapsed = collapsedCategories.has(categoryGroup.id);

            return (
              <Card key={categoryGroup.id} className="overflow-hidden">
                <Collapsible
                  open={!isCollapsed}
                  onOpenChange={() => toggleCategoryCollapse(categoryGroup.id)}
                >
                  <CardHeader className="pb-2">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <CollapsibleTrigger asChild>
                        <button
                          type="button"
                          className="flex min-w-0 flex-1 items-center gap-2 rounded-lg text-left transition-colors hover:text-blue-700"
                        >
                          {isCollapsed ? (
                            <ChevronRight className="h-5 w-5 text-gray-500" />
                          ) : (
                            <ChevronDown className="h-5 w-5 text-gray-500" />
                          )}
                          <span className="inline-block h-3 w-3 rounded-full bg-blue-500" />
                          <span>
                            {categoryGroup.name} ({categoryGroup.athletes.length})
                          </span>
                          {categoryGroup.birthYearsLabel ? (
                            <span className="text-sm font-normal text-gray-500">
                              {categoryGroup.birthYearsLabel}
                            </span>
                          ) : null}
                        </button>
                      </CollapsibleTrigger>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="w-full rounded-xl sm:w-auto"
                        onClick={() => setSelectedReportCategory(categoryGroup)}
                      >
                        <BarChart3 className="mr-2 h-4 w-4" />
                        Report
                      </Button>
                    </div>
                  </CardHeader>
                  <CollapsibleContent>
                    <CardContent>
                      {renderAthleteTable(categoryGroup.athletes)}
                    </CardContent>
                  </CollapsibleContent>
                </Collapsible>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog
        open={Boolean(selectedReportCategory)}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedReportCategory(null);
          }
        }}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>
              Report categoria {selectedReportCategory?.name || ""}
            </DialogTitle>
            <DialogDescription>
              Convocazioni, gare, presenze e allenamenti filtrati per categoria.
            </DialogDescription>
          </DialogHeader>
          {reportRows.length === 0 ? (
            <SectionEmptyState
              title="Nessun dato per il report"
              description="La categoria non contiene atleti o eventi registrati."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="px-4 py-3 text-left font-medium">Atleta</th>
                    <th className="px-4 py-3 text-left font-medium">
                      Convocazioni/Gare
                    </th>
                    <th className="px-4 py-3 text-left font-medium">
                      Presenze/Allenamenti
                    </th>
                    <th className="px-4 py-3 text-left font-medium">
                      % Convocazione
                    </th>
                    <th className="px-4 py-3 text-left font-medium">
                      % Presenza
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {reportRows.map((row) => (
                    <tr key={row.athleteId} className="border-b">
                      <td className="px-4 py-3 font-medium text-slate-900">
                        {row.athleteName}
                      </td>
                      <td className="px-4 py-3">
                        {row.convocations}/{row.totalMatches}
                      </td>
                      <td className="px-4 py-3">
                        {row.presences}/{row.totalTrainings}
                      </td>
                      <td className="px-4 py-3">
                        {row.totalMatches ? `${row.convocationRate}%` : "-"}
                      </td>
                      <td className="px-4 py-3">
                        {row.totalTrainings ? `${row.presenceRate}%` : "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
