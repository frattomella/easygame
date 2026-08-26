/**
 * Le **forme giuridiche** che EasyGame sa registrare.
 *
 * **La regola che questo file custodisce: la sigla non decide il trattamento
 * fiscale.** E la tentazione piu naturale e piu dannosa di un gestionale
 * sportivo — «e una ASD, quindi ricevuta senza IVA» — e produce documenti
 * sbagliati con l'aria di essere giusti. Due ASD possono avere trattamenti
 * diversi: una in regime forfettario della L. 398/1991 e una no, una con
 * partita IVA per l'attivita commerciale e una senza. La sigla dice **che
 * soggetto e**; cosa comporti lo dicono il regime, la partita IVA e la
 * classificazione delle operazioni, che sono tre cose configurate e non
 * dedotte.
 *
 * Quel che una forma giuridica **puo** dire e cosa e *strutturalmente* vero:
 * una societa di capitali ha per forza un'iscrizione al Registro Imprese,
 * un'associazione non riconosciuta no. Quello sta qui; il resto no.
 *
 * Modulo **puro**. Vedi ADR-0052.
 */

export const LEGAL_FORMS = [
  "asd",
  "ssd_arl",
  "ssd_spa",
  "associazione",
  "ente_terzo_settore",
  "societa_capitali",
  "societa_persone",
  "ditta_individuale",
  "ente_pubblico",
  "altro",
] as const;

export type LegalForm = (typeof LEGAL_FORMS)[number];

export const isLegalForm = (value: unknown): value is LegalForm =>
  LEGAL_FORMS.includes(String(value || "") as LegalForm);

export type LegalFormDefinition = {
  key: LegalForm;
  label: string;
  /** Una riga, per chi compila il profilo e non e un commercialista. */
  description: string;
  /** Vero se il soggetto ha per forza un'iscrizione REA. */
  requiresRea: boolean;
  /**
   * Vero se il soggetto **deve** avere una partita IVA per esistere.
   *
   * Falso non significa «non ce l'ha»: una ASD con attivita commerciale ce
   * l'ha eccome. Significa che EasyGame non puo pretenderla per salvare il
   * profilo.
   */
  requiresVatNumber: boolean;
  /** Vero se il codice fiscale del soggetto coincide con la partita IVA. */
  fiscalCodeUsuallyEqualsVat: boolean;
};

export const LEGAL_FORM_DEFINITIONS: Record<LegalForm, LegalFormDefinition> = {
  asd: {
    key: "asd",
    label: "ASD — Associazione Sportiva Dilettantistica",
    description:
      "Associazione senza scopo di lucro. Puo avere partita IVA per la sola attivita commerciale.",
    requiresRea: false,
    requiresVatNumber: false,
    fiscalCodeUsuallyEqualsVat: false,
  },
  ssd_arl: {
    key: "ssd_arl",
    label: "SSD a r.l. — Societa Sportiva Dilettantistica",
    description:
      "Societa di capitali senza scopo di lucro, iscritta al Registro Imprese.",
    requiresRea: true,
    requiresVatNumber: true,
    fiscalCodeUsuallyEqualsVat: true,
  },
  ssd_spa: {
    key: "ssd_spa",
    label: "SSD per azioni",
    description: "Societa sportiva dilettantistica in forma di societa per azioni.",
    requiresRea: true,
    requiresVatNumber: true,
    fiscalCodeUsuallyEqualsVat: true,
  },
  associazione: {
    key: "associazione",
    label: "Associazione (non sportiva)",
    description:
      "Associazione riconosciuta o non riconosciuta con finalita diverse da quella sportiva.",
    requiresRea: false,
    requiresVatNumber: false,
    fiscalCodeUsuallyEqualsVat: false,
  },
  ente_terzo_settore: {
    key: "ente_terzo_settore",
    label: "Ente del Terzo Settore",
    description: "Soggetto iscritto al RUNTS, con la disciplina che ne deriva.",
    requiresRea: false,
    requiresVatNumber: false,
    fiscalCodeUsuallyEqualsVat: false,
  },
  societa_capitali: {
    key: "societa_capitali",
    label: "Societa di capitali (S.r.l., S.p.A.)",
    description: "Societa commerciale con personalita giuridica.",
    requiresRea: true,
    requiresVatNumber: true,
    fiscalCodeUsuallyEqualsVat: true,
  },
  societa_persone: {
    key: "societa_persone",
    label: "Societa di persone (S.n.c., S.a.s.)",
    description: "Societa commerciale senza personalita giuridica.",
    requiresRea: true,
    requiresVatNumber: true,
    fiscalCodeUsuallyEqualsVat: true,
  },
  ditta_individuale: {
    key: "ditta_individuale",
    label: "Ditta individuale / libero professionista",
    description: "Persona fisica con partita IVA.",
    requiresRea: false,
    requiresVatNumber: true,
    fiscalCodeUsuallyEqualsVat: false,
  },
  ente_pubblico: {
    key: "ente_pubblico",
    label: "Ente pubblico",
    description:
      "Amministrazione o ente pubblico: la fattura elettronica segue le regole della PA.",
    requiresRea: false,
    requiresVatNumber: true,
    fiscalCodeUsuallyEqualsVat: false,
  },
  altro: {
    key: "altro",
    label: "Altro soggetto",
    description:
      "Forma non compresa nell'elenco. I requisiti li dichiara chi compila il profilo.",
    requiresRea: false,
    requiresVatNumber: false,
    fiscalCodeUsuallyEqualsVat: false,
  },
};

