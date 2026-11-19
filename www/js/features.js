

// ============================================
// QUESTIONARY ENHANCED FEATURES MODULE
// Complete Local-First Mobile & Web Engine
// ============================================

window.activeDropTargetFolderId = null;

function escapeHtml(text) {
    if (text === null || text === undefined) return '';
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function configureDomPurify() {
    if (window.DOMPurify && !window.__questionaryDomPurifyConfigured) {
        window.__questionaryDomPurifyConfigured = true;
        window.DOMPurify.addHook('afterSanitizeAttributes', function (node) {
            if (node.tagName === 'A' && node.getAttribute('target') === '_blank') {
                node.setAttribute('rel', 'noopener noreferrer');
            }
            if (node.hasAttribute && node.hasAttribute('style')) {
                const styleVal = node.getAttribute('style') || '';
                if (/url\s*\(|expression\s*\(|-moz-binding|@import|behavior\s*:/i.test(styleVal)) {
                    node.removeAttribute('style');
                }
            }
        });
    }
}

function sanitizeHtml(dirty) {
    const raw = String(dirty || '');
    configureDomPurify();
    if (window.DOMPurify && typeof window.DOMPurify.sanitize === 'function') {
        return window.DOMPurify.sanitize(raw, {
            USE_PROFILES: { html: true },
            FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form', 'input', 'button', 'textarea', 'select', 'style', 'link', 'meta', 'base'],
            FORBID_ATTR: ['onerror', 'onload', 'onclick', 'oninput', 'onchange', 'onmouseover', 'onfocus', 'onblur', 'onsubmit', 'srcdoc', 'formaction'],
            ALLOW_UNKNOWN_PROTOCOLS: false,
            ALLOW_DATA_ATTR: false
        });
    }
    return `<pre style="white-space: pre-wrap;">${escapeHtml(raw)}</pre>`;
}

function sanitizeUiHtml(dirty) {
    const raw = String(dirty || '');
    configureDomPurify();
    if (window.DOMPurify && typeof window.DOMPurify.sanitize === 'function') {
        return window.DOMPurify.sanitize(raw, {
            USE_PROFILES: { html: true },
            ALLOW_DATA_ATTR: true,
            FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'style', 'link', 'meta', 'base', 'svg', 'math'],
            FORBID_ATTR: ['onerror', 'onload', 'onclick', 'oninput', 'onchange', 'onmouseover', 'onfocus', 'onblur', 'onsubmit', 'srcdoc', 'formaction'],
            ALLOW_UNKNOWN_PROTOCOLS: false
        });
    }
    return `<pre style="white-space: pre-wrap;">${escapeHtml(raw)}</pre>`;
}

function getTargetOrigin() {
    if (window.location.protocol === 'file:') return '*';
    return (window.location.origin && window.location.origin !== 'null') ? window.location.origin : '*';
}

function isSafeHexColor(color, fallback = '#cf6215') {
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
    if (lower.startsWith('javascript:') || lower.startsWith('vbscript:') || lower.startsWith('data:') || lower.startsWith('file:')) {
        return false;
    }
    if (lower.startsWith('blob:') || lower.startsWith('blob-id:') || lower.startsWith('local-pdf://')) {
        return true;
    }
    if (trimmed.startsWith('//') || trimmed.startsWith('\\\\')) return false;
    try {
        const parsed = new URL(trimmed, window.location.href);
        return parsed.protocol === 'http:' || parsed.protocol === 'https:' || parsed.protocol === 'capacitor:' || parsed.protocol === 'blob:';
    } catch (e) {
        return false;
    }
}

function isSafeMediaDataUrl(url) {
    if (typeof url !== 'string') return false;
    return /^data:audio\/(webm|ogg|mpeg|mp3|wav|mp4|aac|flac)(?:;[a-z0-9=_-]+)?;base64,[A-Za-z0-9+/=]+$/i.test(url.trim());
}

function stripProtoKeys(obj) {
    if (!obj || typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.map(stripProtoKeys);
    const clean = {};
    for (const [k, v] of Object.entries(obj)) {
        if (k === '__proto__' || k === 'constructor' || k === 'prototype') continue;
        clean[k] = stripProtoKeys(v);
    }
    return clean;
}

function formatBytesContent(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function formatTime12Hour(time24) {
    if (!time24) return '';
    const [hours, minutes] = time24.split(':');
    const h = parseInt(hours, 10);
    const ampm = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 || 12;
    return `${h12}:${minutes} ${ampm}`;
}

function showNotification(message, type = 'info') {
    if (typeof window.showNotification === 'function' && window.showNotification !== showNotification) {
        window.showNotification(message, type);
    } else {
        console.log(`[${type.toUpperCase()}] ${message}`);
    }
}

function showConfirm(message, opts = {}) {
    if (typeof window.showConfirm === 'function' && window.showConfirm !== showConfirm) {
        return window.showConfirm(message, opts);
    }
    return Promise.resolve(window.confirm(message));
}

function showPrompt(message, opts = {}) {
    if (typeof window.showPrompt === 'function' && window.showPrompt !== showPrompt) {
        return window.showPrompt(message, opts);
    }
    return Promise.resolve(window.prompt(message, opts.defaultValue || ''));
}

function fileToUint8Array(file) {
    return new Promise((resolve, reject) => {
        if (file instanceof Uint8Array) {
            resolve(file);
            return;
        }
        if (file && typeof file.arrayBuffer === 'function') {
            file.arrayBuffer()
                .then(buf => resolve(new Uint8Array(buf)))
                .catch(() => {
                    const reader = new FileReader();
                    reader.onload = () => resolve(new Uint8Array(reader.result));
                    reader.onerror = () => reject(reader.error);
                    reader.readAsArrayBuffer(file);
                });
            return;
        }
        const reader = new FileReader();
        reader.onload = () => resolve(new Uint8Array(reader.result));
        reader.onerror = () => reject(reader.error);
        reader.readAsArrayBuffer(file);
    });
}

function clearDragHoverStyles() {
    document.querySelectorAll('.drag-target-hover, .drag-over, .is-dragging').forEach(el => {
        el.classList.remove('drag-target-hover', 'drag-over', 'is-dragging');
    });
}

(function injectLibraryDragStyles() {
    if (document.getElementById('library-drag-styles')) return;
    const style = document.createElement('style');
    style.id = 'library-drag-styles';
    style.textContent = `
        .library-item.is-dragging {
            opacity: 0.45;
            transform: scale(0.96);
        }
        .library-item.drag-target-hover,
        .breadcrumb-item.drag-target-hover {
            outline: 2px dashed var(--accent, #cf6215) !important;
            outline-offset: 3px;
            background: rgba(207, 98, 21, 0.15) !important;
            border-radius: 8px;
        }
        .library-drop-zone.drag-over {
            border-color: var(--accent, #cf6215) !important;
            background: rgba(207, 98, 21, 0.1) !important;
        }
        .image-viewer-body {
            display: flex;
            align-items: center;
            justify-content: center;
            background: var(--surface, #1e1f22);
            padding: 1rem;
            border-radius: 12px;
            border: 1px solid var(--line, #2e3035);
            max-height: calc(100vh - 160px);
            overflow: auto;
        }
        .image-viewer-body img {
            max-width: 100%;
            max-height: calc(100vh - 200px);
            object-fit: contain;
            border-radius: 8px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.35);
        }
        .doc-viewer-body {
            background: var(--surface, #ffffff);
            color: var(--fg, #18181b);
            padding: 2rem;
            border-radius: 12px;
            border: 1px solid var(--line, #e4e4e7);
            max-height: calc(100vh - 160px);
            overflow-y: auto;
            font-size: 0.95rem;
            line-height: 1.6;
        }
        .doc-viewer-body pre {
            background: var(--bg, #f7f7f8);
            padding: 1rem;
            border-radius: 8px;
            overflow-x: auto;
            font-family: 'JetBrains Mono', monospace;
        }
        .docx-rendered-content table {
            border-collapse: collapse;
            width: 100%;
            margin: 1rem 0;
        }
        .docx-rendered-content th, .docx-rendered-content td {
            border: 1px solid var(--line, #e4e4e7);
            padding: 8px 12px;
        }
    `;
    (document.head || document.documentElement).appendChild(style);
})();

function getFileTypeCategory(fileName) {
    if (!fileName) return 'other';
    const ext = fileName.toLowerCase().split('.').pop();
    if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg', 'bmp', 'ico'].includes(ext)) return 'image';
    if (ext === 'pdf') return 'pdf';
    if (['md', 'markdown', 'txt', 'json', 'csv', 'log', 'js', 'py', 'html', 'css', 'xml', 'yaml', 'yml'].includes(ext)) return 'text';
    if (['docx', 'doc'].includes(ext)) return 'docx';
    return 'other';
}

function detectFileTypeCategory(uInt8Array, mimeType, fileName) {
    const extCategory = getFileTypeCategory(fileName);
    const mime = (mimeType || '').toLowerCase().split(';')[0].trim();

    if (uInt8Array && uInt8Array.byteLength >= 4) {
        // %PDF
        if (uInt8Array[0] === 0x25 && uInt8Array[1] === 0x50 && uInt8Array[2] === 0x44 && uInt8Array[3] === 0x46) {
            return 'pdf';
        }
        // PNG
        if (uInt8Array[0] === 0x89 && uInt8Array[1] === 0x50 && uInt8Array[2] === 0x4E && uInt8Array[3] === 0x47) {
            return 'image';
        }
        // JPEG
        if (uInt8Array[0] === 0xFF && uInt8Array[1] === 0xD8 && uInt8Array[2] === 0xFF) {
            return 'image';
        }
        // GIF
        if (uInt8Array[0] === 0x47 && uInt8Array[1] === 0x49 && uInt8Array[2] === 0x46 && uInt8Array[3] === 0x38) {
            return 'image';
        }
        // WEBP (RIFF....WEBP)
        if (uInt8Array.byteLength >= 12 &&
            uInt8Array[0] === 0x52 && uInt8Array[1] === 0x49 && uInt8Array[2] === 0x46 && uInt8Array[3] === 0x46 &&
            uInt8Array[8] === 0x57 && uInt8Array[9] === 0x45 && uInt8Array[10] === 0x42 && uInt8Array[11] === 0x50) {
            return 'image';
        }
        // PK\x03\x04 (ZIP-based formats like DOCX)
        if (uInt8Array[0] === 0x50 && uInt8Array[1] === 0x4B && uInt8Array[2] === 0x03 && uInt8Array[3] === 0x04) {
            if (extCategory === 'docx' || mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
                return 'docx';
            }
        }
        // Sniff disguised HTML/SVG masquerading as .pdf
        const headAscii = String.fromCharCode(...uInt8Array.slice(0, Math.min(64, uInt8Array.byteLength))).trim().toLowerCase();
        if (headAscii.startsWith('<html') || headAscii.startsWith('<!doctype') || headAscii.startsWith('<script')) {
            return 'text';
        }
    }

    if (mime === 'application/pdf') return 'pdf';
    if (mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || mime === 'application/msword') return 'docx';
    if (mime.startsWith('image/') && mime !== 'image/svg+xml') return 'image';
    if (mime.startsWith('text/') || mime === 'application/json') return 'text';

    return extCategory;
}

/* 1. PDF Bookmarks & Page Tracking */
var pdfBookmarks = window.pdfBookmarks || JSON.parse(localStorage.getItem('questionary-pdf-bookmarks') || '{}');
window.pdfBookmarks = pdfBookmarks;
var currentPdfUrl = window.currentPdfUrl || null;

function savePdfBookmarks() {
    localStorage.setItem('questionary-pdf-bookmarks', JSON.stringify(pdfBookmarks));
}

function addPdfBookmark(pdfUrl, pageNumber, title = '') {
    if (!pdfUrl) return null;
    if (!pdfBookmarks[pdfUrl]) {
        pdfBookmarks[pdfUrl] = [];
    }

    const bookmark = {
        id: Date.now().toString(),
        page: pageNumber,
        title: title || `Page ${pageNumber}`,
        createdAt: new Date().toISOString()
    };

    pdfBookmarks[pdfUrl].push(bookmark);
    savePdfBookmarks();
    showNotification(`Bookmark added: ${bookmark.title}`, 'success');
    renderPdfBookmarks(pdfUrl);

    const panel = document.getElementById('pdfBookmarksPanel');
    if (panel) panel.style.display = 'block';
    return bookmark;
}

function removePdfBookmark(pdfUrl, bookmarkId) {
    if (pdfBookmarks[pdfUrl]) {
        pdfBookmarks[pdfUrl] = pdfBookmarks[pdfUrl].filter(b => b.id !== bookmarkId);
        savePdfBookmarks();
        renderPdfBookmarks(pdfUrl);
        showNotification('Bookmark removed', 'info');
    }
}

function getPdfBookmarks(pdfUrl) {
    return pdfBookmarks[pdfUrl] || [];
}

function renderPdfBookmarks(pdfUrl) {
    const container = document.getElementById('pdfBookmarksList');
    if (!container) return;

    const bookmarks = getPdfBookmarks(pdfUrl);

    if (bookmarks.length === 0) {
        container.innerHTML = sanitizeUiHtml('<p class="empty-state">No bookmarks yet. Click "Add Bookmark" while viewing a PDF.</p>');
        return;
    }

    container.innerHTML = sanitizeUiHtml(bookmarks.map(b => `
        <div class="bookmark-item" data-page="${escapeHtml(b.page)}">
            <i class="fas fa-bookmark"></i>
            <span class="bookmark-title">${escapeHtml(b.title)}</span>
            <span class="bookmark-page">Page ${escapeHtml(b.page)}</span>
            <button class="bookmark-delete" type="button" data-bookmark-id="${escapeHtml(b.id)}">
                <i class="fas fa-times"></i>
            </button>
        </div>
    `).join(''));

    container.querySelectorAll('.bookmark-item').forEach(item => {
        const delBtn = item.querySelector('.bookmark-delete');
        if (delBtn) {
            delBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                removePdfBookmark(pdfUrl, delBtn.dataset.bookmarkId);
            });
        }
        item.addEventListener('click', (e) => {
            if (!e.target.closest('.bookmark-delete')) {
                const page = parseInt(item.dataset.page, 10);
                goToPdfPage(page);
            }
        });
    });
}

function goToPdfPage(pageNumber) {
    const iframe = document.getElementById('pdfViewer');
    if (!iframe || !iframe.contentWindow) return;
    iframe.contentWindow.postMessage({ type: 'goToPage', page: pageNumber }, getTargetOrigin());
    showNotification(`Navigating to page ${pageNumber}`, 'info');
}

window.addEventListener('message', async (e) => {
    const iframe = document.getElementById('pdfViewer');
    const expectedOrigin = window.location.origin;
    if (window.location.protocol !== 'file:' && expectedOrigin && expectedOrigin !== 'null' && e.origin && e.origin !== 'null' && e.origin !== expectedOrigin) return;
    if (iframe && iframe.contentWindow && e.source !== iframe.contentWindow) return;
    if (!e.data || typeof e.data !== 'object') return;

    if (e.data.type === 'pdfPageChanged' && e.data.page) {
        window.currentPdfPage = parseInt(e.data.page, 10) || 1;
    } else if (e.data.type === 'requestPdfBytes' && typeof e.data.url === 'string' && iframe && iframe.contentWindow) {
        const reqUrl = e.data.url;
        let bytes = typeof window.getLoadedPdfBytes === 'function' ? window.getLoadedPdfBytes(reqUrl) : null;
        if ((!bytes || bytes.byteLength === 0) && window._questionaryObjectUrlToBlobId && window._questionaryObjectUrlToBlobId[reqUrl]) {
            const mappedBlobIdUrl = window._questionaryObjectUrlToBlobId[reqUrl];
            bytes = typeof window.getLoadedPdfBytes === 'function' ? window.getLoadedPdfBytes(mappedBlobIdUrl) : null;
            if ((!bytes || bytes.byteLength === 0) && window.UserLibraryFileStore) {
                bytes = await window.UserLibraryFileStore.getFileBytes(mappedBlobIdUrl.replace(/^blob-id:/, ''));
            }
        }
        if ((!bytes || bytes.byteLength === 0) && reqUrl.startsWith('blob-id:') && window.UserLibraryFileStore) {
            bytes = await window.UserLibraryFileStore.getFileBytes(reqUrl.replace(/^blob-id:/, ''));
        }
        if (bytes && bytes.byteLength > 0) {
            if (typeof window.setLoadedPdfBytes === 'function') {
                window.setLoadedPdfBytes(reqUrl, bytes);
            }
            const freshCopy = new Uint8Array(bytes.byteLength);
            freshCopy.set(bytes);
            iframe.contentWindow.postMessage({
                type: 'loadPdf',
                url: reqUrl,
                pdfBytes: freshCopy
            }, getTargetOrigin());
        }
    }
});

function openBookmarkModal() {
    const modal = document.getElementById('bookmarkModal');
    if (modal) {
        modal.classList.add('active');
        const titleInput = document.getElementById('bookmarkTitleInput');
        const pageInput = document.getElementById('bookmarkPageInput');
        if (titleInput) titleInput.value = '';
        if (pageInput) pageInput.value = String(window.currentPdfPage || 1);
    }
}

function closeBookmarkModal() {
    const modal = document.getElementById('bookmarkModal');
    if (modal) modal.classList.remove('active');
}

function saveBookmarkFromModal() {
    const title = document.getElementById('bookmarkTitleInput')?.value.trim();
    const page = parseInt(document.getElementById('bookmarkPageInput')?.value, 10) || 1;

    if (!title) {
        showNotification('Please enter a bookmark title', 'warning');
        return;
    }

    const pdfUrl = currentPdfUrl || window.currentPdfUrlForBookmarks;
    if (pdfUrl) {
        addPdfBookmark(pdfUrl, page, title);
        closeBookmarkModal();
    } else {
        showNotification('No PDF currently open', 'error');
    }
}

function toggleBookmarksPanel() {
    const panel = document.getElementById('pdfBookmarksPanel');
    if (panel) {
        const isHidden = panel.style.display === 'none' || !panel.style.display;
        panel.style.display = isHidden ? 'block' : 'none';
    }
}

function openPdfViewer(pdfUrl, pdfName) {
    if (typeof openAnyDocument === 'function') {
        openAnyDocument(pdfUrl, pdfName);
        return;
    }
    if (typeof window.showPDF === 'function') {
        window.showPDF(pdfUrl, pdfName);
    }
}

function closePdfViewer() {
    if (typeof window.closePDF === 'function') {
        window.closePDF();
    } else {
        document.body.classList.remove('pdf-view-active');
        const container = document.getElementById('pdfViewerContainer');
        const tilesContainer = document.getElementById('tilesContainer');
        const pdfViewer = document.getElementById('pdfViewer');
        if (container) container.style.display = 'none';
        if (tilesContainer) tilesContainer.style.display = 'grid';
        if (pdfViewer) pdfViewer.src = '';
    }
}

/* 2. Text, Markdown, Docx & Image Viewers */
var _currentTextRaw = window._currentTextRaw || '';
var _currentTextName = window._currentTextName || '';
var _currentDocxBlob = window._currentDocxBlob || null;
var _currentDocxName = window._currentDocxName || '';

async function showTextFile(urlOrBlob, fileName) {
    _currentTextName = fileName || 'Document.txt';
    const container = document.getElementById('textViewerContainer');
    const body = document.getElementById('textViewerBody');
    const nameEl = document.getElementById('currentTextName');
    const tilesSection = document.getElementById('tilesSection');
    const tilesContainer = document.getElementById('tilesContainer');
    const sectionHeader = document.querySelector('#tilesSection .section-header');
    const dashboardHeader = document.querySelector('.dashboard-header');
    const breadcrumbContainer = document.querySelector('.breadcrumb-container');
    const importedSection = document.getElementById('importedSection');

    if (nameEl) nameEl.textContent = _currentTextName;

    try {
        let text = '';
        if (typeof urlOrBlob === 'string' && urlOrBlob.startsWith('blob-id:')) {
            const blobId = urlOrBlob.replace('blob-id:', '');
            const blob = await UserLibraryFileStore.getFileBlob(blobId);
            text = await blob.text();
        } else if (urlOrBlob instanceof Blob) {
            text = await urlOrBlob.text();
        } else if (typeof urlOrBlob === 'string') {
            if (!isSafeDocumentUrl(urlOrBlob)) {
                throw new Error('Blocked unsafe document URL');
            }
            const res = await fetch(urlOrBlob);
            text = await res.text();
        }

        _currentTextRaw = text;
        const ext = _currentTextName.toLowerCase().split('.').pop();

        if ((ext === 'md' || ext === 'markdown') && typeof window.marked !== 'undefined') {
            body.innerHTML = sanitizeHtml(window.marked.parse(text));
        } else if (ext === 'json') {
            try {
                const parsed = JSON.parse(text);
                body.innerHTML = sanitizeHtml(`<pre><code>${escapeHtml(JSON.stringify(parsed, null, 2))}</code></pre>`);
            } catch (e) {
                body.innerHTML = sanitizeHtml(`<pre><code>${escapeHtml(text)}</code></pre>`);
            }
        } else {
            body.innerHTML = sanitizeHtml(`<pre style="white-space: pre-wrap; font-family: inherit;">${escapeHtml(text)}</pre>`);
        }

        document.body.classList.add('pdf-view-active');
        if (tilesSection) tilesSection.style.display = 'block';
        if (container) container.style.display = 'flex';
        if (tilesContainer) tilesContainer.style.display = 'none';
        if (sectionHeader) sectionHeader.style.display = 'none';
        if (dashboardHeader) dashboardHeader.style.display = 'none';
        if (breadcrumbContainer) breadcrumbContainer.style.display = 'none';
        if (importedSection) importedSection.style.display = 'none';
        if (typeof hideHomeTagsPanels === 'function') hideHomeTagsPanels();
    } catch (err) {
        showNotification('Failed to read text file', 'error');
        console.error(err);
    }
}

function closeTextViewer() {
    const container = document.getElementById('textViewerContainer');
    if (container) container.style.display = 'none';
    if (typeof window.restoreActiveViewAfterViewer === 'function') {
        window.restoreActiveViewAfterViewer();
        return;
    }
    const tilesContainer = document.getElementById('tilesContainer');
    const sectionHeader = document.querySelector('#tilesSection .section-header');
    const dashboardHeader = document.querySelector('.dashboard-header');
    const breadcrumbContainer = document.querySelector('.breadcrumb-container');
    const importedSection = document.getElementById('importedSection');

    document.body.classList.remove('pdf-view-active');
    if (breadcrumbContainer) breadcrumbContainer.style.display = 'flex';
    if (tilesContainer) {
        const isListView = tilesContainer.classList.contains('list-view');
        tilesContainer.style.display = isListView ? 'flex' : 'grid';
    }
    if (sectionHeader) sectionHeader.style.display = 'flex';
    const isRoot = typeof path !== 'undefined' && Array.isArray(path) && path.length === 0;
    if (dashboardHeader) dashboardHeader.style.display = isRoot ? (window.innerWidth <= 768 ? 'grid' : 'flex') : 'none';
    if (importedSection) importedSection.style.display = isRoot ? 'block' : 'none';
    if (isRoot && typeof showHomeTagsPanels === 'function') showHomeTagsPanels();
}

function copyTextViewerContent() {
    if (_currentTextRaw) {
        navigator.clipboard.writeText(_currentTextRaw).then(() => {
            showNotification('Content copied to clipboard!', 'success');
        });
    }
}

function downloadTextContent() {
    if (!_currentTextRaw) return;
    const blob = new Blob([_currentTextRaw], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = _currentTextName || 'document.txt';
    a.click();
    URL.revokeObjectURL(url);
}

async function showDocxFile(urlOrBlob, fileName) {
    _currentDocxName = fileName || 'Document.docx';
    const container = document.getElementById('docxViewerContainer');
    const body = document.getElementById('docxViewerBody');
    const nameEl = document.getElementById('currentDocxName');
    const tilesSection = document.getElementById('tilesSection');
    const tilesContainer = document.getElementById('tilesContainer');
    const sectionHeader = document.querySelector('#tilesSection .section-header');
    const dashboardHeader = document.querySelector('.dashboard-header');
    const breadcrumbContainer = document.querySelector('.breadcrumb-container');
    const importedSection = document.getElementById('importedSection');

    if (nameEl) nameEl.textContent = _currentDocxName;

    try {
        let arrayBuffer = null;
        if (typeof urlOrBlob === 'string' && urlOrBlob.startsWith('blob-id:')) {
            const blobId = urlOrBlob.replace('blob-id:', '');
            const blob = await UserLibraryFileStore.getFileBlob(blobId);
            _currentDocxBlob = blob;
            arrayBuffer = await blob.arrayBuffer();
        } else if (urlOrBlob instanceof Blob) {
            _currentDocxBlob = urlOrBlob;
            arrayBuffer = await urlOrBlob.arrayBuffer();
        } else if (typeof urlOrBlob === 'string') {
            if (!isSafeDocumentUrl(urlOrBlob)) {
                throw new Error('Blocked unsafe document URL');
            }
            const res = await fetch(urlOrBlob);
            const blob = await res.blob();
            _currentDocxBlob = blob;
            arrayBuffer = await blob.arrayBuffer();
        }

        if (typeof window.mammoth !== 'undefined') {
            body.innerHTML = sanitizeUiHtml('<p class="empty-state">Rendering Word Document...</p>');
            const result = await window.mammoth.convertToHtml({ arrayBuffer: arrayBuffer });
            body.innerHTML = result.value ? sanitizeHtml(result.value) : sanitizeUiHtml('<p class="empty-state">Document is empty.</p>');
        } else {
            body.innerHTML = sanitizeUiHtml('<p class="empty-state">Mammoth.js library unavailable. Download the file to view.</p>');
        }

        document.body.classList.add('pdf-view-active');
        if (tilesSection) tilesSection.style.display = 'block';
        if (container) container.style.display = 'flex';
        if (tilesContainer) tilesContainer.style.display = 'none';
        if (sectionHeader) sectionHeader.style.display = 'none';
        if (dashboardHeader) dashboardHeader.style.display = 'none';
        if (breadcrumbContainer) breadcrumbContainer.style.display = 'none';
        if (importedSection) importedSection.style.display = 'none';
        if (typeof hideHomeTagsPanels === 'function') hideHomeTagsPanels();
    } catch (err) {
        showNotification('Failed to render Word document', 'error');
        console.error(err);
    }
}

function closeDocxViewer() {
    const container = document.getElementById('docxViewerContainer');
    if (container) container.style.display = 'none';
    if (typeof window.restoreActiveViewAfterViewer === 'function') {
        window.restoreActiveViewAfterViewer();
        return;
    }
    const tilesContainer = document.getElementById('tilesContainer');
    const sectionHeader = document.querySelector('#tilesSection .section-header');
    const dashboardHeader = document.querySelector('.dashboard-header');
    const breadcrumbContainer = document.querySelector('.breadcrumb-container');
    const importedSection = document.getElementById('importedSection');

    document.body.classList.remove('pdf-view-active');
    if (breadcrumbContainer) breadcrumbContainer.style.display = 'flex';
    if (tilesContainer) {
        const isListView = tilesContainer.classList.contains('list-view');
        tilesContainer.style.display = isListView ? 'flex' : 'grid';
    }
    if (sectionHeader) sectionHeader.style.display = 'flex';
    const isRoot = typeof path !== 'undefined' && Array.isArray(path) && path.length === 0;
    if (dashboardHeader) dashboardHeader.style.display = isRoot ? (window.innerWidth <= 768 ? 'grid' : 'flex') : 'none';
    if (importedSection) importedSection.style.display = isRoot ? 'block' : 'none';
    if (isRoot && typeof showHomeTagsPanels === 'function') showHomeTagsPanels();
}

function downloadDocxContent() {
    if (!_currentDocxBlob) return;
    const url = URL.createObjectURL(_currentDocxBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = _currentDocxName || 'document.docx';
    a.click();
    URL.revokeObjectURL(url);
}

function getMimeTypeForCategory(category, fileName) {
    const ext = (fileName || '').toLowerCase().split('.').pop();
    if (category === 'pdf' || ext === 'pdf') return 'application/pdf';
    if (category === 'docx' || ext === 'docx') return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    if (category === 'image') {
        if (ext === 'png') return 'image/png';
        if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
        if (ext === 'webp') return 'image/webp';
        if (ext === 'gif') return 'image/gif';
        if (ext === 'svg') return 'image/svg+xml';
        return 'image/png';
    }
    if (category === 'text') {
        if (ext === 'json') return 'application/json';
        if (ext === 'md' || ext === 'markdown') return 'text/markdown;charset=utf-8';
        return 'text/plain;charset=utf-8';
    }
    return 'application/octet-stream';
}

window._questionaryLoadedPdfBlobs = window._questionaryLoadedPdfBlobs || new Map();
window._questionaryBlobIdToObjectUrl = window._questionaryBlobIdToObjectUrl || {};
window._questionaryObjectUrlToBlobId = window._questionaryObjectUrlToBlobId || {};

function cloneIndependentUint8Array(raw) {
    if (!raw) return null;
    try {
        let view = null;
        if (raw instanceof Uint8Array) {
            view = raw;
        } else if (raw instanceof ArrayBuffer) {
            view = new Uint8Array(raw);
        } else if (ArrayBuffer.isView(raw) || (raw.buffer && typeof raw.byteLength === 'number')) {
            view = new Uint8Array(raw.buffer, raw.byteOffset || 0, raw.byteLength);
        } else if (raw.type === 'Buffer' && Array.isArray(raw.data)) {
            view = new Uint8Array(raw.data);
        } else if (Array.isArray(raw)) {
            view = new Uint8Array(raw);
        }
        if (!view || view.byteLength === 0) return null;
        const copy = new Uint8Array(view.byteLength);
        copy.set(view);
        return copy;
    } catch (e) {
        return null;
    }
}

window.setLoadedPdfBytes = function(key, bytes) {
    if (!key || !bytes) return;
    const cleanBytes = cloneIndependentUint8Array(bytes);
    if (!cleanBytes || cleanBytes.byteLength === 0) return;
    if (!window._questionaryLoadedPdfBlobs) {
        window._questionaryLoadedPdfBlobs = new Map();
    }
    if (typeof window._questionaryLoadedPdfBlobs.set === 'function') {
        window._questionaryLoadedPdfBlobs.set(key, cleanBytes);
    }
    window._questionaryLoadedPdfBlobs[key] = cleanBytes;
};

window.getLoadedPdfBytes = function(key) {
    if (!key || !window._questionaryLoadedPdfBlobs) return null;
    if (typeof window._questionaryLoadedPdfBlobs.get === 'function') {
        const fromMap = window._questionaryLoadedPdfBlobs.get(key);
        const clonedMap = cloneIndependentUint8Array(fromMap);
        if (clonedMap && clonedMap.byteLength > 0) return clonedMap;
    }
    const fromProp = window._questionaryLoadedPdfBlobs[key];
    const clonedProp = cloneIndependentUint8Array(fromProp);
    if (clonedProp && clonedProp.byteLength > 0) return clonedProp;
    return null;
};

async function openAnyDocument(urlOrBlob, fileName) {
    let category = getFileTypeCategory(fileName);
    let target = urlOrBlob;
    let sourceBlobIdUrl = null;
    let rawLoadedBytes = null;

    if (typeof target === 'string' && target.startsWith('blob-id:')) {
        sourceBlobIdUrl = target;
        const blobId = target.replace('blob-id:', '');
        rawLoadedBytes = window.getLoadedPdfBytes(sourceBlobIdUrl) || await UserLibraryFileStore.getFileBytes(blobId);
        if (rawLoadedBytes && rawLoadedBytes.byteLength > 0) {
            category = detectFileTypeCategory(rawLoadedBytes.slice(0, 64), '', fileName);
            const mimeType = getMimeTypeForCategory(category, fileName);
            target = new Blob([rawLoadedBytes], { type: mimeType });
        } else {
            const blob = await UserLibraryFileStore.getFileBlob(blobId, fileName);
            if (blob) {
                target = blob;
            } else {
                showNotification('Could not load imported document from storage', 'error');
                return;
            }
        }
    }

    if (target instanceof Blob && !rawLoadedBytes) {
        try {
            const headBytes = new Uint8Array(await target.slice(0, 64).arrayBuffer());
            category = detectFileTypeCategory(headBytes, target.type, fileName);
        } catch (e) {}
    }

    let canonicalDocKey = null;
    if (window.DownloadManager && typeof target === 'string' && !target.startsWith('blob:') && !target.startsWith('blob-id:') && !target.startsWith('data:') && !target.startsWith('http') && !target.startsWith('local-pdf:')) {
        const cleanRelative = target.replace(/^(\.\/|\/)?(documentshd|documents)\//i, '').replace(/^\/+/, '');
        canonicalDocKey = cleanRelative;
        target = typeof window.DownloadManager.resolveDocumentUrlAsync === 'function'
          ? await window.DownloadManager.resolveDocumentUrlAsync(cleanRelative)
          : window.DownloadManager.resolveDocumentUrl(cleanRelative);
    }

    if (typeof target === 'string' && target.startsWith('local-pdf://') && !target.startsWith('local-pdf:///') && !target.startsWith('local-pdf://localhost')) {
        target = target.replace('local-pdf://', 'local-pdf:///');
    }

    if (typeof target === 'string' && !isSafeDocumentUrl(target)) {
        showNotification('Blocked an unsafe document path.', 'error');
        return;
    }

    if (category === 'image') {
        let src = target;
        if (target instanceof Blob) {
            const mime = getMimeTypeForCategory('image', fileName);
            const typedBlob = target.type ? target : new Blob([target], { type: mime });
            src = URL.createObjectURL(typedBlob);
        }
        if (typeof window.showImage === 'function') window.showImage(src, fileName);
    } else if (category === 'text') {
        await showTextFile(target, fileName);
    } else if (category === 'docx') {
        await showDocxFile(target, fileName);
    } else {
        let pdfSrc = target;
        if (target instanceof Blob) {
            const typedPdfBlob = target.type === 'application/pdf'
                ? target
                : new Blob([target], { type: 'application/pdf' });
            pdfSrc = (sourceBlobIdUrl && window._questionaryBlobIdToObjectUrl[sourceBlobIdUrl])
                ? window._questionaryBlobIdToObjectUrl[sourceBlobIdUrl]
                : URL.createObjectURL(typedPdfBlob);
            try {
                const bytes = rawLoadedBytes || new Uint8Array(await typedPdfBlob.arrayBuffer());
                window.setLoadedPdfBytes(pdfSrc, bytes);
                if (sourceBlobIdUrl) {
                    window.setLoadedPdfBytes(sourceBlobIdUrl, bytes);
                    window._questionaryBlobIdToObjectUrl[sourceBlobIdUrl] = pdfSrc;
                    window._questionaryObjectUrlToBlobId[pdfSrc] = sourceBlobIdUrl;
                }
            } catch (e) {}
        }

        if (typeof window.showPDF === 'function') {
            await window.showPDF(sourceBlobIdUrl || pdfSrc, fileName, canonicalDocKey);
        }
    }
}

async function navigateToTaggedItem(itemId) {
    if (!itemId) return;

    if (itemId.startsWith('folder_')) {
        const pathStr = itemId.replace('folder_', '');
        const pathArray = pathStr.split('/').filter(s => s);
        if (typeof window.showView === 'function') window.showView('home');
        if (typeof window.navigateToPath === 'function') {
            await window.navigateToPath(pathArray);
        }
        return;
    }

    if (itemId.startsWith('doc_')) {
        const pathStr = itemId.replace('doc_', '');
        const segments = pathStr.split('/').filter(s => s);
        const fileName = segments[segments.length - 1];
        const parentPath = segments.slice(0, -1);

        let foundNode = null;
        if (typeof DbService !== 'undefined' && DbService) {
            try {
                const nodes = await DbService.getChildren(parentPath);
                foundNode = (nodes || []).find(n => n.name === fileName || n.name.toLowerCase() === fileName.toLowerCase() || (n.file_path && n.file_path.includes(fileName)));
                
                if (!foundNode) {
                    const searchRes = await DbService.query("SELECT * FROM nodes WHERE name = ?", [fileName]);
                    if (searchRes && searchRes.length > 0) {
                        foundNode = searchRes[0];
                    }
                }
            } catch (e) {}
        }

        if (foundNode && (foundNode.is_folder === 1 || foundNode.file_path === '#' || !foundNode.file_path)) {
            if (typeof window.showView === 'function') window.showView('home');
            if (typeof window.navigateToPath === 'function') {
                await window.navigateToPath([...parentPath, fileName]);
            }
            return;
        }

        if (typeof window.showView === 'function') window.showView('home');
        if (typeof window.navigateToPath === 'function') {
            await window.navigateToPath(parentPath);
        }

        let targetUrl = null;
        if (foundNode && foundNode.file_path && foundNode.file_path !== '#') {
            targetUrl = foundNode.file_path;
        }

        if (!targetUrl && typeof UserLibraryDbService !== 'undefined' && UserLibraryDbService) {
            try {
                const userFiles = await UserLibraryDbService.query("SELECT * FROM files WHERE name = ?", [fileName]);
                if (userFiles && userFiles.length > 0) {
                    targetUrl = `blob-id:${userFiles[0].blob_id}`;
                }
            } catch (e) {}
        }

        if (!targetUrl) {
            const rawHierarchy = segments.join('/');
            targetUrl = rawHierarchy.endsWith('.pdf') ? rawHierarchy : (rawHierarchy + '.pdf');
        }

        setTimeout(async () => {
            if (typeof window.openAnyDocument === 'function') {
                await window.openAnyDocument(targetUrl, fileName);
            } else if (typeof window.showPDF === 'function') {
                window.showPDF(targetUrl, fileName);
            }
        }, 150);
        return;
    }

    if (itemId.startsWith('note_')) {
        const noteId = itemId.replace('note_', '');
        if (typeof window.showView === 'function') window.showView('notes');
        setTimeout(() => {
            const noteEl = document.querySelector(`[data-note-id="${noteId}"]`) || document.getElementById(`note-${noteId}`);
            if (noteEl) noteEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 150);
        return;
    }

    if (itemId.startsWith('deck_')) {
        const deckId = itemId.replace('deck_', '');
        if (typeof window.showView === 'function') window.showView('flashcards');
        setTimeout(() => {
            if (typeof window.startStudyDeck === 'function') {
                window.startStudyDeck(deckId);
            }
        }, 150);
        return;
    }

    if (itemId.startsWith('reminder_')) {
        if (typeof window.showView === 'function') window.showView('reminders');
        return;
    }

    if (itemId.startsWith('voicenote_')) {
        if (typeof window.showView === 'function') window.showView('notes');
        return;
    }
}

/* 3. Quiz Mode */
var quizState = window.quizState || {
    active: false,
    deckId: null,
    questions: [],
    currentIndex: 0,
    score: 0,
    answers: [],
    mode: 'multiple-choice',
    startTime: null,
    timeLimit: null
};
window.quizState = quizState;

function startQuiz(deckId, mode = 'multiple-choice', timeLimit = null) {
    const decks = window.flashcardDecks || JSON.parse(localStorage.getItem('questionary-flashcards') || '[]');
    const deck = decks.find(d => String(d.id) === String(deckId));
    if (!deck || !deck.cards || deck.cards.length < 2) {
        showNotification('Need at least 2 cards to start a quiz', 'warning');
        return;
    }

    quizState = {
        active: true,
        deckId: deckId,
        questions: shuffleArray([...deck.cards]),
        currentIndex: 0,
        score: 0,
        answers: [],
        mode: mode,
        startTime: Date.now(),
        timeLimit: timeLimit
    };

    showQuizModal();
    renderQuizQuestion();
}

function shuffleArray(array) {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}

function renderQuizQuestion() {
    const container = document.getElementById('quizContent');
    if (!container || !quizState.active) return;

    const question = quizState.questions[quizState.currentIndex];
    const progress = ((quizState.currentIndex + 1) / quizState.questions.length) * 100;

    let answersHtml = '';

    if (quizState.mode === 'multiple-choice') {
        const questionKey = question.front + '|||' + question.back;
        const otherCards = quizState.questions.filter(q => (q.front + '|||' + q.back) !== questionKey);
        const wrongAnswers = otherCards.slice(0, 3).map(q => q.back);
        const allAnswers = shuffleArray([question.back, ...wrongAnswers]);

        answersHtml = `
            <div class="quiz-options">
                ${allAnswers.map((answer, i) => `
                    <button class="quiz-option" data-answer="${escapeHtml(answer)}">
                        <span class="option-letter">${String.fromCharCode(65 + i)}</span>
                        <span class="option-text">${escapeHtml(answer)}</span>
                    </button>
                `).join('')}
            </div>
        `;
    } else if (quizState.mode === 'type-answer') {
        answersHtml = `
            <div class="quiz-type-answer">
                <input type="text" id="quizAnswerInput" class="quiz-answer-input" placeholder="Type your answer..." autofocus>
                <button type="button" id="quizSubmitTypedBtn" class="btn btn-primary">
                    <i class="fas fa-check"></i> Submit
                </button>
            </div>
        `;
    } else if (quizState.mode === 'true-false') {
        answersHtml = `
            <div class="quiz-options quiz-true-false">
                <button class="quiz-option" data-answer="true">
                    <i class="fas fa-check"></i> True
                </button>
                <button class="quiz-option" data-answer="false">
                    <i class="fas fa-times"></i> False
                </button>
            </div>
        `;
    }

    container.innerHTML = sanitizeUiHtml(`
        <div class="quiz-progress">
            <div class="quiz-progress-bar" style="width: ${progress}%"></div>
        </div>
        <div class="quiz-header">
            <span class="quiz-counter">Question ${quizState.currentIndex + 1} of ${quizState.questions.length}</span>
            <span class="quiz-score">Score: ${quizState.score}</span>
        </div>
        <div class="quiz-question">
            <h3>${escapeHtml(question.front)}</h3>
        </div>
        ${answersHtml}
    `);

    container.querySelectorAll('.quiz-option').forEach(btn => {
        btn.addEventListener('click', () => {
            const selectedAnswer = btn.dataset.answer;
            checkQuizAnswer(selectedAnswer);
        });
    });

    document.getElementById('quizSubmitTypedBtn')?.addEventListener('click', submitTypedAnswer);

    const typedInput = document.getElementById('quizAnswerInput');
    if (typedInput) {
        typedInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') submitTypedAnswer();
        });
    }
}

function checkQuizAnswer(selectedAnswer) {
    const question = quizState.questions[quizState.currentIndex];
    const isCorrect = selectedAnswer.toLowerCase().trim() === question.back.toLowerCase().trim();

    quizState.answers.push({
        question: question.front,
        correctAnswer: question.back,
        userAnswer: selectedAnswer,
        isCorrect: isCorrect
    });

    if (isCorrect) {
        quizState.score++;
        showNotification('Correct! 🎉', 'success');
    } else {
        showNotification(`Wrong! The answer was: ${question.back}`, 'error');
    }

    const options = document.querySelectorAll('.quiz-option');
    options.forEach(opt => {
        opt.disabled = true;
        if (opt.dataset.answer === question.back) {
            opt.classList.add('correct');
        } else if (opt.dataset.answer === selectedAnswer && !isCorrect) {
            opt.classList.add('wrong');
        }
    });

    setTimeout(() => {
        quizState.currentIndex++;
        if (quizState.currentIndex < quizState.questions.length) {
            renderQuizQuestion();
        } else {
            showQuizResults();
        }
    }, 1500);
}

function submitTypedAnswer() {
    const input = document.getElementById('quizAnswerInput');
    if (input && input.value.trim()) {
        checkQuizAnswer(input.value.trim());
    }
}

function showQuizResults() {
    const container = document.getElementById('quizContent');
    if (!container) return;
    const timeTaken = Math.round((Date.now() - quizState.startTime) / 1000);
    const percentage = Math.round((quizState.score / quizState.questions.length) * 100);

    let grade = 'F';
    let gradeClass = 'grade-f';
    if (percentage >= 90) { grade = 'A+'; gradeClass = 'grade-a'; }
    else if (percentage >= 80) { grade = 'A'; gradeClass = 'grade-a'; }
    else if (percentage >= 70) { grade = 'B'; gradeClass = 'grade-b'; }
    else if (percentage >= 60) { grade = 'C'; gradeClass = 'grade-c'; }
    else if (percentage >= 50) { grade = 'D'; gradeClass = 'grade-d'; }

    container.innerHTML = sanitizeUiHtml(`
        <div class="quiz-results">
            <div class="quiz-results-header">
                <i class="fas fa-trophy"></i>
                <h2>Quiz Complete!</h2>
            </div>
            <div class="quiz-grade ${gradeClass}">${grade}</div>
            <div class="quiz-stats">
                <div class="quiz-stat">
                    <span class="stat-value">${quizState.score}/${quizState.questions.length}</span>
                    <span class="stat-label">Correct</span>
                </div>
                <div class="quiz-stat">
                    <span class="stat-value">${percentage}%</span>
                    <span class="stat-label">Score</span>
                </div>
                <div class="quiz-stat">
                    <span class="stat-value">${formatQuizTime(timeTaken)}</span>
                    <span class="stat-label">Time</span>
                </div>
            </div>
            <div class="quiz-review">
                <h4>Review Answers</h4>
                ${quizState.answers.map((a, i) => `
                    <div class="review-item ${a.isCorrect ? 'correct' : 'wrong'}">
                        <span class="review-num">${i + 1}</span>
                        <div class="review-content">
                            <p class="review-question">${escapeHtml(a.question)}</p>
                            <p class="review-answer">Your answer: <strong>${escapeHtml(a.userAnswer)}</strong></p>
                            ${!a.isCorrect ? `<p class="review-correct">Correct: <strong>${escapeHtml(a.correctAnswer)}</strong></p>` : ''}
                        </div>
                        <i class="fas ${a.isCorrect ? 'fa-check' : 'fa-times'}"></i>
                    </div>
                `).join('')}
            </div>
            <div class="quiz-actions">
                <button class="btn btn-primary quiz-retry-btn" type="button">
                    <i class="fas fa-redo"></i> Retry Quiz
                </button>
                <button class="btn btn-secondary quiz-close-btn" type="button">
                    <i class="fas fa-times"></i> Close
                </button>
            </div>
        </div>
    `);

    const retryDeckId = quizState.deckId;
    const retryMode = quizState.mode;
    container.querySelector('.quiz-retry-btn')?.addEventListener('click', () => startQuiz(retryDeckId, retryMode));
    container.querySelector('.quiz-close-btn')?.addEventListener('click', closeQuizModal);

    saveQuizResult(quizState.deckId, percentage, timeTaken);
}

function formatQuizTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
}

function saveQuizResult(deckId, score, timeTaken) {
    let quizHistory = JSON.parse(localStorage.getItem('questionary-quiz-history') || '[]');
    quizHistory.push({
        deckId,
        score,
        timeTaken,
        date: new Date().toISOString()
    });
    if (quizHistory.length > 100) quizHistory = quizHistory.slice(-100);
    localStorage.setItem('questionary-quiz-history', JSON.stringify(quizHistory));
}

function showQuizModal() {
    let modal = document.getElementById('quizModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'quizModal';
        modal.className = 'modal-overlay';
        modal.innerHTML = sanitizeUiHtml(`
            <div class="modal modal-lg">
                <div class="modal-header">
                    <h2><i class="fas fa-question-circle"></i> Quiz Mode</h2>
                    <button type="button" id="quizModalDynamicCloseBtn" class="modal-close">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="modal-body" id="quizContent"></div>
            </div>
        `);
        document.body.appendChild(modal);
        modal.querySelector('#quizModalDynamicCloseBtn')?.addEventListener('click', closeQuizModal);
    }
    modal.classList.add('active');
}

function closeQuizModal() {
    const modal = document.getElementById('quizModal');
    if (modal) modal.classList.remove('active');
    quizState.active = false;
}

/* 4. Study Reminders */
var studyReminders = window.studyReminders || JSON.parse(localStorage.getItem('questionary-reminders') || '[]');
window.studyReminders = studyReminders;

function saveReminders() {
    localStorage.setItem('questionary-reminders', JSON.stringify(studyReminders));
}

function addStudyReminder(title, time, days) {
    const newReminder = {
        id: Date.now().toString(),
        title: title,
        message: '',
        time: time,
        days: days || [0, 1, 2, 3, 4, 5, 6],
        enabled: true,
        createdAt: new Date().toISOString()
    };

    studyReminders.push(newReminder);
    saveReminders();
    scheduleReminder(newReminder);
    showNotification('Reminder added!', 'success');
    renderReminders();
    return newReminder;
}

function deleteReminder(id) {
    studyReminders = studyReminders.filter(r => r.id !== id);
    saveReminders();
    renderReminders();
    showNotification('Reminder deleted', 'info');
}

function toggleReminder(id, enabled) {
    const reminder = studyReminders.find(r => r.id === id);
    if (reminder) {
        reminder.enabled = enabled;
        saveReminders();
        renderReminders();
    }
}

function scheduleReminder(reminder) {
    if (!reminder.enabled || !reminder.time) return;

    const [hours, minutes] = reminder.time.split(':').map(Number);
    const now = new Date();
    const scheduledTime = new Date();
    scheduledTime.setHours(hours, minutes, 0, 0);

    if (scheduledTime <= now) {
        scheduledTime.setDate(scheduledTime.getDate() + 1);
    }

    const delay = scheduledTime - now;

    setTimeout(() => {
        if (reminder.days.includes(new Date().getDay())) {
            showStudyNotification(reminder);
        }
        scheduleReminder(reminder);
    }, delay);
}

function showStudyNotification(reminder) {
    if (typeof window.playAlarmSound === 'function') {
        window.playAlarmSound();
    }

    if ('Notification' in window && Notification.permission === 'granted') {
        new Notification('Questionary - Study Reminder', {
            body: reminder.title + (reminder.message ? '\n' + reminder.message : ''),
            icon: 'assets/logo.png'
        });
    }

    showNotification(`⏰ ${reminder.title}`, 'info');
}

function requestNotificationPermission() {
    if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission().then(permission => {
            if (permission === 'granted') {
                showNotification('Notifications enabled!', 'success');
            }
        });
    }
}

function renderReminders() {
    const container = document.getElementById('remindersList');
    if (!container) return;

    if (studyReminders.length === 0) {
        container.innerHTML = sanitizeUiHtml('<p class="empty-state"><i class="fas fa-bell-slash"></i> No reminders set. Add one to get started!</p>');
        return;
    }

    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    container.innerHTML = sanitizeUiHtml(studyReminders.map(r => `
        <div class="reminder-item ${r.enabled ? '' : 'disabled'}" data-reminder-id="${escapeHtml(r.id)}">
            <label class="switch">
                <input type="checkbox" class="reminder-toggle-cb" ${r.enabled ? 'checked' : ''}>
                <span class="slider"></span>
            </label>
            <div class="reminder-info">
                <span class="reminder-title">${escapeHtml(r.title)}</span>
                <span class="reminder-time">${escapeHtml(formatTime12Hour(r.time))}</span>
                <span class="reminder-days">${escapeHtml((Array.isArray(r.days) ? r.days : []).map(d => dayNames[d] || '').filter(Boolean).join(', '))}</span>
            </div>
            <div class="reminder-actions">
                <button class="reminder-tag-btn" type="button" title="Add Tags">
                    <i class="fas fa-tag"></i>
                </button>
                <button class="reminder-delete" type="button">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        </div>
    `).join(''));

    container.querySelectorAll('.reminder-item').forEach(el => {
        const rid = el.dataset.reminderId;
        const rObj = studyReminders.find(item => String(item.id) === String(rid));
        el.querySelector('.reminder-toggle-cb')?.addEventListener('change', (e) => toggleReminder(rid, e.target.checked));
        el.querySelector('.reminder-tag-btn')?.addEventListener('click', (e) => {
            e.stopPropagation();
            if (rObj) openTagItemModal(`reminder_${rObj.id}`, rObj.title, 'reminder');
        });
        el.querySelector('.reminder-delete')?.addEventListener('click', () => deleteReminder(rid));
    });
}

function initReminders() {
    requestNotificationPermission();
    studyReminders.forEach(r => {
        if (r.enabled) scheduleReminder(r);
    });
}

/* 5. Theme Management */
var defaultCustomTheme = window.defaultCustomTheme || {
    bg: '#f7f7f8', surface: '#ffffff', fg: '#18181b', accent: '#cf6215',
    navbar: '#ffffff', btnIcon: '#cf6215', line: '#e4e4e7',
    folder1: '#cf6215', folder2: '#0891b2', folder3: '#16a34a',
    folder4: '#ea580c', folder5: '#db2777', folder6: '#7c3aed', folder7: '#0d9488',
    font: "'DM Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif"
};

function isCustomThemeActive() {
    return localStorage.getItem('questionary-custom-theme-active') === 'true';
}

function clearInlineThemeVars() {
    const root = document.documentElement;
    const props = [
        '--bg','--background','--surface','--surface-hover','--fg','--text-primary',
        '--fg2','--text-secondary','--accent','--accent-hover','--accent-light',
        '--primary-color','--primary-hover','--primary-light','--line','--border','--hover',
        '--folder-1','--folder-2','--folder-3','--folder-4','--folder-5','--folder-6','--folder-7',
        '--btn-icon-color','font-family'
    ];
    props.forEach(p => root.style.removeProperty(p));
    document.body.style.fontFamily = '';
    const header = document.querySelector('.header');
    if (header) header.style.background = '';
}

function getCurrentTheme() {
    return localStorage.getItem('questionary-theme') || localStorage.getItem('theme') || 'dark';
}

function updateModeSwitcher() {
    const current = getCurrentTheme();
    document.querySelectorAll('.mode-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.mode === current);
    });
}

function setTheme(themeName) {
    if (themeName !== 'light' && themeName !== 'dark') themeName = 'dark';

    localStorage.setItem('questionary-theme', themeName);
    localStorage.setItem('theme', themeName);
    document.documentElement.setAttribute('data-theme', themeName);

    if (!isCustomThemeActive()) {
        clearInlineThemeVars();
    }

    const themeIcon = document.getElementById('themeIcon');
    if (themeIcon) {
        themeIcon.className = (themeName === 'dark') ? 'fas fa-sun' : 'fas fa-moon';
    }

    updateModeSwitcher();

    const iframe = document.getElementById('pdfViewer');
    if (iframe && iframe.contentWindow) {
        iframe.contentWindow.postMessage({ type: 'setTheme', theme: themeName }, getTargetOrigin());
    }
}

function toggleTheme() {
    const currentTheme = getCurrentTheme();
    const newTheme = (currentTheme === 'dark') ? 'light' : 'dark';
    setTheme(newTheme);
    showNotification(`Switched to ${newTheme === 'dark' ? 'Dark' : 'Light'} mode`, 'info');
}

function toggleCustomTheme(enabled) {
    localStorage.setItem('questionary-custom-theme-active', enabled ? 'true' : 'false');
    const panel = document.getElementById('customThemePanel');
    if (panel) panel.style.display = enabled ? 'block' : 'none';

    if (enabled) {
        applyCustomTheme();
    } else {
        clearInlineThemeVars();
        setTheme(getCurrentTheme());
    }
}

function getCustomThemeValues() {
    const saved = localStorage.getItem('questionary-custom-theme');
    if (saved) {
        try { return { ...defaultCustomTheme, ...JSON.parse(saved) }; } catch(e) {}
    }
    return { ...defaultCustomTheme };
}

function applyCustomTheme() {
    const t = getCustomThemeValues();
    const root = document.documentElement;

    root.style.setProperty('--bg', t.bg);
    root.style.setProperty('--background', t.bg);
    root.style.setProperty('--surface', t.surface);
    root.style.setProperty('--surface-hover', t.surface);
    root.style.setProperty('--fg', t.fg);
    root.style.setProperty('--text-primary', t.fg);
    root.style.setProperty('--fg2', t.fg);
    root.style.setProperty('--text-secondary', t.fg);
    root.style.setProperty('--accent', t.accent);
    root.style.setProperty('--accent-hover', t.accent);
    root.style.setProperty('--accent-light', t.accent + '12');
    root.style.setProperty('--primary-color', t.accent);
    root.style.setProperty('--primary-hover', t.accent);
    root.style.setProperty('--primary-light', t.accent + '12');
    root.style.setProperty('--line', t.line);
    root.style.setProperty('--border', t.line);
    root.style.setProperty('--hover', t.line + '44');
    root.style.setProperty('--folder-1', t.folder1);
    root.style.setProperty('--folder-2', t.folder2);
    root.style.setProperty('--folder-3', t.folder3);
    root.style.setProperty('--folder-4', t.folder4);
    root.style.setProperty('--folder-5', t.folder5);
    root.style.setProperty('--folder-6', t.folder6);
    root.style.setProperty('--folder-7', t.folder7);

    const header = document.querySelector('.header');
    if (header) header.style.background = t.navbar;
    root.style.setProperty('--btn-icon-color', t.btnIcon);

    if (t.font) {
        root.style.setProperty('font-family', t.font);
        document.body.style.fontFamily = t.font;
    }
}

function updateCustomTheme() {
    const ids = {
        bg: 'customBg', surface: 'customSurface', fg: 'customFg', accent: 'customAccent',
        navbar: 'customNavbar', btnIcon: 'customBtnIcon', line: 'customLine'
    };
    const t = {};
    for (const [key, id] of Object.entries(ids)) {
        const el = document.getElementById(id);
        if (el) {
            t[key] = el.value;
            const hexEl = document.getElementById(id + 'Hex');
            if (hexEl) hexEl.textContent = el.value;
        }
    }
    for (let i = 1; i <= 7; i++) {
        const el = document.getElementById('customFolder' + i);
        if (el) t['folder' + i] = el.value;
    }
    const fontEl = document.getElementById('customFont');
    if (fontEl) t.font = fontEl.value;

    if (isCustomThemeActive()) {
        localStorage.setItem('questionary-custom-theme', JSON.stringify(t));
        applyCustomTheme();
    }
}

function saveCustomTheme() {
    updateCustomTheme();
    const t = {};
    const ids = {
        bg: 'customBg', surface: 'customSurface', fg: 'customFg', accent: 'customAccent',
        navbar: 'customNavbar', btnIcon: 'customBtnIcon', line: 'customLine'
    };
    for (const [key, id] of Object.entries(ids)) {
        const el = document.getElementById(id);
        if (el) t[key] = el.value;
    }
    for (let i = 1; i <= 7; i++) {
        const el = document.getElementById('customFolder' + i);
        if (el) t['folder' + i] = el.value;
    }
    const fontEl = document.getElementById('customFont');
    if (fontEl) t.font = fontEl.value;

    localStorage.setItem('questionary-custom-theme', JSON.stringify(t));
    localStorage.setItem('questionary-custom-theme-active', 'true');
    showNotification('Custom theme saved!', 'success');
}

function resetCustomTheme() {
    localStorage.removeItem('questionary-custom-theme');
    populateCustomThemePickers(defaultCustomTheme);
    if (isCustomThemeActive()) {
        applyCustomTheme();
    }
    showNotification('Theme reset to defaults', 'success');
}

function populateCustomThemePickers(t) {
    const ids = {
        bg: 'customBg', surface: 'customSurface', fg: 'customFg', accent: 'customAccent',
        navbar: 'customNavbar', btnIcon: 'customBtnIcon', line: 'customLine'
    };
    for (const [key, id] of Object.entries(ids)) {
        const el = document.getElementById(id);
        if (el) {
            el.value = t[key] || defaultCustomTheme[key];
            const hexEl = document.getElementById(id + 'Hex');
            if (hexEl) hexEl.textContent = el.value;
        }
    }
    for (let i = 1; i <= 7; i++) {
        const el = document.getElementById('customFolder' + i);
        if (el) el.value = t['folder' + i] || defaultCustomTheme['folder' + i];
    }
    const fontEl = document.getElementById('customFont');
    if (fontEl) {
        fontEl.value = t.font || defaultCustomTheme.font;
    }
}

function initThemeOnLoad() {
    const stored = getCurrentTheme();
    setTheme(stored);

    const toggle = document.getElementById('customThemeToggle');
    const panel = document.getElementById('customThemePanel');
    if (isCustomThemeActive()) {
        if (toggle) toggle.checked = true;
        if (panel) panel.style.display = 'block';
        populateCustomThemePickers(getCustomThemeValues());
        applyCustomTheme();
    } else {
        if (toggle) toggle.checked = false;
        if (panel) panel.style.display = 'none';
        populateCustomThemePickers(getCustomThemeValues());
        clearInlineThemeVars();
    }
}

/* 6. Tagging System */
var tags = window.tags || JSON.parse(localStorage.getItem('questionary-tags') || '[]');
window.tags = tags;
var itemTags = window.itemTags || JSON.parse(localStorage.getItem('questionary-item-tags') || '{}');
window.itemTags = itemTags;

(function cleanupOrphanedItemTags() {
    const validTagIds = new Set(tags.map(t => t.id));
    let changed = false;
    Object.keys(itemTags).forEach(key => {
        itemTags[key] = itemTags[key].filter(id => validTagIds.has(id));
        if (itemTags[key].length === 0) {
            delete itemTags[key];
            changed = true;
        }
    });
    if (changed) {
        localStorage.setItem('questionary-item-tags', JSON.stringify(itemTags));
    }
})();

function saveTags() {
    localStorage.setItem('questionary-tags', JSON.stringify(tags));
    localStorage.setItem('questionary-item-tags', JSON.stringify(itemTags));
}

function createTag(name, color = '#cf6215') {
    const cleanName = name.toLowerCase().trim();
    const tag = {
        id: Date.now().toString(),
        name: cleanName,
        color: color
    };

    if (!tags.find(t => t.name === tag.name)) {
        tags.push(tag);
        saveTags();
        renderTagsList();
        renderTagsMain();
        renderTaggedItems();
        if (typeof window.renderHomeTagsList === 'function') window.renderHomeTagsList();
        if (typeof window.renderHomeTaggedItemsList === 'function') window.renderHomeTaggedItemsList();
        showNotification(`Tag "${tag.name}" created`, 'success');
    }
    return tag;
}

function deleteTag(tagId) {
    tags = tags.filter(t => t.id !== tagId);
    Object.keys(itemTags).forEach(key => {
        itemTags[key] = itemTags[key].filter(id => id !== tagId);
        if (itemTags[key].length === 0) {
            delete itemTags[key];
        }
    });
    saveTags();
    renderTagsList();
    renderTagsMain();
    renderTaggedItems();
    if (typeof window.renderHomeTagsList === 'function') window.renderHomeTagsList();
    if (typeof window.renderHomeTaggedItemsList === 'function') window.renderHomeTaggedItemsList();
    showNotification('Tag deleted', 'info');
}

function addTagToItem(itemId, tagId) {
    if (!itemTags[itemId]) {
        itemTags[itemId] = [];
    }
    if (!itemTags[itemId].includes(tagId)) {
        itemTags[itemId].push(tagId);
        saveTags();
    }
}

function removeTagFromItem(itemId, tagId) {
    if (itemTags[itemId]) {
        itemTags[itemId] = itemTags[itemId].filter(id => id !== tagId);
        saveTags();
    }
}

function getItemTags(itemId) {
    const tagIds = itemTags[itemId] || [];
    return tagIds.map(id => tags.find(t => t.id === id)).filter(Boolean);
}

function countItemsWithTag(tagId) {
    return Object.values(itemTags).filter(t => t.includes(tagId)).length;
}

function renderTagsList() {
    const container = document.getElementById('tagsList');
    if (!container) return;

    if (tags.length === 0) {
        container.innerHTML = sanitizeUiHtml('<p class="empty-state">No tags created yet.</p>');
        return;
    }

    container.innerHTML = sanitizeUiHtml(tags.map(tag => {
        const safeColor = isSafeHexColor(tag.color, '#3b82f6');
        return `
        <div class="tag-item" style="--tag-color: ${safeColor}" data-tag-id="${escapeHtml(tag.id)}">
            <div class="tag-color" style="background: ${safeColor}"></div>
            <span class="tag-name">${escapeHtml(tag.name)}</span>
            <span class="tag-count">${countItemsWithTag(tag.id)} items</span>
            <button class="tag-delete" type="button">
                <i class="fas fa-times"></i>
            </button>
        </div>`;
    }).join(''));

    container.querySelectorAll('.tag-delete').forEach(btn => {
        btn.addEventListener('click', () => {
            const tagId = btn.closest('.tag-item')?.dataset.tagId;
            if (tagId) deleteTag(tagId);
        });
    });
}

/* 7. Voice Notes */
var mediaRecorder = window.mediaRecorder || null;
var audioChunks = window.audioChunks || [];
var voiceNotes = window.voiceNotes || JSON.parse(localStorage.getItem('questionary-voice-notes') || '[]');
window.voiceNotes = voiceNotes;
var currentAudio = window.currentAudio || null;
var recordingStartTime = window.recordingStartTime || null;
var recordingTimerInterval = window.recordingTimerInterval || null;

function saveVoiceNotes() {
    localStorage.setItem('questionary-voice-notes', JSON.stringify(voiceNotes));
}

async function startRecording() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(stream);
        audioChunks = [];

        mediaRecorder.ondataavailable = (e) => audioChunks.push(e.data);
        mediaRecorder.onstop = async () => {
            const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
            const reader = new FileReader();
            reader.onloadend = () => {
                saveVoiceNote(reader.result);
            };
            reader.readAsDataURL(audioBlob);
            stream.getTracks().forEach(track => track.stop());
        };

        mediaRecorder.start();
        recordingStartTime = Date.now();
        startRecordingTimer();
        updateRecordingUI(true);
        showNotification('Recording started...', 'info');
    } catch (err) {
        showNotification('Could not access microphone', 'error');
        console.error('Recording error:', err);
    }
}

