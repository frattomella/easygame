"use client";

import React, { useMemo, useState } from "react";
import { Link2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  DYNAMIC_FIELDS,
  FORM_SUBJECT_KEYS,
  FORM_SUBJECTS,
  type DynamicFieldDefinition,
} from "@/lib/forms/dynamic-fields";

/**
 * «Quale dato di EasyGame e questo campo?»
 *
 * L'elenco mostra **solo etichette**: «Telefono del genitore», mai
 * `guardian.phone`. La chiave esiste, viene salvata nel modulo e serve al
 * server per sapere dove leggere e dove scrivere, ma non e un linguaggio che
 * una segretaria debba imparare per costruire un modulo di iscrizione.
 *
 * I dati della societa sono marcati «sola lettura»: si possono stampare in un
 * documento, non si riscrivono da una compilazione.
 */

type DynamicFieldPickerProps = {
  open: boolean;
  onClose: () => void;
  onPick: (definition: DynamicFieldDefinition) => void;
  /** La chiave gia collegata, se il campo ne ha una. */
  currentKey?: string;
  /** Mostrato in cima quando serve togliere il collegamento. */
  onClear?: () => void;
};

export function DynamicFieldPicker({
  open,
  onClose,
  onPick,
  currentKey,
  onClear,
}: DynamicFieldPickerProps) {
  const [query, setQuery] = useState("");

  const grouped = useMemo(() => {
    const needle = query.trim().toLowerCase();

    return FORM_SUBJECT_KEYS.map((subject) => ({
      subject,
      definition: FORM_SUBJECTS[subject],
      fields: DYNAMIC_FIELDS.filter(
        (field) =>
          field.subject === subject &&
          (!needle || field.label.toLowerCase().includes(needle)),
      ),
    })).filter((group) => group.fields.length > 0);
  }, [query]);

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? null : onClose())}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Collega a un dato EasyGame</DialogTitle>
          <DialogDescription>
            Il campo verra precompilato quando il dato e gia in archivio, e
            potra aggiornarlo quando la segreteria approva la compilazione.
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            autoFocus
            className="pl-9"
            placeholder="Cerca: telefono, codice fiscale, nome…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>

        {currentKey && onClear ? (
          <Button
            type="button"
            variant="outline"
            className="w-full justify-start"
            onClick={() => {
              onClear();
              onClose();
            }}
          >
            Togli il collegamento: resta una domanda libera
          </Button>
        ) : null}

        <div className="space-y-5">
          {grouped.map((group) => (
            <section key={group.subject} className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                {group.definition.pluralLabel}
              </h3>
              <div className="space-y-1">
                {group.fields.map((field) => (
                  <button
                    key={field.key}
                    type="button"
                    onClick={() => {
                      onPick(field);
                      onClose();
                    }}
                    className={`flex w-full items-start gap-3 rounded-md border p-3 text-left text-sm transition ${
                      field.key === currentKey
                        ? "border-sky-300 bg-sky-50"
                        : "border-slate-200 hover:border-slate-300 hover:bg-slate-50"
                    }`}
                  >
                    <Link2 className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                    <span className="min-w-0">
                      <span className="block font-medium text-slate-900">
                        {field.label}
                      </span>
                      {field.hint ? (
                        <span className="block text-xs text-slate-500">
                          {field.hint}
                        </span>
                      ) : null}
                      {!field.writable ? (
                        <span className="mt-1 inline-block rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">
                          Sola lettura
                        </span>
                      ) : null}
                    </span>
                  </button>
                ))}
              </div>
            </section>
          ))}

          {grouped.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-500">
              Nessun dato con questo nome.
            </p>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
