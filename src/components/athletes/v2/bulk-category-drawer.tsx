"use client";

import * as React from "react";
import { Drawer, DrawerSection } from "@/components/web/overlays/Drawer";
import { Button } from "@/components/web/primitives/Button";
import {
  Field,
  FieldSizeProvider,
  SearchableSelect,
  Select,
} from "@/components/web/forms/Field";
import {
  getActiveClubSites,
  isMultiSiteClub,
  type ClubSite,
} from "@/lib/club-sites";

/**
 * «Cambia categoria agli atleti selezionati»: il cassetto 480 (guideline 06
 * §6.7, 08 §8.9) con i due campi della V1.
 *
 * **L'azione piu rischiosa della pagina** (N3): sposta N atleti in una
 * categoria scelta da una tendina, e su un club con due «Under 15» le due
 * voci erano identiche. L'etichetta la decide `categoryLabel`, cioe l'indice
 * costruito con i gruppi, non solo con il catalogo.
 *
 * La sede in blocco esiste per un motivo solo: collocare il dato storico. Un
 * club che configura le sedi oggi ha centinaia di atleti senza sede, e
 * assegnarla scheda per scheda vuol dire non assegnarla (ADR-0055). Senza
 * sede indicata quella dell'atleta resta com'era.
 */
export function BulkCategoryDrawer({
  open,
  onOpenChange,
  categories,
  categoryLabel,
  sites,
  selectedCount,
  onContinue,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: Array<{ id: string; name: string }>;
  categoryLabel: (categoryId: string) => string;
  sites: ClubSite[];
  selectedCount: number;
  onContinue: (choice: { categoryId: string; siteId: string | null }) => void;
}) {
  const [categoryId, setCategoryId] = React.useState("");
  const [siteId, setSiteId] = React.useState("");

  React.useEffect(() => {
    if (open) {
      setCategoryId("");
      setSiteId("");
    }
  }, [open]);

  const categoryOptions = React.useMemo(
    () =>
      categories.map((category) => ({
        value: category.id,
        label: categoryLabel(category.id),
      })),
    [categories, categoryLabel],
  );

  const multiSite = isMultiSiteClub(sites);
  const dirty = Boolean(categoryId || siteId);

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      width="default"
      eyebrow={`Azione su ${selectedCount} ${selectedCount === 1 ? "atleta" : "atleti"}`}
      title="Cambia categoria agli atleti selezionati"
      description="Seleziona la categoria di destinazione per gli atleti selezionati."
      dirty={dirty}
      data-test="bulk-category-drawer"
      footer={
        <>
          <Button
            variant="primary"
            id="bulk-category-continue"
            disabled={!categoryId}
            onClick={() => {
              if (!categoryId) return;
              onContinue({ categoryId, siteId: siteId || null });
            }}
          >
            Continua
          </Button>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Annulla
          </Button>
        </>
      }
    >
      <FieldSizeProvider size="sm">
        <DrawerSection eyebrow="Destinazione">
          <div className="flex flex-col gap-4">
            <Field
              label="Nuova categoria"
              htmlFor="bulk-category-target"
              required
            >
              {categoryOptions.length > 8 ? (
                <SearchableSelect
                  id="bulk-category-target"
                  value={categoryId}
                  onValueChange={(next) => setCategoryId(next || "")}
                  options={categoryOptions}
                  placeholder="Seleziona una categoria"
                  searchPlaceholder="Cerca categoria"
                />
              ) : (
                <Select
                  id="bulk-category-target"
                  value={categoryId}
                  onValueChange={setCategoryId}
                  options={categoryOptions}
                  placeholder="Seleziona una categoria"
                />
              )}
            </Field>

            {multiSite ? (
              <Field
                label="Sede"
                htmlFor="bulk-site-target"
                helper="Un cambio di categoria non cancella una sede che nessuno ha chiesto di cambiare."
              >
                <Select
                  id="bulk-site-target"
                  value={siteId || "__keep__"}
                  onValueChange={(next) =>
                    setSiteId(next === "__keep__" ? "" : next)
                  }
                  options={[
                    { value: "__keep__", label: "Lascia la sede attuale" },
                    ...getActiveClubSites(sites).map((site) => ({
                      value: site.id,
                      label: site.name,
                    })),
                  ]}
                />
              </Field>
            ) : null}
          </div>
        </DrawerSection>
      </FieldSizeProvider>
    </Drawer>
  );
}
