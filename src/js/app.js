let currentUser = null;
let path = [];
let currentView = 'home';
let editMode = false;
let favorites = [];
let notes = [];
let flashcardDecks = [];
let studySessions = [];
let documentProgress = {};
let quickLinks = [];
let studyStats = { totalTime: 0, streak: 0, lastStudyDate: null, hourlyActivity: {} };
let currentCalendarDate = new Date();
let currentEditingNote = null;
let currentEditingDeck = null;
let currentStudyDeck = null;
let currentCardIndex = 0;
let accessibilitySettings = {
  highContrast: localStorage.getItem('accessibility-high-contrast') === 'true',
  largeText: localStorage.getItem('accessibility-large-text') === 'true',
  reducedMotion: localStorage.getItem('accessibility-reduced-motion') === 'true',
  enhancedFocus: localStorage.getItem('accessibility-enhanced-focus') === 'true'
};




async function initializeFavorites() {
  try {
    
    if (window.__TAURI__) {
      const loaded = await loadFavoritesFromTauri();
      if (loaded) return;
    }
    
    favorites = JSON.parse(localStorage.getItem('questionary-favorites') || '[]');
  } catch (e) {
    console.error('Error loading favorites:', e);
    favorites = [];
  }
}


async function saveFavorites() {
  try {
    
    localStorage.setItem('questionary-favorites', JSON.stringify(favorites));
    
    
    if (window.__TAURI__) {
      await saveFavoritesToTauri();
    }
  } catch (e) {
    console.error('Error saving favorites:', e);
  }
}


async function loadFavoritesFromTauri() {
  try {
    const { readTextFile, BaseDirectory } = window.__TAURI__.fs || {};
    const { appDataDir } = window.__TAURI__.path || {};
    
    if (readTextFile && appDataDir) {
      const data = await readTextFile('favorites.json', { dir: BaseDirectory.AppData });
      favorites = JSON.parse(data);
      
      localStorage.setItem('questionary-favorites', JSON.stringify(favorites));
      return true;
    }
  } catch (e) {
    
    console.log('Loading favorites from localStorage instead');
  }
  return false;
}

async function saveFavoritesToTauri() {
  try {
    const { writeTextFile, createDir, BaseDirectory } = window.__TAURI__.fs || {};
    
    if (writeTextFile && createDir) {
      
      try {
        await createDir('', { dir: BaseDirectory.AppData, recursive: true });
      } catch (e) {
        
      }
      
      await writeTextFile('favorites.json', JSON.stringify(favorites, null, 2), { 
        dir: BaseDirectory.AppData 
      });
    }
  } catch (e) {
    console.error('Error saving favorites to Tauri:', e);
  }
}


async function loadRecentFromTauri() {
  try {
    const { readTextFile, BaseDirectory } = window.__TAURI__.fs || {};
    
    if (readTextFile) {
      const data = await readTextFile('recent.json', { dir: BaseDirectory.AppData });
      const recent = JSON.parse(data);
      localStorage.setItem('questionary-recent', JSON.stringify(recent));
      return recent;
    }
  } catch (e) {
    console.log('Loading recent from localStorage');
  }
  return null;
}

async function saveRecentToStorage(recent) {
  try {
    localStorage.setItem('questionary-recent', JSON.stringify(recent));
    
    if (window.__TAURI__) {
      const { writeTextFile, createDir, BaseDirectory } = window.__TAURI__.fs || {};
      if (writeTextFile && createDir) {
        try {
          await createDir('', { dir: BaseDirectory.AppData, recursive: true });
        } catch (e) {}
        await writeTextFile('recent.json', JSON.stringify(recent, null, 2), { 
          dir: BaseDirectory.AppData 
        });
      }
    }
  } catch (e) {
    console.error('Error saving recent:', e);
  }
}


