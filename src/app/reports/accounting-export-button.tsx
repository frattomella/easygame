"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { AlertCircle, Download } from "lucide-react";
import { apiDownload } from "@/lib/api/client";
import { downloadCsv } from "@/lib/csv";
import { hasAccountingPermission } from "@/lib/accounting/permissions";

/**
 * Il pulsante che scarica l'**export della contabilita**.
 *
 * Sta accanto ai filtri del riepilogo, e non e una scelta di layout: il file
 * contiene **esattamente** le righe che quei filtri selezionano, e un pulsante
 * lontano dai filtri fa scaricare un periodo diverso da quello che si sta
 * guardando. Per la stessa ragione riceve la query gia costruita dalla pagina
 * invece di ricostruirsela: due costruttori della stessa query sono due
 * risposte alla domanda «cosa sto esportando».
 *
 * **Compare solo a chi ha `accounting.export`.** La matrice e la stessa della
 * rotta — un pulsante che si vede e poi risponde 403 e un difetto quanto una
 * porta aperta (lezione W3-14) — e il permesso la segreteria non ce l'ha:
 * l'export e la fotografia completa dei conti della societa che lascia
 * l'applicazione dentro un file.
 *
 * **Il trasporto passa da `apiRequest`/`apiDownload`.** Nessun `fetch` diretto
 * verso `/api` da un componente: senza gli header di contesto il server non
 * saprebbe nemmeno quale club sta esportando.
 */
export default function AccountingExportButton({
  clubId,
  role,
  query,
}: {
  clubId: string;
  role: string | null;
  /** La query dei filtri, gia costruita dalla pagina del riepilogo. */
  query: string;
}) {
  const [scaricando, setScaricando] = React.useState(false);
  const [errore, setErrore] = React.useState<string | null>(null);

  if (!clubId || !hasAccountingPermission(role, "accounting.export")) {
    return null;
  }

  const scarica = async () => {
    setScaricando(true);
    setErrore(null);

    const risposta = await apiDownload(
      `/api/v1/accounting/export${query ? `?${query}` : ""}`,
    );

    if (risposta.error || !risposta.data) {
      /*
        Il messaggio del server si mostra **cosi com'e**: quando l'export
        rifiuta perche il filtro seleziona troppe righe, quel testo dice cosa
        restringere. Sostituirlo con un «errore durante l'export» toglierebbe
        l'unica informazione utile.
      */
      setErrore(risposta.error?.message || "Export non riuscito");
      setScaricando(false);
      return;
    }

    /*
      Il testo arriva dal server **gia con il BOM**, e `downloadCsv` non lo
      raddoppia: `withCsvBom` e idempotente. Il salvataggio resta uno solo, in
      `src/lib/csv.ts`, che e il proprietario del tracciato.
    */
    downloadCsv(risposta.data.fileName || "prima-nota.csv", risposta.data.text);
    setScaricando(false);
  };

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={scarica}
        disabled={scaricando}
      >
        <Download className="mr-2 h-4 w-4" />
        {scaricando ? "Preparazione del file..." : "Esporta in CSV"}
      </Button>
      {errore ? (
        <span className="flex items-start gap-1.5 text-xs text-amber-900">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{errore}</span>
        </span>
      ) : null}
    </>
  );
}
