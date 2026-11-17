const { app, BrowserWindow, ipcMain, dialog, protocol, net, Menu, nativeImage, desktopCapturer, session } = require('electron');
const path = require('path');
const fs = require('fs');
const https = require('https');
const http = require('http');
const zlib = require('zlib');
const crypto = require('crypto');
const { exec } = require('child_process');

// ================================================================
// LINUX WAYLAND & KDE PLASMA / GNOME COMPOSITOR IDENTIFIERS
// ================================================================
app.name = 'questionary';
if (process.platform === 'linux') {
  app.setDesktopName('questionary.desktop');
  app.commandLine.appendSwitch('enable-features', 'WaylandWindowDecorations');
}

// Enable WebRTC desktop capturers (Wayland / Linux / Windows / macOS safe)
app.commandLine.appendSwitch('enable-webrtc-pipewire-capturer');

// ================================================================
// REGISTER PRIVILEGED PROTOCOLS (MUST BE CALLED BEFORE app.whenReady)
// ================================================================
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'local-pdf',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      bypassCSP: true,
      stream: true
    }
  }
]);

let mainWindow;

// ================================================================
// WRITABLE INCREMENTAL BUNDLE RESOLUTION
// ================================================================
function getAppBundleDir() {
  return path.join(app.getPath('userData'), 'app_bundle');
}

function getSourceDirectoryFingerprint() {
  try {
    const h = crypto.createHash('sha256');
    h.update(app.getVersion() || '1.0.4');
    for (const rel of ['index.html', 'pdfviewer.html', 'js/app.js', 'js/features.js', 'questionary.db']) {
      const p = path.join(__dirname, rel);
      if (fs.existsSync(p)) {
        const st = fs.statSync(p);
        h.update(`${rel}:${st.size}:${Math.floor(st.mtimeMs)}`);
      }
    }
    return h.digest('hex').slice(0, 24);
  } catch (e) {
    return app.getVersion() || '1.0.4';
  }
}

function getLocalSourceTimestampMs() {
  let latest = 0;
  for (const rel of ['index.html', 'pdfviewer.html', 'js/app.js', 'js/features.js', 'questionary.db']) {
    try {
      const p = path.join(__dirname, rel);
      if (fs.existsSync(p)) {
        const mtime = fs.statSync(p).mtimeMs;
        if (mtime > latest) latest = mtime;
      }
    } catch (e) {}
  }
  return latest;
}

function getBundleRoot() {
  try {
    const bundleDir = getAppBundleDir();
    const fpFile = path.join(bundleDir, '.bundle-source-fingerprint');
    const indexHtml = path.join(bundleDir, 'index.html');
    const appJs = path.join(bundleDir, 'js', 'app.js');
    const currentFp = getSourceDirectoryFingerprint();

    if (fs.existsSync(fpFile) && fs.existsSync(indexHtml) && fs.existsSync(appJs)) {
      const savedFp = fs.readFileSync(fpFile, 'utf8').trim();
      if (savedFp === currentFp) {
        return bundleDir;
      }
    }

    // If local project directory was updated or bundle lacks fingerprint, purge stale app_bundle
    if (fs.existsSync(bundleDir)) {
      try {
        fs.rmSync(bundleDir, { recursive: true, force: true });
      } catch (e) {}
    }
  } catch (e) {}
  return __dirname;
}

function resolveRendererPath(relPath) {
  const root = getBundleRoot();
  const candidate = path.join(root, relPath);
  if (fs.existsSync(candidate)) return candidate;
  return path.join(__dirname, relPath);
}

// Disable Default Application Menu bar completely
Menu.setApplicationMenu(null);

// Resolve Application Icon with Fallbacks for Linux / Windows / macOS
function getAppIcon() {
  const possiblePaths = [
    path.join(__dirname, 'assets/icons/512x512.png'),
    path.join(__dirname, 'build/icons/512x512.png'),
    path.join(__dirname, 'build/icon.png'),
    path.join(__dirname, 'assets/icons/256x256.png'),
    path.join(__dirname, 'assets/icon.png'),
    path.join(__dirname, 'assets/logo.png')
  ];

  for (const iconPath of possiblePaths) {
    if (fs.existsSync(iconPath)) {
      return nativeImage.createFromPath(iconPath);
    }
  }
  return null;
}

