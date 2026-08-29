/**
 * I moduli che EasyGame propone gia scritti.
 *
 * **Perche esistono.** Un builder vuoto e onesto ma inutile: chi apre
 * «Modulistica» per la prima volta ha in mente «l'iscrizione», non «un campo
 * testo breve collegato al nome dell'atleta». Il modello di partenza fa
 * vedere in un colpo solo come si usa un campo dinamico, come si separano le
 * sezioni e dove sta il consenso.
 *
 * Restano **modelli**, non moduli speciali: appena creati diventano una bozza
 * come le altre, modificabile e cancellabile.
 */

import {
  createFieldId,
  DEFAULT_FORM_SETTINGS,
  type FormField,
  type FormFieldType,
  type FormSchema,
} from "./model";
import { getDynamicField } from "./dynamic-fields";

export type StarterTemplateKey = "blank" | "online_enrollment" | "medical_consent";

export type StarterTemplateDefinition = {
  key: StarterTemplateKey;
  label: string;
  description: string;
};

export const STARTER_TEMPLATES: StarterTemplateDefinition[] = [
  {
    key: "blank",
    label: "Modulo vuoto",
    description: "Parti da zero: titolo, descrizione e un primo campo.",
  },
  {
    key: "online_enrollment",
    label: "Iscrizione online",
    description:
      "Dati dell'atleta, contatti del genitore, documenti e consenso. Pensato per il link pubblico.",
  },
  {
    key: "medical_consent",
    label: "Consenso e certificato medico",
    description:
      "Richiesta del certificato medico con il consenso al trattamento dei dati sanitari.",
  },
];

const field = (
  type: FormFieldType,
  label: string,
  extra: Partial<FormField> = {},
): FormField => ({
  id: createFieldId(),
  type,
  label,
  description: "",
  required: false,
  placeholder: "",
  options: [],
  binding: "",
  consentKey: "",
  ...extra,
});

/**
 * Un campo collegato a un dato EasyGame.
 *
 * L'etichetta e il tipo arrivano dal catalogo: e cosi che «Telefono del
 * genitore» resta una frase sola, scritta in un posto solo.
 */
const boundField = (binding: string, extra: Partial<FormField> = {}): FormField => {
  const definition = getDynamicField(binding);
  if (!definition) {
    throw new Error(`Dato EasyGame sconosciuto: ${binding}`);
  }

  return field(definition.fieldType, definition.label, {
    binding: definition.key,
    ...extra,
  });
};

const RELATIONSHIP_OPTIONS = ["Madre", "Padre", "Tutore", "Altro"];
const GENDER_OPTIONS = ["Maschile", "Femminile", "Altro"];

export const createStarterSchema = (key: StarterTemplateKey): FormSchema => {
  if (key === "online_enrollment") {
    return {
      title: "Iscrizione online",
      description:
        "Compila i dati richiesti per iscrivere l'atleta. La segreteria verifica e conferma l'iscrizione.",
      fields: [
        field("section", "Dati dell'atleta"),
        boundField("athlete.firstName", { required: true }),
        boundField("athlete.lastName", { required: true }),
        boundField("athlete.birthDate", { required: true }),
        boundField("athlete.gender", { options: GENDER_OPTIONS }),
        boundField("athlete.fiscalCode", {
          description: "Sedici caratteri, come sulla tessera sanitaria.",
        }),
        boundField("athlete.birthPlace"),
        boundField("athlete.address"),
        boundField("athlete.city"),
        boundField("athlete.postalCode"),

        field("section", "Genitore o tutore"),
        boundField("guardian.name", { required: true }),
        boundField("guardian.surname", { required: true }),
        boundField("guardian.relationship", {
          required: true,
          options: RELATIONSHIP_OPTIONS,
        }),
        boundField("guardian.phone", { required: true }),
        boundField("guardian.email", { required: true }),
        boundField("guardian.fiscalCode"),

        field("section", "Documenti"),
        field("file_upload", "Documento di identita del genitore"),
        field("file_upload", "Certificato medico sportivo"),

        field("section", "Consensi"),
        field("checkbox", "Consenso al trattamento dei dati personali", {
          required: true,
          description:
            "Dichiaro di aver letto l'informativa e autorizzo il trattamento dei dati per le finalita dell'attivita sportiva.",
        }),
        field("checkbox", "Consenso all'uso di foto e video", {
          description:
            "Facoltativo: autorizzo la pubblicazione di immagini dell'attivita sportiva sui canali della societa.",
        }),
        field("signature", "Firma del genitore", { required: true }),
      ],
      settings: {
        ...DEFAULT_FORM_SETTINGS,
        successMessage:
          "Richiesta di iscrizione inviata. La segreteria la esamina e ti ricontatta.",
      },
    };
  }

  if (key === "medical_consent") {
    return {
      title: "Certificato medico",
      description:
        "Carica il certificato medico sportivo in corso di validita.",
      fields: [
        field("section", "Atleta"),
        boundField("athlete.firstName", { required: true }),
        boundField("athlete.lastName", { required: true }),
        boundField("athlete.birthDate", { required: true }),

        field("section", "Certificato"),
        field("dropdown", "Tipo di certificato", {
          required: true,
          options: ["Agonistica", "Non agonistica"],
        }),
        field("date", "Data di scadenza", { required: true }),
        field("file_upload", "Certificato medico", { required: true }),

        field("checkbox", "Consenso al trattamento dei dati sanitari", {
          required: true,
          description:
            "Autorizzo la societa a conservare il certificato per gli adempimenti previsti dalla normativa sportiva.",
        }),
      ],
      settings: {
        ...DEFAULT_FORM_SETTINGS,
        successMessage: "Certificato inviato. Grazie!",
      },
    };
  }

  return {
    title: "Nuovo modulo",
    description: "",
    fields: [field("short_text", "Nome e cognome", { required: true })],
    settings: { ...DEFAULT_FORM_SETTINGS },
  };
};

export const isStarterTemplateKey = (
  value?: string | null,
): value is StarterTemplateKey =>
  STARTER_TEMPLATES.some((template) => template.key === value);
