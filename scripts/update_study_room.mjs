import fs from 'node:fs';

const filePath = '/home/Nugget/Questionary/src/js/studyRoom.js';
let code = fs.readFileSync(filePath, 'utf8');

// 1. Ensure engine version global is defined at top
const versionDecl = 'window.STUDY_ROOM_ENGINE_VERSION = "4.0";\n';
if (!code.includes('STUDY_ROOM_ENGINE_VERSION')) {
  code = code.replace(
    "/* ================================================================\n   QUESTIONARY — STUDY ROOM ENGINE 4.0 (HIGH-SPEED P2P + MULTI-MESH)\n   ================================================================ */\n\n(function () {\n  'use strict';",
    "/* ================================================================\n   QUESTIONARY — STUDY ROOM ENGINE 4.0 (HIGH-SPEED P2P + MULTI-MESH)\n   ================================================================ */\n\nwindow.STUDY_ROOM_ENGINE_VERSION = '4.0';\n\n(function () {\n  'use strict';"
  );
}

// 2. Enhance PeerJSRoomHub with Dual-Transport (WebRTC DataChannel + WebSocket Signaling Relay)
const oldHubStart = `  class PeerJSRoomHub {
    constructor() {
      this.readyState = 0; // 0: connecting, 1: open, 3: closed
      this.peer = null;
      this.hostConn = null;
      this.connections = new Map(); // peerJsId -> DataConnection
      this.activeCalls = new Map(); // peerJsId -> MediaConnection
      this.peerJsToUser = new Map(); // peerJsId -> userId
      this.userToPeerJs = new Map(); // userId -> peerJsId
      this.nextUserNum = 1;
      this.onmessage = null;
      this.onopen = null;
      this.onclose = null;
      this.onerror = null;
      this.connectTimeoutTimer = null;
      this.outboxQueue = [];
      this.hasJoined = false;
    }`;

const newHubStart = `  class PeerJSRoomHub {
    constructor() {
      this.readyState = 0; // 0: connecting, 1: open, 3: closed
      this.peer = null;
      this.hostConn = null;
      this.targetHostPeerId = '';
      this.connections = new Map(); // peerJsId -> DataConnection
      this.activeCalls = new Map(); // peerJsId -> MediaConnection
      this.peerJsToUser = new Map(); // peerJsId -> userId
      this.userToPeerJs = new Map(); // userId -> peerJsId
      this.nextUserNum = 1;
      this.onmessage = null;
      this.onopen = null;
      this.onclose = null;
      this.onerror = null;
      this.connectTimeoutTimer = null;
      this.outboxQueue = [];
      this.hasJoined = false;
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
    }`;

if (code.includes(oldHubStart)) {
  code = code.replace(oldHubStart, newHubStart);
}

// 3. Update init method in PeerJSRoomHub to attach relay-data listener and dual-handshake
const oldInitTarget = `        // Handle signaling connection open
        this.peer.on('open', (assignedId) => {
          console.log(\`[StudyRoom-Debug] PeerJS Signaling open. Assigned ID: \${assignedId}\`);

          if (isHost) {
            clearTimeout(this.connectTimeoutTimer);
            this.readyState = 1;
            this.peerJsToUser.set(assignedId, 'usr_host');
            this.userToPeerJs.set('usr_host', assignedId);
            isResolved = true;
            if (this.onopen) this.onopen();
            resolve();
          } else {
            console.log(\`[StudyRoom-Debug] Guest establishing WebRTC DataChannel to Host: \${targetHostPeerId}\`);
            this.peerJsToUser.set(targetHostPeerId, 'usr_host');
            this.userToPeerJs.set('usr_host', targetHostPeerId);

            // Connect to host with JSON serialization
            this.hostConn = this.peer.connect(targetHostPeerId, {
              serialization: 'json',
              reliable: true
            });

            this.hostConn.on('open', () => {
              console.log('[StudyRoom-Debug] Guest DataChannel to Host is OPEN & READY.');
              clearTimeout(this.connectTimeoutTimer);
              this.readyState = 1;
              if (this.onopen) this.onopen();
              this.flushOutbox();
              if (!isResolved) {
                isResolved = true;
                resolve();
              }
            });

            this.hostConn.on('data', (raw) => {
              if (this.readyState !== 1) {
                this.readyState = 1;
                clearTimeout(this.connectTimeoutTimer);
              }
              if (this.onmessage) {
                const dataStr = typeof raw === 'string' ? raw : JSON.stringify(raw);
                this.onmessage({ data: dataStr });
              }
            });

            this.hostConn.on('error', (err) => {
              console.error('[StudyRoom-Debug] Guest DataChannel error:', err);
            });

            this.hostConn.on('close', () => {
              console.warn('[StudyRoom-Debug] Guest DataChannel to Host closed.');
              this.readyState = 3;
              if (this.onclose) this.onclose();
            });
          }
        });`;

