#!/usr/bin/env node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { findBrowser } from './lib/browser.mjs';
import { serveDir } from './lib/serve.mjs';
import { audit } from './browser-audit.mjs';

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const skillDir = path.dirname(scriptsDir);
const bin = (name) => path.join(scriptsDir, 'node_modules', '.bin', name);
const USAGE = 'Usage: node scripts/review.mjs <target> [--browser] [--url <url>] [--out <dir>]';

const SEVERITY_RANK = { error: 0, warning: 1, advisory: 2 };

function cut(text, max = 500) {
  const s = String(text ?? '');
  return s.length > max ? s.slice(0, max) : s;
}

function stderrTail(r) {
  const err = (r.stderr || '').trim();
  if (err) return cut(err.slice(-500));
  return `exit code ${r.status}`;
}

function toolEnv() {
  const env = { ...process.env };
  const browserPath = findBrowser();
  if (browserPath) env.IMPECCABLE_BROWSER = browserPath;
  else delete env.IMPECCABLE_BROWSER;
  return env;
}

function run(cmd, args) {
  return spawnSync(cmd, args, {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    env: toolEnv(),
  });
}

// Async variant, required while our own static server is serving the page:
// spawnSync would block the event loop and the server could never answer.
function runAsync(cmd, args) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { env: toolEnv() });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8').on('data', (d) => (stdout += d));
    child.stderr.setEncoding('utf8').on('data', (d) => (stderr += d));
    child.on('error', (error) => resolve({ error, status: null, stdout, stderr }));
    child.on('close', (status) => resolve({ error: null, status, stdout, stderr }));
  });
}

function relFile(file, sourceRoot) {
  if (file == null) return null;
  if (path.isAbsolute(file) && sourceRoot) return path.relative(sourceRoot, file);
  return file;
}

function mapImpeccableItem(item, { sourceRoot, url }) {
  return {
    tool: url ? 'impeccable-url' : 'impeccable',
    rule: item.antipattern,
    severity: item.severity === 'advisory' ? 'advisory' : 'warning',
    file: url ? null : relFile(item.file, sourceRoot),
    line: item.line ? item.line : null,
    url: url ?? null,
    viewport: null,
    detail: item.snippet || item.name,
    fix: item.description,
    meta: { name: item.name, category: item.category },
  };
}

function collectHtmlFiles(sourceRoot) {
  const SKIP = new Set(['node_modules', '.git', 'dist', 'build', '.next', 'coverage', 'vendor']);
  const out = [];
  const walk = (dir) => {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name.startsWith('.') || SKIP.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile() && entry.name.toLowerCase().endsWith('.html')) out.push(full);
    }
  };
  walk(sourceRoot);
  out.sort();
  return out.slice(0, 30);
}

function locationOf(f) {
  if (f.file && f.line != null) return `${f.file}:${f.line}`;
  if (f.file) return f.file;
  if (f.url && f.viewport) return `${f.url} @ ${f.viewport}`;
  if (f.url) return f.url;
  return '';
}

function cell(value) {
  return String(value ?? '')
    .replace(/\|/g, '/')
    .replace(/\r?\n/g, ' ');
}

