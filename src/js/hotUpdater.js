/* ================================================================
 *   ZERO-CONFIG HOT UPDATER ENGINE (CORS-Proof Multi-CDN Pipeline)
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
        'index.html',
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

    function notify(message, type = 'info') {
        if (typeof window.showNotification === 'function') {
            window.showNotification(message, type);
        } else {
            console.log(`[HotUpdate - ${type.toUpperCase()}] ${message}`);
        }
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
        console.log('[HotUpdate] Cache cleared. Force re-syncing from GitHub...');
        notify('Cache cleared. Fetching latest files...', 'info');
        
        await downloadCodeUpdates(true);
    }

    // ================================================================
    // 1. LIVE DOM HOT-PATCHER
    // ================================================================
    function applyStoredHTML() {
        const stored = getStoredCodeFiles();
        const storedHtml = stored['index.html'];
        if (!storedHtml || storedHtml.trim().length < 100) return;

        try {
            const parser = new DOMParser();
            const newDoc = parser.parseFromString(storedHtml, 'text/html');

            const newHeader = newDoc.querySelector('header.header') || newDoc.querySelector('.header');
            const curHeader = document.querySelector('header.header') || document.querySelector('.header');
            if (newHeader && curHeader && newHeader.innerHTML !== curHeader.innerHTML) {
                curHeader.innerHTML = newHeader.innerHTML;
                console.log('[HotUpdate] Hot-patched header/nav from updated index.html');
            }

            const targets = ['app', 'loginScreen', 'loadingOverlay', 'accessibilityPanel', 'quickLinksPanel', 'timerPanel'];
            targets.forEach(id => {
                const newEl = newDoc.getElementById(id);
                const curEl = document.getElementById(id);
                if (newEl && curEl && newEl.innerHTML !== curEl.innerHTML) {
                    curEl.innerHTML = newEl.innerHTML;
                    console.log(`[HotUpdate] Hot-patched #${id} from updated index.html`);
                }
            });

            const newModals = newDoc.querySelectorAll('.modal-overlay');
            newModals.forEach(newModal => {
                if (newModal.id) {
                    const curModal = document.getElementById(newModal.id);
                    if (curModal) {
                        if (curModal.innerHTML !== newModal.innerHTML) {
                            curModal.innerHTML = newModal.innerHTML;
                        }
                    } else {
                        document.body.appendChild(document.importNode(newModal, true));
                    }
                }
            });
        } catch (err) {
            console.error('[HotUpdate] Error hot-patching HTML:', err);
        }
    }

    // ================================================================
    // 2. LIVE CSS HOT-PATCHER
    // ================================================================
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

    // ================================================================
    // 3. LIVE JS HOT-EXECUTOR (Isolated IIFEs)
    // ================================================================
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
                    scriptEl.textContent = `(function(){\ntry {\n${content}\n} catch(e){ console.error('[HotUpdate Execution Error in ${filename}]:', e); }\n})();`;
                    document.head.appendChild(scriptEl);
                } catch (err) {
                    console.error(`[HotUpdate] Error executing updated ${filename}:`, err);
                }
            }
        }
    }

    // ================================================================
    // 4. CORS-PROOF FILE FETCHER (jsDelivr + GitHub API + Tauri HTTP)
    // ================================================================
    async function fetchFileFromRepo(relativePath) {
        const branch = window.codeUpdateState.activeBranch || PRIMARY_BRANCH;
        const cacheBuster = Date.now();

        const paths = [
            relativePath,
            `src/${relativePath}`,
            relativePath.replace(/^js\//, ''),
            relativePath.replace(/^css\//, ''),
            `src/${relativePath.replace(/^js\//, '')}`,
            `src/${relativePath.replace(/^css\//, '')}`
        ];
        const uniquePaths = [...new Set(paths)];

        // Tier 1: jsDelivr Open CDN (100% CORS-Allowed on file:// and WebViews)
        for (const p of uniquePaths) {
            const cdnUrl = `https://cdn.jsdelivr.net/gh/${REPO_OWNER}/${REPO_NAME}@${branch}/${p}?t=${cacheBuster}`;
            try {
                const res = await fetch(cdnUrl, { cache: 'no-store' });
                if (res.ok) {
                    console.log(`[HotUpdate] Downloaded ${relativePath} via jsDelivr CDN`);
                    return res;
                }
            } catch (e) {}
        }

        // Tier 2: Tauri Native HTTP Plugin (if compiled in Tauri)
        if (window.__TAURI__ && window.__TAURI__.http) {
            for (const p of uniquePaths) {
                const rawUrl = `https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/${branch}/${p}?nocache=${cacheBuster}`;
                try {
                    const isDb = relativePath.endsWith('.db');
                    const res = await window.__TAURI__.http.fetch(rawUrl, {
                        method: 'GET',
                        responseType: isDb ? 3 : 2
                    });
                    if (res.ok && res.data) {
                        return {
                            ok: true,
                            text: async () => typeof res.data === 'string' ? res.data : new TextDecoder().decode(new Uint8Array(res.data)),
                            arrayBuffer: async () => isDb ? new Uint8Array(res.data).buffer : new TextEncoder().encode(res.data).buffer
                        };
                    }
                } catch (e) {}
            }
        }

        // Tier 3: Direct Raw GitHub Fetch
        for (const p of uniquePaths) {
            const rawUrl = `https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/${branch}/${p}?nocache=${cacheBuster}`;
            try {
                const res = await fetch(rawUrl, { cache: 'no-store' });
                if (res.ok) return res;
            } catch (e) {}
        }

        return null;
    }

    // ================================================================
    // 5. UPDATE CHECKER
    // ================================================================
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
            // A. Check GitHub API
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

            // B. Un-rate-limited Atom Feed Fallback
            if (!latestSha) {
                try {
                    const feedUrl = `https://github.com/${REPO_OWNER}/${REPO_NAME}/commits/${branch}.atom?t=${Date.now()}`;
                    const res = await fetch(feedUrl, { cache: 'no-store' });
                    if (res.ok) {
                        const xmlText = await res.text();
                        const match = xmlText.match(/Commit\/([a-f0-9]{40})/i);
                        if (match && match[1]) {
                            latestSha = match[1];
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
            if (!silent) notify('Could not reach GitHub updates.', 'error');
            return null;
        }

        const installedSha = localStorage.getItem(INSTALLED_COMMIT_KEY);
        console.log(`[HotUpdate] Latest: ${latestSha.substring(0, 7)} | Installed: ${installedSha ? installedSha.substring(0, 7) : 'None'}`);

        if (latestSha !== installedSha) {
            window.codeUpdateState.available = true;
            window.codeUpdateState.latestCommitSha = latestSha;
            window.codeUpdateState.pendingFiles = [...MANAGED_FILES];

            updateCodeUpdateUI('available', MANAGED_FILES.length);
            if (!silent) notify('New update found! Downloading...', 'success');

            window.codeUpdateState.checking = false;
            return window.codeUpdateState.pendingFiles;
        } else {
            if (!silent) notify('Questionary is up to date!', 'success');
            updateCodeUpdateUI('idle');
        }

        window.codeUpdateState.checking = false;
        return null;
    }

    // ================================================================
    // 6. DOWNLOADER & APPLIER
    // ================================================================
    async function downloadCodeUpdates(force = false) {
        if (window.codeUpdateState.downloading) return;

        if (!window.codeUpdateState.latestCommitSha && !force) {
            const pending = await checkForCodeUpdates(false);
            if (!pending) return;
        }

        window.codeUpdateState.downloading = true;
        updateCodeUpdateUI('downloading');
        notify('Downloading updates from GitHub...', 'info');

        const storedFiles = getStoredCodeFiles();
        let downloadedCount = 0;

        for (const fileRelPath of MANAGED_FILES) {
            try {
                const res = await fetchFileFromRepo(fileRelPath);
                if (!res) {
                    console.warn(`[HotUpdate] Could not fetch ${fileRelPath}`);
                    continue;
                }

                if (fileRelPath.endsWith('.db')) {
                    const arrayBuffer = await res.arrayBuffer();
                    const uInt8Array = new Uint8Array(arrayBuffer);

                    if (uInt8Array.length > 100) {
                        if (window.DbService && window.DbService.SQL) {
                            window.DbService.db = new window.DbService.SQL.Database(uInt8Array);
                            await window.DbService.saveToIndexedDB();
                            downloadedCount++;
                        }
                    }
                } else {
                    const content = await res.text();
                    if (content && content.trim().length > 10) {
                        storedFiles[fileRelPath] = content;
                        downloadedCount++;

                        if (fileRelPath.endsWith('.css')) {
                            applyHotCSS(fileRelPath, content);
                        }
                    }
                }
            } catch (error) {
                console.error(`[HotUpdate] Sync error for ${fileRelPath}:`, error);
            }
        }

        if (downloadedCount >= 1) {
            saveStoredCodeFiles(storedFiles);
            if (window.codeUpdateState.latestCommitSha) {
                localStorage.setItem(INSTALLED_COMMIT_KEY, window.codeUpdateState.latestCommitSha);
            }
            console.log(`[HotUpdate] Successfully downloaded ${downloadedCount} files!`);
            notify(`Update installed (${downloadedCount} files)! Reloading...`, 'success');
            setTimeout(() => location.reload(), 800);
        } else {
            console.error('[HotUpdate] Critical files failed to download.');
            notify('Update download failed. Check network.', 'error');
            window.codeUpdateState.downloading = false;
            updateCodeUpdateUI('idle');
        }
    }

    function updateCodeUpdateUI(state) {
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

    function attachButtonListeners() {
        const btn = document.getElementById('checkUpdatesBtn');
        if (btn && !btn.dataset.listenersAttached) {
            btn.dataset.listenersAttached = 'true';

            btn.addEventListener('click', async (e) => {
                e.preventDefault();
                e.stopPropagation();
                const pending = await checkForCodeUpdates(false);
                if (pending && pending.length > 0) {
                    await downloadCodeUpdates();
                }
            });

            btn.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (confirm('Force-clear cache and re-download all latest files from GitHub?')) {
                    resetCache();
                }
            });
        }

        const homeSyncBtn = document.getElementById('homeSyncBtn');
        if (homeSyncBtn && !homeSyncBtn.dataset.listenersAttached) {
            homeSyncBtn.dataset.listenersAttached = 'true';
            homeSyncBtn.addEventListener('click', (e) => {
                e.preventDefault();
                resetCache();
            });
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

    async function initHotUpdater() {
        applyStoredHTML();
        applyStoredCSS();
        applyStoredJS();
        attachButtonListeners();

        // Check for updates 3 seconds after boot
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
        forceSync: () => downloadCodeUpdates(true),
        applyStoredHTML,
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