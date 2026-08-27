const { app, BrowserWindow, ipcMain, dialog, protocol, net } = require('electron');
const path = require('path');
const fs = require('fs');
const https = require('https');
const http = require('http');
const { pipeline } = require('stream');

let mainWindow;
let activeDownloads = new Map(); // fileId -> { req, fileStream, aborted }
let isPaused = false;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true
    },
    icon: path.join(__dirname, 'assets/logo.png')
  });

  mainWindow.loadFile('index.html');
}

// Register custom safe protocol for serving local PDFs
app.whenReady().then(() => {
  protocol.handle('local-pdf', (request) => {
    const filePath = decodeURIComponent(request.url.replace('local-pdf://', ''));
    return net.fetch(`file://${filePath}`);
  });

  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ================================================================
// IPC HANDLERS: STORAGE & DOWNLOAD MANAGER
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
      } else if (entry.isFile() && !entry.name.endsWith('.part')) {
        totalBytes += fs.statSync(fullPath).size;
        fileCount++;
      }
    }
  }

  scanDir(storageDir);
  return { totalBytes, fileCount };
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
      } else if (entry.isFile() && !entry.name.endsWith('.part')) {
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

// Resilient Background File Downloader with Resume Capability
ipcMain.handle('start-downloads', async (event, { queue, storageDir }) => {
  isPaused = false;
  let completed = 0;
  const total = queue.length;
  let totalBytesDownloaded = 0;
  let lastSpeedCalcTime = Date.now();
  let bytesSinceLastCalc = 0;
  let currentSpeed = '0 KB/s';

  for (const item of queue) {
    if (isPaused) break;

    const destPath = path.join(storageDir, item.relativePath);
    const destDir = path.dirname(destPath);
    const partPath = destPath + '.part';

    if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });

    // Skip if already completely downloaded
    if (fs.existsSync(destPath)) {
      completed++;
      mainWindow.webContents.send('download-progress', {
        completedFiles: completed,
        totalFiles: total,
        currentFile: item.name,
        percent: Math.round((completed / total) * 100),
        speed: currentSpeed
      });
      continue;
    }

    let downloadedBytes = 0;
    if (fs.existsSync(partPath)) {
      downloadedBytes = fs.statSync(partPath).size;
    }

    await new Promise((resolve) => {
      const client = item.remoteUrl.startsWith('https') ? https : http;
      const headers = downloadedBytes > 0 ? { Range: `bytes=${downloadedBytes}-` } : {};

      const req = client.get(item.remoteUrl, { headers }, (res) => {
        // 200 = fresh start, 206 = partial content resume
        if (res.statusCode !== 200 && res.statusCode !== 206) {
          resolve();
          return;
        }

        const fileStream = fs.createWriteStream(partPath, { flags: downloadedBytes > 0 ? 'a' : 'w' });
        activeDownloads.set(item.id, { req, fileStream });

        res.on('data', (chunk) => {
          bytesSinceLastCalc += chunk.length;
          totalBytesDownloaded += chunk.length;

          const now = Date.now();
          if (now - lastSpeedCalcTime >= 1000) {
            const speedKBps = (bytesSinceLastCalc / 1024) / ((now - lastSpeedCalcTime) / 1000);
            currentSpeed = speedKBps > 1024 ? `${(speedKBps / 1024).toFixed(1)} MB/s` : `${Math.round(speedKBps)} KB/s`;
            bytesSinceLastCalc = 0;
            lastSpeedCalcTime = now;
          }

          mainWindow.webContents.send('download-progress', {
            completedFiles: completed,
            totalFiles: total,
            currentFile: item.name,
            percent: Math.round(((completed + (downloadedBytes / (res.headers['content-length'] || 1))) / total) * 100),
            speed: currentSpeed
          });
        });

        res.pipe(fileStream);

        fileStream.on('finish', () => {
          fileStream.close(() => {
            if (fs.existsSync(partPath)) {
              fs.renameSync(partPath, destPath);
            }
            completed++;
            activeDownloads.delete(item.id);
            resolve();
          });
        });

        fileStream.on('error', () => {
          activeDownloads.delete(item.id);
          resolve();
        });
      });

      req.on('error', () => resolve());
    });
  }

  return { success: true, completed, total };
});

ipcMain.handle('pause-downloads', () => {
  isPaused = true;
  for (const [id, download] of activeDownloads.entries()) {
    try {
      download.req.destroy();
      download.fileStream.close();
    } catch (e) {}
  }
  activeDownloads.clear();
  return true;
});
