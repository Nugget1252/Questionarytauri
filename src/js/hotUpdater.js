/* =========================================================================
 *   QUESTIONARY UNIFIED HOT UPDATER & ASSET ENGINE v6.5
 *   Repository: Nugget1252/Questionarytauri (beta -> main)
 *   
 *   Architecture:
 *   - Code (JS/CSS/HTML)      -> localStorage (Evaluated in Global Scope)
 *   - SQLite (questionary.db) -> IndexedDB ("QuestionaryDB")
 *   - Documents (*.pdf)       -> IndexedDB ("QuestionaryDocumentCache")
 *   - Networking              -> Direct Raw GitHub + GitHub API (Zero CORS)
 *   ========================================================================= */

(function (global) {
    'use strict';

    if (global._HOT_UPDATER_ENGINE_ACTIVE) return;
    global._HOT_UPDATER_ENGINE_ACTIVE = true;

    /* ================================================================
     * 1. CONSTANTS & CONFIGURATION
     * ================================================================ */
    const REPO_OWNER = 'Nugget1252';
    const REPO_NAME = 'Questionarytauri';
    const PRIMARY_BRANCH = 'beta';
    const FALLBACK_BRANCH = 'main';

    /* Storage Keys */
    const STORAGE_KEY_FILES = 'questionary_hot_files';
    const STORAGE_KEY_COMMIT = 'questionary_hot_commit_sha';
    const STORAGE_KEY_BRANCH = 'questionary_hot_branch';
    const STORAGE_KEY_BACKUP = 'questionary_hot_backup_manifest';

    /* IndexedDB Namespaces */
    const DB_INDEXEDDB_NAME = 'QuestionaryDB';
    const DB_STORE_NAME = 'db_store';
    const DOC_INDEXEDDB_NAME = 'QuestionaryDocumentCache';
    const DOC_STORE_NAME = 'docs_store';

    /* Baseline Managed Code Files */
    const CORE_CODE_FILES = [
        'index.html',
        'pdfviewer.html',
        'css/styles.css',
        'css/features.css',
        'js/features.js',
        'js/studyRoom.js',
        'js/contentUpdater.js',
        'js/app.js'
    ];

    /* Excluded from Dynamic Sync */
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
    global.codeUpdateState = {
        checking: false,
        downloading: false,
        available: false,
        latestCommitSha: null,
        installedCommitSha: localStorage.getItem(STORAGE_KEY_COMMIT) || null,
        activeBranch: PRIMARY_BRANCH,
        discoveredFiles: [],
        progress: 0,
        statusMessage: 'Idle'
    };

    /* ================================================================
     * 2. LOGGING & NOTIFICATIONS
     * ================================================================ */
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

    /* ================================================================
     * 3. STORAGE LAYER (Sanitized & Memory Safe)
     * ================================================================ */
    function getStoredCodeFiles() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY_FILES);
            if (!raw) return {};
            const parsed = JSON.parse(raw);

            // Auto-clean any legacy binary entries
            let needsPurge = false;
            Object.keys(parsed).forEach(k => {
                if (k.endsWith('.db') || k.endsWith('.pdf') || typeof parsed[k] !== 'string') {
                    delete parsed[k];
                    needsPurge = true;
                }
            });

            if (needsPurge) {
                localStorage.setItem(STORAGE_KEY_FILES, JSON.stringify(parsed));
            }
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
            log('Failed to write code files to localStorage: ' + e.message, 'error');
            return false;
        }
    }

    /* ================================================================
     * 4. INDEXEDDB BINARY STORAGE (SQLite DB & Documents)
     * ================================================================ */
    function saveDatabaseToIndexedDB(uInt8Array) {
        return new Promise((resolve, reject) => {
            const req = indexedDB.open(DB_INDEXEDDB_NAME, 1);
            req.onupgradeneeded = e => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains(DB_STORE_NAME)) {
                    db.createObjectStore(DB_STORE_NAME);
                }
            };
            req.onsuccess = e => {
                const db = e.target.result;
                const tx = db.transaction(DB_STORE_NAME, 'readwrite');
                tx.objectStore(DB_STORE_NAME).put(uInt8Array, 'questionary.db');
                tx.oncomplete = () => resolve(true);
                tx.onerror = () => reject(tx.error);
            };
            req.onerror = () => reject(req.error);
        });
    }

    function saveDocumentToIndexedDB(normalizedPath, uInt8Array) {
        return new Promise((resolve, reject) => {
            const req = indexedDB.open(DOC_INDEXEDDB_NAME, 1);
            req.onupgradeneeded = e => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains(DOC_STORE_NAME)) {
                    db.createObjectStore(DOC_STORE_NAME);
                }
            };
            req.onsuccess = e => {
                const db = e.target.result;
                const tx = db.transaction(DOC_STORE_NAME, 'readwrite');
                tx.objectStore(DOC_STORE_NAME).put(uInt8Array, normalizedPath);
                tx.oncomplete = () => resolve(true);
                tx.onerror = () => reject(tx.error);
            };
            req.onerror = () => reject(req.error);
        });
    }

    async function getDocumentBlobFromCache(docPath) {
        if (!docPath || docPath.startsWith('blob:') || docPath.startsWith('data:')) return null;
        const cleanPath = normalizePath(docPath);
        return new Promise(resolve => {
            const req = indexedDB.open(DOC_INDEXEDDB_NAME, 1);
            req.onupgradeneeded = e => {
                if (!e.target.result.objectStoreNames.contains(DOC_STORE_NAME)) {
                    e.target.result.createObjectStore(DOC_STORE_NAME);
                }
            };
            req.onsuccess = e => {
                const db = e.target.result;
                const tx = db.transaction(DOC_STORE_NAME, 'readonly');
                const getReq = tx.objectStore(DOC_STORE_NAME).get(cleanPath);
                getReq.onsuccess = () => {
                    if (getReq.result) {
                        resolve(new Blob([getReq.result], { type: 'application/pdf' }));
                    } else {
                        resolve(null);
                    }
                };
                getReq.onerror = () => resolve(null);
            };
            req.onerror = () => resolve(null);
        });
    }

    /* ================================================================
     * 5. CACHE RESET & ROLLBACK ENGINE
     * ================================================================ */
    async function resetCache(shouldReload = true) {
        log('Resetting all hot-code and document caches...');
        localStorage.removeItem(STORAGE_KEY_FILES);
        localStorage.removeItem(STORAGE_KEY_COMMIT);
        localStorage.removeItem(STORAGE_KEY_BRANCH);
        localStorage.removeItem(STORAGE_KEY_BACKUP);
        localStorage.removeItem('questionary-code-files');

        indexedDB.deleteDatabase(DB_INDEXEDDB_NAME);
        indexedDB.deleteDatabase(DOC_INDEXEDDB_NAME);

        delete global._HOT_APP_JS_LOADED;
        delete global._HOT_STUDY_ROOM_LOADED;
        delete global._HOT_FEATURES_LOADED;
        delete global._HOT_CONTENT_UPDATER_LOADED;

        notify('Cache wiped. Reloading clean application...', 'info');
        if (shouldReload) {
            setTimeout(() => location.reload(), 400);
        }
    }

    /* ================================================================
     * 6. DOM RECONCILER & GLOBAL SCRIPT EXECUTION
     * ================================================================ */
    function applyHotCSS(filename, content) {
        if (!content || content.trim().length < 5) return;
        const norm = normalizePath(filename);
        const styleId = `hot-css-${norm.replace(/[^a-zA-Z0-9]/g, '-')}`;
        let styleEl = document.getElementById(styleId);

        if (!styleEl) {
            styleEl = document.createElement('style');
            styleEl.id = styleId;
            document.head.appendChild(styleEl);
        }
        styleEl.textContent = content;
        log(`Live hot-swapped stylesheet: ${norm}`);
    }

    function applyStoredCSS() {
        const stored = getStoredCodeFiles();
        for (const [filename, content] of Object.entries(stored)) {
            if (filename.endsWith('.css') && typeof content === 'string') {
                applyHotCSS(filename, content);
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

        const additionalJs = Object.keys(stored).filter(k => k.endsWith('.js') && !executionOrder.includes(k));
        const finalOrder = [...executionOrder, ...additionalJs];

        for (const filename of finalOrder) {
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

                    // Execute directly in global scope
                    const scriptEl = document.createElement('script');
                    scriptEl.id = scriptId;
                    scriptEl.type = 'text/javascript';
                    scriptEl.textContent = `${content}\n//# sourceURL=hotUpdate://${norm}`;
                    document.head.appendChild(scriptEl);
                    log(`Hot script evaluated in global scope: ${norm}`);
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

            // 1. Header & Navigation Sync
            const newHeader = newDoc.querySelector('header.header') || newDoc.querySelector('.header');
            const curHeader = document.querySelector('header.header') || document.querySelector('.header');
            if (newHeader && curHeader && newHeader.innerHTML !== curHeader.innerHTML) {
                curHeader.innerHTML = newHeader.innerHTML;
                log('Hot-patched navigation & header');
            }

            // 2. Core Interactive Container Sync
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

            // 3. Modals Sync
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
            log(`DOM patch error: ${err.message}`, 'error');
        }
    }

    /* ================================================================
     * 7. PREFLIGHT-FREE GITHUB & TAURI NETWORK ENGINE
     * ================================================================ */
    async function fetchRawAsset(repoPath, commitSha) {
        const branch = global.codeUpdateState.activeBranch || PRIMARY_BRANCH;
        const ref = commitSha || branch;
        const nonce = `${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        const rawUrl = `https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/${ref}/${repoPath}?_nc=${nonce}`;
        const isBinary = repoPath.endsWith('.db') || repoPath.endsWith('.pdf');

        // TIER 1: Standard Simple GET (No custom headers to prevent CORS 403 preflight)
        try {
            const res = await fetch(rawUrl);
            if (res.ok) {
                if (isBinary) {
                    const buffer = await res.arrayBuffer();
                    if (buffer && buffer.byteLength > 50) return { isBinary: true, buffer };
                } else {
                    const text = await res.text();
                    const trimmed = text.trim();
                    if (trimmed.length > 5 && !trimmed.startsWith('404: Not Found') && !trimmed.startsWith('<!DOCTYPE html>')) {
                        return { isBinary: false, text };
                    }
                }
            }
        } catch (err) {
            log(`Standard fetch failed for ${repoPath}: ${err.message}`, 'warn');
        }

        // TIER 2: Tauri Native HTTP Plugin (Bypasses all webview networking)
        if (global.__TAURI__ && (global.__TAURI__.http || global.__TAURI__.core)) {
            try {
                const http = global.__TAURI__.http || global.__TAURI__.core;
                const tauriRes = await http.fetch(rawUrl, {
                    method: 'GET',
                    responseType: isBinary ? 3 : 2
                });
                if (tauriRes && tauriRes.ok) {
                    if (isBinary) {
                        return { isBinary: true, buffer: new Uint8Array(tauriRes.data).buffer };
                    } else {
                        const txt = typeof tauriRes.data === 'string' ? tauriRes.data : new TextDecoder().decode(new Uint8Array(tauriRes.data));
                        return { isBinary: false, text: txt };
                    }
                }
            } catch (tErr) {
                log(`Tauri HTTP plugin notice on ${repoPath}: ${tErr.message}`, 'warn');
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
     * 8. DYNAMIC ASSET DISCOVERY (Git Trees API)
     * ================================================================ */
    async function discoverAllSyncableFiles(targetSha) {
        const fileMap = new Map();

        try {
            const treeUrl = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/git/trees/${targetSha}?recursive=1&_t=${Date.now()}`;
            const res = await fetch(treeUrl);

            if (res.ok) {
                const data = await res.json();
                if (data && Array.isArray(data.tree)) {
                    data.tree.forEach(item => {
                        if (item.type === 'blob') {
                            const rawPath = item.path;
                            const norm = normalizePath(rawPath);
                            const filename = norm.split('/').pop();

                            const isIgnoredPrefix = IGNORED_PATH_PREFIXES.some(p => rawPath.startsWith(p));
                            const isIgnoredFile = IGNORED_FILES.includes(filename);

                            if (!isIgnoredPrefix && !isIgnoredFile) {
                                const isCode = ['.html', '.css', '.js'].some(ext => norm.endsWith(ext));
                                const isDb = norm === 'questionary.db';
                                const isDoc = norm.startsWith('documents/') && norm.endsWith('.pdf');

                                if (isCode || isDb || isDoc) {
                                    if (!fileMap.has(norm) || !rawPath.startsWith('src/')) {
                                        fileMap.set(norm, {
                                            repoPath: rawPath,
                                            normPath: norm,
                                            isDb: isDb,
                                            isDoc: isDoc,
                                            isCode: isCode
                                        });
                                    }
                                }
                            }
                        }
                    });
                }
            }
        } catch (err) {
            log(`Tree API discovery notice: ${err.message}`, 'warn');
        }

        if (fileMap.size > 0) {
            return Array.from(fileMap.values());
        }

        // Fallback file list if Tree API is rate-limited
        return CORE_CODE_FILES.map(f => ({
            repoPath: f,
            normPath: normalizePath(f),
            isDb: false,
            isDoc: false,
            isCode: true
        })).concat([{
            repoPath: 'questionary.db',
            normPath: 'questionary.db',
            isDb: true,
            isDoc: false,
            isCode: false
        }]);
    }

    /* ================================================================
     * 9. TRANSACTIONAL UPDATE & SYNC CONTROLLER
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
            const files = await discoverAllSyncableFiles(latestSha);
            global.codeUpdateState.available = true;
            global.codeUpdateState.latestCommitSha = latestSha;
            global.codeUpdateState.discoveredFiles = files;

            updateUIState('available');
            if (!silent) notify(`Update found (${latestSha.substring(0, 7)})! Downloading...`, 'success');

            global.codeUpdateState.checking = false;
            return files;
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
        let fileList = global.codeUpdateState.discoveredFiles;

        if (!targetSha || !fileList.length || force) {
            fileList = await checkForCodeUpdates(false);
            targetSha = global.codeUpdateState.latestCommitSha;
            if (!fileList || !fileList.length) {
                fileList = await discoverAllSyncableFiles(targetSha || PRIMARY_BRANCH);
            }
        }

        if (!targetSha && !force) return false;

        global.codeUpdateState.downloading = true;
        updateUIState('downloading');
        notify('Syncing code, database & documents...', 'info');

        const codeStaging = {};
        let successCount = 0;

        for (let i = 0; i < fileList.length; i++) {
            const item = fileList[i];
            global.codeUpdateState.progress = Math.round(((i + 1) / fileList.length) * 100);
            updateProgressBar(global.codeUpdateState.progress, `Syncing ${item.normPath}...`);

            try {
                const asset = await fetchRawAsset(item.repoPath, targetSha);
                if (!asset) continue;

                if (item.isDb) {
                    // SQLite Database handling
                    const uInt8 = new Uint8Array(asset.buffer);
                    // Verify SQLite format signature
                    if (uInt8.length > 5000 && uInt8[0] === 0x53 && uInt8[1] === 0x51 && uInt8[2] === 0x4C) {
                        await saveDatabaseToIndexedDB(uInt8);
                        log('Successfully synced questionary.db to IndexedDB');
                        if (global.DbService && global.DbService.SQL) {
                            global.DbService.db = new global.DbService.SQL.Database(uInt8);
                        }
                        successCount++;
                    }
                    asset.buffer = null; // Free RAM immediately
                } else if (item.isDoc) {
                    // PDF Document handling
                    const uInt8 = new Uint8Array(asset.buffer);
                    if (uInt8.length > 100) {
                        await saveDocumentToIndexedDB(item.normPath, uInt8);
                        log(`Cached document: ${item.normPath}`);
                        successCount++;
                    }
                    asset.buffer = null; // Free RAM immediately
                } else if (item.isCode) {
                    // Code handling
                    codeStaging[item.normPath] = asset.text;
                    successCount++;
                }
            } catch (err) {
                log(`Error syncing ${item.normPath}: ${err.message}`, 'error');
            }
        }

        hideProgressBar();

        if (successCount >= 1) {
            const currentCode = getStoredCodeFiles();
            const mergedCode = { ...currentCode, ...codeStaging };
            saveStoredCodeFiles(mergedCode);

            if (targetSha) {
                localStorage.setItem(STORAGE_KEY_COMMIT, targetSha);
                localStorage.setItem(STORAGE_KEY_BRANCH, global.codeUpdateState.activeBranch);
            }

            notify(`Update installed (${successCount} files)! Reloading...`, 'success');
            setTimeout(() => location.reload(), 500);
            return true;
        }

        notify('Update failed validation. Preserving current version.', 'error');
        global.codeUpdateState.downloading = false;
        updateUIState('idle');
        return false;
    }

    /* ================================================================
     * 10. UI CONTROLS & EVENT LISTENERS
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
        if (bar) setTimeout(() => { bar.style.display = 'none'; }, 800);
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
     * 11. PDF VIEWER INTERCEPTOR
     * ================================================================ */
    async function getViewerUrl(fileUrl) {
        if (!fileUrl) return 'pdfviewer.html';

        if (fileUrl.startsWith('blob:') || fileUrl.startsWith('data:')) {
            return 'pdfviewer.html?file=' + encodeURIComponent(fileUrl);
        }

        try {
            const cachedBlob = await getDocumentBlobFromCache(fileUrl);
            if (cachedBlob) {
                const blobUrl = URL.createObjectURL(cachedBlob);
                return 'pdfviewer.html?file=' + encodeURIComponent(blobUrl);
            }
        } catch (e) {}

        const absoluteUrl = new URL(fileUrl, window.location.href).href;
        return 'pdfviewer.html?file=' + encodeURIComponent(absoluteUrl);
    }

    /* ================================================================
     * 12. BOOTSTRAP INITIALIZER
     * ================================================================ */
    async function initHotUpdater() {
        log('Booting Unified Hot Updater Engine v6.5...');
        applyStoredHTML();
        applyStoredCSS();
        applyStoredJS();
        attachListeners();

        // Silent background check 4 seconds after boot
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
        getDocumentBlob: getDocumentBlobFromCache,
        init: initHotUpdater,
        getState: () => global.codeUpdateState
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initHotUpdater);
    } else {
        initHotUpdater();
    }

})(typeof window !== 'undefined' ? window : this);