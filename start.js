const { spawn, spawnSync, exec } = require('child_process');
const fs = require('fs');
const path = require('path');

const hasGuiDisplay =
  process.platform === 'win32' ||
  process.platform === 'darwin' ||
  Boolean(process.env.DISPLAY || process.env.WAYLAND_DISPLAY);

const isHostedOrHeadless =
  process.argv.includes('--server') ||
  process.env.HEADLESS === '1' ||
  Boolean(process.env.PORT || process.env.K_SERVICE || process.env.CLOUD_RUN_JOB || process.env.CI);

function resolveElectronBinary() {
  let pkgJsonPath = null;
  try {
    pkgJsonPath = require.resolve('electron/package.json');
  } catch (e) {
    return null;
  }

  try {
    const electronPath = require('electron');
    if (typeof electronPath === 'string' && fs.existsSync(electronPath)) {
      return electronPath;
    }
  } catch (err) {
    // pnpm v10+ blocks postinstall scripts by default unless approved, leaving electron/dist missing.
    const installScript = path.join(path.dirname(pkgJsonPath), 'install.js');
    if (fs.existsSync(installScript)) {
      console.log('[Questionary] Electron binary missing (build script was skipped). Downloading Electron now...');
      const res = spawnSync(process.execPath, [installScript], {
        cwd: path.dirname(pkgJsonPath),
        stdio: 'inherit'
      });
      if (res.status === 0) {
        try {
          delete require.cache[require.resolve('electron')];
          const downloadedPath = require('electron');
          if (typeof downloadedPath === 'string' && fs.existsSync(downloadedPath)) {
            return downloadedPath;
          }
        } catch (retryErr) {
          console.warn('[Questionary] Electron still unavailable after install:', retryErr.message);
        }
      } else {
        console.warn('[Questionary] Electron binary download failed. Run "pnpm approve-builds" and select electron.');
      }
    } else {
      console.warn('[Questionary] Electron load error:', err.message);
    }
  }
  return null;
}

function openBrowser(url) {
  if (!hasGuiDisplay || isHostedOrHeadless) return;
  const cmd =
    process.platform === 'darwin'
      ? `open "${url}"`
      : process.platform === 'win32'
        ? `cmd /c start "" "${url}"`
        : `xdg-open "${url}"`;
  exec(cmd, () => {});
}

const isAdminMode = process.argv.includes('admin') || process.argv.includes('--admin');

if (isAdminMode) {
  const adminHost = process.env.ADMIN_HOST || '127.0.0.1';
  const adminPort = parseInt(process.env.ADMIN_PORT || '4100', 10);
  const adminApp = require('./admin-server.js');
  adminApp.listen(adminPort, adminHost, () => {
    const adminUrl = `http://${adminHost}:${adminPort}`;
    console.log(`[Questionary Admin] Dedicated Admin Portal running on ${adminUrl}`);
    console.log(`[Questionary Admin] Student site link target: ${process.env.STUDENT_SITE_URL || 'http://localhost:3000'}`);
    if (!isHostedOrHeadless && hasGuiDisplay) {
      setTimeout(() => openBrowser(adminUrl), 400);
    }
  });
} else {
  const electronBin = !isHostedOrHeadless && hasGuiDisplay ? resolveElectronBinary() : null;

  if (electronBin) {
  const childEnv = { ...process.env };
  delete childEnv.ELECTRON_RUN_AS_NODE;

  const child = spawn(electronBin, ['.'], {
    cwd: __dirname,
    env: childEnv,
    stdio: 'inherit'
  });

  child.on('exit', (code, signal) => {
    if (signal) process.kill(process.pid, signal);
    process.exit(code ?? 0);
  });

  child.on('error', (err) => {
    console.error('[Questionary] Failed to launch Electron:', err.message);
    console.log('[Questionary] Falling back to local web server...');
    require('./server.js');
    openBrowser('http://localhost:3000');
  });
  } else {
    require('./server.js');
    if (!isHostedOrHeadless && hasGuiDisplay) {
      setTimeout(() => openBrowser('http://localhost:3000'), 600);
    }
  }
}
