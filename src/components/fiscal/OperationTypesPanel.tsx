"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Loader2,
  Lock,
  Plus,
  Save,
  Tags,
  Trash2,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/toast-notification";
import { apiRequest } from "@/lib/api/client";

/**
 * Le **causali** di una societa: la schermata che il prodotto non aveva.
 *
 * `/api/v1/fiscal/operation-types` funzionava dal Blocco D e **nessun
 * componente la chiamava** (§9 del piano della Wave 4). Il catalogo esisteva,
 * si seminava, si poteva configurare via API, e nessun utente poteva vederlo:
 * cioe la classificazione fiscale di ogni incasso restava quella del seme, per
 * sempre.
 *
 * ## Le tre regole che questa schermata fa rispettare
 *
 * 1. **«Non dichiarato» si vede.** Un flag vuoto non e disegnato come un no:
 *    ha un suo stato, una sua etichetta e un conteggio in cima. Un rendiconto
 *    che dice «non classificato 22.700 €» fa capire che c'e da configurare;
 *    uno che mostra solo istituzionale e commerciale fa credere di avere un
 *    rendiconto (§15).
 * 2. **Chi non puo modificare non vede i comandi.** Il permesso arriva dalla
 *    rotta — `permissions.canManage` — e non si deduce dal ruolo qui: un
 *    pulsante che si vede e poi risponde 403 e un difetto quanto una porta
 *    aperta (lezione W3-14).
 * 3. **Una voce di sistema non si cancella.** Il pulsante non c'e proprio, e al
 *    suo posto c'e l'interruttore che la disattiva.
 *
 * ## Perche schede e non una tabella
 *
 * Una causale ha nove attributi. Una tabella con nove colonne a 375 px o
 * scorre in orizzontale — e nessuno trova la nona — o si comprime fino a
 * essere illeggibile. Ogni causale e una scheda che si apre: chiusa dice nome,
 * verso e stato della classificazione; aperta mostra i campi in una griglia
 * che passa da una a due a tre colonne con la larghezza.
 */

type OperationType = {
  code: string;
  label: string;
  documentRoute: string;
  vatRate: number | null;
  vatNature: string | null;
  activityScope: string;
  directionHint: string | null;
  reportingBucket: string | null;
  defaultDescription: string | null;
  deductible: boolean | null;
  isMembershipFee: boolean | null;
  classifiedBy: string | null;
  classifiedAt: string | null;
  isActive: boolean;
  isSystem: boolean;
  notes: string | null;
};

type Vocabolario = Array<{ key: string; label: string }>;

type Vista = {
  operationTypes: OperationType[];
  permissions: { canManage: boolean };
  vocabularies: {
    documentRoutes: Vocabolario;
    activityScopes: Vocabolario;
    directionHints: Vocabolario;
  };
};

/** `null` non e `false`: e la terza opzione, e ha una sua etichetta. */
const TRI_STATO: Array<{ value: string; label: string }> = [
  { value: "null", label: "Non dichiarato" },
  { value: "true", label: "Si" },
  { value: "false", label: "No" },
];

const daTriStato = (value: string): boolean | null =>
  value === "true" ? true : value === "false" ? false : null;

const aTriStato = (value: boolean | null | undefined) =>
  value === true ? "true" : value === false ? "false" : "null";

const dichiarata = (voce: OperationType) =>
  voce.activityScope !== "unspecified" ||
  voce.deductible !== null ||
  voce.isMembershipFee !== null;

const dataItaliana = (iso: string | null) => {
  if (!iso) return "";
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString("it-IT");
};