function stopRecording() {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
        mediaRecorder.stop();
        stopRecordingTimer();
        updateRecordingUI(false);
        updateRecordingUINotes(false);
        showNotification('Recording saved!', 'success');
    }
}

async function startRecordingNotes() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(stream);
        audioChunks = [];

        mediaRecorder.ondataavailable = (e) => audioChunks.push(e.data);
        mediaRecorder.onstop = async () => {
            const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
            const reader = new FileReader();
            reader.onloadend = () => {
                saveVoiceNote(reader.result);
                renderVoiceNotesGrid();
            };
            reader.readAsDataURL(audioBlob);
            stream.getTracks().forEach(track => track.stop());
        };

        mediaRecorder.start();
        recordingStartTime = Date.now();
        startRecordingTimerNotes();
        updateRecordingUINotes(true);
        showNotification('Recording started...', 'info');
    } catch (err) {
        showNotification('Could not access microphone', 'error');
        console.error('Recording error:', err);
    }
}

function startRecordingTimerNotes() {
    const timerEl = document.getElementById('recordingTimeNotes');
    if (!timerEl) return;

    if (recordingTimerInterval) clearInterval(recordingTimerInterval);
    recordingTimerInterval = setInterval(() => {
        const elapsed = Math.floor((Date.now() - recordingStartTime) / 1000);
        const mins = Math.floor(elapsed / 60).toString().padStart(2, '0');
        const secs = (elapsed % 60).toString().padStart(2, '0');
        timerEl.textContent = `${mins}:${secs}`;
    }, 1000);
}

