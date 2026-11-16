#!/usr/bin/env node
// Render a finished review as one self-contained HTML page (screenshots embedded) plus Markdown.
//
//   node scripts/render-review.mjs <out dir>
//
// Reads <out>/findings.json (written by review.mjs) and, when present, <out>/review.json
// (written by the agent after triage; schema in references/review-schema.md). Without
// review.json it renders the raw tool findings (tools-only mode). Writes <out>/review.html
// and <out>/review.md.

import fs from 'node:fs';
import path from 'node:path';

const SEVERITIES = [
  { id: 'critical', label: 'Critical', plural: 'Critical', hint: 'Fix before shipping' },
  { id: 'warning', label: 'Warning', plural: 'Warnings', hint: 'Fix in the next pass' },
  { id: 'advisory', label: 'Advisory', plural: 'Advisories', hint: 'Consider' },
];
const TOOL_SEVERITY = { error: 'critical', warning: 'warning', advisory: 'advisory' };

function die(msg) {
  console.error(msg);
  process.exit(1);
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Escaped text with `code` and **bold** spans.
function rich(value) {
  return esc(value)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
}

function locationOf(f) {
  if (f.file && f.line != null) return `${f.file}:${f.line}`;
  if (f.file) return f.file;
  if (f.url && f.viewport) return `${f.url} @ ${f.viewport}`;
  return f.url || '';
}

function fromToolFindings(raw) {
  return raw.findings.map((f) => ({
    severity: TOOL_SEVERITY[f.severity] || 'advisory',
    source: f.tool,
    rule: f.rule,
    title: f.rule,
    location: locationOf(f),
    issue: f.detail,
    fix: f.fix || '',
    viewport: f.viewport || null,
  }));
}

function screenshotData(raw, outDir) {
  return (raw.screenshots || [])
    .map((p) => {
      const file = path.isAbsolute(p) ? p : path.join(outDir, p);
      if (!fs.existsSync(file)) return null;
      const m = path.basename(file).match(/^([a-z]+)-(\d+)\.png$/);
      return {
        name: m ? m[1] : path.basename(file, '.png'),
        width: m ? Number(m[2]) : 0,
        src: `data:image/png;base64,${fs.readFileSync(file).toString('base64')}`,
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.width - b.width);
}

function viewportWidth(viewport) {
  const m = String(viewport || '').match(/(\d+)/);
  return m ? Number(m[1]) : null;
}

function hostOf(url) {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

// ---------------------------------------------------------------- HTML

const CSS = `
:root {
  color-scheme: light dark;
  --bg: #f4f5f7;
  --surface: #ffffff;
  --surface-2: #eceef1;
  --ink: #16181b;
  --muted: #545a62;
  --line: #d9dde2;
  --focus: #1a5fd0;
  --critical: #b42318;
  --critical-bg: #fdecea;
  --warning: #8a5300;
  --warning-bg: #fdf1dc;
  --advisory: #2b5687;
  --advisory-bg: #e7eef8;
  --good: #1d6b3f;
  --bar: #16181b;
  --sans: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  --mono: ui-monospace, "SF Mono", SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #0e1012;
    --surface: #16191c;
    --surface-2: #1e2226;
    --ink: #e9ebee;
    --muted: #a4abb3;
    --line: #2c3238;
    --focus: #8ab4f8;
    --critical: #ff8f85;
    --critical-bg: #3a1714;
    --warning: #f2bd5c;
    --warning-bg: #352710;
    --advisory: #9cc0f5;
    --advisory-bg: #172638;
    --good: #7fd3a1;
    --bar: #e9ebee;
  }
}
* { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; }
body {
  margin: 0;
  background: var(--bg);
  color: var(--ink);
  font: 16px/1.55 var(--sans);
}
a { color: inherit; text-underline-offset: 3px; }
code, .mono { font-family: var(--mono); font-size: 0.875em; }
code { background: var(--surface-2); padding: 0.1em 0.35em; border-radius: 4px; overflow-wrap: anywhere; }
:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
.skip { position: absolute; left: -9999px; top: 8px; background: var(--surface); padding: 8px 12px; border-radius: 6px; }
.skip:focus { left: 16px; z-index: 10; }
.wrap { max-width: 1120px; margin: 0 auto; padding: 0 20px; }

/* Header */
.masthead { background: var(--surface); border-bottom: 1px solid var(--line); }
.masthead .wrap { display: grid; grid-template-columns: 1fr auto; gap: 32px; align-items: end; padding-top: 40px; padding-bottom: 32px; }
.kind { margin: 0 0 6px; color: var(--muted); font-size: 0.95rem; }
h1 { margin: 0; font-size: clamp(2rem, 4.5vw, 3.1rem); line-height: 1.08; font-weight: 700; letter-spacing: -0.02em; }
.meta { display: flex; flex-wrap: wrap; gap: 6px 18px; margin: 14px 0 0; padding: 0; list-style: none; color: var(--muted); font-size: 0.92rem; }
.meta strong { color: var(--ink); font-weight: 600; }
.score { text-align: right; min-width: 150px; }
.score-num { font-size: 4.2rem; line-height: 1; font-weight: 700; letter-spacing: -0.03em; font-variant-numeric: tabular-nums; }
.score-num span { font-size: 1.5rem; color: var(--muted); font-weight: 600; letter-spacing: 0; }
.score-label { margin: 6px 0 0; font-weight: 600; }
.score-hint { margin: 2px 0 0; color: var(--muted); font-size: 0.85rem; max-width: 190px; margin-left: auto; }

/* Tally */
.tally { display: grid; grid-template-columns: repeat(3, 1fr) 1.6fr; border: 1px solid var(--line); border-radius: 12px; background: var(--surface); margin: 28px 0 0; overflow: hidden; }
.tally > div { padding: 18px 20px; }
.tally > div + div { border-left: 1px solid var(--line); }
.tally .n { display: block; font-size: 2.2rem; font-weight: 700; line-height: 1.1; font-variant-numeric: tabular-nums; }
.tally .critical .n { color: var(--critical); }
.tally .warning .n { color: var(--warning); }
.tally .advisory .n { color: var(--advisory); }
.tally .lbl { font-weight: 600; }
.tally .hint { display: block; color: var(--muted); font-size: 0.85rem; }
.tally .funnel { color: var(--muted); font-size: 0.92rem; align-self: center; }
.tally .funnel b { color: var(--ink); font-variant-numeric: tabular-nums; }

.verdict { font-size: 1.12rem; max-width: 70ch; margin: 28px 0 0; }

section { margin: 56px 0 0; }
h2 { font-size: 1.45rem; letter-spacing: -0.01em; margin: 0 0 6px; }
.section-note { color: var(--muted); margin: 0 0 20px; max-width: 70ch; }

/* Viewports */
.shots { display: grid; grid-template-columns: 390fr 768fr 1280fr; gap: 16px; align-items: start; }
.shot { margin: 0; }
.shot button { display: block; width: 100%; padding: 0; border: 1px solid var(--line); border-radius: 10px; background: var(--surface-2); cursor: zoom-in; overflow: hidden; }
.shot img { display: block; width: 100%; height: 340px; object-fit: cover; object-position: top; }
.shot figcaption { margin-top: 8px; font-size: 0.88rem; color: var(--muted); }
.shot figcaption b { color: var(--ink); }

/* Filters */
.filters { display: flex; flex-wrap: wrap; gap: 8px 22px; align-items: center; padding: 14px 16px; background: var(--surface); border: 1px solid var(--line); border-radius: 12px; margin: 0 0 24px; }
.filters fieldset { border: 0; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.filters legend { float: left; margin-right: 6px; color: var(--muted); font-size: 0.88rem; }
.chip { font: inherit; font-size: 0.86rem; min-height: 32px; padding: 4px 12px; border-radius: 999px; border: 1px solid var(--line); background: var(--surface); color: var(--ink); cursor: pointer; }
.chip[aria-pressed="true"] { background: var(--ink); color: var(--surface); border-color: var(--ink); }
.filters .count { margin-left: auto; color: var(--muted); font-size: 0.88rem; }

/* Findings */
.group { margin: 0 0 36px; }
.group-head { display: flex; align-items: baseline; gap: 12px; border-bottom: 2px solid var(--ink); padding-bottom: 8px; margin-bottom: 4px; }
.group-head h3 { margin: 0; font-size: 1.15rem; }
.group-head .hint { color: var(--muted); font-size: 0.9rem; }
.finding { display: grid; grid-template-columns: 52px 1fr 220px; gap: 4px 20px; padding: 20px 0; border-bottom: 1px solid var(--line); }
.finding .num { font-family: var(--mono); color: var(--muted); font-size: 0.95rem; padding-top: 3px; }
.finding h4 { margin: 0 0 4px; font-size: 1.06rem; line-height: 1.35; }
.finding .loc { margin: 0 0 10px; color: var(--muted); overflow-wrap: anywhere; }
.finding p { margin: 0; }
.finding .fix { margin-top: 10px; padding: 10px 14px; background: var(--surface); border: 1px solid var(--line); border-radius: 8px; }
.finding .fix b { display: block; font-size: 0.82rem; color: var(--good); letter-spacing: 0.02em; margin-bottom: 2px; }
.side { display: flex; flex-direction: column; gap: 6px; align-items: flex-start; font-size: 0.86rem; }
.sev { display: inline-block; padding: 2px 10px; border-radius: 999px; font-weight: 600; font-size: 0.8rem; }
.sev.critical { color: var(--critical); background: var(--critical-bg); }
.sev.warning { color: var(--warning); background: var(--warning-bg); }
.sev.advisory { color: var(--advisory); background: var(--advisory-bg); }
.side dl { margin: 0; display: grid; grid-template-columns: auto 1fr; gap: 2px 10px; }
.side dt { color: var(--muted); }
.side dd { margin: 0; overflow-wrap: anywhere; }
.see { font: inherit; font-size: 0.86rem; min-height: 28px; padding: 2px 10px; border: 1px solid var(--line); border-radius: 6px; background: var(--surface); color: var(--ink); cursor: zoom-in; }
.empty { color: var(--muted); padding: 20px 0; }
.m-only { display: none; }

/* Lists */
.two { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; }
.plain { margin: 0; padding-left: 1.2em; }
.plain li + li { margin-top: 8px; }
details.dropped { background: var(--surface); border: 1px solid var(--line); border-radius: 12px; padding: 14px 18px; }
details.dropped summary { cursor: pointer; font-weight: 600; }
details.dropped ul { margin: 12px 0 0; }

/* Score breakdown */
.parts { display: grid; gap: 14px; max-width: 640px; }
.part-head { display: flex; justify-content: space-between; gap: 12px; }
.part-head b { font-variant-numeric: tabular-nums; }
.meter { height: 8px; background: var(--surface-2); border-radius: 999px; margin-top: 6px; overflow: hidden; }
.meter i { display: block; height: 100%; background: var(--bar); border-radius: 999px; }
.part p { margin: 6px 0 0; color: var(--muted); font-size: 0.92rem; }

footer { margin: 72px 0 0; padding: 28px 0 48px; border-top: 1px solid var(--line); color: var(--muted); font-size: 0.88rem; }
footer ul { list-style: none; margin: 6px 0 0; padding: 0; display: flex; flex-wrap: wrap; gap: 4px 18px; }

dialog { border: 0; border-radius: 12px; padding: 0; max-width: min(1300px, 94vw); max-height: 92vh; background: var(--surface); color: var(--ink); }
dialog::backdrop { background: rgba(0, 0, 0, 0.72); }
dialog .bar { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 10px 14px; border-bottom: 1px solid var(--line); position: sticky; top: 0; background: var(--surface); }
dialog .close { font: inherit; min-height: 32px; padding: 4px 12px; border: 1px solid var(--line); border-radius: 6px; background: var(--surface); color: var(--ink); cursor: pointer; }
dialog img { display: block; max-width: 100%; height: auto; margin: 0 auto; }

[hidden] { display: none !important; }

@media (max-width: 860px) {
  .masthead .wrap { grid-template-columns: 1fr; }
  .score { text-align: left; }
  .score-hint { margin-left: 0; }
  .tally { grid-template-columns: repeat(3, 1fr); }
  .tally .funnel { grid-column: 1 / -1; border-left: 0 !important; border-top: 1px solid var(--line); }
  .shots { grid-template-columns: 1fr 1fr; }
  .shot:last-child { grid-column: 1 / -1; }
  .finding { grid-template-columns: 1fr; gap: 8px; }
  .finding .num { display: flex; align-items: center; gap: 10px; padding: 0; }
  .m-only { display: inline-block; font-family: var(--sans); }
  .d-only { display: none; }
  .side { flex-direction: row; flex-wrap: wrap; align-items: center; gap: 8px 14px; }
  .two { grid-template-columns: 1fr; gap: 32px; }
}
@media (max-width: 520px) {
  .tally .n { font-size: 1.8rem; }
  .tally > div { padding: 14px; }
  .shots { grid-template-columns: 1fr; }
  .shot img { height: 260px; }
}
@media print {
  .filters, .see, .skip { display: none !important; }
  body { background: #fff; }
  .finding { break-inside: avoid; }
}
`;

const JS = `
(() => {
  const chips = [...document.querySelectorAll('.chip')];
  const findings = [...document.querySelectorAll('.finding')];
  const groups = [...document.querySelectorAll('.group')];
  const count = document.getElementById('shown');
  const active = (kind) => chips.filter((c) => c.dataset.kind === kind && c.getAttribute('aria-pressed') === 'true').map((c) => c.dataset.value);
  function apply() {
    const sev = active('severity');
    const src = active('source');
    let n = 0;
    for (const f of findings) {
      const show = sev.includes(f.dataset.severity) && src.includes(f.dataset.source);
      f.hidden = !show;
      if (show) n++;
    }
    for (const g of groups) g.hidden = !g.querySelector('.finding:not([hidden])');
    if (count) count.textContent = n + ' of ' + findings.length + ' shown';
  }
  for (const c of chips) c.addEventListener('click', () => { c.setAttribute('aria-pressed', c.getAttribute('aria-pressed') === 'true' ? 'false' : 'true'); apply(); });
  apply();

  const dialog = document.getElementById('shot-dialog');
  const img = dialog.querySelector('img');
  const title = dialog.querySelector('.bar span');
  let opener = null;
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-shot]');
    if (!b) return;
    const src = document.getElementById('shot-' + b.dataset.shot);
    if (!src) return;
    opener = b;
    img.src = src.src;
    img.alt = src.alt;
    title.textContent = src.alt;
    dialog.showModal();
  });
  dialog.querySelector('.close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); });
  dialog.addEventListener('close', () => { if (opener) opener.focus(); });
})();
`;

function renderHtml({ review, raw, shots, toolFindingCount }) {
  const findings = review.findings;
  const counts = Object.fromEntries(SEVERITIES.map((s) => [s.id, findings.filter((f) => f.severity === s.id).length]));
  const sources = [...new Set(findings.map((f) => f.source))].sort();
  const shotByWidth = new Map(shots.map((s) => [s.width, s]));
  const droppedTotal = (review.dropped || []).reduce((a, d) => a + (d.count || 1), 0);
  const host = review.url ? hostOf(review.url) : null;

  const metaItems = [
    review.url ? `<li><strong>Site</strong> <a href="${esc(review.url)}">${esc(host)}</a></li>` : '',
    review.target ? `<li><strong>Source</strong> <span class="mono">${esc(review.target)}</span>${review.commit ? ` @ <span class="mono">${esc(review.commit)}</span>` : ''}</li>` : '',
    `<li><strong>Mode</strong> ${esc(review.mode || 'tools-only')}</li>`,
    `<li><strong>Date</strong> ${esc(review.date || String(raw.generatedAt || '').slice(0, 10))}</li>`,
  ].join('');

  const score = review.score
    ? `<div class="score" aria-label="AI-slop score ${esc(review.score.total)} out of 10">
        <div class="score-num">${esc(review.score.total)}<span>/10</span></div>
        <p class="score-label">AI-slop score</p>
        <p class="score-hint">10 means clearly made by people for this product.</p>
      </div>`
    : '';

  const funnel = review.toolFindings != null || droppedTotal || review.merged
    ? `<div class="funnel">Tools reported <b>${esc(review.toolFindings ?? toolFindingCount)}</b> findings.
        ${droppedTotal ? `<b>${droppedTotal}</b> dropped as false positives.` : ''}
        ${review.merged ? esc(review.merged) + '.' : ''}
        ${review.added ? `<b>${esc(review.added)}</b> added from judgement and visual review.` : ''}</div>`
    : `<div class="funnel">Raw tool output, not yet triaged.</div>`;

  const tally = `<div class="tally" role="list">
    ${SEVERITIES.map((s) => `<div class="${s.id}" role="listitem"><span class="n">${counts[s.id]}</span><span class="lbl">${s.plural}</span><span class="hint">${s.hint}</span></div>`).join('')}
    ${funnel}
  </div>`;

  const shotsHtml = shots.length
    ? `<section aria-labelledby="h-shots">
        <h2 id="h-shots">Viewports</h2>
        <p class="section-note">What the page looked like at each width during the review. Select one to see it full size.</p>
        <div class="shots">
          ${shots.map((s) => `<figure class="shot">
            <button type="button" data-shot="${s.width}" aria-label="Open the ${s.width}px screenshot full size"><img id="shot-${s.width}" src="${s.src}" alt="${esc(s.name)} screenshot at ${s.width}px wide" loading="lazy"></button>
            <figcaption><b>${s.width}px</b> ${esc(s.name)}</figcaption>
          </figure>`).join('')}
        </div>
      </section>`
    : '';

  let n = 0;
  const groupsHtml = SEVERITIES.map((s) => {
    const rows = findings.filter((f) => f.severity === s.id);
    if (!rows.length) return '';
    return `<div class="group" data-severity="${s.id}">
      <div class="group-head"><h3>${s.plural} <span class="mono">(${rows.length})</span></h3><span class="hint">${s.hint}</span></div>
      ${rows.map((f) => {
        n++;
        const w = viewportWidth(f.viewport);
        const shot = w && shotByWidth.get(w);
        const facts = [
          ['Source', esc(f.source)],
          f.rule && f.rule !== f.title ? ['Rule', `<span class="mono">${esc(f.rule)}</span>`] : null,
          f.standard ? ['Standard', esc(f.standard)] : null,
          f.viewport ? ['Width', esc(f.viewport)] : null,
          f.merged ? ['Merged', `${esc(f.merged)} reports`] : null,
        ].filter(Boolean);
        return `<article class="finding" data-severity="${s.id}" data-source="${esc(f.source)}" aria-labelledby="f${n}">
          <div class="num">${String(n).padStart(2, '0')}<span class="sev ${s.id} m-only">${s.label}</span></div>
          <div>
            <h4 id="f${n}">${rich(f.title || f.rule)}</h4>
            ${f.location ? `<p class="loc mono">${rich(f.location)}</p>` : ''}
            <p>${rich(f.issue)}</p>
            ${f.fix ? `<div class="fix"><b>Fix</b>${rich(f.fix)}</div>` : ''}
          </div>
          <div class="side">
            <span class="sev ${s.id} d-only">${s.label}</span>
            <dl>${facts.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>
            ${shot ? `<button type="button" class="see" data-shot="${w}">See ${w}px screenshot</button>` : ''}
          </div>
        </article>`;
      }).join('')}
    </div>`;
  }).join('');

  const filters = `<div class="filters" role="group" aria-label="Filter findings">
    <fieldset><legend>Severity</legend>${SEVERITIES.filter((s) => counts[s.id]).map((s) => `<button type="button" class="chip" data-kind="severity" data-value="${s.id}" aria-pressed="true">${s.plural}</button>`).join('')}</fieldset>
    <fieldset><legend>Source</legend>${sources.map((src) => `<button type="button" class="chip" data-kind="source" data-value="${esc(src)}" aria-pressed="true">${esc(src)}</button>`).join('')}</fieldset>
    <span class="count" id="shown" aria-live="polite"></span>
  </div>`;

  const dropped = (review.dropped || []).length
    ? `<details class="dropped"><summary>Dropped as false positives (${droppedTotal})</summary>
        <ul class="plain">${review.dropped.map((d) => `<li><span class="mono">${esc(d.rule)}</span>${d.count > 1 ? ` &times;${d.count}` : ''} (${esc(d.source)}): ${rich(d.reason)}</li>`).join('')}</ul>
      </details>`
    : '';

  const works = (review.worksWell || []).length
    ? `<div><h2 id="h-good">What works well</h2><ul class="plain">${review.worksWell.map((w) => `<li>${rich(w)}</li>`).join('')}</ul></div>`
    : '';
  const notChecked = (review.notChecked || []).length
    ? `<div><h2 id="h-not">Not checked</h2><ul class="plain">${review.notChecked.map((w) => `<li>${rich(w)}</li>`).join('')}</ul></div>`
    : '';

  const parts = review.score && (review.score.parts || []).length
    ? `<section aria-labelledby="h-score">
        <h2 id="h-score">How the score breaks down</h2>
        <p class="section-note">The AI-slop score rates how far the design is from a default AI template.</p>
        <div class="parts">${review.score.parts.map((p) => `<div class="part">
          <div class="part-head"><span>${esc(p.name)}</span><b>${esc(p.score)} / ${esc(p.max)}</b></div>
          <div class="meter" role="img" aria-label="${esc(p.score)} of ${esc(p.max)}"><i style="width:${Math.round((Number(p.score) / Number(p.max)) * 100)}%"></i></div>
          ${p.note ? `<p>${rich(p.note)}</p>` : ''}
        </div>`).join('')}</div>
      </section>`
    : '';

  const versions = Object.entries(raw.toolVersions || {}).map(([k, v]) => `<li>${esc(k)} ${esc(v)}</li>`).join('');
  const toolErrors = (raw.toolErrors || []).length
    ? `<p>Tool errors: ${raw.toolErrors.map((t) => `${esc(t.tool)} (${esc(t.message)})`).join('; ')}</p>`
    : '<p>All tools ran without errors.</p>';

  const title = review.title || host || review.target || 'Frontend review';

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}: frontend review</title>
<meta name="description" content="Frontend review of ${esc(title)}: ${counts.critical} critical, ${counts.warning} warnings, ${counts.advisory} advisories.">
<style>${CSS}</style>
</head>
<body>
<a class="skip" href="#findings">Skip to findings</a>
<header class="masthead">
  <div class="wrap">
    <div>
      <p class="kind">Frontend review</p>
      <h1>${esc(title)}</h1>
      <ul class="meta">${metaItems}</ul>
    </div>
    ${score}
  </div>
</header>
<main class="wrap">
  ${tally}
  ${review.summary ? `<p class="verdict">${rich(review.summary)}</p>` : ''}
  ${shotsHtml}
  <section id="findings" aria-labelledby="h-findings">
    <h2 id="h-findings">Findings</h2>
    <p class="section-note">Each finding has where it is and how to fix it. Filter by severity or by the tool that found it.</p>
    ${findings.length ? filters + groupsHtml : '<p class="empty">No findings.</p>'}
    ${dropped}
  </section>
  ${works || notChecked ? `<section class="two">${works}${notChecked}</section>` : ''}
  ${parts}
</main>
<footer>
  <div class="wrap">
    <p>Generated by <a href="https://github.com/stansz/sz-frontend-review">sz-frontend-review</a>.</p>
    ${toolErrors}
    <ul>${versions}</ul>
  </div>
</footer>
<dialog id="shot-dialog" aria-label="Screenshot">
  <div class="bar"><span></span><button type="button" class="close">Close</button></div>
  <img alt="">
</dialog>
<script>${JS}</script>
</body>
</html>
`;
}

// ---------------------------------------------------------------- Markdown

function cell(v) {
  return String(v ?? '').replace(/\|/g, '/').replace(/\r?\n/g, ' ');
}

function renderMd({ review, raw, toolFindingCount }) {
  const out = [];
  const title = review.title || review.url || review.target || 'Frontend review';
  out.push(`# Frontend Review: ${title}`, '');
  if (review.url) out.push(`**Site**: ${review.url}  `);
  if (review.target) out.push(`**Source**: \`${review.target}\`${review.commit ? ` @ ${review.commit}` : ''}  `);
  out.push(`**Mode**: ${review.mode || 'tools-only'}  `);
  out.push(`**Date**: ${review.date || String(raw.generatedAt || '').slice(0, 10)}`, '');
  out.push('## Summary', '', '| Severity | Count |', '|---|---|');
  for (const s of SEVERITIES) out.push(`| ${s.label} | ${review.findings.filter((f) => f.severity === s.id).length} |`);
  const droppedTotal = (review.dropped || []).reduce((a, d) => a + (d.count || 1), 0);
  out.push('', `Tools reported ${review.toolFindings ?? toolFindingCount} findings. Dropped as false positives: ${droppedTotal}.`);
  if (review.summary) out.push('', review.summary);
  let n = 0;
  for (const s of SEVERITIES) {
    const rows = review.findings.filter((f) => f.severity === s.id);
    if (!rows.length) continue;
    out.push('', `## ${s.plural}`, '', '| # | Source | Rule | Location | Issue | Fix |', '|---|---|---|---|---|---|');
    for (const f of rows) {
      const issue = f.title && f.title !== f.rule ? `**${f.title}**: ${f.issue}` : f.issue;
      out.push(`| ${++n} | ${cell(f.source)} | ${cell(f.rule)} | ${cell(f.location)} | ${cell(issue)} | ${cell(f.fix)} |`);
    }
  }
  if ((review.dropped || []).length) {
    out.push('', '### Dropped (false positives)', '');
    for (const d of review.dropped) out.push(`- \`${d.rule}\`${d.count > 1 ? ` x${d.count}` : ''} (${d.source}): ${d.reason}`);
  }
  if ((review.worksWell || []).length) {
    out.push('', '## What works well', '');
    for (const w of review.worksWell) out.push(`- ${w}`);
  }
  if (review.score) {
    out.push('', `## AI-slop score: ${review.score.total}/10`, '');
    for (const p of review.score.parts || []) out.push(`- ${p.name} ${p.score}/${p.max}${p.note ? `: ${p.note}` : ''}`);
  }
  if ((review.notChecked || []).length) {
    out.push('', '## Not checked', '');
    for (const w of review.notChecked) out.push(`- ${w}`);
  }
  out.push('', `Tools: ${Object.entries(raw.toolVersions || {}).map(([k, v]) => `${k} ${v}`).join(', ')}`);
  return out.join('\n') + '\n';
}

// ---------------------------------------------------------------- main

const outDir = process.argv[2];
if (!outDir) die('Usage: node scripts/render-review.mjs <out dir>');
const findingsPath = path.join(outDir, 'findings.json');
if (!fs.existsSync(findingsPath)) die(`No findings.json in ${outDir}; run review.mjs first.`);
const raw = readJson(findingsPath);
const reviewPath = path.join(outDir, 'review.json');
const review = fs.existsSync(reviewPath)
  ? readJson(reviewPath)
  : { target: raw.target, url: raw.url, mode: 'tools-only', findings: fromToolFindings(raw) };
if (!Array.isArray(review.findings)) die('review.json needs a findings array');
for (const f of review.findings) {
  if (!SEVERITIES.some((s) => s.id === f.severity)) die(`Unknown severity "${f.severity}" in review.json (use critical, warning or advisory)`);
}
const shots = screenshotData(raw, outDir);
const ctx = { review, raw, shots, toolFindingCount: (raw.findings || []).length };
fs.writeFileSync(path.join(outDir, 'review.html'), renderHtml(ctx));
fs.writeFileSync(path.join(outDir, 'review.md'), renderMd(ctx));
console.log(`html: ${path.join(outDir, 'review.html')}`);
console.log(`markdown: ${path.join(outDir, 'review.md')}`);
