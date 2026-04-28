"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast-notification";

interface AddTrainerFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: any) => void;
  categories: { id: string; name: string }[];
}

export function AddTrainerForm({
  isOpen,
  onClose,
  onSubmit,
  categories = [],
}: AddTrainerFormProps) {
  const { showToast } = useToast();
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    password: "",
    confirmPassword: "",
    address: "",
    city: "",
    postalCode: "",
    fiscalCode: "",
    birthYear: "",
    bio: "",
    salary: "",
    startDate: new Date().toISOString().split("T")[0],
    selectedCategories: [] as string[],
  });

  const handleChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >,
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleCategoryChange = (categoryId: string) => {
    setFormData((prev) => {
      const selectedCategories = [...prev.selectedCategories];
      if (selectedCategories.includes(categoryId)) {
        return {
          ...prev,
          selectedCategories: selectedCategories.filter(
            (id) => id !== categoryId,
          ),
        };
      } else {
        return {
          ...prev,
          selectedCategories: [...selectedCategories, categoryId],
        };
      }
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Validate form
    if (
      !formData.firstName ||
      !formData.lastName ||
      !formData.email ||
      !formData.phone ||
      !formData.password ||
      !formData.confirmPassword
    ) {
      showToast("error", "Compila tutti i campi obbligatori");
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      showToast("error", "Le password non coincidono");
      return;
    }

    if (
      Array.isArray(categories) &&
      categories.length > 0 &&
      formData.selectedCategories.length === 0
    ) {
      showToast("error", "Seleziona almeno una categoria");
      return;
    }

    // Submit form
    const selectedCategoriesData = formData.selectedCategories.map((id) => {
      const category = categories.find((c) => c.id === id);
      return { id, name: category?.name || "" };
    });

    onSubmit({
      ...formData,
      name: `${formData.firstName} ${formData.lastName}`,
      categories: selectedCategoriesData,
      avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${formData.firstName}${formData.lastName}`,
    });

    // Reset form
    setFormData({
      firstName: "",
      lastName: "",
      email: "",
      phone: "",
      password: "",
      confirmPassword: "",
      address: "",
      city: "",
      postalCode: "",
      fiscalCode: "",
      birthYear: "",
      bio: "",
      salary: "",
      startDate: new Date().toISOString().split("T")[0],
      selectedCategories: [],
    });

    // Close modal
    onClose();

    // Show success toast
    showToast("success", "Allenatore aggiunto con successo");
  };

  return (
    <Modal
      title="Aggiungi Nuovo Allenatore"
      description="Inserisci i dettagli del nuovo allenatore"
      isOpen={isOpen}
      onClose={onClose}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Annulla
          </Button>
          <Button
            onClick={handleSubmit}
            className="bg-blue-600 hover:bg-blue-700"
          >
            Salva
          </Button>
        </div>
      }
    >
      <form
        onSubmit={handleSubmit}
        className="space-y-4 max-h-[60vh] overflow-y-auto pr-2"
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="firstName">Nome *</Label>
            <Input
              id="firstName"
              name="firstName"
              value={formData.firstName}
              onChange={handleChange}
              placeholder="Es. Mario"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="lastName">Cognome *</Label>
            <Input
              id="lastName"
              name="lastName"
              value={formData.lastName}
              onChange={handleChange}
              placeholder="Es. Rossi"
              required
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email *</Label>
            <Input
              id="email"
              name="email"
              type="email"
              value={formData.email}
              onChange={handleChange}
              placeholder="Es. mario.rossi@esempio.it"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="phone">Telefono *</Label>
            <Input
              id="phone"
              name="phone"
              value={formData.phone}
              onChange={handleChange}
              placeholder="Es. +39 123 456 7890"
              required
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="password">Password *</Label>
            <Input
              id="password"
              name="password"
              type="password"
              value={formData.password}
              onChange={handleChange}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirmPassword">Conferma Password *</Label>
            <Input
              id="confirmPassword"
              name="confirmPassword"
              type="password"
              value={formData.confirmPassword}
              onChange={handleChange}
              required
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="birthYear">Anno di Nascita</Label>
          <Input
            id="birthYear"
            name="birthYear"
            type="number"
            min="1900"
            max={new Date().getFullYear()}
            value={formData.birthYear}
            onChange={handleChange}
            placeholder="Es. 1985"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="fiscalCode">Codice Fiscale</Label>
          <Input
            id="fiscalCode"
            name="fiscalCode"
            value={formData.fiscalCode}
            onChange={handleChange}
            placeholder="Es. RSSMRA80A01H501Z"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="address">Indirizzo</Label>
          <Input
            id="address"
            name="address"
            value={formData.address}
            onChange={handleChange}
            placeholder="Es. Via Roma 123"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="city">Città</Label>
            <Input
              id="city"
              name="city"
              value={formData.city}
              onChange={handleChange}
              placeholder="Es. Roma"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="postalCode">CAP</Label>
            <Input
              id="postalCode"
              name="postalCode"
              value={formData.postalCode}
              onChange={handleChange}
              placeholder="Es. 00100"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="salary">Stipendio Mensile (€)</Label>
            <Input
              id="salary"
              name="salary"
              type="number"
              value={formData.salary}
              onChange={handleChange}
              placeholder="Es. 1500"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="startDate">Data Inizio</Label>
            <Input
              id="startDate"
              name="startDate"
              type="date"
              value={formData.startDate}
              onChange={handleChange}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label>Categorie Allenate *</Label>
          {!Array.isArray(categories) || categories.length === 0 ? (
            <div className="p-4 border border-yellow-200 bg-yellow-50 rounded-md">
              <p className="text-sm text-yellow-800">
                Nessuna categoria disponibile. Crea prima delle categorie per
                assegnarle agli allenatori.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2 max-h-32 overflow-y-auto border border-gray-200 rounded-md p-2">
              {categories.map((category) => (
                <div key={category.id} className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id={`category-${category.id}`}
                    checked={formData.selectedCategories.includes(category.id)}
                    onChange={() => handleCategoryChange(category.id)}
                    className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <Label
                    htmlFor={`category-${category.id}`}
                    className="text-sm"
                  >
                    {category.name}
                  </Label>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="bio">Biografia</Label>
          <Textarea
            id="bio"
            name="bio"
            value={formData.bio}
            onChange={handleChange}
            placeholder="Inserisci una breve biografia dell'allenatore..."
            rows={3}
          />
        </div>
      </form>
    </Modal>
  );
}
