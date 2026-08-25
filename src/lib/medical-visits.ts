/**
 * Tipologia di una visita medica.
 *
 * **Perche questo file esiste** (Blocco 7, punto 5). Nella scheda
 * dell'allenatore «Tipologia» era un campo di testo che nessun form riempiva:
 * si vedeva sempre `-`, e non c'era modo di dargli un valore. Nella scheda
 * dell'atleta esisteva invece una tendina con due voci scritte a mano dentro
 * il JSX. Stesso concetto, due destini diversi, nessun modello.
 *
 * La domanda posta era: chiarire il significato, oppure togliere il campo. Il
 * significato c'e ed e quello della normativa italiana sulla tutela sanitaria
 * dell'attivita sportiva: una visita e **agonistica** o **non agonistica**, e
 * le due hanno accertamenti, validita e destinatari diversi. Il campo resta,
 * con l'elenco chiuso che gia usava l'atleta.
 *
 * **I valori memorizzati non cambiano.** `"Agonistica"` e `"Non Agonistica"`
 * sono le stringhe gia in archivio: normalizzarle avrebbe reso «tipo
 * sconosciuto» ogni visita esistente in cambio di niente.
 */

export type MedicalVisitTypeOption = {
  value: string;
  label: string;
  /** Cosa vuol dire, per chi in segreteria non lo sa. */
  hint: string;
};

export const MEDICAL_VISIT_TYPES: MedicalVisitTypeOption[] = [
  {
    value: "Agonistica",
    label: "Agonistica",
    hint: "Per chi partecipa a competizioni federali: prevede ECG ed e piu stringente",
  },
  {
    value: "Non Agonistica",
    label: "Non agonistica",
    hint: "Per attivita sportiva non competitiva, e per allenatori e staff",
  },
];

export const DEFAULT_MEDICAL_VISIT_TYPE = "Non Agonistica";

/**
 * Per un allenatore o un membro dello staff la visita agonistica non ha
 * senso: non gareggia. Il default e quindi «non agonistica», mentre per un
 * atleta resta «agonistica».
 */
export const DEFAULT_ATHLETE_MEDICAL_VISIT_TYPE = "Agonistica";

/**
 * Il tipo di una visita, con il default per chi non ce l'ha.
 *
 * Non rifiuta i valori fuori elenco: le visite gia in archivio possono
 * portare stringhe scritte prima che l'elenco esistesse.
 */
export const normalizeMedicalVisitType = (
  value?: string | null,
  fallback: string = DEFAULT_MEDICAL_VISIT_TYPE,
): string => String(value || "").trim() || fallback;

export const medicalVisitTypeLabel = (value?: string | null): string => {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const known = MEDICAL_VISIT_TYPES.find(
    (option) => option.value.toLowerCase() === raw.toLowerCase(),
  );
  return known ? known.label : raw;
};

/** Le opzioni da mostrare, con eventuali valori storici gia in archivio. */
export const medicalVisitTypeOptions = (
  currentValue?: string | null,
): MedicalVisitTypeOption[] => {
  const raw = String(currentValue || "").trim();
  if (
    !raw ||
    MEDICAL_VISIT_TYPES.some(
      (option) => option.value.toLowerCase() === raw.toLowerCase(),
    )
  ) {
    return MEDICAL_VISIT_TYPES;
  }

  return [
    ...MEDICAL_VISIT_TYPES,
    { value: raw, label: raw, hint: "Valore gia presente in archivio" },
  ];
};
