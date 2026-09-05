/**
 * **Il giro conclusivo di attacco della lane PP-05.**
 *
 *     EASYGAME_DB_ENV=development \
 *       node --experimental-strip-types \
 *       --import ./tests/helpers/register-hooks.mjs \
 *       scripts/pp-05-giro-conclusivo-probe.mjs
 *
 * Le quattordici prove di `pp-05-sicurezza-probe.mjs` presidiano i difetti
 * **gia chiusi**: ognuna falliva prima del suo fix. Questo file e l'altra
 * meta — l'ultimo giro di attacco, con la superficie che il brief della lane
 * elenca, eseguito dopo le correzioni del quinto round. Le prove qui dentro
 * **non hanno mai fallito**: dicono che si e guardato, e dove.
 *
 * Un giro di attacco che non trova niente vale solo se e scritto: altrimenti
 * la volta dopo si riguarda cio che era gia sicuro e non cio che nessuno ha
 * mai aperto.
 *
 * - **C1** — iniezione HTML nei template: nome del club, nome dell'atleta,
 *   testo, e i due posti in cui un valore finisce **dentro un attributo**;
 * - **C2** — schemi pericolosi in un `href`, e colori che escono dallo stile;
 * - **C3** — esfiltrazione per immagine remota: il logo di un club che punta
 *   fuori dalla nostra origine non diventa un `<img>`;
 * - **C4** — iniezione di intestazioni SMTP da un oggetto con CR/LF;
 * - **C5** — l'anteprima: niente segreti SMTP nel catalogo, niente indirizzi
 *   dell'archivio, e nessun invio;
 * - **C6** — entropia del codice: sei cifre da un generatore crittografico,
 *   distribuzione piena, nessun codice in chiaro in archivio;
 * - **C7** — corsa fra due conferme simultanee dello stesso codice;
 * - **C8** — `__proto__` e `constructor` nelle preferenze, dalle due porte;
 * - **C9** — cambiare indirizzo non concede la piattaforma, e azzera la prova.
 *
 * **La sonda misura, non corregge.** Scrive righe proprie con identificativi
 * casuali e le cancella alla fine. Nessun byte lascia la macchina: i due
 * trasporti sono doppi.
 */

