/* =========================================================================
 *   QUESTIONARY STUDY ROOM ENGINE v5.5 (Fixed Cloud Signaling)
 *   ========================================================================= */

(function () {
  'use strict';

  /* ---------- Constants & Ice Servers ---------- */
  const MAX_PARTICIPANTS = 12;
  const ROOM_CODE_LENGTH = 10;
  const ROOM_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const CONNECT_TIMEOUT_MS = 25000;

  /* STUN + Free OpenRelay TURN Servers */
  const ICE_CONFIG = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun.cloudflare.com:3478' },
      {
        urls: [
          'turn:openrelay.metered.ca:80',
          'turn:openrelay.metered.ca:443',
          'turn:openrelay.metered.ca:443?transport=tcp'
        ],
        username: 'openrelay',
        credential: 'openrelay'
      }
    ],
    sdpSemantics: 'unified-plan',
    iceCandidatePoolSize: 2
  };

  /* Native PeerJS Cloud Options (DO NOT override path with '/') */
  const PEER_OPTIONS = {
    config: ICE_CONFIG,
    debug: 1
  };

  /* ---------- Zero-Asset Audio Synthesizer ---------- */
  const SoundFX = {
    ctx: null,
    init() {
      if (!this.ctx) {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (AudioCtx) this.ctx = new AudioCtx();
      }
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
    },
    playTone(freq, type = 'sine', duration = 0.15, gain = 0.1) {
      try {
        this.init();
        if (!this.ctx) return;
        const osc = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
        g.gain.setValueAtTime(gain, this.ctx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + duration);
        osc.connect(g);
        g.connect(this.ctx.destination);
        osc.start();
        osc.stop(this.ctx.currentTime + duration);
      } catch (e) {}
    },
    playJoin() {
      this.playTone(440, 'sine', 0.1, 0.08);
      setTimeout(() => this.playTone(880, 'sine', 0.2, 0.08), 100);
    },
    playLeave() {
      this.playTone(660, 'sine', 0.1, 0.08);
      setTimeout(() => this.playTone(330, 'sine', 0.2, 0.08), 100);
    },
    playPop() {
      this.playTone(800, 'triangle', 0.06, 0.08);
    },
    playChime() {
      this.playTone(523.25, 'sine', 0.2, 0.1);
      setTimeout(() => this.playTone(659.25, 'sine', 0.3, 0.1), 120);
      setTimeout(() => this.playTone(783.99, 'sine', 0.4, 0.1), 240);
    },
    playHandRaise() {
      this.playTone(350, 'triangle', 0.1, 0.1);
      setTimeout(() => this.playTone(700, 'triangle', 0.25, 0.1), 100);
    }
  };

  /* ---------- Core State ---------- */
  let ws = null;
  let myId = '';
  let peers = {};
  let roomAddress = '';
  let isHost = false;
  let nickname = '';
  let roomPassword = '';
  let roomLocked = false;
  let handRaised = false;
  let unreadChatCount = 0;
  let activeTab = 'chat';
  let sessionActive = false;

  let mainInterval = null;
  let timerMode = 'stopwatch';
  let timerRunning = false;
  let timerSeconds = 0;
  let timerDuration = 25 * 60;
  let timerRemaining = 25 * 60;
  let studyGoal = '';
  let totalUptimeSeconds = 0;

  let chatMessages = [];
  let localMediaStream = null;
  let localScreenStream = null;
  let micActive = false;
  let camActive = false;
  let pttActive = false;
  let audioContext = null;
  let localAudioAnalyser = null;
  let localAudioSource = null;
  let speechInterval = null;
  let isSpeaking = false;

  let wbActive = false;
  let wbCanvas = null;
  let wbCtx = null;
  let wbOverlay = null;
  let wbOCtx = null;
  let wbDrawing = false;
  let wbPanning = false;
  let wbColor = '#ffffff';
  let wbPenSize = 3;
  let wbEraserSize = 24;
  let wbHighlighterSize = 20;
  let wbTool = 'pen';
  let wbGridStyle = 'dots';
  let wbStrokes = [];
  let wbRedoStrokes = [];
  let wbQuestions = [];
  let wbNextQId = 1;
  let wbShapeStart = null;
  let wbRemoteCursors = {};
  let wbCanvasW = 4096;
  let wbCanvasH = 4096;
  let wbZoom = 1;
  let wbPanX = 0;
  let wbPanY = 0;
  let wbPanStart = null;
  let _liveStrokePoints = [];
  let _lastLiveBroadcast = 0;

  function fmtTime(sec) {
    const s = Math.max(0, Math.floor(sec));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const remS = s % 60;
    return h > 0
      ? `${h}:${String(m).padStart(2, '0')}:${String(remS).padStart(2, '0')}`
      : `${String(m).padStart(2, '0')}:${String(remS).padStart(2, '0')}`;
  }

  function escapeHTML(str) {
    if (!str) return '';
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  function capitalize(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : ''; }

  function generateRoomId() {
    let id = '';
    for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
      id += ROOM_CODE_CHARS[Math.floor(Math.random() * ROOM_CODE_CHARS.length)];
    }
    return id;
  }

  function normalizeRoomCode(raw) {
    if (!raw) return '';
    const code = raw.toUpperCase().trim().replace(/[^A-Z0-9]/g, '');
    return (code.length >= 4 && code.length <= 32) ? code : '';
  }

  function notify(msg, type = 'info') {
    if (typeof window.showNotification === 'function') {
      window.showNotification(msg, type);
    } else {
      console.log(`[StudyRoom - ${type.toUpperCase()}] ${msg}`);
    }
  }

  async function ensurePeerJS() {
    if (typeof window.Peer !== 'undefined') return true;
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js';
      script.onload = () => resolve(true);
      script.onerror = () => reject(new Error('PeerJS failed to load. Check internet connection.'));
      document.head.appendChild(script);
    });
  }

  /* ================================================================
     PEERJS ROOM HUB (Clean Cloud Signaling)
     ================================================================ */
  class PeerJSRoomHub {
    constructor() {
      this.readyState = 0;
      this.peer = null;
      this.hostConn = null;
      this.targetHostPeerId = '';
      this.connections = new Map();
      this.activeCalls = new Map();
      this.peerJsToUser = new Map();
      this.userToPeerJs = new Map();
      this.nextUserNum = 1;
      this.onmessage = null;
      this.onopen = null;
      this.onclose = null;
      this.onerror = null;
      this.connectTimeoutTimer = null;
      this.heartbeatInterval = null;
      this.outboxQueue = [];
      this.processedMids = new Set();
    }

    isDuplicate(mid) {
      if (!mid) return false;
      if (this.processedMids.has(mid)) return true;
      this.processedMids.add(mid);
      if (this.processedMids.size > 2000) {
        const first = this.processedMids.values().next().value;
        this.processedMids.delete(first);
      }
      return false;
    }

    startHeartbeat() {
      if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = setInterval(() => {
        if (this.peer && !this.peer.destroyed) {
          if (this.peer.disconnected) {
            this.peer.reconnect();
          }
        }
      }, 5000);
    }

    async init(targetRoomId) {
      await ensurePeerJS();

      return new Promise((resolve, reject) => {
        const cleanTargetId = targetRoomId.toLowerCase().replace(/[^a-z0-9]/g, '');
        const targetHostPeerId = 'qroom' + cleanTargetId;
        let isResolved = false;

        console.log(`[StudyRoom] Connecting to PeerJS Cloud (isHost: ${isHost}, ID: ${targetHostPeerId})`);

        this.connectTimeoutTimer = setTimeout(() => {
          if (!isResolved && this.readyState !== 1) {
            isResolved = true;
            this.close();
            const err = new Error(isHost ? 'Room code already in use. Please create a new one.' : `Room "${targetRoomId.toUpperCase()}" not found or host is offline.`);
            if (this.onerror) this.onerror(err);
            reject(err);
          }
        }, CONNECT_TIMEOUT_MS);

        try {
          // Native PeerJS Cloud initialization without broken custom paths
          if (isHost) {
            this.peer = new window.Peer(targetHostPeerId, PEER_OPTIONS);
          } else {
            this.peer = new window.Peer(PEER_OPTIONS);
          }
        } catch (err) {
          clearTimeout(this.connectTimeoutTimer);
          isResolved = true;
          return reject(err);
        }

        this.targetHostPeerId = targetHostPeerId;

        this.peer.on('open', (assignedId) => {
          console.log(`[StudyRoom] Cloud Signaling Open. ID: ${assignedId}`);
          this.startHeartbeat();

          if (isHost) {
            clearTimeout(this.connectTimeoutTimer);
            this.readyState = 1;
            this.peerJsToUser.set(assignedId, 'usr_host');
            this.userToPeerJs.set('usr_host', assignedId);
            isResolved = true;
            if (this.onopen) this.onopen();
            resolve();
          } else {
            console.log(`[StudyRoom] Connecting to Host: ${targetHostPeerId}`);
            this.peerJsToUser.set(targetHostPeerId, 'usr_host');
            this.userToPeerJs.set('usr_host', targetHostPeerId);

            try {
              this.hostConn = this.peer.connect(targetHostPeerId, {
                serialization: 'json',
                reliable: true
              });

              this.hostConn.on('open', () => {
                console.log('[StudyRoom] Connected to Host DataChannel.');
                clearTimeout(this.connectTimeoutTimer);
                this.readyState = 1;
                if (this.onopen) this.onopen();
                this.flushOutbox();

                this.hostConn.send({
                  _mid: 'join_' + Date.now(),
                  action: 'join',
                  nickname: nickname || 'Student',
                  password: roomPassword || ''
                });

                if (!isResolved) {
                  isResolved = true;
                  resolve();
                }
              });

              this.hostConn.on('data', (raw) => {
                const msg = typeof raw === 'string' ? JSON.parse(raw) : raw;
                if (msg && msg._mid && this.isDuplicate(msg._mid)) return;
                if (this.readyState !== 1) {
                  this.readyState = 1;
                  clearTimeout(this.connectTimeoutTimer);
                  if (this.onopen) this.onopen();
                  if (!isResolved) {
                    isResolved = true;
                    resolve();
                  }
                }
                if (this.onmessage) {
                  const dataStr = typeof raw === 'string' ? raw : JSON.stringify(raw);
                  this.onmessage({ data: dataStr });
                }
              });

              this.hostConn.on('close', () => {
                handleDisconnect();
              });
            } catch (err) {
              if (!isResolved) {
                this.readyState = 1;
                clearTimeout(this.connectTimeoutTimer);
                if (this.onopen) this.onopen();
                isResolved = true;
                resolve();
              }
            }
          }
        });

        if (isHost) {
          this.peer.on('connection', (conn) => {
            conn.on('open', () => {
              this.connections.set(conn.peer, conn);
            });

            conn.on('data', (raw) => {
              try {
                const msg = typeof raw === 'string' ? JSON.parse(raw) : raw;
                this.handleHostIncoming(conn, msg);
              } catch (e) {}
            });

            conn.on('close', () => {
              this.handleHostDisconnect(conn.peer);
            });
          });
        }

        this.peer.on('call', (call) => {
          this.activeCalls.set(call.peer + '_' + (call.metadata?.type || 'media'), call);
          call.answer(localMediaStream || undefined);

          call.on('stream', (remoteStream) => {
            const callerUserId = this.peerJsToUser.get(call.peer) || (call.peer === this.userToPeerJs.get('usr_host') ? 'usr_host' : call.peer);
            handleRemoteStream(callerUserId, remoteStream, call.metadata?.type || 'media');
          });

          call.on('close', () => {
            const callerUserId = this.peerJsToUser.get(call.peer) || call.peer;
            clearRemoteMedia(callerUserId, call.metadata?.type || 'media');
          });
        });

        this.peer.on('error', (err) => {
          clearTimeout(this.connectTimeoutTimer);
          console.error('[StudyRoom] PeerJS Error:', err.type, err.message);

          let userMsg = 'Connection error.';
          if (err.type === 'peer-unavailable') {
            userMsg = `Room "${normalizeRoomCode(targetRoomId)}" not found. Ensure the host is active in the room.`;
          } else if (err.type === 'unavailable-id') {
            userMsg = 'Room code is already active. Please click Create Room again.';
          } else if (err.type === 'network' || err.type === 'socket-error' || err.type === 'socket-closed') {
            userMsg = 'Signaling network issue. Please check your internet connection.';
          }

          const wrappedError = new Error(userMsg);
          if (this.onerror) this.onerror(wrappedError);
          if (!isResolved) {
            isResolved = true;
            reject(wrappedError);
          }
        });
      });
    }

    flushOutbox() {
      if (!this.hostConn || !this.hostConn.open) return;
      while (this.outboxQueue.length > 0) {
        const msg = this.outboxQueue.shift();
        try {
          const payload = typeof msg === 'string' ? JSON.parse(msg) : msg;
          this.hostConn.send(payload);
        } catch (e) {
          this.outboxQueue.unshift(msg);
          break;
        }
      }
    }

    send(str) {
      const payload = typeof str === 'string' ? JSON.parse(str) : str;
      if (!payload._mid) payload._mid = 'm_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);

      if (isHost) {
        this.handleHostIncoming(null, payload, this.peer ? this.peer.id : 'usr_host');
        return true;
      }

      if (this.hostConn && this.hostConn.open) {
        try {
          this.hostConn.send(payload);
          return true;
        } catch (e) {}
      }

      this.outboxQueue.push(payload);
      return false;
    }

    handleHostIncoming(senderConn, msg, optSenderPeerJsId = null) {
      const senderPeerJsId = senderConn ? senderConn.peer : (optSenderPeerJsId || (this.peer ? this.peer.id : 'usr_host'));
      if (msg && msg._mid && this.isDuplicate(msg._mid)) return;

      if (msg.action === 'host') {
        myId = 'usr_host';
        if (this.onmessage) {
          this.onmessage({ data: JSON.stringify({ action: 'welcome', id: 'usr_host' }) });
          this.onmessage({ data: JSON.stringify({ action: 'hosted' }) });
        }
        return;
      }

      if (msg.action === 'join') {
        if (roomLocked) {
          const authFailMsg = { _mid: 'af_' + Date.now(), action: 'auth-fail', reason: 'Room is locked by host.' };
          if (senderConn && senderConn.open) senderConn.send(authFailMsg);
          return;
        }
        if (roomPassword && msg.password !== roomPassword) {
          const authFailMsg = { _mid: 'af_' + Date.now(), action: 'auth-fail', reason: 'Incorrect room password.' };
          if (senderConn && senderConn.open) senderConn.send(authFailMsg);
          return;
        }

        let newUserId = this.peerJsToUser.get(senderPeerJsId);
        const isNewUser = !newUserId;
        if (isNewUser) {
          newUserId = 'usr_' + (this.nextUserNum++);
          this.peerJsToUser.set(senderPeerJsId, newUserId);
          this.userToPeerJs.set(newUserId, senderPeerJsId);
        }

        const currentPeersList = [];
        for (const [uId, pId] of this.userToPeerJs.entries()) {
          if (uId !== newUserId) {
            const nick = uId === 'usr_host' ? nickname : (peers[uId]?.nickname || 'Student');
            currentPeersList.push({ id: uId, nickname: nick, peerJsId: pId });
          }
        }

        const welcomeMsg = { _mid: 'w_' + Date.now(), action: 'welcome', id: newUserId };
        const joinedMsg = { _mid: 'j_' + Date.now(), action: 'joined', peers: currentPeersList, locked: roomLocked };

        if (senderConn && senderConn.open) {
          senderConn.send(welcomeMsg);
          senderConn.send(joinedMsg);
        }

        if (isNewUser) {
          const joinNotice = { _mid: 'pj_' + Date.now(), action: 'peer-joined', id: newUserId, nickname: msg.nickname, peerJsId: senderPeerJsId };
          this.broadcastToAll(joinNotice, newUserId);
          if (this.onmessage) this.onmessage({ data: JSON.stringify(joinNotice) });
        }
        return;
      }

      const senderUserId = this.peerJsToUser.get(senderPeerJsId) || 'usr_host';

      if (msg.action === 'relay') {
        const relayNotice = { _mid: msg._mid || ('r_' + Date.now()), action: 'relay', from: senderUserId, data: msg.data };
        this.broadcastToAll(relayNotice, senderUserId);
        if (senderUserId !== 'usr_host' && this.onmessage) {
          this.onmessage({ data: JSON.stringify(relayNotice) });
        }
        return;
      }
    }

    broadcastToAll(msgObj, excludeUserId = null) {
      if (!msgObj._mid) msgObj._mid = 'b_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);

      for (const [pId, conn] of this.connections.entries()) {
        const uId = this.peerJsToUser.get(pId);
        if (uId !== excludeUserId && conn.open) {
          try { conn.send(msgObj); } catch (e) {}
        }
      }
    }

    handleHostDisconnect(senderPeerJsId) {
      const uId = this.peerJsToUser.get(senderPeerJsId);
      if (uId) {
        this.connections.delete(senderPeerJsId);
        this.peerJsToUser.delete(senderPeerJsId);
        this.userToPeerJs.delete(uId);

        const leaveNotice = { action: 'peer-left', id: uId };
        this.broadcastToAll(leaveNotice);
        if (this.onmessage) this.onmessage({ data: JSON.stringify(leaveNotice) });
      }
    }

    callPeer(targetPeerJsId, stream, type) {
      if (!this.peer || !targetPeerJsId || !stream) return null;
      try {
        const call = this.peer.call(targetPeerJsId, stream, { metadata: { type } });
        if (call) {
          const key = targetPeerJsId + '_' + type;
          this.activeCalls.set(key, call);

          call.on('stream', (remoteStream) => {
            const targetUserId = this.peerJsToUser.get(targetPeerJsId) || targetPeerJsId;
            handleRemoteStream(targetUserId, remoteStream, type);
          });

          call.on('close', () => {
            const targetUserId = this.peerJsToUser.get(targetPeerJsId) || targetPeerJsId;
            clearRemoteMedia(targetUserId, type);
            this.activeCalls.delete(key);
          });
          return call;
        }
      } catch (err) {}
      return null;
    }

    close() {
      this.readyState = 3;
      clearTimeout(this.connectTimeoutTimer);
      if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);

      for (const call of this.activeCalls.values()) {
        try { call.close(); } catch (e) {}
      }
      this.activeCalls.clear();

      for (const conn of this.connections.values()) {
        try { conn.close(); } catch (e) {}
      }
      this.connections.clear();

      if (this.hostConn) {
        try { this.hostConn.close(); } catch (e) {}
        this.hostConn = null;
      }

      this.peerJsToUser.clear();
      this.userToPeerJs.clear();
      this.outboxQueue = [];

      if (this.peer) {
        try {
          this.peer.destroy();
        } catch (e) {}
        this.peer = null;
      }

      if (this.onclose) this.onclose();
    }
  }

  function connectHub(targetRoomId) {
    ws = new PeerJSRoomHub();
    ws.onopen = () => {};
    ws.onclose = () => handleDisconnect();
    ws.onerror = (err) => {
      if (!sessionActive) {
        hideLoading();
        cleanup();
        renderStudyRoom();
        notify(err.message || 'Connection failed', 'error');
      }
    };
    ws.onmessage = (event) => {
      try {
        const msg = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
        handleServerMessage(msg);
      } catch (e) {}
    };
    return ws.init(targetRoomId);
  }

  function sendToServer(obj) {
    if (ws) {
      ws.send(JSON.stringify(obj));
    }
  }

  function broadcastData(data) {
    sendToServer({ action: 'relay', data });
  }

  function handleServerMessage(msg) {
    switch (msg.action) {
      case 'welcome':
        myId = msg.id;
        break;

      case 'hosted':
        sessionActive = true;
        startStudyTimerEngine();
        hideLoading();
        renderActiveSession();
        SoundFX.playJoin();
        notify(`Study Room live. Code: ${roomAddress}`, 'success');
        break;

      case 'joined':
        peers = {};
        if (Array.isArray(msg.peers)) {
          msg.peers.forEach(p => {
            peers[p.id] = { nickname: p.nickname, goal: '', seconds: 0, peerJsId: p.peerJsId, handRaised: false, isSpeaking: false };
            if (ws && p.peerJsId) {
              ws.peerJsToUser.set(p.peerJsId, p.id);
              ws.userToPeerJs.set(p.id, p.peerJsId);
            }
          });
        }
        roomLocked = !!msg.locked;
        sessionActive = true;
        startStudyTimerEngine();
        hideLoading();
        renderActiveSession();
        SoundFX.playJoin();

        broadcastData({ type: 'info-request' });
        notify('Connected to Study Room.', 'success');
        syncLocalMediaToAllPeers();
        break;

      case 'auth-fail':
        hideLoading();
        cleanup();
        renderStudyRoom();
        notify(msg.reason || 'Failed to join room.', 'error');
        break;

      case 'peer-joined':
        peers[msg.id] = { nickname: msg.nickname, goal: '', seconds: 0, peerJsId: msg.peerJsId, handRaised: false, isSpeaking: false };
        if (ws && msg.peerJsId) {
          ws.peerJsToUser.set(msg.peerJsId, msg.id);
          ws.userToPeerJs.set(msg.id, msg.peerJsId);
        }
        SoundFX.playJoin();
        addSystemMessage(`${msg.nickname} joined the room.`);
        updateParticipantsUI();
        updateProgressUI();

        if (ws && msg.peerJsId) {
          if (localMediaStream && localMediaStream.getTracks().length > 0) {
            ws.callPeer(msg.peerJsId, localMediaStream, 'media');
          }
          if (localScreenStream && localScreenStream.getTracks().length > 0) {
            ws.callPeer(msg.peerJsId, localScreenStream, 'screen');
          }
        }
        break;

      case 'peer-left': {
        const leftNick = peers[msg.id]?.nickname || 'A participant';
        SoundFX.playLeave();
        addSystemMessage(`${leftNick} left the room.`);
        delete peers[msg.id];
        delete wbRemoteCursors[msg.id];
        clearRemoteMedia(msg.id, 'media');
        clearRemoteMedia(msg.id, 'screen');
        updateParticipantsUI();
        updateProgressUI();
        renderRemoteCursors();
        break;
      }

      case 'relay':
        handleRelayData(msg.from, msg.data);
        break;
    }
  }

  function handleRelayData(fromId, data) {
    if (!data || typeof data !== 'object') return;

    switch (data.type) {
      case 'chat':
        chatMessages.push({ sender: data.sender, text: data.text, time: data.time, type: 'chat' });
        renderChatMessages();
        SoundFX.playPop();
        if (activeTab !== 'chat') {
          unreadChatCount++;
          updateUnreadBadge();
        }
        break;

      case 'reaction':
        spawnFloatingReaction(data.emoji);
        break;

      case 'hand-raise':
        if (peers[fromId]) {
          peers[fromId].handRaised = !!data.raised;
          updateParticipantsUI();
          if (data.raised) {
            SoundFX.playHandRaise();
            notify(`${peers[fromId].nickname} raised their hand.`, 'info');
          }
        }
        break;

      case 'speaking':
        if (peers[fromId]) {
          peers[fromId].isSpeaking = !!data.speaking;
          const tile = document.getElementById(`srTile_${fromId}`);
          if (tile) tile.classList.toggle('sr-speaking', !!data.speaking);
        }
        break;

      case 'progress':
        if (peers[fromId]) {
          peers[fromId].goal = data.goal || '';
          peers[fromId].seconds = data.seconds || 0;
        }
        updateProgressUI();
        break;

      case 'info':
        if (peers[fromId]) {
          peers[fromId].nickname = data.nickname || peers[fromId].nickname;
          peers[fromId].goal = data.goal || '';
          peers[fromId].seconds = data.seconds || 0;
        }
        updateParticipantsUI();
        updateProgressUI();
        break;

      case 'info-request':
        broadcastData({ type: 'info', nickname, goal: studyGoal, seconds: timerSeconds });
        if (isHost) broadcastTimerSync();
        if (wbStrokes.length > 0 || wbQuestions.length > 0) {
          broadcastData({ type: 'wb-full-sync', strokes: wbStrokes, questions: wbQuestions, nextId: wbNextQId });
        }
        break;

      case 'timer-sync':
        timerMode = data.mode;
        timerRunning = data.running;
        timerSeconds = data.seconds;
        timerDuration = data.duration;
        timerRemaining = data.remaining;
        updateTimerDisplay();
        break;

      case 'mod-mute-all':
        if (!isHost && micActive) {
          toggleMicrophone();
          notify('Host muted all microphones.', 'warning');
        }
        break;

      case 'mod-kick':
        if (data.targetId === myId) {
          notify('You were removed from the room by the host.', 'error');
          forceLeaveRoom();
        }
        break;

      case 'mod-lock':
        roomLocked = data.locked;
        updateRoomLockUI();
        notify(`Room ${roomLocked ? 'Locked' : 'Unlocked'} by host.`, 'info');
        break;

      case 'wb-live-draw':
        replayLivePoints(data.points, data.color, data.size, data.tool, data.alpha);
        break;

      case 'wb-stroke':
        replayStroke(data.points, data.color, data.size, data.tool, data.alpha);
        wbStrokes.push({ type: 'stroke', points: data.points, color: data.color, size: data.size, tool: data.tool, alpha: data.alpha });
        maybeGrowCanvas(data.points);
        break;

      case 'wb-shape':
        drawShapeOnCanvas(data.shape, data.start, data.end, data.color, data.size);
        wbStrokes.push({ type: 'shape', shape: data.shape, start: data.start, end: data.end, color: data.color, size: data.size });
        break;

      case 'wb-text':
        drawTextOnCanvas(data.text, data.x, data.y, data.color, data.size);
        wbStrokes.push({ type: 'text', text: data.text, x: data.x, y: data.y, color: data.color, size: data.size });
        break;

      case 'wb-cursor':
        wbRemoteCursors[fromId] = { x: data.x, y: data.y, name: peers[fromId]?.nickname || 'Student', color: data.color || '#cf6215', lastSeen: Date.now() };
        renderRemoteCursors();
        break;

      case 'wb-clear':
        clearCanvasLocal();
        break;

      case 'wb-undo':
        undoCanvasLocal();
        break;

      case 'wb-redo':
        redoCanvasLocal();
        break;

      case 'wb-full-sync':
        wbStrokes = data.strokes || [];
        wbQuestions = data.questions || [];
        wbNextQId = data.nextId || (wbQuestions.length + 1);
        replayAllStrokes();
        renderQuestionsUI();
        break;

      case 'wb-questions':
        wbQuestions = data.questions || [];
        wbNextQId = data.nextId || (wbQuestions.length + 1);
        renderQuestionsUI();
        break;

      case 'study-material':
        receiveStudyMaterial(fromId, data.fileData, data.fileName);
        break;

      case 'webrtc-stop':
        clearRemoteMedia(fromId, data.streamType || 'screen');
        break;
    }
  }

  function handleDisconnect() {
    if (!sessionActive) return;
    notify('Lost connection to study room.', 'error');
    setTimeout(() => forceLeaveRoom(), 1500);
  }

  /* ================================================================
     UI — LOBBY
     ================================================================ */
  function renderStudyRoom() {
    const section = document.getElementById('studyRoomSection');
    if (!section) return;

    if (sessionActive) { renderActiveSession(); return; }

    const savedNick = localStorage.getItem('questionary-study-nickname') || '';
    section.innerHTML = `
      <div class="sr-lobby">
        <div class="sr-lobby-header">
          <h2 class="section-title"><i class="fas fa-users"></i>Study Room</h2>
          <span class="sr-exp-badge">Study Room v5.5</span>
          <div class="sr-lobby-icon"><i class="fas fa-graduation-cap"></i></div>
          <p class="sr-lobby-subtitle">Collaborate live with screen sharing, interactive whiteboard, synced timers, voice & notes.</p>
        </div>

        <div class="sr-lobby-cards">
          <div class="sr-lobby-card">
            <h3><i class="fas fa-user-circle"></i> Display Name</h3>
            <input type="text" id="srNickname" class="sr-input" placeholder="Enter your name…" maxlength="24" value="${escapeHTML(savedNick)}">
          </div>

          <div class="sr-lobby-card sr-card-create">
            <h3><i class="fas fa-plus-circle"></i> Create Room</h3>
            <p>Host a study room and share your code with your group.</p>

            <div class="sr-pw-row">
              <input type="password" id="srCreatePassword" class="sr-input" placeholder="Room password (optional)" maxlength="32" autocomplete="off">
              <button type="button" class="sr-pw-toggle" id="srCreatePwToggle" title="Toggle password"><i class="fas fa-eye"></i></button>
            </div>
            <button class="sr-btn sr-btn-primary" id="srCreateBtn"><i class="fas fa-door-open"></i> Create Room</button>
          </div>

          <div class="sr-lobby-card sr-card-join">
            <h3><i class="fas fa-sign-in-alt"></i> Join Room</h3>
            <p>Enter the room code shared by your study partner.</p>
            <div class="sr-join-row">
              <input type="text" id="srJoinAddress" class="sr-input sr-code-input" placeholder="ABC123XYZ0" spellcheck="false" autocomplete="off">
              <button class="sr-btn sr-btn-accent" id="srJoinBtn"><i class="fas fa-arrow-right"></i> Join</button>
            </div>
            <div class="sr-pw-row" style="margin-top:0.5rem;">
              <input type="password" id="srJoinPassword" class="sr-input" placeholder="Password (if required)" maxlength="32" autocomplete="off">
              <button type="button" class="sr-pw-toggle" id="srJoinPwToggle" title="Toggle password"><i class="fas fa-eye"></i></button>
            </div>
          </div>
        </div>
      </div>
    `;

    document.getElementById('srCreateBtn')?.addEventListener('click', handleCreate);
    document.getElementById('srJoinBtn')?.addEventListener('click', handleJoin);
    document.getElementById('srJoinAddress')?.addEventListener('keydown', e => { if (e.key === 'Enter') handleJoin(); });

    setupPwToggle('srCreatePwToggle', 'srCreatePassword');
    setupPwToggle('srJoinPwToggle', 'srJoinPassword');
  }

  function setupPwToggle(btnId, inputId) {
    const btn = document.getElementById(btnId);
    const input = document.getElementById(inputId);
    if (!btn || !input) return;
    btn.addEventListener('click', () => {
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      btn.innerHTML = `<i class="fas fa-eye${show ? '-slash' : ''}"></i>`;
    });
  }

  function renderActiveSession() {
    const section = document.getElementById('studyRoomSection');
    if (!section) return;

    section.innerHTML = `
      <div class="sr-session">
        <div class="sr-session-bar">
          <div class="sr-session-bar-left">
            <span class="sr-mode-badge sr-mode-inet"><i class="fas fa-wifi"></i> Live</span>
            <span class="sr-room-code-badge" title="Click to copy room code" id="srCopyCode">
              <i class="fas fa-key"></i> ${escapeHTML(roomAddress)}
            </span>
            ${roomPassword ? `<span class="sr-pw-badge"><i class="fas fa-lock"></i> <span class="sr-pw-hidden" id="srPwReveal">••••••</span></span>` : `<span class="sr-pw-badge sr-pw-open"><i class="fas fa-lock-open"></i> Public</span>`}
            ${isHost ? `<button class="sr-btn sr-btn-sm ${roomLocked ? 'sr-btn-primary' : 'sr-btn-secondary'}" id="srLockToggle" title="Lock/Unlock Room"><i class="fas fa-${roomLocked ? 'lock' : 'lock-open'}"></i></button>` : ''}
          </div>

          <div class="sr-pomo-bar" id="srPomoBar">
            <button class="sr-pomo-mode-btn" id="srPomoToggleMode" title="Cycle Mode">
              <i class="fas fa-stopwatch"></i>
            </button>
            <span class="sr-pomo-timer" id="srPomoTimer">00:00</span>
            <button class="sr-pomo-ctrl-btn" id="srPomoPlayPause" title="Start / Pause Timer">
              <i class="fas fa-play"></i>
            </button>
            <button class="sr-pomo-ctrl-btn" id="srPomoReset" title="Reset Timer">
              <i class="fas fa-redo"></i>
            </button>
          </div>

          <div class="sr-session-bar-right">
            <button class="sr-ctrl-btn ${handRaised ? 'sr-ctrl-active' : ''}" id="srRaiseHandBtn" title="Raise Hand">
              <i class="fas fa-hand-paper"></i>
            </button>
            <button class="sr-ctrl-btn" id="srToggleMic" title="Toggle Microphone">
              <i class="fas fa-microphone-slash" style="color: #ef4444;"></i>
            </button>
            <button class="sr-ctrl-btn" id="srToggleCamera" title="Toggle Camera">
              <i class="fas fa-video-slash" style="color: #ef4444;"></i>
            </button>
            <button class="sr-ctrl-btn" id="srToggleScreenShare" title="Share Screen">
              <i class="fas fa-desktop"></i>
            </button>
            <button class="sr-ctrl-btn ${wbActive ? 'sr-ctrl-active' : ''}" id="srToggleWB" title="Toggle Whiteboard">
              <i class="fas fa-chalkboard"></i>
            </button>
            ${isHost ? `<button class="sr-ctrl-btn" id="srMuteAllBtn" title="Mute All"><i class="fas fa-volume-mute"></i></button>` : ''}
            <button class="sr-ctrl-btn sr-ctrl-danger" id="srLeaveBtn" title="Leave room">
              <i class="fas fa-phone-slash"></i>
            </button>
          </div>
        </div>

        <div class="sr-session-body">
          <div class="sr-video-area" id="srParticipantArea">
            <div class="sr-video-grid" id="srParticipantsGrid"></div>
            
            <div class="sr-reactions-bar">
              <button class="sr-react-btn" data-emoji="👏" title="Clap">👏</button>
              <button class="sr-react-btn" data-emoji="🔥" title="Fire">🔥</button>
              <button class="sr-react-btn" data-emoji="💡" title="Idea">💡</button>
              <button class="sr-react-btn" data-emoji="👍" title="Thumbs Up">👍</button>
              <button class="sr-react-btn" data-emoji="❤️" title="Heart">❤️</button>
              <button class="sr-react-btn" data-emoji="☕" title="Coffee Break">☕</button>
            </div>
          </div>

          <div class="sr-wb-panel" id="srWhiteboardPanel" style="display:none;">
            <div class="sr-wb-toolbar">
              <div class="sr-wb-tools">
                <button class="sr-wb-tool-btn" data-tool="pan" title="Pan (Hold Space)"><i class="fas fa-hand-paper"></i></button>
                <button class="sr-wb-tool-btn active" data-tool="pen" title="Pen"><i class="fas fa-pen"></i></button>
                <button class="sr-wb-tool-btn" data-tool="highlighter" title="Highlighter"><i class="fas fa-highlighter"></i></button>
                <button class="sr-wb-tool-btn" data-tool="line" title="Line"><i class="fas fa-slash"></i></button>
                <button class="sr-wb-tool-btn" data-tool="arrow" title="Arrow"><i class="fas fa-long-arrow-alt-right"></i></button>
                <button class="sr-wb-tool-btn" data-tool="rect" title="Rectangle"><i class="far fa-square"></i></button>
                <button class="sr-wb-tool-btn" data-tool="circle" title="Circle"><i class="far fa-circle"></i></button>
                <button class="sr-wb-tool-btn" data-tool="text" title="Text Tool"><i class="fas fa-font"></i></button>
                <button class="sr-wb-tool-btn" data-tool="eraser" title="Eraser"><i class="fas fa-eraser"></i></button>
                
                <div class="sr-wb-sep"></div>
                <input type="color" id="srWbColor" class="sr-wb-color-pick" value="${wbColor}">
                <div class="sr-wb-range-group" id="srWbPenSizeGroup">
                  <label>Size</label>
                  <input type="range" id="srWbPenSize" min="1" max="40" value="${wbPenSize}" class="sr-wb-range">
                  <span id="srWbPenSizeVal">${wbPenSize}</span>
                </div>
                
                <div class="sr-wb-sep"></div>
                <button class="sr-wb-tool-btn" id="srWbGridToggle" title="Toggle Grid"><i class="fas fa-border-all"></i></button>
                <button class="sr-wb-tool-btn" id="srWbUndo" title="Undo"><i class="fas fa-undo"></i></button>
                <button class="sr-wb-tool-btn" id="srWbRedo" title="Redo"><i class="fas fa-redo"></i></button>
                <button class="sr-wb-tool-btn" id="srWbClear" title="Clear board"><i class="fas fa-trash"></i></button>
              </div>

              <div class="sr-wb-actions">
                <div class="sr-wb-zoom-group">
                  <button class="sr-wb-tool-btn" id="srWbZoomOut"><i class="fas fa-search-minus"></i></button>
                  <span class="sr-wb-zoom-label" id="srWbZoomLabel">100%</span>
                  <button class="sr-wb-tool-btn" id="srWbZoomIn"><i class="fas fa-search-plus"></i></button>
                  <button class="sr-wb-tool-btn" id="srWbZoomReset" title="Reset View"><i class="fas fa-compress-arrows-alt"></i></button>
                </div>
                <div class="sr-wb-sep"></div>
                <button class="sr-wb-tool-btn" id="srWbFullscreen" title="Fullscreen"><i class="fas fa-expand"></i></button>
                <button class="sr-wb-tool-btn" id="srWbDownload" title="Download PNG"><i class="fas fa-download"></i></button>
                <button class="sr-wb-tool-btn" id="srWbSaveLib" title="Save to Library"><i class="fas fa-save"></i></button>
              </div>
            </div>

            <div class="sr-wb-body">
              <div class="sr-wb-canvas-wrap" id="srWbCanvasWrap" style="touch-action: none !important;">
                <canvas id="srWbCanvas"></canvas>
                <canvas id="srWbOverlay"></canvas>
              </div>
              <div class="sr-wb-questions">
                <div class="sr-wb-q-header">
                  <h4><i class="fas fa-clipboard-list"></i> Questions & Notes</h4>
                  <button class="sr-btn sr-btn-primary sr-btn-sm" id="srWbAddQ"><i class="fas fa-plus"></i> Add</button>
                </div>
                <div class="sr-wb-q-list" id="srWbQList"></div>
              </div>
            </div>
          </div>

          <div class="sr-sidebar" id="srSidebar">
            <div class="sr-sidebar-tabs">
              <button class="sr-tab-btn active" data-tab="chat">
                <i class="fas fa-comments"></i> Chat
                <span class="sr-count" id="srUnreadBadge" style="display:none;">0</span>
              </button>
              <button class="sr-tab-btn" data-tab="participants">
                <i class="fas fa-users"></i> People 
                <span class="sr-count" id="srPeopleCount">${1 + Object.keys(peers).length}</span>
              </button>
              <button class="sr-tab-btn" data-tab="progress"><i class="fas fa-tasks"></i> Goals</button>
            </div>

            <div class="sr-tab-panel active" id="srTabChat">
              <div class="sr-chat-messages" id="srChatMessages"></div>
              <div class="sr-chat-input-row">
                <input type="file" id="srMaterialFile" style="display:none;" accept=".pdf,.png,.jpg,.jpeg,.doc,.docx,.txt" />
                <button class="sr-btn sr-btn-secondary sr-btn-icon" id="srShareMaterial" title="Share Document">
                   <i class="fas fa-paperclip"></i>
                </button>
                <input type="text" id="srChatInput" class="sr-input" placeholder="Type a message…" maxlength="500">
                <button class="sr-btn sr-btn-primary sr-btn-icon" id="srChatSend"><i class="fas fa-paper-plane"></i></button>
              </div>
            </div>

            <div class="sr-tab-panel" id="srTabParticipants">
              <div id="srParticipantsList">${buildParticipantsHTML()}</div>
            </div>

            <div class="sr-tab-panel" id="srTabProgress">
              <div class="sr-progress-self">
                <h4>Your Study Goal</h4>
                <input type="text" id="srGoalInput" class="sr-input" placeholder="What are you studying right now?" value="${escapeHTML(studyGoal)}" maxlength="80">
                <button class="sr-btn sr-btn-accent sr-btn-sm" id="srSetGoal" style="margin-top:0.4rem;width:100%;justify-content:center;">Set Goal</button>
              </div>
              <div class="sr-progress-list" id="srProgressList">
                ${buildProgressHTML()}
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    attachSessionListeners();
    renderChatMessages();
    updateParticipantsUI();
    updateTimerDisplay();
  }

  function buildParticipantsHTML() {
    let html = `
      <div class="sr-participant-item">
        <div class="sr-participant-avatar"><i class="fas fa-user"></i></div>
        <div class="sr-participant-info">
          <span class="sr-participant-name">${escapeHTML(nickname)} (You)${isHost ? ' <i class="fas fa-crown sr-host-icon" title="Host"></i>' : ''}${handRaised ? ' <i class="fas fa-hand-paper" style="color:var(--accent,#cf6215);margin-left:4px;"></i>' : ''}</span>
          <span class="sr-participant-status"><i class="fas fa-circle sr-status-on"></i> Connected</span>
        </div>
      </div>`;
    Object.entries(peers).forEach(([id, p]) => {
      html += `
        <div class="sr-participant-item">
          <div class="sr-participant-avatar"><i class="fas fa-user"></i></div>
          <div class="sr-participant-info">
            <span class="sr-participant-name">${escapeHTML(p.nickname || 'Student')}${p.handRaised ? ' <i class="fas fa-hand-paper" style="color:var(--accent,#cf6215);margin-left:4px;"></i>' : ''}</span>
            <span class="sr-participant-status"><i class="fas fa-circle sr-status-on"></i> Connected</span>
          </div>
          ${isHost ? `
            <div class="sr-participant-actions">
              <button class="sr-btn sr-btn-sm sr-btn-danger sr-btn-icon" onclick="window.srKickUser('${id}')" title="Kick participant"><i class="fas fa-user-slash"></i></button>
            </div>
          ` : ''}
        </div>`;
    });
    return html;
  }

  function buildProgressHTML() {
    let html = '';
    html += `
      <div class="sr-progress-item">
        <div class="sr-progress-user"><i class="fas fa-user"></i> ${escapeHTML(nickname)} (You)</div>
        <div class="sr-progress-goal">${studyGoal ? escapeHTML(studyGoal) : '<em>No goal set</em>'}</div>
        <div class="sr-progress-time"><i class="fas fa-clock"></i> <span class="sr-my-goal-timer">${fmtTime(timerMode === 'stopwatch' ? timerSeconds : timerRemaining)}</span></div>
      </div>`;
    Object.values(peers).forEach(p => {
      html += `
        <div class="sr-progress-item">
          <div class="sr-progress-user"><i class="fas fa-user"></i> ${escapeHTML(p.nickname || 'Student')}</div>
          <div class="sr-progress-goal">${p.goal ? escapeHTML(p.goal) : '<em>No goal set</em>'}</div>
          <div class="sr-progress-time"><i class="fas fa-clock"></i> ${fmtTime(p.seconds || 0)}</div>
        </div>`;
    });
    return html;
  }

  function syncVideoTiles() {
    const grid = document.getElementById('srParticipantsGrid');
    if (!grid) return;

    const currentTileIds = new Set(['srTile_usr_self']);
    Object.keys(peers).forEach(uId => currentTileIds.add(`srTile_${uId}`));

    let selfTile = document.getElementById('srTile_usr_self');
    if (!selfTile) {
      selfTile = document.createElement('div');
      selfTile.className = 'sr-video-tile sr-video-local';
      selfTile.id = 'srTile_usr_self';
      selfTile.dataset.userid = 'usr_self';
      selfTile.innerHTML = `
        <div class="sr-video-off"><i class="fas fa-user"></i></div>
        <div class="sr-video-label">${escapeHTML(nickname)} (You)${isHost ? ' <i class="fas fa-crown" style="color:#f59e0b;"></i>' : ''}</div>
        <div class="sr-tile-hand" style="display:${handRaised ? 'block' : 'none'};"><i class="fas fa-hand-paper"></i></div>
      `;
      grid.appendChild(selfTile);
    } else {
      const label = selfTile.querySelector('.sr-video-label');
      if (label) label.innerHTML = `${escapeHTML(nickname)} (You)${isHost ? ' <i class="fas fa-crown" style="color:#f59e0b;"></i>' : ''}`;
      const hand = selfTile.querySelector('.sr-tile-hand');
      if (hand) hand.style.display = handRaised ? 'block' : 'none';
    }

    Object.entries(peers).forEach(([uId, p]) => {
      const tileId = `srTile_${uId}`;
      let tile = document.getElementById(tileId);
      if (!tile) {
        tile = document.createElement('div');
        tile.className = 'sr-video-tile';
        tile.id = tileId;
        tile.dataset.userid = uId;
        tile.innerHTML = `
          <div class="sr-video-off"><i class="fas fa-user"></i></div>
          <div class="sr-video-label">${escapeHTML(p.nickname || 'Student')}</div>
          <div class="sr-tile-hand" style="display:${p.handRaised ? 'block' : 'none'};"><i class="fas fa-hand-paper"></i></div>
        `;
        grid.appendChild(tile);
      } else {
        const label = tile.querySelector('.sr-video-label');
        if (label) label.textContent = p.nickname || 'Student';
        const hand = tile.querySelector('.sr-tile-hand');
        if (hand) hand.style.display = p.handRaised ? 'block' : 'none';
        tile.classList.toggle('sr-speaking', !!p.isSpeaking);
      }
    });

    Array.from(grid.children).forEach(tile => {
      if (tile.id && !currentTileIds.has(tile.id)) {
        tile.querySelectorAll('video, audio').forEach(el => {
          el.pause();
          el.srcObject = null;
        });
        tile.remove();
      }
    });

    const totalTiles = grid.children.length;
    grid.classList.remove('sr-grid-1', 'sr-grid-2', 'sr-grid-3', 'sr-grid-4plus');
    if (totalTiles <= 1) grid.classList.add('sr-grid-1');
    else if (totalTiles === 2) grid.classList.add('sr-grid-2');
    else if (totalTiles <= 4) grid.classList.add('sr-grid-3');
    else grid.classList.add('sr-grid-4plus');
  }

  function startStudyTimerEngine() {
    if (mainInterval) clearInterval(mainInterval);

    mainInterval = setInterval(() => {
      if (!sessionActive) return;

      totalUptimeSeconds++;

      if (timerRunning) {
        if (timerMode === 'stopwatch') {
          timerSeconds++;
        } else {
          if (timerRemaining > 0) {
            timerRemaining--;
            if (timerRemaining === 0) {
              timerRunning = false;
              SoundFX.playChime();
              notify(timerMode === 'focus' ? 'Focus session complete. Time for a break.' : 'Break complete. Back to study.', 'success');

              if (timerMode === 'focus') {
                timerMode = 'break';
                timerDuration = 5 * 60;
                timerRemaining = 5 * 60;
              } else {
                timerMode = 'focus';
                timerDuration = 25 * 60;
                timerRemaining = 25 * 60;
              }
            }
          }
        }
      }

      updateTimerDisplay();

      document.querySelectorAll('.sr-my-goal-timer').forEach(el => {
        el.textContent = fmtTime(timerMode === 'stopwatch' ? timerSeconds : timerRemaining);
      });

      if (totalUptimeSeconds % 8 === 0) {
        broadcastData({
          type: 'progress',
          goal: studyGoal,
          seconds: timerMode === 'stopwatch' ? timerSeconds : timerRemaining
        });
        updateProgressUI();
      }
    }, 1000);
  }

  function toggleTimerPlayPause() {
    timerRunning = !timerRunning;
    broadcastTimerSync();
    updateTimerDisplay();
  }

  function resetTimer() {
    timerRunning = false;
    if (timerMode === 'stopwatch') {
      timerSeconds = 0;
    } else {
      timerRemaining = timerDuration;
    }
    broadcastTimerSync();
    updateTimerDisplay();
  }

  function cycleTimerMode() {
    if (timerMode === 'stopwatch') {
      timerMode = 'focus';
      timerDuration = 25 * 60;
      timerRemaining = 25 * 60;
    } else if (timerMode === 'focus') {
      timerMode = 'break';
      timerDuration = 5 * 60;
      timerRemaining = 5 * 60;
    } else if (timerMode === 'break') {
      timerMode = 'long_break';
      timerDuration = 15 * 60;
      timerRemaining = 15 * 60;
    } else {
      timerMode = 'stopwatch';
      timerSeconds = 0;
    }

    timerRunning = false;
    broadcastTimerSync();
    updateTimerDisplay();
  }

  function broadcastTimerSync() {
    broadcastData({
      type: 'timer-sync',
      mode: timerMode,
      running: timerRunning,
      seconds: timerSeconds,
      duration: timerDuration,
      remaining: timerRemaining
    });
  }

  function updateTimerDisplay() {
    const timerEl = document.getElementById('srPomoTimer');
    const playBtn = document.getElementById('srPomoPlayPause');
    const modeBtn = document.getElementById('srPomoToggleMode');

    if (timerEl) {
      const displayVal = timerMode === 'stopwatch' ? timerSeconds : timerRemaining;
      timerEl.textContent = fmtTime(displayVal);
      timerEl.style.color = timerMode === 'focus' ? 'var(--accent, #cf6215)' : (timerMode.includes('break') ? '#10b981' : 'var(--fg)');
    }

    if (playBtn) {
      playBtn.innerHTML = `<i class="fas fa-${timerRunning ? 'pause' : 'play'}"></i>`;
    }

    if (modeBtn) {
      let icon = 'stopwatch';
      let label = 'Stopwatch';
      if (timerMode === 'focus') { icon = 'brain'; label = 'Focus (25m)'; }
      else if (timerMode === 'break') { icon = 'coffee'; label = 'Short Break (5m)'; }
      else if (timerMode === 'long_break') { icon = 'umbrella-beach'; label = 'Long Break (15m)'; }

      modeBtn.innerHTML = `<i class="fas fa-${icon}"></i>`;
      modeBtn.title = `Mode: ${label} (Click to switch)`;
    }
  }

  function attachSessionListeners() {
    document.getElementById('srCopyCode')?.addEventListener('click', () => {
      navigator.clipboard.writeText(roomAddress).then(() => notify('Room code copied.', 'success')).catch(() => {
        prompt('Room Code:', roomAddress);
      });
    });

    const pwReveal = document.getElementById('srPwReveal');
    if (pwReveal && roomPassword) {
      pwReveal.style.cursor = 'pointer';
      pwReveal.addEventListener('click', () => {
        pwReveal.textContent = pwReveal.textContent === '••••••' ? roomPassword : '••••••';
      });
    }

    document.getElementById('srLockToggle')?.addEventListener('click', () => {
      roomLocked = !roomLocked;
      broadcastData({ type: 'mod-lock', locked: roomLocked });
      updateRoomLockUI();
      notify(`Room ${roomLocked ? 'Locked' : 'Unlocked'}`, 'info');
    });

    document.getElementById('srRaiseHandBtn')?.addEventListener('click', toggleRaiseHand);
    document.getElementById('srMuteAllBtn')?.addEventListener('click', () => {
      broadcastData({ type: 'mod-mute-all' });
      notify('Mute request sent to all.', 'info');
    });

    document.getElementById('srLeaveBtn')?.addEventListener('click', leaveRoom);
    document.getElementById('srChatSend')?.addEventListener('click', sendChatMessage);
    document.getElementById('srChatInput')?.addEventListener('keydown', e => { if (e.key === 'Enter') sendChatMessage(); });
    document.getElementById('srShareMaterial')?.addEventListener('click', handleShareMaterial);

    document.getElementById('srToggleScreenShare')?.addEventListener('click', toggleScreenShare);
    document.getElementById('srToggleMic')?.addEventListener('click', toggleMicrophone);
    document.getElementById('srToggleCamera')?.addEventListener('click', toggleCamera);
    document.getElementById('srToggleWB')?.addEventListener('click', toggleWhiteboard);

    document.getElementById('srPomoToggleMode')?.addEventListener('click', cycleTimerMode);
    document.getElementById('srPomoPlayPause')?.addEventListener('click', toggleTimerPlayPause);
    document.getElementById('srPomoReset')?.addEventListener('click', resetTimer);

    document.querySelectorAll('.sr-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.sr-tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.sr-tab-panel').forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        activeTab = btn.dataset.tab;
        if (activeTab === 'chat') {
          unreadChatCount = 0;
          updateUnreadBadge();
        }
        const panel = document.getElementById('srTab' + capitalize(activeTab));
        if (panel) panel.classList.add('active');
      });
    });

    document.querySelectorAll('.sr-react-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const emoji = btn.dataset.emoji;
        spawnFloatingReaction(emoji);
        broadcastData({ type: 'reaction', emoji });
      });
    });

    const applyGoal = () => {
      const input = document.getElementById('srGoalInput');
      studyGoal = input?.value.trim() || '';
      broadcastData({ type: 'progress', goal: studyGoal, seconds: timerSeconds });
      updateProgressUI();
      notify('Study goal updated.', 'success');
    };

    document.getElementById('srSetGoal')?.addEventListener('click', applyGoal);
    document.getElementById('srGoalInput')?.addEventListener('keydown', e => { if (e.key === 'Enter') applyGoal(); });

    setupPushToTalk();
    initWhiteboardListeners();
  }

  function updateRoomLockUI() {
    const btn = document.getElementById('srLockToggle');
    if (btn) {
      btn.innerHTML = `<i class="fas fa-${roomLocked ? 'lock' : 'lock-open'}"></i>`;
      btn.className = `sr-btn sr-btn-sm ${roomLocked ? 'sr-btn-primary' : 'sr-btn-secondary'}`;
    }
  }

  function updateUnreadBadge() {
    const badge = document.getElementById('srUnreadBadge');
    if (badge) {
      badge.style.display = unreadChatCount > 0 ? 'inline-block' : 'none';
      badge.textContent = unreadChatCount;
    }
  }

  function toggleRaiseHand() {
    handRaised = !handRaised;
    const btn = document.getElementById('srRaiseHandBtn');
    if (btn) btn.classList.toggle('sr-ctrl-active', handRaised);
    broadcastData({ type: 'hand-raise', raised: handRaised });
    updateParticipantsUI();
    if (handRaised) {
      SoundFX.playHandRaise();
      notify('Hand raised.', 'info');
    }
  }

  function spawnFloatingReaction(emoji) {
    SoundFX.playPop();
    const container = document.getElementById('srParticipantArea');
    if (!container) return;

    const el = document.createElement('div');
    el.className = 'sr-floating-reaction';
    el.textContent = emoji;
    el.style.left = `${20 + Math.random() * 60}%`;
    el.style.bottom = '80px';
    container.appendChild(el);

    setTimeout(() => el.remove(), 2000);
  }

  async function getOrCreateMediaStream() {
    if (!localMediaStream) {
      localMediaStream = new MediaStream();
    }
    return localMediaStream;
  }

  function syncLocalMediaToAllPeers() {
    if (!ws) return;
    Object.entries(peers).forEach(([uId, p]) => {
      if (p.peerJsId) {
        if (localMediaStream && localMediaStream.getTracks().length > 0) {
          ws.callPeer(p.peerJsId, localMediaStream, 'media');
        }
        if (localScreenStream && localScreenStream.getTracks().length > 0) {
          ws.callPeer(p.peerJsId, localScreenStream, 'screen');
        }
      }
    });
  }

  async function toggleMicrophone() {
    try {
      const stream = await getOrCreateMediaStream();
      let audioTrack = stream.getAudioTracks()[0];

      if (!audioTrack) {
        const audioStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
        audioTrack = audioStream.getAudioTracks()[0];
        stream.addTrack(audioTrack);
        micActive = true;
        audioTrack.enabled = true;
        syncLocalMediaToAllPeers();
      } else {
        micActive = !micActive;
        audioTrack.enabled = micActive;
      }

      updateMediaButtons();
      setupAudioAnalysis();
      notify(micActive ? 'Microphone unmuted' : 'Microphone muted', 'info');
    } catch (err) {
      micActive = false;
      updateMediaButtons();
      notify('Could not access microphone.', 'error');
    }
  }

  async function toggleCamera() {
    try {
      const stream = await getOrCreateMediaStream();
      let videoTrack = stream.getVideoTracks()[0];

      if (!videoTrack) {
        const videoStream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 24 } }
        });
        videoTrack = videoStream.getVideoTracks()[0];
        stream.addTrack(videoTrack);
        camActive = true;
        videoTrack.enabled = true;
        syncLocalMediaToAllPeers();
      } else {
        camActive = !camActive;
        videoTrack.enabled = camActive;
      }

      updateMediaButtons();
      renderLocalCam(camActive ? stream : null);
      notify(camActive ? 'Camera turned on' : 'Camera turned off', 'info');
    } catch (err) {
      camActive = false;
      updateMediaButtons();
      notify('Could not access camera.', 'error');
    }
  }

  function updateMediaButtons() {
    const mbtn = document.getElementById('srToggleMic');
    if (mbtn) {
      mbtn.innerHTML = `<i class="fas fa-${micActive ? 'microphone' : 'microphone-slash'}" style="${micActive ? '' : 'color: #ef4444;'}"></i>`;
      mbtn.classList.toggle('sr-ctrl-active', micActive);
    }
    const cbtn = document.getElementById('srToggleCamera');
    if (cbtn) {
      cbtn.innerHTML = `<i class="fas fa-${camActive ? 'video' : 'video-slash'}" style="${camActive ? '' : 'color: #ef4444;'}"></i>`;
      cbtn.classList.toggle('sr-ctrl-active', camActive);
    }
  }

  function setupAudioAnalysis() {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!audioContext && AudioCtx) audioContext = new AudioCtx();
      if (!audioContext) return;

      if (!localAudioAnalyser && localMediaStream && localMediaStream.getAudioTracks().length > 0) {
        localAudioSource = audioContext.createMediaStreamSource(localMediaStream);
        localAudioAnalyser = audioContext.createAnalyser();
        localAudioAnalyser.fftSize = 256;
        localAudioSource.connect(localAudioAnalyser);

        const dataArray = new Uint8Array(localAudioAnalyser.frequencyBinCount);
        if (speechInterval) clearInterval(speechInterval);

        speechInterval = setInterval(() => {
          if (!micActive || !localAudioAnalyser) {
            if (isSpeaking) {
              isSpeaking = false;
              document.getElementById('srTile_usr_self')?.classList.remove('sr-speaking');
              broadcastData({ type: 'speaking', speaking: false });
            }
            return;
          }

          localAudioAnalyser.getByteFrequencyData(dataArray);
          let sum = 0;
          for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
          const avg = sum / dataArray.length;
          const nowSpeaking = avg > 20;

          if (nowSpeaking !== isSpeaking) {
            isSpeaking = nowSpeaking;
            document.getElementById('srTile_usr_self')?.classList.toggle('sr-speaking', isSpeaking);
            broadcastData({ type: 'speaking', speaking: isSpeaking });
          }
        }, 200);
      }
    } catch (e) {}
  }

  async function toggleScreenShare() {
    const btn = document.getElementById('srToggleScreenShare');
    if (localScreenStream) {
      stopScreenShare();
      return;
    }
    try {
      localScreenStream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 30 } });
      const vTrack = localScreenStream.getVideoTracks()[0];
      if (vTrack) {
        vTrack.onended = () => stopScreenShare();
      }

      syncLocalMediaToAllPeers();
      if (btn) btn.classList.add('sr-ctrl-active');
      renderLocalScreenVideo(localScreenStream);
      notify('Screen sharing started.', 'success');
    } catch (err) {
      notify('Screen share canceled.', 'info');
    }
  }

  function stopScreenShare() {
    if (localScreenStream) {
      localScreenStream.getTracks().forEach(t => t.stop());
      localScreenStream = null;
    }
    const btn = document.getElementById('srToggleScreenShare');
    if (btn) btn.classList.remove('sr-ctrl-active');
    renderLocalScreenVideo(null);
    broadcastData({ type: 'webrtc-stop', streamType: 'screen' });
  }

  function handleRemoteStream(userId, stream, type) {
    if (type === 'screen') {
      renderRemoteScreenVideo(userId, stream);
    } else {
      renderRemoteMediaStream(userId, stream);
    }
  }

  function renderLocalScreenVideo(stream) {
    const localTile = document.getElementById('srTile_usr_self');
    if (!localTile) return;
    let video = localTile.querySelector('.sr-screen-video');
    if (!stream) {
      if (video) { video.pause(); video.srcObject = null; video.remove(); }
      const off = localTile.querySelector('.sr-video-off');
      if (off && !localTile.querySelector('.sr-cam-video')) off.style.display = 'flex';
      return;
    }
    const off = localTile.querySelector('.sr-video-off');
    if (off) off.style.display = 'none';

    if (!video) {
      video = document.createElement('video');
      video.className = 'sr-screen-video';
      video.autoplay = true;
      video.playsInline = true;
      video.muted = true;
      video.style.cssText = 'width:100%;height:100%;object-fit:contain;position:absolute;top:0;left:0;border-radius:12px;background:#000;z-index:2;';
      localTile.appendChild(video);
    }
    video.srcObject = stream;
  }

  function renderLocalCam(stream) {
    const localTile = document.getElementById('srTile_usr_self');
    if (!localTile) return;
    const off = localTile.querySelector('.sr-video-off');
    let camVideo = localTile.querySelector('.sr-cam-video');

    if (!stream) {
      if (camVideo) { camVideo.pause(); camVideo.srcObject = null; camVideo.remove(); }
      if (!localTile.querySelector('.sr-screen-video') && off) off.style.display = 'flex';
      return;
    }
    if (off) off.style.display = 'none';
    if (!camVideo) {
      camVideo = document.createElement('video');
      camVideo.className = 'sr-cam-video';
      camVideo.autoplay = true;
      camVideo.playsInline = true;
      camVideo.muted = true;
      camVideo.style.cssText = 'width:100%;height:100%;object-fit:cover;position:absolute;top:0;left:0;border-radius:12px;z-index:1;';
      localTile.appendChild(camVideo);
    }
    camVideo.srcObject = stream;
  }

  function renderRemoteScreenVideo(userId, stream) {
    const tile = document.getElementById(`srTile_${userId}`);
    if (!tile) return;
    const off = tile.querySelector('.sr-video-off');
    if (off) off.style.display = 'none';

    let video = tile.querySelector('.sr-screen-video');
    if (!video) {
      video = document.createElement('video');
      video.className = 'sr-screen-video';
      video.autoplay = true;
      video.playsInline = true;
      video.style.cssText = 'width:100%;height:100%;object-fit:contain;position:absolute;top:0;left:0;border-radius:12px;background:#000;z-index:2;';
      tile.appendChild(video);
    }
    video.srcObject = stream;
  }

  function renderRemoteMediaStream(userId, stream) {
    const tile = document.getElementById(`srTile_${userId}`);
    if (!tile) return;

    const hasVideo = stream.getVideoTracks().length > 0 && stream.getVideoTracks().some(t => t.enabled);
    const off = tile.querySelector('.sr-video-off');

    let audio = tile.querySelector('.sr-remote-audio');
    if (!audio) {
      audio = document.createElement('audio');
      audio.className = 'sr-remote-audio';
      audio.autoplay = true;
      audio.style.display = 'none';
      tile.appendChild(audio);
    }
    audio.srcObject = stream;

    let camVideo = tile.querySelector('.sr-cam-video');
    if (hasVideo) {
      if (off) off.style.display = 'none';
      if (!camVideo) {
        camVideo = document.createElement('video');
        camVideo.className = 'sr-cam-video';
        camVideo.autoplay = true;
        camVideo.playsInline = true;
        camVideo.style.cssText = 'width:100%;height:100%;object-fit:cover;position:absolute;top:0;left:0;border-radius:12px;z-index:1;';
        tile.appendChild(camVideo);
      }
      camVideo.srcObject = stream;
    } else {
      if (camVideo) { camVideo.pause(); camVideo.srcObject = null; camVideo.remove(); }
      if (!tile.querySelector('.sr-screen-video') && off) off.style.display = 'flex';
    }
  }

  function clearRemoteMedia(userId, type) {
    const tile = document.getElementById(`srTile_${userId}`);
    if (!tile) return;

    if (type === 'screen') {
      const video = tile.querySelector('.sr-screen-video');
      if (video) { video.pause(); video.srcObject = null; video.remove(); }
    } else {
      const cam = tile.querySelector('.sr-cam-video');
      if (cam) { cam.pause(); cam.srcObject = null; cam.remove(); }
      const aud = tile.querySelector('.sr-remote-audio');
      if (aud) { aud.pause(); aud.srcObject = null; aud.remove(); }
    }

    const off = tile.querySelector('.sr-video-off');
    if (off && !tile.querySelector('.sr-screen-video') && !tile.querySelector('.sr-cam-video')) {
      off.style.display = 'flex';
    }
  }

  function setupPushToTalk() {
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space' && !pttActive && !wbActive) {
        const tag = document.activeElement?.tagName.toLowerCase();
        if (tag === 'input' || tag === 'textarea') return;
        if (localMediaStream && localMediaStream.getAudioTracks().length > 0 && !micActive) {
          pttActive = true;
          localMediaStream.getAudioTracks()[0].enabled = true;
          const mbtn = document.getElementById('srToggleMic');
          if (mbtn) mbtn.classList.add('sr-ctrl-active');
        }
      }
    });

    window.addEventListener('keyup', (e) => {
      if (e.code === 'Space' && pttActive) {
        pttActive = false;
        if (localMediaStream && localMediaStream.getAudioTracks().length > 0 && !micActive) {
          localMediaStream.getAudioTracks()[0].enabled = false;
          const mbtn = document.getElementById('srToggleMic');
          if (mbtn) mbtn.classList.remove('sr-ctrl-active');
        }
      }
    });
  }

  /* ================================================================
     CHAT & MATERIAL SHARING
     ================================================================ */
  function sendChatMessage() {
    const input = document.getElementById('srChatInput');
    if (!input) return;
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    const msg = { sender: nickname, text, time: Date.now(), type: 'chat' };
    chatMessages.push(msg);
    broadcastData(msg);
    renderChatMessages();
  }

  function handleShareMaterial() {
    const fileInput = document.getElementById('srMaterialFile');
    if (!fileInput) return;
    fileInput.click();
    fileInput.onchange = async () => {
      const file = fileInput.files[0];
      if (!file) return;
      if (file.size > 4 * 1024 * 1024) {
        notify('File exceeds 4MB sharing limit.', 'error');
        return;
      }
      const reader = new FileReader();
      reader.onload = e => {
        const base64Data = e.target.result;
        broadcastData({ type: 'study-material', fileName: file.name, fileData: base64Data });
        receiveStudyMaterial(myId, base64Data, file.name);
      };
      reader.readAsDataURL(file);
      fileInput.value = '';
    };
  }

  function receiveStudyMaterial(fromId, fileData, fileName) {
    const senderName = (fromId === myId) ? nickname : (peers[fromId]?.nickname || 'Someone');
    const msgHtml = `Shared a file: <br><a href="${fileData}" download="${escapeHTML(fileName)}" class="sr-file-download-link"><i class="fas fa-file-download"></i> ${escapeHTML(fileName)}</a>`;
    chatMessages.push({ sender: senderName, text: msgHtml, time: Date.now(), type: 'html' });
    renderChatMessages();
    SoundFX.playPop();
  }

  function renderChatMessages() {
    const container = document.getElementById('srChatMessages');
    if (!container) return;
    if (chatMessages.length === 0) {
      container.innerHTML = '<div class="sr-chat-empty"><i class="fas fa-comments"></i><p>No messages yet.</p></div>';
      return;
    }
    container.innerHTML = chatMessages.map(m => {
      const isMe = m.sender === nickname;
      const timeStr = new Date(m.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      if (m.type === 'system') {
        return `<div class="sr-chat-msg sr-chat-system"><em>${m.text}</em></div>`;
      }
      return `
        <div class="sr-chat-msg ${isMe ? 'sr-chat-me' : 'sr-chat-other'}">
          <span class="sr-chat-sender">${escapeHTML(m.sender)}</span>
          <span class="sr-chat-text">${m.type === 'html' ? m.text : escapeHTML(m.text)}</span>
          <span class="sr-chat-time">${timeStr}</span>
        </div>`;
    }).join('');
    container.scrollTop = container.scrollHeight;
  }

  function addSystemMessage(text) {
    chatMessages.push({ sender: '', text, time: Date.now(), type: 'system' });
    renderChatMessages();
  }

  /* ================================================================
     WHITEBOARD
     ================================================================ */
  function toggleWhiteboard() {
    wbActive = !wbActive;
    const panel = document.getElementById('srWhiteboardPanel');
    const participantArea = document.getElementById('srParticipantArea');
    const btn = document.getElementById('srToggleWB');
    if (panel) panel.style.display = wbActive ? 'flex' : 'none';
    if (participantArea) participantArea.style.display = wbActive ? 'none' : 'block';
    if (btn) btn.classList.toggle('sr-ctrl-active', wbActive);
    if (wbActive) {
      setupCanvas();
      renderQuestionsUI();
    }
  }

  function setupCanvas() {
    wbCanvas = document.getElementById('srWbCanvas');
    wbOverlay = document.getElementById('srWbOverlay');
    if (!wbCanvas || !wbOverlay) return;
    wbCtx = wbCanvas.getContext('2d');
    wbOCtx = wbOverlay.getContext('2d');

    wbCanvas.width = wbCanvasW;
    wbCanvas.height = wbCanvasH;
    wbOverlay.width = wbCanvasW;
    wbOverlay.height = wbCanvasH;

    renderCanvasGrid();

    wbZoom = 1;
    wbPanX = (wbCanvasW - getWrapSize().w) / 2;
    wbPanY = (wbCanvasH - getWrapSize().h) / 2;
    applyTransform();
    updateZoomLabel();
    replayAllStrokes();
  }

  function renderCanvasGrid() {
    if (!wbCtx) return;
    wbCtx.fillStyle = '#181824';
    wbCtx.fillRect(0, 0, wbCanvasW, wbCanvasH);

    if (wbGridStyle === 'dots') {
      wbCtx.fillStyle = '#2e2e42';
      for (let x = 20; x < wbCanvasW; x += 40) {
        for (let y = 20; y < wbCanvasH; y += 40) {
          wbCtx.fillRect(x, y, 2, 2);
        }
      }
    }
  }

  function getWrapSize() {
    const wrap = document.getElementById('srWbCanvasWrap');
    return wrap ? { w: wrap.clientWidth, h: wrap.clientHeight } : { w: 960, h: 540 };
  }

  function applyTransform() {
    if (!wbCanvas || !wbOverlay) return;
    const tx = -wbPanX * wbZoom;
    const ty = -wbPanY * wbZoom;
    const t = `translate(${tx}px, ${ty}px) scale(${wbZoom})`;
    wbCanvas.style.transformOrigin = '0 0';
    wbCanvas.style.transform = t;
    wbOverlay.style.transformOrigin = '0 0';
    wbOverlay.style.transform = t;
  }

  function updateZoomLabel() {
    const lbl = document.getElementById('srWbZoomLabel');
    if (lbl) lbl.textContent = Math.round(wbZoom * 100) + '%';
  }

  function canvasXY(e) {
    const wrap = document.getElementById('srWbCanvasWrap');
    if (!wrap) return { x: 0, y: 0 };
    const rect = wrap.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    return { x: sx / wbZoom + wbPanX, y: sy / wbZoom + wbPanY };
  }

  function selectWbTool(tool) {
    wbTool = tool;
    document.querySelectorAll('.sr-wb-tool-btn[data-tool]').forEach(b => {
      b.classList.toggle('active', b.dataset.tool === tool);
    });
  }

  function initWhiteboardListeners() {
    const wrap = document.getElementById('srWbCanvasWrap');
    if (!wrap) return;

    document.querySelectorAll('.sr-wb-tool-btn[data-tool]').forEach(btn => {
      btn.addEventListener('click', () => selectWbTool(btn.dataset.tool));
    });

    document.getElementById('srWbColor')?.addEventListener('input', e => { wbColor = e.target.value; });
    document.getElementById('srWbPenSize')?.addEventListener('input', e => {
      wbPenSize = parseInt(e.target.value) || 3;
      const v = document.getElementById('srWbPenSizeVal');
      if (v) v.textContent = wbPenSize;
    });

    document.getElementById('srWbGridToggle')?.addEventListener('click', () => {
      wbGridStyle = wbGridStyle === 'dots' ? 'none' : 'dots';
      renderCanvasGrid();
      replayAllStrokes();
    });

    document.getElementById('srWbUndo')?.addEventListener('click', () => {
      undoCanvasLocal();
      broadcastData({ type: 'wb-undo' });
    });

    document.getElementById('srWbRedo')?.addEventListener('click', () => {
      redoCanvasLocal();
      broadcastData({ type: 'wb-redo' });
    });

    document.getElementById('srWbClear')?.addEventListener('click', () => {
      clearCanvasLocal();
      broadcastData({ type: 'wb-clear' });
    });

    document.getElementById('srWbAddQ')?.addEventListener('click', addQuestion);

    document.getElementById('srWbZoomIn')?.addEventListener('click', () => {
      const r = wrap.getBoundingClientRect();
      zoomAtPoint(wbZoom * 1.25, r.left + r.width / 2, r.top + r.height / 2);
    });
    document.getElementById('srWbZoomOut')?.addEventListener('click', () => {
      const r = wrap.getBoundingClientRect();
      zoomAtPoint(wbZoom / 1.25, r.left + r.width / 2, r.top + r.height / 2);
    });
    document.getElementById('srWbZoomReset')?.addEventListener('click', () => {
      wbZoom = 1;
      wbPanX = (wbCanvasW - getWrapSize().w) / 2;
      wbPanY = (wbCanvasH - getWrapSize().h) / 2;
      applyTransform();
      updateZoomLabel();
    });

    document.getElementById('srWbFullscreen')?.addEventListener('click', () => {
      const panel = document.getElementById('srWhiteboardPanel');
      if (!document.fullscreenElement) panel?.requestFullscreen().catch(() => {});
      else document.exitFullscreen().catch(() => {});
    });

    document.getElementById('srWbDownload')?.addEventListener('click', downloadWhiteboard);
    document.getElementById('srWbSaveLib')?.addEventListener('click', saveWhiteboardToLibrary);

    wrap.addEventListener('wheel', e => {
      e.preventDefault();
      const factor = e.deltaY > 0 ? 0.9 : 1.1;
      zoomAtPoint(wbZoom * factor, e.clientX, e.clientY);
    }, { passive: false });

    wrap.addEventListener('pointerdown', onPointerDown);
    wrap.addEventListener('pointermove', onPointerMove);
    wrap.addEventListener('pointerup', onPointerUp);
  }

  function zoomAtPoint(newZoom, screenX, screenY) {
    const wrap = document.getElementById('srWbCanvasWrap');
    if (!wrap) return;
    const rect = wrap.getBoundingClientRect();
    const sx = screenX - rect.left;
    const sy = screenY - rect.top;
    const vxBefore = sx / wbZoom + wbPanX;
    const vyBefore = sy / wbZoom + wbPanY;
    wbZoom = Math.max(0.1, Math.min(4, newZoom));
    wbPanX = vxBefore - sx / wbZoom;
    wbPanY = vyBefore - sy / wbZoom;
    applyTransform();
    updateZoomLabel();
  }

  function onPointerDown(e) {
    if (!wbCtx) setupCanvas();
    const { x, y } = canvasXY(e);

    if (e.button === 1 || wbTool === 'pan' || e.spaceKey) {
      wbPanning = true;
      wbPanStart = { mx: e.clientX, my: e.clientY, px: wbPanX, py: wbPanY };
      return;
    }
    if (e.button !== 0 && e.pointerType === 'mouse') return;

    wbDrawing = true;
    wbRedoStrokes = [];

    if (['line', 'arrow', 'rect', 'circle'].includes(wbTool)) {
      wbShapeStart = { x, y };
      return;
    }

    if (wbTool === 'text') {
      const text = prompt('Enter text for canvas:');
      if (text) {
        drawTextOnCanvas(text, x, y, wbColor, wbPenSize * 4 + 12);
        wbStrokes.push({ type: 'text', text, x, y, color: wbColor, size: wbPenSize * 4 + 12 });
        broadcastData({ type: 'wb-text', text, x, y, color: wbColor, size: wbPenSize * 4 + 12 });
      }
      wbDrawing = false;
      return;
    }

    _liveStrokePoints = [{ x, y }];
    wbCtx.beginPath();
    wbCtx.moveTo(x, y);
  }

  function onPointerMove(e) {
    const { x, y } = canvasXY(e);

    if (Date.now() - _lastLiveBroadcast > 50) {
      broadcastData({ type: 'wb-cursor', x, y, color: wbColor });
      _lastLiveBroadcast = Date.now();
    }

    if (wbPanning && wbPanStart) {
      wbPanX = wbPanStart.px - (e.clientX - wbPanStart.mx) / wbZoom;
      wbPanY = wbPanStart.py - (e.clientY - wbPanStart.my) / wbZoom;
      applyTransform();
      return;
    }

    if (!wbDrawing || !wbCtx) return;

    if (wbShapeStart) {
      wbOCtx.clearRect(0, 0, wbCanvasW, wbCanvasH);
      drawShapeOnContext(wbOCtx, wbTool, wbShapeStart, { x, y }, wbColor, wbPenSize);
      return;
    }

    _liveStrokePoints.push({ x, y });

    if (_liveStrokePoints.length % 3 === 0) {
      broadcastData({
        type: 'wb-live-draw',
        points: _liveStrokePoints.slice(-4),
        color: wbTool === 'eraser' ? '#181824' : wbColor,
        size: wbTool === 'eraser' ? wbEraserSize : wbPenSize,
        tool: wbTool,
        alpha: wbTool === 'highlighter' ? 0.3 : 1
      });
    }

    wbCtx.save();
    wbCtx.strokeStyle = wbTool === 'eraser' ? '#181824' : wbColor;
    wbCtx.lineWidth = wbTool === 'eraser' ? wbEraserSize : (wbTool === 'highlighter' ? wbHighlighterSize : wbPenSize);
    wbCtx.globalAlpha = wbTool === 'highlighter' ? 0.3 : 1;
    wbCtx.lineCap = 'round';
    wbCtx.lineJoin = 'round';
    wbCtx.lineTo(x, y);
    wbCtx.stroke();
    wbCtx.beginPath();
    wbCtx.moveTo(x, y);
    wbCtx.restore();
  }

  function onPointerUp(e) {
    if (wbPanning) { wbPanning = false; return; }
    if (!wbDrawing) return;
    wbDrawing = false;
    const { x, y } = canvasXY(e);

    if (wbShapeStart) {
      wbOCtx.clearRect(0, 0, wbCanvasW, wbCanvasH);
      drawShapeOnCanvas(wbTool, wbShapeStart, { x, y }, wbColor, wbPenSize);
      wbStrokes.push({ type: 'shape', shape: wbTool, start: wbShapeStart, end: { x, y }, color: wbColor, size: wbPenSize });
      broadcastData({ type: 'wb-shape', shape: wbTool, start: wbShapeStart, end: { x, y }, color: wbColor, size: wbPenSize });
      wbShapeStart = null;
      return;
    }

    if (_liveStrokePoints.length > 1) {
      const strokeData = {
        type: 'stroke',
        points: _liveStrokePoints.slice(),
        color: wbTool === 'eraser' ? '#181824' : wbColor,
        size: wbTool === 'eraser' ? wbEraserSize : (wbTool === 'highlighter' ? wbHighlighterSize : wbPenSize),
        tool: wbTool,
        alpha: wbTool === 'highlighter' ? 0.3 : 1
      };
      wbStrokes.push(strokeData);
      broadcastData({ type: 'wb-stroke', ...strokeData });
    }
    _liveStrokePoints = [];
  }

  function drawShapeOnContext(ctx, shape, start, end, color, size) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = size;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();

    if (shape === 'line') {
      ctx.moveTo(start.x, start.y);
      ctx.lineTo(end.x, end.y);
      ctx.stroke();
    } else if (shape === 'arrow') {
      ctx.moveTo(start.x, start.y);
      ctx.lineTo(end.x, end.y);
      ctx.stroke();
      const angle = Math.atan2(end.y - start.y, end.x - start.x);
      const headLen = size * 3 + 8;
      ctx.beginPath();
      ctx.moveTo(end.x, end.y);
      ctx.lineTo(end.x - headLen * Math.cos(angle - Math.PI / 6), end.y - headLen * Math.sin(angle - Math.PI / 6));
      ctx.lineTo(end.x - headLen * Math.cos(angle + Math.PI / 6), end.y - headLen * Math.sin(angle + Math.PI / 6));
      ctx.closePath();
      ctx.fill();
    } else if (shape === 'rect') {
      ctx.strokeRect(Math.min(start.x, end.x), Math.min(start.y, end.y), Math.abs(end.x - start.x), Math.abs(end.y - start.y));
    } else if (shape === 'circle') {
      const rx = Math.abs(end.x - start.x) / 2;
      const ry = Math.abs(end.y - start.y) / 2;
      const cx = Math.min(start.x, end.x) + rx;
      const cy = Math.min(start.y, end.y) + ry;
      ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawShapeOnCanvas(shape, start, end, color, size) {
    if (!wbCtx) return;
    drawShapeOnContext(wbCtx, shape, start, end, color, size);
  }

  function drawTextOnCanvas(text, x, y, color, size) {
    if (!wbCtx) return;
    wbCtx.save();
    wbCtx.fillStyle = color;
    wbCtx.font = `600 ${size}px 'DM Sans', sans-serif`;
    wbCtx.fillText(text, x, y);
    wbCtx.restore();
  }

  function replayLivePoints(points, color, size, tool, alpha) {
    if (!wbCtx || !points || points.length < 2) return;
    wbCtx.save();
    wbCtx.strokeStyle = color;
    wbCtx.lineWidth = size;
    wbCtx.globalAlpha = alpha || 1;
    wbCtx.lineCap = 'round';
    wbCtx.lineJoin = 'round';
    wbCtx.beginPath();
    wbCtx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      wbCtx.lineTo(points[i].x, points[i].y);
    }
    wbCtx.stroke();
    wbCtx.restore();
  }

  function replayStroke(points, color, size, tool, alpha) {
    replayLivePoints(points, color, size, tool, alpha);
  }

  function replayAllStrokes() {
    renderCanvasGrid();
    for (const cmd of wbStrokes) {
      if (cmd.type === 'stroke') replayStroke(cmd.points, cmd.color, cmd.size, cmd.tool, cmd.alpha);
      else if (cmd.type === 'shape') drawShapeOnCanvas(cmd.shape, cmd.start, cmd.end, cmd.color, cmd.size);
      else if (cmd.type === 'text') drawTextOnCanvas(cmd.text, cmd.x, cmd.y, cmd.color, cmd.size);
    }
  }

  function renderRemoteCursors() {
    if (!wbOCtx) return;
    wbOCtx.clearRect(0, 0, wbCanvasW, wbCanvasH);

    const now = Date.now();
    Object.entries(wbRemoteCursors).forEach(([uId, cur]) => {
      if (now - cur.lastSeen > 5000) return;
      wbOCtx.save();
      wbOCtx.fillStyle = cur.color;
      wbOCtx.beginPath();
      wbOCtx.arc(cur.x, cur.y, 5 / wbZoom, 0, Math.PI * 2);
      wbOCtx.fill();

      wbOCtx.fillStyle = 'rgba(0,0,0,0.7)';
      wbOCtx.fillRect(cur.x + 8 / wbZoom, cur.y - 12 / wbZoom, 80 / wbZoom, 18 / wbZoom);
      wbOCtx.fillStyle = '#fff';
      wbOCtx.font = `${11 / wbZoom}px sans-serif`;
      wbOCtx.fillText(cur.name, cur.x + 12 / wbZoom, cur.y);
      wbOCtx.restore();
    });
  }

  function undoCanvasLocal() {
    if (wbStrokes.length === 0 || !wbCtx) return;
    wbRedoStrokes.push(wbStrokes.pop());
    replayAllStrokes();
  }

  function redoCanvasLocal() {
    if (wbRedoStrokes.length === 0 || !wbCtx) return;
    wbStrokes.push(wbRedoStrokes.pop());
    replayAllStrokes();
  }

  function clearCanvasLocal() {
    if (!wbCtx || !wbCanvas) return;
    wbStrokes = [];
    wbRedoStrokes = [];
    renderCanvasGrid();
  }

  function downloadWhiteboard() {
    if (!wbCanvas) return;
    const a = document.createElement('a');
    a.href = wbCanvas.toDataURL('image/png');
    a.download = `StudyRoom-Whiteboard-${Date.now()}.png`;
    a.click();
    notify('Whiteboard downloaded.', 'success');
  }

  async function saveWhiteboardToLibrary() {
    if (!wbCanvas) return;
    wbCanvas.toBlob(async (blob) => {
      if (!blob) return;
      const file = new File([blob], `Whiteboard-${Date.now()}.png`, { type: 'image/png' });
      if (typeof window.importFileFromAnySource === 'function') {
        await window.importFileFromAnySource(file);
        notify('Whiteboard saved to Library.', 'success');
      }
    }, 'image/png');
  }

  function maybeGrowCanvas(points) {
    let needW = wbCanvasW;
    let needH = wbCanvasH;
    for (const p of points) {
      if (p.x + 500 > needW) needW += 1024;
      if (p.y + 500 > needH) needH += 1024;
    }
    if (needW > wbCanvasW || needH > wbCanvasH) {
      wbCanvasW = Math.min(16384, needW);
      wbCanvasH = Math.min(16384, needH);
      if (wbCanvas) { wbCanvas.width = wbCanvasW; wbCanvas.height = wbCanvasH; }
      if (wbOverlay) { wbOverlay.width = wbCanvasW; wbOverlay.height = wbCanvasH; }
      replayAllStrokes();
    }
  }

  function addQuestion() {
    const id = wbNextQId++;
    wbQuestions.push({ id, question: '', answer: '' });
    renderQuestionsUI();
    broadcastData({ type: 'wb-questions', questions: wbQuestions, nextId: wbNextQId });
  }

  function renderQuestionsUI() {
    const list = document.getElementById('srWbQList');
    if (!list) return;

    if (wbQuestions.length === 0) {
      list.innerHTML = '<div class="sr-wb-q-empty"><i class="fas fa-clipboard-list"></i><p>No questions added yet.</p></div>';
      return;
    }

    list.innerHTML = wbQuestions.map((q, idx) => `
      <div class="sr-wb-q-item" data-qid="${q.id}">
        <div class="sr-wb-q-num">Q${idx + 1}
          <button class="sr-wb-q-del" data-qid="${q.id}" title="Remove"><i class="fas fa-times"></i></button>
        </div>
        <textarea class="sr-wb-q-textarea" data-field="question" data-qid="${q.id}" placeholder="Type question / topic…">${escapeHTML(q.question)}</textarea>
        <textarea class="sr-wb-q-textarea sr-wb-q-answer" data-field="answer" data-qid="${q.id}" placeholder="Type notes / solution…">${escapeHTML(q.answer)}</textarea>
      </div>
    `).join('');

    list.querySelectorAll('.sr-wb-q-textarea').forEach(ta => {
      ta.addEventListener('input', e => {
        const qid = parseInt(e.target.dataset.qid);
        const field = e.target.dataset.field;
        const q = wbQuestions.find(item => item.id === qid);
        if (q) {
          q[field] = e.target.value;
          broadcastData({ type: 'wb-questions', questions: wbQuestions, nextId: wbNextQId });
        }
      });
    });

    list.querySelectorAll('.sr-wb-q-del').forEach(btn => {
      btn.addEventListener('click', e => {
        const qid = parseInt(e.currentTarget.dataset.qid);
        wbQuestions = wbQuestions.filter(q => q.id !== qid);
        renderQuestionsUI();
        broadcastData({ type: 'wb-questions', questions: wbQuestions, nextId: wbNextQId });
      });
    });
  }

  function updateParticipantsUI() {
    const list = document.getElementById('srParticipantsList');
    if (list) list.innerHTML = buildParticipantsHTML();
    syncVideoTiles();
    updatePeopleCount();
  }

  function updateProgressUI() {
    const list = document.getElementById('srProgressList');
    if (list) list.innerHTML = buildProgressHTML();
  }

  function updatePeopleCount() {
    const badge = document.getElementById('srPeopleCount');
    if (badge) badge.textContent = 1 + Object.keys(peers).length;
  }

  async function handleCreate() {
    SoundFX.init();
    nickname = document.getElementById('srNickname')?.value.trim() || 'Student';
    localStorage.setItem('questionary-study-nickname', nickname);
    roomPassword = document.getElementById('srCreatePassword')?.value || '';
    isHost = true;
    const newRoomId = generateRoomId();

    try {
      showLoading('Creating room…');
      roomAddress = newRoomId;
      await connectHub(newRoomId);
      sendToServer({ action: 'host', nickname, password: roomPassword });
    } catch (err) {
      hideLoading();
      cleanup();
      renderStudyRoom();
      notify('Could not create room: ' + (err.message || err), 'error');
    }
  }

  async function handleJoin() {
    SoundFX.init();
    nickname = document.getElementById('srNickname')?.value.trim() || 'Student';
    localStorage.setItem('questionary-study-nickname', nickname);
    const rawInput = document.getElementById('srJoinAddress')?.value.trim();
    if (!rawInput) {
      notify('Please enter a room code.', 'error');
      return;
    }
    roomPassword = document.getElementById('srJoinPassword')?.value || '';
    isHost = false;

    const parsedCode = normalizeRoomCode(rawInput);
    if (!parsedCode) {
      notify('Enter a valid room code (alphanumeric).', 'error');
      return;
    }

    roomAddress = parsedCode;

    try {
      showLoading('Connecting to study room…');
      await connectHub(parsedCode);
      sendToServer({ action: 'join', nickname, password: roomPassword });
    } catch (err) {
      hideLoading();
      cleanup();
      renderStudyRoom();
      notify(err.message || 'Failed to connect to room.', 'error');
    }
  }

  async function leaveRoom() {
    if (typeof window.showConfirm === 'function') {
      const ok = await window.showConfirm('Leave Study Room?');
      if (!ok) return;
    }
    doLeave();
    renderStudyRoom();
    notify('Left study session.', 'info');
  }

  function forceLeaveRoom() {
    doLeave();
    renderStudyRoom();
  }

  function doLeave() {
    if (mainInterval) { clearInterval(mainInterval); mainInterval = null; }
    if (speechInterval) { clearInterval(speechInterval); speechInterval = null; }
    stopScreenShare();

    if (localMediaStream) {
      localMediaStream.getTracks().forEach(t => t.stop());
      localMediaStream = null;
    }

    if (ws) {
      try { ws.close(); } catch (_) {}
      ws = null;
    }

    sessionActive = false;
    isHost = false;
    myId = '';
    peers = {};
    roomAddress = '';
    roomPassword = '';
    chatMessages = [];
    studyGoal = '';
    timerSeconds = 0;
    timerRemaining = 25 * 60;
    timerRunning = false;
    timerMode = 'stopwatch';
    wbActive = false;
    unreadChatCount = 0;
    handRaised = false;
    micActive = false;
    camActive = false;
    isSpeaking = false;
  }

  function cleanup() {
    if (ws) { try { ws.close(); } catch (_) {} ws = null; }
    sessionActive = false;
    isHost = false;
    myId = '';
    peers = {};
  }

  function showLoading(msg) {
    let overlay = document.getElementById('srLoadingOverlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'srLoadingOverlay';
      overlay.className = 'sr-loading-overlay';
      document.body.appendChild(overlay);
    }
    overlay.innerHTML = `<div class="sr-loading-box"><div class="sr-spinner"></div><p>${msg || 'Connecting…'}</p></div>`;
    overlay.style.display = 'flex';
  }

  function hideLoading() {
    const overlay = document.getElementById('srLoadingOverlay');
    if (overlay) overlay.style.display = 'none';
  }

  async function testMicrophone() {
    try {
      const select = document.getElementById('audioInputSelect');
      const deviceId = select ? select.value : undefined;
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: deviceId ? { deviceId: { exact: deviceId } } : true
      });

      const row = document.getElementById('micTestVolumeRow');
      const bar = document.getElementById('micTestVolumeBar');
      if (row) row.style.display = 'flex';

      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      const ctx = new AudioCtx();
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      src.connect(analyser);

      const data = new Uint8Array(analyser.frequencyBinCount);
      let count = 0;
      const interval = setInterval(() => {
        analyser.getByteFrequencyData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) sum += data[i];
        const vol = Math.min(100, Math.round((sum / data.length) * 2));
        if (bar) bar.style.width = vol + '%';
        count++;
        if (count > 50) {
          clearInterval(interval);
          stream.getTracks().forEach(t => t.stop());
          ctx.close();
          if (row) row.style.display = 'none';
        }
      }, 100);
      notify('Testing microphone for 5 seconds… Speak now.', 'info');
    } catch (e) {
      notify('Microphone test failed: ' + e.message, 'error');
    }
  }

  function testSpeaker() {
    SoundFX.playChime();
    notify('Playing test sound…', 'info');
  }

  async function testCamera() {
    const container = document.getElementById('camTestContainer');
    const video = document.getElementById('camTestVideo');
    const select = document.getElementById('videoInputSelect');
    const deviceId = select ? select.value : undefined;

    if (!container || !video) return;

    if (container.style.display !== 'none' && video.srcObject) {
      video.srcObject.getTracks().forEach(t => t.stop());
      video.srcObject = null;
      container.style.display = 'none';
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: deviceId ? { deviceId: { exact: deviceId } } : true
      });
      video.srcObject = stream;
      container.style.display = 'block';
      notify('Camera test active. Click Test again to stop.', 'info');
    } catch (e) {
      notify('Camera test failed: ' + e.message, 'error');
    }
  }

  async function initStudyRoomMediaSettings() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return;
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioSelect = document.getElementById('audioInputSelect');
      const videoSelect = document.getElementById('videoInputSelect');
      const speakerSelect = document.getElementById('audioOutputSelect');

      if (audioSelect) {
        audioSelect.innerHTML = '<option value="">Default Microphone</option>';
        devices.filter(d => d.kind === 'audioinput').forEach((d, i) => {
          audioSelect.innerHTML += `<option value="${d.deviceId}">${d.label || `Microphone ${i + 1}`}</option>`;
        });
      }

      if (videoSelect) {
        videoSelect.innerHTML = '<option value="">Default Camera</option>';
        devices.filter(d => d.kind === 'videoinput').forEach((d, i) => {
          videoSelect.innerHTML += `<option value="${d.deviceId}">${d.label || `Camera ${i + 1}`}</option>`;
        });
      }

      if (speakerSelect) {
        speakerSelect.innerHTML = '<option value="">Default Speaker</option>';
        devices.filter(d => d.kind === 'audiooutput').forEach((d, i) => {
          speakerSelect.innerHTML += `<option value="${d.deviceId}">${d.label || `Speaker ${i + 1}`}</option>`;
        });
      }
    } catch (e) {
      console.warn('[StudyRoom] Enumerate devices notice:', e);
    }
  }

  /* ================================================================
     GLOBAL EXPORTS
     ================================================================ */
  window.renderStudyRoom = renderStudyRoom;
  window.leaveStudyRoom = leaveRoom;
  window.srToggleMicrophone = toggleMicrophone;
  window.srToggleCamera = toggleCamera;
  window.srToggleScreenShare = toggleScreenShare;
  window.srToggleWB = toggleWhiteboard;
  window.srToggleHand = toggleRaiseHand;
  window.srKickUser = (targetId) => {
    if (isHost) broadcastData({ type: 'mod-kick', targetId });
  };
  window.wbSelectTool = selectWbTool;
  window.wbUndo = () => {
    undoCanvasLocal();
    broadcastData({ type: 'wb-undo' });
  };
  window.wbRedo = () => {
    redoCanvasLocal();
    broadcastData({ type: 'wb-redo' });
  };
  window.isWhiteboardActive = () => wbActive && sessionActive;
  window.testMicrophone = testMicrophone;
  window.testSpeaker = testSpeaker;
  window.testCamera = testCamera;
  window.initStudyRoomMediaSettings = initStudyRoomMediaSettings;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', renderStudyRoom);
  } else {
    renderStudyRoom();
  }

})();