/* ==========================================================================
   QUESTIONARY ENHANCED NOTES ENGINE (v3.0)
   Single Authoritative Engine: Markdown Editor, Live Preview, Pinning, Export
   Zero pre-seeded sample/test data.
   ========================================================================== */

(function () {
  'use strict';

  const STORAGE_KEY = 'questionary-notes';
  const DEMO_PURGE_KEY = 'questionary-demo-notes-purged-v1';
  const LEGACY_DEMO_IDS = new Set([
    'note_icse10_physics_formulas',
    'note_icse10_chem_reactions',
    'note_icse10_java_tips'
  ]);

  const KNOWN_CATEGORIES = [
    'General',
    'Physics',
    'Chemistry',
    'Biology',
    'Mathematics',
    'Computer Applications',
    'English',
    'History',
    'Geography',
    'Other'
  ];

  const CATEGORY_ALIASES = {
    '': 'General',
    'general': 'General',
    'physics': 'Physics',
    'chemistry': 'Chemistry',
    'biology': 'Biology',
    'math': 'Mathematics',
    'maths': 'Mathematics',
    'mathematics': 'Mathematics',
    'computer': 'Computer Applications',
    'computers': 'Computer Applications',
    'computer science': 'Computer Applications',
    'computer applications': 'Computer Applications',
    'english': 'English',
    'history': 'History',
    'geography': 'Geography',
    'other': 'Other'
  };

  let notes = [];
  let selectedCategory = 'all';
  let searchQuery = '';
  let activeEditingNote = null;
  let isPreviewMode = false;

  function normalizeCategory(raw) {
    const cleaned = String(raw || '').trim();
    if (!cleaned) return 'General';
    const lower = cleaned.toLowerCase();
    if (Object.prototype.hasOwnProperty.call(CATEGORY_ALIASES, lower)) {
      return CATEGORY_ALIASES[lower];
    }
    const knownMatch = KNOWN_CATEGORIES.find(c => c.toLowerCase() === lower);
    if (knownMatch) return knownMatch;
    return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  }

  function loadNotes() {
    let parsed = [];
    let modified = false;

    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const raw = JSON.parse(saved);
        if (Array.isArray(raw)) {
          parsed = raw;
        }
      }
    } catch (e) {
      parsed = [];
    }

    // One-time cleanup: remove only the old pre-seeded sample notes while keeping all user-created notes
    try {
      if (!localStorage.getItem(DEMO_PURGE_KEY)) {
        const beforeCount = parsed.length;
        parsed = parsed.filter(n => n && !LEGACY_DEMO_IDS.has(String(n.id)));
        if (parsed.length !== beforeCount) {
          modified = true;
        }
        localStorage.setItem(DEMO_PURGE_KEY, '1');
      }
    } catch (e) {}

    notes = parsed
      .filter(n => n && typeof n === 'object')
      .map((note, idx) => {
        const id = note.id ? String(note.id) : `note_${Date.now()}_${idx}`;
        const title = String(note.title || 'Untitled Note').trim() || 'Untitled Note';
        const content = String(note.content || '');
        const category = normalizeCategory(note.category);
        const pinned = Boolean(note.pinned);
        const updatedAt = Number(note.updatedAt) || Number(note.createdAt) || Date.now();

        if (note.id !== id || note.category !== category) {
          modified = true;
        }

        return { id, title, content, category, pinned, updatedAt };
      });

    window.notes = notes;
    if (modified) {
      saveNotes();
    }
    return notes;
  }

  function saveNotes() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
      window.notes = notes;
    } catch (e) {}
  }

  function getNotes() {
    return loadNotes();
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

  function formatInlineMarkdown(escapedText) {
    return escapedText
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[^*])\*([^*]+)\*(?!\*)/g, '$1<em>$2</em>');
  }

  function renderMarkdown(md) {
    const source = String(md || '');
    if (!source.trim()) {
      return '<p style="color:var(--fg3); font-style:italic; margin:0;">Nothing to preview yet. Start writing in the editor.</p>';
    }

    const lines = source.replace(/\r\n/g, '\n').split('\n');
    const out = [];
    let inCodeBlock = false;
    let codeLines = [];
    let listType = null; // 'ul' | 'ol' | null

    function closeList() {
      if (listType) {
        out.push(`</${listType}>`);
        listType = null;
      }
    }

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      if (line.trim().startsWith('```')) {
        closeList();
        if (!inCodeBlock) {
          inCodeBlock = true;
          codeLines = [];
        } else {
          out.push(`<pre><code>${escapeHtml(codeLines.join('\n'))}</code></pre>`);
          inCodeBlock = false;
          codeLines = [];
        }
        continue;
      }

      if (inCodeBlock) {
        codeLines.push(line);
        continue;
      }

      const trimmed = line.trim();
      if (!trimmed) {
        closeList();
        continue;
      }

      const h3Match = trimmed.match(/^###\s+(.+)$/);
      if (h3Match) {
        closeList();
        out.push(`<h3>${formatInlineMarkdown(escapeHtml(h3Match[1]))}</h3>`);
        continue;
      }

      const h2Match = trimmed.match(/^##\s+(.+)$/);
      if (h2Match) {
        closeList();
        out.push(`<h2>${formatInlineMarkdown(escapeHtml(h2Match[1]))}</h2>`);
        continue;
      }

      const h1Match = trimmed.match(/^#\s+(.+)$/);
      if (h1Match) {
        closeList();
        out.push(`<h1>${formatInlineMarkdown(escapeHtml(h1Match[1]))}</h1>`);
        continue;
      }

      const quoteMatch = trimmed.match(/^>\s?(.*)$/);
      if (quoteMatch) {
        closeList();
        out.push(`<blockquote>${formatInlineMarkdown(escapeHtml(quoteMatch[1]))}</blockquote>`);
        continue;
      }

      const ulMatch = trimmed.match(/^[-*]\s+(.+)$/);
      if (ulMatch) {
        if (listType !== 'ul') {
          closeList();
          listType = 'ul';
          out.push('<ul>');
        }
        out.push(`<li>${formatInlineMarkdown(escapeHtml(ulMatch[1]))}</li>`);
        continue;
      }

      const olMatch = trimmed.match(/^\d+\.\s+(.+)$/);
      if (olMatch) {
        if (listType !== 'ol') {
          closeList();
          listType = 'ol';
          out.push('<ol>');
        }
        out.push(`<li>${formatInlineMarkdown(escapeHtml(olMatch[1]))}</li>`);
        continue;
      }

      closeList();
      out.push(`<p style="margin:0.4em 0;">${formatInlineMarkdown(escapeHtml(line))}</p>`);
    }

    if (inCodeBlock) {
      out.push(`<pre><code>${escapeHtml(codeLines.join('\n'))}</code></pre>`);
    }
    closeList();

    return sanitizeHtml(out.join('\n'));
  }

  function countWords(text) {
    const trimmed = String(text || '').trim();
    if (!trimmed) return 0;
    return trimmed.split(/\s+/).length;
  }

  async function confirmAction(message, title) {
    if (typeof window.showConfirm === 'function') {
      return await window.showConfirm(message, {
        title: title || 'Confirm',
        type: 'danger',
        confirmText: 'Delete'
      });
    }
    return true;
  }

  function renderNotes() {
    loadNotes();
    const container = document.getElementById('notesGrid');
    if (!container) return;

    const exportNotesBtn = document.getElementById('exportNotesBtn');
    if (exportNotesBtn) {
      exportNotesBtn.disabled = notes.length === 0;
      exportNotesBtn.style.opacity = notes.length === 0 ? '0.5' : '';
    }

    let headerBar = document.getElementById('notesHeaderBar');
    if (!headerBar && container.parentElement) {
      headerBar = document.createElement('div');
      headerBar.id = 'notesHeaderBar';
      headerBar.className = 'notes-header-bar';
      container.parentElement.insertBefore(headerBar, container);
    }

    if (notes.length === 0) {
      selectedCategory = 'all';
      searchQuery = '';
      if (headerBar) {
        headerBar.style.display = 'none';
        headerBar.innerHTML = '';
      }
      container.innerHTML = sanitizeUiHtml(`
        <div class="study-empty-state">
          <div class="study-empty-icon"><i class="fas fa-sticky-note"></i></div>
          <h4>No study notes yet</h4>
          <p>Capture formulas, summaries, and revision checklists with Markdown formatting, or import notes from a file or AI prompt.</p>
          <div style="display:flex; gap:8px; justify-content:center; flex-wrap:wrap;">
            <button type="button" id="enhancedEmptyImportNotesBtn" class="btn btn-secondary btn-sm">
              <i class="fas fa-file-import"></i> Import Notes
            </button>
            <button type="button" id="enhancedEmptyAiGuideNotesBtn" class="btn btn-secondary btn-sm">
              <i class="fas fa-magic"></i> AI Prompt &amp; Guide
            </button>
            <button type="button" id="enhancedEmptyCreateNoteBtn" class="btn btn-primary btn-sm">
              <i class="fas fa-plus"></i> Create Your First Note
            </button>
          </div>
        </div>
      `);
      document.getElementById('enhancedEmptyCreateNoteBtn')?.addEventListener('click', () => openEditor());
      document.getElementById('enhancedEmptyImportNotesBtn')?.addEventListener('click', () => {
        if (window.StudyImportExport) window.StudyImportExport.openNotesImport('notes-import-paste');
      });
      document.getElementById('enhancedEmptyAiGuideNotesBtn')?.addEventListener('click', () => {
        if (window.StudyImportExport) window.StudyImportExport.openNotesImport('notes-import-ai');
      });
      return;
    }

    // Collect distinct categories present in user's notes
    const activeCategories = [];
    const seenCats = new Set();
    notes.forEach(n => {
      const cat = normalizeCategory(n.category);
      const key = cat.toLowerCase();
      if (!seenCats.has(key)) {
        seenCats.add(key);
        activeCategories.push(cat);
      }
    });

    if (selectedCategory !== 'all' && !seenCats.has(selectedCategory.toLowerCase())) {
      selectedCategory = 'all';
    }

    const activeEl = document.activeElement;
    const wasSearchFocused = activeEl && activeEl.id === 'enhancedNotesSearchInput';
    const searchSelStart = wasSearchFocused ? activeEl.selectionStart : null;
    const searchSelEnd = wasSearchFocused ? activeEl.selectionEnd : null;

    if (headerBar) {
      headerBar.style.display = 'flex';
      const chips = activeCategories.length > 1 ? ['All', ...activeCategories] : [];
      headerBar.innerHTML = sanitizeUiHtml(`
        <div class="flashcards-filters">
          ${chips.map(c => `
            <button type="button" class="subject-chip ${selectedCategory.toLowerCase() === c.toLowerCase() ? 'active' : ''}" data-category="${escapeHtml(c.toLowerCase())}">
              ${escapeHtml(c)}
            </button>
          `).join('')}
        </div>
        <div class="notes-search-box">
          <i class="fas fa-search" style="color:var(--fg3); font-size:0.8rem;"></i>
          <input type="text" id="enhancedNotesSearchInput" placeholder="Search notes..." value="${escapeHtml(searchQuery)}">
        </div>
      `);

      headerBar.querySelectorAll('.subject-chip').forEach(btn => {
        btn.addEventListener('click', () => {
          selectedCategory = btn.dataset.category || 'all';
          renderNotes();
        });
      });

      const notesSearchInput = document.getElementById('enhancedNotesSearchInput');
      if (notesSearchInput) {
        notesSearchInput.addEventListener('input', (e) => {
          searchQuery = e.target.value;
          renderNotes();
        });
        if (wasSearchFocused) {
          notesSearchInput.focus();
          if (typeof searchSelStart === 'number' && typeof searchSelEnd === 'number') {
            notesSearchInput.setSelectionRange(searchSelStart, searchSelEnd);
          }
        }
      }
    }

    const q = searchQuery.trim().toLowerCase();
    const filtered = notes
      .filter(n => {
        const matchesCategory = selectedCategory === 'all' || normalizeCategory(n.category).toLowerCase() === selectedCategory.toLowerCase();
        const matchesSearch = !q ||
          (n.title && n.title.toLowerCase().includes(q)) ||
          (n.content && n.content.toLowerCase().includes(q));
        return matchesCategory && matchesSearch;
      })
      .sort((a, b) => {
        if (a.pinned && !b.pinned) return -1;
        if (!a.pinned && b.pinned) return 1;
        return (b.updatedAt || 0) - (a.updatedAt || 0);
      });

    if (filtered.length === 0) {
      container.innerHTML = sanitizeUiHtml(`
        <div class="study-empty-state">
          <div class="study-empty-icon"><i class="fas fa-search"></i></div>
          <h4>No matching notes</h4>
          <p>Try a different search term or clear your active filters.</p>
          <div style="display:flex; gap:8px; justify-content:center; flex-wrap:wrap;">
            <button type="button" id="enhancedClearNoteFiltersBtn" class="btn btn-secondary btn-sm">Clear Filters</button>
            <button type="button" id="enhancedEmptyCreateNoteBtn" class="btn btn-primary btn-sm"><i class="fas fa-plus"></i> New Note</button>
          </div>
        </div>
      `);
      document.getElementById('enhancedClearNoteFiltersBtn')?.addEventListener('click', () => {
        selectedCategory = 'all';
        searchQuery = '';
        renderNotes();
      });
      document.getElementById('enhancedEmptyCreateNoteBtn')?.addEventListener('click', () => openEditor());
      return;
    }

    container.innerHTML = sanitizeUiHtml(filtered.map(note => {
      const words = countWords(note.content);
      const cleanSnippet = (note.content || '')
        .replace(/```[\s\S]*?```/g, ' ')
        .replace(/[#*`_>]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .substring(0, 140);
      const categoryLabel = normalizeCategory(note.category);

      return `
        <div class="note-card ${note.pinned ? 'pinned' : ''}" data-note-id="${escapeHtml(note.id)}">
          <div class="note-card-top">
            <span class="note-category-tag">${escapeHtml(categoryLabel)}</span>
            <div class="card-icon-actions">
              <button type="button" class="btn-icon note-pin-btn ${note.pinned ? 'active' : ''}" title="${note.pinned ? 'Unpin note' : 'Pin note'}" aria-label="${note.pinned ? 'Unpin note' : 'Pin note'}">
                <i class="fas fa-thumbtack" style="${note.pinned ? 'color:var(--accent); transform:rotate(-35deg);' : ''}"></i>
              </button>
              <button type="button" class="btn-icon note-export-btn" title="Export note" aria-label="Export note">
                <i class="fas fa-download"></i>
              </button>
              <button type="button" class="btn-icon note-edit-btn" title="Edit note" aria-label="Edit note">
                <i class="fas fa-pen"></i>
              </button>
              <button type="button" class="btn-icon delete note-delete-btn" title="Delete note" aria-label="Delete note">
                <i class="fas fa-trash"></i>
              </button>
            </div>
          </div>

          <h4 class="note-card-heading">${escapeHtml(note.title)}</h4>
          <p class="note-card-snippet">${cleanSnippet ? `${escapeHtml(cleanSnippet)}${cleanSnippet.length >= 140 ? '…' : ''}` : '<span style="color:var(--fg3); font-style:italic;">Empty note</span>'}</p>

          <div class="note-card-footer">
            <span><i class="fas fa-clock"></i> ${escapeHtml(new Date(note.updatedAt || Date.now()).toLocaleDateString())}</span>
            <span><i class="fas fa-file-alt"></i> ${words} ${words === 1 ? 'word' : 'words'}</span>
          </div>
        </div>
      `;
    }).join(''));

    container.querySelectorAll('.note-card').forEach(card => {
      const noteId = card.dataset.noteId;
      card.addEventListener('click', () => openEditor(noteId));
      card.querySelector('.note-pin-btn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        togglePin(noteId);
      });
      card.querySelector('.note-export-btn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        if (window.StudyImportExport) {
          window.StudyImportExport.openNotesExport(noteId);
        }
      });
      card.querySelector('.note-edit-btn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        openEditor(noteId);
      });
      card.querySelector('.note-delete-btn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        deleteNote(noteId);
      });
    });
  }

  function togglePin(noteId) {
    loadNotes();
    const note = notes.find(n => String(n.id) === String(noteId));
    if (note) {
      note.pinned = !note.pinned;
      saveNotes();
      renderNotes();
    }
  }

  function setSelectValueNormalized(selectEl, value) {
    if (!selectEl) return;
    const normalized = normalizeCategory(value);
    const matchingOpt = Array.from(selectEl.options).find(
      opt => opt.value.toLowerCase() === normalized.toLowerCase()
    );
    if (matchingOpt) {
      selectEl.value = matchingOpt.value;
    } else {
      selectEl.value = 'General';
    }
  }

  function closeEditor() {
    const modal = document.getElementById('noteModal');
    if (modal) modal.classList.remove('active');
    activeEditingNote = null;
    isPreviewMode = false;
  }

  function openEditor(noteId = null) {
    loadNotes();
    const modal = document.getElementById('noteModal');
    if (!modal) return;

    activeEditingNote = noteId ? notes.find(n => String(n.id) === String(noteId)) : null;
    isPreviewMode = false;

    const modalTitle = document.getElementById('noteModalTitle');
    const titleInput = document.getElementById('noteTitle');
    const categorySelect = document.getElementById('noteCategory');
    const contentTextarea = document.getElementById('noteContent');

    if (modalTitle) {
      modalTitle.innerHTML = sanitizeUiHtml(
        activeEditingNote
          ? '<i class="fas fa-pen"></i> Edit Study Note'
          : '<i class="fas fa-sticky-note"></i> Create Study Note'
      );
    }
    if (titleInput) titleInput.value = activeEditingNote ? activeEditingNote.title : '';
    setSelectValueNormalized(categorySelect, activeEditingNote ? activeEditingNote.category : 'General');

    if (contentTextarea) {
      contentTextarea.value = activeEditingNote ? activeEditingNote.content : '';
      contentTextarea.style.display = 'block';
    }
    const existingPreviewEl = document.getElementById('noteRenderedPreview');
    if (existingPreviewEl) existingPreviewEl.style.display = 'none';

    let toolbar = document.getElementById('noteFormatToolbar');
    if (!toolbar && contentTextarea && contentTextarea.parentElement) {
      toolbar = document.createElement('div');
      toolbar.id = 'noteFormatToolbar';
      toolbar.className = 'note-toolbar';
      contentTextarea.parentElement.insertBefore(toolbar, contentTextarea);
    }

    if (toolbar) {
      toolbar.innerHTML = sanitizeUiHtml(`
        <button type="button" class="note-tool-btn note-md-btn" data-prefix="**" data-suffix="**" title="Bold"><i class="fas fa-bold"></i></button>
        <button type="button" class="note-tool-btn note-md-btn" data-prefix="*" data-suffix="*" title="Italic"><i class="fas fa-italic"></i></button>
        <button type="button" class="note-tool-btn note-md-btn" data-prefix="### " data-suffix="" title="Heading"><i class="fas fa-heading"></i></button>
        <button type="button" class="note-tool-btn note-md-btn" data-prefix="- " data-suffix="" title="Bullet List"><i class="fas fa-list-ul"></i></button>
        <button type="button" class="note-tool-btn note-md-btn" data-prefix="1. " data-suffix="" title="Numbered List"><i class="fas fa-list-ol"></i></button>
        <button type="button" class="note-tool-btn note-md-btn" data-prefix="> " data-suffix="" title="Quote"><i class="fas fa-quote-left"></i></button>
        <button type="button" class="note-tool-btn note-md-btn" data-prefix="\`" data-suffix="\`" title="Inline Code"><i class="fas fa-code"></i></button>
        <button type="button" class="note-tool-btn" id="notePreviewToggleBtn" style="margin-left:auto; font-weight:700;">
          <i class="fas fa-eye"></i> Preview
        </button>
      `);
      toolbar.querySelectorAll('.note-md-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          if (isPreviewMode) togglePreview();
          insertMarkdown(btn.dataset.prefix || '', btn.dataset.suffix || '');
        });
      });
      document.getElementById('notePreviewToggleBtn')?.addEventListener('click', togglePreview);
    }

    const modalFooter = modal.querySelector('.modal-footer');
    if (modalFooter) {
      modalFooter.innerHTML = sanitizeUiHtml(`
        <div style="display:flex; justify-content:space-between; width:100%; align-items:center; flex-wrap:wrap; gap:8px;">
          <div>
            ${activeEditingNote ? `
              <button type="button" id="enhancedExportNoteBtn" class="btn btn-secondary btn-sm">
                <i class="fas fa-download"></i> Export (.md)
              </button>
            ` : ''}
          </div>
          <div style="display:flex; gap:8px;">
            <button type="button" id="enhancedCancelNoteBtn" class="btn btn-secondary">Cancel</button>
            <button type="button" class="btn btn-primary" id="enhancedSaveNoteBtn"><i class="fas fa-save"></i> Save Note</button>
          </div>
        </div>
      `);

      document.getElementById('enhancedExportNoteBtn')?.addEventListener('click', exportNote);
      document.getElementById('enhancedCancelNoteBtn')?.addEventListener('click', closeEditor);
      document.getElementById('enhancedSaveNoteBtn')?.addEventListener('click', saveActiveNote);
    }

    modal.classList.add('active');
    setTimeout(() => titleInput?.focus(), 60);
  }

  function insertMarkdown(prefix, suffix = '') {
    const textarea = document.getElementById('noteContent');
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = textarea.value.substring(start, end);
    const replacement = prefix + selected + suffix;

    textarea.value = textarea.value.substring(0, start) + replacement + textarea.value.substring(end);
    textarea.focus();
    textarea.setSelectionRange(start + prefix.length, start + prefix.length + selected.length);
  }

  function togglePreview() {
    const textarea = document.getElementById('noteContent');
    if (!textarea) return;

    let previewEl = document.getElementById('noteRenderedPreview');
    isPreviewMode = !isPreviewMode;

    const toggleBtn = document.getElementById('notePreviewToggleBtn');
    if (toggleBtn) {
      toggleBtn.innerHTML = sanitizeUiHtml(isPreviewMode ? '<i class="fas fa-pen"></i> Edit' : '<i class="fas fa-eye"></i> Preview');
    }

    if (isPreviewMode) {
      if (!previewEl) {
        previewEl = document.createElement('div');
        previewEl.id = 'noteRenderedPreview';
        previewEl.className = 'note-rendered-view';
        textarea.parentElement.appendChild(previewEl);
      }
      previewEl.innerHTML = renderMarkdown(textarea.value);
      textarea.style.display = 'none';
      previewEl.style.display = 'block';
    } else {
      if (previewEl) previewEl.style.display = 'none';
      textarea.style.display = 'block';
      textarea.focus();
    }
  }

  function saveActiveNote() {
    const titleInput = document.getElementById('noteTitle');
    const categorySelect = document.getElementById('noteCategory');
    const contentTextarea = document.getElementById('noteContent');

    const title = titleInput ? titleInput.value.trim() : '';
    const content = contentTextarea ? contentTextarea.value : '';
    const category = normalizeCategory(categorySelect ? categorySelect.value : 'General');

    if (!title) {
      if (window.showNotification) window.showNotification('Please enter a note title.', 'warning');
      titleInput?.focus();
      return;
    }

    const wasEditing = Boolean(activeEditingNote);
    if (activeEditingNote) {
      activeEditingNote.title = title;
      activeEditingNote.content = content;
      activeEditingNote.category = category;
      activeEditingNote.updatedAt = Date.now();
    } else {
      notes.unshift({
        id: 'note_' + Date.now(),
        title,
        content,
        category,
        pinned: false,
        updatedAt: Date.now()
      });
    }

    saveNotes();
    renderNotes();
    closeEditor();
    if (window.showNotification) {
      window.showNotification(wasEditing ? 'Note updated!' : 'Note created!', 'success');
    }
  }

  async function deleteNote(noteId) {
    loadNotes();
    const note = notes.find(n => String(n.id) === String(noteId));
    if (!note) return;

    const confirmed = await confirmAction(
      `Are you sure you want to delete the note "${note.title}"?`,
      'Delete Note'
    );
    if (!confirmed) return;

    notes = notes.filter(n => String(n.id) !== String(noteId));
    saveNotes();
    renderNotes();
    if (window.showNotification) window.showNotification('Note deleted', 'info');
  }

  function exportNote() {
    if (!activeEditingNote) return;
    const title = (document.getElementById('noteTitle')?.value.trim()) || activeEditingNote.title || 'study-note';
    const content = (document.getElementById('noteContent')?.value) ?? activeEditingNote.content ?? '';
    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title.replace(/[^a-z0-9]/gi, '_').toLowerCase() || 'note'}.md`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function bindStaticControls() {
    const createNoteBtn = document.getElementById('createNoteBtn');
    if (createNoteBtn) createNoteBtn.onclick = () => openEditor();

    const closeNoteBtn = document.getElementById('closeNoteModal');
    if (closeNoteBtn) closeNoteBtn.onclick = closeEditor;

    const cancelNoteBtn = document.getElementById('cancelNoteBtn');
    if (cancelNoteBtn) cancelNoteBtn.onclick = closeEditor;
  }

  window.EnhancedNotes = {
    loadNotes,
    saveNotes,
    getNotes,
    renderNotes,
    openEditor,
    closeEditor,
    togglePin,
    deleteNote,
    exportNote,
    insertMarkdown,
    togglePreview,
    filterCategory: (cat) => {
      selectedCategory = cat || 'all';
      renderNotes();
    },
    setSearch: (query) => {
      searchQuery = query || '';
      renderNotes();
    }
  };

  window.renderNotes = renderNotes;
  window.editNote = openEditor;
  window.deleteNote = deleteNote;
  window.openNoteModal = openEditor;

  loadNotes();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindStaticControls);
  } else {
    bindStaticControls();
  }
})();
