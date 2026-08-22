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
