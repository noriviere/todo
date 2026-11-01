#!/bin/bash
# Démarrage d'une session Claude Code dans le cloud : active les hooks Git (pre-commit : tests Playwright ; pre-push : main fusionné).
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-.}"

# Chaque session repart d'une copie neuve du dépôt : on réactive les hooks Git versionnés (.githooks).
git config core.hooksPath .githooks
