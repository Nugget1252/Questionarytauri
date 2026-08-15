/* =========================================================================
 *   QUESTIONARY HOT UPDATER ENGINE v5.0 (Atomic Direct-GitHub Engine)
 *   Repository: Nugget1252/Questionarytauri
 *   Branch Pipeline: beta -> main (Fallback)
 *   ========================================================================= */

(function (global) {
    'use strict';

    /* ---------- Configuration ---------- */
    const REPO_OWNER = 'Nugget1252';
    const REPO_NAME = 'Questionarytauri';
    const PRIMARY_BRANCH = 'beta';
    const FALLBACK_BRANCH = 'main';

    const STORAGE_KEY_FILES = 'questionary_hot_files';
    const STORAGE_KEY_COMMIT = 'questionary_hot_commit_sha';
    const STORAGE_KEY_BRANCH = 'questionary_hot_branch';
    const STORAGE_KEY_MANIFEST = 'questionary_hot_manifest';

    /* Core files fallback list (used if GitHub Tree API is rate-limited) */
    const CORE_FALLBACK_FILES = [
        'index.html',
        'pdfviewer.html',
        'css/styles.css',
        'css/features.css',
        'js/features.js',
        'js/studyRoom.js',
        'js/contentUpdater.js',
        'js/hotUpdater.js',
        'js/app.js',
        'questionary.db'
    ];

    /* Targeted extensions for dynamic repository tree tracking */
    const ALLOWED_EXTENSIONS = ['.html', '.css', '.js', '.json', '.db'];
    const IGNORED_PATH_PREFIXES = [
        '.github/',
        '.git',
        'src-tauri/',
        'target/',
        'node_modules/',
        '.vscode/'
    ];

    /* Global State */
    window.codeUpdateState = {
        checking: false,
        downloading: false,
        available: false,
        latestCommitSha: null,
        installedCommitSha: localStorage.getItem(STORAGE_KEY_COMMIT) || null,
        activeBranch: PRIMARY_BRANCH,
        discoveredFiles: [],
        progress: 0
    };

    /* ---------- Logging & Notifications ---------- */
    function log(msg, type = 'info') {
        const prefix = '[HotUpdater]';
        if (type === 'error') console.error(`${prefix} ${msg}`);
        else if (type === 'warn') console.warn(`${prefix} ${msg}`);
        else console.log(`${prefix} ${msg}`);
    }

    function notify(message, type = 'info') {
        if (typeof window.showNotification === 'function') {
            window.showNotification(message, type);
        } else {
            log(`[${type.toUpperCase()}] ${message}`);
        }
    }

    /* ---------- Storage Helpers ---------- */
    function getStoredFiles() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY_FILES);
            return raw ? JSON.parse(raw) : {};
        } catch (e) {
            log('Error reading stored files from localStorage', 'warn');
            return {};
        }
    }

    function saveStoredFiles(filesMap) {
        try {
            localStorage.setItem(STORAGE_KEY_FILES, JSON.stringify(filesMap));
            return true;
        } catch (e) {
            log('Error writing to localStorage (Quota exceeded?): ' + e.message, 'error');
            return false;
        }
    }

    /* ---------- Cache Reset & Rollback ---------- */
    async function resetCache(shouldReload = true) {
        log('Resetting local hot-code cache...');
        localStorage.removeItem(STORAGE_KEY_FILES);
        localStorage.removeItem(STORAGE_KEY_COMMIT);
        localStorage.removeItem(STORAGE_KEY_BRANCH);
        localStorage.removeItem(STORAGE_KEY_MANIFEST);

        delete window._HOT_APP_JS_LOADED;
        delete window._HOT_STUDY_ROOM_LOADED;
        delete window._HOT_FEATURES_LOADED;
        delete window._HOT_CONTENT_UPDATER_LOADED;

        notify('Cache cleared. Fetching pristine files from GitHub...', 'info');

        const success = await downloadCodeUpdates(true);
        if (!success && shouldReload) {
            location.reload();
        }
    }

    /* ================================================================
     * 1. LIVE ASSET INJECTORS (Global Execution Scope)
     * ================================================================ */
    
    // Injects / Updates CSS dynamically in the document head
    function applyHotCSS(filename, content) {
        if (!content || content.trim().length < 5) return;
        const styleId = `hot-css-${filename.replace(/[^a-zA-Z0-9]/g, '-')}`;
        let styleEl = document.getElementById(styleId);

        if (!styleEl) {
            styleEl = document.createElement('style');
            styleEl.id = styleId;
            document.head.appendChild(styleEl);
        }
        styleEl.textContent = content;
        log(`Live hot-swapped stylesheet: ${filename}`);
    }

    function applyStoredCSS() {
        const stored = getStoredFiles();
        for (const [filename, content] of Object.entries(stored)) {
            if (filename.endsWith('.css') && typeof content === 'string') {
                applyHotCSS(filename, content);
            }
        }
    }

    // Injects & Executes JS in true global scope with correct dependency order
    function applyStoredJS() {
        const stored = getStoredFiles();
        if (Object.keys(stored).length === 0) return;

        // Strict execution order to satisfy dependency hierarchies
        const executionOrder = [
            'js/features.js',
            'js/studyRoom.js',
            'js/contentUpdater.js',
            'js/app.js'
        ];

        // Also gather any dynamically discovered custom JS scripts
        const allStoredJs = Object.keys(stored).filter(k => k.endsWith('.js') && !executionOrder.includes(k));
        const finalOrder = [...executionOrder, ...allStoredJs];

        for (const filename of finalOrder) {
            const content = stored[filename];
            if (content && typeof content === 'string' && content.trim().length > 30) {
                try {
                    log(`Executing hot script in global scope: ${filename}`);
                    const scriptId = `hot-js-${filename.replace(/[^a-zA-Z0-9]/g, '-')}`;
                    const oldScript = document.getElementById(scriptId);
                    if (oldScript) oldScript.remove();

                    if (filename.includes('app.js')) window._HOT_APP_JS_LOADED = true;
                    if (filename.includes('studyRoom.js')) window._HOT_STUDY_ROOM_LOADED = true;
                    if (filename.includes('features.js')) window._HOT_FEATURES_LOADED = true;
                    if (filename.includes('contentUpdater.js')) window._HOT_CONTENT_UPDATER_LOADED = true;

                    // Append real <script> tag to ensure binding to window
                    const scriptEl = document.createElement('script');
                    scriptEl.id = scriptId;
                    scriptEl.type = 'text/javascript';
                    scriptEl.textContent = `${content}\n//# sourceURL=hotUpdate://${filename}`;
                    document.head.appendChild(scriptEl);
                } catch (err) {
                    log(`Error evaluating script ${filename}: ${err.message}`, 'error');
                }
            }
        }
    }

    // Hot-patches index.html structural elements (Navigation, Modals, Sections)
    function applyStoredHTML() {
        const stored = getStoredFiles();
        const storedHtml = stored['index.html'];
        if (!storedHtml || storedHtml.trim().length < 100) return;

        try {
            const parser = new DOMParser();
            const newDoc = parser.parseFromString(storedHtml, 'text/html');

            // Sync Header & Navigation
            const newHeader = newDoc.querySelector('header.header') || newDoc.querySelector('.header');
            const curHeader = document.querySelector('header.header') || document.querySelector('.header');
            if (newHeader && curHeader && newHeader.innerHTML !== curHeader.innerHTML) {
                curHeader.innerHTML = newHeader.innerHTML;
                log('Hot-patched navigation & header from index.html');
            }

            // Sync Critical Interactive Containers
            const syncContainers = [
                'accessibilityPanel',
                'quickLinksPanel',
                'timerPanel',
                'downloadProgressBar',
                'contentProgressBar',
                'mobileBottomNav'
            ];

            syncContainers.forEach(id => {
                const newEl = newDoc.getElementById(id);
                const curEl = document.getElementById(id);
                if (newEl && curEl && newEl.innerHTML !== curEl.innerHTML) {
                    curEl.innerHTML = newEl.innerHTML;
                    log(`Hot-patched container #${id}`);
                }
            });

            // Sync Modals
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
            log(`Error applying stored HTML: ${err.message}`, 'error');
        }
    }

    /* ================================================================
     * 2. DIRECT RAW GITHUB NETWORK ENGINE (NO CDN)
     * ================================================================ */
    
    // Generates a strict cache-busting timestamp
    function getNonce() {
        return `${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    }

    // Fetches text or binary directly from raw.githubusercontent.com
    async function fetchRawFile(relativePath, commitSha) {
        const branch = window.codeUpdateState.activeBranch || PRIMARY_BRANCH;
        const ref = commitSha || branch;
        const cleanPath = relativePath.replace(/^\/+/, '');
        const rawUrl = `https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/${ref}/${cleanPath}?_nc=${getNonce()}`;

        const fetchOptions = {
            method: 'GET',
            cache: 'no-store',
            headers: {
                'Cache-Control': 'no-cache, no-store, must-revalidate',
                'Pragma': 'no-cache'
            }
        };

        // Standard fetch
        try {
            const res = await fetch(rawUrl, fetchOptions);
            if (res.ok) {
                return res;
            }
        } catch (err) {
            log(`Standard fetch failed for ${cleanPath}: ${err.message}`, 'warn');
        }

        // Native Tauri HTTP Fallback (for Tauri desktop/mobile runtime)
        if (window.__TAURI__ && (window.__TAURI__.http || window.__TAURI__.core)) {
            try {
                const http = window.__TAURI__.http || window.__TAURI__.core;
                const isBinary = cleanPath.endsWith('.db');
                const tauriRes = await http.fetch(rawUrl, {
                    method: 'GET',
                    responseType: isBinary ? 3 : 2 // 3 = Binary/ArrayBuffer, 2 = Text
                });
                if (tauriRes && tauriRes.ok) {
                    return {
                        ok: true,
                        status: 200,
                        text: async () => typeof tauriRes.data === 'string' ? tauriRes.data : new TextDecoder().decode(new Uint8Array(tauriRes.data)),
                        arrayBuffer: async () => isBinary ? new Uint8Array(tauriRes.data).buffer : new TextEncoder().encode(tauriRes.data).buffer
                    };
                }
            } catch (tErr) {
                log(`Tauri native fetch fallback failed for ${cleanPath}: ${tErr.message}`, 'warn');
            }
        }

        return null;
    }

    /* ================================================================
     * 3. DISCOVERY & VALIDATION (Git Trees API)
     * ================================================================ */
    
    // Discovers files across the repository tree
    async function discoverRepositoryFiles(targetSha, branch) {
        const discovered = new Set();

        try {
            // Fetch recursive git tree directly from GitHub API
            const treeUrl = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/git/trees/${targetSha}?recursive=1&_t=${getNonce()}`;
            const res = await fetch(treeUrl, {
                cache: 'no-store',
                headers: { 'Accept': 'application/vnd.github.v3+json' }
            });

            if (res.ok) {
                const data = await res.json();
                if (data && Array.isArray(data.tree)) {
                    data.tree.forEach(item => {
                        if (item.type === 'blob') {
                            const path = item.path;
                            const isIgnored = IGNORED_PATH_PREFIXES.some(prefix => path.startsWith(prefix));
                            const hasAllowedExt = ALLOWED_EXTENSIONS.some(ext => path.toLowerCase().endsWith(ext));

                            if (!isIgnored && hasAllowedExt) {
                                discovered.add(path);
                            }
                        }
                    });
                }
            }
        } catch (err) {
            log(`Tree API discovery skipped: ${err.message}. Using fallback manifest.`, 'warn');
        }

        // If tree discovery yielded results, use it. Otherwise, use CORE_FALLBACK_FILES
        if (discovered.size > 0) {
            return Array.from(discovered);
        }
        return [...CORE_FALLBACK_FILES];
    }

    // Fetches the latest commit SHA for a branch
    async function getLatestCommitSha(branch) {
        // Method A: Direct GitHub REST API
        try {
            const apiUrl = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/commits/${branch}?_t=${getNonce()}`;
            const res = await fetch(apiUrl, {
                cache: 'no-store',
                headers: { 'Accept': 'application/vnd.github.v3+json' }
            });
            if (res.ok) {
                const data = await res.json();
                if (data && data.sha) return data.sha;
            }
        } catch (e) {}

        // Method B: Un-rate-limited GitHub Atom Feed Fallback
        try {
            const feedUrl = `https://github.com/${REPO_OWNER}/${REPO_NAME}/commits/${branch}.atom?_nc=${getNonce()}`;
            const res = await fetch(feedUrl, { cache: 'no-store' });
            if (res.ok) {
                const xml = await res.text();
                const match = xml.match(/Commit\/([a-f0-9]{40})/i);
                if (match && match[1]) return match[1];
            }
        } catch (e) {}

        return null;
    }

    // Content Integrity & Safety Validation
    function validateDownloadedContent(filepath, textContent) {
        if (!textContent || typeof textContent !== 'string') return false;

        const trimmed = textContent.trim();
        // Reject empty or HTML 404 response pages
        if (trimmed.length < 5) return false;
        if (trimmed.startsWith('404: Not Found') || trimmed === 'Not Found') return false;

        // JS files must not return HTML error pages
        if (filepath.endsWith('.js')) {
            if (trimmed.startsWith('<!DOCTYPE html>') || trimmed.startsWith('<html')) {
                return false;
            }
        }

        // CSS files must not return HTML error pages
        if (filepath.endsWith('.css')) {
            if (trimmed.startsWith('<!DOCTYPE html>') || trimmed.startsWith('<html')) {
                return false;
            }
        }

        return true;
    }

    /* ================================================================
     * 4. UPDATE CHECKER
     * ================================================================ */
    async function checkForCodeUpdates(silent = false) {
        if (window.codeUpdateState.checking || window.codeUpdateState.downloading) {
            return null;
        }

        window.codeUpdateState.checking = true;
        updateUIState('checking');

        let targetBranch = PRIMARY_BRANCH;
        let latestSha = await getLatestCommitSha(PRIMARY_BRANCH);

        // Try fallback branch if primary branch fails
        if (!latestSha) {
            log(`Checking fallback branch: ${FALLBACK_BRANCH}...`);
            latestSha = await getLatestCommitSha(FALLBACK_BRANCH);
            if (latestSha) {
                targetBranch = FALLBACK_BRANCH;
            }
        }

        window.codeUpdateState.activeBranch = targetBranch;

        if (!latestSha) {
            window.codeUpdateState.checking = false;
            updateUIState('idle');
            if (!silent) notify('Could not reach GitHub updates server. Check internet connection.', 'error');
            return null;
        }

        const installedSha = localStorage.getItem(STORAGE_KEY_COMMIT);
        log(`Latest Commit: ${latestSha.substring(0, 7)} | Installed: ${installedSha ? installedSha.substring(0, 7) : 'None'}`);

        if (latestSha !== installedSha) {
            const fileList = await discoverRepositoryFiles(latestSha, targetBranch);
            window.codeUpdateState.available = true;
            window.codeUpdateState.latestCommitSha = latestSha;
            window.codeUpdateState.discoveredFiles = fileList;

            updateUIState('available', fileList.length);
            if (!silent) notify(`Update found (${latestSha.substring(0, 7)})! Downloading...`, 'success');

            window.codeUpdateState.checking = false;
            return fileList;
        } else {
            if (!silent) notify('Questionary is up to date!', 'success');
            updateUIState('idle');
        }

        window.codeUpdateState.checking = false;
        return null;
    }

    /* ================================================================
     * 5. ATOMIC DOWNLOADER & INSTALLER
     * ================================================================ */
    async function downloadCodeUpdates(force = false) {
        if (window.codeUpdateState.downloading) return false;

        let targetSha = window.codeUpdateState.latestCommitSha;
        let filesToDownload = window.codeUpdateState.discoveredFiles;

        if (!targetSha || !filesToDownload.length || force) {
            window.codeUpdateState.checking = false;
            filesToDownload = await checkForCodeUpdates(false);
            targetSha = window.codeUpdateState.latestCommitSha;
            if (!filesToDownload || !filesToDownload.length) {
                filesToDownload = [...CORE_FALLBACK_FILES];
            }
        }

        window.codeUpdateState.downloading = true;
        updateUIState('downloading');
        notify('Downloading updates directly from GitHub...', 'info');

        const stagingBuffer = {};
        let downloadedCount = 0;
        let hasCriticalFailure = false;

        for (let i = 0; i < filesToDownload.length; i++) {
            const filePath = filesToDownload[i];
            window.codeUpdateState.progress = Math.round(((i + 1) / filesToDownload.length) * 100);
            updateProgressBar(window.codeUpdateState.progress, `Downloading ${filePath}...`);

            try {
                const res = await fetchRawFile(filePath, targetSha);
                if (!res) {
                    log(`Failed to fetch ${filePath}`, 'warn');
                    // If a core app file is missing, mark critical failure
                    if (['js/app.js', 'index.html', 'css/styles.css'].includes(filePath)) {
                        hasCriticalFailure = true;
                    }
                    continue;
                }

                // SQLite Database Handling
                if (filePath.endsWith('.db')) {
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
                    // Text / Code Files Handling
                    const text = await res.text();
                    if (validateDownloadedContent(filePath, text)) {
                        stagingBuffer[filePath] = text;
                        downloadedCount++;
                    } else {
                        log(`Validation failed for content in ${filePath}`, 'warn');
                        if (['js/app.js', 'index.html'].includes(filePath)) {
                            hasCriticalFailure = true;
                        }
                    }
                }
            } catch (err) {
                log(`Download error on ${filePath}: ${err.message}`, 'error');
            }
        }

        hideProgressBar();

        // ATOMIC COMMIT: Save to storage only if no critical failures occurred
        if (!hasCriticalFailure && downloadedCount >= 2) {
            const currentFiles = getStoredFiles();
            const mergedFiles = { ...currentFiles, ...stagingBuffer };

            const saved = saveStoredFiles(mergedFiles);
            if (saved) {
                if (targetSha) {
                    localStorage.setItem(STORAGE_KEY_COMMIT, targetSha);
                    localStorage.setItem(STORAGE_KEY_BRANCH, window.codeUpdateState.activeBranch);
                }
                log(`Successfully installed update (${downloadedCount} files)! Reloading...`);
                notify(`Update complete (${downloadedCount} files)! Refreshing...`, 'success');
                setTimeout(() => location.reload(), 500);
                return true;
            }
        }

        log('Atomic update aborted: Staging validation failed or critical assets missing.', 'error');
        notify('Update download failed integrity check. Preserving current version.', 'error');
        window.codeUpdateState.downloading = false;
        updateUIState('idle');
        return false;
    }

    /* ================================================================
     * 6. UI SYNCHRONIZATION & EVENT BINDINGS
     * ================================================================ */
    function updateUIState(state) {
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
                btn.title = 'New update available - Click to install';
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

    function updateProgressBar(percent, statusText) {
        const bar = document.getElementById('downloadProgressBar');
        const fill = document.getElementById('downloadProgressFill');
        const text = document.getElementById('downloadProgressText');
        const num = document.getElementById('downloadProgressPercent');

        if (bar) bar.style.display = 'block';
        if (fill) fill.style.width = `${percent}%`;
        if (text && statusText) text.textContent = statusText;
        if (num) num.textContent = `${percent}%`;
    }

    function hideProgressBar() {
        const bar = document.getElementById('downloadProgressBar');
        if (bar) {
            setTimeout(() => { bar.style.display = 'none'; }, 800);
        }
    }

    function attachUIListeners() {
        // Main Check Updates Button
        const btn = document.getElementById('checkUpdatesBtn');
        if (btn && !btn.dataset.updaterAttached) {
            btn.dataset.updaterAttached = 'true';

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
                if (confirm('Force-clear hot-code cache and re-download all latest files from GitHub?')) {
                    resetCache();
                }
            });
        }

        // Home Force Sync Button
        const homeSync = document.getElementById('homeSyncBtn');
        if (homeSync && !homeSync.dataset.updaterAttached) {
            homeSync.dataset.updaterAttached = 'true';
            homeSync.addEventListener('click', (e) => {
                e.preventDefault();
                resetCache();
            });
        }

        // Settings Cache Reset Buttons
        const resetBtns = [
            document.getElementById('resetCodeCacheBtn'),
            document.getElementById('resetCodeCacheBtnSettings')
        ];

        resetBtns.forEach(b => {
            if (b && !b.dataset.updaterAttached) {
                b.dataset.updaterAttached = 'true';
                b.addEventListener('click', (e) => {
                    e.preventDefault();
                    resetCache();
                });
            }
        });
    }

    /* ================================================================
     * 7. BOOT & INITIALIZATION SEQUENCE
     * ================================================================ */
    function getViewerUrl(fileUrl) {
        const stored = getStoredFiles();
        if (stored['pdfviewer.html'] && stored['pdfviewer.html'].includes('pdfjsLib')) {
            const blob = new Blob([stored['pdfviewer.html']], { type: 'text/html' });
            return URL.createObjectURL(blob) + '#file=' + encodeURIComponent(fileUrl);
        }
        return 'pdfviewer.html?file=' + encodeURIComponent(fileUrl);
    }

    async function initHotUpdater() {
        log('Booting Hot Updater Engine...');
        applyStoredHTML();
        applyStoredCSS();
        applyStoredJS();
        attachUIListeners();

        // Background update check 3 seconds after boot
        setTimeout(async () => {
            const pending = await checkForCodeUpdates(true);
            if (pending && pending.length > 0) {
                await downloadCodeUpdates();
            }
        }, 3000);
    }

    /* ---------- Public API Exports ---------- */
    global.hotCodeUpdater = {
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

})(typeof window !== 'undefined' ? window : this);