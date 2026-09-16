"use client";

import { useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { useAuth } from "@/components/providers/AuthProvider";
import { OutsideShell, OutsideStatus } from "@/components/web/shell/OutsideShell";
import { getPostLoginPath, isPlatformAdminUser } from "@/lib/platform-admin";

/**
 * «Accesso confermato»: una schermata di stato sul guscio fuori dal club
 * (ambiente 3). AuthProvider e l'unico responsabile della verifica server:
 * qui non si duplica ne la sessione ne la tessera prima del reindirizzamento.
 */
export default function AuthCompletePage() {
  const [message, setMessage] = useState("Verifica sessione in corso…");
  const { user, loading } = useAuth();

  useEffect(() => {
    if (loading) {
      return;
    }

    if (!user?.id) {
      window.location.replace("/login");
      return;
    }

    const platformAdmin = isPlatformAdminUser(user);
    setMessage(
      platformAdmin
        ? "Accesso amministratore confermato. Apertura dashboard di gestione…"
        : "Accesso confermato. Apertura home account…",
    );
    window.location.replace(getPostLoginPath(user));
  }, [loading, user]);

  return (
    <OutsideShell width="form">
      <OutsideStatus icon={<ShieldCheck />} tone="green" title="Accesso confermato" description={message} busy busyLabel="Reindirizzamento in corso…" />
    </OutsideShell>
  );
}