function updateRecordingUINotes(isRecording) {
    const btn = document.getElementById('recordBtnNotes');
    if (btn) {
        btn.classList.toggle('recording', isRecording);
        btn.innerHTML = sanitizeUiHtml(isRecording ? '<i class="fas fa-stop"></i><span>Stop</span>' : '<i class="fas fa-microphone"></i><span>Record</span>');
    }
}

function startRecordingTimer() {
    const timerEl = document.getElementById('recordingTime');
    if (!timerEl) return;

    if (recordingTimerInterval) clearInterval(recordingTimerInterval);
    recordingTimerInterval = setInterval(() => {
        const elapsed = Math.floor((Date.now() - recordingStartTime) / 1000);
        const mins = Math.floor(elapsed / 60).toString().padStart(2, '0');
        const secs = (elapsed % 60).toString().padStart(2, '0');
        timerEl.textContent = `${mins}:${secs}`;
    }, 1000);
}

function stopRecordingTimer() {
    if (recordingTimerInterval) {
        clearInterval(recordingTimerInterval);
        recordingTimerInterval = null;
    }
    const timerEl = document.getElementById('recordingTime');
    if (timerEl) timerEl.textContent = '00:00';
    const timerNotesEl = document.getElementById('recordingTimeNotes');
    if (timerNotesEl) timerNotesEl.textContent = '00:00';
}

