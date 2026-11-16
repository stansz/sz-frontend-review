import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { findBrowser } from './lib/browser.mjs';

const VIEWPORTS = [
  { name: 'mobile', width: 390, height: 844 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1280, height: 900 },
];

const TARGET_SELECTOR =
  'a[href],button,input:not([type=hidden]),select,textarea,summary,[role=button],[role=link],[role=checkbox],[role=tab]';

function finding(tool, rule, severity, url, viewport, detail, fix, meta = {}) {
  return { tool, rule, severity, file: null, line: null, url, viewport, detail, fix, meta };
}

export async function audit({ url, outDir }) {
  const executablePath = findBrowser();
  if (!executablePath) {
    throw new Error('No Chromium-based browser found; set FRONTEND_REVIEW_BROWSER');
  }
  const { chromium } = await import('playwright-core');
  const browser = await chromium.launch({
    executablePath,
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });

  const findings = [];
  const screenshots = [];
  let renderedHtml = null;

  try {
    for (const { name, width, height } of VIEWPORTS) {
      const context = await browser.newContext({
        viewport: { width, height },
        deviceScaleFactor: 1,
      });
      const page = await context.newPage();

      const consoleMessages = [];
      if (name === 'desktop') {
        page.on('console', (msg) => {
          if (msg.type() === 'error') consoleMessages.push(msg.text());
        });
        page.on('pageerror', (err) => consoleMessages.push(String(err && err.message ? err.message : err)));
      }

      await page.goto(url, { waitUntil: 'load', timeout: 30000 });
      await page.waitForTimeout(500);

      const scrollHeight = await page.evaluate(() => document.documentElement.scrollHeight);
      const shotsDir = path.join(outDir, 'screenshots');
      fs.mkdirSync(shotsDir, { recursive: true });
      const shotPath = path.join(shotsDir, `${name}-${width}.png`);
      await page.screenshot({ path: shotPath, fullPage: scrollHeight <= 8000 });
      screenshots.push(shotPath);

      // Horizontal overflow (every viewport)
      const { sw, cw } = await page.evaluate(() => ({
        sw: document.documentElement.scrollWidth,
        cw: document.documentElement.clientWidth,
      }));
      if (sw > cw + 1) {
        const offenders = await page.evaluate((limit) => {
          const sel = (el) => {
            const tag = el.tagName.toLowerCase();
            if (el.id) return `${tag}#${el.id}`;
            const cls =
              typeof el.className === 'string' ? el.className.trim().split(/\s+/)[0] : '';
            return cls ? `${tag}.${cls}` : tag;
          };
          const out = [];
          for (const el of document.querySelectorAll('*')) {
            if (out.length >= limit) break;
            const rect = el.getBoundingClientRect();
            if (rect.right > document.documentElement.clientWidth + 1) out.push(sel(el));
          }
          return out;
        }, 5);
        findings.push(
          finding(
            'browser',
            'horizontal-overflow',
            'error',
            url,
            `${width}px`,
            `Page is ${sw}px wide in a ${cw}px viewport`,
            'Find the element wider than the viewport (fixed widths, long unbroken strings, wide media or tables) and let it shrink or wrap.',
            { offenders },
          ),
        );
      }

      // Target size (mobile only)
      if (name === 'mobile') {
        const targets = await page.evaluate(
          ({ selector, limit }) => {
            const sel = (el) => {
              const tag = el.tagName.toLowerCase();
              if (el.id) return `${tag}#${el.id}`;
              const cls =
                typeof el.className === 'string' ? el.className.trim().split(/\s+/)[0] : '';
              return cls ? `${tag}.${cls}` : tag;
            };
            const out = [];
            for (const el of document.querySelectorAll(selector)) {
              if (out.length >= limit) break;
              const rect = el.getBoundingClientRect();
              if (rect.width <= 0 || rect.height <= 0) continue;
              if (getComputedStyle(el).visibility === 'hidden') continue;
              if (el.tagName === 'A') {
                const container = el.closest('p,li');
                if (
                  container &&
                  container.textContent.trim().length > el.textContent.trim().length
                ) {
                  continue;
                }
              }
              if (rect.width < 24 || rect.height < 24) {
                out.push({
                  selector: sel(el),
                  w: Math.round(rect.width),
                  h: Math.round(rect.height),
                });
              }
            }
            return out;
          },
          { selector: TARGET_SELECTOR, limit: 20 },
        );
        for (const t of targets) {
          findings.push(
            finding(
              'browser',
              'target-size',
              'warning',
              url,
              '390px',
              `${t.selector} is ${t.w}x${t.h}px`,
              'Make the target at least 24x24 CSS px or keep 24px of space around it (WCAG 2.2 SC 2.5.8).',
            ),
          );
        }
      }

      // Desktop only: console errors and axe
      if (name === 'desktop') {
        const seen = new Set();
        for (const raw of consoleMessages) {
          const detail = String(raw).slice(0, 300);
          if (seen.has(detail)) continue;
          seen.add(detail);
          findings.push(
            finding(
              'browser',
              'console-error',
              'warning',
              url,
              '1280px',
              detail,
              'Fix the error or the missing resource it names.',
            ),
          );
        }

        const require = createRequire(import.meta.url);
        await page.addScriptTag({ path: require.resolve('axe-core/axe.min.js') });
        const axeResults = await page.evaluate(() =>
          axe.run(document, {
            runOnly: {
              type: 'tag',
              values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'],
            },
            resultTypes: ['violations'],
          }),
        );
        for (const v of axeResults.violations || []) {
          const severity =
            v.impact === 'critical' || v.impact === 'serious'
              ? 'error'
              : v.impact === 'moderate'
                ? 'warning'
                : 'advisory';
          const nodes = (v.nodes || []).map((n) => n.target.join(' '));
          const shown = nodes.slice(0, 3).join(', ');
          findings.push(
            finding(
              'axe',
              v.id,
              severity,
              url,
              '1280px',
              `${v.help} (${nodes.length} element(s): ${shown})`,
              v.helpUrl,
              { impact: v.impact, wcag: (v.tags || []).filter((t) => t.startsWith('wcag')) },
            ),
          );
        }

        fs.mkdirSync(outDir, { recursive: true });
        renderedHtml = path.join(outDir, 'rendered.html');
        fs.writeFileSync(renderedHtml, await page.content());
      }

      await context.close();
    }
  } finally {
    await browser.close();
  }

  return { findings, screenshots, renderedHtml };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const url = args[0];
  const outIdx = args.indexOf('--out');
  const outDir = outIdx >= 0 ? args[outIdx + 1] : path.join(process.cwd(), 'browser-audit-out');
  if (!url) {
    console.error('Usage: node scripts/browser-audit.mjs <url> --out <dir>');
    process.exit(1);
  }
  fs.mkdirSync(outDir, { recursive: true });
  audit({ url, outDir })
    .then((result) => {
      console.log(JSON.stringify(result, null, 2));
      process.exit(0);
    })
    .catch((err) => {
      console.error(String(err && err.message ? err.message : err));
      process.exit(1);
    });
}
