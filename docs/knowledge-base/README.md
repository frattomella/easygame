# EasyGame Knowledge Base

Questa cartella e la **fonte di verita** per lo sviluppo di EasyGame, umano o
assistito da AI. Descrive il codice **realmente presente nel repository**, non
comportamenti desiderati o pianificati.

> Regola: se una informazione qui e in contrasto con il codice, vince il codice
> e la KB va corretta nello stesso commit che introduce la differenza.

## Come leggere questa KB

| # | Documento | Quando leggerlo |
|---|-----------|-----------------|
| 01 | [Product vision e glossario](01-product-vision-and-glossary.md) | Sempre, prima di qualsiasi task |
| 02 | [Mappa del repository](02-repository-map.md) | Per orientarsi tra i file |
| 03 | [Architettura generale](03-architecture-overview.md) | Prima di modifiche strutturali |
| 04 | [Architettura Web](04-web-architecture.md) | Task su Next.js / Web App |
| 05 | [Architettura Mobile](05-mobile-architecture.md) | Task su Expo / Mobile App |
| 06 | [Modello dati](06-data-model.md) | Task su Prisma / Neon / query |
| 07 | [Autenticazione e sessioni](07-authentication.md) | Task su login, OTP, OAuth |
| 08 | [Ruoli e permessi](08-roles-and-permissions.md) | Task su accessi e autorizzazioni |
| 09 | [Convenzioni API](09-api-conventions.md) | Task su endpoint `/api` |
| 10 | [Convenzioni UI/UX](10-ui-ux-conventions.md) | Task su componenti e pagine |
| 11 | [Capability e domini](11-capabilities.md) | Per capire cosa e completo e cosa no |
| 12 | [Integrazioni](12-integrations.md) | Task su SMTP, SMS, OAuth, pagamenti |
| 13 | [Ambienti: Vercel, Neon, env](13-environments.md) | Prima di build, deploy, migrazioni |
| 14 | [Sicurezza](14-security.md) | Sempre prima di toccare auth o API |
| 15 | [Testing](15-testing.md) | Prima di aprire un commit |
| 16 | [Debito tecnico](16-technical-debt.md) | Per capire i limiti noti |
| 17 | [Convenzioni di sviluppo](17-development-conventions.md) | Sempre, prima di scrivere codice |
| 18 | [Decision log / ADR](18-decision-log.md) | Prima di cambiare una scelta architetturale |
| 19 | [Roadmap](19-roadmap.md) | Per capire la direzione |
| 20 | [Work Package](20-work-packages.md) | Per scegliere il prossimo task |
| 21 | [Backlog master](21-backlog.md) | Per sapere a che punto e una richiesta gia fatta |
| 22 | [Matrice Release Candidate](22-release-candidate.md) | Il percorso fino al Blocco D2. **Superata dalla 23** |
| 23 | [Matrice definitiva Web V1](23-v1-release-matrix.md) | Per sapere se si puo rilasciare: ogni requisito V1 con il suo stato e la sua prova |
| 24 | [RC Fix 1](24-rc-fix-1.md) | Gli undici difetti operativi chiusi prima della produzione: causa vera, correzione, e la misura che lo prova |
| 25 | [RC Fix 2](25-rc-fix-2.md) | Anagrafiche coerenti, azioni di massa, marchio dell'intermediario — e i due difetti che si sono visti solo provando l'applicazione |
| 26 | [Full Club UAT](26-full-club-uat.md) | Il collaudo fatto creando un club da zero: due stagioni su un club nuovo, incassi concorrenti che si sommavano, e i nomi con l'accento che non si trovavano |
| 27 | [RC Fix 3](27-rc-fix-3.md) | I tre residui fra il collaudo e la produzione: le Entrate che non erano cassa, le date di nascita che `new Date` cambiava invece di rifiutare, e le impostazioni del club che due finestre si cancellavano |
| 28 | [Lavoro sportivo e compensi: analisi](28-lavoro-sportivo-e-compensi-analisi.md) | Cosa dice la normativa, cosa EasyGame poteva riusare, e le venti regole che non potevano diventare codice senza la firma di un professionista |
| 29 | [Lavoro sportivo: implementazione e UAT](29-lavoro-sportivo-implementazione-uat.md) | Il dominio costruito sull'analisi 28, e il collaudo a runtime che ha trovato due difetti che duemila test verdi non vedevano |
| 30 | [Golee vs EasyGame: gap audit](30-golee-easygame-gap-audit.md) | Il confronto competitivo e funzionale con Golee: 189 capability, dove EasyGame e gia avanti, i 72 gap che valgono davvero, e cosa **non** va copiato |
| 31 | [Wave 1: planning esecutivo](31-wave-1-planning.md) | Il piano della prima wave: i nove gap riesaminati, la verifica a runtime che ha confermato il difetto del cambio stagione, i due soli blocker veri, sette workstream e l'ordine in cui unirli |
| — | [Report di cleanup](cleanup-report.md) | Classificazione file SAFE / REVIEW / KEEP |

## Documenti operativi preesistenti (mantenuti)

- [`docs/api-registry.md`](../api-registry.md) — elenco leggibile degli endpoint
- [`docs/multi-tenant-architecture.md`](../multi-tenant-architecture.md) — scelta multi-tenant
- [`docs/testing-and-deploy.md`](../testing-and-deploy.md) — guida operativa testing/deploy

## Stato del documento

- Ultimo audit completo: **2026-08-22**
- Commit di riferimento: branch `codex/recovery-20260820-pre-wp02`
- Baseline verificata: `npm test` **84/84**, `npm run typecheck` OK,
  `npm run lint` 0 errori, `npm run build` OK (**120 route, 62 s**),
  mobile `check:types` e `lint` verdi

### Hardening del 2026-08-22

Dopo l'audit iniziale sono stati eseguiti, in attuazione degli ADR 0011–0022:

- rotazione delle credenziali demo esposte su staging e rimozione delle
  password dalla documentazione ([14 — Sicurezza](14-security.md), incidente I-01);
- guardia sulle scritture verso database condivisi ([13](13-environments.md));
- CI con gate e guardrail di sicurezza;
- route guard su tutte le aree, piu il middleware edge ([08](08-roles-and-permissions.md));
- reset password via SMTP ([07](07-authentication.md));
- rimozione dell'accesso diretto al database dal mobile ([05](05-mobile-architecture.md));
- rimozione di Babel e ritorno a SWC ([16](16-technical-debt.md) D8).
