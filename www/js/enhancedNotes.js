/* ==========================================================================
   QUESTIONARY ENHANCED NOTES ENGINE (v2.0)
   Markdown Editor, Live Split Preview, Subject Categorization, Pinning, Export
   ========================================================================== */

(function () {
  'use strict';

  const STORAGE_KEY = 'questionary-notes';

  const DEFAULT_NOTES = [
    {
      id: 'note_icse10_physics_formulas',
      title: 'ICSE 10 Physics Master Formula Sheet',
      category: 'physics',
      pinned: true,
      content: `# ICSE Class 10 Physics: Essential Formulas

### 1. Force, Work, Power & Energy
- **Work Done**: $W = F \\cdot s \\cos\\theta$
  - If $\\theta = 0^\\circ$, $W = F \\cdot s$ (Maximum work)
  - If $\\theta = 90^\\circ$, $W = 0$ (e.g. satellite in circular orbit)
- **Power**: $P = \\frac{W}{t} = F \\cdot v$
  - $1\\text{ H.P.} = 746\\text{ W}$
- **Kinetic Energy**: $K = \\frac{1}{2}mv^2 = \\frac{p^2}{2m}$
- **Potential Energy**: $U = mgh$

### 2. Machines
- **Mechanical Advantage**: $\\text{M.A.} = \\frac{\\text{Load}}{\\text{Effort}}$
- **Velocity Ratio**: $\\text{V.R.} = \\frac{d_E}{d_L}$
- **Efficiency**: $\\eta = \\frac{\\text{M.A.}}{\\text{V.R.}}$
- **Pulley System**: For a block and tackle system with $n$ pulleys, ideal $\\text{V.R.} = n$.

### 3. Refraction & Light
- **Snell's Law**: $\\mu = \\frac{\\sin i}{\\sin r}$
- **Critical Angle**: $\\mu = \\frac{1}{\\sin C}$
- **Lens Formula**: $\\frac{1}{f} = \\frac{1}{v} - \\frac{1}{u}$
- **Magnification**: $m = \\frac{v}{u} = \\frac{I}{O}$`,
      updatedAt: Date.now() - 3600000 * 2
    },
    {
      id: 'note_icse10_chem_reactions',
      title: 'ICSE 10 Chemistry: Salt Reactions & Observations',
      category: 'chemistry',
      pinned: true,
      content: `# Chemistry: Distinctive Observations & Tests

### Action of NaOH and NH4OH on Salt Solutions
1. **$Cu^{2+}$ (Copper salts)**:
   - With NaOH: Pale blue precipitate of $Cu(OH)_2$, insoluble in excess.
   - With $NH_4OH$: Pale blue precipitate, **soluble in excess** to give a deep inky blue solution of $[Cu(NH_3)_4]^{2+}$.

2. **$Fe^{2+}$ (Ferrous salts)**:
   - Dirty green precipitate of $Fe(OH)_2$, insoluble in excess of both alkalis.

3. **$Fe^{3+}$ (Ferric salts)**:
   - Reddish brown precipitate of $Fe(OH)_3$, insoluble in excess of both alkalis.

4. **$Zn^{2+}$ (Zinc salts)**:
   - Gelatinous white precipitate of $Zn(OH)_2$, soluble in excess of both alkalis to form colourless sodium zincate or tetraamminezinc ion.

5. **$Pb^{2+}$ (Lead salts)**:
   - Chalky white precipitate of $Pb(OH)_2$, soluble in excess NaOH (amphoteric), but **insoluble in excess $NH_4OH$**.`,
      updatedAt: Date.now() - 3600000 * 5
    },
    {
      id: 'note_icse10_java_tips',
      title: 'Computer Applications: Java Board Exam Traps',
      category: 'computer applications',
      pinned: false,
      content: `# Java Practical Concepts & Board Tips

### 1. Difference between Math.ceil(), Math.floor(), Math.round()
- \`Math.ceil(-4.2)\` $\\rightarrow$ \`-4.0\` (rounds up towards $+\\infty$)
- \`Math.floor(-4.2)\` $\\rightarrow$ \`-5.0\` (rounds down towards $-\\infty$)
- \`Math.round(-4.6)\` $\\rightarrow$ \`-5\` (returns \`long\` or \`int\`)

### 2. Character Wrapper Class Functions
- \`Character.isLetterOrDigit(ch)\`
- \`Character.toUpperCase(ch)\`
- \`Character.isWhitespace(ch)\`

### 3. Autoboxing & Unboxing
- **Autoboxing**: Automatic conversion of primitive data types into their corresponding wrapper class objects (e.g. \`int\` $\\rightarrow$ \`Integer\`).
- **Unboxing**: Automatic conversion of wrapper type to primitive.`,
      updatedAt: Date.now() - 3600000 * 24
    }
  ];

  let notes = [];
  let selectedCategory = 'all';
  let searchQuery = '';
  let activeEditingNote = null;
  let isPreviewMode = false;

  function loadNotes() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          notes = parsed;
          return;
        }
      }
    } catch (e) {}
    notes = JSON.parse(JSON.stringify(DEFAULT_NOTES));
    saveNotes();
  }

  function saveNotes() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
      window.notes = notes;
    } catch (e) {}
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

  // Simple, fast Markdown renderer
  function renderMarkdown(md) {
    if (!md) return '';
    let html = escapeHtml(md);

    // Headers
    html = html.replace(/^### (.*$)/gim, '<h3>$1</h3>');
    html = html.replace(/^## (.*$)/gim, '<h2>$1</h2>');
    html = html.replace(/^# (.*$)/gim, '<h1>$1</h1>');

    // Bold & Italic
    html = html.replace(/\*\*(.*?)\*\*/gim, '<strong>$1</strong>');
    html = html.replace(/\*(.*?)\*/gim, '<em>$1</em>');

    // Code blocks & inline code
    html = html.replace(/```([\s\S]*?)```/gim, '<pre><code>$1</code></pre>');
    html = html.replace(/`([^`]+)`/gim, '<code>$1</code>');

    // Blockquotes
    html = html.replace(/^\> (.*$)/gim, '<blockquote>$1</blockquote>');

    // Bullet lists
    html = html.replace(/^\- (.*$)/gim, '<li>$1</li>');

    // Line breaks
    html = html.replace(/\n/gim, '<br>');

    return sanitizeHtml(html);
  }

  function renderNotes() {
    loadNotes();
    const container = document.getElementById('notesGrid');
    if (!container) return;

    // Filter & Search
    let filtered = notes.filter(n => {
      const matchesCategory = selectedCategory === 'all' || (n.category || '').toLowerCase() === selectedCategory.toLowerCase();
      const matchesSearch = !searchQuery || 
        (n.title && n.title.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (n.content && n.content.toLowerCase().includes(searchQuery.toLowerCase()));
      return matchesCategory && matchesSearch;
    });

    // Pinned notes first, then latest updated
    filtered.sort((a, b) => {
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      return (b.updatedAt || 0) - (a.updatedAt || 0);
    });

    // Header Toolbar
    let headerBar = document.getElementById('notesHeaderBar');
    if (!headerBar) {
      headerBar = document.createElement('div');
      headerBar.id = 'notesHeaderBar';
      headerBar.className = 'notes-header-bar';
      container.parentElement.insertBefore(headerBar, container);
    }

    const activeEl = document.activeElement;
    const wasSearchFocused = activeEl && activeEl.id === 'enhancedNotesSearchInput';
    const searchSelStart = wasSearchFocused ? activeEl.selectionStart : null;
    const searchSelEnd = wasSearchFocused ? activeEl.selectionEnd : null;

    const categories = ['All', 'Physics', 'Chemistry', 'Biology', 'Mathematics', 'English', 'Computer Applications', 'General'];
    headerBar.innerHTML = sanitizeUiHtml(`
      <div class="flashcards-filters">
        ${categories.map(c => `
          <button type="button" class="subject-chip ${selectedCategory.toLowerCase() === c.toLowerCase() ? 'active' : ''}" data-category="${escapeHtml(c.toLowerCase())}">
            ${escapeHtml(c)}
          </button>
        `).join('')}
      </div>
      <div style="display:flex; align-items:center; gap:8px;">
        <div class="notes-search-box">
          <i class="fas fa-search" style="color:var(--fg3, #71717a); font-size:0.8rem;"></i>
          <input type="text" id="enhancedNotesSearchInput" placeholder="Search notes..." value="${escapeHtml(searchQuery)}">
        </div>
        <button type="button" id="enhancedNewNoteBtn" class="btn btn-primary btn-sm">
          <i class="fas fa-plus"></i> New Note
        </button>
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

    document.getElementById('enhancedNewNoteBtn')?.addEventListener('click', () => openEditor());

    if (filtered.length === 0) {
      container.innerHTML = sanitizeUiHtml(`
        <div style="grid-column: 1 / -1; text-align: center; padding: 3rem 1rem; color: var(--fg2, #a1a1aa);">
          <i class="fas fa-sticky-note" style="font-size: 2.5rem; color: var(--fg3, #71717a); margin-bottom: 12px; display:block;"></i>
          <p style="font-size: 1rem; margin-bottom: 8px;">No study notes found matching your filters.</p>
          <button type="button" id="enhancedEmptyCreateNoteBtn" class="btn btn-primary btn-sm">Create Note</button>
        </div>
      `);
      document.getElementById('enhancedEmptyCreateNoteBtn')?.addEventListener('click', () => openEditor());
      return;
    }

    container.innerHTML = sanitizeUiHtml(filtered.map(note => {
      const wordCount = note.content ? note.content.trim().split(/\s+/).length : 0;
      const cleanSnippet = (note.content || '').replace(/[#*`_>]/g, '').trim().substring(0, 130);
      return `
        <div class="note-card ${note.pinned ? 'pinned' : ''}" data-note-id="${escapeHtml(note.id)}">
          <div class="note-card-top">
            <span class="note-category-tag">${escapeHtml(note.category || 'General')}</span>
            <div style="display:flex; gap:6px;">
              <button type="button" class="btn-icon note-pin-btn" title="${note.pinned ? 'Unpin note' : 'Pin note'}">
                <i class="fas fa-thumbtack" style="${note.pinned ? 'color:var(--accent,#cf6215); transform:rotate(-45deg);' : 'color:var(--fg3,#71717a);'}"></i>
              </button>
              <button type="button" class="btn-icon delete note-delete-btn" title="Delete note">
                <i class="fas fa-trash"></i>
              </button>
            </div>
          </div>

          <h4>${escapeHtml(note.title)}</h4>
          <p>${escapeHtml(cleanSnippet)}${cleanSnippet.length >= 130 ? '...' : ''}</p>

          <div class="note-card-footer">
            <span><i class="fas fa-clock"></i> ${escapeHtml(new Date(note.updatedAt || Date.now()).toLocaleDateString())}</span>
            <span><i class="fas fa-file-alt"></i> ${wordCount} words</span>
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
          ? '<i class="fas fa-edit"></i> Edit Study Note'
          : '<i class="fas fa-sticky-note"></i> Create Study Note'
      );
    }
    if (titleInput) titleInput.value = activeEditingNote ? activeEditingNote.title : '';
    if (categorySelect) categorySelect.value = activeEditingNote ? (activeEditingNote.category || 'general').toLowerCase() : 'general';
    if (contentTextarea) {
      contentTextarea.value = activeEditingNote ? activeEditingNote.content : '';
      contentTextarea.style.display = 'block';
    }
    const existingPreviewEl = document.getElementById('noteRenderedPreview');
    if (existingPreviewEl) existingPreviewEl.style.display = 'none';

    // Insert formatting toolbar above content textarea if not already present
    let toolbar = document.getElementById('noteFormatToolbar');
    if (!toolbar && contentTextarea) {
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
        <button type="button" class="note-tool-btn note-md-btn" data-prefix="\`" data-suffix="\`" title="Code"><i class="fas fa-code"></i></button>
        <button type="button" class="note-tool-btn" id="notePreviewToggleBtn" style="margin-left:auto; font-weight:700;">
          <i class="fas fa-eye"></i> Preview
        </button>
      `);
      toolbar.querySelectorAll('.note-md-btn').forEach(btn => {
        btn.addEventListener('click', () => insertMarkdown(btn.dataset.prefix || '', btn.dataset.suffix || ''));
      });
      document.getElementById('notePreviewToggleBtn')?.addEventListener('click', togglePreview);
    }

    // Modal Footer with Export & Save
    const modalFooter = modal.querySelector('.modal-footer');
    if (modalFooter) {
      modalFooter.innerHTML = sanitizeUiHtml(`
        <div style="display:flex; justify-content:space-between; width:100%; align-items:center;">
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
      document.getElementById('enhancedCancelNoteBtn')?.addEventListener('click', () => modal.classList.remove('active'));
      document.getElementById('enhancedSaveNoteBtn')?.addEventListener('click', saveActiveNote);
    }

    modal.classList.add('active');
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
      toggleBtn.innerHTML = sanitizeUiHtml(isPreviewMode ? '<i class="fas fa-edit"></i> Edit' : '<i class="fas fa-eye"></i> Preview');
    }

    if (isPreviewMode) {
      if (!previewEl) {
        previewEl = document.createElement('div');
        previewEl.id = 'noteRenderedPreview';
        previewEl.className = 'note-rendered-view';
        textarea.parentElement.appendChild(previewEl);
      }
      previewEl.innerHTML = sanitizeHtml(renderMarkdown(textarea.value));
      textarea.style.display = 'none';
      previewEl.style.display = 'block';
    } else {
      if (previewEl) previewEl.style.display = 'none';
      textarea.style.display = 'block';
    }
  }

  function saveActiveNote() {
    const titleInput = document.getElementById('noteTitle');
    const categorySelect = document.getElementById('noteCategory');
    const contentTextarea = document.getElementById('noteContent');
    const modal = document.getElementById('noteModal');

    const title = titleInput?.value.trim();
    const content = contentTextarea?.value.trim();
    const category = categorySelect?.value || 'general';

    if (!title) {
      if (window.showNotification) window.showNotification('Please enter a note title.', 'warning');
      return;
    }

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
    modal?.classList.remove('active');
    if (window.showNotification) window.showNotification('Note saved successfully!', 'success');
  }

  function deleteNote(noteId) {
    loadNotes();
    const note = notes.find(n => String(n.id) === String(noteId));
    if (!note) return;

    if (window.confirm(`Delete the note "${note.title}"?`)) {
      notes = notes.filter(n => String(n.id) !== String(noteId));
      saveNotes();
      renderNotes();
      if (window.showNotification) window.showNotification('Note deleted', 'info');
    }
  }

  function exportNote() {
    if (!activeEditingNote) return;
    const blob = new Blob([activeEditingNote.content], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${activeEditingNote.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.md`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  window.EnhancedNotes = {
    loadNotes,
    saveNotes,
    renderNotes,
    openEditor,
    togglePin,
    deleteNote,
    exportNote,
    insertMarkdown,
    togglePreview,
    filterCategory: (cat) => {
      selectedCategory = cat;
      renderNotes();
    },
    setSearch: (query) => {
      searchQuery = query;
      renderNotes();
    }
  };

  // Wire into app.js hooks
  window.renderNotes = renderNotes;
  window.editNote = openEditor;
  window.deleteNote = deleteNote;
  window.openNoteModal = openEditor;

  document.getElementById('createNoteBtn')?.addEventListener('click', () => openEditor());
  document.getElementById('closeNoteModal')?.addEventListener('click', () => {
    document.getElementById('noteModal')?.classList.remove('active');
  });
  document.getElementById('cancelNoteBtn')?.addEventListener('click', () => {
    document.getElementById('noteModal')?.classList.remove('active');
  });
})();
