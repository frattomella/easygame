"use client";

import TokenVerificationRedirect from "../page";

/**
 * Stessa destinazione della rotta senza identificativo: la home account
 * (vedi `../page.tsx`). L'identificativo nell'indirizzo non serve piu: la
 * sessione dice gia chi sei.
 */
export default function TokenVerificationUserRedirect() {
  return <TokenVerificationRedirect />;
}
