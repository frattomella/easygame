"use client";

import React, { useMemo, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Eye,
  EyeOff,
  FileHeart,
  MoreVertical,
  Search,
  UserX,
  X,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Input } from "@/components/ui/input";
import { useTrainerDashboard } from "@/components/trainer/trainer-dashboard-context";
import {
  SectionBlockedState,
  SectionEmptyState,
  formatDate,
  getAthleteDisplayName,
  getAthleteMedicalExpiry,
} from "@/components/trainer/trainer-dashboard-shared";
import { resolveCategoryId } from "@/lib/category-utils";
import { getRecordDisplayCategory } from "@/lib/trainer-dashboard-helpers";
import userDefaultImage from "@/../public/images/user.png";

type TrainerAthleteStatusFilter = "active" | "inactive" | "suspended" | "all";

type TrainerAthleteRow = {
  id: string;
  displayName: string;
  avatar: string | null;
  categoryId: string;
  categoryLabel: string;
  age: number;
  birthDate: string | null;
  status: string;
  medicalCertExpiry: string | null;
  raw: any;
};

const normalizeValue = (value: unknown) =>
  String(value || "")
    .trim()
    .toLowerCase();

const calculateAge = (value: unknown) => {
  const raw = String(value || "").trim();
  if (!raw) {
    return 0;
  }

  const birthDate = new Date(raw);
  if (Number.isNaN(birthDate.getTime())) {
    return 0;
  }

  const now = new Date();
  let age = now.getFullYear() - birthDate.getFullYear();
  const monthDifference = now.getMonth() - birthDate.getMonth();

  if (
    monthDifference < 0 ||
    (monthDifference === 0 && now.getDate() < birthDate.getDate())
  ) {
    age -= 1;
  }

  return Math.max(age, 0);
};

const resolveAthleteStatus = (athlete: any) =>
  normalizeValue(athlete?.status || athlete?.data?.status || "active") ||
  "active";

const resolveBirthDate = (athlete: any) =>
  athlete?.birth_date || athlete?.data?.birthDate || athlete?.birthDate || null;

