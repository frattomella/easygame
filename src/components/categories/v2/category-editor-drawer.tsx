"use client";

import React, { useState } from "react";
import { normalizeCategoryBirthYears } from "@/lib/category-utils";
import { readCategoryCompatibilityList } from "@/lib/category-compatibility";
import {
  contaAtletiDisallineati,
  normalizeClubSites,
  rilevaDisallineamentiDiSede,
} from "@/lib/club-sites";
import { UNKNOWN_SITE_LABEL } from "@/lib/categories/display";
import { sortByName } from "@/lib/sorting";
import { cn } from "@/lib/utils";
import { Drawer, DrawerSection } from "@/components/web/overlays/Drawer";
import {
  Field,
  FieldSizeProvider,
  FormGrid,
  MultiSelect,
  SearchableSelect,
  Select,
  TextInput,
  ValidationSummary,
} from "@/components/web/forms/Field";
import { Button } from "@/components/web/primitives/Button";
import { Checkbox } from "@/components/web/primitives/Controls";
import { InsetBlock } from "@/components/web/primitives/Surface";
import { AlertBlock } from "@/components/web/page/Alerts";
import { InfoCard } from "@/components/web/page/Cards";
import { useToast } from "@/components/ui/toast-notification";

const currentYear = new Date().getFullYear();
const birthYearOptions = Array.from({ length: 80 }, (_, index) => {
  const year = String(currentYear - index);
  return { value: year, label: year };
});

export const CATEGORY_DESCRIPTION_MAX_LENGTH = 25;

/**
 * Le otto tonalita della categoria: sono **dati** del club (la riga
 * `categories.color` porta la classe), non un token del sistema. Restano le
 * stesse della V1, cosi una categoria salvata ieri si legge oggi con lo
 * stesso colore.
 */
export const CATEGORY_COLOR_OPTIONS = [
  { value: "bg-blue-500 text-white", label: "Blu" },
  { value: "bg-green-500 text-white", label: "Verde" },
  { value: "bg-red-500 text-white", label: "Rosso" },
  { value: "bg-yellow-500 text-white", label: "Giallo" },
  { value: "bg-purple-500 text-white", label: "Viola" },
  { value: "bg-pink-500 text-white", label: "Rosa" },
  { value: "bg-indigo-500 text-white", label: "Indaco" },
  { value: "bg-orange-500 text-white", label: "Arancione" },
] as const;

export const DEFAULT_CATEGORY_COLOR = CATEGORY_COLOR_OPTIONS[0].value;

/** La classe di sfondo della categoria (`bg-blue-500`), per il punto colorato. */
export const categoryColorClass = (color: string | null | undefined) =>
  String(color || DEFAULT_CATEGORY_COLOR).split(" ")[0] || "bg-blue-500";

/** Il punto colorato della categoria: 8px, il colore che il club ha scelto. */
export function CategoryColorDot({
  color,
  className,
  size = 8,
}: {
  color: string | null | undefined;
  className?: string;
  size?: number;
}) {
  return (
    <span
      aria-hidden
      className={cn("inline-block shrink-0 rounded-full", categoryColorClass(color), className)}
      style={{ width: size, height: size }}
    />
  );
}

interface CategoryEditorDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: any) => Promise<boolean | void> | boolean | void;
  initialData?: any;
  isEditing?: boolean;
  availableTrainers?: {
    id: string;
    name: string;
  }[];
  initialAssignedTrainerIds?: string[];
  /**
   * Le altre categorie del club, per configurare la compatibilita. La
   * categoria in modifica viene esclusa: non ha senso dichiararla compatibile
   * con se stessa.
   */
  availableCategories?: {
    id: string;
    name: string;
  }[];
  /**
   * Le sedi attive del club. Vuote o con una sola voce il club e mono-sede e
   * la sezione non compare: chi non ha il problema non vede la soluzione.
   */
  availableSites?: {
    id: string;
    name: string;
  }[];
  /** Le sedi in cui la categoria e gia attiva, in modifica. */
  initialSiteIds?: string[];
  /**
   * Gli atleti del club, per **contare** cosa il cambio di sede rende
   * incoerente (P0-8).
   *
   * Non servono a spostare niente: servono a poterlo dire prima. La
   * decisione e che un cambio di sede non muove gli atleti e non si
   * rifiuta — ma non avviene nemmeno in silenzio.
   */
  athletes?: unknown[];
}

