"use client";

import React, { useState } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, Plus, MoreVertical, Users, Calendar } from "lucide-react";
import { cn } from "@/lib/utils";

interface CategoryCardProps {
  title: string;
  ageRange: string;
  athleteCount: number;
  trainerCount: number;
  sessionsPerWeek: number;
  color: "blue" | "green" | "orange" | "red";
  onViewAthletes: () => void;
  onViewInfo: () => void;
  onMoreOptions: () => void;
}

const CategoryCard: React.FC<CategoryCardProps> = ({
  title,
  ageRange,
  athleteCount,
  trainerCount,
  sessionsPerWeek,
  color,
  onViewAthletes,
  onViewInfo,
  onMoreOptions,
}) => {
  const colorClasses = {
    blue: "bg-blue-500",
    green: "bg-green-500",
    orange: "bg-orange-500",
    red: "bg-red-500",
  };

  return (
    <div className="bg-white rounded-lg shadow-sm overflow-hidden border border-gray-100">
      <div className={`${colorClasses[color]} h-1 w-full`}></div>
      <div className="p-5">
        <div className="flex justify-between items-center mb-3">
          <h3 className="text-lg font-semibold">{title}</h3>
          <div
            className={`px-2 py-1 text-xs text-white rounded ${colorClasses[color]}`}
          >
            Calcio
          </div>
        </div>

        <p className="text-sm text-gray-600 mb-4">Età: {ageRange} anni</p>

        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Users size={16} className="text-gray-500" />
            <span className="text-sm">{athleteCount} atleti</span>
          </div>

          <div className="flex items-center gap-2">
            <Users size={16} className="text-gray-500" />
            <span className="text-sm">{trainerCount} allenatori</span>
          </div>
        </div>

        <div className="flex items-center gap-2 mb-4">
          <Calendar size={16} className="text-gray-500" />
          <span className="text-sm">
            {sessionsPerWeek} allenamenti a settimana
          </span>
        </div>

        <div className="flex justify-between items-center mt-4">
          <Button
            variant="outline"
            size="sm"
            className="text-xs h-8"
            onClick={onViewAthletes}
          >
            Visualizza Atleti
          </Button>

          <Button
            variant="outline"
            size="sm"
            className="text-xs h-8 border-blue-500 text-blue-500 hover:bg-blue-50"
            onClick={onViewInfo}
          >
            Info
          </Button>

          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={onMoreOptions}
          >
            <MoreVertical size={16} />
          </Button>
        </div>
      </div>
    </div>
  );
};

interface NewDashboardProps {
  organizationName?: string;
}

const NewDashboard: React.FC<NewDashboardProps> = ({
  organizationName = "Nome Associazione",
}) => {
  const [searchQuery, setSearchQuery] = useState("");

  const categories = [
    {
      id: "1",
      title: "Under 10",
      ageRange: "8-10",
      athleteCount: 12,
      trainerCount: 2,
      sessionsPerWeek: 2,
      color: "blue" as const,
    },
    {
      id: "2",
      title: "Under 12",
      ageRange: "10-12",
      athleteCount: 15,
      trainerCount: 1,
      sessionsPerWeek: 3,
      color: "green" as const,
    },
    {
      id: "3",
      title: "Under 14",
      ageRange: "12-14",
      athleteCount: 18,
      trainerCount: 2,
      sessionsPerWeek: 3,
      color: "orange" as const,
    },
    {
      id: "4",
      title: "Under 16",
      ageRange: "14-16",
      athleteCount: 16,
      trainerCount: 2,
      sessionsPerWeek: 3,
      color: "red" as const,
    },
  ];

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
  };

  const handleViewAthletes = (categoryId: string) => {
    // Use e.preventDefault() to prevent navigation
    console.log(`View athletes for category ${categoryId}`);
    // In a real app, we would use router.push here, but we're preventing it in the storyboard
    if (
      typeof window !== "undefined" &&
      !window.location.href.includes("storyboard=true")
    ) {
      // Only navigate if not in a storyboard
      console.log(`Would navigate to /athletes?category=${categoryId}`);
    }
  };

  const handleViewInfo = (categoryId: string) => {
    console.log(`View info for category ${categoryId}`);
    // Only navigate if not in a storyboard
    if (
      typeof window !== "undefined" &&
      !window.location.href.includes("storyboard=true")
    ) {
      console.log(`Would navigate to /categories/${categoryId}`);
    }
  };

  const handleMoreOptions = (categoryId: string) => {
    console.log(`More options for category ${categoryId}`);
    // This would typically open a dropdown, not navigate
  };

  const handleAddCategory = () => {
    console.log("Add new category");
    // Only navigate if not in a storyboard
    if (
      typeof window !== "undefined" &&
      !window.location.href.includes("storyboard=true")
    ) {
      console.log(`Would navigate to /categories/new`);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 py-4 px-6 flex justify-between items-center">
        <div className="flex items-center gap-3">
          <div className="relative h-8 w-8 bg-blue-600 rounded-md flex items-center justify-center text-white font-bold">
            <span>EG</span>
          </div>
          <h1 className="text-xl font-semibold">{organizationName}</h1>
        </div>

        <div className="flex items-center gap-4">
          <div className="relative w-64">
            <Input
              type="text"
              placeholder="Search..."
              className="pl-9 h-9"
              value={searchQuery}
              onChange={handleSearch}
            />
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
          </div>

          <Button size="icon" variant="ghost" className="relative">
            <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center">
              3
            </span>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"></path>
              <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"></path>
            </svg>
          </Button>
        </div>
      </header>

      {/* Main Content */}
      <main className="p-6">
        <div className="flex justify-between items-center mb-6">
          <div className="relative w-full max-w-md">
            <Input
              type="text"
              placeholder="Cerca categorie..."
              className="pl-9"
            />
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
          </div>

          <div className="flex items-center gap-4">
            <Button variant="outline" className="gap-1">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z"></path>
              </svg>
              Filtri
            </Button>

            <Button
              className="gap-1 bg-blue-600 hover:bg-blue-700"
              onClick={handleAddCategory}
            >
              <Plus size={18} />
              Nuova Categoria
            </Button>
          </div>
        </div>

        {/* Categories Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 gap-6">
          {categories.map((category) => (
            <CategoryCard
              key={category.id}
              title={category.title}
              ageRange={category.ageRange}
              athleteCount={category.athleteCount}
              trainerCount={category.trainerCount}
              sessionsPerWeek={category.sessionsPerWeek}
              color={category.color}
              onViewAthletes={() => handleViewAthletes(category.id)}
              onViewInfo={() => handleViewInfo(category.id)}
              onMoreOptions={() => handleMoreOptions(category.id)}
            />
          ))}
        </div>
      </main>
    </div>
  );
};

export default NewDashboard;