// ================================================================
// AUTOMATIC LINUX / FEDORA DESKTOP SHORTCUT INSTALLER
// ================================================================
function ensureDesktopShortcut() {
  if (process.platform !== 'linux') return;

  try {
    const homeDir = app.getPath('home');
    const applicationsDir = path.join(homeDir, '.local', 'share', 'applications');
    const iconsDir = path.join(homeDir, '.local', 'share', 'icons', 'hicolor', '512x512', 'apps');
    const desktopFilePath = path.join(applicationsDir, 'questionary.desktop');
    const targetIconPath = path.join(iconsDir, 'questionary.png');

    // Ensure directories exist
    if (!fs.existsSync(applicationsDir)) fs.mkdirSync(applicationsDir, { recursive: true });
    if (!fs.existsSync(iconsDir)) fs.mkdirSync(iconsDir, { recursive: true });

    // Locate source icon
    const possibleIcons = [
      path.join(__dirname, 'assets/icons/512x512.png'),
      path.join(__dirname, 'build/icons/512x512.png'),
      path.join(__dirname, 'build/icon.png'),
      path.join(__dirname, 'assets/icon.png')
    ];

    let foundIcon = null;
    for (const p of possibleIcons) {
      if (fs.existsSync(p)) {
        foundIcon = p;
        break;
      }
    }

    // Copy icon to user's system icons directory if available
    if (foundIcon) {
      fs.copyFileSync(foundIcon, targetIconPath);
    }

    const execPath = process.execPath;
    const appPath = app.getAppPath();

    // Command to launch the app
    const execCommand = app.isPackaged
    ? `"${execPath}" %U`
    : `"${execPath}" "${appPath}" %U`;

    const iconEntry = fs.existsSync(targetIconPath) ? targetIconPath : (foundIcon || 'questionary');

    // STRICT: Formatted for KDE / GNOME Education Category placement
    const desktopEntryContent = [
      '[Desktop Entry]',
      'Type=Application',
      'Name=Questionary',
      'Comment=Questionary Desktop Study App',
      `Exec=${execCommand}`,
      `Icon=${iconEntry}`,
      'Terminal=false',
      'StartupNotify=true',
      'StartupWMClass=questionary',
      'Categories=Education;Science;Teaching;'
    ].join('\n') + '\n';

    // Always ensure valid content and executable permissions
    fs.writeFileSync(desktopFilePath, desktopEntryContent, 'utf8');
    fs.chmodSync(desktopFilePath, 0o755);

    // Refresh Desktop database and icon cache for KDE Plasma / GNOME
    exec(`update-desktop-database "${applicationsDir}" 2>/dev/null`);
    exec(`gtk-update-icon-cache -f -t "${path.join(homeDir, '.local', 'share', 'icons', 'hicolor')}" 2>/dev/null`);
    exec(`kbuildsycoca6 --noincremental 2>/dev/null || kbuildsycoca5 --noincremental 2>/dev/null`);

    console.log('[StudyRoom] Desktop shortcut successfully installed to:', desktopFilePath);
  } catch (err) {
    console.error('[Desktop Entry Error]:', err);
  }
}

function createWindow() {
  const icon = getAppIcon();

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'Questionary',
    autoHideMenuBar: true,
    icon: icon || undefined,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
                                 nodeIntegration: false,
                                 contextIsolation: true,
                                 webSecurity: true,
                                 devTools: false // Disables DevTools / Inspect Element
    }
  });

  // Enable native pinch-to-zoom limits
  mainWindow.webContents.setVisualZoomLevelLimits(1, 3);

  // Explicitly set icon for Linux desktop compositors / KDE Plasma / GNOME taskbar
  if (process.platform === 'linux' && icon) {
    mainWindow.setIcon(icon);
  }

  mainWindow.setMenuBarVisibility(false);
  mainWindow.loadFile(resolveRendererPath('index.html'));

  // Handle Zoom shortcuts (Ctrl + +, Ctrl + -, Ctrl + 0) and block Inspect Element shortcuts
  mainWindow.webContents.on('before-input-event', (event, input) => {
    // Zoom in: Ctrl + '+' or Ctrl + '='
    if (input.control && (input.key === '=' || input.key === '+')) {
      const current = mainWindow.webContents.getZoomFactor();
      mainWindow.webContents.setZoomFactor(Math.min(2.0, current + 0.08));
      event.preventDefault();
      return;
    }
    // Zoom out: Ctrl + '-'
    else if (input.control && (input.key === '-' || input.key === '_')) {
      const current = mainWindow.webContents.getZoomFactor();
      mainWindow.webContents.setZoomFactor(Math.max(0.5, current - 0.08));
      event.preventDefault();
      return;
    }
    // Reset: Ctrl + 0
    else if (input.control && input.key === '0') {
      mainWindow.webContents.setZoomFactor(1.0);
      event.preventDefault();
      return;
    }

    // Block Inspect Element / View Source shortcuts (F12, Ctrl+Shift+I, Ctrl+U)
    const isDevKey =
    input.key === 'F12' ||
    (input.control && input.shift && ['I', 'i', 'C', 'c', 'J', 'j'].includes(input.key)) ||
    (input.control && (input.key === 'U' || input.key === 'u'));

    if (isDevKey) {
      event.preventDefault();
    }
  });
}

