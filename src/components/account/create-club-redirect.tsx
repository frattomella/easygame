"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

/**
 * `/create-club` e una porta: apre il cassetto «Crea club» dentro la home
 * account. Ambiente 3 (cielo pieno) come la pagina a cui porta.
 */
export default function CreateClubRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/account?openCreateClub=1");
  }, [router]);

  return (
    <div className="egw-sky-full flex min-h-[100dvh] items-center justify-center px-6 font-brand">
      <p className="flex items-center gap-3 text-sm text-white/80" role="status">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        Reindirizzamento alla home account
      </p>
    </div>
  );
}
