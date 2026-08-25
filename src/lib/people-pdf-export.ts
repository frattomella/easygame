/**
 * Stampa PDF di un elenco di persone.
 *
 * Si chiamava `athletes-pdf-export` ma non ha mai saputo niente degli atleti:
 * prende colonne e righe. Dal Blocco 7 lo usano anche allenatori, staff e
 * soci — il modo per non avere tre export diversi era smettere di chiamarlo
 * come uno solo dei quattro.
 */

export type PeoplePdfColumn = {
  key: string;
  label: string;
};

export type PeoplePdfRow = {
  id: string;
  values: Record<string, string | number | null | undefined>;
};

type PrintPeoplePdfOptions = {
  clubName: string;
  title: string;
  columns: PeoplePdfColumn[];
  rows: PeoplePdfRow[];
  generatedAt?: Date;
  scopeLabel?: string;
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

export const printPeoplePdf = ({
  clubName,
  title,
  columns,
  rows,
  generatedAt = new Date(),
  scopeLabel,
}: PrintPeoplePdfOptions) => {
  if (typeof window === "undefined") {
    return false;
  }

  const printWindow = window.open("", "_blank", "width=1120,height=800");
  if (!printWindow) {
    return false;
  }

  const tableHeaders = columns
    .map((column) => `<th>${escapeHtml(column.label)}</th>`)
    .join("");
  const tableRows = rows.length
    ? rows
        .map(
          (row) => `
            <tr>
              ${columns
                .map(
                  (column) =>
                    `<td>${escapeHtml(row.values[column.key] || "-")}</td>`,
                )
                .join("")}
            </tr>
          `,
        )
        .join("")
    : `<tr><td colspan="${columns.length}" class="empty">Nessun atleta da esportare.</td></tr>`;

  printWindow.document.open();
  printWindow.document.write(`
    <!doctype html>
    <html lang="it">
      <head>
        <meta charset="utf-8" />
        <title>${escapeHtml(title)} - ${escapeHtml(clubName)}</title>
        <style>
          * { box-sizing: border-box; }
          body {
            margin: 0;
            padding: 28px;
            color: #0f172a;
            font-family: Arial, Helvetica, sans-serif;
            font-size: 11px;
          }
          header {
            display: flex;
            justify-content: space-between;
            gap: 24px;
            border-bottom: 2px solid #dbeafe;
            padding-bottom: 16px;
          }
          h1 {
            margin: 22px 0 6px;
            font-size: 23px;
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
            gap: 10px;
            margin: 18px 0;
          }
          .summary div {
            border: 1px solid #e2e8f0;
            border-radius: 6px;
            padding: 10px;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            page-break-inside: auto;
          }
          tr { page-break-inside: avoid; page-break-after: auto; }
          th,
          td {
            border: 1px solid #e2e8f0;
            padding: 7px;
            text-align: left;
            vertical-align: top;
          }
          th {
            background: #eff6ff;
            color: #1e3a8a;
            font-size: 10px;
            text-transform: uppercase;
          }
          .empty {
            color: #64748b;
            padding: 24px;
            text-align: center;
          }
          footer {
            margin-top: 24px;
            border-top: 1px solid #e2e8f0;
            padding-top: 10px;
            color: #64748b;
            text-align: right;
          }
          @page {
            size: A4 landscape;
            margin: 12mm;
          }
          @media print {
            body { padding: 0; }
            thead { display: table-header-group; }
            .summary div { break-inside: avoid; }
          }
        </style>
      </head>
      <body>
        <header>
          <div>
            <h2>${escapeHtml(clubName)}</h2>
            <p>Data generazione: ${escapeHtml(formatDateTime(generatedAt))}</p>
          </div>
          <strong>EasyGame</strong>
        </header>
        <main>
          <h1>${escapeHtml(title)}</h1>
          ${scopeLabel ? `<p>${escapeHtml(scopeLabel)}</p>` : ""}
          <section class="summary">
            <div>
              <strong>Atleti esportati</strong>
              <p>${escapeHtml(rows.length)}</p>
            </div>
            <div>
              <strong>Colonne visibili</strong>
              <p>${escapeHtml(columns.length)}</p>
            </div>
            <div>
              <strong>Pagine</strong>
              <p>Gestite dalla stampa del browser</p>
            </div>
          </section>
          <table>
            <thead>
              <tr>${tableHeaders}</tr>
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
