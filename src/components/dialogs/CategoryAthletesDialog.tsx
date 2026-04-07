"use client";

import React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";

interface CategoryAthletesDialogProps {
  isOpen: boolean;
  onClose: () => void;
  categoryName: string;
  athletes: {
    id: string;
    name: string;
    avatar?: string;
    status: "active" | "inactive" | "suspended";
  }[];
  onAddAthlete?: () => void;
}

export function CategoryAthletesDialog({
  isOpen,
  onClose,
  categoryName,
  athletes = [],
  onAddAthlete,
}: CategoryAthletesDialogProps) {
  const [searchQuery, setSearchQuery] = React.useState("");

  const filteredAthletes = athletes.filter((athlete) =>
    athlete.name.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const getStatusColor = (status: string) => {
    switch (status) {
      case "active":
        return "bg-green-500 text-white";
      case "inactive":
        return "bg-gray-400 text-white";
      case "suspended":
        return "bg-red-500 text-white";
      default:
        return "bg-gray-400 text-white";
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Atleti in {categoryName}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="relative">
            <Input
              placeholder="Cerca atleti..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          </div>

          <div className="max-h-[300px] overflow-y-auto">
            {filteredAthletes.length > 0 ? (
              <div className="space-y-3">
                {filteredAthletes.map((athlete) => (
                  <div
                    key={athlete.id}
                    className="flex items-center justify-between p-2 border rounded-md hover:bg-gray-50"
                  >
                    <div className="flex items-center gap-3">
                      <Avatar className="h-8 w-8">
                        <AvatarImage src={athlete.avatar} alt={athlete.name} />
                        <AvatarFallback>
                          {athlete.name.charAt(0)}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <div className="font-medium">{athlete.name}</div>
                        <Badge className={getStatusColor(athlete.status)}>
                          {athlete.status === "active"
                            ? "Attivo"
                            : athlete.status === "inactive"
                              ? "Inattivo"
                              : "Sospeso"}
                        </Badge>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                {searchQuery
                  ? "Nessun atleta trovato con questo nome"
                  : "Nessun atleta in questa categoria"}
              </div>
            )}
          </div>

          <div className="flex justify-end items-center pt-4">
            <Button variant="outline" onClick={onClose}>
              Chiudi
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
