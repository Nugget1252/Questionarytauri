/* ==========================================================================
   QUESTIONARY ENHANCED FLASHCARDS ENGINE (v2.0)
   3D Flipping, Spaced Repetition, ICSE Class 10 Decks, Audio TTS, Quiz Mode
   ========================================================================== */

(function () {
  'use strict';

  const STORAGE_KEY = 'questionary-flashcards';

  // High-Yield Pre-loaded ICSE Class 10 Decks
  const DEFAULT_DECKS = [
    {
      id: 'icse10_physics_force',
      name: 'Physics: Force, Work, Energy & Machines',
      subject: 'Physics',
      cards: [
        {
          front: 'State the Principle of Moments.',
          back: 'For an object in equilibrium, the sum of clockwise moments about any point is equal to the sum of anticlockwise moments about the same point.',
          hint: 'Equilibrium condition',
          mastery: 0
        },
        {
          front: 'What is the SI unit of Moment of Force?',
          back: 'Newton-metre (N·m). In CGS: dyne-cm. (1 N·m = 10^7 dyne-cm)',
          hint: 'Force × Perpendicular distance',
          mastery: 0
        },
        {
          front: 'Define Mechanical Advantage (M.A.) of a machine.',
          back: 'The ratio of the load (L) overcome by the machine to the effort (E) applied. M.A. = Load / Effort.',
          hint: 'Output force / Input force',
          mastery: 0
        },
        {
          front: 'What is the Velocity Ratio (V.R.) of a single fixed pulley?',
          back: 'V.R. = 1. (Distance moved by effort = Distance moved by load. It changes the direction of effort to a convenient direction).',
          hint: 'dE / dL',
          mastery: 0
        },
        {
          front: 'State the relationship between M.A., V.R. and Efficiency (η).',
          back: 'Mechanical Advantage = Velocity Ratio × Efficiency (M.A. = V.R. × η). For an ideal machine, η = 1 (100%), so M.A. = V.R.',
          hint: 'Output work / Input work',
          mastery: 0
        },
        {
          front: 'State the Work-Energy Theorem.',
          back: 'The work done on a body by a net force equals the change in its kinetic energy: W = ΔK = ½mv² - ½mu².',
          hint: 'W = Kf - Ki',
          mastery: 0
        },
        {
          front: 'Give an example of a Class 2 Lever and state why its M.A. > 1.',
          back: 'Nutcracker or Wheelbarrow. The load is situated between the fulcrum and effort, so the effort arm is always longer than the load arm (M.A. = Effort Arm / Load Arm > 1).',
          hint: 'Load in middle',
          mastery: 0
        }
      ],
      lastStudied: null
    },
    {
      id: 'icse10_chem_periodic',
      name: 'Chemistry: Periodic Properties & Bonding',
      subject: 'Chemistry',
      cards: [
        {
          front: 'How does Electronegativity vary across a period from left to right?',
          back: 'Electronegativity increases across a period due to increased nuclear charge and decreasing atomic radius, attracting shared pairs more strongly.',
          hint: 'Tendency to attract shared electrons',
          mastery: 0
        },
        {
          front: 'Define Electron Affinity.',
          back: 'The amount of energy released when an electron is added to an isolated gaseous atom to form a univalent negative ion (anion). Unit: kJ/mol or eV.',
          hint: 'Energy released on gaining electron',
          mastery: 0
        },
        {
          front: 'Which group has the highest ionization potential in any period?',
          back: 'Group 18 (Noble Gases), because they possess completely filled stable octet or duplet electronic configurations.',
          hint: 'Inert gases',
          mastery: 0
        },
        {
          front: 'Define a Coordinate (Dative) Covalent Bond with an example.',
          back: 'A covalent bond in which both the shared electrons are contributed by only one of the combining atoms. Example: Ammonium ion (NH4+) or Hydronium ion (H3O+).',
          hint: 'Lone pair donation',
          mastery: 0
        },
        {
          front: 'Why do electrovalent compounds have high melting and boiling points?',
          back: 'Because strong electrostatic forces of attraction bind oppositely charged ions tightly in the crystal lattice, requiring high thermal energy to overcome.',
          hint: 'Ionic lattice attraction',
          mastery: 0
        }
      ],
      lastStudied: null
    },
    {
      id: 'icse10_bio_cell',
      name: 'Biology: Cell Cycle, Mitosis & Genetics',
      subject: 'Biology',
      cards: [
        {
          front: 'Name the four consecutive phases of Karyokinesis in Mitosis.',
          back: '1. Prophase (Chromatin condenses, spindle forms)\n2. Metaphase (Chromosomes align at equator)\n3. Anaphase (Sister chromatids separate to opposite poles)\n4. Telophase (Nuclear membrane reforms).',
          hint: 'PMAT',
          mastery: 0
        },
        {
          front: 'What is the phenotypic and genotypic ratio of a Monohybrid Cross (F2 generation)?',
          back: 'Phenotypic Ratio = 3 : 1 (Tall : Dwarf)\nGenotypic Ratio = 1 : 2 : 1 (TT : Tt : tt).',
          hint: 'Mendel tall vs dwarf',
          mastery: 0
        },
        {
          front: 'State Mendel\'s Law of Segregation.',
          back: 'The two alleles of a gene pair separate during gamete formation, so that each gamete carries only one allele for each gene.',
          hint: 'Purity of gametes',
          mastery: 0
        },
        {
          front: 'What is Crossing Over and in which stage of meiosis does it occur?',
          back: 'Exchange of genetic material between non-sister chromatids of homologous chromosomes. It occurs during the Pachytene stage of Prophase I in Meiosis.',
          hint: 'Genetic recombination in gametes',
          mastery: 0
        }
      ],
      lastStudied: null
    },
    {
      id: 'icse10_comp_java',
      name: 'Computer Applications: Java OOPs & Arrays',
      subject: 'Computer Applications',
      cards: [
        {
          front: 'Name the four fundamental pillars of Object-Oriented Programming (OOP).',
          back: '1. Encapsulation (Data hiding & binding)\n2. Abstraction (Hiding implementation details)\n3. Inheritance (Code reusability)\n4. Polymorphism (Multiple forms: overloading & overriding).',
          hint: 'EAIP',
          mastery: 0
        },
        {
          front: 'What is the difference between = and == operators in Java?',
          back: '\'=\' is the assignment operator (assigns value from right to left).\n\'==\' is the relational equality operator (compares values or object references and returns boolean true/false).',
          hint: 'Assignment vs comparison',
          mastery: 0
        },
        {
          front: 'What prerequisite is required before performing Binary Search on an array?',
          back: 'The array elements must be sorted in either ascending or descending order.',
          hint: 'Order condition',
          mastery: 0
        },
        {
          front: 'Explain the function of String.substring(int startIndex, int endIndex).',
          back: 'Returns a new substring starting from startIndex (inclusive) up to endIndex (exclusive).',
          hint: 'Include start, exclude end',
          mastery: 0
        }
      ],
      lastStudied: null
    }
  ];

  let decks = [];
  let currentActiveDeck = null;
  let studyCards = [];
  let isShuffled = false;
  let currentCardIndex = 0;
  let isCardFlipped = false;
  let selectedSubjectFilter = 'all';
  let _cardResetRaf = null;

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
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          decks = parsed;
          return;
        }
      }
    } catch (e) {}
    decks = JSON.parse(JSON.stringify(DEFAULT_DECKS));
    saveDecks();
  }

  function saveDecks() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(decks));
      window.flashcardDecks = decks;
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

  // Calculate mastery percentage for a deck
  function calculateMastery(deck) {
    if (!deck.cards || deck.cards.length === 0) return 0;
    const totalMastery = deck.cards.reduce((sum, c) => sum + (c.mastery || 0), 0);
    const maxPossible = deck.cards.length * 3; // 0 to 3 scale
    return Math.round((totalMastery / maxPossible) * 100);
  }

  // Render Flashcard Decks in the main view
  function renderDecks() {
    loadDecks();
    const container = document.getElementById('flashcardsGrid');
    if (!container) return;

    // Filter by subject
    let filtered = decks;
    if (selectedSubjectFilter !== 'all') {
      filtered = decks.filter(d => (d.subject || '').toLowerCase() === selectedSubjectFilter.toLowerCase());
    }

    // Render header toolbar if not present
    let headerBar = document.getElementById('flashcardsHeaderBar');
    if (!headerBar) {
      headerBar = document.createElement('div');
      headerBar.id = 'flashcardsHeaderBar';
      headerBar.className = 'flashcards-header-bar';
      container.parentElement.insertBefore(headerBar, container);
    }

    const subjects = ['All', 'Physics', 'Chemistry', 'Biology', 'Computer Applications', 'Mathematics'];
    headerBar.innerHTML = `
      <div class="flashcards-filters">
        ${subjects.map(s => `
          <button type="button" class="subject-chip ${selectedSubjectFilter.toLowerCase() === s.toLowerCase() ? 'active' : ''}" 
                  onclick="window.EnhancedFlashcards.filterSubject('${s.toLowerCase()}')">
            ${s}
          </button>
        `).join('')}
      </div>
      <div style="display:flex; gap:8px;">
        <button type="button" class="btn btn-secondary btn-sm" onclick="window.EnhancedFlashcards.exportDecks()" title="Export Decks Backup">
          <i class="fas fa-file-export"></i> Export
        </button>
        <button type="button" class="btn btn-primary btn-sm" onclick="window.EnhancedFlashcards.openEditor()" title="Create New Deck">
          <i class="fas fa-plus"></i> New Deck
        </button>
      </div>
    `;

    if (filtered.length === 0) {
      container.innerHTML = `
        <div style="grid-column: 1 / -1; text-align: center; padding: 3rem 1rem; color: var(--fg2, #a1a1aa);">
          <i class="fas fa-layer-group" style="font-size: 2.5rem; color: var(--fg3, #71717a); margin-bottom: 12px; display:block;"></i>
          <p style="font-size: 1rem; margin-bottom: 8px;">No flashcard decks found in this category.</p>
          <button class="btn btn-primary btn-sm" onclick="window.EnhancedFlashcards.openEditor()">Create Deck</button>
        </div>
      `;
      return;
    }

    container.innerHTML = filtered.map(deck => {
      const masteryPct = calculateMastery(deck);
      const cardCount = deck.cards ? deck.cards.length : 0;
      return `
        <div class="deck-card" data-deck-id="${escapeHtml(deck.id)}">
          <div class="deck-badge-row">
            <span class="deck-subject-badge">${escapeHtml(deck.subject || 'General')}</span>
            <div style="display: flex; gap: 6px;">
              <button type="button" class="btn-icon ef-edit-deck" title="Edit Deck">
                <i class="fas fa-edit"></i>
              </button>
              <button type="button" class="btn-icon delete ef-delete-deck" title="Delete Deck">
                <i class="fas fa-trash"></i>
              </button>
            </div>
          </div>

          <h4 style="margin: 4px 0 8px 0; font-size: 1.05rem; font-weight: 700; color: var(--fg, #f4f4f5);">${escapeHtml(deck.name)}</h4>
          <p style="font-size: 0.78rem; color: var(--fg3, #71717a); margin: 0 0 10px 0;">${cardCount} ${cardCount === 1 ? 'flashcard' : 'flashcards'}</p>

          <div class="deck-mastery-container">
            <div class="deck-mastery-label">
              <span>Mastery</span>
              <span>${masteryPct}%</span>
            </div>
            <div class="deck-mastery-bar">
              <div class="deck-mastery-fill" style="width: ${masteryPct}%;"></div>
            </div>
          </div>

          <div style="display: flex; gap: 6px; flex-wrap: wrap; margin-top: auto; padding-top: 10px;">
            <button type="button" class="btn btn-primary btn-sm ef-study-deck" style="flex: 1;">
              <i class="fas fa-play"></i> Study
            </button>
            <button type="button" class="btn btn-secondary btn-sm ef-shuffle-deck" title="Shuffle & Study in Random Order">
              <i class="fas fa-random"></i> Shuffle
            </button>
            <button type="button" class="btn btn-secondary btn-sm ef-quiz-deck" style="flex: 1;">
              <i class="fas fa-question-circle"></i> Quiz
            </button>
          </div>
        </div>
      `;
    }).join('');

    container.querySelectorAll('.deck-card').forEach(card => {
      const did = card.dataset.deckId;
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

  // Open 3D Study Session Modal
  function startStudy(deckId, options = {}) {
    loadDecks();
    const deck = decks.find(d => String(d.id) === String(deckId));
    if (!deck || !deck.cards || deck.cards.length === 0) {
      if (window.showNotification) window.showNotification('This deck has no cards to study.', 'warning');
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

    if (modalHeader) {
      modalHeader.innerHTML = `
        <h3><i class="fas fa-graduation-cap"></i> ${escapeHtml(currentActiveDeck.name)}</h3>
        <div style="display:flex; align-items:center; gap:12px;">
          <span style="font-size:0.8rem; font-weight:700; color:var(--accent, #cf6215);">Card ${currentCardIndex + 1} of ${total}${isShuffled ? ' · Shuffled' : ''}</span>
          <button class="modal-close" onclick="window.EnhancedFlashcards.closeStudy()"><i class="fas fa-times"></i></button>
        </div>
      `;
    }

    modalBody.innerHTML = `
      <div style="width: 100%; max-width: 580px; margin: 0 auto;">
        <!-- Progress Bar -->
        <div style="height: 6px; background: var(--bg, #111113); border-radius: 3px; overflow: hidden; margin-bottom: 1rem;">
          <div style="height: 100%; width: ${((currentCardIndex + 1) / total) * 100}%; background: var(--accent, #cf6215); transition: width 0.25s;"></div>
        </div>

        <!-- 3D Flip Card -->
        <div class="flashcard-3d-wrapper" onclick="window.EnhancedFlashcards.flipCard()">
          <div class="flashcard-3d-card no-transition ${isCardFlipped ? 'flipped' : ''}" id="flashcard3dCard">
            <!-- Front Face -->
            <div class="flashcard-face front">
              <span class="card-tag-pill">Question</span>
              <button class="card-tts-btn" onclick="event.stopPropagation(); window.EnhancedFlashcards.speakFront()" title="Read aloud">
                <i class="fas fa-volume-up"></i>
              </button>
              <div class="card-content-text">${escapeHtml(card.front)}</div>
              ${card.hint ? `<div style="font-size:0.75rem; color:var(--fg3,#71717a); margin-top:8px;"><i class="fas fa-lightbulb"></i> Hint: ${escapeHtml(card.hint)}</div>` : ''}
              <div class="card-flip-prompt"><i class="fas fa-sync-alt"></i> Click card or press Space to reveal answer</div>
            </div>

            <!-- Back Face -->
            <div class="flashcard-face back">
              <span class="card-tag-pill" style="color:#10b981; background:rgba(16,185,129,0.12);">Answer</span>
              <button class="card-tts-btn" onclick="event.stopPropagation(); window.EnhancedFlashcards.speakBack()" title="Read aloud">
                <i class="fas fa-volume-up"></i>
              </button>
              <div class="card-content-text" style="white-space:pre-line;">${escapeHtml(card.back)}</div>
              <div class="card-flip-prompt"><i class="fas fa-sync-alt"></i> Click card to flip back</div>
            </div>
          </div>
        </div>

        <!-- Spaced Repetition Buttons -->
        <div class="study-rating-grid">
          <button type="button" class="rating-btn again" onclick="window.EnhancedFlashcards.rateCard(0)">
            <span class="label">Again (1)</span>
            <span class="sub">Needs Review</span>
          </button>
          <button type="button" class="rating-btn hard" onclick="window.EnhancedFlashcards.rateCard(1)">
            <span class="label">Hard (2)</span>
            <span class="sub">Struggled</span>
          </button>
          <button type="button" class="rating-btn good" onclick="window.EnhancedFlashcards.rateCard(2)">
            <span class="label">Good (3)</span>
            <span class="sub">Recalled</span>
          </button>
          <button type="button" class="rating-btn easy" onclick="window.EnhancedFlashcards.rateCard(3)">
            <span class="label">Easy (4)</span>
            <span class="sub">Mastered</span>
          </button>
        </div>
      </div>
    `;

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

    // Modal Footer with navigation & shuffle
    const modalFooter = modal.querySelector('.modal-footer');
    if (modalFooter) {
      modalFooter.innerHTML = `
        <div style="display:flex; justify-content:space-between; width:100%; align-items:center; flex-wrap:wrap; gap:8px;">
          <button type="button" class="btn btn-secondary btn-sm" onclick="window.EnhancedFlashcards.prevCard()" ${currentCardIndex === 0 ? 'disabled' : ''}>
            <i class="fas fa-arrow-left"></i> Previous
          </button>
          <div style="display:flex; align-items:center; gap:8px;">
            <button type="button" class="btn btn-primary btn-sm" onclick="window.EnhancedFlashcards.flipCard()">
              <i class="fas fa-sync-alt"></i> Flip Card (Space)
            </button>
            <button type="button" class="btn btn-secondary btn-sm ef-shuffle-btn ${isShuffled ? 'active' : ''}" onclick="window.EnhancedFlashcards.shuffleDeck()" ${total < 2 ? 'disabled' : ''} title="Shuffle cards in this deck (S)">
              <i class="fas fa-random"></i> Shuffle
            </button>
          </div>
          <button type="button" class="btn btn-secondary btn-sm" onclick="window.EnhancedFlashcards.nextCard()">
            Next <i class="fas fa-arrow-right"></i>
          </button>
        </div>
      `;
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
    studyCards[currentCardIndex].mastery = ratingLevel;
    saveDecks();
    nextCard();
  }

  function speakFront() {
    if (!currentActiveDeck) return;
    const text = studyCards[currentCardIndex]?.front;
    if (text && window.AccessibilityManager) window.AccessibilityManager.speak(text);
  }

  function speakBack() {
    if (!currentActiveDeck) return;
    const text = studyCards[currentCardIndex]?.back;
    if (text && window.AccessibilityManager) window.AccessibilityManager.speak(text);
  }

  function showCompletionScreen() {
    const modal = document.getElementById('studyModal');
    if (!modal || !currentActiveDeck) return;

    const masteryPct = calculateMastery(currentActiveDeck);
    const modalBody = modal.querySelector('.modal-body');
    const modalFooter = modal.querySelector('.modal-footer');

    modalBody.innerHTML = `
      <div style="text-align: center; padding: 2rem 1rem;">
        <div style="width: 72px; height: 72px; border-radius: 50%; background: rgba(16,185,129,0.15); color: #10b981; display:flex; align-items:center; justify-content:center; font-size:2.2rem; margin:0 auto 1.2rem auto;">
          <i class="fas fa-check-circle"></i>
        </div>
        <h3 style="margin: 0 0 8px 0; color: var(--fg, #f4f4f5);">Deck Complete!</h3>
        <p style="font-size: 0.9rem; color: var(--fg2, #a1a1aa); margin-bottom: 1.5rem;">
          Great job! You reviewed all ${currentActiveDeck.cards.length} cards in <strong>${escapeHtml(currentActiveDeck.name)}</strong>.
        </p>
        <div style="max-width: 300px; margin: 0 auto 1.5rem auto; background: var(--bg, #111113); border: 1px solid var(--line, #2e3035); border-radius: 12px; padding: 12px 18px;">
          <div style="display:flex; justify-content:space-between; font-size:0.85rem; margin-bottom:6px;">
            <span>Deck Mastery</span>
            <span style="font-weight:700; color:var(--accent, #cf6215);">${masteryPct}%</span>
          </div>
          <div class="deck-mastery-bar">
            <div class="deck-mastery-fill" style="width: ${masteryPct}%;"></div>
          </div>
        </div>
      </div>
    `;

    if (modalFooter) {
      const finishedDeckId = currentActiveDeck.id;
      modalFooter.innerHTML = `
        <div style="display:flex; gap:10px; width:100%; justify-content:center; flex-wrap:wrap;">
          <button type="button" class="btn btn-secondary ef-finish-close">Close</button>
          <button type="button" class="btn btn-secondary ef-finish-shuffle">
            <i class="fas fa-random"></i> Shuffle & Review
          </button>
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
    const modal = document.getElementById('studyModal');
    if (modal) modal.classList.remove('active');
    currentActiveDeck = null;
    studyCards = [];
    isShuffled = false;
    renderDecks();
  }

  // Quiz Mode
  function startQuiz(deckId) {
    loadDecks();
    const deck = decks.find(d => String(d.id) === String(deckId));
    if (!deck || !deck.cards || deck.cards.length < 2) {
      if (window.showNotification) window.showNotification('At least 2 cards are required for Quiz Mode.', 'warning');
      return;
    }

    const modal = document.getElementById('quizModal');
    if (!modal) return;

    let quizIndex = 0;
    let score = 0;
    const questions = [...deck.cards].sort(() => 0.5 - Math.random());

    function renderQuizQuestion() {
      if (quizIndex >= questions.length) {
        // Quiz completed
        modal.querySelector('.modal-body').innerHTML = `
          <div style="text-align: center; padding: 2rem 1rem;">
            <i class="fas fa-trophy" style="font-size: 3rem; color: #f59e0b; margin-bottom: 1rem;"></i>
            <h3 style="color:var(--fg, #f4f4f5);">Quiz Completed!</h3>
            <p style="font-size:1.1rem; color:var(--fg2, #a1a1aa); margin-top:8px;">
              You scored <strong>${score}</strong> out of <strong>${questions.length}</strong>!
            </p>
          </div>
        `;
        modal.querySelector('.modal-footer').innerHTML = `
          <button class="btn btn-primary" onclick="document.getElementById('quizModal').classList.remove('active')">Done</button>
        `;
        return;
      }

      const q = questions[quizIndex];
      // Generate 3 distractors
      const otherAnswers = deck.cards.filter(c => c.back !== q.back).map(c => c.back);
      const distractors = otherAnswers.sort(() => 0.5 - Math.random()).slice(0, 3);
      const choices = [q.back, ...distractors].sort(() => 0.5 - Math.random());

      modal.querySelector('.modal-header h3').innerHTML = `<i class="fas fa-question-circle"></i> Quiz: Question ${quizIndex + 1} of ${questions.length}`;
      modal.querySelector('.modal-body').innerHTML = `
        <div style="max-width: 520px; margin: 0 auto;">
          <h4 style="font-size: 1.15rem; color: var(--fg, #f4f4f5); margin-bottom: 1.5rem; text-align: center;">${escapeHtml(q.front)}</h4>
          <div style="display: flex; flex-direction: column; gap: 10px;">
            ${choices.map((choice, i) => `
              <button type="button" class="btn btn-secondary quiz-opt-btn" style="text-align: left; padding: 12px 16px; font-size: 0.88rem; justify-content: flex-start; line-height: 1.4;"
                      data-ans="${escapeHtml(choice)}">
                <strong style="margin-right: 8px; color: var(--accent, #cf6215);">${String.fromCharCode(65 + i)}.</strong>
                <span>${escapeHtml(choice)}</span>
              </button>
            `).join('')}
          </div>
          <div id="quizFeedback" style="margin-top: 1rem; font-size: 0.88rem; font-weight: 600; text-align: center; min-height: 24px;"></div>
        </div>
      `;

      modal.querySelectorAll('.quiz-opt-btn').forEach(btn => {
        btn.onclick = () => {
          const selected = btn.dataset.ans;
          const feedback = document.getElementById('quizFeedback');
          modal.querySelectorAll('.quiz-opt-btn').forEach(b => b.disabled = true);

          if (selected === q.back) {
            score++;
            btn.style.borderColor = '#10b981';
            btn.style.background = 'rgba(16,185,129,0.15)';
            feedback.innerHTML = '<span style="color:#10b981;"><i class="fas fa-check"></i> Correct!</span>';
          } else {
            btn.style.borderColor = '#ef4444';
            btn.style.background = 'rgba(239,68,68,0.15)';
            feedback.innerHTML = `<span style="color:#ef4444;"><i class="fas fa-times"></i> Incorrect. Correct: ${escapeHtml(q.back)}</span>`;
          }

          setTimeout(() => {
            quizIndex++;
            renderQuizQuestion();
          }, 1200);
        };
      });
    }

    renderQuizQuestion();
    modal.classList.add('active');
  }

  // Create / Edit Deck Modal
  function openEditor(deckId = null) {
    loadDecks();
    const modal = document.getElementById('flashcardModal');
    if (!modal) return;

    let targetDeck = deckId ? decks.find(d => String(d.id) === String(deckId)) : null;

    const modalTitle = document.getElementById('flashcardModalTitle');
    const nameInput = document.getElementById('deckName');
    const subjectSelect = document.getElementById('deckSubject');
    const cardsContainer = document.getElementById('cardsContainer');

    if (modalTitle) modalTitle.innerHTML = targetDeck ? '<i class="fas fa-edit"></i> Edit Deck' : '<i class="fas fa-layer-group"></i> Create Flashcard Deck';
    if (nameInput) nameInput.value = targetDeck ? targetDeck.name : '';
    if (subjectSelect) subjectSelect.value = targetDeck ? (targetDeck.subject || 'physics').toLowerCase() : 'physics';

    if (cardsContainer) {
      cardsContainer.innerHTML = '';
      if (targetDeck && targetDeck.cards && targetDeck.cards.length > 0) {
        targetDeck.cards.forEach(c => addCardRow(cardsContainer, c.front, c.back, c.hint));
      } else {
        addCardRow(cardsContainer);
      }
    }

    const saveBtn = document.getElementById('saveDeckBtn');
    if (saveBtn) {
      saveBtn.onclick = () => {
        const name = nameInput.value.trim();
        const subject = subjectSelect ? subjectSelect.value : 'General';
        if (!name) {
          if (window.showNotification) window.showNotification('Please provide a deck name.', 'warning');
          return;
        }

        const cards = [];
        cardsContainer.querySelectorAll('.deck-card-row').forEach(row => {
          const front = row.querySelector('.card-front-input')?.value.trim();
          const back = row.querySelector('.card-back-input')?.value.trim();
          const hint = row.querySelector('.card-hint-input')?.value.trim();
          if (front && back) {
            cards.push({ front, back, hint: hint || '', mastery: 0 });
          }
        });

        if (cards.length === 0) {
          if (window.showNotification) window.showNotification('Please add at least one complete card (question and answer).', 'warning');
          return;
        }

        if (targetDeck) {
          targetDeck.name = name;
          targetDeck.subject = subject.charAt(0).toUpperCase() + subject.slice(1);
          targetDeck.cards = cards;
        } else {
          decks.push({
            id: 'deck_' + Date.now(),
            name,
            subject: subject.charAt(0).toUpperCase() + subject.slice(1),
            cards,
            lastStudied: null
          });
        }

        saveDecks();
        renderDecks();
        modal.classList.remove('active');
        if (window.showNotification) window.showNotification('Flashcard deck saved!', 'success');
      };
    }

    modal.classList.add('active');
  }

  function addCardRow(container, front = '', back = '', hint = '') {
    const row = document.createElement('div');
    row.className = 'deck-card-row';
    row.style.cssText = 'background:var(--bg,#111113); border:1px solid var(--line,#2e3035); border-radius:10px; padding:10px; margin-bottom:10px; display:flex; flex-direction:column; gap:8px; position:relative;';
    row.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <span style="font-size:0.75rem; font-weight:700; color:var(--accent,#cf6215);">Card Item</span>
        <button type="button" class="btn-icon delete" onclick="this.closest('.deck-card-row').remove()" title="Remove card">
          <i class="fas fa-trash"></i>
        </button>
      </div>
      <input type="text" class="card-front-input form-input" placeholder="Question / Front" value="${escapeHtml(front)}">
      <textarea class="card-back-input form-input" placeholder="Answer / Back" rows="2">${escapeHtml(back)}</textarea>
      <input type="text" class="card-hint-input form-input" placeholder="Optional Hint" value="${escapeHtml(hint)}" style="font-size:0.78rem;">
    `;
    container.appendChild(row);
  }

  function deleteDeck(deckId) {
    loadDecks();
    const deck = decks.find(d => String(d.id) === String(deckId));
    if (!deck) return;

    if (window.confirm(`Delete the deck "${deck.name}"?`)) {
      decks = decks.filter(d => String(d.id) !== String(deckId));
      saveDecks();
      renderDecks();
      if (window.showNotification) window.showNotification('Deck deleted', 'info');
    }
  }

  function exportDecks() {
    loadDecks();
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(decks, null, 2));
    const dlAnchor = document.createElement('a');
    dlAnchor.setAttribute('href', dataStr);
    dlAnchor.setAttribute('download', `questionary-flashcard-decks-${new Date().toISOString().slice(0, 10)}.json`);
    document.body.appendChild(dlAnchor);
    dlAnchor.click();
    dlAnchor.remove();
  }

  // Keyboard navigation for Study Mode
  window.addEventListener('keydown', (e) => {
    const studyModal = document.getElementById('studyModal');
    if (!studyModal || !studyModal.classList.contains('active') || !currentActiveDeck) return;
    if (e.target && e.target.closest && e.target.closest('input, textarea, [contenteditable]')) return;

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
  });

  // Global exports & overrides for compatibility with app.js
  window.EnhancedFlashcards = {
    loadDecks,
    saveDecks,
    renderDecks,
    startStudy,
    shuffleDeck,
    startQuiz,
    openEditor,
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
      selectedSubjectFilter = subj;
      renderDecks();
    }
  };

  // Wire into app.js hooks
  window.renderFlashcardDecks = renderDecks;
  window.startStudyDeck = startStudy;
  window.startQuiz = startQuiz;
  window.openFlashcardModal = openEditor;
  window.deleteDeck = deleteDeck;

  // Add Card button in modal
  document.getElementById('addCardBtn')?.addEventListener('click', () => {
    const container = document.getElementById('cardsContainer');
    if (container) addCardRow(container);
  });
  document.getElementById('createDeckBtn')?.addEventListener('click', () => openEditor());
  document.getElementById('closeStudyModal')?.addEventListener('click', closeStudy);
  document.getElementById('closeFlashcardModal')?.addEventListener('click', () => {
    document.getElementById('flashcardModal')?.classList.remove('active');
  });
})();