function saveVoiceNote(audioData) {
    const voiceNote = {
        id: Date.now().toString(),
        title: `Voice Note ${voiceNotes.length + 1}`,
        audio: audioData,
        duration: '0:00',
        createdAt: new Date().toISOString(),
        linkedTo: null
    };

    voiceNotes.push(voiceNote);
    saveVoiceNotes();
    renderVoiceNotes();
    renderVoiceNotesGrid();
}

function deleteVoiceNote(id) {
    voiceNotes = voiceNotes.filter(v => v.id !== id);
    saveVoiceNotes();
    renderVoiceNotes();
    renderVoiceNotesGrid();
    showNotification('Voice note deleted', 'info');
}

function playVoiceNote(id) {
    const note = voiceNotes.find(v => v.id === id);
    if (note) {
        if (currentAudio) {
            currentAudio.pause();
            currentAudio.currentTime = 0;
        }

        currentAudio = new Audio(note.audio);
        currentAudio.onended = () => {
            currentAudio = null;
            document.querySelectorAll('.voice-play i, .play-voice-note i').forEach(i => {
                i.className = 'fas fa-play';
            });
        };

        currentAudio.play();
        showNotification(`Playing: ${note.title}`, 'info');
    }
}

function stopCurrentAudio() {
    if (currentAudio) {
        currentAudio.pause();
        currentAudio.currentTime = 0;
        currentAudio = null;
    }
}

function updateRecordingUI(isRecording) {
    const btn = document.getElementById('recordBtn');
    if (btn) {
        btn.classList.toggle('recording', isRecording);
        btn.innerHTML = sanitizeUiHtml(isRecording ? '<i class="fas fa-stop"></i> Stop' : '<i class="fas fa-microphone"></i> Record');
    }
}

function renderVoiceNotes() {
    const container = document.getElementById('voiceNotesList');
    if (!container) return;

    if (voiceNotes.length === 0) {
        container.innerHTML = sanitizeUiHtml('<p class="empty-state">No voice notes yet. Click Record to create one.</p>');
        return;
    }

    container.innerHTML = sanitizeUiHtml(voiceNotes.map(v => `
        <div class="voice-note-item" data-id="${escapeHtml(v.id)}">
            <button class="voice-play" type="button">
                <i class="fas fa-play"></i>
            </button>
            <div class="voice-info">
                <span class="voice-title">${escapeHtml(v.title)}</span>
                <span class="voice-date">${escapeHtml(new Date(v.createdAt).toLocaleDateString())}</span>
            </div>
            <button class="voice-delete" type="button">
                <i class="fas fa-trash"></i>
            </button>
        </div>
    `).join(''));

    container.querySelectorAll('.voice-note-item').forEach(el => {
        const vid = el.dataset.id;
        el.querySelector('.voice-play')?.addEventListener('click', () => playVoiceNote(vid));
        el.querySelector('.voice-delete')?.addEventListener('click', () => deleteVoiceNote(vid));
    });
}

function toggleRecording() {
    const btn = document.getElementById('recordBtn');
    if (btn && btn.classList.contains('recording')) {
        stopRecording();
    } else {
        startRecording();
    }
}

function toggleRecordingNotes() {
    const btn = document.getElementById('recordBtnNotes');
    if (btn && btn.classList.contains('recording')) {
        stopRecording();
    } else {
        startRecordingNotes();
    }
}

