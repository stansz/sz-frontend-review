## Goal

Turn this repo (v1: a Hermes-only frontend review skill with a regex scanner) into v2: a harness-agnostic frontend review skill that installs into Claude Code and Hermes with one script. v2 runs four pinned, lockfile-installed tools and merges their output into one findings JSON and one Markdown report:

1. impeccable 4.9.1 (`impeccable detect --json`): AI-slop and design-quality rules, on source and on a live URL.
2. axe-core 4.14.0, run in headless Chromium through playwright-core 1.64.1: WCAG 2.2 AA accessibility.
3. modern-web-guidance 1.0.0 (`modern-web-guidance legacy-scan --json`): outdated web-platform patterns.
4. copy-lint.mjs, vendored from taste-skill (MIT): model-sounding marketing copy.

Plus our own browser checks (screenshots at 390/768/1280, horizontal overflow, WCAG 2.2 target size, console errors). The v1 regex scanner and all Browserbase usage are removed. The agent (Claude or Hermes) reads the merged findings, filters false positives, adds judgement findings and writes the final review; that part is instructions in the skill text only.

## Files to touch

- `SKILL.md`
- `scripts/check-source.mjs`
- `scripts/check-updates.mjs`
- `references/rules.md`
- `README.md`
- `.gitignore` (new)
- `NOTICE` (new)
- `install.sh` (new)
- `skill/body.md` (new)
- `harness/claude/header.md` (new)
- `harness/hermes/header.md` (new)
- `references/critique.md` (new)
- `references/modern-web.md` (new)
- `references/severity-overrides.json` (new)
- `references/impeccable-rules.txt` (new)
- `scripts/package.json` (new)
- `scripts/package-lock.json` (new)
- `scripts/review.mjs` (new)
- `scripts/browser-audit.mjs` (new)
- `scripts/lib/browser.mjs` (new)
- `scripts/lib/serve.mjs` (new)
- `scripts/vendor/copy-lint.mjs` (new)
- `scripts/vendor/LICENSE-taste-skill` (new)
- `fixtures/bad-page/index.html` (new)
- `fixtures/bad-page/style.css` (new)
- `tests/run.mjs` (new)
- `tests/install.test.sh` (new)

## Steps

All scripts are ES modules (`.mjs`), Node 22+, no TypeScript, no build step. Use only `node:` built-ins plus the four dependencies below. Do every step in order and check it before the next.

### 1. Remove v1 files

Delete `SKILL.md` and `scripts/check-source.mjs` with `git rm -q SKILL.md scripts/check-source.mjs` (removing them from the index is fine; do not commit).

### 2. `.gitignore`

Create `.gitignore` with exactly these lines:

```
node_modules/
*.log
```

### 3. `scripts/package.json` and lockfile

Create `scripts/package.json`:

```json
{
  "name": "frontend-review-tools",
  "private": true,
  "version": "2.0.0",
  "type": "module",
  "engines": { "node": ">=22" },
  "dependencies": {
    "axe-core": "4.14.0",
    "impeccable": "4.9.1",
    "modern-web-guidance": "1.0.0",
    "playwright-core": "1.64.1"
  }
}
```

Then run `cd scripts && npm install --no-audit --no-fund` to create `scripts/package-lock.json`. Check: `scripts/node_modules/.bin/impeccable --help` and `scripts/node_modules/.bin/modern-web-guidance --help` both print usage. Do not run `npx playwright install` (we use the system Chromium).

### 4. Vendor copy-lint

```
mkdir -p scripts/vendor
curl -fsSL https://raw.githubusercontent.com/Leonxlnx/taste-skill/f6b76575f949707b4e3c37cd86cb44b0b98643e8/skills/taste-skill/scripts/copy-lint.mjs -o scripts/vendor/copy-lint.mjs
curl -fsSL https://raw.githubusercontent.com/Leonxlnx/taste-skill/f6b76575f949707b4e3c37cd86cb44b0b98643e8/LICENSE -o scripts/vendor/LICENSE-taste-skill
sha256sum scripts/vendor/copy-lint.mjs scripts/vendor/LICENSE-taste-skill
```

The hashes must be `1d9238959378867f24fdc232279c8526fe985aa09435d36ad745c0573b646bdb` (copy-lint.mjs) and `4575a543ab88dad12ccea7d97e563d0bce5b448b06072e65d3264497dad326df` (LICENSE). If either differs, stop and report. Then insert these two lines directly after line 1 (`#!/usr/bin/env node`) of `scripts/vendor/copy-lint.mjs`, changing nothing else in the file:

```
// Vendored from https://github.com/Leonxlnx/taste-skill (commit f6b7657), MIT License, see LICENSE-taste-skill.
// Unmodified apart from these two comment lines.
```

