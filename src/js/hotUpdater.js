/* =========================================================================
 *   QUESTIONARY HOT UPDATER ENGINE v5.3 (Production Master Engine)
 *   Repository: Nugget1252/Questionarytauri (beta -> main)
 *   Zero-CDN | Direct GitHub Raw | CORS Safe | Low Memory Footprint
 *   ========================================================================= */

(function (global) {
    'use strict';

    // Prevent duplicate engine execution
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

    /* Explicit Code-Only Files (Strictly NO .db files to prevent memory exhaustion) */
    const MANAGED_CODE_FILES = [
        'index.html',
        'pdfviewer.html',
        'css/styles.css',
        'css/features.css',
        'js/features.js',
        'js/studyRoom.js',
        'js/contentUpdater.js',
        'js/app.js'
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

    /* ---------- Sanitized Storage Layer ---------- */
    function getCleanStoredFiles() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY_FILES);
            if (!raw) return {};
            const parsed = JSON.parse(raw);

            // Sanitization: Strip out any binary or .db entries from legacy cache
            let mutated = false;
            Object.keys(parsed).forEach(k => {
                if (k.endsWith('.db') || typeof parsed[k] !== 'string') {
                    delete parsed[k];
                    mutated = true;
                }
            });

            if (mutated) {
                localStorage.setItem(STORAGE_KEY_FILES, JSON.stringify(parsed));
            }
            return parsed;
        } catch (e) {
            log('Error reading storage cache, resetting...', 'warn');
            localStorage.removeItem(STORAGE_KEY_FILES);
            return {};
        }
    }

    function saveStoredFiles(filesMap) {
        try {
            const cleanMap = {};
            for (const [k, v] of Object.entries(filesMap)) {
                // Ensure only text code is saved
                if (!k.endsWith('.db') && typeof v === 'string' && v.trim().length > 0) {
                    cleanMap[k] = v;
                }
            }
            localStorage.setItem(STORAGE_KEY_FILES, JSON.stringify(cleanMap));
            return true;
        } catch (e) {
            log('Failed to save code files to localStorage: ' + e.message, 'error');
            return false;
        }
    }

    /* ---------- Cache Reset & Purge ---------- */
    async function resetCache(shouldReload = true) {
        log('Purging code cache and restoring base bundle...');
        localStorage.removeItem(STORAGE_KEY_FILES);
        localStorage.removeItem(STORAGE_KEY_COMMIT);
        localStorage.removeItem(STORAGE_KEY_BRANCH);
        localStorage.removeItem('questionary-code-files');

        delete global._HOT_APP_JS_LOADED;
        delete global._HOT_STUDY_ROOM_LOADED;
        delete global._HOT_FEATURES_LOADED;
        delete global._HOT_CONTENT_UPDATER_LOADED;

        notify('Cache cleared. Reloading application...', 'info');

        if (shouldReload) {
            setTimeout(() => location.reload(), 300);
        }
    }

    /* ================================================================
     * 1. LIVE DOM & GLOBAL SCRIPT INJECTION
     * ================================================================ */
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
        log(`Applied stylesheet: ${filename}`);
    }

    function applyStoredCSS() {
        const stored = getCleanStoredFiles();
        for (const [filename, content] of Object.entries(stored)) {
            if (filename.endsWith('.css') && typeof content === 'string') {
                applyHotCSS(filename, content);
            }
        }
    }

    function applyStoredJS() {
        const stored = getCleanStoredFiles();
        if (!stored || Object.keys(stored).length === 0) return;

        // Strict execution order to satisfy dependency hierarchy
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
                    const scriptId = `hot-js-${filename.replace(/[^a-zA-Z0-9]/g, '-')}`;
                    const oldScript = document.getElementById(scriptId);
                    if (oldScript) oldScript.remove();

                    if (filename.includes('app.js')) global._HOT_APP_JS_LOADED = true;
                    if (filename.includes('studyRoom.js')) global._HOT_STUDY_ROOM_LOADED = true;
                    if (filename.includes('features.js')) global._HOT_FEATURES_LOADED = true;
                    if (filename.includes('contentUpdater.js')) global._HOT_CONTENT_UPDATER_LOADED = true;

                    // Inject <script> into <head> for true global scope execution
                    const scriptEl = document.createElement('script');
                    scriptEl.id = scriptId;
                    scriptEl.type = 'text/javascript';
                    scriptEl.textContent = `${content}\n//# sourceURL=hotUpdate://${filename}`;
                    document.head.appendChild(scriptEl);
                    log(`Hot script evaluated: ${filename}`);
                } catch (err) {
                    log(`Script eval error (${filename}): ${err.message}`, 'error');
                }
            }
        }
    }

    function applyStoredHTML() {
        const stored = getCleanStoredFiles();
        const storedHtml = stored['index.html'];
        if (!storedHtml || storedHtml.trim().length < 100) return;

        try {
            const parser = new DOMParser();
            const newDoc = parser.parseFromString(storedHtml, 'text/html');

            // Sync Header
            const newHeader = newDoc.querySelector('header.header') || newDoc.querySelector('.header');
            const curHeader = document.querySelector('header.header') || document.querySelector('.header');
            if (newHeader && curHeader && newHeader.innerHTML !== curHeader.innerHTML) {
                curHeader.innerHTML = newHeader.innerHTML;
                log('Hot-patched navigation header');
            }

            // Sync Interactive Panels & Overlays
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
            log(`HTML patch error: ${err.message}`, 'error');
        }
    }

    /* ================================================================
     * 2. CORS-SAFE GITHUB NETWORK LAYER (NO PREFLIGHT HEADERS)
     * ================================================================ */
    async function fetchRawFileText(filePath, commitSha) {
        const branch = global.codeUpdateState.activeBranch || PRIMARY_BRANCH;
        const ref = commitSha || branch;
        const nonce = `${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        
        // Search in root, then in src/
        const candidatePaths = [filePath, `src/${filePath}`];

        for (const p of candidatePaths) {
            const rawUrl = `https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/${ref}/${p}?_nc=${nonce}`;
            try {
                // Clean fetch with NO custom headers to avoid CORS OPTIONS 403
                const res = await fetch(rawUrl);
                if (res.ok) {
                    const text = await res.text();
                    if (text && text.trim().length > 10) {
                        const trimmed = text.trim();
                        // Reject 404 text pages and HTML error pages disguised as JS/CSS
                        if (!trimmed.startsWith('404: Not Found') && !trimmed.startsWith('<!DOCTYPE html>')) {
                            return text;
                        }
                    }
                }
            } catch (err) {
                // Log silently and try next candidate path
            }
        }
        return null;
    }

    async function getLatestCommitSha(branch) {
        // Method A: Direct GitHub REST API
        try {
            const apiUrl = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/commits/${branch}?_t=${Date.now()}`;
            const res = await fetch(apiUrl);
            if (res.ok) {
                const data = await res.json();
                if (data && data.sha) return data.sha;
            }
        } catch (e) {}

        // Method B: Un-rate-limited GitHub Atom Feed Fallback
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
     * 3. SEQUENTIAL ATOMIC UPDATE
     * ================================================================ */
    async function checkForCodeUpdates(silent = false) {
        if (global.codeUpdateState.checking || global.codeUpdateState.downloading) {
            return null;
        }

        global.codeUpdateState.checking = true;
        updateUIState('checking');

        let targetBranch = PRIMARY_BRANCH;
        let latestSha = await getLatestCommitSha(PRIMARY_BRANCH);

        // Fallback branch if primary is unreachable
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
            return MANAGED_CODE_FILES;
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

        const staging = {};
        let successCount = 0;

        for (let i = 0; i < MANAGED_CODE_FILES.length; i++) {
            const file = MANAGED_CODE_FILES[i];
            global.codeUpdateState.progress = Math.round(((i + 1) / MANAGED_CODE_FILES.length) * 100);
            updateProgressBar(global.codeUpdateState.progress, `Updating ${file}...`);

            try {
                const content = await fetchRawFileText(file, targetSha);
                if (content) {
                    staging[file] = content;
                    successCount++;
                } else {
                    log(`Could not fetch ${file}`, 'warn');
                }
            } catch (err) {
                log(`Error on ${file}: ${err.message}`, 'error');
            }
        }

        hideProgressBar();

        // Require at least 3 core files to pass validation before committing
        if (successCount >= 3) {
            const current = getCleanStoredFiles();
            const merged = { ...current, ...staging };

            if (saveStoredFiles(merged)) {
                if (targetSha) {
                    localStorage.setItem(STORAGE_KEY_COMMIT, targetSha);
                    localStorage.setItem(STORAGE_KEY_BRANCH, global.codeUpdateState.activeBranch);
                }
                log(`Successfully installed update (${successCount} files)! Reloading...`);
                notify(`Update installed (${successCount} files)! Refreshing...`, 'success');
                setTimeout(() => location.reload(), 600);
                return true;
            }
        }

        log('Update failed validation or insufficient files received.', 'error');
        notify('Update download failed. Preserving current version.', 'error');
        global.codeUpdateState.downloading = false;
        updateUIState('idle');
        return false;
    }

    /* ================================================================
     * 4. UI STATE & LISTENERS
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

    function attachListeners() {
        const btn = document.getElementById('checkUpdatesBtn');
        if (btn && !btn.dataset.hotUpdaterBound) {
            btn.dataset.hotUpdaterBound = 'true';

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
                if (confirm('Clear code cache and force re-sync all latest files from GitHub?')) {
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

        const resetBtnIds = ['resetCodeCacheBtn', 'resetCodeCacheBtnSettings'];
        resetBtnIds.forEach(id => {
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

    /* ================================================================
     * 5. PDF VIEWER HELPER & BOOTSTRAP
     * ================================================================ */
    function getViewerUrl(fileUrl) {
        const stored = getCleanStoredFiles();
        const html = stored['pdfviewer.html'];
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
        attachListeners();

        // Silent update check 4 seconds after boot
        setTimeout(async () => {
            const pending = await checkForCodeUpdates(true);
            if (pending && pending.length > 0) {
                await downloadCodeUpdates();
            }
        }, 4000);
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
        getState: () => global.codeUpdateState
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initHotUpdater);
    } else {
        initHotUpdater();
    }

})(typeof window !== 'undefined' ? window : this);