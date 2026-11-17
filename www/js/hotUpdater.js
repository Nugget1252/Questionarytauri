/* =========================================================================
 *   QUESTIONARY ELECTRON OPT-IN INCREMENTAL UPDATER
 *   - Exclusively active inside the Electron desktop app
 *   - Never blocks startup: checks quietly in background
 *   - Explains what changed in simple terms and asks permission first
 *   - Shows an "Update in Progress" placeholder screen while fetching deltas
 *   ========================================================================= */

(function (global) {
    'use strict';

    if (global._HOT_UPDATER_ENGINE_ACTIVE) return;
    global._HOT_UPDATER_ENGINE_ACTIVE = true;

    const isElectronApp = Boolean(
        typeof window !== 'undefined' &&
        window.electronAPI &&
        typeof window.electronAPI.checkAppUpdate === 'function'
    );

    let pendingUpdatePlan = null;
    let promptShownThisSession = false;

    global.codeUpdateState = {
        checking: false,
        downloading: false,
        available: false,
        latestCommitSha: null,
        installedCommitSha: null,
        activeBranch: 'Electron',
        progress: 0,
        electronOnly: true,
        supported: isElectronApp
    };

    function notify(message, type = 'info') {
        if (typeof global.showNotification === 'function') {
            global.showNotification(message, type);
        } else {
            console.log(`[ElectronUpdater:${type}] ${message}`);
        }
    }

    function formatBytes(bytes) {
        if (!bytes || bytes <= 0) return 'Minimal size';
        const units = ['B', 'KB', 'MB', 'GB'];
        let i = 0;
        let val = bytes;
        while (val >= 1024 && i < units.length - 1) {
            val /= 1024;
            i++;
        }
        return `${val >= 10 || i === 0 ? Math.round(val) : val.toFixed(1)} ${units[i]}`;
    }

    function escapeHtml(str) {
        return String(str || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function getViewerUrl(fileUrl, pageNum = 1) {
        const absoluteUrl = fileUrl ? (
            (fileUrl.startsWith('blob:') || fileUrl.startsWith('local-pdf:') || fileUrl.startsWith('http'))
                ? fileUrl
                : new URL(fileUrl, window.location.href).href
        ) : '';

        const pageParam = pageNum > 1 ? `&page=${pageNum}` : '';
        return `pdfviewer.html?file=${encodeURIComponent(absoluteUrl)}${pageParam}`;
    }

    async function resolveStorageDir() {
        const saved = localStorage.getItem('questionary-storage-dir');
        if (saved) return saved;
        if (window.electronAPI && typeof window.electronAPI.getDefaultStoragePath === 'function') {
            try {
                return await window.electronAPI.getDefaultStoragePath();
            } catch (e) {}
        }
        return null;
    }

    function updateUIState(state) {
        const btn = document.getElementById('checkUpdatesBtn');
        if (!btn) return;
        if (!isElectronApp) {
            btn.style.display = 'none';
            return;
        }

        btn.classList.remove('checking', 'available', 'downloading', 'update-available');
        if (state === 'checking') {
            btn.classList.add('checking');
            btn.innerHTML = '<i class="fas fa-sync-alt fa-spin"></i>';
            btn.title = 'Checking for updates...';
        } else if (state === 'available') {
            btn.classList.add('update-available');
            btn.innerHTML = '<i class="fas fa-download"></i>';
            btn.title = 'Update available — click to review and install';
        } else if (state === 'downloading') {
            btn.classList.add('downloading');
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
            btn.title = 'Updating Questionary...';
        } else {
            btn.innerHTML = '<i class="fas fa-sync-alt"></i>';
            btn.title = 'Check for desktop app updates';
        }
    }

    function openElectronUpdatePrompt(plan) {
        const modal = document.getElementById('electronUpdateModal');
        const listEl = document.getElementById('electronUpdateSummaryList');
        const metaEl = document.getElementById('electronUpdateMeta');
        if (!modal || !listEl) return;

        const items = [];
        const hasPapersOrDb = (plan.changedDbFiles?.length || 0) > 0 || (plan.changedDocs?.length || 0) > 0;
        const hasCode = (plan.changedCodeFiles || []).some(f => f.path.startsWith('js/') || f.path.startsWith('css/') || f.path.endsWith('.html'));
        const hasAssets = (plan.changedCodeFiles || []).some(f => !f.path.startsWith('js/') && !f.path.startsWith('css/') && !f.path.endsWith('.html'));

        if (hasPapersOrDb) {
            const pdfCount = plan.changedDocs?.length || 0;
            const desc = pdfCount > 0
                ? `${pdfCount} new or updated question paper${pdfCount === 1 ? '' : 's'} and updated catalog folders.`
                : 'New question papers and organized study catalog entries are being added.';
            items.push({
                icon: 'fa-book-open',
                title: 'New Question Papers & Catalog',
                desc
            });
        }
        if (hasCode) {
            items.push({
                icon: 'fa-sparkles',
                title: 'New Features & Improvements',
                desc: 'Updated interface layouts, study tools, and bug fixes.'
            });
        }
        if (hasAssets && !hasCode) {
            items.push({
                icon: 'fa-palette',
                title: 'Offline Fonts & Assets',
                desc: 'Refreshed offline fonts and application icons.'
            });
        }

        if (items.length === 0 && Array.isArray(plan.summaries)) {
            plan.summaries.forEach(s => {
                items.push({ icon: 'fa-check-circle', title: 'App Update', desc: s });
            });
        }

        listEl.innerHTML = items.map(item => `
            <div class="electron-update-summary-item">
                <i class="fas ${escapeHtml(item.icon)}"></i>
                <div>
                    <strong>${escapeHtml(item.title)}</strong>
                    <span>${escapeHtml(item.desc)}</span>
                </div>
            </div>
        `).join('');

        const fileCount = (plan.changedCodeFiles?.length || 0) + (plan.changedDbFiles?.length || 0) + (plan.changedDocs?.length || 0);
        if (metaEl) {
            metaEl.textContent = `Incremental download: ${fileCount} changed file${fileCount === 1 ? '' : 's'} (~${formatBytes(plan.totalBytes)}). Your saved notes and offline PDFs stay intact.`;
        }

        modal.classList.add('active');
    }

    function closeElectronUpdatePrompt() {
        document.getElementById('electronUpdateModal')?.classList.remove('active');
    }

    function showUpdateProgressPlaceholder(phase, percent, currentFile) {
        const overlay = document.getElementById('electronUpdateOverlay');
        const phaseEl = document.getElementById('electronUpdatePhase');
        const fillEl = document.getElementById('electronUpdateFill');
        const statsEl = document.getElementById('electronUpdateStats');

        if (overlay) overlay.style.display = 'flex';
        if (phaseEl) phaseEl.textContent = phase || 'Updating Questionary...';
        if (fillEl) fillEl.style.width = `${Math.max(0, Math.min(100, percent || 0))}%`;
        if (statsEl) {
            statsEl.textContent = currentFile
                ? `${percent}% — ${currentFile}`
                : `${percent}%`;
        }
    }

    function hideUpdateProgressPlaceholder() {
        const overlay = document.getElementById('electronUpdateOverlay');
        if (overlay) overlay.style.display = 'none';
    }

    async function checkForCodeUpdates(silent = false) {
        if (!isElectronApp) {
            updateUIState('idle');
            return null;
        }

        if (typeof navigator !== 'undefined' && navigator.onLine === false) {
            if (!silent) {
                notify('Offline mode — connect to the internet to check for Questionary desktop updates.', 'info');
            }
            updateUIState('idle');
            return null;
        }

        if (global.codeUpdateState.checking || global.codeUpdateState.downloading) {
            return pendingUpdatePlan;
        }

        global.codeUpdateState.checking = true;
        updateUIState('checking');
        if (!silent) {
            notify('Checking for updates...', 'info');
        }

        try {
            const storageDir = await resolveStorageDir();
            const plan = await window.electronAPI.checkAppUpdate({ storageDir });
            global.codeUpdateState.checking = false;

            if (plan && plan.available) {
                pendingUpdatePlan = plan;
                global.codeUpdateState.available = true;
                global.codeUpdateState.latestCommitSha = plan.commitSha || plan.version || null;
                updateUIState('available');

                if (!silent || !promptShownThisSession) {
                    promptShownThisSession = true;
                    const shortWhat = (plan.changedDbFiles?.length || plan.changedDocs?.length)
                        ? 'New question papers or app features are ready.'
                        : 'New app features and improvements are ready.';
                    notify(`Update available: ${shortWhat}`, 'success');
                    openElectronUpdatePrompt(plan);
                }
                return plan;
            } else {
                pendingUpdatePlan = null;
                global.codeUpdateState.available = false;
                updateUIState('idle');
                if (!silent) {
                    if (plan && plan.offline) {
                        notify('Could not reach update server right now.', 'warning');
                    } else {
                        notify('Questionary is already up to date.', 'success');
                    }
                }
                return null;
            }
        } catch (err) {
            console.warn('[ElectronUpdater] Check failed:', err);
            global.codeUpdateState.checking = false;
            updateUIState('idle');
            if (!silent) {
                notify('Update check could not complete.', 'warning');
            }
            return null;
        }
    }

    async function downloadCodeUpdates() {
        if (!isElectronApp) return false;

        if (!pendingUpdatePlan || !pendingUpdatePlan.available) {
            const plan = await checkForCodeUpdates(false);
            if (!plan || !plan.available) return false;
        }

        if (global.codeUpdateState.downloading) return false;
        global.codeUpdateState.downloading = true;
        updateUIState('downloading');
        closeElectronUpdatePrompt();
        showUpdateProgressPlaceholder('Starting incremental update...', 2, '');

        let unsubscribe = null;
        try {
            if (typeof window.electronAPI.onUpdateProgress === 'function') {
                unsubscribe = window.electronAPI.onUpdateProgress((prog) => {
                    showUpdateProgressPlaceholder(prog.phase, prog.percent, prog.currentFile);
                });
            }

            const storageDir = await resolveStorageDir();
            const result = await window.electronAPI.applyAppUpdate({
                plan: pendingUpdatePlan,
                storageDir
            });

            if (result && result.success) {
                if (result.dbUpdated) {
                    // Only clear cached SQLite hierarchy copy so DbService loads the updated catalog DB.
                    // Offline PDFs (QuestionaryOfflineDocs), notes, flashcards, and themes stay untouched.
                    try {
                        await new Promise((resolve) => {
                            const req = indexedDB.deleteDatabase('QuestionarySQLiteDB');
                            req.onsuccess = resolve;
                            req.onerror = resolve;
                            req.onblocked = resolve;
                        });
                    } catch (e) {}
                }

                showUpdateProgressPlaceholder('Update complete! Reloading Questionary...', 100, '');
                setTimeout(async () => {
                    if (typeof window.electronAPI.reloadApp === 'function') {
                        await window.electronAPI.reloadApp();
                    } else {
                        location.reload();
                    }
                }, 450);
                return true;
            } else {
                throw new Error(result?.error || 'Failed to apply update');
            }
        } catch (err) {
            console.error('[ElectronUpdater] Apply error:', err);
            hideUpdateProgressPlaceholder();
            notify(`Update failed cleanly without modifying existing files: ${err.message}`, 'error');
            updateUIState(pendingUpdatePlan ? 'available' : 'idle');
            return false;
        } finally {
            global.codeUpdateState.downloading = false;
            if (typeof unsubscribe === 'function') unsubscribe();
        }
    }

    async function resetCache(shouldReload = true) {
        if (!isElectronApp) return;
        try {
            await new Promise((resolve) => {
                const req = indexedDB.deleteDatabase('QuestionarySQLiteDB');
                req.onsuccess = resolve;
                req.onerror = resolve;
                req.onblocked = resolve;
            });
        } catch (e) {}
        notify('Local catalog cache refreshed.', 'info');
        if (shouldReload) {
            setTimeout(() => location.reload(), 300);
        }
    }

    function attachListeners() {
        const btn = document.getElementById('checkUpdatesBtn');
        if (btn && !btn.dataset.hotUpdaterBound) {
            btn.dataset.hotUpdaterBound = 'true';
            if (!isElectronApp) {
                btn.style.display = 'none';
            } else {
                btn.addEventListener('click', async (e) => {
                    e.preventDefault();
                    if (pendingUpdatePlan && pendingUpdatePlan.available) {
                        openElectronUpdatePrompt(pendingUpdatePlan);
                    } else {
                        await checkForCodeUpdates(false);
                    }
                });
            }
        }

        const nowBtn = document.getElementById('electronUpdateNowBtn');
        if (nowBtn && !nowBtn.dataset.hotUpdaterBound) {
            nowBtn.dataset.hotUpdaterBound = 'true';
            nowBtn.addEventListener('click', () => {
                downloadCodeUpdates();
            });
        }

        ['electronUpdateLaterBtn', 'electronUpdateCloseBtn'].forEach(id => {
            const el = document.getElementById(id);
            if (el && !el.dataset.hotUpdaterBound) {
                el.dataset.hotUpdaterBound = 'true';
                el.addEventListener('click', closeElectronUpdatePrompt);
            }
        });

        ['resetCodeCacheBtn', 'resetCodeCacheBtnSettings'].forEach(id => {
            const b = document.getElementById(id);
            if (b && !b.dataset.hotUpdaterBound) {
                b.dataset.hotUpdaterBound = 'true';
                if (!isElectronApp) {
                    b.style.display = 'none';
                } else {
                    b.addEventListener('click', async (e) => {
                        e.preventDefault();
                        await checkForCodeUpdates(false);
                    });
                }
            }
        });
    }

    function initHotUpdater() {
        try {
            localStorage.removeItem('questionary_hot_files');
            localStorage.removeItem('questionary-code-files');
        } catch (e) {}
        attachListeners();
        updateUIState('idle');
        global.getViewerUrl = getViewerUrl;
    }

    global.hotCodeUpdater = {
        check: checkForCodeUpdates,
        download: downloadCodeUpdates,
        resetCache,
        forceSync: () => checkForCodeUpdates(false),
        getViewerUrl,
        init: initHotUpdater,
        isSupported: () => isElectronApp,
        getState: () => global.codeUpdateState
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initHotUpdater);
    } else {
        initHotUpdater();
    }
})(typeof window !== 'undefined' ? window : this);
