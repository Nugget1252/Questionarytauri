const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const WWW_DIR = path.join(ROOT, 'www');

const TOP_LEVEL_FILES = [
  'index.html',
  'pdfviewer.html',
  'manifest.json',
  'sw.js',
  'questionary.db',
  'database.db',
  'app-icon.png',
  'sql-wasm.js',
  'sql-wasm.wasm'
];

const DIRECTORIES = [
  'css',
  'js',
  'fonts',
  'assets',
  'data'
];

const EXCLUDED_REL_FILES = new Set([
  path.join('js', 'admin.js')
]);

function copyRecursive(src, dest, rel = '') {
  if (!fs.existsSync(src)) return;
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src)) {
      const nextRel = rel ? path.join(rel, entry) : entry;
      copyRecursive(path.join(src, entry), path.join(dest, entry), nextRel);
    }
  } else if (stat.isFile()) {
    if (EXCLUDED_REL_FILES.has(rel)) return;
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
  }
}

function syncWwwBundle() {
  const qDb = path.join(ROOT, 'questionary.db');
  const dDb = path.join(ROOT, 'database.db');
  if (fs.existsSync(qDb) && !fs.existsSync(dDb)) {
    fs.copyFileSync(qDb, dDb);
  }
  const assetsDir = path.join(ROOT, 'assets');
  if (fs.existsSync(qDb) && fs.existsSync(assetsDir)) {
    fs.copyFileSync(qDb, path.join(assetsDir, 'questionary.db'));
    fs.copyFileSync(qDb, path.join(assetsDir, 'database.db'));
  }

  if (fs.existsSync(WWW_DIR)) {
    fs.rmSync(WWW_DIR, { recursive: true, force: true });
  }
  fs.mkdirSync(WWW_DIR, { recursive: true });

  for (const file of TOP_LEVEL_FILES) {
    const src = path.join(ROOT, file);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, path.join(WWW_DIR, file));
    }
  }

  for (const dir of DIRECTORIES) {
    copyRecursive(path.join(ROOT, dir), path.join(WWW_DIR, dir), dir);
  }

  console.log('[sync-www] Synced offline web & Capacitor bundle to www/');
}

syncWwwBundle();
