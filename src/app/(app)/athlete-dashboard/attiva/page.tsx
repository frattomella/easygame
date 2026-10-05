"use client";

import { Suspense } from "react";

import { AthleteInviteRedeemScreen } from "@/components/athlete/athlete-invite-redeem-screen";

/**
 * La pagina su cui atterra il link dell'invito.
 *
 * `Suspense` non e decorativo: `useSearchParams` obbliga Next a un confine di
 * sospensione, e senza la build fallisce sul prerender di questa rotta.
 */
export default function Page() {
  return (
    <Suspense fallback={null}>
      <AthleteInviteRedeemScreen />
    </Suspense>
  );
}
