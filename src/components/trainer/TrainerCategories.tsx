"use client";

import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface TrainerCategoriesProps {
  categories: {
    id: string;
    name: string;
    color?: string;
    athletesCount?: number;
  }[];
}

export function TrainerCategories({ categories = [] }: TrainerCategoriesProps) {
  if (categories.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Le Mie Categorie</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-6 text-muted-foreground">
            Non hai ancora categorie assegnate.
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Le Mie Categorie</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {categories.map((category) => (
            <div
              key={category.id}
              className="p-4 border rounded-lg hover:bg-gray-50 transition-colors"
            >
              <div className="flex justify-between items-center mb-2">
                <h3 className="font-medium">{category.name}</h3>
                <Badge className={category.color || "bg-blue-500 text-white"}>
                  {category.athletesCount || 0} atleti
                </Badge>
              </div>
              <div className="text-sm text-muted-foreground">
                Allenamenti settimanali programmati per questa categoria
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
