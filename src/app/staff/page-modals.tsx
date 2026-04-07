"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Select } from "@/components/ui/select";

interface StaffMember {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: string;
  department: string;
  status: string;
  hireDate: string;
  avatar: string;
}

interface Department {
  id: string;
  name: string;
  description?: string;
  color?: string;
}

interface AddStaffDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: () => void;
  newStaffMember: Omit<StaffMember, "id">;
  handleStaffMemberChange: (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) => void;
  departments: Department[];
}

export function AddStaffDialog({
  isOpen,
  onClose,
  onSave,
  newStaffMember,
  handleStaffMemberChange,
  departments,
}: AddStaffDialogProps) {
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Aggiungi Nuovo Membro Staff</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="name">Nome Completo *</Label>
              <Input
                id="name"
                name="name"
                value={newStaffMember.name}
                onChange={handleStaffMemberChange}
                placeholder="Nome e Cognome"
                required
              />
            </div>
            <div>
              <Label htmlFor="email">Email *</Label>
              <Input
                id="email"
                name="email"
                type="email"
                value={newStaffMember.email}
                onChange={handleStaffMemberChange}
                placeholder="email@esempio.com"
                required
              />
            </div>
            <div>
              <Label htmlFor="phone">Telefono</Label>
              <Input
                id="phone"
                name="phone"
                value={newStaffMember.phone}
                onChange={handleStaffMemberChange}
                placeholder="+39 123 456 7890"
              />
            </div>
            <div>
              <Label htmlFor="role">Ruolo *</Label>
              <Input
                id="role"
                name="role"
                value={newStaffMember.role}
                onChange={handleStaffMemberChange}
                placeholder="Ruolo"
                required
              />
            </div>
            <div>
              <Label htmlFor="department">Dipartimento</Label>
              <select
                id="department"
                name="department"
                value={newStaffMember.department}
                onChange={handleStaffMemberChange}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {departments.map((dept) => (
                  <option key={dept.id} value={dept.name}>
                    {dept.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="hireDate">Data Assunzione</Label>
              <Input
                id="hireDate"
                name="hireDate"
                type="date"
                value={newStaffMember.hireDate}
                onChange={handleStaffMemberChange}
              />
            </div>
            <div>
              <Label htmlFor="status">Stato</Label>
              <select
                id="status"
                name="status"
                value={newStaffMember.status}
                onChange={handleStaffMemberChange}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <option value="active">Attivo</option>
                <option value="inactive">Inattivo</option>
              </select>
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="avatar">URL Avatar (opzionale)</Label>
              <Input
                id="avatar"
                name="avatar"
                value={newStaffMember.avatar}
                onChange={handleStaffMemberChange}
                placeholder="https://esempio.com/avatar.jpg"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Se non specificato, verrà generato automaticamente
              </p>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Annulla
          </Button>
          <Button onClick={onSave}>Salva</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
