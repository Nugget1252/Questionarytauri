/* ==========================================================================
   QUESTIONARY STUDY ROOM ENHANCED ENGINE (v2.0)
   Pomodoro Workstation, Procedural Lo-Fi Soundscape Mixer, Study Goals
   ========================================================================== */

(function () {
  'use strict';

  // Audio Context for Ambient Procedural Sounds & Chimes
  let audioCtx = null;
  const activeSoundNodes = {};

  function getAudioContext() {
    if (!audioCtx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) audioCtx = new AudioContextClass();
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume().catch(() => {});
    }
    return audioCtx;
  }

  // Play gentle meditation chime on timer complete
  function playTimerChime() {
    const ctx = getAudioContext();
    if (!ctx) return;

    const freqs = [528, 660, 792, 1056]; // Solfeggio miracle tone harmonic
    freqs.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, ctx.currentTime + idx * 0.15);

      gain.gain.setValueAtTime(0, ctx.currentTime + idx * 0.15);
      gain.gain.linearRampToValueAtTime(0.18, ctx.currentTime + idx * 0.15 + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + idx * 0.15 + 2.8);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(ctx.currentTime + idx * 0.15);
      osc.stop(ctx.currentTime + idx * 0.15 + 3.0);
    });
  }

  // Procedural Sound Generator Engines (100% Offline, Zero Network Needed)
  const SoundGenerators = {
    // 1. Rain Sound (Filtered pink noise with random droplet modulation)
    rain: {
      active: false,
      volume: 0.5,
      start(ctx) {
        const bufferSize = ctx.sampleRate * 4;
        const buffer = ctx.createBuffer(2, bufferSize, ctx.sampleRate);
        for (let ch = 0; ch < 2; ch++) {
          const data = buffer.getChannelData(ch);
          let b0 = 0, b1 = 0, b2 = 0;
          for (let i = 0; i < bufferSize; i++) {
            const white = Math.random() * 2 - 1;
            b0 = 0.99886 * b0 + white * 0.0555;
            b1 = 0.99332 * b1 + white * 0.0750;
            b2 = 0.96900 * b2 + white * 0.1538;
            data[i] = (b0 + b1 + b2 + white * 0.5) * 0.06;
          }
        }
        const noise = ctx.createBufferSource();
        noise.buffer = buffer;
        noise.loop = true;

        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 1400;

        const gain = ctx.createGain();
        gain.gain.value = this.volume * 0.8;

        noise.connect(filter);
        filter.connect(gain);
        gain.connect(ctx.destination);
        noise.start();

        return { source: noise, gain };
      }
    },

    // 2. Ocean Waves (Swell modulated noise)
    ocean: {
      active: false,
      volume: 0.5,
      start(ctx) {
        const bufferSize = ctx.sampleRate * 3;
        const buffer = ctx.createBuffer(2, bufferSize, ctx.sampleRate);
        for (let ch = 0; ch < 2; ch++) {
          const data = buffer.getChannelData(ch);
          let last = 0;
          for (let i = 0; i < bufferSize; i++) {
            const white = Math.random() * 2 - 1;
            data[i] = (last + (0.02 * white)) / 1.02;
            last = data[i];
            data[i] *= 1.2;
          }
        }
        const noise = ctx.createBufferSource();
        noise.buffer = buffer;
        noise.loop = true;

        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 450;

        // LFO for surging wave swell
        const lfo = ctx.createOscillator();
        lfo.frequency.value = 0.12; // 8-second cycle
        const lfoGain = ctx.createGain();
        lfoGain.gain.value = 350;
        lfo.connect(filter.frequency);
        lfo.start();

        const gain = ctx.createGain();
        gain.gain.value = this.volume * 0.9;

        noise.connect(filter);
        filter.connect(gain);
        gain.connect(ctx.destination);
        noise.start();

        return { source: noise, lfo, gain };
      }
    },

    // 3. Binaural Beats (10Hz Alpha Waves for high-focus studying)
    binaural: {
      active: false,
      volume: 0.4,
      start(ctx) {
        // Base carrier 210Hz left, 220Hz right (10Hz Alpha beat)
        const merger = ctx.createChannelMerger(2);

        const oscL = ctx.createOscillator();
        oscL.type = 'sine';
        oscL.frequency.value = 200;

        const oscR = ctx.createOscillator();
        oscR.type = 'sine';
        oscR.frequency.value = 210;

        const gainL = ctx.createGain();
        gainL.gain.value = 0.5;
        const gainR = ctx.createGain();
        gainR.gain.value = 0.5;

        oscL.connect(gainL);
        gainL.connect(merger, 0, 0);

        oscR.connect(gainR);
        gainR.connect(merger, 0, 1);

        const masterGain = ctx.createGain();
        masterGain.gain.value = this.volume * 0.45;

        merger.connect(masterGain);
        masterGain.connect(ctx.destination);

        oscL.start();
        oscR.start();

        return { source: oscL, oscR, gain: masterGain };
      }
    },

    // 4. Campfire & Forest (Warm low rumble + crackle)
    campfire: {
      active: false,
      volume: 0.5,
      start(ctx) {
        const bufferSize = ctx.sampleRate * 2;
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
          // intermittent crackle pulses
          if (Math.random() < 0.003) {
            data[i] = (Math.random() * 2 - 1) * 0.9;
          } else {
            data[i] = (Math.random() * 2 - 1) * 0.04;
          }
        }
        const noise = ctx.createBufferSource();
        noise.buffer = buffer;
        noise.loop = true;

        const filter = ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.value = 1800;
        filter.Q.value = 1.8;

        const gain = ctx.createGain();
        gain.gain.value = this.volume * 0.8;

        noise.connect(filter);
        filter.connect(gain);
        gain.connect(ctx.destination);
        noise.start();

        return { source: noise, gain };
      }
    },

    // 5. Coffee Shop & Cafe Ambient Murmur
    cafe: {
      active: false,
      volume: 0.5,
      start(ctx) {
        const bufferSize = ctx.sampleRate * 3;
        const buffer = ctx.createBuffer(2, bufferSize, ctx.sampleRate);
        for (let ch = 0; ch < 2; ch++) {
          const data = buffer.getChannelData(ch);
          let val = 0;
          for (let i = 0; i < bufferSize; i++) {
            val += (Math.random() * 2 - 1) * 0.02;
            val = Math.max(-0.4, Math.min(0.4, val));
            data[i] = val;
          }
        }
        const noise = ctx.createBufferSource();
        noise.buffer = buffer;
        noise.loop = true;

        const filter = ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.value = 850;
        filter.Q.value = 1.0;

        const gain = ctx.createGain();
        gain.gain.value = this.volume * 0.8;

        noise.connect(filter);
        filter.connect(gain);
        gain.connect(ctx.destination);
        noise.start();

        return { source: noise, gain };
      }
    },

    // 6. Smooth Brown Noise
    brownnoise: {
      active: false,
      volume: 0.5,
      start(ctx) {
        const bufferSize = ctx.sampleRate * 3;
        const buffer = ctx.createBuffer(2, bufferSize, ctx.sampleRate);
        for (let ch = 0; ch < 2; ch++) {
          const data = buffer.getChannelData(ch);
          let last = 0;
          for (let i = 0; i < bufferSize; i++) {
            const white = Math.random() * 2 - 1;
            data[i] = (last + (0.02 * white)) / 1.02;
            last = data[i];
            data[i] *= 1.4;
          }
        }
        const noise = ctx.createBufferSource();
        noise.buffer = buffer;
        noise.loop = true;

        const gain = ctx.createGain();
        gain.gain.value = this.volume * 0.8;

        noise.connect(gain);
        gain.connect(ctx.destination);
        noise.start();

        return { source: noise, gain };
      }
    }
  };

  function toggleSound(soundKey) {
    const gen = SoundGenerators[soundKey];
    if (!gen) return;

    const ctx = getAudioContext();
    if (!ctx) return;

    if (gen.active && activeSoundNodes[soundKey]) {
      // Stop
      try {
        if (activeSoundNodes[soundKey].source) activeSoundNodes[soundKey].source.stop();
        if (activeSoundNodes[soundKey].oscR) activeSoundNodes[soundKey].oscR.stop();
        if (activeSoundNodes[soundKey].lfo) activeSoundNodes[soundKey].lfo.stop();
      } catch (e) {}
      delete activeSoundNodes[soundKey];
      gen.active = false;
    } else {
      // Start
      try {
        activeSoundNodes[soundKey] = gen.start(ctx);
        gen.active = true;
      } catch (err) {
        console.warn('Error starting sound generator:', err);
      }
    }

    updateSoundUI(soundKey);
  }

  function setSoundVolume(soundKey, vol) {
    const gen = SoundGenerators[soundKey];
    if (!gen) return;
    gen.volume = parseFloat(vol);
    if (activeSoundNodes[soundKey] && activeSoundNodes[soundKey].gain) {
      activeSoundNodes[soundKey].gain.gain.value = gen.volume * 0.8;
    }
  }

  function updateSoundUI(soundKey) {
    const channelEl = document.getElementById(`srSoundChannel_${soundKey}`);
    if (channelEl) {
      channelEl.classList.toggle('active', !!SoundGenerators[soundKey]?.active);
    }
  }

  // Pomodoro Focus Timer State
  let timerMode = 'work'; // 'work' (25m), 'shortBreak' (5m), 'longBreak' (15m), 'stopwatch'
  let timerDuration = 25 * 60; // in seconds
  let timerRemaining = 25 * 60;
  let timerInterval = null;
  let timerRunning = false;
  let todayStudyMinutes = parseInt(localStorage.getItem('questionary-study-today-min') || '0', 10);
  let completedPomodoros = parseInt(localStorage.getItem('questionary-study-completed-pomos') || '0', 10);

  // Study Goals Checklist
  let studyGoals = [];
  try {
    studyGoals = JSON.parse(localStorage.getItem('questionary-study-goals') || '[]');
  } catch (e) {}

  function saveStudyGoals() {
    try {
      localStorage.setItem('questionary-study-goals', JSON.stringify(studyGoals));
    } catch (e) {}
  }

  function formatTimeDigits(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }

  function syncFromSharedTimer(state) {
    if (!state && window.StudyRoomTimer) {
      state = window.StudyRoomTimer.getState();
    }
    if (!state) return;
    if (state.mode === 'short') timerMode = 'shortBreak';
    else if (state.mode === 'long') timerMode = 'longBreak';
    else timerMode = 'work';

    timerDuration = state.total || 25 * 60;
    timerRemaining = typeof state.remaining === 'number' ? state.remaining : timerDuration;
    timerRunning = !!state.running;
  }

  function setTimerMode(mode) {
    if (window.StudyRoomTimer && mode !== 'stopwatch') {
      pauseTimer();
      const mapped = mode === 'shortBreak' ? 'short' : (mode === 'longBreak' ? 'long' : 'work');
      window.StudyRoomTimer.setMode(mapped);
      syncFromSharedTimer();
      document.querySelectorAll('#srTabFocus .sr-pomo-mode-chip').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.mode === timerMode);
      });
      updateTimerDisplay();
      updatePlayPauseButton();
      return;
    }
    timerMode = mode;
    pauseTimer();
    if (mode === 'work') {
      timerDuration = 25 * 60;
    } else if (mode === 'shortBreak') {
      timerDuration = 5 * 60;
    } else if (mode === 'longBreak') {
      timerDuration = 15 * 60;
    } else if (mode === 'stopwatch') {
      timerDuration = 0;
      timerRemaining = 0;
    }
    timerRemaining = timerDuration;
    document.querySelectorAll('#srTabFocus .sr-pomo-mode-chip').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.mode === mode);
    });
    updateTimerDisplay();
  }

  function startTimer() {
    if (window.StudyRoomTimer && timerMode !== 'stopwatch') {
      getAudioContext();
      window.StudyRoomTimer.toggle();
      syncFromSharedTimer();
      updateTimerDisplay();
      updatePlayPauseButton();
      return;
    }
    if (timerRunning) return;
    getAudioContext();
    timerRunning = true;
    timerInterval = setInterval(() => {
      if (timerMode === 'stopwatch') {
        timerRemaining++;
        if (timerRemaining % 60 === 0) {
          todayStudyMinutes++;
          localStorage.setItem('questionary-study-today-min', todayStudyMinutes);
          updateStatsUI();
        }
      } else {
        if (timerRemaining > 0) {
          timerRemaining--;
          if ((timerDuration - timerRemaining) % 60 === 0) {
            todayStudyMinutes++;
            localStorage.setItem('questionary-study-today-min', todayStudyMinutes);
            updateStatsUI();
          }
        } else {
          pauseTimer();
          playTimerChime();
          if (timerMode === 'work') {
            completedPomodoros++;
            localStorage.setItem('questionary-study-completed-pomos', completedPomodoros);
            if (window.showNotification) window.showNotification('🎉 Focus session complete! Take a well-deserved break.', 'success');
          } else {
            if (window.showNotification) window.showNotification('Break finished! Ready for next session.', 'info');
          }
          updateStatsUI();
        }
      }
      updateTimerDisplay();
    }, 1000);
    updatePlayPauseButton();
  }

  function pauseTimer() {
    if (window.StudyRoomTimer && timerMode !== 'stopwatch') {
      const st = window.StudyRoomTimer.getState();
      if (st && st.running) window.StudyRoomTimer.toggle();
      syncFromSharedTimer();
    }
    timerRunning = false;
    clearInterval(timerInterval);
    timerInterval = null;
    updatePlayPauseButton();
  }

  function resetTimer() {
    if (window.StudyRoomTimer && timerMode !== 'stopwatch') {
      window.StudyRoomTimer.reset();
      syncFromSharedTimer();
      updateTimerDisplay();
      updatePlayPauseButton();
      return;
    }
    pauseTimer();
    timerRemaining = timerDuration;
    updateTimerDisplay();
  }

  function updateTimerDisplay() {
    if (timerMode !== 'stopwatch' && window.StudyRoomTimer) {
      syncFromSharedTimer();
    }
    const digitsEl = document.getElementById('srPomoDigitsDisplay');
    const ringEl = document.getElementById('srPomoProgRing');
    const statusEl = document.getElementById('srPomoStatusLabel');

    if (digitsEl) digitsEl.textContent = formatTimeDigits(timerRemaining);

    if (statusEl) {
      if (timerMode === 'work') statusEl.textContent = timerRunning ? 'Focusing...' : 'Ready to Focus';
      else if (timerMode === 'shortBreak') statusEl.textContent = 'Short Break';
      else if (timerMode === 'longBreak') statusEl.textContent = 'Long Break';
      else statusEl.textContent = 'Stopwatch Mode';
    }

    document.querySelectorAll('#srTabFocus .sr-pomo-mode-chip').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.mode === timerMode);
    });

    if (ringEl && timerDuration > 0) {
      const circumference = 2 * Math.PI * 86; // r=86
      const fraction = timerRemaining / timerDuration;
      ringEl.style.strokeDashoffset = (circumference * (1 - fraction)).toString();
    }
  }

  function updatePlayPauseButton() {
    const btn = document.getElementById('srPomoPlayPauseBtn');
    if (btn) {
      btn.innerHTML = timerRunning ? '<i class="fas fa-pause"></i> Pause' : '<i class="fas fa-play"></i> Start';
      btn.classList.toggle('btn-primary', !timerRunning);
      btn.classList.toggle('btn-secondary', timerRunning);
    }
  }

  function updateStatsUI() {
    const minsEl = document.getElementById('srTodayMinutesDisplay');
    const pomoEl = document.getElementById('srCompletedPomosDisplay');
    if (minsEl) minsEl.textContent = `${todayStudyMinutes}m`;
    if (pomoEl) pomoEl.textContent = completedPomodoros;
  }

  function stopAllSounds() {
    Object.keys(SoundGenerators).forEach(key => {
      if (activeSoundNodes[key]) {
        try {
          if (activeSoundNodes[key].source) activeSoundNodes[key].source.stop();
          if (activeSoundNodes[key].oscR) activeSoundNodes[key].oscR.stop();
          if (activeSoundNodes[key].lfo) activeSoundNodes[key].lfo.stop();
        } catch (e) {}
        delete activeSoundNodes[key];
      }
      SoundGenerators[key].active = false;
      updateSoundUI(key);
    });
  }

  // Render Focus Timer + Goals into the Study Room session sidebar Focus tab (#srTabFocus)
  function renderFocusPanel(focusTabEl) {
    if (!focusTabEl) return;
    const circumference = 2 * Math.PI * 86;

    focusTabEl.innerHTML = `
      <div class="sr-sidebar-scroll sr-focus-sidebar-wrap">
        <div class="sr-focus-card-header">
          <h3><i class="fas fa-stopwatch" style="color:var(--accent,#cf6215);"></i> Focus Timer</h3>
          <div style="font-size:0.75rem; color:var(--fg3,#71717a);">
            Today: <strong id="srTodayMinutesDisplay" style="color:var(--accent,#cf6215);">${todayStudyMinutes}m</strong>
          </div>
        </div>

        <div class="sr-pomo-modes">
          <button type="button" class="sr-pomo-mode-chip ${timerMode === 'work' ? 'active' : ''}" data-mode="work" onclick="window.StudyRoomEnhanced.setTimerMode('work')">25m Work</button>
          <button type="button" class="sr-pomo-mode-chip ${timerMode === 'shortBreak' ? 'active' : ''}" data-mode="shortBreak" onclick="window.StudyRoomEnhanced.setTimerMode('shortBreak')">5m Break</button>
          <button type="button" class="sr-pomo-mode-chip ${timerMode === 'longBreak' ? 'active' : ''}" data-mode="longBreak" onclick="window.StudyRoomEnhanced.setTimerMode('longBreak')">15m Break</button>
          <button type="button" class="sr-pomo-mode-chip ${timerMode === 'stopwatch' ? 'active' : ''}" data-mode="stopwatch" onclick="window.StudyRoomEnhanced.setTimerMode('stopwatch')">Stopwatch</button>
        </div>

        <div class="sr-pomo-circle-wrap sr-pomo-circle-compact">
          <svg class="sr-pomo-svg" viewBox="0 0 200 200">
            <circle class="sr-pomo-bg-ring" cx="100" cy="100" r="86"></circle>
            <circle class="sr-pomo-prog-ring" id="srPomoProgRing" cx="100" cy="100" r="86"
                    stroke-dasharray="${circumference}" stroke-dashoffset="0"></circle>
          </svg>
          <div class="sr-pomo-display">
            <span class="sr-pomo-digits" id="srPomoDigitsDisplay">${formatTimeDigits(timerRemaining)}</span>
            <span class="sr-pomo-status" id="srPomoStatusLabel">Ready to Focus</span>
          </div>
        </div>

        <div class="sr-pomo-controls">
          <button type="button" class="btn btn-primary" id="srPomoPlayPauseBtn" onclick="window.StudyRoomEnhanced.toggleTimer()" style="min-width:110px;">
            <i class="fas fa-play"></i> Start
          </button>
          <button type="button" class="btn btn-secondary" onclick="window.StudyRoomEnhanced.resetTimer()" title="Reset Timer">
            <i class="fas fa-redo"></i>
          </button>
        </div>

        <div class="sr-goals-container">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
            <span style="font-size:0.78rem; font-weight:700; color:var(--fg,#f4f4f5);"><i class="fas fa-tasks"></i> Study Session Goals</span>
            <span style="font-size:0.7rem; color:var(--fg3,#71717a);" id="srGoalsProgress"></span>
          </div>
          <div class="sr-goals-input-row">
            <input type="text" id="srNewGoalInput" placeholder="Add study target..." onkeydown="if(event.key==='Enter') window.StudyRoomEnhanced.addGoal()">
            <button type="button" class="btn btn-secondary btn-sm" onclick="window.StudyRoomEnhanced.addGoal()"><i class="fas fa-plus"></i></button>
          </div>
          <div class="sr-goals-list" id="srGoalsList"></div>
        </div>
      </div>
    `;

    renderGoalsList();
    updateTimerDisplay();
    updatePlayPauseButton();
  }

  // Render Ambient Soundscape Mixer into the Study Room session sidebar Audio tab (#srTabAmbience)
  function renderAmbiencePanel(ambTabEl) {
    if (!ambTabEl) return;

    ambTabEl.innerHTML = `
      <div class="sr-sidebar-scroll sr-focus-sidebar-wrap">
        <div class="sr-focus-card-header" style="margin-bottom:0.5rem;">
          <h3 style="font-size:0.95rem;"><i class="fas fa-headphones" style="color:var(--accent,#cf6215);"></i> Lo-Fi Soundscapes</h3>
          <span style="font-size:0.68rem; color:var(--fg3,#71717a);"><i class="fas fa-sliders-h"></i> Offline Mixer</span>
        </div>
        <p style="font-size:0.76rem; color:var(--fg2,#a1a1aa); margin-top:0; margin-bottom:0.85rem; line-height:1.4;">
          Mix ambient channels together for deep concentration while studying.
        </p>

        <div class="sr-soundscape-grid sr-soundscape-sidebar-grid">
          <div class="sr-sound-channel ${SoundGenerators.rain.active ? 'active' : ''}" id="srSoundChannel_rain">
            <button type="button" class="sr-sound-btn" onclick="window.StudyRoomEnhanced.toggleSound('rain')" title="Gentle Rain">
              <i class="fas fa-cloud-rain"></i>
            </button>
            <span class="sr-sound-name">Rain</span>
            <input type="range" class="sr-sound-slider" min="0" max="1" step="0.05" value="${SoundGenerators.rain.volume}"
                   oninput="window.StudyRoomEnhanced.setVolume('rain', this.value)">
          </div>

          <div class="sr-sound-channel ${SoundGenerators.cafe.active ? 'active' : ''}" id="srSoundChannel_cafe">
            <button type="button" class="sr-sound-btn" onclick="window.StudyRoomEnhanced.toggleSound('cafe')" title="Cafe Ambience">
              <i class="fas fa-coffee"></i>
            </button>
            <span class="sr-sound-name">Coffee Shop</span>
            <input type="range" class="sr-sound-slider" min="0" max="1" step="0.05" value="${SoundGenerators.cafe.volume}"
                   oninput="window.StudyRoomEnhanced.setVolume('cafe', this.value)">
          </div>

          <div class="sr-sound-channel ${SoundGenerators.ocean.active ? 'active' : ''}" id="srSoundChannel_ocean">
            <button type="button" class="sr-sound-btn" onclick="window.StudyRoomEnhanced.toggleSound('ocean')" title="Ocean Waves">
              <i class="fas fa-water"></i>
            </button>
            <span class="sr-sound-name">Ocean Waves</span>
            <input type="range" class="sr-sound-slider" min="0" max="1" step="0.05" value="${SoundGenerators.ocean.volume}"
                   oninput="window.StudyRoomEnhanced.setVolume('ocean', this.value)">
          </div>

          <div class="sr-sound-channel ${SoundGenerators.binaural.active ? 'active' : ''}" id="srSoundChannel_binaural">
            <button type="button" class="sr-sound-btn" onclick="window.StudyRoomEnhanced.toggleSound('binaural')" title="10Hz Alpha Waves">
              <i class="fas fa-brain"></i>
            </button>
            <span class="sr-sound-name">Alpha Beats</span>
            <input type="range" class="sr-sound-slider" min="0" max="1" step="0.05" value="${SoundGenerators.binaural.volume}"
                   oninput="window.StudyRoomEnhanced.setVolume('binaural', this.value)">
          </div>

          <div class="sr-sound-channel ${SoundGenerators.campfire.active ? 'active' : ''}" id="srSoundChannel_campfire">
            <button type="button" class="sr-sound-btn" onclick="window.StudyRoomEnhanced.toggleSound('campfire')" title="Campfire">
              <i class="fas fa-fire"></i>
            </button>
            <span class="sr-sound-name">Campfire</span>
            <input type="range" class="sr-sound-slider" min="0" max="1" step="0.05" value="${SoundGenerators.campfire.volume}"
                   oninput="window.StudyRoomEnhanced.setVolume('campfire', this.value)">
          </div>

          <div class="sr-sound-channel ${SoundGenerators.brownnoise.active ? 'active' : ''}" id="srSoundChannel_brownnoise">
            <button type="button" class="sr-sound-btn" onclick="window.StudyRoomEnhanced.toggleSound('brownnoise')" title="Brown Noise">
              <i class="fas fa-wind"></i>
            </button>
            <span class="sr-sound-name">Brown Noise</span>
            <input type="range" class="sr-sound-slider" min="0" max="1" step="0.05" value="${SoundGenerators.brownnoise.volume}"
                   oninput="window.StudyRoomEnhanced.setVolume('brownnoise', this.value)">
          </div>
        </div>
      </div>
    `;
  }

  function renderFocusDashboard() {
    const focusTabEl = document.getElementById('srTabFocus');
    const ambTabEl = document.getElementById('srTabAmbience');
    if (focusTabEl) renderFocusPanel(focusTabEl);
    if (ambTabEl) renderAmbiencePanel(ambTabEl);
  }

  function addGoal() {
    const input = document.getElementById('srNewGoalInput');
    const text = input?.value.trim();
    if (!text) return;
    studyGoals.push({ id: Date.now(), text, done: false });
    saveStudyGoals();
    input.value = '';
    renderGoalsList();
  }

  function toggleGoal(id) {
    const goal = studyGoals.find(g => g.id === id);
    if (goal) {
      goal.done = !goal.done;
      saveStudyGoals();
      renderGoalsList();
    }
  }

  function deleteGoal(id) {
    studyGoals = studyGoals.filter(g => g.id !== id);
    saveStudyGoals();
    renderGoalsList();
  }

  function renderGoalsList() {
    const listEl = document.getElementById('srGoalsList');
    const progressEl = document.getElementById('srGoalsProgress');
    if (!listEl) return;

    const doneCount = studyGoals.filter(g => g.done).length;
    if (progressEl) {
      progressEl.textContent = studyGoals.length > 0 ? `${doneCount}/${studyGoals.length} done` : '';
    }

    if (studyGoals.length === 0) {
      listEl.innerHTML = '<span style="font-size:0.75rem; color:var(--fg3,#71717a); text-align:center; padding:8px;">No goals set for this session yet.</span>';
      return;
    }

    listEl.innerHTML = studyGoals.map(g => `
      <div class="sr-goal-item ${g.done ? 'done' : ''}" data-goal-id="${escapeHtml(g.id)}">
        <label style="display:flex; align-items:center; gap:8px; cursor:pointer; flex:1;">
          <input type="checkbox" class="sr-goal-cb" ${g.done ? 'checked' : ''}>
          <span>${escapeHtml(g.text)}</span>
        </label>
        <button type="button" class="btn-icon delete sr-goal-delete" title="Delete goal">
          <i class="fas fa-times" style="font-size:0.7rem;"></i>
        </button>
      </div>
    `).join('');

    listEl.querySelectorAll('.sr-goal-item').forEach(el => {
      const gid = Number(el.dataset.goalId);
      el.querySelector('.sr-goal-cb')?.addEventListener('change', () => window.StudyRoomEnhanced.toggleGoal(gid));
      el.querySelector('.sr-goal-delete')?.addEventListener('click', () => window.StudyRoomEnhanced.deleteGoal(gid));
    });
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

  // Populate Focus & Audio tabs ONLY inside an active Study Room session (never in the lobby)
  function injectIntoStudyRoom() {
    const legacyDash = document.getElementById('studyRoomFocusDashboard');
    if (legacyDash) legacyDash.remove();

    const section = document.getElementById('studyRoomSection');
    if (!section) return;

    const activeSessionEl = section.querySelector('.sr-session');
    if (!activeSessionEl) return;

    renderFocusDashboard();
  }

  // Wrap renderStudyRoom cleanly
  const origRenderStudyRoom = window.renderStudyRoom;
  window.renderStudyRoom = function () {
    if (typeof origRenderStudyRoom === 'function') {
      try { origRenderStudyRoom(); } catch (e) {}
    }
    injectIntoStudyRoom();
  };

  document.addEventListener('studyroom:session-rendered', injectIntoStudyRoom);
  document.addEventListener('studyroom:timer-tick', (e) => {
    if (timerMode !== 'stopwatch') {
      syncFromSharedTimer(e.detail);
      if (timerRunning && timerDuration > 0 && (timerDuration - timerRemaining) > 0 && (timerDuration - timerRemaining) % 60 === 0) {
        todayStudyMinutes++;
        localStorage.setItem('questionary-study-today-min', todayStudyMinutes);
        updateStatsUI();
      }
      updateTimerDisplay();
      updatePlayPauseButton();
    }
  });
  document.addEventListener('studyroom:session-left', () => {
    clearInterval(timerInterval);
    timerInterval = null;
    timerRunning = false;
    stopAllSounds();
  });

  window.StudyRoomEnhanced = {
    setTimerMode,
    toggleTimer: () => {
      if (window.StudyRoomTimer && timerMode !== 'stopwatch') {
        getAudioContext();
        window.StudyRoomTimer.toggle();
        syncFromSharedTimer();
        updateTimerDisplay();
        updatePlayPauseButton();
        return;
      }
      if (timerRunning) pauseTimer(); else startTimer();
    },
    resetTimer,
    toggleSound,
    setVolume: setSoundVolume,
    stopAllSounds,
    addGoal,
    toggleGoal,
    deleteGoal,
    inject: injectIntoStudyRoom
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectIntoStudyRoom);
  } else {
    injectIntoStudyRoom();
  }
})();