/* 8. Export & Import */
function exportAllData() {
    const data = {
        version: '1.0',
        exportDate: new Date().toISOString(),
        favorites: JSON.parse(localStorage.getItem('questionary-favorites') || '[]'),
        notes: JSON.parse(localStorage.getItem('questionary-notes') || '[]'),
        flashcards: JSON.parse(localStorage.getItem('questionary-flashcards') || '[]'),
        studySessions: JSON.parse(localStorage.getItem('questionary-sessions') || '[]'),
        quickLinks: JSON.parse(localStorage.getItem('questionary-quick-links') || '[]'),
        studyStats: JSON.parse(localStorage.getItem('questionary-study-stats') || '{}'),
        reminders: JSON.parse(localStorage.getItem('questionary-reminders') || '[]'),
        tags: JSON.parse(localStorage.getItem('questionary-tags') || '[]'),
        itemTags: JSON.parse(localStorage.getItem('questionary-item-tags') || '{}'),
        pdfBookmarks: JSON.parse(localStorage.getItem('questionary-pdf-bookmarks') || '{}'),
        voiceNotes: JSON.parse(localStorage.getItem('questionary-voice-notes') || '[]'),
        quizHistory: JSON.parse(localStorage.getItem('questionary-quiz-history') || '[]'),
        theme: localStorage.getItem('questionary-theme') || 'dark'
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `questionary-backup-${new Date().toISOString().split('T')[0]}.json`;
    a.click();

    URL.revokeObjectURL(url);
    showNotification('Data exported successfully!', 'success');
}

function importData(rawInput) {
    try {
        if (!rawInput || typeof rawInput !== 'object' || Array.isArray(rawInput)) {
            showNotification('Invalid backup file', 'error');
            return;
        }
        const data = stripProtoKeys(rawInput);
        if (!(data.version || data.favorites || data.notes || data.flashcards || data.tags || data.pdfBookmarks)) {
            showNotification('Invalid backup file', 'error');
            return;
        }

        const safeArray = (val, maxLen = 2000) => Array.isArray(val) ? val.slice(0, maxLen) : null;
        const safeString = (val, maxLen = 50000) => typeof val === 'string' ? val.slice(0, maxLen) : '';

        if (safeArray(data.favorites)) {
            const validFavs = data.favorites
                .filter(f => f && typeof f === 'object' && typeof f.title === 'string')
                .map(f => ({
                    title: safeString(f.title, 300),
                    path: Array.isArray(f.path) ? f.path.slice(0, 32).map(s => safeString(String(s), 200)) : [],
                    url: (!f.url || f.url === '#' || isSafeDocumentUrl(f.url)) ? String(f.url || '') : ''
                }));
            localStorage.setItem('questionary-favorites', JSON.stringify(validFavs));
        }

        if (safeArray(data.notes)) {
            const validNotes = data.notes
                .filter(n => n && typeof n === 'object')
                .map(n => ({
                    ...n,
                    id: safeString(String(n.id || Date.now()), 120),
                    title: safeString(n.title || 'Untitled Note', 300),
                    content: safeString(n.content || '', 200000),
                    category: safeString(n.category || 'general', 60)
                }));
            localStorage.setItem('questionary-notes', JSON.stringify(validNotes));
        }

        if (safeArray(data.flashcards)) {
            const validDecks = data.flashcards
                .filter(d => d && typeof d === 'object')
                .map(d => ({
                    ...d,
                    id: safeString(String(d.id || Date.now()), 120),
                    name: safeString(d.name || 'Deck', 300),
                    subject: safeString(d.subject || 'General', 80),
                    cards: Array.isArray(d.cards) ? d.cards.slice(0, 1000).map(c => ({
                        ...c,
                        front: safeString(c?.front || '', 5000),
                        back: safeString(c?.back || '', 5000),
                        hint: safeString(c?.hint || '', 1000)
                    })) : []
                }));
            localStorage.setItem('questionary-flashcards', JSON.stringify(validDecks));
        }

        if (safeArray(data.studySessions)) {
            const validSessions = data.studySessions
                .filter(s => s && typeof s === 'object')
                .map(s => ({
                    id: safeString(String(s.id || Date.now()), 120),
                    subject: safeString(s.subject || '', 300),
                    date: safeString(s.date || '', 40),
                    time: safeString(s.time || '', 40)
                }));
            localStorage.setItem('questionary-sessions', JSON.stringify(validSessions));
        }

        if (safeArray(data.quickLinks)) {
            const validLinks = data.quickLinks
                .filter(ql => ql && typeof ql === 'object' && Array.isArray(ql.pathArray))
                .map(ql => ({
                    id: safeString(String(ql.id || Date.now()), 120),
                    name: safeString(ql.name || '', 200),
                    pathArray: ql.pathArray.slice(0, 32).map(s => safeString(String(s), 200)),
                    isFile: Boolean(ql.isFile),
                    url: (!ql.url || isSafeDocumentUrl(ql.url)) ? String(ql.url || '') : ''
                }));
            localStorage.setItem('questionary-quick-links', JSON.stringify(validLinks));
        }

        if (data.studyStats && typeof data.studyStats === 'object' && !Array.isArray(data.studyStats)) {
            localStorage.setItem('questionary-study-stats', JSON.stringify(data.studyStats));
        }

        if (safeArray(data.reminders)) {
            const validReminders = data.reminders
                .filter(r => r && typeof r === 'object')
                .map(r => ({
                    id: safeString(String(r.id || Date.now()), 120),
                    title: safeString(r.title || 'Reminder', 200),
                    time: safeString(r.time || '09:00', 20),
                    days: Array.isArray(r.days) ? r.days.filter(d => Number.isInteger(d) && d >= 0 && d <= 6) : [],
                    enabled: Boolean(r.enabled)
                }));
            localStorage.setItem('questionary-reminders', JSON.stringify(validReminders));
        }

        if (safeArray(data.tags)) {
            const validTags = data.tags
                .filter(t => t && typeof t === 'object' && typeof t.name === 'string')
                .map(t => ({
                    id: safeString(String(t.id || Date.now()), 120),
                    name: safeString(t.name, 80),
                    color: isSafeHexColor(t.color, '#3b82f6')
                }));
            localStorage.setItem('questionary-tags', JSON.stringify(validTags));
        }

        if (data.itemTags && typeof data.itemTags === 'object' && !Array.isArray(data.itemTags)) {
            const validItemTags = {};
            for (const [k, v] of Object.entries(data.itemTags).slice(0, 5000)) {
                if (Array.isArray(v)) {
                    validItemTags[safeString(k, 300)] = v.slice(0, 50).map(id => safeString(String(id), 120));
                }
            }
            localStorage.setItem('questionary-item-tags', JSON.stringify(validItemTags));
        }

        if (data.pdfBookmarks && typeof data.pdfBookmarks === 'object' && !Array.isArray(data.pdfBookmarks)) {
            const validBookmarks = {};
            for (const [docKey, list] of Object.entries(data.pdfBookmarks).slice(0, 1000)) {
                if (!isSafeDocumentUrl(docKey) || !Array.isArray(list)) continue;
                validBookmarks[docKey] = list.slice(0, 200).map(b => ({
                    id: safeString(String(b?.id || Date.now()), 120),
                    page: Math.max(1, parseInt(b?.page, 10) || 1),
                    title: safeString(b?.title || 'Bookmark', 200),
                    createdAt: safeString(b?.createdAt || '', 60)
                }));
            }
            localStorage.setItem('questionary-pdf-bookmarks', JSON.stringify(validBookmarks));
        }

        if (safeArray(data.voiceNotes)) {
            const validVoiceNotes = data.voiceNotes
                .filter(v => v && typeof v === 'object' && isSafeMediaDataUrl(v.audio))
                .slice(0, 100)
                .map(v => ({
                    id: safeString(String(v.id || Date.now()), 120),
                    title: safeString(v.title || 'Voice Note', 200),
                    audio: v.audio,
                    duration: safeString(v.duration || '0:00', 20),
                    createdAt: safeString(v.createdAt || '', 60),
                    linkedTo: v.linkedTo ? safeString(String(v.linkedTo), 200) : null
                }));
            localStorage.setItem('questionary-voice-notes', JSON.stringify(validVoiceNotes));
        }

        if (safeArray(data.quizHistory)) {
            localStorage.setItem('questionary-quiz-history', JSON.stringify(data.quizHistory.slice(-100)));
        }

        if (data.theme === 'light' || data.theme === 'dark') {
            localStorage.setItem('questionary-theme', data.theme);
        }

        showNotification('Data imported successfully! Refreshing...', 'success');
        setTimeout(() => location.reload(), 1500);
    } catch (err) {
        showNotification('Error reading backup file', 'error');
        console.error('Import error:', err);
    }
}

/* 9. Customizable Dashboard */
var dashboardLayout = window.dashboardLayout || JSON.parse(localStorage.getItem('questionary-dashboard-layout') || '{"widgets":["documents","favorites","recent","streak"],"visible":{"documents":true,"favorites":true,"recent":true,"streak":true}}');
window.dashboardLayout = dashboardLayout;

function saveDashboardLayout() {
    localStorage.setItem('questionary-dashboard-layout', JSON.stringify(dashboardLayout));
}

function toggleWidgetVisibility(widgetId, isVisible) {
    if (!dashboardLayout.visible) {
        dashboardLayout.visible = {};
    }
    dashboardLayout.visible[widgetId] = isVisible;
    saveDashboardLayout();
    applyDashboardLayout();
    showNotification(`Widget ${isVisible ? 'shown' : 'hidden'}`, 'info');
}

function reorderWidget(widgetId, direction) {
    if (!dashboardLayout.widgets) return;

    const index = dashboardLayout.widgets.indexOf(widgetId);
    if (index === -1) return;

    if (direction === -1 && index > 0) {
        [dashboardLayout.widgets[index], dashboardLayout.widgets[index - 1]] =
        [dashboardLayout.widgets[index - 1], dashboardLayout.widgets[index]];
    } else if (direction === 1 && index < dashboardLayout.widgets.length - 1) {
        [dashboardLayout.widgets[index], dashboardLayout.widgets[index + 1]] =
        [dashboardLayout.widgets[index + 1], dashboardLayout.widgets[index]];
    }

    saveDashboardLayout();
    renderDashboardWidgets();
    applyDashboardLayout();
}

function applyDashboardLayout() {
    if (!dashboardLayout.widgets) return;
    const dashboardHeader = document.querySelector('.dashboard-header');
    if (!dashboardHeader) return;

    const widgetMap = {
        'documents': dashboardHeader.querySelector('.stat-card:nth-child(1)'),
        'favorites': dashboardHeader.querySelector('.stat-card:nth-child(2)'),
        'recent': dashboardHeader.querySelector('.stat-card:nth-child(3)'),
        'streak': dashboardHeader.querySelector('.stat-card:nth-child(4)')
    };

    Object.entries(widgetMap).forEach(([id, el]) => {
        if (el) {
            el.style.display = dashboardLayout.visible[id] !== false ? 'flex' : 'none';
        }
    });

    dashboardLayout.widgets.forEach((widgetId, idx) => {
        const el = widgetMap[widgetId];
        if (el) {
            el.style.order = idx;
        }
    });
}

function renderDashboardWidgets() {
    const container = document.getElementById('dashboardWidgets');
    if (!container) return;

    if (!dashboardLayout.widgets || dashboardLayout.widgets.length === 0) {
        dashboardLayout = {
            widgets: ['documents', 'favorites', 'recent', 'streak'],
            visible: { documents: true, favorites: true, recent: true, streak: true }
        };
        saveDashboardLayout();
    }

    const widgetInfo = [
        { id: 'documents', name: 'Documents', icon: 'fa-file-alt' },
        { id: 'favorites', name: 'Favorites', icon: 'fa-star' },
        { id: 'recent', name: 'Recent', icon: 'fa-history' },
        { id: 'streak', name: 'Day Streak', icon: 'fa-fire' }
    ];

    const allowedWidgets = new Set(['documents', 'favorites', 'recent', 'streak']);
    container.innerHTML = sanitizeUiHtml(dashboardLayout.widgets
        .filter(widgetId => allowedWidgets.has(widgetId))
        .map((widgetId, idx, arr) => {
            const info = widgetInfo.find(w => w.id === widgetId) || { name: widgetId, icon: 'fa-cube' };
            const isVisible = dashboardLayout.visible[widgetId] !== false;

            return `
                <div class="widget-setting-item" data-widget-id="${escapeHtml(widgetId)}">
                    <i class="fas ${info.icon}"></i>
                    <span class="widget-name">${escapeHtml(info.name)}</span>
                    <div class="widget-reorder">
                        <button type="button" class="widget-up-btn" ${idx === 0 ? 'disabled' : ''}>
                            <i class="fas fa-chevron-up"></i>
                        </button>
                        <button type="button" class="widget-down-btn" ${idx === arr.length - 1 ? 'disabled' : ''}>
                            <i class="fas fa-chevron-down"></i>
                        </button>
                    </div>
                    <label class="switch">
                        <input type="checkbox" class="widget-visible-cb" ${isVisible ? 'checked' : ''}>
                        <span class="slider"></span>
                    </label>
                </div>
            `;
        }).join(''));

    container.querySelectorAll('.widget-setting-item').forEach(el => {
        const wid = el.dataset.widgetId;
        el.querySelector('.widget-up-btn')?.addEventListener('click', () => reorderWidget(wid, -1));
        el.querySelector('.widget-down-btn')?.addEventListener('click', () => reorderWidget(wid, 1));
        el.querySelector('.widget-visible-cb')?.addEventListener('change', (e) => toggleWidgetVisibility(wid, e.target.checked));
    });
}

/* 10. File Import Handlers */
async function importFileFromAnySource(fileOrPath, folderId = null) {
    if (!fileOrPath) return;
    const validFolderId = (folderId !== null && folderId !== undefined && folderId !== 'null') ? Number(folderId) : null;
    let fileObj = null;

    if (fileOrPath instanceof File || fileOrPath instanceof Blob) {
        fileObj = fileOrPath;
    } else if (typeof fileOrPath === 'string') {
        if (!isSafeDocumentUrl(fileOrPath)) {
            showNotification('Blocked unsafe import URL', 'error');
            return;
        }
        const fileName = fileOrPath.split(/[/\\]/).pop() || 'imported_file.pdf';
        try {
            const res = await fetch(fileOrPath);
            const arrayBuffer = await res.arrayBuffer();
            const contentType = res.headers.get('content-type') || '';
            fileObj = new File([arrayBuffer], fileName, { type: contentType });
        } catch (e) {}
    }

    if (fileObj) {
        await UserLibraryDbService.importFile(fileObj, validFolderId);
    }
}

async function processAndImportFiles(filesOrPaths, folderId = null) {
    if (!filesOrPaths || filesOrPaths.length === 0) return;

    if (!UserLibraryDbService.db) {
        await UserLibraryDbService.init();
    }

    const targetFolder = (folderId !== null && folderId !== undefined) ? folderId : UserLibraryDbService.currentFolderId;

    showNotification(`Importing ${filesOrPaths.length} file(s)...`, 'info');
    let importedCount = 0;

    for (const item of filesOrPaths) {
        try {
            await importFileFromAnySource(item, targetFolder);
            importedCount++;
        } catch (err) {
            console.error('[Import Error]:', err);
        }
    }

    clearDragHoverStyles();

    if (importedCount > 0) {
        await renderLibrary();
        showNotification(`Successfully imported ${importedCount} file(s) to Library!`, 'success');
    }
}

async function handleFilesSelect(files) {
    if (files && files.length > 0) {
        await processAndImportFiles(Array.from(files));
    }
}

async function importPdfFile(file) {
    await processAndImportFiles([file]);
}

/* 11. Alarm System */
var alarmSettings = window.alarmSettings || JSON.parse(localStorage.getItem('questionary-alarm-settings') || '{}');
window.alarmSettings = alarmSettings;
if (!alarmSettings.sound) alarmSettings.sound = 'classic';
if (!alarmSettings.volume) alarmSettings.volume = 70;

var currentAlarmAudio = window.currentAlarmAudio || null;
var alarmAudioContext = window.alarmAudioContext || null;
var alarmIntervalId = window.alarmIntervalId || null;

var alarmPatterns = window.alarmPatterns || {
    classic: { frequencies: [880, 0, 880, 0, 880, 0, 0], durations: [120, 80, 120, 80, 120, 80, 400], type: 'square' },
    gentle: { frequencies: [392, 440, 523, 587, 659, 784, 880], durations: [250, 250, 250, 250, 300, 300, 500], type: 'sine' },
    urgent: { frequencies: [1047, 0, 1047, 0, 1319, 0, 1319, 0, 1568, 0], durations: [60, 60, 60, 60, 60, 60, 60, 60, 60, 300], type: 'square' },
    chime: { frequencies: [659, 523, 0, 659, 523, 0, 784, 659, 523], durations: [300, 450, 200, 300, 450, 200, 250, 250, 600], type: 'sine' },
    digital: { frequencies: [1200, 0, 1200, 0, 800, 0], durations: [150, 75, 150, 75, 200, 350], type: 'square' },
    bell: { frequencies: [659, 0, 523, 0, 659, 784, 659], durations: [350, 50, 350, 50, 200, 200, 500], type: 'triangle' }
};

function saveAlarmSettings() {
    localStorage.setItem('questionary-alarm-settings', JSON.stringify(alarmSettings));
}

function setAlarmSound(soundName) {
    alarmSettings.sound = soundName;
    saveAlarmSettings();

    document.querySelectorAll('.alarm-option').forEach(opt => {
        opt.classList.toggle('active', opt.dataset.sound === soundName);
    });

    const customUpload = document.getElementById('customSoundUpload');
    if (customUpload) {
        customUpload.style.display = soundName === 'custom' ? 'block' : 'none';
    }
}

function setAlarmVolume(volume) {
    alarmSettings.volume = parseInt(volume, 10);
    saveAlarmSettings();
    const volumeDisplay = document.getElementById('alarmVolumeValue');
    if (volumeDisplay) volumeDisplay.textContent = alarmSettings.volume + '%';
}

async function playPatternOnce(pattern, volume) {
    return new Promise((resolve) => {
        try {
            if (!alarmAudioContext) {
                alarmAudioContext = new (window.AudioContext || window.webkitAudioContext)();
            }

            const { frequencies, durations, type } = pattern;
            let currentTime = alarmAudioContext.currentTime;

            frequencies.forEach((freq, i) => {
                if (freq > 0) {
                    const osc = alarmAudioContext.createOscillator();
                    const gain = alarmAudioContext.createGain();

                    osc.type = type;
                    osc.frequency.value = freq;

                    gain.gain.setValueAtTime(0, currentTime);
                    gain.gain.linearRampToValueAtTime(volume, currentTime + 0.01);
                    gain.gain.setValueAtTime(volume, currentTime + (durations[i] / 1000) - 0.02);
                    gain.gain.linearRampToValueAtTime(0, currentTime + (durations[i] / 1000));

                    osc.connect(gain);
                    gain.connect(alarmAudioContext.destination);

                    osc.start(currentTime);
                    osc.stop(currentTime + (durations[i] / 1000));
                }
                currentTime += durations[i] / 1000;
            });

            const totalDuration = durations.reduce((a, b) => a + b, 0);
            setTimeout(resolve, totalDuration);
        } catch (e) {
            resolve();
        }
    });
}

function previewAlarmSound(soundName) {
    stopAlarmSound();

    if (soundName === 'custom' && alarmSettings.customSound) {
        currentAlarmAudio = new Audio(alarmSettings.customSound);
        currentAlarmAudio.volume = alarmSettings.volume / 100;
        currentAlarmAudio.play().catch(e => console.log('Audio play failed:', e));
    } else if (alarmPatterns[soundName]) {
        playPatternOnce(alarmPatterns[soundName], alarmSettings.volume / 100);
    }
}

async function playAlarmSound() {
    stopAlarmSound();

    const soundName = alarmSettings.sound || 'classic';
    const volume = alarmSettings.volume / 100;

    if (soundName === 'custom' && alarmSettings.customSound) {
        currentAlarmAudio = new Audio(alarmSettings.customSound);
        currentAlarmAudio.volume = volume;
        currentAlarmAudio.loop = true;
        currentAlarmAudio.play().catch(e => console.log('Audio play failed:', e));
    } else if (alarmPatterns[soundName]) {
        alarmIntervalId = true;
        const playLoop = async () => {
            while (alarmIntervalId !== null) {
                await playPatternOnce(alarmPatterns[soundName], volume);
                await new Promise(r => setTimeout(r, 200));
            }
        };
        playLoop();
    }

    setTimeout(() => stopAlarmSound(), 30000);
    showAlarmNotification();
}

function stopAlarmSound() {
    alarmIntervalId = null;

    if (currentAlarmAudio) {
        currentAlarmAudio.pause();
        currentAlarmAudio.currentTime = 0;
        currentAlarmAudio = null;
    }

    if (alarmAudioContext) {
        alarmAudioContext.close().catch(() => {});
        alarmAudioContext = null;
    }

    const alarmNotif = document.getElementById('alarmNotification');
    if (alarmNotif) alarmNotif.remove();
}

function showAlarmNotification() {
    const existing = document.getElementById('alarmNotification');
    if (existing) existing.remove();

    const notif = document.createElement('div');
    notif.id = 'alarmNotification';
    notif.className = 'alarm-notification';
    notif.innerHTML = sanitizeUiHtml(`
        <div class="alarm-notification-content">
            <i class="fas fa-bell alarm-bell-icon"></i>
            <span class="alarm-notification-text">Timer Complete!</span>
            <button type="button" class="alarm-dismiss-btn">
                <i class="fas fa-times"></i> Dismiss
            </button>
        </div>
    `);
    notif.querySelector('.alarm-dismiss-btn')?.addEventListener('click', stopAlarmSound);
    document.body.appendChild(notif);
}

function handleCustomSoundUpload(file) {
    if (!file || !file.type.startsWith('audio/')) {
        showNotification('Please select an audio file', 'error');
        return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
        alarmSettings.customSound = e.target.result;
        alarmSettings.customSoundName = file.name;
        saveAlarmSettings();

        const nameEl = document.getElementById('customSoundName');
        if (nameEl) nameEl.textContent = file.name;

        showNotification('Custom sound uploaded!', 'success');
    };
    reader.readAsDataURL(file);
}

function initAlarmUI() {
    document.querySelectorAll('.alarm-option').forEach(opt => {
        opt.classList.toggle('active', opt.dataset.sound === alarmSettings.sound);
    });

    const volumeSlider = document.getElementById('alarmVolume');
    const volumeDisplay = document.getElementById('alarmVolumeValue');
    if (volumeSlider) volumeSlider.value = alarmSettings.volume;
    if (volumeDisplay) volumeDisplay.textContent = alarmSettings.volume + '%';

    const customUpload = document.getElementById('customSoundUpload');
    if (customUpload) {
        customUpload.style.display = alarmSettings.sound === 'custom' ? 'block' : 'none';
    }

    if (alarmSettings.customSoundName) {
        const nameEl = document.getElementById('customSoundName');
        if (nameEl) nameEl.textContent = alarmSettings.customSoundName;
    }
}

/* 12. Library Database & Storage Service */
var UserLibraryFileStore = window.UserLibraryFileStore || {
    _getStorageDir() {
        return localStorage.getItem('questionary-storage-path') || localStorage.getItem('questionary-storage-dir') || '';
    },

    _normalizeToUint8Array(raw) {
        return cloneIndependentUint8Array(raw);
    },

    async saveBytes(blobId, uInt8Array) {
        const cleanId = String(blobId || '').replace(/^blob-id:/, '');
        const storagePath = this._getStorageDir();
        const cleanBytes = cloneIndependentUint8Array(uInt8Array);
        if (!cleanId || !cleanBytes || cleanBytes.byteLength === 0) return;

        if (window.electronAPI && typeof window.electronAPI.saveUserLibraryFile === 'function') {
            try {
                await window.electronAPI.saveUserLibraryFile({
                    blobId: cleanId,
                    storageDir: storagePath,
                    buffer: cleanBytes
                });
            } catch(e) {
                console.warn('[UserLibrary] Electron save failed, falling back to IndexedDB:', e);
            }
        }

        return new Promise((resolve) => {
            try {
                const request = indexedDB.open('QuestionaryUserLibraryFiles', 2);
                request.onupgradeneeded = e => {
                    const db = e.target.result;
                    if (!db.objectStoreNames.contains('files_store')) {
                        db.createObjectStore('files_store');
                    }
                };
                request.onsuccess = e => {
                    try {
                        const idb = e.target.result;
                        if (!idb.objectStoreNames.contains('files_store')) {
                            idb.close();
                            return resolve();
                        }
                        const tx = idb.transaction('files_store', 'readwrite');
                        tx.objectStore('files_store').put(cleanBytes, cleanId);
                        tx.oncomplete = () => resolve();
                        tx.onerror = () => resolve();
                    } catch (err) {
                        resolve();
                    }
                };
                request.onerror = () => resolve();
            } catch (err) {
                resolve();
            }
        });
    },

    async saveFile(blobId, fileOrBlob) {
        const uInt8Array = await fileToUint8Array(fileOrBlob);
        await this.saveBytes(blobId, uInt8Array);
    },

    async getFileBytes(blobId) {
        if (!blobId) return null;
        const cleanId = String(blobId).replace(/^blob-id:/, '');
        const fullKey = `blob-id:${cleanId}`;

        if (typeof window.getLoadedPdfBytes === 'function') {
            const memCached = window.getLoadedPdfBytes(fullKey);
            if (memCached && memCached.byteLength > 0) return memCached;
        }

        const storagePath = this._getStorageDir();

        if (window.electronAPI && typeof window.electronAPI.getUserLibraryFile === 'function') {
            try {
                const buffer = await window.electronAPI.getUserLibraryFile({ blobId: cleanId, storageDir: storagePath });
                const arr = this._normalizeToUint8Array(buffer);
                if (arr && arr.byteLength > 0) return arr;
            } catch(e) {}
        }

        return new Promise(resolve => {
            try {
                const request = indexedDB.open('QuestionaryUserLibraryFiles', 2);
                request.onupgradeneeded = e => {
                    const db = e.target.result;
                    if (!db.objectStoreNames.contains('files_store')) {
                        db.createObjectStore('files_store');
                    }
                };
                request.onsuccess = async e => {
                    try {
                        const idb = e.target.result;
                        if (!idb.objectStoreNames.contains('files_store')) {
                            return resolve(null);
                        }
                        const tx = idb.transaction('files_store', 'readonly');
                        const getReq = tx.objectStore('files_store').get(cleanId);
                        getReq.onsuccess = async () => {
                            const val = getReq.result;
                            if (!val) return resolve(null);
                            if (val instanceof Blob) {
                                const buf = await val.arrayBuffer();
                                return resolve(cloneIndependentUint8Array(buf));
                            }
                            resolve(this._normalizeToUint8Array(val));
                        };
                        getReq.onerror = () => resolve(null);
                    } catch (err) {
                        resolve(null);
                    }
                };
                request.onerror = () => resolve(null);
            } catch (err) {
                resolve(null);
            }
        });
    },

    async getFileBlob(blobId, fileName = '') {
        const bytes = await this.getFileBytes(blobId);
        if (!bytes || bytes.byteLength === 0) return null;
        const category = detectFileTypeCategory(bytes.slice(0, 64), '', fileName);
        const mimeType = getMimeTypeForCategory(category, fileName);
        return new Blob([bytes], { type: mimeType });
    },

    async removeFile(blobId) {
        const cleanId = String(blobId || '').replace(/^blob-id:/, '');
        const storagePath = this._getStorageDir();
        if (window.electronAPI && typeof window.electronAPI.deleteUserLibraryFile === 'function') {
            try {
                await window.electronAPI.deleteUserLibraryFile({ blobId: cleanId, storageDir: storagePath });
            } catch(e) {}
        }

        return new Promise(resolve => {
            try {
                const request = indexedDB.open('QuestionaryUserLibraryFiles', 2);
                request.onupgradeneeded = e => {
                    const db = e.target.result;
                    if (!db.objectStoreNames.contains('files_store')) {
                        db.createObjectStore('files_store');
                    }
                };
                request.onsuccess = e => {
                    try {
                        const idb = e.target.result;
                        if (!idb.objectStoreNames.contains('files_store')) return resolve();
                        const tx = idb.transaction('files_store', 'readwrite');
                        tx.objectStore('files_store').delete(cleanId);
                        tx.oncomplete = () => resolve();
                        tx.onerror = () => resolve();
                    } catch (err) {
                        resolve();
                    }
                };
                request.onerror = () => resolve();
            } catch (err) {
                resolve();
            }
        });
    }
};
window.UserLibraryFileStore = UserLibraryFileStore;

var UserLibraryDbService = window.UserLibraryDbService || {
    db: null,
    SQL: null,
    currentFolderId: null,
    pathStack: [],
    _initPromise: null,

    async init() {
        if (this.db) return true;
        if (this._initPromise) return this._initPromise;

        this._initPromise = (async () => {
            try {
                if (typeof window.getSharedSqlJsInstance === 'function') {
                    window.SQL_INSTANCE = await window.getSharedSqlJsInstance();
                } else if (!window.SQL_INSTANCE) {
                    if (typeof window.initSqlJs === 'undefined') {
                        await new Promise((resolve, reject) => {
                            const script = document.createElement('script');
                            script.src = 'js/sql-wasm.js';
                            script.onload = resolve;
                            script.onerror = reject;
                            document.head.appendChild(script);
                        });
                    }

                    window.SQL_INSTANCE = await window.initSqlJs({
                        locateFile: file => `js/${file}`
                    });
                }

                this.SQL = window.SQL_INSTANCE;

                let savedDb = await this.loadDbFromIndexedDB();
                if (savedDb) {
                    this.db = new this.SQL.Database(savedDb);
                    savedDb = null;
                } else {
                    this.db = new this.SQL.Database();
                }

                this.db.run(`
                    CREATE TABLE IF NOT EXISTS folders (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        parent_id INTEGER DEFAULT NULL,
                        name TEXT NOT NULL,
                        color TEXT DEFAULT '#3b82f6',
                        created_at INTEGER DEFAULT (strftime('%s', 'now'))
                    );

                    CREATE TABLE IF NOT EXISTS files (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        folder_id INTEGER DEFAULT NULL,
                        name TEXT NOT NULL,
                        file_type TEXT NOT NULL,
                        blob_id TEXT NOT NULL,
                        file_size INTEGER DEFAULT 0,
                        added_at INTEGER DEFAULT (strftime('%s', 'now'))
                    );
                `);

                // Clean up any duplicate rows created by previous multi-listener drops
                try {
                    const dupRows = await this.query(`
                        SELECT f1.id, f1.blob_id
                        FROM files f1
                        INNER JOIN files f2
                          ON IFNULL(f1.folder_id, -1) = IFNULL(f2.folder_id, -1)
                         AND f1.name = f2.name
                         AND f1.file_size = f2.file_size
                         AND f1.id > f2.id
                    `);
                    if (dupRows && dupRows.length > 0) {
                        for (const dup of dupRows) {
                            await UserLibraryFileStore.removeFile(dup.blob_id);
                            this.db.run("DELETE FROM files WHERE id = ?", [dup.id]);
                        }
                    }
                } catch (e) {}

                await this.saveDbToIndexedDB();
                return true;
            } catch (err) {
                console.error('[UserLibraryDB] Init error:', err);
                return false;
            } finally {
                this._initPromise = null;
            }
        })();

        return this._initPromise;
    },

    async query(sql, params = []) {
        if (!this.db) return [];
        const stmt = this.db.prepare(sql);
        stmt.bind(params);
        const results = [];
        while (stmt.step()) {
            results.push(stmt.getAsObject());
        }
        stmt.free();
        return results;
    },

    async execute(sql, params = []) {
        if (!this.db) return;
        this.db.run(sql, params);
        await this.saveDbToIndexedDB();
    },

    async saveDbToIndexedDB() {
        if (!this.db) return;
        let data = this.db.export();
        return new Promise((resolve, reject) => {
            const request = indexedDB.open('QuestionaryUserLibraryDB', 1);
            request.onupgradeneeded = e => e.target.result.createObjectStore('db_store');
            request.onsuccess = e => {
                const idb = e.target.result;
                const tx = idb.transaction('db_store', 'readwrite');
                const putReq = tx.objectStore('db_store').put(data, 'userlibrary.db');
                putReq.onsuccess = () => {
                    data = null;
                    resolve();
                };
                putReq.onerror = () => {
                    data = null;
                    reject(putReq.error);
                };
            };
            request.onerror = () => {
                data = null;
                reject(request.error);
            };
        });
    },

    async loadDbFromIndexedDB() {
        return new Promise(resolve => {
            const request = indexedDB.open('QuestionaryUserLibraryDB', 1);
            request.onupgradeneeded = e => e.target.result.createObjectStore('db_store');
            request.onsuccess = e => {
                const idb = e.target.result;
                const tx = idb.transaction('db_store', 'readonly');
                const getReq = tx.objectStore('db_store').get('userlibrary.db');
                getReq.onsuccess = () => resolve(getReq.result);
                getReq.onerror = () => resolve(null);
            };
            request.onerror = () => resolve(null);
        });
    },

    async getFolders(parentId = null) {
        const validParentId = (parentId !== null && parentId !== undefined && parentId !== 'null') ? Number(parentId) : null;
        const sql = validParentId === null
            ? "SELECT * FROM folders WHERE parent_id IS NULL ORDER BY name ASC"
            : "SELECT * FROM folders WHERE parent_id = ? ORDER BY name ASC";
        return await this.query(sql, validParentId === null ? [] : [validParentId]);
    },

    async createFolder(name, color = '#3b82f6', parentId = null) {
        const validParentId = (parentId !== null && parentId !== undefined && parentId !== 'null') ? Number(parentId) : null;
        await this.execute("INSERT INTO folders (name, color, parent_id) VALUES (?, ?, ?)", [name, color, validParentId]);
    },

    async deleteFolder(folderId) {
        const files = await this.query("SELECT * FROM files WHERE folder_id = ?", [folderId]);
        for (const f of files) await this.deleteFile(f.id);
        const subfolders = await this.query("SELECT * FROM folders WHERE parent_id = ?", [folderId]);
        for (const sub of subfolders) await this.deleteFolder(sub.id);
        await this.execute("DELETE FROM folders WHERE id = ?", [folderId]);
    },

    async renameFolder(folderId, newName) {
        await this.execute("UPDATE folders SET name = ? WHERE id = ?", [newName, folderId]);
    },

    async getFiles(folderId = null) {
        const validFolderId = (folderId !== null && folderId !== undefined && folderId !== 'null') ? Number(folderId) : null;
        const sql = validFolderId === null
            ? "SELECT * FROM files WHERE folder_id IS NULL ORDER BY name ASC"
            : "SELECT * FROM files WHERE folder_id = ? ORDER BY name ASC";
        return await this.query(sql, validFolderId === null ? [] : [validFolderId]);
    },

    _recentImports: new Map(),
    _inFlightImports: new Set(),

    async importFile(file, folderId = null) {
        if (!file) return false;
        if (!this.db) {
            await this.init();
        }
        const validFolderId = (folderId !== null && folderId !== undefined && folderId !== 'null') ? Number(folderId) : null;
        const name = file.name || 'Imported_File';
        const rawSize = typeof file.size === 'number' ? file.size : 0;
        const sig = `${validFolderId ?? 'root'}::${name}::${rawSize}`;
        const now = Date.now();

        if (!this._recentImports) this._recentImports = new Map();
        if (!this._inFlightImports) this._inFlightImports = new Set();

        if (this._inFlightImports.has(sig)) {
            return false;
        }
        const prevTs = this._recentImports.get(sig);
        if (prevTs && (now - prevTs) < 3000) {
            return false;
        }

        this._inFlightImports.add(sig);
        this._recentImports.set(sig, now);
        setTimeout(() => {
            if (this._recentImports && this._recentImports.get(sig) === now) {
                this._recentImports.delete(sig);
            }
        }, 3500);

        try {
            // If a duplicate import happened within the last 10 seconds, ignore it
            const existingRecent = await this.query(
                `SELECT id FROM files
                 WHERE IFNULL(folder_id, -1) = IFNULL(?, -1)
                   AND name = ?
                   AND file_size = ?
                   AND ABS(strftime('%s', 'now') - IFNULL(added_at, 0)) <= 10
                 LIMIT 1`,
                [validFolderId, name, rawSize]
            );
            if (existingRecent && existingRecent.length > 0) {
                return false;
            }

            const blobId = `doc_${now}_${Math.random().toString(36).substr(2, 6)}`;

            let uInt8Array = await fileToUint8Array(file);
            const fileType = detectFileTypeCategory(uInt8Array, file.type, name);
            await UserLibraryFileStore.saveBytes(blobId, uInt8Array);

            if (fileType === 'pdf' && typeof window.setLoadedPdfBytes === 'function') {
                window.setLoadedPdfBytes(`blob-id:${blobId}`, uInt8Array);
            }

            const fileSize = uInt8Array.byteLength || 0;
            uInt8Array = null;

            // If an older entry with the exact same name & size already exists in this folder, refresh its blob_id in place
            const existingSameFile = await this.query(
                `SELECT id, blob_id FROM files
                 WHERE IFNULL(folder_id, -1) = IFNULL(?, -1)
                   AND name = ?
                   AND file_size = ?
                 LIMIT 1`,
                [validFolderId, name, fileSize]
            );
            if (existingSameFile && existingSameFile.length > 0) {
                const oldRow = existingSameFile[0];
                if (oldRow.blob_id && oldRow.blob_id !== blobId) {
                    await UserLibraryFileStore.removeFile(oldRow.blob_id);
                }
                await this.execute(
                    "UPDATE files SET file_type = ?, blob_id = ?, file_size = ?, added_at = strftime('%s', 'now') WHERE id = ?",
                    [fileType, blobId, fileSize, oldRow.id]
                );
                return true;
            }

            await this.execute(
                "INSERT INTO files (folder_id, name, file_type, blob_id, file_size) VALUES (?, ?, ?, ?, ?)",
                [validFolderId, name, fileType, blobId, fileSize]
            );
            return true;
        } finally {
            this._inFlightImports.delete(sig);
        }
    },

    async deleteFile(fileId) {
        const res = await this.query("SELECT * FROM files WHERE id = ?", [fileId]);
        if (res.length > 0) {
            await UserLibraryFileStore.removeFile(res[0].blob_id);
            await this.execute("DELETE FROM files WHERE id = ?", [fileId]);
        }
    },

    async renameFile(fileId, newName) {
        await this.execute("UPDATE files SET name = ? WHERE id = ?", [newName, fileId]);
    },

    async moveItem(itemId, itemType, targetFolderId) {
        const validTargetId = (targetFolderId !== null && targetFolderId !== undefined && targetFolderId !== 'null') ? Number(targetFolderId) : null;
        if (itemType === 'folder') {
            if (itemId === validTargetId) return;
            await this.execute("UPDATE folders SET parent_id = ? WHERE id = ?", [validTargetId, itemId]);
        } else {
            await this.execute("UPDATE files SET folder_id = ? WHERE id = ?", [validTargetId, itemId]);
        }
    }
};
window.UserLibraryDbService = UserLibraryDbService;

var libraryEditMode = false;
var moveItemState = { itemId: null, itemType: null };
var selectedFolderColor = '#3b82f6';
var selectedMoveDestinationId = null;

function toggleLibraryEditMode() {
    libraryEditMode = !libraryEditMode;
    const btn = document.getElementById('libraryEditBtn');
    const controls = document.getElementById('libraryEditControls');
    if (btn) btn.innerHTML = sanitizeUiHtml(libraryEditMode ? '<i class="fas fa-check"></i> Done' : '<i class="fas fa-edit"></i> Edit');
    if (controls) controls.style.display = libraryEditMode ? 'block' : 'none';
    renderLibrary();
}

async function renderLibrary() {
    const container = document.getElementById('libraryContents');
    if (!container) return;

    if (!UserLibraryDbService.db) {
        await UserLibraryDbService.init();
    }

    const currentFolderId = UserLibraryDbService.currentFolderId;
    const folders = await UserLibraryDbService.getFolders(currentFolderId);
    const files = await UserLibraryDbService.getFiles(currentFolderId);

    renderLibraryBreadcrumb();

    container.textContent = '';
    const isEmpty = folders.length === 0 && files.length === 0;
    const emptyState = document.getElementById('libraryEmptyState');
    if (emptyState) emptyState.style.display = isEmpty ? 'flex' : 'none';

    folders.forEach(folder => {
        const item = document.createElement('div');
        item.className = 'library-item library-folder';
        const safeFolderColor = isSafeHexColor(folder.color, '#3b82f6');
        item.style.borderColor = safeFolderColor;

        item.innerHTML = sanitizeUiHtml(`
            <div class="library-item-icon" style="color: ${safeFolderColor}">
                <i class="fas fa-folder"></i>
            </div>
            <div class="library-item-name">${escapeHtml(folder.name)}</div>
            ${libraryEditMode ? `
                <div class="library-item-actions">
                    <button class="lib-action-btn lib-rename-folder" type="button"><i class="fas fa-edit"></i></button>
                    <button class="lib-action-btn lib-move-folder" type="button"><i class="fas fa-arrows-alt"></i></button>
                    <button class="lib-action-btn danger lib-delete-folder" type="button"><i class="fas fa-trash"></i></button>
                </div>
            ` : ''}
        `);

        item.querySelector('.lib-rename-folder')?.addEventListener('click', (e) => {
            e.stopPropagation();
            renameLibraryFolder(folder.id, folder.name);
        });
        item.querySelector('.lib-move-folder')?.addEventListener('click', (e) => {
            e.stopPropagation();
            openMoveLibraryItemModal(folder.id, 'folder');
        });
        item.querySelector('.lib-delete-folder')?.addEventListener('click', (e) => {
            e.stopPropagation();
            deleteLibraryFolder(folder.id, folder.name);
        });

        item.onclick = () => {
            UserLibraryDbService.currentFolderId = folder.id;
            UserLibraryDbService.pathStack.push({ id: folder.id, name: folder.name });
            renderLibrary();
        };

        container.appendChild(item);
    });

    files.forEach(file => {
        const item = document.createElement('div');
        item.className = 'library-item library-pdf';

        const category = file.file_type && file.file_type !== 'other' ? file.file_type : getFileTypeCategory(file.name);
        let icon = 'fa-file-alt';
        let iconColor = '#cf6215';

        if (category === 'image') { icon = 'fa-file-image'; iconColor = '#22c55e'; }
        else if (category === 'pdf') { icon = 'fa-file-pdf'; iconColor = '#ef4444'; }
        else if (category === 'text') { icon = 'fa-file-code'; iconColor = '#0891b2'; }
        else if (category === 'docx') { icon = 'fa-file-word'; iconColor = '#2563eb'; }

        item.innerHTML = sanitizeUiHtml(`
            <div class="library-item-icon" style="color: ${iconColor}">
                <i class="fas ${icon}"></i>
            </div>
            <div class="library-item-name">${escapeHtml(file.name)}</div>
            <div class="library-item-meta">${escapeHtml(formatBytesContent(file.file_size || 0))}</div>
            ${libraryEditMode ? `
                <div class="library-item-actions">
                    <button class="lib-action-btn lib-rename-file" type="button"><i class="fas fa-edit"></i></button>
                    <button class="lib-action-btn lib-move-file" type="button"><i class="fas fa-arrows-alt"></i></button>
                    <button class="lib-action-btn danger lib-delete-file" type="button"><i class="fas fa-trash"></i></button>
                </div>
            ` : ''}
        `);

        item.querySelector('.lib-rename-file')?.addEventListener('click', (e) => {
            e.stopPropagation();
            renameLibraryFile(file.id, file.name);
        });
        item.querySelector('.lib-move-file')?.addEventListener('click', (e) => {
            e.stopPropagation();
            openMoveLibraryItemModal(file.id, 'file');
        });
        item.querySelector('.lib-delete-file')?.addEventListener('click', (e) => {
            e.stopPropagation();
            deleteLibraryFile(file.id, file.name);
        });

        item.onclick = async () => {
            await openAnyDocument(`blob-id:${file.blob_id}`, file.name);
        };

        container.appendChild(item);
    });
}

function renderLibraryBreadcrumb() {
    const breadcrumb = document.getElementById('libraryBreadcrumb');
    if (!breadcrumb) return;

    if (UserLibraryDbService.pathStack.length === 0) {
        breadcrumb.style.display = 'none';
        return;
    }

    breadcrumb.style.display = 'flex';
    breadcrumb.textContent = '';

    const rootBtn = document.createElement('button');
    rootBtn.className = 'breadcrumb-item';
    rootBtn.innerHTML = sanitizeUiHtml('<i class="fas fa-home"></i> Library');
    rootBtn.onclick = () => {
        UserLibraryDbService.currentFolderId = null;
        UserLibraryDbService.pathStack = [];
        renderLibrary();
    };
    breadcrumb.appendChild(rootBtn);

    UserLibraryDbService.pathStack.forEach((crumb, index) => {
        const sep = document.createElement('span');
        sep.className = 'breadcrumb-separator';
        sep.innerHTML = sanitizeUiHtml('<i class="fas fa-chevron-right"></i>');
        breadcrumb.appendChild(sep);

        const crumbBtn = document.createElement('button');
        crumbBtn.className = `breadcrumb-item ${index === UserLibraryDbService.pathStack.length - 1 ? 'active' : ''}`;
        crumbBtn.textContent = crumb.name;
        crumbBtn.onclick = () => {
            UserLibraryDbService.pathStack = UserLibraryDbService.pathStack.slice(0, index + 1);
            const current = UserLibraryDbService.pathStack[UserLibraryDbService.pathStack.length - 1];
            UserLibraryDbService.currentFolderId = current ? current.id : null;
            renderLibrary();
        };
        breadcrumb.appendChild(crumbBtn);
    });
}

function openCreateLibraryFolderModal() {
    const modal = document.getElementById('libraryFolderModal');
    const input = document.getElementById('libraryFolderName');
    if (input) input.value = '';
    if (modal) modal.classList.add('active');
}

function closeLibraryFolderModal() {
    document.getElementById('libraryFolderModal')?.classList.remove('active');
}

function selectLibraryFolderColor(color) {
    selectedFolderColor = color;
    document.querySelectorAll('.color-option').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.color === color);
    });
}