// ================================================================
// REGISTER DISPLAY MEDIA HANDLER & PROTOCOLS
// ================================================================
app.whenReady().then(() => {
  // Ensure native desktop shortcut exists for Fedora / Linux
  ensureDesktopShortcut();

  // 1. Hook Electron's Display Media Handler so navigator.mediaDevices.getDisplayMedia() works
  session.defaultSession.setDisplayMediaRequestHandler(async (request, callback) => {
    try {
      const sources = await desktopCapturer.getSources({ types: ['screen', 'window'] });
      if (sources && sources.length > 0) {
        callback({ video: sources[0], audio: 'loopback' });
      } else {
        callback(null);
      }
    } catch (err) {
      console.error('[Electron ScreenCapture Error]:', err);
      callback(null);
    }
  });

  // 2. Local PDF Custom Protocol Handler
  protocol.handle('local-pdf', (request) => {
    let rawWithoutScheme = decodeURIComponent(request.url.replace(/^local-pdf:\/\//, '').split('?')[0]);
    const cleanRel = rawWithoutScheme.replace(/^\/+/, '');

    if (cleanRel.startsWith('user-library/')) {
      const blobId = path.basename(cleanRel.replace(/^user-library\//, '')).replace(/^blob-id:/, '');
      const defaultLibFile = path.join(app.getPath('userData'), 'Questionary_PDFs', 'user_library_files', `${blobId}.bin`);
      if (fs.existsSync(defaultLibFile)) {
        const buf = fs.readFileSync(defaultLibFile);
        return new Response(buf, {
          status: 200,
          headers: {
            'Content-Type': 'application/pdf',
            'Content-Length': String(buf.length),
            'Access-Control-Allow-Origin': '*'
          }
        });
      }
    }

    let decoded = rawWithoutScheme;
    if (process.platform !== 'win32' && !decoded.startsWith('/')) {
      decoded = '/' + decoded;
    }

    if (fs.existsSync(decoded)) {
      return net.fetch(`file://${decoded}`);
    }

    const nestedPath = decoded.replace(/\/documents\//, '/documents/documents/');
    if (fs.existsSync(nestedPath)) {
      return net.fetch(`file://${nestedPath}`);
    }

    const singlePath = decoded.replace(/\/documents\/documents\//, '/documents/');
    if (fs.existsSync(singlePath)) {
      return net.fetch(`file://${singlePath}`);
    }

    const fallbackBundled = path.join(__dirname, 'documents', path.basename(decoded));
    if (fs.existsSync(fallbackBundled)) {
      return net.fetch(`file://${fallbackBundled}`);
    }

    return net.fetch(`file://${decoded}`);
  });

  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ================================================================
// DESKTOP CAPTURER IPC HANDLER
// ================================================================
ipcMain.handle('get-desktop-sources', async (event, options) => {
  try {
    const opts = options || { types: ['screen', 'window'] };
    const sources = await desktopCapturer.getSources(opts);
    return sources.map(s => ({
      id: s.id,
      name: s.name,
      thumbnail: s.thumbnail ? s.thumbnail.toDataURL() : null
    }));
  } catch (e) {
    console.error('Failed to get desktop sources:', e);
    return [];
  }
});

// ================================================================
// STORAGE & LOCAL FILE SYSTEM IPC
// ================================================================

ipcMain.handle('get-default-storage-path', () => {
  return path.join(app.getPath('userData'), 'Questionary_PDFs');
});

ipcMain.handle('select-storage-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory', 'createDirectory'],
    title: 'Select PDF Storage Folder'
  });
  if (!result.canceled && result.filePaths.length > 0) {
    return result.filePaths[0];
  }
  return null;
});

ipcMain.handle('get-storage-stats', async (event, storageDir) => {
  if (!fs.existsSync(storageDir)) return { totalBytes: 0, fileCount: 0 };
  let totalBytes = 0;
  let fileCount = 0;

  function scanDir(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        scanDir(fullPath);
      } else if (entry.isFile()) {
        totalBytes += fs.statSync(fullPath).size;
        fileCount++;
      }
    }
  }

  scanDir(storageDir);
  return { totalBytes, fileCount };
});

ipcMain.handle('check-documents-exist', async (event, storageDir) => {
  const docsFolder = path.join(storageDir, 'documents');
  if (!fs.existsSync(docsFolder)) return false;
  try {
    const files = fs.readdirSync(docsFolder);
    return files.length > 0;
  } catch (e) {
    return false;
  }
});

ipcMain.handle('check-local-files', async (event, storageDir) => {
  if (!fs.existsSync(storageDir)) return [];
  const existingFiles = [];

  function scan(dir, base) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const rel = path.join(base, entry.name);
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        scan(full, rel);
      } else if (entry.isFile()) {
        existingFiles.push(rel.replace(/\\/g, '/'));
      }
    }
  }

  scan(storageDir, '');
  return existingFiles;
});

ipcMain.handle('delete-subject-pack', async (event, { storageDir, relativeFolder }) => {
  const targetPath = path.join(storageDir, relativeFolder);
  if (fs.existsSync(targetPath)) {
    fs.rmSync(targetPath, { recursive: true, force: true });
    return true;
  }
  return false;
});

ipcMain.handle('move-storage-folder', async (event, { oldDir, newDir }) => {
  if (!fs.existsSync(oldDir)) {
    fs.mkdirSync(newDir, { recursive: true });
    return true;
  }
  if (!fs.existsSync(newDir)) fs.mkdirSync(newDir, { recursive: true });

  function copyRecursive(src, dest) {
    const entries = fs.readdirSync(src, { withFileTypes: true });
    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);
      if (entry.isDirectory()) {
        if (!fs.existsSync(destPath)) fs.mkdirSync(destPath, { recursive: true });
        copyRecursive(srcPath, destPath);
      } else {
        fs.copyFileSync(srcPath, destPath);
      }
    }
  }

  copyRecursive(oldDir, newDir);
  fs.rmSync(oldDir, { recursive: true, force: true });
  return true;
});

// ================================================================
// NATIVE USER LIBRARY IMPORT & BINARY STORE IPC
// ================================================================

ipcMain.handle('select-files-to-import', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'Documents & Images', extensions: ['pdf', 'png', 'jpg', 'jpeg', 'webp', 'gif', 'svg', 'txt', 'md', 'docx'] }
    ]
  });
  if (!result.canceled && result.filePaths.length > 0) {
    return result.filePaths.map(filePath => ({
      name: path.basename(filePath),
                                             path: filePath,
                                             size: fs.statSync(filePath).size,
                                             buffer: fs.readFileSync(filePath)
    }));
  }
  return [];
});

function resolveUserLibraryDir(storageDir) {
  const baseDir = (storageDir && typeof storageDir === 'string' && storageDir.trim())
    ? storageDir.trim()
    : path.join(app.getPath('userData'), 'Questionary_PDFs');
  return path.join(baseDir, 'user_library_files');
}

