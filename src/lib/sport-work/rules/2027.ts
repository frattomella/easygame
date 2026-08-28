import type { SportWorkRuleSet } from "./rule-set";

/**
 * Regole del lavoro sportivo per l'**anno solare 2027**.
 *
 * **Perche esiste gia, e cosa dichiara di non sapere.**
 *
 * Una stagione sportiva attraversa due anni solari: la 2026/27 produce
 * erogazioni nel 2026 e nel 2027, e il motore usa le regole dell'anno **della
 * data di pagamento**. Senza questo file, la prima rata di gennaio 2027
 * fallirebbe — correttamente, ma rendendo il modulo inutilizzabile per la
 * meta di ogni stagione.
 *
 * Le aliquote della Gestione separata vengono pubblicate da INPS **a febbraio
 * dell'anno di riferimento**: a oggi quelle del 2027 non esistono. Qui sono
 * riportate quelle del 2026 come **valore provvisorio dichiarato**, con stato
 * `PENDING_PROFESSIONAL_VALIDATION`.
 *
 * Non e il «fallback silenzioso all'anno precedente» che il modulo vieta: e
 * il suo contrario. Il valore e scritto, la sua provvisorieta e dichiarata, e
 * il motore la propaga fino alla schermata — un'erogazione datata 2027
 * mostra i contributi come **stima non definitiva** finche la circolare INPS
 * 2027 non viene recepita in questo file.
 *
 * Quando la circolare esce: si aggiornano `socialRates`, `annualCap` e
 * `minimumForFullCredit`, si porta lo stato a `VALIDATED_PROFESSIONAL` e si
 * valorizza `validatedAt`. **Le erogazioni gia registrate non si ricalcolano**
 * — portano con se lo snapshot delle regole con cui sono nate.
 */
export const SPORT_WORK_RULES_2027: SportWorkRuleSet = {
  year: 2027,
  validFrom: "2027-01-01",
  validTo: "2027-12-31",

  socialFranchise: {
    value: 5000,
    status: "VALIDATED_OFFICIAL",
    source:
      "D.Lgs. 28 febbraio 2021 n. 36, art. 35 — franchigia contributiva annua, a regime salvo modifica legislativa",
  },

  fiscalFranchise: {
    value: 15000,
    status: "VALIDATED_OFFICIAL",
    source:
      "D.Lgs. 28 febbraio 2021 n. 36, art. 36 c. 6 — franchigia fiscale annua, a regime salvo modifica legislativa",
  },

  reductionFactor: {
    value: 0.5,
    status: "VALIDATED_OFFICIAL",
    source:
      "D.Lgs. 36/2021, art. 35 — la riduzione al 50% si applica fino al 31/12/2027 incluso",
    note: "Ultimo anno della riduzione. Il rule set 2028 non esiste e non deve essere creato copiando questo.",
  },

  reductionExpiresOn: {
    value: "2027-12-31",
    status: "VALIDATED_OFFICIAL",
    source: "D.Lgs. 36/2021, art. 35 — termine finale della riduzione",
  },

  socialRates: {
    value: {
      NONE: 0.2703,
      OTHER_COVERAGE: 0.24,
      PENSIONER: 0.24,
    },
    status: "PENDING_PROFESSIONAL_VALIDATION",
    source:
      "Valore PROVVISORIO ripreso dalle aliquote 2026. Le aliquote della Gestione separata per il 2027 sono pubblicate da INPS con circolare di febbraio 2027 e a oggi non esistono.",
    note: "Finche questa voce resta PENDING, ogni erogazione datata 2027 dichiara i contributi come stima non definitiva. Non e un fallback silenzioso: il valore e scritto qui e la sua provvisorieta viaggia fino alla schermata.",
    validatedAt: null,
  },

  f24Causali: {
    value: {
      NONE: "CXX",
      OTHER_COVERAGE: "C10",
      PENSIONER: "C10",
    },
    status: "PENDING_PROFESSIONAL_VALIDATION",
    source: "Causali 2026, da riconfermare per il 2027",
    note: "V11 dell'analisi 28.",
    validatedAt: null,
  },

  employeeShare: {
    value: 1 / 3,
    status: "VALIDATED_OFFICIAL",
    source: "L. 335/1995, art. 2 c. 30 — un terzo al lavoratore",
  },

  employerShare: {
    value: 2 / 3,
    status: "VALIDATED_OFFICIAL",
    source: "L. 335/1995, art. 2 c. 30 — due terzi al committente",
  },

  annualCap: {
    value: 122295,
    status: "PENDING_PROFESSIONAL_VALIDATION",
    source: "Valore PROVVISORIO 2026: il massimale 2027 sara rivalutato",
    validatedAt: null,
  },

  minimumForFullCredit: {
    value: 18808,
    status: "PENDING_PROFESSIONAL_VALIDATION",
    source: "Valore PROVVISORIO 2026: il minimale 2027 sara rivalutato",
    note: "Dato informativo: non entra in nessun calcolo.",
    validatedAt: null,
  },

  volunteerMonthlyFlatCap: {
    value: 400,
    status: "VALIDATED_OFFICIAL",
    source:
      "D.Lgs. 36/2021, art. 29 c. 2 come modificato dal D.L. 71/2024 — tetto mensile dei rimborsi forfettari al volontario",
    note: "Condizioni di legittimita da validare (V17).",
  },

  contributionPaymentDay: {
    value: 16,
    status: "VALIDATED_PROFESSIONAL",
    source: "Versamento con F24 entro il 16 del mese successivo all'erogazione",
  },

  cashExtensionDayOfJanuary: {
    value: 12,
    status: "VALIDATED_PROFESSIONAL",
    source: "Cassa allargata: entro il 12 gennaio si imputa all'anno precedente",
    note: "Non applicata automaticamente.",
  },

  incomeTaxWithholding: {
    value: null,
    status: "PENDING_PROFESSIONAL_VALIDATION",
    source:
      "DPR 600/1973 art. 23 vs art. 25; TUIR art. 50 c. 1 lett. c-bis vs art. 53",
    note: "V1 dell'analisi 28. Non calcolata.",
    validatedAt: null,
  },

  contributionDeductibility: {
    value: null,
    status: "PENDING_PROFESSIONAL_VALIDATION",
    source: "TUIR art. 51 c. 2 lett. a)",
    note: "V2 dell'analisi 28. Non applicata.",
    validatedAt: null,
  },

  bonusTreatment: {
    value: null,
    status: "PENDING_PROFESSIONAL_VALIDATION",
    source:
      "D.Lgs. 36/2021 art. 36 c. 6-quater; DPR 600/1973 art. 30; AdE cons. giur. 14/2025",
    note: "V3 e V4 dell'analisi 28. Non applicato.",
    validatedAt: null,
  },
};
