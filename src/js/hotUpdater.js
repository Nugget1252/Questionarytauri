/* ================================================================
 *   ZERO-CONFIG HOT UPDATER ENGINE
 *   Monitors GitHub Commits API on branch: 'beta'
 *   Repository: Nugget1252/Questionarytauri
 *   ================================================================ */
(function() {
    'use strict';
    
    const REPO_OWNER = 'Nugget1252';
    const REPO_NAME = 'Questionarytauri';
    const BRANCH = 'beta';
    
    const GITHUB_COMMIT_API = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/commits/${BRANCH}`;
    const RAW_BASE_SRC = `https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/${BRANCH}/src/`;
    const RAW_BASE_ROOT = `https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/${BRANCH}/`;
    
    const CODE_FILES_KEY = 'questionary-code-files';
    const INSTALLED_COMMIT_KEY = 'questionary-installed-commit-sha';
    
    // Core files to sync from the repo
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
        pendingFiles: []
    };

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

    // Apply hot CSS directly into <head>
    function applyHotCSS(filename, content) {
        if (!content) return;
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

    // Apply stored CSS on startup
    function applyStoredCSS() {
        const stored = getStoredCodeFiles();
        for (const [filename, content] of Object.entries(stored)) {
            if (filename.endsWith('.css') && content) {
                applyHotCSS(filename, content);
            }
        }
    }

    // Redirect script src to stored JS local blobs
    function applyStoredJS() {
        const stored = getStoredCodeFiles();
        for (const [filename, content] of Object.entries(stored)) {
            if (filename.endsWith('.js') && content) {
                console.log(`[HotUpdate] Redirecting script to saved local version: ${filename}`);
                const existingScript = Array.from(document.querySelectorAll('script')).find(s => s.src && s.src.includes(filename));
                const blob = new Blob([content], { type: 'application/javascript' });
                const blobUrl = URL.createObjectURL(blob);
                if (existingScript) {
                    existingScript.src = blobUrl;
                } else {
                    const script = document.createElement('script');
                    script.src = blobUrl;
                    script.id = `hotupdate-${filename.replace(/[^a-zA-Z0-9]/g, '-')}`;
                    document.body.appendChild(script);
                }
            }
        }
    }

    // Fetch file trying both /src/ directory and repository root
    async function fetchFileFromRepo(relativePath) {
        const urlSrc = RAW_BASE_SRC + relativePath + '?t=' + Date.now();
        const urlRoot = RAW_BASE_ROOT + relativePath + '?t=' + Date.now();

        try {
            let res = await fetch(urlSrc, { cache: 'no-cache' });
            if (res.ok) return res;
            res = await fetch(urlRoot, { cache: 'no-cache' });
            if (res.ok) return res;
        } catch (e) {
            console.warn(`[HotUpdate] Fetch error for ${relativePath}:`, e);
        }
        return null;
    }

    // Query GitHub API for the latest commit on the beta branch
    async function checkForCodeUpdates(silent = false) {
        if (window.codeUpdateState.checking || window.codeUpdateState.downloading) {
            return null;
        }

        window.codeUpdateState.checking = true;
        updateCodeUpdateUI('checking');

        try {
            console.log(`[HotUpdate] Checking GitHub Commit API for branch: ${BRANCH}...`);
            const response = await fetch(GITHUB_COMMIT_API + '?t=' + Date.now(), { cache: 'no-cache' });

            if (!response.ok) {
                console.warn('[HotUpdate] Could not reach GitHub API (offline or rate limited).');
                window.codeUpdateState.checking = false;
                updateCodeUpdateUI('idle');
                return null;
            }

            const commitData = await response.json();
            const latestSha = commitData.sha;
            const installedSha = localStorage.getItem(INSTALLED_COMMIT_KEY);

            console.log(`[HotUpdate] Latest commit on GitHub: ${latestSha?.substring(0,7)} | Installed: ${installedSha?.substring(0,7) || 'None'}`);

            if (latestSha && latestSha !== installedSha) {
                window.codeUpdateState.available = true;
                window.codeUpdateState.latestCommitSha = latestSha;
                window.codeUpdateState.pendingFiles = [...MANAGED_FILES];

                updateCodeUpdateUI('available', MANAGED_FILES.length);

                if (!silent && typeof showNotification === 'function') {
                    showNotification(`New commit (${latestSha.substring(0,7)}) found on beta branch! Auto-downloading updates...`, 'info');
                }
                
                window.codeUpdateState.checking = false;
                return window.codeUpdateState.pendingFiles;
            } else {
                if (!silent && typeof showNotification === 'function') {
                    showNotification('Your app files & database are up to date with GitHub!', 'success');
                }
                updateCodeUpdateUI('idle');
            }

            window.codeUpdateState.checking = false;
            return null;

        } catch (error) {
            console.error('[HotUpdate] Error checking GitHub commits:', error);
            window.codeUpdateState.checking = false;
            updateCodeUpdateUI('idle');
            return null;
        }
    }

    // Permanently download and write updated files locally
    async function downloadCodeUpdates() {
        if (window.codeUpdateState.downloading || !window.codeUpdateState.latestCommitSha) {
            return;
        }

        window.codeUpdateState.downloading = true;
        updateCodeUpdateUI('downloading');

        const storedFiles = getStoredCodeFiles();
        let successCount = 0;
        let requiresReload = false;
        let dbUpdated = false;

        for (const fileRelPath of MANAGED_FILES) {
            console.log(`[HotUpdate] Downloading updated file from GitHub: ${fileRelPath}...`);

            try {
                const res = await fetchFileFromRepo(fileRelPath);
                if (!res) continue;

                if (fileRelPath.endsWith('.db')) {
                    // Binary SQLite database update
                    const arrayBuffer = await res.arrayBuffer();
                    const uInt8Array = new Uint8Array(arrayBuffer);

                    if (window.DbService && window.DbService.SQL) {
                        window.DbService.db = new window.DbService.SQL.Database(uInt8Array);
                        await window.DbService.saveToIndexedDB();
                        dbUpdated = true;
                        successCount++;
                        console.log('[HotUpdate] Saved new questionary.db to permanent IndexedDB storage!');
                    }

                    if (window.__TAURI__ && window.__TAURI__.fs) {
                        try {
                            const { writeBinaryFile, BaseDirectory } = window.__TAURI__.fs;
                            await writeBinaryFile('questionary.db', uInt8Array, { dir: BaseDirectory.AppData });
                        } catch (e) {}
                    }
                } else {
                    // Text JS / CSS / HTML update
                    const content = await res.text();
                    storedFiles[fileRelPath] = content;
                    successCount++;

                    if (fileRelPath.endsWith('.css')) {
                        applyHotCSS(fileRelPath, content);
                    } else if (fileRelPath.endsWith('.js')) {
                        requiresReload = true;
                    }

                    if (window.__TAURI__ && window.__TAURI__.fs) {
                        try {
                            const { writeTextFile, BaseDirectory } = window.__TAURI__.fs;
                            await writeTextFile(fileRelPath, content, { dir: BaseDirectory.AppData });
                        } catch (e) {}
                    }
                }
            } catch (error) {
                console.error(`[HotUpdate] Error downloading ${fileRelPath}:`, error);
            }
        }

        saveStoredCodeFiles(storedFiles);
        localStorage.setItem(INSTALLED_COMMIT_KEY, window.codeUpdateState.latestCommitSha);

        window.codeUpdateState.downloading = false;
        window.codeUpdateState.available = false;

        updateCodeUpdateUI('idle');

        if (dbUpdated && typeof window.renderTiles === 'function') {
            window.renderTiles();
        }

        if (successCount > 0) {
            if (requiresReload) {
                if (typeof showNotification === 'function') {
                    showNotification(`Downloaded ${successCount} file(s) permanently. Reload required to activate JS updates.`, 'success');
                }
                showReloadPrompt();
            } else {
                if (typeof showNotification === 'function') {
                    showNotification(`Updated ${successCount} file(s) live from GitHub beta branch!`, 'success');
                }
            }
        }
    }

    function showReloadPrompt() {
        if (typeof window.showConfirm === 'function') {
            window.showConfirm('New updates downloaded and saved permanently! Reload now to activate JavaScript changes?', {
                title: 'Update Downloaded',
                confirmText: 'Reload Now',
                cancelText: 'Later',
                type: 'info'
            }).then(yes => {
                if (yes) location.reload();
            });
            return;
        }

        let modal = document.getElementById('reloadPromptModal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'reloadPromptModal';
            modal.innerHTML = `
                <div class="reload-prompt-overlay">
                    <div class="reload-prompt-content">
                        <i class="fas fa-sync-alt reload-icon"></i>
                        <h3>Update Saved</h3>
                        <p>New updates have been downloaded and saved permanently. Reload the app to apply them.</p>
                        <div class="reload-prompt-buttons">
                            <button class="btn btn-secondary" onclick="document.getElementById('reloadPromptModal').style.display='none'">Later</button>
                            <button class="btn btn-primary" onclick="location.reload()"><i class="fas fa-redo"></i> Reload Now</button>
                        </div>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);
        }
        modal.style.display = 'block';
    }

    function updateCodeUpdateUI(state, count = 0) {
        const btn = document.getElementById('checkUpdatesBtn') || document.getElementById('contentUpdateBtn');
        if (!btn) return;

        btn.classList.remove('checking', 'available', 'downloading');

        switch (state) {
            case 'checking':
                btn.classList.add('checking');
                btn.title = 'Checking GitHub beta branch for updates...';
                break;
            case 'available':
                btn.classList.add('available');
                btn.title = `${count} file(s) updated on GitHub - click to download`;
                let badge = btn.querySelector('.content-badge');
                if (!badge) {
                    badge = document.createElement('span');
                    badge.className = 'content-badge';
                    btn.appendChild(badge);
                }
                badge.textContent = 'UPDATE';
                break;
            case 'downloading':
                btn.classList.add('downloading');
                btn.title = 'Downloading updates...';
                break;
            default:
                btn.title = 'Check for updates';
                const existingBadge = btn.querySelector('.content-badge');
                if (existingBadge) existingBadge.remove();
        }
    }

    async function initHotUpdater() {
        applyStoredCSS();
        applyStoredJS();

        // Auto-check GitHub beta commit API 3 seconds after startup
        setTimeout(async () => {
            const pending = await checkForCodeUpdates(true);
            if (pending && pending.length > 0) {
                console.log('[HotUpdate] Auto-downloading updates from GitHub beta branch...');
                await downloadCodeUpdates();
            }
        }, 3000);
    }

    window.hotCodeUpdater = {
        check: checkForCodeUpdates,
        download: downloadCodeUpdates,
        applyStoredCSS,
        applyStoredJS,
        init: initHotUpdater,
        getState: () => window.codeUpdateState
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initHotUpdater);
    } else {
        initHotUpdater();
    }
})();