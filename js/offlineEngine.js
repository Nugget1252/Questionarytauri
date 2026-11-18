/* =========================================================================
 * Questionary Offline Runtime Engine
 * - IndexedDB binary PDF cache (QuestionaryOfflineDocs) for Web & Capacitor
 * - Live connectivity detection & unobtrusive status indicator
 * - Installable PWA lifecycle (beforeinstallprompt + iOS Safari guide)
 * - Service Worker lifecycle & live offline readiness preflight diagnostics
 * ========================================================================= */
(function () {
  'use strict';

  const DB_NAME = 'QuestionaryOfflineDocs';
  const DB_VERSION = 1;
  const STORE_NAME = 'pdfs';
  const OBJECT_URL_CACHE = new Map();

  let dbPromise = null;
  let deferredInstallPrompt = null;
  let isInstalledApp = false;
  let isIOSDevice = false;
  let _cachedDatabaseBytes = null;
  let _databaseLoadPromise = null;

  const OPFS_DIR_NAME = 'questionary-offline-pdfs';
  const CACHE_DOCS_NAME = 'questionary-docs-v1';

  function isDesktopElectron() {
    if (typeof window === 'undefined') return false;
    if (window.electronAPI) return true;
    try {
      if (window.process && window.process.versions && window.process.versions.electron) return true;
      if (typeof navigator !== 'undefined' && /\bElectron\b/i.test(navigator.userAgent || '')) return true;
    } catch (e) {}
    return false;
  }

  function isCapacitorNative() {
    return Boolean(typeof window !== 'undefined' && window.Capacitor);
  }

  function getRuntimeContext() {
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
      isElectron: isDesktopElectron(),
      isCapacitor: isCapacitorNative(),
      origin: loc.origin && loc.origin !== 'null' ? loc.origin : '',
      baseHref: cleanHref,
      baseDir
    };
  }

  function resolveRuntimeUrl(relPath) {
    if (!relPath || typeof relPath !== 'string') return '';
    const trimmed = relPath.trim();
    if (/^(https?:|blob:|data:|local-pdf:|capacitor:)/i.test(trimmed)) {
      return trimmed;
    }
    const ctx = getRuntimeContext();
    const cleanRel = trimmed.replace(/^(\.\/)+/, '').replace(/^\/+/, '');
    if (ctx.baseDir) {
      try {
        return new URL(cleanRel, ctx.baseDir).href;
      } catch (e) {
        return `${ctx.baseDir}${cleanRel}`;
      }
    }
    return cleanRel;
  }

  function buildDatabaseCandidateUrls() {
    const ctx = getRuntimeContext();
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

    // 1. Context-resolved URLs relative to index.html directory (works in both dev server and file:// production)
    for (const rel of relativeNames) {
      addUrl(resolveRuntimeUrl(rel));
    }

    // 2. Relative path forms
    for (const rel of relativeNames) {
      addUrl(`./${rel}`);
      addUrl(rel);
    }

    // 3. Origin-root paths ONLY for HTTP/HTTPS dev/web servers (never on file:// where /questionary.db points to OS root)
    if (ctx.isDevServer && ctx.origin) {
      for (const rel of relativeNames) {
        addUrl(`${ctx.origin}/${rel}`);
      }
      for (const rel of relativeNames) {
        addUrl(`/${rel}`);
      }
    }

    return urls;
  }

  function isValidSqliteHeader(u8) {
    if (!u8 || u8.byteLength < 100) return false;
    return (
      u8[0] === 0x53 &&
      u8[1] === 0x51 &&
      u8[2] === 0x4c &&
      u8[3] === 0x69 &&
      u8[4] === 0x74 &&
      u8[5] === 0x65
    );
  }

  function isValidPdfHeader(u8) {
    if (!u8 || u8.byteLength < 16) return false;
    for (let i = 0; i <= Math.min(12, u8.byteLength - 4); i++) {
      if (u8[i] === 0x25 && u8[i + 1] === 0x50 && u8[i + 2] === 0x44 && u8[i + 3] === 0x46) {
        return true;
      }
    }
    return false;
  }

  async function fetchBinaryWithDiagnostics(url, options = {}) {
    const ctx = getRuntimeContext();
    const requireSqliteHeader = Boolean(options.requireSqliteHeader);
    const requirePdfHeader = Boolean(options.requirePdfHeader);
    const signal = options.signal || undefined;
    const isCrossOrigin = /^https?:\/\//i.test(url) && (!ctx.origin || !url.startsWith(ctx.origin));

    // 1. Use fetch() + stream reader in HTTP/HTTPS contexts
    if (!ctx.isFileProtocol && typeof fetch === 'function') {
      try {
        const res = await fetch(url, {
          cache: 'no-cache',
          credentials: isCrossOrigin ? 'omit' : 'same-origin',
          signal
        });
        if (!res.ok) {
          if (res.status === 404) {
            console.warn(`[OfflineEngine] 404 Not Found when requesting: ${url}`);
          } else if (res.status === 401 || res.status === 403) {
            console.warn(`[OfflineEngine] Permission Denied (HTTP ${res.status}) when requesting: ${url}`);
          } else {
            console.warn(`[OfflineEngine] HTTP ${res.status} (${res.statusText}) when requesting: ${url}`);
          }
          return null;
        }
        const ct = ((res.headers && res.headers.get('content-type')) || '').toLowerCase();
        if ((requireSqliteHeader || requirePdfHeader) && ct.includes('text/html')) {
          console.warn(`[OfflineEngine] Received HTML fallback instead of binary file from: ${url}`);
          return null;
        }

        const expectedLenHeader = res.headers && !res.headers.get('content-encoding')
          ? parseInt(res.headers.get('content-length') || '0', 10)
          : 0;

        let u8 = null;
        if (res.body && typeof res.body.getReader === 'function') {
          const reader = res.body.getReader();
          const chunks = [];
          let totalBytes = 0;
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            if (value && value.byteLength > 0) {
              chunks.push(value);
              totalBytes += value.byteLength;
            }
          }
          if (expectedLenHeader > 0 && totalBytes < expectedLenHeader) {
            console.warn(`[OfflineEngine] Truncated mobile stream (${totalBytes}/${expectedLenHeader} bytes) from: ${url}`);
            return null;
          }
          u8 = new Uint8Array(totalBytes);
          let offset = 0;
          for (const chunk of chunks) {
            u8.set(chunk, offset);
            offset += chunk.byteLength;
          }
        } else {
          const ab = await res.arrayBuffer();
          u8 = new Uint8Array(ab);
          if (expectedLenHeader > 0 && u8.byteLength < expectedLenHeader) {
            console.warn(`[OfflineEngine] Truncated response (${u8.byteLength}/${expectedLenHeader} bytes) from: ${url}`);
            return null;
          }
        }

        if (requireSqliteHeader && !isValidSqliteHeader(u8)) {
          console.warn(`[OfflineEngine] Invalid SQLite header (${u8.byteLength} bytes) from: ${url}`);
          return null;
        }
        if (requirePdfHeader && !isValidPdfHeader(u8)) {
          console.warn(`[OfflineEngine] Invalid PDF header (${u8.byteLength} bytes) from: ${url}`);
          return null;
        }
        return u8;
      } catch (fetchErr) {
        if (fetchErr && fetchErr.name === 'AbortError') throw fetchErr;
        console.warn(`[OfflineEngine] fetch() error for ${url} (${fetchErr && fetchErr.message ? fetchErr.message : fetchErr}) — trying XMLHttpRequest fallback`);
      }
    }

    // 2. XMLHttpRequest (supports local file:// protocol status 0 as well as HTTP status 200)
    return await new Promise((resolve, reject) => {
      try {
        if (signal && signal.aborted) {
          const err = new Error('Aborted');
          err.name = 'AbortError';
          reject(err);
          return;
        }
        const xhr = new XMLHttpRequest();
        xhr.open('GET', url, true);
        xhr.responseType = 'arraybuffer';
        if (signal) {
          signal.addEventListener('abort', () => {
            try { xhr.abort(); } catch (e) {}
            const err = new Error('Aborted');
            err.name = 'AbortError';
            reject(err);
          }, { once: true });
        }
        xhr.onload = () => {
          if ((xhr.status === 200 || (xhr.status === 0 && xhr.response)) && xhr.response) {
            const u8 = new Uint8Array(xhr.response);
            if (u8.byteLength === 0) {
              console.warn(`[OfflineEngine] Empty file (0 bytes / possible 404 on file://) at path: ${url}`);
              resolve(null);
              return;
            }
            if (requireSqliteHeader && !isValidSqliteHeader(u8)) {
              console.warn(`[OfflineEngine] Invalid SQLite header (${u8.byteLength} bytes) via XHR from: ${url}`);
              resolve(null);
              return;
            }
            if (requirePdfHeader && !isValidPdfHeader(u8)) {
              console.warn(`[OfflineEngine] Invalid PDF header (${u8.byteLength} bytes) via XHR from: ${url}`);
              resolve(null);
              return;
            }
            resolve(u8);
            return;
          }
          if (xhr.status === 404) {
            console.warn(`[OfflineEngine] 404 Not Found via XHR at path: ${url}`);
          } else if (xhr.status === 401 || xhr.status === 403) {
            console.warn(`[OfflineEngine] Permission Denied (status ${xhr.status}) via XHR at path: ${url}`);
          } else {
            console.warn(`[OfflineEngine] XHR status ${xhr.status} at path: ${url}`);
          }
          resolve(null);
        };
        xhr.onerror = () => {
          console.warn(
            `[OfflineEngine] XHR network/file error at path: ${url} ` +
            (ctx.isFileProtocol
              ? '(404 File Not Found or local file:// permission restriction)'
              : '(Network error or CORS/permission issue)')
          );
          resolve(null);
        };
        xhr.ontimeout = () => {
          console.warn(`[OfflineEngine] XHR timeout at path: ${url}`);
          resolve(null);
        };
        xhr.send(null);
      } catch (xhrErr) {
        console.warn(`[OfflineEngine] Exception requesting ${url}:`, xhrErr && xhrErr.message ? xhrErr.message : xhrErr);
        resolve(null);
      }
    });
  }

  async function probeAssetExists(relPath) {
    const resolvedUrl = resolveRuntimeUrl(relPath);
    const ctx = getRuntimeContext();
    console.log(`[OfflineEngine] Probing asset path: ${resolvedUrl} (raw: ${relPath})`);

    if (!ctx.isFileProtocol && typeof fetch === 'function') {
      try {
        const res = await fetch(resolvedUrl, { method: 'HEAD', cache: 'no-cache' });
        if (res.ok) return true;
        if (res.status === 405 || res.status === 404) {
          const getRes = await fetch(resolvedUrl, { method: 'GET', cache: 'no-cache' });
          if (getRes.ok) return true;
        }
        console.warn(`[OfflineEngine] Asset probe returned HTTP ${res.status} for: ${resolvedUrl}`);
      } catch (e) {
        console.warn(`[OfflineEngine] Asset probe fetch failed for ${resolvedUrl}:`, e && e.message ? e.message : e);
      }
    }

    const bytes = await fetchBinaryWithDiagnostics(resolvedUrl, { requireSqliteHeader: false });
    return Boolean(bytes && bytes.byteLength > 0);
  }

  async function loadDatabaseBinary() {
    if (_cachedDatabaseBytes && isValidSqliteHeader(_cachedDatabaseBytes)) {
      return _cachedDatabaseBytes;
    }
    if (_databaseLoadPromise) return _databaseLoadPromise;

    _databaseLoadPromise = (async () => {
      const ctx = getRuntimeContext();
      console.log(
        `[OfflineEngine] Starting database binary resolution (protocol=${ctx.protocol}, isElectron=${ctx.isElectron}, baseDir=${ctx.baseDir})`
      );

      // 1. Electron IPC direct disk read (bypasses file:// permission restrictions completely)
      if (ctx.isElectron && window.electronAPI && typeof window.electronAPI.readDatabaseFile === 'function') {
        try {
          console.log('[OfflineEngine] Requesting database via Electron IPC (read-database-file)...');
          const ipcBytes = await window.electronAPI.readDatabaseFile();
          if (ipcBytes) {
            const u8 = ipcBytes instanceof Uint8Array ? ipcBytes : new Uint8Array(ipcBytes);
            if (isValidSqliteHeader(u8)) {
              console.log(`[OfflineEngine] Database loaded via Electron IPC (${u8.byteLength} bytes)`);
              _cachedDatabaseBytes = u8;
              return u8;
            }
          }
          console.warn('[OfflineEngine] Electron IPC readDatabaseFile returned empty/invalid buffer, falling back to URL candidates');
        } catch (ipcErr) {
          console.warn('[OfflineEngine] Electron IPC readDatabaseFile error:', ipcErr && ipcErr.message ? ipcErr.message : ipcErr);
        }
      }

      // 2. Probe context-aware candidate URLs
      const candidateUrls = buildDatabaseCandidateUrls();
      console.log('[OfflineEngine] Candidate database URLs to try:', candidateUrls);

      for (const candidateUrl of candidateUrls) {
        const u8 = await fetchBinaryWithDiagnostics(candidateUrl, { requireSqliteHeader: true });
        if (u8 && isValidSqliteHeader(u8)) {
          _cachedDatabaseBytes = u8;
          console.log(`[OfflineEngine] Database binary resolved from: ${candidateUrl} (${u8.byteLength} bytes)`);
          return u8;
        }
      }

      // 3. Service Worker Cache Storage fallback
      if (typeof caches !== 'undefined' && typeof caches.match === 'function') {
        for (const key of ['./questionary.db', 'questionary.db', '/questionary.db', './database.db', 'database.db']) {
          try {
            const cachedRes = await caches.match(key);
            if (cachedRes && cachedRes.ok) {
              const ab = await cachedRes.arrayBuffer();
              const u8 = new Uint8Array(ab);
              if (isValidSqliteHeader(u8)) {
                console.log(`[OfflineEngine] Database loaded from CacheStorage (${key}, ${u8.byteLength} bytes)`);
                _cachedDatabaseBytes = u8;
                return u8;
              }
            }
          } catch (e) {}
        }
      }

      console.warn('[OfflineEngine] All primary and secondary database file paths were unreachable.');
      return null;
    })();

    try {
      return await _databaseLoadPromise;
    } finally {
      _databaseLoadPromise = null;
    }
  }

  function normalizeDocPath(rawPath) {
    if (!rawPath || typeof rawPath !== 'string') return '';
    let p = rawPath.trim();
    if (p.startsWith('blob:') || p.startsWith('data:') || p.startsWith('blob-id:')) return p;

    try {
      if (/^https?:\/\//i.test(p)) {
        const parsed = new URL(p);
        p = parsed.pathname;
      }
    } catch (e) {}

    try {
      p = decodeURIComponent(p);
    } catch (e) {}

    p = p.replace(/\\/g, '/').replace(/^(\.\/)+/, '').replace(/^\/+/, '');
    p = p.replace(/^Nugget1252\/Questionarytauri\/Electron\//i, '');
    p = p.replace(/^(documentshd|documents)\//i, '');
    return p;
  }

  function openDocsDb() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      if (typeof indexedDB === 'undefined') {
        return reject(new Error('IndexedDB unavailable'));
      }
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'path' });
          store.createIndex('subject', 'subject', { unique: false });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error('IndexedDB open failed'));
    });
    return dbPromise;
  }

  async function requestPersistentStorage() {
    if (navigator.storage && typeof navigator.storage.persist === 'function') {
      try {
        return await navigator.storage.persist();
      } catch (e) {}
    }
    return false;
  }

  function makeSafeStorageFileId(key) {
    let h1 = 0x811c9dc5;
    let h2 = 0x12345678;
    for (let i = 0; i < key.length; i++) {
      const c = key.charCodeAt(i);
      h1 ^= c;
      h1 = Math.imul(h1, 0x01000193);
      h2 = Math.imul(h2 ^ c, 2654435761);
    }
    const hex = ((h1 >>> 0).toString(36) + '_' + (h2 >>> 0).toString(36));
    return `doc_${hex}.pdf`;
  }

  function buildCacheStorageKey(key) {
    const clean = String(key || '').replace(/^\/+/, '').replace(/^(documentshd|documents)\//i, '');
    const encoded = clean.split('/').map((s) => encodeURIComponent(s)).join('/');
    try {
      return new URL(`documents/${encoded}`, window.location.href).href;
    } catch (e) {
      return `documents/${encoded}`;
    }
  }

  async function getOpfsDir(create = false) {
    if (!navigator.storage || typeof navigator.storage.getDirectory !== 'function') return null;
    try {
      const root = await navigator.storage.getDirectory();
      return await root.getDirectoryHandle(OPFS_DIR_NAME, { create });
    } catch (e) {
      return null;
    }
  }

  async function putPdfOpfs(key, blob) {
    const dir = await getOpfsDir(true);
    if (!dir) return false;
    const fileId = makeSafeStorageFileId(key);
    const fileHandle = await dir.getFileHandle(fileId, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(blob);
    await writable.close();
    return true;
  }

  async function getPdfOpfs(key) {
    const dir = await getOpfsDir(false);
    if (!dir) return null;
    try {
      const fileId = makeSafeStorageFileId(key);
      const fh = await dir.getFileHandle(fileId);
      const file = await fh.getFile();
      return file && file.size > 0 ? file : null;
    } catch (e) {
      return null;
    }
  }

  async function putPdfCacheStorage(key, blob, meta = {}) {
    if (typeof caches === 'undefined') return false;
    const cache = await caches.open(CACHE_DOCS_NAME);
    const cacheUrl = buildCacheStorageKey(key);
    const headers = {
      'Content-Type': 'application/pdf',
      'Content-Length': String(blob.size || 0),
      'X-Questionary-RelPath': encodeURIComponent(key),
      'X-Questionary-Subject': encodeURIComponent(meta.subject || 'General')
    };
    await cache.put(cacheUrl, new Response(blob, { status: 200, headers }));
    return true;
  }

  async function getPdfCacheStorage(key) {
    if (typeof caches === 'undefined') return null;
    try {
      const cache = await caches.open(CACHE_DOCS_NAME);
      const cacheUrl = buildCacheStorageKey(key);
      const res = await cache.match(cacheUrl, { ignoreSearch: true });
      if (!res || !res.ok) return null;
      const ct = (res.headers.get('content-type') || '').toLowerCase();
      if (ct.includes('text/html')) return null;
      const blob = await res.blob();
      return blob && blob.size > 0 ? blob : null;
    } catch (e) {
      return null;
    }
  }

  async function putPdf(rawPath, blob, meta = {}) {
    const key = normalizeDocPath(rawPath);
    if (!key || !blob) return false;

    const record = {
      path: key,
      blob: blob,
      byteLength: blob.size || 0,
      subject: meta.subject || 'General',
      quality: meta.quality || (localStorage.getItem('questionary-quality-profile') || 'sd'),
      filename: meta.filename || key.split('/').pop(),
      cachedAt: Date.now()
    };

    // Tier 1: IndexedDB (store ArrayBuffer fallback if Blob cloning fails on mobile Safari/WebView)
    try {
      const db = await openDocsDb();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const req = tx.objectStore(STORE_NAME).put(record);
        tx.oncomplete = () => resolve(true);
        req.onerror = () => reject(req.error);
        tx.onerror = () => reject(tx.error);
      });
      return true;
    } catch (idbErr) {
      console.warn('[OfflineEngine] IndexedDB PDF put failed, trying OPFS/CacheStorage fallback:', idbErr && idbErr.message ? idbErr.message : idbErr);
    }

    // Tier 2: Origin Private File System (OPFS)
    try {
      if (await putPdfOpfs(key, blob)) {
        return true;
      }
    } catch (opfsErr) {
      console.warn('[OfflineEngine] OPFS PDF put failed, trying CacheStorage fallback:', opfsErr && opfsErr.message ? opfsErr.message : opfsErr);
    }

    // Tier 3: Cache Storage API
    try {
      if (await putPdfCacheStorage(key, blob, meta)) {
        return true;
      }
    } catch (cacheErr) {
      console.warn('[OfflineEngine] CacheStorage PDF put failed:', cacheErr && cacheErr.message ? cacheErr.message : cacheErr);
    }

    return false;
  }

  async function getPdfRecord(rawPath) {
    const key = normalizeDocPath(rawPath);
    if (!key) return null;
    try {
      const db = await openDocsDb();
      return await new Promise((resolve) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const req = tx.objectStore(STORE_NAME).get(key);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => resolve(null);
      });
    } catch (e) {
      return null;
    }
  }

  async function getPdfBlob(rawPath) {
    const key = normalizeDocPath(rawPath);
    if (!key) return null;

    const rec = await getPdfRecord(key);
    if (rec && rec.blob) return rec.blob;

    const opfsBlob = await getPdfOpfs(key);
    if (opfsBlob) return opfsBlob;

    const cacheBlob = await getPdfCacheStorage(key);
    if (cacheBlob) return cacheBlob;

    return null;
  }

  async function hasPdf(rawPath) {
    const key = normalizeDocPath(rawPath);
    if (!key) return false;
    try {
      const db = await openDocsDb();
      const inIdb = await new Promise((resolve) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const req = tx.objectStore(STORE_NAME).getKey(key);
        req.onsuccess = () => resolve(req.result !== undefined);
        req.onerror = () => resolve(false);
      });
      if (inIdb) return true;
    } catch (e) {}

    if (await getPdfOpfs(key)) return true;
    if (await getPdfCacheStorage(key)) return true;
    return false;
  }

  async function getPdfObjectUrl(rawPath) {
    const key = normalizeDocPath(rawPath);
    if (!key) return null;
    if (OBJECT_URL_CACHE.has(key)) {
      return OBJECT_URL_CACHE.get(key);
    }
    const blob = await getPdfBlob(key);
    if (!blob) return null;
    const typedBlob = blob.type === 'application/pdf' ? blob : new Blob([blob], { type: 'application/pdf' });
    const objUrl = URL.createObjectURL(typedBlob);
    OBJECT_URL_CACHE.set(key, objUrl);
    return objUrl;
  }

  async function fetchAndCachePdf(urlOrCandidates, meta = {}) {
    const rawInputs = Array.isArray(urlOrCandidates) ? urlOrCandidates : [urlOrCandidates];
    const firstInput = String(rawInputs[0] || '');
    const cleanRel = normalizeDocPath(meta.relPath || firstInput);
    const candidateDocUrls = [];

    for (const entry of rawInputs) {
      if (!entry || typeof entry !== 'string') continue;
      if (/^(https?:|blob:|local-pdf:)/i.test(entry)) {
        candidateDocUrls.push(entry);
      } else {
        const normalizedEntry = normalizeDocPath(entry);
        candidateDocUrls.push(resolveRuntimeUrl(`documents/${normalizedEntry}`));
        candidateDocUrls.push(`documents/${normalizedEntry}`);
        if (getRuntimeContext().isDevServer) {
          candidateDocUrls.push(`/documents/${normalizedEntry}`);
        }
      }
    }

    let lastStatusError = null;
    for (const fetchUrl of Array.from(new Set(candidateDocUrls))) {
      const bytes = await fetchBinaryWithDiagnostics(fetchUrl, {
        requireSqliteHeader: false,
        requirePdfHeader: true,
        signal: meta.signal
      });
      if (bytes && bytes.byteLength > 0) {
        const blob = new Blob([bytes], { type: 'application/pdf' });
        await putPdf(cleanRel || firstInput, blob, meta);
        return { blob, byteLength: blob.size };
      }
      lastStatusError = `Unreachable or invalid PDF at ${fetchUrl}`;
    }

    throw new Error(lastStatusError || 'Document fetch failed');
  }

  async function getStats() {
    let fileCount = 0;
    let totalBytes = 0;
    const subjects = {};
    const backends = [];

    try {
      const db = await openDocsDb();
      const idbRes = await new Promise((resolve) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        let cnt = 0;
        let bytesSum = 0;
        const subMap = {};
        const cursorReq = store.openCursor();
        cursorReq.onsuccess = (e) => {
          const cursor = e.target.result;
          if (cursor) {
            const val = cursor.value;
            const b = val.byteLength || (val.blob ? val.blob.size : 0);
            cnt++;
            bytesSum += b;
            const subj = val.subject || 'General';
            if (!subMap[subj]) subMap[subj] = { count: 0, bytes: 0 };
            subMap[subj].count++;
            subMap[subj].bytes += b;
            cursor.continue();
          } else {
            resolve({ cnt, bytesSum, subMap });
          }
        };
        cursorReq.onerror = () => resolve({ cnt: 0, bytesSum: 0, subMap: {} });
      });
      if (idbRes.cnt > 0) backends.push('IndexedDB');
      fileCount += idbRes.cnt;
      totalBytes += idbRes.bytesSum;
      Object.assign(subjects, idbRes.subMap);
    } catch (e) {}

    // Check OPFS fallback entries
    try {
      const dir = await getOpfsDir(false);
      if (dir && typeof dir.values === 'function') {
        let opfsCount = 0;
        for await (const entry of dir.values()) {
          if (entry.kind === 'file') {
            const file = await entry.getFile();
            opfsCount++;
            fileCount++;
            totalBytes += file.size || 0;
          }
        }
        if (opfsCount > 0) backends.push('OPFS');
      }
    } catch (e) {}

    // Check CacheStorage fallback entries (when IDB/OPFS not already counted)
    if (fileCount === 0 && typeof caches !== 'undefined') {
      try {
        const cache = await caches.open(CACHE_DOCS_NAME);
        const keys = await cache.keys();
        if (keys.length > 0) {
          backends.push('CacheStorage');
          for (const req of keys) {
            const res = await cache.match(req);
            const len = res ? parseInt(res.headers.get('content-length') || '0', 10) : 0;
            fileCount++;
            totalBytes += Number.isNaN(len) ? 0 : len;
          }
        }
      } catch (e) {}
    }

    return { fileCount, totalBytes, subjects, backends };
  }

  async function clearAllCachedPdfs() {
    OBJECT_URL_CACHE.forEach((url) => {
      try { URL.revokeObjectURL(url); } catch (e) {}
    });
    OBJECT_URL_CACHE.clear();
    try {
      const db = await openDocsDb();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const req = tx.objectStore(STORE_NAME).clear();
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    } catch (e) {}
    try {
      if (navigator.storage && typeof navigator.storage.getDirectory === 'function') {
        const root = await navigator.storage.getDirectory();
        await root.removeEntry(OPFS_DIR_NAME, { recursive: true });
      }
    } catch (e) {}
    if (typeof caches !== 'undefined') {
      try { await caches.delete(CACHE_DOCS_NAME); } catch (e) {}
    }
    return true;
  }

  /* ---------- Connectivity Banner & Event Dispatcher ---------- */
  function isOnline() {
    return typeof navigator !== 'undefined' ? navigator.onLine !== false : true;
  }

  function updateOfflineBanner() {
    const banner = document.getElementById('offlineStatusBanner');
    if (banner) {
      banner.style.display = isOnline() ? 'none' : 'flex';
    }
    window.dispatchEvent(new CustomEvent('questionary:connectivity', {
      detail: { online: isOnline() }
    }));
  }

  /* ---------- PWA Install Lifecycle ---------- */
  function detectPwaEnvironment() {
    const isElectron = isDesktopElectron();
    isInstalledApp =
      window.matchMedia('(display-mode: standalone)').matches ||
      window.navigator.standalone === true ||
      isElectron ||
      isCapacitorNative();

    const ua = (window.navigator.userAgent || '').toLowerCase();
    isIOSDevice = /iphone|ipad|ipod/.test(ua) && !isInstalledApp;

    if (typeof document !== 'undefined') {
      if (document.documentElement) {
        document.documentElement.classList.toggle('desktop-electron-app', isElectron);
        document.documentElement.classList.toggle('installed-app-env', isInstalledApp);
      }
      if (document.body) {
        document.body.classList.toggle('desktop-electron-app', isElectron);
        document.body.classList.toggle('installed-app-env', isInstalledApp);
      }
    }
  }

  function updateInstallButtons() {
    detectPwaEnvironment();
    const headerBtn = document.getElementById('pwaInstallHeaderBtn');
    const settingsBtn = document.getElementById('pwaInstallSettingsBtn');
    const isElectron = isDesktopElectron();
    const showBtn = !isElectron && !isInstalledApp && (Boolean(deferredInstallPrompt) || isIOSDevice);

    [headerBtn, settingsBtn].forEach((btn) => {
      if (!btn) return;
      btn.hidden = !showBtn;
      btn.disabled = !showBtn || isElectron || isInstalledApp;
      btn.setAttribute('aria-hidden', String(!showBtn));
      btn.classList.toggle('is-hidden-env', !showBtn);
      btn.style.display = showBtn ? 'inline-flex' : 'none';
      const labelEl = btn.querySelector('.pwa-install-label');
      if (labelEl) {
        labelEl.textContent = isIOSDevice ? 'Install on iOS' : 'Install App';
      }
    });
  }

  async function triggerInstall() {
    detectPwaEnvironment();
    if (isInstalledApp) {
      if (typeof window.showNotification === 'function') {
        window.showNotification('Questionary is already running as an installed app.', 'info');
      }
      return false;
    }

    if (deferredInstallPrompt) {
      try {
        await deferredInstallPrompt.prompt();
        const choice = await deferredInstallPrompt.userChoice;
        if (choice && choice.outcome === 'accepted') {
          deferredInstallPrompt = null;
          isInstalledApp = true;
          updateInstallButtons();
          return true;
        }
      } catch (e) {}
      return false;
    }

    if (isIOSDevice) {
      const modal = document.getElementById('iosInstallModal');
      if (modal) modal.classList.add('active');
      return true;
    }

    return false;
  }

  /* ---------- Service Worker Registration & Status ---------- */
  async function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return null;
    if (window.location.protocol !== 'https:' && window.location.protocol !== 'http:') {
      console.log(`[OfflineEngine] Skipping Service Worker registration on protocol ${window.location.protocol}`);
      return null;
    }
    const swUrl = resolveRuntimeUrl('sw.js');
    try {
      console.log(`[OfflineEngine] Registering Service Worker at: ${swUrl}`);
      const reg = await navigator.serviceWorker.register('./sw.js', { scope: './' });
      return reg;
    } catch (e) {
      console.warn('[OfflineEngine] Service Worker registration skipped:', e.message);
      return null;
    }
  }

  async function getSwCacheStatus() {
    if (isDesktopElectron() || isCapacitorNative()) {
      return { supported: true, mode: isDesktopElectron() ? 'electron-bundle' : 'capacitor-bundle', shellCount: 1, docsCount: 0 };
    }
    if (!('serviceWorker' in navigator)) {
      return { supported: false, mode: 'unsupported', shellCount: 0, docsCount: 0 };
    }
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const worker = (reg && (reg.active || reg.waiting || reg.installing)) || navigator.serviceWorker.controller;
      if (!worker) {
        return { supported: true, active: false, shellCount: 0, docsCount: 0 };
      }
      return await new Promise((resolve) => {
        const channel = new MessageChannel();
        const timer = setTimeout(() => resolve({ supported: true, active: Boolean(navigator.serviceWorker.controller), shellCount: 0, docsCount: 0 }), 1200);
        channel.port1.onmessage = (ev) => {
          clearTimeout(timer);
          resolve({ supported: true, active: Boolean(reg && reg.active), ...(ev.data || {}) });
        };
        worker.postMessage({ type: 'GET_CACHE_STATUS' }, [channel.port2]);
      });
    } catch (e) {
      return { supported: true, active: false, shellCount: 0, docsCount: 0 };
    }
  }

  /* ---------- Preflight Readiness Check ---------- */
  async function runPreflightCheck() {
    console.log('[OfflineEngine] Running offline readiness preflight check...');
    const checks = [];

    // 1. Local Fonts & Icons
    let fontsLoaded = false;
    try {
      if (document.fonts && typeof document.fonts.check === 'function') {
        fontsLoaded = document.fonts.check('14px "DM Sans"') || document.fonts.size > 0;
      }
    } catch (e) {}
    const faSheet = Array.from(document.styleSheets || []).some((s) => (s.href || '').includes('fontawesome'));
    checks.push({
      id: 'fontsIcons',
      label: 'Self-Hosted Fonts & Icons',
      ok: Boolean(faSheet || fontsLoaded),
      detail: `${fontsLoaded ? 'DM Sans + Mono ready' : 'System font fallback'} · ${faSheet ? 'Font Awesome local' : 'Icons checking'}`
    });

    // 2. Local Viewer & Security Libraries (works on both dev http:// and production file://)
    const hasMarked = typeof window.marked !== 'undefined';
    const hasMammoth = typeof window.mammoth !== 'undefined';
    const hasPurify = typeof window.DOMPurify !== 'undefined';
    const hasSql = typeof window.initSqlJs !== 'undefined';
    const hasPdfJs = await probeAssetExists('js/vendor/pdf.min.mjs');
    checks.push({
      id: 'viewerLibs',
      label: 'Local Viewer & Sanitizer Libraries',
      ok: hasMarked && hasMammoth && hasPurify && hasSql && hasPdfJs,
      detail: [
        hasPdfJs ? 'PDF.js 4.8' : 'PDF.js missing',
        hasMarked ? 'Marked' : 'Marked missing',
        hasMammoth ? 'Mammoth' : 'Mammoth missing',
        hasPurify ? 'DOMPurify' : 'DOMPurify missing',
        hasSql ? 'SQL.js' : 'SQL.js missing'
      ].join(' · ')
    });

    // 3. App Shell Cache / Runtime Bundle
    const sw = await getSwCacheStatus();
    const isNativeShell = isDesktopElectron() || isCapacitorNative();
    checks.push({
      id: 'appShellSw',
      label: 'Offline App Shell Cache',
      ok: isNativeShell || Boolean(sw.active && sw.shellCount > 0),
      detail: isNativeShell
        ? (isDesktopElectron() ? 'Electron ASAR local bundle' : 'Capacitor bundled web assets')
        : (sw.active ? `Service Worker active · ${sw.shellCount} assets cached` : 'Service Worker inactive')
    });

    // 4. SQLite Library Index
    let docCount = 0;
    try {
      if (window.DbService) {
        if (typeof window.DbService.init === 'function') {
          await window.DbService.init();
        }
        if (typeof window.DbService.countDocuments === 'function') {
          docCount = await window.DbService.countDocuments();
        }
      }
    } catch (e) {
      console.warn('[OfflineEngine] Preflight DbService check failed:', e);
    }
    checks.push({
      id: 'sqliteDb',
      label: 'Local Study Catalog Database',
      ok: docCount > 0,
      detail: docCount > 0 ? `${docCount} documents indexed locally` : 'Catalog not yet populated'
    });

    // 5. Offline PDFs & Persistent Storage
    let docsOk = false;
    let docsDetail = 'No offline PDFs cached yet';
    let persisted = false;
    let quotaText = '';
    if (navigator.storage && typeof navigator.storage.persisted === 'function') {
      try { persisted = await navigator.storage.persisted(); } catch (e) {}
    }
    if (navigator.storage && typeof navigator.storage.estimate === 'function') {
      try {
        const est = await navigator.storage.estimate();
        if (est && est.quota) {
          const usedMB = ((est.usage || 0) / (1024 * 1024)).toFixed(1);
          const quotaGB = (est.quota / (1024 * 1024 * 1024)).toFixed(1);
          quotaText = ` · ${usedMB} MB / ${quotaGB} GB quota`;
        }
      } catch (e) {}
    }

    if (isDesktopElectron() && window.electronAPI && typeof window.electronAPI.getStorageStats === 'function') {
      try {
        const dir = window.DownloadManager ? window.DownloadManager.storagePath : '';
        const st = await window.electronAPI.getStorageStats(dir);
        docsOk = st.fileCount > 0;
        const mb = (st.totalBytes / (1024 * 1024)).toFixed(1);
        docsDetail = docsOk ? `${st.fileCount} files (${mb} MB) on disk` : 'No local pack downloaded';
      } catch (e) {}
    } else {
      const idbStats = await getStats();
      docsOk = idbStats.fileCount > 0;
      const mb = (idbStats.totalBytes / (1024 * 1024)).toFixed(1);
      const backendLabel = (idbStats.backends && idbStats.backends.length > 0) ? idbStats.backends.join('+') : 'IndexedDB/OPFS';
      docsDetail = `${idbStats.fileCount} PDFs (${mb} MB) in ${backendLabel}${persisted ? ' · Persistent' : ''}${quotaText}`;
    }

    checks.push({
      id: 'offlineDocs',
      label: 'Offline Study Documents',
      ok: docsOk,
      detail: docsDetail
    });

    return checks;
  }

  function init() {
    const ctx = getRuntimeContext();
    console.log(
      `[OfflineEngine] Initialization sequence started (protocol=${ctx.protocol}, baseDir=${ctx.baseDir}, isElectron=${ctx.isElectron})`
    );
    detectPwaEnvironment();
    registerServiceWorker();

    // Pre-open IndexedDB document cache and pre-resolve the SQLite database binary
    openDocsDb().catch((err) => {
      console.warn('[OfflineEngine] IndexedDB openDocsDb skipped:', err && err.message ? err.message : err);
    });
    loadDatabaseBinary().catch((err) => {
      console.warn('[OfflineEngine] Background database preload warning:', err && err.message ? err.message : err);
    });

    window.addEventListener('online', updateOfflineBanner);
    window.addEventListener('offline', updateOfflineBanner);

    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferredInstallPrompt = e;
      updateInstallButtons();
    });

    window.addEventListener('appinstalled', () => {
      deferredInstallPrompt = null;
      isInstalledApp = true;
      updateInstallButtons();
      if (typeof window.showNotification === 'function') {
        window.showNotification('Questionary installed for offline access!', 'success');
      }
    });

    const onDomReady = () => {
      updateOfflineBanner();
      updateInstallButtons();
    };

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', onDomReady);
    } else {
      onDomReady();
    }
  }

  window.OfflineEngine = {
    init,
    isOnline,
    getRuntimeContext,
    resolveRuntimeUrl,
    buildDatabaseCandidateUrls,
    fetchBinaryWithDiagnostics,
    probeAssetExists,
    loadDatabaseBinary,
    normalizeDocPath,
    putPdf,
    getPdfRecord,
    getPdfBlob,
    hasPdf,
    getPdfObjectUrl,
    fetchAndCachePdf,
    getStats,
    clearAllCachedPdfs,
    requestPersistentStorage,
    getSwCacheStatus,
    runPreflightCheck,
    triggerInstall,
    updateInstallButtons,
    isDesktopElectron,
    isCapacitorNative,
    getPwaState: () => ({
      isInstalled: isInstalledApp,
      isInstallable: Boolean(deferredInstallPrompt),
      isIOS: isIOSDevice
    })
  };

  init();
})();
