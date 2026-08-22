"use client";

import { AccessAreaGuard } from "@/components/auth/access-area-guard";

/**
 * Layout condiviso delle aree di gestione del club.
 *
 * `AccessAreaGuard` decide in base al **pathname corrente**, non alla posizione
 * in cui e montato: annidarlo e quindi idempotente e montarlo alla radice di
 * un'area non altera il comportamento delle sottorotte che hanno gia il
 * proprio guard (es. `/athletes/[id]/profile`, che resta area "athlete").
 *
 * Vedi docs/knowledge-base/08-roles-and-permissions.md.
 */
export default function ManagementAreaLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AccessAreaGuard>{children}</AccessAreaGuard>;
}