const newInitTarget = `        this.targetHostPeerId = targetHostPeerId;

        // Listen for WebSocket Relay messages (fallback & fast path)
        this.peer.on('relay-data', (msg, senderPeerJsId) => {
          if (!msg || typeof msg !== 'object') return;
          if (msg._mid && this.isDuplicate(msg._mid)) return;

          if (isHost) {
            this.handleHostIncoming(null, msg, senderPeerJsId);
          } else {
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
              const dataStr = typeof msg === 'string' ? msg : JSON.stringify(msg);
              this.onmessage({ data: dataStr });
            }
          }
        });

        // Handle signaling connection open
        this.peer.on('open', (assignedId) => {
          console.log(\`[StudyRoom-Debug] PeerJS Signaling open. Assigned ID: \${assignedId}\`);

          if (isHost) {
            clearTimeout(this.connectTimeoutTimer);
            this.readyState = 1;
            this.peerJsToUser.set(assignedId, 'usr_host');
            this.userToPeerJs.set('usr_host', assignedId);
            isResolved = true;
            if (this.onopen) this.onopen();
            resolve();
          } else {
            console.log(\`[StudyRoom-Debug] Guest establishing connection to Host: \${targetHostPeerId}\`);
            this.peerJsToUser.set(targetHostPeerId, 'usr_host');
            this.userToPeerJs.set('usr_host', targetHostPeerId);

            // 1. Send immediate join handshake via Signaling Relay
            const joinHandshake = {
              _mid: 'join_' + Date.now(),
              action: 'join',
              nickname: nickname || 'Student',
              password: roomPassword || ''
            };
            if (typeof this.peer.sendRelay === 'function') {
              this.peer.sendRelay(targetHostPeerId, joinHandshake);
            }

            // 2. Also establish WebRTC DataChannel if supported
            try {
              this.hostConn = this.peer.connect(targetHostPeerId, {
                serialization: 'json',
                reliable: true
              });

              this.hostConn.on('open', () => {
                console.log('[StudyRoom-Debug] Guest DataChannel to Host is OPEN & READY.');
                clearTimeout(this.connectTimeoutTimer);
                this.readyState = 1;
                if (this.onopen) this.onopen();
                this.flushOutbox();
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

              this.hostConn.on('error', (err) => {
                console.warn('[StudyRoom-Debug] Guest DataChannel notice:', err);
              });

              this.hostConn.on('close', () => {
                console.warn('[StudyRoom-Debug] Guest DataChannel to Host closed.');
              });
            } catch (err) {
              console.warn('[StudyRoom-Debug] WebRTC DataChannel connect bypassed, operating via WebSocket Relay:', err);
              // Resolved via relay
              if (!isResolved) {
                this.readyState = 1;
                clearTimeout(this.connectTimeoutTimer);
                if (this.onopen) this.onopen();
                isResolved = true;
                resolve();
              }
            }
          }
        });`;

if (code.includes(oldInitTarget)) {
  code = code.replace(oldInitTarget, newInitTarget);
}

// 4. Update send & broadcastToAll & handleHostIncoming
const oldSendTarget = `    send(str) {
      const payload = typeof str === 'string' ? JSON.parse(str) : str;

      if (isHost) {
        this.handleHostIncoming(null, payload);
        return true;
      }

      if (this.hostConn && this.hostConn.open) {
        try {
          this.hostConn.send(payload);
          return true;
        } catch (e) {
          this.outboxQueue.push(str);
          return false;
        }
      } else {
        this.outboxQueue.push(str);
        return false;
      }
    }

    handleHostIncoming(senderConn, msg) {
      const senderPeerJsId = senderConn ? senderConn.peer : (this.peer ? this.peer.id : 'usr_host');

      if (msg.action === 'host') {
        myId = 'usr_host';
        if (this.onmessage) {
          this.onmessage({ data: JSON.stringify({ action: 'welcome', id: 'usr_host' }) });
          this.onmessage({ data: JSON.stringify({ action: 'hosted' }) });
        }
        return;
      }

      if (msg.action === 'join') {
        console.log(\`[StudyRoom-Debug] Host processing join from \${senderPeerJsId} (\${msg.nickname})\`);

        if (roomLocked) {
          if (senderConn && senderConn.open) {
            senderConn.send({ action: 'auth-fail', reason: 'Room is locked by host.' });
          }
          return;
        }
        if (roomPassword && msg.password !== roomPassword) {
          if (senderConn && senderConn.open) {
            senderConn.send({ action: 'auth-fail', reason: 'Incorrect room password.' });
          }
          return;
        }

        let newUserId = this.peerJsToUser.get(senderPeerJsId);
        const isNewUser = !newUserId;
        if (isNewUser) {
          newUserId = 'usr_' + (this.nextUserNum++);
          this.peerJsToUser.set(senderPeerJsId, newUserId);
          this.userToPeerJs.set(newUserId, senderPeerJsId);
        }

        // Build list of all existing peers for the newcomer
        const currentPeersList = [];
        for (const [uId, pId] of this.userToPeerJs.entries()) {
          if (uId !== newUserId) {
            const nick = uId === 'usr_host' ? nickname : (peers[uId]?.nickname || 'Student');
            currentPeersList.push({ id: uId, nickname: nick, peerJsId: pId });
          }
        }

        if (senderConn && senderConn.open) {
          senderConn.send({ action: 'welcome', id: newUserId });
          senderConn.send({ action: 'joined', peers: currentPeersList, locked: roomLocked });
        }

        if (isNewUser) {
          const joinNotice = { action: 'peer-joined', id: newUserId, nickname: msg.nickname, peerJsId: senderPeerJsId };
          this.broadcastToAll(joinNotice, newUserId);
          if (this.onmessage) this.onmessage({ data: JSON.stringify(joinNotice) });
        }
        return;
      }

      const senderUserId = this.peerJsToUser.get(senderPeerJsId) || 'usr_host';

      if (msg.action === 'relay') {
        const relayNotice = { action: 'relay', from: senderUserId, data: msg.data };
        this.broadcastToAll(relayNotice, senderUserId);
        if (senderUserId !== 'usr_host' && this.onmessage) {
          this.onmessage({ data: JSON.stringify(relayNotice) });
        }
        return;
      }
    }

    broadcastToAll(msgObj, excludeUserId = null) {
      for (const [pId, conn] of this.connections.entries()) {
        const uId = this.peerJsToUser.get(pId);
        if (uId !== excludeUserId && conn.open) {
          try { conn.send(msgObj); } catch (e) {}
        }
      }
    }`;

