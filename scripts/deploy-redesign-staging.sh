#!/usr/bin/env bash
#
# Pubblica il branch feat/web-redesign su easygame-redesign-staging, e SOLO li.
#
# Il 2026-09-16 un deploy del redesign e finito su `easygame-staging` (il
# progetto di Fortitudo) perche il worktree aveva copiato `.vercel/project.json`
# dalla root del repo, che e collegata a quel progetto: `vercel --prod` ha
# promosso il deployment e `prisma migrate deploy` ha applicato tre migrazioni
# al database sbagliato. Questo script stampa progetto e database ATTESI e
# REALI prima di ogni scrittura e si ferma al primo scarto.
#
# Uso: scripts/deploy-redesign-staging.sh [sha]   (default: HEAD)
set -euo pipefail

EXPECTED_PROJECT="easygame-redesign-staging"
EXPECTED_PROJECT_ID="prj_wGBiRPtiqrsCd4Ay48Jq91EWtXEj"
EXPECTED_ORG_ID="team_56v15oRca8im4pq2sNHthbwM"
EXPECTED_DB="ep-dry-block-alkxdiiu"

SHA="$(git rev-parse --short "${1:-HEAD}")"
WT="${DEPLOY_WT_ROOT:-C:/Users/Francesco/AppData/Local/Temp/deploy_wt}/redesign-${SHA}"

echo "EXPECTED PROJECT: ${EXPECTED_PROJECT} (${EXPECTED_PROJECT_ID})"
echo "EXPECTED DB:      ${EXPECTED_DB}"

git worktree add --detach "${WT}" "${SHA}" >/dev/null
trap 'git worktree remove --force "${WT}" >/dev/null 2>&1 || true' EXIT
cd "${WT}"

mkdir -p .vercel
printf '{"projectId":"%s","orgId":"%s","projectName":"%s"}' "${EXPECTED_PROJECT_ID}" "${EXPECTED_ORG_ID}" "${EXPECTED_PROJECT}" > .vercel/project.json

ACTUAL_PROJECT="$(node -e 'console.log(JSON.parse(require("fs").readFileSync(".vercel/project.json","utf8")).projectName)')"
ACTUAL_PROJECT_ID="$(node -e 'console.log(JSON.parse(require("fs").readFileSync(".vercel/project.json","utf8")).projectId)')"
echo "ACTUAL PROJECT:   ${ACTUAL_PROJECT} (${ACTUAL_PROJECT_ID})"
if [ "${ACTUAL_PROJECT}" != "${EXPECTED_PROJECT}" ] || [ "${ACTUAL_PROJECT_ID}" != "${EXPECTED_PROJECT_ID}" ]; then
  echo "ABORT: il progetto collegato non e ${EXPECTED_PROJECT}" >&2
  exit 2
fi

# Il database lo dice l'ambiente di produzione del progetto collegato, letto
# senza scrivere niente sul progetto.
npx vercel env pull .env.deploy-check --environment=production --yes >/dev/null 2>&1
ACTUAL_DB="$(grep -E '^DATABASE_URL=' .env.deploy-check | grep -oE 'ep-[a-z]+-[a-z]+-[a-z0-9]+' | head -1 || true)"
rm -f .env.deploy-check
echo "ACTUAL DB:        ${ACTUAL_DB:-<non letto>}"
if [ "${ACTUAL_DB}" != "${EXPECTED_DB}" ]; then
  echo "ABORT: il database del progetto non e ${EXPECTED_DB}" >&2
  exit 3
fi

if [ "${DRY_RUN:-0}" = "1" ]; then
  echo "DRY RUN: guardie superate, nessun deploy eseguito"
  exit 0
fi

npx vercel --prod --yes
