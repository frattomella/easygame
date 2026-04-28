"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/lib/supabase";

interface ProfileModalProps {
  userId: string;
  initialName: string;
  initialImage: string | null;
  onClose: () => void;
  onUpdate: (name: string, image: string) => void;
}

export default function ProfileModal({
  userId,
  initialName,
  initialImage,
  onClose,
  onUpdate,
}: ProfileModalProps) {
  const [name, setName] = useState(initialName);
  const [imageUrl, setImageUrl] = useState(initialImage || "");
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState("");

  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Simple validation
    if (file.size > 5 * 1024 * 1024) {
      setError("L'immagine deve essere inferiore a 5MB");
      return;
    }

    try {
      setIsUploading(true);
      setError("");

      // For demo purposes, we'll use a placeholder image instead of actual upload
      const seed = Math.random().toString(36).substring(2, 10);
      const newImageUrl = `https://api.dicebear.com/7.x/avataaars/svg?seed=${seed}`;
      setImageUrl(newImageUrl);
      setIsUploading(false);
    } catch (err) {
      console.error("Error uploading image:", err);
      setError("Errore durante il caricamento dell'immagine");
      setIsUploading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      // Update user profile in Supabase
      const { error } = await supabase
        .from("users")
        .update({
          first_name: name,
          profile_image: imageUrl,
          updated_at: new Date().toISOString(),
        })
        .eq("id", userId);

      if (error) throw error;

      // Update local storage
      localStorage.setItem(`profileImage_${userId}`, imageUrl);
      localStorage.setItem(`userName_${userId}`, name);

      // Notify parent component
      onUpdate(name, imageUrl);
      onClose();
    } catch (err) {
      console.error("Error updating profile:", err);
      setError("Errore durante l'aggiornamento del profilo");
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-md">
        <h2 className="text-xl font-bold mb-4">Modifica Profilo</h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex flex-col items-center mb-6">
            <div className="relative h-24 w-24 mb-4">
              <img
                src={
                  imageUrl ||
                  "https://api.dicebear.com/7.x/avataaars/svg?seed=default"
                }
                alt="Profile"
                className="h-full w-full rounded-full object-cover border-4 border-blue-500"
              />
              <div className="absolute inset-0 bg-black bg-opacity-0 hover:bg-opacity-20 rounded-full flex items-center justify-center transition-all">
                <span className="text-white opacity-0 hover:opacity-100 text-xs font-medium">
                  Cambia
                </span>
              </div>
            </div>

            <Label
              htmlFor="profile-image"
              className="cursor-pointer text-blue-600 hover:text-blue-800"
            >
              Carica nuova immagine
            </Label>
            <Input
              id="profile-image"
              type="file"
              accept="image/*"
              onChange={handleImageChange}
              className="hidden"
              disabled={isUploading}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="name">Nome</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Il tuo nome"
              required
            />
          </div>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-md">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}

          <div className="flex justify-end space-x-2 pt-4">
            <Button type="button" variant="outline" onClick={onClose}>
              Annulla
            </Button>
            <Button type="submit" disabled={isUploading}>
              {isUploading ? "Caricamento..." : "Salva"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
