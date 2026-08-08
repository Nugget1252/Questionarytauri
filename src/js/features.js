// ============================================
// QUESTIONARY ENHANCED FEATURES MODULE
// All new features without external backend
// ============================================

// Helper function for HTML escaping
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Helper function for notifications (uses app.js if available)
function showNotification(message, type = 'info') {
    if (typeof window.showNotification === 'function' && window.showNotification !== showNotification) {
        window.showNotification(message, type);
    } else {
        console.log(`[${type.toUpperCase()}] ${message}`);
    }
}

// ============================================
// 1. PDF BOOKMARKS & PAGE TRACKING
// ============================================
let pdfBookmarks = JSON.parse(localStorage.getItem('questionary-pdf-bookmarks') || '{}');

function savePdfBookmarks() {
    localStorage.setItem('questionary-pdf-bookmarks', JSON.stringify(pdfBookmarks));
}

function addPdfBookmark(pdfUrl, pageNumber, title = '') {
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
    // Auto-show bookmarks panel so user sees the bookmark immediately
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
        container.innerHTML = '<p class="empty-state">No bookmarks yet. Click "Add Bookmark" while viewing a PDF.</p>';
        return;
    }
    
    container.innerHTML = bookmarks.map(b => `
        <div class="bookmark-item" data-page="${b.page}">
            <i class="fas fa-bookmark"></i>
            <span class="bookmark-title">${b.title}</span>
            <span class="bookmark-page">Page ${b.page}</span>
            <button class="bookmark-delete" onclick="removePdfBookmark('${pdfUrl}', '${b.id}')">
                <i class="fas fa-times"></i>
            </button>
        </div>
    `).join('');
    
    container.querySelectorAll('.bookmark-item').forEach(item => {
        item.addEventListener('click', (e) => {
            if (!e.target.closest('.bookmark-delete')) {
                const page = parseInt(item.dataset.page);
                goToPdfPage(page);
            }
        });
    });
}

function goToPdfPage(pageNumber) {
    const iframe = document.getElementById('pdfViewer');
    if (!iframe || !iframe.contentWindow) return;
    
    // Send navigation command to the PDF.js viewer via postMessage
    iframe.contentWindow.postMessage({ type: 'goToPage', page: pageNumber }, '*');
    showNotification(`Navigating to page ${pageNumber}`, 'info');
}

// ============================================
// 2. PDF ANNOTATIONS & HIGHLIGHTING
// ============================================
let pdfAnnotations = JSON.parse(localStorage.getItem('questionary-pdf-annotations') || '{}');

function savePdfAnnotations() {
    localStorage.setItem('questionary-pdf-annotations', JSON.stringify(pdfAnnotations));
}

function addPdfAnnotation(pdfUrl, annotation) {
    if (!pdfAnnotations[pdfUrl]) {
        pdfAnnotations[pdfUrl] = [];
    }
    
    const newAnnotation = {
        id: Date.now().toString(),
        type: annotation.type || 'highlight', // highlight, note, underline
        color: annotation.color || '#ffeb3b',
        text: annotation.text || '',
        note: annotation.note || '',
        page: annotation.page,
        position: annotation.position, // {x, y, width, height}
        createdAt: new Date().toISOString()
    };
    
    pdfAnnotations[pdfUrl].push(newAnnotation);
    savePdfAnnotations();
    return newAnnotation;
}

function getPdfAnnotations(pdfUrl) {
    return pdfAnnotations[pdfUrl] || [];
}

function deletePdfAnnotation(pdfUrl, annotationId) {
    if (pdfAnnotations[pdfUrl]) {
        pdfAnnotations[pdfUrl] = pdfAnnotations[pdfUrl].filter(a => a.id !== annotationId);
        savePdfAnnotations();
    }
}

// ============================================
// 3. QUIZ MODE FROM FLASHCARDS
// ============================================
let quizState = {
    active: false,
    deckId: null,
    questions: [],
    currentIndex: 0,
    score: 0,
    answers: [],
    mode: 'multiple-choice', // multiple-choice, type-answer, true-false
    startTime: null,
    timeLimit: null
};

