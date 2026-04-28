"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

export default function CreateClubRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/account?openCreateClub=1");
  }, [router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6">
      <div className="flex items-center gap-3 text-sm text-slate-600">
        <Loader2 className="h-4 w-4 animate-spin" />
        Reindirizzamento alla home account...
      </div>
    </div>
  );
}