ipcMain.handle('save-user-library-file', async (event, { blobId, storageDir, buffer } = {}) => {
  const cleanId = path.basename(String(blobId || '').replace(/^blob-id:/, ''));
  if (!cleanId || !buffer) return false;
  const libDir = resolveUserLibraryDir(storageDir);
  if (!fs.existsSync(libDir)) fs.mkdirSync(libDir, { recursive: true });
  const bytes = Buffer.from(buffer);
  fs.writeFileSync(path.join(libDir, `${cleanId}.bin`), bytes);
  const defaultLibDir = resolveUserLibraryDir('');
  if (defaultLibDir !== libDir) {
    try {
      if (!fs.existsSync(defaultLibDir)) fs.mkdirSync(defaultLibDir, { recursive: true });
      fs.writeFileSync(path.join(defaultLibDir, `${cleanId}.bin`), bytes);
    } catch (e) {}
  }
  return true;
});

ipcMain.handle('get-user-library-file', async (event, { blobId, storageDir } = {}) => {
  const cleanId = path.basename(String(blobId || '').replace(/^blob-id:/, ''));
  if (!cleanId) return null;
  const candidates = [
    path.join(resolveUserLibraryDir(storageDir), `${cleanId}.bin`),
    path.join(resolveUserLibraryDir(''), `${cleanId}.bin`)
  ];
  for (const target of candidates) {
    if (fs.existsSync(target)) {
      return new Uint8Array(fs.readFileSync(target));
    }
  }
  return null;
});

ipcMain.handle('delete-user-library-file', async (event, { blobId, storageDir } = {}) => {
  const cleanId = path.basename(String(blobId || '').replace(/^blob-id:/, ''));
  if (!cleanId) return false;
  const candidates = [
    path.join(resolveUserLibraryDir(storageDir), `${cleanId}.bin`),
    path.join(resolveUserLibraryDir(''), `${cleanId}.bin`)
  ];
  for (const target of candidates) {
    if (fs.existsSync(target)) {
      try { fs.unlinkSync(target); } catch (e) {}
    }
  }
  return true;
});

// ================================================================
// NATIVE ZIP EXTRACTION (Zero external dependencies)
// ================================================================

function extractZipBuffer(zipBuffer, targetDir) {
  let offset = 0;
  while (offset < zipBuffer.length - 4) {
    const sig = zipBuffer.readUInt32LE(offset);
    if (sig !== 0x04034b50) break;

    const compMethod = zipBuffer.readUInt16LE(offset + 8);
    const compSize = zipBuffer.readUInt32LE(offset + 18);
    const uncompSize = zipBuffer.readUInt32LE(offset + 22);
    const nameLen = zipBuffer.readUInt16LE(offset + 26);
    const extraLen = zipBuffer.readUInt16LE(offset + 28);

    let fileName = zipBuffer.toString('utf8', offset + 30, offset + 30 + nameLen);
    const dataStart = offset + 30 + nameLen + extraLen;
    const rawData = zipBuffer.subarray(dataStart, dataStart + compSize);

    fileName = fileName.replace(/\\/g, '/');
    const outPath = path.join(targetDir, fileName);

    if (fileName.endsWith('/')) {
      if (!fs.existsSync(outPath)) fs.mkdirSync(outPath, { recursive: true });
    } else {
      const parentDir = path.dirname(outPath);
      if (!fs.existsSync(parentDir)) fs.mkdirSync(parentDir, { recursive: true });

      if (compMethod === 0) {
        fs.writeFileSync(outPath, rawData);
      } else if (compMethod === 8) {
        const decompressed = zlib.inflateRawSync(rawData);
        fs.writeFileSync(outPath, decompressed);
      }
    }

    offset = dataStart + compSize;
  }
}

// Redirect-aware streaming downloader
function downloadWithRedirect(url, chunks, onProgress) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    const req = client.get(url, { headers: { 'User-Agent': 'Questionary-App' } }, (res) => {
      if ([301, 302, 307, 308].includes(res.statusCode)) {
        if (!res.headers.location) {
          return reject(new Error('Redirect missing location header'));
        }
        return downloadWithRedirect(res.headers.location, chunks, onProgress).then(resolve).catch(reject);
      }

      if (res.statusCode !== 200) {
        return reject(new Error(`Download failed with status ${res.statusCode}`));
      }

      const totalBytes = parseInt(res.headers['content-length'], 10) || 0;
      let downloaded = 0;
      let lastTime = Date.now();
      let bytesSince = 0;
      let speed = '0 KB/s';

      res.on('data', (chunk) => {
        chunks.push(chunk);
        downloaded += chunk.length;
        bytesSince += chunk.length;

        const now = Date.now();
        if (now - lastTime >= 800) {
          const speedKB = (bytesSince / 1024) / ((now - lastTime) / 1000);
          speed = speedKB > 1024 ? `${(speedKB / 1024).toFixed(1)} MB/s` : `${Math.round(speedKB)} KB/s`;
          bytesSince = 0;
          lastTime = now;
        }

        if (totalBytes > 0 && onProgress) {
          onProgress({ percent: Math.min(98, Math.round((downloaded / totalBytes) * 100)), speed });
        }
      });

      res.on('end', resolve);
      res.on('error', reject);
    });

    req.on('error', reject);
  });
}

// ================================================================
// DUAL-MIRROR DOWNLOAD HANDLER (GitHub Releases + Google Drive Fallback)
// ================================================================

const GDRIVE_MIRRORS = {
  sd: 'https://drive.usercontent.google.com/download?id=1Jrjw9B8UZOQ0iKCbJy0AEJsZ7Bxb3-xD&export=download&authuser=0&confirm=t',
  hd: 'https://drive.usercontent.google.com/download?id=1eswlUDGcWwLpCcNGosYnVgQhWKdYGt-J&export=download&authuser=0&confirm=t'
};

