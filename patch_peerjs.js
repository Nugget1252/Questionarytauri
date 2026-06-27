const fs = require('fs');
let code = fs.readFileSync('src/js/studyRoom.js', 'utf8');

// Replace DEFAULT_RELAY_URL assignment or keep it as dummy
code = code.replace(/const DEFAULT_RELAY_URL = [^;]+;/, "const DEFAULT_RELAY_URL = 'peerjs';");

// Implement connectWebSocket to use PeerJSMock
const mockWSTemplate = `
  class PeerJSMockWS {
    constructor(url) {
      this.readyState = WebSocket.CONNECTING;
      this.onopen = null;
      this.onmessage = null;
      this.onclose = null;
      this.onerror = null;
      
      this.isHost = isHost;
      this.roomId = internetRoomId;
      this.password = roomPassword;
      this.nickname = nickname;
      
      this.peers = new Map(); // client connections
      this.mockServerState = { nextId: 1, clients: new Map() };
      
      this.initPeer();
    }
    
    initPeer() {
      const peerOptions = {
        config: {
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:global.stun.twilio.com:3478' }
          ]
        },
        debug: 1
      };
      
      if (this.isHost) {
        this.peer = new Peer('questionary-' + this.roomId, peerOptions);
        
        this.peer.on('open', (id) => {
          this.readyState = WebSocket.OPEN;
          if(this.onopen) this.onopen();
        });
        
        this.peer.on('connection', (conn) => {
          conn.on('data', (raw) => {
            const data = JSON.parse(raw);
            this.handleHostReceived(conn, data);
          });
          conn.on('close', () => {
            this.handleHostClientDrop(conn.peer);
          });
        });
        
        this.peer.on('error', (err) => {
          console.error('PeerJS Host Error:', err);
          if(this.onerror) this.onerror(err);
        });
      } else {
        this.peer = new Peer(peerOptions);
        this.peer.on('open', (id) => {
          this.hostConn = this.peer.connect('questionary-' + this.roomId);
          this.hostConn.on('open', () => {
             this.readyState = WebSocket.OPEN;
             if(this.onopen) this.onopen();
          });
          this.hostConn.on('data', (raw) => {
             const msg = JSON.parse(raw);
             if(this.onmessage) this.onmessage({ data: JSON.stringify(msg) });
          });
          this.hostConn.on('close', () => {
             if(this.onclose) this.onclose();
          });
          this.hostConn.on('error', (err) => {
             console.error('PeerJS Client Conn Error:', err);
             if(this.onerror) this.onerror(err);
          });
        });
        this.peer.on('error', (err) => {
          console.error('PeerJS Client Error:', err);
          if(this.onerror) this.onerror(err);
        });
      }
    }
    
    send(str) {
      if (!this.isHost) {
         if (this.hostConn && this.hostConn.open) this.hostConn.send(str);
         return;
      }
      
      // Host processing the message as if it were the server
      const msg = JSON.parse(str);
      const senderConn = { peer: 'host-self' }; // mock conn for host messages
      this.handleHostReceived(senderConn, msg);
    }
    
    close() {
      if (this.peer) this.peer.destroy();
      this.readyState = WebSocket.CLOSED;
      if(this.onclose) this.onclose();
    }
    
    // ----------- HOST REGION ONLY -----------
    handleHostReceived(conn, msg) {
       const state = this.mockServerState;
       
       const sendToClient = (targetPeerId, obj) => {
          if (targetPeerId === 'host-self') {
             if(this.onmessage) this.onmessage({ data: JSON.stringify(obj) });
             return;
          }
          if (this.peers.has(targetPeerId)) {
             this.peers.get(targetPeerId).send(JSON.stringify(obj));
          }
       };
       
       const broadcast = (obj, excludePeerId) => {
          const strMsg = JSON.stringify(obj);
          for (const [pId, pConn] of this.peers.entries()) {
             if (pId !== excludePeerId) pConn.send(strMsg);
          }
          if (excludePeerId !== 'host-self') {
             if(this.onmessage) this.onmessage({ data: strMsg });
          }
       };
       
       switch(msg.action) {
          case 'host':
             const hostId = "user_" + state.nextId++;
             state.clients.set('host-self', { id: hostId, nickname: msg.nickname });
             sendToClient('host-self', { action: 'welcome', id: hostId });
             sendToClient('host-self', { action: 'hosted' });
             break;
          case 'join':
             if (this.password && msg.password !== this.password) {
                 conn.send(JSON.stringify({ action: 'auth-fail', reason: 'Incorrect password.' }));
                 setTimeout(() => conn.close(), 500);
                 return;
             }
             this.peers.set(conn.peer, conn);
             const clientId = "user_" + state.nextId++;
             state.clients.set(conn.peer, { id: clientId, nickname: msg.nickname });
             
             sendToClient(conn.peer, { action: 'welcome', id: clientId });
             
             const peerList = Array.from(state.clients.values()).filter(c => c.id !== clientId);
             sendToClient(conn.peer, { action: 'joined', peers: peerList });
             
             broadcast({ action: 'peer-joined', id: clientId, nickname: msg.nickname }, conn.peer);
             break;
          case 'relay':
             // find sender id
             const sender = state.clients.get(conn.peer);
             if(!sender) return;
             broadcast({ action: 'relay', from: sender.id, data: msg.data }, conn.peer);
             break;
          case 'dm':
             const dmSender = state.clients.get(conn.peer);
             if(!dmSender) return;
             // find target conn
             let targetConnPeer = null;
             for (const [pId, cl] of state.clients.entries()) {
                if (cl.id === msg.to) { targetConnPeer = pId; break; }
             }
             if (targetConnPeer) {
                sendToClient(targetConnPeer, { action: 'dm', from: dmSender.id, data: msg.data });
             }
             break;
       }
    }
    
    handleHostClientDrop(peerId) {
       this.peers.delete(peerId);
       const client = this.mockServerState.clients.get(peerId);
       if (client) {
          this.mockServerState.clients.delete(peerId);
          // broadcast peer-left
          const strMsg = JSON.stringify({ action: 'peer-left', id: client.id });
          for (const pConn of this.peers.values()) {
             pConn.send(strMsg);
          }
          if(this.onmessage) this.onmessage({ data: strMsg });
       }
    }
  }

  function connectWebSocket(address) {
    return new Promise((resolve, reject) => {
      try {
        ws = new PeerJSMockWS(address);
      } catch (e) {
        return reject(new Error('PeerJS initialization failed: ' + e.message));
      }
      const timeout = setTimeout(() => {
        reject(new Error('PeerJS Connection timed out. Ensure the host is connected.'));
        try { ws.close(); } catch (_) {}
      }, 15000); // Wait 15s for PeerJS server

      ws.onopen = () => { clearTimeout(timeout); resolve(); };
      ws.onerror = (err) => { clearTimeout(timeout); reject(new Error('PeerJS connection failed: ' + (err.message || ''))); };
      ws.onclose = () => { clearTimeout(timeout); handleDisconnect(); };
      ws.onmessage = (event) => {
        try { handleServerMessage(JSON.parse(event.data)); }
        catch (e) { console.warn('[StudyRoom] bad frame', e); }
      };
    });
  }
`

code = code.replace(/function connectWebSocket[\s\S]+?\}\n\s*\}\n/m, mockWSTemplate);

fs.writeFileSync('src/js/studyRoom.js', code);
console.log('Patched studyRoom.js to use PeerJS mock WS');
