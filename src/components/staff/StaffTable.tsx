"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Trash2, Edit, Eye, Users } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { EntityIcon } from "@/components/ui/entity-icon";

interface StaffMember {
  id: string;
  name: string;
  fullName?: string;
  surname?: string;
  email: string;
  phone: string;
  role: string;
  department: string;
  status: string;
  hireDate?: string;
  hire_date?: string;
  avatar: string;
}

interface Department {
  id: string;
  name: string;
  color?: string;
}

interface StaffTableProps {
  staffMembers: StaffMember[];
  departments?: Department[];
  onEdit: (member: StaffMember) => void;
  onDelete: (id: string) => void;
  onAssignDepartment?: (id: string, department: string) => void;
  onToggleStatus: (id: string) => void;
  formatDate: (date: string | null) => string;
  visibleColumns?: {
    name: boolean;
    role: boolean;
    department?: boolean;
    email: boolean;
    phone: boolean;
    status: boolean;
    hireDate: boolean;
  };
}

const getStaffDisplayName = (member: StaffMember) =>
  member.fullName ||
  [member.name, member.surname].filter(Boolean).join(" ").trim() ||
  member.name;

const DEPARTMENT_COLOR_CLASSES: Record<string, string> = {
  blue: "border-blue-200 bg-blue-50 text-blue-700",
  green: "border-green-200 bg-green-50 text-green-700",
  red: "border-red-200 bg-red-50 text-red-700",
  yellow: "border-yellow-200 bg-yellow-50 text-yellow-700",
  purple: "border-purple-200 bg-purple-50 text-purple-700",
};

const normalizeDepartmentName = (value?: string | null) =>
  String(value || "").trim();

const getDepartmentBadgeClassName = (department?: Department) =>
  department?.color
    ? DEPARTMENT_COLOR_CLASSES[department.color] ||
      "border-slate-200 bg-slate-50 text-slate-700"
    : "border-slate-200 bg-slate-50 text-slate-700";

export function StaffTable({
  staffMembers,
  departments = [],
  onEdit,
  onDelete,
  onAssignDepartment,
  onToggleStatus,
  formatDate,
  visibleColumns = {
    name: true,
    role: true,
    department: true,
    email: true,
    phone: true,
    status: true,
    hireDate: true,
  },
}: StaffTableProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const clubId = searchParams?.get("clubId");

  if (staffMembers.length === 0) {
    return (
      <div className="text-center py-8">
        <Users className="h-12 w-12 mx-auto text-muted-foreground opacity-50 mb-4" />
        <h3 className="text-lg font-medium">Nessun risultato trovato</h3>
        <p className="text-muted-foreground">
          Prova a modificare i filtri di ricerca
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-md border overflow-x-auto">
      <Table className="min-w-full">
        <TableHeader>
          <TableRow>
            {visibleColumns.name && <TableHead>Nome</TableHead>}
            {visibleColumns.role && <TableHead>Ruolo</TableHead>}
            {visibleColumns.department && (
              <TableHead className="hidden lg:table-cell">Reparto</TableHead>
            )}
            {visibleColumns.email && (
              <TableHead className="hidden md:table-cell">Email</TableHead>
            )}
            {visibleColumns.phone && (
              <TableHead className="hidden md:table-cell">Telefono</TableHead>
            )}
            {visibleColumns.status && (
              <TableHead className="hidden md:table-cell">Stato</TableHead>
            )}
            {visibleColumns.hireDate && (
              <TableHead className="hidden md:table-cell">
                Data Assunzione
              </TableHead>
            )}
            <TableHead className="text-right">Azioni</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {staffMembers.map((member) => (
            <TableRow
              key={member.id}
              className="cursor-pointer hover:bg-muted/50"
            >
              {visibleColumns.name && (
                <TableCell className="font-medium">
                  <div className="flex items-center gap-2">
                    <EntityIcon
                      type="staff"
                      size="sm"
                      label={getStaffDisplayName(member)}
                    />
                    {getStaffDisplayName(member)}
                  </div>
                </TableCell>
              )}
              {visibleColumns.role && (
                <TableCell>{member.role || "N/A"}</TableCell>
              )}
              {visibleColumns.department && (
                <TableCell className="hidden lg:table-cell">
                  <div className="flex items-center gap-2">
                    <Badge
                      variant="outline"
                      className={getDepartmentBadgeClassName(
                        departments.find(
                          (department) =>
                            normalizeDepartmentName(department.name).toLowerCase() ===
                            normalizeDepartmentName(member.department).toLowerCase(),
                        ),
                      )}
                    >
                      {member.department || "Non assegnato"}
                    </Badge>
                    {onAssignDepartment ? (
                      <Select
                        value={member.department || "__none__"}
                        onValueChange={(value) =>
                          onAssignDepartment(member.id, value)
                        }
                      >
                        <SelectTrigger className="h-8 w-[150px]">
                          <SelectValue placeholder="Reparto" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">
                            Non assegnato
                          </SelectItem>
                          {departments.map((department) => (
                            <SelectItem
                              key={department.id}
                              value={department.name}
                            >
                              {department.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : null}
                  </div>
                </TableCell>
              )}
              {visibleColumns.email && (
                <TableCell className="hidden md:table-cell">
                  {member.email || "N/A"}
                </TableCell>
              )}
              {visibleColumns.phone && (
                <TableCell className="hidden md:table-cell">
                  {member.phone || "N/A"}
                </TableCell>
              )}
              {visibleColumns.status && (
                <TableCell className="hidden md:table-cell">
                  <Badge
                    variant={member.status === "active" ? "default" : "outline"}
                    className={
                      member.status === "active"
                        ? "bg-green-100 text-green-800 border-green-200"
                        : "bg-gray-100 text-gray-800 border-gray-200"
                    }
                  >
                    {member.status === "active" ? "Attivo" : "Non Attivo"}
                  </Badge>
                </TableCell>
              )}
              {visibleColumns.hireDate && (
                <TableCell className="hidden md:table-cell">
                  {formatDate(member.hire_date || member.hireDate || null)}
                </TableCell>
              )}
              <TableCell className="text-right">
                <div className="flex justify-end gap-2">
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8"
                    onClick={(e) => {
                      e.stopPropagation();
                      router.push(`/staff/${member.id}?clubId=${clubId}`);
                    }}
                    title="Visualizza"
                  >
                    <Eye className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8"
                    onClick={(e) => {
                      e.stopPropagation();
                      onEdit(member);
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
                          "Sei sicuro di voler eliminare questo membro dello staff?",
                        )
                      ) {
                        onDelete(member.id);
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
  );
}
