#!/usr/bin/env bash
set -euo pipefail

cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

fail() {
  echo "install test failed: $1" >&2
  exit 1
}

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

export CLAUDE_SKILLS_DIR="$TMP/claude-skills"
export HERMES_HOME="$TMP/hermes"
mkdir -p "$CLAUDE_SKILLS_DIR" "$HERMES_HOME"

# 1. install for both harnesses
if ! ./install.sh --harness all --skip-npm; then
  fail "./install.sh --harness all --skip-npm exited non-zero"
fi

# 2. claude SKILL.md
CLAUDE_SKILL="$CLAUDE_SKILLS_DIR/frontend-review/SKILL.md"
[ -f "$CLAUDE_SKILL" ] || fail "claude SKILL.md missing at $CLAUDE_SKILL"
grep -q 'name: frontend-review' "$CLAUDE_SKILL" || fail "claude SKILL.md lacks name: frontend-review"
grep -q 'allowed-tools' "$CLAUDE_SKILL" || fail "claude SKILL.md lacks allowed-tools"
grep -q "$CLAUDE_SKILLS_DIR/frontend-review/scripts/review.mjs" "$CLAUDE_SKILL" ||
  fail "claude SKILL.md lacks the review.mjs path"
grep -q 'the Read tool' "$CLAUDE_SKILL" || fail "claude SKILL.md lacks 'the Read tool'"
if grep -q '{{' "$CLAUDE_SKILL"; then
  fail "claude SKILL.md contains an unresolved {{ placeholder"
fi
[ -L "$CLAUDE_SKILLS_DIR/frontend-review/scripts" ] || fail "claude scripts is not a symlink"

# 3. hermes SKILL.md
HERMES_SKILL="$HERMES_HOME/skills/frontend-review/SKILL.md"
[ -f "$HERMES_SKILL" ] || fail "hermes SKILL.md missing at $HERMES_SKILL"
grep -q 'the vision_analyze tool' "$HERMES_SKILL" || fail "hermes SKILL.md lacks 'the vision_analyze tool'"
grep -q "$HERMES_HOME/skills/frontend-review/scripts/review.mjs" "$HERMES_SKILL" ||
  fail "hermes SKILL.md lacks the review.mjs path"
if grep -q '{{' "$HERMES_SKILL"; then
  fail "hermes SKILL.md contains an unresolved {{ placeholder"
fi

# 4. the installed skill runs
OUT4="$TMP/out4"
mkdir -p "$OUT4"
if ! node "$CLAUDE_SKILLS_DIR/frontend-review/scripts/review.mjs" fixtures/bad-page --out "$OUT4"; then
  fail "installed review.mjs exited non-zero"
fi
[ -f "$OUT4/findings.json" ] || fail "installed review.mjs did not write findings.json"

# 5. installing again exits 0
if ! ./install.sh --harness all --skip-npm; then
  fail "second ./install.sh --harness all --skip-npm exited non-zero"
fi

# 6. a plain folder without the marker is not overwritten
PLAIN="$TMP/plain"
mkdir -p "$PLAIN/frontend-review"
if CLAUDE_SKILLS_DIR="$PLAIN" ./install.sh --harness claude --skip-npm; then
  fail "install over a non-install.sh folder should exit non-zero"
fi

# 7. --copy installs a real directory, not a symlink
if ! ./install.sh --harness claude --copy --skip-npm; then
  fail "./install.sh --harness claude --copy --skip-npm exited non-zero"
fi
COPY_SCRIPTS="$CLAUDE_SKILLS_DIR/frontend-review/scripts"
[ -d "$COPY_SCRIPTS" ] || fail "copy install: scripts is not a directory"
[ ! -L "$COPY_SCRIPTS" ] || fail "copy install: scripts is still a symlink"

# 8. uninstall removes both targets
if ! ./install.sh --harness all --uninstall; then
  fail "./install.sh --harness all --uninstall exited non-zero"
fi
[ ! -e "$CLAUDE_SKILLS_DIR/frontend-review" ] || fail "claude target was not removed"
[ ! -e "$HERMES_HOME/skills/frontend-review" ] || fail "hermes target was not removed"

echo "install tests passed"
