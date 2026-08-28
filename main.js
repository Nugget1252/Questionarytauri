const { app, BrowserWindow, ipcMain, dialog, protocol, net, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const https = require('https');
const http = require('http');
const zlib = require('zlib');

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

// Disable Default Application Menu bar completely
Menu.setApplicationMenu(null);

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true,
      devTools: false // Disables DevTools / Inspect Element
    },
    icon: path.join(__dirname, 'assets/logo.png')
  });

  mainWindow.setMenuBarVisibility(false);
  mainWindow.loadFile('index.html');

  // Block Keyboard Shortcuts for Inspect Element & View Source (F12, Ctrl+Shift+I, Ctrl+U)
  mainWindow.webContents.on('before-input-event', (event, input) => {
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
// REGISTER SAFE PROTOCOL HANDLER FOR LOCAL DOWNLOADED PDFS
// ================================================================
app.whenReady().then(() => {
  protocol.handle('local-pdf', (request) => {
    // Decode percent-encoded spaces and special characters
    let decoded = decodeURIComponent(request.url.replace(/^local-pdf:\/\//, ''));

    // Automatically eliminate duplicate 'documents/documents/' if present in path
    decoded = decoded.replace(/\/documents\/documents\//g, '/documents/');

    // Ensure leading slash remains intact on Linux and macOS
    if (process.platform !== 'win32' && !decoded.startsWith('/')) {
      decoded = '/' + decoded;
    }

    return net.fetch(`file://${decoded}`);
  });

  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
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

ipcMain.handle('save-user-library-file', async (event, { blobId, storageDir, buffer }) => {
  const libDir = path.join(storageDir, 'user_library_files');
  if (!fs.existsSync(libDir)) fs.mkdirSync(libDir, { recursive: true });
  fs.writeFileSync(path.join(libDir, `${blobId}.bin`), Buffer.from(buffer));
  return true;
});

ipcMain.handle('get-user-library-file', async (event, { blobId, storageDir }) => {
  const target = path.join(storageDir, 'user_library_files', `${blobId}.bin`);
  if (fs.existsSync(target)) {
    return fs.readFileSync(target);
  }
  return null;
});

ipcMain.handle('delete-user-library-file', async (event, { blobId, storageDir }) => {
  const target = path.join(storageDir, 'user_library_files', `${blobId}.bin`);
  if (fs.existsSync(target)) {
    try { fs.unlinkSync(target); } catch(e) {}
  }
  return true;
});

// ================================================================
// PURE NATIVE ZIP EXTRACTION (Zero external dependencies)
// ================================================================

function extractZipBuffer(zipBuffer, targetDir) {
  let offset = 0;
  while (offset < zipBuffer.length - 4) {
    const sig = zipBuffer.readUInt32LE(offset);
    if (sig !== 0x04034b50) break; // Local file header signature

    const compMethod = zipBuffer.readUInt16LE(offset + 8);
    const compSize = zipBuffer.readUInt32LE(offset + 18);
    const uncompSize = zipBuffer.readUInt32LE(offset + 22);
    const nameLen = zipBuffer.readUInt16LE(offset + 26);
    const extraLen = zipBuffer.readUInt16LE(offset + 28);

    const fileName = zipBuffer.toString('utf8', offset + 30, offset + 30 + nameLen);
    const dataStart = offset + 30 + nameLen + extraLen;
    const rawData = zipBuffer.subarray(dataStart, dataStart + compSize);

    const outPath = path.join(targetDir, fileName);

    if (fileName.endsWith('/')) {
      if (!fs.existsSync(outPath)) fs.mkdirSync(outPath, { recursive: true });
    } else {
      const parentDir = path.dirname(outPath);
      if (!fs.existsSync(parentDir)) fs.mkdirSync(parentDir, { recursive: true });

      if (compMethod === 0) {
        // Stored (Uncompressed)
        fs.writeFileSync(outPath, rawData);
      } else if (compMethod === 8) {
        // Deflated (Standard ZIP compression)
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
      // Follow HTTP 301, 302, 307, 308 redirects (GitHub Releases redirect to AWS S3 & Google Drive)
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
      break; // Download succeeded!
    } catch (err) {
      console.warn(`[Mirror Warning] ${mirror.name} failed:`, err.message);
      lastError = err;
    }
  }

  if (!downloadedBuffer) {
    return { success: false, error: lastError ? lastError.message : 'All download mirrors failed.' };
  }

  // Extract the zip archive in memory to destination
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