const getStatusBadge = (status: string) => {
  if (status === "active") {
    return {
      label: "Attivo",
      icon: CheckCircle2,
      className:
        "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-50",
    };
  }

  if (status === "inactive") {
    return {
      label: "Inattivo",
      icon: EyeOff,
      className:
        "border-slate-200 bg-slate-100 text-slate-700 hover:bg-slate-100",
    };
  }

  return {
    label: "Sospeso",
    icon: UserX,
    className: "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-50",
  };
};

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
    trainerProfile,
  } = useTrainerDashboard();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] =
    useState<TrainerAthleteStatusFilter>("active");
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(
    new Set(),
  );

  const canOpenAthleteProfile =
    permissions.actions.viewAthleteDetails ||
    permissions.actions.viewAthleteContacts ||
    permissions.actions.viewMedicalStatus ||
    permissions.actions.viewEnrollmentAndPayments ||
    permissions.actions.viewAthleteTechnicalSheet;

  const athleteRows = useMemo<TrainerAthleteRow[]>(
    () =>
      assignedAthletes.map((athlete: any) => {
        const categoryLabel = getRecordDisplayCategory(athlete, categories);
        const categoryId =
          resolveCategoryId(
            athlete?.category_id ||
              athlete?.data?.categoryId ||
              athlete?.categoryId ||
              athlete?.category_name ||
              athlete?.data?.categoryName ||
              athlete?.categoryName ||
              categoryLabel,
            categories,
          ) ||
          `trainer-category-${categoryLabel
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "")}`;
        const birthDate = resolveBirthDate(athlete);

        return {
          id: String(athlete?.id || "").trim(),
          displayName: getAthleteDisplayName(athlete),
          avatar: athlete?.avatar_url || athlete?.data?.avatar || athlete?.avatar || null,
          categoryId,
          categoryLabel,
          age: calculateAge(birthDate),
          birthDate: birthDate ? String(birthDate) : null,
          status: resolveAthleteStatus(athlete),
          medicalCertExpiry: getAthleteMedicalExpiry(athlete),
          raw: athlete,
        };
      }),
    [assignedAthletes, categories],
  );

  const filteredAthletes = useMemo(() => {
    const normalizedQuery = normalizeValue(searchQuery);

    return athleteRows.filter((athlete) => {
      const matchesQuery =
        !normalizedQuery ||
        normalizeValue(athlete.displayName).includes(normalizedQuery) ||
        normalizeValue(athlete.categoryLabel).includes(normalizedQuery);
      const matchesStatus =
        statusFilter === "all" || normalizeValue(athlete.status) === statusFilter;

      return matchesQuery && matchesStatus;
    });
  }, [athleteRows, searchQuery, statusFilter]);

  const groupedCategories = useMemo(() => {
    const groups = new Map<
      string,
      { id: string; name: string; birthYearsLabel?: string; athletes: TrainerAthleteRow[] }
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
        birthYearsLabel: String(category?.birthYearsLabel || "").trim() || undefined,
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

      groups.get(athlete.categoryId)?.athletes.push(athlete);
    });

    return Array.from(groups.values()).filter(
      (group) => group.athletes.length > 0,
    );
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
            <th className="px-4 py-3 text-left font-medium">Categoria</th>
            <th className="px-4 py-3 text-left font-medium">Età</th>
            <th className="px-4 py-3 text-left font-medium">Stato</th>
            {permissions.actions.viewMedicalStatus ? (
              <th className="px-4 py-3 text-left font-medium">
                Certificato Medico
              </th>
            ) : null}
            <th className="px-4 py-3 text-left font-medium">Azioni</th>
          </tr>
        </thead>
        <tbody>
          {categoryAthletes.map((athlete) => {
            const statusUi = getStatusBadge(athlete.status);
            const StatusIcon = statusUi.icon;

            return (
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
                        <AvatarFallback className="bg-white p-0.5">
                          <Image
                            src={userDefaultImage}
                            alt={athlete.displayName}
                            className="h-full w-full object-contain"
                            width={40}
                            height={40}
                          />
                        </AvatarFallback>
                      )}
                    </Avatar>
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
                  </div>
                </td>
                <td className="px-4 py-3">{athlete.categoryLabel}</td>
                <td className="px-4 py-3">
                  {athlete.age > 0 ? `${athlete.age} anni` : "-"}
                </td>
                <td className="px-4 py-3">
                  <Badge className={statusUi.className}>
                    <StatusIcon className="mr-1 h-3.5 w-3.5" />
                    {statusUi.label}
                  </Badge>
                </td>
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
            );
          })}
        </tbody>
      </table>
    </div>
  );

  return (
    !permissions.navigation.athletes ? (
      <SectionBlockedState section="athletes" />
    ) : (
    <div className="space-y-6 pb-2">
      <div className="space-y-3">
        <div>
          <h1 className="bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-4xl font-bold text-transparent">
            Atleti
          </h1>
          <p className="mt-2 text-gray-600">
            Visualizzi soltanto gli atleti delle categorie assegnate a{" "}
            {trainerProfile?.name || "questo allenatore"}, con accesso alle sole
            aree autorizzate dal club.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Badge className="border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-50">
            {athleteRows.length} atleti visibili
          </Badge>
          <Badge className="border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-50">
            {assignedCategories.length || groupedCategories.length} categorie assegnate
          </Badge>
          <Badge className="border-slate-200 bg-slate-100 text-slate-700 hover:bg-slate-100">
            {permissions.actions.viewMedicalStatus
              ? "Area medica visibile"
              : "Area medica nascosta"}
          </Badge>
          <Badge className="border-slate-200 bg-slate-100 text-slate-700 hover:bg-slate-100">
            {permissions.actions.viewEnrollmentAndPayments
              ? "Iscrizione visibile"
              : "Iscrizione nascosta"}
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

        <div className="flex flex-wrap gap-2">
          <div className="flex gap-1 rounded-lg border bg-white p-1">
            <Button
              variant={statusFilter === "active" ? "default" : "ghost"}
              size="sm"
              onClick={() => setStatusFilter("active")}
              className={
                statusFilter === "active" ? "bg-green-600 hover:bg-green-700" : ""
              }
            >
              <Eye className="mr-1 h-4 w-4" />
              Attivi
            </Button>
            <Button
              variant={statusFilter === "suspended" ? "default" : "ghost"}
              size="sm"
              onClick={() => setStatusFilter("suspended")}
              className={
                statusFilter === "suspended"
                  ? "bg-amber-600 hover:bg-amber-700"
                  : ""
              }
            >
              <UserX className="mr-1 h-4 w-4" />
              Sospesi
            </Button>
            <Button
              variant={statusFilter === "inactive" ? "default" : "ghost"}
              size="sm"
              onClick={() => setStatusFilter("inactive")}
              className={
                statusFilter === "inactive" ? "bg-slate-600 hover:bg-slate-700" : ""
              }
            >
              <EyeOff className="mr-1 h-4 w-4" />
              Inattivi
            </Button>
            <Button
              variant={statusFilter === "all" ? "default" : "ghost"}
              size="sm"
              onClick={() => setStatusFilter("all")}
              className={
                statusFilter === "all" ? "bg-blue-600 hover:bg-blue-700" : ""
              }
            >
              <X className="mr-1 h-4 w-4" />
              Tutti
            </Button>
          </div>
        </div>
      </div>

      {groupedCategories.length === 0 ? (
        <SectionEmptyState
          title="Nessun atleta visibile"
          description="Quando il club assegna categorie al trainer, qui compare la lista completa degli atleti collegati."
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
                  <CollapsibleTrigger asChild>
                    <CardHeader className="cursor-pointer pb-2 transition-colors hover:bg-gray-50">
                      <CardTitle className="flex items-center gap-2">
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
                      </CardTitle>
                    </CardHeader>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <CardContent>{renderAthleteTable(categoryGroup.athletes)}</CardContent>
                  </CollapsibleContent>
                </Collapsible>
              </Card>
            );
          })}
        </div>
      )}
    </div>
    )
  );
}