ipcMain.handle('download-full-pack', async (event, { quality, storageDir, repoOwner, repoName, releaseTag }) => {
  const owner = repoOwner || 'Nugget1252';
  const repo = repoName || 'Questionarytauri';
  const tag = releaseTag || 'documents';
  const zipFilename = quality === 'hd' ? 'documents-hd.zip' : 'documents-sd.zip';

  // Primary Mirror: GitHub Releases CDN
  const githubUrl = `https://github.com/${owner}/${repo}/releases/download/${tag}/${zipFilename}`;
  // Secondary Mirror: Google Drive
  const gdriveUrl = quality === 'hd' ? GDRIVE_MIRRORS.hd : GDRIVE_MIRRORS.sd;

  if (!fs.existsSync(storageDir)) {
    fs.mkdirSync(storageDir, { recursive: true });
  }

  const mirrors = [
    { name: 'GitHub Releases CDN', url: githubUrl },
    { name: 'Google Drive Mirror', url: gdriveUrl }
  ];

  let downloadedBuffer = null;
  let lastError = null;

  for (const mirror of mirrors) {
    if (!mirror.url || mirror.url.includes('YOUR_GDRIVE_FILE_ID')) continue;

    mainWindow.webContents.send('download-progress', {
      currentFile: `Connecting to ${mirror.name}...`,
      percent: 0,
      speed: ''
    });

    const chunks = [];
    try {
      await downloadWithRedirect(mirror.url, chunks, (prog) => {
        mainWindow.webContents.send('download-progress', {
          currentFile: `Downloading ${quality.toUpperCase()} Pack via ${mirror.name}`,
                                    percent: prog.percent,
                                    speed: prog.speed
        });
      });

      downloadedBuffer = Buffer.concat(chunks);
      break;
    } catch (err) {
      console.warn(`[Mirror Warning] ${mirror.name} failed:`, err.message);
      lastError = err;
    }
  }

  if (!downloadedBuffer) {
    return { success: false, error: lastError ? lastError.message : 'All download mirrors failed.' };
  }

  mainWindow.webContents.send('download-progress', {
    currentFile: 'Extracting documents...',
    percent: 99,
    speed: 'Extracting...'
  });

  try {
    extractZipBuffer(downloadedBuffer, storageDir);
    fs.writeFileSync(path.join(storageDir, '.quality'), quality, 'utf8');

    mainWindow.webContents.send('download-progress', {
      currentFile: 'Complete!',
      percent: 100,
      speed: ''
    });

    return { success: true };
  } catch (extractErr) {
    return { success: false, error: 'Extraction failed: ' + extractErr.message };
  }
});

// ================================================================
// ELECTRON INCREMENTAL DELTA UPDATER (OPT-IN, NON-BLOCKING)
// ================================================================
const UPDATE_REPO_OWNER = 'Nugget1252';
const UPDATE_REPO_NAME = 'Questionarytauri';
const UPDATE_BRANCHES = ['Electron', 'beta'];

function computeGitBlobSha(buf) {
  const header = Buffer.from(`blob ${buf.length}\0`, 'utf8');
  return crypto.createHash('sha1').update(header).update(buf).digest('hex');
}

function computeSha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function fetchBufferWithRedirect(url, timeoutMs = 12000) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    const req = client.get(url, {
      headers: {
        'User-Agent': 'Questionary-Desktop-Updater',
        'Accept': 'application/vnd.github+json, application/json, */*'
      }
    }, (res) => {
      if ([301, 302, 307, 308].includes(res.statusCode) && res.headers.location) {
        return fetchBufferWithRedirect(res.headers.location, timeoutMs).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    });
    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error('Request timeout'));
    });
    req.on('error', reject);
  });
}

async function fetchJsonOptional(url, timeoutMs = 8000) {
  try {
    const buf = await fetchBufferWithRedirect(url, timeoutMs);
    return JSON.parse(buf.toString('utf8'));
  } catch (e) {
    return null;
  }
}

const UPDATABLE_RENDERER_DIRS = ['css', 'js', 'fonts', 'assets'];
const UPDATABLE_RENDERER_FILES = new Set(['index.html', 'pdfviewer.html', 'manifest.json', 'sw.js']);
const BLOCKED_RENDERER_FILES = new Set(['js/admin.js', 'admin.html', 'admin-server.js', 'server.js', 'start.js', 'main.js', 'preload.js']);

function isUpdatableRendererPath(rel) {
  if (BLOCKED_RENDERER_FILES.has(rel)) return false;
  if (UPDATABLE_RENDERER_FILES.has(rel)) return true;
  return UPDATABLE_RENDERER_DIRS.some(dir => rel.startsWith(`${dir}/`));
}

function scanLocalRendererMap() {
  const root = getBundleRoot();
  const map = new Map();

  function addFile(rel, abs) {
    try {
      const buf = fs.readFileSync(abs);
      map.set(rel, {
        gitSha: computeGitBlobSha(buf),
        sha256: computeSha256(buf),
        size: buf.length
      });
    } catch (e) {}
  }

  for (const fname of UPDATABLE_RENDERER_FILES) {
    const p = path.join(root, fname);
    if (fs.existsSync(p)) addFile(fname, p);
  }
  const dbPath = path.join(root, 'questionary.db');
  if (fs.existsSync(dbPath)) addFile('questionary.db', dbPath);

  function walk(dir, relPrefix) {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      const rel = `${relPrefix}/${entry.name}`.replace(/\\/g, '/');
      if (entry.isDirectory()) walk(full, rel);
      else if (entry.isFile() && !BLOCKED_RENDERER_FILES.has(rel)) addFile(rel, full);
    }
  }

  for (const dir of UPDATABLE_RENDERER_DIRS) {
    walk(path.join(root, dir), dir);
  }

  return map;
}