function startQuiz(deckId, mode = 'multiple-choice', timeLimit = null) {
    const deck = flashcardDecks.find(d => d.id === deckId);
    if (!deck || deck.cards.length < 2) {
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
        // Generate wrong answers from other cards (use front+back as unique identifier)
        const questionKey = question.front + '|||' + question.back;
        const otherCards = quizState.questions.filter(q => (q.front + '|||' + q.back) !== questionKey);
        const wrongAnswers = otherCards.slice(0, 3).map(q => q.back);
        
        // Ensure we have enough options
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
                <button class="btn btn-primary" onclick="submitTypedAnswer()">
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
    
    container.innerHTML = `
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
    `;
    
    // Add click handlers for multiple choice
    container.querySelectorAll('.quiz-option').forEach(btn => {
        btn.addEventListener('click', () => {
            const selectedAnswer = btn.dataset.answer;
            checkQuizAnswer(selectedAnswer);
        });
    });
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
    
    // Highlight correct/wrong
    const options = document.querySelectorAll('.quiz-option');
    options.forEach(opt => {
        opt.disabled = true;
        if (opt.dataset.answer === question.back) {
            opt.classList.add('correct');
        } else if (opt.dataset.answer === selectedAnswer && !isCorrect) {
            opt.classList.add('wrong');
        }
    });
    
    // Move to next question after delay
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
    const timeTaken = Math.round((Date.now() - quizState.startTime) / 1000);
    const percentage = Math.round((quizState.score / quizState.questions.length) * 100);
    
    let grade = 'F';
    let gradeClass = 'grade-f';
    if (percentage >= 90) { grade = 'A+'; gradeClass = 'grade-a'; }
    else if (percentage >= 80) { grade = 'A'; gradeClass = 'grade-a'; }
    else if (percentage >= 70) { grade = 'B'; gradeClass = 'grade-b'; }
    else if (percentage >= 60) { grade = 'C'; gradeClass = 'grade-c'; }
    else if (percentage >= 50) { grade = 'D'; gradeClass = 'grade-d'; }
    
    container.innerHTML = `
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
                    <span class="stat-value">${formatTime(timeTaken)}</span>
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
                <button class="btn btn-primary" onclick="startQuiz('${quizState.deckId}', '${quizState.mode}')">
                    <i class="fas fa-redo"></i> Retry Quiz
                </button>
                <button class="btn btn-secondary" onclick="closeQuizModal()">
                    <i class="fas fa-times"></i> Close
                </button>
            </div>
        </div>
    `;
    
    // Save quiz result to stats
    saveQuizResult(quizState.deckId, percentage, timeTaken);
}

function formatTime(seconds) {
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
    // Keep last 100 results
    if (quizHistory.length > 100) quizHistory = quizHistory.slice(-100);
    localStorage.setItem('questionary-quiz-history', JSON.stringify(quizHistory));
}

function showQuizModal() {
    let modal = document.getElementById('quizModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'quizModal';
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal modal-lg">
                <div class="modal-header">
                    <h2><i class="fas fa-question-circle"></i> Quiz Mode</h2>
                    <button class="modal-close" onclick="closeQuizModal()">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="modal-body" id="quizContent"></div>
            </div>
        `;
        document.body.appendChild(modal);
    }
    modal.classList.add('active');
}

function closeQuizModal() {
    const modal = document.getElementById('quizModal');
    if (modal) modal.classList.remove('active');
    quizState.active = false;
}

// ============================================
// 4. STUDY REMINDERS WITH NOTIFICATIONS
// ============================================
let studyReminders = JSON.parse(localStorage.getItem('questionary-reminders') || '[]');

function saveReminders() {
    localStorage.setItem('questionary-reminders', JSON.stringify(studyReminders));
}

function addStudyReminder(title, time, days) {
    const newReminder = {
        id: Date.now().toString(),
        title: title,
        message: '',
        time: time, // HH:MM format
        days: days || [0, 1, 2, 3, 4, 5, 6], // Days of week (0 = Sunday)
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
    if (!reminder.enabled) return;
    if (!reminder.time) return; // Skip if no time set
    
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
        // Reschedule for next day
        scheduleReminder(reminder);
    }, delay);
}

function showStudyNotification(reminder) {
    // Play alarm sound
    if (typeof playAlarmSound === 'function') {
        playAlarmSound();
    }
    
    // Browser notification
    if ('Notification' in window && Notification.permission === 'granted') {
        new Notification('Questionary - Study Reminder', {
            body: reminder.title + (reminder.message ? '\n' + reminder.message : ''),
            icon: 'assets/logo.png'
        });
    }
    
    // In-app notification
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
        container.innerHTML = '<p class="empty-state">No reminders set. Click "Add Reminder" to create one.</p>';
        return;
    }
    
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    
    container.innerHTML = studyReminders.map(r => `
        <div class="reminder-item ${r.enabled ? '' : 'disabled'}">
            <div class="reminder-toggle">
                <label class="switch">
                    <input type="checkbox" ${r.enabled ? 'checked' : ''} onchange="toggleReminder('${r.id}')">
                    <span class="slider"></span>
                </label>
            </div>
            <div class="reminder-info">
                <span class="reminder-title">${escapeHtml(r.title)}</span>
                <span class="reminder-time">${r.time}</span>
                <span class="reminder-days">${r.days.map(d => dayNames[d]).join(', ')}</span>
            </div>
            <div class="reminder-actions">
                <button class="reminder-tag-btn" onclick="event.stopPropagation(); openTagItemModal('reminder_${r.id}', '${escapeHtml(r.title)}', 'reminder')" title="Add Tags">
                    <i class="fas fa-tag"></i>
                </button>
                <button class="reminder-delete" onclick="deleteReminder('${r.id}')">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        </div>
    `).join('');
}

function initReminders() {
    requestNotificationPermission();
    studyReminders.forEach(r => {
        if (r.enabled) scheduleReminder(r);
    });
}
// Add this function inside features.js:
function initLibraryDragDrop() {
    const dropZone = document.getElementById('libraryDropZone');
    const importedSection = document.getElementById('importedSection');

    [dropZone, importedSection].forEach(el => {
        if (!el) return;

        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(evt => {
            el.addEventListener(evt, (e) => {
                e.preventDefault();
                e.stopPropagation();
            }, false);
        });

        el.addEventListener('dragover', () => el.classList.add('drag-over'), false);
        el.addEventListener('dragleave', () => el.classList.remove('drag-over'), false);
        
        el.addEventListener('drop', async (e) => {
            el.classList.remove('drag-over');
            if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) {
                showNotification(`Importing ${e.dataTransfer.files.length} file(s)...`, 'info');
                for (const file of e.dataTransfer.files) {
                    await UserLibraryDbService.importFile(file, UserLibraryDbService.currentFolderId);
                }
                await renderLibrary();
                showNotification('Files imported to Library!', 'success');
            }
        }, false);
    });
}

// Inside initEnhancedFeatures() in features.js, ensure initLibraryDragDrop() is called:
async function initEnhancedFeatures() {
    console.log('[Features] Initializing enhanced features...');
    await UserLibraryDbService.init();
    
    initReminders();
    initDragDropImport();
    initLibraryDragDrop(); // <--- ADD THIS LINE
    initThemeOnLoad();
    
    renderVoiceNotesGrid();
    renderTagsMain();
    renderTaggedItems();
    renderLibrary();
}
// ============================================
// 5. THEMES — Light / Dark + Custom Theme Builder
// ============================================

// Default custom theme values (light base)
const defaultCustomTheme = {
    bg: '#f7f7f8', surface: '#ffffff', fg: '#18181b', accent: '#cf6215',
    navbar: '#ffffff', btnIcon: '#cf6215', line: '#e4e4e7',
    folder1: '#cf6215', folder2: '#0891b2', folder3: '#16a34a',
    folder4: '#ea580c', folder5: '#db2777', folder6: '#7c3aed', folder7: '#0d9488',
    font: "'DM Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif"
};

function setTheme(themeName) {
    if (themeName !== 'light' && themeName !== 'dark') themeName = 'light';
    
    localStorage.setItem('questionary-theme', themeName);
    localStorage.setItem('theme', themeName);
    document.documentElement.setAttribute('data-theme', themeName);
    
    // If custom theme is NOT active, clear any inline overrides
    if (!isCustomThemeActive()) {
        clearInlineThemeVars();
    }
    
    // Update UI
    const themeIcon = document.getElementById('themeIcon');
    if (themeIcon) {
        themeIcon.classList.toggle('fa-moon', themeName === 'light');
        themeIcon.classList.toggle('fa-sun', themeName !== 'light');
    }
    
    updateModeSwitcher();
    showNotification(`Switched to ${themeName === 'light' ? 'Light' : 'Dark'} mode`, 'success');
}

function getCurrentTheme() {
    return localStorage.getItem('questionary-theme') || 'light';
}

function updateModeSwitcher() {
    const current = getCurrentTheme();
    document.querySelectorAll('.mode-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.mode === current);
    });
}

function isCustomThemeActive() {
    return localStorage.getItem('questionary-custom-theme-active') === 'true';
}

function toggleCustomTheme(enabled) {
    localStorage.setItem('questionary-custom-theme-active', enabled ? 'true' : 'false');
    const panel = document.getElementById('customThemePanel');
    if (panel) panel.style.display = enabled ? 'block' : 'none';
    
    if (enabled) {
        applyCustomTheme();
    } else {
        clearInlineThemeVars();
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
    // derive secondary text
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
    
    // Navbar / header
    const header = document.querySelector('.header');
    if (header) header.style.background = t.navbar;
    
    // Button/icon color — override accent on buttons
    root.style.setProperty('--btn-icon-color', t.btnIcon);
    
    // Font
    if (t.font) {
        root.style.setProperty('font-family', t.font);
        document.body.style.fontFamily = t.font;
    }
}

function clearInlineThemeVars() {
    const root = document.documentElement;
    const props = ['--bg','--background','--surface','--surface-hover','--fg','--text-primary',
        '--fg2','--text-secondary','--accent','--accent-hover','--accent-light','--primary-color',
        '--primary-hover','--primary-light','--line','--border','--hover',
        '--folder-1','--folder-2','--folder-3','--folder-4','--folder-5','--folder-6','--folder-7',
        '--btn-icon-color','font-family'];
    props.forEach(p => root.style.removeProperty(p));
    document.body.style.fontFamily = '';
    const header = document.querySelector('.header');
    if (header) header.style.background = '';
}

function updateCustomTheme() {
    // Read all pickers and update hex displays
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
    // Folder colors
    for (let i = 1; i <= 7; i++) {
        const el = document.getElementById('customFolder' + i);
        if (el) t['folder' + i] = el.value;
    }
    // Font
    const fontEl = document.getElementById('customFont');
    if (fontEl) t.font = fontEl.value;
    
    // Live preview
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
    // Apply stored base theme
    const stored = getCurrentTheme();
    document.documentElement.setAttribute('data-theme', stored);
    updateModeSwitcher();
    
    // Update navbar icon
    const themeIcon = document.getElementById('themeIcon');
    if (themeIcon) {
        themeIcon.classList.toggle('fa-moon', stored === 'light');
        themeIcon.classList.toggle('fa-sun', stored !== 'light');
    }
    
    // Custom theme
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
    }
}

function renderThemeSelector() {
    // No longer needed — theme is now controlled by mode-switcher buttons
    // Kept for backward-compat; just update the mode switcher
    updateModeSwitcher();
}

// ============================================
// 6. TAGGING SYSTEM
// ============================================
let tags = JSON.parse(localStorage.getItem('questionary-tags') || '[]');
let itemTags = JSON.parse(localStorage.getItem('questionary-item-tags') || '{}');

// Cleanup: remove orphaned itemTags entries that reference non-existent tags
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
    const tag = {
        id: Date.now().toString(),
        name: name.toLowerCase().trim(),
        color: color
    };
    
    if (!tags.find(t => t.name === tag.name)) {
        tags.push(tag);
        saveTags();
        renderTagsList();
        renderTagsMain();
        renderTaggedItems();
        // Update home page tags if visible
        if (typeof window.renderHomeTagsList === 'function') window.renderHomeTagsList();
        if (typeof window.renderHomeTaggedItemsList === 'function') window.renderHomeTaggedItemsList();
        showNotification(`Tag "${tag.name}" created`, 'success');
    }
    return tag;
}

function deleteTag(tagId) {
    tags = tags.filter(t => t.id !== tagId);
    // Remove tag from all items, and clean up items with no remaining tags
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

function getItemsByTag(tagId) {
    return Object.entries(itemTags)
        .filter(([_, tagIds]) => tagIds.includes(tagId))
        .map(([itemId]) => itemId);
}

function renderTagsManager() {
    const container = document.getElementById('tagsManager');
    if (!container) return;
    
    container.innerHTML = `
        <div class="tags-header">
            <h4>Manage Tags</h4>
            <button class="btn btn-sm btn-primary" onclick="showAddTagModal()">
                <i class="fas fa-plus"></i> New Tag
            </button>
        </div>
        <div class="tags-list">
            ${tags.length === 0 ? '<p class="empty-state">No tags created yet</p>' : 
            tags.map(t => `
                <div class="tag-item" style="--tag-color: ${t.color}">
                    <span class="tag-color" style="background: ${t.color}"></span>
                    <span class="tag-name">${escapeHtml(t.name)}</span>
                    <span class="tag-count">${getItemsByTag(t.id).length} items</span>
                    <button class="tag-delete" onclick="deleteTag('${t.id}')">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            `).join('')}
        </div>
    `;
}

// ============================================
// 7. VOICE NOTES RECORDER
// ============================================
let mediaRecorder = null;
let audioChunks = [];
let voiceNotes = JSON.parse(localStorage.getItem('questionary-voice-notes') || '[]');
let currentAudio = null; // Track currently playing audio
let recordingStartTime = null;
let recordingTimerInterval = null;

function saveVoiceNotes() {
    localStorage.setItem('questionary-voice-notes', JSON.stringify(voiceNotes));
}

async function startRecording() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(stream);
        audioChunks = [];
        
        mediaRecorder.ondataavailable = (e) => {
            audioChunks.push(e.data);
        };
        
        mediaRecorder.onstop = async () => {
            const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
            const reader = new FileReader();
            reader.onloadend = () => {
                const base64Audio = reader.result;
                saveVoiceNote(base64Audio);
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

// Recording for Notes section
async function startRecordingNotes() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(stream);
        audioChunks = [];
        
        mediaRecorder.ondataavailable = (e) => {
            audioChunks.push(e.data);
        };
        
        mediaRecorder.onstop = async () => {
            const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
            const reader = new FileReader();
            reader.onloadend = () => {
                const base64Audio = reader.result;
                saveVoiceNote(base64Audio);
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
        if (isRecording) {
            btn.classList.add('recording');
            btn.innerHTML = '<i class="fas fa-stop"></i><span>Stop</span>';
        } else {
            btn.classList.remove('recording');
            btn.innerHTML = '<i class="fas fa-microphone"></i><span>Record</span>';
        }
    }
}

function startRecordingTimer() {
    const timerEl = document.getElementById('recordingTime');
    if (!timerEl) return;
    
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
}

function saveVoiceNote(audioData) {
    const voiceNote = {
        id: Date.now().toString(),
        title: `Voice Note ${voiceNotes.length + 1}`,
        audio: audioData,
        duration: 0,
        createdAt: new Date().toISOString(),
        linkedTo: null // Can link to note, flashcard, or PDF
    };
    
    voiceNotes.push(voiceNote);
    saveVoiceNotes();
    renderVoiceNotes();
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
        // Stop any currently playing audio
        if (currentAudio) {
            currentAudio.pause();
            currentAudio.currentTime = 0;
        }
        
        currentAudio = new Audio(note.audio);
        currentAudio.onended = () => {
            currentAudio = null;
            // Update UI to show play icon
            document.querySelectorAll('.voice-play i').forEach(i => {
                i.classList.remove('fa-stop');
                i.classList.add('fa-play');
            });
        };
        
        // Update UI to show stop icon for this note
        const noteEl = document.querySelector(`.voice-note-item[data-id="${id}"] .voice-play i`);
        if (noteEl) {
            document.querySelectorAll('.voice-play i').forEach(i => {
                i.classList.remove('fa-stop');
                i.classList.add('fa-play');
            });
            noteEl.classList.remove('fa-play');
            noteEl.classList.add('fa-stop');
        }
        
        currentAudio.play();
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
        if (isRecording) {
            btn.innerHTML = '<i class="fas fa-stop"></i> Stop';
            btn.classList.add('recording');
        } else {
            btn.innerHTML = '<i class="fas fa-microphone"></i> Record';
            btn.classList.remove('recording');
        }
    }
}

function renderVoiceNotes() {
    const container = document.getElementById('voiceNotesList');
    if (!container) return;
    
    if (voiceNotes.length === 0) {
        container.innerHTML = '<p class="empty-state">No voice notes yet. Click Record to create one.</p>';
        return;
    }
    
    container.innerHTML = voiceNotes.map(v => `
        <div class="voice-note-item" data-id="${v.id}">
            <button class="voice-play" onclick="playVoiceNote('${v.id}')">
                <i class="fas fa-play"></i>
            </button>
            <div class="voice-info">
                <span class="voice-title">${escapeHtml(v.title)}</span>
                <span class="voice-date">${new Date(v.createdAt).toLocaleDateString()}</span>
            </div>
            <button class="voice-delete" onclick="deleteVoiceNote('${v.id}')">
                <i class="fas fa-trash"></i>
            </button>
        </div>
    `).join('');
}

// ============================================
// 8. EXPORT/IMPORT DATA
// ============================================
function exportAllData() {
    const data = {
        version: '1.0',
        exportDate: new Date().toISOString(),
        favorites: JSON.parse(localStorage.getItem('questionary-favorites') || '[]'),
        notes: JSON.parse(localStorage.getItem('questionary-notes') || '[]'),
        flashcards: JSON.parse(localStorage.getItem('questionary-flashcards') || '[]'),
        studySessions: JSON.parse(localStorage.getItem('questionary-study-sessions') || '[]'),
        quickLinks: JSON.parse(localStorage.getItem('questionary-quick-links') || '[]'),
        studyStats: JSON.parse(localStorage.getItem('questionary-study-stats') || '{}'),
        reminders: JSON.parse(localStorage.getItem('questionary-reminders') || '[]'),
        tags: JSON.parse(localStorage.getItem('questionary-tags') || '[]'),
        itemTags: JSON.parse(localStorage.getItem('questionary-item-tags') || '{}'),
        pdfBookmarks: JSON.parse(localStorage.getItem('questionary-pdf-bookmarks') || '{}'),
        voiceNotes: JSON.parse(localStorage.getItem('questionary-voice-notes') || '[]'),
        quizHistory: JSON.parse(localStorage.getItem('questionary-quiz-history') || '[]'),
        theme: localStorage.getItem('questionary-theme') || 'light'
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

function importData(data) {
    try {
        if (data && data.version) {
            // Valid backup file
            if (data.favorites) localStorage.setItem('questionary-favorites', JSON.stringify(data.favorites));
            if (data.notes) localStorage.setItem('questionary-notes', JSON.stringify(data.notes));
            if (data.flashcards) localStorage.setItem('questionary-flashcards', JSON.stringify(data.flashcards));
            if (data.studySessions) localStorage.setItem('questionary-study-sessions', JSON.stringify(data.studySessions));
            if (data.quickLinks) localStorage.setItem('questionary-quick-links', JSON.stringify(data.quickLinks));
            if (data.studyStats) localStorage.setItem('questionary-study-stats', JSON.stringify(data.studyStats));
            if (data.reminders) localStorage.setItem('questionary-reminders', JSON.stringify(data.reminders));
            if (data.tags) localStorage.setItem('questionary-tags', JSON.stringify(data.tags));
            if (data.itemTags) localStorage.setItem('questionary-item-tags', JSON.stringify(data.itemTags));
            if (data.pdfBookmarks) localStorage.setItem('questionary-pdf-bookmarks', JSON.stringify(data.pdfBookmarks));
            if (data.voiceNotes) localStorage.setItem('questionary-voice-notes', JSON.stringify(data.voiceNotes));
            if (data.quizHistory) localStorage.setItem('questionary-quiz-history', JSON.stringify(data.quizHistory));
            if (data.theme) localStorage.setItem('questionary-theme', data.theme);
            
            showNotification('Data imported successfully! Refreshing...', 'success');
            setTimeout(() => location.reload(), 1500);
        } else {
            showNotification('Invalid backup file', 'error');
        }
    } catch (err) {
        showNotification('Error reading backup file', 'error');
        console.error('Import error:', err);
    }
}

// ============================================
// 9. CUSTOMIZABLE DASHBOARD
// ============================================
let dashboardLayout = JSON.parse(localStorage.getItem('questionary-dashboard-layout') || '{"widgets":["documents","favorites","recent","streak"],"visible":{"documents":true,"favorites":true,"recent":true,"streak":true}}');

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
        // Move up
        [dashboardLayout.widgets[index], dashboardLayout.widgets[index - 1]] = 
        [dashboardLayout.widgets[index - 1], dashboardLayout.widgets[index]];
    } else if (direction === 1 && index < dashboardLayout.widgets.length - 1) {
        // Move down
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
    
    // Apply visibility
    Object.entries(widgetMap).forEach(([id, el]) => {
        if (el) {
            el.style.display = dashboardLayout.visible[id] !== false ? 'flex' : 'none';
        }
    });
    
    // Apply order
    dashboardLayout.widgets.forEach((widgetId, idx) => {
        const el = widgetMap[widgetId];
        if (el) {
            el.style.order = idx;
        }
    });
}

// ============================================
// 10. ENHANCED ANALYTICS
// ============================================
function renderEnhancedAnalytics() {
    const container = document.getElementById('enhancedAnalytics');
    if (!container) return;
    
    const stats = JSON.parse(localStorage.getItem('questionary-study-stats') || '{}');
    const quizHistory = JSON.parse(localStorage.getItem('questionary-quiz-history') || '[]');
    const sessions = JSON.parse(localStorage.getItem('questionary-study-sessions') || '[]');
    
    // Calculate analytics
    const totalStudyTime = stats.totalTime || 0;
    const currentStreak = stats.streak || 0;
    const avgQuizScore = quizHistory.length > 0 
        ? Math.round(quizHistory.reduce((sum, q) => sum + q.score, 0) / quizHistory.length)
        : 0;
    
    // Weekly activity
    const weeklyActivity = calculateWeeklyActivity(sessions);
    
    // Most studied subjects
    const subjectStats = calculateSubjectStats();
    
    container.innerHTML = `
        <div class="analytics-grid">
            <div class="analytics-card">
                <i class="fas fa-clock"></i>
                <div class="analytics-value">${Math.round(totalStudyTime / 60)}h</div>
                <div class="analytics-label">Total Study Time</div>
            </div>
            <div class="analytics-card">
                <i class="fas fa-fire"></i>
                <div class="analytics-value">${currentStreak}</div>
                <div class="analytics-label">Day Streak</div>
            </div>
            <div class="analytics-card">
                <i class="fas fa-trophy"></i>
                <div class="analytics-value">${avgQuizScore}%</div>
                <div class="analytics-label">Avg Quiz Score</div>
            </div>
            <div class="analytics-card">
                <i class="fas fa-layer-group"></i>
                <div class="analytics-value">${quizHistory.length}</div>
                <div class="analytics-label">Quizzes Taken</div>
            </div>
        </div>
        
        <div class="analytics-section">
            <h4><i class="fas fa-chart-bar"></i> Weekly Activity</h4>
            <div class="weekly-chart">
                ${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day, i) => `
                    <div class="chart-bar">
                        <div class="bar-fill" style="height: ${weeklyActivity[i] || 0}%"></div>
                        <span class="bar-label">${day}</span>
                    </div>
                `).join('')}
            </div>
        </div>
        
        <div class="analytics-section">
            <h4><i class="fas fa-book"></i> Most Studied</h4>
            <div class="subject-stats">
                ${subjectStats.slice(0, 5).map(s => `
                    <div class="subject-stat-item">
                        <span class="subject-name">${s.name}</span>
                        <div class="subject-bar">
                            <div class="subject-bar-fill" style="width: ${s.percentage}%"></div>
                        </div>
                        <span class="subject-count">${s.count}</span>
                    </div>
                `).join('') || '<p class="empty-state">No study data yet</p>'}
            </div>
        </div>
    `;
}

function calculateWeeklyActivity(sessions) {
    const activity = [0, 0, 0, 0, 0, 0, 0];
    const now = new Date();
    const weekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
    
    sessions.filter(s => new Date(s.date) >= weekAgo).forEach(s => {
        const day = new Date(s.date).getDay();
        activity[day] += s.duration || 30;
    });
    
    const max = Math.max(...activity, 1);
    return activity.map(a => (a / max) * 100);
}

function calculateSubjectStats() {
    const recent = JSON.parse(localStorage.getItem('questionary-recent') || '[]');
    const subjectCounts = {};
    
    recent.forEach(r => {
        const subject = r.pathArray?.[r.pathArray.length - 2] || 'Unknown';
        subjectCounts[subject] = (subjectCounts[subject] || 0) + 1;
    });
    
    const sorted = Object.entries(subjectCounts)
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count);
    
    const max = sorted[0]?.count || 1;
    return sorted.map(s => ({ ...s, percentage: (s.count / max) * 100 }));
}

// ============================================
// 11. DRAG AND DROP PDF IMPORT
// ============================================
function initDragDropImport() {
    const dropZone = document.getElementById('dropZone');
    if (!dropZone) return;
    
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(event => {
        dropZone.addEventListener(event, preventDefaults, false);
        document.body.addEventListener(event, preventDefaults, false);
    });
    
    ['dragenter', 'dragover'].forEach(event => {
        dropZone.addEventListener(event, () => dropZone.classList.add('drag-active'), false);
    });
    
    ['dragleave', 'drop'].forEach(event => {
        dropZone.addEventListener(event, () => dropZone.classList.remove('drag-active'), false);
    });
    
    dropZone.addEventListener('drop', handleDrop, false);
    
    // Add click to browse functionality
    dropZone.addEventListener('click', () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.pdf';
        input.multiple = true;
        input.onchange = (e) => {
            const files = e.target.files;
            if (files.length > 0) {
                handleFilesSelect(files);
            }
        };
        input.click();
    });
}

async function handleFilesSelect(files) {
    const pdfFiles = Array.from(files).filter(f => f.type === 'application/pdf' || f.name.endsWith('.pdf'));
    
    if (pdfFiles.length === 0) {
        showNotification('Please select PDF files only', 'warning');
        return;
    }
    
    for (const file of pdfFiles) {
        await importPdfFile(file);
    }
    
    showNotification(`${pdfFiles.length} PDF(s) imported!`, 'success');
}

function preventDefaults(e) {
    e.preventDefault();
    e.stopPropagation();
}

async function handleDrop(e) {
    const files = e.dataTransfer.files;
    const pdfFiles = Array.from(files).filter(f => f.type === 'application/pdf');
    
    if (pdfFiles.length === 0) {
        showNotification('Please drop PDF files only', 'warning');
        return;
    }
    
    for (const file of pdfFiles) {
        await importPdfToLibrary(file);
    }
    
    showNotification(`${pdfFiles.length} PDF(s) imported!`, 'success');
}

// Legacy importPdfFile - now redirects to library system
async function importPdfFile(file) {
    // Use the new library import instead
    await importPdfToLibrary(file);
}

// ============================================
// INITIALIZATION
// ============================================
function initEnhancedFeatures() {
    console.log('[Features] Initializing enhanced features...');
    
    // Initialize all systems
    initReminders();
    initDragDropImport();
    initLibraryDragDrop(); // <--- ADD THIS LINE
    initThemeOnLoad();
    
    renderVoiceNotesGrid();
    renderTagsMain();
    renderTaggedItems();
    renderLibrary();
    // Apply saved theme
    const savedTheme = getCurrentTheme();
    if (savedTheme) {
        document.documentElement.setAttribute('data-theme', savedTheme);
    }
    initThemeOnLoad();
    
    // Apply dashboard layout
    if (dashboardLayout.widgets) {
        applyDashboardLayout();
    }
    
    // Load data
    tags = JSON.parse(localStorage.getItem('questionary-tags') || '[]');
    itemTags = JSON.parse(localStorage.getItem('questionary-item-tags') || '{}');
    pdfBookmarks = JSON.parse(localStorage.getItem('questionary-pdf-bookmarks') || '{}');
    voiceNotes = JSON.parse(localStorage.getItem('questionary-voice-notes') || '[]');
    alarmSettings = JSON.parse(localStorage.getItem('questionary-alarm-settings') || '{}');
    
    // Initialize alarm settings defaults
    if (!alarmSettings.sound) alarmSettings.sound = 'classic';
    if (!alarmSettings.volume) alarmSettings.volume = 70;
    
    // Migrate old imported PDFs to new library system
    migrateOldImportedPdfs();
    
    // Render new sections
    renderVoiceNotesGrid();
    renderTagsMain();
    renderTaggedItems();
    renderLibrary();
    initAlarmUI();
    
    console.log('[Features] Enhanced features initialized');
}

function initAlarmUI() {
    // Set active alarm option
    document.querySelectorAll('.alarm-option').forEach(opt => {
        opt.classList.toggle('active', opt.dataset.sound === alarmSettings.sound);
    });
    
    // Set volume
    const volumeSlider = document.getElementById('alarmVolume');
    const volumeDisplay = document.getElementById('alarmVolumeValue');
    if (volumeSlider) volumeSlider.value = alarmSettings.volume;
    if (volumeDisplay) volumeDisplay.textContent = alarmSettings.volume + '%';
    
    // Show/hide custom upload
    const customUpload = document.getElementById('customSoundUpload');
    if (customUpload) {
        customUpload.style.display = alarmSettings.sound === 'custom' ? 'block' : 'none';
    }
    
    // Show custom sound name if exists
    if (alarmSettings.customSoundName) {
        const nameEl = document.getElementById('customSoundName');
        if (nameEl) nameEl.textContent = alarmSettings.customSoundName;
    }
}

// ============================================
// SETTINGS UI INITIALIZATION
// ============================================
function initSettingsUI() {
    console.log('[Features] Initializing settings UI...');
    
    // Export button (this element exists and is always visible, so direct binding works)
    const exportBtn = document.getElementById('exportAllDataBtn');
    if (exportBtn) {
        exportBtn.addEventListener('click', exportAllData);
    }
    
    // Import input
    const importInput = document.getElementById('importDataInput');
    if (importInput) {
        importInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
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
    
    // Use event delegation for all dynamically hidden/shown elements
    document.addEventListener('click', (e) => {
        // Theme selector
        const themeOption = e.target.closest('.theme-option');
        if (themeOption && themeOption.dataset.theme) {
            e.preventDefault();
            const theme = themeOption.dataset.theme;
            console.log('[Features] Theme clicked:', theme);
            setTheme(theme);
            return;
        }
        
        // Voice recording button
        if (e.target.closest('#recordBtn')) {
            e.preventDefault();
            console.log('[Features] Record button clicked');
            const btn = document.getElementById('recordBtn');
            if (btn && btn.classList.contains('recording')) {
                stopRecording();
            } else {
                startRecording();
            }
            return;
        }
        
        // Tag creation button
        if (e.target.closest('#createTagBtn')) {
            e.preventDefault();
            console.log('[Features] Create tag button clicked');
            openTagModal();
            return;
        }
        
        // Save tag button
        if (e.target.closest('#saveTagBtn')) {
            e.preventDefault();
            const name = document.getElementById('tagNameInput')?.value.trim();
            const color = document.getElementById('tagColorInput')?.value || '#cf6215';
            if (name) {
                createTag(name, color);
                closeTagModal();
            } else {
                showNotification('Please enter a tag name', 'warning');
            }
            return;
        }
        
        // Cancel/close tag modal
        if (e.target.closest('#cancelTagBtn') || e.target.closest('#closeTagModal')) {
            closeTagModal();
            return;
        }
        
        // Add reminder button
        if (e.target.closest('#addReminderBtn')) {
            e.preventDefault();
            console.log('[Features] Add reminder button clicked');
            openReminderModal();
            return;
        }
        
        // Save reminder button
        if (e.target.closest('#saveReminderBtn')) {
            e.preventDefault();
            saveReminderFromModal();
            return;
        }
        
        // Cancel/close reminder modal
        if (e.target.closest('#cancelReminderBtn') || e.target.closest('#closeReminderModal')) {
            closeReminderModal();
            return;
        }
        
        // Close quiz modal
        if (e.target.closest('#closeQuizModal')) {
            closeQuizModal();
            return;
        }
        
        // Play voice note
        if (e.target.closest('.play-voice-note')) {
            const btn = e.target.closest('.play-voice-note');
            const id = btn.dataset.id;
            if (id) {
                playVoiceNote(id);
            }
            return;
        }
        
        // Delete voice note
        if (e.target.closest('.delete-voice-note')) {
            const btn = e.target.closest('.delete-voice-note');
            const id = btn.dataset.id;
            if (id) {
                deleteVoiceNote(id);
            }
            return;
        }
        
        // PDF Bookmark buttons
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
        
        // Tag item modal
        if (e.target.closest('#closeTagItemModal') || e.target.closest('#closeTagItemModalBtn')) {
            closeTagItemModal();
            return;
        }
        
        // Create tag button in main tags section
        if (e.target.closest('#createTagBtnMain')) {
            e.preventDefault();
            openTagModal();
            return;
        }
        
        // Import PDF button
        if (e.target.closest('#importPdfBtn')) {
            e.preventDefault();
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.pdf';
            input.multiple = true;
            input.onchange = (evt) => {
                const files = evt.target.files;
                if (files.length > 0) {
                    handleFilesSelect(files);
                }
            };
            input.click();
            return;
        }
        
        // Alarm sound options
        if (e.target.closest('.alarm-option')) {
            const option = e.target.closest('.alarm-option');
            const sound = option.dataset.sound;
            if (sound) {
                setAlarmSound(sound);
            }
            return;
        }
        
        // Preview sound button
        if (e.target.closest('.preview-sound')) {
            e.stopPropagation();
            const btn = e.target.closest('.preview-sound');
            const sound = btn.dataset.sound;
            if (sound) {
                previewAlarmSound(sound);
            }
            return;
        }
        
        // Voice recording button in notes section
        if (e.target.closest('#recordBtnNotes')) {
            e.preventDefault();
            const btn = document.getElementById('recordBtnNotes');
            if (btn && btn.classList.contains('recording')) {
                stopRecording();
            } else {
                startRecordingNotes();
            }
            return;
        }
    });
    
    // Custom alarm sound upload
    const customAlarmInput = document.getElementById('customAlarmInput');
    if (customAlarmInput) {
        customAlarmInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) handleCustomSoundUpload(file);
        });
    }
    
    // Alarm volume slider
    const volumeSlider = document.getElementById('alarmVolume');
    if (volumeSlider) {
        volumeSlider.addEventListener('input', (e) => {
            setAlarmVolume(parseInt(e.target.value));
        });
    }
    
    console.log('[Features] Settings UI initialized');
}

function updateThemeSelector() {
    updateModeSwitcher();
    // Restore custom theme pickers if panel is open
    const panel = document.getElementById('customThemePanel');
    if (panel && panel.style.display !== 'none') {
        populateCustomThemePickers(getCustomThemeValues());
    }
}

function openTagModal() {
    const modal = document.getElementById('tagModal');
    if (modal) {
        modal.classList.add('active');
        document.getElementById('tagNameInput').value = '';
        document.getElementById('tagColorInput').value = '#cf6215';
    }
}

function closeTagModal() {
    const modal = document.getElementById('tagModal');
    if (modal) modal.classList.remove('active');
}

function openReminderModal() {
    const modal = document.getElementById('reminderModal');
    if (modal) {
        modal.classList.add('active');
        document.getElementById('reminderTitle').value = '';
        document.getElementById('reminderTime').value = '';
        document.querySelectorAll('#reminderDays input').forEach(cb => cb.checked = false);
    }
}

function closeReminderModal() {
    const modal = document.getElementById('reminderModal');
    if (modal) modal.classList.remove('active');
}

// PDF Bookmark Modal Functions
let currentPdfUrl = null;

function openBookmarkModal() {
    const modal = document.getElementById('bookmarkModal');
    if (modal) {
        modal.classList.add('active');
        document.getElementById('bookmarkTitleInput').value = '';
        document.getElementById('bookmarkPageInput').value = '1';
    }
}

function closeBookmarkModal() {
    const modal = document.getElementById('bookmarkModal');
    if (modal) modal.classList.remove('active');
}

function saveBookmarkFromModal() {
    const title = document.getElementById('bookmarkTitleInput')?.value.trim();
    const page = parseInt(document.getElementById('bookmarkPageInput')?.value) || 1;
    
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
        const isHidden = panel.style.display === 'none';
        panel.style.display = isHidden ? 'block' : 'none';
    }
}

function openPdfViewer(pdfUrl, pdfName) {
    currentPdfUrl = pdfUrl;
    
    const container = document.getElementById('pdfViewerContainer');
    const tilesContainer = document.getElementById('tilesContainer');
    const pdfViewer = document.getElementById('pdfViewer');
    const pdfNameEl = document.getElementById('currentPdfName');
    
    if (container && pdfViewer) {
        tilesContainer.style.display = 'none';
        container.style.display = 'block';
        const absoluteUrl = new URL(pdfUrl, window.location.href).href;
        pdfViewer.src = 'pdfviewer.html?file=' + encodeURIComponent(absoluteUrl);
        pdfViewer.onload = function() {
            pdfViewer.contentWindow.postMessage({ type: 'loadPdf', url: absoluteUrl }, '*');
            pdfViewer.onload = null;
        };
        if (pdfNameEl) pdfNameEl.textContent = pdfName || 'Document';
        
        // Render existing bookmarks
        renderPdfBookmarks(pdfUrl);
    }
}

function closePdfViewer() {
    const container = document.getElementById('pdfViewerContainer');
    const tilesContainer = document.getElementById('tilesContainer');
    const pdfViewer = document.getElementById('pdfViewer');
    
    if (container && pdfViewer) {
        container.style.display = 'none';
        tilesContainer.style.display = 'grid';
        pdfViewer.src = '';
        currentPdfUrl = null;
    }
}

function saveReminderFromModal() {
    const title = document.getElementById('reminderTitle')?.value.trim();
    const time = document.getElementById('reminderTime')?.value;
    const days = Array.from(document.querySelectorAll('#reminderDays input:checked'))
                      .map(cb => parseInt(cb.value));
    
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

// ============================================
// RENDER FUNCTIONS FOR VIEWS
// ============================================
function renderReminders() {
    const container = document.getElementById('remindersList');
    if (!container) return;
    
    if (studyReminders.length === 0) {
        container.innerHTML = '<p class="empty-state"><i class="fas fa-bell-slash"></i> No reminders set. Add one to get started!</p>';
        return;
    }
    
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    
    container.innerHTML = studyReminders.map(r => `
        <div class="reminder-item ${r.enabled ? '' : 'disabled'}">
            <label class="switch">
                <input type="checkbox" ${r.enabled ? 'checked' : ''} onchange="toggleReminder('${r.id}', this.checked)">
                <span class="slider"></span>
            </label>
            <div class="reminder-info">
                <span class="reminder-title">${r.title}</span>
                <span class="reminder-time">${formatTime12Hour(r.time)}</span>
                <span class="reminder-days">${r.days.map(d => dayNames[d]).join(', ')}</span>
            </div>
            <button class="reminder-delete" onclick="deleteReminder('${r.id}')">
                <i class="fas fa-trash"></i>
            </button>
        </div>
    `).join('');
}

function formatTime12Hour(time24) {
    const [hours, minutes] = time24.split(':');
    const h = parseInt(hours);
    const ampm = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 || 12;
    return `${h12}:${minutes} ${ampm}`;
}

function renderSettings() {
    initThemeOnLoad();
    renderTagsList();
    renderVoiceNotes();
    renderDashboardWidgets();
    if (typeof window.renderKeybindsSettings === 'function') window.renderKeybindsSettings();
    if (typeof window.initStudyRoomMediaSettings === 'function') window.initStudyRoomMediaSettings();
}

function renderTagsList() {
    const container = document.getElementById('tagsList');
    if (!container) return;
    
    if (tags.length === 0) {
        container.innerHTML = '<p class="empty-state">No tags created yet.</p>';
        return;
    }
    
    container.innerHTML = tags.map(tag => `
        <div class="tag-item">
            <div class="tag-color" style="background: ${tag.color}"></div>
            <span class="tag-name">${tag.name}</span>
            <span class="tag-count">${countItemsWithTag(tag.id)} items</span>
            <button class="tag-delete" onclick="deleteTag('${tag.id}')">
                <i class="fas fa-times"></i>
            </button>
        </div>
    `).join('');
}

function countItemsWithTag(tagId) {
    return Object.values(itemTags).filter(t => t.includes(tagId)).length;
}

function renderVoiceNotes() {
    const container = document.getElementById('voiceNotesList');
    if (!container) return;
    
    if (voiceNotes.length === 0) {
        container.innerHTML = '<p class="empty-state">No voice notes yet.</p>';
        return;
    }
    
    container.innerHTML = voiceNotes.map(note => `
        <div class="voice-note-item" data-id="${note.id}">
            <button class="voice-play" onclick="playVoiceNote('${note.id}')">
                <i class="fas fa-play"></i>
            </button>
            <div class="voice-info">
                <span class="voice-title">${note.title || 'Voice Note'}</span>
                <span class="voice-date">${new Date(note.createdAt).toLocaleDateString()}</span>
            </div>
            <button class="voice-delete" onclick="deleteVoiceNote('${note.id}')">
                <i class="fas fa-trash"></i>
            </button>
        </div>
    `).join('');
}

function renderDashboardWidgets() {
    const container = document.getElementById('dashboardWidgets');
    if (!container) return;
    
    // Initialize layout if not exists
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
    
    container.innerHTML = dashboardLayout.widgets.map((widgetId, idx) => {
        const info = widgetInfo.find(w => w.id === widgetId) || { name: widgetId, icon: 'fa-cube' };
        const isVisible = dashboardLayout.visible[widgetId] !== false;
        
        return `
            <div class="widget-setting-item">
                <i class="fas ${info.icon}"></i>
                <span class="widget-name">${info.name}</span>
                <div class="widget-reorder">
                    <button onclick="reorderWidget('${widgetId}', -1)" ${idx === 0 ? 'disabled' : ''}>
                        <i class="fas fa-chevron-up"></i>
                    </button>
                    <button onclick="reorderWidget('${widgetId}', 1)" ${idx === dashboardLayout.widgets.length - 1 ? 'disabled' : ''}>
                        <i class="fas fa-chevron-down"></i>
                    </button>
                </div>
                <label class="switch">
                    <input type="checkbox" ${isVisible ? 'checked' : ''} onchange="toggleWidgetVisibility('${widgetId}', this.checked)">
                    <span class="slider"></span>
                </label>
            </div>
        `;
    }).join('');
}

// ============================================
// 12. ALARM SOUND SYSTEM (Web Audio API)
// ============================================
let alarmSettings = JSON.parse(localStorage.getItem('questionary-alarm-settings') || '{}');
if (!alarmSettings.sound) alarmSettings.sound = 'classic';
if (!alarmSettings.volume) alarmSettings.volume = 70;
let customAlarmAudio = null;
let currentAlarmAudio = null;
let alarmAudioContext = null;
let alarmOscillator = null;
let alarmGainNode = null;
let alarmIntervalId = null;

// Alarm sound patterns using Web Audio API for proper looping alarm tones
const alarmPatterns = {
    classic: { // Classic alarm clock — rhythmic beep-beep-beep
        frequencies: [880, 0, 880, 0, 880, 0, 0],
        durations:   [120, 80, 120, 80, 120, 80, 400],
        type: 'square'
    },
    gentle: { // Soft ascending chime — calm wake-up tone
        frequencies: [392, 440, 523, 587, 659, 784, 880],
        durations:   [250, 250, 250, 250, 300, 300, 500],
        type: 'sine'
    },
    urgent: { // Rapid urgent pulse — attention-grabbing
        frequencies: [1047, 0, 1047, 0, 1319, 0, 1319, 0, 1568, 0],
        durations:   [60, 60, 60, 60, 60, 60, 60, 60, 60, 300],
        type: 'square'
    },
    chime: { // Musical doorbell chime — pleasant two-tone
        frequencies: [659, 523, 0, 659, 523, 0, 784, 659, 523],
        durations:   [300, 450, 200, 300, 450, 200, 250, 250, 600],
        type: 'sine'
    },
    digital: { // Retro digital — clean electronic beep
        frequencies: [1200, 0, 1200, 0, 800, 0],
        durations:   [150, 75, 150, 75, 200, 350],
        type: 'square'
    },
    bell: { // Bell tower — resonant bell-like ring
        frequencies: [659, 0, 523, 0, 659, 784, 659],
        durations:   [350, 50, 350, 50, 200, 200, 500],
        type: 'triangle'
    }
};

function saveAlarmSettings() {
    localStorage.setItem('questionary-alarm-settings', JSON.stringify(alarmSettings));
}

function setAlarmSound(soundName) {
    alarmSettings.sound = soundName;
    saveAlarmSettings();
    
    // Update UI
    document.querySelectorAll('.alarm-option').forEach(opt => {
        opt.classList.toggle('active', opt.dataset.sound === soundName);
    });
    
    // Show/hide custom upload
    const customUpload = document.getElementById('customSoundUpload');
    if (customUpload) {
        customUpload.style.display = soundName === 'custom' ? 'block' : 'none';
    }
}

function setAlarmVolume(volume) {
    alarmSettings.volume = volume;
    saveAlarmSettings();
    const volumeDisplay = document.getElementById('alarmVolumeValue');
    if (volumeDisplay) volumeDisplay.textContent = volume + '%';
}

// Play a single pattern sequence using Web Audio API
async function playPatternOnce(pattern, volume) {
    return new Promise((resolve) => {
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
                gain.gain.value = volume;
                
                // Add envelope for smoother sound
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
        // Play looping pattern
        let isPlaying = true;
        const playLoop = async () => {
            while (isPlaying && alarmIntervalId !== null) {
                await playPatternOnce(alarmPatterns[soundName], volume);
                await new Promise(r => setTimeout(r, 200)); // Gap between loops
            }
        };
        alarmIntervalId = true; // Flag to indicate alarm is playing
        playLoop();
    }
    
    // Auto stop after 30 seconds
    setTimeout(() => stopAlarmSound(), 30000);
    
    // Show alarm notification with dismiss button
    showAlarmNotification();
}

function stopAlarmSound() {
    alarmIntervalId = null; // Stop the loop flag
    
    if (currentAlarmAudio) {
        currentAlarmAudio.pause();
        currentAlarmAudio.currentTime = 0;
        currentAlarmAudio = null;
    }
    
    if (alarmAudioContext) {
        alarmAudioContext.close().catch(() => {});
        alarmAudioContext = null;
    }
    
    // Hide alarm notification if showing
    const alarmNotif = document.getElementById('alarmNotification');
    if (alarmNotif) {
        alarmNotif.remove();
    }
}

function showAlarmNotification() {
    // Remove existing notification
    const existing = document.getElementById('alarmNotification');
    if (existing) existing.remove();
    
    const notif = document.createElement('div');
    notif.id = 'alarmNotification';
    notif.className = 'alarm-notification';
    notif.innerHTML = `
        <div class="alarm-notification-content">
            <i class="fas fa-bell alarm-bell-icon"></i>
            <span class="alarm-notification-text">Timer Complete!</span>
            <button class="alarm-dismiss-btn" onclick="stopAlarmSound()">
                <i class="fas fa-times"></i> Dismiss
            </button>
        </div>
    `;
    document.body.appendChild(notif);
    
    // Animate bell
    notif.querySelector('.alarm-bell-icon').classList.add('ringing');
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

// ================================================================
// 13. PDF LIBRARY MANAGEMENT SYSTEM ('userlibrary.db')
// Stores custom library metadata in 'userlibrary.db'
// Stores PDF binary files in IndexedDB / AppData 'user_library_files/'
// Safe from app code updates & questionary.db changes!
// ================================================================

const UserLibraryFileStore = {
    async saveFile(blobId, fileOrBlob) {
        const arrayBuffer = await fileOrBlob.arrayBuffer();
        const uInt8Array = new Uint8Array(arrayBuffer);

        // 1. Store in IndexedDB
        await new Promise((resolve, reject) => {
            const request = indexedDB.open('QuestionaryUserLibraryFiles', 1);
            request.onupgradeneeded = e => e.target.result.createObjectStore('files_store');
            request.onsuccess = e => {
                const idb = e.target.result;
                const tx = idb.transaction('files_store', 'readwrite');
                const putReq = tx.objectStore('files_store').put(uInt8Array, blobId);
                putReq.onsuccess = () => resolve();
                putReq.onerror = () => reject(putReq.error);
            };
            request.onerror = () => reject(request.error);
        });

        // 2. Save natively if running in Tauri Desktop App
        if (window.__TAURI__ && window.__TAURI__.fs) {
            try {
                const { writeBinaryFile, mkdir, exists, BaseDirectory } = window.__TAURI__.fs;
                const dirExists = await exists('user_library_files', { baseDir: BaseDirectory.AppData });
                if (!dirExists) {
                    await mkdir('user_library_files', { baseDir: BaseDirectory.AppData, recursive: true });
                }
                await writeBinaryFile(`user_library_files/${blobId}.bin`, uInt8Array, { baseDir: BaseDirectory.AppData });
            } catch (e) {
                console.warn('[UserLibraryFileStore] Tauri file save warning:', e);
            }
        }
    },

    async getFileBlob(blobId) {
        if (window.__TAURI__ && window.__TAURI__.fs) {
            try {
                const { readBinaryFile, BaseDirectory } = window.__TAURI__.fs;
                const data = await readBinaryFile(`user_library_files/${blobId}.bin`, { baseDir: BaseDirectory.AppData });
                if (data) return new Blob([data], { type: 'application/pdf' });
            } catch (e) {}
        }

        return new Promise(resolve => {
            const request = indexedDB.open('QuestionaryUserLibraryFiles', 1);
            request.onupgradeneeded = e => e.target.result.createObjectStore('files_store');
            request.onsuccess = e => {
                const idb = e.target.result;
                const tx = idb.transaction('files_store', 'readonly');
                const getReq = tx.objectStore('files_store').get(blobId);
                getReq.onsuccess = () => {
                    if (getReq.result) resolve(new Blob([getReq.result], { type: 'application/pdf' }));
                    else resolve(null);
                };
                getReq.onerror = () => resolve(null);
            };
            request.onerror = () => resolve(null);
        });
    },

    async removeFile(blobId) {
        new Promise(resolve => {
            const request = indexedDB.open('QuestionaryUserLibraryFiles', 1);
            request.onsuccess = e => {
                const idb = e.target.result;
                const tx = idb.transaction('files_store', 'readwrite');
                tx.objectStore('files_store').delete(blobId);
                resolve();
            };
            request.onerror = () => resolve();
        });

        if (window.__TAURI__ && window.__TAURI__.fs) {
            try {
                const { removeFile, BaseDirectory } = window.__TAURI__.fs;
                await removeFile(`user_library_files/${blobId}.bin`, { baseDir: BaseDirectory.AppData });
            } catch (e) {}
        }
    }
};

const UserLibraryDbService = {
    db: null,
    SQL: null,
    currentFolderId: null, // null = root
    pathStack: [],

    async init() {
        try {
            if (typeof window.initSqlJs === 'undefined') {
                await new Promise((resolve, reject) => {
                    const script = document.createElement('script');
                    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.8.0/sql-wasm.js';
                    script.onload = resolve;
                    script.onerror = reject;
                    document.head.appendChild(script);
                });
            }

            if (!this.SQL) {
                this.SQL = await window.initSqlJs({
                    locateFile: file => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.8.0/${file}`
                });
            }

            const savedDb = await this.loadDbFromIndexedDB();
            if (savedDb) {
                this.db = new this.SQL.Database(savedDb);
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

            await this.saveDbToIndexedDB();
            console.log('[UserLibraryDB] Initialized userlibrary.db successfully');
            return true;
        } catch (err) {
            console.error('[UserLibraryDB] Critical init error:', err);
            return false;
        }
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
        const data = this.db.export();
        return new Promise((resolve, reject) => {
            const request = indexedDB.open('QuestionaryUserLibraryDB', 1);
            request.onupgradeneeded = e => e.target.result.createObjectStore('db_store');
            request.onsuccess = e => {
                const idb = e.target.result;
                const tx = idb.transaction('db_store', 'readwrite');
                const putReq = tx.objectStore('db_store').put(data, 'userlibrary.db');
                putReq.onsuccess = () => resolve();
                putReq.onerror = () => reject(putReq.error);
            };
            request.onerror = () => reject(request.error);
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
        const sql = parentId === null
            ? "SELECT * FROM folders WHERE parent_id IS NULL ORDER BY name ASC"
            : "SELECT * FROM folders WHERE parent_id = ? ORDER BY name ASC";
        return await this.query(sql, parentId === null ? [] : [parentId]);
    },

    async createFolder(name, color = '#3b82f6', parentId = null) {
        await this.execute("INSERT INTO folders (name, color, parent_id) VALUES (?, ?, ?)", [name, color, parentId]);
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
        const sql = folderId === null
            ? "SELECT * FROM files WHERE folder_id IS NULL ORDER BY name ASC"
            : "SELECT * FROM files WHERE folder_id = ? ORDER BY name ASC";
        return await this.query(sql, folderId === null ? [] : [folderId]);
    },

    async importFile(file, folderId = null) {
        const blobId = `user_pdf_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
        const fileType = file.name.endsWith('.png') || file.name.endsWith('.jpg') || file.name.endsWith('.jpeg') || file.name.endsWith('.webp') ? 'image' : 'pdf';

        await UserLibraryFileStore.saveFile(blobId, file);
        await this.execute("INSERT INTO files (folder_id, name, file_type, blob_id, file_size) VALUES (?, ?, ?, ?, ?)", [folderId, file.name, fileType, blobId, file.size || 0]);
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
        if (itemType === 'folder') {
            if (itemId === targetFolderId) return;
            await this.execute("UPDATE folders SET parent_id = ? WHERE id = ?", [targetFolderId, itemId]);
        } else {
            await this.execute("UPDATE files SET folder_id = ? WHERE id = ?", [targetFolderId, itemId]);
        }
    }
};

// Global backward compatibility wrappers
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

let libraryEditMode = false;
let moveItemState = { itemId: null, itemType: null };

function toggleLibraryEditMode() {
    libraryEditMode = !libraryEditMode;
    const btn = document.getElementById('libraryEditBtn');
    const controls = document.getElementById('libraryEditControls');
    if (btn) btn.innerHTML = libraryEditMode ? '<i class="fas fa-check"></i> Done' : '<i class="fas fa-edit"></i> Edit';
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

    container.innerHTML = '';
    const isEmpty = folders.length === 0 && files.length === 0;
    const emptyState = document.getElementById('libraryEmptyState');
    if (emptyState) emptyState.style.display = isEmpty ? 'flex' : 'none';

    folders.forEach(folder => {
        const item = document.createElement('div');
        item.className = 'library-item library-folder';
        item.style.borderColor = folder.color || '#3b82f6';
        item.innerHTML = `
            <div class="library-item-icon" style="color: ${folder.color || '#3b82f6'}">
                <i class="fas fa-folder"></i>
            </div>
            <div class="library-item-name">${escapeHtml(folder.name)}</div>
            ${libraryEditMode ? `
                <div class="library-item-actions">
                    <button class="lib-action-btn" onclick="event.stopPropagation(); renameLibraryFolder(${folder.id}, '${escapeHtml(folder.name)}')"><i class="fas fa-edit"></i></button>
                    <button class="lib-action-btn" onclick="event.stopPropagation(); openMoveLibraryItemModal(${folder.id}, 'folder')"><i class="fas fa-arrows-alt"></i></button>
                    <button class="lib-action-btn danger" onclick="event.stopPropagation(); deleteLibraryFolder(${folder.id}, '${escapeHtml(folder.name)}')"><i class="fas fa-trash"></i></button>
                </div>
            ` : ''}
        `;

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
        const isImage = file.file_type === 'image';
        const icon = isImage ? 'fa-image' : 'fa-file-pdf';
        const iconColor = isImage ? '#22c55e' : '#ef4444';

        item.innerHTML = `
            <div class="library-item-icon" style="color: ${iconColor}">
                <i class="fas ${icon}"></i>
            </div>
            <div class="library-item-name">${escapeHtml(file.name)}</div>
            <div class="library-item-meta">${formatBytesContent(file.file_size || 0)}</div>
            ${libraryEditMode ? `
                <div class="library-item-actions">
                    <button class="lib-action-btn" onclick="event.stopPropagation(); renameLibraryFile(${file.id}, '${escapeHtml(file.name)}')"><i class="fas fa-edit"></i></button>
                    <button class="lib-action-btn" onclick="event.stopPropagation(); openMoveLibraryItemModal(${file.id}, 'file')"><i class="fas fa-arrows-alt"></i></button>
                    <button class="lib-action-btn danger" onclick="event.stopPropagation(); deleteLibraryFile(${file.id}, '${escapeHtml(file.name)}')"><i class="fas fa-trash"></i></button>
                </div>
            ` : ''}
        `;

        item.onclick = async () => {
            const blob = await UserLibraryFileStore.getFileBlob(file.blob_id);
            if (!blob) {
                showNotification('File data not found in storage', 'error');
                return;
            }
            const objectUrl = URL.createObjectURL(blob);
            if (isImage) {
                if (typeof showImage === 'function') showImage(objectUrl, file.name);
            } else {
                if (typeof showPDF === 'function') showPDF(objectUrl);
            }
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
    breadcrumb.innerHTML = `
        <button class="breadcrumb-item" onclick="navigateToLibraryRoot()">
            <i class="fas fa-home"></i> Library
        </button>
    `;

    UserLibraryDbService.pathStack.forEach((crumb, index) => {
        breadcrumb.innerHTML += `
            <span class="breadcrumb-separator"><i class="fas fa-chevron-right"></i></span>
            <button class="breadcrumb-item ${index === UserLibraryDbService.pathStack.length - 1 ? 'active' : ''}" onclick="navigateToLibraryStackIndex(${index})">
                ${escapeHtml(crumb.name)}
            </button>
        `;
    });
}

function navigateToLibraryRoot() {
    UserLibraryDbService.currentFolderId = null;
    UserLibraryDbService.pathStack = [];
    renderLibrary();
}

function navigateToLibraryStackIndex(index) {
    UserLibraryDbService.pathStack = UserLibraryDbService.pathStack.slice(0, index + 1);
    const current = UserLibraryDbService.pathStack[UserLibraryDbService.pathStack.length - 1];
    UserLibraryDbService.currentFolderId = current ? current.id : null;
    renderLibrary();
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

let selectedFolderColor = '#3b82f6';
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
    const ok = await showConfirm(`Delete folder "${name}" and all its contents?`, { title: 'Delete Folder', type: 'danger' });
    if (ok) {
        await UserLibraryDbService.deleteFolder(folderId);
        await renderLibrary();
        showNotification('Folder deleted', 'info');
    }
}

async function deleteLibraryFile(fileId, name) {
    const ok = await showConfirm(`Delete file "${name}" from Library?`, { title: 'Delete File', type: 'danger' });
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
    
    container.innerHTML = `
        <div class="move-destination ${UserLibraryDbService.currentFolderId === null ? 'selected' : ''}" onclick="selectMoveDestination(null, this)">
            <i class="fas fa-home"></i> Root Library
        </div>
        ${allFolders.map(f => `
            <div class="move-destination ${UserLibraryDbService.currentFolderId === f.id ? 'selected' : ''}" onclick="selectMoveDestination(${f.id}, this)">
                <i class="fas fa-folder" style="color: ${f.color || '#3b82f6'}"></i> ${escapeHtml(f.name)}
            </div>
        `).join('')}
    `;

    modal.classList.add('active');
}

let selectedMoveDestinationId = null;
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

function openPdfFilePicker() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.pdf,.png,.jpg,.jpeg,.webp';
    input.multiple = true;
    input.onchange = async (e) => {
        if (e.target.files.length) {
            for (const file of e.target.files) {
                await importPdfToLibrary(file);
            }
        }
    };
    input.click();
}

async function importPdfToLibrary(file) {
    if (!file) return;
    showNotification(`Importing "${file.name}"...`, 'info');
    await UserLibraryDbService.importFile(file, UserLibraryDbService.currentFolderId);
    await renderLibrary();
    showNotification(`Imported "${file.name}" to Library!`, 'success');
}

function handleLibraryDragOver(e) {
    e.preventDefault();
    e.currentTarget.classList.add('drag-over');
}

function handleLibraryDragLeave(e) {
    e.currentTarget.classList.remove('drag-over');
}

async function handleLibraryDrop(e) {
    e.preventDefault();
    e.currentTarget.classList.remove('drag-over');
    if (e.dataTransfer.files.length) {
        for (const file of e.dataTransfer.files) {
            await importPdfToLibrary(file);
        }
    }
}

// Backward compatibility aliases
function renderImportedPdfs() { renderLibrary(); }
function openLibraryFolder(index) { navigateToLibraryStackIndex(index); }
function goBackInLibrary() { navigateToLibraryRoot(); }
// ============================================
// 14. TAGS SECTION & TAGGING ITEMS
// ============================================
let currentTaggingItem = null;

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
        container.innerHTML = '<p class="empty-state">No tags available. Create some tags first!</p>';
        return;
    }
    
    const itemId = currentTaggingItem?.id;
    const currentTags = itemId ? (itemTags[itemId] || []) : [];
    
    container.innerHTML = tags.map(tag => {
        const isApplied = currentTags.includes(tag.id);
        return `
            <button class="tag-chip ${isApplied ? 'applied' : ''}" 
                    style="--tag-color: ${tag.color}" 
                    onclick="toggleTagOnItem('${tag.id}')">
                <span class="tag-dot" style="background: ${tag.color}"></span>
                ${escapeHtml(tag.name)}
                ${isApplied ? '<i class="fas fa-check"></i>' : '<i class="fas fa-plus"></i>'}
            </button>
        `;
    }).join('');
}

function renderCurrentItemTags() {
    const container = document.getElementById('currentItemTags');
    if (!container || !currentTaggingItem) return;
    
    const currentTags = itemTags[currentTaggingItem.id] || [];
    
    if (currentTags.length === 0) {
        container.innerHTML = '<p class="empty-state">No tags applied</p>';
        return;
    }
    
    container.innerHTML = currentTags.map(tagId => {
        const tag = tags.find(t => t.id === tagId);
        if (!tag) return '';
        return `
            <span class="tag-badge" style="background: ${tag.color}20; border-color: ${tag.color}">
                <span class="tag-dot" style="background: ${tag.color}"></span>
                ${escapeHtml(tag.name)}
                <button onclick="toggleTagOnItem('${tag.id}')" class="tag-remove"><i class="fas fa-times"></i></button>
            </span>
        `;
    }).join('');
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
        container.innerHTML = '<p class="empty-state"><i class="fas fa-tags"></i> No tags created yet. Create your first tag!</p>';
        return;
    }
    
    container.innerHTML = tags.map(tag => `
        <div class="tag-card" style="--tag-color: ${tag.color}">
            <div class="tag-card-header">
                <span class="tag-dot-lg" style="background: ${tag.color}"></span>
                <span class="tag-card-name">${escapeHtml(tag.name)}</span>
                <span class="tag-card-count">${countItemsWithTag(tag.id)} items</span>
            </div>
            <div class="tag-card-actions">
                <button onclick="filterByTag('${tag.id}')" class="btn btn-sm btn-secondary">
                    <i class="fas fa-filter"></i> View Items
                </button>
                <button onclick="deleteTag('${tag.id}')" class="btn btn-sm btn-danger">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        </div>
    `).join('');
}

function renderTaggedItems(tagId = null) {
    const container = document.getElementById('taggedItemsList');
    if (!container) return;
    
    const items = [];
    
    Object.entries(itemTags).forEach(([itemId, tagIds]) => {
        if (tagIds.length === 0) return; // skip items with no tags
        if (!tagId || tagIds.includes(tagId)) {
            items.push({ id: itemId, tags: tagIds });
        }
    });
    
    if (items.length === 0) {
        container.innerHTML = '<p class="empty-state"><i class="fas fa-folder-open"></i> No tagged items yet.</p>';
        return;
    }
    
    container.innerHTML = items.map(item => {
        const itemTagBadges = item.tags.map(tid => {
            const tag = tags.find(t => t.id === tid);
            return tag ? `<span class="tag-mini" style="background: ${tag.color}">${escapeHtml(tag.name)}</span>` : '';
        }).join('');
        
        // Parse itemId for display and icon
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
            <div class="tagged-item" data-item-id="${escapeHtml(item.id)}" onclick="navigateToTaggedItem('${escapeHtml(item.id)}')">
                <span class="tagged-item-id"><i class="fas ${icon}" style="margin-right: 6px; opacity: 0.5;"></i>${escapeHtml(displayName)}</span>
                <div class="tagged-item-tags">${itemTagBadges}</div>
            </div>
        `;
    }).join('');
}

