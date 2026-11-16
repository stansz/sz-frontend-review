#!/usr/bin/env node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const MAX_BUFFER = 64 * 1024 * 1024;

let failed = 0;
const tempDirs = [];

function check(name, ok, why) {
  if (ok) {
    console.log(`PASS ${name}`);
  } else {
    failed++;
    console.log(`FAIL ${name}: ${why}`);
  }
}

function review(args) {
  return spawnSync(process.execPath, ['scripts/review.mjs', ...args], {
    cwd: repoRoot,
    encoding: 'utf8',
    maxBuffer: MAX_BUFFER,
  });
}

function loadFindings(dir) {
  try {
    return JSON.parse(fs.readFileSync(path.join(dir, 'findings.json'), 'utf8'));
  } catch {
    return null;
  }
}

function readReport(dir) {
  try {
    return fs.readFileSync(path.join(dir, 'report.md'), 'utf8');
  } catch {
    return null;
  }
}

function printToolErrors(findings) {
  if (!findings || !Array.isArray(findings.toolErrors)) return;
  for (const te of findings.toolErrors) {
    console.log(`tool error: ${te.tool}: ${te.message}`);
  }
}

const makeDir = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fr-test-'));
  tempDirs.push(dir);
  return dir;
};

try {
  // Run A: browser mode
  const dirA = makeDir();
  const a = review(['fixtures/bad-page', '--browser', '--out', dirA]);
  check('A exit code is 0', a.status === 0, `exit ${a.status}`);
  const fa = loadFindings(dirA);
  const ra = readReport(dirA);
  printToolErrors(fa);
  check('A findings.json exists', fa !== null, 'findings.json missing or unreadable');
  check('A report.md exists', ra !== null, 'report.md missing or unreadable');
  check(
    'A report has title',
    ra !== null && ra.includes('# Frontend Review'),
    'report.md does not contain "# Frontend Review"',
  );
  const hasA = (tool, rule) =>
    fa !== null && fa.findings.some((f) => f.tool === tool && f.rule === rule);
  check('A impeccable gradient-text', hasA('impeccable', 'gradient-text'), 'finding not found');
  check('A axe image-alt', hasA('axe', 'image-alt'), 'finding not found');
  check('A axe color-contrast', hasA('axe', 'color-contrast'), 'finding not found');
  check(
    'A browser horizontal-overflow at 390px',
    fa !== null &&
      fa.findings.some(
        (f) => f.tool === 'browser' && f.rule === 'horizontal-overflow' && f.viewport === '390px',
      ),
    'finding not found',
  );
  check('A browser target-size', hasA('browser', 'target-size'), 'finding not found');
  check('A copy-lint copy-slop-word', hasA('copy-lint', 'copy-slop-word'), 'finding not found');
  check(
    'A modern-web animate-to-intrinsic-sizes',
    hasA('modern-web', 'animate-to-intrinsic-sizes'),
    'finding not found',
  );
  check(
    'A three screenshots exist',
    fa !== null &&
      fa.screenshots.length === 3 &&
      fa.screenshots.every((s) => fs.existsSync(s)),
    fa === null
      ? 'findings.json missing'
      : `screenshots: ${JSON.stringify(fa.screenshots)}`,
  );
  const badTools = ['impeccable', 'modern-web', 'copy-lint', 'browser'];
  const badErrors =
    fa === null ? ['findings.json missing'] : (fa.toolErrors || []).filter((e) => badTools.includes(e.tool));
  check(
    'A no failing core tools',
    badErrors.length === 0,
    badErrors.map((e) => `${e.tool}: ${e.message}`).join('; '),
  );

  // Run B: no browser
  const dirB = makeDir();
  const b = review(['fixtures/bad-page', '--out', dirB]);
  check('B exit code is 0', b.status === 0, `exit ${b.status}`);
  const fb = loadFindings(dirB);
  printToolErrors(fb);
  const hasB = (tool, rule) =>
    fb !== null && fb.findings.some((f) => f.tool === tool && f.rule === rule);
  check('B impeccable gradient-text', hasB('impeccable', 'gradient-text'), 'finding not found');
  check(
    'B no axe or browser findings',
    fb !== null && !fb.findings.some((f) => f.tool === 'axe' || f.tool === 'browser'),
    fb === null ? 'findings.json missing' : 'axe/browser findings present',
  );
  check(
    'B no screenshots',
    fb !== null && fb.screenshots.length === 0,
    fb === null ? 'findings.json missing' : `screenshots: ${fb.screenshots.length}`,
  );

  // Run C: missing target
  const c = review(['does-not-exist']);
  check('C exit code is 1', c.status === 1, `exit ${c.status}`);

  // Run D: render the browser run (dirA) as HTML, first raw (tools-only), then from a review.json
  const render = () => spawnSync(process.execPath, ['scripts/render-review.mjs', dirA], { encoding: 'utf8' });
  const htmlPath = path.join(dirA, 'review.html');
  const d1 = render();
  check('D raw render exits 0', d1.status === 0, d1.stderr);
  const raw = fs.existsSync(htmlPath) ? fs.readFileSync(htmlPath, 'utf8') : '';
  check('D raw html embeds 3 screenshots', (raw.match(/src="data:image\/png;base64,/g) || []).length === 3, 'screenshots not embedded');
  check('D raw html lists tool findings', raw.includes('gradient-text') && raw.includes('image-alt'), 'rule ids missing');
  check('D raw html is tools-only', raw.includes('Raw tool output, not yet triaged'), 'funnel text missing');
  fs.writeFileSync(path.join(dirA, 'review.json'), JSON.stringify({
    title: 'Fixture <Page>',
    mode: 'full',
    findings: [
      { severity: 'critical', source: 'visual', rule: 'responsive-collapse', title: 'Row overflows on phones', viewport: '390px', location: 'fixtures/bad-page/index.html:9', issue: 'The `.wide` row is 1200px.', fix: 'Use `max-width: 100%`.' },
    ],
    dropped: [{ rule: 'overused-font', source: 'impeccable', count: 1, reason: 'Fixture.' }],
    score: { total: 3, parts: [{ name: 'Colour palette', score: 0, max: 3 }] },
  }));
  const d2 = render();
  check('D review render exits 0', d2.status === 0, d2.stderr);
  const html = fs.existsSync(htmlPath) ? fs.readFileSync(htmlPath, 'utf8') : '';
  check('D html escapes the title', html.includes('<h1>Fixture &lt;Page&gt;</h1>'), 'title not escaped');
  check('D html renders inline code', html.includes('<code>.wide</code>'), 'inline code missing');
  check('D html links finding to its screenshot', html.includes('data-shot="390">See 390px screenshot'), 'screenshot button missing');
  check('D html shows dropped and score', html.includes('Dropped as false positives (1)') && html.includes('AI-slop score'), 'sections missing');
  check('D markdown written', fs.existsSync(path.join(dirA, 'review.md')) && fs.readFileSync(path.join(dirA, 'review.md'), 'utf8').includes('Row overflows on phones'), 'review.md missing');
  fs.writeFileSync(path.join(dirA, 'review.json'), JSON.stringify({ findings: [{ severity: 'error' }] }));
  check('D bad severity is rejected', render().status === 1, 'accepted severity "error"');
} finally {
  for (const dir of tempDirs) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  }
}

if (failed === 0) {
  console.log('all checks passed');
  process.exit(0);
} else {
  console.log(`${failed} checks failed`);
  process.exit(1);
}
