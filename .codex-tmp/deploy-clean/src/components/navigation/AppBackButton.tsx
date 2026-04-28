"use client";

import { ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type AppBackButtonProps = {
  fallbackHref?: string;
  className?: string;
};

export function AppBackButton({
  fallbackHref = "/account",
  className,
}: AppBackButtonProps) {
  const router = useRouter();

  const handleBack = () => {
    if (typeof window !== "undefined") {
      const historyIndex = Number(window.history.state?.idx ?? 0);
      if (historyIndex > 0) {
        router.back();
        return;
      }
    }

    router.push(fallbackHref);
  };

  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      onClick={handleBack}
      className={cn("rounded-full", className)}
      aria-label="Torna indietro"
    >
      <ArrowLeft className="h-4 w-4" />
    </Button>
  );
}