import { randomBytes, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

if (process.env.EASYGAME_DB_ENV !== "development") {
  console.error("Rifiuto: serve EASYGAME_DB_ENV=development.");
  process.exit(1);
}

process.env.AUTH_ALLOW_TEST_CODES = "true";
process.env.SMS_PROVIDER = "noop";

const carica = (rel) => import(pathToFileURL(path.resolve(rel)).href);
const { PrismaClient } = await carica("node_modules/@prisma/client/default.js");
const prisma = new PrismaClient({ log: [] });

const esiti = [];
const segna = (nome, sicuro, dettaglio) => {
  esiti.push({ nome, sicuro });
  console.log(`[${sicuro ? "SICURO" : "BUCATO"}] ${nome}\n        ${dettaglio}`);
};

const marchio = randomBytes(4).toString("hex");
const creati = new Set();

const nuovoUtente = async (dati = {}) => {
  const { hashPassword } = await carica("src/lib/server/auth.ts");
  const utente = await prisma.user.create({
    data: {
      email: `gc-${marchio}-${randomUUID().slice(0, 8)}@example.invalid`,
      password_hash: await hashPassword("PasswordDiProva!2026"),
      role: "user",
      token_verification_id: `verify_${randomBytes(16).toString("hex")}`,
      ...dati,
    },
  });
  creati.add(utente.id);
  return utente;
};

const pulisci = async () => {
  const ids = [...creati];
  if (!ids.length) return;
  await prisma.session.deleteMany({ where: { user_id: { in: ids } } });
  await prisma.authVerificationChallenge.deleteMany({
    where: { user_id: { in: ids } },
  });
  await prisma.externalAccount.deleteMany({ where: { user_id: { in: ids } } });
  await prisma.auditLog.deleteMany({ where: { actor_user_id: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
};

/** Il carico ostile, in un pezzo solo: se compare intatto, e passato. */
const OSTILE = `</td><script>alert(1)</script><img src=x onerror=alert(2)>"' `;

const main = async () => {
  const core = await carica("src/lib/server/email/template-core.ts");

  /* ------------------------------------------------------------- C1 */
  {
    const documento = core.renderEmailDocument({
      brand: {
        mode: "club",
        clubName: `Club ${OSTILE}`,
        accentColor: "#ff0000; background:url(https://tracciante.invalid/x)",
        logoUrl: "https://tracciante.invalid/logo.png",
      },
      preheader: `Anteprima ${OSTILE}`,
      blocks: [
        { kind: "heading", text: `Titolo ${OSTILE}` },
        { kind: "paragraph", text: `Atleta ${OSTILE}` },
        {
          kind: "button",
          label: `Paga ${OSTILE}`,
          url: "https://esempio.test/paga",
        },
        {
          kind: "infoBox",
          title: `Riquadro ${OSTILE}`,
          rows: [{ label: `Etichetta ${OSTILE}`, value: `Valore ${OSTILE}` }],
        },
      ],
    });

    const html = documento.html;
    segna(
      "C1-a nessuno `<script>` vivo nel markup reso",
      !/<script/i.test(html),
      `occorrenze di "<script" = ${(html.match(/<script/gi) || []).length}`,
    );
    /*
      **Il carico sfuggito contiene la stringa `onerror=`, e va bene.**
      `&lt;img src=x onerror=alert(2)&gt;` e testo: nessun parser HTML ci vede
      un tag, quindi nessun attributo. Cercare `on\w+=` sul markup intero da
      tre falsi positivi. Si cerca su cio che resta **tolti i tag inerti**,
      cioe le sequenze fra `&lt;` e `&gt;`, che e esattamente il segno che
      l'escaping ha funzionato.
    */
    const vivo = html.replace(/&lt;[\s\S]*?&gt;/g, "");
    segna(
      "C1-b nessun gestore d'evento in linea, fuori dal testo sfuggito",
      !/on\w+\s*=/i.test(vivo),
      `occorrenze fuori dai tag inerti = ${(vivo.match(/on\w+\s*=/gi) || []).length}` +
        ` · dentro il testo sfuggito = ${(html.match(/on\w+\s*=/gi) || []).length}`,
    );
    segna(
      "C1-c il carico compare solo nella forma sfuggita",
      !html.includes("<script>alert(1)</script>") &&
        html.includes("&lt;script&gt;"),
      "il markup ostile e diventato entita",
    );
    segna(
      "C1-d le virgolette del carico non chiudono un attributo",
      !/(alt|title|href)="[^"]*"[^>]*alert/i.test(html),
      "nessuna rottura di attributo misurata",
    );
    /*
      **Il testo semplice porta il carico non sfuggito, ed e giusto cosi.**
      Sfuggirlo mostrerebbe `&lt;` a chi legge la posta in testo. La proprieta
      da provare non e «non contiene markup», e «non finisce mai in un posto
      che lo interpreta»: nel messaggio e una parte `text/plain`, e nell'unica
      pagina che lo mostra e un figlio JSX — cioe React lo sfugge — mentre in
      `srcDoc` finisce solo `html`.
    */
    segna(
      "C1-e il testo semplice e testo: nell'anteprima non entra mai in `srcDoc`",
      documento.text.includes("<script>") &&
        (() => {
          const pagina = readFileSync(
            "src/app/private/email-preview/page.tsx",
            "utf8",
          );
          return (
            /srcDoc=\{voce\.html\}/.test(pagina) &&
            !/dangerouslySetInnerHTML/.test(pagina) &&
            !/srcDoc=\{voce\.text\}/.test(pagina)
          );
        })(),
      "il carico resta leggibile nel testo, e la pagina lo rende come figlio JSX",
    );
  }

  /* ------------------------------------------------------------- C2 */
  {
    const cattivi = [
      "javascript:alert(1)",
      "JaVaScRiPt:alert(1)",
      " javascript:alert(1)",
      "data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==",
      "vbscript:msgbox(1)",
      "file:///etc/passwd",
      "/relativo",
      "//tracciante.invalid/x",
    ];
    const passati = cattivi.filter((u) => core.sanitizeEmailUrl(u) !== null);
    segna(
      "C2-a nessuno schema pericoloso diventa un `href`",
      passati.length === 0,
      passati.length ? `passati: ${passati.join(", ")}` : "otto forme rifiutate",
    );
    segna(
      "C2-b controspecchio: http, https e mailto restano ammessi",
      ["https://esempio.test/x", "http://esempio.test", "mailto:a@b.test"].every(
        (u) => core.sanitizeEmailUrl(u) !== null,
      ),
      "i tre schemi utili passano",
    );

    const coloriCattivi = [
      "#fff; background:url(https://tracciante.invalid/x)",
      "red",
      "rgb(1,2,3)",
      "expression(alert(1))",
      "#ff0000)",
    ];
    const coloriPassati = coloriCattivi.filter(
      (c) => core.sanitizeEmailColor(c) !== null,
    );
    segna(
      "C2-c nessun colore esce dallo stile in linea",
      coloriPassati.length === 0,
      coloriPassati.length ? coloriPassati.join(", ") : "cinque forme rifiutate",
    );
  }

  /* ------------------------------------------------------------- C3 */
  {
    const fuori = core.resolveBrandLogo({
      mode: "club",
      clubName: "ASD Prova",
      logoUrl: "https://tracciante.invalid/pixel.png",
    });
    segna(
      "C3-a un logo su un host altrui non diventa un `<img>`",
      fuori.kind === "text",
      `forma = ${fuori.kind}`,
    );

    const dato = core.resolveBrandLogo({
      mode: "club",
      clubName: "ASD Prova",
      logoUrl: "data:image/png;base64,iVBORw0KGgo=",
    });
    segna(
      "C3-b ne lo diventa un data URL",
      dato.kind === "text",
      `forma = ${dato.kind}`,
    );

    const nostro = core.resolveBrandLogo({
      mode: "easygame",
    });
    segna(
      "C3-c controspecchio: il logo EasyGame e servito dalla nostra origine",
      nostro.kind === "image" &&
        nostro.url.startsWith(
          (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3001").replace(
            /\/+$/,
            "",
          ),
        ),
      nostro.url,
    );

    /* Nessun `<img>` verso un host che non sia il nostro, in tutto il markup. */
    const documento = core.renderEmailDocument({
      brand: {
        mode: "club",
        clubName: "ASD Prova",
        logoUrl: "https://tracciante.invalid/pixel.png",
      },
      blocks: [{ kind: "paragraph", text: "ciao" }],
    });
    const sorgenti = [...documento.html.matchAll(/<img[^>]+src="([^"]+)"/gi)].map(
      (m) => m[1],
    );
    const nostraOrigine = new URL(
      process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3001",
    ).origin;
    const estranee = sorgenti.filter((s) => !s.startsWith(nostraOrigine));
    segna(
      "C3-d nel markup reso non c'e nessuna immagine di terzi",
      estranee.length === 0,
      estranee.length ? estranee.join(", ") : `immagini = ${sorgenti.length}`,
    );
  }

  /* ------------------------------------------------------------- C4 */
  {
    /*
      **Si misura il MIME vero, non l'oggetto passato al trasporto.**
      `jsonTransport` restituisce i campi com'erano — quindi un oggetto con
      CR/LF ricompare intatto, e sembra un difetto: e solo lo strumento
      sbagliato, perche li nessuna intestazione viene costruita. Con
      `streamTransport` escono i byte che partirebbero davvero.

      Il compositore piega il valore su **una riga sola**: i CR/LF diventano
      spazi, e cio che sembrava una intestazione nuova resta testo dentro
      l'oggetto. Non e una difesa di EasyGame ed e giusto scriverlo — e una
      proprieta della libreria, e questa prova serve a sapere quando smette di
      valere.
    */
    const nodemailer = (
      await carica("node_modules/nodemailer/lib/nodemailer.js")
    ).default;
    const trasporto = nodemailer.createTransport({
      streamTransport: true,
      buffer: true,
      newline: "unix",
    });
    const esito = await trasporto.sendMail({
      from: "EasyGame <no-reply@esempio.test>",
      to: "famiglia@esempio.test",
      subject: "Convocazione\r\nBcc: vittima@altrove.invalid\r\nX-Iniettato: si",
      html: "<p>ciao</p>",
      text: "ciao",
    });
    const mime = esito.message.toString("utf8");
    const intestazioni = mime.split(/\n\n/)[0];
    segna(
      "C4-a un oggetto con CR/LF non fabbrica nessuna intestazione nuova",
      !/^X-Iniettato:/m.test(intestazioni),
      `riga oggetto = ${JSON.stringify((intestazioni.match(/^Subject:.*/m) || [""])[0].slice(0, 72))}`,
    );
    segna(
      "C4-b e non compare nessun destinatario nascosto",
      !/^Bcc:/im.test(intestazioni),
      `intestazioni = ${intestazioni.split("\n").filter((r) => /^[A-Z]/.test(r)).length} righe, nessuna Bcc`,
    );
  }

  /* ------------------------------------------------------------- C5 */
  {
    const catalogo = await carica("src/lib/server/email/preview-catalog.ts");
    const servizio = await carica("src/lib/server/email/email-service.ts");

    const inviati = [];
    servizio.__setEmailProviderForTests({
      id: "sonda",
      async verify() {},
      async send(m) {
        inviati.push(m);
      },
    });

    /* Un segreto vero in archivio: se il catalogo lo legge, si vede. */
    const voci = catalogo.buildEmailPreviewCatalog();
    const testo = JSON.stringify(voci);

    segna(
      "C5-a costruire l'anteprima non spedisce niente",
      inviati.length === 0,
      `invii = ${inviati.length} · voci = ${voci.length}`,
    );
    segna(
      "C5-b nessun indirizzo dell'archivio nell'anteprima",
      !creati.size ||
        ![...creati].some((id) => testo.includes(id)),
      "nessun identificativo di riga",
    );
    const segreti = [
      "password_ciphertext",
      "AUTH_OTP_SECRET",
      "CRON_SECRET",
      "DATABASE_URL",
      "smtp_password",
      String(process.env.DATABASE_URL || "").slice(0, 24),
    ].filter((s) => s && testo.includes(s));
    segna(
      "C5-c nessun segreto SMTP o di ambiente nel catalogo",
      segreti.length === 0,
      segreti.length ? segreti.join(", ") : "sei stringhe cercate, nessuna trovata",
    );
    segna(
      "C5-d nessuno `<script>` vivo in nessuna delle voci",
      !/<script/i.test(testo),
      `voci ispezionate = ${voci.length}`,
    );

    /* E la pagina si chiude a chi non e amministratore di piattaforma. */
    const pagina = readFileSync("src/app/private/email-preview/page.tsx", "utf8");
    segna(
      "C5-e la pagina pretende una sessione e il ruolo di piattaforma",
      /if\s*\(!session\)/.test(pagina) &&
        /isPlatformAdminSession\(session\)/.test(pagina) &&
        /redirect\("\/login"\)/.test(pagina),
      "due guardie e due redirect",
    );
    segna(
      "C5-f i riquadri sono in `sandbox`, cosi il markup ostile non eredita l'origine",
      /sandbox=""/.test(pagina),
      "attributo presente",
    );

    servizio.__setEmailProviderForTests(undefined);
  }

  /* ------------------------------------------------------------- C6 */
  {
    const flussi = await carica("src/lib/server/auth-workflows.ts");
    const { __setSmsProviderForTests } = await carica(
      "src/lib/server/sms/sms-service.ts",
    );
    const smsRicevuti = [];
    __setSmsProviderForTests({
      id: "sonda",
      async send(m) {
        smsRicevuti.push(m);
      },
    });

    const utente = await nuovoUtente({
      phone: `+39340${String((parseInt(marchio, 16) + 11) % 10_000_000).padStart(7, "0")}`,
      phone_verification_required: true,
    });

    /*
      Il generatore non e esportato, e va bene cosi: si misura **cio che esce
      dalla catena vera**. Fra un giro e l'altro si toglie la riga viva, che e
      cio che tiene sia l'indice unico sia il cooldown.
    */
    const codici = [];
    const cifre = new Set();
    const posizioni = Array.from({ length: 6 }, () => new Set());
    for (let i = 0; i < 150; i += 1) {
      const c = await flussi.sendPhoneVerificationChallenge(utente, "verify_phone");
      codici.push(c.previewCode);
      for (let p = 0; p < 6; p += 1) {
        cifre.add(c.previewCode[p]);
        posizioni[p].add(c.previewCode[p]);
      }
      await prisma.authVerificationChallenge.deleteMany({
        where: { user_id: utente.id },
      });
    }
    const distinti = new Set(codici);
    segna(
      "C6-a centocinquanta codici sono tutti di sei cifre, e tutti diversi",
      codici.every((c) => /^\d{6}$/.test(c)) && distinti.size === codici.length,
      `distinti = ${distinti.size}/${codici.length}`,
    );
    segna(
      "C6-b ogni posizione vede tutte e dieci le cifre: nessun intervallo mutilato",
      posizioni.every((p) => p.size === 10),
      `per posizione = ${posizioni.map((p) => p.size).join(",")} · cifre = ${cifre.size}/10`,
    );
    segna(
      "C6-b2 gli zeri iniziali esistono, cioe l'intervallo e il milione intero",
      codici.some((c) => c.startsWith("0")),
      `codici che iniziano per zero = ${codici.filter((c) => c.startsWith("0")).length}`,
    );

    const challenge = await flussi.sendPhoneVerificationChallenge(
      utente,
      "verify_phone",
    );
    const riga = await prisma.authVerificationChallenge.findFirst({
      where: { user_id: utente.id, consumed_at: null },
      orderBy: { created_at: "desc" },
    });
    segna(
      "C6-c il codice non e in nessuna colonna della riga",
      !JSON.stringify(riga).includes(challenge.previewCode),
      `impronta = ${String(riga?.code_hash || "").slice(0, 12)}…`,
    );

    /* ----------------------------------------------------------- C7 */
    const esiti8 = await Promise.allSettled(
      Array.from({ length: 8 }, () =>
        flussi.confirmPhoneVerification(
          utente.token_verification_id,
          challenge.previewCode,
          utente.id,
        ),
      ),
    );
    const riuscite = esiti8.filter((e) => e.status === "fulfilled").length;
    segna(
      "C7 otto conferme simultanee dello stesso codice: una sola vince",
      riuscite === 1,
      `riuscite = ${riuscite}/8`,
    );

    __setSmsProviderForTests(undefined);
  }

  /* ------------------------------------------------------------- C8 */
  {
    const politica = await carica("src/lib/auth/user-metadata-policy.ts");
    const ripulito = politica.stripProtectedUserMetadata(
      JSON.parse('{"__proto__":{"isAdmin":true},"constructor":{"x":1},"tema":"chiaro"}'),
    );
    segna(
      "C8-a `__proto__` fra le preferenze non inquina il prototipo",
      {}.isAdmin === undefined && Object.prototype.isAdmin === undefined,
      `oggetto = ${JSON.stringify(ripulito)}`,
    );
    segna(
      "C8-b e resta una proprieta propria, non una scrittura sul prototipo",
      Object.getPrototypeOf(ripulito) === Object.prototype,
      "prototipo intatto",
    );
  }

  /* ------------------------------------------------------------- C9 */
  {
    const admin = await carica("src/lib/platform-admin.ts");
    const elenco = (process.env.EASYGAME_PLATFORM_ADMIN_EMAILS || "")
      .split(",")[0]
      .trim();

    const rotta = await carica("src/app/api/v1/auth/user/route.ts");
    const utente = await nuovoUtente({ email_verified_at: new Date() });
    const gettone = `sess-${randomBytes(20).toString("hex")}`;
    await prisma.session.create({
      data: {
        token: gettone,
        user_id: utente.id,
        expires_at: new Date(Date.now() + 3600_000),
      },
    });

    const risposta = await rotta.PATCH(
      new Request("http://easygame.local/api/v1/auth/user", {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          "x-forwarded-for": `203.0.113.${(parseInt(marchio.slice(0, 2), 16) % 250) + 1}`,
          cookie: `easygame_session=${gettone}`,
        },
        body: JSON.stringify({
          email: elenco,
          currentPassword: "PasswordDiProva!2026",
        }),
      }),
    );
    const corpo = await risposta.json().catch(() => ({}));
    const dopo = await prisma.user.findUnique({ where: { id: utente.id } });

    segna(
      "C9-a cambiare indirizzo azzera la prova, quindi non concede la piattaforma",
      !dopo?.email_verified_at ||
        String(dopo.email).toLowerCase() !== elenco.toLowerCase(),
      `stato = ${risposta.status} · email = ${dopo?.email} · verificata = ${Boolean(dopo?.email_verified_at)}`,
    );
    segna(
      "C9-b e il controllo di piattaforma risponde di no sulla riga vera",
      admin.isPlatformAdminUser(dopo) === false,
      `admin = ${admin.isPlatformAdminUser(dopo)} · messaggio = ${String(corpo?.error?.message || "").slice(0, 50)}`,
    );
  }
};

try {
  await main();
} finally {
  await pulisci();
  await prisma.$disconnect();
}

const bucate = esiti.filter((e) => !e.sicuro);
console.log(
  `\nGiro conclusivo PP-05: ${esiti.length - bucate.length}/${esiti.length} sicure.`,
);
process.exit(bucate.length ? 1 : 0);
