/**
 * **Imponibile e imposta: il dato, non il motore.**
 *
 * Fino alla Wave 4 una fattura e una ricevuta avevano un solo `amount`, e
 * nessuno poteva dire quanta parte di quel numero fosse imposta. Le due colonne
 * `taxable_amount_cents` e `vat_amount_cents` esistono ora, e questo modulo e
 * l'unico posto che le calcola.
 *
 * **Cosa questo modulo NON e, e non diventera in questa Wave.** Non e un motore
 * IVA. Non liquida, non fa il saldo per cassa, non decide una detraibilita, non
 * conosce la L. 398/1991. Quelle sono regole di **classe C** del §31 del piano:
 * richiedono una fonte normativa e la validazione di un professionista, e
 * costruirle prima produrrebbe numeri con l'aria di essere giusti. Qui c'e una
 * divisione.
 *
 * **La regola che governa tutto il resto.** Un'aliquota **non dichiarata** non
 * diventa zero. `null` e `0` sono due cose diverse — «nessuno l'ha detto» e
 * «esente, non imponibile, fuori campo» — e trattarle allo stesso modo
 * scriverebbe su un documento un'affermazione fiscale che nessuno ha fatto.
 * Quando l'aliquota non c'e, imponibile e imposta restano `null` e si vede.
 *
 * Modulo **puro**. Vedi §16 del piano della Wave 4 e ADR-0073.
 */

export type VatSplit = {
  /** L'imponibile in centesimi. `null` quando l'aliquota non e dichiarata. */
  taxableAmountCents: number | null;
  /** L'imposta in centesimi. `null` quando l'aliquota non e dichiarata. */
  vatAmountCents: number | null;
  /** Falso quando nessuno ha dichiarato l'aliquota: e il caso piu frequente. */
  declared: boolean;
  /** L'aliquota usata, cosi il numero si spiega da solo. */
  vatRate: number | null;
};

/**
 * Scompone in imponibile e imposta un importo **gia incassato**.
 *
 * **Perche l'importo si tratta come lordo.** Il totale arriva da un incasso: e
 * il denaro che la famiglia o lo sponsor ha versato, e in quel numero l'imposta
 * c'e gia dentro. Trattarlo come imponibile e aggiungerci l'IVA sopra
 * significherebbe dichiarare incassato piu di quanto e entrato — che e il verso
 * sbagliato dello stesso errore che il tracciato FatturaPA aveva.
 *
 * L'imposta si ricava per **differenza** e non con una seconda
 * moltiplicazione: cosi imponibile e imposta risommano sempre al totale, senza
 * il centesimo di scarto che due arrotondamenti indipendenti producono.
 */
export const splitVatFromTotal = (input: {
  totalCents: number;
  vatRate?: number | null;
}): VatSplit => {
  const totalCents = Math.round(Number(input.totalCents) || 0);

  const rate =
    input.vatRate === null || input.vatRate === undefined
      ? null
      : Number(input.vatRate);

  if (rate === null || !Number.isFinite(rate) || rate < 0) {
    return {
      taxableAmountCents: null,
      vatAmountCents: null,
      declared: false,
      vatRate: null,
    };
  }

  /*
    Aliquota zero **dichiarata**: l'imponibile e tutto, l'imposta e zero. Non e
    la stessa risposta del ramo qui sopra, anche se i numeri si somigliano: li
    non si sa, qui si sa che non c'e imposta. Un rendiconto che distingue le due
    cose puo dire quante righe deve ancora far guardare a qualcuno.
  */
  const taxableAmountCents = Math.round((totalCents * 100) / (100 + rate));

  return {
    taxableAmountCents,
    vatAmountCents: totalCents - taxableAmountCents,
    declared: true,
    vatRate: rate,
  };
};
