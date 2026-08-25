"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Eye,
  Link2,
  Pencil,
  Plus,
  Send,
  Settings,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SaveStatus, type SaveState } from "@/components/ui/save-status";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import { FormFieldCard } from "./form-field-card";
import { FormRenderer } from "./form-renderer";
import { DynamicFieldPicker } from "./dynamic-field-picker";
import { FormPublicLink } from "./form-public-link";
import {
  createFieldId,
  FORM_FIELD_TYPES,
  getSchemaSubjects,
  normalizeFormSchema,
  schemasAreEqual,
  type FormField,
  type FormFieldType,
  type FormSchema,
  type FormTemplateDetail,
} from "@/lib/forms/model";
import { FORM_SUBJECTS } from "@/lib/forms/dynamic-fields";
import { createCoalescingSaver } from "@/lib/performance";
import * as formsApi from "@/lib/api/forms";

/**
 * Il builder.
 *
 * **Cosa si vede appena si apre**: titolo, descrizione, i campi, e
 * «Aggiungi campo». Nient'altro. Le impostazioni del modulo — messaggio di
 * conferma, data di chiusura, email di chi compila — stanno in un pannello
 * che si apre, perche non si guardano mentre si scrivono le domande.
 *
 * **Bozza e pubblicazione sono due cose diverse.** Si modifica sempre la
 * bozza, che si salva da sola; il pubblico continua a vedere l'ultima
 * versione pubblicata finche non si preme «Pubblica». Una barra lo dice
 * esplicitamente quando le due divergono, perche altrimenti si crede di aver
 * corretto un modulo che le famiglie stanno ancora compilando com'era.
 */

type FormBuilderProps = {
  template: FormTemplateDetail;
  onBack: () => void;
  onTemplateChange: (template: FormTemplateDetail) => void;
};

const newField = (type: FormFieldType): FormField => ({
  id: createFieldId(),
  type,
  label: type === "section" ? "Nuova sezione" : "Domanda senza titolo",
  description: "",
  required: false,
  placeholder: "",
  options:
    type === "single_choice" || type === "multiple_choice" || type === "dropdown"
      ? ["Opzione 1", "Opzione 2"]
      : [],
  binding: "",
});

