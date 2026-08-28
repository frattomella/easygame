import type { SportWorkRuleSet } from "./rule-set";

/**
 * Regole del lavoro sportivo per l'**anno solare 2026**.
 *
 * Questo file e **dati, non logica**: nessuna formula, nessuna condizione.
 * Chi lo legge fra due anni deve poter risalire a ogni numero senza aprire
 * altro codice, ed e il motivo per cui `source` e obbligatorio su ogni voce.
 *
 * Le voci con stato `PENDING_PROFESSIONAL_VALIDATION` sono in fondo e hanno
 * `value: null`: sono le regole che il dominio conosce e che EasyGame **ha
 * scelto di non applicare** finche un professionista abilitato non le
 * conferma per iscritto (analisi 28, cap. 21). Il motore le legge, ne ricava
 * un avviso, e si ferma prima di produrre un numero che sembri definitivo.
 */
export const SPORT_WORK_RULES_2026: SportWorkRuleSet = {
  year: 2026,
  validFrom: "2026-01-01",
  validTo: "2026-12-31",

  socialFranchise: {
    value: 5000,
    status: "VALIDATED_OFFICIAL",
    source:
      "D.Lgs. 28 febbraio 2021 n. 36, art. 35 — franchigia contributiva annua riferita al lavoratore, su tutti i committenti, per cassa",
  },

  fiscalFranchise: {
    value: 15000,
    status: "VALIDATED_OFFICIAL",
    source:
      "D.Lgs. 28 febbraio 2021 n. 36, art. 36 c. 6 — franchigia fiscale annua riferita al lavoratore, su tutti i committenti",
  },

  reductionFactor: {
    value: 0.5,
    status: "VALIDATED_OFFICIAL",
    source:
      "D.Lgs. 28 febbraio 2021 n. 36, art. 35 — riduzione al 50% della base imponibile contributiva, in vigore fino al 31/12/2027",
    note: "Dal 1 gennaio 2028, a parita di compenso, la contribuzione raddoppia: il rule set 2028 dovra dichiarare 1.0 o il valore che la legge stabilira.",
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
    status: "VALIDATED_PROFESSIONAL",
    source:
      "INPS, circolare n. 8 del 3 febbraio 2026: aliquote della Gestione separata 2026 (25% IVS + 2,03% aggiuntive per chi non ha altra copertura; 24% per assicurati presso altra gestione e per i pensionati)",
    note: "Il riferimento e stato confermato: la circolare e la n. 8 del 3 febbraio 2026. Alcune fonti secondarie citavano per lo stesso contenuto una «n. 5/2026»: e sbagliato, e non va reintrodotto. Le aliquote erano gia concordi fra tutte le fonti. Vedi analisi 28, cap. 2.3 e V10.",
    validatedAt: null,
  },

  f24Causali: {
    value: {
      NONE: "CXX",
      OTHER_COVERAGE: "C10",
      PENSIONER: "C10",
    },
    status: "VALIDATED_PROFESSIONAL",
    source:
      "Causali contributo INPS per i lavoratori sportivi: CXX (senza altra copertura), C10 (con altra copertura o pensionato)",
    note: "V11 dell'analisi 28: un codice sbagliato produce un versamento inimputato. Da riconfermare a ogni cambio di annualita.",
    validatedAt: null,
  },

  employeeShare: {
    value: 1 / 3,
    status: "VALIDATED_OFFICIAL",
    source:
      "L. 8 agosto 1995 n. 335, art. 2 c. 30 — ripartizione dell'onere contributivo: un terzo al lavoratore",
  },

  employerShare: {
    value: 2 / 3,
    status: "VALIDATED_OFFICIAL",
    source:
      "L. 8 agosto 1995 n. 335, art. 2 c. 30 — ripartizione dell'onere contributivo: due terzi al committente",
  },

  annualCap: {
    value: 122295,
    status: "VALIDATED_PROFESSIONAL",
    source: "Massimale annuo della Gestione separata per il 2026",
    note: "Il valore e concorde; **il modo in cui il massimale si applica al lavoro sportivo con franchigia e riduzione non lo e**. EasyGame non tronca l'imponibile al massimale: quando il progressivo lo supera emette l'avviso `MASSIMALE_SUPERATO` e dichiara il trattamento da verificare.",
    validatedAt: null,
  },

  minimumForFullCredit: {
    value: 18808,
    status: "VALIDATED_PROFESSIONAL",
    source:
      "Minimale per l'accredito contributivo integrale nella Gestione separata, 2026",
    note: "Dato informativo per il lavoratore: non entra in nessun calcolo di EasyGame.",
    validatedAt: null,
  },

  volunteerMonthlyFlatCap: {
    value: 400,
    status: "VALIDATED_OFFICIAL",
    source:
      "D.Lgs. 36/2021, art. 29 c. 2 come modificato dal D.L. 31 maggio 2024 n. 71 — rimborsi forfettari al volontario, tetto mensile",
    note: "Il tetto e legge; **le condizioni di legittimita** (manifestazione riconosciuta, delibera dell'organo amministrativo, autodichiarazione del volontario) restano da validare — V17 dell'analisi 28.",
  },

  contributionPaymentDay: {
    value: 16,
    status: "VALIDATED_PROFESSIONAL",
    source:
      "Versamento dei contributi della Gestione separata con F24 entro il 16 del mese successivo all'erogazione",
  },

  cashExtensionDayOfJanuary: {
    value: 12,
    status: "VALIDATED_PROFESSIONAL",
    source:
      "Cassa allargata: i compensi corrisposti entro il 12 gennaio si imputano all'anno precedente",
    note: "EasyGame **non applica** l'imputazione automatica: propone l'anno della data di pagamento e lascia che sia una persona a spostarlo, perche la scelta dipende dal periodo di competenza e non dalla sola data.",
  },

  /* ---------------------------------------------------------------------
     Da qui in giu: regole che il dominio conosce e che EasyGame NON applica.
     `value: null` non e un buco, e una dichiarazione.
     --------------------------------------------------------------------- */

  incomeTaxWithholding: {
    value: null,
    status: "PENDING_PROFESSIONAL_VALIDATION",
    source:
      "DPR 600/1973 art. 23 (ritenuta per scaglioni sui redditi assimilati) vs art. 25 (20% a titolo d'acconto sui redditi di lavoro autonomo); TUIR art. 50 c. 1 lett. c-bis vs art. 53",
    note: "V1 dell'analisi 28, l'incertezza piu costosa del modulo: la qualificazione reddituale della co.co.co. sportiva dilettantistica decide QUALE ritenuta si applica sull'eccedenza dei 15.000, e le due strade danno netti diversi. EasyGame calcola e mostra l'IMPONIBILE FISCALE ECCEDENTE e si ferma li.",
    validatedAt: null,
  },

  contributionDeductibility: {
    value: null,
    status: "PENDING_PROFESSIONAL_VALIDATION",
    source: "TUIR art. 51 c. 2 lett. a) per i redditi assimilati",
    note: "V2 dell'analisi 28: l'incastro fra la deducibilita dei contributi a carico del lavoratore e una franchigia di 15.000 che non e una deduzione ordinaria non e pacifico. Sull'esempio D dell'analisi cambia il netto di 135 euro. Non applicata.",
    validatedAt: null,
  },

  bonusTreatment: {
    value: null,
    status: "PENDING_PROFESSIONAL_VALIDATION",
    source:
      "D.Lgs. 36/2021 art. 36 c. 6-quater; DPR 600/1973 art. 30; Agenzia delle Entrate, consulenza giuridica n. 14/2025",
    note: "V3 e V4 dell'analisi 28: se i premi concorrano alle soglie, quale ritenuta subiscano e se vadano in CU o nel quadro SH del 770 non e uniforme; e la distinzione fra premio vero e retribuzione variabile la fa il contratto, non l'etichetta. EasyGame registra il premio come entita separata, non lo somma al progressivo dei compensi e ne dichiara il trattamento fiscale da verificare.",
    validatedAt: null,
  },
};
