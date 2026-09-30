#!/usr/bin/env node
/**
 * Builds "Claude for Arc": takes the official Claude in Chrome extension you
 * already have installed (or downloads it from the Chrome Web Store update
 * server), copies it, and adds the Arc compatibility layer from ./src.
 * The official files are not modified; only the manifest, the service worker
 * loader and a few HTML pages get extra entries.
 *
 * Usage: node patch.mjs [--from <extension dir>] [--download] [--out <dir>] [--dev]
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const EXTENSION_ID = 'fcoeoabgfenejglbffodgkkbkcdhcgfn';
const TESTED_VERSIONS = ['1.0.94'];
const ROOT = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(ROOT, 'src');
const DIR = 'claude-for-arc';

const args = process.argv.slice(2);
const flag = name => args.includes(name);
const option = name => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};

if (flag('--help') || flag('-h')) {
  console.log(`Usage: node patch.mjs [options]

  --from <dir>   use this unpacked official extension (a folder with manifest.json)
  --download     download the latest official build from Google instead of using an installed copy
  --out <dir>    where to write the patched extension (default: ./dist/extension)
  --dev          include the dev reload and trace hooks (for working on this project)`);
  process.exit(0);
}

function parseVersion(v) {
  return v.replace(/_\d+$/, '').split('.').map(n => parseInt(n, 10) || 0);
}

function compareVersions(a, b) {
  const x = parseVersion(a), y = parseVersion(b);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) - (y[i] || 0);
  }
  return 0;
}

function browserDataDirs() {
  const home = os.homedir();
  if (process.platform === 'darwin') {
    const base = path.join(home, 'Library', 'Application Support');
    return {
      'Google Chrome': path.join(base, 'Google', 'Chrome'),
      Arc: path.join(base, 'Arc', 'User Data'),
      Brave: path.join(base, 'BraveSoftware', 'Brave-Browser'),
      'Microsoft Edge': path.join(base, 'Microsoft Edge')
    };
  }
  if (process.platform === 'win32') {
    const local = process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local');
    const dirs = {
      'Google Chrome': path.join(local, 'Google', 'Chrome', 'User Data'),
      Brave: path.join(local, 'BraveSoftware', 'Brave-Browser', 'User Data'),
      'Microsoft Edge': path.join(local, 'Microsoft', 'Edge', 'User Data')
    };
    const packages = path.join(local, 'Packages');
    for (const name of safeReaddir(packages)) {
      if (name.startsWith('TheBrowserCompany.Arc')) {
        dirs.Arc = path.join(packages, name, 'LocalCache', 'Local', 'Arc', 'User Data');
      }
    }
    return dirs;
  }
  return {
    'Google Chrome': path.join(home, '.config', 'google-chrome'),
    Chromium: path.join(home, '.config', 'chromium'),
    Brave: path.join(home, '.config', 'BraveSoftware', 'Brave-Browser'),
    'Microsoft Edge': path.join(home, '.config', 'microsoft-edge')
  };
}

function safeReaddir(dir) {
  try { return fs.readdirSync(dir); } catch { return []; }
}

function findInstalledCopies() {
  const found = [];
  for (const [browser, dataDir] of Object.entries(browserDataDirs())) {
    for (const profile of safeReaddir(dataDir)) {
      const extDir = path.join(dataDir, profile, 'Extensions', EXTENSION_ID);
      for (const version of safeReaddir(extDir)) {
        const dir = path.join(extDir, version);
        if (fs.existsSync(path.join(dir, 'manifest.json'))) {
          found.push({ browser, profile, version: version.replace(/_\d+$/, ''), dir });
        }
      }
    }
  }
  return found.sort((a, b) => compareVersions(b.version, a.version));
}

async function downloadOfficial(tmp) {
  const url = 'https://clients2.google.com/service/update2/crx?response=redirect&prodversion=140.0' +
    `&acceptformat=crx3&x=id%3D${EXTENSION_ID}%26uc`;
  console.log('Downloading the official extension from the Chrome Web Store update server...');
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed: HTTP ${res.status}`);
  const crx = Buffer.from(await res.arrayBuffer());
  if (crx.toString('ascii', 0, 4) !== 'Cr24') throw new Error('Downloaded file is not a CRX package');
  const headerSize = crx.readUInt32LE(8);
  const zipPath = path.join(tmp, 'claude.zip');
  fs.writeFileSync(zipPath, crx.subarray(12 + headerSize));
  const dir = path.join(tmp, 'official');
  fs.mkdirSync(dir, { recursive: true });
  if (process.platform === 'win32') execFileSync('tar', ['-xf', zipPath, '-C', dir]);
  else execFileSync('unzip', ['-q', '-o', zipPath, '-d', dir]);
  return dir;
}

function insertAfterHead(html, tags) {
  return html.replace(/<head>/i, match => `${match}\n    ${tags.join('\n    ')}`);
}

async function main() {
  let sourceDir = option('--from');
  let tmp;
  if (!sourceDir && !flag('--download')) {
    const copies = findInstalledCopies();
    if (copies.length) {
      const best = copies[0];
      console.log(`Using the official extension ${best.version} from ${best.browser} (${best.profile}).`);
      sourceDir = best.dir;
    }
  }
  if (!sourceDir) {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-for-arc-'));
    sourceDir = await downloadOfficial(tmp);
  }

  const manifestPath = path.join(sourceDir, 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  if (manifest.version_name?.includes('arc')) {
    throw new Error(`${sourceDir} is already patched. Point --from at the official extension.`);
  }
  if (!TESTED_VERSIONS.includes(manifest.version)) {
    console.warn(`Warning: official version ${manifest.version} was not tested with this patch ` +
      `(tested: ${TESTED_VERSIONS.join(', ')}). It will most likely work; if not, open an issue.`);
  }

  const out = path.resolve(option('--out') || path.join(ROOT, 'dist', 'extension'));
  fs.rmSync(out, { recursive: true, force: true });
  fs.cpSync(sourceDir, out, { recursive: true });
  // Chrome refuses to load unpacked extensions that contain the store's _metadata folder.
  fs.rmSync(path.join(out, '_metadata'), { recursive: true, force: true });

  const files = ['tabgroups.js', 'sidepanel.js', 'panel-injector.js', 'viewport-override.js', 'cmd-e-fallback.js'];
  if (flag('--dev')) files.push('dev-trace.js', 'dev-reload.js');
  fs.mkdirSync(path.join(out, DIR), { recursive: true });
  for (const f of files) fs.copyFileSync(path.join(SRC, f), path.join(out, DIR, f));

  // Service worker: the compatibility layer must run before the official code.
  const loader = manifest.background?.service_worker;
  if (!loader) throw new Error('manifest.json has no background.service_worker');
  const loaderPath = path.join(out, loader);
  const prefix = path.relative(path.dirname(loaderPath), path.join(out, DIR)).split(path.sep).join('/') || '.';
  const imports = ['tabgroups.js', ...(flag('--dev') ? ['dev-trace.js'] : []), 'sidepanel.js', ...(flag('--dev') ? ['dev-reload.js'] : [])]
    .map(f => `import './${prefix}/${f}';`);
  fs.writeFileSync(loaderPath, `${imports.join('\n')}\n${fs.readFileSync(loaderPath, 'utf8')}`);

  // Extension pages share the emulated tab groups with the service worker.
  for (const page of ['sidepanel.html', 'options.html', 'pairing.html']) {
    const p = path.join(out, page);
    if (!fs.existsSync(p)) continue;
    let html = insertAfterHead(fs.readFileSync(p, 'utf8'), [`<script src="/${DIR}/tabgroups.js"></script>`]);
    if (page === 'sidepanel.html') {
      html = html.replace(/<\/body>/i, `  <script src="/${DIR}/cmd-e-fallback.js"></script>\n  </body>`);
    }
    fs.writeFileSync(p, html);
  }

  manifest.name = 'Claude for Arc';
  manifest.version_name = `${manifest.version}-arc`;
  manifest.description = 'The official Claude in Chrome extension with an Arc compatibility layer (side panel, tab groups).';
  delete manifest.update_url;
  manifest.content_scripts = [
    ...(manifest.content_scripts || []),
    { matches: ['<all_urls>'], js: [`${DIR}/viewport-override.js`], run_at: 'document_start', world: 'MAIN' },
    { matches: ['<all_urls>'], js: [`${DIR}/panel-injector.js`], run_at: 'document_idle' }
  ];
  manifest.web_accessible_resources = [
    ...(manifest.web_accessible_resources || []),
    { matches: ['<all_urls>'], resources: ['sidepanel.html'], use_dynamic_url: true }
  ];
  fs.writeFileSync(path.join(out, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

  if (tmp) fs.rmSync(tmp, { recursive: true, force: true });

  console.log(`
Done: ${out}

Next, in Arc:
  1. Open arc://extensions and turn on Developer mode.
  2. If the official "Claude" extension is installed in this profile, remove it
     (both use the same extension ID, so only one can be installed).
  3. Click "Load unpacked" and choose the folder above.
     Already loaded? Click the reload arrow on "Claude for Arc" instead.
  4. Press Cmd+E (Ctrl+E) or click the toolbar icon to open the panel, then sign in.`);
}

main().catch(err => {
  console.error(`Error: ${err.message}`);
  process.exit(1);
});
