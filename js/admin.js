/* ==========================================================================
   QUESTIONARY STANDALONE ADMIN ENGINE
   Isolated SQLite Manager, Easy PDF Importer, SQL Studio & Broadcaster
   ========================================================================== */

(function () {
  'use strict';

  let SQL_ENGINE = null;
  let db = null;
  let allNodes = [];
  let nodeById = new Map();
  let announcements = [];
  let lastSqlResults = null;
  let currentTab = 'dashboard';
  let indexedPapers = [];
  let pendingPdfUploads = [];
  let dashboardInitialized = false;

  // =========================================================================
  // TOAST NOTIFICATIONS
  // =========================================================================
  function showToast(msg, type = 'success') {
    const toast = document.getElementById('adminToast');
    const toastMsg = document.getElementById('toastMsg');
    const toastIcon = document.getElementById('toastIcon');
    if (!toast || !toastMsg) return;

    toastMsg.textContent = msg;
    if (type === 'success') {
      toastIcon.className = 'fas fa-check-circle';
      toastIcon.style.color = 'var(--success)';
    } else if (type === 'error') {
      toastIcon.className = 'fas fa-exclamation-triangle';
      toastIcon.style.color = 'var(--danger)';
    } else {
      toastIcon.className = 'fas fa-info-circle';
      toastIcon.style.color = 'var(--info)';
    }

    toast.classList.add('show');
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => {
      toast.classList.remove('show');
    }, 3400);
  }

  // =========================================================================
  // SERVER-BACKED SESSION AUTHENTICATION
  // =========================================================================
  function showAuthGate(errorText = '') {
    const gate = document.getElementById('adminAuthGate');
    const errEl = document.getElementById('authErrorMsg');
    if (gate) gate.style.display = 'flex';
    if (errEl) {
      if (errorText) {
        errEl.textContent = errorText;
        errEl.style.display = 'block';
      } else {
        errEl.style.display = 'none';
      }
    }
  }

  function hideAuthGate() {
    const gate = document.getElementById('adminAuthGate');
    const errEl = document.getElementById('authErrorMsg');
    if (gate) gate.style.display = 'none';
    if (errEl) errEl.style.display = 'none';
  }

  function applyStudentLinks(studentUrl) {
    if (!studentUrl) return;
    const links = ['sidebarStudentLink', 'authReturnStudentLink'];
    links.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.href = studentUrl;
    });
  }

  async function checkSession() {
    try {
      const res = await fetch('/api/admin/session', { credentials: 'same-origin' });
      if (!res.ok) {
        showAuthGate('');
        return false;
      }
      const data = await res.json();
      if (data.studentUrl) applyStudentLinks(data.studentUrl);
      const badgeEl = document.getElementById('adminOriginBadge');
      if (badgeEl && data.adminPort) {
        badgeEl.textContent = `ISOLATED ADMIN • PORT ${data.adminPort}`;
      }

      if (data.authenticated) {
        hideAuthGate();
        if (!dashboardInitialized) {
          dashboardInitialized = true;
          initDashboard();
        }
        return true;
      }
    } catch (e) {
      showAuthGate('Could not reach Admin authentication server.');
      return false;
    }
    showAuthGate('');
    return false;
  }

  async function submitLogin(passphrase) {
    const btn = document.getElementById('btnUnlockAdmin');
    const pass = (passphrase || '').trim();
    if (!pass) {
      showAuthGate('Please enter the admin passphrase.');
      return false;
    }
    if (btn) btn.disabled = true;

    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passphrase: pass })
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        document.getElementById('authPassInput').value = '';
        hideAuthGate();
        if (data.studentUrl) applyStudentLinks(data.studentUrl);
        showToast('Authenticated successfully', 'success');
        if (!dashboardInitialized) {
          dashboardInitialized = true;
          initDashboard();
        }
        return true;
      } else {
        showAuthGate(data.error || 'Authentication failed.');
        return false;
      }
    } catch (e) {
      showAuthGate('Connection error while verifying passphrase.');
      return false;
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  async function lockConsole() {
    try {
      await fetch('/api/admin/logout', { method: 'POST', credentials: 'same-origin' });
    } catch (e) {}
    dashboardInitialized = false;
    showAuthGate('');
    showToast('Console locked', 'info');
  }

  // =========================================================================
  // SQLITE WASM DATABASE INITIALIZATION & HIERARCHY HELPERS
  // =========================================================================
  async function initDatabase() {
    try {
      if (typeof window.initSqlJs !== 'function') {
        throw new Error('sql.js WASM engine script not loaded');
      }

      SQL_ENGINE = await window.initSqlJs({
        locateFile: file => `js/${file}`
      });

      let uInt8Array = null;
      try {
        const res = await fetch('/questionary.db', { credentials: 'same-origin' });
        if (res.status === 401) {
          showAuthGate('Session expired. Please sign in again.');
          return false;
        }
        if (res.ok) {
          const buffer = await res.arrayBuffer();
          uInt8Array = new Uint8Array(buffer);
        }
      } catch (e) {
        console.warn('Could not fetch /questionary.db, creating fresh DB:', e);
      }

      db = (uInt8Array && uInt8Array.length > 0)
        ? new SQL_ENGINE.Database(uInt8Array)
        : new SQL_ENGINE.Database();

      db.run(`
        CREATE TABLE IF NOT EXISTS nodes (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          parent_id INTEGER,
          name TEXT NOT NULL,
          is_folder INTEGER DEFAULT 1,
          file_path TEXT
        );
      `);

      const countRes = db.exec('SELECT count(*) as total FROM nodes');
      const count = (countRes[0] && countRes[0].values[0][0]) || 0;
      if (count === 0) {
        seedInitialNodes();
      }

      await loadNodesFromDb();
      showToast('SQLite database ready', 'success');
      return true;
    } catch (err) {
      console.error('Failed to init SQLite engine:', err);
      showToast('SQLite Init error: ' + err.message, 'error');
      return false;
    }
  }

  function seedInitialNodes() {
    const starterNodes = [
      [null, '2025-26', 1, '#'],
      [null, 'Study Materials', 1, '#'],
      [1, 'Class 10', 1, '#'],
      [3, 'Pre-Board', 1, '#']
    ];
    const stmt = db.prepare('INSERT INTO nodes (parent_id, name, is_folder, file_path) VALUES (?, ?, ?, ?)');
    for (const n of starterNodes) stmt.run(n);
    stmt.free();
  }

  function buildNodeBreadcrumb(parentId) {
    if (parentId === null || parentId === undefined) return 'Root';
    const parts = [];
    let cur = nodeById.get(parentId);
    const seen = new Set();
    while (cur && !seen.has(cur.id)) {
      seen.add(cur.id);
      parts.unshift(cur.name);
      cur = cur.parent_id !== null && cur.parent_id !== undefined ? nodeById.get(cur.parent_id) : null;
    }
    return parts.length ? parts.join(' / ') : `#${parentId}`;
  }

  async function loadNodesFromDb() {
    if (!db) return;
    try {
      const res = db.exec('SELECT * FROM nodes ORDER BY id ASC');
      if (res && res[0]) {
        const cols = res[0].columns;
        allNodes = res[0].values.map(row => {
          const item = {};
          cols.forEach((col, i) => item[col] = row[i]);
          return item;
        });
      } else {
        allNodes = [];
      }

      nodeById = new Map();
      allNodes.forEach(n => nodeById.set(n.id, n));

      const statEl = document.getElementById('statTotalNodes');
      if (statEl) statEl.textContent = allNodes.length;

      populateEasyPdfFolderSelects();
      renderNodesTable();
      renderDashboardRecentNodes();
    } catch (e) {
      console.error('Error querying nodes:', e);
    }
  }

  function renderNodesTable() {
    const tbody = document.getElementById('adminNodesTbody');
    if (!tbody) return;

    const query = (document.getElementById('nodeSearchInput')?.value || '').trim().toLowerCase();
    const typeFilter = document.getElementById('nodeTypeFilter')?.value || 'all';

    let filtered = allNodes;
    if (typeFilter === 'folder') {
      filtered = filtered.filter(n => n.is_folder === 1);
    } else if (typeFilter === 'document') {
      filtered = filtered.filter(n => n.is_folder === 0);
    }

    if (query) {
      filtered = filtered.filter(n => {
        const crumb = buildNodeBreadcrumb(n.parent_id).toLowerCase();
        return (
          String(n.id).includes(query) ||
          (n.name && n.name.toLowerCase().includes(query)) ||
          (n.file_path && n.file_path.toLowerCase().includes(query)) ||
          crumb.includes(query)
        );
      });
    }

    if (filtered.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding: 2rem; color: var(--fg-muted);">No records found matching filters.</td></tr>';
      return;
    }

    const displayList = filtered.slice(0, 400);
    tbody.innerHTML = displayList.map(n => {
      const folderPath = buildNodeBreadcrumb(n.parent_id);
      return `
        <tr>
          <td><code>#${n.id}</code></td>
          <td><strong>${escapeHtml(n.name)}</strong></td>
          <td style="font-size:0.75rem; color:var(--fg-secondary);">${escapeHtml(folderPath)}</td>
          <td>
            <span class="type-pill ${n.is_folder ? 'folder' : 'doc'}">
              <i class="fas fa-${n.is_folder ? 'folder' : 'file-pdf'}"></i>
              ${n.is_folder ? 'Folder' : 'Document'}
            </span>
          </td>
          <td style="font-family:'JetBrains Mono',monospace; font-size:0.75rem; color:var(--fg-secondary); max-width:240px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
            ${escapeHtml(n.file_path || '#')}
          </td>
          <td style="text-align:right;">
            <button class="btn-icon" onclick="AdminApp.openEditNodeModal(${n.id})" title="Edit Node">
              <i class="fas fa-edit"></i>
            </button>
            <button class="btn-icon delete" onclick="AdminApp.deleteNode(${n.id})" title="Delete Node">
              <i class="fas fa-trash"></i>
            </button>
          </td>
        </tr>
      `;
    }).join('');
  }

  function renderDashboardRecentNodes() {
    const tbody = document.getElementById('dashboardRecentNodesBody');
    if (!tbody) return;

    const recent = allNodes.slice(-5).reverse();
    if (recent.length === 0) {
      tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding: 1.5rem; color: var(--fg-muted);">No records in database.</td></tr>';
      return;
    }

    tbody.innerHTML = recent.map(n => `
      <tr>
        <td><code>#${n.id}</code></td>
        <td><strong>${escapeHtml(n.name)}</strong></td>
        <td>
          <span class="type-pill ${n.is_folder ? 'folder' : 'doc'}" style="font-size:0.65rem;">
            ${n.is_folder ? 'Folder' : 'Doc'}
          </span>
        </td>
        <td style="font-family:'JetBrains Mono',monospace; font-size:0.72rem; color:var(--fg-secondary);">
          ${escapeHtml(n.file_path || '#')}
        </td>
      </tr>
    `).join('');
  }

  // =========================================================================
  // EASY PDF IMPORTER & AUTO-FOLDER BUILDER
  // =========================================================================
  function populateEasyPdfFolderSelects() {
    const yearSel = document.getElementById('easyPdfYearSelect');
    if (!yearSel) return;

    const rootFolders = allNodes
      .filter(n => n.is_folder === 1 && (n.parent_id === null || n.parent_id === undefined))
      .map(n => n.name);

    const defaults = ['2025-26', '2024-25', '2023-24', '2022-23', '2021-22', '2020-21', 'Study Materials'];
    const merged = Array.from(new Set([...rootFolders, ...defaults]));
    yearSel.innerHTML = merged.map(y => `<option value="${escapeHtml(y)}">${escapeHtml(y)}</option>`).join('');
  }

  function suggestPaperDisplayName(filename) {
    return filename
      .replace(/\.pdf$/i, '')
      .replace(/_/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function autoDetectMetadataFromFiles(files) {
    if (!files || !files.length) return;
    const first = files[0].name || '';
    const yearMatch = first.match(/(20\d{2}-\d{2})/);
    if (yearMatch) {
      const sel = document.getElementById('easyPdfYearSelect');
      if (sel && Array.from(sel.options).some(o => o.value === yearMatch[1])) {
        sel.value = yearMatch[1];
      } else {
        const newInput = document.getElementById('easyPdfYearNew');
        if (newInput) newInput.value = yearMatch[1];
      }
    } else if (/study[_\s-]?material/i.test(first)) {
      const sel = document.getElementById('easyPdfYearSelect');
      if (sel) sel.value = 'Study Materials';
    }

    if (/CL[_\s.-]?10|CLASS[_\s.-]?10|CLASS\s?X|GRADE\s?X/i.test(first)) {
      const classSel = document.getElementById('easyPdfClassSelect');
      if (classSel) classSel.value = 'Class 10';
    } else if (/CL[_\s.-]?9|CLASS[_\s.-]?9|CLASS\s?IX/i.test(first)) {
      const classSel = document.getElementById('easyPdfClassSelect');
      if (classSel) classSel.value = 'Class 9';
    }

    const upper = first.toUpperCase();
    const examSel = document.getElementById('easyPdfExamSelect');
    if (examSel) {
      if (upper.includes('PREBOARD') || upper.includes('PRE BOARD') || upper.includes('_PB_')) examSel.value = 'Pre-Board';
      else if (upper.includes('_FT_') || upper.includes('FINAL')) examSel.value = 'Final Term';
      else if (upper.includes('_HY_') || upper.includes('HALF')) examSel.value = 'Half Yearly';
      else if (upper.includes('MT_1') || upper.includes('MT1') || upper.includes('MT 1')) examSel.value = 'Mid Term 1';
      else if (upper.includes('MT_2') || upper.includes('MT2') || upper.includes('MT 2')) examSel.value = 'Mid Term 2';
      else if (upper.includes('STUDY_MATERIAL')) examSel.value = 'Study Material';
    }
  }

  function renderEasyPdfQueue() {
    const listEl = document.getElementById('easyPdfFileList');
    const countEl = document.getElementById('easyPdfCount');
    if (countEl) countEl.textContent = String(pendingPdfUploads.length);
    if (!listEl) return;

    if (pendingPdfUploads.length === 0) {
      listEl.innerHTML = '<div style="text-align: center; padding: 1rem; color: var(--fg-muted); font-size: 0.8rem;">No PDFs selected yet.</div>';
      return;
    }

    listEl.innerHTML = pendingPdfUploads.map((item, idx) => `
      <div class="easy-pdf-item">
        <div style="display:flex; flex-direction:column; gap:4px;">
          <input type="text" class="form-input easy-pdf-title-input" data-idx="${idx}" value="${escapeHtml(item.displayName)}" placeholder="Display title in folder">
          <span style="font-size:0.7rem; color:var(--fg-muted);">File: <code>${escapeHtml(item.file.name)}</code> (${(item.file.size / 1024).toFixed(0)} KB)</span>
        </div>
        <button type="button" class="btn-icon delete" onclick="AdminApp.removePendingPdf(${idx})" title="Remove">
          <i class="fas fa-times"></i>
        </button>
      </div>
    `).join('');

    listEl.querySelectorAll('.easy-pdf-title-input').forEach(inp => {
      inp.addEventListener('input', (e) => {
        const idx = parseInt(e.target.getAttribute('data-idx'), 10);
        if (pendingPdfUploads[idx]) pendingPdfUploads[idx].displayName = e.target.value;
      });
    });
  }

  function queueEasyPdfFiles(fileList) {
    const files = Array.from(fileList || []).filter(f => /\.pdf$/i.test(f.name) || f.type === 'application/pdf');
    if (files.length === 0) {
      showToast('Please select valid .pdf files', 'error');
      return;
    }
    autoDetectMetadataFromFiles(files);
    files.forEach(file => {
      const alreadyQueued = pendingPdfUploads.some(
        p => p.file && p.file.name === file.name && p.file.size === file.size && p.file.lastModified === file.lastModified
      );
      if (!alreadyQueued) {
        pendingPdfUploads.push({
          file,
          displayName: suggestPaperDisplayName(file.name)
        });
      }
    });
    renderEasyPdfQueue();
  }

  function removePendingPdf(idx) {
    pendingPdfUploads.splice(idx, 1);
    renderEasyPdfQueue();
  }

  function openEasyPdfModal() {
    pendingPdfUploads = [];
    const fileInput = document.getElementById('easyPdfFileInput');
    if (fileInput) fileInput.value = '';
    const yrNew = document.getElementById('easyPdfYearNew');
    const clNew = document.getElementById('easyPdfClassNew');
    const exNew = document.getElementById('easyPdfExamNew');
    if (yrNew) yrNew.value = '';
    if (clNew) clNew.value = '';
    if (exNew) exNew.value = '';
    populateEasyPdfFolderSelects();
    renderEasyPdfQueue();
    openModal('easyPdfModal');
  }

  function findOrCreateFolderNode(parentId, folderName) {
    const cleanName = String(folderName || '').trim();
    if (!cleanName) return parentId;

    const existing = allNodes.find(n =>
      n.is_folder === 1 &&
      (parentId === null ? (n.parent_id === null || n.parent_id === undefined) : n.parent_id === parentId) &&
      String(n.name || '').toLowerCase() === cleanName.toLowerCase()
    );
    if (existing) return existing.id;

    db.run(
      'INSERT INTO nodes (parent_id, name, is_folder, file_path) VALUES (?, ?, 1, ?)',
      [parentId, cleanName, '#']
    );
    const idRes = db.exec('SELECT last_insert_rowid() AS id');
    const newId = idRes[0].values[0][0];
    const newNode = { id: newId, parent_id: parentId, name: cleanName, is_folder: 1, file_path: '#' };
    allNodes.push(newNode);
    nodeById.set(newId, newNode);
    return newId;
  }

  function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(reader.error || new Error('File read error'));
      reader.readAsDataURL(file);
    });
  }

  async function submitEasyPdfs() {
    if (!db) {
      showToast('SQLite database not ready yet', 'error');
      return;
    }
    if (pendingPdfUploads.length === 0) {
      showToast('Select at least one PDF file first', 'error');
      return;
    }

    const yearFolder = (document.getElementById('easyPdfYearNew')?.value || '').trim() ||
                       document.getElementById('easyPdfYearSelect')?.value || '2025-26';
    const classFolder = (document.getElementById('easyPdfClassNew')?.value || '').trim() ||
                        document.getElementById('easyPdfClassSelect')?.value || '';
    const examFolder = (document.getElementById('easyPdfExamNew')?.value || '').trim() ||
                       document.getElementById('easyPdfExamSelect')?.value || '';
    const hdCopy = Boolean(document.getElementById('easyPdfHdCheck')?.checked);

    const submitBtn = document.getElementById('btnSubmitEasyPdfs');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Uploading...';
    }

    try {
      // Build/find folder hierarchy: Year -> Class (optional) -> Exam (optional)
      let targetParentId = findOrCreateFolderNode(null, yearFolder);
      if (classFolder) {
        targetParentId = findOrCreateFolderNode(targetParentId, classFolder);
      }
      if (examFolder && examFolder.toLowerCase() !== yearFolder.toLowerCase()) {
        targetParentId = findOrCreateFolderNode(targetParentId, examFolder);
      }

      let uploadedCount = 0;
      for (const item of pendingPdfUploads) {
        const base64 = await fileToBase64(item.file);
        const res = await fetch('/api/admin/upload-pdf', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            filename: item.file.name,
            base64,
            quality: hdCopy ? 'hd' : 'sd'
          })
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.success) {
          throw new Error(data.error || `Upload failed for ${item.file.name}`);
        }

        const safeFilePath = `documents/${data.filename}`;
        const existingDoc = allNodes.find(n =>
          n.is_folder === 0 &&
          n.parent_id === targetParentId &&
          n.file_path === safeFilePath
        );
        const title = (item.displayName || '').trim() || suggestPaperDisplayName(data.filename);

        if (existingDoc) {
          db.run('UPDATE nodes SET name = ?, file_path = ? WHERE id = ?', [title, safeFilePath, existingDoc.id]);
        } else {
          db.run(
            'INSERT INTO nodes (parent_id, name, is_folder, file_path) VALUES (?, ?, 0, ?)',
            [targetParentId, title, safeFilePath]
          );
        }
        uploadedCount++;
      }

      await loadNodesFromDb();
      await persistDbToServer(true);
      await loadDocumentLibrary();
      closeModal('easyPdfModal');
      showToast(`Added ${uploadedCount} PDF(s) to ${buildNodeBreadcrumb(targetParentId)}. Click "Download database.db" to export!`, 'success');
    } catch (err) {
      showToast(err.message || 'Failed to upload PDFs', 'error');
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i class="fas fa-check"></i> Upload & Add to Database';
      }
    }
  }

  // =========================================================================
  // ADD / EDIT / DELETE NODES + IMPORT / DOWNLOAD database.db
  // =========================================================================
  function openAddNodeModal() {
    document.getElementById('nodeModalTitle').textContent = 'Add New SQLite Node';
    document.getElementById('nodeEditId').value = '';
    document.getElementById('nodeNameInput').value = '';
    document.getElementById('nodeParentIdInput').value = '';
    document.getElementById('nodeIsFolderSelect').value = '1';
    document.getElementById('nodeFilePathInput').value = '#';
    openModal('nodeModal');
  }

  function openEditNodeModal(nodeId) {
    const node = allNodes.find(n => n.id === nodeId);
    if (!node) return;

    document.getElementById('nodeModalTitle').textContent = `Edit SQLite Node #${node.id}`;
    document.getElementById('nodeEditId').value = node.id;
    document.getElementById('nodeNameInput').value = node.name || '';
    document.getElementById('nodeParentIdInput').value = node.parent_id !== null ? node.parent_id : '';
    document.getElementById('nodeIsFolderSelect').value = node.is_folder ? '1' : '0';
    document.getElementById('nodeFilePathInput').value = node.file_path || '#';
    openModal('nodeModal');
  }

  function saveNodeSubmit() {
    if (!db) {
      showToast('Database engine not initialized', 'error');
      return;
    }

    const editIdStr = document.getElementById('nodeEditId')?.value;
    const name = document.getElementById('nodeNameInput')?.value.trim();
    const parentIdStr = document.getElementById('nodeParentIdInput')?.value.trim();
    const isFolder = parseInt(document.getElementById('nodeIsFolderSelect')?.value || '1', 10);
    const filePath = document.getElementById('nodeFilePathInput')?.value.trim() || '#';

    if (!name) {
      showToast('Node title is required', 'error');
      return;
    }

    const parentId = parentIdStr.length > 0 ? parseInt(parentIdStr, 10) : null;

    try {
      if (editIdStr) {
        const id = parseInt(editIdStr, 10);
        db.run(
          'UPDATE nodes SET parent_id = ?, name = ?, is_folder = ?, file_path = ? WHERE id = ?',
          [parentId, name, isFolder, filePath, id]
        );
        showToast(`Node #${id} updated successfully`, 'success');
      } else {
        db.run(
          'INSERT INTO nodes (parent_id, name, is_folder, file_path) VALUES (?, ?, ?, ?)',
          [parentId, name, isFolder, filePath]
        );
        showToast(`Node "${name}" created`, 'success');
      }

      closeModal('nodeModal');
      loadNodesFromDb();
      persistDbToServer(true);
    } catch (err) {
      showToast('SQLite Error: ' + err.message, 'error');
    }
  }

  function deleteNode(nodeId) {
    if (!confirm(`Permanently delete Node #${nodeId} from SQLite?`)) return;
    try {
      db.run('DELETE FROM nodes WHERE id = ?', [nodeId]);
      showToast(`Node #${nodeId} deleted`, 'info');
      loadNodesFromDb();
      persistDbToServer(true);
    } catch (err) {
      showToast('Delete failed: ' + err.message, 'error');
    }
  }

  async function importDbFile(file) {
    if (!file || !SQL_ENGINE) return;
    try {
      const buf = await file.arrayBuffer();
      const uint8 = new Uint8Array(buf);
      const testDb = new SQL_ENGINE.Database(uint8);
      // Ensure valid nodes table exists
      testDb.exec('SELECT id, parent_id, name, is_folder, file_path FROM nodes LIMIT 1');
      if (db) db.close();
      db = testDb;
      await loadNodesFromDb();
      await persistDbToServer(true);
      showToast(`Imported "${file.name}" successfully (${allNodes.length} nodes)`, 'success');
    } catch (err) {
      showToast('Invalid database file: ' + err.message, 'error');
    }
  }

  function exportDbFile(filename = 'questionary.db') {
    if (!db) {
      showToast('Database is not initialized', 'error');
      return;
    }
    const binary = db.export();
    const blob = new Blob([binary], { type: 'application/x-sqlite3' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    showToast(`Downloaded ${filename} (${(binary.length / 1024).toFixed(1)} KB)`, 'success');
  }

  async function persistDbToServer(silent = false) {
    if (!db) return;
    try {
      const binary = db.export();
      const res = await fetch('/api/admin/save-db', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: binary
      });
      if (res.status === 401) {
        showAuthGate('Session expired. Please sign in again.');
        return;
      }
      const data = await res.json();
      if (data.success) {
        if (!silent) showToast(`questionary.db saved to server disk (${data.size} bytes)`, 'success');
        updateSystemStats();
      } else {
        if (!silent) showToast('Sync failed: ' + (data.error || 'Unknown error'), 'error');
      }
    } catch (e) {
      if (!silent) showToast('Server sync error: ' + e.message, 'error');
    }
  }

  // =========================================================================
  // SQL STUDIO
  // =========================================================================
  function runQuery() {
    const sqlText = (document.getElementById('sqlQueryTextarea')?.value || '').trim();
    const statusBox = document.getElementById('sqlExecutionStatus');
    const resultsContainer = document.getElementById('sqlResultsContainer');

    if (!sqlText || !resultsContainer) return;
    if (!db) {
      showToast('SQLite Database not initialized', 'error');
      return;
    }

    const t0 = performance.now();
    try {
      const upper = sqlText.toUpperCase();
      const isSelect = upper.startsWith('SELECT') || upper.startsWith('EXPLAIN') || upper.startsWith('PRAGMA');

      if (isSelect) {
        const res = db.exec(sqlText);
        const elapsed = (performance.now() - t0).toFixed(2);

        if (!res || res.length === 0) {
          statusBox.innerHTML = `<span style="color:var(--fg-secondary);"><i class="fas fa-check"></i> Executed in ${elapsed}ms. 0 rows returned.</span>`;
          resultsContainer.innerHTML = '<div style="text-align:center; padding: 2rem; color: var(--fg-muted);">Query returned 0 rows.</div>';
          lastSqlResults = null;
          return;
        }

        const cols = res[0].columns;
        const rows = res[0].values;
        lastSqlResults = { cols, rows };
        statusBox.innerHTML = `<span style="color:var(--success);"><i class="fas fa-check-circle"></i> Returned ${rows.length} rows in ${elapsed}ms</span>`;
        resultsContainer.innerHTML = `
          <table class="admin-table">
            <thead>
              <tr>${cols.map(c => `<th>${escapeHtml(c)}</th>`).join('')}</tr>
            </thead>
            <tbody>
              ${rows.map(row => `<tr>${row.map(val => `<td>${escapeHtml(String(val !== null ? val : 'NULL'))}</td>`).join('')}</tr>`).join('')}
            </tbody>
          </table>
        `;
      } else {
        db.run(sqlText);
        const elapsed = (performance.now() - t0).toFixed(2);
        statusBox.innerHTML = `<span style="color:var(--success);"><i class="fas fa-check-circle"></i> Statement executed in ${elapsed}ms.</span>`;
        resultsContainer.innerHTML = '<div style="padding:1.5rem; color:var(--success); font-size:0.85rem;"><i class="fas fa-check"></i> Database updated.</div>';
        lastSqlResults = null;
        loadNodesFromDb();
        persistDbToServer(true);
      }
    } catch (err) {
      const elapsed = (performance.now() - t0).toFixed(2);
      statusBox.innerHTML = `<span style="color:var(--danger);"><i class="fas fa-exclamation-circle"></i> Error in ${elapsed}ms</span>`;
      resultsContainer.innerHTML = `<div style="padding:1.5rem; color:var(--danger); font-size:0.85rem;"><strong>SQL Error:</strong> ${escapeHtml(err.message)}</div>`;
    }
  }

  function exportSqlResultsCsv() {
    if (!lastSqlResults || !lastSqlResults.rows.length) {
      showToast('No active query results to export', 'error');
      return;
    }

    const { cols, rows } = lastSqlResults;
    let csv = cols.map(c => `"${c.replace(/"/g, '""')}"`).join(',') + '\n';
    rows.forEach(r => {
      csv += r.map(v => `"${String(v !== null ? v : '').replace(/"/g, '""')}"`).join(',') + '\n';
    });

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sql-query-${Date.now()}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    showToast('Query results exported to CSV', 'success');
  }

  function insertSqlPreset(sql) {
    const area = document.getElementById('sqlQueryTextarea');
    if (area) {
      area.value = sql;
      runQuery();
    }
  }

  // =========================================================================
  // ANNOUNCEMENTS & UPDATES BROADCASTER
  // =========================================================================
  async function loadAnnouncements() {
    try {
      const res = await fetch('/api/admin/announcements', { credentials: 'same-origin' });
      if (res.ok) {
        announcements = await res.json();
      } else {
        announcements = [];
      }
    } catch (e) {
      announcements = [];
    }

    const statCount = document.getElementById('statTotalAnnouncements');
    const pubCount = document.getElementById('publishedCount');
    if (statCount) statCount.textContent = announcements.length;
    if (pubCount) pubCount.textContent = announcements.length;
    renderPublishedAnnouncements();
    renderDashboardBroadcasts();
  }

  async function saveAnnouncements() {
    const res = await fetch('/api/admin/announcements', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(announcements)
    });
    if (!res.ok) throw new Error('Failed saving announcements');
  }

  function renderPublishedAnnouncements() {
    const container = document.getElementById('publishedPostsList');
    if (!container) return;

    if (announcements.length === 0) {
      container.innerHTML = '<div style="text-align:center; padding: 2rem; color: var(--fg-muted);">No published announcements yet.</div>';
      return;
    }

    container.innerHTML = announcements.map(post => `
      <div style="background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius-md); padding: 12px 14px; display: flex; flex-direction: column; gap: 6px;">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <span class="type-pill folder" style="font-size:0.68rem;">${escapeHtml(post.category)}</span>
          <div style="display: flex; gap: 6px;">
            <button class="btn-icon" onclick="AdminApp.previewPost('${escapeHtml(post.id)}')" title="Preview"><i class="fas fa-eye"></i></button>
            <button class="btn-icon delete" onclick="AdminApp.deletePost('${escapeHtml(post.id)}')" title="Delete"><i class="fas fa-trash"></i></button>
          </div>
        </div>
        <strong style="font-size: 0.88rem; color: var(--fg-primary);">${escapeHtml(post.title)}</strong>
        <p style="font-size: 0.76rem; color: var(--fg-secondary); margin: 0; line-height: 1.4;">${escapeHtml(post.excerpt || (post.content ? post.content.substring(0, 90) : ''))}</p>
        <div style="display: flex; gap: 10px; font-size: 0.7rem; color: var(--fg-muted); margin-top: 4px;">
          <span><i class="fas fa-tag"></i> ${escapeHtml(post.version || 'v2.4.0')}</span>
          <span><i class="fas fa-user"></i> ${escapeHtml(post.author || 'Admin')}</span>
          <span><i class="fas fa-calendar"></i> ${new Date(post.date).toLocaleDateString()}</span>
        </div>
      </div>
    `).join('');
  }

  function renderDashboardBroadcasts() {
    const container = document.getElementById('dashboardBroadcastsList');
    if (!container) return;

    const list = announcements.slice(0, 3);
    if (list.length === 0) {
      container.innerHTML = '<div style="text-align:center; padding: 1.5rem; color: var(--fg-muted);">No active broadcasts.</div>';
      return;
    }

    container.innerHTML = list.map(p => `
      <div style="padding: 10px 12px; background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius-sm);">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
          <span class="type-pill folder" style="font-size:0.65rem;">${escapeHtml(p.category)}</span>
          <span style="font-size:0.7rem; color:var(--fg-muted);">${new Date(p.date).toLocaleDateString()}</span>
        </div>
        <div style="font-weight: 700; font-size: 0.82rem;">${escapeHtml(p.title)}</div>
        <div style="font-size: 0.74rem; color: var(--fg-secondary); margin-top: 3px;">${escapeHtml(p.excerpt || '')}</div>
      </div>
    `).join('');
  }

  async function publishPost() {
    const title = document.getElementById('postTitleInput')?.value.trim();
    const category = document.getElementById('postCategorySelect')?.value || 'Feature Update';
    const version = document.getElementById('postVersionInput')?.value.trim() || 'v2.4.0';
    const excerpt = document.getElementById('postExcerptInput')?.value.trim() || '';
    const content = document.getElementById('postContentInput')?.value.trim();

    if (!title || !content) {
      showToast('Title and content body are required', 'error');
      return;
    }

    const postId = 'update_' + Date.now();
    announcements.unshift({
      id: postId,
      title,
      category,
      version,
      author: 'Questionary Admin',
      date: Date.now(),
      excerpt: excerpt || content.substring(0, 100),
      content
    });

    try {
      await saveAnnouncements();
      document.getElementById('postTitleInput').value = '';
      document.getElementById('postExcerptInput').value = '';
      document.getElementById('postContentInput').value = '';
      await loadAnnouncements();
      showToast('Announcement saved to broadcast feed', 'success');
    } catch (e) {
      showToast(e.message, 'error');
    }
  }

  async function deletePost(postId) {
    if (!confirm('Are you sure you want to delete this broadcast?')) return;
    announcements = announcements.filter(p => p.id !== postId);
    try {
      await saveAnnouncements();
      await loadAnnouncements();
      showToast('Broadcast removed', 'info');
    } catch (e) {
      showToast(e.message, 'error');
    }
  }

  function previewPost(postId) {
    const post = announcements.find(p => p.id === postId);
    if (!post) return;

    document.getElementById('prevPostTitle').textContent = post.title;
    document.getElementById('prevPostCategory').textContent = post.category;

    const rawRendered = escapeHtml(post.content || '')
      .replace(/^### (.*$)/gim, '<h3 style="color:var(--accent); margin-top:14px; margin-bottom:6px;">$1</h3>')
      .replace(/^## (.*$)/gim, '<h2 style="color:var(--accent); margin-top:18px; margin-bottom:8px;">$1</h2>')
      .replace(/^# (.*$)/gim, '<h1 style="color:var(--accent); margin-top:20px;">$1</h1>')
      .replace(/\*\*(.*?)\*\*/gim, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/gim, '<em>$1</em>')
      .replace(/```([\s\S]*?)```/gim, '<pre style="background:rgba(0,0,0,0.4); padding:10px; border-radius:8px; overflow-x:auto;"><code>$1</code></pre>')
      .replace(/^\- (.*$)/gim, '<li style="margin-left:16px; margin-bottom:4px;">$1</li>')
      .replace(/\n/gim, '<br>');

    const rendered = (window.DOMPurify && typeof window.DOMPurify.sanitize === 'function')
      ? window.DOMPurify.sanitize(rawRendered)
      : rawRendered;
    document.getElementById('prevPostBody').innerHTML = rendered;
    openModal('postPreviewModal');
  }

  // =========================================================================
  // DOCUMENT LIBRARY & SYSTEM STATS
  // =========================================================================
  async function loadDocumentLibrary() {
    try {
      const res = await fetch('/api/admin/documents', { credentials: 'same-origin' });
      if (res.ok) {
        const data = await res.json();
        indexedPapers = data.documents || [];
        const totalEl = document.getElementById('statTotalPapers');
        if (totalEl) totalEl.textContent = indexedPapers.length;
        renderDocumentLibraryTable();
      }
    } catch (e) {
      console.warn('Error fetching indexed papers:', e);
    }
  }

  function renderDocumentLibraryTable() {
    const tbody = document.getElementById('docLibTbody');
    if (!tbody) return;

    const query = (document.getElementById('docLibSearchInput')?.value || '').trim().toLowerCase();
    let filtered = indexedPapers;
    if (query) {
      filtered = filtered.filter(p =>
        (p.title && p.title.toLowerCase().includes(query)) ||
        (p.subject && p.subject.toLowerCase().includes(query)) ||
        (p.filename && p.filename.toLowerCase().includes(query)) ||
        (p.examType && p.examType.toLowerCase().includes(query))
      );
    }

    if (filtered.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding: 2rem; color: var(--fg-muted);">No documents match query.</td></tr>';
      return;
    }

    tbody.innerHTML = filtered.slice(0, 120).map(p => `
      <tr>
        <td><code>Class ${escapeHtml(p.classNum)}</code></td>
        <td><strong>${escapeHtml(p.subject)}</strong></td>
        <td><span class="type-pill doc">${escapeHtml(p.examType)}</span></td>
        <td><code>${escapeHtml(p.year)}</code></td>
        <td style="font-family:'JetBrains Mono',monospace; font-size:0.72rem; color:var(--fg-secondary); max-width:240px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
          ${escapeHtml(p.filename)}
        </td>
        <td>${p.hasHD ? '<span style="color:var(--success); font-weight:700;"><i class="fas fa-check"></i> HD</span>' : '<span style="color:var(--fg-muted);">SD</span>'}</td>
        <td>
          <a href="${escapeHtml(p.path)}" target="_blank" rel="noopener noreferrer" class="btn btn-secondary btn-sm" style="padding: 3px 8px; font-size: 0.7rem;">
            <i class="fas fa-external-link-alt"></i> View PDF
          </a>
        </td>
      </tr>
    `).join('');
  }

  async function updateSystemStats() {
    try {
      const res = await fetch('/api/admin/system-stats', { credentials: 'same-origin' });
      if (res.ok) {
        const stats = await res.json();
        const kbSize = (stats.dbSize / 1024).toFixed(1);
        const dbSizeEl = document.getElementById('statDbSize');
        if (dbSizeEl) dbSizeEl.textContent = `${kbSize} KB`;

        const display = document.getElementById('systemStatsDisplay');
        if (display) {
          const hoursUptime = (stats.uptime / 3600).toFixed(2);
          const memMb = (stats.memoryUsage.rss / (1024 * 1024)).toFixed(1);
          display.innerHTML = `
            <div class="metric-card">
              <div class="metric-icon" style="background: rgba(59,130,246,0.15); color: var(--info);"><i class="fas fa-clock"></i></div>
              <div class="metric-info">
                <span class="metric-value">${hoursUptime}h</span>
                <span class="metric-label">Admin Server Uptime</span>
              </div>
            </div>
            <div class="metric-card">
              <div class="metric-icon" style="background: rgba(16,185,129,0.15); color: var(--success);"><i class="fas fa-memory"></i></div>
              <div class="metric-info">
                <span class="metric-value">${memMb} MB</span>
                <span class="metric-label">Node Memory RSS</span>
              </div>
            </div>
            <div class="metric-card">
              <div class="metric-icon" style="background: rgba(207,98,21,0.15); color: var(--accent);"><i class="fas fa-code-branch"></i></div>
              <div class="metric-info">
                <span class="metric-value">${escapeHtml(stats.nodeVersion)}</span>
                <span class="metric-label">Node Runtime</span>
              </div>
            </div>
            <div class="metric-card">
              <div class="metric-icon" style="background: rgba(245,158,11,0.15); color: var(--warning);"><i class="fas fa-database"></i></div>
              <div class="metric-info">
                <span class="metric-value">${kbSize} KB</span>
                <span class="metric-label">SQLite Catalog Size</span>
              </div>
            </div>
          `;
        }
      }
    } catch (e) {}
  }

  // =========================================================================
  // TAB NAVIGATION & MODALS
  // =========================================================================
  function switchTab(tabId) {
    currentTab = tabId;
    document.querySelectorAll('.tab-section').forEach(sec => sec.classList.remove('active'));
    document.querySelectorAll('.nav-link').forEach(link => link.classList.remove('active'));

    document.getElementById(`tab-${tabId}`)?.classList.add('active');
    document.querySelector(`.nav-link[data-tab="${tabId}"]`)?.classList.add('active');

    const titles = {
      dashboard: 'System Dashboard',
      database: 'SQLite Database & Easy PDF Editor',
      sql: 'Interactive SQL Studio & Schema Runner',
      announcements: 'Announcements & Updates Broadcast Center',
      documents: 'Indexed Question Papers Catalog',
      system: 'Isolated Admin Server Telemetry'
    };
    const titleEl = document.getElementById('currentTabTitle');
    if (titleEl) titleEl.textContent = titles[tabId] || 'Administration Portal';
  }

  function openModal(modalId) {
    document.getElementById(modalId)?.classList.add('active');
  }

  function closeModal(modalId) {
    document.getElementById(modalId)?.classList.remove('active');
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

  // =========================================================================
  // EVENT LISTENERS & BOOTSTRAP
  // =========================================================================
  function initDashboard() {
    initDatabase();
    loadAnnouncements();
    loadDocumentLibrary();
    updateSystemStats();
  }

  function bindEvents() {
    if (window._questionaryAdminEventsBound) return;
    window._questionaryAdminEventsBound = true;

    document.getElementById('adminAuthForm')?.addEventListener('submit', (e) => {
      e.preventDefault();
      submitLogin(document.getElementById('authPassInput')?.value);
    });
    document.getElementById('btnLockConsole')?.addEventListener('click', lockConsole);

    document.querySelectorAll('.sidebar-nav .nav-link').forEach(link => {
      link.addEventListener('click', () => {
        const tab = link.getAttribute('data-tab');
        if (tab) switchTab(tab);
      });
    });

    document.getElementById('btnRefreshTab')?.addEventListener('click', () => {
      loadNodesFromDb();
      loadAnnouncements();
      loadDocumentLibrary();
      updateSystemStats();
      showToast('All administrative modules refreshed', 'info');
    });

    document.getElementById('btnGlobalQuickAction')?.addEventListener('click', openEasyPdfModal);

    // Database Manager & Easy PDF Modal
    document.getElementById('nodeSearchInput')?.addEventListener('input', renderNodesTable);
    document.getElementById('nodeTypeFilter')?.addEventListener('change', renderNodesTable);
    document.getElementById('btnEasyAddPdf')?.addEventListener('click', openEasyPdfModal);
    document.getElementById('btnEasyAddPdfDocsTab')?.addEventListener('click', openEasyPdfModal);
    document.getElementById('btnAddNodeModalBtn')?.addEventListener('click', openAddNodeModal);
    document.getElementById('btnSaveNodeSubmit')?.addEventListener('click', saveNodeSubmit);
    document.getElementById('btnDownloadDatabaseDb')?.addEventListener('click', () => exportDbFile('database.db'));
    document.getElementById('btnExportDbFile')?.addEventListener('click', () => exportDbFile('questionary.db'));
    document.getElementById('btnPersistDbToServer')?.addEventListener('click', () => persistDbToServer(false));
    document.getElementById('importDbInput')?.addEventListener('change', (e) => {
      const f = e.target.files?.[0];
      if (f) importDbFile(f);
      e.target.value = '';
    });

    const dropZone = document.getElementById('easyPdfDropZone');
    const pdfInput = document.getElementById('easyPdfFileInput');
    if (dropZone && pdfInput) {
      dropZone.addEventListener('click', () => pdfInput.click());
      dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropZone.classList.add('dragover');
      });
      dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
      dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (e._easyPdfDropHandled) return;
        e._easyPdfDropHandled = true;
        dropZone.classList.remove('dragover');
        if (e.dataTransfer?.files?.length) queueEasyPdfFiles(e.dataTransfer.files);
      });
      pdfInput.addEventListener('change', (e) => {
        if (e.target.files?.length) queueEasyPdfFiles(e.target.files);
        e.target.value = '';
      });
    }
    document.getElementById('btnSubmitEasyPdfs')?.addEventListener('click', submitEasyPdfs);

    // SQL Studio
    document.getElementById('btnRunQuery')?.addEventListener('click', runQuery);
    document.getElementById('sqlQueryTextarea')?.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        runQuery();
      }
    });
    document.getElementById('btnExportSqlCsv')?.addEventListener('click', exportSqlResultsCsv);

    // Announcements & Doc Search
    document.getElementById('btnPublishPost')?.addEventListener('click', publishPost);
    document.getElementById('docLibSearchInput')?.addEventListener('input', renderDocumentLibraryTable);
  }

  window.AdminApp = {
    switchTab,
    openEasyPdfModal,
    removePendingPdf,
    openAddNodeModal,
    openEditNodeModal,
    deleteNode,
    saveNodeSubmit,
    closeModal,
    openModal,
    exportDbFile,
    persistDbToServer,
    runQuery,
    exportSqlResultsCsv,
    insertSqlPreset,
    publishPost,
    deletePost,
    previewPost
  };

  document.addEventListener('DOMContentLoaded', () => {
    bindEvents();
    checkSession();
  });
})();
