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
    _abortController: null,
    _localDocsAvailable: null,
    _localProbePromise: null,

    // GitHub Release & Raw CDN configuration
    repoOwner: 'Nugget1252',
    repoName: 'Questionarytauri',
    releaseTag: 'documents',
    githubBranch: 'Electron',

    isNativeApp() {
      return Boolean(
        window.electronAPI ||
        window.Capacitor ||
        (window.location && window.location.protocol === 'file:')
      );
    },

    isWebsiteMode() {
      return !this.isNativeApp();
    },

    async init() {
      this.qualityProfile = localStorage.getItem('questionary-quality-profile') || 'sd';

      if (window.electronAPI && typeof window.electronAPI.getDefaultStoragePath === 'function') {
        try {
          this.storagePath = localStorage.getItem('questionary-storage-path') || await window.electronAPI.getDefaultStoragePath();
        } catch (e) {
          this.storagePath = 'Local Storage';
        }
      } else if (window.Capacitor) {
        this.storagePath = localStorage.getItem('questionary-storage-path') || 'App Internal Storage (IndexedDB / OPFS)';
      } else {
        this.storagePath = 'Repository Source (Live Stream · No Local Download)';
      }

      if (this.isNativeApp()) {
        localStorage.setItem('questionary-storage-path', this.storagePath);
      }

      await this.refreshHasDocumentsState();

      this.setupProgressListener();
      this.renderSettingsStorageTab();
      this.renderOfflineDiagnosticsPanel();

      window.addEventListener('questionary:connectivity', () => {
        this.renderOfflineDiagnosticsPanel();
      });

      // Automatically offer Setup Wizard ONLY in Native Apps (Electron or Capacitor) when no documents exist locally
      if (this.isNativeApp() && !this.hasDocuments && !localStorage.getItem('questionary-setup-complete')) {
        setTimeout(() => this.openSetupWizard(), 400);
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

      // Website mode accesses papers directly from the repo source (never downloads to user's PC)
      if (this.isWebsiteMode()) {
        this.hasDocuments = true;
        return true;
      }

      if (window.OfflineEngine) {
        const stats = await window.OfflineEngine.getStats();
        if (stats.fileCount > 0) {
          this.hasDocuments = true;
          localStorage.setItem('questionary-docs-installed', 'true');
          return true;
        }
      }

      this.hasDocuments = false;
      localStorage.removeItem('questionary-docs-installed');
      return false;
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

      const isElectron = Boolean(window.electronAPI);
      const pathInput = document.getElementById('wizardStoragePath');
      const browseBtn = modal.querySelector('.wizard-browse-btn');
      const hintText = modal.querySelector('.storage-hint-text');

      if (pathInput) {
        pathInput.value = isElectron ? this.storagePath : 'App Internal Offline Cache (IndexedDB / OPFS)';
      }
      if (browseBtn) {
        browseBtn.style.display = isElectron ? '' : 'none';
      }
      if (hintText && !isElectron) {
        hintText.textContent = 'Papers download directly into persistent offline app storage so they work without internet. You can also download individual papers on demand.';
      }

      this.selectWizardQuality(this.qualityProfile);
      modal.classList.add('active');
    },

    dismissSetupWizard() {
      localStorage.setItem('questionary-setup-complete', 'true');
      document.getElementById('setupWizardModal')?.classList.remove('active');
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
    // REMOTE MIRROR & REAL WEB / CAPACITOR CACHING
    // ============================================
    getRemoteCandidateUrls(relPath, qualityOverride = null) {
      const cleanRel = String(relPath || '')
        .replace(/\\/g, '/')
        .replace(/^(\.\/)+/, '')
        .replace(/^\/+/, '')
        .replace(/^(documentshd|documents)\//i, '');
      if (!cleanRel) return [];

      const encodedRel = cleanRel.split('/').map((seg) => encodeURIComponent(seg)).join('/');
      const base = `https://raw.githubusercontent.com/${this.repoOwner}/${this.repoName}/${this.githubBranch}`;
      const q = (qualityOverride || this.qualityProfile || 'sd').toLowerCase();

      if (q === 'hd') {
        return [`${base}/documentshd/${encodedRel}`, `${base}/documents/${encodedRel}`];
      }
      return [`${base}/documents/${encodedRel}`];
    },

    async _probeLocalDocumentsAvailable(sampleRelPath = null) {
      if (this._localDocsAvailable !== null) return this._localDocsAvailable;
      if (window.Capacitor || window.location.protocol === 'file:') {
        this._localDocsAvailable = false;
        return false;
      }
      if (this._localProbePromise) return this._localProbePromise;

      this._localProbePromise = (async () => {
        try {
          if (sampleRelPath) {
            const clean = String(sampleRelPath).replace(/^(documentshd|documents)\//i, '');
            const encoded = clean.split('/').map((seg) => encodeURIComponent(seg)).join('/');
            const res = await fetch(`documents/${encoded}`, { method: 'GET', cache: 'no-cache' });
            const ct = ((res.headers && res.headers.get('content-type')) || '').toLowerCase();
            if (res.ok && !ct.includes('text/html')) {
              const ab = await res.arrayBuffer();
              if (ab && ab.byteLength >= 4) {
                const b = new Uint8Array(ab);
                if (b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46) {
                  this._localDocsAvailable = true;
                  return true;
                }
              }
            }
          } else {
            const res = await fetch('/api/documents', { cache: 'no-cache' });
            if (res && res.ok) {
              this._localDocsAvailable = true;
              return true;
            }
          }
        } catch (e) {}
        this._localDocsAvailable = false;
        return false;
      })();

      try {
        return await this._localProbePromise;
      } finally {
        this._localProbePromise = null;
      }
    },

    _buildItemCandidates(relPath, localPath = null, hasLocal = false) {
      const remoteUrls = this.getRemoteCandidateUrls(relPath);
      if (!hasLocal) return remoteUrls;

      const locals = [];
      if (localPath) locals.push(localPath);
      const encoded = relPath.split('/').map((s) => encodeURIComponent(s)).join('/');
      if (this.qualityProfile === 'hd') locals.push(`documentshd/${encoded}`);
      locals.push(`documents/${encoded}`);
      return Array.from(new Set([...locals, ...remoteUrls]));
    },

    async _getBrowserCatalogList(subjectFilter = null) {
      // 1. Prefer Express catalog API if reachable (Node desktop web server)
      if (!window.Capacitor && window.location && window.location.protocol !== 'file:') {
        try {
          const res = await fetch('/api/documents', { cache: 'no-cache' });
          if (res.ok) {
            const payload = await res.json();
            if (payload && Array.isArray(payload.documents) && payload.documents.length > 0) {
              this._localDocsAvailable = true;
              let docs = payload.documents;
              if (subjectFilter) {
                docs = docs.filter((d) => (d.subject || '').toLowerCase() === subjectFilter.toLowerCase());
              }
              return docs.map((d) => {
                const localUrl = (this.qualityProfile === 'hd' && d.hasHD && d.hdPath) ? d.hdPath : d.path;
                return {
                  relPath: d.filename,
                  url: localUrl,
                  candidates: this._buildItemCandidates(d.filename, localUrl, true),
                  subject: d.subject || 'General',
                  filename: d.filename,
                  size: d.size || 0
                };
              });
            }
          }
        } catch (e) {}
      }

      // 2. Extract file nodes from bundled local SQLite database (zero server required — works offline & on Capacitor APK)
      if (window.DbService && typeof window.DbService.query === 'function' && !window.DbService.isFallback) {
        try {
          const rows = await window.DbService.query(
            "SELECT name, file_path FROM nodes WHERE is_folder = 0 AND file_path IS NOT NULL AND file_path != '#' AND file_path != ''"
          );
          if (Array.isArray(rows) && rows.length > 0) {
            const seen = new Set();
            const rawItems = [];
            for (const row of rows) {
              const raw = String(row.file_path || '');
              if (raw.startsWith('http://') || raw.startsWith('https://') || raw.startsWith('blob:') || raw.startsWith('blob-id:')) continue;
              const rel = raw.replace(/^(\.\/|\/)?(documentshd|documents)\//i, '').replace(/^\/+/, '');
              if (!rel || seen.has(rel)) continue;
              if (subjectFilter && !(row.name || '').toLowerCase().includes(subjectFilter.toLowerCase()) && !rel.toLowerCase().includes(subjectFilter.toLowerCase())) {
                continue;
              }
              seen.add(rel);
              rawItems.push({ rel, name: row.name || rel.split('/').pop() });
            }

            if (rawItems.length > 0) {
              const hasLocal = await this._probeLocalDocumentsAvailable(rawItems[0].rel);
              return rawItems.map((it) => {
                const candidates = this._buildItemCandidates(it.rel, null, hasLocal);
                return {
                  relPath: it.rel,
                  url: candidates[0],
                  candidates,
                  subject: it.name || 'Study Paper',
                  filename: it.rel.split('/').pop(),
                  size: 0
                };
              });
            }
          }
        } catch (e) {}
      }

      // 3. Fallback: Query GitHub tree API directly if DB catalog is empty
      try {
        const treeRes = await fetch(
          `https://api.github.com/repos/${this.repoOwner}/${this.repoName}/git/trees/${this.githubBranch}?recursive=1`,
          { cache: 'no-cache', credentials: 'omit' }
        );
        if (treeRes && treeRes.ok) {
          const treeJson = await treeRes.json();
          const seen = new Set();
          const out = [];
          for (const entry of (treeJson.tree || [])) {
            if (entry.type !== 'blob' || !entry.path.startsWith('documents/') || !entry.path.toLowerCase().endsWith('.pdf')) continue;
            const rel = entry.path.slice('documents/'.length);
            if (!rel || seen.has(rel)) continue;
            if (subjectFilter && !rel.toLowerCase().includes(subjectFilter.toLowerCase())) continue;
            seen.add(rel);
            const candidates = this.getRemoteCandidateUrls(rel);
            out.push({
              relPath: rel,
              url: candidates[0],
              candidates,
              subject: rel.split('/').pop().replace(/\.pdf$/i, ''),
              filename: rel.split('/').pop(),
              size: entry.size || 0
            });
          }
          return out;
        }
      } catch (e) {}

      return [];
    },

    cancelDownload() {
      if (this._abortController) {
        try { this._abortController.abort(); } catch (e) {}
      }
      this.isDownloading = false;
      const banner = document.getElementById('globalDownloadBanner');
      if (banner) banner.style.display = 'none';
      if (typeof window.showNotification === 'function') {
        window.showNotification('Download cancelled.', 'info');
      }
    },

    async startFullPackDownload(subjectFilter = null) {
      if (this.isWebsiteMode()) {
        if (typeof window.showNotification === 'function') {
          window.showNotification('Website mode streams question papers directly from the repository without downloading them to your PC. Use the Questionary Desktop or Android App for offline packs.', 'info');
        }
        return;
      }

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
      this._abortController = typeof AbortController !== 'undefined' ? new AbortController() : null;

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
          this._abortController = null;
        }
        return;
      }

      // Real Browser / PWA / Capacitor IndexedDB Batch Caching
      const banner = document.getElementById('globalDownloadBanner');
      try {
        if (window.OfflineEngine) {
          await window.OfflineEngine.requestPersistentStorage();
        }

        if (banner) banner.style.display = 'flex';
        const fileEl = document.getElementById('dlCurrentFile');
        const percentEl = document.getElementById('dlPercent');
        const speedEl = document.getElementById('dlSpeed');
        const fillEl = document.getElementById('dlProgressBarFill');
        if (fileEl) fileEl.textContent = 'Preparing question paper list...';
        if (percentEl) percentEl.textContent = '0%';
        if (speedEl) speedEl.textContent = '';
        if (fillEl) fillEl.style.width = '2%';

        const list = await this._getBrowserCatalogList(subjectFilter);
        if (!list.length) {
          throw new Error('No downloadable study papers found in catalog.');
        }

        let completed = 0;
        let cachedNew = 0;
        let alreadyCachedCount = 0;
        let failedCount = 0;
        let downloadedBytes = 0;
        const startTime = Date.now();
        const total = list.length;
        const isMobile = Boolean(
          window.Capacitor ||
          (typeof navigator !== 'undefined' && /android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent || ''))
        );
        const CONCURRENCY = isMobile ? 2 : 5;
        let index = 0;
        const signal = this._abortController ? this._abortController.signal : undefined;

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
            if (signal && signal.aborted) break;
            const item = list[index++];
            try {
              const alreadyCached = window.OfflineEngine && await window.OfflineEngine.hasPdf(item.relPath);
              if (alreadyCached) {
                alreadyCachedCount++;
              } else {
                const sources = (item.candidates && item.candidates.length > 0) ? item.candidates : item.url;
                const { byteLength } = await window.OfflineEngine.fetchAndCachePdf(sources, {
                  relPath: item.relPath,
                  subject: item.subject,
                  quality: this.qualityProfile,
                  filename: item.filename,
                  signal
                });
                downloadedBytes += byteLength || item.size || 0;
                cachedNew++;
              }
            } catch (err) {
              if (err && err.name === 'AbortError') break;
              failedCount++;
              console.warn('[DownloadManager] Skipped:', item.relPath, err.message);
            }
            completed++;
            updateBanner(`Downloading (${completed}/${total}): ${item.filename || item.subject}`);
          }
        };

        await Promise.all(Array.from({ length: Math.min(CONCURRENCY, list.length) }, () => worker()));

        if (signal && signal.aborted) {
          await this.refreshHasDocumentsState();
          this.renderSettingsStorageTab();
          this.renderOfflineDiagnosticsPanel();
          return;
        }

        const totalAvailableOffline = cachedNew + alreadyCachedCount;
        if (totalAvailableOffline === 0 && failedCount > 0) {
          if (banner) banner.style.display = 'none';
          this.hasDocuments = false;
          localStorage.removeItem('questionary-docs-installed');
          this.renderSettingsStorageTab();
          this.renderOfflineDiagnosticsPanel();
          if (typeof window.showNotification === 'function') {
            window.showNotification(`Download failed for ${failedCount} paper(s). Please check your internet connection and try again.`, 'error');
          }
          return;
        }

        if (percentEl) percentEl.textContent = '100%';
        if (fillEl) fillEl.style.width = '100%';
        if (fileEl) {
          fileEl.textContent = failedCount > 0
            ? `Cached ${totalAvailableOffline} papers (${failedCount} failed · ${formatSize(downloadedBytes)})`
            : `Cached ${totalAvailableOffline} offline papers (${formatSize(downloadedBytes)} downloaded)`;
        }

        this.hasDocuments = totalAvailableOffline > 0;
        if (this.hasDocuments) {
          localStorage.setItem('questionary-docs-installed', 'true');
        }

        setTimeout(() => {
          if (banner) banner.style.display = 'none';
          this.renderSettingsStorageTab();
          this.renderOfflineDiagnosticsPanel();
          if (typeof window.renderTiles === 'function') window.renderTiles();
          if (typeof window.showNotification === 'function') {
            if (failedCount > 0) {
              window.showNotification(`Downloaded ${cachedNew} paper(s), ${failedCount} failed. Tap Sync again to retry.`, 'warning');
            } else if (cachedNew > 0) {
              window.showNotification(`Downloaded & cached ${cachedNew} paper(s) (${formatSize(downloadedBytes)}) for offline use!`, 'success');
            } else {
              window.showNotification('All study papers are already cached offline.', 'success');
            }
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
        this._abortController = null;
      }
    },

    // ============================================
    // UNIVERSAL DOCUMENT PATH RESOLUTION
    // ============================================
    resolveDocumentUrl(dbFilePath) {
      if (!dbFilePath || dbFilePath === '#' || dbFilePath === '') return dbFilePath;
      if (
        dbFilePath.startsWith('blob:') ||
        dbFilePath.startsWith('blob-id:') ||
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

      // If we already know local /documents/ does not exist (e.g. Capacitor APK), point directly to GitHub raw CDN
      const relDoc = cleanPath.replace(/^(documentshd|documents)\//i, '');
      if (window.Capacitor || this._localDocsAvailable === false) {
        const remoteUrls = this.getRemoteCandidateUrls(relDoc);
        if (remoteUrls.length > 0) return remoteUrls[0];
      }

      // Browser WebView standard local repo src URL resolution
      const encodedRel = relDoc.split('/').map((seg) => encodeURIComponent(seg)).join('/');
      if (this.isWebsiteMode() && this.qualityProfile === 'hd') {
        const remoteHd = this.getRemoteCandidateUrls(relDoc, 'hd');
        if (remoteHd.length > 0) return remoteHd[0];
      }
      try {
        return new URL(`documents/${encodedRel}`, window.location.href).href;
      } catch (e) {
        return `documents/${encodedRel}`;
      }
    },

    async resolveDocumentUrlAsync(dbFilePath) {
      if (!dbFilePath || dbFilePath === '#' || dbFilePath === '') return dbFilePath;
      if (window.electronAPI) return this.resolveDocumentUrl(dbFilePath);
      if (dbFilePath.startsWith('blob:') || dbFilePath.startsWith('data:') || dbFilePath.startsWith('blob-id:')) {
        return dbFilePath;
      }

      const cleanRel = String(dbFilePath)
        .replace(/\\/g, '/')
        .replace(/^(\.\/)+/, '')
        .replace(/^\/+/, '')
        .replace(/^(documentshd|documents)\//i, '');

      // Website Mode: stream directly from the repository source as a src URL — NEVER download or cache PDFs to the user's PC
      if (this.isWebsiteMode()) {
        if (this.qualityProfile === 'hd') {
          const remoteHd = this.getRemoteCandidateUrls(cleanRel, 'hd');
          if (remoteHd.length > 0) return remoteHd[0];
        }
        const hasLocal = await this._probeLocalDocumentsAvailable(cleanRel);
        if (hasLocal) {
          const encodedRel = cleanRel.split('/').map((seg) => encodeURIComponent(seg)).join('/');
          try {
            return new URL(`documents/${encodedRel}`, window.location.href).href;
          } catch (e) {
            return `documents/${encodedRel}`;
          }
        }
        const remoteUrls = this.getRemoteCandidateUrls(cleanRel);
        return remoteUrls[0] || this.resolveDocumentUrl(dbFilePath);
      }

      // Native App Mode (Capacitor Android / file://): check offline cache first and cache on demand
      if (window.OfflineEngine) {
        const cachedObjectUrl = await window.OfflineEngine.getPdfObjectUrl(cleanRel);
        if (cachedObjectUrl) {
          return cachedObjectUrl;
        }
      }

      const hasLocal = await this._probeLocalDocumentsAvailable(cleanRel);
      const syncUrl = this.resolveDocumentUrl(dbFilePath);

      if (hasLocal) {
        if (window.OfflineEngine && window.OfflineEngine.isOnline()) {
          window.OfflineEngine.fetchAndCachePdf([syncUrl, ...this.getRemoteCandidateUrls(cleanRel)], {
            relPath: cleanRel,
            filename: cleanRel.split('/').pop(),
            quality: this.qualityProfile
          }).catch(() => {});
        }
        return syncUrl;
      }

      // On Capacitor Android / static mobile build: download & cache from GitHub raw CDN on demand
      const remoteUrls = this.getRemoteCandidateUrls(cleanRel);
      if (window.OfflineEngine && window.OfflineEngine.isOnline() && remoteUrls.length > 0) {
        if (typeof window.showNotification === 'function') {
          window.showNotification('Downloading paper for offline reading...', 'info');
        }
        try {
          await window.OfflineEngine.fetchAndCachePdf(remoteUrls, {
            relPath: cleanRel,
            filename: cleanRel.split('/').pop(),
            quality: this.qualityProfile
          });
          this.refreshHasDocumentsState().then(() => this.renderSettingsStorageTab());
          const objUrl = await window.OfflineEngine.getPdfObjectUrl(cleanRel);
          if (objUrl) return objUrl;
        } catch (err) {
          console.warn('[DownloadManager] On-demand mobile fetch failed:', err.message);
        }
        return remoteUrls[0];
      }

      return remoteUrls[0] || syncUrl;
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
        const backendLabel = (stats.backends && stats.backends.length > 0) ? stats.backends.join(' + ') : 'IndexedDB / OPFS';
        docsStatus = fileCount > 0 ? `${fileCount} PDFs cached (${backendLabel})` : 'No offline PDFs cached yet';
      }

      const isElectron = Boolean(window.electronAPI);

      if (this.isWebsiteMode()) {
        container.innerHTML = `
          <div class="storage-stats-card" style="background: var(--hover); border: 1px solid var(--line); border-radius: 10px; padding: 1rem; margin-top: 0.5rem;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem; gap: 12px; flex-wrap: wrap;">
              <div>
                <div style="font-size: 1.05rem; font-weight: 700; color: var(--fg);">Live Repository Source</div>
                <div style="font-size: 0.78rem; color: var(--fg3);">Question papers open directly from the repository source — nothing is downloaded to your PC.</div>
              </div>
              <span class="pack-status-badge downloaded" style="padding: 4px 10px; border-radius: 6px; font-size: 0.75rem; font-weight: 600; background: rgba(34,197,94,0.12); color: #22c55e; white-space: nowrap;">
                <i class="fas fa-cloud"></i> Direct Stream
              </span>
            </div>

            <div style="margin-bottom: 1rem;">
              <label class="form-label" style="margin-bottom: 0.4rem;">Source Paper Quality</label>
              <div class="quality-grid">
                <label class="quality-card ${this.qualityProfile === 'sd' ? 'active' : ''}" onclick="window.DownloadManager.switchQuality('sd')">
                  <input type="radio" name="settingsQuality" value="sd" ${this.qualityProfile === 'sd' ? 'checked' : ''} style="display:none;">
                  <div class="quality-card-header">
                    <div class="quality-card-icon sd"><i class="fas fa-bolt"></i></div>
                    <div class="quality-radio-circle"><i class="fas fa-check"></i></div>
                  </div>
                  <strong class="quality-title">Standard (SD)</strong>
                  <span class="quality-desc">Fast streaming directly from repo documents/</span>
                  <div class="quality-badge">0 MB Local Storage</div>
                </label>

                <label class="quality-card ${this.qualityProfile === 'hd' ? 'active' : ''}" onclick="window.DownloadManager.switchQuality('hd')">
                  <input type="radio" name="settingsQuality" value="hd" ${this.qualityProfile === 'hd' ? 'checked' : ''} style="display:none;">
                  <div class="quality-card-header">
                    <div class="quality-card-icon hd"><i class="fas fa-gem"></i></div>
                    <div class="quality-radio-circle"><i class="fas fa-check"></i></div>
                  </div>
                  <strong class="quality-title">High-Definition (HD)</strong>
                  <span class="quality-desc">High-res repo source from documentshd/</span>
                  <div class="quality-badge hd">0 MB Local Storage</div>
                </label>
              </div>
            </div>

            <div style="display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px; padding-top: 0.65rem; border-top: 1px solid var(--line);">
              <span style="font-size: 0.76rem; color: var(--fg3);">
                <i class="fas fa-desktop" style="margin-right: 4px; color: var(--accent);"></i>
                Want full offline question paper packs stored locally? Use the Questionary Desktop or Android App.
              </span>
              ${fileCount > 0 ? `
                <button class="btn btn-secondary btn-sm" type="button" onclick="window.DownloadManager.clearOfflineCache()">
                  <i class="fas fa-trash-alt"></i> Clear Old Browser Cache (${escapeHtml(usedMB)} MB)
                </button>
              ` : ''}
            </div>
          </div>
        `;
        return;
      }

      container.innerHTML = `
        <div class="storage-stats-card" style="background: var(--hover); border: 1px solid var(--line); border-radius: 10px; padding: 1rem; margin-top: 0.5rem;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem; gap: 12px; flex-wrap: wrap;">
            <div>
              <div style="font-size: 1.25rem; font-weight: 700; color: var(--fg); font-variant-numeric: tabular-nums;">${escapeHtml(usedMB)} MB</div>
              <div style="font-size: 0.78rem; color: var(--fg3); font-variant-numeric: tabular-nums;">${escapeHtml(docsStatus)}</div>
            </div>
            <span class="pack-status-badge ${fileCount > 0 ? 'downloaded' : ''}" style="padding: 4px 10px; border-radius: 6px; font-size: 0.75rem; font-weight: 600; background: ${fileCount > 0 ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)'}; color: ${fileCount > 0 ? '#22c55e' : '#ef4444'}; white-space: nowrap;">
              ${fileCount > 0 ? '<i class="fas fa-check"></i> Offline Ready' : '<i class="fas fa-exclamation-triangle"></i> Not Cached'}
            </span>
          </div>

          <div style="display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 1rem;">
            <input type="text" id="settingsStorageInput" class="form-input" value="${escapeHtml(this.storagePath)}" readonly style="flex: 1 1 180px; min-width: 0;">
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
            <button class="btn btn-primary btn-sm" type="button" onclick="window.DownloadManager.startFullPackDownload()" style="flex: 1 1 190px; min-width: 0;">
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
            <span class="tabular-nums">${passedCount}/${checks.length} checks ready</span>
          </span>
          <div class="diag-summary-actions">
            ${showPwaInstall ? `
              <button type="button" class="btn btn-primary btn-sm" id="pwaInstallSettingsBtn" onclick="window.OfflineEngine.triggerInstall()">
                <i class="fas fa-download"></i> <span class="pwa-install-label">${pwaState.isIOS ? 'Install on iOS' : 'Install App'}</span>
              </button>
            ` : ''}
            ${this.isNativeApp() && !window.electronAPI ? `
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
        window.showNotification(
          this.isWebsiteMode()
            ? `Source quality set to ${newQuality.toUpperCase()}. Papers will stream directly from the repo.`
            : `Quality set to ${newQuality.toUpperCase()}. Click "Sync / Cache All Offline PDFs" to apply.`,
          'info'
        );
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