export function FormBuilder({
  template,
  onBack,
  onTemplateChange,
}: FormBuilderProps) {
  const { showToast } = useToast();
  const [schema, setSchema] = useState<FormSchema>(() =>
    normalizeFormSchema(template.draft),
  );
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [mode, setMode] = useState<"edit" | "preview">("edit");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [previewValues, setPreviewValues] = useState<Record<string, unknown>>({});

  const templateId = template.id;
  const lastSaved = useRef<FormSchema>(normalizeFormSchema(template.draft));

  /*
    Accorpamento: due salvataggi sovrapposti arriverebbero al server in ordine
    non garantito e l'ultima modifica potrebbe perdersi (10 - UI/UX).
  */
  const saver = useMemo(
    () =>
      createCoalescingSaver<FormSchema>(
        async (value) => {
          const updated = await formsApi.saveFormDraft(templateId, value);
          lastSaved.current = normalizeFormSchema(updated.draft);
          onTemplateChange(updated);
          setSavedAt(new Date());
          setSaveState("saved");
        },
        { isEqual: (candidate) => schemasAreEqual(candidate, lastSaved.current) },
      ),
    [templateId, onTemplateChange],
  );

  useEffect(() => {
    if (schemasAreEqual(schema, lastSaved.current)) return;

    setSaveState("saving");
    const timer = setTimeout(() => {
      saver(schema).catch((error: any) => {
        setSaveState("error");
        showToast("error", error?.message || "Non riesco a salvare la bozza");
      });
    }, 1200);

    return () => clearTimeout(timer);
  }, [schema, saver, showToast]);

  const patchField = useCallback((fieldId: string, patch: Partial<FormField>) => {
    setSchema((current) => ({
      ...current,
      fields: current.fields.map((field) =>
        field.id === fieldId ? { ...field, ...patch } : field,
      ),
    }));
  }, []);

  const addField = (type: FormFieldType) => {
    setSchema((current) => ({
      ...current,
      fields: [...current.fields, newField(type)],
    }));
  };

  const moveField = (index: number, direction: -1 | 1) => {
    setSchema((current) => {
      const target = index + direction;
      if (target < 0 || target >= current.fields.length) return current;
      const fields = [...current.fields];
      [fields[index], fields[target]] = [fields[target], fields[index]];
      return { ...current, fields };
    });
  };

  const duplicateField = (index: number) => {
    setSchema((current) => {
      const source = current.fields[index];
      const fields = [...current.fields];
      fields.splice(index + 1, 0, { ...source, id: createFieldId() });
      return { ...current, fields };
    });
  };

  const removeField = (fieldId: string) => {
    setSchema((current) => ({
      ...current,
      fields: current.fields.filter((field) => field.id !== fieldId),
    }));
  };

  const publish = async () => {
    setPublishing(true);
    try {
      /*
        Si salva prima di pubblicare: il debounce dell'autosave potrebbe non
        essere ancora scaduto, e pubblicare una bozza vecchia di un secondo e
        peggio di non pubblicare.
      */
      await saver(schema);
      const updated = await formsApi.publishForm(templateId);
      onTemplateChange(updated);
      showToast(
        "success",
        `Modulo pubblicato — versione ${updated.publishedVersion}`,
      );
    } catch (error: any) {
      showToast("error", error?.message || "Non riesco a pubblicare il modulo");
    } finally {
      setPublishing(false);
    }
  };

  const subjects = getSchemaSubjects(schema);
  const hasUnpublishedChanges =
    template.published !== null && !schemasAreEqual(schema, template.published);

  return (
    <div className="space-y-4">
      {/* Barra: impila sotto sm, non produce mai scorrimento orizzontale. */}
      <div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-3 sm:flex-row sm:items-center">
        <Button type="button" variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Moduli
        </Button>

        <SaveStatus state={saveState} savedAt={savedAt} className="sm:ml-2" />

        <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setMode(mode === "edit" ? "preview" : "edit")}
          >
            {mode === "edit" ? (
              <>
                <Eye className="mr-2 h-4 w-4" />
                Anteprima
              </>
            ) : (
              <>
                <Pencil className="mr-2 h-4 w-4" />
                Modifica
              </>
            )}
          </Button>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setSettingsOpen((current) => !current)}
            aria-expanded={settingsOpen}
          >
            <Settings className="mr-2 h-4 w-4" />
            Impostazioni
          </Button>

          <Button type="button" size="sm" onClick={publish} disabled={publishing}>
            <Send className="mr-2 h-4 w-4" />
            Pubblica
          </Button>
        </div>
      </div>

      {hasUnpublishedChanges ? (
        <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          Stai modificando la bozza. Chi apre il link pubblico vede ancora la
          versione {template.publishedVersion}: premi «Pubblica» per
          sostituirla.
        </p>
      ) : null}

      {settingsOpen ? (
        <FormSettingsPanel
          schema={schema}
          template={template}
          onChange={(settings) =>
            setSchema((current) => ({
              ...current,
              settings: { ...current.settings, ...settings },
            }))
          }
          onTemplateChange={onTemplateChange}
        />
      ) : null}

      <Card>
        <CardHeader className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="form-title" className="sr-only">
              Titolo del modulo
            </Label>
            <Input
              id="form-title"
              value={schema.title}
              onChange={(event) =>
                setSchema((current) => ({ ...current, title: event.target.value }))
              }
              className="h-auto border-0 px-0 font-display text-xl font-semibold shadow-none focus-visible:ring-0"
              placeholder="Titolo del modulo"
            />
            <Label htmlFor="form-description" className="sr-only">
              Descrizione
            </Label>
            <Textarea
              id="form-description"
              rows={2}
              value={schema.description}
              onChange={(event) =>
                setSchema((current) => ({
                  ...current,
                  description: event.target.value,
                }))
              }
              className="resize-none border-0 px-0 shadow-none focus-visible:ring-0"
              placeholder="Descrizione: cosa serve, entro quando, chi contattare."
            />
          </div>

          {subjects.length ? (
            <p className="text-xs text-slate-500">
              Questo modulo riguarda:{" "}
              {subjects.map((subject) => FORM_SUBJECTS[subject].label).join(", ")}.
              Alla compilazione verra chiesto quale.
            </p>
          ) : null}
        </CardHeader>

        <CardContent className="space-y-4">
          {mode === "preview" ? (
            <div className="rounded-lg border border-dashed border-slate-300 p-4 sm:p-6">
              <FormRenderer
                fields={schema.fields}
                values={previewValues}
                files={{}}
                onChange={(fieldId, value) =>
                  setPreviewValues((current) => ({ ...current, [fieldId]: value }))
                }
              />
            </div>
          ) : (
            <>
              {schema.fields.map((field, index) => (
                <FormFieldCard
                  key={field.id}
                  field={field}
                  index={index}
                  total={schema.fields.length}
                  onChange={(patch) => patchField(field.id, patch)}
                  onDuplicate={() => duplicateField(index)}
                  onRemove={() => removeField(field.id)}
                  onMove={(direction) => moveField(index, direction)}
                />
              ))}

              {schema.fields.length === 0 ? (
                <p className="rounded-md border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
                  Nessun campo. Comincia da «Aggiungi campo».
                </p>
              ) : null}

              <div className="flex flex-wrap gap-2">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button type="button" variant="outline">
                      <Plus className="mr-2 h-4 w-4" />
                      Aggiungi campo
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="start"
                    className="max-h-80 w-64 overflow-y-auto"
                  >
                    <DropdownMenuLabel>Tipo di risposta</DropdownMenuLabel>
                    {FORM_FIELD_TYPES.map((option) => (
                      <DropdownMenuItem
                        key={option.value}
                        onSelect={() => addField(option.value)}
                        className="flex-col items-start gap-0.5"
                      >
                        <span className="font-medium">{option.label}</span>
                        <span className="text-xs text-slate-500">
                          {option.hint}
                        </span>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>

                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setPickerOpen(true)}
                >
                  <Link2 className="mr-2 h-4 w-4" />
                  Dato EasyGame
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <DynamicFieldPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onPick={(picked) =>
          setSchema((current) => ({
            ...current,
            fields: [
              ...current.fields,
              {
                ...newField(picked.fieldType),
                label: picked.label,
                binding: picked.key,
              },
            ],
          }))
        }
      />
    </div>
  );
}

/**
 * Le impostazioni del modulo.
 *
 * Sono cinque e stanno tutte insieme perche si toccano una volta sola, quando
 * il modulo e quasi pronto. Metterle accanto ai campi vorrebbe dire leggerle
 * ogni volta che si aggiunge una domanda.
 */
function FormSettingsPanel({
  schema,
  template,
  onChange,
  onTemplateChange,
}: {
  schema: FormSchema;
  template: FormTemplateDetail;
  onChange: (settings: Partial<FormSchema["settings"]>) => void;
  onTemplateChange: (template: FormTemplateDetail) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Impostazioni del modulo</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <FormPublicLink template={template} onTemplateChange={onTemplateChange} />

        <div className="space-y-2">
          <Label htmlFor="success-message">Messaggio dopo l&apos;invio</Label>
          <Textarea
            id="success-message"
            rows={2}
            value={schema.settings.successMessage}
            onChange={(event) =>
              onChange({ successMessage: event.target.value })
            }
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="close-at">Chiude il</Label>
            <Input
              id="close-at"
              type="date"
              value={schema.settings.closeAt.slice(0, 10)}
              onChange={(event) => onChange({ closeAt: event.target.value })}
            />
            <p className="text-xs text-slate-500">
              Dopo questa data il link pubblico non accetta piu risposte.
            </p>
          </div>

          <div className="space-y-3">
            <label className="flex items-start gap-3 text-sm text-slate-700">
              <Switch
                checked={schema.settings.collectRespondentEmail}
                onCheckedChange={(checked) =>
                  onChange({ collectRespondentEmail: checked })
                }
                aria-label="Chiedi l'email a chi compila"
              />
              <span>
                Chiedi l&apos;email a chi compila
                <span className="block text-xs text-slate-500">
                  Serve alla segreteria per ricontattare chi ha sbagliato un dato.
                </span>
              </span>
            </label>

            <label className="flex items-start gap-3 text-sm text-slate-700">
              <Switch
                checked={schema.settings.notifyOnSubmit}
                onCheckedChange={(checked) =>
                  onChange({ notifyOnSubmit: checked })
                }
                aria-label="Avvisami a ogni invio"
              />
              <span>
                Avvisami a ogni invio
                <span className="block text-xs text-slate-500">
                  Notifica in EasyGame e per email.
                </span>
              </span>
            </label>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