const getInitialFormState = (
  initialData?: any,
  initialAssignedTrainerIds: string[] = [],
  initialSiteIds: string[] = [],
) => {
  const birthYears = normalizeCategoryBirthYears(initialData || {});

  return {
    name: initialData?.name || "",
    description: initialData?.sport || initialData?.description || "",
    birthYearFrom: birthYears.birthYearFrom?.toString() || "",
    birthYearTo: birthYears.birthYearTo?.toString() || "",
    color: initialData?.color || DEFAULT_CATEGORY_COLOR,
    assignedTrainerIds: initialAssignedTrainerIds,
    compatibleCategoryIds: readCategoryCompatibilityList(initialData),
    siteIds: initialSiteIds,
  };
};

type FormState = ReturnType<typeof getInitialFormState>;
type FormError = { id?: string; label: string; field: keyof FormState };

const ID = "categoria";

/**
 * Il cassetto crea/modifica categoria (guideline 08 §8.5: 720, a sezioni,
 * piede fisso). Sostituisce la modale `CategoryEditorDialog` della V1 con gli
 * **stessi campi** e lo **stesso contratto** verso la pagina: `onSubmit`
 * riceve lo stesso payload (nome, descrizione, anni, colore, allenatori,
 * compatibili, sedi, riallineamento) e, se torna `false`, il cassetto resta
 * aperto e non azzera niente.
 *
 * Quattro sezioni: identita · sedi e gruppi operativi (solo multi-sede,
 * ADR-0055) · categorie compatibili (ADR-0030) · allenatori.
 */
