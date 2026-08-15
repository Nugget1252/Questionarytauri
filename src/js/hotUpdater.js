/* =========================================================================
 *   QUESTIONARY HOT UPDATER ENGINE v5.1 (CORS-Safe Direct-GitHub Engine)
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

    /* Core files fallback list */
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

    /* Files/Folders to ignore */
    const IGNORED_FILES = [
        'package.json',
        'package-lock.json',
        'code-manifest.json',
        'content-manifest.json',
        'tauri.conf.json',
        'Cargo.toml',
        'Cargo.lock'
    ];

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
            return {};
        }
    }

    function saveStoredFiles(filesMap) {
        try {
            localStorage.setItem(STORAGE_KEY_FILES, JSON.stringify(filesMap));
            return true;
        } catch (e) {
            log('Storage error: ' + e.message, 'error');
            return false;
        }
    }

    /* Normalize paths so `src/js/app.js` and `js/app.js` map to `js/app.js` */
    function normalizeAppPath(filePath) {
        return filePath.replace(/^src\//, '').replace(/^\/+/, '');
    }

    /* Base64 UTF-8 Decoder for GitHub API Blobs */
    function b64DecodeUnicode(str) {
        return decodeURIComponent(atob(str.replace(/\s/g, '')).split('').map(function(c) {
            return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
        }).join(''));
    }

    /* ---------- Cache Reset ---------- */
    async function resetCache(shouldReload = true) {
        log('Resetting hot update cache...');
        localStorage.removeItem(STORAGE_KEY_FILES);
        localStorage.removeItem(STORAGE_KEY_COMMIT);
        localStorage.removeItem(STORAGE_KEY_BRANCH);
        localStorage.removeItem(STORAGE_KEY_MANIFEST);

        delete window._HOT_APP_JS_LOADED;
        delete window._HOT_STUDY_ROOM_LOADED;
        delete window._HOT_FEATURES_LOADED;
        delete window._HOT_CONTENT_UPDATER_LOADED;

        notify('Cache cleared. Syncing with GitHub...', 'info');

        const success = await downloadCodeUpdates(true);
        if (!success && shouldReload) {
            location.reload();
        }
    }

    /* ================================================================
     * 1. LIVE DOM & SCRIPT INJECTION (Global Execution Scope)
     * ================================================================ */
    function applyHotCSS(filename, content) {
        if (!content || content.trim().length < 5) return;
        const norm = normalizeAppPath(filename);
        const styleId = `hot-css-${norm.replace(/[^a-zA-Z0-9]/g, '-')}`;
        let styleEl = document.getElementById(styleId);

        if (!styleEl) {
            styleEl = document.createElement('style');
            styleEl.id = styleId;
            document.head.appendChild(styleEl);
        }
        styleEl.textContent = content;
        log(`Live hot-swapped CSS: ${norm}`);
    }

    function applyStoredCSS() {
        const stored = getStoredFiles();
        for (const [filename, content] of Object.entries(stored)) {
            if (filename.endsWith('.css') && typeof content === 'string') {
                applyHotCSS(filename, content);
            }
        }
    }

    function applyStoredJS() {
        const stored = getStoredFiles();
        if (Object.keys(stored).length === 0) return;

        const executionOrder = [
            'js/features.js',
            'js/studyRoom.js',
            'js/contentUpdater.js',
            'js/app.js'
        ];

        const allStoredJs = Object.keys(stored).filter(k => k.endsWith('.js') && !executionOrder.includes(k));
        const finalOrder = [...executionOrder, ...allStoredJs];

        for (const filename of finalOrder) {
            const norm = normalizeAppPath(filename);
            const content = stored[norm] || stored[filename];

            if (content && typeof content === 'string' && content.trim().length > 30) {
                try {
                    log(`Executing hot script: ${norm}`);
                    const scriptId = `hot-js-${norm.replace(/[^a-zA-Z0-9]/g, '-')}`;
                    const oldScript = document.getElementById(scriptId);
                    if (oldScript) oldScript.remove();

                    if (norm.includes('app.js')) window._HOT_APP_JS_LOADED = true;
                    if (norm.includes('studyRoom.js')) window._HOT_STUDY_ROOM_LOADED = true;
                    if (norm.includes('features.js')) window._HOT_FEATURES_LOADED = true;
                    if (norm.includes('contentUpdater.js')) window._HOT_CONTENT_UPDATER_LOADED = true;

                    const scriptEl = document.createElement('script');
                    scriptEl.id = scriptId;
                    scriptEl.type = 'text/javascript';
                    scriptEl.textContent = `${content}\n//# sourceURL=hotUpdate://${norm}`;
                    document.head.appendChild(scriptEl);
                } catch (err) {
                    log(`Script eval error (${norm}): ${err.message}`, 'error');
                }
            }
        }
    }

    function applyStoredHTML() {
        const stored = getStoredFiles();
        const storedHtml = stored['index.html'] || stored['src/index.html'];
        if (!storedHtml || storedHtml.trim().length < 100) return;

        try {
            const parser = new DOMParser();
            const newDoc = parser.parseFromString(storedHtml, 'text/html');

            const newHeader = newDoc.querySelector('header.header') || newDoc.querySelector('.header');
            const curHeader = document.querySelector('header.header') || document.querySelector('.header');
            if (newHeader && curHeader && newHeader.innerHTML !== curHeader.innerHTML) {
                curHeader.innerHTML = newHeader.innerHTML;
                log('Hot-patched navigation header');
            }

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
            log(`HTML patch error: ${err.message}`, 'error');
        }
    }

    /* ================================================================
     * 2. CORS-SAFE GITHUB FETCHER (NO PREFLIGHT HEADERS)
     * ================================================================ */
    async function fetchFileContent(fileObj, commitSha) {
        const branch = window.codeUpdateState.activeBranch || PRIMARY_BRANCH;
        const ref = commitSha || branch;
        const repoPath = typeof fileObj === 'string' ? fileObj : fileObj.path;
        const blobSha = typeof fileObj === 'object' ? fileObj.sha : null;
        const isDb = repoPath.endsWith('.db');

        // TIER 1: Direct Simple GET from raw.githubusercontent.com (NO custom headers!)
        const nonce = `${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        const rawUrl = `https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/${ref}/${repoPath}?_nc=${nonce}`;

        try {
            // Note: NO custom headers! This prevents the browser from sending an OPTIONS preflight
            const res = await fetch(rawUrl);
            if (res.ok) {
                if (isDb) {
                    const buf = await res.arrayBuffer();
                    return { isDb: true, buffer: buf };
                } else {
                    const txt = await res.text();
                    if (validateDownloadedContent(repoPath, txt)) {
                        return { isDb: false, text: txt };
                    }
                }
            }
        } catch (err) {
            log(`Raw fetch failed for ${repoPath}: ${err.message}`, 'warn');
        }

        // TIER 2: GitHub API Blob Fetch (100% CORS-friendly REST endpoint)
        if (blobSha) {
            try {
                const blobApiUrl = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/git/blobs/${blobSha}?_t=${Date.now()}`;
                const res = await fetch(blobApiUrl);
                if (res.ok) {
                    const data = await res.json();
                    if (data && data.content) {
                        if (isDb) {
                            const binStr = atob(data.content.replace(/\s/g, ''));
                            const len = binStr.length;
                            const bytes = new Uint8Array(len);
                            for (let i = 0; i < len; i++) {
                                bytes[i] = binStr.charCodeAt(i);
                            }
                            return { isDb: true, buffer: bytes.buffer };
                        } else {
                            const decoded = b64DecodeUnicode(data.content);
                            if (validateDownloadedContent(repoPath, decoded)) {
                                return { isDb: false, text: decoded };
                            }
                        }
                    }
                }
            } catch (bErr) {
                log(`Blob API fetch failed for ${repoPath}: ${bErr.message}`, 'warn');
            }
        }

        // TIER 3: Native Tauri HTTP Plugin (if running in desktop/mobile Tauri shell)
        if (window.__TAURI__ && (window.__TAURI__.http || window.__TAURI__.core)) {
            try {
                const http = window.__TAURI__.http || window.__TAURI__.core;
                const tauriRes = await http.fetch(rawUrl, {
                    method: 'GET',
                    responseType: isDb ? 3 : 2
                });
                if (tauriRes && tauriRes.ok) {
                    if (isDb) {
                        return { isDb: true, buffer: new Uint8Array(tauriRes.data).buffer };
                    } else {
                        const txt = typeof tauriRes.data === 'string' ? tauriRes.data : new TextDecoder().decode(new Uint8Array(tauriRes.data));
                        return { isDb: false, text: txt };
                    }
                }
            } catch (tErr) {}
        }

        return null;
    }

    function validateDownloadedContent(filepath, textContent) {
        if (!textContent || typeof textContent !== 'string') return false;
        const trimmed = textContent.trim();
        if (trimmed.length < 5) return false;
        if (trimmed.startsWith('404: Not Found') || trimmed === 'Not Found') return false;
        if ((filepath.endsWith('.js') || filepath.endsWith('.css')) && (trimmed.startsWith('<!DOCTYPE html>') || trimmed.startsWith('<html'))) {
            return false;
        }
        return true;
    }

    /* ================================================================
     * 3. DISCOVERY (Git Trees API)
     * ================================================================ */
    async function discoverRepositoryFiles(targetSha) {
        const fileMap = [];

        try {
            const treeUrl = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/git/trees/${targetSha}?recursive=1&_t=${Date.now()}`;
            const res = await fetch(treeUrl);

            if (res.ok) {
                const data = await res.json();
                if (data && Array.isArray(data.tree)) {
                    data.tree.forEach(item => {
                        if (item.type === 'blob') {
                            const path = item.path;
                            const filename = path.split('/').pop();
                            const isIgnoredPrefix = IGNORED_PATH_PREFIXES.some(p => path.startsWith(p));
                            const isIgnoredFile = IGNORED_FILES.includes(filename);
                            const hasAllowedExt = ['.html', '.css', '.js', '.db'].some(ext => path.toLowerCase().endsWith(ext));

                            if (!isIgnoredPrefix && !isIgnoredFile && hasAllowedExt) {
                                fileMap.push({
                                    path: path,
                                    sha: item.sha,
                                    normPath: normalizeAppPath(path)
                                });
                            }
                        }
                    });
                }
            }
        } catch (err) {
            log(`Tree API discovery notice: ${err.message}`, 'warn');
        }

        if (fileMap.length > 0) return fileMap;

        return CORE_FALLBACK_FILES.map(f => ({
            path: f,
            sha: null,
            normPath: normalizeAppPath(f)
        }));
    }

    async function getLatestCommitSha(branch) {
        try {
            const apiUrl = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/commits/${branch}?_t=${Date.now()}`;
            const res = await fetch(apiUrl);
            if (res.ok) {
                const data = await res.json();
                if (data && data.sha) return data.sha;
            }
        } catch (e) {}

        try {
            const feedUrl = `https://github.com/${REPO_OWNER}/${REPO_NAME}/commits/${branch}.atom?_nc=${Date.now()}`;
            const res = await fetch(feedUrl);
            if (res.ok) {
                const xml = await res.text();
                const match = xml.match(/Commit\/([a-f0-9]{40})/i);
                if (match && match[1]) return match[1];
            }
        } catch (e) {}

        return null;
    }

    /* ================================================================
     * 4. CHECK & ATOMIC INSTALL
     * ================================================================ */
    async function checkForCodeUpdates(silent = false) {
        if (window.codeUpdateState.checking || window.codeUpdateState.downloading) {
            return null;
        }

        window.codeUpdateState.checking = true;
        updateUIState('checking');

        let targetBranch = PRIMARY_BRANCH;
        let latestSha = await getLatestCommitSha(PRIMARY_BRANCH);

        if (!latestSha) {
            latestSha = await getLatestCommitSha(FALLBACK_BRANCH);
            if (latestSha) targetBranch = FALLBACK_BRANCH;
        }

        window.codeUpdateState.activeBranch = targetBranch;

        if (!latestSha) {
            window.codeUpdateState.checking = false;
            updateUIState('idle');
            if (!silent) notify('Could not reach GitHub updates server.', 'error');
            return null;
        }

        const installedSha = localStorage.getItem(STORAGE_KEY_COMMIT);
        log(`Latest: ${latestSha.substring(0, 7)} | Installed: ${installedSha ? installedSha.substring(0, 7) : 'None'}`);

        if (latestSha !== installedSha) {
            const fileList = await discoverRepositoryFiles(latestSha);
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

    async function downloadCodeUpdates(force = false) {
        if (window.codeUpdateState.downloading) return false;

        let targetSha = window.codeUpdateState.latestCommitSha;
        let filesToDownload = window.codeUpdateState.discoveredFiles;

        if (!targetSha || !filesToDownload.length || force) {
            window.codeUpdateState.checking = false;
            filesToDownload = await checkForCodeUpdates(false);
            targetSha = window.codeUpdateState.latestCommitSha;
            if (!filesToDownload || !filesToDownload.length) {
                filesToDownload = CORE_FALLBACK_FILES.map(f => ({ path: f, sha: null, normPath: normalizeAppPath(f) }));
            }
        }

        window.codeUpdateState.downloading = true;
        updateUIState('downloading');
        notify('Downloading update directly from GitHub...', 'info');

        const stagingBuffer = {};
        let downloadedCount = 0;
        let hasCriticalFailure = false;

        for (let i = 0; i < filesToDownload.length; i++) {
            const fileObj = filesToDownload[i];
            const normPath = fileObj.normPath || normalizeAppPath(fileObj.path || fileObj);

            window.codeUpdateState.progress = Math.round(((i + 1) / filesToDownload.length) * 100);
            updateProgressBar(window.codeUpdateState.progress, `Downloading ${normPath}...`);

            try {
                const res = await fetchFileContent(fileObj, targetSha);
                if (!res) {
                    log(`Failed to download ${normPath}`, 'warn');
                    if (['js/app.js', 'index.html', 'css/styles.css'].includes(normPath)) {
                        hasCriticalFailure = true;
                    }
                    continue;
                }

                if (res.isDb) {
                    const uInt8Array = new Uint8Array(res.buffer);
                    if (uInt8Array.length > 100 && window.DbService && window.DbService.SQL) {
                        window.DbService.db = new window.DbService.SQL.Database(uInt8Array);
                        await window.DbService.saveToIndexedDB();
                        downloadedCount++;
                    }
                } else {
                    stagingBuffer[normPath] = res.text;
                    downloadedCount++;
                }
            } catch (err) {
                log(`Error on ${normPath}: ${err.message}`, 'error');
            }
        }

        hideProgressBar();

        if (!hasCriticalFailure && downloadedCount >= 2) {
            const currentFiles = getStoredFiles();
            const mergedFiles = { ...currentFiles, ...stagingBuffer };

            if (saveStoredFiles(mergedFiles)) {
                if (targetSha) {
                    localStorage.setItem(STORAGE_KEY_COMMIT, targetSha);
                    localStorage.setItem(STORAGE_KEY_BRANCH, window.codeUpdateState.activeBranch);
                }
                log(`Successfully installed update (${downloadedCount} files)! Reloading...`);
                notify(`Update installed (${downloadedCount} files)! Refreshing...`, 'success');
                setTimeout(() => location.reload(), 500);
                return true;
            }
        }

        log('Atomic update rejected due to validation failure or missing files.', 'error');
        notify('Update download failed. Preserving current version.', 'error');
        window.codeUpdateState.downloading = false;
        updateUIState('idle');
        return false;
    }

    /* ================================================================
     * 5. UI & EVENT BINDINGS
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
                if (confirm('Force-clear cache and re-download all latest files from GitHub?')) {
                    resetCache();
                }
            });
        }

        const homeSync = document.getElementById('homeSyncBtn');
        if (homeSync && !homeSync.dataset.updaterAttached) {
            homeSync.dataset.updaterAttached = 'true';
            homeSync.addEventListener('click', (e) => {
                e.preventDefault();
                resetCache();
            });
        }

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
     * 6. BOOTSTRAP
     * ================================================================ */
    function getViewerUrl(fileUrl) {
        const stored = getStoredFiles();
        const html = stored['pdfviewer.html'] || stored['src/pdfviewer.html'];
        if (html && html.includes('pdfjsLib')) {
            const blob = new Blob([html], { type: 'text/html' });
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

        setTimeout(async () => {
            const pending = await checkForCodeUpdates(true);
            if (pending && pending.length > 0) {
                await downloadCodeUpdates();
            }
        }, 3000);
    }

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