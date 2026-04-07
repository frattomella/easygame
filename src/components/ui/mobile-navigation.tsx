"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import Link from "next/link";
import Image from "next/image";
import {
  Menu,
  X,
  LayoutDashboard,
  Users,
  FolderKanban,
  Calendar,
  FileHeart,
  Bell,
  BarChart3,
  Settings,
  Building,
  ClipboardList,
  CreditCard,
  Shield,
} from "lucide-react";

interface MobileNavigationProps {
  className?: string;
}

const MobileNavigation = ({ className }: MobileNavigationProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [activeSection, setActiveSection] = useState<string | null>(null);
  const [orgName, setOrgName] = React.useState("EasyGame");

  React.useEffect(() => {
    if (typeof window !== "undefined") {
      const storedOrgName = localStorage.getItem("organization-name");
      if (storedOrgName) setOrgName(storedOrgName);
    }
  }, []);

  const toggleMenu = () => setIsOpen(!isOpen);
  const toggleSection = (section: string) => {
    setActiveSection(activeSection === section ? null : section);
  };

  const sections = [
    {
      id: "club",
      label: "CLUB",
      items: [
        {
          href: "/dashboard",
          icon: <LayoutDashboard size={18} />,
          label: "Dashboard",
        },
        {
          href: "/organization",
          icon: <Building size={18} />,
          label: "Organizzazione",
        },
        { href: "/staff", icon: <Users size={18} />, label: "Staff" },
        { href: "/soci", icon: <Users size={18} />, label: "Soci" },
        { href: "/sponsors", icon: <Building size={18} />, label: "Sponsor" },
      ],
    },
    {
      id: "tesserati",
      label: "TESSERATI",
      items: [
        { href: "/athletes", icon: <Users size={18} />, label: "Atleti" },
        { href: "/trainers", icon: <Users size={18} />, label: "Allenatori" },
        {
          href: "/categories",
          icon: <FolderKanban size={18} />,
          label: "Categorie",
        },
        {
          href: "/medical",
          icon: <FileHeart size={18} />,
          label: "Certificati",
        },
      ],
    },
    {
      id: "attivita",
      label: "ATTIVITÀ",
      items: [
        {
          href: "/training",
          icon: <Calendar size={18} />,
          label: "Allenamenti",
        },
        { href: "/matches", icon: <Calendar size={18} />, label: "Gare" },
      ],
    },
    {
      id: "contabilita",
      label: "CONTABILITÀ",
      items: [
        {
          href: "/registration-management",
          icon: <CreditCard size={18} />,
          label: "Gestione Iscrizioni",
        },
        {
          href: "/movements",
          icon: <CreditCard size={18} />,
          label: "Movimenti",
        },
      ],
    },
    {
      id: "altro",
      label: "ALTRO",
      items: [
        {
          href: "/secretariat",
          icon: <ClipboardList size={18} />,
          label: "Segreteria",
        },
        {
          href: "/notifications",
          icon: <Bell size={18} />,
          label: "Notifiche",
        },
        { href: "/reports", icon: <BarChart3 size={18} />, label: "Report" },
        {
          href: "/settings",
          icon: <Settings size={18} />,
          label: "Impostazioni",
        },
        { href: "/permissions", icon: <Shield size={18} />, label: "Permessi" },
      ],
    },
  ];

  return (
    <div className={cn("bg-background", className)}>
      {/* Mobile Header */}
      <div className="flex items-center justify-between p-4 border-b border-border">
        <div className="flex items-center gap-2">
          <div className="relative h-8 w-8">
            <Image
              src="/logo-blu.png"
              alt="EasyGame Logo"
              fill
              className="object-contain"
            />
          </div>
          <span className="font-semibold text-lg">{orgName}</span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleMenu}
          className="md:hidden"
          aria-label="Menu di navigazione"
        >
          {isOpen ? <X size={24} /> : <Menu size={24} />}
        </Button>
      </div>

      {/* Mobile Navigation Drawer */}
      <div
        className={cn(
          "fixed inset-0 bg-background z-50 transition-transform duration-300 ease-in-out transform md:hidden",
          isOpen ? "translate-x-0" : "-translate-x-full",
          "top-[73px] h-[calc(100vh-73px)] overflow-y-auto",
        )}
      >
        <div className="absolute bottom-20 right-4 z-10">
          <button
            className="circle-button-negative"
            onClick={toggleMenu}
            aria-label="Chiudi menu"
          >
            <X size={16} />
          </button>
        </div>
        <div className="p-4 space-y-6">
          {sections.map((section) => (
            <div key={section.id} className="border-b border-border pb-4">
              <Button
                variant="ghost"
                className="w-full justify-between text-left font-semibold text-blue-600 dark:text-blue-400 mb-2"
                onClick={() => toggleSection(section.id)}
              >
                {section.label}
                <span className="text-xl">
                  {activeSection === section.id ? "−" : "+"}
                </span>
              </Button>
              {activeSection === section.id && (
                <div className="space-y-1 pl-2">
                  {section.items.map((item) => (
                    <Link key={item.href} href={item.href} className="block">
                      <Button
                        variant="ghost"
                        className="w-full justify-start gap-3 px-3 py-2 text-left"
                        onClick={toggleMenu}
                      >
                        <span className="flex h-5 w-5 items-center justify-center">
                          {item.icon}
                        </span>
                        <span>{item.label}</span>
                      </Button>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Overlay when menu is open */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/20 z-40 md:hidden top-[73px]"
          onClick={toggleMenu}
          aria-hidden="true"
        />
      )}
    </div>
  );
};

export default MobileNavigation;