export function CategoryEditorDrawer({
  isOpen,
  onClose,
  onSubmit,
  initialData,
  isEditing = false,
  availableTrainers = [],
  initialAssignedTrainerIds = [],
  availableCategories = [],
  availableSites = [],
  initialSiteIds = [],
  athletes = [],
}: CategoryEditorDrawerProps) {
  const { showToast } = useToast();
  const [formData, setFormData] = useState<FormState>(
    getInitialFormState(initialData, initialAssignedTrainerIds, initialSiteIds),
  );
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<FormError[]>([]);
  /**
   * **Dove riallinearli, se chi salva lo chiede.**
   *
   * Vuoto significa «non riallineare»: e il predefinito, ed e la
   * differenza fra un'operazione offerta e una migrazione silenziosa. Il
   * salvataggio avviene comunque.
   */
  const [sedeDiRiallineamento, setSedeDiRiallineamento] = useState("");

  /**
   * **Il modulo si reinizializza quando si apre su un bersaglio diverso, non
   * a ogni re-render del genitore.**
   *
   * Il genitore passa `availableTrainers`/`initialAssignedTrainerIds`/
   * `initialSiteIds` come array ricostruiti a ogni render, e un errore che
   * passa da `showToast` fa ri-renderizzare il genitore proprio mentre il
   * cassetto e aperto. Se il reset ripartisse per riferimento, chi sta
   * correggendo un campo perderebbe cio che ha appena scritto.
   *
   * La chiave che conta e il **bersaglio** (la categoria in modifica, o
   * "nuova" in creazione): finche il cassetto resta aperto sullo stesso
   * bersaglio, un re-render qualunque non tocca `formData`. Alla chiusura la
   * chiave si azzera, cosi una riapertura sullo stesso bersaglio riparte
   * comunque da capo.
   */
  const resetTargetRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    if (!isOpen) {
      resetTargetRef.current = null;
      return;
    }

    const targetKey = String(initialData?.id ?? "__new__");
    if (resetTargetRef.current === targetKey) {
      return;
    }

    resetTargetRef.current = targetKey;
    setFormData(
      getInitialFormState(
        initialData,
        initialAssignedTrainerIds,
        initialSiteIds,
      ),
    );
    setDirty(false);
    setErrors([]);
    setSedeDiRiallineamento("");
    // Le liste di riferimento (allenatori/sedi disponibili) non devono far
    // ripartire il reset: solo l'apertura su un bersaglio nuovo lo fa.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, initialData]);

  const update = (patch: Partial<FormState>) => {
    setFormData((prev) => ({ ...prev, ...patch }));
    setDirty(true);
    if (errors.length) setErrors([]);
  };

  /*
    Il club mono-sede non vede il concetto: una sola sede non aggiunge
    informazione, e il gruppo operativo resta implicito (ADR-0055).
  */
  const showSites = availableSites.length >= 2;

  const handleSiteToggle = (siteId: string) =>
    update({
      siteIds: formData.siteIds.includes(siteId)
        ? formData.siteIds.filter((id: string) => id !== siteId)
        : [...formData.siteIds, siteId],
    });

  /**
   * **Che cosa questo cambio rende incoerente** (P0-8).
   *
   * Si ricalcola a ogni tocco su una sede, cosi il numero si muove insieme
   * alla scelta invece di comparire dopo. Chi toglie Scauri vede subito
   * quanti atleti ci restano appesi, e puo rimettere la spunta.
   */
  const disallineamenti = React.useMemo(() => {
    if (!showSites || !isEditing) return [];

    return rilevaDisallineamentiDiSede({
      categoryId: String(initialData?.id || ""),
      siteIds: formData.siteIds,
      athletes,
      sites: normalizeClubSites(availableSites),
    });
  }, [showSites, isEditing, initialData?.id, formData.siteIds, athletes, availableSites]);

  const atletiDisallineati = contaAtletiDisallineati(disallineamenti);

  React.useEffect(() => {
    /* Una sede che non e piu fra quelle scelte non e piu una destinazione. */
    if (
      sedeDiRiallineamento &&
      sedeDiRiallineamento !== "__senza_sede__" &&
      !formData.siteIds.includes(sedeDiRiallineamento)
    ) {
      setSedeDiRiallineamento("");
    }
  }, [formData.siteIds, sedeDiRiallineamento]);

  const compatibilityOptions = React.useMemo(
    () =>
      sortByName(
        availableCategories.filter(
          (category) => category.id && category.id !== initialData?.id,
        ),
        (category) => category.name,
      ),
    [availableCategories, initialData?.id],
  );

  const validate = (): FormError[] => {
    const found: FormError[] = [];
    const birthYearFrom = Number(formData.birthYearFrom);
    const birthYearTo = String(formData.birthYearTo).trim()
      ? Number(formData.birthYearTo)
      : birthYearFrom;

    if (!formData.name.trim()) {
      found.push({ id: `${ID}-name`, label: "Il nome categoria è obbligatorio", field: "name" });
    }
    if (!formData.birthYearFrom || !Number.isInteger(birthYearFrom)) {
      found.push({ id: `${ID}-birth-from`, label: "Inserisci un anno di nascita valido", field: "birthYearFrom" });
    } else if (!Number.isInteger(birthYearTo)) {
      found.push({ id: `${ID}-birth-to`, label: "L'anno di nascita finale non è valido", field: "birthYearTo" });
    } else if (birthYearFrom > birthYearTo) {
      found.push({
        id: `${ID}-birth-from`,
        label: "L'anno di nascita iniziale non può essere maggiore di quello finale",
        field: "birthYearFrom",
      });
    }
    if (formData.description.trim().length > CATEGORY_DESCRIPTION_MAX_LENGTH) {
      found.push({
        id: `${ID}-description`,
        label: `La descrizione categoria deve essere al massimo ${CATEGORY_DESCRIPTION_MAX_LENGTH} caratteri`,
        field: "description",
      });
    }
    return found;
  };

  const errorFor = (field: keyof FormState) => errors.find((e) => e.field === field)?.label;

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();

    const found = validate();
    setErrors(found);
    if (found.length) {
      document.getElementById(found[0].id || "")?.focus();
      return;
    }

    const birthYearFrom = Number(formData.birthYearFrom);
    // Il secondo anno e opzionale: se non lo scegli, la categoria copre un
    // anno solo.
    const birthYearTo = String(formData.birthYearTo).trim()
      ? Number(formData.birthYearTo)
      : birthYearFrom;
    const trimmedDescription = formData.description.trim();

    setSaving(true);
    try {
      const result = await onSubmit({
        ...formData,
        name: formData.name.trim(),
        description: trimmedDescription,
        birthYearFrom,
        birthYearTo,
        ageRange:
          birthYearFrom === birthYearTo
            ? String(birthYearFrom)
            : `${birthYearFrom}-${birthYearTo}`,
        athletesCount: initialData?.athletesCount || 0,
        trainersCount: initialData?.trainersCount || 0,
        trainingsPerWeek: initialData?.trainingsPerWeek || 0,
        assignedTrainerIds: formData.assignedTrainerIds,
        compatibleCategoryIds: formData.compatibleCategoryIds,
        /*
          Le sedi spuntate diventano gruppi operativi: chi le indica qui non
          deve poi crearli a mano da un'altra parte (ADR-0055).
        */
        siteIds: showSites ? formData.siteIds : [],
        /*
          **Il riallineamento e una richiesta esplicita** (P0-8).

          Viaggia insieme al salvataggio ma non ne fa parte: se e vuota, il
          cambio di sede avviene e gli atleti restano dove sono. Nessuna
          migrazione di nascosto.
        */
        riallineamento:
          atletiDisallineati > 0 && sedeDiRiallineamento
            ? {
                athleteIds: Array.from(
                  new Set(disallineamenti.flatMap((voce) => voce.athleteIds)),
                ),
                siteId:
                  sedeDiRiallineamento === "__senza_sede__"
                    ? null
                    : sedeDiRiallineamento,
              }
            : null,
      });

      if (result === false) {
        return;
      }

      setFormData(getInitialFormState());
      setDirty(false);
      onClose();
    } catch (error: any) {
      console.error("Error submitting category:", error);

      if (error.message?.includes("Impossibile connettersi")) {
        showToast(
          "error",
          "Problema di connessione al database. Riprova più tardi.",
        );
      } else if (error.message?.includes("Risorse insufficienti")) {
        showToast("error", "Server sovraccarico. Riprova tra qualche secondo.");
      } else {
        showToast("error", "Errore durante il salvataggio. Riprova.");
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Drawer
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      width="wide"
      eyebrow="Categorie"
      title={isEditing ? "Modifica categoria" : "Nuova categoria"}
      description={
        isEditing
          ? "Modifica i dettagli della categoria"
          : "Inserisci i dettagli della nuova categoria"
      }
      dirty={dirty}
      locked={saving}
      data-test="category-editor-drawer"
      footer={
        <>
          <Button variant="primary" onClick={() => void handleSubmit()} loading={saving}>
            {isEditing ? "Aggiorna" : "Salva"}
          </Button>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Annulla
          </Button>
        </>
      }
    >
      <FieldSizeProvider size="sm">
        <form onSubmit={handleSubmit} className="flex flex-col gap-6">
          <ValidationSummary errors={errors} />

          <DrawerSection eyebrow="Identità">
            <div className="flex flex-col gap-5">
              <Field label="Nome categoria" htmlFor={`${ID}-name`} required error={errorFor("name")}>
                <TextInput
                  id={`${ID}-name`}
                  name="name"
                  value={formData.name}
                  onChange={(event) => update({ name: event.target.value })}
                  placeholder="Es. Under 14"
                  autoComplete="off"
                />
              </Field>

              <Field
                label="Descrizione"
                htmlFor={`${ID}-description`}
                error={errorFor("description")}
                helper={
                  <span className="flex items-center justify-between gap-3">
                    <span>Massimo {CATEGORY_DESCRIPTION_MAX_LENGTH} caratteri. Viene mostrata come chip accanto al nome.</span>
                    <span className="egw-num shrink-0">
                      {formData.description.length}/{CATEGORY_DESCRIPTION_MAX_LENGTH}
                    </span>
                  </span>
                }
              >
                <TextInput
                  id={`${ID}-description`}
                  name="description"
                  value={formData.description}
                  onChange={(event) => update({ description: event.target.value })}
                  placeholder="Es. Calcio a 5"
                  maxLength={CATEGORY_DESCRIPTION_MAX_LENGTH}
                  autoComplete="off"
                />
              </Field>

              <FormGrid>
                <Field label="Anno di nascita dal" htmlFor={`${ID}-birth-from`} required error={errorFor("birthYearFrom")}>
                  <SearchableSelect
                    id={`${ID}-birth-from`}
                    value={formData.birthYearFrom}
                    onValueChange={(value) => update({ birthYearFrom: value || "" })}
                    options={birthYearOptions}
                    placeholder="Seleziona anno"
                    searchPlaceholder="Cerca anno"
                  />
                </Field>
                <Field label="Anno di nascita al" htmlFor={`${ID}-birth-to`} optional error={errorFor("birthYearTo")}>
                  <SearchableSelect
                    id={`${ID}-birth-to`}
                    value={formData.birthYearTo}
                    onValueChange={(value) => update({ birthYearTo: value || "" })}
                    options={birthYearOptions}
                    placeholder="Solo l'anno iniziale"
                    searchPlaceholder="Cerca anno"
                    allowClear
                  />
                </Field>
              </FormGrid>
              <p className="-mt-2 font-brand text-[11.5px] font-medium leading-[1.4] text-[rgba(11,26,58,.55)]">
                Gli atleti potranno essere collegati automaticamente a questa
                categoria in base al loro anno di nascita.
              </p>

              <Field label="Colore" htmlFor={`${ID}-color`} width="24ch">
                <Select
                  id={`${ID}-color`}
                  value={formData.color}
                  onValueChange={(value) => update({ color: value })}
                  options={CATEGORY_COLOR_OPTIONS.map((option) => ({
                    value: option.value,
                    label: (
                      <span className="inline-flex items-center gap-2">
                        <CategoryColorDot color={option.value} size={10} />
                        {option.label}
                      </span>
                    ),
                  }))}
                />
              </Field>
            </div>
          </DrawerSection>

          {showSites ? (
            <DrawerSection eyebrow="Sedi e gruppi operativi" title="Sedi in cui è attiva">
              <div className="flex flex-col gap-4">
                <InfoCard>
                  Ogni sede spuntata diventa un <strong>gruppo operativo</strong>:
                  una squadra con il suo elenco atleti, i suoi allenamenti e le
                  sue presenze. La categoria resta <strong>una sola</strong>, con
                  la sua fascia d&apos;anno e le sue compatibilità. Togliere una
                  sede non cancella niente: il gruppo viene archiviato e atleti,
                  allenamenti e presenze restano leggibili.
                </InfoCard>

                <InsetBlock>
                  <div role="group" aria-label="Sedi in cui è attiva" className="flex flex-col gap-2.5">
                    {availableSites.map((site) => {
                      const selected = formData.siteIds.includes(site.id);
                      return (
                        <label
                          key={site.id}
                          className="flex min-h-[30px] cursor-pointer items-center gap-2.5 font-brand text-[13px] text-egw-ink"
                        >
                          <Checkbox
                            checked={selected}
                            onChange={() => handleSiteToggle(site.id)}
                          />
                          <span>{site.name}</span>
                        </label>
                      );
                    })}
                  </div>
                  {formData.siteIds.length === 0 ? (
                    <p className="mt-3 font-brand text-[11.5px] font-medium text-egw-amber-ink">
                      Nessuna sede indicata: la categoria resta una squadra sola,
                      senza sede.
                    </p>
                  ) : null}
                </InsetBlock>

                {atletiDisallineati > 0 ? (
                  <div data-testid="impatto-cambio-sede">
                    <AlertBlock
                      severity="warning"
                      title={
                        atletiDisallineati === 1
                          ? "1 atleta resta assegnato a una sede che questa categoria non servirà più"
                          : `${atletiDisallineati} atleti restano assegnati a una sede che questa categoria non servirà più`
                      }
                    >
                      <ul className="mt-2 space-y-1 font-brand text-[12.5px] text-egw-ink-72">
                        {disallineamenti.map((voce) => (
                          <li key={voce.siteId}>
                            <span className="font-semibold text-egw-ink">{voce.siteName}</span>:{" "}
                            {voce.athleteIds.length}{" "}
                            {voce.athleteIds.length === 1 ? "atleta" : "atleti"}
                          </li>
                        ))}
                      </ul>
                      <p className="mt-3 font-brand text-[12.5px] leading-[1.5] text-egw-ink-72">
                        Il salvataggio non li sposta: l&apos;assegnazione di un atleta
                        a una squadra è una scelta a sé. Finché restano su una sede
                        che la categoria non serve, però, non compaiono nel suo
                        appello né fra i convocabili.
                      </p>
                      <div className="mt-3 max-w-[360px]">
                        <Field label="Riallineali adesso" htmlFor="riallineamento-sede" optional>
                          <Select
                            id="riallineamento-sede"
                            value={sedeDiRiallineamento || "__lascia__"}
                            onValueChange={(value) =>
                              setSedeDiRiallineamento(value === "__lascia__" ? "" : value)
                            }
                            options={[
                              { value: "__lascia__", label: "Lascia come sono" },
                              ...formData.siteIds.map((siteId: string) => {
                                const sede = availableSites.find((voce) => voce.id === siteId);
                                return { value: siteId, label: `Sposta su ${sede?.name || UNKNOWN_SITE_LABEL}` };
                              }),
                              {
                                value: "__senza_sede__",
                                label: "Togli la sede (restano nella categoria, senza sede)",
                              },
                            ]}
                          />
                        </Field>
                      </div>
                    </AlertBlock>
                  </div>
                ) : null}
              </div>
            </DrawerSection>
          ) : null}

          <DrawerSection eyebrow="Categorie compatibili">
            <div className="flex flex-col gap-3">
              <InfoCard>
                Gli atleti di questa categoria possono essere utilizzati anche
                nelle categorie selezionate. La relazione va dichiarata in modo
                esplicito, non viene dedotta dal nome o dagli anni di nascita, e
                non è transitiva: se selezioni Under 14, gli atleti non diventano
                utilizzabili anche nelle categorie compatibili di Under 14. La
                categoria principale degli atleti non cambia: restano iscritti qui.
              </InfoCard>
              {compatibilityOptions.length === 0 ? (
                <p className="font-brand text-[12.5px] text-egw-ink-62">
                  Nessun&apos;altra categoria configurata nel club.
                </p>
              ) : (
                <Field label="Categorie in cui gli atleti sono utilizzabili" htmlFor={`${ID}-compatible`}>
                  <MultiSelect
                    id={`${ID}-compatible`}
                    values={formData.compatibleCategoryIds}
                    onValuesChange={(values) => update({ compatibleCategoryIds: values })}
                    options={compatibilityOptions.map((category) => ({ value: category.id, label: category.name }))}
                    placeholder="Nessuna categoria compatibile"
                    searchPlaceholder="Cerca categoria"
                  />
                </Field>
              )}
            </div>
          </DrawerSection>

          <DrawerSection eyebrow="Allenatori" title="Assegnazione rapida allenatori">
            <div className="flex flex-col gap-3">
              {availableTrainers.length === 0 ? (
                <p className="font-brand text-[12.5px] text-egw-ink-62">
                  Nessun allenatore disponibile nel club.
                </p>
              ) : (
                <Field
                  label="Allenatori assegnati"
                  htmlFor={`${ID}-trainers`}
                  helper="Un allenatore può essere assegnato a più categorie."
                >
                  <MultiSelect
                    id={`${ID}-trainers`}
                    values={formData.assignedTrainerIds}
                    onValuesChange={(values) => update({ assignedTrainerIds: values })}
                    options={availableTrainers.map((trainer) => ({ value: trainer.id, label: trainer.name }))}
                    placeholder="Nessun allenatore assegnato"
                    searchPlaceholder="Cerca allenatore"
                  />
                </Field>
              )}
            </div>
          </DrawerSection>

          {/* Invio da tastiera: il pulsante vero sta nel piede del cassetto. */}
          <button type="submit" className="sr-only" tabIndex={-1} aria-hidden>
            {isEditing ? "Aggiorna" : "Salva"}
          </button>
        </form>
      </FieldSizeProvider>
    </Drawer>
  );
}
