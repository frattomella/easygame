# Ambiente di prova del redesign — `easygame-redesign-staging`

Lo staging **corrente** (`easygame-staging`, usato da Fortitudo Scauri) non si
tocca. Il redesign vive in un secondo progetto Vercel con un database proprio.

| | Staging corrente | Redesign |
| --- | --- | --- |
| Progetto Vercel | `easygame-staging` (`prj_PUzyLcF1ctUzA0ymnutjL35DLvpE`) | `easygame-redesign-staging` (`prj_wGBiRPtiqrsCd4Ay48Jq91EWtXEj`) |
| Branch git | `main` / commit stabile `768ef05` | `feat/web-redesign` |
| Database | Neon `EasyGame` · branch `production` | Neon `EasyGame` · branch **`web-redesign-staging`** (`br-hidden-salad-alm93r7e`, figlio di `production` al 2026-09-14) |
| URL | `https://easygame-staging-pi.vercel.app` | `https://easygame-redesign-staging.vercel.app` |

## Variabili d'ambiente del redesign (create il 2026-09-15)

Copiate da `easygame-staging` **tranne**:

- `DATABASE_URL` / `DIRECT_URL` → il branch Neon `web-redesign-staging`
  (pooler e diretto). Mai il branch `production`.
- `CRON_SECRET` → rigenerato: i cron del redesign non sono chiamabili con il
  segreto dello staging vero.
- `NEXT_PUBLIC_APP_URL` / `AUTH_BASE_URL` → l'URL del redesign.
- `PAYMENT_MODE` → `test`.
- `EASYGAME_DB_ENV` → `web-redesign-staging`; `EASYGAME_ENV_LABEL` →
  `redesign-staging`.
- **Stripe** (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`,
  `STRIPE_BILLING_WEBHOOK_SECRET`): **non copiate** — sono variabili
  `sensitive`, non leggibili via API. Il pagamento online sul redesign risponde
  «provider non configurato» finche non si creano chiavi di test dedicate (un
  webhook su un secondo indirizzo vuole comunque un segreto proprio).
- `AUTH_RATE_LIMIT_SECRET` → copiato: da lui deriva la chiave che cifra le
  credenziali SMTP salvate nel database (copia di quelle del club), che
  altrimenti diventerebbero illeggibili.

## Come si pubblica

Il checkout principale resta collegato a `easygame-staging` (`.vercel/`): **non
si fa `vercel link` li dentro**. Si pubblica da un worktree separato, come per
i deploy dello staging vero:

```bash
git worktree add --detach "$TEMP/deploy_wt/redesign-<sha>" feat/web-redesign
cd "$TEMP/deploy_wt/redesign-<sha>"
mkdir -p .vercel
printf '{"projectId":"prj_wGBiRPtiqrsCd4Ay48Jq91EWtXEj","orgId":"team_56v15oRca8im4pq2sNHthbwM","projectName":"easygame-redesign-staging"}' > .vercel/project.json
npx vercel --prod --yes
```

Il build su Vercel esegue `npm run vercel-build` (`prisma migrate deploy` sul
database **del redesign**, poi `next build`). Dopo il deploy: stato `READY`,
smoke test su `/`, `/login`, `/api/v1/registry`.

## Accesso per le prove

Il database del redesign e una copia dello staging al 2026-09-14: gli account
sintetici di prova (`demo@easygame.it`, `staging.club-manager@easygame.invalid`…)
esistono gia. Nessuna scrittura del redesign raggiunge Fortitudo.