function filterByTag(tagId) {
    renderTaggedItems(tagId);
    // Scroll to the tagged items section so user can see results
    const section = document.querySelector('.tagged-items-section');
    if (section) {
        section.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    const tag = tags.find(t => t.id === tagId);
    const tagName = tag ? tag.name : 'selected tag';
    showNotification(`Showing items tagged "${tagName}"`, 'info');
}

function navigateToTaggedItem(itemId) {
    // Navigate to the tagged item based on its type prefix
    if (itemId.startsWith('folder_')) {
        const pathStr = itemId.replace('folder_', '');
        const pathArray = pathStr.split('/').filter(s => s);
        if (typeof window.navigateToPath === 'function') {
            window.showView && window.showView('home');
            window.navigateToPath(pathArray);
        }
    } else if (itemId.startsWith('doc_')) {
        const pathStr = itemId.replace('doc_', '');
        const segments = pathStr.split('/').filter(s => s);
        const fileName = segments.pop();
        // Navigate to the parent folder first
        if (typeof window.navigateToPath === 'function' && fileName) {
            window.showView && window.showView('home');
            window.navigateToPath(segments);
            // After navigating, find the file value and open it
            setTimeout(() => {
                let level = window.documents || {};
                for (const seg of segments) {
                    if (level && typeof level === 'object') level = level[seg];
                    else { level = null; break; }
                }
                const value = level ? level[fileName] : null;
                if (value && typeof value === 'string') {
                    if (fileName.match(/\.(png|jpg|jpeg|webp)$/i)) {
                        if (typeof window.showImage === 'function') window.showImage(value, fileName);
                    } else {
                        if (typeof window.showPDF === 'function') window.showPDF(value);
                    }
                } else {
                    showNotification('Could not open file — it may have been moved or deleted.', 'warning');
                }
            }, 100);
        }
    } else {
        showNotification('Item type not recognized', 'info');
    }
}

// ============================================
// 15. PDF POSITION MEMORY (Remember Location)
// ============================================
let pdfPositions = JSON.parse(localStorage.getItem('questionary-pdf-positions') || '{}');

function savePdfPosition(pdfUrl, position) {
    pdfPositions[pdfUrl] = {
        scrollTop: position.scrollTop || 0,
        page: position.page || 1,
        savedAt: new Date().toISOString()
    };
    localStorage.setItem('questionary-pdf-positions', JSON.stringify(pdfPositions));
}

function getPdfPosition(pdfUrl) {
    return pdfPositions[pdfUrl] || null;
}

function restorePdfPosition(pdfUrl) {
    const position = getPdfPosition(pdfUrl);
    if (!position) return;
    
    const iframe = document.getElementById('pdfViewer');
    if (iframe && iframe.contentWindow) {
        // Try to restore position
        setTimeout(() => {
            iframe.contentWindow.postMessage({ 
                type: 'restorePosition', 
                scrollTop: position.scrollTop,
                page: position.page 
            }, '*');
        }, 1000);
        
        showNotification(`Restored to page ${position.page}`, 'info');
    }
}

// Listen for PDF scroll events
window.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'pdfScroll') {
        const pdfUrl = window.currentPdfUrlForBookmarks;
        if (pdfUrl) {
            savePdfPosition(pdfUrl, {
                scrollTop: event.data.scrollTop,
                page: event.data.page
            });
        }
    }
});

