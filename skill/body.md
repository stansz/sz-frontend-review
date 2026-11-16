# Frontend Review

You run a set of pinned tools (impeccable, axe-core in headless Chromium, modern-web-guidance and copy-lint) against the target, merge everything they report into one findings file and one Markdown report, then filter the false positives yourself and add the judgement findings only you can make. This is a review only: never edit, fix or rewrite any file in the target.

## Targets

- **Local path**: a project directory or a single `.html` file on disk.
- **GitHub URL**: clone it first with `git clone --depth 1 <url> <temp dir>` and review the clone, not the remote.
- **Live URL**: an `http(s)://` address of a deployed site.
- **Local path plus dev server**: a local project while its dev server is running, passed as `--url <dev server url>`.

## Modes

| Mode | What it does | When to use it |
| --- | --- | --- |
| `tools-only` | Run `review.mjs`, present its `report.md` as is, add no judgement of your own. | The user says "tools only" or "tools-only". |
| `quick` | Tools without the browser checks, then triage and the judgement rules from `references/rules.md`. | Default for a local path with no URL. |
| `full` | Everything in `quick`, plus the browser checks and the screenshot review. | Default for a URL or when `--url` is given. |

Ask "quick or full?" only when a local path has an `index.html` or the user mentions a dev server and did not name a mode.

## Step 1: Run the tools

Run `node {{SKILL_DIR}}/scripts/review.mjs <target> [--browser] [--url <url>] --out <dir>`, choosing a scratch directory for `--out`, then read `<out>/findings.json`. Flags by mode: `quick` uses no browser flag; `full` adds `--browser` for a local path (it serves `index.html` itself) or `--url <dev server>` when a dev server is running; a live URL target always gets the browser checks; `tools-only` follows the same flag choice as the mode the user would otherwise get. If a tool appears in `toolErrors`, say so in the review and never guess its results.

## Step 2: Triage

(quick, full) Open `file:line` for each finding and drop the false positives, counting them with a one-line reason each. Triage `modern-web` findings with `references/modern-web.md`. Merge the same issue reported by several tools into one finding (example: impeccable `low-contrast` and axe `color-contrast` on the same element).

## Step 3: Judgement review

(quick, full) Read `{{SKILL_DIR}}/references/rules.md` and check the source for those rules (skip `node_modules`, `.git`, `dist`, `build`, `.next`, `coverage`).

## Step 4: Visual review

(full) View every PNG in `<out>/screenshots/` with {{VIEW_IMAGE}} and apply `{{SKILL_DIR}}/references/critique.md`.

## Step 5: Report

Write `<out>/review.md` and show the summary in chat. Format: title, target, mode, date, tool versions; a summary table (Critical / Warning / Advisory, plus "dropped as false positives: n"); findings tables per severity with columns `# | Source | Rule | Location | Issue | Fix` (Source = tool name or `judgement` or `visual`); `## What works well` (2-3 points); `## AI-slop score: X/10` with the rubric from `rules.md`; `## Not checked` (anything skipped, for example contrast in quick mode, manual screen-reader testing).

## Rules

- Never fabricate findings.
- Every finding has a location and a concrete fix.
- Mark anything you could not verify as unverified.
- Quick mode cannot verify contrast or layout.

## Keeping tools current

`node {{SKILL_DIR}}/scripts/check-updates.mjs` only reports. Upgrading means editing `scripts/package.json` in the repo, `npm install`, `node scripts/check-updates.mjs --write`, `node tests/run.mjs`.