Check: `node scripts/vendor/copy-lint.mjs --json README.md` prints JSON starting with `{`.

### 5. `scripts/lib/browser.mjs`

Export `findBrowser()` returning the first existing file path from this list, or `null`:

1. `process.env.FRONTEND_REVIEW_BROWSER`, `process.env.IMPECCABLE_BROWSER`, `process.env.CHROME_PATH` (each only if set and the file exists)
2. `/usr/lib64/chromium-browser/chromium-browser`, `/usr/bin/chromium-browser`, `/usr/bin/chromium`, `/usr/bin/google-chrome-stable`, `/usr/bin/google-chrome`, `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`, `/Applications/Chromium.app/Contents/MacOS/Chromium`

Use `fs.statSync(p).isFile()` inside try/catch. When the file is run directly (`process.argv[1]` resolves to this file), print the found path or `none` and exit 0.

### 6. `scripts/lib/serve.mjs`

Export `async function serveDir(root)` that starts a `node:http` server on `127.0.0.1`, port `0`, serving static files from `root`, and resolves to `{ origin, close }` where `origin` is `http://127.0.0.1:<port>` and `close()` returns a Promise that closes the server. Rules: strip the query string, `decodeURIComponent` the path, `path.normalize`, join with `root`, and return 403 if the result is outside `root`. A path ending in `/` serves `index.html`. Missing file: 404. Content types by extension: html `text/html; charset=utf-8`, css `text/css`, js and mjs `text/javascript`, json `application/json`, svg `image/svg+xml`, png, jpg/jpeg, gif, webp, ico, woff, woff2 with their standard types; anything else `application/octet-stream`.

### 7. `scripts/browser-audit.mjs`

Export `async function audit({ url, outDir })` returning `{ findings, screenshots, renderedHtml }`. Also runnable directly: `node scripts/browser-audit.mjs <url> --out <dir>` prints that object as JSON.

- `const executablePath = findBrowser()`; if null throw `new Error('No Chromium-based browser found; set FRONTEND_REVIEW_BROWSER')`.
- `const { chromium } = await import('playwright-core')`; `chromium.launch({ executablePath, headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] })`. Close the browser in `finally`.
- Viewports in this order: `{ name: 'mobile', width: 390, height: 844 }`, `{ name: 'tablet', width: 768, height: 1024 }`, `{ name: 'desktop', width: 1280, height: 900 }`. For each: `browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 })`, new page, `page.goto(url, { waitUntil: 'load', timeout: 30000 })`, then `page.waitForTimeout(500)`. Close the context after each viewport.
- Screenshot every viewport to `<outDir>/screenshots/<name>-<width>.png` (create the folder). Use `fullPage: true` when `document.documentElement.scrollHeight <= 8000`, else `fullPage: false`.
- Every viewport, horizontal overflow: evaluate `{ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }`. If `sw > cw + 1`, also evaluate up to 5 short CSS selectors (tag + `#id` or first class) of elements whose `getBoundingClientRect().right > cw + 1`, and add a finding: tool `browser`, rule `horizontal-overflow`, severity `error`, viewport `<width>px`, detail `Page is <sw>px wide in a <cw>px viewport`, fix `Find the element wider than the viewport (fixed widths, long unbroken strings, wide media or tables) and let it shrink or wrap.`, meta `{ offenders }`.
- Mobile only, target size: evaluate all visible elements matching `a[href],button,input:not([type=hidden]),select,textarea,summary,[role=button],[role=link],[role=checkbox],[role=tab]` (visible = rect width > 0 and height > 0 and computed `visibility` is not `hidden`) whose rect width < 24 or height < 24. Skip inline text links: an `A` element with `el.closest('p,li')` whose parent's trimmed `textContent` is longer than its own trimmed `textContent`. Cap at 20. Each: tool `browser`, rule `target-size`, severity `warning`, viewport `390px`, detail `<selector> is <w>x<h>px` (rounded), fix `Make the target at least 24x24 CSS px or keep 24px of space around it (WCAG 2.2 SC 2.5.8).`
- Desktop only:
  - Collect `console` messages of type `error` and `pageerror` messages (register the listeners before `goto`). After the viewport, add one finding per unique message: tool `browser`, rule `console-error`, severity `warning`, viewport `1280px`, detail the message cut to 300 chars, fix `Fix the error or the missing resource it names.`
  - axe: `const require = createRequire(import.meta.url)`; `await page.addScriptTag({ path: require.resolve('axe-core/axe.min.js') })`; then `page.evaluate(() => axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa','best-practice'] }, resultTypes: ['violations'] }))`. For each violation: tool `axe`, rule `v.id`, severity `error` for impact `critical` or `serious`, `warning` for `moderate`, `advisory` otherwise, viewport `1280px`, detail `<v.help> (<n> element(s): <first 3 node targets joined with ', '>)`, fix `v.helpUrl`, meta `{ impact: v.impact, wcag: v.tags.filter(t => t.startsWith('wcag')) }`.
  - Save `await page.content()` to `<outDir>/rendered.html`; return that path as `renderedHtml`.