async function saveLibraryFolder() {
    const input = document.getElementById('libraryFolderName');
    const name = input?.value.trim();
    if (!name) {
        showNotification('Please enter a folder name', 'error');
        return;
    }

    await UserLibraryDbService.createFolder(name, selectedFolderColor, UserLibraryDbService.currentFolderId);
    closeLibraryFolderModal();
    await renderLibrary();
    showNotification(`Folder "${name}" created!`, 'success');
}

async function renameLibraryFolder(folderId, oldName) {
    const newName = await showPrompt('Enter new folder name:', { defaultValue: oldName, title: 'Rename Folder' });
    if (newName && newName !== oldName) {
        await UserLibraryDbService.renameFolder(folderId, newName);
        await renderLibrary();
        showNotification('Folder renamed', 'success');
    }
}

async function renameLibraryFile(fileId, oldName) {
    const newName = await showPrompt('Enter new file name:', { defaultValue: oldName, title: 'Rename File' });
    if (newName && newName !== oldName) {
        await UserLibraryDbService.renameFile(fileId, newName);
        await renderLibrary();
        showNotification('File renamed', 'success');
    }
}

async function deleteLibraryFolder(folderId, name) {
    const ok = await showConfirm(`Delete folder "${name}" and all contents?`, { title: 'Delete Folder', type: 'danger' });
    if (ok) {
        await UserLibraryDbService.deleteFolder(folderId);
        await renderLibrary();
        showNotification('Folder deleted', 'info');
    }
}

