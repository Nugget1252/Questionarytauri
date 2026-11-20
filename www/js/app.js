

if (window._HOT_APP_JS_LOADED && document.currentScript && !document.currentScript.id?.startsWith('hot-js-')) {
  console.log('[App] Stored hot-updated app.js is already running. Skipping base bundle.');
} else {

  // Purge legacy localStorage eval overrides on startup
  (function purgeLegacyModuleOverrides() {
    try {
      localStorage.removeItem('questionary-code-files');
      localStorage.removeItem('questionary-installed-commit-sha');
    } catch (err) {}
  })();

  // Top-level variables use var/window scope to allow safe hot-update re-evaluation
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
  var documents = window.documents || {}; // Deprecated: Kept empty strictly to prevent legacy errors
  window.documents = documents;
  var studyStats = window.studyStats || { totalTime: 0, streak: 0, lastStudyDate: null, hourlyActivity: {} };
  var currentCalendarDate = window.currentCalendarDate || new Date();
  var currentEditingNote = window.currentEditingNote || null;
  var currentEditingDeck = window.currentEditingDeck || null;
  var currentStudyDeck = window.currentStudyDeck || null;
  var currentStudyCards = [];
  var isStudyShuffled = false;
  var currentCardIndex = window.currentCardIndex || 0;
  var _flashcardResetRaf = null;
  var _searchHistoryTimer = null;
  var accessibilitySettings = window.accessibilitySettings || {
    highContrast: localStorage.getItem('accessibility-high-contrast') === 'true',
    largeText: localStorage.getItem('accessibility-large-text') === 'true',
    reducedMotion: localStorage.getItem('accessibility-reduced-motion') === 'true',
    enhancedFocus: localStorage.getItem('accessibility-enhanced-focus') === 'true'
  };

  // ================================================================
  // PREVENT ACCIDENTAL UI TEXT SELECTION & TOUCH OPTIMIZATION
  // ================================================================
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
      .dialog-box, .dialog-overlay, #dbUploadOverlay, #dbDropZone, .mobile-bottom-nav,
      .mobile-bottom-nav-item, .library-item, .modal-sheet-handle {
        -webkit-user-select: none !important;
        -moz-user-select: none !important;
        -ms-user-select: none !important;
        user-select: none !important;
        -webkit-tap-highlight-color: transparent !important;
        touch-action: manipulation;
      }

      input, textarea, select, code, pre, [contenteditable="true"],
      .note-card-content, .note-card-title, .flashcard-front, .flashcard-back,
      .quiz-question, .sr-chat-msg, .sr-wb-q-textarea, .selectable-text {
        -webkit-user-select: text !important;
        -moz-user-select: text !important;
        -ms-user-select: text !important;
        user-select: text !important;
        touch-action: auto;
      }

      canvas, #srWbCanvas, .annotation-canvas {
        touch-action: none !important;
      }
      `;
      (document.head || document.documentElement).appendChild(style);
    }

    document.addEventListener('selectstart', (e) => {
      const isSelectable = e.target.closest && e.target.closest(
        'input, textarea, select, code, pre, [contenteditable="true"], .note-card-content, .note-card-title, .flashcard-front, .flashcard-back, .quiz-question, .sr-chat-msg, .sr-wb-q-textarea, .selectable-text, iframe, #pdfViewer'
      );
      if (!isSelectable) {
        e.preventDefault();
      }
    }, false);

    document.addEventListener('dragstart', (e) => {
      const isDraggable = e.target.closest && e.target.closest(
        'a, img, [draggable="true"]'
      );
      if (!isDraggable) {
        e.preventDefault();
      }
    }, false);
  }

  preventAccidentalSelection();

  // ================================================================
  // LOCAL NODE STORE (Android & Offline Fallback Engine)
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
      if (nodes.length === 0) {
        nodes = this.seedDefaultLibrary();
      }

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

    getAllNodesWithPaths() {
      let nodes = this.getNodes();
      if (nodes.length === 0) {
        nodes = this.seedDefaultLibrary();
      }
      const byId = new Map(nodes.map(n => [n.id, n]));
      return nodes.map(m => {
        const pathArray = [];
        let cur = m;
        let guard = 0;
        while (cur && guard < 16) {
          pathArray.unshift(cur.name);
          cur = cur.parent_id !== null && cur.parent_id !== undefined ? byId.get(cur.parent_id) : null;
          guard++;
        }
        return {
          id: m.id,
          name: m.name,
          path: pathArray,
          isFolder: m.is_folder === 1,
          url: m.file_path
        };
      });
    },

    search(keyword) {
      return filterDocumentCatalogByQuery(this.getAllNodesWithPaths(), keyword);
    },

    countDocuments() {
      const nodes = this.getNodes();
      return nodes.filter(n => n.is_folder === 0 && n.file_path && n.file_path !== '#').length;
    }
  };

  // ================================================================
  // SQLITE & INDEXEDDB ENGINE (Electron, Web & Android Unbreakable)
  // ================================================================
  const VALID_VIEWS = new Set([
    'home', 'favorites', 'recent', 'analytics', 'planner',
    'flashcards', 'notes', 'progress', 'reminders',
    'settings', 'tags', 'studyRoom'
  ]);

  async function _fetchWasmBinary() {
    if (window.electronAPI && typeof window.electronAPI.readWasmFile === 'function') {
      try {
        const bytes = await window.electronAPI.readWasmFile();
        if (bytes && bytes.byteLength > 1000) {
          const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
          if (u8[0] === 0x00 && u8[1] === 0x61 && u8[2] === 0x73 && u8[3] === 0x6d) {
            return u8;
          }
        }
      } catch (e) {}
    }

    const wasmUrls = ['js/sql-wasm.wasm', './js/sql-wasm.wasm', '/js/sql-wasm.wasm', 'sql-wasm.wasm'];
    const isFileProtocol = typeof window !== 'undefined' && window.location && window.location.protocol === 'file:';

    if (!isFileProtocol && typeof fetch === 'function') {
      for (const wUrl of wasmUrls) {
        try {
          const res = await fetch(wUrl, { cache: 'no-cache' });
          if (res && res.ok) {
            const ab = await res.arrayBuffer();
            const u8 = new Uint8Array(ab);
            if (u8.byteLength > 1000 && u8[0] === 0x00 && u8[1] === 0x61 && u8[2] === 0x73 && u8[3] === 0x6d) {
              return u8;
            }
          }
        } catch (e) {}
      }
    }

    for (const wUrl of wasmUrls) {
      const u8 = await new Promise((resolve) => {
        try {
          const xhr = new XMLHttpRequest();
          xhr.open('GET', wUrl, true);
          xhr.responseType = 'arraybuffer';
          xhr.onload = () => {
            if ((xhr.status === 200 || (xhr.status === 0 && xhr.response)) && xhr.response) {
              const arr = new Uint8Array(xhr.response);
              if (arr.byteLength > 1000 && arr[0] === 0x00 && arr[1] === 0x61 && arr[2] === 0x73 && arr[3] === 0x6d) {
                resolve(arr);
                return;
              }
            }
            resolve(null);
          };
          xhr.onerror = () => resolve(null);
          xhr.ontimeout = () => resolve(null);
          xhr.send(null);
        } catch (e) {
          resolve(null);
        }
      });
      if (u8) return u8;
    }

    return null;
  }

  async function getSharedSqlJsInstance() {
    if (window.SQL_INSTANCE) return window.SQL_INSTANCE;
    if (window._SQL_INIT_PROMISE) return window._SQL_INIT_PROMISE;

    window._SQL_INIT_PROMISE = (async () => {
      if (typeof window.initSqlJs === 'undefined') {
        const scriptSources = ['js/sql-wasm.js', './js/sql-wasm.js', '/js/sql-wasm.js', 'sql-wasm.js'];
        for (const src of scriptSources) {
          try {
            await new Promise((resolve, reject) => {
              const script = document.createElement('script');
              script.src = src;
              script.onload = resolve;
              script.onerror = reject;
              document.head.appendChild(script);
            });
            if (typeof window.initSqlJs !== 'undefined') break;
          } catch (e) {}
        }
      }

      if (typeof window.initSqlJs !== 'function') {
        throw new Error('initSqlJs is unavailable');
      }

      const wasmBinary = await _fetchWasmBinary();
      const config = {
        locateFile: (file) => {
          try {
            return new URL(`js/${file}`, window.location.href).href;
          } catch (e) {
            return `js/${file}`;
          }
        }
      };
      if (wasmBinary) {
        config.wasmBinary = wasmBinary;
      }

      const instance = await window.initSqlJs(config);
      window.SQL_INSTANCE = instance;
      return instance;
    })();

    try {
      return await window._SQL_INIT_PROMISE;
    } catch (err) {
      window._SQL_INIT_PROMISE = null;
      throw err;
    }
  }
  window.getSharedSqlJsInstance = getSharedSqlJsInstance;

  const DbService = {
    db: null,
    SQL: null,
    isFallback: false,
    _initPromise: null,
    _isInternalInit: false,

    async init() {
      if (this.db && !this.isFallback) return true;
      if (this._initPromise) return this._initPromise;
      this._initPromise = (async () => {
        this._isInternalInit = true;
        try {
          await this._internalInit();
          this.isFallback = false;
          localStorage.removeItem('questionary-local-nodes');
          console.log('[SQLite Engine] Initialized successfully');
          return true;
        } catch (err) {
          console.warn('[SQLite Engine] WASM DB Init fallback triggered. Activating LocalNodeStore:', err);
          this.isFallback = true;
          const syncedApi = await this._syncFromServerApiTree();
          if (!syncedApi && LocalNodeStore.getNodes().length <= 12) {
            LocalNodeStore.seedDefaultLibrary();
          }
          return true;
        } finally {
          this._isInternalInit = false;
          this._initPromise = null;
        }
      })();
      return this._initPromise;
    },

    getRuntimeContext() {
      if (window.OfflineEngine && typeof window.OfflineEngine.getRuntimeContext === 'function') {
        return window.OfflineEngine.getRuntimeContext();
      }
      const loc = (typeof window !== 'undefined' && window.location) ? window.location : { protocol: 'http:', href: '', origin: '' };
      const protocol = loc.protocol || 'http:';
      const isFileProtocol = protocol === 'file:';
      const isDevServer = protocol === 'http:' || protocol === 'https:';
      const cleanHref = String(loc.href || '').split('#')[0].split('?')[0];
      const lastSlash = cleanHref.lastIndexOf('/');
      const baseDir = lastSlash >= 0 ? cleanHref.substring(0, lastSlash + 1) : '';
      return {
        protocol,
        isFileProtocol,
        isDevServer,
        isElectron: Boolean(window.electronAPI),
        isCapacitor: Boolean(window.Capacitor),
        origin: loc.origin && loc.origin !== 'null' ? loc.origin : '',
        baseHref: cleanHref,
        baseDir
      };
    },

    buildDatabaseFetchUrls() {
      if (window.OfflineEngine && typeof window.OfflineEngine.buildDatabaseCandidateUrls === 'function') {
        return window.OfflineEngine.buildDatabaseCandidateUrls();
      }
      const ctx = this.getRuntimeContext();
      const relativeNames = [
        'questionary.db',
        'database.db',
        'assets/questionary.db',
        'assets/database.db'
      ];
      const urls = [];
      const addUrl = (u) => {
        if (u && !urls.includes(u)) urls.push(u);
      };

      // 1. Primary context-aware URLs resolved relative to the directory containing index.html
      for (const rel of relativeNames) {
        if (ctx.baseDir) {
          try {
            addUrl(new URL(rel, ctx.baseDir).href);
          } catch (e) {
            addUrl(`${ctx.baseDir}${rel}`);
          }
        }
      }

      // 2. Relative URLs (compatible with both dev server and production file:// contexts)
      for (const rel of relativeNames) {
        addUrl(`./${rel}`);
        addUrl(rel);
      }

      // 3. Origin-root URLs ONLY for HTTP/HTTPS dev/web servers (never on file:// where /questionary.db points to OS root)
      if (ctx.isDevServer && ctx.origin) {
        for (const rel of relativeNames) {
          addUrl(`${ctx.origin}/${rel}`);
        }
        for (const rel of relativeNames) {
          addUrl(`/${rel}`);
        }
      }

      return urls;
    },

    async _fetchFromApiTreeNodes() {
      const ctx = this.getRuntimeContext();
      if (!ctx.isDevServer || typeof fetch !== 'function') {
        return null;
      }
      const apiUrls = [];
      if (ctx.baseDir) {
        try { apiUrls.push(new URL('api/tree', ctx.baseDir).href); } catch (e) {}
      }
      apiUrls.push('/api/tree');
      apiUrls.push('./api/tree');

      for (const apiUrl of Array.from(new Set(apiUrls))) {
        try {
          console.log(`[DbService] Requesting fallback catalog tree from: ${apiUrl}`);
          const res = await fetch(apiUrl, { cache: 'no-cache' });
          if (!res || !res.ok) continue;
          const data = await res.json();
          if (!data || !data.tree || typeof data.tree !== 'object') continue;
          const nodes = [];
          let nextId = 1;
          const years = Object.keys(data.tree).sort();
          for (const yearName of years) {
            const yearId = nextId++;
            nodes.push({ id: yearId, parent_id: null, name: yearName, is_folder: 1, file_path: '#' });
            const classesObj = data.tree[yearName] || {};
            for (const className of Object.keys(classesObj).sort()) {
              const classId = nextId++;
              nodes.push({ id: classId, parent_id: yearId, name: className, is_folder: 1, file_path: '#' });
              const examsObj = classesObj[className] || {};
              for (const examName of Object.keys(examsObj).sort()) {
                const examId = nextId++;
                nodes.push({ id: examId, parent_id: classId, name: examName, is_folder: 1, file_path: '#' });
                const docsList = Array.isArray(examsObj[examName]) ? examsObj[examName] : [];
                for (const doc of docsList) {
                  nodes.push({
                    id: nextId++,
                    parent_id: examId,
                    name: doc.paperName || doc.title || doc.filename || 'Document',
                    is_folder: 0,
                    file_path: (doc.url || '').replace(/^\/+/, '')
                  });
                }
              }
            }
          }
          if (nodes.length > 20) {
            return nodes;
          }
        } catch (e) {}
      }
      return null;
    },

    async _syncFromServerApiTree() {
      const nodes = await this._fetchFromApiTreeNodes();
      if (nodes && nodes.length > 20) {
        LocalNodeStore.saveNodes(nodes);
        return true;
      }
      return false;
    },

    async _hydrateSqliteFromApiTree() {
      if (!this.SQL) return false;
      const nodes = await this._fetchFromApiTreeNodes();
      if (!nodes || nodes.length <= 20) return false;
      try {
        const tempDb = new this.SQL.Database();
        tempDb.run(`
          CREATE TABLE IF NOT EXISTS nodes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            parent_id INTEGER DEFAULT NULL,
            name TEXT NOT NULL,
            is_folder INTEGER DEFAULT 1,
            file_path TEXT DEFAULT '#'
          );
        `);
        tempDb.run('BEGIN TRANSACTION;');
        const stmt = tempDb.prepare(
          'INSERT INTO nodes (id, parent_id, name, is_folder, file_path) VALUES (?, ?, ?, ?, ?)'
        );
        for (const n of nodes) {
          stmt.run([n.id, n.parent_id, n.name, n.is_folder, n.file_path]);
        }
        stmt.free();
        tempDb.run('COMMIT;');
        this.db = tempDb;
        if (await this.isValidDatabase()) {
          await this.saveToIndexedDB();
          console.log(`[SQLite] Hydrated SQLite database from /api/tree fallback (${nodes.length} nodes)`);
          return true;
        }
      } catch (e) {
        console.warn('[SQLite] Failed to hydrate SQLite from /api/tree:', e);
      }
      return false;
    },

    _isValidSqliteHeader(u8) {
      if (!u8 || u8.byteLength < 100) return false;
      // "SQLite format 3"
      return (
        u8[0] === 0x53 &&
        u8[1] === 0x51 &&
        u8[2] === 0x4c &&
        u8[3] === 0x69 &&
        u8[4] === 0x74 &&
        u8[5] === 0x65
      );
    },

    async _fetchBinaryBuffer(url) {
      if (window.OfflineEngine && typeof window.OfflineEngine.fetchBinaryWithDiagnostics === 'function') {
        return await window.OfflineEngine.fetchBinaryWithDiagnostics(url, { requireSqliteHeader: true });
      }

      const ctx = this.getRuntimeContext();
      console.log(`[DbService] Fetching database candidate URL: ${url} (context: ${ctx.isFileProtocol ? 'file-system' : 'dev-server'})`);

      if (!ctx.isFileProtocol && typeof fetch === 'function') {
        try {
          const response = await fetch(url, { cache: 'no-cache', credentials: 'same-origin' });
          if (response && response.ok) {
            const ct = (response.headers && response.headers.get('content-type')) || '';
            if (!ct.includes('text/html')) {
              const ab = await response.arrayBuffer();
              const u8 = new Uint8Array(ab);
              if (this._isValidSqliteHeader(u8)) return u8;
            }
          } else if (response) {
            console.warn(`[DbService] HTTP ${response.status} when requesting database URL: ${url}`);
          }
        } catch (e) {
          console.warn(`[DbService] fetch() failed for ${url}:`, e && e.message ? e.message : e);
        }
      }

      // XMLHttpRequest fallback (supports file:// in Electron/WebViews as well as http://)
      return await new Promise((resolve) => {
        try {
          const xhr = new XMLHttpRequest();
          xhr.open('GET', url, true);
          xhr.responseType = 'arraybuffer';
          xhr.onload = () => {
            if ((xhr.status === 200 || (xhr.status === 0 && xhr.response)) && xhr.response) {
              const u8 = new Uint8Array(xhr.response);
              if (this._isValidSqliteHeader(u8)) {
                resolve(u8);
                return;
              }
            } else {
              console.warn(`[DbService] XHR status ${xhr.status} at database path: ${url}`);
            }
            resolve(null);
          };
          xhr.onerror = () => {
            console.warn(`[DbService] XHR file/network error at path: ${url}`);
            resolve(null);
          };
          xhr.ontimeout = () => resolve(null);
          xhr.send(null);
        } catch (e) {
          resolve(null);
        }
      });
    },

    async _internalInit() {
      this.SQL = await getSharedSqlJsInstance();
      if (!this.SQL) {
        throw new Error('SqlJs engine is unavailable');
      }

      // 1. Coordinate with OfflineEngine preloaded/probed database binary (handles IPC + context URLs + CacheStorage)
      if (window.OfflineEngine && typeof window.OfflineEngine.loadDatabaseBinary === 'function') {
        try {
          const preloadedBytes = await window.OfflineEngine.loadDatabaseBinary();
          if (preloadedBytes && this._isValidSqliteHeader(preloadedBytes)) {
            this.db = new this.SQL.Database(preloadedBytes);
            if (await this.isValidDatabase()) {
              await this.saveToIndexedDB();
              console.log(`[SQLite] Initialized database via OfflineEngine (${preloadedBytes.byteLength} bytes)`);
              return true;
            }
          }
        } catch (oeErr) {
          console.warn('[SQLite] OfflineEngine database preload fallback:', oeErr);
        }
      }

      // 2. Electron Native IPC Direct Disk Read (Fastest & immune to file:// fetch restrictions)
      if (window.electronAPI && typeof window.electronAPI.readDatabaseFile === 'function') {
        try {
          const rawBytes = await window.electronAPI.readDatabaseFile();
          if (rawBytes) {
            const u8 = rawBytes instanceof Uint8Array ? rawBytes : new Uint8Array(rawBytes);
            if (this._isValidSqliteHeader(u8)) {
              this.db = new this.SQL.Database(u8);
              if (await this.isValidDatabase()) {
                await this.saveToIndexedDB();
                console.log('[SQLite] Loaded database directly via Electron IPC');
                return true;
              }
            }
          }
        } catch (ipcErr) {
          console.warn('[SQLite] Electron IPC database read skipped:', ipcErr);
        }
      }

      // 3. Fetch / XHR from context-aware candidate paths (dev server + production file://)
      const candidatePaths = this.buildDatabaseFetchUrls();
      console.log('[SQLite] Trying context-aware candidate database URLs:', candidatePaths);

      for (const candidate of candidatePaths) {
        try {
          const uInt8Array = await this._fetchBinaryBuffer(candidate);
          if (uInt8Array) {
            const tempDb = new this.SQL.Database(uInt8Array);
            this.db = tempDb;
            if (await this.isValidDatabase()) {
              await this.saveToIndexedDB();
              console.log(`[SQLite] Loaded database from: ${candidate}`);
              return true;
            }
          }
        } catch (fetchErr) {
          console.warn(`[SQLite] Candidate path failed (${candidate}):`, fetchErr);
        }
      }

      // 4. Offline IndexedDB Cache Fallback
      let savedDb = await this.loadFromIndexedDB();
      if (savedDb) {
        try {
          const u8 = savedDb instanceof Uint8Array ? savedDb : new Uint8Array(savedDb);
          this.db = new this.SQL.Database(u8);
          savedDb = null;

          if (await this.isValidDatabase()) {
            console.log('[SQLite] Valid DB loaded from IndexedDB cache');
            return true;
          } else {
            await this.clearIndexedDB();
            this.db = null;
          }
        } catch (dbErr) {
          this.db = null;
        }
      }

      // 5. Dev Server REST API (/api/tree) SQLite Hydration Fallback
      if (await this._hydrateSqliteFromApiTree()) {
        return true;
      }

      // 6. Fresh WASM Schema Fallback
      console.log('[SQLite] Populating default schema...');
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
        return countCheck.length > 0 && countCheck[0].count > 20;
      } catch (e) {
        return false;
      }
    },

    async query(sql, params = []) {
      if (!this.db && !this.isFallback && !this._isInternalInit) {
        await this.init();
      }
      if (this.isFallback || !this.db) return [];
      try {
        const stmt = this.db.prepare(sql);
        stmt.bind(params);
        const results = [];
        while (stmt.step()) {
          results.push(stmt.getAsObject());
        }
        stmt.free();
        return results;
      } catch (err) {
        console.error('[SQLite Query Error]:', err);
        return [];
      }
    },

    async saveToIndexedDB() {
      if (this.isFallback || !this.db) return;
      try {
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
      } catch (e) {}
    },

    async loadFromIndexedDB() {
      return new Promise(resolve => {
        try {
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
        } catch (e) {
          resolve(null);
        }
      });
    },

    async clearIndexedDB() {
      return new Promise(resolve => {
        try {
          const req = indexedDB.deleteDatabase('QuestionarySQLiteDB');
          req.onsuccess = () => resolve();
          req.onerror = () => resolve();
          req.onblocked = () => resolve();
        } catch (e) {
          resolve();
        }
      });
    },

    async getNodeIdByPath(pathArray) {
      if (!this.db && !this.isFallback && !this._isInternalInit) {
        await this.init();
      }
      if (this.isFallback || !this.db) return null;
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
      if (!this.db && !this.isFallback && !this._isInternalInit) {
        await this.init();
      }
      if (this.isFallback || !this.db) {
        return LocalNodeStore.getChildren(pathArray);
      }
      const cleanPath = Array.isArray(pathArray) ? pathArray : [];
      const parentId = await this.getNodeIdByPath(cleanPath);
      if (parentId === null && cleanPath.length > 0) {
        return [];
      }
      const res = await this.query(
        parentId === null
          ? "SELECT * FROM nodes WHERE parent_id IS NULL ORDER BY name ASC"
          : "SELECT * FROM nodes WHERE parent_id = ? ORDER BY name ASC",
        parentId === null ? [] : [parentId]
      );
      return Array.isArray(res) ? res : [];
    },

    _catalogCache: null,

    invalidateCatalogCache() {
      this._catalogCache = null;
    },

    async getAllNodesWithPaths() {
      if (!this.db && !this.isFallback && !this._isInternalInit) {
        await this.init();
      }
      if (this._catalogCache && this._catalogCache.length > 0) {
        return this._catalogCache;
      }
      if (this.isFallback || !this.db) {
        const list = LocalNodeStore.getAllNodesWithPaths().map(enrichDocumentNode);
        this._catalogCache = list;
        return list;
      }
      const rows = await this.query("SELECT id, parent_id, name, is_folder, file_path FROM nodes");
      const byId = new Map((rows || []).map(r => [r.id, r]));
      const list = (rows || []).map(item => {
        const pathArray = [];
        let cur = item;
        let guard = 0;
        while (cur && guard < 16) {
          pathArray.unshift(cur.name);
          cur = cur.parent_id !== null && cur.parent_id !== undefined ? byId.get(cur.parent_id) : null;
          guard++;
        }
        return enrichDocumentNode({
          id: item.id,
          name: item.name,
          path: pathArray,
          isFolder: item.is_folder === 1,
          url: item.file_path
        });
      });
      this._catalogCache = list;
      return list;
    },

    async getAllDocuments() {
      const all = await this.getAllNodesWithPaths();
      return all.filter(item => !item.isFolder && item.url && item.url !== '#');
    },

    async search(keyword) {
      const all = await this.getAllNodesWithPaths();
      return filterDocumentCatalogByQuery(all, keyword);
    },

    async buildPath(parentId) {
      const path = [];
      let currentId = parentId;
      while (currentId !== null) {
        const res = await this.query("SELECT parent_id, name FROM nodes WHERE id = ?", [currentId]);
        if (res.length === 0) break;
        path.unshift(res[0].name);
        currentId = res[0].parent_id;
      }
      return path;
    },

    async countDocuments() {
      if (!this.db && !this.isFallback && !this._isInternalInit) {
        await this.init();
      }
      if (this.isFallback || !this.db) {
        return LocalNodeStore.countDocuments();
      }
      const res = await this.query("SELECT COUNT(*) as count FROM nodes WHERE is_folder = 0 AND file_path != '#' AND file_path != ''");
      return res.length > 0 ? res[0].count : 0;
    }
  };
  window.DbService = DbService;

  // Global Reset Function for easy debugging / manual reset
  window.resetDatabase = async function() {
    if (confirm('Reset database cache? This will purge the cached DB and reload clean defaults.')) {
      await DbService.clearIndexedDB();
      localStorage.removeItem('questionary-local-nodes');
      location.reload();
    }
  };

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
    } catch (e) {
      console.error('Error saving favorites:', e);
    }
  }

  async function saveRecentToStorage(recent) {
    try {
      localStorage.setItem('questionary-recent', JSON.stringify(recent));
    } catch (e) {
      console.error('Error saving recent:', e);
    }
  }

  var timerState = window.timerState || {
    duration: 0,
    remaining: 0,
    interval: null,
    isRunning: false,
    isPaused: false,
    laps: [],
    lastLapTime: 0
  };

  function applyAccessibilitySettings() {
    document.body.classList.toggle('high-contrast', accessibilitySettings.highContrast);
    document.body.classList.toggle('large-text', accessibilitySettings.largeText);
    document.body.classList.toggle('reduced-motion', accessibilitySettings.reducedMotion);
    document.body.classList.toggle('enhanced-focus', accessibilitySettings.enhancedFocus);
  }

  function createRipple(event) {}

  const users = {
    "DPSNTRVMP": { password: "DPSNTRVMP@123", role: "user" },
    "ADMIN": { password: "DPSNTCLASSLOGIN@@", role: "admin" },
    "sayandps2014@gmail.com": { password: "DPSNTCLASSLOGIN@@", role: "admin" }
  };

  function showApp() {
    const loginScreen = document.getElementById('loginScreen');
    const app = document.getElementById('app');
    const loadingOverlay = document.getElementById('loadingOverlay');

    if (loginScreen) loginScreen.style.display = 'none';
    if (app) app.style.display = 'block';
    if (loadingOverlay) loadingOverlay.classList.remove('active');

    console.log('App displayed');
  }

  function showNotification(message, type = 'info') {
    const existing = document.querySelector('.notification-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = `notification-toast notification-${type}`;

    let icon = 'fa-info-circle';
    let bgColor = '#3b82f6';
    if (type === 'success') {
      icon = 'fa-check-circle';
      bgColor = '#22c55e';
    } else if (type === 'error') {
      icon = 'fa-exclamation-circle';
      bgColor = '#ef4444';
    } else if (type === 'warning') {
      icon = 'fa-exclamation-triangle';
      bgColor = '#f59e0b';
    }

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

    if (!document.getElementById('toast-animations')) {
      const style = document.createElement('style');
      style.id = 'toast-animations';
      style.textContent = `
      @keyframes slideUpToast {
        from { transform: translateX(-50%) translateY(100px); opacity: 0; }
        to { transform: translateX(-50%) translateY(0); opacity: 1; }
      }
      @keyframes slideDownToast {
        from { transform: translateX(-50%) translateY(0); opacity: 1; }
        to { transform: translateX(-50%) translateY(100px); opacity: 0; }
      }
      `;
      document.head.appendChild(style);
    }

    document.body.appendChild(toast);

    setTimeout(() => {
      toast.style.animation = 'slideDownToast 0.3s ease forwards';
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  // ============================================
  // STYLED DIALOG SYSTEM
  // ============================================
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
      overlay.querySelector('.dialog-btn-confirm').onclick = () => {
        const v = input.value.trim();
        close(v || null);
      };
      input.addEventListener('keydown', e => {
        if (e.key === 'Enter') { const v = input.value.trim(); close(v || null); }
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

  async function initializeAppAfterLogin() {
    const usernameDisplay = document.getElementById('username-display');
    if (usernameDisplay && currentUser) {
      usernameDisplay.textContent = currentUser.username;
    }

    const adminBadge = document.getElementById('adminBadge');
    if (adminBadge && currentUser && currentUser.role === 'admin') {
      adminBadge.style.display = 'inline-block';
    }

    initSettingsDropdown();

    if (typeof initializeNewFeatures === 'function') {
      initializeNewFeatures();
    }

    const nodes = await DbService.getChildren(path);
    renderTilesFromDb(nodes);
    updateBreadcrumb();
    await updateDashboardStats();
    if (typeof initPdfTagFilterSystem === 'function') {
      initPdfTagFilterSystem().catch(() => {});
    }
  }

  function showAutoLoginNotification(username) {
    showNotification(`Welcome back, ${username}!`, 'success');
  }

  // ================================================================
  // DOCUMENT METADATA EXTRACTION, SEARCH SORTING & PDF TAG FILTERING
  // ================================================================
  const DOC_SUBJECT_PATTERNS = [
    ['English Language', /english[_\s-]*language|eng[_\s-]*lang/i],
    ['English Literature', /english[_\s-]*literature|eng[_\s-]*lit|literature/i],
    ['Computer Applications', /computer[_\s-]*app|computer|\bca\b|_ca_/i],
    ['Commercial Studies', /commercial[_\s-]*studies|comm[_\s-]*std|commerce/i],
    ['Environmental Applications', /environmental[_\s-]*app|10eva|\beva\b|_eva_/i],
    ['Environmental Science', /environmental[_\s-]*sci|\bevs\b|_evs_/i],
    ['History & Civics', /history/i],
    ['Physical Education', /physical[_\s-]*ed|\bpe\b|_pe_/i],
    ['Home Science', /home[_\s-]*sci/i],
    ['Robotics & AI', /robotics/i],
    ['Mathematics', /mathematics|\bmaths?\b|_math/i],
    ['Bengali', /bengali/i],
    ['Hindi', /hindi/i],
    ['French', /french/i],
    ['German', /german/i],
    ['Physics', /physics|current electricity|magnetism|sound waves/i],
    ['Chemistry', /chemistry/i],
    ['Biology', /biology/i],
    ['Economics', /economics|eco[_\s-]*app/i],
    ['Geography', /geop?graphy/i],
    ['Science', /\bscience\b/i]
  ];

  const EXAM_TERM_ORDER = {
    'Pre-Board': 1,
    'Final Term': 2,
    'Half Yearly': 3,
    'Mid Term 2': 4,
    'Mid Term 1': 5,
    'Notes & Reference': 6
  };

  const EXAM_TERM_DISPLAY = {
    'Pre-Board': 'Pre-Board',
    'Final Term': 'Final / Full Term',
    'Half Yearly': 'Half Yearly',
    'Mid Term 1': 'Mid Term 1',
    'Mid Term 2': 'Mid Term 2',
    'Notes & Reference': 'Notes & Reference'
  };

  const EXAM_TERM_MONTH = {
    'Mid Term 1': 4,
    'Half Yearly': 7,
    'Mid Term 2': 10,
    'Pre-Board': 12,
    'Final Term': 13,
    'Notes & Reference': 6
  };

  function normalizeSearchAliases(raw) {
    return String(raw || '')
      .toLowerCase()
      .replace(/\bpre[\s-]*boards?\b/g, 'pre-board')
      .replace(/\bfull[\s-]*term\b/g, 'final term')
      .replace(/\bfinal[\s-]*term\b/g, 'final term')
      .replace(/\bhalf[\s-]*yearly\b/g, 'half yearly')
      .replace(/\bmid[\s-]*term[\s-]*1\b/g, 'mid term 1')
      .replace(/\bmid[\s-]*term[\s-]*2\b/g, 'mid term 2')
      .replace(/\bmaths\b/g, 'mathematics')
      .replace(/\bmath\b/g, 'mathematics')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function enrichDocumentNode(rawItem) {
    if (!rawItem) return rawItem;
    const pathArr = Array.isArray(rawItem.path) ? rawItem.path : [];
    const fp = String(rawItem.url || '');
    const name = String(rawItem.name || '');
    const combined = `${name} ${fp} ${pathArr.join(' ')}`;

    let subject = '';
    if (!rawItem.isFolder) {
      for (const [label, rx] of DOC_SUBJECT_PATTERNS) {
        if (rx.test(`${name} ${fp}`)) {
          subject = label;
          break;
        }
      }
      if (!subject) {
        for (const [label, rx] of DOC_SUBJECT_PATTERNS) {
          if (rx.test(combined)) {
            subject = label;
            break;
          }
        }
      }
    }

    const yearMatch = pathArr.find(s => /^20\d{2}-\d{2}$/.test(s)) || (fp.match(/20\d{2}-\d{2}/) || [null])[0];
    const academicYear = yearMatch || (pathArr[0] === 'Study Material' ? 'Study Material' : '');
    const yearStart = yearMatch ? parseInt(yearMatch.slice(0, 4), 10) : 0;

    const classSeg = pathArr.find(s => /^Class\s+\d+$/i.test(s));
    const classFromFp = !classSeg ? fp.match(/CL[_\s]*(\d+)/i) : null;
    const classLevel = classSeg || (classFromFp ? `Class ${classFromFp[1]}` : '');

    let examTerm = '';
    for (const seg of pathArr) {
      if (Object.prototype.hasOwnProperty.call(EXAM_TERM_ORDER, seg)) {
        examTerm = seg;
        break;
      }
    }
    if (!examTerm && !rawItem.isFolder) {
      if (/pre[\s_-]*board|_pb_/i.test(combined)) examTerm = 'Pre-Board';
      else if (/_ft_|final[\s_-]*term|full[\s_-]*term/i.test(combined)) examTerm = 'Final Term';
      else if (/_hy_|half[\s_-]*yearly/i.test(combined)) examTerm = 'Half Yearly';
      else if (/mt[_\s]*1|mid[\s_-]*term[\s_-]*1/i.test(combined)) examTerm = 'Mid Term 1';
      else if (/mt[_\s]*2|mid[\s_-]*term[\s_-]*2/i.test(combined)) examTerm = 'Mid Term 2';
      else if (pathArr[0] === 'Study Material') examTerm = 'Notes & Reference';
    }

    const monthRank = EXAM_TERM_MONTH[examTerm] || 1;
    const sortDate = yearStart > 0 ? (yearStart * 100 + monthRank) : (pathArr[0] === 'Study Material' ? 199900 : 0);

    let displayName = name;
    if (!rawItem.isFolder && subject) {
      if (/^(I|II|III)$/i.test(name.trim())) {
        displayName = `${subject} — Paper ${name.trim().toUpperCase()}`;
      } else if (/^(20\d{2}|SET\s*[A-Z]|CLASS.*HY)$/i.test(name.trim())) {
        displayName = `${subject} (${name.trim()})`;
      }
    }

    let category = rawItem.isFolder ? 'Folder' : 'PDF Document';
    if (pathArr[0] === 'Study Material') category = 'Study Material';

    return {
      ...rawItem,
      displayName,
      subject,
      examTerm,
      classLevel,
      academicYear,
      yearStart,
      sortDate,
      category,
      docItemId: rawItem.isFolder ? `folder_${pathArr.join('/')}` : `doc_${pathArr.join('/')}`
    };
  }

  function getUserItemTagsMap() {
    try {
      return window.itemTags || JSON.parse(localStorage.getItem('questionary-item-tags') || '{}');
    } catch (e) {
      return {};
    }
  }

  function getUserTagsList() {
    try {
      return window.tags || JSON.parse(localStorage.getItem('questionary-tags') || '[]');
    } catch (e) {
      return [];
    }
  }

  function computeRelevanceScore(item, normalizedQuery, tokens) {
    const title = normalizeSearchAliases(item.displayName || item.name || '');
    const rawName = normalizeSearchAliases(item.name || '');
    const subject = normalizeSearchAliases(item.subject || '');
    const exam = normalizeSearchAliases(item.examTerm || '');
    const pathText = normalizeSearchAliases((item.path || []).join(' '));
    const extraText = normalizeSearchAliases(item._extraSearchText || '');

    let score = 0;
    if (title === normalizedQuery || rawName === normalizedQuery || subject === normalizedQuery) score += 140;
    else if (title.startsWith(normalizedQuery) || subject.startsWith(normalizedQuery)) score += 95;
    else if (title.includes(normalizedQuery)) score += 65;

    tokens.forEach(tok => {
      if (!tok) return;
      if (title === tok || subject === tok) score += 45;
      else if (title.includes(tok) || subject.includes(tok)) score += 28;
      if (exam.includes(tok)) score += 22;
      if (pathText.includes(tok)) score += 12;
      if (extraText && extraText.includes(tok)) score += 10;
    });

    if (!item.isFolder && tokens.length > 1) score += 10;
    if (item.yearStart) score += Math.max(0, item.yearStart - 2019);
    return score;
  }

  function filterDocumentCatalogByQuery(catalog, keyword) {
    const normQuery = normalizeSearchAliases(keyword);
    if (!normQuery) return [];
    const tokens = normQuery.split(' ').filter(Boolean);
    const itemTagsMap = getUserItemTagsMap();
    const userTagsById = new Map(getUserTagsList().map(t => [String(t.id), t.name || '']));

    const matched = [];
    for (const raw of catalog) {
      const item = raw.displayName ? raw : enrichDocumentNode(raw);
      const assignedTagIds = itemTagsMap[item.docItemId] || [];
      const customTagNames = assignedTagIds.map(tid => userTagsById.get(String(tid)) || '').filter(Boolean);

      const haystack = normalizeSearchAliases([
        item.name,
        item.displayName,
        item.subject,
        item.examTerm,
        item.examTerm === 'Final Term' ? 'full term' : '',
        item.classLevel,
        item.academicYear,
        (item.path || []).join(' '),
        item.url || '',
        customTagNames.join(' ')
      ].join(' '));

      const allMatch = tokens.every(tok => haystack.includes(tok));
      if (allMatch) {
        matched.push({
          ...item,
          customTagNames,
          relevance: computeRelevanceScore(item, normQuery, tokens)
        });
      }
    }
    return matched;
  }

  let _lastSearchResults = [];
  let _lastSearchQuery = '';
  let _currentSearchSort = localStorage.getItem('questionary-search-sort') || 'relevance';

  function getSearchCategoryRank(cat) {
    const order = {
      'PDF Document': 1,
      'Study Material': 2,
      'Folder': 3,
      'Note': 4,
      'Flashcard': 5,
      'Study Planner': 6
    };
    return order[cat] || 99;
  }

  function sortSearchFindings(list, sortMode) {
    const arr = [...list];
    switch (sortMode) {
      case 'date-desc':
        return arr.sort((a, b) => (b.sortDate || 0) - (a.sortDate || 0) || (b.relevance || 0) - (a.relevance || 0) || (a.displayName || a.name).localeCompare(b.displayName || b.name));
      case 'date-asc':
        return arr.sort((a, b) => {
          const da = a.sortDate || Number.MAX_SAFE_INTEGER;
          const db = b.sortDate || Number.MAX_SAFE_INTEGER;
          return da - db || (b.relevance || 0) - (a.relevance || 0);
        });
      case 'category':
        return arr.sort((a, b) => {
          const catDiff = getSearchCategoryRank(a.category) - getSearchCategoryRank(b.category);
          if (catDiff !== 0) return catDiff;
          return (b.relevance || 0) - (a.relevance || 0) || (a.displayName || a.name).localeCompare(b.displayName || b.name);
        });
      case 'name-asc':
        return arr.sort((a, b) => (a.displayName || a.name).localeCompare(b.displayName || b.name));
      case 'relevance':
      default:
        return arr.sort((a, b) => (b.relevance || 0) - (a.relevance || 0) || (b.sortDate || 0) - (a.sortDate || 0) || (a.displayName || a.name).localeCompare(b.displayName || b.name));
    }
  }

  function renderSearchResults() {
    const searchResults = document.getElementById('searchResults');
    const resultsContainer = document.getElementById('searchResultsContainer');
    const countEl = document.getElementById('searchResultsCount');
    const sortSelect = document.getElementById('searchResultsSort');
    if (!searchResults || !resultsContainer) return;

    if (sortSelect && sortSelect.value !== _currentSearchSort) {
      sortSelect.value = _currentSearchSort;
    }

    const total = _lastSearchResults.length;
    if (countEl) {
      countEl.textContent = `${total} ${total === 1 ? 'result' : 'results'}`;
    }

    if (total === 0) {
      resultsContainer.innerHTML = '<div style="padding: 1.25rem; text-align: center; color: var(--fg3); font-size: 0.84rem;">No results found for your search.</div>';
      searchResults.style.display = 'block';
      return;
    }

    const sorted = sortSearchFindings(_lastSearchResults, _currentSearchSort);
    const sliced = sorted.slice(0, 40);
    let lastCategory = null;

    resultsContainer.innerHTML = sliced.map((r, idx) => {
      let icon = r.isFolder ? 'fa-folder' : 'fa-file-pdf';
      if (r.isNote) icon = 'fa-sticky-note';
      if (r.isFlashcard) icon = 'fa-layer-group';
      if (r.isSession) icon = 'fa-calendar-alt';

      let groupHeader = '';
      if (_currentSearchSort === 'category' && r.category !== lastCategory) {
        lastCategory = r.category;
        groupHeader = `<div class="search-results-group-label">${escapeHtml(r.category)}</div>`;
      }

      const badges = [];
      if (r.examTerm) badges.push(`<span class="search-result-badge">${escapeHtml(EXAM_TERM_DISPLAY[r.examTerm] || r.examTerm)}</span>`);
      if (r.academicYear && r.academicYear !== 'Study Material') badges.push(`<span class="search-result-badge">${escapeHtml(r.academicYear)}</span>`);
      else if (r.dateLabel) badges.push(`<span class="search-result-badge">${escapeHtml(r.dateLabel)}</span>`);
      badges.push(`<span class="search-result-badge category">${escapeHtml(r.category || 'Document')}</span>`);

      return `
        ${groupHeader}
        <div class="search-result-item" data-result-index="${idx}">
          <i class="fas ${icon}"></i>
          <div class="search-result-info">
            <span class="search-result-name">${escapeHtml(r.displayName || r.name)}</span>
            <span class="search-result-path">${escapeHtml((r.path || []).join(' › '))}</span>
          </div>
          <div class="search-result-badges">${badges.join('')}</div>
        </div>
      `;
    }).join('');

    resultsContainer.querySelectorAll('.search-result-item').forEach((el) => {
      el.addEventListener('click', () => {
        clearTimeout(_searchHistoryTimer);
        if (_lastSearchQuery.length >= 2 && typeof addToSearchHistory === 'function') addToSearchHistory(_lastSearchQuery);
        const r = sliced[Number(el.dataset.resultIndex)];
        if (!r) return;
        if (r.isNote) navigateToNote(r.noteId);
        else if (r.isFlashcard) navigateToFlashcard(r.deckId);
        else if (r.isSession) navigateToSession(r.sessionId);
        else navigateToSearchResult(r.path, r.url || '');
      });
    });

    searchResults.style.display = 'block';
  }

  async function performSearch(e) {
    const rawVal = typeof e === 'string'
      ? e
      : (e?.target?.value ?? document.getElementById('globalSearch')?.value ?? '');
    const query = String(rawVal).trim();
    const searchResults = document.getElementById('searchResults');
    const historyDropdown = document.getElementById('searchHistoryDropdown');

    if (query.length > 0 && historyDropdown) {
      historyDropdown.classList.remove('active');
    }

    if (!query || query.length < 2) {
      clearTimeout(_searchHistoryTimer);
      _lastSearchResults = [];
      _lastSearchQuery = '';
      if (searchResults) searchResults.style.display = 'none';
      return;
    }

    clearTimeout(_searchHistoryTimer);
    if (typeof e === 'string') {
      if (typeof addToSearchHistory === 'function') addToSearchHistory(query);
    } else {
      _searchHistoryTimer = setTimeout(() => {
        const currentVal = document.getElementById('globalSearch')?.value.trim() || '';
        if (currentVal.length >= 2 && typeof addToSearchHistory === 'function') {
          addToSearchHistory(currentVal);
        }
      }, 800);
    }

    const normQuery = normalizeSearchAliases(query);
    const tokens = normQuery.split(' ').filter(Boolean);
    const results = [];

    const sqlResults = await DbService.search(query);
    results.push(...sqlResults);

    const activeNotes = (window.EnhancedNotes && typeof window.EnhancedNotes.getNotes === 'function')
      ? window.EnhancedNotes.getNotes()
      : notes;
    if (activeNotes && activeNotes.length > 0) {
      activeNotes.forEach(note => {
        const hay = normalizeSearchAliases(`${note.title || ''} ${note.category || ''} ${note.content || ''}`);
        if (tokens.every(t => hay.includes(t))) {
          const ts = Number(note.updatedAt) || Date.now();
          const d = new Date(ts);
          const item = {
            name: note.title,
            displayName: note.title,
            path: ['Notes', note.category || 'General'],
            isFolder: false,
            isNote: true,
            noteId: note.id,
            url: null,
            category: 'Note',
            sortDate: d.getFullYear() * 100 + (d.getMonth() + 1),
            dateLabel: d.toLocaleDateString(),
            _extraSearchText: note.content || ''
          };
          item.relevance = computeRelevanceScore(item, normQuery, tokens);
          results.push(item);
        }
      });
    }

    const activeDecks = (window.EnhancedFlashcards && typeof window.EnhancedFlashcards.getDecks === 'function')
      ? window.EnhancedFlashcards.getDecks()
      : flashcardDecks;
    if (activeDecks && activeDecks.length > 0) {
      activeDecks.forEach(deck => {
        const cardText = (deck.cards || []).map(c => `${c.front || ''} ${c.back || ''}`).join(' ');
        const hay = normalizeSearchAliases(`${deck.name || ''} ${deck.subject || ''} ${cardText}`);
        if (tokens.every(t => hay.includes(t))) {
          const titleMatches = tokens.every(t => normalizeSearchAliases(`${deck.name || ''} ${deck.subject || ''}`).includes(t));
          const ts = Number(deck.lastStudied || deck.createdAt) || Date.now();
          const d = new Date(ts);
          const item = {
            name: titleMatches ? deck.name : `${deck.name} (card match)`,
            displayName: titleMatches ? deck.name : `${deck.name} (card match)`,
            path: ['Flashcards', deck.subject || 'General'],
            isFolder: false,
            isFlashcard: true,
            deckId: deck.id,
            url: null,
            category: 'Flashcard',
            sortDate: d.getFullYear() * 100 + (d.getMonth() + 1),
            dateLabel: `${(deck.cards || []).length} cards`,
            _extraSearchText: cardText
          };
          item.relevance = computeRelevanceScore(item, normQuery, tokens);
          results.push(item);
        }
      });
    }

    if (studySessions && studySessions.length > 0) {
      studySessions.forEach(session => {
        const hay = normalizeSearchAliases(`${session.subject || ''} ${session.date || ''}`);
        if (tokens.every(t => hay.includes(t))) {
          const parsedDate = session.date ? new Date(session.date) : new Date();
          const item = {
            name: session.subject,
            displayName: session.subject,
            path: ['Study Planner', session.date || ''],
            isFolder: false,
            isSession: true,
            sessionId: session.id,
            url: null,
            category: 'Study Planner',
            sortDate: parsedDate.getFullYear() * 100 + (parsedDate.getMonth() + 1),
            dateLabel: session.date || ''
          };
          item.relevance = computeRelevanceScore(item, normQuery, tokens);
          results.push(item);
        }
      });
    }

    _lastSearchResults = results;
    _lastSearchQuery = query;
    renderSearchResults();
  }

  // ================================================================
  // COMBINABLE MULTI-TAG PDF FILTERING & SORTING SYSTEM
  // (e.g. Subject: Bengali + Exam Term: Pre-Board / Final Term)
  // ================================================================
  const PDF_RECENT_TAGS_KEY = 'questionary-pdf-recent-tags';
  const PDF_TAG_GROUP_SHORT_LABEL = {
    term: 'Exam',
    subject: 'Subject',
    classLevel: 'Class',
    year: 'Year',
    custom: 'Tag'
  };
  const PDF_TAG_SEARCH_SYNONYMS = {
    'Pre-Board': 'pb preboard pre board',
    'Final Term': 'ft full term final term annual',
    'Half Yearly': 'hy half yearly',
    'Mid Term 1': 'mt1 mt 1 mid term 1',
    'Mid Term 2': 'mt2 mt 2 mid term 2',
    'Notes & Reference': 'notes reference study material',
    'Environmental Applications': 'eva env app',
    'Environmental Science': 'evs env sci',
    'Computer Applications': 'ca comp computer cs',
    'Commercial Studies': 'comm commerce cs',
    'Physical Education': 'pe ped sports',
    'English Language': 'eng lang grammar',
    'English Literature': 'eng lit literature',
    'History & Civics': 'hist civics sst',
    'Home Science': 'home sci',
    'Mathematics': 'math maths',
    'Physics': 'phy',
    'Chemistry': 'chem',
    'Biology': 'bio',
    'Economics': 'eco econ',
    'Geography': 'geo',
    'Robotics & AI': 'ai robotics'
  };

  function loadRecentPdfTags() {
    try {
      const raw = JSON.parse(localStorage.getItem(PDF_RECENT_TAGS_KEY) || '[]');
      if (!Array.isArray(raw)) return [];
      return raw.filter(item => item && typeof item.group === 'string' && typeof item.value === 'string');
    } catch (e) {
      return [];
    }
  }

  function saveRecentPdfTags(list) {
    try {
      localStorage.setItem(PDF_RECENT_TAGS_KEY, JSON.stringify(list.slice(0, 16)));
    } catch (e) {}
  }

  function recordRecentPdfTag(group, value) {
    if (!group || !value) return;
    const list = loadRecentPdfTags();
    const existing = list.find(item => item.group === group && item.value === value);
    if (existing) {
      existing.count = (Number(existing.count) || 1) + 1;
      existing.lastUsed = Date.now();
    } else {
      list.unshift({ group, value, count: 1, lastUsed: Date.now() });
    }
    list.sort((a, b) => {
      const scoreA = (Number(a.lastUsed) || 0) + (Number(a.count) || 1) * 3600000 * 6;
      const scoreB = (Number(b.lastUsed) || 0) + (Number(b.count) || 1) * 3600000 * 6;
      return scoreB - scoreA;
    });
    saveRecentPdfTags(list);
  }

  function clearRecentPdfTags() {
    try {
      localStorage.removeItem(PDF_RECENT_TAGS_KEY);
    } catch (e) {}
    renderPdfTagFilterUI();
  }

  function highlightTagText(displayLabel, rawQuery) {
    const safeLabel = escapeHtml(displayLabel);
    const q = String(rawQuery || '').trim();
    if (!q) return safeLabel;
    const escapedQuery = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    try {
      const rx = new RegExp(`(${escapedQuery})`, 'ig');
      return safeLabel.replace(rx, '<mark class="pdf-tag-highlight">$1</mark>');
    } catch (e) {
      return safeLabel;
    }
  }

  function togglePdfTagSelection(group, val) {
    if (!group || !pdfTagFilterState[group]) return;
    if (pdfTagFilterState[group].has(val)) {
      pdfTagFilterState[group].delete(val);
    } else {
      pdfTagFilterState[group].add(val);
      recordRecentPdfTag(group, val);
    }
    applyPdfTagFilters();
  }

  const pdfTagFilterState = {
    subject: new Set(),
    term: new Set(),
    classLevel: new Set(),
    year: new Set(),
    custom: new Set(),
    sortBy: localStorage.getItem('questionary-pdf-tag-sort') || 'date-desc',
    tagSearch: '',
    initialized: false,
    allDocs: []
  };

  function hasActivePdfTagFilters() {
    return (
      pdfTagFilterState.subject.size > 0 ||
      pdfTagFilterState.term.size > 0 ||
      pdfTagFilterState.classLevel.size > 0 ||
      pdfTagFilterState.year.size > 0 ||
      pdfTagFilterState.custom.size > 0
    );
  }

  function getActivePdfTagCount() {
    return (
      pdfTagFilterState.subject.size +
      pdfTagFilterState.term.size +
      pdfTagFilterState.classLevel.size +
      pdfTagFilterState.year.size +
      pdfTagFilterState.custom.size
    );
  }

  function docMatchesTagFilters(doc, ignoreGroup = null) {
    if (ignoreGroup !== 'subject' && pdfTagFilterState.subject.size > 0) {
      if (!doc.subject || !pdfTagFilterState.subject.has(doc.subject)) return false;
    }
    if (ignoreGroup !== 'term' && pdfTagFilterState.term.size > 0) {
      if (!doc.examTerm || !pdfTagFilterState.term.has(doc.examTerm)) return false;
    }
    if (ignoreGroup !== 'classLevel' && pdfTagFilterState.classLevel.size > 0) {
      if (!doc.classLevel || !pdfTagFilterState.classLevel.has(doc.classLevel)) return false;
    }
    if (ignoreGroup !== 'year' && pdfTagFilterState.year.size > 0) {
      if (!doc.academicYear || !pdfTagFilterState.year.has(doc.academicYear)) return false;
    }
    if (ignoreGroup !== 'custom' && pdfTagFilterState.custom.size > 0) {
      const itemTagsMap = getUserItemTagsMap();
      const docTagIds = (itemTagsMap[doc.docItemId] || []).map(String);
      let anyMatch = false;
      for (const tid of pdfTagFilterState.custom) {
        if (docTagIds.includes(String(tid))) { anyMatch = true; break; }
      }
      if (!anyMatch) return false;
    }
    return true;
  }

  function sortFilteredPdfDocs(docs, sortBy) {
    const arr = [...docs];
    switch (sortBy) {
      case 'date-asc':
        return arr.sort((a, b) => (a.sortDate || 0) - (b.sortDate || 0) || (a.subject || '').localeCompare(b.subject || ''));
      case 'subject':
        return arr.sort((a, b) => (a.subject || 'zzz').localeCompare(b.subject || 'zzz') || (b.sortDate || 0) - (a.sortDate || 0));
      case 'term':
        return arr.sort((a, b) => (EXAM_TERM_ORDER[a.examTerm] || 99) - (EXAM_TERM_ORDER[b.examTerm] || 99) || (b.sortDate || 0) - (a.sortDate || 0));
      case 'name-asc':
        return arr.sort((a, b) => (a.displayName || a.name).localeCompare(b.displayName || b.name));
      case 'date-desc':
      default:
        return arr.sort((a, b) => (b.sortDate || 0) - (a.sortDate || 0) || (a.subject || '').localeCompare(b.subject || ''));
    }
  }

  function renderPdfTagFilterUI() {
    const groupsEl = document.getElementById('pdfTagGroupsContainer');
    const recentSection = document.getElementById('pdfTagRecentSection');
    const recentRow = document.getElementById('pdfTagRecentRow');
    const clearRecentBtn = document.getElementById('pdfTagClearRecentBtn');
    const searchClearBtn = document.getElementById('pdfTagSearchClearBtn');
    const searchCountEl = document.getElementById('pdfTagSearchCount');
    const clearBtn = document.getElementById('pdfTagClearAllBtn');
    const badgeEl = document.getElementById('pdfTagFilterBadge');
    const toggleBtn = document.getElementById('pdfTagFilterToggleBtn');
    const activeBar = document.getElementById('pdfTagActiveBar');
    const activePills = document.getElementById('pdfTagActivePills');
    const matchCountEl = document.getElementById('pdfTagMatchCount');
    const sortSelect = document.getElementById('pdfTagSortSelect');
    if (!groupsEl) return;

    const docs = pdfTagFilterState.allDocs || [];
    const activeCount = getActivePdfTagCount();
    const rawSearch = String(pdfTagFilterState.tagSearch || '').trim();
    const searchFilter = normalizeSearchAliases(rawSearch);

    if (searchClearBtn) searchClearBtn.style.display = rawSearch.length > 0 ? 'inline-flex' : 'none';
    if (clearBtn) clearBtn.style.display = activeCount > 0 ? 'inline-flex' : 'none';
    if (badgeEl) {
      badgeEl.textContent = String(activeCount);
      badgeEl.style.display = activeCount > 0 ? 'inline-flex' : 'none';
    }
    if (toggleBtn) toggleBtn.classList.toggle('active', activeCount > 0 || !document.getElementById('pdfTagFilterPanel')?.classList.contains('collapsed'));
    if (sortSelect && sortSelect.value !== pdfTagFilterState.sortBy) {
      sortSelect.value = pdfTagFilterState.sortBy;
    }

    // Build distinct tag lists from actual PDF library
    const termSet = new Set();
    const subjectSet = new Set();
    const classSet = new Set();
    const yearSet = new Set();
    docs.forEach(d => {
      if (d.examTerm) termSet.add(d.examTerm);
      if (d.subject) subjectSet.add(d.subject);
      if (d.classLevel) classSet.add(d.classLevel);
      if (d.academicYear) yearSet.add(d.academicYear);
    });

    const termList = Array.from(termSet).sort((a, b) => (EXAM_TERM_ORDER[a] || 99) - (EXAM_TERM_ORDER[b] || 99));
    const subjectList = Array.from(subjectSet).sort((a, b) => a.localeCompare(b));
    const classList = Array.from(classSet).sort((a, b) => {
      const na = parseInt(a.replace(/\D+/g, ''), 10) || 0;
      const nb = parseInt(b.replace(/\D+/g, ''), 10) || 0;
      return na - nb;
    });
    const yearList = Array.from(yearSet).sort((a, b) => {
      if (a === 'Study Material') return 1;
      if (b === 'Study Material') return -1;
      return b.localeCompare(a);
    });

    const userTags = getUserTagsList();
    const itemTagsMap = getUserItemTagsMap();

    const groups = [
      {
        key: 'term',
        label: 'Exam / Term',
        items: termList.map(val => {
          const display = EXAM_TERM_DISPLAY[val] || val;
          const count = docs.filter(d => d.examTerm === val && docMatchesTagFilters(d, 'term')).length;
          const extra = PDF_TAG_SEARCH_SYNONYMS[val] || '';
          return { val, display, count, searchText: normalizeSearchAliases(`${val} ${display} ${extra} exam term`) };
        })
      },
      {
        key: 'subject',
        label: 'Subject',
        items: subjectList.map(val => {
          const count = docs.filter(d => d.subject === val && docMatchesTagFilters(d, 'subject')).length;
          const extra = PDF_TAG_SEARCH_SYNONYMS[val] || '';
          return { val, display: val, count, searchText: normalizeSearchAliases(`${val} ${extra} subject`) };
        })
      },
      {
        key: 'classLevel',
        label: 'Class',
        items: classList.map(val => {
          const count = docs.filter(d => d.classLevel === val && docMatchesTagFilters(d, 'classLevel')).length;
          return { val, display: val, count, searchText: normalizeSearchAliases(`${val} class`) };
        })
      },
      {
        key: 'year',
        label: 'Year',
        items: yearList.map(val => {
          const count = docs.filter(d => d.academicYear === val && docMatchesTagFilters(d, 'year')).length;
          return { val, display: val, count, searchText: normalizeSearchAliases(`${val} year`) };
        })
      }
    ];

    if (userTags.length > 0) {
      const customItems = userTags.map(t => {
        const tid = String(t.id);
        const count = docs.filter(d => {
          const ids = (itemTagsMap[d.docItemId] || []).map(String);
          return ids.includes(tid) && docMatchesTagFilters(d, 'custom');
        }).length;
        return { val: tid, display: t.name, count, searchText: normalizeSearchAliases(`${t.name} custom tag`) };
      });
      groups.push({ key: 'custom', label: 'My Tags', items: customItems });
    }

    // Build lookup map of all valid tags for Recently Used resolution
    const tagLookup = new Map();
    groups.forEach(g => {
      g.items.forEach(it => {
        tagLookup.set(`${g.key}::${it.val}`, { ...it, group: g.key });
      });
    });

    // Render Recently Used section at the top of the tag filter panel
    if (recentSection && recentRow) {
      const storedRecent = loadRecentPdfTags();
      const resolvedRecent = storedRecent
        .map(entry => {
          const info = tagLookup.get(`${entry.group}::${entry.value}`);
          if (!info) return null;
          return { ...info, usageCount: Number(entry.count) || 1 };
        })
        .filter(Boolean)
        .slice(0, 8);

      const visibleRecent = searchFilter
        ? resolvedRecent.filter(it => it.searchText.includes(searchFilter) || pdfTagFilterState[it.group].has(it.val))
        : resolvedRecent;

      if (clearRecentBtn) {
        clearRecentBtn.style.display = resolvedRecent.length > 0 ? 'inline-block' : 'none';
      }

      if (searchFilter && visibleRecent.length === 0) {
        recentSection.style.display = 'none';
      } else {
        recentSection.style.display = 'flex';
        if (visibleRecent.length === 0) {
          recentRow.innerHTML = '<p class="pdf-tag-recent-empty">Select any subject or exam tag below — your frequently used tags will appear here for quick access.</p>';
        } else {
          recentRow.innerHTML = visibleRecent.map(it => {
            const isSelected = pdfTagFilterState[it.group].has(it.val);
            const isDimmed = !isSelected && it.count === 0;
            const kind = PDF_TAG_GROUP_SHORT_LABEL[it.group] || '';
            return `
              <button type="button" class="pdf-tag-chip ${isSelected ? 'selected' : ''} ${isDimmed ? 'dimmed' : ''}"
                      data-tag-group="${escapeHtml(it.group)}" data-tag-value="${escapeHtml(it.val)}"
                      title="Used ${it.usageCount} ${it.usageCount === 1 ? 'time' : 'times'}">
                <span class="pdf-tag-chip-kind">${escapeHtml(kind)}</span>
                <span>${highlightTagText(it.display, rawSearch)}</span>
                <span class="chip-count">${it.count}</span>
              </button>
            `;
          }).join('');

          recentRow.querySelectorAll('.pdf-tag-chip').forEach(btn => {
            btn.addEventListener('click', () => {
              togglePdfTagSelection(btn.dataset.tagGroup, btn.dataset.tagValue);
            });
          });
        }
      }
    }

    // Filter and render all tag groups
    let matchedTagCount = 0;
    groupsEl.innerHTML = groups.map(group => {
      const visibleItems = searchFilter
        ? group.items.filter(it => it.searchText.includes(searchFilter))
        : group.items;
      if (visibleItems.length === 0) return '';
      matchedTagCount += visibleItems.length;

      return `
        <div class="pdf-tag-group">
          <span class="pdf-tag-group-label">${escapeHtml(group.label)}</span>
          <div class="pdf-tag-chips-row">
            ${visibleItems.map(it => {
              const isSelected = pdfTagFilterState[group.key].has(it.val);
              const isDimmed = !isSelected && it.count === 0;
              return `
                <button type="button" class="pdf-tag-chip ${isSelected ? 'selected' : ''} ${isDimmed ? 'dimmed' : ''}"
                        data-tag-group="${escapeHtml(group.key)}" data-tag-value="${escapeHtml(it.val)}">
                  <span>${highlightTagText(it.display, rawSearch)}</span>
                  <span class="chip-count">${it.count}</span>
                </button>
              `;
            }).join('')}
          </div>
        </div>
      `;
    }).join('');

    if (searchCountEl) {
      if (rawSearch.length > 0) {
        searchCountEl.textContent = `${matchedTagCount} ${matchedTagCount === 1 ? 'tag' : 'tags'}`;
        searchCountEl.style.display = 'inline';
      } else {
        searchCountEl.style.display = 'none';
      }
    }

    if (!groupsEl.innerHTML.trim()) {
      groupsEl.innerHTML = `
        <div style="display:flex; align-items:center; justify-content:space-between; gap:8px; flex-wrap:wrap; font-size:0.78rem; color:var(--fg3); padding:4px 0;">
          <span>No tags match "${escapeHtml(rawSearch)}".</span>
          <button type="button" class="btn btn-secondary btn-sm" id="pdfTagClearSearchInlineBtn">Clear search</button>
        </div>
      `;
      document.getElementById('pdfTagClearSearchInlineBtn')?.addEventListener('click', () => {
        pdfTagFilterState.tagSearch = '';
        const input = document.getElementById('pdfTagSearchInput');
        if (input) { input.value = ''; input.focus(); }
        renderPdfTagFilterUI();
      });
    }

    groupsEl.querySelectorAll('.pdf-tag-chip').forEach(btn => {
      btn.addEventListener('click', () => {
        togglePdfTagSelection(btn.dataset.tagGroup, btn.dataset.tagValue);
      });
    });

    // Update Active Bar
    if (activeBar && activePills && matchCountEl) {
      if (activeCount === 0) {
        activeBar.style.display = 'none';
      } else {
        const matchingDocs = docs.filter(d => docMatchesTagFilters(d));
        matchCountEl.textContent = `${matchingDocs.length} ${matchingDocs.length === 1 ? 'PDF' : 'PDFs'}`;

        const pills = [];
        const addPills = (groupKey, labelFn) => {
          pdfTagFilterState[groupKey].forEach(val => {
            pills.push(`
              <span class="pdf-tag-active-pill">
                <span>${escapeHtml(labelFn(val))}</span>
                <button type="button" data-remove-group="${escapeHtml(groupKey)}" data-remove-val="${escapeHtml(val)}" aria-label="Remove tag">
                  <i class="fas fa-times"></i>
                </button>
              </span>
            `);
          });
        };
        addPills('subject', v => v);
        addPills('term', v => EXAM_TERM_DISPLAY[v] || v);
        addPills('classLevel', v => v);
        addPills('year', v => v);
        addPills('custom', v => {
          const found = userTags.find(t => String(t.id) === String(v));
          return found ? found.name : v;
        });

        activePills.innerHTML = pills.join('');
        activePills.querySelectorAll('button[data-remove-group]').forEach(btn => {
          btn.addEventListener('click', () => {
            const g = btn.dataset.removeGroup;
            const v = btn.dataset.removeVal;
            if (g && pdfTagFilterState[g]) {
              pdfTagFilterState[g].delete(v);
              applyPdfTagFilters();
            }
          });
        });
        activeBar.style.display = 'flex';
      }
    }
  }

  function renderFilteredPdfTiles(matchingDocs) {
    const container = document.getElementById('tilesContainer');
    if (!container) return;

    const importedSection = document.getElementById('importedSection');
    if (importedSection) importedSection.style.display = 'none';
    if (typeof hideHomeTagsPanels === 'function') hideHomeTagsPanels();

    container.innerHTML = '';

    if (!matchingDocs || matchingDocs.length === 0) {
      container.innerHTML = `
        <div class="study-empty-state" style="grid-column: 1 / -1;">
          <div class="study-empty-icon"><i class="fas fa-file-pdf"></i></div>
          <h4>No PDFs match these tags</h4>
          <p>Try removing one of the active tags or selecting a different combination.</p>
          <button type="button" class="btn btn-primary btn-sm" id="emptyClearPdfTagsBtn">
            <i class="fas fa-times"></i> Clear Tag Filters
          </button>
        </div>
      `;
      document.getElementById('emptyClearPdfTagsBtn')?.addEventListener('click', clearAllPdfTagFilters);
      return;
    }

    const sorted = sortFilteredPdfDocs(matchingDocs, pdfTagFilterState.sortBy);

    sorted.forEach(doc => {
      const tile = document.createElement('div');
      tile.className = 'tile';
      const title = doc.displayName || doc.name;
      const itemPath = doc.path || [doc.name];
      const itemId = doc.docItemId || `doc_${itemPath.join('/')}`;
      const metaBadges = [];
      if (doc.academicYear) metaBadges.push(`<span class="tile-meta-tag">${escapeHtml(doc.academicYear)}</span>`);
      if (doc.classLevel) metaBadges.push(`<span class="tile-meta-tag">${escapeHtml(doc.classLevel)}</span>`);
      if (doc.examTerm) metaBadges.push(`<span class="tile-meta-tag accent">${escapeHtml(EXAM_TERM_DISPLAY[doc.examTerm] || doc.examTerm)}</span>`);

      tile.innerHTML = `
        <div class="tile-top-bar">
          <button type="button" class="tile-tag-btn" title="Tags"><i class="fas fa-tag"></i></button>
          <button type="button" class="tile-fav-btn" title="Favorite"><i class="fas fa-star"></i></button>
        </div>
        <div class="tile-icon">
          <i class="fas fa-file-pdf"></i>
        </div>
        <div class="tile-text">${escapeHtml(title)}</div>
        <div class="tile-meta-tags">${metaBadges.join('')}</div>
      `;

      tile.querySelector('.tile-tag-btn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        openTagItemModal(itemId, title, 'document');
      });
      tile.querySelector('.tile-fav-btn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleFavorite(title, itemPath, doc.url);
      });

      tile.onclick = () => {
        addToRecent(title, itemPath, doc.url);
        if (typeof window.openAnyDocument === 'function') {
          window.openAnyDocument(doc.url, title);
        } else {
          showPDF(doc.url, title);
        }
      };

      container.appendChild(tile);
    });
  }

  async function applyPdfTagFilters() {
    if (!pdfTagFilterState.allDocs || pdfTagFilterState.allDocs.length === 0) {
      pdfTagFilterState.allDocs = await DbService.getAllDocuments();
    }
    renderPdfTagFilterUI();

    if (hasActivePdfTagFilters()) {
      const matchingDocs = pdfTagFilterState.allDocs.filter(d => docMatchesTagFilters(d));
      renderFilteredPdfTiles(matchingDocs);
    } else {
      const nodes = await DbService.getChildren(path);
      renderTilesFromDb(nodes);
    }
  }

  async function clearAllPdfTagFilters(skipRender = false) {
    pdfTagFilterState.subject.clear();
    pdfTagFilterState.term.clear();
    pdfTagFilterState.classLevel.clear();
    pdfTagFilterState.year.clear();
    pdfTagFilterState.custom.clear();
    pdfTagFilterState.tagSearch = '';
    const searchInput = document.getElementById('pdfTagSearchInput');
    if (searchInput) searchInput.value = '';
    renderPdfTagFilterUI();
    if (!skipRender) {
      const nodes = await DbService.getChildren(path);
      renderTilesFromDb(nodes);
    }
  }

  async function initPdfTagFilterSystem() {
    pdfTagFilterState.allDocs = await DbService.getAllDocuments();

    const toggleBtn = document.getElementById('pdfTagFilterToggleBtn');
    const panel = document.getElementById('pdfTagFilterPanel');
    const clearBtn = document.getElementById('pdfTagClearAllBtn');
    const resetViewBtn = document.getElementById('pdfTagResetViewBtn');
    const tagSearchInput = document.getElementById('pdfTagSearchInput');
    const tagSearchClearBtn = document.getElementById('pdfTagSearchClearBtn');
    const clearRecentBtn = document.getElementById('pdfTagClearRecentBtn');
    const sortSelect = document.getElementById('pdfTagSortSelect');

    if (!pdfTagFilterState.initialized) {
      pdfTagFilterState.initialized = true;

      if (toggleBtn && panel) {
        toggleBtn.addEventListener('click', () => {
          panel.classList.toggle('collapsed');
          toggleBtn.classList.toggle('active', !panel.classList.contains('collapsed') || hasActivePdfTagFilters());
        });
      }

      if (clearBtn) clearBtn.addEventListener('click', () => clearAllPdfTagFilters());
      if (resetViewBtn) resetViewBtn.addEventListener('click', () => clearAllPdfTagFilters());
      if (clearRecentBtn) clearRecentBtn.addEventListener('click', () => clearRecentPdfTags());

      if (tagSearchInput) {
        tagSearchInput.addEventListener('input', (e) => {
          pdfTagFilterState.tagSearch = e.target.value || '';
          renderPdfTagFilterUI();
        });
        tagSearchInput.addEventListener('keydown', (e) => {
          if (e.key === 'Escape' && tagSearchInput.value) {
            e.preventDefault();
            e.stopPropagation();
            tagSearchInput.value = '';
            pdfTagFilterState.tagSearch = '';
            renderPdfTagFilterUI();
          } else if (e.key === 'Enter' && tagSearchInput.value.trim()) {
            e.preventDefault();
            const firstChip = document.querySelector('#pdfTagGroupsContainer .pdf-tag-chip');
            if (firstChip) {
              togglePdfTagSelection(firstChip.dataset.tagGroup, firstChip.dataset.tagValue);
            }
          }
        });
      }

      if (tagSearchClearBtn && tagSearchInput) {
        tagSearchClearBtn.addEventListener('click', () => {
          tagSearchInput.value = '';
          pdfTagFilterState.tagSearch = '';
          renderPdfTagFilterUI();
          tagSearchInput.focus();
        });
      }

      if (sortSelect) {
        sortSelect.value = pdfTagFilterState.sortBy;
        sortSelect.addEventListener('change', (e) => {
          pdfTagFilterState.sortBy = e.target.value || 'date-desc';
          localStorage.setItem('questionary-pdf-tag-sort', pdfTagFilterState.sortBy);
          if (hasActivePdfTagFilters()) {
            const matchingDocs = pdfTagFilterState.allDocs.filter(d => docMatchesTagFilters(d));
            renderFilteredPdfTiles(matchingDocs);
          }
        });
      }
    }

    renderPdfTagFilterUI();
  }

  window.clearAllPdfTagFilters = clearAllPdfTagFilters;
  window.refreshPdfTagFilterSystem = async function () {
    DbService.invalidateCatalogCache();
    await initPdfTagFilterSystem();
    if (hasActivePdfTagFilters()) {
      await applyPdfTagFilters();
    }
  };

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

      setTimeout(() => {
        if (typeof window.openAnyDocument === 'function') {
          window.openAnyDocument(url, title);
        } else {
          showPDF(url);
        }
      }, 100);
    } else {
      path = [...pathArray];
      await navigateToPath(path);
    }
  }

  function escapeHtml(text) {
    if (text === null || text === undefined) return '';
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function getTargetOrigin() {
    if (window.location.protocol === 'file:') return '*';
    return (window.location.origin && window.location.origin !== 'null') ? window.location.origin : '*';
  }

  function isSafeHexColor(color, fallback = '#3b82f6') {
    if (typeof color === 'string' && /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(color.trim())) {
      return color.trim();
    }
    return fallback;
  }

  function isSafeDocumentUrl(url) {
    if (typeof url !== 'string') return false;
    const trimmed = url.trim();
    if (!trimmed || trimmed === '#') return false;
    if (/^[\u0000-\u001F]/.test(trimmed)) return false;
    const lower = trimmed.toLowerCase();
    if (lower.startsWith('javascript:') || lower.startsWith('vbscript:') || lower.startsWith('data:')) {
      return false;
    }
    if (lower.startsWith('blob:') || lower.startsWith('blob-id:') || lower.startsWith('local-pdf://')) {
      return true;
    }
    if (lower.startsWith('file:')) {
      return Boolean(window.electronAPI || (window.location && window.location.protocol === 'file:'));
    }
    if (trimmed.startsWith('//') || trimmed.startsWith('\\\\')) return false;
    try {
      const parsed = new URL(trimmed, window.location.href);
      return (
        parsed.protocol === 'http:' ||
        parsed.protocol === 'https:' ||
        parsed.protocol === 'capacitor:' ||
        parsed.protocol === 'blob:' ||
        parsed.protocol === 'file:'
      );
    } catch (e) {
      return false;
    }
  }

  function showConfirmModal(title, message, onConfirm, onCancel) {
    showConfirm(message, { title, type: 'danger', confirmText: 'Delete' }).then(res => {
      if (res && onConfirm) onConfirm();
      else if (!res && onCancel) onCancel();
    });
  }

  function setActiveNav(navId) {
    document.querySelectorAll('.nav-link').forEach(link => link.classList.remove('active'));
    const activeNav = document.getElementById(navId);
    if (activeNav) activeNav.classList.add('active');
  }

  function loadDocuments() {}
  function trackDailyAccess() {
    const today = new Date().toISOString().split('T')[0];
    const accessData = JSON.parse(localStorage.getItem('questionary-daily-access') || '{}');
    accessData[today] = (accessData[today] || 0) + 1;
    localStorage.setItem('questionary-daily-access', JSON.stringify(accessData));
  }

  function saveUserPreferences() {
    const settings = JSON.parse(localStorage.getItem('questionary-settings') || '{}');
    if (settings.rememberLocation !== false) {
      const safeView = VALID_VIEWS.has(currentView) ? currentView : 'home';
      localStorage.setItem('questionary-last-view', safeView);
      localStorage.setItem('questionary-last-path', JSON.stringify(Array.isArray(path) ? path : []));
    }
  }

  async function restoreLastLocation() {
    const settings = JSON.parse(localStorage.getItem('questionary-settings') || '{}');
    if (settings.rememberLocation !== false) {
      let lastView = localStorage.getItem('questionary-last-view');
      if (lastView && !VALID_VIEWS.has(lastView)) {
        lastView = 'home';
        localStorage.setItem('questionary-last-view', 'home');
      }

      let lastPath = [];
      try {
        const parsed = JSON.parse(localStorage.getItem('questionary-last-path') || '[]');
        if (Array.isArray(parsed)) {
          lastPath = parsed.filter(s => typeof s === 'string' && s.trim() !== '');
        }
      } catch (e) {
        lastPath = [];
      }

      if (lastView && lastView !== 'home') {
        showView(lastView);
        const navMap = {
          'home': 'homeNav', 'favorites': 'favoritesNav', 'recent': 'recentNav',
          'analytics': 'analyticsNav', 'planner': 'studyPlannerNav', 'flashcards': 'flashcardsNav',
          'notes': 'notesNav', 'progress': 'progressNav', 'reminders': 'remindersNav',
          'settings': 'settingsNav', 'tags': 'tagsNav', 'studyRoom': 'studyRoomNav'
        };
        if (navMap[lastView]) setActiveNav(navMap[lastView]);
      } else {
        if (lastPath.length > 0) {
          const validId = await DbService.getNodeIdByPath(lastPath);
          if (validId === null) {
            lastPath = [];
            localStorage.setItem('questionary-last-path', '[]');
          }
        }
        path = lastPath;
        showView('home');
        setActiveNav('homeNav');
      }
    } else {
      path = [];
      showView('home');
      setActiveNav('homeNav');
    }
  }

  async function getCurrentDocumentsLevel() {
    return await DbService.getChildren(path);
  }

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
      const isImportedPdf = !isFolder && typeof value === 'string' && value.startsWith('blob-id:');
      const isCustomItem = false;

      const itemPath = [...path, key];
      const itemId = isFolder ? `folder_${itemPath.join('/')}` : `doc_${itemPath.join('/')}`;

      tile.innerHTML = `
      <div class="tile-top-bar">
      <button type="button" class="tile-tag-btn" title="Tags"><i class="fas fa-tag"></i></button>
      ${isFolder ? `<button type="button" class="tile-ql-btn" title="Quick Link"><i class="fas fa-link"></i></button>` : ''}
      ${!isFolder && !isMissingPdf ? `<button type="button" class="tile-fav-btn" title="Favorite"><i class="fas fa-star"></i></button>` : ''}
      ${isImportedPdf || (isFolder && isCustomItem) ? `<button type="button" class="tile-lib-btn" title="Move to Library"><i class="fas fa-book-open"></i></button>` : ''}
      </div>
      <div class="tile-icon">
      <i class="fas ${isFolder ? 'fa-folder' : (key.endsWith('.png') ? 'fa-image' : 'fa-file-pdf')}"></i>
      </div>
      <div class="tile-text">${escapeHtml(key)}</div>
      ${isMissingPdf ? `<div class="pdf-missing-badge"><i class="fas fa-exclamation-triangle"></i> Not Available</div>` : ''}
      `;

      tile.querySelector('.tile-tag-btn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        openTagItemModal(itemId, key, isFolder ? 'folder' : 'document');
      });
      tile.querySelector('.tile-ql-btn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        addFolderToQuickLinks(key, itemPath);
      });
      tile.querySelector('.tile-fav-btn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleFavorite(key, itemPath, value);
      });
      tile.querySelector('.tile-lib-btn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        moveDocumentItemToLibrary(key);
      });

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

  window.renderTiles = async function(ignoredDocs) {
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

    if (typeof hideTimerCompletely === 'function') hideTimerCompletely();

    if (typeof hasActivePdfTagFilters === 'function' && hasActivePdfTagFilters()) {
      await clearAllPdfTagFilters(true);
    }

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
  // FULL-SCREEN MAXIMIZED PDF & DOCUMENT VIEWERS
  // ================================================================
  async function showPDF(url, customName = null, explicitDocKey = null) {
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
        if (url.startsWith('blob:') || url.startsWith('data:') || url.startsWith('blob-id:')) {
          filename = 'Document';
        } else {
          filename = url.split('/').pop().replace('.pdf', '').replace(/%20/g, ' ');
        }
      }

      let targetUrl = url;
      let loadedPdfBytes = null;
      let blobObjectUrl = null;
      let canonicalDocKey = explicitDocKey || null;

      if (url.startsWith('blob-id:')) {
        const blobId = url.replace('blob-id:', '');
        try {
          if (typeof window.getLoadedPdfBytes === 'function') {
            loadedPdfBytes = window.getLoadedPdfBytes(url);
          }
          if ((!loadedPdfBytes || loadedPdfBytes.byteLength === 0) && window.UserLibraryFileStore && typeof window.UserLibraryFileStore.getFileBytes === 'function') {
            const bytes = await window.UserLibraryFileStore.getFileBytes(blobId);
            if (bytes && bytes.byteLength > 0) {
              loadedPdfBytes = new Uint8Array(bytes);
              if (typeof window.setLoadedPdfBytes === 'function') {
                window.setLoadedPdfBytes(url, loadedPdfBytes);
              } else {
                window._questionaryLoadedPdfBlobs = window._questionaryLoadedPdfBlobs || new Map();
                if (typeof window._questionaryLoadedPdfBlobs.set === 'function') {
                  window._questionaryLoadedPdfBlobs.set(url, loadedPdfBytes);
                }
                window._questionaryLoadedPdfBlobs[url] = loadedPdfBytes;
              }
            }
          }
          if (loadedPdfBytes && loadedPdfBytes.byteLength > 0) {
            window._questionaryBlobIdToObjectUrl = window._questionaryBlobIdToObjectUrl || {};
            blobObjectUrl = window._questionaryBlobIdToObjectUrl[url];
            if (!blobObjectUrl) {
              blobObjectUrl = URL.createObjectURL(new Blob([loadedPdfBytes], { type: 'application/pdf' }));
              window._questionaryBlobIdToObjectUrl[url] = blobObjectUrl;
            }
            if (typeof window.setLoadedPdfBytes === 'function') {
              window.setLoadedPdfBytes(blobObjectUrl, loadedPdfBytes);
            }
          }
        } catch (e) {}
      } else if (url.startsWith('blob:')) {
        blobObjectUrl = url;
        try {
          if (typeof window.getLoadedPdfBytes === 'function') {
            loadedPdfBytes = window.getLoadedPdfBytes(url);
          }
          if (!loadedPdfBytes || loadedPdfBytes.byteLength === 0) {
            const res = await fetch(url);
            if (res && res.ok) {
              const ab = await res.arrayBuffer();
              if (ab && ab.byteLength > 0) {
                loadedPdfBytes = new Uint8Array(ab);
                if (typeof window.setLoadedPdfBytes === 'function') {
                  window.setLoadedPdfBytes(url, loadedPdfBytes);
                }
              }
            }
          }
        } catch (e) {}
      } else if (window.DownloadManager && !url.startsWith('blob:') && !url.startsWith('blob-id:') && !url.startsWith('data:') && !url.startsWith('http') && !url.startsWith('local-pdf:')) {
        const cleanRelative = url.replace(/^(\.\/|\/)?(documentshd|documents)\//i, '').replace(/^\/+/, '');
        if (!canonicalDocKey) canonicalDocKey = cleanRelative;
        targetUrl = typeof window.DownloadManager.resolveDocumentUrlAsync === 'function'
          ? await window.DownloadManager.resolveDocumentUrlAsync(cleanRelative)
          : window.DownloadManager.resolveDocumentUrl(cleanRelative);
      } else if (!url.startsWith('blob:') && !url.startsWith('blob-id:') && !url.startsWith('data:') && !url.startsWith('http') && !url.startsWith('local-pdf:')) {
        try {
          targetUrl = new URL(url, window.location.href).href;
        } catch (e) {
          targetUrl = url;
        }
      }

      if (typeof targetUrl === 'string' && targetUrl.startsWith('local-pdf://') && !targetUrl.startsWith('local-pdf:///') && !targetUrl.startsWith('local-pdf://localhost')) {
        targetUrl = targetUrl.replace('local-pdf://', 'local-pdf:///');
      }

      if (!isSafeDocumentUrl(targetUrl)) {
        showNotification('Blocked unsafe document URL', 'error');
        return;
      }

      if (typeof window.setCurrentPDF === 'function') {
        window.setCurrentPDF(targetUrl, filename);
      }

      if (pdfViewer) {
        const viewerUrl = 'pdfviewer.html?file=' + encodeURIComponent(targetUrl) +
          (blobObjectUrl ? '&blobUrl=' + encodeURIComponent(blobObjectUrl) : '') +
          (canonicalDocKey ? '&docKey=' + encodeURIComponent(canonicalDocKey) : '') +
          (filename ? '&name=' + encodeURIComponent(filename) : '');

        pdfViewer.onload = function () {
          const theme = localStorage.getItem('questionary-theme') || localStorage.getItem('theme') || 'dark';
          const targetOrigin = getTargetOrigin();
          let bytesPayload = null;
          if (loadedPdfBytes && loadedPdfBytes.byteLength > 0) {
            bytesPayload = new Uint8Array(loadedPdfBytes.byteLength);
            bytesPayload.set(loadedPdfBytes);
          }
          pdfViewer.contentWindow.postMessage({
            type: 'loadPdf',
            url: targetUrl,
            blobUrl: blobObjectUrl || null,
            docKey: canonicalDocKey || null,
            name: filename || null,
            pdfBytes: bytesPayload
          }, targetOrigin);
          pdfViewer.contentWindow.postMessage({ type: 'setTheme', theme: theme }, targetOrigin);
          pdfViewer.onload = null;
        };

        pdfViewer.src = viewerUrl;
        pdfViewer.classList.add('active');
      }

      if (tilesSection) tilesSection.style.display = 'block';
      if (tilesContainer) tilesContainer.style.display = 'none';
      if (sectionHeader) sectionHeader.style.display = 'none';
      if (dashboardHeader) dashboardHeader.style.display = 'none';
      if (breadcrumbContainer) breadcrumbContainer.style.display = 'none';

      const importedSection = document.getElementById('importedSection');
      if (importedSection) importedSection.style.display = 'none';
      if (typeof hideHomeTagsPanels === 'function') hideHomeTagsPanels();

      if (pdfViewerContainer) {
        pdfViewerContainer.style.display = 'flex';
        const pdfNameEl = document.getElementById('currentPdfName');
        if (pdfNameEl) pdfNameEl.textContent = filename;

        if (typeof renderPdfBookmarks === 'function') renderPdfBookmarks(targetUrl);
        if (typeof window.setCurrentPdfForBookmarks === 'function') window.setCurrentPdfForBookmarks(targetUrl);
        else window.currentPdfUrlForBookmarks = targetUrl;
      }

      const timerPanel = document.getElementById('timerPanel');
      if (timerPanel) timerPanel.style.display = 'flex';
      if (typeof initializeTimer === 'function') initializeTimer();
      if (typeof trackPdfViewStart === 'function') trackPdfViewStart();
  }

  function restoreActiveViewAfterViewer() {
    document.body.classList.remove('pdf-view-active');
    const tilesSection = document.getElementById('tilesSection');
    const tilesContainer = document.getElementById('tilesContainer');
    const sectionHeader = document.querySelector('#tilesSection .section-header');
    const dashboardHeader = document.querySelector('.dashboard-header');
    const breadcrumbContainer = document.querySelector('.breadcrumb-container');
    const importedSection = document.getElementById('importedSection');

    if (currentView && currentView !== 'home') {
      showView(currentView);
      return;
    }

    if (tilesSection) tilesSection.style.display = 'block';
    if (breadcrumbContainer) breadcrumbContainer.style.display = 'flex';
    if (tilesContainer) {
      const isListView = tilesContainer.classList.contains('list-view');
      tilesContainer.style.display = isListView ? 'flex' : 'grid';
    }
    if (sectionHeader) sectionHeader.style.display = 'flex';

    const isRoot = !Array.isArray(path) || path.length === 0;
    const tagFiltered = typeof hasActivePdfTagFilters === 'function' && hasActivePdfTagFilters();
    if (dashboardHeader) {
      dashboardHeader.style.display = isRoot ? (window.innerWidth <= 768 ? 'grid' : 'flex') : 'none';
    }
    if (importedSection) {
      importedSection.style.display = (isRoot && !tagFiltered) ? 'block' : 'none';
    }
    if (isRoot && !tagFiltered) {
      if (typeof showHomeTagsPanels === 'function') showHomeTagsPanels();
      if (typeof window.renderLibrary === 'function') window.renderLibrary();
      if (typeof updateDashboardStats === 'function') updateDashboardStats();
    } else {
      if (typeof hideHomeTagsPanels === 'function') hideHomeTagsPanels();
      if (isRoot && typeof updateDashboardStats === 'function') updateDashboardStats();
    }
    updateBreadcrumb();
  }
  window.restoreActiveViewAfterViewer = restoreActiveViewAfterViewer;

  function closePDF() {
    const pdfViewer = document.getElementById('pdfViewer');
    const pdfViewerContainer = document.getElementById('pdfViewerContainer');
    const bookmarksPanel = document.getElementById('pdfBookmarksPanel');

    if (pdfViewerContainer) pdfViewerContainer.style.display = 'none';
    if (bookmarksPanel) bookmarksPanel.style.display = 'none';
    if (pdfViewer) {
      pdfViewer.src = '';
      pdfViewer.classList.remove('active');
    }

    restoreActiveViewAfterViewer();
    window.currentPdfUrlForBookmarks = null;
  }

  window.showPDF = showPDF;
  window.closePDF = closePDF;

  /* Image Viewer */
  var _currentImageBlobUrl = window._currentImageBlobUrl || null;
  var _currentImageName = window._currentImageName || '';
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
    const tilesSection = document.getElementById('tilesSection');
    const tilesContainer = document.getElementById('tilesContainer');
    const sectionHeader = document.querySelector('#tilesSection .section-header');
    const dashboardHeader = document.querySelector('.dashboard-header');
    const breadcrumbContainer = document.querySelector('.breadcrumb-container');
    const importedSection = document.getElementById('importedSection');

    document.body.classList.add('pdf-view-active');
    if (img) img.src = imgSrc;
    if (nameEl) nameEl.textContent = name || 'Image';
    if (tilesSection) tilesSection.style.display = 'block';
    if (container) container.style.display = 'flex';
    if (tilesContainer) tilesContainer.style.display = 'none';
    if (sectionHeader) sectionHeader.style.display = 'none';
    if (dashboardHeader) dashboardHeader.style.display = 'none';
    if (breadcrumbContainer) breadcrumbContainer.style.display = 'none';
    if (importedSection) importedSection.style.display = 'none';
    if (typeof hideHomeTagsPanels === 'function') hideHomeTagsPanels();
    updateBreadcrumb();
  }

  function closeImageViewer() {
    const container = document.getElementById('imageViewerContainer');
    const img = document.getElementById('imageViewerImg');
    if (container) container.style.display = 'none';
    if (img) img.src = '';
    if (_currentImageBlobUrl && _currentImageBlobUrl.startsWith('blob:')) URL.revokeObjectURL(_currentImageBlobUrl);
    _currentImageBlobUrl = null;
    restoreActiveViewAfterViewer();
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

  function renderAnalytics() {
    const accessData = JSON.parse(localStorage.getItem('questionary-daily-access') || '{}');
    const recent = JSON.parse(localStorage.getItem('questionary-recent') || '[]');
    const subjectAccess = JSON.parse(localStorage.getItem('questionary-subject-access') || '{}');

    const totalSessions = Object.values(accessData).reduce((sum, count) => sum + count, 0);
    const totalDocsViewed = recent.length;
    const daysActive = Object.keys(accessData).length;
    const avgSessionsPerDay = daysActive > 0 ? (totalSessions / daysActive).toFixed(1) : 0;

    const totalSessionsEl = document.getElementById('totalSessions');
    const totalDocsViewedEl = document.getElementById('totalDocsViewed');
    const daysActiveEl = document.getElementById('daysActive');
    const avgSessionsEl = document.getElementById('avgSessions');

    if (totalSessionsEl) totalSessionsEl.textContent = totalSessions;
    if (totalDocsViewedEl) totalDocsViewedEl.textContent = totalDocsViewed;
    if (daysActiveEl) daysActiveEl.textContent = daysActive;
    if (avgSessionsEl) avgSessionsEl.textContent = avgSessionsPerDay;

    renderAccessChart(accessData);
    renderSubjectChart(subjectAccess);
    renderRecentActivity(recent);
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
      <div class="calendar-day ${isToday ? 'today' : ''} ${sessionsOnDay.length > 0 ? 'has-session' : ''}"
      onclick="showDaySessions('${dateStr}')">
      <span class="day-number">${day}</span>
      ${sessionsOnDay.length > 0 ? `<span class="session-dot">${sessionsOnDay.length}</span>` : ''}
      </div>
      `;
    }

    calendarGrid.innerHTML = html;
  }

  function renderSessions() {
    const container = document.getElementById('sessionsList') || document.getElementById('sessionsContainer');
    if (!container) return;

    if (studySessions.length === 0) {
      container.innerHTML = '<p style="text-align: center; color: var(--text-secondary); padding: 2rem;">No study sessions scheduled.</p>';
      return;
    }

    const sorted = [...studySessions].sort((a, b) => new Date(a.date) - new Date(b.date));
    container.innerHTML = sorted.map(session => `
    <div class="session-item" data-session-id="${escapeHtml(session.id)}">
    <div class="session-info">
    <strong>${escapeHtml(session.subject)}</strong>
    <span>${escapeHtml(session.date)} at ${escapeHtml(session.time)}</span>
    </div>
    <button type="button" class="btn-icon session-delete-btn" title="Delete session">
    <i class="fas fa-trash"></i>
    </button>
    </div>
    `).join('');

    container.querySelectorAll('.session-delete-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const sid = btn.closest('.session-item')?.dataset.sessionId;
        if (sid) deleteSession(sid);
      });
    });
  }

  function renderNotes() {
    if (window.EnhancedNotes && typeof window.EnhancedNotes.renderNotes === 'function') {
      window.EnhancedNotes.renderNotes();
      return;
    }
    const container = document.getElementById('notesGrid');
    if (!container) return;
    if (notes.length === 0) {
      container.innerHTML = '<p style="text-align: center; color: var(--text-secondary); padding: 2rem;">No notes yet.</p>';
      return;
    }
    container.innerHTML = notes.map(note => `
    <div class="note-card" data-note-id="${escapeHtml(note.id)}">
    <h4>${escapeHtml(note.title)}</h4>
    <p>${escapeHtml((note.content || '').substring(0, 100))}${(note.content || '').length > 100 ? '...' : ''}</p>
    <small>${escapeHtml(new Date(note.updatedAt).toLocaleDateString())}</small>
    <div class="note-actions">
    <button type="button" class="btn-icon tag note-tag-btn" title="Add Tags">
    <i class="fas fa-tag"></i>
    </button>
    <button type="button" class="btn-icon delete note-delete-btn" title="Delete note">
    <i class="fas fa-trash"></i>
    </button>
    </div>
    </div>
    `).join('');

    container.querySelectorAll('.note-card').forEach(card => {
      const nid = card.dataset.noteId;
      const noteObj = notes.find(n => String(n.id) === String(nid));
      card.addEventListener('click', () => editNote(nid));
      card.querySelector('.note-tag-btn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        if (noteObj) openTagItemModal(`note_${noteObj.id}`, noteObj.title, 'note');
      });
      card.querySelector('.note-delete-btn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        deleteNote(nid);
      });
    });
  }

  function updateProgressDisplay() {}

  function renderQuickLinks() {
    const container = document.getElementById('quickLinksList');
    if (!container) return;
    quickLinks = quickLinks.filter(ql => ql && ql.pathArray && Array.isArray(ql.pathArray));

    if (quickLinks.length === 0) {
      container.innerHTML = `
      <div class="quick-links-empty">
      <i class="fas fa-link"></i>
      <p>No quick links yet</p>
      <span>Navigate to a folder or file and click "Add Current Location"</span>
      </div>
      `;
      return;
    }

    container.innerHTML = quickLinks.map(ql => {
      const isFile = ql.isFile || false;
      const icon = isFile ? 'fa-file-pdf' : 'fa-folder';
      const iconColor = isFile ? 'style="color: #ef4444;"' : '';
      const displayName = ql.name || ql.pathArray[ql.pathArray.length - 1] || 'Unknown';
      return `
      <div class="quick-link-item" data-id="${escapeHtml(ql.id)}" data-path="${escapeHtml(ql.pathArray.join('|'))}" data-is-file="${isFile ? 'true' : 'false'}" data-url="${escapeHtml(ql.url || '')}">
      <i class="fas ${icon}" ${iconColor}></i>
      <span class="quick-link-name">${escapeHtml(displayName)}</span>
      <button type="button" class="quick-link-delete" title="Remove">
      <i class="fas fa-times"></i>
      </button>
      </div>
      `;
    }).join('');

    container.querySelectorAll('.quick-link-delete').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const qlId = btn.closest('.quick-link-item')?.dataset.id;
        if (qlId) removeQuickLink(qlId);
      });
    });

    container.querySelectorAll('.quick-link-item').forEach(item => {
      item.addEventListener('click', async (e) => {
        if (e.target.closest('.quick-link-delete')) return;
        const pathStr = item.dataset.path;
        const pathArray = pathStr.split('|');
        const isFile = item.dataset.isFile === 'true';
        const url = item.dataset.url;

        if (isFile && url) {
          const parentPath = pathArray.slice(0, -1);
          await navigateToPath(parentPath);
          setTimeout(() => showPDF(url), 100);
        } else {
          await navigateToPath(pathArray);
        }
        document.getElementById('quickLinksPanel')?.classList.remove('active');
      });
    });
  }

  var currentOpenPDF = window.currentOpenPDF || null;
  window.setCurrentPDF = function(url, name) { currentOpenPDF = { url, name }; };
  window.clearCurrentPDF = function() { currentOpenPDF = null; };

  function removeQuickLink(id) {
    quickLinks = quickLinks.filter(ql => ql.id !== id);
    saveQuickLinks();
    renderQuickLinks();
    if (typeof showNotification === 'function') showNotification('Quick link removed', 'info');
  }

  function saveQuickLinks() { localStorage.setItem('questionary-quick-links', JSON.stringify(quickLinks)); }
  function loadQuickLinks() { quickLinks = JSON.parse(localStorage.getItem('questionary-quick-links') || '[]'); }

  function addFolderToQuickLinks(folderName, folderPath) {
    const pathStr = folderPath.join('|');
    if (quickLinks.some(ql => ql.pathArray.join('|') === pathStr)) {
      showNotification('This folder is already in quick links', 'info');
      return;
    }
    quickLinks.push({ id: Date.now().toString(), name: folderName, pathArray: [...folderPath], isFile: false });
    saveQuickLinks();
    renderQuickLinks();
    showNotification(`Folder "${folderName}" added to quick links!`, 'success');
  }
  window.addFolderToQuickLinks = addFolderToQuickLinks;

  function addCurrentFolderToQuickLinks() {
    if (path.length === 0) {
      showNotification('Navigate to a folder first to add it as a quick link', 'info');
      return;
    }
    const pathStr = path.join('|');
    if (quickLinks.some(ql => ql.pathArray.join('|') === pathStr)) {
      showNotification('This folder is already in quick links', 'info');
      return;
    }
    const folderName = path[path.length - 1];
    quickLinks.push({ id: Date.now().toString(), name: folderName, pathArray: [...path], isFile: false });
    saveQuickLinks();
    renderQuickLinks();
    showNotification(`Folder "${folderName}" added to quick links!`, 'success');
  }

  function addCurrentPdfToQuickLinks() {
    if (!currentOpenPDF) return;
    const pathStr = [...path, currentOpenPDF.name].join('|');
    if (quickLinks.some(ql => ql.pathArray.join('|') === pathStr)) {
      showNotification('This file is already in quick links', 'info');
      return;
    }
    quickLinks.push({ id: Date.now().toString(), name: currentOpenPDF.name, pathArray: [...path, currentOpenPDF.name], isFile: true, url: currentOpenPDF.url });
    saveQuickLinks();
    renderQuickLinks();
    showNotification('PDF added to quick links!', 'success');
  }

  function showQuickLinkChoiceDialog() {
    const existing = document.getElementById('quickLinkChoiceDialog');
    if (existing) existing.remove();

    const folderName = path.length > 0 ? path[path.length - 1] : 'Home';
    const pdfName = currentOpenPDF ? currentOpenPDF.name : '';

    const dialog = document.createElement('div');
    dialog.id = 'quickLinkChoiceDialog';
    dialog.className = 'quicklink-choice-dialog-overlay';
    dialog.innerHTML = `
    <div class="quicklink-choice-dialog">
    <h3><i class="fas fa-link"></i> Add Quick Link</h3>
    <p>What would you like to add?</p>
    <div class="quicklink-choice-options">
    <button class="quicklink-choice-btn" id="addPdfQuickLink">
    <i class="fas fa-file-pdf"></i>
    <span>Current PDF</span>
    <small>${pdfName}</small>
    </button>
    ${path.length > 0 ? `
      <button class="quicklink-choice-btn" id="addFolderQuickLink">
      <i class="fas fa-folder"></i>
      <span>Current Folder</span>
      <small>${folderName}</small>
      </button>
      ` : ''}
      </div>
      <button class="quicklink-choice-cancel" id="cancelQuickLinkChoice">Cancel</button>
      </div>
      `;
      document.body.appendChild(dialog);

      document.getElementById('addPdfQuickLink').onclick = () => { addCurrentPdfToQuickLinks(); dialog.remove(); };
      const folderBtn = document.getElementById('addFolderQuickLink');
      if (folderBtn) folderBtn.onclick = () => { addCurrentFolderToQuickLinks(); dialog.remove(); };
      document.getElementById('cancelQuickLinkChoice').onclick = () => dialog.remove();
      dialog.onclick = (e) => { if (e.target === dialog) dialog.remove(); };
  }

  function trackStudyTime(minutes) {
    studyStats.totalTime = (studyStats.totalTime || 0) + minutes;
    localStorage.setItem('questionary-study-stats', JSON.stringify(studyStats));
  }

  function updateDocProgress(docPath, progress) {
    documentProgress[docPath] = { progress, lastAccessed: Date.now() };
    localStorage.setItem('questionary-doc-progress', JSON.stringify(documentProgress));
  }

  function trackSubjectAccess(subjectName) {
    if (!subjectName) return;
    const subjectAccess = JSON.parse(localStorage.getItem('questionary-subject-access') || '{}');
    subjectAccess[subjectName] = (subjectAccess[subjectName] || 0) + 1;
    localStorage.setItem('questionary-subject-access', JSON.stringify(subjectAccess));
  }

  function renderAccessChart(accessData) {
    const container = document.getElementById('accessChart');
    if (!container) return;
    const days = [];
    const today = new Date();
    for (let i = 6; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      const dayName = date.toLocaleDateString('en-US', { weekday: 'short' });
      days.push({ date: dateStr, day: dayName, count: accessData[dateStr] || 0 });
    }
    const maxCount = Math.max(...days.map(d => d.count), 5);
    container.innerHTML = `
    <div style="display: flex; align-items: flex-end; justify-content: space-between; height: 140px; gap: 8px; padding: 10px 0;">
    ${days.map(d => `
      <div style="display: flex; flex-direction: column; align-items: center; flex: 1;">
      <div style="width: 100%; max-width: 40px; height: ${Math.max((d.count / maxCount) * 100, 8)}px; background: ${d.count > 0 ? 'var(--primary-color)' : 'var(--border)'}; border-radius: 4px 4px 0 0; transition: height 0.3s ease;" title="${d.count} sessions"></div>
      <span style="font-size: 0.75rem; color: var(--text-secondary); margin-top: 6px;">${d.day}</span>
      <span style="font-size: 0.7rem; color: var(--text-primary); font-weight: 600;">${d.count}</span>
      </div>
      `).join('')}
      </div>
      `;
  }

  function renderSubjectChart(subjectAccess) {
    const container = document.getElementById('subjectChart');
    if (!container) return;
    const subjects = Object.entries(subjectAccess).sort((a, b) => b[1] - a[1]).slice(0, 5);
    if (subjects.length === 0) {
      container.innerHTML = '<div style="text-align: center; padding: 2rem; color: var(--text-secondary);"><p>No subject data yet. Browse some documents!</p></div>';
      return;
    }
    const maxCount = subjects[0][1];
    const colors = ['#f97316', '#3b82f6', '#22c55e', '#a855f7', '#f59e0b'];
    container.innerHTML = `<div style="display: flex; flex-direction: column; gap: 12px;">${subjects.map(([name, count], i) => `
      <div>
      <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
      <span style="font-size: 0.85rem; font-weight: 500; color: var(--text-primary);">${escapeHtml(name)}</span>
      <span style="font-size: 0.8rem; color: var(--text-secondary);">${count} views</span>
      </div>
      <div style="height: 8px; background: var(--border); border-radius: 4px; overflow: hidden;">
      <div style="width: ${(count / maxCount) * 100}%; height: 100%; background: ${colors[i % colors.length]}; border-radius: 4px;"></div>
      </div>
      </div>
      `).join('')}</div>`;
  }

  function renderRecentActivity(recent) {
    const container = document.getElementById('recentActivityList');
    if (!container) return;
    const recentItems = recent.slice(0, 10);
    if (recentItems.length === 0) {
      container.innerHTML = '<div style="text-align: center; padding: 2rem; color: var(--text-secondary);"><p>No recent activity yet.</p></div>';
      return;
    }
    container.innerHTML = recentItems.map(item => `
    <div style="display: flex; align-items: center; gap: 12px; padding: 10px; border-radius: 8px; background: var(--surface-hover); margin-bottom: 8px;">
    <i class="fas fa-file-pdf" style="color: var(--primary-color); font-size: 1.1rem;"></i>
    <div style="flex: 1; min-width: 0;">
    <div style="font-weight: 500; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(item.title)}</div>
    <div style="font-size: 0.75rem; color: var(--text-secondary);">${getTimeAgo(item.timestamp)}</div>
    </div>
    </div>
    `).join('');
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

  window.navigateToSearchResult = navigateToSearchResult;

  function navigateToNote(noteId) {
    const searchResults = document.getElementById('searchResults');
    if (searchResults) searchResults.style.display = 'none';
    document.getElementById('globalSearch').value = '';
    showView('notes');
    setActiveNav('notesNav');
    setTimeout(() => { if (typeof editNote === 'function') editNote(noteId); }, 100);
  }

  function navigateToFlashcard(deckId) {
    const searchResults = document.getElementById('searchResults');
    if (searchResults) searchResults.style.display = 'none';
    document.getElementById('globalSearch').value = '';
    showView('flashcards');
    setActiveNav('flashcardsNav');
    setTimeout(() => { if (typeof startStudyDeck === 'function') startStudyDeck(deckId); }, 100);
  }

  function navigateToSession(sessionId) {
    const searchResults = document.getElementById('searchResults');
    if (searchResults) searchResults.style.display = 'none';
    document.getElementById('globalSearch').value = '';
    showView('planner');
    setActiveNav('studyPlannerNav');
    setTimeout(() => {
      const session = studySessions.find(s => s.id === sessionId);
      if (session) showNotification(`Session: ${session.subject} on ${session.date} at ${session.time}`, 'info');
    }, 100);
  }

  window.navigateToNote = navigateToNote;
  window.navigateToFlashcard = navigateToFlashcard;
  window.navigateToSession = navigateToSession;

  // ================================================================
  // NOTES SYSTEM
  // ================================================================
  function loadNotes() {
    if (window.EnhancedNotes && typeof window.EnhancedNotes.loadNotes === 'function') {
      notes = window.EnhancedNotes.loadNotes();
      return notes;
    }
    notes = JSON.parse(localStorage.getItem('questionary-notes') || '[]');
    return notes;
  }
  function saveNotes() { localStorage.setItem('questionary-notes', JSON.stringify(notes)); }

  function openNoteModal(noteId = null) {
    if (window.EnhancedNotes && typeof window.EnhancedNotes.openEditor === 'function') {
      window.EnhancedNotes.openEditor(noteId);
      return;
    }
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

  function editNote(noteId) { openNoteModal(noteId); }

  function deleteNote(noteId) {
    if (window.EnhancedNotes && typeof window.EnhancedNotes.deleteNote === 'function') {
      window.EnhancedNotes.deleteNote(noteId);
      return;
    }
    const note = notes.find(n => n.id === noteId);
    showConfirmModal('Delete Note', `Are you sure you want to delete "${note ? note.title : ''}"?`, () => {
      notes = notes.filter(n => n.id !== noteId);
      saveNotes();
      renderNotes();
      showNotification('Note deleted', 'info');
    });
  }

  // ================================================================
  // FLASHCARD ENGINE
  // ================================================================
  function loadFlashcardDecks() {
    if (window.EnhancedFlashcards && typeof window.EnhancedFlashcards.loadDecks === 'function') {
      flashcardDecks = window.EnhancedFlashcards.loadDecks();
      return flashcardDecks;
    }
    try {
      const raw = localStorage.getItem('questionary-flashcards');
      flashcardDecks = raw ? JSON.parse(raw) : [];

      let needsSave = false;
      flashcardDecks.forEach((deck, idx) => {
        if (!deck.id) {
          deck.id = 'deck_' + Date.now() + '_' + idx;
          needsSave = true;
        }
        if (!Array.isArray(deck.cards)) {
          deck.cards = [];
          needsSave = true;
        }
      });

      if (needsSave) saveFlashcardDecks();
    } catch (e) {
      console.error('Error parsing flashcards:', e);
      flashcardDecks = [];
    }
    return flashcardDecks;
  }

  function saveFlashcardDecks() {
    localStorage.setItem('questionary-flashcards', JSON.stringify(flashcardDecks));
    window.flashcardDecks = flashcardDecks;
  }

  function renderFlashcardDecks() {
    if (window.EnhancedFlashcards && typeof window.EnhancedFlashcards.renderDecks === 'function') {
      window.EnhancedFlashcards.renderDecks();
      return;
    }
    loadFlashcardDecks();
    const container = document.getElementById('flashcardsGrid');
    if (!container) return;

    if (flashcardDecks.length === 0) {
      container.innerHTML = '<p style="text-align: center; color: var(--text-secondary); padding: 2rem;">No flashcard decks yet. Click "New Deck" to create one!</p>';
      return;
    }

    container.innerHTML = flashcardDecks.map(deck => `
    <div class="deck-card" data-deck-id="${escapeHtml(deck.id)}">
    <div class="deck-card-header">
    <h4 class="deck-card-title">${escapeHtml(deck.name)}</h4>
    <div class="deck-card-actions">
    <button type="button" class="btn-icon tag deck-tag-btn" title="Add Tags">
    <i class="fas fa-tag"></i>
    </button>
    <button type="button" class="btn-icon delete deck-delete-btn" title="Delete deck">
    <i class="fas fa-trash"></i>
    </button>
    </div>
    </div>
    <p style="font-size: 0.82rem; color: var(--fg3); margin: 6px 0 12px 0;">${deck.cards.length} ${deck.cards.length === 1 ? 'card' : 'cards'}</p>
    <div style="display: flex; gap: 0.45rem; flex-wrap: wrap; margin-top: auto;">
    <button type="button" class="btn btn-primary btn-sm deck-study-btn" style="flex: 1;">
    <i class="fas fa-play"></i> Study
    </button>
    <button type="button" class="btn btn-secondary btn-sm deck-shuffle-btn" title="Shuffle & Study in Random Order">
    <i class="fas fa-random"></i> Shuffle
    </button>
    <button type="button" class="btn btn-secondary btn-sm deck-quiz-btn" style="flex: 1;">
    <i class="fas fa-question-circle"></i> Quiz
    </button>
    </div>
    </div>
    `).join('');

    container.querySelectorAll('.deck-card').forEach(card => {
      const did = card.dataset.deckId;
      const deckObj = flashcardDecks.find(d => String(d.id) === String(did));
      card.querySelector('.deck-tag-btn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        if (deckObj) openTagItemModal(`deck_${deckObj.id}`, deckObj.name, 'flashcard');
      });
      card.querySelector('.deck-delete-btn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        deleteDeck(did);
      });
      card.querySelector('.deck-study-btn')?.addEventListener('click', () => startStudyDeck(did));
      card.querySelector('.deck-shuffle-btn')?.addEventListener('click', () => startStudyDeck(did, { shuffle: true }));
      card.querySelector('.deck-quiz-btn')?.addEventListener('click', () => startQuiz(did));
    });
  }

  function openFlashcardModal(deckId = null) {
    if (window.EnhancedFlashcards && typeof window.EnhancedFlashcards.openEditor === 'function') {
      window.EnhancedFlashcards.openEditor(deckId);
      return;
    }
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
    if (window.EnhancedFlashcards && typeof window.EnhancedFlashcards.deleteDeck === 'function') {
      window.EnhancedFlashcards.deleteDeck(deckId);
      return;
    }
    loadFlashcardDecks();
    const targetId = String(deckId);
    const deck = flashcardDecks.find(d => String(d.id) === targetId);

    if (!deck) {
      showNotification('Deck not found', 'warning');
      return;
    }

    showConfirm(`Are you sure you want to delete the deck "${deck.name}"?`, {
      title: 'Delete Deck',
      type: 'danger',
      confirmText: 'Delete'
    }).then(confirmed => {
      if (confirmed) {
        flashcardDecks = flashcardDecks.filter(d => String(d.id) !== targetId);
        saveFlashcardDecks();
        renderFlashcardDecks();
        showNotification('Deck deleted', 'info');
      }
    });
  }

  function shuffleCardList(cards) {
    const arr = Array.isArray(cards) ? [...cards] : [];
    if (arr.length <= 1) return arr;
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    if (arr.every((item, idx) => item === cards[idx])) {
      [arr[0], arr[1]] = [arr[1], arr[0]];
    }
    return arr;
  }

  function startStudyDeck(deckId, options = {}) {
    if (window.EnhancedFlashcards && typeof window.EnhancedFlashcards.startStudy === 'function') {
      window.EnhancedFlashcards.startStudy(deckId, options);
      return;
    }
    loadFlashcardDecks();
    const targetId = String(deckId);
    const deck = flashcardDecks.find(d => String(d.id) === targetId);

    if (!deck || !deck.cards || deck.cards.length === 0) {
      showNotification('This deck has no cards yet! Edit it to add some cards.', 'warning');
      return;
    }

    currentStudyDeck = deck;
    isStudyShuffled = Boolean(options && options.shuffle && deck.cards.length > 1);
    currentStudyCards = isStudyShuffled ? shuffleCardList(deck.cards) : [...deck.cards];
    currentCardIndex = 0;

    const modalTitle = document.getElementById('studyModalTitle');
    if (modalTitle) {
      modalTitle.innerHTML = `<i class="fas fa-graduation-cap"></i> ${escapeHtml(deck.name)}`;
    }

    const modal = document.getElementById('studyModal');
    if (modal) {
      modal.classList.add('active');
      showCurrentCard();
      if (isStudyShuffled) {
        showNotification('Deck shuffled for random practice!', 'info');
      }
    }
  }

  function shuffleStudyDeck() {
    if (window.EnhancedFlashcards && typeof window.EnhancedFlashcards.shuffleDeck === 'function') {
      window.EnhancedFlashcards.shuffleDeck();
      return;
    }
    if (!currentStudyDeck || !currentStudyCards || currentStudyCards.length === 0) return;
    if (currentStudyCards.length < 2) {
      showNotification('Add at least 2 cards to shuffle this deck.', 'info');
      return;
    }
    currentStudyCards = shuffleCardList(currentStudyCards);
    isStudyShuffled = true;
    currentCardIndex = 0;
    showCurrentCard();
    showNotification('Cards shuffled!', 'info');
  }

  function showCurrentCard() {
    if (!currentStudyDeck || !currentStudyCards || currentStudyCards.length === 0) return;

    const card = currentStudyCards[currentCardIndex];
    if (!card) return;

    const activeCard = document.getElementById('activeFlashcard');
    const cardFront = document.getElementById('cardFront');
    const cardBack = document.getElementById('cardBack');
    const cardProgress = document.getElementById('cardProgress');
    const shuffleBtn = document.getElementById('shuffleDeckBtn');

    if (_flashcardResetRaf !== null) {
      cancelAnimationFrame(_flashcardResetRaf);
      _flashcardResetRaf = null;
    }

    // Snap card face-up with transitions disabled BEFORE swapping text so the next card's answer never flashes
    if (activeCard) {
      activeCard.classList.add('no-transition');
      activeCard.classList.remove('flipped');
    }

    if (cardFront) cardFront.textContent = card.front || 'Empty Question';
    if (cardBack) cardBack.textContent = card.back || 'Empty Answer';
    if (cardProgress) {
      cardProgress.textContent = `${currentCardIndex + 1} / ${currentStudyCards.length}${isStudyShuffled ? ' · Shuffled' : ''}`;
    }
    if (shuffleBtn) {
      shuffleBtn.disabled = currentStudyCards.length < 2;
      shuffleBtn.classList.toggle('active', isStudyShuffled);
    }

    if (activeCard) {
      void activeCard.offsetWidth;
      _flashcardResetRaf = requestAnimationFrame(() => {
        _flashcardResetRaf = requestAnimationFrame(() => {
          activeCard.classList.remove('no-transition');
          _flashcardResetRaf = null;
        });
      });
    }
  }

  function flipCard() {
    const card = document.getElementById('activeFlashcard');
    if (card) {
      card.classList.remove('no-transition');
      card.classList.toggle('flipped');
    }
  }

  function nextCard() {
    if (currentStudyDeck && currentStudyCards.length > 0) {
      currentCardIndex = (currentCardIndex + 1) % currentStudyCards.length;
      showCurrentCard();
    }
  }

  function prevCard() {
    if (currentStudyDeck && currentStudyCards.length > 0) {
      currentCardIndex = (currentCardIndex - 1 + currentStudyCards.length) % currentStudyCards.length;
      showCurrentCard();
    }
  }

  function closeStudyModal() {
    if (window.EnhancedFlashcards && typeof window.EnhancedFlashcards.closeStudy === 'function') {
      window.EnhancedFlashcards.closeStudy();
      return;
    }
    const modal = document.getElementById('studyModal');
    if (modal) modal.classList.remove('active');
    const activeCard = document.getElementById('activeFlashcard');
    if (activeCard) {
      activeCard.classList.add('no-transition');
      activeCard.classList.remove('flipped');
      void activeCard.offsetWidth;
      activeCard.classList.remove('no-transition');
    }
    currentStudyDeck = null;
    currentStudyCards = [];
    isStudyShuffled = false;
    currentCardIndex = 0;
  }

  // ================================================================
  // STUDY SESSIONS SYSTEM
  // ================================================================
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
    if (!subject || !date) { showNotification('Subject and date are required', 'error'); return; }

    const session = { id: Date.now().toString(), subject, date, time: time || '09:00' };
    studySessions.push(session);
    scheduleSessionNotification(session);
    saveStudySessions();
    renderCalendar();
    renderSessions();
    document.getElementById('sessionModal')?.classList.remove('active');
    showNotification('Session added!', 'success');
  }

  function scheduleSessionNotification(session) {
    const sessionDateTime = new Date(`${session.date}T${session.time}`);
    const now = new Date();
    if (sessionDateTime > now) {
      setTimeout(() => {
        if (typeof window.playAlarmSound === 'function') window.playAlarmSound();
        showNotification(`📚 Time for: ${session.subject}`, 'info');
        if ('Notification' in window && Notification.permission === 'granted') {
          new Notification('Questionary - Study Session', { body: `Time for: ${session.subject}`, icon: 'assets/logo.png' });
        }
      }, sessionDateTime - now);
    }
  }

  function deleteSession(sessionId) {
    showConfirmModal('Delete Session', 'Are you sure?', () => {
      studySessions = studySessions.filter(s => s.id !== sessionId);
      saveStudySessions();
      renderCalendar();
      renderSessions();
      showNotification('Session deleted', 'info');
    });
  }

  function showDaySessions(dateStr) {
    const sessionsOnDay = studySessions.filter(s => s.date === dateStr);
    if (sessionsOnDay.length === 0) showNotification(`No sessions on ${dateStr}`, 'info');
    else showInfoDialog(sessionsOnDay.map(s => `• ${s.subject} at ${s.time}`).join('\n'), { title: `Sessions on ${dateStr}`, type: 'info' });
  }

  function loadStudyStats() { studyStats = JSON.parse(localStorage.getItem('questionary-study-stats') || '{"totalTime":0,"streak":0,"lastStudyDate":null,"hourlyActivity":{}}'); }
  function loadDocumentProgress() { documentProgress = JSON.parse(localStorage.getItem('questionary-doc-progress') || '{}'); }

  // Export to global scope
  window.renderNotes = renderNotes;
  window.renderFlashcardDecks = renderFlashcardDecks;
  window.openNoteModal = openNoteModal;
  window.saveNote = saveNote;
  window.deleteNote = deleteNote;
  window.editNote = editNote;
  window.openFlashcardModal = openFlashcardModal;
  window.addCardEditor = addCardEditor;
  window.saveDeck = saveDeck;
  window.deleteDeck = deleteDeck;
  window.startStudyDeck = startStudyDeck;
  window.shuffleStudyDeck = shuffleStudyDeck;
  window.flipCard = flipCard;
  window.nextCard = nextCard;
  window.prevCard = prevCard;
  window.closeStudyModal = closeStudyModal;
  window.openSessionModal = openSessionModal;
  window.saveSession = saveSession;
  window.deleteSession = deleteSession;
  window.showDaySessions = showDaySessions;

  // ================================================================
  // MOBILE BOTTOM NAVIGATION (CUSTOMIZABLE 5 TABS) & DRAWER
  // ================================================================
  const MOBILE_NAV_STORAGE_KEY = 'questionary-mobile-nav-tabs';
  const DEFAULT_MOBILE_NAV_TABS = ['home', 'favorites', 'recent', 'planner', 'more'];
  const MOBILE_NAV_OPTIONS = [
    { id: 'home', label: 'Home', selectLabel: 'Home (Documents)', icon: 'fas fa-home', navId: 'homeNav' },
    { id: 'favorites', label: 'Favorites', selectLabel: 'Favorites', icon: 'fas fa-star', navId: 'favoritesNav' },
    { id: 'recent', label: 'Recent', selectLabel: 'Recent Papers', icon: 'fas fa-history', navId: 'recentNav' },
    { id: 'planner', label: 'Planner', selectLabel: 'Study Planner', icon: 'fas fa-calendar-alt', navId: 'studyPlannerNav' },
    { id: 'flashcards', label: 'Cards', selectLabel: 'Flashcards', icon: 'fas fa-layer-group', navId: 'flashcardsNav' },
    { id: 'notes', label: 'Notes', selectLabel: 'Notes', icon: 'fas fa-sticky-note', navId: 'notesNav' },
    { id: 'tags', label: 'Tags', selectLabel: 'Tags', icon: 'fas fa-tags', navId: 'tagsNav' },
    { id: 'progress', label: 'Progress', selectLabel: 'Progress', icon: 'fas fa-chart-line', navId: 'progressNav' },
    { id: 'analytics', label: 'Analytics', selectLabel: 'Analytics', icon: 'fas fa-chart-bar', navId: 'analyticsNav' },
    { id: 'reminders', label: 'Alerts', selectLabel: 'Reminders', icon: 'fas fa-bell', navId: 'remindersNav' },
    { id: 'studyRoom', label: 'Study', selectLabel: 'Study Room', icon: 'fas fa-users', navId: 'studyRoomNav' },
    { id: 'settings', label: 'Settings', selectLabel: 'Settings', icon: 'fas fa-cog', navId: 'settingsNav' },
    { id: 'more', label: 'More', selectLabel: 'More (Menu Drawer)', icon: 'fas fa-ellipsis-h', navId: null }
  ];

  function getMobileNavOption(tabId) {
    return MOBILE_NAV_OPTIONS.find(opt => opt.id === tabId) || null;
  }

  function normalizeMobileNavTabs(rawTabs) {
    const validIds = new Set(MOBILE_NAV_OPTIONS.map(o => o.id));
    const unique = [];
    if (Array.isArray(rawTabs)) {
      for (const id of rawTabs) {
        if (typeof id === 'string' && validIds.has(id) && !unique.includes(id)) {
          unique.push(id);
        }
        if (unique.length >= 5) break;
      }
    }
    for (const defId of DEFAULT_MOBILE_NAV_TABS) {
      if (unique.length >= 5) break;
      if (!unique.includes(defId)) unique.push(defId);
    }
    for (const opt of MOBILE_NAV_OPTIONS) {
      if (unique.length >= 5) break;
      if (!unique.includes(opt.id)) unique.push(opt.id);
    }
    return unique.slice(0, 5);
  }

  function getMobileBottomNavTabs() {
    try {
      const saved = JSON.parse(localStorage.getItem(MOBILE_NAV_STORAGE_KEY) || 'null');
      return normalizeMobileNavTabs(saved);
    } catch (e) {
      return DEFAULT_MOBILE_NAV_TABS.slice();
    }
  }

  function saveMobileBottomNavTabs(tabs) {
    const normalized = normalizeMobileNavTabs(tabs);
    try {
      localStorage.setItem(MOBILE_NAV_STORAGE_KEY, JSON.stringify(normalized));
    } catch (e) {}
    renderMobileBottomNav();
    updateMobileBottomNavActive(currentView || 'home');
    renderMobileBottomNavSettings();
    return normalized;
  }

  function renderMobileBottomNav() {
    const bottomNav = document.getElementById('mobileBottomNav');
    if (!bottomNav) return;
    const tabs = getMobileBottomNavTabs();
    const activeView = currentView || 'home';

    bottomNav.innerHTML = tabs.map((tabId, idx) => {
      const opt = getMobileNavOption(tabId) || MOBILE_NAV_OPTIONS[0];
      const isActive = opt.id === activeView;
      return `
        <button type="button" class="mobile-bottom-nav-item ${isActive ? 'active' : ''}" data-view="${escapeHtml(opt.id)}" data-slot="${idx}">
          <i class="${escapeHtml(opt.icon)}"></i>
          <span>${escapeHtml(opt.label)}</span>
        </button>
      `;
    }).join('');
  }

  function renderMobileBottomNavSettings() {
    const container = document.getElementById('mobileBottomNavSettingsPanel');
    if (!container) return;

    const currentTabs = getMobileBottomNavTabs();
    const previewHtml = currentTabs.map((tabId) => {
      const opt = getMobileNavOption(tabId) || MOBILE_NAV_OPTIONS[0];
      return `
        <div class="mobile-nav-preview-chip" title="${escapeHtml(opt.selectLabel)}">
          <i class="${escapeHtml(opt.icon)}"></i>
          <span>${escapeHtml(opt.label)}</span>
        </div>
      `;
    }).join('');

    const slotsHtml = currentTabs.map((selectedId, slotIdx) => {
      const currentOpt = getMobileNavOption(selectedId) || MOBILE_NAV_OPTIONS[0];
      const optionsHtml = MOBILE_NAV_OPTIONS.map((opt) => `
        <option value="${escapeHtml(opt.id)}" ${opt.id === selectedId ? 'selected' : ''}>${escapeHtml(opt.selectLabel)}</option>
      `).join('');
      return `
        <div class="mobile-nav-slot-row">
          <label class="mobile-nav-slot-label" for="mobileNavSlotSelect_${slotIdx}">
            <i class="${escapeHtml(currentOpt.icon)}"></i>
            <span>Tab ${slotIdx + 1}</span>
          </label>
          <select id="mobileNavSlotSelect_${slotIdx}" class="form-input mobile-nav-slot-select" data-slot-idx="${slotIdx}">
            ${optionsHtml}
          </select>
        </div>
      `;
    }).join('');

    container.innerHTML = `
      <div class="mobile-nav-preview-bar" aria-label="Mobile Bottom Bar Preview">
        ${previewHtml}
      </div>
      <div class="mobile-nav-slots-grid">
        ${slotsHtml}
      </div>
      <div class="mobile-nav-settings-footer">
        <span class="settings-hint" style="margin: 0; font-size: 0.76rem;">Changes apply immediately. Picking a tab already in another slot swaps them.</span>
        <button type="button" class="btn btn-sm btn-secondary" id="resetMobileBottomNavBtn">
          <i class="fas fa-undo"></i> Reset Default
        </button>
      </div>
    `;

    container.querySelectorAll('.mobile-nav-slot-select').forEach((sel) => {
      sel.addEventListener('change', () => {
        const slotIdx = parseInt(sel.dataset.slotIdx, 10);
        const chosenId = sel.value;
        const nextTabs = getMobileBottomNavTabs();
        const existingIdx = nextTabs.indexOf(chosenId);
        if (existingIdx !== -1 && existingIdx !== slotIdx) {
          nextTabs[existingIdx] = nextTabs[slotIdx];
        }
        nextTabs[slotIdx] = chosenId;
        saveMobileBottomNavTabs(nextTabs);
        if (typeof showNotification === 'function') {
          const opt = getMobileNavOption(chosenId);
          showNotification(`Bottom bar Tab ${slotIdx + 1} set to ${opt ? opt.label : chosenId}`, 'success');
        }
      });
    });

    const resetBtn = document.getElementById('resetMobileBottomNavBtn');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        saveMobileBottomNavTabs(DEFAULT_MOBILE_NAV_TABS);
        if (typeof showNotification === 'function') {
          showNotification('Mobile bottom bar restored to default 5 tabs', 'info');
        }
      });
    }
  }

  function initializeMobileBottomNav() {
    const bottomNav = document.getElementById('mobileBottomNav');
    renderMobileBottomNav();
    renderMobileBottomNavSettings();
    if (!bottomNav || bottomNav.dataset.bound === 'true') return;
    bottomNav.dataset.bound = 'true';

    bottomNav.addEventListener('click', (e) => {
      const item = e.target.closest('.mobile-bottom-nav-item');
      if (!item) return;

      const view = item.dataset.view;
      if (view === 'more') {
        const navLinks = document.getElementById('navLinks');
        const sidebarOverlay = document.getElementById('sidebarOverlay');
        if (navLinks) {
          const isOpen = navLinks.classList.toggle('sidebar-open');
          sidebarOverlay?.classList.toggle('active', isOpen);
          document.body.classList.toggle('mobile-sidebar-open', isOpen);
        }
      } else {
        closeSidebar();
        showView(view);
        const opt = getMobileNavOption(view);
        if (opt && opt.navId) setActiveNav(opt.navId);
      }
      updateMobileBottomNavActive(view);
    });
  }

  function updateMobileBottomNavActive(viewName) {
    document.querySelectorAll('.mobile-bottom-nav-item').forEach(item => {
      if (item.dataset.view === viewName) {
        item.classList.add('active');
      } else if (viewName !== 'more') {
        item.classList.remove('active');
      }
    });
  }

  function closeSidebar() {
    document.getElementById('navLinks')?.classList.remove('sidebar-open');
    document.getElementById('sidebarOverlay')?.classList.remove('active');
    document.body.classList.remove('mobile-sidebar-open');
  }

  function initHamburgerMenu() {
    const hamburgerBtn = document.getElementById('hamburgerMenu');
    const mobileMenuToggle = document.getElementById('mobileMenuToggle');
    const navLinks = document.getElementById('navLinks');
    const sidebarOverlay = document.getElementById('sidebarOverlay');
    const sidebarClose = document.getElementById('sidebarClose');
    const headerLeft = document.getElementById('headerLeft');
    const appRoot = document.getElementById('app');

    if (!navLinks) return;

    // Move #navLinks out of sticky <header> on mobile so it isn't trapped behind #sidebarOverlay (stacking context fix)
    const mq = window.matchMedia('(max-width: 768px)');
    const syncNavDrawerPlacement = () => {
      if (mq.matches) {
        if (appRoot && navLinks.parentElement !== appRoot) {
          if (sidebarOverlay && sidebarOverlay.parentElement === appRoot) {
            appRoot.insertBefore(navLinks, sidebarOverlay.nextSibling);
          } else {
            appRoot.appendChild(navLinks);
          }
        }
      } else {
        closeSidebar();
        if (headerLeft && navLinks.parentElement !== headerLeft) {
          headerLeft.appendChild(navLinks);
        }
      }
    };
    syncNavDrawerPlacement();
    if (!navLinks.dataset.placementBound) {
      navLinks.dataset.placementBound = 'true';
      if (typeof mq.addEventListener === 'function') {
        mq.addEventListener('change', syncNavDrawerPlacement);
      } else if (typeof mq.addListener === 'function') {
        mq.addListener(syncNavDrawerPlacement);
      }
      document.addEventListener('keydown', (ev) => {
        if (ev.key === 'Escape' && navLinks.classList.contains('sidebar-open')) {
          closeSidebar();
        }
      });
    }

    closeSidebar();

    const toggleSidebar = (e) => {
      if (e) e.stopPropagation();
      syncNavDrawerPlacement();
      const isOpen = navLinks.classList.toggle('sidebar-open');
      if (sidebarOverlay) sidebarOverlay.classList.toggle('active', isOpen);
      document.body.classList.toggle('mobile-sidebar-open', isOpen);
    };

    if (hamburgerBtn) hamburgerBtn.onclick = toggleSidebar;
    if (mobileMenuToggle) mobileMenuToggle.onclick = toggleSidebar;
    if (sidebarClose) sidebarClose.onclick = closeSidebar;
    if (sidebarOverlay) sidebarOverlay.onclick = closeSidebar;

    if (!navLinks.dataset.linkCloseBound) {
      navLinks.dataset.linkCloseBound = 'true';
      navLinks.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', () => {
          closeSidebar();
        });
      });
    }
  }

  async function initializeApp() {
    console.log('[App] Starting initialization...');
    preventAccidentalSelection();

    let loginHandled = false;
    const safeCheckSavedLogin = () => {
      if (loginHandled) return;
      loginHandled = true;
      checkSavedLogin();
    };

    const overlayTimeout = setTimeout(() => {
      const loadingOverlay = document.getElementById('loadingOverlay');
      if (loadingOverlay && loadingOverlay.classList.contains('active')) {
        console.warn('[App] Fail-safe timer triggered: Force removing stuck loading overlay.');
        loadingOverlay.classList.remove('active');
        safeCheckSavedLogin();
      }
    }, 4000);

    await initializeFavorites();
    await DbService.init();

    initializeMobileBottomNav();
    applyAccessibilitySettings();

    if (typeof initializeNewFeatures === 'function') {
      initializeNewFeatures();
    }

    const themeToggle = document.getElementById('themeToggle');
    let savedTheme = localStorage.getItem('theme');
    if (!savedTheme) {
      if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
        savedTheme = 'dark';
      } else {
        savedTheme = 'light';
      }
    }
    document.documentElement.setAttribute('data-theme', savedTheme);
    updateThemeIcon(savedTheme);

    if (window.matchMedia) {
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
        if (!localStorage.getItem('theme')) {
          const newTheme = e.matches ? 'dark' : 'light';
          document.documentElement.setAttribute('data-theme', newTheme);
          updateThemeIcon(newTheme);
        }
      });
    }

    if (themeToggle) {
      themeToggle.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (typeof window.toggleTheme === 'function') {
          window.toggleTheme();
        } else {
          const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
          const newTheme = currentTheme === 'light' ? 'dark' : 'light';
          if (typeof window.setTheme === 'function') {
            window.setTheme(newTheme);
          } else {
            document.documentElement.setAttribute('data-theme', newTheme);
            localStorage.setItem('theme', newTheme);
            localStorage.setItem('questionary-theme', newTheme);
            updateThemeIcon(newTheme);
          }
        }
      };
    }

    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
      loginForm.addEventListener('submit', handleLogin);
    }

    clearTimeout(overlayTimeout);
    safeCheckSavedLogin();

    document.addEventListener('click', e => {
      e.target.closest('.btn') && createRipple(e);
    });
    initializeNavigation();
    initializeGlobalSearch();
    initializeAccessibility();
    initializeViewControls();
    initializeKeyboardNavigation();
    loadDocuments();
    trackDailyAccess();

    await restoreLastLocation();

    if (window.contentUpdateSystem && typeof window.contentUpdateSystem.init === 'function') {
      window.contentUpdateSystem.init();
    }

    window.addEventListener('beforeunload', () => {
      saveUserPreferences();
    });
    setInterval(saveUserPreferences, 30000);
    window.addEventListener('error', e => {
      console.error('Application error:', e.error);
    });

    window.renderTiles = renderTiles;
    window.getCurrentDocumentsLevel = getCurrentDocumentsLevel;

    if (typeof window.loadCustomDocuments === 'function') {
      window.loadCustomDocuments();
    }

    if (currentView === 'home') {
      const nodes = await DbService.getChildren(path);
      renderTilesFromDb(nodes);
    }

    console.log('Questionary application initialized successfully');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeApp);
  } else {
    initializeApp();
  }

  function updateThemeIcon(theme) {
    const themeIcon = document.getElementById('themeIcon');
    if (!themeIcon) return;
    if (theme === 'dark') {
      themeIcon.className = 'fas fa-sun';
    } else {
      themeIcon.className = 'fas fa-moon';
    }
  }

  function handleLogin(e) {
    if (e) e.preventDefault();
    const usernameEl = document.getElementById('username');
    const passwordEl = document.getElementById('password');
    const rememberMeEl = document.getElementById('rememberMe');

    if (!usernameEl || !passwordEl) {
      showNotification('Login form elements not found', 'error');
      return;
    }

    const username = usernameEl.value.trim();
    const password = passwordEl.value;
    const rememberMe = rememberMeEl ? rememberMeEl.checked : false;

    if (!username || !password) {
      showNotification('Please enter both username and password', 'warning');
      return;
    }

    if (users[username] && users[username].password === password) {
      currentUser = { username, role: users[username].role };
      if (rememberMe) {
        localStorage.setItem('revamp-dpsnt-remember', JSON.stringify({ username, role: users[username].role }));
      }
      sessionStorage.setItem('revamp-dpsnt-session', JSON.stringify({ username, role: users[username].role }));

      showNotification(`Welcome, ${username}!`, 'success');

      setTimeout(() => {
        showApp();
        initializeAppAfterLogin();
      }, 500);
    } else {
      showNotification('Invalid username or password', 'error');
    }
  }

  function checkSavedLogin() {
    const loadingOverlay = document.getElementById('loadingOverlay');

    const savedLogin = localStorage.getItem('revamp-dpsnt-remember');
    if (savedLogin) {
      try {
        currentUser = JSON.parse(savedLogin);
        showApp();
        initializeAppAfterLogin();
        setTimeout(() => showAutoLoginNotification(currentUser.username), 300);
        return true;
      } catch (e) {
        localStorage.removeItem('revamp-dpsnt-remember');
      }
    }

    const previousLogin = sessionStorage.getItem('revamp-dpsnt-session');
    if (previousLogin) {
      try {
        currentUser = JSON.parse(previousLogin);
        showApp();
        initializeAppAfterLogin();
        return true;
      } catch (e) {
        sessionStorage.removeItem('revamp-dpsnt-session');
      }
    }

    if (loadingOverlay) loadingOverlay.classList.remove('active');
    return false;
  }

  function initializeNavigation() {
    const homeNav = document.getElementById('homeNav');
    const favoritesNav = document.getElementById('favoritesNav');
    const recentNav = document.getElementById('recentNav');
    const analyticsNav = document.getElementById('analyticsNav');
    const studyPlannerNav = document.getElementById('studyPlannerNav');
    const flashcardsNav = document.getElementById('flashcardsNav');
    const notesNav = document.getElementById('notesNav');
    const progressNav = document.getElementById('progressNav');
    const remindersNav = document.getElementById('remindersNav');
    const settingsNav = document.getElementById('settingsNav');
    const backBtn = document.getElementById('backBtn');

    if (backBtn) backBtn.addEventListener('click', handleBackButton);

    const closeMenuOnClick = () => {
      closeSidebar();
    };

    homeNav && homeNav.addEventListener('click', async () => {
      showView('home');
      path = [];
      await navigateToPath([]);
      setActiveNav('homeNav');
      closeMenuOnClick();
    });

    favoritesNav && favoritesNav.addEventListener('click', () => {
      showView('favorites');
      setActiveNav('favoritesNav');
      closeMenuOnClick();
    });

    recentNav && recentNav.addEventListener('click', () => {
      showView('recent');
      setActiveNav('recentNav');
      closeMenuOnClick();
    });

    analyticsNav && analyticsNav.addEventListener('click', () => {
      showView('analytics');
      setActiveNav('analyticsNav');
      closeMenuOnClick();
    });

    studyPlannerNav && studyPlannerNav.addEventListener('click', () => {
      showView('planner');
      setActiveNav('studyPlannerNav');
      closeMenuOnClick();
    });

    flashcardsNav && flashcardsNav.addEventListener('click', () => {
      showView('flashcards');
      setActiveNav('flashcardsNav');
      closeMenuOnClick();
    });

    notesNav && notesNav.addEventListener('click', () => {
      showView('notes');
      setActiveNav('notesNav');
      closeMenuOnClick();
      if (typeof renderVoiceNotesGrid === 'function') renderVoiceNotesGrid();
    });

    const tagsNav = document.getElementById('tagsNav');
    tagsNav && tagsNav.addEventListener('click', () => {
      showView('tags');
      setActiveNav('tagsNav');
      closeMenuOnClick();
      if (typeof renderTagsMain === 'function') renderTagsMain();
      if (typeof renderTaggedItems === 'function') renderTaggedItems();
    });

    progressNav && progressNav.addEventListener('click', () => {
      showView('progress');
      setActiveNav('progressNav');
      closeMenuOnClick();
    });

    remindersNav && remindersNav.addEventListener('click', () => {
      showView('reminders');
      setActiveNav('remindersNav');
      closeMenuOnClick();
    });

    const studyRoomNav = document.getElementById('studyRoomNav');
    studyRoomNav && studyRoomNav.addEventListener('click', () => {
      showView('studyRoom');
      setActiveNav('studyRoomNav');
      closeMenuOnClick();
    });

    settingsNav && settingsNav.addEventListener('click', () => {
      showView('settings');
      setActiveNav('settingsNav');
      closeMenuOnClick();
    });
  }

  function initializeGlobalSearch() {
    const searchInput = document.getElementById('globalSearch');
    const searchResults = document.getElementById('searchResults');
    const headerEl = document.querySelector('.header');
    const mobileSearchToggle = document.getElementById('mobileSearchToggle');
    const mobileSearchClose = document.getElementById('mobileSearchClose');

    initSearchHistory();

    const closeMobileSearch = () => {
      if (headerEl) headerEl.classList.remove('mobile-search-open');
      if (searchResults) searchResults.style.display = 'none';
      const historyDropdown = document.getElementById('searchHistoryDropdown');
      if (historyDropdown) historyDropdown.classList.remove('active');
    };

    if (mobileSearchToggle && !mobileSearchToggle.dataset.bound) {
      mobileSearchToggle.dataset.bound = 'true';
      mobileSearchToggle.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (typeof window.closeUserDropdown === 'function') window.closeUserDropdown();
        if (headerEl) headerEl.classList.add('mobile-search-open');
        if (searchInput) {
          requestAnimationFrame(() => searchInput.focus());
          if (searchInput.value.trim()) performSearch();
          else showSearchHistory();
        }
      });
    }

    if (mobileSearchClose && !mobileSearchClose.dataset.bound) {
      mobileSearchClose.dataset.bound = 'true';
      mobileSearchClose.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (searchInput) {
          searchInput.value = '';
          searchInput.blur();
        }
        closeMobileSearch();
      });
    }

    const searchSortSelect = document.getElementById('searchResultsSort');
    if (searchSortSelect && !searchSortSelect.dataset.bound) {
      searchSortSelect.dataset.bound = 'true';
      searchSortSelect.value = _currentSearchSort;
      searchSortSelect.addEventListener('change', (e) => {
        _currentSearchSort = e.target.value || 'relevance';
        localStorage.setItem('questionary-search-sort', _currentSearchSort);
        if (_lastSearchQuery.length >= 2) {
          renderSearchResults();
        }
      });
    }

    const closeSearchResultsBtn = document.getElementById('closeSearchResultsBtn');
    if (closeSearchResultsBtn && !closeSearchResultsBtn.dataset.bound) {
      closeSearchResultsBtn.dataset.bound = 'true';
      closeSearchResultsBtn.addEventListener('click', () => {
        if (searchResults) searchResults.style.display = 'none';
      });
    }

    searchInput && searchInput.addEventListener('input', performSearch);
    searchInput && searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const q = searchInput.value.trim();
        if (q.length >= 2) {
          clearTimeout(_searchHistoryTimer);
          addToSearchHistory(q);
          performSearch(q);
        }
      }
    });
    searchInput && searchInput.addEventListener('focus', () => {
      if (window.innerWidth <= 768 && headerEl) headerEl.classList.add('mobile-search-open');
      if (searchInput.value.trim()) performSearch(searchInput.value);
      else showSearchHistory();
    });

    document.addEventListener('click', (e) => {
      if (!e.target.closest('.search-container') && !e.target.closest('#mobileSearchToggle') && !e.target.closest('#searchResults')) {
        if (searchResults) searchResults.style.display = 'none';
        const historyDropdown = document.getElementById('searchHistoryDropdown');
        if (historyDropdown) historyDropdown.classList.remove('active');
        if (window.innerWidth <= 768 && headerEl?.classList.contains('mobile-search-open')) {
          if (!searchInput || !searchInput.value.trim()) {
            closeMobileSearch();
          }
        }
      }
    });
  }

  function initializeAccessibility() {
    setupAccessibilityToggle('highContrastToggle', 'highContrast', 'high-contrast');
    setupAccessibilityToggle('largeTextToggle', 'largeText', 'large-text');
    setupAccessibilityToggle('reducedMotionToggle', 'reducedMotion', 'reduced-motion');
    setupAccessibilityToggle('enhancedFocusToggle', 'enhancedFocus', 'enhanced-focus');
    applyAccessibilitySettings();
    updateAccessibilityToggleStates();
  }

  function setupAccessibilityToggle(toggleId, settingKey, className) {
    const toggle = document.getElementById(toggleId);
    if (!toggle) return;
    const switchEl = toggle.querySelector('.accessibility-switch');

    if (accessibilitySettings[settingKey]) {
      toggle.classList.add('active');
      if (switchEl) switchEl.classList.add('active');
    }

    toggle.addEventListener('click', (e) => {
      e.stopPropagation();
      accessibilitySettings[settingKey] = !accessibilitySettings[settingKey];
      const storageKey = 'accessibility-' + settingKey.replace(/([A-Z])/g, '-$1').toLowerCase();
      localStorage.setItem(storageKey, accessibilitySettings[settingKey]);
      toggle.classList.toggle('active', accessibilitySettings[settingKey]);
      if (switchEl) switchEl.classList.toggle('active', accessibilitySettings[settingKey]);
      document.body.classList.toggle(className, accessibilitySettings[settingKey]);
    });
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
      if (toggle && accessibilitySettings[key]) toggle.classList.add('active');
    });
  }

  function initializeKeyboardNavigation() {
    document.addEventListener('keydown', async (e) => {
      const isInputFocused = e.target.closest('input, textarea, [contenteditable]');

      if (e.key === 'Escape') {
        const userDropdown = document.getElementById('userDropdownMenu');
        const userBadge = document.getElementById('userBadge') || document.querySelector('.user-badge');
        if (userDropdown?.classList.contains('active') || userBadge?.classList.contains('active')) {
          if (typeof window.closeUserDropdown === 'function') window.closeUserDropdown();
          return;
        }

        const headerEl = document.querySelector('.header');
        if (headerEl?.classList.contains('mobile-search-open')) {
          headerEl.classList.remove('mobile-search-open');
          const searchInput = document.getElementById('globalSearch');
          if (searchInput) searchInput.blur();
          const sr = document.getElementById('searchResults');
          if (sr) sr.style.display = 'none';
          return;
        }

        const historyDropdown = document.getElementById('searchHistoryDropdown');
        if (historyDropdown && historyDropdown.classList.contains('active')) {
          historyDropdown.classList.remove('active');
          return;
        }

        const searchResults = document.getElementById('searchResults');
        if (searchResults && searchResults.style.display !== 'none') {
          searchResults.style.display = 'none';
          return;
        }

        const accessibilityPanel = document.getElementById('accessibilityPanel');
        if (accessibilityPanel && accessibilityPanel.classList.contains('active')) {
          accessibilityPanel.classList.remove('active');
          return;
        }

        const noteModal = document.getElementById('noteModal');
        if (noteModal && noteModal.classList.contains('active')) {
          if (window.EnhancedNotes?.closeEditor) window.EnhancedNotes.closeEditor();
          else noteModal.classList.remove('active');
          return;
        }

        const flashcardModal = document.getElementById('flashcardModal');
        if (flashcardModal && flashcardModal.classList.contains('active')) {
          if (window.EnhancedFlashcards?.closeEditor) window.EnhancedFlashcards.closeEditor();
          else flashcardModal.classList.remove('active');
          return;
        }

        const quizModal = document.getElementById('quizModal');
        if (quizModal && quizModal.classList.contains('active')) {
          if (window.EnhancedFlashcards?.closeQuiz) window.EnhancedFlashcards.closeQuiz();
          else quizModal.classList.remove('active');
          return;
        }

        const studyModal = document.getElementById('studyModal');
        if (studyModal && studyModal.classList.contains('active')) {
          closeStudyModal();
          return;
        }

        const pdfViewerContainer = document.getElementById('pdfViewerContainer');
        if (pdfViewerContainer && pdfViewerContainer.style.display !== 'none') {
          closePDF();
          return;
        }

        if (path.length > 0) {
          await handleBackButton();
          return;
        }

        if (currentView !== 'home') {
          showView('home');
          path = [];
          await navigateToPath([]);
          setActiveNav('homeNav');
          return;
        }
      }

      const activeStudyModal = document.getElementById('studyModal');
      if (!isInputFocused && activeStudyModal && activeStudyModal.classList.contains('active') && currentStudyDeck) {
        if (e.code === 'Space') {
          e.preventDefault();
          flipCard();
          return;
        }
        if (e.key === 'ArrowRight') {
          e.preventDefault();
          nextCard();
          return;
        }
        if (e.key === 'ArrowLeft') {
          e.preventDefault();
          prevCard();
          return;
        }
        if (e.key === 's' || e.key === 'S') {
          e.preventDefault();
          shuffleStudyDeck();
          return;
        }
      }

      if (!isInputFocused && keybindMatches(e, 'focusSearch')) {
        e.preventDefault();
        if (window.innerWidth <= 768) {
          document.querySelector('.header')?.classList.add('mobile-search-open');
        }
        document.getElementById('globalSearch')?.focus();
      }

      if (!isInputFocused && keybindMatches(e, 'goBack') && path.length > 0) {
        await handleBackButton();
      }

      if (!isInputFocused && keybindMatches(e, 'navBack')) {
        e.preventDefault();
        const pdfViewerContainer = document.getElementById('pdfViewerContainer');
        if (pdfViewerContainer && pdfViewerContainer.style.display !== 'none') {
          closePDF();
        } else if (path.length > 0) {
          await handleBackButton();
        } else if (currentView !== 'home') {
          showView('home');
          path = [];
          await navigateToPath([]);
          setActiveNav('homeNav');
        }
      }

      if (!isInputFocused && keybindMatches(e, 'goHome')) {
        e.preventDefault();
        const pdfViewerContainer = document.getElementById('pdfViewerContainer');
        if (pdfViewerContainer) {
          pdfViewerContainer.style.display = 'none';
          const pdfViewer = document.getElementById('pdfViewer');
          if (pdfViewer) { pdfViewer.classList.remove('active'); pdfViewer.src = ''; }
        }
        hideTimerCompletely();
        showView('home');
        path = [];
        await navigateToPath([]);
        setActiveNav('homeNav');
      }
    });
  }

  function showHomeTagsPanels() {
    const homeTagsSection = document.getElementById('homeTagsSection');
    const homeTaggedItemsSection = document.getElementById('homeTaggedItemsSection');
    if (homeTagsSection) {
      homeTagsSection.style.display = 'block';
      renderHomeTagsList();
    }
    if (homeTaggedItemsSection) {
      homeTaggedItemsSection.style.display = 'block';
      renderHomeTaggedItemsList();
    }
  }

  function hideHomeTagsPanels() {
    const homeTagsSection = document.getElementById('homeTagsSection');
    const homeTaggedItemsSection = document.getElementById('homeTaggedItemsSection');
    if (homeTagsSection) homeTagsSection.style.display = 'none';
    if (homeTaggedItemsSection) homeTaggedItemsSection.style.display = 'none';
  }

  function renderHomeTagsList() {
    const container = document.getElementById('homeTagsList');
    if (!container) return;
    const tags = JSON.parse(localStorage.getItem('questionary-tags') || '[]');
    const itemTags = JSON.parse(localStorage.getItem('questionary-item-tags') || '{}');

    if (tags.length === 0) {
      container.innerHTML = '<span class="empty-hint">No tags created yet</span>';
      return;
    }

    container.innerHTML = tags.map(tag => {
      const count = Object.values(itemTags).filter(arr => arr.includes(tag.id)).length;
      const safeColor = isSafeHexColor(tag.color, '#3b82f6');
      return `<span class="home-tag-chip" data-tag-id="${escapeHtml(tag.id)}" style="display: inline-flex; align-items: center; gap: 4px; padding: 8px 14px; border-radius: 20px; font-size: 13px; font-weight: 600; cursor: pointer; box-shadow: 0 2px 4px rgba(0,0,0,0.15); background: ${safeColor}; color: white;">${escapeHtml(tag.name)} <small style="opacity: 0.85;">(${count})</small></span>`;
    }).join('');

    container.querySelectorAll('.home-tag-chip').forEach(chip => {
      chip.addEventListener('click', () => filterByTagHome(chip.dataset.tagId));
    });
  }

  function renderHomeTaggedItemsList() {
    const container = document.getElementById('homeTaggedItemsList');
    if (!container) return;

    const tags = JSON.parse(localStorage.getItem('questionary-tags') || '[]');
    const itemTags = JSON.parse(localStorage.getItem('questionary-item-tags') || '{}');

    const items = Object.entries(itemTags)
    .filter(([_, tagIds]) => tagIds.length > 0 && tagIds.some(tid => tags.find(t => t.id === tid)))
    .slice(0, 8);

    if (items.length === 0) {
      container.innerHTML = '<span class="empty-hint">No tagged items yet</span>';
      return;
    }

    container.innerHTML = items.map(([itemId, tagIds]) => {
      const tagBadges = tagIds.slice(0, 2).map(tid => {
        const tag = tags.find(t => t.id === tid);
        const safeColor = isSafeHexColor(tag?.color, '#3b82f6');
        return tag ? `<span class="tag-mini" style="background: ${safeColor}">${escapeHtml(tag.name)}</span>` : '';
      }).join(' ');

      const isFolder = itemId.startsWith('folder_');
      const isDoc = itemId.startsWith('doc_');
      let displayName = itemId;
      let icon = 'fa-file';

      if (isFolder) {
        displayName = itemId.replace('folder_', '').split('/').pop();
        icon = 'fa-folder';
      } else if (isDoc) {
        displayName = itemId.replace('doc_', '').split('/').pop();
        icon = 'fa-file-pdf';
      }

      return `<div class="home-tagged-item" data-item-id="${escapeHtml(itemId)}" style="cursor:pointer;"><span><i class="fas ${icon}" style="color: var(--primary-color); margin-right: 0.4rem;"></i>${escapeHtml(displayName)}</span><span>${tagBadges}</span></div>`;
    }).join('');

    container.querySelectorAll('.home-tagged-item').forEach(el => {
      el.addEventListener('click', () => navigateToTaggedItem(el.dataset.itemId));
    });
  }

  function filterByTagHome(tagId) {
    showView('tags');
    if (typeof window.filterByTag === 'function') {
      window.filterByTag(tagId);
    }
  }

  window.renderHomeTagsList = renderHomeTagsList;
  window.renderHomeTaggedItemsList = renderHomeTaggedItemsList;
  window.showView = showView;

  function showView(viewName) {
    if (!viewName || !VALID_VIEWS.has(viewName)) {
      viewName = 'home';
    }
    currentView = viewName;
    saveUserPreferences();
    updateMobileBottomNavActive(viewName);

    const pdfViewerContainer = document.getElementById('pdfViewerContainer');
    if (pdfViewerContainer && pdfViewerContainer.style.display !== 'none') {
      if (typeof closePDF === 'function') closePDF();
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

    const allSections = [tilesSection, favoritesSection, recentSection, analyticsSection,
    plannerSection, flashcardsSection, notesSection, progressSection,
    remindersSection, settingsSection, tagsSection, importedSection, studyRoomSection];
    allSections.forEach(section => {
      if (section) section.style.display = 'none';
    });
    if (searchResults) searchResults.style.display = 'none';
    if (pdfViewerContainer) pdfViewerContainer.style.display = 'none';
    if (pdfViewer) { pdfViewer.classList.remove('active'); pdfViewer.src = ''; }
    hideHomeTagsPanels();

    switch(viewName) {
      case 'home':
      default:
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
        if (dashboardHeader) dashboardHeader.style.display = 'none';
        if (breadcrumb) breadcrumb.style.display = 'none';
        if (backBtn) backBtn.style.display = 'none';
        renderFavorites();
        break;
      case 'recent':
        if (recentSection) recentSection.style.display = 'block';
        if (dashboardHeader) dashboardHeader.style.display = 'none';
        if (breadcrumb) breadcrumb.style.display = 'none';
        if (backBtn) backBtn.style.display = 'none';
        renderRecent();
        break;
      case 'analytics':
        if (analyticsSection) analyticsSection.style.display = 'block';
        if (dashboardHeader) dashboardHeader.style.display = 'none';
        if (breadcrumb) breadcrumb.style.display = 'none';
        if (backBtn) backBtn.style.display = 'none';
        renderAnalytics();
        break;
      case 'planner':
        if (plannerSection) plannerSection.style.display = 'block';
        if (dashboardHeader) dashboardHeader.style.display = 'none';
        if (breadcrumb) breadcrumb.style.display = 'none';
        if (backBtn) backBtn.style.display = 'none';
        renderCalendar();
        renderSessions();
        break;
      case 'flashcards':
        if (flashcardsSection) flashcardsSection.style.display = 'block';
        if (dashboardHeader) dashboardHeader.style.display = 'none';
        if (breadcrumb) breadcrumb.style.display = 'none';
        if (backBtn) backBtn.style.display = 'none';
        renderFlashcardDecks();
        break;
      case 'notes':
        if (notesSection) notesSection.style.display = 'block';
        if (dashboardHeader) dashboardHeader.style.display = 'none';
        if (breadcrumb) breadcrumb.style.display = 'none';
        if (backBtn) backBtn.style.display = 'none';
        renderNotes();
        break;
      case 'progress':
        if (progressSection) progressSection.style.display = 'block';
        if (dashboardHeader) dashboardHeader.style.display = 'none';
        if (breadcrumb) breadcrumb.style.display = 'none';
        if (backBtn) backBtn.style.display = 'none';
        updateProgressDisplay();
        break;
      case 'reminders':
        if (remindersSection) remindersSection.style.display = 'block';
        if (dashboardHeader) dashboardHeader.style.display = 'none';
        if (breadcrumb) breadcrumb.style.display = 'none';
        if (backBtn) backBtn.style.display = 'none';
        if (typeof window.renderReminders === 'function') window.renderReminders();
        break;
      case 'settings':
        if (settingsSection) settingsSection.style.display = 'block';
        if (dashboardHeader) dashboardHeader.style.display = 'none';
        if (breadcrumb) breadcrumb.style.display = 'none';
        if (backBtn) backBtn.style.display = 'none';
        if (typeof window.renderSettings === 'function') window.renderSettings();
        if (typeof renderMobileBottomNavSettings === 'function') renderMobileBottomNavSettings();
        if (window.DownloadManager && typeof window.DownloadManager.renderSettingsStorageTab === 'function') {
          window.DownloadManager.renderSettingsStorageTab();
        }
        if (window.DownloadManager && typeof window.DownloadManager.runAndRenderPreflight === 'function') {
          window.DownloadManager.runAndRenderPreflight();
        }
        break;
      case 'studyRoom':
        if (studyRoomSection) studyRoomSection.style.display = 'block';
        if (dashboardHeader) dashboardHeader.style.display = 'none';
        if (breadcrumb) breadcrumb.style.display = 'none';
        if (backBtn) backBtn.style.display = 'none';
        if (typeof window.renderStudyRoom === 'function') window.renderStudyRoom();
        break;
      case 'tags':
        if (tagsSection) tagsSection.style.display = 'block';
        if (dashboardHeader) dashboardHeader.style.display = 'none';
        if (breadcrumb) breadcrumb.style.display = 'none';
        if (backBtn) backBtn.style.display = 'none';
        if (typeof window.renderTagsMain === 'function') window.renderTagsMain();
        if (typeof window.renderTaggedItems === 'function') window.renderTaggedItems();
        break;
    }
    if (typeof updateMobileBottomNavActive === 'function') {
      updateMobileBottomNavActive(viewName || 'home');
    }
  }

  function addToRecent(title, docPath, url) {
    if (!url || url === '#') return;
    const recent = JSON.parse(localStorage.getItem('questionary-recent') || '[]');
    const existing = recent.findIndex(r => r.title === title && r.url === url);
    if (existing > -1) recent.splice(existing, 1);
    recent.unshift({ title, path: docPath, url, timestamp: Date.now() });
    const updatedRecent = recent.slice(0, 20);

    saveRecentToStorage(updatedRecent);

    if (docPath && docPath.length > 0) {
      trackSubjectAccess(docPath[0]);
      if (docPath.length > 1) {
        trackSubjectAccess(docPath[1]);
      }
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
        if (fav.url && isSafeDocumentUrl(fav.url)) {
          const parentPath = (Array.isArray(fav.path) ? fav.path : []).slice(0, -1);
          showView('home');
          navigateToPath(parentPath);
          setTimeout(() => {
            if (typeof window.openAnyDocument === 'function') {
              window.openAnyDocument(fav.url, fav.title);
            } else {
              showPDF(fav.url, fav.title);
            }
          }, 100);
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
      container.innerHTML = '<div style="text-align:center;padding:3rem;color:var(--text-secondary);"><i class="fas fa-history" style="font-size:3rem;margin-bottom:1rem;opacity:0.3;"></i><p>No recent documents. Start browsing to see your history here.</p></div>';
      return;
    }
    recent.forEach(doc => {
      const tile = document.createElement('div');
      tile.className = 'tile';
      tile.innerHTML = `<div class="tile-icon"><i class="fas fa-file-pdf"></i></div><div class="tile-text">${escapeHtml(doc.title)}</div>`;
      tile.onclick = () => {
        if (doc.url && isSafeDocumentUrl(doc.url)) {
          const parentPath = (Array.isArray(doc.path) ? doc.path : []).slice(0, -1);
          showView('home');
          navigateToPath(parentPath);
          setTimeout(() => {
            if (typeof window.openAnyDocument === 'function') {
              window.openAnyDocument(doc.url, doc.title);
            } else {
              showPDF(doc.url, doc.title);
            }
          }, 100);
        }
      };
      container.appendChild(tile);
    });
  }

  function initializeViewControls() {
    const gridViewBtn = document.getElementById('gridView');
    const listViewBtn = document.getElementById('listView');
    const sortToggleBtn = document.getElementById('sortToggle');
    const tilesContainer = document.getElementById('tilesContainer');

    if (!tilesContainer) return;

    let currentSortOrder = localStorage.getItem('questionary-sort-order') || 'asc';

    gridViewBtn && gridViewBtn.addEventListener('click', () => {
      tilesContainer.classList.remove('list-view');
      gridViewBtn.classList.add('active');
      listViewBtn && listViewBtn.classList.remove('active');
      localStorage.setItem('questionary-view-mode', 'grid');
    });

    listViewBtn && listViewBtn.addEventListener('click', () => {
      tilesContainer.classList.add('list-view');
      listViewBtn.classList.add('active');
      gridViewBtn && gridViewBtn.classList.remove('active');
      localStorage.setItem('questionary-view-mode', 'list');
    });

    sortToggleBtn && sortToggleBtn.addEventListener('click', async () => {
      if (typeof hasActivePdfTagFilters === 'function' && hasActivePdfTagFilters()) {
        pdfTagFilterState.sortBy = pdfTagFilterState.sortBy === 'date-desc' ? 'date-asc' : 'date-desc';
        localStorage.setItem('questionary-pdf-tag-sort', pdfTagFilterState.sortBy);
        await applyPdfTagFilters();
        return;
      }
      currentSortOrder = currentSortOrder === 'asc' ? 'desc' : 'asc';
      localStorage.setItem('questionary-sort-order', currentSortOrder);
      const nodes = await DbService.getChildren(path);
      renderTilesFromDb(nodes);
    });
  }

  async function handleBackButton() {
    if (path.length > 0) {
      await navigateToPath(path.slice(0, -1));
      if (path.length === 0 && typeof window.renderLibrary === 'function') {
        window.renderLibrary();
      }
    } else {
      restoreActiveViewAfterViewer();
    }
  }

  // ================================================================
  // TIMER SYSTEM
  // ================================================================
  function initializeTimer() {
    const timerPanel = document.getElementById('timerPanel');
    const timerClose = document.getElementById('timerClose');
    const timerMinimize = document.getElementById('timerMinimize');
    const timerPresets = document.querySelectorAll('.timer-preset-btn');
    const timerStart = document.getElementById('timerStart');
    const timerPause = document.getElementById('timerPause');
    const timerResume = document.getElementById('timerResume');
    const timerReset = document.getElementById('timerReset');
    const timerLap = document.getElementById('timerLap');
    const timerMiniLap = document.getElementById('timerMiniLap');
    const timerReopenBtn = document.getElementById('timerReopenBtn');

    initializeTimerDrag();
    initializeTimerResize();

    if (timerReopenBtn) {
      const newReopen = timerReopenBtn.cloneNode(true);
      timerReopenBtn.parentNode.replaceChild(newReopen, timerReopenBtn);
      newReopen.addEventListener('click', () => {
        showTimer();
        newReopen.classList.remove('pulse');
      });
    }

    timerPresets.forEach(btn => {
      if (btn.dataset.presetId || btn.id === 'addPresetBtn' || btn.classList.contains('custom-preset') || btn.classList.contains('add-custom')) return;
      if (btn.dataset.initialized === 'true') return;
      const durationAttr = btn.getAttribute('data-duration');
      if (!durationAttr) return;
      const duration = parseInt(durationAttr, 10);
      if (!duration || isNaN(duration) || duration <= 0) return;

      btn.dataset.initialized = 'true';
      const newBtn = btn.cloneNode(true);
      btn.parentNode.replaceChild(newBtn, btn);
      newBtn.addEventListener('click', () => { selectTimerPreset(newBtn, duration); });
    });

    if (timerClose) {
      const newClose = timerClose.cloneNode(true);
      timerClose.parentNode.replaceChild(newClose, timerClose);
      newClose.addEventListener('click', () => hideTimer());
    }

    if (timerMinimize) {
      const newMinimize = timerMinimize.cloneNode(true);
      timerMinimize.parentNode.replaceChild(newMinimize, timerMinimize);
      newMinimize.addEventListener('click', () => toggleTimerMinimize());
    }

    if (timerStart) {
      const newStart = timerStart.cloneNode(true);
      timerStart.parentNode.replaceChild(newStart, timerStart);
      newStart.addEventListener('click', () => startTimer());
    }

    if (timerPause) {
      const newPause = timerPause.cloneNode(true);
      timerPause.parentNode.replaceChild(newPause, timerPause);
      newPause.addEventListener('click', () => pauseTimer());
    }

    if (timerResume) {
      const newResume = timerResume.cloneNode(true);
      timerResume.parentNode.replaceChild(newResume, timerResume);
      newResume.addEventListener('click', () => resumeTimer());
    }

    if (timerReset) {
      const newReset = timerReset.cloneNode(true);
      timerReset.parentNode.replaceChild(newReset, timerReset);
      newReset.addEventListener('click', () => resetTimer());
    }

    if (timerLap) {
      const newLap = timerLap.cloneNode(true);
      timerLap.parentNode.replaceChild(newLap, timerLap);
      newLap.addEventListener('click', () => addLap());
    }

    if (timerMiniLap) {
      const newMiniLap = timerMiniLap.cloneNode(true);
      timerMiniLap.parentNode.replaceChild(newMiniLap, timerMiniLap);
      newMiniLap.addEventListener('click', () => addLap());
    }
  }

  function initializeTimerDrag() {
    const timerPanel = document.getElementById('timerPanel');
    const dragHandle = document.getElementById('timerDragHandle');
    if (!timerPanel || !dragHandle) return;

    let isDragging = false;
    let startX, startY, initialLeft, initialTop;

    dragHandle.addEventListener('mousedown', startDrag);
    dragHandle.addEventListener('touchstart', startDrag, { passive: false });

    function startDrag(e) {
      if (e.target.closest('button')) return;
      isDragging = true;
      timerPanel.style.transition = 'none';
      const rect = timerPanel.getBoundingClientRect();
      initialLeft = rect.left;
      initialTop = rect.top;

      if (e.type === 'touchstart') {
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
      } else {
        startX = e.clientX;
        startY = e.clientY;
      }

      timerPanel.style.bottom = 'auto';
      timerPanel.style.right = 'auto';
      timerPanel.style.left = initialLeft + 'px';
      timerPanel.style.top = initialTop + 'px';

      document.addEventListener('mousemove', drag);
      document.addEventListener('mouseup', stopDrag);
      document.addEventListener('touchmove', drag, { passive: false });
      document.addEventListener('touchend', stopDrag);
      e.preventDefault();
    }

    function drag(e) {
      if (!isDragging) return;
      let currentX, currentY;
      if (e.type === 'touchmove') {
        currentX = e.touches[0].clientX;
        currentY = e.touches[0].clientY;
      } else {
        currentX = e.clientX;
        currentY = e.clientY;
      }
      const deltaX = currentX - startX;
      const deltaY = currentY - startY;

      let newLeft = initialLeft + deltaX;
      let newTop = initialTop + deltaY;

      const panelRect = timerPanel.getBoundingClientRect();
      const maxLeft = window.innerWidth - panelRect.width;
      const maxTop = window.innerHeight - panelRect.height;

      newLeft = Math.max(0, Math.min(newLeft, maxLeft));
      newTop = Math.max(0, Math.min(newTop, maxTop));

      timerPanel.style.left = newLeft + 'px';
      timerPanel.style.top = newTop + 'px';
      e.preventDefault();
    }

    function stopDrag() {
      isDragging = false;
      timerPanel.style.transition = '';
      document.removeEventListener('mousemove', drag);
      document.removeEventListener('mouseup', stopDrag);
      document.removeEventListener('touchmove', drag);
      document.removeEventListener('touchend', stopDrag);
    }
  }

  function initializeTimerResize() {
    const timerPanel = document.getElementById('timerPanel');
    const resizeHandle = document.getElementById('timerResizeHandle');
    if (!timerPanel || !resizeHandle) return;

    let isResizing = false;
    let startX, startY, startWidth, startHeight;

    resizeHandle.addEventListener('mousedown', startResize);
    resizeHandle.addEventListener('touchstart', startResize, { passive: false });

    function startResize(e) {
      isResizing = true;
      timerPanel.style.transition = 'none';
      const rect = timerPanel.getBoundingClientRect();
      startWidth = rect.width;
      startHeight = rect.height;

      if (e.type === 'touchstart') {
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
      } else {
        startX = e.clientX;
        startY = e.clientY;
      }

      document.addEventListener('mousemove', resize);
      document.addEventListener('mouseup', stopResize);
      document.addEventListener('touchmove', resize, { passive: false });
      document.addEventListener('touchend', stopResize);
      e.preventDefault();
      e.stopPropagation();
    }

    function resize(e) {
      if (!isResizing) return;
      let currentX, currentY;
      if (e.type === 'touchmove') {
        currentX = e.touches[0].clientX;
        currentY = e.touches[0].clientY;
      } else {
        currentX = e.clientX;
        currentY = e.clientY;
      }
      const deltaX = currentX - startX;
      const deltaY = currentY - startY;

      const newWidth = Math.max(280, Math.min(window.innerWidth - 20, startWidth + deltaX));
      const newHeight = Math.max(200, Math.min(window.innerHeight - 20, startHeight + deltaY));

      timerPanel.style.width = newWidth + 'px';
      timerPanel.style.height = newHeight + 'px';
      e.preventDefault();
    }

    function stopResize() {
      isResizing = false;
      timerPanel.style.transition = '';
      document.removeEventListener('mousemove', resize);
      document.removeEventListener('mouseup', stopResize);
      document.removeEventListener('touchmove', resize);
      document.removeEventListener('touchend', stopResize);
    }
  }

  function toggleTimerMinimize() {
    const timerPanel = document.getElementById('timerPanel');
    const minimizeBtn = document.getElementById('timerMinimize');
    const timerControls = document.getElementById('timerControls');
    if (!timerPanel) return;

    timerPanel.classList.toggle('minimized');
    const isMinimized = timerPanel.classList.contains('minimized');

    if (timerControls && isMinimized) {
      timerControls.style.display = 'flex';
    }

    if (minimizeBtn) {
      const icon = minimizeBtn.querySelector('i');
      if (icon) {
        if (isMinimized) {
          icon.className = 'fas fa-expand';
          minimizeBtn.title = 'Expand Timer';
        } else {
          icon.className = 'fas fa-minus';
          minimizeBtn.title = 'Minimize Timer';
        }
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
    timerControls && (timerControls.style.display = 'flex');

    const startBtn = document.getElementById('timerStart');
    const pauseBtn = document.getElementById('timerPause');
    const resumeBtn = document.getElementById('timerResume');

    if (startBtn) startBtn.style.display = 'flex';
    if (pauseBtn) pauseBtn.style.display = 'none';
    if (resumeBtn) resumeBtn.style.display = 'none';

    updateTimerStatus('Ready to start');

    const progressBar = document.getElementById('timerProgressBar');
    progressBar && (progressBar.style.width = '100%');
    progressBar && progressBar.classList.remove('warning', 'danger');

    const timerDisplay = document.getElementById('timerDisplay');
    timerDisplay && timerDisplay.classList.remove('warning', 'danger');
  }

  function startTimer() {
    if (timerState.duration === 0) return;

    timerState.isRunning = true;
    timerState.isPaused = false;
    timerState.lastLapTime = timerState.duration;

    document.getElementById('timerStart').style.display = 'none';
    document.getElementById('timerPause').style.display = 'flex';
    document.getElementById('timerResume').style.display = 'none';
    document.getElementById('timerLap').style.display = 'flex';

    const miniLap = document.getElementById('timerMiniLap');
    if (miniLap) {
      miniLap.disabled = false;
      miniLap.style.opacity = '1';
    }

    updateTimerStatus('Timer running', 'active');

    timerState.interval = setInterval(() => {
      if (timerState.remaining > 0) {
        timerState.remaining--;
        updateTimerDisplay();
        updateTimerProgress();
      } else {
        timerFinished();
      }
    }, 1000);
  }

  function pauseTimer() {
    timerState.isRunning = false;
    timerState.isPaused = true;
    clearInterval(timerState.interval);

    document.getElementById('timerPause').style.display = 'none';
    document.getElementById('timerResume').style.display = 'flex';
    updateTimerStatus('Timer paused', 'paused');
  }

  function resumeTimer() {
    timerState.isRunning = true;
    timerState.isPaused = false;

    document.getElementById('timerPause').style.display = 'flex';
    document.getElementById('timerResume').style.display = 'none';
    updateTimerStatus('Timer running', 'active');

    timerState.interval = setInterval(() => {
      if (timerState.remaining > 0) {
        timerState.remaining--;
        updateTimerDisplay();
        updateTimerProgress();
      } else {
        timerFinished();
      }
    }, 1000);
  }

  function resetTimer() {
    clearInterval(timerState.interval);
    timerState.isRunning = false;
    timerState.isPaused = false;
    timerState.remaining = timerState.duration;
    timerState.laps = [];
    timerState.lastLapTime = timerState.duration;

    document.getElementById('timerStart').style.display = 'flex';
    document.getElementById('timerPause').style.display = 'none';
    document.getElementById('timerResume').style.display = 'none';
    document.getElementById('timerLap').style.display = 'none';

    const miniLap = document.getElementById('timerMiniLap');
    if (miniLap) {
      miniLap.disabled = true;
      miniLap.style.opacity = '0.5';
    }

    updateTimerDisplay();
    renderLaps();

    const progressBar = document.getElementById('timerProgressBar');
    if (progressBar) {
      progressBar.style.width = '100%';
      progressBar.classList.remove('warning', 'danger');
    }

    const timerDisplay = document.getElementById('timerDisplay');
    if (timerDisplay) timerDisplay.classList.remove('warning', 'danger');

    updateTimerStatus('Timer reset');
  }

  function timerFinished() {
    clearInterval(timerState.interval);
    timerState.isRunning = false;
    timerState.isPaused = false;

    if (typeof window.playAlarmSound === 'function') {
      window.playAlarmSound();
    }

    showNotification('⏰ Timer Complete! Time\'s up!', 'success');

    document.getElementById('timerStart').style.display = 'flex';
    document.getElementById('timerPause').style.display = 'none';
    document.getElementById('timerResume').style.display = 'none';
    document.getElementById('timerLap').style.display = 'none';

    const timerDisplay = document.getElementById('timerDisplay');
    if (timerDisplay) {
      timerDisplay.textContent = '00:00:00';
      timerDisplay.classList.add('danger');
    }

    updateTimerStatus('Timer complete!', 'complete');
  }

  function updateTimerDisplay() {
    const display = document.getElementById('timerDisplay');
    const timerTitle = document.querySelector('.timer-title');
    if (!display) return;

    const remaining = timerState.remaining || 0;
    const duration = timerState.duration || 1;

    const hours = Math.floor(remaining / 3600);
    const minutes = Math.floor((remaining % 3600) / 60);
    const seconds = remaining % 60;

    const timeStr = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    display.textContent = timeStr;

    if (timerTitle) {
      timerTitle.setAttribute('data-time', timeStr);
    }

    const percentRemaining = (remaining / duration) * 100;
    display.classList.remove('warning', 'danger');

    if (percentRemaining <= 10) {
      display.classList.add('danger');
    } else if (percentRemaining <= 25) {
      display.classList.add('warning');
    }
  }

  function updateTimerProgress() {
    const progressBar = document.getElementById('timerProgressBar');
    if (!progressBar) return;

    const percentRemaining = (timerState.remaining / timerState.duration) * 100;
    progressBar.style.width = `${percentRemaining}%`;

    progressBar.classList.remove('warning', 'danger');
    if (percentRemaining <= 10) {
      progressBar.classList.add('danger');
    } else if (percentRemaining <= 25) {
      progressBar.classList.add('warning');
    }
  }

  function updateTimerStatus(message, statusClass = '') {
    const status = document.getElementById('timerStatus');
    if (!status) return;
    status.textContent = message;
    status.className = 'timer-status';
    if (statusClass) {
      status.classList.add(statusClass);
    }
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
    const isPdfVisible = pdfViewer && (pdfViewer.classList.contains('active') || (pdfViewer.src && pdfViewer.src !== '' && pdfViewer.src !== 'about:blank'));

    if (reopenBtn && isPdfVisible) {
      reopenBtn.style.display = 'flex';
      if (timerState.isRunning) {
        reopenBtn.classList.add('pulse');
      }
    }
  }

  function hideTimerCompletely() {
    const timerPanel = document.getElementById('timerPanel');
    const reopenBtn = document.getElementById('timerReopenBtn');
    if (timerPanel) timerPanel.style.display = 'none';
    if (reopenBtn) {
      reopenBtn.style.display = 'none';
      reopenBtn.classList.remove('pulse');
    }
    if (timerState.isRunning) {
      clearInterval(timerState.interval);
      timerState.isRunning = false;
    }
  }

  function playTimerAlert() {
    try {
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const beepDuration = 0.2;
      const beepCount = 3;

      for (let i = 0; i < beepCount; i++) {
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        oscillator.frequency.value = 800;
        oscillator.type = 'sine';
        gainNode.gain.setValueAtTime(0.3, audioContext.currentTime + i * 0.4);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + i * 0.4 + beepDuration);
        oscillator.start(audioContext.currentTime + i * 0.4);
        oscillator.stop(audioContext.currentTime + i * 0.4 + beepDuration);
      }
    } catch (e) {
      console.log('Audio alert not supported');
    }
  }

  function addLap() {
    if (!timerState.isRunning || timerState.remaining <= 0) return;
    const lapTime = timerState.remaining;
    const elapsed = timerState.lastLapTime - lapTime;

    timerState.laps.push({
      number: timerState.laps.length + 1,
      time: lapTime,
      elapsed: elapsed
    });

    timerState.lastLapTime = lapTime;
    renderLaps();
    showNotification(`Lap ${timerState.laps.length} recorded`, 'success');
  }

  function deleteLap(index) {
    timerState.laps.splice(index, 1);
    timerState.laps.forEach((lap, i) => { lap.number = i + 1; });
    renderLaps();
  }

  function clearAllLaps() {
    timerState.laps = [];
    timerState.lastLapTime = timerState.duration;
    renderLaps();
  }

  function formatLapTime(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) {
      return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  function renderLaps() {
    const lapsContainer = document.getElementById('timerLaps');
    if (!lapsContainer) return;
    if (timerState.laps.length === 0) {
      lapsContainer.innerHTML = '';
      return;
    }

    let html = `
    <div class="timer-laps-header">
    <span class="timer-laps-title">Laps (${timerState.laps.length})</span>
    <button class="timer-laps-clear" onclick="clearAllLaps()" title="Clear all laps">
    <i class="fas fa-trash"></i> Clear All
    </button>
    </div>
    `;

    const reversedLaps = [...timerState.laps].reverse();
    reversedLaps.forEach((lap, i) => {
      const actualIndex = timerState.laps.length - 1 - i;
      html += `
      <div class="timer-lap-item">
      <div class="timer-lap-info">
      <span class="timer-lap-number">#${lap.number}</span>
      <span class="timer-lap-time">${formatLapTime(lap.time)}</span>
      <span class="timer-lap-elapsed">+${formatLapTime(lap.elapsed)}</span>
      </div>
      <button class="timer-lap-delete" onclick="deleteLap(${actualIndex})" title="Delete lap">
      <i class="fas fa-times"></i>
      </button>
      </div>
      `;
    });

    lapsContainer.innerHTML = html;
  }

  window.addEventListener('contextmenu', e => {
    if (e.target.closest('.custom-preset')) return;
    e.preventDefault();
  });

  var customTimerPresets = JSON.parse(localStorage.getItem('questionary-timer-presets') || '[]');

  function saveCustomPresets() {
    localStorage.setItem('questionary-timer-presets', JSON.stringify(customTimerPresets));
  }

  function initCustomPresets() {
    customTimerPresets = customTimerPresets.filter(p => {
      const duration = parseInt(p.duration, 10);
      return duration && duration > 0;
    });
    saveCustomPresets();

    renderTimerPresets();
    addCustomPresetButton();

    const display = document.getElementById('timerDisplay');
    if (display) display.textContent = '00:00:00';

    timerState.duration = 0;
    timerState.remaining = 0;
  }

  function renderTimerPresets() {
    const container = document.getElementById('timerPresets');
    if (!container) return;

    container.querySelectorAll('[data-preset-id]').forEach(el => el.remove());

    customTimerPresets.forEach(preset => {
      const duration = parseInt(preset.duration, 10);
      if (!duration || duration <= 0) return;

      const btn = document.createElement('button');
      btn.className = 'timer-preset-btn custom-preset';
      btn.dataset.duration = duration.toString();
      btn.dataset.presetId = preset.id;
      btn.title = `${preset.label} (${formatPresetTime(duration)}) - Right-click to delete`;
      btn.innerHTML = `
      <span>${preset.label}</span>
      <small>${formatPresetTime(duration)}</small>
      `;

      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        selectTimerPreset(btn, duration);
      });

      btn.addEventListener('contextmenu', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const ok = await showConfirm(`Delete "${preset.label}" preset?`, { title: 'Delete Preset', type: 'danger', confirmText: 'Delete' });
        if (ok) removeCustomPreset(preset.id);
      });

      const addBtn = document.getElementById('addPresetBtn');
      if (addBtn) {
        container.insertBefore(btn, addBtn);
      } else {
        container.appendChild(btn);
      }
    });
  }

  function addCustomPresetButton() {
    const container = document.getElementById('timerPresets');
    if (!container || document.getElementById('addPresetBtn')) return;

    const addBtn = document.createElement('button');
    addBtn.id = 'addPresetBtn';
    addBtn.className = 'timer-preset-btn add-custom';
    addBtn.title = 'Add Custom Preset';
    addBtn.innerHTML = '<i class="fas fa-plus"></i>';
    addBtn.onclick = (e) => {
      e.stopPropagation();
      showAddPresetForm();
    };
    container.appendChild(addBtn);
  }

  function showAddPresetForm() {
    const existingForm = document.getElementById('addPresetForm');
    if (existingForm) {
      existingForm.remove();
      return;
    }

    const overlay = document.createElement('div');
    overlay.id = 'addPresetForm';
    overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:10001;';

    overlay.innerHTML = `
    <div style="background:var(--card-bg, #fff);padding:20px;border-radius:12px;box-shadow:0 4px 20px rgba(0,0,0,0.2);min-width:280px;">
    <h3 style="margin:0 0 15px 0;font-size:1.1rem;"><i class="fas fa-clock"></i> Add Custom Timer</h3>
    <div style="display:flex;flex-direction:column;gap:10px;">
    <input type="text" id="presetLabel" placeholder="Label (e.g., Quiz)" maxlength="15" style="padding:10px;border:1px solid var(--border-color, #ddd);border-radius:6px;font-size:1rem;">
    <input type="number" id="presetMinutes" placeholder="Duration (minutes)" min="1" max="480" style="padding:10px;border:1px solid var(--border-color, #ddd);border-radius:6px;font-size:1rem;">
    <div style="display:flex;gap:10px;margin-top:10px;">
    <button onclick="document.getElementById('addPresetForm').remove()" style="flex:1;padding:10px;border:1px solid var(--border-color, #ddd);border-radius:6px;background:transparent;cursor:pointer;">Cancel</button>
    <button onclick="addCustomPreset()" style="flex:1;padding:10px;border:none;border-radius:6px;background:#f97316;color:white;cursor:pointer;font-weight:600;">Add</button>
    </div>
    </div>
    </div>
    `;

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.remove();
    });

    document.body.appendChild(overlay);
    document.getElementById('presetLabel').focus();
  }

  function addCustomPreset() {
    const label = document.getElementById('presetLabel')?.value.trim();
    const minutesInput = document.getElementById('presetMinutes')?.value;
    const minutes = parseInt(minutesInput, 10);

    if (!label) {
      showNotification('Please enter a label', 'error');
      return;
    }

    if (!minutes || isNaN(minutes) || minutes < 1) {
      showNotification('Please enter a valid duration (minutes)', 'error');
      return;
    }

    const durationInSeconds = minutes * 60;
    const preset = { id: Date.now().toString(), label: label, duration: durationInSeconds };

    customTimerPresets.push(preset);
    saveCustomPresets();

    document.getElementById('addPresetForm')?.remove();
    renderTimerPresets();
    showNotification(`Timer preset "${label}" added (${minutes} min)`, 'success');
  }

  function removeCustomPreset(id) {
    customTimerPresets = customTimerPresets.filter(p => p.id !== id);
    saveCustomPresets();
    const btn = document.querySelector(`[data-preset-id="${id}"]`);
    btn?.remove();
    showNotification('Preset removed', 'info');
  }

  function formatPresetTime(seconds) {
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    if (hours > 0) return `${hours}h ${mins}m`;
    return `${mins}m`;
  }

  window.addCustomPreset = addCustomPreset;
  window.removeCustomPreset = removeCustomPreset;

  document.addEventListener('DOMContentLoaded', () => setTimeout(initCustomPresets, 100));

  var darkModeSchedule = JSON.parse(localStorage.getItem('questionary-darkmode-schedule') || '{"enabled":false,"darkStart":19,"darkEnd":7}');

  function saveDarkModeSchedule() {
    localStorage.setItem('questionary-darkmode-schedule', JSON.stringify(darkModeSchedule));
  }

  function checkDarkModeSchedule() {
    if (!darkModeSchedule.enabled) return;
    const hour = new Date().getHours();
    const shouldBeDark = (hour >= darkModeSchedule.darkStart || hour < darkModeSchedule.darkEnd);
    const isDark = document.body.classList.contains('dark-theme');

    if (shouldBeDark !== isDark) {
      document.body.classList.toggle('dark-theme', shouldBeDark);
      const icon = document.getElementById('themeIcon');
      if (icon) {
        icon.className = shouldBeDark ? 'fas fa-sun' : 'fas fa-moon';
      }
    }
  }

  setInterval(checkDarkModeSchedule, 60000);
  document.addEventListener('DOMContentLoaded', checkDarkModeSchedule);

  var pageBookmarks = JSON.parse(localStorage.getItem('questionary-page-bookmarks') || '{}');

  function savePageBookmarks() {
    localStorage.setItem('questionary-page-bookmarks', JSON.stringify(pageBookmarks));
  }

  function addPageBookmark(docPath, pageNumber, label = '') {
    if (!pageBookmarks[docPath]) {
      pageBookmarks[docPath] = [];
    }

    const existing = pageBookmarks[docPath].find(b => b.page === pageNumber);
    if (existing) {
      showNotification('Page already bookmarked', 'info');
      return;
    }

    pageBookmarks[docPath].push({
      id: Date.now().toString(),
      page: pageNumber,
      label: label || `Page ${pageNumber}`,
      createdAt: Date.now()
    });

    savePageBookmarks();
    showNotification(`Bookmarked page ${pageNumber}`, 'success');
    renderPageBookmarks(docPath);
  }

  function removePageBookmark(docPath, bookmarkId) {
    if (!pageBookmarks[docPath]) return;
    pageBookmarks[docPath] = pageBookmarks[docPath].filter(b => b.id !== bookmarkId);
    savePageBookmarks();
    renderPageBookmarks(docPath);
  }

  function renderPageBookmarks(docPath) {
    const container = document.getElementById('pageBookmarksList');
    if (!container) return;

    const bookmarks = pageBookmarks[docPath] || [];

    if (bookmarks.length === 0) {
      container.innerHTML = '<p style="color: var(--text-secondary); font-size: 0.85rem; text-align: center; padding: 1rem;">No page bookmarks yet</p>';
      return;
    }

    container.innerHTML = bookmarks.map(b => `
    <div class="page-bookmark-item" data-page="${escapeHtml(b.page)}" data-bookmark-id="${escapeHtml(b.id)}">
    <i class="fas fa-bookmark"></i>
    <span>${escapeHtml(b.label)}</span>
    <button type="button" class="note-action-btn delete page-bookmark-delete">
    <i class="fas fa-times"></i>
    </button>
    </div>
    `).join('');

    container.querySelectorAll('.page-bookmark-item').forEach(el => {
      el.addEventListener('click', () => goToPage(parseInt(el.dataset.page, 10) || 1));
      el.querySelector('.page-bookmark-delete')?.addEventListener('click', (e) => {
        e.stopPropagation();
        removePageBookmark(docPath, el.dataset.bookmarkId);
      });
    });
  }

  function goToPage(pageNumber) {
    const pdfViewer = document.getElementById('pdfViewer');
    if (pdfViewer && pdfViewer.contentWindow) {
      pdfViewer.contentWindow.postMessage({ type: 'goToPage', page: pageNumber }, getTargetOrigin());
      showNotification(`Navigate to page ${pageNumber}`, 'info');
    }
  }

  window.addPageBookmark = addPageBookmark;
  window.removePageBookmark = removePageBookmark;
  window.goToPage = goToPage;

  function generateShareLink(docPath) {
    const readablePath = docPath.join(' > ');
    if (navigator.clipboard) {
      navigator.clipboard.writeText(readablePath).then(() => {
        showNotification('Document path copied to clipboard!', 'success');
      }).catch(() => {
        showInfoDialog(readablePath, { title: 'Document Path', type: 'info' });
      });
    } else {
      showInfoDialog(readablePath, { title: 'Document Path', type: 'info' });
    }
    return readablePath;
  }

  window.generateShareLink = generateShareLink;

  var printQueue = [];

  function addToPrintQueue(docPath, url) {
    if (printQueue.some(d => d.url === url)) {
      showNotification('Already in queue', 'info');
      return;
    }
    printQueue.push({ path: docPath, url, name: docPath[docPath.length - 1] });
    showNotification(`Added to print queue (${printQueue.length} items)`, 'success');
    updatePrintQueueBadge();
  }

  function removeFromPrintQueue(url) {
    printQueue = printQueue.filter(d => d.url !== url);
    updatePrintQueueBadge();
    renderPrintQueue();
  }

  function clearPrintQueue() {
    printQueue = [];
    updatePrintQueueBadge();
    renderPrintQueue();
    showNotification('Queue cleared', 'info');
  }

  function updatePrintQueueBadge() {
    let badge = document.getElementById('printQueueBadge');
    if (printQueue.length > 0) {
      if (!badge) {
        const compareBtn = document.getElementById('compareBtn');
        if (compareBtn) {
          badge = document.createElement('span');
          badge.id = 'printQueueBadge';
          badge.className = 'queue-badge';
          compareBtn.parentElement.appendChild(badge);
        }
      }
      if (badge) badge.textContent = printQueue.length;
    } else if (badge) {
      badge.remove();
    }
  }

  function renderPrintQueue() {
    const container = document.getElementById('printQueueList');
    if (!container) return;
    if (printQueue.length === 0) {
      container.innerHTML = '<p style="text-align: center; color: var(--text-secondary);">Queue is empty</p>';
      return;
    }
    container.innerHTML = printQueue.map(doc => `
    <div class="print-queue-item">
    <i class="fas fa-file-pdf"></i>
    <span>${escapeHtml(doc.name)}</span>
    <button type="button" class="print-queue-remove-btn" data-doc-url="${escapeHtml(doc.url)}" title="Remove"><i class="fas fa-times"></i></button>
    </div>
    `).join('');

    container.querySelectorAll('.print-queue-remove-btn').forEach(btn => {
      btn.addEventListener('click', () => removeFromPrintQueue(btn.dataset.docUrl));
    });
  }

  window.addToPrintQueue = addToPrintQueue;
  window.removeFromPrintQueue = removeFromPrintQueue;
  window.clearPrintQueue = clearPrintQueue;

  var pdfViewStartTime = null;

  function trackPdfViewStart() {
    pdfViewStartTime = Date.now();
  }

  function trackPdfViewEnd(docPath) {
    if (pdfViewStartTime) {
      const viewedMinutes = Math.round((Date.now() - pdfViewStartTime) / 60000);
      if (viewedMinutes >= 1) {
        trackStudyTime(viewedMinutes);
        const currentProgress = documentProgress[docPath]?.progress || 0;
        const newProgress = Math.min(100, currentProgress + Math.min(viewedMinutes * 5, 25));
        updateDocProgress(docPath, newProgress);
      }
      pdfViewStartTime = null;
    }
  }

  window.trackPdfViewStart = trackPdfViewStart;
  window.trackPdfViewEnd = trackPdfViewEnd;

  // ================================================================
  // KEYBOARD SHORTCUTS ENGINE
  // ================================================================
  const DEFAULT_KEYBINDS = {
    focusSearch:   { key: '/', ctrl: false, alt: false, shift: false, label: 'Focus Search' },
    newNote:       { key: 'n', ctrl: false, alt: false, shift: false, label: 'New Note' },
    newFlashcard:  { key: 'f', ctrl: false, alt: false, shift: false, label: 'New Flashcard' },
    shareLocation: { key: 's', ctrl: false, alt: false, shift: false, label: 'Share Location' },
    quickLinks:    { key: 'q', ctrl: false, alt: false, shift: false, label: 'Toggle Quick Links' },
    goBack:        { key: 'Backspace', ctrl: false, alt: false, shift: false, label: 'Go Back' },
    goHome:        { key: 'Home', ctrl: false, alt: true, shift: false, label: 'Go Home' },
    navBack:       { key: 'ArrowLeft', ctrl: false, alt: true, shift: false, label: 'Navigate Back' },
    wbUndo:        { key: 'z', ctrl: true, alt: false, shift: false, label: 'Whiteboard Undo' },
    wbRedo:        { key: 'y', ctrl: true, alt: false, shift: false, label: 'Whiteboard Redo' },
    wbPen:         { key: 'p', ctrl: false, alt: false, shift: false, label: 'Whiteboard Pen' },
    wbEraser:      { key: 'e', ctrl: false, alt: false, shift: false, label: 'Whiteboard Eraser' },
    wbHighlighter: { key: 'h', ctrl: false, alt: false, shift: false, label: 'Whiteboard Highlighter' },
    toggleMic:     { key: 'm', ctrl: true, alt: false, shift: false, label: 'Toggle Microphone' },
    toggleCam:     { key: 'v', ctrl: true, alt: false, shift: false, label: 'Toggle Camera' }
  };

  function loadKeybinds() {
    const saved = localStorage.getItem('questionary-keybinds');
    const binds = saved ? JSON.parse(saved) : {};
    const merged = {};
    for (const id in DEFAULT_KEYBINDS) {
      merged[id] = binds[id] ? { ...DEFAULT_KEYBINDS[id], ...binds[id] } : { ...DEFAULT_KEYBINDS[id] };
    }
    window._keybinds = merged;
    return merged;
  }

  function saveKeybinds(binds) {
    localStorage.setItem('questionary-keybinds', JSON.stringify(binds));
    window._keybinds = binds;
  }

  function resetKeybinds() {
    localStorage.removeItem('questionary-keybinds');
    const binds = loadKeybinds();
    renderKeybindsSettings();
    if (typeof showNotification === 'function') showNotification('Keyboard shortcuts reset to defaults.', 'info');
    return binds;
  }

  function formatKeybindDisplay(b) {
    let parts = [];
    if (b.ctrl) parts.push('Ctrl');
    if (b.alt) parts.push('Alt');
    if (b.shift) parts.push('Shift');
    let keyName = b.key;
    if (keyName === ' ') keyName = 'Space';
    else if (keyName.length === 1) keyName = keyName.toUpperCase();
    parts.push(keyName);
    return parts.join(' + ');
  }

  function keybindMatches(e, bindId) {
    const binds = window._keybinds || loadKeybinds();
    const b = binds[bindId];
    if (!b) return false;
    const keyMatch = e.key.toLowerCase() === b.key.toLowerCase() || e.key === b.key;
    return keyMatch && e.ctrlKey === !!b.ctrl && e.altKey === !!b.alt && e.shiftKey === !!b.shift;
  }

  function renderKeybindsSettings() {
    const container = document.getElementById('keybindsList');
    if (!container) return;
    const binds = window._keybinds || loadKeybinds();
    const categories = {
      'General': ['focusSearch', 'newNote', 'newFlashcard', 'shareLocation', 'quickLinks', 'goBack', 'goHome', 'navBack'],
      'Whiteboard': ['wbUndo', 'wbRedo', 'wbPen', 'wbEraser', 'wbHighlighter'],
      'Study Room': ['toggleMic', 'toggleCam']
    };
    let html = '';
    for (const [cat, ids] of Object.entries(categories)) {
      html += `<div class="kb-category"><span class="kb-cat-label">${cat}</span></div>`;
      for (const id of ids) {
        const b = binds[id];
        if (!b) continue;
        html += `<div class="kb-row">
        <span class="kb-action">${b.label}</span>
        <button class="kb-key-btn" data-bind-id="${id}" title="Click to change">${formatKeybindDisplay(b)}</button>
        </div>`;
      }
    }
    container.innerHTML = html;
    container.querySelectorAll('.kb-key-btn').forEach(btn => {
      btn.addEventListener('click', () => startKeybindCapture(btn));
    });
  }

  var _capturingBind = null;
  function startKeybindCapture(btn) {
    if (_capturingBind) {
      _capturingBind.classList.remove('kb-listening');
      _capturingBind.textContent = _capturingBind._prevText;
    }
    _capturingBind = btn;
    btn._prevText = btn.textContent;
    btn.textContent = 'Press a key…';
    btn.classList.add('kb-listening');

    function onKey(e) {
      e.preventDefault();
      e.stopPropagation();
      if (['Control', 'Alt', 'Shift', 'Meta'].includes(e.key)) return;
      document.removeEventListener('keydown', onKey, true);
      btn.classList.remove('kb-listening');

      const bindId = btn.dataset.bindId;
      const binds = window._keybinds || loadKeybinds();
      binds[bindId] = {
        ...binds[bindId],
        key: e.key.length === 1 ? e.key.toLowerCase() : e.key,
        ctrl: e.ctrlKey,
        alt: e.altKey,
        shift: e.shiftKey
      };
      saveKeybinds(binds);
      btn.textContent = formatKeybindDisplay(binds[bindId]);
      _capturingBind = null;
      if (typeof showNotification === 'function') showNotification(`Shortcut updated: ${binds[bindId].label}`, 'success');
    }
    document.addEventListener('keydown', onKey, true);
  }

  loadKeybinds();
  window.renderKeybindsSettings = renderKeybindsSettings;
  window.resetKeybinds = resetKeybinds;

  document.addEventListener('keydown', (e) => {
    const isInputFocused = e.target.closest('input, textarea, [contenteditable]');

    if (typeof window.isWhiteboardActive === 'function' && window.isWhiteboardActive()) {
      if (keybindMatches(e, 'wbUndo')) { e.preventDefault(); if (typeof window.wbUndo === 'function') window.wbUndo(); return; }
      if (keybindMatches(e, 'wbRedo')) { e.preventDefault(); if (typeof window.wbRedo === 'function') window.wbRedo(); return; }
      if (!isInputFocused) {
        if (keybindMatches(e, 'wbPen')) { e.preventDefault(); if (typeof window.wbSelectTool === 'function') window.wbSelectTool('pen'); return; }
        if (keybindMatches(e, 'wbEraser')) { e.preventDefault(); if (typeof window.wbSelectTool === 'function') window.wbSelectTool('eraser'); return; }
        if (keybindMatches(e, 'wbHighlighter')) { e.preventDefault(); if (typeof window.wbSelectTool === 'function') window.wbSelectTool('highlighter'); return; }
      }
    }

    if (isInputFocused) return;

    if (keybindMatches(e, 'newNote')) {
      if (typeof openNoteModal === 'function') { e.preventDefault(); openNoteModal(); }
    }
    if (keybindMatches(e, 'newFlashcard')) {
      if (typeof openFlashcardModal === 'function') { e.preventDefault(); openFlashcardModal(); }
    }
    if (keybindMatches(e, 'shareLocation')) {
      if (path.length > 0 && typeof generateShareLink === 'function') { e.preventDefault(); generateShareLink(path); }
    }
    if (keybindMatches(e, 'quickLinks')) {
      e.preventDefault();
      document.getElementById('quickLinksPanel')?.classList.toggle('active');
    }
    if (keybindMatches(e, 'toggleMic')) {
      e.preventDefault();
      if (typeof window.srToggleMicrophone === 'function') window.srToggleMicrophone();
    }
    if (keybindMatches(e, 'toggleCam')) {
      e.preventDefault();
      if (typeof window.srToggleCamera === 'function') window.srToggleCamera();
    }
  });

  // ================================================================
  // SETTINGS DROPDOWN & CONFIGURATION
  // ================================================================
  function setUserDropdownOpen(isOpen) {
    const userBadge = document.getElementById('userBadge') || document.querySelector('.user-badge');
    const userDropdown = document.getElementById('userDropdownMenu');
    const backdrop = document.getElementById('userDropdownBackdrop');

    if (userBadge) userBadge.classList.toggle('active', Boolean(isOpen));
    if (userDropdown) userDropdown.classList.toggle('active', Boolean(isOpen));
    if (backdrop) backdrop.classList.toggle('active', Boolean(isOpen));
    document.body.classList.toggle('mobile-sheet-open', Boolean(isOpen) && window.innerWidth <= 768);

    if (isOpen) {
      const usernameDisplay = document.getElementById('username-display');
      const dropdownUsername = document.getElementById('dropdownUsername');
      if (usernameDisplay && dropdownUsername) {
        dropdownUsername.textContent = usernameDisplay.textContent;
      }
      const accessibilityPanel = document.getElementById('accessibilityPanel');
      if (accessibilityPanel) accessibilityPanel.classList.remove('active');
    }
  }
  window.closeUserDropdown = () => setUserDropdownOpen(false);

  function initSettingsDropdown() {
    let userBadge = document.getElementById('userBadge') || document.querySelector('.user-badge');
    if (!userBadge) return;

    let userDropdown = document.getElementById('userDropdownMenu') || userBadge.querySelector('.user-dropdown-menu');
    const backdrop = document.getElementById('userDropdownBackdrop');
    const appRoot = document.getElementById('app');

    if (!userDropdown) {
      userDropdown = document.createElement('div');
      userDropdown.className = 'user-dropdown-menu';
      userDropdown.id = 'userDropdownMenu';
      userDropdown.innerHTML = `
      <div class="modal-sheet-handle dropdown-sheet-handle"></div>
      <div class="user-dropdown-header">
        <div class="dropdown-avatar"><i class="fas fa-user"></i></div>
        <div class="dropdown-user-info">
          <span class="dropdown-name" id="dropdownUsername">User</span>
          <span class="dropdown-role">Student</span>
        </div>
      </div>
      <div class="user-dropdown-item" id="openSettingsBtn">
        <i class="fas fa-cog"></i>
        <span>All Settings</span>
        <i class="fas fa-chevron-right" style="margin-left:auto; font-size:0.55rem; color:var(--fg3);"></i>
      </div>
      <div class="user-dropdown-divider"></div>
      <button class="dropdown-btn" id="resetCodeCacheBtn" style="margin-top: 6px;"><i class="fas fa-sync-alt"></i> Reset Code Cache</button>
      <button class="dropdown-btn dropdown-btn-logout" id="logoutBtn"><i class="fas fa-sign-out-alt"></i> Logout</button>
      `;
      userBadge.appendChild(userDropdown);
    }

    // Move #userDropdownMenu out of sticky <header> on mobile so it renders as a true viewport bottom sheet above #userDropdownBackdrop
    const mq = window.matchMedia('(max-width: 768px)');
    const syncDropdownPlacement = () => {
      if (mq.matches) {
        if (appRoot && userDropdown.parentElement !== appRoot) {
          if (backdrop && backdrop.parentElement === appRoot) {
            appRoot.insertBefore(userDropdown, backdrop.nextSibling);
          } else {
            appRoot.appendChild(userDropdown);
          }
        }
      } else {
        setUserDropdownOpen(false);
        if (userBadge && userDropdown.parentElement !== userBadge) {
          userBadge.appendChild(userDropdown);
        }
      }
    };
    syncDropdownPlacement();
    if (!userDropdown.dataset.placementBound) {
      userDropdown.dataset.placementBound = 'true';
      if (typeof mq.addEventListener === 'function') {
        mq.addEventListener('change', syncDropdownPlacement);
      } else if (typeof mq.addListener === 'function') {
        mq.addListener(syncDropdownPlacement);
      }
    }

    if (backdrop && !backdrop.dataset.bound) {
      backdrop.dataset.bound = 'true';
      backdrop.addEventListener('click', (e) => {
        e.stopPropagation();
        setUserDropdownOpen(false);
      });
    }

    const toggleDropdown = (e) => {
      if (e.target.closest('#userDropdownMenu')) return;
      e.preventDefault();
      e.stopPropagation();
      syncDropdownPlacement();
      const willOpen = !(userBadge.classList.contains('active') || userDropdown.classList.contains('active'));
      setUserDropdownOpen(willOpen);
    };

    userBadge.onclick = toggleDropdown;

    if (!window._userDropdownGlobalClickListener) {
      window._userDropdownGlobalClickListener = true;
      document.addEventListener('click', (e) => {
        if (!e.target.closest('#userBadge') && !e.target.closest('.user-badge') && !e.target.closest('#userDropdownMenu')) {
          setUserDropdownOpen(false);
        }
      });
    }

    loadSettingsState();
    setupSettingsToggles();
    setupSettingsActions();
  }

  function loadSettingsState() {
    const settings = JSON.parse(localStorage.getItem('questionary-settings') || '{}');

    const verticalNavToggle = document.getElementById('verticalNavbarToggle');
    if (verticalNavToggle) {
      verticalNavToggle.checked = settings.verticalNavbar || false;
      if (settings.verticalNavbar) {
        document.body.classList.add('vertical-navbar-mode');
      } else {
        document.body.classList.remove('vertical-navbar-mode');
      }
    } else {
      document.body.classList.remove('vertical-navbar-mode');
    }

    const compactToggle = document.getElementById('compactModeToggle');
    if (compactToggle) {
      compactToggle.checked = settings.compactMode || false;
      if (settings.compactMode) document.body.classList.add('compact-mode');
      else document.body.classList.remove('compact-mode');
    }

    const animationsToggle = document.getElementById('animationsToggle');
    if (animationsToggle) {
      animationsToggle.checked = settings.animations !== false;
      if (settings.animations === false) document.body.classList.add('reduced-animations');
    }

    const autoPlayToggle = document.getElementById('autoPlayToggle');
    if (autoPlayToggle) autoPlayToggle.checked = settings.autoOpenPdfs || false;

    const focusModeToggle = document.getElementById('focusModeToggle');
    if (focusModeToggle) {
      focusModeToggle.checked = settings.focusMode || false;
      if (settings.focusMode) document.body.classList.add('focus-mode');
    }

    const rememberLocationToggle = document.getElementById('rememberLocationToggle');
    if (rememberLocationToggle) rememberLocationToggle.checked = settings.rememberLocation !== false;
  }

  function saveSettingsState() {
    const settings = {
      verticalNavbar: document.getElementById('verticalNavbarToggle')?.checked || false,
      compactMode: document.getElementById('compactModeToggle')?.checked || false,
      animations: document.getElementById('animationsToggle')?.checked !== false,
      autoOpenPdfs: document.getElementById('autoPlayToggle')?.checked || false,
      focusMode: document.getElementById('focusModeToggle')?.checked || false,
      rememberLocation: document.getElementById('rememberLocationToggle')?.checked !== false
    };
    localStorage.setItem('questionary-settings', JSON.stringify(settings));
  }

  function setupSettingsToggles() {
    function setupToggleRow(toggleId, onToggle) {
      const toggle = document.getElementById(toggleId);
      if (!toggle) return;
      const toggleItem = toggle.closest('.toggle-item');

      toggle.addEventListener('change', (e) => {
        e.stopPropagation();
        onToggle(toggle.checked);
        saveSettingsState();
      });

      if (toggleItem) {
        toggleItem.style.cursor = 'pointer';
        toggleItem.addEventListener('click', (e) => {
          if (e.target === toggle) return;
          e.preventDefault();
          e.stopPropagation();
          toggle.checked = !toggle.checked;
          onToggle(toggle.checked);
          saveSettingsState();
        });
      }
    }

    setupToggleRow('verticalNavbarToggle', (checked) => {
      if (checked) {
        document.body.classList.add('vertical-navbar-mode');
        if (typeof showNotification === 'function') showNotification('Vertical navbar enabled', 'success');
      } else {
        document.body.classList.remove('vertical-navbar-mode');
        closeSidebar();
        if (typeof showNotification === 'function') showNotification('Horizontal navbar restored', 'info');
      }
      if (window.OfflineEngine && typeof window.OfflineEngine.updateInstallButtons === 'function') {
        window.OfflineEngine.updateInstallButtons();
      }
    });

    setupToggleRow('compactModeToggle', (checked) => {
      document.body.classList.toggle('compact-mode', checked);
      if (typeof showNotification === 'function') showNotification(checked ? 'Compact mode enabled' : 'Compact mode disabled', 'info');
    });

    setupToggleRow('animationsToggle', (checked) => {
      document.body.classList.toggle('reduced-animations', !checked);
      if (typeof showNotification === 'function') showNotification(checked ? 'Animations enabled' : 'Animations reduced', 'info');
    });

    setupToggleRow('autoPlayToggle', (checked) => {
      if (typeof showNotification === 'function') showNotification(checked ? 'PDFs will auto-open on click' : 'PDF preview mode', 'info');
    });

    setupToggleRow('focusModeToggle', (checked) => {
      document.body.classList.toggle('focus-mode', checked);
      if (typeof showNotification === 'function') showNotification(checked ? 'Focus mode enabled' : 'Focus mode disabled', 'info');
    });

    setupToggleRow('rememberLocationToggle', (checked) => {
      if (typeof showNotification === 'function') showNotification(checked ? 'Will remember your last location' : 'Will start at home on launch', 'info');
    });
  }

  function setupSettingsActions() {
    const clearDataBtn = document.getElementById('clearDataBtn');
    if (clearDataBtn) {
      clearDataBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        setUserDropdownOpen(false);
        showConfirmModal(
          'Clear Local Data',
          'Are you sure you want to clear all local data? This will reset favorites, notes, flashcards, quick links, and settings.',
          async () => {
            const keysToKeep = ['questionary-login'];
            const allKeys = Object.keys(localStorage).filter(k => k.startsWith('questionary-'));
            allKeys.forEach(key => {
              if (!keysToKeep.includes(key)) localStorage.removeItem(key);
            });
            await DbService.clearIndexedDB();
            showNotification('Local data cleared', 'success');
            setUserDropdownOpen(false);
            setTimeout(() => location.reload(), 1000);
          }
        );
      });
    }

    const exportDataBtn = document.getElementById('exportDataBtn');
    if (exportDataBtn) {
      exportDataBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const exportData = {};
        Object.keys(localStorage).filter(k => k.startsWith('questionary-')).forEach(key => {
          exportData[key] = localStorage.getItem(key);
        });

        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `questionary-backup-${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);

        showNotification('Data exported successfully', 'success');
        setUserDropdownOpen(false);
      });
    }

    const importDataBtn = document.getElementById('importDataBtn');
    if (importDataBtn) {
      importDataBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        setUserDropdownOpen(false);
        const importInput = document.getElementById('importDataInput');
        if (importInput) {
          importInput.click();
        } else {
          showView('settings');
          setActiveNav('settingsNav');
        }
      });
    }

    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        setUserDropdownOpen(false);
        showConfirmModal(
          'Logout',
          'Are you sure you want to logout?',
          () => {
            localStorage.removeItem('questionary-login');
            localStorage.removeItem('revamp-dpsnt-remember');
            sessionStorage.removeItem('revamp-dpsnt-session');
            showNotification('Logged out successfully', 'info');
            setTimeout(() => location.reload(), 500);
          }
        );
      });
    }

    const openSettingsBtn = document.getElementById('openSettingsBtn');
    if (openSettingsBtn) {
      openSettingsBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        setUserDropdownOpen(false);
        showView('settings');
        setActiveNav('settingsNav');
      });
    }
  }

  // ================================================================
  // COMPREHENSIVE INITIALIZATION ROUTINE
  // ================================================================
  function initializeNewFeatures() {
    try { if (typeof loadNotes === 'function') loadNotes(); } catch(e){}
    try { if (typeof loadFlashcardDecks === 'function') loadFlashcardDecks(); } catch(e){}
    try { if (typeof loadStudySessions === 'function') loadStudySessions(); } catch(e){}
    try { if (typeof loadDocumentProgress === 'function') loadDocumentProgress(); } catch(e){}
    try { if (typeof loadQuickLinks === 'function') loadQuickLinks(); } catch(e){}
    try { if (typeof loadStudyStats === 'function') loadStudyStats(); } catch(e){}

    if (!window.EnhancedNotes) {
      const createNoteBtn = document.getElementById('createNoteBtn');
      const closeNoteModal = document.getElementById('closeNoteModal');
      const cancelNoteBtn = document.getElementById('cancelNoteBtn');
      const saveNoteBtn = document.getElementById('saveNoteBtn');
      const noteModal = document.getElementById('noteModal');

      if (createNoteBtn && typeof openNoteModal === 'function') createNoteBtn.onclick = () => openNoteModal();
      if (closeNoteModal && noteModal) closeNoteModal.onclick = () => noteModal.classList.remove('active');
      if (cancelNoteBtn && noteModal) cancelNoteBtn.onclick = () => noteModal.classList.remove('active');
      if (saveNoteBtn && typeof saveNote === 'function') saveNoteBtn.onclick = saveNote;
    }

    if (!window.EnhancedFlashcards) {
      const createDeckBtn = document.getElementById('createDeckBtn');
      const closeFlashcardModal = document.getElementById('closeFlashcardModal');
      const cancelFlashcardBtn = document.getElementById('cancelFlashcardBtn');
      const saveDeckBtn = document.getElementById('saveDeckBtn');
      const addCardBtn = document.getElementById('addCardBtn');
      const flashcardModal = document.getElementById('flashcardModal');

      if (createDeckBtn && typeof openFlashcardModal === 'function') createDeckBtn.onclick = () => openFlashcardModal();
      if (closeFlashcardModal && flashcardModal) closeFlashcardModal.onclick = () => flashcardModal.classList.remove('active');
      if (cancelFlashcardBtn && flashcardModal) cancelFlashcardBtn.onclick = () => flashcardModal.classList.remove('active');
      if (saveDeckBtn && typeof saveDeck === 'function') saveDeckBtn.onclick = saveDeck;
      if (addCardBtn && typeof addCardEditor === 'function') addCardBtn.onclick = () => addCardEditor();

      const closeStudyModalBtn = document.getElementById('closeStudyModal');
      const flipCardBtn = document.getElementById('flipCardBtn');
      const shuffleDeckBtn = document.getElementById('shuffleDeckBtn');
      const nextCardBtn = document.getElementById('nextCardBtn');
      const prevCardBtn = document.getElementById('prevCardBtn');
      const activeFlashcard = document.getElementById('activeFlashcard');

      if (closeStudyModalBtn && typeof closeStudyModal === 'function') closeStudyModalBtn.onclick = closeStudyModal;
      if (flipCardBtn && typeof flipCard === 'function') flipCardBtn.onclick = flipCard;
      if (shuffleDeckBtn && typeof shuffleStudyDeck === 'function') shuffleDeckBtn.onclick = shuffleStudyDeck;
      if (nextCardBtn && typeof nextCard === 'function') nextCardBtn.onclick = nextCard;
      if (prevCardBtn && typeof prevCard === 'function') prevCardBtn.onclick = prevCard;
      if (activeFlashcard && typeof flipCard === 'function') activeFlashcard.onclick = flipCard;
    }

    const addStudySessionBtn = document.getElementById('addStudySessionBtn');
    const closeSessionModal = document.getElementById('closeSessionModal');
    const cancelSessionBtn = document.getElementById('cancelSessionBtn');
    const saveSessionBtn = document.getElementById('saveSessionBtn');
    const prevMonth = document.getElementById('prevMonth');
    const nextMonth = document.getElementById('nextMonth');
    const sessionModal = document.getElementById('sessionModal');

    if (addStudySessionBtn && typeof openSessionModal === 'function') addStudySessionBtn.onclick = () => openSessionModal();
    if (closeSessionModal && sessionModal) closeSessionModal.onclick = () => sessionModal.classList.remove('active');
    if (cancelSessionBtn && sessionModal) cancelSessionBtn.onclick = () => sessionModal.classList.remove('active');
    if (saveSessionBtn && typeof saveSession === 'function') saveSessionBtn.onclick = saveSession;

    if (prevMonth && typeof renderCalendar === 'function') {
      prevMonth.onclick = () => {
        currentCalendarDate.setMonth(currentCalendarDate.getMonth() - 1);
        renderCalendar();
      };
    }

    if (nextMonth && typeof renderCalendar === 'function') {
      nextMonth.onclick = () => {
        currentCalendarDate.setMonth(currentCalendarDate.getMonth() + 1);
        renderCalendar();
      };
    }

    document.querySelectorAll('.progress-filter').forEach(btn => {
      btn.onclick = () => {
        document.querySelectorAll('.progress-filter').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        filterProgress(btn.dataset.filter);
      };
    });

    const quickLinksToggle = document.getElementById('quickLinksToggle');
    const quickLinksPanel = document.getElementById('quickLinksPanel');
    const quickLinksClose = document.getElementById('quickLinksClose');
    const addQuickLinkBtn = document.getElementById('addQuickLinkBtn');

    if (quickLinksToggle && quickLinksPanel) {
      quickLinksToggle.onclick = () => quickLinksPanel.classList.toggle('active');
    }

    if (quickLinksClose && quickLinksPanel) {
      quickLinksClose.onclick = () => quickLinksPanel.classList.remove('active');
    }

    document.addEventListener('click', (e) => {
      if (quickLinksPanel && quickLinksPanel.classList.contains('active')) {
        if (!e.target.closest('.quick-links-panel') && !e.target.closest('.quick-links-toggle')) {
          quickLinksPanel.classList.remove('active');
        }
      }
    });

    if (addQuickLinkBtn) {
      addQuickLinkBtn.onclick = (e) => {
        e.stopPropagation();
        if (currentOpenPDF) {
          showQuickLinkChoiceDialog();
          return;
        }
        if (path.length === 0) {
          if (typeof showNotification === 'function') showNotification('Navigate to a folder first to add it as a quick link', 'info');
          return;
        }
        addCurrentFolderToQuickLinks();
      };
    }

    if (typeof renderQuickLinks === 'function') renderQuickLinks();
  }

  function filterProgress(filter) {
    const items = document.querySelectorAll('.progress-item');
    items.forEach(item => {
      const status = item.dataset.status;
      if (filter === 'all' || status === filter) {
        item.style.display = 'flex';
      } else {
        item.style.display = 'none';
      }
    });
  }

  var searchHistory = (() => {
    try {
      const parsed = JSON.parse(localStorage.getItem('questionary-search-history') || '[]');
      return Array.isArray(parsed) ? parsed.filter(q => typeof q === 'string' && q.trim().length > 0) : [];
    } catch (err) {
      return [];
    }
  })();

  function saveSearchHistory() {
    try {
      localStorage.setItem('questionary-search-history', JSON.stringify(searchHistory));
    } catch (err) {}
  }

  function addToSearchHistory(query) {
    const clean = String(query || '').trim();
    if (clean.length < 2) return;
    searchHistory = searchHistory.filter(q => q.toLowerCase() !== clean.toLowerCase());
    searchHistory.unshift(clean);
    searchHistory = searchHistory.slice(0, 10);
    saveSearchHistory();
  }

  function removeFromSearchHistory(query) {
    const clean = String(query || '').trim().toLowerCase();
    searchHistory = searchHistory.filter(q => q.toLowerCase() !== clean);
    saveSearchHistory();
    const dropdown = document.getElementById('searchHistoryDropdown');
    if (!dropdown) return;
    if (searchHistory.length === 0) {
      dropdown.innerHTML = '';
      dropdown.classList.remove('active');
    } else {
      showSearchHistory();
    }
  }

  function initSearchHistory() {
    const searchInput = document.getElementById('globalSearch');
    if (!searchInput) return;

    const container = searchInput.parentElement;
    let dropdown = document.getElementById('searchHistoryDropdown');
    if (!dropdown) {
      dropdown = document.createElement('div');
      dropdown.id = 'searchHistoryDropdown';
      dropdown.className = 'search-history-dropdown';
      container.appendChild(dropdown);
    }

    if (searchInput.dataset.historyBound) return;
    searchInput.dataset.historyBound = 'true';

    searchInput.addEventListener('focus', showSearchHistory);
    searchInput.addEventListener('input', (e) => {
      if (e.target.value.trim() === '') {
        showSearchHistory();
      } else {
        dropdown.classList.remove('active');
      }
    });

    document.addEventListener('click', (e) => {
      if (!e.target.closest('.search-container')) {
        dropdown.classList.remove('active');
      }
    });
  }

  function showSearchHistory() {
    const dropdown = document.getElementById('searchHistoryDropdown');
    const searchInput = document.getElementById('globalSearch');
    if (!dropdown || !searchInput) return;
    if (searchHistory.length === 0 || searchInput.value.trim() !== '') {
      dropdown.classList.remove('active');
      return;
    }

    dropdown.innerHTML = `
    <div class="search-history-header">
      <span>Recent Searches</span>
      <button type="button" class="clear-history-btn" title="Clear all search history">
        <i class="fas fa-trash-alt"></i> Clear All
      </button>
    </div>
    ${searchHistory.map(q => `
      <div class="search-history-item" data-query="${escapeHtml(q)}">
        <i class="fas fa-history"></i>
        <span>${escapeHtml(q)}</span>
        <button type="button" class="remove-history-item-btn" data-remove-query="${escapeHtml(q)}" title="Remove from history" aria-label="Remove search item">
          <i class="fas fa-times"></i>
        </button>
      </div>
    `).join('')}
    `;
    dropdown.querySelector('.clear-history-btn')?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      clearSearchHistory();
    });
    dropdown.querySelectorAll('.remove-history-item-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        removeFromSearchHistory(btn.dataset.removeQuery || '');
      });
    });
    dropdown.querySelectorAll('.search-history-item').forEach(item => {
      item.addEventListener('click', (e) => {
        if (e.target.closest('.remove-history-item-btn')) return;
        useSearchHistory(item.dataset.query || '');
      });
    });
    dropdown.classList.add('active');
  }

  function useSearchHistory(query) {
    const searchInput = document.getElementById('globalSearch');
    if (!searchInput) return;
    searchInput.value = query;
    document.getElementById('searchHistoryDropdown')?.classList.remove('active');
    performSearch(query);
  }

  function clearSearchHistory() {
    searchHistory = [];
    saveSearchHistory();
    const dropdown = document.getElementById('searchHistoryDropdown');
    if (dropdown) {
      dropdown.innerHTML = '';
      dropdown.classList.remove('active');
    }
    if (typeof showNotification === 'function') {
      showNotification('Search history cleared', 'info');
    }
  }

  window.useSearchHistory = useSearchHistory;
  window.removeFromSearchHistory = removeFromSearchHistory;
  window.clearSearchHistory = clearSearchHistory;

  // ================================================================
  // CODE & ASSET UPDATER INTEGRATION
  // ================================================================
  var updateState = window.updateState || {
    available: false,
    version: null,
    update: null,
    downloading: false,
    downloadProgress: 0,
    downloadedBytes: 0,
    totalBytes: 0
  };

  async function checkForUpdatesManual() {
    if (!window.electronAPI) {
      showNotification('App updates are only available in the Electron desktop app.', 'info');
      return;
    }

    const btn = document.getElementById('checkUpdatesBtn');
    if (updateState.downloading) {
      showNotification('Update in progress...', 'info');
      return;
    }

    if (btn) btn.classList.add('checking');

    if (window.hotCodeUpdater && typeof window.hotCodeUpdater.check === 'function') {
      try {
        showNotification('Checking for updates...', 'info');
        await window.hotCodeUpdater.check(false);
      } catch (hotErr) {
        console.error('[Electron Updater Error]:', hotErr);
        showNotification('Update check failed: ' + (hotErr.message || 'Network error'), 'error');
        resetUpdateButton();
      }
    } else {
      showNotification('Questionary Desktop is up to date!', 'success');
      resetUpdateButton();
    }

    if (btn) btn.classList.remove('checking');
  }

  function resetUpdateButton() {
    const btn = document.getElementById('checkUpdatesBtn');
    if (btn) {
      btn.innerHTML = `<i class="fas fa-sync-alt"></i>`;
      btn.title = 'Check for App Updates';
      btn.classList.remove('update-available', 'downloading', 'restarting');
    }
    updateState.available = false;
    updateState.update = null;
    updateState.downloading = false;
  }

  (function initUpdateButton() {
    function setupButton() {
      const btn = document.getElementById('checkUpdatesBtn');
      const resetSettingsBtn = document.getElementById('resetCodeCacheBtnSettings');
      const isElectron = Boolean(
        window.electronAPI ||
        (window.OfflineEngine && typeof window.OfflineEngine.isDesktopElectron === 'function' && window.OfflineEngine.isDesktopElectron())
      );

      if (btn) {
        btn.style.display = isElectron ? '' : 'none';
        btn.classList.toggle('is-hidden-env', !isElectron);
        if (isElectron && !btn.dataset.hotUpdaterBound && !btn.dataset.initialized) {
          btn.dataset.initialized = 'true';
          btn.addEventListener('click', checkForUpdatesManual);
        }
      }
      if (resetSettingsBtn) {
        resetSettingsBtn.style.display = isElectron ? '' : 'none';
      }
      if (window.OfflineEngine && typeof window.OfflineEngine.updateInstallButtons === 'function') {
        window.OfflineEngine.updateInstallButtons();
      }
    }
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        setupButton();
        checkForUpdatesOnStartup();
      });
    } else {
      setupButton();
      checkForUpdatesOnStartup();
    }
    setTimeout(setupButton, 1000);
  })();

  async function checkForUpdatesOnStartup() {
    if (!window.electronAPI || !window.hotCodeUpdater || typeof window.hotCodeUpdater.check !== 'function') {
      return;
    }
    // Non-blocking background check: notifies user and asks permission before updating
    setTimeout(() => {
      if (navigator.onLine !== false) {
        window.hotCodeUpdater.check(true).catch(() => {});
      }
    }, 2800);
  }

  document.addEventListener('DOMContentLoaded', () => {
    initSettingsDropdown();
    initHamburgerMenu();
  });

  window.addEventListener('message', async function(e) {
    const pdfViewer = document.getElementById('pdfViewer');
    const expectedOrigin = window.location.origin;
    if (window.location.protocol !== 'file:' && expectedOrigin && expectedOrigin !== 'null' && e.origin !== expectedOrigin) return;
    if (pdfViewer && pdfViewer.contentWindow && e.source !== pdfViewer.contentWindow) return;
    if (e.data && e.data.type === 'openInNewWindow' && e.data.url) {
      openUrlInExternalWindow(e.data.url);
    }
  });

  async function openUrlInExternalWindow(url) {
    if (!url || !isSafeDocumentUrl(url)) {
      showNotification('Blocked unsafe external URL', 'error');
      return;
    }

    try {
      const a = document.createElement('a');
      a.href = url;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      document.body.appendChild(a);
      a.click();
      setTimeout(() => a.remove(), 100);
      showNotification('Opened document in new window', 'info');
    } catch (e) {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  }
  window.openUrlInExternalWindow = openUrlInExternalWindow;

  document.addEventListener('click', (e) => {
    const resetBtn = e.target.closest('#resetCodeCacheBtn, #resetCodeCacheBtnSettings, .reset-cache-btn');
    if (resetBtn) {
      e.preventDefault();
      e.stopPropagation();
      setUserDropdownOpen(false);

      const doReset = () => {
        if (window.hotCodeUpdater && typeof window.hotCodeUpdater.resetCache === 'function') {
          window.hotCodeUpdater.resetCache();
        } else {
          localStorage.removeItem('questionary-code-files');
          localStorage.removeItem('questionary-installed-commit-sha');
          location.reload();
        }
      };

      if (typeof showConfirm === 'function') {
        showConfirm('Clear stored hot-code updates and re-sync directly from GitHub?', {
          title: 'Reset Code Cache',
          confirmText: 'Reset & Sync',
          type: 'warning'
        }).then(yes => { if (yes) doReset(); });
      } else if (confirm('Clear stored hot-code updates and re-sync directly from GitHub?')) {
        doReset();
      }
    }
  });

  function initHomeSyncButton() {
    const syncBtn = document.getElementById('homeSyncBtn');
    if (syncBtn && !syncBtn.dataset.initialized) {
      syncBtn.dataset.initialized = 'true';
      syncBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();

        const doReset = () => {
          if (window.hotCodeUpdater && typeof window.hotCodeUpdater.resetCache === 'function') {
            window.hotCodeUpdater.resetCache();
          } else {
            localStorage.removeItem('questionary-code-files');
            localStorage.removeItem('questionary-installed-commit-sha');
            delete window._HOT_APP_JS_LOADED;
            location.reload();
          }
        };

        if (typeof window.showConfirm === 'function') {
          window.showConfirm('Force re-sync code from GitHub and clear local cache?', {
            title: 'Force Re-sync Code',
            confirmText: 'Sync Now',
            type: 'warning'
          }).then(yes => { if (yes) doReset(); });
        } else if (confirm('Force re-sync code from GitHub and clear local cache?')) {
          doReset();
        }
      });
    }
  }
  document.addEventListener('DOMContentLoaded', initHomeSyncButton);
  setTimeout(initHomeSyncButton, 1000);
}

// Delegated Accessibility handled cleanly by js/accessibility.js