export const getLegalFormDefinition = (value: unknown): LegalFormDefinition =>
  LEGAL_FORM_DEFINITIONS[isLegalForm(value) ? value : "altro"];

export const legalFormLabel = (value: unknown) =>
  getLegalFormDefinition(value).label;

/* ------------------------------------------------------- regimi speciali */

/**
 * I regimi speciali che si **dichiarano**, uno per uno.
 *
 * Non sono dedotti dalla forma giuridica per la ragione in testa al file, e
 * non sono un elenco chiuso di conseguenze: EasyGame registra che il soggetto
 * ha dichiarato di essere in quel regime, e lo riporta dove serve. Le
 * conseguenze operative stanno nella configurazione dei tipi di operazione,
 * dove qualcuno le ha scritte di proposito.
 */
export const SPECIAL_REGIMES = [
  "legge_398_1991",
  "regime_forfettario",
  "esente_art_10",
  "split_payment",
  "reverse_charge",
] as const;

export type SpecialRegime = (typeof SPECIAL_REGIMES)[number];

export const isSpecialRegime = (value: unknown): value is SpecialRegime =>
  SPECIAL_REGIMES.includes(String(value || "") as SpecialRegime);

export const SPECIAL_REGIME_LABELS: Record<SpecialRegime, string> = {
  legge_398_1991: "Regime L. 398/1991",
  regime_forfettario: "Regime forfettario",
  esente_art_10: "Operazioni esenti art. 10 DPR 633/72",
  split_payment: "Scissione dei pagamenti (split payment)",
  reverse_charge: "Inversione contabile (reverse charge)",
};

/**
 * I codici di regime fiscale della specifica FatturaPA.
 *
 * Sono una **codifica**, non una scelta di EasyGame: chi compila il profilo
 * seleziona il proprio, e il valore finisce tale e quale nel tracciato. Non
 * proponiamo un valore predefinito, perche un regime fiscale proposto da un
 * software e un regime fiscale sbagliato che nessuno ha letto.
 */
export const TAX_REGIME_CODES: Array<{ code: string; label: string }> = [
  { code: "RF01", label: "RF01 — Ordinario" },
  { code: "RF02", label: "RF02 — Contribuenti minimi" },
  { code: "RF04", label: "RF04 — Agricoltura e attivita connesse" },
  { code: "RF05", label: "RF05 — Vendita sali e tabacchi" },
  { code: "RF11", label: "RF11 — Agenzie viaggi e turismo" },
  { code: "RF12", label: "RF12 — Agriturismo" },
  { code: "RF13", label: "RF13 — Vendite a domicilio" },
  { code: "RF16", label: "RF16 — IVA per cassa P.A." },
  { code: "RF17", label: "RF17 — IVA per cassa" },
  { code: "RF18", label: "RF18 — Altro" },
  { code: "RF19", label: "RF19 — Regime forfettario" },
];

export const isTaxRegimeCode = (value: unknown) =>
  TAX_REGIME_CODES.some((entry) => entry.code === String(value || "").trim());