function copyDirRecursive(src, dest) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else if (entry.isFile()) {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function ensureAppBundleSeeded() {
  const bundleDir = getAppBundleDir();
  const fpFile = path.join(bundleDir, '.bundle-source-fingerprint');
  const currentFp = getSourceDirectoryFingerprint();
  const existingFp = fs.existsSync(fpFile) ? fs.readFileSync(fpFile, 'utf8').trim() : '';

  if (existingFp === currentFp && fs.existsSync(path.join(bundleDir, 'index.html'))) {
    return bundleDir;
  }

  fs.mkdirSync(bundleDir, { recursive: true });
  const baseFiles = ['index.html', 'pdfviewer.html', 'manifest.json', 'sw.js', 'questionary.db', 'database.db', 'app-icon.png', 'sql-wasm.js', 'sql-wasm.wasm'];
  for (const f of baseFiles) {
    const src = path.join(__dirname, f);
    if (fs.existsSync(src)) fs.copyFileSync(src, path.join(bundleDir, f));
  }
  for (const d of ['css', 'js', 'fonts', 'assets', 'data']) {
    const srcDir = path.join(__dirname, d);
    if (fs.existsSync(srcDir)) copyDirRecursive(srcDir, path.join(bundleDir, d));
  }
  const strayAdminJs = path.join(bundleDir, 'js', 'admin.js');
  if (fs.existsSync(strayAdminJs)) {
    try { fs.unlinkSync(strayAdminJs); } catch (e) {}
  }
  fs.writeFileSync(path.join(bundleDir, '.bundle-app-version'), app.getVersion(), 'utf8');
  fs.writeFileSync(fpFile, currentFp, 'utf8');
  return bundleDir;
}

function isValidSqliteBuffer(buf) {
  if (!buf || buf.length < 100) return false;
  return buf.slice(0, 15).toString('utf8') === 'SQLite format 3';
}

ipcMain.handle('read-database-file', async () => {
  const root = getBundleRoot();
  const resPath = process.resourcesPath || __dirname;
  const candidates = Array.from(new Set([
    path.join(root, 'database.db'),
    path.join(root, 'questionary.db'),
    path.join(root, 'assets', 'database.db'),
    path.join(root, 'assets', 'questionary.db'),
    path.join(__dirname, 'database.db'),
    path.join(__dirname, 'questionary.db'),
    path.join(__dirname, 'assets', 'database.db'),
    path.join(__dirname, 'assets', 'questionary.db'),
    path.join(__dirname, 'www', 'questionary.db'),
    path.join(resPath, 'database.db'),
    path.join(resPath, 'questionary.db')
  ]));
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) {
        const buf = fs.readFileSync(p);
        if (isValidSqliteBuffer(buf)) {
          console.log(`[Main:IPC] Loaded valid SQLite database from: ${p} (${buf.length} bytes)`);
          return new Uint8Array(buf);
        } else {
          console.warn(`[Main:IPC] Skipping invalid SQLite header at: ${p}`);
        }
      }
    } catch (e) {
      console.warn(`[Main:IPC] Error reading database path ${p}: ${e.code || e.message}`);
    }
  }
  console.warn('[Main:IPC] No valid database file found across candidate paths:', candidates);
  return null;
});

ipcMain.handle('read-wasm-file', async () => {
  const root = getBundleRoot();
  const resPath = process.resourcesPath || __dirname;
  const candidates = Array.from(new Set([
    path.join(root, 'js', 'sql-wasm.wasm'),
    path.join(root, 'sql-wasm.wasm'),
    path.join(__dirname, 'js', 'sql-wasm.wasm'),
    path.join(__dirname, 'sql-wasm.wasm'),
    path.join(__dirname, 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm'),
    path.join(resPath, 'js', 'sql-wasm.wasm')
  ]));
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) {
        const buf = fs.readFileSync(p);
        if (buf && buf.length > 1000) {
          console.log(`[Main:IPC] Loaded sql-wasm.wasm from: ${p} (${buf.length} bytes)`);
          return new Uint8Array(buf);
        }
      }
    } catch (e) {
      console.warn(`[Main:IPC] Error reading WASM path ${p}: ${e.code || e.message}`);
    }
  }
  return null;
});

function collectLocalDocHashes(storageDir) {
  const manifestPath = storageDir ? path.join(storageDir, '.doc-manifest.json') : null;
  if (manifestPath && fs.existsSync(manifestPath)) {
    try {
      return JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    } catch (e) {}
  }
  return {};
}

