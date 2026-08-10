/* ================================================================
 *   ZERO-CONFIG HOT UPDATER ENGINE (Guaranteed Script Overriding)
 *   Repository: Nugget1252/Questionarytauri
 *   ================================================================ */
(function() {
    'use strict';
    
    const REPO_OWNER = 'Nugget1252';
    const REPO_NAME = 'Questionarytauri';
    const PRIMARY_BRANCH = 'beta';
    const FALLBACK_BRANCH = 'main';
    
    const CODE_FILES_KEY = 'questionary-code-files';
    const INSTALLED_COMMIT_KEY = 'questionary-installed-commit-sha';
    
    const MANAGED_FILES = [
        'css/styles.css',
        'css/features.css',
        'js/app.js',
        'js/features.js',
        'js/studyRoom.js',
        'js/contentUpdater.js',
        'js/hotUpdater.js',
        'pdfviewer.html',
        'questionary.db'
    ];

    window.codeUpdateState = {
        checking: false,
        downloading: false,
        available: false,
        latestCommitSha: null,
        activeBranch: PRIMARY_BRANCH,
        pendingFiles: []
    };

    function canShowNotification() {
        const appEl = document.getElementById('app');
        const loginEl = document.getElementById('loginScreen');
        const isAppVisible = appEl && appEl.style.display !== 'none';
        const isLoginVisible = loginEl && loginEl.style.display !== 'none';
        return (isAppVisible || !isLoginVisible) && window.currentUser !== null;
    }

    function getStoredCodeFiles() {
        try {
            const data = localStorage.getItem(CODE_FILES_KEY);
            return data ? JSON.parse(data) : {};
        } catch (e) {
            return {};
        }
    }

    function saveStoredCodeFiles(files) {
        localStorage.setItem(CODE_FILES_KEY, JSON.stringify(files));
    }

    async function resetCache() {
        localStorage.removeItem(CODE_FILES_KEY);
        localStorage.removeItem(INSTALLED_COMMIT_KEY);
        delete window._HOT_APP_JS_LOADED;
        console.log('[HotUpdate] Hot-code cache purged successfully.');
        
        if (canShowNotification() && typeof showNotification === 'function') {
            showNotification('Hot-code cache cleared. Re-checking GitHub...', 'info');
        }
        
        const pending = await checkForCodeUpdates(false);
        if (pending && pending.length > 0) {
            await downloadCodeUpdates();
        } else {
            location.reload();
        }
    }

    function applyHotCSS(filename, content) {
        if (!content || content.length < 10) return;
        const styleId = `hot-css-${filename.replace(/[^a-zA-Z0-9]/g, '-')}`;
        let styleEl = document.getElementById(styleId);
        if (!styleEl) {
            styleEl = document.createElement('style');
            styleEl.id = styleId;
            document.head.appendChild(styleEl);
        }
        styleEl.textContent = content;
        console.log(`[HotUpdate] Live hot-swapped CSS: ${filename}`);
    }

    function applyStoredCSS() {
        const stored = getStoredCodeFiles();
        for (const [filename, content] of Object.entries(stored)) {
            if (filename.endsWith('.css') && content) {
                applyHotCSS(filename, content);
            }
        }
    }

    // Execute stored JS scripts in order of dependency & set hot-update flags
    function applyStoredJS() {
        const stored = getStoredCodeFiles();
        const executionOrder = ['js/features.js', 'js/studyRoom.js', 'js/contentUpdater.js', 'js/app.js'];

        for (const filename of executionOrder) {
            const content = stored[filename];
            if (content && content.trim().length > 50) {
                try {
                    console.log(`[HotUpdate] Applying stored JS override: ${filename}`);
                    const scriptId = `hot-js-${filename.replace(/[^a-zA-Z0-9]/g, '-')}`;
                    let scriptEl = document.getElementById(scriptId);
                    if (scriptEl) scriptEl.remove();

                    window._HOT_APP_JS_LOADED = true;

                    scriptEl = document.createElement('script');
                    scriptEl.id = scriptId;
                    scriptEl.textContent = content;
                    document.head.appendChild(scriptEl);
                } catch (err) {
                    console.error(`[HotUpdate] Error executing updated ${filename}:`, err);
                }
            }
        }
    }

    function getViewerUrl(fileUrl) {
        const stored = getStoredCodeFiles();
        if (stored['pdfviewer.html'] && stored['pdfviewer.html'].includes('pdfjsLib')) {
            const blob = new Blob([stored['pdfviewer.html']], { type: 'text/html' });
            return URL.createObjectURL(blob) + '#file=' + encodeURIComponent(fileUrl);
        }
        return 'pdfviewer.html?file=' + encodeURIComponent(fileUrl);
    }

    async function fetchFileFromRepo(relativePath) {
        const branches = [window.codeUpdateState.activeBranch, PRIMARY_BRANCH, FALLBACK_BRANCH];
        const uniqueBranches = [...new Set(branches)];

        const pathVariants = [
            relativePath,
            `src/${relativePath}`,
            relativePath.replace(/^js\//, ''),
            relativePath.replace(/^css\//, ''),
            `src/${relativePath.replace(/^js\//, '')}`,
            `src/${relativePath.replace(/^css\//, '')}`
        ];
        const uniquePaths = [...new Set(pathVariants)];

        const cacheBuster = Date.now() + '_' + Math.random().toString(36).substring(2, 7);

        for (const branch of uniqueBranches) {
            for (const pathVar of uniquePaths) {
                const url = `https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/${branch}/${pathVar}?nocache=${cacheBuster}`;
                try {
                    const res = await fetch(url, { cache: 'no-store' });
                    if (res.ok) {
                        console.log(`[HotUpdate] Successfully fetched ${relativePath} from: ${url}`);
                        return res;
                    }
                } catch (e) {}
            }
        }
        return null;
    }

    async function checkForCodeUpdates(silent = false) {
        if (window.codeUpdateState.checking || window.codeUpdateState.downloading) {
            return null;
        }

        window.codeUpdateState.checking = true;
        updateCodeUpdateUI('checking');

        let latestSha = null;
        let detectedBranch = PRIMARY_BRANCH;

        const branchesToTry = [PRIMARY_BRANCH, FALLBACK_BRANCH];
        for (const branch of branchesToTry) {
            try {
                const apiUrl = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/commits/${branch}?t=${Date.now()}`;
                const res = await fetch(apiUrl, {
                    cache: 'no-store',
                    headers: { 'Accept': 'application/vnd.github.v3+json' }
                });

                if (res.ok) {
                    const data = await res.json();
                    if (data && data.sha) {
                        latestSha = data.sha;
                        detectedBranch = branch;
                        break;
                    }
                }
            } catch (err) {}
        }

        if (!latestSha) {
            for (const branch of branchesToTry) {
                try {
                    const cdnUrl = `https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/${branch}/package.json?t=${Date.now()}`;
                    const res = await fetch(cdnUrl, { cache: 'no-store' });
                    if (res.ok) {
                        const pkg = await res.json();
                        if (pkg && (pkg.version || pkg.buildSha)) {
                            latestSha = pkg.buildSha || `version-${pkg.version}`;
                            detectedBranch = branch;
                            break;
                        }
                    }
                } catch (e) {}
            }
        }

        window.codeUpdateState.activeBranch = detectedBranch;

        if (!latestSha) {
            window.codeUpdateState.checking = false;
            updateCodeUpdateUI('idle');
            if (!silent && canShowNotification() && typeof showNotification === 'function') {
                showNotification('Could not check for updates. Check connection.', 'error');
            }
            return null;
        }

        const installedSha = localStorage.getItem(INSTALLED_COMMIT_KEY);
        console.log(`[HotUpdate] Latest SHA: ${latestSha.substring(0, 7)} | Installed SHA: ${installedSha?.substring(0, 7) || 'None'}`);

        if (latestSha !== installedSha) {
            window.codeUpdateState.available = true;
            window.codeUpdateState.latestCommitSha = latestSha;
            window.codeUpdateState.pendingFiles = [...MANAGED_FILES];

            updateCodeUpdateUI('available', MANAGED_FILES.length);

            if (!silent && canShowNotification() && typeof showNotification === 'function') {
                showNotification('New update detected! Downloading update...', 'success');
            }

            window.codeUpdateState.checking = false;
            return window.codeUpdateState.pendingFiles;
        } else {
            if (!silent && canShowNotification() && typeof showNotification === 'function') {
                showNotification('Questionary is up to date!', 'success');
            }
            updateCodeUpdateUI('idle');
        }

        window.codeUpdateState.checking = false;
        return null;
    }

    async function downloadCodeUpdates() {
        if (window.codeUpdateState.downloading) return;

        if (!window.codeUpdateState.latestCommitSha) {
            const pending = await checkForCodeUpdates(false);
            if (!pending) return;
        }

        window.codeUpdateState.downloading = true;
        updateCodeUpdateUI('downloading');

        if (canShowNotification() && typeof showNotification === 'function') {
            showNotification('Downloading and applying updates...', 'info');
        }

        const storedFiles = getStoredCodeFiles();
        let downloadedCount = 0;
        let requiresReload = false;
        let dbUpdated = false;

        for (const fileRelPath of MANAGED_FILES) {
            try {
                const res = await fetchFileFromRepo(fileRelPath);
                if (!res) continue;

                if (fileRelPath.endsWith('.db')) {
                    const arrayBuffer = await res.arrayBuffer();
                    const uInt8Array = new Uint8Array(arrayBuffer);

                    if (uInt8Array.length > 100) {
                        if (window.DbService && window.DbService.SQL) {
                            window.DbService.db = new window.DbService.SQL.Database(uInt8Array);
                            await window.DbService.saveToIndexedDB();
                            dbUpdated = true;
                            downloadedCount++;
                        }

                        if (window.__TAURI__ && window.__TAURI__.fs) {
                            try {
                                const { writeBinaryFile, BaseDirectory } = window.__TAURI__.fs;
                                await writeBinaryFile('questionary.db', uInt8Array, { dir: BaseDirectory.AppData });
                            } catch (e) {}
                        }
                    }
                } else {
                    const content = await res.text();
                    if (content && content.trim().length > 10) {
                        storedFiles[fileRelPath] = content;
                        downloadedCount++;

                        if (fileRelPath.endsWith('.css')) {
                            applyHotCSS(fileRelPath, content);
                        } else if (fileRelPath.endsWith('.js') || fileRelPath.endsWith('.html')) {
                            requiresReload = true;
                        }

                        if (window.__TAURI__ && window.__TAURI__.fs) {
                            try {
                                const { writeTextFile, BaseDirectory } = window.__TAURI__.fs;
                                await writeTextFile(fileRelPath, content, { dir: BaseDirectory.AppData });
                            } catch (e) {}
                        }
                    }
                }
            } catch (error) {
                console.error(`[HotUpdate] Sync failed for ${fileRelPath}:`, error);
            }
        }

        if (downloadedCount >= 2) {
            saveStoredCodeFiles(storedFiles);
            localStorage.setItem(INSTALLED_COMMIT_KEY, window.codeUpdateState.latestCommitSha);
            console.log(`[HotUpdate] Commit ${window.codeUpdateState.latestCommitSha.substring(0, 7)} installed successfully!`);
        } else {
            console.error('[HotUpdate] Critical files failed to download.');
            if (canShowNotification() && typeof showNotification === 'function') {
                showNotification('Update download failed. Please check connection.', 'error');
            }
            window.codeUpdateState.downloading = false;
            updateCodeUpdateUI('idle');
            return;
        }

        window.codeUpdateState.downloading = false;
        window.codeUpdateState.available = false;

        updateCodeUpdateUI('idle');

        if (dbUpdated && typeof window.renderTiles === 'function') {
            window.renderTiles();
        }

        if (requiresReload) {
            if (canShowNotification() && typeof showNotification === 'function') {
                showNotification('Update installed! Reloading...', 'success');
            }
            setTimeout(() => location.reload(), 1000);
        } else if (canShowNotification() && typeof showNotification === 'function') {
            showNotification('Updated successfully!', 'success');
        }
    }

    function updateCodeUpdateUI(state, count = 0) {
        const btn = document.getElementById('checkUpdatesBtn');
        if (!btn) return;

        btn.classList.remove('checking', 'available', 'downloading', 'update-available');

        switch (state) {
            case 'checking':
                btn.classList.add('checking');
                btn.innerHTML = '<i class="fas fa-sync-alt fa-spin"></i>';
                btn.title = 'Checking for updates...';
                break;
            case 'available':
                btn.classList.add('update-available');
                btn.innerHTML = '<i class="fas fa-download"></i>';
                btn.title = 'New update available - click to download';
                break;
            case 'downloading':
                btn.classList.add('downloading');
                btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
                btn.title = 'Downloading update...';
                break;
            default:
                btn.innerHTML = '<i class="fas fa-sync-alt"></i>';
                btn.title = 'Check for updates (Right-click to Force Re-sync)';
        }
    }

    function attachContextMenuReset() {
        const btn = document.getElementById('checkUpdatesBtn');
        if (btn && !btn.dataset.resetAttached) {
            btn.dataset.resetAttached = 'true';
            btn.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                if (typeof window.showConfirm === 'function') {
                    window.showConfirm('Force-clear hot code cache and re-sync from GitHub?', {
                        title: 'Force Re-sync Code',
                        confirmText: 'Clear & Re-sync',
                        type: 'warning'
                    }).then(yes => {
                        if (yes) resetCache();
                    });
                } else if (confirm('Force-clear hot code cache and re-sync from GitHub?')) {
                    resetCache();
                }
            });
        }
    }

    async function initHotUpdater() {
        applyStoredCSS();
        applyStoredJS();
        attachContextMenuReset();

        setTimeout(async () => {
            const pending = await checkForCodeUpdates(true);
            if (pending && pending.length > 0) {
                await downloadCodeUpdates();
            }
        }, 3000);
    }

    window.hotCodeUpdater = {
        check: checkForCodeUpdates,
        download: downloadCodeUpdates,
        resetCache: resetCache,
        applyStoredCSS,
        applyStoredJS,
        getViewerUrl,
        init: initHotUpdater,
        getState: () => window.codeUpdateState
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initHotUpdater);
    } else {
        initHotUpdater();
    }
})();