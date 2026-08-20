

/* =========================================================================
 *   QUESTIONARY MASTER APP ENGINE (Consolidated & De-duplicated)
 *   - Local-First SQLite (WASM) with LocalNodeStore Engine Fallback
 *   - Resilient Delegated Theme & Accessibility Subsystem
 *   - Full Multi-Document Reader (PDF, Word, Text, Image)
 *   - Interactive Flashcards, Notes, Planner, Timer & Search
 *   ========================================================================= */

if (window._HOT_APP_JS_LOADED && document.currentScript && !document.currentScript.id?.startsWith('hot-js-')) {
    console.log('[App] Stored hot-updated app.js is already running. Skipping base bundle.');
} else {

    // ================================================================
    // 1. LIVE GLOBAL MODULE OVERRIDE PATCHER
    // ================================================================
    (function applyLiveModuleOverrides() {
        try {
            const raw = localStorage.getItem('questionary-code-files');
            if (raw) {
                const files = JSON.parse(raw);
                if (files['js/studyRoom.js']) {
                    window.eval(files['js/studyRoom.js']);
                    console.log('[HotUpdate] Force-evaluated latest js/studyRoom.js into global scope');
                }
                if (files['js/features.js']) {
                    window.eval(files['js/features.js']);
                    console.log('[HotUpdate] Force-evaluated latest js/features.js into global scope');
                }
            }
        } catch (err) {
            console.error('[HotUpdate] Module override error:', err);
        }
    })();

    // ================================================================
    // 2. CORE APPLICATION STATE
    // ================================================================
    var currentUser = window.currentUser || null;
    var path = window.path || [];
    var currentView = window.currentView || 'home';
    var editMode = window.editMode || false;
    var favorites = window.favorites || [];
    var notes = window.notes || [];
    var flashcardDecks = window.flashcardDecks || [];
    var studySessions = window.studySessions || [];
    var documentProgress = window.documentProgress || {};
    var quickLinks = window.quickLinks || [];
    var documents = window.documents || {};
    window.documents = documents;

    var studyStats = window.studyStats || { totalTime: 0, streak: 0, lastStudyDate: null, hourlyActivity: {} };
    var currentCalendarDate = window.currentCalendarDate || new Date();
    var currentEditingNote = window.currentEditingNote || null;
    var currentEditingDeck = window.currentEditingDeck || null;
    var currentStudyDeck = window.currentStudyDeck || null;
    var currentCardIndex = window.currentCardIndex || 0;
    var currentOpenPDF = window.currentOpenPDF || null;

    var _currentImageBlobUrl = window._currentImageBlobUrl || null;
    var _currentImageName = window._currentImageName || '';
    var pdfViewStartTime = null;
    var printQueue = [];
    var searchHistory = JSON.parse(localStorage.getItem('questionary-search-history') || '[]');

    var timerState = window.timerState || {
        duration: 0,
        remaining: 0,
        interval: null,
        isRunning: false,
        isPaused: false,
        laps: [],
        lastLapTime: 0
    };

    var customTimerPresets = JSON.parse(localStorage.getItem('questionary-timer-presets') || '[]');
    var darkModeSchedule = JSON.parse(localStorage.getItem('questionary-darkmode-schedule') || '{"enabled":false,"darkStart":19,"darkEnd":7}');
    var pageBookmarks = JSON.parse(localStorage.getItem('questionary-page-bookmarks') || '{}');

    var updateState = window.updateState || {
        available: false,
        version: null,
        update: null,
        downloading: false,
        downloadProgress: 0,
        downloadedBytes: 0,
        totalBytes: 0
    };

    const users = {
        "DPSNTRVMP": { password: "DPSNTRVMP@123", role: "user" },
        "ADMIN": { password: "DPSNTCLASSLOGIN@@", role: "admin" }
    };

    // ================================================================
    // 3. UTILITIES & UI SHIELDS
    // ================================================================
    function escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    function formatBytes(bytes) {
        if (!bytes || bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    }

    function getTimeAgo(timestamp) {
        if (!timestamp) return 'Unknown';
        const seconds = Math.floor((Date.now() - timestamp) / 1000);
        if (seconds < 60) return 'Just now';
        if (seconds < 3600) return `${Math.floor(seconds / 60)} minutes ago`;
        if (seconds < 86400) return `${Math.floor(seconds / 3600)} hours ago`;
        if (seconds < 604800) return `${Math.floor(seconds / 86400)} days ago`;
        return new Date(timestamp).toLocaleDateString();
    }

    function preventAccidentalSelection() {
        if (!document.getElementById('prevent-selection-styles')) {
            const style = document.createElement('style');
            style.id = 'prevent-selection-styles';
            style.textContent = `
                body, header, .header, .logo, .nav-links, .user-badge, .user-dropdown-menu,
                .dashboard-header, .stat-card, .breadcrumb-container, .section-header, .tile,
                .btn, .btn-sm, .modal-header, .modal-footer, .timer-panel, .quick-links-panel,
                .accessibility-panel, .sr-lobby, .sr-lobby-header, .sr-lobby-card,
                .sr-feature-item, .sr-session-bar, .sr-sidebar, .sr-sidebar-tabs, .sr-ctrl-btn,
                .sr-wb-toolbar, .sr-exp-badge, .alarm-notification, .login-screen, .login-card,
                .card-editor, .session-item, .deck-card, .note-card, .quick-link-item,
                .search-result-item, .page-bookmark-item, .print-queue-item, .timer-preset-btn,
                .dialog-box, .dialog-overlay, #dbUploadOverlay, #dbDropZone, .mobile-bottom-nav {
                    -webkit-user-select: none !important;
                    -moz-user-select: none !important;
                    -ms-user-select: none !important;
                    user-select: none !important;
                }

                input, textarea, select, code, pre, [contenteditable="true"],
                .note-card-content, .note-card-title, .flashcard-front, .flashcard-back,
                .quiz-question, .sr-chat-msg, .sr-wb-q-textarea, .selectable-text {
                    -webkit-user-select: text !important;
                    -moz-user-select: text !important;
                    -ms-user-select: text !important;
                    user-select: text !important;
                }
            `;
            (document.head || document.documentElement).appendChild(style);
        }

        document.addEventListener('selectstart', (e) => {
            const isSelectable = e.target.closest && e.target.closest(
                'input, textarea, select, code, pre, [contenteditable="true"], .note-card-content, .note-card-title, .flashcard-front, .flashcard-back, .quiz-question, .sr-chat-msg, .sr-wb-q-textarea, .selectable-text, iframe, #pdfViewer'
            );
            if (!isSelectable) e.preventDefault();
        }, false);

        document.addEventListener('dragstart', (e) => {
            const isDraggable = e.target.closest && e.target.closest('a, img, [draggable="true"]');
            if (!isDraggable) e.preventDefault();
        }, false);
    }

    // ================================================================
    // 4. DELEGATED THEME & ACCESSIBILITY SUBSYSTEM
    // ================================================================
    var accessibilitySettings = window.accessibilitySettings || {
        highContrast: localStorage.getItem('accessibility-high-contrast') === 'true',
        largeText: localStorage.getItem('accessibility-large-text') === 'true',
        reducedMotion: localStorage.getItem('accessibility-reduced-motion') === 'true',
        enhancedFocus: localStorage.getItem('accessibility-enhanced-focus') === 'true'
    };
    window.accessibilitySettings = accessibilitySettings;

    function applyAccessibilitySettings() {
        document.body.classList.toggle('high-contrast', accessibilitySettings.highContrast);
        document.body.classList.toggle('large-text', accessibilitySettings.largeText);
        document.body.classList.toggle('reduced-motion', accessibilitySettings.reducedMotion);
        document.body.classList.toggle('enhanced-focus', accessibilitySettings.enhancedFocus);
        updateAccessibilityToggleStates();
    }

    function updateAccessibilityToggleStates() {
        const toggleMappings = [
            { id: 'highContrastToggle', key: 'highContrast' },
            { id: 'largeTextToggle', key: 'largeText' },
            { id: 'reducedMotionToggle', key: 'reducedMotion' },
            { id: 'enhancedFocusToggle', key: 'enhancedFocus' }
        ];

        toggleMappings.forEach(({ id, key }) => {
            const toggle = document.getElementById(id);
            if (toggle) {
                const switchEl = toggle.querySelector('.accessibility-switch');
                const isActive = !!accessibilitySettings[key];
                toggle.classList.toggle('active', isActive);
                if (switchEl) switchEl.classList.toggle('active', isActive);
            }
        });
    }

    (function initDelegatedControls() {
        if (window._DELEGATED_CONTROLS_BOUND) return;
        window._DELEGATED_CONTROLS_BOUND = true;

        document.addEventListener('click', (e) => {
            // Theme toggle button
            const themeBtn = e.target.closest('#themeToggle, .theme-toggle');
            if (themeBtn) {
                e.preventDefault();
                e.stopPropagation();
                if (typeof window.toggleTheme === 'function') {
                    window.toggleTheme();
                } else {
                    const cur = document.documentElement.getAttribute('data-theme') || 'dark';
                    const next = (cur === 'dark') ? 'light' : 'dark';
                    document.documentElement.setAttribute('data-theme', next);
                    localStorage.setItem('questionary-theme', next);
                    localStorage.setItem('theme', next);
                    const icon = document.getElementById('themeIcon');
                    if (icon) icon.className = (next === 'dark') ? 'fas fa-sun' : 'fas fa-moon';
                }
                return;
            }

            // Accessibility main panel button
            const accessBtn = e.target.closest('#accessibilityToggle, .accessibility-toggle');
            if (accessBtn) {
                e.preventDefault();
                e.stopPropagation();
                const panel = document.getElementById('accessibilityPanel');
                if (panel) panel.classList.toggle('active');
                return;
            }

            // Accessibility option switch inside panel
            const option = e.target.closest('.accessibility-option');
            if (option && option.id) {
                e.preventDefault();
                e.stopPropagation();
                const idMap = {
                    'highContrastToggle': 'highContrast',
                    'largeTextToggle': 'largeText',
                    'reducedMotionToggle': 'reducedMotion',
                    'enhancedFocusToggle': 'enhancedFocus'
                };
                const key = idMap[option.id];
                if (key) {
                    accessibilitySettings[key] = !accessibilitySettings[key];
                    const storageKey = 'accessibility-' + key.replace(/([A-Z])/g, '-$1').toLowerCase();
                    localStorage.setItem(storageKey, accessibilitySettings[key]);
                    applyAccessibilitySettings();
                }
                return;
            }

            // Dismiss accessibility panel on outside click
            if (!e.target.closest('#accessibilityPanel') && !e.target.closest('#accessibilityToggle')) {
                const panel = document.getElementById('accessibilityPanel');
                if (panel && panel.classList.contains('active')) {
                    panel.classList.remove('active');
                }
            }
        });
    })();

    // ================================================================
    // 5. MODAL DIALOGS & TOAST NOTIFICATIONS
    // ================================================================
    function showNotification(message, type = 'info') {
        const existing = document.querySelector('.notification-toast');
        if (existing) existing.remove();

        const toast = document.createElement('div');
        toast.className = `notification-toast notification-${type}`;

        let icon = 'fa-info-circle';
        let bgColor = '#3b82f6';
        if (type === 'success') { icon = 'fa-check-circle'; bgColor = '#22c55e'; }
        else if (type === 'error') { icon = 'fa-exclamation-circle'; bgColor = '#ef4444'; }
        else if (type === 'warning') { icon = 'fa-exclamation-triangle'; bgColor = '#f59e0b'; }

        toast.style.cssText = `
            position: fixed;
            bottom: calc(75px + env(safe-area-inset-bottom, 0px));
            left: 50%;
            transform: translateX(-50%) translateY(100px);
            padding: 12px 22px;
            border-radius: 12px;
            color: white;
            font-weight: 500;
            z-index: 10000;
            display: flex;
            align-items: center;
            gap: 10px;
            box-shadow: 0 8px 24px rgba(0,0,0,0.25);
            background: ${bgColor};
            font-size: 0.9rem;
            max-width: 90%;
            animation: slideUpToast 0.3s ease forwards;
        `;

        toast.innerHTML = `<i class="fas ${icon}"></i><span>${message}</span>`;
        document.body.appendChild(toast);

        setTimeout(() => {
            toast.style.animation = 'slideDownToast 0.3s ease forwards';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }
    window.showNotification = showNotification;

    function _createDialogOverlay() {
        const overlay = document.createElement('div');
        overlay.className = 'dialog-overlay';
        document.body.appendChild(overlay);
        requestAnimationFrame(() => overlay.classList.add('active'));
        return overlay;
    }

    function _closeDialog(overlay) {
        overlay.classList.remove('active');
        setTimeout(() => overlay.remove(), 200);
    }

    function showConfirm(message, opts = {}) {
        const { title = 'Confirm', confirmText = 'OK', cancelText = 'Cancel', type = 'warning' } = opts;
        return new Promise(resolve => {
            const overlay = _createDialogOverlay();
            const iconMap = { warning: 'fa-exclamation-triangle', danger: 'fa-trash-alt', info: 'fa-info-circle', question: 'fa-question-circle' };
            const colorMap = { warning: 'var(--yellow, #f59e0b)', danger: 'var(--red, #ef4444)', info: 'var(--accent)', question: 'var(--accent)' };
            const icon = iconMap[type] || iconMap.question;
            const color = colorMap[type] || colorMap.question;

            overlay.innerHTML = `
                <div class="dialog-box">
                    <div class="dialog-icon" style="color: ${color}"><i class="fas ${icon}"></i></div>
                    <h3 class="dialog-title">${title}</h3>
                    <p class="dialog-message">${message}</p>
                    <div class="dialog-actions">
                        <button class="dialog-btn dialog-btn-cancel">${cancelText}</button>
                        <button class="dialog-btn dialog-btn-confirm" style="background: ${type === 'danger' ? 'var(--red, #ef4444)' : 'var(--accent)'}">${confirmText}</button>
                    </div>
                </div>
            `;

            const close = (val) => { _closeDialog(overlay); resolve(val); };
            overlay.querySelector('.dialog-btn-cancel').onclick = () => close(false);
            overlay.querySelector('.dialog-btn-confirm').onclick = () => close(true);
            overlay.addEventListener('click', e => { if (e.target === overlay) close(false); });
            overlay.querySelector('.dialog-btn-confirm').focus();
        });
    }
    window.showConfirm = showConfirm;

    function showPrompt(message, opts = {}) {
        const { title = 'Input', defaultValue = '', placeholder = '', confirmText = 'Save', cancelText = 'Cancel' } = opts;
        return new Promise(resolve => {
            const overlay = _createDialogOverlay();

            overlay.innerHTML = `
                <div class="dialog-box">
                    <div class="dialog-icon" style="color: var(--accent)"><i class="fas fa-pen"></i></div>
                    <h3 class="dialog-title">${title}</h3>
                    <p class="dialog-message">${message}</p>
                    <input class="dialog-input" type="text" value="${defaultValue.replace(/"/g, '&quot;')}" placeholder="${placeholder}" spellcheck="false" />
                    <div class="dialog-actions">
                        <button class="dialog-btn dialog-btn-cancel">${cancelText}</button>
                        <button class="dialog-btn dialog-btn-confirm">${confirmText}</button>
                    </div>
                </div>
            `;

            const input = overlay.querySelector('.dialog-input');
            const close = (val) => { _closeDialog(overlay); resolve(val); };
            overlay.querySelector('.dialog-btn-cancel').onclick = () => close(null);
            overlay.querySelector('.dialog-btn-confirm').onclick = () => close(input.value.trim() || null);
            input.addEventListener('keydown', e => {
                if (e.key === 'Enter') close(input.value.trim() || null);
                if (e.key === 'Escape') close(null);
            });
            overlay.addEventListener('click', e => { if (e.target === overlay) close(null); });
            requestAnimationFrame(() => { input.focus(); input.select(); });
        });
    }
    window.showPrompt = showPrompt;

    function showInfoDialog(message, opts = {}) {
        const { title = 'Info', buttonText = 'OK', type = 'info' } = opts;
        return new Promise(resolve => {
            const overlay = _createDialogOverlay();
            const iconMap = { info: 'fa-info-circle', success: 'fa-check-circle', warning: 'fa-exclamation-triangle', error: 'fa-exclamation-circle' };
            const colorMap = { info: 'var(--accent)', success: 'var(--green, #22c55e)', warning: 'var(--yellow, #f59e0b)', error: 'var(--red, #ef4444)' };

            overlay.innerHTML = `
                <div class="dialog-box">
                    <div class="dialog-icon" style="color: ${colorMap[type] || colorMap.info}"><i class="fas ${iconMap[type] || iconMap.info}"></i></div>
                    <h3 class="dialog-title">${title}</h3>
                    <div class="dialog-message dialog-message-scrollable">${message}</div>
                    <div class="dialog-actions">
                        <button class="dialog-btn dialog-btn-confirm">${buttonText}</button>
                    </div>
                </div>
            `;

            const close = () => { _closeDialog(overlay); resolve(); };
            overlay.querySelector('.dialog-btn-confirm').onclick = close;
            overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
            overlay.querySelector('.dialog-btn-confirm').focus();
        });
    }
    window.showInfoDialog = showInfoDialog;

    // ================================================================
    // 6. SQLITE & LOCAL NODE STORE BACKEND
    // ================================================================
    const LocalNodeStore = {
        getNodes() {
            try {
                const data = localStorage.getItem('questionary-local-nodes');
                return data ? JSON.parse(data) : [];
            } catch (e) {
                return [];
            }
        },

        saveNodes(nodes) {
            localStorage.setItem('questionary-local-nodes', JSON.stringify(nodes));
        },

        seedDefaultLibrary() {
            const starterNodes = [
                { id: 1, parent_id: null, name: 'Physics', is_folder: 1, file_path: '#' },
                { id: 2, parent_id: null, name: 'Chemistry', is_folder: 1, file_path: '#' },
                { id: 3, parent_id: null, name: 'Mathematics', is_folder: 1, file_path: '#' },
                { id: 4, parent_id: null, name: 'Biology', is_folder: 1, file_path: '#' },
                { id: 5, parent_id: 1, name: 'Mechanics & Motion', is_folder: 1, file_path: '#' },
                { id: 6, parent_id: 1, name: 'Thermodynamics', is_folder: 1, file_path: '#' },
                { id: 7, parent_id: 1, name: 'Electromagnetism', is_folder: 1, file_path: '#' },
                { id: 8, parent_id: 2, name: 'Organic Chemistry', is_folder: 1, file_path: '#' },
                { id: 9, parent_id: 2, name: 'Inorganic Chemistry', is_folder: 1, file_path: '#' },
                { id: 10, parent_id: 3, name: 'Calculus & Vectors', is_folder: 1, file_path: '#' },
                { id: 11, parent_id: 3, name: 'Algebra & Matrices', is_folder: 1, file_path: '#' },
                { id: 12, parent_id: 4, name: 'Genetics & Cell Biology', is_folder: 1, file_path: '#' }
            ];
            this.saveNodes(starterNodes);
            return starterNodes;
        },

        getChildren(pathArray) {
            let nodes = this.getNodes();
            if (nodes.length === 0) nodes = this.seedDefaultLibrary();

            if (!pathArray || pathArray.length === 0) {
                return nodes.filter(n => n.parent_id === null);
            }

            let currentParentId = null;
            for (const segment of pathArray) {
                const match = nodes.find(n => n.parent_id === currentParentId && n.name === segment);
                if (!match) return [];
                currentParentId = match.id;
            }

            return nodes.filter(n => n.parent_id === currentParentId);
        },

        search(keyword) {
            const nodes = this.getNodes();
            const cleanKw = keyword.toLowerCase();
            const matches = nodes.filter(n => n.name.toLowerCase().includes(cleanKw));

            return matches.map(m => {
                const pathArray = [];
                let cur = m;
                while (cur && cur.parent_id !== null) {
                    const parent = nodes.find(n => n.id === cur.parent_id);
                    if (parent) { pathArray.unshift(parent.name); cur = parent; }
                    else break;
                }
                pathArray.push(m.name);
                return {
                    name: m.name,
                    path: pathArray,
                    isFolder: m.is_folder === 1,
                    url: m.file_path
                };
            });
        },

        countDocuments() {
            const nodes = this.getNodes();
            return nodes.filter(n => n.is_folder === 0 && n.file_path && n.file_path !== '#').length;
        }
    };

    const DbService = {
        db: null,
        SQL: null,
        isFallback: false,

        async init() {
            const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error('DbService init timeout')), 2000)
            );

            try {
                await Promise.race([this._internalInit(), timeoutPromise]);
                return true;
            } catch (err) {
                console.warn('[SQLite] WASM DB Init fallback:', err);
                this.isFallback = true;
                LocalNodeStore.seedDefaultLibrary();
                return true;
            }
        },

        async _internalInit() {
            if (!window.SQL_INSTANCE) {
                if (typeof window.initSqlJs === 'undefined') {
                    await new Promise((resolve, reject) => {
                        const script = document.createElement('script');
                        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.8.0/sql-wasm.js';
                        script.onload = resolve;
                        script.onerror = reject;
                        document.head.appendChild(script);
                    });
                }

                window.SQL_INSTANCE = await window.initSqlJs({
                    locateFile: file => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.8.0/${file}`
                });
            }

            this.SQL = window.SQL_INSTANCE;

            let savedDb = await this.loadFromIndexedDB();
            if (savedDb) {
                this.db = new this.SQL.Database(savedDb);
                savedDb = null;

                if (await this.isValidDatabase()) {
                    return true;
                } else {
                    await this.clearIndexedDB();
                    this.db = null;
                }
            }

            const candidatePaths = [
                'questionary.db',
                '/questionary.db',
                'assets/questionary.db',
                (window.location.origin || '') + '/questionary.db'
            ];

            for (const p of candidatePaths) {
                try {
                    const response = await fetch(p + '?v=' + Date.now());
                    if (response.ok) {
                        let arrayBuffer = await response.arrayBuffer();
                        let uInt8Array = new Uint8Array(arrayBuffer);
                        const tempDb = new this.SQL.Database(uInt8Array);
                        arrayBuffer = null;
                        uInt8Array = null;

                        this.db = tempDb;
                        if (await this.isValidDatabase()) {
                            await this.saveToIndexedDB();
                            return true;
                        }
                    }
                } catch (fetchErr) {}
            }

            this.db = new this.SQL.Database();
            await this.createDefaultSchema();
            return true;
        },

        async createDefaultSchema() {
            if (!this.db) return;
            try {
                this.db.run(`
                    CREATE TABLE IF NOT EXISTS nodes (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        parent_id INTEGER DEFAULT NULL,
                        name TEXT NOT NULL,
                        is_folder INTEGER DEFAULT 1,
                        file_path TEXT DEFAULT '#'
                    );
                `);

                const countCheck = await this.query("SELECT COUNT(*) as count FROM nodes");
                if (!countCheck || countCheck.length === 0 || countCheck[0].count === 0) {
                    this.db.run(`
                        INSERT INTO nodes (id, parent_id, name, is_folder, file_path) VALUES
                        (1, NULL, 'Physics', 1, '#'),
                        (2, NULL, 'Chemistry', 1, '#'),
                        (3, NULL, 'Mathematics', 1, '#'),
                        (4, NULL, 'Biology', 1, '#'),
                        (5, 1, 'Mechanics & Motion', 1, '#'),
                        (6, 1, 'Thermodynamics', 1, '#'),
                        (7, 1, 'Electromagnetism', 1, '#'),
                        (8, 2, 'Organic Chemistry', 1, '#'),
                        (9, 2, 'Inorganic Chemistry', 1, '#'),
                        (10, 3, 'Calculus & Vectors', 1, '#'),
                        (11, 3, 'Algebra & Matrices', 1, '#'),
                        (12, 4, 'Genetics & Cell Biology', 1, '#');
                    `);
                }
                await this.saveToIndexedDB();
            } catch (e) {
                console.error('[SQLite] Schema creation error:', e);
            }
        },

        async isValidDatabase() {
            if (!this.db) return false;
            try {
                const tableCheck = await this.query("SELECT name FROM sqlite_master WHERE type='table' AND name='nodes'");
                if (tableCheck.length === 0) return false;
                const countCheck = await this.query("SELECT COUNT(*) as count FROM nodes");
                return countCheck.length > 0 && countCheck[0].count > 0;
            } catch (e) {
                return false;
            }
        },

        async query(sql, params = []) {
            if (this.isFallback || !this.db) return [];
            const stmt = this.db.prepare(sql);
            stmt.bind(params);
            const results = [];
            while (stmt.step()) {
                results.push(stmt.getAsObject());
            }
            stmt.free();
            return results;
        },

        async saveToIndexedDB() {
            if (this.isFallback || !this.db) return;
            let data = this.db.export();
            return new Promise((resolve, reject) => {
                const request = indexedDB.open('QuestionarySQLiteDB', 1);
                request.onupgradeneeded = e => e.target.result.createObjectStore('db_store');
                request.onsuccess = e => {
                    const idb = e.target.result;
                    const tx = idb.transaction('db_store', 'readwrite');
                    const putReq = tx.objectStore('db_store').put(data, 'questionary.db');
                    putReq.onsuccess = () => { data = null; resolve(); };
                    putReq.onerror = () => { data = null; reject(putReq.error); };
                };
                request.onerror = () => { data = null; reject(request.error); };
            });
        },

        async loadFromIndexedDB() {
            return new Promise(resolve => {
                const request = indexedDB.open('QuestionarySQLiteDB', 1);
                request.onupgradeneeded = e => e.target.result.createObjectStore('db_store');
                request.onsuccess = e => {
                    const idb = e.target.result;
                    const tx = idb.transaction('db_store', 'readonly');
                    const getReq = tx.objectStore('db_store').get('questionary.db');
                    getReq.onsuccess = () => resolve(getReq.result);
                    getReq.onerror = () => resolve(null);
                };
                request.onerror = () => resolve(null);
            });
        },

        async clearIndexedDB() {
            return new Promise(resolve => {
                const req = indexedDB.deleteDatabase('QuestionarySQLiteDB');
                req.onsuccess = () => resolve();
                req.onerror = () => resolve();
                req.onblocked = () => resolve();
            });
        },

        async getNodeIdByPath(pathArray) {
            if (this.isFallback) return null;
            let currentId = null;
            for (const segment of pathArray) {
                const sql = currentId === null
                    ? "SELECT id FROM nodes WHERE parent_id IS NULL AND name = ?"
                    : "SELECT id FROM nodes WHERE parent_id = ? AND name = ?";
                const params = currentId === null ? [segment] : [currentId, segment];
                const res = await this.query(sql, params);
                if (res.length === 0) return null;
                currentId = res[0].id;
            }
            return currentId;
        },

        async getChildren(pathArray) {
            if (this.isFallback || !this.db) {
                return LocalNodeStore.getChildren(pathArray);
            }
            const parentId = await this.getNodeIdByPath(pathArray);
            if (parentId === null && pathArray.length > 0) {
                return LocalNodeStore.getChildren(pathArray);
            }
            const res = await this.query(
                parentId === null 
                    ? "SELECT * FROM nodes WHERE parent_id IS NULL ORDER BY name ASC" 
                    : "SELECT * FROM nodes WHERE parent_id = ? ORDER BY name ASC", 
                parentId === null ? [] : [parentId]
            );
            return (res && res.length > 0) ? res : LocalNodeStore.getChildren(pathArray);
        },

        async search(keyword) {
            if (this.isFallback || !this.db) {
                return LocalNodeStore.search(keyword);
            }
            const res = await this.query("SELECT * FROM nodes WHERE name LIKE ?", [`%${keyword}%`]);
            const results = [];
            for (const item of res) {
                const pathArray = await this.buildPath(item.parent_id);
                pathArray.push(item.name);
                results.push({
                    name: item.name,
                    path: pathArray,
                    isFolder: item.is_folder === 1,
                    url: item.file_path
                });
            }
            return results.length > 0 ? results : LocalNodeStore.search(keyword);
        },

        async buildPath(parentId) {
            const resultPath = [];
            let currentId = parentId;
            while (currentId !== null) {
                const res = await this.query("SELECT parent_id, name FROM nodes WHERE id = ?", [currentId]);
                if (res.length === 0) break;
                resultPath.unshift(res[0].name);
                currentId = res[0].parent_id;
            }
            return resultPath;
        },

        async countDocuments() {
            if (this.isFallback || !this.db) {
                return LocalNodeStore.countDocuments();
            }
            const res = await this.query("SELECT COUNT(*) as count FROM nodes WHERE is_folder = 0 AND file_path != '#' AND file_path != ''");
            return res.length > 0 ? res[0].count : LocalNodeStore.countDocuments();
        }
    };

    window.resetDatabase = async function() {
        if (confirm('Reset database cache?')) {
            await DbService.clearIndexedDB();
            location.reload();
        }
    };

    // ================================================================
    // 7. FAVORITES & RECENT HISTORY ENGINE
    // ================================================================
    async function initializeFavorites() {
        try {
            favorites = JSON.parse(localStorage.getItem('questionary-favorites') || '[]');
        } catch (e) {
            favorites = [];
        }
    }

    async function saveFavorites() {
        try {
            localStorage.setItem('questionary-favorites', JSON.stringify(favorites));
        } catch (e) {}
    }

    function addToRecent(title, docPath, url) {
        if (!url || url === '#') return;
        const recent = JSON.parse(localStorage.getItem('questionary-recent') || '[]');
        const existing = recent.findIndex(r => r.title === title && r.url === url);
        if (existing > -1) recent.splice(existing, 1);
        recent.unshift({ title, path: docPath, url, timestamp: Date.now() });
        const updatedRecent = recent.slice(0, 20);

        localStorage.setItem('questionary-recent', JSON.stringify(updatedRecent));

        if (docPath && docPath.length > 0) {
            trackSubjectAccess(docPath[0]);
            if (docPath.length > 1) trackSubjectAccess(docPath[1]);
        }
    }

    function toggleFavorite(title, docPath, url) {
        const pathString = Array.isArray(docPath) ? docPath.join('|') : docPath;
        const index = favorites.findIndex(f => f.title === title && (Array.isArray(f.path) ? f.path.join('|') : f.path) === pathString);
        if (index > -1) {
            favorites.splice(index, 1);
            showNotification('Removed from favorites', 'info');
        } else {
            favorites.push({ title, path: docPath, url });
            showNotification('Added to favorites', 'success');
        }

        saveFavorites();
        updateDashboardStats();
    }

    // ================================================================
    // 8. TILE RENDERING & BREADCRUMBS
    // ================================================================
    function renderTilesFromDb(items) {
        const container = document.getElementById('tilesContainer');
        if (!container) return;

        const importedSection = document.getElementById('importedSection');
        if (importedSection) {
            importedSection.style.display = path.length === 0 ? 'block' : 'none';
        }
        if (path.length === 0) showHomeTagsPanels();
        else hideHomeTagsPanels();

        container.innerHTML = '';

        if (!items || items.length === 0) {
            container.innerHTML = '<p style="text-align: center; color: var(--text-secondary); padding: 2rem;">No documents available.</p>';
            return;
        }

        const sortOrder = localStorage.getItem('questionary-sort-order') || 'asc';
        items.sort((a, b) => sortOrder === 'asc' ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name));

        items.forEach(item => {
            const key = item.name;
            const isFolder = item.is_folder === 1;
            const value = item.file_path;

            const tile = document.createElement('div');
            tile.className = 'tile';

            const isMissingPdf = !isFolder && (!value || value === '#' || value === '');
            const itemPath = [...path, key];
            const itemPathJson = JSON.stringify(itemPath).replace(/"/g, '&quot;');
            const itemId = isFolder ? `folder_${itemPath.join('/')}` : `doc_${itemPath.join('/')}`;

            tile.innerHTML = `
                <div class="tile-top-bar">
                    <button onclick="event.stopPropagation(); openTagItemModal('${escapeHtml(itemId)}', '${escapeHtml(key)}', '${isFolder ? 'folder' : 'document'}')" title="Tags"><i class="fas fa-tag"></i></button>
                    ${isFolder ? `<button onclick="event.stopPropagation(); addFolderToQuickLinks('${escapeHtml(key)}', ${itemPathJson})" title="Quick Link"><i class="fas fa-link"></i></button>` : ''}
                    ${!isFolder && !isMissingPdf ? `<button onclick="event.stopPropagation(); toggleFavorite('${escapeHtml(key)}', ${itemPathJson}, '${escapeHtml(value)}')" title="Favorite"><i class="fas fa-star"></i></button>` : ''}
                </div>
                <div class="tile-icon">
                    <i class="fas ${isFolder ? 'fa-folder' : (key.endsWith('.png') ? 'fa-image' : 'fa-file-pdf')}"></i>
                </div>
                <div class="tile-text">${escapeHtml(key)}</div>
                ${isMissingPdf ? `<div class="pdf-missing-badge"><i class="fas fa-exclamation-triangle"></i> Not Available</div>` : ''}
            `;

            if (isMissingPdf) tile.classList.add('pdf-missing');

            tile.onclick = async () => {
                if (isFolder) {
                    path.push(key);
                    await navigateToPath(path);
                } else if (isMissingPdf) {
                    showNotification('This file is not available', 'warning');
                } else {
                    addToRecent(key, [...path, key], value);
                    if (typeof window.openAnyDocument === 'function') {
                        window.openAnyDocument(value, key);
                    } else if (key.match(/\.(png|jpg|jpeg|webp|gif|svg)$/i)) {
                        showImage(value, key);
                    } else {
                        showPDF(value, key);
                    }
                }
            };

            container.appendChild(tile);
        });

        updateDashboardStats();
    }

    window.renderTiles = async function() {
        const nodes = await DbService.getChildren(path);
        renderTilesFromDb(nodes);
    };

    function updateBreadcrumb() {
        const breadcrumb = document.getElementById('breadcrumb');
        const backBtn = document.getElementById('backBtn');

        if (!breadcrumb) return;
        breadcrumb.innerHTML = '';

        const homeSpan = document.createElement('span');
        homeSpan.className = 'breadcrumb-item';
        homeSpan.textContent = 'Home';
        homeSpan.onclick = function() { navigateToPath([]); };
        breadcrumb.appendChild(homeSpan);

        let currentPath = [];
        path.forEach((segment) => {
            currentPath.push(segment);
            const pathCopy = [...currentPath];

            const separator = document.createElement('i');
            separator.className = 'fas fa-chevron-right';
            separator.style.cssText = 'font-size: 0.7rem; opacity: 0.5; margin: 0 0.5rem;';
            breadcrumb.appendChild(separator);

            const segmentSpan = document.createElement('span');
            segmentSpan.className = 'breadcrumb-item';
            segmentSpan.textContent = segment;
            segmentSpan.onclick = function() { navigateToPath(pathCopy); };
            breadcrumb.appendChild(segmentSpan);
        });

        if (backBtn) backBtn.style.display = path.length > 0 ? 'flex' : 'none';
    }

    async function navigateToPath(newPath) {
        if (!Array.isArray(newPath)) newPath = [];
        newPath = newPath.filter(segment => segment && segment.trim() !== '');

        const pdfViewer = document.getElementById('pdfViewer');
        if (pdfViewer) { pdfViewer.classList.remove('active'); pdfViewer.src = ''; }
        const pdfViewerContainer = document.getElementById('pdfViewerContainer');
        if (pdfViewerContainer) pdfViewerContainer.style.display = 'none';
        const bookmarksPanel = document.getElementById('pdfBookmarksPanel');
        if (bookmarksPanel) bookmarksPanel.style.display = 'none';

        const tilesContainer = document.getElementById('tilesContainer');
        const sectionHeader = document.querySelector('#tilesSection .section-header');
        const dashboardHeader = document.querySelector('.dashboard-header');
        const tilesSection = document.getElementById('tilesSection');

        if (tilesSection) tilesSection.style.display = 'block';
        if (tilesContainer) {
            const isListView = tilesContainer.classList.contains('list-view');
            tilesContainer.style.display = isListView ? 'flex' : 'grid';
        }
        if (sectionHeader) sectionHeader.style.display = 'flex';
        if (dashboardHeader) dashboardHeader.style.display = newPath.length === 0 ? (window.innerWidth <= 768 ? 'grid' : 'flex') : 'none';

        hideTimerCompletely();

        path = newPath;
        const nodes = await DbService.getChildren(path);
        renderTilesFromDb(nodes);
        updateBreadcrumb();
    }
    window.navigateToPath = navigateToPath;

    async function updateDashboardStats() {
        const totalDocs = await DbService.countDocuments();
        const totalDocsEl = document.getElementById('totalDocuments');
        if (totalDocsEl) totalDocsEl.textContent = totalDocs;

        const favoriteCountEl = document.getElementById('favoriteCount');
        if (favoriteCountEl) favoriteCountEl.textContent = favorites.length;

        const recent = JSON.parse(localStorage.getItem('questionary-recent') || '[]');
        const recentCountEl = document.getElementById('recentCount');
        if (recentCountEl) recentCountEl.textContent = recent.length;

        const streakEl = document.getElementById('dashboardStreak');
        if (streakEl) streakEl.textContent = studyStats.streak || 0;
    }

    // ================================================================
    // 9. FULL-SCREEN DOCUMENT & PDF VIEWERS
    // ================================================================
    function showPDF(url, customName = null) {
        if (!url || url === '' || url === '#') return;

        const pdfViewer = document.getElementById('pdfViewer');
        const pdfViewerContainer = document.getElementById('pdfViewerContainer');
        const tilesContainer = document.getElementById('tilesContainer');
        const sectionHeader = document.querySelector('#tilesSection .section-header');
        const dashboardHeader = document.querySelector('.dashboard-header');
        const breadcrumbContainer = document.querySelector('.breadcrumb-container');
        const tilesSection = document.getElementById('tilesSection');

        document.body.classList.add('pdf-view-active');

        let filename = customName;
        if (!filename) {
            if (url.startsWith('blob:') || url.startsWith('data:')) {
                filename = 'Document';
            } else {
                filename = url.split('/').pop().replace('.pdf', '').replace(/%20/g, ' ');
            }
        }

        currentOpenPDF = { url, name: filename };
        window.currentPdfUrlForBookmarks = url;

        if (pdfViewer) {
            let viewerUrl = 'pdfviewer.html?file=' + encodeURIComponent(url);
            if (window.hotCodeUpdater && typeof window.hotCodeUpdater.getViewerUrl === 'function') {
                viewerUrl = window.hotCodeUpdater.getViewerUrl(url);
            }

            pdfViewer.src = viewerUrl;
            pdfViewer.classList.add('active');

            pdfViewer.onload = function () {
                pdfViewer.contentWindow.postMessage({ type: 'loadPdf', url: url }, '*');
                pdfViewer.onload = null;
            };
        }

        if (tilesSection) tilesSection.style.display = 'block';
        if (tilesContainer) tilesContainer.style.display = 'none';
        if (sectionHeader) sectionHeader.style.display = 'none';
        if (dashboardHeader) dashboardHeader.style.display = 'none';
        if (breadcrumbContainer) breadcrumbContainer.style.display = 'none';

        const importedSection = document.getElementById('importedSection');
        if (importedSection) importedSection.style.display = 'none';
        hideHomeTagsPanels();

        if (pdfViewerContainer) {
            pdfViewerContainer.style.display = 'flex';
            const pdfNameEl = document.getElementById('currentPdfName');
            if (pdfNameEl) pdfNameEl.textContent = filename;

            if (typeof renderPdfBookmarks === 'function') renderPdfBookmarks(url);
        }

        const timerPanel = document.getElementById('timerPanel');
        if (timerPanel) timerPanel.style.display = 'flex';
        initializeTimer();
        trackPdfViewStart();
    }

    function closePDF() {
        const pdfViewer = document.getElementById('pdfViewer');
        const pdfViewerContainer = document.getElementById('pdfViewerContainer');
        const tilesContainer = document.getElementById('tilesContainer');
        const sectionHeader = document.querySelector('#tilesSection .section-header');
        const dashboardHeader = document.querySelector('.dashboard-header');
        const breadcrumbContainer = document.querySelector('.breadcrumb-container');

        document.body.classList.remove('pdf-view-active');

        if (pdfViewerContainer) pdfViewerContainer.style.display = 'none';
        if (pdfViewer) {
            pdfViewer.src = '';
            pdfViewer.classList.remove('active');
        }

        if (tilesContainer) {
            const isListView = tilesContainer.classList.contains('list-view');
            tilesContainer.style.display = isListView ? 'flex' : 'grid';
        }
        if (sectionHeader) sectionHeader.style.display = 'flex';
        if (dashboardHeader) dashboardHeader.style.display = 'flex';
        if (breadcrumbContainer) breadcrumbContainer.style.display = 'flex';

        window.currentPdfUrlForBookmarks = null;
        currentOpenPDF = null;
    }

    window.showPDF = showPDF;
    window.closePDF = closePDF;

    function showImage(url, name) {
        if (!url) return;
        _currentImageName = name || 'Image';
        if (typeof url === 'string' && url.startsWith('blob-id:')) {
            const blobId = url.replace('blob-id:', '');
            if (typeof getPdfBlob === 'function') {
                getPdfBlob(blobId).then(blob => {
                    if (blob) {
                        _currentImageBlobUrl = URL.createObjectURL(blob);
                        _displayImageViewer(_currentImageBlobUrl, name);
                    }
                });
            }
            return;
        }
        _currentImageBlobUrl = url;
        _displayImageViewer(url, name);
    }

    function _displayImageViewer(imgSrc, name) {
        const container = document.getElementById('imageViewerContainer');
        const img = document.getElementById('imageViewerImg');
        const nameEl = document.getElementById('currentImageName');
        const tilesContainer = document.getElementById('tilesContainer');
        const sectionHeader = document.querySelector('#tilesSection .section-header');
        const dashboardHeader = document.querySelector('.dashboard-header');
        const breadcrumbContainer = document.querySelector('.breadcrumb-container');
        if (img) img.src = imgSrc;
        if (nameEl) nameEl.textContent = name || 'Image';
        if (container) container.style.display = 'block';
        if (tilesContainer) tilesContainer.style.display = 'none';
        if (sectionHeader) sectionHeader.style.display = 'none';
        if (dashboardHeader) dashboardHeader.style.display = 'none';
        if (breadcrumbContainer) breadcrumbContainer.style.display = 'none';
        updateBreadcrumb();
    }

    function closeImageViewer() {
        const container = document.getElementById('imageViewerContainer');
        const img = document.getElementById('imageViewerImg');
        const tilesContainer = document.getElementById('tilesContainer');
        const sectionHeader = document.querySelector('#tilesSection .section-header');
        const dashboardHeader = document.querySelector('.dashboard-header');
        const breadcrumbContainer = document.querySelector('.breadcrumb-container');
        if (container) container.style.display = 'none';
        if (img) img.src = '';
        if (_currentImageBlobUrl && _currentImageBlobUrl.startsWith('blob:')) URL.revokeObjectURL(_currentImageBlobUrl);
        _currentImageBlobUrl = null;
        if (breadcrumbContainer) breadcrumbContainer.style.display = 'flex';
        if (tilesContainer) {
            const isListView = tilesContainer.classList.contains('list-view');
            tilesContainer.style.display = isListView ? 'flex' : 'grid';
        }
        if (sectionHeader) sectionHeader.style.display = 'flex';
        if (dashboardHeader && path.length === 0) dashboardHeader.style.display = window.innerWidth <= 768 ? 'grid' : 'flex';
    }

    function downloadCurrentImage() {
        if (!_currentImageBlobUrl) return;
        const a = document.createElement('a');
        a.href = _currentImageBlobUrl;
        a.download = _currentImageName || 'whiteboard.png';
        a.click();
    }

    window.showImage = showImage;
    window.closeImageViewer = closeImageViewer;
    window.downloadCurrentImage = downloadCurrentImage;

    // ================================================================
    // 10. PRIMARY VIEW ROUTER
    // ================================================================
    function showView(viewName) {
        currentView = viewName;
        saveUserPreferences();
        updateMobileBottomNavActive(viewName);

        const pdfViewerContainer = document.getElementById('pdfViewerContainer');
        if (pdfViewerContainer && pdfViewerContainer.style.display !== 'none') {
            closePDF();
        }

        const tilesSection = document.getElementById('tilesSection');
        const favoritesSection = document.getElementById('favoritesSection');
        const recentSection = document.getElementById('recentSection');
        const analyticsSection = document.getElementById('analyticsSection');
        const plannerSection = document.getElementById('plannerSection');
        const flashcardsSection = document.getElementById('flashcardsSection');
        const notesSection = document.getElementById('notesSection');
        const progressSection = document.getElementById('progressSection');
        const remindersSection = document.getElementById('remindersSection');
        const settingsSection = document.getElementById('settingsSection');
        const tagsSection = document.getElementById('tagsSection');
        const importedSection = document.getElementById('importedSection');
        const studyRoomSection = document.getElementById('studyRoomSection');
        const searchResults = document.getElementById('searchResults');
        const dashboardHeader = document.querySelector('.dashboard-header');
        const breadcrumb = document.getElementById('breadcrumb');
        const backBtn = document.getElementById('backBtn');
        const pdfViewer = document.getElementById('pdfViewer');

        const allSections = [
            tilesSection, favoritesSection, recentSection, analyticsSection,
            plannerSection, flashcardsSection, notesSection, progressSection,
            remindersSection, settingsSection, tagsSection, importedSection, studyRoomSection
        ];

        allSections.forEach(section => {
            if (section) section.style.display = 'none';
        });

        if (searchResults) searchResults.style.display = 'none';
        if (pdfViewerContainer) pdfViewerContainer.style.display = 'none';
        if (pdfViewer) { pdfViewer.classList.remove('active'); pdfViewer.src = ''; }
        hideHomeTagsPanels();

        switch (viewName) {
            case 'home':
                if (tilesSection) tilesSection.style.display = 'block';
                const tc = document.getElementById('tilesContainer');
                if (tc) {
                    const isListView = tc.classList.contains('list-view');
                    tc.style.display = isListView ? 'flex' : 'grid';
                }
                const sh = document.querySelector('#tilesSection .section-header');
                if (sh) sh.style.display = 'flex';

                if (importedSection) importedSection.style.display = 'block';
                if (dashboardHeader) dashboardHeader.style.display = path.length === 0 ? (window.innerWidth <= 768 ? 'grid' : 'flex') : 'none';
                if (breadcrumb) breadcrumb.style.display = 'flex';
                if (backBtn) backBtn.style.display = path.length > 0 ? 'flex' : 'none';
                if (typeof window.renderLibrary === 'function') window.renderLibrary();
                navigateToPath(path);
                break;
            case 'favorites':
                if (favoritesSection) favoritesSection.style.display = 'block';
                renderFavorites();
                break;
            case 'recent':
                if (recentSection) recentSection.style.display = 'block';
                renderRecent();
                break;
            case 'analytics':
                if (analyticsSection) analyticsSection.style.display = 'block';
                renderAnalytics();
                break;
            case 'planner':
                if (plannerSection) plannerSection.style.display = 'block';
                renderCalendar();
                renderSessions();
                break;
            case 'flashcards':
                if (flashcardsSection) flashcardsSection.style.display = 'block';
                renderFlashcardDecks();
                break;
            case 'notes':
                if (notesSection) notesSection.style.display = 'block';
                renderNotes();
                break;
            case 'progress':
                if (progressSection) progressSection.style.display = 'block';
                break;
            case 'reminders':
                if (remindersSection) remindersSection.style.display = 'block';
                if (typeof window.renderReminders === 'function') window.renderReminders();
                break;
            case 'settings':
                if (settingsSection) settingsSection.style.display = 'block';
                if (typeof window.renderSettings === 'function') window.renderSettings();
                break;
            case 'studyRoom':
                if (studyRoomSection) studyRoomSection.style.display = 'block';
                if (typeof window.renderStudyRoom === 'function') window.renderStudyRoom();
                break;
            case 'tags':
                if (tagsSection) tagsSection.style.display = 'block';
                if (typeof window.renderTagsMain === 'function') window.renderTagsMain();
                if (typeof window.renderTaggedItems === 'function') window.renderTaggedItems();
                break;
        }
    }
    window.showView = showView;

    function renderFavorites() {
        const container = document.getElementById('favoritesContainer');
        if (!container) return;
        container.innerHTML = '';
        if (favorites.length === 0) {
            container.innerHTML = '<div style="text-align:center;padding:3rem;color:var(--text-secondary);"><i class="fas fa-star" style="font-size:3rem;margin-bottom:1rem;opacity:0.3;"></i><p>No favorites yet. Click the star on any document to add it here.</p></div>';
            return;
        }
        favorites.forEach(fav => {
            const tile = document.createElement('div');
            tile.className = 'tile';
            tile.innerHTML = `<div class="tile-icon"><i class="fas fa-file-pdf"></i></div><div class="tile-text">${escapeHtml(fav.title)}</div>`;
            tile.onclick = () => {
                if (fav.url && fav.url !== '#') {
                    const parentPath = (Array.isArray(fav.path) ? fav.path : []).slice(0, -1);
                    showView('home');
                    navigateToPath(parentPath);
                    setTimeout(() => showPDF(fav.url, fav.title), 100);
                }
            };
            container.appendChild(tile);
        });
    }

    function renderRecent() {
        const container = document.getElementById('recentContainer');
        if (!container) return;
        container.innerHTML = '';
        const recent = JSON.parse(localStorage.getItem('questionary-recent') || '[]');
        if (recent.length === 0) {
            container.innerHTML = '<div style="text-align:center;padding:3rem;color:var(--text-secondary);"><i class="fas fa-history" style="font-size:3rem;margin-bottom:1rem;opacity:0.3;"></i><p>No recent documents.</p></div>';
            return;
        }
        recent.forEach(doc => {
            const tile = document.createElement('div');
            tile.className = 'tile';
            tile.innerHTML = `<div class="tile-icon"><i class="fas fa-file-pdf"></i></div><div class="tile-text">${escapeHtml(doc.title)}</div>`;
            tile.onclick = () => {
                if (doc.url && doc.url !== '#') {
                    const parentPath = (Array.isArray(doc.path) ? doc.path : []).slice(0, -1);
                    showView('home');
                    navigateToPath(parentPath);
                    setTimeout(() => showPDF(doc.url, doc.title), 100);
                }
            };
            container.appendChild(tile);
        });
    }

    // ================================================================
    // 11. FLASHCARDS, NOTES & STUDY PLANNER
    // ================================================================
    function loadFlashcardDecks() {
        try {
            const raw = localStorage.getItem('questionary-flashcards');
            flashcardDecks = raw ? JSON.parse(raw) : [];
        } catch (e) {
            flashcardDecks = [];
        }
        return flashcardDecks;
    }

    function saveFlashcardDecks() {
        localStorage.setItem('questionary-flashcards', JSON.stringify(flashcardDecks));
        window.flashcardDecks = flashcardDecks;
    }

    function renderFlashcardDecks() {
        loadFlashcardDecks();
        const container = document.getElementById('flashcardsGrid');
        if (!container) return;

        if (flashcardDecks.length === 0) {
            container.innerHTML = '<p style="text-align: center; color: var(--text-secondary); padding: 2rem;">No flashcard decks yet. Click "New Deck" to create one!</p>';
            return;
        }

        container.innerHTML = flashcardDecks.map(deck => `
            <div class="deck-card" data-deck-id="${deck.id}">
                <div class="deck-card-header">
                    <h4 class="deck-card-title">${escapeHtml(deck.name)}</h4>
                    <div class="deck-card-actions">
                        <button class="btn-icon tag" onclick="event.stopPropagation(); openTagItemModal('deck_${deck.id}', '${escapeHtml(deck.name)}', 'flashcard')" title="Add Tags">
                            <i class="fas fa-tag"></i>
                        </button>
                        <button class="btn-icon delete" onclick="event.stopPropagation(); deleteDeck('${deck.id}')" title="Delete deck">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
                <p style="font-size: 0.82rem; color: var(--fg3); margin: 6px 0 12px 0;">${deck.cards.length} ${deck.cards.length === 1 ? 'card' : 'cards'}</p>
                <div style="display: flex; gap: 0.5rem; margin-top: auto;">
                    <button type="button" class="btn btn-primary btn-sm" onclick="startStudyDeck('${deck.id}')" style="flex: 1;">
                        <i class="fas fa-play"></i> Study
                    </button>
                    <button type="button" class="btn btn-secondary btn-sm" onclick="startQuiz('${deck.id}')" style="flex: 1;">
                        <i class="fas fa-question-circle"></i> Quiz
                    </button>
                </div>
            </div>
        `).join('');
    }

    function openFlashcardModal(deckId = null) {
        const modal = document.getElementById('flashcardModal');
        const nameInput = document.getElementById('deckName');
        const cardsContainer = document.getElementById('cardsContainer');
        const modalTitle = document.getElementById('flashcardModalTitle');
        if (!modal) return;
        if (deckId) {
            const deck = flashcardDecks.find(d => String(d.id) === String(deckId));
            if (deck) {
                currentEditingDeck = deck;
                if (nameInput) nameInput.value = deck.name;
                if (modalTitle) modalTitle.innerHTML = '<i class="fas fa-layer-group"></i> Edit Deck';
                renderCardEditors(deck.cards);
            }
        } else {
            currentEditingDeck = null;
            if (nameInput) nameInput.value = '';
            if (modalTitle) modalTitle.innerHTML = '<i class="fas fa-layer-group"></i> Create Flashcard Deck';
            if (cardsContainer) cardsContainer.innerHTML = '';
            addCardEditor();
        }
        modal.classList.add('active');
    }

    function addCardEditor(front = '', back = '') {
        const container = document.getElementById('cardsContainer');
        if (!container) return;
        const cardDiv = document.createElement('div');
        cardDiv.className = 'card-editor';
        cardDiv.style.cssText = 'display:flex;gap:8px;margin-bottom:8px;align-items:center;';
        cardDiv.innerHTML = `
            <input type="text" class="card-front form-input" placeholder="Front (question)" value="${escapeHtml(front)}" style="flex:1;">
            <input type="text" class="card-back form-input" placeholder="Back (answer)" value="${escapeHtml(back)}" style="flex:1;">
            <button type="button" class="btn btn-secondary" onclick="this.parentElement.remove()" style="padding:8px 12px;"><i class="fas fa-times"></i></button>
        `;
        container.appendChild(cardDiv);
    }

    function renderCardEditors(cards) {
        const container = document.getElementById('cardsContainer');
        if (!container) return;
        container.innerHTML = '';
        cards.forEach(card => addCardEditor(card.front, card.back));
    }

    function saveDeck() {
        const nameInput = document.getElementById('deckName');
        const modal = document.getElementById('flashcardModal');
        const name = nameInput?.value.trim();
        if (!name) { showNotification('Please enter a deck name', 'error'); return; }

        const cards = [];
        document.querySelectorAll('.card-editor').forEach(editor => {
            const front = editor.querySelector('.card-front')?.value.trim();
            const back = editor.querySelector('.card-back')?.value.trim();
            if (front && back) cards.push({ front, back });
        });

        if (cards.length === 0) { showNotification('Please add at least one valid card', 'error'); return; }

        if (currentEditingDeck) {
            currentEditingDeck.name = name;
            currentEditingDeck.cards = cards;
        } else {
            flashcardDecks.push({ id: 'deck_' + Date.now(), name, cards });
        }
        saveFlashcardDecks();
        renderFlashcardDecks();
        modal?.classList.remove('active');
        showNotification(currentEditingDeck ? 'Deck updated!' : 'Deck created!', 'success');
        currentEditingDeck = null;
    }

    function deleteDeck(deckId) {
        loadFlashcardDecks();
        const targetId = String(deckId);
        const deck = flashcardDecks.find(d => String(d.id) === targetId);
        if (!deck) return;

        showConfirm(`Delete deck "${deck.name}"?`, { title: 'Delete Deck', type: 'danger', confirmText: 'Delete' }).then(confirmed => {
            if (confirmed) {
                flashcardDecks = flashcardDecks.filter(d => String(d.id) !== targetId);
                saveFlashcardDecks();
                renderFlashcardDecks();
                showNotification('Deck deleted', 'info');
            }
        });
    }

    function startStudyDeck(deckId) {
        loadFlashcardDecks();
        const targetId = String(deckId);
        const deck = flashcardDecks.find(d => String(d.id) === targetId);

        if (!deck || !deck.cards || deck.cards.length === 0) {
            showNotification('This deck has no cards!', 'warning');
            return;
        }

        currentStudyDeck = deck;
        currentCardIndex = 0;

        const modal = document.getElementById('studyModal');
        if (modal) {
            modal.classList.add('active');
            showCurrentCard();
        }
    }

    function showCurrentCard() {
        if (!currentStudyDeck || !currentStudyDeck.cards || currentStudyDeck.cards.length === 0) return;
        const card = currentStudyDeck.cards[currentCardIndex];
        if (!card) return;

        const activeCard = document.getElementById('activeFlashcard');
        const cardFront = document.getElementById('cardFront');
        const cardBack = document.getElementById('cardBack');
        const cardProgress = document.getElementById('cardProgress');

        if (activeCard) activeCard.classList.remove('flipped');
        if (cardFront) cardFront.textContent = card.front || 'Empty Question';
        if (cardBack) cardBack.textContent = card.back || 'Empty Answer';
        if (cardProgress) cardProgress.textContent = `${currentCardIndex + 1} / ${currentStudyDeck.cards.length}`;
    }

    function flipCard() {
        const card = document.getElementById('activeFlashcard');
        if (card) card.classList.toggle('flipped');
    }

    function nextCard() {
        if (currentStudyDeck && currentStudyDeck.cards.length > 0) {
            currentCardIndex = (currentCardIndex + 1) % currentStudyDeck.cards.length;
            showCurrentCard();
        }
    }

    function prevCard() {
        if (currentStudyDeck && currentStudyDeck.cards.length > 0) {
            currentCardIndex = (currentCardIndex - 1 + currentStudyDeck.cards.length) % currentStudyDeck.cards.length;
            showCurrentCard();
        }
    }

    function closeStudyModal() {
        const modal = document.getElementById('studyModal');
        if (modal) modal.classList.remove('active');
        currentStudyDeck = null;
        currentCardIndex = 0;
    }

    // ── Notes Engine ──────────────────────────────────────────────
    function loadNotes() { notes = JSON.parse(localStorage.getItem('questionary-notes') || '[]'); }
    function saveNotes() { localStorage.setItem('questionary-notes', JSON.stringify(notes)); }

    function openNoteModal(noteId = null) {
        const modal = document.getElementById('noteModal');
        const titleInput = document.getElementById('noteTitle');
        const contentInput = document.getElementById('noteContent');
        const modalTitle = document.getElementById('noteModalTitle');
        if (!modal) return;
        if (noteId) {
            const note = notes.find(n => n.id === noteId);
            if (note) {
                currentEditingNote = note;
                if (titleInput) titleInput.value = note.title;
                if (contentInput) contentInput.value = note.content;
                if (modalTitle) modalTitle.innerHTML = '<i class="fas fa-sticky-note"></i> Edit Note';
            }
        } else {
            currentEditingNote = null;
            if (titleInput) titleInput.value = '';
            if (contentInput) contentInput.value = '';
            if (modalTitle) modalTitle.innerHTML = '<i class="fas fa-sticky-note"></i> Create Note';
        }
        modal.classList.add('active');
    }

    function saveNote() {
        const title = document.getElementById('noteTitle')?.value.trim();
        const content = document.getElementById('noteContent')?.value.trim();
        const modal = document.getElementById('noteModal');
        if (!title) { showNotification('Please enter a title', 'error'); return; }

        if (currentEditingNote) {
            currentEditingNote.title = title;
            currentEditingNote.content = content;
            currentEditingNote.updatedAt = Date.now();
        } else {
            notes.push({ id: Date.now().toString(), title, content, createdAt: Date.now(), updatedAt: Date.now() });
        }
        saveNotes();
        renderNotes();
        modal?.classList.remove('active');
        showNotification(currentEditingNote ? 'Note updated!' : 'Note created!', 'success');
        currentEditingNote = null;
    }

    function deleteNote(noteId) {
        const note = notes.find(n => n.id === noteId);
        showConfirm(`Delete note "${note ? note.title : ''}"?`, { title: 'Delete Note', type: 'danger', confirmText: 'Delete' }).then(ok => {
            if (ok) {
                notes = notes.filter(n => n.id !== noteId);
                saveNotes();
                renderNotes();
                showNotification('Note deleted', 'info');
            }
        });
    }

    function renderNotes() {
        loadNotes();
        const container = document.getElementById('notesGrid');
        if (!container) return;
        if (notes.length === 0) {
            container.innerHTML = '<p style="text-align: center; color: var(--text-secondary); padding: 2rem;">No notes yet.</p>';
            return;
        }
        container.innerHTML = notes.map(note => `
            <div class="note-card" onclick="openNoteModal('${note.id}')">
                <h4>${escapeHtml(note.title)}</h4>
                <p>${escapeHtml(note.content.substring(0, 100))}${note.content.length > 100 ? '...' : ''}</p>
                <small>${new Date(note.updatedAt).toLocaleDateString()}</small>
                <div class="note-actions">
                    <button class="btn-icon tag" onclick="event.stopPropagation(); openTagItemModal('note_${note.id}', '${escapeHtml(note.title)}', 'note')" title="Add Tags">
                        <i class="fas fa-tag"></i>
                    </button>
                    <button class="btn-icon delete" onclick="event.stopPropagation(); deleteNote('${note.id}')" title="Delete note">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
        `).join('');
    }

    // ── Planner & Calendar Engine ─────────────────────────────────
    function loadStudySessions() { studySessions = JSON.parse(localStorage.getItem('questionary-sessions') || '[]'); }
    function saveStudySessions() { localStorage.setItem('questionary-sessions', JSON.stringify(studySessions)); }

    function openSessionModal() {
        const modal = document.getElementById('sessionModal');
        if (!modal) return;
        document.getElementById('sessionSubject').value = '';
        document.getElementById('sessionDate').value = new Date().toISOString().split('T')[0];
        document.getElementById('sessionTime').value = '09:00';
        modal.classList.add('active');
    }

    function saveSession() {
        const subject = document.getElementById('sessionSubject')?.value.trim();
        const date = document.getElementById('sessionDate')?.value;
        const time = document.getElementById('sessionTime')?.value;
        if (!subject || !date) { showNotification('Subject and date required', 'error'); return; }

        studySessions.push({ id: Date.now().toString(), subject, date, time: time || '09:00' });
        saveStudySessions();
        renderCalendar();
        renderSessions();
        document.getElementById('sessionModal')?.classList.remove('active');
        showNotification('Session added!', 'success');
    }

    function deleteSession(sessionId) {
        showConfirm('Delete this study session?', { title: 'Delete Session', type: 'danger', confirmText: 'Delete' }).then(ok => {
            if (ok) {
                studySessions = studySessions.filter(s => s.id !== sessionId);
                saveStudySessions();
                renderCalendar();
                renderSessions();
                showNotification('Session deleted', 'info');
            }
        });
    }

    function renderCalendar() {
        const calendarGrid = document.getElementById('calendarDays') || document.getElementById('calendarGrid');
        const currentMonthEl = document.getElementById('currentMonth');
        if (!calendarGrid) return;

        const year = currentCalendarDate.getFullYear();
        const month = currentCalendarDate.getMonth();

        if (currentMonthEl) {
            currentMonthEl.textContent = new Date(year, month).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
        }

        const firstDay = new Date(year, month, 1).getDay();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const today = new Date();

        let html = '';
        for (let i = 0; i < firstDay; i++) {
            html += '<div class="calendar-day empty"></div>';
        }

        for (let day = 1; day <= daysInMonth; day++) {
            const date = new Date(year, month, day);
            const isToday = date.toDateString() === today.toDateString();
            const dateStr = date.toISOString().split('T')[0];
            const sessionsOnDay = studySessions.filter(s => s.date === dateStr);

            html += `
                <div class="calendar-day ${isToday ? 'today' : ''} ${sessionsOnDay.length > 0 ? 'has-session' : ''}" onclick="showDaySessions('${dateStr}')">
                    <span class="day-number">${day}</span>
                    ${sessionsOnDay.length > 0 ? `<span class="session-dot">${sessionsOnDay.length}</span>` : ''}
                </div>
            `;
        }

        calendarGrid.innerHTML = html;
    }

    function renderSessions() {
        const container = document.getElementById('sessionsList');
        if (!container) return;

        if (studySessions.length === 0) {
            container.innerHTML = '<p style="text-align: center; color: var(--text-secondary); padding: 2rem;">No study sessions scheduled.</p>';
            return;
        }

        const sorted = [...studySessions].sort((a, b) => new Date(a.date) - new Date(b.date));
        container.innerHTML = sorted.map(session => `
            <div class="session-item">
                <div class="session-info">
                    <strong>${escapeHtml(session.subject)}</strong>
                    <span>${session.date} at ${session.time}</span>
                </div>
                <button class="btn-icon" onclick="deleteSession('${session.id}')" title="Delete">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        `).join('');
    }

    function showDaySessions(dateStr) {
        const sessionsOnDay = studySessions.filter(s => s.date === dateStr);
        if (sessionsOnDay.length === 0) showNotification(`No sessions on ${dateStr}`, 'info');
        else showInfoDialog(sessionsOnDay.map(s => `• ${s.subject} at ${s.time}`).join('\n'), { title: `Sessions on ${dateStr}`, type: 'info' });
    }

    // ================================================================
    // 12. SEARCH, RECENT & ANALYTICS
    // ================================================================
    function trackSubjectAccess(subjectName) {
        if (!subjectName) return;
        const subjectAccess = JSON.parse(localStorage.getItem('questionary-subject-access') || '{}');
        subjectAccess[subjectName] = (subjectAccess[subjectName] || 0) + 1;
        localStorage.setItem('questionary-subject-access', JSON.stringify(subjectAccess));
    }

    function trackStudyTime(minutes) {
        studyStats.totalTime = (studyStats.totalTime || 0) + minutes;
        localStorage.setItem('questionary-study-stats', JSON.stringify(studyStats));
    }

    function trackPdfViewStart() { pdfViewStartTime = Date.now(); }

    async function performSearch(e) {
        const query = typeof e === 'string' ? e : (e?.target?.value || '');
        const searchResults = document.getElementById('searchResults');

        if (!query || query.length < 2) {
            if (searchResults) searchResults.style.display = 'none';
            return;
        }

        const results = [];
        const sqlResults = await DbService.search(query.toLowerCase());
        results.push(...sqlResults);

        if (searchResults) {
            if (results.length === 0) {
                searchResults.innerHTML = '<div style="padding: 1rem; text-align: center; color: var(--text-secondary);">No results found</div>';
            } else {
                searchResults.innerHTML = results.slice(0, 15).map(r => {
                    const icon = r.isFolder ? 'fa-folder' : 'fa-file-pdf';
                    return `
                        <div class="search-result-item" onclick="navigateToSearchResult(${JSON.stringify(r.path).replace(/"/g, '&quot;')}, '${r.url || ''}')">
                            <i class="fas ${icon}"></i>
                            <div class="search-result-info">
                                <span class="search-result-name">${escapeHtml(r.name)}</span>
                                <span class="search-result-path">${r.path.join(' > ')}</span>
                            </div>
                        </div>
                    `;
                }).join('');
            }
            searchResults.style.display = 'block';
        }
    }

    async function navigateToSearchResult(pathArray, url) {
        const searchResults = document.getElementById('searchResults');
        if (searchResults) searchResults.style.display = 'none';
        document.getElementById('globalSearch').value = '';

        showView('home');
        setActiveNav('homeNav');

        if (url && url !== '#' && url !== '') {
            path = pathArray.slice(0, -1);
            updateBreadcrumb();
            const title = pathArray[pathArray.length - 1];
            addToRecent(title, pathArray, url);
            setTimeout(() => showPDF(url, title), 100);
        } else {
            path = [...pathArray];
            await navigateToPath(path);
        }
    }
    window.navigateToSearchResult = navigateToSearchResult;

    function renderAnalytics() {
        const accessData = JSON.parse(localStorage.getItem('questionary-daily-access') || '{}');
        const recent = JSON.parse(localStorage.getItem('questionary-recent') || '[]');

        const totalSessions = Object.values(accessData).reduce((sum, count) => sum + count, 0);
        const totalDocsViewed = recent.length;
        const daysActive = Object.keys(accessData).length;
        const avgSessionsPerDay = daysActive > 0 ? (totalSessions / daysActive).toFixed(1) : 0;

        document.getElementById('totalSessions') && (document.getElementById('totalSessions').textContent = totalSessions);
        document.getElementById('totalDocsViewed') && (document.getElementById('totalDocsViewed').textContent = totalDocsViewed);
        document.getElementById('daysActive') && (document.getElementById('daysActive').textContent = daysActive);
        document.getElementById('avgSessions') && (document.getElementById('avgSessions').textContent = avgSessionsPerDay);
    }

    function showHomeTagsPanels() {
        const homeTagsSection = document.getElementById('homeTagsSection');
        const homeTaggedItemsSection = document.getElementById('homeTaggedItemsSection');
        if (homeTagsSection) homeTagsSection.style.display = 'block';
        if (homeTaggedItemsSection) homeTaggedItemsSection.style.display = 'block';
    }

    function hideHomeTagsPanels() {
        const homeTagsSection = document.getElementById('homeTagsSection');
        const homeTaggedItemsSection = document.getElementById('homeTaggedItemsSection');
        if (homeTagsSection) homeTagsSection.style.display = 'none';
        if (homeTaggedItemsSection) homeTaggedItemsSection.style.display = 'none';
    }

    // ================================================================
    // 13. TIMER SYSTEM
    // ================================================================
    function initializeTimer() {
        const timerPanel = document.getElementById('timerPanel');
        const timerClose = document.getElementById('timerClose');
        const timerMinimize = document.getElementById('timerMinimize');
        const timerStart = document.getElementById('timerStart');
        const timerPause = document.getElementById('timerPause');
        const timerResume = document.getElementById('timerResume');
        const timerReset = document.getElementById('timerReset');
        const timerLap = document.getElementById('timerLap');
        const timerReopenBtn = document.getElementById('timerReopenBtn');

        if (timerReopenBtn) {
            timerReopenBtn.onclick = () => {
                showTimer();
                timerReopenBtn.classList.remove('pulse');
            };
        }

        document.querySelectorAll('.timer-preset-btn').forEach(btn => {
            const dur = parseInt(btn.dataset.duration, 10);
            if (dur && dur > 0) {
                btn.onclick = () => selectTimerPreset(btn, dur);
            }
        });

        if (timerClose) timerClose.onclick = () => hideTimer();
        if (timerMinimize) timerMinimize.onclick = () => toggleTimerMinimize();
        if (timerStart) timerStart.onclick = () => startTimer();
        if (timerPause) timerPause.onclick = () => pauseTimer();
        if (timerResume) timerResume.onclick = () => resumeTimer();
        if (timerReset) timerReset.onclick = () => resetTimer();
        if (timerLap) timerLap.onclick = () => addLap();
    }

    function toggleTimerMinimize() {
        const timerPanel = document.getElementById('timerPanel');
        const minimizeBtn = document.getElementById('timerMinimize');
        if (!timerPanel) return;

        timerPanel.classList.toggle('minimized');
        const isMinimized = timerPanel.classList.contains('minimized');

        if (minimizeBtn) {
            const icon = minimizeBtn.querySelector('i');
            if (icon) {
                icon.className = isMinimized ? 'fas fa-expand' : 'fas fa-minus';
            }
        }
    }

    function selectTimerPreset(btn, duration) {
        if (!duration || isNaN(duration) || duration <= 0) return;

        document.querySelectorAll('.timer-preset-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        timerState.duration = duration;
        timerState.remaining = duration;
        updateTimerDisplay();

        const timerControls = document.getElementById('timerControls');
        if (timerControls) timerControls.style.display = 'flex';

        document.getElementById('timerStart') && (document.getElementById('timerStart').style.display = 'flex');
        document.getElementById('timerPause') && (document.getElementById('timerPause').style.display = 'none');
        document.getElementById('timerResume') && (document.getElementById('timerResume').style.display = 'none');
    }

    function startTimer() {
        if (timerState.duration === 0) return;
        timerState.isRunning = true;
        timerState.isPaused = false;
        timerState.lastLapTime = timerState.duration;

        document.getElementById('timerStart') && (document.getElementById('timerStart').style.display = 'none');
        document.getElementById('timerPause') && (document.getElementById('timerPause').style.display = 'flex');
        document.getElementById('timerResume') && (document.getElementById('timerResume').style.display = 'none');
        document.getElementById('timerLap') && (document.getElementById('timerLap').style.display = 'flex');

        timerState.interval = setInterval(() => {
            if (timerState.remaining > 0) {
                timerState.remaining--;
                updateTimerDisplay();
            } else {
                timerFinished();
            }
        }, 1000);
    }

    function pauseTimer() {
        timerState.isRunning = false;
        timerState.isPaused = true;
        clearInterval(timerState.interval);

        document.getElementById('timerPause') && (document.getElementById('timerPause').style.display = 'none');
        document.getElementById('timerResume') && (document.getElementById('timerResume').style.display = 'flex');
    }

    function resumeTimer() {
        startTimer();
    }

    function resetTimer() {
        clearInterval(timerState.interval);
        timerState.isRunning = false;
        timerState.isPaused = false;
        timerState.remaining = timerState.duration;

        document.getElementById('timerStart') && (document.getElementById('timerStart').style.display = 'flex');
        document.getElementById('timerPause') && (document.getElementById('timerPause').style.display = 'none');
        document.getElementById('timerResume') && (document.getElementById('timerResume').style.display = 'none');
        document.getElementById('timerLap') && (document.getElementById('timerLap').style.display = 'none');

        updateTimerDisplay();
    }

    function timerFinished() {
        clearInterval(timerState.interval);
        timerState.isRunning = false;
        timerState.isPaused = false;

        if (typeof window.playAlarmSound === 'function') {
            window.playAlarmSound();
        }
        showNotification('⏰ Timer Complete!', 'success');
    }

    function updateTimerDisplay() {
        const display = document.getElementById('timerDisplay');
        if (!display) return;

        const remaining = timerState.remaining || 0;
        const hours = Math.floor(remaining / 3600);
        const minutes = Math.floor((remaining % 3600) / 60);
        const seconds = remaining % 60;

        display.textContent = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }

    function showTimer() {
        const timerPanel = document.getElementById('timerPanel');
        const reopenBtn = document.getElementById('timerReopenBtn');
        if (timerPanel) timerPanel.style.display = 'flex';
        if (reopenBtn) reopenBtn.style.display = 'none';
    }

    function hideTimer() {
        const timerPanel = document.getElementById('timerPanel');
        const reopenBtn = document.getElementById('timerReopenBtn');
        if (timerPanel) timerPanel.style.display = 'none';

        const pdfViewer = document.getElementById('pdfViewer');
        const isPdfVisible = pdfViewer && pdfViewer.classList.contains('active');
        if (reopenBtn && isPdfVisible) {
            reopenBtn.style.display = 'flex';
        }
    }

    function hideTimerCompletely() {
        const timerPanel = document.getElementById('timerPanel');
        const reopenBtn = document.getElementById('timerReopenBtn');
        if (timerPanel) timerPanel.style.display = 'none';
        if (reopenBtn) reopenBtn.style.display = 'none';
        if (timerState.isRunning) {
            clearInterval(timerState.interval);
            timerState.isRunning = false;
        }
    }

    function addLap() {
        if (!timerState.isRunning || timerState.remaining <= 0) return;
        const lapTime = timerState.remaining;
        const elapsed = timerState.lastLapTime - lapTime;

        timerState.laps.push({ number: timerState.laps.length + 1, time: lapTime, elapsed });
        timerState.lastLapTime = lapTime;
        showNotification(`Lap ${timerState.laps.length} recorded`, 'success');
    }

    // ================================================================
    // 14. QUICK LINKS
    // ================================================================
    function addFolderToQuickLinks(folderName, folderPath) {
        const pathStr = folderPath.join('|');
        if (quickLinks.some(ql => ql.pathArray.join('|') === pathStr)) {
            showNotification('Folder already in quick links', 'info');
            return;
        }
        quickLinks.push({ id: Date.now().toString(), name: folderName, pathArray: [...folderPath], isFile: false });
        localStorage.setItem('questionary-quick-links', JSON.stringify(quickLinks));
        renderQuickLinks();
        showNotification(`Added "${folderName}" to quick links`, 'success');
    }
    window.addFolderToQuickLinks = addFolderToQuickLinks;

    function renderQuickLinks() {
        const container = document.getElementById('quickLinksList');
        if (!container) return;
        quickLinks = JSON.parse(localStorage.getItem('questionary-quick-links') || '[]');

        if (quickLinks.length === 0) {
            container.innerHTML = '<div class="quick-links-empty"><p>No quick links saved</p></div>';
            return;
        }

        container.innerHTML = quickLinks.map(ql => `
            <div class="quick-link-item" onclick="navigateToPath(${JSON.stringify(ql.pathArray).replace(/"/g, '&quot;')})">
                <i class="fas ${ql.isFile ? 'fa-file-pdf' : 'fa-folder'}"></i>
                <span class="quick-link-name">${escapeHtml(ql.name)}</span>
            </div>
        `).join('');
    }

    // ================================================================
    // 15. KEYBOARD SHORTCUTS ROUTER
    // ================================================================
    const DEFAULT_KEYBINDS = {
        focusSearch:   { key: '/', ctrl: false, alt: false, shift: false, label: 'Focus Search' },
        newNote:       { key: 'n', ctrl: false, alt: false, shift: false, label: 'New Note' },
        newFlashcard:  { key: 'f', ctrl: false, alt: false, shift: false, label: 'New Flashcard' },
        goBack:        { key: 'Backspace', ctrl: false, alt: false, shift: false, label: 'Go Back' },
        goHome:        { key: 'Home', ctrl: false, alt: true, shift: false, label: 'Go Home' }
    };

    function loadKeybinds() {
        const saved = localStorage.getItem('questionary-keybinds');
        const binds = saved ? JSON.parse(saved) : {};
        return { ...DEFAULT_KEYBINDS, ...binds };
    }

    function keybindMatches(e, bindId) {
        const binds = loadKeybinds();
        const b = binds[bindId];
        if (!b) return false;
        const keyMatch = e.key.toLowerCase() === b.key.toLowerCase() || e.key === b.key;
        return keyMatch && e.ctrlKey === !!b.ctrl && e.altKey === !!b.alt && e.shiftKey === !!b.shift;
    }

    // ================================================================
    // 16. APPLICATION INITIALIZATION & EVENT DISPATCHER
    // ================================================================
    async function initializeApp() {
        console.log('[App] Initializing Questionary Engine...');
        preventAccidentalSelection();

        if (window.__TAURI__ && window.__TAURI__.window) {
            try {
                const currentWindow = window.__TAURI__.window.getCurrentWindow();
                await currentWindow.show();
                await currentWindow.setFocus();
            } catch (e) {}
        }

        await initializeFavorites();
        await DbService.init();

        applyAccessibilitySettings();
        if (typeof window.initThemeOnLoad === 'function') {
            window.initThemeOnLoad();
        }

        setupNavigationListeners();
        setupUserDropdown();
        setupGlobalSearch();
        checkSavedLogin();

        // Master Keyboard Router
        document.addEventListener('keydown', async (e) => {
            if (e.target.closest('input, textarea, [contenteditable]')) return;

            if (e.key === 'Escape') {
                const pdfViewerContainer = document.getElementById('pdfViewerContainer');
                if (pdfViewerContainer && pdfViewerContainer.style.display !== 'none') {
                    closePDF();
                    return;
                }
                if (path.length > 0) {
                    path.pop();
                    const nodes = await DbService.getChildren(path);
                    renderTilesFromDb(nodes);
                    updateBreadcrumb();
                    return;
                }
            }

            if (keybindMatches(e, 'focusSearch')) {
                e.preventDefault();
                document.getElementById('globalSearch')?.focus();
            }
            if (keybindMatches(e, 'goHome')) {
                e.preventDefault();
                showView('home');
                path = [];
                await navigateToPath([]);
                setActiveNav('homeNav');
            }
        });

        // External Window Message Receiver
        window.addEventListener('message', (e) => {
            if (e.data && e.data.type === 'openInNewWindow' && e.data.url) {
                openUrlInExternalWindow(e.data.url);
            }
        });

        const nodes = await DbService.getChildren(path);
        renderTilesFromDb(nodes);
        updateBreadcrumb();

        setTimeout(() => restoreLastLocation(), 100);
        console.log('[App] Core initialized successfully');
    }

    function setupNavigationListeners() {
        const navMap = [
            { id: 'homeNav', view: 'home' },
            { id: 'favoritesNav', view: 'favorites' },
            { id: 'recentNav', view: 'recent' },
            { id: 'analyticsNav', view: 'analytics' },
            { id: 'studyPlannerNav', view: 'planner' },
            { id: 'flashcardsNav', view: 'flashcards' },
            { id: 'notesNav', view: 'notes' },
            { id: 'tagsNav', view: 'tags' },
            { id: 'progressNav', view: 'progress' },
            { id: 'remindersNav', view: 'reminders' },
            { id: 'studyRoomNav', view: 'studyRoom' },
            { id: 'settingsNav', view: 'settings' }
        ];

        navMap.forEach(({ id, view }) => {
            const btn = document.getElementById(id);
            if (btn) {
                btn.addEventListener('click', () => {
                    showView(view);
                    setActiveNav(id);
                    closeSidebar();
                });
            }
        });

        document.getElementById('backBtn')?.addEventListener('click', async () => {
            if (path.length > 0) {
                path.pop();
                const nodes = await DbService.getChildren(path);
                renderTilesFromDb(nodes);
                updateBreadcrumb();
            }
        });

        document.getElementById('hamburgerMenu')?.addEventListener('click', () => {
            const nav = document.getElementById('navLinks');
            const overlay = document.getElementById('sidebarOverlay');
            const open = nav.classList.toggle('sidebar-open');
            overlay?.classList.toggle('active', open);
        });

        document.getElementById('sidebarClose')?.addEventListener('click', closeSidebar);
        document.getElementById('sidebarOverlay')?.addEventListener('click', closeSidebar);
    }

    function closeSidebar() {
        document.getElementById('navLinks')?.classList.remove('sidebar-open');
        document.getElementById('sidebarOverlay')?.classList.remove('active');
    }

    function setupUserDropdown() {
        const userBadge = document.getElementById('userBadge');
        if (userBadge) {
            userBadge.onclick = (e) => {
                if (e.target.closest('#userDropdownMenu')) return;
                userBadge.classList.toggle('active');
            };
        }

        document.getElementById('logoutBtn')?.addEventListener('click', () => {
            showConfirm('Log out of Questionary?', { title: 'Logout', type: 'warning' }).then(ok => {
                if (ok) {
                    localStorage.removeItem('revamp-dpsnt-remember');
                    sessionStorage.removeItem('revamp-dpsnt-session');
                    location.reload();
                }
            });
        });

        document.getElementById('openSettingsBtn')?.addEventListener('click', () => {
            userBadge?.classList.remove('active');
            showView('settings');
            setActiveNav('settingsNav');
        });
    }

    function setupGlobalSearch() {
        const search = document.getElementById('globalSearch');
        search?.addEventListener('input', performSearch);
        search?.addEventListener('focus', () => { if (search.value.trim()) performSearch(); });
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.search-container')) {
                const res = document.getElementById('searchResults');
                if (res) res.style.display = 'none';
            }
        });
    }

    function checkSavedLogin() {
        const saved = localStorage.getItem('revamp-dpsnt-remember') || sessionStorage.getItem('revamp-dpsnt-session');
        if (saved) {
            try {
                currentUser = JSON.parse(saved);
                showApp();
                const disp = document.getElementById('username-display');
                if (disp) disp.textContent = currentUser.username;
                return;
            } catch (e) {}
        }

        document.getElementById('loginForm')?.addEventListener('submit', (e) => {
            e.preventDefault();
            const u = document.getElementById('username')?.value.trim();
            const p = document.getElementById('password')?.value;
            const rem = document.getElementById('rememberMe')?.checked;

            if (users[u] && users[u].password === p) {
                currentUser = { username: u, role: users[u].role };
                if (rem) localStorage.setItem('revamp-dpsnt-remember', JSON.stringify(currentUser));
                sessionStorage.setItem('revamp-dpsnt-session', JSON.stringify(currentUser));
                showApp();
                const disp = document.getElementById('username-display');
                if (disp) disp.textContent = u;
                showNotification(`Welcome, ${u}!`, 'success');
            } else {
                showNotification('Invalid username or password', 'error');
            }
        });
    }

    async function openUrlInExternalWindow(url) {
        if (!url) return;
        if (window.__TAURI__ && window.__TAURI__.core && typeof window.__TAURI__.core.invoke === 'function') {
            try {
                await window.__TAURI__.core.invoke('plugin:opener|open_url', { url });
                return;
            } catch (e) {
                try {
                    await window.__TAURI__.core.invoke('plugin:opener|open_path', { path: url });
                    return;
                } catch (err) {}
            }
        }
        window.open(url, '_blank', 'noopener,noreferrer');
    }
    window.openUrlInExternalWindow = openUrlInExternalWindow;

    // ================================================================
    // 17. GLOBAL API EXPORTS
    // ================================================================
    window.openNoteModal = openNoteModal;
    window.saveNote = saveNote;
    window.deleteNote = deleteNote;
    window.openFlashcardModal = openFlashcardModal;
    window.saveDeck = saveDeck;
    window.deleteDeck = deleteDeck;
    window.startStudyDeck = startStudyDeck;
    window.flipCard = flipCard;
    window.nextCard = nextCard;
    window.prevCard = prevCard;
    window.closeStudyModal = closeStudyModal;
    window.openSessionModal = openSessionModal;
    window.saveSession = saveSession;
    window.deleteSession = deleteSession;
    window.showDaySessions = showDaySessions;
    window.toggleFavorite = toggleFavorite;
    window.addToRecent = addToRecent;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initializeApp);
    } else {
        initializeApp();
    }
}
