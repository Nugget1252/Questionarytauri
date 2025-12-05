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

// New feature state variables (duplicates removed — variables are declared above)

// Initialize favorites from storage
async function initializeFavorites() {
  try {
    // Try to load from Tauri file system first (if available)
    if (window.__TAURI__) {
      const loaded = await loadFavoritesFromTauri();
      if (loaded) return;
    }
    // Fallback to localStorage
    favorites = JSON.parse(localStorage.getItem('questionary-favorites') || '[]');
  } catch (e) {
    console.error('Error loading favorites:', e);
    favorites = [];
  }
}

// Save favorites to storage
async function saveFavorites() {
  try {
    // Save to localStorage (always)
    localStorage.setItem('questionary-favorites', JSON.stringify(favorites));
    
    // Also save to Tauri file system if available
    if (window.__TAURI__) {
      await saveFavoritesToTauri();
    }
  } catch (e) {
    console.error('Error saving favorites:', e);
  }
}

// Tauri-specific favorites persistence
async function loadFavoritesFromTauri() {
  try {
    const { readTextFile, BaseDirectory } = window.__TAURI__.fs || {};
    const { appDataDir } = window.__TAURI__.path || {};
    
    if (readTextFile && appDataDir) {
      const data = await readTextFile('favorites.json', { dir: BaseDirectory.AppData });
      favorites = JSON.parse(data);
      // Sync to localStorage as backup
      localStorage.setItem('questionary-favorites', JSON.stringify(favorites));
      return true;
    }
  } catch (e) {
    // File doesn't exist yet or Tauri APIs not available
    console.log('Loading favorites from localStorage instead');
  }
  return false;
}

async function saveFavoritesToTauri() {
  try {
    const { writeTextFile, createDir, BaseDirectory } = window.__TAURI__.fs || {};
    
    if (writeTextFile && createDir) {
      // Ensure app data directory exists
      try {
        await createDir('', { dir: BaseDirectory.AppData, recursive: true });
      } catch (e) {
        // Directory may already exist
      }
      
      await writeTextFile('favorites.json', JSON.stringify(favorites, null, 2), { 
        dir: BaseDirectory.AppData 
      });
    }
  } catch (e) {
    console.error('Error saving favorites to Tauri:', e);
  }
}

// Recent documents persistence
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

// Timer state
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
  const root = document.documentElement;
  root.classList.toggle('high-contrast', accessibilitySettings.highContrast);
  root.classList.toggle('large-text', accessibilitySettings.largeText);
  root.classList.toggle('reduced-motion', accessibilitySettings.reducedMotion);
  root.classList.toggle('enhanced-focus', accessibilitySettings.enhancedFocus);
  // Also apply to body for broader compatibility
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

