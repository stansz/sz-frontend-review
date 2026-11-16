#!/usr/bin/env node

/**
 * check-updates.mjs — Report newer versions of the pinned tools and drift in
 * the impeccable rule list. Never fails: prints `unknown` on network or parse
 * failures and always exits 0.
 *
 * Usage: node scripts/check-updates.mjs [--write]
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const repoDir = path.dirname(scriptsDir);
const bin = (name) => path.join(scriptsDir, 'node_modules', '.bin', name);
const RULES_PATH = path.join(repoDir, 'references', 'impeccable-rules.txt');
const write = process.argv.includes('--write');

function checkVersions() {
  let pkg;
  try {
    pkg = JSON.parse(fs.readFileSync(path.join(scriptsDir, 'package.json'), 'utf8'));
  } catch {
    console.log('package.json  pinned unknown  latest unknown  unknown');
    return;
  }
  for (const [name, pinned] of Object.entries(pkg.dependencies || {})) {
    let latest = 'unknown';
    try {
      const r = spawnSync('npm', ['view', name, 'version'], {
        encoding: 'utf8',
        timeout: 60000,
      });
      if (r.status === 0 && r.stdout && r.stdout.trim()) {
        const lines = r.stdout.trim().split('\n').filter((l) => l.trim());
        latest = lines[lines.length - 1].trim();
      }
    } catch {
      latest = 'unknown';
    }
    const status =
      latest === 'unknown' ? 'unknown' : latest === pinned ? 'up to date' : 'UPDATE AVAILABLE';
    console.log(`${name}  pinned ${pinned}  latest ${latest}  ${status}`);
  }
}

function checkRules() {
  let installedVersion = 'unknown';
  try {
    installedVersion = JSON.parse(
      fs.readFileSync(path.join(scriptsDir, 'node_modules', 'impeccable', 'package.json'), 'utf8'),
    ).version;
  } catch {
    installedVersion = 'unknown';
  }

  let installed = [];
  try {
    const r = spawnSync(bin('impeccable'), ['detect', '--list-rules', '--json'], {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      timeout: 60000,
    });
    if (r.status === 0 && r.stdout && r.stdout.trim()) {
      const arr = JSON.parse(r.stdout);
      if (Array.isArray(arr)) installed = arr.map((item) => item.id).filter(Boolean);
    }
  } catch {
    installed = [];
  }

  if (installed.length === 0) {
    console.log('impeccable rules: unknown');
    return;
  }

  let fileIds = [];
  try {
    fileIds = fs
      .readFileSync(RULES_PATH, 'utf8')
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'));
  } catch {
    fileIds = [];
  }

  console.log(
    `impeccable rules: ${installed.length} installed, ${fileIds.length} in impeccable-rules.txt`,
  );

  const installedSet = new Set(installed);
  const fileSet = new Set(fileIds);
  const added = installed.filter((id) => !fileSet.has(id));
  const removed = fileIds.filter((id) => !installedSet.has(id));

  if (added.length === 0 && removed.length === 0) {
    console.log('rule list matches');
  } else {
    if (added.length > 0) {
      console.log('added:');
      for (const id of added) console.log(`  ${id}`);
    }
    if (removed.length > 0) {
      console.log('removed:');
      for (const id of removed) console.log(`  ${id}`);
    }
  }

  if (write) {
    const header = `# impeccable ${installedVersion} rule ids, written by check-updates.mjs --write`;
    fs.writeFileSync(RULES_PATH, header + '\n' + installed.join('\n') + '\n');
  }
}

try {
  checkVersions();
  checkRules();
} catch (e) {
  console.log(`unknown (${e && e.message ? e.message : e})`);
}
process.exit(0);