- Every finding object has all keys: `tool, rule, severity, file, line, url, viewport, detail, fix, meta` (`file` and `line` are `null` here, `url` is the audited URL, `meta` defaults to `{}`).

### 8. `scripts/review.mjs`

CLI: `node scripts/review.mjs <target> [--browser] [--url <url>] [--out <dir>]`. `<target>` is a local directory, a local `.html` file, or an `http(s)://` URL.

- Missing target argument, or a local target that does not exist: print usage to stderr, exit 1. Every other outcome exits 0.
- `scriptsDir` = directory of this file. `bin(name)` = `path.join(scriptsDir, 'node_modules', '.bin', name)`.
- Target is a URL: no source directory; `url = target`; browser mode on.
- Local target: `sourceRoot` = the directory (or the file's directory for an `.html` file). With `--url`, `url` = that value and browser mode on. With `--browser` and no `--url`: if the target is an `.html` file, or the directory contains `index.html`, start `serveDir(sourceRoot)` and use `<origin>/<file name or index.html>`; otherwise add tool error `{ tool: 'browser', message: 'no --url given and no index.html to serve' }` and skip the browser.
- `--out` default: `path.join(os.tmpdir(), 'frontend-review', '<slug>-<YYYYMMDD-HHMMSS>')`, slug = target basename or URL hostname, non `[a-z0-9-]` chars replaced by `-`. Create it recursively.
- Run each tool inside its own try/catch. A failure becomes `{ tool, message }` in `toolErrors` (message cut to 500 chars) and the run continues. Use `spawnSync(cmd, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, env: { ...process.env, IMPECCABLE_BROWSER: <findBrowser() or unset> } })`.
  1. `impeccable` (local target only): `bin('impeccable') detect --json <target>`. Exit 0 or 2 = success, parse stdout as a JSON array (empty stdout = `[]`). Any other exit = tool error with the stderr tail. Each item `{ antipattern, name, description, severity, category, file, line, snippet }` becomes: tool `impeccable`, rule `antipattern`, severity `advisory` if item severity is `advisory`, else `warning`, file relative to `sourceRoot` when absolute, line `null` when 0 or missing, detail `snippet || name`, fix `description`, meta `{ name, category }`.
  2. `impeccable-url` (browser mode with a url): same command with the url instead of the target, same mapping, file `null`, `url` set. Its failure is recorded under tool `impeccable-url`.
  3. `modern-web` (local target only): `bin('modern-web-guidance') legacy-scan <target> --json`, parse stdout as one JSON object. For each `guides[]` (`guideId`), each `rules[]` (`ruleId`, `summary`, `verifierRubric`), each `findings[]` (`file`, `line`, `message`, `lineContent`): tool `modern-web`, rule `ruleId`, severity `advisory`, file relative to `sourceRoot` when absolute, line, detail `message || summary`, fix `Modern guide: <guideId> (retrieve with: <skill-dir>/scripts/node_modules/.bin/modern-web-guidance retrieve <guideId>)`, meta `{ guideId, summary, keepWhen, dropWhen, lineContent }` (keepWhen/dropWhen from `verifierRubric`, `[]` when absent).
  4. `browser` (browser mode with a url): `await audit({ url, outDir })` from `./browser-audit.mjs`; append its findings; keep `screenshots` and `renderedHtml`. Close the static server afterwards if one was started.
  5. `copy-lint`: files = `.html` files under `sourceRoot` (or the single `.html` target), recursive, skipping directories named `node_modules`, `.git`, `dist`, `build`, `.next`, `coverage`, `vendor` and any starting with `.`, at most 30, sorted. If that list is empty and `renderedHtml` exists, use `[renderedHtml]`. Run `process.execPath <scriptsDir>/vendor/copy-lint.mjs <file> --json` once per file. Exit 0 or 1 = success; parse stdout `{ files: [r] }`. For each `r.findings[]` (`sev`, `id`, `msg`, `fix`, `examples`, `count`): skip `INFO`; tool `copy-lint`, rule `id`, severity `warning` for `FAIL`, `advisory` for `WARN`, file relative to `sourceRoot` (or `rendered.html`), line `null`, detail `msg` plus ` e.g. ` and the first 2 examples joined by ` | ` when there are any, fix `fix || null`, meta `{ count }`.
- Severity overrides: read `path.join(scriptsDir, '..', 'references', 'severity-overrides.json')` (an object `{ "<tool>:<rule>": "error"|"warning"|"advisory" }`) and apply to every finding.
- Remove exact duplicates (same tool, rule, file, line, url, viewport, detail). Sort by severity (error, warning, advisory), then tool, then file, then line.
- Write `<out>/findings.json`: `{ target, url, browser, generatedAt, toolVersions, toolErrors, screenshots, summary: { error, warning, advisory }, findings }`. `toolVersions` holds the `version` from `scripts/node_modules/<pkg>/package.json` for `impeccable`, `modern-web-guidance`, `axe-core`, `playwright-core`, plus `"copy-lint": "taste-skill@f6b7657"`.
- Write `<out>/report.md`:
  - `# Frontend Review: <target>`, then lines `**Target**:`, `**URL**:` (or `none`), `**Browser checks**: yes|no`, `**Generated**:`.
  - `## Summary` table with columns `Severity | Count` and rows `Error`, `Warning`, `Advisory`.
  - `## Tool versions` bullet list. `## Tool errors` bullet list, only when there are any.
  - `## Errors`, `## Warnings`, `## Advisories` (skip empty ones), each a table `# | Tool | Rule | Location | Detail | Fix`. Location = `file:line`, `file`, `url @ viewport` or `url`. Replace `|` and newlines inside cells with `/` and a space.
  - `## Screenshots` bullet list of paths, when there are any.
- Print to stdout: `report: <path>`, `findings: <path>`, `<e> error, <w> warning, <a> advisory`, then one `tool error: <tool>: <message>` line per tool error.

### 9. `references/severity-overrides.json`

```json
{
  "impeccable:low-contrast": "error",
  "impeccable:broken-image": "error",
  "impeccable:text-overflow": "error",
  "impeccable:script-error": "error",
  "impeccable:overused-font": "advisory"
}
```

### 10. `scripts/check-updates.mjs` (replace the whole file)

`node scripts/check-updates.mjs [--write]`:

1. For each dependency in `scripts/package.json`, run `npm view <name> version` (spawnSync, `encoding: 'utf8'`); print one line `<name>  pinned <x>  latest <y|unknown>  <up to date|UPDATE AVAILABLE>`.
2. Run `bin('impeccable') detect --list-rules --json`, parse the array, take each `id`. Read `references/impeccable-rules.txt` (non-empty lines not starting with `#`). Print `impeccable rules: <n> installed, <m> in impeccable-rules.txt`, then `added:` and `removed:` lists (or `rule list matches`).
3. With `--write`: rewrite `references/impeccable-rules.txt` as a first line `# impeccable <installed version> rule ids, written by check-updates.mjs --write`, then one id per line in the order impeccable lists them.
4. Always exit 0; print `unknown` on network or parse failures.

Run `node scripts/check-updates.mjs --write` to create `references/impeccable-rules.txt`. Check it has at least 60 id lines.

### 11. Test fixture

`fixtures/bad-page/index.html` (exactly this):

```html
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Acme Cloud</title>
<link rel="stylesheet" href="style.css">
<style>
  body { font-family: Inter, sans-serif; margin: 0; }
  .hero-title { background: linear-gradient(90deg, #8b5cf6, #06b6d4); -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent; color: transparent; font-size: 64px; }
  .muted { color: #c8c8c8; background: #ffffff; }
  .wide { width: 1200px; }
  .tiny { width: 16px; height: 16px; padding: 0; }
</style>
</head>
<body>
  <main>
    <h1 class="hero-title">Unlock seamless, cutting-edge synergy</h1>
    <p class="muted">Leverage our revolutionary, world-class platform to supercharge your workflow and embark on a transformative journey.</p>
    <div class="wide">This row is wider than a phone screen.</div>
    <img src="photo.jpg" width="300" height="200">
    <button class="tiny" aria-label="Close">x</button>
    <h3>Features</h3>
    <div class="accordion">Details</div>
  </main>
</body>
</html>
```

`fixtures/bad-page/style.css` (exactly this):

```css
.accordion { max-height: 0; overflow: hidden; transition: max-height 0.3s ease; }
.accordion.open { max-height: 500px; }
```

### 12. `tests/run.mjs`

Uses `spawnSync(process.execPath, ['scripts/review.mjs', ...])` from the repo root and `fs.mkdtempSync(path.join(os.tmpdir(), 'fr-test-'))` for output dirs; deletes those dirs at the end. Prints `PASS <name>` or `FAIL <name>: <why>` per check, prints every `toolErrors` entry, ends with `all checks passed` and exit 0, or `<n> checks failed` and exit 1. `has(tool, rule)` = some finding with that tool and rule.

Run A: `review.mjs fixtures/bad-page --browser --out <dirA>`. Checks: exit code 0; `findings.json` and `report.md` exist; report contains `# Frontend Review`; `has('impeccable','gradient-text')`; `has('axe','image-alt')`; `has('axe','color-contrast')`; a `browser`/`horizontal-overflow` finding with viewport `390px`; `has('browser','target-size')`; `has('copy-lint','copy-slop-word')`; `has('modern-web','animate-to-intrinsic-sizes')`; `screenshots.length === 3` and every file exists; no tool error whose tool is `impeccable`, `modern-web`, `copy-lint` or `browser` (an `impeccable-url` error is printed but does not fail).

Run B: `review.mjs fixtures/bad-page --out <dirB>`. Checks: exit 0; `has('impeccable','gradient-text')`; no finding with tool `axe` or `browser`; `screenshots.length === 0`.

Run C: `review.mjs does-not-exist` exits 1.

### 13. Skill text: `skill/body.md`, `harness/claude/header.md`, `harness/hermes/header.md`

The installed `SKILL.md` = `harness/<harness>/header.md` followed by `skill/body.md`, with `{{SKILL_DIR}}` replaced by the absolute install directory and `{{VIEW_IMAGE}}` by the harness's image tool. Only these two placeholders exist.

`harness/claude/header.md`:

```
---
name: frontend-review
description: Review a frontend (local project, GitHub repo, or live URL) for AI-slop design tells, accessibility (axe-core, WCAG 2.2 AA), outdated web-platform patterns, and model-sounding copy, merged into one report. Review only, never edits code. Use for "review this site", "audit my frontend", "frontend review", "check for AI slop", "is this accessible", "design QA", "review the landing page". Modes: tools-only, quick, full.
argument-hint: "<path | github url | url> [tools-only|quick|full] [--url <dev server url>]"
allowed-tools: Bash(node {{SKILL_DIR}}/scripts/review.mjs:*), Bash(node {{SKILL_DIR}}/scripts/check-updates.mjs:*), Bash({{SKILL_DIR}}/scripts/node_modules/.bin/modern-web-guidance retrieve:*), Read, Grep, Glob
---
```

`harness/hermes/header.md` (a starting shell; the owner finishes it inside Hermes):

```
---
name: frontend-review
description: Review a frontend (local project, GitHub repo, or live URL) for AI-slop design tells, accessibility (axe-core, WCAG 2.2 AA), outdated web-platform patterns, and model-sounding copy, merged into one report. Review only, never edits code. Use for "review this site", "audit my frontend", "frontend review", "check for AI slop", "is this accessible", "design QA", "review the landing page". Modes: tools-only, quick, full.
version: 2.0.0
license: MIT
metadata:
  hermes:
    tags: [frontend, design, accessibility, review]
---

<!-- Hermes shell written by install.sh --harness hermes. Not yet tested inside Hermes: check tool names (terminal, read_file, vision_analyze) and trigger phrasing there. -->
```

`skill/body.md` must contain these sections, in this order, written as direct instructions to the agent:

1. `# Frontend Review`: one paragraph: runs pinned tools, merges findings, agent filters and adds judgement; review only, never edit files in the target.
2. `## Targets`: local path; GitHub URL (clone with `git clone --depth 1 <url> <temp dir>` and review the clone); live URL; local path plus `--url <dev server>`.
3. `## Modes`: a table with `tools-only` (run `review.mjs`, present `report.md` as is, no judgement; use when the user says "tools only"/"tools-only"), `quick` (tools without browser + triage + judgement rules; default for a local path with no URL), `full` (quick + browser checks + screenshot review; default for a URL or `--url`). Ask "quick or full?" only when a local path has an `index.html` or the user mentions a dev server and did not name a mode.
4. `## Step 1: Run the tools`: the command `node {{SKILL_DIR}}/scripts/review.mjs <target> [--browser] [--url <url>] --out <dir>` (choose a scratch directory for `--out`), then read `<out>/findings.json`. If a tool appears in `toolErrors`, say so in the review and never guess its results.
5. `## Step 2: Triage` (quick, full): open `file:line` for each finding and drop false positives, counting them with a one-line reason each; triage `modern-web` findings with `references/modern-web.md`; merge the same issue reported by several tools into one finding (example: impeccable `low-contrast` and axe `color-contrast` on the same element).
6. `## Step 3: Judgement review` (quick, full): read `{{SKILL_DIR}}/references/rules.md` and check the source for those rules (skip `node_modules`, `.git`, `dist`, `build`, `.next`, `coverage`).
7. `## Step 4: Visual review` (full): view every PNG in `<out>/screenshots/` with {{VIEW_IMAGE}} and apply `{{SKILL_DIR}}/references/critique.md`.
8. `## Step 5: Report`: write `<out>/review.md` and show the summary in chat. Format: title, target, mode, date, tool versions; summary table (Critical / Warning / Advisory, plus "dropped as false positives: n"); findings tables per severity with columns `# | Source | Rule | Location | Issue | Fix` (Source = tool name or `judgement` or `visual`); `## What works well` (2-3 points); `## AI-slop score: X/10` with the rubric from `rules.md`; `## Not checked` (anything skipped, for example contrast in quick mode, manual screen-reader testing).
9. `## Rules`: never fabricate findings; every finding has a location and a concrete fix; mark anything unverified as unverified; quick mode cannot verify contrast or layout.
10. `## Keeping tools current`: `node {{SKILL_DIR}}/scripts/check-updates.mjs` only reports; upgrading means editing `scripts/package.json` in the repo, `npm install`, `node scripts/check-updates.mjs --write`, `node tests/run.mjs`.

### 14. `references/rules.md` (replace the whole file)

Title `# Judgement rules`. First paragraph: these are the rules no tool checks; tool rules are listed in `impeccable-rules.txt`, axe-core, modern-web-guidance and copy-lint, so do not repeat them here. Each rule is a `### <id>` heading with `**Severity:**`, `**Look for:**`, `**Fix:**` lines. Include exactly these rules, grouped under `##` headings:

- Layout: `identical-card-grids` (advisory: 3+ cards with the same icon + heading + text structure, repeated), `section-monotony` (advisory: every section uses the same centred heading + grid layout), `template-hero` (advisory: centred headline, subline and two buttons over a gradient or mesh with no product shown), `decoration-instead-of-content` (warning: abstract shapes or stock 3D where real product UI or photographs would explain the product).
- Type and colour: `type-pairing` (advisory: more than two display families, or one default family with no hierarchy), `palette-intent` (advisory: palette unrelated to brand or subject, one accent used for everything).
- Design system: `mixed-icon-sets` (advisory: icons from two or more sets, mismatched stroke and style), `inconsistent-components` (warning: the same component styled differently, for example button radii or input heights).
- Copy: `vague-value-prop` (warning: the first screen does not say plainly what is sold or what it does), `invented-proof` (warning: made-up stats, logos or testimonials with placeholder names), `placeholder-content` (error: lorem ipsum, TODO, "Your Company", example.com links on a shipped page).
- States and interaction: `missing-states` (warning: no empty, loading or error state for data views; forms without error messages), `focus-removed` (error: `outline: none` or `outline: 0` without a `:focus-visible` replacement), `reduced-motion-missing` (warning: animations or transitions without a `prefers-reduced-motion` alternative).

End with `## AI-slop score` and this rubric: colour palette originality 0-3, typography distinctiveness 0-3, layout variety 0-2, copy authenticity 0-2; 10 = clearly designed by people for this product, 0 = an unedited AI template.

### 15. `references/critique.md`

Title `# Visual critique and manual accessibility checks`. Sections: `## 1. First impression` (from the 1280 screenshot: what draws the eye first and whether it should; is the purpose clear in five seconds), `## 2. Usability` (can the main task be done, are actions obvious, unnecessary steps), `## 3. Visual hierarchy` (reading order, emphasis, whitespace, type scale), `## 4. Consistency` (spacing, colour, type, similar elements behave alike), `## 5. Responsive` (compare 390, 768 and 1280: reflow, hidden content, cramped or empty areas), `## 6. Accessibility checks tools cannot do (WCAG 2.2 AA)` as a list: 2.1.1 keyboard (click handlers on non-interactive elements without role and tabindex), 2.4.7 focus visible, 2.4.11 focus not obscured by sticky headers, 2.5.7 dragging has a single-pointer alternative, 2.5.8 target size minimum 24px (44px is the AAA level 2.5.5: advisory only), 1.4.10 reflow at 320px, 3.2.6 consistent help, 3.3.1 error identification, 3.3.2 labels or instructions, 3.3.7 redundant entry, 3.3.8 accessible authentication. Then: automated checks find only part of accessibility problems; always list manual screen-reader testing under "Not checked". `## 7. What works well`: always name 2-3 specific strengths. Each feedback point says what, why, and a concrete alternative.

### 16. `references/modern-web.md`

Title `# Triage for modern-web findings`. Content: `legacy-scan` checks about 20% of the modern-web-guidance catalogue with deterministic rules. For each `modern-web` finding, read `meta.keepWhen` and `meta.dropWhen` and the code at `file:line`; drop it when a `dropWhen` case applies (a deliberate fallback, vendor or generated code, a lookalike); keep it when a `keepWhen` case applies. Kept findings go in the report under the rule id with the guide id. For a concrete fix, run `<skill-dir>/scripts/node_modules/.bin/modern-web-guidance retrieve <guideId>` (`<skill-dir>` is the folder holding SKILL.md) and summarise the guide's recommendation and fallback in the Fix column. Guides assume Baseline Widely available features are safe; if the project states a browser support policy (in README, AGENTS.md, CLAUDE.md or browserslist), follow it.

### 17. `install.sh`

Bash, `#!/usr/bin/env bash`, `set -euo pipefail`, executable (`chmod +x install.sh`). Usage: `./install.sh --harness claude|hermes|all [--scope global|project] [--link|--copy] [--skip-npm] [--uninstall]`. Defaults: scope `global`, mode `--link`. `--harness` is required; print usage and exit 1 without it or with an unknown option.

1. `REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"`.
2. Fail with a clear message unless `node` exists and its major version is 22 or higher.
3. Unless `--skip-npm` or `--uninstall`: `(cd "$REPO/scripts" && npm ci --no-audit --no-fund)`.
4. Print `browser: <path>` from `node "$REPO/scripts/lib/browser.mjs"`; when it prints `none`, warn that full mode needs Chromium, Chrome, Edge or Brave (set `FRONTEND_REVIEW_BROWSER`) and continue.
5. Target directory per harness: claude = `$PWD/.claude/skills/frontend-review` for scope `project`, else `${CLAUDE_SKILLS_DIR:-$HOME/.claude/skills}/frontend-review`; hermes = `${HERMES_HOME:-$HOME/.hermes}/skills/frontend-review` (scope ignored; print a note when `project` was given). Image tool text: claude = `the Read tool`, hermes = `the vision_analyze tool`.
6. Install, per harness: if the target exists without a `.frontend-review-install` marker file, print `refusing to overwrite <dir>: not installed by install.sh` and exit 1. If it exists with the marker, remove it. `mkdir -p` the target. `--link`: `ln -s "$REPO/scripts" "$T/scripts"` and `ln -s "$REPO/references" "$T/references"`. `--copy`: `cp -R` both. Render `cat "$REPO/harness/$h/header.md" "$REPO/skill/body.md" | sed -e "s|{{SKILL_DIR}}|$T|g" -e "s|{{VIEW_IMAGE}}|$VIEW|g" > "$T/SKILL.md"`. Fail if `grep -q '{{' "$T/SKILL.md"`. Write `$h $MODE` to `$T/.frontend-review-install`. Print `installed <harness> -> <dir>`.
7. `--uninstall`, per harness: remove the target only when the marker exists, print `removed <dir>`; otherwise print `nothing to remove at <dir>`.

### 18. `tests/install.test.sh`

Bash, `set -euo pipefail`, executable. Uses `mktemp -d` dirs, removes them at the end (trap). Exports `CLAUDE_SKILLS_DIR` and `HERMES_HOME` pointing at temp dirs. Checks, each failing the script with a message:

1. `./install.sh --harness all --skip-npm` exits 0.
2. Claude `SKILL.md` exists, contains `name: frontend-review`, `allowed-tools`, `$CLAUDE_SKILLS_DIR/frontend-review/scripts/review.mjs` and `the Read tool`, and contains no `{{`; `scripts` is a symlink.
3. Hermes `SKILL.md` exists under `$HERMES_HOME/skills/frontend-review`, contains `the vision_analyze tool` and `$HERMES_HOME/skills/frontend-review/scripts/review.mjs`, and contains no `{{`.
4. `node "$CLAUDE_SKILLS_DIR/frontend-review/scripts/review.mjs" fixtures/bad-page --out <tmp>` exits 0 and writes `<tmp>/findings.json`.
5. Running the same install again exits 0.
6. With a fresh `CLAUDE_SKILLS_DIR` holding a plain `frontend-review` folder (no marker), `./install.sh --harness claude --skip-npm` exits non-zero.
7. `./install.sh --harness claude --copy --skip-npm` (original temp dir) leaves `scripts` as a real directory, not a symlink.
8. `./install.sh --harness all --uninstall` removes both target directories.

Print `install tests passed` at the end.

### 19. `README.md` (replace the whole file)

Sections: `# frontend-review` (one paragraph: what v2 does, for Claude Code and Hermes); `## What it runs` (table: tool, pinned version, what it checks, licence: impeccable 4.9.1 Apache-2.0, axe-core 4.14.0 MPL-2.0, modern-web-guidance 1.0.0 Apache-2.0, playwright-core 1.64.1 Apache-2.0, copy-lint vendored from taste-skill f6b7657 MIT); `## Install` (`git clone https://github.com/stansz/frontend-review ~/code/frontend-review`, `cd ~/code/frontend-review`, `./install.sh --harness claude` / `--harness hermes` / `--harness all`; needs Node 22+ and, for full mode, a Chromium-based browser; `--link` keeps the install pointed at the clone so `git pull` updates it, then rerun install only when `scripts/package-lock.json` changes); `## Modes` (tools-only, quick, full, one line each); `## Usage` (examples for Claude Code `/frontend-review ./site full`, a GitHub URL, a live URL, a dev server with `--url http://localhost:5173`); `## Direct CLI` (`node scripts/review.mjs <target> [--browser] [--url <url>] [--out <dir>]` and what it writes); `## Updating the tools` (`node scripts/check-updates.mjs`, then bump versions in `scripts/package.json`, `cd scripts && npm install`, `node scripts/check-updates.mjs --write`, `node tests/run.mjs`); `## Tests` (`node tests/run.mjs`, `bash tests/install.test.sh`); `## Migrating from v1` (v1 was cloned straight into `~/.hermes/skills/frontend-review`; move or delete that clone, clone v2 elsewhere and run `./install.sh --harness hermes`; v1 is tagged `v1`); `## Attribution` (impeccable by Paul Bakaus, run as a pinned dependency, rule ids listed in `references/impeccable-rules.txt`; copy-lint by Leon Lin, vendored unmodified with its MIT licence; axe-core by Deque; modern-web-guidance by the Chrome, Edge, Firefox and MDN teams; the critique structure follows common design-critique practice); `## License` (MIT, see `LICENSE`; third-party notices in `NOTICE`). No mention of Browserbase.

### 20. `NOTICE`

Plain text listing each third-party component with its licence and URL: impeccable (Apache-2.0, https://github.com/pbakaus/impeccable), axe-core (MPL-2.0, https://github.com/dequelabs/axe-core), modern-web-guidance (Apache-2.0, https://github.com/GoogleChrome/modern-web-guidance), playwright-core (Apache-2.0, https://github.com/microsoft/playwright), taste-skill copy-lint.mjs (MIT, https://github.com/Leonxlnx/taste-skill, vendored in `scripts/vendor/` with `LICENSE-taste-skill`). State that only copy-lint.mjs is redistributed in this repo; the others are installed from npm by `install.sh`.

### 21. Final check

Run every Acceptance command and record the output in `.handoff/report.md`, including every `toolErrors` entry printed by `tests/run.mjs` and whether the `impeccable-url` scan worked.

## Acceptance

- `cd scripts && npm ci --no-audit --no-fund` exits 0.
- `node tests/run.mjs` exits 0 and its last line is `all checks passed`.
- `bash tests/install.test.sh` exits 0 and prints `install tests passed`.
- `node scripts/check-updates.mjs` exits 0 and prints a line starting with `impeccable`.
- `test $(grep -vc '^#' references/impeccable-rules.txt) -ge 60` exits 0.
- `test ! -e SKILL.md && test ! -e scripts/check-source.mjs` exits 0.
- `head -3 scripts/vendor/copy-lint.mjs | grep -q 'Vendored from https://github.com/Leonxlnx/taste-skill'` exits 0.
- `! grep -rqi browserbase README.md skill harness references scripts/review.mjs scripts/browser-audit.mjs` exits 0.
- `node scripts/review.mjs fixtures/bad-page --out /tmp/fr-accept && test -s /tmp/fr-accept/report.md` exits 0.

## Constraints

- Do not commit, push, create tags or switch branches.
- Do not touch files outside **Files to touch**, except `.handoff/report.md`. `scripts/node_modules/` is ignored and fine. Installing system packages with `dnf` and temporary files outside the repo are fine.
- Exact dependency versions as listed; no other npm dependencies; no `^` or `~` ranges.
- Do not edit `scripts/vendor/copy-lint.mjs` beyond the two comment lines in step 4.
- Do not change the assertions in `tests/run.mjs` or `tests/install.test.sh` to make them pass.
- No Browserbase, no external API keys, no network calls in `review.mjs` beyond the URL being reviewed.

## Out of scope

- Testing inside a real Hermes installation.
- Hooks, CI workflows, GitHub Actions.
- Adding harnesses other than Claude Code and Hermes.
- Any automatic fixing of the reviewed code.
- Changing `LICENSE`.

## If blocked

- If playwright-core 1.64.1 cannot drive the system Chromium, try `dnf install -y chromium` once; if it still fails, stop and report the exact error. Do not switch to another version.
- If a fixture check in `tests/run.mjs` fails because the tool does not flag that pattern, you may change only `fixtures/bad-page/*` (not the assertions) so the pattern is clearer, at most twice per check; report every fixture change and why. If it still fails, leave the check failing and report it.
- If a tool's real JSON output differs from the field names in step 8, adapt the mapping in `review.mjs` to the real output, keep the normalised finding shape, and report the difference with a sample of the real output.
- If `npm install` of a pinned version fails, stop and report; do not pick another version.
