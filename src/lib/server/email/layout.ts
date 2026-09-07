/**
 * Guscio HTML condiviso per le email EasyGame.
 *
 * **Da PP-05B questo file non compone piu niente**: e l'adattatore fra i
 * chiamanti che avevano gia una stringa HTML in mano e l'Email Template Core
 * (`template-core.ts`), che e il solo posto in cui si scrive markup per la
 * posta. La firma resta identica perche cambiarla avrebbe toccato quattro
 * moduli in una volta senza cambiare cio che parte; cio che cambia e che
 * adesso **anche questa strada** sa presentarsi con il marchio del club.
 *
 * Chi scrive una email nuova non passa di qui: compone dei blocchi e chiama
 * `renderEmailDocument`, che gli da anche il testo semplice. `renderEmailLayout`
 * restituisce solo HTML, ed e la ragione per cui non e la strada consigliata.
 */
import {
  EASYGAME_BRAND,
  renderEmailDocument,
  type EmailBrand,
} from "./template-core";

export { getEmailLogoUrl } from "./template-core";

export const renderEmailLayout = ({
  bodyHtml,
  brand = EASYGAME_BRAND,
  preheader,
}: {
  bodyHtml: string;
  /**
   * Il marchio con cui presentarsi. Predefinito EasyGame: i chiamanti che
   * esistevano prima di PP-05B continuano a comportarsi esattamente come
   * prima, e chi manda per conto di un club lo dichiara.
   */
  brand?: EmailBrand;
  preheader?: string;
}): string =>
  renderEmailDocument({
    brand,
    preheader,
    /*
      `raw` perche il markup arriva gia reso da chi chiama, e sfuggirlo di
      nuovo lo mostrerebbe come testo. E l'unico blocco che si fida, ed e la
      ragione per cui `template-core.ts` lo documenta come via d'uscita: chi
      passa di qui si assume la responsabilita del proprio escaping.

      Il `text` e vuoto di proposito: questa funzione restituisce solo HTML, e
      il testo semplice lo compone gia chi chiama accanto al `bodyHtml`.
    */
    blocks: [{ kind: "raw", html: bodyHtml, text: "" }],
  }).html;
