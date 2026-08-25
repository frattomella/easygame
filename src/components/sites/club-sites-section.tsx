"use client";

import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { MapPin, Pencil, Plus, Trash2 } from "lucide-react";
import {
  normalizeClubSites,
  serializeClubSite,
  type ClubSite,
} from "@/lib/club-sites";

type SiteForm = {
  id: string;
  name: string;
  city: string;
  address: string;
  notes: string;
  active: boolean;
};

const emptyForm: SiteForm = {
  id: "",
  name: "",
  city: "",
  address: "",
  notes: "",
  active: true,
};

const newSiteId = () =>
  `site-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;

/**
 * Anagrafica delle sedi operative del club (ADR-0038).
 *
 * Sta nella pagina Strutture perche una sede e il contenitore degli impianti:
 * chi apre «Strutture» sta gia pensando ai luoghi. Non e una pagina a se,
 * perche un club ne configura due o tre e poi non ci torna piu.
 *
 * Una sede non si elimina se ha strutture collegate: la struttura resterebbe
 * con un riferimento a una sede che non esiste, e il filtro sede la
 * mostrerebbe ovunque senza spiegare perche. Si disattiva.
 */
export function ClubSitesSection({
  sites,
  structureCountBySiteId = {},
  onChange,
  disabled = false,
}: {
  sites: ClubSite[];
  structureCountBySiteId?: Record<string, number>;
  onChange: (nextSites: ClubSite[]) => void | Promise<void>;
  disabled?: boolean;
}) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<SiteForm>(emptyForm);
  const [error, setError] = useState("");

  const openCreate = () => {
    setForm({ ...emptyForm });
    setError("");
    setDialogOpen(true);
  };

  const openEdit = (site: ClubSite) => {
    setForm({
      id: site.id,
      name: site.name,
      city: site.city,
      address: site.address,
      notes: site.notes,
      active: site.active,
    });
    setError("");
    setDialogOpen(true);
  };

  const save = async () => {
    const name = form.name.trim();
    if (!name) {
      setError("Il nome della sede e obbligatorio");
      return;
    }

    const duplicated = sites.some(
      (site) =>
        site.id !== form.id &&
        site.name.trim().toLowerCase() === name.toLowerCase(),
    );
    if (duplicated) {
      setError("Esiste gia una sede con questo nome");
      return;
    }

    const nextSite: ClubSite = {
      id: form.id || newSiteId(),
      name,
      city: form.city.trim(),
      address: form.address.trim(),
      notes: form.notes.trim(),
      active: form.active,
    };

    const next = form.id
      ? sites.map((site) => (site.id === form.id ? nextSite : site))
      : [...sites, nextSite];

    await onChange(normalizeClubSites(next.map(serializeClubSite)));
    setDialogOpen(false);
    setForm({ ...emptyForm });
  };

  const remove = async (site: ClubSite) => {
    if (structureCountBySiteId[site.id]) {
      return;
    }

    await onChange(
      normalizeClubSites(
        sites.filter((entry) => entry.id !== site.id).map(serializeClubSite),
      ),
    );
  };

  return (
    <Card>
      <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <CardTitle className="flex items-center gap-2 text-base">
          <MapPin className="h-4 w-4 text-blue-600" />
          Sedi operative
        </CardTitle>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={openCreate}
          disabled={disabled}
        >
          <Plus className="mr-2 h-4 w-4" />
          Nuova sede
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm leading-6 text-slate-600">
          Una sede e la citta in cui il club opera. Serve quando la stessa
          categoria si svolge in luoghi diversi: la categoria resta una sola e
          cambia il gruppo — «Pulcini · Roma», «Pulcini · Aprilia». Con una
          sola sede configurata nessuna schermata mostra il filtro sede.
        </p>

        {sites.length === 0 ? (
          <p className="rounded-lg border border-dashed bg-slate-50 p-4 text-sm text-slate-500">
            Nessuna sede configurata: il club lavora come mono-sede.
          </p>
        ) : (
          <ul className="space-y-2">
            {sites.map((site) => {
              const structureCount = structureCountBySiteId[site.id] || 0;

              return (
                <li
                  key={site.id}
                  className="flex flex-col gap-2 rounded-lg border bg-white p-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 font-medium text-slate-900">
                      <span className="truncate">{site.name}</span>
                      {!site.active ? (
                        <Badge variant="outline" className="text-slate-500">
                          Disattivata
                        </Badge>
                      ) : null}
                    </p>
                    <p className="truncate text-xs text-slate-500">
                      {[site.city, site.address].filter(Boolean).join(" · ") ||
                        "Nessun indirizzo"}
                      {structureCount
                        ? ` · ${structureCount} struttur${structureCount === 1 ? "a" : "e"}`
                        : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => openEdit(site)}
                      disabled={disabled}
                    >
                      <Pencil className="h-4 w-4" />
                      <span className="sr-only">Modifica sede</span>
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => remove(site)}
                      disabled={disabled || structureCount > 0}
                      title={
                        structureCount > 0
                          ? "Ha strutture collegate: disattivala invece di eliminarla"
                          : "Elimina sede"
                      }
                    >
                      <Trash2 className="h-4 w-4" />
                      <span className="sr-only">Elimina sede</span>
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{form.id ? "Modifica sede" : "Nuova sede"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label htmlFor="site-name">Nome sede</Label>
              <Input
                id="site-name"
                className="mt-2"
                placeholder="Roma"
                value={form.name}
                onChange={(event) =>
                  setForm((current) => ({ ...current, name: event.target.value }))
                }
              />
            </div>
            <div>
              <Label htmlFor="site-city">Citta</Label>
              <Input
                id="site-city"
                className="mt-2"
                value={form.city}
                onChange={(event) =>
                  setForm((current) => ({ ...current, city: event.target.value }))
                }
              />
            </div>
            <div>
              <Label htmlFor="site-address">Indirizzo</Label>
              <Input
                id="site-address"
                className="mt-2"
                value={form.address}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    address: event.target.value,
                  }))
                }
              />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="site-notes">Note</Label>
              <Input
                id="site-notes"
                className="mt-2"
                value={form.notes}
                onChange={(event) =>
                  setForm((current) => ({ ...current, notes: event.target.value }))
                }
              />
            </div>
            <div className="flex items-center gap-3 sm:col-span-2">
              <Switch
                id="site-active"
                checked={form.active}
                onCheckedChange={(checked) =>
                  setForm((current) => ({ ...current, active: checked }))
                }
              />
              <Label htmlFor="site-active" className="text-sm">
                Sede attiva
              </Label>
            </div>
          </div>
          {error ? (
            <p className="text-sm text-red-600" role="alert">
              {error}
            </p>
          ) : null}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDialogOpen(false)}
            >
              Annulla
            </Button>
            <Button type="button" onClick={save}>
              Salva
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
