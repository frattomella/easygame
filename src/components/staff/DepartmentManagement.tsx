"use client";

import React, { useState, useEffect } from "react";
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
}

export function DepartmentManagement({
  isOpen,
  onClose,
  onSave,
  departments,
  onDelete,
}: DepartmentManagementProps) {
  const { showToast } = useToast();
  const [newDepartment, setNewDepartment] = useState<Department>({
    id: "",
    name: "",
    description: "",
    color: "blue",
  });
  const [quickAddName, setQuickAddName] = useState("");

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

  const handleQuickAdd = () => {
    if (!quickAddName.trim()) {
      showToast("error", "Inserisci un nome per il dipartimento");
      return;
    }

    const newDept: Department = {
      id: `dept-${Date.now()}`,
      name: quickAddName,
      color: "blue",
    };

    onSave(newDept);
    setQuickAddName("");
    showToast("success", `Dipartimento ${quickAddName} aggiunto con successo`);
  };

  const handleCreateDepartment = () => {
    if (!newDepartment.name.trim()) {
      showToast("error", "Inserisci un nome per il dipartimento");
      return;
    }

    // Check if department with same name already exists
    const existingDept = departments.find(
      (dept) => dept.name.toLowerCase() === newDepartment.name.toLowerCase(),
    );

    if (existingDept && !newDepartment.id) {
      showToast("error", `Il dipartimento ${newDepartment.name} esiste già`);
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
      `Dipartimento ${newDepartment.name} creato con successo`,
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
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Gestione Dipartimenti</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <div className="flex justify-between items-center mb-2">
              <Label className="text-sm font-medium">
                Dipartimenti Esistenti
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
            <div className="mt-2 space-y-2 max-h-60 overflow-y-auto border rounded-md p-2">
              {departments.length > 0 ? (
                departments.map((dept) => (
                  <div
                    key={dept.id}
                    className="flex items-center justify-between p-2 border rounded-md hover:bg-gray-50 dark:hover:bg-gray-800"
                  >
                    <div className="flex items-center gap-2">
                      <div
                        className={`h-4 w-4 rounded-full ${colors.find((c) => c.name === dept.color)?.class || "bg-blue-500"}`}
                      ></div>
                      <span>{dept.name}</span>
                      {dept.description && (
                        <span className="text-xs text-gray-500 italic truncate max-w-[150px]">
                          {dept.description}
                        </span>
                      )}
                    </div>
                    <div className="flex gap-1">
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
                ))
              ) : (
                <div className="text-center text-sm text-muted-foreground py-2">
                  Nessun dipartimento creato
                </div>
              )}
            </div>
          </div>

          <div>
            <Label className="text-sm font-medium">
              Aggiungi Nuovo Dipartimento
            </Label>
            <div className="flex mt-1">
              <Input
                id="quick-add-department"
                value={quickAddName}
                onChange={(e) => setQuickAddName(e.target.value)}
                className="flex-1 rounded-l-md"
                placeholder="Nome dipartimento"
              />
              <Button
                className="rounded-l-none bg-blue-600 hover:bg-blue-700"
                onClick={handleQuickAdd}
              >
                Aggiungi
              </Button>
            </div>
          </div>

          <div className="mt-4 pt-4 border-t">
            <Label className="text-sm font-medium">
              Crea Nuovo Dipartimento
            </Label>
            <div className="mt-2 space-y-3 p-3 border rounded-md">
              <div>
                <Label className="text-xs font-medium">Nome Dipartimento</Label>
                <Input
                  id="department-name"
                  name="name"
                  value={newDepartment.name}
                  onChange={handleChange}
                  className="w-full mt-1"
                  placeholder="Nome dipartimento"
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
                  placeholder="Descrizione del dipartimento"
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
                Crea Dipartimento
              </Button>
            </div>
          </div>
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