// ============================================
// 16. VOICE NOTES FOR NOTES SECTION
// ============================================
function renderVoiceNotesGrid() {
    const container = document.getElementById('voiceNotesGrid');
    if (!container) return;
    
    if (voiceNotes.length === 0) {
        container.innerHTML = '<p class="empty-state"><i class="fas fa-microphone-slash"></i> No voice notes yet. Record your first one!</p>';
        return;
    }
    
    container.innerHTML = voiceNotes.map(note => `
        <div class="voice-note-card" data-id="${note.id}">
            <div class="voice-note-header">
                <span class="voice-note-date">${new Date(note.createdAt).toLocaleString()}</span>
                <span class="voice-note-duration">${note.duration || '0:00'}</span>
            </div>
            <div class="voice-note-actions">
                <button class="btn btn-primary btn-sm play-voice-note" data-id="${note.id}">
                    <i class="fas fa-play"></i> Play
                </button>
                <button class="btn btn-secondary btn-sm" onclick="openTagItemModal('voicenote_${note.id}', 'Voice Note', 'voicenote')">
                    <i class="fas fa-tag"></i>
                </button>
                <button class="btn btn-danger btn-sm delete-voice-note" data-id="${note.id}">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        </div>
    `).join('');
}

// Export functions to window
window.addPdfBookmark = addPdfBookmark;
window.removePdfBookmark = removePdfBookmark;
window.getPdfBookmarks = getPdfBookmarks;
window.renderPdfBookmarks = renderPdfBookmarks;
window.goToPdfPage = goToPdfPage;
window.openBookmarkModal = openBookmarkModal;
window.closeBookmarkModal = closeBookmarkModal;
window.toggleBookmarksPanel = toggleBookmarksPanel;
window.startQuiz = startQuiz;
window.closeQuizModal = closeQuizModal;
window.submitTypedAnswer = submitTypedAnswer;
window.addStudyReminder = addStudyReminder;
window.deleteReminder = deleteReminder;
window.toggleReminder = toggleReminder;
window.setTheme = setTheme;
window.toggleCustomTheme = toggleCustomTheme;
window.updateCustomTheme = updateCustomTheme;
window.saveCustomTheme = saveCustomTheme;
window.resetCustomTheme = resetCustomTheme;
window.initThemeOnLoad = initThemeOnLoad;
window.createTag = createTag;
window.deleteTag = deleteTag;
window.addTagToItem = addTagToItem;
window.removeTagFromItem = removeTagFromItem;
window.startRecording = startRecording;
window.stopRecording = stopRecording;
window.playVoiceNote = playVoiceNote;
window.deleteVoiceNote = deleteVoiceNote;
window.exportAllData = exportAllData;
window.importData = importData;
window.toggleWidgetVisibility = toggleWidgetVisibility;
window.reorderWidget = reorderWidget;
window.initEnhancedFeatures = initEnhancedFeatures;
window.renderReminders = renderReminders;
window.renderSettings = renderSettings;
window.setAlarmSound = setAlarmSound;
window.setAlarmVolume = setAlarmVolume;
window.previewAlarmSound = previewAlarmSound;
window.playAlarmSound = playAlarmSound;
window.stopAlarmSound = stopAlarmSound;
window.renderImportedPdfs = renderImportedPdfs;
window.renderLibrary = renderLibrary;
window.toggleLibraryEditMode = toggleLibraryEditMode;
window.openLibraryFolder = openLibraryFolder;
window.goBackInLibrary = goBackInLibrary;
window.navigateToLibraryRoot = navigateToLibraryRoot;
window.navigateToLibraryPath = navigateToLibraryPath;
window.openCreateLibraryFolderModal = openCreateLibraryFolderModal;
window.closeLibraryFolderModal = closeLibraryFolderModal;
window.selectLibraryFolderColor = selectLibraryFolderColor;
window.saveLibraryFolder = saveLibraryFolder;

