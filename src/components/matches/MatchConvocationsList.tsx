"use client";

import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CheckCircle, X, User } from "lucide-react";

interface ConvocationStats {
  categoryId: string;
  categoryName: string;
  athletes: {
    id: string;
    name: string;
    matchesPlayed: number;
    matchesAbsent: number;
    status?: string;
  }[];
}

interface MatchConvocationsListProps {
  convocationStats: ConvocationStats[];
}

export function MatchConvocationsList({
  convocationStats = [],
}: MatchConvocationsListProps) {
  const [activeCategory, setActiveCategory] = useState(
    convocationStats[0]?.categoryId || "",
  );

  const activeStats = convocationStats.find(
    (stat) => stat.categoryId === activeCategory,
  );

  // Show empty state if no stats available
  if (convocationStats.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <User className="h-12 w-12 mx-auto mb-4 opacity-50" />
        <p>Nessuna categoria o atleta registrato</p>
        <p className="text-sm">
          Aggiungi categorie e atleti per visualizzare le statistiche
        </p>
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Statistiche Convocazioni</CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue={activeCategory} onValueChange={setActiveCategory}>
          <TabsList className="mb-4">
            {convocationStats.map((stat) => (
              <TabsTrigger key={stat.categoryId} value={stat.categoryId}>
                {stat.categoryName}
              </TabsTrigger>
            ))}
          </TabsList>

          {activeStats && (
            <TabsContent value={activeStats.categoryId}>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-3 px-4 font-medium">
                        Atleta
                      </th>
                      <th className="text-left py-3 px-4 font-medium">Stato</th>
                      <th className="text-left py-3 px-4 font-medium">
                        Gare Disputate
                      </th>
                      <th className="text-left py-3 px-4 font-medium">
                        Assenze
                      </th>
                      <th className="text-left py-3 px-4 font-medium">
                        Percentuale Presenze
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeStats.athletes.map((athlete) => {
                      const totalMatches =
                        athlete.matchesPlayed + athlete.matchesAbsent;
                      const presencePercentage =
                        totalMatches > 0
                          ? Math.round(
                              (athlete.matchesPlayed / totalMatches) * 100,
                            )
                          : 0;

                      const getStatusColor = (status: string) => {
                        switch (status) {
                          case "active":
                            return "bg-green-500";
                          case "suspended":
                            return "bg-red-500";
                          case "loaned":
                            return "bg-orange-500";
                          default:
                            return "bg-green-500";
                        }
                      };

                      const getStatusText = (status: string) => {
                        switch (status) {
                          case "active":
                            return "Attivo";
                          case "suspended":
                            return "Sospeso";
                          case "loaned":
                            return "In Prestito";
                          default:
                            return "Attivo";
                        }
                      };

                      const athleteStatus = athlete.status || "active";

                      return (
                        <tr
                          key={athlete.id}
                          className="border-b hover:bg-gray-50 dark:hover:bg-gray-800"
                        >
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-2">
                              <div
                                className={`w-3 h-3 rounded-full ${getStatusColor(athleteStatus)}`}
                              ></div>
                              {athlete.name}
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <span className="text-xs text-gray-600 dark:text-gray-400">
                              {getStatusText(athleteStatus)}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-green-600">
                            {athlete.matchesPlayed}
                          </td>
                          <td className="py-3 px-4 text-red-600">
                            {athlete.matchesAbsent}
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-2">
                              <div className="w-full max-w-[100px] bg-gray-200 rounded-full h-2.5 dark:bg-gray-700">
                                <div
                                  className={`h-2.5 rounded-full ${presencePercentage > 80 ? "bg-green-600" : presencePercentage > 50 ? "bg-amber-500" : "bg-red-600"}`}
                                  style={{ width: `${presencePercentage}%` }}
                                ></div>
                              </div>
                              <span>{presencePercentage}%</span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </TabsContent>
          )}
        </Tabs>
      </CardContent>
    </Card>
  );
}
