// js/downloadManager.js
(function () {
  const DownloadManager = {
    storagePath: '',
    qualityProfile: 'sd', // 'sd' | 'hd'
    hasDocuments: false,
    isDownloading: false,

    // GitHub Release configuration
    repoOwner: 'Nugget1252',
    repoName: 'Questionarytauri',
    releaseTag: 'v0.9.8',

    async init() {
      if (!window.electronAPI) return;

      this.qualityProfile = localStorage.getItem('questionary-quality-profile') || 'sd';
      this.storagePath = localStorage.getItem('questionary-storage-path') || await window.electronAPI.getDefaultStoragePath();
      localStorage.setItem('questionary-storage-path', this.storagePath);

      this.hasDocuments = await window.electronAPI.checkDocumentsExist(this.storagePath);
      this.setupProgressListener();

      // Render settings storage tab if element already exists in DOM
      this.renderSettingsStorageTab();

      // Automatically pop Setup Wizard if no documents exist locally and setup isn't marked complete
      if (!this.hasDocuments && !localStorage.getItem('questionary-setup-complete')) {
        setTimeout(() => this.openSetupWizard(), 300);
      }
    },

    setupProgressListener() {
      if (!window.electronAPI) return;
      window.electronAPI.onDownloadProgress((data) => {
        this.updateLiveProgressUI(data);
      });
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
          this.renderSettingsStorageTab();
          if (typeof window.renderTiles === 'function') window.renderTiles();
          if (typeof window.showNotification === 'function') {
            window.showNotification('Documents downloaded and extracted successfully!', 'success');
          }
        }, 1500);
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
      if (!window.electronAPI) return;
      const selected = await window.electronAPI.selectStorageFolder();
      if (selected) {
        const el = document.getElementById(inputId);
        if (el) el.value = selected;
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
    // ZIP PACK DOWNLOAD & EXTRACTION TRIGGER
    // ============================================
    async startFullPackDownload() {
      if (!window.electronAPI) {
        if (typeof window.showNotification === 'function') {
          window.showNotification('Electron API not available.', 'error');
        }
        return;
      }

      if (this.isDownloading) {
        if (typeof window.showNotification === 'function') {
          window.showNotification('Download already in progress...', 'info');
        }
        return;
      }

      this.isDownloading = true;

      const result = await window.electronAPI.downloadFullPack({
        quality: this.qualityProfile,
        storageDir: this.storagePath,
        repoOwner: this.repoOwner,
        repoName: this.repoName,
        releaseTag: this.releaseTag
      });

      this.isDownloading = false;

      if (!result.success) {
        if (typeof window.showNotification === 'function') {
          window.showNotification('Download failed: ' + result.error, 'error');
        }
      } else {
        this.hasDocuments = true;
        this.renderSettingsStorageTab();
        if (typeof window.renderTiles === 'function') window.renderTiles();
      }
    },

    // ============================================
    // PATH RESOLUTION FOR PDF VIEWER & TILES
    // ============================================
    resolveDocumentUrl(dbFilePath) {
      if (!dbFilePath || dbFilePath === '#' || dbFilePath === '') return dbFilePath;
      if (dbFilePath.startsWith('blob:') || dbFilePath.startsWith('data:') || dbFilePath.startsWith('http') || dbFilePath.startsWith('local-pdf:')) {
        return dbFilePath;
      }

      const cleanStorage = this.storagePath.replace(/\\/g, '/').replace(/\/+$/, '');
      let cleanPath = dbFilePath.replace(/^\/+/, '').replace(/\\/g, '/');

      // Prevent duplicate documents/documents/
      if (cleanStorage.endsWith('/documents') && cleanPath.startsWith('documents/')) {
        cleanPath = cleanPath.replace(/^documents\//, '');
      }

      const fullPath = `${cleanStorage}/${cleanPath}`.replace(/\/documents\/documents\//, '/documents/');
      return `local-pdf://${fullPath}`;
    },
    // ============================================
    // SETTINGS STORAGE MANAGER TAB
    // ============================================
    async renderSettingsStorageTab() {
      const container = document.getElementById('settingsStoragePanel');
      if (!container || !window.electronAPI) return;

      const stats = await window.electronAPI.getStorageStats(this.storagePath);
      const usedMB = (stats.totalBytes / (1024 * 1024)).toFixed(1);
      const docsStatus = stats.fileCount > 0 ? `${stats.fileCount} local documents installed` : 'No documents installed yet';

      container.innerHTML = `
        <div class="storage-stats-card" style="background: var(--hover); border: 1px solid var(--line); border-radius: 10px; padding: 1rem; margin-top: 0.5rem;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem;">
            <div>
              <div style="font-size: 1.25rem; font-weight: 700; color: var(--fg);">${usedMB} MB</div>
              <div style="font-size: 0.75rem; color: var(--fg3);">${docsStatus}</div>
            </div>
            <span class="pack-status-badge ${stats.fileCount > 0 ? 'downloaded' : ''}" style="padding: 4px 8px; border-radius: 6px; font-size: 0.75rem; background: ${stats.fileCount > 0 ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)'}; color: ${stats.fileCount > 0 ? '#22c55e' : '#ef4444'};">
              ${stats.fileCount > 0 ? '<i class="fas fa-check"></i> Ready' : '<i class="fas fa-exclamation-triangle"></i> Not Downloaded'}
            </span>
          </div>
          
          <div style="display: flex; gap: 8px; margin-bottom: 1rem;">
            <input type="text" id="settingsStorageInput" class="form-input" value="${this.storagePath}" readonly style="flex: 1;">
            <button class="btn btn-secondary btn-sm" onclick="window.DownloadManager.relocateStorageFolder()">
              <i class="fas fa-folder-open"></i> Browse
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
                <span class="quality-desc">Compressed files for faster downloads</span>
                <div class="quality-badge">~60 MB Total</div>
              </label>

              <label class="quality-card ${this.qualityProfile === 'hd' ? 'active' : ''}" onclick="window.DownloadManager.switchQuality('hd')">
                <input type="radio" name="settingsQuality" value="hd" ${this.qualityProfile === 'hd' ? 'checked' : ''} style="display:none;">
                <div class="quality-card-header">
                  <div class="quality-card-icon hd"><i class="fas fa-gem"></i></div>
                  <div class="quality-radio-circle"><i class="fas fa-check"></i></div>
                </div>
                <strong class="quality-title">High-Definition (HD)</strong>
                <span class="quality-desc">Vector-crisp text & high-res diagrams</span>
                <div class="quality-badge hd">~140 MB Total</div>
              </label>
            </div>
          </div>

          <div style="display: flex; gap: 8px;">
            <button class="btn btn-primary btn-sm" onclick="window.DownloadManager.startFullPackDownload()" style="flex: 1;">
              <i class="fas fa-cloud-download-alt"></i> ${stats.fileCount > 0 ? 'Re-download / Switch Quality' : 'Download Document Pack'}
            </button>
          </div>
        </div>
      `;
    },

    async switchQuality(newQuality) {
      this.qualityProfile = newQuality;
      localStorage.setItem('questionary-quality-profile', newQuality);
      this.renderSettingsStorageTab();
      if (typeof window.showNotification === 'function') {
        window.showNotification(`Quality set to ${newQuality.toUpperCase()}. Click "Re-download" to download the pack.`, 'info');
      }
    },

    async relocateStorageFolder() {
      const selected = await window.electronAPI.selectStorageFolder();
      if (selected && selected !== this.storagePath) {
        this.storagePath = selected;
        localStorage.setItem('questionary-storage-path', selected);
        this.hasDocuments = await window.electronAPI.checkDocumentsExist(selected);
        this.renderSettingsStorageTab();
        if (typeof window.showNotification === 'function') {
          window.showNotification('Storage path updated.', 'success');
        }
      }
    }
  };

  window.DownloadManager = DownloadManager;
  document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => DownloadManager.init(), 100);
  });
})();