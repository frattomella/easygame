#!/usr/bin/env sh
set -u

cd "$(dirname "$0")" || exit 1

echo ""
echo "EasyGame - Avvio locale"
echo ""

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js non e' installato o non e' nel PATH."
  echo "Installa Node.js LTS da https://nodejs.org/"
  printf "Premi Invio per chiudere..."
  read _answer
  exit 1
fi

export EASYGAME_HOLD_ON_ERROR=1

node scripts/start-local.mjs
status=$?

if [ "$status" -ne 0 ]; then
  echo ""
  echo "Avvio interrotto. Controlla i messaggi sopra."
  printf "Premi Invio per chiudere..."
  read _answer
fi

exit "$status"
