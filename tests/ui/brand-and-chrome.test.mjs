import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

/**
 * Conformita statica della UI (WP-37).
 *
 * Sono test sul sorgente, non sul rendering: il progetto non ha un renderer di
 * componenti (vedi 15 — Testing), ma queste regole sono verificabili leggendo
 * i file e sono esattamente quelle che, se violate di nuovo, riportano i
 * difetti appena corretti.
 */

const SRC = path.join(process.cwd(), "src");

const walk = (dir) => {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...walk(full));
    } else if (/\.(ts|tsx)$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
};

const FILES = walk(SRC);
const read = (file) => readFileSync(file, "utf8");
const relative = (file) => path.relative(process.cwd(), file).replace(/\\/g, "/");

const filesMatching = (pattern) =>
  FILES.filter((file) => pattern.test(read(file))).map(relative);

// --- marchio ------------------------------------------------------------------

test("nessun riferimento al logo su CDN esterno", () => {
  assert.deepEqual(
    filesMatching(/r2\.fivemanage\.com/).filter(
      (file) => file !== "src/components/brand/easygame-logo.tsx",
    ),
    [],
    "il marchio e un SVG in repo: nessuna pagina deve dipendere da un host esterno",
  );
});

test("nessun riferimento ai PNG di logo inesistenti", () => {
  const offenders = filesMatching(/["']\/logo(-blu|-bianco)?\.png["']/);
  assert.deepEqual(
    offenders,
    [],
    "/logo.png e /logo-blu.png non esistono in public/: erano immagini rotte",
  );
});

test("il marchio SVG non ha dipendenze di rete", () => {
  const logo = read(path.join(SRC, "components/brand/easygame-logo.tsx"));
  assert.equal(/https?:\/\//.test(logo.replace(/http:\/\/www\.w3\.org[^"']*/g, "")), false);
  assert.match(logo, /<svg/, "il marchio deve essere un SVG inline");
});

// --- topbar del club ----------------------------------------------------------

const HEADER = path.join(SRC, "components/dashboard/Header.tsx");
const MOBILE_TOPBAR = path.join(SRC, "components/layout/MobileTopBar.tsx");

/** Sorgente senza commenti: un commento che *nomina* una cosa rimossa non e la cosa. */
const readCode = (file) =>
  read(file)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

/*
 * Azioni rapide e assistenza sono **tornate** sulla topbar del club: la loro
 * rimozione era richiesta per la sola console `platform_admin`. Cosa deve
 * esserci sull'una e non sull'altra e in
 * `tests/ui/topbar-club-vs-platform.test.mjs`.
 *
 * Qui resta la sola regola che non e cambiata.
 */
test("la topbar del club non contiene la chat", () => {
  assert.equal(
    /ChatButton/.test(readCode(HEADER)),
    false,
    "la chat non ha un backend: finche non esiste, non ha un comando",
  );
});

test("le topbar mostrano club e stagione", () => {
  for (const file of [HEADER, MOBILE_TOPBAR]) {
    assert.match(
      read(file),
      /ClubIdentity/,
      `${relative(file)} deve mostrare club e stagione con ClubIdentity`,
    );
  }
});

// --- console di piattaforma ---------------------------------------------------

test("la console di piattaforma non usa la chrome del club", () => {
  const admin = read(
    path.join(SRC, "app/private/easygame-platform-admin-0c7a/page.tsx"),
  );

  assert.equal(
    /dashboard\/Sidebar|dashboard\/Header/.test(admin),
    false,
    "platform_admin non deve montare sidebar e topbar del club",
  );
  assert.match(admin, /PlatformAdminShell/);
});

test("la shell di piattaforma non conosce le risorse di club", () => {
  const shell = read(
    path.join(SRC, "components/platform-admin/platform-admin-shell.tsx"),
  );

  for (const clubResource of ["/athletes", "/training", "/matches", "/payments"]) {
    assert.equal(
      shell.includes(clubResource),
      false,
      `la console di piattaforma non deve linkare ${clubResource}`,
    );
  }
});

// --- modali -------------------------------------------------------------------

for (const file of ["components/ui/dialog.tsx", "components/ui/alert-dialog.tsx"]) {
  test(`${file}: il modale sta nello schermo e scorre al suo interno`, () => {
    const source = read(path.join(SRC, file));

    assert.match(
      source,
      /max-h-\[calc\(100dvh-2rem\)\]/,
      "senza altezza massima i pulsanti in fondo restano irraggiungibili su telefono",
    );
    assert.match(source, /overflow-y-auto/);
    assert.match(
      source,
      /w-\[calc\(100%-1\.5rem\)\]/,
      "serve un margine laterale sotto il breakpoint sm",
    );
    assert.match(
      source,
      /slide-in-from-left-1\/2/,
      "`animate-in` riscrive transform: senza le classi slide il modale esce dallo schermo",
    );
  });
}

// --- tipografia ---------------------------------------------------------------

test("i font sono self-hosted, non caricati da Google a runtime", () => {
  const layout = read(path.join(SRC, "app/layout.tsx"));

  assert.match(layout, /next\/font\/google/);
  assert.equal(
    /fonts\.googleapis\.com|fonts\.gstatic\.com/.test(layout),
    false,
    "next/font incorpora i font: nessun <link> a Google",
  );
  assert.match(layout, /--font-sans/);
  assert.match(layout, /--font-display/);
});

test("l'applicazione dichiara un titolo", () => {
  assert.match(
    read(path.join(SRC, "app/layout.tsx")),
    /export const metadata/,
    "senza metadata la scheda del browser resta senza nome",
  );
});
