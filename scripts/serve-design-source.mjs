/**
 * Serve `design-source/` in sola lettura su una porta locale, per guardare
 * gli artboard Claude Design (`design-source/web/*.dc.html`) nel browser
 * integrato. Nessuna dipendenza, nessuna scrittura: e un server statico.
 *
 *     node scripts/serve-design-source.mjs        # http://127.0.0.1:3020/web/
 */
import { createServer } from "node:http";
import { readFile, readdir, stat } from "node:fs/promises";
import { extname, join, normalize, posix } from "node:path";

const root = join(process.cwd(), "design-source");
const port = process.env.DESIGN_PORT || "3020";
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".md": "text/plain; charset=utf-8",
};

createServer(async (req, res) => {
  try {
    const url = decodeURIComponent((req.url || "/").split("?")[0]);
    const rel = normalize(url).replace(/^[\\/]+/, "");
    const file = join(root, rel);
    if (!file.startsWith(root)) throw new Error("outside root");
    const s = await stat(file);
    if (s.isDirectory()) {
      const names = await readdir(file);
      const items = names
        .map((n) => `<li><a href="${posix.join(url, n)}">${n}</a></li>`)
        .join("");
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(`<ul>${items}</ul>`);
      return;
    }
    const body = await readFile(file);
    res.writeHead(200, {
      "content-type": types[extname(file)] || "application/octet-stream",
    });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end("not found");
  }
}).listen(Number(port), "127.0.0.1", () => {
  console.log(`design-source su http://127.0.0.1:${port}/web/`);
});