async function main() {
  const args = process.argv.slice(2);
  let target = null;
  let browserFlag = false;
  let urlArg = null;
  let outArg = null;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--browser') {
      browserFlag = true;
    } else if (a === '--url') {
      const v = args[i + 1];
      if (v && !v.startsWith('--')) {
        urlArg = v;
        i++;
      }
    } else if (a === '--out') {
      const v = args[i + 1];
      if (v && !v.startsWith('--')) {
        outArg = v;
        i++;
      }
    } else if (!target) {
      target = a;
    }
  }

  if (!target) {
    console.error(USAGE);
    process.exit(1);
  }

  const isUrl = /^https?:\/\//i.test(target);
  if (!isUrl && !fs.existsSync(target)) {
    console.error(USAGE);
    process.exit(1);
  }

  let sourceRoot = null;
  let targetIsHtmlFile = false;
  if (!isUrl) {
    const stat = fs.statSync(target);
    if (stat.isDirectory()) sourceRoot = path.resolve(target);
    else {
      sourceRoot = path.dirname(path.resolve(target));
      targetIsHtmlFile = target.toLowerCase().endsWith('.html');
    }
  }

  const findings = [];
  const toolErrors = [];
  let screenshots = [];
  let renderedHtml = null;
  let server = null;
  let url = null;
  let browser = false;

  if (isUrl) {
    url = target;
    browser = true;
  } else if (urlArg) {
    url = urlArg;
    browser = true;
  } else if (browserFlag) {
    const hasIndex =
      targetIsHtmlFile || fs.existsSync(path.join(sourceRoot, 'index.html'));
    if (hasIndex) {
      try {
        server = await serveDir(sourceRoot);
        const name = targetIsHtmlFile ? path.basename(target) : 'index.html';
        url = `${server.origin}/${name}`;
        browser = true;
      } catch (e) {
        toolErrors.push({ tool: 'browser', message: cut(e && e.message ? e.message : e) });
      }
    } else {
      toolErrors.push({ tool: 'browser', message: 'no --url given and no index.html to serve' });
    }
  }

  const slugSource = isUrl ? new URL(target).hostname : path.basename(target);
  const slug = slugSource.replace(/[^a-z0-9-]/g, '-');
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const stamp =
    `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}` +
    `-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  const outDir = outArg || path.join(os.tmpdir(), 'frontend-review', `${slug}-${stamp}`);
  fs.mkdirSync(outDir, { recursive: true });

  try {
    // 1. impeccable (local target only)
    if (!isUrl) {
      try {
        const r = run(bin('impeccable'), ['detect', '--json', target]);
        if (r.error) throw r.error;
        if (r.status !== 0 && r.status !== 2) throw new Error(stderrTail(r));
        const items = r.stdout && r.stdout.trim() ? JSON.parse(r.stdout) : [];
        for (const item of items) {
          findings.push(mapImpeccableItem(item, { sourceRoot, url: null }));
        }
      } catch (e) {
        toolErrors.push({ tool: 'impeccable', message: cut(e && e.message ? e.message : e) });
      }
    }

    // 2. impeccable-url (browser mode with a url)
    if (browser && url) {
      try {
        const r = await runAsync(bin('impeccable'), ['detect', '--json', url]);
        if (r.error) throw r.error;
        if (r.status !== 0 && r.status !== 2) throw new Error(stderrTail(r));
        const items = r.stdout && r.stdout.trim() ? JSON.parse(r.stdout) : [];
        for (const item of items) {
          findings.push(mapImpeccableItem(item, { sourceRoot: null, url }));
        }
      } catch (e) {
        toolErrors.push({ tool: 'impeccable-url', message: cut(e && e.message ? e.message : e) });
      }
    }

    // 3. modern-web (local target only)
    if (!isUrl) {
      try {
        const r = run(bin('modern-web-guidance'), ['legacy-scan', target, '--json']);
        if (r.error) throw r.error;
        if (r.status !== 0) throw new Error(stderrTail(r));
        const obj = r.stdout && r.stdout.trim() ? JSON.parse(r.stdout) : {};
        for (const guide of obj.guides || []) {
          for (const rule of guide.rules || []) {
            for (const f of rule.findings || []) {
              findings.push({
                tool: 'modern-web',
                rule: rule.ruleId,
                severity: 'advisory',
                file: relFile(f.file, sourceRoot),
                line: f.line ?? null,
                url: null,
                viewport: null,
                detail: f.message || rule.summary,
                fix:
                  `Modern guide: ${guide.guideId} (retrieve with: ${skillDir}` +
                  `/scripts/node_modules/.bin/modern-web-guidance retrieve ${guide.guideId})`,
                meta: {
                  guideId: guide.guideId,
                  summary: rule.summary,
                  keepWhen: (rule.verifierRubric && rule.verifierRubric.keepWhen) || [],
                  dropWhen: (rule.verifierRubric && rule.verifierRubric.dropWhen) || [],
                  lineContent: f.lineContent,
                },
              });
            }
          }
        }
      } catch (e) {
        toolErrors.push({ tool: 'modern-web', message: cut(e && e.message ? e.message : e) });
      }
    }

    // 4. browser audit
    if (browser && url) {
      try {
        const result = await audit({ url, outDir });
        findings.push(...result.findings);
        screenshots = result.screenshots || [];
        renderedHtml = result.renderedHtml;
      } catch (e) {
        toolErrors.push({ tool: 'browser', message: cut(e && e.message ? e.message : e) });
      }
    }

    // 5. copy-lint
    try {
      let files = [];
      if (sourceRoot) {
        if (targetIsHtmlFile) files = [path.resolve(target)];
        else files = collectHtmlFiles(sourceRoot);
      }
      if (files.length === 0 && renderedHtml) files = [renderedHtml];
      const copyLintScript = path.join(scriptsDir, 'vendor', 'copy-lint.mjs');
      for (const file of files) {
        const r = run(process.execPath, [copyLintScript, file, '--json']);
        if (r.error) throw r.error;
        if (r.status !== 0 && r.status !== 1) throw new Error(stderrTail(r));
        const obj = r.stdout && r.stdout.trim() ? JSON.parse(r.stdout) : {};
        for (const fr of obj.files || []) {
          for (const fi of fr.findings || []) {
            if (fi.sev === 'INFO') continue;
            const examples = Array.isArray(fi.examples) ? fi.examples : [];
            let fileField;
            if (renderedHtml && path.resolve(file) === path.resolve(renderedHtml)) {
              fileField = 'rendered.html';
            } else {
              fileField = relFile(file, sourceRoot);
            }
            findings.push({
              tool: 'copy-lint',
              rule: fi.id,
              severity: fi.sev === 'FAIL' ? 'warning' : 'advisory',
              file: fileField,
              line: null,
              url: null,
              viewport: null,
              detail:
                fi.msg + (examples.length > 0 ? ` e.g. ${examples.slice(0, 2).join(' | ')}` : ''),
              fix: fi.fix || null,
              meta: { count: fi.count },
            });
          }
        }
      }
    } catch (e) {
      toolErrors.push({ tool: 'copy-lint', message: cut(e && e.message ? e.message : e) });
    }

    // Severity overrides
    let overrides = {};
    try {
      overrides = JSON.parse(
        fs.readFileSync(path.join(scriptsDir, '..', 'references', 'severity-overrides.json'), 'utf8'),
      );
    } catch {
      overrides = {};
    }
    for (const f of findings) {
      // impeccable-url findings share the impeccable rule ids, so fall back to the base tool.
      const baseTool = f.tool === 'impeccable-url' ? 'impeccable' : f.tool;
      const override = overrides[`${f.tool}:${f.rule}`] || overrides[`${baseTool}:${f.rule}`];
      if (override) f.severity = override;
    }

    // Deduplicate
    const seen = new Set();
    const unique = [];
    for (const f of findings) {
      const key = [f.tool, f.rule, f.file, f.line, f.url, f.viewport, f.detail].join('\u0000');
      if (seen.has(key)) continue;
      seen.add(key);
      unique.push(f);
    }
    unique.sort((a, b) => {
      const ra = SEVERITY_RANK[a.severity] ?? 3;
      const rb = SEVERITY_RANK[b.severity] ?? 3;
      if (ra !== rb) return ra - rb;
      if (a.tool !== b.tool) return a.tool < b.tool ? -1 : 1;
      const fa = String(a.file ?? '');
      const fb = String(b.file ?? '');
      if (fa !== fb) return fa < fb ? -1 : 1;
      const la = a.line == null ? -1 : Number(a.line);
      const lb = b.line == null ? -1 : Number(b.line);
      return la - lb;
    });

    const summary = { error: 0, warning: 0, advisory: 0 };
    for (const f of unique) summary[f.severity] = (summary[f.severity] || 0) + 1;

    const toolVersions = {};
    for (const pkg of ['impeccable', 'modern-web-guidance', 'axe-core', 'playwright-core']) {
      try {
        toolVersions[pkg] = JSON.parse(
          fs.readFileSync(path.join(scriptsDir, 'node_modules', pkg, 'package.json'), 'utf8'),
        ).version;
      } catch {
        toolVersions[pkg] = 'unknown';
      }
    }
    toolVersions['copy-lint'] = 'taste-skill@f6b7657';

    const generatedAt = new Date().toISOString();
    const findingsPath = path.join(outDir, 'findings.json');
    fs.writeFileSync(
      findingsPath,
      JSON.stringify(
        {
          target,
          url,
          browser,
          generatedAt,
          toolVersions,
          toolErrors,
          screenshots,
          summary,
          findings: unique,
        },
        null,
        2,
      ) + '\n',
    );

    // report.md
    const lines = [];
    lines.push(`# Frontend Review: ${target}`);
    lines.push('');
    lines.push(`**Target**: ${target}`);
    lines.push(`**URL**: ${url || 'none'}`);
    lines.push(`**Browser checks**: ${browser ? 'yes' : 'no'}`);
    lines.push(`**Generated**: ${generatedAt}`);
    lines.push('');
    lines.push('## Summary');
    lines.push('');
    lines.push('| Severity | Count |');
    lines.push('| --- | --- |');
    lines.push(`| Error | ${summary.error} |`);
    lines.push(`| Warning | ${summary.warning} |`);
    lines.push(`| Advisory | ${summary.advisory} |`);
    lines.push('');
    lines.push('## Tool versions');
    lines.push('');
    for (const [name, version] of Object.entries(toolVersions)) {
      lines.push(`- ${name}: ${version}`);
    }
    if (toolErrors.length > 0) {
      lines.push('');
      lines.push('## Tool errors');
      lines.push('');
      for (const te of toolErrors) lines.push(`- ${te.tool}: ${te.message}`);
    }
    const sections = [
      ['Errors', 'error'],
      ['Warnings', 'warning'],
      ['Advisories', 'advisory'],
    ];
    for (const [title, severity] of sections) {
      const rows = unique.filter((f) => f.severity === severity);
      if (rows.length === 0) continue;
      lines.push('');
      lines.push(`## ${title}`);
      lines.push('');
      lines.push('| # | Tool | Rule | Location | Detail | Fix |');
      lines.push('| --- | --- | --- | --- | --- | --- |');
      rows.forEach((f, i) => {
        lines.push(
          `| ${i + 1} | ${cell(f.tool)} | ${cell(f.rule)} | ${cell(locationOf(f))} | ` +
            `${cell(f.detail)} | ${cell(f.fix)} |`,
        );
      });
    }
    if (screenshots.length > 0) {
      lines.push('');
      lines.push('## Screenshots');
      lines.push('');
      for (const s of screenshots) lines.push(`- ${s}`);
    }
    const reportPath = path.join(outDir, 'report.md');
    fs.writeFileSync(reportPath, lines.join('\n') + '\n');

    console.log(`report: ${reportPath}`);
    console.log(`findings: ${findingsPath}`);
    console.log(`${summary.error} error, ${summary.warning} warning, ${summary.advisory} advisory`);
    for (const te of toolErrors) {
      console.log(`tool error: ${te.tool}: ${te.message}`);
    }
  } finally {
    if (server) {
      try {
        await server.close();
      } catch {
        // ignore
      }
    }
  }
}

await main();