const newSendTarget = `    send(str) {
      const payload = typeof str === 'string' ? JSON.parse(str) : str;
      if (!payload._mid) payload._mid = 'm_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);

      if (isHost) {
        this.handleHostIncoming(null, payload, this.peer ? this.peer.id : 'usr_host');
        return true;
      }

      // 1. Send via DataChannel if open
      let sentDC = false;
      if (this.hostConn && this.hostConn.open) {
        try {
          this.hostConn.send(payload);
          sentDC = true;
        } catch (e) {}
      }

      // 2. Send via WebSocket Signaling Relay
      let sentRelay = false;
      if (this.peer && typeof this.peer.sendRelay === 'function' && this.targetHostPeerId) {
        sentRelay = this.peer.sendRelay(this.targetHostPeerId, payload);
      }

      if (!sentDC && !sentRelay) {
        this.outboxQueue.push(payload);
        return false;
      }
      return true;
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
        console.log(\`[StudyRoom-Debug] Host processing join from \${senderPeerJsId} (\${msg.nickname})\`);

        if (roomLocked) {
          const authFailMsg = { _mid: 'af_' + Date.now(), action: 'auth-fail', reason: 'Room is locked by host.' };
          if (senderConn && senderConn.open) senderConn.send(authFailMsg);
          if (this.peer && typeof this.peer.sendRelay === 'function') this.peer.sendRelay(senderPeerJsId, authFailMsg);
          return;
        }
        if (roomPassword && msg.password !== roomPassword) {
          const authFailMsg = { _mid: 'af_' + Date.now(), action: 'auth-fail', reason: 'Incorrect room password.' };
          if (senderConn && senderConn.open) senderConn.send(authFailMsg);
          if (this.peer && typeof this.peer.sendRelay === 'function') this.peer.sendRelay(senderPeerJsId, authFailMsg);
          return;
        }

        let newUserId = this.peerJsToUser.get(senderPeerJsId);
        const isNewUser = !newUserId;
        if (isNewUser) {
          newUserId = 'usr_' + (this.nextUserNum++);
          this.peerJsToUser.set(senderPeerJsId, newUserId);
          this.userToPeerJs.set(newUserId, senderPeerJsId);
        }

        // Build list of all existing peers for newcomer
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
        if (this.peer && typeof this.peer.sendRelay === 'function') {
          this.peer.sendRelay(senderPeerJsId, welcomeMsg);
          this.peer.sendRelay(senderPeerJsId, joinedMsg);
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

      // 1. Broadcast via DataConnections
      for (const [pId, conn] of this.connections.entries()) {
        const uId = this.peerJsToUser.get(pId);
        if (uId !== excludeUserId && conn.open) {
          try { conn.send(msgObj); } catch (e) {}
        }
      }

      // 2. Broadcast via WebSocket Signaling Relay
      if (this.peer && typeof this.peer.sendRelay === 'function') {
        for (const [uId, pId] of this.userToPeerJs.entries()) {
          if (uId !== excludeUserId && uId !== 'usr_host') {
            try { this.peer.sendRelay(pId, msgObj); } catch (e) {}
          }
        }
      }
    }`;

if (code.includes(oldSendTarget)) {
  code = code.replace(oldSendTarget, newSendTarget);
}

fs.writeFileSync(filePath, code, 'utf8');
console.log('Successfully updated studyRoom.js with Dual-Transport!');
