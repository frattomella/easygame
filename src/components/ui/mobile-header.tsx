"use client";

import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import Link from "next/link";
import Image from "next/image";
import { useRouter, usePathname } from "next/navigation";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useAuth } from "@/components/providers/AuthProvider";
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
  LogOut,
  Home,
  User,
  FileText,
  MessageCircle,
  Zap,
} from "lucide-react";

interface MobileHeaderProps {
  className?: string;
}

const MobileHeader = ({ className }: MobileHeaderProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [activeSection, setActiveSection] = useState<string | null>(null);
  const [orgName, setOrgName] = React.useState("EasyGame");
  const router = useRouter();
  const pathname = usePathname();
  const [menuType, setMenuType] = useState<"admin" | "trainer" | "parent">(
    "admin",
  );

  const [quickActionsOpen, setQuickActionsOpen] = useState(false);

  const { user, signOut } = useAuth();

  const quickActions = [
    {
      id: "new-athlete",
      label: "Nuovo Atleta",
      href: "/athletes?action=new",
    },
    {
      id: "register-certificate",
      label: "Registra Certificato Medico",
      href: "/medical?action=new",
    },
    {
      id: "new-training",
      label: "Nuovo Allenamento",
      href: "/training?action=new",
    },
    {
      id: "new-match",
      label: "Nuova Gara",
      href: "/matches?action=new",
    },
  ];

  useEffect(() => {
    if (typeof window !== "undefined") {
      try {
        const storedOrgName = localStorage.getItem("organization-name");
        if (storedOrgName) setOrgName(storedOrgName);
      } catch (error) {
        console.error("Error accessing localStorage:", error);
      }
    }

    // Determine menu type based on pathname
    if (pathname?.includes("trainer")) {
      setMenuType("trainer");
    } else if (pathname?.includes("parent")) {
      setMenuType("parent");
    } else {
      setMenuType("admin");
    }
  }, [pathname]);

  const toggleMenu = () => setIsOpen(!isOpen);
  const toggleSection = (section: string) => {
    setActiveSection(activeSection === section ? null : section);
  };

  // Admin menu sections
  const adminSections = [
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
        {
          href: "/modulistica",
          icon: <FileText size={18} />,
          label: "Modulistica",
        },
        { href: "/procura", icon: <Shield size={18} />, label: "Procura" },
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
        {
          href: "/permissions",
          icon: <Shield size={18} />,
          label: "Permessi",
        },
      ],
    },
  ];

  // Trainer menu sections
  const trainerSections = [
    {
      id: "trainer",
      label: "ALLENATORE",
      items: [
        {
          href: "/trainer-dashboard",
          icon: <LayoutDashboard size={18} />,
          label: "Dashboard",
        },
        {
          href: "/training",
          icon: <Calendar size={18} />,
          label: "Allenamenti",
        },
        { href: "/matches", icon: <Calendar size={18} />, label: "Gare" },
        { href: "/athletes", icon: <Users size={18} />, label: "Atleti" },
      ],
    },
  ];

  // Parent menu sections
  const parentSections = [
    {
      id: "parent",
      label: "GENITORE",
      items: [
        {
          href: "/parent-view",
          icon: <User size={18} />,
          label: "Profilo Atleta",
        },
        {
          href: "/parent-view/calendar",
          icon: <Calendar size={18} />,
          label: "Calendario",
        },
        {
          href: "/parent-view/messages",
          icon: <MessageCircle size={18} />,
          label: "Messaggi",
        },
        {
          href: "/parent-view/documents",
          icon: <FileText size={18} />,
          label: "Documenti",
        },
      ],
    },
  ];

  // Determine which sections to display based on menu type
  const sections =
    menuType === "trainer"
      ? trainerSections
      : menuType === "parent"
        ? parentSections
        : adminSections;

  return (
    <div
      className={cn(
        "fixed top-0 left-0 z-50 w-full bg-gradient-to-r from-blue-600 to-blue-800 text-white shadow-md",
        className,
      )}
    >
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-3">
        {/* Logo + app name */}
        <div className="flex items-center gap-2">
          <div className="relative h-9 w-9">
            <Image
              src="/images/logo_bianco.png"
              alt="EasyGame Logo"
              fill
              className="object-contain"
              priority
            />
          </div>
          <span className="text-lg font-semibold">EasyGame</span>
        </div>

        {/* Right side actions */}
        <div className="flex items-center gap-1">
          {/* Quick Actions */}
          <Button
            variant="ghost"
            size="icon"
            className="text-white hover:bg-white/10"
            onClick={() => setQuickActionsOpen(true)}
            aria-label="Azioni rapide"
          >
            <Zap size={22} />
          </Button>

          {/* Profile */}
          <Button
            variant="ghost"
            size="icon"
            className="text-white hover:bg-white/10"
            onClick={() => {
              if (user?.id) {
                router.push(`/profile/${user.id}`);
              } else {
                router.push("/profile");
              }
            }}
            aria-label="Profilo"
          >
            <User size={22} />
          </Button>

          {/* Burger menu */}
          <Button
            variant="ghost"
            size="icon"
            className="text-white hover:bg-white/10"
            onClick={toggleMenu}
            aria-label="Menu di navigazione"
          >
            {isOpen ? <X size={24} /> : <Menu size={24} />}
          </Button>
        </div>
      </div>

      {/* Slide-out menu */}
      {isOpen && (
        <div className="bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 shadow-lg overflow-y-auto max-h-[calc(100vh-64px)]">
          {/* EasyGame HUB featured link */}
          <div className="p-4 pb-2">
            <Link
              href="/hub"
              className="flex items-center gap-3 rounded-lg px-3 py-3 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 transition-all shadow-lg"
              onClick={() => setIsOpen(false)}
            >
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/20">
                <Home size={18} className="text-white" />
              </span>
              <div className="flex flex-col">
                <span className="font-bold text-white">EasyGame HUB</span>
                <span className="text-xs text-white/80">
                  Marketplace e servizi per il tuo club
                </span>
              </div>
            </Link>
          </div>

          {/* Sections */}
          <div className="py-2">
            {sections.map((section) => (
              <div
                key={section.id}
                className="border-b border-gray-200 dark:border-gray-700"
              >
                <button
                  onClick={() => toggleSection(section.id)}
                  className="w-full flex items-center justify-between px-4 py-3 text-xs font-semibold tracking-wide text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                >
                  <span>{section.label}</span>
                  <span
                    className={`transform transition-transform ${activeSection === section.id ? "rotate-180" : ""}`}
                  >
                    ▼
                  </span>
                </button>
                {activeSection === section.id && (
                  <div className="px-4 pb-3">
                    {section.items.map((item, index) => (
                      <Link
                        key={index}
                        href={item.href}
                        className="flex items-center p-2 my-0.5 rounded-md text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
                        onClick={() => setIsOpen(false)}
                      >
                        <span className="mr-3 text-gray-500 dark:text-gray-400">
                          {item.icon}
                        </span>
                        {item.label}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Logout */}
          <div className="p-4 border-t border-gray-200 dark:border-gray-800">
            <Button
              variant="outline"
              className="w-full flex items-center justify-center"
              onClick={async () => {
                try {
                  await signOut();
                } finally {
                  router.push("/");
                  setIsOpen(false);
                }
              }}
            >
              <LogOut size={18} className="mr-2" />
              Logout
            </Button>
          </div>
        </div>
      )}

      {/* Quick Actions Sheet */}
      <Sheet open={quickActionsOpen} onOpenChange={setQuickActionsOpen}>
        <SheetContent side="right" className="w-80">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-blue-500" />
              Azioni Rapide
            </SheetTitle>
          </SheetHeader>
          <div className="mt-6 space-y-3">
            {quickActions.map((action) => (
              <button
                key={action.id}
                onClick={() => {
                  router.push(action.href);
                  setQuickActionsOpen(false);
                }}
                className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-left"
              >
                <div className="p-2 rounded-lg bg-blue-500">
                  <Zap className="h-5 w-5 text-white" />
                </div>
                <span className="font-medium">{action.label}</span>
              </button>
            ))}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
};

export default MobileHeader;
