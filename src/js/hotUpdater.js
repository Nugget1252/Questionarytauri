/* =========================================================================
 *   QUESTIONARY HOT UPDATER ENGINE v7.0 (Fast, Stable & Focused)
 *   Repository: Nugget1252/Questionarytauri (beta -> main)
 *   ========================================================================= */

(function (global) {
    'use strict';

    if (global._HOT_UPDATER_ENGINE_ACTIVE) return;
    global._HOT_UPDATER_ENGINE_ACTIVE = true;

    /* ---------- Configuration ---------- */
    const REPO_OWNER = 'Nugget1252';
    const REPO_NAME = 'Questionarytauri';
    const PRIMARY_BRANCH = 'beta';
    const FALLBACK_BRANCH = 'main';

    const STORAGE_KEY_FILES = 'questionary_hot_files';
    const STORAGE_KEY_COMMIT = 'questionary_hot_commit_sha';
    const STORAGE_KEY_BRANCH = 'questionary_hot_branch';

    /* Code & DB files to manage (Documents are loaded on-demand, NOT bulk-downloaded) */
    const MANAGED_FILES = [
        'index.html',
        'pdfviewer.html',
        'css/styles.css',
        'css/features.css',
        'js/features.js',
        'js/studyRoom.js',
        'js/contentUpdater.js',
        'js/app.js',
        'questionary.db'
    ];

    /* Global State */
    global.codeUpdateState = {
        checking: false,
        downloading: false,
        available: false,
        latestCommitSha: null,
        installedCommitSha: localStorage.getItem(STORAGE_KEY_COMMIT) || null,
        activeBranch: PRIMARY_BRANCH,
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
        if (typeof global.showNotification === 'function') {
            global.showNotification(message, type);
        } else {
            log(`[${type.toUpperCase()}] ${message}`);
        }
    }

    function normalizePath(filePath) {
        return filePath.replace(/^src\//, '').replace(/^\/+/, '');
    }

    /* ---------- Code Storage (localStorage) ---------- */
    function getStoredCodeFiles() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY_FILES);
            if (!raw) return {};
            const parsed = JSON.parse(raw);
            let sanitized = false;
            Object.keys(parsed).forEach(k => {
                if (k.endsWith('.db') || k.endsWith('.pdf') || typeof parsed[k] !== 'string') {
                    delete parsed[k];
                    sanitized = true;
                }
            });
            if (sanitized) localStorage.setItem(STORAGE_KEY_FILES, JSON.stringify(parsed));
            return parsed;
        } catch (e) {
            localStorage.removeItem(STORAGE_KEY_FILES);
            return {};
        }
    }

    function saveStoredCodeFiles(filesMap) {
        try {
            const cleanMap = {};
            for (const [k, v] of Object.entries(filesMap)) {
                if (!k.endsWith('.db') && !k.endsWith('.pdf') && typeof v === 'string') {
                    cleanMap[k] = v;
                }
            }
            localStorage.setItem(STORAGE_KEY_FILES, JSON.stringify(cleanMap));
            return true;
        } catch (e) {
            return false;
        }
    }

    /* ---------- Cache Reset & Self-Healing ---------- */
    async function resetCache(shouldReload = true) {
        log('Purging code cache and restoring base setup...');
        localStorage.removeItem(STORAGE_KEY_FILES);
        localStorage.removeItem(STORAGE_KEY_COMMIT);
        localStorage.removeItem(STORAGE_KEY_BRANCH);
        localStorage.removeItem('questionary-code-files');

        // Delete any clogged document caches from previous bug
        try { indexedDB.deleteDatabase('QuestionaryDocumentCache'); } catch (e) {}
        try { indexedDB.deleteDatabase('QuestionaryDB'); } catch (e) {}

        delete global._HOT_APP_JS_LOADED;
        delete global._HOT_STUDY_ROOM_LOADED;
        delete global._HOT_FEATURES_LOADED;
        delete global._HOT_CONTENT_UPDATER_LOADED;

        notify('Cache cleared. Reloading...', 'info');
        if (shouldReload) {
            setTimeout(() => location.reload(), 400);
        }
    }

    /* ================================================================
     * 1. LIVE DOM & SCRIPT INJECTION (Global Execution Scope)
     * ================================================================ */
    function applyStoredCSS() {
        const stored = getStoredCodeFiles();
        for (const [filename, content] of Object.entries(stored)) {
            if (filename.endsWith('.css') && typeof content === 'string') {
                const norm = normalizePath(filename);
                const styleId = `hot-css-${norm.replace(/[^a-zA-Z0-9]/g, '-')}`;
                let styleEl = document.getElementById(styleId);
                if (!styleEl) {
                    styleEl = document.createElement('style');
                    styleEl.id = styleId;
                    document.head.appendChild(styleEl);
                }
                styleEl.textContent = content;
                log(`Applied stylesheet: ${norm}`);
            }
        }
    }

    function applyStoredJS() {
        const stored = getStoredCodeFiles();
        if (!stored || Object.keys(stored).length === 0) return;

        const executionOrder = [
            'js/features.js',
            'js/studyRoom.js',
            'js/contentUpdater.js',
            'js/app.js'
        ];

        for (const filename of executionOrder) {
            const content = stored[filename];
            if (content && typeof content === 'string' && content.trim().length > 30) {
                try {
                    const norm = normalizePath(filename);
                    const scriptId = `hot-js-${norm.replace(/[^a-zA-Z0-9]/g, '-')}`;
                    const oldScript = document.getElementById(scriptId);
                    if (oldScript) oldScript.remove();

                    if (norm.includes('app.js')) global._HOT_APP_JS_LOADED = true;
                    if (norm.includes('studyRoom.js')) global._HOT_STUDY_ROOM_LOADED = true;
                    if (norm.includes('features.js')) global._HOT_FEATURES_LOADED = true;
                    if (norm.includes('contentUpdater.js')) global._HOT_CONTENT_UPDATER_LOADED = true;

                    const scriptEl = document.createElement('script');
                    scriptEl.id = scriptId;
                    scriptEl.type = 'text/javascript';
                    scriptEl.textContent = `${content}\n//# sourceURL=hotUpdate://${norm}`;
                    document.head.appendChild(scriptEl);
                    log(`Hot script loaded: ${norm}`);
                } catch (err) {
                    log(`Script eval error (${filename}): ${err.message}`, 'error');
                }
            }
        }
    }

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
                    log(`Hot-patched #${id}`);
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
     * 2. CORS-SAFE NETWORKING (NO PREFLIGHT HEADERS)
     * ================================================================ */
    async function fetchRawAsset(filePath, commitSha) {
        const branch = global.codeUpdateState.activeBranch || PRIMARY_BRANCH;
        const ref = commitSha || branch;
        const nonce = `${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        
        // Search root, then src/
        const candidatePaths = [filePath, `src/${filePath}`];
        const isBinary = filePath.endsWith('.db');

        for (const p of candidatePaths) {
            const rawUrl = `https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/${ref}/${p}?_nc=${nonce}`;
            try {
                // Simple GET without custom headers prevents CORS OPTIONS preflight
                const res = await fetch(rawUrl);
                if (res.ok) {
                    if (isBinary) {
                        const buffer = await res.arrayBuffer();
                        if (buffer && buffer.byteLength > 100) {
                            return { isBinary: true, buffer };
                        }
                    } else {
                        const text = await res.text();
                        const trimmed = text.trim();
                        if (trimmed.length > 10 && !trimmed.startsWith('404: Not Found') && !trimmed.startsWith('<!DOCTYPE html>')) {
                            return { isBinary: false, text };
                        }
                    }
                }
            } catch (e) {}
        }
        return null;
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
     * 3. UPDATE CHECKER & DOWNLOADER
     * ================================================================ */
    async function checkForCodeUpdates(silent = false) {
        if (global.codeUpdateState.checking || global.codeUpdateState.downloading) {
            return null;
        }

        global.codeUpdateState.checking = true;
        updateUIState('checking');

        let targetBranch = PRIMARY_BRANCH;
        let latestSha = await getLatestCommitSha(PRIMARY_BRANCH);

        if (!latestSha) {
            latestSha = await getLatestCommitSha(FALLBACK_BRANCH);
            if (latestSha) targetBranch = FALLBACK_BRANCH;
        }

        global.codeUpdateState.activeBranch = targetBranch;

        if (!latestSha) {
            global.codeUpdateState.checking = false;
            updateUIState('idle');
            if (!silent) notify('Could not reach GitHub updates server.', 'error');
            return null;
        }

        const installedSha = localStorage.getItem(STORAGE_KEY_COMMIT);
        log(`Latest: ${latestSha.substring(0, 7)} | Installed: ${installedSha ? installedSha.substring(0, 7) : 'None'}`);

        if (latestSha !== installedSha) {
            global.codeUpdateState.available = true;
            global.codeUpdateState.latestCommitSha = latestSha;
            updateUIState('available');
            if (!silent) notify(`Update found (${latestSha.substring(0, 7)})! Downloading...`, 'success');

            global.codeUpdateState.checking = false;
            return MANAGED_FILES;
        } else {
            if (!silent) notify('Questionary is up to date!', 'success');
            updateUIState('idle');
        }

        global.codeUpdateState.checking = false;
        return null;
    }

    async function downloadCodeUpdates(force = false) {
        if (global.codeUpdateState.downloading) return false;

        let targetSha = global.codeUpdateState.latestCommitSha;

        if (!targetSha || force) {
            global.codeUpdateState.checking = false;
            await checkForCodeUpdates(false);
            targetSha = global.codeUpdateState.latestCommitSha;
        }

        if (!targetSha && !force) return false;

        global.codeUpdateState.downloading = true;
        updateUIState('downloading');
        notify('Downloading updates from GitHub...', 'info');

        const codeStaging = {};
        let successCount = 0;

        for (let i = 0; i < MANAGED_FILES.length; i++) {
            const file = MANAGED_FILES[i];
            global.codeUpdateState.progress = Math.round(((i + 1) / MANAGED_FILES.length) * 100);
            updateProgressBar(global.codeUpdateState.progress, `Updating ${file}...`);

            try {
                const asset = await fetchRawAsset(file, targetSha);
                if (!asset) continue;

                if (asset.isBinary && file.endsWith('.db')) {
                    // Update Database safely via DbService
                    const uInt8 = new Uint8Array(asset.buffer);
                    if (uInt8.length > 5000 && uInt8[0] === 0x53 && uInt8[1] === 0x51 && uInt8[2] === 0x4C) { // "SQLite"
                        if (global.DbService && global.DbService.SQL) {
                            global.DbService.db = new global.DbService.SQL.Database(uInt8);
                            await global.DbService.saveToIndexedDB();
                            log('Updated database successfully');
                            successCount++;
                        }
                    }
                    asset.buffer = null;
                } else if (!asset.isBinary) {
                    codeStaging[file] = asset.text;
                    successCount++;
                }
            } catch (err) {
                log(`Error on ${file}: ${err.message}`, 'error');
            }
        }

        hideProgressBar();

        if (successCount >= 2) {
            const currentCode = getStoredCodeFiles();
            const mergedCode = { ...currentCode, ...codeStaging };
            saveStoredCodeFiles(mergedCode);

            if (targetSha) {
                localStorage.setItem(STORAGE_KEY_COMMIT, targetSha);
                localStorage.setItem(STORAGE_KEY_BRANCH, global.codeUpdateState.activeBranch);
            }

            log(`Update complete (${successCount} files). Reloading...`);
            notify(`Update installed! Reloading...`, 'success');
            setTimeout(() => location.reload(), 500);
            return true;
        }

        notify('Update download failed. Preserving current version.', 'error');
        global.codeUpdateState.downloading = false;
        updateUIState('idle');
        return false;
    }

    /* ================================================================
     * 4. UI STATE & PROGRESS
     * ================================================================ */
    function updateUIState(state) {
        const btn = document.getElementById('checkUpdatesBtn');
        if (!btn) return;
        btn.classList.remove('checking', 'available', 'downloading', 'update-available');
        if (state === 'checking') {
            btn.classList.add('checking');
            btn.innerHTML = '<i class="fas fa-sync-alt fa-spin"></i>';
        } else if (state === 'available') {
            btn.classList.add('update-available');
            btn.innerHTML = '<i class="fas fa-download"></i>';
        } else if (state === 'downloading') {
            btn.classList.add('downloading');
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
        } else {
            btn.innerHTML = '<i class="fas fa-sync-alt"></i>';
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
        if (bar) setTimeout(() => { bar.style.display = 'none'; }, 800);
    }

    function attachListeners() {
        const btn = document.getElementById('checkUpdatesBtn');
        if (btn && !btn.dataset.hotUpdaterBound) {
            btn.dataset.hotUpdaterBound = 'true';
            btn.addEventListener('click', async (e) => {
                e.preventDefault();
                await downloadCodeUpdates();
            });
            btn.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                if (confirm('Clear code cache and force re-sync from GitHub?')) {
                    resetCache();
                }
            });
        }

        const homeSync = document.getElementById('homeSyncBtn');
        if (homeSync && !homeSync.dataset.hotUpdaterBound) {
            homeSync.dataset.hotUpdaterBound = 'true';
            homeSync.addEventListener('click', (e) => {
                e.preventDefault();
                resetCache();
            });
        }

        ['resetCodeCacheBtn', 'resetCodeCacheBtnSettings'].forEach(id => {
            const b = document.getElementById(id);
            if (b && !b.dataset.hotUpdaterBound) {
                b.dataset.hotUpdaterBound = 'true';
                b.addEventListener('click', (e) => {
                    e.preventDefault();
                    resetCache();
                });
            }
        });
    }

    /* PDF Viewer URL Helper */
    function getViewerUrl(fileUrl) {
        if (!fileUrl) return 'pdfviewer.html';
        const absoluteUrl = (fileUrl.startsWith('blob:') || fileUrl.startsWith('data:') || fileUrl.startsWith('http'))
            ? fileUrl
            : new URL(fileUrl, window.location.href).href;
        return 'pdfviewer.html?file=' + encodeURIComponent(absoluteUrl);
    }

    async function initHotUpdater() {
        log('Booting Hot Updater Engine v7.0...');
        applyStoredHTML();
        applyStoredCSS();
        applyStoredJS();
        attachListeners();

        setTimeout(async () => {
            const pending = await checkForCodeUpdates(true);
            if (pending && pending.length > 0) {
                await downloadCodeUpdates();
            }
        }, 4000);
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
        getState: () => global.codeUpdateState
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initHotUpdater);
    } else {
        initHotUpdater();
    }

})(typeof window !== 'undefined' ? window : this);