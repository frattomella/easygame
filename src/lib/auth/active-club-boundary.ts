/**
 * **Il confine multi-tenant, in un posto solo.**
 *
 * Modulo **puro**: nessun Prisma, nessuna rete, nessun DOM. Lo importano i
 * moduli di `src/lib/server/**` che devono decidere se una riga letta dal
 * database appartiene a chi la sta chiedendo.
 *
 * ---
 *
 * ## Il difetto che questo modulo chiude, e perche era una classe e non un caso
 *
 * Ogni dominio si era scritto il proprio `ensureOrganizationAccess`, e quasi
 * tutti confrontavano l'`organization_id` della riga con
 * `allowedOrganizationIds` — **tutti** i club a cui l'utente appartiene.
 *
 * Il permesso, pero, si verifica sempre con `activeRole`, che
 * `resolveOrganizationScopeForUser` risolve dalla membership del **club
 * attivo** (`src/lib/server/auth.ts`). I due insiemi non coincidono mai per chi
 * ha piu di un club — e chiunque puo crearsi una societa e diventarne
 * proprietario.
 *
 * Da qui l'attacco, che l'audit della Wave 4 ha eseguito end-to-end: si manda
 * `x-active-club-id: <la mia societa>` insieme all'identificativo di una riga
 * **di un'altra**. Il ruolo viene risolto per la propria — `owner` — e il
 * confine dice «sei membro di quel club, passa». Un genitore ha letto l'IBAN
 * altrui, rinominato un conto, registrato un'uscita da settantamila euro e
 * stornato un movimento.
 *
 * **Non era un difetto di sei rotte.** Era la forma condivisa da quindici
 * moduli, corretta tre volte in tre punti diversi con tre commenti diversi, e
 * reintrodotta ogni volta che qualcuno ne scriveva un sedicesimo. La lezione
 * non stava nel codice, stava in un commento che nessuno ha riletto.
 *
 * Percio il confine adesso e **una funzione sola**, importata: la prossima
 * copia non nasce, perche non c'e piu niente da copiare.
 *
 * ## La regola, in una frase
 *
 * > La riga deve appartenere al **club attivo**. Per lavorare su un altro club
 * > si cambia club, e il ruolo viene risolto di nuovo per quello.
 *
 * ## Cosa questo modulo **non** decide
 *
 * Non decide **cosa** si puo fare: quello e il permesso, e sta in
 * `src/lib/access-roles.ts` e nei moduli di policy dei domini. Qui si decide
 * soltanto **su quale club** si sta lavorando. I due controlli sono entrambi
 * obbligatori, e in questo ordine: prima il club, poi il ruolo.
 */

export type ActiveClubScope = {
  activeOrganizationId?: string | null;
  /**
   * L'elenco dei club a cui l'utente appartiene.
   *
   * Resta nel tipo perche serve a **elencare** (una schermata che mostra le
   * societa di una persona), e non e in se sbagliato. E sbagliato usarlo per
   * autorizzare una riga: per quello c'e `assertActiveClub`.
   */
  allowedOrganizationIds?: readonly string[];
};

const asText = (value: unknown) => String(value ?? "").trim();

/**
 * L'errore del confine.
 *
 * Contiene sempre `Accesso negato`, perche e la stringa con cui il route
 * handler generico mappa il 403 (CLAUDE.md §8).
 */
export const activeClubDenied = (message: string) =>
  new Error(`Accesso negato: ${message}`);

/**
 * Vero se la riga appartiene al club attivo.
 *
 * **Non** guarda `allowedOrganizationIds`, ed e il punto di tutto il modulo.
 */
export const belongsToActiveClub = (
  scope: ActiveClubScope | null | undefined,
  organizationId: string | null | undefined,
) => {
  const attivo = asText(scope?.activeOrganizationId);
  const riga = asText(organizationId);
  return Boolean(attivo) && Boolean(riga) && attivo === riga;
};

/**
 * Impone il confine, o lancia.
 *
 * `soggetto` compare nel messaggio: «la fattura non e stata trovata, o non
 * appartiene al club attivo». Il messaggio e volutamente ambiguo fra «non
 * esiste» e «non e tua»: distinguerli direbbe a un attaccante che
 * l'identificativo che ha indovinato esiste davvero.
 */
export const assertActiveClub = (
  scope: ActiveClubScope | null | undefined,
  organizationId: string | null | undefined,
  soggetto = "il record",
) => {
  if (!asText(organizationId)) {
    throw activeClubDenied(`${soggetto} non dichiara un club`);
  }
  if (!asText(scope?.activeOrganizationId)) {
    throw activeClubDenied("nessun club attivo selezionato");
  }
  if (!belongsToActiveClub(scope, organizationId)) {
    throw activeClubDenied(
      `${soggetto} non appartiene al club attivo, o non esiste`,
    );
  }
};

/**
 * Il club su cui si sta lavorando, dato cio che il client ha chiesto.
 *
 * Se il client dichiara un club, **deve** essere quello attivo: accettarne uno
 * diverso perche «tanto l'utente ci appartiene» e esattamente il difetto.
 * Se non ne dichiara nessuno, vale il club attivo.
 */
export const resolveActiveClubId = (
  scope: ActiveClubScope | null | undefined,
  requested?: unknown,
  soggetto = "il record",
) => {
  const wanted = asText(requested);
  if (wanted) {
    assertActiveClub(scope, wanted, soggetto);
    return wanted;
  }
  const attivo = asText(scope?.activeOrganizationId);
  if (!attivo) throw activeClubDenied("nessun club attivo selezionato");
  return attivo;
};
