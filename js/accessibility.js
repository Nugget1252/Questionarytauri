/* ==========================================================================
   QUESTIONARY ACCESSIBILITY CONTROLLER (v2.0)
   Full Accessibility Toolbar, Dyslexic Font, Reading Guide, Text Scaling, Speech
   ========================================================================== */

(function () {
  'use strict';

  const SETTINGS_KEY = 'questionary-a11y-settings';
  const defaultSettings = {
    highContrast: false,
    largeText: false,
    reducedMotion: false,
    enhancedFocus: false,
    dyslexicFont: false,
    readingRuler: false,
    zoomLevel: 100 // 80 to 150%
  };

  let settings = Object.assign({}, defaultSettings);

  try {
    const saved = localStorage.getItem(SETTINGS_KEY);
    if (saved) settings = Object.assign({}, defaultSettings, JSON.parse(saved));
  } catch (e) {}

  function saveSettings() {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch (e) {}
  }

  // Reading Ruler Element
  let rulerEl = null;

  function initReadingRuler() {
    if (!rulerEl) {
      rulerEl = document.getElementById('readingRulerGuide');
      if (!rulerEl) {
        rulerEl = document.createElement('div');
        rulerEl.id = 'readingRulerGuide';
        document.body.appendChild(rulerEl);
      }
    }

    window.addEventListener('mousemove', (e) => {
      if (settings.readingRuler && rulerEl) {
        rulerEl.style.top = (e.clientY - 18) + 'px';
      }
    });
  }

  function applySettings() {
    document.body.classList.toggle('high-contrast', !!settings.highContrast);
    document.body.classList.toggle('large-text', !!settings.largeText);
    document.body.classList.toggle('reduced-motion', !!settings.reducedMotion);
    document.body.classList.toggle('enhanced-focus', !!settings.enhancedFocus);
    document.body.classList.toggle('dyslexic-font', !!settings.dyslexicFont);

    if (rulerEl) {
      rulerEl.style.display = settings.readingRuler ? 'block' : 'none';
    }

    const zoomPct = Math.min(150, Math.max(80, Number(settings.zoomLevel) || 100));
    const largeMultiplier = settings.largeText ? 1.15 : 1;
    const effectiveScale = (zoomPct / 100) * largeMultiplier;

    document.documentElement.style.setProperty('--text-scale', effectiveScale.toFixed(4));
    document.documentElement.style.fontSize = '';

    updateUI();
  }

  function updateUI() {
    const toggleMap = {
      highContrastToggle: settings.highContrast,
      largeTextToggle: settings.largeText,
      reducedMotionToggle: settings.reducedMotion,
      enhancedFocusToggle: settings.enhancedFocus,
      dyslexicToggle: settings.dyslexicFont,
      rulerToggle: settings.readingRuler
    };

    Object.keys(toggleMap).forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        const isActive = !!toggleMap[id];
        el.classList.toggle('active', isActive);
        const sw = el.querySelector('.accessibility-switch');
        if (sw) sw.classList.toggle('active', isActive);
      }
    });

    const zoomDisplay = document.getElementById('a11yZoomDisplay');
    if (zoomDisplay) zoomDisplay.textContent = `${settings.zoomLevel}%`;
  }

  function renderAccessibilityPanel() {
    const panel = document.getElementById('accessibilityPanel');
    if (!panel) return;

    panel.innerHTML = `
      <div class="accessibility-panel-header">
        <h3><i class="fas fa-universal-access"></i> Accessibility</h3>
        <button id="closeA11yBtn" style="background:transparent; border:none; color:var(--fg3, #71717a); cursor:pointer; font-size:0.9rem;">
          <i class="fas fa-times"></i>
        </button>
      </div>

      <!-- Text Zoom Granular Control -->
      <div class="a11y-zoom-controls">
        <span class="a11y-zoom-label">Text Zoom: <span id="a11yZoomDisplay">${settings.zoomLevel}%</span></span>
        <div class="a11y-zoom-btns">
          <button type="button" class="a11y-zoom-btn" id="a11yZoomDec" title="Decrease font size">-</button>
          <button type="button" class="a11y-zoom-btn" id="a11yZoomReset" title="Reset font size">100%</button>
          <button type="button" class="a11y-zoom-btn" id="a11yZoomInc" title="Increase font size">+</button>
        </div>
      </div>

      <div class="accessibility-option" id="highContrastToggle">
        <span class="accessibility-option-label"><i class="fas fa-adjust"></i> High Contrast</span>
        <div class="accessibility-switch"></div>
      </div>

      <div class="accessibility-option" id="largeTextToggle">
        <span class="accessibility-option-label"><i class="fas fa-font"></i> Large Text (+15%)</span>
        <div class="accessibility-switch"></div>
      </div>

      <div class="accessibility-option" id="dyslexicToggle">
        <span class="accessibility-option-label"><i class="fas fa-book-reader"></i> Dyslexic-Friendly Font</span>
        <div class="accessibility-switch"></div>
      </div>

      <div class="accessibility-option" id="rulerToggle">
        <span class="accessibility-option-label"><i class="fas fa-ruler-horizontal"></i> Reading Focus Ruler</span>
        <div class="accessibility-switch"></div>
      </div>

      <div class="accessibility-option" id="reducedMotionToggle">
        <span class="accessibility-option-label"><i class="fas fa-running"></i> Reduced Motion</span>
        <div class="accessibility-switch"></div>
      </div>

      <div class="accessibility-option" id="enhancedFocusToggle">
        <span class="accessibility-option-label"><i class="fas fa-bullseye"></i> Enhanced Focus Outlines</span>
        <div class="accessibility-switch"></div>
      </div>
    `;

    // Hook listeners
    document.getElementById('closeA11yBtn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      panel.classList.remove('active');
    });

    const bindToggle = (id, key) => {
      document.getElementById(id)?.addEventListener('click', (e) => {
        e.stopPropagation();
        settings[key] = !settings[key];
        saveSettings();
        applySettings();
      });
    };

    bindToggle('highContrastToggle', 'highContrast');
    bindToggle('largeTextToggle', 'largeText');
    bindToggle('dyslexicToggle', 'dyslexicFont');
    bindToggle('rulerToggle', 'readingRuler');
    bindToggle('reducedMotionToggle', 'reducedMotion');
    bindToggle('enhancedFocusToggle', 'enhancedFocus');

    // Zoom buttons
    document.getElementById('a11yZoomDec')?.addEventListener('click', (e) => {
      e.stopPropagation();
      settings.zoomLevel = Math.max(80, settings.zoomLevel - 10);
      saveSettings();
      applySettings();
    });

    document.getElementById('a11yZoomReset')?.addEventListener('click', (e) => {
      e.stopPropagation();
      settings.zoomLevel = 100;
      saveSettings();
      applySettings();
    });

    document.getElementById('a11yZoomInc')?.addEventListener('click', (e) => {
      e.stopPropagation();
      settings.zoomLevel = Math.min(150, settings.zoomLevel + 10);
      saveSettings();
      applySettings();
    });

    updateUI();
  }

  // Text to Speech Helper for notes and cards
  window.speakAccessibilityText = function (text) {
    if (!('speechSynthesis' in window)) return;
    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 0.95;
      utterance.pitch = 1.0;
      window.speechSynthesis.speak(utterance);
    } catch (e) {}
  };

  // Safe Setup on DOM ready
  function init() {
    initReadingRuler();
    renderAccessibilityPanel();
    applySettings();

    const toggleBtn = document.getElementById('accessibilityToggle');
    const panel = document.getElementById('accessibilityPanel');

    if (toggleBtn && panel) {
      // Clean, single toggle handler
      toggleBtn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        const isOpen = panel.classList.contains('active');
        if (isOpen) {
          panel.classList.remove('active');
        } else {
          // Close other popups
          document.querySelectorAll('.user-dropdown-menu.active').forEach(m => m.classList.remove('active'));
          panel.classList.add('active');
        }
      };
    }

    // Close when clicking outside
    document.addEventListener('click', (e) => {
      if (panel && panel.classList.contains('active')) {
        if (!e.target.closest('#accessibilityPanel') && !e.target.closest('#accessibilityToggle')) {
          panel.classList.remove('active');
        }
      }
    });

    // Close on Escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && panel && panel.classList.contains('active')) {
        panel.classList.remove('active');
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.AccessibilityManager = {
    settings,
    applySettings,
    saveSettings,
    speak: window.speakAccessibilityText
  };
})();
