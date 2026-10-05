import { notFound } from "next/navigation";

/**
 * Il renderer pubblico di un sito (ADR-0200). Ci si arriva solo per rewrite
 * dal middleware, che mette nel primo segmento l'host gia normalizzato.
 */
export default function PublicSitePage() {
  notFound();
}