let documents = {
    "Study Material Class 9": {
        "Physics FT": {
            "Upthrust in Fluids, Archimedes' Principle and Floatation": "https://drive.google.com/file/d/1A5IbecU77W4krqBj2zaiahZh46Q8Je6E/preview", "Heat and Energy": "https://drive.google.com/file/d/1pyvt2igU8prlMty5nwhhi6woR6a3RSeJ/preview", "Reflection of Light": "https://drive.google.com/file/d/1Fo6DpHIp658q9JiFfzf4I8puPhph0WoA/preview", "Propagation of Sound Waves": "https://drive.google.com/file/d/1uxLKeXoP5LOP-kI9B4EhHmvKrpka5A6M/preview", "Current Electricity": "https://drive.google.com/file/d/1a8oXvkZPDJpTZKRO8-lYcvk1uuLB39I8/preview", "Magnetism": "https://drive.google.com/file/d/1ijJWkhghtNb2I5Z1bOeClcA9Mg8l4Qf7/preview"},
        "Biology Class 10 Book PDFS": {
            "Excretory System": "https://drive.google.com/file/d/16b4aqhobYQm_XqXgadk5383J-Mkq6bNm/preview", "Full Book": "https://drive.google.com/file/d/1NCj_IUP8Kss0gQ3uj6cUBtLMNqKvkIRI/preview"
        }
    }
};
// Show notification toast
function showNotification(message, type = 'info') {
  const existing = document.querySelector('.notification-toast');
  if (existing) existing.remove();
  
  const toast = document.createElement('div');
  toast.className = `notification-toast ${type}`;
  toast.style.cssText = 'position:fixed;top:20px;right:20px;padding:12px 20px;border-radius:8px;display:flex;align-items:center;gap:10px;z-index:10000;animation:slideIn 0.3s ease;box-shadow:0 4px 12px rgba(0,0,0,0.15);';
  
  if (type === 'success') {
    toast.style.background = '#003d29ff';
    toast.style.color = 'white';
  } else if (type === 'error') {
    toast.style.background = '#ef4444';
    toast.style.color = 'white';
  } else {
    toast.style.background = '#3b82f6';
    toast.style.color = 'white';
  }
  
  toast.innerHTML = `
    <i class="fas ${type === 'success' ? 'fa-check-circle' : type === 'error' ? 'fa-exclamation-circle' : 'fa-info-circle'}"></i>
    <span>${message}</span>
  `;
  document.body.appendChild(toast);
  
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// Show auto-login notification
function showAutoLoginNotification(username) {
  showNotification(`Welcome back, ${username}!`, 'success');
}

// Show the main app and hide login screen
function showApp() {
  const loginScreen = document.getElementById('loginScreen');
  const app = document.getElementById('app');
  
  if (loginScreen) loginScreen.style.display = 'none';
  if (app) app.style.display = 'block';
  
  const usernameDisplay = document.getElementById('username-display');
  const welcomeUsername = document.getElementById('welcomeUsername');
  
  if (usernameDisplay && currentUser) {
    usernameDisplay.textContent = currentUser.username;
  }
  if (welcomeUsername && currentUser) {
    welcomeUsername.textContent = currentUser.username;
  }
  
  const adminBadge = document.getElementById('adminBadge');
  if (adminBadge && currentUser && currentUser.role === 'admin') {
    adminBadge.style.display = 'inline-block';
  }
  
  if (typeof updateDashboardStats === 'function') {
    updateDashboardStats();
  }
}

// Perform search
function performSearch(e) {
  const query = typeof e === 'string' ? e : (e?.target?.value || '').trim().toLowerCase();
  const searchResults = document.getElementById('searchResults');
  const searchResultsContainer = document.getElementById('searchResultsContainer');
  
  if (!query || query.length < 2) {
    if (searchResults) searchResults.style.display = 'none';
    return;
  }
  
  if (typeof addToSearchHistory === 'function') {
    addToSearchHistory(query);
  }
  
  const results = [];
  
  function searchInDocuments(obj, pathArr = []) {
    for (const [key, value] of Object.entries(obj)) {
      const currentPath = [...pathArr, key];
      if (key.toLowerCase().includes(query)) {
        if (typeof value === 'string' && value !== '#') {
          results.push({ name: key, path: currentPath, url: value, type: 'document' });
        } else if (typeof value === 'object') {
          results.push({ name: key, path: currentPath, url: null, type: 'folder' });
        }
      }
      if (typeof value === 'object') {
        searchInDocuments(value, currentPath);
      }
    }
  }
  
  searchInDocuments(documents);
  
  // Search in notes
  notes.forEach(note => {
    if (note.title.toLowerCase().includes(query) || (note.content && note.content.toLowerCase().includes(query))) {
      results.push({ name: note.title, path: ['Notes', note.title], url: null, type: 'note', id: note.id });
    }
  });
  
  // Search in flashcard decks
  flashcardDecks.forEach(deck => {
    if (deck.name.toLowerCase().includes(query) || (deck.subject && deck.subject.toLowerCase().includes(query))) {
      results.push({ name: deck.name, path: ['Flashcards', deck.name], url: null, type: 'flashcard', id: deck.id });
    }
    // Also search in card content
    if (deck.cards) {
      deck.cards.forEach(card => {
        if ((card.front && card.front.toLowerCase().includes(query)) || (card.back && card.back.toLowerCase().includes(query))) {
          if (!results.some(r => r.type === 'flashcard' && r.id === deck.id)) {
            results.push({ name: deck.name, path: ['Flashcards', deck.name], url: null, type: 'flashcard', id: deck.id });
          }
        }
      });
    }
  });
  
  if (results.length === 0) {
    if (searchResultsContainer) {
      searchResultsContainer.innerHTML = '<div style="text-align:center;padding:2rem;color:var(--text-secondary);"><i class="fas fa-search" style="font-size:2rem;margin-bottom:1rem;opacity:0.3;"></i><p>No results found</p></div>';
    }
  } else if (searchResultsContainer) {
    searchResultsContainer.innerHTML = results.slice(0, 20).map(result => {
      let icon = 'fa-file-pdf';
      if (result.type === 'folder') icon = 'fa-folder';
      else if (result.type === 'note') icon = 'fa-sticky-note';
      else if (result.type === 'flashcard') icon = 'fa-layer-group';
      
      return `
        <div class="search-result-item" onclick="navigateToSearchResult(${JSON.stringify(result.path)}, '${result.url || ''}', '${result.type}', '${result.id || ''}')">
          <i class="fas ${icon}"></i>
          <div class="search-result-info">
            <span class="search-result-name">${result.name}</span>
            <span class="search-result-path">${result.path.join(' > ')}</span>
          </div>
        </div>
      `;
    }).join('');
  }
  
  if (searchResults) searchResults.style.display = 'block';
}

function navigateToSearchResult(pathArr, url, type, id) {
  const searchResults = document.getElementById('searchResults');
  const globalSearch = document.getElementById('globalSearch');
  if (searchResults) searchResults.style.display = 'none';
  if (globalSearch) globalSearch.value = '';
  
  // Handle different result types
  if (type === 'note' && id) {
    showView('notes');
    setActiveNav('notesNav');
    const note = notes.find(n => n.id === id);
    if (note) {
      setTimeout(() => openNoteModal(note), 100);
    }
    return;
  }
  
  if (type === 'flashcard' && id) {
    showView('flashcards');
    setActiveNav('flashcardsNav');
    setTimeout(() => startStudyDeck(id), 100);
    return;
  }
  
  // Handle documents and folders
  path = pathArr.slice(0, -1);
  const name = pathArr[pathArr.length - 1];
  
  if (url && url !== '#') {
    path = pathArr;
    showPDF(url);
    addToRecent(name, pathArr, url);
  } else {
    path = pathArr;
    renderTiles(getCurrentLevel());
  }
  
  updateBreadcrumb();
}

window.navigateToSearchResult = navigateToSearchResult;

// ===== CORE TILE AND NAVIGATION FUNCTIONS =====

function getCurrentLevel() {
  let current = documents;
  for (const p of path) {
    if (current[p]) {
      current = current[p];
    } else {
      return documents;
    }
  }
  return current;
}

function renderTiles(obj) {
  const container = document.getElementById('tilesContainer');
  if (!container) return;
  
  container.innerHTML = '';
  
  // Make sure container is visible
  container.style.display = '';
  
  if (!obj || typeof obj !== 'object') {
    container.innerHTML = '<div style="text-align:center;padding:3rem;color:var(--text-secondary);"><p>No items found</p></div>';
    return;
  }
  
  const entries = Object.entries(obj);
  const sortOrder = localStorage.getItem('questionary-sort-order') || 'asc';
  
  entries.sort((a, b) => {
    const aIsFolder = typeof a[1] === 'object';
    const bIsFolder = typeof b[1] === 'object';
    if (aIsFolder && !bIsFolder) return -1;
    if (!aIsFolder && bIsFolder) return 1;
    const comparison = a[0].localeCompare(b[0]);
    return sortOrder === 'desc' ? -comparison : comparison;
  });
  
  entries.forEach(([key, value]) => {
    const tile = document.createElement('div');
    tile.className = 'tile';
    tile.setAttribute('tabindex', '0');
    
    const isFolder = typeof value === 'object';
    const isAvailable = typeof value === 'string' && value !== '#';
    const isUnavailable = value === '#';
    
    const icon = isFolder ? 'fa-folder' : (isAvailable ? 'fa-file-pdf' : 'fa-file');
    const iconColor = isFolder ? 'folder-icon' : (isAvailable ? 'pdf-icon' : '');
    
    tile.innerHTML = `
      <div class="tile-icon ${iconColor}"><i class="fas ${icon}"></i></div>
      <div class="tile-text">${key}</div>
      ${isUnavailable ? '<div class="tile-badge unavailable">Coming Soon</div>' : ''}
    `;
    
    tile.onclick = () => {
      if (isFolder) {
        path.push(key);
        renderTiles(value);
        updateBreadcrumb();
      } else if (isAvailable) {
        path.push(key);
        showPDF(value);
        addToRecent(key, [...path], value);
        updateBreadcrumb();
      }
    };
    
    container.appendChild(tile);
  });
  
  const tilesSection = document.getElementById('tilesSection');
  const pdfViewer = document.getElementById('pdfViewer');
  const dashboardHeader = document.querySelector('.dashboard-header');
  
  if (tilesSection) tilesSection.style.display = 'block';
  if (pdfViewer) pdfViewer.style.display = 'none';
  if (dashboardHeader) dashboardHeader.style.display = 'flex';
}

function isFavorite(title, docPath) {
  const pathString = Array.isArray(docPath) ? docPath.join('|') : docPath;
  return favorites.some(f => f.title === title && (Array.isArray(f.path) ? f.path.join('|') : f.path) === pathString);
}

function updateBreadcrumb() {
  const breadcrumb = document.getElementById('breadcrumb');
  const backBtn = document.getElementById('backBtn');
  if (!breadcrumb) return;
  
  let html = `<span class="breadcrumb-item" onclick="goToRoot()"><i class="fas fa-home"></i> Home</span>`;
  path.forEach((p, index) => {
    html += `<span class="breadcrumb-separator"><i class="fas fa-chevron-right"></i></span>`;
    html += `<span class="breadcrumb-item" onclick="goToPath(${index})">${p}</span>`;
  });
  breadcrumb.innerHTML = html;
  if (backBtn) backBtn.style.display = path.length > 0 ? 'flex' : 'none';
}

function goToRoot() {
  path = [];
  renderTiles(documents);
  updateBreadcrumb();
  const pdfViewer = document.getElementById('pdfViewer');
  if (pdfViewer) { pdfViewer.style.display = 'none'; pdfViewer.src = ''; }
  hideTimerCompletely();
}

function goToPath(index) {
  path = path.slice(0, index + 1);
  const level = getCurrentLevel();
  if (typeof level === 'string') {
    path.pop();
    renderTiles(getCurrentLevel());
  } else {
    renderTiles(level);
  }
  updateBreadcrumb();
  const pdfViewer = document.getElementById('pdfViewer');
  if (pdfViewer) { pdfViewer.style.display = 'none'; pdfViewer.src = ''; }
  hideTimerCompletely();
}

function showPDF(url) {
  const pdfViewer = document.getElementById('pdfViewer');
  const tilesContainer = document.getElementById('tilesContainer');
  const dashboardHeader = document.querySelector('.dashboard-header');
  if (!pdfViewer) return;
  
  // Hide tiles container
  if (tilesContainer) tilesContainer.style.display = 'none';
  if (dashboardHeader) dashboardHeader.style.display = 'none';
  
  // Show PDF viewer
  pdfViewer.src = url;
  pdfViewer.style.display = 'block';
  
  initializeTimer();
  showTimer();
  trackPdfViewStart();
  
  // Record study activity for streak tracking
  recordStudyActivity();
}

function loadDocuments() {
  console.log('Documents loaded');
}

function trackDailyAccess() {
  const today = new Date().toISOString().split('T')[0];
  const accessHistory = JSON.parse(localStorage.getItem('dailyAccess') || '{}');
  accessHistory[today] = (accessHistory[today] || 0) + 1;
  localStorage.setItem('dailyAccess', JSON.stringify(accessHistory));
}

window.goToRoot = goToRoot;
window.goToPath = goToPath;

function renderAnalytics() {
  renderSubjectChart();
  renderAccessChart();
}

function renderSubjectChart() {
  const canvas = document.getElementById('subjectChart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const recentDocuments = JSON.parse(localStorage.getItem('questionary-recent') || '[]');
  const subjectAccess = {};
  
  recentDocuments.forEach(doc => {
    if (doc.title) {
      const subject = doc.title;
      subjectAccess[subject] = (subjectAccess[subject] || 0) + 1;
    }
  });
  
  const data = Object.entries(subjectAccess).sort(([, a], [, b]) => b - a).slice(0, 6);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  
  if (data.length === 0) {
    ctx.font = '14px Inter, sans-serif';
    ctx.fillStyle = '#64748b';
    ctx.textAlign = 'center';
    ctx.fillText('No subject data available', canvas.width / 2, canvas.height / 2);
    ctx.fillText('Access documents to see analytics', canvas.width / 2, canvas.height / 2 + 20);
    return;
  }
  
  const maxValue = Math.max(...data.map(([, c]) => c));
  const barWidth = (canvas.width - 40) / data.length;
  
  data.forEach(([subject, count], index) => {
    const barHeight = Math.max(10, (count / maxValue) * (canvas.height - 60));
    const x = 20 + index * barWidth + (barWidth - 30) / 2;
    const y = canvas.height - barHeight - 30;
    const gradient = ctx.createLinearGradient(0, y, 0, y + barHeight);
    gradient.addColorStop(0, '#f97316');
    gradient.addColorStop(1, '#ea580c');
    ctx.fillStyle = gradient;
    ctx.fillRect(x, y, 30, barHeight);
    ctx.fillStyle = '#374151';
    ctx.font = '11px Inter, sans-serif';
    ctx.textAlign = 'center';
    const displaySubject = subject.length > 8 ? subject.substring(0, 8) + '...' : subject;
    ctx.fillText(displaySubject, x + 15, canvas.height - 10);
    ctx.fillStyle = '#1f2937';
    ctx.font = '600 12px Inter, sans-serif';
    ctx.fillText(count.toString(), x + 15, y - 5);
  });
}

function renderAccessChart() {
  const canvas = document.getElementById('accessChart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const accessHistory = JSON.parse(localStorage.getItem('dailyAccess') || '{}');
  const days = [];
  const accessCounts = [];
  
  for (let i = 6; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    const dateKey = date.toISOString().split('T')[0];
    const dayName = date.toLocaleDateString('en-US', { weekday: 'short' });
    days.push(dayName);
    accessCounts.push(accessHistory[dateKey] || 0);
  }
  
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  
  if (accessCounts.every(c => c === 0)) {
    ctx.font = '14px Inter, sans-serif';
    ctx.fillStyle = '#64748b';
    ctx.textAlign = 'center';
    ctx.fillText('No access data available', canvas.width / 2, canvas.height / 2);
    ctx.fillText('Use the app to see your activity', canvas.width / 2, canvas.height / 2 + 20);
    return;
  }
  
  const maxValue = Math.max(...accessCounts, 1);
  const pointSpacing = (canvas.width - 40) / (days.length - 1);
  
  
  ctx.strokeStyle = '#e5e7eb';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = 20 + (i / 4) * (canvas.height - 60);
    ctx.beginPath();
    ctx.moveTo(20, y);
    ctx.lineTo(canvas.width - 20, y);
    ctx.stroke();
  }
  
  
  ctx.beginPath();
  ctx.strokeStyle = '#f97316';
  ctx.lineWidth = 2;
  accessCounts.forEach((count, index) => {
    const x = 20 + index * pointSpacing;
    const y = canvas.height - 40 - (count / maxValue) * (canvas.height - 60);
    index === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.stroke();
  
  
  accessCounts.forEach((count, index) => {
    const x = 20 + index * pointSpacing;
    const y = canvas.height - 40 - (count / maxValue) * (canvas.height - 60);
    ctx.fillStyle = '#f97316';
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, 2 * Math.PI);
    ctx.fill();
    ctx.fillStyle = '#374151';
    ctx.font = '11px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(days[index], x, canvas.height - 10);
    if (count > 0) {
      ctx.fillStyle = '#1f2937';
      ctx.font = '600 12px Inter, sans-serif';
      ctx.fillText(count.toString(), x, y - 10);
    }
  });
}

function saveUserPreferences() {
  
}

function updateDashboardStats() {
  
  const totalDocsEl = document.getElementById('totalDocuments');
  const favoriteCountEl = document.getElementById('favoriteCount');
  const recentCountEl = document.getElementById('recentCount');
  const dashboardStreakEl = document.getElementById('dashboardStreak');
  
  
  let count = 0;
  function countDocs(obj) {
    for (let key in obj) {
      if (typeof obj[key] === 'string') {
        // Only count available documents (not '#' placeholders)
        if (obj[key] !== '#') count++;
      } else if (typeof obj[key] === 'object') {
        countDocs(obj[key]);
      }
    }
  }
  countDocs(documents);
  
  if (totalDocsEl) {
    totalDocsEl.textContent = count;
  }
  
  
  if (favoriteCountEl) {
    favoriteCountEl.textContent = favorites.length;
  }
  
  
  const recentDocs = JSON.parse(localStorage.getItem('questionary-recent') || '[]');
  if (recentCountEl) {
    recentCountEl.textContent = recentDocs.length;
  }
  
  // Update streak on dashboard
  if (dashboardStreakEl) {
    dashboardStreakEl.textContent = studyStats.streak || 0;
  }
}

function setActiveNav(activeId) {
  document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
  document.getElementById(activeId)?.classList.add('active');
}

document.addEventListener('DOMContentLoaded', async () => {
  // Initialize favorites from storage
  await initializeFavorites();
  
  applyAccessibilitySettings();
  
  // Initialize new features
  if (typeof initializeNewFeatures === 'function') {
    initializeNewFeatures();
  }
  
  
  const themeToggle = document.getElementById('themeToggle');
  const themeIcon = document.getElementById('themeIcon');
  
  // Check for saved theme first, then system preference, default to light
  let savedTheme = localStorage.getItem('theme');
  if (!savedTheme) {
    // Detect system preference
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      savedTheme = 'dark';
    } else {
      savedTheme = 'light';
    }
  }
  document.documentElement.setAttribute('data-theme', savedTheme);
  updateThemeIcon(savedTheme);
  
  // Listen for system theme changes
  if (window.matchMedia) {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
      // Only auto-switch if user hasn't manually set a preference
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
  
  // Set up login form event listener first (always needed for manual login)
  const loginForm = document.getElementById('loginForm');
  if (loginForm) {
    loginForm.addEventListener('submit', handleLogin);
  }
  
  // Then check for saved/auto login
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
  window.addEventListener('beforeunload', () => {
    saveUserPreferences();
  });
  setInterval(saveUserPreferences, 30000);
  window.addEventListener('error', e => {
    console.error('Application error:', e.error);
  });
  console.log('Questionary application initialized successfully');
});

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
    console.error('Login form elements not found');
    showNotification('Login form error', 'error');
    return;
  }
  
  const username = usernameEl.value.trim();
  const password = passwordEl.value;
  const rememberMe = rememberMeEl ? rememberMeEl.checked : false;
  
  console.log('Attempting login for:', username);
  
  if (!username || !password) {
    showNotification('Please enter username and password', 'error');
    return;
  }
  
  if (users[username] && users[username].password === password) {
    currentUser = { username, role: users[username].role };
    if (rememberMe) {
      localStorage.setItem('revamp-dpsnt-remember', JSON.stringify({ username, password }));
    } else {
      localStorage.removeItem('revamp-dpsnt-remember');
    }
    sessionStorage.setItem('revamp-dpsnt-session', JSON.stringify(currentUser));
    showNotification('Login successful!', 'success');
    setTimeout(() => {
      showApp();
      renderTiles(documents);
      updateBreadcrumb();
      updateDashboardStats();
    }, 500);
  } else {
    console.log('Login failed - user not found or wrong password');
    showNotification('Invalid username or password', 'error');
  }
}


function checkSavedLogin() {
  const savedLogin = localStorage.getItem('revamp-dpsnt-remember');
  if (savedLogin) {
    try {
      const { username, password } = JSON.parse(savedLogin);
      if (users[username] && users[username].password === password) {
        currentUser = { username, role: users[username].role };
        sessionStorage.setItem('revamp-dpsnt-session', JSON.stringify(currentUser));
        showAutoLoginNotification(username);
        setTimeout(() => {
          showApp();
          loadDocuments();
          renderTiles(documents);
          updateDashboardStats();
        }, 1000);
        return true;
      }
    } catch (e) { console.error('Error checking saved login:', e); }
  }
  
  const previousLogin = sessionStorage.getItem('revamp-dpsnt-session');
  if (previousLogin) {
    try {
      const userData = JSON.parse(previousLogin);
      if (userData && userData.username && users[userData.username]) {
        currentUser = userData;
        showApp();
        loadDocuments();
        renderTiles(documents);
        updateDashboardStats();
        return true;
      }
    } catch (e) { console.error('Error checking previous login:', e); }
  }
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
  
  // Back button handler
  if (backBtn) {
    backBtn.addEventListener('click', handleBackButton);
  }
  
  // Mobile menu toggle
  mobileMenuToggle && mobileMenuToggle.addEventListener('click', () => {
    navLinks && navLinks.classList.toggle('active');
    // Toggle icon between bars and times
    const icon = mobileMenuToggle.querySelector('i');
    if (icon) {
      icon.classList.toggle('fa-bars');
      icon.classList.toggle('fa-times');
    }
  });
  
  // Close mobile menu when clicking outside
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
  
  // Close mobile menu when a nav link is clicked
  const closeMenuOnClick = () => {
    if (navLinks && window.innerWidth <= 768) {
      navLinks.classList.remove('active');
      const icon = mobileMenuToggle?.querySelector('i');
      if (icon) {
        icon.classList.add('fa-bars');
        icon.classList.remove('fa-times');
      }
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
  
  // Apply saved settings on load
  applyAccessibilitySettings();
  
  // Update toggle visual states to match saved settings
  updateAccessibilityToggleStates();
}

function setupAccessibilityToggle(toggleId, settingKey, className) {
  const toggle = document.getElementById(toggleId);
  if (!toggle) {
    console.log('Toggle not found:', toggleId);
    return;
  }
  
  // Find the switch element inside the option
  const switchEl = toggle.querySelector('.accessibility-switch');
  
  // Set initial state based on saved settings
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
    
    // Apply to both html and body elements
    document.documentElement.classList.toggle(className, accessibilitySettings[settingKey]);
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
    const switchEl = toggle?.querySelector('.accessibility-switch');
    if (toggle && accessibilitySettings[key]) {
      toggle.classList.add('active');
      if (switchEl) switchEl.classList.add('active');
    }
  });
}

function initializeKeyboardNavigation() {
  document.addEventListener('keydown', (e) => {
    // Don't handle shortcuts when typing in input fields (except Escape)
    const isInputFocused = e.target.closest('input, textarea');
    
    if (e.key === 'Escape') {
      // Close search results first
      const searchResults = document.getElementById('searchResults');
      if (searchResults && searchResults.style.display !== 'none') {
        searchResults.style.display = 'none';
        return;
      }
      
      // Close accessibility panel if open
      const accessibilityPanel = document.getElementById('accessibilityPanel');
      if (accessibilityPanel && accessibilityPanel.classList.contains('active')) {
        accessibilityPanel.classList.remove('active');
        return;
      }
      
      // If PDF viewer is open, go back to tiles
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
      
      // If we're in a subfolder, go back one level
      if (path.length > 0) {
        handleBackButton();
        return;
      }
      
      // If in a special view (favorites, recent, analytics), go back to home
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
    
    // Alt + Left Arrow to go back (like browser back)
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
    
    // Alt + Home to go to root/home
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
  
  // Get all section elements
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
  
  // Hide all sections first
  const allSections = [tilesSection, favoritesSection, recentSection, analyticsSection, 
                       plannerSection, flashcardsSection, notesSection, progressSection];
  allSections.forEach(section => {
    if (section) section.style.display = 'none';
  });
  if (searchResults) searchResults.style.display = 'none';
  if (pdfViewer) pdfViewer.style.display = 'none';
  
  // Show the appropriate section based on viewName
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
  // Save to both localStorage and Tauri
  saveRecentToStorage(updatedRecent);
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
  // Save to both localStorage and Tauri (if available)
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
    pdfViewer && (pdfViewer.style.display = 'none');
    renderTiles(getCurrentLevel());
    updateBreadcrumb();
    hideTimerCompletely();
  }
}

// Timer Functions
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

  // Initialize drag functionality
  initializeTimerDrag();
  
  // Initialize resize functionality
  initializeTimerResize();

  // Reopen button
  if (timerReopenBtn) {
    const newReopen = timerReopenBtn.cloneNode(true);
    timerReopenBtn.parentNode.replaceChild(newReopen, timerReopenBtn);
    newReopen.addEventListener('click', () => {
      showTimer();
      newReopen.classList.remove('pulse');
    });
  }

  // Preset buttons - only handle built-in presets (not custom ones)
  timerPresets.forEach(btn => {
    // Skip custom presets and the add button (they have their own handlers)
    if (btn.dataset.presetId || btn.id === 'addPresetBtn' || btn.classList.contains('custom-preset') || btn.classList.contains('add-custom')) return;
    
    // Skip if already initialized
    if (btn.dataset.initialized === 'true') return;
    
    // Skip if no duration attribute
    const durationAttr = btn.getAttribute('data-duration');
    if (!durationAttr) return;
    
    // Get duration before cloning
    const duration = parseInt(durationAttr, 10);
    if (!duration || isNaN(duration) || duration <= 0) return;
    
    // Mark as initialized before cloning
    btn.dataset.initialized = 'true';
    
    // Remove existing listeners by cloning
    const newBtn = btn.cloneNode(true);
    btn.parentNode.replaceChild(newBtn, btn);
    
    newBtn.addEventListener('click', () => {
      selectTimerPreset(newBtn, duration);
    });
  });

  // Close timer
  if (timerClose) {
    const newClose = timerClose.cloneNode(true);
    timerClose.parentNode.replaceChild(newClose, timerClose);
    newClose.addEventListener('click', () => hideTimer());
  }

  // Minimize timer
  if (timerMinimize) {
    const newMinimize = timerMinimize.cloneNode(true);
    timerMinimize.parentNode.replaceChild(newMinimize, timerMinimize);
    newMinimize.addEventListener('click', () => toggleTimerMinimize());
  }

  // Start timer
  if (timerStart) {
    const newStart = timerStart.cloneNode(true);
    timerStart.parentNode.replaceChild(newStart, timerStart);
    newStart.addEventListener('click', () => startTimer());
  }

  // Pause timer
  if (timerPause) {
    const newPause = timerPause.cloneNode(true);
    timerPause.parentNode.replaceChild(newPause, timerPause);
    newPause.addEventListener('click', () => pauseTimer());
  }

  // Resume timer
  if (timerResume) {
    const newResume = timerResume.cloneNode(true);
    timerResume.parentNode.replaceChild(newResume, timerResume);
    newResume.addEventListener('click', () => resumeTimer());
  }

  // Reset timer
  if (timerReset) {
    const newReset = timerReset.cloneNode(true);
    timerReset.parentNode.replaceChild(newReset, timerReset);
    newReset.addEventListener('click', () => resetTimer());
  }

  // Lap timer (main button)
  if (timerLap) {
    const newLap = timerLap.cloneNode(true);
    timerLap.parentNode.replaceChild(newLap, timerLap);
    newLap.addEventListener('click', () => addLap());
  }

  // Lap timer (mini button)
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
    // Don't start drag if clicking on buttons
    if (e.target.closest('button')) return;
    
    isDragging = true;
    
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
    
    // Convert from bottom/right positioning to top/left for smooth dragging
    timerPanel.style.bottom = 'auto';
    timerPanel.style.right = 'auto';
    timerPanel.style.left = initialLeft + 'px';
    timerPanel.style.top = initialTop + 'px';
    timerPanel.style.transition = 'none';
    
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
    
    // Boundary constraints
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
    if (!isDragging) return;
    isDragging = false;
    
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
    
    const newWidth = Math.max(280, Math.min(500, startWidth + deltaX));
    const newHeight = Math.max(200, startHeight + deltaY);
    
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
  
  if (!timerPanel) return;
  
  timerPanel.classList.toggle('minimized');
  
  if (minimizeBtn) {
    const icon = minimizeBtn.querySelector('i');
    if (icon) {
      if (timerPanel.classList.contains('minimized')) {
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
  // Validate duration
  if (!duration || isNaN(duration) || duration <= 0) {
    console.error('Invalid timer duration:', duration);
    return;
  }
  
  // Remove active from all presets
  document.querySelectorAll('.timer-preset-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  
  // Set duration
  timerState.duration = duration;
  timerState.remaining = duration;
  
  // Update display
  updateTimerDisplay();
  
  // Show controls
  const timerControls = document.getElementById('timerControls');
  timerControls && (timerControls.style.display = 'flex');
  
  // Reset button states
  const startBtn = document.getElementById('timerStart');
  const pauseBtn = document.getElementById('timerPause');
  const resumeBtn = document.getElementById('timerResume');
  
  if (startBtn) startBtn.style.display = 'flex';
  if (pauseBtn) pauseBtn.style.display = 'none';
  if (resumeBtn) resumeBtn.style.display = 'none';
  
  // Update status
  updateTimerStatus('Ready to start');
  
  // Reset progress bar
  const progressBar = document.getElementById('timerProgressBar');
  progressBar && (progressBar.style.width = '100%');
  progressBar && progressBar.classList.remove('warning', 'danger');
  
  // Reset display styling
  const timerDisplay = document.getElementById('timerDisplay');
  timerDisplay && timerDisplay.classList.remove('warning', 'danger');
}

function startTimer() {
  if (timerState.duration === 0) return;
  
  timerState.isRunning = true;
  timerState.isPaused = false;
  timerState.lastLapTime = timerState.duration;
  
  // Update button visibility
  document.getElementById('timerStart').style.display = 'none';
  document.getElementById('timerPause').style.display = 'flex';
  document.getElementById('timerResume').style.display = 'none';
  document.getElementById('timerLap').style.display = 'flex';
  
  // Enable mini lap button
  const miniLap = document.getElementById('timerMiniLap');
  if (miniLap) {
    miniLap.disabled = false;
    miniLap.style.opacity = '1';
  }
  
  updateTimerStatus('Timer running', 'active');
  
  // Start interval
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
  
  // Update button visibility
  document.getElementById('timerPause').style.display = 'none';
  document.getElementById('timerResume').style.display = 'flex';
  
  updateTimerStatus('Timer paused', 'paused');
}

function resumeTimer() {
  timerState.isRunning = true;
  timerState.isPaused = false;
  
  // Update button visibility
  document.getElementById('timerPause').style.display = 'flex';
  document.getElementById('timerResume').style.display = 'none';
  
  updateTimerStatus('Timer running', 'active');
  
  // Resume interval
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
  
  // Update button visibility
  document.getElementById('timerStart').style.display = 'flex';
  document.getElementById('timerPause').style.display = 'none';
  document.getElementById('timerResume').style.display = 'none';
  document.getElementById('timerLap').style.display = 'none';
  
  // Disable mini lap button
  const miniLap = document.getElementById('timerMiniLap');
  if (miniLap) {
    miniLap.disabled = true;
    miniLap.style.opacity = '0.5';
  }
  
  updateTimerDisplay();
  renderLaps();
  
  // Reset progress bar
  const progressBar = document.getElementById('timerProgressBar');
  progressBar && (progressBar.style.width = '100%');
  progressBar && progressBar.classList.remove('warning', 'danger');
  
  // Reset display styling
  const timerDisplay = document.getElementById('timerDisplay');
  timerDisplay && timerDisplay.classList.remove('warning', 'danger');
  
  updateTimerStatus('Timer reset');
}

function timerFinished() {
  clearInterval(timerState.interval);
  
  timerState.isRunning = false;
  timerState.isPaused = false;
  
  // Update button visibility
  document.getElementById('timerStart').style.display = 'none';
  document.getElementById('timerPause').style.display = 'none';
  document.getElementById('timerResume').style.display = 'none';
  
  updateTimerStatus('Time\'s up!', 'finished');
  
  // Play alert sound (using Web Audio API)
  playTimerAlert();
  
  // Show notification
  showNotification('⏰ Time\'s up! Your exam time has ended.', 'error');
}

function updateTimerDisplay() {
  const display = document.getElementById('timerDisplay');
  const timerTitle = document.querySelector('.timer-title');
  if (!display) return;
  
  // Handle NaN case
  const remaining = timerState.remaining || 0;
  const duration = timerState.duration || 1; // Avoid division by zero
  
  const hours = Math.floor(remaining / 3600);
  const minutes = Math.floor((remaining % 3600) / 60);
  const seconds = remaining % 60;
  
  const timeStr = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  display.textContent = timeStr;
  
  // Update timer title data attribute for minimized view
  if (timerTitle) {
    timerTitle.setAttribute('data-time', timeStr);
  }
  
  // Add warning/danger classes based on remaining time
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
  // Show reopen button only if PDF is visible
  const pdfViewer = document.getElementById('pdfViewer');
  if (reopenBtn && pdfViewer && pdfViewer.style.display === 'block') {
    reopenBtn.style.display = 'flex';
    // Add pulse animation if timer is running
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
  
  // Stop timer if running
  if (timerState.isRunning) {
    clearInterval(timerState.interval);
    timerState.isRunning = false;
  }
}

function playTimerAlert() {
  try {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    
    // Create a series of beeps
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

// Lap Functions
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
  
  // Visual feedback
  showNotification(`Lap ${timerState.laps.length} recorded`, 'success');
}

function deleteLap(index) {
  timerState.laps.splice(index, 1);
  // Renumber remaining laps
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
  
  // Show laps in reverse order (newest first)
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
  // Allow right-click on custom timer presets (for delete option)
  if (e.target.closest('.custom-preset')) return;
  e.preventDefault();
});

// Tauri updater - only runs in Tauri environment
async function checkForUpdates() {
  // Check if running in Tauri
  if (window.__TAURI__) {
    try {
      const { check } = await import('@tauri-apps/plugin-updater');
      const { relaunch } = await import('@tauri-apps/plugin-process');
      
      console.log('Checking for updates...');
      const update = await check();
      
      if (update) {
        console.log(`Update available: ${update.version}`);
        
        // Download and install (dialog is shown automatically since dialog: true in config)
        await update.downloadAndInstall();
        
        // Relaunch the app after update
        await relaunch();
      } else {
        console.log('No updates available');
      }
    } catch (error) {
      console.error('Update check failed:', error);
    }
  }
}

// Check for updates on app start (with delay to not block startup)
setTimeout(checkForUpdates, 5000);

// ...existing code...

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

// New feature state variables (duplicates removed — variables are declared above)

// Initialize favorites from storage
async function initializeFavorites() {
  try {
    // Try to load from Tauri file system first (if available)
    if (window.__TAURI__) {
      const loaded = await loadFavoritesFromTauri();
      if (loaded) return;
    }
    // Fallback to localStorage
    favorites = JSON.parse(localStorage.getItem('questionary-favorites') || '[]');
  } catch (e) {
    console.error('Error loading favorites:', e);
    favorites = [];
  }
}

// Save favorites to storage
async function saveFavorites() {
  try {
    // Save to localStorage (always)
    localStorage.setItem('questionary-favorites', JSON.stringify(favorites));
    
    // Also save to Tauri file system if available
    if (window.__TAURI__) {
      await saveFavoritesToTauri();
    }
  } catch (e) {
    console.error('Error saving favorites:', e);
  }
}

// Tauri-specific favorites persistence
async function loadFavoritesFromTauri() {
  try {
    const { readTextFile, BaseDirectory } = window.__TAURI__.fs || {};
    const { appDataDir } = window.__TAURI__.path || {};
    
    if (readTextFile && appDataDir) {
      const data = await readTextFile('favorites.json', { dir: BaseDirectory.AppData });
      favorites = JSON.parse(data);
      // Sync to localStorage as backup
      localStorage.setItem('questionary-favorites', JSON.stringify(favorites));
      return true;
    }
  } catch (e) {
    // File doesn't exist yet or Tauri APIs not available
    console.log('Loading favorites from localStorage instead');
  }
  return false;
}

async function saveFavoritesToTauri() {
  try {
    const { writeTextFile, createDir, BaseDirectory } = window.__TAURI__.fs || {};
    
    if (writeTextFile && createDir) {
      // Ensure app data directory exists
      try {
        await createDir('', { dir: BaseDirectory.AppData, recursive: true });
      } catch (e) {
        // Directory may already exist
      }
      
      await writeTextFile('favorites.json', JSON.stringify(favorites, null, 2), { 
        dir: BaseDirectory.AppData 
      });
    }
  } catch (e) {
    console.error('Error saving favorites to Tauri:', e);
  }
}

// Recent documents persistence
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

// Timer state
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
  const root = document.documentElement;
  root.classList.toggle('high-contrast', accessibilitySettings.highContrast);
  root.classList.toggle('large-text', accessibilitySettings.largeText);
  root.classList.toggle('reduced-motion', accessibilitySettings.reducedMotion);
  root.classList.toggle('enhanced-focus', accessibilitySettings.enhancedFocus);
  // Also apply to body for broader compatibility
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

let documents = {
    "Study Material Class 9": {
        "Physics FT": {
            "Upthrust in Fluids, Archimedes' Principle and Floatation": "https://drive.google.com/file/d/1A5IbecU77W4krqBj2zaiahZh46Q8Je6E/preview", "Heat and Energy": "https://drive.google.com/file/d/1pyvt2igU8prlMty5nwhhi6woR6a3RSeJ/preview", "Reflection of Light": "https://drive.google.com/file/d/1Fo6DpHIp658q9JiFfzf4I8puPhph0WoA/preview", "Propagation of Sound Waves": "https://drive.google.com/file/d/1uxLKeXoP5LOP-kI9B4EhHmvKrpka5A6M/preview", "Current Electricity": "https://drive.google.com/file/d/1a8oXvkZPDJpTZKRO8-lYcvk1uuLB39I8/preview", "Magnetism": "https://drive.google.com/file/d/1ijJWkhghtNb2I5Z1bOeClcA9Mg8l4Qf7/preview"},
        "Biology Class 10 Book PDFS": {
            "Excretory System": "https://drive.google.com/file/d/16b4aqhobYQm_XqXgadk5383J-Mkq6bNm/preview", "Full Book": "https://drive.google.com/file/d/1NCj_IUP8Kss0gQ3uj6cUBtLMNqKvkIRI/preview"
        }
    }
};
// Show notification toast
function showNotification(message, type = 'info') {
  const existing = document.querySelector('.notification-toast');
  if (existing) existing.remove();
  
  const toast = document.createElement('div');
  toast.className = `notification-toast ${type}`;
  toast.style.cssText = 'position:fixed;top:20px;right:20px;padding:12px 20px;border-radius:8px;display:flex;align-items:center;gap:10px;z-index:10000;animation:slideIn 0.3s ease;box-shadow:0 4px 12px rgba(0,0,0,0.15);';
  
  if (type === 'success') {
    toast.style.background = '#003d29ff';
    toast.style.color = 'white';
  } else if (type === 'error') {
    toast.style.background = '#ef4444';
    toast.style.color = 'white';
  } else {
    toast.style.background = '#3b82f6';
    toast.style.color = 'white';
  }
  
  toast.innerHTML = `
    <i class="fas ${type === 'success' ? 'fa-check-circle' : type === 'error' ? 'fa-exclamation-circle' : 'fa-info-circle'}"></i>
    <span>${message}</span>
  `;
  document.body.appendChild(toast);
  
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// Show auto-login notification
function showAutoLoginNotification(username) {
  showNotification(`Welcome back, ${username}!`, 'success');
}

// Show the main app and hide login screen
function showApp() {
  const loginScreen = document.getElementById('loginScreen');
  const app = document.getElementById('app');
  
  if (loginScreen) loginScreen.style.display = 'none';
  if (app) app.style.display = 'block';
  
  const usernameDisplay = document.getElementById('username-display');
  const welcomeUsername = document.getElementById('welcomeUsername');
  
  if (usernameDisplay && currentUser) {
    usernameDisplay.textContent = currentUser.username;
  }
  if (welcomeUsername && currentUser) {
    welcomeUsername.textContent = currentUser.username;
  }
  
  const adminBadge = document.getElementById('adminBadge');
  if (adminBadge && currentUser && currentUser.role === 'admin') {
    adminBadge.style.display = 'inline-block';
  }
  
  if (typeof updateDashboardStats === 'function') {
    updateDashboardStats();
  }
}

// Perform search
function performSearch(e) {
  const query = typeof e === 'string' ? e : (e?.target?.value || '').trim().toLowerCase();
  const searchResults = document.getElementById('searchResults');
  const searchResultsContainer = document.getElementById('searchResultsContainer');
  
  if (!query || query.length < 2) {
    if (searchResults) searchResults.style.display = 'none';
    return;
  }
  
  if (typeof addToSearchHistory === 'function') {
    addToSearchHistory(query);
  }
  
  const results = [];
  
  function searchInDocuments(obj, pathArr = []) {
    for (const [key, value] of Object.entries(obj)) {
      const currentPath = [...pathArr, key];
      if (key.toLowerCase().includes(query)) {
        if (typeof value === 'string' && value !== '#') {
          results.push({ name: key, path: currentPath, url: value, type: 'document' });
        } else if (typeof value === 'object') {
          results.push({ name: key, path: currentPath, url: null, type: 'folder' });
        }
      }
      if (typeof value === 'object') {
        searchInDocuments(value, currentPath);
      }
    }
  }
  
  searchInDocuments(documents);
  
  // Search in notes
  notes.forEach(note => {
    if (note.title.toLowerCase().includes(query) || (note.content && note.content.toLowerCase().includes(query))) {
      results.push({ name: note.title, path: ['Notes', note.title], url: null, type: 'note', id: note.id });
    }
  });
  
  // Search in flashcard decks
  flashcardDecks.forEach(deck => {
    if (deck.name.toLowerCase().includes(query) || (deck.subject && deck.subject.toLowerCase().includes(query))) {
      results.push({ name: deck.name, path: ['Flashcards', deck.name], url: null, type: 'flashcard', id: deck.id });
    }
    // Also search in card content
    if (deck.cards) {
      deck.cards.forEach(card => {
        if ((card.front && card.front.toLowerCase().includes(query)) || (card.back && card.back.toLowerCase().includes(query))) {
          if (!results.some(r => r.type === 'flashcard' && r.id === deck.id)) {
            results.push({ name: deck.name, path: ['Flashcards', deck.name], url: null, type: 'flashcard', id: deck.id });
          }
        }
      });
    }
  });
  
  if (results.length === 0) {
    if (searchResultsContainer) {
      searchResultsContainer.innerHTML = '<div style="text-align:center;padding:2rem;color:var(--text-secondary);"><i class="fas fa-search" style="font-size:2rem;margin-bottom:1rem;opacity:0.3;"></i><p>No results found</p></div>';
    }
  } else if (searchResultsContainer) {
    searchResultsContainer.innerHTML = results.slice(0, 20).map(result => {
      let icon = 'fa-file-pdf';
      if (result.type === 'folder') icon = 'fa-folder';
      else if (result.type === 'note') icon = 'fa-sticky-note';
      else if (result.type === 'flashcard') icon = 'fa-layer-group';
      
      return `
        <div class="search-result-item" onclick="navigateToSearchResult(${JSON.stringify(result.path)}, '${result.url || ''}', '${result.type}', '${result.id || ''}')">
          <i class="fas ${icon}"></i>
          <div class="search-result-info">
            <span class="search-result-name">${result.name}</span>
            <span class="search-result-path">${result.path.join(' > ')}</span>
          </div>
        </div>
      `;
    }).join('');
  }
  
  if (searchResults) searchResults.style.display = 'block';
}

function navigateToSearchResult(pathArr, url, type, id) {
  const searchResults = document.getElementById('searchResults');
  const globalSearch = document.getElementById('globalSearch');
  if (searchResults) searchResults.style.display = 'none';
  if (globalSearch) globalSearch.value = '';
  
  // Handle different result types
  if (type === 'note' && id) {
    showView('notes');
    setActiveNav('notesNav');
    const note = notes.find(n => n.id === id);
    if (note) {
      setTimeout(() => openNoteModal(note), 100);
    }
    return;
  }
  
  if (type === 'flashcard' && id) {
    showView('flashcards');
    setActiveNav('flashcardsNav');
    setTimeout(() => startStudyDeck(id), 100);
    return;
  }
  
  // Handle documents and folders
  path = pathArr.slice(0, -1);
  const name = pathArr[pathArr.length - 1];
  
  if (url && url !== '#') {
    path = pathArr;
    showPDF(url);
    addToRecent(name, pathArr, url);
  } else {
    path = pathArr;
    renderTiles(getCurrentLevel());
  }
  
  updateBreadcrumb();
}

window.navigateToSearchResult = navigateToSearchResult;

// ===== CORE TILE AND NAVIGATION FUNCTIONS =====

function getCurrentLevel() {
  let current = documents;
  for (const p of path) {
    if (current[p]) {
      current = current[p];
    } else {
      return documents;
    }
  }
  return current;
}

function renderTiles(obj) {
  const container = document.getElementById('tilesContainer');
  if (!container) return;
  
  container.innerHTML = '';
  
  // Make sure container is visible
  container.style.display = '';
  
  if (!obj || typeof obj !== 'object') {
    container.innerHTML = '<div style="text-align:center;padding:3rem;color:var(--text-secondary);"><p>No items found</p></div>';
    return;
  }
  
  const entries = Object.entries(obj);
  const sortOrder = localStorage.getItem('questionary-sort-order') || 'asc';
  
  entries.sort((a, b) => {
    const aIsFolder = typeof a[1] === 'object';
    const bIsFolder = typeof b[1] === 'object';
    if (aIsFolder && !bIsFolder) return -1;
    if (!aIsFolder && bIsFolder) return 1;
    const comparison = a[0].localeCompare(b[0]);
    return sortOrder === 'desc' ? -comparison : comparison;
  });
  
  entries.forEach(([key, value]) => {
    const tile = document.createElement('div');
    tile.className = 'tile';
    tile.setAttribute('tabindex', '0');
    
    const isFolder = typeof value === 'object';
    const isAvailable = typeof value === 'string' && value !== '#';
    const isUnavailable = value === '#';
    
    const icon = isFolder ? 'fa-folder' : (isAvailable ? 'fa-file-pdf' : 'fa-file');
    const iconColor = isFolder ? 'folder-icon' : (isAvailable ? 'pdf-icon' : '');
    
    tile.innerHTML = `
      <div class="tile-icon ${iconColor}"><i class="fas ${icon}"></i></div>
      <div class="tile-text">${key}</div>
      ${isUnavailable ? '<div class="tile-badge unavailable">Coming Soon</div>' : ''}
    `;
    
    tile.onclick = () => {
      if (isFolder) {
        path.push(key);
        renderTiles(value);
        updateBreadcrumb();
      } else if (isAvailable) {
        path.push(key);
        showPDF(value);
        addToRecent(key, [...path], value);
        updateBreadcrumb();
      }
    };
    
    container.appendChild(tile);
  });
  
  const tilesSection = document.getElementById('tilesSection');
  const pdfViewer = document.getElementById('pdfViewer');
  const dashboardHeader = document.querySelector('.dashboard-header');
  
  if (tilesSection) tilesSection.style.display = 'block';
  if (pdfViewer) pdfViewer.style.display = 'none';
  if (dashboardHeader) dashboardHeader.style.display = 'flex';
}

function isFavorite(title, docPath) {
  const pathString = Array.isArray(docPath) ? docPath.join('|') : docPath;
  return favorites.some(f => f.title === title && (Array.isArray(f.path) ? f.path.join('|') : f.path) === pathString);
}

function updateBreadcrumb() {
  const breadcrumb = document.getElementById('breadcrumb');
  const backBtn = document.getElementById('backBtn');
  if (!breadcrumb) return;
  
  let html = `<span class="breadcrumb-item" onclick="goToRoot()"><i class="fas fa-home"></i> Home</span>`;
  path.forEach((p, index) => {
    html += `<span class="breadcrumb-separator"><i class="fas fa-chevron-right"></i></span>`;
    html += `<span class="breadcrumb-item" onclick="goToPath(${index})">${p}</span>`;
  });
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
    // For Google Drive embeds, we can't directly control page
    // But we can show a notification
    showNotification(`Navigate to page ${pageNumber}`, 'info');
  }
}

window.addPageBookmark = addPageBookmark;
window.removePageBookmark = removePageBookmark;
window.goToPage = goToPage;

// ===== DOCUMENT PREVIEW TOOLTIP =====
// Disabled - was causing unwanted preview popups
function initDocumentPreview() {
  // Remove any existing preview tooltip
  const existingTooltip = document.getElementById('previewTooltip');
  if (existingTooltip) {
    existingTooltip.remove();
  }
}

let previewTimeout = null;

function showPreviewTooltip(element, url, name) {
  // Disabled - do nothing
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

// ===== SHARE LINKS =====
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

// ===== EXPORT/PRINT QUEUE =====
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

// ===== OFFLINE MODE (Service Worker) =====
function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js')
      .then(reg => console.log('Service Worker registered'))
      .catch(err => console.log('Service Worker registration failed:', err));
  }
}

// Uncomment to enable offline mode:
// document.addEventListener('DOMContentLoaded', registerServiceWorker);

// ===== INTEGRATION: Track study time when viewing PDFs =====
let pdfViewStartTime = null;

function trackPdfViewStart() {
  pdfViewStartTime = Date.now();
}

function trackPdfViewEnd(docPath) {
  if (pdfViewStartTime) {
    const viewedMinutes = Math.round((Date.now() - pdfViewStartTime) / 60000);
    if (viewedMinutes >= 1) {
      trackStudyTime(viewedMinutes);
      
      // Update document progress
      const currentProgress = documentProgress[docPath]?.progress || 0;
      const newProgress = Math.min(100, currentProgress + Math.min(viewedMinutes * 5, 25));
      updateDocProgress(docPath, newProgress);
    }
    pdfViewStartTime = null;
  }
}

window.trackPdfViewStart = trackPdfViewStart;
window.trackPdfViewEnd = trackPdfViewEnd;

// ===== KEYBOARD SHORTCUTS FOR NEW FEATURES =====
document.addEventListener('keydown', (e) => {
  // Skip if typing in input
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
  
  // N - New note
  if (e.key === 'n' || e.key === 'N') {
    if (typeof openNoteModal === 'function') {
      e.preventDefault();
      openNoteModal();
    }
  }
  
  // F - New flashcard deck
  if (e.key === 'f' || e.key === 'F') {
    if (typeof openFlashcardModal === 'function') {
      e.preventDefault();
      openFlashcardModal();
    }
  }
  
  // S - Share current path
  if (e.key === 's' || e.key === 'S') {
    if (path.length > 0 && typeof generateShareLink === 'function') {
      e.preventDefault();
      generateShareLink(path);
    }
  }
  
  // Q - Toggle quick links
  if (e.key === 'q' || e.key === 'Q') {
    e.preventDefault();
    const panel = document.getElementById('quickLinksPanel');
    panel?.classList.toggle('active');
  }
});

function initializeApp() {
  initializeNavigation();
  initializeSearch();
  initializeTheme();
  initializeAccessibility();
  initializeTimer();
  initializeNewFeatures();
  loadFavorites();
  loadStudyStats();
  updateStudyStreak();
  renderTiles(documents);
  updateBreadcrumb();
  updateDashboardStats();
}

// ===== MISSING FUNCTION IMPLEMENTATIONS =====

// Utility function
function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ===== NOTES FUNCTIONS =====
function loadNotes() {
  notes = JSON.parse(localStorage.getItem('questionary-notes') || '[]');
}

function saveNotes() {
  localStorage.setItem('questionary-notes', JSON.stringify(notes));
}

function openNoteModal(note = null) {
  currentEditingNote = note;
  const modal = document.getElementById('noteModal');
  const title = document.getElementById('noteModalTitle');
  const noteTitle = document.getElementById('noteTitle');
  const noteCategory = document.getElementById('noteCategory');
  const noteContent = document.getElementById('noteContent');
  
  if (note) {
    title.innerHTML = '<i class="fas fa-edit"></i> Edit Note';
    noteTitle.value = note.title || '';
    noteCategory.value = note.category || 'general';
    noteContent.value = note.content || '';
  } else {
    title.innerHTML = '<i class="fas fa-sticky-note"></i> Create Note';
    noteTitle.value = '';
    noteCategory.value = 'general';
    noteContent.value = '';
  }
  
  modal.classList.add('active');
}

function saveNote() {
  const noteTitle = document.getElementById('noteTitle').value.trim();
  const noteCategory = document.getElementById('noteCategory').value;
  const noteContent = document.getElementById('noteContent').value.trim();
  
  if (!noteTitle) {
    showNotification('Please enter a title', 'error');
    return;
  }
  
  if (currentEditingNote) {
    // Update existing note
    const index = notes.findIndex(n => n.id === currentEditingNote.id);
    if (index > -1) {
      notes[index] = {
        ...notes[index],
        title: noteTitle,
        category: noteCategory,
        content: noteContent,
        updatedAt: Date.now()
      };
    }
    showNotification('Note updated!', 'success');
  } else {
    // Create new note
    notes.unshift({
      id: Date.now().toString(),
      title: noteTitle,
      category: noteCategory,
      content: noteContent,
      createdAt: Date.now(),
      updatedAt: Date.now()
    });
    showNotification('Note created!', 'success');
  }
  
  saveNotes();
  renderNotes();
  document.getElementById('noteModal').classList.remove('active');
  currentEditingNote = null;
}

function deleteNote(id) {
  if (!confirm('Delete this note?')) return;
  notes = notes.filter(n => n.id !== id);
  saveNotes();
  renderNotes();
  showNotification('Note deleted', 'info');
}

function renderNotes() {
  const container = document.getElementById('notesGrid');
  if (!container) return;
  
  if (notes.length === 0) {
    container.innerHTML = '<div class="empty-state"><i class="fas fa-sticky-note"></i><h3>No notes yet</h3><p>Create your first note to get started.</p></div>';
    return;
  }
  
  container.innerHTML = notes.map(note => `
    <div class="note-card" onclick="openNoteModal(notes.find(n => n.id === '${note.id}'))">
      <div class="note-card-header">
        <h4 class="note-card-title">${escapeHtml(note.title)}</h4>
        <span class="note-card-category">${escapeHtml(note.category)}</span>
      </div>
      <div class="note-card-content">${escapeHtml(note.content || '').substring(0, 150)}${note.content && note.content.length > 150 ? '...' : ''}</div>
      <div class="note-card-footer">
        <span class="note-card-date">${new Date(note.updatedAt || note.createdAt).toLocaleDateString()}</span>
        <div class="note-card-actions">
          <button class="note-action-btn" onclick="event.stopPropagation(); openNoteModal(notes.find(n => n.id === '${note.id}'))" title="Edit">
            <i class="fas fa-edit"></i>
          </button>
          <button class="note-action-btn delete" onclick="event.stopPropagation(); deleteNote('${note.id}')" title="Delete">
            <i class="fas fa-trash"></i>
          </button>
        </div>
      </div>
    </div>
  `).join('');
}

window.deleteNote = deleteNote;
window.openNoteModal = openNoteModal;

function initializeNotesUI() {}

// ===== FLASHCARDS FUNCTIONS =====
function loadFlashcardDecks() {
  flashcardDecks = JSON.parse(localStorage.getItem('questionary-flashcards') || '[]');
}

function saveFlashcardDecks() {
  localStorage.setItem('questionary-flashcards', JSON.stringify(flashcardDecks));
}

let tempCards = [];

function openFlashcardModal(deck = null) {
  currentEditingDeck = deck;
  const modal = document.getElementById('flashcardModal');
  const title = document.getElementById('flashcardModalTitle');
  const deckName = document.getElementById('deckName');
  const deckSubject = document.getElementById('deckSubject');
  
  if (deck) {
    title.innerHTML = '<i class="fas fa-edit"></i> Edit Flashcard Deck';
    deckName.value = deck.name || '';
    deckSubject.value = deck.subject || 'physics';
    tempCards = [...(deck.cards || [])];
  } else {
    title.innerHTML = '<i class="fas fa-layer-group"></i> Create Flashcard Deck';
    deckName.value = '';
    deckSubject.value = 'physics';
    tempCards = [{ id: Date.now().toString(), front: '', back: '' }];
  }
  
  renderCardEditors();
  modal.classList.add('active');
}

function addCardEditor() {
  tempCards.push({ id: Date.now().toString(), front: '', back: '' });
  renderCardEditors();
}

function removeCardEditor(cardId) {
  if (tempCards.length <= 1) {
    showNotification('Deck must have at least one card', 'error');
    return;
  }
  tempCards = tempCards.filter(c => c.id !== cardId);
  renderCardEditors();
}

function renderCardEditors() {
  const container = document.getElementById('cardsContainer');
  if (!container) return;
  
  container.innerHTML = tempCards.map((card, index) => `
    <div class="card-editor" data-card-id="${card.id}">
      <div class="card-editor-header">
        <span class="card-editor-number">Card ${index + 1}</span>
        <button class="card-editor-delete" onclick="removeCardEditor('${card.id}')" title="Remove card">
          <i class="fas fa-times"></i>
        </button>
      </div>
      <div class="card-editor-inputs">
        <input type="text" placeholder="Question (Front)" value="${escapeHtml(card.front)}" onchange="updateTempCard('${card.id}', 'front', this.value)">
        <textarea placeholder="Answer (Back)" onchange="updateTempCard('${card.id}', 'back', this.value)">${escapeHtml(card.back)}</textarea>
      </div>
    </div>
  `).join('');
}

function updateTempCard(cardId, field, value) {
  const card = tempCards.find(c => c.id === cardId);
  if (card) {
    card[field] = value;
  }
}

window.removeCardEditor = removeCardEditor;
window.updateTempCard = updateTempCard;

function saveDeck() {
  const deckName = document.getElementById('deckName').value.trim();
  const deckSubject = document.getElementById('deckSubject').value;
  
  if (!deckName) {
    showNotification('Please enter a deck name', 'error');
    return;
  }
  
  // Validate cards - at least one complete card
  const validCards = tempCards.filter(c => c.front.trim() && c.back.trim());
  if (validCards.length === 0) {
    showNotification('Please add at least one complete card', 'error');
    return;
  }
  
  if (currentEditingDeck) {
    // Update existing deck
    const index = flashcardDecks.findIndex(d => d.id === currentEditingDeck.id);
    if (index > -1) {
      flashcardDecks[index] = {
        ...flashcardDecks[index],
        name: deckName,
        subject: deckSubject,
        cards: validCards,
        updatedAt: Date.now()
      };
    }
    showNotification('Deck updated!', 'success');
  } else {
    // Create new deck
    flashcardDecks.unshift({
      id: Date.now().toString(),
      name: deckName,
      subject: deckSubject,
      cards: validCards,
      createdAt: Date.now(),
      updatedAt: Date.now()
    });
    showNotification('Deck created!', 'success');
  }
  
  saveFlashcardDecks();
  renderFlashcardDecks();
  document.getElementById('flashcardModal').classList.remove('active');
  currentEditingDeck = null;
  tempCards = [];
}

function deleteDeck(id) {
  if (!confirm('Delete this flashcard deck?')) return;
  flashcardDecks = flashcardDecks.filter(d => d.id !== id);
  saveFlashcardDecks();
  renderFlashcardDecks();
  showNotification('Deck deleted', 'info');
}

function renderFlashcardDecks() {
  const container = document.getElementById('flashcardsGrid');
  if (!container) return;
  
  if (flashcardDecks.length === 0) {
    container.innerHTML = '<div class="empty-state"><i class="fas fa-layer-group"></i><h3>No flashcard decks</h3><p>Create your first deck to start studying.</p></div>';
    return;
  }
  
  container.innerHTML = flashcardDecks.map(deck => `
    <div class="deck-card">
      <div class="deck-card-header">
        <h4 class="deck-card-title">${escapeHtml(deck.name)}</h4>
        <span class="deck-card-subject">${escapeHtml(deck.subject)}</span>
      </div>
      <div class="deck-card-stats">
        <div class="deck-stat">
          <span class="deck-stat-value">${deck.cards ? deck.cards.length : 0}</span>
          <span class="deck-stat-label">Cards</span>
        </div>
      </div>
      <div class="deck-card-actions">
        <button class="btn btn-primary" onclick="startStudyDeck('${deck.id}')"><i class="fas fa-graduation-cap"></i> Study</button>
        <button class="btn btn-secondary" onclick="openFlashcardModal(flashcardDecks.find(d => d.id === '${deck.id}'))"><i class="fas fa-edit"></i></button>
        <button class="btn btn-secondary" onclick="deleteDeck('${deck.id}')" style="color: var(--danger-color);"><i class="fas fa-trash"></i></button>
      </div>
    </div>
  `).join('');
}

function startStudyDeck(deckId) {
  const deck = flashcardDecks.find(d => d.id === deckId);
  if (!deck || !deck.cards || deck.cards.length === 0) {
    showNotification('This deck has no cards', 'error');
    return;
  }
  
  currentStudyDeck = deck;
  currentCardIndex = 0;
  
  const modal = document.getElementById('studyModal');
  const title = document.getElementById('studyModalTitle');
  title.innerHTML = `<i class="fas fa-graduation-cap"></i> ${escapeHtml(deck.name)}`;
  
  updateStudyCard();
  modal.classList.add('active');
}

function updateStudyCard() {
  if (!currentStudyDeck || !currentStudyDeck.cards) return;
  
  const card = currentStudyDeck.cards[currentCardIndex];
  const cardFront = document.getElementById('cardFront');
  const cardBack = document.getElementById('cardBack');
  const cardProgress = document.getElementById('cardProgress');
  const flashcard = document.getElementById('activeFlashcard');
  
  cardFront.textContent = card.front;
  cardBack.textContent = card.back;
  cardProgress.textContent = `${currentCardIndex + 1} / ${currentStudyDeck.cards.length}`;
  flashcard.classList.remove('flipped');
}

window.startStudyDeck = startStudyDeck;
window.deleteDeck = deleteDeck;
window.openFlashcardModal = openFlashcardModal;

function flipCard() {
  document.getElementById('activeFlashcard')?.classList.toggle('flipped');
}

function nextCard() {
  if (!currentStudyDeck) return;
  currentCardIndex = (currentCardIndex + 1) % currentStudyDeck.cards.length;
  updateStudyCard();
}

function prevCard() {
  if (!currentStudyDeck) return;
  currentCardIndex = (currentCardIndex - 1 + currentStudyDeck.cards.length) % currentStudyDeck.cards.length;
  updateStudyCard();
}

function initializeFlashcardsUI() {}

// ===== STUDY PLANNER FUNCTIONS =====
function loadStudySessions() {
  studySessions = JSON.parse(localStorage.getItem('questionary-sessions') || '[]');
}

function saveStudySessions() {
  localStorage.setItem('questionary-sessions', JSON.stringify(studySessions));
}

let currentEditingSession = null;

function openSessionModal(session = null) {
  currentEditingSession = session;
  const modal = document.getElementById('sessionModal');
  const title = document.getElementById('sessionModalTitle');
  const sessionSubject = document.getElementById('sessionSubject');
  const sessionDate = document.getElementById('sessionDate');
  const sessionTime = document.getElementById('sessionTime');
  const sessionDuration = document.getElementById('sessionDuration');
  const sessionNotes = document.getElementById('sessionNotes');
  
  if (!modal) return;
  
  if (session) {
    title.innerHTML = '<i class="fas fa-edit"></i> Edit Study Session';
    sessionSubject.value = session.subject || '';
    sessionDate.value = session.date || '';
    sessionTime.value = session.time || '';
    sessionDuration.value = session.duration || 60;
    sessionNotes.value = session.notes || '';
  } else {
    title.innerHTML = '<i class="fas fa-calendar-plus"></i> Add Study Session';
    sessionSubject.value = '';
    const today = new Date().toISOString().split('T')[0];
    sessionDate.value = today;
    sessionTime.value = '09:00';
    sessionDuration.value = 60;
    sessionNotes.value = '';
  }
  
  modal.classList.add('active');
}

function saveSession() {
  const sessionSubject = document.getElementById('sessionSubject')?.value.trim();
  const sessionDate = document.getElementById('sessionDate')?.value;
  const sessionTime = document.getElementById('sessionTime')?.value;
  const sessionDuration = parseInt(document.getElementById('sessionDuration')?.value) || 60;
  const sessionNotes = document.getElementById('sessionNotes')?.value.trim();
  
  if (!sessionSubject) {
    showNotification('Please enter a subject', 'error');
    return;
  }
  
  if (!sessionDate) {
    showNotification('Please select a date', 'error');
    return;
  }
  
  if (currentEditingSession) {
    const index = studySessions.findIndex(s => s.id === currentEditingSession.id);
    if (index > -1) {
      studySessions[index] = {
        ...studySessions[index],
        subject: sessionSubject,
        date: sessionDate,
        time: sessionTime,
        duration: sessionDuration,
        notes: sessionNotes,
        updatedAt: Date.now()
      };
    }
    showNotification('Session updated!', 'success');
  } else {
    studySessions.push({
      id: Date.now().toString(),
      subject: sessionSubject,
      date: sessionDate,
      time: sessionTime,
      duration: sessionDuration,
      notes: sessionNotes,
      completed: false,
      createdAt: Date.now()
    });
    showNotification('Session added!', 'success');
  }
  
  studySessions.sort((a, b) => new Date(a.date + ' ' + a.time) - new Date(b.date + ' ' + b.time));
  
  saveStudySessions();
  renderCalendar();
  renderSessions();
  document.getElementById('sessionModal')?.classList.remove('active');
  currentEditingSession = null;
}

function deleteSession(id) {
  if (!confirm('Delete this study session?')) return;
  studySessions = studySessions.filter(s => s.id !== id);
  saveStudySessions();
  renderCalendar();
  renderSessions();
  showNotification('Session deleted', 'info');
}

function toggleSessionComplete(id) {
  const session = studySessions.find(s => s.id === id);
  if (session) {
    session.completed = !session.completed;
    saveStudySessions();
    renderSessions();
    if (session.completed) {
      trackStudyTime(session.duration);
      recordStudyActivity();
      showNotification('Session completed! Great job!', 'success');
    }
  }
}

window.deleteSession = deleteSession;
window.toggleSessionComplete = toggleSessionComplete;
window.openSessionModal = openSessionModal;
window.selectCalendarDay = selectCalendarDay;

function renderCalendar() {
  const daysContainer = document.getElementById('calendarDays');
  const monthLabel = document.getElementById('currentMonth');
  if (!daysContainer) return;
  
  const year = currentCalendarDate.getFullYear();
  const month = currentCalendarDate.getMonth();
  
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 
                      'July', 'August', 'September', 'October', 'November', 'December'];
  
  if (monthLabel) {
    monthLabel.textContent = `${monthNames[month]} ${year}`;
  }
  
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];
  
  const monthSessions = studySessions.filter(s => {
    const sessionDate = new Date(s.date);
    return sessionDate.getMonth() === month && sessionDate.getFullYear() === year;
  });
  
  const sessionDays = new Set(monthSessions.map(s => new Date(s.date).getDate()));
  
  let html = '';
  
  for (let i = 0; i < firstDay; i++) {
    html += '<div class="calendar-day empty"></div>';
  }
  
  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const isToday = dateStr === todayStr;
    const hasSession = sessionDays.has(day);
    
    html += `<div class="calendar-day${isToday ? ' today' : ''}${hasSession ? ' has-session' : ''}" onclick="selectCalendarDay('${dateStr}')">${day}</div>`;
  }
  
  daysContainer.innerHTML = html;
}

function selectCalendarDay(dateStr) {
  openSessionModal();
  document.getElementById('sessionDate').value = dateStr;
}

function renderSessions() {
  const container = document.getElementById('sessionsList');
  if (!container) return;
  
  const today = new Date().toISOString().split('T')[0];
  const upcomingSessions = studySessions.filter(s => s.date >= today && !s.completed).slice(0, 5);
  
  if (upcomingSessions.length === 0) {
    container.innerHTML = '<p class="empty-state" style="padding: 1rem;"><i class="fas fa-calendar"></i> No upcoming sessions. Click "Add Session" or click a date on the calendar.</p>';
    return;
  }
  
  container.innerHTML = upcomingSessions.map(session => {
    const sessionDate = new Date(session.date);
    const dayName = sessionDate.toLocaleDateString('en-US', { weekday: 'short' });
    const dayNum = sessionDate.getDate();
    
    return `
      <div class="session-item${session.completed ? ' completed' : ''}">
        <div class="session-time">
          <div class="session-time-value">${dayNum}</div>
          <div class="session-time-label">${dayName}</div>
        </div>
        <div class="session-info">
          <div class="session-subject">${escapeHtml(session.subject)}</div>
          <div class="session-details">${session.time || 'All day'} • ${session.duration} min</div>
        </div>
        <div class="session-actions">
          <button class="session-action-btn" onclick="toggleSessionComplete('${session.id}')" title="${session.completed ? 'Mark incomplete' : 'Mark complete'}">
            <i class="fas fa-${session.completed ? 'undo' : 'check'}"></i>
          </button>
          <button class="session-action-btn delete" onclick="deleteSession('${session.id}')" title="Delete">
            <i class="fas fa-trash"></i>
          </button>
        </div>
      </div>
    `;
  }).join('');
}

function initializePlannerUI() {}

// ===== PROGRESS FUNCTIONS =====
function loadDocumentProgress() {
  documentProgress = JSON.parse(localStorage.getItem('questionary-progress') || '{}');
}

function saveDocumentProgress() {
  localStorage.setItem('questionary-progress', JSON.stringify(documentProgress));
}

function updateDocProgress(docPath, progress) {
  const pathKey = Array.isArray(docPath) ? docPath.join('|') : docPath;
  documentProgress[pathKey] = { 
    progress: Math.min(100, Math.max(0, progress)), 
    lastAccessed: Date.now(),
    title: Array.isArray(docPath) ? docPath[docPath.length - 1] : docPath.split('|').pop()
  };
  saveDocumentProgress();
  updateProgressDisplay();
}

function renderProgressList() {
  const container = document.getElementById('progressList');
  if (!container) return;
  
  const progressEntries = Object.entries(documentProgress);
  
  if (progressEntries.length === 0) {
    container.innerHTML = '<p class="empty-state"><i class="fas fa-chart-line"></i> No progress tracked yet. Open documents to track your progress.</p>';
    return;
  }
  
  // Sort by last accessed
  progressEntries.sort((a, b) => b[1].lastAccessed - a[1].lastAccessed);
  
  container.innerHTML = progressEntries.map(([pathKey, data]) => {
    const pathParts = pathKey.split('|');
    const title = data.title || pathParts[pathParts.length - 1];
    const pathStr = pathParts.slice(0, -1).join(' > ') || 'Root';
    const progress = data.progress || 0;
    const status = progress >= 100 ? 'completed' : progress > 0 ? 'in-progress' : 'not-started';
    
    return `
      <div class="progress-item" data-status="${status}">
        <div class="progress-item-icon">
          <i class="fas fa-file-pdf"></i>
        </div>
        <div class="progress-item-info">
          <div class="progress-item-title">${escapeHtml(title)}</div>
          <div class="progress-item-path">${escapeHtml(pathStr)}</div>
        </div>
        <div class="progress-item-bar">
          <div class="progress-bar-container">
            <div class="progress-bar-fill${progress >= 100 ? ' completed' : ''}" style="width: ${progress}%"></div>
          </div>
          <div class="progress-bar-label">${progress}%</div>
        </div>
      </div>
    `;
  }).join('');
}

function updateProgressDisplay() {
  // Update overall progress ring
  const progressEntries = Object.entries(documentProgress);
  const totalProgress = progressEntries.length > 0 
    ? progressEntries.reduce((sum, [, data]) => sum + (data.progress || 0), 0) / progressEntries.length 
    : 0;
  
  const progressRing = document.getElementById('progressRingFill');
  const overallProgress = document.getElementById('overallProgress');
  
  if (progressRing) {
    const circumference = 377; // 2 * π * 60 (radius)
    const offset = circumference - (totalProgress / 100) * circumference;
    progressRing.style.strokeDashoffset = offset;
  }
  
  if (overallProgress) {
    overallProgress.textContent = `${Math.round(totalProgress)}%`;
  }
  
  // Update completed count
  const completedDocs = document.getElementById('completedDocs');
  if (completedDocs) {
    const completed = progressEntries.filter(([, data]) => data.progress >= 100).length;
    completedDocs.textContent = completed;
  }
  
  // Update streak on progress page
  const streakDisplay = document.getElementById('currentStreak');
  if (streakDisplay) {
    streakDisplay.textContent = `${studyStats.streak || 0} days`;
  }
  
  renderProgressList();
  updateStudyStatsDisplay();
}

function initializeProgressUI() {}

// ===== STUDY STATS FUNCTIONS =====
function loadStudyStats() {
  studyStats = JSON.parse(localStorage.getItem('questionary-study-stats') || '{"totalTime":0,"streak":0,"lastStudyDate":null,"hourlyActivity":{}}');
}

function saveStudyStats() {
  localStorage.setItem('questionary-study-stats', JSON.stringify(studyStats));
}

function trackStudyTime(minutes) {
  studyStats.totalTime = (studyStats.totalTime || 0) + minutes;
  
  // Track hourly activity
  const hour = new Date().getHours();
  studyStats.hourlyActivity = studyStats.hourlyActivity || {};
  studyStats.hourlyActivity[hour] = (studyStats.hourlyActivity[hour] || 0) + minutes;
  
  saveStudyStats();
  updateStudyStatsDisplay();
}

function recordStudyActivity() {
  const today = new Date().toISOString().split('T')[0];
  
  if (studyStats.lastStudyDate !== today) {
    // Check if yesterday was the last study date for streak
    const yesterday = getYesterday();
    if (studyStats.lastStudyDate === yesterday) {
      studyStats.streak = (studyStats.streak || 0) + 1;
    } else if (studyStats.lastStudyDate !== today) {
      // Reset streak if more than one day gap
      studyStats.streak = 1;
    }
    studyStats.lastStudyDate = today;
    saveStudyStats();
    updateDashboardStats();
  }
}

function getYesterday() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().split('T')[0];
}

function updateStudyStreak() {
  const today = new Date().toISOString().split('T')[0];
  if (studyStats.lastStudyDate && studyStats.lastStudyDate !== today && studyStats.lastStudyDate !== getYesterday()) {
    studyStats.streak = 0;
    saveStudyStats();
  }
}

function updateStudyStatsDisplay() {
  const totalTimeEl = document.getElementById('totalStudyTime');
  const streakEl = document.getElementById('studyStreak');
  const productiveHourEl = document.getElementById('productiveHour');
  
  if (totalTimeEl) {
    const hours = Math.floor((studyStats.totalTime || 0) / 60);
    const mins = (studyStats.totalTime || 0) % 60;
    totalTimeEl.textContent = `${hours}h ${mins}m`;
  }
  
  if (streakEl) {
    streakEl.textContent = `${studyStats.streak || 0} days`;
  }
  
  if (productiveHourEl) {
    const hourlyActivity = studyStats.hourlyActivity || {};
    const entries = Object.entries(hourlyActivity);
    if (entries.length > 0) {
      const mostProductive = entries.reduce((max, [hour, mins]) => 
        mins > max[1] ? [hour, mins] : max, ['0', 0]);
      const hour = parseInt(mostProductive[0]);
      const period = hour >= 12 ? 'PM' : 'AM';
      const displayHour = hour % 12 || 12;
      productiveHourEl.textContent = `${displayHour} ${period}`;
    } else {
      productiveHourEl.textContent = '--';
    }
  }
}

// ===== QUICK LINKS FUNCTIONS =====
function loadQuickLinks() {
  quickLinks = JSON.parse(localStorage.getItem('questionary-quick-links') || '[]');
}

function saveQuickLinks() {
  localStorage.setItem('questionary-quick-links', JSON.stringify(quickLinks));
}

function renderQuickLinks() {
  const container = document.getElementById('quickLinksList');
  if (!container) return;
  
  if (quickLinks.length === 0) {
    container.innerHTML = `
      <div class="quick-links-empty">
        <i class="fas fa-link"></i>
        No quick links yet. Navigate to a folder and click Add.
      </div>
    `;
    return;
  }
  
  container.innerHTML = quickLinks.map(ql => `
    <div class="quick-link-item" data-id="${ql.id}">
      <i class="fas fa-folder"></i>
      <span class="quick-link-name">${escapeHtml(ql.name)}</span>
      <button class="quick-link-delete" onclick="event.stopPropagation(); deleteQuickLink('${ql.id}')" title="Remove">
        <i class="fas fa-times"></i>
      </button>
    </div>
  `).join('');
  
  // Add click handlers for navigation
  container.querySelectorAll('.quick-link-item').forEach(item => {
    item.addEventListener('click', (e) => {
      if (e.target.closest('.quick-link-delete')) return;
      const id = item.dataset.id;
      const ql = quickLinks.find(q => q.id === id);
      if (ql) {
        path = [...ql.pathArray];
        renderTiles(getCurrentLevel());
        updateBreadcrumb();
        document.getElementById('quickLinksPanel')?.classList.remove('active');
      }
    });
  });
}

function deleteQuickLink(id) {
  quickLinks = quickLinks.filter(ql => ql.id !== id);
  saveQuickLinks();
  renderQuickLinks();
  showNotification('Quick link removed', 'info');
}

window.deleteQuickLink = deleteQuickLink; 

function initializeQuickLinksUI() { 
  // This is now handled in initializeNewFeatures
}

function initializeCompareUI() {}

function loadFavorites() {
  // Already handled by initializeFavorites
}
function updatePrintQueueBadge() {
  const badge = document.getElementById('printQueueBadge');
  if (badge) {
    const printQueue = getPrintQueue();
    badge.textContent = printQueue.length > 0 ? printQueue.length : '';
  }
}
function getPrintQueue() {
  return JSON.parse(localStorage.getItem('questionary-print-queue') || '[]');
}