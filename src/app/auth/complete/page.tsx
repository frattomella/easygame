"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/providers/AuthProvider";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, ShieldCheck } from "lucide-react";
import { getPostLoginPath, isPlatformAdminUser } from "@/lib/platform-admin";

export default function AuthCompletePage() {
  const [message, setMessage] = useState("Verifica sessione in corso...");
  const { user, loading } = useAuth();

  useEffect(() => {
    if (loading) {
      return;
    }

    if (!user?.id) {
      window.location.replace("/login");
      return;
    }

    // AuthProvider è l'unico responsabile della verifica server. La pagina di
    // completamento non duplica più sessione e membership prima del redirect.
    const platformAdmin = isPlatformAdminUser(user);
    setMessage(
      platformAdmin
        ? "Accesso amministratore confermato. Apertura dashboard di gestione..."
        : "Accesso confermato. Apertura home account...",
    );
    window.location.replace(getPostLoginPath(user));
  }, [loading, user]);

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.18),_transparent_40%),linear-gradient(180deg,#f8fbff_0%,#eef4ff_45%,#f8fafc_100%)] px-4 py-10">
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-3xl items-center justify-center">
        <Card className="w-full max-w-xl border-white/70 bg-white/90 shadow-2xl backdrop-blur">
          <CardContent className="space-y-4 py-10 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-blue-100 text-blue-700">
              <ShieldCheck className="h-7 w-7" />
            </div>
            <div className="space-y-2">
              <h1 className="text-2xl font-semibold text-slate-900">
                Accesso confermato
              </h1>
              <p className="text-sm text-slate-600">{message}</p>
            </div>
            <div className="flex items-center justify-center gap-2 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Reindirizzamento in corso...
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