async function deleteLibraryFile(fileId, name) {
    const ok = await showConfirm(`Delete "${name}" from Library?`, { title: 'Delete File', type: 'danger' });
    if (ok) {
        await UserLibraryDbService.deleteFile(fileId);
        await renderLibrary();
        showNotification('File deleted', 'info');
    }
}

async function openMoveLibraryItemModal(itemId, itemType) {
    moveItemState = { itemId, itemType };
    const modal = document.getElementById('moveItemModal');
    const container = document.getElementById('moveDestinationList');
    if (!modal || !container) return;

    const allFolders = await UserLibraryDbService.query("SELECT * FROM folders ORDER BY name ASC");

    container.innerHTML = sanitizeUiHtml(`
        <div class="move-destination ${UserLibraryDbService.currentFolderId === null ? 'selected' : ''}" data-dest-id="root">
            <i class="fas fa-home"></i> Root Library
        </div>
        ${allFolders.map(f => `
            <div class="move-destination ${UserLibraryDbService.currentFolderId === f.id ? 'selected' : ''}" data-dest-id="${escapeHtml(f.id)}">
                <i class="fas fa-folder" style="color: ${isSafeHexColor(f.color, '#3b82f6')}"></i> ${escapeHtml(f.name)}
            </div>
        `).join('')}
    `);

    container.querySelectorAll('.move-destination').forEach(el => {
        el.addEventListener('click', () => {
            const raw = el.dataset.destId;
            selectMoveDestination(raw === 'root' ? null : Number(raw), el);
        });
    });

    modal.classList.add('active');
}

function selectMoveDestination(folderId, element) {
    selectedMoveDestinationId = folderId;
    document.querySelectorAll('.move-destination').forEach(el => el.classList.remove('selected'));
    if (element) element.classList.add('selected');
}

function closeMoveItemModal() {
    document.getElementById('moveItemModal')?.classList.remove('active');
}

async function confirmMoveItem() {
    if (moveItemState.itemId !== null) {
        await UserLibraryDbService.moveItem(moveItemState.itemId, moveItemState.itemType, selectedMoveDestinationId);
        closeMoveItemModal();
        await renderLibrary();
        showNotification('Item moved successfully', 'success');
    }
}

var _isFilePickerOpen = false;

async function openPdfFilePicker() {
    if (_isFilePickerOpen) return;
    _isFilePickerOpen = true;
    try {
        if (window.electronAPI && typeof window.electronAPI.selectFilesToImport === 'function') {
            const selected = await window.electronAPI.selectFilesToImport();
            if (selected && selected.length > 0) {
                let addedCount = 0;
                for (const fileItem of selected) {
                    const cleanBytes = cloneIndependentUint8Array(fileItem.buffer);
                    if (!cleanBytes || cleanBytes.byteLength === 0) continue;
                    const category = detectFileTypeCategory(cleanBytes.slice(0, 64), '', fileItem.name);
                    const mime = getMimeTypeForCategory(category, fileItem.name);
                    const fileObj = new File([cleanBytes], fileItem.name, { type: mime });
                    const added = await UserLibraryDbService.importFile(fileObj, UserLibraryDbService.currentFolderId);
                    if (added === true) addedCount++;
                }
                await renderLibrary();
                if (addedCount > 0) {
                    showNotification(`Imported ${addedCount} document(s) successfully!`, 'success');
                }
            }
            return;
        }

        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.pdf,.png,.jpg,.jpeg,.webp,.gif,.svg,.txt,.md,.markdown,.json,.csv,.docx';
        input.multiple = true;
        input.onchange = async (e) => {
            const rawFiles = e.target.files ? Array.from(e.target.files) : [];
            if (rawFiles.length > 0) {
                let addedCount = 0;
                for (const file of rawFiles) {
                    const added = await UserLibraryDbService.importFile(file, UserLibraryDbService.currentFolderId);
                    if (added === true) addedCount++;
                }
                await renderLibrary();
                if (addedCount > 0) {
                    showNotification(`Imported ${addedCount} document(s)!`, 'success');
                }
            }
        };
        input.click();
    } finally {
        setTimeout(() => {
            _isFilePickerOpen = false;
        }, 400);
    }
}

async function importPdfToLibrary(file) {
    if (!file) return;
    await processAndImportFiles([file]);
}

function handleLibraryDragOver(e) {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer) {
        e.dataTransfer.dropEffect = 'copy';
    }
    document.getElementById('libraryDropZone')?.classList.add('drag-over');
}

function handleLibraryDragLeave(e) {
    e.preventDefault();
    e.stopPropagation();
    const dropZone = document.getElementById('libraryDropZone');
    if (dropZone && (!e.relatedTarget || !dropZone.contains(e.relatedTarget))) {
        dropZone.classList.remove('drag-over');
    }
}

var _isProcessingLibraryDrop = false;
var _lastLibraryDropSignature = '';
var _lastLibraryDropTimestamp = 0;

async function handleLibraryDrop(e) {
    if (!e) return;
    e.preventDefault();
    e.stopPropagation();
    if (typeof e.stopImmediatePropagation === 'function') {
        e.stopImmediatePropagation();
    }

    clearDragHoverStyles();
    document.getElementById('libraryDropZone')?.classList.remove('drag-over');
    document.getElementById('dropZone')?.classList.remove('drag-over');
    document.getElementById('importedSection')?.classList.remove('drag-over');

    if (e._questionaryDropHandled || _isProcessingLibraryDrop) return;
    e._questionaryDropHandled = true;

    const rawFiles = e.dataTransfer && e.dataTransfer.files ? Array.from(e.dataTransfer.files) : [];
    if (rawFiles.length === 0) return;

    // Deduplicate within the same FileList by name + size + lastModified
    const seenInBatch = new Set();
    const droppedFiles = rawFiles.filter(file => {
        const key = `${file.name}::${file.size}::${file.lastModified || 0}`;
        if (seenInBatch.has(key)) return false;
        seenInBatch.add(key);
        return true;
    });

    if (droppedFiles.length === 0) return;

    // Debounce identical drop batches within a 2.5s window
    const batchSignature = `${UserLibraryDbService.currentFolderId ?? 'root'}||` +
        droppedFiles.map(f => `${f.name}:${f.size}:${f.lastModified || 0}`).join('|');
    const now = Date.now();
    if (batchSignature === _lastLibraryDropSignature && (now - _lastLibraryDropTimestamp) < 2500) {
        return;
    }
    _lastLibraryDropSignature = batchSignature;
    _lastLibraryDropTimestamp = now;
    _isProcessingLibraryDrop = true;

    try {
        if (!UserLibraryDbService.db) {
            await UserLibraryDbService.init();
        }
        let addedCount = 0;
        for (const file of droppedFiles) {
            const added = await UserLibraryDbService.importFile(file, UserLibraryDbService.currentFolderId);
            if (added === true) addedCount++;
        }
        await renderLibrary();
        if (addedCount > 0) {
            showNotification(`Imported ${addedCount} file(s)!`, 'success');
        }
    } finally {
        setTimeout(() => {
            _isProcessingLibraryDrop = false;
        }, 400);
    }
}

function initLibraryDragDrop() {
    const dropZone = document.getElementById('libraryDropZone');
    const settingsDropZone = document.getElementById('dropZone');
    const importedSection = document.getElementById('importedSection');

    [dropZone, settingsDropZone, importedSection].forEach(el => {
        if (!el) return;

        el.removeAttribute('ondrop');
        el.removeAttribute('ondragover');
        el.removeAttribute('ondragleave');

        // Single-slot DOM property assignment prevents listener stacking across re-renders
        el.ondragenter = (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (el.id !== 'importedSection') {
                el.classList.add('drag-over');
            } else {
                document.getElementById('libraryDropZone')?.classList.add('drag-over');
            }
        };

        el.ondragover = (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (e.dataTransfer) {
                e.dataTransfer.dropEffect = 'copy';
            }
            if (el.id !== 'importedSection') {
                el.classList.add('drag-over');
            } else {
                document.getElementById('libraryDropZone')?.classList.add('drag-over');
            }
        };

        el.ondragleave = (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (!e.relatedTarget || !el.contains(e.relatedTarget)) {
                el.classList.remove('drag-over');
                if (el.id === 'importedSection') {
                    document.getElementById('libraryDropZone')?.classList.remove('drag-over');
                }
            }
        };

        el.ondrop = handleLibraryDrop;
    });
}

/* 13. Tag Interactions & Direct Opening */
var currentTaggingItem = window.currentTaggingItem || null;

function openTagItemModal(itemId, itemName, itemType) {
    currentTaggingItem = { id: itemId, name: itemName, type: itemType };

    const modal = document.getElementById('tagItemModal');
    const nameEl = document.getElementById('tagItemName');

    if (nameEl) nameEl.textContent = `Tagging: ${itemName}`;

    renderAvailableTags();
    renderCurrentItemTags();

    if (modal) modal.classList.add('active');
}

function closeTagItemModal() {
    const modal = document.getElementById('tagItemModal');
    if (modal) modal.classList.remove('active');
    currentTaggingItem = null;
}

function renderAvailableTags() {
    const container = document.getElementById('availableTagsList');
    if (!container) return;

    if (tags.length === 0) {
        container.innerHTML = sanitizeUiHtml('<p class="empty-state">No tags available. Create some tags first!</p>');
        return;
    }

    const itemId = currentTaggingItem?.id;
    const currentTags = itemId ? (itemTags[itemId] || []) : [];

    container.innerHTML = sanitizeUiHtml(tags.map(tag => {
        const isApplied = currentTags.includes(tag.id);
        const safeColor = isSafeHexColor(tag.color, '#3b82f6');
        return `
            <button type="button" class="tag-chip ${isApplied ? 'applied' : ''}"
                    style="--tag-color: ${safeColor}"
                    data-tag-id="${escapeHtml(tag.id)}">
                <span class="tag-dot" style="background: ${safeColor}"></span>
                ${escapeHtml(tag.name)}
                ${isApplied ? '<i class="fas fa-check"></i>' : '<i class="fas fa-plus"></i>'}
            </button>
        `;
    }).join(''));

    container.querySelectorAll('.tag-chip').forEach(btn => {
        btn.addEventListener('click', () => toggleTagOnItem(btn.dataset.tagId));
    });
}

function renderCurrentItemTags() {
    const container = document.getElementById('currentItemTags');
    if (!container || !currentTaggingItem) return;

    const currentTags = itemTags[currentTaggingItem.id] || [];

    if (currentTags.length === 0) {
        container.innerHTML = sanitizeUiHtml('<p class="empty-state">No tags applied</p>');
        return;
    }

    container.innerHTML = sanitizeUiHtml(currentTags.map(tagId => {
        const tag = tags.find(t => t.id === tagId);
        if (!tag) return '';
        const safeColor = isSafeHexColor(tag.color, '#3b82f6');
        return `
            <span class="tag-badge" style="background: ${safeColor}20; border-color: ${safeColor}">
                <span class="tag-dot" style="background: ${safeColor}"></span>
                ${escapeHtml(tag.name)}
                <button type="button" data-tag-id="${escapeHtml(tag.id)}" class="tag-remove"><i class="fas fa-times"></i></button>
            </span>
        `;
    }).join(''));

    container.querySelectorAll('.tag-remove').forEach(btn => {
        btn.addEventListener('click', () => toggleTagOnItem(btn.dataset.tagId));
    });
}