export function OperationTypesPanel({
  organizationId,
}: {
  organizationId?: string | null;
}) {
  const { showToast } = useToast();
  const [vista, setVista] = useState<Vista | null>(null);
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState<string>("");
  const [aperta, setAperta] = useState<string>("");
  const [bozze, setBozze] = useState<Record<string, Partial<OperationType>>>({});
  const [nuovaLabel, setNuovaLabel] = useState("");
  const [nuovoVerso, setNuovoVerso] = useState("IN");
  const [mostraInattive, setMostraInattive] = useState(false);

  const query = organizationId
    ? `?organization_id=${encodeURIComponent(organizationId)}`
    : "";

  const carica = async () => {
    setLoading(true);
    const response = await apiRequest<Vista>(
      `/api/v1/fiscal/operation-types${query}`,
    );
    setLoading(false);

    if (response.error || !response.data) {
      showToast(
        "error",
        response.error?.message || "Errore nella lettura delle causali",
      );
      return;
    }

    setVista(response.data);
    setBozze({});
  };

  useEffect(() => {
    void carica();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId]);

  const voci = useMemo(
    () =>
      (vista?.operationTypes || []).filter(
        (voce) => mostraInattive || voce.isActive,
      ),
    [vista, mostraInattive],
  );

  const daClassificare = useMemo(
    () => (vista?.operationTypes || []).filter((voce) => !dichiarata(voce)),
    [vista],
  );

  const canManage = Boolean(vista?.permissions?.canManage);

  const bozzaDi = (voce: OperationType): OperationType => ({
    ...voce,
    ...(bozze[voce.code] || {}),
  });

  const modifica = (code: string, patch: Partial<OperationType>) =>
    setBozze((current) => ({
      ...current,
      [code]: { ...(current[code] || {}), ...patch },
    }));

  const salva = async (voce: OperationType) => {
    const bozza = bozzaDi(voce);
    setSalvando(voce.code);

    const response = await apiRequest("/api/v1/fiscal/operation-types", {
      method: "PUT",
      body: {
        organization_id: organizationId,
        code: voce.code,
        label: bozza.label,
        documentRoute: bozza.documentRoute,
        activityScope: bozza.activityScope,
        directionHint: bozza.directionHint,
        reportingBucket: bozza.reportingBucket,
        defaultDescription: bozza.defaultDescription,
        deductible: bozza.deductible,
        isMembershipFee: bozza.isMembershipFee,
        vatRate: bozza.vatRate,
        vatNature: bozza.vatNature,
        isActive: bozza.isActive,
        notes: bozza.notes,
      },
    });
    setSalvando("");

    if (response.error) {
      showToast("error", response.error.message || "Salvataggio non riuscito");
      return;
    }

    showToast("success", `Causale «${bozza.label}» aggiornata`);
    await carica();
  };

  const crea = async () => {
    const label = nuovaLabel.trim();
    if (!label) return;

    /*
      Il codice si deriva dall'etichetta e non si chiede: e una chiave tecnica
      che i movimenti citeranno per sempre, e farla digitare produce «Quota
      2026 (nuova)» come chiave primaria di una classificazione fiscale.
    */
    const code = label
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 60);

    if (!code) {
      showToast("error", "Il nome della causale deve contenere delle lettere");
      return;
    }

    setSalvando("__nuova__");
    const response = await apiRequest("/api/v1/fiscal/operation-types", {
      method: "PUT",
      body: {
        organization_id: organizationId,
        code,
        label,
        directionHint: nuovoVerso,
      },
    });
    setSalvando("");

    if (response.error) {
      showToast("error", response.error.message || "Creazione non riuscita");
      return;
    }

    setNuovaLabel("");
    showToast("success", `Causale «${label}» creata: ora va classificata`);
    await carica();
    setAperta(code);
  };

  const elimina = async (voce: OperationType) => {
    setSalvando(voce.code);
    const response = await apiRequest<{ deleted: boolean; message: string }>(
      `/api/v1/fiscal/operation-types?code=${encodeURIComponent(voce.code)}&action=delete${
        organizationId
          ? `&organization_id=${encodeURIComponent(organizationId)}`
          : ""
      }`,
      { method: "DELETE" },
    );
    setSalvando("");

    if (response.error) {
      showToast("error", response.error.message || "Operazione non riuscita");
      return;
    }

    showToast(
      response.data?.deleted ? "success" : "info",
      response.data?.message || "Operazione eseguita",
    );
    await carica();
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Caricamento delle causali…
      </div>
    );
  }

  if (!vista) return null;

  return (
    <Card>
      <CardHeader className="gap-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Tags className="h-5 w-5" />
          Causali
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          La causale dice <strong>cosa</strong> e un movimento. E il mattone su
          cui poggiano la prima nota, il rendiconto per voce e il riepilogo
          fiscale: nessuno di quei tre puo dire piu di quanto la causale
          dichiara.
        </p>
      </CardHeader>

      <CardContent className="space-y-4">
        {daClassificare.length ? (
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>
              {daClassificare.length} causali su {vista.operationTypes.length}{" "}
              non sono classificate
            </AlertTitle>
            <AlertDescription className="text-sm">
              EasyGame non le classifica al posto vostro, e non e una
              limitazione: la natura di un&apos;entrata dipende dal regime della
              societa, e un valore indovinato sembrerebbe configurato. Finche
              restano cosi, il rendiconto le conta a parte e lo dichiara.
            </AlertDescription>
          </Alert>
        ) : null}

        {!canManage ? (
          <Alert>
            <Lock className="h-4 w-4" />
            <AlertTitle>Sola lettura</AlertTitle>
            <AlertDescription className="text-sm">
              Modificare una causale cambia la natura fiscale di tutto cio che
              verra registrato dopo: e configurazione societaria, e la possono
              cambiare il proprietario e il gestore.
            </AlertDescription>
          </Alert>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setMostraInattive((value) => !value)}
          >
            {mostraInattive
              ? "Nascondi le disattivate"
              : "Mostra anche le disattivate"}
          </Button>
          <span className="text-xs text-muted-foreground">
            {voci.length} causali in elenco
          </span>
        </div>

        <div className="space-y-3">
          {voci.map((voce) => {
            const bozza = bozzaDi(voce);
            const apertaOra = aperta === voce.code;

            return (
              <div
                key={voce.code}
                className="rounded-lg border bg-card p-3 sm:p-4"
              >
                <button
                  type="button"
                  onClick={() => setAperta(apertaOra ? "" : voce.code)}
                  className="flex w-full flex-wrap items-center justify-between gap-2 text-left"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">
                      {voce.label}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {voce.code}
                    </span>
                  </span>

                  <span className="flex flex-wrap items-center gap-1.5">
                    {voce.directionHint ? (
                      <Badge variant="outline">
                        {voce.directionHint === "IN" ? "Entrata" : "Uscita"}
                      </Badge>
                    ) : null}
                    {dichiarata(voce) ? (
                      <Badge variant="secondary">Classificata</Badge>
                    ) : (
                      <Badge variant="outline">Da classificare</Badge>
                    )}
                    {voce.isSystem ? (
                      <Badge variant="outline">Predefinita</Badge>
                    ) : null}
                    {!voce.isActive ? (
                      <Badge variant="destructive">Disattivata</Badge>
                    ) : null}
                    {apertaOra ? (
                      <ChevronUp className="h-4 w-4 shrink-0" />
                    ) : (
                      <ChevronDown className="h-4 w-4 shrink-0" />
                    )}
                  </span>
                </button>

                {apertaOra ? (
                  <div className="mt-4 space-y-4 border-t pt-4">
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      <div className="space-y-2">
                        <Label htmlFor={`label-${voce.code}`}>Nome</Label>
                        <Input
                          id={`label-${voce.code}`}
                          value={bozza.label || ""}
                          disabled={!canManage}
                          onChange={(event) =>
                            modifica(voce.code, { label: event.target.value })
                          }
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor={`verso-${voce.code}`}>
                          Verso suggerito
                        </Label>
                        <Select
                          value={bozza.directionHint || "none"}
                          disabled={!canManage}
                          onValueChange={(value) =>
                            modifica(voce.code, {
                              directionHint: value === "none" ? null : value,
                            })
                          }
                        >
                          <SelectTrigger id={`verso-${voce.code}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">
                              Entrambi i versi
                            </SelectItem>
                            {vista.vocabularies.directionHints.map((voceV) => (
                              <SelectItem key={voceV.key} value={voceV.key}>
                                {voceV.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground">
                          E una proposta: il verso lo decide il movimento.
                        </p>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor={`doc-${voce.code}`}>
                          Documento da emettere
                        </Label>
                        <Select
                          value={bozza.documentRoute || "receipt"}
                          disabled={!canManage}
                          onValueChange={(value) =>
                            modifica(voce.code, { documentRoute: value })
                          }
                        >
                          <SelectTrigger id={`doc-${voce.code}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {vista.vocabularies.documentRoutes.map((voceD) => (
                              <SelectItem key={voceD.key} value={voceD.key}>
                                {voceD.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor={`scope-${voce.code}`}>
                          Ambito di attivita
                        </Label>
                        <Select
                          value={bozza.activityScope || "unspecified"}
                          disabled={!canManage}
                          onValueChange={(value) =>
                            modifica(voce.code, { activityScope: value })
                          }
                        >
                          <SelectTrigger id={`scope-${voce.code}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {vista.vocabularies.activityScopes.map((voceA) => (
                              <SelectItem key={voceA.key} value={voceA.key}>
                                {voceA.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor={`detr-${voce.code}`}>
                          Detraibile (730)
                        </Label>
                        <Select
                          value={aTriStato(bozza.deductible)}
                          disabled={!canManage}
                          onValueChange={(value) =>
                            modifica(voce.code, {
                              deductible: daTriStato(value),
                            })
                          }
                        >
                          <SelectTrigger id={`detr-${voce.code}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {TRI_STATO.map((stato) => (
                              <SelectItem key={stato.value} value={stato.value}>
                                {stato.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor={`quota-${voce.code}`}>
                          Quota associativa
                        </Label>
                        <Select
                          value={aTriStato(bozza.isMembershipFee)}
                          disabled={!canManage}
                          onValueChange={(value) =>
                            modifica(voce.code, {
                              isMembershipFee: daTriStato(value),
                            })
                          }
                        >
                          <SelectTrigger id={`quota-${voce.code}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {TRI_STATO.map((stato) => (
                              <SelectItem key={stato.value} value={stato.value}>
                                {stato.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground">
                          Distingue la quota associativa da quella sportiva.
                        </p>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor={`bucket-${voce.code}`}>
                          Voce di rendiconto
                        </Label>
                        <Input
                          id={`bucket-${voce.code}`}
                          value={bozza.reportingBucket || ""}
                          placeholder="Es. Quote atleti"
                          disabled={!canManage}
                          onChange={(event) =>
                            modifica(voce.code, {
                              reportingBucket: event.target.value || null,
                            })
                          }
                        />
                        <p className="text-xs text-muted-foreground">
                          Il nome lo decidete voi: EasyGame non impone un piano
                          dei conti.
                        </p>
                      </div>

                      <div className="space-y-2 sm:col-span-2">
                        <Label htmlFor={`descr-${voce.code}`}>
                          Descrizione predefinita
                        </Label>
                        <Input
                          id={`descr-${voce.code}`}
                          value={bozza.defaultDescription || ""}
                          placeholder="Quella che il movimento eredita se non ne scrivete una"
                          disabled={!canManage}
                          onChange={(event) =>
                            modifica(voce.code, {
                              defaultDescription: event.target.value || null,
                            })
                          }
                        />
                      </div>
                    </div>

                    {voce.classifiedAt ? (
                      <p className="text-xs text-muted-foreground">
                        Classificazione dichiarata il{" "}
                        {dataItaliana(voce.classifiedAt)}.
                      </p>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        Nessuna classificazione dichiarata: chi la dichiara
                        resta scritto sulla causale.
                      </p>
                    )}

                    {canManage ? (
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => void salva(voce)}
                          disabled={salvando === voce.code}
                        >
                          {salvando === voce.code ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : (
                            <Save className="mr-2 h-4 w-4" />
                          )}
                          Salva
                        </Button>

                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={salvando === voce.code}
                          onClick={() =>
                            void salva({
                              ...bozza,
                              isActive: !bozza.isActive,
                            } as OperationType)
                          }
                        >
                          {bozza.isActive ? "Disattiva" : "Riattiva"}
                        </Button>

                        {/*
                          Una voce predefinita non ha il pulsante di
                          eliminazione: non e nascosto per prudenza, e che non
                          esiste il gesto. Al suo posto c'e «Disattiva».
                        */}
                        {!voce.isSystem ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="text-destructive"
                            disabled={salvando === voce.code}
                            onClick={() => void elimina(voce)}
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Elimina
                          </Button>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>

        {canManage ? (
          <div className="rounded-lg border border-dashed p-3 sm:p-4">
            <p className="mb-3 text-sm font-medium">Aggiungi una causale</p>
            <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end">
              <div className="space-y-2">
                <Label htmlFor="nuova-causale">Nome</Label>
                <Input
                  id="nuova-causale"
                  value={nuovaLabel}
                  placeholder="Es. Affitto della palestra"
                  onChange={(event) => setNuovaLabel(event.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="nuovo-verso">Verso</Label>
                <Select value={nuovoVerso} onValueChange={setNuovoVerso}>
                  <SelectTrigger id="nuovo-verso" className="sm:w-36">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {vista.vocabularies.directionHints.map((voceV) => (
                      <SelectItem key={voceV.key} value={voceV.key}>
                        {voceV.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Button
                type="button"
                onClick={() => void crea()}
                disabled={!nuovaLabel.trim() || salvando === "__nuova__"}
              >
                {salvando === "__nuova__" ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="mr-2 h-4 w-4" />
                )}
                Aggiungi
              </Button>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Nasce senza classificazione, e va dichiarata: EasyGame non ne
              indovina nessuna.
            </p>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