let timerState = {
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

function createRipple(event) {
  
}

const users = {
  "DPSNTRVMP": { password: "DPSNTRVMP@123", role: "user" },
  "ADMIN": { password: "DPSNTCLASSLOGIN@@", role: "admin" }
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
    bottom: 24px;
    left: 50%;
    transform: translateX(-50%) translateY(100px);
    padding: 14px 24px;
    border-radius: 12px;
    color: white;
    font-weight: 500;
    z-index: 10000;
    display: flex;
    align-items: center;
    gap: 12px;
    box-shadow: 0 8px 24px rgba(0,0,0,0.2);
    background: ${bgColor};
    font-size: 0.95rem;
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

function initializeAppAfterLogin() {
    const usernameDisplay = document.getElementById('username-display');
  if (usernameDisplay && currentUser) {
    usernameDisplay.textContent = currentUser.username;
  }
  
    const adminBadge = document.getElementById('adminBadge');
  if (adminBadge && currentUser && currentUser.role === 'admin') {
    adminBadge.style.display = 'inline-block';
  }
  
    if (typeof initializeNewFeatures === 'function') {
    initializeNewFeatures();
  }
  
    if (typeof renderTiles === 'function' && typeof documents !== 'undefined') {
    renderTiles(documents);
  }
  
    if (typeof updateBreadcrumb === 'function') {
    updateBreadcrumb();
  }
  
    if (typeof updateDashboardStats === 'function') {
    updateDashboardStats();
  }
}

function showAutoLoginNotification(username) {
  console.log('Auto-logging in as:', username);
  showNotification(`Welcome back, ${username}!`, 'success');
}

function performSearch(e) {
  const query = typeof e === 'string' ? e : (e?.target?.value || '');
  const searchResults = document.getElementById('searchResults');
  
  if (!query || query.length < 2) {
    if (searchResults) searchResults.style.display = 'none';
    return;
  }
  
    if (typeof addToSearchHistory === 'function') {
    addToSearchHistory(query);
  }
  
    const results = [];
  if (typeof documents !== 'undefined') {
    searchInDocuments(documents, [], query.toLowerCase(), results);
  }
  
    if (notes && notes.length > 0) {
    notes.forEach(note => {
      if (note.title.toLowerCase().includes(query.toLowerCase()) || 
          note.content.toLowerCase().includes(query.toLowerCase())) {
        results.push({
          name: note.title,
          path: ['Notes'],
          isFolder: false,
          isNote: true,
          noteId: note.id,
          url: null
        });
      }
    });
  }
  
    if (flashcardDecks && flashcardDecks.length > 0) {
    flashcardDecks.forEach(deck => {
      if (deck.name.toLowerCase().includes(query.toLowerCase())) {
        results.push({
          name: deck.name,
          path: ['Flashcards'],
          isFolder: false,
          isFlashcard: true,
          deckId: deck.id,
          url: null
        });
      }
            deck.cards.forEach(card => {
        if (card.front.toLowerCase().includes(query.toLowerCase()) || 
            card.back.toLowerCase().includes(query.toLowerCase())) {
          const alreadyAdded = results.some(r => r.deckId === deck.id);
          if (!alreadyAdded) {
            results.push({
              name: `${deck.name} (card match)`,
              path: ['Flashcards'],
              isFolder: false,
              isFlashcard: true,
              deckId: deck.id,
              url: null
            });
          }
        }
      });
    });
  }
  
    if (studySessions && studySessions.length > 0) {
    studySessions.forEach(session => {
      if (session.subject.toLowerCase().includes(query.toLowerCase())) {
        results.push({
          name: session.subject,
          path: ['Study Planner', session.date],
          isFolder: false,
          isSession: true,
          sessionId: session.id,
          url: null
        });
      }
    });
  }
  
  if (searchResults) {
    if (results.length === 0) {
      searchResults.innerHTML = '<div style="padding: 1rem; text-align: center; color: var(--text-secondary);">No results found</div>';
    } else {
      searchResults.innerHTML = results.slice(0, 15).map(r => {
                let icon = r.isFolder ? 'fa-folder' : 'fa-file-pdf';
        if (r.isNote) icon = 'fa-sticky-note';
        if (r.isFlashcard) icon = 'fa-layer-group';
        if (r.isSession) icon = 'fa-calendar-alt';
        
                let onclickHandler = '';
        if (r.isNote) {
          onclickHandler = `navigateToNote('${r.noteId}')`;
        } else if (r.isFlashcard) {
          onclickHandler = `navigateToFlashcard('${r.deckId}')`;
        } else if (r.isSession) {
          onclickHandler = `navigateToSession('${r.sessionId}')`;
        } else {
          onclickHandler = `navigateToSearchResult(${JSON.stringify(r.path).replace(/"/g, '&quot;')}, '${r.url || ''}')`;
        }
        
        return `
          <div class="search-result-item" onclick="${onclickHandler}">
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

function searchInDocuments(obj, currentPath, query, results) {
  for (const key in obj) {
    const newPath = [...currentPath, key];
    const value = obj[key];
    
    if (key.toLowerCase().includes(query)) {
      results.push({
        name: key,
        path: newPath,
        isFolder: typeof value === 'object',
        url: typeof value === 'string' ? value : null
      });
    }
    
    if (typeof value === 'object' && value !== null) {
      searchInDocuments(value, newPath, query, results);
    }
  }
}

function navigateToSearchResult(pathArray, url) {
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
      showPDF(url);
    }, 100);
  } else {
        path = [...pathArray];
    renderTiles(getCurrentLevel());
    updateBreadcrumb();
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function showConfirmModal(title, message, onConfirm, onCancel) {
    const existing = document.querySelector('.confirm-modal-overlay');
  if (existing) existing.remove();
  
  const overlay = document.createElement('div');
  overlay.className = 'confirm-modal-overlay';
  overlay.innerHTML = `
    <div class="confirm-modal">
      <div class="confirm-modal-icon">
        <i class="fas fa-trash-alt"></i>
      </div>
      <h3 class="confirm-modal-title">${escapeHtml(title)}</h3>
      <p class="confirm-modal-message">${escapeHtml(message)}</p>
      <div class="confirm-modal-actions">
        <button class="btn btn-cancel" id="confirmModalCancel">Cancel</button>
        <button class="btn btn-danger" id="confirmModalConfirm">Delete</button>
      </div>
    </div>
  `;
  
  document.body.appendChild(overlay);
  
    const cancelBtn = document.getElementById('confirmModalCancel');
  cancelBtn.onclick = () => {
    overlay.remove();
    if (onCancel) onCancel();
  };
  
    const confirmBtn = document.getElementById('confirmModalConfirm');
  confirmBtn.onclick = () => {
    overlay.remove();
    if (onConfirm) onConfirm();
  };
  
    overlay.onclick = (e) => {
    if (e.target === overlay) {
      overlay.remove();
      if (onCancel) onCancel();
    }
  };
  
    const handleEscape = (e) => {
    if (e.key === 'Escape') {
      overlay.remove();
      document.removeEventListener('keydown', handleEscape);
      if (onCancel) onCancel();
    }
  };
  document.addEventListener('keydown', handleEscape);
}

function setActiveNav(navId) {
  document.querySelectorAll('.nav-link').forEach(link => link.classList.remove('active'));
  const activeNav = document.getElementById(navId);
  if (activeNav) activeNav.classList.add('active');
}

function loadDocuments() { console.log('loadDocuments called'); }
function trackDailyAccess() { 
  console.log('trackDailyAccess called');
  const today = new Date().toISOString().split('T')[0];
  const accessData = JSON.parse(localStorage.getItem('questionary-daily-access') || '{}');
  accessData[today] = (accessData[today] || 0) + 1;
  localStorage.setItem('questionary-daily-access', JSON.stringify(accessData));
}
function saveUserPreferences() {  }

function renderTiles(docs) {
  const container = document.getElementById('tilesContainer');
  if (!container) {
    console.error('tilesContainer not found');
    return;
  }
  
  container.innerHTML = '';
  
  if (!docs || Object.keys(docs).length === 0) {
    container.innerHTML = '<p style="text-align: center; color: var(--text-secondary); padding: 2rem;">No documents available.</p>';
    return;
  }
  
    const sortOrder = localStorage.getItem('questionary-sort-order') || 'asc';
  const keys = Object.keys(docs).sort((a, b) => {
    return sortOrder === 'asc' ? a.localeCompare(b) : b.localeCompare(a);
  });
  
  keys.forEach(key => {
    const value = docs[key];
    const isFolder = typeof value === 'object';
    
    const tile = document.createElement('div');
    tile.className = 'tile';
    
        const isMissingPdf = !isFolder && (!value || value === '#' || value === '');
    
    // Create the path array for this item
    const itemPath = [...path, key];
    const itemPathJson = JSON.stringify(itemPath).replace(/"/g, '&quot;');
    
    tile.innerHTML = `
      <div class="tile-icon">
        <i class="fas ${isFolder ? 'fa-folder' : 'fa-file-pdf'}"></i>
      </div>
      <div class="tile-text">${escapeHtml(key)}</div>
      ${isFolder ? `<button class="tile-quicklink" onclick="event.stopPropagation(); addFolderToQuickLinks('${escapeHtml(key)}', ${itemPathJson})" title="Add to Quick Links"><i class="fas fa-link"></i></button>` : ''}
      ${!isFolder && !isMissingPdf ? `<button class="tile-favorite" onclick="event.stopPropagation(); toggleFavorite('${escapeHtml(key)}', ${itemPathJson}, '${escapeHtml(value)}')" title="Toggle Favorite"><i class="fas fa-star"></i></button>` : ''}
      ${isMissingPdf ? `<div class="pdf-missing-badge"><i class="fas fa-exclamation-triangle"></i> Not Available</div>` : ''}
    `;
    
        if (isMissingPdf) {
      tile.classList.add('pdf-missing');
    }
    
    tile.onclick = () => {
      if (isFolder) {
        path.push(key);
        renderTiles(value);
        updateBreadcrumb();
      } else if (isMissingPdf) {
        showNotification('This PDF is not available yet', 'warning');
      } else {
                addToRecent(key, [...path, key], value);
        showPDF(value);
      }
    };
    
    container.appendChild(tile);
  });
  
    updateDashboardStats();
}

async function checkPdfExists(pdfPath) {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open('HEAD', pdfPath, true);
    
    xhr.onreadystatechange = function() {
      if (xhr.readyState === 4) {
        console.log('PDF check:', pdfPath, 'status:', xhr.status);
                resolve(xhr.status === 200 || xhr.status === 206);
      }
    };
    
    xhr.onerror = function() {
      console.log('PDF check error:', pdfPath);
      resolve(false);
    };
    
    xhr.send();
  });
}

function updateBreadcrumb() {
  const breadcrumb = document.getElementById('breadcrumb');
  const backBtn = document.getElementById('backBtn');
  
  if (!breadcrumb) return;
  
    breadcrumb.innerHTML = '';
  
    const homeSpan = document.createElement('span');
  homeSpan.className = 'breadcrumb-item';
  homeSpan.textContent = 'Home';
  homeSpan.onclick = function() {
    navigateToPath([]);
  };
  breadcrumb.appendChild(homeSpan);
  
    let currentPath = [];
  path.forEach((segment, index) => {
    currentPath.push(segment);
    const pathCopy = [...currentPath];
    
        const separator = document.createElement('i');
    separator.className = 'fas fa-chevron-right';
    separator.style.cssText = 'font-size: 0.7rem; opacity: 0.5; margin: 0 0.5rem;';
    breadcrumb.appendChild(separator);
    
        const segmentSpan = document.createElement('span');
    segmentSpan.className = 'breadcrumb-item';
    segmentSpan.textContent = segment;
    segmentSpan.onclick = function() {
      navigateToPath(pathCopy);
    };
    breadcrumb.appendChild(segmentSpan);
  });
  
  if (backBtn) {
    backBtn.style.display = path.length > 0 ? 'flex' : 'none';
  }
}

function navigateToPath(newPath) {
  console.log('navigateToPath called with:', newPath);
  
  // Ensure newPath is a valid array and filter out empty strings
  if (!Array.isArray(newPath)) {
    console.warn('navigateToPath: newPath is not an array, resetting to home');
    newPath = [];
  }
  newPath = newPath.filter(segment => segment && segment.trim() !== '');
  console.log('navigateToPath filtered path:', newPath);
  
  const pdfViewer = document.getElementById('pdfViewer');
  if (pdfViewer) {
    pdfViewer.style.cssText = 'display: none !important;';
    pdfViewer.classList.remove('active');
    pdfViewer.src = '';
  }
  
  const tilesContainer = document.getElementById('tilesContainer');
  const sectionHeader = document.querySelector('#tilesSection .section-header');
  const dashboardHeader = document.querySelector('.dashboard-header');
  const tilesSection = document.getElementById('tilesSection');
  
  if (tilesSection) tilesSection.style.display = 'block';
  if (tilesContainer) tilesContainer.style.display = 'grid';
  if (sectionHeader) sectionHeader.style.display = 'flex';
  if (dashboardHeader) dashboardHeader.style.display = newPath.length === 0 ? 'flex' : 'none';
  
  if (typeof hideTimerCompletely === 'function') hideTimerCompletely();
  
  // Validate path exists in documents before navigating
  let level = documents;
  let validPath = [];
  for (const segment of newPath) {
    if (level && typeof level === 'object' && level[segment]) {
      level = level[segment];
      validPath.push(segment);
    } else {
      console.warn('navigateToPath: Invalid path segment:', segment, 'at path:', validPath);
      break;
    }
  }
  
  // Use the validated path
  path = validPath;
  console.log('navigateToPath: Final path:', path);
  
  renderTiles(level);
  updateBreadcrumb();
}

window.navigateToPath = navigateToPath;

function getCurrentLevel() {
  let current = documents;
  for (const segment of path) {
    if (current && typeof current === 'object' && current[segment]) {
      current = current[segment];
    } else {
      return documents;
    }
  }
  return current;
}

function updateDashboardStats() {
    let totalDocs = 0;
  function countDocs(obj) {
    for (const key in obj) {
      const value = obj[key];
      if (typeof value === 'string') {
                if (value && value !== '#' && value.trim() !== '') {
          totalDocs++;
        }
      } else if (typeof value === 'object' && value !== null) {
        countDocs(value);
      }
    }
  }
  countDocs(documents);
  
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

function showPDF(url) { 
  console.log('showPDF called with:', url);
  
  if (!url || url === '' || url === '#') {
    console.error('Invalid PDF URL');
    return;
  }
  
  const pdfViewer = document.getElementById('pdfViewer');
  const tilesContainer = document.getElementById('tilesContainer');
  const sectionHeader = document.querySelector('#tilesSection .section-header');
  const dashboardHeader = document.querySelector('.dashboard-header');
  const breadcrumbContainer = document.querySelector('.breadcrumb-container');
  const tilesSection = document.getElementById('tilesSection');
  
    const filename = url.split('/').pop().replace('.pdf', '').replace(/%20/g, ' ');
  window.setCurrentPDF && window.setCurrentPDF(url, filename);
  
    if (pdfViewer) {
    pdfViewer.src = url;
    pdfViewer.classList.add('active');
    pdfViewer.style.cssText = '';     console.log('PDF viewer should now be visible, src:', url);
  } else {
    console.error('PDF viewer element not found!');
    return;
  }
  
    if (tilesSection) tilesSection.style.display = 'block';
  
    if (tilesContainer) tilesContainer.style.display = 'none';
  if (sectionHeader) sectionHeader.style.display = 'none';
  if (dashboardHeader) dashboardHeader.style.display = 'none';
  
    if (breadcrumbContainer) breadcrumbContainer.style.display = 'flex';
  
    updateBreadcrumb();
  
    const timerPanel = document.getElementById('timerPanel');
  if (timerPanel) timerPanel.style.display = 'flex';
  
    if (typeof initializeTimer === 'function') initializeTimer();
  
    if (typeof trackPdfViewStart === 'function') trackPdfViewStart();
}

function closePDF() {
  const pdfViewer = document.getElementById('pdfViewer');
  const tilesContainer = document.getElementById('tilesContainer');
  const sectionHeader = document.querySelector('#tilesSection .section-header');
  const dashboardHeader = document.querySelector('.dashboard-header');
  
    window.clearCurrentPDF && window.clearCurrentPDF();
  
  if (pdfViewer) {
    pdfViewer.style.cssText = 'display: none !important;';
    pdfViewer.classList.remove('active');
    pdfViewer.src = '';
  }
  
  if (tilesContainer) tilesContainer.style.display = 'grid';
  if (sectionHeader) sectionHeader.style.display = 'flex';
  if (dashboardHeader && path.length === 0) dashboardHeader.style.display = 'flex';
  
  if (typeof hideTimerCompletely === 'function') hideTimerCompletely();
  
    if (typeof trackPdfViewEnd === 'function') trackPdfViewEnd(path.join('/'));
}

function renderAnalytics() {
  console.log('renderAnalytics called');
  
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
    container.innerHTML = '<p style="text-align: center; color: var(--text-secondary); padding: 2rem;">No study sessions scheduled. Click "Add Session" to create one.</p>';
    return;
  }
  
  const sorted = [...studySessions].sort((a, b) => new Date(a.date) - new Date(b.date));
  container.innerHTML = sorted.map(session => `
    <div class="session-item">
      <div class="session-info">
        <strong>${escapeHtml(session.subject)}</strong>
        <span>${session.date} at ${session.time}</span>
      </div>
      <button class="btn-icon" onclick="deleteSession('${session.id}')" title="Delete session">
        <i class="fas fa-trash"></i>
      </button>
    </div>
  `).join('');
}
function renderFlashcardDecks() { 
  const container = document.getElementById('flashcardsGrid') || document.getElementById('flashcardDecksContainer');
  if (!container) return;
  
  if (flashcardDecks.length === 0) {
    container.innerHTML = '<p style="text-align: center; color: var(--text-secondary); padding: 2rem;">No flashcard decks yet. Click "New Deck" to create one.</p>';
    return;
  }
  
  container.innerHTML = flashcardDecks.map(deck => `
    <div class="deck-card">
      <h4>${escapeHtml(deck.name)}</h4>
      <p>${deck.cards.length} cards</p>
      <button class="btn-icon delete" onclick="event.stopPropagation(); deleteDeck('${deck.id}')" title="Delete deck">
        <i class="fas fa-trash"></i>
      </button>
      <button class="btn btn-primary btn-sm" onclick="startStudyDeck('${deck.id}')" style="margin-top: 1rem;">
        <i class="fas fa-play"></i> Study
      </button>
    </div>
  `).join('');
}
function renderNotes() { 
  const container = document.getElementById('notesGrid') || document.getElementById('notesContainer');
  if (!container) return;
  
  if (notes.length === 0) {
    container.innerHTML = '<p style="text-align: center; color: var(--text-secondary); padding: 2rem;">No notes yet. Click "New Note" to create one.</p>';
    return;
  }
  
  container.innerHTML = notes.map(note => `
    <div class="note-card" onclick="editNote('${note.id}')">
      <h4>${escapeHtml(note.title)}</h4>
      <p>${escapeHtml(note.content.substring(0, 100))}${note.content.length > 100 ? '...' : ''}</p>
      <small>${new Date(note.updatedAt).toLocaleDateString()}</small>
      <button class="btn-icon delete" onclick="event.stopPropagation(); deleteNote('${note.id}')" title="Delete note">
        <i class="fas fa-trash"></i>
      </button>
    </div>
  `).join('');
}
function updateProgressDisplay() { console.log('updateProgressDisplay called'); }

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
    return `
    <div class="quick-link-item" data-id="${ql.id}" data-path="${ql.pathArray.join('|')}" data-is-file="${isFile}" data-url="${ql.url || ''}">
      <i class="fas ${icon}" ${iconColor}></i>
      <span class="quick-link-name">${ql.name || ql.pathArray[ql.pathArray.length - 1] || 'Unknown'}</span>
      <button class="quick-link-delete" title="Remove" onclick="event.stopPropagation(); removeQuickLink('${ql.id}')">
        <i class="fas fa-times"></i>
      </button>
    </div>
  `;
  }).join('');
  
    container.querySelectorAll('.quick-link-item').forEach(item => {
    item.addEventListener('click', (e) => {
      if (e.target.closest('.quick-link-delete')) return;
      const pathStr = item.dataset.path;
      const pathArray = pathStr.split('|');
      const isFile = item.dataset.isFile === 'true';
      const url = item.dataset.url;
      
      if (isFile && url) {
                const parentPath = pathArray.slice(0, -1);
        navigateToPath(parentPath);
        setTimeout(() => showPDF(url), 100);
      } else {
        navigateToPath(pathArray);
      }
      document.getElementById('quickLinksPanel')?.classList.remove('active');
    });
  });
}

let currentOpenPDF = null;
window.setCurrentPDF = function(url, name) {
  currentOpenPDF = { url, name };
};
window.clearCurrentPDF = function() {
  currentOpenPDF = null;
};

function removeQuickLink(id) {
  quickLinks = quickLinks.filter(ql => ql.id !== id);
  saveQuickLinks();
  renderQuickLinks();
  if (typeof showNotification === 'function') showNotification('Quick link removed', 'info');
}

function saveQuickLinks() { localStorage.setItem('questionary-quick-links', JSON.stringify(quickLinks)); }
function loadQuickLinks() { quickLinks = JSON.parse(localStorage.getItem('questionary-quick-links') || '[]'); }

// Add a folder to quick links from tile view
function addFolderToQuickLinks(folderName, folderPath) {
  const pathStr = folderPath.join('|');
  
  // Check if already exists
  if (quickLinks.some(ql => ql.pathArray.join('|') === pathStr)) {
    if (typeof showNotification === 'function') showNotification('This folder is already in quick links', 'info');
    return;
  }
  
  quickLinks.push({ 
    id: Date.now().toString(), 
    name: folderName, 
    pathArray: [...folderPath],
    isFile: false
  });
  
  saveQuickLinks();
  renderQuickLinks();
  if (typeof showNotification === 'function') showNotification(`Folder "${folderName}" added to quick links!`, 'success');
}

// Make it available globally
window.addFolderToQuickLinks = addFolderToQuickLinks;

// Add current folder to quick links (from button)
function addCurrentFolderToQuickLinks() {
  if (path.length === 0) {
    if (typeof showNotification === 'function') showNotification('Navigate to a folder first to add it as a quick link', 'info');
    return;
  }
  
  const pathStr = path.join('|');
  if (quickLinks.some(ql => ql.pathArray.join('|') === pathStr)) {
    if (typeof showNotification === 'function') showNotification('This folder is already in quick links', 'info');
    return;
  }
  
  const folderName = path[path.length - 1];
  quickLinks.push({ 
    id: Date.now().toString(), 
    name: folderName, 
    pathArray: [...path],
    isFile: false
  });
  saveQuickLinks();
  renderQuickLinks();
  if (typeof showNotification === 'function') showNotification(`Folder "${folderName}" added to quick links!`, 'success');
}

// Add current open PDF to quick links
function addCurrentPdfToQuickLinks() {
  if (!currentOpenPDF) return;
  
  const pathStr = [...path, currentOpenPDF.name].join('|');
  if (quickLinks.some(ql => ql.pathArray.join('|') === pathStr)) {
    if (typeof showNotification === 'function') showNotification('This file is already in quick links', 'info');
    return;
  }
  
  quickLinks.push({ 
    id: Date.now().toString(), 
    name: currentOpenPDF.name, 
    pathArray: [...path, currentOpenPDF.name],
    isFile: true,
    url: currentOpenPDF.url
  });
  saveQuickLinks();
  renderQuickLinks();
  if (typeof showNotification === 'function') showNotification('PDF added to quick links!', 'success');
}

// Show choice dialog when PDF is open
function showQuickLinkChoiceDialog() {
  // Remove existing dialog if any
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
  
  // Event listeners
  document.getElementById('addPdfQuickLink').onclick = () => {
    addCurrentPdfToQuickLinks();
    dialog.remove();
  };
  
  const folderBtn = document.getElementById('addFolderQuickLink');
  if (folderBtn) {
    folderBtn.onclick = () => {
      addCurrentFolderToQuickLinks();
      dialog.remove();
    };
  }
  
  document.getElementById('cancelQuickLinkChoice').onclick = () => dialog.remove();
  dialog.onclick = (e) => {
    if (e.target === dialog) dialog.remove();
  };
}

function trackStudyTime(minutes) { 
  console.log('Tracked study time:', minutes);
  studyStats.totalTime = (studyStats.totalTime || 0) + minutes;
  localStorage.setItem('questionary-study-stats', JSON.stringify(studyStats));
}

function updateDocProgress(docPath, progress) { 
  console.log('Updated progress:', docPath, progress);
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
    days.push({
      date: dateStr,
      day: dayName,
      count: accessData[dateStr] || 0
    });
  }
  
  const maxCount = Math.max(...days.map(d => d.count), 1);
  
  container.innerHTML = `
    <div style="display: flex; align-items: flex-end; justify-content: space-between; height: 140px; gap: 8px; padding: 10px 0;">
      ${days.map(d => `
        <div style="display: flex; flex-direction: column; align-items: center; flex: 1;">
          <div style="
            width: 100%;
            max-width: 40px;
            height: ${Math.max((d.count / maxCount) * 100, 8)}px;
            background: ${d.count > 0 ? 'var(--primary-color)' : 'var(--border)'};
            border-radius: 4px 4px 0 0;
            transition: height 0.3s ease;
          " title="${d.count} sessions"></div>
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
  
  const subjects = Object.entries(subjectAccess)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  
  if (subjects.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; padding: 2rem; color: var(--text-secondary);">
        <i class="fas fa-chart-pie" style="font-size: 2rem; opacity: 0.3; margin-bottom: 0.5rem; display: block;"></i>
        <p style="margin: 0;">No subject data yet. Browse some documents!</p>
      </div>
    `;
    return;
  }
  
  const maxCount = subjects[0][1];
  const colors = ['#f97316', '#3b82f6', '#22c55e', '#a855f7', '#f59e0b'];
  
  container.innerHTML = `
    <div style="display: flex; flex-direction: column; gap: 12px;">
      ${subjects.map(([name, count], i) => `
        <div>
          <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
            <span style="font-size: 0.85rem; font-weight: 500; color: var(--text-primary);">${escapeHtml(name)}</span>
            <span style="font-size: 0.8rem; color: var(--text-secondary);">${count} views</span>
          </div>
          <div style="height: 8px; background: var(--border); border-radius: 4px; overflow: hidden;">
            <div style="
              width: ${(count / maxCount) * 100}%;
              height: 100%;
              background: ${colors[i % colors.length]};
              border-radius: 4px;
              transition: width 0.3s ease;
            "></div>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

function renderRecentActivity(recent) {
  const container = document.getElementById('recentActivityList');
  if (!container) return;
  
  const recentItems = recent.slice(0, 10);
  
  if (recentItems.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; padding: 2rem; color: var(--text-secondary);">
        <i class="fas fa-clock" style="font-size: 2rem; opacity: 0.3; margin-bottom: 0.5rem; display: block;"></i>
        <p style="margin: 0;">No recent activity yet.</p>
      </div>
    `;
    return;
  }
  
  container.innerHTML = recentItems.map(item => {
    const timeAgo = getTimeAgo(item.timestamp);
    return `
      <div style="display: flex; align-items: center; gap: 12px; padding: 10px; border-radius: 8px; background: var(--surface-hover); margin-bottom: 8px;">
        <i class="fas fa-file-pdf" style="color: var(--primary-color); font-size: 1.1rem;"></i>
        <div style="flex: 1; min-width: 0;">
          <div style="font-weight: 500; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(item.title)}</div>
          <div style="font-size: 0.75rem; color: var(--text-secondary);">${timeAgo}</div>
        </div>
      </div>
    `;
  }).join('');
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
  
    setTimeout(() => {
    if (typeof editNote === 'function') {
      editNote(noteId);
    }
  }, 100);
}

function navigateToFlashcard(deckId) {
  const searchResults = document.getElementById('searchResults');
  if (searchResults) searchResults.style.display = 'none';
  document.getElementById('globalSearch').value = '';
  
  showView('flashcards');
  setActiveNav('flashcardsNav');
  
    setTimeout(() => {
    if (typeof startStudyDeck === 'function') {
      startStudyDeck(deckId);
    }
  }, 100);
}

function navigateToSession(sessionId) {
  const searchResults = document.getElementById('searchResults');
  if (searchResults) searchResults.style.display = 'none';
  document.getElementById('globalSearch').value = '';
  
  showView('planner');
  setActiveNav('studyPlannerNav');
  
    setTimeout(() => {
    const session = studySessions.find(s => s.id === sessionId);
    if (session) {
      showNotification(`Session: ${session.subject} on ${session.date} at ${session.time}`, 'info');
    }
  }, 100);
}

window.navigateToNote = navigateToNote;
window.navigateToFlashcard = navigateToFlashcard;
window.navigateToSession = navigateToSession;

let documents = {
    "2020-21": {
        "Class 9": {
            "MT 1": {
                "Bengali": "documents/2020-21_CL_9_MT_1_Bengali_I.pdf",
                "Biology": "documents/2020-21_CL_9_MT_1_Biology_I.pdf",
                "Chemistry": "documents/2020-21_CL_9_MT_1_Chemistry.pdf",
                "Commerce": "documents/2020-21_CL_9_MT_1_Commerce_I.pdf",
                "Computer": "documents/2020-21_CL_9_MT_1_Computer.pdf",
                "Economics": "documents/2020-21_CL_9_MT_1_Economics.pdf",
                "English Language": "documents/2020-21_CL_9_MT_1_English_Language.pdf",
                "English Literature": "documents/2020-21_CL_9_MT_1_English_Literature.pdf",
                "EVA": "documents/2020-21_CL_9_MT_1_EVA.pdf",
                "EVS": "documents/2020-21_CL_9_MT_1_EVS.pdf",
                "French": "documents/2020-21_CL_9_MT_1_French_I.pdf",
                "Geography": "documents/2020-21_CL_9_MT_1_Geography.pdf",
                "German": "documents/2020-21_CL_9_MT_1_German_I.pdf",
                "Hindi": "documents/2020-21_CL_9_MT_1_Hindi.pdf",
                "History": "documents/2020-21_CL_9_MT_1_History.pdf",
                "Home Science": "documents/2020-21_CL_9_MT_1_Home_Science.pdf",
                "Math": "documents/2020-21_CL_9_MT_1_Math.pdf",
                "PE": "documents/2020-21_CL_9_MT_1_PE.pdf",
                "Physics": "documents/2020-21_CL_9_MT_1_Physics.pdf",
                "RAI": "#"
            },
            "MT 2": {
                "Bengali": "documents/2020-21_CL_9_MT_2_Bengali.pdf",
                "Biology": "documents/2020-21_CL_9_MT_2_Biology.pdf",
                "Chemistry": "documents/2020-21_CL_9_MT_2_Chemistry.pdf",
                "Commerce": "documents/2020-21_CL_9_MT_2_Commerce.pdf",
                "Computer": "documents/2020-21_CL_9_MT_2_Computer.pdf",
                "Economics": "documents/2020-21_CL_9_MT_2_Economics.pdf",
                "English Language": "documents/2020-21_CL_9_MT_2_English_Language.pdf",
                "English Literature": "documents/2020-21_CL_9_MT_2_English_Literature.pdf",
                "EVA": "documents/2020-21_CL_9_MT_2_EVA.pdf",
                "EVS": "documents/2020-21_CL_9_MT_2_EVS.pdf",
                "French": "documents/2020-21_CL_9_MT_2_French.pdf",
                "Geography": "documents/2020-21_CL_9_MT_2_Geography.pdf",
                "German": "documents/2020-21_CL_9_MT_2_German.pdf",
                "Hindi": "#",
                "History": "documents/2020-21_CL_9_MT_2_History.pdf",
                "Home Science": "documents/2020-21_CL_9_MT_2_Home_Science.pdf",
                "Math": "documents/2020-21_CL_9_MT_2_Math.pdf",
                "PE": "documents/2020-21_CL_9_MT_2_PE.pdf",
                "Physics": "documents/2020-21_CL_9_MT_2_Physics.pdf",
                "RAI": "#"
            },
            "HY": {
                "Bengali": "documents/2020-21_CL_9_HY_Bengali_I.pdf",
                "Biology": "documents/2020-21_CL_9_HY_Biology.pdf",
                "Chemistry": "documents/2020-21_CL_9_HY_Chemistry.pdf",
                "Commerce": "documents/2020-21_CL_9_HY_Commerce_I.pdf",
                "Computer": "documents/2020-21_CL_9_HY_Computer.pdf",
                "Economics": "#",
                "English Language": "documents/2020-21_CL_9_HY_English_Language.pdf",
                "English Literature": "documents/2020-21_CL_9_HY_English_Literature_I.pdf",
                "EVA": "documents/2020-21_CL_9_HY_EVA.pdf",
                "EVS": "documents/2020-21_CL_9_HY_EVS.pdf",
                "French": "documents/2020-21_CL_9_HY_French.pdf",
                "Geography": "documents/2020-21_CL_9_HY_Geography.pdf",
                "German": "documents/2020-21_CL_9_HY_German.pdf",
                "Hindi": "documents/2020-21_CL_9_HY_Hindi.pdf",
                "History": "documents/2020-21_CL_9_HY_History.pdf",
                "Home Science": "documents/2020-21_CL_9_HY_Home_Science.pdf",
                "Math": "documents/2020-21_CL_9_HY_Math.pdf",
                "PE": "documents/2020-21_CL_9_HY_PE.pdf",
                "Physics": "documents/2020-21_CL_9_HY_Physics.pdf",
                "RAI": "#"
            },
            "FT": {
                "Bengali": "documents/2020-21_CL_9_FT_Bengali.pdf",
                "Biology": "documents/2020-21_CL_9_FT_Biology.pdf",
                "Chemistry": "documents/2020-21_CL_9_FT_Chemistry.pdf",
                "Commerce": "documents/2020-21_CL_9_FT_Commerce.pdf",
                "Computer": "documents/2020-21_CL_9_FT_Computer.pdf",
                "Economics": "documents/2020-21_CL_9_FT_Economics.pdf",
                "English Language": "documents/2020-21_CL_9_FT_English_Language_I.pdf",
                "English Literature": "documents/2020-21_CL_9_FT_English_Literature_I.pdf",
                "EVA": "documents/2020-21_CL_9_FT_EVA.pdf",
                "EVS": "documents/2020-21_CL_9_FT_EVS.pdf",
                "French": "documents/2020-21_CL_9_FT_French_.pdf",
                "Geography": "documents/2020-21_CL_9_FT_Geography.pdf",
                "German": "documents/2020-21_CL_9_FT_German.pdf",
                "Hindi": "documents/2020-21_CL_9_FT_Hindi.pdf",
                "History": "documents/2020-21_CL_9_FT_History_I.pdf",
                "Home Science": "documents/2020-21_CL_9_FT_Home_Science.pdf",
                "Math": "documents/2020-21_CL_9_FT_Math.pdf",
                "PE": "documents/2020-21_CL_9_FT_PE.pdf",
                "Physics": "documents/2020-21_CL_9_FT_Physics_I.pdf",
                "RAI": "#"
            }
        },
        "Class 10": {
            "MT 1": {
                "Bengali": "#",
                "Biology": "#",
                "Chemistry": "#",
                "Commerce": "#",
                "Computer": "#",
                "Economics": "#",
                "English Language": "#",
                "English Literature": "#",
                "EVA": "#",
                "EVS": "#",
                "French": "#",
                "Geography": "#",
                "German": "#",
                "Hindi": "#",
                "History": "#",
                "Home Science": "#",
                "Math": "#",
                "PE": "#",
                "Physics": "#",
                "RAI": "#"
            },
            "MT 2": {
                "Bengali": "#",
                "Biology": "#",
                "Chemistry": "#",
                "Commerce": "#",
                "Computer": "#",
                "Economics": "#",
                "English Language": "#",
                "English Literature": "#",
                "EVA": "#",
                "EVS": "#",
                "French": "#",
                "Geography": "#",
                "German": "#",
                "Hindi": "#",
                "History": "#",
                "Home Science": "#",
                "Math": "#",
                "PE": "#",
                "Physics": "#",
                "RAI": "#"
            },
            "HY": {
                "Bengali": "#",
                "Biology": "#",
                "Chemistry": "#",
                "Commerce": "#",
                "Computer": "#",
                "Economics": "#",
                "English Language": "#",
                "English Literature": "#",
                "EVA": "#",
                "EVS": "#",
                "French": "#",
                "Geography": "#",
                "German": "#",
                "Hindi": "#",
                "History": "#",
                "Home Science": "#",
                "Math": "#",
                "PE": "#",
                "Physics": "#",
                "RAI": "#"
            },
            "FT": {
                "Bengali": "#",
                "Biology": "#",
                "Chemistry": "#",
                "Commerce": "#",
                "Computer": "#",
                "Economics": "#",
                "English Language": "#",
                "English Literature": "#",
                "EVA": "#",
                "EVS": "#",
                "French": "#",
                "Geography": "#",
                "German": "#",
                "Hindi": "#",
                "History": "#",
                "Home Science": "#",
                "Math": "#",
                "PE": "#",
                "Physics": "#",
                "RAI": "#"
            }
        },
        "Class 11": {
            "MT 1": {
                "Bengali": "#",
                "Biology": "#",
                "Chemistry": "#",
                "Commerce": "#",
                "Computer": "#",
                "Economics": "#",
                "English Language": "#",
                "English Literature": "#",
                "EVA": "#",
                "EVS": "#",
                "French": "#",
                "Geography": "#",
                "German": "#",
                "Hindi": "#",
                "History": "#",
                "Home Science": "#",
                "Math": "#",
                "PE": "#",
                "Physics": "#",
                "RAI": "#"
            },
            "MT 2": {
                "Bengali": "#",
                "Biology": "#",
                "Chemistry": "#",
                "Commerce": "#",
                "Computer": "#",
                "Economics": "#",
                "English Language": "#",
                "English Literature": "#",
                "EVA": "#",
                "EVS": "#",
                "French": "#",
                "Geography": "#",
                "German": "#",
                "Hindi": "#",
                "History": "#",
                "Home Science": "#",
                "Math": "#",
                "PE": "#",
                "Physics": "#",
                "RAI": "#"
            },
            "HY": {
                "Bengali": "#",
                "Biology": "#",
                "Chemistry": "#",
                "Commerce": "#",
                "Computer": "#",
                "Economics": "#",
                "English Language": "#",
                "English Literature": "#",
                "EVA": "#",
                "EVS": "#",
                "French": "#",
                "Geography": "#",
                "German": "#",
                "Hindi": "#",
                "History": "#",
                "Home Science": "#",
                "Math": "#",
                "PE": "#",
                "Physics": "#",
                "RAI": "#"
            },
            "FT": {
                "Bengali": "#",
                "Biology": "#",
                "Chemistry": "#",
                "Commerce": "#",
                "Computer": "#",
                "Economics": "#",
                "English Language": "#",
                "English Literature": "#",
                "EVA": "#",
                "EVS": "#",
                "French": "#",
                "Geography": "#",
                "German": "#",
                "Hindi": "#",
                "History": "#",
                "Home Science": "#",
                "Math": "#",
                "PE": "#",
                "Physics": "#",
                "RAI": "#"
            }
        },
        "Class 12": {
            "MT 1": {
                "Bengali": "#",
                "Biology": "#",
                "Chemistry": "#",
                "Commerce": "#",
                "Computer": "#",
                "Economics": "#",
                "English Language": "#",
                "English Literature": "#",
                "EVA": "#",
                "EVS": "#",
                "French": "#",
                "Geography": "#",
                "German": "#",
                "Hindi": "#",
                "History": "#",
                "Home Science": "#",
                "Math": "#",
                "PE": "#",
                "Physics": "#",
                "RAI": "#"
            },
            "MT 2": {
                "Bengali": "#",
                "Biology": "#",
                "Chemistry": "#",
                "Commerce": "#",
                "Computer": "#",
                "Economics": "#",
                "English Language": "#",
                "English Literature": "#",
                "EVA": "#",
                "EVS": "#",
                "French": "#",
                "Geography": "#",
                "German": "#",
                "Hindi": "#",
                "History": "#",
                "Home Science": "#",
                "Math": "#",
                "PE": "#",
                "Physics": "#",
                "RAI": "#"
            },
            "HY": {
                "Bengali": "#",
                "Biology": "#",
                "Chemistry": "#",
                "Commerce": "#",
                "Computer": "#",
                "Economics": "#",
                "English Language": "#",
                "English Literature": "#",
                "EVA": "#",
                "EVS": "#",
                "French": "#",
                "Geography": "#",
                "German": "#",
                "Hindi": "#",
                "History": "#",
                "Home Science": "#",
                "Math": "#",
                "PE": "#",
                "Physics": "#",
                "RAI": "#"
            },
            "FT": {
                "Bengali": "#",
                "Biology": "#",
                "Chemistry": "#",
                "Commerce": "#",
                "Computer": "#",
                "Economics": "#",
                "English Language": "#",
                "English Literature": "#",
                "EVA": "#",
                "EVS": "#",
                "French": "#",
                "Geography": "#",
                "German": "#",
                "Hindi": "#",
                "History": "#",
                "Home Science": "#",
                "Math": "#",
                "PE": "#",
                "Physics": "#",
                "RAI": "#"
            }
        }
    },
    "2021-22": {
        "Class 9": {
            "MT 1": {
                "Bengali": "documents/2021-22_CL_9_MT_1_Bengali.pdf",
                "Biology": "documents/2021-22_CL_9_MT_1_Biology.pdf",
                "Chemistry": "documents/2021-22_CL_9_MT_1_Chemistry.pdf",
                "Commerce": "documents/2021-22_CL_9_MT_1_Commerce.pdf",
                "Computer": "documents/2021-22_CL_9_MT_1_Computer.pdf",
                "Economics": "documents/2021-22_CL_9_MT_1_Economics.pdf",
                "English Language": "documents/2021-22_CL_9_MT_1_English_Language.pdf",
                "English Literature": "documents/2021-22_CL_9_MT_1_English_Literature.pdf",
                "EVA": "documents/2021-22_CL_9_MT_1_EVA.pdf",
                "EVS": "documents/2021-22_CL_9_MT_1_EVS.pdf",
                "French": "documents/2021-22_CL_9_MT_1_French.pdf",
                "Geography": "documents/2021-22_CL_9_MT_1_Geography.pdf",
                "German": "documents/2021-22_CL_9_MT_1_German.pdf",
                "Hindi": "documents/2021-22_CL_9_MT_1_Hindi.pdf",
                "History": "documents/2021-22_CL_9_MT_1_History.pdf",
                "Home Science": "documents/2021-22_CL_9_MT_1_Home_Science.pdf",
                "Math": "documents/2021-22_CL_9_MT_1_Math.pdf",
                "PE": "documents/2021-22_CL_9_MT_1_PE.pdf",
                "Physics": "documents/2021-22_CL_9_MT_1_Physics.pdf",
                "RAI": "#"
            },
            "MT 2": {
                "Bengali": "documents/2021-22_CL_9_MT_2_Bengali.pdf",
                "Biology": "documents/2021-22_CL_9_MT_2_Biology.pdf",
                "Chemistry": "documents/2021-22_CL_9_MT_2_Chemistry.pdf",
                "Commerce": "documents/2021-22_CL_9_MT_2_Commerce.pdf",
                "Computer": "documents/2021-22_CL_9_MT_2_Computer.pdf",
                "Economics": "documents/2021-22_CL_9_MT_2_Economics.pdf",
                "English Language": "documents/2021-22_CL_9_MT_2_English_Language.pdf",
                "English Literature": "documents/2021-22_CL_9_MT_2_English_Literature.pdf",
                "EVA": "documents/2021-22_CL_9_MT_2_EVA.pdf",
                "EVS": "documents/2021-22_CL_9_MT_2_EVS.pdf",
                "French": "documents/2021-22_CL_9_MT_2_French.pdf",
                "Geography": "documents/2021-22_CL_9_MT_2_Geography.pdf",
                "German": "documents/2021-22_CL_9_MT_2_German.pdf",
                "Hindi": "documents/2021-22_CL_9_MT_2_Hindi.pdf",
                "History": "documents/2021-22_CL_9_MT_2_History.pdf",
                "Home Science": "documents/2021-22_CL_9_MT_2_Home_Science.pdf",
                "Math": "documents/2021-22_CL_9_MT_2_Math.pdf",
                "PE": "documents/2021-22_CL_9_MT_2_PE.pdf",
                "Physics": "documents/2021-22_CL_9_MT_2_Physics.pdf",
                "RAI": "#"
            },
            "HY": {
                "Bengali": "documents/2021-22_CL_9_HY_Bengali_I.pdf",
                "Biology": "documents/2021-22_CL_9_HY_Biology_I.pdf",
                "Chemistry": "documents/2021-22_CL_9_HY_Chemistry_I.pdf",
                "Commerce": "documents/2021-22_CL_9_HY_Commerce_I.pdf",
                "Computer": "documents/2021-22_CL_9_HY_Computer_I.pdf",
                "Economics": "documents/2021-22_CL_9_HY_Economics_I.pdf",
                "English Language": "documents/2021-22_CL_9_HY_English_Language_I.pdf",
                "English Literature": "documents/2021-22_CL_9_HY_English_Literature_II.pdf",
                "EVA": "documents/2021-22_CL_9_HY_EVA_I.pdf",
                "EVS": "documents/2021-22_CL_9_HY_EVS_I.pdf",
                "French": "#",
                "Geography": "documents/2021-22_CL_9_HY_Geography_I.pdf",
                "German": "documents/2021-22_CL_9_HY_German_I.pdf",
                "Hindi": "documents/2021-22_CL_9_HY_Hindi.pdf",
                "History": "documents/2021-22_CL_9_HY_History.pdf",
                "Home Science": "documents/2021-22_CL_9_HY_Home_Science_I.pdf",
                "Math": "documents/2021-22_CL_9_HY_Math_I.pdf",
                "PE": "documents/2021-22_CL_9_HY_PE_I.pdf",
                "Physics": "documents/2021-22_CL_9_HY_Physics_I.pdf",
                "RAI": "#"
            },
            "FT": {
                "Bengali": "documents/2021-22_CL_9_FT_Bengali.pdf",
                "Biology": "documents/2021-22_CL_9_FT_Biology.pdf",
                "Chemistry": "documents/2021-22_CL_9_FT_Chemistry.pdf",
                "Commerce": "documents/2021-22_CL_9_FT_Commerce.pdf",
                "Computer": "documents/2021-22_CL_9_FT_Computer.pdf",
                "Economics": "documents/2021-22_CL_9_FT_Economics.pdf",
                "English Language": "documents/2021-22_CL_9_FT_English_Language.pdf",
                "English Literature": "documents/2021-22_CL_9_FT_English_Literature.pdf",
                "EVA": "documents/2021-22_CL_9_FT_EVA.pdf",
                "EVS": "documents/2021-22_CL_9_FT_EVS.pdf",
                "French": "documents/2021-22_CL_9_FT_French.pdf",
                "Geography": "documents/2021-22_CL_9_FT_Geography.pdf",
                "German": "documents/2021-22_CL_9_FT_German.pdf",
                "Hindi": "documents/2021-22_CL_9_FT_Hindi.pdf",
                "History": "documents/2021-22_CL_9_FT_History.pdf",
                "Home Science": "documents/2021-22_CL_9_FT_Home_Science.pdf",
                "Math": "documents/2021-22_CL_9_FT_Math.pdf",
                "PE": "documents/2021-22_CL_9_FT_PE.pdf",
                "Physics": "documents/2021-22_CL_9_FT_Physics.pdf",
                "RAI": "#"
            }
        },
        "Class 10": {
            "MT 1": {
                "Bengali": "#",
                "Biology": "#",
                "Chemistry": "#",
                "Commerce": "#",
                "Computer": "#",
                "Economics": "#",
                "English Language": "#",
                "English Literature": "#",
                "EVA": "#",
                "EVS": "#",
                "French": "#",
                "Geography": "#",
                "German": "#",
                "Hindi": "#",
                "History": "#",
                "Home Science": "#",
                "Math": "#",
                "PE": "#",
                "Physics": "#",
                "RAI": "#"
            },
            "MT 2": {
                "Bengali": "#",
                "Biology": "#",
                "Chemistry": "#",
                "Commerce": "#",
                "Computer": "#",
                "Economics": "#",
                "English Language": "#",
                "English Literature": "#",
                "EVA": "#",
                "EVS": "#",
                "French": "#",
                "Geography": "#",
                "German": "#",
                "Hindi": "#",
                "History": "#",
                "Home Science": "#",
                "Math": "#",
                "PE": "#",
                "Physics": "#",
                "RAI": "#"
            },
            "HY": {
                "Bengali": "#",
                "Biology": "#",
                "Chemistry": "#",
                "Commerce": "#",
                "Computer": "#",
                "Economics": "#",
                "English Language": "#",
                "English Literature": "#",
                "EVA": "#",
                "EVS": "#",
                "French": "#",
                "Geography": "#",
                "German": "#",
                "Hindi": "#",
                "History": "#",
                "Home Science": "#",
                "Math": "#",
                "PE": "#",
                "Physics": "#",
                "RAI": "#"
            },
            "FT": {
                "Bengali": "#",
                "Biology": "#",
                "Chemistry": "#",
                "Commerce": "#",
                "Computer": "#",
                "Economics": "#",
                "English Language": "#",
                "English Literature": "#",
                "EVA": "#",
                "EVS": "#",
                "French": "#",
                "Geography": "#",
                "German": "#",
                "Hindi": "#",
                "History": "#",
                "Home Science": "#",
                "Math": "#",
                "PE": "#",
                "Physics": "#",
                "RAI": "#"
            }
        },
        "Class 11": {
            "MT 1": {
                "Bengali": "#",
                "Biology": "#",
                "Chemistry": "#",
                "Commerce": "#",
                "Computer": "#",
                "Economics": "#",
                "English Language": "#",
                "English Literature": "#",
                "EVA": "#",
                "EVS": "#",
                "French": "#",
                "Geography": "#",
                "German": "#",
                "Hindi": "#",
                "History": "#",
                "Home Science": "#",
                "Math": "#",
                "PE": "#",
                "Physics": "#",
                "RAI": "#"
            },
            "MT 2": {
                "Bengali": "#",
                "Biology": "#",
                "Chemistry": "#",
                "Commerce": "#",
                "Computer": "#",
                "Economics": "#",
                "English Language": "#",
                "English Literature": "#",
                "EVA": "#",
                "EVS": "#",
                "French": "#",
                "Geography": "#",
                "German": "#",
                "Hindi": "#",
                "History": "#",
                "Home Science": "#",
                "Math": "#",
                "PE": "#",
                "Physics": "#",
                "RAI": "#"
            },
            "HY": {
                "Bengali": "#",
                "Biology": "#",
                "Chemistry": "#",
                "Commerce": "#",
                "Computer": "#",
                "Economics": "#",
                "English Language": "#",
                "English Literature": "#",
                "EVA": "#",
                "EVS": "#",
                "French": "#",
                "Geography": "#",
                "German": "#",
                "Hindi": "#",
                "History": "#",
                "Home Science": "#",
                "Math": "#",
                "PE": "#",
                "Physics": "#",
                "RAI": "#"
            },
            "FT": {
                "Bengali": "#",
                "Biology": "#",
                "Chemistry": "#",
                "Commerce": "#",
                "Computer": "#",
                "Economics": "#",
                "English Language": "#",
                "English Literature": "#",
                "EVA": "#",
                "EVS": "#",
                "French": "#",
                "Geography": "#",
                "German": "#",
                "Hindi": "#",
                "History": "#",
                "Home Science": "#",
                "Math": "#",
                "PE": "#",
                "Physics": "#",
                "RAI": "#"
            }
        },
        "Class 12": {
            "MT 1": {
                "Bengali": "#",
                "Biology": "#",
                "Chemistry": "#",
                "Commerce": "#",
                "Computer": "#",
                "Economics": "#",
                "English Language": "#",
                "English Literature": "#",
                "EVA": "#",
                "EVS": "#",
                "French": "#",
                "Geography": "#",
                "German": "#",
                "Hindi": "#",
                "History": "#",
                "Home Science": "#",
                "Math": "#",
                "PE": "#",
                "Physics": "#",
                "RAI": "#"
            },
            "MT 2": {
                "Bengali": "#",
                "Biology": "#",
                "Chemistry": "#",
                "Commerce": "#",
                "Computer": "#",
                "Economics": "#",
                "English Language": "#",
                "English Literature": "#",
                "EVA": "#",
                "EVS": "#",
                "French": "#",
                "Geography": "#",
                "German": "#",
                "Hindi": "#",
                "History": "#",
                "Home Science": "#",
                "Math": "#",
                "PE": "#",
                "Physics": "#",
                "RAI": "#"
            },
            "HY": {
                "Bengali": "#",
                "Biology": "#",
                "Chemistry": "#",
                "Commerce": "#",
                "Computer": "#",
                "Economics": "#",
                "English Language": "#",
                "English Literature": "#",
                "EVA": "#",
                "EVS": "#",
                "French": "#",
                "Geography": "#",
                "German": "#",
                "Hindi": "#",
                "History": "#",
                "Home Science": "#",
                "Math": "#",
                "PE": "#",
                "Physics": "#",
                "RAI": "#"
            },
            "FT": {
                "Bengali": "#",
                "Biology": "#",
                "Chemistry": "#",
                "Commerce": "#",
                "Computer": "#",
                "Economics": "#",
                "English Language": "#",
                "English Literature": "#",
                "EVA": "#",
                "EVS": "#",
                "French": "#",
                "Geography": "#",
                "German": "#",
                "Hindi": "#",
                "History": "#",
                "Home Science": "#",
                "Math": "#",
                "PE": "#",
                "Physics": "#",
                "RAI": "#"
            }
        }
    },
    "2022-23": {
        "Class 9": {
            "MT 1": {
                "Bengali": "documents/2022-23_CL_9_MT_1_Bengali.pdf",
                "Biology": "documents/2022-23_CL_9_MT_1_Biology.pdf",
                "Chemistry": "documents/2022-23_CL_9_MT_1_Chemistry.pdf",
                "Commerce": "documents/2022-23_CL_9_MT_1_Commerce.pdf",
                "Computer": "documents/2022-23_CL_9_MT_1_Computer.pdf",
                "Economics": "documents/2022-23_CL_9_MT_1_Economics.pdf",
                "English Language": "documents/2022-23_CL_9_MT_1_English_Language.pdf",
                "English Literature": "documents/2022-23_CL_9_MT_1_English_Literature.pdf",
                "EVA": "documents/2022-23_CL_9_MT_1_EVA.pdf",
                "EVS": "documents/2022-23_CL_9_MT_1_EVS.pdf",
                "French": "documents/2022-23_CL_9_MT_1_French.pdf",
                "Geography": "documents/2022-23_CL_9_MT_1_Geography.pdf",
                "German": "documents/2022-23_CL_9_MT_1_German.pdf",
                "Hindi": "documents/2022-23_CL_9_MT_1_Hindi.pdf",
                "History": "documents/2022-23_CL_9_MT_1_History.pdf",
                "Home Science": "documents/2022-23_CL_9_MT_1_Home_Science.pdf",
                "Math": "documents/2022-23_CL_9_MT_1_Math.pdf",
                "PE": "documents/2022-23_CL_9_MT_1_PE.pdf",
                "Physics": "documents/2022-23_CL_9_MT_1_Physics.pdf",
                "RAI": "#"
            },
            "MT 2": {
                "Bengali": "documents/2022-23_CL_9_MT2_Bengali.pdf",
                "Biology": "documents/2022-23_CL_9_MT2_Biology.pdf",
                "Chemistry": "documents/2022-23_CL_9_MT2_Chemistry.pdf",
                "Commerce": "documents/2022-23_CL_9_MT2_Commerce.pdf",
                "Computer": "documents/2022-23_CL_9_MT2_Computer.pdf",
                "Economics": "documents/2022-23_CL_9_MT2_Economics.pdf",
                "English Language": "documents/2022-23_CL_9_MT2_EnglishLanguage.pdf",
                "English Literature": "documents/2022-23_CL_9_MT2_EnglishLiterature.pdf",
                "EVA": "documents/2022-23_CL_9_MT2_EVA.pdf",
                "EVS": "documents/2022-23_CL_9_MT2_EVS.pdf",
                "French": "documents/2022-23_CL_9_MT2_French.pdf",
                "Geography": "documents/2022-23_CL_9_MT2_Geography.pdf",
                "German": "documents/2022-23_CL_9_MT2_German.pdf",
                "Hindi": "documents/2022-23_CL_9_MT2_Hindi.pdf",
                "History": "documents/2022-23_CL_9_MT2_History.pdf",
                "Home Science": "documents/2022-23_CL_9_MT2_HomeScience.pdf",
                "Math": "documents/2022-23_CL_9_MT2_Math.pdf",
                "PE": "documents/2022-23_CL_9_MT2_PE.pdf",
                "Physics": "documents/2022-23_CL_9_MT2_Physics.pdf",
                "RAI": "#",
                "EnglishLanguage": "documents/2022-23_CL_9_MT2_EnglishLanguage.pdf",
                "EnglishLiterature": "documents/2022-23_CL_9_MT2_EnglishLiterature.pdf",
                "HomeScience": "documents/2022-23_CL_9_MT2_HomeScience.pdf"
            },
            "HY": {
                "Bengali": "documents/2022-23_CL_9_HY_Bengali.pdf",
                "Biology": "documents/2022-23_CL_9_HY_Biology.pdf",
                "Chemistry": "documents/2022-23_CL_9_HY_Chemistry.pdf",
                "Commerce": "documents/2022-23_CL_9_HY_Commerce.pdf",
                "Computer": "documents/2022-23_CL_9_HY_Computer.pdf",
                "Economics": "documents/2022-23_CL_9_HY_Economics.pdf",
                "English Language": "documents/2022-23_CL_9_HY_English_Language.pdf",
                "English Literature": "documents/2022-23_CL_9_HY_English_Literature.pdf",
                "EVA": "documents/2022-23_CL_9_HY_EVA.pdf",
                "EVS": "documents/2022-23_CL_9_HY_EVS.pdf",
                "French": "documents/2022-23_CL_9_HY_French.pdf",
                "Geography": "documents/2022-23_CL_9_HY_Geography.pdf",
                "German": "documents/2022-23_CL_9_HY_German.pdf",
                "Hindi": "documents/2022-23_CL_9_HY_Hindi.pdf",
                "History": "documents/2022-23_CL_9_HY_History.pdf",
                "Home Science": "documents/2022-23_CL_9_HY_Home_Science.pdf",
                "Math": "documents/2022-23_CL_9_HY_Math.pdf",
                "PE": "documents/2022-23_CL_9_HY_PE.pdf",
                "Physics": "documents/2022-23_CL_9_HY_Physics.pdf",
                "RAI": "#"
            },
            "FT": {
                "Bengali": "documents/2022-23_CL_9_FT_Bengali.pdf",
                "Biology": "documents/2022-23_CL_9_FT_Biology.pdf",
                "Chemistry": "documents/2022-23_CL_9_FT_Chemistry.pdf",
                "Commerce": "documents/2022-23_CL_9_FT_Commerce.pdf",
                "Computer": "documents/2022-23_CL_9_FT_Computer.pdf",
                "Economics": "documents/2022-23_CL_9_FT_Economics.pdf",
                "English Language": "documents/2022-23_CL_9_FT_English_Language.pdf",
                "English Literature": "documents/2022-23_CL_9_FT_English_Literature.pdf",
                "EVA": "documents/2022-23_CL_9_FT_EVA.pdf",
                "EVS": "documents/2022-23_CL_9_FT_EVS.pdf",
                "French": "documents/2022-23_CL_9_FT_French.pdf",
                "Geography": "documents/2022-23_CL_9_FT_Geography.pdf",
                "German": "documents/2022-23_CL_9_FT_German.pdf",
                "Hindi": "documents/2022-23_CL_9_FT_Hindi.pdf",
                "History": "documents/2022-23_CL_9_FT_History.pdf",
                "Home Science": "documents/2022-23_CL_9_FT_Home_Science.pdf",
                "Math": "documents/2022-23_CL_9_FT_Math.pdf",
                "PE": "documents/2022-23_CL_9_FT_PE.pdf",
                "Physics": "documents/2022-23_CL_9_FT_Physics.pdf",
                "RAI": "#"
            }
        },
        "Class 10": {
            "MT 1": {
                "Bengali": "#",
                "Biology": "#",
                "Chemistry": "#",
                "Commerce": "#",
                "Computer": "#",
                "Economics": "#",
                "English Language": "#",
                "English Literature": "#",
                "EVA": "#",
                "EVS": "#",
                "French": "#",
                "Geography": "#",
                "German": "#",
                "Hindi": "#",
                "History": "#",
                "Home Science": "#",
                "Math": "#",
                "PE": "#",
                "Physics": "#",
                "RAI": "#"
            },
            "MT 2": {
                "Bengali": "#",
                "Biology": "#",
                "Chemistry": "#",
                "Commerce": "#",
                "Computer": "#",
                "Economics": "#",
                "English Language": "#",
                "English Literature": "#",
                "EVA": "#",
                "EVS": "#",
                "French": "#",
                "Geography": "#",
                "German": "#",
                "Hindi": "#",
                "History": "#",
                "Home Science": "#",
                "Math": "#",
                "PE": "#",
                "Physics": "#",
                "RAI": "#"
            },
            "HY": {
                "Bengali": "#",
                "Biology": "#",
                "Chemistry": "#",
                "Commerce": "#",
                "Computer": "#",
                "Economics": "#",
                "English Language": "#",
                "English Literature": "#",
                "EVA": "#",
                "EVS": "#",
                "French": "#",
                "Geography": "#",
                "German": "#",
                "Hindi": "#",
                "History": "#",
                "Home Science": "#",
                "Math": "#",
                "PE": "#",
                "Physics": "#",
                "RAI": "#"
            },
            "FT": {
                "Bengali": "#",
                "Biology": "#",
                "Chemistry": "#",
                "Commerce": "#",
                "Computer": "#",
                "Economics": "#",
                "English Language": "#",
                "English Literature": "#",
                "EVA": "#",
                "EVS": "#",
                "French": "#",
                "Geography": "#",
                "German": "#",
                "Hindi": "#",
                "History": "#",
                "Home Science": "#",
                "Math": "#",
                "PE": "#",
                "Physics": "#",
                "RAI": "#"
            }
        },
        "Class 11": {
            "MT 1": {
                "Bengali": "#",
                "Biology": "#",
                "Chemistry": "#",
                "Commerce": "#",
                "Computer": "#",
                "Economics": "#",
                "English Language": "#",
                "English Literature": "#",
                "EVA": "#",
                "EVS": "#",
                "French": "#",
                "Geography": "#",
                "German": "#",
                "Hindi": "#",
                "History": "#",
                "Home Science": "#",
                "Math": "#",
                "PE": "#",
                "Physics": "#",
                "RAI": "#"
            },
            "MT 2": {
                "Bengali": "#",
                "Biology": "#",
                "Chemistry": "#",
                "Commerce": "#",
                "Computer": "#",
                "Economics": "#",
                "English Language": "#",
                "English Literature": "#",
                "EVA": "#",
                "EVS": "#",
                "French": "#",
                "Geography": "#",
                "German": "#",
                "Hindi": "#",
                "History": "#",
                "Home Science": "#",
                "Math": "#",
                "PE": "#",
                "Physics": "#",
                "RAI": "#"
            },
            "HY": {
                "Bengali": "#",
                "Biology": "#",
                "Chemistry": "#",
                "Commerce": "#",
                "Computer": "#",
                "Economics": "#",
                "English Language": "#",
                "English Literature": "#",
                "EVA": "#",
                "EVS": "#",
                "French": "#",
                "Geography": "#",
                "German": "#",
                "Hindi": "#",
                "History": "#",
                "Home Science": "#",
                "Math": "#",
                "PE": "#",
                "Physics": "#",
                "RAI": "#"
            },
            "FT": {
                "Bengali": "#",
                "Biology": "#",
                "Chemistry": "#",
                "Commerce": "#",
                "Computer": "#",
                "Economics": "#",
                "English Language": "#",
                "English Literature": "#",
                "EVA": "#",
                "EVS": "#",
                "French": "#",
                "Geography": "#",
                "German": "#",
                "Hindi": "#",
                "History": "#",
                "Home Science": "#",
                "Math": "#",
                "PE": "#",
                "Physics": "#",
                "RAI": "#"
            }
        },
        "Class 12": {
            "MT 1": {
                "Bengali": "#",
                "Biology": "#",
                "Chemistry": "#",
                "Commerce": "#",
                "Computer": "#",
                "Economics": "#",
                "English Language": "#",
                "English Literature": "#",
                "EVA": "#",
                "EVS": "#",
                "French": "#",
                "Geography": "#",
                "German": "#",
                "Hindi": "#",
                "History": "#",
                "Home Science": "#",
                "Math": "#",
                "PE": "#",
                "Physics": "#",
                "RAI": "#"
            },
            "MT 2": {
                "Bengali": "#",
                "Biology": "#",
                "Chemistry": "#",
                "Commerce": "#",
                "Computer": "#",
                "Economics": "#",
                "English Language": "#",
                "English Literature": "#",
                "EVA": "#",
                "EVS": "#",
                "French": "#",
                "Geography": "#",
                "German": "#",
                "Hindi": "#",
                "History": "#",
                "Home Science": "#",
                "Math": "#",
                "PE": "#",
                "Physics": "#",
                "RAI": "#"
            },
            "HY": {
                "Bengali": "#",
                "Biology": "#",
                "Chemistry": "#",
                "Commerce": "#",
                "Computer": "#",
                "Economics": "#",
                "English Language": "#",
                "English Literature": "#",
                "EVA": "#",
                "EVS": "#",
                "French": "#",
                "Geography": "#",
                "German": "#",
                "Hindi": "#",
                "History": "#",
                "Home Science": "#",
                "Math": "#",
                "PE": "#",
                "Physics": "#",
                "RAI": "#"
            },
            "FT": {
                "Bengali": "#",
                "Biology": "#",
                "Chemistry": "#",
                "Commerce": "#",
                "Computer": "#",
                "Economics": "#",
                "English Language": "#",
                "English Literature": "#",
                "EVA": "#",
                "EVS": "#",
                "French": "#",
                "Geography": "#",
                "German": "#",
                "Hindi": "#",
                "History": "#",
                "Home Science": "#",
                "Math": "#",
                "PE": "#",
                "Physics": "#",
                "RAI": "#"
            }
        }
    },
    "2023-24": {
        "Class 9": {
            "MT 1": {
                "Bengali": "documents/2023-24_CL_9_MT_1_Bengali.pdf",
                "Biology": "documents/2023-24_CL_9_MT_1_Biology.pdf",
                "Chemistry": "documents/2023-24_CL_9_MT_1_Chemistry.pdf",
                "Commerce": "documents/2023-24_CL_9_MT_1_Commerce.pdf",
                "Computer": "documents/2023-24_CL_9_MT_1_Computer.pdf",
                "Economics": "documents/2023-24_CL_9_MT_1_Economics.pdf",
                "English Language": "documents/2023-24_CL_9_MT_1_English_Language.pdf",
                "English Literature": "documents/2023-24_CL_9_MT_1_English_Literature.pdf",
                "EVA": "documents/2023-24_CL_9_MT_1_EVA.pdf",
                "EVS": "documents/2023-24_CL_9_MT_1_EVS.pdf",
                "French": "documents/2023-24_CL_9_MT_1_French.pdf",
                "Geography": "documents/2023-24_CL_9_MT_1_Geography.pdf",
                "German": "documents/2023-24_CL_9_MT_1_German.pdf",
                "Hindi": "documents/2023-24_CL_9_MT_1_Hindi.pdf",
                "History": "documents/2023-24_CL_9_MT_1_History.pdf",
                "Home Science": "documents/2023-24_CL_9_MT_1_Home_Science.pdf",
                "Math": "documents/2023-24_CL_9_MT_1_Math.pdf",
                "PE": "documents/2023-24_CL_9_MT_1_PE.pdf",
                "Physics": "#",
                "RAI": "#"
            },
            "MT 2": {
                "Bengali": "documents/2023-24_CL_9_MT_2_Bengali.pdf",
                "Biology": "documents/2023-24_CL_9_MT_2_Biology.pdf",
                "Chemistry": "documents/2023-24_CL_9_MT_2_Chemistry.pdf",
                "Commerce": "documents/2023-24_CL_9_MT_2_Commerce.pdf",
                "Computer": "documents/2023-24_CL_9_MT_2_Computer.pdf",
                "Economics": "documents/2023-24_CL_9_MT_2_Economics.pdf",
                "English Language": "documents/2023-24_CL_9_MT_2_English_Language.pdf",
                "English Literature": "documents/2023-24_CL_9_MT_2_English_Literature.pdf",
                "EVA": "documents/2023-24_CL_9_MT_2_EVA.pdf",
                "EVS": "documents/2023-24_CL_9_MT_2_EVS.pdf",
                "French": "documents/2023-24_CL_9_MT_2_French.pdf",
                "Geography": "documents/2023-24_CL_9_MT_2_Geography.pdf",
                "German": "documents/2023-24_CL_9_MT_2_German.pdf",
                "Hindi": "documents/2023-24_CL_9_MT_2_Hindi.pdf",
                "History": "documents/2023-24_CL_9_MT_2_History.pdf",
                "Home Science": "documents/2023-24_CL_9_MT_2_Home_Science.pdf",
                "Math": "documents/2023-24_CL_9_MT_2_Math.pdf",
                "PE": "documents/2023-24_CL_9_MT_2_PE.pdf",
                "Physics": "documents/2023-24_CL_9_MT_2_Physics.pdf",
                "RAI": "#"
            },
            "HY": {
                "Bengali": "documents/2023-24_CL_9_HY_Bengali.pdf",
                "Biology": "documents/2023-24_CL_9_HY_Biology.pdf",
                "Chemistry": "documents/2023-24_CL_9_HY_Chemistry.pdf",
                "Commerce": "documents/2023-24_CL_9_HY_Commerce.pdf",
                "Computer": "documents/2023-24_CL_9_HY_Computer.pdf",
                "Economics": "documents/2023-24_CL_9_HY_Economics.pdf",
                "English Language": "documents/2023-24_CL_9_HY_English_Language.pdf",
                "English Literature": "documents/2023-24_CL_9_HY_English_Literature.pdf",
                "EVA": "documents/2023-24_CL_9_HY_EVA.pdf",
                "EVS": "documents/2023-24_CL_9_HY_EVS.pdf",
                "French": "documents/2023-24_CL_9_HY_French.pdf",
                "Geography": "documents/2023-24_CL_9_HY_Geography.pdf",
                "German": "documents/2023-24_CL_9_HY_German.pdf",
                "Hindi": "documents/2023-24_CL_9_HY_Hindi.pdf",
                "History": "documents/2023-24_CL_9_HY_History.pdf",
                "Home Science": "documents/2023-24_CL_9_HY_Home_Science.pdf",
                "Math": "documents/2023-24_CL_9_HY_Math.pdf",
                "PE": "documents/2023-24_CL_9_HY_PE.pdf",
                "Physics": "documents/2023-24_CL_9_HY_Physics.pdf",
                "RAI": "#"
            },
            "FT": {
                "Bengali": "documents/2023-24_CL_9_FT_Bengali.pdf",
                "Biology": "documents/2023-24_CL_9_FT_Biology.pdf",
                "Chemistry": "documents/2023-24_CL_9_FT_Chemistry.pdf",
                "Commerce": "documents/2023-24_CL_9_FT_Commerce.pdf",
                "Computer": "documents/2023-24_CL_9_FT_Computer.pdf",
                "Economics": "documents/2023-24_CL_9_FT_Economics.pdf",
                "English Language": "documents/2023-24_CL_9_FT_English_Language.pdf",
                "English Literature": "documents/2023-24_CL_9_FT_English_Literature.pdf",
                "EVA": "documents/2023-24_CL_9_FT_EVA.pdf",
                "EVS": "documents/2023-24_CL_9_FT_EVS.pdf",
                "French": "documents/2023-24_CL_9_FT_French.pdf",
                "Geography": "documents/2023-24_CL_9_FT_Geography.pdf",
                "German": "documents/2023-24_CL_9_FT_German.pdf",
                "Hindi": "documents/2023-24_CL_9_FT_Hindi.pdf",
                "History": "documents/2023-24_CL_9_FT_History.pdf",
                "Home Science": "documents/2023-24_CL_9_FT_Home_Science.pdf",
                "Math": "documents/2023-24_CL_9_FT_Math.pdf",
                "PE": "documents/2023-24_CL_9_FT_PE.pdf",
                "Physics": "documents/2023-24_CL_9_FT_Physics.pdf",
                "RAI": "documents/2023-24_CL_9_FT_RAI.pdf"
            }
        },
        "Class 10": {
            "MT 1": {
                "Bengali": "#",
                "Biology": "#",
                "Chemistry": "#",
                "Commerce": "#",
                "Computer": "#",
                "Economics": "#",
                "English Language": "#",
                "English Literature": "#",
                "EVA": "#",
                "EVS": "#",
                "French": "#",
                "Geography": "#",
                "German": "#",
                "Hindi": "#",
                "History": "#",
                "Home Science": "#",
                "Math": "#",
                "PE": "#",
                "Physics": "#",
                "RAI": "#"
            },
            "MT 2": {
                "Bengali": "#",
                "Biology": "#",
                "Chemistry": "#",
                "Commerce": "#",
                "Computer": "#",
                "Economics": "#",
                "English Language": "#",
                "English Literature": "#",
                "EVA": "#",
                "EVS": "#",
                "French": "#",
                "Geography": "#",
                "German": "#",
                "Hindi": "#",
                "History": "#",
                "Home Science": "#",
                "Math": "#",
                "PE": "#",
                "Physics": "#",
                "RAI": "#"
            },
            "HY": {
                "Bengali": "#",
                "Biology": "#",
                "Chemistry": "#",
                "Commerce": "#",
                "Computer": "#",
                "Economics": "#",
                "English Language": "#",
                "English Literature": "#",
                "EVA": "#",
                "EVS": "#",
                "French": "#",
                "Geography": "#",
                "German": "#",
                "Hindi": "#",
                "History": "#",
                "Home Science": "#",
                "Math": "#",
                "PE": "#",
                "Physics": "#",
                "RAI": "#"
            },
            "FT": {
                "Bengali": "#",
                "Biology": "#",
                "Chemistry": "#",
                "Commerce": "#",
                "Computer": "#",
                "Economics": "#",
                "English Language": "#",
                "English Literature": "#",
                "EVA": "#",
                "EVS": "#",
                "French": "#",
                "Geography": "#",
                "German": "#",
                "Hindi": "#",
                "History": "#",
                "Home Science": "#",
                "Math": "#",
                "PE": "#",
                "Physics": "#",
                "RAI": "#"
            }
        },
        "Class 11": {
            "MT 1": {
                "Bengali": "#",
                "Biology": "#",
                "Chemistry": "#",
                "Commerce": "#",
                "Computer": "#",
                "Economics": "#",
                "English Language": "#",
                "English Literature": "#",
                "EVA": "#",
                "EVS": "#",
                "French": "#",
                "Geography": "#",
                "German": "#",
                "Hindi": "#",
                "History": "#",
                "Home Science": "#",
                "Math": "#",
                "PE": "#",
                "Physics": "#",
                "RAI": "#"
            },
            "MT 2": {
                "Bengali": "#",
                "Biology": "#",
                "Chemistry": "#",
                "Commerce": "#",
                "Computer": "#",
                "Economics": "#",
                "English Language": "#",
                "English Literature": "#",
                "EVA": "#",
                "EVS": "#",
                "French": "#",
                "Geography": "#",
                "German": "#",
                "Hindi": "#",
                "History": "#",
                "Home Science": "#",
                "Math": "#",
                "PE": "#",
                "Physics": "#",
                "RAI": "#"
            },
            "HY": {
                "Bengali": "#",
                "Biology": "#",
                "Chemistry": "#",
                "Commerce": "#",
                "Computer": "#",
                "Economics": "#",
                "English Language": "#",
                "English Literature": "#",
                "EVA": "#",
                "EVS": "#",
                "French": "#",
                "Geography": "#",
                "German": "#",
                "Hindi": "#",
                "History": "#",
                "Home Science": "#",
                "Math": "#",
                "PE": "#",
                "Physics": "#",
                "RAI": "#"
            },
            "FT": {
                "Bengali": "#",
                "Biology": "#",
                "Chemistry": "#",
                "Commerce": "#",
                "Computer": "#",
                "Economics": "#",
                "English Language": "#",
                "English Literature": "#",
                "EVA": "#",
                "EVS": "#",
                "French": "#",
                "Geography": "#",
                "German": "#",
                "Hindi": "#",
                "History": "#",
                "Home Science": "#",
                "Math": "#",
                "PE": "#",
                "Physics": "#",
                "RAI": "#"
            }
        },
        "Class 12": {
            "MT 1": {
                "Bengali": "#",
                "Biology": "#",
                "Chemistry": "#",
                "Commerce": "#",
                "Computer": "#",
                "Economics": "#",
                "English Language": "#",
                "English Literature": "#",
                "EVA": "#",
                "EVS": "#",
                "French": "#",
                "Geography": "#",
                "German": "#",
                "Hindi": "#",
                "History": "#",
                "Home Science": "#",
                "Math": "#",
                "PE": "#",
                "Physics": "#",
                "RAI": "#"
            },
            "MT 2": {
                "Bengali": "#",
                "Biology": "#",
                "Chemistry": "#",
                "Commerce": "#",
                "Computer": "#",
                "Economics": "#",
                "English Language": "#",
                "English Literature": "#",
                "EVA": "#",
                "EVS": "#",
                "French": "#",
                "Geography": "#",
                "German": "#",
                "Hindi": "#",
                "History": "#",
                "Home Science": "#",
                "Math": "#",
                "PE": "#",
                "Physics": "#",
                "RAI": "#"
            },
            "HY": {
                "Bengali": "#",
                "Biology": "#",
                "Chemistry": "#",
                "Commerce": "#",
                "Computer": "#",
                "Economics": "#",
                "English Language": "#",
                "English Literature": "#",
                "EVA": "#",
                "EVS": "#",
                "French": "#",
                "Geography": "#",
                "German": "#",
                "Hindi": "#",
                "History": "#",
                "Home Science": "#",
                "Math": "#",
                "PE": "#",
                "Physics": "#",
                "RAI": "#"
            },
            "FT": {
                "Bengali": "#",
                "Biology": "#",
                "Chemistry": "#",
                "Commerce": "#",
                "Computer": "#",
                "Economics": "#",
                "English Language": "#",
                "English Literature": "#",
                "EVA": "#",
                "EVS": "#",
                "French": "#",
                "Geography": "#",
                "German": "#",
                "Hindi": "#",
                "History": "#",
                "Home Science": "#",
                "Math": "#",
                "PE": "#",
                "Physics": "#",
                "RAI": "#"
            }
        }
    },
    "2024-25": {
        "Class 9": {
            "MT 1": {
                "Bengali": "documents/2024-25_CL_9_MT_1_Bengali.pdf",
                "Biology": "documents/2024-25_CL_9_MT_1_Biology.pdf",
                "Chemistry": "documents/2024-25_CL_9_MT_1_Chemistry.pdf",
                "Commerce": "documents/2024-25_CL_9_MT_1_Commerce.pdf",
                "Computer": "documents/2024-25_CL_9_MT_1_Computer.pdf",
                "Economics": "#",
                "English Language": "documents/2024-25_CL_9_MT_1_English_Language.pdf",
                "English Literature": "documents/2024-25_CL_9_MT_1_English_Literature.pdf",
                "EVA": "documents/2024-25_CL_9_MT_1_EVA.pdf",
                "EVS": "documents/2024-25_CL_9_MT_1_EVS.pdf",
                "French": "documents/2024-25_CL_9_MT_1_French.pdf",
                "Geography": "documents/2024-25_CL_9_MT_1_Geography.pdf",
                "German": "#",
                "Hindi": "documents/2024-25_CL_9_MT_1_Hindi.pdf",
                "History": "documents/2024-25_CL_9_MT_1_History.pdf",
                "Home Science": "documents/2024-25_CL_9_MT_1_Home_Science.pdf",
                "Math": "documents/2024-25_CL_9_MT_1_Math.pdf",
                "PE": "documents/2024-25_CL_9_MT_1_PE.pdf",
                "Physics": "documents/2024-25_CL_9_MT_1_Physics.pdf",
                "RAI": "documents/2024-25_CL_9_MT_1_RAI.pdf"
            },
            "MT 2": {
                "Bengali": "documents/2024-25_CL_9_MT_2_Bengali.pdf",
                "Biology": "documents/2024-25_CL_9_MT_2_Biology.pdf",
                "Chemistry": "documents/2024-25_CL_9_MT_2_Chemistry.pdf",
                "Commerce": "documents/2024-25_CL_9_MT_2_Commerce.pdf",
                "Computer": "documents/2024-25_CL_9_MT_2_Computer.pdf",
                "Economics": "documents/2024-25_CL_9_MT_2_Economics.pdf",
                "English Language": "documents/2024-25_CL_9_MT_2_English_Language.pdf",
                "English Literature": "documents/2024-25_CL_9_MT_2_English_Literature.pdf",
                "EVA": "documents/2024-25_CL_9_MT_2_EVA.pdf",
                "EVS": "documents/2024-25_CL_9_MT_2_EVS.pdf",
                "French": "documents/2024-25_CL_9_MT_2_French.pdf",
                "Geography": "documents/2024-25_CL_9_MT_2_Geography.pdf",
                "German": "documents/2024-25_CL_9_MT_2_German.pdf",
                "Hindi": "documents/2024-25_CL_9_MT_2_Hindi.pdf",
                "History": "documents/2024-25_CL_9_MT_2_History.pdf",
                "Home Science": "documents/2024-25_CL_9_MT_2_Home_Science.pdf",
                "Math": "documents/2024-25_CL_9_MT_2_Math.pdf",
                "PE": "documents/2024-25_CL_9_MT_2_PE.pdf",
                "Physics": "documents/2024-25_CL_9_MT_2_Physics.pdf",
                "RAI": "#"
            },
            "HY": {
                "Bengali": "#",
                "Biology": "documents/2024-25_CL_9_HY_Biology.pdf",
                "Chemistry": "documents/2024-25_CL_9_HY_Chemistry.pdf",
                "Commerce": "documents/2024-25_CL_9_HY_Commerce.pdf",
                "Computer": "documents/2024-25_CL_9_HY_Computer.pdf",
                "Economics": "documents/2024-25_CL_9_HY_Economics.pdf",
                "English Language": "documents/2024-25_CL_9_HY_English_Language.pdf",
                "English Literature": "documents/2024-25_CL_9_HY_English_Literature.pdf",
                "EVA": "documents/2024-25_CL_9_HY_EVA.pdf",
                "EVS": "documents/2024-25_CL_9_HY_EVS.pdf",
                "French": "documents/2024-25_CL_9_HY_French.pdf",
                "Geography": "documents/2024-25_CL_9_HY_Geography.pdf",
                "German": "documents/2024-25_CL_9_HY_German.pdf",
                "Hindi": "documents/2024-25_CL_9_HY_Hindi.pdf",
                "History": "documents/2024-25_CL_9_HY_History.pdf",
                "Home Science": "documents/2024-25_CL_9_HY_Home_Science.pdf",
                "Math": "documents/2024-25_CL_9_HY_Math.pdf",
                "PE": "documents/2024-25_CL_9_HY_PE.pdf",
                "Physics": "documents/2024-25_CL_9_HY_Physics.pdf",
                "RAI": "documents/2024-25_CL_9_HY_RAI.pdf"
            },
            "FT": {
                "Bengali": "documents/2024-25_CL_9_FT_Bengali.pdf",
                "Biology": "documents/2024-25_CL_9_FT_Biology.pdf",
                "Chemistry": "documents/2024-25_CL_9_FT_Chemistry.pdf",
                "Commerce": "documents/2024-25_CL_9_FT_Commerce.pdf",
                "Computer": "documents/2024-25_CL_9_FT_Computer.pdf",
                "Economics": "documents/2024-25_CL_9_FT_Economics.pdf",
                "English Language": "documents/2024-25_CL_9_FT_English_Language.pdf",
                "English Literature": "documents/2024-25_CL_9_FT_English_Literature.pdf",
                "EVA": "documents/2024-25_CL_9_FT_EVA.pdf",
                "EVS": "documents/2024-25_CL_9_FT_EVS.pdf",
                "French": "documents/2024-25_CL_9_FT_French_Language.pdf",
                "Geography": "documents/2024-25_CL_9_FT_Geography.pdf",
                "German": "documents/2024-25_CL_9_FT_German.pdf",
                "Hindi": "documents/2024-25_CL_9_FT_Hindi.pdf",
                "History": "documents/2024-25_CL_9_FT_History.pdf",
                "Home Science": "documents/2024-25_CL_9_FT_Home_Science.pdf",
                "Math": "documents/2024-25_CL_9_FT_Math.pdf",
                "PE": "documents/2024-25_CL_9_FT_PE.pdf",
                "Physics": "documents/2024-25_CL_9_FT_Physics.pdf",
                "RAI": "documents/2024-25_CL_9_FT_RAI.pdf"
            }
        },
        "Class 10": {
            "MT 1": {
                "Bengali": "#",
                "Biology": "#",
                "Chemistry": "#",
                "Commerce": "#",
                "Computer": "#",
                "Economics": "#",
                "English Language": "#",
                "English Literature": "#",
                "EVA": "#",
                "EVS": "#",
                "French": "#",
                "Geography": "#",
                "German": "#",
                "Hindi": "#",
                "History": "#",
                "Home Science": "#",
                "Math": "#",
                "PE": "#",
                "Physics": "#",
                "RAI": "#"
            },
            "MT 2": {
                "Bengali": "#",
                "Biology": "#",
                "Chemistry": "#",
                "Commerce": "#",
                "Computer": "#",
                "Economics": "#",
                "English Language": "#",
                "English Literature": "#",
                "EVA": "#",
                "EVS": "#",
                "French": "#",
                "Geography": "#",
                "German": "#",
                "Hindi": "#",
                "History": "#",
                "Home Science": "#",
                "Math": "#",
                "PE": "#",
                "Physics": "#",
                "RAI": "#"
            },
            "HY": {
                "Bengali": "#",
                "Biology": "#",
                "Chemistry": "#",
                "Commerce": "#",
                "Computer": "#",
                "Economics": "#",
                "English Language": "#",
                "English Literature": "#",
                "EVA": "#",
                "EVS": "#",
                "French": "#",
                "Geography": "#",
                "German": "#",
                "Hindi": "#",
                "History": "#",
                "Home Science": "#",
                "Math": "#",
                "PE": "#",
                "Physics": "#",
                "RAI": "#"
            },
            "FT": {
                "Bengali": "#",
                "Biology": "#",
                "Chemistry": "#",
                "Commerce": "#",
                "Computer": "#",
                "Economics": "#",
                "English Language": "#",
                "English Literature": "#",
                "EVA": "#",
                "EVS": "#",
                "French": "#",
                "Geography": "#",
                "German": "#",
                "Hindi": "#",
                "History": "#",
                "Home Science": "#",
                "Math": "#",
                "PE": "#",
                "Physics": "#",
                "RAI": "#"
            }
        },
        "Class 11": {
            "MT 1": {
                "Bengali": "#",
                "Biology": "#",
                "Chemistry": "#",
                "Commerce": "#",
                "Computer": "#",
                "Economics": "#",
                "English Language": "#",
                "English Literature": "#",
                "EVA": "#",
                "EVS": "#",
                "French": "#",
                "Geography": "#",
                "German": "#",
                "Hindi": "#",
                "History": "#",
                "Home Science": "#",
                "Math": "#",
                "PE": "#",
                "Physics": "#",
                "RAI": "#"
            },
            "MT 2": {
                "Bengali": "#",
                "Biology": "#",
                "Chemistry": "#",
                "Commerce": "#",
                "Computer": "#",
                "Economics": "#",
                "English Language": "#",
                "English Literature": "#",
                "EVA": "#",
                "EVS": "#",
                "French": "#",
                "Geography": "#",
                "German": "#",
                "Hindi": "#",
                "History": "#",
                "Home Science": "#",
                "Math": "#",
                "PE": "#",
                "Physics": "#",
                "RAI": "#"
            },
            "HY": {
                "Bengali": "#",
                "Biology": "#",
                "Chemistry": "#",
                "Commerce": "#",
                "Computer": "#",
                "Economics": "#",
                "English Language": "#",
                "English Literature": "#",
                "EVA": "#",
                "EVS": "#",
                "French": "#",
                "Geography": "#",
                "German": "#",
                "Hindi": "#",
                "History": "#",
                "Home Science": "#",
                "Math": "#",
                "PE": "#",
                "Physics": "#",
                "RAI": "#"
            },
            "FT": {
                "Bengali": "#",
                "Biology": "#",
                "Chemistry": "#",
                "Commerce": "#",
                "Computer": "#",
                "Economics": "#",
                "English Language": "#",
                "English Literature": "#",
                "EVA": "#",
                "EVS": "#",
                "French": "#",
                "Geography": "#",
                "German": "#",
                "Hindi": "#",
                "History": "#",
                "Home Science": "#",
                "Math": "#",
                "PE": "#",
                "Physics": "#",
                "RAI": "#"
            }
        },
        "Class 12": {
            "MT 1": {
                "Bengali": "#",
                "Biology": "#",
                "Chemistry": "#",
                "Commerce": "#",
                "Computer": "#",
                "Economics": "#",
                "English Language": "#",
                "English Literature": "#",
                "EVA": "#",
                "EVS": "#",
                "French": "#",
                "Geography": "#",
                "German": "#",
                "Hindi": "#",
                "History": "#",
                "Home Science": "#",
                "Math": "#",
                "PE": "#",
                "Physics": "#",
                "RAI": "#"
            },
            "MT 2": {
                "Bengali": "#",
                "Biology": "#",
                "Chemistry": "#",
                "Commerce": "#",
                "Computer": "#",
                "Economics": "#",
                "English Language": "#",
                "English Literature": "#",
                "EVA": "#",
                "EVS": "#",
                "French": "#",
                "Geography": "#",
                "German": "#",
                "Hindi": "#",
                "History": "#",
                "Home Science": "#",
                "Math": "#",
                "PE": "#",
                "Physics": "#",
                "RAI": "#"
            },
            "HY": {
                "Bengali": "#",
                "Biology": "#",
                "Chemistry": "#",
                "Commerce": "#",
                "Computer": "#",
                "Economics": "#",
                "English Language": "#",
                "English Literature": "#",
                "EVA": "#",
                "EVS": "#",
                "French": "#",
                "Geography": "#",
                "German": "#",
                "Hindi": "#",
                "History": "#",
                "Home Science": "#",
                "Math": "#",
                "PE": "#",
                "Physics": "#",
                "RAI": "#"
            },
            "FT": {
                "Bengali": "#",
                "Biology": "#",
                "Chemistry": "#",
                "Commerce": "#",
                "Computer": "#",
                "Economics": "#",
                "English Language": "#",
                "English Literature": "#",
                "EVA": "#",
                "EVS": "#",
                "French": "#",
                "Geography": "#",
                "German": "#",
                "Hindi": "#",
                "History": "#",
                "Home Science": "#",
                "Math": "#",
                "PE": "#",
                "Physics": "#",
                "RAI": "#"
            }
        }
    },
    "2025-26": {
        "Class 9": {
            "MT 1": {
                "Bengali": "documents/2025-26_CL_9_MT_1_Bengali.pdf",
                "Biology": "documents/2025-26_CL_9_MT_1_Biology.pdf",
                "Chemistry": "documents/2025-26_CL_9_MT_1_Chemistry.pdf",
                "Commerce": "documents/2025-26_CL_9_MT_1_Commerce.pdf",
                "Computer": "documents/2025-26_CL_9_MT_1_Computer.pdf",
                "Economics": "documents/2025-26_CL_9_MT_1_Economics.pdf",
                "English Language": "documents/2025-26_CL_9_MT_1_English_Language.pdf",
                "English Literature": "documents/2025-26_CL_9_MT_1_English_Literature.pdf",
                "EVA": "documents/2025-26_CL_9_MT_1_EVA.pdf",
                "EVS": "documents/2025-26_CL_9_MT_1_EVS.pdf",
                "French": "documents/2025-26_CL_9_MT_1_French.pdf",
                "Geography": "#",
                "German": "documents/2025-26_CL_9_MT_1_German.pdf",
                "Hindi": "documents/2025-26_CL_9_MT_1_Hindi.pdf",
                "History": "#",
                "Home Science": "documents/2025-26_CL_9_MT_1_Home_Science.pdf",
                "Math": "documents/2025-26_CL_9_MT_1_Math.pdf",
                "PE": "documents/2025-26_CL_9_MT_1_PE.pdf",
                "Physics": "documents/2025-26_CL_9_MT_1_Physics.pdf",
                "RAI": "documents/2025-26_CL_9_MT_1_RAI.pdf"
            },
            "MT 2": {
                "Bengali": "#",
                "Biology": "#",
                "Chemistry": "#",
                "Commerce": "#",
                "Computer": "#",
                "Economics": "#",
                "English Language": "#",
                "English Literature": "#",
                "EVA": "#",
                "EVS": "#",
                "French": "#",
                "Geography": "#",
                "German": "#",
                "Hindi": "#",
                "History": "#",
                "Home Science": "#",
                "Math": "#",
                "PE": "#",
                "Physics": "#",
                "RAI": "#"
            },
            "HY": {
                "Bengali": "#",
                "Biology": "#",
                "Chemistry": "#",
                "Commerce": "#",
                "Computer": "#",
                "Economics": "#",
                "English Language": "#",
                "English Literature": "#",
                "EVA": "#",
                "EVS": "#",
                "French": "#",
                "Geography": "#",
                "German": "#",
                "Hindi": "#",
                "History": "#",
                "Home Science": "#",
                "Math": "#",
                "PE": "#",
                "Physics": "#",
                "RAI": "#"
            },
            "FT": {
                "Bengali": "#",
                "Biology": "#",
                "Chemistry": "#",
                "Commerce": "#",
                "Computer": "#",
                "Economics": "#",
                "English Language": "#",
                "English Literature": "#",
                "EVA": "#",
                "EVS": "#",
                "French": "#",
                "Geography": "#",
                "German": "#",
                "Hindi": "#",
                "History": "#",
                "Home Science": "#",
                "Math": "#",
                "PE": "#",
                "Physics": "#",
                "RAI": "#"
            }
        },
        "Class 10": {
            "MT 1": {
                "Bengali": "#",
                "Biology": "#",
                "Chemistry": "#",
                "Commerce": "#",
                "Computer": "#",
                "Economics": "#",
                "English Language": "#",
                "English Literature": "#",
                "EVA": "#",
                "EVS": "#",
                "French": "#",
                "Geography": "#",
                "German": "#",
                "Hindi": "#",
                "History": "#",
                "Home Science": "#",
                "Math": "#",
                "PE": "#",
                "Physics": "#",
                "RAI": "#"
            },
            "MT 2": {
                "Bengali": "#",
                "Biology": "#",
                "Chemistry": "#",
                "Commerce": "#",
                "Computer": "#",
                "Economics": "#",
                "English Language": "#",
                "English Literature": "#",
                "EVA": "#",
                "EVS": "#",
                "French": "#",
                "Geography": "#",
                "German": "#",
                "Hindi": "#",
                "History": "#",
                "Home Science": "#",
                "Math": "#",
                "PE": "#",
                "Physics": "#",
                "RAI": "#"
            },
            "HY": {
                "Bengali": "#",
                "Biology": "#",
                "Chemistry": "#",
                "Commerce": "#",
                "Computer": "#",
                "Economics": "#",
                "English Language": "#",
                "English Literature": "#",
                "EVA": "#",
                "EVS": "#",
                "French": "#",
                "Geography": "#",
                "German": "#",
                "Hindi": "#",
                "History": "#",
                "Home Science": "#",
                "Math": "#",
                "PE": "#",
                "Physics": "#",
                "RAI": "#"
            },
            "FT": {
                "Bengali": "#",
                "Biology": "#",
                "Chemistry": "#",
                "Commerce": "#",
                "Computer": "#",
                "Economics": "#",
                "English Language": "#",
                "English Literature": "#",
                "EVA": "#",
                "EVS": "#",
                "French": "#",
                "Geography": "#",
                "German": "#",
                "Hindi": "#",
                "History": "#",
                "Home Science": "#",
                "Math": "#",
                "PE": "#",
                "Physics": "#",
                "RAI": "#"
            }
        },
        "Class 11": {
            "MT 1": {
                "Bengali": "#",
                "Biology": "#",
                "Chemistry": "#",
                "Commerce": "#",
                "Computer": "#",
                "Economics": "#",
                "English Language": "#",
                "English Literature": "#",
                "EVA": "#",
                "EVS": "#",
                "French": "#",
                "Geography": "#",
                "German": "#",
                "Hindi": "#",
                "History": "#",
                "Home Science": "#",
                "Math": "#",
                "PE": "#",
                "Physics": "#",
                "RAI": "#"
            },
            "MT 2": {
                "Bengali": "#",
                "Biology": "#",
                "Chemistry": "#",
                "Commerce": "#",
                "Computer": "#",
                "Economics": "#",
                "English Language": "#",
                "English Literature": "#",
                "EVA": "#",
                "EVS": "#",
                "French": "#",
                "Geography": "#",
                "German": "#",
                "Hindi": "#",
                "History": "#",
                "Home Science": "#",
                "Math": "#",
                "PE": "#",
                "Physics": "#",
                "RAI": "#"
            },
            "HY": {
                "Bengali": "#",
                "Biology": "#",
                "Chemistry": "#",
                "Commerce": "#",
                "Computer": "#",
                "Economics": "#",
                "English Language": "#",
                "English Literature": "#",
                "EVA": "#",
                "EVS": "#",
                "French": "#",
                "Geography": "#",
                "German": "#",
                "Hindi": "#",
                "History": "#",
                "Home Science": "#",
                "Math": "#",
                "PE": "#",
                "Physics": "#",
                "RAI": "#"
            },
            "FT": {
                "Bengali": "#",
                "Biology": "#",
                "Chemistry": "#",
                "Commerce": "#",
                "Computer": "#",
                "Economics": "#",
                "English Language": "#",
                "English Literature": "#",
                "EVA": "#",
                "EVS": "#",
                "French": "#",
                "Geography": "#",
                "German": "#",
                "Hindi": "#",
                "History": "#",
                "Home Science": "#",
                "Math": "#",
                "PE": "#",
                "Physics": "#",
                "RAI": "#"
            }
        },
        "Class 12": {
            "MT 1": {
                "Bengali": "#",
                "Biology": "#",
                "Chemistry": "#",
                "Commerce": "#",
                "Computer": "#",
                "Economics": "#",
                "English Language": "#",
                "English Literature": "#",
                "EVA": "#",
                "EVS": "#",
                "French": "#",
                "Geography": "#",
                "German": "#",
                "Hindi": "#",
                "History": "#",
                "Home Science": "#",
                "Math": "#",
                "PE": "#",
                "Physics": "#",
                "RAI": "#"
            },
            "MT 2": {
                "Bengali": "#",
                "Biology": "#",
                "Chemistry": "#",
                "Commerce": "#",
                "Computer": "#",
                "Economics": "#",
                "English Language": "#",
                "English Literature": "#",
                "EVA": "#",
                "EVS": "#",
                "French": "#",
                "Geography": "#",
                "German": "#",
                "Hindi": "#",
                "History": "#",
                "Home Science": "#",
                "Math": "#",
                "PE": "#",
                "Physics": "#",
                "RAI": "#"
            },
            "HY": {
                "Bengali": "#",
                "Biology": "#",
                "Chemistry": "#",
                "Commerce": "#",
                "Computer": "#",
                "Economics": "#",
                "English Language": "#",
                "English Literature": "#",
                "EVA": "#",
                "EVS": "#",
                "French": "#",
                "Geography": "#",
                "German": "#",
                "Hindi": "#",
                "History": "#",
                "Home Science": "#",
                "Math": "#",
                "PE": "#",
                "Physics": "#",
                "RAI": "#"
            },
            "FT": {
                "Bengali": "#",
                "Biology": "#",
                "Chemistry": "#",
                "Commerce": "#",
                "Computer": "#",
                "Economics": "#",
                "English Language": "#",
                "English Literature": "#",
                "EVA": "#",
                "EVS": "#",
                "French": "#",
                "Geography": "#",
                "German": "#",
                "Hindi": "#",
                "History": "#",
                "Home Science": "#",
                "Math": "#",
                "PE": "#",
                "Physics": "#",
                "RAI": "#"
            }
        }
    },
    "Study Materials": {
        "Biology Class 10 Book PDFS":{
          "Biology Class 10 Book PDFS Endocrine System": "documents/Study_Material_Class_9_Biology_Class_10_Book_PDFS_Endocrine_System.pdf",
          "Biology Class 10 Book PDFS Excretory System": "documents/Study_Material_Class_9_Biology_Class_10_Book_PDFS_Excretory_System.pdf",
          "Biology Class 10 Book PDFS Reproduction": "documents/Study_Material_Class_9_Biology_Class_10_Book_PDFS_Reproduction.pdf",
          "Biology Class 10 Book PDFS Full Book": "documents/Study_Material_Class_9_Biology_Class_10_Book_PDFS_Full_Book.pdf",
        },
        "Physics FT":{
          "Physics FT Current Electricity": "documents/Study_Material_Class_9_Physics_FT_Current_Electricity.pdf",
          "Physics FT Heat and Energy": "documents/Study_Material_Class_9_Physics_FT_Heat_and_Energy.pdf",
          "Physics FT Magnetism": "documents/Study_Material_Class_9_Physics_FT_Magnetism.pdf",
          "Physics FT Propagation of Sound Waves": "documents/Study_Material_Class_9_Physics_FT_Propagation_of_Sound_Waves.pdf",
          "Physics FT Reflection of Light": "documents/Study_Material_Class_9_Physics_FT_Reflection_of_Light.pdf",
          "Physics FT  Principle and Floatation": "documents/Study_Material_Class_9_Physics_FT__Principle_and_Floatation.pdf"

        }
    }
};



function loadNotes() {
  notes = JSON.parse(localStorage.getItem('questionary-notes') || '[]');
}

function saveNotes() {
  localStorage.setItem('questionary-notes', JSON.stringify(notes));
}

function openNoteModal(noteId = null) {
  const modal = document.getElementById('noteModal');
  const titleInput = document.getElementById('noteTitle');
  const contentInput = document.getElementById('noteContent');
  const modalTitle = document.getElementById('noteModalTitle');
  
  if (!modal) { console.error('Note modal not found'); return; }
  
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
  const titleInput = document.getElementById('noteTitle');
  const contentInput = document.getElementById('noteContent');
  const modal = document.getElementById('noteModal');
  
  const title = titleInput?.value.trim();
  const content = contentInput?.value.trim();
  
  if (!title) {
    showNotification('Please enter a title', 'error');
    return;
  }
  
  if (currentEditingNote) {
    currentEditingNote.title = title;
    currentEditingNote.content = content;
    currentEditingNote.updatedAt = Date.now();
  } else {
    notes.push({
      id: Date.now().toString(),
      title,
      content,
      createdAt: Date.now(),
      updatedAt: Date.now()
    });
  }
  
  saveNotes();
  renderNotes();
  modal?.classList.remove('active');
  showNotification(currentEditingNote ? 'Note updated!' : 'Note created!', 'success');
  currentEditingNote = null;
}

function editNote(noteId) {
  openNoteModal(noteId);
}

function deleteNote(noteId) {
  const note = notes.find(n => n.id === noteId);
  const noteTitle = note ? note.title : 'this note';
  
  showConfirmModal(
    'Delete Note',
    `Are you sure you want to delete "${noteTitle}"? This action cannot be undone.`,
    () => {
      notes = notes.filter(n => n.id !== noteId);
      saveNotes();
      renderNotes();
      showNotification('Note deleted', 'info');
    }
  );
}

function loadFlashcardDecks() {
  flashcardDecks = JSON.parse(localStorage.getItem('questionary-flashcards') || '[]');
}

function saveFlashcardDecks() {
  localStorage.setItem('questionary-flashcards', JSON.stringify(flashcardDecks));
}

function openFlashcardModal(deckId = null) {
  const modal = document.getElementById('flashcardModal');
  const nameInput = document.getElementById('deckName');
  const cardsContainer = document.getElementById('cardsContainer');
  const modalTitle = document.getElementById('flashcardModalTitle');
  
  if (!modal) { console.error('Flashcard modal not found'); return; }
  
  if (deckId) {
    const deck = flashcardDecks.find(d => d.id === deckId);
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
  
  if (!name) {
    showNotification('Please enter a deck name', 'error');
    return;
  }
  
  const cardEditors = document.querySelectorAll('.card-editor');
  const cards = [];
  cardEditors.forEach(editor => {
    const front = editor.querySelector('.card-front')?.value.trim();
    const back = editor.querySelector('.card-back')?.value.trim();
    if (front && back) {
      cards.push({ front, back });
    }
  });
  
  if (cards.length === 0) {
    showNotification('Please add at least one card with both front and back', 'error');
    return;
  }
  
  if (currentEditingDeck) {
    currentEditingDeck.name = name;
    currentEditingDeck.cards = cards;
  } else {
    flashcardDecks.push({
      id: Date.now().toString(),
      name,
      cards
    });
  }
  
  saveFlashcardDecks();
  renderFlashcardDecks();
  modal?.classList.remove('active');
  showNotification(currentEditingDeck ? 'Deck updated!' : 'Deck created!', 'success');
  currentEditingDeck = null;
}

function deleteDeck(deckId) {
  const deck = flashcardDecks.find(d => d.id === deckId);
  const deckName = deck ? deck.name : 'this deck';
  
  showConfirmModal(
    'Delete Flashcard Deck',
    `Are you sure you want to delete "${deckName}"? All cards in this deck will be lost.`,
    () => {
      flashcardDecks = flashcardDecks.filter(d => d.id !== deckId);
      saveFlashcardDecks();
      renderFlashcardDecks();
      showNotification('Deck deleted', 'info');
    }
  );
}

function startStudyDeck(deckId) {
  const deck = flashcardDecks.find(d => d.id === deckId);
  if (!deck || deck.cards.length === 0) return;
  
  currentStudyDeck = deck;
  currentCardIndex = 0;
  
  const modal = document.getElementById('studyModal');
  if (modal) {
    modal.classList.add('active');
    showCurrentCard();
  }
}

function showCurrentCard() {
  if (!currentStudyDeck) return;
  
  const card = currentStudyDeck.cards[currentCardIndex];
  const flashcard = document.getElementById('activeFlashcard');
  const counter = document.getElementById('cardProgress');
  const frontEl = document.getElementById('cardFront');
  const backEl = document.getElementById('cardBack');
  
  if (flashcard) {
    flashcard.classList.remove('flipped');
  }
  if (frontEl) frontEl.textContent = card.front;
  if (backEl) backEl.textContent = card.back;
  
  if (counter) {
    counter.textContent = `${currentCardIndex + 1} / ${currentStudyDeck.cards.length}`;
  }
}

function flipCard() {
  const flashcard = document.getElementById('activeFlashcard');
  flashcard?.classList.toggle('flipped');
}

function nextCard() {
  if (!currentStudyDeck) return;
  currentCardIndex = (currentCardIndex + 1) % currentStudyDeck.cards.length;
  showCurrentCard();
}

function prevCard() {
  if (!currentStudyDeck) return;
  currentCardIndex = (currentCardIndex - 1 + currentStudyDeck.cards.length) % currentStudyDeck.cards.length;
  showCurrentCard();
}

function loadStudySessions() {
  studySessions = JSON.parse(localStorage.getItem('questionary-sessions') || '[]');
}

function saveStudySessions() {
  localStorage.setItem('questionary-sessions', JSON.stringify(studySessions));
}

function openSessionModal() {
  const modal = document.getElementById('sessionModal');
  const subjectInput = document.getElementById('sessionSubject');
  const dateInput = document.getElementById('sessionDate');
  const timeInput = document.getElementById('sessionTime');
  
  if (!modal) { console.error('Session modal not found'); return; }
  
  if (subjectInput) subjectInput.value = '';
  if (dateInput) dateInput.value = new Date().toISOString().split('T')[0];
  if (timeInput) timeInput.value = '09:00';
  
  modal.classList.add('active');
}

function saveSession() {
  const subjectInput = document.getElementById('sessionSubject');
  const dateInput = document.getElementById('sessionDate');
  const timeInput = document.getElementById('sessionTime');
  const modal = document.getElementById('sessionModal');
  
  const subject = subjectInput?.value.trim();
  const date = dateInput?.value;
  const time = timeInput?.value;
  
  if (!subject) {
    showNotification('Please enter a subject', 'error');
    return;
  }
  
  if (!date) {
    showNotification('Please select a date', 'error');
    return;
  }
  
  studySessions.push({
    id: Date.now().toString(),
    subject,
    date,
    time: time || '09:00'
  });
  
  saveStudySessions();
  renderCalendar();
  renderSessions();
  modal?.classList.remove('active');
  showNotification('Session added!', 'success');
}

function deleteSession(sessionId) {
  const session = studySessions.find(s => s.id === sessionId);
  const sessionSubject = session ? session.subject : 'this session';
  
  showConfirmModal(
    'Delete Study Session',
    `Are you sure you want to delete the "${sessionSubject}" session?`,
    () => {
      studySessions = studySessions.filter(s => s.id !== sessionId);
      saveStudySessions();
      renderCalendar();
      renderSessions();
      showNotification('Session deleted', 'info');
    }
  );
}

function showDaySessions(dateStr) {
  const sessionsOnDay = studySessions.filter(s => s.date === dateStr);
  if (sessionsOnDay.length === 0) {
    showNotification(`No sessions on ${dateStr}`, 'info');
  } else {
    const list = sessionsOnDay.map(s => `• ${s.subject} at ${s.time}`).join('\n');
    alert(`Sessions on ${dateStr}:\n\n${list}`);
  }
}

function loadStudyStats() {
  studyStats = JSON.parse(localStorage.getItem('questionary-study-stats') || '{"totalTime":0,"streak":0,"lastStudyDate":null,"hourlyActivity":{}}');
}

function loadDocumentProgress() {
  documentProgress = JSON.parse(localStorage.getItem('questionary-doc-progress') || '{}');
}

window.openNoteModal = openNoteModal;
window.saveNote = saveNote;
window.deleteNote = deleteNote;
window.editNote = editNote;
window.openFlashcardModal = openFlashcardModal;
window.addCardEditor = addCardEditor;
window.saveDeck = saveDeck;
window.deleteDeck = deleteDeck;
window.startStudyDeck = startStudyDeck;
window.flipCard = flipCard;
window.nextCard = nextCard;
window.prevCard = prevCard;
window.openSessionModal = openSessionModal;
window.saveSession = saveSession;
window.deleteSession = deleteSession;
window.showDaySessions = showDaySessions;


// Main initialization function
async function initializeApp() {
  console.log('[App] Starting initialization...');
  
  // Show the Tauri window once DOM is ready (handles splash screen)
  if (window.__TAURI__ && window.__TAURI__.window) {
    try {
      const currentWindow = window.__TAURI__.window.getCurrentWindow();
      await currentWindow.show();
      await currentWindow.setFocus();
      console.log('[App] Window shown');
    } catch (e) {
      console.log('Could not show window:', e);
    }
  }
  
  await initializeFavorites();
  
  applyAccessibilitySettings();
  
  
  if (typeof initializeNewFeatures === 'function') {
    initializeNewFeatures();
  }
  
  
  const themeToggle = document.getElementById('themeToggle');
  const themeIcon = document.getElementById('themeIcon');
  
  
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
    themeToggle.addEventListener('click', () => {
      const currentTheme = document.documentElement.getAttribute('data-theme');
      const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', newTheme);
      localStorage.setItem('theme', newTheme);
      updateThemeIcon(newTheme);
    });
  }
  
  
  const accessibilityToggle = document.getElementById('accessibilityToggle');
  const accessibilityPanel = document.getElementById('accessibilityPanel');
  if (accessibilityToggle && accessibilityPanel) {
    accessibilityToggle.addEventListener('click', (e) => {
      e.stopPropagation();
      accessibilityPanel.classList.toggle('active');
      console.log('Accessibility panel toggled:', accessibilityPanel.classList.contains('active'));
    });
    
    document.addEventListener('click', (e) => {
      if (!e.target.closest('#accessibilityPanel') && !e.target.closest('#accessibilityToggle')) {
        accessibilityPanel.classList.remove('active');
      }
    });
  }
  
  
  const loginForm = document.getElementById('loginForm');
  if (loginForm) {
    loginForm.addEventListener('submit', handleLogin);
  }
  
  
  checkSavedLogin();
  
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
  
  // Initialize content update system (incremental updates)
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
  console.log('Questionary application initialized successfully');
}

// Ensure initialization runs whether DOM is loaded or not
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeApp);
} else {
  // DOM already loaded, run immediately
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
  console.log('Login form submitted');
  
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
  
  console.log('Attempting login for:', username);
  
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
  
  // No saved login found - hide loading overlay to show login screen
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
  const mobileMenuToggle = document.getElementById('mobileMenuToggle');
  const navLinks = document.getElementById('navLinks');
  const backBtn = document.getElementById('backBtn');
  
  
  if (backBtn) {
    backBtn.addEventListener('click', handleBackButton);
  }
  
  
  mobileMenuToggle && mobileMenuToggle.addEventListener('click', () => {
    navLinks && navLinks.classList.toggle('active');
    
    const icon = mobileMenuToggle.querySelector('i');
    if (icon) {
      icon.classList.toggle('fa-bars');
      icon.classList.toggle('fa-times');
    }
  });
  
  
  document.addEventListener('click', (e) => {
    if (navLinks && navLinks.classList.contains('active')) {
      if (!e.target.closest('.nav-links') && !e.target.closest('.mobile-menu-toggle')) {
        navLinks.classList.remove('active');
        const icon = mobileMenuToggle?.querySelector('i');
        if (icon) {
          icon.classList.add('fa-bars');
          icon.classList.remove('fa-times');
        }
      }
    }
  });
  
  
  const closeMenuOnClick = () => {
        if (navLinks && window.innerWidth <= 768) {
      navLinks.classList.remove('active');
      const icon = mobileMenuToggle?.querySelector('i');
      if (icon) {
        icon.classList.add('fa-bars');
        icon.classList.remove('fa-times');
      }
    }
        if (document.body.classList.contains('vertical-navbar-mode')) {
      closeSidebar();
    }
  };
  
  homeNav && homeNav.addEventListener('click', () => {
    showView('home');
    path = [];
    renderTiles(documents);
    updateBreadcrumb();
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
  });
  
  progressNav && progressNav.addEventListener('click', () => {
    showView('progress');
    setActiveNav('progressNav');
    closeMenuOnClick();
  });
}


function initializeGlobalSearch() {
  const searchInput = document.getElementById('globalSearch');
  const searchResults = document.getElementById('searchResults');
  
  searchInput && searchInput.addEventListener('input', performSearch);
  searchInput && searchInput.addEventListener('focus', () => {
    if (searchInput.value.trim()) performSearch();
  });
  
  document.addEventListener('click', (e) => {
    if (searchResults && !e.target.closest('.search-container')) {
      searchResults.style.display = 'none';
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
  if (!toggle) {
    console.log('Toggle not found:', toggleId);
    return;
  }
  
  
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
    console.log('Toggled', settingKey, 'to', accessibilitySettings[settingKey]);
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
    if (toggle && accessibilitySettings[key]) {
      toggle.classList.add('active');
    }
  });
}

function initializeKeyboardNavigation() {
  document.addEventListener('keydown', (e) => {
    
    const isInputFocused = e.target.closest('input, textarea');
    
    if (e.key === 'Escape') {
      
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
      
      
      const pdfViewer = document.getElementById('pdfViewer');
      if (pdfViewer && pdfViewer.style.display === 'block') {
        pdfViewer.style.display = 'none';
        pdfViewer.src = '';
        const tilesSection = document.getElementById('tilesSection');
        const dashboardHeader = document.querySelector('.dashboard-header');
        tilesSection && (tilesSection.style.display = 'block');
        dashboardHeader && (dashboardHeader.style.display = 'flex');
        hideTimerCompletely();
        return;
      }
      
      
      if (path.length > 0) {
        handleBackButton();
        return;
      }
      
      
      if (currentView !== 'home') {
        showView('home');
        path = [];
        renderTiles(documents);
        updateBreadcrumb();
        setActiveNav('homeNav');
        return;
      }
    }
    
    if (e.key === '/' && !isInputFocused) {
      e.preventDefault();
      document.getElementById('globalSearch')?.focus();
    }
    
    if (e.key === 'Backspace' && !isInputFocused && path.length > 0) {
      handleBackButton();
    }
    
    
    if (e.altKey && e.key === 'ArrowLeft' && !isInputFocused) {
      e.preventDefault();
      const pdfViewer = document.getElementById('pdfViewer');
      if (pdfViewer && pdfViewer.style.display === 'block') {
        pdfViewer.style.display = 'none';
        pdfViewer.src = '';
        const tilesSection = document.getElementById('tilesSection');
        const dashboardHeader = document.querySelector('.dashboard-header');
        tilesSection && (tilesSection.style.display = 'block');
        dashboardHeader && (dashboardHeader.style.display = 'flex');
        hideTimerCompletely();
      } else if (path.length > 0) {
        handleBackButton();
      } else if (currentView !== 'home') {
        showView('home');
        path = [];
        renderTiles(documents);
        updateBreadcrumb();
        setActiveNav('homeNav');
      }
    }
    
    
    if (e.altKey && e.key === 'Home' && !isInputFocused) {
      e.preventDefault();
      const pdfViewer = document.getElementById('pdfViewer');
      if (pdfViewer) {
        pdfViewer.style.display = 'none';
        pdfViewer.src = '';
      }
      hideTimerCompletely();
      showView('home');
      path = [];
      renderTiles(documents);
      updateBreadcrumb();
      setActiveNav('homeNav');
    }
  });
}


function showView(viewName) {
  currentView = viewName;
  
  
  const tilesSection = document.getElementById('tilesSection');
  const favoritesSection = document.getElementById('favoritesSection');
  const recentSection = document.getElementById('recentSection');
  const analyticsSection = document.getElementById('analyticsSection');
  const plannerSection = document.getElementById('plannerSection');
  const flashcardsSection = document.getElementById('flashcardsSection');
  const notesSection = document.getElementById('notesSection');
  const progressSection = document.getElementById('progressSection');
  const searchResults = document.getElementById('searchResults');
  const dashboardHeader = document.querySelector('.dashboard-header');
  const breadcrumb = document.getElementById('breadcrumb');
  const backBtn = document.getElementById('backBtn');
  const pdfViewer = document.getElementById('pdfViewer');
  
  
  const allSections = [tilesSection, favoritesSection, recentSection, analyticsSection, 
                       plannerSection, flashcardsSection, notesSection, progressSection];
  allSections.forEach(section => {
    if (section) section.style.display = 'none';
  });
  if (searchResults) searchResults.style.display = 'none';
  if (pdfViewer) pdfViewer.style.display = 'none';
  
  
  switch(viewName) {
    case 'home':
      if (tilesSection) tilesSection.style.display = 'block';
      if (dashboardHeader) dashboardHeader.style.display = 'flex';
      if (breadcrumb) breadcrumb.style.display = 'flex';
      if (backBtn) backBtn.style.display = path.length > 0 ? 'flex' : 'none';
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
    default:
      if (tilesSection) tilesSection.style.display = 'block';
      if (dashboardHeader) dashboardHeader.style.display = 'flex';
      if (breadcrumb) breadcrumb.style.display = 'flex';
      break;
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
    tile.innerHTML = `<div class="tile-icon"><i class="fas fa-file-pdf"></i></div><div class="tile-text">${fav.title}</div>`;
    tile.onclick = () => {
      if (fav.url && fav.url !== '#') {
        showPDF(fav.url);
        showView('home');
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
    tile.innerHTML = `<div class="tile-icon"><i class="fas fa-file-pdf"></i></div><div class="tile-text">${doc.title}</div>`;
    tile.onclick = () => {
      if (doc.url && doc.url !== '#') {
        showPDF(doc.url);
        showView('home');
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
  
  sortToggleBtn && sortToggleBtn.addEventListener('click', () => {
    currentSortOrder = currentSortOrder === 'asc' ? 'desc' : 'asc';
    localStorage.setItem('questionary-sort-order', currentSortOrder);
    renderTiles(getCurrentLevel());
  });
}


function handleBackButton() {
  if (path.length > 0) {
    path.pop();
    const pdfViewer = document.getElementById('pdfViewer');
    if (pdfViewer) {
      pdfViewer.style.cssText = 'display: none !important;';
      pdfViewer.classList.remove('active');
      pdfViewer.src = '';
    }
    renderTiles(getCurrentLevel());
    updateBreadcrumb();
    hideTimerCompletely();
  }
}


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
    
    newBtn.addEventListener('click', () => {
      selectTimerPreset(newBtn, duration);
    });
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
  
  if (!duration || isNaN(duration) || duration <= 0) {
    console.error('Invalid timer duration:', duration);
    return;
  }
  
  
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
  if (timerPanel) {
    timerPanel.style.display = 'flex';
  }
  if (reopenBtn) {
    reopenBtn.style.display = 'none';
  }
}

function hideTimer() {
  const timerPanel = document.getElementById('timerPanel');
  const reopenBtn = document.getElementById('timerReopenBtn');
  if (timerPanel) {
    timerPanel.style.display = 'none';
  }
  
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
  if (timerPanel) {
    timerPanel.style.display = 'none';
  }
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
  if (!timerState.isRunning || timerState.remaining <= 0) {
    console.log('Cannot add lap - timer not running or no time remaining');
    return;
  }
  
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
  
  timerState.laps.forEach((lap, i) => {
    lap.number = i + 1;
  });
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

let updateState = {
    available: false,
    version: null,
    update: null,
    downloading: false,
    downloadProgress: 0,
    downloadedBytes: 0,
    totalBytes: 0
};

async function checkForUpdatesManual() {
    console.log('checkForUpdatesManual function called');
    
    const btn = document.getElementById('checkUpdatesBtn');
    
        if (updateState.downloading) {
        showUpdateProgressNotification();
        return;
    }
    
        if (updateState.available && updateState.update) {
        await downloadAndInstallUpdate();
        return;
    }
    
    if (btn) {
        btn.classList.add('checking');
        btn.disabled = true;
    }
    
    try {
        if (window.__TAURI__) {
            showNotification('Checking for updates...', 'info');
            
                        const updater = window.__TAURI__.updater;
            if (!updater) {
                throw new Error('Updater plugin not available');
            }
            
            const update = await updater.check();
            
            if (update) {
                console.log('Update available:', update.version);
                updateState.available = true;
                updateState.version = update.version;
                updateState.update = update;
                
                showNotification(`Update ${update.version} available! Click update button again to download.`, 'success');
                updateButtonToDownloadMode(update.version);
            } else {
                showNotification('You are on the latest version!', 'success');
                resetUpdateButton();
            }
        } else {
            showNotification('Update checking is only available in the desktop app.', 'info');
        }
    } catch (error) {
        console.error('Update check error:', error);
        showNotification('Could not check for updates. Please try again later.', 'warning');
        resetUpdateButton();
    } finally {
        if (btn) {
            btn.classList.remove('checking');
            btn.disabled = false;
        }
    }
}

async function downloadAndInstallUpdate() {
    if (!updateState.update) return;
    
    const btn = document.getElementById('checkUpdatesBtn');
    updateState.downloading = true;
    updateState.downloadProgress = 0;
    updateState.downloadedBytes = 0;
    
    try {
        updateButtonToProgressMode();
        showNotification('Downloading update...', 'info');
        
        await updateState.update.downloadAndInstall((event) => {
            switch (event.event) {
                case 'Started':
                    updateState.totalBytes = event.data.contentLength || 0;
                    console.log('Download started, size:', updateState.totalBytes);
                    break;
                case 'Progress':
                    updateState.downloadedBytes += event.data.chunkLength || 0;
                    if (updateState.totalBytes > 0) {
                        updateState.downloadProgress = Math.round((updateState.downloadedBytes / updateState.totalBytes) * 100);
                    }
                    updateProgressButton();
                    break;
                case 'Finished':
                    updateState.downloadProgress = 100;
                    console.log('Download finished');
                    updateProgressButton();
                    break;
            }
        });
        
        showNotification('Update installed! Restarting app...', 'success');
        updateButtonToRestartMode();
        
                setTimeout(async () => {
            if (window.__TAURI__ && window.__TAURI__.process) {
                await window.__TAURI__.process.relaunch();
            }
        }, 2000);
        
    } catch (error) {
        console.error('Download error:', error);
        showNotification('Failed to download update. Please try again.', 'error');
        resetUpdateButton();
        updateState.downloading = false;
    }
}

function updateButtonToDownloadMode(version) {
    const btn = document.getElementById('checkUpdatesBtn');
    if (btn) {
        btn.innerHTML = `<i class="fas fa-download"></i>`;
        btn.title = `Download update ${version}`;
        btn.classList.add('update-available');
    }
}

function updateButtonToProgressMode() {
    const btn = document.getElementById('checkUpdatesBtn');
    if (btn) {
        btn.innerHTML = `<i class="fas fa-download"></i>`;
        btn.title = 'Downloading... Click to see progress';
        btn.classList.add('downloading');
        btn.classList.remove('update-available');
    }
    showDownloadProgressBar();
}

function updateProgressButton() {
    const progressBar = document.getElementById('downloadProgressBar');
    const progressFill = document.getElementById('downloadProgressFill');
    const progressPercent = document.getElementById('downloadProgressPercent');
    const progressText = document.getElementById('downloadProgressText');
    
    if (progressFill) {
        progressFill.style.width = `${updateState.downloadProgress}%`;
    }
    if (progressPercent) {
        progressPercent.textContent = `${updateState.downloadProgress}%`;
    }
    if (progressText) {
        progressText.textContent = `${formatBytes(updateState.downloadedBytes)} / ${formatBytes(updateState.totalBytes)}`;
    }
    
    const btn = document.getElementById('checkUpdatesBtn');
    if (btn) {
        btn.title = `Downloading: ${formatBytes(updateState.downloadedBytes)} / ${formatBytes(updateState.totalBytes)}`;
    }
}

function showDownloadProgressBar() {
    const progressBar = document.getElementById('downloadProgressBar');
    if (progressBar) {
        progressBar.style.display = 'block';
    }
}

function hideDownloadProgressBar() {
    const progressBar = document.getElementById('downloadProgressBar');
    if (progressBar) {
        progressBar.style.display = 'none';
    }
    const progressFill = document.getElementById('downloadProgressFill');
    if (progressFill) {
        progressFill.style.width = '0%';
    }
}

function updateButtonToRestartMode() {
    const btn = document.getElementById('checkUpdatesBtn');
    if (btn) {
        btn.innerHTML = `<i class="fas fa-redo"></i>`;
        btn.title = 'Restarting...';
        btn.classList.remove('downloading');
        btn.classList.add('restarting');
    }
    hideDownloadProgressBar();
}

function resetUpdateButton() {
    const btn = document.getElementById('checkUpdatesBtn');
    if (btn) {
        btn.innerHTML = `<i class="fas fa-sync-alt"></i>`;
        btn.title = 'Check for Updates';
        btn.classList.remove('update-available', 'downloading', 'restarting');
    }
    hideDownloadProgressBar();
    updateState.available = false;
    updateState.update = null;
    updateState.downloading = false;
}

function showUpdateProgressNotification() {
    const progress = updateState.downloadProgress;
    const downloaded = formatBytes(updateState.downloadedBytes);
    const total = formatBytes(updateState.totalBytes);
    showNotification(`Downloading: ${progress}% (${downloaded} / ${total})`, 'info');
}

function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

(function initUpdateButton() {
    function setupButton() {
        const btn = document.getElementById('checkUpdatesBtn');
        if (btn && !btn.dataset.initialized) {
            console.log('Update button found, attaching click handler');
            btn.dataset.initialized = 'true';
            btn.addEventListener('click', checkForUpdatesManual);
        }
    }
    
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', setupButton);
    } else {
        setupButton();
    }
    
    setTimeout(setupButton, 1000);
    setTimeout(setupButton, 3000);
})();

async function checkForUpdatesOnStartup() {
        await new Promise(resolve => setTimeout(resolve, 5000));
    
    try {
        if (window.__TAURI__) {
            console.log('Auto-checking for updates...');
            
            const updater = window.__TAURI__.updater;
            if (!updater) {
                console.log('Updater plugin not available');
                return;
            }
            
            const update = await updater.check();
            
            if (update) {
                console.log('Update available:', update.version);
                updateState.available = true;
                updateState.version = update.version;
                updateState.update = update;
                
                                showNotification(`Update ${update.version} is available! Click the update button to download.`, 'info');
                updateButtonToDownloadMode(update.version);
            } else {
                console.log('App is up to date');
            }
        }
    } catch (error) {
        console.log('Auto-update check failed (silent):', error.message);
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', checkForUpdatesOnStartup);
} else {
    checkForUpdatesOnStartup();
}




function initializeNewFeatures() {
    try { if (typeof loadNotes === 'function') loadNotes(); } catch(e) { console.log('loadNotes not available'); }
  try { if (typeof loadFlashcardDecks === 'function') loadFlashcardDecks(); } catch(e) { console.log('loadFlashcardDecks not available'); }
  try { if (typeof loadStudySessions === 'function') loadStudySessions(); } catch(e) { console.log('loadStudySessions not available'); }
  try { if (typeof loadDocumentProgress === 'function') loadDocumentProgress(); } catch(e) { console.log('loadDocumentProgress not available'); }
  try { if (typeof loadQuickLinks === 'function') loadQuickLinks(); } catch(e) { console.log('loadQuickLinks not available'); }
  try { if (typeof loadStudyStats === 'function') loadStudyStats(); } catch(e) { console.log('loadStudyStats not available'); }
  
  
  const createNoteBtn = document.getElementById('createNoteBtn');
  const closeNoteModal = document.getElementById('closeNoteModal');
  const cancelNoteBtn = document.getElementById('cancelNoteBtn');
  const saveNoteBtn = document.getElementById('saveNoteBtn');
  const noteModal = document.getElementById('noteModal');
  
  if (createNoteBtn && typeof openNoteModal === 'function') createNoteBtn.onclick = () => openNoteModal();
  if (closeNoteModal && noteModal) closeNoteModal.onclick = () => noteModal.classList.remove('active');
  if (cancelNoteBtn && noteModal) cancelNoteBtn.onclick = () => noteModal.classList.remove('active');
  if (saveNoteBtn && typeof saveNote === 'function') saveNoteBtn.onclick = saveNote;
  
  
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
  if (addCardBtn && typeof addCardEditor === 'function') addCardBtn.onclick = addCardEditor;
  
  
  const closeStudyModal = document.getElementById('closeStudyModal');
  const flipCardBtn = document.getElementById('flipCardBtn');
  const nextCardBtn = document.getElementById('nextCardBtn');
  const prevCardBtn = document.getElementById('prevCardBtn');
  const activeFlashcard = document.getElementById('activeFlashcard');
  const studyModal = document.getElementById('studyModal');
  
  if (closeStudyModal && studyModal) closeStudyModal.onclick = () => studyModal.classList.remove('active');
  if (flipCardBtn && typeof flipCard === 'function') flipCardBtn.onclick = flipCard;
  if (nextCardBtn && typeof nextCard === 'function') nextCardBtn.onclick = nextCard;
  if (prevCardBtn && typeof prevCard === 'function') prevCardBtn.onclick = prevCard;
  if (activeFlashcard && typeof flipCard === 'function') activeFlashcard.onclick = flipCard;
  
  
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
      
      // If a PDF is open, show choice dialog
      if (currentOpenPDF) {
        showQuickLinkChoiceDialog();
        return;
      }
      
      // If at home (path.length === 0), show message
      if (path.length === 0) {
        if (typeof showNotification === 'function') showNotification('Navigate to a folder first to add it as a quick link', 'info');
        return;
      }
      
      // Add current folder as quick link
      addCurrentFolderToQuickLinks();
    };
  }
  
  
  if (typeof renderQuickLinks === 'function') renderQuickLinks();
  
  console.log('New features initialized');
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


let searchHistory = JSON.parse(localStorage.getItem('questionary-search-history') || '[]');

function saveSearchHistory() {
  localStorage.setItem('questionary-search-history', JSON.stringify(searchHistory));
}

function addToSearchHistory(query) {
  if (!query || query.length < 2) return;
  searchHistory = searchHistory.filter(q => q.toLowerCase() !== query.toLowerCase());
  searchHistory.unshift(query);
  searchHistory = searchHistory.slice(0, 10);
  saveSearchHistory();
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
  
  searchInput.addEventListener('focus', showSearchHistory);
  searchInput.addEventListener('input', (e) => {
    if (e.target.value === '') showSearchHistory();
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
  if (!dropdown || searchHistory.length === 0 || searchInput.value) return;
  
  dropdown.innerHTML = `
    <div class="search-history-header">
      <span>Recent Searches</span>
      <button onclick="clearSearchHistory()" class="clear-history-btn">Clear</button>
    </div>
    ${searchHistory.map(q => `
      <div class="search-history-item" onclick="useSearchHistory('${escapeHtml(q)}')">
        <i class="fas fa-history"></i>
        <span>${escapeHtml(q)}</span>
      </div>
    `).join('')}
  `;
  dropdown.classList.add('active');
}

function useSearchHistory(query) {
  const searchInput = document.getElementById('globalSearch');
  searchInput.value = query;
  document.getElementById('searchHistoryDropdown')?.classList.remove('active');
  performSearch(query);
}

function clearSearchHistory() {
  searchHistory = [];
  saveSearchHistory();
  document.getElementById('searchHistoryDropdown')?.classList.remove('active');
}

window.useSearchHistory = useSearchHistory;
window.clearSearchHistory = clearSearchHistory;


let customTimerPresets = JSON.parse(localStorage.getItem('questionary-timer-presets') || '[]');

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
    
    
    btn.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (confirm(`Delete "${preset.label}" preset?`)) {
        removeCustomPreset(preset.id);
      }
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
  
  const preset = {
    id: Date.now().toString(),
    label: label,
    duration: durationInSeconds
  };
  
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


let darkModeSchedule = JSON.parse(localStorage.getItem('questionary-darkmode-schedule') || '{"enabled":false,"darkStart":19,"darkEnd":7}');

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


let pageBookmarks = JSON.parse(localStorage.getItem('questionary-page-bookmarks') || '{}');

function savePageBookmarks() {
  localStorage.setItem('questionary-page-bookmarks', JSON.stringify(pageBookmarks));
}

function addToPrintQueue(docPath, pageNumber, label = '') {
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
    <div class="page-bookmark-item" onclick="goToPage(${b.page})">
      <i class="fas fa-bookmark"></i>
      <span>${escapeHtml(b.label)}</span>
      <button class="note-action-btn delete" onclick="event.stopPropagation(); removePageBookmark('${docPath}', '${b.id}')">
        <i class="fas fa-times"></i>
      </button>
    </div>
  `).join('');
}

function goToPage(pageNumber) {
  const pdfViewer = document.getElementById('pdfViewer');
  if (pdfViewer && pdfViewer.src) {
    
    
    showNotification(`Navigate to page ${pageNumber}`, 'info');
  }
}

window.addPageBookmark = addToPrintQueue;
window.removePageBookmark = removePageBookmark;
window.goToPage = goToPage;



function initDocumentPreview() {
  
  const existingTooltip = document.getElementById('previewTooltip');
  if (existingTooltip) {
    existingTooltip.remove();
  }
}

let previewTimeout = null;

function showPreviewTooltip(element, url, name) {
  
  return;
}

function hidePreviewTooltip() {
  clearTimeout(previewTimeout);
  const tooltip = document.getElementById('previewTooltip');
  if (tooltip) {
    tooltip.remove();
  }
}

document.addEventListener('DOMContentLoaded', initDocumentPreview);


function generateShareLink(docPath) {
  const baseUrl = window.location.origin + window.location.pathname;
  const params = new URLSearchParams({ path: docPath.join('/') });
  const shareUrl = `${baseUrl}?${params.toString()}`;
  
  if (navigator.clipboard) {
    navigator.clipboard.writeText(shareUrl).then(() => {
      showNotification('Share link copied to clipboard!', 'success');
    });
  } else {
    prompt('Copy this link:', shareUrl);
  }
  
  return shareUrl;
}

function handleShareLink() {
  const params = new URLSearchParams(window.location.search);
  const pathParam = params.get('path');
  
  if (pathParam) {
    const pathArr = pathParam.split('/');
    path = pathArr;
    const level = getCurrentLevel();
    
    if (typeof level === 'string' && level !== '#') {
      showPDF(level);
    } else {
      renderTiles(level);
    }
    updateBreadcrumb();
  }
}

window.generateShareLink = generateShareLink;
document.addEventListener('DOMContentLoaded', handleShareLink);


let printQueue = [];

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
      <button onclick="removeFromPrintQueue('${doc.url}')" title="Remove"><i class="fas fa-times"></i></button>
    </div>
  `).join('');
}

window.addToPrintQueue = addToPrintQueue;
window.removeFromPrintQueue = removeFromPrintQueue;
window.clearPrintQueue = clearPrintQueue;


function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js')
      .then(reg => console.log('Service Worker registered'))
      .catch(err => console.log('Service Worker registration failed:', err));
  }
}





let pdfViewStartTime = null;

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


document.addEventListener('keydown', (e) => {
  
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
  
  
  if (e.key === 'n' || e.key === 'N') {
    if (typeof openNoteModal === 'function') {
      e.preventDefault();
      openNoteModal();
    }
  }
  
  
  if (e.key === 'f' || e.key === 'F') {
    if (typeof openFlashcardModal === 'function') {
      e.preventDefault();
      openFlashcardModal();
    }
  }
  
  
  if (e.key === 's' || e.key === 'S') {
    if (path.length > 0 && typeof generateShareLink === 'function') {
      e.preventDefault();
      generateShareLink(path);
    }
  }
  
  
  if (e.key === 'q' || e.key === 'Q') {
    e.preventDefault();
    const panel = document.getElementById('quickLinksPanel');
    panel?.classList.toggle('active');
  }
});

function initSettingsDropdown() {
  const userBadge = document.getElementById('userBadge');
  const userDropdown = document.getElementById('userDropdownMenu');
  
  if (!userBadge || !userDropdown) {
    console.log('Settings dropdown elements not found');
    return;
  }
  
    userBadge.addEventListener('click', (e) => {
        if (e.target.closest('#userDropdownMenu')) return;
    e.stopPropagation();
    userBadge.classList.toggle('active');
    
        const usernameDisplay = document.getElementById('username-display');
    const dropdownUsername = document.getElementById('dropdownUsername');
    if (usernameDisplay && dropdownUsername) {
      dropdownUsername.textContent = usernameDisplay.textContent;
    }
  });
  
    document.addEventListener('click', (e) => {
    if (!e.target.closest('.user-badge')) {
      userBadge.classList.remove('active');
    }
  });
  
    loadSettingsState();
  
    setupSettingsToggles();
  
    setupSettingsActions();
  
  console.log('Settings dropdown initialized');
}

function loadSettingsState() {
  const settings = JSON.parse(localStorage.getItem('questionary-settings') || '{}');
  
    const verticalNavToggle = document.getElementById('verticalNavbarToggle');
  if (verticalNavToggle) {
    verticalNavToggle.checked = settings.verticalNavbar || false;
    if (settings.verticalNavbar) {
      document.body.classList.add('vertical-navbar-mode');
    }
  }
  
    const compactToggle = document.getElementById('compactModeToggle');
  if (compactToggle) {
    compactToggle.checked = settings.compactMode || false;
    if (settings.compactMode) {
      document.body.classList.add('compact-mode');
    }
  }
  
    const animationsToggle = document.getElementById('animationsToggle');
  if (animationsToggle) {
    animationsToggle.checked = settings.animations !== false;     if (settings.animations === false) {
      document.body.classList.add('reduced-animations');
    }
  }
  
    const autoPlayToggle = document.getElementById('autoPlayToggle');
  if (autoPlayToggle) {
    autoPlayToggle.checked = settings.autoOpenPdfs || false;
  }
  
    const focusModeToggle = document.getElementById('focusModeToggle');
  if (focusModeToggle) {
    focusModeToggle.checked = settings.focusMode || false;
    if (settings.focusMode) {
      document.body.classList.add('focus-mode');
    }
  }
  
    const rememberLocationToggle = document.getElementById('rememberLocationToggle');
  if (rememberLocationToggle) {
    rememberLocationToggle.checked = settings.rememberLocation !== false;   }
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
    
    console.log(`${toggleId} handler attached`);
  }
  
    setupToggleRow('verticalNavbarToggle', (checked) => {
    console.log('Vertical navbar toggled:', checked);
    if (checked) {
      document.body.classList.add('vertical-navbar-mode');
      showNotification('Vertical navbar enabled', 'success');
    } else {
      document.body.classList.remove('vertical-navbar-mode');
      closeSidebar();
      showNotification('Horizontal navbar restored', 'info');
    }
  });
  
    setupToggleRow('compactModeToggle', (checked) => {
    console.log('Compact mode toggled:', checked);
    document.body.classList.toggle('compact-mode', checked);
    showNotification(checked ? 'Compact mode enabled' : 'Compact mode disabled', 'info');
  });
  
    setupToggleRow('animationsToggle', (checked) => {
    console.log('Animations toggled:', checked);
    document.body.classList.toggle('reduced-animations', !checked);
    showNotification(checked ? 'Animations enabled' : 'Animations reduced', 'info');
  });
  
    setupToggleRow('autoPlayToggle', (checked) => {
    console.log('Auto-play toggled:', checked);
    showNotification(checked ? 'PDFs will auto-open on click' : 'PDF preview mode', 'info');
  });
  
    setupToggleRow('focusModeToggle', (checked) => {
    console.log('Focus mode toggled:', checked);
    document.body.classList.toggle('focus-mode', checked);
    showNotification(checked ? 'Focus mode enabled - distractions hidden' : 'Focus mode disabled', 'info');
  });
  
    setupToggleRow('rememberLocationToggle', (checked) => {
    console.log('Remember location toggled:', checked);
    showNotification(checked ? 'Will remember your last location' : 'Will start at home on launch', 'info');
  });
}

function setupSettingsActions() {
    const clearDataBtn = document.getElementById('clearDataBtn');
  if (clearDataBtn) {
    clearDataBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      console.log('Clear data clicked');
      showConfirmModal(
        'Clear Local Data',
        'Are you sure you want to clear all local data? This will reset favorites, notes, flashcards, quick links, and settings.',
        () => {
          const keysToKeep = ['questionary-login'];
          const allKeys = Object.keys(localStorage).filter(k => k.startsWith('questionary-'));
          allKeys.forEach(key => {
            if (!keysToKeep.includes(key)) {
              localStorage.removeItem(key);
            }
          });
          showNotification('Local data cleared', 'success');
          document.getElementById('userBadge')?.classList.remove('active');
          setTimeout(() => location.reload(), 1000);
        }
      );
    });
    console.log('Clear data button handler attached');
  }
  
    const exportDataBtn = document.getElementById('exportDataBtn');
  if (exportDataBtn) {
    exportDataBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      console.log('Export clicked');
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
      document.getElementById('userBadge')?.classList.remove('active');
    });
    console.log('Export button handler attached');
  }
  
    const importDataBtn = document.getElementById('importDataBtn');
  if (importDataBtn) {
    importDataBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      console.log('Import clicked');
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json';
      input.onchange = (event) => {
        const file = event.target.files[0];
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = (e) => {
          try {
            const data = JSON.parse(e.target.result);
            Object.keys(data).forEach(key => {
              if (key.startsWith('questionary-')) {
                localStorage.setItem(key, data[key]);
              }
            });
            showNotification('Data imported successfully! Reloading...', 'success');
            setTimeout(() => location.reload(), 1000);
          } catch (err) {
            showNotification('Failed to import data: Invalid file', 'error');
          }
        };
        reader.readAsText(file);
      };
      input.click();
      document.getElementById('userBadge')?.classList.remove('active');
    });
    console.log('Import button handler attached');
  }
  
    const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      console.log('Logout clicked');
      showConfirmModal(
        'Logout',
        'Are you sure you want to logout?',
        () => {
          localStorage.removeItem('questionary-login');
          showNotification('Logged out successfully', 'info');
          setTimeout(() => location.reload(), 500);
        }
      );
    });
    console.log('Logout button handler attached');
  }
  
    const openSettingsBtn = document.getElementById('openSettingsBtn');
  if (openSettingsBtn) {
    openSettingsBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      console.log('More settings clicked');
      document.getElementById('userBadge')?.classList.remove('active');
            document.getElementById('accessibilityPanel')?.classList.add('active');
    });
    console.log('Open settings button handler attached');
  }
}

function getKeyboardShortcuts() {
  return [
    { key: 'N', desc: 'New Note' },
    { key: 'F', desc: 'New Flashcard' },
    { key: 'Q', desc: 'Toggle Quick Links' },
    { key: 'S', desc: 'Share Location' },
    { key: '/', desc: 'Focus Search' }
  ];
}

function initHamburgerMenu() {
  const hamburgerBtn = document.getElementById('hamburgerMenu');
  const navLinks = document.getElementById('navLinks');
  const sidebarOverlay = document.getElementById('sidebarOverlay');
  const sidebarClose = document.getElementById('sidebarClose');
  
  if (hamburgerBtn && navLinks) {
    hamburgerBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      navLinks.classList.toggle('sidebar-open');
      sidebarOverlay?.classList.toggle('active');
    });
  }
  
    if (navLinks) {
    navLinks.addEventListener('click', (e) => {
      e.stopPropagation();
    });
  }
  
  if (sidebarOverlay) {
    sidebarOverlay.addEventListener('click', (e) => {
      e.stopPropagation();
      closeSidebar();
    });
  }
  
  if (sidebarClose) {
    sidebarClose.addEventListener('click', (e) => {
      e.stopPropagation();
      closeSidebar();
    });
  }
  
    }

function closeSidebar() {
  document.getElementById('navLinks')?.classList.remove('sidebar-open');
  document.getElementById('sidebarOverlay')?.classList.remove('active');
}

document.addEventListener('DOMContentLoaded', () => {
  initSettingsDropdown();
  initHamburgerMenu();
});