function toggleTagOnItem(tagId) {
    if (!currentTaggingItem) return;

    const itemId = currentTaggingItem.id;
    if (!itemTags[itemId]) itemTags[itemId] = [];

    const idx = itemTags[itemId].indexOf(tagId);
    if (idx === -1) {
        itemTags[itemId].push(tagId);
    } else {
        itemTags[itemId].splice(idx, 1);
    }

    saveTags();
    renderAvailableTags();
    renderCurrentItemTags();
    renderTagsMain();
}

function renderTagsMain() {
    const container = document.getElementById('tagsListMain');
    if (!container) return;

    if (tags.length === 0) {
        container.innerHTML = sanitizeUiHtml('<p class="empty-state"><i class="fas fa-tags"></i> No tags created yet. Create your first tag!</p>');
        return;
    }

    container.innerHTML = sanitizeUiHtml(tags.map(tag => {
        const safeColor = isSafeHexColor(tag.color, '#3b82f6');
        return `
        <div class="tag-card" style="--tag-color: ${safeColor}" data-tag-id="${escapeHtml(tag.id)}">
            <div class="tag-card-header">
                <span class="tag-dot-lg" style="background: ${safeColor}"></span>
                <span class="tag-card-name">${escapeHtml(tag.name)}</span>
                <span class="tag-card-count">${countItemsWithTag(tag.id)} items</span>
            </div>
            <div class="tag-card-actions">
                <button type="button" class="btn btn-sm btn-secondary tag-filter-btn">
                    <i class="fas fa-filter"></i> View Items
                </button>
                <button type="button" class="btn btn-sm btn-danger tag-delete-btn">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        </div>`;
    }).join(''));

    container.querySelectorAll('.tag-card').forEach(card => {
        const tid = card.dataset.tagId;
        card.querySelector('.tag-filter-btn')?.addEventListener('click', () => filterByTag(tid));
        card.querySelector('.tag-delete-btn')?.addEventListener('click', () => deleteTag(tid));
    });
}

function renderTaggedItems(tagId = null) {
    const container = document.getElementById('taggedItemsList');
    if (!container) return;

    const items = [];

    Object.entries(itemTags).forEach(([itemId, tagIds]) => {
        if (tagIds.length === 0) return;
        if (!tagId || tagIds.includes(tagId)) {
            items.push({ id: itemId, tags: tagIds });
        }
    });

    if (items.length === 0) {
        container.innerHTML = sanitizeUiHtml('<p class="empty-state"><i class="fas fa-folder-open"></i> No tagged items yet.</p>');
        return;
    }

    container.innerHTML = sanitizeUiHtml(items.map(item => {
        const itemTagBadges = item.tags.map(tid => {
            const tag = tags.find(t => t.id === tid);
            const safeColor = isSafeHexColor(tag?.color, '#3b82f6');
            return tag ? `<span class="tag-mini" style="background: ${safeColor}">${escapeHtml(tag.name)}</span>` : '';
        }).join('');

        const isFolder = item.id.startsWith('folder_');
        const isDoc = item.id.startsWith('doc_');
        let displayName = item.id;
        let icon = 'fa-file';
        if (isFolder) {
            displayName = item.id.replace('folder_', '').split('/').pop();
            icon = 'fa-folder';
        } else if (isDoc) {
            displayName = item.id.replace('doc_', '').split('/').pop();
            icon = 'fa-file-pdf';
        }

        return `
            <div class="tagged-item" data-item-id="${escapeHtml(item.id)}">
                <span class="tagged-item-id"><i class="fas ${icon}" style="margin-right: 6px; opacity: 0.5;"></i>${escapeHtml(displayName)}</span>
                <div class="tagged-item-tags">${itemTagBadges}</div>
            </div>
        `;
    }).join(''));

    container.querySelectorAll('.tagged-item').forEach(el => {
        el.addEventListener('click', () => navigateToTaggedItem(el.dataset.itemId));
    });
}

function filterByTag(tagId) {
    renderTaggedItems(tagId);
    const section = document.querySelector('.tagged-items-section');
    if (section) {
        section.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    const tag = tags.find(t => t.id === tagId);
    const tagName = tag ? tag.name : 'selected tag';
    showNotification(`Showing items tagged "${tagName}"`, 'info');
}

/* 14. Voice Notes Grid for Notes View */
function renderVoiceNotesGrid() {
    const container = document.getElementById('voiceNotesGrid');
    if (!container) return;

    if (voiceNotes.length === 0) {
        container.innerHTML = sanitizeUiHtml('<p class="empty-state"><i class="fas fa-microphone-slash"></i> No voice notes yet. Record your first one!</p>');
        return;
    }

    container.innerHTML = sanitizeUiHtml(voiceNotes.map(note => `
        <div class="voice-note-card" data-id="${escapeHtml(note.id)}">
            <div class="voice-note-header">
                <span class="voice-note-date">${escapeHtml(new Date(note.createdAt).toLocaleString())}</span>
                <span class="voice-note-duration">${escapeHtml(note.duration || '0:00')}</span>
            </div>
            <div class="voice-note-actions">
                <button class="btn btn-primary btn-sm play-voice-note" type="button" data-id="${escapeHtml(note.id)}">
                    <i class="fas fa-play"></i> Play
                </button>
                <button class="btn btn-secondary btn-sm tag-voice-note" type="button" data-id="${escapeHtml(note.id)}">
                    <i class="fas fa-tag"></i>
                </button>
                <button class="btn btn-danger btn-sm delete-voice-note" type="button" data-id="${escapeHtml(note.id)}">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        </div>
    `).join(''));

    container.querySelectorAll('.tag-voice-note').forEach(btn => {
        btn.addEventListener('click', () => {
            const note = voiceNotes.find(v => String(v.id) === String(btn.dataset.id));
            if (note) openTagItemModal(`voicenote_${note.id}`, note.title || 'Voice Note', 'voicenote');
        });
    });
}

/* 15. Settings Renderer */
function renderSettings() {
    initThemeOnLoad();
    renderTagsList();
    renderVoiceNotes();
    renderDashboardWidgets();
    if (window.DownloadManager && typeof window.DownloadManager.renderSettingsStorageTab === 'function') {
        window.DownloadManager.renderSettingsStorageTab();
    }
    if (typeof window.renderKeybindsSettings === 'function') window.renderKeybindsSettings();
    if (typeof window.initStudyRoomMediaSettings === 'function') window.initStudyRoomMediaSettings();
}

function initSettingsUI() {
    if (window._questionarySettingsUiInitialized) return;
    window._questionarySettingsUiInitialized = true;

    const exportBtn = document.getElementById('exportAllDataBtn');
    if (exportBtn) {
        exportBtn.addEventListener('click', exportAllData);
    }

    const importInput = document.getElementById('importDataInput');
    if (importInput) {
        importInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                if (file.size > 15 * 1024 * 1024) {
                    showNotification('Backup file exceeds 15MB limit', 'error');
                    return;
                }
                const reader = new FileReader();
                reader.onload = (evt) => {
                    try {
                        const data = JSON.parse(evt.target.result);
                        importData(data);
                    } catch (err) {
                        showNotification('Invalid backup file', 'error');
                    }
                };
                reader.readAsText(file);
            }
        });
    }

    document.addEventListener('click', (e) => {
        const themeOption = e.target.closest('.theme-option');
        if (themeOption && themeOption.dataset.theme) {
            e.preventDefault();
            setTheme(themeOption.dataset.theme);
            return;
        }

        if (e.target.closest('#recordBtn')) {
            e.preventDefault();
            toggleRecording();
            return;
        }

        if (e.target.closest('#createTagBtn')) {
            e.preventDefault();
            openTagModal();
            return;
        }

        if (e.target.closest('#saveTagBtn')) {
            e.preventDefault();
            saveTag();
            return;
        }

        if (e.target.closest('#cancelTagBtn') || e.target.closest('#closeTagModal')) {
            closeTagModal();
            return;
        }

        if (e.target.closest('#addReminderBtn')) {
            e.preventDefault();
            openReminderModal();
            return;
        }

        if (e.target.closest('#saveReminderBtn')) {
            e.preventDefault();
            saveReminderFromModal();
            return;
        }

        if (e.target.closest('#cancelReminderBtn') || e.target.closest('#closeReminderModal')) {
            closeReminderModal();
            return;
        }

        if (e.target.closest('#closeQuizModal')) {
            closeQuizModal();
            return;
        }

        if (e.target.closest('.play-voice-note')) {
            const btn = e.target.closest('.play-voice-note');
            const id = btn.dataset.id;
            if (id) playVoiceNote(id);
            return;
        }

        if (e.target.closest('.delete-voice-note')) {
            const btn = e.target.closest('.delete-voice-note');
            const id = btn.dataset.id;
            if (id) deleteVoiceNote(id);
            return;
        }

        if (e.target.closest('#addBookmarkBtn')) {
            e.preventDefault();
            openBookmarkModal();
            return;
        }

        if (e.target.closest('#toggleBookmarksBtn')) {
            e.preventDefault();
            toggleBookmarksPanel();
            return;
        }

        if (e.target.closest('#backToDocumentsBtn')) {
            e.preventDefault();
            closePdfViewer();
            return;
        }

        if (e.target.closest('#saveBookmarkBtn')) {
            e.preventDefault();
            saveBookmarkFromModal();
            return;
        }

        if (e.target.closest('#cancelBookmarkBtn') || e.target.closest('#closeBookmarkModal')) {
            closeBookmarkModal();
            return;
        }

        if (e.target.closest('#closeTagItemModal') || e.target.closest('#closeTagItemModalBtn')) {
            closeTagItemModal();
            return;
        }

        if (e.target.closest('#createTagBtnMain')) {
            e.preventDefault();
            openTagModal();
            return;
        }

        if (e.target.closest('#importPdfBtn')) {
            e.preventDefault();
            openPdfFilePicker();
            return;
        }

        if (e.target.closest('.alarm-option')) {
            const option = e.target.closest('.alarm-option');
            const sound = option.dataset.sound;
            if (sound) setAlarmSound(sound);
            return;
        }

        if (e.target.closest('.preview-sound')) {
            e.stopPropagation();
            const btn = e.target.closest('.preview-sound');
            const sound = btn.dataset.sound;
            if (sound) previewAlarmSound(sound);
            return;
        }

        if (e.target.closest('#recordBtnNotes')) {
            e.preventDefault();
            toggleRecordingNotes();
            return;
        }
    });

    const customAlarmInput = document.getElementById('customAlarmInput');
    if (customAlarmInput) {
        customAlarmInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) handleCustomSoundUpload(file);
        });
    }

    const volumeSlider = document.getElementById('alarmVolume');
    if (volumeSlider) {
        volumeSlider.addEventListener('input', (e) => {
            setAlarmVolume(e.target.value);
        });
    }
}

function openTagModal() {
    const modal = document.getElementById('tagModal');
    if (modal) {
        modal.classList.add('active');
        const nameInput = document.getElementById('tagNameInput');
        const colorInput = document.getElementById('tagColorInput');
        if (nameInput) nameInput.value = '';
        if (colorInput) colorInput.value = '#cf6215';
    }
}

function closeTagModal() {
    const modal = document.getElementById('tagModal');
    if (modal) modal.classList.remove('active');
}

function saveTag() {
    const name = document.getElementById('tagNameInput')?.value.trim();
    const color = document.getElementById('tagColorInput')?.value || '#cf6215';
    if (name) {
        createTag(name, color);
        closeTagModal();
    } else {
        showNotification('Please enter a tag name', 'warning');
    }
}

function openReminderModal() {
    const modal = document.getElementById('reminderModal');
    if (modal) {
        modal.classList.add('active');
        const titleEl = document.getElementById('reminderTitle');
        const timeEl = document.getElementById('reminderTime');
        if (titleEl) titleEl.value = '';
        if (timeEl) timeEl.value = '';
        document.querySelectorAll('#reminderDays input').forEach(cb => cb.checked = false);
    }
}

function closeReminderModal() {
    const modal = document.getElementById('reminderModal');
    if (modal) modal.classList.remove('active');
}

function saveReminderFromModal() {
    const title = document.getElementById('reminderTitle')?.value.trim();
    const time = document.getElementById('reminderTime')?.value;
    const days = Array.from(document.querySelectorAll('#reminderDays input:checked'))
                      .map(cb => parseInt(cb.value, 10));

    if (!title || !time) {
        showNotification('Please fill in title and time', 'warning');
        return;
    }

    if (days.length === 0) {
        showNotification('Please select at least one day', 'warning');
        return;
    }

    addStudyReminder(title, time, days);
    closeReminderModal();
}

async function initEnhancedFeatures() {
    if (window._questionaryEnhancedFeaturesInitialized) {
        initLibraryDragDrop();
        return;
    }
    window._questionaryEnhancedFeaturesInitialized = true;
    console.log('[Features] Initializing enhanced features...');
    await UserLibraryDbService.init();

    initReminders();
    initLibraryDragDrop();
    initThemeOnLoad();
    initAlarmUI();
    initSettingsUI();

    if (dashboardLayout.widgets) {
        applyDashboardLayout();
    }

    renderVoiceNotesGrid();
    renderTagsMain();
    renderTaggedItems();
    renderLibrary();

    console.log('[Features] Enhanced features initialized successfully');
}

// Global Exports
window.UserLibraryDbService = UserLibraryDbService;
window.getPdfBlob = async function(blobId) {
    return await UserLibraryFileStore.getFileBlob(blobId);
};
window.savePdfBlob = async function(id, blob) {
    return await UserLibraryFileStore.saveFile(id, blob);
};
window.deletePdfBlob = async function(id) {
    return await UserLibraryFileStore.removeFile(id);
};

window.openAnyDocument = openAnyDocument;
window.showTextFile = showTextFile;
window.closeTextViewer = closeTextViewer;
window.copyTextViewerContent = copyTextViewerContent;
window.downloadTextContent = downloadTextContent;
window.showDocxFile = showDocxFile;
window.closeDocxViewer = closeDocxViewer;
window.downloadDocxContent = downloadDocxContent;

window.addPdfBookmark = addPdfBookmark;
window.removePdfBookmark = removePdfBookmark;
window.getPdfBookmarks = getPdfBookmarks;
window.renderPdfBookmarks = renderPdfBookmarks;
window.goToPdfPage = goToPdfPage;
window.openBookmarkModal = openBookmarkModal;
window.closeBookmarkModal = closeBookmarkModal;
window.saveBookmarkFromModal = saveBookmarkFromModal;
window.toggleBookmarksPanel = toggleBookmarksPanel;

window.startQuiz = startQuiz;
window.closeQuizModal = closeQuizModal;
window.submitTypedAnswer = submitTypedAnswer;

window.addStudyReminder = addStudyReminder;
window.deleteReminder = deleteReminder;
window.toggleReminder = toggleReminder;
window.renderReminders = renderReminders;

window.setTheme = setTheme;
window.toggleTheme = toggleTheme;
window.getCurrentTheme = getCurrentTheme;
window.initThemeOnLoad = initThemeOnLoad;
window.toggleCustomTheme = toggleCustomTheme;
window.updateCustomTheme = updateCustomTheme;
window.saveCustomTheme = saveCustomTheme;
window.resetCustomTheme = resetCustomTheme;
window.clearInlineThemeVars = clearInlineThemeVars;

window.createTag = createTag;
window.deleteTag = deleteTag;
window.addTagToItem = addTagToItem;
window.removeTagFromItem = removeTagFromItem;
window.getItemTags = getItemTags;
window.openTagModal = openTagModal;
window.closeTagModal = closeTagModal;
window.saveTag = saveTag;
window.openTagItemModal = openTagItemModal;
window.closeTagItemModal = closeTagItemModal;
window.toggleTagOnItem = toggleTagOnItem;
window.renderTagsMain = renderTagsMain;
window.renderTaggedItems = renderTaggedItems;
window.filterByTag = filterByTag;
window.navigateToTaggedItem = navigateToTaggedItem;

window.startRecording = startRecording;
window.stopRecording = stopRecording;
window.startRecordingNotes = startRecordingNotes;
window.toggleRecording = toggleRecording;
window.toggleRecordingNotes = toggleRecordingNotes;
window.playVoiceNote = playVoiceNote;
window.deleteVoiceNote = deleteVoiceNote;
window.renderVoiceNotesGrid = renderVoiceNotesGrid;

window.exportAllData = exportAllData;
window.importData = importData;

window.toggleWidgetVisibility = toggleWidgetVisibility;
window.reorderWidget = reorderWidget;
window.applyDashboardLayout = applyDashboardLayout;
window.renderDashboardWidgets = renderDashboardWidgets;

window.setAlarmSound = setAlarmSound;
window.setAlarmVolume = setAlarmVolume;
window.previewAlarmSound = previewAlarmSound;
window.playAlarmSound = playAlarmSound;
window.stopAlarmSound = stopAlarmSound;
window.initAlarmUI = initAlarmUI;

window.renderLibrary = renderLibrary;
window.toggleLibraryEditMode = toggleLibraryEditMode;
window.openCreateLibraryFolderModal = openCreateLibraryFolderModal;
window.closeLibraryFolderModal = closeLibraryFolderModal;
window.selectLibraryFolderColor = selectLibraryFolderColor;
window.saveLibraryFolder = saveLibraryFolder;
window.renameLibraryFolder = renameLibraryFolder;
window.renameLibraryFile = renameLibraryFile;
window.deleteLibraryFolder = deleteLibraryFolder;
window.deleteLibraryFile = deleteLibraryFile;
window.openMoveLibraryItemModal = openMoveLibraryItemModal;
window.selectMoveDestination = selectMoveDestination;
window.closeMoveItemModal = closeMoveItemModal;
window.confirmMoveItem = confirmMoveItem;
window.openPdfFilePicker = openPdfFilePicker;
window.importPdfToLibrary = importPdfToLibrary;
window.handleLibraryDragOver = handleLibraryDragOver;
window.handleLibraryDragLeave = handleLibraryDragLeave;
window.handleLibraryDrop = handleLibraryDrop;

window.openReminderModal = openReminderModal;
window.closeReminderModal = closeReminderModal;
window.saveReminderFromModal = saveReminderFromModal;

window.renderSettings = renderSettings;
window.initEnhancedFeatures = initEnhancedFeatures;

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initEnhancedFeatures);
} else {
    initEnhancedFeatures();
}

