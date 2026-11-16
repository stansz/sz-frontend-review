# sz-frontend-review

The skill installs as `frontend-review` (invoked as `/frontend-review` in Claude Code). v2 is a harness-agnostic frontend review skill for Claude Code and Hermes: one script installs it, and it runs four pinned, lockfile-installed tools (impeccable, axe-core in headless Chromium, modern-web-guidance and copy-lint) plus our own browser checks, merging everything into one findings JSON and one Markdown report that the agent then triages and reviews with judgement.

## What it runs

| Tool | Pinned version | What it checks | Licence |
| --- | --- | --- | --- |
| impeccable | 4.9.1 | AI-slop and design-quality rules, on source and on a live URL | Apache-2.0 |
| axe-core | 4.14.0 | WCAG 2.2 AA accessibility, run in headless Chromium | MPL-2.0 |
| modern-web-guidance | 1.0.0 | Outdated web-platform patterns | Apache-2.0 |
| playwright-core | 1.64.1 | Drives the system Chromium for the browser checks and screenshots | Apache-2.0 |
| copy-lint | vendored from taste-skill f6b7657 | Model-sounding marketing copy | MIT |

Our own browser checks add screenshots at 390/768/1280, horizontal overflow, WCAG 2.2 target size and console errors.

## Install

```sh
git clone https://github.com/stansz/sz-frontend-review ~/code/sz-frontend-review
cd ~/code/sz-frontend-review
./install.sh --harness claude    # or --harness hermes or --harness all
```

Needs Node 22+ and, for full mode, a Chromium-based browser. `--link` (the default) keeps the install pointed at the clone so `git pull` updates it; rerun install only when `scripts/package-lock.json` changes.

## Modes

- `tools-only` — run the tools and present the generated report as is, no judgement.
- `quick` — tools without the browser checks, then triage and judgement rules; default for a local path with no URL.
- `full` — quick plus browser checks and screenshot review; default for a URL or `--url`.

## Usage

Claude Code:

```
/frontend-review ./site full
/frontend-review https://github.com/someone/some-repo
/frontend-review https://example.com
/frontend-review ./site --url http://localhost:5173
```

## Direct CLI

`node scripts/review.mjs <target> [--browser] [--url <url>] [--out <dir>]`

`<target>` is a local directory, a local `.html` file or an `http(s)://` URL. It writes `<out>/findings.json` (merged findings, tool versions, tool errors, summary) and `<out>/report.md` (the Markdown report), plus screenshots and the rendered HTML when the browser checks run.

`node scripts/render-review.mjs <out>`

Turns the review into `<out>/review.html`, one self-contained page (screenshots embedded, light and dark themes, filters by severity and source), plus `<out>/review.md`. It uses the agent's triage in `<out>/review.json` (schema: `references/review-schema.md`); without that file it renders the raw tool findings. The page has no external requests, so it can be opened offline, attached, or published as is.

## Updating the tools

```sh
node scripts/check-updates.mjs            # report newer versions and rule drift
# then bump versions in scripts/package.json
cd scripts && npm install
node scripts/check-updates.mjs --write    # refresh references/impeccable-rules.txt
node tests/run.mjs
```

## Tests

```sh
node tests/run.mjs
bash tests/install.test.sh
```

## Migrating from v1

v1 was cloned straight into `~/.hermes/skills/frontend-review`; move or delete that clone, clone v2 elsewhere and run `./install.sh --harness hermes`. v1 is tagged `v1`.

## Attribution

- impeccable by Paul Bakaus, run as a pinned dependency; its rule ids are listed in `references/impeccable-rules.txt`.
- copy-lint by Leon Lin, vendored unmodified with its MIT licence in `scripts/vendor/`.
- axe-core by Deque.
- modern-web-guidance by the Chrome, Edge, Firefox and MDN teams.
- The critique structure follows common design-critique practice.

## License

MIT, see `LICENSE`; third-party notices in `NOTICE`.
