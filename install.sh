#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat >&2 <<'EOF'
Usage: ./install.sh --harness claude|hermes|all [--scope global|project] [--link|--copy] [--skip-npm] [--uninstall]
EOF
}

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

HARNESS=""
SCOPE="global"
MODE="link"
SKIP_NPM=0
UNINSTALL=0

while [ $# -gt 0 ]; do
  case "$1" in
    --harness)
      [ $# -ge 2 ] || { usage; exit 1; }
      HARNESS="$2"
      shift 2
      ;;
    --scope)
      [ $# -ge 2 ] || { usage; exit 1; }
      SCOPE="$2"
      shift 2
      ;;
    --link)
      MODE="link"
      shift
      ;;
    --copy)
      MODE="copy"
      shift
      ;;
    --skip-npm)
      SKIP_NPM=1
      shift
      ;;
    --uninstall)
      UNINSTALL=1
      shift
      ;;
    *)
      usage
      exit 1
      ;;
  esac
done

case "$HARNESS" in
  claude | hermes | all) ;;
  *)
    usage
    exit 1
    ;;
esac

case "$SCOPE" in
  global | project) ;;
  *)
    usage
    exit 1
    ;;
esac

if ! command -v node >/dev/null 2>&1; then
  echo "error: node is required (version 22 or higher)" >&2
  exit 1
fi
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$NODE_MAJOR" -lt 22 ]; then
  echo "error: node 22 or higher is required (found $(node --version))" >&2
  exit 1
fi

if [ "$SKIP_NPM" -eq 0 ] && [ "$UNINSTALL" -eq 0 ]; then
  (cd "$REPO/scripts" && npm ci --no-audit --no-fund)
fi

BROWSER_PATH="$(node "$REPO/scripts/lib/browser.mjs")"
echo "browser: $BROWSER_PATH"
if [ "$BROWSER_PATH" = "none" ]; then
  echo "warning: full mode needs Chromium, Chrome, Edge or Brave (set FRONTEND_REVIEW_BROWSER)" >&2
fi

target_for() {
  local harness="$1"
  case "$harness" in
    claude)
      if [ "$SCOPE" = "project" ]; then
        echo "$PWD/.claude/skills/frontend-review"
      else
        echo "${CLAUDE_SKILLS_DIR:-$HOME/.claude/skills}/frontend-review"
      fi
      ;;
    hermes)
      echo "${HERMES_HOME:-$HOME/.hermes}/skills/frontend-review"
      ;;
  esac
}

view_image_for() {
  case "$1" in
    claude) echo "the Read tool" ;;
    hermes) echo "the vision_analyze tool" ;;
  esac
}

install_one() {
  local h="$1"
  local T
  T="$(target_for "$h")"
  local VIEW
  VIEW="$(view_image_for "$h")"

  if [ "$h" = "hermes" ] && [ "$SCOPE" = "project" ]; then
    echo "note: hermes ignores --scope, installing to $T"
  fi

  if [ -e "$T" ] || [ -L "$T" ]; then
    if [ -f "$T/.frontend-review-install" ]; then
      rm -rf "$T"
    else
      echo "refusing to overwrite $T: not installed by install.sh" >&2
      exit 1
    fi
  fi

  mkdir -p "$T"
  if [ "$MODE" = "link" ]; then
    ln -s "$REPO/scripts" "$T/scripts"
    ln -s "$REPO/references" "$T/references"
  else
    cp -R "$REPO/scripts" "$T/scripts"
    cp -R "$REPO/references" "$T/references"
  fi

  cat "$REPO/harness/$h/header.md" "$REPO/skill/body.md" \
    | sed -e "s|{{SKILL_DIR}}|$T|g" -e "s|{{VIEW_IMAGE}}|$VIEW|g" > "$T/SKILL.md"

  if grep -q '{{' "$T/SKILL.md"; then
    echo "error: unresolved placeholder in $T/SKILL.md" >&2
    exit 1
  fi

  echo "$h $MODE" > "$T/.frontend-review-install"
  echo "installed $h -> $T"
}

uninstall_one() {
  local h="$1"
  local T
  T="$(target_for "$h")"
  if [ -f "$T/.frontend-review-install" ]; then
    rm -rf "$T"
    echo "removed $T"
  else
    echo "nothing to remove at $T"
  fi
}

HARNESSES=()
case "$HARNESS" in
  all) HARNESSES=(claude hermes) ;;
  *) HARNESSES=("$HARNESS") ;;
esac

for h in "${HARNESSES[@]}"; do
  if [ "$UNINSTALL" -eq 1 ]; then
    uninstall_one "$h"
  else
    install_one "$h"
  fi
done
