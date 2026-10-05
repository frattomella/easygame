"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { KeyRound } from "lucide-react";
import { OutsideShell, OutsideStatus } from "@/components/web/shell/OutsideShell";

/**
 * **La verifica del gettone vive nella home account.**
 *
 * `/token-verification` e `/token-verification/[userId]` erano una seconda
 * home: riscatto del token di accesso, creazione del club, profilo — le stesse
 * tre cose che `/account` fa con i cassetti del Web V2, ma con validatori di
 * prova («for demo purposes») e un aspetto di un'altra EasyGame. Nessuna
 * schermata vi portava piu: si arrivava solo per indirizzo, da un vecchio
 * segnalibro o da un'email antica. Chi arriva trova la strada giusta.
 */
export default function TokenVerificationRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/account");
  }, [router]);

  return (
    <OutsideShell width="form">
      <OutsideStatus icon={<KeyRound />} title="Il tuo account ti aspetta" description="I token di accesso si riscattano dalla home account, con «Aggiungi un accesso»." busy busyLabel="Apertura home account…" />
    </OutsideShell>
  );
}
