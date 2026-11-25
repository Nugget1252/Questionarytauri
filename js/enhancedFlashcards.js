/* ==========================================================================
   QUESTIONARY ENHANCED FLASHCARDS ENGINE (v3.0)
   Single Authoritative Engine: 3D Flip, Spaced Repetition, Shuffle, Quiz Mode
   Zero pre-seeded sample/test data.
   ========================================================================== */

(function () {
  'use strict';

  const STORAGE_KEY = 'questionary-flashcards';
  const DEMO_PURGE_KEY = 'questionary-demo-decks-purged-v1';
  const LEGACY_DEMO_IDS = new Set([
    'icse10_physics_force',
    'icse10_chem_periodic',
    'icse10_bio_cell',
    'icse10_comp_java'
  ]);

  const KNOWN_SUBJECTS = [
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

  const SUBJECT_ALIASES = {
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

  let decks = [];
  let currentActiveDeck = null;
  let studyCards = [];
  let isShuffled = false;
  let currentCardIndex = 0;
  let isCardFlipped = false;
  let selectedSubjectFilter = 'all';
  let _cardResetRaf = null;
  let _quizAdvanceTimer = null;

  function normalizeSubject(raw) {
    const cleaned = String(raw || '').trim();
    if (!cleaned) return 'General';
    const lower = cleaned.toLowerCase();
    if (Object.prototype.hasOwnProperty.call(SUBJECT_ALIASES, lower)) {
      return SUBJECT_ALIASES[lower];
    }
    const knownMatch = KNOWN_SUBJECTS.find(s => s.toLowerCase() === lower);
    if (knownMatch) return knownMatch;
    return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
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

  function loadDecks() {
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

    // One-time cleanup: remove only the old pre-seeded sample decks while keeping all user-created decks
    try {
      if (!localStorage.getItem(DEMO_PURGE_KEY)) {
        const beforeCount = parsed.length;
        parsed = parsed.filter(d => d && !LEGACY_DEMO_IDS.has(String(d.id)));
        if (parsed.length !== beforeCount) {
          modified = true;
        }
        localStorage.setItem(DEMO_PURGE_KEY, '1');
      }
    } catch (e) {}

    // Normalize deck shape cleanly
    decks = parsed
      .filter(d => d && typeof d === 'object')
      .map((deck, idx) => {
        const id = deck.id ? String(deck.id) : `deck_${Date.now()}_${idx}`;
        const name = String(deck.name || 'Untitled Deck').trim() || 'Untitled Deck';
        const subject = normalizeSubject(deck.subject);
        const cards = Array.isArray(deck.cards)
          ? deck.cards
              .filter(c => c && typeof c === 'object' && (c.front || c.back))
              .map(c => ({
                front: String(c.front || '').trim(),
                back: String(c.back || '').trim(),
                hint: String(c.hint || '').trim(),
                mastery: Math.max(0, Math.min(3, Number(c.mastery) || 0))
              }))
          : [];

        if (deck.id !== id || deck.subject !== subject || !Array.isArray(deck.cards)) {
          modified = true;
        }

        return {
          id,
          name,
          subject,
          cards,
          lastStudied: deck.lastStudied || null,
          createdAt: deck.createdAt || Date.now()
        };
      });

    window.flashcardDecks = decks;
    if (modified) {
      saveDecks();
    }
    return decks;
  }

  function saveDecks() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(decks));
      window.flashcardDecks = decks;
    } catch (e) {}
  }

  function getDecks() {
    return loadDecks();
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

  function calculateMastery(deck) {
    if (!deck || !Array.isArray(deck.cards) || deck.cards.length === 0) return 0;
    const totalMastery = deck.cards.reduce((sum, c) => sum + (Number(c.mastery) || 0), 0);
    const maxPossible = deck.cards.length * 3;
    return Math.round((totalMastery / maxPossible) * 100);
  }

  function speakText(text) {
    if (!text) return;
    if (window.AccessibilityManager && typeof window.AccessibilityManager.speak === 'function') {
      window.AccessibilityManager.speak(text);
      return;
    }
    if ('speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
        const utter = new SpeechSynthesisUtterance(text);
        window.speechSynthesis.speak(utter);
      } catch (e) {}
    }
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

  function renderDecks() {
    loadDecks();
    const container = document.getElementById('flashcardsGrid');
    if (!container) return;

    // Update export button disabled state in section header
    const exportBtn = document.getElementById('exportDecksBtn');
    if (exportBtn) {
      exportBtn.disabled = decks.length === 0;
      exportBtn.style.opacity = decks.length === 0 ? '0.5' : '';
    }

    // Build / manage filter bar (only shown when there are decks)
    let headerBar = document.getElementById('flashcardsHeaderBar');
    if (!headerBar && container.parentElement) {
      headerBar = document.createElement('div');
      headerBar.id = 'flashcardsHeaderBar';
      headerBar.className = 'flashcards-header-bar';
      container.parentElement.insertBefore(headerBar, container);
    }

    if (decks.length === 0) {
      selectedSubjectFilter = 'all';
      if (headerBar) {
        headerBar.style.display = 'none';
        headerBar.innerHTML = '';
      }
      container.innerHTML = `
        <div class="study-empty-state">
          <div class="study-empty-icon"><i class="fas fa-layer-group"></i></div>
          <h4>No flashcard decks yet</h4>
          <p>Create your first deck or import flashcards from a file or AI prompt to start studying with 3D flip cards, spaced repetition, and quiz mode.</p>
          <div style="display:flex; gap:8px; justify-content:center; flex-wrap:wrap;">
            <button type="button" class="btn btn-secondary btn-sm ef-empty-import-btn">
              <i class="fas fa-file-import"></i> Import Deck
            </button>
            <button type="button" class="btn btn-secondary btn-sm ef-empty-ai-guide-btn">
              <i class="fas fa-magic"></i> AI Prompt &amp; Guide
            </button>
            <button type="button" class="btn btn-primary btn-sm ef-empty-create-btn">
              <i class="fas fa-plus"></i> Create Your First Deck
            </button>
          </div>
        </div>
      `;
      container.querySelector('.ef-empty-create-btn')?.addEventListener('click', () => openEditor());
      container.querySelector('.ef-empty-import-btn')?.addEventListener('click', () => {
        if (window.StudyImportExport) window.StudyImportExport.openFlashcardsImport('fc-import-paste');
      });
      container.querySelector('.ef-empty-ai-guide-btn')?.addEventListener('click', () => {
        if (window.StudyImportExport) window.StudyImportExport.openFlashcardsImport('fc-import-ai');
      });
      return;
    }

    // Collect distinct active subjects in stable order
    const activeSubjects = [];
    const seenSubjects = new Set();
    decks.forEach(d => {
      const subj = normalizeSubject(d.subject);
      const key = subj.toLowerCase();
      if (!seenSubjects.has(key)) {
        seenSubjects.add(key);
        activeSubjects.push(subj);
      }
    });

    if (selectedSubjectFilter !== 'all' && !seenSubjects.has(selectedSubjectFilter.toLowerCase())) {
      selectedSubjectFilter = 'all';
    }

    if (headerBar) {
      if (activeSubjects.length > 1) {
        headerBar.style.display = 'flex';
        const chips = ['All', ...activeSubjects];
        headerBar.innerHTML = `
          <div class="flashcards-filters">
            ${chips.map(s => {
              const val = s.toLowerCase();
              const isActive = selectedSubjectFilter.toLowerCase() === val;
              return `
                <button type="button" class="subject-chip ${isActive ? 'active' : ''}" data-subject="${escapeHtml(val)}">
                  ${escapeHtml(s)}
                </button>
              `;
            }).join('')}
          </div>
        `;
        headerBar.querySelectorAll('.subject-chip').forEach(btn => {
          btn.addEventListener('click', () => {
            selectedSubjectFilter = btn.dataset.subject || 'all';
            renderDecks();
          });
        });
      } else {
        headerBar.style.display = 'none';
        headerBar.innerHTML = '';
      }
    }

    const filtered = selectedSubjectFilter === 'all'
      ? decks
      : decks.filter(d => normalizeSubject(d.subject).toLowerCase() === selectedSubjectFilter.toLowerCase());

    if (filtered.length === 0) {
      container.innerHTML = `
        <div class="study-empty-state">
          <div class="study-empty-icon"><i class="fas fa-filter"></i></div>
          <h4>No decks in this subject</h4>
          <p>Switch back to all decks or create a new deck for this subject.</p>
          <div style="display:flex; gap:8px; justify-content:center; flex-wrap:wrap;">
            <button type="button" class="btn btn-secondary btn-sm ef-reset-filter-btn">Show All Decks</button>
            <button type="button" class="btn btn-primary btn-sm ef-empty-create-btn"><i class="fas fa-plus"></i> New Deck</button>
          </div>
        </div>
      `;
      container.querySelector('.ef-reset-filter-btn')?.addEventListener('click', () => {
        selectedSubjectFilter = 'all';
        renderDecks();
      });
      container.querySelector('.ef-empty-create-btn')?.addEventListener('click', () => openEditor());
      return;
    }

    container.innerHTML = filtered.map(deck => {
      const masteryPct = calculateMastery(deck);
      const cardCount = deck.cards ? deck.cards.length : 0;
      const subjectLabel = normalizeSubject(deck.subject);
      return `
        <div class="deck-card" data-deck-id="${escapeHtml(deck.id)}">
          <div class="deck-badge-row">
            <span class="deck-subject-badge">${escapeHtml(subjectLabel)}</span>
            <div class="card-icon-actions">
              <button type="button" class="btn-icon ef-export-deck" title="Export Deck" aria-label="Export Deck">
                <i class="fas fa-download"></i>
              </button>
              <button type="button" class="btn-icon ef-edit-deck" title="Edit Deck" aria-label="Edit Deck">
                <i class="fas fa-pen"></i>
              </button>
              <button type="button" class="btn-icon delete ef-delete-deck" title="Delete Deck" aria-label="Delete Deck">
                <i class="fas fa-trash"></i>
              </button>
            </div>
          </div>

          <h4 class="deck-card-heading">${escapeHtml(deck.name)}</h4>
          <p class="deck-card-meta">${cardCount} ${cardCount === 1 ? 'flashcard' : 'flashcards'}</p>

          <div class="deck-mastery-container">
            <div class="deck-mastery-label">
              <span>Mastery</span>
              <span>${masteryPct}%</span>
            </div>
            <div class="deck-mastery-bar">
              <div class="deck-mastery-fill" style="width: ${masteryPct}%;"></div>
            </div>
          </div>

          <div class="deck-card-footer-actions">
            <button type="button" class="btn btn-primary btn-sm ef-study-deck">
              <i class="fas fa-play"></i> Study
            </button>
            <button type="button" class="btn btn-secondary btn-sm ef-shuffle-deck" title="Shuffle & Study in Random Order">
              <i class="fas fa-random"></i> Shuffle
            </button>
            <button type="button" class="btn btn-secondary btn-sm ef-quiz-deck">
              <i class="fas fa-question-circle"></i> Quiz
            </button>
          </div>
        </div>
      `;
    }).join('');

    container.querySelectorAll('.deck-card').forEach(card => {
      const did = card.dataset.deckId;
      card.querySelector('.ef-export-deck')?.addEventListener('click', (e) => {
        e.stopPropagation();
        if (window.StudyImportExport) {
          window.StudyImportExport.openFlashcardsExport(did);
        } else {
          exportDecks();
        }
      });
      card.querySelector('.ef-edit-deck')?.addEventListener('click', (e) => {
        e.stopPropagation();
        openEditor(did);
      });
      card.querySelector('.ef-delete-deck')?.addEventListener('click', (e) => {
        e.stopPropagation();
        deleteDeck(did);
      });
      card.querySelector('.ef-study-deck')?.addEventListener('click', () => startStudy(did));
      card.querySelector('.ef-shuffle-deck')?.addEventListener('click', () => startStudy(did, { shuffle: true }));
      card.querySelector('.ef-quiz-deck')?.addEventListener('click', () => startQuiz(did));
    });
  }

  // ================================================================
  // 3D STUDY SESSION MODAL (with zero-answer-flash & Shuffle)
  // ================================================================
  function startStudy(deckId, options = {}) {
    loadDecks();
    const deck = decks.find(d => String(d.id) === String(deckId));
    if (!deck || !deck.cards || deck.cards.length === 0) {
      if (window.showNotification) window.showNotification('This deck has no cards to study. Click Edit to add cards.', 'warning');
      return;
    }

    currentActiveDeck = deck;
    isShuffled = Boolean(options && options.shuffle && deck.cards.length > 1);
    studyCards = isShuffled ? shuffleCardList(deck.cards) : [...deck.cards];
    currentCardIndex = 0;
    isCardFlipped = false;
    deck.lastStudied = Date.now();
    saveDecks();

    const modal = document.getElementById('studyModal');
    if (!modal) return;

    renderActiveStudyCard();
    modal.classList.add('active');
    if (isShuffled && window.showNotification) {
      window.showNotification('Deck shuffled for random practice!', 'info');
    }
  }

  function shuffleDeck() {
    if (!currentActiveDeck || !studyCards || studyCards.length === 0) return;
    if (studyCards.length < 2) {
      if (window.showNotification) window.showNotification('Add at least 2 cards to shuffle this deck.', 'info');
      return;
    }
    studyCards = shuffleCardList(studyCards);
    isShuffled = true;
    currentCardIndex = 0;
    isCardFlipped = false;
    renderActiveStudyCard();
    if (window.showNotification) window.showNotification('Cards shuffled!', 'info');
  }

  function renderActiveStudyCard() {
    const modal = document.getElementById('studyModal');
    if (!modal || !currentActiveDeck) return;

    const cards = studyCards.length > 0 ? studyCards : currentActiveDeck.cards;
    const card = cards[currentCardIndex];
    const total = cards.length;
    if (!card) return;

    if (_cardResetRaf !== null) {
      cancelAnimationFrame(_cardResetRaf);
      _cardResetRaf = null;
    }

    const modalBody = modal.querySelector('.modal-body');
    const modalHeader = modal.querySelector('.modal-header');
    const modalFooter = modal.querySelector('.modal-footer');

    if (modalHeader) {
      modalHeader.innerHTML = `
        <h3><i class="fas fa-graduation-cap"></i> ${escapeHtml(currentActiveDeck.name)}</h3>
        <div style="display:flex; align-items:center; gap:12px;">
          <span style="font-size:0.8rem; font-weight:700; color:var(--accent);">Card ${currentCardIndex + 1} of ${total}${isShuffled ? ' · Shuffled' : ''}</span>
          <button type="button" class="modal-close ef-study-close-btn" aria-label="Close"><i class="fas fa-times"></i></button>
        </div>
      `;
      modalHeader.querySelector('.ef-study-close-btn')?.addEventListener('click', closeStudy);
    }

    if (modalBody) {
      modalBody.innerHTML = `
        <div style="width: 100%; max-width: 580px; margin: 0 auto;">
          <div style="height: 6px; background: var(--line); border-radius: 3px; overflow: hidden; margin-bottom: 1rem;">
            <div style="height: 100%; width: ${((currentCardIndex + 1) / total) * 100}%; background: var(--accent); transition: width 0.25s;"></div>
          </div>

          <div class="flashcard-3d-wrapper" id="flashcard3dWrapper">
            <div class="flashcard-3d-card no-transition ${isCardFlipped ? 'flipped' : ''}" id="flashcard3dCard">
              <div class="flashcard-face front">
                <span class="card-tag-pill">Question</span>
                <button type="button" class="card-tts-btn ef-speak-front" title="Read aloud" aria-label="Read question aloud">
                  <i class="fas fa-volume-up"></i>
                </button>
                <div class="card-content-text" style="white-space:pre-line;">${escapeHtml(card.front)}</div>
                ${card.hint ? `<div style="font-size:0.78rem; color:var(--fg3); margin-top:8px;"><i class="fas fa-lightbulb"></i> Hint: ${escapeHtml(card.hint)}</div>` : ''}
                <div class="card-flip-prompt"><i class="fas fa-sync-alt"></i> Click card or press Space to reveal answer</div>
              </div>

              <div class="flashcard-face back">
                <span class="card-tag-pill" style="color:#10b981; background:rgba(16,185,129,0.12);">Answer</span>
                <button type="button" class="card-tts-btn ef-speak-back" title="Read aloud" aria-label="Read answer aloud">
                  <i class="fas fa-volume-up"></i>
                </button>
                <div class="card-content-text" style="white-space:pre-line;">${escapeHtml(card.back)}</div>
                <div class="card-flip-prompt"><i class="fas fa-sync-alt"></i> Click card to flip back</div>
              </div>
            </div>
          </div>

          <div class="study-rating-grid">
            <button type="button" class="rating-btn again" data-rating="0">
              <span class="label">Again (1)</span>
              <span class="sub">Needs Review</span>
            </button>
            <button type="button" class="rating-btn hard" data-rating="1">
              <span class="label">Hard (2)</span>
              <span class="sub">Struggled</span>
            </button>
            <button type="button" class="rating-btn good" data-rating="2">
              <span class="label">Good (3)</span>
              <span class="sub">Recalled</span>
            </button>
            <button type="button" class="rating-btn easy" data-rating="3">
              <span class="label">Easy (4)</span>
              <span class="sub">Mastered</span>
            </button>
          </div>
        </div>
      `;

      modalBody.querySelector('#flashcard3dWrapper')?.addEventListener('click', flipCard);
      modalBody.querySelector('.ef-speak-front')?.addEventListener('click', (e) => {
        e.stopPropagation();
        speakFront();
      });
      modalBody.querySelector('.ef-speak-back')?.addEventListener('click', (e) => {
        e.stopPropagation();
        speakBack();
      });
      modalBody.querySelectorAll('.rating-btn').forEach(btn => {
        btn.addEventListener('click', () => rateCard(Number(btn.dataset.rating)));
      });
    }

    const cardEl = document.getElementById('flashcard3dCard');
    if (cardEl) {
      void cardEl.offsetWidth;
      _cardResetRaf = requestAnimationFrame(() => {
        _cardResetRaf = requestAnimationFrame(() => {
          cardEl.classList.remove('no-transition');
          _cardResetRaf = null;
        });
      });
    }

    if (modalFooter) {
      modalFooter.innerHTML = `
        <div style="display:flex; justify-content:space-between; width:100%; align-items:center; flex-wrap:wrap; gap:8px;">
          <button type="button" class="btn btn-secondary btn-sm ef-prev-btn" ${currentCardIndex === 0 ? 'disabled' : ''}>
            <i class="fas fa-arrow-left"></i> Previous
          </button>
          <div style="display:flex; align-items:center; gap:8px;">
            <button type="button" class="btn btn-primary btn-sm ef-flip-btn">
              <i class="fas fa-sync-alt"></i> Flip Card
            </button>
            <button type="button" class="btn btn-secondary btn-sm ef-shuffle-btn ${isShuffled ? 'active' : ''}" ${total < 2 ? 'disabled' : ''} title="Shuffle cards in this deck (S)">
              <i class="fas fa-random"></i> Shuffle
            </button>
          </div>
          <button type="button" class="btn btn-secondary btn-sm ef-next-btn">
            ${currentCardIndex === total - 1 ? 'Finish' : 'Next'} <i class="fas fa-arrow-right"></i>
          </button>
        </div>
      `;
      modalFooter.querySelector('.ef-prev-btn')?.addEventListener('click', prevCard);
      modalFooter.querySelector('.ef-flip-btn')?.addEventListener('click', flipCard);
      modalFooter.querySelector('.ef-shuffle-btn')?.addEventListener('click', shuffleDeck);
      modalFooter.querySelector('.ef-next-btn')?.addEventListener('click', nextCard);
    }
  }

  function flipCard() {
    isCardFlipped = !isCardFlipped;
    const cardEl = document.getElementById('flashcard3dCard');
    if (cardEl) {
      cardEl.classList.remove('no-transition');
      cardEl.classList.toggle('flipped', isCardFlipped);
    }
  }

  function nextCard() {
    if (!currentActiveDeck) return;
    if (currentCardIndex < studyCards.length - 1) {
      currentCardIndex++;
      isCardFlipped = false;
      renderActiveStudyCard();
    } else {
      showCompletionScreen();
    }
  }

  function prevCard() {
    if (!currentActiveDeck) return;
    if (currentCardIndex > 0) {
      currentCardIndex--;
      isCardFlipped = false;
      renderActiveStudyCard();
    }
  }

  function rateCard(ratingLevel) {
    if (!currentActiveDeck || !studyCards[currentCardIndex]) return;
    studyCards[currentCardIndex].mastery = Math.max(0, Math.min(3, Number(ratingLevel) || 0));
    saveDecks();
    nextCard();
  }

  function speakFront() {
    if (!currentActiveDeck) return;
    speakText(studyCards[currentCardIndex]?.front);
  }

  function speakBack() {
    if (!currentActiveDeck) return;
    speakText(studyCards[currentCardIndex]?.back);
  }

  function showCompletionScreen() {
    const modal = document.getElementById('studyModal');
    if (!modal || !currentActiveDeck) return;

    const masteryPct = calculateMastery(currentActiveDeck);
    const modalBody = modal.querySelector('.modal-body');
    const modalFooter = modal.querySelector('.modal-footer');
    const finishedDeckId = currentActiveDeck.id;
    const cardCount = currentActiveDeck.cards.length;

    if (modalBody) {
      modalBody.innerHTML = `
        <div style="text-align: center; padding: 2rem 1rem;">
          <div style="width: 72px; height: 72px; border-radius: 50%; background: rgba(16,185,129,0.15); color: #10b981; display:flex; align-items:center; justify-content:center; font-size:2.2rem; margin:0 auto 1.2rem auto;">
            <i class="fas fa-check-circle"></i>
          </div>
          <h3 style="margin: 0 0 8px 0; color: var(--fg);">Deck Complete!</h3>
          <p style="font-size: 0.9rem; color: var(--fg2); margin-bottom: 1.5rem;">
            You reviewed all ${cardCount} ${cardCount === 1 ? 'card' : 'cards'} in <strong>${escapeHtml(currentActiveDeck.name)}</strong>.
          </p>
          <div style="max-width: 300px; margin: 0 auto 1.5rem auto; background: var(--bg); border: 1px solid var(--line); border-radius: 12px; padding: 12px 18px;">
            <div style="display:flex; justify-content:space-between; font-size:0.85rem; margin-bottom:6px; color: var(--fg);">
              <span>Deck Mastery</span>
              <span style="font-weight:700; color:var(--accent);">${masteryPct}%</span>
            </div>
            <div class="deck-mastery-bar">
              <div class="deck-mastery-fill" style="width: ${masteryPct}%;"></div>
            </div>
          </div>
        </div>
      `;
    }

    if (modalFooter) {
      modalFooter.innerHTML = `
        <div style="display:flex; gap:10px; width:100%; justify-content:center; flex-wrap:wrap;">
          <button type="button" class="btn btn-secondary ef-finish-close">Close</button>
          ${cardCount > 1 ? `
            <button type="button" class="btn btn-secondary ef-finish-shuffle">
              <i class="fas fa-random"></i> Shuffle &amp; Review
            </button>
          ` : ''}
          <button type="button" class="btn btn-primary ef-finish-retry">
            <i class="fas fa-redo"></i> Review Again
          </button>
        </div>
      `;
      modalFooter.querySelector('.ef-finish-close')?.addEventListener('click', closeStudy);
      modalFooter.querySelector('.ef-finish-shuffle')?.addEventListener('click', () => startStudy(finishedDeckId, { shuffle: true }));
      modalFooter.querySelector('.ef-finish-retry')?.addEventListener('click', () => startStudy(finishedDeckId));
    }

    renderDecks();
  }

  function closeStudy() {
    if (_cardResetRaf !== null) {
      cancelAnimationFrame(_cardResetRaf);
      _cardResetRaf = null;
    }
    const modal = document.getElementById('studyModal');
    if (modal) modal.classList.remove('active');
    currentActiveDeck = null;
    studyCards = [];
    isShuffled = false;
    isCardFlipped = false;
    renderDecks();
  }

  // ================================================================
  // QUIZ MODE
  // ================================================================
  function clearQuizTimer() {
    if (_quizAdvanceTimer !== null) {
      clearTimeout(_quizAdvanceTimer);
      _quizAdvanceTimer = null;
    }
  }

  function closeQuiz() {
    clearQuizTimer();
    const modal = document.getElementById('quizModal');
    if (modal) modal.classList.remove('active');
    const footer = document.getElementById('quizModalFooter') || modal?.querySelector('.modal-footer');
    if (footer) {
      footer.innerHTML = '';
      footer.style.display = 'none';
    }
  }

  function startQuiz(deckId) {
    loadDecks();
    const deck = decks.find(d => String(d.id) === String(deckId));
    if (!deck || !deck.cards || deck.cards.length < 2) {
      if (window.showNotification) window.showNotification('At least 2 cards are required for Quiz Mode.', 'warning');
      return;
    }

    clearQuizTimer();
    const modal = document.getElementById('quizModal');
    if (!modal) return;

    const modalTitle = document.getElementById('quizModalTitle') || modal.querySelector('.modal-header h3');
    const modalBody = document.getElementById('quizContent') || modal.querySelector('.modal-body');
    const modalFooter = document.getElementById('quizModalFooter') || modal.querySelector('.modal-footer');

    let quizIndex = 0;
    let score = 0;
    const questions = shuffleCardList(deck.cards);

    function renderQuizQuestion() {
      if (!modal.classList.contains('active') && quizIndex > 0) return;

      if (quizIndex >= questions.length) {
        const pct = Math.round((score / questions.length) * 100);
        if (modalTitle) {
          modalTitle.innerHTML = `<i class="fas fa-trophy"></i> Quiz Results`;
        }
        if (modalBody) {
          modalBody.innerHTML = `
            <div style="text-align: center; padding: 2rem 1rem;">
              <i class="fas fa-trophy" style="font-size: 3rem; color: #f59e0b; margin-bottom: 1rem; display:block;"></i>
              <h3 style="color:var(--fg); margin:0 0 8px 0;">Quiz Completed!</h3>
              <p style="font-size:1.05rem; color:var(--fg2); margin:0;">
                You scored <strong>${score}</strong> out of <strong>${questions.length}</strong> (${pct}%)
              </p>
            </div>
          `;
        }
        if (modalFooter) {
          modalFooter.style.display = 'flex';
          modalFooter.innerHTML = `
            <button type="button" class="btn btn-secondary ef-quiz-retake"><i class="fas fa-redo"></i> Retake Quiz</button>
            <button type="button" class="btn btn-primary ef-quiz-done">Done</button>
          `;
          modalFooter.querySelector('.ef-quiz-retake')?.addEventListener('click', () => startQuiz(deck.id));
          modalFooter.querySelector('.ef-quiz-done')?.addEventListener('click', closeQuiz);
        }
        return;
      }

      if (modalFooter) {
        modalFooter.style.display = 'none';
        modalFooter.innerHTML = '';
      }

      const q = questions[quizIndex];
      const uniqueOtherAnswers = Array.from(
        new Set(deck.cards.map(c => c.back).filter(ans => ans && ans !== q.back))
      );
      const distractors = shuffleCardList(uniqueOtherAnswers).slice(0, 3);
      const choices = shuffleCardList([q.back, ...distractors]);

      if (modalTitle) {
        modalTitle.innerHTML = `<i class="fas fa-question-circle"></i> Quiz: Question ${quizIndex + 1} of ${questions.length}`;
      }
      if (modalBody) {
        modalBody.innerHTML = `
          <div style="max-width: 540px; margin: 0 auto;">
            <div style="height: 5px; background: var(--line); border-radius: 3px; overflow: hidden; margin-bottom: 1.25rem;">
              <div style="height: 100%; width: ${((quizIndex + 1) / questions.length) * 100}%; background: var(--accent); transition: width 0.25s;"></div>
            </div>
            <h4 style="font-size: 1.12rem; color: var(--fg); margin: 0 0 1.25rem 0; text-align: center; line-height: 1.5;">${escapeHtml(q.front)}</h4>
            <div style="display: flex; flex-direction: column; gap: 10px;">
              ${choices.map((choice, i) => `
                <button type="button" class="btn btn-secondary quiz-opt-btn" style="text-align: left; padding: 12px 16px; font-size: 0.88rem; justify-content: flex-start; line-height: 1.45; white-space: normal; height: auto;"
                        data-choice-idx="${i}">
                  <strong style="margin-right: 8px; color: var(--accent); flex-shrink:0;">${String.fromCharCode(65 + i)}.</strong>
                  <span>${escapeHtml(choice)}</span>
                </button>
              `).join('')}
            </div>
            <div id="quizFeedback" style="margin-top: 1rem; font-size: 0.88rem; font-weight: 600; text-align: center; min-height: 24px;"></div>
          </div>
        `;

        modalBody.querySelectorAll('.quiz-opt-btn').forEach(btn => {
          btn.onclick = () => {
            const idx = Number(btn.dataset.choiceIdx);
            const selected = choices[idx];
            const feedback = document.getElementById('quizFeedback');
            modalBody.querySelectorAll('.quiz-opt-btn').forEach(b => {
              b.disabled = true;
              const bIdx = Number(b.dataset.choiceIdx);
              if (choices[bIdx] === q.back) {
                b.style.borderColor = '#10b981';
                b.style.background = 'rgba(16,185,129,0.14)';
              }
            });

            if (selected === q.back) {
              score++;
              if (feedback) {
                feedback.innerHTML = '<span style="color:#10b981;"><i class="fas fa-check"></i> Correct!</span>';
              }
            } else {
              btn.style.borderColor = '#ef4444';
              btn.style.background = 'rgba(239,68,68,0.14)';
              if (feedback) {
                feedback.innerHTML = `<span style="color:#ef4444;"><i class="fas fa-times"></i> Incorrect</span>`;
              }
            }

            clearQuizTimer();
            _quizAdvanceTimer = setTimeout(() => {
              _quizAdvanceTimer = null;
              quizIndex++;
              renderQuizQuestion();
            }, 1100);
          };
        });
      }
    }

    modal.classList.add('active');
    renderQuizQuestion();
  }

  // ================================================================
  // CREATE / EDIT DECK MODAL
  // ================================================================
  function renumberCardRows(container) {
    if (!container) return;
    container.querySelectorAll('.deck-card-row').forEach((row, idx) => {
      const label = row.querySelector('.deck-card-row-label');
      if (label) label.textContent = `Card ${idx + 1}`;
    });
  }

  function addCardRow(container, front = '', back = '', hint = '', mastery = 0) {
    if (!container) return;
    const row = document.createElement('div');
    row.className = 'deck-card-row';
    row.dataset.mastery = String(Math.max(0, Math.min(3, Number(mastery) || 0)));
    row.innerHTML = `
      <div class="deck-card-row-header">
        <span class="deck-card-row-label">Card</span>
        <button type="button" class="btn-icon delete ef-remove-card-btn" title="Remove card" aria-label="Remove card">
          <i class="fas fa-trash"></i>
        </button>
      </div>
      <input type="text" class="card-front-input form-input" placeholder="Question / Front" value="${escapeHtml(front)}">
      <textarea class="card-back-input form-input" placeholder="Answer / Back" rows="2">${escapeHtml(back)}</textarea>
      <input type="text" class="card-hint-input form-input" placeholder="Optional Hint" value="${escapeHtml(hint)}" style="font-size:0.82rem;">
    `;
    row.querySelector('.ef-remove-card-btn')?.addEventListener('click', () => {
      row.remove();
      renumberCardRows(container);
    });
    container.appendChild(row);
    renumberCardRows(container);
  }

  function setSelectValueNormalized(selectEl, value) {
    if (!selectEl) return;
    const normalized = normalizeSubject(value);
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
    const modal = document.getElementById('flashcardModal');
    if (modal) modal.classList.remove('active');
  }

  function openEditor(deckId = null) {
    loadDecks();
    const modal = document.getElementById('flashcardModal');
    if (!modal) return;

    const targetDeck = deckId ? decks.find(d => String(d.id) === String(deckId)) : null;

    const modalTitle = document.getElementById('flashcardModalTitle');
    const nameInput = document.getElementById('deckName');
    const subjectSelect = document.getElementById('deckSubject');
    const cardsContainer = document.getElementById('cardsContainer');

    if (modalTitle) {
      modalTitle.innerHTML = targetDeck
        ? '<i class="fas fa-pen"></i> Edit Flashcard Deck'
        : '<i class="fas fa-layer-group"></i> Create Flashcard Deck';
    }
    if (nameInput) nameInput.value = targetDeck ? targetDeck.name : '';
    setSelectValueNormalized(subjectSelect, targetDeck ? targetDeck.subject : 'General');

    if (cardsContainer) {
      cardsContainer.innerHTML = '';
      if (targetDeck && targetDeck.cards && targetDeck.cards.length > 0) {
        targetDeck.cards.forEach(c => addCardRow(cardsContainer, c.front, c.back, c.hint, c.mastery));
      } else {
        addCardRow(cardsContainer);
      }
    }

    const saveBtn = document.getElementById('saveDeckBtn');
    if (saveBtn) {
      saveBtn.onclick = () => {
        const name = nameInput ? nameInput.value.trim() : '';
        const subject = normalizeSubject(subjectSelect ? subjectSelect.value : 'General');
        if (!name) {
          if (window.showNotification) window.showNotification('Please provide a deck name.', 'warning');
          nameInput?.focus();
          return;
        }

        const cards = [];
        cardsContainer?.querySelectorAll('.deck-card-row').forEach(row => {
          const front = row.querySelector('.card-front-input')?.value.trim() || '';
          const back = row.querySelector('.card-back-input')?.value.trim() || '';
          const hint = row.querySelector('.card-hint-input')?.value.trim() || '';
          const mastery = Math.max(0, Math.min(3, Number(row.dataset.mastery) || 0));
          if (front && back) {
            cards.push({ front, back, hint, mastery });
          }
        });

        if (cards.length === 0) {
          if (window.showNotification) window.showNotification('Please add at least one card with both a question and an answer.', 'warning');
          return;
        }

        if (targetDeck) {
          targetDeck.name = name;
          targetDeck.subject = subject;
          targetDeck.cards = cards;
        } else {
          decks.unshift({
            id: 'deck_' + Date.now(),
            name,
            subject,
            cards,
            lastStudied: null,
            createdAt: Date.now()
          });
        }

        saveDecks();
        renderDecks();
        closeEditor();
        if (window.showNotification) {
          window.showNotification(targetDeck ? 'Flashcard deck updated!' : 'Flashcard deck created!', 'success');
        }
      };
    }

    modal.classList.add('active');
    setTimeout(() => nameInput?.focus(), 60);
  }

  async function deleteDeck(deckId) {
    loadDecks();
    const deck = decks.find(d => String(d.id) === String(deckId));
    if (!deck) return;

    const confirmed = await confirmAction(
      `Are you sure you want to delete the deck "${deck.name}"?`,
      'Delete Flashcard Deck'
    );
    if (!confirmed) return;

    decks = decks.filter(d => String(d.id) !== String(deckId));
    saveDecks();
    renderDecks();
    if (window.showNotification) window.showNotification('Deck deleted', 'info');
  }

  function exportDecks() {
    loadDecks();
    if (decks.length === 0) {
      if (window.showNotification) window.showNotification('No flashcard decks to export yet.', 'info');
      return;
    }
    const blob = new Blob([JSON.stringify(decks, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const dlAnchor = document.createElement('a');
    dlAnchor.href = url;
    dlAnchor.download = `questionary-flashcard-decks-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(dlAnchor);
    dlAnchor.click();
    dlAnchor.remove();
    URL.revokeObjectURL(url);
    if (window.showNotification) window.showNotification('Flashcard decks exported!', 'success');
  }

  // Keyboard navigation for Study Mode & Modals
  window.addEventListener('keydown', (e) => {
    const studyModal = document.getElementById('studyModal');
    const isInput = Boolean(e.target && e.target.closest && e.target.closest('input, textarea, select, [contenteditable]'));

    if (studyModal && studyModal.classList.contains('active') && currentActiveDeck) {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeStudy();
        return;
      }
      if (isInput) return;

      if (e.code === 'Space' || e.key === 'Enter') {
        e.preventDefault();
        flipCard();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        nextCard();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        prevCard();
      } else if (e.key === 's' || e.key === 'S') {
        e.preventDefault();
        shuffleDeck();
      } else if (e.key === '1') {
        rateCard(0);
      } else if (e.key === '2') {
        rateCard(1);
      } else if (e.key === '3') {
        rateCard(2);
      } else if (e.key === '4') {
        rateCard(3);
      }
    }
  });

  function bindStaticControls() {
    const createBtn = document.getElementById('createDeckBtn');
    if (createBtn) createBtn.onclick = () => openEditor();

    const exportBtn = document.getElementById('exportDecksBtn');
    if (exportBtn) {
      exportBtn.onclick = () => {
        if (window.StudyImportExport) {
          window.StudyImportExport.openFlashcardsExport();
        } else {
          exportDecks();
        }
      };
    }

    const addCardBtn = document.getElementById('addCardBtn');
    if (addCardBtn) {
      addCardBtn.onclick = () => {
        const container = document.getElementById('cardsContainer');
        if (container) {
          addCardRow(container);
          const rows = container.querySelectorAll('.deck-card-row');
          rows[rows.length - 1]?.querySelector('.card-front-input')?.focus();
        }
      };
    }

    const closeFlashcardBtn = document.getElementById('closeFlashcardModal');
    if (closeFlashcardBtn) closeFlashcardBtn.onclick = closeEditor;

    const cancelFlashcardBtn = document.getElementById('cancelFlashcardBtn');
    if (cancelFlashcardBtn) cancelFlashcardBtn.onclick = closeEditor;

    const closeStudyBtn = document.getElementById('closeStudyModal');
    if (closeStudyBtn) closeStudyBtn.onclick = closeStudy;

    const closeQuizBtn = document.getElementById('closeQuizModal');
    if (closeQuizBtn) closeQuizBtn.onclick = closeQuiz;
  }

  // Global exports
  window.EnhancedFlashcards = {
    loadDecks,
    saveDecks,
    getDecks,
    renderDecks,
    startStudy,
    shuffleDeck,
    startQuiz,
    closeQuiz,
    openEditor,
    closeEditor,
    deleteDeck,
    exportDecks,
    flipCard,
    nextCard,
    prevCard,
    rateCard,
    speakFront,
    speakBack,
    closeStudy,
    filterSubject: (subj) => {
      selectedSubjectFilter = subj || 'all';
      renderDecks();
    }
  };

  window.renderFlashcardDecks = renderDecks;
  window.startStudyDeck = startStudy;
  window.shuffleStudyDeck = shuffleDeck;
  window.startQuiz = startQuiz;
  window.closeQuizModal = closeQuiz;
  window.openFlashcardModal = openEditor;
  window.deleteDeck = deleteDeck;
  window.closeStudyModal = closeStudy;

  loadDecks();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindStaticControls);
  } else {
    bindStaticControls();
  }
})();