ipcMain.handle('check-app-update', async (event, payload = {}) => {
  const storageDir = payload.storageDir || path.join(app.getPath('userData'), 'Questionary_PDFs');
  const localMap = scanLocalRendererMap();
  const docsDir = path.join(storageDir, 'documents');
  const bundledDocsDir = path.join(__dirname, 'documents');
  const hasOfflineDocs = fs.existsSync(docsDir) || fs.existsSync(bundledDocsDir);
  const savedDocHashes = collectLocalDocHashes(storageDir);
  const localSourceTimeMs = getLocalSourceTimestampMs();

  let selectedBranch = null;
  let treeData = null;
  let remoteManifest = null;
  let commitSha = null;
  let remoteCommitTimeMs = 0;

  for (const branch of UPDATE_BRANCHES) {
    const nonce = Date.now();
    const manifestCandidate = await fetchJsonOptional(
      `https://raw.githubusercontent.com/${UPDATE_REPO_OWNER}/${UPDATE_REPO_NAME}/${branch}/update-manifest.json?_nc=${nonce}`,
      6000
    );
    const commitMeta = await fetchJsonOptional(
      `https://api.github.com/repos/${UPDATE_REPO_OWNER}/${UPDATE_REPO_NAME}/commits/${branch}?_nc=${nonce}`,
      6000
    );
    const treeCandidate = await fetchJsonOptional(
      `https://api.github.com/repos/${UPDATE_REPO_OWNER}/${UPDATE_REPO_NAME}/git/trees/${branch}?recursive=1&_nc=${nonce}`,
      8000
    );

    if (manifestCandidate || (treeCandidate && Array.isArray(treeCandidate.tree))) {
      selectedBranch = branch;
      remoteManifest = manifestCandidate;
      treeData = treeCandidate;
      commitSha = commitMeta?.sha || treeCandidate?.sha || manifestCandidate?.commitSha || null;
      const dateStr = commitMeta?.commit?.committer?.date || commitMeta?.commit?.author?.date || manifestCandidate?.updatedAt || null;
      if (dateStr) {
        const parsed = Date.parse(dateStr);
        if (!isNaN(parsed)) remoteCommitTimeMs = parsed;
      }
      break;
    }
  }

  if (!selectedBranch) {
    return {
      available: false,
      upToDate: false,
      offline: true,
      error: 'Unable to reach update server.'
    };
  }

  // Prevent downgrading a newer local build with an older remote GitHub commit
  if (localSourceTimeMs > 0 && (remoteCommitTimeMs === 0 || remoteCommitTimeMs <= localSourceTimeMs + 60000)) {
    return {
      available: false,
      upToDate: true,
      version: app.getVersion(),
      branch: selectedBranch,
      commitSha
    };
  }

  const rawBase = `https://raw.githubusercontent.com/${UPDATE_REPO_OWNER}/${UPDATE_REPO_NAME}/${selectedBranch}`;
  const changedCodeFiles = [];
  const changedDbFiles = [];
  const changedDocs = [];
  let hasUiOrFeatureChange = false;
  let hasAssetChange = false;

  if (treeData && Array.isArray(treeData.tree)) {
    const treeEntries = treeData.tree.filter(item => item.type === 'blob');

    // Compare database.db first, or fallback to questionary.db
    const remoteDb = treeEntries.find(e => e.path === 'database.db') ||
                     treeEntries.find(e => e.path === 'questionary.db');
    if (remoteDb) {
      const localDb = localMap.get('questionary.db');
      if (!localDb || localDb.gitSha !== remoteDb.sha) {
        changedDbFiles.push({
          path: 'questionary.db',
          remotePath: remoteDb.path,
          sha: remoteDb.sha,
          size: remoteDb.size || 0,
          url: `${rawBase}/${remoteDb.path}`
        });
      }
    }

    // Compare renderer code/css/html/assets
    for (const entry of treeEntries) {
      const p = entry.path;
      if (isUpdatableRendererPath(p)) {
        const local = localMap.get(p);
        if (!local || local.gitSha !== entry.sha) {
          changedCodeFiles.push({
            path: p,
            sha: entry.sha,
            size: entry.size || 0,
            url: `${rawBase}/${p}`
          });
          if (p.startsWith('js/') || p.startsWith('css/') || p.endsWith('.html')) {
            hasUiOrFeatureChange = true;
          } else {
            hasAssetChange = true;
          }
        }
      } else if (hasOfflineDocs && /^documents\/[^/]+\.pdf$/i.test(p)) {
        const fname = path.basename(p);
        const localFile = fs.existsSync(path.join(docsDir, fname))
          ? path.join(docsDir, fname)
          : (fs.existsSync(path.join(bundledDocsDir, fname)) ? path.join(bundledDocsDir, fname) : null);

        let needsDoc = !localFile;
        if (localFile && savedDocHashes[fname] && savedDocHashes[fname] !== entry.sha) {
          needsDoc = true;
        } else if (localFile && !savedDocHashes[fname]) {
          try {
            const existingBuf = fs.readFileSync(localFile);
            if (computeGitBlobSha(existingBuf) !== entry.sha) {
              needsDoc = true;
            }
          } catch (e) {
            needsDoc = true;
          }
        }
        if (needsDoc) {
          changedDocs.push({
            filename: fname,
            path: p,
            sha: entry.sha,
            size: entry.size || 0,
            url: `${rawBase}/${encodeURI(p)}`
          });
        }
      }
    }
  } else if (remoteManifest && remoteManifest.files) {
    for (const [p, meta] of Object.entries(remoteManifest.files)) {
      if (p === 'database.db' || p === 'questionary.db') {
        const localDb = localMap.get('questionary.db');
        if (!localDb || (meta.sha256 && localDb.sha256 !== meta.sha256)) {
          changedDbFiles.push({
            path: 'questionary.db',
            remotePath: p,
            sha256: meta.sha256,
            size: meta.size || 0,
            url: meta.url || `${rawBase}/${p}`
          });
        }
      } else if (isUpdatableRendererPath(p)) {
        const local = localMap.get(p);
        if (!local || (meta.sha256 && local.sha256 !== meta.sha256)) {
          changedCodeFiles.push({
            path: p,
            sha256: meta.sha256,
            size: meta.size || 0,
            url: meta.url || `${rawBase}/${p}`
          });
          if (p.startsWith('js/') || p.startsWith('css/') || p.endsWith('.html')) hasUiOrFeatureChange = true;
          else hasAssetChange = true;
        }
      }
    }
  }

  // Plain-language changelog summaries for the user prompt
  const summaries = [];
  if (changedDocs.length > 0 && changedDbFiles.length > 0) {
    summaries.push(`New question papers and study catalog entries are being added (${changedDocs.length} new/updated PDF${changedDocs.length === 1 ? '' : 's'}).`);
  } else if (changedDocs.length > 0) {
    summaries.push(`New question papers are being added (${changedDocs.length} PDF${changedDocs.length === 1 ? '' : 's'}).`);
  } else if (changedDbFiles.length > 0) {
    summaries.push('New question papers and organized folders are being added to the catalog.');
  }

  if (hasUiOrFeatureChange) {
    summaries.push('New features, bug fixes, and interface improvements are being updated.');
  }
  if (hasAssetChange && !hasUiOrFeatureChange) {
    summaries.push('Offline fonts and visual assets are being refreshed.');
  }

  const allItems = [...changedDbFiles, ...changedCodeFiles, ...changedDocs];
  const totalBytes = allItems.reduce((sum, item) => sum + (item.size || 0), 0);
  const available = allItems.length > 0;

  return {
    available,
    upToDate: !available,
    version: remoteManifest?.version || (commitSha ? commitSha.slice(0, 7) : selectedBranch),
    branch: selectedBranch,
    commitSha,
    totalBytes,
    changedCodeFiles,
    changedDbFiles,
    changedDocs,
    summaries
  };
});