// Debug function
window.debugLibrary = function() {
    console.log('=== Library Debug ===');
    console.log('libraryEditMode:', libraryEditMode);
    console.log('currentLibraryPath:', currentLibraryPath);
    console.log('pdfLibrary:', JSON.stringify(pdfLibrary, null, 2));
    console.log('localStorage:', localStorage.getItem('questionary-pdf-library'));
    return pdfLibrary;
};
window.renameLibraryFolder = renameLibraryFolder;
window.deleteLibraryFolder = deleteLibraryFolder;
window.moveLibraryFolderToDocuments = moveLibraryFolderToDocuments;
window.openLibraryPdf = openLibraryPdf;
window.getPdfBlob = getPdfBlob;
window.savePdfBlob = savePdfBlob;
window.deletePdfBlob = deletePdfBlob;
window.renameLibraryPdf = renameLibraryPdf;
window.deleteLibraryPdf = deleteLibraryPdf;
window.openMoveItemModal = openMoveItemModal;
window.closeMoveItemModal = closeMoveItemModal;
window.selectMoveDestination = selectMoveDestination;
window.confirmMoveItem = confirmMoveItem;
window.movePdfToFolder = movePdfToFolder;
window.handleLibraryDragOver = handleLibraryDragOver;
window.handleLibraryDragLeave = handleLibraryDragLeave;
window.handleLibraryDrop = handleLibraryDrop;
window.handleFolderDragOver = handleFolderDragOver;
window.handleFolderDragLeave = handleFolderDragLeave;
window.handleFolderDrop = handleFolderDrop;
window.handlePdfDragStart = handlePdfDragStart;
window.handlePdfDragEnd = handlePdfDragEnd;
window.openTagItemModal = openTagItemModal;
window.closeTagItemModal = closeTagItemModal;
window.toggleTagOnItem = toggleTagOnItem;
window.renderTagsMain = renderTagsMain;
window.renderTaggedItems = renderTaggedItems;
window.filterByTag = filterByTag;
window.navigateToTaggedItem = navigateToTaggedItem;
window.savePdfPosition = savePdfPosition;
window.restorePdfPosition = restorePdfPosition;
window.renderVoiceNotesGrid = renderVoiceNotesGrid;
window.startRecordingNotes = startRecordingNotes;
window.initAlarmUI = initAlarmUI;
window.handleFilesSelect = handleFilesSelect;
window.openTagModal = openTagModal;
window.closeTagModal = closeTagModal;
window.openReminderModal = openReminderModal;
window.closeReminderModal = closeReminderModal;
window.saveReminderFromModal = saveReminderFromModal;
window.saveBookmarkFromModal = saveBookmarkFromModal;

// Toggle recording function for onclick (settings)
window.toggleRecording = function() {
    const btn = document.getElementById('recordBtn');
    if (btn && btn.classList.contains('recording')) {
        stopRecording();
    } else {
        startRecording();
    }
};

// Toggle recording for notes section
window.toggleRecordingNotes = function() {
    const btn = document.getElementById('recordBtnNotes');
    if (btn && btn.classList.contains('recording')) {
        stopRecording();
    } else {
        startRecordingNotes();
    }
};

// Save tag function for onclick
window.saveTag = function() {
    const name = document.getElementById('tagNameInput')?.value.trim();
    const color = document.getElementById('tagColorInput')?.value || '#cf6215';
    if (name) {
        createTag(name, color);
        closeTagModal();
    } else {
        showNotification('Please enter a tag name', 'warning');
    }
};

// Auto-init when DOM ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initEnhancedFeatures);
} else {
    initEnhancedFeatures();
}
