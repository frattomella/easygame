/**
 * Accordo grammaticale per le frasi che il DataGrid costruisce intorno al nome
 * della cosa («Nessun modello», «Nessuna riga», «l'unico avviso», «tutte le 12»).
 * Il genere si dichiara quando la desinenza inganna (`atleta` e maschile); se
 * manca, si ricava dalla desinenza.
 */
export type GridNoun = { singular: string; plural: string; gender?: "m" | "f" };

export function nounGender(noun: GridNoun): "m" | "f" {
  if (noun.gender) return noun.gender;
  const word = noun.singular.trim().split(/\s+/)[0]?.toLowerCase() ?? "";
  if (word.endsWith("ione")) return "f";
  if (word.endsWith("o")) return "m";
  if (word.endsWith("a") || word.endsWith("e")) return "f";
  return "m";
}

const startsWithImpureS = (word: string) => /^(s[bcdfghjklmnpqrstvwxyz]|z|gn|ps|pn|x|y)/i.test(word);
const startsWithVowel = (word: string) => /^[aeiouàèéìòù]/i.test(word);

/** «Nessun modello» · «Nessuno sconto» · «Nessuna riga» · «Nessun'operazione». */
export function noneOf(noun: GridNoun): string {
  const word = noun.singular.trim();
  if (nounGender(noun) === "m") return `${startsWithImpureS(word) ? "Nessuno" : "Nessun"} ${word}`;
  return startsWithVowel(word) ? `Nessun'${word}` : `Nessuna ${word}`;
}

/** «l'unico modello» · «l'unica riga». */
export function theOnlyOne(noun: GridNoun): string {
  return `l'${nounGender(noun) === "m" ? "unico" : "unica"} ${noun.singular.trim()}`;
}

/** «tutti i 184» · «tutte le 184» (il numero va gia formattato). */
export function allOf(noun: GridNoun, formattedCount: string): string {
  return nounGender(noun) === "m" ? `tutti i ${formattedCount}` : `tutte le ${formattedCount}`;
}

/** «filtrati» · «filtrate», e il singolare quando il conteggio e uno. */
export function agree(noun: GridNoun, count: number, stem: string): string {
  const masculine = nounGender(noun) === "m";
  if (count === 1) return `${stem}${masculine ? "o" : "a"}`;
  return `${stem}${masculine ? "i" : "e"}`;
}