ipcMain.handle('apply-app-update', async (event, payload = {}) => {
  const plan = payload.plan;
  const storageDir = payload.storageDir || path.join(app.getPath('userData'), 'Questionary_PDFs');

  if (!plan || !plan.available) {
    return { success: false, error: 'No update plan provided' };
  }

  const sendProgress = (progressPayload) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update-progress', progressPayload);
    }
  };

  sendProgress({ percent: 4, phase: 'Preparing local update workspace...', completed: 0, total: 1, currentFile: '' });

  const bundleDir = ensureAppBundleSeeded();
  const docsDir = path.join(storageDir, 'documents');
  const queue = [
    ...(plan.changedDbFiles || []).map(f => ({ kind: 'db', item: f })),
    ...(plan.changedCodeFiles || []).map(f => ({ kind: 'code', item: f })),
    ...(plan.changedDocs || []).map(f => ({ kind: 'doc', item: f }))
  ];

  const total = Math.max(1, queue.length);
  let completed = 0;
  let dbUpdated = false;
  let codeUpdated = 0;
  let docsUpdated = 0;

  const docManifestPath = path.join(storageDir, '.doc-manifest.json');
  const docHashes = collectLocalDocHashes(storageDir);

  for (const task of queue) {
    const label = task.item.filename || task.item.path;
    const basePct = Math.round((completed / total) * 90) + 5;
    sendProgress({
      percent: Math.min(96, basePct),
      phase: task.kind === 'db'
        ? 'Updating question catalog database...'
        : task.kind === 'doc'
          ? 'Downloading new question papers...'
          : 'Updating app features & layout...',
      completed,
      total,
      currentFile: label
    });

    const buf = await fetchBufferWithRedirect(`${task.item.url}?_nc=${Date.now()}`, 25000);

    if (task.kind === 'db') {
      if (isValidSqliteBuffer(buf)) {
        const dbTarget = path.join(bundleDir, 'questionary.db');
        const dbTmp = `${dbTarget}.tmp`;
        fs.writeFileSync(dbTmp, buf);
        fs.renameSync(dbTmp, dbTarget);
        fs.writeFileSync(path.join(bundleDir, 'database.db'), buf);
        dbUpdated = true;
      }
    } else if (task.kind === 'code') {
      const safeRel = path.normalize(task.item.path).replace(/^(\.\.(\/|\\|$))+/, '');
      const destPath = path.join(bundleDir, safeRel);
      if (destPath.startsWith(bundleDir + path.sep)) {
        fs.mkdirSync(path.dirname(destPath), { recursive: true });
        const tmp = `${destPath}.tmp`;
        fs.writeFileSync(tmp, buf);
        fs.renameSync(tmp, destPath);
        codeUpdated++;
      }
    } else if (task.kind === 'doc') {
      const safeName = path.basename(task.item.filename);
      fs.mkdirSync(docsDir, { recursive: true });
      const destDoc = path.join(docsDir, safeName);
      const tmp = `${destDoc}.tmp`;
      fs.writeFileSync(tmp, buf);
      fs.renameSync(tmp, destDoc);
      docHashes[safeName] = task.item.sha || computeGitBlobSha(buf);
      docsUpdated++;
    }

    completed++;
    sendProgress({
      percent: Math.min(97, Math.round((completed / total) * 90) + 5),
      phase: 'Applying downloaded updates...',
      completed,
      total,
      currentFile: label
    });
  }

  if (docsUpdated > 0) {
    fs.mkdirSync(storageDir, { recursive: true });
    fs.writeFileSync(docManifestPath, JSON.stringify(docHashes, null, 2), 'utf8');
  }

  fs.writeFileSync(path.join(bundleDir, '.bundle-app-version'), app.getVersion(), 'utf8');
  fs.writeFileSync(path.join(bundleDir, '.bundle-source-fingerprint'), getSourceDirectoryFingerprint(), 'utf8');
  fs.writeFileSync(path.join(bundleDir, '.update-manifest.json'), JSON.stringify({
    updatedAt: new Date().toISOString(),
    version: plan.version,
    branch: plan.branch,
    commitSha: plan.commitSha
  }, null, 2), 'utf8');

  sendProgress({
    percent: 100,
    phase: 'Update complete! Launching updated Questionary...',
    completed: total,
    total,
    currentFile: ''
  });

  return {
    success: true,
    dbUpdated,
    codeUpdated,
    docsUpdated
  };
});

ipcMain.handle('reload-app', async () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    await mainWindow.loadFile(resolveRendererPath('index.html'));
    return true;
  }
  return false;
});
