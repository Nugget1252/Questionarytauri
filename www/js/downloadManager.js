// js/downloadManager.js
(function () {
  'use strict';

  function escapeHtml(text) {
    if (text === null || text === undefined) return '';
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatSize(bytes) {
    if (!bytes || bytes <= 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
    return (bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1) + ' ' + units[i];
  }

  const DownloadManager = {
    storagePath: '',
    qualityProfile: 'sd', // 'sd' | 'hd'
    hasDocuments: false,
    isDownloading: false,
    preflightResults: null,

    // GitHub Release configuration
    repoOwner: 'Nugget1252',
    repoName: 'Questionarytauri',
    releaseTag: 'v0.9.8',

    async init() {
      this.qualityProfile = localStorage.getItem('questionary-quality-profile') || 'sd';

      if (window.electronAPI && typeof window.electronAPI.getDefaultStoragePath === 'function') {
        try {
          this.storagePath = localStorage.getItem('questionary-storage-path') || await window.electronAPI.getDefaultStoragePath();
        } catch (e) {
          this.storagePath = 'Local Storage';
        }
      } else if (window.Capacitor) {
        this.storagePath = localStorage.getItem('questionary-storage-path') || 'App Internal Storage (IndexedDB)';
      } else {
        this.storagePath = localStorage.getItem('questionary-storage-path') || 'IndexedDB Offline Cache';
      }

      localStorage.setItem('questionary-storage-path', this.storagePath);

      await this.refreshHasDocumentsState();

      this.setupProgressListener();
      this.renderSettingsStorageTab();
      this.renderOfflineDiagnosticsPanel();

      window.addEventListener('questionary:connectivity', () => {
        this.renderOfflineDiagnosticsPanel();
      });

      // Automatically open Setup Wizard only in Electron when no documents exist locally and setup is not marked complete
      if (window.electronAPI && !this.hasDocuments && !localStorage.getItem('questionary-setup-complete')) {
        setTimeout(() => this.openSetupWizard(), 300);
      }
    },

    async refreshHasDocumentsState() {
      if (window.electronAPI && typeof window.electronAPI.checkDocumentsExist === 'function') {
        try {
          this.hasDocuments = await window.electronAPI.checkDocumentsExist(this.storagePath);
          return this.hasDocuments;
        } catch (e) {
          this.hasDocuments = localStorage.getItem('questionary-docs-installed') === 'true';
          return this.hasDocuments;
        }
      }

      if (window.OfflineEngine) {
        const stats = await window.OfflineEngine.getStats();
        if (stats.fileCount > 0) {
          this.hasDocuments = true;
          localStorage.setItem('questionary-docs-installed', 'true');
          return true;
        }
      }

      if (typeof fetch === 'function' && window.location && window.location.protocol !== 'file:') {
        try {
          const res = await fetch('/api/stats', { cache: 'no-cache' });
          if (res && res.ok) {
            const st = await res.json();
            if (st && st.totalPapers > 0) {
              this.hasDocuments = true;
              return true;
            }
          }
        } catch (e) {}
      }

      this.hasDocuments = localStorage.getItem('questionary-docs-installed') === 'true';
      return this.hasDocuments;
    },

    setupProgressListener() {
      if (window.electronAPI && typeof window.electronAPI.onDownloadProgress === 'function') {
        window.electronAPI.onDownloadProgress((data) => {
          this.updateLiveProgressUI(data);
        });
      }
    },

    updateLiveProgressUI(data) {
      const banner = document.getElementById('globalDownloadBanner');
      if (!banner) return;

      banner.style.display = 'flex';
      const fileEl = document.getElementById('dlCurrentFile');
      const percentEl = document.getElementById('dlPercent');
      const speedEl = document.getElementById('dlSpeed');
      const fillEl = document.getElementById('dlProgressBarFill');

      if (fileEl) fileEl.textContent = data.currentFile || 'Downloading...';
      if (percentEl) percentEl.textContent = `${data.percent}%`;
      if (speedEl) speedEl.textContent = data.speed || '';
      if (fillEl) fillEl.style.width = `${data.percent}%`;

      if (data.percent >= 100) {
        setTimeout(() => {
          banner.style.display = 'none';
          this.hasDocuments = true;
          localStorage.setItem('questionary-docs-installed', 'true');
          this.renderSettingsStorageTab();
          this.renderOfflineDiagnosticsPanel();
          if (typeof window.renderTiles === 'function') window.renderTiles();
          if (typeof window.showNotification === 'function') {
            window.showNotification('Documents downloaded and cached for offline use!', 'success');
          }
        }, 1200);
      }
    },

    // ============================================
    // FIRST-TIME ONBOARDING SETUP WIZARD
    // ============================================
    openSetupWizard() {
      const modal = document.getElementById('setupWizardModal');
      if (!modal) return;

      const pathInput = document.getElementById('wizardStoragePath');
      if (pathInput) pathInput.value = this.storagePath;

      this.selectWizardQuality(this.qualityProfile);
      modal.classList.add('active');
    },

    selectWizardQuality(quality) {
      this.qualityProfile = quality;
      document.getElementById('wizardCardSD')?.classList.toggle('active', quality === 'sd');
      document.getElementById('wizardCardHD')?.classList.toggle('active', quality === 'hd');

      const radioSD = document.querySelector('input[name="wizardQuality"][value="sd"]');
      const radioHD = document.querySelector('input[name="wizardQuality"][value="hd"]');
      if (radioSD) radioSD.checked = (quality === 'sd');
      if (radioHD) radioHD.checked = (quality === 'hd');
    },

    async handleBrowseFolder(inputId) {
      if (window.electronAPI && typeof window.electronAPI.selectStorageFolder === 'function') {
        try {
          const selected = await window.electronAPI.selectStorageFolder();
          if (selected) {
            const el = document.getElementById(inputId);
            if (el) el.value = selected;
          }
        } catch (err) {
          console.warn('[DownloadManager] Folder selection canceled or failed:', err);
        }
      } else {
        if (typeof window.showNotification === 'function') {
          window.showNotification('Offline cache is managed automatically in persistent IndexedDB on this platform.', 'info');
        }
      }
    },

    async saveAndStartInitialDownload() {
      const qualityEl = document.querySelector('input[name="wizardQuality"]:checked');
      const selectedQuality = qualityEl ? qualityEl.value : this.qualityProfile || 'sd';
      const chosenPath = document.getElementById('wizardStoragePath')?.value.trim() || this.storagePath;

      this.qualityProfile = selectedQuality;
      this.storagePath = chosenPath;

      localStorage.setItem('questionary-quality-profile', selectedQuality);
      localStorage.setItem('questionary-storage-path', chosenPath);
      localStorage.setItem('questionary-setup-complete', 'true');

      document.getElementById('setupWizardModal')?.classList.remove('active');

      await this.startFullPackDownload();
    },

    // ============================================
    // REAL WEB / CAPACITOR & ELECTRON PACK CACHING
    // ============================================
    async _getBrowserCatalogList(subjectFilter = null) {
      // Prefer express catalog API if reachable
      try {
        const res = await fetch('/api/documents');
        if (res.ok) {
          const payload = await res.json();
          if (payload && Array.isArray(payload.documents) && payload.documents.length > 0) {
            let docs = payload.documents;
            if (subjectFilter) {
              docs = docs.filter((d) => (d.subject || '').toLowerCase() === subjectFilter.toLowerCase());
            }
            return docs.map((d) => ({
              relPath: d.filename,
              url: (this.qualityProfile === 'hd' && d.hasHD && d.hdPath) ? d.hdPath : d.path,
              subject: d.subject || 'General',
              filename: d.filename,
              size: d.size || 0
            }));
          }
        }
      } catch (e) {}

      // Fallback: extract file nodes from local SQLite database (zero server required)
      if (window.DbService && typeof window.DbService.query === 'function' && !window.DbService.isFallback) {
        try {
          const rows = await window.DbService.query(
            "SELECT name, file_path FROM nodes WHERE is_folder = 0 AND file_path IS NOT NULL AND file_path != '#' AND file_path != ''"
          );
          if (Array.isArray(rows) && rows.length > 0) {
            const seen = new Set();
            const out = [];
            for (const row of rows) {
              const raw = String(row.file_path || '');
              if (raw.startsWith('http://') || raw.startsWith('https://') || raw.startsWith('blob:')) continue;
              const rel = raw.replace(/^(\.\/|\/)?(documents\/)+/i, '');
              if (!rel || seen.has(rel)) continue;
              seen.add(rel);
              out.push({
                relPath: rel,
                url: `documents/${rel}`,
                subject: row.name || 'Study Paper',
                filename: rel.split('/').pop(),
                size: 0
              });
            }
            return out;
          }
        } catch (e) {}
      }

      return [];
    },

    async startFullPackDownload(subjectFilter = null) {
      if (this.isDownloading) {
        if (typeof window.showNotification === 'function') {
          window.showNotification('Download already in progress...', 'info');
        }
        return;
      }

      if (window.OfflineEngine && !window.OfflineEngine.isOnline()) {
        if (typeof window.showNotification === 'function') {
          window.showNotification('You are currently offline. Connect to the internet to download study packs.', 'warning');
        }
        return;
      }

      this.isDownloading = true;

      if (window.electronAPI && typeof window.electronAPI.downloadFullPack === 'function' && !subjectFilter) {
        try {
          const result = await window.electronAPI.downloadFullPack({
            quality: this.qualityProfile,
            storageDir: this.storagePath,
            repoOwner: this.repoOwner,
            repoName: this.repoName,
            releaseTag: this.releaseTag
          });

          if (!result.success) {
            if (typeof window.showNotification === 'function') {
              window.showNotification('Download failed: ' + result.error, 'error');
            }
          } else {
            this.hasDocuments = true;
            localStorage.setItem('questionary-docs-installed', 'true');
            this.renderSettingsStorageTab();
            this.renderOfflineDiagnosticsPanel();
            if (typeof window.renderTiles === 'function') window.renderTiles();
          }
        } finally {
          this.isDownloading = false;
        }
        return;
      }

      // Real Browser / PWA / Capacitor IndexedDB Batch Caching
      const banner = document.getElementById('globalDownloadBanner');
      try {
        if (window.OfflineEngine) {
          await window.OfflineEngine.requestPersistentStorage();
        }

        const list = await this._getBrowserCatalogList(subjectFilter);
        if (!list.length) {
          throw new Error('No downloadable study catalog found on this origin.');
        }

        if (banner) banner.style.display = 'flex';
        const fileEl = document.getElementById('dlCurrentFile');
        const percentEl = document.getElementById('dlPercent');
        const speedEl = document.getElementById('dlSpeed');
        const fillEl = document.getElementById('dlProgressBarFill');

        let completed = 0;
        let cachedNew = 0;
        let downloadedBytes = 0;
        const startTime = Date.now();
        const total = list.length;
        const CONCURRENCY = 5;
        let index = 0;

        const updateBanner = (label) => {
          const pct = Math.min(99, Math.round((completed / total) * 100));
          const elapsedSec = Math.max(0.2, (Date.now() - startTime) / 1000);
          const bps = downloadedBytes / elapsedSec;
          const speedText = bps > 0 ? `${formatSize(bps)}/s` : '';
          if (fileEl) fileEl.textContent = label;
          if (percentEl) percentEl.textContent = `${pct}%`;
          if (speedEl) speedEl.textContent = speedText;
          if (fillEl) fillEl.style.width = `${pct}%`;
        };

        const worker = async () => {
          while (index < list.length) {
            const item = list[index++];
            try {
              const alreadyCached = window.OfflineEngine && await window.OfflineEngine.hasPdf(item.relPath);
              if (!alreadyCached) {
                const { byteLength } = await window.OfflineEngine.fetchAndCachePdf(item.url, {
                  subject: item.subject,
                  quality: this.qualityProfile,
                  filename: item.filename
                });
                downloadedBytes += byteLength || item.size || 0;
                cachedNew++;
              }
            } catch (err) {
              console.warn('[DownloadManager] Skipped:', item.relPath, err.message);
            }
            completed++;
            updateBanner(`Caching (${completed}/${total}): ${item.subject}`);
          }
        };

        await Promise.all(Array.from({ length: Math.min(CONCURRENCY, list.length) }, () => worker()));

        if (percentEl) percentEl.textContent = '100%';
        if (fillEl) fillEl.style.width = '100%';
        if (fileEl) fileEl.textContent = `Cached ${completed} offline documents (${formatSize(downloadedBytes)} downloaded)`;

        this.hasDocuments = true;
        localStorage.setItem('questionary-docs-installed', 'true');

        setTimeout(() => {
          if (banner) banner.style.display = 'none';
          this.renderSettingsStorageTab();
          this.renderOfflineDiagnosticsPanel();
          if (typeof window.renderTiles === 'function') window.renderTiles();
          if (typeof window.showNotification === 'function') {
            window.showNotification(
              cachedNew > 0
                ? `Cached ${cachedNew} new document(s) for offline access.`
                : 'All study documents are already cached offline.',
              'success'
            );
          }
        }, 900);
      } catch (err) {
        if (banner) banner.style.display = 'none';
        console.error('[DownloadManager Error]:', err);
        if (typeof window.showNotification === 'function') {
          window.showNotification('Offline caching error: ' + err.message, 'error');
        }
      } finally {
        this.isDownloading = false;
      }
    },

    // ============================================
    // UNIVERSAL DOCUMENT PATH RESOLUTION
    // ============================================
    resolveDocumentUrl(dbFilePath) {
      if (!dbFilePath || dbFilePath === '#' || dbFilePath === '') return dbFilePath;
      if (
        dbFilePath.startsWith('blob:') ||
        dbFilePath.startsWith('data:') ||
        dbFilePath.startsWith('http://') ||
        dbFilePath.startsWith('https://') ||
        dbFilePath.startsWith('capacitor:') ||
        dbFilePath.startsWith('local-pdf:')
      ) {
        return dbFilePath;
      }

      const cleanPath = dbFilePath.replace(/^\/+/, '').replace(/\\/g, '/');

      // Electron Desktop custom protocol handler
      if (window.electronAPI) {
        const cleanStorage = this.storagePath.replace(/\\/g, '/').replace(/\/+$/, '');
        const fullPath = `${cleanStorage}/documents/${cleanPath}`;
        return `local-pdf://${fullPath}`;
      }

      // Android / Capacitor / Browser WebView standard local URL resolution
      try {
        if (cleanPath.startsWith('documents/')) {
          return new URL(cleanPath, window.location.href).href;
        }
        return new URL(`documents/${cleanPath}`, window.location.href).href;
      } catch (e) {
        return `documents/${cleanPath}`;
      }
    },

    async resolveDocumentUrlAsync(dbFilePath) {
      const syncUrl = this.resolveDocumentUrl(dbFilePath);
      if (!syncUrl || window.electronAPI) return syncUrl;
      if (syncUrl.startsWith('blob:') || syncUrl.startsWith('data:') || syncUrl.startsWith('blob-id:')) {
        return syncUrl;
      }

      if (window.OfflineEngine) {
        const cachedObjectUrl = await window.OfflineEngine.getPdfObjectUrl(dbFilePath);
        if (cachedObjectUrl) {
          return cachedObjectUrl;
        }

        // Opportunistically cache opened PDF in background if online
        if (window.OfflineEngine.isOnline()) {
          window.OfflineEngine.fetchAndCachePdf(syncUrl, {
            quality: this.qualityProfile
          }).catch(() => {});
        }
      }

      return syncUrl;
    },

    async clearOfflineCache() {
      if (!window.OfflineEngine) return;
      const ok = typeof window.showConfirm === 'function'
        ? await window.showConfirm('Clear all browser-cached offline PDFs? Your notes, highlights, and flashcards will remain intact.')
        : window.confirm('Clear all browser-cached offline PDFs?');
      if (!ok) return;

      await window.OfflineEngine.clearAllCachedPdfs();
      this.hasDocuments = false;
      localStorage.removeItem('questionary-docs-installed');
      this.renderSettingsStorageTab();
      await this.runAndRenderPreflight();
      if (typeof window.showNotification === 'function') {
        window.showNotification('Offline PDF cache cleared.', 'info');
      }
    },

    async requestPersistentStorageNow() {
      if (!window.OfflineEngine) return;
      const granted = await window.OfflineEngine.requestPersistentStorage();
      await this.runAndRenderPreflight();
      if (typeof window.showNotification === 'function') {
        window.showNotification(
          granted
            ? 'Browser persistent storage granted — offline PDFs are protected against eviction.'
            : 'Browser manages storage quota automatically on this origin.',
          granted ? 'success' : 'info'
        );
      }
    },

    // ============================================
    // SETTINGS STORAGE MANAGER TAB
    // ============================================
    async renderSettingsStorageTab() {
      const container = document.getElementById('settingsStoragePanel');
      if (!container) return;

      let usedMB = '0.0';
      let docsStatus = 'No offline documents cached yet';
      let fileCount = 0;

      if (window.electronAPI && typeof window.electronAPI.getStorageStats === 'function') {
        try {
          const stats = await window.electronAPI.getStorageStats(this.storagePath);
          usedMB = (stats.totalBytes / (1024 * 1024)).toFixed(1);
          docsStatus = stats.fileCount > 0 ? `${stats.fileCount} local documents installed` : 'No documents installed yet';
          fileCount = stats.fileCount;
        } catch (e) {}
      } else if (window.OfflineEngine) {
        const stats = await window.OfflineEngine.getStats();
        usedMB = (stats.totalBytes / (1024 * 1024)).toFixed(1);
        fileCount = stats.fileCount;
        docsStatus = fileCount > 0 ? `${fileCount} PDFs cached in IndexedDB` : 'No offline PDFs cached yet';
      }

      const isElectron = Boolean(window.electronAPI);

      container.innerHTML = `
        <div class="storage-stats-card" style="background: var(--hover); border: 1px solid var(--line); border-radius: 10px; padding: 1rem; margin-top: 0.5rem;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem; gap: 12px;">
            <div>
              <div style="font-size: 1.25rem; font-weight: 700; color: var(--fg); font-variant-numeric: tabular-nums;">${escapeHtml(usedMB)} MB</div>
              <div style="font-size: 0.78rem; color: var(--fg3); font-variant-numeric: tabular-nums;">${escapeHtml(docsStatus)}</div>
            </div>
            <span class="pack-status-badge ${fileCount > 0 ? 'downloaded' : ''}" style="padding: 4px 10px; border-radius: 6px; font-size: 0.75rem; font-weight: 600; background: ${fileCount > 0 ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)'}; color: ${fileCount > 0 ? '#22c55e' : '#ef4444'}; white-space: nowrap;">
              ${fileCount > 0 ? '<i class="fas fa-check"></i> Offline Ready' : '<i class="fas fa-exclamation-triangle"></i> Not Cached'}
            </span>
          </div>

          <div style="display: flex; gap: 8px; margin-bottom: 1rem;">
            <input type="text" id="settingsStorageInput" class="form-input" value="${escapeHtml(this.storagePath)}" readonly style="flex: 1;">
            <button class="btn btn-secondary btn-sm" type="button" onclick="window.DownloadManager.relocateStorageFolder()">
              <i class="fas fa-folder-open"></i> ${isElectron ? 'Browse' : 'Storage Info'}
            </button>
          </div>

          <div style="margin-bottom: 1rem;">
            <label class="form-label" style="margin-bottom: 0.4rem;">Document Quality Profile</label>
            <div class="quality-grid">
              <label class="quality-card ${this.qualityProfile === 'sd' ? 'active' : ''}" onclick="window.DownloadManager.switchQuality('sd')">
                <input type="radio" name="settingsQuality" value="sd" ${this.qualityProfile === 'sd' ? 'checked' : ''} style="display:none;">
                <div class="quality-card-header">
                  <div class="quality-card-icon sd"><i class="fas fa-bolt"></i></div>
                  <div class="quality-radio-circle"><i class="fas fa-check"></i></div>
                </div>
                <strong class="quality-title">Standard (SD)</strong>
                <span class="quality-desc">Compressed files for faster caching</span>
                <div class="quality-badge">~150 MB Total</div>
              </label>

              <label class="quality-card ${this.qualityProfile === 'hd' ? 'active' : ''}" onclick="window.DownloadManager.switchQuality('hd')">
                <input type="radio" name="settingsQuality" value="hd" ${this.qualityProfile === 'hd' ? 'checked' : ''} style="display:none;">
                <div class="quality-card-header">
                  <div class="quality-card-icon hd"><i class="fas fa-gem"></i></div>
                  <div class="quality-radio-circle"><i class="fas fa-check"></i></div>
                </div>
                <strong class="quality-title">High-Definition (HD)</strong>
                <span class="quality-desc">Vector-crisp text & high-res diagrams</span>
                <div class="quality-badge hd">~500 MB Total</div>
              </label>
            </div>
          </div>

          <div style="display: flex; flex-wrap: wrap; gap: 8px;">
            <button class="btn btn-primary btn-sm" type="button" onclick="window.DownloadManager.startFullPackDownload()" style="flex: 1; min-width: 190px;">
              <i class="fas fa-cloud-download-alt"></i> ${fileCount > 0 ? 'Sync / Cache All Offline PDFs' : 'Download & Cache All PDFs'}
            </button>
            ${!isElectron && fileCount > 0 ? `
              <button class="btn btn-secondary btn-sm" type="button" onclick="window.DownloadManager.clearOfflineCache()">
                <i class="fas fa-trash-alt"></i> Clear PDF Cache
              </button>
            ` : ''}
          </div>
        </div>
      `;
    },

    // ============================================
    // OFFLINE READINESS PREFLIGHT DIAGNOSTICS
    // ============================================
    async runAndRenderPreflight() {
      if (window.OfflineEngine && typeof window.OfflineEngine.runPreflightCheck === 'function') {
        this.preflightResults = await window.OfflineEngine.runPreflightCheck();
      }
      this.renderOfflineDiagnosticsPanel();
    },

    async renderOfflineDiagnosticsPanel() {
      const container = document.getElementById('offlineDiagnosticsPanel');
      if (!container) return;

      if (!this.preflightResults && window.OfflineEngine) {
        this.preflightResults = await window.OfflineEngine.runPreflightCheck();
      }

      const checks = this.preflightResults || [];
      const passedCount = checks.filter((c) => c.ok).length;
      const online = window.OfflineEngine ? window.OfflineEngine.isOnline() : true;
      const pwaState = window.OfflineEngine ? window.OfflineEngine.getPwaState() : {};
      const showPwaInstall = !pwaState.isInstalled && (pwaState.isInstallable || pwaState.isIOS);

      const rowsHtml = checks.map((item) => `
        <div class="diag-check-row">
          <div class="diag-check-main">
            <span class="diag-check-title">${escapeHtml(item.label)}</span>
            <span class="diag-check-detail">${escapeHtml(item.detail)}</span>
          </div>
          <span class="diag-check-state ${item.ok ? 'ok' : 'warn'}">
            <i class="fas ${item.ok ? 'fa-check-circle' : 'fa-exclamation-circle'}"></i>
            <span>${item.ok ? 'Ready' : 'Action Needed'}</span>
          </span>
        </div>
      `).join('');

      container.innerHTML = `
        <div class="diag-summary-strip">
          <span class="diag-summary-meta">
            ${online ? '<i class="fas fa-wifi"></i> Connected' : '<i class="fas fa-wifi-slash"></i> Offline Mode'}
            <span aria-hidden="true">·</span>
            <span class="tabular-nums">${passedCount}/${checks.length} offline checks ready</span>
          </span>
          <div class="diag-summary-actions">
            ${showPwaInstall ? `
              <button type="button" class="btn btn-primary btn-sm" id="pwaInstallSettingsBtn" onclick="window.OfflineEngine.triggerInstall()">
                <i class="fas fa-download"></i> <span class="pwa-install-label">${pwaState.isIOS ? 'Install on iOS' : 'Install App'}</span>
              </button>
            ` : ''}
            ${!window.electronAPI ? `
              <button type="button" class="btn btn-secondary btn-sm" onclick="window.DownloadManager.requestPersistentStorageNow()">
                <i class="fas fa-lock"></i> Lock Storage
              </button>
            ` : ''}
            <button type="button" class="btn btn-secondary btn-sm" onclick="window.DownloadManager.runAndRenderPreflight()">
              <i class="fas fa-stethoscope"></i> Re-check
            </button>
          </div>
        </div>
        <div class="diag-check-list">
          ${rowsHtml}
        </div>
      `;
    },

    async switchQuality(newQuality) {
      this.qualityProfile = newQuality;
      localStorage.setItem('questionary-quality-profile', newQuality);
      this.renderSettingsStorageTab();
      if (typeof window.showNotification === 'function') {
        window.showNotification(`Quality set to ${newQuality.toUpperCase()}. Click "Sync / Cache All Offline PDFs" to apply.`, 'info');
      }
    },

    async relocateStorageFolder() {
      if (window.electronAPI && typeof window.electronAPI.selectStorageFolder === 'function') {
        const selected = await window.electronAPI.selectStorageFolder();
        if (selected && selected !== this.storagePath) {
          this.storagePath = selected;
          localStorage.setItem('questionary-storage-path', selected);
          this.hasDocuments = await window.electronAPI.checkDocumentsExist(selected);
          this.renderSettingsStorageTab();
          this.runAndRenderPreflight();
          if (typeof window.showNotification === 'function') {
            window.showNotification('Storage path updated.', 'success');
          }
        }
      } else {
        await this.requestPersistentStorageNow();
      }
    }
  };

  window.DownloadManager = DownloadManager;
  document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => DownloadManager.init(), 100);
  });
})();