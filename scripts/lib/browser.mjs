import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ENV_KEYS = ['FRONTEND_REVIEW_BROWSER', 'IMPECCABLE_BROWSER', 'CHROME_PATH'];

const CANDIDATES = [
  '/usr/lib64/chromium-browser/chromium-browser',
  '/usr/bin/chromium-browser',
  '/usr/bin/chromium',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/google-chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
];

function isFile(p) {
  if (!p) return false;
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

export function findBrowser() {
  for (const key of ENV_KEYS) {
    const p = process.env[key];
    if (p && isFile(p)) return p;
  }
  for (const p of CANDIDATES) {
    if (isFile(p)) return p;
  }
  return null;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const found = findBrowser();
  console.log(found ?? 'none');
  process.exit(0);
}
