"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Edit, Trash2, Plus } from "lucide-react";
import { useToast } from "@/components/ui/toast-notification";

interface Department {
  id: string;
  name: string;
  description?: string;
  color?: string;
}

interface DepartmentManagementProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (department: Department) => void;
  departments: Department[];
  onDelete: (id: string) => void;
  staffCountsByDepartment?: Record<string, number>;
}

export function DepartmentManagement({
  isOpen,
  onClose,
  onSave,
  departments,
  onDelete,
  staffCountsByDepartment = {},
}: DepartmentManagementProps) {
  const { showToast } = useToast();
  const [newDepartment, setNewDepartment] = useState<Department>({
    id: "",
    name: "",
    description: "",
    color: "blue",
  });

  const colors = [
    { name: "blue", class: "bg-blue-500" },
    { name: "green", class: "bg-green-500" },
    { name: "red", class: "bg-red-500" },
    { name: "yellow", class: "bg-yellow-500" },
    { name: "purple", class: "bg-purple-500" },
  ];

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    const { name, value } = e.target;
    setNewDepartment({ ...newDepartment, [name]: value });
  };

  const handleColorSelect = (color: string) => {
    setNewDepartment({ ...newDepartment, color });
  };

  const handleCreateDepartment = () => {
    if (!newDepartment.name.trim()) {
      showToast("error", "Inserisci un nome per il reparto");
      return;
    }

    // Check if department with same name already exists
    const existingDept = departments.find(
      (dept) => dept.name.toLowerCase() === newDepartment.name.toLowerCase(),
    );

    if (existingDept && !newDepartment.id) {
      showToast("error", `Il reparto ${newDepartment.name} esiste già`);
      return;
    }

    const departmentToSave: Department = {
      ...newDepartment,
      id: newDepartment.id || `dept-${Date.now()}`,
    };

    onSave(departmentToSave);
    resetForm();
    showToast(
      "success",
      `Reparto ${newDepartment.name} creato con successo`,
    );
  };

  const handleSave = (department: Department) => {
    onSave(department);
    resetForm();
  };

  const resetForm = () => {
    setNewDepartment({
      id: "",
      name: "",
      description: "",
      color: "blue",
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Gestione Reparti</DialogTitle>
        </DialogHeader>
        <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_280px]">
          <section className="min-w-0">
            <div className="flex justify-between items-center mb-2">
              <Label className="text-sm font-medium">
                Reparti esistenti
              </Label>
              <Button
                size="sm"
                className="bg-blue-600 hover:bg-blue-700"
                onClick={() => {
                  setNewDepartment({
                    id: "",
                    name: "",
                    description: "",
                    color: "blue",
                  });
                  document.getElementById("department-name")?.focus();
                }}
              >
                <Plus className="h-4 w-4 mr-1" /> Nuovo
              </Button>
            </div>
            <div className="mt-2 space-y-2 max-h-80 overflow-y-auto rounded-md border p-2">
              {departments.length > 0 ? (
                departments.map((dept) => {
                  const assignedCount =
                    staffCountsByDepartment[dept.name.toLowerCase()] || 0;

                  return (
                    <div
                      key={dept.id}
                      className="flex items-start justify-between gap-3 rounded-md border p-3 hover:bg-gray-50 dark:hover:bg-gray-800"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <div
                            className={`h-4 w-4 rounded-full ${colors.find((c) => c.name === dept.color)?.class || "bg-blue-500"}`}
                          ></div>
                          <span className="font-medium">{dept.name}</span>
                        </div>
                        {dept.description ? (
                          <p className="mt-1 line-clamp-2 text-xs text-gray-500">
                            {dept.description}
                          </p>
                        ) : null}
                        <p className="mt-1 text-xs text-muted-foreground">
                          {assignedCount} staff assegnati
                        </p>
                      </div>
                      <div className="flex shrink-0 gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 text-blue-600 hover:text-blue-800"
                          onClick={() => {
                            setNewDepartment({
                              id: dept.id,
                              name: dept.name,
                              description: dept.description || "",
                              color: dept.color || "blue",
                            });
                          }}
                          title="Modifica"
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 text-red-500 hover:text-red-700"
                          onClick={() => onDelete(dept.id)}
                          title="Elimina"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="text-center text-sm text-muted-foreground py-2">
                  Nessun reparto creato
                </div>
              )}
            </div>
          </section>

          <section className="rounded-md border p-3">
            <Label className="text-sm font-medium">
              {newDepartment.id ? "Modifica reparto" : "Crea nuovo reparto"}
            </Label>
            <div className="mt-3 space-y-3">
              <div>
                <Label className="text-xs font-medium">Nome reparto</Label>
                <Input
                  id="department-name"
                  name="name"
                  value={newDepartment.name}
                  onChange={handleChange}
                  className="w-full mt-1"
                  placeholder="Nome reparto"
                />
              </div>
              <div>
                <Label className="text-xs font-medium">Descrizione</Label>
                <Textarea
                  id="department-description"
                  name="description"
                  value={newDepartment.description}
                  onChange={handleChange}
                  className="w-full mt-1"
                  rows={2}
                  placeholder="Descrizione del reparto"
                />
              </div>
              <div>
                <Label className="text-xs font-medium">Colore</Label>
                <div className="flex gap-2 mt-1">
                  {colors.map((color) => (
                    <div
                      key={color.name}
                      className={`h-6 w-6 rounded-full ${color.class} cursor-pointer border-2 ${newDepartment.color === color.name ? "border-gray-900" : "border-transparent hover:border-gray-400"}`}
                      onClick={() => handleColorSelect(color.name)}
                    ></div>
                  ))}
                </div>
              </div>
              <Button
                className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                onClick={handleCreateDepartment}
              >
                {newDepartment.id ? "Salva reparto" : "Crea reparto"}
              </Button>
              {newDepartment.id ? (
                <Button variant="outline" className="w-full" onClick={resetForm}>
                  Annulla modifica
                </Button>
              ) : null}
            </div>
          </section>
        </div>
        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={onClose}>
            Chiudi
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
