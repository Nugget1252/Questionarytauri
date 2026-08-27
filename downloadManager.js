// js/downloadManager.js
(function () {
  const PACKS_MANIFEST = {
    class11: {
      label: 'Class 11',
      subjects: {
        physics: { label: 'Physics', folder: 'Class 11/Physics', count: 18, sizeSD: '14 MB', sizeHD: '32 MB' },
        chemistry: { label: 'Chemistry', folder: 'Class 11/Chemistry', count: 16, sizeSD: '12 MB', sizeHD: '28 MB' },
        math: { label: 'Mathematics', folder: 'Class 11/Mathematics', count: 20, sizeSD: '18 MB', sizeHD: '40 MB' },
        biology: { label: 'Biology', folder: 'Class 11/Biology', count: 15, sizeSD: '16 MB', sizeHD: '35 MB' }
      }
    },
    class12: {
      label: 'Class 12',
      subjects: {
        physics: { label: 'Physics', folder: 'Class 12/Physics', count: 22, sizeSD: '18 MB', sizeHD: '42 MB' },
        chemistry: { label: 'Chemistry', folder: 'Class 12/Chemistry', count: 19, sizeSD: '15 MB', sizeHD: '36 MB' },
        math: { label: 'Mathematics', folder: 'Class 12/Mathematics', count: 24, sizeSD: '22 MB', sizeHD: '50 MB' },
        biology: { label: 'Biology', folder: 'Class 12/Biology', count: 18, sizeSD: '20 MB', sizeHD: '45 MB' }
      }
    }
  };

  const CDN_BASE = {
    hd: 'https://raw.githubusercontent.com/your-org/questionary-papers-hd/main/',
    sd: 'https://raw.githubusercontent.com/your-org/questionary-papers-sd/main/'
  };

  const DownloadManager = {
    storagePath: '',
    qualityProfile: 'sd', // 'sd' | 'hd'
    downloadedFiles: new Set(),
    isDownloading: false,

    async init() {
      if (!window.electronAPI) return;

      this.qualityProfile = localStorage.getItem('questionary-quality-profile') || 'sd';
      this.storagePath = localStorage.getItem('questionary-storage-path') || await window.electronAPI.getDefaultStoragePath();
      localStorage.setItem('questionary-storage-path', this.storagePath);

      await this.refreshDownloadedList();
      this.setupProgressListener();

      // Check if First-Time Onboarding Wizard is needed
      if (!localStorage.getItem('questionary-setup-complete')) {
        this.openSetupWizard();
      }
    },

    async refreshDownloadedList() {
      if (!window.electronAPI) return;
      const files = await window.electronAPI.checkLocalFiles(this.storagePath);
      this.downloadedFiles = new Set(files);
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
      document.getElementById('dlCurrentFile').textContent = data.currentFile || 'Downloading...';
      document.getElementById('dlPercent').textContent = `${data.percent}%`;
      document.getElementById('dlSpeed').textContent = data.speed || '';
      document.getElementById('dlProgressBarFill').style.width = `${data.percent}%`;

      if (data.percent >= 100) {
        setTimeout(() => {
          banner.style.display = 'none';
          this.refreshDownloadedList();
          if (typeof window.renderTiles === 'function') window.renderTiles();
        }, 1500);
      }
    },

    // ============================================
    // FIRST TIME SETUP WIZARD
    // ============================================
    openSetupWizard() {
      let modal = document.getElementById('setupWizardModal');
      if (!modal) return;

      const pathInput = document.getElementById('wizardStoragePath');
      if (pathInput) pathInput.value = this.storagePath;

      modal.classList.add('active');
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
      const selectedQuality = qualityEl ? qualityEl.value : 'sd';
      const chosenPath = document.getElementById('wizardStoragePath').value.trim() || this.storagePath;

      this.qualityProfile = selectedQuality;
      this.storagePath = chosenPath;

      localStorage.setItem('questionary-quality-profile', selectedQuality);
      localStorage.setItem('questionary-storage-path', chosenPath);
      localStorage.setItem('questionary-setup-complete', 'true');

      document.getElementById('setupWizardModal')?.classList.remove('active');

      // Gather checked subjects
      const checkedBoxes = document.querySelectorAll('.wizard-subject-cb:checked');
      const selectedPacks = Array.from(checkedBoxes).map(cb => ({
        grade: cb.dataset.grade,
        subject: cb.dataset.subject
      }));

      await this.queuePacksDownload(selectedPacks);
    },

    // ============================================
    // PACK DOWNLOAD QUEUE GENERATOR
    // ============================================
    async queuePacksDownload(packList) {
      if (!window.electronAPI || packList.length === 0) return;

      const baseUrl = CDN_BASE[this.qualityProfile];
      const queue = [];

      // Generate file list for each selected pack
      for (const pack of packList) {
        const packInfo = PACKS_MANIFEST[pack.grade]?.subjects[pack.subject];
        if (!packInfo) continue;

        for (let i = 1; i <= packInfo.count; i++) {
          const fileName = `Paper_${i}.pdf`;
          const relativePath = `${packInfo.folder}/${fileName}`;
          queue.push({
            id: `${pack.grade}_${pack.subject}_${i}`,
            name: `${packInfo.label} - ${fileName}`,
            relativePath,
            remoteUrl: `${baseUrl}${encodeURIComponent(relativePath)}`
          });
        }
      }

      this.isDownloading = true;
      const result = await window.electronAPI.startDownloads({ queue, storageDir: this.storagePath });
      this.isDownloading = false;
      await this.refreshDownloadedList();
      if (typeof window.showNotification === 'function') {
        window.showNotification(`Downloaded ${result.completed} PDF papers!`, 'success');
      }
    },

    // ============================================
    // SETTINGS STORAGE MANAGER TAB
    // ============================================
    async renderSettingsStorageTab() {
      const container = document.getElementById('settingsStoragePanel');
      if (!container || !window.electronAPI) return;

      const stats = await window.electronAPI.getStorageStats(this.storagePath);
      const usedMB = (stats.totalBytes / (1024 * 1024)).toFixed(1);

      container.innerHTML = `
        <div class="storage-stats-card">
          <div class="storage-usage-info">
            <span class="storage-metric-val">${usedMB} MB</span>
            <span class="storage-metric-lbl">Total Space Used (${stats.fileCount} Local PDFs)</span>
          </div>
          <div class="storage-location-row">
            <input type="text" id="settingsStorageInput" class="form-input" value="${this.storagePath}" readonly>
            <button class="btn btn-secondary" onclick="window.DownloadManager.relocateStorageFolder()">
              <i class="fas fa-folder-open"></i> Change Location
            </button>
          </div>
        </div>

        <div class="storage-quality-picker">
          <h4>Download Quality Profile</h4>
          <div class="quality-radio-group">
            <label class="quality-radio-card ${this.qualityProfile === 'sd' ? 'active' : ''}">
              <input type="radio" name="settingsQuality" value="sd" ${this.qualityProfile === 'sd' ? 'checked' : ''} onchange="window.DownloadManager.setQuality('sd')">
              <strong>SD Quality (Compressed)</strong>
              <small>Fastest download & minimal storage impact</small>
            </label>
            <label class="quality-radio-card ${this.qualityProfile === 'hd' ? 'active' : ''}">
              <input type="radio" name="settingsQuality" value="hd" ${this.qualityProfile === 'hd' ? 'checked' : ''} onchange="window.DownloadManager.setQuality('hd')">
              <strong>HD Quality (Vector Crisp)</strong>
              <small>Sharpest text and high-res diagram clarity</small>
            </label>
          </div>
        </div>

        <div class="subject-packs-list">
          <h4>Manage Subject Paper Packs</h4>
          ${this.renderPacksListHtml()}
        </div>
      `;
    },

    renderPacksListHtml() {
      let html = '';
      for (const [gradeKey, gradeData] of Object.entries(PACKS_MANIFEST)) {
        html += `<h5 class="pack-grade-header">${gradeData.label}</h5><div class="pack-grid">`;
        for (const [subKey, subData] of Object.entries(gradeData.subjects)) {
          const isDownloaded = this.isPackDownloaded(subData.folder, subData.count);
          html += `
            <div class="pack-card">
              <div class="pack-info">
                <strong>${subData.label}</strong>
                <small>${subData.count} Papers • ${this.qualityProfile === 'hd' ? subData.sizeHD : subData.sizeSD}</small>
              </div>
              <div class="pack-actions">
                ${isDownloaded ? `
                  <span class="pack-status-badge downloaded"><i class="fas fa-check"></i> Ready</span>
                  <button class="btn btn-sm btn-danger" onclick="window.DownloadManager.deletePack('${subData.folder}')">
                    <i class="fas fa-trash"></i>
                  </button>
                ` : `
                  <button class="btn btn-sm btn-primary" onclick="window.DownloadManager.queueSinglePack('${gradeKey}', '${subKey}')">
                    <i class="fas fa-download"></i> Download
                  </button>
                `}
              </div>
            </div>
          `;
        }
        html += `</div>`;
      }
      return html;
    },

    isPackDownloaded(folder, expectedCount) {
      let count = 0;
      for (const file of this.downloadedFiles) {
        if (file.startsWith(folder)) count++;
      }
      return count >= expectedCount;
    },

    async setQuality(quality) {
      this.qualityProfile = quality;
      localStorage.setItem('questionary-quality-profile', quality);
      this.renderSettingsStorageTab();
    },

    async queueSinglePack(grade, subject) {
      await this.queuePacksDownload([{ grade, subject }]);
      this.renderSettingsStorageTab();
    },

    async deletePack(relativeFolder) {
      if (!window.electronAPI) return;
      const ok = await window.showConfirm(`Delete all downloaded papers in "${relativeFolder}"?`, { title: 'Delete Pack', type: 'danger' });
      if (ok) {
        await window.electronAPI.deleteSubjectPack({ storageDir: this.storagePath, relativeFolder });
        await this.refreshDownloadedList();
        this.renderSettingsStorageTab();
        if (typeof window.renderTiles === 'function') window.renderTiles();
        window.showNotification('Pack deleted and disk space reclaimed.', 'info');
      }
    },

    async relocateStorageFolder() {
      const newPath = await window.electronAPI.selectStorageFolder();
      if (!newPath || newPath === this.storagePath) return;

      const ok = await window.showConfirm(`Move existing documents from:\n${this.storagePath}\n\nto:\n${newPath}?`, { title: 'Relocate Storage' });
      if (ok) {
        await window.electronAPI.moveStorageFolder({ oldDir: this.storagePath, newDir: newPath });
        this.storagePath = newPath;
        localStorage.setItem('questionary-storage-path', newPath);
        await this.refreshDownloadedList();
        this.renderSettingsStorageTab();
        window.showNotification('Storage folder relocated successfully!', 'success');
      }
    },

    // Resolves file to local-pdf:// or on-demand stream
    resolveDocumentUrl(relativePath) {
      const cleanRel = relativePath.replace(/\\/g, '/');
      if (this.downloadedFiles.has(cleanRel)) {
        return `local-pdf://${this.storagePath.replace(/\\/g, '/')}/${cleanRel}`;
      }
      return `${CDN_BASE[this.qualityProfile]}${encodeURIComponent(cleanRel)}`;
    }
  };

  window.DownloadManager = DownloadManager;
  document.addEventListener('DOMContentLoaded', () => DownloadManager.init());
})();
