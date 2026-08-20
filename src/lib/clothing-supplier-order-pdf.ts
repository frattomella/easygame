export type SupplierOrderPdfRow = {
  id: string;
  itemName: string;
  itemType?: string;
  size?: string;
  color?: string;
  variant?: string;
  numberLabel?: string;
  quantity: number;
  supplier?: string;
  notes?: string;
  status?: string;
  athleteName?: string;
  categoryName?: string;
};

type PrintSupplierOrderPdfOptions = {
  clubName: string;
  clubLogoUrl?: string | null;
  rows: SupplierOrderPdfRow[];
  supplierLabel?: string;
  scopeLabel?: string;
  generatedAt?: Date;
};

const escapeHtml = (value: unknown) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

const formatDateTime = (date: Date) =>
  date.toLocaleString("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

export const printSupplierOrderPdf = ({
  clubName,
  clubLogoUrl,
  rows,
  supplierLabel,
  scopeLabel,
  generatedAt = new Date(),
}: PrintSupplierOrderPdfOptions) => {
  if (typeof window === "undefined") {
    return false;
  }

  const printWindow = window.open("", "_blank", "width=1024,height=768");
  if (!printWindow) {
    return false;
  }

  const totalQuantity = rows.reduce(
    (total, row) => total + Math.max(1, Number(row.quantity || 1)),
    0,
  );
  const supplierSummary = supplierLabel
    ? `<p><strong>Fornitore:</strong> ${escapeHtml(supplierLabel)}</p>`
    : "";
  const logo = clubLogoUrl
    ? `<img src="${escapeHtml(clubLogoUrl)}" alt="${escapeHtml(
        clubName,
      )}" class="logo" />`
    : "";
  const tableRows = rows.length
    ? rows
        .map(
          (row) => `
            <tr>
              <td>${escapeHtml(row.itemName)}</td>
              <td>${escapeHtml(row.itemType || "-")}</td>
              <td>${escapeHtml(row.size || "-")}</td>
              <td>${escapeHtml(row.color || "-")}</td>
              <td>${escapeHtml(row.variant || "-")}</td>
              <td>${escapeHtml(row.numberLabel || "Senza numero")}</td>
              <td>${escapeHtml(row.quantity || 1)}</td>
              <td>${escapeHtml(row.supplier || "Non indicato")}</td>
              <td>${escapeHtml(row.notes || "-")}</td>
              <td>${escapeHtml(row.status || "-")}</td>
            </tr>
          `,
        )
        .join("")
    : `
        <tr>
          <td colspan="10" class="empty">Nessun articolo da esportare.</td>
        </tr>
      `;

  printWindow.document.open();
  printWindow.document.write(`
    <!doctype html>
    <html lang="it">
      <head>
        <meta charset="utf-8" />
        <title>Ordine Fornitore - ${escapeHtml(clubName)}</title>
        <style>
          * { box-sizing: border-box; }
          body {
            margin: 0;
            padding: 32px;
            color: #0f172a;
            font-family: Arial, Helvetica, sans-serif;
            font-size: 12px;
          }
          header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 24px;
            border-bottom: 2px solid #dbeafe;
            padding-bottom: 18px;
          }
          .club {
            display: flex;
            align-items: center;
            gap: 14px;
          }
          .logo {
            height: 54px;
            width: 54px;
            object-fit: contain;
          }
          h1 {
            margin: 28px 0 8px;
            font-size: 24px;
          }
          h2 {
            margin: 0;
            font-size: 18px;
          }
          p {
            margin: 4px 0;
          }
          .summary {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 12px;
            margin: 20px 0;
          }
          .summary div {
            border: 1px solid #e2e8f0;
            border-radius: 8px;
            padding: 12px;
          }
          table {
            width: 100%;
            border-collapse: collapse;
          }
          th,
          td {
            border: 1px solid #e2e8f0;
            padding: 8px;
            text-align: left;
            vertical-align: top;
          }
          th {
            background: #eff6ff;
            color: #1e3a8a;
            font-size: 11px;
            text-transform: uppercase;
          }
          .empty {
            color: #64748b;
            padding: 24px;
            text-align: center;
          }
          footer {
            margin-top: 28px;
            border-top: 1px solid #e2e8f0;
            padding-top: 12px;
            color: #64748b;
            text-align: right;
          }
          @media print {
            body { padding: 18px; }
            .summary div { break-inside: avoid; }
          }
        </style>
      </head>
      <body>
        <header>
          <div class="club">
            ${logo}
            <div>
              <h2>${escapeHtml(clubName)}</h2>
              <p>Data generazione: ${escapeHtml(formatDateTime(generatedAt))}</p>
            </div>
          </div>
          <strong>EasyGame</strong>
        </header>
        <main>
          <h1>Ordine Fornitore</h1>
          ${scopeLabel ? `<p>${escapeHtml(scopeLabel)}</p>` : ""}
          ${supplierSummary}
          <section class="summary">
            <div>
              <strong>Articoli</strong>
              <p>${escapeHtml(rows.length)}</p>
            </div>
            <div>
              <strong>Quantità totale</strong>
              <p>${escapeHtml(totalQuantity)}</p>
            </div>
            <div>
              <strong>Fornitori</strong>
              <p>${escapeHtml(
                Array.from(
                  new Set(
                    rows.map((row) => row.supplier || "Non indicato"),
                  ),
                ).join(", "),
              )}</p>
            </div>
          </section>
          <table>
            <thead>
              <tr>
                <th>Nome articolo</th>
                <th>Tipo</th>
                <th>Taglia</th>
                <th>Colore</th>
                <th>Variante</th>
                <th>Numero</th>
                <th>Quantità</th>
                <th>Fornitore</th>
                <th>Note</th>
                <th>Stato</th>
              </tr>
            </thead>
            <tbody>${tableRows}</tbody>
          </table>
        </main>
        <footer>Generato da EasyGame</footer>
        <script>
          window.setTimeout(() => {
            window.focus();
            window.print();
          }, 250);
        </script>
      </body>
    </html>
  `);
  printWindow.document.close();

  return true;
};
