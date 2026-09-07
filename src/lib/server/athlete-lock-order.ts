/**
 * **L'ordine con cui si bloccano le schede atleta. Uno solo, per tutti.**
 *
 * ---
 *
 * ## Perche esiste un file per una funzione
 *
 * Un abbraccio mortale non nasce da un blocco: nasce da **due ordini diversi**
 * di prendere gli stessi blocchi. Finche a bloccare le schede era un dominio
 * solo, l'ordine poteva vivere dentro di lui. Da quando i domini sono due — la
 * revoca di un tutore e il riallineamento di stagione — l'ordine e un patto
 * fra loro, e un patto scritto in casa di uno dei due contraenti non e un
 * patto: e cio che il dominio dei tutori dichiarava, mentre il rollover
 * prendeva le stesse righe in un ordine suo.
 *
 * Misurato da una revisione indipendente: un tutore con due figli in due
 * categorie, la segreteria che fa il passaggio di stagione mentre il
 * proprietario revoca quella persona, e PostgreSQL che sceglie la vittima.
 * Quando la vittima e la revoca — lo e — la schermata dice «revoca non
 * riuscita», **in audit non resta niente**, e la persona e ancora dentro il
 * fascicolo del minore. E il modo di fallire da cui PP-02 e nato (PP02-D34),
 * riaperto su una coppia di tabelle diversa.
 *
 * ## La regola
 *
 * Chi tocca piu di una scheda atleta dentro una transazione le blocca **prima**
 * di scriverle, tutte insieme, in ordine **crescente di identificativo**. Non
 * importa in che ordine il dominio le abbia raccolte: due ordini deterministici
 * uguali non si incrociano mai.
 *
 * E per le tabelle figlie vale il seguito: **prima la scheda, poi le sue
 * righe**. Chi prende `athlete_guardians` e poi `athletes` mentre un altro fa
 * il contrario ha gia perso, in qualunque ordine siano gli identificativi.
 */

/**
 * Blocca le schede indicate, in ordine crescente di identificativo.
 *
 * Idempotente sull'insieme: duplicati e valori vuoti si tolgono, e un elenco
 * vuoto non prende niente.
 */
export const bloccaSchede = async (tx: any, athleteIds: string[]) => {
  const ordinati = Array.from(new Set(athleteIds.filter(Boolean))).sort();
  if (!ordinati.length) return;

  try {
    await tx.$queryRawUnsafe(
      `SELECT "id" FROM "athletes" WHERE "id" = ANY($1::uuid[]) ORDER BY "id" FOR UPDATE`,
      ordinati,
    );
  } catch (errore) {
    /*
      **Un `catch` muto su un blocco nasconde proprio cio che il blocco esiste
      per evitare.**

      Il ripiego serve al doppio di Prisma dei test unitari, che SQL grezzo non
      lo esegue: li non c'e concorrenza da ordinare, e far fallire una scrittura
      corretta sarebbe sbagliato. Ma inghiottire **tutto** inghiottiva anche un
      `40P01`, e la transazione proseguiva avvelenata fino a morire su
      un'istruzione successiva con un `25P02` che non nomina ne la causa ne il
      rimedio: l'operatore leggeva «revoca non riuscita» e nessuno sapeva perche.

      Passa in silenzio solo cio che dice «qui SQL grezzo non c'e». Tutto il
      resto risale, con il suo codice.
    */
    const messaggio = String((errore as any)?.message || errore);
    const nonSupportato =
      typeof (tx as any)?.$queryRawUnsafe !== "function" ||
      /is not a function|not implemented|non supportat/i.test(messaggio);

    if (!nonSupportato) throw errore;
  }
};
