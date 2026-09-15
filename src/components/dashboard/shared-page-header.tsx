"use client";

import type { ReactNode } from "react";
import { PageHeader } from "@/components/web/page/PageHeader";

/**
 * L'intestazione di pagina usata da 35 pagine. Dal redesign Web V2 e la
 * `PageHeader` del sistema (guideline 09 §9.2): titolo 800/32 in inchiostro
 * pieno — niente piu titolo in gradiente viola (`deprecated.md`).
 */
export type SharedPageHeaderProps = {
  title: string;
  subtitle?: string;
  eyebrow?: string;
  actions?: ReactNode;
  className?: string;
  variant?: "default" | "home";
};

export function SharedPageHeader({
  title,
  subtitle,
  eyebrow,
  actions,
  className,
}: SharedPageHeaderProps) {
  return (
    <PageHeader
      title={title}
      eyebrow={eyebrow}
      description={subtitle}
      actions={actions}
      className={className}
    />
  );
}
